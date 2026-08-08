import { describe, expect, it } from "vitest";
import {
  PBRMaterial,
  TexturedPBRMaterial,
  createArchitecturalLightingState,
  architecturalMaterialCatalogSummary,
  architecturalMaterialDescriptor,
  createArchitecturalMeasurementSet,
  createArchitecturalMaterial,
  createArchitecturalMaterialCatalog
} from "../../../packages/rendering/src";

describe("architectural material catalog", () => {
  it("ports the old arch-viz material taxonomy as deterministic current-engine descriptors", () => {
    const catalog = createArchitecturalMaterialCatalog();
    const summary = architecturalMaterialCatalogSummary();

    expect(summary.source).toBe("origin-master-examples-arch-viz-material-library-adapted");
    expect(summary.materialCount).toBe(31);
    expect(summary.categories).toEqual(["wood", "stone", "metal", "fabric", "glass", "ceramic"]);
    expect(summary.categoryCounts).toEqual({
      wood: 6,
      stone: 6,
      metal: 6,
      fabric: 5,
      glass: 4,
      ceramic: 4
    });
    expect(summary.texturedMaterialCount).toBeGreaterThanOrEqual(10);
    expect(summary.claimBoundary).toContain("does not prove");
    expect(catalog.every((entry) => entry.knownLimits.join(" ").includes("not scanned"))).toBe(true);
  });

  it("creates PBR and textured material resources from catalog entries", () => {
    const concrete = createArchitecturalMaterial("concrete");
    const brass = createArchitecturalMaterial("brass");
    const glass = createArchitecturalMaterial("glass-tinted");

    expect(concrete).toBeInstanceOf(TexturedPBRMaterial);
    expect(concrete.name).toBe("architectural-concrete");
    expect(brass).toBeInstanceOf(PBRMaterial);
    expect(brass).toMatchObject({ name: "architectural-brass", metallic: 1, roughness: 0.25 });
    expect(glass).toMatchObject({ name: "architectural-glass-tinted", renderState: { blend: true, depthWrite: false } });
  });

  it("rejects unknown architectural material ids", () => {
    expect(architecturalMaterialDescriptor("velvet")).toMatchObject({ category: "fabric", roughness: 0.9 });
    expect(() => architecturalMaterialDescriptor("unknown")).toThrow(/Unknown architectural material preset/);
  });
});

describe("architectural measurement set", () => {
  it("computes snap-point distance, area, angle, and height measurements", () => {
    const fixture = createArchitecturalMeasurementSet({ unit: "metric", precision: 2 });

    expect(fixture.snapEnabled).toBe(true);
    expect(fixture.snapPointCount).toBeGreaterThanOrEqual(16);
    expect(fixture.distance).toMatchObject({ type: "distance", value: 12, unit: "m", label: "12.00 m" });
    expect(fixture.area).toMatchObject({ type: "area", value: 144, unit: "m2", label: "144.00 m2" });
    expect(fixture.height).toMatchObject({ type: "height", value: 2.1, unit: "m", label: "2.10 m" });
    expect(fixture.angle.type).toBe("angle");
    expect(fixture.angle.value).toBeCloseTo(90, 3);
    expect(fixture.angle.label).toBe("90.00 deg");
    expect(fixture.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("formats imperial measurement evidence without changing the metric source values", () => {
    const fixture = createArchitecturalMeasurementSet({ unit: "imperial", precision: 1 });

    expect(fixture.distance.value).toBe(12);
    expect(fixture.distance.unit).toBe("ft");
    expect(fixture.distance.label).toContain("ft");
    expect(fixture.area.value).toBe(144);
    expect(fixture.area.unit).toBe("ft2");
    expect(fixture.area.label).toContain("ft2");
  });

  it("rejects invalid measurement tolerances", () => {
    expect(() => createArchitecturalMeasurementSet({ snapTolerance: -1 })).toThrow(/snapTolerance/);
    expect(() => createArchitecturalMeasurementSet({ snapTolerance: Number.NaN })).toThrow(/snapTolerance/);
  });
});

describe("architectural lighting state", () => {
  it("computes time-of-day lighting presets and Kelvin interior light metadata", () => {
    const noon = createArchitecturalLightingState({ preset: "noon" });
    const dusk = createArchitecturalLightingState({ preset: "dusk" });

    expect(noon.presetLabel).toBe("Noon");
    expect(noon.timeOfDayHours).toBe(12);
    expect(noon.sunIntensity).toBe(4.5);
    expect(noon.interiorLightsEnabled).toBe(false);
    expect(noon.activeInteriorLightCount).toBe(0);
    expect(noon.interiorLights).toHaveLength(10);
    expect(noon.interiorLights.map((light) => light.type)).toEqual(expect.arrayContaining(["point", "spot", "area"]));
    expect(noon.kelvinRange).toEqual([2700, 5000]);
    expect(noon.hash).toMatch(/^[0-9a-f]{8}$/);

    expect(dusk.presetLabel).toBe("Dusk");
    expect(dusk.interiorLightsEnabled).toBe(true);
    expect(dusk.activeInteriorLightCount).toBe(10);
    expect(dusk.sunDirection).not.toEqual(noon.sunDirection);
    expect(dusk.hash).not.toBe(noon.hash);
  });

  it("allows explicit interior light toggling while preserving deterministic preset colors", () => {
    const sunsetOff = createArchitecturalLightingState({ preset: "sunset", interiorLightsEnabled: false });
    const sunsetOn = createArchitecturalLightingState({ preset: "sunset", interiorLightsEnabled: true });

    expect(sunsetOff.sunColor).toEqual(sunsetOn.sunColor);
    expect(sunsetOff.interiorLightsEnabled).toBe(false);
    expect(sunsetOff.activeInteriorLightCount).toBe(0);
    expect(sunsetOn.interiorLightsEnabled).toBe(true);
    expect(sunsetOn.activeInteriorLightCount).toBe(10);
    expect(sunsetOn.interiorLights.find((light) => light.id === "bathroom-main")).toMatchObject({
      type: "area",
      temperatureKelvin: 5000,
      enabled: true
    });
  });
});
