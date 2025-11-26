import { describe, it, expect } from 'vitest';
import { Plane } from '../../../math/Plane';
import { Vector3 } from '../../../math/Vector3';
import { Matrix4 } from '../../../math/Matrix4';
import { Matrix3 } from '../../../math/Matrix3';
import { MathConstants } from '../../../math/MathConstants';

const { EPSILON } = MathConstants;

describe('Plane', () => {
  describe('constructor', () => {
    it('creates plane with default normal and constant', () => {
      const plane = new Plane();
      expect(plane.normal.equals(new Vector3(1, 0, 0))).toBe(true);
      expect(plane.constant).toBe(0);
    });

    it('creates plane from normal and constant', () => {
      const normal = new Vector3(0, 1, 0);
      const plane = new Plane(normal, -5);

      expect(plane.normal.equals(normal)).toBe(true);
      expect(plane.constant).toBe(-5);
    });
  });

  describe('static factory methods', () => {
    it('fromNormalAndCoplanarPoint() creates plane', () => {
      const normal = new Vector3(0, 1, 0);
      const point = new Vector3(0, 5, 0);
      const plane = Plane.fromNormalAndCoplanarPoint(normal, point);

      expect(plane.normal.equals(normal)).toBe(true);
      expect(plane.distanceToPoint(point)).toBeCloseTo(0, 5);
    });

    it('fromCoplanarPoints() creates plane from triangle', () => {
      const a = new Vector3(0, 0, 0);
      const b = new Vector3(1, 0, 0);
      const c = new Vector3(0, 0, 1);
      const plane = Plane.fromCoplanarPoints(a, b, c);

      expect(plane.normal.equals(new Vector3(0, 1, 0))).toBe(true);
      expect(plane.distanceToPoint(a)).toBeCloseTo(0, 5);
    });

    it('fromCoplanarPoints() uses CCW winding', () => {
      const a = new Vector3(0, 0, 0);
      const b = new Vector3(1, 0, 0);
      const c = new Vector3(0, 0, 1);
      const plane = Plane.fromCoplanarPoints(a, b, c);

      // CCW winding should give upward normal
      expect(plane.normal.y).toBeGreaterThan(0);
    });
  });

  describe('setFromNormalAndCoplanarPoint', () => {
    it('sets plane from normal and point', () => {
      const plane = new Plane();
      const normal = new Vector3(0, 1, 0);
      const point = new Vector3(0, 5, 0);

      plane.setFromNormalAndCoplanarPoint(normal, point);

      expect(plane.normal.equals(normal)).toBe(true);
      expect(plane.distanceToPoint(point)).toBeCloseTo(0, 5);
    });

    it('handles point at origin', () => {
      const plane = new Plane();
      plane.setFromNormalAndCoplanarPoint(new Vector3(0, 1, 0), Vector3.zero());

      expect(plane.constant).toBe(0);
    });

    it('computes correct constant for offset plane', () => {
      const plane = new Plane();
      const normal = new Vector3(1, 0, 0);
      const point = new Vector3(5, 0, 0);

      plane.setFromNormalAndCoplanarPoint(normal, point);

      expect(plane.constant).toBeCloseTo(-5, 5);
    });
  });

  describe('setFromCoplanarPoints', () => {
    it('sets plane from three points', () => {
      const plane = new Plane();
      const a = new Vector3(0, 0, 0);
      const b = new Vector3(1, 0, 0);
      const c = new Vector3(0, 0, 1);

      plane.setFromCoplanarPoints(a, b, c);

      expect(plane.distanceToPoint(a)).toBeCloseTo(0, 5);
      expect(plane.distanceToPoint(b)).toBeCloseTo(0, 5);
      expect(plane.distanceToPoint(c)).toBeCloseTo(0, 5);
    });

    it('normalizes the normal vector', () => {
      const plane = new Plane();
      const a = new Vector3(0, 0, 0);
      const b = new Vector3(10, 0, 0);
      const c = new Vector3(0, 0, 10);

      plane.setFromCoplanarPoints(a, b, c);

      expect(plane.normal.length()).toBeCloseTo(1, 5);
    });
  });

  describe('setComponents', () => {
    it('sets normal and constant from components', () => {
      const plane = new Plane();
      plane.setComponents(0, 1, 0, -5);

      expect(plane.normal.equals(new Vector3(0, 1, 0))).toBe(true);
      expect(plane.constant).toBe(-5);
    });
  });

  describe('normalize', () => {
    it('normalizes plane equation', () => {
      const plane = new Plane(new Vector3(2, 0, 0), 10);
      plane.normalize();

      expect(plane.normal.length()).toBeCloseTo(1, 5);
      expect(plane.constant).toBeCloseTo(5, 5);
    });

    it('preserves plane after normalization', () => {
      const plane = new Plane(new Vector3(3, 4, 0), 15);
      const point = new Vector3(5, 0, 0);
      const distanceBefore = plane.distanceToPoint(point);

      plane.normalize();
      const distanceAfter = plane.distanceToPoint(point);

      expect(distanceAfter).toBeCloseTo(distanceBefore, 5);
    });

    it('handles already normalized plane', () => {
      const plane = new Plane(new Vector3(0, 1, 0), -5);
      const originalNormal = plane.normal.clone();
      const originalConstant = plane.constant;

      plane.normalize();

      expect(plane.normal.equals(originalNormal)).toBe(true);
      expect(plane.constant).toBeCloseTo(originalConstant, 5);
    });
  });

  describe('negate', () => {
    it('returns new negated plane', () => {
      const plane = new Plane(new Vector3(0, 1, 0), -5);
      const negated = plane.negate();

      expect(negated.normal.equals(new Vector3(0, -1, 0))).toBe(true);
      expect(negated.constant).toBe(5);
    });

    it('does not modify original plane', () => {
      const plane = new Plane(new Vector3(0, 1, 0), -5);
      const original = plane.clone();

      plane.negate();

      expect(plane.equals(original)).toBe(true);
    });
  });

  describe('negateInPlace', () => {
    it('negates plane in place', () => {
      const plane = new Plane(new Vector3(0, 1, 0), -5);
      plane.negateInPlace();

      expect(plane.normal.equals(new Vector3(0, -1, 0))).toBe(true);
      expect(plane.constant).toBe(5);
    });

    it('double negation returns to original', () => {
      const plane = new Plane(new Vector3(0, 1, 0), -5);
      const original = plane.clone();

      plane.negateInPlace();
      plane.negateInPlace();

      expect(plane.equals(original)).toBe(true);
    });
  });

  describe('distanceToPoint', () => {
    const plane = new Plane(new Vector3(0, 1, 0), -5);

    it('returns positive distance for point in front', () => {
      const distance = plane.distanceToPoint(new Vector3(0, 10, 0));
      expect(distance).toBeCloseTo(5, 5);
    });

    it('returns zero for point on plane', () => {
      const distance = plane.distanceToPoint(new Vector3(0, 5, 0));
      expect(distance).toBeCloseTo(0, 5);
    });

    it('returns negative distance for point behind', () => {
      const distance = plane.distanceToPoint(new Vector3(0, 0, 0));
      expect(distance).toBeCloseTo(-5, 5);
    });

    it('distance is perpendicular', () => {
      const distance1 = plane.distanceToPoint(new Vector3(10, 5, 0));
      const distance2 = plane.distanceToPoint(new Vector3(0, 5, 10));

      expect(distance1).toBeCloseTo(0, 5);
      expect(distance2).toBeCloseTo(0, 5);
    });
  });

  describe('distanceToSphere', () => {
    const plane = new Plane(new Vector3(0, 1, 0), -5);

    it('returns distance to closest point on sphere', () => {
      const sphere = {
        center: new Vector3(0, 10, 0),
        radius: 2,
      };
      const distance = plane.distanceToSphere(sphere);
      expect(distance).toBeCloseTo(3, 5);
    });

    it('returns negative when sphere center is behind plane', () => {
      const sphere = {
        center: new Vector3(0, 3, 0),
        radius: 1,
      };
      const distance = plane.distanceToSphere(sphere);
      expect(distance).toBeCloseTo(-3, 5);
    });
  });

  describe('projectPoint', () => {
    const plane = new Plane(new Vector3(0, 1, 0), -5);

    it('projects point onto plane', () => {
      const point = new Vector3(10, 20, 30);
      const projected = plane.projectPoint(point);

      expect(projected.equals(new Vector3(10, 5, 30))).toBe(true);
    });

    it('leaves point on plane unchanged', () => {
      const point = new Vector3(1, 5, 1);
      const projected = plane.projectPoint(point);

      expect(projected.equals(point)).toBe(true);
    });

    it('projects along normal direction', () => {
      const point = new Vector3(0, 10, 0);
      const projected = plane.projectPoint(point);

      expect(projected.y).toBeCloseTo(5, 5);
      expect(projected.x).toBeCloseTo(0, 5);
      expect(projected.z).toBeCloseTo(0, 5);
    });
  });

  describe('orthoPoint', () => {
    it('is alias for projectPoint', () => {
      const plane = new Plane(new Vector3(0, 1, 0), -5);
      const point = new Vector3(10, 20, 30);

      const projected = plane.projectPoint(point);
      const ortho = plane.orthoPoint(point);

      expect(ortho.equals(projected)).toBe(true);
    });
  });

  describe('coplanarPoint', () => {
    it('returns a point on the plane', () => {
      const plane = new Plane(new Vector3(0, 1, 0), -5);
      const point = plane.coplanarPoint();

      expect(plane.distanceToPoint(point)).toBeCloseTo(0, 5);
    });

    it('returns point along normal direction', () => {
      const plane = new Plane(new Vector3(0, 1, 0), -5);
      const point = plane.coplanarPoint();

      expect(point.equals(new Vector3(0, 5, 0))).toBe(true);
    });

    it('handles plane through origin', () => {
      const plane = new Plane(new Vector3(0, 1, 0), 0);
      const point = plane.coplanarPoint();

      expect(point.equals(Vector3.zero())).toBe(true);
    });
  });

  describe('intersectLine', () => {
    const plane = new Plane(new Vector3(0, 1, 0), -5);

    it('finds intersection point with line segment', () => {
      const start = new Vector3(0, 0, 0);
      const end = new Vector3(0, 10, 0);
      const intersection = plane.intersectLine(start, end);

      expect(intersection).not.toBeNull();
      expect(intersection!.equals(new Vector3(0, 5, 0))).toBe(true);
    });

    it('returns null for parallel line', () => {
      const start = new Vector3(0, 5, 0);
      const end = new Vector3(10, 5, 0);
      const intersection = plane.intersectLine(start, end);

      expect(intersection).toBeNull();
    });

    it('returns null when intersection is outside segment', () => {
      const start = new Vector3(0, 6, 0);
      const end = new Vector3(0, 10, 0);
      const intersection = plane.intersectLine(start, end);

      expect(intersection).toBeNull();
    });

    it('handles line starting on plane', () => {
      const start = new Vector3(0, 5, 0);
      const end = new Vector3(0, 10, 0);
      const intersection = plane.intersectLine(start, end);

      expect(intersection).not.toBeNull();
      expect(intersection!.equals(start)).toBe(true);
    });

    it('handles line ending on plane', () => {
      const start = new Vector3(0, 0, 0);
      const end = new Vector3(0, 5, 0);
      const intersection = plane.intersectLine(start, end);

      expect(intersection).not.toBeNull();
      expect(intersection!.equals(end)).toBe(true);
    });
  });

  describe('intersectsLine', () => {
    const plane = new Plane(new Vector3(0, 1, 0), -5);

    it('detects line crossing plane', () => {
      expect(plane.intersectsLine(
        new Vector3(0, 0, 0),
        new Vector3(0, 10, 0)
      )).toBe(true);
    });

    it('detects line parallel to plane', () => {
      expect(plane.intersectsLine(
        new Vector3(0, 5, 0),
        new Vector3(10, 5, 0)
      )).toBe(false);
    });

    it('detects line on one side of plane', () => {
      expect(plane.intersectsLine(
        new Vector3(0, 6, 0),
        new Vector3(0, 10, 0)
      )).toBe(false);
    });
  });

  describe('intersectsBox', () => {
    const plane = new Plane(new Vector3(0, 1, 0), -5);

    it('detects box crossing plane', () => {
      const box = {
        min: new Vector3(0, 0, 0),
        max: new Vector3(10, 10, 10),
      };
      expect(plane.intersectsBox(box)).toBe(true);
    });

    it('detects box on positive side', () => {
      const box = {
        min: new Vector3(0, 6, 0),
        max: new Vector3(10, 10, 10),
      };
      expect(plane.intersectsBox(box)).toBe(false);
    });

    it('detects box on negative side', () => {
      const box = {
        min: new Vector3(0, 0, 0),
        max: new Vector3(10, 4, 10),
      };
      expect(plane.intersectsBox(box)).toBe(false);
    });

    it('detects box touching plane', () => {
      const box = {
        min: new Vector3(0, 0, 0),
        max: new Vector3(10, 5, 10),
      };
      expect(plane.intersectsBox(box)).toBe(true);
    });
  });

  describe('intersectsSphere', () => {
    const plane = new Plane(new Vector3(0, 1, 0), -5);

    it('detects sphere crossing plane', () => {
      const sphere = {
        center: new Vector3(0, 5, 0),
        radius: 2,
      };
      expect(plane.intersectsSphere(sphere)).toBe(true);
    });

    it('detects sphere touching plane', () => {
      const sphere = {
        center: new Vector3(0, 8, 0),
        radius: 3,
      };
      expect(plane.intersectsSphere(sphere)).toBe(true);
    });

    it('detects separated sphere', () => {
      const sphere = {
        center: new Vector3(0, 10, 0),
        radius: 2,
      };
      expect(plane.intersectsSphere(sphere)).toBe(false);
    });
  });

  describe('applyMatrix4', () => {
    it('transforms plane by translation', () => {
      const plane = new Plane(new Vector3(0, 1, 0), -5);
      const matrix = Matrix4.translation(0, 10, 0);

      plane.applyMatrix4(matrix);

      const point = new Vector3(0, 15, 0);
      expect(plane.distanceToPoint(point)).toBeCloseTo(0, 5);
    });

    it('preserves plane orientation', () => {
      const plane = new Plane(new Vector3(0, 1, 0), -5);
      const matrix = Matrix4.translation(10, 0, 0);

      const originalNormal = plane.normal.clone();
      plane.applyMatrix4(matrix);

      expect(plane.normal.equals(originalNormal)).toBe(true);
    });

    it('handles rotation with normal matrix', () => {
      const plane = new Plane(new Vector3(0, 1, 0), 0);
      const rotation = Matrix4.rotationZ(Math.PI / 2);
      const normalMatrix = new Matrix3().getNormalMatrix(rotation);

      plane.applyMatrix4(rotation, normalMatrix);

      // After 90° rotation around Z, Y normal becomes -X normal
      expect(Math.abs(plane.normal.x)).toBeCloseTo(1, 4);
      expect(Math.abs(plane.normal.y)).toBeCloseTo(0, 4);
    });

    it('computes normal matrix when not provided', () => {
      const plane = new Plane(new Vector3(0, 1, 0), 0);
      const rotation = Matrix4.rotationZ(Math.PI / 2);

      plane.applyMatrix4(rotation);

      expect(Math.abs(plane.normal.x)).toBeCloseTo(1, 4);
    });
  });

  describe('copy and clone operations', () => {
    it('clone() creates independent copy', () => {
      const original = new Plane(new Vector3(0, 1, 0), -5);
      const cloned = original.clone();

      expect(cloned.equals(original)).toBe(true);

      cloned.constant = 10;
      expect(cloned.equals(original)).toBe(false);
    });

    it('copy() copies values from another plane', () => {
      const source = new Plane(new Vector3(0, 1, 0), -5);
      const target = new Plane();

      target.copy(source);

      expect(target.equals(source)).toBe(true);
    });
  });

  describe('set', () => {
    it('sets normal and constant', () => {
      const plane = new Plane();
      const normal = new Vector3(0, 1, 0);

      plane.set(normal, -5);

      expect(plane.normal.equals(normal)).toBe(true);
      expect(plane.constant).toBe(-5);
    });
  });

  describe('equals', () => {
    it('detects equal planes', () => {
      const plane1 = new Plane(new Vector3(0, 1, 0), -5);
      const plane2 = new Plane(new Vector3(0, 1, 0), -5);

      expect(plane1.equals(plane2)).toBe(true);
    });

    it('detects different normals', () => {
      const plane1 = new Plane(new Vector3(0, 1, 0), -5);
      const plane2 = new Plane(new Vector3(1, 0, 0), -5);

      expect(plane1.equals(plane2)).toBe(false);
    });

    it('detects different constants', () => {
      const plane1 = new Plane(new Vector3(0, 1, 0), -5);
      const plane2 = new Plane(new Vector3(0, 1, 0), -10);

      expect(plane1.equals(plane2)).toBe(false);
    });

    it('uses epsilon tolerance', () => {
      const plane1 = new Plane(new Vector3(0, 1, 0), -5);
      const plane2 = new Plane(
        new Vector3(0, 1 + EPSILON * 0.5, 0),
        -5 + EPSILON * 0.5
      );

      expect(plane1.equals(plane2)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles degenerate plane with zero normal', () => {
      const plane = new Plane(Vector3.zero(), 0);

      // Degenerate case - behavior may vary
      expect(plane.normal.equals(Vector3.zero())).toBe(true);
    });

    it('handles plane at origin', () => {
      const plane = new Plane(new Vector3(0, 1, 0), 0);
      expect(plane.distanceToPoint(Vector3.zero())).toBeCloseTo(0, 5);
    });

    it('handles oblique plane', () => {
      const normal = new Vector3(1, 1, 1).normalize();
      const plane = new Plane(normal, 0);

      expect(plane.normal.length()).toBeCloseTo(1, 5);
    });

    it('handles very large distances', () => {
      const plane = new Plane(new Vector3(0, 1, 0), -1e10);
      const point = new Vector3(0, 1e10, 0);

      expect(plane.distanceToPoint(point)).toBeCloseTo(0, 5);
    });
  });
});
