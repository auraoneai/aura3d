import { createCombatAi, type CombatAi, type CombatAiAggression, type CombatFrameData } from "@aura3d/engine";
import { auraClashAttackFrames } from "./auraClashMoveData";

/**
 * AC-A7 — formal rival roles through the engine's `createCombatAi`.
 *
 * AC-01's audit found the rival's decision weights were ad-hoc literals in `clashFeel.ts` plus an
 * inline low-health multiplier — deterministic, but with no named role surface and no shared engine
 * AI. This module wraps `createCombatAi` in three named, seeded presets. The live rival keeps its
 * role names (approach / space / punish-whiff / meaty-wakeup / neutral — asserted by specs) but
 * sources strike aggression, punish appetite and block tendency from the active preset, so role
 * differences are measurable rather than vibes.
 *
 * Determinism: every preset is created from a fixed seed, and `createCombatAi` derives its own
 * seeded xorshift stream internally, so identical observation sequences reproduce identical
 * decision sequences (asserted by `tests/unit/apps/clash-ai-roles.test.ts`) without touching the
 * route's replay RNG stream.
 */

export type ClashAiRoleId = "rushdown" | "balanced" | "keep-away";

export interface ClashAiRolePreset {
  readonly id: ClashAiRoleId;
  /** The PRD's named aggression weight for this preset. */
  readonly aggressionWeight: number;
  /** The engine aggression profile backing the weight. */
  readonly aggression: CombatAiAggression;
  /** Human-readable intent, published in evidence copy. */
  readonly intent: string;
  readonly ai: CombatAi;
}

const ROUTE_MOVES: readonly CombatFrameData[] = [
  auraClashAttackFrames.light,
  auraClashAttackFrames.heavy,
  auraClashAttackFrames.special
];

/** Fixed per-role seeds so every preset is reproducible across runs and browser sessions. */
export const CLASH_AI_ROLE_SEEDS: Readonly<Record<ClashAiRoleId, number>> = Object.freeze({
  rushdown: 0x52554b31,
  balanced: 0x42414c33,
  "keep-away": 0x4b454552
});

function createRolePreset(
  id: ClashAiRoleId,
  aggressionWeight: number,
  aggression: CombatAiAggression,
  intent: string,
  options: { reactionFrames: number; cooldownFrames: number; preferredRange: number }
): ClashAiRolePreset {
  return {
    id,
    aggressionWeight,
    aggression,
    intent,
    ai: createCombatAi({
      moves: ROUTE_MOVES.map((move) => ({ ...move })),
      aggression,
      seed: CLASH_AI_ROLE_SEEDS[id],
      reactionFrames: options.reactionFrames,
      cooldownFrames: options.cooldownFrames,
      preferredRange: options.preferredRange
    })
  };
}

/**
 * The three PRD-named presets: rushdown 0.8, balanced 0.55, keep-away 0.35.
 *
 * Reaction/cooldown/range tuning follows each weight: a lower weight means a longer reaction delay,
 * longer cooldown and a preferred range held further outside its longest poke.
 */
export const clashAiRolePresets: Readonly<Record<ClashAiRoleId, ClashAiRolePreset>> = Object.freeze({
  rushdown: createRolePreset("rushdown", 0.8, "aggressive", "Close distance and pressure with fast strikes.", {
    reactionFrames: 10,
    cooldownFrames: 12,
    preferredRange: 1.05
  }),
  balanced: createRolePreset("balanced", 0.55, "balanced", "Hold spacing, punish whiffs, take clean pokes.", {
    reactionFrames: 14,
    cooldownFrames: 18,
    preferredRange: 1.3
  }),
  "keep-away": createRolePreset("keep-away", 0.35, "defensive", "Create space, block often, strike rarely.", {
    reactionFrames: 17,
    cooldownFrames: 24,
    preferredRange: 1.6
  })
});

export const DEFAULT_CLASH_AI_ROLE: ClashAiRoleId = "balanced";

/** Resolve the preset whose aggression weight is nearest the requested value. */
export function nearestClashAiRole(aggressionWeight: number): ClashAiRolePreset {
  if (!Number.isFinite(aggressionWeight)) return clashAiRolePresets.balanced;
  let best = clashAiRolePresets.balanced;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const preset of Object.values(clashAiRolePresets)) {
    const distance = Math.abs(preset.aggressionWeight - aggressionWeight);
    if (distance < bestDistance) {
      best = preset;
      bestDistance = distance;
    }
  }
  return best;
}

export interface ClashAiRoleObservation {
  readonly distance: number;
  readonly playerAttacking: boolean;
  /** The player's current move id (`light`/`heavy`/`special`), so the engine AI can look up its frame data. */
  readonly playerMoveId: string | null;
  /** Seconds the player's current attack has been running (frame clock, not wall clock). */
  readonly playerAttackElapsed: number;
  readonly stunned: boolean;
}

export interface ClashAiRoleDecision {
  /** Strike appetite gate in [0, 1]: multiply the route's per-role bias by this. */
  readonly strikeGate: number;
  readonly blockBias: number;
  readonly approachBias: -1 | 0 | 1;
  readonly reason: string;
}

const AGGRESSION_STRIKE_GATE: Readonly<Record<CombatAiAggression, number>> = Object.freeze({
  aggressive: 1,
  balanced: 0.72,
  defensive: 0.42
});

/**
 * Ask one preset how the rival should act this frame.
 *
 * The engine AI works on a frame clock, so seconds are converted at the route's 60fps frame data
 * rate. Only presentation-adjacent tendencies change; hit windows and damage remain engine-owned.
 */
export function decideClashAiRole(preset: ClashAiRolePreset, observation: ClashAiRoleObservation): ClashAiRoleDecision {
  const fps = 60;
  // The engine AI resolves the opponent's move from its own frame-data map, so the observation must
  // carry the real route move id — a synthetic id would make block/punish branches unreachable.
  const opponentMoveId = observation.playerAttacking && observation.playerMoveId !== null ? observation.playerMoveId : undefined;
  const opponentMoveFrame = observation.playerAttacking ? Math.round(observation.playerAttackElapsed * fps) : 0;
  const decision = preset.ai.decide({
    distance: observation.distance,
    ...(opponentMoveId !== undefined ? { opponentMoveId, opponentMoveFrame } : {}),
    stunned: observation.stunned,
    ownRecoveryFrames: 0
  });
  const gate = AGGRESSION_STRIKE_GATE[preset.aggression];
  if (decision.moveId !== undefined) {
    // The engine picked a concrete strike: full preset appetite behind it.
    return { strikeGate: Math.min(1, gate + 0.15), blockBias: 0, approachBias: 0, reason: decision.reason };
  }
  return {
    strikeGate: decision.block ? 0 : gate,
    blockBias: decision.block ? 1 : 0,
    approachBias: decision.approach,
    reason: decision.reason
  };
}
