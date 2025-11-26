/**
 * Velocity module for controlling particle velocity over lifetime.
 * Supports initial velocity, velocity curves, limits, and emitter inheritance.
 * @module VelocityModule
 */

import { Vector3 } from '../../math/Vector3';
import { Spline, SplineType } from '../../math/Spline';
import { IParticleModule, ParticleSystem } from '../ParticleSystem';
import { Particle } from '../Particle';
import { Random } from '../../core/Random';

/**
 * Velocity mode types.
 */
export enum VelocityMode {
  /** Linear velocity in direction */
  Linear = 'Linear',
  /** Orbital velocity around center */
  Orbital = 'Orbital',
  /** Radial velocity from center */
  Radial = 'Radial',
  /** Random velocity in all directions */
  Random = 'Random',
}

/**
 * Velocity curve data point.
 */
export interface VelocityCurvePoint {
  /** Time [0-1] */
  time: number;
  /** Velocity multiplier at this time */
  value: number;
}

/**
 * Velocity module configuration.
 */
export interface VelocityModuleConfig {
  /** Velocity mode */
  mode?: VelocityMode;
  /** Initial speed */
  speed?: number;
  /** Speed randomness [0-1] */
  speedRandomness?: number;
  /** Velocity direction (for linear mode) */
  direction?: Vector3;
  /** Direction randomness [0-1] */
  directionRandomness?: number;
  /** Orbital center (for orbital mode) */
  orbitalCenter?: Vector3;
  /** Orbital velocity */
  orbitalVelocity?: Vector3;
  /** Radial center (for radial mode) */
  radialCenter?: Vector3;
  /** Velocity over lifetime curve */
  velocityCurve?: VelocityCurvePoint[];
  /** Velocity limit (max speed) */
  velocityLimit?: number;
  /** Inherit emitter velocity */
  inheritVelocity?: boolean;
  /** Emitter velocity inheritance factor */
  inheritFactor?: number;
  /** Damping factor */
  damping?: number;
}

/**
 * Velocity module.
 *
 * Controls particle velocity including initial velocity, velocity over lifetime,
 * velocity limits, and emitter velocity inheritance. Supports multiple velocity
 * modes including linear, orbital, radial, and random.
 *
 * Features:
 * - Multiple velocity modes
 * - Initial velocity with randomness
 * - Velocity over lifetime curves
 * - Velocity limits
 * - Emitter velocity inheritance
 * - Damping/drag
 *
 * @example
 * ```typescript
 * // Linear velocity
 * const velocityModule = new VelocityModule({
 *   mode: VelocityMode.Linear,
 *   speed: 5,
 *   speedRandomness: 0.2,
 *   direction: new Vector3(0, 1, 0),
 *   directionRandomness: 0.1,
 * });
 *
 * // Orbital velocity
 * const orbitalModule = new VelocityModule({
 *   mode: VelocityMode.Orbital,
 *   orbitalCenter: new Vector3(0, 0, 0),
 *   orbitalVelocity: new Vector3(0, 2, 0),
 * });
 *
 * // Velocity over lifetime
 * velocityModule.setVelocityCurve([
 *   { time: 0, value: 1 },
 *   { time: 0.5, value: 0.5 },
 *   { time: 1, value: 0 },
 * ]);
 *
 * system.addModule(velocityModule);
 * ```
 */
export class VelocityModule implements IParticleModule {
  readonly name: string = 'VelocityModule';
  enabled: boolean = true;
  priority: number = 10; // Run early

  /** Velocity mode */
  mode: VelocityMode = VelocityMode.Linear;

  /** Initial speed */
  speed: number = 1.0;

  /** Speed randomness */
  speedRandomness: number = 0;

  /** Velocity direction (normalized) */
  readonly direction: Vector3 = new Vector3(0, 1, 0);

  /** Direction randomness */
  directionRandomness: number = 0;

  /** Orbital center */
  readonly orbitalCenter: Vector3 = new Vector3();

  /** Orbital velocity (angular velocity per axis) */
  readonly orbitalVelocity: Vector3 = new Vector3(0, 1, 0);

  /** Radial center */
  readonly radialCenter: Vector3 = new Vector3();

  /** Velocity curve spline */
  private _velocityCurve: Spline | null = null;

  /** Velocity limit */
  velocityLimit: number = Infinity;

  /** Inherit emitter velocity */
  inheritVelocity: boolean = false;

  /** Inheritance factor */
  inheritFactor: number = 1.0;

  /** Damping factor */
  damping: number = 0;

  /** Random number generator */
  private readonly _random: Random = new Random();

  /** Temporary vectors */
  private static readonly _tempVector1 = new Vector3();
  private static readonly _tempVector2 = new Vector3();
  private static readonly _tempVector3 = new Vector3();

  /**
   * Create a new velocity module.
   *
   * @param config - Module configuration
   */
  constructor(config: VelocityModuleConfig = {}) {
    this.mode = config.mode ?? VelocityMode.Linear;
    this.speed = config.speed ?? 1.0;
    this.speedRandomness = config.speedRandomness ?? 0;
    this.directionRandomness = config.directionRandomness ?? 0;
    this.velocityLimit = config.velocityLimit ?? Infinity;
    this.inheritVelocity = config.inheritVelocity ?? false;
    this.inheritFactor = config.inheritFactor ?? 1.0;
    this.damping = config.damping ?? 0;

    if (config.direction) {
      this.direction.copy(config.direction).normalize();
    }

    if (config.orbitalCenter) {
      this.orbitalCenter.copy(config.orbitalCenter);
    }

    if (config.orbitalVelocity) {
      this.orbitalVelocity.copy(config.orbitalVelocity);
    }

    if (config.radialCenter) {
      this.radialCenter.copy(config.radialCenter);
    }

    if (config.velocityCurve) {
      this.setVelocityCurve(config.velocityCurve);
    }
  }

  /**
   * Set velocity over lifetime curve.
   *
   * @param points - Curve points
   */
  setVelocityCurve(points: VelocityCurvePoint[]): void {
    if (points.length < 2) {
      this._velocityCurve = null;
      return;
    }

    const times = points.map((p) => p.time);
    const values = points.map((p) => p.value);
    this._velocityCurve = new Spline(times, values, SplineType.CatmullRom);
  }

  /**
   * Initialize particle velocity.
   *
   * @param particle - Particle to initialize
   * @param system - Parent particle system
   */
  initializeParticle(particle: Particle, system: ParticleSystem): void {
    const velocity = VelocityModule._tempVector1;

    // Generate velocity based on mode
    switch (this.mode) {
      case VelocityMode.Linear:
        this.generateLinearVelocity(velocity);
        break;
      case VelocityMode.Orbital:
        this.generateOrbitalVelocity(particle, velocity);
        break;
      case VelocityMode.Radial:
        this.generateRadialVelocity(particle, velocity);
        break;
      case VelocityMode.Random:
        this.generateRandomVelocity(velocity);
        break;
    }

    // Apply speed
    const speed = this.speed * (1 + (this._random.value() - 0.5) * 2 * this.speedRandomness);
    velocity.normalize().multiplyScalar(speed);

    // Inherit emitter velocity
    if (this.inheritVelocity) {
      const emitterVel = VelocityModule._tempVector2.copy(system.emitter.velocity);
      emitterVel.multiplyScalar(this.inheritFactor);
      velocity.add(emitterVel);
    }

    // Set particle velocity
    particle.velocity.copy(velocity);
    particle.startVelocity.copy(velocity);
  }

  /**
   * Update particle velocity.
   *
   * @param particle - Particle to update
   * @param deltaTime - Time step in seconds
   * @param system - Parent particle system
   */
  updateParticle(particle: Particle, deltaTime: number, system: ParticleSystem): void {
    // Apply velocity curve
    if (this._velocityCurve) {
      const curveValue = this._velocityCurve.evaluate(particle.normalizedAge);
      const targetVelocity = VelocityModule._tempVector1.copy(particle.startVelocity);
      targetVelocity.multiplyScalar(curveValue);
      particle.velocity.copy(targetVelocity);
    }

    // Apply orbital velocity
    if (this.mode === VelocityMode.Orbital) {
      this.updateOrbitalVelocity(particle, deltaTime);
    }

    // Apply damping
    if (this.damping > 0) {
      const dampingFactor = Math.max(0, 1 - this.damping * deltaTime);
      particle.velocity.multiplyScalar(dampingFactor);
    }

    // Apply velocity limit
    if (this.velocityLimit < Infinity) {
      const speed = particle.velocity.length();
      if (speed > this.velocityLimit) {
        particle.velocity.normalize().multiplyScalar(this.velocityLimit);
      }
    }
  }

  /**
   * Generate linear velocity.
   */
  private generateLinearVelocity(out: Vector3): void {
    out.copy(this.direction);

    // Apply randomness
    if (this.directionRandomness > 0) {
      const random = VelocityModule._tempVector2.set(
        this._random.range(-1, 1),
        this._random.range(-1, 1),
        this._random.range(-1, 1)
      );
      random.normalize().multiplyScalar(this.directionRandomness);
      out.add(random).normalize();
    }
  }

  /**
   * Generate orbital velocity.
   */
  private generateOrbitalVelocity(particle: Particle, out: Vector3): void {
    // Calculate tangent direction for orbital motion
    const toParticle = VelocityModule._tempVector2
      .copy(particle.position)
      .sub(this.orbitalCenter);

    // Cross with orbital axis to get tangent
    out.copy(this.orbitalVelocity).cross(toParticle).normalize();
  }

  /**
   * Generate radial velocity.
   */
  private generateRadialVelocity(particle: Particle, out: Vector3): void {
    out.copy(particle.position).sub(this.radialCenter).normalize();

    // Apply randomness
    if (this.directionRandomness > 0) {
      const random = VelocityModule._tempVector2.set(
        this._random.range(-1, 1),
        this._random.range(-1, 1),
        this._random.range(-1, 1)
      );
      random.normalize().multiplyScalar(this.directionRandomness);
      out.add(random).normalize();
    }
  }

  /**
   * Generate random velocity.
   */
  private generateRandomVelocity(out: Vector3): void {
    // Random direction on unit sphere
    const theta = this._random.range(0, Math.PI * 2);
    const phi = Math.acos(this._random.range(-1, 1));

    out.set(
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi)
    );
  }

  /**
   * Update orbital velocity (continuous orbital motion).
   */
  private updateOrbitalVelocity(particle: Particle, deltaTime: number): void {
    const toParticle = VelocityModule._tempVector1
      .copy(particle.position)
      .sub(this.orbitalCenter);

    const tangent = VelocityModule._tempVector2
      .copy(this.orbitalVelocity)
      .cross(toParticle)
      .normalize();

    const speed = particle.velocity.length();
    particle.velocity.copy(tangent).multiplyScalar(speed);
  }

  /**
   * Evaluate velocity curve at time.
   *
   * @param time - Normalized time [0-1]
   * @returns Velocity multiplier
   */
  evaluateCurve(time: number): number {
    if (!this._velocityCurve) {
      return 1.0;
    }
    return this._velocityCurve.evaluate(time);
  }
}
