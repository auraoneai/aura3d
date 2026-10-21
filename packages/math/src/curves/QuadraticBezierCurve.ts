import { Vector2 } from "../Vector2.js";
import { CurveBase } from "./CurveBase.js";
import { QuadraticBezier } from "./Interpolations.js";

/** 2D quadratic Bézier — three.js `QuadraticBezierCurve` parity. */
export class QuadraticBezierCurve extends CurveBase<Vector2> {
  readonly isQuadraticBezierCurve = true as const;

  constructor(
    readonly v0: Vector2,
    readonly v1: Vector2,
    readonly v2: Vector2
  ) {
    super();
  }

  getPoint(t: number): Vector2 {
    return new Vector2(
      QuadraticBezier(t, this.v0.x, this.v1.x, this.v2.x),
      QuadraticBezier(t, this.v0.y, this.v1.y, this.v2.y)
    );
  }

  clone(): this {
    return new QuadraticBezierCurve(this.v0, this.v1, this.v2) as this;
  }
}
