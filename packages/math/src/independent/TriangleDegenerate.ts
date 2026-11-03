import { Vector3 } from "../Vector3.js";

// A normal result has the usual relative error bound for binary64 operations.
// Subnormal or nonfinite intermediate results take the exact path instead.
const MIN_NORMAL = 2 ** -1022;
const DETERMINANT_ERROR_FACTOR = 16 * Number.EPSILON;
const binary64 = new DataView(new ArrayBuffer(8));
const FRACTION_MASK = (1n << 52n) - 1n;
const HIDDEN_BIT = 1n << 52n;

function finiteVector(vector: Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function samePoint(a: Vector3, b: Vector3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function normalDifference(value: number, left: number, right: number): boolean {
  if (!Number.isFinite(value)) return false;
  return value === 0 ? left === right : Math.abs(value) >= MIN_NORMAL;
}

function normalProduct(value: number, left: number, right: number): boolean {
  if (!Number.isFinite(value)) return false;
  return value === 0 ? left === 0 || right === 0 : Math.abs(value) >= MIN_NORMAL;
}

/**
 * Certify a nonzero 2D determinant, or return false when rounding is uncertain.
 * Each product includes two rounded differences and a rounded multiplication.
 * The error budget also covers the final subtraction and rounding the bound.
 */
function certainlyNoncollinear(
  a0: number, a1: number, b0: number, b1: number, c0: number, c1: number
): boolean {
  const x0 = b0 - a0, x1 = b1 - a1;
  const y0 = c0 - a0, y1 = c1 - a1;
  if (!normalDifference(x0, b0, a0) || !normalDifference(x1, b1, a1)
      || !normalDifference(y0, c0, a0) || !normalDifference(y1, c1, a1)) return false;
  const first = x0 * y1, second = x1 * y0;
  if (!normalProduct(first, x0, y1) || !normalProduct(second, x1, y0)) return false;
  const determinant = first - second;
  const magnitude = Math.abs(first) + Math.abs(second);
  const errorBound = DETERMINANT_ERROR_FACTOR * magnitude;
  return Number.isFinite(determinant) && Math.abs(determinant) >= MIN_NORMAL
    && Number.isFinite(errorBound) && errorBound >= MIN_NORMAL
    && Math.abs(determinant) > errorBound;
}

/** A finite binary64 value as an integer in units of 2^-1074. */
function binary64Units(value: number): bigint {
  binary64.setFloat64(0, value, false);
  const bits = binary64.getBigUint64(0, false);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & FRACTION_MASK;
  const magnitude = exponent === 0 ? fraction : (HIDDEN_BIT | fraction) << BigInt(exponent - 1);
  return (bits >> 63n) === 0n ? magnitude : -magnitude;
}

type ExactVector = readonly [bigint, bigint, bigint];

function exactVector(vector: Vector3): ExactVector {
  return [binary64Units(vector.x), binary64Units(vector.y), binary64Units(vector.z)];
}

function collinearExactly(a: Vector3, b: Vector3, c: Vector3): boolean {
  const av = exactVector(a), bv = exactVector(b), cv = exactVector(c);
  const bx = bv[0] - av[0], by = bv[1] - av[1], bz = bv[2] - av[2];
  const cx = cv[0] - av[0], cy = cv[1] - av[1], cz = cv[2] - av[2];
  return bx * cy === by * cx && by * cz === bz * cy && bz * cx === bx * cz;
}

/** Round (numerator / denominator) * 2^-1074 to binary64, ties to even. */
function roundedUnits(numerator: bigint, denominator: bigint): number {
  if (numerator === 0n) return 0;
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  let shift = 0;

  // Above the subnormal range, successive binary64 values can be multiple
  // 2^-1074 units apart. Locate that spacing without converting BigInts to
  // Number, which could overflow before the ratio is formed.
  if (magnitude >= (denominator << 53n)) {
    let exponent = magnitude.toString(2).length - denominator.toString(2).length;
    if (magnitude < (denominator << BigInt(exponent))) exponent -= 1;
    shift = exponent - 52;
  }
  const divisor = denominator << BigInt(shift);
  let significand = magnitude / divisor;
  const remainder = magnitude % divisor;
  const twiceRemainder = remainder * 2n;
  if (twiceRemainder > divisor || (twiceRemainder === divisor && (significand & 1n) !== 0n)) significand += 1n;
  const result = Number(significand) * (2 ** (shift - 1074));
  return negative ? -result : result;
}

/**
 * Return the closest point on a finite, exactly collinear triangle, or
 * undefined when the caller should use its regular triangle calculation.
 */
export function closestPointOnDegenerateTriangle(a: Vector3, b: Vector3, c: Vector3, point: Vector3): Vector3 | undefined {
  if (!finiteVector(a) || !finiteVector(b) || !finiteVector(c) || !finiteVector(point)) return undefined;
  const abSame = samePoint(a, b), acSame = samePoint(a, c), bcSame = samePoint(b, c);
  if (abSame && acSame) return a;

  if (!abSame && !acSame && !bcSame) {
    if (certainlyNoncollinear(a.x, a.y, b.x, b.y, c.x, c.y)
        || certainlyNoncollinear(a.y, a.z, b.y, b.z, c.y, c.z)
        || certainlyNoncollinear(a.z, a.x, b.z, b.x, c.z, c.x)) return undefined;
    if (!collinearExactly(a, b, c)) return undefined;
  }

  // For collinear points, ordering on any varying axis selects the endpoints
  // of their convex hull, without subtracting potentially extreme coordinates.
  const axis = a.x !== b.x || a.x !== c.x ? "x" : a.y !== b.y || a.y !== c.y ? "y" : "z";
  let start = a, end = a;
  if (b[axis] < start[axis]) start = b;
  if (c[axis] < start[axis]) start = c;
  if (b[axis] > end[axis]) end = b;
  if (c[axis] > end[axis]) end = c;

  const u = exactVector(start), v = exactVector(end), p = exactVector(point);
  const dx = v[0] - u[0], dy = v[1] - u[1], dz = v[2] - u[2];
  const wx = p[0] - u[0], wy = p[1] - u[1], wz = p[2] - u[2];
  const denominator = dx * dx + dy * dy + dz * dz;
  const numerator = wx * dx + wy * dy + wz * dz;
  if (numerator <= 0n) return start;
  if (numerator >= denominator) return end;
  return new Vector3(
    roundedUnits(u[0] * denominator + dx * numerator, denominator),
    roundedUnits(u[1] * denominator + dy * numerator, denominator),
    roundedUnits(u[2] * denominator + dz * numerator, denominator)
  );
}

function subtractExact(a: ExactVector, b: ExactVector): ExactVector {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dotExact(a: ExactVector, b: ExactVector): bigint {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function crossExact(a: ExactVector, b: ExactVector): ExactVector {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function exactTriangleCross(a: Vector3, b: Vector3, c: Vector3): ExactVector {
  const origin = exactVector(a);
  return crossExact(subtractExact(exactVector(b), origin), subtractExact(exactVector(c), origin));
}

/** Floor the exact square root of a nonnegative integer. */
function integerSquareRoot(value: bigint): bigint {
  if (value < 2n) return value;
  let estimate = 1n << BigInt(Math.ceil(value.toString(2).length / 2));
  for (;;) {
    const next = (estimate + value / estimate) >> 1n;
    if (next >= estimate) return estimate;
    estimate = next;
  }
}

/** Round sqrt(squaredCross) * 2^-2149 to binary64, ties to even. */
function roundedArea(squaredCross: bigint): number {
  if (squaredCross === 0n) return 0;
  const exponent = Math.floor((squaredCross.toString(2).length - 1) / 2) - 2149;
  if (exponent > 1023) return Infinity;
  const spacingExponent = exponent >= -1022 ? exponent - 52 : -1074;
  const divisorShift = 2149 + spacingExponent;
  let significand = integerSquareRoot(squaredCross) >> BigInt(divisorShift);
  // Compare the exact square with the square of the halfway value. This also
  // handles subnormal ties without first rounding the length of the normal.
  const halfway = (2n * significand + 1n) << BigInt(divisorShift - 1);
  const halfwaySquared = halfway * halfway;
  if (squaredCross > halfwaySquared || (squaredCross === halfwaySquared && (significand & 1n) !== 0n)) significand += 1n;
  return Number(significand) * (2 ** spacingExponent);
}

/**
 * Return an exact-area fallback for finite triangles when the ordinary cross
 * product may overflow, underflow, or lose a determinant to cancellation.
 */
export function robustTriangleArea(a: Vector3, b: Vector3, c: Vector3): number | undefined {
  if (!finiteVector(a) || !finiteVector(b) || !finiteVector(c)) return undefined;
  const u = c.subtract(b), v = a.subtract(b);
  const inputs = [u.x, u.y, u.z, v.x, v.y, v.z];
  const left = [c.x, c.y, c.z, a.x, a.y, a.z];
  const right = [b.x, b.y, b.z, b.x, b.y, b.z];
  let needsExact = inputs.some((value, index) => !normalDifference(value, left[index]!, right[index]!));
  const factors: readonly [number, number, number, number][] = [
    [u.y, v.z, u.z, v.y], [u.z, v.x, u.x, v.z], [u.x, v.y, u.y, v.x]
  ];
  if (!needsExact) {
    const cross: number[] = [];
    for (const [x0, y0, x1, y1] of factors) {
      const first = x0 * y0, second = x1 * y1;
      const determinant = first - second, magnitude = Math.abs(first) + Math.abs(second);
      if (!normalProduct(first, x0, y0) || !normalProduct(second, x1, y1)
          || !Number.isFinite(determinant) || !Number.isFinite(magnitude)
          || (magnitude !== 0 && Math.abs(determinant) <= DETERMINANT_ERROR_FACTOR * magnitude)
          || (determinant !== 0 && Math.abs(determinant) < MIN_NORMAL)) {
        needsExact = true;
        break;
      }
      cross.push(determinant);
    }
    if (!needsExact) {
      const length = Math.hypot(cross[0]!, cross[1]!, cross[2]!);
      const area = length * 0.5;
      if (!Number.isFinite(length) || (area !== 0 && area < MIN_NORMAL) || (length !== 0 && area === 0)) needsExact = true;
    }
  }
  if (!needsExact) return undefined;
  const cross = exactTriangleCross(a, b, c);
  return roundedArea(dotExact(cross, cross));
}

/** Finite-input facing test, with an exact sign when scaling is inconclusive. */
export function robustTriangleFrontFacing(a: Vector3, b: Vector3, c: Vector3, direction: Vector3): boolean | undefined {
  if (!finiteVector(a) || !finiteVector(b) || !finiteVector(c) || !finiteVector(direction)) return undefined;
  const u = b.subtract(a), v = c.subtract(a);
  function normalize(vector: Vector3): Vector3 | undefined {
    const maximum = Math.max(Math.abs(vector.x), Math.abs(vector.y), Math.abs(vector.z));
    if (!Number.isFinite(maximum)) return undefined;
    if (maximum === 0) return vector;
    const scale = 2 ** Math.min(1023, Math.floor(Math.log2(maximum)));
    const x = vector.x / scale, y = vector.y / scale, z = vector.z / scale;
    if ((vector.x !== 0 && Math.abs(x) < MIN_NORMAL) || (vector.y !== 0 && Math.abs(y) < MIN_NORMAL)
        || (vector.z !== 0 && Math.abs(z) < MIN_NORMAL)) return undefined;
    return new Vector3(x, y, z);
  }
  const su = normalize(u), sv = normalize(v), sd = normalize(direction);
  if (su && sv && sd) {
    const signedVolume = su.cross(sv).dot(sd);
    // Normalized components have magnitude below two; this margin exceeds
    // accumulated rounding error even after the two rounded differences.
    if (Math.abs(signedVolume) > 2 ** -38) return signedVolume < 0;
  }
  return dotExact(exactTriangleCross(a, b, c), exactVector(direction)) < 0n;
}

type SegmentCandidate = {
  start: Vector3;
  end: Vector3;
  origin: ExactVector;
  direction: ExactVector;
  parameter: bigint;
  denominator: bigint;
  distanceNumerator: bigint;
  distanceDenominator: bigint;
};

/** Project onto a segment, keeping both its parameter and distance rational. */
function segmentCandidate(start: Vector3, end: Vector3, query: ExactVector): SegmentCandidate {
  const origin = exactVector(start), destination = exactVector(end);
  const direction = subtractExact(destination, origin), offset = subtractExact(query, origin);
  const lengthSquared = dotExact(direction, direction);
  const projection = dotExact(offset, direction);
  if (lengthSquared === 0n || projection <= 0n) {
    return { start, end, origin, direction, parameter: 0n, denominator: 1n,
      distanceNumerator: dotExact(offset, offset), distanceDenominator: 1n };
  }
  if (projection >= lengthSquared) {
    const fromEnd = subtractExact(query, destination);
    return { start, end, origin, direction, parameter: 1n, denominator: 1n,
      distanceNumerator: dotExact(fromEnd, fromEnd), distanceDenominator: 1n };
  }
  return { start, end, origin, direction, parameter: projection, denominator: lengthSquared,
    distanceNumerator: dotExact(offset, offset) * lengthSquared - projection * projection,
    distanceDenominator: lengthSquared };
}

/**
 * Exact fallback for finite triangles. The input doubles are dyadic rationals,
 * so all region tests and squared-distance comparisons can use integers. The
 * returned coordinates are rounded only after forming the full rational point.
 */
export function closestPointOnFiniteTriangle(a: Vector3, b: Vector3, c: Vector3, point: Vector3): Vector3 | undefined {
  if (!finiteVector(a) || !finiteVector(b) || !finiteVector(c) || !finiteVector(point)) return undefined;
  const origin = exactVector(a), query = exactVector(point);
  const u = subtractExact(exactVector(b), origin), v = subtractExact(exactVector(c), origin);
  const w = subtractExact(query, origin);
  const uu = dotExact(u, u), uv = dotExact(u, v), vv = dotExact(v, v);
  const denominator = uu * vv - uv * uv;
  if (denominator === 0n) return closestPointOnDegenerateTriangle(a, b, c, point);

  const wu = dotExact(w, u), wv = dotExact(w, v);
  const bWeight = wu * vv - wv * uv;
  const cWeight = wv * uu - wu * uv;
  if (bWeight >= 0n && cWeight >= 0n && bWeight + cWeight <= denominator) {
    return new Vector3(
      roundedUnits(origin[0] * denominator + u[0] * bWeight + v[0] * cWeight, denominator),
      roundedUnits(origin[1] * denominator + u[1] * bWeight + v[1] * cWeight, denominator),
      roundedUnits(origin[2] * denominator + u[2] * bWeight + v[2] * cWeight, denominator)
    );
  }

  // If the orthogonal plane projection lies outside the face, the closest
  // point lies on one of the three closed edges. Compare rational distances
  // without converting them to Number, which could overflow or cancel.
  let best = segmentCandidate(a, b, query);
  for (const candidate of [segmentCandidate(b, c, query), segmentCandidate(c, a, query)]) {
    if (candidate.distanceNumerator * best.distanceDenominator
        < best.distanceNumerator * candidate.distanceDenominator) best = candidate;
  }
  if (best.parameter === 0n) return best.start;
  if (best.parameter === best.denominator) return best.end;
  return new Vector3(
    roundedUnits(best.origin[0] * best.denominator + best.direction[0] * best.parameter, best.denominator),
    roundedUnits(best.origin[1] * best.denominator + best.direction[1] * best.parameter, best.denominator),
    roundedUnits(best.origin[2] * best.denominator + best.direction[2] * best.parameter, best.denominator)
  );
}
