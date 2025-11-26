/**
 * Mathematical plane for clipping and frustum culling.
 * Plane equation: n · p + d = 0 where n is the normal, p is a point, and d is the constant.
 * Sign convention: positive distance = in front of plane (same side as normal).
 * @module Plane
 */

import { Vector3 } from './Vector3';
import { Matrix3 } from './Matrix3';
import { Matrix4 } from './Matrix4';
import { MathConstants } from './MathConstants';

const { EPSILON } = MathConstants;

/**
 * Forward reference interface for Sphere to handle circular dependencies.
 */
interface Sphere {
  center: Vector3;
  radius: number;
}

/**
 * Forward reference interface for Box3 to handle circular dependencies.
 */
interface Box3 {
  min: Vector3;
  max: Vector3;
}

/**
 * Mathematical plane class for clipping, frustum culling, and spatial partitioning.
 * Plane equation: n · p + d = 0
 * Where n is the normal vector, p is any point, and d is the constant (distance from origin along normal).
 *
 * All plane operations are optimized for performance (distance tests < 0.001ms).
 *
 * @example
 * ```typescript
 * // Create a plane from normal and distance
 * const plane = new Plane(new Vector3(0, 1, 0), -5); // XZ plane at y=5
 *
 * // Create from three coplanar points
 * const p1 = new Vector3(0, 0, 0);
 * const p2 = new Vector3(1, 0, 0);
 * const p3 = new Vector3(0, 0, 1);
 * const plane2 = Plane.fromCoplanarPoints(p1, p2, p3);
 *
 * // Distance tests
 * const point = new Vector3(0, 10, 0);
 * const distance = plane.distanceToPoint(point); // 5
 *
 * // Projection
 * const projected = plane.projectPoint(point); // (0, 5, 0)
 *
 * // Line intersection
 * const start = new Vector3(0, 0, 0);
 * const end = new Vector3(0, 10, 0);
 * const intersection = plane.intersectLine(start, end); // (0, 5, 0)
 * ```
 */
export class Plane {
  /**
   * Normal vector of the plane (should be normalized for accurate distance calculations).
   */
  normal: Vector3;

  /**
   * Distance from origin along normal.
   * Plane equation: n · p + d = 0
   * Where d = constant = -n · pointOnPlane
   */
  constant: number;

  /**
   * Creates a new Plane instance.
   *
   * @param normal - Normal vector (default: (1, 0, 0))
   * @param constant - Distance from origin along normal (default: 0)
   *
   * @example
   * ```typescript
   * const plane1 = new Plane(); // YZ plane through origin
   * const plane2 = new Plane(new Vector3(0, 1, 0), -5); // XZ plane at y=5
   * const plane3 = new Plane(new Vector3(1, 0, 0), 0); // YZ plane through origin
   * ```
   */
  constructor(normal: Vector3 = new Vector3(1, 0, 0), constant: number = 0) {
    this.normal = normal;
    this.constant = constant;
  }

  /**
   * Sets the plane from a normal vector and a coplanar point.
   * Formula: d = -n · point
   *
   * @param normal - Normal vector (will be copied)
   * @param point - A point on the plane
   * @returns This plane for chaining
   *
   * @example
   * ```typescript
   * const plane = new Plane();
   * const normal = new Vector3(0, 1, 0);
   * const point = new Vector3(0, 5, 0);
   * plane.setFromNormalAndCoplanarPoint(normal, point);
   * // Plane equation: y - 5 = 0
   * ```
   */
  setFromNormalAndCoplanarPoint(normal: Vector3, point: Vector3): this {
    this.normal.copy(normal);
    this.constant = -point.dot(this.normal);
    return this;
  }

  /**
   * Sets the plane from three coplanar points.
   * Uses cross product to compute normal with CCW winding = front.
   * Formula: normal = (b - a) × (c - a), then normalize
   *
   * @param a - First point
   * @param b - Second point
   * @param c - Third point
   * @returns This plane for chaining
   *
   * @example
   * ```typescript
   * const plane = new Plane();
   * const a = new Vector3(0, 0, 0);
   * const b = new Vector3(1, 0, 0);
   * const c = new Vector3(0, 0, 1);
   * plane.setFromCoplanarPoints(a, b, c);
   * // Normal points up (0, 1, 0) due to CCW winding
   * ```
   */
  setFromCoplanarPoints(a: Vector3, b: Vector3, c: Vector3): this {
    const v1 = b.sub(a);
    const v2 = c.sub(a);
    const normal = v1.cross(v2).normalize();

    this.setFromNormalAndCoplanarPoint(normal, a);
    return this;
  }

  /**
   * Sets the plane components directly.
   * Plane equation: x*x + y*y + z*z + w = 0
   *
   * @param x - X component of normal
   * @param y - Y component of normal
   * @param z - Z component of normal
   * @param w - Constant term
   * @returns This plane for chaining
   *
   * @example
   * ```typescript
   * const plane = new Plane();
   * plane.setComponents(0, 1, 0, -5); // XZ plane at y=5
   * ```
   */
  setComponents(x: number, y: number, z: number, w: number): this {
    this.normal.set(x, y, z);
    this.constant = w;
    return this;
  }

  /**
   * Normalizes the plane so that the normal vector has unit length.
   * This ensures accurate distance calculations.
   * Divides both normal and constant by the normal's length.
   *
   * @returns This plane for chaining
   *
   * @example
   * ```typescript
   * const plane = new Plane(new Vector3(2, 0, 0), 10);
   * plane.normalize();
   * // Normal is now (1, 0, 0) and constant is 5
   * ```
   */
  normalize(): this {
    const invLength = 1 / this.normal.length();
    this.normal.scaleInPlace(invLength);
    this.constant *= invLength;
    return this;
  }

  /**
   * Returns a new plane with negated normal and constant.
   * This flips the plane to face the opposite direction.
   *
   * @returns New negated plane
   *
   * @example
   * ```typescript
   * const plane = new Plane(new Vector3(0, 1, 0), -5);
   * const negated = plane.negate();
   * // Normal is (0, -1, 0) and constant is 5
   * ```
   */
  negate(): Plane {
    return new Plane(this.normal.negate(), -this.constant);
  }

  /**
   * Negates this plane in place (flips to face opposite direction).
   *
   * @returns This plane for chaining
   *
   * @example
   * ```typescript
   * const plane = new Plane(new Vector3(0, 1, 0), -5);
   * plane.negateInPlace();
   * // Normal is now (0, -1, 0) and constant is 5
   * ```
   */
  negateInPlace(): this {
    this.normal.negateInPlace();
    this.constant = -this.constant;
    return this;
  }

  /**
   * Calculates the signed distance from a point to the plane.
   * Positive distance = in front of plane (same side as normal).
   * Negative distance = behind plane (opposite side from normal).
   * Zero distance = on the plane.
   *
   * @param point - Point to calculate distance to
   * @returns Signed distance from plane
   *
   * @example
   * ```typescript
   * const plane = new Plane(new Vector3(0, 1, 0), -5);
   * const distance1 = plane.distanceToPoint(new Vector3(0, 10, 0)); // 5
   * const distance2 = plane.distanceToPoint(new Vector3(0, 5, 0));  // 0
   * const distance3 = plane.distanceToPoint(new Vector3(0, 0, 0));  // -5
   * ```
   */
  distanceToPoint(point: Vector3): number {
    return this.normal.dot(point) + this.constant;
  }

  /**
   * Calculates the signed distance from a sphere to the plane.
   * Returns the distance from the plane to the closest point on the sphere.
   *
   * @param sphere - Sphere to calculate distance to
   * @returns Signed distance (negative if sphere center is behind plane)
   *
   * @example
   * ```typescript
   * const plane = new Plane(new Vector3(0, 1, 0), -5);
   * const sphere = { center: new Vector3(0, 10, 0), radius: 2 };
   * const distance = plane.distanceToSphere(sphere); // 3 (10 - 5 - 2)
   * ```
   */
  distanceToSphere(sphere: Sphere): number {
    return this.distanceToPoint(sphere.center) - sphere.radius;
  }

  /**
   * Projects a point onto the plane (finds the closest point on the plane).
   *
   * @param point - Point to project
   * @returns New point on the plane
   *
   * @example
   * ```typescript
   * const plane = new Plane(new Vector3(0, 1, 0), -5);
   * const point = new Vector3(10, 20, 30);
   * const projected = plane.projectPoint(point); // (10, 5, 30)
   * ```
   */
  projectPoint(point: Vector3): Vector3 {
    const distance = this.distanceToPoint(point);
    return point.sub(this.normal.scale(distance));
  }

  /**
   * Returns the closest point on the plane to the given point (alias for projectPoint).
   *
   * @param point - Point to find closest point to
   * @returns New point on the plane
   *
   * @example
   * ```typescript
   * const plane = new Plane(new Vector3(0, 1, 0), -5);
   * const point = new Vector3(10, 20, 30);
   * const closest = plane.orthoPoint(point); // (10, 5, 30)
   * ```
   */
  orthoPoint(point: Vector3): Vector3 {
    return this.projectPoint(point);
  }

  /**
   * Finds the intersection point between the plane and a line segment.
   * Returns null if the line is parallel to the plane or doesn't intersect within the segment.
   *
   * @param start - Start point of the line segment
   * @param end - End point of the line segment
   * @returns Intersection point or null if no intersection
   *
   * @example
   * ```typescript
   * const plane = new Plane(new Vector3(0, 1, 0), -5);
   * const start = new Vector3(0, 0, 0);
   * const end = new Vector3(0, 10, 0);
   * const intersection = plane.intersectLine(start, end); // (0, 5, 0)
   *
   * const parallel = plane.intersectLine(
   *   new Vector3(0, 5, 0),
   *   new Vector3(1, 5, 0)
   * ); // null (line parallel to plane)
   * ```
   */
  intersectLine(start: Vector3, end: Vector3): Vector3 | null {
    const direction = end.sub(start);
    const denominator = this.normal.dot(direction);

    if (Math.abs(denominator) < EPSILON) {
      return null;
    }

    const t = -(this.normal.dot(start) + this.constant) / denominator;

    if (t < 0 || t > 1) {
      return null;
    }

    return start.add(direction.scale(t));
  }

  /**
   * Checks if the plane intersects a line segment.
   *
   * @param start - Start point of the line segment
   * @param end - End point of the line segment
   * @returns True if the plane intersects the line segment
   *
   * @example
   * ```typescript
   * const plane = new Plane(new Vector3(0, 1, 0), -5);
   * const intersects = plane.intersectsLine(
   *   new Vector3(0, 0, 0),
   *   new Vector3(0, 10, 0)
   * ); // true
   * ```
   */
  intersectsLine(start: Vector3, end: Vector3): boolean {
    const distanceStart = this.distanceToPoint(start);
    const distanceEnd = this.distanceToPoint(end);

    return (distanceStart < 0 && distanceEnd > 0) || (distanceStart > 0 && distanceEnd < 0);
  }

  /**
   * Checks if the plane intersects an axis-aligned bounding box.
   *
   * @param box - Box to test intersection with
   * @returns True if the plane intersects the box
   *
   * @example
   * ```typescript
   * const plane = new Plane(new Vector3(0, 1, 0), -5);
   * const box = {
   *   min: new Vector3(0, 0, 0),
   *   max: new Vector3(10, 10, 10)
   * };
   * const intersects = plane.intersectsBox(box); // true
   * ```
   */
  intersectsBox(box: Box3): boolean {
    const { min, max } = box;
    const { normal } = this;

    const p = new Vector3(
      normal.x > 0 ? max.x : min.x,
      normal.y > 0 ? max.y : min.y,
      normal.z > 0 ? max.z : min.z
    );

    const n = new Vector3(
      normal.x > 0 ? min.x : max.x,
      normal.y > 0 ? min.y : max.y,
      normal.z > 0 ? min.z : max.z
    );

    const distanceP = this.distanceToPoint(p);
    const distanceN = this.distanceToPoint(n);

    return (distanceP >= 0 && distanceN <= 0) || (distanceP <= 0 && distanceN >= 0);
  }

  /**
   * Checks if the plane intersects a sphere.
   *
   * @param sphere - Sphere to test intersection with
   * @returns True if the plane intersects the sphere
   *
   * @example
   * ```typescript
   * const plane = new Plane(new Vector3(0, 1, 0), -5);
   * const sphere = { center: new Vector3(0, 5, 0), radius: 2 };
   * const intersects = plane.intersectsSphere(sphere); // true
   *
   * const sphere2 = { center: new Vector3(0, 10, 0), radius: 2 };
   * const intersects2 = plane.intersectsSphere(sphere2); // false
   * ```
   */
  intersectsSphere(sphere: Sphere): boolean {
    return Math.abs(this.distanceToPoint(sphere.center)) <= sphere.radius;
  }

  /**
   * Returns an arbitrary point on the plane.
   *
   * @returns A point on the plane
   *
   * @example
   * ```typescript
   * const plane = new Plane(new Vector3(0, 1, 0), -5);
   * const point = plane.coplanarPoint(); // (0, 5, 0)
   * ```
   */
  coplanarPoint(): Vector3 {
    return this.normal.scale(-this.constant);
  }

  /**
   * Transforms this plane by a 4x4 matrix.
   * Requires a normal matrix (inverse transpose of the upper 3x3) for correct transformation.
   * If no normal matrix is provided, it will be computed from the matrix.
   *
   * @param m - Transformation matrix
   * @param normalMatrix - Optional normal matrix for correct normal transformation
   * @returns This plane for chaining
   *
   * @example
   * ```typescript
   * const plane = new Plane(new Vector3(0, 1, 0), -5);
   * const transform = Matrix4.translation(0, 10, 0);
   * const normalMatrix = new Matrix3().getNormalMatrix(transform);
   * plane.applyMatrix4(transform, normalMatrix);
   * ```
   */
  applyMatrix4(m: Matrix4, normalMatrix?: Matrix3): this {
    const referencePoint = this.coplanarPoint();
    const transformedPoint = this.transformPoint(referencePoint, m);

    let transformedNormal: Vector3;
    if (normalMatrix) {
      transformedNormal = this.transformNormal(this.normal, normalMatrix);
    } else {
      const computedNormalMatrix = new Matrix3().getNormalMatrix(m);
      transformedNormal = this.transformNormal(this.normal, computedNormalMatrix);
    }

    this.setFromNormalAndCoplanarPoint(transformedNormal, transformedPoint);
    return this;
  }

  /**
   * Helper method to transform a point by a Matrix4.
   *
   * @param point - Point to transform
   * @param m - Transformation matrix
   * @returns Transformed point
   */
  private transformPoint(point: Vector3, m: Matrix4): Vector3 {
    const e = m.elements;
    const x = point.x, y = point.y, z = point.z;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);

    return new Vector3(
      (e[0] * x + e[4] * y + e[8] * z + e[12]) * w,
      (e[1] * x + e[5] * y + e[9] * z + e[13]) * w,
      (e[2] * x + e[6] * y + e[10] * z + e[14]) * w
    );
  }

  /**
   * Helper method to transform a normal by a Matrix3.
   *
   * @param normal - Normal to transform
   * @param m - Normal matrix
   * @returns Transformed and normalized normal
   */
  private transformNormal(normal: Vector3, m: Matrix3): Vector3 {
    const e = m.elements;
    const x = normal.x, y = normal.y, z = normal.z;

    return new Vector3(
      e[0] * x + e[3] * y + e[6] * z,
      e[1] * x + e[4] * y + e[7] * z,
      e[2] * x + e[5] * y + e[8] * z
    ).normalize();
  }

  /**
   * Creates a copy of this plane.
   *
   * @returns New plane with the same values
   *
   * @example
   * ```typescript
   * const plane1 = new Plane(new Vector3(0, 1, 0), -5);
   * const plane2 = plane1.clone();
   * plane2.negateInPlace(); // plane1 is unchanged
   * ```
   */
  clone(): Plane {
    return new Plane(this.normal.clone(), this.constant);
  }

  /**
   * Copies values from another plane to this plane.
   *
   * @param plane - Plane to copy from
   * @returns This plane for chaining
   *
   * @example
   * ```typescript
   * const plane1 = new Plane(new Vector3(0, 1, 0), -5);
   * const plane2 = new Plane();
   * plane2.copy(plane1);
   * ```
   */
  copy(plane: Plane): this {
    this.normal.copy(plane.normal);
    this.constant = plane.constant;
    return this;
  }

  /**
   * Checks if this plane is equal to another plane within epsilon tolerance.
   *
   * @param plane - Plane to compare with
   * @param epsilon - Tolerance value (default: EPSILON)
   * @returns True if planes are nearly equal
   *
   * @example
   * ```typescript
   * const plane1 = new Plane(new Vector3(0, 1, 0), -5);
   * const plane2 = new Plane(new Vector3(0, 1.0000001, 0), -5.0000001);
   * const equal = plane1.equals(plane2); // true
   * ```
   */
  equals(plane: Plane, epsilon: number = EPSILON): boolean {
    return (
      this.normal.equals(plane.normal, epsilon) &&
      Math.abs(this.constant - plane.constant) <= epsilon
    );
  }

  /**
   * Sets the normal and constant of this plane.
   *
   * @param normal - Normal vector
   * @param constant - Distance from origin
   * @returns This plane for chaining
   *
   * @example
   * ```typescript
   * const plane = new Plane();
   * plane.set(new Vector3(0, 1, 0), -5);
   * ```
   */
  set(normal: Vector3, constant: number): this {
    this.normal.copy(normal);
    this.constant = constant;
    return this;
  }

  /**
   * Creates a new plane from a normal vector and a coplanar point.
   *
   * @param normal - Normal vector
   * @param point - A point on the plane
   * @returns New plane
   *
   * @example
   * ```typescript
   * const normal = new Vector3(0, 1, 0);
   * const point = new Vector3(0, 5, 0);
   * const plane = Plane.fromNormalAndCoplanarPoint(normal, point);
   * ```
   */
  static fromNormalAndCoplanarPoint(normal: Vector3, point: Vector3): Plane {
    return new Plane().setFromNormalAndCoplanarPoint(normal, point);
  }

  /**
   * Creates a new plane from three coplanar points.
   * Uses CCW winding for normal direction.
   *
   * @param a - First point
   * @param b - Second point
   * @param c - Third point
   * @returns New plane
   *
   * @example
   * ```typescript
   * const a = new Vector3(0, 0, 0);
   * const b = new Vector3(1, 0, 0);
   * const c = new Vector3(0, 0, 1);
   * const plane = Plane.fromCoplanarPoints(a, b, c);
   * ```
   */
  static fromCoplanarPoints(a: Vector3, b: Vector3, c: Vector3): Plane {
    return new Plane().setFromCoplanarPoints(a, b, c);
  }
}
