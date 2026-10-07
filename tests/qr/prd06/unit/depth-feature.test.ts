/**
 * PRD-06 T0.13 — `prd06.deform` depth/velocity variant feature + the
 * `prd06SkinnedBounds` C-11 provider.
 *
 * The feature registers through `registerDepthVariantFeature` under
 * `A3D_QR_ANIMATION_SKINNED_SHADOWS` (lane barrel gates registration on the
 * flag; the registry's `active(flags)` gates it a second time). Asserted here:
 * the feature is in the C-11 registry (duplicate-registration throw), a
 * fake `resolveShadowCasterVariant`-style resolver sees
 * `features["prd06.deform"]`, `bindUniforms` binds the cache's textures on
 * 65- and 191-joint items and allocates nothing on repeat binds, and the
 * provider returns world-space bounds for skinned items only.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Geometry } from "../../../../packages/rendering/src/Geometry.js";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem.js";
import type { UniformValue } from "../../../../packages/rendering/src/RenderDevice.js";
import { registerDepthVariantFeature, skinnedWorldBounds } from "../../../../packages/rendering/src/contracts/shadows.js";
import type { SkinningPaletteBinding } from "../../../../packages/rendering/src/ForwardPass.js";
import { SkinningPaletteTextureCache } from "../../../../packages/rendering/src/SkinningPaletteTextureCache.js";
import { createPrd06DeformDepthFeature, registerPrd06DeformDepthFeature } from "../../../../packages/rendering/src/shaders/deform/depthFeature.js";
import { prd06SkinnedBounds } from "../../../../packages/rendering/src/renderer/SkinnedBounds.js";
import { TextureBinding } from "../../../../packages/rendering/src/TextureBinding.js";

function identityPalette(jointCount: number): Float32Array {
  const matrices = new Float32Array(jointCount * 16);
  for (let joint = 0; joint < jointCount; joint += 1) {
    matrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], joint * 16);
  }
  return matrices;
}

function skinnedItem(jointCount: number): RenderItem {
  const skinning = {
    jointCount,
    matrices: identityPalette(jointCount),
    paletteKey: { jointCount }
  } as unknown as SkinningPaletteBinding;
  return { geometry: { bounds: { min: [0, 0, 0], max: [0, 0, 0] } } as unknown as Geometry, skinning };
}

describe("prd06 deform depth variant feature (T0.13)", () => {
  const disposers: Array<() => void> = [];
  afterEach(() => {
    while (disposers.length > 0) disposers.pop()!();
    vi.restoreAllMocks();
  });

  it("registers into the C-11 depth-variant registry", () => {
    const cache = new SkinningPaletteTextureCache();
    disposers.push(registerPrd06DeformDepthFeature(cache));
    // A second registration of the same id must hit the registry's duplicate
    // guard — proof the first registration landed.
    expect(() =>
      registerDepthVariantFeature(createPrd06DeformDepthFeature(cache))
    ).toThrowError(/REGISTRY_DUPLICATE:prd06\.deform/);
  });

  it("surfaces features['prd06.deform'] to a fake resolveShadowCasterVariant and emits A3D_DEPTH_ONLY for depth/distance", () => {
    const cache = new SkinningPaletteTextureCache();
    const feature = createPrd06DeformDepthFeature(cache);
    const fakeResolver = (pass: "depth" | "distance" | "velocity") => {
      const value = feature.select({ item: skinnedItem(65), pass, tier: {} as never, flags: { values: {}, on: () => true } });
      return { skinning: 4, features: value === undefined ? {} : { [feature.id]: value }, defines: value === undefined ? {} : feature.defines(value) };
    };
    expect(fakeResolver("depth")).toEqual({
      skinning: 4,
      features: { "prd06.deform": "depth" },
      defines: { A3D_DEPTH_ONLY: true }
    });
    expect(fakeResolver("distance").defines).toEqual({ A3D_DEPTH_ONLY: true });
    expect(fakeResolver("velocity").features).toEqual({ "prd06.deform": "velocity" });
    expect(fakeResolver("velocity").defines).toEqual({});
    // Non-skinned items never select the feature.
    expect(feature.select({ item: {} as RenderItem, pass: "depth", tier: {} as never, flags: { values: {}, on: () => true } })).toBeUndefined();
  });

  it("bindUniforms binds the cache's texture pair on 65- and 191-joint items and allocates nothing on repeat binds", () => {
    const cache = new SkinningPaletteTextureCache();
    const feature = createPrd06DeformDepthFeature(cache);
    for (const jointCount of [65, 191]) {
      const item = skinnedItem(jointCount);
      const bound = new Map<string, UniformValue>();
      const set = (name: string, value: UniformValue) => {
        bound.set(name, value);
      };
      feature.bindUniforms!("depth", item, set);
      const boneTexture = bound.get("u_boneTexture");
      const prevBoneTexture = bound.get("u_prevBoneTexture");
      expect(boneTexture).toBeInstanceOf(TextureBinding);
      expect(prevBoneTexture).toBeInstanceOf(TextureBinding);
      expect(boneTexture).not.toBe(prevBoneTexture);
      expect(bound.get("u_boneTextureWidth")).toBeGreaterThan(0);
      const createdAfterFirstBind = cache.diagnostics().createdThisFrame;

      // Second bind on the same item: identical bindings, zero new textures,
      // zero new allocation (bindings are cached per texture in the palette entry).
      const again = new Map<string, UniformValue>();
      feature.bindUniforms!("depth", item, (name, value) => {
        again.set(name, value);
      });
      expect(again.get("u_boneTexture")).toBe(boneTexture);
      expect(again.get("u_prevBoneTexture")).toBe(prevBoneTexture);
      expect(cache.diagnostics().createdThisFrame).toBe(createdAfterFirstBind);
    }
  });

  it("bindUniforms does nothing for items without a stamped palette key", () => {
    const cache = new SkinningPaletteTextureCache();
    const feature = createPrd06DeformDepthFeature(cache);
    const unstamped = { geometry: {} as Geometry, skinning: { jointCount: 4, matrices: identityPalette(4) } as SkinningPaletteBinding } as RenderItem;
    const bound = new Map<string, UniformValue>();
    feature.bindUniforms!("depth", unstamped, (name, value) => {
      bound.set(name, value);
    });
    expect(bound.size).toBe(0);
    expect(cache.diagnostics().textures).toBe(0);
  });
});

describe("prd06SkinnedBounds provider (T0.13)", () => {
  it("returns the skinned world-space AABB transformed by modelMatrix", () => {
    // One vertex at (1,2,3) driven by an identity joint → local bounds are the
    // point itself; a +10x model matrix yields world (11,2,3).
    const geometry = {
      bounds: { min: [0, 0, 0], max: [0, 0, 0] },
      vertexBuffer: {
        vertexCount: 1,
        format: { hasAttribute: () => true },
        getAttribute: (_vertex: number, name: string) =>
          name === "position" ? [1, 2, 3] : name === "joints" ? [0, 0, 0, 0] : [1, 0, 0, 0]
      }
    } as unknown as Geometry;
    const modelMatrix = new Float32Array(16);
    modelMatrix.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1]);
    const item: RenderItem = {
      geometry,
      modelMatrix,
      skinning: { jointCount: 1, matrices: identityPalette(1) } as SkinningPaletteBinding
    };
    const bounds = prd06SkinnedBounds.worldBounds(item);
    expect(bounds).not.toBeNull();
    expect(Array.from(bounds!)).toEqual([11, 2, 3, 11, 2, 3]);
  });

  it("declines non-skinned items and feeds skinnedWorldBounds", () => {
    expect(prd06SkinnedBounds.worldBounds({ geometry: {} as Geometry } as RenderItem)).toBeNull();
    // The provider registry dispatches to the first able provider; a skinned
    // item is answerable, an unskinned one is not (no other providers are
    // registered in this test process).
    expect(skinnedWorldBounds({ geometry: {} as Geometry } as RenderItem)).toBeNull();
  });
});
