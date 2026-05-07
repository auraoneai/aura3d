import { Vector3 } from "./Vector3.js";

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
