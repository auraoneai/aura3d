import { describe, it, expect } from 'vitest';
import { SphereShape } from '../../../../physics/shapes/SphereShape';
import { ShapeType } from '../../../../physics/Collider';
import { Vector3 } from '../../../../math/Vector3';
import { Matrix4 } from '../../../../math/Matrix4';

describe('SphereShape', () => {
  describe('initialization', () => {
    it('creates with radius', () => {
      const sphere = new SphereShape(2.5);

      expect(sphere.radius).toBe(2.5);
    });

    it('has Sphere shape type', () => {
      const sphere = new SphereShape(1);

      expect(sphere.type).toBe(ShapeType.Sphere);
    });

    it('creates with default zero offset', () => {
      const sphere = new SphereShape(1);

      expect(sphere.offset.x).toBe(0);
      expect(sphere.offset.y).toBe(0);
      expect(sphere.offset.z).toBe(0);
    });

    it('creates with custom offset', () => {
      const offset = new Vector3(0, 5, 0);
      const sphere = new SphereShape(1, offset);

      expect(sphere.offset.equals(offset)).toBe(true);
    });

    it('fromDiameter() creates sphere', () => {
      const sphere = SphereShape.fromDiameter(4);

      expect(sphere.radius).toBe(2);
    });

    it('unit() creates unit sphere', () => {
      const sphere = SphereShape.unit();

      expect(sphere.radius).toBe(1);
    });
  });

  describe('AABB computation', () => {
    it('computes AABB at identity transform', () => {
      const sphere = new SphereShape(2);
      const transform = Matrix4.identity();

      const aabb = sphere.computeAABB(transform);

      expect(aabb.min.x).toBeCloseTo(-2, 5);
      expect(aabb.max.x).toBeCloseTo(2, 5);
      expect(aabb.min.y).toBeCloseTo(-2, 5);
      expect(aabb.max.y).toBeCloseTo(2, 5);
      expect(aabb.min.z).toBeCloseTo(-2, 5);
      expect(aabb.max.z).toBeCloseTo(2, 5);
    });

    it('computes AABB with translation', () => {
      const sphere = new SphereShape(1);
      const transform = Matrix4.translation(5, 10, -3);

      const aabb = sphere.computeAABB(transform);

      expect(aabb.min.x).toBeCloseTo(4, 5);
      expect(aabb.max.x).toBeCloseTo(6, 5);
      expect(aabb.min.y).toBeCloseTo(9, 5);
      expect(aabb.max.y).toBeCloseTo(11, 5);
      expect(aabb.min.z).toBeCloseTo(-4, 5);
      expect(aabb.max.z).toBeCloseTo(-2, 5);
    });

    it('computes AABB with uniform scale', () => {
      const sphere = new SphereShape(1);
      const transform = Matrix4.scaling(3, 3, 3);

      const aabb = sphere.computeAABB(transform);

      expect(aabb.min.x).toBeCloseTo(-3, 5);
      expect(aabb.max.x).toBeCloseTo(3, 5);
    });

    it('computes AABB with non-uniform scale using max', () => {
      const sphere = new SphereShape(1);
      const transform = Matrix4.scaling(2, 5, 3);

      const aabb = sphere.computeAABB(transform);

      expect(aabb.min.x).toBeCloseTo(-5, 5);
      expect(aabb.max.x).toBeCloseTo(5, 5);
      expect(aabb.min.y).toBeCloseTo(-5, 5);
      expect(aabb.max.y).toBeCloseTo(5, 5);
    });

    it('rotation does not affect sphere AABB', () => {
      const sphere = new SphereShape(2);
      const transform1 = Matrix4.identity();
      const transform2 = Matrix4.rotationY(Math.PI / 4);

      const aabb1 = sphere.computeAABB(transform1);
      const aabb2 = sphere.computeAABB(transform2);

      expect(aabb1.min.x).toBeCloseTo(aabb2.min.x, 5);
      expect(aabb1.max.x).toBeCloseTo(aabb2.max.x, 5);
    });

    it('computes AABB with offset', () => {
      const sphere = new SphereShape(1, new Vector3(0, 5, 0));
      const transform = Matrix4.identity();

      const aabb = sphere.computeAABB(transform);

      expect(aabb.min.y).toBeCloseTo(4, 5);
      expect(aabb.max.y).toBeCloseTo(6, 5);
    });

    it('handles negative scale', () => {
      const sphere = new SphereShape(1);
      const transform = Matrix4.scaling(-2, 2, 2);

      const aabb = sphere.computeAABB(transform);

      expect(aabb.min.x).toBeCloseTo(-2, 5);
      expect(aabb.max.x).toBeCloseTo(2, 5);
    });

    it('AABB is always cubic for sphere', () => {
      const sphere = new SphereShape(3);
      const transform = Matrix4.scaling(1, 2, 0.5);

      const aabb = sphere.computeAABB(transform);

      const width = aabb.max.x - aabb.min.x;
      const height = aabb.max.y - aabb.min.y;
      const depth = aabb.max.z - aabb.min.z;

      expect(width).toBeCloseTo(height, 5);
      expect(height).toBeCloseTo(depth, 5);
    });
  });

  describe('support function', () => {
    it('returns furthest point in direction', () => {
      const sphere = new SphereShape(2);
      const direction = new Vector3(1, 0, 0);
      const transform = Matrix4.identity();

      const support = sphere.support(direction, transform);

      expect(support.x).toBeCloseTo(2, 5);
      expect(support.y).toBeCloseTo(0, 5);
      expect(support.z).toBeCloseTo(0, 5);
    });

    it('handles negative direction', () => {
      const sphere = new SphereShape(2);
      const direction = new Vector3(-1, 0, 0);
      const transform = Matrix4.identity();

      const support = sphere.support(direction, transform);

      expect(support.x).toBeCloseTo(-2, 5);
    });

    it('handles diagonal direction', () => {
      const sphere = new SphereShape(1);
      const direction = new Vector3(1, 1, 1).normalize();
      const transform = Matrix4.identity();

      const support = sphere.support(direction, transform);

      const length = support.length();
      expect(length).toBeCloseTo(1, 5);
    });

    it('works with transformed sphere', () => {
      const sphere = new SphereShape(1);
      const direction = new Vector3(1, 0, 0);
      const transform = Matrix4.translation(5, 0, 0);

      const support = sphere.support(direction, transform);

      expect(support.x).toBeCloseTo(6, 5);
      expect(support.y).toBeCloseTo(0, 5);
    });

    it('works with scaled sphere', () => {
      const sphere = new SphereShape(1);
      const direction = new Vector3(1, 0, 0);
      const transform = Matrix4.scaling(3, 3, 3);

      const support = sphere.support(direction, transform);

      expect(support.x).toBeCloseTo(3, 5);
    });

    it('handles offset', () => {
      const sphere = new SphereShape(1, new Vector3(0, 3, 0));
      const direction = new Vector3(0, 1, 0);
      const transform = Matrix4.identity();

      const support = sphere.support(direction, transform);

      expect(support.y).toBeCloseTo(4, 5);
    });

    it('support point is always on surface', () => {
      const sphere = new SphereShape(2);
      const directions = [
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, 0, 1),
        new Vector3(1, 1, 1).normalize(),
        new Vector3(-1, 0.5, 0.3).normalize()
      ];

      const transform = Matrix4.identity();

      for (const direction of directions) {
        const support = sphere.support(direction, transform);
        const distance = support.length();
        expect(distance).toBeCloseTo(2, 5);
      }
    });
  });

  describe('volume computation', () => {
    it('computes correct volume', () => {
      const sphere = new SphereShape(1);
      const volume = sphere.getVolume();

      const expected = (4 / 3) * Math.PI;
      expect(volume).toBeCloseTo(expected, 5);
    });

    it('volume scales with radius cubed', () => {
      const sphere1 = new SphereShape(1);
      const sphere2 = new SphereShape(2);

      expect(sphere2.getVolume()).toBeCloseTo(sphere1.getVolume() * 8, 5);
    });

    it('radius 2 sphere has correct volume', () => {
      const sphere = new SphereShape(2);
      const volume = sphere.getVolume();

      const expected = (4 / 3) * Math.PI * 8;
      expect(volume).toBeCloseTo(expected, 5);
    });

    it('very small sphere has very small volume', () => {
      const sphere = new SphereShape(0.1);
      const volume = sphere.getVolume();

      expect(volume).toBeLessThan(0.01);
    });

    it('large sphere has large volume', () => {
      const sphere = new SphereShape(100);
      const volume = sphere.getVolume();

      expect(volume).toBeGreaterThan(1000000);
    });
  });

  describe('inertia tensor', () => {
    it('computes inertia for unit sphere', () => {
      const sphere = new SphereShape(1);
      const mass = 10;
      const inertia = sphere.computeInertia(mass);

      const I = (2 / 5) * mass * 1;
      expect(inertia.elements[0]).toBeCloseTo(I, 5);
      expect(inertia.elements[5]).toBeCloseTo(I, 5);
      expect(inertia.elements[10]).toBeCloseTo(I, 5);
    });

    it('inertia is uniform in all axes', () => {
      const sphere = new SphereShape(2);
      const inertia = sphere.computeInertia(10);

      expect(inertia.elements[0]).toBeCloseTo(inertia.elements[5], 5);
      expect(inertia.elements[5]).toBeCloseTo(inertia.elements[10], 5);
    });

    it('larger spheres have larger inertia', () => {
      const smallSphere = new SphereShape(1);
      const largeSphere = new SphereShape(2);

      const smallInertia = smallSphere.computeInertia(1);
      const largeInertia = largeSphere.computeInertia(1);

      expect(largeInertia.elements[0]).toBeGreaterThan(smallInertia.elements[0]);
    });

    it('heavier spheres have larger inertia', () => {
      const sphere = new SphereShape(1);

      const lightInertia = sphere.computeInertia(1);
      const heavyInertia = sphere.computeInertia(10);

      expect(heavyInertia.elements[0]).toBeCloseTo(lightInertia.elements[0] * 10, 5);
    });

    it('inertia scales with radius squared', () => {
      const sphere1 = new SphereShape(1);
      const sphere2 = new SphereShape(2);

      const inertia1 = sphere1.computeInertia(1);
      const inertia2 = sphere2.computeInertia(1);

      expect(inertia2.elements[0]).toBeCloseTo(inertia1.elements[0] * 4, 5);
    });

    it('off-diagonal elements are zero', () => {
      const sphere = new SphereShape(2);
      const inertia = sphere.computeInertia(10);

      expect(inertia.elements[1]).toBe(0);
      expect(inertia.elements[2]).toBe(0);
      expect(inertia.elements[4]).toBe(0);
    });
  });

  describe('diameter methods', () => {
    it('getDiameter() returns correct value', () => {
      const sphere = new SphereShape(3);

      expect(sphere.getDiameter()).toBe(6);
    });

    it('setDiameter() updates radius', () => {
      const sphere = new SphereShape(1);
      sphere.setDiameter(10);

      expect(sphere.radius).toBe(5);
    });

    it('getDiameter() after setDiameter() matches', () => {
      const sphere = new SphereShape(1);
      sphere.setDiameter(8);

      expect(sphere.getDiameter()).toBe(8);
    });
  });

  describe('surface area', () => {
    it('computes correct surface area', () => {
      const sphere = new SphereShape(1);
      const area = sphere.getSurfaceArea();

      const expected = 4 * Math.PI;
      expect(area).toBeCloseTo(expected, 5);
    });

    it('surface area scales with radius squared', () => {
      const sphere1 = new SphereShape(1);
      const sphere2 = new SphereShape(2);

      expect(sphere2.getSurfaceArea()).toBeCloseTo(sphere1.getSurfaceArea() * 4, 5);
    });

    it('radius 3 sphere has correct surface area', () => {
      const sphere = new SphereShape(3);
      const area = sphere.getSurfaceArea();

      const expected = 4 * Math.PI * 9;
      expect(area).toBeCloseTo(expected, 5);
    });
  });

  describe('clone', () => {
    it('creates independent copy', () => {
      const original = new SphereShape(5, new Vector3(1, 2, 3));
      const cloned = original.clone();

      expect(cloned.radius).toBe(original.radius);
      expect(cloned.offset.equals(original.offset)).toBe(true);
      expect(cloned).not.toBe(original);
    });

    it('modifying clone does not affect original', () => {
      const original = new SphereShape(2);
      const cloned = original.clone();

      cloned.radius = 10;

      expect(original.radius).toBe(2);
    });

    it('modifying clone offset does not affect original', () => {
      const original = new SphereShape(1, Vector3.zero());
      const cloned = original.clone();

      cloned.offset.set(10, 10, 10);

      expect(original.offset.x).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles very small radius', () => {
      const sphere = new SphereShape(0.0001);
      const transform = Matrix4.identity();
      const aabb = sphere.computeAABB(transform);

      expect(aabb.max.x - aabb.min.x).toBeCloseTo(0.0002, 5);
    });

    it('handles very large radius', () => {
      const sphere = new SphereShape(1000);
      const transform = Matrix4.identity();
      const aabb = sphere.computeAABB(transform);

      expect(aabb.max.x - aabb.min.x).toBeCloseTo(2000, 5);
    });

    it('zero radius sphere has zero volume', () => {
      const sphere = new SphereShape(0);
      const volume = sphere.getVolume();

      expect(volume).toBe(0);
    });

    it('handles extreme scale', () => {
      const sphere = new SphereShape(1);
      const transform = Matrix4.scaling(1000, 1000, 1000);
      const aabb = sphere.computeAABB(transform);

      expect(aabb.max.x).toBeCloseTo(1000, 2);
    });
  });
});
