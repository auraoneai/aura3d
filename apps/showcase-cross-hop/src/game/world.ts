/** Cross Hop — lane streamer + instanced visual pools + deterministic movers. */

import {
  COL_MAX, COL_MIN, COL_W, FIELD_HALF, LANE_D, STRIP_W, mulberry32, themeIndexForRow, THEMES
} from "./themes";
import type { LaneType } from "./themes";

export interface Lane {
  readonly row: number;
  readonly type: LaneType;
  readonly dir: 1 | -1;
  readonly speed: number;       // m/s movers travel
  readonly spacing: number;     // mean metres between movers
  readonly moverKind: "car" | "truck" | "tram" | "train" | "log" | "pad" | "stone" | "none";
  readonly phase: number;       // seed offset
  readonly theme: number;       // THEMES index
  readonly hasCoin: boolean;
  readonly coinCol: number;
  readonly hasPod: boolean;
  readonly podCol: number;
}

const ROW_AHEAD = 26;
const ROW_BEHIND = 8;

export function laneZ(row: number): number { return -row * LANE_D; }

/** Deterministic lane descriptor for a row (pure; caller keeps a cache). */
export function laneFor(row: number, seed: number, difficulty: number, forceTheme?: number): Lane {
  if (row <= 1) {
    return { row, type: "meadow", dir: 1, speed: 0, spacing: 8, moverKind: "none", phase: 0, theme: forceTheme ?? 0, hasCoin: false, coinCol: 0, hasPod: false, podCol: 0 };
  }
  const themeIdx = forceTheme ?? themeIndexForRow(row, seed);
  const th = THEMES[themeIdx];
  const rnd = mulberry32(seed * 7919 + row * 104729);
  // forbid stacking >2 of same hard type
  const prev = row > 1 ? laneTypeOnly(row - 1, seed, difficulty, forceTheme) : "meadow";
  const prev2 = row > 2 ? laneTypeOnly(row - 2, seed, difficulty, forceTheme) : "meadow";
  let type: LaneType;
  if (prev === prev2 && prev !== "meadow") {
    type = "meadow";
  } else {
    const w = th.laneWeights;
    let roll = rnd() * (w[0] + w[1] + w[2] + w[3] + w[4] + w[5]);
    type = "meadow";
    const kinds: LaneType[] = ["meadow", "road", "tram", "river", "rail", "lava"];
    for (let i = 0; i < 6; i++) { roll -= w[i]; if (roll <= 0) { type = kinds[i]; break; } }
  }
  const dir = rnd() < 0.5 ? 1 : -1;
  const diff = Math.min(1, difficulty);
  const speed = type === "road" ? (2.4 + rnd() * 3.4) * (1 + diff * 0.9)
    : type === "tram" ? (3.2 + rnd() * 2.2) * (1 + diff * 0.5)
    : type === "rail" ? (13 + rnd() * 7)
    : type === "river" ? (1.2 + rnd() * 1.6) * (1 + diff * 0.5)
    : type === "lava" ? (1.4 + rnd() * 1.8) * (1 + diff * 0.6)
    : 0;
  const spacing = type === "road" ? Math.max(2.4, 6.5 - diff * 3 - rnd() * 2)
    : type === "tram" ? 9 - diff * 2
    : type === "rail" ? 60
    : type === "river" ? (rnd() < 0.45 ? 3.4 : 5.2) - diff * 0.8
    : type === "lava" ? 3.2 - diff * 0.6
    : 6;
  const moverKind: Lane["moverKind"] = type === "road" ? (rnd() < 0.72 ? "car" : "truck")
    : type === "tram" ? "tram"
    : type === "rail" ? "train"
    : type === "river" ? (rnd() < 0.55 ? "log" : "pad")
    : type === "lava" ? "stone"
    : "none";
  const hasCoin = type === "meadow" && row > 4 && rnd() < 0.16;
  const hasPod = type === "meadow" && row > 40 && rnd() < 0.03;
  return {
    row, type, dir, speed, spacing, moverKind, theme: themeIdx,
    phase: rnd() * 60,
    hasCoin, coinCol: Math.floor(rnd() * (COL_MAX - COL_MIN)) + COL_MIN,
    hasPod, podCol: Math.floor(rnd() * (COL_MAX - COL_MIN)) + COL_MIN
  };
}

function laneTypeOnly(row: number, seed: number, difficulty: number, forceTheme?: number): LaneType {
  // cheap re-derivation of just the type (weights re-rolled identically)
  return laneFor(row, seed, difficulty, forceTheme).type;
}

/** Mover positions for a lane at time t — writes xs[] and returns count. */
export function laneMovers(lane: Lane, t: number, xs: Float32Array): number {
  if (lane.moverKind === "none" || lane.speed === 0) {
    if (lane.type === "rail") {
      // train: single sweep per cycle — active only during cross window
      const cyc = railCycle(lane);
      const u = ((t + lane.phase) % cyc.period + cyc.period) % cyc.period;
      if (u > cyc.warn && u < cyc.warn + cyc.cross) {
        xs[0] = lane.dir * (-FIELD_HALF - 12 + lane.speed * (u - cyc.warn));
        return 1;
      }
    }
    return 0;
  }
  const span = FIELD_HALF * 2 + 8;
  const n = Math.min(xs.length, Math.max(1, Math.round(span / lane.spacing)));
  for (let i = 0; i < n; i++) {
    const raw = lane.phase + i * lane.spacing + lane.dir * lane.speed * t;
    xs[i] = ((raw % span) + span * 1.5) % span - span / 2;
  }
  return n;
}

export function railCycle(lane: Lane): { period: number; warn: number; cross: number } {
  const cross = (FIELD_HALF * 2 + 24) / Math.max(1, lane.speed);
  const warn = 1.35;
  const period = Math.max(4.6, warn + cross + 2.2 - Math.min(2, lane.speed * 0.02));
  return { period, warn, cross };
}

export function railWarning(lane: Lane, t: number): number {
  if (lane.type !== "rail" && lane.type !== "tram") return 0;
  if (lane.type === "tram") {
    const xs = railXs; const n = laneMovers(lane, t, xs);
    for (let i = 0; i < n; i++) if (Math.abs(xs[i]) < FIELD_HALF + 4) return 0;
    return 1; // no tram near — no flash
  }
  const cyc = railCycle(lane);
  const u = ((t + lane.phase) % cyc.period + cyc.period) % cyc.period;
  return u < cyc.warn ? 1 : 0;
}

const railXs = new Float32Array(4);

/** Half-length of a mover for platform/collision tests. */
export function moverHalf(lane: Lane): number {
  switch (lane.moverKind) {
    case "car": return 1.0;
    case "truck": return 1.6;
    case "tram": return 2.3;
    case "train": return 6.0;
    case "log": return 2.0;
    case "pad": return 0.62;
    case "stone": return 0.72;
    default: return 0;
  }
}

// ---------- matrix buffer helpers (no per-frame alloc) ----------
export function writeMat(dst: Float32Array, i: number, x: number, y: number, z: number,
  sx: number, sy: number, sz: number, ry = 0): void {
  const o = i * 16;
  const c = Math.cos(ry), s = Math.sin(ry);
  dst[o] = c * sx; dst[o + 1] = 0; dst[o + 2] = -s * sx; dst[o + 3] = 0;
  dst[o + 4] = 0; dst[o + 5] = sy; dst[o + 6] = 0; dst[o + 7] = 0;
  dst[o + 8] = s * sz; dst[o + 9] = 0; dst[o + 10] = c * sz; dst[o + 11] = 0;
  dst[o + 12] = x; dst[o + 13] = y; dst[o + 14] = z; dst[o + 15] = 1;
}

export function writeColor(dst: Float32Array, i: number, hex: string): void {
  const v = parseInt(hex.slice(1), 16);
  dst[i * 3] = ((v >> 16) & 255) / 255;
  dst[i * 3 + 1] = ((v >> 8) & 255) / 255;
  dst[i * 3 + 2] = (v & 255) / 255;
}
