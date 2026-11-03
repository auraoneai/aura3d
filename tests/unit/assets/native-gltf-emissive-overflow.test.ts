import { afterEach, describe, expect, it, vi } from "vitest";
import { GLTFLoader, LoadContext } from "@aura3d/assets";

async function loadMaterial(emissiveFactor: readonly unknown[], emissiveStrength: number) {
  const json = {
    asset: { version: "2.0" },
    materials: [{
      emissiveFactor,
      extensions: { KHR_materials_emissive_strength: { emissiveStrength } }
    }]
  };
  const url = `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(json)).toString("base64")}`;
  const asset = await new GLTFLoader().load({ url }, new LoadContext());
  return asset.materials[0]!;
}

describe("glTF emissive repair overflow", () => {
  afterEach(() => vi.restoreAllMocks());

  it("preserves an ordinary finite HDR repair and warns about the fold", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const material = await loadMaterial([1.75, 0.7, 0], 2);
    expect(material.emissiveFactor[0]).toBe(1);
    expect(material.emissiveFactor[1]).toBeCloseTo(0.4);
    expect(material.emissiveFactor[2]).toBe(0);
    expect(material.emissiveStrength).toBe(3.5);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("folded 1.75 into emissiveStrength"));
  });

  it("accepts a folded strength at the finite number limit", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const material = await loadMaterial([2, 1, 0], Number.MAX_VALUE / 2);
    expect(material.emissiveFactor).toEqual([1, 0.5, 0]);
    expect(material.emissiveStrength).toBe(Number.MAX_VALUE);
    expect(Number.isFinite(material.emissiveStrength)).toBe(true);
  });

  it("keeps a zero strength finite for an extremely large factor", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const material = await loadMaterial([Number.MAX_VALUE, 0, 0], 0);
    expect(material.emissiveFactor).toEqual([1, 0, 0]);
    expect(material.emissiveStrength).toBe(0);
  });

  it("rejects a folded strength that would overflow with an actionable error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(loadMaterial([2, 1, 0], Number.MAX_VALUE)).rejects.toThrow(
      /material 0 emissiveFactor.*KHR_materials_emissive_strength\.emissiveStrength.*finite number range.*reduce either value/
    );
    await expect(loadMaterial([2, 1, 0], Number.MAX_VALUE)).rejects.toBeInstanceOf(RangeError);
  });

  it("continues to repair invalid factors and strengths", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const material = await loadMaterial([null, 0.5, -1], -2);
    expect(material.emissiveFactor).toEqual([0, 0.5, 0]);
    expect(material.emissiveStrength).toBe(1);
  });
});
