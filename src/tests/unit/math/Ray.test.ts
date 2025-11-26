import { describe, it, expect } from 'vitest';
import { Ray } from '../../../math/Ray';
import { Vector3 } from '../../../math/Vector3';
import { Matrix4 } from '../../../math/Matrix4';
import { MathConstants } from '../../../math/MathConstants';

const { EPSILON } = MathConstants;

describe('Ray', () => {
  describe('constructor', () => {
    it('creates ray with default origin and direction', () => {
      const ray = new Ray();
      expect(ray.origin.equals(Vector3.zero())).toBe(true);
      expect(ray.direction.equals(new Vector3(0, 0, -1))).toBe(true);
    });

    it('creates ray from origin and direction', () => {
      const origin = new Vector3(1, 2, 3);
      const direction = new Vector3(0, 1, 0);
      const ray = new Ray(origin, direction);

      expect(ray.origin.equals(origin)).toBe(true);
      expect(ray.direction.equals(direction)).toBe(true);
    });

    it('normalizes direction vector', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(2, 0, 0));
      expect(ray.direction.length()).toBeCloseTo(1, 5);
    });

    it('handles already normalized direction', () => {
      const direction = new Vector3(0, 1, 0);
      const ray = new Ray(Vector3.zero(), direction);
      expect(ray.direction.length()).toBeCloseTo(1, 5);
    });
  });

  describe('static factory methods', () => {
    it('fromPoints() creates ray from two points', () => {
      const start = new Vector3(0, 0, 0);
      const end = new Vector3(10, 0, 0);
      const ray = Ray.fromPoints(start, end);

      expect(ray.origin.equals(start)).toBe(true);
      expect(ray.direction.equals(new Vector3(1, 0, 0))).toBe(true);
    });

    it('fromPoints() normalizes direction', () => {
      const start = new Vector3(0, 0, 0);
      const end = new Vector3(5, 0, 0);
      const ray = Ray.fromPoints(start, end);

      expect(ray.direction.length()).toBeCloseTo(1, 5);
    });
  });

  describe('set', () => {
    it('sets origin and direction', () => {
      const ray = new Ray();
      const origin = new Vector3(1, 2, 3);
      const direction = new Vector3(0, 1, 0);

      ray.set(origin, direction);

      expect(ray.origin.equals(origin)).toBe(true);
      expect(ray.direction.equals(direction)).toBe(true);
    });

    it('normalizes direction', () => {
      const ray = new Ray();
      ray.set(Vector3.zero(), new Vector3(2, 0, 0));

      expect(ray.direction.length()).toBeCloseTo(1, 5);
    });
  });

  describe('lookAt', () => {
    it('points ray towards target', () => {
      const ray = new Ray(Vector3.zero());
      const target = new Vector3(10, 0, 0);

      ray.lookAt(target);

      expect(ray.direction.equals(new Vector3(1, 0, 0))).toBe(true);
    });

    it('normalizes direction to target', () => {
      const ray = new Ray(Vector3.zero());
      const target = new Vector3(5, 0, 0);

      ray.lookAt(target);

      expect(ray.direction.length()).toBeCloseTo(1, 5);
    });

    it('handles oblique targets', () => {
      const ray = new Ray(Vector3.zero());
      const target = new Vector3(1, 1, 1);

      ray.lookAt(target);

      expect(ray.direction.length()).toBeCloseTo(1, 5);
      const expectedDirection = target.normalize();
      expect(ray.direction.equals(expectedDirection)).toBe(true);
    });
  });

  describe('at', () => {
    it('returns point at parameter t', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(1, 0, 0));
      const point = ray.at(5);

      expect(point.equals(new Vector3(5, 0, 0))).toBe(true);
    });

    it('returns origin at t=0', () => {
      const origin = new Vector3(1, 2, 3);
      const ray = new Ray(origin, new Vector3(0, 1, 0));
      const point = ray.at(0);

      expect(point.equals(origin)).toBe(true);
    });

    it('handles negative t', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(1, 0, 0));
      const point = ray.at(-5);

      expect(point.equals(new Vector3(-5, 0, 0))).toBe(true);
    });

    it('works with oblique directions', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(1, 1, 0).normalize());
      const point = ray.at(Math.sqrt(2));

      expect(point.x).toBeCloseTo(1, 5);
      expect(point.y).toBeCloseTo(1, 5);
    });
  });

  describe('atInPlace', () => {
    it('stores result in provided vector', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(1, 0, 0));
      const result = new Vector3();

      ray.atInPlace(5, result);

      expect(result.equals(new Vector3(5, 0, 0))).toBe(true);
    });

    it('returns the result vector', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(1, 0, 0));
      const result = new Vector3();

      const returned = ray.atInPlace(5, result);

      expect(returned).toBe(result);
    });
  });

  describe('distanceToPoint', () => {
    const ray = new Ray(Vector3.zero(), new Vector3(1, 0, 0));

    it('returns distance to point perpendicular to ray', () => {
      const point = new Vector3(5, 3, 0);
      const distance = ray.distanceToPoint(point);

      expect(distance).toBeCloseTo(3, 5);
    });

    it('returns zero for point on ray', () => {
      const point = new Vector3(5, 0, 0);
      const distance = ray.distanceToPoint(point);

      expect(distance).toBeCloseTo(0, 5);
    });

    it('measures from origin for point behind ray', () => {
      const point = new Vector3(-5, 3, 0);
      const distance = ray.distanceToPoint(point);

      expect(distance).toBeGreaterThan(0);
    });
  });

  describe('distanceSqToPoint', () => {
    const ray = new Ray(Vector3.zero(), new Vector3(1, 0, 0));

    it('returns squared distance', () => {
      const point = new Vector3(5, 3, 0);
      const distanceSq = ray.distanceSqToPoint(point);

      expect(distanceSq).toBeCloseTo(9, 5);
    });

    it('returns zero for point on ray', () => {
      const point = new Vector3(5, 0, 0);
      const distanceSq = ray.distanceSqToPoint(point);

      expect(distanceSq).toBeCloseTo(0, 5);
    });

    it('is square of distanceToPoint', () => {
      const point = new Vector3(5, 3, 4);
      const distance = ray.distanceToPoint(point);
      const distanceSq = ray.distanceSqToPoint(point);

      expect(distanceSq).toBeCloseTo(distance * distance, 5);
    });
  });

  describe('closestPointToPoint', () => {
    const ray = new Ray(Vector3.zero(), new Vector3(1, 0, 0));

    it('projects point onto ray', () => {
      const point = new Vector3(5, 3, 0);
      const closest = ray.closestPointToPoint(point);

      expect(closest.equals(new Vector3(5, 0, 0))).toBe(true);
    });

    it('returns origin for point behind ray', () => {
      const point = new Vector3(-5, 3, 0);
      const closest = ray.closestPointToPoint(point);

      expect(closest.equals(Vector3.zero())).toBe(true);
    });

    it('returns point itself if on ray', () => {
      const point = new Vector3(5, 0, 0);
      const closest = ray.closestPointToPoint(point);

      expect(closest.equals(point)).toBe(true);
    });
  });

  describe('distanceToPlane', () => {
    const ray = new Ray(Vector3.zero(), new Vector3(0, 1, 0));

    it('returns distance to plane ahead of ray', () => {
      const plane = {
        normal: new Vector3(0, 1, 0),
        constant: -5,
      };
      const distance = ray.distanceToPlane(plane);

      expect(distance).toBeCloseTo(5, 5);
    });

    it('returns null for plane behind ray', () => {
      const plane = {
        normal: new Vector3(0, 1, 0),
        constant: 5,
      };
      const distance = ray.distanceToPlane(plane);

      expect(distance).toBeNull();
    });

    it('returns null for parallel ray', () => {
      const plane = {
        normal: new Vector3(1, 0, 0),
        constant: 0,
      };
      const distance = ray.distanceToPlane(plane);

      expect(distance).toBeNull();
    });

    it('returns 0 for ray starting on plane', () => {
      const ray2 = new Ray(new Vector3(0, 5, 0), new Vector3(0, 1, 0));
      const plane = {
        normal: new Vector3(0, 1, 0),
        constant: -5,
      };
      const distance = ray2.distanceToPlane(plane);

      expect(distance).toBeCloseTo(0, 5);
    });
  });

  describe('intersectSphere', () => {
    const ray = new Ray(Vector3.zero(), new Vector3(0, 0, -1));

    it('intersects sphere ahead of ray', () => {
      const sphere = {
        center: new Vector3(0, 0, -5),
        radius: 1,
      };
      const hit = ray.intersectSphere(sphere);

      expect(hit).not.toBeNull();
      expect(hit!.t).toBeCloseTo(4, 5);
      expect(hit!.point.equals(new Vector3(0, 0, -4))).toBe(true);
    });

    it('returns null for sphere behind ray', () => {
      const sphere = {
        center: new Vector3(0, 0, 5),
        radius: 1,
      };
      const hit = ray.intersectSphere(sphere);

      expect(hit).toBeNull();
    });

    it('returns null for miss', () => {
      const sphere = {
        center: new Vector3(10, 0, -5),
        radius: 1,
      };
      const hit = ray.intersectSphere(sphere);

      expect(hit).toBeNull();
    });

    it('hits sphere from inside', () => {
      const sphere = {
        center: Vector3.zero(),
        radius: 5,
      };
      const hit = ray.intersectSphere(sphere);

      expect(hit).not.toBeNull();
      expect(hit!.t).toBeGreaterThan(0);
    });

    it('returns entry point not exit', () => {
      const sphere = {
        center: new Vector3(0, 0, -10),
        radius: 2,
      };
      const hit = ray.intersectSphere(sphere);

      expect(hit).not.toBeNull();
      expect(hit!.t).toBeCloseTo(8, 5);
    });
  });

  describe('intersectBox', () => {
    const ray = new Ray(Vector3.zero(), new Vector3(1, 0, 0));

    it('intersects box ahead of ray', () => {
      const box = {
        min: new Vector3(5, -1, -1),
        max: new Vector3(7, 1, 1),
      };
      const hit = ray.intersectBox(box);

      expect(hit).not.toBeNull();
      expect(hit!.t).toBeCloseTo(5, 5);
      expect(hit!.point.equals(new Vector3(5, 0, 0))).toBe(true);
    });

    it('returns null for box behind ray', () => {
      const box = {
        min: new Vector3(-10, -1, -1),
        max: new Vector3(-5, 1, 1),
      };
      const hit = ray.intersectBox(box);

      expect(hit).toBeNull();
    });

    it('returns null for miss', () => {
      const box = {
        min: new Vector3(5, 5, 5),
        max: new Vector3(7, 7, 7),
      };
      const hit = ray.intersectBox(box);

      expect(hit).toBeNull();
    });

    it('hits box from inside', () => {
      const box = {
        min: new Vector3(-1, -1, -1),
        max: new Vector3(1, 1, 1),
      };
      const hit = ray.intersectBox(box);

      expect(hit).not.toBeNull();
    });

    it('handles ray parallel to box face', () => {
      const ray2 = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
      const box = {
        min: new Vector3(-1, 1, -1),
        max: new Vector3(1, 3, 1),
      };
      const hit = ray2.intersectBox(box);

      expect(hit).not.toBeNull();
      expect(hit!.t).toBeCloseTo(1, 5);
    });
  });

  describe('intersectPlane', () => {
    const ray = new Ray(Vector3.zero(), new Vector3(0, 1, 0));

    it('intersects plane ahead of ray', () => {
      const plane = {
        normal: new Vector3(0, 1, 0),
        constant: -5,
      };
      const hit = ray.intersectPlane(plane);

      expect(hit).not.toBeNull();
      expect(hit!.t).toBeCloseTo(5, 5);
      expect(hit!.point.equals(new Vector3(0, 5, 0))).toBe(true);
    });

    it('returns null for plane behind ray', () => {
      const plane = {
        normal: new Vector3(0, 1, 0),
        constant: 5,
      };
      const hit = ray.intersectPlane(plane);

      expect(hit).toBeNull();
    });

    it('returns null for parallel ray', () => {
      const plane = {
        normal: new Vector3(1, 0, 0),
        constant: 0,
      };
      const hit = ray.intersectPlane(plane);

      expect(hit).toBeNull();
    });

    it('handles oblique intersection', () => {
      const ray2 = new Ray(Vector3.zero(), new Vector3(1, 1, 0).normalize());
      const plane = {
        normal: new Vector3(0, 1, 0),
        constant: -5,
      };
      const hit = ray2.intersectPlane(plane);

      expect(hit).not.toBeNull();
      expect(hit!.point.y).toBeCloseTo(5, 5);
    });
  });

  describe('intersectTriangle', () => {
    const ray = new Ray(Vector3.zero(), new Vector3(0, 0, -1));

    it('intersects triangle ahead of ray', () => {
      const a = new Vector3(-1, -1, -5);
      const b = new Vector3(1, -1, -5);
      const c = new Vector3(0, 1, -5);
      const hit = ray.intersectTriangle(a, b, c);

      expect(hit).not.toBeNull();
      expect(hit!.t).toBeCloseTo(5, 5);
      expect(hit!.point.z).toBeCloseTo(-5, 5);
    });

    it('returns barycentric coordinates', () => {
      const a = new Vector3(-1, -1, -5);
      const b = new Vector3(1, -1, -5);
      const c = new Vector3(0, 1, -5);
      const hit = ray.intersectTriangle(a, b, c);

      expect(hit).not.toBeNull();
      expect(hit!.u).toBeGreaterThanOrEqual(0);
      expect(hit!.v).toBeGreaterThanOrEqual(0);
      expect(hit!.u + hit!.v).toBeLessThanOrEqual(1);
    });

    it('returns null for miss', () => {
      const a = new Vector3(10, 10, -5);
      const b = new Vector3(11, 10, -5);
      const c = new Vector3(10.5, 11, -5);
      const hit = ray.intersectTriangle(a, b, c);

      expect(hit).toBeNull();
    });

    it('returns null for triangle behind ray', () => {
      const a = new Vector3(-1, -1, 5);
      const b = new Vector3(1, -1, 5);
      const c = new Vector3(0, 1, 5);
      const hit = ray.intersectTriangle(a, b, c);

      expect(hit).toBeNull();
    });

    it('handles backface culling', () => {
      const a = new Vector3(-1, -1, -5);
      const b = new Vector3(1, -1, -5);
      const c = new Vector3(0, 1, -5);

      // Reverse winding for back face
      const hit = ray.intersectTriangle(c, b, a, true);

      expect(hit).toBeNull();
    });

    it('hits triangle without backface culling', () => {
      const a = new Vector3(-1, -1, -5);
      const b = new Vector3(1, -1, -5);
      const c = new Vector3(0, 1, -5);

      const hit = ray.intersectTriangle(c, b, a, false);

      expect(hit).not.toBeNull();
    });

    it('hits triangle vertex', () => {
      const ray2 = new Ray(new Vector3(-1, -1, 0), new Vector3(0, 0, -1));
      const a = new Vector3(-1, -1, -5);
      const b = new Vector3(1, -1, -5);
      const c = new Vector3(0, 1, -5);
      const hit = ray2.intersectTriangle(a, b, c);

      expect(hit).not.toBeNull();
    });

    it('hits triangle edge', () => {
      const ray2 = new Ray(new Vector3(0, -1, 0), new Vector3(0, 0, -1));
      const a = new Vector3(-1, -1, -5);
      const b = new Vector3(1, -1, -5);
      const c = new Vector3(0, 1, -5);
      const hit = ray2.intersectTriangle(a, b, c);

      expect(hit).not.toBeNull();
    });
  });

  describe('boolean intersection tests', () => {
    it('intersectsSphere() returns boolean', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(0, 0, -1));
      const sphere = {
        center: new Vector3(0, 0, -5),
        radius: 1,
      };

      expect(ray.intersectsSphere(sphere)).toBe(true);
    });

    it('intersectsBox() returns boolean', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(1, 0, 0));
      const box = {
        min: new Vector3(5, -1, -1),
        max: new Vector3(7, 1, 1),
      };

      expect(ray.intersectsBox(box)).toBe(true);
    });

    it('intersectsPlane() returns boolean', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(0, 1, 0));
      const plane = {
        normal: new Vector3(0, 1, 0),
        constant: -5,
      };

      expect(ray.intersectsPlane(plane)).toBe(true);
    });
  });

  describe('applyMatrix4', () => {
    it('transforms origin by translation', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(1, 0, 0));
      const matrix = Matrix4.translation(5, 0, 0);

      ray.applyMatrix4(matrix);

      expect(ray.origin.equals(new Vector3(5, 0, 0))).toBe(true);
    });

    it('transforms direction by rotation', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(1, 0, 0));
      const matrix = Matrix4.rotationZ(Math.PI / 2);

      ray.applyMatrix4(matrix);

      expect(ray.direction.y).toBeCloseTo(1, 5);
      expect(ray.direction.x).toBeCloseTo(0, 5);
    });

    it('renormalizes direction after transform', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(1, 0, 0));
      const matrix = Matrix4.scale(2, 2, 2);

      ray.applyMatrix4(matrix);

      expect(ray.direction.length()).toBeCloseTo(1, 5);
    });

    it('combines transformations', () => {
      const ray = new Ray(new Vector3(1, 0, 0), new Vector3(0, 1, 0));
      const matrix = Matrix4.translation(5, 5, 0)
        .multiply(Matrix4.rotationZ(Math.PI / 2));

      ray.applyMatrix4(matrix);

      expect(ray.origin.x).toBeCloseTo(5, 5);
      expect(ray.direction.length()).toBeCloseTo(1, 5);
    });
  });

  describe('copy and clone operations', () => {
    it('clone() creates independent copy', () => {
      const original = new Ray(new Vector3(1, 2, 3), new Vector3(0, 1, 0));
      const cloned = original.clone();

      expect(cloned.equals(original)).toBe(true);

      cloned.origin.x = 10;
      expect(cloned.equals(original)).toBe(false);
    });

    it('copy() copies values from another ray', () => {
      const source = new Ray(new Vector3(1, 2, 3), new Vector3(0, 1, 0));
      const target = new Ray();

      target.copy(source);

      expect(target.equals(source)).toBe(true);
    });
  });

  describe('equals', () => {
    it('detects equal rays', () => {
      const ray1 = new Ray(new Vector3(1, 2, 3), new Vector3(0, 1, 0));
      const ray2 = new Ray(new Vector3(1, 2, 3), new Vector3(0, 1, 0));

      expect(ray1.equals(ray2)).toBe(true);
    });

    it('detects different origins', () => {
      const ray1 = new Ray(new Vector3(1, 2, 3), new Vector3(0, 1, 0));
      const ray2 = new Ray(new Vector3(4, 5, 6), new Vector3(0, 1, 0));

      expect(ray1.equals(ray2)).toBe(false);
    });

    it('detects different directions', () => {
      const ray1 = new Ray(new Vector3(1, 2, 3), new Vector3(0, 1, 0));
      const ray2 = new Ray(new Vector3(1, 2, 3), new Vector3(1, 0, 0));

      expect(ray1.equals(ray2)).toBe(false);
    });

    it('uses epsilon tolerance', () => {
      const ray1 = new Ray(new Vector3(1, 2, 3), new Vector3(0, 1, 0));
      const ray2 = new Ray(
        new Vector3(1 + EPSILON * 0.5, 2, 3),
        new Vector3(0, 1 + EPSILON * 0.5, 0).normalize()
      );

      expect(ray1.equals(ray2)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles ray starting inside sphere', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(1, 0, 0));
      const sphere = {
        center: Vector3.zero(),
        radius: 10,
      };
      const hit = ray.intersectSphere(sphere);

      expect(hit).not.toBeNull();
      expect(hit!.t).toBeGreaterThan(0);
    });

    it('handles ray starting inside box', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(1, 0, 0));
      const box = {
        min: new Vector3(-1, -1, -1),
        max: new Vector3(1, 1, 1),
      };
      const hit = ray.intersectBox(box);

      expect(hit).not.toBeNull();
    });

    it('handles ray parallel to box edge', () => {
      const ray = new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
      const box = {
        min: new Vector3(0, 0, 0),
        max: new Vector3(1, 1, 1),
      };
      const hit = ray.intersectBox(box);

      expect(hit).not.toBeNull();
    });

    it('handles grazing sphere hit', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(0, 0, -1));
      const sphere = {
        center: new Vector3(1, 0, -5),
        radius: 1,
      };
      const hit = ray.intersectSphere(sphere);

      expect(hit).not.toBeNull();
    });

    it('handles very small triangle', () => {
      const ray = new Ray(Vector3.zero(), new Vector3(0, 0, -1));
      const a = new Vector3(-0.001, -0.001, -5);
      const b = new Vector3(0.001, -0.001, -5);
      const c = new Vector3(0, 0.001, -5);
      const hit = ray.intersectTriangle(a, b, c);

      expect(hit).not.toBeNull();
    });
  });
});
