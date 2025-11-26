/**
 * @fileoverview State condition evaluation for transition guards.
 * Supports comparison operators, logical operators, and compound conditions.
 * @module ai/fsm/StateCondition
 */

import { Blackboard } from '../Blackboard';

/**
 * Comparison operators for state conditions.
 */
export type ComparisonOperator = '==' | '!=' | '>' | '<' | '>=' | '<=';

/**
 * Logical operators for compound conditions.
 */
export type LogicalOperator = 'and' | 'or' | 'not';

/**
 * State condition for evaluating transition guards.
 * Supports simple comparisons and complex logical combinations.
 *
 * @example
 * ```typescript
 * // Simple comparison
 * const healthLow = StateCondition.compare('health', '<', 50);
 *
 * // Compound conditions
 * const shouldFlee = StateCondition.and([
 *   StateCondition.compare('health', '<', 30),
 *   StateCondition.compare('enemyNearby', '==', true)
 * ]);
 *
 * const canAttack = StateCondition.or([
 *   StateCondition.compare('weaponReady', '==', true),
 *   StateCondition.compare('ammo', '>', 0)
 * ]);
 *
 * // Negation
 * const notDead = StateCondition.not(
 *   StateCondition.compare('health', '<=', 0)
 * );
 *
 * // Custom condition
 * const custom = StateCondition.custom((bb) => {
 *   const x = bb.get('posX', 0);
 *   const y = bb.get('posY', 0);
 *   return Math.sqrt(x * x + y * y) < 100;
 * });
 * ```
 */
export class StateCondition {
  private readonly evaluator: (blackboard: Blackboard) => boolean;

  /**
   * Creates a new state condition.
   *
   * @param evaluator - Function that evaluates the condition
   */
  private constructor(evaluator: (blackboard: Blackboard) => boolean) {
    this.evaluator = evaluator;
  }

  /**
   * Evaluates this condition against a blackboard.
   *
   * @param blackboard - Shared data storage
   * @returns True if condition is met
   */
  evaluate(blackboard: Blackboard): boolean {
    return this.evaluator(blackboard);
  }

  /**
   * Creates a comparison condition.
   *
   * @param key - Blackboard key to compare
   * @param operator - Comparison operator
   * @param value - Value to compare against
   * @returns New state condition
   *
   * @example
   * ```typescript
   * const condition = StateCondition.compare('health', '<', 50);
   * const isAlive = StateCondition.compare('alive', '==', true);
   * ```
   */
  static compare(key: string, operator: ComparisonOperator, value: unknown): StateCondition {
    return new StateCondition((blackboard: Blackboard) => {
      const actual = blackboard.get(key);
      return this.compareValues(actual, operator, value);
    });
  }

  /**
   * Compares two values using an operator.
   * @private
   */
  private static compareValues(a: unknown, operator: ComparisonOperator, b: unknown): boolean {
    switch (operator) {
      case '==':
        return a === b;
      case '!=':
        return a !== b;
      case '>':
        return typeof a === 'number' && typeof b === 'number' && a > b;
      case '<':
        return typeof a === 'number' && typeof b === 'number' && a < b;
      case '>=':
        return typeof a === 'number' && typeof b === 'number' && a >= b;
      case '<=':
        return typeof a === 'number' && typeof b === 'number' && a <= b;
      default:
        return false;
    }
  }

  /**
   * Creates an AND condition (all conditions must be true).
   *
   * @param conditions - Array of conditions to combine
   * @returns New state condition
   *
   * @example
   * ```typescript
   * const condition = StateCondition.and([
   *   StateCondition.compare('health', '>', 50),
   *   StateCondition.compare('stamina', '>', 20),
   *   StateCondition.compare('weaponReady', '==', true)
   * ]);
   * ```
   */
  static and(conditions: StateCondition[]): StateCondition {
    return new StateCondition((blackboard: Blackboard) => {
      for (const condition of conditions) {
        if (!condition.evaluate(blackboard)) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Creates an OR condition (at least one condition must be true).
   *
   * @param conditions - Array of conditions to combine
   * @returns New state condition
   *
   * @example
   * ```typescript
   * const condition = StateCondition.or([
   *   StateCondition.compare('hasKey', '==', true),
   *   StateCondition.compare('doorBroken', '==', true),
   *   StateCondition.compare('isGhost', '==', true)
   * ]);
   * ```
   */
  static or(conditions: StateCondition[]): StateCondition {
    return new StateCondition((blackboard: Blackboard) => {
      for (const condition of conditions) {
        if (condition.evaluate(blackboard)) {
          return true;
        }
      }
      return false;
    });
  }

  /**
   * Creates a NOT condition (negates the result).
   *
   * @param condition - Condition to negate
   * @returns New state condition
   *
   * @example
   * ```typescript
   * const notDead = StateCondition.not(
   *   StateCondition.compare('health', '<=', 0)
   * );
   * ```
   */
  static not(condition: StateCondition): StateCondition {
    return new StateCondition((blackboard: Blackboard) => {
      return !condition.evaluate(blackboard);
    });
  }

  /**
   * Creates a custom condition from a function.
   *
   * @param evaluator - Custom evaluation function
   * @returns New state condition
   *
   * @example
   * ```typescript
   * const inRange = StateCondition.custom((bb) => {
   *   const distance = bb.get('distanceToEnemy', Infinity);
   *   const range = bb.get('attackRange', 10);
   *   return distance <= range;
   * });
   * ```
   */
  static custom(evaluator: (blackboard: Blackboard) => boolean): StateCondition {
    return new StateCondition(evaluator);
  }

  /**
   * Creates a condition that checks if a key exists on the blackboard.
   *
   * @param key - Blackboard key to check
   * @returns New state condition
   *
   * @example
   * ```typescript
   * const hasTarget = StateCondition.exists('target');
   * ```
   */
  static exists(key: string): StateCondition {
    return new StateCondition((blackboard: Blackboard) => {
      return blackboard.has(key);
    });
  }

  /**
   * Creates a condition that checks if a value is within a range.
   *
   * @param key - Blackboard key to check
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   * @returns New state condition
   *
   * @example
   * ```typescript
   * const healthOk = StateCondition.inRange('health', 30, 100);
   * ```
   */
  static inRange(key: string, min: number, max: number): StateCondition {
    return new StateCondition((blackboard: Blackboard) => {
      const value = blackboard.get(key);
      return typeof value === 'number' && value >= min && value <= max;
    });
  }

  /**
   * Creates a condition that's always true.
   *
   * @returns New state condition
   */
  static always(): StateCondition {
    return new StateCondition(() => true);
  }

  /**
   * Creates a condition that's always false.
   *
   * @returns New state condition
   */
  static never(): StateCondition {
    return new StateCondition(() => false);
  }

  /**
   * Combines this condition with another using AND.
   *
   * @param other - Other condition
   * @returns New combined condition
   */
  andWith(other: StateCondition): StateCondition {
    return StateCondition.and([this, other]);
  }

  /**
   * Combines this condition with another using OR.
   *
   * @param other - Other condition
   * @returns New combined condition
   */
  orWith(other: StateCondition): StateCondition {
    return StateCondition.or([this, other]);
  }

  /**
   * Negates this condition.
   *
   * @returns New negated condition
   */
  negate(): StateCondition {
    return StateCondition.not(this);
  }
}
