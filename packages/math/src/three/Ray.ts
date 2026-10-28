import { Ray as ImmutableRay } from "../Ray.js";
import { Vector3 } from "./Vector3.js";
import type { Vector3Like } from "./Vector3.js";
import type { Box3Like } from "./Box3.js";

/** Anything with `origin` and `direction` corners, including the immutable `@aura3d/math` Ray. */
export interface RayLike {
  readonly origin: Vector3Like;
  readonly direction: Vector3Like;
}

interface SphereLike {
  readonly center: Vector3Like;
  readonly radius: number;
}

interface PlaneLike {
  readonly normal: Vector3Like;
  readonly constant: number;
  distanceToPoint(point: Vector3): number;
}

const _vector = new Vector3();
const _segCenter = new Vector3();
const _segDir = new Vector3();
const _diff = new Vector3();

const _edge1 = new Vector3();
const _edge2 = new Vector3();
const _normal = new Vector3();

/**
 * Mutable three.js-compatible ray. Every modifier mutates `this` and returns
 * `this`, exactly like three r185 `Ray`, including `null` for intersection
 * misses (the immutable `@aura3d/math` Ray returns `undefined`).
 */
export class Ray {
  origin: Vector3;
  direction: Vector3;

  constructor(origin: Vector3 = new Vector3(), direction: Vector3 = new Vector3(0, 0, -1)) {
    this.origin = origin;
    this.direction = direction;
  }

  /** Copy an immutable `@aura3d/math` Ray (or any `{origin, direction}`) into this ray. */
  fromImmutable(ray: RayLike): this {
    this.origin.copy(ray.origin);
    this.direction.copy(ray.direction);
    return this;
  }

  /** Snapshot as an immutable `@aura3d/math` Ray (normalizes the direction, throws on a zero direction). */
  toImmutable(): ImmutableRay {
    return new ImmutableRay(this.origin.toImmutable(), this.direction.toImmutable());
  }

  set(origin: Vector3Like, direction: Vector3Like): this {
    this.origin.copy(origin);
    this.direction.copy(direction);

    return this;
  }

  copy(ray: RayLike): this {
    this.origin.copy(ray.origin);
    this.direction.copy(ray.direction);

    return this;
  }

  at(t: number, target: Vector3): Vector3 {
    return target.copy(this.origin).addScaledVector(this.direction, t);
  }

  lookAt(v: Vector3Like): this {
    this.direction.copy(v).sub(this.origin).normalize();

    return this;
  }

  recast(t: number): this {
    this.origin.copy(this.at(t, _vector));

    return this;
  }

  closestPointToPoint(point: Vector3Like, target: Vector3): Vector3 {
    target.subVectors(point, this.origin);

    const directionDistance = target.dot(this.direction);

    if (directionDistance < 0) {
      return target.copy(this.origin);
    }

    return target.copy(this.origin).addScaledVector(this.direction, directionDistance);
  }

  distanceToPoint(point: Vector3): number {
    return Math.sqrt(this.distanceSqToPoint(point));
  }

  distanceSqToPoint(point: Vector3): number {
    const directionDistance = _vector.subVectors(point, this.origin).dot(this.direction);

    // point behind the ray

    if (directionDistance < 0) {
      return this.origin.distanceToSquared(point);
    }

    _vector.copy(this.origin).addScaledVector(this.direction, directionDistance);

    return _vector.distanceToSquared(point);
  }

  distanceSqToSegment(v0: Vector3, v1: Vector3, optionalPointOnRay?: Vector3, optionalPointOnSegment?: Vector3): number {
    // from https://github.com/pmjoniak/GeometricTools/blob/master/GTEngine/Include/Mathematics/GteDistRaySegment.h
    // It returns the min distance between the ray and the segment
    // defined by v0 and v1
    // It can also set two optional targets :
    // - The closest point on the ray
    // - The closest point on the segment

    _segCenter.copy(v0).add(v1).multiplyScalar(0.5);
    _segDir.copy(v1).sub(v0).normalize();
    _diff.copy(this.origin).sub(_segCenter);

    const segExtent = v0.distanceTo(v1) * 0.5;
    const a01 = -this.direction.dot(_segDir);
    const b0 = _diff.dot(this.direction);
    const b1 = -_diff.dot(_segDir);
    const c = _diff.lengthSq();
    const det = Math.abs(1 - a01 * a01);
    let s0: number;
    let s1: number;
    let sqrDist: number;
    let extDet: number;

    if (det > 0) {
      // The ray and segment are not parallel.

      s0 = a01 * b1 - b0;
      s1 = a01 * b0 - b1;
      extDet = segExtent * det;

      if (s0 >= 0) {
        if (s1 >= -extDet) {
          if (s1 <= extDet) {
            // region 0
            // Minimum at interior points of ray and segment.

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
      } else if (s1 <= -extDet) {
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
    } else {
      // Ray and segment are parallel.

      s1 = a01 > 0 ? -segExtent : segExtent;
      s0 = Math.max(0, -(a01 * s1 + b0));
      sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
    }

    if (optionalPointOnRay) {
      optionalPointOnRay.copy(this.origin).addScaledVector(this.direction, s0);
    }

    if (optionalPointOnSegment) {
      optionalPointOnSegment.copy(_segCenter).addScaledVector(_segDir, s1);
    }

    return sqrDist;
  }

  intersectSphere(sphere: SphereLike, target: Vector3): Vector3 | null {
    _vector.subVectors(sphere.center, this.origin);
    const tca = _vector.dot(this.direction);
    const d2 = _vector.dot(_vector) - tca * tca;
    const radius2 = sphere.radius * sphere.radius;

    if (d2 > radius2) return null;

    const thc = Math.sqrt(radius2 - d2);

    // t0 = first intersect point - entrance on front of sphere
    const t0 = tca - thc;

    // t1 = second intersect point - exit point on back of sphere
    const t1 = tca + thc;

    // test to see if t1 is behind the ray - if so, return null
    if (t1 < 0) return null;

    // test to see if t0 is behind the ray:
    // if it is, the ray is inside the sphere, so return the second exit point scaled by t1,
    // in order to always return an intersect point that is in front of the ray.
    if (t0 < 0) return this.at(t1, target);

    // else t0 is in front of the ray, so return the first collision point scaled by t0
    return this.at(t0, target);
  }

  intersectsSphere(sphere: SphereLike): boolean {
    if (sphere.radius < 0) return false; // handle empty spheres, see #31187

    return this.distanceSqToPoint(sphere.center as Vector3) <= sphere.radius * sphere.radius;
  }

  distanceToPlane(plane: PlaneLike): number | null {
    const denominator = _normalDot(plane.normal, this.direction);

    if (denominator === 0) {
      // line is coplanar, return origin
      if (plane.distanceToPoint(this.origin) === 0) {
        return 0;
      }

      // Null is preferable to undefined since undefined means.... it is undefined

      return null;
    }

    const t = -(_originDot(this.origin, plane.normal) + plane.constant) / denominator;

    // Return if the ray never intersects the plane

    return t >= 0 ? t : null;
  }

  intersectPlane(plane: PlaneLike, target: Vector3): Vector3 | null {
    const t = this.distanceToPlane(plane);

    if (t === null) {
      return null;
    }

    return this.at(t, target);
  }

  intersectsPlane(plane: PlaneLike): boolean {
    // check if the ray lies on the plane first

    const distToPoint = plane.distanceToPoint(this.origin);

    if (distToPoint === 0) {
      return true;
    }

    const denominator = _normalDot(plane.normal, this.direction);

    if (denominator * distToPoint < 0) {
      return true;
    }

    // ray origin is behind the plane (and is pointing behind it)

    return false;
  }

  intersectBox(box: Box3Like, target: Vector3): Vector3 | null {
    let tmin: number;
    let tmax: number;
    let tymin: number;
    let tymax: number;
    let tzmin: number;
    let tzmax: number;

    const invdirx = 1 / this.direction.x;
    const invdiry = 1 / this.direction.y;
    const invdirz = 1 / this.direction.z;

    const origin = this.origin;

    if (invdirx >= 0) {
      tmin = (box.min.x - origin.x) * invdirx;
      tmax = (box.max.x - origin.x) * invdirx;
    } else {
      tmin = (box.max.x - origin.x) * invdirx;
      tmax = (box.min.x - origin.x) * invdirx;
    }

    if (invdiry >= 0) {
      tymin = (box.min.y - origin.y) * invdiry;
      tymax = (box.max.y - origin.y) * invdiry;
    } else {
      tymin = (box.max.y - origin.y) * invdiry;
      tymax = (box.min.y - origin.y) * invdiry;
    }

    if (tmin > tymax || tymin > tmax) return null;

    if (tymin > tmin || isNaN(tmin)) tmin = tymin;

    if (tymax < tmax || isNaN(tmax)) tmax = tymax;

    if (invdirz >= 0) {
      tzmin = (box.min.z - origin.z) * invdirz;
      tzmax = (box.max.z - origin.z) * invdirz;
    } else {
      tzmin = (box.max.z - origin.z) * invdirz;
      tzmax = (box.min.z - origin.z) * invdirz;
    }

    if (tmin > tzmax || tzmin > tmax) return null;

    if (tzmin > tmin || tmin !== tmin) tmin = tzmin;

    if (tzmax < tmax || tmax !== tmax) tmax = tzmax;

    //return point closest to the ray (positive side)

    if (tmax < 0) return null;

    return this.at(tmin >= 0 ? tmin : tmax, target);
  }

  intersectsBox(box: Box3Like): boolean {
    return this.intersectBox(box, _vector) !== null;
  }

  intersectTriangle(a: Vector3, b: Vector3, c: Vector3, backfaceCulling: boolean, target: Vector3): Vector3 | null {
    // Compute the offset origin, edges, and normal.

    // from https://github.com/pmjoniak/GeometricTools/blob/master/GTEngine/Include/Mathematics/GteIntrRay3Triangle3.h

    _edge1.subVectors(b, a);
    _edge2.subVectors(c, a);
    _normal.crossVectors(_edge1, _edge2);

    // Solve Q + t*D = b1*E1 + b2*E2 (Q = kDiff, D = ray direction,
    // E1 = kEdge1, E2 = kEdge2, N = Cross(E1,E2)) by
    //   |Dot(D,N)|*b1 = sign(Dot(D,N))*Dot(D,Cross(Q,E2))
    //   |Dot(D,N)|*b2 = sign(Dot(D,N))*Dot(D,Cross(E1,Q))
    //   |Dot(D,N)|*t = -sign(Dot(D,N))*Dot(Q,N)
    let DdN = this.direction.dot(_normal);
    let sign: number;

    if (DdN > 0) {
      if (backfaceCulling) return null;
      sign = 1;
    } else if (DdN < 0) {
      sign = -1;
      DdN = -DdN;
    } else {
      return null;
    }

    _diff.subVectors(this.origin, a);
    const DdQxE2 = sign * this.direction.dot(_edge2.crossVectors(_diff, _edge2));

    // b1 < 0, no intersection
    if (DdQxE2 < 0) {
      return null;
    }

    const DdE1xQ = sign * this.direction.dot(_edge1.cross(_diff));

    // b2 < 0, no intersection
    if (DdE1xQ < 0) {
      return null;
    }

    // b1+b2 > 1, no intersection
    if (DdQxE2 + DdE1xQ > DdN) {
      return null;
    }

    // Line intersects triangle, check if ray does.
    const QdN = -sign * _diff.dot(_normal);

    // t < 0, no intersection
    if (QdN < 0) {
      return null;
    }

    // Ray intersects triangle.
    return this.at(QdN / DdN, target);
  }

  applyMatrix4(matrix4: { readonly elements: ArrayLike<number> }): this {
    this.origin.applyMatrix4(matrix4);
    this.direction.transformDirection(matrix4);

    return this;
  }

  equals(ray: RayLike): boolean {
    return this.origin.equals(ray.origin) && this.direction.equals(ray.direction);
  }

  clone(): this {
    return new (this.constructor as new () => this)().copy(this);
  }
}

// `plane.normal` may be a compat Vector3 or an immutable one; the dot products below multiply the same pairs in the same order as three's.
function _normalDot(normal: Vector3Like, direction: Vector3): number {
  return normal.x * direction.x + normal.y * direction.y + normal.z * direction.z;
}

function _originDot(origin: Vector3, normal: Vector3Like): number {
  return origin.x * normal.x + origin.y * normal.y + origin.z * normal.z;
}
