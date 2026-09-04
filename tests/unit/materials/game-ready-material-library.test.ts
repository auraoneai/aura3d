import { describe, expect, it } from "vitest";
import {
  findGameReadyMaterial,
  GAME_READY_MATERIAL_PRESETS,
  listGameReadyMaterials,
  validateGameReadyMaterialLibrary,
  validateGameReadyMaterialPreset
} from "../../../packages/materials/src/node";

const EXPECTED_KINDS = ["carPaint", "skinSSS-approx", "glassThin", "brushedMetal", "foliage", "concreteAsphalt"] as const;

describe("game-ready material library (PART C2)", () => {
  it("ships exactly the six required presets with unique ids", () => {
    const materials = listGameReadyMaterials();
    expect(materials).toHaveLength(6);
    expect([...materials.map((preset) => preset.kind)].sort()).toEqual([...EXPECTED_KINDS].sort());
    expect(new Set(materials.map((preset) => preset.id)).size).toBe(6);
    for (const kind of EXPECTED_KINDS) {
      expect(findGameReadyMaterial(kind)?.kind).toBe(kind);
    }
  });

  it("passes MaterialValidation for every preset", () => {
    const validation = validateGameReadyMaterialLibrary();
    expect(validation.presetCount).toBe(6);
    expect(validation.failingIds).toEqual([]);
    expect(validation.passingCount).toBe(6);
    for (const result of validation.results) {
      expect(result.issues, `issues for ${result.id}`).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });

  it("carries the required feature parameters per kind", () => {
    const paramsOf = (id: string): Record<string, number | string | readonly number[]> => {
      const preset = findGameReadyMaterial(id);
      expect(preset).toBeDefined();
      return preset?.parameters as Record<string, number | string | readonly number[]>;
    };
    // carPaint: clearcoat plus flake normal.
    expect(paramsOf("carPaint").clearcoat).toBe(1);
    expect(paramsOf("carPaint").flakeNormalScale).toBeGreaterThan(0);
    // skinSSS-approx: wrapped diffuse plus thickness tint.
    expect(paramsOf("skinSSS-approx").wrapDiffuse).toBeGreaterThan(0);
    expect(paramsOf("skinSSS-approx").thicknessTint).toHaveLength(3);
    // glassThin: thin-walled transmission.
    expect(paramsOf("glassThin").transmission).toBeGreaterThanOrEqual(0.5);
    expect(paramsOf("glassThin").thickness as number).toBeLessThanOrEqual(0.05);
    // brushedMetal: anisotropy on full metal.
    expect(paramsOf("brushedMetal").metalness).toBe(1);
    expect(paramsOf("brushedMetal").anisotropy as number).toBeGreaterThanOrEqual(0.5);
    // foliage: alpha-cutout plus translucency.
    expect(paramsOf("foliage").alphaMode).toBe("mask");
    expect(paramsOf("foliage").translucency as number).toBeGreaterThan(0);
    // concrete/asphalt: roughness variation.
    expect(paramsOf("concreteAsphalt").roughnessVariation as number).toBeGreaterThan(0);
  });

  it("ships a root example snippet, a probe screenshot, and tunables per preset", () => {
    for (const preset of GAME_READY_MATERIAL_PRESETS) {
      expect(preset.exampleSnippet, `${preset.id} snippet`).toContain("material.");
      expect(preset.exampleSnippet, `${preset.id} snippet`).toContain("@aura3d/engine");
      expect(preset.probe.screenshot, `${preset.id} screenshot`).toMatch(/^tests\/reports\/game-ready-materials\/.+\.png$/);
      expect(preset.tunables.length, `${preset.id} tunables`).toBeGreaterThan(0);
      for (const tunable of preset.tunables) {
        expect(tunable.name).toBeTruthy();
        expect(tunable.range).toBeTruthy();
        expect(tunable.effect).toBeTruthy();
      }
    }
  });

  it("never presents the skin approximation as physical scattering", () => {
    const skin = findGameReadyMaterial("skinSSS-approx");
    expect(skin).toBeDefined();
    const text = `${skin?.label}\n${skin?.note}\n${skin?.exampleSnippet}\n${skin?.tunables.map((tunable) => `${tunable.name} ${tunable.effect}`).join("\n")}`;
    expect(text).toMatch(/approx/i);
    expect(text).not.toMatch(/true\s+sss|real\s+sss|actual\s+sss|physical\s+subsurface\s+scattering/i);
  });

  it("flags out-of-contract presets instead of passing them", () => {
    const base = findGameReadyMaterial("glassThin");
    expect(base).toBeDefined();
    const broken = validateGameReadyMaterialPreset({
      ...base!,
      parameters: { ...base!.parameters, thickness: 0.8 }
    });
    expect(broken.ok).toBe(false);
    expect(broken.issues.join(" ")).toContain("thickness");
  });
});
