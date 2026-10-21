import { Box3 } from "./Box3.js";
import { Capsule } from "./Capsule.js";
import { Line3 } from "./Line3.js";
import { Sphere } from "./Sphere.js";
import { Triangle } from "./Triangle.js";
import { Vector3 } from "./Vector3.js";
import type { Matrix4 } from "./Matrix4.js";
import type { Ray } from "./Ray.js";

const EPS = 1e-10;

/** Closest points on two finite line segments (three `lineToLineClosestPoints`). */
function lineToLineClosestPoints(line1: Line3, line2: Line3): { point1: Vector3; point2: Vector3 } {
  const r = line1.end.subtract(line1.start);
  const s = line2.end.subtract(line2.start);
  const w = line2.start.subtract(line1.start);
  const a = r.dot(s);
  const b = r.dot(r);
  const c = s.dot(s);
  const d = s.dot(w);
  const e = r.dot(w);
  let t1: number;
  let t2: number;
  const divisor = b * c - a * a;
  if (Math.abs(divisor) < EPS) {
    const d1 = -d / c;
    const d2 = (a - d) / c;
    if (Math.abs(d1 - 0.5) < Math.abs(d2 - 0.5)) {
      t1 = 0;
      t2 = d1;
    } else {
      t1 = 1;
      t2 = d2;
    }
  } else {
    t1 = (d * a + e * c) / divisor;
    t2 = (t1 * a - d) / c;
  }
  t2 = Math.max(0, Math.min(1, t2));
  t1 = Math.max(0, Math.min(1, t1));
  return {
    point1: r.multiplyScalar(t1).add(line1.start),
    point2: s.multiplyScalar(t2).add(line2.start)
  };
}

export interface OctreeCollisionResult {
  readonly normal: Vector3;
  readonly depth: number;
}

export interface OctreeTriangleHit {
  readonly normal: Vector3;
  readonly point: Vector3;
  readonly depth: number;
}

export interface OctreeRayHit {
  readonly distance: number;
  readonly triangle: Triangle;
  readonly position: Vector3;
}

/**
 * Triangle octree — three.js `examples/jsm/math/Octree.js` parity:
 * `addTriangle`/`build`/`split` and `boxIntersect`, `sphereIntersect`,
 * `capsuleIntersect`, `rayIntersect` collision queries.
 *
 * `fromTriangles(triangles)` is the `fromGraphNode` equivalent for
 * triangle-soup sources (meshes adapted by callers); `fromPositions` accepts
 * raw vertex data + optional index/world transform.
 */
export class Octree {
  /** Cell bounds — `undefined` until {@link calcBox}/{@link build}. */
  box: Box3 | undefined;
  /** Loose bounds grown by {@link addTriangle}. */
  bounds = new Box3();

  trianglesPerLeaf = 8;
  maxLevel = 16;

  readonly subTrees: Octree[] = [];
  readonly triangles: Triangle[] = [];

  constructor(box?: Box3) {
    this.box = box;
  }

  addTriangle(triangle: Triangle): this {
    const min = this.bounds.min;
    const max = this.bounds.max;
    const newMin = new Vector3(
      Math.min(min.x, triangle.a.x, triangle.b.x, triangle.c.x),
      Math.min(min.y, triangle.a.y, triangle.b.y, triangle.c.y),
      Math.min(min.z, triangle.a.z, triangle.b.z, triangle.c.z)
    );
    const newMax = new Vector3(
      Math.max(max.x, triangle.a.x, triangle.b.x, triangle.c.x),
      Math.max(max.y, triangle.a.y, triangle.b.y, triangle.c.y),
      Math.max(max.z, triangle.a.z, triangle.b.z, triangle.c.z)
    );
    this.bounds = new Box3(newMin, newMax);
    this.triangles.push(triangle);
    return this;
  }

  calcBox(): this {
    this.box = this.bounds.clone();
    // offset small amount to account for regular grid
    this.box = new Box3(
      new Vector3(this.box.min.x - 0.01, this.box.min.y - 0.01, this.box.min.z - 0.01),
      this.box.max
    );
    return this;
  }

  split(level: number): this {
    if (!this.box) return this;
    const subTrees: Octree[] = [];
    const halfsize = this.box.max.subtract(this.box.min).multiplyScalar(0.5);
    for (let x = 0; x < 2; x += 1) {
      for (let y = 0; y < 2; y += 1) {
        for (let z = 0; z < 2; z += 1) {
          const v = new Vector3(x, y, z).multiply(halfsize);
          const min = this.box.min.add(v);
          const max = min.add(halfsize);
          subTrees.push(new Octree(new Box3(min, max)));
        }
      }
    }
    let triangle: Triangle | undefined;
    while ((triangle = this.triangles.pop()) !== undefined) {
      for (const subTree of subTrees) {
        if (subTree.box!.intersectsTriangle(triangle)) {
          subTree.triangles.push(triangle);
        }
      }
    }
    for (const subTree of subTrees) {
      const len = subTree.triangles.length;
      if (len > this.trianglesPerLeaf && level < this.maxLevel) {
        subTree.split(level + 1);
      }
      if (len !== 0) {
        this.subTrees.push(subTree);
      }
    }
    return this;
  }

  build(): this {
    this.calcBox();
    this.split(0);
    return this;
  }

  /** `fromGraphNode` equivalent: build over an explicit triangle list. */
  fromTriangles(triangles: readonly Triangle[]): this {
    for (const triangle of triangles) this.addTriangle(triangle);
    this.build();
    return this;
  }

  /**
   * Build over raw vertex positions with optional index list and world
   * transform — the `fromGraphNode` equivalent for mesh data.
   */
  fromPositions(positions: ArrayLike<number>, indices?: ArrayLike<number>, worldMatrix?: Matrix4): this {
    if (indices !== undefined && indices.length > 0) {
      for (let i = 0; i < indices.length; i += 3) {
        const a = Vector3.fromArray(positions, indices[i]! * 3);
        const b = Vector3.fromArray(positions, indices[i + 1]! * 3);
        const c = Vector3.fromArray(positions, indices[i + 2]! * 3);
        this.addTriangle(new Triangle(
          worldMatrix ? a.transformMatrix4(worldMatrix) : a,
          worldMatrix ? b.transformMatrix4(worldMatrix) : b,
          worldMatrix ? c.transformMatrix4(worldMatrix) : c
        ));
      }
    } else {
      for (let i = 0; i < positions.length; i += 9) {
        const a = Vector3.fromArray(positions, i);
        const b = Vector3.fromArray(positions, i + 3);
        const c = Vector3.fromArray(positions, i + 6);
        this.addTriangle(new Triangle(
          worldMatrix ? a.transformMatrix4(worldMatrix) : a,
          worldMatrix ? b.transformMatrix4(worldMatrix) : b,
          worldMatrix ? c.transformMatrix4(worldMatrix) : c
        ));
      }
    }
    this.build();
    return this;
  }

  getRayTriangles(ray: Ray, triangles: Triangle[]): void {
    for (const subTree of this.subTrees) {
      if (!ray.intersectsBox(subTree.box!)) continue;
      if (subTree.triangles.length > 0) {
        for (const triangle of subTree.triangles) {
          if (!triangles.includes(triangle)) triangles.push(triangle);
        }
      } else {
        subTree.getRayTriangles(ray, triangles);
      }
    }
  }

  triangleCapsuleIntersect(capsule: Capsule, triangle: Triangle): OctreeTriangleHit | false {
    const plane = triangle.getPlane();
    const d1 = plane.distanceToPoint(capsule.start) - capsule.radius;
    const d2 = plane.distanceToPoint(capsule.end) - capsule.radius;
    if ((d1 > 0 && d2 > 0) || (d1 < -capsule.radius && d2 < -capsule.radius)) {
      return false;
    }
    const delta = Math.abs(d1 / (Math.abs(d1) + Math.abs(d2)));
    const intersectPoint = capsule.start.lerp(capsule.end, delta);
    if (triangle.containsPoint(intersectPoint)) {
      return { normal: plane.normal, point: intersectPoint, depth: Math.abs(Math.min(d1, d2)) };
    }

    const r2 = capsule.radius * capsule.radius;
    const line1 = new Line3(capsule.start, capsule.end);
    const lines: [Vector3, Vector3][] = [
      [triangle.a, triangle.b],
      [triangle.b, triangle.c],
      [triangle.c, triangle.a]
    ];
    for (const [start, end] of lines) {
      const line2 = new Line3(start, end);
      const { point1, point2 } = lineToLineClosestPoints(line1, line2);
      if (point1.distanceToSquared(point2) < r2) {
        return {
          normal: point1.subtract(point2).normalize(),
          point: point2,
          depth: capsule.radius - point1.distanceTo(point2)
        };
      }
    }
    return false;
  }

  triangleBoxIntersect(box: Box3, triangle: Triangle): OctreeTriangleHit | false {
    // cheap check
    if (
      Math.max(triangle.a.x, triangle.b.x, triangle.c.x) < box.min.x ||
      Math.min(triangle.a.x, triangle.b.x, triangle.c.x) > box.max.x ||
      Math.max(triangle.a.y, triangle.b.y, triangle.c.y) < box.min.y ||
      Math.min(triangle.a.y, triangle.b.y, triangle.c.y) > box.max.y ||
      Math.max(triangle.a.z, triangle.b.z, triangle.c.z) < box.min.z ||
      Math.min(triangle.a.z, triangle.b.z, triangle.c.z) > box.max.z
    ) {
      return false;
    }
    // expensive check
    if (!box.intersectsTriangle(triangle)) return false;

    const plane = triangle.getPlane();
    // deepest box corner relative to the plane
    const v1 = new Vector3(
      plane.normal.x > 0 ? box.min.x : box.max.x,
      plane.normal.y > 0 ? box.min.y : box.max.y,
      plane.normal.z > 0 ? box.min.z : box.max.z
    );
    const distance = plane.distanceToPoint(v1);
    return {
      depth: -distance,
      normal: plane.normal,
      point: v1.addScaled(plane.normal, distance)
    };
  }

  triangleSphereIntersect(sphere: Sphere, triangle: Triangle): OctreeTriangleHit | false {
    const plane = triangle.getPlane();
    if (!sphere.intersectsPlane(plane)) return false;

    const depth = Math.abs(plane.distanceToSphere(sphere));
    const r2 = sphere.radius * sphere.radius - depth * depth;
    const plainPoint = plane.projectPoint(sphere.center);
    if (triangle.containsPoint(sphere.center)) {
      return { normal: plane.normal, point: plainPoint, depth: Math.abs(plane.distanceToSphere(sphere)) };
    }
    const lines: [Vector3, Vector3][] = [
      [triangle.a, triangle.b],
      [triangle.b, triangle.c],
      [triangle.c, triangle.a]
    ];
    for (const [start, end] of lines) {
      const line = new Line3(start, end);
      const v2 = line.closestPointToPoint(plainPoint, true);
      const d = v2.distanceToSquared(sphere.center);
      if (d < r2) {
        return {
          normal: sphere.center.subtract(v2).normalize(),
          point: v2,
          depth: sphere.radius - Math.sqrt(d)
        };
      }
    }
    return false;
  }

  getSphereTriangles(sphere: Sphere, triangles: Triangle[]): void {
    for (const subTree of this.subTrees) {
      if (!sphere.intersectsBox(subTree.box!)) continue;
      if (subTree.triangles.length > 0) {
        for (const triangle of subTree.triangles) {
          if (!triangles.includes(triangle)) triangles.push(triangle);
        }
      } else {
        subTree.getSphereTriangles(sphere, triangles);
      }
    }
  }

  getBoxTriangles(box: Box3, triangles: Triangle[]): void {
    for (const subTree of this.subTrees) {
      if (!box.intersectsBox(subTree.box!)) continue;
      if (subTree.triangles.length > 0) {
        for (const triangle of subTree.triangles) {
          if (!triangles.includes(triangle)) triangles.push(triangle);
        }
      } else {
        subTree.getBoxTriangles(box, triangles);
      }
    }
  }

  getCapsuleTriangles(capsule: Capsule, triangles: Triangle[]): void {
    for (const subTree of this.subTrees) {
      if (!capsule.intersectsBox(subTree.box!)) continue;
      if (subTree.triangles.length > 0) {
        for (const triangle of subTree.triangles) {
          if (!triangles.includes(triangle)) triangles.push(triangle);
        }
      } else {
        subTree.getCapsuleTriangles(capsule, triangles);
      }
    }
  }

  /**
   * Resolves `box` against the octree — returns the accumulated collision
   * normal + depth or `false` (three `Octree.boxIntersect`).
   */
  boxIntersect(box: Box3): OctreeCollisionResult | false {
    let moving = box;
    const triangles: Triangle[] = [];
    let hit = false;
    this.getBoxTriangles(box, triangles);
    for (const triangle of triangles) {
      const result = this.triangleBoxIntersect(moving, triangle);
      if (result) {
        hit = true;
        moving = moving.translate(result.normal.multiplyScalar(result.depth));
      }
    }
    if (hit) {
      const collisionVector = moving.getCenter().subtract(box.getCenter());
      const depth = collisionVector.length();
      return { normal: collisionVector.normalize(), depth };
    }
    return false;
  }

  /** three.js `Octree.sphereIntersect`. */
  sphereIntersect(sphere: Sphere): OctreeCollisionResult | false {
    let moving = sphere;
    const triangles: Triangle[] = [];
    let hit = false;
    this.getSphereTriangles(sphere, triangles);
    for (const triangle of triangles) {
      const result = this.triangleSphereIntersect(moving, triangle);
      if (result) {
        hit = true;
        moving = moving.translate(result.normal.multiplyScalar(result.depth));
      }
    }
    if (hit) {
      const collisionVector = moving.center.subtract(sphere.center);
      const depth = collisionVector.length();
      return { normal: collisionVector.normalize(), depth };
    }
    return false;
  }

  /** three.js `Octree.capsuleIntersect`. */
  capsuleIntersect(capsule: Capsule): OctreeCollisionResult | false {
    let moving = capsule;
    const triangles: Triangle[] = [];
    let hit = false;
    this.getCapsuleTriangles(capsule, triangles);
    for (const triangle of triangles) {
      const result = this.triangleCapsuleIntersect(moving, triangle);
      if (result) {
        hit = true;
        moving = moving.translate(result.normal.multiplyScalar(result.depth));
      }
    }
    if (hit) {
      const collisionVector = moving.getCenter().subtract(capsule.getCenter());
      const depth = collisionVector.length();
      return { normal: collisionVector.normalize(), depth };
    }
    return false;
  }

  /** three.js `Octree.rayIntersect` — nearest triangle hit (backface-culled). */
  rayIntersect(ray: Ray): OctreeRayHit | false {
    const triangles: Triangle[] = [];
    let triangle: Triangle | undefined;
    let position: Vector3 | undefined;
    let distance = 1e100;
    this.getRayTriangles(ray, triangles);
    for (const tri of triangles) {
      const result = ray.intersectTriangle(tri.a, tri.b, tri.c, true);
      if (result !== undefined) {
        const newdistance = result.subtract(ray.origin).length();
        if (distance > newdistance) {
          position = result;
          distance = newdistance;
          triangle = tri;
        }
      }
    }
    return distance < 1e100 ? { distance, triangle: triangle!, position: position! } : false;
  }

  clear(): this {
    this.box = undefined;
    this.bounds = new Box3();
    this.subTrees.length = 0;
    this.triangles.length = 0;
    return this;
  }
}
