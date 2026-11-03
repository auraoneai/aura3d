import type { Collider } from "../Collider.js";
import type { Quat, RigidBody } from "../RigidBody.js";
import { Shape, rotateVec3ByQuat, validateFiniteVec3, type PlaneShape, type SphereShape, type Vec3 } from "../Shape.js";
import type { NativeCCDInterval } from "./NativeCCD.js";

/** A world-space constant-acceleration trajectory over one common interval. */
export interface NativeAcceleratedCCDMotion {
  readonly collider: Collider;
  readonly body: RigidBody;
  readonly velocity: Vec3;
  readonly acceleration: Vec3;
  readonly angularVelocity: Vec3;
  readonly angularAcceleration: Vec3;
}

export interface NativeAcceleratedCCDInterval extends NativeCCDInterval {
  /** Inclusive bounds on the entry fraction after outward floating-point rounding. */
  readonly entryBounds: readonly [number, number];
  /** Present for every finite exit, including instantaneous tangencies. */
  readonly exitNormal?: Vec3;
  readonly exitPoint?: Vec3;
  readonly exitBounds?: readonly [number, number];
}

export type NativeAcceleratedCCDResult =
  | { readonly kind: "separated" }
  | ({ readonly kind: "contact"; readonly intervals: readonly NativeAcceleratedCCDInterval[] } & NativeAcceleratedCCDInterval);

type V = [number, number, number];
type Dyadic = { readonly n: bigint; readonly e: number };
type Root = { readonly lo: bigint; readonly hi: bigint };
type Window = { readonly entry: Root; readonly exit?: Root | undefined };
type Motion = NativeAcceleratedCCDMotion;

const GRID_BITS = 64;
const GRID = 1n << BigInt(GRID_BITS);
const ZERO: Dyadic = { n: 0n, e: 0 };
const buffer = new DataView(new ArrayBuffer(8));

function finite(...values: number[]): void {
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Native accelerated CCD exceeds its numeric range.");
}

/** Exact dyadic value of one finite JavaScript number. */
function dyadic(value: number): Dyadic {
  finite(value);
  if (value === 0) return ZERO;
  buffer.setFloat64(0, value, false);
  const bits = buffer.getBigUint64(0, false), exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n), negative = (bits >> 63n) !== 0n;
  const significand = exponent === 0 ? fraction : (1n << 52n) + fraction;
  return { n: negative ? -significand : significand, e: exponent === 0 ? -1074 : exponent - 1075 };
}

function add(a: Dyadic, b: Dyadic): Dyadic {
  if (a.n === 0n) return b;
  if (b.n === 0n) return a;
  const e = Math.min(a.e, b.e);
  return { n: (a.n << BigInt(a.e - e)) + (b.n << BigInt(b.e - e)), e };
}
function neg(a: Dyadic): Dyadic { return { n: -a.n, e: a.e }; }
function sub(a: Dyadic, b: Dyadic): Dyadic { return add(a, neg(b)); }
function mul(a: Dyadic, b: Dyadic): Dyadic { return { n: a.n * b.n, e: a.e + b.e }; }
function times(a: Dyadic, n: number): Dyadic { return mul(a, dyadic(n)); }
function sign(a: Dyadic): number { return a.n < 0n ? -1 : a.n > 0n ? 1 : 0; }
function compare(a: Dyadic, b: Dyadic): number { return sign(sub(a, b)); }
function gridPoint(n: bigint): Dyadic { return { n, e: -GRID_BITS }; }
function evaluate(polynomial: readonly Dyadic[], x: Dyadic): Dyadic {
  let result = ZERO;
  for (let i = polynomial.length - 1; i >= 0; i--) result = add(mul(result, x), polynomial[i]!);
  return result;
}
function derivative(polynomial: readonly Dyadic[]): Dyadic[] {
  return polynomial.slice(1).map((value, index) => times(value, index + 1));
}
function trim(polynomial: readonly Dyadic[]): Dyadic[] {
  const result = [...polynomial];
  while (result.length > 1 && result[result.length - 1]!.n === 0n) result.pop();
  return result;
}

/** Exact interval Horner bounds over a non-negative dyadic x interval. */
function evaluateBounds(polynomial: readonly Dyadic[], lo: bigint, hi: bigint): readonly [Dyadic, Dyadic] {
  const x = gridPoint(lo), y = gridPoint(hi);
  let low = ZERO, high = ZERO;
  for (let i = polynomial.length - 1; i >= 0; i--) {
    const products = [mul(low, x), mul(low, y), mul(high, x), mul(high, y)];
    low = products.reduce((best, value) => compare(value, best) < 0 ? value : best);
    high = products.reduce((best, value) => compare(value, best) > 0 ? value : best);
    low = add(low, polynomial[i]!);
    high = add(high, polynomial[i]!);
  }
  return [low, high];
}

function bisect(polynomial: readonly Dyadic[], low: bigint, high: bigint): Root {
  let lo = low, hi = high;
  let leftSign = sign(evaluate(polynomial, gridPoint(lo))), rightSign = sign(evaluate(polynomial, gridPoint(hi)));
  if (leftSign === 0) return { lo, hi: lo };
  if (rightSign === 0) return { lo: hi, hi };
  if (leftSign === rightSign) throw new Error("Native accelerated CCD cannot bracket a polynomial root.");
  for (let iteration = 0; hi - lo > 1n && iteration < GRID_BITS + 2; iteration++) {
    const mid = (lo + hi) >> 1n, middleSign = sign(evaluate(polynomial, gridPoint(mid)));
    if (middleSign === 0) return { lo: mid, hi: mid };
    if (middleSign === leftSign) { lo = mid; leftSign = middleSign; }
    else { hi = mid; rightSign = middleSign; }
  }
  if (hi - lo > 1n || leftSign === rightSign) throw new Error("Native accelerated CCD root isolation did not converge.");
  return { lo, hi };
}

type Rational = { readonly n: bigint; readonly d: bigint };

function greatestCommonDivisor(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}
function rational(n: bigint, d = 1n): Rational {
  if (d === 0n) throw new Error("Native accelerated CCD encountered a singular polynomial.");
  if (n === 0n) return { n: 0n, d: 1n };
  if (d < 0n) { n = -n; d = -d; }
  const divisor = greatestCommonDivisor(n, d);
  return { n: n / divisor, d: d / divisor };
}
function rationalSub(a: Rational, b: Rational): Rational { return rational(a.n * b.d - b.n * a.d, a.d * b.d); }
function rationalMul(a: Rational, b: Rational): Rational { return rational(a.n * b.n, a.d * b.d); }
function rationalDiv(a: Rational, b: Rational): Rational { return rational(a.n * b.d, a.d * b.n); }
function trimRational(values: Rational[]): Rational[] {
  while (values.length > 0 && values[values.length - 1]!.n === 0n) values.pop();
  return values;
}
function remainder(left: readonly Rational[], right: readonly Rational[]): Rational[] {
  const result = [...left];
  while (result.length >= right.length && result.length > 0) {
    const offset = result.length - right.length;
    const factor = rationalDiv(result[result.length - 1]!, right[right.length - 1]!);
    for (let index = 0; index < right.length; index++) {
      result[offset + index] = rationalSub(result[offset + index]!, rationalMul(factor, right[index]!));
    }
    trimRational(result);
  }
  return result;
}

/** Common roots of a polynomial and its derivative are exact repeated roots. */
function repeatedRootPolynomial(polynomial: readonly Dyadic[]): Dyadic[] | undefined {
  const nonzero = polynomial.filter((value) => value.n !== 0n);
  if (nonzero.length === 0) return undefined;
  const exponent = Math.min(...nonzero.map((value) => value.e));
  const integers = polynomial.map((value) => value.n === 0n ? 0n : value.n << BigInt(value.e - exponent));
  let divisor = 0n;
  for (const value of integers) divisor = greatestCommonDivisor(divisor, value);
  let left = trimRational(integers.map((value) => rational(value / divisor)));
  let right = trimRational(left.slice(1).map((value, index) => rational(value.n * BigInt(index + 1), value.d)));
  while (right.length > 0) {
    const next = remainder(left, right);
    left = right;
    right = next;
  }
  if (left.length <= 1) return undefined;
  let denominator = 1n;
  for (const value of left) denominator = denominator / greatestCommonDivisor(denominator, value.d) * value.d;
  const result = left.map((value) => value.n * (denominator / value.d));
  divisor = 0n;
  for (const value of result) divisor = greatestCommonDivisor(divisor, value);
  return result.map((value) => ({ n: value / divisor, e: 0 }));
}

/**
 * Recursively isolate derivative roots, then solve on the resulting monotone
 * intervals. Exact dyadic signs and interval arithmetic certify each bracket.
 * A critical point whose contact cannot be distinguished from a miss fails
 * closed rather than treating a near-tangency as a hit or a miss.
 */
function roots(input: readonly Dyadic[]): Root[] {
  const polynomial = trim(input), degree = polynomial.length - 1;
  if (degree === 0) return [];
  type Node = Root & { readonly value: number };
  const start: Node = { lo: 0n, hi: 0n, value: sign(evaluate(polynomial, gridPoint(0n))) };
  const end: Node = { lo: GRID, hi: GRID, value: sign(evaluate(polynomial, gridPoint(GRID))) };
  const nodes: Node[] = [start];
  let repeated: readonly Root[] | undefined;
  if (degree > 1) {
    for (const root of roots(derivative(polynomial))) {
      if (root.lo === 0n && root.hi === 0n || root.lo === GRID && root.hi === GRID) continue;
      if (root.lo === 0n || root.hi === GRID) throw new Error("Native accelerated CCD critical point is ambiguous at an interval boundary.");
      if (root.lo === root.hi && sign(evaluate(polynomial, gridPoint(root.lo))) === 0) {
        nodes.push({ ...root, value: 0 });
        continue;
      }
      const [low, high] = evaluateBounds(polynomial, root.lo, root.hi);
      const value = sign(low) > 0 ? 1 : sign(high) < 0 ? -1 : 0;
      if (value === 0) {
        if (repeated === undefined) {
          const common = repeatedRootPolynomial(polynomial);
          repeated = common ? roots(common) : [];
        }
        if (!repeated.some((candidate) => candidate.lo <= root.hi && candidate.hi >= root.lo)) {
          throw new Error("Native accelerated CCD encountered an ambiguous tangency or unresolved critical point.");
        }
      }
      nodes.push({ ...root, value });
    }
  }
  nodes.push(end);
  const found: Root[] = [];
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!;
    if (node.value === 0) found.push({ lo: node.lo, hi: node.hi });
    if (index === nodes.length - 1) break;
    const next = nodes[index + 1]!;
    if (node.hi >= next.lo) throw new Error("Native accelerated CCD critical points cannot be separated numerically.");
    if (node.value !== 0 && next.value !== 0 && node.value !== next.value) found.push(bisect(polynomial, node.hi, next.lo));
  }
  return found;
}

function rightOfEndpoint(polynomial: readonly Dyadic[]): number {
  let current = trim(polynomial);
  while (current.length > 1) {
    current = derivative(current);
    const value = sign(evaluate(current, gridPoint(GRID)));
    if (value !== 0) return value;
  }
  return 0;
}

/** Convert isolated roots into maximal contact windows without temporal sampling. */
function windows(polynomial: readonly Dyadic[]): Window[] {
  const p = trim(polynomial);
  if (p.length === 1) return sign(p[0]!) <= 0 ? [{ entry: { lo: 0n, hi: 0n } }] : [];
  const all = roots(p);
  for (let i = 0; i < all.length; i++) {
    const root = all[i]!;
    if (root.lo !== root.hi && (root.lo === 0n || root.hi === GRID)) throw new Error("Native accelerated CCD root is ambiguous at an interval boundary.");
    if (i > 0 && all[i - 1]!.hi >= root.lo) throw new Error("Native accelerated CCD roots cannot be separated numerically.");
  }
  const entryAtZero: Root = { lo: 0n, hi: 0n }, endAtOne: Root = { lo: GRID, hi: GRID };
  const result: Window[] = [];
  for (let index = -1; index < all.length; index++) {
    const left = index < 0 ? entryAtZero : all[index]!, right = index + 1 < all.length ? all[index + 1]! : endAtOne;
    if (left.hi >= right.lo) continue;
    const middle = (left.hi + right.lo) >> 1n;
    if (middle === left.hi || middle === right.lo) throw new Error("Native accelerated CCD contact windows are numerically ambiguous.");
    if (sign(evaluate(p, gridPoint(middle))) >= 0) continue;
    const exit = index + 1 < all.length ? right : undefined;
    const previous = result[result.length - 1];
    if (previous?.exit && previous.exit.lo === left.lo && previous.exit.hi === left.hi) result[result.length - 1] = { entry: previous.entry, exit };
    else result.push({ entry: left, exit });
  }
  for (const root of all) {
    const covered = result.some((window) => window.entry.lo <= root.lo && (!window.exit || window.exit.hi >= root.hi));
    if (covered) continue;
    if (root.lo === GRID && root.hi === GRID && rightOfEndpoint(p) < 0) result.push({ entry: root });
    else result.push({ entry: root, exit: root });
  }
  result.sort((a, b) => a.entry.lo < b.entry.lo ? -1 : a.entry.lo > b.entry.lo ? 1 : 0);
  const last = result[result.length - 1];
  if (last?.exit && last.exit.lo === GRID && last.exit.hi === GRID && rightOfEndpoint(p) < 0) {
    result[result.length - 1] = { entry: last.entry };
  }
  return result;
}

function vecAdd(a: Vec3, b: Vec3): V { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function vecSub(a: Vec3, b: Vec3): V { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vecScale(a: Vec3, k: number): V { return [a[0] * k, a[1] * k, a[2] * k]; }
function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function checkedOffset(vector: Vec3, factor: number): V {
  const result = vecScale(vector, factor);
  finite(factor, ...result);
  if (factor !== 0 && vector.some((value, index) => value !== 0 && result[index] === 0)) {
    throw new Error("Native accelerated CCD motion underflows its numeric range.");
  }
  return result;
}
function exactDot(a: readonly Dyadic[], b: readonly Dyadic[]): Dyadic {
  return a.reduce((total, value, index) => add(total, mul(value, b[index]!)), ZERO);
}

function validateMotion(motion: Motion): void {
  if (!motion || !motion.body || !motion.collider || motion.collider.bodyId !== motion.body.id) {
    throw new Error("Native accelerated CCD collider does not belong to its body.");
  }
  validateFiniteVec3(motion.body.position, "native accelerated CCD position");
  validateFiniteVec3(motion.velocity, "native accelerated CCD velocity");
  validateFiniteVec3(motion.acceleration, "native accelerated CCD acceleration");
  validateFiniteVec3(motion.angularVelocity, "native accelerated CCD angular velocity");
  validateFiniteVec3(motion.angularAcceleration, "native accelerated CCD angular acceleration");
  if (motion.angularVelocity.some((v) => v !== 0) || motion.angularAcceleration.some((v) => v !== 0)) {
    throw new Error("Native accelerated CCD does not support angular motion.");
  }
  const q = motion.body.rotation;
  if (!q || q.length !== 4 || !q.every(Number.isFinite)) throw new Error("Native accelerated CCD rotation must be finite.");
  const length = Math.hypot(...q);
  if (!Number.isFinite(length) || length < 1e-9) throw new Error("Native accelerated CCD rotation must be non-zero.");
  Shape.validate(motion.collider.shape);
}

function rotation(body: RigidBody): Quat {
  const length = Math.hypot(...body.rotation);
  return [body.rotation[0] / length, body.rotation[1] / length, body.rotation[2] / length, body.rotation[3] / length];
}

function positionAt(motion: Motion, time: number): V {
  const squared = time * time;
  finite(squared);
  if (time !== 0 && squared * 0.5 === 0 && motion.acceleration.some((value) => value !== 0)) {
    throw new Error("Native accelerated CCD acceleration underflows its numeric range.");
  }
  const velocityOffset = checkedOffset(motion.velocity, time), accelerationOffset = checkedOffset(motion.acceleration, squared * 0.5);
  finite(...velocityOffset, ...accelerationOffset);
  const result = vecAdd(vecAdd(motion.body.position, velocityOffset), accelerationOffset);
  finite(...result);
  return result;
}

function velocityAt(motion: Motion, time: number): V {
  const delta = checkedOffset(motion.acceleration, time), result = vecAdd(motion.velocity, delta);
  finite(...delta, ...result);
  return result;
}

function relativeAt(first: Motion, second: Motion, time: number): V {
  const origin = vecSub(second.body.position, first.body.position);
  const velocity = vecSub(second.velocity, first.velocity), acceleration = vecSub(second.acceleration, first.acceleration);
  const squared = time * time;
  finite(...origin, ...velocity, ...acceleration, squared);
  const velocityOffset = checkedOffset(velocity, time), accelerationOffset = checkedOffset(acceleration, squared * 0.5);
  finite(...velocityOffset, ...accelerationOffset);
  const result = vecAdd(vecAdd(origin, velocityOffset), accelerationOffset);
  finite(...result);
  return result;
}

function trajectory(first: Motion, second: Motion, duration: number): readonly [Dyadic[], Dyadic[], Dyadic[]] {
  const time = dyadic(duration), halfTimeSquared = times(mul(time, time), 0.5);
  const origin: Dyadic[] = [], velocity: Dyadic[] = [], acceleration: Dyadic[] = [];
  const squared = duration * duration;
  finite(squared);
  for (let axis = 0; axis < 3; axis++) {
    const p = second.body.position[axis] - first.body.position[axis];
    const v = second.velocity[axis] - first.velocity[axis];
    const a = second.acceleration[axis] - first.acceleration[axis];
    finite(p, v, a, v * duration, a * squared * 0.5);
    origin.push(sub(dyadic(second.body.position[axis]), dyadic(first.body.position[axis])));
    velocity.push(mul(sub(dyadic(second.velocity[axis]), dyadic(first.velocity[axis])), time));
    acceleration.push(mul(sub(dyadic(second.acceleration[axis]), dyadic(first.acceleration[axis])), halfTimeSquared));
  }
  return [origin, velocity, acceleration];
}

function spherePolynomial(first: Motion, a: SphereShape, second: Motion, b: SphereShape, duration: number): Dyadic[] {
  const [p, v, acceleration] = trajectory(first, second, duration), radius = add(dyadic(a.radius), dyadic(b.radius));
  const distance = Math.hypot(...vecSub(second.body.position, first.body.position));
  const sum = a.radius + b.radius;
  finite(distance, sum, distance * distance, sum * sum);
  return [sub(exactDot(p, p), mul(radius, radius)), times(exactDot(p, v), 2),
    add(exactDot(v, v), times(exactDot(p, acceleration), 2)), times(exactDot(v, acceleration), 2), exactDot(acceleration, acceleration)];
}

function planeNormal(plane: Motion, shape: PlaneShape): { readonly normal: Vec3; readonly constant: number } {
  const raw = rotateVec3ByQuat(shape.normal, rotation(plane.body)), length = Math.hypot(...raw);
  finite(...raw, length);
  if (!(length > 1e-9)) throw new Error("Native accelerated CCD plane normal is degenerate.");
  const normal = vecScale(raw, 1 / length), constant = shape.constant / length;
  finite(...normal, constant);
  return { normal, constant };
}

function planePolynomial(sphere: Motion, shape: SphereShape, plane: Motion, planeShape: PlaneShape, duration: number): Dyadic[] {
  const { normal, constant } = planeNormal(plane, planeShape);
  const [p, v, acceleration] = trajectory(plane, sphere, duration), n = normal.map(dyadic);
  return [sub(sub(exactDot(n, p), dyadic(constant)), dyadic(shape.radius)), exactDot(n, v), exactDot(n, acceleration)];
}

function nextUp(value: number): number {
  if (value === Infinity) return value;
  if (value === 0) return Number.MIN_VALUE;
  buffer.setFloat64(0, value, false);
  const bits = buffer.getBigUint64(0, false);
  buffer.setBigUint64(0, value > 0 ? bits + 1n : bits - 1n, false);
  return buffer.getFloat64(0, false);
}
function nextDown(value: number): number { return -nextUp(-value); }
function rootValue(root: Root): number {
  return (Number(root.lo) + Number(root.hi)) / (2 * Number(GRID));
}
function rootBounds(root: Root): readonly [number, number] {
  return [Math.max(0, nextDown(Number(root.lo) / Number(GRID))), Math.min(1, nextUp(Number(root.hi) / Number(GRID)))];
}

function witness(first: Motion, second: Motion, time: number, boundary: boolean): { readonly normal: Vec3; readonly point: Vec3 } {
  const shapeA = first.collider.shape, shapeB = second.collider.shape;
  if (shapeA.kind === "sphere" && shapeB.kind === "sphere") {
    const relative = relativeAt(first, second, time), length = Math.hypot(...relative);
    finite(length);
    if (!(length > 0)) throw new Error("Native accelerated CCD cannot determine a normal for coincident sphere centers.");
    const normal = vecScale(relative, 1 / length), a = positionAt(first, time), b = positionAt(second, time);
    const scale = Math.max(length, shapeA.radius + shapeB.radius), tolerance = scale * 1e-8;
    if (Math.hypot(...vecSub(vecSub(b, a), relative)) > tolerance ||
        (boundary && Math.abs(length - shapeA.radius - shapeB.radius) > tolerance)) {
      throw new Error("Native accelerated CCD sphere witness exceeds numeric precision.");
    }
    const pa = vecAdd(a, vecScale(normal, shapeA.radius)), pb = vecSub(b, vecScale(normal, shapeB.radius));
    const point = vecAdd(pa, vecScale(vecSub(pb, pa), 0.5));
    finite(...normal, ...point);
    return { normal, point };
  }
  const aIsPlane = shapeA.kind === "plane", plane = aIsPlane ? first : second, sphere = aIsPlane ? second : first;
  const sphereShape = sphere.collider.shape as SphereShape, planeShape = plane.collider.shape as PlaneShape;
  const { normal: planeN, constant } = planeNormal(plane, planeShape);
  const center = positionAt(sphere, time), planePosition = positionAt(plane, time);
  const relative = relativeAt(plane, sphere, time);
  const scale = Math.max(sphereShape.radius, Math.abs(constant), Math.abs(dot(planeN, relative)));
  if (Math.hypot(...vecSub(vecSub(center, planePosition), relative)) > scale * 1e-8) {
    throw new Error("Native accelerated CCD plane witness exceeds numeric precision.");
  }
  const support = vecSub(center, vecScale(planeN, sphereShape.radius));
  const gap = dot(planeN, vecSub(support, planePosition)) - constant;
  finite(gap);
  if (boundary && Math.abs(gap) > scale * 1e-8) throw new Error("Native accelerated CCD plane witness exceeds numeric precision.");
  const point = vecSub(support, vecScale(planeN, gap * 0.5));
  const normal = aIsPlane ? planeN : vecScale(planeN, -1);
  finite(...point, ...normal);
  return { normal, point };
}

/**
 * Find all contact windows for fixed-orientation sphere/sphere and
 * sphere/plane trajectories with constant, independently supplied acceleration.
 * Positions follow p(t) = p(0) + velocity*t + acceleration*t²/2. The caller
 * supplies filtering and owns integration; no body or collider is mutated.
 *
 * Polynomial signs are exact for the finite input numbers and the explicitly
 * rounded plane normal. Derivative-root isolation partitions time into monotone
 * intervals. An unresolved critical point or a root too close to another root
 * or a boundary throws, rather than reporting an unproven hit or miss. Grazes
 * whose contact can be certified are returned as zero-duration windows.
 */
export function nativeCastAcceleratedPair(first: Motion, second: Motion, duration: number): NativeAcceleratedCCDResult {
  validateMotion(first); validateMotion(second);
  if (!Number.isFinite(duration) || duration < 0) throw new Error("Native accelerated CCD duration must be finite and non-negative.");
  if (first.body.id === second.body.id || first.collider.id === second.collider.id) throw new Error("Native accelerated CCD requires distinct bodies and colliders.");
  const a = first.collider.shape, b = second.collider.shape;
  let polynomial: Dyadic[];
  if (a.kind === "sphere" && b.kind === "sphere") polynomial = spherePolynomial(first, a, second, b, duration);
  else if (a.kind === "sphere" && b.kind === "plane") polynomial = planePolynomial(first, a, second, b, duration);
  else if (a.kind === "plane" && b.kind === "sphere") polynomial = planePolynomial(second, b, first, a, duration);
  else throw new Error(`Native accelerated CCD does not support '${a.kind}' against '${b.kind}'.`);
  // Fail before returning any result if either world-space trajectory overflows.
  positionAt(first, duration); positionAt(second, duration);
  velocityAt(first, duration); velocityAt(second, duration);
  const pieces = windows(polynomial);
  if (pieces.length === 0) return { kind: "separated" };
  let instantaneous = polynomial;
  if (duration === 0) {
    if (a.kind === "sphere" && b.kind === "sphere") instantaneous = spherePolynomial(first, a, second, b, 1);
    else if (a.kind === "sphere" && b.kind === "plane") instantaneous = planePolynomial(first, a, second, b, 1);
    else instantaneous = planePolynomial(second, b as SphereShape, first, a as PlaneShape, 1);
  }
  const atZero = sign(polynomial[0]!), derivativeAtZero = instantaneous.length > 1 ? sign(instantaneous[1]!) : 0;
  const relativeVelocity = vecSub(second.velocity, first.velocity), relativeAcceleration = vecSub(second.acceleration, first.acceleration);
  finite(...relativeVelocity, ...relativeAcceleration);
  const stationary = relativeVelocity.every((value) => value === 0) && relativeAcceleration.every((value) => value === 0);
  const constantContact = trim(instantaneous).length === 1 && atZero === 0;
  const intervals = pieces.map((piece): NativeAcceleratedCCDInterval => {
    const fraction = rootValue(piece.entry), exitFraction = piece.exit ? rootValue(piece.exit) : undefined;
    const initial = fraction > 0 || atZero > 0 ? "separated" : atZero < 0 ? "penetrating" : "touching";
    let motion: NativeCCDInterval["motion"];
    if (stationary) motion = "stationary";
    else if (duration === 0 && atZero === 0) {
      const next = instantaneous.slice(1).map(sign).find((value) => value !== 0) ?? 0;
      motion = next < 0 ? "entering" : derivativeAtZero > 0 ? "separating" : "tangent";
    }
    else if (initial === "penetrating") motion = derivativeAtZero < 0 ? "entering" : derivativeAtZero > 0 ? "separating" : "tangent";
    else if (constantContact) motion = "tangent";
    else if (piece.exit && piece.entry.lo === piece.exit.lo && piece.entry.hi === piece.exit.hi) {
      motion = fraction === 0 && derivativeAtZero > 0 ? "separating" : "tangent";
    }
    else motion = "entering";
    const entryWitness = witness(first, second, duration * fraction, initial !== "penetrating");
    const exitWitness = exitFraction === undefined ? undefined : witness(first, second, duration * exitFraction, true);
    return {
      fraction, exitFraction, initial, motion, ...entryWitness,
      entryBounds: rootBounds(piece.entry),
      ...(exitWitness && piece.exit ? { exitNormal: exitWitness.normal, exitPoint: exitWitness.point, exitBounds: rootBounds(piece.exit) } : {})
    };
  });
  return { kind: "contact", ...intervals[0]!, intervals };
}
