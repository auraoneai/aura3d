import { describe, it, expect } from 'vitest';
import { MeshShape } from '../../../../physics/shapes/MeshShape';
import { ShapeType } from '../../../../physics/Collider';
import { Vector3 } from '../../../../math/Vector3';
import { Matrix4 } from '../../../../math/Matrix4';

describe('MeshShape', () => {
  describe('initialization', () => {
    it('creates triangle mesh from vertices and indices', () => {
      const vertices = [
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0)
      ];
      const indices = [0, 1, 2];

      const mesh = new MeshShape(vertices, indices);

      expect(mesh.vertices).toHaveLength(3);
      expect(mesh.indices).toHaveLength(3);
    });

    it('creates as triangle mesh by default', () => {
      const vertices = [
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0)
      ];
      const indices = [0, 1, 2];

      const mesh = new MeshShape(vertices, indices);

      expect(mesh.isConvex).toBe(false);
      expect(mesh.type).toBe(ShapeType.TriangleMesh);
    });

    it('creates as convex hull when specified', () => {
      const vertices = [
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, 0, 1)
      ];
      const indices = [0, 1, 2, 0, 1, 3];

      const mesh = new MeshShape(vertices, indices, true);

      expect(mesh.isConvex).toBe(true);
      expect(mesh.type).toBe(ShapeType.ConvexHull);
    });

    it('creates with default zero offset', () => {
      const vertices = [new Vector3(0, 0, 0)];
      const indices = [0];

      const mesh = new MeshShape(vertices, indices);

      expect(mesh.offset.x).toBe(0);
      expect(mesh.offset.y).toBe(0);
      expect(mesh.offset.z).toBe(0);
    });

    it('creates with custom offset', () => {
      const vertices = [new Vector3(0, 0, 0)];
      const indices = [0];
      const offset = new Vector3(5, 10, -3);

      const mesh = new MeshShape(vertices, indices, false, offset);

      expect(mesh.offset.equals(offset)).toBe(true);
    });

    it('box() creates box mesh', () => {
      const extents = new Vector3(1, 2, 3);
      const mesh = MeshShape.box(extents);

      expect(mesh.vertices).toHaveLength(8);
      expect(mesh.indices).toHaveLength(36);
      expect(mesh.isConvex).toBe(true);
    });
  });

  describe('triangle mesh creation', () => {
    it('builds triangles from vertices and indices', () => {
      const vertices = [
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0),
        new Vector3(1, 1, 0)
      ];
      const indices = [0, 1, 2, 1, 3, 2];

      const mesh = new MeshShape(vertices, indices);
      const triangles = mesh.getTriangles();

      expect(triangles).toHaveLength(2);
    });

    it('triangles have correct vertices', () => {
      const vertices = [
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0)
      ];
      const indices = [0, 1, 2];

      const mesh = new MeshShape(vertices, indices);
      const triangles = mesh.getTriangles();

      const tri = triangles[0];
      expect(tri.v0.equals(vertices[0])).toBe(true);
      expect(tri.v1.equals(vertices[1])).toBe(true);
      expect(tri.v2.equals(vertices[2])).toBe(true);
    });

    it('triangles have normals', () => {
      const vertices = [
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0)
      ];
      const indices = [0, 1, 2];

      const mesh = new MeshShape(vertices, indices);
      const triangles = mesh.getTriangles();

      expect(triangles[0].normal).toBeDefined();
      expect(triangles[0].normal!.length()).toBeCloseTo(1, 5);
    });

    it('normal points in correct direction', () => {
      const vertices = [
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0)
      ];
      const indices = [0, 1, 2];

      const mesh = new MeshShape(vertices, indices);
      const triangles = mesh.getTriangles();

      expect(triangles[0].normal!.z).toBeGreaterThan(0);
    });

    it('handles multiple triangles', () => {
      const vertices = [
        new Vector3(-1, -1, 0),
        new Vector3(1, -1, 0),
        new Vector3(1, 1, 0),
        new Vector3(-1, 1, 0)
      ];
      const indices = [0, 1, 2, 0, 2, 3];

      const mesh = new MeshShape(vertices, indices);
      const triangles = mesh.getTriangles();

      expect(triangles).toHaveLength(2);
    });
  });

  describe('BVH construction', () => {
    it('builds BVH for triangle meshes', () => {
      const vertices = [
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0)
      ];
      const indices = [0, 1, 2];

      const mesh = new MeshShape(vertices, indices, false);
      const bvh = mesh.getBVH();

      expect(bvh).not.toBeNull();
    });

    it('does not build BVH for convex hulls', () => {
      const vertices = [
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0)
      ];
      const indices = [0, 1, 2];

      const mesh = new MeshShape(vertices, indices, true);
      const bvh = mesh.getBVH();

      expect(bvh).toBeNull();
    });

    it('BVH has correct bounds', () => {
      const vertices = [
        new Vector3(-1, -1, -1),
        new Vector3(1, -1, -1),
        new Vector3(0, 1, -1)
      ];
      const indices = [0, 1, 2];

      const mesh = new MeshShape(vertices, indices);
      const bvh = mesh.getBVH();

      expect(bvh).not.toBeNull();
      expect(bvh!.aabb).toBeDefined();
      expect(bvh!.aabb.min.x).toBeLessThanOrEqual(-1);
      expect(bvh!.aabb.max.x).toBeGreaterThanOrEqual(1);
    });

    it('BVH handles many triangles', () => {
      const vertices: Vector3[] = [];
      const indices: number[] = [];

      for (let i = 0; i < 100; i++) {
        vertices.push(new Vector3(Math.random() * 10, Math.random() * 10, 0));
        if (i >= 2) {
          indices.push(0, i - 1, i);
        }
      }

      const mesh = new MeshShape(vertices, indices);
      const bvh = mesh.getBVH();

      expect(bvh).not.toBeNull();
    });
  });

  describe('convex hull', () => {
    it('convex hull supports GJK', () => {
      const vertices = [
        new Vector3(-1, -1, -1),
        new Vector3(1, -1, -1),
        new Vector3(-1, 1, -1),
        new Vector3(-1, -1, 1)
      ];
      const indices = [0, 1, 2, 0, 1, 3];

      const mesh = new MeshShape(vertices, indices, true);
      const direction = new Vector3(1, 0, 0);
      const transform = Matrix4.identity();

      const support = mesh.support(direction, transform);

      expect(support.x).toBeGreaterThan(0);
    });

    it('support returns furthest vertex', () => {
      const vertices = [
        new Vector3(-1, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, -1, 0)
      ];
      const indices = [0, 1, 2];

      const mesh = new MeshShape(vertices, indices, true);
      const direction = new Vector3(1, 0, 0);
      const transform = Matrix4.identity();

      const support = mesh.support(direction, transform);

      expect(support.x).toBeCloseTo(1, 5);
    });

    it('support works with transform', () => {
      const vertices = [
        new Vector3(-1, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0)
      ];
      const indices = [0, 1, 2];

      const mesh = new MeshShape(vertices, indices, true);
      const direction = new Vector3(1, 0, 0);
      const transform = Matrix4.translation(5, 0, 0);

      const support = mesh.support(direction, transform);

      expect(support.x).toBeGreaterThan(5);
    });

    it('triangle mesh returns default support', () => {
      const vertices = [
        new Vector3(-1, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0)
      ];
      const indices = [0, 1, 2];

      const mesh = new MeshShape(vertices, indices, false);
      const direction = new Vector3(1, 0, 0);
      const transform = Matrix4.identity();

      const support = mesh.support(direction, transform);

      expect(support).toBeDefined();
    });
  });

  describe('AABB computation', () => {
    it('computes AABB from vertices', () => {
      const vertices = [
        new Vector3(-2, -3, -4),
        new Vector3(2, 3, 4)
      ];
      const indices = [0, 1, 0];

      const mesh = new MeshShape(vertices, indices);
      const transform = Matrix4.identity();
      const aabb = mesh.computeAABB(transform);

      expect(aabb.min.x).toBeCloseTo(-2, 5);
      expect(aabb.max.x).toBeCloseTo(2, 5);
      expect(aabb.min.y).toBeCloseTo(-3, 5);
      expect(aabb.max.y).toBeCloseTo(3, 5);
    });

    it('computes AABB with translation', () => {
      const vertices = [
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      ];
      const indices = [0, 1, 0];

      const mesh = new MeshShape(vertices, indices);
      const transform = Matrix4.translation(5, 0, 0);
      const aabb = mesh.computeAABB(transform);

      expect(aabb.min.x).toBeCloseTo(4, 5);
      expect(aabb.max.x).toBeCloseTo(6, 5);
    });

    it('computes AABB with rotation', () => {
      const vertices = [
        new Vector3(2, 0, 0),
        new Vector3(-2, 0, 0)
      ];
      const indices = [0, 1, 0];

      const mesh = new MeshShape(vertices, indices);
      const transform = Matrix4.rotationY(Math.PI / 2);
      const aabb = mesh.computeAABB(transform);

      expect(aabb.max.z).toBeGreaterThan(1);
    });

    it('computes AABB with scale', () => {
      const vertices = [
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      ];
      const indices = [0, 1, 0];

      const mesh = new MeshShape(vertices, indices);
      const transform = Matrix4.scaling(2, 2, 2);
      const aabb = mesh.computeAABB(transform);

      expect(aabb.max.x).toBeCloseTo(2, 5);
    });

    it('handles empty mesh', () => {
      const vertices: Vector3[] = [];
      const indices: number[] = [];

      const mesh = new MeshShape(vertices, indices);
      const transform = Matrix4.identity();
      const aabb = mesh.computeAABB(transform);

      expect(aabb.min.equals(Vector3.zero())).toBe(true);
      expect(aabb.max.equals(Vector3.zero())).toBe(true);
    });
  });

  describe('scale handling', () => {
    it('uniform scale affects all dimensions', () => {
      const extents = new Vector3(1, 1, 1);
      const mesh = MeshShape.box(extents);

      const transform1 = Matrix4.identity();
      const transform2 = Matrix4.scaling(2, 2, 2);

      const aabb1 = mesh.computeAABB(transform1);
      const aabb2 = mesh.computeAABB(transform2);

      expect(aabb2.max.x).toBeCloseTo(aabb1.max.x * 2, 5);
      expect(aabb2.max.y).toBeCloseTo(aabb1.max.y * 2, 5);
    });

    it('non-uniform scale works correctly', () => {
      const extents = new Vector3(1, 1, 1);
      const mesh = MeshShape.box(extents);

      const transform = Matrix4.scaling(2, 3, 4);
      const aabb = mesh.computeAABB(transform);

      expect(aabb.max.x).toBeCloseTo(2, 5);
      expect(aabb.max.y).toBeCloseTo(3, 5);
      expect(aabb.max.z).toBeCloseTo(4, 5);
    });
  });

  describe('volume computation', () => {
    it('estimates volume using AABB', () => {
      const vertices = [
        new Vector3(-1, -2, -3),
        new Vector3(1, 2, 3)
      ];
      const indices = [0, 1, 0];

      const mesh = new MeshShape(vertices, indices);
      const volume = mesh.getVolume();

      expect(volume).toBeGreaterThan(0);
    });

    it('box mesh has correct approximate volume', () => {
      const extents = new Vector3(1, 1, 1);
      const mesh = MeshShape.box(extents);
      const volume = mesh.getVolume();

      expect(volume).toBeCloseTo(8, 1);
    });

    it('larger meshes have larger volume', () => {
      const small = MeshShape.box(new Vector3(1, 1, 1));
      const large = MeshShape.box(new Vector3(2, 2, 2));

      expect(large.getVolume()).toBeGreaterThan(small.getVolume());
    });
  });

  describe('inertia computation', () => {
    it('computes inertia tensor', () => {
      const mesh = MeshShape.box(new Vector3(1, 1, 1));
      const inertia = mesh.computeInertia(10);

      expect(inertia.elements[0]).toBeGreaterThan(0);
      expect(inertia.elements[5]).toBeGreaterThan(0);
      expect(inertia.elements[10]).toBeGreaterThan(0);
    });

    it('larger meshes have larger inertia', () => {
      const small = MeshShape.box(new Vector3(1, 1, 1));
      const large = MeshShape.box(new Vector3(2, 2, 2));

      const smallInertia = small.computeInertia(1);
      const largeInertia = large.computeInertia(1);

      expect(largeInertia.elements[0]).toBeGreaterThan(smallInertia.elements[0]);
    });

    it('heavier meshes have larger inertia', () => {
      const mesh = MeshShape.box(new Vector3(1, 1, 1));

      const lightInertia = mesh.computeInertia(1);
      const heavyInertia = mesh.computeInertia(10);

      expect(heavyInertia.elements[0]).toBeCloseTo(lightInertia.elements[0] * 10, 5);
    });
  });

  describe('clone', () => {
    it('creates independent copy', () => {
      const vertices = [
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0)
      ];
      const indices = [0, 1, 2];

      const original = new MeshShape(vertices, indices, true, new Vector3(1, 2, 3));
      const cloned = original.clone();

      expect(cloned.vertices).toHaveLength(original.vertices.length);
      expect(cloned.indices).toHaveLength(original.indices.length);
      expect(cloned.isConvex).toBe(original.isConvex);
      expect(cloned.offset.equals(original.offset)).toBe(true);
      expect(cloned).not.toBe(original);
    });

    it('modifying clone vertices does not affect original', () => {
      const vertices = [new Vector3(0, 0, 0)];
      const indices = [0];

      const original = new MeshShape(vertices, indices);
      const cloned = original.clone();

      cloned.vertices[0].set(10, 10, 10);

      expect(original.vertices[0].x).toBe(0);
    });

    it('modifying clone indices does not affect original', () => {
      const vertices = [new Vector3(0, 0, 0), new Vector3(1, 0, 0)];
      const indices = [0, 1];

      const original = new MeshShape(vertices, indices);
      const cloned = original.clone();

      cloned.indices[0] = 99;

      expect(original.indices[0]).toBe(0);
    });
  });

  describe('memory management', () => {
    it('handles large meshes', () => {
      const vertices: Vector3[] = [];
      const indices: number[] = [];

      for (let i = 0; i < 1000; i++) {
        vertices.push(new Vector3(
          Math.random() * 100,
          Math.random() * 100,
          Math.random() * 100
        ));
      }

      for (let i = 0; i < 3000; i++) {
        indices.push(Math.floor(Math.random() * vertices.length));
      }

      expect(() => {
        new MeshShape(vertices, indices);
      }).not.toThrow();
    });

    it('builds BVH efficiently for large meshes', () => {
      const vertices: Vector3[] = [];
      const indices: number[] = [];

      for (let i = 0; i < 100; i++) {
        vertices.push(new Vector3(i, 0, 0));
        vertices.push(new Vector3(i + 1, 0, 0));
        vertices.push(new Vector3(i, 1, 0));
        indices.push(i * 3, i * 3 + 1, i * 3 + 2);
      }

      const mesh = new MeshShape(vertices, indices);
      const bvh = mesh.getBVH();

      expect(bvh).not.toBeNull();
    });
  });
});
