import { Matrix4 } from "./Matrix4.js";
import { Sphere } from "./Sphere.js";
import { Vector3 } from "./Vector3.js";
import type { Plane } from "./Plane.js";
import type { Triangle } from "./Triangle.js";

/**
 * Bounds provider for {@link Box3.expandByObject} — anything that can report
 * an axis-aligned box (and optionally a world transform), e.g. scene nodes,
 * meshes or volumes adapted by consumers.
 */
export interface Box3BoundsProvider {
  /** Local-space bounds (three.js `setFromObject` semantics). */
  boundingBox(): Box3;
  /** Optional world transform applied to the local bounds. */
  worldMatrix?: Matrix4;
}

function satForAxes(axes: number[], v0: Vector3, v1: Vector3, v2: Vector3, extents: Vector3): boolean {
  for (let i = 0, j = axes.length - 3; i <= j; i += 3) {
    const testAxis = new Vector3(axes[i]!, axes[i + 1]!, axes[i + 2]!);
    // project the aabb onto the separating axis
    const r = extents.x * Math.abs(testAxis.x) + extents.y * Math.abs(testAxis.y) + extents.z * Math.abs(testAxis.z);
    // project all 3 vertices of the triangle onto the separating axis
    const p0 = v0.dot(testAxis);
    const p1 = v1.dot(testAxis);
    const p2 = v2.dot(testAxis);
    // points of the projected triangle are outside the projected half-length of the aabb
    if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > r) {
      return false;
    }
  }
  return true;
}

/** Axis-aligned bounding box — three.js `Box3` parity (immutable methods). */
export class Box3 {
  constructor(
    readonly min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    readonly max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)
  ) {}

  static fromPoints(points: readonly Vector3[]): Box3 {
    return points.reduce((box, point) => box.expandByPoint(point), new Box3());
  }

  /** three.js `Box3.set`. */
  set(min: Vector3, max: Vector3): Box3 {
    return new Box3(min, max);
  }

  /** three.js `Box3.makeEmpty`. */
  static empty(): Box3 {
    return new Box3();
  }

  clone(): Box3 {
    return new Box3(this.min, this.max);
  }

  /** three.js `Box3.setFromArray` — flat `[x,y,z, ...]` coordinates. */
  static setFromArray(array: ArrayLike<number>): Box3 {
    let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY, minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY, maxZ = Number.NEGATIVE_INFINITY;
    for (let i = 0, l = array.length; i < l; i += 3) {
      const x = array[i]!;
      const y = array[i + 1]!;
      const z = array[i + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    return new Box3(new Vector3(minX, minY, minZ), new Vector3(maxX, maxY, maxZ));
  }

  static setFromPoints(points: readonly Vector3[]): Box3 {
    return Box3.fromPoints(points);
  }

  static setFromCenterAndSize(center: Vector3, size: Vector3): Box3 {
    const half = size.multiplyScalar(0.5);
    return new Box3(center.subtract(half), center.add(half));
  }

  isEmpty(): boolean {
    return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z;
  }

  makeEmpty(): Box3 {
    return new Box3();
  }

  expandByPoint(point: Vector3): Box3 {
    return new Box3(this.min.min(point), this.max.max(point));
  }

  /** three.js `Box3.expandByVector` — subtracts `v` from min, adds to max. */
  expandByVector(vector: Vector3): Box3 {
    return new Box3(this.min.subtract(vector), this.max.add(vector));
  }

  /** three.js `Box3.expandByScalar` — negative scalar contracts. */
  expandByScalar(scalar: number): Box3 {
    return new Box3(
      this.min.subtract(new Vector3(scalar, scalar, scalar)),
      this.max.add(new Vector3(scalar, scalar, scalar))
    );
  }

  /**
   * three.js `Box3.expandByObject` equivalent over a
   * {@link Box3BoundsProvider}: unions this box with the provider's bounds
   * (transformed by `worldMatrix` when present).
   */
  expandByObject(object: Box3BoundsProvider): Box3 {
    const bounds = object.boundingBox();
    const transformed = object.worldMatrix ? bounds.applyMatrix4(object.worldMatrix) : bounds;
    return this.union(transformed);
  }

  /** three.js `Box3.union` — pure componentwise min/max (±Inf empty boxes compose correctly). */
  union(box: Box3): Box3 {
    return new Box3(this.min.min(box.min), this.max.max(box.max));
  }

  /** three.js `Box3.intersect` — empty box when there is no overlap. */
  intersect(box: Box3): Box3 {
    const out = new Box3(this.min.max(box.min), this.max.min(box.max));
    return out.isEmpty() ? out.makeEmpty() : out;
  }

  intersectsBox(box: Box3): boolean {
    return !(box.max.x < this.min.x || box.min.x > this.max.x || box.max.y < this.min.y || box.min.y > this.max.y || box.max.z < this.min.z || box.min.z > this.max.z);
  }

  intersectsSphere(sphere: Sphere): boolean {
    const clamped = this.clampPoint(sphere.center);
    return clamped.distanceToSquared(sphere.center) <= sphere.radius * sphere.radius;
  }

  intersectsPlane(plane: Plane): boolean {
    // Min/max normal-projected extents; the plane is crossed when the
    // interval straddles -constant.
    let min: number;
    let max: number;
    if (plane.normal.x > 0) {
      min = plane.normal.x * this.min.x;
      max = plane.normal.x * this.max.x;
    } else {
      min = plane.normal.x * this.max.x;
      max = plane.normal.x * this.min.x;
    }
    if (plane.normal.y > 0) {
      min += plane.normal.y * this.min.y;
      max += plane.normal.y * this.max.y;
    } else {
      min += plane.normal.y * this.max.y;
      max += plane.normal.y * this.min.y;
    }
    if (plane.normal.z > 0) {
      min += plane.normal.z * this.min.z;
      max += plane.normal.z * this.max.z;
    } else {
      min += plane.normal.z * this.max.z;
      max += plane.normal.z * this.min.z;
    }
    return min <= -plane.constant && max >= -plane.constant;
  }

  /** SAT triangle/AABB test — three.js `Box3.intersectsTriangle`. */
  intersectsTriangle(triangle: Triangle): boolean {
    if (this.isEmpty()) return false;

    const center = this.getCenter();
    const extents = this.max.subtract(center);

    // translate triangle to aabb origin
    const v0 = triangle.a.subtract(center);
    const v1 = triangle.b.subtract(center);
    const v2 = triangle.c.subtract(center);

    const f0 = v1.subtract(v0);
    const f1 = v2.subtract(v1);
    const f2 = v0.subtract(v2);

    // 9 edge cross edge axes
    let axes = [
      0, -f0.z, f0.y, 0, -f1.z, f1.y, 0, -f2.z, f2.y,
      f0.z, 0, -f0.x, f1.z, 0, -f1.x, f2.z, 0, -f2.x,
      -f0.y, f0.x, 0, -f1.y, f1.x, 0, -f2.y, f2.x, 0
    ];
    if (!satForAxes(axes, v0, v1, v2, extents)) return false;

    // 3 face normals of the aabb
    axes = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (!satForAxes(axes, v0, v1, v2, extents)) return false;

    // face normal of the triangle
    const triangleNormal = f0.cross(f1);
    axes = [triangleNormal.x, triangleNormal.y, triangleNormal.z];
    return satForAxes(axes, v0, v1, v2, extents);
  }

  containsPoint(point: Vector3): boolean {
    return !this.isEmpty() && point.x >= this.min.x && point.x <= this.max.x && point.y >= this.min.y && point.y <= this.max.y && point.z >= this.min.z && point.z <= this.max.z;
  }

  containsBox(box: Box3): boolean {
    return (
      this.min.x <= box.min.x && box.max.x <= this.max.x &&
      this.min.y <= box.min.y && box.max.y <= this.max.y &&
      this.min.z <= box.min.z && box.max.z <= this.max.z
    );
  }

  /** Normalized (0..1) coordinates of `point` inside the box (three `getParameter`). */
  getParameter(point: Vector3): Vector3 {
    return new Vector3(
      (point.x - this.min.x) / (this.max.x - this.min.x),
      (point.y - this.min.y) / (this.max.y - this.min.y),
      (point.z - this.min.z) / (this.max.z - this.min.z)
    );
  }

  getCenter(): Vector3 {
    return this.isEmpty() ? Vector3.zero.clone() : this.min.add(this.max).multiplyScalar(0.5);
  }

  getSize(): Vector3 {
    return this.isEmpty() ? Vector3.zero.clone() : this.max.subtract(this.min);
  }

  /** Closest point inside the box to `point` (three.js `clampPoint`). */
  clampPoint(point: Vector3): Vector3 {
    return point.clampTo(this.min, this.max);
  }

  distanceToPoint(point: Vector3): number {
    return this.clampPoint(point).distanceTo(point);
  }

  getBoundingSphere(): Sphere {
    if (this.isEmpty()) return new Sphere(Vector3.zero.clone(), -1);
    const center = this.getCenter();
    return new Sphere(center, center.distanceTo(this.max));
  }

  translate(offset: Vector3): Box3 {
    return new Box3(this.min.add(offset), this.max.add(offset));
  }

  transform(matrix: Matrix4): Box3 {
    return this.applyMatrix4(matrix);
  }

  applyMatrix4(matrix: Matrix4): Box3 {
    if (this.isEmpty()) return new Box3();
    const corners = [
      new Vector3(this.min.x, this.min.y, this.min.z),
      new Vector3(this.min.x, this.min.y, this.max.z),
      new Vector3(this.min.x, this.max.y, this.min.z),
      new Vector3(this.min.x, this.max.y, this.max.z),
      new Vector3(this.max.x, this.min.y, this.min.z),
      new Vector3(this.max.x, this.min.y, this.max.z),
      new Vector3(this.max.x, this.max.y, this.min.z),
      new Vector3(this.max.x, this.max.y, this.max.z)
    ];
    return Box3.fromPoints(corners.map((corner) => matrix.transformPoint(corner)));
  }

  equals(box: Box3, epsilon = 0): boolean {
    return this.min.equals(box.min, epsilon) && this.max.equals(box.max, epsilon);
  }
}
