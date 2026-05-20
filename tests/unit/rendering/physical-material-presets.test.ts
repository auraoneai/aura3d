import { describe, expect, it } from "vitest";
import {
  MaterialPresetRegistry,
  PBRMaterial,
  createPhysicalMaterialPreset,
  listPhysicalMaterialPresets,
  physicalMaterialPresetDescriptor,
  type PhysicalMaterialPresetName
} from "../../../packages/rendering/src/index.js";

describe("old-branch physical material preset port", () => {
  it("exposes the old material preset surface through current PBR materials", () => {
    const names = listPhysicalMaterialPresets().map((preset) => preset.name);
    expect(names).toEqual([
      "gold",
      "silver",
      "copper",
      "iron",
      "aluminum",
      "plastic",
      "rubber",
      "wood",
      "concrete",
      "fabric",
      "glass",
      "water",
      "skin",
      "eye",
      "hair",
      "terrain",
      "toon"
    ]);

    for (const name of names as PhysicalMaterialPresetName[]) {
      const descriptor = physicalMaterialPresetDescriptor(name);
      const material = createPhysicalMaterialPreset(name);
      expect(descriptor.source).toBe("old-branch-material-presets");
      expect(descriptor.knownLimits.length).toBeGreaterThan(0);
      expect(material).toBeInstanceOf(PBRMaterial);
      expect(material.name).toBe(`physical-${name}`);
      expect(material.baseColor.length).toBe(4);
      expect(material.baseColor.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1)).toBe(true);
      expect(material.roughness).toBeGreaterThanOrEqual(0);
      expect(material.roughness).toBeLessThanOrEqual(1);
    }
  });

  it("maps special old materials onto bounded current PBR lobes", () => {
    const fabric = createPhysicalMaterialPreset("fabric");
    expect(fabric.getParameter("u_sheenRoughnessFactor")).toBeGreaterThan(0);
    expect(fabric.getParameter("u_sheenColorFactor")).toEqual([0.42, 0.28, 0.22]);

    const glass = createPhysicalMaterialPreset("glass");
    expect(glass.getParameter("u_transmissionFactor")).toBe(1);
    expect(glass.getParameter("u_ior")).toBe(1.5);
    expect(glass.renderState.blend).toBe(true);
    expect(glass.renderState.depthWrite).toBe(false);

    const water = createPhysicalMaterialPreset("water");
    expect(water.getParameter("u_ior")).toBe(1.333);
    expect(water.getParameter("u_volumeAttenuationColor")).toEqual([0.1, 0.45, 0.72]);

    const skin = createPhysicalMaterialPreset("skin");
    expect(skin.getParameter("u_diffuseTransmissionFactor")).toBeGreaterThan(0);
    expect(skin.getParameter("u_diffuseTransmissionColorFactor")).toEqual([1, 0.5, 0.3]);

    const eye = createPhysicalMaterialPreset("eye");
    expect(eye.getParameter("u_diffuseTransmissionFactor")).toBeGreaterThan(0);
    expect(eye.getParameter("u_clearcoatFactor")).toBeGreaterThan(0);
    expect(eye.getParameter("u_clearcoatRoughnessFactor")).toBeLessThan(0.1);

    const hair = createPhysicalMaterialPreset("hair");
    expect(hair.getParameter("u_anisotropyStrength")).toBeGreaterThan(0);
    expect(hair.getParameter("u_sheenColorFactor")).toEqual([0.5, 0.34, 0.18]);

    const terrain = createPhysicalMaterialPreset("terrain");
    expect(terrain.getParameter("u_roughness")).toBeGreaterThan(0.8);
    expect(terrain.getParameter("u_sheenRoughnessFactor")).toBeGreaterThan(0.5);

    const toon = createPhysicalMaterialPreset("toon");
    expect(toon.getParameter("u_clearcoatFactor")).toBeGreaterThan(0);
    expect(toon.getParameter("u_emissiveStrength")).toBeGreaterThan(0);
  });

  it("registers physical presets with the existing material preset registry", () => {
    const registry = new MaterialPresetRegistry();
    expect(registry.has("physical:gold")).toBe(true);
    expect(registry.has("physical:eye")).toBe(true);
    expect(registry.has("physical:hair")).toBe(true);
    expect(registry.has("physical:terrain")).toBe(true);
    expect(registry.has("physical:toon")).toBe(true);
    expect(registry.create("physical:glass", { name: "audit-glass", roughness: 0.08 })).toMatchObject({
      name: "audit-glass",
      roughness: 0.08
    });
  });
});
