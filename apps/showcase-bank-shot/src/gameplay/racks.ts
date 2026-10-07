/**
 * Bank Shot rack definitions, clocks, and combo math (PRD BS-08).
 *
 * Pure data + pure functions: three racks with shrinking clocks (4:00 / 3:30 /
 * 3:00), the combo ladder (+0.25x per consecutive legal pot, capped, reset on a
 * miss or foul), and the score table. Unit-tested directly by
 * tests/unit/apps/bank-shot-rules.test.ts.
 */

export interface RackConfig {
  readonly id: 1 | 2 | 3;
  /** Rack clock in milliseconds; expiry loses the rack. */
  readonly clockMs: number;
  readonly label: string;
}

export const RACK_COUNT = 3;

export const RACKS: readonly RackConfig[] = [
  { id: 1, clockMs: 4 * 60_000, label: "League night" },
  { id: 2, clockMs: 210_000, label: "Hustler hours" },
  { id: 3, clockMs: 180_000, label: "Last call" }
];

export function rackConfigFor(id: number): RackConfig {
  const config = RACKS.find((rack) => rack.id === id);
  if (!config) throw new Error("Bank Shot has no rack " + id);
  return config;
}

// ---- combo math ---------------------------------------------------------------

/** Each consecutive legal pot adds +0.25x, capped at 2.5x. */
export const COMBO_STEP = 0.25;
export const COMBO_CAP = 2.5;

export function comboMultiplierFor(streak: number): number {
  const safe = Math.max(0, Math.floor(streak));
  return Math.min(COMBO_CAP, 1 + safe * COMBO_STEP);
}

/**
 * Combo streak after a shot: every legal pot extends the streak by one; a shot
 * with no legal pot, or any foul, resets it to zero (PRD core loop).
 */
export function nextComboStreak(currentStreak: number, legalPots: number, foul: boolean): number {
  if (foul || legalPots <= 0) return 0;
  return Math.max(0, Math.floor(currentStreak)) + Math.floor(legalPots);
}

// ---- score table ---------------------------------------------------------------

export const SCORE_TABLE = {
  /** Base points per legal object ball; multiplied by the combo at pot time. */
  ballPot: 100,
  /** Sinking the 8-ball legally. */
  eightBallWin: 1500,
  /** Rack-clear time bonus per whole second left on the clock. */
  timeBonusPerSecond: 2
} as const;

export function timeBonusFor(clockMsRemaining: number): number {
  return Math.max(0, Math.floor(clockMsRemaining / 1000)) * SCORE_TABLE.timeBonusPerSecond;
}
