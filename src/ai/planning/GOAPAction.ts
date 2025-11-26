/**
 * @fileoverview GOAP action with preconditions and effects.
 * Implements actions for Goal-Oriented Action Planning.
 * @module ai/planning/GOAPAction
 */

import { WorldState } from './WorldState';
import { Logger } from '../../core/Logger';

/**
 * Action execution result.
 */
export enum ActionResult {
  /** Action completed successfully */
  SUCCESS = 'success',
  /** Action is still running */
  RUNNING = 'running',
  /** Action failed */
  FAILURE = 'failure',
}

/**
 * GOAP action interface.
 * Defines an action that can be planned and executed.
 *
 * @example
 * ```typescript
 * // Create a pickup weapon action
 * const pickupWeapon = new GOAPAction(
 *   'PickupWeapon',
 *   10.0 // cost
 * );
 *
 * // Set preconditions
 * pickupWeapon.preconditions.set('nearWeapon', true);
 * pickupWeapon.preconditions.set('hasWeapon', false);
 *
 * // Set effects
 * pickupWeapon.effects.set('hasWeapon', true);
 *
 * // Set execution callback
 * pickupWeapon.onExecute = (state, context) => {
 *   const weapon = findNearestWeapon();
 *   if (pickupItem(weapon)) {
 *     return ActionResult.SUCCESS;
 *   }
 *   return ActionResult.FAILURE;
 * };
 *
 * // Check if action is valid
 * if (pickupWeapon.checkPreconditions(currentState)) {
 *   const result = pickupWeapon.execute(currentState, context);
 * }
 * ```
 */
export class GOAPAction {
  /** Action name */
  readonly name: string;

  /** Action cost (higher = less preferred) */
  cost: number;

  /** Preconditions that must be met */
  preconditions: WorldState;

  /** Effects applied when action succeeds */
  effects: WorldState;

  /** Whether action is currently enabled */
  enabled: boolean;

  /** Execution callback */
  onExecute?: (state: WorldState, context: any) => ActionResult;

  /** Cost calculation callback (for dynamic costs) */
  onCalculateCost?: (state: WorldState, context: any) => number;

  /** Precondition check callback (for complex checks) */
  onCheckPreconditions?: (state: WorldState, context: any) => boolean;

  /** Action start callback */
  onStart?: (state: WorldState, context: any) => void;

  /** Action complete callback */
  onComplete?: (state: WorldState, context: any, result: ActionResult) => void;

  /** Logger instance */
  private logger: Logger;

  /**
   * Creates a new GOAP action.
   *
   * @param name - Action name
   * @param cost - Base action cost
   */
  constructor(name: string, cost: number = 1.0) {
    this.name = name;
    this.cost = cost;
    this.preconditions = new WorldState();
    this.effects = new WorldState();
    this.enabled = true;
    this.logger = new Logger(`GOAPAction:${name}`);
  }

  /**
   * Checks if preconditions are met.
   *
   * @param state - Current world state
   * @param context - Execution context
   * @returns True if preconditions are satisfied
   */
  checkPreconditions(state: WorldState, context?: any): boolean {
    // Use custom check if provided
    if (this.onCheckPreconditions) {
      return this.onCheckPreconditions(state, context);
    }

    // Default: check if state satisfies preconditions
    return state.satisfies(this.preconditions);
  }

  /**
   * Calculates the action cost.
   *
   * @param state - Current world state
   * @param context - Execution context
   * @returns Action cost
   */
  calculateCost(state: WorldState, context?: any): number {
    if (this.onCalculateCost) {
      return this.onCalculateCost(state, context);
    }
    return this.cost;
  }

  /**
   * Applies action effects to a state.
   *
   * @param state - State to modify
   * @returns Modified state (new instance)
   */
  applyEffects(state: WorldState): WorldState {
    const newState = state.clone();
    newState.apply(this.effects);
    return newState;
  }

  /**
   * Executes the action.
   *
   * @param state - Current world state
   * @param context - Execution context
   * @returns Action result
   *
   * @example
   * ```typescript
   * const result = action.execute(currentState, agent);
   * if (result === ActionResult.SUCCESS) {
   *   currentState.apply(action.effects);
   * }
   * ```
   */
  execute(state: WorldState, context?: any): ActionResult {
    if (!this.enabled) {
      this.logger.warn(`Action ${this.name} is disabled`);
      return ActionResult.FAILURE;
    }

    if (!this.onExecute) {
      this.logger.warn(`Action ${this.name} has no execution callback`);
      return ActionResult.FAILURE;
    }

    try {
      const result = this.onExecute(state, context);
      return result;
    } catch (error) {
      this.logger.error(`Error executing action ${this.name}:`, error);
      return ActionResult.FAILURE;
    }
  }

  /**
   * Starts the action.
   *
   * @param state - Current world state
   * @param context - Execution context
   */
  start(state: WorldState, context?: any): void {
    if (this.onStart) {
      this.onStart(state, context);
    }
  }

  /**
   * Completes the action.
   *
   * @param state - Current world state
   * @param context - Execution context
   * @param result - Action result
   */
  complete(state: WorldState, context: any, result: ActionResult): void {
    if (this.onComplete) {
      this.onComplete(state, context, result);
    }
  }

  /**
   * Adds a precondition.
   *
   * @param key - State key
   * @param value - Required value
   * @returns This action (for chaining)
   */
  addPrecondition(key: string, value: any): this {
    this.preconditions.set(key, value);
    return this;
  }

  /**
   * Adds an effect.
   *
   * @param key - State key
   * @param value - Effect value
   * @returns This action (for chaining)
   */
  addEffect(key: string, value: any): this {
    this.effects.set(key, value);
    return this;
  }

  /**
   * Removes a precondition.
   *
   * @param key - State key
   * @returns This action (for chaining)
   */
  removePrecondition(key: string): this {
    this.preconditions.delete(key);
    return this;
  }

  /**
   * Removes an effect.
   *
   * @param key - State key
   * @returns This action (for chaining)
   */
  removeEffect(key: string): this {
    this.effects.delete(key);
    return this;
  }

  /**
   * Clones the action.
   *
   * @returns New action with copied data
   */
  clone(): GOAPAction {
    const action = new GOAPAction(this.name, this.cost);
    action.preconditions = this.preconditions.clone();
    action.effects = this.effects.clone();
    action.enabled = this.enabled;
    action.onExecute = this.onExecute;
    action.onCalculateCost = this.onCalculateCost;
    action.onCheckPreconditions = this.onCheckPreconditions;
    action.onStart = this.onStart;
    action.onComplete = this.onComplete;
    return action;
  }

  /**
   * Gets a string representation of the action.
   *
   * @returns String representation
   */
  toString(): string {
    const pre = this.preconditions.toString();
    const eff = this.effects.toString();
    return `${this.name} [cost=${this.cost}]\n  Pre: ${pre}\n  Eff: ${eff}`;
  }

  /**
   * Creates a simple action with preconditions and effects.
   *
   * @param name - Action name
   * @param cost - Action cost
   * @param preconditions - Precondition object
   * @param effects - Effect object
   * @returns New action
   *
   * @example
   * ```typescript
   * const heal = GOAPAction.create(
   *   'Heal',
   *   5.0,
   *   { hasHealthPotion: true, healthLow: true },
   *   { healthLow: false, hasHealthPotion: false }
   * );
   * ```
   */
  static create(
    name: string,
    cost: number,
    preconditions: Record<string, any>,
    effects: Record<string, any>
  ): GOAPAction {
    const action = new GOAPAction(name, cost);
    action.preconditions = WorldState.fromObject(preconditions);
    action.effects = WorldState.fromObject(effects);
    return action;
  }
}
