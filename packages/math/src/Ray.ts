import { Box3 } from "./Box3.js";
import { Plane } from "./Plane.js";
import { Sphere } from "./Sphere.js";
import { Vector3 } from "./Vector3.js";
import type { Matrix4 } from "./Matrix4.js";

/**
 * Ray `origin + t·direction` with normalized `direction` —
 * three.js `Ray` parity (immutable methods).
 */
export class Ray {
  readonly origin: Vector3;
  readonly direction: Vector3;

  constructor(origin = Vector3.zero.clone(), direction = Vector3.forward.clone()) {
    const normalized = direction.normalize();
    if (normalized.lengthSquared() === 0) throw new RangeError("Ray direction must be non-zero.");
    this.origin = origin;
    this.direction = normalized;
  }

  set(origin: Vector3, direction: Vector3): Ray {
    return new Ray(origin, direction);
  }

  clone(): Ray {
    return new Ray(this.origin, this.direction);
  }

  copy(ray: Ray): Ray {
    return new Ray(ray.origin, ray.direction);
  }

  at(t: number): Vector3 {
    return this.origin.add(this.direction.multiplyScalar(t));
  }

  /** Reorients the ray toward `target` (three.js `Ray.lookAt`). */
  lookAt(target: Vector3): Ray {
    return new Ray(this.origin, target.subtract(this.origin).normalize());
  }

  /** Moves the origin forward along the ray (three.js `Ray.recast`). */
  recast(t: number): Ray {
    return new Ray(this.at(t), this.direction);
  }

  /** Point on the ray closest to `point` (three.js `closestPointToPoint`). */
  closestPointToPoint(point: Vector3): Vector3 {
    const directionDistance = point.subtract(this.origin).dot(this.direction);
    if (directionDistance < 0) return this.origin;
    return this.origin.addScaled(this.direction, directionDistance);
  }

  distanceToPoint(point: Vector3): number {
    return Math.sqrt(this.distanceSqToPoint(point));
  }

  distanceSqToPoint(point: Vector3): number {
    const directionDistance = point.subtract(this.origin).dot(this.direction);
    if (directionDistance < 0) {
      return this.origin.distanceToSquared(point);
    }
    const closest = this.origin.addScaled(this.direction, directionDistance);
    return closest.distanceToSquared(point);
  }

  /**
   * Min squared distance between the ray and segment `v0–v1` plus the
   * closest points (three.js `Ray.distanceSqToSegment`, Geometric Tools).
   */
  distanceSqToSegment(v0: Vector3, v1: Vector3): {
    distanceSq: number;
    pointOnRay: Vector3;
    pointOnSegment: Vector3;
  } {
    const segCenter = v0.add(v1).multiplyScalar(0.5);
    const segDir = v1.subtract(v0).normalize();
    const diff = this.origin.subtract(segCenter);

    const segExtent = v0.distanceTo(v1) * 0.5;
    const a01 = -this.direction.dot(segDir);
    const b0 = diff.dot(this.direction);
    const b1 = -diff.dot(segDir);
    const c = diff.lengthSquared();
    const det = Math.abs(1 - a01 * a01);
    let s0: number;
    let s1: number;
    let sqrDist: number;
    let extDet: number;

    if (det > 0) {
      // ray and segment are not parallel
      s0 = a01 * b1 - b0;
      s1 = a01 * b0 - b1;
      extDet = segExtent * det;
      if (s0 >= 0) {
        if (s1 >= -extDet) {
          if (s1 <= extDet) {
            // region 0
            const invDet = 1 / det;
            s0 *= invDet;
            s1 *= invDet;
            sqrDist = s0 * (s0 + a01 * s1 + 2 * b0) + s1 * (a01 * s0 + s1 + 2 * b1) + c;
          } else {
            // region 1
            s1 = segExtent;
            s0 = Math.max(0, -(a01 * s1 + b0));
            sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
          }
        } else {
          // region 5
          s1 = -segExtent;
          s0 = Math.max(0, -(a01 * s1 + b0));
          sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
        }
      } else {
        if (s1 <= -extDet) {
          // region 4
          s0 = Math.max(0, -(-a01 * segExtent + b0));
          s1 = s0 > 0 ? -segExtent : Math.min(Math.max(-segExtent, -b1), segExtent);
          sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
        } else if (s1 <= extDet) {
          // region 3
          s0 = 0;
          s1 = Math.min(Math.max(-segExtent, -b1), segExtent);
          sqrDist = s1 * (s1 + 2 * b1) + c;
        } else {
          // region 2
          s0 = Math.max(0, -(a01 * segExtent + b0));
          s1 = s0 > 0 ? segExtent : Math.min(Math.max(-segExtent, -b1), segExtent);
          sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
        }
      }
    } else {
      // ray and segment are parallel
      s1 = a01 > 0 ? -segExtent : segExtent;
      s0 = Math.max(0, -(a01 * s1 + b0));
      sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
    }

    return {
      distanceSq: sqrDist,
      pointOnRay: this.origin.addScaled(this.direction, s0),
      pointOnSegment: segCenter.addScaled(segDir, s1)
    };
  }

  /** Ray–sphere hit point (closest to the origin), or `undefined`. */
  intersectSphere(sphere: Sphere): Vector3 | undefined {
    const l = sphere.center.subtract(this.origin);
    const tca = l.dot(this.direction);
    const d2 = l.dot(l) - tca * tca;
    const radius2 = sphere.radius * sphere.radius;
    if (d2 > radius2) return undefined;
    const thc = Math.sqrt(radius2 - d2);
    const t0 = tca - thc;
    const t1 = tca + thc;
    if (t1 < 0) return undefined;
    const distance = t0 >= 0 ? t0 : t1;
    return this.at(distance);
  }

  /** three.js `Ray.intersectsSphere` — empty spheres never intersect. */
  intersectsSphere(sphere: Sphere): boolean {
    if (sphere.radius < 0) return false;
    return this.distanceSqToPoint(sphere.center) <= sphere.radius * sphere.radius;
  }

  /** Distance along the ray to `plane`; `null` when parallel/behind (three `distanceToPlane`). */
  distanceToPlane(plane: Plane): number | null {
    const denominator = plane.normal.dot(this.direction);
    if (denominator === 0) {
      // line is coplanar, return origin
      if (plane.distanceToPoint(this.origin) === 0) return 0;
      return null;
    }
    const t = -(this.origin.dot(plane.normal) + plane.constant) / denominator;
    return t >= 0 ? t : null;
  }

  intersectPlane(plane: Plane): Vector3 | undefined {
    const t = this.distanceToPlane(plane);
    if (t === null) return undefined;
    return this.at(t);
  }

  /** three.js `Ray.intersectsPlane`. */
  intersectsPlane(plane: Plane): boolean {
    const distToPoint = plane.distanceToPoint(this.origin);
    if (distToPoint === 0) return true;
    const denominator = plane.normal.dot(this.direction);
    if (denominator * distToPoint < 0) return true;
    return false;
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

  intersectsBox(box: Box3): boolean {
    return this.intersectBox(box) !== undefined;
  }

  /**
   * Ray–triangle intersection (Möller–Trumbore via Geometric Tools) —
   * three.js `Ray.intersectTriangle`. Returns the hit point or `undefined`.
   */
  intersectTriangle(a: Vector3, b: Vector3, c: Vector3, backfaceCulling = false): Vector3 | undefined {
    const edge1 = b.subtract(a);
    const edge2 = c.subtract(a);
    const normal = edge1.cross(edge2);

    let DdN = this.direction.dot(normal);
    let sign: number;
    if (DdN > 0) {
      if (backfaceCulling) return undefined;
      sign = 1;
    } else if (DdN < 0) {
      sign = -1;
      DdN = -DdN;
    } else {
      return undefined;
    }

    const diff = this.origin.subtract(a);
    const DdQxE2 = sign * this.direction.dot(diff.cross(edge2));
    if (DdQxE2 < 0) return undefined; // b1 < 0

    const DdE1xQ = sign * this.direction.dot(edge1.cross(diff));
    if (DdE1xQ < 0) return undefined; // b2 < 0
    if (DdQxE2 + DdE1xQ > DdN) return undefined; // b1+b2 > 1

    const QdN = -sign * diff.dot(normal);
    if (QdN < 0) return undefined; // t < 0

    return this.at(QdN / DdN);
  }

  applyMatrix4(matrix: Matrix4): Ray {
    return new Ray(this.origin.transformMatrix4(matrix), this.direction.transformDirection(matrix));
  }

  equals(ray: Ray, epsilon = 1e-10): boolean {
    return this.origin.equals(ray.origin, epsilon) && this.direction.equals(ray.direction, epsilon);
  }
}
