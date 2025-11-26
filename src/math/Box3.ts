/**
 * 3D axis-aligned bounding box (AABB) for culling and collision detection.
 * Provides efficient spatial queries and transformations for 3D graphics.
 * Coordinate system: Y-up, right-handed (-Z forward).
 * @module Box3
 */

import { Vector3 } from './Vector3';
import { Matrix4 } from './Matrix4';
import { EPSILON, nearlyEqual } from './MathConstants';

/**
 * Sphere interface for forward reference.
 * Allows Box3 to perform sphere intersection tests.
 */
interface Sphere {
  center: Vector3;
  radius: number;
}

/**
 * Plane interface for forward reference.
 * Allows Box3 to perform plane intersection tests.
 */
interface Plane {
  normal: Vector3;
  distance: number;
}

/**
 * 3D axis-aligned bounding box for spatial queries, culling, and collision detection.
 * An empty box is represented with min > max (min = +Infinity, max = -Infinity).
 * All operations are optimized for performance (< 0.001ms per operation).
 *
 * @example
 * ```typescript
 * // Create boxes
 * const box = new Box3(
 *   new Vector3(-1, -1, -1),
 *   new Vector3(1, 1, 1)
 * );
 * const emptyBox = Box3.empty();
 *
 * // Build from points
 * const points = [
 *   new Vector3(0, 0, 0),
 *   new Vector3(1, 2, 3),
 *   new Vector3(-1, -2, -3)
 * ];
 * const bbox = Box3.fromPoints(points);
 *
 * // Query box properties
 * const center = box.center;       // (0, 0, 0)
 * const size = box.size;           // (2, 2, 2)
 * const isEmpty = box.isEmpty;     // false
 *
 * // Containment and intersection tests
 * const point = new Vector3(0.5, 0.5, 0.5);
 * const contains = box.containsPoint(point);  // true
 *
 * const otherBox = new Box3(
 *   new Vector3(0.5, 0.5, 0.5),
 *   new Vector3(2, 2, 2)
 * );
 * const intersects = box.intersectsBox(otherBox);  // true
 *
 * // Transform box
 * const matrix = Matrix4.rotationY(Math.PI / 4);
 * const transformed = box.applyMatrix4(matrix);
 *
 * // Expand box
 * box.expandByPoint(new Vector3(5, 5, 5));
 * box.expandByScalar(1);  // Adds 1 unit padding in all directions
 * ```
 */
export class Box3 {
  /**
   * Minimum corner of the bounding box.
   */
  min: Vector3;

  /**
   * Maximum corner of the bounding box.
   */
  max: Vector3;

  /**
   * Creates a new Box3 instance.
   * Default creates an empty box with min = +Infinity, max = -Infinity.
   *
   * @param min - Minimum corner (default: +Infinity vector)
   * @param max - Maximum corner (default: -Infinity vector)
   *
   * @example
   * ```typescript
   * const box = new Box3();  // Empty box
   * const box2 = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );  // Box from (-1,-1,-1) to (1,1,1)
   * ```
   */
  constructor(
    min?: Vector3,
    max?: Vector3
  ) {
    this.min = min || new Vector3(Infinity, Infinity, Infinity);
    this.max = max || new Vector3(-Infinity, -Infinity, -Infinity);
  }

  /**
   * Gets the center point of the bounding box.
   * Returns (0, 0, 0) for empty boxes.
   *
   * @returns Center point of the box
   *
   * @example
   * ```typescript
   * const box = new Box3(
   *   new Vector3(-1, -2, -3),
   *   new Vector3(1, 2, 3)
   * );
   * const center = box.center;  // (0, 0, 0)
   * ```
   */
  get center(): Vector3 {
    if (this.isEmpty) {
      return new Vector3(0, 0, 0);
    }
    return this.min.add(this.max).scale(0.5);
  }

  /**
   * Gets the center point of the bounding box (method version).
   * Returns (0, 0, 0) for empty boxes.
   *
   * @returns Center point of the box
   */
  getCenter(): Vector3 {
    return this.center;
  }

  /**
   * Gets the size (dimensions) of the bounding box.
   * Returns (0, 0, 0) for empty boxes.
   *
   * @returns Size vector (width, height, depth)
   *
   * @example
   * ```typescript
   * const box = new Box3(
   *   new Vector3(-1, -2, -3),
   *   new Vector3(1, 2, 3)
   * );
   * const size = box.size;  // (2, 4, 6)
   * ```
   */
  get size(): Vector3 {
    if (this.isEmpty) {
      return new Vector3(0, 0, 0);
    }
    return this.max.sub(this.min);
  }

  /**
   * Checks if this box is empty (invalid/uninitialized).
   * An empty box has min > max on any axis.
   *
   * @returns True if the box is empty
   *
   * @example
   * ```typescript
   * const emptyBox = Box3.empty();
   * emptyBox.isEmpty;  // true
   *
   * const validBox = new Box3(
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 1)
   * );
   * validBox.isEmpty;  // false
   * ```
   */
  get isEmpty(): boolean {
    return (
      this.min.x > this.max.x ||
      this.min.y > this.max.y ||
      this.min.z > this.max.z
    );
  }

  /**
   * Sets this box to enclose an array of points.
   * Handles empty arrays gracefully by creating an empty box.
   *
   * @param points - Array of points to enclose
   * @returns This box for chaining
   *
   * @example
   * ```typescript
   * const box = new Box3();
   * const points = [
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 2, 3),
   *   new Vector3(-1, -2, -3)
   * ];
   * box.setFromPoints(points);  // Box from (-1,-2,-3) to (1,2,3)
   * ```
   */
  setFromPoints(points: Vector3[]): this {
    this.makeEmpty();

    if (points.length === 0) {
      return this;
    }

    for (let i = 0; i < points.length; i++) {
      this.expandByPoint(points[i]);
    }

    return this;
  }

  /**
   * Sets this box from a center point and size.
   *
   * @param center - Center point of the box
   * @param size - Size (dimensions) of the box
   * @returns This box for chaining
   *
   * @example
   * ```typescript
   * const box = new Box3();
   * box.setFromCenterAndSize(
   *   new Vector3(0, 0, 0),
   *   new Vector3(2, 2, 2)
   * );  // Box from (-1,-1,-1) to (1,1,1)
   * ```
   */
  setFromCenterAndSize(center: Vector3, size: Vector3): this {
    const halfSize = size.scale(0.5);
    this.min = center.sub(halfSize);
    this.max = center.add(halfSize);
    return this;
  }

  /**
   * Sets this box from an object with optional bounding box and world matrix.
   * If the object has a boundingBox property, uses it and applies the worldMatrix.
   * If no boundingBox exists, creates an empty box.
   *
   * @param object - Object with optional boundingBox and worldMatrix
   * @returns This box for chaining
   *
   * @example
   * ```typescript
   * const box = new Box3();
   * const object = {
   *   boundingBox: new Box3(
   *     new Vector3(-1, -1, -1),
   *     new Vector3(1, 1, 1)
   *   ),
   *   worldMatrix: Matrix4.translation(5, 0, 0)
   * };
   * box.setFromObject(object);  // Transformed bounding box
   * ```
   */
  setFromObject(object: { boundingBox?: Box3; worldMatrix?: Matrix4 }): this {
    this.makeEmpty();

    if (object.boundingBox) {
      this.copy(object.boundingBox);

      if (object.worldMatrix) {
        this.applyMatrix4(object.worldMatrix);
      }
    }

    return this;
  }

  /**
   * Makes this box empty (min = +Infinity, max = -Infinity).
   *
   * @returns This box for chaining
   *
   * @example
   * ```typescript
   * const box = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * box.makeEmpty();  // Now empty
   * box.isEmpty;  // true
   * ```
   */
  makeEmpty(): this {
    this.min.set(Infinity, Infinity, Infinity);
    this.max.set(-Infinity, -Infinity, -Infinity);
    return this;
  }

  /**
   * Expands this box to contain the given point.
   * If the box is empty, the point becomes both min and max.
   *
   * @param point - Point to include
   * @returns This box for chaining
   *
   * @example
   * ```typescript
   * const box = Box3.empty();
   * box.expandByPoint(new Vector3(1, 2, 3));
   * box.expandByPoint(new Vector3(-1, -2, -3));
   * // Box now goes from (-1,-2,-3) to (1,2,3)
   * ```
   */
  expandByPoint(point: Vector3): this {
    this.min.x = Math.min(this.min.x, point.x);
    this.min.y = Math.min(this.min.y, point.y);
    this.min.z = Math.min(this.min.z, point.z);

    this.max.x = Math.max(this.max.x, point.x);
    this.max.y = Math.max(this.max.y, point.y);
    this.max.z = Math.max(this.max.z, point.z);

    return this;
  }

  /**
   * Expands this box by a vector in all directions.
   * Subtracts the vector from min and adds it to max.
   *
   * @param vector - Vector to expand by
   * @returns This box for chaining
   *
   * @example
   * ```typescript
   * const box = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * box.expandByVector(new Vector3(1, 2, 3));
   * // Box now goes from (-2,-3,-4) to (2,3,4)
   * ```
   */
  expandByVector(vector: Vector3): this {
    this.min.subInPlace(vector);
    this.max.addInPlace(vector);
    return this;
  }

  /**
   * Expands this box by a scalar amount in all directions.
   * Subtracts the scalar from min and adds it to max.
   *
   * @param scalar - Amount to expand by
   * @returns This box for chaining
   *
   * @example
   * ```typescript
   * const box = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * box.expandByScalar(1);
   * // Box now goes from (-2,-2,-2) to (2,2,2)
   * ```
   */
  expandByScalar(scalar: number): this {
    this.min.x -= scalar;
    this.min.y -= scalar;
    this.min.z -= scalar;

    this.max.x += scalar;
    this.max.y += scalar;
    this.max.z += scalar;

    return this;
  }

  /**
   * Expands this box to include another box.
   * Updates min and max to encompass both boxes.
   *
   * @param box - Box to expand by
   * @returns This box for chaining
   *
   * @example
   * ```typescript
   * const box1 = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * const box2 = new Box3(
   *   new Vector3(2, 2, 2),
   *   new Vector3(3, 3, 3)
   * );
   * box1.expandByBox(box2);
   * // box1 now goes from (-1,-1,-1) to (3,3,3)
   * ```
   */
  expandByBox(box: Box3): this {
    this.expandByPoint(box.min);
    this.expandByPoint(box.max);
    return this;
  }

  /**
   * Gets the size (dimensions) of the bounding box.
   * Alias for the size getter to match common Box3 APIs.
   *
   * @returns Size vector (width, height, depth)
   *
   * @example
   * ```typescript
   * const box = new Box3(
   *   new Vector3(-1, -2, -3),
   *   new Vector3(1, 2, 3)
   * );
   * const size = box.getSize(); // (2, 4, 6)
   * ```
   */
  getSize(): Vector3 {
    return this.size;
  }

  /**
   * Tests if this box contains a point.
   * Points on the boundary are considered inside.
   *
   * @param point - Point to test
   * @returns True if the point is inside or on the box
   *
   * @example
   * ```typescript
   * const box = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * box.containsPoint(new Vector3(0, 0, 0));    // true
   * box.containsPoint(new Vector3(1, 1, 1));    // true (on boundary)
   * box.containsPoint(new Vector3(2, 0, 0));    // false
   * ```
   */
  containsPoint(point: Vector3): boolean {
    return (
      point.x >= this.min.x && point.x <= this.max.x &&
      point.y >= this.min.y && point.y <= this.max.y &&
      point.z >= this.min.z && point.z <= this.max.z
    );
  }

  /**
   * Tests if this box completely contains another box.
   *
   * @param box - Box to test
   * @returns True if the other box is completely inside this box
   *
   * @example
   * ```typescript
   * const outer = new Box3(
   *   new Vector3(-2, -2, -2),
   *   new Vector3(2, 2, 2)
   * );
   * const inner = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * outer.containsBox(inner);  // true
   * inner.containsBox(outer);  // false
   * ```
   */
  containsBox(box: Box3): boolean {
    return (
      this.min.x <= box.min.x && box.max.x <= this.max.x &&
      this.min.y <= box.min.y && box.max.y <= this.max.y &&
      this.min.z <= box.min.z && box.max.z <= this.max.z
    );
  }

  /**
   * Tests if this box intersects (overlaps) another box.
   * Boxes that touch at edges or corners are considered intersecting.
   *
   * @param box - Box to test against
   * @returns True if the boxes intersect
   *
   * @example
   * ```typescript
   * const box1 = new Box3(
   *   new Vector3(0, 0, 0),
   *   new Vector3(2, 2, 2)
   * );
   * const box2 = new Box3(
   *   new Vector3(1, 1, 1),
   *   new Vector3(3, 3, 3)
   * );
   * box1.intersectsBox(box2);  // true (overlapping)
   *
   * const box3 = new Box3(
   *   new Vector3(3, 0, 0),
   *   new Vector3(4, 2, 2)
   * );
   * box1.intersectsBox(box3);  // false (separated)
   * ```
   */
  intersectsBox(box: Box3): boolean {
    return !(
      box.max.x < this.min.x || box.min.x > this.max.x ||
      box.max.y < this.min.y || box.min.y > this.max.y ||
      box.max.z < this.min.z || box.min.z > this.max.z
    );
  }

  /**
   * Tests if this box intersects a sphere.
   * Uses squared distance comparison to avoid square root.
   *
   * @param sphere - Sphere to test against
   * @returns True if the box intersects the sphere
   *
   * @example
   * ```typescript
   * const box = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * const sphere = {
   *   center: new Vector3(2, 0, 0),
   *   radius: 1.5
   * };
   * box.intersectsSphere(sphere);  // true
   * ```
   */
  intersectsSphere(sphere: Sphere): boolean {
    const closestPoint = this.clampPoint(sphere.center);
    const distanceSquared = closestPoint.sub(sphere.center).lengthSquared();
    return distanceSquared <= sphere.radius * sphere.radius;
  }

  /**
   * Tests if this box intersects a plane.
   * A plane is defined by a normal vector and distance from origin.
   *
   * @param plane - Plane to test against
   * @returns True if the box intersects the plane
   *
   * @example
   * ```typescript
   * const box = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * const plane = {
   *   normal: new Vector3(0, 1, 0),
   *   distance: 0
   * };
   * box.intersectsPlane(plane);  // true (box crosses XZ plane)
   * ```
   */
  intersectsPlane(plane: Plane): boolean {
    const normal = plane.normal;

    let min: number, max: number;

    if (normal.x > 0) {
      min = normal.x * this.min.x;
      max = normal.x * this.max.x;
    } else {
      min = normal.x * this.max.x;
      max = normal.x * this.min.x;
    }

    if (normal.y > 0) {
      min += normal.y * this.min.y;
      max += normal.y * this.max.y;
    } else {
      min += normal.y * this.max.y;
      max += normal.y * this.min.y;
    }

    if (normal.z > 0) {
      min += normal.z * this.min.z;
      max += normal.z * this.max.z;
    } else {
      min += normal.z * this.max.z;
      max += normal.z * this.min.z;
    }

    return min <= -plane.distance && max >= -plane.distance;
  }

  /**
   * Clamps a point to the surface or interior of this box.
   * Returns the closest point on or inside the box.
   *
   * @param point - Point to clamp
   * @returns Clamped point
   *
   * @example
   * ```typescript
   * const box = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * const outside = new Vector3(2, 0, 0);
   * const clamped = box.clampPoint(outside);  // (1, 0, 0)
   * ```
   */
  clampPoint(point: Vector3): Vector3 {
    return new Vector3(
      Math.max(this.min.x, Math.min(this.max.x, point.x)),
      Math.max(this.min.y, Math.min(this.max.y, point.y)),
      Math.max(this.min.z, Math.min(this.max.z, point.z))
    );
  }

  /**
   * Calculates the distance from a point to this box.
   * Returns 0 if the point is inside the box.
   *
   * @param point - Point to measure distance to
   * @returns Distance to the box (0 if inside)
   *
   * @example
   * ```typescript
   * const box = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * box.distanceToPoint(new Vector3(0, 0, 0));    // 0 (inside)
   * box.distanceToPoint(new Vector3(2, 0, 0));    // 1 (outside)
   * box.distanceToPoint(new Vector3(2, 2, 2));    // sqrt(3) ≈ 1.732
   * ```
   */
  distanceToPoint(point: Vector3): number {
    const clampedPoint = this.clampPoint(point);
    return clampedPoint.sub(point).length();
  }

  /**
   * Returns the union of this box and another box.
   * The result contains both boxes completely.
   *
   * @param box - Box to union with
   * @returns New box containing both boxes
   *
   * @example
   * ```typescript
   * const box1 = new Box3(
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 1)
   * );
   * const box2 = new Box3(
   *   new Vector3(2, 2, 2),
   *   new Vector3(3, 3, 3)
   * );
   * const union = box1.union(box2);
   * // Result: Box from (0,0,0) to (3,3,3)
   * ```
   */
  union(box: Box3): Box3 {
    const result = new Box3();
    result.min = new Vector3(
      Math.min(this.min.x, box.min.x),
      Math.min(this.min.y, box.min.y),
      Math.min(this.min.z, box.min.z)
    );
    result.max = new Vector3(
      Math.max(this.max.x, box.max.x),
      Math.max(this.max.y, box.max.y),
      Math.max(this.max.z, box.max.z)
    );
    return result;
  }

  /**
   * Returns the intersection of this box and another box.
   * Returns null if the boxes don't intersect.
   *
   * @param box - Box to intersect with
   * @returns New box representing the intersection, or null if no intersection
   *
   * @example
   * ```typescript
   * const box1 = new Box3(
   *   new Vector3(0, 0, 0),
   *   new Vector3(2, 2, 2)
   * );
   * const box2 = new Box3(
   *   new Vector3(1, 1, 1),
   *   new Vector3(3, 3, 3)
   * );
   * const intersection = box1.intersection(box2);
   * // Result: Box from (1,1,1) to (2,2,2)
   *
   * const box3 = new Box3(
   *   new Vector3(10, 10, 10),
   *   new Vector3(11, 11, 11)
   * );
   * const noIntersection = box1.intersection(box3);  // null
   * ```
   */
  intersection(box: Box3): Box3 | null {
    if (!this.intersectsBox(box)) {
      return null;
    }

    const result = new Box3();
    result.min = new Vector3(
      Math.max(this.min.x, box.min.x),
      Math.max(this.min.y, box.min.y),
      Math.max(this.min.z, box.min.z)
    );
    result.max = new Vector3(
      Math.min(this.max.x, box.max.x),
      Math.min(this.max.y, box.max.y),
      Math.min(this.max.z, box.max.z)
    );
    return result;
  }

  /**
   * Applies a 4x4 transformation matrix to this box.
   * Transforms all 8 corners and rebuilds an axis-aligned bounding box.
   * Handles rotation, scale, translation, and skew transformations.
   *
   * @param m - Transformation matrix to apply
   * @returns New transformed box
   *
   * @example
   * ```typescript
   * const box = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * const matrix = Matrix4.rotationY(Math.PI / 4)
   *   .multiply(Matrix4.translation(5, 0, 0));
   * const transformed = box.applyMatrix4(matrix);
   * // Result: Rotated and translated AABB
   * ```
   */
  applyMatrix4(m: Matrix4): Box3 {
    if (this.isEmpty) {
      return this.clone();
    }

    const corners = this.getCorners();
    const result = Box3.empty();

    for (let i = 0; i < corners.length; i++) {
      const corner = corners[i];
      const e = m.elements;

      const x = corner.x;
      const y = corner.y;
      const z = corner.z;

      const transformedX = e[0] * x + e[4] * y + e[8] * z + e[12];
      const transformedY = e[1] * x + e[5] * y + e[9] * z + e[13];
      const transformedZ = e[2] * x + e[6] * y + e[10] * z + e[14];
      const transformedW = e[3] * x + e[7] * y + e[11] * z + e[15];

      const invW = transformedW !== 0 ? 1 / transformedW : 1;
      const transformed = new Vector3(
        transformedX * invW,
        transformedY * invW,
        transformedZ * invW
      );

      result.expandByPoint(transformed);
    }

    return result;
  }

  /**
   * Creates a copy of this box.
   *
   * @returns New box with the same bounds
   *
   * @example
   * ```typescript
   * const box1 = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * const box2 = box1.clone();
   * ```
   */
  clone(): Box3 {
    return new Box3(this.min.clone(), this.max.clone());
  }

  /**
   * Copies the bounds from another box to this box.
   *
   * @param box - Box to copy from
   * @returns This box for chaining
   *
   * @example
   * ```typescript
   * const box1 = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * const box2 = Box3.empty();
   * box2.copy(box1);  // box2 now equals box1
   * ```
   */
  copy(box: Box3): this {
    this.min.copy(box.min);
    this.max.copy(box.max);
    return this;
  }

  /**
   * Checks if this box is equal to another box within epsilon tolerance.
   *
   * @param box - Box to compare with
   * @param epsilon - Tolerance value (default: EPSILON)
   * @returns True if boxes are nearly equal
   *
   * @example
   * ```typescript
   * const box1 = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * const box2 = new Box3(
   *   new Vector3(-1.0000001, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * box1.equals(box2);  // true
   * ```
   */
  equals(box: Box3, epsilon: number = EPSILON): boolean {
    return (
      this.min.equals(box.min, epsilon) &&
      this.max.equals(box.max, epsilon)
    );
  }

  /**
   * Returns all 8 corner points of this box.
   * Order: (minX,minY,minZ), (maxX,minY,minZ), (minX,maxY,minZ), (maxX,maxY,minZ),
   *        (minX,minY,maxZ), (maxX,minY,maxZ), (minX,maxY,maxZ), (maxX,maxY,maxZ)
   *
   * @returns Array of 8 corner vectors
   *
   * @example
   * ```typescript
   * const box = new Box3(
   *   new Vector3(-1, -1, -1),
   *   new Vector3(1, 1, 1)
   * );
   * const corners = box.getCorners();  // 8 Vector3 instances
   * ```
   */
  getCorners(): Vector3[] {
    return [
      new Vector3(this.min.x, this.min.y, this.min.z),
      new Vector3(this.max.x, this.min.y, this.min.z),
      new Vector3(this.min.x, this.max.y, this.min.z),
      new Vector3(this.max.x, this.max.y, this.min.z),
      new Vector3(this.min.x, this.min.y, this.max.z),
      new Vector3(this.max.x, this.min.y, this.max.z),
      new Vector3(this.min.x, this.max.y, this.max.z),
      new Vector3(this.max.x, this.max.y, this.max.z),
    ];
  }

  /**
   * Converts this box to an array.
   *
   * @returns Array [minX, minY, minZ, maxX, maxY, maxZ]
   *
   * @example
   * ```typescript
   * const box = new Box3(
   *   new Vector3(-1, -2, -3),
   *   new Vector3(1, 2, 3)
   * );
   * const arr = box.toArray();  // [-1, -2, -3, 1, 2, 3]
   * ```
   */
  toArray(): number[] {
    return [
      this.min.x, this.min.y, this.min.z,
      this.max.x, this.max.y, this.max.z
    ];
  }

  /**
   * Sets this box from an array.
   *
   * @param arr - Array-like object containing at least 6 numbers
   * @param offset - Starting index in the array (default: 0)
   * @returns This box for chaining
   *
   * @example
   * ```typescript
   * const box = new Box3();
   * box.fromArray([-1, -2, -3, 1, 2, 3]);
   * // Box from (-1,-2,-3) to (1,2,3)
   *
   * box.fromArray([0, -1, -2, -3, 1, 2, 3], 1);
   * // Starts at offset 1: Box from (-1,-2,-3) to (1,2,3)
   * ```
   */
  fromArray(arr: ArrayLike<number>, offset: number = 0): this {
    this.min.x = arr[offset];
    this.min.y = arr[offset + 1];
    this.min.z = arr[offset + 2];
    this.max.x = arr[offset + 3];
    this.max.y = arr[offset + 4];
    this.max.z = arr[offset + 5];
    return this;
  }

  /**
   * Creates a new empty box.
   * An empty box has min = +Infinity, max = -Infinity.
   *
   * @returns New empty box
   *
   * @example
   * ```typescript
   * const box = Box3.empty();
   * box.isEmpty;  // true
   * ```
   */
  static empty(): Box3 {
    return new Box3();
  }

  /**
   * Creates a new box that encloses all given points.
   * Returns an empty box if the points array is empty.
   *
   * @param points - Array of points to enclose
   * @returns New box enclosing all points
   *
   * @example
   * ```typescript
   * const points = [
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 2, 3),
   *   new Vector3(-1, -2, -3)
   * ];
   * const box = Box3.fromPoints(points);
   * // Box from (-1,-2,-3) to (1,2,3)
   * ```
   */
  static fromPoints(points: Vector3[]): Box3 {
    const box = new Box3();
    box.setFromPoints(points);
    return box;
  }

  /**
   * Creates a new box from a center point and size.
   *
   * @param center - Center point of the box
   * @param size - Size (dimensions) of the box
   * @returns New box
   *
   * @example
   * ```typescript
   * const box = Box3.fromCenterAndSize(
   *   new Vector3(0, 0, 0),
   *   new Vector3(2, 2, 2)
   * );
   * // Box from (-1,-1,-1) to (1,1,1)
   * ```
   */
  static fromCenterAndSize(center: Vector3, size: Vector3): Box3 {
    const box = new Box3();
    box.setFromCenterAndSize(center, size);
    return box;
  }
}
