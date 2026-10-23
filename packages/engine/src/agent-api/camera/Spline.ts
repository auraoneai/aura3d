/**
 * Q-1 camera spline (PRD-08) — centripetal Catmull-Rom with arc-length
 * reparameterisation.
 *
 * - `alpha = 0.5` (centripetal) avoids loops/cusps at uneven point spacing.
 * - `closed` wraps the control points so the loop is C1-continuous.
 * - An arc-length LUT (`samples`, default 256) gives `pointAt(u)` /
 *   `tangentAt(u)` where `u ∈ [0,1]` is constant-speed within ~2 %.
 *   Control points are passed through exactly (centripetal CR interpolates).
 *
 * Curve evaluation and the arc-length machinery come from `@aura3d/math`
 * (`ClampedCatmullRomCurve3` over `catmullRomSegment`, with
 * `CurveBase.getUtoTmapping` for arc length). Any `alpha` is supported
 * (0 uniform, 0.5 centripetal, 1 chordal); open splines clamp their end
 * neighbours so the curve spans exactly `points.length - 1` segments.
 */

import { ClampedCatmullRomCurve3, catmullRomSegment, catmullRomSegmentDerivative, Vector3 as MathVector3 } from "@aura3d/math";
import type { AuraVec3 } from "../index.js";

export interface AuraSplineOptions {
  readonly closed?: boolean;
  /** Catmull-Rom alpha — 0.5 centripetal (default), 0 uniform, 1 chordal. */
  readonly alpha?: number;
  /** Arc-length lookup resolution; default 256. */
  readonly samples?: number;
}

const EPSILON = 1e-9;

export class AuraCameraSpline {
  private readonly points: readonly AuraVec3[];
  private readonly closed: boolean;
  private readonly alpha: number;
  private readonly length: number;
  private readonly curve: ClampedCatmullRomCurve3;
  readonly segments: number;

  constructor(points: readonly AuraVec3[], options: AuraSplineOptions = {}) {
    if (points.length < 2) {
      throw new Error(`AuraCameraSpline needs >= 2 points, got ${points.length}`);
    }
    this.points = points.map((p) => [p[0], p[1], p[2]] as AuraVec3);
    this.closed = options.closed === true;
    this.alpha = options.alpha ?? 0.5;
    this.segments = this.closed ? this.points.length : this.points.length - 1;
    const samples = Math.max(8, Math.floor(options.samples ?? 256));

    const curve = new ClampedCatmullRomCurve3(
      this.points.map((p) => new MathVector3(p[0], p[1], p[2])),
      this.closed,
      this.alpha
    );
    curve.arcLengthDivisions = samples;
    this.curve = curve;
    const lut = curve.getLengths();
    this.length = lut[lut.length - 1]!;
  }

  get totalLength(): number {
    return this.length;
  }

  /** Position at arc-length fraction `u ∈ [0,1]`. */
  pointAt(u: number): AuraVec3 {
    return this.evaluateParam(this.paramAt(u));
  }

  /**
   * Position at raw curve parameter `s ∈ [0,1]` (uniform over segments —
   * control points sit at `s = i / segments`, so this interpolates them
   * exactly). Use `pointAt` for constant-speed travel.
   */
  pointAtParam(s: number): AuraVec3 {
    return this.evaluateParam(s);
  }

  /**
   * Unit tangent at arc-length fraction `u ∈ [0,1]`, from the analytic
   * Catmull-Rom derivative — direction is exact at knots (C1) instead of a
   * secant across them.
   */
  tangentAt(u: number): AuraVec3 {
    return this.normalize(this.derivativeAtParam(this.paramAt(u)));
  }

  /** Raw curve derivative dP/ds at parameter `s` (un-normalized). */
  derivativeAtParam(s: number): AuraVec3 {
    const nSeg = this.segments;
    const scaled = Math.max(0, Math.min(1, s)) * nSeg;
    const seg = Math.min(nSeg - 1, Math.floor(scaled));
    const t = scaled - seg;
    const p0 = this.pointIndex(seg - 1);
    const p1 = this.pointIndex(seg);
    const p2 = this.pointIndex(seg + 1);
    const p3 = this.pointIndex(seg + 2);
    return catmullRomDerivative(p0, p1, p2, p3, t, this.alpha);
  }

  private normalize(v: AuraVec3): AuraVec3 {
    const len = Math.hypot(v[0], v[1], v[2]);
    return len <= EPSILON ? [0, 0, 1] : [v[0] / len, v[1] / len, v[2] / len];
  }

  /** Arc-length fraction `u` → raw curve parameter `s ∈ [0,1]`. */
  private paramAt(u: number): number {
    return this.curve.getUtoTmapping(Math.max(0, Math.min(1, u)));
  }

  private pointIndex(i: number): AuraVec3 {
    const n = this.points.length;
    if (this.closed) return this.points[((i % n) + n) % n]!;
    return this.points[Math.max(0, Math.min(n - 1, i))]!;
  }

  /** Raw curve parameter `s ∈ [0,1]` → position (uniform over segments). */
  private evaluateParam(s: number): AuraVec3 {
    const p = this.curve.getPoint(s);
    return [p.x, p.y, p.z];
  }
}

/** Centripetal-parameterised Catmull-Rom between p1 and p2 at t ∈ [0,1]. */
export function catmullRom(
  p0: AuraVec3,
  p1: AuraVec3,
  p2: AuraVec3,
  p3: AuraVec3,
  t: number,
  alpha = 0.5
): AuraVec3 {
  const p = catmullRomSegment(
    new MathVector3(p0[0], p0[1], p0[2]),
    new MathVector3(p1[0], p1[1], p1[2]),
    new MathVector3(p2[0], p2[1], p2[2]),
    new MathVector3(p3[0], p3[1], p3[2]),
    t,
    alpha
  );
  return [p.x, p.y, p.z];
}

/**
 * Analytic dP/d(knot parameter) of the Catmull-Rom segment between p1 and p2
 * at segment weight `t` — the math package's Hermite segment derivative
 * (`dP/dweight`) divided by the segment's knot span `distance(p1,p2)^alpha`.
 */
export function catmullRomDerivative(
  p0: AuraVec3,
  p1: AuraVec3,
  p2: AuraVec3,
  p3: AuraVec3,
  t: number,
  alpha = 0.5
): AuraVec3 {
  const v0 = new MathVector3(p0[0], p0[1], p0[2]);
  const v1 = new MathVector3(p1[0], p1[1], p1[2]);
  const v2 = new MathVector3(p2[0], p2[1], p2[2]);
  const v3 = new MathVector3(p3[0], p3[1], p3[2]);
  const span = Math.pow(Math.max(v1.distanceTo(v2), 1e-6), alpha);
  const d = catmullRomSegmentDerivative(v0, v1, v2, v3, t, alpha).multiplyScalar(1 / span);
  return [d.x, d.y, d.z];
}

export function createSpline(points: readonly AuraVec3[], options: AuraSplineOptions = {}): AuraCameraSpline {
  return new AuraCameraSpline(points, options);
}
