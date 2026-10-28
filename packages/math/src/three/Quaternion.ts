import { clamp } from "../MathUtils.js";
import { Quaternion as ImmutableQuaternion } from "../Quaternion.js";

/** Anything with the `{ x, y, z, w }` shape, including the immutable `@aura3d/math` Quaternion. */
export interface QuaternionLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** Intrinsic Euler order, as in three.js. */
export type EulerOrder = "XYZ" | "YXZ" | "ZXY" | "ZYX" | "YZX" | "XZY";

/** The Euler fields `setFromEuler` reads (compat or immutable Euler). */
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

/** Minimal buffer-attribute shape three's `fromBufferAttribute` reads. */
export interface BufferAttributeLike4 {
  getX(index: number): number;
  getY(index: number): number;
  getZ(index: number): number;
  getW(index: number): number;
}

/**
 * Mutable three.js-compatible quaternion. Every modifier mutates `this` and
 * returns `this`, exactly like three r185 `Quaternion`, including the
 * `_onChange` callback that `Euler` uses to stay in sync.
 */
export class Quaternion {
  declare readonly isQuaternion: true;

  _x: number;
  _y: number;
  _z: number;
  _w: number;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
  }

  static slerpFlat(
    dst: number[],
    dstOffset: number,
    src0: ArrayLike<number>,
    srcOffset0: number,
    src1: ArrayLike<number>,
    srcOffset1: number,
    t: number
  ): void {
    // fuzz-free, array-based Quaternion SLERP operation
    let x0 = src0[srcOffset0 + 0]!;
    let y0 = src0[srcOffset0 + 1]!;
    let z0 = src0[srcOffset0 + 2]!;
    let w0 = src0[srcOffset0 + 3]!;
    let x1 = src1[srcOffset1 + 0]!;
    let y1 = src1[srcOffset1 + 1]!;
    let z1 = src1[srcOffset1 + 2]!;
    let w1 = src1[srcOffset1 + 3]!;

    if (w0 !== w1 || x0 !== x1 || y0 !== y1 || z0 !== z1) {
      let dot = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1;
      if (dot < 0) {
        x1 = -x1;
        y1 = -y1;
        z1 = -z1;
        w1 = -w1;
        dot = -dot;
      }
      let s = 1 - t;
      if (dot < 0.9995) {
        // slerp
        const theta = Math.acos(dot);
        const sin = Math.sin(theta);
        s = Math.sin(s * theta) / sin;
        t = Math.sin(t * theta) / sin;
        x0 = x0 * s + x1 * t;
        y0 = y0 * s + y1 * t;
        z0 = z0 * s + z1 * t;
        w0 = w0 * s + w1 * t;
      } else {
        // for small angles, lerp then normalize
        x0 = x0 * s + x1 * t;
        y0 = y0 * s + y1 * t;
        z0 = z0 * s + z1 * t;
        w0 = w0 * s + w1 * t;
        const f = 1 / Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0 + w0 * w0);
        x0 *= f;
        y0 *= f;
        z0 *= f;
        w0 *= f;
      }
    }
    dst[dstOffset] = x0;
    dst[dstOffset + 1] = y0;
    dst[dstOffset + 2] = z0;
    dst[dstOffset + 3] = w0;
  }

  static multiplyQuaternionsFlat(
    dst: number[],
    dstOffset: number,
    src0: ArrayLike<number>,
    srcOffset0: number,
    src1: ArrayLike<number>,
    srcOffset1: number
  ): number[] {
    const x0 = src0[srcOffset0]!;
    const y0 = src0[srcOffset0 + 1]!;
    const z0 = src0[srcOffset0 + 2]!;
    const w0 = src0[srcOffset0 + 3]!;
    const x1 = src1[srcOffset1]!;
    const y1 = src1[srcOffset1 + 1]!;
    const z1 = src1[srcOffset1 + 2]!;
    const w1 = src1[srcOffset1 + 3]!;
    dst[dstOffset] = x0 * w1 + w0 * x1 + y0 * z1 - z0 * y1;
    dst[dstOffset + 1] = y0 * w1 + w0 * y1 + z0 * x1 - x0 * z1;
    dst[dstOffset + 2] = z0 * w1 + w0 * z1 + x0 * y1 - y0 * x1;
    dst[dstOffset + 3] = w0 * w1 - x0 * x1 - y0 * y1 - z0 * z1;
    return dst;
  }

  get x(): number {
    return this._x;
  }

  set x(value: number) {
    this._x = value;
    this._onChangeCallback();
  }

  get y(): number {
    return this._y;
  }

  set y(value: number) {
    this._y = value;
    this._onChangeCallback();
  }

  get z(): number {
    return this._z;
  }

  set z(value: number) {
    this._z = value;
    this._onChangeCallback();
  }

  get w(): number {
    return this._w;
  }

  set w(value: number) {
    this._w = value;
    this._onChangeCallback();
  }

  /** Copy an immutable `@aura3d/math` Quaternion (or any `{x, y, z, w}`) into this quaternion. */
  fromImmutable(q: QuaternionLike): this {
    return this.copy(q);
  }

  /** Snapshot as an immutable `@aura3d/math` Quaternion. */
  toImmutable(): ImmutableQuaternion {
    return new ImmutableQuaternion(this._x, this._y, this._z, this._w);
  }

  set(x: number, y: number, z: number, w: number): this {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
    this._onChangeCallback();
    return this;
  }

  clone(): this {
    return new (this.constructor as new (x: number, y: number, z: number, w: number) => this)(this._x, this._y, this._z, this._w);
  }

  copy(quaternion: QuaternionLike): this {
    this._x = quaternion.x;
    this._y = quaternion.y;
    this._z = quaternion.z;
    this._w = quaternion.w;
    this._onChangeCallback();
    return this;
  }

  setFromEuler(euler: EulerLike, update = true): this {
    const x = euler.x;
    const y = euler.y;
    const z = euler.z;
    const order = euler.order;

    // http://www.mathworks.com/matlabcentral/fileexchange/20696-function-to-convert-between-dcm-euler-angles-quaternions-and-euler-vectors/content/SpinCalc.m
    const cos = Math.cos;
    const sin = Math.sin;
    const c1 = cos(x / 2);
    const c2 = cos(y / 2);
    const c3 = cos(z / 2);
    const s1 = sin(x / 2);
    const s2 = sin(y / 2);
    const s3 = sin(z / 2);

    switch (order) {
      case "XYZ":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "YXZ":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      case "ZXY":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "ZYX":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      case "YZX":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "XZY":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      default:
        console.warn(`THREE.Quaternion: .setFromEuler() encountered an unknown order: ${String(order)}`);
    }

    if (update === true) this._onChangeCallback();
    return this;
  }

  setFromAxisAngle(axis: Vec3Like, angle: number): this {
    // assumes axis is normalized
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    this._x = axis.x * s;
    this._y = axis.y * s;
    this._z = axis.z * s;
    this._w = Math.cos(halfAngle);
    this._onChangeCallback();
    return this;
  }

  setFromRotationMatrix(m: ElementsLike): this {
    // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)
    const te = m.elements;
    const m11 = te[0]!;
    const m12 = te[4]!;
    const m13 = te[8]!;
    const m21 = te[1]!;
    const m22 = te[5]!;
    const m23 = te[9]!;
    const m31 = te[2]!;
    const m32 = te[6]!;
    const m33 = te[10]!;
    const trace = m11 + m22 + m33;

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0);
      this._w = 0.25 / s;
      this._x = (m32 - m23) * s;
      this._y = (m13 - m31) * s;
      this._z = (m21 - m12) * s;
    } else if (m11 > m22 && m11 > m33) {
      const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
      this._w = (m32 - m23) / s;
      this._x = 0.25 * s;
      this._y = (m12 + m21) / s;
      this._z = (m13 + m31) / s;
    } else if (m22 > m33) {
      const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
      this._w = (m13 - m31) / s;
      this._x = (m12 + m21) / s;
      this._y = 0.25 * s;
      this._z = (m23 + m32) / s;
    } else {
      const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
      this._w = (m21 - m12) / s;
      this._x = (m13 + m31) / s;
      this._y = (m23 + m32) / s;
      this._z = 0.25 * s;
    }

    this._onChangeCallback();
    return this;
  }

  setFromUnitVectors(vFrom: Vec3Like, vTo: Vec3Like): this {
    // assumes direction vectors vFrom and vTo are normalized
    let r = vFrom.x * vTo.x + vFrom.y * vTo.y + vFrom.z * vTo.z + 1;

    if (r < 1e-8) {
      // vFrom and vTo point in opposite directions
      r = 0;
      if (Math.abs(vFrom.x) > Math.abs(vFrom.z)) {
        this._x = -vFrom.y;
        this._y = vFrom.x;
        this._z = 0;
        this._w = r;
      } else {
        this._x = 0;
        this._y = -vFrom.z;
        this._z = vFrom.y;
        this._w = r;
      }
    } else {
      // crossVectors( vFrom, vTo ) // inlined to avoid cyclic dependency on Vector3
      this._x = vFrom.y * vTo.z - vFrom.z * vTo.y;
      this._y = vFrom.z * vTo.x - vFrom.x * vTo.z;
      this._z = vFrom.x * vTo.y - vFrom.y * vTo.x;
      this._w = r;
    }

    return this.normalize();
  }

  angleTo(q: QuaternionLike): number {
    return 2 * Math.acos(Math.abs(clamp(this.dot(q), -1, 1)));
  }

  rotateTowards(q: QuaternionLike, step: number): this {
    const angle = this.angleTo(q);
    if (angle === 0) return this;
    const t = Math.min(1, step / angle);
    this.slerp(q, t);
    return this;
  }

  identity(): this {
    return this.set(0, 0, 0, 1);
  }

  invert(): this {
    // quaternion is assumed to have unit length
    return this.conjugate();
  }

  conjugate(): this {
    this._x *= -1;
    this._y *= -1;
    this._z *= -1;
    this._onChangeCallback();
    return this;
  }

  dot(v: QuaternionLike): number {
    return this._x * v.x + this._y * v.y + this._z * v.z + this._w * v.w;
  }

  lengthSq(): number {
    return this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w;
  }

  length(): number {
    return Math.sqrt(this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w);
  }

  normalize(): this {
    let l = this.length();
    if (l === 0) {
      this._x = 0;
      this._y = 0;
      this._z = 0;
      this._w = 1;
    } else {
      l = 1 / l;
      this._x = this._x * l;
      this._y = this._y * l;
      this._z = this._z * l;
      this._w = this._w * l;
    }
    this._onChangeCallback();
    return this;
  }

  multiply(q: QuaternionLike): this {
    return this.multiplyQuaternions(this, q);
  }

  premultiply(q: QuaternionLike): this {
    return this.multiplyQuaternions(q, this);
  }

  multiplyQuaternions(a: QuaternionLike, b: QuaternionLike): this {
    // from http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/code/index.htm
    const qax = a.x;
    const qay = a.y;
    const qaz = a.z;
    const qaw = a.w;
    const qbx = b.x;
    const qby = b.y;
    const qbz = b.z;
    const qbw = b.w;

    this._x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    this._y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    this._z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    this._w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;

    this._onChangeCallback();
    return this;
  }

  slerp(qb: QuaternionLike, t: number): this {
    let x = qb.x;
    let y = qb.y;
    let z = qb.z;
    let w = qb.w;

    let dot = this.dot(qb);
    if (dot < 0) {
      x = -x;
      y = -y;
      z = -z;
      w = -w;
      dot = -dot;
    }

    let s = 1 - t;
    if (dot < 0.9995) {
      // slerp
      const theta = Math.acos(dot);
      const sin = Math.sin(theta);
      s = Math.sin(s * theta) / sin;
      t = Math.sin(t * theta) / sin;
      this._x = this._x * s + x * t;
      this._y = this._y * s + y * t;
      this._z = this._z * s + z * t;
      this._w = this._w * s + w * t;
      this._onChangeCallback();
    } else {
      // for small angles, lerp then normalize
      this._x = this._x * s + x * t;
      this._y = this._y * s + y * t;
      this._z = this._z * s + z * t;
      this._w = this._w * s + w * t;
      this.normalize(); // normalize calls _onChangeCallback()
    }

    return this;
  }

  slerpQuaternions(qa: QuaternionLike, qb: QuaternionLike, t: number): this {
    return this.copy(qa).slerp(qb, t);
  }

  random(): this {
    // sets this quaternion to a uniform random unit quaternnion
    const theta1 = 2 * Math.PI * Math.random();
    const theta2 = 2 * Math.PI * Math.random();
    const x0 = Math.random();
    const r1 = Math.sqrt(1 - x0);
    const r2 = Math.sqrt(x0);
    return this.set(r1 * Math.sin(theta1), r1 * Math.cos(theta1), r2 * Math.sin(theta2), r2 * Math.cos(theta2));
  }

  equals(quaternion: QuaternionLike): boolean {
    return quaternion.x === this._x && quaternion.y === this._y && quaternion.z === this._z && quaternion.w === this._w;
  }

  fromArray(array: ArrayLike<number>, offset = 0): this {
    this._x = array[offset]!;
    this._y = array[offset + 1]!;
    this._z = array[offset + 2]!;
    this._w = array[offset + 3]!;
    this._onChangeCallback();
    return this;
  }

  toArray(array: number[] = [], offset = 0): number[] {
    array[offset] = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._w;
    return array;
  }

  fromBufferAttribute(attribute: BufferAttributeLike4, index: number): this {
    this._x = attribute.getX(index);
    this._y = attribute.getY(index);
    this._z = attribute.getZ(index);
    this._w = attribute.getW(index);
    this._onChangeCallback();
    return this;
  }

  toJSON(): number[] {
    return this.toArray();
  }

  _onChange(callback: () => void): this {
    this._onChangeCallback = callback;
    return this;
  }

  _onChangeCallback(): void {}

  *[Symbol.iterator](): Generator<number, void, undefined> {
    yield this._x;
    yield this._y;
    yield this._z;
    yield this._w;
  }
}

(Quaternion.prototype as { isQuaternion: boolean }).isQuaternion = true;
