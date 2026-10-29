/** The hero's gait table for the library's `createLocomotion`: planted-foot speed and cycle length per clip. */
import type { LocomotionGait } from "@aura3d/engine/game";

export type Gait = "Idle" | "Walk" | "Run";

/** World units per second the planted foot travels at playback rate 1, from forward kinematics of hero.glb at the placed 2.9 height. */
export const STRIDE_SPEED: Readonly<Record<"Walk" | "Run", number>> = { Walk: 2.315, Run: 5.586 };
export const CLIP_SECONDS: Readonly<Record<Gait, number>> = { Walk: 1.0667, Run: 0.6667, Idle: 4.0333 };

export const HERO_GAITS: readonly LocomotionGait[] = [
  { name: "Idle", speed: 0, cycle: CLIP_SECONDS.Idle },
  { name: "Walk", speed: STRIDE_SPEED.Walk, cycle: CLIP_SECONDS.Walk },
  { name: "Run", speed: STRIDE_SPEED.Run, cycle: CLIP_SECONDS.Run }
];

/** Ground distance between two footfalls of the Walk clip (two contacts per cycle); the clip's rate follows ground speed, so this holds at any walking speed. */
export const FOOTFALL_SPACING = (STRIDE_SPEED.Walk * CLIP_SECONDS.Walk) / 2;
/** `sim.ts` adds distance / 2.2 to `stride`; this is the index of the footfall the traveller is on, so a footstep sound plays when it changes. */
export const STRIDE_UNIT = 2.2;
export const footstepCell = (stride: number): number => Math.floor((stride * STRIDE_UNIT) / FOOTFALL_SPACING);
