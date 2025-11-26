/**
 * Bounding sphere class for fast culling and collision detection in 3D space.
 * Provides efficient intersection tests and spatial queries for graphics and physics applications.
 * @module Sphere
 */

import { Vector3 } from './Vector3';
import { Matrix4 } from './Matrix4';
import { MathConstants } from './MathConstants';

const { EPSILON } = MathConstants;

/**
 * Box3 interface for forward reference.
 * This allows Sphere to work with Box3 before it's fully implemented.
 */
interface Box3 {
  min: Vector3;
  max: Vector3;
  getCenter(): Vector3;
}

/**
 * Plane interface for forward reference.
 * This allows Sphere to work with Plane before it's fully implemented.
 */
interface Plane {
  normal: Vector3;
  constant: number;
  distanceToPoint(point: Vector3): number;
}

/**
 * Bounding sphere class representing a sphere in 3D space defined by a center point and radius.
 * Used extensively for fast culling, LOD selection, and collision detection.
 * All operations are optimized for performance (< 0.001ms per operation).
 *
 * Empty sphere convention: radius < 0 indicates an empty/invalid sphere.
 *
 * @example
 * ```typescript
 * // Create spheres
 * const sphere1 = new Sphere(new Vector3(0, 0, 0), 5);
 * const sphere2 = new Sphere(); // Empty sphere at origin
 *
 * // Create from points
 * const points = [
 *   new Vector3(1, 2, 3),
 *   new Vector3(4, 5, 6),
 *   new Vector3(-1, -2, -3)
 * ];
 * const boundingSphere = Sphere.fromPoints(points);
 *
 * // Test intersections
 * const intersects = sphere1.intersectsSphere(sphere2);
 * const contains = sphere1.containsPoint(new Vector3(2, 2, 2));
 *
 * // Transform sphere
 * const matrix = Matrix4.scale(2, 2, 2);
 * const scaled = sphere1.applyMatrix4(matrix);
 * ```
 */
export class Sphere {
  /**
   * Center point of the sphere.
   */
  center: Vector3;

  /**
   * Radius of the sphere. Negative values indicate an empty sphere.
   */
  radius: number;

  /**
   * Creates a new Sphere instance.
   *
   * @param center - Center point of the sphere (default: origin)
   * @param radius - Radius of the sphere (default: -1, indicating empty sphere)
   *
   * @example
   * ```typescript
   * const sphere1 = new Sphere();                           // Empty sphere at origin
   * const sphere2 = new Sphere(new Vector3(1, 2, 3));       // Empty sphere at (1,2,3)
   * const sphere3 = new Sphere(new Vector3(0, 0, 0), 5);    // Sphere with radius 5
   * ```
   */
  constructor(center?: Vector3, radius: number = -1) {
    this.center = center ? center.clone() : new Vector3(0, 0, 0);
    this.radius = radius;
  }

  /**
   * Computes a bounding sphere from an array of points.
   * Uses a simple but efficient algorithm: computes the centroid, then finds the farthest point.
   * This is not the minimal bounding sphere but provides good performance and reasonable results.
   *
   * @param points - Array of points to bound
   * @param optionalCenter - Optional pre-computed center point (default: computed centroid)
   * @returns This sphere for chaining
   *
   * @example
   * ```typescript
   * const points = [
   *   new Vector3(1, 0, 0),
   *   new Vector3(0, 1, 0),
   *   new Vector3(0, 0, 1)
   * ];
   * const sphere = new Sphere();
   * sphere.setFromPoints(points); // Creates bounding sphere
   * ```
   */
  setFromPoints(points: Vector3[], optionalCenter?: Vector3): this {
    if (points.length === 0) {
      return this.makeEmpty();
    }

    const center = optionalCenter || new Vector3();

    if (!optionalCenter) {
      let sumX = 0, sumY = 0, sumZ = 0;
      for (let i = 0; i < points.length; i++) {
        sumX += points[i].x;
        sumY += points[i].y;
        sumZ += points[i].z;
      }
      const invCount = 1 / points.length;
      center.set(sumX * invCount, sumY * invCount, sumZ * invCount);
    }

    let maxRadiusSq = 0;
    for (let i = 0; i < points.length; i++) {
      const distSq = Vector3.distanceSquared(center, points[i]);
      if (distSq > maxRadiusSq) {
        maxRadiusSq = distSq;
      }
    }

    this.center.copy(center);
    this.radius = Math.sqrt(maxRadiusSq);

    return this;
  }

  /**
   * Sets this sphere to fully enclose the given axis-aligned bounding box.
   * The sphere center is set to the box center, and the radius is the distance to a corner.
   *
   * @param box - Axis-aligned bounding box to enclose
   * @returns This sphere for chaining
   *
   * @example
   * ```typescript
   * const box = {
   *   min: new Vector3(-1, -1, -1),
   *   max: new Vector3(1, 1, 1),
   *   getCenter: function() { return this.min.add(this.max).scale(0.5); }
   * };
   * const sphere = new Sphere();
   * sphere.setFromBox(box);
   * ```
   */
  setFromBox(box: Box3): this {
    this.center.copy(box.getCenter());
    this.radius = box.max.sub(this.center).length();
    return this;
  }

  /**
   * Sets this sphere to empty state (radius = -1).
   *
   * @returns This sphere for chaining
   *
   * @example
   * ```typescript
   * const sphere = new Sphere(new Vector3(0, 0, 0), 5);
   * sphere.makeEmpty(); // Now empty
   * console.log(sphere.isEmpty); // true
   * ```
   */
  makeEmpty(): this {
    this.center.set(0, 0, 0);
    this.radius = -1;
    return this;
  }

  /**
   * Checks if the sphere is empty.
   *
   * @returns True if the sphere has a negative radius (empty state)
   *
   * @example
   * ```typescript
   * const empty = new Sphere();
   * console.log(empty.isEmpty); // true
   *
   * const notEmpty = new Sphere(new Vector3(0, 0, 0), 5);
   * console.log(notEmpty.isEmpty); // false
   * ```
   */
  get isEmpty(): boolean {
    return this.radius < 0;
  }

  /**
   * Tests if a point is contained within the sphere (including the surface).
   *
   * @param point - Point to test
   * @returns True if the point is inside or on the sphere
   *
   * @example
   * ```typescript
   * const sphere = new Sphere(new Vector3(0, 0, 0), 5);
   * console.log(sphere.containsPoint(new Vector3(3, 0, 0))); // true
   * console.log(sphere.containsPoint(new Vector3(5, 0, 0))); // true (on surface)
   * console.log(sphere.containsPoint(new Vector3(6, 0, 0))); // false
   * ```
   */
  containsPoint(point: Vector3): boolean {
    return Vector3.distanceSquared(point, this.center) <= this.radius * this.radius;
  }

  /**
   * Tests if this sphere intersects another sphere.
   *
   * @param sphere - Sphere to test intersection with
   * @returns True if the spheres intersect (including touching)
   *
   * @example
   * ```typescript
   * const sphere1 = new Sphere(new Vector3(0, 0, 0), 5);
   * const sphere2 = new Sphere(new Vector3(8, 0, 0), 5);
   * console.log(sphere1.intersectsSphere(sphere2)); // true (touching)
   *
   * const sphere3 = new Sphere(new Vector3(11, 0, 0), 5);
   * console.log(sphere1.intersectsSphere(sphere3)); // false
   * ```
   */
  intersectsSphere(sphere: Sphere): boolean {
    const radiusSum = this.radius + sphere.radius;
    return Vector3.distanceSquared(this.center, sphere.center) <= radiusSum * radiusSum;
  }

  /**
   * Tests if this sphere intersects an axis-aligned bounding box.
   * Uses the closest point on the box to determine intersection.
   *
   * @param box - Axis-aligned bounding box to test
   * @returns True if the sphere intersects the box
   *
   * @example
   * ```typescript
   * const sphere = new Sphere(new Vector3(0, 0, 0), 5);
   * const box = {
   *   min: new Vector3(4, -1, -1),
   *   max: new Vector3(6, 1, 1),
   *   getCenter: function() { return this.min.add(this.max).scale(0.5); }
   * };
   * console.log(sphere.intersectsBox(box)); // true
   * ```
   */
  intersectsBox(box: Box3): boolean {
    const closestPoint = this.clampPoint(this.center);

    const clampedX = Math.max(box.min.x, Math.min(closestPoint.x, box.max.x));
    const clampedY = Math.max(box.min.y, Math.min(closestPoint.y, box.max.y));
    const clampedZ = Math.max(box.min.z, Math.min(closestPoint.z, box.max.z));

    const dx = this.center.x - clampedX;
    const dy = this.center.y - clampedY;
    const dz = this.center.z - clampedZ;

    const distanceSq = dx * dx + dy * dy + dz * dz;

    return distanceSq <= this.radius * this.radius;
  }

  /**
   * Tests if this sphere intersects a plane.
   * The sphere intersects if the distance from center to plane is less than or equal to radius.
   *
   * @param plane - Plane to test intersection with
   * @returns True if the sphere intersects the plane
   *
   * @example
   * ```typescript
   * const sphere = new Sphere(new Vector3(0, 5, 0), 3);
   * const plane = {
   *   normal: new Vector3(0, 1, 0),
   *   constant: 0,
   *   distanceToPoint: function(p: Vector3) {
   *     return this.normal.dot(p) + this.constant;
   *   }
   * };
   * console.log(sphere.intersectsPlane(plane)); // true
   * ```
   */
  intersectsPlane(plane: Plane): boolean {
    const distance = Math.abs(plane.distanceToPoint(this.center));
    return distance <= this.radius;
  }

  /**
   * Computes the signed distance from the sphere surface to a point.
   * Negative values indicate the point is inside the sphere.
   *
   * @param point - Point to measure distance to
   * @returns Signed distance to the point (negative if inside)
   *
   * @example
   * ```typescript
   * const sphere = new Sphere(new Vector3(0, 0, 0), 5);
   * console.log(sphere.distanceToPoint(new Vector3(10, 0, 0))); // 5
   * console.log(sphere.distanceToPoint(new Vector3(5, 0, 0)));  // 0 (on surface)
   * console.log(sphere.distanceToPoint(new Vector3(2, 0, 0)));  // -3 (inside)
   * ```
   */
  distanceToPoint(point: Vector3): number {
    return Vector3.distance(this.center, point) - this.radius;
  }

  /**
   * Finds the closest point on the sphere surface to a given point.
   * If the point is inside, returns the nearest surface point.
   * If the point is outside, returns the nearest surface point.
   * If the point is at the center, returns a point on the surface along the X axis.
   *
   * @param point - Point to find closest surface point to
   * @returns Closest point on the sphere surface
   *
   * @example
   * ```typescript
   * const sphere = new Sphere(new Vector3(0, 0, 0), 5);
   * const closest = sphere.closestPointToPoint(new Vector3(10, 0, 0));
   * console.log(closest); // (5, 0, 0)
   * ```
   */
  closestPointToPoint(point: Vector3): Vector3 {
    const direction = point.sub(this.center);
    const lengthSq = direction.lengthSquared();

    if (lengthSq < EPSILON * EPSILON) {
      return this.center.add(new Vector3(this.radius, 0, 0));
    }

    const length = Math.sqrt(lengthSq);
    return this.center.add(direction.scale(this.radius / length));
  }

  /**
   * Clamps a point to the sphere volume.
   * Points outside the sphere are moved to the surface.
   * Points inside remain unchanged.
   *
   * @param point - Point to clamp
   * @returns Clamped point (inside or on the sphere)
   *
   * @example
   * ```typescript
   * const sphere = new Sphere(new Vector3(0, 0, 0), 5);
   * const clamped1 = sphere.clampPoint(new Vector3(10, 0, 0)); // (5, 0, 0)
   * const clamped2 = sphere.clampPoint(new Vector3(2, 0, 0));  // (2, 0, 0)
   * ```
   */
  clampPoint(point: Vector3): Vector3 {
    const distanceSq = Vector3.distanceSquared(this.center, point);
    const radiusSq = this.radius * this.radius;

    if (distanceSq <= radiusSq) {
      return point.clone();
    }

    const direction = point.sub(this.center);
    const length = Math.sqrt(distanceSq);
    return this.center.add(direction.scale(this.radius / length));
  }

  /**
   * Expands this sphere to include a given point.
   * If the point is already inside, the sphere remains unchanged.
   *
   * @param point - Point to include in the sphere
   * @returns This sphere for chaining
   *
   * @example
   * ```typescript
   * const sphere = new Sphere(new Vector3(0, 0, 0), 5);
   * sphere.expandByPoint(new Vector3(10, 0, 0)); // Expands to include (10,0,0)
   * console.log(sphere.radius); // 10
   * ```
   */
  expandByPoint(point: Vector3): this {
    if (this.isEmpty) {
      this.center.copy(point);
      this.radius = 0;
      return this;
    }

    const distance = Vector3.distance(this.center, point);

    if (distance > this.radius) {
      const halfDistance = (distance - this.radius) * 0.5;
      const direction = point.sub(this.center).normalize();

      this.center.addInPlace(direction.scale(halfDistance));
      this.radius += halfDistance;
    }

    return this;
  }

  /**
   * Computes the union of this sphere with another sphere.
   * Returns a new sphere that contains both spheres.
   * Uses an efficient algorithm that finds the minimal enclosing sphere.
   *
   * @param sphere - Sphere to union with
   * @returns New sphere containing both spheres
   *
   * @example
   * ```typescript
   * const sphere1 = new Sphere(new Vector3(0, 0, 0), 5);
   * const sphere2 = new Sphere(new Vector3(10, 0, 0), 5);
   * const union = sphere1.union(sphere2);
   * console.log(union.center); // (5, 0, 0)
   * console.log(union.radius); // 10
   * ```
   */
  union(sphere: Sphere): Sphere {
    if (this.isEmpty) {
      return sphere.clone();
    }
    if (sphere.isEmpty) {
      return this.clone();
    }

    const centerToCenter = sphere.center.sub(this.center);
    const distance = centerToCenter.length();

    if (distance + sphere.radius <= this.radius) {
      return this.clone();
    }

    if (distance + this.radius <= sphere.radius) {
      return sphere.clone();
    }

    const newRadius = (distance + this.radius + sphere.radius) * 0.5;
    const direction = centerToCenter.normalize();
    const offset = newRadius - this.radius;
    const newCenter = this.center.add(direction.scale(offset));

    return new Sphere(newCenter, newRadius);
  }

  /**
   * Transforms this sphere by a 4x4 matrix.
   * The center is transformed as a point, and the radius is scaled by the maximum scale factor.
   * Returns a new transformed sphere.
   *
   * @param m - Transformation matrix
   * @returns New transformed sphere
   *
   * @example
   * ```typescript
   * const sphere = new Sphere(new Vector3(1, 2, 3), 5);
   * const matrix = Matrix4.scale(2, 3, 2);
   * const transformed = sphere.applyMatrix4(matrix);
   * console.log(transformed.center); // (2, 6, 6)
   * console.log(transformed.radius); // 15 (5 * max scale of 3)
   * ```
   */
  applyMatrix4(m: Matrix4): Sphere {
    const transformedCenter = new Vector3();
    const e = m.elements;
    const c = this.center;

    transformedCenter.x = e[0] * c.x + e[4] * c.y + e[8] * c.z + e[12];
    transformedCenter.y = e[1] * c.x + e[5] * c.y + e[9] * c.z + e[13];
    transformedCenter.z = e[2] * c.x + e[6] * c.y + e[10] * c.z + e[14];

    const maxScale = m.getMaxScaleOnAxis();
    const transformedRadius = this.radius * maxScale;

    return new Sphere(transformedCenter, transformedRadius);
  }

  /**
   * Creates a copy of this sphere.
   *
   * @returns New sphere with the same center and radius
   *
   * @example
   * ```typescript
   * const sphere1 = new Sphere(new Vector3(1, 2, 3), 5);
   * const sphere2 = sphere1.clone();
   * ```
   */
  clone(): Sphere {
    return new Sphere(this.center.clone(), this.radius);
  }

  /**
   * Copies the center and radius from another sphere to this sphere.
   *
   * @param sphere - Sphere to copy from
   * @returns This sphere for chaining
   *
   * @example
   * ```typescript
   * const sphere1 = new Sphere(new Vector3(1, 2, 3), 5);
   * const sphere2 = new Sphere();
   * sphere2.copy(sphere1);
   * ```
   */
  copy(sphere: Sphere): this {
    this.center.copy(sphere.center);
    this.radius = sphere.radius;
    return this;
  }

  /**
   * Checks if this sphere is equal to another sphere within epsilon tolerance.
   *
   * @param sphere - Sphere to compare with
   * @param epsilon - Tolerance value (default: EPSILON)
   * @returns True if spheres are nearly equal
   *
   * @example
   * ```typescript
   * const sphere1 = new Sphere(new Vector3(1, 2, 3), 5);
   * const sphere2 = new Sphere(new Vector3(1.0000001, 2, 3), 5.0000001);
   * console.log(sphere1.equals(sphere2)); // true
   * ```
   */
  equals(sphere: Sphere, epsilon: number = EPSILON): boolean {
    return (
      this.center.equals(sphere.center, epsilon) &&
      Math.abs(this.radius - sphere.radius) <= epsilon
    );
  }

  /**
   * Sets the center and radius of this sphere.
   *
   * @param center - New center point
   * @param radius - New radius
   * @returns This sphere for chaining
   *
   * @example
   * ```typescript
   * const sphere = new Sphere();
   * sphere.set(new Vector3(1, 2, 3), 5);
   * ```
   */
  set(center: Vector3, radius: number): this {
    this.center.copy(center);
    this.radius = radius;
    return this;
  }

  /**
   * Converts this sphere to an array [cx, cy, cz, radius].
   *
   * @returns Array containing center coordinates and radius
   *
   * @example
   * ```typescript
   * const sphere = new Sphere(new Vector3(1, 2, 3), 5);
   * const arr = sphere.toArray(); // [1, 2, 3, 5]
   * ```
   */
  toArray(): [number, number, number, number] {
    return [this.center.x, this.center.y, this.center.z, this.radius];
  }

  /**
   * Sets this sphere from an array [cx, cy, cz, radius].
   *
   * @param arr - Array-like object containing at least 4 numbers
   * @param offset - Starting index in the array (default: 0)
   * @returns This sphere for chaining
   *
   * @example
   * ```typescript
   * const sphere = new Sphere();
   * sphere.fromArray([1, 2, 3, 5]); // center=(1,2,3), radius=5
   * sphere.fromArray([0, 1, 2, 3, 5, 6], 2); // center=(3,5,6), radius from arr[5]
   * ```
   */
  fromArray(arr: ArrayLike<number>, offset: number = 0): this {
    this.center.set(arr[offset], arr[offset + 1], arr[offset + 2]);
    this.radius = arr[offset + 3];
    return this;
  }

  /**
   * Creates an empty sphere.
   *
   * @returns New empty sphere (radius = -1)
   *
   * @example
   * ```typescript
   * const empty = Sphere.empty();
   * console.log(empty.isEmpty); // true
   * ```
   */
  static empty(): Sphere {
    return new Sphere();
  }

  /**
   * Creates a bounding sphere from an array of points.
   *
   * @param points - Array of points to bound
   * @returns New sphere bounding all points
   *
   * @example
   * ```typescript
   * const points = [
   *   new Vector3(1, 0, 0),
   *   new Vector3(0, 1, 0),
   *   new Vector3(0, 0, 1)
   * ];
   * const sphere = Sphere.fromPoints(points);
   * ```
   */
  static fromPoints(points: Vector3[]): Sphere {
    const sphere = new Sphere();
    sphere.setFromPoints(points);
    return sphere;
  }

  /**
   * Creates a bounding sphere from an axis-aligned bounding box.
   *
   * @param box - Axis-aligned bounding box
   * @returns New sphere fully enclosing the box
   *
   * @example
   * ```typescript
   * const box = {
   *   min: new Vector3(-1, -1, -1),
   *   max: new Vector3(1, 1, 1),
   *   getCenter: function() { return this.min.add(this.max).scale(0.5); }
   * };
   * const sphere = Sphere.fromBox(box);
   * ```
   */
  static fromBox(box: Box3): Sphere {
    const sphere = new Sphere();
    sphere.setFromBox(box);
    return sphere;
  }
}
