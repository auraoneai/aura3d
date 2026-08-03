/**
 * Reusable frame-based combat model: frame data, spacing and a credible AI.
 *
 * ## The defects this addresses
 *
 * Aura Clash's attacks were reported as unrealistic, with weak spacing, limited
 * momentum, and animations that do not correspond convincingly to hits. Converting
 * the shipped move table to frames at 60fps shows why:
 *
 * | move    | startup | active | recovery |
 * | ------- | ------- | ------ | -------- |
 * | light   | 4       | **12** | **4**    |
 * | heavy   | 6       | **17** | **5**    |
 * | special | 5       | **32** | **4**    |
 *
 * Real fighting-game frame data is the opposite shape: a short active window (2-5
 * frames) and a long recovery (10-30 frames). Aura Clash's active windows are 3-8x
 * too long and its recoveries 3-6x too short, which has three consequences:
 *
 * 1. **Hits do not correspond to the animation.** A 32-frame active window on the
 *    special means the hitbox is live for over half a second, so damage lands at
 *    moments that look nothing like contact -- the reported "attack dealing damage
 *    before contact".
 * 2. **No spacing game.** With a 12-frame active window and a 4-frame recovery, an
 *    attack is nearly always safe. Whiffing costs almost nothing, so there is no
 *    reason to respect range and no punish window to aim for. That is precisely
 *    "weak spacing".
 * 3. **No trades or momentum.** Blockstun and hitstun cannot create meaningful
 *    advantage when every move recovers in four frames.
 *
 * The engine defect is that nothing validated frame data as frame data. A move table
 * could declare any startup/active/recovery split and no check compared it against the
 * shape that makes a combat system readable.
 *
 * This module adds that check ({@link validateCombatFrameData}), a solver that derives
 * balanced frame data from an intended move role ({@link solveCombatFrameData}), and a
 * reactive AI ({@link createCombatAi}) that behaves like an opponent: it respects
 * range, reacts with a delay, blocks what it sees, and punishes what it can.
 *
 * Pure and dependency-free.
 */

export type CombatMoveRole = "jab" | "light" | "medium" | "heavy" | "launcher" | "special";

export interface CombatFrameData {
  readonly id: string;
  /** Frames before the hitbox becomes active. */
  readonly startup: number;
  /** Frames the hitbox is live. */
  readonly active: number;
  /** Frames after the active window during which the attacker cannot act. */
  readonly recovery: number;
  /** Frames the defender is stunned on hit. */
  readonly hitstun: number;
  /** Frames the defender is stunned on block. */
  readonly blockstun: number;
  /** Horizontal reach of the hitbox, in world units. */
  readonly range: number;
  readonly damage: number;
  /** Knockback impulse applied on hit. */
  readonly knockback: number;
  /** Frames both fighters freeze on contact, which sells the impact. */
  readonly hitstop: number;
}

export interface CombatFrameAdvantage {
  readonly id: string;
  /**
   * Frame advantage on hit: positive means the attacker acts first afterwards.
   *
   * `hitstun - recovery`. A move that is heavily plus on hit can start a combo; one
   * that is minus on hit cannot.
   */
  readonly onHit: number;
  /**
   * Frame advantage on block. Negative means the defender can act first and punish.
   *
   * This is the number that creates a spacing game. When every move is plus on block
   * there is no risk in attacking.
   */
  readonly onBlock: number;
  /** Frames the attacker is helpless after a whiff: the punish window. */
  readonly whiffPunishWindow: number;
  /** Total frames the move occupies. */
  readonly totalFrames: number;
}

/** Frame advantage for a move. */
export function combatFrameAdvantage(move: CombatFrameData): CombatFrameAdvantage {
  return {
    id: move.id,
    onHit: move.hitstun - move.recovery,
    onBlock: move.blockstun - move.recovery,
    whiffPunishWindow: move.recovery,
    totalFrames: move.startup + move.active + move.recovery
  };
}

export interface CombatFrameCheck {
  readonly id: string;
  readonly moveId: string;
  readonly description: string;
  readonly passes: boolean;
  readonly detail: string;
}

export interface CombatFrameReport {
  readonly schema: "aura3d-combat-frame-data/1.0";
  readonly moves: readonly (CombatFrameData & { readonly advantage: CombatFrameAdvantage })[];
  readonly checks: readonly CombatFrameCheck[];
  readonly passes: boolean;
}

export interface CombatFrameLimits {
  /** Longest readable active window. Real games use 2-5 frames. */
  readonly maxActiveFrames?: number | undefined;
  /** Shortest active window that can still connect reliably. */
  readonly minActiveFrames?: number | undefined;
  /**
   * Minimum recovery as a multiple of the active window.
   *
   * This is the ratio that creates risk. Below roughly 2x an attack is nearly free.
   */
  readonly minRecoveryToActiveRatio?: number | undefined;
  /** Maximum frame advantage on block. Above 0 every move is safe. */
  readonly maxOnBlock?: number | undefined;
  /** Minimum punish window after a whiff, in frames. */
  readonly minWhiffPunishWindow?: number | undefined;
  /** Minimum hitstop, so contact reads as impact. */
  readonly minHitstop?: number | undefined;
}

/**
 * Validate a move table as frame data.
 *
 * This is the check that did not exist. It fails a table whose active windows are so
 * long that damage cannot correspond to the animation, and one whose recoveries are so
 * short that whiffing carries no risk.
 */
export function validateCombatFrameData(
  moves: readonly CombatFrameData[],
  limits: CombatFrameLimits = {}
): CombatFrameReport {
  const maxActive = limits.maxActiveFrames ?? 6;
  const minActive = limits.minActiveFrames ?? 2;
  const minRecoveryRatio = limits.minRecoveryToActiveRatio ?? 2;
  const maxOnBlock = limits.maxOnBlock ?? 2;
  const minWhiffWindow = limits.minWhiffPunishWindow ?? 8;
  const minHitstop = limits.minHitstop ?? 2;

  const checks: CombatFrameCheck[] = [];
  const annotated = moves.map((move) => ({ ...move, advantage: combatFrameAdvantage(move) }));

  for (const move of annotated) {
    checks.push({
      id: "active-window-readable",
      moveId: move.id,
      description: `active window must be ${minActive}-${maxActive} frames so damage corresponds to the animation`,
      passes: move.active >= minActive && move.active <= maxActive,
      detail: `${move.active} active frames`
    });
    checks.push({
      id: "recovery-creates-risk",
      moveId: move.id,
      description: `recovery must be at least ${minRecoveryRatio}x the active window so whiffing is punishable`,
      passes: move.active <= 0 || move.recovery >= move.active * minRecoveryRatio,
      detail: `recovery ${move.recovery} vs active ${move.active} (ratio ${round(move.active > 0 ? move.recovery / move.active : Number.POSITIVE_INFINITY)})`
    });
    checks.push({
      id: "not-safe-on-block",
      moveId: move.id,
      description: `frame advantage on block must not exceed +${maxOnBlock}, or the move carries no risk`,
      passes: move.advantage.onBlock <= maxOnBlock,
      detail: `${move.advantage.onBlock >= 0 ? "+" : ""}${move.advantage.onBlock} on block`
    });
    checks.push({
      id: "whiff-punishable",
      moveId: move.id,
      description: `a whiff must leave at least ${minWhiffWindow} frames of punish window`,
      passes: move.advantage.whiffPunishWindow >= minWhiffWindow,
      detail: `${move.advantage.whiffPunishWindow} frame punish window`
    });
    checks.push({
      id: "hitstop-sells-impact",
      moveId: move.id,
      description: `hitstop must be at least ${minHitstop} frames so contact reads as impact`,
      passes: move.hitstop >= minHitstop,
      detail: `${move.hitstop} frames of hitstop`
    });
    checks.push({
      id: "startup-before-active",
      moveId: move.id,
      description: "a move must have startup frames, so an attack telegraphs before it can hit",
      passes: move.startup >= 1,
      detail: `${move.startup} startup frames`
    });
  }

  // Table-level: stronger moves must be slower, or there is no reason to use a jab.
  const byDamage = [...annotated].sort((a, b) => a.damage - b.damage);
  for (let index = 0; index < byDamage.length - 1; index += 1) {
    const weaker = byDamage[index]!;
    const stronger = byDamage[index + 1]!;
    if (weaker.damage === stronger.damage) continue;
    checks.push({
      id: "damage-costs-speed",
      moveId: `${weaker.id}->${stronger.id}`,
      description: "a stronger move must be slower to start or riskier on block",
      passes: stronger.startup >= weaker.startup || stronger.advantage.onBlock <= weaker.advantage.onBlock,
      detail: `${weaker.id} ${weaker.damage}dmg/${weaker.startup}f vs ${stronger.id} ${stronger.damage}dmg/${stronger.startup}f`
    });
  }

  return {
    schema: "aura3d-combat-frame-data/1.0",
    moves: annotated,
    checks,
    passes: checks.every((check) => check.passes)
  };
}

export interface CombatMoveRequest {
  readonly id: string;
  readonly role: CombatMoveRole;
  /** Reach in world units. Longer moves are made slower to start. */
  readonly range: number;
  /** Damage, used to scale risk. */
  readonly damage: number;
}

const ROLE_PROFILES: Record<CombatMoveRole, {
  readonly startup: number;
  readonly active: number;
  readonly recovery: number;
  readonly hitstun: number;
  readonly blockstun: number;
  readonly hitstop: number;
  readonly knockback: number;
}> = {
  /*
   * Frame data shaped like a real fighting game.
   *
   * A jab is fast and nearly neutral on block, so it is the safe poke. Heavier moves
   * start slower, recover longer and are clearly minus on block, so using them is a
   * decision rather than a default. Every active window is short, which is what makes a
   * hit correspond to the moment of contact.
   */
  jab: { startup: 3, active: 2, recovery: 7, hitstun: 12, blockstun: 8, hitstop: 3, knockback: 0.18 },
  light: { startup: 5, active: 3, recovery: 10, hitstun: 15, blockstun: 10, hitstop: 4, knockback: 0.28 },
  medium: { startup: 8, active: 3, recovery: 15, hitstun: 19, blockstun: 12, hitstop: 5, knockback: 0.42 },
  heavy: { startup: 12, active: 4, recovery: 22, hitstun: 26, blockstun: 15, hitstop: 7, knockback: 0.7 },
  launcher: { startup: 11, active: 3, recovery: 26, hitstun: 34, blockstun: 14, hitstop: 6, knockback: 0.55 },
  special: { startup: 14, active: 5, recovery: 28, hitstun: 30, blockstun: 18, hitstop: 9, knockback: 1.05 }
};

/**
 * Derive balanced frame data from a move's intended role.
 *
 * Reach adds startup, because a longer poke should be slower to commit to. Damage adds
 * recovery, so a big hit is a bigger risk. Neither is a free parameter.
 */
export function solveCombatFrameData(
  request: CombatMoveRequest,
  options: { readonly referenceRange?: number | undefined; readonly referenceDamage?: number | undefined } = {}
): CombatFrameData {
  const profile = ROLE_PROFILES[request.role];
  const referenceRange = Math.max(0.1, options.referenceRange ?? 1.4);
  const referenceDamage = Math.max(1, options.referenceDamage ?? 10);
  // Reach beyond the reference costs startup; damage beyond it costs recovery.
  const rangePenalty = Math.max(0, request.range / referenceRange - 1);
  const damagePenalty = Math.max(0, request.damage / referenceDamage - 1);
  return {
    id: request.id,
    startup: Math.round(profile.startup * (1 + rangePenalty * 0.4)),
    active: profile.active,
    recovery: Math.round(profile.recovery * (1 + damagePenalty * 0.3)),
    hitstun: profile.hitstun,
    blockstun: profile.blockstun,
    range: round(request.range),
    damage: request.damage,
    knockback: round(profile.knockback * (1 + damagePenalty * 0.2)),
    hitstop: profile.hitstop
  };
}

export type CombatAiAggression = "defensive" | "balanced" | "aggressive";

export interface CombatAiConfig {
  readonly moves: readonly CombatFrameData[];
  /**
   * Reaction delay in frames.
   *
   * A zero-delay AI is not a credible opponent: it blocks the instant a button is
   * pressed, which reads as cheating rather than as skill. Human reaction is roughly
   * 12-18 frames at 60fps.
   */
  readonly reactionFrames?: number | undefined;
  /** Preferred distance to hold, in world units. Defaults to just outside its best poke. */
  readonly preferredRange?: number | undefined;
  readonly aggression?: CombatAiAggression | undefined;
  /** Frames to wait after acting before acting again. */
  readonly cooldownFrames?: number | undefined;
  /** Deterministic seed. */
  readonly seed?: number | undefined;
}

export interface CombatAiObservation {
  /** Horizontal distance to the opponent. */
  readonly distance: number;
  /** Opponent's current move id, or undefined when neutral. */
  readonly opponentMoveId?: string | undefined;
  /** Frames the opponent's current move has been running. */
  readonly opponentMoveFrame?: number | undefined;
  /** True when the AI is currently in hitstun or blockstun and cannot act. */
  readonly stunned?: boolean | undefined;
  /** Frames remaining in the AI's own current move, 0 when free. */
  readonly ownRecoveryFrames?: number | undefined;
  readonly ownHealthFraction?: number | undefined;
  readonly opponentHealthFraction?: number | undefined;
}

export interface CombatAiDecision {
  /** Move to start this frame, or undefined to hold. */
  readonly moveId: string | undefined;
  /** Whether to block. */
  readonly block: boolean;
  /** Movement intent: -1 retreat, 0 hold, 1 advance. */
  readonly approach: -1 | 0 | 1;
  /** Why this decision was made, for evidence and debugging. */
  readonly reason: string;
}

export interface CombatAi {
  readonly kind: "aura-combat-ai";
  decide(observation: CombatAiObservation): CombatAiDecision;
  reset(): void;
  telemetry(): {
    readonly reactionFrames: number;
    readonly preferredRange: number;
    readonly aggression: CombatAiAggression;
    readonly decisionCount: number;
    readonly punishAttempts: number;
    readonly blockAttempts: number;
    readonly lastDecision: CombatAiDecision;
  };
}

const AGGRESSION_PROFILES: Record<CombatAiAggression, {
  readonly attackChance: number;
  readonly blockChance: number;
  readonly spacingTolerance: number;
}> = {
  defensive: { attackChance: 0.35, blockChance: 0.9, spacingTolerance: 0.3 },
  balanced: { attackChance: 0.6, blockChance: 0.72, spacingTolerance: 0.2 },
  aggressive: { attackChance: 0.85, blockChance: 0.5, spacingTolerance: 0.12 }
};

/**
 * Create a reactive combat AI.
 *
 * Behaves like an opponent rather than a timer: it holds a preferred range, reacts to a
 * telegraphed attack after a delay, blocks what it has had time to see, and punishes a
 * move whose recovery leaves a window. Deterministic for a given seed.
 */
export function createCombatAi(config: CombatAiConfig): CombatAi {
  const moves = new Map(config.moves.map((move) => [move.id, move]));
  const aggression = config.aggression ?? "balanced";
  const profile = AGGRESSION_PROFILES[aggression];
  const reactionFrames = Math.max(0, config.reactionFrames ?? 14);
  const cooldownFrames = Math.max(0, config.cooldownFrames ?? 18);
  // The fastest move is the punish tool; the longest-reaching is the poke.
  const fastest = [...moves.values()].sort((a, b) => a.startup - b.startup)[0];
  const longest = [...moves.values()].sort((a, b) => b.range - a.range)[0];
  /*
   * Preferred range sits just *inside* the AI's longest poke.
   *
   * Setting it outside its own reach looked like good spacing discipline and was in fact
   * a deadlock: the AI held a distance from which nothing could connect, so it never
   * attacked and only ever adjusted position. Real fighting-game spacing is to hold the
   * edge of your own longest threat -- close enough to poke, far enough that the
   * opponent must commit to reach you.
   */
  const preferredRange = config.preferredRange ?? (longest ? longest.range * 0.92 : 1.5);

  let seenOpponentMove: string | undefined;
  let framesSinceSeen = 0;
  let cooldown = 0;
  let decisionCount = 0;
  let punishAttempts = 0;
  let blockAttempts = 0;
  let random = (config.seed ?? 1) >>> 0 || 1;
  const nextRandom = () => {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    return (random >>> 0) / 0xffffffff;
  };
  let lastDecision: CombatAiDecision = { moveId: undefined, block: false, approach: 0, reason: "initial" };

  return {
    kind: "aura-combat-ai",
    decide(observation) {
      decisionCount += 1;
      cooldown = Math.max(0, cooldown - 1);

      // Track how long the opponent's current move has been visible, so reaction is
      // delayed rather than instant.
      if (observation.opponentMoveId !== seenOpponentMove) {
        seenOpponentMove = observation.opponentMoveId;
        framesSinceSeen = 0;
      } else {
        framesSinceSeen += 1;
      }
      const reacted = seenOpponentMove !== undefined && framesSinceSeen >= reactionFrames;

      const decide = (decision: CombatAiDecision) => {
        lastDecision = decision;
        return decision;
      };

      // Stunned or mid-move: nothing to decide.
      if (observation.stunned === true || (observation.ownRecoveryFrames ?? 0) > 0) {
        return decide({ moveId: undefined, block: false, approach: 0, reason: "recovering" });
      }

      const opponentMove = observation.opponentMoveId ? moves.get(observation.opponentMoveId) : undefined;

      /*
       * Punish. When the opponent's move is in its recovery and the AI's fastest move
       * can start and connect inside that window, take it. This is the behaviour that
       * makes spacing matter, and it is only possible because recovery frames exist.
       */
      if (reacted && opponentMove && fastest && cooldown <= 0) {
        const opponentFrame = observation.opponentMoveFrame ?? 0;
        const recoveryStart = opponentMove.startup + opponentMove.active;
        const framesLeftInRecovery = recoveryStart + opponentMove.recovery - opponentFrame;
        const inRecovery = opponentFrame >= recoveryStart && framesLeftInRecovery > 0;
        if (inRecovery && framesLeftInRecovery > fastest.startup && observation.distance <= fastest.range) {
          punishAttempts += 1;
          cooldown = cooldownFrames;
          return decide({ moveId: fastest.id, block: false, approach: 0, reason: "punish-recovery" });
        }
      }

      /*
       * Block. Only after the reaction delay, and only while the attack could still
       * reach: blocking a move that has already recovered is not defence, it is a tell
       * that the AI is reading state it should not have.
       */
      if (reacted && opponentMove) {
        const opponentFrame = observation.opponentMoveFrame ?? 0;
        const threatening = opponentFrame < opponentMove.startup + opponentMove.active;
        if (threatening && observation.distance <= opponentMove.range * 1.15 && nextRandom() < profile.blockChance) {
          blockAttempts += 1;
          return decide({ moveId: undefined, block: true, approach: 0, reason: "block-incoming" });
        }
      }

      // Spacing. Hold the preferred range; step in to attack, step out when crowded.
      const rangeError = observation.distance - preferredRange;
      if (Math.abs(rangeError) > profile.spacingTolerance) {
        const approach = rangeError > 0 ? 1 : -1;
        // Attack on the way in when a move actually reaches.
        const reachable = [...moves.values()].filter((move) => observation.distance <= move.range);
        if (approach === 1 && reachable.length > 0 && cooldown <= 0 && nextRandom() < profile.attackChance) {
          const chosen = reachable[Math.floor(nextRandom() * reachable.length)] ?? reachable[0]!;
          cooldown = cooldownFrames;
          return decide({ moveId: chosen.id, block: false, approach: 0, reason: "attack-in-range" });
        }
        return decide({ moveId: undefined, block: false, approach, reason: approach > 0 ? "close-distance" : "create-space" });
      }

      // At preferred range with nothing to react to: poke when the odds are taken.
      if (cooldown <= 0 && nextRandom() < profile.attackChance) {
        const reachable = [...moves.values()].filter((move) => observation.distance <= move.range);
        if (reachable.length > 0) {
          const chosen = reachable[Math.floor(nextRandom() * reachable.length)] ?? reachable[0]!;
          cooldown = cooldownFrames;
          return decide({ moveId: chosen.id, block: false, approach: 0, reason: "poke-at-range" });
        }
      }
      return decide({ moveId: undefined, block: false, approach: 0, reason: "hold-range" });
    },
    reset() {
      seenOpponentMove = undefined;
      framesSinceSeen = 0;
      cooldown = 0;
      decisionCount = 0;
      punishAttempts = 0;
      blockAttempts = 0;
      random = (config.seed ?? 1) >>> 0 || 1;
      lastDecision = { moveId: undefined, block: false, approach: 0, reason: "reset" };
    },
    telemetry() {
      return {
        reactionFrames,
        preferredRange: round(preferredRange),
        aggression,
        decisionCount,
        punishAttempts,
        blockAttempts,
        lastDecision
      };
    }
  };
}

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}
