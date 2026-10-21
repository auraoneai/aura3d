import { Vector2 } from "../Vector2.js";
import { CurveBase } from "./CurveBase.js";
import { CatmullRom } from "./Interpolations.js";

/** 2D uniform Catmull-Rom spline — three.js `SplineCurve` parity. */
export class SplineCurve extends CurveBase<Vector2> {
  readonly isSplineCurve = true as const;

  constructor(readonly points: readonly Vector2[] = []) {
    super();
  }

  getPoint(t: number): Vector2 {
    const points = this.points;
    const p = (points.length - 1) * t;
    const intPoint = Math.floor(p);
    const weight = p - intPoint;

    const p0 = points[intPoint === 0 ? intPoint : intPoint - 1]!;
    const p1 = points[intPoint]!;
    const p2 = points[intPoint > points.length - 2 ? points.length - 1 : intPoint + 1]!;
    const p3 = points[intPoint > points.length - 3 ? points.length - 1 : intPoint + 2]!;

    return new Vector2(
      CatmullRom(weight, p0.x, p1.x, p2.x, p3.x),
      CatmullRom(weight, p0.y, p1.y, p2.y, p3.y)
    );
  }

  clone(): this {
    return new SplineCurve([...this.points]) as this;
  }
}
