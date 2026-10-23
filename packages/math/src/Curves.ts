import type { Vector2 } from "./Vector2.js";
import type { Vector3 } from "./Vector3.js";

/**
 * Rotation-minimizing frame output of {@link Curve.computeFrenetFrames}
 * (three.js `Curve.computeFrenetFrames` parity).
 */
export interface FrenetFrame {
  readonly tangents: Vector3[];
  readonly normals: Vector3[];
  readonly binormals: Vector3[];
}

/**
 * three.js `Curve` surface for `Vector2`- and `Vector3`-valued curves.
 * Implementations (see `M/curves/`) evaluate parametric points, keep a cached
 * arc-length table, and expose length-, tangent- and frame-based queries.
 */
export interface Curve<V extends Vector2 | Vector3> {
  readonly arcLengthDivisions: number;
  getPoint(t: number): V;
  /** Point at arc-length fraction `u` ∈ [0,1] (uniform speed). */
  getPointAt(u: number): V;
  /** Unit tangent at parameter `t`. */
  getTangent(t: number): V;
  /** Unit tangent at arc-length fraction `u`. */
  getTangentAt(u: number): V;
  getPoints(divisions?: number): V[];
  /** Evenly arc-length spaced points (divisions + 1 samples). */
  getSpacedPoints(divisions?: number): V[];
  getLength(): number;
  /** Cumulative arc lengths at `divisions` uniform `t` samples. */
  getLengths(divisions?: number): number[];
  /** Maps normalized arc length `u` ∈ [0,1] back to parameter `t`. */
  getUtoTmapping(u: number): number;
  /**
   * Tangent / normal / binormal frames — only defined for `Vector3` curves;
   * returns `null` for `Vector2` curves (three.js logs and returns `null`).
   */
  computeFrenetFrames(segments: number, closed?: boolean): FrenetFrame | null;
  /** Flags the cached arc-length table for rebuild on next access. */
  updateArcLengths(): void;
}

/** Legacy sample pair returned by `CatmullRomCurve3.sample`. */
export interface CurveSample {
  readonly point: Vector3;
  readonly tangent: Vector3;
}

export { CurveBase } from "./curves/CurveBase.js";
export { CatmullRomCurve3, catmullRomSegment, catmullRomSegmentDerivative } from "./curves/CatmullRomCurve3.js";
export type { CatmullRomCurveType } from "./curves/CatmullRomCurve3.js";
export { ClampedCatmullRomCurve3 } from "./curves/ClampedCatmullRomCurve3.js";
export { CubicBezierCurve3 } from "./curves/CubicBezierCurve3.js";
export { QuadraticBezierCurve3 } from "./curves/QuadraticBezierCurve3.js";
export { LineCurve3 } from "./curves/LineCurve3.js";
export { LineCurve } from "./curves/LineCurve.js";
export { QuadraticBezierCurve } from "./curves/QuadraticBezierCurve.js";
export { CubicBezierCurve } from "./curves/CubicBezierCurve.js";
export { SplineCurve } from "./curves/SplineCurve.js";
export { EllipseCurve } from "./curves/EllipseCurve.js";
export { ArcCurve } from "./curves/ArcCurve.js";
export { CurvePath } from "./curves/CurvePath.js";
export { Path } from "./curves/Path.js";
export { Shape } from "./curves/Shape.js";
