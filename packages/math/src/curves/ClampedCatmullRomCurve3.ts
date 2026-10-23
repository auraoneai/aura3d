import { Vector3 } from "../Vector3.js";
import { CurveBase } from "./CurveBase.js";
import { catmullRomSegment } from "./CatmullRomCurve3.js";

/**
 * Catmull-Rom spline with an arbitrary knot exponent `alpha`
 * (0 uniform, 0.5 centripetal, 1 chordal) and *clamped* end conditions for
 * open splines: the first/last control point stands in for the missing
 * neighbour, so the curve spans exactly `points.length - 1` segments and
 * passes through every point at `t = i / segments`. Closed splines wrap.
 *
 * Aura3D extension (three's `CatmullRomCurve3` extrapolates open ends and
 * only offers three alphas). Segment maths is {@link catmullRomSegment};
 * arc-length tables and `getUtoTmapping` come from {@link CurveBase}.
 */
export class ClampedCatmullRomCurve3 extends CurveBase<Vector3> {
  readonly isClampedCatmullRomCurve3 = true as const;

  constructor(
    readonly points: readonly Vector3[] = [],
    readonly closed = false,
    readonly alpha = 0.5
  ) {
    super();
  }

  /** Number of Catmull-Rom segments (`n` closed, `n - 1` open). */
  get segments(): number {
    return this.closed ? this.points.length : this.points.length - 1;
  }

  private pointIndex(i: number): Vector3 {
    const n = this.points.length;
    if (this.closed) return this.points[((i % n) + n) % n]!;
    return this.points[Math.max(0, Math.min(n - 1, i))]!;
  }

  getPoint(t: number): Vector3 {
    const nSeg = this.segments;
    if (nSeg < 1) return (this.points[0] ?? new Vector3(0, 0, 0)).clone();
    const scaled = Math.max(0, Math.min(1, t)) * nSeg;
    const seg = Math.min(nSeg - 1, Math.floor(scaled));
    return catmullRomSegment(
      this.pointIndex(seg - 1),
      this.pointIndex(seg),
      this.pointIndex(seg + 1),
      this.pointIndex(seg + 2),
      scaled - seg,
      this.alpha
    );
  }

  clone(): this {
    return new ClampedCatmullRomCurve3([...this.points], this.closed, this.alpha) as this;
  }
}
