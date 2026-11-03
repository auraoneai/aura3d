import { Matrix3 as ImmutableMatrix3 } from "../../Matrix3.js";

/** A column-major 3×3 matrix acting on column vectors. */
interface ElementsLike {
  readonly elements: ArrayLike<number>;
}

interface Vec2Like {
  readonly x: number;
  readonly y: number;
}

interface Vec3ColumnTarget {
  setFromMatrix3Column(m: Matrix3, index: number): unknown;
}

// Keep an independent binary exponent when ordinary elimination would
// overflow or underflow an intermediate. The mantissa remains an ordinary
// double, so this extends the range rather than promising extra precision.
type ScaledNumber = readonly [mantissa: number, exponent: number];

function scaledNumber(value: number, exponent = 0): ScaledNumber {
  if (value === 0) return [0, 0];
  const shift = Math.max(-1074, Math.min(1023, Math.floor(Math.log2(Math.abs(value)))));
  let mantissa = value / 2 ** shift;
  let adjustedExponent = exponent + shift;
  if (Math.abs(mantissa) < 1) { mantissa *= 2; adjustedExponent--; }
  if (Math.abs(mantissa) >= 2) { mantissa /= 2; adjustedExponent++; }
  return [mantissa, adjustedExponent];
}

function scaledProduct(a: ScaledNumber, b: ScaledNumber): ScaledNumber {
  return scaledNumber(a[0] * b[0], a[1] + b[1]);
}

function scaledDifference(a: ScaledNumber, b: ScaledNumber): ScaledNumber {
  if (a[0] === 0) return [-b[0], b[1]];
  if (b[0] === 0) return a;
  const exponent = Math.max(a[1], b[1]);
  return scaledNumber(a[0] * 2 ** (a[1] - exponent) - b[0] * 2 ** (b[1] - exponent), exponent);
}

function unscale([mantissa, exponent]: ScaledNumber): number {
  if (mantissa === 0) return 0;
  // Split the factor for subnormal results so 2**exponent is not rounded
  // to zero before the mantissa participates in the final rounding.
  if (exponent < -1022) return (mantissa * 2 ** (exponent + 52)) * 2 ** -52;
  return mantissa * 2 ** exponent;
}

function invertScaled3(elements: readonly number[]): number[] | null {
  // Check the uneliminated determinant too: dividing a pivot can introduce a
  // rounding residual for rows that were exactly proportional in the input.
  const n = elements.slice(0, 9).map(value => scaledNumber(value));
  const minor0 = scaledDifference(scaledProduct(n[4], n[8]), scaledProduct(n[7], n[5]));
  const minor1 = scaledDifference(scaledProduct(n[1], n[8]), scaledProduct(n[7], n[2]));
  const minor2 = scaledDifference(scaledProduct(n[1], n[5]), scaledProduct(n[4], n[2]));
  const firstTerms = scaledDifference(scaledProduct(n[0], minor0), scaledProduct(n[3], minor1));
  const lastTerm = scaledProduct(n[6], minor2);
  if (scaledDifference(firstTerms, [-lastTerm[0], lastTerm[1]])[0] === 0) return null;
  const rows = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 6 }, (_, col) => scaledNumber(col < 3 ? elements[col * 3 + row] : Number(col - 3 === row))),
  );
  const rowScales = Array.from({ length: 3 }, (_, row) => {
    const max = Math.max(Math.abs(elements[row]), Math.abs(elements[3 + row]), Math.abs(elements[6 + row]));
    return max === 0 ? -Infinity : Math.log2(max);
  });
  for (let col = 0; col < 3; col++) {
    const score = (row: number): number => rows[row][col][0] === 0 ? -Infinity
      : Math.log2(Math.abs(rows[row][col][0])) + rows[row][col][1] - rowScales[row];
    let pivotRow = col;
    for (let row = col + 1; row < 3; row++) if (score(row) > score(pivotRow)) pivotRow = row;
    if (rows[pivotRow][col][0] === 0) return null;
    [rows[col], rows[pivotRow]] = [rows[pivotRow], rows[col]];
    [rowScales[col], rowScales[pivotRow]] = [rowScales[pivotRow], rowScales[col]];
    const pivot = rows[col][col];
    for (let c = 0; c < 6; c++) {
      const value = rows[col][c];
      rows[col][c] = scaledNumber(value[0] / pivot[0], value[1] - pivot[1]);
    }
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const factor = rows[row][col];
      if (factor[0] === 0) continue;
      for (let c = 0; c < 6; c++) rows[row][c] = scaledDifference(rows[row][c], scaledProduct(factor, rows[col][c]));
    }
  }
  return Array.from({ length: 9 }, (_, index) => unscale(rows[index % 3][3 + Math.floor(index / 3)]));
}

export class Matrix3 {
  readonly isMatrix3 = true;
  elements: number[];

  constructor(
    n11 = 1, n12 = 0, n13 = 0,
    n21 = 0, n22 = 1, n23 = 0,
    n31 = 0, n32 = 0, n33 = 1,
  ) {
    this.elements = [n11, n21, n31, n12, n22, n32, n13, n23, n33];
  }

  fromImmutable(m: ElementsLike): this {
    return this.copy(m);
  }

  toImmutable(): ImmutableMatrix3 {
    const e = this.elements;
    return new ImmutableMatrix3([e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7], e[8]]);
  }

  set(
    n11: number, n12: number, n13: number,
    n21: number, n22: number, n23: number,
    n31: number, n32: number, n33: number,
  ): this {
    const e = this.elements;
    e[0] = n11; e[3] = n12; e[6] = n13;
    e[1] = n21; e[4] = n22; e[7] = n23;
    e[2] = n31; e[5] = n32; e[8] = n33;
    return this;
  }

  identity(): this {
    return this.set(1, 0, 0, 0, 1, 0, 0, 0, 1);
  }

  copy(m: ElementsLike): this {
    return this.fromArray(m.elements);
  }

  extractBasis(xAxis: Vec3ColumnTarget, yAxis: Vec3ColumnTarget, zAxis: Vec3ColumnTarget): this {
    const snapshot = this.clone();
    xAxis.setFromMatrix3Column(snapshot, 0);
    yAxis.setFromMatrix3Column(snapshot, 1);
    zAxis.setFromMatrix3Column(snapshot, 2);
    return this;
  }

  setFromMatrix4(m: ElementsLike): this {
    const e = m.elements;
    return this.set(e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]);
  }

  multiply(m: ElementsLike): this {
    return this.multiplyMatrices(this, m);
  }

  premultiply(m: ElementsLike): this {
    return this.multiplyMatrices(m, this);
  }

  multiplyMatrices(a: ElementsLike, b: ElementsLike): this {
    // Snapshot both inputs: either may share the receiver's elements array.
    const left = Array.from(a.elements).slice(0, 9);
    const right = Array.from(b.elements).slice(0, 9);
    const out = this.elements;
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        let sum = 0;
        for (let k = 0; k < 3; k++) sum += left[k * 3 + row] * right[col * 3 + k];
        out[col * 3 + row] = sum;
      }
    }
    return this;
  }

  multiplyScalar(s: number): this {
    for (let i = 0; i < 9; i++) this.elements[i] *= s;
    return this;
  }

  determinant(): number {
    const e = this.elements;
    return e[0] * (e[4] * e[8] - e[7] * e[5])
      - e[3] * (e[1] * e[8] - e[7] * e[2])
      + e[6] * (e[1] * e[5] - e[4] * e[2]);
  }

  /** Singular matrices have no inverse and are replaced by the zero matrix. */
  invert(): this {
    const e = this.elements;
    const finiteInput = e.slice(0, 9).every(Number.isFinite);
    const retryWithScaledNumbers = (): this => {
      const result = invertScaled3(e);
      return result ? this.fromArray(result) : this.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    };
    // Row-scaled pivoting avoids calculating a cubic determinant, which can
    // overflow or underflow even when every entry of the inverse is finite.
    const rows = Array.from({ length: 3 }, (_, row) =>
      Array.from({ length: 6 }, (_, col) => col < 3 ? e[col * 3 + row] : Number(col - 3 === row)),
    );
    const scales = rows.map(row => Math.max(Math.abs(row[0]), Math.abs(row[1]), Math.abs(row[2])));
    for (let col = 0; col < 3; col++) {
      let pivotRow = col;
      const pivotScore = (row: number): number => rows[row][col] === 0
        ? -Infinity
        : Math.log(Math.abs(rows[row][col])) - Math.log(scales[row]);
      // Log ratios preserve the ordering even if |pivot| / scale underflows.
      let bestRatio = pivotScore(col);
      for (let row = col + 1; row < 3; row++) {
        const ratio = pivotScore(row);
        if (ratio > bestRatio) { pivotRow = row; bestRatio = ratio; }
      }
      if (rows[pivotRow][col] === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
      [rows[col], rows[pivotRow]] = [rows[pivotRow], rows[col]];
      [scales[col], scales[pivotRow]] = [scales[pivotRow], scales[col]];
      const pivot = rows[col][col];
      for (let c = 0; c < 6; c++) {
        const previous = rows[col][c];
        const quotient = previous / pivot;
        if (finiteInput && (!Number.isFinite(quotient) || (previous !== 0 && quotient === 0))) return retryWithScaledNumbers();
        rows[col][c] = quotient;
      }
      for (let row = 0; row < 3; row++) {
        if (row === col) continue;
        const factor = rows[row][col];
        if (factor === 0) continue;
        for (let c = 0; c < 6; c++) {
          const multiplicand = rows[col][c];
          const product = factor * multiplicand;
          const difference = rows[row][c] - product;
          if (finiteInput && (!Number.isFinite(difference) || (product === 0 && multiplicand !== 0))) return retryWithScaledNumbers();
          rows[row][c] = difference;
        }
      }
    }
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) e[col * 3 + row] = rows[row][col + 3];
    }
    return this;
  }

  transpose(): this {
    const e = this.elements;
    [e[1], e[3]] = [e[3], e[1]];
    [e[2], e[6]] = [e[6], e[2]];
    [e[5], e[7]] = [e[7], e[5]];
    return this;
  }

  getNormalMatrix(matrix4: ElementsLike): this {
    return this.setFromMatrix4(matrix4).invert().transpose();
  }

  transposeIntoArray(r: number[]): this {
    const e = this.elements.slice(0, 9);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) r[row * 3 + col] = e[col * 3 + row];
    }
    return this;
  }

  /** Maps UVs by scaling and then rotating around the supplied center. */
  setUvTransform(tx: number, ty: number, sx: number, sy: number, rotation: number, cx: number, cy: number): this {
    const c = Math.cos(rotation), s = Math.sin(rotation);
    const a = c * sx, b = -s * sy, d = s * sx, e = c * sy;
    return this.set(a, b, cx + tx - a * cx - b * cy, d, e, cy + ty - d * cx - e * cy, 0, 0, 1);
  }

  /** Apply a 2D scale after the transform already in this matrix. */
  scale(sx: number, sy: number): this {
    return this.premultiply(new Matrix3().makeScale(sx, sy));
  }

  /** Apply a counterclockwise 2D rotation after the current transform. */
  rotate(theta: number): this {
    return this.premultiply(new Matrix3().makeRotation(theta));
  }

  /** Apply a 2D translation after the transform already in this matrix. */
  translate(tx: number, ty: number): this {
    return this.premultiply(new Matrix3().makeTranslation(tx, ty));
  }

  makeTranslation(x: number | Vec2Like, y = 0): this {
    const tx = typeof x === "number" ? x : x.x;
    const ty = typeof x === "number" ? y : x.y;
    return this.set(1, 0, tx, 0, 1, ty, 0, 0, 1);
  }

  makeRotation(theta: number): this {
    const c = Math.cos(theta), s = Math.sin(theta);
    return this.set(c, -s, 0, s, c, 0, 0, 0, 1);
  }

  makeScale(x: number, y: number): this {
    return this.set(x, 0, 0, 0, y, 0, 0, 0, 1);
  }

  equals(matrix: ElementsLike): boolean {
    const e = matrix.elements;
    for (let i = 0; i < 9; i++) if (this.elements[i] !== e[i]) return false;
    return true;
  }

  fromArray(array: ArrayLike<number>, offset = 0): this {
    const copy = Array.from({ length: 9 }, (_, i) => array[offset + i]);
    for (let i = 0; i < 9; i++) this.elements[i] = copy[i];
    return this;
  }

  toArray(array: number[] = [], offset = 0): number[] {
    const copy = this.elements.slice(0, 9);
    for (let i = 0; i < 9; i++) array[offset + i] = copy[i];
    return array;
  }

  clone(): this {
    const Constructor = this.constructor as new () => this;
    return new Constructor().copy(this);
  }
}
