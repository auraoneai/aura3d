/**
 * Touchdown grading and scoring — pure functions, unit-tested as a matrix.
 *
 * PRD §3 grading: vertical speed <2.0 m/s soft (full points), <4.0 hard (penalty),
 * else crash; attitude <12° off pad normal; lander feet inside the pad sensor zone
 * required. Outcomes are deterministic from the graded snapshot.
 */

/** Authored grading thresholds — the PRD numbers, stated once. */
export const SOFT_TOUCHDOWN_MAX_VSPEED = 2.0;
export const HARD_TOUCHDOWN_MAX_VSPEED = 4.0;
/** Attitude limit in degrees measured between lander up and the pad surface normal. */
export const MAX_ATTITUDE_DEG = 12;

/** Slope beyond this at the contact point reads as a crash regardless of zone. */
export const MAX_LANDING_SLOPE_DEG = 18;

export type LandingGrade = "soft" | "hard" | "crash";

export const LANDER_MAX_HULL = 100;
export const HARD_LANDING_HULL_DAMAGE = 30;

/** Campaign hull is persistent across sites; a crash destroys the run. */
export function hullAfterTouchdown(currentHull: number, grade: LandingGrade): number {
  const hull = Math.max(0, Math.min(LANDER_MAX_HULL, currentHull));
  if (grade === "crash") return 0;
  if (grade === "hard") return Math.max(0, hull - HARD_LANDING_HULL_DAMAGE);
  return hull;
}

export interface TouchdownSnapshot {
  /** Vertical speed magnitude at contact, m/s. */
  readonly vspeed: number;
  /** Horizontal speed magnitude at contact, m/s. */
  readonly hspeed: number;
  /** Angle between lander up and surface/pad normal, degrees. */
  readonly attitudeDeg: number;
  /** True when the contact point sits inside an active pad sensor zone. */
  readonly insidePadZone: boolean;
  /** Terrain slope at contact, degrees (0 on a flat plateau). */
  readonly slopeDeg: number;
}

export interface GradedTouchdown {
  readonly grade: LandingGrade;
  /** Human-readable reason for a crash verdict (empty when landed). */
  readonly crashReason: string;
  /** Base points before fuel bonus and multiplier; 0 for crashes. */
  readonly basePoints: number;
}

/**
 * Grade one touchdown. Order matters: attitude and zone are hard gates — a gentle
 * touchdown on its side or off-pad is still a loss of vehicle.
 */
export function gradeTouchdown(snapshot: TouchdownSnapshot): GradedTouchdown {
  if (!snapshot.insidePadZone) {
    return { grade: "crash", crashReason: "missed pad zone", basePoints: 0 };
  }
  if (snapshot.attitudeDeg > MAX_ATTITUDE_DEG) {
    return { grade: "crash", crashReason: "tipped over on touchdown", basePoints: 0 };
  }
  if (snapshot.slopeDeg > MAX_LANDING_SLOPE_DEG) {
    return { grade: "crash", crashReason: "terrain slope out of limits", basePoints: 0 };
  }
  if (snapshot.vspeed >= HARD_TOUCHDOWN_MAX_VSPEED) {
    return { grade: "crash", crashReason: "impact too hard", basePoints: 0 };
  }
  if (snapshot.vspeed >= SOFT_TOUCHDOWN_MAX_VSPEED) {
    return { grade: "hard", crashReason: "", basePoints: 400 };
  }
  return { grade: "soft", crashReason: "", basePoints: 1000 };
}

export interface ScoreInput {
  readonly grade: LandingGrade;
  readonly basePoints: number;
  /** Fraction of fuel remaining at touchdown, 0..1. */
  readonly fuelFraction: number;
  readonly siteMultiplier: number;
}

export interface ScoreBreakdown {
  readonly total: number;
  readonly fuelBonus: number;
  readonly multiplierApplied: number;
}

/**
 * Score = base × (1 + fuel fraction) × site multiplier, rounded to whole points.
 * Fuel-out arrivals still score when the landing itself is valid — barely.
 */
export function scoreTouchdown(input: ScoreInput): ScoreBreakdown {
  if (input.grade === "crash") {
    return { total: 0, fuelBonus: 0, multiplierApplied: input.siteMultiplier };
  }
  const fuelBonus = 1 + Math.max(0, Math.min(1, input.fuelFraction));
  const total = Math.round(input.basePoints * fuelBonus * input.siteMultiplier);
  return { total, fuelBonus: Number(fuelBonus.toFixed(3)), multiplierApplied: input.siteMultiplier };
}
