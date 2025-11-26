/**
 * 3x3 Matrix for 2D transforms, normal transforms, and rotation matrices.
 *
 * Stores elements in column-major order for WebGL compatibility:
 * [m00, m10, m20, m01, m11, m21, m02, m12, m22]
 *
 * Matrix structure:
 * ```
 * [ m00  m01  m02 ]
 * [ m10  m11  m12 ]
 * [ m20  m21  m22 ]
 * ```
 *
 * @module Matrix3
 */

import { MathConstants, nearlyEqual } from './MathConstants';

const EPSILON = MathConstants.EPSILON;

/**
 * Interface for Matrix4 to handle circular dependency.
 * The actual Matrix4 class will be imported at runtime.
 */
interface Matrix4Like {
  elements: Float32Array;
}

/**
 * 3x3 matrix class for 2D transformations, normal transforms, and 3D rotations.
 *
 * Elements are stored in column-major order for WebGL compatibility.
 * Access pattern: elements[col * 3 + row]
 *
 * @example
 * ```typescript
 * // Create identity matrix
 * const m = new Matrix3();
 *
 * // Create rotation matrix
 * const rot = Matrix3.rotation(Math.PI / 4);
 *
 * // Create scale matrix
 * const scale = Matrix3.scale(2, 3);
 *
 * // Matrix multiplication
 * const result = rot.multiply(scale);
 *
 * // Get normal matrix from a Matrix4
 * const normalMatrix = new Matrix3().getNormalMatrix(modelMatrix);
 * ```
 */
export class Matrix3 {
  /**
   * Matrix elements in column-major order.
   * [m00, m10, m20, m01, m11, m21, m02, m12, m22]
   */
  public elements: Float32Array;

  /**
   * Creates a new identity Matrix3.
   *
   * @example
   * ```typescript
   * const m = new Matrix3();
   * // m is now an identity matrix
   * ```
   */
  constructor() {
    this.elements = new Float32Array(9);
    this.identity();
  }

  /**
   * Sets this matrix to the identity matrix.
   *
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = new Matrix3();
   * m.set(1, 2, 3, 4, 5, 6, 7, 8, 9);
   * m.identity(); // Reset to identity
   * ```
   */
  identity(): this {
    const e = this.elements;
    e[0] = 1; e[3] = 0; e[6] = 0;
    e[1] = 0; e[4] = 1; e[7] = 0;
    e[2] = 0; e[5] = 0; e[8] = 1;
    return this;
  }

  /**
   * Sets the matrix elements from row-major order for convenience.
   *
   * @param values - 9 numbers in row-major order
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = new Matrix3();
   * m.set(
   *   1, 0, 0,
   *   0, 1, 0,
   *   0, 0, 1
   * ); // Identity matrix
   * ```
   */
  set(...values: number[]): this {
    if (values.length !== 9) {
      throw new Error('Matrix3.set() requires exactly 9 values');
    }

    const e = this.elements;
    // Convert from row-major input to column-major storage
    e[0] = values[0]; e[3] = values[1]; e[6] = values[2];
    e[1] = values[3]; e[4] = values[4]; e[7] = values[5];
    e[2] = values[6]; e[5] = values[7]; e[8] = values[8];

    return this;
  }

  /**
   * Multiplies this matrix by another matrix and returns a new matrix.
   * Result = this * m
   *
   * @param m - The matrix to multiply with
   * @returns A new matrix containing the result
   *
   * @example
   * ```typescript
   * const m1 = Matrix3.rotation(Math.PI / 4);
   * const m2 = Matrix3.scale(2, 2);
   * const result = m1.multiply(m2);
   * ```
   */
  multiply(m: Matrix3): Matrix3 {
    return this.clone().multiplyInPlace(m);
  }

  /**
   * Multiplies this matrix by another matrix in place.
   * this = this * m
   *
   * @param m - The matrix to multiply with
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = Matrix3.rotation(Math.PI / 4);
   * const scale = Matrix3.scale(2, 2);
   * m.multiplyInPlace(scale);
   * ```
   */
  multiplyInPlace(m: Matrix3): this {
    const ae = this.elements;
    const be = m.elements;

    const a00 = ae[0], a01 = ae[3], a02 = ae[6];
    const a10 = ae[1], a11 = ae[4], a12 = ae[7];
    const a20 = ae[2], a21 = ae[5], a22 = ae[8];

    const b00 = be[0], b01 = be[3], b02 = be[6];
    const b10 = be[1], b11 = be[4], b12 = be[7];
    const b20 = be[2], b21 = be[5], b22 = be[8];

    ae[0] = a00 * b00 + a01 * b10 + a02 * b20;
    ae[3] = a00 * b01 + a01 * b11 + a02 * b21;
    ae[6] = a00 * b02 + a01 * b12 + a02 * b22;

    ae[1] = a10 * b00 + a11 * b10 + a12 * b20;
    ae[4] = a10 * b01 + a11 * b11 + a12 * b21;
    ae[7] = a10 * b02 + a11 * b12 + a12 * b22;

    ae[2] = a20 * b00 + a21 * b10 + a22 * b20;
    ae[5] = a20 * b01 + a21 * b11 + a22 * b21;
    ae[8] = a20 * b02 + a21 * b12 + a22 * b22;

    return this;
  }

  /**
   * Multiplies this matrix by a scalar and returns a new matrix.
   *
   * @param s - The scalar to multiply with
   * @returns A new matrix containing the result
   *
   * @example
   * ```typescript
   * const m = new Matrix3().set(1, 2, 3, 4, 5, 6, 7, 8, 9);
   * const scaled = m.multiplyScalar(2);
   * ```
   */
  multiplyScalar(s: number): Matrix3 {
    const result = new Matrix3();
    const re = result.elements;
    const e = this.elements;

    for (let i = 0; i < 9; i++) {
      re[i] = e[i] * s;
    }

    return result;
  }

  /**
   * Transposes this matrix and returns a new matrix.
   *
   * @returns A new matrix containing the transposed result
   *
   * @example
   * ```typescript
   * const m = new Matrix3().set(
   *   1, 2, 3,
   *   4, 5, 6,
   *   7, 8, 9
   * );
   * const transposed = m.transpose();
   * ```
   */
  transpose(): Matrix3 {
    return this.clone().transposeInPlace();
  }

  /**
   * Transposes this matrix in place.
   *
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m = new Matrix3().set(
   *   1, 2, 3,
   *   4, 5, 6,
   *   7, 8, 9
   * );
   * m.transposeInPlace();
   * ```
   */
  transposeInPlace(): this {
    const e = this.elements;
    let tmp: number;

    tmp = e[1]; e[1] = e[3]; e[3] = tmp;
    tmp = e[2]; e[2] = e[6]; e[6] = tmp;
    tmp = e[5]; e[5] = e[7]; e[7] = tmp;

    return this;
  }

  /**
   * Computes the determinant of this matrix.
   *
   * @returns The determinant value
   *
   * @example
   * ```typescript
   * const m = Matrix3.identity();
   * const det = m.determinant(); // Returns 1
   * ```
   */
  determinant(): number {
    const e = this.elements;

    const a00 = e[0], a01 = e[3], a02 = e[6];
    const a10 = e[1], a11 = e[4], a12 = e[7];
    const a20 = e[2], a21 = e[5], a22 = e[8];

    return (
      a00 * (a11 * a22 - a12 * a21) -
      a01 * (a10 * a22 - a12 * a20) +
      a02 * (a10 * a21 - a11 * a20)
    );
  }

  /**
   * Inverts this matrix and returns a new matrix.
   * Returns null if the matrix is singular (non-invertible).
   *
   * @returns A new inverted matrix, or null if singular
   *
   * @example
   * ```typescript
   * const m = Matrix3.rotation(Math.PI / 4);
   * const inv = m.invert();
   * if (inv) {
   *   // Inverse exists
   *   const identity = m.multiply(inv);
   * }
   * ```
   */
  invert(): Matrix3 | null {
    const result = this.clone();
    return result.invertInPlace() ? result : null;
  }

  /**
   * Inverts this matrix in place.
   * Returns false if the matrix is singular (non-invertible).
   *
   * @returns This matrix if successful, null if singular
   *
   * @example
   * ```typescript
   * const m = Matrix3.rotation(Math.PI / 4);
   * if (m.invertInPlace()) {
   *   // m is now inverted
   * }
   * ```
   */
  invertInPlace(): this | null {
    const e = this.elements;

    const a00 = e[0], a01 = e[3], a02 = e[6];
    const a10 = e[1], a11 = e[4], a12 = e[7];
    const a20 = e[2], a21 = e[5], a22 = e[8];

    const det = this.determinant();

    if (Math.abs(det) < EPSILON) {
      return null;
    }

    const invDet = 1.0 / det;

    e[0] = (a11 * a22 - a12 * a21) * invDet;
    e[3] = (a02 * a21 - a01 * a22) * invDet;
    e[6] = (a01 * a12 - a02 * a11) * invDet;

    e[1] = (a12 * a20 - a10 * a22) * invDet;
    e[4] = (a00 * a22 - a02 * a20) * invDet;
    e[7] = (a02 * a10 - a00 * a12) * invDet;

    e[2] = (a10 * a21 - a11 * a20) * invDet;
    e[5] = (a01 * a20 - a00 * a21) * invDet;
    e[8] = (a00 * a11 - a01 * a10) * invDet;

    return this;
  }

  /**
   * Extracts the upper-left 3x3 portion of a Matrix4.
   *
   * @param m - The Matrix4 to extract from
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m4 = new Matrix4(); // 4x4 matrix
   * const m3 = new Matrix3().setFromMatrix4(m4);
   * ```
   */
  setFromMatrix4(m: Matrix4Like): this {
    const me = m.elements;
    const e = this.elements;

    e[0] = me[0]; e[3] = me[4]; e[6] = me[8];
    e[1] = me[1]; e[4] = me[5]; e[7] = me[9];
    e[2] = me[2]; e[5] = me[6]; e[8] = me[10];

    return this;
  }

  /**
   * Computes the normal matrix from a Matrix4.
   * The normal matrix is the inverse transpose of the upper-left 3x3 portion.
   * This is required for correctly transforming normals in non-uniform scaling.
   *
   * @param m - The Matrix4 to compute normal matrix from
   * @returns This matrix for chaining, or null if the matrix is singular
   *
   * @example
   * ```typescript
   * const modelMatrix = new Matrix4(); // Your model matrix
   * const normalMatrix = new Matrix3().getNormalMatrix(modelMatrix);
   * ```
   */
  getNormalMatrix(m: Matrix4Like): this {
    this.setFromMatrix4(m);
    const result = this.invertInPlace();
    if (result === null) {
      this.identity();
      return this;
    }
    this.transposeInPlace();
    return this;
  }

  /**
   * Creates a deep copy of this matrix.
   *
   * @returns A new matrix with the same values
   *
   * @example
   * ```typescript
   * const m1 = Matrix3.rotation(Math.PI / 4);
   * const m2 = m1.clone();
   * m2.identity(); // m1 is unchanged
   * ```
   */
  clone(): Matrix3 {
    const result = new Matrix3();
    result.elements.set(this.elements);
    return result;
  }

  /**
   * Copies the values from another matrix into this matrix.
   *
   * @param m - The matrix to copy from
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const m1 = Matrix3.rotation(Math.PI / 4);
   * const m2 = new Matrix3();
   * m2.copy(m1);
   * ```
   */
  copy(m: Matrix3): this {
    this.elements.set(m.elements);
    return this;
  }

  /**
   * Checks if this matrix equals another matrix within an epsilon tolerance.
   *
   * @param m - The matrix to compare with
   * @param epsilon - Optional epsilon tolerance (defaults to MathConstants.EPSILON)
   * @returns True if matrices are equal within tolerance
   *
   * @example
   * ```typescript
   * const m1 = Matrix3.identity();
   * const m2 = Matrix3.identity();
   * console.log(m1.equals(m2)); // true
   * ```
   */
  equals(m: Matrix3, epsilon: number = EPSILON): boolean {
    const ae = this.elements;
    const be = m.elements;

    for (let i = 0; i < 9; i++) {
      if (!nearlyEqual(ae[i], be[i], epsilon)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Converts this matrix to a plain array in column-major order.
   *
   * @returns An array containing the matrix elements
   *
   * @example
   * ```typescript
   * const m = Matrix3.identity();
   * const arr = m.toArray();
   * console.log(arr); // [1, 0, 0, 0, 1, 0, 0, 0, 1]
   * ```
   */
  toArray(): number[] {
    return Array.from(this.elements);
  }

  /**
   * Sets this matrix from an array in column-major order.
   *
   * @param arr - The array to read from
   * @param offset - Optional offset into the array (defaults to 0)
   * @returns This matrix for chaining
   *
   * @example
   * ```typescript
   * const arr = [1, 0, 0, 0, 1, 0, 0, 0, 1];
   * const m = new Matrix3().fromArray(arr);
   * ```
   */
  fromArray(arr: ArrayLike<number>, offset: number = 0): this {
    for (let i = 0; i < 9; i++) {
      this.elements[i] = arr[offset + i];
    }
    return this;
  }

  /**
   * Creates a new identity matrix.
   *
   * @returns A new identity matrix
   *
   * @example
   * ```typescript
   * const m = Matrix3.identity();
   * ```
   */
  static identity(): Matrix3 {
    return new Matrix3();
  }

  /**
   * Creates a 2D rotation matrix.
   *
   * @param radians - The rotation angle in radians
   * @returns A new rotation matrix
   *
   * @example
   * ```typescript
   * const rot = Matrix3.rotation(Math.PI / 4); // 45 degrees
   * ```
   */
  static rotation(radians: number): Matrix3 {
    const c = Math.cos(radians);
    const s = Math.sin(radians);

    const m = new Matrix3();
    m.elements[0] = c;  m.elements[3] = -s; m.elements[6] = 0;
    m.elements[1] = s;  m.elements[4] = c;  m.elements[7] = 0;
    m.elements[2] = 0;  m.elements[5] = 0;  m.elements[8] = 1;

    return m;
  }

  /**
   * Creates a 2D scale matrix.
   *
   * @param sx - Scale factor along X axis
   * @param sy - Scale factor along Y axis
   * @returns A new scale matrix
   *
   * @example
   * ```typescript
   * const scale = Matrix3.scale(2, 3);
   * ```
   */
  static scale(sx: number, sy: number): Matrix3 {
    const m = new Matrix3();
    m.elements[0] = sx; m.elements[3] = 0;  m.elements[6] = 0;
    m.elements[1] = 0;  m.elements[4] = sy; m.elements[7] = 0;
    m.elements[2] = 0;  m.elements[5] = 0;  m.elements[8] = 1;

    return m;
  }

  /**
   * Creates a 2D translation matrix using homogeneous coordinates.
   *
   * @param tx - Translation along X axis
   * @param ty - Translation along Y axis
   * @returns A new translation matrix
   *
   * @example
   * ```typescript
   * const trans = Matrix3.translation(10, 20);
   * ```
   */
  static translation(tx: number, ty: number): Matrix3 {
    const m = new Matrix3();
    m.elements[0] = 1;  m.elements[3] = 0;  m.elements[6] = tx;
    m.elements[1] = 0;  m.elements[4] = 1;  m.elements[7] = ty;
    m.elements[2] = 0;  m.elements[5] = 0;  m.elements[8] = 1;

    return m;
  }

  /**
   * Creates a 3D rotation matrix around the X axis.
   *
   * @param radians - The rotation angle in radians
   * @returns A new rotation matrix
   *
   * @example
   * ```typescript
   * const rotX = Matrix3.fromRotationX(Math.PI / 2);
   * ```
   */
  static fromRotationX(radians: number): Matrix3 {
    const c = Math.cos(radians);
    const s = Math.sin(radians);

    const m = new Matrix3();
    m.elements[0] = 1; m.elements[3] = 0;  m.elements[6] = 0;
    m.elements[1] = 0; m.elements[4] = c;  m.elements[7] = -s;
    m.elements[2] = 0; m.elements[5] = s;  m.elements[8] = c;

    return m;
  }

  /**
   * Creates a 3D rotation matrix around the Y axis.
   *
   * @param radians - The rotation angle in radians
   * @returns A new rotation matrix
   *
   * @example
   * ```typescript
   * const rotY = Matrix3.fromRotationY(Math.PI / 2);
   * ```
   */
  static fromRotationY(radians: number): Matrix3 {
    const c = Math.cos(radians);
    const s = Math.sin(radians);

    const m = new Matrix3();
    m.elements[0] = c;  m.elements[3] = 0; m.elements[6] = s;
    m.elements[1] = 0;  m.elements[4] = 1; m.elements[7] = 0;
    m.elements[2] = -s; m.elements[5] = 0; m.elements[8] = c;

    return m;
  }

  /**
   * Creates a 3D rotation matrix around the Z axis.
   *
   * @param radians - The rotation angle in radians
   * @returns A new rotation matrix
   *
   * @example
   * ```typescript
   * const rotZ = Matrix3.fromRotationZ(Math.PI / 2);
   * ```
   */
  static fromRotationZ(radians: number): Matrix3 {
    const c = Math.cos(radians);
    const s = Math.sin(radians);

    const m = new Matrix3();
    m.elements[0] = c;  m.elements[3] = -s; m.elements[6] = 0;
    m.elements[1] = s;  m.elements[4] = c;  m.elements[7] = 0;
    m.elements[2] = 0;  m.elements[5] = 0;  m.elements[8] = 1;

    return m;
  }

  /**
   * Adds two matrices and returns a new matrix.
   * Static version of the add instance method (element-wise addition).
   *
   * @param a - First matrix
   * @param b - Second matrix
   * @returns A new matrix containing the sum
   *
   * @example
   * ```typescript
   * const m1 = new Matrix3();
   * const m2 = new Matrix3();
   * const sum = Matrix3.add(m1, m2);
   * ```
   */
  static add(a: Matrix3, b: Matrix3): Matrix3 {
    const result = new Matrix3();
    const ae = a.elements;
    const be = b.elements;
    const re = result.elements;

    for (let i = 0; i < 9; i++) {
      re[i] = ae[i] + be[i];
    }

    return result;
  }

  /**
   * Subtracts one matrix from another and returns a new matrix.
   * Static version performing element-wise subtraction.
   *
   * @param a - First matrix
   * @param b - Second matrix (to subtract)
   * @returns A new matrix containing the difference
   *
   * @example
   * ```typescript
   * const m1 = new Matrix3();
   * const m2 = new Matrix3();
   * const diff = Matrix3.subtract(m1, m2);
   * ```
   */
  static subtract(a: Matrix3, b: Matrix3): Matrix3 {
    const result = new Matrix3();
    const ae = a.elements;
    const be = b.elements;
    const re = result.elements;

    for (let i = 0; i < 9; i++) {
      re[i] = ae[i] - be[i];
    }

    return result;
  }

  /**
   * Multiplies a matrix by a scalar and returns a new matrix.
   * Static version of the multiplyScalar instance method.
   *
   * @param m - Matrix to scale
   * @param s - Scalar value
   * @returns A new scaled matrix
   *
   * @example
   * ```typescript
   * const m = new Matrix3();
   * const scaled = Matrix3.multiplyScalar(m, 2);
   * ```
   */
  static multiplyScalar(m: Matrix3, s: number): Matrix3 {
    return m.multiplyScalar(s);
  }

  /**
   * Multiplies two matrices and returns a new matrix.
   * Static version of the multiply instance method.
   * Result = a * b
   *
   * @param a - First matrix
   * @param b - Second matrix
   * @returns A new matrix containing the product
   *
   * @example
   * ```typescript
   * const m1 = Matrix3.rotation(Math.PI / 4);
   * const m2 = Matrix3.scale(2, 2);
   * const result = Matrix3.multiply(m1, m2);
   * ```
   */
  static multiply(a: Matrix3, b: Matrix3): Matrix3 {
    return a.multiply(b);
  }
}
