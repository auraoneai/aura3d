/**
 * 3D vector class for positions, directions, and velocities in 3D space.
 * Provides comprehensive vector operations with both immutable and in-place variants.
 * Coordinate system: Y-up, right-handed (-Z forward).
 * @module Vector3
 */

import { MathConstants } from './MathConstants';

const { EPSILON } = MathConstants;

/**
 * Checks if two numbers are nearly equal within epsilon tolerance.
 * @param a - First value
 * @param b - Second value
 * @param epsilon - Tolerance value
 * @returns True if values are nearly equal
 */
function nearlyEqual(a: number, b: number, epsilon: number = EPSILON): boolean {
  if (a === b) return true;
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= epsilon;
}

/**
 * 3D vector class representing a point or direction in 3D space.
 * Supports various mathematical operations for graphics and physics calculations.
 * All operations are optimized for performance (< 0.001ms per operation).
 *
 * @example
 * ```typescript
 * // Create vectors
 * const v1 = new Vector3(1, 2, 3);
 * const v2 = new Vector3(4, 5, 6);
 *
 * // Vector arithmetic
 * const sum = v1.add(v2);           // (5, 7, 9)
 * const diff = v1.sub(v2);          // (-3, -3, -3)
 * const scaled = v1.scale(2);       // (2, 4, 6)
 *
 * // Vector operations
 * const dotProduct = v1.dot(v2);    // 32
 * const cross = v1.cross(v2);       // (-3, 6, -3)
 * const len = v1.length();          // 3.742
 *
 * // Normalization
 * const normalized = v1.normalize(); // (0.267, 0.535, 0.802)
 *
 * // Static factories
 * const up = Vector3.up();           // (0, 1, 0)
 * const forward = Vector3.forward(); // (0, 0, -1)
 * ```
 */
export class Vector3 {
  /**
   * X component of the vector.
   */
  x: number;

  /**
   * Y component of the vector.
   */
  y: number;

  /**
   * Z component of the vector.
   */
  z: number;

  /**
   * Creates a new Vector3 instance.
   *
   * @param x - X component (default: 0)
   * @param y - Y component (default: 0)
   * @param z - Z component (default: 0)
   *
   * @example
   * ```typescript
   * const v1 = new Vector3();         // (0, 0, 0)
   * const v2 = new Vector3(1);        // (1, 0, 0)
   * const v3 = new Vector3(1, 2);     // (1, 2, 0)
   * const v4 = new Vector3(1, 2, 3);  // (1, 2, 3)
   * ```
   */
  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /**
   * Adds another vector to this vector and returns a new vector.
   *
   * @param v - Vector to add
   * @returns New vector containing the sum
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(1, 2, 3);
   * const v2 = new Vector3(4, 5, 6);
   * const result = v1.add(v2); // (5, 7, 9)
   * ```
   */
  add(v: Vector3): Vector3 {
    return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  /**
   * Subtracts another vector from this vector and returns a new vector.
   *
   * @param v - Vector to subtract
   * @returns New vector containing the difference
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(5, 7, 9);
   * const v2 = new Vector3(1, 2, 3);
   * const result = v1.sub(v2); // (4, 5, 6)
   * ```
   */
  sub(v: Vector3): Vector3 {
    return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  /**
   * Multiplies this vector component-wise with another vector and returns a new vector.
   *
   * @param v - Vector to multiply with
   * @returns New vector containing the component-wise product
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(2, 3, 4);
   * const v2 = new Vector3(5, 6, 7);
   * const result = v1.mul(v2); // (10, 18, 28)
   * ```
   */
  mul(v: Vector3): Vector3 {
    return new Vector3(this.x * v.x, this.y * v.y, this.z * v.z);
  }

  /**
   * Divides this vector component-wise by another vector and returns a new vector.
   *
   * @param v - Vector to divide by
   * @returns New vector containing the component-wise quotient
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(10, 20, 30);
   * const v2 = new Vector3(2, 4, 5);
   * const result = v1.div(v2); // (5, 5, 6)
   * ```
   */
  div(v: Vector3): Vector3 {
    return new Vector3(this.x / v.x, this.y / v.y, this.z / v.z);
  }

  /**
   * Scales this vector by a scalar value and returns a new vector.
   *
   * @param s - Scalar value to multiply by
   * @returns New scaled vector
   *
   * @example
   * ```typescript
   * const v = new Vector3(1, 2, 3);
   * const result = v.scale(2); // (2, 4, 6)
   * ```
   */
  scale(s: number): Vector3 {
    return new Vector3(this.x * s, this.y * s, this.z * s);
  }

  /**
   * Calculates the dot product (scalar product) with another vector.
   *
   * @param v - Vector to calculate dot product with
   * @returns The dot product value
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(1, 2, 3);
   * const v2 = new Vector3(4, 5, 6);
   * const dot = v1.dot(v2); // 32 (1*4 + 2*5 + 3*6)
   * ```
   */
  dot(v: Vector3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  /**
   * Calculates the cross product with another vector, following the right-hand rule.
   * The resulting vector is perpendicular to both input vectors.
   *
   * @param v - Vector to calculate cross product with
   * @returns New vector perpendicular to both input vectors
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(1, 0, 0);
   * const v2 = new Vector3(0, 1, 0);
   * const cross = v1.cross(v2); // (0, 0, 1)
   * ```
   */
  cross(v: Vector3): Vector3 {
    return new Vector3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }

  /**
   * Calculates the length (magnitude) of this vector.
   *
   * @returns The length of the vector
   *
   * @example
   * ```typescript
   * const v = new Vector3(3, 4, 0);
   * const len = v.length(); // 5
   * ```
   */
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  /**
   * Calculates the squared length of this vector.
   * Faster than length() as it avoids the square root operation.
   *
   * @returns The squared length of the vector
   *
   * @example
   * ```typescript
   * const v = new Vector3(3, 4, 0);
   * const lenSq = v.lengthSquared(); // 25
   * ```
   */
  lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  /**
   * Returns a normalized (unit length) version of this vector.
   * If the vector has zero length, returns a zero vector.
   *
   * @returns New normalized vector
   *
   * @example
   * ```typescript
   * const v = new Vector3(3, 4, 0);
   * const normalized = v.normalize(); // (0.6, 0.8, 0)
   * ```
   */
  normalize(): Vector3 {
    const lenSq = this.lengthSquared();
    if (lenSq < EPSILON * EPSILON) {
      return new Vector3(0, 0, 0);
    }
    const invLen = 1 / Math.sqrt(lenSq);
    return new Vector3(this.x * invLen, this.y * invLen, this.z * invLen);
  }

  /**
   * Returns the negation (opposite direction) of this vector.
   *
   * @returns New negated vector
   *
   * @example
   * ```typescript
   * const v = new Vector3(1, 2, 3);
   * const negated = v.negate(); // (-1, -2, -3)
   * ```
   */
  negate(): Vector3 {
    return new Vector3(-this.x, -this.y, -this.z);
  }

  /**
   * Performs linear interpolation between this vector and another vector.
   *
   * @param v - Target vector to interpolate towards
   * @param t - Interpolation factor (0 = this vector, 1 = target vector)
   * @returns New interpolated vector
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(0, 0, 0);
   * const v2 = new Vector3(10, 10, 10);
   * const mid = v1.lerp(v2, 0.5); // (5, 5, 5)
   * ```
   */
  lerp(v: Vector3, t: number): Vector3 {
    return new Vector3(
      this.x + (v.x - this.x) * t,
      this.y + (v.y - this.y) * t,
      this.z + (v.z - this.z) * t
    );
  }

  /**
   * Performs spherical linear interpolation between this vector and another vector.
   * Best for interpolating directions on the unit sphere.
   * Handles edge cases: parallel vectors, anti-parallel vectors, zero-length vectors.
   *
   * @param v - Target vector to interpolate towards
   * @param t - Interpolation factor (0 = this vector, 1 = target vector)
   * @returns New interpolated vector
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(1, 0, 0);
   * const v2 = new Vector3(0, 1, 0);
   * const mid = v1.slerp(v2, 0.5); // (0.707, 0.707, 0)
   * ```
   */
  slerp(v: Vector3, t: number): Vector3 {
    const lenThis = this.length();
    const lenV = v.length();

    if (lenThis < EPSILON || lenV < EPSILON) {
      return this.lerp(v, t);
    }

    const n1 = this.scale(1 / lenThis);
    const n2 = v.scale(1 / lenV);

    let dot = n1.dot(n2);

    if (dot > 1) dot = 1;
    if (dot < -1) dot = -1;

    if (Math.abs(dot) > 1 - EPSILON) {
      return this.lerp(v, t);
    }

    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);

    const w1 = Math.sin((1 - t) * theta) / sinTheta;
    const w2 = Math.sin(t * theta) / sinTheta;

    return new Vector3(
      n1.x * w1 + n2.x * w2,
      n1.y * w1 + n2.y * w2,
      n1.z * w1 + n2.z * w2
    );
  }

  /**
   * Projects this vector onto another vector.
   * Formula: onto * (this.dot(onto) / onto.dot(onto))
   *
   * @param onto - Vector to project onto
   * @returns New projected vector
   *
   * @example
   * ```typescript
   * const v = new Vector3(3, 4, 0);
   * const onto = new Vector3(1, 0, 0);
   * const proj = v.project(onto); // (3, 0, 0)
   * ```
   */
  project(onto: Vector3): Vector3 {
    const ontoLenSq = onto.lengthSquared();
    if (ontoLenSq < EPSILON * EPSILON) {
      return new Vector3(0, 0, 0);
    }
    const scale = this.dot(onto) / ontoLenSq;
    return onto.scale(scale);
  }

  /**
   * Rejects this vector from another vector (returns the perpendicular component).
   * Formula: this - project(from)
   *
   * @param from - Vector to reject from
   * @returns New rejected vector
   *
   * @example
   * ```typescript
   * const v = new Vector3(3, 4, 0);
   * const from = new Vector3(1, 0, 0);
   * const rej = v.reject(from); // (0, 4, 0)
   * ```
   */
  reject(from: Vector3): Vector3 {
    return this.sub(this.project(from));
  }

  /**
   * Reflects this vector across a surface defined by its normal vector.
   * Formula: this - 2 * dot(this, normal) * normal
   *
   * @param normal - Normal vector of the reflecting surface (should be normalized)
   * @returns New reflected vector
   *
   * @example
   * ```typescript
   * const v = new Vector3(1, -1, 0);
   * const normal = new Vector3(0, 1, 0);
   * const reflected = v.reflect(normal); // (1, 1, 0)
   * ```
   */
  reflect(normal: Vector3): Vector3 {
    const scale = 2 * this.dot(normal);
    return new Vector3(
      this.x - scale * normal.x,
      this.y - scale * normal.y,
      this.z - scale * normal.z
    );
  }

  /**
   * Adds another vector to this vector in place.
   *
   * @param v - Vector to add
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector3(1, 2, 3);
   * v.addInPlace(new Vector3(4, 5, 6)); // v is now (5, 7, 9)
   * ```
   */
  addInPlace(v: Vector3): this {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  /**
   * Subtracts another vector from this vector in place.
   *
   * @param v - Vector to subtract
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector3(5, 7, 9);
   * v.subInPlace(new Vector3(1, 2, 3)); // v is now (4, 5, 6)
   * ```
   */
  subInPlace(v: Vector3): this {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  /**
   * Multiplies this vector component-wise with another vector in place.
   *
   * @param v - Vector to multiply with
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector3(2, 3, 4);
   * v.mulInPlace(new Vector3(5, 6, 7)); // v is now (10, 18, 28)
   * ```
   */
  mulInPlace(v: Vector3): this {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    return this;
  }

  /**
   * Divides this vector component-wise by another vector in place.
   *
   * @param v - Vector to divide by
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector3(10, 20, 30);
   * v.divInPlace(new Vector3(2, 4, 5)); // v is now (5, 5, 6)
   * ```
   */
  divInPlace(v: Vector3): this {
    this.x /= v.x;
    this.y /= v.y;
    this.z /= v.z;
    return this;
  }

  /**
   * Scales this vector by a scalar value in place.
   *
   * @param s - Scalar value to multiply by
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector3(1, 2, 3);
   * v.scaleInPlace(2); // v is now (2, 4, 6)
   * ```
   */
  scaleInPlace(s: number): this {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  /**
   * Normalizes this vector in place (converts to unit length).
   * If the vector has zero length, it remains unchanged.
   *
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector3(3, 4, 0);
   * v.normalizeInPlace(); // v is now (0.6, 0.8, 0)
   * ```
   */
  normalizeInPlace(): this {
    const lenSq = this.lengthSquared();
    if (lenSq < EPSILON * EPSILON) {
      return this;
    }
    const invLen = 1 / Math.sqrt(lenSq);
    this.x *= invLen;
    this.y *= invLen;
    this.z *= invLen;
    return this;
  }

  /**
   * Negates this vector in place (reverses direction).
   *
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector3(1, 2, 3);
   * v.negateInPlace(); // v is now (-1, -2, -3)
   * ```
   */
  negateInPlace(): this {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  /**
   * Sets the components of this vector.
   *
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector3();
   * v.set(1, 2, 3); // v is now (1, 2, 3)
   * ```
   */
  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  /**
   * Creates a copy of this vector.
   *
   * @returns New vector with the same components
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(1, 2, 3);
   * const v2 = v1.clone(); // v2 is (1, 2, 3)
   * ```
   */
  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  /**
   * Copies the components from another vector to this vector.
   *
   * @param v - Vector to copy from
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(1, 2, 3);
   * const v2 = new Vector3();
   * v2.copy(v1); // v2 is now (1, 2, 3)
   * ```
   */
  copy(v: Vector3): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  /**
   * Checks if this vector is equal to another vector within an epsilon tolerance.
   *
   * @param v - Vector to compare with
   * @param epsilon - Tolerance value (default: EPSILON)
   * @returns True if vectors are nearly equal
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(1, 2, 3);
   * const v2 = new Vector3(1.0000001, 2, 3);
   * const equal = v1.equals(v2); // true
   * ```
   */
  equals(v: Vector3, epsilon: number = EPSILON): boolean {
    return (
      nearlyEqual(this.x, v.x, epsilon) &&
      nearlyEqual(this.y, v.y, epsilon) &&
      nearlyEqual(this.z, v.z, epsilon)
    );
  }

  /**
   * Converts this vector to an array.
   *
   * @returns Array containing [x, y, z]
   *
   * @example
   * ```typescript
   * const v = new Vector3(1, 2, 3);
   * const arr = v.toArray(); // [1, 2, 3]
   * ```
   */
  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  /**
   * Sets the components of this vector from an array.
   *
   * @param arr - Array-like object containing the components
   * @param offset - Starting index in the array (default: 0)
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector3();
   * v.fromArray([1, 2, 3]); // v is now (1, 2, 3)
   * v.fromArray([0, 1, 2, 3, 4], 2); // v is now (2, 3, 4)
   * ```
   */
  fromArray(arr: ArrayLike<number>, offset: number = 0): this {
    this.x = arr[offset];
    this.y = arr[offset + 1];
    this.z = arr[offset + 2];
    return this;
  }

  /**
   * Converts this vector to a JSON-serializable object.
   *
   * @returns Object containing x, y, z properties
   *
   * @example
   * ```typescript
   * const v = new Vector3(1, 2, 3);
   * const json = v.toJSON(); // { x: 1, y: 2, z: 3 }
   * JSON.stringify(v); // '{"x":1,"y":2,"z":3}'
   * ```
   */
  toJSON(): { x: number; y: number; z: number } {
    return { x: this.x, y: this.y, z: this.z };
  }

  /**
   * Calculates the distance from this vector to another vector.
   * Convenience method that calls Vector3.distance(this, v).
   *
   * @param v - The other vector
   * @returns Distance to the other vector
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(0, 0, 0);
   * const v2 = new Vector3(3, 4, 0);
   * const dist = v1.distanceTo(v2); // 5
   * ```
   */
  distanceTo(v: Vector3): number {
    return Vector3.distance(this, v);
  }

  /**
   * Calculates the squared distance from this vector to another vector.
   * Convenience method that calls Vector3.distanceSquared(this, v).
   * Faster than distanceTo() as it avoids the square root operation.
   *
   * @param v - The other vector
   * @returns Squared distance to the other vector
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(0, 0, 0);
   * const v2 = new Vector3(3, 4, 0);
   * const distSq = v1.distanceToSquared(v2); // 25
   * ```
   */
  distanceToSquared(v: Vector3): number {
    return Vector3.distanceSquared(this, v);
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
   * const v = new Vector3(1, 2, 3);
   * const result = v.multiplyScalar(2); // (2, 4, 6)
   * ```
   */
  multiplyScalar(s: number): Vector3 {
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
   * const v1 = new Vector3(5, 7, 9);
   * const v2 = new Vector3(1, 2, 3);
   * const result = v1.subtract(v2); // (4, 5, 6)
   * ```
   */
  subtract(v: Vector3): Vector3 {
    return this.sub(v);
  }

  /**
   * Applies a Matrix4 transformation to this vector.
   * Treats the vector as a point (w=1) and applies full transformation.
   *
   * @param m - Matrix4 to apply
   * @returns New transformed vector
   *
   * @example
   * ```typescript
   * const v = new Vector3(1, 0, 0);
   * const m = Matrix4.translation(5, 5, 5);
   * const result = v.applyMatrix4(m); // (6, 5, 5)
   * ```
   */
  applyMatrix4(m: { elements: Float32Array | number[] }): Vector3 {
    const e = m.elements;
    const x = this.x;
    const y = this.y;
    const z = this.z;

    const w = e[3] * x + e[7] * y + e[11] * z + e[15];

    return new Vector3(
      (e[0] * x + e[4] * y + e[8] * z + e[12]) / w,
      (e[1] * x + e[5] * y + e[9] * z + e[13]) / w,
      (e[2] * x + e[6] * y + e[10] * z + e[14]) / w
    );
  }

  /**
   * Applies a quaternion rotation to this vector.
   * Convenience method for rotating a vector by a quaternion.
   *
   * @param q - Quaternion to apply
   * @returns New rotated vector
   *
   * @example
   * ```typescript
   * const v = new Vector3(1, 0, 0);
   * const q = { x: 0, y: 0.707, z: 0, w: 0.707 }; // 90° around Y
   * const result = v.applyQuaternion(q); // Approximately (0, 0, -1)
   * ```
   */
  applyQuaternion(q: { x: number; y: number; z: number; w: number }): Vector3 {
    // q * v * q^(-1)
    const x = this.x;
    const y = this.y;
    const z = this.z;

    const qx = q.x;
    const qy = q.y;
    const qz = q.z;
    const qw = q.w;

    // Calculate quat * vector
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;

    // Calculate result * inverse quat
    return new Vector3(
      ix * qw + iw * -qx + iy * -qz - iz * -qy,
      iy * qw + iw * -qy + iz * -qx - ix * -qz,
      iz * qw + iw * -qz + ix * -qy - iy * -qx
    );
  }

  /**
   * Creates a zero vector (0, 0, 0).
   *
   * @returns New zero vector
   *
   * @example
   * ```typescript
   * const zero = Vector3.zero(); // (0, 0, 0)
   * ```
   */
  static zero(): Vector3 {
    return new Vector3(0, 0, 0);
  }

  /**
   * Creates a vector with all components set to 1.
   *
   * @returns New vector (1, 1, 1)
   *
   * @example
   * ```typescript
   * const one = Vector3.one(); // (1, 1, 1)
   * ```
   */
  static one(): Vector3 {
    return new Vector3(1, 1, 1);
  }

  /**
   * Creates a unit vector along the X axis.
   *
   * @returns New vector (1, 0, 0)
   *
   * @example
   * ```typescript
   * const unitX = Vector3.unitX(); // (1, 0, 0)
   * ```
   */
  static unitX(): Vector3 {
    return new Vector3(1, 0, 0);
  }

  /**
   * Creates a unit vector along the Y axis.
   *
   * @returns New vector (0, 1, 0)
   *
   * @example
   * ```typescript
   * const unitY = Vector3.unitY(); // (0, 1, 0)
   * ```
   */
  static unitY(): Vector3 {
    return new Vector3(0, 1, 0);
  }

  /**
   * Creates a unit vector along the Z axis.
   *
   * @returns New vector (0, 0, 1)
   *
   * @example
   * ```typescript
   * const unitZ = Vector3.unitZ(); // (0, 0, 1)
   * ```
   */
  static unitZ(): Vector3 {
    return new Vector3(0, 0, 1);
  }

  /**
   * Creates an up direction vector (0, 1, 0) in Y-up coordinate system.
   *
   * @returns New vector (0, 1, 0)
   *
   * @example
   * ```typescript
   * const up = Vector3.up(); // (0, 1, 0)
   * ```
   */
  static up(): Vector3 {
    return new Vector3(0, 1, 0);
  }

  /**
   * Creates a down direction vector (0, -1, 0) in Y-up coordinate system.
   *
   * @returns New vector (0, -1, 0)
   *
   * @example
   * ```typescript
   * const down = Vector3.down(); // (0, -1, 0)
   * ```
   */
  static down(): Vector3 {
    return new Vector3(0, -1, 0);
  }

  /**
   * Creates a forward direction vector (0, 0, -1) in right-handed coordinate system.
   *
   * @returns New vector (0, 0, -1)
   *
   * @example
   * ```typescript
   * const forward = Vector3.forward(); // (0, 0, -1)
   * ```
   */
  static forward(): Vector3 {
    return new Vector3(0, 0, -1);
  }

  /**
   * Creates a back direction vector (0, 0, 1) in right-handed coordinate system.
   *
   * @returns New vector (0, 0, 1)
   *
   * @example
   * ```typescript
   * const back = Vector3.back(); // (0, 0, 1)
   * ```
   */
  static back(): Vector3 {
    return new Vector3(0, 0, 1);
  }

  /**
   * Creates a right direction vector (1, 0, 0).
   *
   * @returns New vector (1, 0, 0)
   *
   * @example
   * ```typescript
   * const right = Vector3.right(); // (1, 0, 0)
   * ```
   */
  static right(): Vector3 {
    return new Vector3(1, 0, 0);
  }

  /**
   * Creates a left direction vector (-1, 0, 0).
   *
   * @returns New vector (-1, 0, 0)
   *
   * @example
   * ```typescript
   * const left = Vector3.left(); // (-1, 0, 0)
   * ```
   */
  static left(): Vector3 {
    return new Vector3(-1, 0, 0);
  }

  /**
   * Calculates the distance between two vectors.
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns Distance between the vectors
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(0, 0, 0);
   * const v2 = new Vector3(3, 4, 0);
   * const dist = Vector3.distance(v1, v2); // 5
   * ```
   */
  static distance(a: Vector3, b: Vector3): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Calculates the squared distance between two vectors.
   * Faster than distance() as it avoids the square root operation.
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns Squared distance between the vectors
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(0, 0, 0);
   * const v2 = new Vector3(3, 4, 0);
   * const distSq = Vector3.distanceSquared(v1, v2); // 25
   * ```
   */
  static distanceSquared(a: Vector3, b: Vector3): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    return dx * dx + dy * dy + dz * dz;
  }

  /**
   * Calculates the angle in radians between two vectors.
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns Angle in radians [0, PI]
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(1, 0, 0);
   * const v2 = new Vector3(0, 1, 0);
   * const angle = Vector3.angle(v1, v2); // PI/2 (90 degrees)
   * ```
   */
  static angle(a: Vector3, b: Vector3): number {
    const lenA = a.length();
    const lenB = b.length();

    if (lenA < EPSILON || lenB < EPSILON) {
      return 0;
    }

    let cosAngle = a.dot(b) / (lenA * lenB);

    if (cosAngle > 1) cosAngle = 1;
    if (cosAngle < -1) cosAngle = -1;

    return Math.acos(cosAngle);
  }

  /**
   * Returns a vector with the minimum components from two vectors.
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns New vector with minimum components
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(1, 5, 3);
   * const v2 = new Vector3(4, 2, 6);
   * const min = Vector3.min(v1, v2); // (1, 2, 3)
   * ```
   */
  static min(a: Vector3, b: Vector3): Vector3 {
    return new Vector3(
      Math.min(a.x, b.x),
      Math.min(a.y, b.y),
      Math.min(a.z, b.z)
    );
  }

  /**
   * Returns a vector with the maximum components from two vectors.
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns New vector with maximum components
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(1, 5, 3);
   * const v2 = new Vector3(4, 2, 6);
   * const max = Vector3.max(v1, v2); // (4, 5, 6)
   * ```
   */
  static max(a: Vector3, b: Vector3): Vector3 {
    return new Vector3(
      Math.max(a.x, b.x),
      Math.max(a.y, b.y),
      Math.max(a.z, b.z)
    );
  }

  /**
   * Adds two vectors and returns a new vector.
   * Static version of the add() instance method.
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns New vector containing the sum
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(1, 2, 3);
   * const v2 = new Vector3(4, 5, 6);
   * const sum = Vector3.add(v1, v2); // (5, 7, 9)
   * ```
   */
  static add(a: Vector3, b: Vector3): Vector3 {
    return a.add(b);
  }

  /**
   * Subtracts one vector from another and returns a new vector.
   * Static version of the sub() instance method.
   *
   * @param a - First vector
   * @param b - Second vector (to subtract)
   * @returns New vector containing the difference
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(5, 7, 9);
   * const v2 = new Vector3(1, 2, 3);
   * const diff = Vector3.subtract(v1, v2); // (4, 5, 6)
   * ```
   */
  static subtract(a: Vector3, b: Vector3): Vector3 {
    return a.sub(b);
  }

  /**
   * Multiplies a vector by a scalar and returns a new vector.
   * Static version of the scale() instance method.
   *
   * @param v - Vector to scale
   * @param s - Scalar value
   * @returns New scaled vector
   *
   * @example
   * ```typescript
   * const v = new Vector3(1, 2, 3);
   * const scaled = Vector3.multiplyScalar(v, 2); // (2, 4, 6)
   * ```
   */
  static multiplyScalar(v: Vector3, s: number): Vector3 {
    return v.scale(s);
  }

  /**
   * Multiplies two vectors component-wise and returns a new vector.
   * Static version of the mul() instance method.
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns New vector containing the component-wise product
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(2, 3, 4);
   * const v2 = new Vector3(5, 6, 7);
   * const product = Vector3.multiply(v1, v2); // (10, 18, 28)
   * ```
   */
  static multiply(a: Vector3, b: Vector3): Vector3 {
    return a.mul(b);
  }

  /**
   * Performs linear interpolation between two vectors.
   * Static version of the lerp() instance method.
   *
   * @param a - Start vector
   * @param b - End vector
   * @param t - Interpolation factor (0 = a, 1 = b)
   * @returns New interpolated vector
   *
   * @example
   * ```typescript
   * const v1 = new Vector3(0, 0, 0);
   * const v2 = new Vector3(10, 10, 10);
   * const mid = Vector3.lerp(v1, v2, 0.5); // (5, 5, 5)
   * ```
   */
  static lerp(a: Vector3, b: Vector3, t: number): Vector3 {
    return a.lerp(b, t);
  }
}
