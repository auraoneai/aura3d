import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3 } from '../../../math/Vector3';
import { MathConstants } from '../../../math/MathConstants';

describe('Vector3', () => {
  let v1: Vector3;
  let v2: Vector3;

  beforeEach(() => {
    v1 = new Vector3(1, 2, 3);
    v2 = new Vector3(4, 5, 6);
  });

  describe('constructor', () => {
    it('should create zero vector by default', () => {
      const v = new Vector3();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(0);
    });

    it('should create vector with given components', () => {
      const v = new Vector3(1, 2, 3);
      expect(v.x).toBe(1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(3);
    });

    it('should create vector with partial components', () => {
      const v1 = new Vector3(5);
      expect(v1.x).toBe(5);
      expect(v1.y).toBe(0);
      expect(v1.z).toBe(0);

      const v2 = new Vector3(5, 6);
      expect(v2.x).toBe(5);
      expect(v2.y).toBe(6);
      expect(v2.z).toBe(0);
    });
  });

  describe('static factory methods', () => {
    it('Vector3.zero() creates (0, 0, 0)', () => {
      const zero = Vector3.zero();
      expect(zero.x).toBe(0);
      expect(zero.y).toBe(0);
      expect(zero.z).toBe(0);
    });

    it('Vector3.one() creates (1, 1, 1)', () => {
      const one = Vector3.one();
      expect(one.x).toBe(1);
      expect(one.y).toBe(1);
      expect(one.z).toBe(1);
    });

    it('Vector3.unitX() creates (1, 0, 0)', () => {
      const unitX = Vector3.unitX();
      expect(unitX.x).toBe(1);
      expect(unitX.y).toBe(0);
      expect(unitX.z).toBe(0);
    });

    it('Vector3.unitY() creates (0, 1, 0)', () => {
      const unitY = Vector3.unitY();
      expect(unitY.x).toBe(0);
      expect(unitY.y).toBe(1);
      expect(unitY.z).toBe(0);
    });

    it('Vector3.unitZ() creates (0, 0, 1)', () => {
      const unitZ = Vector3.unitZ();
      expect(unitZ.x).toBe(0);
      expect(unitZ.y).toBe(0);
      expect(unitZ.z).toBe(1);
    });

    it('Vector3.up() creates (0, 1, 0)', () => {
      const up = Vector3.up();
      expect(up.x).toBe(0);
      expect(up.y).toBe(1);
      expect(up.z).toBe(0);
    });

    it('Vector3.down() creates (0, -1, 0)', () => {
      const down = Vector3.down();
      expect(down.x).toBe(0);
      expect(down.y).toBe(-1);
      expect(down.z).toBe(0);
    });

    it('Vector3.forward() creates (0, 0, -1)', () => {
      const forward = Vector3.forward();
      expect(forward.x).toBe(0);
      expect(forward.y).toBe(0);
      expect(forward.z).toBe(-1);
    });

    it('Vector3.back() creates (0, 0, 1)', () => {
      const back = Vector3.back();
      expect(back.x).toBe(0);
      expect(back.y).toBe(0);
      expect(back.z).toBe(1);
    });

    it('Vector3.right() creates (1, 0, 0)', () => {
      const right = Vector3.right();
      expect(right.x).toBe(1);
      expect(right.y).toBe(0);
      expect(right.z).toBe(0);
    });

    it('Vector3.left() creates (-1, 0, 0)', () => {
      const left = Vector3.left();
      expect(left.x).toBe(-1);
      expect(left.y).toBe(0);
      expect(left.z).toBe(0);
    });
  });

  describe('arithmetic operations', () => {
    it('add() combines vectors', () => {
      const result = v1.add(v2);
      expect(result.x).toBe(5);
      expect(result.y).toBe(7);
      expect(result.z).toBe(9);
      expect(v1.x).toBe(1);
    });

    it('sub() subtracts vectors', () => {
      const result = v2.sub(v1);
      expect(result.x).toBe(3);
      expect(result.y).toBe(3);
      expect(result.z).toBe(3);
      expect(v2.x).toBe(4);
    });

    it('mul() multiplies component-wise', () => {
      const result = v1.mul(v2);
      expect(result.x).toBe(4);
      expect(result.y).toBe(10);
      expect(result.z).toBe(18);
    });

    it('div() divides component-wise', () => {
      const result = new Vector3(10, 20, 30).div(new Vector3(2, 4, 5));
      expect(result.x).toBe(5);
      expect(result.y).toBe(5);
      expect(result.z).toBe(6);
    });

    it('scale() multiplies by scalar', () => {
      const result = v1.scale(2);
      expect(result.x).toBe(2);
      expect(result.y).toBe(4);
      expect(result.z).toBe(6);
      expect(v1.x).toBe(1);
    });

    it('multiplyScalar() is alias for scale()', () => {
      const result = v1.multiplyScalar(2);
      expect(result.x).toBe(2);
      expect(result.y).toBe(4);
      expect(result.z).toBe(6);
    });

    it('subtract() is alias for sub()', () => {
      const result = v2.subtract(v1);
      expect(result.x).toBe(3);
      expect(result.y).toBe(3);
      expect(result.z).toBe(3);
    });

    it('negate() inverts vector', () => {
      const result = v1.negate();
      expect(result.x).toBe(-1);
      expect(result.y).toBe(-2);
      expect(result.z).toBe(-3);
      expect(v1.x).toBe(1);
    });
  });

  describe('in-place operations', () => {
    it('addInPlace() mutates original vector', () => {
      const original = v1;
      const result = v1.addInPlace(v2);
      expect(result).toBe(original);
      expect(v1.x).toBe(5);
      expect(v1.y).toBe(7);
      expect(v1.z).toBe(9);
    });

    it('subInPlace() mutates original vector', () => {
      const original = v2;
      const result = v2.subInPlace(v1);
      expect(result).toBe(original);
      expect(v2.x).toBe(3);
      expect(v2.y).toBe(3);
      expect(v2.z).toBe(3);
    });

    it('mulInPlace() mutates original vector', () => {
      const original = v1;
      const result = v1.mulInPlace(v2);
      expect(result).toBe(original);
      expect(v1.x).toBe(4);
      expect(v1.y).toBe(10);
      expect(v1.z).toBe(18);
    });

    it('divInPlace() mutates original vector', () => {
      const v = new Vector3(10, 20, 30);
      const original = v;
      const result = v.divInPlace(new Vector3(2, 4, 5));
      expect(result).toBe(original);
      expect(v.x).toBe(5);
      expect(v.y).toBe(5);
      expect(v.z).toBe(6);
    });

    it('scaleInPlace() mutates original vector', () => {
      const original = v1;
      const result = v1.scaleInPlace(2);
      expect(result).toBe(original);
      expect(v1.x).toBe(2);
      expect(v1.y).toBe(4);
      expect(v1.z).toBe(6);
    });

    it('normalizeInPlace() mutates original vector', () => {
      const v = new Vector3(3, 4, 0);
      const original = v;
      const result = v.normalizeInPlace();
      expect(result).toBe(original);
      expect(v.x).toBeCloseTo(0.6);
      expect(v.y).toBeCloseTo(0.8);
      expect(v.z).toBeCloseTo(0);
      expect(v.length()).toBeCloseTo(1);
    });

    it('negateInPlace() mutates original vector', () => {
      const original = v1;
      const result = v1.negateInPlace();
      expect(result).toBe(original);
      expect(v1.x).toBe(-1);
      expect(v1.y).toBe(-2);
      expect(v1.z).toBe(-3);
    });

    it('supports method chaining', () => {
      const v = new Vector3(1, 1, 1);
      v.scaleInPlace(2).addInPlace(new Vector3(1, 1, 1)).normalizeInPlace();
      expect(v.length()).toBeCloseTo(1);
    });
  });

  describe('geometric operations', () => {
    it('length() returns magnitude', () => {
      expect(new Vector3(3, 4, 0).length()).toBe(5);
      expect(new Vector3(1, 0, 0).length()).toBe(1);
      expect(new Vector3(0, 0, 0).length()).toBe(0);
      expect(new Vector3(1, 1, 1).length()).toBeCloseTo(Math.sqrt(3));
    });

    it('lengthSquared() returns squared magnitude', () => {
      expect(new Vector3(3, 4, 0).lengthSquared()).toBe(25);
      expect(new Vector3(1, 1, 1).lengthSquared()).toBe(3);
    });

    it('normalize() creates unit vector', () => {
      const v = new Vector3(3, 4, 0);
      const normalized = v.normalize();
      expect(normalized.x).toBeCloseTo(0.6);
      expect(normalized.y).toBeCloseTo(0.8);
      expect(normalized.z).toBeCloseTo(0);
      expect(normalized.length()).toBeCloseTo(1);
      expect(v.x).toBe(3);
    });

    it('normalize() handles zero vector', () => {
      const zero = new Vector3(0, 0, 0);
      const normalized = zero.normalize();
      expect(normalized.x).toBe(0);
      expect(normalized.y).toBe(0);
      expect(normalized.z).toBe(0);
    });

    it('normalize() handles very small vectors', () => {
      const tiny = new Vector3(1e-100, 1e-100, 1e-100);
      const normalized = tiny.normalize();
      expect(normalized.x).toBe(0);
      expect(normalized.y).toBe(0);
      expect(normalized.z).toBe(0);
    });

    it('dot() computes dot product', () => {
      expect(v1.dot(v2)).toBe(32);
      expect(new Vector3(1, 0, 0).dot(new Vector3(0, 1, 0))).toBe(0);
      expect(new Vector3(1, 0, 0).dot(new Vector3(1, 0, 0))).toBe(1);
    });

    it('cross() computes cross product', () => {
      const x = new Vector3(1, 0, 0);
      const y = new Vector3(0, 1, 0);
      const z = x.cross(y);
      expect(z.x).toBeCloseTo(0);
      expect(z.y).toBeCloseTo(0);
      expect(z.z).toBeCloseTo(1);

      const zReverse = y.cross(x);
      expect(zReverse.x).toBeCloseTo(0);
      expect(zReverse.y).toBeCloseTo(0);
      expect(zReverse.z).toBeCloseTo(-1);
    });

    it('cross() produces perpendicular vector', () => {
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(4, 5, 6);
      const c = a.cross(b);
      expect(a.dot(c)).toBeCloseTo(0);
      expect(b.dot(c)).toBeCloseTo(0);
    });

    it('cross() of parallel vectors is zero', () => {
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(2, 4, 6);
      const c = a.cross(b);
      expect(c.x).toBeCloseTo(0);
      expect(c.y).toBeCloseTo(0);
      expect(c.z).toBeCloseTo(0);
    });

    it('distanceTo() computes distance', () => {
      const v1 = new Vector3(0, 0, 0);
      const v2 = new Vector3(3, 4, 0);
      expect(v1.distanceTo(v2)).toBe(5);
    });

    it('distanceToSquared() computes squared distance', () => {
      const v1 = new Vector3(0, 0, 0);
      const v2 = new Vector3(3, 4, 0);
      expect(v1.distanceToSquared(v2)).toBe(25);
    });

    it('Vector3.distance() computes distance', () => {
      expect(Vector3.distance(new Vector3(0, 0, 0), new Vector3(3, 4, 0))).toBe(5);
    });

    it('Vector3.distanceSquared() computes squared distance', () => {
      expect(Vector3.distanceSquared(new Vector3(0, 0, 0), new Vector3(3, 4, 0))).toBe(25);
    });

    it('Vector3.angle() computes angle between vectors', () => {
      const x = new Vector3(1, 0, 0);
      const y = new Vector3(0, 1, 0);
      expect(Vector3.angle(x, y)).toBeCloseTo(Math.PI / 2);

      const parallel = new Vector3(1, 0, 0);
      const parallel2 = new Vector3(2, 0, 0);
      expect(Vector3.angle(parallel, parallel2)).toBeCloseTo(0);

      const opposite = new Vector3(1, 0, 0);
      const opposite2 = new Vector3(-1, 0, 0);
      expect(Vector3.angle(opposite, opposite2)).toBeCloseTo(Math.PI);
    });

    it('Vector3.angle() handles zero vectors', () => {
      const zero = new Vector3(0, 0, 0);
      const v = new Vector3(1, 0, 0);
      expect(Vector3.angle(zero, v)).toBe(0);
    });
  });

  describe('projection and reflection', () => {
    it('project() projects vector onto another', () => {
      const v = new Vector3(3, 4, 0);
      const onto = new Vector3(1, 0, 0);
      const proj = v.project(onto);
      expect(proj.x).toBeCloseTo(3);
      expect(proj.y).toBeCloseTo(0);
      expect(proj.z).toBeCloseTo(0);
    });

    it('project() handles zero vector', () => {
      const v = new Vector3(1, 2, 3);
      const onto = new Vector3(0, 0, 0);
      const proj = v.project(onto);
      expect(proj.x).toBe(0);
      expect(proj.y).toBe(0);
      expect(proj.z).toBe(0);
    });

    it('reject() returns perpendicular component', () => {
      const v = new Vector3(3, 4, 0);
      const from = new Vector3(1, 0, 0);
      const rej = v.reject(from);
      expect(rej.x).toBeCloseTo(0);
      expect(rej.y).toBeCloseTo(4);
      expect(rej.z).toBeCloseTo(0);
    });

    it('project + reject equals original vector', () => {
      const v = new Vector3(3, 4, 5);
      const onto = new Vector3(1, 1, 1);
      const proj = v.project(onto);
      const rej = v.reject(onto);
      const sum = proj.add(rej);
      expect(sum.x).toBeCloseTo(v.x);
      expect(sum.y).toBeCloseTo(v.y);
      expect(sum.z).toBeCloseTo(v.z);
    });

    it('reflect() reflects vector about normal', () => {
      const v = new Vector3(1, -1, 0);
      const normal = new Vector3(0, 1, 0);
      const reflected = v.reflect(normal);
      expect(reflected.x).toBeCloseTo(1);
      expect(reflected.y).toBeCloseTo(1);
      expect(reflected.z).toBeCloseTo(0);
    });

    it('reflect() preserves length', () => {
      const v = new Vector3(3, 4, 5);
      const normal = new Vector3(0, 1, 0).normalize();
      const reflected = v.reflect(normal);
      expect(reflected.length()).toBeCloseTo(v.length());
    });
  });

  describe('interpolation', () => {
    it('lerp() linearly interpolates', () => {
      const v1 = new Vector3(0, 0, 0);
      const v2 = new Vector3(10, 10, 10);

      const at0 = v1.lerp(v2, 0);
      expect(at0.x).toBe(0);
      expect(at0.y).toBe(0);
      expect(at0.z).toBe(0);

      const at05 = v1.lerp(v2, 0.5);
      expect(at05.x).toBe(5);
      expect(at05.y).toBe(5);
      expect(at05.z).toBe(5);

      const at1 = v1.lerp(v2, 1);
      expect(at1.x).toBe(10);
      expect(at1.y).toBe(10);
      expect(at1.z).toBe(10);
    });

    it('slerp() spherically interpolates', () => {
      const v1 = new Vector3(1, 0, 0);
      const v2 = new Vector3(0, 1, 0);

      const at05 = v1.slerp(v2, 0.5);
      expect(at05.length()).toBeCloseTo(1);
      expect(at05.x).toBeCloseTo(Math.sqrt(2) / 2, 1);
      expect(at05.y).toBeCloseTo(Math.sqrt(2) / 2, 1);
      expect(at05.z).toBeCloseTo(0);
    });

    it('slerp() handles parallel vectors', () => {
      const v1 = new Vector3(1, 0, 0);
      const v2 = new Vector3(2, 0, 0);
      const result = v1.slerp(v2, 0.5);
      expect(result.x).toBeGreaterThan(0);
      expect(result.y).toBeCloseTo(0);
      expect(result.z).toBeCloseTo(0);
    });

    it('slerp() handles anti-parallel vectors', () => {
      const v1 = new Vector3(1, 0, 0);
      const v2 = new Vector3(-1, 0, 0);
      const result = v1.slerp(v2, 0.5);
      expect(result.length()).toBeGreaterThan(0);
    });

    it('slerp() handles zero vectors', () => {
      const v1 = new Vector3(0, 0, 0);
      const v2 = new Vector3(1, 0, 0);
      const result = v1.slerp(v2, 0.5);
      expect(result.x).toBeCloseTo(0.5);
      expect(result.y).toBeCloseTo(0);
      expect(result.z).toBeCloseTo(0);
    });
  });

  describe('transformations', () => {
    it('applyMatrix4() transforms by matrix', () => {
      const v = new Vector3(1, 0, 0);
      const identityMatrix = {
        elements: [
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        ]
      };
      const result = v.applyMatrix4(identityMatrix);
      expect(result.x).toBeCloseTo(1);
      expect(result.y).toBeCloseTo(0);
      expect(result.z).toBeCloseTo(0);
    });

    it('applyMatrix4() applies translation', () => {
      const v = new Vector3(1, 0, 0);
      const translationMatrix = {
        elements: [
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          5, 5, 5, 1
        ]
      };
      const result = v.applyMatrix4(translationMatrix);
      expect(result.x).toBeCloseTo(6);
      expect(result.y).toBeCloseTo(5);
      expect(result.z).toBeCloseTo(5);
    });

    it('applyQuaternion() rotates vector', () => {
      const v = new Vector3(1, 0, 0);
      const qIdentity = { x: 0, y: 0, z: 0, w: 1 };
      const result = v.applyQuaternion(qIdentity);
      expect(result.x).toBeCloseTo(1);
      expect(result.y).toBeCloseTo(0);
      expect(result.z).toBeCloseTo(0);
    });

    it('applyQuaternion() rotates 90 degrees around Y', () => {
      const v = new Vector3(1, 0, 0);
      const q90Y = { x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) };
      const result = v.applyQuaternion(q90Y);
      expect(result.x).toBeCloseTo(0, 1);
      expect(result.y).toBeCloseTo(0, 1);
      expect(result.z).toBeCloseTo(-1, 1);
    });
  });

  describe('utility methods', () => {
    it('clone() creates copy', () => {
      const clone = v1.clone();
      expect(clone.x).toBe(v1.x);
      expect(clone.y).toBe(v1.y);
      expect(clone.z).toBe(v1.z);
      expect(clone).not.toBe(v1);

      clone.x = 100;
      expect(v1.x).toBe(1);
    });

    it('copy() copies from another vector', () => {
      const target = new Vector3(0, 0, 0);
      const result = target.copy(v1);
      expect(result).toBe(target);
      expect(target.x).toBe(1);
      expect(target.y).toBe(2);
      expect(target.z).toBe(3);
    });

    it('set() sets components', () => {
      const v = new Vector3();
      const result = v.set(5, 6, 7);
      expect(result).toBe(v);
      expect(v.x).toBe(5);
      expect(v.y).toBe(6);
      expect(v.z).toBe(7);
    });

    it('equals() compares vectors with epsilon', () => {
      const v1 = new Vector3(1.0, 2.0, 3.0);
      const v2 = new Vector3(1.0000001, 2.0000001, 3.0000001);
      const v3 = new Vector3(1.1, 2.1, 3.1);

      expect(v1.equals(v2)).toBe(true);
      expect(v1.equals(v3)).toBe(false);
      expect(v1.equals(new Vector3(1.01, 2.01, 3.01), 0.1)).toBe(true);
    });

    it('toArray() returns array', () => {
      const arr = v1.toArray();
      expect(arr).toEqual([1, 2, 3]);
      expect(Array.isArray(arr)).toBe(true);
    });

    it('fromArray() sets from array', () => {
      const v = new Vector3();
      const result = v.fromArray([5, 6, 7]);
      expect(result).toBe(v);
      expect(v.x).toBe(5);
      expect(v.y).toBe(6);
      expect(v.z).toBe(7);
    });

    it('fromArray() supports offset', () => {
      const v = new Vector3();
      v.fromArray([1, 2, 3, 4, 5], 2);
      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
      expect(v.z).toBe(5);
    });

    it('toJSON() converts to object', () => {
      const json = v1.toJSON();
      expect(json).toEqual({ x: 1, y: 2, z: 3 });
      expect(JSON.stringify(v1)).toBe('{"x":1,"y":2,"z":3}');
    });
  });

  describe('static methods', () => {
    it('Vector3.min() returns component-wise minimum', () => {
      const v1 = new Vector3(1, 5, 3);
      const v2 = new Vector3(4, 2, 6);
      const min = Vector3.min(v1, v2);
      expect(min.x).toBe(1);
      expect(min.y).toBe(2);
      expect(min.z).toBe(3);
    });

    it('Vector3.max() returns component-wise maximum', () => {
      const v1 = new Vector3(1, 5, 3);
      const v2 = new Vector3(4, 2, 6);
      const max = Vector3.max(v1, v2);
      expect(max.x).toBe(4);
      expect(max.y).toBe(5);
      expect(max.z).toBe(6);
    });

    it('Vector3.add() adds two vectors', () => {
      const sum = Vector3.add(v1, v2);
      expect(sum.x).toBe(5);
      expect(sum.y).toBe(7);
      expect(sum.z).toBe(9);
    });

    it('Vector3.subtract() subtracts vectors', () => {
      const diff = Vector3.subtract(v2, v1);
      expect(diff.x).toBe(3);
      expect(diff.y).toBe(3);
      expect(diff.z).toBe(3);
    });

    it('Vector3.multiplyScalar() scales vector', () => {
      const scaled = Vector3.multiplyScalar(v1, 2);
      expect(scaled.x).toBe(2);
      expect(scaled.y).toBe(4);
      expect(scaled.z).toBe(6);
    });

    it('Vector3.multiply() multiplies component-wise', () => {
      const product = Vector3.multiply(v1, v2);
      expect(product.x).toBe(4);
      expect(product.y).toBe(10);
      expect(product.z).toBe(18);
    });

    it('Vector3.lerp() interpolates vectors', () => {
      const mid = Vector3.lerp(new Vector3(0, 0, 0), new Vector3(10, 10, 10), 0.5);
      expect(mid.x).toBe(5);
      expect(mid.y).toBe(5);
      expect(mid.z).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('handles zero vector normalization', () => {
      const zero = new Vector3(0, 0, 0);
      const normalized = zero.normalize();
      expect(normalized.x).toBe(0);
      expect(normalized.y).toBe(0);
      expect(normalized.z).toBe(0);

      zero.normalizeInPlace();
      expect(zero.x).toBe(0);
      expect(zero.y).toBe(0);
      expect(zero.z).toBe(0);
    });

    it('handles very large values', () => {
      const large = new Vector3(1e10, 1e10, 1e10);
      const normalized = large.normalize();
      expect(normalized.length()).toBeCloseTo(1);
    });

    it('handles very small values', () => {
      const small = new Vector3(1e-10, 1e-10, 1e-10);
      const normalized = small.normalize();
      expect(normalized.length()).toBeCloseTo(1);
    });

    it('handles negative values', () => {
      const v = new Vector3(-3, -4, 0);
      expect(v.length()).toBe(5);
      const normalized = v.normalize();
      expect(normalized.x).toBeCloseTo(-0.6);
      expect(normalized.y).toBeCloseTo(-0.8);
    });

    it('handles division by zero gracefully', () => {
      const v1 = new Vector3(10, 20, 30);
      const v2 = new Vector3(0, 0, 0);
      const result = v1.div(v2);
      expect(result.x).toBe(Infinity);
      expect(result.y).toBe(Infinity);
      expect(result.z).toBe(Infinity);
    });

    it('handles NaN inputs in equals()', () => {
      const v1 = new Vector3(NaN, NaN, NaN);
      const v2 = new Vector3(1, 2, 3);
      expect(v1.equals(v2)).toBe(false);
      expect(v1.equals(v1)).toBe(false);
    });

    it('handles Infinity in operations', () => {
      const v = new Vector3(Infinity, Infinity, Infinity);
      expect(v.length()).toBe(Infinity);

      const finite = new Vector3(1, 1, 1);
      const sum = finite.add(v);
      expect(sum.x).toBe(Infinity);
      expect(sum.y).toBe(Infinity);
      expect(sum.z).toBe(Infinity);
    });

    it('equals() handles edge cases correctly', () => {
      const v1 = new Vector3(1, 2, 3);
      const v2 = new Vector3(1, 2, 3);
      const vInf = new Vector3(Infinity, Infinity, Infinity);
      const vNaN = new Vector3(NaN, NaN, NaN);

      expect(v1.equals(v2)).toBe(true);
      expect(v1.equals(vInf)).toBe(false);
      expect(v1.equals(vNaN)).toBe(false);
      expect(vInf.equals(vInf)).toBe(false);
      expect(vNaN.equals(vNaN)).toBe(false);
    });
  });

  describe('immutability of operations', () => {
    it('add() does not mutate original vectors', () => {
      const v1Original = { x: v1.x, y: v1.y, z: v1.z };
      const v2Original = { x: v2.x, y: v2.y, z: v2.z };
      v1.add(v2);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
      expect(v1.z).toBe(v1Original.z);
      expect(v2.x).toBe(v2Original.x);
      expect(v2.y).toBe(v2Original.y);
      expect(v2.z).toBe(v2Original.z);
    });

    it('sub() does not mutate original vectors', () => {
      const v1Original = { x: v1.x, y: v1.y, z: v1.z };
      v1.sub(v2);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
      expect(v1.z).toBe(v1Original.z);
    });

    it('cross() does not mutate original vectors', () => {
      const v1Original = { x: v1.x, y: v1.y, z: v1.z };
      v1.cross(v2);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
      expect(v1.z).toBe(v1Original.z);
    });

    it('normalize() does not mutate original vector', () => {
      const v1Original = { x: v1.x, y: v1.y, z: v1.z };
      v1.normalize();
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
      expect(v1.z).toBe(v1Original.z);
    });

    it('project() does not mutate original vectors', () => {
      const v1Original = { x: v1.x, y: v1.y, z: v1.z };
      v1.project(v2);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
      expect(v1.z).toBe(v1Original.z);
    });

    it('reflect() does not mutate original vectors', () => {
      const v1Original = { x: v1.x, y: v1.y, z: v1.z };
      v1.reflect(v2);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
      expect(v1.z).toBe(v1Original.z);
    });

    it('lerp() does not mutate original vectors', () => {
      const v1Original = { x: v1.x, y: v1.y, z: v1.z };
      v1.lerp(v2, 0.5);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
      expect(v1.z).toBe(v1Original.z);
    });

    it('slerp() does not mutate original vectors', () => {
      const v1Original = { x: v1.x, y: v1.y, z: v1.z };
      v1.slerp(v2, 0.5);
      expect(v1.x).toBe(v1Original.x);
      expect(v1.y).toBe(v1Original.y);
      expect(v1.z).toBe(v1Original.z);
    });
  });

  describe('performance-critical operations', () => {
    it('lengthSquared() is faster than length()', () => {
      const v = new Vector3(3, 4, 5);
      const lenSq = v.lengthSquared();
      const len = v.length();
      expect(lenSq).toBe(50);
      expect(len * len).toBeCloseTo(lenSq);
    });

    it('distanceToSquared() is faster than distanceTo()', () => {
      const v1 = new Vector3(0, 0, 0);
      const v2 = new Vector3(3, 4, 5);
      const distSq = v1.distanceToSquared(v2);
      const dist = v1.distanceTo(v2);
      expect(distSq).toBe(50);
      expect(dist * dist).toBeCloseTo(distSq);
    });
  });
});
