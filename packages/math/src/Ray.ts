import { Box3 } from "./Box3.js";
import { Plane } from "./Plane.js";
import { Sphere } from "./Sphere.js";
import { Vector3 } from "./Vector3.js";

export class Ray {
  readonly origin: Vector3;
  readonly direction: Vector3;

  constructor(origin = Vector3.zero.clone(), direction = Vector3.forward.clone()) {
    const normalized = direction.normalize();
    if (normalized.lengthSquared() === 0) throw new RangeError("Ray direction must be non-zero.");
    this.origin = origin;
    this.direction = normalized;
  }

  at(distance: number): Vector3 {
    return this.origin.add(this.direction.multiplyScalar(distance));
  }

  intersectPlane(plane: Plane): Vector3 | undefined {
    const denominator = plane.normal.dot(this.direction);
    if (Math.abs(denominator) < 1e-12) return undefined;
    const distance = -(this.origin.dot(plane.normal) + plane.constant) / denominator;
    return distance < 0 ? undefined : this.at(distance);
  }

  intersectSphere(sphere: Sphere): Vector3 | undefined {
    const l = sphere.center.subtract(this.origin);
    const tca = l.dot(this.direction);
    const d2 = l.dot(l) - tca * tca;
    const radius2 = sphere.radius * sphere.radius;
    if (d2 > radius2) return undefined;
    const thc = Math.sqrt(radius2 - d2);
    const t0 = tca - thc;
    const t1 = tca + thc;
    const distance = t0 >= 0 ? t0 : t1;
    return distance < 0 ? undefined : this.at(distance);
  }

  intersectBox(box: Box3): Vector3 | undefined {
    if (box.isEmpty()) return undefined;
    let tmin = Number.NEGATIVE_INFINITY;
    let tmax = Number.POSITIVE_INFINITY;

    for (const axis of ["x", "y", "z"] as const) {
      const origin = this.origin[axis];
      const direction = this.direction[axis];
      const min = box.min[axis];
      const max = box.max[axis];
      if (Math.abs(direction) < 1e-12) {
        if (origin < min || origin > max) return undefined;
        continue;
      }
      const invD = 1 / direction;
      let t1 = (min - origin) * invD;
      let t2 = (max - origin) * invD;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return undefined;
    }

    const distance = tmin >= 0 ? tmin : tmax;
    return distance < 0 ? undefined : this.at(distance);
  }
}
