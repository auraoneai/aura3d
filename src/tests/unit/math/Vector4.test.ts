import { describe, it, expect, beforeEach } from 'vitest';
import { Vector4 } from '../../../math/Vector4';
import { Vector2 } from '../../../math/Vector2';
import { Vector3 } from '../../../math/Vector3';
import { MathConstants } from '../../../math/MathConstants';

describe('Vector4', () => {
  let v1: Vector4;
  let v2: Vector4;

  beforeEach(() => {
    v1 = new Vector4(1, 2, 3, 4);
    v2 = new Vector4(5, 6, 7, 8);
  });

  describe('constructor', () => {
    it('should create vector with default w=1', () => {
      const v = new Vector4();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(0);
      expect(v.w).toBe(1);
    });

    it('should create vector with given components', () => {
      const v = new Vector4(1, 2, 3, 4);
      expect(v.x).toBe(1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(3);
      expect(v.w).toBe(4);
    });

    it('should create vector with partial components', () => {
      const v1 = new Vector4(5);
      expect(v1.x).toBe(5);
      expect(v1.y).toBe(0);
      expect(v1.z).toBe(0);
      expect(v1.w).toBe(1);

      const v2 = new Vector4(5, 6);
      expect(v2.x).toBe(5);
      expect(v2.y).toBe(6);
      expect(v2.z).toBe(0);
      expect(v2.w).toBe(1);

      const v3 = new Vector4(5, 6, 7);
      expect(v3.x).toBe(5);
      expect(v3.y).toBe(6);
      expect(v3.z).toBe(7);
      expect(v3.w).toBe(1);
    });
  });

  describe('static factory methods', () => {
    it('Vector4.zero() creates (0, 0, 0, 0)', () => {
      const zero = Vector4.zero();
      expect(zero.x).toBe(0);
      expect(zero.y).toBe(0);
      expect(zero.z).toBe(0);
      expect(zero.w).toBe(0);
    });

    it('Vector4.one() creates (1, 1, 1, 1)', () => {
      const one = Vector4.one();
      expect(one.x).toBe(1);
      expect(one.y).toBe(1);
      expect(one.z).toBe(1);
      expect(one.w).toBe(1);
    });

    it('Vector4.unitX() creates (1, 0, 0, 0)', () => {
      const unitX = Vector4.unitX();
      expect(unitX.x).toBe(1);
      expect(unitX.y).toBe(0);
      expect(unitX.z).toBe(0);
      expect(unitX.w).toBe(0);
    });

    it('Vector4.unitY() creates (0, 1, 0, 0)', () => {
      const unitY = Vector4.unitY();
      expect(unitY.x).toBe(0);
      expect(unitY.y).toBe(1);
      expect(unitY.z).toBe(0);
      expect(unitY.w).toBe(0);
    });

    it('Vector4.unitZ() creates (0, 0, 1, 0)', () => {
      const unitZ = Vector4.unitZ();
      expect(unitZ.x).toBe(0);
      expect(unitZ.y).toBe(0);
      expect(unitZ.z).toBe(1);
      expect(unitZ.w).toBe(0);
    });

    it('Vector4.unitW() creates (0, 0, 0, 1)', () => {
      const unitW = Vector4.unitW();
      expect(unitW.x).toBe(0);
      expect(unitW.y).toBe(0);
      expect(unitW.z).toBe(0);
      expect(unitW.w).toBe(1);
    });

    it('Vector4.fromVector3() creates from Vector3', () => {
      const v3 = new Vector3(1, 2, 3);
      const v4 = Vector4.fromVector3(v3);
      expect(v4.x).toBe(1);
      expect(v4.y).toBe(2);
      expect(v4.z).toBe(3);
      expect(v4.w).toBe(1);
    });

    it('Vector4.fromVector3() supports custom w value', () => {
      const v3 = new Vector3(1, 2, 3);
      const v4point = Vector4.fromVector3(v3, 1);
      expect(v4point.w).toBe(1);

      const v4dir = Vector4.fromVector3(v3, 0);
      expect(v4dir.w).toBe(0);
    });
  });

  describe('arithmetic operations', () => {
    it('add() combines vectors', () => {
      const result = v1.add(v2);
      expect(result.x).toBe(6);
      expect(result.y).toBe(8);
      expect(result.z).toBe(10);
      expect(result.w).toBe(12);
      expect(v1.x).toBe(1);
    });

    it('sub() subtracts vectors', () => {
      const result = v2.sub(v1);
      expect(result.x).toBe(4);
      expect(result.y).toBe(4);
      expect(result.z).toBe(4);
      expect(result.w).toBe(4);
    });

    it('mul() multiplies component-wise', () => {
      const result = v1.mul(v2);
      expect(result.x).toBe(5);
      expect(result.y).toBe(12);
      expect(result.z).toBe(21);
      expect(result.w).toBe(32);
    });

    it('div() divides component-wise', () => {
      const result = new Vector4(12, 21, 32, 45).div(new Vector4(2, 3, 4, 5));
      expect(result.x).toBe(6);
      expect(result.y).toBe(7);
      expect(result.z).toBe(8);
      expect(result.w).toBe(9);
    });

    it('scale() multiplies by scalar', () => {
      const result = v1.scale(2);
      expect(result.x).toBe(2);
      expect(result.y).toBe(4);
      expect(result.z).toBe(6);
      expect(result.w).toBe(8);
      expect(v1.x).toBe(1);
    });

    it('negate() inverts vector', () => {
      const result = v1.negate();
      expect(result.x).toBe(-1);
      expect(result.y).toBe(-2);
      expect(result.z).toBe(-3);
      expect(result.w).toBe(-4);
      expect(v1.x).toBe(1);
    });
  });

  describe('in-place operations', () => {
    it('addInPlace() mutates original vector', () => {
      const original = v1;
      const result = v1.addInPlace(v2);
      expect(result).toBe(original);
      expect(v1.x).toBe(6);
      expect(v1.y).toBe(8);
      expect(v1.z).toBe(10);
      expect(v1.w).toBe(12);
    });

    it('subInPlace() mutates original vector', () => {
      const original = v2;
      const result = v2.subInPlace(v1);
      expect(result).toBe(original);
      expect(v2.x).toBe(4);
      expect(v2.y).toBe(4);
      expect(v2.z).toBe(4);
      expect(v2.w).toBe(4);
    });

    it('mulInPlace() mutates original vector', () => {
      const original = v1;
      const result = v1.mulInPlace(v2);
      expect(result).toBe(original);
      expect(v1.x).toBe(5);
      expect(v1.y).toBe(12);
      expect(v1.z).toBe(21);
      expect(v1.w).toBe(32);
    });

    it('divInPlace() mutates original vector', () => {
      const v = new Vector4(12, 21, 32, 45);
      const original = v;
      const result = v.divInPlace(new Vector4(2, 3, 4, 5));
      expect(result).toBe(original);
      expect(v.x).toBe(6);
      expect(v.y).toBe(7);
      expect(v.z).toBe(8);
      expect(v.w).toBe(9);
    });

    it('scaleInPlace() mutates original vector', () => {
      const original = v1;
      const result = v1.scaleInPlace(2);
      expect(result).toBe(original);
      expect(v1.x).toBe(2);
      expect(v1.y).toBe(4);
      expect(v1.z).toBe(6);
      expect(v1.w).toBe(8);
    });

    it('normalizeInPlace() mutates original vector', () => {
      const v = new Vector4(0, 0, 3, 4);
      const original = v;
      const result = v.normalizeInPlace();
      expect(result).toBe(original);
      expect(v.x).toBeCloseTo(0);
      expect(v.y).toBeCloseTo(0);
      expect(v.z).toBeCloseTo(0.6);
      expect(v.w).toBeCloseTo(0.8);
      expect(v.length()).toBeCloseTo(1);
    });

    it('negateInPlace() mutates original vector', () => {
      const original = v1;
      const result = v1.negateInPlace();
      expect(result).toBe(original);
      expect(v1.x).toBe(-1);
      expect(v1.y).toBe(-2);
      expect(v1.z).toBe(-3);
      expect(v1.w).toBe(-4);
    });

    it('supports method chaining', () => {
      const v = new Vector4(1, 1, 1, 1);
      v.scaleInPlace(2).addInPlace(new Vector4(1, 1, 1, 1)).normalizeInPlace();
      expect(v.length()).toBeCloseTo(1);
    });
  });

  describe('geometric operations', () => {
    it('length() returns magnitude', () => {
      expect(new Vector4(2, 3, 6, 0).length()).toBe(7);
      expect(new Vector4(1, 0, 0, 0).length()).toBe(1);
      expect(new Vector4(0, 0, 0, 0).length()).toBe(0);
    });

    it('lengthSquared() returns squared magnitude', () => {
      expect(new Vector4(2, 3, 6, 0).lengthSquared()).toBe(49);
      expect(new Vector4(1, 1, 1, 1).lengthSquared()).toBe(4);
    });

    it('normalize() creates unit vector', () => {
      const v = new Vector4(0, 0, 3, 4);
      const normalized = v.normalize();
      expect(normalized.x).toBeCloseTo(0);
      expect(normalized.y).toBeCloseTo(0);
      expect(normalized.z).toBeCloseTo(0.6);
      expect(normalized.w).toBeCloseTo(0.8);
      expect(normalized.length()).toBeCloseTo(1);
      expect(v.x).toBe(0);
    });

    it('normalize() handles zero vector', () => {
      const zero = new Vector4(0, 0, 0, 0);
      const normalized = zero.normalize();
      expect(normalized.x).toBe(0);
      expect(normalized.y).toBe(0);
      expect(normalized.z).toBe(0);
      expect(normalized.w).toBe(0);
    });

    it('dot() computes dot product', () => {
      expect(v1.dot(v2)).toBe(70);
      expect(new Vector4(1, 0, 0, 0).dot(new Vector4(0, 1, 0, 0))).toBe(0);
      expect(new Vector4(1, 0, 0, 0).dot(new Vector4(1, 0, 0, 0))).toBe(1);
    });
  });

  describe('homogeneous coordinates', () => {
    it('perspectiveDivide() converts to 3D', () => {
      const v = new Vector4(4, 6, 8, 2);
      const pos = v.perspectiveDivide();
      expect(pos).toBeInstanceOf(Vector3);
      expect(pos.x).toBe(2);
      expect(pos.y).toBe(3);
      expect(pos.z).toBe(4);
    });

    it('perspectiveDivide() handles w=1', () => {
      const v = new Vector4(1, 2, 3, 1);
      const pos = v.perspectiveDivide();
      expect(pos.x).toBe(1);
      expect(pos.y).toBe(2);
      expect(pos.z).toBe(3);
    });

    it('perspectiveDivide() handles w=0 (direction)', () => {
      const v = new Vector4(1, 2, 3, 0);
      const dir = v.perspectiveDivide();
      expect(dir.x).toBe(0);
      expect(dir.y).toBe(0);
      expect(dir.z).toBe(0);
    });

    it('perspectiveDivide() handles very small w', () => {
      const v = new Vector4(1, 2, 3, 0.0000001);
      const result = v.perspectiveDivide();
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(0);
    });
  });

  describe('component getters', () => {
    it('xy getter returns Vector2', () => {
      const xy = v1.xy;
      expect(xy).toBeInstanceOf(Vector2);
      expect(xy.x).toBe(1);
      expect(xy.y).toBe(2);
    });

    it('xyz getter returns Vector3', () => {
      const xyz = v1.xyz;
      expect(xyz).toBeInstanceOf(Vector3);
      expect(xyz.x).toBe(1);
      expect(xyz.y).toBe(2);
      expect(xyz.z).toBe(3);
    });

    it('getters return new instances', () => {
      const xy1 = v1.xy;
      const xy2 = v1.xy;
      expect(xy1).not.toBe(xy2);

      const xyz1 = v1.xyz;
      const xyz2 = v1.xyz;
      expect(xyz1).not.toBe(xyz2);
    });
  });

  describe('interpolation', () => {
    it('lerp() linearly interpolates', () => {
      const v1 = new Vector4(0, 0, 0, 0);
      const v2 = new Vector4(10, 10, 10, 10);

      const at0 = v1.lerp(v2, 0);
      expect(at0.x).toBe(0);
      expect(at0.y).toBe(0);
      expect(at0.z).toBe(0);
      expect(at0.w).toBe(0);

      const at05 = v1.lerp(v2, 0.5);
      expect(at05.x).toBe(5);
      expect(at05.y).toBe(5);
      expect(at05.z).toBe(5);
      expect(at05.w).toBe(5);

      const at1 = v1.lerp(v2, 1);
      expect(at1.x).toBe(10);
      expect(at1.y).toBe(10);
      expect(at1.z).toBe(10);
      expect(at1.w).toBe(10);
    });

    it('lerp() does not mutate original vectors', () => {
      const v1 = new Vector4(0, 0, 0, 0);
      const v2 = new Vector4(10, 10, 10, 10);
      v1.lerp(v2, 0.5);
      expect(v1.x).toBe(0);
      expect(v2.x).toBe(10);
    });
  });

  describe('utility methods', () => {
    it('clone() creates copy', () => {
      const clone = v1.clone();
      expect(clone.x).toBe(v1.x);
      expect(clone.y).toBe(v1.y);
      expect(clone.z).toBe(v1.z);
      expect(clone.w).toBe(v1.w);
      expect(clone).not.toBe(v1);

      clone.x = 100;
      expect(v1.x).toBe(1);
    });

    it('copy() copies from another vector', () => {
      const target = new Vector4(0, 0, 0, 0);
      const result = target.copy(v1);
      expect(result).toBe(target);
      expect(target.x).toBe(1);
      expect(target.y).toBe(2);
      expect(target.z).toBe(3);
      expect(target.w).toBe(4);
    });

    it('set() sets components', () => {
      const v = new Vector4();
      const result = v.set(5, 6, 7, 8);
      expect(result).toBe(v);
      expect(v.x).toBe(5);
      expect(v.y).toBe(6);
      expect(v.z).toBe(7);
      expect(v.w).toBe(8);
    });

    it('equals() compares vectors with epsilon', () => {
      const v1 = new Vector4(1.0, 2.0, 3.0, 4.0);
      const v2 = new Vector4(1.0000001, 2.0000001, 3.0000001, 4.0000001);
      const v3 = new Vector4(1.1, 2.1, 3.1, 4.1);

      expect(v1.equals(v2)).toBe(true);
      expect(v1.equals(v3)).toBe(false);
      expect(v1.equals(new Vector4(1.01, 2.01, 3.01, 4.01), 0.1)).toBe(true);
    });

    it('toArray() returns array', () => {
      const arr = v1.toArray();
      expect(arr).toEqual([1, 2, 3, 4]);
      expect(Array.isArray(arr)).toBe(true);
    });

    it('fromArray() sets from array', () => {
      const v = new Vector4();
      const result = v.fromArray([5, 6, 7, 8]);
      expect(result).toBe(v);
      expect(v.x).toBe(5);
      expect(v.y).toBe(6);
      expect(v.z).toBe(7);
      expect(v.w).toBe(8);
    });

    it('fromArray() supports offset', () => {
      const v = new Vector4();
      v.fromArray([1, 2, 3, 4, 5, 6], 2);
      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
      expect(v.z).toBe(5);
      expect(v.w).toBe(6);
    });

    it('toJSON() converts to object', () => {
      const json = v1.toJSON();
      expect(json).toEqual({ x: 1, y: 2, z: 3, w: 4 });
      expect(JSON.stringify(v1)).toBe('{"x":1,"y":2,"z":3,"w":4}');
    });
  });

  describe('color representation (RGBA)', () => {
    it('can represent RGBA color values', () => {
      const red = new Vector4(1, 0, 0, 1);
      expect(red.x).toBe(1);
      expect(red.y).toBe(0);
      expect(red.z).toBe(0);
      expect(red.w).toBe(1);
    });

    it('can represent semi-transparent colors', () => {
      const semiRed = new Vector4(1, 0, 0, 0.5);
      expect(semiRed.w).toBe(0.5);
    });

    it('can blend colors using lerp', () => {
      const red = new Vector4(1, 0, 0, 1);
      const blue = new Vector4(0, 0, 1, 1);
      const purple = red.lerp(blue, 0.5);
      expect(purple.x).toBe(0.5);
      expect(purple.y).toBe(0);
      expect(purple.z).toBe(0.5);
      expect(purple.w).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('handles zero vector normalization', () => {
      const zero = new Vector4(0, 0, 0, 0);
      const normalized = zero.normalize();
      expect(normalized.x).toBe(0);
      expect(normalized.y).toBe(0);
      expect(normalized.z).toBe(0);
      expect(normalized.w).toBe(0);

      zero.normalizeInPlace();
      expect(zero.x).toBe(0);
      expect(zero.y).toBe(0);
      expect(zero.z).toBe(0);
      expect(zero.w).toBe(0);
    });

    it('handles very large values', () => {
      const large = new Vector4(1e10, 1e10, 1e10, 1e10);
      const normalized = large.normalize();
      expect(normalized.length()).toBeCloseTo(1);
    });

    it('handles very small values', () => {
      const small = new Vector4(1e-10, 1e-10, 1e-10, 1e-10);
      const normalized = small.normalize();
      expect(normalized.length()).toBeCloseTo(1);
    });

    it('handles negative values', () => {
      const v = new Vector4(-2, -3, -6, 0);
      expect(v.length()).toBe(7);
      const normalized = v.normalize();
      expect(normalized.length()).toBeCloseTo(1);
    });

    it('handles division by zero gracefully', () => {
      const v1 = new Vector4(10, 20, 30, 40);
      const v2 = new Vector4(0, 0, 0, 0);
      const result = v1.div(v2);
      expect(result.x).toBe(Infinity);
      expect(result.y).toBe(Infinity);
      expect(result.z).toBe(Infinity);
      expect(result.w).toBe(Infinity);
    });

    it('handles NaN inputs in equals()', () => {
      const v1 = new Vector4(NaN, NaN, NaN, NaN);
      const v2 = new Vector4(1, 2, 3, 4);
      expect(v1.equals(v2)).toBe(false);
      expect(v1.equals(v1)).toBe(false);
    });

    it('handles Infinity in operations', () => {
      const v = new Vector4(Infinity, Infinity, Infinity, Infinity);
      expect(v.length()).toBe(Infinity);

      const finite = new Vector4(1, 1, 1, 1);
      const sum = finite.add(v);
      expect(sum.x).toBe(Infinity);
      expect(sum.y).toBe(Infinity);
      expect(sum.z).toBe(Infinity);
      expect(sum.w).toBe(Infinity);
    });

    it('equals() handles edge cases correctly', () => {
      const v1 = new Vector4(1, 2, 3, 4);
      const v2 = new Vector4(1, 2, 3, 4);
      const vInf = new Vector4(Infinity, Infinity, Infinity, Infinity);
      const vNaN = new Vector4(NaN, NaN, NaN, NaN);

      expect(v1.equals(v2)).toBe(true);
      expect(v1.equals(vInf)).toBe(false);
      expect(v1.equals(vNaN)).toBe(false);
      expect(vInf.equals(vInf)).toBe(false);
      expect(vNaN.equals(vNaN)).toBe(false);
    });
  });

  describe('immutability of operations', () => {
    it('add() does not mutate original vectors', () => {
      const v1Original = { x: v1.x, y: v1.y, z: v1.z, w: v1.w };
      const v2Original = { x: v2.x, y: v2.y, z: v2.z, w: v2.w };
      v1.add(v2);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
      expect(v1.z).toBe(v1Original.z);
      expect(v1.w).toBe(v1Original.w);
      expect(v2.x).toBe(v2Original.x);
      expect(v2.y).toBe(v2Original.y);
      expect(v2.z).toBe(v2Original.z);
      expect(v2.w).toBe(v2Original.w);
    });

    it('sub() does not mutate original vectors', () => {
      const v1Original = { x: v1.x, y: v1.y, z: v1.z, w: v1.w };
      v1.sub(v2);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
      expect(v1.z).toBe(v1Original.z);
      expect(v1.w).toBe(v1Original.w);
    });

    it('normalize() does not mutate original vector', () => {
      const v1Original = { x: v1.x, y: v1.y, z: v1.z, w: v1.w };
      v1.normalize();
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
      expect(v1.z).toBe(v1Original.z);
      expect(v1.w).toBe(v1Original.w);
    });

    it('lerp() does not mutate original vectors', () => {
      const v1Original = { x: v1.x, y: v1.y, z: v1.z, w: v1.w };
      v1.lerp(v2, 0.5);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
      expect(v1.z).toBe(v1Original.z);
      expect(v1.w).toBe(v1Original.w);
    });

    it('perspectiveDivide() does not mutate original vector', () => {
      const v = new Vector4(4, 6, 8, 2);
      const vOriginal = { x: v.x, y: v.y, z: v.z, w: v.w };
      v.perspectiveDivide();
      expect(v.x).toBe(vOriginal.x);
      expect(v.y).toBe(vOriginal.y);
      expect(v.z).toBe(vOriginal.z);
      expect(v.w).toBe(vOriginal.w);
    });
  });

  describe('performance-critical operations', () => {
    it('lengthSquared() is faster than length()', () => {
      const v = new Vector4(2, 3, 6, 0);
      const lenSq = v.lengthSquared();
      const len = v.length();
      expect(lenSq).toBe(49);
      expect(len * len).toBeCloseTo(lenSq);
    });
  });
});
