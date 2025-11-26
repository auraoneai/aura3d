import { describe, it, expect } from 'vitest';
import { Matrix3 } from '../../../math/Matrix3';
import { MathConstants } from '../../../math/MathConstants';

const EPSILON = MathConstants.EPSILON;

describe('Matrix3', () => {
  describe('constructor', () => {
    it('creates identity matrix by default', () => {
      const m = new Matrix3();
      expect(m.elements[0]).toBe(1); // m00
      expect(m.elements[1]).toBe(0); // m10
      expect(m.elements[2]).toBe(0); // m20
      expect(m.elements[3]).toBe(0); // m01
      expect(m.elements[4]).toBe(1); // m11
      expect(m.elements[5]).toBe(0); // m21
      expect(m.elements[6]).toBe(0); // m02
      expect(m.elements[7]).toBe(0); // m12
      expect(m.elements[8]).toBe(1); // m22
    });

    it('creates identity matrix with correct column-major storage', () => {
      const m = new Matrix3();
      // Column 0
      expect(m.elements[0]).toBe(1);
      expect(m.elements[1]).toBe(0);
      expect(m.elements[2]).toBe(0);
      // Column 1
      expect(m.elements[3]).toBe(0);
      expect(m.elements[4]).toBe(1);
      expect(m.elements[5]).toBe(0);
      // Column 2
      expect(m.elements[6]).toBe(0);
      expect(m.elements[7]).toBe(0);
      expect(m.elements[8]).toBe(1);
    });
  });

  describe('set() - row-major input', () => {
    it('creates from row-major array', () => {
      const m = new Matrix3();
      m.set(
        1, 2, 3,
        4, 5, 6,
        7, 8, 9
      );
      // Verify stored in column-major order
      expect(m.elements[0]).toBe(1);
      expect(m.elements[1]).toBe(4);
      expect(m.elements[2]).toBe(7);
      expect(m.elements[3]).toBe(2);
      expect(m.elements[4]).toBe(5);
      expect(m.elements[5]).toBe(8);
      expect(m.elements[6]).toBe(3);
      expect(m.elements[7]).toBe(6);
      expect(m.elements[8]).toBe(9);
    });

    it('throws error with incorrect number of values', () => {
      const m = new Matrix3();
      expect(() => m.set(1, 2, 3, 4, 5, 6, 7, 8)).toThrow();
      expect(() => m.set(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)).toThrow();
    });

    it('returns this for chaining', () => {
      const m = new Matrix3();
      const result = m.set(1, 0, 0, 0, 1, 0, 0, 0, 1);
      expect(result).toBe(m);
    });
  });

  describe('static factories', () => {
    it('Matrix3.identity() creates identity', () => {
      const m = Matrix3.identity();
      expect(m.equals(new Matrix3())).toBe(true);
      expect(m.determinant()).toBeCloseTo(1, 10);
    });

    it('Matrix3.rotation() creates 2D rotation', () => {
      const angle = Math.PI / 4; // 45 degrees
      const m = Matrix3.rotation(angle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      expect(m.elements[0]).toBeCloseTo(cos, 10);
      expect(m.elements[1]).toBeCloseTo(sin, 10);
      expect(m.elements[3]).toBeCloseTo(-sin, 10);
      expect(m.elements[4]).toBeCloseTo(cos, 10);
      expect(m.elements[8]).toBe(1);
    });

    it('Matrix3.rotation() creates 90 degree rotation correctly', () => {
      const m = Matrix3.rotation(Math.PI / 2);
      expect(m.elements[0]).toBeCloseTo(0, 10);
      expect(m.elements[1]).toBeCloseTo(1, 10);
      expect(m.elements[3]).toBeCloseTo(-1, 10);
      expect(m.elements[4]).toBeCloseTo(0, 10);
    });

    it('Matrix3.scale() creates scale matrix', () => {
      const m = Matrix3.scale(2, 3);
      expect(m.elements[0]).toBe(2);
      expect(m.elements[4]).toBe(3);
      expect(m.elements[8]).toBe(1);
      expect(m.elements[1]).toBe(0);
      expect(m.elements[3]).toBe(0);
    });

    it('Matrix3.translation() creates translation', () => {
      const m = Matrix3.translation(5, 7);
      expect(m.elements[6]).toBe(5); // tx in column 2
      expect(m.elements[7]).toBe(7); // ty in column 2
      expect(m.elements[0]).toBe(1);
      expect(m.elements[4]).toBe(1);
      expect(m.elements[8]).toBe(1);
    });

    it('Matrix3.fromRotationX() creates X-axis rotation', () => {
      const angle = Math.PI / 3;
      const m = Matrix3.fromRotationX(angle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      expect(m.elements[0]).toBe(1);
      expect(m.elements[4]).toBeCloseTo(cos, 10);
      expect(m.elements[5]).toBeCloseTo(sin, 10);
      expect(m.elements[7]).toBeCloseTo(-sin, 10);
      expect(m.elements[8]).toBeCloseTo(cos, 10);
    });

    it('Matrix3.fromRotationY() creates Y-axis rotation', () => {
      const angle = Math.PI / 3;
      const m = Matrix3.fromRotationY(angle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      expect(m.elements[0]).toBeCloseTo(cos, 10);
      expect(m.elements[2]).toBeCloseTo(-sin, 10);
      expect(m.elements[4]).toBe(1);
      expect(m.elements[6]).toBeCloseTo(sin, 10);
      expect(m.elements[8]).toBeCloseTo(cos, 10);
    });

    it('Matrix3.fromRotationZ() creates Z-axis rotation', () => {
      const angle = Math.PI / 3;
      const m = Matrix3.fromRotationZ(angle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      expect(m.elements[0]).toBeCloseTo(cos, 10);
      expect(m.elements[1]).toBeCloseTo(sin, 10);
      expect(m.elements[3]).toBeCloseTo(-sin, 10);
      expect(m.elements[4]).toBeCloseTo(cos, 10);
      expect(m.elements[8]).toBe(1);
    });
  });

  describe('operations', () => {
    it('multiply() combines matrices', () => {
      const m1 = Matrix3.scale(2, 3);
      const m2 = Matrix3.translation(5, 7);
      const result = m1.multiply(m2);

      // Scale should affect translation
      expect(result.elements[6]).toBe(10); // 2 * 5
      expect(result.elements[7]).toBe(21); // 3 * 7
    });

    it('multiply() preserves original matrices', () => {
      const m1 = Matrix3.rotation(Math.PI / 4);
      const m2 = Matrix3.scale(2, 2);
      const original1 = m1.clone();
      const original2 = m2.clone();

      m1.multiply(m2);

      expect(m1.equals(original1)).toBe(true);
      expect(m2.equals(original2)).toBe(true);
    });

    it('multiplyInPlace() modifies this matrix', () => {
      const m1 = Matrix3.scale(2, 3);
      const m2 = Matrix3.translation(5, 7);
      const original = m1.clone();

      m1.multiplyInPlace(m2);

      expect(m1.equals(original)).toBe(false);
      expect(m1.elements[6]).toBe(10);
    });

    it('multiply() is associative: (A * B) * C = A * (B * C)', () => {
      const A = Matrix3.rotation(0.5);
      const B = Matrix3.scale(2, 3);
      const C = Matrix3.translation(4, 5);

      const left = A.multiply(B).multiply(C);
      const right = A.multiply(B.multiply(C));

      expect(left.equals(right, 1e-10)).toBe(true);
    });

    it('multiply() identity has no effect', () => {
      const m = Matrix3.rotation(Math.PI / 4);
      const identity = Matrix3.identity();

      const result1 = m.multiply(identity);
      const result2 = identity.multiply(m);

      expect(result1.equals(m, EPSILON)).toBe(true);
      expect(result2.equals(m, EPSILON)).toBe(true);
    });

    it('transpose() swaps rows/columns', () => {
      const m = new Matrix3();
      m.set(
        1, 2, 3,
        4, 5, 6,
        7, 8, 9
      );
      const t = m.transpose();

      // Row 0 becomes column 0
      expect(t.elements[0]).toBe(1);
      expect(t.elements[1]).toBe(2);
      expect(t.elements[2]).toBe(3);
      // Row 1 becomes column 1
      expect(t.elements[3]).toBe(4);
      expect(t.elements[4]).toBe(5);
      expect(t.elements[5]).toBe(6);
      // Row 2 becomes column 2
      expect(t.elements[6]).toBe(7);
      expect(t.elements[7]).toBe(8);
      expect(t.elements[8]).toBe(9);
    });

    it('transpose() of transpose is original', () => {
      const m = new Matrix3().set(1, 2, 3, 4, 5, 6, 7, 8, 9);
      const tt = m.transpose().transpose();
      expect(tt.equals(m)).toBe(true);
    });

    it('transposeInPlace() modifies matrix', () => {
      const m = new Matrix3().set(1, 2, 3, 4, 5, 6, 7, 8, 9);
      const original = m.clone();
      m.transposeInPlace();

      expect(m.equals(original)).toBe(false);
      expect(m.transpose().equals(original)).toBe(true);
    });

    it('determinant() computes determinant', () => {
      const identity = Matrix3.identity();
      expect(identity.determinant()).toBeCloseTo(1, 10);

      const scale = Matrix3.scale(2, 3);
      expect(scale.determinant()).toBeCloseTo(6, 10);

      const rotation = Matrix3.rotation(Math.PI / 4);
      expect(rotation.determinant()).toBeCloseTo(1, 10);
    });

    it('determinant() detects singular matrix', () => {
      const singular = new Matrix3();
      singular.set(
        1, 2, 3,
        2, 4, 6,
        3, 6, 9
      );
      expect(Math.abs(singular.determinant())).toBeLessThan(EPSILON);
    });

    it('invert() inverts matrix', () => {
      const m = Matrix3.scale(2, 3);
      const inv = m.invert();

      expect(inv).not.toBeNull();
      if (inv) {
        expect(inv.elements[0]).toBeCloseTo(0.5, 10);
        expect(inv.elements[4]).toBeCloseTo(1/3, 10);
      }
    });

    it('invert() * matrix = identity', () => {
      const m = Matrix3.rotation(0.7).multiply(Matrix3.scale(2, 3));
      const inv = m.invert();

      expect(inv).not.toBeNull();
      if (inv) {
        const identity = m.multiply(inv);
        expect(identity.equals(Matrix3.identity(), 1e-10)).toBe(true);
      }
    });

    it('invert() returns null for singular matrix', () => {
      const singular = new Matrix3();
      singular.set(
        1, 2, 3,
        2, 4, 6,
        0, 0, 0
      );
      expect(singular.invert()).toBeNull();
    });

    it('invertInPlace() returns null for singular matrix', () => {
      const singular = new Matrix3();
      singular.set(
        1, 2, 3,
        2, 4, 6,
        0, 0, 0
      );
      expect(singular.invertInPlace()).toBeNull();
    });

    it('multiplyScalar() scales all elements', () => {
      const m = new Matrix3().set(
        1, 2, 3,
        4, 5, 6,
        7, 8, 9
      );
      const scaled = m.multiplyScalar(2);

      for (let i = 0; i < 9; i++) {
        expect(scaled.elements[i]).toBeCloseTo(m.elements[i] * 2, 10);
      }
    });
  });

  describe('static operations', () => {
    it('Matrix3.add() performs element-wise addition', () => {
      const m1 = new Matrix3().set(1, 2, 3, 4, 5, 6, 7, 8, 9);
      const m2 = new Matrix3().set(9, 8, 7, 6, 5, 4, 3, 2, 1);
      const sum = Matrix3.add(m1, m2);

      for (let i = 0; i < 9; i++) {
        expect(sum.elements[i]).toBe(m1.elements[i] + m2.elements[i]);
      }
    });

    it('Matrix3.subtract() performs element-wise subtraction', () => {
      const m1 = new Matrix3().set(9, 8, 7, 6, 5, 4, 3, 2, 1);
      const m2 = new Matrix3().set(1, 2, 3, 4, 5, 6, 7, 8, 9);
      const diff = Matrix3.subtract(m1, m2);

      for (let i = 0; i < 9; i++) {
        expect(diff.elements[i]).toBe(m1.elements[i] - m2.elements[i]);
      }
    });

    it('Matrix3.multiplyScalar() scales matrix', () => {
      const m = new Matrix3().set(1, 2, 3, 4, 5, 6, 7, 8, 9);
      const scaled = Matrix3.multiplyScalar(m, 3);

      for (let i = 0; i < 9; i++) {
        expect(scaled.elements[i]).toBe(m.elements[i] * 3);
      }
    });

    it('Matrix3.multiply() multiplies two matrices', () => {
      const m1 = Matrix3.rotation(Math.PI / 6);
      const m2 = Matrix3.scale(2, 3);
      const result1 = Matrix3.multiply(m1, m2);
      const result2 = m1.multiply(m2);

      expect(result1.equals(result2)).toBe(true);
    });
  });

  describe('array conversions', () => {
    it('toArray() returns column-major array', () => {
      const m = new Matrix3().set(
        1, 2, 3,
        4, 5, 6,
        7, 8, 9
      );
      const arr = m.toArray();

      expect(arr).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
    });

    it('fromArray() sets from column-major array', () => {
      const m = new Matrix3();
      m.fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);

      expect(m.elements[0]).toBe(1);
      expect(m.elements[4]).toBe(5);
      expect(m.elements[8]).toBe(9);
    });

    it('fromArray() with offset works correctly', () => {
      const m = new Matrix3();
      m.fromArray([99, 98, 1, 2, 3, 4, 5, 6, 7, 8, 9], 2);

      expect(m.elements[0]).toBe(1);
      expect(m.elements[8]).toBe(9);
    });

    it('fromArray() roundtrip preserves matrix', () => {
      const original = new Matrix3().set(1, 2, 3, 4, 5, 6, 7, 8, 9);
      const m = new Matrix3();
      m.fromArray(original.toArray());

      expect(m.equals(original)).toBe(true);
    });
  });

  describe('clone and copy', () => {
    it('clone() creates independent copy', () => {
      const m1 = Matrix3.rotation(0.5);
      const m2 = m1.clone();

      expect(m2.equals(m1)).toBe(true);

      m2.identity();
      expect(m2.equals(m1)).toBe(false);
    });

    it('copy() copies values', () => {
      const m1 = Matrix3.scale(2, 3);
      const m2 = new Matrix3();
      m2.copy(m1);

      expect(m2.equals(m1)).toBe(true);
    });

    it('copy() returns this for chaining', () => {
      const m1 = Matrix3.scale(2, 3);
      const m2 = new Matrix3();
      const result = m2.copy(m1);

      expect(result).toBe(m2);
    });
  });

  describe('equals', () => {
    it('equals() compares matrices within epsilon', () => {
      const m1 = Matrix3.rotation(Math.PI / 4);
      const m2 = m1.clone();

      expect(m1.equals(m2)).toBe(true);
    });

    it('equals() handles small differences', () => {
      const m1 = Matrix3.identity();
      const m2 = Matrix3.identity();
      m2.elements[0] += EPSILON * 0.5;

      expect(m1.equals(m2)).toBe(true);

      m2.elements[0] = 1 + EPSILON * 2;
      expect(m1.equals(m2)).toBe(false);
    });

    it('equals() respects custom epsilon', () => {
      const m1 = Matrix3.identity();
      const m2 = Matrix3.identity();
      m2.elements[0] = 1.01;

      expect(m1.equals(m2, 0.1)).toBe(true);
      expect(m1.equals(m2, 0.001)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles singular matrix inversion', () => {
      const singular = new Matrix3().set(
        1, 0, 0,
        0, 0, 0,
        0, 0, 0
      );
      expect(singular.invert()).toBeNull();
      expect(singular.invertInPlace()).toBeNull();
    });

    it('handles identity multiplication', () => {
      const m = Matrix3.rotation(0.7);
      const identity = Matrix3.identity();

      const r1 = m.multiply(identity);
      const r2 = identity.multiply(m);

      expect(r1.equals(m, EPSILON)).toBe(true);
      expect(r2.equals(m, EPSILON)).toBe(true);
    });

    it('handles zero determinant', () => {
      const m = new Matrix3().set(
        1, 2, 3,
        2, 4, 6,
        3, 6, 9
      );
      expect(Math.abs(m.determinant())).toBeLessThan(EPSILON);
      expect(m.invert()).toBeNull();
    });

    it('handles rotation composition', () => {
      const r1 = Matrix3.rotation(Math.PI / 4);
      const r2 = Matrix3.rotation(Math.PI / 4);
      const combined = r1.multiply(r2);
      const expected = Matrix3.rotation(Math.PI / 2);

      expect(combined.equals(expected, 1e-10)).toBe(true);
    });

    it('rotation matrix has determinant 1', () => {
      for (let angle = 0; angle < Math.PI * 2; angle += 0.5) {
        const m = Matrix3.rotation(angle);
        expect(m.determinant()).toBeCloseTo(1, 10);
      }
    });

    it('rotation matrix inverse equals transpose', () => {
      const m = Matrix3.rotation(0.7);
      const inv = m.invert();
      const trans = m.transpose();

      expect(inv).not.toBeNull();
      if (inv) {
        expect(inv.equals(trans, 1e-10)).toBe(true);
      }
    });
  });

  describe('precision tests', () => {
    it('accumulated rotations maintain orthogonality', () => {
      let m = Matrix3.identity();
      const step = Math.PI / 180; // 1 degree

      for (let i = 0; i < 360; i++) {
        m = m.multiply(Matrix3.rotation(step));
      }

      // After 360 degrees, should be back to identity (within tolerance)
      expect(m.equals(Matrix3.identity(), 1e-6)).toBe(true);
    });

    it('accumulated scales maintain determinant relationship', () => {
      let m = Matrix3.identity();

      for (let i = 0; i < 10; i++) {
        m = m.multiply(Matrix3.scale(1.1, 1.2));
      }

      const expectedDet = Math.pow(1.1 * 1.2, 10);
      expect(m.determinant()).toBeCloseTo(expectedDet, 5);
    });

    it('invert-multiply-invert returns original', () => {
      const m = Matrix3.rotation(0.7).multiply(Matrix3.scale(2, 3));
      const inv = m.invert();

      expect(inv).not.toBeNull();
      if (inv) {
        const invInv = inv.invert();
        expect(invInv).not.toBeNull();
        if (invInv) {
          expect(invInv.equals(m, 1e-10)).toBe(true);
        }
      }
    });
  });
});
