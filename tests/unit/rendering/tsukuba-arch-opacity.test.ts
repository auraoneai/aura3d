import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderStateForGLTFMaterial } from "@aura3d/assets";

/**
 * WS-5.1: the reported translucent DUNLOP arch on the Turbo Drift circuit.
 *
 * This test exists to stop the wrong explanation being adopted again. I hypothesised twice that
 * this was a defect — first in the asset's `alphaMode`, then in the engine dropping it — and both
 * were wrong. The alpha path is correct end to end, and this locks that down so a future change
 * cannot quietly reintroduce the ghosting defect that `isEffectivelyOpaqueBlendMaterial` guards
 * against.
 *
 * Reads the real committed GLB rather than a fixture, because the whole question is what *this*
 * asset declares.
 */
const GLB = "public/aura-assets/showcaseTsukubaCircuit.8c139a57.glb";

interface GltfMaterial {
  readonly name?: string;
  readonly alphaMode?: "OPAQUE" | "MASK" | "BLEND";
  readonly alphaCutoff?: number;
  readonly doubleSided?: boolean;
  readonly pbrMetallicRoughness?: {
    readonly baseColorFactor?: readonly number[];
    readonly baseColorTexture?: { readonly index: number };
  };
}

/** Minimal GLB JSON-chunk reader. The full loader is async and needs a fetch stack. */
function readGlbMaterials(path: string): readonly GltfMaterial[] {
  const buffer = readFileSync(path);
  expect(buffer.readUInt32LE(0), "not a GLB").toBe(0x46546c67);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8")) as {
    readonly materials?: readonly GltfMaterial[];
  };
  return json.materials ?? [];
}

/** Shape the loader produces, with the spec defaults it applies. */
function asLoadedMaterial(material: GltfMaterial) {
  const factor = material.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
  return {
    name: material.name ?? "unnamed",
    alphaMode: material.alphaMode ?? "OPAQUE",
    // GLTFLoader.ts:1778 applies the glTF default of 0.5. It matters here: every MASK material in
    // this asset omits alphaCutoff, so a loader that defaulted it to 0 would discard nothing.
    alphaCutoff: material.alphaCutoff ?? 0.5,
    doubleSided: material.doubleSided ?? false,
    baseColorFactor: [factor[0] ?? 1, factor[1] ?? 1, factor[2] ?? 1, factor[3] ?? 1] as const,
    metallicFactor: 1,
    roughnessFactor: 1,
    ...(material.pbrMetallicRoughness?.baseColorTexture ? { baseColorTexture: { texture: 0 } } : {})
  };
}

describe("Tsukuba circuit arch opacity", () => {
  const materials = readGlbMaterials(GLB);

  it("the asset declares no blended materials at all", () => {
    expect(materials.length).toBeGreaterThan(0);
    const blended = materials.filter((material) => material.alphaMode === "BLEND");
    // If this ever becomes non-empty, the asset changed and the analysis below must be redone.
    expect(blended.map((material) => material.name)).toEqual([]);
  });

  it("no material carries a base-colour alpha below 1", () => {
    for (const material of materials) {
      const alpha = material.pbrMetallicRoughness?.baseColorFactor?.[3];
      if (alpha !== undefined) expect(alpha, `${material.name} alpha`).toBeGreaterThanOrEqual(1);
    }
  });

  it("every material resolves to opaque render state with depth writes on", () => {
    // The load-bearing assertion. Translucency requires blend on or depthWrite off; neither
    // happens for any material in this asset, so blending cannot be the cause.
    for (const material of materials) {
      const state = renderStateForGLTFMaterial(asLoadedMaterial(material) as never);
      expect(state.blend, `${material.name} must not blend`).toBe(false);
      expect(state.depthWrite, `${material.name} must write depth`).toBe(true);
    }
  });

  it("masked foliage keeps a usable alpha cutoff after loader defaults", () => {
    const masked = materials.filter((material) => material.alphaMode === "MASK");
    expect(masked.length).toBeGreaterThan(0);
    for (const material of masked) {
      // All of them omit alphaCutoff in the asset; the loader's 0.5 default is what makes
      // alpha-testing actually discard texels.
      expect(material.alphaCutoff).toBeUndefined();
      expect(asLoadedMaterial(material).alphaCutoff).toBe(0.5);
    }
  });

  it("the see-through appearance comes from doubleSided authoring, not from alpha", () => {
    /*
     * The actual finding. Every material in this asset sets `doubleSided: true`, so the render
     * state resolves `cullMode: "none"` and interior faces draw through front faces. That reads
     * as translucency with blending fully disabled, and it is the only mechanism left in this path
     * once blend and depthWrite are ruled out above.
     */
    const doubleSided = materials.filter((material) => material.doubleSided === true);
    expect(doubleSided.length).toBe(materials.length);
    for (const material of materials) {
      expect(renderStateForGLTFMaterial(asLoadedMaterial(material) as never).cullMode).toBe("none");
    }
  });

  it("a render-state override can force backface culling without touching the asset", () => {
    // The supported remedy: opt in per material rather than overriding every asset's own
    // doubleSided flag, which would break legitimately single-sided meshes.
    const arch = asLoadedMaterial(materials[0]!);
    const overridden = renderStateForGLTFMaterial(arch as never, [
      { materialName: arch.name, renderState: { cullMode: "back" }, reason: "WS-5.1 arch opacity" }
    ]);
    expect(overridden.cullMode).toBe("back");
    expect(overridden.blend).toBe(false);
    expect(overridden.depthWrite).toBe(true);
  });
});
