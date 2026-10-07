import { describe, expect, it } from "vitest";
import {
  createArchitecturalMaterialCatalog,
  createCinematicMaterialPreset,
  createAnimationMaterialStyle,
  defaultMaterialPresets,
  listCinematicMaterialPresets,
  MaterialPresetRegistry
} from "../../../../packages/rendering/src/MaterialPresets.js";

/**
 * PRD-15 T6.6: the cinematic, architectural and animation material preset
 * tables were merged into packages/rendering/src/MaterialPresets.ts as a pure
 * value move. These snapshots prove every preset value survived the merge —
 * ids, PBR options, catalog fields and factory output.
 */
describe("material preset merge snapshots", () => {
  it("cinematic presets", () => {
    expect(listCinematicMaterialPresets().map(({ id, label, pbr, approximatedFeatures, diagnostics }) => ({
      id, label, pbr, approximatedFeatures, diagnostics
    }))).toMatchSnapshot();
    expect(createCinematicMaterialPreset("wet-pavement").rendererOwnedEvidence).toMatchSnapshot();
  });

  it("architectural catalog", () => {
    expect(createArchitecturalMaterialCatalog().map(({ id, label, category, baseColor, roughness, metallic, textureFixture, knownLimits }) => ({
      id, label, category, baseColor, roughness, metallic, textureFixture, knownLimits
    }))).toMatchSnapshot();
  });

  it("animation material style treatments", () => {
    for (const treatment of ["preserve-pbr", "soft-toon", "cel", "flat-readable"] as const) {
      expect(createAnimationMaterialStyle({ treatment })).toMatchSnapshot(treatment);
    }
  });

  it("the shared registry still instantiates default presets", () => {
    const registry = new MaterialPresetRegistry(defaultMaterialPresets());
    expect(registry.list().map(({ kind }) => kind)).toMatchSnapshot();
    expect(registry.create("unlit").name).toMatchSnapshot();
    expect(registry.create("pbr").name).toMatchSnapshot();
  });
});
