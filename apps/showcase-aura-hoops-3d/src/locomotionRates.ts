/**
 * Ground speed (m/s) each athlete locomotion clip travels at playback rate 1, measured from the model's keyframes by
 * `tools/hoops-athlete-retexture/clip-stride.mjs` (planted-foot speed relative to the root). Playing a clip at
 * `groundSpeed / clipSpeed` keeps planted feet on the floor instead of skating.
 */
export const CLIP_GROUND_SPEED = { Walk_Loop: 2.51, Run: 4.49, Sprint_Loop: 5.89 } as const;

export type LocomotionClip = "Walk_Loop" | "Run" | "Sprint_Loop";
export interface LocomotionPick { readonly clip: LocomotionClip | "idle"; readonly rate: number }

const MIN_RATE = 0.3;
const MAX_RATE = 1.35;
const clampRate = (r: number) => Math.max(MIN_RATE, Math.min(MAX_RATE, r));

/** Picks the clip for a ground speed with hysteresis on the current clip, and the playback rate that matches the ground. */
export function pickLocomotion(speed: number, current: string): LocomotionPick {
  if (speed > 5.0 || (current === "Sprint_Loop" && speed > 4.4)) return { clip: "Sprint_Loop", rate: clampRate(speed / CLIP_GROUND_SPEED.Sprint_Loop) };
  if (speed > 3.0 || ((current === "Run" || current === "Sprint_Loop") && speed > 2.4)) return { clip: "Run", rate: clampRate(speed / CLIP_GROUND_SPEED.Run) };
  if (speed > 0.35 || ((current === "Walk_Loop" || current === "Run") && speed >= 0.2)) return { clip: "Walk_Loop", rate: clampRate(speed / CLIP_GROUND_SPEED.Walk_Loop) };
  return { clip: "idle", rate: 1 };
}
