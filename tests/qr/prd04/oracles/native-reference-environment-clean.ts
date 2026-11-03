/**
 * Independent, double-precision reference for one explicitly specified model.
 * It is not connected to the native renderer and is not a claim of its behavior.
 *
 * Sources of the equations, not implementation listings:
 * - Heitz, "Understanding the Masking-Shadowing Function in Microfacet-Based
 *   BRDFs", JCGT 3(2), 2014, eqs. 71–72 and 99:
 *   https://jcgt.org/published/0003/02/03/paper.pdf
 * - Fdez-Aguera, "A Multiple-Scattering Microfacet Model for Real-Time Image
 *   Based Lighting", JCGT 8(1), 2019, eqs. 10–17:
 *   https://jcgt.org/published/0008/01/03/paper.pdf
 *
 * We choose isotropic GGX with alpha = perceptualRoughness^2, height-correlated
 * Smith masking, Schlick's F = F0 * (1-t) + F90 * t, t = (1 - V.H)^5, and a
 * spatially uniform unit-radiance environment. Fdez-Aguera uses F90=1;
 * arbitrary F90 and its average are the direct linear generalization here.
 * For N.V,N.L > 0 the model is
 * f_ss = D * G * F / (4 * (N.V) * (N.L)), with
 * D = alpha^2 / (pi * (1 - (N.H)^2 + alpha^2 * (N.H)^2)^2),
 * Lambda(mu) = (sqrt(1 + alpha^2 * (1-mu^2)/mu^2) - 1) / 2, and
 * G = 1 / (1 + Lambda(N.V) + Lambda(N.L)).
 *
 * The finite quadrature estimates the integral; it is not an error bound.
 * Increase both sample counts and check convergence for the chosen inputs.
 * Zero roughness and exactly grazing view are intentionally excluded: a delta
 * distribution and the simultaneous grazing/smooth limit require separate,
 * path-dependent treatment. F0/F90 are scalar channels in [0,1], not spectra.
 * The multiscattering closure below is a uniform-redistribution approximation,
 * not a full microscopic random walk, and the occlusion calculation needs an
 * explicitly provided directional visibility function. Neither establishes a
 * renderer's roughness remapping, lookup table, occlusion heuristic, or pixels.
 */

export interface EnvironmentQuadrature {
  /** Gauss-Legendre samples per nonempty interval of the half-vector polar CDF. */
  readonly polarSamples?: number;
  /** Equally spaced midpoint samples of half-vector azimuth. */
  readonly azimuthSamples?: number;
}

/** Coefficients A,B such that single-scattering reflectance is F0*A + F90*B. */
export interface EnvironmentBasis {
  readonly f0: number;
  readonly f90: number;
}

/** Unit light direction in the local frame: normal +Z and view in the XZ plane. */
export type EnvironmentLightDirection = readonly [number, number, number];

/** Visibility is a fraction in [0,1] for the direction from surface to light. */
export type DirectionalVisibility = (direction: EnvironmentLightDirection) => number;

const DEFAULT_SAMPLES = 256;
const MAX_SAMPLES = 4096;

function positiveUnitInterval(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new RangeError(`${name} must be finite and in (0, 1]`);
  }
}

function unitInterval(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be finite and in [0, 1]`);
  }
}

function samples(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SAMPLES) {
    throw new RangeError(`${name} must be an integer in [1, ${MAX_SAMPLES}]`);
  }
  return value;
}

interface QuadraturePoint {
  readonly position: number;
  readonly weight: number;
}

/** Gauss-Legendre abscissae and weights mapped from [-1,1] to [0,1]. */
function polarQuadrature(count: number): QuadraturePoint[] {
  const result: QuadraturePoint[] = new Array(count);
  for (let i = 0; i < Math.ceil(count / 2); i += 1) {
    let x = Math.cos(Math.PI * (i + 0.75) / (count + 0.5));
    let derivative = 0;
    let converged = false;
    for (let iteration = 0; iteration < 32; iteration += 1) {
      let previous = 1;
      let polynomial = x;
      for (let degree = 2; degree <= count; degree += 1) {
        const next = ((2 * degree - 1) * x * polynomial - (degree - 1) * previous) / degree;
        previous = polynomial;
        polynomial = next;
      }
      derivative = count * (x * polynomial - previous) / (x * x - 1);
      const step = polynomial / derivative;
      x -= step;
      if (Math.abs(step) < 1e-15) {
        converged = true;
        break;
      }
    }
    if (!converged) throw new RangeError("polar quadrature failed to converge");
    const weight = 1 / ((1 - x * x) * derivative * derivative);
    result[i] = { position: (1 - x) / 2, weight };
    result[count - 1 - i] = { position: (1 + x) / 2, weight };
  }
  return result;
}

function validateBasis(basis: EnvironmentBasis): number {
  unitInterval(basis.f0, "basis.f0");
  unitInterval(basis.f90, "basis.f90");
  const energy = basis.f0 + basis.f90;
  if (energy <= 0 || energy > 1) {
    throw new RangeError("basis energy must be in (0, 1]; increase quadrature resolution if needed");
  }
  return energy;
}

interface IntegratedBasis {
  readonly unoccluded: EnvironmentBasis;
  readonly visible: EnvironmentBasis;
}

function integrateBasis(
  nDotV: number,
  roughness: number,
  options: EnvironmentQuadrature,
  visibility?: DirectionalVisibility
): IntegratedBasis {
  positiveUnitInterval(nDotV, "nDotV");
  positiveUnitInterval(roughness, "roughness");
  const polarCount = samples(options.polarSamples ?? DEFAULT_SAMPLES, "polarSamples");
  const azimuthCount = samples(options.azimuthSamples ?? DEFAULT_SAMPLES, "azimuthSamples");
  const alpha = roughness * roughness;
  const alphaSquared = alpha * alpha;
  if (alphaSquared === 0) throw new RangeError("roughness is too small for double-precision quadrature");

  const viewX = Math.sqrt((1 - nDotV) * (1 + nDotV));
  const viewRoot = Math.hypot(nDotV, alpha * viewX);
  let a = 0;
  let b = 0;
  let visibleA = 0;
  let visibleB = 0;

  // Transform from light to half-vector: dω_L = 4(V.H) dω_H.
  // Sampling H with density D(H)(N.H) makes the remaining weight
  // G(V,L)(V.H)/((N.V)(N.H)). u is the analytic polar CDF of this density.
  // For a polar angle theta of H and view angle thetaV, the full azimuth is
  // visible until 2*theta + thetaV = pi/2; after 2*theta - thetaV = pi/2 none
  // is visible. Splitting at both corresponding CDF values avoids integrating
  // across the horizon's changes of branch. (1-viewX) is written as NV² /
  // (1+viewX) to avoid cancellation near grazing view.
  const minor = nDotV * nDotV / (2 * (1 + viewX));
  const major = (1 + viewX) / 2;
  const fullArcEnd = minor / (minor + alphaSquared * major);
  const partialArcEnd = major / (major + alphaSquared * minor);
  const intervals = [[0, fullArcEnd], [fullArcEnd, partialArcEnd]] as const;
  const points = polarQuadrature(polarCount);

  // For each polar sample, integrate exactly the azimuth arc where N.L > 0;
  // its midpoint sum avoids sampling a discontinuity at the horizon.
  for (const [start, end] of intervals) {
    const intervalWidth = end - start;
    if (intervalWidth <= 0) continue;
    for (const point of points) {
      const u = start + point.position * intervalWidth;
      const denominator = (1 - u) + alphaSquared * u;
      const hZ = Math.sqrt((1 - u) / denominator);
      const hRadius = alpha * Math.sqrt(u / denominator);
      const constantLightZ = nDotV * (2 * hZ * hZ - 1);
      const varyingLightZ = 2 * hZ * viewX * hRadius;
      let maxPhi: number;
      if (varyingLightZ === 0) {
        maxPhi = constantLightZ > 0 ? Math.PI : 0;
      } else {
        const boundary = -constantLightZ / varyingLightZ;
        maxPhi = boundary <= -1 ? Math.PI : boundary >= 1 ? 0 : Math.acos(boundary);
      }
      if (maxPhi === 0) continue;
      const sampleWeight = point.weight * intervalWidth * maxPhi / (Math.PI * azimuthCount);
      for (let j = 0; j < azimuthCount; j += 1) {
        const phi = maxPhi * (2 * (j + 0.5) / azimuthCount - 1);
        const hX = hRadius * Math.cos(phi);
        const hY = hRadius * Math.sin(phi);
        const vDotH = viewX * hX + nDotV * hZ;
        if (vDotH <= 0) continue;
        const lightZ = 2 * vDotH * hZ - nDotV;
        if (lightZ <= 0) continue;

        // Algebraically G = 2 NV NL / (NL*sqrt(NV²+alpha²(1-NV²))
        // + NV*sqrt(NL²+alpha²(1-NL²))), avoiding explicit Lambda(0).
        const lightSin = Math.sqrt(Math.max(0, (1 - lightZ) * (1 + lightZ)));
        const lightRoot = Math.hypot(lightZ, alpha * lightSin);
        const weight = (2 * lightZ * vDotH) / (hZ * (lightZ * viewRoot + nDotV * lightRoot));
        if (!Number.isFinite(weight)) throw new RangeError("quadrature lost double-precision range");
        const t = Math.max(0, 1 - vDotH) ** 5;
        const da = sampleWeight * weight * (1 - t);
        const db = sampleWeight * weight * t;
        a += da;
        b += db;
        if (visibility) {
          const light: EnvironmentLightDirection = [2 * vDotH * hX - viewX, 2 * vDotH * hY, lightZ];
          const visible = visibility(light);
          unitInterval(visible, "directional visibility");
          visibleA += da * visible;
          visibleB += db * visible;
        }
      }
    }
  }
  return {
    unoccluded: { f0: a, f90: b },
    visible: { f0: visibleA, f90: visibleB }
  };
}

/**
 * The two Schlick basis integrals for a constant unit environment; call once
 * per (N.V, roughness) and combine separately for each color channel.
 */
export function environmentBRDF(
  nDotV: number,
  roughness: number,
  options: EnvironmentQuadrature = {}
): EnvironmentBasis {
  return integrateBasis(nDotV, roughness, options).unoccluded;
}

/** Single-scattering directional hemispherical reflectance S = F0*A + F90*B. */
export function multiscatteringSingle(basis: EnvironmentBasis, f0: number, f90: number): number {
  validateBasis(basis);
  unitInterval(f0, "f0");
  unitInterval(f90, "f90");
  return f0 * basis.f0 + f90 * basis.f90;
}

/**
 * The chosen uniform-redistribution model: E=A+B,
 * Favg=(20*F0+F90)/21, M=S*(1-E)*Favg/(1-(1-E)*Favg).
 * Favg is the cosine-weighted hemispherical average of Schlick Fresnel.
 */
export function multiscatteringMulti(basis: EnvironmentBasis, f0: number, f90: number): number {
  const energy = validateBasis(basis);
  const single = multiscatteringSingle(basis, f0, f90);
  const fAverage = (20 * f0 + f90) / 21;
  // This equivalent denominator avoids cancellation when Favg is near one.
  const denominator = (1 - fAverage) + fAverage * energy;
  return single * (1 - energy) * fAverage / denominator;
}

/** Total single plus modelled multiple scattering under a unit environment. */
export function brdfGGXMultiscatter(basis: EnvironmentBasis, f0: number, f90: number): number {
  return multiscatteringSingle(basis, f0, f90) + multiscatteringMulti(basis, f0, f90);
}

/**
 * Single-scattering specular visibility multiplier: visible / unoccluded
 * BRDF-weighted incoming irradiance, where 0 means blocked and 1 means open.
 * It is defined for F0 or F90 > 0; both zero makes the ratio undefined.
 * A scalar diffuse AO value cannot supply the required directional information.
 * Multiple-scattering visibility is not included in this model.
 */
export function computeSpecularOcclusion(
  nDotV: number,
  roughness: number,
  f0: number,
  f90: number,
  visibility: DirectionalVisibility,
  options: EnvironmentQuadrature = {}
): number {
  unitInterval(f0, "f0");
  unitInterval(f90, "f90");
  if (f0 === 0 && f90 === 0) throw new RangeError("specular visibility is undefined for zero reflectance");
  if (typeof visibility !== "function") throw new TypeError("visibility must be a function");
  const integral = integrateBasis(nDotV, roughness, options, visibility);
  const unoccluded = f0 * integral.unoccluded.f0 + f90 * integral.unoccluded.f90;
  const visible = f0 * integral.visible.f0 + f90 * integral.visible.f90;
  if (!(unoccluded > 0) || !Number.isFinite(unoccluded)) {
    throw new RangeError("quadrature did not resolve a positive reflectance");
  }
  return visible / unoccluded;
}
