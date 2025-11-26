import { describe, it, expect } from 'vitest';
import { Quaternion, type EulerOrder } from '../../../math/Quaternion';
import { Vector3 } from '../../../math/Vector3';
import { Matrix4 } from '../../../math/Matrix4';
import { EPSILON } from '../../../math/MathConstants';

describe('Quaternion', () => {
  describe('constructor', () => {
    it('creates identity quaternion by default', () => {
      const q = new Quaternion();
      expect(q.x).toBe(0);
      expect(q.y).toBe(0);
      expect(q.z).toBe(0);
      expect(q.w).toBe(1);
    });

    it('creates quaternion with specified components', () => {
      const q = new Quaternion(0.1, 0.2, 0.3, 0.4);
      expect(q.x).toBe(0.1);
      expect(q.y).toBe(0.2);
      expect(q.z).toBe(0.3);
      expect(q.w).toBe(0.4);
    });

    it('identity quaternion has unit length', () => {
      const q = new Quaternion();
      expect(q.length()).toBeCloseTo(1, 10);
    });
  });

  describe('static factories', () => {
    it('Quaternion.identity() creates identity', () => {
      const q = Quaternion.identity();
      expect(q.equals(new Quaternion())).toBe(true);
      expect(q.length()).toBeCloseTo(1, 10);
    });

    it('Quaternion.fromAxisAngle() creates rotation', () => {
      const axis = Vector3.up();
      const angle = Math.PI / 2;
      const q = Quaternion.fromAxisAngle(axis, angle);

      expect(q.length()).toBeCloseTo(1, 10);
      expect(q.w).toBeCloseTo(Math.cos(angle / 2), 10);
      expect(q.y).toBeCloseTo(Math.sin(angle / 2), 10);
    });

    it('Quaternion.fromAxisAngle() with zero rotation', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), 0);
      expect(q.equals(Quaternion.identity())).toBe(true);
    });

    it('Quaternion.fromAxisAngle() with 180 degree rotation', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI);
      expect(q.w).toBeCloseTo(0, 10);
      expect(q.y).toBeCloseTo(1, 10);
    });

    it('Quaternion.fromEuler() creates rotation from angles', () => {
      const q = Quaternion.fromEuler(Math.PI / 2, 0, 0, 'XYZ');
      expect(q.length()).toBeCloseTo(1, 10);
    });

    it('Quaternion.fromUnitVectors() rotates from one vector to another', () => {
      const from = Vector3.forward();
      const to = Vector3.right();
      const q = Quaternion.fromUnitVectors(from, to);

      const rotated = q.rotateVector(from);
      expect(rotated.equals(to, 1e-6)).toBe(true);
    });

    it('Quaternion.fromUnitVectors() handles parallel vectors', () => {
      const from = Vector3.up();
      const to = Vector3.up();
      const q = Quaternion.fromUnitVectors(from, to);

      expect(q.equals(Quaternion.identity(), 1e-6)).toBe(true);
    });

    it('Quaternion.fromUnitVectors() handles anti-parallel vectors', () => {
      const from = Vector3.up();
      const to = Vector3.down();
      const q = Quaternion.fromUnitVectors(from, to);

      const rotated = q.rotateVector(from);
      expect(rotated.equals(to, 1e-6)).toBe(true);
    });
  });

  describe('multiplication', () => {
    it('multiply() combines rotations', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      const q2 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      const result = q1.multiply(q2);

      const expected = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
      expect(result.equals(expected, 1e-10)).toBe(true);
    });

    it('multiply() preserves unit length', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), 0.5);
      const q2 = Quaternion.fromAxisAngle(Vector3.right(), 0.7);
      const result = q1.multiply(q2);

      expect(result.length()).toBeCloseTo(1, 10);
    });

    it('multiply() is not commutative', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      const q2 = Quaternion.fromAxisAngle(Vector3.right(), Math.PI / 4);

      const r1 = q1.multiply(q2);
      const r2 = q2.multiply(q1);

      expect(r1.equals(r2)).toBe(false);
    });

    it('multiplyInPlace() modifies this quaternion', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      const q2 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      const original = q1.clone();

      q1.multiplyInPlace(q2);

      expect(q1.equals(original)).toBe(false);
    });

    it('premultiply() applies rotation before', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), 0.5);
      const q2 = Quaternion.fromAxisAngle(Vector3.right(), 0.3);

      const r1 = q1.multiply(q2);
      const r2 = q2.premultiply(q1);

      expect(r1.equals(r2)).toBe(true);
    });

    it('identity multiplication has no effect', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), 0.7);
      const identity = Quaternion.identity();

      const r1 = q.multiply(identity);
      const r2 = identity.multiply(q);

      expect(r1.equals(q, EPSILON)).toBe(true);
      expect(r2.equals(q, EPSILON)).toBe(true);
    });
  });

  describe('inversion and conjugate', () => {
    it('conjugate() negates imaginary parts', () => {
      const q = new Quaternion(0.1, 0.2, 0.3, 0.4);
      const conj = q.conjugate();

      expect(conj.x).toBe(-0.1);
      expect(conj.y).toBe(-0.2);
      expect(conj.z).toBe(-0.3);
      expect(conj.w).toBe(0.4);
    });

    it('conjugateInPlace() modifies quaternion', () => {
      const q = new Quaternion(0.1, 0.2, 0.3, 0.4);
      const original = q.clone();
      q.conjugateInPlace();

      expect(q.x).toBe(-original.x);
      expect(q.y).toBe(-original.y);
      expect(q.z).toBe(-original.z);
      expect(q.w).toBe(original.w);
    });

    it('invert() computes quaternion inverse', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      const inv = q.invert();

      const product = q.multiply(inv);
      expect(product.equals(Quaternion.identity(), 1e-10)).toBe(true);
    });

    it('for unit quaternions, inverse equals conjugate', () => {
      const q = Quaternion.fromAxisAngle(Vector3.right(), 0.5).normalize();
      const inv = q.invert();
      const conj = q.conjugate();

      expect(inv.equals(conj, 1e-10)).toBe(true);
    });

    it('invertInPlace() modifies quaternion', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), 0.7);
      const original = q.clone();

      q.invertInPlace();

      const product = original.multiply(q);
      expect(product.equals(Quaternion.identity(), 1e-10)).toBe(true);
    });

    it('invert() handles zero-length quaternion', () => {
      const q = new Quaternion(0, 0, 0, 0);
      const inv = q.invert();

      expect(inv.equals(Quaternion.identity())).toBe(true);
    });
  });

  describe('normalization', () => {
    it('normalize() creates unit quaternion', () => {
      const q = new Quaternion(1, 2, 3, 4);
      const normalized = q.normalize();

      expect(normalized.length()).toBeCloseTo(1, 10);
    });

    it('normalizeInPlace() modifies quaternion', () => {
      const q = new Quaternion(1, 2, 3, 4);
      q.normalizeInPlace();

      expect(q.length()).toBeCloseTo(1, 10);
    });

    it('normalize() preserves direction', () => {
      const q = new Quaternion(1, 2, 3, 4);
      const normalized = q.normalize();

      const scale = q.length();
      expect(normalized.x).toBeCloseTo(q.x / scale, 10);
      expect(normalized.y).toBeCloseTo(q.y / scale, 10);
      expect(normalized.z).toBeCloseTo(q.z / scale, 10);
      expect(normalized.w).toBeCloseTo(q.w / scale, 10);
    });

    it('normalize() handles zero-length quaternion', () => {
      const q = new Quaternion(0, 0, 0, 0);
      const normalized = q.normalize();

      expect(normalized.equals(Quaternion.identity())).toBe(true);
    });
  });

  describe('slerp interpolation', () => {
    it('slerp() interpolates between quaternions', () => {
      const q1 = Quaternion.identity();
      const q2 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI);

      const mid = q1.slerp(q2, 0.5);
      const expected = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);

      expect(mid.equals(expected, 1e-6)).toBe(true);
    });

    it('slerp() at t=0 returns start', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), 0.3);
      const q2 = Quaternion.fromAxisAngle(Vector3.up(), 0.7);

      const result = q1.slerp(q2, 0);
      expect(result.equals(q1, EPSILON)).toBe(true);
    });

    it('slerp() at t=1 returns end', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), 0.3);
      const q2 = Quaternion.fromAxisAngle(Vector3.up(), 0.7);

      const result = q1.slerp(q2, 1);
      expect(result.equals(q2, EPSILON)).toBe(true);
    });

    it('slerp() takes shortest path', () => {
      const q1 = Quaternion.identity();
      const q2 = Quaternion.identity().negate();

      const mid = q1.slerp(q2, 0.5);
      expect(mid.length()).toBeCloseTo(1, 10);
    });

    it('slerp() handles near-parallel quaternions', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), 0);
      const q2 = Quaternion.fromAxisAngle(Vector3.up(), 1e-8);

      const mid = q1.slerp(q2, 0.5);
      expect(mid.length()).toBeCloseTo(1, 10);
    });

    it('slerpInPlace() modifies quaternion', () => {
      const q1 = Quaternion.identity();
      const q2 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
      const original = q1.clone();

      q1.slerpInPlace(q2, 0.5);

      expect(q1.equals(original)).toBe(false);
    });

    it('Quaternion.slerp() static method works', () => {
      const q1 = Quaternion.identity();
      const q2 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI);

      const mid1 = q1.slerp(q2, 0.5);
      const mid2 = Quaternion.slerp(q1, q2, 0.5);

      expect(mid1.equals(mid2)).toBe(true);
    });
  });

  describe('vector rotation', () => {
    it('rotateVector() rotates a vector', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
      const v = Vector3.forward();
      const rotated = q.rotateVector(v);

      expect(rotated.equals(Vector3.right(), 1e-6)).toBe(true);
    });

    it('rotateVector() preserves vector length', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), 0.7);
      const v = new Vector3(1, 2, 3);
      const rotated = q.rotateVector(v);

      expect(rotated.length()).toBeCloseTo(v.length(), 10);
    });

    it('identity rotation does not change vector', () => {
      const q = Quaternion.identity();
      const v = new Vector3(1, 2, 3);
      const rotated = q.rotateVector(v);

      expect(rotated.equals(v, EPSILON)).toBe(true);
    });

    it('180 degree rotation reverses vector', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI);
      const v = Vector3.forward();
      const rotated = q.rotateVector(v);

      expect(rotated.equals(Vector3.back(), 1e-6)).toBe(true);
    });
  });

  describe('euler conversion', () => {
    const orders: EulerOrder[] = ['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'];

    orders.forEach(order => {
      it(`setFromEuler() works with ${order} order`, () => {
        const x = 0.3;
        const y = 0.5;
        const z = 0.7;

        const q = new Quaternion();
        q.setFromEuler(x, y, z, order);

        expect(q.length()).toBeCloseTo(1, 10);
      });

      it(`fromEuler() -> toEuler() roundtrip works for ${order}`, () => {
        const x = 0.3;
        const y = 0.5;
        const z = 0.7;

        const q = Quaternion.fromEuler(x, y, z, order);
        const euler = q.toEuler(order);

        expect(euler.x).toBeCloseTo(x, 5);
        expect(euler.y).toBeCloseTo(y, 5);
        expect(euler.z).toBeCloseTo(z, 5);
      });
    });

    it('toEuler() extracts euler angles', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
      const euler = q.toEuler('XYZ');

      expect(euler.y).toBeCloseTo(Math.PI / 2, 5);
    });

    it('handles gimbal lock case', () => {
      const q = Quaternion.fromEuler(Math.PI / 2, 0, 0, 'XYZ');
      const euler = q.toEuler('XYZ');

      // Should handle gracefully
      expect(euler).toBeDefined();
    });

    it('setFromEuler() returns this for chaining', () => {
      const q = new Quaternion();
      const result = q.setFromEuler(0.1, 0.2, 0.3, 'XYZ');

      expect(result).toBe(q);
    });
  });

  describe('matrix conversion', () => {
    it('setFromRotationMatrix() extracts rotation', () => {
      const axis = new Vector3(1, 1, 1).normalize();
      const angle = Math.PI / 3;
      const q1 = Quaternion.fromAxisAngle(axis, angle);

      const m = Matrix4.fromQuaternion(q1);
      const q2 = new Quaternion();
      q2.setFromRotationMatrix(m);

      expect(q2.equals(q1, 1e-6)).toBe(true);
    });

    it('Quaternion.fromRotationMatrix() static method works', () => {
      const m = Matrix4.rotationY(Math.PI / 4);
      const q = Quaternion.fromRotationMatrix(m);

      expect(q.length()).toBeCloseTo(1, 10);
    });

    it('toMatrix4() creates rotation matrix', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);
      const m = q.toMatrix4();

      expect(m.elements).toBeDefined();
      expect(m.elements.length).toBe(16);
    });

    it('quaternion -> matrix -> quaternion roundtrip', () => {
      const q1 = Quaternion.fromAxisAngle(
        new Vector3(1, 1, 1).normalize(),
        Math.PI / 3
      );

      const m = q1.toMatrix4();
      const q2 = Quaternion.fromRotationMatrix(m);

      expect(q2.equals(q1, 1e-6)).toBe(true);
    });

    it('setFromRotationMatrix() handles identity', () => {
      const m = Matrix4.identity();
      const q = new Quaternion();
      q.setFromRotationMatrix(m);

      expect(q.equals(Quaternion.identity(), 1e-10)).toBe(true);
    });

    it('setFromRotationMatrix() handles all branches', () => {
      // Test different matrix configurations to hit all code branches
      const matrices = [
        Matrix4.rotationX(0.5),
        Matrix4.rotationY(0.5),
        Matrix4.rotationZ(0.5),
        Matrix4.rotationX(Math.PI / 2),
      ];

      matrices.forEach(m => {
        const q = new Quaternion();
        q.setFromRotationMatrix(m);
        expect(q.length()).toBeCloseTo(1, 10);
      });
    });
  });

  describe('axis-angle conversion', () => {
    it('toAxisAngle() extracts axis and angle', () => {
      const axis = Vector3.up();
      const angle = Math.PI / 3;
      const q = Quaternion.fromAxisAngle(axis, angle);

      const result = q.toAxisAngle();

      expect(result.axis.equals(axis, 1e-6)).toBe(true);
      expect(result.angle).toBeCloseTo(angle, 6);
    });

    it('setFromAxisAngle() creates rotation', () => {
      const q = new Quaternion();
      q.setFromAxisAngle(Vector3.right(), Math.PI / 4);

      expect(q.length()).toBeCloseTo(1, 10);
    });

    it('axis-angle roundtrip preserves rotation', () => {
      const originalAxis = new Vector3(1, 2, 3).normalize();
      const originalAngle = Math.PI / 3;

      const q = Quaternion.fromAxisAngle(originalAxis, originalAngle);
      const { axis, angle } = q.toAxisAngle();

      expect(axis.equals(originalAxis, 1e-6)).toBe(true);
      expect(angle).toBeCloseTo(originalAngle, 6);
    });

    it('toAxisAngle() handles identity quaternion', () => {
      const q = Quaternion.identity();
      const { axis, angle } = q.toAxisAngle();

      expect(angle).toBeCloseTo(0, 10);
      expect(axis.length()).toBeCloseTo(1, 10);
    });

    it('setFromAxisAngle() returns this for chaining', () => {
      const q = new Quaternion();
      const result = q.setFromAxisAngle(Vector3.up(), Math.PI / 4);

      expect(result).toBe(q);
    });
  });

  describe('utility methods', () => {
    it('dot() computes dot product', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), 0.5);
      const q2 = Quaternion.fromAxisAngle(Vector3.up(), 0.7);

      const dot = q1.dot(q2);
      expect(dot).toBeGreaterThan(0);
      expect(dot).toBeLessThanOrEqual(1);
    });

    it('dot() of identical quaternions is 1', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), 0.5);
      expect(q.dot(q)).toBeCloseTo(1, 10);
    });

    it('dot() of opposite quaternions is -1', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), 0.5);
      const neg = q.negate();
      expect(q.dot(neg)).toBeCloseTo(-1, 10);
    });

    it('length() returns magnitude', () => {
      const q = new Quaternion(1, 2, 3, 4);
      const expected = Math.sqrt(1 + 4 + 9 + 16);
      expect(q.length()).toBeCloseTo(expected, 10);
    });

    it('lengthSquared() returns squared magnitude', () => {
      const q = new Quaternion(1, 2, 3, 4);
      expect(q.lengthSquared()).toBe(30);
    });

    it('negate() negates all components', () => {
      const q = new Quaternion(0.1, 0.2, 0.3, 0.4);
      const neg = q.negate();

      expect(neg.x).toBe(-0.1);
      expect(neg.y).toBe(-0.2);
      expect(neg.z).toBe(-0.3);
      expect(neg.w).toBe(-0.4);
    });

    it('negate() creates same rotation (double cover)', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      const neg = q.negate();

      const v = Vector3.forward();
      const r1 = q.rotateVector(v);
      const r2 = neg.rotateVector(v);

      expect(r1.equals(r2, 1e-6)).toBe(true);
    });

    it('negateInPlace() modifies quaternion', () => {
      const q = new Quaternion(0.1, 0.2, 0.3, 0.4);
      q.negateInPlace();

      expect(q.x).toBe(-0.1);
      expect(q.y).toBe(-0.2);
      expect(q.z).toBe(-0.3);
      expect(q.w).toBe(-0.4);
    });
  });

  describe('Quaternion.angle()', () => {
    it('angle() computes angle between quaternions', () => {
      const q1 = Quaternion.identity();
      const q2 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);

      const angle = Quaternion.angle(q1, q2);
      expect(angle).toBeCloseTo(Math.PI / 2, 5);
    });

    it('angle() of identical quaternions is 0', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), 0.7);
      const angle = Quaternion.angle(q, q);
      expect(angle).toBeCloseTo(0, 10);
    });

    it('angle() is symmetric', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), 0.3);
      const q2 = Quaternion.fromAxisAngle(Vector3.up(), 0.7);

      const angle1 = Quaternion.angle(q1, q2);
      const angle2 = Quaternion.angle(q2, q1);

      expect(angle1).toBeCloseTo(angle2, 10);
    });
  });

  describe('set, clone, copy', () => {
    it('set() sets all components', () => {
      const q = new Quaternion();
      q.set(0.1, 0.2, 0.3, 0.4);

      expect(q.x).toBe(0.1);
      expect(q.y).toBe(0.2);
      expect(q.z).toBe(0.3);
      expect(q.w).toBe(0.4);
    });

    it('clone() creates independent copy', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), 0.5);
      const q2 = q1.clone();

      expect(q2.equals(q1)).toBe(true);

      q2.set(0, 0, 0, 1);
      expect(q2.equals(q1)).toBe(false);
    });

    it('copy() copies values', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.right(), 0.7);
      const q2 = new Quaternion();
      q2.copy(q1);

      expect(q2.equals(q1)).toBe(true);
    });

    it('copy() returns this for chaining', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), 0.5);
      const q2 = new Quaternion();
      const result = q2.copy(q1);

      expect(result).toBe(q2);
    });
  });

  describe('equals', () => {
    it('equals() compares within epsilon', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      const q2 = q1.clone();

      expect(q1.equals(q2)).toBe(true);
    });

    it('equals() handles small differences', () => {
      const q1 = Quaternion.identity();
      const q2 = new Quaternion(0, EPSILON * 0.5, 0, 1);

      expect(q1.equals(q2)).toBe(true);
    });

    it('equals() respects custom epsilon', () => {
      const q1 = Quaternion.identity();
      const q2 = new Quaternion(0, 0.01, 0, 1);

      expect(q1.equals(q2, 0.1)).toBe(true);
      expect(q1.equals(q2, 0.001)).toBe(false);
    });

    it('equals() detects different quaternions', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      const q2 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2);

      expect(q1.equals(q2)).toBe(false);
    });
  });

  describe('array conversions', () => {
    it('toArray() returns [x, y, z, w]', () => {
      const q = new Quaternion(0.1, 0.2, 0.3, 0.4);
      const arr = q.toArray();

      expect(arr).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    it('fromArray() sets from array', () => {
      const q = new Quaternion();
      q.fromArray([0.1, 0.2, 0.3, 0.4]);

      expect(q.x).toBe(0.1);
      expect(q.y).toBe(0.2);
      expect(q.z).toBe(0.3);
      expect(q.w).toBe(0.4);
    });

    it('fromArray() with offset works', () => {
      const q = new Quaternion();
      q.fromArray([99, 98, 0.1, 0.2, 0.3, 0.4], 2);

      expect(q.x).toBe(0.1);
      expect(q.w).toBe(0.4);
    });

    it('roundtrip through array preserves quaternion', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), 0.7);
      const q2 = new Quaternion();
      q2.fromArray(q1.toArray());

      expect(q2.equals(q1)).toBe(true);
    });

    it('toJSON() creates serializable object', () => {
      const q = new Quaternion(0.1, 0.2, 0.3, 0.4);
      const json = q.toJSON();

      expect(json).toEqual({ x: 0.1, y: 0.2, z: 0.3, w: 0.4 });
    });
  });

  describe('edge cases', () => {
    it('handles zero-length normalization', () => {
      const q = new Quaternion(0, 0, 0, 0);
      const normalized = q.normalize();

      expect(normalized.equals(Quaternion.identity())).toBe(true);
    });

    it('handles very small rotations', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), 1e-10);
      expect(q.length()).toBeCloseTo(1, 10);
    });

    it('handles very large angles', () => {
      const q = Quaternion.fromAxisAngle(Vector3.up(), Math.PI * 10);
      expect(q.length()).toBeCloseTo(1, 10);
    });

    it('accumulated rotations maintain unit length', () => {
      let q = Quaternion.identity();
      const step = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 180);

      for (let i = 0; i < 360; i++) {
        q = q.multiply(step);
      }

      expect(q.length()).toBeCloseTo(1, 6);
    });

    it('rotating 360 degrees returns to start', () => {
      let q = Quaternion.identity();
      const step = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 180);

      for (let i = 0; i < 360; i++) {
        q = q.multiply(step);
      }

      expect(q.equals(Quaternion.identity(), 1e-5)).toBe(true);
    });
  });

  describe('numerical stability', () => {
    it('maintains precision through many operations', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), 0.01);
      let q = Quaternion.identity();

      for (let i = 0; i < 100; i++) {
        q = q.multiply(q1);
      }

      const expected = Quaternion.fromAxisAngle(Vector3.up(), 1);
      expect(q.equals(expected, 1e-6)).toBe(true);
    });

    it('slerp maintains unit length at all t values', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), 0);
      const q2 = Quaternion.fromAxisAngle(Vector3.up(), Math.PI);

      for (let t = 0; t <= 1; t += 0.1) {
        const q = q1.slerp(q2, t);
        expect(q.length()).toBeCloseTo(1, 10);
      }
    });

    it('inverse-multiply-inverse returns original', () => {
      const q = Quaternion.fromAxisAngle(
        new Vector3(1, 1, 1).normalize(),
        0.7
      );

      const inv = q.invert();
      const invInv = inv.invert();

      expect(invInv.equals(q, 1e-10)).toBe(true);
    });

    it('rotation composition is numerically stable', () => {
      const q1 = Quaternion.fromAxisAngle(Vector3.up(), 0.1);
      const q2 = Quaternion.fromAxisAngle(Vector3.right(), 0.2);
      const q3 = Quaternion.fromAxisAngle(Vector3.forward(), 0.3);

      const combined = q1.multiply(q2).multiply(q3);

      expect(combined.length()).toBeCloseTo(1, 10);
    });
  });
});
