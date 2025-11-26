/**
 * InputAction - Abstract input actions with multiple bindings
 *
 * Actions provide a high-level abstraction over device-specific inputs. Multiple bindings
 * can trigger the same action, supporting different input methods (keyboard, gamepad, touch).
 * Actions support different value types: buttons (binary), axes (1D), and 2D axes (vectors).
 *
 * @module input/InputAction
 *
 * @example
 * ```typescript
 * // Button action (jump)
 * const jumpAction = new InputAction({
 *   name: 'jump',
 *   valueType: 'button'
 * });
 * jumpAction.addBinding({ deviceType: 'keyboard', path: 'Space' });
 * jumpAction.addBinding({ deviceType: 'gamepad', path: 'ButtonA' });
 *
 * // Axis action (move forward)
 * const moveAction = new InputAction({
 *   name: 'move',
 *   valueType: 'axis'
 * });
 * moveAction.addBinding({ deviceType: 'keyboard', path: 'W' });
 * moveAction.addBinding({ deviceType: 'gamepad', path: 'LeftStick/Y' });
 *
 * // Composite 2D axis from WASD keys
 * const moveAction2D = new InputAction({
 *   name: 'move2D',
 *   valueType: 'axis2D'
 * });
 * moveAction2D.addCompositeBinding('2DAxis', {
 *   up: { deviceType: 'keyboard', path: 'W' },
 *   down: { deviceType: 'keyboard', path: 'S' },
 *   left: { deviceType: 'keyboard', path: 'A' },
 *   right: { deviceType: 'keyboard', path: 'D' }
 * });
 * ```
 */

import { Vector2 } from '../math/Vector2';
import { InputBinding, InputBindingConfig } from './InputBinding';
import { Logger } from '../core/Logger';

const logger = new Logger('InputAction');

/**
 * Action value types
 */
export type ActionValueType = 'button' | 'axis' | 'axis2D';

/**
 * Composite binding types
 */
export type CompositeType = '2DAxis' | '1DAxis' | 'ButtonWithModifiers';

/**
 * Composite binding configuration
 */
export interface CompositeBindingConfig {
  up?: InputBindingConfig;
  down?: InputBindingConfig;
  left?: InputBindingConfig;
  right?: InputBindingConfig;
  positive?: InputBindingConfig;
  negative?: InputBindingConfig;
  button?: InputBindingConfig;
  modifiers?: InputBindingConfig[];
}

/**
 * Action configuration options
 */
export interface InputActionConfig {
  /**
   * Action name (unique within context)
   */
  name: string;

  /**
   * Value type (button, axis, axis2D)
   */
  valueType: ActionValueType;

  /**
   * Optional action description
   */
  description?: string;

  /**
   * Whether this action is enabled
   */
  enabled?: boolean;

  /**
   * Initial bindings
   */
  bindings?: InputBindingConfig[];
}

/**
 * Action state snapshot
 */
export interface ActionState {
  /**
   * Whether action was triggered this frame
   */
  triggered: boolean;

  /**
   * Current action value (0-1 for buttons, -1 to 1 for axes)
   */
  value: number;

  /**
   * 2D axis value (only for axis2D actions)
   */
  vector: Vector2 | null;

  /**
   * Time when action was first activated
   */
  startTime: number | null;

  /**
   * Duration action has been active in seconds
   */
  duration: number;
}

/**
 * Represents an abstract input action with multiple bindings.
 * Actions are the recommended way to handle input, as they decouple
 * game logic from specific input devices.
 *
 * @example
 * ```typescript
 * // Create action
 * const fireAction = new InputAction({
 *   name: 'fire',
 *   valueType: 'button',
 *   description: 'Fire weapon'
 * });
 *
 * // Add multiple bindings
 * fireAction.addBinding({
 *   deviceType: 'keyboard',
 *   path: 'Space',
 *   interaction: 'press'
 * });
 * fireAction.addBinding({
 *   deviceType: 'mouse',
 *   path: 'LeftButton',
 *   interaction: 'press'
 * });
 *
 * // Check if action was triggered
 * if (fireAction.triggered) {
 *   weapon.fire();
 * }
 *
 * // Get action value
 * const moveSpeed = moveAction.value * 10;
 * ```
 */
export class InputAction {
  /**
   * Action name (unique identifier)
   */
  readonly name: string;

  /**
   * Value type
   */
  readonly valueType: ActionValueType;

  /**
   * Action description
   */
  readonly description: string;

  /**
   * Whether this action is enabled
   */
  enabled: boolean;

  /**
   * All bindings for this action
   */
  readonly bindings: InputBinding[] = [];

  /**
   * Composite bindings
   */
  private compositeBindings: Map<string, {
    type: CompositeType;
    parts: Map<string, InputBinding>;
  }> = new Map();

  /**
   * Current action state
   */
  private state: ActionState = {
    triggered: false,
    value: 0,
    vector: null,
    startTime: null,
    duration: 0
  };

  /**
   * Previous frame state
   */
  private previousState: ActionState = {
    triggered: false,
    value: 0,
    vector: null,
    startTime: null,
    duration: 0
  };

  /**
   * Creates a new input action.
   *
   * @param config - Action configuration
   *
   * @example
   * ```typescript
   * const jumpAction = new InputAction({
   *   name: 'jump',
   *   valueType: 'button',
   *   description: 'Make character jump'
   * });
   * ```
   */
  constructor(config: InputActionConfig) {
    this.name = config.name;
    this.valueType = config.valueType;
    this.description = config.description ?? '';
    this.enabled = config.enabled ?? true;

    if (config.bindings) {
      for (const bindingConfig of config.bindings) {
        this.addBinding(bindingConfig);
      }
    }
  }

  /**
   * Whether action was triggered this frame
   */
  get triggered(): boolean {
    return this.state.triggered;
  }

  /**
   * Current action value (0-1 for buttons, -1 to 1 for axes)
   */
  get value(): number {
    return this.state.value;
  }

  /**
   * 2D axis value (only for axis2D actions)
   */
  get vector(): Vector2 | null {
    return this.state.vector;
  }

  /**
   * Whether action is currently active (value > 0)
   */
  get isActive(): boolean {
    return this.state.value > 0 || (this.state.vector !== null && this.state.vector.lengthSquared() > 0);
  }

  /**
   * Whether action was just pressed this frame
   */
  get wasPressed(): boolean {
    return this.state.triggered && !this.previousState.triggered;
  }

  /**
   * Whether action was just released this frame
   */
  get wasReleased(): boolean {
    return !this.state.triggered && this.previousState.triggered;
  }

  /**
   * Duration action has been active in seconds
   */
  get duration(): number {
    return this.state.duration;
  }

  /**
   * Adds a binding to this action.
   *
   * @param config - Binding configuration
   * @returns The created binding
   *
   * @example
   * ```typescript
   * action.addBinding({
   *   deviceType: 'keyboard',
   *   path: 'Space',
   *   interaction: 'press'
   * });
   * ```
   */
  addBinding(config: InputBindingConfig): InputBinding {
    const binding = new InputBinding(config);
    this.bindings.push(binding);
    logger.debug(`Added binding to action '${this.name}': ${binding.toString()}`);
    return binding;
  }

  /**
   * Removes a binding from this action.
   *
   * @param binding - Binding to remove
   * @returns True if binding was removed
   *
   * @example
   * ```typescript
   * const binding = action.addBinding({ deviceType: 'keyboard', path: 'Space' });
   * action.removeBinding(binding);
   * ```
   */
  removeBinding(binding: InputBinding): boolean {
    const index = this.bindings.indexOf(binding);
    if (index !== -1) {
      this.bindings.splice(index, 1);
      logger.debug(`Removed binding from action '${this.name}': ${binding.toString()}`);
      return true;
    }
    return false;
  }

  /**
   * Adds a composite binding (e.g., WASD for 2D movement).
   *
   * @param type - Composite type
   * @param config - Composite configuration
   * @returns Composite ID
   *
   * @example
   * ```typescript
   * // WASD composite for 2D movement
   * action.addCompositeBinding('2DAxis', {
   *   up: { deviceType: 'keyboard', path: 'W' },
   *   down: { deviceType: 'keyboard', path: 'S' },
   *   left: { deviceType: 'keyboard', path: 'A' },
   *   right: { deviceType: 'keyboard', path: 'D' }
   * });
   * ```
   */
  addCompositeBinding(type: CompositeType, config: CompositeBindingConfig): string {
    const id = `composite_${this.compositeBindings.size}`;
    const parts = new Map<string, InputBinding>();

    if (type === '2DAxis') {
      if (config.up) parts.set('up', new InputBinding(config.up));
      if (config.down) parts.set('down', new InputBinding(config.down));
      if (config.left) parts.set('left', new InputBinding(config.left));
      if (config.right) parts.set('right', new InputBinding(config.right));
    } else if (type === '1DAxis') {
      if (config.positive) parts.set('positive', new InputBinding(config.positive));
      if (config.negative) parts.set('negative', new InputBinding(config.negative));
    } else if (type === 'ButtonWithModifiers') {
      if (config.button) parts.set('button', new InputBinding(config.button));
      if (config.modifiers) {
        config.modifiers.forEach((mod, idx) => {
          parts.set(`modifier_${idx}`, new InputBinding(mod));
        });
      }
    }

    this.compositeBindings.set(id, { type, parts });
    logger.debug(`Added composite binding to action '${this.name}': ${type}`);
    return id;
  }

  /**
   * Removes a composite binding.
   *
   * @param id - Composite ID
   * @returns True if composite was removed
   *
   * @example
   * ```typescript
   * const id = action.addCompositeBinding('2DAxis', { ... });
   * action.removeCompositeBinding(id);
   * ```
   */
  removeCompositeBinding(id: string): boolean {
    return this.compositeBindings.delete(id);
  }

  /**
   * Updates action state based on input values.
   * Called by InputManager each frame.
   *
   * @param deltaTime - Time since last frame in seconds
   * @param currentTime - Current time in seconds
   * @param getBindingValue - Function to get binding value
   *
   * @internal
   */
  update(
    deltaTime: number,
    currentTime: number,
    getBindingValue: (binding: InputBinding) => number
  ): void {
    if (!this.enabled) {
      this.resetState();
      return;
    }

    // Save previous state
    this.previousState = { ...this.state };
    if (this.state.vector) {
      this.previousState.vector = this.state.vector.clone();
    }

    // Reset current state
    this.state.triggered = false;
    this.state.value = 0;
    if (this.state.vector) {
      this.state.vector.set(0, 0);
    }

    // Process all simple bindings
    for (const binding of this.bindings) {
      if (!binding.enabled) continue;

      const value = getBindingValue(binding);
      if (value !== 0) {
        this.state.triggered = true;
        this.state.value = Math.max(this.state.value, Math.abs(value));
      }
    }

    // Process composite bindings
    for (const [id, composite] of this.compositeBindings) {
      this.processComposite(composite, getBindingValue);
    }

    // Update duration
    if (this.state.triggered) {
      if (this.state.startTime === null) {
        this.state.startTime = currentTime;
        this.state.duration = 0;
      } else {
        this.state.duration = currentTime - this.state.startTime;
      }
    } else {
      this.state.startTime = null;
      this.state.duration = 0;
    }
  }

  /**
   * Processes a composite binding.
   *
   * @param composite - Composite binding data
   * @param getBindingValue - Function to get binding value
   *
   * @private
   */
  private processComposite(
    composite: { type: CompositeType; parts: Map<string, InputBinding> },
    getBindingValue: (binding: InputBinding) => number
  ): void {
    if (composite.type === '2DAxis') {
      if (this.valueType !== 'axis2D') {
        logger.warn(`Action '${this.name}' has 2DAxis composite but value type is '${this.valueType}'`);
        return;
      }

      if (!this.state.vector) {
        this.state.vector = new Vector2(0, 0);
      }

      const up = composite.parts.get('up');
      const down = composite.parts.get('down');
      const left = composite.parts.get('left');
      const right = composite.parts.get('right');

      let x = 0;
      let y = 0;

      if (up) y += getBindingValue(up);
      if (down) y -= getBindingValue(down);
      if (right) x += getBindingValue(right);
      if (left) x -= getBindingValue(left);

      this.state.vector.set(x, y);

      if (x !== 0 || y !== 0) {
        this.state.triggered = true;
        this.state.value = Math.min(1, Math.sqrt(x * x + y * y));
      }
    } else if (composite.type === '1DAxis') {
      const positive = composite.parts.get('positive');
      const negative = composite.parts.get('negative');

      let value = 0;
      if (positive) value += getBindingValue(positive);
      if (negative) value -= getBindingValue(negative);

      if (value !== 0) {
        this.state.triggered = true;
        this.state.value = Math.max(this.state.value, Math.abs(value));
      }
    }
  }

  /**
   * Resets action state.
   *
   * @example
   * ```typescript
   * action.reset();
   * ```
   */
  reset(): void {
    this.resetState();
    for (const binding of this.bindings) {
      binding.reset();
    }
    for (const composite of this.compositeBindings.values()) {
      for (const binding of composite.parts.values()) {
        binding.reset();
      }
    }
  }

  /**
   * Resets internal state without affecting bindings.
   *
   * @private
   */
  private resetState(): void {
    this.state.triggered = false;
    this.state.value = 0;
    if (this.state.vector) {
      this.state.vector.set(0, 0);
    }
    this.state.startTime = null;
    this.state.duration = 0;
  }

  /**
   * Gets current action state.
   *
   * @returns Current state
   *
   * @example
   * ```typescript
   * const state = action.getState();
   * console.log(`Action triggered: ${state.triggered}, value: ${state.value}`);
   * ```
   */
  getState(): Readonly<ActionState> {
    return this.state;
  }

  /**
   * Checks if action is currently triggered.
   *
   * @returns True if triggered
   *
   * @example
   * ```typescript
   * if (action.isTriggered()) {
   *   console.log('Action triggered');
   * }
   * ```
   */
  isTriggered(): boolean {
    return this.state.triggered;
  }

  /**
   * Gets current action value.
   *
   * @returns Action value
   *
   * @example
   * ```typescript
   * const value = action.getValue();
   * ```
   */
  getValue(): number {
    return this.state.value;
  }

  /**
   * Sets playback state for replays.
   * Used internally by InputSystem during playback.
   *
   * @param triggered - Whether action is triggered
   * @param value - Action value
   *
   * @internal
   */
  setPlaybackState(triggered: boolean, value: number): void {
    this.state.triggered = triggered;
    this.state.value = value;
  }

  /**
   * Gets a string representation of this action.
   *
   * @returns String representation
   *
   * @example
   * ```typescript
   * console.log(action.toString());
   * // "jump (button): 2 bindings"
   * ```
   */
  toString(): string {
    const bindingCount = this.bindings.length + this.compositeBindings.size;
    return `${this.name} (${this.valueType}): ${bindingCount} bindings`;
  }
}
