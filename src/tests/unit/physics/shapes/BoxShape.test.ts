import { describe, it, expect } from 'vitest';
import { BoxShape } from '../../../../physics/shapes/BoxShape';
import { ShapeType } from '../../../../physics/Collider';
import { Vector3 } from '../../../../math/Vector3';
import { Matrix4 } from '../../../../math/Matrix4';

describe('BoxShape', () => {
  describe('initialization', () => {
    it('creates with half-extents', () => {
      const extents = new Vector3(1, 2, 3);
      const box = new BoxShape(extents);

      expect(box.extents.x).toBe(1);
      expect(box.extents.y).toBe(2);
      expect(box.extents.z).toBe(3);
    });

    it('has Box shape type', () => {
      const box = new BoxShape(Vector3.one());

      expect(box.type).toBe(ShapeType.Box);
    });

    it('creates with default zero offset', () => {
      const box = new BoxShape(Vector3.one());

      expect(box.offset.x).toBe(0);
      expect(box.offset.y).toBe(0);
      expect(box.offset.z).toBe(0);
    });

    it('creates with custom offset', () => {
      const offset = new Vector3(0, 5, 0);
      const box = new BoxShape(Vector3.one(), offset);

      expect(box.offset.equals(offset)).toBe(true);
    });

    it('cube() creates uniform box', () => {
      const box = BoxShape.cube(4);

      expect(box.extents.x).toBe(2);
      expect(box.extents.y).toBe(2);
      expect(box.extents.z).toBe(2);
    });

    it('fromDimensions() creates box from full size', () => {
      const box = BoxShape.fromDimensions(4, 6, 8);

      expect(box.extents.x).toBe(2);
      expect(box.extents.y).toBe(3);
      expect(box.extents.z).toBe(4);
    });
  });

  describe('AABB computation', () => {
    it('computes AABB at identity transform', () => {
      const box = new BoxShape(new Vector3(1, 2, 3));
      const transform = Matrix4.identity();

      const aabb = box.computeAABB(transform);

      expect(aabb.min.x).toBeCloseTo(-1, 5);
      expect(aabb.max.x).toBeCloseTo(1, 5);
      expect(aabb.min.y).toBeCloseTo(-2, 5);
      expect(aabb.max.y).toBeCloseTo(2, 5);
      expect(aabb.min.z).toBeCloseTo(-3, 5);
      expect(aabb.max.z).toBeCloseTo(3, 5);
    });

    it('computes AABB with translation', () => {
      const box = new BoxShape(Vector3.one());
      const transform = Matrix4.translation(5, 10, -3);

      const aabb = box.computeAABB(transform);

      expect(aabb.min.x).toBeCloseTo(4, 5);
      expect(aabb.max.x).toBeCloseTo(6, 5);
      expect(aabb.min.y).toBeCloseTo(9, 5);
      expect(aabb.max.y).toBeCloseTo(11, 5);
    });

    it('computes AABB with rotation', () => {
      const box = new BoxShape(new Vector3(2, 0.5, 1));
      const transform = Matrix4.rotationZ(Math.PI / 4);

      const aabb = box.computeAABB(transform);

      const expectedExtent = Math.sqrt(2 * 2 + 0.5 * 0.5);
      expect(aabb.max.x).toBeGreaterThan(2);
      expect(aabb.max.y).toBeGreaterThan(0.5);
    });

    it('computes AABB with scale', () => {
      const box = new BoxShape(Vector3.one());
      const transform = Matrix4.scaling(2, 3, 4);

      const aabb = box.computeAABB(transform);

      expect(aabb.max.x).toBeCloseTo(2, 5);
      expect(aabb.max.y).toBeCloseTo(3, 5);
      expect(aabb.max.z).toBeCloseTo(4, 5);
    });

    it('computes AABB with complex transform', () => {
      const box = new BoxShape(Vector3.one());
      const transform = Matrix4.identity()
        .multiply(Matrix4.translation(10, 0, 0))
        .multiply(Matrix4.rotationY(Math.PI / 2));

      const aabb = box.computeAABB(transform);

      expect(aabb.min.x).toBeLessThan(10);
      expect(aabb.max.x).toBeGreaterThan(10);
    });

    it('computes AABB with offset', () => {
      const box = new BoxShape(Vector3.one(), new Vector3(0, 5, 0));
      const transform = Matrix4.identity();

      const aabb = box.computeAABB(transform);

      expect(aabb.min.y).toBeCloseTo(4, 5);
      expect(aabb.max.y).toBeCloseTo(6, 5);
    });

    it('handles negative scale', () => {
      const box = new BoxShape(Vector3.one());
      const transform = Matrix4.scaling(-1, 1, 1);

      const aabb = box.computeAABB(transform);

      expect(aabb.min.x).toBeCloseTo(-1, 5);
      expect(aabb.max.x).toBeCloseTo(1, 5);
    });
  });

  describe('support function', () => {
    it('returns furthest point in direction', () => {
      const box = new BoxShape(new Vector3(1, 2, 3));
      const direction = new Vector3(1, 0, 0);
      const transform = Matrix4.identity();

      const support = box.support(direction, transform);

      expect(support.x).toBeCloseTo(1, 5);
    });

    it('handles negative direction', () => {
      const box = new BoxShape(new Vector3(1, 2, 3));
      const direction = new Vector3(-1, 0, 0);
      const transform = Matrix4.identity();

      const support = box.support(direction, transform);

      expect(support.x).toBeCloseTo(-1, 5);
    });

    it('handles diagonal direction', () => {
      const box = new BoxShape(Vector3.one());
      const direction = new Vector3(1, 1, 1).normalize();
      const transform = Matrix4.identity();

      const support = box.support(direction, transform);

      expect(support.x).toBeCloseTo(1, 5);
      expect(support.y).toBeCloseTo(1, 5);
      expect(support.z).toBeCloseTo(1, 5);
    });

    it('works with transformed box', () => {
      const box = new BoxShape(Vector3.one());
      const direction = new Vector3(1, 0, 0);
      const transform = Matrix4.translation(5, 0, 0);

      const support = box.support(direction, transform);

      expect(support.x).toBeGreaterThan(5);
    });

    it('works with rotated box', () => {
      const box = new BoxShape(new Vector3(2, 0.5, 1));
      const direction = new Vector3(1, 0, 0);
      const transform = Matrix4.rotationY(Math.PI / 2);

      const support = box.support(direction, transform);

      expect(Math.abs(support.z)).toBeGreaterThan(1);
    });

    it('handles offset', () => {
      const box = new BoxShape(Vector3.one(), new Vector3(0, 3, 0));
      const direction = new Vector3(0, 1, 0);
      const transform = Matrix4.identity();

      const support = box.support(direction, transform);

      expect(support.y).toBeCloseTo(4, 5);
    });
  });

  describe('volume computation', () => {
    it('computes correct volume', () => {
      const box = new BoxShape(new Vector3(1, 2, 3));
      const volume = box.getVolume();

      expect(volume).toBeCloseTo(48, 5);
    });

    it('volume scales with dimensions', () => {
      const box1 = new BoxShape(Vector3.one());
      const box2 = new BoxShape(new Vector3(2, 2, 2));

      expect(box2.getVolume()).toBeCloseTo(box1.getVolume() * 8, 5);
    });

    it('unit cube has volume 8', () => {
      const box = new BoxShape(Vector3.one());

      expect(box.getVolume()).toBeCloseTo(8, 5);
    });
  });

  describe('inertia tensor', () => {
    it('computes inertia for unit cube', () => {
      const box = new BoxShape(Vector3.one());
      const mass = 10;
      const inertia = box.computeInertia(mass);

      const Ixx = (mass / 12.0) * (2 * 2 + 2 * 2);
      expect(inertia.elements[0]).toBeCloseTo(Ixx, 5);
      expect(inertia.elements[5]).toBeCloseTo(Ixx, 5);
      expect(inertia.elements[10]).toBeCloseTo(Ixx, 5);
    });

    it('computes inertia for rectangular box', () => {
      const box = new BoxShape(new Vector3(1, 2, 3));
      const mass = 12;
      const inertia = box.computeInertia(mass);

      const w = 2, h = 4, d = 6;
      const Ixx = (mass / 12.0) * (h * h + d * d);
      const Iyy = (mass / 12.0) * (w * w + d * d);
      const Izz = (mass / 12.0) * (w * w + h * h);

      expect(inertia.elements[0]).toBeCloseTo(Ixx, 5);
      expect(inertia.elements[5]).toBeCloseTo(Iyy, 5);
      expect(inertia.elements[10]).toBeCloseTo(Izz, 5);
    });

    it('larger boxes have larger inertia', () => {
      const smallBox = new BoxShape(Vector3.one());
      const largeBox = new BoxShape(new Vector3(2, 2, 2));

      const smallInertia = smallBox.computeInertia(1);
      const largeInertia = largeBox.computeInertia(1);

      expect(largeInertia.elements[0]).toBeGreaterThan(smallInertia.elements[0]);
    });

    it('heavier boxes have larger inertia', () => {
      const box = new BoxShape(Vector3.one());

      const lightInertia = box.computeInertia(1);
      const heavyInertia = box.computeInertia(10);

      expect(heavyInertia.elements[0]).toBeCloseTo(lightInertia.elements[0] * 10, 5);
    });

    it('off-diagonal elements are zero', () => {
      const box = new BoxShape(new Vector3(1, 2, 3));
      const inertia = box.computeInertia(10);

      expect(inertia.elements[1]).toBe(0);
      expect(inertia.elements[2]).toBe(0);
      expect(inertia.elements[4]).toBe(0);
    });
  });

  describe('getCorners', () => {
    it('returns 8 corners', () => {
      const box = new BoxShape(Vector3.one());
      const corners = box.getCorners();

      expect(corners).toHaveLength(8);
    });

    it('corners have correct extents', () => {
      const box = new BoxShape(new Vector3(1, 2, 3));
      const corners = box.getCorners();

      for (const corner of corners) {
        expect(Math.abs(corner.x)).toBe(1);
        expect(Math.abs(corner.y)).toBe(2);
        expect(Math.abs(corner.z)).toBe(3);
      }
    });

    it('all corners are unique', () => {
      const box = new BoxShape(Vector3.one());
      const corners = box.getCorners();

      const uniqueCorners = new Set(corners.map(c => `${c.x},${c.y},${c.z}`));
      expect(uniqueCorners.size).toBe(8);
    });
  });

  describe('getDimensions / setDimensions', () => {
    it('getDimensions() returns full size', () => {
      const box = new BoxShape(new Vector3(1, 2, 3));
      const dimensions = box.getDimensions();

      expect(dimensions.x).toBe(2);
      expect(dimensions.y).toBe(4);
      expect(dimensions.z).toBe(6);
    });

    it('setDimensions() updates extents', () => {
      const box = new BoxShape(Vector3.one());
      box.setDimensions(new Vector3(4, 6, 8));

      expect(box.extents.x).toBe(2);
      expect(box.extents.y).toBe(3);
      expect(box.extents.z).toBe(4);
    });

    it('getDimensions() after setDimensions() matches', () => {
      const box = new BoxShape(Vector3.one());
      const newDimensions = new Vector3(10, 20, 30);

      box.setDimensions(newDimensions);
      const result = box.getDimensions();

      expect(result.x).toBe(newDimensions.x);
      expect(result.y).toBe(newDimensions.y);
      expect(result.z).toBe(newDimensions.z);
    });
  });

  describe('clone', () => {
    it('creates independent copy', () => {
      const original = new BoxShape(new Vector3(1, 2, 3), new Vector3(5, 0, 0));
      const cloned = original.clone();

      expect(cloned.extents.equals(original.extents)).toBe(true);
      expect(cloned.offset.equals(original.offset)).toBe(true);
      expect(cloned).not.toBe(original);
    });

    it('modifying clone does not affect original', () => {
      const original = new BoxShape(Vector3.one());
      const cloned = original.clone();

      cloned.extents.set(5, 5, 5);

      expect(original.extents.x).toBe(1);
    });

    it('modifying clone offset does not affect original', () => {
      const original = new BoxShape(Vector3.one(), Vector3.zero());
      const cloned = original.clone();

      cloned.offset.set(10, 10, 10);

      expect(original.offset.x).toBe(0);
    });
  });

  describe('point containment', () => {
    it('point inside box', () => {
      const box = new BoxShape(new Vector3(2, 2, 2));
      const transform = Matrix4.identity();
      const aabb = box.computeAABB(transform);

      const insidePoint = new Vector3(0, 0, 0);
      const isInside =
        insidePoint.x >= aabb.min.x && insidePoint.x <= aabb.max.x &&
        insidePoint.y >= aabb.min.y && insidePoint.y <= aabb.max.y &&
        insidePoint.z >= aabb.min.z && insidePoint.z <= aabb.max.z;

      expect(isInside).toBe(true);
    });

    it('point outside box', () => {
      const box = new BoxShape(new Vector3(1, 1, 1));
      const transform = Matrix4.identity();
      const aabb = box.computeAABB(transform);

      const outsidePoint = new Vector3(5, 0, 0);
      const isInside =
        outsidePoint.x >= aabb.min.x && outsidePoint.x <= aabb.max.x &&
        outsidePoint.y >= aabb.min.y && outsidePoint.y <= aabb.max.y &&
        outsidePoint.z >= aabb.min.z && outsidePoint.z <= aabb.max.z;

      expect(isInside).toBe(false);
    });

    it('point on box surface', () => {
      const box = new BoxShape(Vector3.one());
      const transform = Matrix4.identity();
      const aabb = box.computeAABB(transform);

      const surfacePoint = new Vector3(1, 0, 0);
      const isInside =
        surfacePoint.x >= aabb.min.x && surfacePoint.x <= aabb.max.x &&
        surfacePoint.y >= aabb.min.y && surfacePoint.y <= aabb.max.y &&
        surfacePoint.z >= aabb.min.z && surfacePoint.z <= aabb.max.z;

      expect(isInside).toBe(true);
    });
  });
});
