import { Vector3 } from "./Vector3.js";
import type { Matrix4 } from "./Matrix4.js";

export type EulerOrder = "XYZ";

export class Quaternion {
  static readonly identity = Object.freeze(new Quaternion(0, 0, 0, 1));

  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly z = 0,
    readonly w = 1
  ) {}

  static fromAxisAngle(axis: Vector3, radians: number): Quaternion {
    const normalized = axis.normalize();
    if (normalized.lengthSquared() === 0) throw new RangeError("Axis must be non-zero.");
    const half = radians / 2;
    const s = Math.sin(half);
    return new Quaternion(normalized.x * s, normalized.y * s, normalized.z * s, Math.cos(half)).normalize();
  }

  static fromUnitVectors(from: Vector3, to: Vector3): Quaternion {
    const vFrom = from.normalize();
    const vTo = to.normalize();
    const dot = vFrom.dot(vTo);

    if (dot < -0.999999) {
      const axis = Math.abs(vFrom.x) > 0.1 ? Vector3.up.cross(vFrom).normalize() : Vector3.right.cross(vFrom).normalize();
      return Quaternion.fromAxisAngle(axis, Math.PI);
    }
    if (dot > 0.999999) return Quaternion.identity.clone();

    const cross = vFrom.cross(vTo);
    return new Quaternion(cross.x, cross.y, cross.z, 1 + dot).normalize();
  }

  static fromEuler(x: number, y: number, z: number, order: EulerOrder = "XYZ"): Quaternion {
    if (order !== "XYZ") throw new RangeError(`Unsupported Euler order: ${order}`);
    if (![x, y, z].every(Number.isFinite)) throw new RangeError("Euler angles must be finite.");
    const c1 = Math.cos(x / 2);
    const c2 = Math.cos(y / 2);
    const c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2);
    const s2 = Math.sin(y / 2);
    const s3 = Math.sin(z / 2);
    return new Quaternion(
      s1 * c2 * c3 + c1 * s2 * s3,
      c1 * s2 * c3 - s1 * c2 * s3,
      c1 * c2 * s3 + s1 * s2 * c3,
      c1 * c2 * c3 - s1 * s2 * s3
    ).normalize();
  }

  static fromRotationMatrix(matrix: Matrix4): Quaternion {
    const m = matrix.elements;
    const m11 = m[0]!, m12 = m[4]!, m13 = m[8]!;
    const m21 = m[1]!, m22 = m[5]!, m23 = m[9]!;
    const m31 = m[2]!, m32 = m[6]!, m33 = m[10]!;
    const trace = m11 + m22 + m33;

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      return new Quaternion(
        (m32 - m23) * s,
        (m13 - m31) * s,
        (m21 - m12) * s,
        0.25 / s
      ).normalize();
    }
    if (m11 > m22 && m11 > m33) {
      const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
      return new Quaternion(
        0.25 * s,
        (m12 + m21) / s,
        (m13 + m31) / s,
        (m32 - m23) / s
      ).normalize();
    }
    if (m22 > m33) {
      const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
      return new Quaternion(
        (m12 + m21) / s,
        0.25 * s,
        (m23 + m32) / s,
        (m13 - m31) / s
      ).normalize();
    }
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    return new Quaternion(
      (m13 + m31) / s,
      (m23 + m32) / s,
      0.25 * s,
      (m21 - m12) / s
    ).normalize();
  }

  clone(): Quaternion {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }

  length(): number {
    return Math.hypot(this.x, this.y, this.z, this.w);
  }

  normalize(): Quaternion {
    const len = this.length();
    if (len === 0) return Quaternion.identity.clone();
    return new Quaternion(this.x / len, this.y / len, this.z / len, this.w / len);
  }

  conjugate(): Quaternion {
    return new Quaternion(-this.x, -this.y, -this.z, this.w);
  }

  inverse(): Quaternion {
    const lengthSquared = this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
    if (lengthSquared === 0) return Quaternion.identity.clone();
    const conjugate = this.conjugate();
    return new Quaternion(
      conjugate.x / lengthSquared,
      conjugate.y / lengthSquared,
      conjugate.z / lengthSquared,
      conjugate.w / lengthSquared
    );
  }

  multiply(q: Quaternion): Quaternion {
    return new Quaternion(
      this.w * q.x + this.x * q.w + this.y * q.z - this.z * q.y,
      this.w * q.y - this.x * q.z + this.y * q.w + this.z * q.x,
      this.w * q.z + this.x * q.y - this.y * q.x + this.z * q.w,
      this.w * q.w - this.x * q.x - this.y * q.y - this.z * q.z
    );
  }

  rotateVector(v: Vector3): Vector3 {
    const qv = new Quaternion(v.x, v.y, v.z, 0);
    const result = this.multiply(qv).multiply(this.conjugate());
    return new Vector3(result.x, result.y, result.z);
  }

  slerp(to: Quaternion, t: number): Quaternion {
    let target = to;
    let cosHalfTheta = this.x * to.x + this.y * to.y + this.z * to.z + this.w * to.w;

    if (cosHalfTheta < 0) {
      target = new Quaternion(-to.x, -to.y, -to.z, -to.w);
      cosHalfTheta = -cosHalfTheta;
    }

    if (cosHalfTheta >= 1.0) return this.clone();
    if (cosHalfTheta > 0.9995) {
      return new Quaternion(
        this.x + t * (target.x - this.x),
        this.y + t * (target.y - this.y),
        this.z + t * (target.z - this.z),
        this.w + t * (target.w - this.w)
      ).normalize();
    }

    const halfTheta = Math.acos(cosHalfTheta);
    const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta);
    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
    return new Quaternion(
      this.x * ratioA + target.x * ratioB,
      this.y * ratioA + target.y * ratioB,
      this.z * ratioA + target.z * ratioB,
      this.w * ratioA + target.w * ratioB
    ).normalize();
  }

  equals(q: Quaternion, epsilon = 1e-10): boolean {
    return Math.abs(this.x - q.x) <= epsilon && Math.abs(this.y - q.y) <= epsilon && Math.abs(this.z - q.z) <= epsilon && Math.abs(this.w - q.w) <= epsilon;
  }
}
