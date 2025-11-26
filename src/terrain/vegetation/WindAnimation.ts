/**
 * Wind animation system for vegetation.
 * Provides realistic wind effects for grass and trees.
 * @module WindAnimation
 */

import { Vector3 } from '../../math/Vector3';

/**
 * Wind configuration.
 */
export interface WindConfig {
  /** Global wind direction */
  direction: Vector3;
  /** Wind strength (0-1) */
  strength: number;
  /** Wind speed/frequency */
  frequency: number;
  /** Turbulence amount */
  turbulence: number;
  /** Gust frequency */
  gustFrequency: number;
  /** Gust strength */
  gustStrength: number;
}

/**
 * Wind animation system for vegetation.
 * Generates wind parameters for realistic vegetation movement.
 *
 * @example
 * ```typescript
 * const wind = new WindAnimation({
 *   direction: new Vector3(1, 0, 0.3).normalize(),
 *   strength: 0.5,
 *   frequency: 2.0,
 *   turbulence: 0.3,
 *   gustFrequency: 0.1,
 *   gustStrength: 0.8
 * });
 *
 * // Update each frame
 * wind.update(deltaTime);
 *
 * // Get shader parameters
 * const params = wind.getShaderParams();
 * ```
 */
export class WindAnimation {
  private _config: WindConfig;
  private _time: number;
  private _gustPhase: number;

  /**
   * Creates a new wind animation system.
   *
   * @param config - Wind configuration
   */
  constructor(config: Partial<WindConfig> = {}) {
    this._config = {
      direction: config.direction ?? new Vector3(1, 0, 0).normalize(),
      strength: config.strength ?? 0.5,
      frequency: config.frequency ?? 2.0,
      turbulence: config.turbulence ?? 0.3,
      gustFrequency: config.gustFrequency ?? 0.1,
      gustStrength: config.gustStrength ?? 0.8,
    };

    this._time = 0;
    this._gustPhase = 0;
  }

  /**
   * Updates wind animation.
   *
   * @param deltaTime - Time delta in seconds
   */
  update(deltaTime: number): void {
    this._time += deltaTime * this._config.frequency;
    this._gustPhase += deltaTime * this._config.gustFrequency;
  }

  /**
   * Gets shader parameters for wind animation.
   *
   * @returns Wind shader parameters
   */
  getShaderParams(): {
    time: number;
    direction: Vector3;
    strength: number;
    frequency: number;
    turbulence: number;
    gustPhase: number;
    gustStrength: number;
  } {
    return {
      time: this._time,
      direction: this._config.direction.clone(),
      strength: this._config.strength,
      frequency: this._config.frequency,
      turbulence: this._config.turbulence,
      gustPhase: this._gustPhase,
      gustStrength: this._config.gustStrength,
    };
  }

  /**
   * Calculates wind displacement at a position.
   *
   * @param position - World position
   * @param height - Height in vegetation (0 = base, 1 = top)
   * @returns Wind displacement vector
   */
  calculateDisplacement(position: Vector3, height: number): Vector3 {
    // Base wave
    const wave = Math.sin(this._time + position.x * 0.1 + position.z * 0.1);

    // Turbulence
    const turbX = Math.sin(this._time * 2.3 + position.x * 0.3) * this._config.turbulence;
    const turbZ = Math.sin(this._time * 1.7 + position.z * 0.3) * this._config.turbulence;

    // Gust
    const gust = Math.sin(this._gustPhase) * this._config.gustStrength;

    // Height falloff (more movement at top)
    const heightFactor = height * height;

    // Combined displacement
    const totalStrength = (wave + gust) * this._config.strength * heightFactor;

    return new Vector3(
      this._config.direction.x * totalStrength + turbX * heightFactor,
      0,
      this._config.direction.z * totalStrength + turbZ * heightFactor
    );
  }

  /**
   * Sets wind direction.
   *
   * @param direction - New wind direction
   */
  setDirection(direction: Vector3): void {
    this._config.direction = direction.normalize();
  }

  /**
   * Sets wind strength.
   *
   * @param strength - Wind strength (0-1)
   */
  setStrength(strength: number): void {
    this._config.strength = Math.max(0, Math.min(1, strength));
  }

  /**
   * Sets wind frequency.
   *
   * @param frequency - Wind frequency
   */
  setFrequency(frequency: number): void {
    this._config.frequency = Math.max(0, frequency);
  }

  /**
   * Resets wind time.
   */
  reset(): void {
    this._time = 0;
    this._gustPhase = 0;
  }

  /**
   * Creates a wind animation with preset configuration.
   *
   * @param preset - Preset name
   * @returns Wind animation
   */
  static createPreset(preset: 'calm' | 'moderate' | 'strong'): WindAnimation {
    const presets: Record<string, Partial<WindConfig>> = {
      calm: {
        strength: 0.2,
        frequency: 1.0,
        turbulence: 0.1,
        gustFrequency: 0.05,
        gustStrength: 0.3,
      },
      moderate: {
        strength: 0.5,
        frequency: 2.0,
        turbulence: 0.3,
        gustFrequency: 0.1,
        gustStrength: 0.6,
      },
      strong: {
        strength: 0.8,
        frequency: 3.5,
        turbulence: 0.5,
        gustFrequency: 0.15,
        gustStrength: 1.0,
      },
    };

    return new WindAnimation(presets[preset]);
  }
}
