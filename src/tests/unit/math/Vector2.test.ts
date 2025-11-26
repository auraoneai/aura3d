import { describe, it, expect, beforeEach } from 'vitest';
import { Vector2 } from '../../../math/Vector2';
import { MathConstants } from '../../../math/MathConstants';

describe('Vector2', () => {
  let v1: Vector2;
  let v2: Vector2;

  beforeEach(() => {
    v1 = new Vector2(3, 4);
    v2 = new Vector2(1, 2);
  });

  describe('constructor', () => {
    it('should create zero vector by default', () => {
      const v = new Vector2();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
    });

    it('should create vector with given components', () => {
      const v = new Vector2(3, 4);
      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
    });

    it('should create vector with only x specified', () => {
      const v = new Vector2(5);
      expect(v.x).toBe(5);
      expect(v.y).toBe(0);
    });
  });

  describe('static factory methods', () => {
    it('Vector2.zero() creates (0, 0)', () => {
      const zero = Vector2.zero();
      expect(zero.x).toBe(0);
      expect(zero.y).toBe(0);
    });

    it('Vector2.one() creates (1, 1)', () => {
      const one = Vector2.one();
      expect(one.x).toBe(1);
      expect(one.y).toBe(1);
    });

    it('Vector2.unitX() creates (1, 0)', () => {
      const unitX = Vector2.unitX();
      expect(unitX.x).toBe(1);
      expect(unitX.y).toBe(0);
    });

    it('Vector2.unitY() creates (0, 1)', () => {
      const unitY = Vector2.unitY();
      expect(unitY.x).toBe(0);
      expect(unitY.y).toBe(1);
    });

    it('Vector2.fromAngle() creates from angle', () => {
      const v0 = Vector2.fromAngle(0);
      expect(v0.x).toBeCloseTo(1);
      expect(v0.y).toBeCloseTo(0);

      const v90 = Vector2.fromAngle(Math.PI / 2);
      expect(v90.x).toBeCloseTo(0);
      expect(v90.y).toBeCloseTo(1);

      const v180 = Vector2.fromAngle(Math.PI);
      expect(v180.x).toBeCloseTo(-1);
      expect(v180.y).toBeCloseTo(0);

      const v45 = Vector2.fromAngle(Math.PI / 4);
      expect(v45.x).toBeCloseTo(Math.sqrt(2) / 2);
      expect(v45.y).toBeCloseTo(Math.sqrt(2) / 2);
    });
  });

  describe('arithmetic operations', () => {
    it('add() combines vectors', () => {
      const result = v1.add(v2);
      expect(result.x).toBe(4);
      expect(result.y).toBe(6);
      expect(v1.x).toBe(3);
      expect(v1.y).toBe(4);
    });

    it('sub() subtracts vectors', () => {
      const result = v1.sub(v2);
      expect(result.x).toBe(2);
      expect(result.y).toBe(2);
      expect(v1.x).toBe(3);
      expect(v1.y).toBe(4);
    });

    it('mul() multiplies component-wise', () => {
      const result = v1.mul(v2);
      expect(result.x).toBe(3);
      expect(result.y).toBe(8);
      expect(v1.x).toBe(3);
      expect(v1.y).toBe(4);
    });

    it('div() divides component-wise', () => {
      const result = new Vector2(8, 15).div(new Vector2(2, 3));
      expect(result.x).toBe(4);
      expect(result.y).toBe(5);
    });

    it('scale() multiplies by scalar', () => {
      const result = v1.scale(2);
      expect(result.x).toBe(6);
      expect(result.y).toBe(8);
      expect(v1.x).toBe(3);
      expect(v1.y).toBe(4);
    });

    it('multiplyScalar() is alias for scale()', () => {
      const result = v1.multiplyScalar(2);
      expect(result.x).toBe(6);
      expect(result.y).toBe(8);
    });

    it('subtract() is alias for sub()', () => {
      const result = v1.subtract(v2);
      expect(result.x).toBe(2);
      expect(result.y).toBe(2);
    });

    it('negate() inverts vector', () => {
      const result = v1.negate();
      expect(result.x).toBe(-3);
      expect(result.y).toBe(-4);
      expect(v1.x).toBe(3);
      expect(v1.y).toBe(4);
    });
  });

  describe('in-place operations', () => {
    it('addInPlace() mutates original vector', () => {
      const original = v1;
      const result = v1.addInPlace(v2);
      expect(result).toBe(original);
      expect(v1.x).toBe(4);
      expect(v1.y).toBe(6);
    });

    it('subInPlace() mutates original vector', () => {
      const original = v1;
      const result = v1.subInPlace(v2);
      expect(result).toBe(original);
      expect(v1.x).toBe(2);
      expect(v1.y).toBe(2);
    });

    it('mulInPlace() mutates original vector', () => {
      const original = v1;
      const result = v1.mulInPlace(v2);
      expect(result).toBe(original);
      expect(v1.x).toBe(3);
      expect(v1.y).toBe(8);
    });

    it('divInPlace() mutates original vector', () => {
      const v = new Vector2(8, 15);
      const original = v;
      const result = v.divInPlace(new Vector2(2, 3));
      expect(result).toBe(original);
      expect(v.x).toBe(4);
      expect(v.y).toBe(5);
    });

    it('scaleInPlace() mutates original vector', () => {
      const original = v1;
      const result = v1.scaleInPlace(2);
      expect(result).toBe(original);
      expect(v1.x).toBe(6);
      expect(v1.y).toBe(8);
    });

    it('normalizeInPlace() mutates original vector', () => {
      const original = v1;
      const result = v1.normalizeInPlace();
      expect(result).toBe(original);
      expect(v1.x).toBeCloseTo(0.6);
      expect(v1.y).toBeCloseTo(0.8);
      expect(v1.length()).toBeCloseTo(1);
    });

    it('negateInPlace() mutates original vector', () => {
      const original = v1;
      const result = v1.negateInPlace();
      expect(result).toBe(original);
      expect(v1.x).toBe(-3);
      expect(v1.y).toBe(-4);
    });

    it('rotateInPlace() mutates original vector', () => {
      const v = new Vector2(1, 0);
      const original = v;
      const result = v.rotateInPlace(Math.PI / 2);
      expect(result).toBe(original);
      expect(v.x).toBeCloseTo(0);
      expect(v.y).toBeCloseTo(1);
    });

    it('supports method chaining', () => {
      const v = new Vector2(1, 1);
      v.scaleInPlace(2).addInPlace(new Vector2(1, 1)).normalizeInPlace();
      expect(v.length()).toBeCloseTo(1);
    });
  });

  describe('geometric operations', () => {
    it('length() returns magnitude', () => {
      expect(v1.length()).toBe(5);
      expect(new Vector2(1, 0).length()).toBe(1);
      expect(new Vector2(0, 0).length()).toBe(0);
    });

    it('lengthSquared() returns squared magnitude', () => {
      expect(v1.lengthSquared()).toBe(25);
      expect(new Vector2(1, 1).lengthSquared()).toBe(2);
    });

    it('normalize() creates unit vector', () => {
      const normalized = v1.normalize();
      expect(normalized.x).toBeCloseTo(0.6);
      expect(normalized.y).toBeCloseTo(0.8);
      expect(normalized.length()).toBeCloseTo(1);
      expect(v1.x).toBe(3);
      expect(v1.y).toBe(4);
    });

    it('normalize() handles zero vector', () => {
      const zero = new Vector2(0, 0);
      const normalized = zero.normalize();
      expect(normalized.x).toBe(0);
      expect(normalized.y).toBe(0);
    });

    it('dot() computes dot product', () => {
      expect(v1.dot(v2)).toBe(11);
      expect(new Vector2(1, 0).dot(new Vector2(0, 1))).toBe(0);
      expect(new Vector2(1, 0).dot(new Vector2(1, 0))).toBe(1);
    });

    it('cross() computes 2D cross product', () => {
      const v1 = new Vector2(1, 0);
      const v2 = new Vector2(0, 1);
      expect(v1.cross(v2)).toBe(1);
      expect(v2.cross(v1)).toBe(-1);

      const parallel = new Vector2(2, 3);
      const parallel2 = new Vector2(4, 6);
      expect(parallel.cross(parallel2)).toBe(0);
    });

    it('distanceTo() computes distance to point', () => {
      const v1 = new Vector2(0, 0);
      const v2 = new Vector2(3, 4);
      expect(v1.distanceTo(v2)).toBe(5);
      expect(v2.distanceTo(v1)).toBe(5);
    });

    it('distanceToSquared() computes squared distance', () => {
      const v1 = new Vector2(0, 0);
      const v2 = new Vector2(3, 4);
      expect(v1.distanceToSquared(v2)).toBe(25);
    });

    it('Vector2.distance() computes distance between vectors', () => {
      expect(Vector2.distance(new Vector2(0, 0), new Vector2(3, 4))).toBe(5);
    });

    it('Vector2.distanceSquared() computes squared distance', () => {
      expect(Vector2.distanceSquared(new Vector2(0, 0), new Vector2(3, 4))).toBe(25);
    });

    it('angle() returns angle from positive x-axis', () => {
      expect(new Vector2(1, 0).angle()).toBeCloseTo(0);
      expect(new Vector2(0, 1).angle()).toBeCloseTo(Math.PI / 2);
      expect(new Vector2(-1, 0).angle()).toBeCloseTo(Math.PI);
      expect(new Vector2(1, 1).angle()).toBeCloseTo(Math.PI / 4);
      expect(new Vector2(0, -1).angle()).toBeCloseTo(-Math.PI / 2);
    });

    it('rotate() rotates vector', () => {
      const v = new Vector2(1, 0);
      const v90 = v.rotate(Math.PI / 2);
      expect(v90.x).toBeCloseTo(0);
      expect(v90.y).toBeCloseTo(1);

      const v180 = v.rotate(Math.PI);
      expect(v180.x).toBeCloseTo(-1);
      expect(v180.y).toBeCloseTo(0);

      const v270 = v.rotate(3 * Math.PI / 2);
      expect(v270.x).toBeCloseTo(0);
      expect(v270.y).toBeCloseTo(-1);

      expect(v.x).toBe(1);
      expect(v.y).toBe(0);
    });

    it('perpendicular() returns perpendicular vector', () => {
      const v1 = new Vector2(1, 0);
      const perp = v1.perpendicular();
      expect(perp.x).toBe(0);
      expect(perp.y).toBe(1);

      const v2 = new Vector2(3, 4);
      const perp2 = v2.perpendicular();
      expect(perp2.x).toBe(-4);
      expect(perp2.y).toBe(3);
      expect(v2.dot(perp2)).toBe(0);
    });

    it('reflect() reflects vector about normal', () => {
      const velocity = new Vector2(5, -10);
      const normal = new Vector2(0, 1);
      const bounced = velocity.reflect(normal);
      expect(bounced.x).toBeCloseTo(5);
      expect(bounced.y).toBeCloseTo(10);

      const v = new Vector2(1, -1);
      const n = new Vector2(0.707, 0.707);
      const reflected = v.reflect(n);
      expect(reflected.x).toBeCloseTo(-1, 1);
      expect(reflected.y).toBeCloseTo(1, 1);
    });
  });

  describe('interpolation', () => {
    it('lerp() linearly interpolates', () => {
      const v1 = new Vector2(0, 0);
      const v2 = new Vector2(10, 10);

      const at0 = v1.lerp(v2, 0);
      expect(at0.x).toBe(0);
      expect(at0.y).toBe(0);

      const at05 = v1.lerp(v2, 0.5);
      expect(at05.x).toBe(5);
      expect(at05.y).toBe(5);

      const at1 = v1.lerp(v2, 1);
      expect(at1.x).toBe(10);
      expect(at1.y).toBe(10);

      const at2 = v1.lerp(v2, 2);
      expect(at2.x).toBe(20);
      expect(at2.y).toBe(20);
    });

    it('lerp() does not mutate original vectors', () => {
      const v1 = new Vector2(0, 0);
      const v2 = new Vector2(10, 10);
      v1.lerp(v2, 0.5);
      expect(v1.x).toBe(0);
      expect(v1.y).toBe(0);
      expect(v2.x).toBe(10);
      expect(v2.y).toBe(10);
    });
  });

  describe('utility methods', () => {
    it('clone() creates copy', () => {
      const clone = v1.clone();
      expect(clone.x).toBe(v1.x);
      expect(clone.y).toBe(v1.y);
      expect(clone).not.toBe(v1);

      clone.x = 100;
      expect(v1.x).toBe(3);
    });

    it('copy() copies from another vector', () => {
      const target = new Vector2(0, 0);
      const result = target.copy(v1);
      expect(result).toBe(target);
      expect(target.x).toBe(3);
      expect(target.y).toBe(4);
    });

    it('set() sets components', () => {
      const v = new Vector2();
      const result = v.set(5, 6);
      expect(result).toBe(v);
      expect(v.x).toBe(5);
      expect(v.y).toBe(6);
    });

    it('equals() compares vectors with epsilon', () => {
      const v1 = new Vector2(1.0, 2.0);
      const v2 = new Vector2(1.0000001, 2.0000001);
      const v3 = new Vector2(1.1, 2.1);

      expect(v1.equals(v2)).toBe(true);
      expect(v1.equals(v3)).toBe(false);
      expect(v1.equals(new Vector2(1.01, 2.01), 0.1)).toBe(true);
    });

    it('toArray() returns array', () => {
      const arr = v1.toArray();
      expect(arr).toEqual([3, 4]);
      expect(Array.isArray(arr)).toBe(true);
    });

    it('fromArray() sets from array', () => {
      const v = new Vector2();
      const result = v.fromArray([5, 6]);
      expect(result).toBe(v);
      expect(v.x).toBe(5);
      expect(v.y).toBe(6);
    });

    it('fromArray() supports offset', () => {
      const v = new Vector2();
      v.fromArray([1, 2, 3, 4], 2);
      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
    });

    it('toJSON() converts to object', () => {
      const json = v1.toJSON();
      expect(json).toEqual({ x: 3, y: 4 });
      expect(JSON.stringify(v1)).toBe('{"x":3,"y":4}');
    });
  });

  describe('static methods', () => {
    it('Vector2.min() returns component-wise minimum', () => {
      const v1 = new Vector2(1, 5);
      const v2 = new Vector2(3, 2);
      const min = Vector2.min(v1, v2);
      expect(min.x).toBe(1);
      expect(min.y).toBe(2);
    });

    it('Vector2.max() returns component-wise maximum', () => {
      const v1 = new Vector2(1, 5);
      const v2 = new Vector2(3, 2);
      const max = Vector2.max(v1, v2);
      expect(max.x).toBe(3);
      expect(max.y).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('handles zero vector normalization', () => {
      const zero = new Vector2(0, 0);
      const normalized = zero.normalize();
      expect(normalized.x).toBe(0);
      expect(normalized.y).toBe(0);

      zero.normalizeInPlace();
      expect(zero.x).toBe(0);
      expect(zero.y).toBe(0);
    });

    it('handles very large values', () => {
      const large = new Vector2(1e10, 1e10);
      const normalized = large.normalize();
      expect(normalized.length()).toBeCloseTo(1);
      expect(normalized.x).toBeCloseTo(Math.sqrt(2) / 2);
      expect(normalized.y).toBeCloseTo(Math.sqrt(2) / 2);
    });

    it('handles very small values', () => {
      const small = new Vector2(1e-10, 1e-10);
      const normalized = small.normalize();
      expect(normalized.length()).toBeCloseTo(1);
    });

    it('handles negative values', () => {
      const v = new Vector2(-3, -4);
      expect(v.length()).toBe(5);
      const normalized = v.normalize();
      expect(normalized.x).toBeCloseTo(-0.6);
      expect(normalized.y).toBeCloseTo(-0.8);
    });

    it('handles division by zero gracefully', () => {
      const v1 = new Vector2(10, 20);
      const v2 = new Vector2(0, 0);
      const result = v1.div(v2);
      expect(result.x).toBe(Infinity);
      expect(result.y).toBe(Infinity);
    });

    it('handles NaN inputs in equals()', () => {
      const v1 = new Vector2(NaN, NaN);
      const v2 = new Vector2(1, 2);
      expect(v1.equals(v2)).toBe(false);
      expect(v1.equals(v1)).toBe(false);
    });

    it('handles Infinity in operations', () => {
      const v = new Vector2(Infinity, Infinity);
      expect(v.length()).toBe(Infinity);

      const finite = new Vector2(1, 1);
      const sum = finite.add(v);
      expect(sum.x).toBe(Infinity);
      expect(sum.y).toBe(Infinity);
    });

    it('equals() handles edge cases correctly', () => {
      const v1 = new Vector2(1, 2);
      const v2 = new Vector2(1, 2);
      const vInf = new Vector2(Infinity, Infinity);
      const vNaN = new Vector2(NaN, NaN);

      expect(v1.equals(v2)).toBe(true);
      expect(v1.equals(vInf)).toBe(false);
      expect(v1.equals(vNaN)).toBe(false);
      expect(vInf.equals(vInf)).toBe(false);
      expect(vNaN.equals(vNaN)).toBe(false);
    });
  });

  describe('immutability of operations', () => {
    it('add() does not mutate original vectors', () => {
      const v1Original = { x: v1.x, y: v1.y };
      const v2Original = { x: v2.x, y: v2.y };
      v1.add(v2);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
      expect(v2.x).toBe(v2Original.x);
      expect(v2.y).toBe(v2Original.y);
    });

    it('sub() does not mutate original vectors', () => {
      const v1Original = { x: v1.x, y: v1.y };
      v1.sub(v2);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
    });

    it('mul() does not mutate original vectors', () => {
      const v1Original = { x: v1.x, y: v1.y };
      v1.mul(v2);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
    });

    it('scale() does not mutate original vector', () => {
      const v1Original = { x: v1.x, y: v1.y };
      v1.scale(2);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
    });

    it('normalize() does not mutate original vector', () => {
      const v1Original = { x: v1.x, y: v1.y };
      v1.normalize();
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
    });

    it('rotate() does not mutate original vector', () => {
      const v1Original = { x: v1.x, y: v1.y };
      v1.rotate(Math.PI / 2);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
    });
  });
});
