/**
 * Oxygen economy, depth-scaled drain curves, hull breach penalty, and refuel.
 */
import { getDepthZone } from "./reef";

export interface OxygenState {
  readonly oxygen: number; // 0 .. 100
  readonly hull: number; // 0 .. 100
  readonly breached: boolean;
  readonly breachTimer: number;
  readonly warningActive: boolean;
  readonly blackout: boolean;
}

export const MAX_OXYGEN = 100;
export const MAX_HULL = 100;
export const OXYGEN_WARN_THRESHOLD = 25;
export const BREACH_DRAIN_PER_SEC = 1.6;
export const SPRINT_DRAIN_SCALE = 1.5;
export const TOW_DRAIN_PER_CRATE = 0.3;

export function initialOxygenState(): OxygenState {
  return {
    oxygen: MAX_OXYGEN,
    hull: MAX_HULL,
    breached: false,
    breachTimer: 0,
    warningActive: false,
    blackout: false
  };
}

export function computeOxygenDrainRate(
  depthY: number,
  isSprinting: boolean,
  tetheredCrates: number,
  isBreached: boolean
): number {
  const zone = getDepthZone(depthY);
  let rate = zone.oxygenDrainRate;
  if (isSprinting) rate *= SPRINT_DRAIN_SCALE;
  rate += tetheredCrates * TOW_DRAIN_PER_CRATE;
  if (isBreached) rate += BREACH_DRAIN_PER_SEC;
  return rate;
}

export function updateOxygen(
  state: OxygenState,
  depthY: number,
  isSprinting: boolean,
  tetheredCrates: number,
  dt: number
): OxygenState {
  if (state.blackout) return state;

  const drainRate = computeOxygenDrainRate(depthY, isSprinting, tetheredCrates, state.breached);
  const nextOxygen = Math.max(0, state.oxygen - drainRate * dt);
  const isBlackout = nextOxygen <= 0;
  const isWarning = nextOxygen > 0 && nextOxygen <= OXYGEN_WARN_THRESHOLD;

  let breachTimer = state.breachTimer;
  let breached = state.breached;
  if (breached) {
    breachTimer += dt;
  }

  return {
    ...state,
    oxygen: nextOxygen,
    warningActive: isWarning,
    blackout: isBlackout,
    breached,
    breachTimer
  };
}

export function applyCollisionImpact(state: OxygenState, impactSpeed: number): { nextState: OxygenState; breachedJustNow: boolean } {
  if (impactSpeed < 3.5) return { nextState: state, breachedJustNow: false };

  const damage = Math.min(40, (impactSpeed - 3.0) * 8.0);
  const nextHull = Math.max(0, state.hull - damage);
  const breachedJustNow = !state.breached && nextHull < 70;
  const breached = state.breached || breachedJustNow;

  return {
    nextState: {
      ...state,
      hull: nextHull,
      breached
    },
    breachedJustNow
  };
}

export function patchBreach(state: OxygenState): OxygenState {
  return {
    ...state,
    breached: false,
    breachTimer: 0,
    hull: Math.min(MAX_HULL, state.hull + 20)
  };
}

export function refuelAtSurface(state: OxygenState): OxygenState {
  return {
    ...state,
    oxygen: MAX_OXYGEN,
    warningActive: false
  };
}
