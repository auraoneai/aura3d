import { Vector3 } from "./Vector3.js";
import { Plane } from "./Plane.js";
import type { Box3 } from "./Box3.js";
import {
  closestPointOnDegenerateTriangle,
  closestPointOnFiniteTriangle,
  robustTriangleArea,
  robustTriangleFrontFacing
} from "./independent/TriangleDegenerate.js";
import { robustTriangleBarycoord, robustTriangleNormal } from "./independent/TriangleRobust.js";

// Scale all differences before taking dot products. The conservative margins
// keep poorly conditioned or near-boundary cases on the exact-dyadic path.
const TRIANGLE_MIN_NORMAL = 2 ** -1022;
const TRIANGLE_REGION_MARGIN = 2 ** -38;
const TRIANGLE_WEIGHT_MARGIN = 2 ** -12;
const TRIANGLE_CONDITION_MARGIN = 2 ** -8;

function scaledTriangleClosestPoint(a: Vector3, b: Vector3, c: Vector3, point: Vector3): Vector3 | undefined {
  const ab = b.subtract(a), ac = c.subtract(a);
  const ap = point.subtract(a), bp = point.subtract(b), cp = point.subtract(c);
  const differences = [ab.x, ab.y, ab.z, ac.x, ac.y, ac.z, ap.x, ap.y, ap.z,
    bp.x, bp.y, bp.z, cp.x, cp.y, cp.z];
  if (!differences.every(Number.isFinite)) return undefined;
  const largestDifference = Math.max(...differences.map(Math.abs));
  if (largestDifference < TRIANGLE_MIN_NORMAL) return undefined;
  // A power-of-two divisor avoids introducing rounding into normal scaled
  // differences. 2^1023 is the largest such finite binary64 value.
  const scale = 2 ** Math.min(1023, Math.floor(Math.log2(largestDifference)) + 1);
  const scaled = differences.map((value) => value / scale);
  for (let i = 0; i < scaled.length; i += 1) {
    if (differences[i] !== 0 && Math.abs(scaled[i]!) < TRIANGLE_MIN_NORMAL) return undefined;
  }
  const u = new Vector3(scaled[0], scaled[1], scaled[2]);
  const v = new Vector3(scaled[3], scaled[4], scaled[5]);
  const p = new Vector3(scaled[6], scaled[7], scaled[8]);
  const q = new Vector3(scaled[9], scaled[10], scaled[11]);
  const r = new Vector3(scaled[12], scaled[13], scaled[14]);
  const d1 = u.dot(p), d2 = v.dot(p), d3 = u.dot(q), d4 = v.dot(q), d5 = u.dot(r), d6 = v.dot(r);
  const margin = TRIANGLE_REGION_MARGIN;
  if (d1 < -margin && d2 < -margin) return a;
  if (d3 > margin && d3 - d4 > margin) return b;
  if (d6 > margin && d6 - d5 > margin) return c;

  const vc = d1 * d4 - d3 * d2;
  const vb = d5 * d2 - d1 * d6;
  const va = d3 * d6 - d5 * d4;
  const weightMargin = TRIANGLE_WEIGHT_MARGIN;
  let bWeight: number, cWeight: number;
  if (vc < -margin && d1 > weightMargin && d3 < -weightMargin
      && d1 - d3 > TRIANGLE_CONDITION_MARGIN) {
    bWeight = d1 / (d1 - d3);
    cWeight = 0;
  } else if (vb < -margin && d2 > weightMargin && d6 < -weightMargin
      && d2 - d6 > TRIANGLE_CONDITION_MARGIN) {
    bWeight = 0;
    cWeight = d2 / (d2 - d6);
  } else if (va < -margin && d4 - d3 > weightMargin && d5 - d6 > weightMargin
      && d4 - d3 + d5 - d6 > TRIANGLE_CONDITION_MARGIN) {
    cWeight = (d4 - d3) / (d4 - d3 + d5 - d6);
    bWeight = 1 - cWeight;
  } else {
    const area = va + vb + vc;
    if (va <= weightMargin || vb <= weightMargin || vc <= weightMargin || area <= TRIANGLE_CONDITION_MARGIN) {
      return undefined;
    }
    bWeight = vb / area;
    cWeight = vc / area;
  }

  // A small result formed from large opposing terms can lose representable
  // coordinates even when the weights are accurate. Likewise, defer
  // subnormal products and overflow to exact rational reconstruction.
  function coordinate(origin: number, x: number, y: number): number | undefined {
    const first = x * bWeight, second = y * cWeight;
    if ((x !== 0 && bWeight !== 0 && Math.abs(first) < TRIANGLE_MIN_NORMAL)
        || (y !== 0 && cWeight !== 0 && Math.abs(second) < TRIANGLE_MIN_NORMAL)) return undefined;
    const result = origin + first + second;
    if (!Number.isFinite(result) || (result !== 0 && Math.abs(result) < TRIANGLE_MIN_NORMAL)) return undefined;
    const largest = Math.max(Math.abs(origin), Math.abs(first), Math.abs(second));
    if (largest !== 0 && Math.abs(result) / largest < TRIANGLE_CONDITION_MARGIN) return undefined;
    return result;
  }
  const x = coordinate(a.x, ab.x, ac.x), y = coordinate(a.y, ab.y, ac.y), z = coordinate(a.z, ab.z, ac.z);
  return x === undefined || y === undefined || z === undefined ? undefined : new Vector3(x, y, z);
}

/**
 * 3D triangle — three.js `Triangle` parity (immutable; `a`/`b`/`c` vertices).
 */
export class Triangle {
  constructor(
    readonly a: Vector3 = new Vector3(0, 0, 0),
    readonly b: Vector3 = new Vector3(0, 0, 0),
    readonly c: Vector3 = new Vector3(0, 0, 0)
  ) {}

  /** Unit normal of (a,b,c); zero vector for degenerate triangles. */
  static getNormal(a: Vector3, b: Vector3, c: Vector3): Vector3 {
    const robust = robustTriangleNormal(a, b, c);
    if (robust !== undefined) return robust;
    const cb = c.subtract(b);
    const ab = a.subtract(b);
    const n = cb.cross(ab);
    const lenSq = n.lengthSquared();
    return lenSq > 0 ? n.multiplyScalar(1 / Math.sqrt(lenSq)) : new Vector3(0, 0, 0);
  }

  /**
   * Barycentric coordinates of `point` in triangle (a,b,c) — `null` when the
   * triangle is degenerate (three.js `Triangle.getBarycoord` returns `null`).
   */
  static getBarycoord(point: Vector3, a: Vector3, b: Vector3, c: Vector3): Vector3 | null {
    const robust = robustTriangleBarycoord(point, a, b, c);
    if (robust !== undefined) return robust;
    const v0 = c.subtract(a);
    const v1 = b.subtract(a);
    const v2 = point.subtract(a);
    const dot00 = v0.dot(v0);
    const dot01 = v0.dot(v1);
    const dot02 = v0.dot(v2);
    const dot11 = v1.dot(v1);
    const dot12 = v1.dot(v2);
    const denom = dot00 * dot11 - dot01 * dot01;
    if (denom === 0) return null;
    const invDenom = 1 / denom;
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
    // barycentric coordinates must always sum to 1
    return new Vector3(1 - u - v, v, u);
  }

  static containsPoint(point: Vector3, a: Vector3, b: Vector3, c: Vector3): boolean {
    const bary = Triangle.getBarycoord(point, a, b, c);
    if (bary === null) return false;
    return bary.x >= 0 && bary.y >= 0 && bary.x + bary.y <= 1;
  }

  /**
   * Interpolates attribute vectors `v1,v2,v3` at `point` via barycentrics —
   * `null` for a degenerate triangle (three.js `Triangle.getInterpolation`).
   */
  static getInterpolation(
    point: Vector3, p1: Vector3, p2: Vector3, p3: Vector3,
    v1: Vector3, v2: Vector3, v3: Vector3
  ): Vector3 | null {
    const bary = Triangle.getBarycoord(point, p1, p2, p3);
    if (bary === null) return null;
    return v1.multiplyScalar(bary.x)
      .addScaled(v2, bary.y)
      .addScaled(v3, bary.z);
  }

  static isFrontFacing(a: Vector3, b: Vector3, c: Vector3, direction: Vector3): boolean {
    const robust = robustTriangleFrontFacing(a, b, c, direction);
    if (robust !== undefined) return robust;
    const cb = c.subtract(b);
    const ab = a.subtract(b);
    return cb.cross(ab).dot(direction) < 0;
  }

  set(a: Vector3, b: Vector3, c: Vector3): Triangle {
    return new Triangle(a, b, c);
  }

  setFromPointsAndIndices(points: readonly Vector3[], i0: number, i1: number, i2: number): Triangle {
    return new Triangle(points[i0]!, points[i1]!, points[i2]!);
  }

  clone(): Triangle {
    return new Triangle(this.a, this.b, this.c);
  }

  getArea(): number {
    const robust = robustTriangleArea(this.a, this.b, this.c);
    if (robust !== undefined) return robust;
    const cb = this.c.subtract(this.b);
    const ab = this.a.subtract(this.b);
    return cb.cross(ab).length() * 0.5;
  }

  getMidpoint(): Vector3 {
    return this.a.add(this.b).add(this.c).multiplyScalar(1 / 3);
  }

  getNormal(): Vector3 {
    return Triangle.getNormal(this.a, this.b, this.c);
  }

  getPlane(): Plane {
    return Plane.fromCoplanarPoints(this.a, this.b, this.c);
  }

  getBarycoord(point: Vector3): Vector3 | null {
    return Triangle.getBarycoord(point, this.a, this.b, this.c);
  }

  getInterpolation(point: Vector3, v1: Vector3, v2: Vector3, v3: Vector3): Vector3 | null {
    return Triangle.getInterpolation(point, this.a, this.b, this.c, v1, v2, v3);
  }

  containsPoint(point: Vector3): boolean {
    return Triangle.containsPoint(point, this.a, this.b, this.c);
  }

  isFrontFacing(direction: Vector3): boolean {
    return Triangle.isFrontFacing(this.a, this.b, this.c, direction);
  }

  intersectsBox(box: Box3): boolean {
    return box.intersectsTriangle(this);
  }

  /**
   * Closest point on the triangle to `p` — Ericson's voronoi-region method
   * (three.js `Triangle.closestPointToPoint`).
   */
  closestPointToPoint(p: Vector3): Vector3 {
    const degeneratePoint = closestPointOnDegenerateTriangle(this.a, this.b, this.c, p);
    if (degeneratePoint !== undefined) return degeneratePoint;
    const a = this.a;
    const b = this.b;
    const c = this.c;

    const scaledPoint = scaledTriangleClosestPoint(a, b, c, p);
    if (scaledPoint !== undefined) return scaledPoint;
    const exactPoint = closestPointOnFiniteTriangle(a, b, c, p);
    if (exactPoint !== undefined) return exactPoint;

    const vab = b.subtract(a);
    const vac = c.subtract(a);
    const vap = p.subtract(a);
    const d1 = vab.dot(vap);
    const d2 = vac.dot(vap);
    if (d1 <= 0 && d2 <= 0) {
      return a; // vertex region of A
    }

    const vbp = p.subtract(b);
    const d3 = vab.dot(vbp);
    const d4 = vac.dot(vbp);
    if (d3 >= 0 && d4 <= d3) {
      return b; // vertex region of B
    }

    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      return a.addScaled(vab, v); // edge region of AB
    }

    const vcp = p.subtract(c);
    const d5 = vab.dot(vcp);
    const d6 = vac.dot(vcp);
    if (d6 >= 0 && d5 <= d6) {
      return c; // vertex region of C
    }

    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      return a.addScaled(vac, w); // edge region of AC
    }

    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const vbc = c.subtract(b);
      const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
      return b.addScaled(vbc, w); // edge region of BC
    }

    // face region
    const denom = 1 / (va + vb + vc);
    const v = vb * denom;
    const w = vc * denom;
    return a.addScaled(vab, v).addScaled(vac, w);
  }

  equals(triangle: Triangle, epsilon = 0): boolean {
    return this.a.equals(triangle.a, epsilon) && this.b.equals(triangle.b, epsilon) && this.c.equals(triangle.c, epsilon);
  }
}
