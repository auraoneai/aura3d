import { EllipseCurve } from "./EllipseCurve.js";

/** 2D circular arc — three.js `ArcCurve` (EllipseCurve with equal radii). */
export class ArcCurve extends EllipseCurve {
  readonly isArcCurve = true as const;

  constructor(
    aX = 0,
    aY = 0,
    aRadius = 1,
    aStartAngle = 0,
    aEndAngle = Math.PI * 2,
    aClockwise = false
  ) {
    super(aX, aY, aRadius, aRadius, aStartAngle, aEndAngle, aClockwise);
  }
}
