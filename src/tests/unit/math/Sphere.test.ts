import { describe, it, expect } from 'vitest';
import { Sphere } from '../../../math/Sphere';
import { Vector3 } from '../../../math/Vector3';
import { Matrix4 } from '../../../math/Matrix4';
import { MathConstants } from '../../../math/MathConstants';

const { EPSILON } = MathConstants;

describe('Sphere', () => {
  describe('constructor', () => {
    it('creates empty sphere by default', () => {
      const sphere = new Sphere();
      expect(sphere.isEmpty).toBe(true);
      expect(sphere.center.equals(Vector3.zero())).toBe(true);
      expect(sphere.radius).toBe(-1);
    });

    it('creates sphere from center and radius', () => {
      const center = new Vector3(1, 2, 3);
      const sphere = new Sphere(center, 5);

      expect(sphere.center.equals(center)).toBe(true);
      expect(sphere.radius).toBe(5);
      expect(sphere.isEmpty).toBe(false);
    });

    it('creates empty sphere with center but no radius', () => {
      const center = new Vector3(1, 2, 3);
      const sphere = new Sphere(center);

      expect(sphere.center.equals(center)).toBe(true);
      expect(sphere.isEmpty).toBe(true);
    });

    it('creates zero radius sphere', () => {
      const sphere = new Sphere(Vector3.zero(), 0);
      expect(sphere.isEmpty).toBe(false);
      expect(sphere.radius).toBe(0);
    });
  });

  describe('static factory methods', () => {
    it('empty() creates empty sphere', () => {
      const sphere = Sphere.empty();
      expect(sphere.isEmpty).toBe(true);
      expect(sphere.radius).toBe(-1);
    });

    it('fromPoints() creates bounding sphere from points', () => {
      const points = [
        new Vector3(1, 0, 0),
        new Vector3(-1, 0, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, -1, 0),
      ];

      const sphere = Sphere.fromPoints(points);

      expect(sphere.center.equals(Vector3.zero())).toBe(true);
      expect(sphere.radius).toBeCloseTo(1, 5);
    });

    it('fromPoints() handles single point', () => {
      const point = new Vector3(1, 2, 3);
      const sphere = Sphere.fromPoints([point]);

      expect(sphere.center.equals(point)).toBe(true);
      expect(sphere.radius).toBe(0);
    });

    it('fromPoints() handles empty array', () => {
      const sphere = Sphere.fromPoints([]);
      expect(sphere.isEmpty).toBe(true);
    });

    it('fromPoints() with optional center', () => {
      const center = new Vector3(0, 0, 0);
      const points = [
        new Vector3(1, 0, 0),
        new Vector3(-1, 0, 0),
        new Vector3(0, 1, 0),
      ];

      const sphere = Sphere.fromPoints(points);
      sphere.setFromPoints(points, center);

      expect(sphere.center.equals(center)).toBe(true);
    });

    it('fromBox() creates sphere enclosing box', () => {
      const box = {
        min: new Vector3(-1, -1, -1),
        max: new Vector3(1, 1, 1),
        getCenter: function() {
          return this.min.add(this.max).scale(0.5);
        },
      };

      const sphere = Sphere.fromBox(box);

      expect(sphere.center.equals(Vector3.zero())).toBe(true);
      expect(sphere.radius).toBeCloseTo(Math.sqrt(3), 5);
    });
  });

  describe('setFromPoints', () => {
    it('computes centroid and max radius', () => {
      const sphere = new Sphere();
      const points = [
        new Vector3(2, 0, 0),
        new Vector3(-2, 0, 0),
        new Vector3(0, 2, 0),
        new Vector3(0, -2, 0),
      ];

      sphere.setFromPoints(points);

      expect(sphere.center.equals(Vector3.zero())).toBe(true);
      expect(sphere.radius).toBeCloseTo(2, 5);
    });

    it('handles asymmetric point cloud', () => {
      const sphere = new Sphere();
      const points = [
        new Vector3(0, 0, 0),
        new Vector3(10, 0, 0),
        new Vector3(0, 5, 0),
      ];

      sphere.setFromPoints(points);

      expect(sphere.center.x).toBeGreaterThan(0);
      expect(sphere.center.y).toBeGreaterThan(0);
      expect(sphere.radius).toBeGreaterThan(0);
    });
  });

  describe('setFromBox', () => {
    it('centers sphere at box center', () => {
      const sphere = new Sphere();
      const box = {
        min: new Vector3(0, 0, 0),
        max: new Vector3(2, 4, 6),
        getCenter: function() {
          return new Vector3(1, 2, 3);
        },
      };

      sphere.setFromBox(box);

      expect(sphere.center.equals(new Vector3(1, 2, 3))).toBe(true);
    });

    it('radius reaches box corner', () => {
      const sphere = new Sphere();
      const box = {
        min: new Vector3(-1, -1, -1),
        max: new Vector3(1, 1, 1),
        getCenter: function() {
          return Vector3.zero();
        },
      };

      sphere.setFromBox(box);

      expect(sphere.radius).toBeCloseTo(Math.sqrt(3), 5);
    });
  });

  describe('isEmpty property', () => {
    it('detects empty sphere', () => {
      const sphere = new Sphere();
      expect(sphere.isEmpty).toBe(true);
    });

    it('detects non-empty sphere', () => {
      const sphere = new Sphere(Vector3.zero(), 1);
      expect(sphere.isEmpty).toBe(false);
    });

    it('zero radius sphere is not empty', () => {
      const sphere = new Sphere(Vector3.zero(), 0);
      expect(sphere.isEmpty).toBe(false);
    });
  });

  describe('makeEmpty', () => {
    it('sets sphere to empty state', () => {
      const sphere = new Sphere(new Vector3(1, 2, 3), 5);
      sphere.makeEmpty();

      expect(sphere.isEmpty).toBe(true);
      expect(sphere.radius).toBe(-1);
      expect(sphere.center.equals(Vector3.zero())).toBe(true);
    });
  });

  describe('containsPoint', () => {
    const sphere = new Sphere(Vector3.zero(), 5);

    it('detects point at center', () => {
      expect(sphere.containsPoint(Vector3.zero())).toBe(true);
    });

    it('detects point inside sphere', () => {
      expect(sphere.containsPoint(new Vector3(3, 0, 0))).toBe(true);
      expect(sphere.containsPoint(new Vector3(0, 4, 0))).toBe(true);
      expect(sphere.containsPoint(new Vector3(2, 2, 2))).toBe(true);
    });

    it('detects point on surface', () => {
      expect(sphere.containsPoint(new Vector3(5, 0, 0))).toBe(true);
      expect(sphere.containsPoint(new Vector3(0, 5, 0))).toBe(true);
      expect(sphere.containsPoint(new Vector3(0, 0, 5))).toBe(true);
    });

    it('detects point outside sphere', () => {
      expect(sphere.containsPoint(new Vector3(6, 0, 0))).toBe(false);
      expect(sphere.containsPoint(new Vector3(10, 10, 10))).toBe(false);
    });
  });

  describe('intersectsSphere', () => {
    const sphere1 = new Sphere(Vector3.zero(), 5);

    it('detects overlapping spheres', () => {
      const sphere2 = new Sphere(new Vector3(3, 0, 0), 5);
      expect(sphere1.intersectsSphere(sphere2)).toBe(true);
    });

    it('detects touching spheres', () => {
      const sphere2 = new Sphere(new Vector3(10, 0, 0), 5);
      expect(sphere1.intersectsSphere(sphere2)).toBe(true);
    });

    it('detects separated spheres', () => {
      const sphere2 = new Sphere(new Vector3(15, 0, 0), 5);
      expect(sphere1.intersectsSphere(sphere2)).toBe(false);
    });

    it('detects sphere inside another', () => {
      const sphere2 = new Sphere(new Vector3(1, 0, 0), 2);
      expect(sphere1.intersectsSphere(sphere2)).toBe(true);
    });
  });

  describe('intersectsBox', () => {
    const sphere = new Sphere(Vector3.zero(), 5);

    it('detects box overlapping sphere', () => {
      const box = {
        min: new Vector3(-1, -1, -1),
        max: new Vector3(1, 1, 1),
        getCenter: function() { return Vector3.zero(); },
      };
      expect(sphere.intersectsBox(box)).toBe(true);
    });

    it('detects box touching sphere', () => {
      const box = {
        min: new Vector3(5, -1, -1),
        max: new Vector3(6, 1, 1),
        getCenter: function() { return new Vector3(5.5, 0, 0); },
      };
      expect(sphere.intersectsBox(box)).toBe(true);
    });

    it('detects separated box', () => {
      const box = {
        min: new Vector3(10, 0, 0),
        max: new Vector3(11, 1, 1),
        getCenter: function() { return new Vector3(10.5, 0.5, 0.5); },
      };
      expect(sphere.intersectsBox(box)).toBe(false);
    });
  });

  describe('intersectsPlane', () => {
    const sphere = new Sphere(new Vector3(0, 5, 0), 3);

    it('detects plane cutting through sphere', () => {
      const plane = {
        normal: new Vector3(0, 1, 0),
        constant: 0,
        distanceToPoint: function(p: Vector3) {
          return this.normal.dot(p) + this.constant;
        },
      };
      expect(sphere.intersectsPlane(plane)).toBe(true);
    });

    it('detects plane touching sphere', () => {
      const plane = {
        normal: new Vector3(0, 1, 0),
        constant: -8,
        distanceToPoint: function(p: Vector3) {
          return this.normal.dot(p) + this.constant;
        },
      };
      expect(sphere.intersectsPlane(plane)).toBe(true);
    });

    it('detects separated plane', () => {
      const plane = {
        normal: new Vector3(0, 1, 0),
        constant: -10,
        distanceToPoint: function(p: Vector3) {
          return this.normal.dot(p) + this.constant;
        },
      };
      expect(sphere.intersectsPlane(plane)).toBe(false);
    });
  });

  describe('distanceToPoint', () => {
    const sphere = new Sphere(Vector3.zero(), 5);

    it('returns negative distance for interior point', () => {
      const distance = sphere.distanceToPoint(new Vector3(2, 0, 0));
      expect(distance).toBeCloseTo(-3, 5);
    });

    it('returns zero for point on surface', () => {
      const distance = sphere.distanceToPoint(new Vector3(5, 0, 0));
      expect(distance).toBeCloseTo(0, 5);
    });

    it('returns positive distance for exterior point', () => {
      const distance = sphere.distanceToPoint(new Vector3(10, 0, 0));
      expect(distance).toBeCloseTo(5, 5);
    });

    it('returns negative radius at center', () => {
      const distance = sphere.distanceToPoint(Vector3.zero());
      expect(distance).toBeCloseTo(-5, 5);
    });
  });

  describe('closestPointToPoint', () => {
    const sphere = new Sphere(Vector3.zero(), 5);

    it('returns point on surface for exterior point', () => {
      const point = new Vector3(10, 0, 0);
      const closest = sphere.closestPointToPoint(point);

      expect(closest.equals(new Vector3(5, 0, 0))).toBe(true);
    });

    it('returns point on surface for interior point', () => {
      const point = new Vector3(2, 0, 0);
      const closest = sphere.closestPointToPoint(point);

      expect(closest.equals(new Vector3(5, 0, 0))).toBe(true);
    });

    it('handles point at center', () => {
      const closest = sphere.closestPointToPoint(Vector3.zero());

      expect(closest.x).toBeCloseTo(5, 5);
      expect(closest.y).toBeCloseTo(0, 5);
      expect(closest.z).toBeCloseTo(0, 5);
    });

    it('handles oblique directions', () => {
      const point = new Vector3(10, 10, 0);
      const closest = sphere.closestPointToPoint(point);

      const distance = closest.sub(sphere.center).length();
      expect(distance).toBeCloseTo(sphere.radius, 5);
    });
  });

  describe('clampPoint', () => {
    const sphere = new Sphere(Vector3.zero(), 5);

    it('clamps exterior point to surface', () => {
      const point = new Vector3(10, 0, 0);
      const clamped = sphere.clampPoint(point);

      expect(clamped.equals(new Vector3(5, 0, 0))).toBe(true);
    });

    it('leaves interior point unchanged', () => {
      const point = new Vector3(2, 0, 0);
      const clamped = sphere.clampPoint(point);

      expect(clamped.equals(point)).toBe(true);
    });

    it('handles point on surface', () => {
      const point = new Vector3(5, 0, 0);
      const clamped = sphere.clampPoint(point);

      expect(clamped.equals(point)).toBe(true);
    });
  });

  describe('expandByPoint', () => {
    it('sets center and zero radius for first point', () => {
      const sphere = Sphere.empty();
      const point = new Vector3(1, 2, 3);

      sphere.expandByPoint(point);

      expect(sphere.center.equals(point)).toBe(true);
      expect(sphere.radius).toBe(0);
    });

    it('expands to include exterior point', () => {
      const sphere = new Sphere(Vector3.zero(), 5);
      sphere.expandByPoint(new Vector3(10, 0, 0));

      expect(sphere.radius).toBeGreaterThan(5);
    });

    it('does not shrink for interior point', () => {
      const sphere = new Sphere(Vector3.zero(), 5);
      const originalRadius = sphere.radius;

      sphere.expandByPoint(new Vector3(2, 0, 0));

      expect(sphere.radius).toBe(originalRadius);
    });

    it('shifts center when expanding', () => {
      const sphere = new Sphere(Vector3.zero(), 5);
      sphere.expandByPoint(new Vector3(20, 0, 0));

      expect(sphere.center.x).toBeGreaterThan(0);
    });
  });

  describe('union', () => {
    it('returns copy of larger sphere when one contains other', () => {
      const sphere1 = new Sphere(Vector3.zero(), 10);
      const sphere2 = new Sphere(new Vector3(2, 0, 0), 3);

      const result = sphere1.union(sphere2);

      expect(result.center.equals(sphere1.center)).toBe(true);
      expect(result.radius).toBeCloseTo(sphere1.radius, 5);
    });

    it('creates minimal enclosing sphere for overlapping spheres', () => {
      const sphere1 = new Sphere(new Vector3(-5, 0, 0), 5);
      const sphere2 = new Sphere(new Vector3(5, 0, 0), 5);

      const result = sphere1.union(sphere2);

      expect(result.center.equals(Vector3.zero())).toBe(true);
      expect(result.radius).toBeCloseTo(10, 5);
    });

    it('handles empty sphere', () => {
      const sphere1 = new Sphere(Vector3.zero(), 5);
      const sphere2 = Sphere.empty();

      const result = sphere1.union(sphere2);

      expect(result.equals(sphere1)).toBe(true);
    });

    it('handles union with empty sphere reversed', () => {
      const sphere1 = Sphere.empty();
      const sphere2 = new Sphere(Vector3.zero(), 5);

      const result = sphere1.union(sphere2);

      expect(result.equals(sphere2)).toBe(true);
    });
  });

  describe('applyMatrix4', () => {
    it('transforms center by translation', () => {
      const sphere = new Sphere(new Vector3(1, 2, 3), 5);
      const matrix = Matrix4.translation(10, 0, 0);

      const transformed = sphere.applyMatrix4(matrix);

      expect(transformed.center.equals(new Vector3(11, 2, 3))).toBe(true);
      expect(transformed.radius).toBeCloseTo(5, 5);
    });

    it('scales radius by uniform scale', () => {
      const sphere = new Sphere(Vector3.zero(), 5);
      const matrix = Matrix4.scale(2, 2, 2);

      const transformed = sphere.applyMatrix4(matrix);

      expect(transformed.radius).toBeCloseTo(10, 5);
    });

    it('uses maximum scale for non-uniform scaling', () => {
      const sphere = new Sphere(Vector3.zero(), 5);
      const matrix = Matrix4.scale(2, 3, 4);

      const transformed = sphere.applyMatrix4(matrix);

      expect(transformed.radius).toBeCloseTo(20, 5);
    });

    it('combines translation and scaling', () => {
      const sphere = new Sphere(new Vector3(1, 0, 0), 2);
      const matrix = Matrix4.translation(5, 0, 0).multiply(Matrix4.scale(3, 3, 3));

      const transformed = sphere.applyMatrix4(matrix);

      expect(transformed.center.x).toBeCloseTo(8, 5);
      expect(transformed.radius).toBeCloseTo(6, 5);
    });
  });

  describe('copy and clone operations', () => {
    it('clone() creates independent copy', () => {
      const original = new Sphere(new Vector3(1, 2, 3), 5);
      const cloned = original.clone();

      expect(cloned.equals(original)).toBe(true);

      cloned.radius = 10;
      expect(cloned.equals(original)).toBe(false);
    });

    it('copy() copies values from another sphere', () => {
      const source = new Sphere(new Vector3(1, 2, 3), 5);
      const target = Sphere.empty();

      target.copy(source);

      expect(target.equals(source)).toBe(true);
    });
  });

  describe('set', () => {
    it('sets center and radius', () => {
      const sphere = new Sphere();
      const center = new Vector3(1, 2, 3);

      sphere.set(center, 5);

      expect(sphere.center.equals(center)).toBe(true);
      expect(sphere.radius).toBe(5);
    });
  });

  describe('equals', () => {
    it('detects equal spheres', () => {
      const sphere1 = new Sphere(new Vector3(1, 2, 3), 5);
      const sphere2 = new Sphere(new Vector3(1, 2, 3), 5);

      expect(sphere1.equals(sphere2)).toBe(true);
    });

    it('detects different centers', () => {
      const sphere1 = new Sphere(new Vector3(1, 2, 3), 5);
      const sphere2 = new Sphere(new Vector3(4, 5, 6), 5);

      expect(sphere1.equals(sphere2)).toBe(false);
    });

    it('detects different radii', () => {
      const sphere1 = new Sphere(new Vector3(1, 2, 3), 5);
      const sphere2 = new Sphere(new Vector3(1, 2, 3), 10);

      expect(sphere1.equals(sphere2)).toBe(false);
    });

    it('uses epsilon tolerance', () => {
      const sphere1 = new Sphere(new Vector3(1, 2, 3), 5);
      const sphere2 = new Sphere(
        new Vector3(1 + EPSILON * 0.5, 2, 3),
        5 + EPSILON * 0.5
      );

      expect(sphere1.equals(sphere2)).toBe(true);
    });
  });

  describe('array conversion', () => {
    it('toArray() converts to tuple', () => {
      const sphere = new Sphere(new Vector3(1, 2, 3), 5);
      const arr = sphere.toArray();

      expect(arr).toEqual([1, 2, 3, 5]);
    });

    it('fromArray() sets from array', () => {
      const sphere = new Sphere();
      sphere.fromArray([1, 2, 3, 5]);

      expect(sphere.center.equals(new Vector3(1, 2, 3))).toBe(true);
      expect(sphere.radius).toBe(5);
    });

    it('fromArray() supports offset', () => {
      const sphere = new Sphere();
      sphere.fromArray([0, 0, 1, 2, 3, 5], 2);

      expect(sphere.center.equals(new Vector3(1, 2, 3))).toBe(true);
      expect(sphere.radius).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('handles zero radius sphere', () => {
      const sphere = new Sphere(new Vector3(1, 2, 3), 0);

      expect(sphere.isEmpty).toBe(false);
      expect(sphere.containsPoint(new Vector3(1, 2, 3))).toBe(true);
      expect(sphere.containsPoint(new Vector3(1.1, 2, 3))).toBe(false);
    });

    it('handles negative radius as empty', () => {
      const sphere = new Sphere(Vector3.zero(), -5);
      expect(sphere.isEmpty).toBe(true);
    });

    it('handles very large sphere', () => {
      const sphere = new Sphere(Vector3.zero(), 1e10);
      expect(sphere.containsPoint(new Vector3(1e9, 0, 0))).toBe(true);
    });

    it('handles very small sphere', () => {
      const sphere = new Sphere(Vector3.zero(), 1e-10);
      expect(sphere.containsPoint(Vector3.zero())).toBe(true);
      expect(sphere.containsPoint(new Vector3(1e-9, 0, 0))).toBe(false);
    });
  });
});
