import { describe, expect, it } from "vitest";
import {
  createCinematicMaterialPreset,
  createCinematicPBRMaterial,
  listCinematicMaterialPresets,
  resolveCinematicMaterialPresetId
} from "../../../packages/rendering/src";

describe("cinematic material presets", () => {
  it("provides renderer-owned wet, neon, and hero glow PBR presets", () => {
    const presets = listCinematicMaterialPresets();

    expect(presets.map((preset) => preset.id)).toEqual(expect.arrayContaining([
      "wet-pavement",
      "neon-emissive",
      "hero-prop-glow"
    ]));
    expect(createCinematicMaterialPreset("wet-pavement")).toMatchObject({
      pbr: { roughness: expect.any(Number), clearcoatFactor: expect.any(Number) },
      rendererOwnedEvidence: {
        feature: "material",
        rendererOwned: true,
        domOverlay: false,
        satisfiesPublicCinematicGate: true
      }
    });
    expect(createCinematicMaterialPreset("neon-emissive").pbr.emissiveStrength).toBeGreaterThan(1);
    expect(createCinematicMaterialPreset("hero-prop-glow").approximatedFeatures.join(" ")).toContain("subsurface");
    expect(resolveCinematicMaterialPresetId(["glowing flower", "hero"])).toBe("hero-prop-glow");
  });

  it("creates real renderer PBR material instances instead of overlay descriptors", () => {
    const material = createCinematicPBRMaterial("neon-emissive");

    expect(material.shaderKey).toBe("aura3d/pbr-direct");
    expect(material.getParameter("u_emissiveStrength")).toBeGreaterThan(1);
    expect(material.disposed).toBe(false);
    material.dispose();
    expect(material.disposed).toBe(true);
  });
});
