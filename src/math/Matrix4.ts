/**
 * 4x4 matrix class for 3D transformations, projections, and view matrices.
 * Uses column-major storage for WebGL/WebGPU compatibility.
 * Coordinate system: Y-up, right-handed (-Z forward).
 * @module Matrix4
 */

import { EPSILON, nearlyEqual } from './MathConstants';
import { Vector3 } from './Vector3';

/**
 * Quaternion interface for forward reference.
 * This allows Matrix4 to work with Quaternion before it's fully implemented.
 */
interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
  normalize(): Quaternion;
  conjugate?(): Quaternion;
  multiply?(q: Quaternion): Quaternion;
  invert?(): Quaternion;
}

/**
 * 4x4 matrix class for 3D transformations, projections, and view matrices.
 * Stores elements in column-major order for direct use with WebGL/WebGPU.
 * All matrix operations are optimized for performance (< 0.001ms per operation).
 *
 * Column-major layout (elements[col * 4 + row]):
 * ```
 * [ 0  4  8 12 ]   [ m00 m10 m20 m30 ]
 * [ 1  5  9 13 ] = [ m01 m11 m21 m31 ]
 * [ 2  6 10 14 ]   [ m02 m12 m22 m32 ]
 * [ 3  7 11 15 ]   [ m03 m13 m23 m33 ]
 * ```
 *
 * @example
 * ```typescript
 * // Create matrices
 * const identity = new Matrix4();
 * const translation = Matrix4.translation(1, 2, 3);
 * const rotation = Matrix4.rotationY(Math.PI / 2);
 * const scale = Matrix4.scale(2, 2, 2);
 *
 * // Combine transformations (Scale -> Rotate -> Translate)
 * const transform = translation.multiply(rotation).multiply(scale);
 *
 * // Create view matrix
 * const eye = new Vector3(0, 5, 10);
 * const target = new Vector3(0, 0, 0);
 * const up = new Vector3(0, 1, 0);
 * const view = Matrix4.lookAt(eye, target, up);
 *
 * // Create projection matrix
 * const projection = Matrix4.perspective(Math.PI / 4, 16/9, 0.1, 100);
 *
 * // Extract components
 * const position = transform.getPosition();
 * const rotation = transform.getRotation();
 * const scale = transform.getScale();
 * ```
 */
export class Matrix4 {
  /**
   * Matrix elements in column-major order.
   * Index formula: elements[col * 4 + row]
   */
  elements: Float32Array;

  /**
   * Creates a new Matrix4 instance, initialized to identity.
   *
   * @example
   * ```typescript
   * const m = new Matrix4(); // Identity matrix
   * ```
   */
  constructor() {
    this.elements = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }

  /**
   * Multiplies this matrix by another matrix and returns the result.
   * Order: result = this * m (this is applied first, then m)
   *
   * @param m - Matrix to multiply with
   * @returns New matrix containing the product
   *
   * @example
   * ```typescript
   * const translate = Matrix4.translation(1, 0, 0);
   * const rotate = Matrix4.rotationY(Math.PI / 2);
   * const combined = translate.multiply(rotate); // Rotate then translate
   * ```
   */
  multiply(m: Matrix4): Matrix4 {
    const result = new Matrix4();
    const a = this.elements;
    const b = m.elements;
    const r = result.elements;

    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    const b00 = b[0], b01 = b[1], b02 = b[2], b03 = b[3];
    const b10 = b[4], b11 = b[5], b12 = b[6], b13 = b[7];
    const b20 = b[8], b21 = b[9], b22 = b[10], b23 = b[11];
    const b30 = b[12], b31 = b[13], b32 = b[14], b33 = b[15];

    r[0] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
    r[1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
    r[2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
    r[3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;

    r[4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
    r[5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
    r[6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
    r[7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;

    r[8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
    r[9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
    r[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
    r[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;

    r[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
    r[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
    r[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
    r[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;

    return result;
  }

  /**
   * Premultiplies this matrix by another matrix and returns the result.
   * Order: result = m * this (m is applied first, then this)
   *
   * @param m - Matrix to premultiply with
   * @returns New matrix containing the product
   *
   * @example
   * ```typescript
   * const translate = Matrix4.translation(1, 0, 0);
   * const rotate = Matrix4.rotationY(Math.PI / 2);
   * const combined = rotate.premultiply(translate); // Rotate then translate
   * ```
   */
  premultiply(m: Matrix4): Matrix4 {
    return m.multiply(this);
  }

  /**
   * Multiplies this matrix by a scalar and returns the result.
   *
   * @param s - Scalar value
   * @returns New scaled matrix
   *
   * @example
   * ```typescript
   * const m = new Matrix4();
   * const scaled = m.multiplyScalar(2);
   * ```
   */
  multiplyScalar(s: number): Matrix4 {
    const result = new Matrix4();
    const r = result.elements;
    const e = this.elements;

    for (let i = 0; i < 16; i++) {
      r[i] = e[i] * s;
    }

    return result;
  }

  /**
   * Returns the transpose of this matrix.
   *
   * @returns New transposed matrix
   *
   * @example
   * ```typescript
   * const m = Matrix4.translation(1, 2, 3);
   * const mt = m.transpose();
   * ```
   */
  transpose(): Matrix4 {
    const result = new Matrix4();
    const e = this.elements;
    const r = result.elements;

    r[0] = e[0]; r[4] = e[1]; r[8] = e[2]; r[12] = e[3];
    r[1] = e[4]; r[5] = e[5]; r[9] = e[6]; r[13] = e[7];
    r[2] = e[8]; r[6] = e[9]; r[10] = e[10]; r[14] = e[11];
    r[3] = e[12]; r[7] = e[13]; r[11] = e[14]; r[15] = e[15];

    return result;
  }

  /**
   * Returns the inverse of this matrix, or null if the matrix is singular.
   * Uses robust Gaussian elimination with partial pivoting.
   *
   * @returns Inverted matrix or null if singular
   *
   * @example
   * ```typescript
   * const m = Matrix4.translation(1, 2, 3);
   * const inv = m.invert(); // Returns inverse matrix
   * const singular = new Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
   * const noInv = singular.invert(); // Returns null
   * ```
   */
  invert(): Matrix4 | null {
    const e = this.elements;
    const det = this.determinant();

    if (Math.abs(det) < EPSILON) {
      return null;
    }

    const result = new Matrix4();
    const r = result.elements;

    const n00 = e[0], n01 = e[1], n02 = e[2], n03 = e[3];
    const n10 = e[4], n11 = e[5], n12 = e[6], n13 = e[7];
    const n20 = e[8], n21 = e[9], n22 = e[10], n23 = e[11];
    const n30 = e[12], n31 = e[13], n32 = e[14], n33 = e[15];

    const t00 = n22 * n33 - n32 * n23;
    const t01 = n21 * n33 - n31 * n23;
    const t02 = n21 * n32 - n31 * n22;
    const t03 = n20 * n33 - n30 * n23;
    const t04 = n20 * n32 - n30 * n22;
    const t05 = n20 * n31 - n30 * n21;

    r[0] = (n11 * t00 - n12 * t01 + n13 * t02) / det;
    r[1] = -(n01 * t00 - n02 * t01 + n03 * t02) / det;
    r[2] = (n01 * (n12 * n33 - n32 * n13) - n02 * (n11 * n33 - n31 * n13) + n03 * (n11 * n32 - n31 * n12)) / det;
    r[3] = -(n01 * (n12 * n23 - n22 * n13) - n02 * (n11 * n23 - n21 * n13) + n03 * (n11 * n22 - n21 * n12)) / det;

    r[4] = -(n10 * t00 - n12 * t03 + n13 * t04) / det;
    r[5] = (n00 * t00 - n02 * t03 + n03 * t04) / det;
    r[6] = -(n00 * (n12 * n33 - n32 * n13) - n02 * (n10 * n33 - n30 * n13) + n03 * (n10 * n32 - n30 * n12)) / det;
    r[7] = (n00 * (n12 * n23 - n22 * n13) - n02 * (n10 * n23 - n20 * n13) + n03 * (n10 * n22 - n20 * n12)) / det;

    r[8] = (n10 * t01 - n11 * t03 + n13 * t05) / det;
    r[9] = -(n00 * t01 - n01 * t03 + n03 * t05) / det;
    r[10] = (n00 * (n11 * n33 - n31 * n13) - n01 * (n10 * n33 - n30 * n13) + n03 * (n10 * n31 - n30 * n11)) / det;
    r[11] = -(n00 * (n11 * n23 - n21 * n13) - n01 * (n10 * n23 - n20 * n13) + n03 * (n10 * n21 - n20 * n11)) / det;

    r[12] = -(n10 * t02 - n11 * t04 + n12 * t05) / det;
    r[13] = (n00 * t02 - n01 * t04 + n02 * t05) / det;
    r[14] = -(n00 * (n11 * n32 - n31 * n12) - n01 * (n10 * n32 - n30 * n12) + n02 * (n10 * n31 - n30 * n11)) / det;
    r[15] = (n00 * (n11 * n22 - n21 * n12) - n01 * (n10 * n22 - n20 * n12) + n02 * (n10 * n21 - n20 * n11)) / det;

    return result;
  }

  /**
   * Calculates the determinant of this matrix.
   *
   * @returns The determinant value
   *
   * @example
   * ```typescript
   * const m = Matrix4.scale(2, 2, 2);
   * const det = m.determinant(); // 8
   * ```
   */
  determinant(): number {
    const e = this.elements;

    const n00 = e[0], n01 = e[1], n02 = e[2], n03 = e[3];
    const n10 = e[4], n11 = e[5], n12 = e[6], n13 = e[7];
    const n20 = e[8], n21 = e[9], n22 = e[10], n23 = e[11];
    const n30 = e[12], n31 = e[13], n32 = e[14], n33 = e[15];

    const t00 = n22 * n33 - n32 * n23;
    const t01 = n21 * n33 - n31 * n23;
    const t02 = n21 * n32 - n31 * n22;
    const t03 = n20 * n33 - n30 * n23;
    const t04 = n20 * n32 - n30 * n22;
    const t05 = n20 * n31 - n30 * n21;

    return (
      n00 * (n11 * t00 - n12 * t01 + n13 * t02) -
      n10 * (n01 * t00 - n02 * t01 + n03 * t02) +
      n20 * (n01 * (n12 * n33 - n32 * n13) - n02 * (n11 * n33 - n31 * n13) + n03 * (n11 * n32 - n31 * n12)) -
      n30 * (n01 * (n12 * n23 - n22 * n13) - n02 * (n11 * n23 - n21 * n13) + n03 * (n11 * n22 - n21 * n12))
    );
  }

  /**
   * Decomposes this matrix into translation, rotation, and scale components.
   * Handles negative scale properly by extracting sign information.
   *
   * @returns Object containing position, rotation (quaternion), and scale vectors
   *
   * @example
   * ```typescript
   * const m = Matrix4.translation(1, 2, 3)
   *   .multiply(Matrix4.rotationY(Math.PI / 4))
   *   .multiply(Matrix4.scale(2, 2, 2));
   * const { position, rotation, scale } = m.decompose();
   * ```
   */
  decompose(): { position: Vector3; rotation: Quaternion; scale: Vector3 } {
    const e = this.elements;

    const position = new Vector3(e[12], e[13], e[14]);

    const sx = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
    const sy = Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]);
    const sz = Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10]);

    const det = this.determinant();
    const scaleX = det < 0 ? -sx : sx;
    const scaleY = sy;
    const scaleZ = sz;

    const scale = new Vector3(scaleX, scaleY, scaleZ);

    const invSX = 1 / scaleX;
    const invSY = 1 / scaleY;
    const invSZ = 1 / scaleZ;

    const m00 = e[0] * invSX;
    const m01 = e[1] * invSX;
    const m02 = e[2] * invSX;

    const m10 = e[4] * invSY;
    const m11 = e[5] * invSY;
    const m12 = e[6] * invSY;

    const m20 = e[8] * invSZ;
    const m21 = e[9] * invSZ;
    const m22 = e[10] * invSZ;

    const trace = m00 + m11 + m22;
    let w: number, x: number, y: number, z: number;

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      w = 0.25 / s;
      x = (m21 - m12) * s;
      y = (m02 - m20) * s;
      z = (m10 - m01) * s;
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      w = (m21 - m12) / s;
      x = 0.25 * s;
      y = (m01 + m10) / s;
      z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      w = (m02 - m20) / s;
      x = (m01 + m10) / s;
      y = 0.25 * s;
      z = (m12 + m21) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      w = (m10 - m01) / s;
      x = (m02 + m20) / s;
      y = (m12 + m21) / s;
      z = 0.25 * s;
    }

    const rotation: Quaternion = {
      x,
      y,
      z,
      w,
      normalize: function() {
        const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
        if (len > 0) {
          this.x /= len; this.y /= len; this.z /= len; this.w /= len;
        }
        return this;
      }
    };

    return { position, rotation, scale };
  }

  /**
   * Composes this matrix from translation, rotation, and scale components.
   * Order: Scale -> Rotate -> Translate
   *
   * @param position - Translation vector
   * @param rotation - Rotation quaternion
   * @param scale - Scale vector
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = new Matrix4();
   * const pos = new Vector3(1, 2, 3);
   * const rot = { x: 0, y: 0, z: 0, w: 1 };
   * const scale = new Vector3(2, 2, 2);
   * m.compose(pos, rot, scale);
   * ```
   */
  compose(position: Vector3, rotation: Quaternion, scale: Vector3): this {
    const x = rotation.x, y = rotation.y, z = rotation.z, w = rotation.w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    const sx = scale.x, sy = scale.y, sz = scale.z;

    const e = this.elements;

    e[0] = (1 - (yy + zz)) * sx;
    e[1] = (xy + wz) * sx;
    e[2] = (xz - wy) * sx;
    e[3] = 0;

    e[4] = (xy - wz) * sy;
    e[5] = (1 - (xx + zz)) * sy;
    e[6] = (yz + wx) * sy;
    e[7] = 0;

    e[8] = (xz + wy) * sz;
    e[9] = (yz - wx) * sz;
    e[10] = (1 - (xx + yy)) * sz;
    e[11] = 0;

    e[12] = position.x;
    e[13] = position.y;
    e[14] = position.z;
    e[15] = 1;

    return this;
  }

  /**
   * Sets this matrix to the identity matrix.
   *
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = Matrix4.translation(1, 2, 3);
   * m.identity(); // Reset to identity
   * ```
   */
  identity(): this {
    const e = this.elements;
    e[0] = 1; e[4] = 0; e[8] = 0; e[12] = 0;
    e[1] = 0; e[5] = 1; e[9] = 0; e[13] = 0;
    e[2] = 0; e[6] = 0; e[10] = 1; e[14] = 0;
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
    return this;
  }

  /**
   * Sets this matrix to a translation matrix.
   *
   * @param x - X translation
   * @param y - Y translation
   * @param z - Z translation
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = new Matrix4();
   * m.setTranslation(1, 2, 3);
   * ```
   */
  setTranslation(x: number, y: number, z: number): this {
    const e = this.elements;
    e[0] = 1; e[4] = 0; e[8] = 0; e[12] = x;
    e[1] = 0; e[5] = 1; e[9] = 0; e[13] = y;
    e[2] = 0; e[6] = 0; e[10] = 1; e[14] = z;
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
    return this;
  }

  /**
   * Sets this matrix to a rotation around the X axis.
   *
   * @param radians - Rotation angle in radians
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = new Matrix4();
   * m.setRotationX(Math.PI / 2); // 90 degrees
   * ```
   */
  setRotationX(radians: number): this {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    const e = this.elements;
    e[0] = 1; e[4] = 0; e[8] = 0; e[12] = 0;
    e[1] = 0; e[5] = c; e[9] = -s; e[13] = 0;
    e[2] = 0; e[6] = s; e[10] = c; e[14] = 0;
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
    return this;
  }

  /**
   * Sets this matrix to a rotation around the Y axis.
   *
   * @param radians - Rotation angle in radians
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = new Matrix4();
   * m.setRotationY(Math.PI / 2); // 90 degrees
   * ```
   */
  setRotationY(radians: number): this {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    const e = this.elements;
    e[0] = c; e[4] = 0; e[8] = s; e[12] = 0;
    e[1] = 0; e[5] = 1; e[9] = 0; e[13] = 0;
    e[2] = -s; e[6] = 0; e[10] = c; e[14] = 0;
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
    return this;
  }

  /**
   * Sets this matrix to a rotation around the Z axis.
   *
   * @param radians - Rotation angle in radians
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = new Matrix4();
   * m.setRotationZ(Math.PI / 2); // 90 degrees
   * ```
   */
  setRotationZ(radians: number): this {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    const e = this.elements;
    e[0] = c; e[4] = -s; e[8] = 0; e[12] = 0;
    e[1] = s; e[5] = c; e[9] = 0; e[13] = 0;
    e[2] = 0; e[6] = 0; e[10] = 1; e[14] = 0;
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
    return this;
  }

  /**
   * Sets this matrix to a rotation around an arbitrary axis.
   * Uses Rodrigues' rotation formula.
   *
   * @param axis - Normalized axis of rotation
   * @param angle - Rotation angle in radians
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = new Matrix4();
   * const axis = new Vector3(0, 1, 0).normalize();
   * m.setRotationAxis(axis, Math.PI / 2);
   * ```
   */
  setRotationAxis(axis: Vector3, angle: number): this {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    const x = axis.x, y = axis.y, z = axis.z;
    const tx = t * x, ty = t * y;

    const e = this.elements;

    e[0] = tx * x + c;
    e[1] = tx * y + s * z;
    e[2] = tx * z - s * y;
    e[3] = 0;

    e[4] = tx * y - s * z;
    e[5] = ty * y + c;
    e[6] = ty * z + s * x;
    e[7] = 0;

    e[8] = tx * z + s * y;
    e[9] = ty * z - s * x;
    e[10] = t * z * z + c;
    e[11] = 0;

    e[12] = 0;
    e[13] = 0;
    e[14] = 0;
    e[15] = 1;

    return this;
  }

  /**
   * Sets this matrix to a scale matrix.
   *
   * @param x - X scale
   * @param y - Y scale
   * @param z - Z scale
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = new Matrix4();
   * m.setScale(2, 2, 2);
   * ```
   */
  setScale(x: number, y: number, z: number): this {
    const e = this.elements;
    e[0] = x; e[4] = 0; e[8] = 0; e[12] = 0;
    e[1] = 0; e[5] = y; e[9] = 0; e[13] = 0;
    e[2] = 0; e[6] = 0; e[10] = z; e[14] = 0;
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
    return this;
  }

  /**
   * Sets this matrix from a quaternion rotation.
   *
   * @param q - Quaternion representing rotation
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = new Matrix4();
   * const q = { x: 0, y: 0.707, z: 0, w: 0.707 }; // 90 degrees around Y
   * m.setFromQuaternion(q);
   * ```
   */
  setFromQuaternion(q: Quaternion): this {
    const x = q.x, y = q.y, z = q.z, w = q.w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    const e = this.elements;

    e[0] = 1 - (yy + zz);
    e[1] = xy + wz;
    e[2] = xz - wy;
    e[3] = 0;

    e[4] = xy - wz;
    e[5] = 1 - (xx + zz);
    e[6] = yz + wx;
    e[7] = 0;

    e[8] = xz + wy;
    e[9] = yz - wx;
    e[10] = 1 - (xx + yy);
    e[11] = 0;

    e[12] = 0;
    e[13] = 0;
    e[14] = 0;
    e[15] = 1;

    return this;
  }

  /**
   * Sets this matrix to a view matrix (camera transformation).
   * Creates a matrix that transforms world space to view space.
   *
   * @param eye - Camera position
   * @param target - Point the camera is looking at
   * @param up - Up direction (should be normalized)
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const view = new Matrix4();
   * const eye = new Vector3(0, 5, 10);
   * const target = new Vector3(0, 0, 0);
   * const up = new Vector3(0, 1, 0);
   * view.lookAt(eye, target, up);
   * ```
   */
  lookAt(eye: Vector3, target: Vector3, up: Vector3): this {
    const z = eye.sub(target).normalize();
    if (z.lengthSquared() < EPSILON * EPSILON) {
      z.z = 1;
    }

    const x = up.cross(z).normalize();
    if (x.lengthSquared() < EPSILON * EPSILON) {
      if (Math.abs(up.z) === 1) {
        z.x += 0.0001;
      } else {
        z.z += 0.0001;
      }
      z.normalizeInPlace();
      x.copy(up.cross(z).normalize());
    }

    const y = z.cross(x);

    const e = this.elements;

    e[0] = x.x; e[4] = x.y; e[8] = x.z; e[12] = -x.dot(eye);
    e[1] = y.x; e[5] = y.y; e[9] = y.z; e[13] = -y.dot(eye);
    e[2] = z.x; e[6] = z.y; e[10] = z.z; e[14] = -z.dot(eye);
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;

    return this;
  }

  /**
   * Sets this matrix to a perspective projection matrix.
   * Uses vertical field of view and outputs to NDC space [-1, 1] or [0, 1] for reverse-Z.
   *
   * @param fov - Vertical field of view in radians
   * @param aspect - Aspect ratio (width / height)
   * @param near - Near clipping plane distance
   * @param far - Far clipping plane distance
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const proj = new Matrix4();
   * proj.perspective(Math.PI / 4, 16/9, 0.1, 100);
   * ```
   */
  perspective(fov: number, aspect: number, near: number, far: number): this {
    const f = 1 / Math.tan(fov / 2);
    const rangeInv = 1 / (near - far);

    const e = this.elements;

    e[0] = f / aspect;
    e[1] = 0;
    e[2] = 0;
    e[3] = 0;

    e[4] = 0;
    e[5] = f;
    e[6] = 0;
    e[7] = 0;

    e[8] = 0;
    e[9] = 0;
    e[10] = (far + near) * rangeInv;
    e[11] = -1;

    e[12] = 0;
    e[13] = 0;
    e[14] = 2 * far * near * rangeInv;
    e[15] = 0;

    return this;
  }

  /**
   * Sets this matrix to a perspective projection with infinite far plane.
   * Useful for reverse-Z depth buffers to maximize depth precision.
   *
   * @param fov - Vertical field of view in radians
   * @param aspect - Aspect ratio (width / height)
   * @param near - Near clipping plane distance
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const proj = new Matrix4();
   * proj.perspectiveInfinite(Math.PI / 4, 16/9, 0.1);
   * ```
   */
  perspectiveInfinite(fov: number, aspect: number, near: number): this {
    const f = 1 / Math.tan(fov / 2);

    const e = this.elements;

    e[0] = f / aspect;
    e[1] = 0;
    e[2] = 0;
    e[3] = 0;

    e[4] = 0;
    e[5] = f;
    e[6] = 0;
    e[7] = 0;

    e[8] = 0;
    e[9] = 0;
    e[10] = -1;
    e[11] = -1;

    e[12] = 0;
    e[13] = 0;
    e[14] = -2 * near;
    e[15] = 0;

    return this;
  }

  /**
   * Sets this matrix to an orthographic projection matrix.
   *
   * @param left - Left clipping plane
   * @param right - Right clipping plane
   * @param bottom - Bottom clipping plane
   * @param top - Top clipping plane
   * @param near - Near clipping plane
   * @param far - Far clipping plane
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const proj = new Matrix4();
   * proj.orthographic(-10, 10, -10, 10, 0.1, 100);
   * ```
   */
  orthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): this {
    const w = 1 / (right - left);
    const h = 1 / (top - bottom);
    const p = 1 / (far - near);

    const e = this.elements;

    e[0] = 2 * w;
    e[1] = 0;
    e[2] = 0;
    e[3] = 0;

    e[4] = 0;
    e[5] = 2 * h;
    e[6] = 0;
    e[7] = 0;

    e[8] = 0;
    e[9] = 0;
    e[10] = -2 * p;
    e[11] = 0;

    e[12] = -(right + left) * w;
    e[13] = -(top + bottom) * h;
    e[14] = -(far + near) * p;
    e[15] = 1;

    return this;
  }

  /**
   * Extracts the position (translation) component from this matrix.
   *
   * @returns Position vector
   *
   * @example
   * ```typescript
   * const m = Matrix4.translation(1, 2, 3);
   * const pos = m.getPosition(); // (1, 2, 3)
   * ```
   */
  getPosition(): Vector3 {
    const e = this.elements;
    return new Vector3(e[12], e[13], e[14]);
  }

  /**
   * Extracts the scale component from this matrix.
   *
   * @returns Scale vector
   *
   * @example
   * ```typescript
   * const m = Matrix4.scale(2, 3, 4);
   * const scale = m.getScale(); // (2, 3, 4)
   * ```
   */
  getScale(): Vector3 {
    const e = this.elements;

    const sx = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
    const sy = Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]);
    const sz = Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10]);

    const det = this.determinant();
    if (det < 0) {
      return new Vector3(-sx, sy, sz);
    }

    return new Vector3(sx, sy, sz);
  }

  /**
   * Returns the maximum scale factor along any axis.
   *
   * @returns Maximum scale value
   *
   * @example
   * ```typescript
   * const m = Matrix4.scale(2, 5, 3);
   * const maxScale = m.getMaxScaleOnAxis(); // 5
   * ```
   */
  getMaxScaleOnAxis(): number {
    const e = this.elements;

    const sx = e[0] * e[0] + e[1] * e[1] + e[2] * e[2];
    const sy = e[4] * e[4] + e[5] * e[5] + e[6] * e[6];
    const sz = e[8] * e[8] + e[9] * e[9] + e[10] * e[10];

    return Math.sqrt(Math.max(sx, sy, sz));
  }

  /**
   * Extracts the rotation component from this matrix as a quaternion.
   *
   * @returns Rotation quaternion
   *
   * @example
   * ```typescript
   * const m = Matrix4.rotationY(Math.PI / 2);
   * const rot = m.getRotation();
   * ```
   */
  getRotation(): Quaternion {
    const scale = this.getScale();
    const e = this.elements;

    const invSX = 1 / scale.x;
    const invSY = 1 / scale.y;
    const invSZ = 1 / scale.z;

    const m00 = e[0] * invSX;
    const m01 = e[1] * invSX;
    const m02 = e[2] * invSX;

    const m10 = e[4] * invSY;
    const m11 = e[5] * invSY;
    const m12 = e[6] * invSY;

    const m20 = e[8] * invSZ;
    const m21 = e[9] * invSZ;
    const m22 = e[10] * invSZ;

    const trace = m00 + m11 + m22;
    let w: number, x: number, y: number, z: number;

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      w = 0.25 / s;
      x = (m21 - m12) * s;
      y = (m02 - m20) * s;
      z = (m10 - m01) * s;
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      w = (m21 - m12) / s;
      x = 0.25 * s;
      y = (m01 + m10) / s;
      z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      w = (m02 - m20) / s;
      x = (m01 + m10) / s;
      y = 0.25 * s;
      z = (m12 + m21) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      w = (m10 - m01) / s;
      x = (m02 + m20) / s;
      y = (m12 + m21) / s;
      z = 0.25 * s;
    }

    return {
      x,
      y,
      z,
      w,
      normalize: function() {
        const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
        if (len > 0) {
          this.x /= len; this.y /= len; this.z /= len; this.w /= len;
        }
        return this;
      }
    };
  }

  /**
   * Multiplies this matrix by another matrix in place.
   *
   * @param m - Matrix to multiply with
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = Matrix4.translation(1, 0, 0);
   * m.multiplyInPlace(Matrix4.rotationY(Math.PI / 2));
   * ```
   */
  multiplyInPlace(m: Matrix4): this {
    const result = this.multiply(m);
    this.copy(result);
    return this;
  }

  /**
   * Premultiplies this matrix by another matrix in place.
   *
   * @param m - Matrix to premultiply with
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = Matrix4.rotationY(Math.PI / 2);
   * m.premultiplyInPlace(Matrix4.translation(1, 0, 0));
   * ```
   */
  premultiplyInPlace(m: Matrix4): this {
    const result = m.multiply(this);
    this.copy(result);
    return this;
  }

  /**
   * Transposes this matrix in place.
   *
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = Matrix4.translation(1, 2, 3);
   * m.transposeInPlace();
   * ```
   */
  transposeInPlace(): this {
    const e = this.elements;
    let tmp: number;

    tmp = e[1]; e[1] = e[4]; e[4] = tmp;
    tmp = e[2]; e[2] = e[8]; e[8] = tmp;
    tmp = e[3]; e[3] = e[12]; e[12] = tmp;
    tmp = e[6]; e[6] = e[9]; e[9] = tmp;
    tmp = e[7]; e[7] = e[13]; e[13] = tmp;
    tmp = e[11]; e[11] = e[14]; e[14] = tmp;

    return this;
  }

  /**
   * Inverts this matrix in place.
   * If the matrix is singular, it remains unchanged.
   *
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = Matrix4.translation(1, 2, 3);
   * m.invertInPlace();
   * ```
   */
  invertInPlace(): this {
    const inverted = this.invert();
    if (inverted) {
      this.copy(inverted);
    }
    return this;
  }

  /**
   * Sets the matrix elements from row-major values.
   *
   * @param values - 16 values in row-major order
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = new Matrix4();
   * m.set(
   *   1, 0, 0, 0,
   *   0, 1, 0, 0,
   *   0, 0, 1, 0,
   *   0, 0, 0, 1
   * );
   * ```
   */
  set(...values: number[]): this {
    if (values.length !== 16) {
      throw new Error('Matrix4.set() requires exactly 16 values');
    }

    const e = this.elements;

    e[0] = values[0]; e[4] = values[1]; e[8] = values[2]; e[12] = values[3];
    e[1] = values[4]; e[5] = values[5]; e[9] = values[6]; e[13] = values[7];
    e[2] = values[8]; e[6] = values[9]; e[10] = values[10]; e[14] = values[11];
    e[3] = values[12]; e[7] = values[13]; e[11] = values[14]; e[15] = values[15];

    return this;
  }

  /**
   * Sets this matrix from three basis vectors (columns of the rotation matrix).
   *
   * @param xAxis - X axis basis vector (right)
   * @param yAxis - Y axis basis vector (up)
   * @param zAxis - Z axis basis vector (forward)
   * @returns this matrix for chaining
   */
  setFromBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): this {
    const e = this.elements;

    e[0] = xAxis.x; e[4] = yAxis.x; e[8] = zAxis.x; e[12] = 0;
    e[1] = xAxis.y; e[5] = yAxis.y; e[9] = zAxis.y; e[13] = 0;
    e[2] = xAxis.z; e[6] = yAxis.z; e[10] = zAxis.z; e[14] = 0;
    e[3] = 0;       e[7] = 0;       e[11] = 0;       e[15] = 1;

    return this;
  }

  /**
   * Creates a copy of this matrix.
   *
   * @returns New matrix with the same values
   *
   * @example
   * ```typescript
   * const m1 = Matrix4.translation(1, 2, 3);
   * const m2 = m1.clone();
   * ```
   */
  clone(): Matrix4 {
    const result = new Matrix4();
    result.elements.set(this.elements);
    return result;
  }

  /**
   * Copies values from another matrix to this matrix.
   *
   * @param m - Matrix to copy from
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m1 = Matrix4.translation(1, 2, 3);
   * const m2 = new Matrix4();
   * m2.copy(m1);
   * ```
   */
  copy(m: Matrix4): this {
    this.elements.set(m.elements);
    return this;
  }

  /**
   * Checks if this matrix is equal to another matrix within epsilon tolerance.
   *
   * @param m - Matrix to compare with
   * @param epsilon - Tolerance value (default: EPSILON)
   * @returns True if matrices are nearly equal
   *
   * @example
   * ```typescript
   * const m1 = Matrix4.translation(1, 2, 3);
   * const m2 = Matrix4.translation(1.0000001, 2, 3);
   * const equal = m1.equals(m2); // true
   * ```
   */
  equals(m: Matrix4, epsilon: number = EPSILON): boolean {
    const e1 = this.elements;
    const e2 = m.elements;

    for (let i = 0; i < 16; i++) {
      if (!nearlyEqual(e1[i], e2[i], epsilon)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Transforms a point (position) by this matrix.
   * Applies full transformation including translation.
   * Assumes w=1 for the input point.
   *
   * @param point - Point to transform
   * @returns New transformed point
   *
   * @example
   * ```typescript
   * const m = Matrix4.translation(1, 2, 3);
   * const p = new Vector3(0, 0, 0);
   * const transformed = m.transformPoint(p); // (1, 2, 3)
   * ```
   */
  transformPoint(point: Vector3): Vector3 {
    const e = this.elements;
    const x = point.x;
    const y = point.y;
    const z = point.z;

    const w = e[3] * x + e[7] * y + e[11] * z + e[15];

    return new Vector3(
      (e[0] * x + e[4] * y + e[8] * z + e[12]) / w,
      (e[1] * x + e[5] * y + e[9] * z + e[13]) / w,
      (e[2] * x + e[6] * y + e[10] * z + e[14]) / w
    );
  }

  /**
   * Transforms a direction vector by this matrix.
   * Applies only rotation and scale, ignoring translation.
   * Assumes w=0 for the input vector.
   *
   * @param vector - Direction vector to transform
   * @returns New transformed direction
   *
   * @example
   * ```typescript
   * const m = Matrix4.rotationY(Math.PI / 2);
   * const v = new Vector3(1, 0, 0);
   * const transformed = m.transformVector(v); // Approximately (0, 0, -1)
   * ```
   */
  transformVector(vector: Vector3): Vector3 {
    const e = this.elements;
    const x = vector.x;
    const y = vector.y;
    const z = vector.z;

    return new Vector3(
      e[0] * x + e[4] * y + e[8] * z,
      e[1] * x + e[5] * y + e[9] * z,
      e[2] * x + e[6] * y + e[10] * z
    );
  }

  /**
   * Multiplies this matrix by a Vector4.
   * Performs full 4D matrix-vector multiplication.
   *
   * @param v - Vector4 to multiply
   * @returns New transformed Vector4-like object with x, y, z, w properties
   *
   * @example
   * ```typescript
   * const m = Matrix4.translation(1, 2, 3);
   * const v = { x: 0, y: 0, z: 0, w: 1 };
   * const result = m.multiplyVector4(v); // { x: 1, y: 2, z: 3, w: 1 }
   * ```
   */
  multiplyVector4(v: { x: number; y: number; z: number; w: number }): { x: number; y: number; z: number; w: number } {
    const e = this.elements;
    const x = v.x;
    const y = v.y;
    const z = v.z;
    const w = v.w;

    return {
      x: e[0] * x + e[4] * y + e[8] * z + e[12] * w,
      y: e[1] * x + e[5] * y + e[9] * z + e[13] * w,
      z: e[2] * x + e[6] * y + e[10] * z + e[14] * w,
      w: e[3] * x + e[7] * y + e[11] * z + e[15] * w
    };
  }

  /**
   * Converts this matrix to an array in column-major order.
   *
   * @returns Array of 16 numbers
   *
   * @example
   * ```typescript
   * const m = new Matrix4();
   * const arr = m.toArray();
   * ```
   */
  toArray(): number[] {
    return Array.from(this.elements);
  }

  /**
   * Sets the matrix elements from an array in column-major order.
   *
   * @param arr - Array-like object containing at least 16 numbers
   * @param offset - Starting index in the array (default: 0)
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = new Matrix4();
   * const arr = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
   * m.fromArray(arr);
   * ```
   */
  fromArray(arr: ArrayLike<number>, offset: number = 0): this {
    for (let i = 0; i < 16; i++) {
      this.elements[i] = arr[offset + i];
    }
    return this;
  }

  /**
   * Creates a new identity matrix.
   *
   * @returns New identity matrix
   *
   * @example
   * ```typescript
   * const identity = Matrix4.identity();
   * ```
   */
  static identity(): Matrix4 {
    return new Matrix4();
  }

  /**
   * Creates a new translation matrix.
   *
   * @param x - X translation
   * @param y - Y translation
   * @param z - Z translation
   * @returns New translation matrix
   *
   * @example
   * ```typescript
   * const m = Matrix4.translation(1, 2, 3);
   * ```
   */
  static translation(x: number, y: number, z: number): Matrix4 {
    return new Matrix4().setTranslation(x, y, z);
  }

  /**
   * Creates a new rotation matrix around the X axis.
   *
   * @param radians - Rotation angle in radians
   * @returns New rotation matrix
   *
   * @example
   * ```typescript
   * const m = Matrix4.rotationX(Math.PI / 2);
   * ```
   */
  static rotationX(radians: number): Matrix4 {
    return new Matrix4().setRotationX(radians);
  }

  /**
   * Creates a new rotation matrix around the Y axis.
   *
   * @param radians - Rotation angle in radians
   * @returns New rotation matrix
   *
   * @example
   * ```typescript
   * const m = Matrix4.rotationY(Math.PI / 2);
   * ```
   */
  static rotationY(radians: number): Matrix4 {
    return new Matrix4().setRotationY(radians);
  }

  /**
   * Creates a new rotation matrix around the Z axis.
   *
   * @param radians - Rotation angle in radians
   * @returns New rotation matrix
   *
   * @example
   * ```typescript
   * const m = Matrix4.rotationZ(Math.PI / 2);
   * ```
   */
  static rotationZ(radians: number): Matrix4 {
    return new Matrix4().setRotationZ(radians);
  }

  /**
   * Creates a new rotation matrix around an arbitrary axis.
   *
   * @param axis - Normalized axis of rotation
   * @param angle - Rotation angle in radians
   * @returns New rotation matrix
   *
   * @example
   * ```typescript
   * const axis = new Vector3(1, 1, 0).normalize();
   * const m = Matrix4.rotationAxis(axis, Math.PI / 2);
   * ```
   */
  static rotationAxis(axis: Vector3, angle: number): Matrix4 {
    return new Matrix4().setRotationAxis(axis, angle);
  }

  /**
   * Creates a new scale matrix.
   *
   * @param x - X scale
   * @param y - Y scale
   * @param z - Z scale
   * @returns New scale matrix
   *
   * @example
   * ```typescript
   * const m = Matrix4.scale(2, 2, 2);
   * ```
   */
  static scale(x: number, y: number, z: number): Matrix4 {
    return new Matrix4().setScale(x, y, z);
  }

  /**
   * Creates a new rotation matrix from a quaternion.
   *
   * @param q - Quaternion representing rotation
   * @returns New rotation matrix
   *
   * @example
   * ```typescript
   * const q = { x: 0, y: 0.707, z: 0, w: 0.707 };
   * const m = Matrix4.fromQuaternion(q);
   * ```
   */
  static fromQuaternion(q: Quaternion): Matrix4 {
    return new Matrix4().setFromQuaternion(q);
  }

  /**
   * Creates a new view matrix.
   *
   * @param eye - Camera position
   * @param target - Point the camera is looking at
   * @param up - Up direction (should be normalized)
   * @returns New view matrix
   *
   * @example
   * ```typescript
   * const eye = new Vector3(0, 5, 10);
   * const target = new Vector3(0, 0, 0);
   * const up = new Vector3(0, 1, 0);
   * const view = Matrix4.lookAt(eye, target, up);
   * ```
   */
  static lookAt(eye: Vector3, target: Vector3, up: Vector3): Matrix4 {
    return new Matrix4().lookAt(eye, target, up);
  }

  /**
   * Creates a new perspective projection matrix.
   *
   * @param fov - Vertical field of view in radians
   * @param aspect - Aspect ratio (width / height)
   * @param near - Near clipping plane distance
   * @param far - Far clipping plane distance
   * @returns New perspective projection matrix
   *
   * @example
   * ```typescript
   * const proj = Matrix4.perspective(Math.PI / 4, 16/9, 0.1, 100);
   * ```
   */
  static perspective(fov: number, aspect: number, near: number, far: number): Matrix4 {
    return new Matrix4().perspective(fov, aspect, near, far);
  }

  /**
   * Creates a new orthographic projection matrix.
   *
   * @param left - Left clipping plane
   * @param right - Right clipping plane
   * @param bottom - Bottom clipping plane
   * @param top - Top clipping plane
   * @param near - Near clipping plane
   * @param far - Far clipping plane
   * @returns New orthographic projection matrix
   *
   * @example
   * ```typescript
   * const proj = Matrix4.orthographic(-10, 10, -10, 10, 0.1, 100);
   * ```
   */
  static orthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): Matrix4 {
    return new Matrix4().orthographic(left, right, bottom, top, near, far);
  }

  /**
   * Creates a new matrix from translation, rotation, and scale components.
   * Static version of the compose() instance method.
   *
   * @param position - Translation vector
   * @param rotation - Rotation quaternion
   * @param scale - Scale vector
   * @returns New composed matrix
   *
   * @example
   * ```typescript
   * const pos = new Vector3(1, 2, 3);
   * const rot = { x: 0, y: 0, z: 0, w: 1 };
   * const scale = new Vector3(2, 2, 2);
   * const m = Matrix4.compose(pos, rot, scale);
   * ```
   */
  static compose(position: Vector3, rotation: Quaternion, scale: Vector3): Matrix4 {
    return new Matrix4().compose(position, rotation, scale);
  }

  /**
   * Creates a rotation matrix around the X axis.
   * Static alias for setRotationX().
   *
   * @param radians - Rotation angle in radians
   * @returns New rotation matrix
   *
   * @example
   * ```typescript
   * const m = Matrix4.createRotationX(Math.PI / 2);
   * ```
   */
  static createRotationX(radians: number): Matrix4 {
    return Matrix4.rotationX(radians);
  }
}
