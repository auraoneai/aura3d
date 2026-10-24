/** Stride-synced gait for the hero: clip choice with hysteresis and a playback rate that makes the planted foot move at ground speed. */

export type Gait = "Idle" | "Walk" | "Run";

/** World units per second the planted foot travels at playback rate 1, from forward kinematics of hero.glb at the placed 2.9 height. */
export const STRIDE_SPEED: Readonly<Record<"Walk" | "Run", number>> = { Walk: 2.315, Run: 5.586 };
export const CLIP_SECONDS: Readonly<Record<Gait, number>> = { Walk: 1.0667, Run: 0.6667, Idle: 4.0333 };

const WALK_ON = 0.4;
const WALK_OFF = 0.25;
const RUN_ON = 4.6;
const RUN_OFF = 4.0;
const RATE_MIN = 0.6;
const RATE_MAX = 1.7;

/** Pick the gait for a ground speed (world units per second); airborne holds the run clip. */
export function pickGait(prev: Gait, groundSpeed: number, airborne: boolean): Gait {
  if (airborne) return "Run";
  if (prev === "Run" ? groundSpeed >= RUN_OFF : groundSpeed >= RUN_ON) return "Run";
  if (prev !== "Idle" ? groundSpeed >= WALK_OFF : groundSpeed >= WALK_ON) return "Walk";
  return "Idle";
}

/** Playback rate that keeps the planted foot at ground speed; idle and airborne play at 1. */
export function playbackRate(gait: Gait, groundSpeed: number, airborne: boolean): number {
  if (gait === "Idle" || airborne) return 1;
  const rate = groundSpeed / STRIDE_SPEED[gait];
  return Math.min(RATE_MAX, Math.max(RATE_MIN, rate));
}

/** Planted-foot slide in world units per second for a gait at a ground speed (0 when the rate is unclamped). */
export function footSlide(gait: Gait, groundSpeed: number, airborne = false): number {
  if (gait === "Idle" || airborne) return gait === "Idle" ? groundSpeed : 0;
  return Math.abs(groundSpeed - STRIDE_SPEED[gait] * playbackRate(gait, groundSpeed, false));
}

/** Quantise a rate so the clip is only re-issued when the speed has really changed. */
export function quantiseRate(rate: number): number {
  return Math.round(rate * 20) / 20;
}
