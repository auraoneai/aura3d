import { Vector3 } from "../Vector3.js";
import { CurveBase } from "./CurveBase.js";
import { QuadraticBezier } from "./Interpolations.js";

/** 3D quadratic Bézier — three.js `QuadraticBezierCurve3` parity. */
export class QuadraticBezierCurve3 extends CurveBase<Vector3> {
  readonly isQuadraticBezierCurve3 = true as const;

  constructor(
    readonly v0: Vector3,
    readonly v1: Vector3,
    readonly v2: Vector3
  ) {
    super();
  }

  getPoint(t: number): Vector3 {
    return new Vector3(
      QuadraticBezier(t, this.v0.x, this.v1.x, this.v2.x),
      QuadraticBezier(t, this.v0.y, this.v1.y, this.v2.y),
      QuadraticBezier(t, this.v0.z, this.v1.z, this.v2.z)
    );
  }

  clone(): this {
    return new QuadraticBezierCurve3(this.v0, this.v1, this.v2) as this;
  }
}
