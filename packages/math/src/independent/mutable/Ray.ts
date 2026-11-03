import { Ray as ImmutableRay } from "../../Ray.js";
import { Vector3 as ImmutableVector3 } from "../../Vector3.js";
import { Vector3, type Vector3Like } from "./Vector3.js";
import type { Box3Like } from "./Box3.js";

export interface RayLike {
  readonly origin: Vector3Like;
  readonly direction: Vector3Like;
}

interface SphereLike {
  readonly center: Vector3Like;
  readonly radius: number;
}

interface PlaneLike {
  readonly normal: Vector3Like;
  readonly constant: number;
  distanceToPoint(point: Vector3): number;
}

function unitDirection(direction: Vector3Like): [number, number, number] {
  const scale = Math.max(Math.abs(direction.x), Math.abs(direction.y), Math.abs(direction.z));
  if (scale === 0) return [0, 0, 0];
  const x = direction.x / scale, y = direction.y / scale, z = direction.z / scale;
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

function distanceAlongUnitRay(origin: Vector3Like, direction: readonly [number, number, number], plane: PlaneLike): number | null {
  const n = plane.normal;
  const coefficientScale = Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z), Math.abs(plane.constant));
  if (coefficientScale === 0) return 0;
  if (!Number.isFinite(coefficientScale)) return null;
  const nx = n.x / coefficientScale, ny = n.y / coefficientScale, nz = n.z / coefficientScale;
  const constant = plane.constant / coefficientScale;
  const denominator = nx * direction[0] + ny * direction[1] + nz * direction[2];
  const directOffset = nx * origin.x + ny * origin.y + nz * origin.z + constant;
  if (Number.isFinite(directOffset)) {
    if (denominator === 0) return directOffset === 0 ? 0 : null;
    const distance = -directOffset / denominator;
    return distance >= 0 ? distance : null;
  }
  const originScale = Math.max(1, Math.abs(origin.x), Math.abs(origin.y), Math.abs(origin.z));
  // If offset accumulation overflowed, rescale the origin and constant before
  // adding; the corresponding distance is scaled back after division.
  const offset = nx * (origin.x / originScale) + ny * (origin.y / originScale) + nz * (origin.z / originScale) + constant / originScale;
  if (denominator === 0) return offset === 0 ? 0 : null;
  const distance = (-offset / denominator) * originScale;
  return distance >= 0 ? distance : null;
}

/** A half-line p(t) = origin + t * direction, for t >= 0. */
export class Ray {
  constructor(
    public origin: Vector3 = new Vector3(),
    public direction: Vector3 = new Vector3(0, 0, -1),
  ) {}

  fromImmutable(ray: RayLike): this { return this.copy(ray); }

  /** The immutable ray normalizes its direction and rejects a zero direction. */
  toImmutable(): ImmutableRay {
    return new ImmutableRay(
      new ImmutableVector3(this.origin.x, this.origin.y, this.origin.z),
      new ImmutableVector3(this.direction.x, this.direction.y, this.direction.z),
    );
  }

  set(origin: Vector3Like, direction: Vector3Like): this {
    // Snapshot the inputs so swapping the two vectors is safe.
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const dx = direction.x, dy = direction.y, dz = direction.z;
    this.origin.set(ox, oy, oz);
    this.direction.set(dx, dy, dz);
    return this;
  }

  copy(ray: RayLike): this { return this.set(ray.origin, ray.direction); }

  at(t: number, target: Vector3): Vector3 {
    return target.set(
      this.origin.x + this.direction.x * t,
      this.origin.y + this.direction.y * t,
      this.origin.z + this.direction.z * t,
    );
  }

  lookAt(v: Vector3Like): this {
    this.direction.set(v.x - this.origin.x, v.y - this.origin.y, v.z - this.origin.z).normalize();
    return this;
  }

  recast(t: number): this { this.at(t, this.origin); return this; }

  closestPointToPoint(point: Vector3Like, target: Vector3): Vector3 {
    const [dx, dy, dz] = unitDirection(this.direction);
    const ox = this.origin.x, oy = this.origin.y, oz = this.origin.z;
    const t = Math.max(0, (point.x - ox) * dx + (point.y - oy) * dy + (point.z - oz) * dz);
    return target.set(ox + t * dx, oy + t * dy, oz + t * dz);
  }

  distanceToPoint(point: Vector3): number { return Math.sqrt(this.distanceSqToPoint(point)); }

  distanceSqToPoint(point: Vector3): number {
    const [dx, dy, dz] = unitDirection(this.direction);
    const px = point.x - this.origin.x, py = point.y - this.origin.y, pz = point.z - this.origin.z;
    const t = Math.max(0, px * dx + py * dy + pz * dz);
    const x = px - t * dx, y = py - t * dy, z = pz - t * dz;
    return x * x + y * y + z * z;
  }

  distanceSqToSegment(v0: Vector3, v1: Vector3, optionalPointOnRay?: Vector3, optionalPointOnSegment?: Vector3): number {
    const ox = this.origin.x, oy = this.origin.y, oz = this.origin.z;
    const [dx, dy, dz] = unitDirection(this.direction);
    const ax = v0.x, ay = v0.y, az = v0.z;
    const originalEx = v1.x - ax, originalEy = v1.y - ay, originalEz = v1.z - az;
    const originalWx = ox - ax, originalWy = oy - ay, originalWz = oz - az;
    const scale = Math.max(Math.abs(originalEx), Math.abs(originalEy), Math.abs(originalEz), Math.abs(originalWx), Math.abs(originalWy), Math.abs(originalWz)) || 1;
    const ex = originalEx / scale, ey = originalEy / scale, ez = originalEz / scale;
    const wx = originalWx / scale, wy = originalWy / scale, wz = originalWz / scale;
    const a = dx * dx + dy * dy + dz * dz;
    const b = dx * ex + dy * ey + dz * ez;
    const c = ex * ex + ey * ey + ez * ez;
    const d = dx * wx + dy * wy + dz * wz;
    const e = ex * wx + ey * wy + ez * wz;
    let bestDistance = Infinity, bestRay = 0, bestSegment = 0;
    const consider = (s: number, t: number): void => {
      const x = wx + s * dx - t * ex, y = wy + s * dy - t * ey, z = wz + s * dz - t * ez;
      const distance = x * x + y * y + z * z;
      if (distance < bestDistance) { bestDistance = distance; bestRay = s; bestSegment = t; }
    };
    const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
    // The minimum of this convex quadratic lies in the interior or on one
    // of the three constrained edges of the ray/segment parameter domain.
    consider(0, c === 0 ? 0 : clamp01(e / c));
    consider(a === 0 ? 0 : Math.max(0, -d / a), 0);
    consider(a === 0 ? 0 : Math.max(0, (b - d) / a), 1);
    const qx = dy * ez - dz * ey, qy = dz * ex - dx * ez, qz = dx * ey - dy * ex;
    const determinant = qx * qx + qy * qy + qz * qz;
    if (determinant > 0) {
      const ewx = ey * wz - ez * wy, ewy = ez * wx - ex * wz, ewz = ex * wy - ey * wx;
      const dwx = dy * wz - dz * wy, dwy = dz * wx - dx * wz, dwz = dx * wy - dy * wx;
      const s = (ewx * qx + ewy * qy + ewz * qz) / determinant;
      const t = (dwx * qx + dwy * qy + dwz * qz) / determinant;
      if (s >= 0 && t >= 0 && t <= 1) consider(s, t);
    }
    const rayDistance = bestRay * scale;
    optionalPointOnRay?.set(ox + rayDistance * dx, oy + rayDistance * dy, oz + rayDistance * dz);
    optionalPointOnSegment?.set(ax + bestSegment * originalEx, ay + bestSegment * originalEy, az + bestSegment * originalEz);
    const distance = Math.sqrt(bestDistance) * scale;
    return distance * distance;
  }

  intersectSphere(sphere: SphereLike, target: Vector3): Vector3 | null {
    if (sphere.radius < 0) return null;
    const [dx, dy, dz] = unitDirection(this.direction);
    const ox = this.origin.x, oy = this.origin.y, oz = this.origin.z;
    const x = sphere.center.x - ox, y = sphere.center.y - oy, z = sphere.center.z - oz;
    if (dx === 0 && dy === 0 && dz === 0) return Math.hypot(x, y, z) <= sphere.radius ? target.set(ox, oy, oz) : null;
    const along = x * dx + y * dy + z * dz;
    const perpendicular = Math.hypot(y * dz - z * dy, z * dx - x * dz, x * dy - y * dx);
    if (perpendicular > sphere.radius) return null;
    const ratio = sphere.radius === 0 ? 0 : perpendicular / sphere.radius;
    const halfChord = sphere.radius * Math.sqrt(Math.max(0, 1 - ratio * ratio));
    const near = along - halfChord, far = along + halfChord;
    if (far < 0) return null;
    const t = near >= 0 ? near : far;
    return target.set(ox + t * dx, oy + t * dy, oz + t * dz);
  }

  intersectsSphere(sphere: SphereLike): boolean {
    if (sphere.radius < 0) return false;
    const [dx, dy, dz] = unitDirection(this.direction);
    const x = sphere.center.x - this.origin.x, y = sphere.center.y - this.origin.y, z = sphere.center.z - this.origin.z;
    const along = x * dx + y * dy + z * dz;
    const distance = along <= 0 ? Math.hypot(x, y, z) : Math.hypot(y * dz - z * dy, z * dx - x * dz, x * dy - y * dx);
    return distance <= sphere.radius;
  }

  distanceToPlane(plane: PlaneLike): number | null {
    const along = distanceAlongUnitRay(this.origin, unitDirection(this.direction), plane);
    if (along === null || along === 0) return along;
    const scale = Math.max(Math.abs(this.direction.x), Math.abs(this.direction.y), Math.abs(this.direction.z));
    const normalizedLength = Math.hypot(this.direction.x / scale, this.direction.y / scale, this.direction.z / scale);
    return along / scale / normalizedLength;
  }

  intersectPlane(plane: PlaneLike, target: Vector3): Vector3 | null {
    const direction = unitDirection(this.direction);
    const distance = distanceAlongUnitRay(this.origin, direction, plane);
    if (distance === null) return null;
    return target.set(this.origin.x + distance * direction[0], this.origin.y + distance * direction[1], this.origin.z + distance * direction[2]);
  }

  intersectsPlane(plane: PlaneLike): boolean { return this.distanceToPlane(plane) !== null; }

  intersectBox(box: Box3Like, target: Vector3): Vector3 | null {
    const origins = [this.origin.x, this.origin.y, this.origin.z];
    const directions = unitDirection(this.direction);
    const minima = [box.min.x, box.min.y, box.min.z];
    const maxima = [box.max.x, box.max.y, box.max.z];
    let entry = -Infinity, exit = Infinity;
    for (let i = 0; i < 3; i++) {
      const min = minima[i]!, max = maxima[i]!, origin = origins[i]!, direction = directions[i]!;
      if (min > max) return null;
      if (direction === 0) {
        if (origin < min || origin > max) return null;
        continue;
      }
      let near = (min - origin) / direction, far = (max - origin) / direction;
      if (near > far) [near, far] = [far, near];
      entry = Math.max(entry, near);
      exit = Math.min(exit, far);
      if (entry > exit) return null;
    }
    if (exit < 0) return null;
    const t = entry >= 0 ? entry : exit;
    const distance = t === Infinity ? 0 : t;
    return target.set(origins[0]! + distance * directions[0], origins[1]! + distance * directions[1], origins[2]! + distance * directions[2]);
  }

  intersectsBox(box: Box3Like): boolean { return this.intersectBox(box, new Vector3()) !== null; }

  intersectTriangle(a: Vector3, b: Vector3, c: Vector3, backfaceCulling: boolean, target: Vector3): Vector3 | null {
    const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z;
    const e2x = c.x - a.x, e2y = c.y - a.y, e2z = c.z - a.z;
    const [dx, dy, dz] = unitDirection(this.direction);
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const determinant = e1x * px + e1y * py + e1z * pz;
    if (backfaceCulling ? determinant <= 0 : determinant === 0) return null;
    const inv = 1 / determinant;
    const tx = this.origin.x - a.x, ty = this.origin.y - a.y, tz = this.origin.z - a.z;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) return null;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) return null;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return t < 0 ? null : target.set(this.origin.x + t * dx, this.origin.y + t * dy, this.origin.z + t * dz);
  }

  applyMatrix4(matrix4: { readonly elements: ArrayLike<number> }): this {
    this.origin.applyMatrix4(matrix4);
    this.direction.transformDirection(matrix4);
    return this;
  }

  equals(ray: RayLike): boolean { return this.origin.equals(ray.origin) && this.direction.equals(ray.direction); }

  clone(): this { return new (this.constructor as new () => this)().copy(this); }
}
