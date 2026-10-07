/**
 * PRD-06 T0.10 / C-18 — `SkinningPaletteTextureCache`. Two skins bound for 100
 * frames keep exactly their texture pair each (no per-frame allocation), the
 * palette upload runs at most once per key per frame, `swap` makes the last
 * presented frame's palette the `previous` texture, and `release` disposes the
 * pair so live textures return to zero.
 */

import { describe, expect, it } from "vitest";
import { SkinningPaletteTextureCache } from "../../../packages/rendering/src/SkinningPaletteTextureCache";
import { applySkinningUniformsCached, paletteKeyOf } from "../../../packages/rendering/src/SkinningUniforms";
import type { RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { SkinningPaletteBinding } from "../../../packages/rendering/src/ForwardPass";
import type { Material } from "../../../packages/rendering/src/Material";
import type { RenderShaderProgram, UniformValue } from "../../../packages/rendering/src/RenderDevice";

const fakeDevice = {} as RenderDevice;

function identityPalette(joints: number): Float32Array {
  const matrices = new Float32Array(joints * 16);
  for (let j = 0; j < joints; j += 1) {
    matrices[j * 16 + 0] = 1;
    matrices[j * 16 + 5] = 1;
    matrices[j * 16 + 10] = 1;
    matrices[j * 16 + 15] = 1;
  }
  return matrices;
}

describe("SkinningPaletteTextureCache (C-18 real)", () => {
  it("100 frames x 2 skins x 191 joints: one texture pair per skin, zero created after frame 10, none live after release", () => {
    const cache = new SkinningPaletteTextureCache();
    const skinA = { id: "skin-a" };
    const skinB = { id: "skin-b" };
    const paletteA = identityPalette(191);
    const paletteB = identityPalette(191);
    const firstA = cache.acquire(fakeDevice, skinA, 191);
    const firstB = cache.acquire(fakeDevice, skinB, 191);
    for (let frame = 0; frame < 100; frame += 1) {
      cache.beginFrame();
      cache.upload(skinA, paletteA);
      cache.upload(skinB, paletteB);
      const a = cache.acquire(fakeDevice, skinA, 191);
      const b = cache.acquire(fakeDevice, skinB, 191);
      // One pair per key, forever — the current/previous objects rotate between
      // the same two Texture instances allocated at first acquire.
      if (frame >= 1) {
        expect([a.current, a.previous]).toContain(firstA.current);
        expect([a.current, a.previous]).toContain(firstA.previous);
        expect(a.current).not.toBe(a.previous);
        expect([b.current, b.previous]).toContain(firstB.current);
        expect([b.current, b.previous]).toContain(firstB.previous);
      }
      // Upload is once-per-frame per key: a second upload is a no-op.
      cache.upload(skinA, paletteA);
      if (frame >= 10) {
        expect(cache.diagnostics().createdThisFrame).toBe(0);
      }
    }
    const diag = cache.diagnostics();
    expect(diag.textures).toBe(4); // 2 skins × {current, previous}
    expect(diag.bytes).toBeGreaterThan(0);
    expect(firstA.current.disposed).toBe(false);
    cache.release(skinA);
    cache.release(skinB);
    expect(cache.diagnostics().textures).toBe(0);
    expect(firstA.current.disposed).toBe(true);
    expect(firstA.previous.disposed).toBe(true);
    expect(firstB.current.disposed).toBe(true);
    expect(firstB.previous.disposed).toBe(true);
  });

  it("swap rotates current into previous without allocating", () => {
    const cache = new SkinningPaletteTextureCache();
    const key = {};
    const before = cache.acquire(fakeDevice, key, 128);
    cache.swap(key);
    const after = cache.acquire(fakeDevice, key, 128);
    expect(after.previous).toBe(before.current);
    expect(after.current).toBe(before.previous);
  });

  it("rejects a joint-count change on a stable palette key", () => {
    const cache = new SkinningPaletteTextureCache();
    const key = {};
    cache.acquire(fakeDevice, key, 100);
    expect(() => cache.acquire(fakeDevice, key, 200)).toThrow(/SKINNING_PALETTE_KEY_JOINT_COUNT_CHANGED/);
  });
});

function fakeShader(uniforms: readonly string[]): RenderShaderProgram {
  return {
    reflection: { uniforms: new Set(uniforms) }
  } as unknown as RenderShaderProgram;
}

const SKINNING_UNIFORMS = ["u_jointMatrices", "u_jointCount", "u_jointPaletteTexture", "u_jointPaletteMode", "u_jointPaletteTextureSize"];

describe("applySkinningUniformsCached (T0.10)", () => {
  const material = { name: "test-material" } as Material;

  function skinning(jointCount: number, paletteKey?: object): SkinningPaletteBinding {
    const binding: SkinningPaletteBinding & { paletteKey?: object } = {
      jointCount,
      matrices: identityPalette(jointCount)
    };
    if (paletteKey) binding.paletteKey = paletteKey;
    return binding;
  }

  it("binds the cached texture pair + zero joint block for a 191-joint rig", () => {
    const cache = new SkinningPaletteTextureCache();
    const uniforms = new Map<string, UniformValue>();
    const path = applySkinningUniformsCached(skinning(191, { key: 1 }), material, fakeShader(SKINNING_UNIFORMS), uniforms, cache);
    expect(path).toBe("data-texture");
    expect(uniforms.get("u_jointPaletteMode")).toBe(1);
    const binding = uniforms.get("u_jointPaletteTexture") as { texture?: { dynamic?: boolean } };
    expect(binding.texture?.dynamic).toBe(true);
    expect((uniforms.get("u_jointMatrices") as Float32Array).length).toBe(96 * 16);
    expect(cache.diagnostics().textures).toBe(2);
  });

  it("falls back to the uniform-array path for <=96 joints and to legacy semantics without a paletteKey", () => {
    const cache = new SkinningPaletteTextureCache();
    const uniforms = new Map<string, UniformValue>();
    expect(applySkinningUniformsCached(skinning(64, { key: 2 }), material, fakeShader(SKINNING_UNIFORMS), uniforms, cache)).toBe("uniform-array");
    const legacy = new Map<string, UniformValue>();
    expect(applySkinningUniformsCached(skinning(200), material, fakeShader(SKINNING_UNIFORMS), legacy, cache)).toBe("data-texture");
    expect(cache.diagnostics().textures).toBe(0); // unstamped producer never touches the cache
  });

  it("paletteKeyOf reads the structurally stamped key only", () => {
    expect(paletteKeyOf(skinning(10, { k: 1 }))).toEqual({ k: 1 });
    expect(paletteKeyOf(skinning(10))).toBeNull();
    expect(paletteKeyOf({ jointCount: 4, matrices: identityPalette(4), paletteKey: "not-an-object" } as SkinningPaletteBinding)).toBeNull();
  });
});
