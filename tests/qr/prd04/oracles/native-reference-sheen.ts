/**
 * Independent binary64 reference for the scalar, unlayered sheen lobe.
 *
 * Sources and conventions:
 * - Conty Estevez and Kulla, "Production Friendly Microfacet Sheen BRDF",
 *   section 2, equation (2): the normalized sine-power normal distribution.
 *   https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_sheen.pdf
 * - Khronos KHR_materials_sheen, "Sheen", "Sheen visibility" and
 *   "Sheen layering": perceptual roughness maps to the paper's r via
 *   r = roughness², the alternative Ashikhmin/Premoze visibility, and the
 *   view-dependent directional-albedo convention. Those implementation notes
 *   explicitly warn that this visibility/layering combination can gain energy.
 *   https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_sheen
 * - The rendering equation for E(v) is the integral over incident directions
 *   of f(l,v) (n·l) dω_l with unit incident radiance. In particular, E is not
 *   divided by π, irradiance, or a prefiltered environment. A fitted IBL
 *   approximation, texture lookup, diffuse-irradiance convention, nonlinear
 *   color transform, or nonuniform environment is a different quantity.
 *
 * N, L and V are unit vectors in the upper hemisphere; H is normalize(L+V).
 * Every cosine below is dimensionless. The BRDF is D(H) * V(L,V), with unit
 * sheen color and no light cosine, Fresnel factor, base layer, energy clamp or
 * terminator adjustment. Callers apply color, incident radiance and n·l.
 *
 * At roughness 0 the NDF is a horizon delta distribution, not an ordinary
 * finite-valued function. This reference accepts [1e-4,1], rejecting 0 and
 * smaller values rather than silently choosing a renderer's roughness floor.
 * It also rejects the singular visibility at NoL = NoV = 0. None of these
 * rules asserts how the native shader treats its singular endpoints.
 */

const MIN_ROUGHNESS = 1e-4;
const TWO_PI = 2 * Math.PI;

function unitInterval(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be finite and in [0, 1]`);
  }
}

function checkRoughness(roughness: number): void {
  if (!Number.isFinite(roughness) || roughness < MIN_ROUGHNESS || roughness > 1) {
    throw new RangeError(`roughness must be finite and in [${MIN_ROUGHNESS}, 1]`);
  }
}

/** Charlie normal distribution. Arguments: NoH then perceptual roughness. */
export function dCharlie(noH: number, roughness: number): number {
  unitInterval("noH", noH);
  checkRoughness(roughness);
  if (noH === 1) return 0;
  const alpha = roughness * roughness;
  // log1p preserves sin²(theta) near the horizon, including tiny roughness.
  return (2 + 1 / alpha) / TWO_PI * Math.exp(Math.log1p(-noH * noH) / (2 * alpha));
}

/** Reciprocal Ashikhmin/Premoze visibility. Arguments: NoL then NoV. */
export function vNeubelt(noL: number, noV: number): number {
  unitInterval("noL", noL);
  unitInterval("noV", noV);
  if (noL === 0 && noV === 0) {
    throw new RangeError("visibility is singular when noL and noV are both zero");
  }
  // The symmetric expression below is nonnegative on the stated domain.
  const denominator = 4 * (noL + noV * (1 - noL));
  const result = 1 / denominator;
  if (!Number.isFinite(result)) throw new RangeError("visibility exceeds binary64 range");
  return result;
}

export interface SheenDirectInput {
  /** Cosine of the angle between the normal and incident direction, [0,1]. */
  readonly noL: number;
  /** Cosine of the angle between the normal and outgoing direction, [0,1]. */
  readonly noV: number;
  /** Cosine of the azimuthal separation of L and V, [-1,1]. */
  readonly cosDeltaPhi: number;
  /** Perceptual sheen roughness, [1e-4,1]. */
  readonly roughness: number;
}

/** Unit-color BRDF value f(L,V), in inverse steradians; excludes NoL. */
export function sheenDirect({ noL, noV, cosDeltaPhi, roughness }: SheenDirectInput): number {
  unitInterval("noL", noL);
  unitInterval("noV", noV);
  checkRoughness(roughness);
  if (!Number.isFinite(cosDeltaPhi) || cosDeltaPhi < -1 || cosDeltaPhi > 1) {
    throw new RangeError("cosDeltaPhi must be finite and in [-1, 1]");
  }
  if (noL === 0 && noV === 0) {
    throw new RangeError("direct sheen is singular when noL and noV are both zero");
  }
  // L+V in a frame with V's azimuth zero. hypot avoids cancellation in
  // sqrt(2 + 2 dot(L,V)) for almost-opposite grazing directions.
  const sinL = Math.sqrt((1 - noL) * (1 + noL));
  const sinV = Math.sqrt((1 - noV) * (1 + noV));
  const sumLength = Math.hypot(
    sinV + sinL * cosDeltaPhi,
    sinL * Math.sqrt((1 - cosDeltaPhi) * (1 + cosDeltaPhi)),
    noL + noV,
  );
  const noH = (noL + noV) / sumLength;
  return dCharlie(Math.min(1, noH), roughness) * vNeubelt(noL, noV);
}

interface Quadrature {
  readonly nodes: Float64Array;
  readonly weights: Float64Array;
}

const quadratureCache = new Map<number, Quadrature>();

/** Gauss-Legendre nodes and weights on [0,1], generated in binary64. */
function gaussLegendre(order: number): Quadrature {
  const cached = quadratureCache.get(order);
  if (cached) return cached;
  const nodes = new Float64Array(order);
  const weights = new Float64Array(order);
  for (let i = 0; i < Math.ceil(order / 2); i++) {
    let root = Math.cos(Math.PI * (i + 0.75) / (order + 0.5));
    let derivative = 0;
    for (let iteration = 0; iteration < 64; iteration++) {
      let previous = 1;
      let current = root;
      for (let degree = 2; degree <= order; degree++) {
        const next = ((2 * degree - 1) * root * current - (degree - 1) * previous) / degree;
        previous = current;
        current = next;
      }
      derivative = order * (root * current - previous) / (root * root - 1);
      const nextRoot = root - current / derivative;
      if (Math.abs(nextRoot - root) <= 2e-15) {
        root = nextRoot;
        break;
      }
      root = nextRoot;
      if (iteration === 63) throw new Error("Gauss-Legendre nodes failed to converge");
    }
    // The [0,1] weights include the change of interval from [-1,1].
    const weight = 1 / ((1 - root * root) * derivative * derivative);
    nodes[i] = (1 - root) / 2;
    nodes[order - 1 - i] = (1 + root) / 2;
    weights[i] = weight;
    weights[order - 1 - i] = weight;
  }
  const quadrature = { nodes, weights };
  quadratureCache.set(order, quadrature);
  return quadrature;
}

export interface SheenIntegrationOptions {
  /** Gauss-Legendre points per dimension, integer [16,512]; default 128. */
  readonly order?: number;
}

/**
 * Unit-white directional-hemispherical BRDF integral E(NoV, roughness).
 * NoV is the outgoing cosine; roughness is perceptual. All calculations are
 * deterministic binary64. The calculation changes variables from incident
 * direction l to half-vector h, with dω_l = 4(v·h)dω_h, and integrates h's
 * height and azimuth by product Gauss-Legendre quadrature. The valid-reflection
 * boundary is solved analytically; an endpoint-clustering height mapping
 * smooths each boundary and resolves near-grazing boundary layers.
 *
 * For r < 1/12, the height interval is truncated at 12*r, where the omitted
 * absolute contribution is below 5e-29 on the documented roughness domain:
 * D(z) <= (2+1/r²)/(2π) exp(-z²/(2r²)) and the remaining geometric factor is
 * at most one. This is an integration approximation, not a shader convention.
 * Convergence is a posteriori: callers needing stronger guarantees should
 * compare results at increasing orders for their particular sample domain.
 */
export function iblSheenBRDF(noV: number, roughness: number, options: SheenIntegrationOptions = {}): number {
  unitInterval("noV", noV);
  checkRoughness(roughness);
  const order = options.order ?? 128;
  if (!Number.isInteger(order) || order < 16 || order > 512) {
    throw new RangeError("quadrature order must be an integer in [16, 512]");
  }
  const { nodes, weights } = gaussLegendre(order);
  const sinV = Math.sqrt((1 - noV) * (1 + noV));
  // Lower height at which a reflected L can reach the upper hemisphere.
  const lower = noV / Math.sqrt(2 * (1 + sinV));
  // Above this height the full azimuth is valid; below it the arc is clipped.
  const fullAzimuth = Math.sqrt((1 + sinV) / 2);
  const upper = Math.min(1, 12 * roughness);
  if (lower >= upper) return 0;

  const intervals: Array<readonly [number, number]> = [];
  if (fullAzimuth > lower && fullAzimuth < upper) {
    intervals.push([lower, fullAzimuth], [fullAzimuth, upper]);
  } else {
    intervals.push([lower, upper]);
  }
  const alpha = roughness * roughness;
  const distributionFactor = (2 + 1 / alpha) / TWO_PI;
  let total = 0;
  for (const [a, b] of intervals) {
    for (let i = 0; i < order; i++) {
      const x = nodes[i];
      const left = x ** 4;
      const right = (1 - x) ** 4;
      const sum = left + right;
      const z = a + (b - a) * left / sum;
      const dzdx = (b - a) * 4 * x ** 3 * (1 - x) ** 3 / (sum * sum);
      const sinH = Math.sqrt(Math.max(0, (1 - z) * (1 + z)));
      const distribution = distributionFactor * Math.exp(Math.log1p(-z * z) / (2 * alpha));
      let azimuthIntegral: number;
      if (noV === 0) {
        // Limit NoV -> 0: NoL / (NoL + NoV - NoL*NoV) -> 1.
        azimuthIntegral = 2 * sinH;
      } else if (noV === 1) {
        azimuthIntegral = TWO_PI * z * Math.max(0, 2 * z * z - 1);
      } else {
        const threshold = noV * (1 - 2 * z * z) / (2 * z * sinH * sinV);
        const phiMax = Math.acos(Math.max(-1, Math.min(1, threshold)));
        let partial = 0;
        for (let j = 0; j < order; j++) {
          // Cluster nodes at the clipped horizon, where the visibility ratio
          // changes rapidly as NoV approaches zero.
          const t = nodes[j];
          const phi = phiMax * (1 - t * t);
          const vDotH = noV * z + sinV * sinH * Math.cos(phi);
          const noL = Math.max(0, 2 * z * vDotH - noV);
          const visibilityDenominator = noL + noV * (1 - noL);
          partial += weights[j] * 2 * t * vDotH * noL / visibilityDenominator;
        }
        azimuthIntegral = 2 * phiMax * partial;
      }
      total += weights[i] * dzdx * distribution * azimuthIntegral;
    }
  }
  return total;
}
