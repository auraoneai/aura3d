/**
 * Mech Hangar rival — createCombatAi configs + rematch aggression cycling.
 *
 * The rival is driven by the engine's deterministic createCombatAi. Each rematch
 * advances ONLY the aggression preset cycle (0.35 keep-away -> 0.55 balanced ->
 * 0.8 rushdown); the rival's build stays a fixed loadout so balance stays
 * testable and preset differences are attributable to behaviour alone.
 */
import { createCombatAi, type CombatAi, type CombatFrameData } from "@aura3d/engine";
import { aggregateStats, presetForBout, type AggressionPreset } from "../stats";
import type { MechStats } from "../stats";

/** Route-local move set mapped onto createCombatAi's frame-data contract. */
export function rivalMovesForStats(stats: ReturnType<typeof aggregateStats>): readonly CombatFrameData[] {
  return [
    {
      id: "light",
      startup: 8,
      active: 3,
      recovery: 12,
      hitstun: 14,
      blockstun: 10,
      range: 1.1,
      damage: stats.lightDamage,
      knockback: 1.7,
      hitstop: 4
    },
    {
      id: "heavy",
      startup: 14,
      active: 4,
      recovery: 20,
      hitstun: 22,
      blockstun: 13,
      range: 1.3,
      damage: stats.heavyDamage,
      knockback: 3.2,
      hitstop: 7
    },
    {
      id: "special",
      startup: 18,
      active: 5,
      recovery: 26,
      hitstun: 28,
      blockstun: 16,
      range: 1.65,
      damage: stats.specialDamage,
      knockback: 4.6,
      hitstop: 9
    }
  ];
}

export interface RivalDecisionInput {
  readonly distance: number;
  readonly playerMoveId: string | undefined;
  readonly playerMoveFrame: number;
  readonly rivalStunned: boolean;
  readonly rivalRecoveryFrames: number;
  readonly rivalHealthFraction: number;
  readonly playerHealthFraction: number;
  /** Rival power fraction; specials only fire when this covers the cost. */
  readonly powerFraction: number;
  readonly specialCostFraction: number;
}

/** What the bout simulation consumes each frame. */
export interface RivalIntent {
  readonly moveId: string | undefined;
  readonly guard: boolean;
  readonly approach: -1 | 0 | 1;
}

export interface RivalController {
  readonly preset: AggressionPreset;
  decide(input: RivalDecisionInput): RivalIntent;
  reset(): void;
}

/**
 * Wrap createCombatAi with route-local preset knobs.
 *
 * The special is only offered to the AI while its meter covers the cost, and the
 * keep-away preset's preferredRange pushes it outside light range so its defense
 * reads as spacing discipline rather than passivity.
 */
export interface CreateRivalControllerOptions {
  readonly presetIndex: number;
  readonly seed: number;
  readonly rivalStats: MechStats;
}

export function createRivalController(options: CreateRivalControllerOptions): RivalController {
  const preset = presetForBout(options.presetIndex);
  const stats = options.rivalStats;
  const moves = rivalMovesForStats(stats);
  let powerFraction = 1;
  let specialCostFraction = 0.45;
  const ai: CombatAi = createCombatAi({
    moves,
    aggression: preset.engineAggression,
    reactionFrames: preset.reactionFrames,
    cooldownFrames: preset.cooldownFrames,
    // Hold just inside its longest poke scaled by preset spacing intent.
    preferredRange: preset.preferredRange,
    seed: options.seed
  });
  return {
    preset,
    decide(input) {
      powerFraction = input.powerFraction;
      specialCostFraction = input.specialCostFraction;
      const observation = {
        distance: input.distance,
        opponentMoveId: input.playerMoveId,
        opponentMoveFrame: input.playerMoveFrame,
        stunned: input.rivalStunned,
        ownRecoveryFrames: input.rivalRecoveryFrames,
        ownHealthFraction: input.rivalHealthFraction,
        opponentHealthFraction: input.playerHealthFraction
      };
      const decision = ai.decide(observation);
      // Withhold the special when the meter cannot pay for it; the AI falls back to
      // its other moves rather than whiffing an unpayable call.
      if (decision.moveId === "special" && powerFraction < specialCostFraction) {
        return { moveId: "light", guard: decision.block, approach: decision.approach };
      }
      return { moveId: decision.moveId, guard: decision.block, approach: decision.approach };
    },
    reset() {
      ai.reset();
    }
  };
}