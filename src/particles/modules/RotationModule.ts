/**
 * Rotation module for controlling particle rotation over lifetime.
 * Supports initial rotation, angular velocity, rotation curves, and 3D rotation.
 * @module RotationModule
 */

import { Vector3 } from '../../math/Vector3';
import { Spline, SplineType } from '../../math/Spline';
import { IParticleModule, ParticleSystem } from '../ParticleSystem';
import { Particle } from '../Particle';
import { Random } from '../../core/Random';

/**
 * Rotation curve data point.
 */
export interface RotationCurvePoint {
  /** Time [0-1] */
  time: number;
  /** Rotation in radians at this time */
  value: number;
}

/**
 * Rotation module configuration.
 */
export interface RotationModuleConfig {
  /** Initial rotation range minimum (radians) */
  initialRotationMin?: number;
  /** Initial rotation range maximum (radians) */
  initialRotationMax?: number;
  /** Angular velocity range minimum (radians/second) */
  angularVelocityMin?: number;
  /** Angular velocity range maximum (radians/second) */
  angularVelocityMax?: number;
  /** Rotation over lifetime curve */
  rotationCurve?: RotationCurvePoint[];
  /** Enable 3D rotation */
  rotation3D?: boolean;
  /** Initial rotation 3D range minimum */
  initialRotation3DMin?: Vector3;
  /** Initial rotation 3D range maximum */
  initialRotation3DMax?: Vector3;
  /** Angular velocity 3D range minimum */
  angularVelocity3DMin?: Vector3;
  /** Angular velocity 3D range maximum */
  angularVelocity3DMax?: Vector3;
  /** Rotation X curve */
  rotationXCurve?: RotationCurvePoint[];
  /** Rotation Y curve */
  rotationYCurve?: RotationCurvePoint[];
  /** Rotation Z curve */
  rotationZCurve?: RotationCurvePoint[];
}

/**
 * Rotation module.
 *
 * Controls particle rotation over lifetime. Supports 2D and 3D rotation,
 * random initial rotation, angular velocity, and rotation curves.
 *
 * Features:
 * - Random initial rotation
 * - Constant angular velocity
 * - Rotation over lifetime curves
 * - Full 3D rotation support
 * - Per-axis rotation curves
 *
 * @example
 * ```typescript
 * // 2D rotation
 * const rotationModule = new RotationModule({
 *   initialRotationMin: 0,
 *   initialRotationMax: Math.PI * 2,
 *   angularVelocityMin: -Math.PI,
 *   angularVelocityMax: Math.PI,
 * });
 *
 * // Rotation curve
 * const curveModule = new RotationModule({
 *   rotationCurve: [
 *     { time: 0, value: 0 },
 *     { time: 1, value: Math.PI * 4 },  // 2 full rotations
 *   ],
 * });
 *
 * // 3D rotation
 * const rotation3DModule = new RotationModule({
 *   rotation3D: true,
 *   angularVelocity3DMin: new Vector3(-1, -1, -1),
 *   angularVelocity3DMax: new Vector3(1, 1, 1),
 * });
 *
 * system.addModule(rotationModule);
 * ```
 */
export class RotationModule implements IParticleModule {
  readonly name: string = 'RotationModule';
  enabled: boolean = true;
  priority: number = 32; // Run after size

  /** 2D rotation range */
  initialRotationMin: number = 0;
  initialRotationMax: number = 0;

  /** Angular velocity range (2D) */
  angularVelocityMin: number = 0;
  angularVelocityMax: number = 0;

  /** Rotation curve */
  private _rotationCurve: Spline | null = null;

  /** 3D rotation */
  rotation3D: boolean = false;

  /** 3D rotation ranges */
  readonly initialRotation3DMin: Vector3 = new Vector3();
  readonly initialRotation3DMax: Vector3 = new Vector3();
  readonly angularVelocity3DMin: Vector3 = new Vector3();
  readonly angularVelocity3DMax: Vector3 = new Vector3();

  /** Per-axis rotation curves */
  private _rotationXCurve: Spline | null = null;
  private _rotationYCurve: Spline | null = null;
  private _rotationZCurve: Spline | null = null;

  /** Random number generator */
  private readonly _random: Random = new Random();

  /**
   * Helper to evaluate 1D spline curve
   */
  private evaluateSpline(spline: Spline, t: number): number {
    return spline.getPoint(t).y;
  }

  /**
   * Create a new rotation module.
   *
   * @param config - Module configuration
   */
  constructor(config: RotationModuleConfig = {}) {
    this.initialRotationMin = config.initialRotationMin ?? 0;
    this.initialRotationMax = config.initialRotationMax ?? 0;
    this.angularVelocityMin = config.angularVelocityMin ?? 0;
    this.angularVelocityMax = config.angularVelocityMax ?? 0;
    this.rotation3D = config.rotation3D ?? false;

    if (config.initialRotation3DMin) {
      this.initialRotation3DMin.copy(config.initialRotation3DMin);
    }

    if (config.initialRotation3DMax) {
      this.initialRotation3DMax.copy(config.initialRotation3DMax);
    }

    if (config.angularVelocity3DMin) {
      this.angularVelocity3DMin.copy(config.angularVelocity3DMin);
    }

    if (config.angularVelocity3DMax) {
      this.angularVelocity3DMax.copy(config.angularVelocity3DMax);
    }

    if (config.rotationCurve) {
      this.setRotationCurve(config.rotationCurve);
    }

    if (config.rotationXCurve) {
      this.setRotationXCurve(config.rotationXCurve);
    }

    if (config.rotationYCurve) {
      this.setRotationYCurve(config.rotationYCurve);
    }

    if (config.rotationZCurve) {
      this.setRotationZCurve(config.rotationZCurve);
    }
  }

  /**
   * Set rotation over lifetime curve.
   *
   * @param points - Curve points
   */
  setRotationCurve(points: RotationCurvePoint[]): void {
    if (points.length < 2) {
      this._rotationCurve = null;
      return;
    }

    const curvePoints = points.map((p) => new Vector3(p.time, p.value, 0));
    this._rotationCurve = new Spline(curvePoints, SplineType.CATMULL_ROM);
  }

  /**
   * Set X axis rotation curve.
   *
   * @param points - Curve points
   */
  setRotationXCurve(points: RotationCurvePoint[]): void {
    if (points.length < 2) {
      this._rotationXCurve = null;
      return;
    }

    const curvePoints = points.map((p) => new Vector3(p.time, p.value, 0));
    this._rotationXCurve = new Spline(curvePoints, SplineType.CATMULL_ROM);
  }

  /**
   * Set Y axis rotation curve.
   *
   * @param points - Curve points
   */
  setRotationYCurve(points: RotationCurvePoint[]): void {
    if (points.length < 2) {
      this._rotationYCurve = null;
      return;
    }

    const curvePoints = points.map((p) => new Vector3(p.time, p.value, 0));
    this._rotationYCurve = new Spline(curvePoints, SplineType.CATMULL_ROM);
  }

  /**
   * Set Z axis rotation curve.
   *
   * @param points - Curve points
   */
  setRotationZCurve(points: RotationCurvePoint[]): void {
    if (points.length < 2) {
      this._rotationZCurve = null;
      return;
    }

    const curvePoints = points.map((p) => new Vector3(p.time, p.value, 0));
    this._rotationZCurve = new Spline(curvePoints, SplineType.CATMULL_ROM);
  }

  /**
   * Initialize particle rotation.
   *
   * @param particle - Particle to initialize
   * @param system - Parent particle system
   */
  initializeParticle(particle: Particle, system: ParticleSystem): void {
    if (this.rotation3D) {
      // 3D rotation
      particle.rotation.set(
        this._random.nextRange(this.initialRotation3DMin.x, this.initialRotation3DMax.x),
        this._random.nextRange(this.initialRotation3DMin.y, this.initialRotation3DMax.y),
        this._random.nextRange(this.initialRotation3DMin.z, this.initialRotation3DMax.z)
      );

      particle.angularVelocity.set(
        this._random.nextRange(this.angularVelocity3DMin.x, this.angularVelocity3DMax.x),
        this._random.nextRange(this.angularVelocity3DMin.y, this.angularVelocity3DMax.y),
        this._random.nextRange(this.angularVelocity3DMin.z, this.angularVelocity3DMax.z)
      );
    } else {
      // 2D rotation (Z axis only)
      const rotation = this._random.nextRange(this.initialRotationMin, this.initialRotationMax);
      particle.rotation.set(0, 0, rotation);

      const angularVelocity = this._random.nextRange(this.angularVelocityMin, this.angularVelocityMax);
      particle.angularVelocity.set(0, 0, angularVelocity);
    }

    particle.startRotation.copy(particle.rotation);
  }

  /**
   * Update particle rotation.
   *
   * @param particle - Particle to update
   * @param deltaTime - Time step in seconds
   * @param system - Parent particle system
   */
  updateParticle(particle: Particle, deltaTime: number, system: ParticleSystem): void {
    // Apply rotation curves
    if (this.rotation3D) {
      // 3D rotation curves
      if (this._rotationXCurve) {
        particle.rotation.x = this.evaluateSpline(this._rotationXCurve, particle.normalizedAge);
      }

      if (this._rotationYCurve) {
        particle.rotation.y = this.evaluateSpline(this._rotationYCurve, particle.normalizedAge);
      }

      if (this._rotationZCurve) {
        particle.rotation.z = this.evaluateSpline(this._rotationZCurve, particle.normalizedAge);
      }
    } else if (this._rotationCurve) {
      // 2D rotation curve
      particle.rotation.z = this.evaluateSpline(this._rotationCurve, particle.normalizedAge);
    }

    // Note: Angular velocity is applied in Particle.update()
  }

  /**
   * Evaluate rotation curve at time.
   *
   * @param time - Normalized time [0-1]
   * @returns Rotation in radians
   */
  evaluateCurve(time: number): number {
    if (!this._rotationCurve) {
      return 0;
    }
    return this.evaluateSpline(this._rotationCurve, time);
  }

  /**
   * Evaluate X rotation curve at time.
   *
   * @param time - Normalized time [0-1]
   * @returns Rotation in radians
   */
  evaluateXCurve(time: number): number {
    if (!this._rotationXCurve) {
      return 0;
    }
    return this.evaluateSpline(this._rotationXCurve, time);
  }

  /**
   * Evaluate Y rotation curve at time.
   *
   * @param time - Normalized time [0-1]
   * @returns Rotation in radians
   */
  evaluateYCurve(time: number): number {
    if (!this._rotationYCurve) {
      return 0;
    }
    return this.evaluateSpline(this._rotationYCurve, time);
  }

  /**
   * Evaluate Z rotation curve at time.
   *
   * @param time - Normalized time [0-1]
   * @returns Rotation in radians
   */
  evaluateZCurve(time: number): number {
    if (!this._rotationZCurve) {
      return 0;
    }
    return this.evaluateSpline(this._rotationZCurve, time);
  }
}
