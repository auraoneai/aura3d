import { Vector3 } from "../Vector3.js";
import {
  copyRationalPoints,
  createRationalAxis,
  evaluateRational,
  type RationalAxis,
  type RationalControlPoint,
  type RationalParameterRange
} from "./NURBSCurve.js";

export interface NURBSVolumeOptions {
  readonly rangeU?: RationalParameterRange;
  readonly rangeV?: RationalParameterRange;
  readonly rangeW?: RationalParameterRange;
}

/**
 * Rational tensor-product volume with control points indexed [u][v][w].
 * Derivatives are in the normalized, optionally clipped parameter space.
 */
export class NURBSVolume {
  readonly isNURBSVolume = true as const;
  readonly degreeU: number;
  readonly degreeV: number;
  readonly degreeW: number;
  readonly knotsU: readonly number[];
  readonly knotsV: readonly number[];
  readonly knotsW: readonly number[];
  readonly controlPoints: readonly (readonly (readonly RationalControlPoint[])[])[];
  readonly domainU: RationalParameterRange;
  readonly domainV: RationalParameterRange;
  readonly domainW: RationalParameterRange;
  readonly rangeU: RationalParameterRange;
  readonly rangeV: RationalParameterRange;
  readonly rangeW: RationalParameterRange;
  private readonly axes: readonly [RationalAxis, RationalAxis, RationalAxis];
  private readonly points: readonly RationalControlPoint[];

  constructor(
    degreeU: number,
    degreeV: number,
    degreeW: number,
    knotsU: readonly number[],
    knotsV: readonly number[],
    knotsW: readonly number[],
    controlPoints: readonly (readonly (readonly RationalControlPoint[])[])[],
    options: NURBSVolumeOptions = {}
  ) {
    const countU = controlPoints.length;
    const countV = controlPoints[0]?.length ?? 0;
    const countW = controlPoints[0]?.[0]?.length ?? 0;
    if (Array.from(controlPoints).some((plane) => !Array.isArray(plane) || plane.length !== countV ||
      Array.from(plane).some((row) => !Array.isArray(row) || row.length !== countW || Array.from(row).some((point) => !point)))) {
      throw new RangeError("Volume control points must form a rectangular net.");
    }
    const axisU = createRationalAxis(degreeU, knotsU, countU, options.rangeU);
    const axisV = createRationalAxis(degreeV, knotsV, countV, options.rangeV);
    const axisW = createRationalAxis(degreeW, knotsW, countW, options.rangeW);
    this.axes = [axisU, axisV, axisW];
    this.points = copyRationalPoints(controlPoints.flat(2));
    this.controlPoints = Object.freeze(Array.from({ length: countU }, (_, i) =>
      Object.freeze(Array.from({ length: countV }, (_, j) => Object.freeze(this.points.slice((i * countV + j) * countW, (i * countV + j + 1) * countW))))
    ));
    this.degreeU = degreeU;
    this.degreeV = degreeV;
    this.degreeW = degreeW;
    this.knotsU = axisU.knots;
    this.knotsV = axisV.knots;
    this.knotsW = axisW.knots;
    this.domainU = axisU.domain;
    this.domainV = axisV.domain;
    this.domainW = axisW.domain;
    this.rangeU = axisU.range;
    this.rangeV = axisV.range;
    this.rangeW = axisW.range;
  }

  getPoint(u: number, v: number, w: number): Vector3 {
    return evaluateRational(this.axes, this.points, [u, v, w], [0, 0, 0])[0]![0]![0]!;
  }

  /** `result[i][j][k]` is the corresponding mixed partial derivative. */
  getDerivatives(u: number, v: number, w: number, orderU = 1, orderV = 1, orderW = 1): Vector3[][][] {
    return evaluateRational(this.axes, this.points, [u, v, w], [orderU, orderV, orderW]);
  }

  clone(): NURBSVolume {
    return new NURBSVolume(this.degreeU, this.degreeV, this.degreeW, this.knotsU, this.knotsV, this.knotsW, this.controlPoints, {
      rangeU: this.rangeU,
      rangeV: this.rangeV,
      rangeW: this.rangeW
    });
  }
}
