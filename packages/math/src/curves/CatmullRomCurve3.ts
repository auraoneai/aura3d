import { Vector3 } from "../Vector3.js";
import { CurveBase } from "./CurveBase.js";
import type { CurveSample } from "../Curves.js";

export type CatmullRomCurveType = "centripetal" | "chordal" | "catmullrom";

/**
 * Cubic Hermite coefficients `p(s) = c0 + c1 s + c2 s^2 + c3 s^3` —
 * three.js `CatmullRomCurve3`'s internal `CubicPoly`.
 */
class CubicPoly {
  private c0 = 0;
  private c1 = 0;
  private c2 = 0;
  private c3 = 0;

  private init(x0: number, x1: number, t0: number, t1: number): void {
    this.c0 = x0;
    this.c1 = t0;
    this.c2 = -3 * x0 + 3 * x1 - 2 * t0 - t1;
    this.c3 = 2 * x0 - 2 * x1 + t0 + t1;
  }

  initCatmullRom(x0: number, x1: number, x2: number, x3: number, tension: number): void {
    this.init(x1, x2, tension * (x2 - x0), tension * (x3 - x1));
  }

  initNonuniformCatmullRom(
    x0: number, x1: number, x2: number, x3: number,
    dt0: number, dt1: number, dt2: number
  ): void {
    // compute tangents when parameterized in [t1, t2]
    let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
    let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;

    // rescale tangents for parametrization in [0, 1]
    t1 *= dt1;
    t2 *= dt1;

    this.init(x1, x2, t1, t2);
  }

  calc(t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return this.c0 + this.c1 * t + this.c2 * t2 + this.c3 * t3;
  }
}

const EPSILON = 1e-6;

/**
 * Evaluates one centripetal-style Catmull-Rom segment between `p1` and `p2`
 * (context `p0..p3`) at segment weight `weight`, using non-uniform knot
 * spacing `pow = distance^alpha` (`alpha = 0.5` is centripetal). Matches the
 * world/camera spline adapters' historical math.
 */
export function catmullRomSegment(
  p0: Vector3,
  p1: Vector3,
  p2: Vector3,
  p3: Vector3,
  weight: number,
  alpha = 0.5
): Vector3 {
  // Knot intervals = distance^alpha (engine adapters' `k()`), clamped like
  // their EPSILON guard; Hermite tangents per CubicPoly.initNonuniformCatmullRom.
  const k = (a: Vector3, b: Vector3): number => Math.pow(Math.max(a.distanceTo(b), EPSILON), alpha);
  const dt0 = k(p0, p1);
  const dt1 = k(p1, p2);
  const dt2 = k(p2, p3);

  const t1 = p1.subtract(p0).multiplyScalar(1 / dt0)
    .subtract(p2.subtract(p0).multiplyScalar(1 / (dt0 + dt1)))
    .add(p2.subtract(p1).multiplyScalar(1 / dt1))
    .multiplyScalar(dt1);

  const t2 = p2.subtract(p1).multiplyScalar(1 / dt1)
    .subtract(p3.subtract(p1).multiplyScalar(1 / (dt1 + dt2)))
    .add(p3.subtract(p2).multiplyScalar(1 / dt2))
    .multiplyScalar(dt1);

  const t2w = weight * weight;
  const t3w = t2w * weight;
  return p1.multiplyScalar(1)
    .add(t1.multiplyScalar(weight))
    .add(p1.multiplyScalar(-3).add(p2.multiplyScalar(3)).add(t1.multiplyScalar(-2)).subtract(t2).multiplyScalar(t2w))
    .add(p1.multiplyScalar(2).subtract(p2.multiplyScalar(2)).add(t1).add(t2).multiplyScalar(t3w));
}

/**
 * 3D Catmull-Rom spline — three.js `CatmullRomCurve3` parity: `centripetal`
 * (default, α=0.5 knots), `chordal` (α=1) and `catmullrom` (uniform +
 * `tension`) curve types, endpoint extrapolation and closed loops.
 */
export class CatmullRomCurve3 extends CurveBase<Vector3> {
  readonly isCatmullRomCurve3 = true as const;

  constructor(
    readonly points: readonly Vector3[] = [],
    readonly closed = false,
    readonly curveType: CatmullRomCurveType = "centripetal",
    readonly tension = 0.5
  ) {
    super();
  }

  getPoint(t: number): Vector3 {
    const points = this.points;
    const l = points.length;

    const p = (l - (this.closed ? 0 : 1)) * t;
    let intPoint = Math.floor(p);
    let weight = p - intPoint;

    if (this.closed) {
      intPoint += intPoint > 0 ? 0 : (Math.floor(Math.abs(intPoint) / l) + 1) * l;
    } else if (weight === 0 && intPoint === l - 1) {
      intPoint = l - 2;
      weight = 1;
    }

    let p0: Vector3;
    let p3: Vector3;

    if (this.closed || intPoint > 0) {
      p0 = points[((intPoint - 1) % l + l) % l]!;
    } else {
      // extrapolate first point
      p0 = points[0]!.subtract(points[1]!).add(points[0]!);
    }

    const p1 = points[intPoint % l]!;
    const p2 = points[(intPoint + 1) % l]!;

    if (this.closed || intPoint + 2 < l) {
      p3 = points[(intPoint + 2) % l]!;
    } else {
      // extrapolate last point
      p3 = points[l - 1]!.subtract(points[l - 2]!).add(points[l - 1]!);
    }

    const px = new CubicPoly();
    const py = new CubicPoly();
    const pz = new CubicPoly();

    if (this.curveType === "centripetal" || this.curveType === "chordal") {
      const pow = this.curveType === "chordal" ? 0.5 : 0.25;
      let dt0 = Math.pow(p0.distanceToSquared(p1), pow);
      let dt1 = Math.pow(p1.distanceToSquared(p2), pow);
      let dt2 = Math.pow(p2.distanceToSquared(p3), pow);

      // safety check for repeated points
      if (dt1 < 1e-4) dt1 = 1.0;
      if (dt0 < 1e-4) dt0 = dt1;
      if (dt2 < 1e-4) dt2 = dt1;

      px.initNonuniformCatmullRom(p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2);
      py.initNonuniformCatmullRom(p0.y, p1.y, p2.y, p3.y, dt0, dt1, dt2);
      pz.initNonuniformCatmullRom(p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2);
    } else {
      px.initCatmullRom(p0.x, p1.x, p2.x, p3.x, this.tension);
      py.initCatmullRom(p0.y, p1.y, p2.y, p3.y, this.tension);
      pz.initCatmullRom(p0.z, p1.z, p2.z, p3.z, this.tension);
    }

    return new Vector3(px.calc(weight), py.calc(weight), pz.calc(weight));
  }

  /**
   * Legacy convenience: `{point, tangent}` at `t` (kept for pre-parity
   * consumers; `tangent` equals {@link CurveBase.getTangent}).
   */
  sample(t: number): CurveSample {
    const point = this.getPoint(t);
    const tangent = this.getTangent(t);
    return { point, tangent };
  }

  clone(): this {
    return new CatmullRomCurve3([...this.points], this.closed, this.curveType, this.tension) as this;
  }
}
