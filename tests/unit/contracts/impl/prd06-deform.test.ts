/**
 * PRD-06 impl evidence (C-18 real) — the lane barrel provides the deformation
 * resources slot: `deformResources.get(flags)` returns the stub while
 * `A3D_QR_ANIMATION` is off and the real implementations once on. The real
 * palette cache conforms to `SkinningPaletteTextureCacheLike` and the real
 * `buildMorphTargetTexture` produces a `sampler2DArray`-ready Texture per §8.2.
 */

import { describe, expect, it } from "vitest";
import type { QrFlags, QrFlagName, QrFlagValue } from "@aura3d/rendering/contracts";
import { deformResources, skinningPaletteCache } from "../../../../packages/rendering/src/lanes/prd06";
import { buildMorphTargetTexture } from "../../../../packages/rendering/src/resources/MorphTargetTexture";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";
import { IndexBuffer } from "../../../../packages/rendering/src/IndexBuffer";
import type { MorphTargetDelta } from "../../../../packages/rendering/src/MorphTarget";
import type { RenderDevice } from "../../../../packages/rendering/src/RenderDevice";

function flags(on: boolean): QrFlags {
  const values: Readonly<Partial<Record<QrFlagName, QrFlagValue>>> = { A3D_QR_ANIMATION: on };
  return {
    values,
    on(name: QrFlagName): boolean {
      const v = values[name];
      return v !== undefined && v !== false && v !== "0" && v !== "off" && v !== "";
    }
  };
}

describe("C-18 deformResources slot", () => {
  it("flag off returns the stub; flag on returns the provided real impl", () => {
    const stub = deformResources.get(flags(false));
    expect(stub.buildMorphTargetTexture(undefined as never, [], { maxTextureSize: 0, maxArrayLayers: 0 })).toEqual({
      fallback: "cpu",
      reason: "PRD06_PENDING"
    });
    expect(() => stub.skinningPalettes.acquire({} as RenderDevice, {}, 4)).toThrow(/PRD06_PENDING/);
    const real = deformResources.get(flags(true));
    expect(real.skinningPalettes).toBe(skinningPaletteCache);
    expect(real.buildMorphTargetTexture).toBe(buildMorphTargetTexture);
    expect(deformResources.provided).toBe(true);
  });

  it("the real cache satisfies SkinningPaletteTextureCacheLike end-to-end", () => {
    const real = deformResources.get(flags(true)).skinningPalettes;
    const key = {};
    const pair = real.acquire({} as RenderDevice, key, 97);
    expect(pair.current.width).toBeGreaterThan(0);
    expect(pair.previous.width).toBe(pair.current.width);
    const diag = real.diagnostics();
    expect(diag.createdThisFrame).toBeGreaterThanOrEqual(0);
    real.upload(key, new Float32Array(97 * 16));
    real.swap(key);
    real.release(key);
    expect(pair.current.disposed).toBe(true);
  });
});

describe("buildMorphTargetTexture (C-18 real)", () => {
  function geometry(vertexCount: number): Geometry {
    const vertices = new VertexBuffer(VertexFormat.P3N3T4T2, vertexCount);
    const indices = new IndexBuffer([0, 1, 2], vertexCount);
    return new Geometry(vertices, indices);
  }

  function delta(v: number): MorphTargetDelta {
    return { positions: [[v, 0, 0]] as unknown as MorphTargetDelta["positions"] };
  }

  it("packs targets into a 2d-array texture bucketed into {4,8,16,32}", () => {
    const result = buildMorphTargetTexture(geometry(64), [delta(1), delta(2), delta(3)], { maxTextureSize: 4096, maxArrayLayers: 2048 });
    expect("texture" in result).toBe(true);
    if (!("texture" in result)) return;
    expect(result.bucket).toBe(4);
    expect(result.texture.dimension).toBe("2d-array");
    expect(result.texture.layers).toBe(4);
    expect(result.hasNormals).toBe(false);
    expect(result.stride).toBe(1);
    expect(result.targetCount).toBe(3);
  });

  it("emits normals/tangent layers when present and honours rgba32f data", () => {
    const targets: MorphTargetDelta[] = [
      { positions: [[1, 0, 0]], normals: [[0, 1, 0]], tangents: [[0, 0, 1]] } as MorphTargetDelta
    ];
    const result = buildMorphTargetTexture(geometry(8), targets, { maxTextureSize: 4096, maxArrayLayers: 2048 }, "rgba32f");
    if (!("texture" in result)) throw new Error(`expected texture result, got ${JSON.stringify(result)}`);
    expect(result.stride).toBe(3);
    expect(result.hasNormals).toBe(true);
    expect(result.hasTangents).toBe(true);
    expect(result.stride).toBe(3);
    expect(result.texture.data).toBeInstanceOf(Float32Array);
  });

  it("falls back to cpu when the limits cannot hold the set", () => {
    const result = buildMorphTargetTexture(geometry(1_000_000), [delta(1)], { maxTextureSize: 4096, maxArrayLayers: 2048 });
    expect(result).toMatchObject({ fallback: "cpu" });
  });
});
