import { Vector3 } from "./Vector3.js";
import { Matrix3 } from "./Matrix3.js";
import type { Line3 } from "./Line3.js";
import type { Box3 } from "./Box3.js";
import type { Sphere } from "./Sphere.js";
import type { Matrix4 } from "./Matrix4.js";

/**
 * Plane `n·x + c = 0` with normalized `normal` — three.js `Plane` parity.
 * The constructor normalizes `(normal, constant)` like three's
 * `Plane.normalize()` so signed distances are always well-defined.
 */
export class Plane {
  readonly normal: Vector3;
  readonly constant: number;

  constructor(normal = Vector3.up.clone(), constant = 0) {
    const len = normal.length();
    if (len === 0) throw new RangeError("Plane normal must be non-zero.");
    this.normal = normal.multiplyScalar(1 / len);
    this.constant = constant / len;
  }

  /** three.js `Plane.setComponents` — does NOT normalize (three semantics). */
  static setComponents(x: number, y: number, z: number, w: number): Plane {
    return new Plane(new Vector3(x, y, z), w);
  }

  static fromPointNormal(point: Vector3, normal: Vector3): Plane {
    const normalized = normal.normalize();
    return new Plane(normalized, -point.dot(normalized));
  }

  /** three.js `Plane.setFromNormalAndCoplanarPoint`. */
  static setFromNormalAndCoplanarPoint(normal: Vector3, point: Vector3): Plane {
    return Plane.fromPointNormal(point, normal);
  }

  /** CCW winding determines the normal (three `setFromCoplanarPoints`). */
  static fromCoplanarPoints(a: Vector3, b: Vector3, c: Vector3): Plane {
    const normal = c.subtract(b).cross(a.subtract(b)).normalize();
    return Plane.fromPointNormal(a, normal);
  }

  setFromCoplanarPoints(a: Vector3, b: Vector3, c: Vector3): Plane {
    return Plane.fromCoplanarPoints(a, b, c);
  }

  clone(): Plane {
    return new Plane(this.normal, this.constant);
  }

  copy(plane: Plane): Plane {
    return new Plane(plane.normal, plane.constant);
  }

  negate(): Plane {
    return new Plane(this.normal.negate(), -this.constant);
  }

  distanceToPoint(point: Vector3): number {
    return this.normal.dot(point) + this.constant;
  }

  /** Signed distance to a sphere's center plus its radius (three `distanceToSphere`). */
  distanceToSphere(sphere: Sphere): number {
    return this.distanceToPoint(sphere.center) - sphere.radius;
  }

  projectPoint(point: Vector3): Vector3 {
    return point.subtract(this.normal.multiplyScalar(this.distanceToPoint(point)));
  }

  /** Point on the plane nearest the origin — `normal * -constant` (three `coplanarPoint`). */
  coplanarPoint(): Vector3 {
    return this.normal.multiplyScalar(-this.constant);
  }

  /**
   * Segment intersection — three.js `Plane.intersectLine` parity:
   * coplanar line returns `line.start`, parallel returns `undefined`,
   * and `undefined` when the intersection lies outside the segment.
   */
  intersectLine(start: Vector3, end: Vector3): Vector3 | undefined;
  intersectLine(line: Line3): Vector3 | undefined;
  intersectLine(a: Vector3 | Line3, b?: Vector3): Vector3 | undefined {
    const start = a instanceof Vector3 ? a : a.start;
    const end = a instanceof Vector3 ? (b as Vector3) : a.end;
    const direction = end.subtract(start);
    const denominator = this.normal.dot(direction);
    if (denominator === 0) {
      // line is coplanar, return start; otherwise no intersection
      if (this.distanceToPoint(start) === 0) return start;
      return undefined;
    }
    const t = -(start.dot(this.normal) + this.constant) / denominator;
    if (t < 0 || t > 1) return undefined;
    return start.addScaled(direction, t);
  }

  /** Whether the segment `line` crosses the plane (three `intersectsLine`). */
  intersectsLine(line: Line3): boolean {
    const startSign = this.distanceToPoint(line.start);
    const endSign = this.distanceToPoint(line.end);
    return (startSign < 0 && endSign > 0) || (endSign < 0 && startSign > 0);
  }

  intersectsBox(box: Box3): boolean {
    return box.intersectsPlane(this);
  }

  intersectsSphere(sphere: Sphere): boolean {
    return sphere.intersectsPlane(this);
  }

  /**
   * three.js `Plane.applyMatrix4` — the matrix must be affine; pass a
   * precomputed `Matrix3.getNormalMatrix(matrix)` as `normalMatrix` to
   * skip recomputation.
   */
  applyMatrix4(matrix: Matrix4, normalMatrix?: Matrix3): Plane {
    const nm = normalMatrix ?? Matrix3.normalFromMatrix4(matrix);
    const referencePoint = this.coplanarPoint().transformMatrix4(matrix);
    const normal = this.normal.applyMatrix3(nm).normalize();
    return new Plane(normal, -referencePoint.dot(normal));
  }

  translate(offset: Vector3): Plane {
    return new Plane(this.normal, this.constant - offset.dot(this.normal));
  }

  equals(plane: Plane, epsilon = 1e-10): boolean {
    return this.normal.equals(plane.normal, epsilon) && Math.abs(this.constant - plane.constant) <= epsilon;
  }
}
