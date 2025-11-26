/**
 * Mesh collision shape for complex geometry.
 *
 * @module Physics/Shapes/MeshShape
 */

import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';
import { IShape, ShapeType, AABB, AABBUtils } from '../Collider';

/**
 * Triangle representation for mesh collision.
 */
export interface Triangle {
  /** First vertex */
  v0: Vector3;

  /** Second vertex */
  v1: Vector3;

  /** Third vertex */
  v2: Vector3;

  /** Cached triangle normal */
  normal?: Vector3;
}

/**
 * BVH (Bounding Volume Hierarchy) node for efficient ray/collision queries.
 */
class BVHNode {
  /** Axis-aligned bounding box for this node */
  aabb: AABB;

  /** Left child node (null for leaves) */
  left: BVHNode | null = null;

  /** Right child node (null for leaves) */
  right: BVHNode | null = null;

  /** Triangle indices for leaf nodes */
  triangles: number[] = [];

  constructor(aabb: AABB) {
    this.aabb = aabb;
  }

  /**
   * Checks if this is a leaf node.
   */
  isLeaf(): boolean {
    return this.left === null && this.right === null;
  }
}

/**
 * Mesh collision shape for complex geometry.
 *
 * Supports both convex hulls and triangle meshes. Triangle meshes should
 * only be used for static geometry due to performance considerations.
 *
 * @example
 * ```typescript
 * // Create from triangle data
 * const vertices = [
 *   new Vector3(0, 0, 0),
 *   new Vector3(1, 0, 0),
 *   new Vector3(0, 1, 0)
 * ];
 * const indices = [0, 1, 2];
 * const mesh = new MeshShape(vertices, indices);
 *
 * // Use as convex hull
 * const convexMesh = new MeshShape(vertices, indices, true);
 * ```
 */
export class MeshShape implements IShape {
  /**
   * Shape type identifier.
   */
  readonly type: ShapeType;

  /**
   * Vertex positions.
   */
  vertices: Vector3[];

  /**
   * Triangle indices (groups of 3).
   */
  indices: number[];

  /**
   * Whether this is a convex hull (true) or triangle mesh (false).
   */
  isConvex: boolean;

  /**
   * Local offset from collider center.
   */
  offset: Vector3;

  /**
   * Cached triangles for collision detection.
   */
  private triangles: Triangle[];

  /**
   * BVH root for efficient spatial queries.
   */
  private bvh: BVHNode | null = null;

  /**
   * Cached AABB in local space.
   */
  private localAABB: AABB;

  /**
   * Creates a new mesh shape.
   *
   * @param vertices - Array of vertex positions
   * @param indices - Array of triangle indices
   * @param isConvex - Whether this is a convex hull (default: false)
   * @param offset - Local offset (default: zero vector)
   *
   * @example
   * ```typescript
   * const vertices = [
   *   new Vector3(-1, 0, -1),
   *   new Vector3(1, 0, -1),
   *   new Vector3(1, 0, 1),
   *   new Vector3(-1, 0, 1)
   * ];
   * const indices = [0, 1, 2, 0, 2, 3]; // Two triangles
   * const mesh = new MeshShape(vertices, indices);
   * ```
   */
  constructor(
    vertices: Vector3[],
    indices: number[],
    isConvex: boolean = false,
    offset: Vector3 = Vector3.zero()
  ) {
    this.vertices = vertices;
    this.indices = indices;
    this.isConvex = isConvex;
    this.offset = offset;
    this.type = isConvex ? ShapeType.ConvexHull : ShapeType.TriangleMesh;

    // Build triangle list
    this.triangles = this.buildTriangles();

    // Compute local AABB
    this.localAABB = this.computeLocalAABB();

    // Build BVH for triangle meshes
    if (!isConvex) {
      this.bvh = this.buildBVH();
    }
  }

  /**
   * Builds triangle list from vertices and indices.
   */
  private buildTriangles(): Triangle[] {
    const triangles: Triangle[] = [];

    for (let i = 0; i < this.indices.length; i += 3) {
      const v0 = this.vertices[this.indices[i]];
      const v1 = this.vertices[this.indices[i + 1]];
      const v2 = this.vertices[this.indices[i + 2]];

      // Compute normal
      const edge1 = v1.sub(v0);
      const edge2 = v2.sub(v0);
      const normal = edge1.cross(edge2).normalize();

      triangles.push({ v0, v1, v2, normal });
    }

    return triangles;
  }

  /**
   * Computes AABB in local space.
   */
  private computeLocalAABB(): AABB {
    if (this.vertices.length === 0) {
      return { min: Vector3.zero(), max: Vector3.zero() };
    }

    let min = this.vertices[0].clone();
    let max = this.vertices[0].clone();

    for (let i = 1; i < this.vertices.length; i++) {
      min = Vector3.min(min, this.vertices[i]);
      max = Vector3.max(max, this.vertices[i]);
    }

    return { min, max };
  }

  /**
   * Builds BVH for efficient spatial queries.
   */
  private buildBVH(): BVHNode {
    const triangleIndices = Array.from({ length: this.triangles.length }, (_, i) => i);
    return this.buildBVHRecursive(triangleIndices);
  }

  /**
   * Recursively builds BVH tree.
   */
  private buildBVHRecursive(triangleIndices: number[]): BVHNode {
    // Compute AABB for these triangles
    const aabb = this.computeTrianglesAABB(triangleIndices);
    const node = new BVHNode(aabb);

    // Leaf node if few triangles
    if (triangleIndices.length <= 4) {
      node.triangles = triangleIndices;
      return node;
    }

    // Find longest axis
    const extents = AABBUtils.getExtents(aabb);
    let axis = 0;
    if (extents.y > extents.x) axis = 1;
    if (extents.z > extents[axis === 0 ? 'x' : 'y']) axis = 2;

    // Sort triangles along axis
    triangleIndices.sort((a, b) => {
      const centerA = this.getTriangleCenter(this.triangles[a]);
      const centerB = this.getTriangleCenter(this.triangles[b]);
      const coordA = axis === 0 ? centerA.x : axis === 1 ? centerA.y : centerA.z;
      const coordB = axis === 0 ? centerB.x : axis === 1 ? centerB.y : centerB.z;
      return coordA - coordB;
    });

    // Split in half
    const mid = Math.floor(triangleIndices.length / 2);
    const leftIndices = triangleIndices.slice(0, mid);
    const rightIndices = triangleIndices.slice(mid);

    // Recursively build children
    node.left = this.buildBVHRecursive(leftIndices);
    node.right = this.buildBVHRecursive(rightIndices);

    return node;
  }

  /**
   * Computes AABB for a set of triangles.
   */
  private computeTrianglesAABB(triangleIndices: number[]): AABB {
    if (triangleIndices.length === 0) {
      return { min: Vector3.zero(), max: Vector3.zero() };
    }

    const firstTri = this.triangles[triangleIndices[0]];
    let min = firstTri.v0.clone();
    let max = firstTri.v0.clone();

    for (const idx of triangleIndices) {
      const tri = this.triangles[idx];
      min = Vector3.min(min, Vector3.min(tri.v0, Vector3.min(tri.v1, tri.v2)));
      max = Vector3.max(max, Vector3.max(tri.v0, Vector3.max(tri.v1, tri.v2)));
    }

    return { min, max };
  }

  /**
   * Gets the center of a triangle.
   */
  private getTriangleCenter(tri: Triangle): Vector3 {
    return new Vector3(
      (tri.v0.x + tri.v1.x + tri.v2.x) / 3,
      (tri.v0.y + tri.v1.y + tri.v2.y) / 3,
      (tri.v0.z + tri.v1.z + tri.v2.z) / 3
    );
  }

  /**
   * Computes axis-aligned bounding box in world space.
   */
  computeAABB(transform: Matrix4): AABB {
    // Transform local AABB corners
    const corners = [
      new Vector3(this.localAABB.min.x, this.localAABB.min.y, this.localAABB.min.z),
      new Vector3(this.localAABB.max.x, this.localAABB.min.y, this.localAABB.min.z),
      new Vector3(this.localAABB.min.x, this.localAABB.max.y, this.localAABB.min.z),
      new Vector3(this.localAABB.max.x, this.localAABB.max.y, this.localAABB.min.z),
      new Vector3(this.localAABB.min.x, this.localAABB.min.y, this.localAABB.max.z),
      new Vector3(this.localAABB.max.x, this.localAABB.min.y, this.localAABB.max.z),
      new Vector3(this.localAABB.min.x, this.localAABB.max.y, this.localAABB.max.z),
      new Vector3(this.localAABB.max.x, this.localAABB.max.y, this.localAABB.max.z)
    ];

    const worldCorners = corners.map(c => this.transformPoint(c.add(this.offset), transform));

    let min = worldCorners[0].clone();
    let max = worldCorners[0].clone();

    for (let i = 1; i < worldCorners.length; i++) {
      min = Vector3.min(min, worldCorners[i]);
      max = Vector3.max(max, worldCorners[i]);
    }

    return { min, max };
  }

  /**
   * Computes inertia tensor (simplified approximation using AABB).
   */
  computeInertia(mass: number): Matrix4 {
    const extents = AABBUtils.getExtents(this.localAABB);
    const w = extents.x * 2;
    const h = extents.y * 2;
    const d = extents.z * 2;

    const factor = mass / 12.0;
    const Ixx = factor * (h * h + d * d);
    const Iyy = factor * (w * w + d * d);
    const Izz = factor * (w * w + h * h);

    const inertia = Matrix4.identity();
    const e = inertia.elements;
    e[0] = Ixx;
    e[5] = Iyy;
    e[10] = Izz;

    return inertia;
  }

  /**
   * Gets approximate volume (using AABB).
   */
  getVolume(): number {
    const extents = AABBUtils.getExtents(this.localAABB);
    return 8.0 * extents.x * extents.y * extents.z;
  }

  /**
   * Finds support point for convex meshes (for GJK algorithm).
   */
  support(direction: Vector3, transform: Matrix4): Vector3 {
    if (!this.isConvex) {
      // Triangle meshes don't support GJK
      return this.transformPoint(this.offset, transform);
    }

    // Find vertex furthest in direction
    const invTransform = transform.invert();
    if (!invTransform) {
      return this.transformPoint(this.offset, transform);
    }

    const localDir = this.transformDirection(direction, invTransform).normalize();

    let maxDot = -Infinity;
    let supportVertex = this.vertices[0];

    for (const vertex of this.vertices) {
      const dot = vertex.dot(localDir);
      if (dot > maxDot) {
        maxDot = dot;
        supportVertex = vertex;
      }
    }

    return this.transformPoint(supportVertex.add(this.offset), transform);
  }

  /**
   * Gets all triangles (for collision detection).
   */
  getTriangles(): Triangle[] {
    return this.triangles;
  }

  /**
   * Gets BVH root (for spatial queries).
   */
  getBVH(): BVHNode | null {
    return this.bvh;
  }

  /**
   * Creates a copy of this shape.
   */
  clone(): MeshShape {
    return new MeshShape(
      this.vertices.map(v => v.clone()),
      [...this.indices],
      this.isConvex,
      this.offset.clone()
    );
  }

  /**
   * Transforms a point by a matrix.
   */
  private transformPoint(point: Vector3, matrix: Matrix4): Vector3 {
    const e = matrix.elements;
    const x = point.x * e[0] + point.y * e[4] + point.z * e[8] + e[12];
    const y = point.x * e[1] + point.y * e[5] + point.z * e[9] + e[13];
    const z = point.x * e[2] + point.y * e[6] + point.z * e[10] + e[14];
    return new Vector3(x, y, z);
  }

  /**
   * Transforms a direction by a matrix.
   */
  private transformDirection(direction: Vector3, matrix: Matrix4): Vector3 {
    const e = matrix.elements;
    const x = direction.x * e[0] + direction.y * e[4] + direction.z * e[8];
    const y = direction.x * e[1] + direction.y * e[5] + direction.z * e[9];
    const z = direction.x * e[2] + direction.y * e[6] + direction.z * e[10];
    return new Vector3(x, y, z);
  }

  /**
   * Creates a mesh from a box.
   */
  static box(extents: Vector3): MeshShape {
    const vertices = [
      new Vector3(-extents.x, -extents.y, -extents.z),
      new Vector3(extents.x, -extents.y, -extents.z),
      new Vector3(-extents.x, extents.y, -extents.z),
      new Vector3(extents.x, extents.y, -extents.z),
      new Vector3(-extents.x, -extents.y, extents.z),
      new Vector3(extents.x, -extents.y, extents.z),
      new Vector3(-extents.x, extents.y, extents.z),
      new Vector3(extents.x, extents.y, extents.z)
    ];

    const indices = [
      0, 2, 1, 1, 2, 3, // Front
      4, 5, 6, 5, 7, 6, // Back
      0, 1, 4, 1, 5, 4, // Bottom
      2, 6, 3, 3, 6, 7, // Top
      0, 4, 2, 2, 4, 6, // Left
      1, 3, 5, 3, 7, 5  // Right
    ];

    return new MeshShape(vertices, indices, true);
  }
}
