import { Vector2 } from "../Vector2.js";
import { CurvePath } from "./CurvePath.js";
import { EllipseCurve } from "./EllipseCurve.js";
import { LineCurve } from "./LineCurve.js";
import { QuadraticBezierCurve } from "./QuadraticBezierCurve.js";
import { CubicBezierCurve } from "./CubicBezierCurve.js";
import { SplineCurve } from "./SplineCurve.js";

/**
 * Chainable 2D curve builder — three.js `Path` parity: `moveTo`, `lineTo`,
 * `quadraticCurveTo`, `bezierCurveTo`, `splineThru`, `arc`/`absarc`,
 * `ellipse`/`absellipse`.
 */
export class Path extends CurvePath<Vector2> {
  currentPoint = new Vector2(0, 0);

  constructor(points?: readonly Vector2[]) {
    super();
    if (points) this.setFromPoints(points);
  }

  setFromPoints(points: readonly Vector2[]): this {
    this.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1, l = points.length; i < l; i += 1) {
      this.lineTo(points[i]!.x, points[i]!.y);
    }
    return this;
  }

  moveTo(x: number, y: number): this {
    this.currentPoint = new Vector2(x, y);
    return this;
  }

  lineTo(x: number, y: number): this {
    const curve = new LineCurve(this.currentPoint, new Vector2(x, y));
    this.curves.push(curve);
    this.currentPoint = new Vector2(x, y);
    return this;
  }

  quadraticCurveTo(aCPx: number, aCPy: number, aX: number, aY: number): this {
    const curve = new QuadraticBezierCurve(
      this.currentPoint,
      new Vector2(aCPx, aCPy),
      new Vector2(aX, aY)
    );
    this.curves.push(curve);
    this.currentPoint = new Vector2(aX, aY);
    return this;
  }

  bezierCurveTo(aCP1x: number, aCP1y: number, aCP2x: number, aCP2y: number, aX: number, aY: number): this {
    const curve = new CubicBezierCurve(
      this.currentPoint,
      new Vector2(aCP1x, aCP1y),
      new Vector2(aCP2x, aCP2y),
      new Vector2(aX, aY)
    );
    this.curves.push(curve);
    this.currentPoint = new Vector2(aX, aY);
    return this;
  }

  splineThru(pts: readonly Vector2[]): this {
    const npts = [this.currentPoint, ...pts];
    const curve = new SplineCurve(npts);
    this.curves.push(curve);
    this.currentPoint = pts[pts.length - 1]!;
    return this;
  }

  arc(aX: number, aY: number, aRadius: number, aStartAngle: number, aEndAngle: number, aClockwise = false): this {
    const x0 = this.currentPoint.x;
    const y0 = this.currentPoint.y;
    this.absarc(aX + x0, aY + y0, aRadius, aStartAngle, aEndAngle, aClockwise);
    return this;
  }

  absarc(aX: number, aY: number, aRadius: number, aStartAngle: number, aEndAngle: number, aClockwise = false): this {
    this.absellipse(aX, aY, aRadius, aRadius, aStartAngle, aEndAngle, aClockwise);
    return this;
  }

  ellipse(
    aX: number, aY: number, xRadius: number, yRadius: number,
    aStartAngle: number, aEndAngle: number, aClockwise = false, aRotation = 0
  ): this {
    const x0 = this.currentPoint.x;
    const y0 = this.currentPoint.y;
    this.absellipse(aX + x0, aY + y0, xRadius, yRadius, aStartAngle, aEndAngle, aClockwise, aRotation);
    return this;
  }

  absellipse(
    aX: number, aY: number, xRadius: number, yRadius: number,
    aStartAngle: number, aEndAngle: number, aClockwise = false, aRotation = 0
  ): this {
    const curve = new EllipseCurve(aX, aY, xRadius, yRadius, aStartAngle, aEndAngle, aClockwise, aRotation);
    if (this.curves.length > 0) {
      // if a previous curve is present, attempt to join
      const firstPoint = curve.getPoint(0);
      if (!firstPoint.equals(this.currentPoint)) {
        this.lineTo(firstPoint.x, firstPoint.y);
      }
    }
    this.curves.push(curve);
    this.currentPoint = curve.getPoint(1);
    return this;
  }

  clone(): this {
    const copy = new Path();
    for (const curve of this.curves) copy.add(curve.clone());
    copy.autoClose = this.autoClose;
    copy.currentPoint = this.currentPoint;
    return copy as this;
  }
}
