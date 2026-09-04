import { describe, expect, test } from "vitest";
import {
  compositeMetallicRoughnessPixels,
  createProductionPrimitiveTextureIntent,
  defineAuraAssets
} from "@aura3d/engine";

const textures = defineAuraAssets({
  checker: { type: "texture", format: "png", url: "/tests/browser/fixtures/c1-checker.png", hash: "99496e5e0a5e216a" },
  rough: { type: "texture", format: "png", url: "/tests/browser/fixtures/c1-rough.png", hash: "c027b3ed2eda3e09" },
  occlusion: { type: "texture", format: "png", url: "/tests/browser/fixtures/c1-occlusion.png", hash: "c1occlusion00000000" },
  emissive: { type: "texture", format: "png", url: "/tests/browser/fixtures/c1-emissive.png", hash: "c1emissive00000000" }
});

/** muse3jsparity-PRD C1: texture intent classification and channel compositing. */
describe("root textured C1 pipeline", () => {
  test("classifies asset refs to urls", () => {
    const intent = createProductionPrimitiveTextureIntent({
      color: "#ffffff",
      texture: textures.checker,
      roughnessMap: textures.rough
    });
    expect(intent.baseColorUrl).toBe("/tests/browser/fixtures/c1-checker.png");
    expect(intent.roughnessUrl).toBe("/tests/browser/fixtures/c1-rough.png");
    expect(intent.normalUrl).toBeUndefined();
    expect(intent.metalnessUrl).toBeUndefined();
    expect(intent.proceduralInputs).toEqual([]);
  });

  test("reports procedural inputs instead of resolving them", () => {
    const intent = createProductionPrimitiveTextureIntent({
      color: "#ffffff",
      normal: { kind: "aura-procedural-texture", texture: "fabric-normal", scale: 18, strength: 0.42 }
    });
    expect(intent.normalUrl).toBeUndefined();
    expect(intent.proceduralInputs).toEqual(["normal:fabric-normal"]);
  });

  test("empty specs yield no intent", () => {
    expect(createProductionPrimitiveTextureIntent(undefined)).toEqual({ proceduralInputs: [] });
    expect(createProductionPrimitiveTextureIntent({ color: "#ffffff" })).toEqual({ proceduralInputs: [] });
  });

  test("classifies occlusion and emissive map refs to urls", () => {
    const intent = createProductionPrimitiveTextureIntent({
      color: "#ffffff",
      occlusionMap: textures.occlusion,
      emissiveMap: textures.emissive
    });
    expect(intent.occlusionUrl).toBe("/tests/browser/fixtures/c1-occlusion.png");
    expect(intent.emissiveUrl).toBe("/tests/browser/fixtures/c1-emissive.png");
    expect(intent.baseColorUrl).toBeUndefined();
    expect(intent.proceduralInputs).toEqual([]);
  });

  test("reports procedural occlusion/emissive inputs instead of resolving them", () => {
    const intent = createProductionPrimitiveTextureIntent({
      color: "#ffffff",
      occlusionMap: { kind: "aura-procedural-texture", texture: "fabric-normal", scale: 8, strength: 0.3 },
      emissiveMap: { kind: "aura-procedural-texture", texture: "brushed-metal-anisotropy", scale: 8, strength: 0.3 }
    });
    expect(intent.occlusionUrl).toBeUndefined();
    expect(intent.emissiveUrl).toBeUndefined();
    expect(intent.proceduralInputs).toEqual(["occlusionMap:fabric-normal", "emissiveMap:brushed-metal-anisotropy"]);
  });

  test("composites metallic-roughness channels per glTF convention", () => {
    const rough = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]);
    const metal = new Uint8Array([70, 80, 90, 255, 100, 110, 120, 255]);
    const out = compositeMetallicRoughnessPixels(rough, metal, 2, 0.5, 0.25);
    // R forced to 255 (unused occlusion), G from rough, B from metal.
    expect(Array.from(out)).toEqual([255, 20, 90, 255, 255, 50, 120, 255]);
  });

  test("missing channels fall back to scalar spec values", () => {
    const out = compositeMetallicRoughnessPixels(undefined, undefined, 1, 0.5, 0.25);
    expect(Array.from(out)).toEqual([255, 128, 64, 255]);
    const rough = new Uint8Array([0, 200, 0, 255]);
    const partial = compositeMetallicRoughnessPixels(rough, undefined, 1, 0.5, 0.25);
    expect(Array.from(partial)).toEqual([255, 200, 64, 255]);
  });
});
