/**
 * Hero secondary motion from the walk phase (presentation only: applied to the hero node, never to the sim position).
 * The Walk clip already lifts the hips about 6 cm at 2x step frequency; this adds a little more body weight on top: a vertical
 * bob in the same phase, a forward lean that grows with speed and a slight roll toward the planted foot. Everything is a pure
 * function of the stride phase and a smoothed speed drive, so it is zero when idle, continuous across gait switches
 * (the phase is the animator's continuous cycle) and identical at any frame cadence.
 */

/** Seconds over which the speed drive follows the measured ground speed. */
export const DRIVE_SECONDS = 0.12;
/** Phase (0..1 of the Walk clip) at which the hips are highest, and at which the right heel strikes (forward kinematics of hero.glb). */
export const HIP_HIGH_PHASE = 0.06;
export const RIGHT_STRIKE_PHASE = 0.05;
/** Extra bob (metres at the placed 2.9 m height), forward lean and roll (radians) at walking speed (drive 1). */
export const BOB_METRES = 0.03;
export const LEAN_RADIANS = 0.06;
export const ROLL_RADIANS = 0.03;
/** The drive is capped so a run leans about twice as far as a walk. */
export const MAX_DRIVE = 2;

export interface BodyMotion { readonly bob: number; readonly pitch: number; readonly roll: number }
export const NO_MOTION: BodyMotion = { bob: 0, pitch: 0, roll: 0 };

/** Exponential follow that composes exactly: stepping 30 or 240 times a second lands on the same value. */
export function followDrive(current: number, target: number, dt: number): number {
  if (!(dt > 0)) return current;
  return target + (current - target) * Math.exp(-dt / DRIVE_SECONDS);
}

/** `drive` is ground speed over the Walk clip's planted-foot speed (0 idle, 1 walking pace, up to 2 running). */
export function bodyMotion(phase: number, drive: number): BodyMotion {
  const d = Math.min(MAX_DRIVE, Math.max(0, drive));
  if (d < 1e-4) return NO_MOTION;
  const bobWeight = Math.min(1, d);
  const turns = Math.PI * 2;
  return {
    bob: BOB_METRES * bobWeight * Math.cos(2 * turns * (phase - HIP_HIGH_PHASE)),
    pitch: LEAN_RADIANS * d,
    roll: ROLL_RADIANS * bobWeight * Math.sin(turns * (phase - RIGHT_STRIKE_PHASE))
  };
}
