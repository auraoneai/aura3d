import { Plane as ImmutablePlane } from "../../Plane.js";
import { Vector3 as ImmutableVector3 } from "../../Vector3.js";
import type { Matrix3 } from "./Matrix3.js";
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

function unitEquation(normal: Vector3Like, constant: number): PlaneLike | null {
  const scale = Math.max(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
  if (scale === 0) return null;
  const x = normal.x / scale, y = normal.y / scale, z = normal.z / scale;
  const length = Math.hypot(x, y, z);
  let normalizedConstant = constant / scale;
  normalizedConstant = Number.isFinite(normalizedConstant)
    ? normalizedConstant / length
    : (constant / length) / scale;
  return { normal: { x: x / length, y: y / length, z: z / length }, constant: normalizedConstant };
}

/** A plane is the set of points satisfying normal · point + constant = 0. */
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
    // Scaling the edges before crossing avoids needless overflow and underflow.
    const uScale = Math.max(Math.abs(ux), Math.abs(uy), Math.abs(uz));
    const vScale = Math.max(Math.abs(vx), Math.abs(vy), Math.abs(vz));
    if (uScale === 0 || vScale === 0) return this.setComponents(0, 0, 0, 0);
    ux /= uScale; uy /= uScale; uz /= uScale;
    vx /= vScale; vy /= vScale; vz /= vScale;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) return this.setComponents(0, 0, 0, 0);
    const x = nx / length, y = ny / length, z = nz / length;
    this.normal.set(x, y, z);
    this.constant = -(x * ax + y * ay + z * az);
    return this;
  }

  copy(plane: PlaneLike): this {
    return this.set(plane.normal, plane.constant);
  }

  normalize(): this {
    const unit = unitEquation(this.normal, this.constant);
    return unit ? this.set(unit.normal, unit.constant) : this;
  }

  negate(): this {
    const { x, y, z } = this.normal;
    this.normal.set(-x, -y, -z);
    this.constant = -this.constant;
    return this;
  }

  distanceToPoint(point: Vector3Like): number {
    const unit = unitEquation(this.normal, this.constant);
    if (!unit) return this.constant === 0 ? 0 : Math.sign(this.constant) * Infinity;
    const { x, y, z } = unit.normal;
    return x * point.x + y * point.y + z * point.z + unit.constant;
  }

  distanceToSphere(sphere: { readonly center: Vector3Like; readonly radius: number }): number {
    return sphere.radius < 0 ? Infinity : this.distanceToPoint(sphere.center) - sphere.radius;
  }

  projectPoint(point: Vector3Like, target: Vector3): Vector3 {
    const { x: px, y: py, z: pz } = point;
    const unit = unitEquation(this.normal, this.constant);
    if (!unit) {
      return this.constant === 0 ? target.set(px, py, pz) : target.set(NaN, NaN, NaN);
    }
    const { x: nx, y: ny, z: nz } = unit.normal;
    const distance = nx * px + ny * py + nz * pz + unit.constant;
    return target.set(px - distance * nx, py - distance * ny, pz - distance * nz);
  }

  intersectLine(line: Line3Like, target: Vector3, clampToLine = true): Vector3 | null {
    const sx = line.start.x, sy = line.start.y, sz = line.start.z;
    const dx = line.end.x - sx, dy = line.end.y - sy, dz = line.end.z - sz;
    const unit = unitEquation(this.normal, this.constant);
    if (!unit) return this.constant === 0 ? target.set(sx, sy, sz) : null;
    const { x: nx, y: ny, z: nz } = unit.normal;
    const startDistance = nx * sx + ny * sy + nz * sz + unit.constant;
    const denominator = nx * dx + ny * dy + nz * dz;
    if (denominator === 0) return startDistance === 0 ? target.set(sx, sy, sz) : null;
    const t = -startDistance / denominator;
    if (clampToLine && (t < 0 || t > 1)) return null;
    return target.set(sx + t * dx, sy + t * dy, sz + t * dz);
  }

  intersectsLine(line: Line3Like): boolean {
    const start = this.distanceToPoint(line.start);
    const end = this.distanceToPoint(line.end);
    return start === 0 || end === 0 || (start < 0 && end > 0) || (start > 0 && end < 0);
  }

  intersectsBox(box: { intersectsPlane(plane: Plane): boolean }): boolean {
    return box.intersectsPlane(this);
  }

  intersectsSphere(sphere: { intersectsPlane(plane: Plane): boolean }): boolean {
    return sphere.intersectsPlane(this);
  }

  coplanarPoint(target: Vector3): Vector3 {
    const unit = unitEquation(this.normal, this.constant);
    if (!unit) return this.constant === 0 ? target.set(0, 0, 0) : target.set(NaN, NaN, NaN);
    return target.set(-unit.normal.x * unit.constant, -unit.normal.y * unit.constant, -unit.normal.z * unit.constant);
  }

  applyMatrix4(matrix: { readonly elements: ArrayLike<number> }, optionalNormalMatrix?: Matrix3): this {
    const e = matrix.elements;
    const { x, y, z } = this.normal;
    const constant = this.constant;

    // A supplied normal matrix maps normals under an affine transform. Use a
    // transformed point to recover the plane offset, including translation.
    if (optionalNormalMatrix && e[3] === 0 && e[7] === 0 && e[11] === 0 && e[15] === 1) {
      const det = e[0] * (e[5] * e[10] - e[9] * e[6])
        - e[4] * (e[1] * e[10] - e[9] * e[2])
        + e[8] * (e[1] * e[6] - e[5] * e[2]);
      if (det === 0) throw new RangeError("Cannot transform a plane by a singular matrix");
      const unit = unitEquation({ x, y, z }, constant);
      if (!unit) return this;
      const px = -unit.normal.x * unit.constant;
      const py = -unit.normal.y * unit.constant;
      const pz = -unit.normal.z * unit.constant;
      const tx = e[0] * px + e[4] * py + e[8] * pz + e[12];
      const ty = e[1] * px + e[5] * py + e[9] * pz + e[13];
      const tz = e[2] * px + e[6] * py + e[10] * pz + e[14];
      const n = optionalNormalMatrix.elements;
      const nx = n[0] * x + n[3] * y + n[6] * z;
      const ny = n[1] * x + n[4] * y + n[7] * z;
      const nz = n[2] * x + n[5] * y + n[8] * z;
      const transformed = unitEquation({ x: nx, y: ny, z: nz }, 0);
      if (!transformed) throw new RangeError("The normal matrix maps the plane normal to zero");
      const { x: ux, y: uy, z: uz } = transformed.normal;
      this.normal.set(ux, uy, uz);
      this.constant = -(ux * tx + uy * ty + uz * tz);
      return this;
    }

    // Solve Mᵀ p' = p directly. Unlike an affine-only normal transform this
    // also handles invertible projective matrices and avoids shared scratch state.
    const coefficients = [x, y, z, constant];
    const rows = Array.from({ length: 4 }, (_, row) => [
      e[4 * row], e[4 * row + 1], e[4 * row + 2], e[4 * row + 3], coefficients[row]
    ]);
    for (let column = 0; column < 4; column++) {
      let pivot = column;
      for (let row = column + 1; row < 4; row++) {
        if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
      }
      if (rows[pivot][column] === 0) throw new RangeError("Cannot transform a plane by a singular matrix");
      [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
      const divisor = rows[column][column];
      for (let k = column; k < 5; k++) rows[column][k] /= divisor;
      for (let row = 0; row < 4; row++) {
        if (row === column) continue;
        const factor = rows[row][column];
        for (let k = column; k < 5; k++) rows[row][k] -= factor * rows[column][k];
      }
    }
    const nx = rows[0][4], ny = rows[1][4], nz = rows[2][4], nc = rows[3][4];
    const unit = unitEquation({ x: nx, y: ny, z: nz }, nc);
    return unit ? this.set(unit.normal, unit.constant) : this.setComponents(0, 0, 0, nc);
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
