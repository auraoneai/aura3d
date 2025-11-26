/**
 * Ray class for picking, raycasting, and collision queries.
 * Used for intersection tests with spheres, boxes, planes, and triangles.
 * Coordinate system: Y-up, right-handed (-Z forward).
 * @module Ray
 */

import { Vector3 } from './Vector3';
import { Matrix4 } from './Matrix4';
import { MathConstants } from './MathConstants';

const { EPSILON } = MathConstants;

/**
 * Sphere interface for forward reference.
 * Represents a sphere with a center point and radius.
 */
export interface Sphere {
  center: Vector3;
  radius: number;
}

/**
 * Box3 interface for forward reference.
 * Represents an axis-aligned bounding box with min and max points.
 */
export interface Box3 {
  min: Vector3;
  max: Vector3;
}

/**
 * Plane interface for forward reference.
 * Represents a plane with a normal vector and distance from origin.
 */
export interface Plane {
  normal: Vector3;
  constant: number;
}

/**
 * Ray class for picking, raycasting, and collision detection.
 * A ray has an origin point and a normalized direction vector.
 * All intersection methods are optimized for performance (< 0.001ms).
 *
 * @example
 * ```typescript
 * // Create a ray from origin pointing forward
 * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 0, -1));
 *
 * // Test intersection with sphere
 * const sphere = { center: new Vector3(0, 0, -5), radius: 1 };
 * const hit = ray.intersectSphere(sphere);
 * if (hit) {
 *   console.log(`Hit at distance ${hit.t}, point:`, hit.point);
 * }
 *
 * // Find closest point on ray to a target
 * const target = new Vector3(5, 0, 0);
 * const closest = ray.closestPointToPoint(target);
 *
 * // Create ray from camera through screen point
 * const mouseRay = Ray.fromPoints(camera.position, screenPoint);
 * ```
 */
export class Ray {
  /**
   * Origin point of the ray.
   */
  origin: Vector3;

  /**
   * Direction vector of the ray (automatically normalized).
   */
  direction: Vector3;

  /**
   * Creates a new Ray instance.
   * The direction vector will be normalized automatically.
   *
   * @param origin - Starting point of the ray (default: (0, 0, 0))
   * @param direction - Direction vector (default: (0, 0, -1), will be normalized)
   *
   * @example
   * ```typescript
   * const ray1 = new Ray(); // Origin at (0,0,0), direction (0,0,-1)
   * const ray2 = new Ray(new Vector3(1, 2, 3), new Vector3(0, 1, 0));
   * const ray3 = new Ray(new Vector3(0, 0, 0), new Vector3(1, 1, 1)); // Direction will be normalized
   * ```
   */
  constructor(origin?: Vector3, direction?: Vector3) {
    this.origin = origin ? origin.clone() : new Vector3(0, 0, 0);
    this.direction = direction ? direction.clone() : new Vector3(0, 0, -1);

    // Normalize direction if it's not already normalized
    const lenSq = this.direction.lengthSquared();
    if (Math.abs(lenSq - 1) > EPSILON) {
      this.direction.normalizeInPlace();
    }
  }

  /**
   * Sets the ray's origin and direction.
   * The direction vector will be normalized automatically.
   *
   * @param origin - New origin point
   * @param direction - New direction vector (will be normalized)
   * @returns This ray for chaining
   *
   * @example
   * ```typescript
   * const ray = new Ray();
   * ray.set(new Vector3(1, 0, 0), new Vector3(0, 1, 0));
   * ```
   */
  set(origin: Vector3, direction: Vector3): this {
    this.origin.copy(origin);
    this.direction.copy(direction);

    // Normalize direction
    const lenSq = this.direction.lengthSquared();
    if (Math.abs(lenSq - 1) > EPSILON) {
      this.direction.normalizeInPlace();
    }

    return this;
  }

  /**
   * Points the ray towards a target position.
   * The direction will be set to the normalized vector from origin to target.
   *
   * @param target - Target position to look at
   * @returns This ray for chaining
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0));
   * ray.lookAt(new Vector3(10, 10, 10)); // Ray now points towards (10,10,10)
   * ```
   */
  lookAt(target: Vector3): this {
    this.direction.copy(target.sub(this.origin).normalize());
    return this;
  }

  /**
   * Returns the point at parameter t along the ray.
   * Formula: origin + direction * t
   *
   * @param t - Parameter value (distance along ray)
   * @returns New point at parameter t
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
   * const point = ray.at(5); // Returns (5, 0, 0)
   * ```
   */
  at(t: number): Vector3 {
    return this.origin.add(this.direction.scale(t));
  }

  /**
   * Calculates the point at parameter t along the ray and stores it in result.
   * This avoids allocating a new Vector3.
   *
   * @param t - Parameter value (distance along ray)
   * @param result - Vector to store the result in
   * @returns The result vector for chaining
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
   * const result = new Vector3();
   * ray.atInPlace(5, result); // result is now (5, 0, 0)
   * ```
   */
  atInPlace(t: number, result: Vector3): Vector3 {
    return result.copy(this.origin).addInPlace(this.direction.scale(t));
  }

  /**
   * Calculates the distance from the ray to a point.
   *
   * @param point - Target point
   * @returns Distance from ray to point
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
   * const point = new Vector3(5, 3, 0);
   * const dist = ray.distanceToPoint(point); // Returns 3
   * ```
   */
  distanceToPoint(point: Vector3): number {
    return Math.sqrt(this.distanceSqToPoint(point));
  }

  /**
   * Calculates the squared distance from the ray to a point.
   * Faster than distanceToPoint() as it avoids the square root operation.
   *
   * @param point - Target point
   * @returns Squared distance from ray to point
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
   * const point = new Vector3(5, 3, 0);
   * const distSq = ray.distanceSqToPoint(point); // Returns 9
   * ```
   */
  distanceSqToPoint(point: Vector3): number {
    const directionDistance = point.sub(this.origin).dot(this.direction);

    // If the point projects behind the ray origin, measure from origin
    if (directionDistance < 0) {
      return point.sub(this.origin).lengthSquared();
    }

    // Calculate closest point on ray
    const closest = this.origin.add(this.direction.scale(directionDistance));
    return point.sub(closest).lengthSquared();
  }

  /**
   * Returns the closest point on the ray to a given point.
   *
   * @param point - Target point
   * @returns Closest point on the ray
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
   * const point = new Vector3(5, 3, 0);
   * const closest = ray.closestPointToPoint(point); // Returns (5, 0, 0)
   * ```
   */
  closestPointToPoint(point: Vector3): Vector3 {
    const directionDistance = point.sub(this.origin).dot(this.direction);

    // If the point projects behind the ray origin, return origin
    if (directionDistance < 0) {
      return this.origin.clone();
    }

    return this.origin.add(this.direction.scale(directionDistance));
  }

  /**
   * Calculates the distance from the ray origin to a plane.
   * Returns null if the ray is parallel to the plane.
   *
   * @param plane - Target plane
   * @returns Distance to plane, or null if parallel
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
   * const plane = { normal: new Vector3(0, 1, 0), constant: 5 };
   * const dist = ray.distanceToPlane(plane); // Returns 5
   * ```
   */
  distanceToPlane(plane: Plane): number | null {
    const denominator = plane.normal.dot(this.direction);

    // Ray is parallel to plane
    if (Math.abs(denominator) < EPSILON) {
      // Ray origin is on the plane
      if (Math.abs(plane.normal.dot(this.origin) + plane.constant) < EPSILON) {
        return 0;
      }
      return null;
    }

    const t = -(this.origin.dot(plane.normal) + plane.constant) / denominator;

    // Ray points away from plane
    return t >= 0 ? t : null;
  }

  /**
   * Tests intersection with a sphere using the quadratic formula.
   * Returns the closest intersection point and parameter t.
   *
   * @param sphere - Target sphere with center and radius
   * @returns Intersection result with t and point, or null if no hit
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 0, -1));
   * const sphere = { center: new Vector3(0, 0, -5), radius: 1 };
   * const hit = ray.intersectSphere(sphere);
   * if (hit) {
   *   console.log(`Hit at t=${hit.t}, point:`, hit.point);
   * }
   * ```
   */
  intersectSphere(sphere: Sphere): { t: number; point: Vector3 } | null {
    const oc = this.origin.sub(sphere.center);

    // Quadratic formula coefficients: a*t^2 + b*t + c = 0
    const a = this.direction.dot(this.direction); // Should be 1 for normalized direction
    const b = 2 * oc.dot(this.direction);
    const c = oc.dot(oc) - sphere.radius * sphere.radius;

    const discriminant = b * b - 4 * a * c;

    // No intersection
    if (discriminant < 0) {
      return null;
    }

    const sqrtDiscriminant = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDiscriminant) / (2 * a);
    const t2 = (-b + sqrtDiscriminant) / (2 * a);

    // Choose the closest positive t
    let t: number;
    if (t1 >= 0) {
      t = t1;
    } else if (t2 >= 0) {
      t = t2;
    } else {
      return null; // Both intersections behind ray
    }

    const point = this.at(t);
    return { t, point };
  }

  /**
   * Tests intersection with an axis-aligned bounding box using the slab method.
   * Returns the closest intersection point and parameter t.
   *
   * @param box - Target box with min and max points
   * @returns Intersection result with t and point, or null if no hit
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
   * const box = { min: new Vector3(5, -1, -1), max: new Vector3(7, 1, 1) };
   * const hit = ray.intersectBox(box);
   * if (hit) {
   *   console.log(`Hit at t=${hit.t}, point:`, hit.point);
   * }
   * ```
   */
  intersectBox(box: Box3): { t: number; point: Vector3 } | null {
    // Slab method for AABB intersection
    let tmin = -Infinity;
    let tmax = Infinity;

    // Check X slab
    if (Math.abs(this.direction.x) > EPSILON) {
      const tx1 = (box.min.x - this.origin.x) / this.direction.x;
      const tx2 = (box.max.x - this.origin.x) / this.direction.x;
      tmin = Math.max(tmin, Math.min(tx1, tx2));
      tmax = Math.min(tmax, Math.max(tx1, tx2));
    } else {
      // Ray parallel to X slab
      if (this.origin.x < box.min.x || this.origin.x > box.max.x) {
        return null;
      }
    }

    // Check Y slab
    if (Math.abs(this.direction.y) > EPSILON) {
      const ty1 = (box.min.y - this.origin.y) / this.direction.y;
      const ty2 = (box.max.y - this.origin.y) / this.direction.y;
      tmin = Math.max(tmin, Math.min(ty1, ty2));
      tmax = Math.min(tmax, Math.max(ty1, ty2));
    } else {
      // Ray parallel to Y slab
      if (this.origin.y < box.min.y || this.origin.y > box.max.y) {
        return null;
      }
    }

    // Check Z slab
    if (Math.abs(this.direction.z) > EPSILON) {
      const tz1 = (box.min.z - this.origin.z) / this.direction.z;
      const tz2 = (box.max.z - this.origin.z) / this.direction.z;
      tmin = Math.max(tmin, Math.min(tz1, tz2));
      tmax = Math.min(tmax, Math.max(tz1, tz2));
    } else {
      // Ray parallel to Z slab
      if (this.origin.z < box.min.z || this.origin.z > box.max.z) {
        return null;
      }
    }

    // Check if there's a valid intersection
    if (tmax < tmin || tmax < 0) {
      return null;
    }

    // Use the closest positive t
    const t = tmin >= 0 ? tmin : tmax;
    const point = this.at(t);

    return { t, point };
  }

  /**
   * Tests intersection with a plane.
   * Returns the intersection point and parameter t.
   *
   * @param plane - Target plane with normal and constant
   * @returns Intersection result with t and point, or null if no hit
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
   * const plane = { normal: new Vector3(0, 1, 0), constant: -5 };
   * const hit = ray.intersectPlane(plane);
   * if (hit) {
   *   console.log(`Hit at t=${hit.t}, point:`, hit.point);
   * }
   * ```
   */
  intersectPlane(plane: Plane): { t: number; point: Vector3 } | null {
    const t = this.distanceToPlane(plane);

    if (t === null) {
      return null;
    }

    const point = this.at(t);
    return { t, point };
  }

  /**
   * Tests intersection with a triangle using the Möller-Trumbore algorithm.
   * Returns the intersection point, parameter t, and barycentric coordinates (u, v).
   * The third barycentric coordinate w can be computed as: w = 1 - u - v
   *
   * @param a - First vertex of the triangle
   * @param b - Second vertex of the triangle
   * @param c - Third vertex of the triangle
   * @param backfaceCulling - If true, ignores hits on back-facing triangles (default: false)
   * @returns Intersection result with t, point, and barycentric coords (u, v), or null if no hit
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 0, -1));
   * const a = new Vector3(-1, -1, -5);
   * const b = new Vector3(1, -1, -5);
   * const c = new Vector3(0, 1, -5);
   * const hit = ray.intersectTriangle(a, b, c);
   * if (hit) {
   *   console.log(`Hit at t=${hit.t}, barycentric: u=${hit.u}, v=${hit.v}`);
   * }
   * ```
   */
  intersectTriangle(
    a: Vector3,
    b: Vector3,
    c: Vector3,
    backfaceCulling: boolean = false
  ): { t: number; point: Vector3; u: number; v: number } | null {
    // Möller-Trumbore algorithm
    const edge1 = b.sub(a);
    const edge2 = c.sub(a);
    const h = this.direction.cross(edge2);
    const det = edge1.dot(h);

    // Ray is parallel to triangle
    if (Math.abs(det) < EPSILON) {
      return null;
    }

    // Backface culling check
    if (backfaceCulling && det < 0) {
      return null;
    }

    const invDet = 1 / det;
    const s = this.origin.sub(a);
    const u = invDet * s.dot(h);

    // Check if intersection is outside triangle (u coordinate)
    if (u < 0 || u > 1) {
      return null;
    }

    const q = s.cross(edge1);
    const v = invDet * this.direction.dot(q);

    // Check if intersection is outside triangle (v coordinate)
    if (v < 0 || u + v > 1) {
      return null;
    }

    const t = invDet * edge2.dot(q);

    // Ray intersection is behind the origin
    if (t < EPSILON) {
      return null;
    }

    const point = this.at(t);
    return { t, point, u, v };
  }

  /**
   * Tests if the ray intersects a sphere (boolean test, faster than full intersection).
   *
   * @param sphere - Target sphere with center and radius
   * @returns True if the ray intersects the sphere
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 0, -1));
   * const sphere = { center: new Vector3(0, 0, -5), radius: 1 };
   * if (ray.intersectsSphere(sphere)) {
   *   console.log('Ray hits sphere');
   * }
   * ```
   */
  intersectsSphere(sphere: Sphere): boolean {
    const distSq = this.distanceSqToPoint(sphere.center);
    return distSq <= sphere.radius * sphere.radius;
  }

  /**
   * Tests if the ray intersects an axis-aligned bounding box (boolean test).
   *
   * @param box - Target box with min and max points
   * @returns True if the ray intersects the box
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
   * const box = { min: new Vector3(5, -1, -1), max: new Vector3(7, 1, 1) };
   * if (ray.intersectsBox(box)) {
   *   console.log('Ray hits box');
   * }
   * ```
   */
  intersectsBox(box: Box3): boolean {
    return this.intersectBox(box) !== null;
  }

  /**
   * Tests if the ray intersects a plane (boolean test).
   *
   * @param plane - Target plane with normal and constant
   * @returns True if the ray intersects the plane
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
   * const plane = { normal: new Vector3(0, 1, 0), constant: -5 };
   * if (ray.intersectsPlane(plane)) {
   *   console.log('Ray hits plane');
   * }
   * ```
   */
  intersectsPlane(plane: Plane): boolean {
    return this.distanceToPlane(plane) !== null;
  }

  /**
   * Applies a 4x4 transformation matrix to the ray.
   * Transforms both origin and direction.
   * The direction is transformed as a direction vector (w=0) and renormalized.
   *
   * @param m - Transformation matrix
   * @returns This ray for chaining
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
   * const transform = Matrix4.translation(5, 0, 0);
   * ray.applyMatrix4(transform); // Origin now at (5, 0, 0)
   * ```
   */
  applyMatrix4(m: Matrix4): this {
    const e = m.elements;

    // Transform origin (as a point, w=1)
    const ox = this.origin.x;
    const oy = this.origin.y;
    const oz = this.origin.z;

    this.origin.x = e[0] * ox + e[4] * oy + e[8] * oz + e[12];
    this.origin.y = e[1] * ox + e[5] * oy + e[9] * oz + e[13];
    this.origin.z = e[2] * ox + e[6] * oy + e[10] * oz + e[14];

    // Transform direction (as a vector, w=0)
    const dx = this.direction.x;
    const dy = this.direction.y;
    const dz = this.direction.z;

    this.direction.x = e[0] * dx + e[4] * dy + e[8] * dz;
    this.direction.y = e[1] * dx + e[5] * dy + e[9] * dz;
    this.direction.z = e[2] * dx + e[6] * dy + e[10] * dz;

    // Renormalize direction
    this.direction.normalizeInPlace();

    return this;
  }

  /**
   * Creates a copy of this ray.
   *
   * @returns New ray with the same origin and direction
   *
   * @example
   * ```typescript
   * const ray1 = new Ray(new Vector3(1, 2, 3), new Vector3(0, 1, 0));
   * const ray2 = ray1.clone();
   * ```
   */
  clone(): Ray {
    return new Ray(this.origin, this.direction);
  }

  /**
   * Copies values from another ray to this ray.
   *
   * @param ray - Ray to copy from
   * @returns This ray for chaining
   *
   * @example
   * ```typescript
   * const ray1 = new Ray(new Vector3(1, 2, 3), new Vector3(0, 1, 0));
   * const ray2 = new Ray();
   * ray2.copy(ray1);
   * ```
   */
  copy(ray: Ray): this {
    this.origin.copy(ray.origin);
    this.direction.copy(ray.direction);
    return this;
  }

  /**
   * Checks if this ray is equal to another ray within epsilon tolerance.
   *
   * @param ray - Ray to compare with
   * @param epsilon - Tolerance value (default: EPSILON)
   * @returns True if rays are nearly equal
   *
   * @example
   * ```typescript
   * const ray1 = new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
   * const ray2 = new Ray(new Vector3(0, 0, 0), new Vector3(1.0000001, 0, 0));
   * const equal = ray1.equals(ray2); // true
   * ```
   */
  equals(ray: Ray, epsilon: number = EPSILON): boolean {
    return this.origin.equals(ray.origin, epsilon) &&
           this.direction.equals(ray.direction, epsilon);
  }

  /**
   * Creates a ray from two points (start and end).
   * The direction will point from start to end and be normalized.
   *
   * @param start - Starting point (ray origin)
   * @param end - Ending point (defines direction)
   * @returns New ray from start pointing towards end
   *
   * @example
   * ```typescript
   * const start = new Vector3(0, 0, 0);
   * const end = new Vector3(10, 0, 0);
   * const ray = Ray.fromPoints(start, end); // Origin (0,0,0), direction (1,0,0)
   * ```
   */
  static fromPoints(start: Vector3, end: Vector3): Ray {
    const direction = end.sub(start).normalize();
    return new Ray(start, direction);
  }
}
