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
    let x: number;
    let y: number;
    let z: number;
    if (optionalCenter !== undefined) {
      ({ x, y, z } = optionalCenter);
    } else if (points.length === 0) {
      x = 0; y = 0; z = 0;
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

  // The queries below compare squared distances with the squared radius and do not special-case an
  // empty (negative-radius) sphere, as in 4.x; test `isEmpty()` first when that matters.
  containsPoint(point: Vector3): boolean {
    const { x, y, z } = this.center;
    const dx = point.x - x, dy = point.y - y, dz = point.z - z;
    return dx * dx + dy * dy + dz * dz <= this.radius * this.radius;
  }

  distanceToPoint(point: Vector3): number {
    const { x, y, z } = this.center;
    return Math.hypot(point.x - x, point.y - y, point.z - z) - this.radius;
  }

  intersectsSphere(sphere: SphereLike): boolean {
    const reach = this.radius + sphere.radius;
    const dx = sphere.center.x - this.center.x, dy = sphere.center.y - this.center.y, dz = sphere.center.z - this.center.z;
    return dx * dx + dy * dy + dz * dz <= reach * reach;
  }

  intersectsBox(box: Box3): boolean {
    return box.intersectsSphere(this);
  }

  intersectsPlane(plane: PlaneLike): boolean {
    return Math.abs(plane.distanceToPoint(this.center)) <= this.radius;
  }

  clampPoint(point: Vector3, target: Vector3): Vector3 {
    // Read everything before writing: the target may be this sphere's center or the point itself.
    const px = point.x, py = point.y, pz = point.z;
    const cx = this.center.x, cy = this.center.y, cz = this.center.z;
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    if (dx * dx + dy * dy + dz * dz > this.radius * this.radius) {
      target.set(dx, dy, dz).normalize().multiplyScalar(this.radius);
      return target.set(target.x + cx, target.y + cy, target.z + cz);
    }
    return target.set(px, py, pz);
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

  /** The center is transformed as a point and the radius is scaled by the matrix's largest axis scale. */
  applyMatrix4(matrix: { readonly elements: ArrayLike<number>; getMaxScaleOnAxis(): number }): this {
    this.center.applyMatrix4(matrix);
    this.radius *= matrix.getMaxScaleOnAxis();
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
    if (sphere.isEmpty()) return this;
    if (this.isEmpty()) return this.copy(sphere);
    if (this.center.equals(sphere.center)) {
      this.radius = Math.max(this.radius, sphere.radius);
      return this;
    }
    const dx = sphere.center.x - this.center.x, dy = sphere.center.y - this.center.y, dz = sphere.center.z - this.center.z;
    const distance = Math.hypot(dx, dy, dz);
    // Grow only when the other sphere reaches outside this one; a NaN comparison leaves the receiver as is.
    if (!(distance + sphere.radius > this.radius)) return this;
    if (distance + this.radius <= sphere.radius) return this.copy(sphere);
    const radius = (distance + this.radius + sphere.radius) / 2;
    const scale = (radius - this.radius) / distance;
    this.center.set(this.center.x + dx * scale, this.center.y + dy * scale, this.center.z + dz * scale);
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

