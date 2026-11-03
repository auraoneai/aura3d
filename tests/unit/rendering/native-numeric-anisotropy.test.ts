import { describe, expect, it } from "vitest";
import {
  anisotropyAlphaT,
  dGGXAnisotropic,
  vGGXAnisotropic
} from "../../qr/prd04/oracles/native-reference-anisotropy";

type Direction = readonly [t: number, b: number, n: number];

function direction(theta: number, phi: number): Direction {
  const radius = Math.sin(theta);
  return [radius * Math.cos(phi), radius * Math.sin(phi), Math.cos(theta)];
}

function distribution(alphaT: number, alphaB: number, half: Direction): number {
  return dGGXAnisotropic(alphaT, alphaB, ...half);
}

function visibility(alphaT: number, alphaB: number, light: Direction, view: Direction): number {
  return vGGXAnisotropic(alphaT, alphaB, ...light, ...view);
}

function expectRelative(actual: number, expected: number, tolerance = 1e-12): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * tolerance);
}

/** Numerically integrate D(h) (n·h) dω, with midpoint quadrature in μ and φ. */
function projectedHemisphereIntegral(alphaT: number, alphaB: number): number {
  const nMu = 512;
  const nPhi = 384;
  let sum = 0;
  for (let i = 0; i < nMu; i++) {
    const mu = (i + 0.5) / nMu;
    const radius = Math.sqrt(1 - mu * mu);
    for (let j = 0; j < nPhi; j++) {
      const phi = 2 * Math.PI * (j + 0.5) / nPhi;
      sum += distribution(alphaT, alphaB, [radius * Math.cos(phi), radius * Math.sin(phi), mu]) * mu;
    }
  }
  return sum * 2 * Math.PI / (nMu * nPhi);
}

describe("independent anisotropic GGX CPU reference", () => {
  it("maps squared perceptual roughness to the specified tangent slope endpoints", () => {
    const alpha = 0.4 ** 2;
    expectRelative(anisotropyAlphaT(alpha, 0), 0.16);
    expectRelative(anisotropyAlphaT(alpha, 0.5), 0.37);
    expectRelative(anisotropyAlphaT(alpha, 0.8), 0.6976);
    expect(anisotropyAlphaT(alpha, 1)).toBe(1);
    expect(anisotropyAlphaT(1, 0.75)).toBe(1);
    expect(anisotropyAlphaT(0, 0)).toBe(0);
    expect(anisotropyAlphaT(0, 1)).toBe(1);
    expect(anisotropyAlphaT(alpha, 0.8)).toBeGreaterThan(anisotropyAlphaT(alpha, 0.5));
  });

  it("reduces D to the analytical isotropic GGX distribution at every angle", () => {
    for (const alpha of [0.15, 0.5, 1]) {
      for (const theta of [0, 0.4, 1.1, Math.PI / 2]) {
        const half = direction(theta, 0.7);
        const cosine = half[2];
        const expected = alpha ** 2 / (Math.PI * (1 + (alpha ** 2 - 1) * cosine ** 2) ** 2);
        expectRelative(distribution(alpha, alpha, half), expected);
      }
    }
  });

  it("preserves the anisotropic peak, both grazing limits, and axis orientation", () => {
    const alphaT = 0.7;
    const alphaB = 0.2;
    expectRelative(distribution(alphaT, alphaB, [0, 0, 1]), 1 / (Math.PI * alphaT * alphaB));
    expectRelative(distribution(alphaT, alphaB, [1, 0, 0]), alphaT ** 3 / (Math.PI * alphaB));
    expectRelative(distribution(alphaT, alphaB, [0, 1, 0]), alphaB ** 3 / (Math.PI * alphaT));
    expect(distribution(alphaT, alphaB, [0.6, 0, 0.8])).toBeGreaterThan(
      distribution(alphaT, alphaB, [0, 0.6, 0.8])
    );
    expectRelative(distribution(alphaT, alphaB, [0.6, 0, 0.8]),
      distribution(alphaB, alphaT, [0, 0.6, 0.8]));
    expectRelative(distribution(alphaT, alphaB, [-0.6, 0, 0.8]),
      distribution(alphaT, alphaB, [0.6, 0, 0.8]));
  });

  it("normalizes projected microfacet area across the hemisphere", () => {
    for (const [alphaT, alphaB] of [[1, 1], [0.4, 0.4], [0.75, 0.25]] as const) {
      // The finite midpoint grid has a small quadrature error for peaked lobes.
      expect(Math.abs(projectedHemisphereIntegral(alphaT, alphaB) - 1)).toBeLessThan(1e-4);
    }
  });

  it("agrees with Smith's Lambda and is reciprocal under light/view exchange", () => {
    const alphaT = 0.72;
    const alphaB = 0.23;
    const light = direction(0.85, 0.3);
    const view = direction(1.2, 1.7);
    const lambda = ([t, b, n]: Direction): number =>
      (Math.sqrt(1 + ((alphaT * t) ** 2 + (alphaB * b) ** 2) / n ** 2) - 1) / 2;
    const expected = 1 / (4 * light[2] * view[2] * (1 + lambda(light) + lambda(view)));
    expectRelative(visibility(alphaT, alphaB, light, view), expected);
    expectRelative(visibility(alphaT, alphaB, view, light), expected);
    expectRelative(visibility(0.4, 0.4, [0, 0, 1], [0, 0, 1]), 0.25);
  });

  it("reduces visibility to isotropic Smith and handles a single grazing direction", () => {
    const light = direction(0.9, 0.4);
    const view = direction(1.25, 2.3);
    for (const alpha of [0.1, 0.5, 1]) {
      const q = (n: number): number => Math.sqrt(alpha ** 2 * (1 - n ** 2) + n ** 2);
      const expected = 1 / (2 * (light[2] * q(view[2]) + view[2] * q(light[2])));
      expectRelative(visibility(alpha, alpha, light, view), expected);
    }
    expectRelative(visibility(0.4, 0.6, [1, 0, 0], [0, 0, 1]), 1 / 0.8);
    expectRelative(visibility(0.4, 0.6, [0, 0, 1], [0, 1, 0]), 1 / 1.2);
    const nearGrazing: Direction = [Math.sqrt(1 - 1e-12), 0, 1e-6];
    expectRelative(visibility(0.4, 0.6, nearGrazing, [0, 0, 1]),
      1 / (2 * (1e-6 + Math.hypot(0.4 * nearGrazing[0], 1e-6))));
  });

  it("defines the lower hemisphere as unlit and rejects the exact double horizon", () => {
    expect(distribution(0.4, 0.7, [0, 0, -1])).toBe(0);
    expect(visibility(0.4, 0.7, [0, 0, -1], [0, 0, 1])).toBe(0);
    expect(visibility(0.4, 0.7, [0, 0, 1], [0, 0, -1])).toBe(0);
    expect(() => visibility(0.4, 0.7, [1, 0, 0], [0, 1, 0])).toThrow(RangeError);
  });

  it("stays finite for representable narrow lobes and reports unrepresentable values", () => {
    const narrow = 1e-100;
    expectRelative(distribution(narrow, narrow, [0, 0, 1]), 1 / (Math.PI * narrow ** 2), 1e-12);
    expect(distribution(Number.MIN_VALUE, Number.MIN_VALUE, [1, 0, 0])).toBe(0);
    expect(() => distribution(Number.MIN_VALUE, Number.MIN_VALUE, [0, 0, 1])).toThrow(RangeError);
    const almostHorizon: Direction = [1, 0, 1e-150];
    expectRelative(visibility(1e-200, 1e-200, almostHorizon, almostHorizon), 2.5e299, 1e-12);
    const subnormalHorizon: Direction = [1, 0, Number.MIN_VALUE];
    expect(() => visibility(Number.MIN_VALUE, Number.MIN_VALUE, subnormalHorizon, subnormalHorizon))
      .toThrow(RangeError);
  });

  it("validates all alpha, strength, and direction inputs without silently clamping", () => {
    for (const invalid of [-1, 1.1, NaN, Infinity, -Infinity]) {
      expect(() => anisotropyAlphaT(invalid, 0.5)).toThrow(RangeError);
      expect(() => anisotropyAlphaT(0.5, invalid)).toThrow(RangeError);
    }
    for (const invalid of [0, -0.1, 1.1, NaN, Infinity, -Infinity]) {
      expect(() => distribution(invalid, 0.5, [0, 0, 1])).toThrow(RangeError);
      expect(() => distribution(0.5, invalid, [0, 0, 1])).toThrow(RangeError);
      expect(() => visibility(invalid, 0.5, [0, 0, 1], [0, 0, 1])).toThrow(RangeError);
      expect(() => visibility(0.5, invalid, [0, 0, 1], [0, 0, 1])).toThrow(RangeError);
    }
    for (const invalid of [[0, 0, 0], [0, 0, 2], [NaN, 0, 1], [Infinity, 0, 0]] as const) {
      expect(() => distribution(0.5, 0.5, invalid)).toThrow(RangeError);
      expect(() => visibility(0.5, 0.5, invalid, [0, 0, 1])).toThrow(RangeError);
      expect(() => visibility(0.5, 0.5, [0, 0, 1], invalid)).toThrow(RangeError);
    }
  });
});
