import { afterEach, describe, expect, it, vi } from "vitest";
import { GLTFLoader, LoadContext } from "@aura3d/assets";

// vault-breakers (L4, flags=all): `RangeError: glTF material 3 emissiveFactor
// must contain three finite values in [0, 1]` from HDR emissive factors such
// as [1.5, 0.3, 0]. The importer now repairs instead of throwing, like
// three.js GLTFLoader, and warns once per distinct repair.

function gltfDataUri(materials: readonly unknown[]): string {
  const json = { asset: { version: "2.0" }, materials };
  return `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(json)).toString("base64")}`;
}

async function loadMaterials(materials: readonly unknown[]) {
  const asset = await new GLTFLoader().load({ url: gltfDataUri(materials) }, new LoadContext());
  return asset.materials;
}

describe("glTF emissive tolerance", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("folds an HDR emissiveFactor into emissiveStrength without changing the emitted radiance", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const [material] = await loadMaterials([{ name: "slingshots", emissiveFactor: [1.5, 0.3, 0] }]);
    expect(material!.emissiveFactor[0]).toBeCloseTo(1);
    expect(material!.emissiveFactor[1]).toBeCloseTo(0.2);
    expect(material!.emissiveFactor[2]).toBe(0);
    expect(material!.emissiveStrength).toBeCloseTo(1.5);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("multiplies the fold into an authored KHR_materials_emissive_strength", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const [material] = await loadMaterials([
      { emissiveFactor: [0, 2, 2.5], extensions: { KHR_materials_emissive_strength: { emissiveStrength: 2 } } }
    ]);
    expect(material!.emissiveFactor).toEqual([0, 0.8, 1]);
    expect(material!.emissiveStrength).toBeCloseTo(5);
  });

  it("replaces non-finite, negative, or malformed values with defaults", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const materials = await loadMaterials([
      { emissiveFactor: [null, 0.5, -1] },
      { emissiveFactor: [1, 1] },
      { emissiveFactor: [0.2, 0.2, 0.2], extensions: { KHR_materials_emissive_strength: { emissiveStrength: -3 } } }
    ]);
    expect(materials[0]!.emissiveFactor).toEqual([0, 0.5, 0]);
    expect(materials[1]!.emissiveFactor).toEqual([0, 0, 0]);
    expect(materials[2]!.emissiveFactor).toEqual([0.2, 0.2, 0.2]);
    expect(materials[2]!.emissiveStrength).toBe(1);
  });

  it("warns once for a repeated repair and leaves in-range factors untouched", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = { emissiveFactor: [0, 0, 7.25] };
    await loadMaterials([bad]);
    await loadMaterials([bad]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockClear();
    const [clean] = await loadMaterials([{ emissiveFactor: [0.25, 0.5, 1] }]);
    expect(clean!.emissiveFactor).toEqual([0.25, 0.5, 1]);
    expect(clean!.emissiveStrength).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
