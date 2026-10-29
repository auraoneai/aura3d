// Aura FC 3D — which athlete clip plays and where in the clip it is, derived from sim state only.
//
// Phase is driven explicitly (the default animation path samples a clip at `app time - startTime` and ignores
// `speed`), so:
//  * kicks play KickTap/KickPass/KickShot with phase = swing progress: the boot is at the ball on the exact frame
//    the sim launches it (KICK_CONTACT_FRAC) and a hit-stop freezes the swing with the sim;
//  * run cycles advance with distance travelled, so a planted foot stays planted at any ground speed.
// Constants below are measured from the GLBs by tools/aura-fc/clip-metrics.mjs and bake-kick.mjs.

import type { PlayerState } from "./types";

export const CLIP_SECONDS: Readonly<Record<string, number>> = {
  Ready: 1.8, Walk_Loop: 0.8, Run: 0.56, Sprint_Loop: 0.48, Jump_Loop: 0.64, Attack: 0.6,
  KickTap: 0.6, KickPass: 0.6, KickShot: 0.6
};

/** Planted-foot backward speed in model units/s at playback rate 1 (tools/aura-fc/clip-metrics.mjs). */
export const STANCE_SPEED_MODEL: Readonly<Record<string, number>> = { Walk_Loop: 2.3483, Run: 4.465, Sprint_Loop: 5.8429 };

/** sim.ts advances `gait` by speed * dt * GAIT_PER_METRE. */
export const GAIT_PER_METRE = 1.35;
export const SLIDE_SECONDS = 0.55;
export const DIVE_SECONDS = 0.72;

const IDLE_DOWN = 0.25, IDLE_UP = 0.45, WALK_TO_RUN = 2.6, RUN_TO_WALK = 2.2, RUN_TO_SPRINT = 6.0, SPRINT_TO_RUN = 5.6;

/** Player Studio celebration ids in `celebrateKind` order. */
export const CELEBRATIONS = ["knee", "spin", "leap", "heart"] as const;

export type LocoClip = "Ready" | "Walk_Loop" | "Run" | "Sprint_Loop";

export interface AthleteAnimation {
  readonly clip: string;
  readonly phase: number;        // seconds into the clip
  readonly duration: number;
  readonly loop: boolean;
}

/** model scale = rendered height / authored height (rig.ts `targetHeight` over the GLB's bounds). */
export function athleteModelScale(id: string, boundsHeight: number): number {
  const isKeeper = id.endsWith("-gk");
  const isPower = isKeeper || id.endsWith("-df0") || id.endsWith("-df1");
  const target = isKeeper ? 2.32 : isPower ? 2.26 : 2.22;
  return target / boundsHeight;
}

export function pickLocomotion(speed: number, previous: LocoClip): LocoClip {
  if (previous === "Ready") {
    if (speed < IDLE_UP) return "Ready";
  } else if (speed < IDLE_DOWN) return "Ready";
  const from: LocoClip = previous === "Ready" ? "Walk_Loop" : previous;
  if (from === "Walk_Loop") return speed >= WALK_TO_RUN ? "Run" : "Walk_Loop";
  if (from === "Run") return speed >= RUN_TO_SPRINT ? "Sprint_Loop" : speed < RUN_TO_WALK ? "Walk_Loop" : "Run";
  return speed < SPRINT_TO_RUN ? "Run" : "Sprint_Loop";
}

export function kickClipFor(power: number): "KickTap" | "KickPass" | "KickShot" {
  return power < 0.4 ? "KickTap" : power < 0.75 ? "KickPass" : "KickShot";
}

const wrap = (v: number, d: number) => ((v % d) + d) % d;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Clip + phase for one athlete. `loco` carries the hysteresis state between frames. */
export function athleteAnimation(
  p: Pick<PlayerState, "speed" | "gait" | "kickT" | "kickDur" | "kickPower" | "slideT" | "diveT" | "celebrateT" | "isKeeper"> & { readonly celebrateKind?: number },
  now: number,
  modelScale: number,
  loco: LocoClip,
  phaseOffset = 0
): { readonly anim: AthleteAnimation; readonly loco: LocoClip } {
  if (p.diveT > 0 && p.isKeeper) {
    const d = CLIP_SECONDS.Jump_Loop!;
    return { anim: { clip: "Jump_Loop", phase: clamp01(1 - p.diveT / DIVE_SECONDS) * d, duration: d, loop: false }, loco };
  }
  if (p.slideT > 0) {
    const d = CLIP_SECONDS.Attack!;
    return { anim: { clip: "Attack", phase: clamp01(1 - p.slideT / SLIDE_SECONDS) * d, duration: d, loop: false }, loco };
  }
  if (p.celebrateT > 0.2) {
    // CELEBRATIONS order (Player Studio): 0 knee slide, 1 aircraft spin, 2 fist-leap, 3 hands heart
    const kind = p.celebrateKind ?? 2;
    if (kind === 0) {
      // knee slide: the low lunge of the slide clip, held
      const d = CLIP_SECONDS.Attack!;
      return { anim: { clip: "Attack", phase: d * 0.72, duration: d, loop: false }, loco };
    }
    if (kind === 3) {
      const d = CLIP_SECONDS.Ready!;
      return { anim: { clip: "Ready", phase: wrap(now, d), duration: d, loop: true }, loco };
    }
    // spin (rig.ts turns the body) and leap both bounce on the jump loop
    const d = CLIP_SECONDS.Jump_Loop!;
    return { anim: { clip: "Jump_Loop", phase: wrap(now * (kind === 1 ? 1.0 : 1.35), d), duration: d, loop: true }, loco };
  }
  if (p.kickT > 0.02) {
    const clip = kickClipFor(p.kickPower);
    const d = CLIP_SECONDS[clip]!;
    const dur = p.kickDur > 0.05 ? p.kickDur : 0.32;
    return { anim: { clip, phase: clamp01(1 - p.kickT / dur) * d, duration: d, loop: false }, loco };
  }
  const next = pickLocomotion(p.speed, loco);
  if (next === "Ready") {
    const d = CLIP_SECONDS.Ready!;
    return { anim: { clip: "Ready", phase: wrap(now + phaseOffset, d), duration: d, loop: true }, loco: next };
  }
  const d = CLIP_SECONDS[next]!;
  const metres = p.gait / GAIT_PER_METRE;
  return { anim: { clip: next, phase: wrap(metres / (STANCE_SPEED_MODEL[next]! * modelScale), d), duration: d, loop: true }, loco: next };
}

/* ---- Touchline referee ---- */

/** Patrol half-length (m) and angular rate (rad/s): peak pace 10.5 * 0.22 = 2.31 m/s, about Walk_Loop at rate 1. */
export const REFEREE_PATROL_HALF = 10.5;
export const REFEREE_PATROL_RATE = 0.22;

/**
 * Referee patrol x, facing and Walk_Loop phase at app time `t`. x = A sin(w t); the clip phase advances with the
 * distance walked (the total variation of x, closed form per quarter period), so the planted foot stays planted
 * through the slow-down at each end instead of the clip playing at rate 1 while the body slides.
 */
export function refereePatrol(t: number, modelScale: number): { x: number; yaw: number; clip: "Walk_Loop"; phase: number; duration: number } {
  const a = REFEREE_PATROL_HALF, u = REFEREE_PATROL_RATE * t;
  const quarter = Math.floor(u / (Math.PI / 2));
  const metres = a * (quarter + Math.abs(Math.sin(u) - Math.sin(quarter * Math.PI / 2)));
  const d = CLIP_SECONDS.Walk_Loop!;
  return {
    x: a * Math.sin(u),
    yaw: Math.cos(u) >= 0 ? Math.PI / 2 : -Math.PI / 2,
    clip: "Walk_Loop",
    phase: wrap(metres / (STANCE_SPEED_MODEL.Walk_Loop! * modelScale), d),
    duration: d
  };
}
