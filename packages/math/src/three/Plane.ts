import { Plane as ImmutablePlane } from "../Plane.js";
import { Matrix3 } from "./Matrix3.js";
import { Vector3 } from "./Vector3.js";
import type { Vector3Like } from "./Vector3.js";

/** Anything with a unit `normal` and `constant`, including the immutable `@aura3d/math` Plane. */
export interface PlaneLike {
  readonly normal: Vector3Like;
  readonly constant: number;
}

/** Line segment with `start`, `end` and `delta(target)` (the compat-free three.js `Line3` shape). */
export interface Line3Like {
  readonly start: Vector3;
  readonly end: Vector3;
  delta(target: Vector3): Vector3;
}

const _vector1 = new Vector3();
const _vector2 = new Vector3();
const _normalMatrix = new Matrix3();

/**
 * Mutable three.js-compatible plane `normal . x + constant = 0`. Every
 * modifier mutates `this` and returns `this`, exactly like three r185 `Plane`
 * (the constructor and setters do not normalize, as in three).
 */
export class Plane {
  declare readonly isPlane: true;

  normal: Vector3;
  constant: number;

  constructor(normal: Vector3 = new Vector3(1, 0, 0), constant = 0) {
    // normal is assumed to be normalized
    this.normal = normal;
    this.constant = constant;
  }

  /**
   * Copy an immutable `@aura3d/math` Plane (or any `{normal, constant}`) into this plane.
   * The immutable Plane's normal is always unit length.
   */
  fromImmutable(plane: PlaneLike): this {
    this.normal.copy(plane.normal);
    this.constant = plane.constant;
    return this;
  }

  /**
   * Snapshot as an immutable `@aura3d/math` Plane. That class normalizes `(normal, constant)`
   * in its constructor (and throws on a zero normal), so a non-unit compat plane comes back normalized.
   */
  toImmutable(): ImmutablePlane {
    return new ImmutablePlane(this.normal.toImmutable(), this.constant);
  }

  set(normal: Vector3Like, constant: number): this {
    this.normal.copy(normal);
    this.constant = constant;
    return this;
  }

  setComponents(x: number, y: number, z: number, w: number): this {
    this.normal.set(x, y, z);
    this.constant = w;
    return this;
  }

  setFromNormalAndCoplanarPoint(normal: Vector3Like, point: Vector3): this {
    this.normal.copy(normal);
    this.constant = -point.dot(this.normal);
    return this;
  }

  setFromCoplanarPoints(a: Vector3, b: Vector3, c: Vector3): this {
    const normal = _vector1.subVectors(c, b).cross(_vector2.subVectors(a, b)).normalize();

    // Q: should an error be thrown if normal is zero (e.g. degenerate plane)?
    this.setFromNormalAndCoplanarPoint(normal, a);

    return this;
  }

  copy(plane: PlaneLike): this {
    this.normal.copy(plane.normal);
    this.constant = plane.constant;
    return this;
  }

  normalize(): this {
    // Note: will lead to a divide by zero if the plane is invalid.
    const inverseNormalLength = 1.0 / this.normal.length();
    this.normal.multiplyScalar(inverseNormalLength);
    this.constant *= inverseNormalLength;

    return this;
  }

  negate(): this {
    this.constant *= -1;
    this.normal.negate();

    return this;
  }

  distanceToPoint(point: Vector3Like): number {
    return this.normal.dot(point) + this.constant;
  }

  distanceToSphere(sphere: { readonly center: Vector3Like; readonly radius: number }): number {
    return this.distanceToPoint(sphere.center) - sphere.radius;
  }

  projectPoint(point: Vector3Like, target: Vector3): Vector3 {
    return target.copy(point).addScaledVector(this.normal, -this.distanceToPoint(point));
  }

  intersectLine(line: Line3Like, target: Vector3, clampToLine = true): Vector3 | null {
    const direction = line.delta(_vector1);

    const denominator = this.normal.dot(direction);

    if (denominator === 0) {
      // line is coplanar, return origin
      if (this.distanceToPoint(line.start) === 0) {
        return target.copy(line.start);
      }

      // Unsure if this is the correct method to handle this case.
      return null;
    }

    const t = -(line.start.dot(this.normal) + this.constant) / denominator;

    if (clampToLine === true && (t < 0 || t > 1)) {
      return null;
    }

    return target.copy(line.start).addScaledVector(direction, t);
  }

  intersectsLine(line: Line3Like): boolean {
    // Note: this tests if a line intersects the plane, not whether it (or its end-points) are coplanar with it.
    const startSign = this.distanceToPoint(line.start);
    const endSign = this.distanceToPoint(line.end);

    return (startSign < 0 && endSign > 0) || (endSign < 0 && startSign > 0);
  }

  intersectsBox(box: { intersectsPlane(plane: Plane): boolean }): boolean {
    return box.intersectsPlane(this);
  }

  intersectsSphere(sphere: { intersectsPlane(plane: Plane): boolean }): boolean {
    return sphere.intersectsPlane(this);
  }

  coplanarPoint(target: Vector3): Vector3 {
    return target.copy(this.normal).multiplyScalar(-this.constant);
  }

  applyMatrix4(matrix: { readonly elements: ArrayLike<number> }, optionalNormalMatrix?: Matrix3): this {
    const normalMatrix = optionalNormalMatrix || _normalMatrix.getNormalMatrix(matrix);

    const referencePoint = this.coplanarPoint(_vector1).applyMatrix4(matrix);

    const normal = this.normal.applyMatrix3(normalMatrix).normalize();

    this.constant = -referencePoint.dot(normal);

    return this;
  }

  translate(offset: Vector3Like): this {
    // dot products commute exactly in floating point, so this equals three's offset.dot(normal)
    this.constant -= this.normal.dot(offset);

    return this;
  }

  equals(plane: PlaneLike): boolean {
    return this.normal.equals(plane.normal) && plane.constant === this.constant;
  }

  clone(): this {
    return new (this.constructor as new () => this)().copy(this);
  }
}

(Plane.prototype as { isPlane: boolean }).isPlane = true;
