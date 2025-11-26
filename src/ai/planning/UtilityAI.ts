/**
 * @fileoverview Utility-based AI decision making.
 * Implements utility AI with actions, considerations, and scoring.
 * @module ai/planning/UtilityAI
 */

import { Consideration } from './Consideration';
import { Logger } from '../../core/Logger';

/**
 * Scoring method for combining considerations.
 */
export enum ScoringMethod {
  /** Multiply all consideration scores */
  MULTIPLY = 'multiply',
  /** Average all consideration scores */
  AVERAGE = 'average',
  /** Take minimum consideration score */
  MIN = 'min',
  /** Take maximum consideration score */
  MAX = 'max',
  /** Sum all consideration scores (clamped to 1) */
  SUM = 'sum',
}

/**
 * Utility action.
 */
export interface UtilityAction {
  /** Action name */
  name: string;
  /** Considerations for this action */
  considerations: Consideration[];
  /** Scoring method */
  scoringMethod: ScoringMethod;
  /** Base bonus score */
  baseScore: number;
  /** Action callback */
  execute?: (context: any) => void;
  /** Action enabled state */
  enabled: boolean;
}

/**
 * Action score result.
 */
export interface ActionScore {
  /** Action reference */
  action: UtilityAction;
  /** Calculated utility score */
  score: number;
  /** Individual consideration scores */
  considerationScores: Map<string, number>;
}

/**
 * Utility AI configuration.
 */
export interface UtilityAIConfig {
  /** Minimum score for action selection */
  minScore: number;
  /** Enable score caching */
  enableCaching: boolean;
  /** Cache invalidation time in milliseconds */
  cacheTimeout: number;
  /** Enable debug logging */
  debugLogging: boolean;
}

/**
 * Default utility AI configuration.
 */
export const DefaultUtilityAIConfig: UtilityAIConfig = {
  minScore: 0.0,
  enableCaching: false,
  cacheTimeout: 100,
  debugLogging: false,
};

/**
 * Utility AI decision maker.
 * Selects actions based on utility scores from considerations.
 *
 * @example
 * ```typescript
 * const utilityAI = new UtilityAI();
 *
 * // Define attack action
 * const attackAction: UtilityAction = {
 *   name: 'Attack',
 *   considerations: [
 *     Consideration.linear('HasWeapon',
 *       (ctx) => ctx.agent.hasWeapon ? 1.0 : 0.0
 *     ),
 *     Consideration.inverse('Distance',
 *       (ctx) => ctx.agent.distanceTo(ctx.target) / 50.0
 *     ),
 *     Consideration.linear('Health',
 *       (ctx) => ctx.agent.health / ctx.agent.maxHealth
 *     ),
 *   ],
 *   scoringMethod: ScoringMethod.MULTIPLY,
 *   baseScore: 0.0,
 *   execute: (ctx) => {
 *     ctx.agent.attack(ctx.target);
 *   },
 *   enabled: true
 * };
 *
 * // Define flee action
 * const fleeAction: UtilityAction = {
 *   name: 'Flee',
 *   considerations: [
 *     Consideration.inverse('Health',
 *       (ctx) => ctx.agent.health / ctx.agent.maxHealth,
 *       2.0 // Higher weight
 *     ),
 *     Consideration.linear('Danger',
 *       (ctx) => ctx.enemyCount / 5.0
 *     ),
 *   ],
 *   scoringMethod: ScoringMethod.MULTIPLY,
 *   baseScore: 0.0,
 *   execute: (ctx) => {
 *     ctx.agent.flee();
 *   },
 *   enabled: true
 * };
 *
 * utilityAI.addAction(attackAction);
 * utilityAI.addAction(fleeAction);
 *
 * // Evaluate and select best action
 * const context = {
 *   agent: agent,
 *   target: enemy,
 *   enemyCount: 3
 * };
 *
 * const bestAction = utilityAI.selectBestAction(context);
 * if (bestAction && bestAction.execute) {
 *   bestAction.execute(context);
 * }
 * ```
 */
export class UtilityAI {
  /** Available actions */
  private actions: UtilityAction[];

  /** Configuration */
  private config: UtilityAIConfig;

  /** Score cache */
  private scoreCache: Map<string, { score: ActionScore; timestamp: number }>;

  /** Logger instance */
  private logger: Logger;

  /**
   * Creates a new utility AI.
   *
   * @param config - Configuration
   */
  constructor(config: UtilityAIConfig = DefaultUtilityAIConfig) {
    this.actions = [];
    this.config = { ...config };
    this.scoreCache = new Map();
    this.logger = new Logger('UtilityAI');
  }

  /**
   * Adds an action to the utility AI.
   *
   * @param action - Action to add
   *
   * @example
   * ```typescript
   * utilityAI.addAction({
   *   name: 'Heal',
   *   considerations: [
   *     Consideration.inverse('Health',
   *       (ctx) => ctx.agent.health / ctx.agent.maxHealth
   *     ),
   *   ],
   *   scoringMethod: ScoringMethod.MULTIPLY,
   *   baseScore: 0.0,
   *   execute: (ctx) => ctx.agent.heal(),
   *   enabled: true
   * });
   * ```
   */
  addAction(action: UtilityAction): void {
    this.actions.push(action);
  }

  /**
   * Removes an action.
   *
   * @param name - Action name
   */
  removeAction(name: string): void {
    this.actions = this.actions.filter(a => a.name !== name);
    this.scoreCache.delete(name);
  }

  /**
   * Gets an action by name.
   *
   * @param name - Action name
   * @returns Action or undefined
   */
  getAction(name: string): UtilityAction | undefined {
    return this.actions.find(a => a.name === name);
  }

  /**
   * Enables or disables an action.
   *
   * @param name - Action name
   * @param enabled - Enabled state
   */
  setActionEnabled(name: string, enabled: boolean): void {
    const action = this.getAction(name);
    if (action) {
      action.enabled = enabled;
    }
  }

  /**
   * Evaluates all actions and returns their scores.
   *
   * @param context - Evaluation context
   * @returns Array of action scores sorted by score (highest first)
   *
   * @example
   * ```typescript
   * const scores = utilityAI.evaluateActions(context);
   * scores.forEach(s => {
   *   console.log(`${s.action.name}: ${s.score.toFixed(3)}`);
   * });
   * ```
   */
  evaluateActions(context: any): ActionScore[] {
    const scores: ActionScore[] = [];
    const now = Date.now();

    for (const action of this.actions) {
      if (!action.enabled) {
        continue;
      }

      // Check cache if enabled
      if (this.config.enableCaching) {
        const cached = this.scoreCache.get(action.name);
        if (cached && now - cached.timestamp < this.config.cacheTimeout) {
          scores.push(cached.score);
          continue;
        }
      }

      // Calculate score
      const score = this.evaluateAction(action, context);
      scores.push(score);

      // Cache if enabled
      if (this.config.enableCaching) {
        this.scoreCache.set(action.name, { score, timestamp: now });
      }
    }

    // Sort by score (highest first)
    scores.sort((a, b) => b.score - a.score);

    if (this.config.debugLogging) {
      this.logger.debug('Action scores:');
      scores.forEach(s => {
        this.logger.debug(`  ${s.action.name}: ${s.score.toFixed(3)}`);
      });
    }

    return scores;
  }

  /**
   * Evaluates a single action.
   * @private
   */
  private evaluateAction(action: UtilityAction, context: any): ActionScore {
    const considerationScores = new Map<string, number>();
    const scores: number[] = [];

    // Evaluate each consideration
    for (const consideration of action.considerations) {
      const score = consideration.evaluate(context);
      considerationScores.set(consideration.name, score);
      scores.push(score);
    }

    // Combine scores based on method
    let finalScore = this.combineScores(scores, action.scoringMethod);

    // Apply base score
    finalScore += action.baseScore;

    // Clamp to 0-1
    finalScore = Math.max(0, Math.min(1, finalScore));

    return {
      action,
      score: finalScore,
      considerationScores,
    };
  }

  /**
   * Combines consideration scores using the specified method.
   * @private
   */
  private combineScores(scores: number[], method: ScoringMethod): number {
    if (scores.length === 0) {
      return 0;
    }

    switch (method) {
      case ScoringMethod.MULTIPLY:
        return scores.reduce((acc, score) => acc * score, 1.0);

      case ScoringMethod.AVERAGE:
        return scores.reduce((acc, score) => acc + score, 0) / scores.length;

      case ScoringMethod.MIN:
        return Math.min(...scores);

      case ScoringMethod.MAX:
        return Math.max(...scores);

      case ScoringMethod.SUM:
        const sum = scores.reduce((acc, score) => acc + score, 0);
        return Math.min(sum, 1.0);

      default:
        return scores.reduce((acc, score) => acc * score, 1.0);
    }
  }

  /**
   * Selects the best action based on utility scores.
   *
   * @param context - Evaluation context
   * @returns Best action or null
   *
   * @example
   * ```typescript
   * const action = utilityAI.selectBestAction(context);
   * if (action && action.execute) {
   *   action.execute(context);
   * }
   * ```
   */
  selectBestAction(context: any): UtilityAction | null {
    const scores = this.evaluateActions(context);

    if (scores.length === 0) {
      return null;
    }

    const best = scores[0]!;

    // Check minimum score threshold
    if (best.score < this.config.minScore) {
      return null;
    }

    return best.action;
  }

  /**
   * Selects an action using weighted random selection.
   * Higher scoring actions are more likely to be selected.
   *
   * @param context - Evaluation context
   * @returns Selected action or null
   *
   * @example
   * ```typescript
   * const action = utilityAI.selectWeightedRandom(context);
   * if (action && action.execute) {
   *   action.execute(context);
   * }
   * ```
   */
  selectWeightedRandom(context: any): UtilityAction | null {
    const scores = this.evaluateActions(context);

    if (scores.length === 0) {
      return null;
    }

    // Filter by minimum score
    const validScores = scores.filter(s => s.score >= this.config.minScore);

    if (validScores.length === 0) {
      return null;
    }

    // Calculate total weight
    const totalWeight = validScores.reduce((sum, s) => sum + s.score, 0);

    if (totalWeight === 0) {
      return null;
    }

    // Random selection
    let random = Math.random() * totalWeight;

    for (const score of validScores) {
      random -= score.score;
      if (random <= 0) {
        return score.action;
      }
    }

    return validScores[0]!.action;
  }

  /**
   * Gets the top N actions by score.
   *
   * @param context - Evaluation context
   * @param count - Number of actions to return
   * @returns Array of top actions
   */
  getTopActions(context: any, count: number): UtilityAction[] {
    const scores = this.evaluateActions(context);
    return scores
      .filter(s => s.score >= this.config.minScore)
      .slice(0, count)
      .map(s => s.action);
  }

  /**
   * Clears the score cache.
   */
  clearCache(): void {
    this.scoreCache.clear();
  }

  /**
   * Gets all actions.
   *
   * @returns Array of actions
   */
  getAllActions(): UtilityAction[] {
    return [...this.actions];
  }

  /**
   * Clears all actions.
   */
  clearActions(): void {
    this.actions = [];
    this.scoreCache.clear();
  }

  /**
   * Gets configuration.
   *
   * @returns Current configuration
   */
  getConfig(): Readonly<UtilityAIConfig> {
    return this.config;
  }

  /**
   * Updates configuration.
   *
   * @param config - New configuration (partial)
   */
  updateConfig(config: Partial<UtilityAIConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
