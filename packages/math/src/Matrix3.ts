import type { Matrix4 } from "./Matrix4.js";
import { Vector3 } from "./Vector3.js";

type Matrix3Elements = readonly [number, number, number, number, number, number, number, number, number];

export class Matrix3 {
  readonly elements: Matrix3Elements;

  constructor(elements?: Matrix3Elements) {
    this.elements = elements ? [...elements] as Matrix3Elements : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }

  static identity(): Matrix3 {
    return new Matrix3();
  }

  static fromMatrix4(matrix: Matrix4): Matrix3 {
    const m = matrix.elements;
    return new Matrix3([
      m[0], m[1], m[2],
      m[4], m[5], m[6],
      m[8], m[9], m[10]
    ]);
  }

  static normalFromMatrix4(matrix: Matrix4): Matrix3 {
    return Matrix3.fromMatrix4(matrix).inverse().transpose();
  }

  /** three.js `Matrix3.set` — row-major arguments, column-major storage. */
  set(
    n11: number, n12: number, n13: number,
    n21: number, n22: number, n23: number,
    n31: number, n32: number, n33: number
  ): Matrix3 {
    return new Matrix3([
      n11, n21, n31,
      n12, n22, n32,
      n13, n23, n33
    ]);
  }

  clone(): Matrix3 {
    return new Matrix3([...this.elements] as Matrix3Elements);
  }

  equals(matrix: Matrix3): boolean {
    const a = this.elements;
    const b = matrix.elements;
    for (let i = 0; i < 9; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  determinant(): number {
    const m = this.elements;
    return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[3] * (m[1] * m[8] - m[2] * m[7]) + m[6] * (m[1] * m[5] - m[2] * m[4]);
  }

  /** three.js `invert` — returns identity when the matrix is singular (three semantics). */
  invert(): Matrix3 {
    const m = this.elements;
    const det = this.determinant();
    if (det === 0) return new Matrix3();
    const invDet = 1 / det;
    return new Matrix3([
      (m[4] * m[8] - m[5] * m[7]) * invDet,
      (m[2] * m[7] - m[1] * m[8]) * invDet,
      (m[1] * m[5] - m[2] * m[4]) * invDet,
      (m[5] * m[6] - m[3] * m[8]) * invDet,
      (m[0] * m[8] - m[2] * m[6]) * invDet,
      (m[2] * m[3] - m[0] * m[5]) * invDet,
      (m[3] * m[7] - m[4] * m[6]) * invDet,
      (m[1] * m[6] - m[0] * m[7]) * invDet,
      (m[0] * m[4] - m[1] * m[3]) * invDet
    ]);
  }

  inverse(): Matrix3 {
    const m = this.elements;
    const det = this.determinant();
    if (Math.abs(det) < 1e-12) throw new RangeError("Matrix3 is singular.");
    const invDet = 1 / det;
    return new Matrix3([
      (m[4] * m[8] - m[5] * m[7]) * invDet,
      (m[2] * m[7] - m[1] * m[8]) * invDet,
      (m[1] * m[5] - m[2] * m[4]) * invDet,
      (m[5] * m[6] - m[3] * m[8]) * invDet,
      (m[0] * m[8] - m[2] * m[6]) * invDet,
      (m[2] * m[3] - m[0] * m[5]) * invDet,
      (m[3] * m[7] - m[4] * m[6]) * invDet,
      (m[1] * m[6] - m[0] * m[7]) * invDet,
      (m[0] * m[4] - m[1] * m[3]) * invDet
    ]);
  }

  multiply(other: Matrix3): Matrix3 {
    const a = this.elements;
    const b = other.elements;
    const out = new Array<number>(9);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        out[col * 3 + row] =
          a[0 * 3 + row]! * b[col * 3 + 0]! +
          a[1 * 3 + row]! * b[col * 3 + 1]! +
          a[2 * 3 + row]! * b[col * 3 + 2]!;
      }
    }
    return new Matrix3(out as unknown as Matrix3Elements);
  }

  premultiply(other: Matrix3): Matrix3 {
    return other.multiply(this);
  }

  multiplyScalar(s: number): Matrix3 {
    const m = this.elements;
    return new Matrix3([
      m[0] * s, m[1] * s, m[2] * s,
      m[3] * s, m[4] * s, m[5] * s,
      m[6] * s, m[7] * s, m[8] * s
    ]);
  }

  /** three.js `Matrix3.getNormalMatrix` — inverse-transpose of m's upper-left 3x3. */
  getNormalMatrix(matrix4: Matrix4): Matrix3 {
    return Matrix3.normalFromMatrix4(matrix4);
  }

  /** three.js `Matrix3.extractBasis` — basis vectors from the three columns. */
  extractBasis(): [Vector3, Vector3, Vector3] {
    const m = this.elements;
    return [
      new Vector3(m[0], m[1], m[2]),
      new Vector3(m[3], m[4], m[5]),
      new Vector3(m[6], m[7], m[8])
    ];
  }

  transpose(): Matrix3 {
    const m = this.elements;
    return new Matrix3([
      m[0], m[3], m[6],
      m[1], m[4], m[7],
      m[2], m[5], m[8]
    ]);
  }

  toArray(offset = 0, array: number[] = []): number[] {
    const m = this.elements;
    for (let i = 0; i < 9; i += 1) array[offset + i] = m[i]!;
    return array;
  }

  static fromArray(array: ArrayLike<number>, offset = 0): Matrix3 {
    const e = new Array<number>(9);
    for (let i = 0; i < 9; i += 1) e[i] = array[offset + i]!;
    return new Matrix3(e as unknown as Matrix3Elements);
  }
}
