import { Vector3 } from "./Vector3.js";

export class Sphere {
  constructor(
    readonly center = Vector3.zero.clone(),
    readonly radius = 0
  ) {
    if (!Number.isFinite(radius) || radius < 0) throw new RangeError("Sphere radius must be finite and non-negative.");
  }

  containsPoint(point: Vector3): boolean {
    return this.center.distanceTo(point) <= this.radius;
  }

  intersectsSphere(other: Sphere): boolean {
    return this.center.distanceTo(other.center) <= this.radius + other.radius;
  }
}
