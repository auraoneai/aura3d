import { Vector3 } from "../Vector3.js";
import { CurveBase } from "./CurveBase.js";

/** 3D line segment — three.js `LineCurve3` parity. */
export class LineCurve3 extends CurveBase<Vector3> {
  readonly isLineCurve3 = true as const;

  constructor(
    readonly v1: Vector3 = new Vector3(0, 0, 0),
    readonly v2: Vector3 = new Vector3(0, 0, 0)
  ) {
    super();
  }

  getPoint(t: number): Vector3 {
    if (t === 1) return this.v2;
    return this.v2.subtract(this.v1).multiplyScalar(t).add(this.v1);
  }

  /** Linear curve: `u` is already arc-length uniform. */
  getPointAt(u: number): Vector3 {
    return this.getPoint(u);
  }

  getTangent(_t: number): Vector3 {
    return this.v2.subtract(this.v1).normalize();
  }

  getTangentAt(u: number): Vector3 {
    return this.getTangent(u);
  }

  clone(): this {
    return new LineCurve3(this.v1, this.v2) as this;
  }
}
