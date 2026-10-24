/**
 * Presentation helpers (pure): the simulation runs at a fixed 60 Hz while the screen refreshes at 60, 120 or
 * 144 Hz, so the renderer blends the last two simulation samples instead of drawing whichever step ran last.
 * Without this the runner, its run cycle and the chase camera advance on some frames and stand still on
 * others (visible as shaking and bouncing on a high-refresh display).
 */
import type { V3 } from "./road";

/** The part of the run state the renderer blends. */
export interface PresentSample {
  readonly phase: string;
  readonly s: number;
  readonly laneX: number;
  readonly y: number;
  readonly laneVel: number;
}

export const sampleOf = (S: PresentSample): PresentSample => ({ phase: S.phase, s: S.s, laneX: S.laneX, y: S.y, laneVel: S.laneVel });

/** Largest per-step travel still blended; anything bigger is a restart or a phase jump and snaps. */
const SNAP_DISTANCE = 8;

const mix = (a: number, b: number, k: number): number => a + (b - a) * k;

/**
 * `prev` and `cur` blended `t` (0..1) of the way, for `createRenderInterpolator` from `@aura3d/engine/game`.
 * Snaps to `cur` on a phase change, a restart or a jump, so those never smear across frames.
 */
export function blendSamples(prev: PresentSample, cur: PresentSample, t: number): PresentSample {
  const ds = cur.s - prev.s;
  if (prev.phase !== cur.phase || ds < 0 || ds > SNAP_DISTANCE) return cur;
  return { phase: cur.phase, s: mix(prev.s, cur.s, t), laneX: mix(prev.laneX, cur.laneX, t), y: mix(prev.y, cur.y, t), laneVel: mix(prev.laneVel, cur.laneVel, t) };
}

/** `S` with the blended fields drawn instead of the simulated ones. */
export const withSample = <T extends PresentSample>(S: T, sample: PresentSample): T => ({ ...S, s: sample.s, laneX: sample.laneX, y: sample.y, laneVel: sample.laneVel });

/** Run-cycle phase: advances with distance covered, or slowly while standing still. */
export const advanceRunPhase = (phase: number, ds: number, dt: number): number => phase + (ds > 1e-5 ? ds * 0.62 : dt * 2.5);

export interface ChaseRig {
  f: V3;
  u: V3;
}

const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Exponential follow of the road's forward and up vectors; the first call snaps. */
export function stepChaseRig(rig: ChaseRig | null, forward: V3, up: V3, dt: number): ChaseRig {
  const u = norm3(up);
  if (!rig) return { f: [forward[0], forward[1], forward[2]], u };
  const k = 1 - Math.exp(-dt * 6);
  const lerp3 = (a: V3, b: V3): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  return { f: norm3(lerp3(rig.f, forward)), u: norm3(lerp3(rig.u, u)) };
}
