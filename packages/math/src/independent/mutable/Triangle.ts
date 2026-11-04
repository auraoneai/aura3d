import { Vector3, type BufferAttributeLike3, type Vector3Like } from "./Vector3.js";
import type { BufferAttributeLikeW, Vector4 } from "./Vector4.js";
import type { Plane } from "./Plane.js";

export interface TriangleCornersLike {
  readonly a: Vector3Like;
  readonly b: Vector3Like;
  readonly c: Vector3Like;
}

interface InterpolationTarget {
  x: number;
  y: number;
  setScalar(scalar: number): unknown;
  addScaledVector(v: never, s: number): unknown;
}

/** A triangle with an ordered winding and mutable vertex vectors. */
export class Triangle {
  constructor(
    public a: Vector3 = new Vector3(),
    public b: Vector3 = new Vector3(),
    public c: Vector3 = new Vector3(),
  ) {}

  fromImmutable(triangle: TriangleCornersLike): this { return this.copy(triangle); }

  static getNormal(a: Vector3Like, b: Vector3Like, c: Vector3Like, target: Vector3): Vector3 {
    let ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    let vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const scale = Math.max(Math.abs(ux), Math.abs(uy), Math.abs(uz), Math.abs(vx), Math.abs(vy), Math.abs(vz));
    if (scale === 0 || !Number.isFinite(scale)) return target.set(0, 0, 0);
    ux /= scale; uy /= scale; uz /= scale; vx /= scale; vy /= scale; vz /= scale;
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    const length = Math.hypot(x, y, z);
    return length === 0 ? target.set(0, 0, 0) : target.set(x / length, y / length, z / length);
  }

  /**
   * Barycentric coordinates of the orthogonal projection of `point` onto the triangle plane. A
   * degenerate triangle (zero area) has none: the target is zeroed and null is returned. Non-finite
   * input propagates as NaN weights.
   */
  static getBarycoord(point: Vector3Like, a: Vector3Like, b: Vector3Like, c: Vector3Like, target: Vector3): Vector3 | null {
    const edgesAndPoint = (scale: number) => ({
      ux: (b.x - a.x) / scale, uy: (b.y - a.y) / scale, uz: (b.z - a.z) / scale,
      vx: (c.x - a.x) / scale, vy: (c.y - a.y) / scale, vz: (c.z - a.z) / scale,
      wx: (point.x - a.x) / scale, wy: (point.y - a.y) / scale, wz: (point.z - a.z) / scale
    });
    const solve = (scale: number): { weights: [number, number, number] | null; denominator: number } => {
      const { ux, uy, uz, vx, vy, vz, wx, wy, wz } = edgesAndPoint(scale);
      const d00 = ux * ux + uy * uy + uz * uz, d01 = ux * vx + uy * vy + uz * vz, d11 = vx * vx + vy * vy + vz * vz;
      const d20 = wx * ux + wy * uy + wz * uz, d21 = wx * vx + wy * vy + wz * vz;
      let denominator = d00 * d11 - d01 * d01;
      if (Math.abs(denominator) <= 1e-9 * d00 * d11) {
        // Catastrophic cancellation (a very thin triangle): use the Lagrange form |u x v|^2 of the same
        // quantity, which has no subtraction of nearly equal products.
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        denominator = nx * nx + ny * ny + nz * nz;
        if (denominator === 0) return { weights: null, denominator };
        const beta = (((wy * vz - wz * vy) * nx) + ((wz * vx - wx * vz) * ny) + ((wx * vy - wy * vx) * nz)) / denominator;
        const gamma = (((uy * wz - uz * wy) * nx) + ((uz * wx - ux * wz) * ny) + ((ux * wy - uy * wx) * nz)) / denominator;
        return { weights: [1 - beta - gamma, beta, gamma], denominator };
      }
      if (denominator === 0) return { weights: null, denominator };
      const v = (d11 * d20 - d01 * d21) / denominator;
      const w = (d00 * d21 - d01 * d20) / denominator;
      return { weights: [1 - v - w, v, w], denominator };
    };
    let result = solve(1);
    if (result.denominator === 0 || !Number.isFinite(result.denominator) && !Number.isNaN(result.denominator)) {
      // The squared edge lengths underflowed or overflowed; barycentric coordinates are invariant under
      // a uniform rescaling of the whole configuration.
      const scale = Math.max(
        Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.z - a.z),
        Math.abs(c.x - a.x), Math.abs(c.y - a.y), Math.abs(c.z - a.z)
      );
      if (scale !== 0 && Number.isFinite(scale)) result = solve(scale);
    }
    if (result.weights === null) {
      target.set(0, 0, 0);
      return null;
    }
    return target.set(result.weights[0], result.weights[1], result.weights[2]);
  }

  static containsPoint(point: Vector3Like, a: Vector3Like, b: Vector3Like, c: Vector3Like): boolean {
    const weights = Triangle.getBarycoord(point, a, b, c, new Vector3());
    return weights !== null && weights.x >= 0 && weights.y >= 0 && weights.z >= 0;
  }

  static getInterpolation<T extends InterpolationTarget>(point: Vector3Like, p1: Vector3Like, p2: Vector3Like, p3: Vector3Like, v1: unknown, v2: unknown, v3: unknown, target: T): T | null {
    const weights = Triangle.getBarycoord(point, p1, p2, p3, new Vector3());
    if (weights === null) {
      // No barycentric coordinates: the target is cleared (every component it has) and null returned.
      const out = target as unknown as { x: number; y: number; z?: number; w?: number };
      out.x = 0; out.y = 0;
      if ("z" in out) out.z = 0;
      if ("w" in out) out.w = 0;
      return null;
    }
    // Preserve a source when callers interpolate in place into that source.
    const values = [v1, v2, v3];
    const factors = [weights.x, weights.y, weights.z];
    let selfWeight = 0;
    for (let i = 0; i < 3; i++) if (values[i] === target) selfWeight += factors[i]!;
    if (values.includes(target)) target.addScaledVector(target as never, selfWeight - 1);
    else target.setScalar(0);
    for (let i = 0; i < 3; i++) if (values[i] !== target) target.addScaledVector(values[i] as never, factors[i]!);
    return target;
  }

  static getInterpolatedAttribute(attr: BufferAttributeLikeW & BufferAttributeLike3, i1: number, i2: number, i3: number, barycoord: Vector3Like, target: Vector3 | Vector4): Vector3 | Vector4 {
    const x = attr.getX(i1) * barycoord.x + attr.getX(i2) * barycoord.y + attr.getX(i3) * barycoord.z;
    const y = attr.getY(i1) * barycoord.x + attr.getY(i2) * barycoord.y + attr.getY(i3) * barycoord.z;
    const z = attr.getZ(i1) * barycoord.x + attr.getZ(i2) * barycoord.y + attr.getZ(i3) * barycoord.z;
    if ("isVector4" in target && target.isVector4) {
      const w = attr.getW(i1) * barycoord.x + attr.getW(i2) * barycoord.y + attr.getW(i3) * barycoord.z;
      return target.set(x, y, z, w);
    }
    return (target as Vector3).set(x, y, z);
  }

  static isFrontFacing(a: Vector3Like, b: Vector3Like, c: Vector3Like, direction: Vector3Like): boolean {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    return (uy * vz - uz * vy) * direction.x + (uz * vx - ux * vz) * direction.y + (ux * vy - uy * vx) * direction.z < 0;
  }

  set(a: Vector3Like, b: Vector3Like, c: Vector3Like): this {
    const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z, cx = c.x, cy = c.y, cz = c.z;
    this.a.set(ax, ay, az); this.b.set(bx, by, bz); this.c.set(cx, cy, cz);
    return this;
  }

  setFromPointsAndIndices(points: readonly Vector3Like[], i0: number, i1: number, i2: number): this {
    const a = points[i0], b = points[i1], c = points[i2];
    if (!a || !b || !c) throw new RangeError("Triangle point index is out of bounds");
    return this.set(a, b, c);
  }

  setFromAttributeAndIndices(attribute: BufferAttributeLike3, i0: number, i1: number, i2: number): this {
    return this.set(
      { x: attribute.getX(i0), y: attribute.getY(i0), z: attribute.getZ(i0) },
      { x: attribute.getX(i1), y: attribute.getY(i1), z: attribute.getZ(i1) },
      { x: attribute.getX(i2), y: attribute.getY(i2), z: attribute.getZ(i2) },
    );
  }

  clone(): this { return new (this.constructor as new () => this)().copy(this); }
  copy(triangle: TriangleCornersLike): this { return this.set(triangle.a, triangle.b, triangle.c); }

  getArea(): number {
    const ux = this.b.x - this.a.x, uy = this.b.y - this.a.y, uz = this.b.z - this.a.z;
    const vx = this.c.x - this.a.x, vy = this.c.y - this.a.y, vz = this.c.z - this.a.z;
    return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }

  getMidpoint(target: Vector3): Vector3 {
    return target.set((this.a.x + this.b.x + this.c.x) / 3, (this.a.y + this.b.y + this.c.y) / 3, (this.a.z + this.b.z + this.c.z) / 3);
  }

  getNormal(target: Vector3): Vector3 { return Triangle.getNormal(this.a, this.b, this.c, target); }
  getPlane(target: Plane): Plane { return target.setFromCoplanarPoints(this.a, this.b, this.c); }
  getBarycoord(point: Vector3Like, target: Vector3): Vector3 | null { return Triangle.getBarycoord(point, this.a, this.b, this.c, target); }
  getInterpolation<T extends InterpolationTarget>(point: Vector3Like, v1: unknown, v2: unknown, v3: unknown, target: T): T | null {
    return Triangle.getInterpolation(point, this.a, this.b, this.c, v1, v2, v3, target);
  }
  containsPoint(point: Vector3Like): boolean { return Triangle.containsPoint(point, this.a, this.b, this.c); }
  isFrontFacing(direction: Vector3Like): boolean { return Triangle.isFrontFacing(this.a, this.b, this.c, direction); }
  intersectsBox(box: { intersectsTriangle(triangle: Triangle): boolean }): boolean { return box.intersectsTriangle(this); }

  closestPointToPoint(p: Vector3Like, target: Vector3): Vector3 {
    const weights = this.getBarycoord(p, new Vector3());
    // Non-finite input has no closest point; every component is NaN.
    if (weights && Number.isNaN(weights.x + weights.y + weights.z)) return target.set(NaN, NaN, NaN);
    if (weights && weights.x >= 0 && weights.y >= 0 && weights.z >= 0) {
      return target.set(
        weights.x * this.a.x + weights.y * this.b.x + weights.z * this.c.x,
        weights.x * this.a.y + weights.y * this.b.y + weights.z * this.c.y,
        weights.x * this.a.z + weights.y * this.b.z + weights.z * this.c.z,
      );
    }
    let bestX = this.a.x, bestY = this.a.y, bestZ = this.a.z, bestDistance = Infinity;
    const considerEdge = (start: Vector3Like, end: Vector3Like): void => {
      const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
      const lengthSq = dx * dx + dy * dy + dz * dz;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - start.x) * dx + (p.y - start.y) * dy + (p.z - start.z) * dz) / lengthSq));
      const x = start.x + t * dx, y = start.y + t * dy, z = start.z + t * dz;
      const ex = p.x - x, ey = p.y - y, ez = p.z - z;
      const distance = ex * ex + ey * ey + ez * ez;
      if (distance < bestDistance) { bestDistance = distance; bestX = x; bestY = y; bestZ = z; }
    };
    considerEdge(this.a, this.b); considerEdge(this.b, this.c); considerEdge(this.c, this.a);
    return target.set(bestX, bestY, bestZ);
  }

  equals(triangle: TriangleCornersLike): boolean { return this.a.equals(triangle.a) && this.b.equals(triangle.b) && this.c.equals(triangle.c); }
}
