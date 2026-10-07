/**
 * Q-1 camera spline (PRD-08) — centripetal Catmull-Rom with arc-length
 * reparameterisation.
 *
 * - `alpha = 0.5` (centripetal) avoids loops/cusps at uneven point spacing.
 * - `closed` wraps the control points so the loop is C1-continuous.
 * - An arc-length LUT (`samples`, default 256) gives `pointAt(u)` /
 *   `tangentAt(u)` where `u ∈ [0,1]` is constant-speed within ~2 %.
 *   Control points are passed through exactly (centripetal CR interpolates).
 */

import type { AuraVec3 } from "../index.js";

export interface AuraSplineOptions {
  readonly closed?: boolean;
  /** Catmull-Rom alpha — 0.5 centripetal (default), 0 uniform, 1 chordal. */
  readonly alpha?: number;
  /** Arc-length lookup resolution; default 256. */
  readonly samples?: number;
}

const EPSILON = 1e-9;

function dist(a: AuraVec3, b: AuraVec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

export class AuraCameraSpline {
  private readonly points: readonly AuraVec3[];
  private readonly closed: boolean;
  private readonly alpha: number;
  private readonly lut: readonly number[];
  private readonly length: number;
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
    const lut = new Array<number>(samples + 1);
    lut[0] = 0;
    let acc = 0;
    let prev = this.evaluateParam(0);
    for (let i = 1; i <= samples; i += 1) {
      const p = this.evaluateParam(i / samples);
      acc += dist(prev, p);
      lut[i] = acc;
      prev = p;
    }
    this.lut = lut;
    this.length = acc;
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
    const target = Math.max(0, Math.min(1, u)) * this.length;
    if (this.length <= EPSILON) return 0;
    const lut = this.lut;
    let lo = 0;
    let hi = lut.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lut[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const before = lut[i - 1];
    const after = lut[i];
    const span = after - before;
    const frac = span <= EPSILON ? 0 : (target - before) / span;
    return Math.min(1, (i - 1 + frac) / (lut.length - 1));
  }

  private pointIndex(i: number): AuraVec3 {
    const n = this.points.length;
    if (this.closed) return this.points[((i % n) + n) % n];
    return this.points[Math.max(0, Math.min(n - 1, i))];
  }

  /** Raw curve parameter `s ∈ [0,1]` → position (uniform over segments). */
  private evaluateParam(s: number): AuraVec3 {
    const nSeg = this.segments;
    const scaled = Math.max(0, Math.min(1, s)) * nSeg;
    const seg = Math.min(nSeg - 1, Math.floor(scaled));
    const t = scaled - seg;
    const p0 = this.pointIndex(seg - 1);
    const p1 = this.pointIndex(seg);
    const p2 = this.pointIndex(seg + 1);
    const p3 = this.pointIndex(seg + 2);
    return catmullRom(p0, p1, p2, p3, t, this.alpha);
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
  const k = (a: AuraVec3, b: AuraVec3) => Math.pow(Math.max(dist(a, b), EPSILON), alpha);
  const t0 = 0;
  const t1 = t0 + k(p0, p1);
  const t2 = t1 + k(p1, p2);
  const t3 = t2 + k(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const mix = (a: AuraVec3, b: AuraVec3, ta: number, tb: number): AuraVec3 => {
    const w = tb - ta <= EPSILON ? 0.5 : (tt - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/**
 * Analytic dP/ds for the centripetal Catmull-Rom: the nested-lerp scheme is
 * piecewise linear in `tt` between fixed knot values, so each level's
 * derivative follows the quotient of the mix.
 */
export function catmullRomDerivative(
  p0: AuraVec3,
  p1: AuraVec3,
  p2: AuraVec3,
  p3: AuraVec3,
  t: number,
  alpha = 0.5
): AuraVec3 {
  const k = (a: AuraVec3, b: AuraVec3) => Math.pow(Math.max(dist(a, b), EPSILON), alpha);
  const t0 = 0;
  const t1 = t0 + k(p0, p1);
  const t2 = t1 + k(p1, p2);
  const t3 = t2 + k(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const sub = (a: AuraVec3, b: AuraVec3): AuraVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const lerpV = (a: AuraVec3, b: AuraVec3, w: number): AuraVec3 => [
    a[0] + (b[0] - a[0]) * w,
    a[1] + (b[1] - a[1]) * w,
    a[2] + (b[2] - a[2]) * w
  ];
  const w = (tt: number, ta: number, tb: number) =>
    tb - ta <= EPSILON ? 0.5 : (tt - ta) / (tb - ta);
  const dw = (ta: number, tb: number) => (tb - ta <= EPSILON ? 0 : 1 / (tb - ta));
  const mixD = (
    a: AuraVec3,
    da: AuraVec3,
    b: AuraVec3,
    db: AuraVec3,
    ta: number,
    tb: number
  ): AuraVec3 => {
    const wv = w(tt, ta, tb);
    const dwv = dw(ta, tb);
    const d = sub(b, a);
    return [
      da[0] * (1 - wv) + db[0] * wv + d[0] * dwv,
      da[1] * (1 - wv) + db[1] * wv + d[1] * dwv,
      da[2] * (1 - wv) + db[2] * wv + d[2] * dwv
    ];
  };
  const span01 = dw(t0, t1);
  const span12 = dw(t1, t2);
  const span23 = dw(t2, t3);
  const a1 = lerpV(p0, p1, w(tt, t0, t1));
  const a2 = lerpV(p1, p2, w(tt, t1, t2));
  const a3 = lerpV(p2, p3, w(tt, t2, t3));
  const da1: AuraVec3 = [sub(p1, p0)[0] * span01, sub(p1, p0)[1] * span01, sub(p1, p0)[2] * span01];
  const da2: AuraVec3 = [sub(p2, p1)[0] * span12, sub(p2, p1)[1] * span12, sub(p2, p1)[2] * span12];
  const da3: AuraVec3 = [sub(p3, p2)[0] * span23, sub(p3, p2)[1] * span23, sub(p3, p2)[2] * span23];
  const b1 = lerpV(a1, a2, w(tt, t0, t2));
  const b2 = lerpV(a2, a3, w(tt, t1, t3));
  const db1 = mixD(a1, da1, a2, da2, t0, t2);
  const db2 = mixD(a2, da2, a3, da3, t1, t3);
  return mixD(b1, db1, b2, db2, t1, t2);
}

export function createSpline(points: readonly AuraVec3[], options: AuraSplineOptions = {}): AuraCameraSpline {
  return new AuraCameraSpline(points, options);
}
