import { Vector3 } from "./Vector3.js";
import type { Matrix4 } from "./Matrix4.js";

function clampNum(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Finite 3D line segment — three.js `Line3` parity (immutable methods). */
export class Line3 {
  constructor(
    readonly start: Vector3 = new Vector3(0, 0, 0),
    readonly end: Vector3 = new Vector3(0, 0, 0)
  ) {}

  set(start: Vector3, end: Vector3): Line3 {
    return new Line3(start, end);
  }

  clone(): Line3 {
    return new Line3(this.start, this.end);
  }

  copy(line: Line3): Line3 {
    return new Line3(line.start, line.end);
  }

  getCenter(): Vector3 {
    return this.start.add(this.end).multiplyScalar(0.5);
  }

  /** `end - start` direction (unnormalized, three.js `delta`). */
  delta(): Vector3 {
    return this.end.subtract(this.start);
  }

  distanceSq(): number {
    return this.start.distanceToSquared(this.end);
  }

  distance(): number {
    return this.start.distanceTo(this.end);
  }

  /** Point at fraction `t` along the segment (unclamped). */
  at(t: number): Vector3 {
    return this.delta().multiplyScalar(t).add(this.start);
  }

  /**
   * Parameter `t` of the point on the *infinite* line closest to `point`
   * (three.js `closestPointToPointParameter`). Clamped to [0,1] when
   * `clampToLine` is true.
   */
  closestPointToPointParameter(point: Vector3, clampToLine = false): number {
    const startP = point.subtract(this.start);
    const startPEnd = this.end.subtract(this.start);
    const startPEnd2 = startPEnd.dot(startPEnd);
    const startPEnd_startP = startPEnd.dot(startP);
    let t = startPEnd_startP / startPEnd2;
    if (clampToLine) t = Math.max(0, Math.min(1, t));
    return t;
  }

  closestPointToPoint(point: Vector3, clampToLine = false): Vector3 {
    const t = this.closestPointToPointParameter(point, clampToLine);
    return this.delta().multiplyScalar(t).add(this.start);
  }

  /**
   * Squared distance between the segments `this` and `line` plus their
   * closest points — three.js `Line3.distanceSqToLine3` (Real-Time Collision
   * Detection, Christer Ericson §5.1.9).
   */
  distanceSqToLine3(line: Line3): { distanceSq: number; point1: Vector3; point2: Vector3 } {
    const EPSILON = 1e-8 * 1e-8; // squared — compared against squared lengths

    const p1 = this.start;
    const p2 = line.start;
    const q1 = this.end;
    const q2 = line.end;

    const d1 = q1.subtract(p1); // direction of S1
    const d2 = q2.subtract(p2); // direction of S2
    const r = p1.subtract(p2);

    const a = d1.dot(d1); // squared length of S1
    const e = d2.dot(d2); // squared length of S2
    const f = d2.dot(r);

    let s: number;
    let t: number;

    if (a <= EPSILON && e <= EPSILON) {
      // both segments degenerate into points
      const c1 = p1;
      const c2 = p2;
      return { distanceSq: c1.subtract(c2).dot(c1.subtract(c2)), point1: c1, point2: c2 };
    }
    if (a <= EPSILON) {
      // first segment degenerates into a point
      s = 0;
      t = clampNum(f / e, 0, 1);
    } else {
      const c = d1.dot(r);
      if (e <= EPSILON) {
        // second segment degenerates into a point
        t = 0;
        s = clampNum(-c / a, 0, 1);
      } else {
        // general nondegenerate case
        const b = d1.dot(d2);
        const denom = a * e - b * b; // always nonnegative
        s = denom !== 0 ? clampNum((b * f - c * e) / denom, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) {
          t = 0;
          s = clampNum(-c / a, 0, 1);
        } else if (t > 1) {
          t = 1;
          s = clampNum((b - c) / a, 0, 1);
        }
      }
    }

    const point1 = p1.addScaled(d1, s);
    const point2 = p2.addScaled(d2, t);
    return { distanceSq: point1.distanceToSquared(point2), point1, point2 };
  }

  applyMatrix4(matrix: Matrix4): Line3 {
    return new Line3(this.start.transformMatrix4(matrix), this.end.transformMatrix4(matrix));
  }

  equals(line: Line3, epsilon = 0): boolean {
    return this.start.equals(line.start, epsilon) && this.end.equals(line.end, epsilon);
  }
}
