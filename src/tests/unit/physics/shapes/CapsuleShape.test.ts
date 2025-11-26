import { describe, it, expect } from 'vitest';
import { CapsuleShape, CapsuleAxis } from '../../../../physics/shapes/CapsuleShape';
import { ShapeType } from '../../../../physics/Collider';
import { Vector3 } from '../../../../math/Vector3';
import { Matrix4 } from '../../../../math/Matrix4';

describe('CapsuleShape', () => {
  describe('initialization', () => {
    it('creates with height and radius', () => {
      const capsule = new CapsuleShape(2, 0.5);

      expect(capsule.height).toBe(2);
      expect(capsule.radius).toBe(0.5);
    });

    it('has Capsule shape type', () => {
      const capsule = new CapsuleShape(2, 0.5);

      expect(capsule.type).toBe(ShapeType.Capsule);
    });

    it('defaults to Y axis', () => {
      const capsule = new CapsuleShape(2, 0.5);

      expect(capsule.axis).toBe(CapsuleAxis.Y);
    });

    it('can be aligned to X axis', () => {
      const capsule = new CapsuleShape(2, 0.5, CapsuleAxis.X);

      expect(capsule.axis).toBe(CapsuleAxis.X);
    });

    it('can be aligned to Z axis', () => {
      const capsule = new CapsuleShape(2, 0.5, CapsuleAxis.Z);

      expect(capsule.axis).toBe(CapsuleAxis.Z);
    });

    it('creates with default zero offset', () => {
      const capsule = new CapsuleShape(2, 0.5);

      expect(capsule.offset.x).toBe(0);
      expect(capsule.offset.y).toBe(0);
      expect(capsule.offset.z).toBe(0);
    });

    it('creates with custom offset', () => {
      const offset = new Vector3(0, 5, 0);
      const capsule = new CapsuleShape(2, 0.5, CapsuleAxis.Y, offset);

      expect(capsule.offset.equals(offset)).toBe(true);
    });

    it('character() creates appropriate capsule', () => {
      const capsule = CapsuleShape.character(1.8);

      expect(capsule.height).toBe(1.8);
      expect(capsule.radius).toBeCloseTo(1.8 * 0.25, 5);
      expect(capsule.axis).toBe(CapsuleAxis.Y);
    });
  });

  describe('cylinder height', () => {
    it('getCylinderHeight() returns height minus caps', () => {
      const capsule = new CapsuleShape(3, 0.5);
      const cylinderHeight = capsule.getCylinderHeight();

      expect(cylinderHeight).toBe(2);
    });

    it('handles capsule where height equals diameter', () => {
      const capsule = new CapsuleShape(1, 0.5);
      const cylinderHeight = capsule.getCylinderHeight();

      expect(cylinderHeight).toBe(0);
    });

    it('handles capsule where height is less than diameter', () => {
      const capsule = new CapsuleShape(0.5, 0.5);
      const cylinderHeight = capsule.getCylinderHeight();

      expect(cylinderHeight).toBe(0);
    });

    it('tall capsule has large cylinder height', () => {
      const capsule = new CapsuleShape(10, 1);
      const cylinderHeight = capsule.getCylinderHeight();

      expect(cylinderHeight).toBe(8);
    });
  });

  describe('segment endpoints', () => {
    it('Y-axis capsule has vertical endpoints', () => {
      const capsule = new CapsuleShape(4, 0.5);
      const [p1, p2] = capsule.getSegmentEndpoints();

      expect(p1.y).toBeLessThan(0);
      expect(p2.y).toBeGreaterThan(0);
      expect(p1.x).toBe(0);
      expect(p2.x).toBe(0);
    });

    it('X-axis capsule has horizontal endpoints', () => {
      const capsule = new CapsuleShape(4, 0.5, CapsuleAxis.X);
      const [p1, p2] = capsule.getSegmentEndpoints();

      expect(p1.x).toBeLessThan(0);
      expect(p2.x).toBeGreaterThan(0);
      expect(p1.y).toBe(0);
      expect(p2.y).toBe(0);
    });

    it('Z-axis capsule has depth endpoints', () => {
      const capsule = new CapsuleShape(4, 0.5, CapsuleAxis.Z);
      const [p1, p2] = capsule.getSegmentEndpoints();

      expect(p1.z).toBeLessThan(0);
      expect(p2.z).toBeGreaterThan(0);
      expect(p1.x).toBe(0);
      expect(p2.x).toBe(0);
    });

    it('endpoints are symmetric', () => {
      const capsule = new CapsuleShape(4, 0.5);
      const [p1, p2] = capsule.getSegmentEndpoints();

      expect(p1.y).toBeCloseTo(-p2.y, 5);
    });

    it('sphere capsule has coincident endpoints', () => {
      const capsule = new CapsuleShape(1, 0.5);
      const [p1, p2] = capsule.getSegmentEndpoints();

      expect(p1.equals(p2)).toBe(true);
    });
  });

  describe('AABB computation', () => {
    it('computes AABB for Y-axis capsule', () => {
      const capsule = new CapsuleShape(2, 0.5);
      const transform = Matrix4.identity();

      const aabb = capsule.computeAABB(transform);

      expect(aabb.min.x).toBeCloseTo(-0.5, 5);
      expect(aabb.max.x).toBeCloseTo(0.5, 5);
      expect(aabb.min.y).toBeCloseTo(-1, 5);
      expect(aabb.max.y).toBeCloseTo(1, 5);
    });

    it('computes AABB for X-axis capsule', () => {
      const capsule = new CapsuleShape(2, 0.5, CapsuleAxis.X);
      const transform = Matrix4.identity();

      const aabb = capsule.computeAABB(transform);

      expect(aabb.min.x).toBeCloseTo(-1, 5);
      expect(aabb.max.x).toBeCloseTo(1, 5);
      expect(aabb.min.y).toBeCloseTo(-0.5, 5);
      expect(aabb.max.y).toBeCloseTo(0.5, 5);
    });

    it('computes AABB with translation', () => {
      const capsule = new CapsuleShape(2, 0.5);
      const transform = Matrix4.translation(5, 10, -3);

      const aabb = capsule.computeAABB(transform);

      expect(aabb.min.x).toBeCloseTo(4.5, 5);
      expect(aabb.max.x).toBeCloseTo(5.5, 5);
      expect(aabb.min.y).toBeCloseTo(9, 5);
      expect(aabb.max.y).toBeCloseTo(11, 5);
    });

    it('computes AABB with scale', () => {
      const capsule = new CapsuleShape(2, 0.5);
      const transform = Matrix4.scaling(2, 3, 2);

      const aabb = capsule.computeAABB(transform);

      expect(aabb.max.y).toBeGreaterThan(1);
    });

    it('computes AABB with offset', () => {
      const capsule = new CapsuleShape(2, 0.5, CapsuleAxis.Y, new Vector3(0, 5, 0));
      const transform = Matrix4.identity();

      const aabb = capsule.computeAABB(transform);

      expect(aabb.min.y).toBeCloseTo(4, 5);
      expect(aabb.max.y).toBeCloseTo(6, 5);
    });

    it('sphere capsule has cubic AABB', () => {
      const capsule = new CapsuleShape(1, 0.5);
      const transform = Matrix4.identity();

      const aabb = capsule.computeAABB(transform);

      const width = aabb.max.x - aabb.min.x;
      const height = aabb.max.y - aabb.min.y;
      const depth = aabb.max.z - aabb.min.z;

      expect(width).toBeCloseTo(height, 5);
      expect(height).toBeCloseTo(depth, 5);
    });
  });

  describe('volume computation', () => {
    it('computes correct volume', () => {
      const r = 0.5;
      const h = 2;
      const capsule = new CapsuleShape(h, r);

      const cylinderHeight = h - 2 * r;
      const cylinderVolume = Math.PI * r * r * cylinderHeight;
      const sphereVolume = (4 / 3) * Math.PI * r * r * r;
      const expectedVolume = cylinderVolume + sphereVolume;

      expect(capsule.getVolume()).toBeCloseTo(expectedVolume, 5);
    });

    it('sphere capsule has sphere volume', () => {
      const r = 0.5;
      const capsule = new CapsuleShape(1, r);

      const sphereVolume = (4 / 3) * Math.PI * r * r * r;

      expect(capsule.getVolume()).toBeCloseTo(sphereVolume, 5);
    });

    it('tall capsule has large volume', () => {
      const shortCapsule = new CapsuleShape(2, 0.5);
      const tallCapsule = new CapsuleShape(10, 0.5);

      expect(tallCapsule.getVolume()).toBeGreaterThan(shortCapsule.getVolume());
    });

    it('thick capsule has large volume', () => {
      const thinCapsule = new CapsuleShape(2, 0.2);
      const thickCapsule = new CapsuleShape(2, 0.5);

      expect(thickCapsule.getVolume()).toBeGreaterThan(thinCapsule.getVolume());
    });
  });

  describe('inertia tensor', () => {
    it('computes inertia for capsule', () => {
      const capsule = new CapsuleShape(2, 0.5);
      const mass = 10;
      const inertia = capsule.computeInertia(mass);

      expect(inertia.elements[0]).toBeGreaterThan(0);
      expect(inertia.elements[5]).toBeGreaterThan(0);
      expect(inertia.elements[10]).toBeGreaterThan(0);
    });

    it('Y-axis capsule has different Ixx and Iyy', () => {
      const capsule = new CapsuleShape(4, 0.5, CapsuleAxis.Y);
      const inertia = capsule.computeInertia(10);

      expect(inertia.elements[0]).not.toBeCloseTo(inertia.elements[5], 3);
    });

    it('X-axis capsule has different distribution', () => {
      const capsule = new CapsuleShape(4, 0.5, CapsuleAxis.X);
      const inertia = capsule.computeInertia(10);

      expect(inertia.elements[0]).not.toBeCloseTo(inertia.elements[5], 3);
    });

    it('sphere capsule has uniform inertia', () => {
      const capsule = new CapsuleShape(1, 0.5);
      const inertia = capsule.computeInertia(10);

      expect(inertia.elements[0]).toBeCloseTo(inertia.elements[5], 2);
      expect(inertia.elements[5]).toBeCloseTo(inertia.elements[10], 2);
    });

    it('larger capsules have larger inertia', () => {
      const smallCapsule = new CapsuleShape(2, 0.5);
      const largeCapsule = new CapsuleShape(4, 1);

      const smallInertia = smallCapsule.computeInertia(1);
      const largeInertia = largeCapsule.computeInertia(1);

      expect(largeInertia.elements[0]).toBeGreaterThan(smallInertia.elements[0]);
    });

    it('heavier capsules have larger inertia', () => {
      const capsule = new CapsuleShape(2, 0.5);

      const lightInertia = capsule.computeInertia(1);
      const heavyInertia = capsule.computeInertia(10);

      expect(heavyInertia.elements[0]).toBeCloseTo(lightInertia.elements[0] * 10, 5);
    });

    it('off-diagonal elements are zero', () => {
      const capsule = new CapsuleShape(2, 0.5);
      const inertia = capsule.computeInertia(10);

      expect(inertia.elements[1]).toBe(0);
      expect(inertia.elements[2]).toBe(0);
      expect(inertia.elements[4]).toBe(0);
    });
  });

  describe('support function', () => {
    it('returns furthest point in direction', () => {
      const capsule = new CapsuleShape(2, 0.5);
      const direction = new Vector3(0, 1, 0);
      const transform = Matrix4.identity();

      const support = capsule.support(direction, transform);

      expect(support.y).toBeCloseTo(1, 5);
    });

    it('handles negative direction', () => {
      const capsule = new CapsuleShape(2, 0.5);
      const direction = new Vector3(0, -1, 0);
      const transform = Matrix4.identity();

      const support = capsule.support(direction, transform);

      expect(support.y).toBeCloseTo(-1, 5);
    });

    it('handles radial direction', () => {
      const capsule = new CapsuleShape(2, 0.5);
      const direction = new Vector3(1, 0, 0);
      const transform = Matrix4.identity();

      const support = capsule.support(direction, transform);

      expect(support.x).toBeCloseTo(0.5, 5);
    });

    it('works with transformed capsule', () => {
      const capsule = new CapsuleShape(2, 0.5);
      const direction = new Vector3(0, 1, 0);
      const transform = Matrix4.translation(0, 5, 0);

      const support = capsule.support(direction, transform);

      expect(support.y).toBeGreaterThan(5);
    });

    it('handles offset', () => {
      const capsule = new CapsuleShape(2, 0.5, CapsuleAxis.Y, new Vector3(0, 3, 0));
      const direction = new Vector3(0, 1, 0);
      const transform = Matrix4.identity();

      const support = capsule.support(direction, transform);

      expect(support.y).toBeCloseTo(4, 5);
    });
  });

  describe('clone', () => {
    it('creates independent copy', () => {
      const original = new CapsuleShape(2, 0.5, CapsuleAxis.X, new Vector3(1, 2, 3));
      const cloned = original.clone();

      expect(cloned.height).toBe(original.height);
      expect(cloned.radius).toBe(original.radius);
      expect(cloned.axis).toBe(original.axis);
      expect(cloned.offset.equals(original.offset)).toBe(true);
      expect(cloned).not.toBe(original);
    });

    it('modifying clone does not affect original', () => {
      const original = new CapsuleShape(2, 0.5);
      const cloned = original.clone();

      cloned.height = 10;
      cloned.radius = 2;

      expect(original.height).toBe(2);
      expect(original.radius).toBe(0.5);
    });

    it('modifying clone offset does not affect original', () => {
      const original = new CapsuleShape(2, 0.5, CapsuleAxis.Y, Vector3.zero());
      const cloned = original.clone();

      cloned.offset.set(10, 10, 10);

      expect(original.offset.x).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles very small capsule', () => {
      const capsule = new CapsuleShape(0.1, 0.01);
      const transform = Matrix4.identity();
      const aabb = capsule.computeAABB(transform);

      expect(aabb.max.y - aabb.min.y).toBeCloseTo(0.1, 5);
    });

    it('handles very tall capsule', () => {
      const capsule = new CapsuleShape(100, 0.5);
      const volume = capsule.getVolume();

      expect(volume).toBeGreaterThan(75);
    });

    it('handles different axis orientations consistently', () => {
      const capsuleY = new CapsuleShape(4, 1, CapsuleAxis.Y);
      const capsuleX = new CapsuleShape(4, 1, CapsuleAxis.X);
      const capsuleZ = new CapsuleShape(4, 1, CapsuleAxis.Z);

      expect(capsuleY.getVolume()).toBeCloseTo(capsuleX.getVolume(), 5);
      expect(capsuleX.getVolume()).toBeCloseTo(capsuleZ.getVolume(), 5);
    });
  });
});
