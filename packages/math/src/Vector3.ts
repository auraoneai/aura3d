import type { Matrix3 } from "./Matrix3.js";
import type { Matrix4 } from "./Matrix4.js";
import type { Quaternion } from "./Quaternion.js";

export class Vector3 {
  static readonly zero = Object.freeze(new Vector3(0, 0, 0));
  static readonly one = Object.freeze(new Vector3(1, 1, 1));
  static readonly up = Object.freeze(new Vector3(0, 1, 0));
  static readonly right = Object.freeze(new Vector3(1, 0, 0));
  static readonly forward = Object.freeze(new Vector3(0, 0, -1));

  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly z = 0
  ) {}

  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  add(v: Vector3): Vector3 {
    return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  subtract(v: Vector3): Vector3 {
    return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  multiplyScalar(scalar: number): Vector3 {
    return new Vector3(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  multiply(v: Vector3): Vector3 {
    return new Vector3(this.x * v.x, this.y * v.y, this.z * v.z);
  }

  divide(v: Vector3): Vector3 {
    return new Vector3(this.x / v.x, this.y / v.y, this.z / v.z);
  }

  divideScalar(scalar: number): Vector3 {
    return new Vector3(this.x / scalar, this.y / scalar, this.z / scalar);
  }

  dot(v: Vector3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v: Vector3): Vector3 {
    return new Vector3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }

  lengthSquared(): number {
    return this.dot(this);
  }

  length(): number {
    return Math.hypot(this.x, this.y, this.z);
  }

  normalize(): Vector3 {
    const len = this.length();
    return len === 0 ? Vector3.zero.clone() : this.multiplyScalar(1 / len);
  }

  distanceTo(v: Vector3): number {
    return this.subtract(v).length();
  }

  distanceToSquared(v: Vector3): number {
    return this.subtract(v).lengthSquared();
  }

  /** this + v*s (three.js `addScaledVector`). */
  addScaled(v: Vector3, s: number): Vector3 {
    return new Vector3(this.x + v.x * s, this.y + v.y * s, this.z + v.z * s);
  }

  negate(): Vector3 {
    return new Vector3(-this.x, -this.y, -this.z);
  }

  /** Per-component floor to min / ceiling to max (three.js `clamp`). */
  clampTo(min: Vector3, max: Vector3): Vector3 {
    return new Vector3(
      Math.max(min.x, Math.min(max.x, this.x)),
      Math.max(min.y, Math.min(max.y, this.y)),
      Math.max(min.z, Math.min(max.z, this.z))
    );
  }

  /**
   * Transforms this direction by `matrix` (upper-left 3x3) and normalizes
   * (three.js `Vector3.transformDirection`).
   */
  transformDirection(matrix: Matrix4): Vector3 {
    const m = matrix.elements;
    const x = this.x, y = this.y, z = this.z;
    return new Vector3(
      m[0] * x + m[4] * y + m[8] * z,
      m[1] * x + m[5] * y + m[9] * z,
      m[2] * x + m[6] * y + m[10] * z
    ).normalize();
  }

  /** Transforms this vector by a 3x3 matrix (three.js `Vector3.applyMatrix3`). */
  applyMatrix3(matrix: Matrix3): Vector3 {
    const m = matrix.elements;
    const x = this.x, y = this.y, z = this.z;
    return new Vector3(
      m[0] * x + m[3] * y + m[6] * z,
      m[1] * x + m[4] * y + m[7] * z,
      m[2] * x + m[5] * y + m[8] * z
    );
  }

  getComponent(index: 0 | 1 | 2 | number): number {
    return index === 0 ? this.x : index === 1 ? this.y : this.z;
  }

  static fromArray(array: ArrayLike<number>, offset = 0): Vector3 {
    return new Vector3(array[offset]!, array[offset + 1]!, array[offset + 2]!);
  }

  lerp(v: Vector3, t: number): Vector3 {
    return new Vector3(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t, this.z + (v.z - this.z) * t);
  }

  transformMatrix4(matrix: Matrix4): Vector3 {
    return matrix.transformPoint(this);
  }

  rotateByQuaternion(rotation: Quaternion): Vector3 {
    return rotation.rotateVector(this);
  }

  min(v: Vector3): Vector3 {
    return new Vector3(Math.min(this.x, v.x), Math.min(this.y, v.y), Math.min(this.z, v.z));
  }

  max(v: Vector3): Vector3 {
    return new Vector3(Math.max(this.x, v.x), Math.max(this.y, v.y), Math.max(this.z, v.z));
  }

  equals(v: Vector3, epsilon = 1e-10): boolean {
    return Math.abs(this.x - v.x) <= epsilon && Math.abs(this.y - v.y) <= epsilon && Math.abs(this.z - v.z) <= epsilon;
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }
}
