import { Box3 as ImmutableBox3 } from "../Box3.js";
import { Vector3 } from "./Vector3.js";
import type { Matrix4 } from "./Matrix4.js";
import type { Sphere } from "./Sphere.js";
import type { Vector3Like } from "./Vector3.js";

/** Anything with `min` and `max` `{x, y, z}` corners, including the immutable `@aura3d/math` Box3. */
export interface Box3Like {
  readonly min: Vector3Like;
  readonly max: Vector3Like;
}

/** Triangle with `a`, `b`, `c` corners (the compat or immutable Triangle). */
export interface TriangleLike {
  readonly a: Vector3Like;
  readonly b: Vector3Like;
  readonly c: Vector3Like;
}

/** Buffer attribute shape `setFromBufferAttribute` and `expandByObject` read. */
export interface PositionAttributeLike {
  readonly count: number;
  getX(index: number): number;
  getY(index: number): number;
  getZ(index: number): number;
}

/**
 * The scene-object surface `setFromObject` / `expandByObject` walk, matching
 * the three.js `Object3D` / `Mesh` fields they read. Plain objects with a
 * `geometry` and `matrixWorld` work; anything else contributes only its children.
 */
export interface Box3ObjectLike {
  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
  readonly matrixWorld: Matrix4;
  readonly children: readonly Box3ObjectLike[];
  readonly geometry?: {
    boundingBox: Box3 | null;
    getAttribute(name: string): PositionAttributeLike | undefined;
    computeBoundingBox(): void;
  };
  readonly boundingBox?: Box3 | null;
  readonly isMesh?: boolean;
  readonly isInstancedMesh?: boolean;
  computeBoundingBox?(): void;
  getVertexPosition?(index: number, target: Vector3): Vector3;
}

/**
 * Mutable three.js-compatible axis-aligned box. Every modifier mutates `this`
 * and returns `this`, exactly like three r185 `Box3`. `min` / `max` are
 * mutable compat Vector3 values.
 */
export class Box3 {
  declare readonly isBox3: true;

  min: Vector3;
  max: Vector3;

  constructor(
    min: Vector3 = new Vector3(+Infinity, +Infinity, +Infinity),
    max: Vector3 = new Vector3(-Infinity, -Infinity, -Infinity)
  ) {
    this.min = min;
    this.max = max;
  }

  /** Copy an immutable `@aura3d/math` Box3 (or any `{min, max}`) into this box. */
  fromImmutable(box: Box3Like): this {
    this.min.copy(box.min);
    this.max.copy(box.max);
    return this;
  }

  /** Snapshot as an immutable `@aura3d/math` Box3. */
  toImmutable(): ImmutableBox3 {
    return new ImmutableBox3(this.min.toImmutable(), this.max.toImmutable());
  }

  set(min: Vector3Like, max: Vector3Like): this {
    this.min.copy(min);
    this.max.copy(max);
    return this;
  }

  setFromArray(array: ArrayLike<number>): this {
    this.makeEmpty();
    for (let i = 0, il = array.length; i < il; i += 3) {
      this.expandByPoint(_vector.fromArray(array, i));
    }
    return this;
  }

  setFromBufferAttribute(attribute: PositionAttributeLike): this {
    this.makeEmpty();
    for (let i = 0, il = attribute.count; i < il; i += 1) {
      this.expandByPoint(_vector.fromBufferAttribute(attribute, i));
    }
    return this;
  }

  setFromPoints(points: readonly Vector3Like[]): this {
    this.makeEmpty();
    for (let i = 0, il = points.length; i < il; i += 1) {
      this.expandByPoint(points[i]!);
    }
    return this;
  }

  setFromCenterAndSize(center: Vector3Like, size: Vector3Like): this {
    const halfSize = _vector.copy(size).multiplyScalar(0.5);
    this.min.copy(center).sub(halfSize);
    this.max.copy(center).add(halfSize);
    return this;
  }

  setFromObject(object: Box3ObjectLike, precise = false): this {
    this.makeEmpty();
    return this.expandByObject(object, precise);
  }

  clone(): this {
    return new (this.constructor as new () => this)().copy(this);
  }

  copy(box: Box3Like): this {
    this.min.copy(box.min);
    this.max.copy(box.max);
    return this;
  }

  makeEmpty(): this {
    this.min.x = this.min.y = this.min.z = +Infinity;
    this.max.x = this.max.y = this.max.z = -Infinity;
    return this;
  }

  isEmpty(): boolean {
    // this is a more robust check for empty than ( volume <= 0 ) because volume can get positive with two negative axes
    return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z;
  }

  getCenter(target: Vector3): Vector3 {
    return this.isEmpty() ? target.set(0, 0, 0) : target.addVectors(this.min, this.max).multiplyScalar(0.5);
  }

  getSize(target: Vector3): Vector3 {
    return this.isEmpty() ? target.set(0, 0, 0) : target.subVectors(this.max, this.min);
  }

  expandByPoint(point: Vector3Like): this {
    this.min.min(point);
    this.max.max(point);
    return this;
  }

  expandByVector(vector: Vector3Like): this {
    this.min.sub(vector);
    this.max.add(vector);
    return this;
  }

  expandByScalar(scalar: number): this {
    this.min.addScalar(-scalar);
    this.max.addScalar(scalar);
    return this;
  }

  expandByObject(object: Box3ObjectLike, precise = false): this {
    // Computes the world-axis-aligned bounding box of an object (including its children),
    // accounting for both the object's, and children's, world transforms
    object.updateWorldMatrix(false, false);

    const geometry = object.geometry;

    if (geometry !== undefined) {
      const positionAttribute = geometry.getAttribute("position");

      // precise AABB computation based on vertex data requires at least a position attribute.
      // instancing isn't supported so far and uses the normal (conservative) code path.
      if (precise === true && positionAttribute !== undefined && object.isInstancedMesh !== true) {
        for (let i = 0, l = positionAttribute.count; i < l; i += 1) {
          if (object.isMesh === true && object.getVertexPosition) {
            object.getVertexPosition(i, _vector);
          } else {
            _vector.fromBufferAttribute(positionAttribute, i);
          }

          _vector.applyMatrix4(object.matrixWorld);
          this.expandByPoint(_vector);
        }
      } else {
        if (object.boundingBox !== undefined) {
          // object-level bounding box
          if (object.boundingBox === null) {
            object.computeBoundingBox?.();
          }
          _box.copy(object.boundingBox!);
        } else {
          // geometry-level bounding box
          if (geometry.boundingBox === null) {
            geometry.computeBoundingBox();
          }
          _box.copy(geometry.boundingBox!);
        }

        _box.applyMatrix4(object.matrixWorld);
        this.union(_box);
      }
    }

    const children = object.children;

    for (let i = 0, l = children.length; i < l; i += 1) {
      this.expandByObject(children[i]!, precise);
    }

    return this;
  }

  containsPoint(point: Vector3Like): boolean {
    return (
      point.x >= this.min.x && point.x <= this.max.x &&
      point.y >= this.min.y && point.y <= this.max.y &&
      point.z >= this.min.z && point.z <= this.max.z
    );
  }

  containsBox(box: Box3Like): boolean {
    return (
      this.min.x <= box.min.x && box.max.x <= this.max.x &&
      this.min.y <= box.min.y && box.max.y <= this.max.y &&
      this.min.z <= box.min.z && box.max.z <= this.max.z
    );
  }

  getParameter(point: Vector3Like, target: Vector3): Vector3 {
    // This can potentially have a divide by zero if the box
    // has a size dimension of 0.
    return target.set(
      (point.x - this.min.x) / (this.max.x - this.min.x),
      (point.y - this.min.y) / (this.max.y - this.min.y),
      (point.z - this.min.z) / (this.max.z - this.min.z)
    );
  }

  intersectsBox(box: Box3Like): boolean {
    // using 6 splitting planes to rule out intersections.
    return (
      box.max.x >= this.min.x && box.min.x <= this.max.x &&
      box.max.y >= this.min.y && box.min.y <= this.max.y &&
      box.max.z >= this.min.z && box.min.z <= this.max.z
    );
  }

  intersectsSphere(sphere: { readonly center: Vector3Like; readonly radius: number }): boolean {
    // Find the point on the AABB closest to the sphere center.
    this.clampPoint(sphere.center, _vector);

    // If that point is inside the sphere, the AABB and sphere intersect.
    return _vector.distanceToSquared(sphere.center) <= sphere.radius * sphere.radius;
  }

  intersectsPlane(plane: { readonly normal: Vector3Like; readonly constant: number }): boolean {
    // We compute the minimum and maximum dot product values. If those values
    // are on the same side (back or front) of the plane, then there is no intersection.
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

  intersectsTriangle(triangle: TriangleLike): boolean {
    if (this.isEmpty()) {
      return false;
    }

    // compute box center and extents
    this.getCenter(_center);
    _extents.subVectors(this.max, _center);

    // translate triangle to aabb origin
    _v0.subVectors(triangle.a, _center);
    _v1.subVectors(triangle.b, _center);
    _v2.subVectors(triangle.c, _center);

    // compute edge vectors for triangle
    _f0.subVectors(_v1, _v0);
    _f1.subVectors(_v2, _v1);
    _f2.subVectors(_v0, _v2);

    // test against axes that are given by cross product combinations of the edges of the triangle and the edges of the aabb
    // make an axis testing of each of the 3 sides of the aabb against each of the 3 sides of the triangle = 9 axis of separation
    // axis_ij = u_i x f_j (u0, u1, u2 = face normals of aabb = x,y,z axes vectors since aabb is axis aligned)
    let axes = [
      0, -_f0.z, _f0.y, 0, -_f1.z, _f1.y, 0, -_f2.z, _f2.y,
      _f0.z, 0, -_f0.x, _f1.z, 0, -_f1.x, _f2.z, 0, -_f2.x,
      -_f0.y, _f0.x, 0, -_f1.y, _f1.x, 0, -_f2.y, _f2.x, 0
    ];
    if (!satForAxes(axes, _v0, _v1, _v2, _extents)) {
      return false;
    }

    // test 3 face normals from the aabb
    axes = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (!satForAxes(axes, _v0, _v1, _v2, _extents)) {
      return false;
    }

    // finally testing the face normal of the triangle
    // use already existing triangle edge vectors here
    _triangleNormal.crossVectors(_f0, _f1);
    axes = [_triangleNormal.x, _triangleNormal.y, _triangleNormal.z];

    return satForAxes(axes, _v0, _v1, _v2, _extents);
  }

  clampPoint(point: Vector3Like, target: Vector3): Vector3 {
    return target.copy(point).clamp(this.min, this.max);
  }

  distanceToPoint(point: Vector3): number {
    return this.clampPoint(point, _vector).distanceTo(point);
  }

  getBoundingSphere(target: Sphere): Sphere {
    if (this.isEmpty()) {
      target.makeEmpty();
    } else {
      this.getCenter(target.center);
      target.radius = this.getSize(_vector).length() * 0.5;
    }
    return target;
  }

  intersect(box: Box3Like): this {
    this.min.max(box.min);
    this.max.min(box.max);

    // ensure that if there is no overlap, the result is fully empty, not slightly empty with non-inf/+inf values that will cause subsequence intersects to erroneously return valid values.
    if (this.isEmpty()) this.makeEmpty();

    return this;
  }

  union(box: Box3Like): this {
    this.min.min(box.min);
    this.max.max(box.max);
    return this;
  }

  applyMatrix4(matrix: { readonly elements: ArrayLike<number> }): this {
    // transform of empty box is an empty box.
    if (this.isEmpty()) return this;

    // NOTE: I am using a binary pattern to specify all 2^3 combinations below
    _points[0]!.set(this.min.x, this.min.y, this.min.z).applyMatrix4(matrix); // 000
    _points[1]!.set(this.min.x, this.min.y, this.max.z).applyMatrix4(matrix); // 001
    _points[2]!.set(this.min.x, this.max.y, this.min.z).applyMatrix4(matrix); // 010
    _points[3]!.set(this.min.x, this.max.y, this.max.z).applyMatrix4(matrix); // 011
    _points[4]!.set(this.max.x, this.min.y, this.min.z).applyMatrix4(matrix); // 100
    _points[5]!.set(this.max.x, this.min.y, this.max.z).applyMatrix4(matrix); // 101
    _points[6]!.set(this.max.x, this.max.y, this.min.z).applyMatrix4(matrix); // 110
    _points[7]!.set(this.max.x, this.max.y, this.max.z).applyMatrix4(matrix); // 111

    this.setFromPoints(_points);

    return this;
  }

  translate(offset: Vector3Like): this {
    this.min.add(offset);
    this.max.add(offset);
    return this;
  }

  equals(box: Box3Like): boolean {
    return this.min.equals(box.min) && this.max.equals(box.max);
  }

  toJSON(): { min: number[]; max: number[] } {
    return {
      min: this.min.toArray(),
      max: this.max.toArray()
    };
  }

  fromJSON(json: { min: ArrayLike<number>; max: ArrayLike<number> }): this {
    this.min.fromArray(json.min);
    this.max.fromArray(json.max);
    return this;
  }
}

(Box3.prototype as { isBox3: boolean }).isBox3 = true;

const _points: Vector3[] = [
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3()
];

const _vector = new Vector3();
const _box = new Box3();

// triangle centered vertices
const _v0 = new Vector3();
const _v1 = new Vector3();
const _v2 = new Vector3();

// triangle edge vectors
const _f0 = new Vector3();
const _f1 = new Vector3();
const _f2 = new Vector3();

const _center = new Vector3();
const _extents = new Vector3();
const _triangleNormal = new Vector3();
const _testAxis = new Vector3();

function satForAxes(axes: number[], v0: Vector3, v1: Vector3, v2: Vector3, extents: Vector3): boolean {
  for (let i = 0, j = axes.length - 3; i <= j; i += 3) {
    _testAxis.fromArray(axes, i);
    // project the aabb onto the separating axis
    const r = extents.x * Math.abs(_testAxis.x) + extents.y * Math.abs(_testAxis.y) + extents.z * Math.abs(_testAxis.z);
    // project all 3 vertices of the triangle onto the separating axis
    const p0 = v0.dot(_testAxis);
    const p1 = v1.dot(_testAxis);
    const p2 = v2.dot(_testAxis);
    // actual test, basically see if either of the most extreme of the triangle points intersects r
    if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > r) {
      // points of the projected triangle are outside the projected half-length of the aabb
      // the axis is separating and we can exit
      return false;
    }
  }

  return true;
}
