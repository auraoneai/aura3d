/**
 * Gravity Post — score formula + shift-fail math.
 *
 * Score = base + fuel-remaining% + precision (dock distance to station core)
 *         + assist bonus per distinct well used (+ flyby bonus body).
 * Pure functions so the unit suite can pin the exact numbers.
 */
import type { ContractSpec } from "./contracts";

/** Base delivery fee. */
export const SCORE_BASE = 500;
/** Points per whole percentage point of propellant remaining. */
export const SCORE_PER_FUEL_PERCENT = 5;
/** Max precision points when docking dead-center. */
export const PRECISION_MAX = 200;
/** Points per distinct gravity assist logged on the flight. */
export const ASSIST_BONUS_PER_WELL = 150;
/** Bonus for visiting the contract's advertised flyby body. */
export const FLYBY_BONUS = 120;
/** Failed contracts allowed before the shift ends. */
export const SHIFT_FAIL_LIMIT = 3;

export interface ScoreBreakdown {
  readonly base: number;
  readonly fuelPoints: number;
  readonly precisionPoints: number;
  readonly assistPoints: number;
  readonly flybyPoints: number;
  readonly total: number;
}

export function fuelRemainingPercent(propellant: number): number {
  return Math.max(0, Math.min(100, propellant));
}

export function precisionScore(distanceToCore: number, dockRadius: number): number {
  if (!Number.isFinite(distanceToCore) || distanceToCore < 0) return 0;
  const ratio = Math.min(1, distanceToCore / Math.max(1e-6, dockRadius));
  return Math.round(PRECISION_MAX * (1 - ratio));
}

/**
 * Score one completed contract.
 * @param propellant tank left at dock
 * @param distanceToCore distance from station core at the dock moment
 * @param dockRadius sensor radius used for the precision denominator
 * @param assists distinct well bodies logged during the flight
 * @param bonusBodyHit did the pod visit the contract's bonus flyby body
 */
export function scoreContract(options: {
  propellant: number;
  distanceToCore: number;
  dockRadius: number;
  assists: ReadonlySet<string> | readonly string[];
  bonusBodyHit: boolean;
}): ScoreBreakdown {
  const base = SCORE_BASE;
  const fuelPoints = Math.round(fuelRemainingPercent(options.propellant) * SCORE_PER_FUEL_PERCENT);
  const precisionPoints = precisionScore(options.distanceToCore, options.dockRadius);
  const assistCount = typeof options.assists === "object" && "size" in options.assists
    ? options.assists.size
    : (options.assists as readonly string[]).length;
  const assistPoints = ASSIST_BONUS_PER_WELL * assistCount;
  const flybyPoints = options.bonusBodyHit ? FLYBY_BONUS : 0;
  return {
    base,
    fuelPoints,
    precisionPoints,
    assistPoints,
    flybyPoints,
    total: base + fuelPoints + precisionPoints + assistPoints + flybyPoints
  };
}

/** Par-fuel delta used by HUD coaching ("par 84%"). */
export function fuelMargin(propellant: number, contract: ContractSpec): number {
  return Math.round(fuelRemainingPercent(propellant) - contract.parFuel);
}

export interface ShiftState {
  readonly failedContracts: number;
  readonly completedContracts: number;
  readonly shiftOver: boolean;
}

export function applyContractFail(shift: { failedContracts: number }): ShiftState {
  shift.failedContracts += 1;
  return {
    failedContracts: shift.failedContracts,
    completedContracts: 0,
    shiftOver: shift.failedContracts >= SHIFT_FAIL_LIMIT
  };
}
