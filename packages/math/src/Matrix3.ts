export class Matrix3 {
  readonly elements: readonly [number, number, number, number, number, number, number, number, number];

  constructor(elements?: readonly [number, number, number, number, number, number, number, number, number]) {
    this.elements = elements ? [...elements] as typeof this.elements : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }

  determinant(): number {
    const m = this.elements;
    return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[3] * (m[1] * m[8] - m[2] * m[7]) + m[6] * (m[1] * m[5] - m[2] * m[4]);
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
    return new Matrix3(out as unknown as Matrix3["elements"]);
  }

  transpose(): Matrix3 {
    const m = this.elements;
    return new Matrix3([
      m[0], m[3], m[6],
      m[1], m[4], m[7],
      m[2], m[5], m[8]
    ]);
  }
}
