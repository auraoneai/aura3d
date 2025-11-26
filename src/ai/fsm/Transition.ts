/**
 * @fileoverview Transition class for state machine transitions.
 * Supports conditions, priority, and interrupt capabilities.
 * @module ai/fsm/Transition
 */

import { Blackboard } from '../Blackboard';
import { State } from './State';
import { StateCondition } from './StateCondition';

/**
 * Transition between states in a finite state machine.
 * Supports conditional evaluation, priority ordering, and interrupt capabilities.
 *
 * @example
 * ```typescript
 * // Simple transition
 * const transition = new Transition('idle', 'patrol', (bb) => {
 *   return !bb.get('enemySpotted');
 * });
 *
 * // Transition with priority and interrupt
 * const emergencyTransition = new Transition('any', 'flee', (bb) => {
 *   return bb.get('health') < 20;
 * }, {
 *   priority: 100,
 *   canInterrupt: true
 * });
 *
 * // Transition with StateCondition
 * const condition = StateCondition.and([
 *   StateCondition.compare('health', '>', 50),
 *   StateCondition.compare('enemySpotted', '==', true)
 * ]);
 * const attackTransition = new Transition('idle', 'attack', condition);
 * ```
 */
export class Transition {
  /** Source state ID (or '*' for any state) */
  readonly fromState: string;

  /** Target state ID */
  readonly toState: string;

  /** Transition condition */
  private readonly condition: (blackboard: Blackboard) => boolean;

  /** Transition priority (higher = checked first) */
  readonly priority: number;

  /** Whether this transition can interrupt the current state */
  readonly canInterrupt: boolean;

  /** Optional transition name for debugging */
  name: string;

  /** Callback invoked when transition is taken */
  onTransition?: (fromState: State, toState: State, blackboard: Blackboard) => void;

  /** Arbitrary data attached to this transition */
  private readonly data: Map<string, unknown>;

  /**
   * Creates a new transition.
   *
   * @param fromState - Source state ID (use '*' for any state)
   * @param toState - Target state ID
   * @param condition - Transition condition function or StateCondition
   * @param options - Optional configuration
   *
   * @example
   * ```typescript
   * const t1 = new Transition('idle', 'patrol', (bb) => bb.get('shouldPatrol'));
   * const t2 = new Transition('*', 'dead', (bb) => bb.get('health') <= 0, {
   *   priority: 1000,
   *   canInterrupt: true,
   *   name: 'Death'
   * });
   * ```
   */
  constructor(
    fromState: string,
    toState: string,
    condition: ((blackboard: Blackboard) => boolean) | StateCondition,
    options: {
      priority?: number;
      canInterrupt?: boolean;
      name?: string;
    } = {}
  ) {
    this.fromState = fromState;
    this.toState = toState;

    // Handle StateCondition or function
    if (typeof condition === 'function') {
      this.condition = condition;
    } else {
      this.condition = (bb: Blackboard) => condition.evaluate(bb);
    }

    this.priority = options.priority ?? 0;
    this.canInterrupt = options.canInterrupt ?? false;
    this.name = options.name ?? `${fromState}->${toState}`;
    this.data = new Map();
  }

  /**
   * Evaluates whether this transition should be taken.
   *
   * @param blackboard - Shared data storage
   * @returns True if transition condition is met
   */
  evaluate(blackboard: Blackboard): boolean {
    return this.condition(blackboard);
  }

  /**
   * Checks if this transition applies to the given source state.
   *
   * @param stateId - Source state ID
   * @returns True if transition can be taken from this state
   */
  appliesTo(stateId: string): boolean {
    return this.fromState === '*' || this.fromState === stateId;
  }

  /**
   * Sets arbitrary data on this transition.
   *
   * @param key - Data key
   * @param value - Data value
   * @returns This transition for chaining
   */
  setData(key: string, value: unknown): this {
    this.data.set(key, value);
    return this;
  }

  /**
   * Gets arbitrary data from this transition.
   *
   * @param key - Data key
   * @returns Data value or undefined
   */
  getData<T = unknown>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  /**
   * Checks if this transition has data with the given key.
   *
   * @param key - Data key
   * @returns True if data exists
   */
  hasData(key: string): boolean {
    return this.data.has(key);
  }

  /**
   * Clears all data from this transition.
   */
  clearData(): void {
    this.data.clear();
  }

  /**
   * Creates a clone of this transition.
   *
   * @returns New transition with same properties
   */
  clone(): Transition {
    const cloned = new Transition(this.fromState, this.toState, this.condition, {
      priority: this.priority,
      canInterrupt: this.canInterrupt,
      name: this.name,
    });
    cloned.onTransition = this.onTransition;
    this.data.forEach((value, key) => cloned.setData(key, value));
    return cloned;
  }

  /**
   * Gets a string representation of this transition.
   */
  toString(): string {
    const interrupt = this.canInterrupt ? ' [interrupt]' : '';
    return `Transition[${this.name}] (priority: ${this.priority})${interrupt}`;
  }
}
