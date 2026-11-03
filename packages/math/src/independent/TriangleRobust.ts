import { Vector3 } from "../Vector3.js";

// These bounds select an exact calculation; they do not classify geometry as
// degenerate. Ordinary triangles remain on the existing floating-point path.
const SCALE_MIN = 2 ** -128;
const SCALE_MAX = 2 ** 128;
const ASPECT_SQUARED_MIN = 2 ** -256;
const ANGLE_SQUARED_MIN = 2 ** -40;
const fractionMask = (1n << 52n) - 1n;
const hiddenBit = 1n << 52n;
const binary = new DataView(new ArrayBuffer(8));

function finite(vector: Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

/** Select exact arithmetic for extreme scales or an ill-conditioned basis. */
function needsExact(a: Vector3, b: Vector3, c: Vector3, point?: Vector3): boolean {
  let ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  let vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  const scale = Math.max(Math.abs(ux), Math.abs(uy), Math.abs(uz), Math.abs(vx), Math.abs(vy), Math.abs(vz));
  if (!Number.isFinite(scale) || scale < SCALE_MIN || scale > SCALE_MAX) return true;

  ux /= scale; uy /= scale; uz /= scale;
  vx /= scale; vy /= scale; vz /= scale;
  const uu = ux * ux + uy * uy + uz * uz;
  const vv = vx * vx + vy * vy + vz * vz;
  if (uu < ASPECT_SQUARED_MIN || vv < ASPECT_SQUARED_MIN) return true;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  if (nx * nx + ny * ny + nz * nz <= uu * vv * ANGLE_SQUARED_MIN) return true;

  if (point) {
    const wx = point.x - a.x, wy = point.y - a.y, wz = point.z - a.z;
    const pointScale = Math.max(Math.abs(wx), Math.abs(wy), Math.abs(wz));
    if (!Number.isFinite(pointScale) || pointScale > SCALE_MAX || (pointScale !== 0 && pointScale < SCALE_MIN)) return true;
  }
  return false;
}

/** Decode a finite binary64 number into integer multiples of 2^-1074. */
function units(value: number): bigint {
  binary.setFloat64(0, value, false);
  const bits = binary.getBigUint64(0, false);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & fractionMask;
  const magnitude = exponent === 0 ? fraction : (hiddenBit | fraction) << BigInt(exponent - 1);
  return (bits >> 63n) === 0n ? magnitude : -magnitude;
}

type ExactVector = readonly [bigint, bigint, bigint];

function exact(vector: Vector3): ExactVector {
  return [units(vector.x), units(vector.y), units(vector.z)];
}

function difference(left: ExactVector, right: ExactVector): ExactVector {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: ExactVector, right: ExactVector): bigint {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

/** Round an exact signed rational to binary64, including ties and subnormals. */
function roundedRatio(numerator: bigint, denominator: bigint): number {
  if (numerator === 0n) return 0;
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  let exponent = magnitude.toString(2).length - denominator.toString(2).length;
  if (exponent >= 0) {
    if (magnitude < (denominator << BigInt(exponent))) exponent -= 1;
  } else if ((magnitude << BigInt(-exponent)) < denominator) {
    exponent -= 1;
  }
  if (exponent > 1023) return negative ? -Infinity : Infinity;

  const shift = exponent >= -1022 ? exponent - 52 : -1074;
  const scaledNumerator = shift < 0 ? magnitude << BigInt(-shift) : magnitude;
  const scaledDenominator = shift > 0 ? denominator << BigInt(shift) : denominator;
  let significand = scaledNumerator / scaledDenominator;
  const remainder = scaledNumerator % scaledDenominator;
  const twiceRemainder = remainder * 2n;
  if (twiceRemainder > scaledDenominator || (twiceRemainder === scaledDenominator && (significand & 1n) !== 0n)) significand += 1n;
  const result = Number(significand) * (2 ** shift);
  return negative ? -result : result;
}

/**
 * Exact-dyadic barycentrics of the orthogonal projection. Undefined means the
 * existing calculation owns this input; null means exact zero triangle area.
 */
export function robustTriangleBarycoord(point: Vector3, a: Vector3, b: Vector3, c: Vector3): Vector3 | null | undefined {
  if (!finite(a) || !finite(b) || !finite(c) || !finite(point) || !needsExact(a, b, c, point)) return undefined;
  const origin = exact(a);
  const u = difference(exact(b), origin), v = difference(exact(c), origin), w = difference(exact(point), origin);
  const uu = dot(u, u), uv = dot(u, v), vv = dot(v, v);
  const denominator = uu * vv - uv * uv;
  if (denominator === 0n) return null;
  const wu = dot(w, u), wv = dot(w, v);
  const bWeight = wu * vv - wv * uv;
  const cWeight = wv * uu - wu * uv;
  return new Vector3(
    roundedRatio(denominator - bWeight - cWeight, denominator),
    roundedRatio(bWeight, denominator),
    roundedRatio(cWeight, denominator)
  );
}

/** Exact cross-product direction for finite triangles selected by the filter. */
export function robustTriangleNormal(a: Vector3, b: Vector3, c: Vector3): Vector3 | undefined {
  if (!finite(a) || !finite(b) || !finite(c) || !needsExact(a, b, c)) return undefined;
  const origin = exact(a);
  const u = difference(exact(b), origin), v = difference(exact(c), origin);
  const x = u[1] * v[2] - u[2] * v[1];
  const y = u[2] * v[0] - u[0] * v[2];
  const z = u[0] * v[1] - u[1] * v[0];
  const ax = x < 0n ? -x : x, ay = y < 0n ? -y : y, az = z < 0n ? -z : z;
  const max = ax > ay ? (ax > az ? ax : az) : (ay > az ? ay : az);
  if (max === 0n) return new Vector3(0, 0, 0);
  const sx = roundedRatio(x, max), sy = roundedRatio(y, max), sz = roundedRatio(z, max);
  const length = Math.hypot(sx, sy, sz);
  return new Vector3(sx / length, sy / length, sz / length);
}
