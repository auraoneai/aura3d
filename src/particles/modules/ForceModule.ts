/**
 * Force module for applying forces to particles.
 * Supports gravity, wind, drag, turbulence, and vortex forces.
 * @module ForceModule
 */

import { Vector3 } from '../../math/Vector3';
import { IParticleModule, ParticleSystem } from '../ParticleSystem';
import { Particle } from '../Particle';
import { Random } from '../../core/Random';

/**
 * Force module configuration.
 */
export interface ForceModuleConfig {
  /** Gravity acceleration (m/s^2) */
  gravity?: number;
  /** Gravity direction (normalized) */
  gravityDirection?: Vector3;
  /** Wind force (constant force) */
  wind?: Vector3;
  /** Wind randomness factor [0-1] */
  windRandomness?: number;
  /** Drag coefficient */
  drag?: number;
  /** Enable turbulence */
  turbulence?: boolean;
  /** Turbulence strength */
  turbulenceStrength?: number;
  /** Turbulence frequency */
  turbulenceFrequency?: number;
  /** Turbulence octaves */
  turbulenceOctaves?: number;
  /** Enable vortex force */
  vortex?: boolean;
  /** Vortex center */
  vortexCenter?: Vector3;
  /** Vortex axis (normalized) */
  vortexAxis?: Vector3;
  /** Vortex strength */
  vortexStrength?: number;
  /** Vortex radius */
  vortexRadius?: number;
}

/**
 * Force module.
 *
 * Applies various forces to particles including gravity, wind, drag, turbulence,
 * and vortex forces. Forces can be combined to create complex particle behaviors.
 *
 * Features:
 * - Gravity with configurable direction
 * - Wind forces with randomness
 * - Air drag/resistance
 * - Turbulence/noise forces
 * - Vortex/tornado forces
 *
 * @example
 * ```typescript
 * // Gravity
 * const gravityModule = new ForceModule({
 *   gravity: 9.8,
 *   gravityDirection: new Vector3(0, -1, 0),
 * });
 *
 * // Wind
 * const windModule = new ForceModule({
 *   wind: new Vector3(2, 0, 0),
 *   windRandomness: 0.3,
 *   drag: 0.1,
 * });
 *
 * // Turbulence
 * const turbulenceModule = new ForceModule({
 *   turbulence: true,
 *   turbulenceStrength: 5,
 *   turbulenceFrequency: 1,
 *   turbulenceOctaves: 3,
 * });
 *
 * // Vortex
 * const vortexModule = new ForceModule({
 *   vortex: true,
 *   vortexCenter: new Vector3(0, 5, 0),
 *   vortexAxis: new Vector3(0, 1, 0),
 *   vortexStrength: 10,
 *   vortexRadius: 5,
 * });
 *
 * system.addModule(gravityModule);
 * ```
 */
export class ForceModule implements IParticleModule {
  readonly name: string = 'ForceModule';
  enabled: boolean = true;
  priority: number = 20; // Run after velocity initialization

  /** Gravity magnitude */
  gravity: number = 0;

  /** Gravity direction */
  readonly gravityDirection: Vector3 = new Vector3(0, -1, 0);

  /** Wind force */
  readonly wind: Vector3 = new Vector3();

  /** Wind randomness */
  windRandomness: number = 0;

  /** Drag coefficient */
  drag: number = 0;

  /** Turbulence enabled */
  turbulence: boolean = false;

  /** Turbulence strength */
  turbulenceStrength: number = 1.0;

  /** Turbulence frequency */
  turbulenceFrequency: number = 1.0;

  /** Turbulence octaves */
  turbulenceOctaves: number = 1;

  /** Vortex enabled */
  vortex: boolean = false;

  /** Vortex center */
  readonly vortexCenter: Vector3 = new Vector3();

  /** Vortex axis */
  readonly vortexAxis: Vector3 = new Vector3(0, 1, 0);

  /** Vortex strength */
  vortexStrength: number = 1.0;

  /** Vortex radius */
  vortexRadius: number = 1.0;

  /** Random number generator */
  private readonly _random: Random = new Random();

  /** Current wind with randomness */
  private readonly _currentWind: Vector3 = new Vector3();

  /** Wind update timer */
  private _windUpdateTimer: number = 0;

  /** Wind update interval */
  private readonly _windUpdateInterval: number = 0.1;

  /** Temporary vectors */
  private static readonly _tempVector1 = new Vector3();
  private static readonly _tempVector2 = new Vector3();
  private static readonly _tempVector3 = new Vector3();

  /**
   * Create a new force module.
   *
   * @param config - Module configuration
   */
  constructor(config: ForceModuleConfig = {}) {
    this.gravity = config.gravity ?? 0;
    this.windRandomness = config.windRandomness ?? 0;
    this.drag = config.drag ?? 0;
    this.turbulence = config.turbulence ?? false;
    this.turbulenceStrength = config.turbulenceStrength ?? 1.0;
    this.turbulenceFrequency = config.turbulenceFrequency ?? 1.0;
    this.turbulenceOctaves = config.turbulenceOctaves ?? 1;
    this.vortex = config.vortex ?? false;
    this.vortexStrength = config.vortexStrength ?? 1.0;
    this.vortexRadius = config.vortexRadius ?? 1.0;

    if (config.gravityDirection) {
      this.gravityDirection.copy(config.gravityDirection).normalize();
    }

    if (config.wind) {
      this.wind.copy(config.wind);
      this._currentWind.copy(config.wind);
    }

    if (config.vortexCenter) {
      this.vortexCenter.copy(config.vortexCenter);
    }

    if (config.vortexAxis) {
      this.vortexAxis.copy(config.vortexAxis).normalize();
    }
  }

  /**
   * Pre-update: Update wind randomness.
   *
   * @param deltaTime - Time step in seconds
   * @param system - Parent particle system
   */
  preUpdate(deltaTime: number, system: ParticleSystem): void {
    // Update wind randomness periodically
    if (this.windRandomness > 0) {
      this._windUpdateTimer += deltaTime;
      if (this._windUpdateTimer >= this._windUpdateInterval) {
        this._windUpdateTimer = 0;
        this.updateWindRandomness();
      }
    }
  }

  /**
   * Update wind with randomness.
   */
  private updateWindRandomness(): void {
    const randomOffset = ForceModule._tempVector1.set(
      this._random.nextRange(-1, 1),
      this._random.nextRange(-1, 1),
      this._random.nextRange(-1, 1)
    );
    randomOffset.multiplyScalar(this.windRandomness);

    this._currentWind.copy(this.wind).add(randomOffset);
  }

  /**
   * Update particle forces.
   *
   * @param particle - Particle to update
   * @param deltaTime - Time step in seconds
   * @param system - Parent particle system
   */
  updateParticle(particle: Particle, deltaTime: number, system: ParticleSystem): void {
    const force = ForceModule._tempVector1.set(0, 0, 0);

    // Apply gravity
    if (this.gravity !== 0) {
      const gravityForce = ForceModule._tempVector2
        .copy(this.gravityDirection)
        .multiplyScalar(this.gravity * particle.mass * system.gravityScale);
      force.add(gravityForce);
    }

    // Apply wind
    if (this.wind.lengthSquared() > 0 || this.windRandomness > 0) {
      const windForce = ForceModule._tempVector2.copy(this._currentWind);
      force.add(windForce);
    }

    // Apply turbulence
    if (this.turbulence) {
      const turbulenceForce = this.calculateTurbulence(particle, system.time);
      force.add(turbulenceForce);
    }

    // Apply vortex
    if (this.vortex) {
      const vortexForce = this.calculateVortex(particle);
      force.add(vortexForce);
    }

    // Apply force to particle
    if (force.lengthSquared() > 0) {
      particle.applyForce(force);
    }

    // Apply drag
    if (this.drag > 0) {
      particle.drag = this.drag;
    }
  }

  /**
   * Calculate turbulence force using multi-octave noise.
   *
   * @param particle - Particle to calculate force for
   * @param time - Current time
   * @returns Turbulence force vector
   */
  private calculateTurbulence(particle: Particle, time: number): Vector3 {
    const force = ForceModule._tempVector2.set(0, 0, 0);
    const pos = particle.position;

    let amplitude = this.turbulenceStrength;
    let frequency = this.turbulenceFrequency;

    // Multi-octave noise
    for (let octave = 0; octave < this.turbulenceOctaves; octave++) {
      const noiseX = this.noise3D(
        pos.x * frequency,
        pos.y * frequency,
        pos.z * frequency + time
      );
      const noiseY = this.noise3D(
        pos.x * frequency + 100,
        pos.y * frequency + 100,
        pos.z * frequency + 100 + time
      );
      const noiseZ = this.noise3D(
        pos.x * frequency + 200,
        pos.y * frequency + 200,
        pos.z * frequency + 200 + time
      );

      force.x += noiseX * amplitude;
      force.y += noiseY * amplitude;
      force.z += noiseZ * amplitude;

      amplitude *= 0.5;
      frequency *= 2.0;
    }

    return force;
  }

  /**
   * Calculate vortex force.
   *
   * @param particle - Particle to calculate force for
   * @returns Vortex force vector
   */
  private calculateVortex(particle: Particle): Vector3 {
    const toParticle = ForceModule._tempVector2
      .copy(particle.position)
      .sub(this.vortexCenter);

    // Project onto vortex axis to get distance from axis
    const axisDistance = toParticle.dot(this.vortexAxis);
    const axisPoint = ForceModule._tempVector3
      .copy(this.vortexAxis)
      .multiplyScalar(axisDistance);

    // Vector from axis to particle
    const radial = toParticle.sub(axisPoint);
    const distance = radial.length();

    if (distance === 0 || distance > this.vortexRadius) {
      return new Vector3();
    }

    // Tangential force (perpendicular to radial)
    const tangent = ForceModule._tempVector1
      .copy(this.vortexAxis)
      .cross(radial)
      .normalize();

    // Force strength decreases with distance
    const falloff = 1 - distance / this.vortexRadius;
    const strength = this.vortexStrength * falloff;

    // Inward radial force
    const inward = radial.normalize().multiplyScalar(-strength * 0.3);

    // Tangential spinning force
    tangent.multiplyScalar(strength);

    return tangent.add(inward);
  }

  /**
   * Simple 3D noise function (Perlin-like).
   * For production, use a proper noise library.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   * @returns Noise value [-1, 1]
   */
  private noise3D(x: number, y: number, z: number): number {
    // Simplified noise using sin waves
    // In production, use proper Perlin or Simplex noise
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  }

  /**
   * Set gravity vector directly.
   *
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   */
  setGravity(x: number, y: number, z: number): void {
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    this.gravity = magnitude;
    if (magnitude > 0) {
      this.gravityDirection.set(x / magnitude, y / magnitude, z / magnitude);
    }
  }

  /**
   * Set wind vector.
   *
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   */
  setWind(x: number, y: number, z: number): void {
    this.wind.set(x, y, z);
    this._currentWind.copy(this.wind);
  }

  /**
   * Set vortex parameters.
   *
   * @param center - Vortex center
   * @param axis - Vortex axis
   * @param strength - Vortex strength
   * @param radius - Vortex radius
   */
  setVortex(center: Vector3, axis: Vector3, strength: number, radius: number): void {
    this.vortexCenter.copy(center);
    this.vortexAxis.copy(axis).normalize();
    this.vortexStrength = strength;
    this.vortexRadius = radius;
    this.vortex = true;
  }
}
