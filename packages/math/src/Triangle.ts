import { Vector3 } from "./Vector3.js";
import { Plane } from "./Plane.js";
import type { Box3 } from "./Box3.js";

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
    const a = this.a;
    const b = this.b;
    const c = this.c;

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
