import { describe, expect, it } from "vitest";
import {
  dCharlie,
  iblSheenBRDF,
  sheenDirect,
  vNeubelt,
} from "../../qr/prd04/oracles/native-reference-sheen";

/** Composite midpoint integration in the projected-normal cosine, not H-space. */
function projectedNdfMass(roughness: number, count = 65_536): number {
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const noH = (i + 0.5) / count;
    sum += dCharlie(noH, roughness) * noH;
  }
  return 2 * Math.PI * sum / count;
}

/**
 * Independent incident-direction midpoint integral: dω = d(NoL) dφ.
 * It samples the BRDF directly, not the half-vector transformation and
 * Gauss-Legendre integration used by iblSheenBRDF.
 */
function incidentHemisphereIntegral(noV: number, roughness: number, n: number): number {
  let sum = 0;
  const azimuthSteps = 2 * n;
  for (let i = 0; i < n; i++) {
    const noL = (i + 0.5) / n;
    for (let j = 0; j < azimuthSteps; j++) {
      const cosDeltaPhi = Math.cos(2 * Math.PI * (j + 0.5) / azimuthSteps);
      sum += noL * sheenDirect({ noL, noV, cosDeltaPhi, roughness });
    }
  }
  return 2 * Math.PI * sum / (n * azimuthSteps);
}

describe("independent CPU-double sheen reference", () => {
  it("has the analytic Charlie endpoints and normalized projected NDF mass", () => {
    for (const roughness of [0.05, 0.15, 0.35, 0.7, 1]) {
      expect(dCharlie(0, roughness)).toBeCloseTo((2 + 1 / (roughness * roughness)) / (2 * Math.PI), 12);
      expect(dCharlie(1, roughness)).toBe(0);
      // Integral D(h) (n·h) dω_h = 1. With x = sin²(theta_h), the
      // normalization follows from ∫₀¹ x^(1/(2*roughness²)) dx.
      expect(Math.abs(projectedNdfMass(roughness) - 1)).toBeLessThan(4e-8);
    }
    expect(dCharlie(0.6, 1)).toBeCloseTo(1.2 / Math.PI, 14);
    expect(Number.isFinite(dCharlie(0, 1e-4))).toBe(true);
  });

  it("keeps visibility reciprocal and finite away from its singular corner", () => {
    expect(vNeubelt(1, 1)).toBe(0.25);
    expect(vNeubelt(1, 0)).toBe(0.25);
    expect(vNeubelt(0, 0.5)).toBe(0.5);
    for (const a of [0, 1e-12, 0.1, 0.5, 1]) {
      for (const b of [1e-12, 0.2, 0.7, 1]) {
        expect(Number.isFinite(vNeubelt(a, b))).toBe(true);
        expect(vNeubelt(a, b)).toBeGreaterThan(0);
        expect(vNeubelt(a, b)).toBeCloseTo(vNeubelt(b, a), 10);
      }
    }
  });

  it("returns an unweighted reciprocal BRDF including near-grazing directions", () => {
    const sameDirection = { noL: 0.6, noV: 0.6, cosDeltaPhi: 1, roughness: 1 };
    expect(sheenDirect(sameDirection)).toBeCloseTo((1.2 / Math.PI) / 3.36, 14);
    expect(sheenDirect({ ...sameDirection, cosDeltaPhi: -1 })).toBe(0);
    for (const roughness of [1e-4, 0.2, 0.65, 1]) {
      for (const [noL, noV, cosDeltaPhi] of [
        [1e-8, 2e-8, -0.999999],
        [0, 1e-5, 0.7],
        [0.03, 0.7, -0.8],
        [0.25, 0.9, 0.4],
      ] as const) {
        const a = sheenDirect({ noL, noV, cosDeltaPhi, roughness });
        const b = sheenDirect({ noL: noV, noV: noL, cosDeltaPhi, roughness });
        expect(Number.isFinite(a)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-12 * Math.max(1, a, b));
      }
    }
  });

  it("matches exact directional-energy integrals at normal and grazing views", () => {
    // At NoV=0, E = (2+1/r²)/π * ∫₀¹(1-z²)^(1/(2r²)+1/2) dz.
    // Elementary beta-integral special cases give these exact values.
    expect(iblSheenBRDF(0, 1)).toBeCloseTo(2 / Math.PI, 12);
    expect(iblSheenBRDF(0, 0.5)).toBeCloseTo(15 / 16, 12);
    expect(iblSheenBRDF(0, 0.25)).toBeCloseTo(9 * 48_620 / 262_144, 12);
    // At NoV=1, substituting p = 1/(2r²) and integrating over NoL gives
    // E = 2^(-p)/(2(p+2)), including the small-roughness limit.
    expect(iblSheenBRDF(1, 1)).toBeCloseTo(1 / (5 * Math.SQRT2), 12);
    expect(iblSheenBRDF(1, 0.5)).toBeCloseTo(1 / 32, 12);
    for (const roughness of [0.1, 0.25, 0.5, 0.8, 1]) {
      const p = 1 / (2 * roughness * roughness);
      const exact = 2 ** (-p) / (2 * (p + 2));
      expect(Math.abs(iblSheenBRDF(1, roughness) - exact)).toBeLessThan(1e-13);
    }
  });

  it("converges at grazing angles and obeys a derived nonnegative energy bound", () => {
    for (const roughness of [1e-4, 0.01, 0.05, 0.25, 1]) {
      for (const noV of [0, 1e-12, 1e-6, 0.05, 0.5, 1]) {
        const coarse = iblSheenBRDF(noV, roughness, { order: 128 });
        const fine = iblSheenBRDF(noV, roughness, { order: 256 });
        // D(z) <= (2+1/r²)/(2π) exp(-z²/(2r²)), while the remaining
        // reflected geometry factor is <= 1. Integrating to infinity gives:
        const bound = (2 + 1 / (roughness * roughness)) * roughness * Math.sqrt(Math.PI / 2);
        expect(Number.isFinite(coarse)).toBe(true);
        expect(coarse).toBeGreaterThanOrEqual(0);
        expect(coarse).toBeLessThanOrEqual(bound);
        expect(Math.abs(coarse - fine)).toBeLessThan(1e-8 + 1e-11 * fine);
      }
    }
    // The approximate visibility is not universally energy conserving.
    // An unconditional E <= 1 assertion would contradict this exact case.
    expect(iblSheenBRDF(0, 0.25)).toBeGreaterThan(1);
  });

  it("agrees with a separately integrated incident hemisphere", () => {
    for (const [noV, roughness] of [[0.15, 0.4], [0.7, 0.8]] as const) {
      const estimate = incidentHemisphereIntegral(noV, roughness, 1024);
      expect(Math.abs(estimate - iblSheenBRDF(noV, roughness))).toBeLessThan(1e-6);
    }
  });

  it("rejects invalid, undefined and unrepresentable inputs explicitly", () => {
    for (const invalid of [-0.01, 1.01, NaN, Infinity]) {
      expect(() => dCharlie(invalid, 0.5)).toThrow(RangeError);
      expect(() => vNeubelt(invalid, 0.5)).toThrow(RangeError);
      expect(() => vNeubelt(0.5, invalid)).toThrow(RangeError);
      expect(() => iblSheenBRDF(invalid, 0.5)).toThrow(RangeError);
      expect(() => sheenDirect({ noL: invalid, noV: 0.5, cosDeltaPhi: 0, roughness: 0.5 })).toThrow(RangeError);
      expect(() => sheenDirect({ noL: 0.5, noV: invalid, cosDeltaPhi: 0, roughness: 0.5 })).toThrow(RangeError);
    }
    for (const cosDeltaPhi of [-1.01, 1.01, NaN, Infinity]) {
      expect(() => sheenDirect({ noL: 0.5, noV: 0.5, cosDeltaPhi, roughness: 0.5 })).toThrow(RangeError);
    }
    for (const roughness of [0, 1e-5, -1, 1.01, NaN, Infinity]) {
      expect(() => dCharlie(0.5, roughness)).toThrow(RangeError);
      expect(() => sheenDirect({ noL: 0.5, noV: 0.5, cosDeltaPhi: 0, roughness })).toThrow(RangeError);
      expect(() => iblSheenBRDF(0.5, roughness)).toThrow(RangeError);
    }
    expect(() => vNeubelt(0, 0)).toThrow(RangeError);
    expect(() => vNeubelt(Number.MIN_VALUE, 0)).toThrow(RangeError);
    expect(() => sheenDirect({ noL: 0, noV: 0, cosDeltaPhi: 0, roughness: 0.5 })).toThrow(RangeError);
    for (const order of [0, 15, 16.5, 513, NaN]) {
      expect(() => iblSheenBRDF(0.5, 0.5, { order })).toThrow(RangeError);
    }
  });
});
