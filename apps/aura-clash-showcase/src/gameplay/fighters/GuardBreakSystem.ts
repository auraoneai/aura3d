import type { FighterRuntimeState } from "../state/GameTypes";
import { setFighterAction } from "../state/FighterState";

export interface GuardBreakResult {
  defender: FighterRuntimeState;
  broken: boolean;
  guardDamageApplied: number;
  recoveryMs: number;
}

export interface GuardBreakRules {
  breakThreshold: number;
  recoveryMs: number;
  chipDamageMultiplier: number;
}

export const defaultGuardBreakRules: GuardBreakRules = {
  breakThreshold: 0,
  recoveryMs: 520,
  chipDamageMultiplier: 0.18,
};

export function applyGuardDamage(
  defender: FighterRuntimeState,
  guardDamage: number,
  atMs: number,
  rules: GuardBreakRules = defaultGuardBreakRules,
): GuardBreakResult {
  const nextGuard = Math.max(0, defender.stats.guard - guardDamage);
  const broken = nextGuard <= rules.breakThreshold;
  const chipDamage = Math.round(guardDamage * rules.chipDamageMultiplier);
  const nextDefender: FighterRuntimeState = {
    ...defender,
    stats: {
      ...defender.stats,
      guard: broken ? 0 : nextGuard,
      health: Math.max(0, defender.stats.health - chipDamage),
    },
  };

  return {
    defender: broken ? setFighterAction(nextDefender, "hitstun", atMs, rules.recoveryMs) : nextDefender,
    broken,
    guardDamageApplied: guardDamage,
    recoveryMs: broken ? rules.recoveryMs : 0,
  };
}

export function recoverGuard(defender: FighterRuntimeState, deltaMs: number, recoveryPerSecond = 18): FighterRuntimeState {
  if (defender.action === "guard" || defender.action === "hitstun") {
    return defender;
  }

  return {
    ...defender,
    stats: {
      ...defender.stats,
      guard: Math.min(100, defender.stats.guard + (recoveryPerSecond * deltaMs) / 1000),
    },
  };
}
