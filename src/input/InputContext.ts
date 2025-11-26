/**
 * InputContext - Input context/map for organizing related actions
 *
 * Contexts group related actions together and can be enabled/disabled as a unit.
 * They support priority ordering and blocking (higher priority contexts can block lower ones).
 * Contexts are useful for different game states (gameplay, menu, dialogue) where different
 * inputs should be active.
 *
 * @module input/InputContext
 *
 * @example
 * ```typescript
 * // Gameplay context
 * const gameplayContext = new InputContext({
 *   name: 'gameplay',
 *   priority: 0
 * });
 * gameplayContext.addAction({ name: 'move', valueType: 'axis2D' });
 * gameplayContext.addAction({ name: 'jump', valueType: 'button' });
 *
 * // Menu context (higher priority, blocks gameplay)
 * const menuContext = new InputContext({
 *   name: 'menu',
 *   priority: 100,
 *   blockLowerPriority: true
 * });
 * menuContext.addAction({ name: 'navigate', valueType: 'axis2D' });
 * menuContext.addAction({ name: 'select', valueType: 'button' });
 *
 * // Enable menu context (blocks gameplay)
 * menuContext.enabled = true;
 * gameplayContext.enabled = false;
 * ```
 */

import { InputAction, InputActionConfig } from './InputAction';
import { Logger } from '../core/Logger';

const logger = new Logger('InputContext');

/**
 * Context configuration options
 */
export interface InputContextConfig {
  /**
   * Context name (unique identifier)
   */
  name: string;

  /**
   * Execution priority (higher values execute first)
   */
  priority?: number;

  /**
   * Whether this context blocks lower priority contexts
   */
  blockLowerPriority?: boolean;

  /**
   * Whether this context is initially enabled
   */
  enabled?: boolean;

  /**
   * Initial actions
   */
  actions?: InputActionConfig[];
}

/**
 * Represents an input context containing a set of related actions.
 * Contexts can be enabled/disabled and have priorities for layering.
 *
 * @example
 * ```typescript
 * // Create gameplay context
 * const gameplay = new InputContext({
 *   name: 'gameplay',
 *   priority: 0
 * });
 *
 * // Add actions
 * const moveAction = gameplay.addAction({
 *   name: 'move',
 *   valueType: 'axis2D'
 * });
 * moveAction.addCompositeBinding('2DAxis', {
 *   up: { deviceType: 'keyboard', path: 'W' },
 *   down: { deviceType: 'keyboard', path: 'S' },
 *   left: { deviceType: 'keyboard', path: 'A' },
 *   right: { deviceType: 'keyboard', path: 'D' }
 * });
 *
 * const jumpAction = gameplay.addAction({
 *   name: 'jump',
 *   valueType: 'button'
 * });
 * jumpAction.addBinding({ deviceType: 'keyboard', path: 'Space' });
 *
 * // Enable context
 * gameplay.enabled = true;
 *
 * // Access actions
 * if (gameplay.getAction('jump')?.triggered) {
 *   player.jump();
 * }
 * ```
 */
export class InputContext {
  /**
   * Context name (unique identifier)
   */
  readonly name: string;

  /**
   * Execution priority (higher values execute and are checked first)
   */
  priority: number;

  /**
   * Whether this context blocks lower priority contexts
   */
  blockLowerPriority: boolean;

  /**
   * Whether this context is currently enabled
   */
  enabled: boolean;

  /**
   * Actions in this context
   */
  private actions: Map<string, InputAction> = new Map();

  /**
   * Creates a new input context.
   *
   * @param config - Context configuration
   *
   * @example
   * ```typescript
   * const context = new InputContext({
   *   name: 'gameplay',
   *   priority: 0,
   *   blockLowerPriority: false,
   *   enabled: true
   * });
   * ```
   */
  constructor(config: InputContextConfig) {
    this.name = config.name;
    this.priority = config.priority ?? 0;
    this.blockLowerPriority = config.blockLowerPriority ?? false;
    this.enabled = config.enabled ?? true;

    if (config.actions) {
      for (const actionConfig of config.actions) {
        this.addAction(actionConfig);
      }
    }

    logger.debug(`Created input context '${this.name}' with priority ${this.priority}`);
  }

  /**
   * Adds an action to this context.
   *
   * @param config - Action configuration
   * @returns The created action
   * @throws Error if action with same name already exists
   *
   * @example
   * ```typescript
   * const action = context.addAction({
   *   name: 'fire',
   *   valueType: 'button',
   *   bindings: [
   *     { deviceType: 'keyboard', path: 'Space' },
   *     { deviceType: 'mouse', path: 'LeftButton' }
   *   ]
   * });
   * ```
   */
  addAction(config: InputActionConfig): InputAction {
    if (this.actions.has(config.name)) {
      throw new Error(`Action '${config.name}' already exists in context '${this.name}'`);
    }

    const action = new InputAction(config);
    this.actions.set(config.name, action);
    logger.debug(`Added action '${config.name}' to context '${this.name}'`);
    return action;
  }

  /**
   * Removes an action from this context.
   *
   * @param name - Action name
   * @returns True if action was removed
   *
   * @example
   * ```typescript
   * context.removeAction('fire');
   * ```
   */
  removeAction(name: string): boolean {
    const removed = this.actions.delete(name);
    if (removed) {
      logger.debug(`Removed action '${name}' from context '${this.name}'`);
    }
    return removed;
  }

  /**
   * Gets an action by name.
   *
   * @param name - Action name
   * @returns The action, or undefined if not found
   *
   * @example
   * ```typescript
   * const jumpAction = context.getAction('jump');
   * if (jumpAction?.triggered) {
   *   player.jump();
   * }
   * ```
   */
  getAction(name: string): InputAction | undefined {
    return this.actions.get(name);
  }

  /**
   * Checks if an action exists in this context.
   *
   * @param name - Action name
   * @returns True if action exists
   *
   * @example
   * ```typescript
   * if (context.hasAction('jump')) {
   *   console.log('Jump action exists');
   * }
   * ```
   */
  hasAction(name: string): boolean {
    return this.actions.has(name);
  }

  /**
   * Gets all actions in this context.
   *
   * @returns Array of actions
   *
   * @example
   * ```typescript
   * for (const action of context.getAllActions()) {
   *   console.log(`Action: ${action.name}, value: ${action.value}`);
   * }
   * ```
   */
  getAllActions(): InputAction[] {
    return Array.from(this.actions.values());
  }

  /**
   * Gets the actions map.
   *
   * @returns Map of action names to actions
   *
   * @example
   * ```typescript
   * const actions = context.getActions();
   * for (const [name, action] of actions) {
   *   console.log(`Action: ${name}`);
   * }
   * ```
   */
  getActions(): Map<string, InputAction> {
    return this.actions;
  }

  /**
   * Gets all action names in this context.
   *
   * @returns Array of action names
   *
   * @example
   * ```typescript
   * const names = context.getActionNames();
   * console.log(`Actions: ${names.join(', ')}`);
   * ```
   */
  getActionNames(): string[] {
    return Array.from(this.actions.keys());
  }

  /**
   * Enables this context.
   *
   * @example
   * ```typescript
   * context.enable();
   * ```
   */
  enable(): void {
    if (!this.enabled) {
      this.enabled = true;
      logger.debug(`Enabled context '${this.name}'`);
    }
  }

  /**
   * Disables this context.
   *
   * @example
   * ```typescript
   * context.disable();
   * ```
   */
  disable(): void {
    if (this.enabled) {
      this.enabled = false;
      logger.debug(`Disabled context '${this.name}'`);
    }
  }

  /**
   * Resets all actions in this context.
   *
   * @example
   * ```typescript
   * context.reset();
   * ```
   */
  reset(): void {
    for (const action of this.actions.values()) {
      action.reset();
    }
    logger.debug(`Reset context '${this.name}'`);
  }

  /**
   * Gets the number of actions in this context.
   *
   * @returns Number of actions
   *
   * @example
   * ```typescript
   * console.log(`Context has ${context.size} actions`);
   * ```
   */
  get size(): number {
    return this.actions.size;
  }

  /**
   * Clears all actions from this context.
   *
   * @example
   * ```typescript
   * context.clear();
   * ```
   */
  clear(): void {
    this.actions.clear();
    logger.debug(`Cleared all actions from context '${this.name}'`);
  }

  /**
   * Iterator for actions in this context, enables for-of loops.
   *
   * @returns Iterator over actions
   *
   * @example
   * ```typescript
   * for (const action of context) {
   *   console.log(`Action: ${action.name}`);
   * }
   * ```
   */
  *[Symbol.iterator](): Iterator<InputAction> {
    for (const action of this.actions.values()) {
      yield action;
    }
  }

  /**
   * Gets a string representation of this context.
   *
   * @returns String representation
   *
   * @example
   * ```typescript
   * console.log(context.toString());
   * // "gameplay (priority: 0, enabled: true, actions: 5)"
   * ```
   */
  toString(): string {
    return `${this.name} (priority: ${this.priority}, enabled: ${this.enabled}, actions: ${this.size})`;
  }
}
