import type { ProceduralVec3 } from "./types.js";

/** A parametric 3D curve; `point(t)` is defined for t in [0, 1] (closed curves: point(1) equals point(0)). */
export interface ProceduralCurve3 {
  readonly closed: boolean;
  point(t: number): ProceduralVec3;
}

const dist = (a: ProceduralVec3, b: ProceduralVec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lerp = (a: ProceduralVec3, b: ProceduralVec3, t: number): ProceduralVec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function checkPoints(points: readonly ProceduralVec3[], min: number, name: string): void {
  if (points.length < min) throw new RangeError(`procedural: ${name} needs at least ${min} points`);
  for (const p of points) if (!(Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]))) throw new RangeError(`procedural: ${name} points must be finite`);
}

/** Straight segments through the points (sharp corners). */
export function polylineCurve(points: readonly ProceduralVec3[], options: { readonly closed?: boolean } = {}): ProceduralCurve3 {
  checkPoints(points, 2, "polylineCurve");
  const closed = options.closed ?? false;
  const loop = closed ? [...points, points[0]!] : points;
  const lengths = [0];
  for (let i = 1; i < loop.length; i += 1) lengths.push(lengths[i - 1]! + dist(loop[i - 1]!, loop[i]!));
  const total = lengths[lengths.length - 1]!;
  return {
    closed,
    point(t) {
      const s = Math.min(1, Math.max(0, t)) * total;
      let i = 1;
      while (i < loop.length - 1 && lengths[i]! < s) i += 1;
      const span = lengths[i]! - lengths[i - 1]!;
      return lerp(loop[i - 1]!, loop[i]!, span > 0 ? (s - lengths[i - 1]!) / span : 0);
    }
  };
}

/**
 * Catmull-Rom spline through the points. Default `alpha` 0.5 is the centripetal form, which does not loop or
 * overshoot on uneven spacing (0 = uniform, 1 = chordal).
 */
export function catmullRomCurve(points: readonly ProceduralVec3[], options: { readonly closed?: boolean; readonly alpha?: number } = {}): ProceduralCurve3 {
  checkPoints(points, 2, "catmullRomCurve");
  const closed = options.closed ?? false;
  const alpha = options.alpha ?? 0.5;
  const n = points.length;
  const segCount = closed ? n : n - 1;
  const at = (i: number): ProceduralVec3 => {
    if (closed) return points[((i % n) + n) % n]!;
    if (i < 0) return [2 * points[0]![0] - points[1]![0], 2 * points[0]![1] - points[1]![1], 2 * points[0]![2] - points[1]![2]];
    if (i > n - 1) return [2 * points[n - 1]![0] - points[n - 2]![0], 2 * points[n - 1]![1] - points[n - 2]![1], 2 * points[n - 1]![2] - points[n - 2]![2]];
    return points[i]!;
  };
  return {
    closed,
    point(t) {
      const g = Math.min(1, Math.max(0, t)) * segCount;
      const i = Math.min(segCount - 1, Math.floor(g));
      const u = g - i;
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      const knot = (a: ProceduralVec3, b: ProceduralVec3): number => Math.max(1e-6, dist(a, b) ** alpha);
      const t0 = 0, t1 = t0 + knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
      const tt = t1 + (t2 - t1) * u;
      const mix = (a: ProceduralVec3, b: ProceduralVec3, ta: number, tb: number): ProceduralVec3 => lerp(a, b, (tt - ta) / (tb - ta));
      const a1 = mix(p0, p1, t0, t1), a2 = mix(p1, p2, t1, t2), a3 = mix(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, (tt - t0) / (t2 - t0)), b2 = lerp(a2, a3, (tt - t1) / (t3 - t1));
      return lerp(b1, b2, (tt - t1) / (t2 - t1));
    }
  };
}

/**
 * Chain of cubic Bezier segments. Pass 3n+1 points: [p0, c1, c2, p1, c3, c4, p2, ...]. The chain is C0 unless the
 * control points are mirrored by the author.
 */
export function cubicBezierCurve(points: readonly ProceduralVec3[]): ProceduralCurve3 {
  checkPoints(points, 4, "cubicBezierCurve");
  if ((points.length - 1) % 3 !== 0) throw new RangeError("procedural: cubicBezierCurve needs 3n+1 points");
  const segCount = (points.length - 1) / 3;
  return {
    closed: false,
    point(t) {
      const g = Math.min(1, Math.max(0, t)) * segCount;
      const i = Math.min(segCount - 1, Math.floor(g));
      const u = g - i, v = 1 - u;
      const [p0, p1, p2, p3] = [points[i * 3]!, points[i * 3 + 1]!, points[i * 3 + 2]!, points[i * 3 + 3]!];
      const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
      return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]];
    }
  };
}

export interface CurveSamples {
  readonly points: ProceduralVec3[];
  readonly tangents: ProceduralVec3[];
  /** Cumulative arc length at each sample. */
  readonly lengths: number[];
  readonly totalLength: number;
}

/** Resample a curve at `steps + 1` points spaced evenly by arc length, with unit tangents. */
export function sampleCurve(curve: ProceduralCurve3, steps: number): CurveSamples {
  if (!Number.isInteger(steps) || steps < 1) throw new RangeError("procedural: steps must be an integer >= 1");
  const dense = Math.max(64, steps * 16);
  const table: number[] = [0];
  let prev = curve.point(0);
  for (let i = 1; i <= dense; i += 1) {
    const p = curve.point(i / dense);
    table.push(table[i - 1]! + dist(prev, p));
    prev = p;
  }
  const total = table[dense]!;
  if (!(total > 1e-9)) throw new RangeError("procedural: curve has zero length");
  const points: ProceduralVec3[] = [], tangents: ProceduralVec3[] = [], lengths: number[] = [];
  let cursor = 0;
  for (let k = 0; k <= steps; k += 1) {
    const s = (total * k) / steps;
    while (cursor < dense - 1 && table[cursor + 1]! < s) cursor += 1;
    const span = table[cursor + 1]! - table[cursor]!;
    const t = (cursor + (span > 0 ? (s - table[cursor]!) / span : 0)) / dense;
    points.push(curve.point(t));
    lengths.push(s);
    const h = 1e-4;
    const a = curve.point(curve.closed ? (((t - h) % 1) + 1) % 1 : Math.max(0, t - h));
    const b = curve.point(curve.closed ? (t + h) % 1 : Math.min(1, t + h));
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    tangents.push([dx / l, dy / l, dz / l]);
  }
  if (curve.closed) {
    // The wrapped last sample must share the first sample's tangent.
    tangents[steps] = tangents[0]!;
    points[steps] = points[0]!;
  }
  return { points, tangents, lengths, totalLength: total };
}
