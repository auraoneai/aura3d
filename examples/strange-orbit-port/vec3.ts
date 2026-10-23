/**
 * Minimal mutable 3-vector with the same in-place semantics as three.js'
 * `Vector3` subset the original Strange Orbit simulation uses. Kept local so the
 * race module stays framework-free and every expression evaluates in the same
 * order as the source; `tests/unit/strange-orbit-port/vec3.test.ts` checks each
 * method against three 0.185.1.
 */
export class Vec3 {
  constructor(public x = 0, public y = 0, public z = 0) {}

  set(x: number, y: number, z: number): this { this.x = x; this.y = y; this.z = z; return this; }
  copy(v: Vec3): this { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone(): Vec3 { return new Vec3(this.x, this.y, this.z); }

  add(v: Vec3): this { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v: Vec3): this { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a: Vec3, b: Vec3): this { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  multiplyScalar(s: number): this { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaledVector(v: Vec3, s: number): this { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  negate(): this { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }

  dot(v: Vec3): number { return this.x * v.x + this.y * v.y + this.z * v.z; }
  lengthSq(): number { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length(): number { return Math.sqrt(this.lengthSq()); }
  distanceToSquared(v: Vec3): number {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }
  distanceTo(v: Vec3): number { return Math.sqrt(this.distanceToSquared(v)); }

  normalize(): this { return this.divideScalar(this.length() || 1); }
  divideScalar(s: number): this { return this.multiplyScalar(1 / s); }
  setLength(length: number): this { return this.normalize().multiplyScalar(length); }

  crossVectors(a: Vec3, b: Vec3): this {
    const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }

  lerp(v: Vec3, alpha: number): this {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    return this;
  }
  lerpVectors(a: Vec3, b: Vec3, alpha: number): this {
    this.x = a.x + (b.x - a.x) * alpha;
    this.y = a.y + (b.y - a.y) * alpha;
    this.z = a.z + (b.z - a.z) * alpha;
    return this;
  }

  /** Rotate about a unit `axis` by `angle` radians (three's quaternion-based path). */
  applyAxisAngle(axis: Vec3, angle: number): this {
    const half = angle / 2, s = Math.sin(half);
    const qx = axis.x * s, qy = axis.y * s, qz = axis.z * s, qw = Math.cos(half);
    const vx = this.x, vy = this.y, vz = this.z;
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    this.x = vx + qw * tx + qy * tz - qz * ty;
    this.y = vy + qw * ty + qz * tx - qx * tz;
    this.z = vz + qw * tz + qx * ty - qy * tx;
    return this;
  }
}

export type Vec3Like = Vec3;

/** three.js `Triangle.getNormal` (zero vector for a degenerate triangle). */
export function triangleNormal(a: Vec3, b: Vec3, c: Vec3, target = new Vec3()): Vec3 {
  target.subVectors(c, b);
  const v0 = new Vec3().subVectors(a, b);
  target.crossVectors(target, v0);
  const lengthSq = target.lengthSq();
  if (lengthSq > 0) return target.multiplyScalar(1 / Math.sqrt(lengthSq));
  return target.set(0, 0, 0);
}

/** three.js `Triangle.getBarycoord`; `null` for a degenerate triangle. */
export function triangleBarycoord(point: Vec3, a: Vec3, b: Vec3, c: Vec3, target = new Vec3()): Vec3 | null {
  const v0 = new Vec3().subVectors(c, a);
  const v1 = new Vec3().subVectors(b, a);
  const v2 = new Vec3().subVectors(point, a);
  const dot00 = v0.dot(v0), dot01 = v0.dot(v1), dot02 = v0.dot(v2), dot11 = v1.dot(v1), dot12 = v1.dot(v2);
  const denom = dot00 * dot11 - dot01 * dot01;
  if (denom === 0) {
    target.set(0, 0, 0);
    return null;
  }
  const invDenom = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  return target.set(1 - u - v, v, u);
}

export function triangleContainsPoint(point: Vec3, a: Vec3, b: Vec3, c: Vec3): boolean {
  const bary = triangleBarycoord(point, a, b, c, new Vec3());
  if (bary === null) return false;
  return bary.x >= 0 && bary.y >= 0 && bary.x + bary.y <= 1;
}

/** three.js `Triangle.closestPointToPoint` (Ericson, Real-Time Collision Detection). */
export function triangleClosestPoint(p: Vec3, a: Vec3, b: Vec3, c: Vec3, target = new Vec3()): Vec3 {
  const vab = new Vec3().subVectors(b, a);
  const vac = new Vec3().subVectors(c, a);
  const vap = new Vec3().subVectors(p, a);
  const d1 = vab.dot(vap), d2 = vac.dot(vap);
  if (d1 <= 0 && d2 <= 0) return target.copy(a);
  const vbp = new Vec3().subVectors(p, b);
  const d3 = vab.dot(vbp), d4 = vac.dot(vbp);
  if (d3 >= 0 && d4 <= d3) return target.copy(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return target.copy(a).addScaledVector(vab, v);
  }
  const vcp = new Vec3().subVectors(p, c);
  const d5 = vab.dot(vcp), d6 = vac.dot(vcp);
  if (d6 >= 0 && d5 <= d6) return target.copy(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return target.copy(a).addScaledVector(vac, w);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const vbc = new Vec3().subVectors(c, b);
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return target.copy(b).addScaledVector(vbc, w);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return target.copy(a).addScaledVector(vab, v).addScaledVector(vac, w);
}
