/**
 * @fileoverview Condition leaf nodes for behavior trees.
 * Provides condition nodes with comparison operators and blackboard queries.
 * @module ai/behavior/BTCondition
 */

import { BTNode, NodeStatus } from './BTNode';
import type { BehaviorContext } from './BehaviorTree';
import type { BlackboardValue } from './Blackboard';

/**
 * Condition function signature.
 * Returns true if condition is met, false otherwise.
 */
export type ConditionFunction = (context: BehaviorContext) => boolean;

/**
 * Comparison operators for blackboard value comparisons.
 */
export enum ComparisonOperator {
  /** Equal to */
  EQUAL = 'equal',
  /** Not equal to */
  NOT_EQUAL = 'not_equal',
  /** Less than */
  LESS_THAN = 'less_than',
  /** Less than or equal to */
  LESS_THAN_OR_EQUAL = 'less_than_or_equal',
  /** Greater than */
  GREATER_THAN = 'greater_than',
  /** Greater than or equal to */
  GREATER_THAN_OR_EQUAL = 'greater_than_or_equal',
}

/**
 * Condition node - evaluates a condition and returns success/failure.
 * Never returns RUNNING - conditions are instantaneous.
 *
 * @example
 * ```typescript
 * const hasTarget = new BTCondition('HasTarget', (context) => {
 *   return context.blackboard.has('target');
 * });
 *
 * const healthLow = new BTCondition('HealthLow', (context) => {
 *   const health = context.blackboard.get('health', 100);
 *   return health < 30;
 * });
 * ```
 */
export class BTCondition extends BTNode {
  /** Condition function to evaluate */
  private readonly condition: ConditionFunction;

  /**
   * Creates a new condition node.
   *
   * @param name - Node name
   * @param condition - Condition function
   */
  constructor(name: string, condition: ConditionFunction) {
    super(name);
    this.condition = condition;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    try {
      const result = this.condition(context);
      this.status = result ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
    } catch (error) {
      console.error(`Condition "${this.name}" error:`, error);
      this.status = NodeStatus.FAILURE;
    }

    return this.status;
  }
}

/**
 * HasKey condition - checks if a blackboard key exists.
 *
 * @example
 * ```typescript
 * const hasTarget = new BTHasKey('HasTarget', 'target');
 * const hasEnemy = new BTHasKey('HasEnemy', 'nearestEnemy');
 * ```
 */
export class BTHasKey extends BTNode {
  /** Blackboard key to check */
  private readonly key: string;

  /**
   * Creates a new has-key condition node.
   *
   * @param name - Node name
   * @param key - Blackboard key to check
   */
  constructor(name: string = 'HasKey', key: string) {
    super(name);
    this.key = key;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    this.status = context.blackboard.has(this.key) ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
    return this.status;
  }
}

/**
 * Compare condition - compares a blackboard value with a reference value.
 *
 * @example
 * ```typescript
 * const healthLow = new BTCompare(
 *   'HealthLow',
 *   'health',
 *   ComparisonOperator.LESS_THAN,
 *   30
 * );
 *
 * const hasMaxAmmo = new BTCompare(
 *   'HasMaxAmmo',
 *   'ammo',
 *   ComparisonOperator.EQUAL,
 *   100
 * );
 * ```
 */
export class BTCompare extends BTNode {
  /** Blackboard key to compare */
  private readonly key: string;

  /** Comparison operator */
  private readonly operator: ComparisonOperator;

  /** Reference value or function */
  private readonly reference: BlackboardValue | ((context: BehaviorContext) => BlackboardValue);

  /**
   * Creates a new compare condition node.
   *
   * @param name - Node name
   * @param key - Blackboard key to compare
   * @param operator - Comparison operator
   * @param reference - Reference value or function
   */
  constructor(
    name: string = 'Compare',
    key: string,
    operator: ComparisonOperator,
    reference: BlackboardValue | ((context: BehaviorContext) => BlackboardValue)
  ) {
    super(name);
    this.key = key;
    this.operator = operator;
    this.reference = reference;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    const value = context.blackboard.get(this.key);
    const referenceValue = typeof this.reference === 'function' ? this.reference(context) : this.reference;

    const result = this.compare(value, referenceValue);
    this.status = result ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
    return this.status;
  }

  /**
   * Performs the comparison based on operator.
   * @private
   */
  private compare(value: BlackboardValue, reference: BlackboardValue): boolean {
    switch (this.operator) {
      case ComparisonOperator.EQUAL:
        return value === reference;

      case ComparisonOperator.NOT_EQUAL:
        return value !== reference;

      case ComparisonOperator.LESS_THAN:
        return typeof value === 'number' && typeof reference === 'number' && value < reference;

      case ComparisonOperator.LESS_THAN_OR_EQUAL:
        return typeof value === 'number' && typeof reference === 'number' && value <= reference;

      case ComparisonOperator.GREATER_THAN:
        return typeof value === 'number' && typeof reference === 'number' && value > reference;

      case ComparisonOperator.GREATER_THAN_OR_EQUAL:
        return typeof value === 'number' && typeof reference === 'number' && value >= reference;

      default:
        return false;
    }
  }
}

/**
 * IsTrue condition - checks if a blackboard boolean is true.
 *
 * @example
 * ```typescript
 * const isAlive = new BTIsTrue('IsAlive', 'isAlive');
 * const isPlayerNearby = new BTIsTrue('IsPlayerNearby', 'playerNearby');
 * ```
 */
export class BTIsTrue extends BTNode {
  /** Blackboard key to check */
  private readonly key: string;

  /**
   * Creates a new is-true condition node.
   *
   * @param name - Node name
   * @param key - Blackboard key to check
   */
  constructor(name: string = 'IsTrue', key: string) {
    super(name);
    this.key = key;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    const value = context.blackboard.get(this.key, false);
    this.status = value === true ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
    return this.status;
  }
}

/**
 * IsFalse condition - checks if a blackboard boolean is false.
 *
 * @example
 * ```typescript
 * const isDead = new BTIsFalse('IsDead', 'isAlive');
 * const noEnemiesNearby = new BTIsFalse('NoEnemies', 'enemiesNearby');
 * ```
 */
export class BTIsFalse extends BTNode {
  /** Blackboard key to check */
  private readonly key: string;

  /**
   * Creates a new is-false condition node.
   *
   * @param name - Node name
   * @param key - Blackboard key to check
   */
  constructor(name: string = 'IsFalse', key: string) {
    super(name);
    this.key = key;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    const value = context.blackboard.get(this.key, true);
    this.status = value === false ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
    return this.status;
  }
}

/**
 * Random condition - succeeds with a given probability.
 *
 * @example
 * ```typescript
 * // 50% chance of success
 * const coinFlip = new BTRandom('CoinFlip', 0.5);
 *
 * // 80% chance of success
 * const mostlyTrue = new BTRandom('MostlyTrue', 0.8);
 * ```
 */
export class BTRandom extends BTNode {
  /** Success probability (0.0 to 1.0) */
  private readonly probability: number;

  /**
   * Creates a new random condition node.
   *
   * @param name - Node name
   * @param probability - Success probability (0.0 to 1.0)
   */
  constructor(name: string = 'Random', probability: number) {
    super(name);
    this.probability = Math.max(0, Math.min(1, probability));
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    const result = Math.random() < this.probability;
    this.status = result ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
    return this.status;
  }
}

/**
 * InRange condition - checks if a numeric value is within a range.
 *
 * @example
 * ```typescript
 * const healthMedium = new BTInRange('HealthMedium', 'health', 30, 70);
 * const speedNormal = new BTInRange('SpeedNormal', 'speed', 4.5, 5.5);
 * ```
 */
export class BTInRange extends BTNode {
  /** Blackboard key to check */
  private readonly key: string;

  /** Minimum value (inclusive) */
  private readonly min: number;

  /** Maximum value (inclusive) */
  private readonly max: number;

  /**
   * Creates a new in-range condition node.
   *
   * @param name - Node name
   * @param key - Blackboard key to check
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   */
  constructor(name: string = 'InRange', key: string, min: number, max: number) {
    super(name);
    this.key = key;
    this.min = min;
    this.max = max;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    const value = context.blackboard.get<number>(this.key, 0);
    const result = typeof value === 'number' && value >= this.min && value <= this.max;

    this.status = result ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
    return this.status;
  }
}

/**
 * Always condition - always returns SUCCESS.
 * Useful for testing or placeholder nodes.
 *
 * @example
 * ```typescript
 * const alwaysTrue = new BTAlways('AlwaysTrue');
 * ```
 */
export class BTAlways extends BTNode {
  /**
   * Creates a new always condition node.
   *
   * @param name - Node name
   */
  constructor(name: string = 'Always') {
    super(name);
  }

  tick(context: BehaviorContext): NodeStatus {
    this.tickCount++;
    this.lastTickTime = Date.now();
    this.status = NodeStatus.SUCCESS;
    return NodeStatus.SUCCESS;
  }
}

/**
 * Never condition - always returns FAILURE.
 * Useful for testing or disabling branches.
 *
 * @example
 * ```typescript
 * const neverTrue = new BTNever('NeverTrue');
 * ```
 */
export class BTNever extends BTNode {
  /**
   * Creates a new never condition node.
   *
   * @param name - Node name
   */
  constructor(name: string = 'Never') {
    super(name);
  }

  tick(context: BehaviorContext): NodeStatus {
    this.tickCount++;
    this.lastTickTime = Date.now();
    this.status = NodeStatus.FAILURE;
    return NodeStatus.FAILURE;
  }
}
