/**
 * 4D vector class for homogeneous coordinates, colors, and quaternion data.
 * @module Vector4
 */

import { MathConstants } from './MathConstants';
import { nearlyEqual } from './MathConstants';
import { Vector2 } from './Vector2';
import { Vector3 } from './Vector3';

/**
 * Represents a 4D vector or homogeneous coordinate.
 * Used for homogeneous transformations, RGBA colors, quaternion data, and general 4D math operations.
 *
 * @example
 * ```typescript
 * const v1 = new Vector4(1, 2, 3, 1);
 * const v2 = new Vector4(4, 5, 6, 1);
 * const sum = v1.add(v2);        // Vector4(5, 7, 9, 2)
 * const pos = v1.perspectiveDivide();  // Vector3(1, 2, 3)
 * ```
 */
export class Vector4 {
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
   * W component of the vector.
   * In homogeneous coordinates: w=1 represents a point, w=0 represents a direction.
   */
  w: number;

  /**
   * Creates a new Vector4.
   *
   * @param x - The x component (defaults to 0)
   * @param y - The y component (defaults to 0)
   * @param z - The z component (defaults to 0)
   * @param w - The w component (defaults to 1 for homogeneous point)
   *
   * @example
   * ```typescript
   * const v1 = new Vector4();             // Vector4(0, 0, 0, 1) - homogeneous point
   * const v2 = new Vector4(1);            // Vector4(1, 0, 0, 1)
   * const v3 = new Vector4(1, 2, 3);      // Vector4(1, 2, 3, 1)
   * const v4 = new Vector4(1, 2, 3, 0);   // Vector4(1, 2, 3, 0) - direction
   * ```
   */
  constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /**
   * Adds another vector to this vector and returns a new vector.
   *
   * @param v - The vector to add
   * @returns A new vector representing the sum
   *
   * @example
   * ```typescript
   * const v1 = new Vector4(1, 2, 3, 1);
   * const v2 = new Vector4(4, 5, 6, 1);
   * const sum = v1.add(v2);  // Vector4(5, 7, 9, 2)
   * ```
   */
  add(v: Vector4): Vector4 {
    return new Vector4(this.x + v.x, this.y + v.y, this.z + v.z, this.w + v.w);
  }

  /**
   * Subtracts another vector from this vector and returns a new vector.
   *
   * @param v - The vector to subtract
   * @returns A new vector representing the difference
   *
   * @example
   * ```typescript
   * const v1 = new Vector4(5, 7, 9, 3);
   * const v2 = new Vector4(2, 3, 4, 1);
   * const diff = v1.sub(v2);  // Vector4(3, 4, 5, 2)
   * ```
   */
  sub(v: Vector4): Vector4 {
    return new Vector4(this.x - v.x, this.y - v.y, this.z - v.z, this.w - v.w);
  }

  /**
   * Multiplies this vector component-wise with another vector.
   *
   * @param v - The vector to multiply with
   * @returns A new vector representing the component-wise product
   *
   * @example
   * ```typescript
   * const v1 = new Vector4(2, 3, 4, 5);
   * const v2 = new Vector4(6, 7, 8, 9);
   * const product = v1.mul(v2);  // Vector4(12, 21, 32, 45)
   * ```
   */
  mul(v: Vector4): Vector4 {
    return new Vector4(this.x * v.x, this.y * v.y, this.z * v.z, this.w * v.w);
  }

  /**
   * Divides this vector component-wise by another vector.
   *
   * @param v - The vector to divide by
   * @returns A new vector representing the component-wise quotient
   *
   * @example
   * ```typescript
   * const v1 = new Vector4(12, 21, 32, 45);
   * const v2 = new Vector4(2, 3, 4, 5);
   * const quotient = v1.div(v2);  // Vector4(6, 7, 8, 9)
   * ```
   */
  div(v: Vector4): Vector4 {
    return new Vector4(this.x / v.x, this.y / v.y, this.z / v.z, this.w / v.w);
  }

  /**
   * Scales this vector by a scalar value.
   *
   * @param s - The scalar value
   * @returns A new scaled vector
   *
   * @example
   * ```typescript
   * const v = new Vector4(1, 2, 3, 4);
   * const scaled = v.scale(2);  // Vector4(2, 4, 6, 8)
   * ```
   */
  scale(s: number): Vector4 {
    return new Vector4(this.x * s, this.y * s, this.z * s, this.w * s);
  }

  /**
   * Computes the dot product of this vector with another vector.
   *
   * @param v - The other vector
   * @returns The dot product
   *
   * @example
   * ```typescript
   * const v1 = new Vector4(1, 2, 3, 4);
   * const v2 = new Vector4(5, 6, 7, 8);
   * const dot = v1.dot(v2);  // 70 (1*5 + 2*6 + 3*7 + 4*8)
   * ```
   */
  dot(v: Vector4): number {
    return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
  }

  /**
   * Computes the length (magnitude) of this vector.
   *
   * @returns The length of the vector
   *
   * @example
   * ```typescript
   * const v = new Vector4(2, 3, 6, 0);
   * const len = v.length();  // 7
   * ```
   */
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
  }

  /**
   * Computes the squared length of this vector.
   * Useful for comparisons without the expensive square root operation.
   *
   * @returns The squared length
   *
   * @example
   * ```typescript
   * const v = new Vector4(2, 3, 6, 0);
   * const lenSq = v.lengthSquared();  // 49
   * ```
   */
  lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
  }

  /**
   * Returns a normalized (unit length) version of this vector.
   * If the vector has zero length, returns a zero vector.
   *
   * @returns A new normalized vector
   *
   * @example
   * ```typescript
   * const v = new Vector4(0, 0, 3, 4);
   * const normalized = v.normalize();  // Vector4(0, 0, 0.6, 0.8)
   * ```
   */
  normalize(): Vector4 {
    const len = this.length();
    if (len < MathConstants.EPSILON) {
      return new Vector4(0, 0, 0, 0);
    }
    return this.scale(1 / len);
  }

  /**
   * Returns the negation of this vector.
   *
   * @returns A new negated vector
   *
   * @example
   * ```typescript
   * const v = new Vector4(1, -2, 3, -4);
   * const neg = v.negate();  // Vector4(-1, 2, -3, 4)
   * ```
   */
  negate(): Vector4 {
    return new Vector4(-this.x, -this.y, -this.z, -this.w);
  }

  /**
   * Linearly interpolates between this vector and another vector.
   *
   * @param v - The target vector
   * @param t - The interpolation factor (0 = this vector, 1 = target vector)
   * @returns A new interpolated vector
   *
   * @example
   * ```typescript
   * const v1 = new Vector4(0, 0, 0, 0);
   * const v2 = new Vector4(10, 10, 10, 10);
   * const mid = v1.lerp(v2, 0.5);  // Vector4(5, 5, 5, 5)
   * ```
   */
  lerp(v: Vector4, t: number): Vector4 {
    return new Vector4(
      this.x + (v.x - this.x) * t,
      this.y + (v.y - this.y) * t,
      this.z + (v.z - this.z) * t,
      this.w + (v.w - this.w) * t
    );
  }

  /**
   * Performs perspective division to convert from homogeneous coordinates to 3D coordinates.
   * Divides x, y, z by w to get the actual 3D position.
   * If w is zero or near zero, returns a zero vector.
   *
   * @returns A new Vector3 representing the 3D position (xyz / w)
   *
   * @example
   * ```typescript
   * const v1 = new Vector4(4, 6, 8, 2);
   * const pos = v1.perspectiveDivide();  // Vector3(2, 3, 4)
   *
   * const v2 = new Vector4(1, 2, 3, 0);
   * const dir = v2.perspectiveDivide();  // Vector3(0, 0, 0) - direction vector
   * ```
   */
  perspectiveDivide(): Vector3 {
    if (Math.abs(this.w) < MathConstants.EPSILON) {
      return new Vector3(0, 0, 0);
    }
    return new Vector3(this.x / this.w, this.y / this.w, this.z / this.w);
  }

  /**
   * Returns the xy components as a Vector2.
   *
   * @returns A new Vector2 with the x and y components
   *
   * @example
   * ```typescript
   * const v = new Vector4(1, 2, 3, 4);
   * const xy = v.xy;  // Vector2(1, 2)
   * ```
   */
  get xy(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  /**
   * Returns the xyz components as a Vector3.
   *
   * @returns A new Vector3 with the x, y, and z components
   *
   * @example
   * ```typescript
   * const v = new Vector4(1, 2, 3, 4);
   * const xyz = v.xyz;  // Vector3(1, 2, 3)
   * ```
   */
  get xyz(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  /**
   * Adds another vector to this vector in place.
   *
   * @param v - The vector to add
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector4(1, 2, 3, 1);
   * v.addInPlace(new Vector4(4, 5, 6, 1));  // v is now Vector4(5, 7, 9, 2)
   * ```
   */
  addInPlace(v: Vector4): this {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    this.w += v.w;
    return this;
  }

  /**
   * Subtracts another vector from this vector in place.
   *
   * @param v - The vector to subtract
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector4(5, 7, 9, 3);
   * v.subInPlace(new Vector4(2, 3, 4, 1));  // v is now Vector4(3, 4, 5, 2)
   * ```
   */
  subInPlace(v: Vector4): this {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    this.w -= v.w;
    return this;
  }

  /**
   * Multiplies this vector component-wise with another vector in place.
   *
   * @param v - The vector to multiply with
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector4(2, 3, 4, 5);
   * v.mulInPlace(new Vector4(6, 7, 8, 9));  // v is now Vector4(12, 21, 32, 45)
   * ```
   */
  mulInPlace(v: Vector4): this {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    this.w *= v.w;
    return this;
  }

  /**
   * Divides this vector component-wise by another vector in place.
   *
   * @param v - The vector to divide by
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector4(12, 21, 32, 45);
   * v.divInPlace(new Vector4(2, 3, 4, 5));  // v is now Vector4(6, 7, 8, 9)
   * ```
   */
  divInPlace(v: Vector4): this {
    this.x /= v.x;
    this.y /= v.y;
    this.z /= v.z;
    this.w /= v.w;
    return this;
  }

  /**
   * Scales this vector by a scalar value in place.
   *
   * @param s - The scalar value
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector4(1, 2, 3, 4);
   * v.scaleInPlace(2);  // v is now Vector4(2, 4, 6, 8)
   * ```
   */
  scaleInPlace(s: number): this {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    this.w *= s;
    return this;
  }

  /**
   * Normalizes this vector in place.
   * If the vector has zero length, it remains unchanged.
   *
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector4(0, 0, 3, 4);
   * v.normalizeInPlace();  // v is now Vector4(0, 0, 0.6, 0.8)
   * ```
   */
  normalizeInPlace(): this {
    const len = this.length();
    if (len > MathConstants.EPSILON) {
      this.x /= len;
      this.y /= len;
      this.z /= len;
      this.w /= len;
    }
    return this;
  }

  /**
   * Negates this vector in place.
   *
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector4(1, -2, 3, -4);
   * v.negateInPlace();  // v is now Vector4(-1, 2, -3, 4)
   * ```
   */
  negateInPlace(): this {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    this.w = -this.w;
    return this;
  }

  /**
   * Sets the components of this vector.
   *
   * @param x - The x component
   * @param y - The y component
   * @param z - The z component
   * @param w - The w component
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector4();
   * v.set(1, 2, 3, 4);  // v is now Vector4(1, 2, 3, 4)
   * ```
   */
  set(x: number, y: number, z: number, w: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  /**
   * Creates a copy of this vector.
   *
   * @returns A new vector with the same components
   *
   * @example
   * ```typescript
   * const v1 = new Vector4(1, 2, 3, 4);
   * const v2 = v1.clone();  // v2 is Vector4(1, 2, 3, 4), independent of v1
   * ```
   */
  clone(): Vector4 {
    return new Vector4(this.x, this.y, this.z, this.w);
  }

  /**
   * Copies the components from another vector to this vector.
   *
   * @param v - The vector to copy from
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v1 = new Vector4(1, 2, 3, 4);
   * const v2 = new Vector4();
   * v2.copy(v1);  // v2 is now Vector4(1, 2, 3, 4)
   * ```
   */
  copy(v: Vector4): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    this.w = v.w;
    return this;
  }

  /**
   * Checks if this vector is equal to another vector within an epsilon tolerance.
   *
   * @param v - The vector to compare with
   * @param epsilon - The epsilon tolerance (defaults to MathConstants.EPSILON)
   * @returns True if the vectors are equal within tolerance
   *
   * @example
   * ```typescript
   * const v1 = new Vector4(1, 2, 3, 4);
   * const v2 = new Vector4(1.0000001, 2.0000001, 3.0000001, 4.0000001);
   * v1.equals(v2);  // true (within default epsilon)
   * ```
   */
  equals(v: Vector4, epsilon: number = MathConstants.EPSILON): boolean {
    return (
      nearlyEqual(this.x, v.x, epsilon) &&
      nearlyEqual(this.y, v.y, epsilon) &&
      nearlyEqual(this.z, v.z, epsilon) &&
      nearlyEqual(this.w, v.w, epsilon)
    );
  }

  /**
   * Converts this vector to an array.
   *
   * @returns A tuple [x, y, z, w]
   *
   * @example
   * ```typescript
   * const v = new Vector4(1, 2, 3, 4);
   * const arr = v.toArray();  // [1, 2, 3, 4]
   * ```
   */
  toArray(): [number, number, number, number] {
    return [this.x, this.y, this.z, this.w];
  }

  /**
   * Sets the components of this vector from an array.
   *
   * @param arr - The array containing the components
   * @param offset - The offset into the array (defaults to 0)
   * @returns This vector for chaining
   *
   * @example
   * ```typescript
   * const v = new Vector4();
   * v.fromArray([1, 2, 3, 4, 5, 6], 2);  // v is Vector4(3, 4, 5, 6)
   * ```
   */
  fromArray(arr: ArrayLike<number>, offset: number = 0): this {
    this.x = arr[offset];
    this.y = arr[offset + 1];
    this.z = arr[offset + 2];
    this.w = arr[offset + 3];
    return this;
  }

  /**
   * Converts this vector to a JSON-serializable object.
   *
   * @returns An object with x, y, z, and w properties
   *
   * @example
   * ```typescript
   * const v = new Vector4(1, 2, 3, 4);
   * const json = v.toJSON();  // { x: 1, y: 2, z: 3, w: 4 }
   * ```
   */
  toJSON(): { x: number; y: number; z: number; w: number } {
    return { x: this.x, y: this.y, z: this.z, w: this.w };
  }

  /**
   * Creates a zero vector (0, 0, 0, 0).
   *
   * @returns A new zero vector
   *
   * @example
   * ```typescript
   * const zero = Vector4.zero();  // Vector4(0, 0, 0, 0)
   * ```
   */
  static zero(): Vector4 {
    return new Vector4(0, 0, 0, 0);
  }

  /**
   * Creates a vector with all components set to one (1, 1, 1, 1).
   *
   * @returns A new vector with all components = 1
   *
   * @example
   * ```typescript
   * const one = Vector4.one();  // Vector4(1, 1, 1, 1)
   * ```
   */
  static one(): Vector4 {
    return new Vector4(1, 1, 1, 1);
  }

  /**
   * Creates a unit vector along the X axis (1, 0, 0, 0).
   *
   * @returns A new unit X vector
   *
   * @example
   * ```typescript
   * const unitX = Vector4.unitX();  // Vector4(1, 0, 0, 0)
   * ```
   */
  static unitX(): Vector4 {
    return new Vector4(1, 0, 0, 0);
  }

  /**
   * Creates a unit vector along the Y axis (0, 1, 0, 0).
   *
   * @returns A new unit Y vector
   *
   * @example
   * ```typescript
   * const unitY = Vector4.unitY();  // Vector4(0, 1, 0, 0)
   * ```
   */
  static unitY(): Vector4 {
    return new Vector4(0, 1, 0, 0);
  }

  /**
   * Creates a unit vector along the Z axis (0, 0, 1, 0).
   *
   * @returns A new unit Z vector
   *
   * @example
   * ```typescript
   * const unitZ = Vector4.unitZ();  // Vector4(0, 0, 1, 0)
   * ```
   */
  static unitZ(): Vector4 {
    return new Vector4(0, 0, 1, 0);
  }

  /**
   * Creates a unit vector along the W axis (0, 0, 0, 1).
   *
   * @returns A new unit W vector
   *
   * @example
   * ```typescript
   * const unitW = Vector4.unitW();  // Vector4(0, 0, 0, 1)
   * ```
   */
  static unitW(): Vector4 {
    return new Vector4(0, 0, 0, 1);
  }

  /**
   * Creates a Vector4 from a Vector3 and a w component.
   * By default, w=1 to represent a point in homogeneous coordinates.
   * Use w=0 to represent a direction vector.
   *
   * @param v - The Vector3 providing x, y, and z components
   * @param w - The w component (defaults to 1 for points)
   * @returns A new Vector4
   *
   * @example
   * ```typescript
   * const v3 = new Vector3(1, 2, 3);
   * const point = Vector4.fromVector3(v3);     // Vector4(1, 2, 3, 1) - point
   * const dir = Vector4.fromVector3(v3, 0);    // Vector4(1, 2, 3, 0) - direction
   * ```
   */
  static fromVector3(v: Vector3, w: number = 1): Vector4 {
    return new Vector4(v.x, v.y, v.z, w);
  }
}
