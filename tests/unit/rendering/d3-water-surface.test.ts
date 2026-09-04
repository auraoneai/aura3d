import { describe, expect, it } from "vitest";
import {
  createWaterSurface,
  WATER_SURFACE_CLAIM_BOUNDARY,
  WATER_SURFACE_PLANAR_DEPENDENCY
} from "../../../packages/rendering/src/WaterSurface";
import { sampleOceanFixture } from "../../../packages/rendering/src/OceanSurface";

describe("D3 water surface material descriptor", () => {
  it("builds depth-tinted bands with fresnel-weighted sky tint", () => {
    const state = createWaterSurface({ preset: "moderate", bandCount: 5 });
    expect(state.bands.length).toBe(5);
    const shallow = state.bands[0]!;
    const deep = state.bands[state.bands.length - 1]!;
    expect(shallow.depthT).toBe(0);
    expect(deep.depthT).toBe(1);
    expect(shallow.color).not.toBe(deep.color);
    // Grazing (shallow-edge) bands carry more sky reflection than open water.
    expect(shallow.fresnelMix).toBeGreaterThan(deep.fresnelMix);
    for (const band of state.bands) {
      expect(band.fresnelMix).toBeGreaterThanOrEqual(0);
      expect(band.fresnelMix).toBeLessThanOrEqual(1);
      expect(band.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("maps the shore-foam mask 1:1 from OceanFoamPatch discs", () => {
    const seed = 1234;
    const state = createWaterSurface({ preset: "rough", seed });
    const fixture = sampleOceanFixture({ preset: "rough", seed, elapsedSeconds: 0 });
    expect(state.foam.length).toBe(fixture.foamPatches.length);
    expect(state.foam.length).toBeGreaterThan(0);
    for (const [index, mask] of state.foam.entries()) {
      const patch = fixture.foamPatches[index]!;
      expect(mask.sourcePatchId).toBe(patch.id);
      expect(mask.x).toBe(patch.x);
      expect(mask.z).toBe(patch.z);
      expect(mask.intensity).toBeGreaterThanOrEqual(0);
      expect(mask.intensity).toBeLessThanOrEqual(1);
    }
    expect(state.averageFoam).toBe(fixture.averageFoam);
    expect(state.maxFoam).toBe(fixture.maxFoam);
  });

  it("emits a fading wake trail only when the boat moves", () => {
    const parked = createWaterSurface({ boat: { x: 0, z: -2, speed: 0 } });
    expect(parked.wakeActive).toBe(false);
    expect(parked.wake.length).toBe(0);
    const moving = createWaterSurface({ boat: { x: 0, z: -2, headingRadians: 0, speed: 3 }, wakeSegmentCount: 8 });
    expect(moving.wakeActive).toBe(true);
    expect(moving.wake.length).toBe(8);
    const alphas = moving.wake.map((segment) => segment.alpha);
    for (let index = 1; index < alphas.length; index += 1) {
      expect(alphas[index]!).toBeLessThanOrEqual(alphas[index - 1]!);
    }
    expect(alphas[0]).toBeGreaterThan(alphas[alphas.length - 1]!);
    for (const segment of moving.wake) {
      expect(segment.width).toBeGreaterThan(0);
    }
  });

  it("keeps buoyancy fixture-side and records the B4 planar dependency", () => {
    const state = createWaterSurface({ preset: "calm" });
    expect(state.buoyancySource).toContain("sampleOceanFixture");
    expect(state.planarReflectionDependency).toBe(WATER_SURFACE_PLANAR_DEPENDENCY);
    expect(WATER_SURFACE_PLANAR_DEPENDENCY).toContain("B4");
    expect(WATER_SURFACE_PLANAR_DEPENDENCY).toContain("unsupported");
    expect(state.claimBoundary).toBe(WATER_SURFACE_CLAIM_BOUNDARY);
    expect(WATER_SURFACE_CLAIM_BOUNDARY).toContain("Bounded refraction look only");
    expect(() => createWaterSurface({ preset: "lagoon" as never })).toThrow(RangeError);
    expect(() => createWaterSurface({ bandCount: 1 })).toThrow(RangeError);
  });
});
