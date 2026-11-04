import { Vector4 as ImmutableVector4 } from "../../Vector4.js";

/** A four-component value accepted by mutable vector operations. */
export interface Vector4Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** A source of four-component vertex attributes. */
export interface BufferAttributeLikeW {
  getX(index: number): number;
  getY(index: number): number;
  getZ(index: number): number;
  getW(index: number): number;
}

interface ElementsLike {
  readonly elements: ArrayLike<number>;
}

/** A mutable four-dimensional vector. Matrices use column-major elements. */
export class Vector4 {
  readonly isVector4 = true;

  constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}

  get width(): number { return this.z; }
  set width(value: number) { this.z = value; }
  get height(): number { return this.w; }
  set height(value: number) { this.w = value; }

  fromImmutable(v: Vector4Like): this { return this.copy(v); }
  toImmutable(): ImmutableVector4 { return new ImmutableVector4(this.x, this.y, this.z, this.w); }

  set(x: number, y: number, z: number, w: number): this {
    this.x = x; this.y = y; this.z = z; this.w = w;
    return this;
  }

  setScalar(scalar: number): this { return this.set(scalar, scalar, scalar, scalar); }
  setX(x: number): this { this.x = x; return this; }
  setY(y: number): this { this.y = y; return this; }
  setZ(z: number): this { this.z = z; return this; }
  setW(w: number): this { this.w = w; return this; }

  setComponent(index: number, value: number): this {
    switch (index) {
      case 0: this.x = value; break;
      case 1: this.y = value; break;
      case 2: this.z = value; break;
      case 3: this.w = value; break;
      default: throw new RangeError(`THREE.Vector4: index is out of range: ${index}`);
    }
    return this;
  }

  getComponent(index: number): number {
    switch (index) {
      case 0: return this.x;
      case 1: return this.y;
      case 2: return this.z;
      case 3: return this.w;
      default: throw new RangeError(`THREE.Vector4: index is out of range: ${index}`);
    }
  }

  clone(): this {
    const Constructor = this.constructor as new (x: number, y: number, z: number, w: number) => this;
    return new Constructor(this.x, this.y, this.z, this.w);
  }

  copy(v: { readonly x: number; readonly y: number; readonly z: number; readonly w?: number }): this {
    return this.set(v.x, v.y, v.z, v.w === undefined ? 1 : v.w);
  }

  add(v: Vector4Like): this { return this.set(this.x + v.x, this.y + v.y, this.z + v.z, this.w + v.w); }
  addScalar(s: number): this { return this.set(this.x + s, this.y + s, this.z + s, this.w + s); }
  addVectors(a: Vector4Like, b: Vector4Like): this { return this.set(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w); }
  addScaledVector(v: Vector4Like, s: number): this {
    return this.set(this.x + v.x * s, this.y + v.y * s, this.z + v.z * s, this.w + v.w * s);
  }
  sub(v: Vector4Like): this { return this.set(this.x - v.x, this.y - v.y, this.z - v.z, this.w - v.w); }
  subScalar(s: number): this { return this.set(this.x - s, this.y - s, this.z - s, this.w - s); }
  subVectors(a: Vector4Like, b: Vector4Like): this { return this.set(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w); }
  multiply(v: Vector4Like): this { return this.set(this.x * v.x, this.y * v.y, this.z * v.z, this.w * v.w); }
  multiplyScalar(scalar: number): this { return this.set(this.x * scalar, this.y * scalar, this.z * scalar, this.w * scalar); }

  applyMatrix4(m: ElementsLike): this {
    const e = m.elements;
    const { x, y, z, w } = this;
    return this.set(
      e[0] * x + e[4] * y + e[8] * z + e[12] * w,
      e[1] * x + e[5] * y + e[9] * z + e[13] * w,
      e[2] * x + e[6] * y + e[10] * z + e[14] * w,
      e[3] * x + e[7] * y + e[11] * z + e[15] * w
    );
  }

  divide(v: Vector4Like): this { return this.set(this.x / v.x, this.y / v.y, this.z / v.z, this.w / v.w); }
  divideScalar(scalar: number): this {
    return this.set(this.x / scalar, this.y / scalar, this.z / scalar, this.w / scalar);
  }

  /** Derive an axis and angle in radians from a nonzero quaternion. */
  setAxisAngleFromQuaternion(q: Vector4Like): this {
    const scale = Math.max(Math.abs(q.x), Math.abs(q.y), Math.abs(q.z));
    if (scale === 0) return this.set(1, 0, 0, q.w < 0 ? 2 * Math.PI : 0);
    const x = q.x / scale, y = q.y / scale, z = q.z / scale;
    const length = Math.hypot(x, y, z);
    return this.set(x / length, y / length, z / length, 2 * Math.atan2(length, q.w / scale));
  }

  /**
   * Extract an axis and angle from the rotation part of a matrix, with the 4.x
   * singularity handling: a matrix within 0.01 of symmetric is treated as the
   * identity (angle 0, axis +x) when it is within 0.1 of it, otherwise as a
   * half turn. The angle comes from the trace, so it lies in [0, pi].
   */
  setAxisAngleFromRotationMatrix(m: ElementsLike): this {
    const e = m.elements;
    const m00 = e[0], m01 = e[4], m02 = e[8];
    const m10 = e[1], m11 = e[5], m12 = e[9];
    const m20 = e[2], m21 = e[6], m22 = e[10];
    const near = 0.01, nearer = 0.1;

    if (Math.abs(m01 - m10) < near && Math.abs(m02 - m20) < near && Math.abs(m12 - m21) < near) {
      if (Math.abs(m01 + m10) < nearer && Math.abs(m02 + m20) < nearer && Math.abs(m12 + m21) < nearer &&
          Math.abs(m00 + m11 + m22 - 3) < nearer) {
        return this.set(1, 0, 0, 0);
      }
      // Half turn: R = 2 n n^T - I, so n_i^2 = (r_ii + 1) / 2 and n_i n_j = (r_ij + r_ji) / 4.
      const xx = (m00 + 1) / 2, yy = (m11 + 1) / 2, zz = (m22 + 1) / 2;
      const xy = (m01 + m10) / 4, xz = (m02 + m20) / 4, yz = (m12 + m21) / 4;
      const diagonal = Math.SQRT1_2;
      let x: number, y: number, z: number;
      if (xx > yy && xx > zz) {
        if (xx < near) { x = 0; y = diagonal; z = diagonal; }
        else { x = Math.sqrt(xx); y = xy / x; z = xz / x; }
      } else if (yy > zz) {
        if (yy < near) { x = diagonal; y = 0; z = diagonal; }
        else { y = Math.sqrt(yy); x = xy / y; z = yz / y; }
      } else if (zz < near) { x = diagonal; y = diagonal; z = 0; }
      else { z = Math.sqrt(zz); x = xz / z; y = yz / z; }
      return this.set(x, y, z, Math.PI);
    }

    let sine = Math.hypot(m21 - m12, m02 - m20, m10 - m01);
    if (Math.abs(sine) < 0.001) sine = 1;
    return this.set((m21 - m12) / sine, (m02 - m20) / sine, (m10 - m01) / sine,
      Math.acos((m00 + m11 + m22 - 1) / 2));
  }

  setFromMatrixPosition(m: ElementsLike): this {
    const e = m.elements;
    return this.set(e[12], e[13], e[14], e[15]);
  }

  min(v: Vector4Like): this { return this.set(Math.min(this.x, v.x), Math.min(this.y, v.y), Math.min(this.z, v.z), Math.min(this.w, v.w)); }
  max(v: Vector4Like): this { return this.set(Math.max(this.x, v.x), Math.max(this.y, v.y), Math.max(this.z, v.z), Math.max(this.w, v.w)); }
  clamp(min: Vector4Like, max: Vector4Like): this {
    return this.set(
      Math.max(min.x, Math.min(max.x, this.x)), Math.max(min.y, Math.min(max.y, this.y)),
      Math.max(min.z, Math.min(max.z, this.z)), Math.max(min.w, Math.min(max.w, this.w))
    );
  }
  clampScalar(minVal: number, maxVal: number): this {
    return this.set(
      Math.max(minVal, Math.min(maxVal, this.x)), Math.max(minVal, Math.min(maxVal, this.y)),
      Math.max(minVal, Math.min(maxVal, this.z)), Math.max(minVal, Math.min(maxVal, this.w))
    );
  }
  clampLength(min: number, max: number): this {
    const length = this.length();
    const target = Math.max(min, Math.min(max, length));
    if (length === 0 || target === length) return this;
    return this.normalize().multiplyScalar(target);
  }
  floor(): this { return this.set(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z), Math.floor(this.w)); }
  ceil(): this { return this.set(Math.ceil(this.x), Math.ceil(this.y), Math.ceil(this.z), Math.ceil(this.w)); }
  round(): this { return this.set(Math.round(this.x), Math.round(this.y), Math.round(this.z), Math.round(this.w)); }
  roundToZero(): this { return this.set(Math.trunc(this.x), Math.trunc(this.y), Math.trunc(this.z), Math.trunc(this.w)); }
  negate(): this { return this.set(-this.x, -this.y, -this.z, -this.w); }
  dot(v: Vector4Like): number { return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w; }
  lengthSq(): number { return this.dot(this); }
  length(): number { return Math.hypot(this.x, this.y, this.z, this.w); }
  manhattanLength(): number { return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z) + Math.abs(this.w); }
  normalize(): this {
    const scale = Math.max(Math.abs(this.x), Math.abs(this.y), Math.abs(this.z), Math.abs(this.w));
    if (scale === 0 || Number.isNaN(scale)) return this;
    if (!Number.isFinite(scale)) return this.divideScalar(scale);
    const x = this.x / scale, y = this.y / scale, z = this.z / scale, w = this.w / scale;
    const length = Math.hypot(x, y, z, w);
    return this.set(x / length, y / length, z / length, w / length);
  }
  setLength(length: number): this { return this.normalize().multiplyScalar(length); }
  lerp(v: Vector4Like, alpha: number): this {
    return this.set(
      this.x + (v.x - this.x) * alpha, this.y + (v.y - this.y) * alpha,
      this.z + (v.z - this.z) * alpha, this.w + (v.w - this.w) * alpha
    );
  }
  lerpVectors(v1: Vector4Like, v2: Vector4Like, alpha: number): this {
    return this.set(
      v1.x + (v2.x - v1.x) * alpha, v1.y + (v2.y - v1.y) * alpha,
      v1.z + (v2.z - v1.z) * alpha, v1.w + (v2.w - v1.w) * alpha
    );
  }
  equals(v: Vector4Like): boolean { return this.x === v.x && this.y === v.y && this.z === v.z && this.w === v.w; }
  fromArray(array: ArrayLike<number>, offset = 0): this {
    return this.set(array[offset], array[offset + 1], array[offset + 2], array[offset + 3]);
  }
  toArray(array: number[] = [], offset = 0): number[] {
    array[offset] = this.x; array[offset + 1] = this.y; array[offset + 2] = this.z; array[offset + 3] = this.w;
    return array;
  }
  fromBufferAttribute(attribute: BufferAttributeLikeW, index: number): this {
    return this.set(attribute.getX(index), attribute.getY(index), attribute.getZ(index), attribute.getW(index));
  }
  random(): this { return this.set(Math.random(), Math.random(), Math.random(), Math.random()); }
  *[Symbol.iterator](): Generator<number, void, undefined> {
    yield this.x; yield this.y; yield this.z; yield this.w;
  }
}
