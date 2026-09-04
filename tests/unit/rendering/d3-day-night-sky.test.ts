import { describe, expect, it } from "vitest";
import {
  createDayNightSky,
  sampleCloudNoise,
  DAY_NIGHT_SKY_CLAIM_BOUNDARY
} from "../../../packages/rendering/src/DayNightSky";

describe("D3 day/night sky descriptor", () => {
  it("is deterministic for the same hour and seed", () => {
    const a = createDayNightSky({ hour: 12, seed: 7 });
    const b = createDayNightSky({ hour: 12, seed: 7 });
    expect(a.hash).toBe(b.hash);
    expect(a.zenithColor).toBe(b.zenithColor);
    expect(a.visibleStarCount).toBe(b.visibleStarCount);
  });

  it("is noon-bright at 12 and night-dark at 0", () => {
    const noon = createDayNightSky({ hour: 12 });
    const midnight = createDayNightSky({ hour: 0 });
    expect(noon.dayFactor).toBe(1);
    expect(midnight.dayFactor).toBe(0);
    expect(midnight.nightFactor).toBe(1);
    expect(midnight.visibleStarCount).toBeGreaterThan(0);
    expect(noon.visibleStarCount).toBe(0);
    expect(noon.zenithColor).not.toBe(midnight.zenithColor);
  });

  it("raises the sun at noon and the moon at midnight", () => {
    const noon = createDayNightSky({ hour: 12 });
    const midnight = createDayNightSky({ hour: 0 });
    expect(noon.sun.elevationRadians).toBeGreaterThan(0.5);
    expect(midnight.sun.elevationRadians).toBeLessThan(0);
    expect(midnight.moon.elevationRadians).toBeGreaterThan(0.5);
    expect(noon.moon.phase).toBeGreaterThanOrEqual(0.1);
    expect(noon.moon.phase).toBeLessThanOrEqual(1);
  });

  it("samples 2D-noise cloud coverage in [0, 1] with spatial variation", () => {
    const values = [
      sampleCloudNoise(-1, 0.2, 11),
      sampleCloudNoise(0, 0.4, 11),
      sampleCloudNoise(1, 0.6, 11),
      sampleCloudNoise(0.5, 0.3, 11)
    ];
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(new Set(values).size).toBeGreaterThan(1);
    const sky = createDayNightSky({ hour: 9 });
    expect(sky.clouds.length).toBeGreaterThan(0);
    expect(sky.averageCloudCoverage).toBeGreaterThanOrEqual(0);
    expect(sky.averageCloudCoverage).toBeLessThanOrEqual(1);
  });

  it("rejects out-of-range hours and keeps the claim boundary free of scattering models", () => {
    expect(() => createDayNightSky({ hour: 24 })).toThrow(RangeError);
    expect(() => createDayNightSky({ hour: -1 })).toThrow(RangeError);
    expect(DAY_NIGHT_SKY_CLAIM_BOUNDARY).toContain("Rayleigh/Mie");
    expect(DAY_NIGHT_SKY_CLAIM_BOUNDARY).not.toContain("physical atmosphere");
    expect(createDayNightSky({ hour: 18 }).claimBoundary).toBe(DAY_NIGHT_SKY_CLAIM_BOUNDARY);
  });
});
