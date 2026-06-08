import { describe, expect, it } from "vitest";
import { renderStateForGLTFMaterial, type GLTFMaterialAsset } from "../../../packages/assets/src";

function createMaterial(overrides: Partial<GLTFMaterialAsset> = {}): GLTFMaterialAsset {
  return {
    name: "test-material",
    unlit: false,
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 1,
    roughnessFactor: 1,
    emissiveFactor: [0, 0, 0],
    emissiveStrength: 1,
    alphaMode: "OPAQUE",
    alphaCutoff: 0.5,
    doubleSided: false,
    ...overrides
  } as GLTFMaterialAsset;
}

describe("GLTF BLEND-but-opaque render state (ghost character fix)", () => {
  it("treats a fully opaque BLEND material as OPAQUE (no blend, depth writes on)", () => {
    const state = renderStateForGLTFMaterial(
      createMaterial({ alphaMode: "BLEND", baseColorFactor: [1, 1, 1, 1] })
    );

    expect(state.blend).toBe(false);
    expect(state.depthWrite).toBe(true);
  });

  it("keeps blending for a genuinely translucent BLEND material (alpha < 1)", () => {
    const state = renderStateForGLTFMaterial(
      createMaterial({ alphaMode: "BLEND", baseColorFactor: [1, 1, 1, 0.4] })
    );

    expect(state.blend).toBe(true);
    expect(state.depthWrite).toBe(false);
  });

  it("keeps blending when a BLEND material is nearly transparent at the epsilon boundary", () => {
    const state = renderStateForGLTFMaterial(
      createMaterial({ alphaMode: "BLEND", baseColorFactor: [1, 1, 1, 0.99] })
    );

    expect(state.blend).toBe(true);
  });

  it("still blends a BLEND material that carries transmission even when alpha is 1", () => {
    const state = renderStateForGLTFMaterial(
      createMaterial({
        alphaMode: "BLEND",
        baseColorFactor: [1, 1, 1, 1],
        transmission: { factor: 0.8 }
      })
    );

    expect(state.blend).toBe(true);
  });

  it("leaves MASK materials opaque (depth-tested cutout, never blended)", () => {
    const state = renderStateForGLTFMaterial(
      createMaterial({ alphaMode: "MASK", baseColorFactor: [1, 1, 1, 1], alphaCutoff: 0.5 })
    );

    expect(state.blend).toBe(false);
    expect(state.depthWrite).toBe(true);
  });

  it("leaves plain OPAQUE materials unchanged", () => {
    const state = renderStateForGLTFMaterial(createMaterial({ alphaMode: "OPAQUE" }));

    expect(state.blend).toBe(false);
    expect(state.depthWrite).toBe(true);
  });

  it("honors an explicit render-state override that forces blend back on for a flattened BLEND material", () => {
    const state = renderStateForGLTFMaterial(
      createMaterial({ name: "Glass", alphaMode: "BLEND", baseColorFactor: [1, 1, 1, 1] }),
      [{ materialName: "Glass", renderState: { blend: true, depthWrite: false } }]
    );

    expect(state.blend).toBe(true);
    expect(state.depthWrite).toBe(false);
  });
});
