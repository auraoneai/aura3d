/**
 * Double-precision CPU reference for an anisotropic GGX microfacet lobe.
 *
 * Physical source: Eric Heitz, "Understanding the Masking-Shadowing Function
 * in Microfacet-Based BRDFs" (JCGT 3(2), 2014), equations 80, 85, 86 and 99:
 * https://jcgt.org/published/0003/02/03/paper.pdf
 * Equation 85 is the anisotropic normal distribution, equation 86 is its
 * Smith Lambda, and equation 99 is the height-correlated joint G2. The
 * visibility below is V = G2 / (4 (n·l) (n·v)); it omits Fresnel and D.
 *
 * All directions are unit vectors supplied as scalar coordinates in the
 * same orthonormal (tangent, bitangent, normal) frame: (t, b, n), not angles
 * in radians. The normal is oriented toward the reflecting hemisphere.
 * Alpha values are dimensionless GGX slope parameters, not perceptual
 * roughness: in this lane the base alpha is perceptual roughness squared.
 *
 * The lane's independently specified strength mapping is
 * alphaT = alpha * (1 - strength²) + strength², alphaB = alpha. This mapping
 * is a material convention, not a consequence of Heitz's microfacet model.
 * For a half vector on the closed upper hemisphere, the distribution is
 * D = 1 / [π alphaT alphaB ((hT/alphaT)² + (hB/alphaB)² + hN²)²].
 * D is zero on the lower hemisphere; the grazing value is the upper limit.
 * V is zero when either direction is in the lower hemisphere; it uses the
 * continuous one-sided limit when only one direction lies on the horizon.
 * At two horizon directions V is singular and is rejected, rather than
 * inventing an epsilon or a nonphysical limiting value.
 *
 * Zero slope width is a delta distribution, so D and V require both alphas in
 * (0, 1]. If a mathematically valid result exceeds the largest JS number,
 * these evaluators throw instead of returning Infinity. Finite underflow to
 * zero is allowed. `anisotropyAlphaT` additionally accepts alpha = 0 so the
 * material mapping's smooth endpoint can be inspected independently.
 */

const UNIT_VECTOR_TOLERANCE = 1e-12;
const LOG_PI = Math.log(Math.PI);
const LOG_TWO = Math.log(2);

function assertUnitInterval(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be finite and in [0, 1]`);
  }
}

function assertSlopeAlpha(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new RangeError(`${label} must be finite and in (0, 1]`);
  }
}

function assertUnitDirection(t: number, b: number, n: number, label: string): void {
  if (!Number.isFinite(t) || !Number.isFinite(b) || !Number.isFinite(n) ||
      Math.abs(Math.hypot(t, b, n) - 1) > UNIT_VECTOR_TOLERANCE) {
    throw new RangeError(`${label} must be a finite unit tangent-frame direction`);
  }
}

function logAbs(value: number): number {
  return value === 0 ? -Infinity : Math.log(Math.abs(value));
}

// log(sqrt(exp(2x) + exp(2y) + exp(2z))) without overflowing
// or losing nonzero subnormal alpha values to intermediate multiplication.
function logHypot3(x: number, y: number, z: number): number {
  const largest = Math.max(x, y, z);
  if (largest === -Infinity) return -Infinity;
  return largest + 0.5 * Math.log(
    Math.exp(2 * (x - largest)) +
    Math.exp(2 * (y - largest)) +
    Math.exp(2 * (z - largest))
  );
}

function logSum2(x: number, y: number): number {
  if (x === -Infinity) return y;
  if (y === -Infinity) return x;
  const largest = Math.max(x, y);
  return largest + Math.log1p(Math.exp(Math.min(x, y) - largest));
}

function finiteExponential(logValue: number, label: string): number {
  const value = Math.exp(logValue);
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} exceeds the finite double-precision range`);
  }
  return value;
}

/** Map base alpha = roughness² and dimensionless strength in [0, 1] to alphaT. */
export function anisotropyAlphaT(alpha: number, strength: number): number {
  assertUnitInterval(alpha, "alpha");
  assertUnitInterval(strength, "strength");
  const strengthSquared = strength * strength;
  return alpha * (1 - strengthSquared) + strengthSquared;
}

/**
 * Evaluate the GGX normal distribution for unit half vector (hT, hB, hN).
 * Slope parameters alphaT and alphaB correspond to tangent and bitangent.
 */
export function dGGXAnisotropic(
  alphaT: number,
  alphaB: number,
  hT: number,
  hB: number,
  hN: number
): number {
  assertSlopeAlpha(alphaT, "alphaT");
  assertSlopeAlpha(alphaB, "alphaB");
  assertUnitDirection(hT, hB, hN, "half vector");
  if (hN < 0) return 0;

  const logAlphaT = Math.log(alphaT);
  const logAlphaB = Math.log(alphaB);
  const logScaledNorm = logHypot3(logAbs(hT) - logAlphaT, logAbs(hB) - logAlphaB, logAbs(hN));
  return finiteExponential(-LOG_PI - logAlphaT - logAlphaB - 4 * logScaledNorm, "D");
}

/**
 * Evaluate height-correlated Smith visibility for unit light direction
 * (lT, lB, lN), then unit view direction (vT, vB, vN). Both are outgoing from
 * the surface. The half-vector incidence indicators are assumed positive;
 * they are automatically positive for the reflection half vector of two
 * upper-hemisphere directions and are outside this factor's arguments.
 */
export function vGGXAnisotropic(
  alphaT: number,
  alphaB: number,
  lT: number,
  lB: number,
  lN: number,
  vT: number,
  vB: number,
  vN: number
): number {
  assertSlopeAlpha(alphaT, "alphaT");
  assertSlopeAlpha(alphaB, "alphaB");
  assertUnitDirection(lT, lB, lN, "light direction");
  assertUnitDirection(vT, vB, vN, "view direction");
  if (lN < 0 || vN < 0) return 0;
  if (lN === 0 && vN === 0) {
    throw new RangeError("visibility is singular when both directions are on the horizon");
  }

  // Algebraically eliminate divisions by n·l and n·v from
  // G2 = 1/(1 + Lambda(l) + Lambda(v)); see Heitz eqs. 80, 86, 99.
  const logAlphaT = Math.log(alphaT);
  const logAlphaB = Math.log(alphaB);
  const logLightNorm = logHypot3(logAbs(lT) + logAlphaT, logAbs(lB) + logAlphaB, logAbs(lN));
  const logViewNorm = logHypot3(logAbs(vT) + logAlphaT, logAbs(vB) + logAlphaB, logAbs(vN));
  const logDenominator = LOG_TWO + logSum2(logAbs(lN) + logViewNorm, logAbs(vN) + logLightNorm);
  return finiteExponential(-logDenominator, "visibility");
}
