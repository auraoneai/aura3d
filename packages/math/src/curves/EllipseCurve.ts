import { Vector2 } from "../Vector2.js";
import { CurveBase } from "./CurveBase.js";

/** 2D ellipse arc — three.js `EllipseCurve` parity. */
export class EllipseCurve extends CurveBase<Vector2> {
  readonly isEllipseCurve = true as const;

  constructor(
    readonly aX = 0,
    readonly aY = 0,
    readonly xRadius = 1,
    readonly yRadius = 1,
    readonly aStartAngle = 0,
    readonly aEndAngle = Math.PI * 2,
    readonly aClockwise = false,
    readonly aRotation = 0
  ) {
    super();
  }

  getPoint(t: number): Vector2 {
    const twoPi = Math.PI * 2;
    let deltaAngle = this.aEndAngle - this.aStartAngle;
    const samePoints = Math.abs(deltaAngle) < Number.EPSILON;

    // ensures that deltaAngle is 0 .. 2 PI
    while (deltaAngle < 0) deltaAngle += twoPi;
    while (deltaAngle > twoPi) deltaAngle -= twoPi;

    if (deltaAngle < Number.EPSILON) {
      if (samePoints) {
        deltaAngle = 0;
      } else {
        deltaAngle = twoPi;
      }
    }

    if (this.aClockwise === true && !samePoints) {
      if (deltaAngle === twoPi) {
        deltaAngle = -twoPi;
      } else {
        deltaAngle = deltaAngle - twoPi;
      }
    }

    const angle = this.aStartAngle + t * deltaAngle;
    let x = this.aX + this.xRadius * Math.cos(angle);
    let y = this.aY + this.yRadius * Math.sin(angle);

    if (this.aRotation !== 0) {
      const cos = Math.cos(this.aRotation);
      const sin = Math.sin(this.aRotation);
      const tx = x - this.aX;
      const ty = y - this.aY;
      x = tx * cos - ty * sin + this.aX;
      y = tx * sin + ty * cos + this.aY;
    }

    return new Vector2(x, y);
  }

  clone(): this {
    return new EllipseCurve(
      this.aX, this.aY, this.xRadius, this.yRadius,
      this.aStartAngle, this.aEndAngle, this.aClockwise, this.aRotation
    ) as this;
  }
}
