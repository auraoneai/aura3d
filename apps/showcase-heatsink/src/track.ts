/**
 * Track geometry seen from the player (audit C11). The world scrolls past a camera that rides the road, so everything
 * is placed relative to the player's race progress. The old code bent the whole road with the player's single
 * curvature sample (`c·d²·0.0026`), so the far road jumped sideways at every sector boundary and tiles never turned.
 * Here curvature is sampled at each point's own distance, smoothed across sector boundaries, and integrated into a
 * heading, so tiles follow the local tangent and a boundary moves nothing on screen.
 */
import type { CircuitSpec } from "./data";

/** Radians of heading change per metre per unit of sector curvature: `c·d²·0.0026` is `½·(c·0.0052)·d²`. */
export const CURVE_GAIN = 0.0052;
/** Height change per metre per unit of sector pitch slope (the old `pitchSlope·d·0.08`). */
export const SLOPE_GAIN = 0.08;
/** Metres over which the curvature blends from one sector to the next. */
export const SECTOR_BLEND = 80;

const wrap = (v: number, period: number): number => ((v % period) + period) % period;
const smoothstep = (t: number): number => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

function sectorIndex(circuit: CircuitSpec, frac: number): number {
  let index = 0;
  for (let i = 0; i < circuit.sectors.length; i += 1) if (frac >= circuit.sectors[i]!.startFrac) index = i;
  return index;
}

/** A sector value blended over `SECTOR_BLEND` metres around each boundary. */
function blendedSectorValue(circuit: CircuitSpec, s: number, pick: (index: number) => number): number {
  const L = circuit.length;
  const ws = wrap(s, L);
  const n = circuit.sectors.length;
  const i = sectorIndex(circuit, ws / L);
  const start = circuit.sectors[i]!.startFrac * L;
  const end = (i + 1 < n ? circuit.sectors[i + 1]!.startFrac : 1) * L;
  const half = SECTOR_BLEND / 2;
  const here = pick(i);
  if (ws - start < half) {
    const prev = pick((i - 1 + n) % n);
    return prev + (here - prev) * smoothstep((ws - start + half) / SECTOR_BLEND);
  }
  if (end - ws < half) {
    const next = pick((i + 1) % n);
    return here + (next - here) * smoothstep((ws - (end - half)) / SECTOR_BLEND);
  }
  return here;
}

/** Track curvature in radians per metre at race distance `s` (continuous across sectors and laps). */
export function curvatureAt(circuit: CircuitSpec, s: number): number {
  const frac = wrap(s, circuit.length) / circuit.length;
  const amplitude = blendedSectorValue(circuit, s, (i) => circuit.sectors[i]!.curvature);
  return (Math.sin(frac * Math.PI * 4) + 0.45 * Math.cos(frac * Math.PI * 6)) * amplitude * CURVE_GAIN;
}

/** Track gradient (height per metre) at race distance `s`. */
export function gradientAt(circuit: CircuitSpec, s: number): number {
  const frac = wrap(s, circuit.length) / circuit.length;
  return Math.sin(frac * Math.PI * 6) * blendedSectorValue(circuit, s, (i) => circuit.sectors[i]!.pitchSlope) * SLOPE_GAIN;
}

export function sectorNameAt(circuit: CircuitSpec, s: number): string {
  return circuit.sectors[sectorIndex(circuit, wrap(s, circuit.length) / circuit.length)]!.name;
}

/** Placement of a track point in the view frame. */
export interface TrackPose {
  x: number;
  y: number;
  z: number;
  /** Heading relative to the road at the player; the node yaw is `-heading`. */
  heading: number;
}

/**
 * Polyline of the road from `behind` metres before the player to `ahead` metres after, in the view frame: the road
 * at the player runs along -Z through the origin. Rebuilt once per presented frame; no allocation after construction.
 */
export class TrackView {
  readonly step: number;
  readonly behind: number;
  readonly ahead: number;
  private readonly count: number;
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  private readonly zs: Float64Array;
  private readonly hs: Float64Array;
  private origin = 0;

  constructor(options: { step?: number; behind?: number; ahead?: number } = {}) {
    this.step = options.step ?? 2;
    this.behind = options.behind ?? 48;
    this.ahead = options.ahead ?? 300;
    this.count = Math.round((this.behind + this.ahead) / this.step) + 1;
    this.xs = new Float64Array(this.count);
    this.ys = new Float64Array(this.count);
    this.zs = new Float64Array(this.count);
    this.hs = new Float64Array(this.count);
  }

  /** Index of distance 0 (the player). */
  private get zero(): number { return Math.round(this.behind / this.step); }

  update(circuit: CircuitSpec, progress: number): void {
    this.origin = progress;
    const z0 = this.zero;
    const h = this.step;
    this.xs[z0] = 0; this.ys[z0] = 0; this.zs[z0] = 0; this.hs[z0] = 0;
    for (let i = z0 + 1; i < this.count; i += 1) {
      const sMid = progress + (i - z0 - 0.5) * h;
      const prev = this.hs[i - 1]!;
      const heading = prev + curvatureAt(circuit, sMid) * h;
      const mid = (prev + heading) * 0.5;
      this.hs[i] = heading;
      this.xs[i] = this.xs[i - 1]! + Math.sin(mid) * h;
      this.zs[i] = this.zs[i - 1]! - Math.cos(mid) * h;
      this.ys[i] = this.ys[i - 1]! + gradientAt(circuit, sMid) * h;
    }
    for (let i = z0 - 1; i >= 0; i -= 1) {
      const sMid = progress + (i - z0 + 0.5) * h;
      const next = this.hs[i + 1]!;
      const heading = next - curvatureAt(circuit, sMid) * h;
      const mid = (next + heading) * 0.5;
      this.hs[i] = heading;
      this.xs[i] = this.xs[i + 1]! - Math.sin(mid) * h;
      this.zs[i] = this.zs[i + 1]! + Math.cos(mid) * h;
      this.ys[i] = this.ys[i + 1]! - gradientAt(circuit, sMid) * h;
    }
  }

  /** Race progress the view was built at. */
  get progress(): number { return this.origin; }

  /** Pose of the road centre `d` metres ahead of the player (negative: behind), clamped to the built range. */
  sample(d: number, out: TrackPose): TrackPose {
    const f = Math.min(this.count - 1.000001, Math.max(0, (d + this.behind) / this.step));
    const i = Math.floor(f);
    const t = f - i;
    const lerp = (a: Float64Array): number => a[i]! + (a[i + 1]! - a[i]!) * t;
    out.x = lerp(this.xs); out.y = lerp(this.ys); out.z = lerp(this.zs); out.heading = lerp(this.hs);
    return out;
  }

  /** A point `lateral` metres right of the centre line and `height` above the road, `d` metres ahead. */
  place(d: number, lateral: number, height: number, out: TrackPose): TrackPose {
    this.sample(d, out);
    const c = Math.cos(out.heading), s = Math.sin(out.heading);
    out.x += c * lateral;
    out.z += s * lateral;
    out.y += height;
    return out;
  }
}
