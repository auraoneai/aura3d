import { describe, expect, it } from "vitest";
import {
  convolveEnvironmentIrradiance,
  evaluateShIrradiance,
  prefilterGgxEnvironmentLevels,
  projectEnvironmentIrradianceSh,
  specularPrefilterLevelRoughness
} from "../../../packages/rendering/src";

interface LinearSource {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

function uniformEnvironment(width: number, height: number, radiance: number): LinearSource {
  const data = new Float32Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    data[offset] = radiance;
    data[offset + 1] = radiance;
    data[offset + 2] = radiance;
    data[offset + 3] = 1;
  }
  return { width, height, data };
}

/** Small very bright disc on a dim background: the classic prefilter stress case. */
function brightSpotEnvironment(width: number, height: number): LinearSource {
  const data = new Float32Array(width * height * 4);
  const spotX = Math.floor(width * 0.5);
  const spotY = Math.floor(height * 0.5);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inSpot = Math.abs(x - spotX) <= 1 && Math.abs(y - spotY) <= 1;
      const value = inSpot ? 200 : 0.05;
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 1;
    }
  }
  return { width, height, data };
}

function luminanceStats(data: Float32Array): { readonly max: number; readonly mean: number; readonly variance: number } {
  const pixels = data.length / 4;
  let max = 0;
  let sum = 0;
  for (let index = 0; index < pixels; index += 1) {
    const luminance = data[index * 4]! * 0.2126 + data[index * 4 + 1]! * 0.7152 + data[index * 4 + 2]! * 0.0722;
    max = Math.max(max, luminance);
    sum += luminance;
  }
  const mean = sum / pixels;
  let squared = 0;
  for (let index = 0; index < pixels; index += 1) {
    const luminance = data[index * 4]! * 0.2126 + data[index * 4 + 1]! * 0.7152 + data[index * 4 + 2]! * 0.0722;
    squared += (luminance - mean) ** 2;
  }
  return { max, mean, variance: squared / pixels };
}

describe("GGX specular prefilter", () => {
  it("maps level index to roughness linearly and exposes the same mapping used when filtering", () => {
    expect(specularPrefilterLevelRoughness(1)).toEqual([0]);
    expect(specularPrefilterLevelRoughness(5)).toEqual([0, 0.25, 0.5, 0.75, 1]);

    const levels = prefilterGgxEnvironmentLevels(uniformEnvironment(16, 8, 1), { levels: 5, sampleCount: 16 });
    expect(levels.map((level) => level.roughness)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("keeps roughness 0 as a mirror sample of the source radiance", () => {
    const source = brightSpotEnvironment(32, 16);
    const levels = prefilterGgxEnvironmentLevels(source, { levels: 1, sampleCount: 32 });
    const mirror = levels[0]!;

    expect(mirror.width).toBe(32);
    expect(mirror.height).toBe(16);
    // The bright disc must survive intact at roughness 0.
    expect(luminanceStats(mirror.data).max).toBeGreaterThan(150);
  });

  it("monotonically reduces highlight peak and variance as roughness increases", () => {
    const source = brightSpotEnvironment(64, 32);
    const levels = prefilterGgxEnvironmentLevels(source, { levels: 6, sampleCount: 128 });
    const stats = levels.map((level) => luminanceStats(level.data));

    // Peak radiance must fall at every step: a wider GGX lobe cannot concentrate
    // more energy into a single direction than a narrower one.
    for (let index = 1; index < stats.length; index += 1) {
      expect(stats[index]!.max).toBeLessThan(stats[index - 1]!.max);
      expect(stats[index]!.variance).toBeLessThan(stats[index - 1]!.variance);
    }

    // Roughest level is nearly uniform relative to the mirror level.
    expect(stats.at(-1)!.variance).toBeLessThan(stats[0]!.variance * 0.01);
  }, 60_000);

  it("conserves total energy within the filtered pyramid instead of dimming or blowing up", () => {
    const source = uniformEnvironment(32, 16, 3);
    const levels = prefilterGgxEnvironmentLevels(source, { levels: 5, sampleCount: 64 });

    for (const level of levels) {
      const stats = luminanceStats(level.data);
      // A constant environment must stay constant at every roughness.
      expect(stats.mean).toBeCloseTo(3, 4);
      expect(stats.variance).toBeLessThan(1e-6);
    }
  }, 30_000);

  it("rejects malformed sources and options", () => {
    expect(() => prefilterGgxEnvironmentLevels({ width: 0, height: 4, data: new Float32Array(0) }))
      .toThrow(RangeError);
    expect(() => prefilterGgxEnvironmentLevels({ width: 4, height: 4, data: new Float32Array(8) }))
      .toThrow(RangeError);
    expect(() => prefilterGgxEnvironmentLevels(uniformEnvironment(8, 4, 1), { levels: 0 }))
      .toThrow(RangeError);
    expect(() => prefilterGgxEnvironmentLevels(uniformEnvironment(8, 4, 1), { sampleCount: -4 }))
      .toThrow(RangeError);
  });
});

describe("spherical-harmonic diffuse irradiance", () => {
  it("round-trips a uniform environment through cosine convolution", () => {
    const coefficients = projectEnvironmentIrradianceSh(uniformEnvironment(64, 32, 1));

    for (const normal of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [0, 0, 1]] as const) {
      const irradiance = evaluateShIrradiance(coefficients, normal);
      expect(irradiance[0]).toBeCloseTo(1, 2);
      expect(irradiance[1]).toBeCloseTo(1, 2);
      expect(irradiance[2]).toBeCloseTo(1, 2);
    }
  });

  it("scales linearly with environment radiance", () => {
    const single = evaluateShIrradiance(projectEnvironmentIrradianceSh(uniformEnvironment(32, 16, 1)), [0, 1, 0]);
    const quadruple = evaluateShIrradiance(projectEnvironmentIrradianceSh(uniformEnvironment(32, 16, 4)), [0, 1, 0]);

    expect(quadruple[0] / single[0]).toBeCloseTo(4, 3);
  });

  it("produces directional falloff for a hemispherical light instead of a flat average", () => {
    const width = 64;
    const height = 32;
    const data = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      // Upper hemisphere bright, lower hemisphere black.
      const value = y < height / 2 ? 4 : 0;
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
        data[offset + 3] = 1;
      }
    }

    const coefficients = projectEnvironmentIrradianceSh({ width, height, data });
    const up = evaluateShIrradiance(coefficients, [0, 1, 0]);
    const side = evaluateShIrradiance(coefficients, [1, 0, 0]);
    const down = evaluateShIrradiance(coefficients, [0, -1, 0]);

    expect(up[0]).toBeGreaterThan(side[0]);
    expect(side[0]).toBeGreaterThan(down[0]);
    // A normal fully facing the lit hemisphere approaches the source radiance.
    expect(up[0]).toBeGreaterThan(3);
    expect(down[0]).toBeLessThan(0.5);
    // Sideways normals see about half the lit hemisphere.
    expect(side[0]).toBeGreaterThan(1);
    expect(side[0]).toBeLessThan(3);
  });

  it("renders irradiance to an equirect map of the requested size", () => {
    const irradiance = convolveEnvironmentIrradiance(uniformEnvironment(32, 16, 2), 8, 4);

    expect(irradiance.width).toBe(8);
    expect(irradiance.height).toBe(4);
    expect(irradiance.data.length).toBe(8 * 4 * 4);
    expect(luminanceStats(irradiance.data).mean).toBeCloseTo(2, 2);
    expect(() => convolveEnvironmentIrradiance(uniformEnvironment(8, 4, 1), 0, 4)).toThrow(RangeError);
  });
});
