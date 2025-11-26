/**
 * 2D vector class for UI positioning, texture coordinates, and 2D physics.
 * Provides comprehensive vector operations with both immutable and in-place variants.
 * @module Vector2
 */

import { MathConstants, nearlyEqual } from './MathConstants';

const { EPSILON } = MathConstants;

/**
 * Represents a 2D vector with x and y components.
 * Used for UI positioning, texture coordinates, 2D physics calculations, and more.
 *
 * @example
 * ```typescript
 * // Create vectors
 * const v1 = new Vector2(3, 4);
 * const v2 = new Vector2(1, 2);
 *
 * // Vector operations
 * const sum = v1.add(v2);           // New vector (4, 6)
 * const scaled = v1.scale(2);       // New vector (6, 8)
 * const len = v1.length();          // 5
 * const normalized = v1.normalize(); // New unit vector
 *
 * // In-place operations (mutate original)
 * v1.addInPlace(v2);                // v1 is now (4, 6)
 * v1.scaleInPlace(0.5);             // v1 is now (2, 3)
 * ```
 */
export class Vector2 {
  /**
   * The x component of the vector.
   */
  public x: number;

  /**
   * The y component of the vector.
   */
  public y: number;

  /**
   * Creates a new Vector2 instance.
   *
   * @param x - The x component (default: 0)
   * @param y - The y component (default: 0)
   *
   * @example
   * ```typescript
   * const v1 = new Vector2();        // (0, 0)
   * const v2 = new Vector2(3);       // (3, 0)
   * const v3 = new Vector2(3, 4);    // (3, 4)
   * ```
   */
  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  /**
   * Adds another vector to this vector and returns a new vector.
   *
   * @param v - The vector to add
   * @returns A new vector representing the sum
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(1, 2);
   * const v2 = new Vector2(3, 4);
   * const result = v1.add(v2);  // (4, 6)
   * // v1 and v2 remain unchanged
   * ```
   */
  add(v: Vector2): Vector2 {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  /**
   * Subtracts another vector from this vector and returns a new vector.
   *
   * @param v - The vector to subtract
   * @returns A new vector representing the difference
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(5, 7);
   * const v2 = new Vector2(2, 3);
   * const result = v1.sub(v2);  // (3, 4)
   * ```
   */
  sub(v: Vector2): Vector2 {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  /**
   * Multiplies this vector component-wise with another vector and returns a new vector.
   *
   * @param v - The vector to multiply with
   * @returns A new vector with component-wise multiplication
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(2, 3);
   * const v2 = new Vector2(4, 5);
   * const result = v1.mul(v2);  // (8, 15)
   * ```
   */
  mul(v: Vector2): Vector2 {
    return new Vector2(this.x * v.x, this.y * v.y);
  }

  /**
   * Divides this vector component-wise by another vector and returns a new vector.
   *
   * @param v - The vector to divide by
   * @returns A new vector with component-wise division
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(8, 15);
   * const v2 = new Vector2(2, 3);
   * const result = v1.div(v2);  // (4, 5)
   * ```
   */
  div(v: Vector2): Vector2 {
    return new Vector2(this.x / v.x, this.y / v.y);
  }

  /**
   * Scales this vector by a scalar value and returns a new vector.
   *
   * @param s - The scalar to multiply by
   * @returns A new scaled vector
   *
   * @example
   * ```typescript
   * const v = new Vector2(3, 4);
   * const result = v.scale(2);  // (6, 8)
   * const half = v.scale(0.5);  // (1.5, 2)
   * ```
   */
  scale(s: number): Vector2 {
    return new Vector2(this.x * s, this.y * s);
  }

  /**
   * Computes the dot product of this vector and another vector.
   * The dot product is useful for calculating angles between vectors,
   * projections, and determining if vectors are perpendicular.
   *
   * @param v - The vector to compute the dot product with
   * @returns The dot product (scalar value)
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(1, 0);
   * const v2 = new Vector2(0, 1);
   * v1.dot(v2);  // 0 (perpendicular)
   *
   * const v3 = new Vector2(3, 4);
   * const v4 = new Vector2(2, 1);
   * v3.dot(v4);  // 10 (3*2 + 4*1)
   * ```
   */
  dot(v: Vector2): number {
    return this.x * v.x + this.y * v.y;
  }

  /**
   * Computes the 2D cross product (also known as the perpendicular dot product).
   * Returns the z-component of the 3D cross product when treating the 2D vectors
   * as 3D vectors with z=0. Useful for determining rotation direction and signed area.
   *
   * @param v - The vector to compute the cross product with
   * @returns The z-component of the cross product (scalar value)
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(1, 0);
   * const v2 = new Vector2(0, 1);
   * v1.cross(v2);  // 1 (counter-clockwise)
   * v2.cross(v1);  // -1 (clockwise)
   *
   * const v3 = new Vector2(2, 3);
   * const v4 = new Vector2(4, 6);
   * v3.cross(v4);  // 0 (parallel)
   * ```
   */
  cross(v: Vector2): number {
    return this.x * v.y - this.y * v.x;
  }

  /**
   * Calculates the length (magnitude) of this vector.
   *
   * @returns The length of the vector
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(3, 4);
   * v1.length();  // 5
   *
   * const v2 = new Vector2(1, 0);
   * v2.length();  // 1
   * ```
   */
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  /**
   * Calculates the squared length of this vector.
   * More efficient than length() when only comparing magnitudes,
   * as it avoids the square root calculation.
   *
   * @returns The squared length of the vector
   *
   * @example
   * ```typescript
   * const v = new Vector2(3, 4);
   * v.lengthSquared();  // 25 (faster than v.length() * v.length())
   * ```
   */
  lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  /**
   * Returns a new normalized (unit length) vector in the same direction.
   * If the vector has zero length, returns a zero vector.
   *
   * @returns A new normalized vector
   *
   * @example
   * ```typescript
   * const v = new Vector2(3, 4);
   * const normalized = v.normalize();  // (0.6, 0.8) with length 1
   *
   * const zero = new Vector2(0, 0);
   * zero.normalize();  // (0, 0) - handles zero-length case
   * ```
   */
  normalize(): Vector2 {
    const len = this.length();
    if (len === 0) {
      return new Vector2(0, 0);
    }
    return new Vector2(this.x / len, this.y / len);
  }

  /**
   * Returns a new vector with negated components.
   *
   * @returns A new negated vector
   *
   * @example
   * ```typescript
   * const v = new Vector2(3, -4);
   * const negated = v.negate();  // (-3, 4)
   * ```
   */
  negate(): Vector2 {
    return new Vector2(-this.x, -this.y);
  }

  /**
   * Performs linear interpolation between this vector and another vector.
   *
   * @param v - The target vector
   * @param t - The interpolation factor (0-1, but not clamped)
   * @returns A new interpolated vector
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(0, 0);
   * const v2 = new Vector2(10, 10);
   * v1.lerp(v2, 0);    // (0, 0)
   * v1.lerp(v2, 0.5);  // (5, 5)
   * v1.lerp(v2, 1);    // (10, 10)
   * v1.lerp(v2, 2);    // (20, 20) - extrapolation
   * ```
   */
  lerp(v: Vector2, t: number): Vector2 {
    return new Vector2(
      this.x + (v.x - this.x) * t,
      this.y + (v.y - this.y) * t
    );
  }

  /**
   * Returns the angle of this vector from the positive x-axis in radians.
   * The angle is in the range [-π, π].
   *
   * @returns The angle in radians
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(1, 0);
   * v1.angle();  // 0
   *
   * const v2 = new Vector2(0, 1);
   * v2.angle();  // π/2 (≈ 1.5708)
   *
   * const v3 = new Vector2(-1, 0);
   * v3.angle();  // π (≈ 3.1416)
   *
   * const v4 = new Vector2(1, 1);
   * v4.angle();  // π/4 (≈ 0.7854)
   * ```
   */
  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  /**
   * Rotates this vector by the specified angle around the origin and returns a new vector.
   *
   * @param radians - The angle to rotate by in radians
   * @returns A new rotated vector
   *
   * @example
   * ```typescript
   * const v = new Vector2(1, 0);
   * const rotated90 = v.rotate(Math.PI / 2);  // (0, 1)
   * const rotated180 = v.rotate(Math.PI);     // (-1, 0)
   * const rotated270 = v.rotate(3 * Math.PI / 2);  // (0, -1)
   * ```
   */
  rotate(radians: number): Vector2 {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return new Vector2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }

  /**
   * Returns a vector perpendicular to this one (90° counter-clockwise rotation).
   * Computed as (-y, x).
   *
   * @returns A new perpendicular vector
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(1, 0);
   * v1.perpendicular();  // (0, 1)
   *
   * const v2 = new Vector2(3, 4);
   * v2.perpendicular();  // (-4, 3)
   * ```
   */
  perpendicular(): Vector2 {
    return new Vector2(-this.y, this.x);
  }

  /**
   * Reflects this vector about a normal vector.
   * Used for bounce calculations and mirror reflections.
   * Formula: v - 2 * dot(v, n) * n
   *
   * @param normal - The normal vector (should be normalized for correct results)
   * @returns A new reflected vector
   *
   * @example
   * ```typescript
   * // Ball bouncing off a horizontal surface
   * const velocity = new Vector2(5, -10);
   * const normal = new Vector2(0, 1);  // Upward normal
   * const bounced = velocity.reflect(normal);  // (5, 10)
   *
   * // Reflecting off a 45° surface
   * const v = new Vector2(1, -1);
   * const n = new Vector2(0.707, 0.707);  // 45° normal
   * const reflected = v.reflect(n);  // (-1, 1)
   * ```
   */
  reflect(normal: Vector2): Vector2 {
    const d = this.dot(normal);
    return new Vector2(
      this.x - 2 * d * normal.x,
      this.y - 2 * d * normal.y
    );
  }

  /**
   * Adds another vector to this vector in-place.
   *
   * @param v - The vector to add
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(1, 2);
   * const v2 = new Vector2(3, 4);
   * v1.addInPlace(v2);  // v1 is now (4, 6)
   * ```
   */
  addInPlace(v: Vector2): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  /**
   * Subtracts another vector from this vector in-place.
   *
   * @param v - The vector to subtract
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(5, 7);
   * const v2 = new Vector2(2, 3);
   * v1.subInPlace(v2);  // v1 is now (3, 4)
   * ```
   */
  subInPlace(v: Vector2): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  /**
   * Multiplies this vector component-wise with another vector in-place.
   *
   * @param v - The vector to multiply with
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(2, 3);
   * const v2 = new Vector2(4, 5);
   * v1.mulInPlace(v2);  // v1 is now (8, 15)
   * ```
   */
  mulInPlace(v: Vector2): this {
    this.x *= v.x;
    this.y *= v.y;
    return this;
  }

  /**
   * Divides this vector component-wise by another vector in-place.
   *
   * @param v - The vector to divide by
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(8, 15);
   * const v2 = new Vector2(2, 3);
   * v1.divInPlace(v2);  // v1 is now (4, 5)
   * ```
   */
  divInPlace(v: Vector2): this {
    this.x /= v.x;
    this.y /= v.y;
    return this;
  }

  /**
   * Scales this vector by a scalar value in-place.
   *
   * @param s - The scalar to multiply by
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector2(3, 4);
   * v.scaleInPlace(2);  // v is now (6, 8)
   * v.scaleInPlace(0.5);  // v is now (3, 4)
   * ```
   */
  scaleInPlace(s: number): this {
    this.x *= s;
    this.y *= s;
    return this;
  }

  /**
   * Normalizes this vector in-place to unit length.
   * If the vector has zero length, it remains unchanged.
   *
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector2(3, 4);
   * v.normalizeInPlace();  // v is now (0.6, 0.8) with length 1
   *
   * const zero = new Vector2(0, 0);
   * zero.normalizeInPlace();  // zero remains (0, 0)
   * ```
   */
  normalizeInPlace(): this {
    const len = this.length();
    if (len === 0) {
      return this;
    }
    this.x /= len;
    this.y /= len;
    return this;
  }

  /**
   * Negates this vector in-place.
   *
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector2(3, -4);
   * v.negateInPlace();  // v is now (-3, 4)
   * ```
   */
  negateInPlace(): this {
    this.x = -this.x;
    this.y = -this.y;
    return this;
  }

  /**
   * Rotates this vector by the specified angle around the origin in-place.
   *
   * @param radians - The angle to rotate by in radians
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector2(1, 0);
   * v.rotateInPlace(Math.PI / 2);  // v is now (0, 1)
   * ```
   */
  rotateInPlace(radians: number): this {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const x = this.x * cos - this.y * sin;
    const y = this.x * sin + this.y * cos;
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * Sets the x and y components of this vector.
   *
   * @param x - The new x component
   * @param y - The new y component
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector2();
   * v.set(3, 4);  // v is now (3, 4)
   * ```
   */
  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * Creates a new vector with the same components as this one.
   *
   * @returns A new cloned vector
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(3, 4);
   * const v2 = v1.clone();  // v2 is (3, 4)
   * v2.x = 5;  // v1 remains (3, 4)
   * ```
   */
  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  /**
   * Copies the components from another vector to this vector.
   *
   * @param v - The vector to copy from
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(1, 2);
   * const v2 = new Vector2(3, 4);
   * v1.copy(v2);  // v1 is now (3, 4)
   * ```
   */
  copy(v: Vector2): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  /**
   * Checks if this vector is equal to another vector within an epsilon tolerance.
   *
   * @param v - The vector to compare with
   * @param epsilon - The epsilon tolerance (default: EPSILON from MathConstants)
   * @returns True if the vectors are nearly equal, false otherwise
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(1.0, 2.0);
   * const v2 = new Vector2(1.0000001, 2.0000001);
   * v1.equals(v2);  // true (within default epsilon)
   *
   * const v3 = new Vector2(1.1, 2.1);
   * v1.equals(v3);  // false
   *
   * const v4 = new Vector2(1.01, 2.01);
   * v1.equals(v4, 0.1);  // true (within custom epsilon)
   * ```
   */
  equals(v: Vector2, epsilon: number = EPSILON): boolean {
    return nearlyEqual(this.x, v.x, epsilon) && nearlyEqual(this.y, v.y, epsilon);
  }

  /**
   * Converts this vector to a tuple array.
   *
   * @returns A tuple [x, y]
   *
   * @example
   * ```typescript
   * const v = new Vector2(3, 4);
   * const arr = v.toArray();  // [3, 4]
   * ```
   */
  toArray(): [number, number] {
    return [this.x, this.y];
  }

  /**
   * Sets the components of this vector from an array-like object.
   *
   * @param arr - The array-like object to read from
   * @param offset - The offset in the array to start reading from (default: 0)
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector2();
   * v.fromArray([3, 4]);  // v is now (3, 4)
   * v.fromArray([1, 2, 3, 4], 2);  // v is now (3, 4) - starts at index 2
   * ```
   */
  fromArray(arr: ArrayLike<number>, offset: number = 0): this {
    this.x = arr[offset];
    this.y = arr[offset + 1];
    return this;
  }

  /**
   * Converts this vector to a JSON-serializable object.
   *
   * @returns An object with x and y properties
   *
   * @example
   * ```typescript
   * const v = new Vector2(3, 4);
   * const json = JSON.stringify(v.toJSON());  // '{"x":3,"y":4}'
   * ```
   */
  toJSON(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /**
   * Calculates the distance from this vector to another vector.
   * Convenience method that calls Vector2.distance(this, v).
   *
   * @param v - The other vector
   * @returns Distance to the other vector
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(0, 0);
   * const v2 = new Vector2(3, 4);
   * const dist = v1.distanceTo(v2); // 5
   * ```
   */
  distanceTo(v: Vector2): number {
    return Vector2.distance(this, v);
  }

  /**
   * Calculates the squared distance from this vector to another vector.
   * Convenience method that calls Vector2.distanceSquared(this, v).
   * Faster than distanceTo() as it avoids the square root operation.
   *
   * @param v - The other vector
   * @returns Squared distance to the other vector
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(0, 0);
   * const v2 = new Vector2(3, 4);
   * const distSq = v1.distanceToSquared(v2); // 25
   * ```
   */
  distanceToSquared(v: Vector2): number {
    return Vector2.distanceSquared(this, v);
  }

  /**
   * Multiplies this vector by a scalar value.
   * Alias for scale() to match common vector library APIs.
   *
   * @param s - Scalar value to multiply by
   * @returns New scaled vector
   *
   * @example
   * ```typescript
   * const v = new Vector2(1, 2);
   * const result = v.multiplyScalar(2); // (2, 4)
   * ```
   */
  multiplyScalar(s: number): Vector2 {
    return this.scale(s);
  }

  /**
   * Subtracts another vector from this vector.
   * Alias for sub() to match common vector library APIs.
   *
   * @param v - Vector to subtract
   * @returns New vector containing the difference
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(5, 7);
   * const v2 = new Vector2(1, 2);
   * const result = v1.subtract(v2); // (4, 5)
   * ```
   */
  subtract(v: Vector2): Vector2 {
    return this.sub(v);
  }

  /**
   * Creates a zero vector (0, 0).
   *
   * @returns A new zero vector
   *
   * @example
   * ```typescript
   * const zero = Vector2.zero();  // (0, 0)
   * ```
   */
  static zero(): Vector2 {
    return new Vector2(0, 0);
  }

  /**
   * Creates a vector with both components set to one (1, 1).
   *
   * @returns A new vector (1, 1)
   *
   * @example
   * ```typescript
   * const one = Vector2.one();  // (1, 1)
   * ```
   */
  static one(): Vector2 {
    return new Vector2(1, 1);
  }

  /**
   * Creates a unit vector along the x-axis (1, 0).
   *
   * @returns A new unit vector (1, 0)
   *
   * @example
   * ```typescript
   * const unitX = Vector2.unitX();  // (1, 0)
   * ```
   */
  static unitX(): Vector2 {
    return new Vector2(1, 0);
  }

  /**
   * Creates a unit vector along the y-axis (0, 1).
   *
   * @returns A new unit vector (0, 1)
   *
   * @example
   * ```typescript
   * const unitY = Vector2.unitY();  // (0, 1)
   * ```
   */
  static unitY(): Vector2 {
    return new Vector2(0, 1);
  }

  /**
   * Creates a unit vector from an angle in radians.
   * The angle is measured from the positive x-axis.
   *
   * @param radians - The angle in radians
   * @returns A new unit vector at the specified angle
   *
   * @example
   * ```typescript
   * const v1 = Vector2.fromAngle(0);           // (1, 0)
   * const v2 = Vector2.fromAngle(Math.PI / 2); // (0, 1)
   * const v3 = Vector2.fromAngle(Math.PI);     // (-1, 0)
   * const v4 = Vector2.fromAngle(Math.PI / 4); // (0.707, 0.707)
   * ```
   */
  static fromAngle(radians: number): Vector2 {
    return new Vector2(Math.cos(radians), Math.sin(radians));
  }

  /**
   * Calculates the distance between two vectors.
   *
   * @param a - The first vector
   * @param b - The second vector
   * @returns The distance between the two vectors
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(0, 0);
   * const v2 = new Vector2(3, 4);
   * Vector2.distance(v1, v2);  // 5
   * ```
   */
  static distance(a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculates the squared distance between two vectors.
   * More efficient than distance() when only comparing distances.
   *
   * @param a - The first vector
   * @param b - The second vector
   * @returns The squared distance between the two vectors
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(0, 0);
   * const v2 = new Vector2(3, 4);
   * Vector2.distanceSquared(v1, v2);  // 25
   * ```
   */
  static distanceSquared(a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return dx * dx + dy * dy;
  }

  /**
   * Creates a new vector with the minimum components from two vectors.
   *
   * @param a - The first vector
   * @param b - The second vector
   * @returns A new vector with min(a.x, b.x) and min(a.y, b.y)
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(1, 5);
   * const v2 = new Vector2(3, 2);
   * Vector2.min(v1, v2);  // (1, 2)
   * ```
   */
  static min(a: Vector2, b: Vector2): Vector2 {
    return new Vector2(Math.min(a.x, b.x), Math.min(a.y, b.y));
  }

  /**
   * Creates a new vector with the maximum components from two vectors.
   *
   * @param a - The first vector
   * @param b - The second vector
   * @returns A new vector with max(a.x, b.x) and max(a.y, b.y)
   *
   * @example
   * ```typescript
   * const v1 = new Vector2(1, 5);
   * const v2 = new Vector2(3, 2);
   * Vector2.max(v1, v2);  // (3, 5)
   * ```
   */
  static max(a: Vector2, b: Vector2): Vector2 {
    return new Vector2(Math.max(a.x, b.x), Math.max(a.y, b.y));
  }
}
