/**
 * Size module for controlling particle size over lifetime.
 * Supports size curves, size by speed, random ranges, and separate axis scaling.
 * @module SizeModule
 */

import { Vector3 } from '../../math/Vector3';
import { Spline, SplineType } from '../../math/Spline';
import { IParticleModule, ParticleSystem } from '../ParticleSystem';
import { Particle } from '../Particle';
import { Random } from '../../core/Random';

/**
 * Size curve data point.
 */
export interface SizeCurvePoint {
  /** Time [0-1] */
  time: number;
  /** Size multiplier at this time */
  value: number;
}

/**
 * Size module configuration.
 */
export interface SizeModuleConfig {
  /** Size over lifetime curve */
  sizeCurve?: SizeCurvePoint[];
  /** Enable size by speed */
  sizeBySpeed?: boolean;
  /** Minimum speed for size mapping */
  minSpeed?: number;
  /** Maximum speed for size mapping */
  maxSpeed?: number;
  /** Size multiplier at min speed */
  minSpeedSize?: number;
  /** Size multiplier at max speed */
  maxSpeedSize?: number;
  /** Random size range minimum */
  randomSizeMin?: number;
  /** Random size range maximum */
  randomSizeMax?: number;
  /** Separate X axis size curve */
  sizeXCurve?: SizeCurvePoint[];
  /** Separate Y axis size curve */
  sizeYCurve?: SizeCurvePoint[];
  /** Separate Z axis size curve */
  sizeZCurve?: SizeCurvePoint[];
  /** Use separate axis curves */
  useSeparateAxes?: boolean;
}

/**
 * Size module.
 *
 * Controls particle size over lifetime. Supports uniform and per-axis size curves,
 * size mapping by speed, and random size ranges.
 *
 * Features:
 * - Size over lifetime curves
 * - Size by particle speed
 * - Random size ranges
 * - Separate X/Y/Z size curves
 * - Smooth size interpolation
 *
 * @example
 * ```typescript
 * // Size over lifetime
 * const sizeModule = new SizeModule({
 *   sizeCurve: [
 *     { time: 0, value: 0 },      // Start small
 *     { time: 0.2, value: 1 },    // Grow quickly
 *     { time: 0.8, value: 1 },    // Stay large
 *     { time: 1, value: 0 },      // Shrink at end
 *   ],
 * });
 *
 * // Size by speed
 * const speedSizeModule = new SizeModule({
 *   sizeBySpeed: true,
 *   minSpeed: 0,
 *   maxSpeed: 10,
 *   minSpeedSize: 0.5,
 *   maxSpeedSize: 2.0,
 * });
 *
 * // Separate axis curves (for stretched particles)
 * const stretchModule = new SizeModule({
 *   useSeparateAxes: true,
 *   sizeXCurve: [
 *     { time: 0, value: 1 },
 *     { time: 1, value: 0.5 },
 *   ],
 *   sizeYCurve: [
 *     { time: 0, value: 1 },
 *     { time: 1, value: 2 },      // Stretch vertically
 *   ],
 * });
 *
 * system.addModule(sizeModule);
 * ```
 */
export class SizeModule implements IParticleModule {
  readonly name: string = 'SizeModule';
  enabled: boolean = true;
  priority: number = 31; // Run after color

  /** Size curve spline */
  private _sizeCurve: Spline | null = null;

  /** Separate axis curves */
  private _sizeXCurve: Spline | null = null;
  private _sizeYCurve: Spline | null = null;
  private _sizeZCurve: Spline | null = null;

  /** Use separate axis curves */
  useSeparateAxes: boolean = false;

  /** Size by speed */
  sizeBySpeed: boolean = false;
  minSpeed: number = 0;
  maxSpeed: number = 10;
  minSpeedSize: number = 0.5;
  maxSpeedSize: number = 2.0;

  /** Random size range */
  randomSizeMin: number = 1.0;
  randomSizeMax: number = 1.0;

  /** Random number generator */
  private readonly _random: Random = new Random();

  /**
   * Helper to evaluate 1D spline curve
   */
  private evaluateSpline(spline: Spline, t: number): number {
    return spline.getPoint(t).y;
  }

  /**
   * Create a new size module.
   *
   * @param config - Module configuration
   */
  constructor(config: SizeModuleConfig = {}) {
    this.sizeBySpeed = config.sizeBySpeed ?? false;
    this.minSpeed = config.minSpeed ?? 0;
    this.maxSpeed = config.maxSpeed ?? 10;
    this.minSpeedSize = config.minSpeedSize ?? 0.5;
    this.maxSpeedSize = config.maxSpeedSize ?? 2.0;
    this.randomSizeMin = config.randomSizeMin ?? 1.0;
    this.randomSizeMax = config.randomSizeMax ?? 1.0;
    this.useSeparateAxes = config.useSeparateAxes ?? false;

    if (config.sizeCurve) {
      this.setSizeCurve(config.sizeCurve);
    }

    if (config.sizeXCurve) {
      this.setSizeXCurve(config.sizeXCurve);
    }

    if (config.sizeYCurve) {
      this.setSizeYCurve(config.sizeYCurve);
    }

    if (config.sizeZCurve) {
      this.setSizeZCurve(config.sizeZCurve);
    }
  }

  /**
   * Set size over lifetime curve.
   *
   * @param points - Curve points
   */
  setSizeCurve(points: SizeCurvePoint[]): void {
    if (points.length < 2) {
      this._sizeCurve = null;
      return;
    }

    const curvePoints = points.map((p) => new Vector3(p.time, p.value, 0));
    this._sizeCurve = new Spline(curvePoints, SplineType.CATMULL_ROM);
  }

  /**
   * Set X axis size curve.
   *
   * @param points - Curve points
   */
  setSizeXCurve(points: SizeCurvePoint[]): void {
    if (points.length < 2) {
      this._sizeXCurve = null;
      return;
    }

    const curvePoints = points.map((p) => new Vector3(p.time, p.value, 0));
    this._sizeXCurve = new Spline(curvePoints, SplineType.CATMULL_ROM);
  }

  /**
   * Set Y axis size curve.
   *
   * @param points - Curve points
   */
  setSizeYCurve(points: SizeCurvePoint[]): void {
    if (points.length < 2) {
      this._sizeYCurve = null;
      return;
    }

    const curvePoints = points.map((p) => new Vector3(p.time, p.value, 0));
    this._sizeYCurve = new Spline(curvePoints, SplineType.CATMULL_ROM);
  }

  /**
   * Set Z axis size curve.
   *
   * @param points - Curve points
   */
  setSizeZCurve(points: SizeCurvePoint[]): void {
    if (points.length < 2) {
      this._sizeZCurve = null;
      return;
    }

    const curvePoints = points.map((p) => new Vector3(p.time, p.value, 0));
    this._sizeZCurve = new Spline(curvePoints, SplineType.CATMULL_ROM);
  }

  /**
   * Initialize particle size.
   *
   * @param particle - Particle to initialize
   * @param system - Parent particle system
   */
  initializeParticle(particle: Particle, system: ParticleSystem): void {
    // Apply random size range
    if (this.randomSizeMin !== this.randomSizeMax) {
      const randomScale = this._random.nextRange(this.randomSizeMin, this.randomSizeMax);
      particle.size.multiplyScalar(randomScale);
      particle.startSize.multiplyScalar(randomScale);
    }
  }

  /**
   * Update particle size.
   *
   * @param particle - Particle to update
   * @param deltaTime - Time step in seconds
   * @param system - Parent particle system
   */
  updateParticle(particle: Particle, deltaTime: number, system: ParticleSystem): void {
    // Start with initial size
    particle.size.copy(particle.startSize);

    // Apply size curve
    if (this.useSeparateAxes) {
      // Separate axis curves
      if (this._sizeXCurve) {
        const xScale = this.evaluateSpline(this._sizeXCurve, particle.normalizedAge);
        particle.size.x = particle.startSize.x * xScale;
      }

      if (this._sizeYCurve) {
        const yScale = this.evaluateSpline(this._sizeYCurve, particle.normalizedAge);
        particle.size.y = particle.startSize.y * yScale;
      }

      if (this._sizeZCurve) {
        const zScale = this.evaluateSpline(this._sizeZCurve, particle.normalizedAge);
        particle.size.z = particle.startSize.z * zScale;
      }
    } else if (this._sizeCurve) {
      // Uniform size curve
      const sizeScale = this.evaluateSpline(this._sizeCurve, particle.normalizedAge);
      particle.size.multiplyScalar(sizeScale);
    }

    // Apply size by speed
    if (this.sizeBySpeed) {
      const speed = particle.velocity.length();
      const t = Math.max(0, Math.min(1, (speed - this.minSpeed) / (this.maxSpeed - this.minSpeed)));
      const speedSize = this.minSpeedSize + (this.maxSpeedSize - this.minSpeedSize) * t;
      particle.size.multiplyScalar(speedSize);
    }

    // Ensure non-negative
    particle.size.x = Math.max(0, particle.size.x);
    particle.size.y = Math.max(0, particle.size.y);
    particle.size.z = Math.max(0, particle.size.z);
  }

  /**
   * Evaluate size curve at time.
   *
   * @param time - Normalized time [0-1]
   * @returns Size multiplier
   */
  evaluateCurve(time: number): number {
    if (!this._sizeCurve) {
      return 1.0;
    }
    return this.evaluateSpline(this._sizeCurve, time);
  }

  /**
   * Evaluate X curve at time.
   *
   * @param time - Normalized time [0-1]
   * @returns Size multiplier
   */
  evaluateXCurve(time: number): number {
    if (!this._sizeXCurve) {
      return 1.0;
    }
    return this.evaluateSpline(this._sizeXCurve, time);
  }

  /**
   * Evaluate Y curve at time.
   *
   * @param time - Normalized time [0-1]
   * @returns Size multiplier
   */
  evaluateYCurve(time: number): number {
    if (!this._sizeYCurve) {
      return 1.0;
    }
    return this.evaluateSpline(this._sizeYCurve, time);
  }

  /**
   * Evaluate Z curve at time.
   *
   * @param time - Normalized time [0-1]
   * @returns Size multiplier
   */
  evaluateZCurve(time: number): number {
    if (!this._sizeZCurve) {
      return 1.0;
    }
    return this.evaluateSpline(this._sizeZCurve, time);
  }
}
