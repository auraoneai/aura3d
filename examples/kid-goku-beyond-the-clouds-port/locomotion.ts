/**
 * Clip-side constants for the hero's run. Below the planted-gait blend (`gait.ts`, under about 2 m/s) the Meshy run clip drives the legs at the
 * playback rate the library `createLocomotion` (`@aura3d/engine/game`) picks from ground speed. The clip plants a foot at about 3.3 m/s at 1x.
 */
export type LocoClip = "run" | "walk";

/** Planted-foot ground speed of each clip at rate 1, in metres per second at the hero's 1.5 m target height (measured from the GLB with forward kinematics). */
export const CLIP_FOOT_SPEED: Readonly<Record<LocoClip, number>> = { run: 3.31, walk: 0.96 };
/** Clip phase (0..1) at which each foot touches down. */
export const CONTACT_PHASE: Readonly<Record<LocoClip, { left: number; right: number }>> = { run: { left: 0.375, right: 0.828 }, walk: { left: 0.328, right: 0.047 } };
export const MAX_RATE = 1.8;

/** Number of foot touchdowns between two clip phases (cycles may wrap), for footstep dust and sound. */
export function touchdowns(clip: LocoClip, from: number, to: number): { left: number; right: number } {
  const c = CONTACT_PHASE[clip];
  const count = (at: number): number => Math.floor(to - at + 1e-9) - Math.floor(from - at + 1e-9);
  return { left: Math.max(0, count(c.left)), right: Math.max(0, count(c.right)) };
}
