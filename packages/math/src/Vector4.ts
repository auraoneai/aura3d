import type { Matrix4 } from "./Matrix4.js";

export class Vector4 {
  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly z = 0,
    readonly w = 0
  ) {}

  add(v: Vector4): Vector4 {
    return new Vector4(this.x + v.x, this.y + v.y, this.z + v.z, this.w + v.w);
  }

  subtract(v: Vector4): Vector4 {
    return new Vector4(this.x - v.x, this.y - v.y, this.z - v.z, this.w - v.w);
  }

  multiplyScalar(scalar: number): Vector4 {
    return new Vector4(this.x * scalar, this.y * scalar, this.z * scalar, this.w * scalar);
  }

  dot(v: Vector4): number {
    return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
  }

  lerp(v: Vector4, t: number): Vector4 {
    return new Vector4(
      this.x + (v.x - this.x) * t,
      this.y + (v.y - this.y) * t,
      this.z + (v.z - this.z) * t,
      this.w + (v.w - this.w) * t
    );
  }

  transformMatrix4(matrix: Matrix4): Vector4 {
    return matrix.transformVector4(this);
  }

  equals(v: Vector4, epsilon = 1e-10): boolean {
    return Math.abs(this.x - v.x) <= epsilon && Math.abs(this.y - v.y) <= epsilon && Math.abs(this.z - v.z) <= epsilon && Math.abs(this.w - v.w) <= epsilon;
  }

  toArray(): [number, number, number, number] {
    return [this.x, this.y, this.z, this.w];
  }
}
