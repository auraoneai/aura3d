/** Cross Hop — lane streamer + instanced visual pools + deterministic movers. */

import {
  COL_MAX, COL_MIN, LANE_D, STRIP_W, mulberry32, themeIndexForRow, THEMES
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

export function laneZ(row: number): number { return -row * LANE_D; }

/** Weighted type roll for a single row — consumes draw 1 of the row's rng. */
function rollLaneType(r: number, seed: number, forceTheme?: number): LaneType {
  const themeIdx = forceTheme ?? themeIndexForRow(r, seed);
  const w = THEMES[themeIdx].laneWeights;
  const rnd = mulberry32(seed * 7919 + r * 104729);
  let roll = rnd() * (w[0] + w[1] + w[2] + w[3] + w[4] + w[5]);
  const kinds: LaneType[] = ["meadow", "road", "tram", "river", "rail", "lava"];
  let type: LaneType = "meadow";
  for (let i = 0; i < 6; i++) { roll -= w[i]; if (roll <= 0) { type = kinds[i]; break; } }
  return type;
}

/**
 * Final lane type for `row` including the breathing-room rule (never three
 * non-meadow lanes in a row). Computed by a forward sequential pass O(row) —
 * NOT recursive (the naive laneFor→laneFor recursion is Fibonacci and hangs
 * the frame around row ~45).
 */
function laneTypeSeq(row: number, seed: number, forceTheme?: number): LaneType {
  let p1: LaneType = "meadow", p2: LaneType = "meadow", cur: LaneType = "meadow";
  for (let r = 2; r <= row; r++) {
    cur = (p1 !== "meadow" && p2 !== "meadow") ? "meadow" : rollLaneType(r, seed, forceTheme);
    p2 = p1; p1 = cur;
  }
  return cur;
}

/** Deterministic lane descriptor for a row (pure; caller keeps a cache). */
export function laneFor(row: number, seed: number, difficulty: number, forceTheme?: number): Lane {
  if (row <= 1) {
    return { row, type: "meadow", dir: 1, speed: 0, spacing: 8, moverKind: "none", phase: 0, theme: forceTheme ?? 0, hasCoin: false, coinCol: 0, hasPod: false, podCol: 0 };
  }
  if (row === 2) {
    return { row, type: "river", dir: 1, speed: 0.75, spacing: 5.4, moverKind: "log", phase: 14.5, theme: forceTheme ?? 0, hasCoin: true, coinCol: 0, hasPod: false, podCol: 0 };
  }
  if (row === 3) {
    return { row, type: "meadow", dir: 1, speed: 0, spacing: 8, moverKind: "none", phase: 0, theme: forceTheme ?? 0, hasCoin: false, coinCol: 0, hasPod: false, podCol: 0 };
  }
  const themeIdx = forceTheme ?? themeIndexForRow(row, seed);
  const rnd = mulberry32(seed * 7919 + row * 104729);
  const type = laneTypeSeq(row, seed, forceTheme);
  rnd(); // draw 1 is the type roll (consumed by rollLaneType semantics)
  const dir = rnd() < 0.5 ? 1 : -1;
  const diff = Math.min(1, difficulty);
  const speed = type === "road" ? (2.4 + rnd() * 3.4) * (1 + diff * 0.9)
    : type === "tram" ? (3.2 + rnd() * 2.2) * (1 + diff * 0.5)
    : type === "rail" ? (13 + rnd() * 7)
    : type === "river" ? (1.2 + rnd() * 1.6) * (1 + diff * 0.5)
    : type === "lava" ? (1.4 + rnd() * 1.8) * (1 + diff * 0.6)
    : 0;
  const spacingDraw = (type === "road" || type === "river") ? rnd() : 0;
  const kindDraw = (type === "road" || type === "river") ? rnd() : 0;
  const moverKind: Lane["moverKind"] = type === "road" ? (kindDraw < 0.72 ? "car" : "truck")
    : type === "tram" ? "tram"
    : type === "rail" ? "train"
    : type === "river" ? (kindDraw < 0.55 ? "log" : "pad")
    : type === "lava" ? "stone"
    : "none";
  const spacing = moverKind === "truck" ? Math.max(5.8, 8.2 - diff * 2.0 - spacingDraw * 1.6)
    : moverKind === "car" ? Math.max(4.2, 7.0 - diff * 2.4 - spacingDraw * 1.8)
    : type === "tram" ? Math.max(7.2, 9.5 - diff * 2.0)
    : type === "rail" ? 60
    : moverKind === "log" ? Math.max(5.6, (spacingDraw < 0.45 ? 5.8 : 6.8) - diff * 0.6)
    : moverKind === "pad" ? Math.max(2.6, (spacingDraw < 0.45 ? 3.0 : 4.2) - diff * 0.5)
    : type === "lava" ? Math.max(2.8, 3.4 - diff * 0.5)
    : 6;
  const hasCoin = type === "meadow" && row > 4 && rnd() < 0.16;
  const hasPod = type === "meadow" && row > 40 && rnd() < 0.03;
  return {
    row, type, dir, speed, spacing, moverKind, theme: themeIdx,
    phase: rnd() * 60,
    hasCoin, coinCol: Math.floor(rnd() * (COL_MAX - COL_MIN)) + COL_MIN,
    hasPod, podCol: Math.floor(rnd() * (COL_MAX - COL_MIN)) + COL_MIN
  };
}



/**
 * Drawn length (metres, along X) of each model-backed mover. core.ts passes these as `targetMaxDimension`, and
 * `moverHalf` derives its hit half-length from them, so the hitbox can never drift from the drawn model again (CH-5).
 * A train is `TRAIN_CARS` cars of `TRAIN_CAR_LENGTH` coupled end to end.
 */
export const TRAIN_CARS = 3;
export const TRAIN_CAR_LENGTH = 3.2;
export const MOVER_LENGTH = {
  car: 2.05, hatch: 1.95, suv: 2.15, taxi: 2.0, van: 2.15, pickup: 2.2, hover: 2.1,
  truck: 2.75, tram: 3.1, train: TRAIN_CARS * TRAIN_CAR_LENGTH,
  log: 3.8, pad: 0.92, stone: 1.05
} as const;
/** Slack added to half the drawn length in `moverHalf` (body overhang and wheel arches). */
export const HIT_MARGIN = 0.05;

/** Half the strip a looping mover wraps over: the strip plus the mover's own length, so it leaves the drawn strip
 *  completely before it reappears on the other side (CH-12). */
export function wrapSpan(lane: Lane): number {
  return STRIP_W + 2 * moverHalf(lane) + 2;
}

/** Mover positions for a lane at time t — writes xs[] and returns count. */
export function laneMovers(lane: Lane, t: number, xs: Float32Array): number {
  if (lane.moverKind === "train") {
    // One train per rail cycle: a warning window, then a single sweep across the whole strip (CH-4). The train
    // starts and ends beyond the strip so it never pops in or out on the visible ground.
    const cyc = railCycle(lane);
    const u = railPhase(lane, t);
    if (u > cyc.warn && u < cyc.warn + cyc.cross) {
      xs[0] = lane.dir * (-railRun(lane) / 2 + lane.speed * (u - cyc.warn));
      return 1;
    }
    return 0;
  }
  if (lane.moverKind === "none" || lane.speed === 0) return 0;
  const span = wrapSpan(lane);
  const n = Math.min(xs.length, Math.max(1, Math.round(span / lane.spacing)));
  for (let i = 0; i < n; i++) {
    const raw = lane.phase + i * lane.spacing + lane.dir * lane.speed * t;
    xs[i] = ((raw % span) + span * 1.5) % span - span / 2;
  }
  return n;
}

/** Distance a train's centre travels in one crossing: the strip plus the whole train on both ends. */
function railRun(lane: Lane): number {
  return STRIP_W + 2 * moverHalf(lane) + 4;
}

function railPhase(lane: Lane, t: number): number {
  const cyc = railCycle(lane);
  return ((t + lane.phase) % cyc.period + cyc.period) % cyc.period;
}

export function railCycle(lane: Lane): { period: number; warn: number; cross: number } {
  const cross = railRun(lane) / Math.max(1, lane.speed);
  const warn = 1.35;
  const period = Math.max(4.6, warn + cross + 2.2 - Math.min(2, lane.speed * 0.02));
  return { period, warn, cross };
}

/** Seconds of tram travel the tram warning looks ahead (CH-4). */
export const TRAM_WARN_SECONDS = 1.0;

/**
 * Crossing warning for a rail or tram lane at time t: 1 while lit, else 0.
 * - Rail: lit for the `warn` window before the train and while it crosses, so every crossing follows a warning.
 * - Tram: lit while a tram's nose will reach column x `px` within `TRAM_WARN_SECONDS`.
 */
export function railWarning(lane: Lane, t: number, px = 0): number {
  if (lane.type !== "rail" && lane.type !== "tram") return 0;
  if (lane.type === "tram") {
    const xs = railXs; const n = laneMovers(lane, t, xs);
    const half = moverHalf(lane) + 0.3;
    for (let i = 0; i < n; i++) {
      // Distance the tram's nose still has to travel to reach px: lit while that takes at most TRAM_WARN_SECONDS.
      const nose = (px - xs[i]) * lane.dir - half;
      if (nose >= 0 && nose < lane.speed * TRAM_WARN_SECONDS) return 1;
    }
    return 0;
  }
  const cyc = railCycle(lane);
  return railPhase(lane, t) < cyc.warn + cyc.cross ? 1 : 0;
}

const railXs = new Float32Array(24);

/** Half-length of a mover for platform/collision tests: half the drawn length plus `HIT_MARGIN`. Cars use the
 *  longest car model so every car pool is covered. */
export function moverHalf(lane: Lane): number {
  switch (lane.moverKind) {
    case "car": return MOVER_LENGTH.pickup / 2 + HIT_MARGIN;
    case "truck": return MOVER_LENGTH.truck / 2 + HIT_MARGIN;
    case "tram": return MOVER_LENGTH.tram / 2 + HIT_MARGIN;
    case "train": return MOVER_LENGTH.train / 2 + HIT_MARGIN;
    case "log": return MOVER_LENGTH.log / 2 - 0.05;
    case "pad": return 0.52;
    case "stone": return 0.56;
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
