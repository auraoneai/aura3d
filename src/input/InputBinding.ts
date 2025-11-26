/**
 * InputBinding - Configuration for mapping device inputs to actions
 *
 * Bindings define how specific device controls (keys, buttons, axes) map to abstract
 * actions. They support modifiers, processors for value transformation, and interaction
 * types for advanced input recognition (press, hold, tap, double tap).
 *
 * @module input/InputBinding
 *
 * @example
 * ```typescript
 * // Simple button binding
 * const jumpBinding = new InputBinding({
 *   deviceType: 'keyboard',
 *   path: 'Space',
 *   interaction: 'press'
 * });
 *
 * // Binding with modifiers
 * const saveBinding = new InputBinding({
 *   deviceType: 'keyboard',
 *   path: 'S',
 *   modifiers: ['ctrl'],
 *   interaction: 'press'
 * });
 *
 * // Axis binding with deadzone
 * const moveBinding = new InputBinding({
 *   deviceType: 'gamepad',
 *   path: 'LeftStick/X',
 *   processors: [{ type: 'deadzone', threshold: 0.2 }]
 * });
 * ```
 */

import { Logger } from '../core/Logger';

const logger = new Logger('InputBinding');

/**
 * Device types that can be bound to actions
 */
export type DeviceType = 'keyboard' | 'mouse' | 'gamepad' | 'touch' | 'virtual';

/**
 * Interaction types define how input is recognized
 */
export type InteractionType =
  | 'press'      // Triggered when control becomes active
  | 'release'    // Triggered when control becomes inactive
  | 'hold'       // Triggered after holding for duration
  | 'tap'        // Quick press and release
  | 'doubleTap'  // Two quick taps in succession
  | 'continuous' // Triggered every frame while active
  | 'passthrough'; // Raw value without processing

/**
 * Keyboard modifier keys
 */
export type ModifierKey = 'ctrl' | 'shift' | 'alt' | 'meta';

/**
 * Value processor types for transforming input values
 */
export type ProcessorType =
  | 'normalize'   // Normalize to 0-1 range
  | 'invert'      // Invert the value
  | 'clamp'       // Clamp to min/max
  | 'deadzone'    // Apply deadzone threshold
  | 'scale'       // Scale by factor
  | 'exponential' // Apply exponential curve
  | 'smooth';     // Smooth value over time

/**
 * Processor configuration
 */
export interface ProcessorConfig {
  type: ProcessorType;
  threshold?: number;    // For deadzone
  min?: number;          // For clamp
  max?: number;          // For clamp
  factor?: number;       // For scale
  exponent?: number;     // For exponential
  smoothing?: number;    // For smooth (0-1)
}

/**
 * Binding configuration options
 */
export interface InputBindingConfig {
  /**
   * Device type (keyboard, mouse, gamepad, touch, virtual)
   */
  deviceType: DeviceType;

  /**
   * Control path (e.g., 'Space', 'LeftButton', 'LeftStick/X')
   */
  path: string;

  /**
   * Interaction type (default: 'press')
   */
  interaction?: InteractionType;

  /**
   * Required modifier keys (keyboard only)
   */
  modifiers?: ModifierKey[];

  /**
   * Value processors for transformation
   */
  processors?: ProcessorConfig[];

  /**
   * Hold duration in seconds (for 'hold' interaction)
   */
  holdDuration?: number;

  /**
   * Tap speed in seconds (for 'tap' and 'doubleTap' interactions)
   */
  tapSpeed?: number;

  /**
   * Whether this binding is enabled
   */
  enabled?: boolean;
}

/**
 * Represents a single input binding configuration.
 * Bindings map device controls to abstract actions with modifiers and processing.
 *
 * @example
 * ```typescript
 * // Keyboard binding with modifier
 * const binding = new InputBinding({
 *   deviceType: 'keyboard',
 *   path: 'W',
 *   modifiers: ['shift'],
 *   interaction: 'hold',
 *   holdDuration: 0.5
 * });
 *
 * // Check if binding matches current input
 * if (binding.matches('keyboard', 'W', { shift: true })) {
 *   console.log('Binding matched!');
 * }
 *
 * // Process value through processors
 * const rawValue = 0.15;
 * const processed = binding.processValue(rawValue, 0.016);
 * ```
 */
export class InputBinding {
  /**
   * Device type for this binding
   */
  readonly deviceType: DeviceType;

  /**
   * Control path within the device
   */
  readonly path: string;

  /**
   * Interaction type
   */
  readonly interaction: InteractionType;

  /**
   * Required modifier keys
   */
  readonly modifiers: Set<ModifierKey>;

  /**
   * Value processors
   */
  readonly processors: ProcessorConfig[];

  /**
   * Hold duration for 'hold' interaction
   */
  readonly holdDuration: number;

  /**
   * Tap speed for tap interactions
   */
  readonly tapSpeed: number;

  /**
   * Whether this binding is enabled
   */
  enabled: boolean;

  /**
   * Current hold time for hold interactions
   */
  private currentHoldTime: number = 0;

  /**
   * Last press time for tap detection
   */
  private lastPressTime: number = 0;

  /**
   * Press count for double tap detection
   */
  private pressCount: number = 0;

  /**
   * Smoothed value for smooth processor
   */
  private smoothedValue: number = 0;

  /**
   * Creates a new input binding.
   *
   * @param config - Binding configuration
   *
   * @example
   * ```typescript
   * const binding = new InputBinding({
   *   deviceType: 'keyboard',
   *   path: 'Space',
   *   interaction: 'press'
   * });
   * ```
   */
  constructor(config: InputBindingConfig) {
    this.deviceType = config.deviceType;
    this.path = config.path;
    this.interaction = config.interaction ?? 'press';
    this.modifiers = new Set(config.modifiers ?? []);
    this.processors = config.processors ?? [];
    this.holdDuration = config.holdDuration ?? 0.5;
    this.tapSpeed = config.tapSpeed ?? 0.3;
    this.enabled = config.enabled ?? true;
  }

  /**
   * Checks if this binding matches the given device and control path.
   *
   * @param deviceType - Device type to check
   * @param path - Control path to check
   * @param activeModifiers - Currently active modifier keys
   * @returns True if binding matches
   *
   * @example
   * ```typescript
   * if (binding.matches('keyboard', 'A', { ctrl: true, shift: false })) {
   *   console.log('Ctrl+A pressed');
   * }
   * ```
   */
  matches(deviceType: DeviceType, path: string, activeModifiers?: Record<ModifierKey, boolean>): boolean {
    if (!this.enabled) {
      return false;
    }

    if (this.deviceType !== deviceType || this.path !== path) {
      return false;
    }

    // Check modifiers
    if (this.modifiers.size > 0) {
      if (!activeModifiers) {
        return false;
      }

      for (const modifier of this.modifiers) {
        if (!activeModifiers[modifier]) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Processes raw input value through all configured processors.
   *
   * @param value - Raw input value
   * @param deltaTime - Time since last frame in seconds
   * @returns Processed value
   *
   * @example
   * ```typescript
   * const binding = new InputBinding({
   *   deviceType: 'gamepad',
   *   path: 'LeftStick/X',
   *   processors: [
   *     { type: 'deadzone', threshold: 0.2 },
   *     { type: 'scale', factor: 2.0 }
   *   ]
   * });
   *
   * const rawValue = 0.15;
   * const processed = binding.processValue(rawValue, 0.016);
   * // Value below deadzone, returns 0
   * ```
   */
  processValue(value: number, deltaTime: number): number {
    let result = value;

    for (const processor of this.processors) {
      result = this.applyProcessor(result, processor, deltaTime);
    }

    return result;
  }

  /**
   * Updates interaction state for time-based interactions.
   *
   * @param isActive - Whether the control is currently active
   * @param deltaTime - Time since last frame in seconds
   * @param currentTime - Current time in seconds
   * @returns Interaction state
   *
   * @internal
   */
  updateInteraction(isActive: boolean, deltaTime: number, currentTime: number): {
    triggered: boolean;
    value: number;
  } {
    switch (this.interaction) {
      case 'press':
        return { triggered: isActive, value: isActive ? 1 : 0 };

      case 'release':
        return { triggered: !isActive, value: !isActive ? 1 : 0 };

      case 'hold':
        if (isActive) {
          this.currentHoldTime += deltaTime;
          const triggered = this.currentHoldTime >= this.holdDuration;
          return { triggered, value: triggered ? 1 : 0 };
        } else {
          this.currentHoldTime = 0;
          return { triggered: false, value: 0 };
        }

      case 'tap':
        if (isActive && this.lastPressTime === 0) {
          this.lastPressTime = currentTime;
        } else if (!isActive && this.lastPressTime > 0) {
          const duration = currentTime - this.lastPressTime;
          this.lastPressTime = 0;
          const triggered = duration <= this.tapSpeed;
          return { triggered, value: triggered ? 1 : 0 };
        }
        return { triggered: false, value: 0 };

      case 'doubleTap':
        if (isActive && this.lastPressTime === 0) {
          this.lastPressTime = currentTime;
          this.pressCount++;
        } else if (!isActive && this.lastPressTime > 0) {
          const duration = currentTime - this.lastPressTime;
          if (duration <= this.tapSpeed) {
            if (this.pressCount >= 2) {
              this.pressCount = 0;
              this.lastPressTime = 0;
              return { triggered: true, value: 1 };
            }
          } else {
            this.pressCount = 0;
          }
          this.lastPressTime = 0;
        }
        // Reset if too much time has passed
        if (currentTime - this.lastPressTime > this.tapSpeed * 2) {
          this.pressCount = 0;
          this.lastPressTime = 0;
        }
        return { triggered: false, value: 0 };

      case 'continuous':
        return { triggered: isActive, value: isActive ? 1 : 0 };

      case 'passthrough':
        return { triggered: true, value: isActive ? 1 : 0 };

      default:
        return { triggered: false, value: 0 };
    }
  }

  /**
   * Applies a single processor to a value.
   *
   * @param value - Input value
   * @param processor - Processor configuration
   * @param deltaTime - Time since last frame in seconds
   * @returns Processed value
   *
   * @private
   */
  private applyProcessor(value: number, processor: ProcessorConfig, deltaTime: number): number {
    switch (processor.type) {
      case 'normalize':
        return Math.abs(value) > 0 ? value / Math.abs(value) : 0;

      case 'invert':
        return -value;

      case 'clamp':
        const min = processor.min ?? -1;
        const max = processor.max ?? 1;
        return Math.max(min, Math.min(max, value));

      case 'deadzone':
        const threshold = processor.threshold ?? 0.1;
        if (Math.abs(value) < threshold) {
          return 0;
        }
        // Remap from (threshold, 1) to (0, 1)
        const sign = Math.sign(value);
        const abs = Math.abs(value);
        return sign * ((abs - threshold) / (1 - threshold));

      case 'scale':
        return value * (processor.factor ?? 1);

      case 'exponential':
        const exp = processor.exponent ?? 2;
        return Math.sign(value) * Math.pow(Math.abs(value), exp);

      case 'smooth':
        const smoothing = processor.smoothing ?? 0.1;
        this.smoothedValue = this.smoothedValue + (value - this.smoothedValue) * smoothing;
        return this.smoothedValue;

      default:
        logger.warn(`Unknown processor type: ${processor.type}`);
        return value;
    }
  }

  /**
   * Resets interaction state.
   *
   * @example
   * ```typescript
   * binding.reset();
   * ```
   */
  reset(): void {
    this.currentHoldTime = 0;
    this.lastPressTime = 0;
    this.pressCount = 0;
    this.smoothedValue = 0;
  }

  /**
   * Creates a copy of this binding.
   *
   * @returns New binding with same configuration
   *
   * @example
   * ```typescript
   * const copy = binding.clone();
   * copy.enabled = false;
   * ```
   */
  clone(): InputBinding {
    return new InputBinding({
      deviceType: this.deviceType,
      path: this.path,
      interaction: this.interaction,
      modifiers: Array.from(this.modifiers),
      processors: this.processors.slice(),
      holdDuration: this.holdDuration,
      tapSpeed: this.tapSpeed,
      enabled: this.enabled
    });
  }

  /**
   * Gets a string representation of this binding.
   *
   * @returns String representation
   *
   * @example
   * ```typescript
   * console.log(binding.toString()); // "keyboard:Space (press)"
   * ```
   */
  toString(): string {
    const modStr = this.modifiers.size > 0
      ? Array.from(this.modifiers).join('+') + '+'
      : '';
    return `${this.deviceType}:${modStr}${this.path} (${this.interaction})`;
  }
}
