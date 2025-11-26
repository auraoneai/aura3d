/**
 * Unit quaternion class for representing rotations in 3D space.
 * Provides comprehensive quaternion operations with both immutable and in-place variants.
 * All quaternions are kept normalized for accurate rotation representation.
 * @module Quaternion
 */

import { MathConstants, nearlyEqual, clamp } from './MathConstants';
import { Vector3 } from './Vector3';

const { EPSILON } = MathConstants;

/**
 * Euler rotation order type for angle conversions.
 */
export type EulerOrder = 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX';

/**
 * Forward declaration of Matrix4 to avoid circular imports.
 * Matrix4 is imported lazily when needed.
 */
export interface Matrix4 {
  elements: Float32Array | number[];
}

/**
 * Unit quaternion class for representing 3D rotations.
 * Quaternions provide smooth interpolation, avoid gimbal lock, and are more
 * compact than rotation matrices while being more robust than Euler angles.
 *
 * A quaternion is represented as: q = w + xi + yj + zk
 * For unit quaternions (rotations): x² + y² + z² + w² = 1
 *
 * @example
 * ```typescript
 * // Create quaternions
 * const identity = new Quaternion();              // (0, 0, 0, 1)
 * const q1 = new Quaternion(0, 0, 0, 1);
 *
 * // From axis-angle
 * const axis = new Vector3(0, 1, 0);
 * const q2 = Quaternion.fromAxisAngle(axis, Math.PI / 2);
 *
 * // From Euler angles
 * const q3 = Quaternion.fromEuler(0, Math.PI / 2, 0, 'XYZ');
 *
 * // Operations
 * const combined = q1.multiply(q2);
 * const interpolated = q1.slerp(q2, 0.5);
 *
 * // Conversions
 * const { axis: extractedAxis, angle } = q2.toAxisAngle();
 * const euler = q2.toEuler('XYZ');
 * ```
 */
export class Quaternion {
  /**
   * X component (i) of the quaternion.
   */
  x: number;

  /**
   * Y component (j) of the quaternion.
   */
  y: number;

  /**
   * Z component (k) of the quaternion.
   */
  z: number;

  /**
   * W component (real/scalar) of the quaternion.
   */
  w: number;

  /**
   * Creates a new Quaternion instance.
   * Defaults to identity quaternion (0, 0, 0, 1) representing no rotation.
   *
   * @param x - X component (default: 0)
   * @param y - Y component (default: 0)
   * @param z - Z component (default: 0)
   * @param w - W component (default: 1)
   *
   * @example
   * ```typescript
   * const identity = new Quaternion();              // (0, 0, 0, 1)
   * const q = new Quaternion(0, 0.707, 0, 0.707);  // 90° around Y axis
   * ```
   */
  constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /**
   * Multiplies this quaternion by another quaternion and returns a new quaternion.
   * Quaternion multiplication is not commutative: q1 * q2 ≠ q2 * q1
   * The result represents applying q2's rotation first, then this quaternion's rotation.
   *
   * @param q - Quaternion to multiply by
   * @returns New quaternion representing the combined rotation
   *
   * @example
   * ```typescript
   * const q1 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * const q2 = Quaternion.fromAxisAngle(Vector3.right(), Math.PI / 4);
   * const combined = q1.multiply(q2);  // Apply q2, then q1
   * ```
   */
  multiply(q: Quaternion): Quaternion {
    const x = this.w * q.x + this.x * q.w + this.y * q.z - this.z * q.y;
    const y = this.w * q.y + this.y * q.w + this.z * q.x - this.x * q.z;
    const z = this.w * q.z + this.z * q.w + this.x * q.y - this.y * q.x;
    const w = this.w * q.w - this.x * q.x - this.y * q.y - this.z * q.z;
    return new Quaternion(x, y, z, w);
  }

  /**
   * Multiplies another quaternion by this quaternion and returns a new quaternion.
   * This is equivalent to q * this (instead of this * q in multiply()).
   * The result represents applying this quaternion's rotation first, then q's rotation.
   *
   * @param q - Quaternion to premultiply by
   * @returns New quaternion representing the combined rotation
   *
   * @example
   * ```typescript
   * const q1 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * const q2 = Quaternion.fromAxisAngle(Vector3.right(), Math.PI / 4);
   * const combined = q1.premultiply(q2);  // Apply q1, then q2
   * ```
   */
  premultiply(q: Quaternion): Quaternion {
    const x = q.w * this.x + q.x * this.w + q.y * this.z - q.z * this.y;
    const y = q.w * this.y + q.y * this.w + q.z * this.x - q.x * this.z;
    const z = q.w * this.z + q.z * this.w + q.x * this.y - q.y * this.x;
    const w = q.w * this.w - q.x * this.x - q.y * this.y - q.z * this.z;
    return new Quaternion(x, y, z, w);
  }

  /**
   * Returns the conjugate of this quaternion.
   * For unit quaternions, the conjugate equals the inverse and represents the opposite rotation.
   * Formula: conjugate(w + xi + yj + zk) = w - xi - yj - zk
   *
   * @returns New conjugate quaternion
   *
   * @example
   * ```typescript
   * const q = new Quaternion(0.1, 0.2, 0.3, 0.9);
   * const conj = q.conjugate();  // (-0.1, -0.2, -0.3, 0.9)
   * ```
   */
  conjugate(): Quaternion {
    return new Quaternion(-this.x, -this.y, -this.z, this.w);
  }

  /**
   * Returns the inverse of this quaternion.
   * For unit quaternions, inverse equals conjugate.
   * Formula: inverse = conjugate / (length²)
   *
   * @returns New inverse quaternion
   *
   * @example
   * ```typescript
   * const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * const inv = q.invert();
   * const identity = q.multiply(inv);  // Results in identity quaternion
   * ```
   */
  invert(): Quaternion {
    const lenSq = this.lengthSquared();
    if (lenSq < EPSILON * EPSILON) {
      return new Quaternion(0, 0, 0, 1);
    }

    const invLenSq = 1 / lenSq;
    return new Quaternion(
      -this.x * invLenSq,
      -this.y * invLenSq,
      -this.z * invLenSq,
      this.w * invLenSq
    );
  }

  /**
   * Returns a normalized (unit length) version of this quaternion.
   * Unit quaternions are required for proper rotation representation.
   *
   * @returns New normalized quaternion
   *
   * @example
   * ```typescript
   * const q = new Quaternion(1, 2, 3, 4);
   * const normalized = q.normalize();  // Length = 1
   * ```
   */
  normalize(): Quaternion {
    const lenSq = this.lengthSquared();
    if (lenSq < EPSILON * EPSILON) {
      return new Quaternion(0, 0, 0, 1);
    }

    const invLen = 1 / Math.sqrt(lenSq);
    return new Quaternion(
      this.x * invLen,
      this.y * invLen,
      this.z * invLen,
      this.w * invLen
    );
  }

  /**
   * Returns the negation of this quaternion.
   * Note: -q represents the same rotation as q (double cover property).
   *
   * @returns New negated quaternion
   *
   * @example
   * ```typescript
   * const q = new Quaternion(0, 0.707, 0, 0.707);
   * const neg = q.negate();  // (0, -0.707, 0, -0.707) - same rotation
   * ```
   */
  negate(): Quaternion {
    return new Quaternion(-this.x, -this.y, -this.z, -this.w);
  }

  /**
   * Calculates the dot product with another quaternion.
   * Used for calculating angles and in slerp interpolation.
   *
   * @param q - Quaternion to calculate dot product with
   * @returns The dot product value
   *
   * @example
   * ```typescript
   * const q1 = new Quaternion(0, 0, 0, 1);
   * const q2 = new Quaternion(0, 0.707, 0, 0.707);
   * const dot = q1.dot(q2);  // 0.707
   * ```
   */
  dot(q: Quaternion): number {
    return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w;
  }

  /**
   * Calculates the length (magnitude) of this quaternion.
   * For unit quaternions (rotations), this should be 1.
   *
   * @returns The length of the quaternion
   *
   * @example
   * ```typescript
   * const q = new Quaternion(0, 0, 0, 1);
   * const len = q.length();  // 1
   * ```
   */
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
  }

  /**
   * Calculates the squared length of this quaternion.
   * Faster than length() as it avoids the square root operation.
   *
   * @returns The squared length of the quaternion
   *
   * @example
   * ```typescript
   * const q = new Quaternion(0, 0, 0, 1);
   * const lenSq = q.lengthSquared();  // 1
   * ```
   */
  lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
  }

  /**
   * Performs spherical linear interpolation (slerp) between this quaternion and another.
   * Provides smooth, constant-velocity rotation interpolation along the shortest path.
   * Automatically handles quaternion sign flip to ensure shortest path.
   *
   * @param q - Target quaternion to interpolate towards
   * @param t - Interpolation factor (0 = this quaternion, 1 = target quaternion)
   * @returns New interpolated quaternion
   *
   * @example
   * ```typescript
   * const q1 = Quaternion.identity();
   * const q2 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI);
   * const halfway = q1.slerp(q2, 0.5);  // Smooth 90° rotation
   * ```
   */
  slerp(q: Quaternion, t: number): Quaternion {
    if (t <= 0) return this.clone();
    if (t >= 1) return q.clone();

    let dot = this.dot(q);

    let qTarget = q;
    if (dot < 0) {
      dot = -dot;
      qTarget = q.negate();
    }

    if (dot > 1 - EPSILON) {
      const x = this.x + (qTarget.x - this.x) * t;
      const y = this.y + (qTarget.y - this.y) * t;
      const z = this.z + (qTarget.z - this.z) * t;
      const w = this.w + (qTarget.w - this.w) * t;
      return new Quaternion(x, y, z, w).normalize();
    }

    const theta = Math.acos(clamp(dot, -1, 1));
    const sinTheta = Math.sin(theta);

    const w1 = Math.sin((1 - t) * theta) / sinTheta;
    const w2 = Math.sin(t * theta) / sinTheta;

    return new Quaternion(
      this.x * w1 + qTarget.x * w2,
      this.y * w1 + qTarget.y * w2,
      this.z * w1 + qTarget.z * w2,
      this.w * w1 + qTarget.w * w2
    );
  }

  /**
   * Sets this quaternion from an axis and angle.
   * The axis should be normalized for accurate results.
   *
   * @param axis - Rotation axis (should be normalized)
   * @param angle - Rotation angle in radians
   * @returns This quaternion for chaining
   *
   * @example
   * ```typescript
   * const q = new Quaternion();
   * q.setFromAxisAngle(Vector3.up(), Math.PI / 2);  // 90° around Y axis
   * ```
   */
  setFromAxisAngle(axis: Vector3, angle: number): this {
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);

    this.x = axis.x * s;
    this.y = axis.y * s;
    this.z = axis.z * s;
    this.w = Math.cos(halfAngle);

    return this;
  }

  /**
   * Sets this quaternion from Euler angles in the specified rotation order.
   * Supports all 12 possible Euler rotation orders.
   *
   * @param x - Rotation around X axis in radians
   * @param y - Rotation around Y axis in radians
   * @param z - Rotation around Z axis in radians
   * @param order - Rotation order (default: 'XYZ')
   * @returns This quaternion for chaining
   *
   * @example
   * ```typescript
   * const q = new Quaternion();
   * q.setFromEuler(Math.PI / 2, 0, 0, 'XYZ');  // 90° pitch
   * q.setFromEuler(0, Math.PI / 2, 0, 'YXZ');  // 90° yaw
   * ```
   */
  setFromEuler(x: number, y: number, z: number, order: EulerOrder = 'XYZ'): this {
    const c1 = Math.cos(x / 2);
    const c2 = Math.cos(y / 2);
    const c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2);
    const s2 = Math.sin(y / 2);
    const s3 = Math.sin(z / 2);

    switch (order) {
      case 'XYZ':
        this.x = s1 * c2 * c3 + c1 * s2 * s3;
        this.y = c1 * s2 * c3 - s1 * c2 * s3;
        this.z = c1 * c2 * s3 + s1 * s2 * c3;
        this.w = c1 * c2 * c3 - s1 * s2 * s3;
        break;

      case 'XZY':
        this.x = s1 * c2 * c3 - c1 * s2 * s3;
        this.y = c1 * s2 * c3 - s1 * c2 * s3;
        this.z = c1 * c2 * s3 + s1 * s2 * c3;
        this.w = c1 * c2 * c3 + s1 * s2 * s3;
        break;

      case 'YXZ':
        this.x = s1 * c2 * c3 + c1 * s2 * s3;
        this.y = c1 * s2 * c3 - s1 * c2 * s3;
        this.z = c1 * c2 * s3 - s1 * s2 * c3;
        this.w = c1 * c2 * c3 + s1 * s2 * s3;
        break;

      case 'YZX':
        this.x = s1 * c2 * c3 + c1 * s2 * s3;
        this.y = c1 * s2 * c3 + s1 * c2 * s3;
        this.z = c1 * c2 * s3 - s1 * s2 * c3;
        this.w = c1 * c2 * c3 - s1 * s2 * s3;
        break;

      case 'ZXY':
        this.x = s1 * c2 * c3 - c1 * s2 * s3;
        this.y = c1 * s2 * c3 + s1 * c2 * s3;
        this.z = c1 * c2 * s3 + s1 * s2 * c3;
        this.w = c1 * c2 * c3 - s1 * s2 * s3;
        break;

      case 'ZYX':
        this.x = s1 * c2 * c3 - c1 * s2 * s3;
        this.y = c1 * s2 * c3 + s1 * c2 * s3;
        this.z = c1 * c2 * s3 - s1 * s2 * c3;
        this.w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
    }

    return this;
  }

  /**
   * Sets this quaternion from a rotation matrix.
   * Uses a robust algorithm that avoids gimbal lock and numerical instability.
   *
   * @param m - 4x4 rotation matrix
   * @returns This quaternion for chaining
   *
   * @example
   * ```typescript
   * const q = new Quaternion();
   * const matrix = createRotationMatrix();
   * q.setFromRotationMatrix(matrix);
   * ```
   */
  setFromRotationMatrix(m: Matrix4): this {
    const te = m.elements;

    const m11 = te[0], m12 = te[4], m13 = te[8];
    const m21 = te[1], m22 = te[5], m23 = te[9];
    const m31 = te[2], m32 = te[6], m33 = te[10];

    const trace = m11 + m22 + m33;

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      this.w = 0.25 / s;
      this.x = (m32 - m23) * s;
      this.y = (m13 - m31) * s;
      this.z = (m21 - m12) * s;
    } else if (m11 > m22 && m11 > m33) {
      const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
      this.w = (m32 - m23) / s;
      this.x = 0.25 * s;
      this.y = (m12 + m21) / s;
      this.z = (m13 + m31) / s;
    } else if (m22 > m33) {
      const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
      this.w = (m13 - m31) / s;
      this.x = (m12 + m21) / s;
      this.y = 0.25 * s;
      this.z = (m23 + m32) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
      this.w = (m21 - m12) / s;
      this.x = (m13 + m31) / s;
      this.y = (m23 + m32) / s;
      this.z = 0.25 * s;
    }

    return this;
  }

  /**
   * Sets this quaternion to rotate from one unit vector to another.
   * Handles special cases: parallel vectors and anti-parallel vectors.
   * Both input vectors should be normalized for accurate results.
   *
   * @param from - Source direction (should be normalized)
   * @param to - Target direction (should be normalized)
   * @returns This quaternion for chaining
   *
   * @example
   * ```typescript
   * const q = new Quaternion();
   * const from = Vector3.forward();
   * const to = Vector3.right();
   * q.setFromUnitVectors(from, to);  // Rotation from forward to right
   * ```
   */
  setFromUnitVectors(from: Vector3, to: Vector3): this {
    let r = from.dot(to) + 1;

    if (r < EPSILON) {
      r = 0;

      if (Math.abs(from.x) > Math.abs(from.z)) {
        this.x = -from.y;
        this.y = from.x;
        this.z = 0;
        this.w = r;
      } else {
        this.x = 0;
        this.y = -from.z;
        this.z = from.y;
        this.w = r;
      }
    } else {
      const cross = from.cross(to);
      this.x = cross.x;
      this.y = cross.y;
      this.z = cross.z;
      this.w = r;
    }

    return this.normalizeInPlace();
  }

  /**
   * Converts this quaternion to axis-angle representation.
   *
   * @returns Object containing the rotation axis and angle in radians
   *
   * @example
   * ```typescript
   * const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * const { axis, angle } = q.toAxisAngle();
   * console.log(axis, angle);  // Vector3(0, 1, 0), 1.5707...
   * ```
   */
  toAxisAngle(): { axis: Vector3; angle: number } {
    const q = this.w > 1 ? this.normalize() : this.clone();

    const angle = 2 * Math.acos(q.w);
    const s = Math.sqrt(1 - q.w * q.w);

    let axis: Vector3;
    if (s < EPSILON) {
      axis = new Vector3(1, 0, 0);
    } else {
      axis = new Vector3(q.x / s, q.y / s, q.z / s);
    }

    return { axis, angle };
  }

  /**
   * Converts this quaternion to Euler angles in the specified rotation order.
   * Note: This conversion can suffer from gimbal lock at certain orientations.
   *
   * @param order - Rotation order (default: 'XYZ')
   * @returns Vector3 containing Euler angles in radians (x, y, z)
   *
   * @example
   * ```typescript
   * const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * const euler = q.toEuler('XYZ');
   * console.log(euler);  // Vector3(0, 1.5707..., 0)
   * ```
   */
  toEuler(order: EulerOrder = 'XYZ'): Vector3 {
    const x2 = this.x * this.x;
    const y2 = this.y * this.y;
    const z2 = this.z * this.z;
    const w2 = this.w * this.w;

    let x: number, y: number, z: number;

    switch (order) {
      case 'XYZ': {
        const t0 = 2 * (this.w * this.x + this.y * this.z);
        const t1 = w2 - x2 - y2 + z2;
        const t2 = 2 * (this.w * this.y - this.z * this.x);
        const t3 = 2 * (this.w * this.z + this.x * this.y);
        const t4 = w2 + x2 - y2 - z2;

        x = Math.atan2(t0, t1);
        y = Math.asin(clamp(t2, -1, 1));
        z = Math.atan2(t3, t4);
        break;
      }

      case 'XZY': {
        const t0 = 2 * (this.w * this.x - this.y * this.z);
        const t1 = w2 - x2 + y2 - z2;
        const t2 = 2 * (this.w * this.z + this.x * this.y);
        const t3 = 2 * (this.w * this.y - this.x * this.z);
        const t4 = w2 + x2 - y2 - z2;

        x = Math.atan2(t0, t1);
        z = Math.asin(clamp(t2, -1, 1));
        y = Math.atan2(t3, t4);
        break;
      }

      case 'YXZ': {
        const t0 = 2 * (this.w * this.x + this.z * this.y);
        const t1 = w2 - x2 - y2 + z2;
        const t2 = 2 * (this.w * this.y - this.x * this.z);
        const t3 = 2 * (this.w * this.z + this.x * this.y);
        const t4 = w2 - x2 + y2 - z2;

        x = Math.asin(clamp(t0, -1, 1));
        y = Math.atan2(t2, t1);
        z = Math.atan2(t3, t4);
        break;
      }

      case 'YZX': {
        const t0 = 2 * (this.w * this.x - this.y * this.z);
        const t1 = w2 - x2 + y2 - z2;
        const t2 = 2 * (this.w * this.y + this.x * this.z);
        const t3 = 2 * (this.w * this.z - this.x * this.y);
        const t4 = w2 + x2 - y2 - z2;

        x = Math.atan2(t0, t1);
        y = Math.atan2(t2, t4);
        z = Math.asin(clamp(t3, -1, 1));
        break;
      }

      case 'ZXY': {
        const t0 = 2 * (this.w * this.x + this.y * this.z);
        const t1 = w2 - x2 + y2 - z2;
        const t2 = 2 * (this.w * this.y - this.x * this.z);
        const t3 = 2 * (this.w * this.z + this.x * this.y);
        const t4 = w2 - x2 - y2 + z2;

        x = Math.asin(clamp(t0, -1, 1));
        y = Math.atan2(t2, t4);
        z = Math.atan2(t3, t1);
        break;
      }

      case 'ZYX': {
        const t0 = 2 * (this.w * this.x + this.y * this.z);
        const t1 = w2 - x2 - y2 + z2;
        const t2 = 2 * (this.w * this.y - this.x * this.z);
        const t3 = 2 * (this.w * this.z + this.x * this.y);
        const t4 = w2 + x2 - y2 - z2;

        x = Math.atan2(t0, t1);
        y = Math.asin(clamp(t2, -1, 1));
        z = Math.atan2(t3, t4);
        break;
      }
    }

    return new Vector3(x, y, z);
  }

  /**
   * Converts this quaternion to a 4x4 rotation matrix.
   * Uses lazy import to avoid circular dependency with Matrix4.
   *
   * @returns 4x4 rotation matrix
   *
   * @example
   * ```typescript
   * const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * const matrix = q.toMatrix4();
   * ```
   */
  toMatrix4(): Matrix4 {
    const x2 = this.x * this.x;
    const y2 = this.y * this.y;
    const z2 = this.z * this.z;
    const xy = this.x * this.y;
    const xz = this.x * this.z;
    const yz = this.y * this.z;
    const wx = this.w * this.x;
    const wy = this.w * this.y;
    const wz = this.w * this.z;

    const elements = new Float32Array(16);

    elements[0] = 1 - 2 * (y2 + z2);
    elements[1] = 2 * (xy + wz);
    elements[2] = 2 * (xz - wy);
    elements[3] = 0;

    elements[4] = 2 * (xy - wz);
    elements[5] = 1 - 2 * (x2 + z2);
    elements[6] = 2 * (yz + wx);
    elements[7] = 0;

    elements[8] = 2 * (xz + wy);
    elements[9] = 2 * (yz - wx);
    elements[10] = 1 - 2 * (x2 + y2);
    elements[11] = 0;

    elements[12] = 0;
    elements[13] = 0;
    elements[14] = 0;
    elements[15] = 1;

    return { elements } as Matrix4;
  }

  /**
   * Multiplies this quaternion by another quaternion in place.
   *
   * @param q - Quaternion to multiply by
   * @returns This quaternion for chaining
   *
   * @example
   * ```typescript
   * const q1 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * const q2 = Quaternion.fromAxisAngle(Vector3.right(), Math.PI / 4);
   * q1.multiplyInPlace(q2);
   * ```
   */
  multiplyInPlace(q: Quaternion): this {
    const x = this.w * q.x + this.x * q.w + this.y * q.z - this.z * q.y;
    const y = this.w * q.y + this.y * q.w + this.z * q.x - this.x * q.z;
    const z = this.w * q.z + this.z * q.w + this.x * q.y - this.y * q.x;
    const w = this.w * q.w - this.x * q.x - this.y * q.y - this.z * q.z;

    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;

    return this;
  }

  /**
   * Premultiplies this quaternion by another quaternion in place.
   *
   * @param q - Quaternion to premultiply by
   * @returns This quaternion for chaining
   *
   * @example
   * ```typescript
   * const q1 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * const q2 = Quaternion.fromAxisAngle(Vector3.right(), Math.PI / 4);
   * q1.premultiplyInPlace(q2);
   * ```
   */
  premultiplyInPlace(q: Quaternion): this {
    const x = q.w * this.x + q.x * this.w + q.y * this.z - q.z * this.y;
    const y = q.w * this.y + q.y * this.w + q.z * this.x - q.x * this.z;
    const z = q.w * this.z + q.z * this.w + q.x * this.y - q.y * this.x;
    const w = q.w * this.w - q.x * this.x - q.y * this.y - q.z * this.z;

    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;

    return this;
  }

  /**
   * Conjugates this quaternion in place.
   *
   * @returns This quaternion for chaining
   *
   * @example
   * ```typescript
   * const q = new Quaternion(0.1, 0.2, 0.3, 0.9);
   * q.conjugateInPlace();  // q is now (-0.1, -0.2, -0.3, 0.9)
   * ```
   */
  conjugateInPlace(): this {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  /**
   * Inverts this quaternion in place.
   *
   * @returns This quaternion for chaining
   *
   * @example
   * ```typescript
   * const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * q.invertInPlace();  // Now represents opposite rotation
   * ```
   */
  invertInPlace(): this {
    const lenSq = this.lengthSquared();
    if (lenSq < EPSILON * EPSILON) {
      return this.set(0, 0, 0, 1);
    }

    const invLenSq = 1 / lenSq;
    this.x = -this.x * invLenSq;
    this.y = -this.y * invLenSq;
    this.z = -this.z * invLenSq;
    this.w = this.w * invLenSq;

    return this;
  }

  /**
   * Normalizes this quaternion in place.
   *
   * @returns This quaternion for chaining
   *
   * @example
   * ```typescript
   * const q = new Quaternion(1, 2, 3, 4);
   * q.normalizeInPlace();  // Now has length 1
   * ```
   */
  normalizeInPlace(): this {
    const lenSq = this.lengthSquared();
    if (lenSq < EPSILON * EPSILON) {
      return this.set(0, 0, 0, 1);
    }

    const invLen = 1 / Math.sqrt(lenSq);
    this.x *= invLen;
    this.y *= invLen;
    this.z *= invLen;
    this.w *= invLen;

    return this;
  }

  /**
   * Negates this quaternion in place.
   *
   * @returns This quaternion for chaining
   *
   * @example
   * ```typescript
   * const q = new Quaternion(0, 0.707, 0, 0.707);
   * q.negateInPlace();  // q is now (0, -0.707, 0, -0.707)
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
   * Performs spherical linear interpolation in place.
   *
   * @param q - Target quaternion to interpolate towards
   * @param t - Interpolation factor (0 = this quaternion, 1 = target quaternion)
   * @returns This quaternion for chaining
   *
   * @example
   * ```typescript
   * const q1 = Quaternion.identity();
   * const q2 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI);
   * q1.slerpInPlace(q2, 0.5);  // q1 is now halfway rotated
   * ```
   */
  slerpInPlace(q: Quaternion, t: number): this {
    if (t <= 0) return this;
    if (t >= 1) return this.copy(q);

    let dot = this.dot(q);

    let qTarget = q;
    if (dot < 0) {
      dot = -dot;
      qTarget = q.negate();
    }

    if (dot > 1 - EPSILON) {
      this.x += (qTarget.x - this.x) * t;
      this.y += (qTarget.y - this.y) * t;
      this.z += (qTarget.z - this.z) * t;
      this.w += (qTarget.w - this.w) * t;
      return this.normalizeInPlace();
    }

    const theta = Math.acos(clamp(dot, -1, 1));
    const sinTheta = Math.sin(theta);

    const w1 = Math.sin((1 - t) * theta) / sinTheta;
    const w2 = Math.sin(t * theta) / sinTheta;

    this.x = this.x * w1 + qTarget.x * w2;
    this.y = this.y * w1 + qTarget.y * w2;
    this.z = this.z * w1 + qTarget.z * w2;
    this.w = this.w * w1 + qTarget.w * w2;

    return this;
  }

  /**
   * Sets the components of this quaternion.
   *
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   * @param w - W component
   * @returns This quaternion for chaining
   *
   * @example
   * ```typescript
   * const q = new Quaternion();
   * q.set(0, 0, 0, 1);  // Identity quaternion
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
   * Creates a copy of this quaternion.
   *
   * @returns New quaternion with the same components
   *
   * @example
   * ```typescript
   * const q1 = new Quaternion(0, 0.707, 0, 0.707);
   * const q2 = q1.clone();
   * ```
   */
  clone(): Quaternion {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }

  /**
   * Copies the components from another quaternion to this quaternion.
   *
   * @param q - Quaternion to copy from
   * @returns This quaternion for chaining
   *
   * @example
   * ```typescript
   * const q1 = new Quaternion(0, 0.707, 0, 0.707);
   * const q2 = new Quaternion();
   * q2.copy(q1);  // q2 is now equal to q1
   * ```
   */
  copy(q: Quaternion): this {
    this.x = q.x;
    this.y = q.y;
    this.z = q.z;
    this.w = q.w;
    return this;
  }

  /**
   * Checks if this quaternion is equal to another quaternion within an epsilon tolerance.
   *
   * @param q - Quaternion to compare with
   * @param epsilon - Tolerance value (default: EPSILON)
   * @returns True if quaternions are nearly equal
   *
   * @example
   * ```typescript
   * const q1 = new Quaternion(0, 0, 0, 1);
   * const q2 = new Quaternion(0, 0, 0, 1.0000001);
   * const equal = q1.equals(q2);  // true
   * ```
   */
  equals(q: Quaternion, epsilon: number = EPSILON): boolean {
    return (
      nearlyEqual(this.x, q.x, epsilon) &&
      nearlyEqual(this.y, q.y, epsilon) &&
      nearlyEqual(this.z, q.z, epsilon) &&
      nearlyEqual(this.w, q.w, epsilon)
    );
  }

  /**
   * Converts this quaternion to an array.
   *
   * @returns Array containing [x, y, z, w]
   *
   * @example
   * ```typescript
   * const q = new Quaternion(0, 0.707, 0, 0.707);
   * const arr = q.toArray();  // [0, 0.707, 0, 0.707]
   * ```
   */
  toArray(): [number, number, number, number] {
    return [this.x, this.y, this.z, this.w];
  }

  /**
   * Sets the components of this quaternion from an array.
   *
   * @param arr - Array-like object containing the components
   * @param offset - Starting index in the array (default: 0)
   * @returns This quaternion for chaining
   *
   * @example
   * ```typescript
   * const q = new Quaternion();
   * q.fromArray([0, 0.707, 0, 0.707]);
   * q.fromArray([0, 0, 0.707, 0, 0.707], 1);  // Start at index 1
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
   * Converts this quaternion to a JSON-serializable object.
   *
   * @returns Object containing x, y, z, w properties
   *
   * @example
   * ```typescript
   * const q = new Quaternion(0, 0.707, 0, 0.707);
   * const json = q.toJSON();  // { x: 0, y: 0.707, z: 0, w: 0.707 }
   * JSON.stringify(q);
   * ```
   */
  toJSON(): { x: number; y: number; z: number; w: number } {
    return { x: this.x, y: this.y, z: this.z, w: this.w };
  }

  /**
   * Rotates a vector by this quaternion.
   * Applies the rotation represented by this quaternion to the given vector.
   * Formula: v' = q * v * q^(-1)
   *
   * @param v - Vector to rotate
   * @returns New rotated vector
   *
   * @example
   * ```typescript
   * const q = Quaternion.fromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
   * const v = new Vector3(1, 0, 0);
   * const rotated = q.rotateVector(v);  // Approximately (0, 0, -1)
   * ```
   */
  rotateVector(v: Vector3): Vector3 {
    // Convert vector to quaternion
    const qv = new Quaternion(v.x, v.y, v.z, 0);

    // q * v * q^(-1)
    const result = this.multiply(qv).multiply(this.invert());

    return new Vector3(result.x, result.y, result.z);
  }

  /**
   * Creates an identity quaternion representing no rotation.
   *
   * @returns New identity quaternion (0, 0, 0, 1)
   *
   * @example
   * ```typescript
   * const identity = Quaternion.identity();
   * ```
   */
  static identity(): Quaternion {
    return new Quaternion(0, 0, 0, 1);
  }

  /**
   * Creates a quaternion from an axis and angle.
   *
   * @param axis - Rotation axis (should be normalized)
   * @param angle - Rotation angle in radians
   * @returns New quaternion representing the rotation
   *
   * @example
   * ```typescript
   * const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * ```
   */
  static fromAxisAngle(axis: Vector3, angle: number): Quaternion {
    return new Quaternion().setFromAxisAngle(axis, angle);
  }

  /**
   * Creates a quaternion from Euler angles.
   *
   * @param x - Rotation around X axis in radians
   * @param y - Rotation around Y axis in radians
   * @param z - Rotation around Z axis in radians
   * @param order - Rotation order (default: 'XYZ')
   * @returns New quaternion representing the rotation
   *
   * @example
   * ```typescript
   * const q = Quaternion.fromEuler(Math.PI / 2, 0, 0, 'XYZ');
   * ```
   */
  static fromEuler(x: number, y: number, z: number, order: EulerOrder = 'XYZ'): Quaternion {
    return new Quaternion().setFromEuler(x, y, z, order);
  }

  /**
   * Creates a quaternion from a rotation matrix.
   *
   * @param m - 4x4 rotation matrix
   * @returns New quaternion representing the rotation
   *
   * @example
   * ```typescript
   * const matrix = createRotationMatrix();
   * const q = Quaternion.fromRotationMatrix(matrix);
   * ```
   */
  static fromRotationMatrix(m: Matrix4): Quaternion {
    return new Quaternion().setFromRotationMatrix(m);
  }

  /**
   * Creates a quaternion that rotates from one unit vector to another.
   *
   * @param from - Source direction (should be normalized)
   * @param to - Target direction (should be normalized)
   * @returns New quaternion representing the rotation
   *
   * @example
   * ```typescript
   * const q = Quaternion.fromUnitVectors(Vector3.forward(), Vector3.right());
   * ```
   */
  static fromUnitVectors(from: Vector3, to: Vector3): Quaternion {
    return new Quaternion().setFromUnitVectors(from, to);
  }

  /**
   * Calculates the angle in radians between two quaternions.
   *
   * @param a - First quaternion
   * @param b - Second quaternion
   * @returns Angle in radians [0, PI]
   *
   * @example
   * ```typescript
   * const q1 = Quaternion.identity();
   * const q2 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
   * const angle = Quaternion.angle(q1, q2);  // PI / 2
   * ```
   */
  static angle(a: Quaternion, b: Quaternion): number {
    let dot = a.dot(b);
    if (dot < 0) dot = -dot;
    dot = clamp(dot, -1, 1);
    return 2 * Math.acos(dot);
  }

  /**
   * Performs spherical linear interpolation between two quaternions.
   *
   * @param a - Start quaternion
   * @param b - End quaternion
   * @param t - Interpolation factor (0 = a, 1 = b)
   * @returns New interpolated quaternion
   *
   * @example
   * ```typescript
   * const q1 = Quaternion.identity();
   * const q2 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI);
   * const halfway = Quaternion.slerp(q1, q2, 0.5);
   * ```
   */
  static slerp(a: Quaternion, b: Quaternion, t: number): Quaternion {
    return a.slerp(b, t);
  }
}
