import { Vector3 } from "./Vector3.js";

export class Plane {
  readonly normal: Vector3;
  readonly constant: number;

  constructor(normal = Vector3.up.clone(), constant = 0) {
    const len = normal.length();
    if (len === 0) throw new RangeError("Plane normal must be non-zero.");
    this.normal = normal.multiplyScalar(1 / len);
    this.constant = constant / len;
  }

  static fromPointNormal(point: Vector3, normal: Vector3): Plane {
    const normalized = normal.normalize();
    return new Plane(normalized, -point.dot(normalized));
  }

  distanceToPoint(point: Vector3): number {
    return this.normal.dot(point) + this.constant;
  }

  projectPoint(point: Vector3): Vector3 {
    return point.subtract(this.normal.multiplyScalar(this.distanceToPoint(point)));
  }

  intersectLine(start: Vector3, end: Vector3): Vector3 | undefined {
    const direction = end.subtract(start);
    const denominator = this.normal.dot(direction);
    if (Math.abs(denominator) < 1e-12) return undefined;
    const t = -(start.dot(this.normal) + this.constant) / denominator;
    return t < 0 || t > 1 ? undefined : start.add(direction.multiplyScalar(t));
  }
}
