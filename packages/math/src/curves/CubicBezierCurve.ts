import { Vector2 } from "../Vector2.js";
import { CurveBase } from "./CurveBase.js";
import { CubicBezier } from "./Interpolations.js";

/** 2D cubic Bézier — three.js `CubicBezierCurve` parity. */
export class CubicBezierCurve extends CurveBase<Vector2> {
  readonly isCubicBezierCurve = true as const;

  constructor(
    readonly v0: Vector2,
    readonly v1: Vector2,
    readonly v2: Vector2,
    readonly v3: Vector2
  ) {
    super();
  }

  getPoint(t: number): Vector2 {
    return new Vector2(
      CubicBezier(t, this.v0.x, this.v1.x, this.v2.x, this.v3.x),
      CubicBezier(t, this.v0.y, this.v1.y, this.v2.y, this.v3.y)
    );
  }

  clone(): this {
    return new CubicBezierCurve(this.v0, this.v1, this.v2, this.v3) as this;
  }
}
