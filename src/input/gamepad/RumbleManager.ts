/**
 * RumbleManager - Haptic feedback and vibration pattern management
 *
 * Provides high-level vibration patterns, queuing, and effects for gamepad
 * haptic feedback. Supports predefined patterns and custom vibration sequences.
 *
 * @module input/gamepad/RumbleManager
 */

import { Logger } from '../../core/Logger';

const logger = Logger.create('RumbleManager');

/**
 * Vibration pattern definition.
 */
export interface VibrationPattern {
  /** Pattern name */
  name: string;
  /** Sequence of vibration steps */
  steps: VibrationStep[];
  /** Whether pattern should loop */
  loop?: boolean;
}

/**
 * Single step in a vibration pattern.
 */
export interface VibrationStep {
  /** Weak motor magnitude (0-1) */
  weak: number;
  /** Strong motor magnitude (0-1) */
  strong: number;
  /** Duration in milliseconds */
  duration: number;
  /** Optional delay before this step */
  delay?: number;
}

/**
 * Predefined vibration patterns for common game events.
 */
export const VibrationPatterns = {
  /** Light tap feedback */
  Tap: {
    name: 'tap',
    steps: [
      { weak: 0.3, strong: 0.2, duration: 50 }
    ]
  } as VibrationPattern,

  /** Button press feedback */
  Click: {
    name: 'click',
    steps: [
      { weak: 0.4, strong: 0.3, duration: 30 }
    ]
  } as VibrationPattern,

  /** Light impact */
  Impact: {
    name: 'impact',
    steps: [
      { weak: 0.7, strong: 0.8, duration: 100 }
    ]
  } as VibrationPattern,

  /** Heavy impact */
  HeavyImpact: {
    name: 'heavy-impact',
    steps: [
      { weak: 1.0, strong: 1.0, duration: 150 }
    ]
  } as VibrationPattern,

  /** Explosion effect */
  Explosion: {
    name: 'explosion',
    steps: [
      { weak: 1.0, strong: 1.0, duration: 100 },
      { weak: 0.5, strong: 0.6, duration: 150 },
      { weak: 0.2, strong: 0.3, duration: 100 }
    ]
  } as VibrationPattern,

  /** Damage feedback */
  Damage: {
    name: 'damage',
    steps: [
      { weak: 0.8, strong: 0.9, duration: 80 },
      { weak: 0.0, strong: 0.0, duration: 40, delay: 20 },
      { weak: 0.6, strong: 0.7, duration: 60 }
    ]
  } as VibrationPattern,

  /** Heartbeat pattern */
  Heartbeat: {
    name: 'heartbeat',
    loop: true,
    steps: [
      { weak: 0.4, strong: 0.5, duration: 100 },
      { weak: 0.0, strong: 0.0, duration: 100 },
      { weak: 0.4, strong: 0.5, duration: 100 },
      { weak: 0.0, strong: 0.0, duration: 500 }
    ]
  } as VibrationPattern,

  /** Engine rumble (continuous) */
  Engine: {
    name: 'engine',
    loop: true,
    steps: [
      { weak: 0.3, strong: 0.2, duration: 50 },
      { weak: 0.35, strong: 0.25, duration: 50 }
    ]
  } as VibrationPattern,

  /** Reload feedback */
  Reload: {
    name: 'reload',
    steps: [
      { weak: 0.4, strong: 0.3, duration: 80 },
      { weak: 0.0, strong: 0.0, duration: 100 },
      { weak: 0.5, strong: 0.4, duration: 120 }
    ]
  } as VibrationPattern,

  /** Success feedback */
  Success: {
    name: 'success',
    steps: [
      { weak: 0.3, strong: 0.3, duration: 80 },
      { weak: 0.0, strong: 0.0, duration: 50 },
      { weak: 0.4, strong: 0.4, duration: 100 }
    ]
  } as VibrationPattern,

  /** Error/warning feedback */
  Error: {
    name: 'error',
    steps: [
      { weak: 0.6, strong: 0.5, duration: 100 },
      { weak: 0.0, strong: 0.0, duration: 50 },
      { weak: 0.6, strong: 0.5, duration: 100 },
      { weak: 0.0, strong: 0.0, duration: 50 },
      { weak: 0.6, strong: 0.5, duration: 100 }
    ]
  } as VibrationPattern
} as const;

/**
 * Active vibration effect instance.
 */
interface ActiveEffect {
  /** Pattern being played */
  pattern: VibrationPattern;
  /** Current step index */
  stepIndex: number;
  /** Start time */
  startTime: number;
  /** Whether effect is playing */
  playing: boolean;
  /** Vibration actuator */
  actuator: GamepadHapticActuator;
}

/**
 * Manages haptic feedback and vibration patterns for gamepads.
 *
 * @example
 * ```typescript
 * const rumble = new RumbleManager();
 *
 * // Play predefined pattern
 * await rumble.play(gamepad, VibrationPatterns.Impact);
 *
 * // Play custom pattern
 * await rumble.play(gamepad, {
 *   name: 'custom',
 *   steps: [
 *     { weak: 0.5, strong: 0.5, duration: 100 },
 *     { weak: 0.3, strong: 0.3, duration: 100 }
 *   ]
 * });
 *
 * // Stop all vibration
 * rumble.stopAll();
 * ```
 */
export class RumbleManager {
  /** Active effects by gamepad index */
  private activeEffects: Map<number, ActiveEffect> = new Map();

  /** Custom registered patterns */
  private customPatterns: Map<string, VibrationPattern> = new Map();

  /** Global vibration intensity multiplier (0-1) */
  private intensityMultiplier: number = 1.0;

  /** Whether vibration is globally enabled */
  private enabled: boolean = true;

  /**
   * Creates a new rumble manager.
   *
   * @example
   * ```typescript
   * const rumble = new RumbleManager();
   * ```
   */
  constructor() {
    logger.debug('RumbleManager created');
  }

  /**
   * Plays a vibration pattern on a gamepad.
   *
   * @param gamepad - Target gamepad
   * @param pattern - Vibration pattern to play
   * @returns Promise that resolves when pattern completes (or starts if looping)
   *
   * @example
   * ```typescript
   * await rumble.play(gamepad, VibrationPatterns.Impact);
   * ```
   */
  async play(gamepad: Gamepad, pattern: VibrationPattern): Promise<void> {
    if (!this.enabled) {
      logger.debug('Vibration disabled, skipping pattern', pattern.name);
      return;
    }

    if (!gamepad.vibrationActuator) {
      logger.warn(`Gamepad ${gamepad.index} does not support vibration`);
      return;
    }

    // Stop existing effect on this gamepad
    this.stop(gamepad.index);

    logger.debug(`Playing vibration pattern: ${pattern.name} on gamepad ${gamepad.index}`);

    try {
      await this.playPattern(gamepad, pattern);
    } catch (error) {
      logger.error(`Failed to play vibration pattern: ${pattern.name}`, error);
    }
  }

  /**
   * Plays a pattern by name (predefined or custom).
   *
   * @param gamepad - Target gamepad
   * @param patternName - Name of pattern to play
   * @returns Promise that resolves when pattern completes
   *
   * @example
   * ```typescript
   * await rumble.playByName(gamepad, 'impact');
   * ```
   */
  async playByName(gamepad: Gamepad, patternName: string): Promise<void> {
    const pattern = this.getPattern(patternName);
    if (!pattern) {
      logger.warn(`Unknown vibration pattern: ${patternName}`);
      return;
    }

    await this.play(gamepad, pattern);
  }

  /**
   * Plays a simple vibration with duration.
   *
   * @param gamepad - Target gamepad
   * @param weak - Weak motor magnitude (0-1)
   * @param strong - Strong motor magnitude (0-1)
   * @param duration - Duration in milliseconds
   * @returns Promise that resolves when vibration completes
   *
   * @example
   * ```typescript
   * await rumble.playSimple(gamepad, 0.5, 0.5, 200);
   * ```
   */
  async playSimple(
    gamepad: Gamepad,
    weak: number,
    strong: number,
    duration: number
  ): Promise<void> {
    const pattern: VibrationPattern = {
      name: 'simple',
      steps: [{ weak, strong, duration }]
    };

    await this.play(gamepad, pattern);
  }

  /**
   * Stops vibration on a specific gamepad.
   *
   * @param gamepadIndex - Gamepad index to stop
   *
   * @example
   * ```typescript
   * rumble.stop(0);
   * ```
   */
  stop(gamepadIndex: number): void {
    const effect = this.activeEffects.get(gamepadIndex);
    if (!effect) return;

    effect.playing = false;
    effect.actuator.reset().catch(err => {
      logger.error(`Failed to reset vibration on gamepad ${gamepadIndex}`, err);
    });

    this.activeEffects.delete(gamepadIndex);
    logger.debug(`Stopped vibration on gamepad ${gamepadIndex}`);
  }

  /**
   * Stops all active vibrations.
   *
   * @example
   * ```typescript
   * rumble.stopAll();
   * ```
   */
  stopAll(): void {
    for (const index of this.activeEffects.keys()) {
      this.stop(index);
    }
    logger.debug('Stopped all vibrations');
  }

  /**
   * Registers a custom vibration pattern.
   *
   * @param pattern - Pattern to register
   *
   * @example
   * ```typescript
   * rumble.registerPattern({
   *   name: 'my-pattern',
   *   steps: [
   *     { weak: 0.5, strong: 0.5, duration: 100 }
   *   ]
   * });
   * ```
   */
  registerPattern(pattern: VibrationPattern): void {
    this.customPatterns.set(pattern.name, pattern);
    logger.debug(`Registered vibration pattern: ${pattern.name}`);
  }

  /**
   * Gets a pattern by name.
   *
   * @param name - Pattern name
   * @returns Pattern or undefined
   *
   * @example
   * ```typescript
   * const pattern = rumble.getPattern('impact');
   * ```
   */
  getPattern(name: string): VibrationPattern | undefined {
    // Check predefined patterns
    const predefined = Object.values(VibrationPatterns).find(p => p.name === name);
    if (predefined) return predefined;

    // Check custom patterns
    return this.customPatterns.get(name);
  }

  /**
   * Sets global vibration intensity multiplier.
   *
   * @param multiplier - Intensity multiplier (0-1)
   *
   * @example
   * ```typescript
   * rumble.setIntensity(0.5); // 50% intensity
   * ```
   */
  setIntensity(multiplier: number): void {
    this.intensityMultiplier = Math.max(0, Math.min(1, multiplier));
    logger.debug(`Vibration intensity set to ${this.intensityMultiplier}`);
  }

  /**
   * Gets current intensity multiplier.
   *
   * @returns Intensity multiplier (0-1)
   *
   * @example
   * ```typescript
   * const intensity = rumble.getIntensity();
   * ```
   */
  getIntensity(): number {
    return this.intensityMultiplier;
  }

  /**
   * Enables or disables vibration globally.
   *
   * @param enabled - Whether to enable vibration
   *
   * @example
   * ```typescript
   * rumble.setEnabled(false); // Disable all vibration
   * ```
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
    logger.info(`Vibration ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Checks if vibration is enabled.
   *
   * @returns True if enabled
   *
   * @example
   * ```typescript
   * if (rumble.isEnabled()) {
   *   rumble.play(gamepad, pattern);
   * }
   * ```
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Plays a vibration pattern.
   *
   * @param gamepad - Target gamepad
   * @param pattern - Pattern to play
   * @private
   */
  private async playPattern(gamepad: Gamepad, pattern: VibrationPattern): Promise<void> {
    if (!gamepad.vibrationActuator) return;

    const effect: ActiveEffect = {
      pattern,
      stepIndex: 0,
      startTime: performance.now(),
      playing: true,
      actuator: gamepad.vibrationActuator
    };

    this.activeEffects.set(gamepad.index, effect);

    try {
      await this.playSteps(effect);
    } finally {
      if (this.activeEffects.get(gamepad.index) === effect) {
        this.activeEffects.delete(gamepad.index);
      }
    }
  }

  /**
   * Plays pattern steps sequentially.
   *
   * @param effect - Active effect to play
   * @private
   */
  private async playSteps(effect: ActiveEffect): Promise<void> {
    do {
      for (let i = 0; i < effect.pattern.steps.length; i++) {
        if (!effect.playing) return;

        const step = effect.pattern.steps[i];
        if (!step) continue;

        effect.stepIndex = i;

        // Apply delay if specified
        if (step.delay && step.delay > 0) {
          await this.delay(step.delay);
          if (!effect.playing) return;
        }

        // Apply intensity multiplier
        const weak = step.weak * this.intensityMultiplier;
        const strong = step.strong * this.intensityMultiplier;

        // Play step
        await effect.actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: step.duration,
          weakMagnitude: Math.max(0, Math.min(1, weak)),
          strongMagnitude: Math.max(0, Math.min(1, strong))
        });

        if (!effect.playing) return;
      }
    } while (effect.pattern.loop && effect.playing);
  }

  /**
   * Delays execution.
   *
   * @param ms - Milliseconds to delay
   * @returns Promise that resolves after delay
   * @private
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Resets the rumble manager.
   *
   * @example
   * ```typescript
   * rumble.reset();
   * ```
   */
  reset(): void {
    this.stopAll();
    this.customPatterns.clear();
    logger.debug('RumbleManager reset');
  }
}
