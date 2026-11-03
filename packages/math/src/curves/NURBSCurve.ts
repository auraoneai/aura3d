import { Vector3 } from "../Vector3.js";
import { CurveBase } from "./CurveBase.js";

/** A Cartesian control point and its rational weight, not a preweighted point. */
export interface RationalControlPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** A nonempty, ascending interval in the knot vector's native units. */
export type RationalParameterRange = readonly [number, number];

export interface NURBSCurveOptions {
  /** Optional clipping interval inside the active knot domain. */
  readonly range?: RationalParameterRange;
}

/** Internal representation shared by rational curves, surfaces and volumes. */
export interface RationalAxis {
  readonly degree: number;
  readonly knots: readonly number[];
  readonly count: number;
  readonly domain: RationalParameterRange;
  readonly range: RationalParameterRange;
}

type Homogeneous = [number, number, number, number];

/** @internal Validate one B-spline axis and snapshot its caller-owned data. */
export function createRationalAxis(
  degree: number,
  knots: readonly number[],
  count: number,
  range?: RationalParameterRange
): RationalAxis {
  if (!Number.isInteger(degree) || degree < 0 || degree >= count) {
    throw new RangeError("The degree must be a nonnegative integer smaller than the control point count.");
  }
  if (knots.length !== count + degree + 1) {
    throw new RangeError("A knot vector must have control point count + degree + 1 entries.");
  }
  const snapshot = Array.from(knots);
  let multiplicity = 0;
  for (let i = 0; i < snapshot.length; i += 1) {
    const knot = snapshot[i]!;
    if (!Number.isFinite(knot) || (i > 0 && knot < snapshot[i - 1]!)) {
      throw new RangeError("Knots must be finite and nondecreasing.");
    }
    multiplicity = i > 0 && knot === snapshot[i - 1] ? multiplicity + 1 : 1;
    if (multiplicity > degree + 1) {
      throw new RangeError("A knot cannot occur more than degree + 1 times.");
    }
  }
  const start = snapshot[degree]!;
  const end = snapshot[count]!;
  if (!(start < end) || !Number.isFinite(end - start)) {
    throw new RangeError("The active knot domain must have positive finite length.");
  }
  const min = range ? range[0] : start;
  const max = range ? range[1] : end;
  if ((range && range.length !== 2) || !Number.isFinite(min) || !Number.isFinite(max) || min < start || max > end || !(min < max)) {
    throw new RangeError("The clipping range must be a nonempty interval inside the active knot domain.");
  }
  return {
    degree,
    knots: Object.freeze(snapshot),
    count,
    domain: Object.freeze([start, end] as const),
    range: Object.freeze([min, max] as const)
  };
}

/** @internal Copy and validate points; weight zero and signed weights are allowed. */
export function copyRationalPoints(points: readonly RationalControlPoint[]): readonly RationalControlPoint[] {
  return Object.freeze(Array.from(points, (point) => {
    if (!point || ![point.x, point.y, point.z, point.w].every(Number.isFinite)) {
      throw new RangeError("Control point coordinates and weights must be finite.");
    }
    return Object.freeze({ x: point.x, y: point.y, z: point.z, w: point.w });
  }));
}

function checkOrder(order: number): void {
  // The bound controls the size of a tensor of mixed partials, rather than the
  // spline degree. Higher orders can be requested in a future chunked API.
  if (!Number.isInteger(order) || order < 0 || order > 16) {
    throw new RangeError("Derivative orders must be integers from 0 through 16.");
  }
}

/** @internal Basis derivatives with respect to the normalized parameter. */
function sampleAxis(axis: RationalAxis, t: number, order: number): number[][] {
  checkOrder(order);
  if (!Number.isFinite(t)) throw new RangeError("Parameters must be finite.");
  const { knots, degree, count, range } = axis;
  const clamped = Math.max(0, Math.min(1, t));
  const span = range[1] - range[0];
  const u = clamped === 1 ? range[1] : Math.min(range[1], range[0] + clamped * span);

  // Select a right-hand interval at interior knots. At the clipped endpoint,
  // evaluate the left-hand limit, including where it coincides with a knot.
  let interval = degree;
  if (u === range[1]) {
    interval = count - 1;
    while (interval > degree && knots[interval]! >= u) interval -= 1;
  } else {
    while (interval < count && knots[interval + 1]! <= u) interval += 1;
  }
  const baseLength = knots.length - 1;
  let previous: number[][] = Array.from({ length: order + 1 }, () => Array<number>(baseLength).fill(0));
  previous[0]![interval] = 1;
  for (let d = 1; d <= degree; d += 1) {
    const length = baseLength - d;
    const next = Array.from({ length: order + 1 }, () => Array<number>(length).fill(0));
    for (let i = 0; i < length; i += 1) {
      const left = knots[i + d]! - knots[i]!;
      const right = knots[i + d + 1]! - knots[i + 1]!;
      next[0]![i] = (left === 0 ? 0 : (u - knots[i]!) / left * previous[0]![i]!) +
        (right === 0 ? 0 : (knots[i + d + 1]! - u) / right * previous[0]![i + 1]!);
      for (let k = 1; k <= Math.min(order, d); k += 1) {
        const leftDerivative = previous[k - 1]![i]!;
        const rightDerivative = previous[k - 1]![i + 1]!;
        // Carry the chain-rule scale at each differentiation. Applying
        // span ** k afterward can form 0 * Infinity or Infinity * 0 even
        // when the normalized derivative is small and well-defined.
        next[k]![i] = (left === 0 || leftDerivative === 0 ? 0 : d * leftDerivative * (span / left)) -
          (right === 0 || rightDerivative === 0 ? 0 : d * rightDerivative * (span / right));
      }
    }
    previous = next;
  }
  return previous.map((row) => row.slice(0, count));
}

function binomial(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = result * (n - i + 1) / i;
  return result;
}

/**
 * @internal Evaluate the homogeneous tensor product and differentiate the
 * quotient, including mixed derivatives. The last control-net axis varies
 * fastest. A missing second or third axis has one constant basis function.
 */
export function evaluateRational(
  axes: readonly RationalAxis[],
  points: readonly RationalControlPoint[],
  parameters: readonly number[],
  orders: readonly number[]
): Vector3[][][] {
  const basis = axes.map((axis, i) => sampleAxis(axis, parameters[i]!, orders[i]!));
  while (basis.length < 3) basis.push([[1]]);
  const [bu, bv, bw] = basis as [number[][], number[][], number[][]];
  const nu = axes[0]!.count;
  const nv = axes[1]?.count ?? 1;
  const nw = axes[2]?.count ?? 1;
  const data: Homogeneous[][][] = Array.from({ length: bu.length }, () =>
    Array.from({ length: bv.length }, () => Array.from({ length: bw.length }, (): Homogeneous => [0, 0, 0, 0]))
  );
  // Homogeneous coordinates are invariant under a common weight scale.
  // Normalize by weights that actually contribute at this parameter so very
  // large or subnormal finite weights do not overflow or underflow otherwise
  // ordinary Cartesian points. Restricting the scale to active support also
  // preserves an endpoint whose adjacent weight has a very different scale.
  let weightScale = 0;
  for (let i = 0; i < nu; i += 1) for (let j = 0; j < nv; j += 1) for (let k = 0; k < nw; k += 1) {
    if (bu[0]![i] !== 0 && bv[0]![j] !== 0 && bw[0]![k] !== 0) {
      weightScale = Math.max(weightScale, Math.abs(points[(i * nv + j) * nw + k]!.w));
    }
  }
  if (weightScale === 0) {
    throw new RangeError("The rational denominator is zero or numerically singular at this parameter.");
  }
  // A contributing basis can itself be extremely small even when its weight
  // is large. Normalize its largest weighted contribution as well, before
  // multiplying by Cartesian coordinates.
  let contributionScale = 0;
  for (let i = 0; i < nu; i += 1) for (let j = 0; j < nv; j += 1) for (let k = 0; k < nw; k += 1) {
    const base = bu[0]![i]! * bv[0]![j]! * bw[0]![k]!;
    if (base !== 0) contributionScale = Math.max(contributionScale, Math.abs(base * (points[(i * nv + j) * nw + k]!.w / weightScale)));
  }
  if (contributionScale === 0 || !Number.isFinite(contributionScale)) {
    throw new RangeError("The rational denominator is zero or numerically singular at this parameter.");
  }
  const scaledFactor = (basisFactor: number, pointWeight: number): number => {
    if (basisFactor === 0 || pointWeight === 0) return 0;
    const scaledWeight = pointWeight / weightScale;
    const weightRatio = scaledWeight / contributionScale;
    if (Number.isFinite(weightRatio)) return basisFactor * weightRatio;
    const basisRatio = basisFactor / contributionScale;
    if (Number.isFinite(basisRatio)) return basisRatio * scaledWeight;
    return (basisFactor * scaledWeight) / contributionScale;
  };
  let absoluteWeight = 0;
  for (let i = 0; i < nu; i += 1) for (let j = 0; j < nv; j += 1) for (let k = 0; k < nw; k += 1) {
    const point = points[(i * nv + j) * nw + k]!;
    const base = bu[0]![i]! * bv[0]![j]! * bw[0]![k]!;
    absoluteWeight += Math.abs(scaledFactor(base, point.w));
    for (let a = 0; a < bu.length; a += 1) for (let b = 0; b < bv.length; b += 1) for (let c = 0; c < bw.length; c += 1) {
      const basisFactor = bu[a]![i]! * bv[b]![j]! * bw[c]![k]!;
      // Inactive points must not form 0 * Infinity when an adjacent active
      // weight is so small that their ratio exceeds the numeric range.
      if (basisFactor === 0 || point.w === 0) continue;
      const factor = scaledFactor(basisFactor, point.w);
      const sum = data[a]![b]![c]!;
      sum[0] += factor * point.x;
      sum[1] += factor * point.y;
      sum[2] += factor * point.z;
      sum[3] += factor;
    }
  }
  const weight = data[0]![0]![0]![3];
  if (!Number.isFinite(absoluteWeight) || !Number.isFinite(weight) || Math.abs(weight) <= Number.EPSILON * 16 * absoluteWeight) {
    throw new RangeError("The rational denominator is zero or numerically singular at this parameter.");
  }
  const result: Vector3[][][] = Array.from({ length: bu.length }, () =>
    Array.from({ length: bv.length }, () => Array<Vector3>(bw.length))
  );
  for (let a = 0; a < bu.length; a += 1) for (let b = 0; b < bv.length; b += 1) for (let c = 0; c < bw.length; c += 1) {
    const sum = data[a]![b]![c]!;
    let x = sum[0], y = sum[1], z = sum[2];
    for (let i = 0; i <= a; i += 1) for (let j = 0; j <= b; j += 1) for (let k = 0; k <= c; k += 1) {
      if (i === 0 && j === 0 && k === 0) continue;
      const scale = binomial(a, i) * binomial(b, j) * binomial(c, k) * data[i]![j]![k]![3];
      const prior = result[a - i]![b - j]![c - k]!;
      x -= scale * prior.x;
      y -= scale * prior.y;
      z -= scale * prior.z;
    }
    x /= weight; y /= weight; z /= weight;
    if (![x, y, z].every(Number.isFinite)) throw new RangeError("Rational evaluation exceeded finite numeric limits.");
    result[a]![b]![c] = new Vector3(x, y, z);
  }
  return result;
}

/**
 * A non-uniform rational B-spline curve in 3D. Parameters passed to `getPoint`
 * and its derivatives are normalized to [0, 1] and clamped; the optional
 * clipping range is expressed in knot units. Derivatives are with respect to
 * the normalized parameter, including the range's scale. Repeated knots use
 * right-hand derivatives, except at the range end, which uses the left.
 */
export class NURBSCurve extends CurveBase<Vector3> {
  readonly isNURBSCurve = true as const;
  readonly degree: number;
  readonly knots: readonly number[];
  readonly controlPoints: readonly RationalControlPoint[];
  readonly domain: RationalParameterRange;
  readonly range: RationalParameterRange;
  private readonly axis: RationalAxis;

  constructor(degree: number, knots: readonly number[], controlPoints: readonly RationalControlPoint[], options: NURBSCurveOptions = {}) {
    super();
    this.controlPoints = copyRationalPoints(controlPoints);
    this.axis = createRationalAxis(degree, knots, this.controlPoints.length, options.range);
    this.degree = degree;
    this.knots = this.axis.knots;
    this.domain = this.axis.domain;
    this.range = this.axis.range;
  }

  getPoint(t: number): Vector3 {
    return evaluateRational([this.axis], this.controlPoints, [t], [0])[0]![0]![0]!;
  }

  /** Returns [point, first derivative, ...] through order 16. */
  getDerivatives(t: number, order = 1): Vector3[] {
    return evaluateRational([this.axis], this.controlPoints, [t], [order]).map((d) => d[0]![0]!);
  }

  getDerivative(t: number): Vector3 {
    return this.getDerivatives(t, 1)[1]!;
  }

  getTangent(t: number): Vector3 {
    return this.getDerivative(t).normalize();
  }

  clone(): this {
    return new NURBSCurve(this.degree, this.knots, this.controlPoints, { range: this.range }) as this;
  }
}
