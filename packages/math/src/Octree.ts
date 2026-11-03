import { Box3 } from "./Box3.js";
import { Capsule } from "./Capsule.js";
import { Line3 } from "./Line3.js";
import { Sphere } from "./Sphere.js";
import { Triangle } from "./Triangle.js";
import { Vector3 } from "./Vector3.js";
import type { Matrix4 } from "./Matrix4.js";
import type { Ray } from "./Ray.js";

/** Minimize squared distance over a pair of finite segment parameters. */
function closestSegments(first: Line3, second: Line3): { point1: Vector3; point2: Vector3 } {
  const a = first.end.subtract(first.start);
  const b = second.end.subtract(second.start);
  const origin = first.start.subtract(second.start);
  const aa = a.dot(a), bb = b.dot(b), ab = a.dot(b);
  const ao = a.dot(origin), bo = b.dot(origin);
  const clamp = (n: number): number => Math.max(0, Math.min(1, n));
  let bestFirst = first.start;
  let bestSecond = second.start;
  let bestDistance = bestFirst.distanceToSquared(bestSecond);
  const consider = (s: number, t: number): void => {
    const point1 = first.start.addScaled(a, s);
    const point2 = second.start.addScaled(b, t);
    const distance = point1.distanceToSquared(point2);
    if (distance < bestDistance) {
      bestFirst = point1;
      bestSecond = point2;
      bestDistance = distance;
    }
  };
  // A convex distance function reaches its minimum either in the interior or
  // on one of the four edges of the [0,1] × [0,1] parameter rectangle.
  if (bb > 0) { consider(0, clamp(bo / bb)); consider(1, clamp((bo + ab) / bb)); }
  if (aa > 0) { consider(clamp(-ao / aa), 0); consider(clamp((ab - ao) / aa), 1); }
  const determinant = aa * bb - ab * ab;
  if (determinant > Number.EPSILON * aa * bb) {
    const s = (ab * bo - bb * ao) / determinant;
    const t = (aa * bo - ab * ao) / determinant;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) consider(s, t);
  }
  return { point1: bestFirst, point2: bestSecond };
}

function faceNormal(triangle: Triangle): Vector3 {
  return triangle.b.subtract(triangle.a).cross(triangle.c.subtract(triangle.a)).normalize();
}

function triangleEdges(triangle: Triangle): readonly Line3[] {
  return [new Line3(triangle.a, triangle.b), new Line3(triangle.b, triangle.c), new Line3(triangle.c, triangle.a)];
}

/** A stable separation direction even for a collapsed face or segment. */
function fallbackContactNormal(triangle: Triangle, normal: Vector3): Vector3 {
  if (normal.lengthSquared() > 0) return normal;
  const ab = triangle.b.subtract(triangle.a);
  const ac = triangle.c.subtract(triangle.a);
  const edge = ab.lengthSquared() >= ac.lengthSquared() ? ab : ac;
  if (edge.lengthSquared() === 0) return Vector3.up;
  const x = Math.abs(edge.x), y = Math.abs(edge.y), z = Math.abs(edge.z);
  const axis = x <= y && x <= z ? Vector3.right : y <= z ? Vector3.up : Vector3.forward;
  return edge.cross(axis).normalize();
}

/** Parameter interval where a segment projects into a nondegenerate face. */
function projectedFaceInterval(segment: Line3, triangle: Triangle): readonly [number, number] | undefined {
  const start = triangle.getBarycoord(segment.start);
  const end = triangle.getBarycoord(segment.end);
  if (!start || !end) return undefined;
  let lower = 0;
  let upper = 1;
  for (const [a, b] of [[start.x, end.x], [start.y, end.y], [start.z, end.z]]) {
    if (a! < 0 && b! < 0) return undefined;
    if (a! < 0) lower = Math.max(lower, -a! / (b! - a!));
    else if (b! < 0) upper = Math.min(upper, a! / (a! - b!));
  }
  return lower <= upper ? [lower, upper] : undefined;
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
    if (capsule.radius < 0) return false;
    const segment = new Line3(capsule.start, capsule.end);
    const normal = faceNormal(triangle);
    let best: OctreeTriangleHit | false = false;
    if (normal.lengthSquared() > 0) {
      const startDistance = capsule.start.subtract(triangle.a).dot(normal);
      const endDistance = capsule.end.subtract(triangle.a).dot(normal);
      // Preserve the one-sided capsule convention: a capsule wholly behind a
      // face does not collide with its back, but a crossing capsule is pushed
      // toward the front until its deepest point clears the plane.
      if (Math.max(startDistance, endDistance) < 0 || Math.min(startDistance, endDistance) > capsule.radius) return false;
      const interval = projectedFaceInterval(segment, triangle);
      if (interval) {
        const t = startDistance <= endDistance ? interval[0] : interval[1];
        const axisPoint = segment.at(t);
        const distance = axisPoint.subtract(triangle.a).dot(normal);
        if (distance <= capsule.radius) {
          best = { normal, point: axisPoint.addScaled(normal, -distance), depth: capsule.radius - distance };
        }
      }
    }
    for (const edge of triangleEdges(triangle)) {
      const { point1, point2 } = closestSegments(segment, edge);
      const offset = point1.subtract(point2);
      const distance = offset.length();
      if (distance > capsule.radius) continue;
      const contactNormal = distance > 0 ? offset.multiplyScalar(1 / distance) : fallbackContactNormal(triangle, normal);
      const depth = capsule.radius - distance;
      if (!best || depth > best.depth) best = { normal: contactNormal, point: point2, depth };
    }
    return best;
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

    // A collapsed triangle has no face plane or uniquely defined separation
    // direction for a box. Do not ask Plane to normalize its zero normal.
    const normal = faceNormal(triangle);
    if (normal.lengthSquared() === 0) return false;
    // deepest box corner relative to the plane
    const v1 = new Vector3(
      normal.x > 0 ? box.min.x : box.max.x,
      normal.y > 0 ? box.min.y : box.max.y,
      normal.z > 0 ? box.min.z : box.max.z
    );
    const distance = v1.subtract(triangle.a).dot(normal);
    return {
      depth: -distance,
      normal,
      point: v1.addScaled(normal, -distance)
    };
  }

  triangleSphereIntersect(sphere: Sphere, triangle: Triangle): OctreeTriangleHit | false {
    if (sphere.radius < 0) return false;
    const normal = faceNormal(triangle);
    if (normal.lengthSquared() > 0) {
      const signedDistance = sphere.center.subtract(triangle.a).dot(normal);
      if (Math.abs(signedDistance) > sphere.radius) return false;
      if (triangle.containsPoint(sphere.center)) {
        return {
          normal,
          point: sphere.center.addScaled(normal, -signedDistance),
          depth: sphere.radius - signedDistance
        };
      }
    }
    let best: OctreeTriangleHit | false = false;
    const center = new Line3(sphere.center, sphere.center);
    for (const edge of triangleEdges(triangle)) {
      const { point2 } = closestSegments(center, edge);
      const offset = sphere.center.subtract(point2);
      const distance = offset.length();
      if (distance > sphere.radius) continue;
      const contactNormal = distance > 0 ? offset.multiplyScalar(1 / distance) : fallbackContactNormal(triangle, normal);
      const depth = sphere.radius - distance;
      if (!best || depth > best.depth) best = { normal: contactNormal, point: point2, depth };
    }
    return best;
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

  /** Resolve the deepest contact first, gathering new contacts after each move. */
  boxIntersect(box: Box3): OctreeCollisionResult | false {
    let moving = box;
    let hit: OctreeTriangleHit | false = false;
    const size = box.max.subtract(box.min);
    const tolerance = Math.max(Number.MIN_VALUE, size.length() * 1e-12);
    for (let pass = 0; pass < 32; pass += 1) {
      const triangles: Triangle[] = [];
      this.getBoxTriangles(moving, triangles);
      let deepest: OctreeTriangleHit | false = false;
      for (const triangle of triangles) {
        const result = this.triangleBoxIntersect(moving, triangle);
        if (result && (!deepest || result.depth > deepest.depth)) deepest = result;
      }
      if (!deepest) break;
      hit = deepest;
      if (deepest.depth <= tolerance) break;
      moving = moving.translate(deepest.normal.multiplyScalar(deepest.depth));
    }
    if (hit) {
      const collisionVector = moving.min.subtract(box.min);
      const depth = collisionVector.length();
      return { normal: depth > 0 ? collisionVector.multiplyScalar(1 / depth) : hit.normal, depth };
    }
    return false;
  }

  /** Resolve the deepest current contact first, so coplanar seams cannot push sideways. */
  sphereIntersect(sphere: Sphere): OctreeCollisionResult | false {
    let moving = sphere;
    let hit: OctreeTriangleHit | false = false;
    const tolerance = Math.max(Number.MIN_VALUE, Math.abs(sphere.radius) * 1e-12);
    for (let pass = 0; pass < 32; pass += 1) {
      const triangles: Triangle[] = [];
      this.getSphereTriangles(moving, triangles);
      let deepest: OctreeTriangleHit | false = false;
      for (const triangle of triangles) {
        const result = this.triangleSphereIntersect(moving, triangle);
        if (result && (!deepest || result.depth > deepest.depth)) deepest = result;
      }
      if (!deepest) break;
      hit = deepest;
      if (deepest.depth <= tolerance) break;
      moving = moving.translate(deepest.normal.multiplyScalar(deepest.depth));
    }
    if (hit) {
      const collisionVector = moving.center.subtract(sphere.center);
      const depth = collisionVector.length();
      return { normal: depth > 0 ? collisionVector.multiplyScalar(1 / depth) : hit.normal, depth };
    }
    return false;
  }

  /** Resolve capsule contacts with the same bounded, deepest-first policy. */
  capsuleIntersect(capsule: Capsule): OctreeCollisionResult | false {
    let moving = capsule;
    let hit: OctreeTriangleHit | false = false;
    const tolerance = Math.max(Number.MIN_VALUE, Math.abs(capsule.radius) * 1e-12);
    for (let pass = 0; pass < 32; pass += 1) {
      const triangles: Triangle[] = [];
      this.getCapsuleTriangles(moving, triangles);
      let deepest: OctreeTriangleHit | false = false;
      for (const triangle of triangles) {
        const result = this.triangleCapsuleIntersect(moving, triangle);
        if (result && (!deepest || result.depth > deepest.depth)) deepest = result;
      }
      if (!deepest) break;
      hit = deepest;
      if (deepest.depth <= tolerance) break;
      moving = moving.translate(deepest.normal.multiplyScalar(deepest.depth));
    }
    if (hit) {
      // Both endpoints are translated by the same correction. Using an
      // endpoint avoids cancellation when the capsule is long relative to a
      // small penetration.
      const collisionVector = moving.start.subtract(capsule.start);
      const depth = collisionVector.length();
      return { normal: depth > 0 ? collisionVector.multiplyScalar(1 / depth) : hit.normal, depth };
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
