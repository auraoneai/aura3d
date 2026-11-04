import { Vector2 as ImmutableVector2 } from "../../Vector2.js";

export interface Vector2Like {
  readonly x: number;
  readonly y: number;
}

export interface BufferAttributeLike2 {
  getX(index: number): number;
  getY(index: number): number;
}

interface Matrix3Like {
  readonly elements: ArrayLike<number>;
}

/**
 * A mutable two-dimensional vector. Arithmetic methods update and return the
 * receiver; scalar queries leave it unchanged. Angles are in radians.
 * A zero vector stays zero when normalized or assigned a length; a vector with
 * a NaN length is left unchanged by `normalize`. Its angle to any vector is
 * defined as pi / 2 when either has zero length, because it has no preferred
 * direction. Out-of-range component indices throw a `RangeError` carrying the 4.x message.
 */
export class Vector2 {
  readonly isVector2: boolean = true;

  constructor(public x = 0, public y = 0) {}

  get width(): number { return this.x; }
  set width(value: number) { this.x = value; }
  get height(): number { return this.y; }
  set height(value: number) { this.y = value; }

  fromImmutable(v: Vector2Like): this { return this.copy(v); }
  toImmutable(): ImmutableVector2 { return new ImmutableVector2(this.x, this.y); }

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  setScalar(scalar: number): this { return this.set(scalar, scalar); }
  setX(x: number): this { this.x = x; return this; }
  setY(y: number): this { this.y = y; return this; }

  setComponent(index: number, value: number): this {
    if (index === 0) this.x = value;
    else if (index === 1) this.y = value;
    else throw new RangeError(`THREE.Vector2: index is out of range: ${index}`);
    return this;
  }

  getComponent(index: number): number {
    if (index === 0) return this.x;
    if (index === 1) return this.y;
    throw new RangeError(`THREE.Vector2: index is out of range: ${index}`);
  }

  clone(): this {
    const Constructor = this.constructor as new (x?: number, y?: number) => this;
    return new Constructor(this.x, this.y);
  }

  copy(v: Vector2Like): this { return this.set(v.x, v.y); }
  add(v: Vector2Like): this { return this.set(this.x + v.x, this.y + v.y); }
  addScalar(s: number): this { return this.set(this.x + s, this.y + s); }
  addVectors(a: Vector2Like, b: Vector2Like): this { return this.set(a.x + b.x, a.y + b.y); }
  addScaledVector(v: Vector2Like, s: number): this {
    return this.set(this.x + s * v.x, this.y + s * v.y);
  }
  sub(v: Vector2Like): this { return this.set(this.x - v.x, this.y - v.y); }
  subScalar(s: number): this { return this.set(this.x - s, this.y - s); }
  subVectors(a: Vector2Like, b: Vector2Like): this { return this.set(a.x - b.x, a.y - b.y); }
  multiply(v: Vector2Like): this { return this.set(this.x * v.x, this.y * v.y); }
  multiplyScalar(scalar: number): this { return this.set(this.x * scalar, this.y * scalar); }
  divide(v: Vector2Like): this { return this.set(this.x / v.x, this.y / v.y); }
  divideScalar(scalar: number): this { return this.set(this.x / scalar, this.y / scalar); }

  /** Applies the affine part of a column-major homogeneous 3-by-3 matrix. */
  applyMatrix3(m: Matrix3Like): this {
    const { x, y } = this;
    const e = m.elements;
    return this.set(e[0] * x + e[3] * y + e[6], e[1] * x + e[4] * y + e[7]);
  }

  min(v: Vector2Like): this { return this.set(Math.min(this.x, v.x), Math.min(this.y, v.y)); }
  max(v: Vector2Like): this { return this.set(Math.max(this.x, v.x), Math.max(this.y, v.y)); }
  clamp(min: Vector2Like, max: Vector2Like): this {
    return this.set(
      Math.min(Math.max(this.x, min.x), max.x),
      Math.min(Math.max(this.y, min.y), max.y),
    );
  }
  clampScalar(minVal: number, maxVal: number): this {
    return this.set(
      Math.min(Math.max(this.x, minVal), maxVal),
      Math.min(Math.max(this.y, minVal), maxVal),
    );
  }
  clampLength(min: number, max: number): this {
    const length = this.length();
    if (length === 0) return this;
    const bounded = Math.min(Math.max(length, min), max);
    if (bounded === length) return this;
    return this.set((this.x / length) * bounded, (this.y / length) * bounded);
  }

  floor(): this { return this.set(Math.floor(this.x), Math.floor(this.y)); }
  ceil(): this { return this.set(Math.ceil(this.x), Math.ceil(this.y)); }
  round(): this { return this.set(Math.round(this.x), Math.round(this.y)); }
  roundToZero(): this { return this.set(Math.trunc(this.x), Math.trunc(this.y)); }
  negate(): this { return this.set(-this.x, -this.y); }

  dot(v: Vector2Like): number { return this.x * v.x + this.y * v.y; }
  cross(v: Vector2Like): number { return this.x * v.y - this.y * v.x; }
  lengthSq(): number { return this.x * this.x + this.y * this.y; }
  length(): number { return Math.hypot(this.x, this.y); }
  manhattanLength(): number { return Math.abs(this.x) + Math.abs(this.y); }

  normalize(): this { return this.divideScalar(this.length() || 1); }

  /** Counterclockwise angle from the positive x-axis, in [0, 2*pi). */
  angle(): number {
    const radians = Math.atan2(this.y, this.x);
    return radians < 0 ? radians + 2 * Math.PI : radians;
  }

  angleTo(v: Vector2): number {
    const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());
    if (denominator === 0) return Math.PI / 2;
    return Math.acos(Math.max(-1, Math.min(1, this.dot(v) / denominator)));
  }

  distanceTo(v: Vector2Like): number { return Math.hypot(this.x - v.x, this.y - v.y); }
  distanceToSquared(v: Vector2Like): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }
  manhattanDistanceTo(v: Vector2Like): number { return Math.abs(this.x - v.x) + Math.abs(this.y - v.y); }
  setLength(length: number): this {
    return this.normalize().multiplyScalar(length);
  }

  lerp(v: Vector2Like, alpha: number): this {
    return this.set(this.x + (v.x - this.x) * alpha, this.y + (v.y - this.y) * alpha);
  }
  lerpVectors(v1: Vector2Like, v2: Vector2Like, alpha: number): this {
    return this.set(v1.x + (v2.x - v1.x) * alpha, v1.y + (v2.y - v1.y) * alpha);
  }
  equals(v: Vector2Like): boolean { return this.x === v.x && this.y === v.y; }

  fromArray(array: ArrayLike<number>, offset = 0): this {
    return this.set(array[offset], array[offset + 1]);
  }
  toArray(array: number[] = [], offset = 0): number[] {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    return array;
  }
  fromBufferAttribute(attribute: BufferAttributeLike2, index: number): this {
    return this.set(attribute.getX(index), attribute.getY(index));
  }

  rotateAround(center: Vector2Like, angle: number): this {
    const x = this.x - center.x;
    const y = this.y - center.y;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return this.set(center.x + c * x - s * y, center.y + s * x + c * y);
  }
  random(): this { return this.set(Math.random(), Math.random()); }

  *[Symbol.iterator](): Generator<number, void, undefined> {
    yield this.x;
    yield this.y;
  }
}
