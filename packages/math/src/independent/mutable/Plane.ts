import { Plane as ImmutablePlane } from "../../Plane.js";
import { Vector3 as ImmutableVector3 } from "../../Vector3.js";
import { Matrix3 } from "./Matrix3.js";
import { Vector3, type Vector3Like } from "./Vector3.js";

export interface PlaneLike {
  readonly normal: Vector3Like;
  readonly constant: number;
}

export interface Line3Like {
  readonly start: Vector3;
  readonly end: Vector3;
  delta(target: Vector3): Vector3;
}

/**
 * A plane is the set of points satisfying normal · point + constant = 0. As in 4.x, distance and
 * projection queries read that expression directly: they give true distances only when the normal
 * has unit length (call `normalize()` first), and a zero normal is not special-cased.
 */
export class Plane {
  readonly isPlane = true;
  normal: Vector3;
  constant: number;

  constructor(normal = new Vector3(1, 0, 0), constant = 0) {
    this.normal = normal;
    this.constant = constant;
  }

  fromImmutable(plane: PlaneLike): this {
    return this.copy(plane);
  }

  toImmutable(): ImmutablePlane {
    const { x, y, z } = this.normal;
    return new ImmutablePlane(new ImmutableVector3(x, y, z), this.constant);
  }

  set(normal: Vector3Like, constant: number): this {
    const { x, y, z } = normal;
    this.normal.set(x, y, z);
    this.constant = constant;
    return this;
  }

  setComponents(x: number, y: number, z: number, w: number): this {
    this.normal.set(x, y, z);
    this.constant = w;
    return this;
  }

  setFromNormalAndCoplanarPoint(normal: Vector3Like, point: Vector3): this {
    const { x: nx, y: ny, z: nz } = normal;
    const { x: px, y: py, z: pz } = point;
    this.normal.set(nx, ny, nz);
    this.constant = -(nx * px + ny * py + nz * pz);
    return this;
  }

  setFromCoplanarPoints(a: Vector3, b: Vector3, c: Vector3): this {
    const ax = a.x, ay = a.y, az = a.z;
    let ux = b.x - ax, uy = b.y - ay, uz = b.z - az;
    let vx = c.x - ax, vy = c.y - ay, vz = c.z - az;
    // Scaling the edges before crossing avoids needless overflow and underflow. Non-finite edges are
    // crossed as they are, so NaN reaches only the components it affects (as in 4.x).
    const uScale = Math.max(Math.abs(ux), Math.abs(uy), Math.abs(uz));
    const vScale = Math.max(Math.abs(vx), Math.abs(vy), Math.abs(vz));
    if (uScale === 0 || vScale === 0) return this.setComponents(0, 0, 0, 0);
    if (Number.isFinite(uScale) && Number.isFinite(vScale)) {
      ux /= uScale; uy /= uScale; uz /= uScale;
      vx /= vScale; vy /= vScale; vz /= vScale;
    }
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) return this.setComponents(0, 0, 0, 0);
    const divisor = Number.isNaN(length) ? 1 : length;
    const x = nx / divisor, y = ny / divisor, z = nz / divisor;
    this.normal.set(x, y, z);
    this.constant = -(x * ax + y * ay + z * az);
    return this;
  }

  copy(plane: PlaneLike): this {
    return this.set(plane.normal, plane.constant);
  }

  normalize(): this {
    const inverseLength = 1 / this.normal.length();
    this.normal.multiplyScalar(inverseLength);
    this.constant *= inverseLength;
    return this;
  }

  negate(): this {
    const { x, y, z } = this.normal;
    this.normal.set(-x, -y, -z);
    this.constant = -this.constant;
    return this;
  }

  distanceToPoint(point: Vector3Like): number {
    return this.normal.x * point.x + this.normal.y * point.y + this.normal.z * point.z + this.constant;
  }

  distanceToSphere(sphere: { readonly center: Vector3Like; readonly radius: number }): number {
    return this.distanceToPoint(sphere.center) - sphere.radius;
  }

  projectPoint(point: Vector3Like, target: Vector3): Vector3 {
    const distance = this.distanceToPoint(point);
    const { x: px, y: py, z: pz } = point;
    return target.set(px - distance * this.normal.x, py - distance * this.normal.y, pz - distance * this.normal.z);
  }

  /** A segment lying in the plane returns its start; a parallel one off the plane returns null. */
  intersectLine(line: Line3Like, target: Vector3, clampToLine = true): Vector3 | null {
    const sx = line.start.x, sy = line.start.y, sz = line.start.z;
    const dx = line.end.x - sx, dy = line.end.y - sy, dz = line.end.z - sz;
    const denominator = this.normal.x * dx + this.normal.y * dy + this.normal.z * dz;
    const startDistance = this.distanceToPoint(line.start);
    if (denominator === 0) return startDistance === 0 ? target.set(sx, sy, sz) : null;
    const t = -startDistance / denominator;
    if (clampToLine && (t < 0 || t > 1)) return null;
    return target.set(sx + t * dx, sy + t * dy, sz + t * dz);
  }

  /** True when the endpoints lie strictly on opposite sides; a segment that only touches does not intersect. */
  intersectsLine(line: Line3Like): boolean {
    const start = this.distanceToPoint(line.start);
    const end = this.distanceToPoint(line.end);
    return (start < 0 && end > 0) || (end < 0 && start > 0);
  }

  intersectsBox(box: { intersectsPlane(plane: Plane): boolean }): boolean {
    return box.intersectsPlane(this);
  }

  intersectsSphere(sphere: { intersectsPlane(plane: Plane): boolean }): boolean {
    return sphere.intersectsPlane(this);
  }

  coplanarPoint(target: Vector3): Vector3 {
    return target.set(-this.constant * this.normal.x, -this.constant * this.normal.y, -this.constant * this.normal.z);
  }

  /** The normal is mapped by the normal matrix (computed from the matrix when omitted) and renormalized. */
  applyMatrix4(matrix: { readonly elements: ArrayLike<number> }, optionalNormalMatrix?: Matrix3): this {
    const normalMatrix = optionalNormalMatrix ?? new Matrix3().getNormalMatrix(matrix);
    const point = this.coplanarPoint(new Vector3()).applyMatrix4(matrix);
    this.normal.applyMatrix3(normalMatrix).normalize();
    this.constant = -(point.x * this.normal.x + point.y * this.normal.y + point.z * this.normal.z);
    return this;
  }

  translate(offset: Vector3Like): this {
    this.constant -= this.normal.x * offset.x + this.normal.y * offset.y + this.normal.z * offset.z;
    return this;
  }

  equals(plane: PlaneLike): boolean {
    return this.normal.x === plane.normal.x && this.normal.y === plane.normal.y
      && this.normal.z === plane.normal.z && this.constant === plane.constant;
  }

  clone(): this {
    return new Plane(new Vector3(this.normal.x, this.normal.y, this.normal.z), this.constant) as this;
  }
}
