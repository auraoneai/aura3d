import { describe, it, expect } from 'vitest';
import { Box3 } from '../../../math/Box3';
import { Vector3 } from '../../../math/Vector3';
import { Matrix4 } from '../../../math/Matrix4';
import { MathConstants } from '../../../math/MathConstants';

const { EPSILON } = MathConstants;

describe('Box3', () => {
  describe('constructor', () => {
    it('creates empty box by default', () => {
      const box = new Box3();
      expect(box.isEmpty).toBe(true);
      expect(box.min.x).toBe(Infinity);
      expect(box.min.y).toBe(Infinity);
      expect(box.min.z).toBe(Infinity);
      expect(box.max.x).toBe(-Infinity);
      expect(box.max.y).toBe(-Infinity);
      expect(box.max.z).toBe(-Infinity);
    });

    it('creates from min and max vectors', () => {
      const min = new Vector3(-1, -2, -3);
      const max = new Vector3(1, 2, 3);
      const box = new Box3(min, max);

      expect(box.isEmpty).toBe(false);
      expect(box.min.equals(min)).toBe(true);
      expect(box.max.equals(max)).toBe(true);
    });

    it('creates valid box when min equals max', () => {
      const point = new Vector3(1, 2, 3);
      const box = new Box3(point, point);

      expect(box.isEmpty).toBe(false);
      expect(box.size.equals(Vector3.zero())).toBe(true);
    });
  });

  describe('static factory methods', () => {
    it('empty() creates empty box', () => {
      const box = Box3.empty();
      expect(box.isEmpty).toBe(true);
    });

    it('fromPoints() creates box from points array', () => {
      const points = [
        new Vector3(0, 0, 0),
        new Vector3(1, 2, 3),
        new Vector3(-1, -2, -3),
      ];
      const box = Box3.fromPoints(points);

      expect(box.min.equals(new Vector3(-1, -2, -3))).toBe(true);
      expect(box.max.equals(new Vector3(1, 2, 3))).toBe(true);
    });

    it('fromPoints() handles empty array', () => {
      const box = Box3.fromPoints([]);
      expect(box.isEmpty).toBe(true);
    });

    it('fromPoints() handles single point', () => {
      const point = new Vector3(1, 2, 3);
      const box = Box3.fromPoints([point]);

      expect(box.min.equals(point)).toBe(true);
      expect(box.max.equals(point)).toBe(true);
    });

    it('fromCenterAndSize() creates box from center and size', () => {
      const center = new Vector3(0, 0, 0);
      const size = new Vector3(2, 4, 6);
      const box = Box3.fromCenterAndSize(center, size);

      expect(box.center.equals(center)).toBe(true);
      expect(box.size.equals(size)).toBe(true);
      expect(box.min.equals(new Vector3(-1, -2, -3))).toBe(true);
      expect(box.max.equals(new Vector3(1, 2, 3))).toBe(true);
    });
  });

  describe('properties', () => {
    it('center returns geometric center', () => {
      const box = new Box3(
        new Vector3(-2, -4, -6),
        new Vector3(2, 4, 6)
      );
      const center = box.center;

      expect(center.equals(new Vector3(0, 0, 0))).toBe(true);
    });

    it('center returns origin for empty box', () => {
      const box = Box3.empty();
      expect(box.center.equals(Vector3.zero())).toBe(true);
    });

    it('center handles non-symmetric boxes', () => {
      const box = new Box3(
        new Vector3(1, 2, 3),
        new Vector3(3, 6, 9)
      );
      expect(box.center.equals(new Vector3(2, 4, 6))).toBe(true);
    });

    it('size returns dimensions', () => {
      const box = new Box3(
        new Vector3(-1, -2, -3),
        new Vector3(1, 2, 3)
      );
      const size = box.size;

      expect(size.equals(new Vector3(2, 4, 6))).toBe(true);
    });

    it('size returns zero for empty box', () => {
      const box = Box3.empty();
      expect(box.size.equals(Vector3.zero())).toBe(true);
    });

    it('getSize() alias works correctly', () => {
      const box = new Box3(
        new Vector3(-1, -2, -3),
        new Vector3(1, 2, 3)
      );
      expect(box.getSize().equals(box.size)).toBe(true);
    });

    it('isEmpty detects empty box', () => {
      const empty = Box3.empty();
      expect(empty.isEmpty).toBe(true);
    });

    it('isEmpty detects non-empty box', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );
      expect(box.isEmpty).toBe(false);
    });

    it('isEmpty detects inverted box', () => {
      const box = new Box3(
        new Vector3(1, 1, 1),
        new Vector3(-1, -1, -1)
      );
      expect(box.isEmpty).toBe(true);
    });
  });

  describe('setFromPoints', () => {
    it('sets bounds from point array', () => {
      const box = new Box3();
      const points = [
        new Vector3(1, 2, 3),
        new Vector3(-1, -2, -3),
        new Vector3(0, 5, 0),
      ];

      box.setFromPoints(points);

      expect(box.min.equals(new Vector3(-1, -2, -3))).toBe(true);
      expect(box.max.equals(new Vector3(1, 5, 3))).toBe(true);
    });

    it('handles scattered points correctly', () => {
      const box = new Box3();
      const points = [
        new Vector3(10, 0, 0),
        new Vector3(0, 20, 0),
        new Vector3(0, 0, 30),
        new Vector3(-5, -10, -15),
      ];

      box.setFromPoints(points);

      expect(box.min.equals(new Vector3(-5, -10, -15))).toBe(true);
      expect(box.max.equals(new Vector3(10, 20, 30))).toBe(true);
    });

    it('makes empty when given empty array', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      box.setFromPoints([]);
      expect(box.isEmpty).toBe(true);
    });
  });

  describe('setFromCenterAndSize', () => {
    it('sets box from center and size', () => {
      const box = new Box3();
      box.setFromCenterAndSize(
        new Vector3(5, 5, 5),
        new Vector3(2, 4, 6)
      );

      expect(box.min.equals(new Vector3(4, 3, 2))).toBe(true);
      expect(box.max.equals(new Vector3(6, 7, 8))).toBe(true);
    });

    it('handles zero size', () => {
      const box = new Box3();
      const center = new Vector3(1, 2, 3);
      box.setFromCenterAndSize(center, Vector3.zero());

      expect(box.min.equals(center)).toBe(true);
      expect(box.max.equals(center)).toBe(true);
    });
  });

  describe('setFromObject', () => {
    it('sets from object with bounding box', () => {
      const box = new Box3();
      const object = {
        boundingBox: new Box3(
          new Vector3(-1, -1, -1),
          new Vector3(1, 1, 1)
        ),
      };

      box.setFromObject(object);
      expect(box.equals(object.boundingBox)).toBe(true);
    });

    it('applies world matrix if provided', () => {
      const box = new Box3();
      const object = {
        boundingBox: new Box3(
          new Vector3(-1, -1, -1),
          new Vector3(1, 1, 1)
        ),
        worldMatrix: Matrix4.translation(5, 0, 0),
      };

      box.setFromObject(object);

      expect(box.min.x).toBeCloseTo(4, 5);
      expect(box.max.x).toBeCloseTo(6, 5);
    });

    it('makes empty when object has no bounding box', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      box.setFromObject({});
      expect(box.isEmpty).toBe(true);
    });
  });

  describe('expansion operations', () => {
    it('expandByPoint() grows to include point', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      box.expandByPoint(new Vector3(2, 0, 0));

      expect(box.min.equals(new Vector3(-1, -1, -1))).toBe(true);
      expect(box.max.equals(new Vector3(2, 1, 1))).toBe(true);
    });

    it('expandByPoint() expands empty box to point', () => {
      const box = Box3.empty();
      const point = new Vector3(1, 2, 3);

      box.expandByPoint(point);

      expect(box.min.equals(point)).toBe(true);
      expect(box.max.equals(point)).toBe(true);
    });

    it('expandByPoint() does not shrink box', () => {
      const box = new Box3(
        new Vector3(-2, -2, -2),
        new Vector3(2, 2, 2)
      );

      box.expandByPoint(new Vector3(0, 0, 0));

      expect(box.min.equals(new Vector3(-2, -2, -2))).toBe(true);
      expect(box.max.equals(new Vector3(2, 2, 2))).toBe(true);
    });

    it('expandByVector() expands in all directions', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      box.expandByVector(new Vector3(1, 2, 3));

      expect(box.min.equals(new Vector3(-2, -3, -4))).toBe(true);
      expect(box.max.equals(new Vector3(2, 3, 4))).toBe(true);
    });

    it('expandByScalar() adds uniform padding', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      box.expandByScalar(1);

      expect(box.min.equals(new Vector3(-2, -2, -2))).toBe(true);
      expect(box.max.equals(new Vector3(2, 2, 2))).toBe(true);
    });

    it('expandByScalar() can shrink with negative values', () => {
      const box = new Box3(
        new Vector3(-2, -2, -2),
        new Vector3(2, 2, 2)
      );

      box.expandByScalar(-1);

      expect(box.min.equals(new Vector3(-1, -1, -1))).toBe(true);
      expect(box.max.equals(new Vector3(1, 1, 1))).toBe(true);
    });

    it('expandByBox() grows to include another box', () => {
      const box1 = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );
      const box2 = new Box3(
        new Vector3(2, 2, 2),
        new Vector3(3, 3, 3)
      );

      box1.expandByBox(box2);

      expect(box1.min.equals(new Vector3(-1, -1, -1))).toBe(true);
      expect(box1.max.equals(new Vector3(3, 3, 3))).toBe(true);
    });
  });

  describe('containment tests', () => {
    const box = new Box3(
      new Vector3(-1, -1, -1),
      new Vector3(1, 1, 1)
    );

    it('containsPoint() detects interior point', () => {
      expect(box.containsPoint(new Vector3(0, 0, 0))).toBe(true);
      expect(box.containsPoint(new Vector3(0.5, 0.5, 0.5))).toBe(true);
    });

    it('containsPoint() detects point on boundary', () => {
      expect(box.containsPoint(new Vector3(1, 0, 0))).toBe(true);
      expect(box.containsPoint(new Vector3(1, 1, 1))).toBe(true);
      expect(box.containsPoint(new Vector3(-1, -1, -1))).toBe(true);
    });

    it('containsPoint() detects exterior point', () => {
      expect(box.containsPoint(new Vector3(2, 0, 0))).toBe(false);
      expect(box.containsPoint(new Vector3(0, 2, 0))).toBe(false);
      expect(box.containsPoint(new Vector3(0, 0, 2))).toBe(false);
    });

    it('containsBox() detects fully contained box', () => {
      const inner = new Box3(
        new Vector3(-0.5, -0.5, -0.5),
        new Vector3(0.5, 0.5, 0.5)
      );
      expect(box.containsBox(inner)).toBe(true);
    });

    it('containsBox() detects identical box', () => {
      const same = box.clone();
      expect(box.containsBox(same)).toBe(true);
    });

    it('containsBox() detects partially overlapping box', () => {
      const partial = new Box3(
        new Vector3(0, 0, 0),
        new Vector3(2, 2, 2)
      );
      expect(box.containsBox(partial)).toBe(false);
    });

    it('containsBox() detects separate box', () => {
      const separate = new Box3(
        new Vector3(2, 2, 2),
        new Vector3(3, 3, 3)
      );
      expect(box.containsBox(separate)).toBe(false);
    });
  });

  describe('intersection tests', () => {
    const box = new Box3(
      new Vector3(-1, -1, -1),
      new Vector3(1, 1, 1)
    );

    it('intersectsBox() detects overlapping boxes', () => {
      const overlapping = new Box3(
        new Vector3(0, 0, 0),
        new Vector3(2, 2, 2)
      );
      expect(box.intersectsBox(overlapping)).toBe(true);
    });

    it('intersectsBox() detects touching boxes', () => {
      const touching = new Box3(
        new Vector3(1, -1, -1),
        new Vector3(2, 1, 1)
      );
      expect(box.intersectsBox(touching)).toBe(true);
    });

    it('intersectsBox() detects separated boxes', () => {
      const separated = new Box3(
        new Vector3(2, 0, 0),
        new Vector3(3, 1, 1)
      );
      expect(box.intersectsBox(separated)).toBe(false);
    });

    it('intersectsSphere() detects sphere overlapping box', () => {
      const sphere = {
        center: new Vector3(0, 0, 0),
        radius: 0.5,
      };
      expect(box.intersectsSphere(sphere)).toBe(true);
    });

    it('intersectsSphere() detects sphere touching box surface', () => {
      const sphere = {
        center: new Vector3(2, 0, 0),
        radius: 1,
      };
      expect(box.intersectsSphere(sphere)).toBe(true);
    });

    it('intersectsSphere() detects separated sphere', () => {
      const sphere = {
        center: new Vector3(3, 0, 0),
        radius: 1,
      };
      expect(box.intersectsSphere(sphere)).toBe(false);
    });

    it('intersectsPlane() detects plane cutting through box', () => {
      const plane = {
        normal: new Vector3(0, 1, 0),
        distance: 0,
      };
      expect(box.intersectsPlane(plane)).toBe(true);
    });

    it('intersectsPlane() detects plane outside box', () => {
      const plane = {
        normal: new Vector3(0, 1, 0),
        distance: -5,
      };
      expect(box.intersectsPlane(plane)).toBe(false);
    });
  });

  describe('geometric operations', () => {
    it('clampPoint() constrains point to box interior', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      const outside = new Vector3(2, 3, 4);
      const clamped = box.clampPoint(outside);

      expect(clamped.equals(new Vector3(1, 1, 1))).toBe(true);
    });

    it('clampPoint() leaves interior point unchanged', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      const inside = new Vector3(0.5, 0.5, 0.5);
      const clamped = box.clampPoint(inside);

      expect(clamped.equals(inside)).toBe(true);
    });

    it('clampPoint() handles partial clamping', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      const point = new Vector3(2, 0, 0);
      const clamped = box.clampPoint(point);

      expect(clamped.equals(new Vector3(1, 0, 0))).toBe(true);
    });

    it('distanceToPoint() returns 0 for interior point', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      expect(box.distanceToPoint(new Vector3(0, 0, 0))).toBe(0);
    });

    it('distanceToPoint() computes distance to exterior point', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      const distance = box.distanceToPoint(new Vector3(2, 0, 0));
      expect(distance).toBeCloseTo(1, 5);
    });

    it('distanceToPoint() handles corner distance', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      const distance = box.distanceToPoint(new Vector3(2, 2, 2));
      expect(distance).toBeCloseTo(Math.sqrt(3), 5);
    });

    it('union() combines two boxes', () => {
      const box1 = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );
      const box2 = new Box3(
        new Vector3(0, 0, 0),
        new Vector3(2, 2, 2)
      );

      const result = box1.union(box2);

      expect(result.min.equals(new Vector3(-1, -1, -1))).toBe(true);
      expect(result.max.equals(new Vector3(2, 2, 2))).toBe(true);
    });

    it('union() does not modify original boxes', () => {
      const box1 = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );
      const box2 = new Box3(
        new Vector3(2, 2, 2),
        new Vector3(3, 3, 3)
      );

      const original1 = box1.clone();
      const original2 = box2.clone();

      box1.union(box2);

      expect(box1.equals(original1)).toBe(true);
      expect(box2.equals(original2)).toBe(true);
    });

    it('intersection() finds overlap region', () => {
      const box1 = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );
      const box2 = new Box3(
        new Vector3(0, 0, 0),
        new Vector3(2, 2, 2)
      );

      const result = box1.intersection(box2);

      expect(result).not.toBeNull();
      expect(result!.min.equals(new Vector3(0, 0, 0))).toBe(true);
      expect(result!.max.equals(new Vector3(1, 1, 1))).toBe(true);
    });

    it('intersection() returns null for non-intersecting boxes', () => {
      const box1 = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );
      const box2 = new Box3(
        new Vector3(2, 2, 2),
        new Vector3(3, 3, 3)
      );

      expect(box1.intersection(box2)).toBeNull();
    });
  });

  describe('transformation', () => {
    it('applyMatrix4() transforms box corners', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );
      const matrix = Matrix4.translation(5, 0, 0);

      const transformed = box.applyMatrix4(matrix);

      expect(transformed.min.x).toBeCloseTo(4, 5);
      expect(transformed.max.x).toBeCloseTo(6, 5);
    });

    it('applyMatrix4() handles rotation correctly', () => {
      const box = new Box3(
        new Vector3(-1, 0, 0),
        new Vector3(1, 0, 0)
      );
      const matrix = Matrix4.rotationZ(Math.PI / 2);

      const transformed = box.applyMatrix4(matrix);

      expect(transformed.min.y).toBeCloseTo(-1, 5);
      expect(transformed.max.y).toBeCloseTo(1, 5);
    });

    it('applyMatrix4() handles scaling', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );
      const matrix = Matrix4.scale(2, 3, 4);

      const transformed = box.applyMatrix4(matrix);

      expect(transformed.min.equals(new Vector3(-2, -3, -4))).toBe(true);
      expect(transformed.max.equals(new Vector3(2, 3, 4))).toBe(true);
    });

    it('applyMatrix4() preserves axis alignment', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );
      const matrix = Matrix4.rotationY(Math.PI / 4);

      const transformed = box.applyMatrix4(matrix);

      // After rotation, box should expand to maintain axis alignment
      expect(transformed.size.x).toBeGreaterThan(2);
      expect(transformed.size.z).toBeGreaterThan(2);
    });

    it('applyMatrix4() handles empty box', () => {
      const box = Box3.empty();
      const matrix = Matrix4.translation(5, 5, 5);

      const transformed = box.applyMatrix4(matrix);

      expect(transformed.isEmpty).toBe(true);
    });
  });

  describe('getCorners', () => {
    it('returns 8 corner points', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      const corners = box.getCorners();

      expect(corners).toHaveLength(8);
    });

    it('corners include min and max points', () => {
      const box = new Box3(
        new Vector3(-1, -2, -3),
        new Vector3(1, 2, 3)
      );

      const corners = box.getCorners();

      expect(corners.some(c => c.equals(box.min))).toBe(true);
      expect(corners.some(c => c.equals(box.max))).toBe(true);
    });

    it('all corners are contained by box', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      const corners = box.getCorners();

      corners.forEach(corner => {
        expect(box.containsPoint(corner)).toBe(true);
      });
    });
  });

  describe('copy and clone operations', () => {
    it('clone() creates independent copy', () => {
      const original = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      const cloned = original.clone();

      expect(cloned.equals(original)).toBe(true);

      cloned.expandByScalar(1);
      expect(cloned.equals(original)).toBe(false);
    });

    it('copy() copies values from another box', () => {
      const source = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );
      const target = Box3.empty();

      target.copy(source);

      expect(target.equals(source)).toBe(true);
    });

    it('makeEmpty() resets to empty state', () => {
      const box = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      box.makeEmpty();

      expect(box.isEmpty).toBe(true);
    });
  });

  describe('equals', () => {
    it('detects equal boxes', () => {
      const box1 = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );
      const box2 = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      expect(box1.equals(box2)).toBe(true);
    });

    it('detects different boxes', () => {
      const box1 = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );
      const box2 = new Box3(
        new Vector3(-2, -2, -2),
        new Vector3(2, 2, 2)
      );

      expect(box1.equals(box2)).toBe(false);
    });

    it('uses epsilon tolerance', () => {
      const box1 = new Box3(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );
      const box2 = new Box3(
        new Vector3(-1 + EPSILON * 0.5, -1, -1),
        new Vector3(1, 1, 1)
      );

      expect(box1.equals(box2)).toBe(true);
    });
  });

  describe('array conversion', () => {
    it('toArray() converts to number array', () => {
      const box = new Box3(
        new Vector3(-1, -2, -3),
        new Vector3(1, 2, 3)
      );

      const arr = box.toArray();

      expect(arr).toEqual([-1, -2, -3, 1, 2, 3]);
    });

    it('fromArray() sets from array', () => {
      const box = new Box3();
      box.fromArray([-1, -2, -3, 1, 2, 3]);

      expect(box.min.equals(new Vector3(-1, -2, -3))).toBe(true);
      expect(box.max.equals(new Vector3(1, 2, 3))).toBe(true);
    });

    it('fromArray() supports offset', () => {
      const box = new Box3();
      box.fromArray([0, 0, -1, -2, -3, 1, 2, 3, 0], 2);

      expect(box.min.equals(new Vector3(-1, -2, -3))).toBe(true);
      expect(box.max.equals(new Vector3(1, 2, 3))).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles degenerate flat box on XY plane', () => {
      const box = new Box3(
        new Vector3(-1, -1, 0),
        new Vector3(1, 1, 0)
      );

      expect(box.isEmpty).toBe(false);
      expect(box.size.z).toBe(0);
    });

    it('handles degenerate line box', () => {
      const box = new Box3(
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0)
      );

      expect(box.isEmpty).toBe(false);
      expect(box.size.y).toBe(0);
      expect(box.size.z).toBe(0);
    });

    it('handles degenerate point box', () => {
      const point = new Vector3(1, 2, 3);
      const box = new Box3(point, point);

      expect(box.isEmpty).toBe(false);
      expect(box.size.equals(Vector3.zero())).toBe(true);
      expect(box.containsPoint(point)).toBe(true);
    });

    it('handles very large boxes', () => {
      const box = new Box3(
        new Vector3(-1e10, -1e10, -1e10),
        new Vector3(1e10, 1e10, 1e10)
      );

      expect(box.isEmpty).toBe(false);
      expect(box.containsPoint(Vector3.zero())).toBe(true);
    });

    it('handles very small boxes near origin', () => {
      const box = new Box3(
        new Vector3(-1e-10, -1e-10, -1e-10),
        new Vector3(1e-10, 1e-10, 1e-10)
      );

      expect(box.isEmpty).toBe(false);
      expect(box.containsPoint(Vector3.zero())).toBe(true);
    });
  });
});
