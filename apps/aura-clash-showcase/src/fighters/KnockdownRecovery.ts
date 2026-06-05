import type { FighterRuntimeState } from "../state/GameTypes";
import { setFighterAction } from "../state/FighterState";

export interface KnockdownRules {
  knockdownHealthThreshold: number;
  knockdownStunMs: number;
  wakeupInvulnerabilityMs: number;
}

export interface KnockdownResult {
  fighter: FighterRuntimeState;
  knockedDown: boolean;
  wakeupAtMs: number;
}

export const defaultKnockdownRules: KnockdownRules = {
  knockdownHealthThreshold: 18,
  knockdownStunMs: 760,
  wakeupInvulnerabilityMs: 260,
};

export function maybeApplyKnockdown(
  fighter: FighterRuntimeState,
  damage: number,
  atMs: number,
  rules: KnockdownRules = defaultKnockdownRules,
): KnockdownResult {
  const nextHealth = Math.max(0, fighter.stats.health - damage);
  const knockedDown = damage >= rules.knockdownHealthThreshold || nextHealth === 0;
  const damaged: FighterRuntimeState = {
    ...fighter,
    stats: {
      ...fighter.stats,
      health: nextHealth,
    },
  };

  if (!knockedDown) {
    return {
      fighter: setFighterAction(damaged, "hitstun", atMs, 220),
      knockedDown: false,
      wakeupAtMs: atMs + 220,
    };
  }

  return {
    fighter: setFighterAction(
      {
        ...damaged,
        invulnerableUntilMs: atMs + rules.knockdownStunMs + rules.wakeupInvulnerabilityMs,
      },
      "knockdown",
      atMs,
      rules.knockdownStunMs,
    ),
    knockedDown: true,
    wakeupAtMs: atMs + rules.knockdownStunMs,
  };
}

export function recoverFromKnockdown(fighter: FighterRuntimeState, atMs: number): FighterRuntimeState {
  if (fighter.action !== "knockdown" || atMs < fighter.actionLockedUntilMs) {
    return fighter;
  }

  return setFighterAction(fighter, "idle", atMs, 0);
}
