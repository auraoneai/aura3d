import { Quaternion as ImmutableQuaternion } from "../../Quaternion.js";

// Diagnostics go through the host console; declared locally so the package needs no DOM or Node type libraries.
declare const console: { warn(...data: unknown[]): void };

export interface QuaternionLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export type EulerOrder = "XYZ" | "YXZ" | "ZXY" | "ZYX" | "YZX" | "XZY";

export interface EulerLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly order: EulerOrder | string;
}

interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface ElementsLike {
  readonly elements: ArrayLike<number>;
}

export interface BufferAttributeLike4 {
  getX(index: number): number;
  getY(index: number): number;
  getZ(index: number): number;
  getW(index: number): number;
}

type Components = [number, number, number, number];

function unit(q: QuaternionLike): Components | undefined {
  const scale = Math.max(Math.abs(q.x), Math.abs(q.y), Math.abs(q.z), Math.abs(q.w));
  if (scale === 0) return undefined;
  const x = q.x / scale, y = q.y / scale, z = q.z / scale, w = q.w / scale;
  const length = Math.hypot(x, y, z, w);
  return [x / length, y / length, z / length, w / length];
}

function validOrder(order: string): order is EulerOrder {
  return order === "XYZ" || order === "XZY" || order === "YXZ" ||
    order === "YZX" || order === "ZXY" || order === "ZYX";
}

/** Hamilton product, with inputs captured before the output is written. */
function product(a: QuaternionLike, b: QuaternionLike): Components {
  const { x: ax, y: ay, z: az, w: aw } = a;
  const { x: bx, y: by, z: bz, w: bw } = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

/**
 * Shortest-arc spherical interpolation of two quaternions. Inputs are assumed
 * to be unit length; nearly parallel inputs (cosine at least 0.9995) use a
 * normalized linear blend instead of the sine weights.
 */
function interpolate(a: QuaternionLike, b: QuaternionLike, t: number): Components {
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  let cosine = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (cosine < 0) {
    cosine = -cosine;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  if (cosine < 0.9995) {
    const angle = Math.acos(cosine);
    const denominator = Math.sin(angle);
    const left = Math.sin((1 - t) * angle) / denominator;
    const right = Math.sin(t * angle) / denominator;
    return [left * a.x + right * bx, left * a.y + right * by, left * a.z + right * bz, left * a.w + right * bw];
  }
  const left = 1 - t, right = t;
  const x = left * a.x + right * bx, y = left * a.y + right * by;
  const z = left * a.z + right * bz, w = left * a.w + right * bw;
  const length = Math.sqrt(x * x + y * y + z * z + w * w);
  return length === 0 ? [0, 0, 0, 1] : [x / length, y / length, z / length, w / length];
}

export class Quaternion implements QuaternionLike {
  readonly isQuaternion = true;
  _x: number;
  _y: number;
  _z: number;
  _w: number;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this._x = x; this._y = y; this._z = z; this._w = w;
  }

  static slerpFlat(dst: number[], dstOffset: number, src0: ArrayLike<number>, srcOffset0: number,
    src1: ArrayLike<number>, srcOffset1: number, t: number): void {
    const a = { x: src0[srcOffset0], y: src0[srcOffset0 + 1], z: src0[srcOffset0 + 2], w: src0[srcOffset0 + 3] };
    const b = { x: src1[srcOffset1], y: src1[srcOffset1 + 1], z: src1[srcOffset1 + 2], w: src1[srcOffset1 + 3] };
    const same = a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w;
    const values: Components = same ? [a.x, a.y, a.z, a.w] : interpolate(a, b, t);
    for (let i = 0; i < 4; i++) dst[dstOffset + i] = values[i];
  }

  static multiplyQuaternionsFlat(dst: number[], dstOffset: number, src0: ArrayLike<number>, srcOffset0: number,
    src1: ArrayLike<number>, srcOffset1: number): number[] {
    const a = { x: src0[srcOffset0], y: src0[srcOffset0 + 1], z: src0[srcOffset0 + 2], w: src0[srcOffset0 + 3] };
    const b = { x: src1[srcOffset1], y: src1[srcOffset1 + 1], z: src1[srcOffset1 + 2], w: src1[srcOffset1 + 3] };
    const values = product(a, b);
    for (let i = 0; i < 4; i++) dst[dstOffset + i] = values[i];
    return dst;
  }

  get x(): number { return this._x; }
  set x(value: number) { this._x = value; this._onChangeCallback(); }
  get y(): number { return this._y; }
  set y(value: number) { this._y = value; this._onChangeCallback(); }
  get z(): number { return this._z; }
  set z(value: number) { this._z = value; this._onChangeCallback(); }
  get w(): number { return this._w; }
  set w(value: number) { this._w = value; this._onChangeCallback(); }

  fromImmutable(q: QuaternionLike): this { return this.copy(q); }
  toImmutable(): ImmutableQuaternion { return new ImmutableQuaternion(this._x, this._y, this._z, this._w); }

  set(x: number, y: number, z: number, w: number): this {
    this._x = x; this._y = y; this._z = z; this._w = w;
    this._onChangeCallback();
    return this;
  }

  clone(): this {
    const Constructor = this.constructor as new (x: number, y: number, z: number, w: number) => this;
    return new Constructor(this._x, this._y, this._z, this._w);
  }

  copy(q: QuaternionLike): this { return this.set(q.x, q.y, q.z, q.w); }

  setFromEuler(euler: EulerLike, update = true): this {
    if (!validOrder(euler.order)) {
      // 4.x behavior: an unknown order is reported and leaves the quaternion unchanged.
      console.warn(`Quaternion.setFromEuler: unknown Euler order: ${String(euler.order)}`);
      if (update) this._onChangeCallback();
      return this;
    }
    const angles = { X: euler.x, Y: euler.y, Z: euler.z };
    let current: QuaternionLike = { x: 0, y: 0, z: 0, w: 1 };
    for (const axis of euler.order) {
      const half = angles[axis as keyof typeof angles] / 2;
      const sine = Math.sin(half), cosine = Math.cos(half);
      const turn = { x: axis === "X" ? sine : 0, y: axis === "Y" ? sine : 0,
        z: axis === "Z" ? sine : 0, w: cosine };
      const [x, y, z, w] = product(current, turn);
      current = { x, y, z, w };
    }
    this._x = current.x; this._y = current.y; this._z = current.z; this._w = current.w;
    if (update) this._onChangeCallback();
    return this;
  }

  setFromAxisAngle(axis: Vec3Like, angle: number): this {
    const half = angle / 2, s = Math.sin(half);
    return this.set(axis.x * s, axis.y * s, axis.z * s, Math.cos(half));
  }

  setFromRotationMatrix(m: ElementsLike): this {
    const e = m.elements;
    const m00 = e[0], m01 = e[4], m02 = e[8];
    const m10 = e[1], m11 = e[5], m12 = e[9];
    const m20 = e[2], m21 = e[6], m22 = e[10];
    const trace = m00 + m11 + m22;
    let x: number, y: number, z: number, w: number;
    if (trace > 0) {
      const s = 2 * Math.sqrt(1 + trace);
      w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
    } else if (m00 >= m11 && m00 >= m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s; w = (m21 - m12) / s;
    } else if (m11 >= m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s; w = (m02 - m20) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4; w = (m10 - m01) / s;
    }
    return this.set(x, y, z, w);
  }

  setFromUnitVectors(from: Vec3Like, to: Vec3Like): this {
    const fx = from.x, fy = from.y, fz = from.z;
    const tx = to.x, ty = to.y, tz = to.z;
    let x = fy * tz - fz * ty, y = fz * tx - fx * tz, z = fx * ty - fy * tx;
    const dot = fx * tx + fy * ty + fz * tz;
    const crossSq = x * x + y * y + z * z;
    let w = dot < 0 ? crossSq / (1 - dot) : 1 + dot;
    if (crossSq === 0 && dot < 0) {
      if (Math.abs(fx) > Math.abs(fz)) { x = -fy; y = fx; z = 0; }
      else { x = 0; y = -fz; z = fy; }
      w = 0;
    }
    const length = Math.hypot(x, y, z, w);
    return length === 0 ? this.identity() : this.set(x / length, y / length, z / length, w / length);
  }

  angleTo(q: QuaternionLike): number {
    // Unit quaternions: the rotation angle is 2 acos |a . b|.
    return 2 * Math.acos(Math.abs(Math.max(-1, Math.min(1, this.dot(q)))));
  }

  rotateTowards(q: QuaternionLike, step: number): this {
    const angle = this.angleTo(q);
    return angle === 0 ? this : this.slerp(q, Math.min(1, step / angle));
  }

  identity(): this { return this.set(0, 0, 0, 1); }
  /** The inverse of a unit quaternion, which is its conjugate (4.x behavior; non-unit input is not rescaled). */
  invert(): this { return this.conjugate(); }
  conjugate(): this { return this.set(-this._x, -this._y, -this._z, this._w); }
  dot(q: QuaternionLike): number { return this._x * q.x + this._y * q.y + this._z * q.z + this._w * q.w; }
  lengthSq(): number { return this.dot(this); }
  length(): number { return Math.hypot(this._x, this._y, this._z, this._w); }
  normalize(): this {
    const values = unit(this);
    return values ? this.set(...values) : this.identity();
  }
  multiply(q: QuaternionLike): this { return this.multiplyQuaternions(this, q); }
  premultiply(q: QuaternionLike): this { return this.multiplyQuaternions(q, this); }
  multiplyQuaternions(a: QuaternionLike, b: QuaternionLike): this {
    return this.set(...product(a, b));
  }
  slerp(q: QuaternionLike, t: number): this {
    return this.set(...interpolate(this, q, t));
  }
  slerpQuaternions(a: QuaternionLike, b: QuaternionLike, t: number): this {
    // Interpolate from snapshots so either input may be the receiver.
    return this.set(...interpolate(a, b, t));
  }
  random(): this {
    // Draw order: first angle, second angle, then the radius split.
    const v = 2 * Math.PI * Math.random(), w = 2 * Math.PI * Math.random(), u = Math.random();
    const a = Math.sqrt(1 - u), b = Math.sqrt(u);
    return this.set(a * Math.sin(v), a * Math.cos(v), b * Math.sin(w), b * Math.cos(w));
  }
  equals(q: QuaternionLike): boolean { return this._x === q.x && this._y === q.y && this._z === q.z && this._w === q.w; }
  fromArray(array: ArrayLike<number>, offset = 0): this {
    return this.set(array[offset], array[offset + 1], array[offset + 2], array[offset + 3]);
  }
  toArray(array: number[] = [], offset = 0): number[] {
    array[offset] = this._x; array[offset + 1] = this._y; array[offset + 2] = this._z; array[offset + 3] = this._w;
    return array;
  }
  fromBufferAttribute(attribute: BufferAttributeLike4, index: number): this {
    return this.set(attribute.getX(index), attribute.getY(index), attribute.getZ(index), attribute.getW(index));
  }
  toJSON(): number[] { return this.toArray(); }
  _onChange(callback: () => void): this { this._onChangeCallback = callback; return this; }
  _onChangeCallback(): void { /* An observer can be installed with _onChange. */ }
  *[Symbol.iterator](): Generator<number, void, undefined> { yield this._x; yield this._y; yield this._z; yield this._w; }
}
