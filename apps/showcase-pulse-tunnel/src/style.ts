/**
 * Pulse Tunnel style system — graze detection reward, multiplier, and decay.
 *
 * PRD section 5: graze window is 0.35 u from a passed obstacle; style decays over
 * 3 s. Model (kept linear and unit-testable):
 *
 * - Each graze adds GRAZE_HEAT_PER_EVENT heat, capped at MAX_GRAZE_HEAT.
 * - Multiplier = 1 + heat, so the meter reads x1 .. x4.
 * - Heat only starts decaying after GRAZE_IDLE_SECONDS without a graze, then falls
 *   linearly at GRAZE_DECAY_PER_SECOND until it reaches zero.
 * - Score accrues as distance x multiplier; distance advances at cruise speed.
 */

export const PULSE_GRAZE_WINDOW = 0.35;
export const PULSE_GRAZE_HEAT_PER_EVENT = 0.5;
export const PULSE_MAX_GRAZE_HEAT = 3;
export const PULSE_GRAZE_IDLE_SECONDS = 3;
export const PULSE_GRAZE_DECAY_PER_SECOND = 0.5;
export const PULSE_CRUISE_SPEED = 14;

export interface StyleSnapshot {
  readonly heat: number;
  readonly multiplier: number;
  readonly score: number;
  readonly distance: number;
  readonly grazes: number;
  readonly secondsSinceGraze: number;
}

/** Multiplier for a given heat level (pure). */
export function pulseMultiplierForHeat(heat: number): number {
  return 1 + Math.max(0, Math.min(PULSE_MAX_GRAZE_HEAT, heat));
}

/** Heat after registering one graze (pure). */
export function pulseHeatAfterGraze(heat: number): number {
  return Math.min(PULSE_MAX_GRAZE_HEAT, heat + PULSE_GRAZE_HEAT_PER_EVENT);
}

/** Heat after `dt` seconds of decay given idle time since the last graze (pure). */
export function pulseDecayedHeat(heat: number, secondsSinceGraze: number, dt: number): number {
  if (secondsSinceGraze < PULSE_GRAZE_IDLE_SECONDS || heat <= 0) return heat;
  return Math.max(0, heat - PULSE_GRAZE_DECAY_PER_SECOND * dt);
}

export interface PulseStyleSystem {
  /** Register a graze near a passed obstacle. */
  graze(): void;
  /** Advance time by dt seconds and add travelled distance at cruise speed. */
  step(dtSeconds: number): StyleSnapshot;
  snapshot(): StyleSnapshot;
  reset(): void;
}

export function createPulseStyleSystem(): PulseStyleSystem {
  let heat = 0;
  let score = 0;
  let distance = 0;
  let grazes = 0;
  let secondsSinceGraze = Number.POSITIVE_INFINITY;

  return {
    graze() {
      heat = pulseHeatAfterGraze(heat);
      grazes += 1;
      secondsSinceGraze = 0;
    },
    step(dtSeconds) {
      secondsSinceGraze += dtSeconds;
      heat = pulseDecayedHeat(heat, secondsSinceGraze === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : secondsSinceGraze, dtSeconds);
      const delta = PULSE_CRUISE_SPEED * dtSeconds;
      distance += delta;
      score += delta * pulseMultiplierForHeat(heat);
      return {
        heat,
        multiplier: pulseMultiplierForHeat(heat),
        score,
        distance,
        grazes,
        secondsSinceGraze: secondsSinceGraze === Number.POSITIVE_INFINITY ? -1 : secondsSinceGraze
      };
    },
    snapshot() {
      return {
        heat,
        multiplier: pulseMultiplierForHeat(heat),
        score,
        distance,
        grazes,
        secondsSinceGraze: secondsSinceGraze === Number.POSITIVE_INFINITY ? -1 : secondsSinceGraze
      };
    },
    reset() {
      heat = 0;
      score = 0;
      distance = 0;
      grazes = 0;
      secondsSinceGraze = Number.POSITIVE_INFINITY;
    }
  };
}
