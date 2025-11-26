/**
 * Color module for controlling particle color over lifetime.
 * Supports color gradients, color by speed, random colors, and alpha fading.
 * @module ColorModule
 */

import { Color } from '../../math/Color';
import { Spline, SplineType } from '../../math/Spline';
import { IParticleModule, ParticleSystem } from '../ParticleSystem';
import { Particle } from '../Particle';
import { Random } from '../../core/Random';

/**
 * Color gradient stop.
 */
export interface ColorGradientStop {
  /** Time [0-1] along lifetime */
  time: number;
  /** Color at this time */
  color: Color;
}

/**
 * Color module configuration.
 */
export interface ColorModuleConfig {
  /** Color over lifetime gradient */
  gradient?: ColorGradientStop[];
  /** Enable color by speed */
  colorBySpeed?: boolean;
  /** Minimum speed for color mapping */
  minSpeed?: number;
  /** Maximum speed for color mapping */
  maxSpeed?: number;
  /** Color at minimum speed */
  minSpeedColor?: Color;
  /** Color at maximum speed */
  maxSpeedColor?: Color;
  /** Random color between two colors */
  randomBetweenColors?: boolean;
  /** Random color range start */
  randomColorA?: Color;
  /** Random color range end */
  randomColorB?: Color;
  /** Enable alpha fade in */
  fadeIn?: boolean;
  /** Fade in duration [0-1] of lifetime */
  fadeInDuration?: number;
  /** Enable alpha fade out */
  fadeOut?: boolean;
  /** Fade out start time [0-1] of lifetime */
  fadeOutStart?: number;
}

/**
 * Color module.
 *
 * Controls particle color and alpha over lifetime. Supports color gradients,
 * color mapping by speed, random colors, and alpha fade effects.
 *
 * Features:
 * - Color over lifetime gradients
 * - Color by particle speed
 * - Random color ranges
 * - Alpha fade in/out
 * - Smooth color interpolation
 *
 * @example
 * ```typescript
 * // Color gradient
 * const colorModule = new ColorModule({
 *   gradient: [
 *     { time: 0, color: new Color(1, 0, 0, 1) },    // Red
 *     { time: 0.5, color: new Color(1, 1, 0, 1) },  // Yellow
 *     { time: 1, color: new Color(1, 1, 1, 0) },    // White fade
 *   ],
 * });
 *
 * // Color by speed
 * const speedColorModule = new ColorModule({
 *   colorBySpeed: true,
 *   minSpeed: 0,
 *   maxSpeed: 10,
 *   minSpeedColor: new Color(0, 0, 1, 1),  // Blue (slow)
 *   maxSpeedColor: new Color(1, 0, 0, 1),  // Red (fast)
 * });
 *
 * // Random color
 * const randomColorModule = new ColorModule({
 *   randomBetweenColors: true,
 *   randomColorA: new Color(1, 0, 0, 1),
 *   randomColorB: new Color(0, 1, 0, 1),
 * });
 *
 * // Fade in/out
 * const fadeModule = new ColorModule({
 *   fadeIn: true,
 *   fadeInDuration: 0.2,
 *   fadeOut: true,
 *   fadeOutStart: 0.7,
 * });
 *
 * system.addModule(colorModule);
 * ```
 */
export class ColorModule implements IParticleModule {
  readonly name: string = 'ColorModule';
  enabled: boolean = true;
  priority: number = 30; // Run after velocity/forces

  /** Color gradient stops */
  private readonly _gradientStops: ColorGradientStop[] = [];

  /** Color splines (R, G, B, A) */
  private _colorSplines: [Spline, Spline, Spline, Spline] | null = null;

  /** Color by speed */
  colorBySpeed: boolean = false;

  /** Min/max speed for color mapping */
  minSpeed: number = 0;
  maxSpeed: number = 10;

  /** Speed color range */
  readonly minSpeedColor: Color = new Color(1, 1, 1, 1);
  readonly maxSpeedColor: Color = new Color(1, 1, 1, 1);

  /** Random color between two colors */
  randomBetweenColors: boolean = false;
  readonly randomColorA: Color = new Color(1, 1, 1, 1);
  readonly randomColorB: Color = new Color(1, 1, 1, 1);

  /** Fade in/out */
  fadeIn: boolean = false;
  fadeInDuration: number = 0.2;
  fadeOut: boolean = false;
  fadeOutStart: number = 0.8;

  /** Random number generator */
  private readonly _random: Random = new Random();

  /** Temporary color */
  private static readonly _tempColor = new Color();

  /**
   * Create a new color module.
   *
   * @param config - Module configuration
   */
  constructor(config: ColorModuleConfig = {}) {
    this.colorBySpeed = config.colorBySpeed ?? false;
    this.minSpeed = config.minSpeed ?? 0;
    this.maxSpeed = config.maxSpeed ?? 10;
    this.randomBetweenColors = config.randomBetweenColors ?? false;
    this.fadeIn = config.fadeIn ?? false;
    this.fadeInDuration = config.fadeInDuration ?? 0.2;
    this.fadeOut = config.fadeOut ?? false;
    this.fadeOutStart = config.fadeOutStart ?? 0.8;

    if (config.minSpeedColor) {
      this.minSpeedColor.copy(config.minSpeedColor);
    }

    if (config.maxSpeedColor) {
      this.maxSpeedColor.copy(config.maxSpeedColor);
    }

    if (config.randomColorA) {
      this.randomColorA.copy(config.randomColorA);
    }

    if (config.randomColorB) {
      this.randomColorB.copy(config.randomColorB);
    }

    if (config.gradient) {
      this.setGradient(config.gradient);
    }
  }

  /**
   * Set color gradient.
   *
   * @param stops - Gradient stops
   */
  setGradient(stops: ColorGradientStop[]): void {
    this._gradientStops.length = 0;
    this._gradientStops.push(...stops);

    // Sort by time
    this._gradientStops.sort((a, b) => a.time - b.time);

    // Build splines
    if (this._gradientStops.length >= 2) {
      const times = this._gradientStops.map((s) => s.time);
      const r = this._gradientStops.map((s) => s.color.r);
      const g = this._gradientStops.map((s) => s.color.g);
      const b = this._gradientStops.map((s) => s.color.b);
      const a = this._gradientStops.map((s) => s.color.a);

      this._colorSplines = [
        new Spline(times, r, SplineType.CatmullRom),
        new Spline(times, g, SplineType.CatmullRom),
        new Spline(times, b, SplineType.CatmullRom),
        new Spline(times, a, SplineType.CatmullRom),
      ];
    } else {
      this._colorSplines = null;
    }
  }

  /**
   * Add gradient stop.
   *
   * @param time - Time [0-1]
   * @param color - Color at this time
   */
  addGradientStop(time: number, color: Color): void {
    this._gradientStops.push({ time, color: color.clone() });
    this.setGradient(this._gradientStops);
  }

  /**
   * Clear gradient.
   */
  clearGradient(): void {
    this._gradientStops.length = 0;
    this._colorSplines = null;
  }

  /**
   * Initialize particle color.
   *
   * @param particle - Particle to initialize
   * @param system - Parent particle system
   */
  initializeParticle(particle: Particle, system: ParticleSystem): void {
    // Random between two colors
    if (this.randomBetweenColors) {
      const t = this._random.value();
      particle.startColor.copy(this.randomColorA).lerp(this.randomColorB, t);
      particle.color.copy(particle.startColor);
    }

    // Store initial alpha for fade
    if (this.fadeIn) {
      particle.setCustomData('initialAlpha', particle.color.a);
    }
  }

  /**
   * Update particle color.
   *
   * @param particle - Particle to update
   * @param deltaTime - Time step in seconds
   * @param system - Parent particle system
   */
  updateParticle(particle: Particle, deltaTime: number, system: ParticleSystem): void {
    // Color gradient
    if (this._colorSplines) {
      particle.color.r = this._colorSplines[0].evaluate(particle.normalizedAge);
      particle.color.g = this._colorSplines[1].evaluate(particle.normalizedAge);
      particle.color.b = this._colorSplines[2].evaluate(particle.normalizedAge);
      particle.color.a = this._colorSplines[3].evaluate(particle.normalizedAge);
    }

    // Color by speed
    if (this.colorBySpeed) {
      const speed = particle.velocity.length();
      const t = Math.max(0, Math.min(1, (speed - this.minSpeed) / (this.maxSpeed - this.minSpeed)));
      const speedColor = ColorModule._tempColor;
      speedColor.copy(this.minSpeedColor).lerp(this.maxSpeedColor, t);
      particle.color.multiply(speedColor);
    }

    // Fade in
    if (this.fadeIn && particle.normalizedAge < this.fadeInDuration) {
      const initialAlpha = particle.getCustomData('initialAlpha', 1.0);
      const fadeT = particle.normalizedAge / this.fadeInDuration;
      particle.color.a *= fadeT * initialAlpha;
    }

    // Fade out
    if (this.fadeOut && particle.normalizedAge >= this.fadeOutStart) {
      const fadeT = (particle.normalizedAge - this.fadeOutStart) / (1 - this.fadeOutStart);
      particle.color.a *= 1 - fadeT;
    }

    // Clamp values
    particle.color.r = Math.max(0, Math.min(1, particle.color.r));
    particle.color.g = Math.max(0, Math.min(1, particle.color.g));
    particle.color.b = Math.max(0, Math.min(1, particle.color.b));
    particle.color.a = Math.max(0, Math.min(1, particle.color.a));
  }

  /**
   * Evaluate gradient at time.
   *
   * @param time - Normalized time [0-1]
   * @param out - Output color
   * @returns Output color
   */
  evaluateGradient(time: number, out: Color = new Color()): Color {
    if (!this._colorSplines) {
      return out.set(1, 1, 1, 1);
    }

    out.r = this._colorSplines[0].evaluate(time);
    out.g = this._colorSplines[1].evaluate(time);
    out.b = this._colorSplines[2].evaluate(time);
    out.a = this._colorSplines[3].evaluate(time);

    return out;
  }

  /**
   * Get gradient stops.
   *
   * @returns Array of gradient stops
   */
  get gradientStops(): readonly ColorGradientStop[] {
    return this._gradientStops;
  }
}
