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
