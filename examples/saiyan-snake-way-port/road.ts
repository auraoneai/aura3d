/**
 * The snake's road: the original's frame integration (`XA` / `ZA` / `At`) and the ribbon mesh built
 * from it. The simulation only needs the road's per-sample `gap` flag (see `sim.ts`); this module is
 * what the renderer needs on top: position, tangent, up and side at every 3 m sample.
 */
import {
  LANE_WIDTH, ROAD_BEHIND, ROAD_HALF_WIDTH, ROAD_LENGTH, ROAD_TAIL, ROLL_SECTIONS, SAMPLE_SPACING, TWO_PI, clamp, lerp, rollAt, sampleGap, smooth, stageAt
} from "./sim";

export type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const addScaled = (a: V3, b: V3, k: number): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** Rodrigues rotation of `v` about unit `axis`. */
function rotate(v: V3, axis: V3, angle: number): V3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  const d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
  const x = cross(axis, v);
  return [v[0] * c + x[0] * s + axis[0] * d * (1 - c), v[1] * c + x[1] * s + axis[1] * d * (1 - c), v[2] * c + x[2] * s + axis[2] * d * (1 - c)];
}

// ---- noise (the original's `_`, `AA`, `tA`) ----------------------------------------------------

const h1 = (x: number): number => {
  const t = 43758.5453 * Math.sin(127.1 * x);
  return t - Math.floor(t);
};
const vnoise = (x: number): number => {
  const t = Math.floor(x), e = x - t;
  return lerp(h1(t), h1(t + 1), smooth(e));
};
const fbm1 = (x: number): number => 0.6 * vnoise(x) + 0.28 * vnoise(2.3 * x + 11.7) + 0.12 * vnoise(5.1 * x + 41.3);

/** The original's `No`: yaw rate at `s`. */
function yawAt(s: number): number {
  const stage = stageAt(s);
  const turn = stage.turnRate === undefined ? 1 : stage.turnRate;
  return ((fbm1(9e-4 * s * turn) - 0.5) * stage.curve + (fbm1(42e-4 * s * turn + 7) - 0.5) * stage.curve * 0.35) * (0.34 + 0.66 * smooth(clamp(s / (0.34 * ROAD_LENGTH), 0, 1)));
}

/** The original's `zo`: banking into the turn. */
function bankAt(s: number): number {
  const bank = stageAt(s).bank ?? 0;
  return bank ? clamp(yawAt(s) / 0.019, -1, 1) * bank * 0.42 : 0;
}

function rollSection(s: number): { roll: number; intensity: number } {
  const info = rollAt(s);
  if (!info.active) return { roll: 0, intensity: 0 };
  const section = ROLL_SECTIONS.find((x) => s >= x.from && s <= x.from + x.len);
  if (!section) return { roll: 0, intensity: 0 };
  const e = clamp((s - section.from) / section.len, 0, 1);
  return { roll: section.dir * TWO_PI * smooth(e), intensity: Math.sin(e * Math.PI) ** 2 };
}

export interface RoadSample {
  s: number;
  p: V3;
  F: V3;
  U: V3;
  R: V3;
  roll: number;
  gap: boolean;
  girth: number;
  tip: number;
}

const START_BLEND = -18 + 34 - 3 + 26; // `Ws + 26`: no yaw/pitch while the road is still the check-in strip

/** Integrates the whole outbound road once: samples every 3 m from -150 to the tail. */
export function buildRoadSamples(): RoadSample[] {
  const samples: RoadSample[] = [];
  let F: V3 = [0, 0, -1];
  let U: V3 = [0, 1, 0];
  let P: V3 = [0, 0, 0];
  for (let s = -ROAD_BEHIND; s <= ROAD_LENGTH + ROAD_TAIL; s += SAMPLE_SPACING) {
    const stage = stageAt(s);
    const rs = rollSection(s);
    const yaw = yawAt(s);
    const pitch = ((fbm1(14e-4 * s + 41) - 0.5) * stage.pitch + (fbm1(55e-4 * s + 13) - 0.5) * stage.pitch * 0.4) * (0.45 + 0.55 * smooth(clamp(s / (0.3 * ROAD_LENGTH), 0, 1))) + (s > ROAD_LENGTH ? 55e-4 : 0);
    const roll = rs.roll + bankAt(s);
    const girthBase = stage.girth;
    const girth = lerp(girthBase, Math.min(girthBase, 0.78), rs.intensity);
    const hold = s < START_BLEND;
    const n: V3 = norm(cross(F, U));
    if (yaw && !hold) F = rotate(F, U, yaw * SAMPLE_SPACING);
    if (pitch && !hold) F = rotate(F, n, pitch * SAMPLE_SPACING);
    F = norm(F);
    const side = cross(F, [0, 1, 0]);
    if (len(side) ** 2 > 1e-5) U = norm(cross(norm(side), F));
    P = addScaled(P, F, SAMPLE_SPACING);
    const a = clamp(P[1] / 30, -1, 1);
    if (Math.abs(a) > 0.3) F = norm(rotate(F, n, 3e-3 * -a * SAMPLE_SPACING));
    const Ur = rotate(U, F, roll);
    const R = norm(cross(F, Ur));
    samples.push({ s, p: [...P], F: [...F], U: Ur, R, roll, gap: sampleGap(s), girth, tip: Math.sqrt(Math.max(0, 1 - Math.pow(1 - clamp((ROAD_LENGTH + ROAD_TAIL - s) / ROAD_TAIL, 0, 1), 2))) });
  }
  return samples;
}

export interface RoadFrame {
  p: V3;
  F: V3;
  U: V3;
  R: V3;
  gap: boolean;
  girth: number;
}

/** The original's `At(s)`: lerp between neighbouring samples; the `gap` flag follows the nearer sample. */
export function frameAt(samples: readonly RoadSample[], s: number): RoadFrame {
  const first = samples[0] as RoadSample;
  const index = clamp(Math.floor((s - first.s) / SAMPLE_SPACING), 0, samples.length - 2);
  const a = samples[index] as RoadSample, b = samples[index + 1] as RoadSample;
  const t = clamp((s - a.s) / SAMPLE_SPACING, 0, 1);
  const p: V3 = [lerp(a.p[0], b.p[0], t), lerp(a.p[1], b.p[1], t), lerp(a.p[2], b.p[2], t)];
  const F = norm([lerp(a.F[0], b.F[0], t), lerp(a.F[1], b.F[1], t), lerp(a.F[2], b.F[2], t)]);
  let U = norm([lerp(a.U[0], b.U[0], t), lerp(a.U[1], b.U[1], t), lerp(a.U[2], b.U[2], t)]);
  const R = norm(cross(F, U));
  U = norm(cross(R, F));
  return { p, F, U, R, gap: t < 0.5 ? a.gap : b.gap, girth: lerp(a.girth, b.girth, t) };
}

// ---- ribbon mesh -------------------------------------------------------------------------------

/** The snake's cross-section (the original's `HA`): x across, y up; the walkable top is |x| <= 3.6 at y ~ 0.48. */
export const PROFILE: readonly (readonly [number, number])[] = [
  [0, -16.4], [-5, -14.6], [-8.5, -10], [-9.4, -4.8], [-8.2, -1.3], [-5.6, 0.1], [-4.55, 1.32], [-3.6, 0.3], [-1.8, 0.44], [0, 0.48],
  [1.8, 0.44], [3.6, 0.3], [4.55, 1.32], [5.6, 0.1], [8.2, -1.3], [9.4, -4.8], [8.5, -10], [5, -14.6]
];

export interface RoadMesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export function buildRoadMesh(samples: readonly RoadSample[], step = 1): RoadMesh {
  const ring = PROFILE.length;
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const outward = PROFILE.map((cur, i) => {
    const prev = PROFILE[(i - 1 + ring) % ring] as readonly [number, number];
    const next = PROFILE[(i + 1) % ring] as readonly [number, number];
    const a = [cur[1] - prev[1], -(cur[0] - prev[0])] as const;
    const b = [next[1] - cur[1], -(next[0] - cur[0])] as const;
    const x = a[0] + b[0], y = a[1] + b[1];
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l] as const;
  });
  const kept: RoadSample[] = [];
  for (let i = 0; i < samples.length; i += step) kept.push(samples[i] as RoadSample);
  kept.forEach((sm) => {
    const scale = sm.girth * Math.max(sm.tip, 0.02);
    for (let k = 0; k < ring; k++) {
      const pt = PROFILE[k] as readonly [number, number];
      const o = outward[k] as readonly [number, number];
      const p = addScaled(addScaled(sm.p, sm.R, pt[0] * scale), sm.U, pt[1] * scale);
      const n = norm([sm.R[0] * o[0] + sm.U[0] * o[1], sm.R[1] * o[0] + sm.U[1] * o[1], sm.R[2] * o[0] + sm.U[2] * o[1]]);
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
      uvs.push(k / ring, sm.s / 10);
    }
  });
  for (let i = 0; i < kept.length - 1; i++) {
    const a = kept[i] as RoadSample, b = kept[i + 1] as RoadSample;
    if (a.gap || b.gap) continue; // a missing plate is a hole in the road (the walkable top and the body under it)
    for (let k = 0; k < ring; k++) {
      const k2 = (k + 1) % ring;
      const i00 = i * ring + k, i01 = i * ring + k2, i10 = (i + 1) * ring + k, i11 = (i + 1) * ring + k2;
      indices.push(i00, i10, i01, i01, i10, i11);
    }
  }
  return { positions, normals, uvs, indices };
}

/** Lateral offset to world position on the road at `s`: the original's `p + R*laneX + U*(tilt(laneX) + height)`. */
export function onRoad(frame: RoadFrame, laneX: number, height: number): V3 {
  const t = clamp(Math.abs(laneX) / (ROAD_HALF_WIDTH / 2), 0, 1);
  const lift = 0.48 - 0.18 * t * t;
  return addScaled(addScaled(frame.p, frame.R, laneX), frame.U, lift + height);
}

export const lanePosition = (lane: number): number => lane * LANE_WIDTH;
export { sub };
