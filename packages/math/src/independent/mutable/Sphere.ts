import { Sphere as ImmutableSphere } from "../../Sphere.js";
import { Vector3 as ImmutableVector3 } from "../../Vector3.js";
import type { Box3 } from "./Box3.js";
import { Vector3, type Vector3Like } from "./Vector3.js";

export interface SphereLike {
  readonly center: Vector3Like;
  readonly radius: number;
}

interface PlaneLike {
  distanceToPoint(point: Vector3): number;
}

/** A mutable, closed ball. A negative radius represents the empty set. */
export class Sphere {
  readonly isSphere: boolean = true;
  center: Vector3;
  radius: number;

  constructor(center: Vector3 = new Vector3(), radius = -1) {
    this.center = center;
    this.radius = radius;
  }

  fromImmutable(sphere: SphereLike): this {
    return this.copy(sphere);
  }

  toImmutable(): ImmutableSphere {
    const { x, y, z } = this.center;
    return new ImmutableSphere(new ImmutableVector3(x, y, z), this.radius);
  }

  set(center: Vector3Like, radius: number): this {
    const { x, y, z } = center;
    this.center.set(x, y, z);
    this.radius = radius;
    return this;
  }

  setFromPoints(points: readonly Vector3[], optionalCenter?: Vector3Like): this {
    if (points.length === 0) return this.makeEmpty();

    let x: number;
    let y: number;
    let z: number;
    if (optionalCenter !== undefined) {
      ({ x, y, z } = optionalCenter);
    } else {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const p of points) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z);
      }
      x = minX / 2 + maxX / 2;
      y = minY / 2 + maxY / 2;
      z = minZ / 2 + maxZ / 2;
    }
    let radius = 0;
    for (const p of points) radius = Math.max(radius, Math.hypot(p.x - x, p.y - y, p.z - z));
    return this.set({ x, y, z }, radius);
  }

  copy(sphere: SphereLike): this {
    return this.set(sphere.center, sphere.radius);
  }

  isEmpty(): boolean {
    return this.radius < 0;
  }

  makeEmpty(): this {
    this.center.set(0, 0, 0);
    this.radius = -1;
    return this;
  }

  containsPoint(point: Vector3): boolean {
    if (this.isEmpty()) return false;
    const { x, y, z } = this.center;
    return Math.hypot(point.x - x, point.y - y, point.z - z) <= this.radius;
  }

  distanceToPoint(point: Vector3): number {
    if (this.isEmpty()) return Infinity;
    const { x, y, z } = this.center;
    return Math.hypot(point.x - x, point.y - y, point.z - z) - this.radius;
  }

  intersectsSphere(sphere: SphereLike): boolean {
    if (this.isEmpty() || sphere.radius < 0) return false;
    return Math.hypot(
      sphere.center.x - this.center.x,
      sphere.center.y - this.center.y,
      sphere.center.z - this.center.z
    ) <= this.radius + sphere.radius;
  }

  intersectsBox(box: Box3): boolean {
    return !this.isEmpty() && box.intersectsSphere(this);
  }

  intersectsPlane(plane: PlaneLike): boolean {
    if (this.isEmpty()) return false;
    const distance = plane.distanceToPoint(this.center);
    return Number.isFinite(distance) && Math.abs(distance) <= this.radius;
  }

  clampPoint(point: Vector3, target: Vector3): Vector3 {
    const px = point.x, py = point.y, pz = point.z;
    const cx = this.center.x, cy = this.center.y, cz = this.center.z;
    if (this.isEmpty()) return target.set(px, py, pz);
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const distance = Math.hypot(dx, dy, dz);
    if (distance <= this.radius) return target.set(px, py, pz);
    const scale = this.radius / distance;
    return target.set(cx + dx * scale, cy + dy * scale, cz + dz * scale);
  }

  getBoundingBox(target: Box3): Box3 {
    if (this.isEmpty()) return target.makeEmpty();
    const { x, y, z } = this.center;
    const r = this.radius;
    return target.set(
      { x: x - r, y: y - r, z: z - r },
      { x: x + r, y: y + r, z: z + r }
    );
  }

  applyMatrix4(matrix: { readonly elements: ArrayLike<number>; getMaxScaleOnAxis(): number }): this {
    if (this.isEmpty()) return this;
    const { x, y, z } = this.center;
    const e = matrix.elements;
    // A general projective map can send a finite ball through infinity. Its
    // image need not be a ball at all, so reject it rather than underestimate.
    if (e[3] !== 0 || e[7] !== 0 || e[11] !== 0 || !Number.isFinite(e[15]) || e[15] === 0) {
      throw new RangeError("Cannot bound a projectively transformed sphere");
    }
    const nx = multiplyRatio(x, e[0], e[15]) + multiplyRatio(y, e[4], e[15])
      + multiplyRatio(z, e[8], e[15]) + e[12] / e[15];
    const ny = multiplyRatio(x, e[1], e[15]) + multiplyRatio(y, e[5], e[15])
      + multiplyRatio(z, e[9], e[15]) + e[13] / e[15];
    const nz = multiplyRatio(x, e[2], e[15]) + multiplyRatio(y, e[6], e[15])
      + multiplyRatio(z, e[10], e[15]) + e[14] / e[15];
    const [matrixScale, factor] = largestLinearScale(e);
    const radius = multiplyRatio(this.radius, matrixScale, Math.abs(e[15])) * factor;
    this.center.set(nx, ny, nz);
    this.radius = radius;
    return this;
  }

  translate(offset: Vector3Like): this {
    const x = this.center.x + offset.x;
    const y = this.center.y + offset.y;
    const z = this.center.z + offset.z;
    this.center.set(x, y, z);
    return this;
  }

  expandByPoint(point: Vector3Like): this {
    const px = point.x, py = point.y, pz = point.z;
    if (this.isEmpty()) return this.set({ x: px, y: py, z: pz }, 0);
    const cx = this.center.x, cy = this.center.y, cz = this.center.z;
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > this.radius) {
      const growth = (distance - this.radius) / 2;
      const scale = growth / distance;
      this.center.set(cx + dx * scale, cy + dy * scale, cz + dz * scale);
      this.radius += growth;
    }
    return this;
  }

  union(sphere: Sphere): this {
    const otherRadius = sphere.radius;
    if (otherRadius < 0) return this;
    const ox = sphere.center.x, oy = sphere.center.y, oz = sphere.center.z;
    if (this.isEmpty()) return this.set({ x: ox, y: oy, z: oz }, otherRadius);
    const cx = this.center.x, cy = this.center.y, cz = this.center.z;
    const dx = ox - cx, dy = oy - cy, dz = oz - cz;
    const distance = Math.hypot(dx, dy, dz);
    if (this.radius >= distance + otherRadius) return this;
    if (otherRadius >= distance + this.radius) return this.set({ x: ox, y: oy, z: oz }, otherRadius);
    const radius = (distance + this.radius + otherRadius) / 2;
    const scale = (radius - this.radius) / distance;
    this.center.set(cx + dx * scale, cy + dy * scale, cz + dz * scale);
    this.radius = radius;
    return this;
  }

  equals(sphere: SphereLike): boolean {
    return this.center.x === sphere.center.x && this.center.y === sphere.center.y &&
      this.center.z === sphere.center.z && this.radius === sphere.radius;
  }

  clone(): this {
    const Constructor = this.constructor as new (center?: Vector3, radius?: number) => this;
    return new Constructor(new Vector3(this.center.x, this.center.y, this.center.z), this.radius);
  }

  toJSON(): { radius: number; center: number[] } {
    return { radius: this.radius, center: [this.center.x, this.center.y, this.center.z] };
  }

  fromJSON(json: { radius: number; center: ArrayLike<number> }): this {
    return this.set({ x: json.center[0], y: json.center[1], z: json.center[2] }, json.radius);
  }
}

/** Largest singular value of the upper-left 3x3, factored to avoid overflow. */
function largestLinearScale(e: ArrayLike<number>): [number, number] {
  const values = [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]];
  const scale = Math.max(...values.map(Math.abs));
  if (scale === 0 || !Number.isFinite(scale)) return [scale, 1];
  const a = values.map(value => value / scale);
  // AᵀA is symmetric and positive semidefinite. Jacobi rotations expose its
  // largest eigenvalue without squaring the original, potentially large scale.
  const s = [
    [a[0] * a[0] + a[1] * a[1] + a[2] * a[2], a[0] * a[3] + a[1] * a[4] + a[2] * a[5], a[0] * a[6] + a[1] * a[7] + a[2] * a[8]],
    [0, a[3] * a[3] + a[4] * a[4] + a[5] * a[5], a[3] * a[6] + a[4] * a[7] + a[5] * a[8]],
    [0, 0, a[6] * a[6] + a[7] * a[7] + a[8] * a[8]]
  ];
  s[1][0] = s[0][1]; s[2][0] = s[0][2]; s[2][1] = s[1][2];
  let rotated = s[0][1] !== 0 || s[0][2] !== 0 || s[1][2] !== 0;
  for (let sweep = 0; sweep < 16; sweep++) {
    let p = 0, q = 1;
    if (Math.abs(s[0][2]) > Math.abs(s[p][q])) { p = 0; q = 2; }
    if (Math.abs(s[1][2]) > Math.abs(s[p][q])) { p = 1; q = 2; }
    const off = s[p][q];
    if (Math.abs(off) <= Number.EPSILON * Math.max(s[0][0], s[1][1], s[2][2])) break;
    rotated = true;
    const tau = (s[q][q] - s[p][p]) / (2 * off);
    const tangent = tau === 0 ? 1 : Math.sign(tau) / (Math.abs(tau) + Math.hypot(1, tau));
    const cosine = 1 / Math.hypot(1, tangent), sine = tangent * cosine;
    const pp = s[p][p], qq = s[q][q];
    s[p][p] = pp - tangent * off;
    s[q][q] = qq + tangent * off;
    s[p][q] = s[q][p] = 0;
    for (let k = 0; k < 3; k++) {
      if (k === p || k === q) continue;
      const kp = s[k][p], kq = s[k][q];
      s[k][p] = s[p][k] = cosine * kp - sine * kq;
      s[k][q] = s[q][k] = sine * kp + cosine * kq;
    }
  }
  // Gershgorin's bound also includes any small off-diagonal residuals.
  const maximum = Math.max(
    s[0][0] + Math.abs(s[0][1]) + Math.abs(s[0][2]),
    s[1][1] + Math.abs(s[1][0]) + Math.abs(s[1][2]),
    s[2][2] + Math.abs(s[2][0]) + Math.abs(s[2][1])
  );
  // Rounding during diagonalization must not yield an undersized enclosure.
  return [scale, Math.sqrt(Math.max(0, maximum)) * (rotated ? 1 + 8 * Number.EPSILON : 1)];
}

function multiplyRatio(value: number, numerator: number, denominator: number): number {
  if (value === 0 || numerator === 0) return 0;
  const ratio = numerator / denominator;
  if (ratio !== 0 && Number.isFinite(ratio)) return value * ratio;
  const product = value * numerator;
  if (product !== 0 && Number.isFinite(product)) return product / denominator;
  return (value / denominator) * numerator;
}
