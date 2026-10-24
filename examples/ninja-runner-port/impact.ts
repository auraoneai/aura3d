/**
 * Obstacle impact feedback for the reworked contact rules: per-tier settings for the library impact feedback
 * (`createImpactFeedback`: hit-stop, camera shake, cue) plus dust, and the debris physics that breaks a crate or beam into flying pieces. Pure and deterministic (the
 * scatter comes from a hash of the entity id), no DOM and no engine imports, so it is unit-tested directly.
 *
 * Debris lives in course coordinates: `ds` along the course from the obstacle, `lx` metres across it, `h` height
 * above the ground. The renderer maps those through the course's ground frame.
 */
import type { RamTier } from "./sim";

/** Impact tiers plus `smash`: a crate broken by an attack or a dash (the sim's `break` event). */
export type DebrisTier = RamTier | "smash";

export interface TierFeedback {
  /** Cue played by the library impact feedback (`audio.play` name). */
  readonly cue: "ramBump" | "ramCrash" | "crate" | "crateSmash";
  /** Impact speed (m/s) that maps to full feedback strength in `createImpactFeedback`: lower means a stronger feel. */
  readonly fullSpeed: number;
  /** Hit-stop range in milliseconds, from the softest to the hardest hit of this tier. */
  readonly hitStopMs: readonly [number, number];
  readonly dust: number;
  /** Debris launch: forward speed range, upward speed range, sideways spread, spin (rad/s). */
  readonly forward: readonly [number, number];
  readonly up: readonly [number, number];
  readonly spread: number;
  readonly spin: number;
}

export const TIER_FEEDBACK: Readonly<Record<DebrisTier, TierFeedback>> = Object.freeze({
  glance: { cue: "crate", fullSpeed: 120, hitStopMs: [0, 20], dust: 10, forward: [2, 4], up: [2, 3.5], spread: 1.2, spin: 4 },
  bump: { cue: "ramBump", fullSpeed: 40, hitStopMs: [30, 70], dust: 18, forward: [1.2, 3], up: [2.2, 3.6], spread: 1.4, spin: 5 },
  crash: { cue: "ramCrash", fullSpeed: 28, hitStopMs: [60, 110], dust: 34, forward: [6, 10], up: [4, 6.5], spread: 3, spin: 10 },
  smash: { cue: "crateSmash", fullSpeed: 90, hitStopMs: [25, 45], dust: 26, forward: [13, 19], up: [5, 8], spread: 4, spin: 12 }
});

export type PieceKind = "plank" | "strap" | "beam";

export interface Piece {
  kind: PieceKind;
  ds: number; lx: number; h: number;
  vds: number; vlx: number; vh: number;
  yaw: number; pitch: number; roll: number;
  wyaw: number; wpitch: number; wroll: number;
  /** Box extents (x across, y thick, z along) in metres. */
  size: readonly [number, number, number];
  age: number;
  life: number;
  /** Course distance and lane offset of the obstacle this piece came from. */
  s: number; lane: number;
}

export const GRAVITY = 19;
export const PIECE_LIFE = 3.4;
export const PIECE_FADE = 0.6;
const FLOOR_BOUNCE = 0.32;
const GROUND_DRAG = 3.2;

/** Deterministic value in [0, 1) from integers. */
export function hash01(a: number, b: number): number {
  let h = (Math.imul(a | 0, 2654435761) ^ Math.imul((b + 0x9e3779b9) | 0, 2246822519)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const range = (r: readonly [number, number], t: number): number => r[0] + (r[1] - r[0]) * t;

/** Pieces for one obstacle: a crate is six planks and two straps, a beam two halves and a splinter. */
export function spawnPieces(kind: "barrier" | "beam", tier: DebrisTier, entity: number, s: number, lane: number): Piece[] {
  const f = TIER_FEEDBACK[tier];
  const out: Piece[] = [];
  const make = (i: number, pk: PieceKind, size: readonly [number, number, number], ds: number, lx: number, h: number): void => {
    const r = (n: number): number => hash01(entity * 31 + i, n);
    out.push({
      kind: pk, ds, lx, h,
      vds: range(f.forward, r(1)),
      vlx: (r(2) - 0.5) * 2 * f.spread + (lx > 0 ? 0.4 : -0.4),
      vh: range(f.up, r(3)),
      yaw: 0, pitch: 0, roll: 0,
      wyaw: (r(4) - 0.5) * 2 * f.spin, wpitch: (r(5) - 0.5) * 2 * f.spin, wroll: (r(6) - 0.5) * 2 * f.spin,
      size, age: 0, life: PIECE_LIFE, s, lane
    });
  };
  if (kind === "barrier") {
    for (let i = 0; i < 6; i++) make(i, "plank", [0.34, 0.2, 0.55], 0, -0.85 + i * 0.34, 0.2 + (i % 3) * 0.45);
    make(6, "strap", [1.0, 0.1, 0.5], 0, -0.5, 0.45);
    make(7, "strap", [1.0, 0.1, 0.5], 0, 0.5, 0.45);
  } else {
    make(0, "beam", [1.2, 0.3, 0.3], 0, -0.6, 1.1);
    make(1, "beam", [1.2, 0.3, 0.3], 0, 0.6, 1.1);
    make(2, "beam", [0.5, 0.16, 0.16], 0, 0, 1.2);
  }
  return out;
}

/** Advance debris by `dt`: gravity, a damped ground bounce, ground drag and spin; returns the pieces still alive. */
export function stepPieces(pieces: Piece[], dt: number): Piece[] {
  const drag = Math.exp(-GROUND_DRAG * dt);
  for (const p of pieces) {
    p.age += dt;
    p.vh -= GRAVITY * dt;
    p.ds += p.vds * dt; p.lx += p.vlx * dt; p.h += p.vh * dt;
    p.yaw += p.wyaw * dt; p.pitch += p.wpitch * dt; p.roll += p.wroll * dt;
    const floor = p.size[1] / 2;
    if (p.h < floor) {
      p.h = floor;
      p.vh = p.vh < -1 ? -p.vh * FLOOR_BOUNCE : 0;
      p.vds *= drag; p.vlx *= drag; p.wyaw *= drag; p.wpitch *= drag; p.wroll *= drag;
    }
  }
  return pieces.filter((p) => p.age < p.life);
}

/** Visible scale of a piece: 1 while alive, shrinking to 0 over the last `PIECE_FADE` seconds. */
export const pieceScale = (p: Piece): number => Math.max(0, Math.min(1, (p.life - p.age) / PIECE_FADE));
