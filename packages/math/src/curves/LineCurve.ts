import { Vector2 } from "../Vector2.js";
import { CurveBase } from "./CurveBase.js";

/** 2D line segment — three.js `LineCurve` parity. */
export class LineCurve extends CurveBase<Vector2> {
  readonly isLineCurve = true as const;

  constructor(
    readonly v1: Vector2 = new Vector2(0, 0),
    readonly v2: Vector2 = new Vector2(0, 0)
  ) {
    super();
  }

  getPoint(t: number): Vector2 {
    if (t === 1) return this.v2;
    return this.v2.subtract(this.v1).multiplyScalar(t).add(this.v1);
  }

  /** Linear curve: `u` is already arc-length uniform. */
  getPointAt(u: number): Vector2 {
    return this.getPoint(u);
  }

  getTangent(_t: number): Vector2 {
    return this.v2.subtract(this.v1).normalize();
  }

  getTangentAt(u: number): Vector2 {
    return this.getTangent(u);
  }

  clone(): this {
    return new LineCurve(this.v1, this.v2) as this;
  }
}
