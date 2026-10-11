import { describe, expect, it } from "vitest";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { featuresForGeometry } from "../../../../packages/rendering/src/program/MaterialFeatures";
import { prd06DeformDefines } from "../../../../packages/rendering/src/shaders/deform/forwardFeature";

const has = (...attributes: string[]) => (name: string) => attributes.includes(name);

describe("geometry-driven generated features", () => {
  it("drops only texture maps whose UV set is absent", () => {
    const record = normalizeProgramFeatures({ maps: {
      baseColor: { uvSet: 0, transform: false },
      normal: { uvSet: 1, transform: false }
    }, vertexColors: true });
    const masked = featuresForGeometry(record, has("a_uv1"));
    expect(masked.maps.baseColor).toBeUndefined();
    expect(masked.maps.normal).toEqual(record.maps.normal);
    expect(masked.vertexColors).toBe(false);
    expect(record.maps.baseColor).toBeDefined();
  });

  it("preserves texture-driven morphs when joint attributes are absent", () => {
    const record = normalizeProgramFeatures({ features: { "prd06.deform": "skin8|morph8n|k4" }, skinning: { influences: 8, palette: "texture" } });
    const masked = featuresForGeometry(record, has("a_position", "a_normal"));
    expect(masked.skinning).toBeUndefined();
    expect(masked.features["prd06.deform"]).toBe("morph8n|k4");
    expect(prd06DeformDefines(masked.features["prd06.deform"]!)).toEqual({ A3D_MORPH: 8, A3D_MORPH_MAX_ACTIVE: 4, A3D_MORPH_NORMALS: true });
    expect(record.features["prd06.deform"]).toBe("skin8|morph8n|k4");
  });

  it("retains a morph-only feature and its cache record by identity", () => {
    const record = normalizeProgramFeatures({ features: { "prd06.deform": "morph4|k4" } });
    expect(featuresForGeometry(record, has("a_position"))).toBe(record);
  });

  it("removes skin-only deformation unless both base attributes exist", () => {
    for (const attributes of [[], ["a_joints"], ["a_weights"]]) {
      const record = normalizeProgramFeatures({ features: { "prd06.deform": "skin4" }, skinning: { influences: 4, palette: "texture" } });
      const masked = featuresForGeometry(record, has(...attributes));
      expect(masked.features).not.toHaveProperty("prd06.deform");
      expect(masked.skinning).toBeUndefined();
    }
  });

  it("uses four influences when the second joint or weight attribute is absent", () => {
    const record = normalizeProgramFeatures({ features: { "prd06.deform": "skin8|morph4|k4" }, skinning: { influences: 8, palette: "texture" } });
    for (const extra of [[], ["a_joints1"], ["a_weights1"]]) {
      const masked = featuresForGeometry(record, has("a_joints", "a_weights", ...extra));
      expect(masked.skinning?.influences).toBe(4);
      expect(masked.features["prd06.deform"]).toBe("skin4|morph4|k4");
    }
    expect(featuresForGeometry(record, has("a_joints", "a_weights", "a_joints1", "a_weights1"))).toBe(record);
  });
});
