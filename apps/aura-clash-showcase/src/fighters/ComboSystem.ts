import type { HitStrength } from "../state/HitRegistry";

export interface ComboState {
  count: number;
  damageScaling: number;
  lastHitAtMs: number;
  canCancelUntilMs: number;
  route: HitStrength[];
}

export interface ComboRules {
  resetAfterMs: number;
  scalingPerHit: number;
  minScaling: number;
  cancelWindowMs: number;
}

export const defaultComboRules: ComboRules = {
  resetAfterMs: 900,
  scalingPerHit: 0.08,
  minScaling: 0.42,
  cancelWindowMs: 240,
};

export const emptyComboState: ComboState = {
  count: 0,
  damageScaling: 1,
  lastHitAtMs: 0,
  canCancelUntilMs: 0,
  route: [],
};

export function registerComboHit(
  combo: ComboState,
  strength: HitStrength,
  atMs: number,
  rules: ComboRules = defaultComboRules,
): ComboState {
  const reset = atMs - combo.lastHitAtMs > rules.resetAfterMs;
  const baseCount = reset ? 0 : combo.count;
  const count = baseCount + 1;

  return {
    count,
    damageScaling: Math.max(rules.minScaling, 1 - (count - 1) * rules.scalingPerHit),
    lastHitAtMs: atMs,
    canCancelUntilMs: atMs + rules.cancelWindowMs,
    route: [...(reset ? [] : combo.route), strength],
  };
}

export function canCancelCombo(combo: ComboState, atMs: number): boolean {
  return combo.count > 0 && atMs <= combo.canCancelUntilMs;
}

export function resetExpiredCombo(combo: ComboState, atMs: number, rules: ComboRules = defaultComboRules): ComboState {
  return atMs - combo.lastHitAtMs > rules.resetAfterMs ? emptyComboState : combo;
}
