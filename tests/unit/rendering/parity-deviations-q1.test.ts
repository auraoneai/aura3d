import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PBR_REFERENCE_MIN_ROUGHNESS,
  pbrDistributionGgx,
  pbrGeometrySmithGgxCorrelated,
  pbrLinearToSrgbChannel,
} from "../../../packages/rendering/src/PbrReference";

// Mathematical references, not renderer-to-renderer comparison evidence:
// - IEC 61966-2-1 sRGB transfer function: https://www.w3.org/TR/css-color-4/#color-conversion-code
// - GGX distribution: Walter et al., Microfacet Models for Refraction through
//   Rough Surfaces, https://www.cs.cornell.edu/~srm/publications/EGSR07-btdf.pdf
// - Height-correlated Smith masking: Heitz, Understanding the Masking-Shadowing
//   Function in Microfacet-Based BRDFs, https://jcgt.org/published/0003/02/03/
// The perceptual roughness convention used here is alpha = roughness².

function srgbFromLinear(linear: number): number {
  return linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
}

// Use the angular form of the published GGX normal-distribution function.
// These cases keep the product's denominator guard inactive.
function ggxDistribution(nDotH: number, alpha: number): number {
  const cos2 = nDotH ** 2;
  const sin2 = 1 - cos2;
  return alpha ** 2 / (Math.PI * (sin2 + alpha ** 2 * cos2) ** 2);
}

// G2 = 1 / (1 + Lambda(V) + Lambda(L)); visibility is G2 / (4 N.V N.L).
// Restrict the oracle to positive cosines, away from singularities and guards.
function correlatedSmithVisibility(nDotV: number, nDotL: number, alpha: number): number {
  const lambda = (cosine: number): number =>
    (Math.sqrt(1 + alpha ** 2 * Math.tan(Math.acos(cosine)) ** 2) - 1) / 2;
  const masking = 1 / (1 + lambda(nDotV) + lambda(nDotL));
  return masking / (4 * nDotV * nDotL);
}

describe("sRGB output transfer", () => {
  it("matches published transfer landmarks and both sides of the breakpoint", () => {
    const samples = [
      [0, 0],
      [0.001, 0.01292],
      [0.0031308, 0.040449936],
      [0.00313081, 0.040450034513345993],
      [0.18, 0.46135612950044164],
      [0.5, 0.7353569830524495],
      [1, 1],
    ];
    for (const [linear, expected] of samples) {
      expect(pbrLinearToSrgbChannel(linear!)).toBeCloseTo(expected!, 12);
    }
    expect(pbrLinearToSrgbChannel(-0.01)).toBe(0);

    for (let step = 0; step <= 255; step += 1) {
      const linear = step / 255;
      expect(pbrLinearToSrgbChannel(linear)).toBeCloseTo(srgbFromLinear(linear), 12);
    }
    expect(Math.abs(pbrLinearToSrgbChannel(0.0031308) - 0.0031308 ** (1 / 2.2))).toBeGreaterThan(0.02);
  });

  it("retains the sRGB branch constants in the output shader sources", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const library = readFileSync(join(here, "..", "..", "..", "packages", "rendering", "src", "ShaderLibrary.ts"), "utf8");
    const core = readFileSync(join(here, "..", "..", "..", "packages", "rendering", "src", "ShaderLibraryCore.ts"), "utf8");
    const combined = `${library}\n${core}`;
    expect((combined.match(/a3d\w*PbrEncodeOutput\(vec3 linearColor\)/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((combined.match(/clamped \* 12\.92/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((combined.match(/step\(vec3\(0\.0031308\), clamped\)/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((combined.match(/1\.055 \* pow\(clamped, vec3\(1\.0 \/ 2\.4\)\)/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(combined).not.toContain("1.0 / 2.2");
    expect(combined).not.toContain("1/2.2");
  });
});

describe("GGX distribution and correlated Smith visibility", () => {
  it("agrees with the published angular forms where numerical guards do not bind", () => {
    for (const roughness of [0.045, 0.06, 0.1, 0.25, 0.5, 0.8, 1]) {
      for (const nDotH of [0, 0.2, 0.5, 0.9]) {
        expect(pbrDistributionGgx(nDotH, roughness)).toBeCloseTo(ggxDistribution(nDotH, roughness ** 2), 10);
      }
      for (const [nDotV, nDotL] of [[0.2, 0.8], [0.6, 0.7], [1, 1]]) {
        expect(pbrGeometrySmithGgxCorrelated(nDotV!, nDotL!, roughness)).toBeCloseTo(
          correlatedSmithVisibility(nDotV!, nDotL!, roughness ** 2),
          10
        );
      }
    }
    // Hand-derived landmarks: alpha=1 gives D=1/pi and V=1/[2(N.V+N.L)].
    expect(pbrDistributionGgx(0.4, 1)).toBeCloseTo(1 / Math.PI, 12);
    expect(pbrDistributionGgx(0.5, 0.5)).toBeCloseTo(256 / (2401 * Math.PI), 12);
    expect(pbrDistributionGgx(1, 0.5)).toBeCloseTo(16 / Math.PI, 12);
    expect(pbrGeometrySmithGgxCorrelated(0.5, 0.75, 1)).toBeCloseTo(2 / 5, 12);
    expect(pbrGeometrySmithGgxCorrelated(0.6, 0.7, 0.5)).toBeCloseTo(
      pbrGeometrySmithGgxCorrelated(0.7, 0.6, 0.5),
      12
    );
  });

  it("preserves projected-area normalization away from the guarded sharp peak", () => {
    // Integral over the hemisphere: 2π ∫ D(cos θ) cos θ d(cos θ) = 1.
    const intervals = 10_000;
    for (const roughness of [0.25, 0.5, 1]) {
      let sum = 0;
      for (let i = 0; i <= intervals; i += 1) {
        const cosine = i / intervals;
        const weight = i === 0 || i === intervals ? 1 : i % 2 === 0 ? 2 : 4;
        sum += weight * pbrDistributionGgx(cosine, roughness) * cosine;
      }
      expect((2 * Math.PI * sum) / (3 * intervals)).toBeCloseTo(1, 5);
    }
  });

  it("holds subminimum roughness at the chosen finite floor", () => {
    expect(PBR_REFERENCE_MIN_ROUGHNESS).toBe(0.045);
    for (const roughness of [0, 0.01, 0.044]) {
      expect(pbrDistributionGgx(1, roughness)).toBe(pbrDistributionGgx(1, PBR_REFERENCE_MIN_ROUGHNESS));
      expect(pbrDistributionGgx(0.5, roughness)).toBe(pbrDistributionGgx(0.5, PBR_REFERENCE_MIN_ROUGHNESS));
      expect(pbrGeometrySmithGgxCorrelated(0.6, 0.7, roughness)).toBe(
        pbrGeometrySmithGgxCorrelated(0.6, 0.7, PBR_REFERENCE_MIN_ROUGHNESS)
      );
    }
    expect(Number.isFinite(pbrDistributionGgx(1, 0))).toBe(true);
    expect(pbrDistributionGgx(0.5, 0.046)).not.toBe(pbrDistributionGgx(0.5, PBR_REFERENCE_MIN_ROUGHNESS));
  });
});
