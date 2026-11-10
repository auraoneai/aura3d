/**
 * GU47 WP-31 LT-15: presentation-only rider and tram motion. Riders lean against the tram's roll with a first-order lag
 * (time constant 0.25 s, so the lean reaches 63% of a step in 0.25 s), sway further past a roll of 0.22, and the tram bobs
 * 1.5 cm at speed. Reduced motion scales every amplitude to 30% (PRD §6.3). Reads the sim's roll and speed; writes nothing.
 */
import type { Temperament } from "./sim";

export const LEAN_TAU = 0.25;
export const LEAN_GAIN = 0.6;
export const SWAY_THRESHOLD = 0.22;
export const SWAY_GAIN = 0.5;
export const TRAM_BOB = 0.015;
export const REDUCED_MOTION_SCALE = 0.3;

export class RiderMotion {
  lean = 0;
  /** Advances the lag by `dt` seconds toward the counter-lean for `roll`; returns the rider lean (radians, about tram +Z). */
  step(roll: number, dt: number, reducedMotion = false): number {
    const past = Math.max(0, Math.abs(roll) - SWAY_THRESHOLD) * Math.sign(roll);
    const target = -(roll * LEAN_GAIN + past * SWAY_GAIN);
    const a = dt > 0 ? 1 - Math.exp(-dt / LEAN_TAU) : 1;
    this.lean += (target - this.lean) * a;
    return this.lean * (reducedMotion ? REDUCED_MOTION_SCALE : 1);
  }
}

/** Tram bob (metres) at `seconds` for `speed` m/s; 0 at rest. */
export function tramBob(seconds: number, speed: number, reducedMotion = false): number {
  const k = Math.min(1, Math.abs(speed) / 8) * (reducedMotion ? REDUCED_MOTION_SCALE : 1);
  return Math.sin(seconds * 9.1) * TRAM_BOB * k;
}

/**
 * Seated bench posture in tram-local space: drops the Meshy passenger silhouette onto the teak bench (`y = 1.24 m` vs 1.61 m
 * standing height), pivots counter-lean from the hip instead of the ankles, and adds subtle temperament-specific breathing /
 * window-gaze yaw so riders read as seated commuters rather than standing statues.
 */
export function seatedRiderPose(
  seatIndex: number,
  seatSide: number,
  temperament: Temperament,
  seconds: number,
  riderLean: number,
  reducedMotion = false
): { readonly yOffset: number; readonly latShift: number; readonly pitch: number; readonly yawOffset: number; readonly breathY: number } {
  const scale = reducedMotion ? REDUCED_MOTION_SCALE : 1;
  const phase = seatIndex * 1.37;
  const breathY = Math.sin(seconds * 1.9 + phase) * 0.012 * scale;
  const basePitch = temperament === "sleeper" ? 0.14 : temperament === "rushed" ? 0.08 : temperament === "sightseer" ? -0.04 : -0.02;
  const nod = temperament === "sleeper" ? Math.sin(seconds * 1.1 + phase) * 0.045 * scale : 0;
  const gaze = temperament === "sightseer"
    ? (seatSide < 0 ? -0.26 : 0.26) + Math.sin(seconds * 0.65 + phase) * 0.1 * scale
    : Math.sin(seconds * 0.52 + phase) * 0.04 * scale;
  // Hip-anchored counter-lean shifts upper torso slightly inward while keeping hips planted on the bench.
  const latShift = -riderLean * 0.24;
  return {
    yOffset: 1.24,
    latShift,
    pitch: basePitch + nod,
    yawOffset: gaze,
    breathY
  };
}
