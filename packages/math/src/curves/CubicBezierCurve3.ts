import { Vector3 } from "../Vector3.js";
import { CurveBase } from "./CurveBase.js";
import { CubicBezier } from "./Interpolations.js";

/** 3D cubic Bézier — three.js `CubicBezierCurve3` parity. */
export class CubicBezierCurve3 extends CurveBase<Vector3> {
  readonly isCubicBezierCurve3 = true as const;

  constructor(
    readonly v0: Vector3,
    readonly v1: Vector3,
    readonly v2: Vector3,
    readonly v3: Vector3
  ) {
    super();
  }

  getPoint(t: number): Vector3 {
    return new Vector3(
      CubicBezier(t, this.v0.x, this.v1.x, this.v2.x, this.v3.x),
      CubicBezier(t, this.v0.y, this.v1.y, this.v2.y, this.v3.y),
      CubicBezier(t, this.v0.z, this.v1.z, this.v2.z, this.v3.z)
    );
  }

  clone(): this {
    return new CubicBezierCurve3(this.v0, this.v1, this.v2, this.v3) as this;
  }
}
