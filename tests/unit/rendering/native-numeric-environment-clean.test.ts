import { describe, expect, it } from "vitest";
import {
  brdfGGXMultiscatter,
  computeSpecularOcclusion,
  environmentBRDF,
  multiscatteringMulti,
  multiscatteringSingle,
  type EnvironmentBasis
} from "../../qr/prd04/oracles/native-reference-environment-clean.js";

/**
 * Independent light-space midpoint integral of D*G*F/(4*N.V), against which
 * the reference's transformed half-vector quadrature can be checked. This
 * integrates the physical light hemisphere directly, with no change of
 * variables or importance distribution and no renderer or fixture inputs.
 */
function integrateLightHemisphere(
  nDotV: number,
  roughness: number,
  polarCount: number,
  azimuthCount: number,
  visibility: (x: number, y: number, z: number) => number = () => 1
): EnvironmentBasis {
  const alpha = roughness * roughness;
  const alphaSquared = alpha * alpha;
  const viewX = Math.sqrt(1 - nDotV * nDotV);
  const lambda = (mu: number): number =>
    (Math.sqrt(1 + alphaSquared * (1 - mu * mu) / (mu * mu)) - 1) / 2;
  let a = 0;
  let b = 0;
  for (let i = 0; i < polarCount; i += 1) {
    const lightZ = (i + 0.5) / polarCount;
    const lightRadius = Math.sqrt(1 - lightZ * lightZ);
    for (let j = 0; j < azimuthCount; j += 1) {
      const phi = 2 * Math.PI * (j + 0.5) / azimuthCount;
      const lightX = lightRadius * Math.cos(phi);
      const lightY = lightRadius * Math.sin(phi);
      const viewDotLight = viewX * lightX + nDotV * lightZ;
      const halfLength = Math.sqrt(2 * (1 + viewDotLight));
      const nDotH = (nDotV + lightZ) / halfLength;
      const vDotH = (1 + viewDotLight) / halfLength;
      const dDenominator = 1 - nDotH * nDotH + alphaSquared * nDotH * nDotH;
      const distribution = alphaSquared / (Math.PI * dDenominator * dDenominator);
      const geometry = 1 / (1 + lambda(nDotV) + lambda(lightZ));
      const fresnel90 = (1 - vDotH) ** 5;
      const weight = distribution * geometry * visibility(lightX, lightY, lightZ);
      a += weight * (1 - fresnel90);
      b += weight * fresnel90;
    }
  }
  const solidAngle = 2 * Math.PI / (polarCount * azimuthCount);
  return { f0: a * solidAngle / (4 * nDotV), f90: b * solidAngle / (4 * nDotV) };
}

const energy = (basis: EnvironmentBasis): number => basis.f0 + basis.f90;

describe("clean-room GGX environment reference", () => {
  it("matches independently integrated light directions and converges as the grid is refined", () => {
    const nDotV = 0.58;
    const roughness = 0.63;
    const lightIntegral = integrateLightHemisphere(nDotV, roughness, 512, 1024);
    const coarse = environmentBRDF(nDotV, roughness, { polarSamples: 24, azimuthSamples: 48 });
    const medium = environmentBRDF(nDotV, roughness, { polarSamples: 96, azimuthSamples: 192 });
    const fine = environmentBRDF(nDotV, roughness, { polarSamples: 384, azimuthSamples: 768 });

    expect(Math.abs(fine.f0 - lightIntegral.f0)).toBeLessThan(4e-6);
    expect(Math.abs(fine.f90 - lightIntegral.f90)).toBeLessThan(1e-6);
    expect(Math.abs(medium.f0 - lightIntegral.f0)).toBeLessThan(Math.abs(coarse.f0 - lightIntegral.f0));
    expect(Math.abs(fine.f0 - lightIntegral.f0)).toBeLessThan(Math.abs(medium.f0 - lightIntegral.f0));
    expect(fine.f0).toBeGreaterThan(0);
    expect(fine.f90).toBeGreaterThan(0);
    expect(energy(fine)).toBeLessThan(1);
  });

  it("reaches the analytic normal-view, fully rough reflectance for a perfect reflector", () => {
    // N.V=1, alpha=1 gives D=1/pi and G=2*mu/(1+mu).
    // E = integral_0^1 mu/(1+mu) dmu = 1-ln(2).
    const basis = environmentBRDF(1, 1, { polarSamples: 24, azimuthSamples: 48 });
    expect(energy(basis)).toBeCloseTo(1 - Math.log(2), 11);
    expect(multiscatteringSingle(basis, 1, 1)).toBeCloseTo(1 - Math.log(2), 11);
    expect(multiscatteringMulti(basis, 1, 1)).toBeCloseTo(Math.log(2), 11);
    expect(brdfGGXMultiscatter(basis, 1, 1)).toBeCloseTo(1, 12);
  });

  it("preserves Schlick basis, zero response, conservation and monotonicity", () => {
    for (const [nDotV, roughness] of [[1, 1], [0.58, 0.63], [0.2, 0.2], [0.5, 0.01]]) {
      const basis = environmentBRDF(nDotV, roughness, { polarSamples: 192, azimuthSamples: 384 });
      expect(multiscatteringSingle(basis, 1, 0)).toBe(basis.f0);
      expect(multiscatteringSingle(basis, 0, 1)).toBe(basis.f90);
      expect(brdfGGXMultiscatter(basis, 0, 0)).toBe(0);
      expect(multiscatteringMulti(basis, 1, 1)).toBeCloseTo(1 - energy(basis), 12);
      expect(brdfGGXMultiscatter(basis, 1, 1)).toBeCloseTo(1, 12);

      const single = multiscatteringSingle(basis, 0.04, 1);
      const multiple = multiscatteringMulti(basis, 0.04, 1);
      const total = brdfGGXMultiscatter(basis, 0.04, 1);
      expect(single).toBeGreaterThan(0);
      expect(multiple).toBeGreaterThanOrEqual(0);
      expect(total).toBeCloseTo(single + multiple, 14);
      expect(total).toBeLessThanOrEqual(1);
      expect(brdfGGXMultiscatter(basis, 0.4, 1)).toBeGreaterThanOrEqual(total);
    }
  });

  it("matches a separately summed uniform-redistribution bounce series", () => {
    const basis = environmentBRDF(0.58, 0.63, { polarSamples: 192, azimuthSamples: 384 });
    const f0 = 0.08;
    const f90 = 0.7;
    // Integrate F(mu) * 2mu numerically instead of using the closed Favg.
    let averageFresnel = 0;
    const steps = 16_384;
    for (let i = 0; i < steps; i += 1) {
      const mu = (i + 0.5) / steps;
      const t = (1 - mu) ** 5;
      averageFresnel += 2 * mu * (f0 * (1 - t) + f90 * t) / steps;
    }
    const bounceFraction = (1 - energy(basis)) * averageFresnel;
    const initial = multiscatteringSingle(basis, f0, f90);
    let expected = 0;
    let bounce = initial;
    for (let i = 0; i < 64; i += 1) {
      bounce *= bounceFraction;
      expected += bounce;
    }
    expect(multiscatteringMulti(basis, f0, f90)).toBeCloseTo(expected, 10);
  });

  it("approaches the smooth-surface Fresnel value at a fixed view angle", () => {
    const nDotV = 0.5;
    const basis = environmentBRDF(nDotV, 0.01, { polarSamples: 192, azimuthSamples: 384 });
    const fresnelGrazingWeight = (1 - nDotV) ** 5;
    expect(basis.f0).toBeCloseTo(1 - fresnelGrazingWeight, 6);
    expect(basis.f90).toBeCloseTo(fresnelGrazingWeight, 6);
  });

  it("does not pretend the joint smooth and grazing limit has a single value", () => {
    // Approach (N.V, roughness)=(0,0) along N.V = k * roughness². Distinct
    // k yield visibly different energy, even though each sequence converges.
    const reflectance = (roughness: number, k: number): number => energy(environmentBRDF(
      k * roughness * roughness, roughness, { polarSamples: 192, azimuthSamples: 384 }
    ));
    const first = [reflectance(0.01, 1), reflectance(0.003, 1)];
    const second = [reflectance(0.01, 10), reflectance(0.003, 10)];
    expect(Math.abs(first[0] - first[1])).toBeLessThan(1e-5);
    expect(Math.abs(second[0] - second[1])).toBeLessThan(1e-5);
    expect(Math.abs(first[1] - second[1])).toBeGreaterThan(0.05);
  });

  it("weights directional visibility by the BRDF, with an analytic visibility case", () => {
    const options = { polarSamples: 96, azimuthSamples: 192 };
    expect(computeSpecularOcclusion(0.58, 0.63, 0.04, 1, () => 0, options)).toBe(0);
    expect(computeSpecularOcclusion(0.58, 0.63, 0.04, 1, () => 1, options)).toBeCloseTo(1, 14);
    expect(computeSpecularOcclusion(0.58, 0.63, 0.04, 1, () => 0.3, options)).toBeCloseTo(0.3, 12);
    expect(computeSpecularOcclusion(1, 0.7, 0.04, 1, ([x]) => x > 0 ? 1 : 0, options)).toBeCloseTo(0.5, 12);

    // With normal view and alpha=1, BRDF weight in mu is mu/(1+mu).
    // Visibility(mu)=mu has weighted mean (ln(2)-1/2)/(1-ln(2)).
    const analytic = (Math.log(2) - 0.5) / (1 - Math.log(2));
    expect(computeSpecularOcclusion(1, 1, 1, 1, ([, , z]) => z, options)).toBeCloseTo(analytic, 11);

    const lightAll = integrateLightHemisphere(0.58, 0.63, 512, 1024);
    const lightVisible = integrateLightHemisphere(0.58, 0.63, 512, 1024, (x, _y, z) => (1 + x) * z / 2);
    const expected = (0.04 * lightVisible.f0 + lightVisible.f90) / (0.04 * lightAll.f0 + lightAll.f90);
    const computed = computeSpecularOcclusion(0.58, 0.63, 0.04, 1, ([x, , z]) => (1 + x) * z / 2, {
      polarSamples: 384, azimuthSamples: 768
    });
    expect(Math.abs(computed - expected)).toBeLessThan(4e-6);
  });

  it("rejects singular, nonphysical and unresolved inputs rather than silently clamping", () => {
    for (const invalid of [0, -0.1, 1.01, Infinity, NaN]) {
      expect(() => environmentBRDF(invalid, 0.5)).toThrow(RangeError);
      expect(() => environmentBRDF(0.5, invalid)).toThrow(RangeError);
    }
    expect(() => environmentBRDF(0.5, Number.MIN_VALUE)).toThrow(/double-precision/);
    for (const invalid of [0, -1, 1.5, 4097, Infinity, NaN]) {
      expect(() => environmentBRDF(0.5, 0.5, { polarSamples: invalid })).toThrow(RangeError);
      expect(() => environmentBRDF(0.5, 0.5, { azimuthSamples: invalid })).toThrow(RangeError);
    }
    for (const invalid of [-0.1, 1.1, Infinity, NaN]) {
      expect(() => brdfGGXMultiscatter({ f0: 0.5, f90: 0.1 }, invalid, 1)).toThrow(RangeError);
      expect(() => brdfGGXMultiscatter({ f0: 0.5, f90: 0.1 }, 1, invalid)).toThrow(RangeError);
      expect(() => computeSpecularOcclusion(1, 1, 1, 1, () => invalid, {
        polarSamples: 4, azimuthSamples: 4
      })).toThrow(RangeError);
    }
    expect(() => computeSpecularOcclusion(1, 1, 0, 0, () => 1)).toThrow(/undefined/);
    expect(() => multiscatteringMulti({ f0: 0, f90: 0 }, 1, 1)).toThrow(/basis energy/);
    expect(() => multiscatteringMulti({ f0: 0.9, f90: 0.2 }, 1, 1)).toThrow(/basis energy/);
  });
});
