import { Vector3 } from "../Vector3.js";
import {
  copyRationalPoints,
  createRationalAxis,
  evaluateRational,
  type RationalAxis,
  type RationalControlPoint,
  type RationalParameterRange
} from "./NURBSCurve.js";

export interface NURBSSurfaceOptions {
  readonly rangeU?: RationalParameterRange;
  readonly rangeV?: RationalParameterRange;
}

/**
 * Rational tensor-product surface. The control net is indexed [u][v], with
 * Cartesian coordinates and weights. Parameters are normalized and clamped;
 * optional ranges are intervals in the corresponding native knot domains.
 */
export class NURBSSurface {
  readonly isNURBSSurface = true as const;
  readonly degreeU: number;
  readonly degreeV: number;
  readonly knotsU: readonly number[];
  readonly knotsV: readonly number[];
  readonly controlPoints: readonly (readonly RationalControlPoint[])[];
  readonly domainU: RationalParameterRange;
  readonly domainV: RationalParameterRange;
  readonly rangeU: RationalParameterRange;
  readonly rangeV: RationalParameterRange;
  private readonly axes: readonly [RationalAxis, RationalAxis];
  private readonly points: readonly RationalControlPoint[];

  constructor(
    degreeU: number,
    degreeV: number,
    knotsU: readonly number[],
    knotsV: readonly number[],
    controlPoints: readonly (readonly RationalControlPoint[])[],
    options: NURBSSurfaceOptions = {}
  ) {
    const countU = controlPoints.length;
    const countV = controlPoints[0]?.length ?? 0;
    if (Array.from(controlPoints).some((row) => !Array.isArray(row) || row.length !== countV ||
      Array.from(row).some((point) => !point))) {
      throw new RangeError("Surface control points must form a rectangular net.");
    }
    const axisU = createRationalAxis(degreeU, knotsU, countU, options.rangeU);
    const axisV = createRationalAxis(degreeV, knotsV, countV, options.rangeV);
    this.axes = [axisU, axisV];
    this.points = copyRationalPoints(controlPoints.flat());
    this.controlPoints = Object.freeze(Array.from({ length: countU }, (_, i) => Object.freeze(this.points.slice(i * countV, (i + 1) * countV))));
    this.degreeU = degreeU;
    this.degreeV = degreeV;
    this.knotsU = axisU.knots;
    this.knotsV = axisV.knots;
    this.domainU = axisU.domain;
    this.domainV = axisV.domain;
    this.rangeU = axisU.range;
    this.rangeV = axisV.range;
  }

  getPoint(u: number, v: number): Vector3 {
    return evaluateRational(this.axes, this.points, [u, v], [0, 0])[0]![0]![0]!;
  }

  /** `result[i][j]` is the (i,j) mixed derivative in normalized coordinates. */
  getDerivatives(u: number, v: number, orderU = 1, orderV = 1): Vector3[][] {
    return evaluateRational(this.axes, this.points, [u, v], [orderU, orderV]).map((row) => row.map((column) => column[0]!));
  }

  getNormal(u: number, v: number): Vector3 {
    const derivatives = this.getDerivatives(u, v, 1, 1);
    const tangentU = derivatives[1]![0]!;
    const tangentV = derivatives[0]![1]!;
    const scaleU = Math.max(Math.abs(tangentU.x), Math.abs(tangentU.y), Math.abs(tangentU.z));
    const scaleV = Math.max(Math.abs(tangentV.x), Math.abs(tangentV.y), Math.abs(tangentV.z));
    if (scaleU === 0 || scaleV === 0) return Vector3.zero.clone();
    // Normalize the input magnitudes before the cross product; even finite
    // tangents can otherwise overflow or underflow when multiplied together.
    return tangentU.divideScalar(scaleU).cross(tangentV.divideScalar(scaleV)).normalize();
  }

  clone(): NURBSSurface {
    return new NURBSSurface(this.degreeU, this.degreeV, this.knotsU, this.knotsV, this.controlPoints, {
      rangeU: this.rangeU,
      rangeV: this.rangeV
    });
  }
}
