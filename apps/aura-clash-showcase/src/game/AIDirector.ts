import type { AuraClashAIState, AuraClashAnimationName, AuraClashInputAction } from "./types";
import type { KinematicBody } from "./KinematicBody";

export const AURA_CLASH_AI_STATES: readonly AuraClashAIState[] = [
  "idle",
  "approach",
  "retreat",
  "guard",
  "poke",
  "punish",
  "jump",
  "special",
];

export interface AuraClashAIDecisionContext {
  playerAction?: AuraClashInputAction;
  playerAnimation?: AuraClashAnimationName;
}

export interface AuraClashAIDecision {
  state: AuraClashAIState;
  action: AuraClashInputAction;
  reason: string;
  distance: number;
}

export function chooseOpponentDecision(
  opponent: KinematicBody,
  player: KinematicBody,
  atMs: number,
  meter: number,
  context: AuraClashAIDecisionContext = {},
): AuraClashAIDecision {
  const distance = Math.abs(opponent.position.x - player.position.x);
  const wave = Math.sin(atMs / 420) * 0.5 + 0.5;
  const approachAction = opponent.position.x > player.position.x ? "moveLeft" : "moveRight";
  const retreatAction = opponent.position.x > player.position.x ? "moveRight" : "moveLeft";
  const playerCommitted = context.playerAction === "heavy" || context.playerAction === "special";

  if (meter >= 60 && distance < 1.45 && wave > 0.78) {
    return { state: "special", action: "special", reason: "meter-ready close-range burst window", distance };
  }

  if (distance < 1.25 && playerCommitted && wave > 0.32) {
    return { state: "punish", action: "heavy", reason: `punish ${context.playerAction} recovery`, distance };
  }

  if (distance > 1.7) {
    return { state: "approach", action: approachAction, reason: "outside preferred poke range", distance };
  }

  if (distance < 0.58) {
    return { state: "retreat", action: retreatAction, reason: "too close after body collision overlap", distance };
  }

  if ((context.playerAction === "special" || wave < 0.24) && distance < 1.55) {
    return { state: "guard", action: "guard", reason: "defensive beat during player pressure", distance };
  }

  if (opponent.grounded && wave >= 0.24 && wave < 0.34 && distance > 0.75) {
    return { state: "jump", action: "jump", reason: "vertical timing mixup from grounded neutral", distance };
  }

  if (distance < 1.2 && wave > 0.42) {
    return { state: "poke", action: "light", reason: "safe range check in active neutral", distance };
  }

  return { state: "idle", action: "reset", reason: "hold spacing and wait for next timing beat", distance };
}

export function chooseOpponentAction(opponent: KinematicBody, player: KinematicBody, atMs: number, meter: number): AuraClashInputAction {
  return chooseOpponentDecision(opponent, player, atMs, meter).action;
}
