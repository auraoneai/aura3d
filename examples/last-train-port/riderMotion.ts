/**
 * GU47 WP-31 LT-15: presentation-only rider and tram motion. Riders lean against the tram's roll with a first-order lag
 * (time constant 0.25 s, so the lean reaches 63% of a step in 0.25 s), sway further past a roll of 0.22, and the tram bobs
 * 1.5 cm at speed. Reduced motion scales every amplitude to 30% (PRD §6.3). Reads the sim's roll and speed; writes nothing.
 */
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
