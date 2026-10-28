import { Vector3 } from "./Vector3.js";
import { Vector4 } from "./Vector4.js";
import type { Vector3Like } from "./Vector3.js";
import type { BufferAttributeLike3 } from "./Vector3.js";
import type { BufferAttributeLikeW } from "./Vector4.js";
import type { Plane } from "./Plane.js";

/** Anything with `a`, `b`, `c` corners, including the immutable `@aura3d/math` Triangle. */
export interface TriangleCornersLike {
  readonly a: Vector3Like;
  readonly b: Vector3Like;
  readonly c: Vector3Like;
}

/** Writable vector target that `getInterpolation` accumulates into (Vector2, Vector3 or Vector4). */
interface InterpolationTarget {
  x: number;
  y: number;
  setScalar(scalar: number): unknown;
  addScaledVector(v: never, s: number): unknown;
}

const _v0 = new Vector3();
const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();

const _vab = new Vector3();
const _vac = new Vector3();
const _vbc = new Vector3();
const _vap = new Vector3();
const _vbp = new Vector3();
const _vcp = new Vector3();

const _v40 = new Vector4();
const _v41 = new Vector4();
const _v42 = new Vector4();

/**
 * Mutable three.js-compatible triangle. Every modifier mutates `this` and
 * returns `this`, exactly like three r185 `Triangle`, including the static
 * helpers and `null` for a degenerate `getBarycoord`.
 */
export class Triangle {
  a: Vector3;
  b: Vector3;
  c: Vector3;

  constructor(a: Vector3 = new Vector3(), b: Vector3 = new Vector3(), c: Vector3 = new Vector3()) {
    this.a = a;
    this.b = b;
    this.c = c;
  }

  /** Copy an immutable `@aura3d/math` Triangle (or any `{a, b, c}`) into this triangle. */
  fromImmutable(triangle: TriangleCornersLike): this {
    return this.copy(triangle);
  }

  static getNormal(a: Vector3Like, b: Vector3Like, c: Vector3Like, target: Vector3): Vector3 {
    target.subVectors(c, b);
    _v0.subVectors(a, b);
    target.cross(_v0);

    const targetLengthSq = target.lengthSq();
    if (targetLengthSq > 0) {
      return target.multiplyScalar(1 / Math.sqrt(targetLengthSq));
    }

    return target.set(0, 0, 0);
  }

  // static/instance method to calculate barycentric coordinates
  // based on: http://www.blackpawn.com/texts/pointinpoly/default.html
  static getBarycoord(point: Vector3Like, a: Vector3Like, b: Vector3Like, c: Vector3Like, target: Vector3): Vector3 | null {
    _v0.subVectors(c, a);
    _v1.subVectors(b, a);
    _v2.subVectors(point, a);

    const dot00 = _v0.dot(_v0);
    const dot01 = _v0.dot(_v1);
    const dot02 = _v0.dot(_v2);
    const dot11 = _v1.dot(_v1);
    const dot12 = _v1.dot(_v2);

    const denom = dot00 * dot11 - dot01 * dot01;

    // collinear or singular triangle
    if (denom === 0) {
      target.set(0, 0, 0);
      return null;
    }

    const invDenom = 1 / denom;
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

    // barycentric coordinates must always sum to 1
    return target.set(1 - u - v, v, u);
  }

  static containsPoint(point: Vector3Like, a: Vector3Like, b: Vector3Like, c: Vector3Like): boolean {
    // if the triangle is degenerate then we can't contain a point
    if (Triangle.getBarycoord(point, a, b, c, _v3) === null) {
      return false;
    }

    return _v3.x >= 0 && _v3.y >= 0 && _v3.x + _v3.y <= 1;
  }

  static getInterpolation<T extends InterpolationTarget>(
    point: Vector3Like,
    p1: Vector3Like,
    p2: Vector3Like,
    p3: Vector3Like,
    v1: unknown,
    v2: unknown,
    v3: unknown,
    target: T
  ): T | null {
    if (Triangle.getBarycoord(point, p1, p2, p3, _v3) === null) {
      target.x = 0;
      target.y = 0;
      if ("z" in target) (target as { z: number }).z = 0;
      if ("w" in target) (target as { w: number }).w = 0;
      return null;
    }

    target.setScalar(0);
    target.addScaledVector(v1 as never, _v3.x);
    target.addScaledVector(v2 as never, _v3.y);
    target.addScaledVector(v3 as never, _v3.z);

    return target;
  }

  static getInterpolatedAttribute(
    attr: BufferAttributeLikeW & BufferAttributeLike3,
    i1: number,
    i2: number,
    i3: number,
    barycoord: Vector3Like,
    target: Vector3 | Vector4
  ): Vector3 | Vector4 {
    _v40.setScalar(0);
    _v41.setScalar(0);
    _v42.setScalar(0);

    _v40.fromBufferAttribute(attr, i1);
    _v41.fromBufferAttribute(attr, i2);
    _v42.fromBufferAttribute(attr, i3);

    target.setScalar(0);
    (target as Vector4).addScaledVector(_v40, barycoord.x);
    (target as Vector4).addScaledVector(_v41, barycoord.y);
    (target as Vector4).addScaledVector(_v42, barycoord.z);

    return target;
  }

  static isFrontFacing(a: Vector3Like, b: Vector3Like, c: Vector3Like, direction: Vector3Like): boolean {
    _v0.subVectors(c, b);
    _v1.subVectors(a, b);

    // strictly front facing
    return _v0.cross(_v1).dot(direction) < 0;
  }

  set(a: Vector3Like, b: Vector3Like, c: Vector3Like): this {
    this.a.copy(a);
    this.b.copy(b);
    this.c.copy(c);

    return this;
  }

  setFromPointsAndIndices(points: readonly Vector3Like[], i0: number, i1: number, i2: number): this {
    this.a.copy(points[i0]!);
    this.b.copy(points[i1]!);
    this.c.copy(points[i2]!);

    return this;
  }

  setFromAttributeAndIndices(attribute: BufferAttributeLike3, i0: number, i1: number, i2: number): this {
    this.a.fromBufferAttribute(attribute, i0);
    this.b.fromBufferAttribute(attribute, i1);
    this.c.fromBufferAttribute(attribute, i2);

    return this;
  }

  clone(): this {
    return new (this.constructor as new () => this)().copy(this);
  }

  copy(triangle: TriangleCornersLike): this {
    this.a.copy(triangle.a);
    this.b.copy(triangle.b);
    this.c.copy(triangle.c);

    return this;
  }

  getArea(): number {
    _v0.subVectors(this.c, this.b);
    _v1.subVectors(this.a, this.b);

    return _v0.cross(_v1).length() * 0.5;
  }

  getMidpoint(target: Vector3): Vector3 {
    return target.addVectors(this.a, this.b).add(this.c).multiplyScalar(1 / 3);
  }

  getNormal(target: Vector3): Vector3 {
    return Triangle.getNormal(this.a, this.b, this.c, target);
  }

  getPlane(target: Plane): Plane {
    return target.setFromCoplanarPoints(this.a, this.b, this.c);
  }

  getBarycoord(point: Vector3Like, target: Vector3): Vector3 | null {
    return Triangle.getBarycoord(point, this.a, this.b, this.c, target);
  }

  getInterpolation<T extends InterpolationTarget>(point: Vector3Like, v1: unknown, v2: unknown, v3: unknown, target: T): T | null {
    return Triangle.getInterpolation(point, this.a, this.b, this.c, v1, v2, v3, target);
  }

  containsPoint(point: Vector3Like): boolean {
    return Triangle.containsPoint(point, this.a, this.b, this.c);
  }

  isFrontFacing(direction: Vector3Like): boolean {
    return Triangle.isFrontFacing(this.a, this.b, this.c, direction);
  }

  intersectsBox(box: { intersectsTriangle(triangle: Triangle): boolean }): boolean {
    return box.intersectsTriangle(this);
  }

  closestPointToPoint(p: Vector3Like, target: Vector3): Vector3 {
    const a = this.a;
    const b = this.b;
    const c = this.c;
    let v: number;
    let w: number;

    // algorithm thanks to Real-Time Collision Detection by Christer Ericson,
    // published by Morgan Kaufmann Publishers, (c) 2005 Elsevier Inc.,
    // under the accompanying license; see chapter 5.1.5 for detailed explanation.
    // basically, we're distinguishing which of the voronoi regions of the triangle
    // the point lies in with the minimum amount of redundant computation.

    _vab.subVectors(b, a);
    _vac.subVectors(c, a);
    _vap.subVectors(p, a);
    const d1 = _vab.dot(_vap);
    const d2 = _vac.dot(_vap);
    if (d1 <= 0 && d2 <= 0) {
      // vertex region of A; barycentric coords (1, 0, 0)
      return target.copy(a);
    }

    _vbp.subVectors(p, b);
    const d3 = _vab.dot(_vbp);
    const d4 = _vac.dot(_vbp);
    if (d3 >= 0 && d4 <= d3) {
      // vertex region of B; barycentric coords (0, 1, 0)
      return target.copy(b);
    }

    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      v = d1 / (d1 - d3);
      // edge region of AB; barycentric coords (1-v, v, 0)
      return target.copy(a).addScaledVector(_vab, v);
    }

    _vcp.subVectors(p, c);
    const d5 = _vab.dot(_vcp);
    const d6 = _vac.dot(_vcp);
    if (d6 >= 0 && d5 <= d6) {
      // vertex region of C; barycentric coords (0, 0, 1)
      return target.copy(c);
    }

    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      w = d2 / (d2 - d6);
      // edge region of AC; barycentric coords (1-w, 0, w)
      return target.copy(a).addScaledVector(_vac, w);
    }

    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      _vbc.subVectors(c, b);
      w = (d4 - d3) / (d4 - d3 + (d5 - d6));
      // edge region of BC; barycentric coords (0, 1-w, w)
      return target.copy(b).addScaledVector(_vbc, w); // edge region of BC
    }

    // face region
    const denom = 1 / (va + vb + vc);
    // u = va * denom
    v = vb * denom;
    w = vc * denom;

    return target.copy(a).addScaledVector(_vab, v).addScaledVector(_vac, w);
  }

  equals(triangle: TriangleCornersLike): boolean {
    return this.a.equals(triangle.a) && this.b.equals(triangle.b) && this.c.equals(triangle.c);
  }
}
