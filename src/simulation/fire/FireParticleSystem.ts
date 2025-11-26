/**
 * Particle system for fire simulation.
 * Emits particles from hot regions for visual enhancement and ember effects.
 * @module FireParticleSystem
 */

import { Vector3 } from '../../math/Vector3';
import { Color } from '../../math/Color';
import { Logger } from '../../core/Logger';

const logger = Logger.get('FireParticleSystem');

/**
 * Individual fire particle with position, velocity, and lifetime.
 */
export interface FireParticle {
  position: Vector3;
  velocity: Vector3;
  temperature: number;
  lifetime: number;
  maxLifetime: number;
  size: number;
  color: Color;
}

/**
 * Configuration for fire particle emission.
 */
export interface FireParticleConfig {
  maxParticles: number;
  emissionRate: number;
  particleLifetime: number;
  initialVelocity: Vector3;
  velocityVariation: number;
  sizeRange: [number, number];
  temperatureThreshold: number;
}

/**
 * Fire particle system for visual effects.
 * Emits particles from hot regions and simulates their motion.
 */
export class FireParticleSystem {
  private readonly particles: FireParticle[];
  private readonly config: FireParticleConfig;
  private emissionAccumulator: number;

  /**
   * Creates a new fire particle system.
   * @param config - Particle system configuration
   */
  constructor(config: Partial<FireParticleConfig> = {}) {
    this.config = {
      maxParticles: config.maxParticles ?? 10000,
      emissionRate: config.emissionRate ?? 500,
      particleLifetime: config.particleLifetime ?? 2.0,
      initialVelocity: config.initialVelocity ?? new Vector3(0, 5, 0),
      velocityVariation: config.velocityVariation ?? 2.0,
      sizeRange: config.sizeRange ?? [0.05, 0.2],
      temperatureThreshold: config.temperatureThreshold ?? 400,
    };

    this.particles = [];
    this.emissionAccumulator = 0;

    logger.info(`Fire particle system initialized: max ${this.config.maxParticles} particles`);
  }

  /**
   * Emits particles from a heat source.
   * @param position - Emission position
   * @param temperature - Temperature at position
   * @param velocity - Base velocity
   * @param count - Number of particles to emit
   */
  public emit(position: Vector3, temperature: number, velocity: Vector3, count: number): void {
    if (temperature < this.config.temperatureThreshold) {
      return;
    }

    for (let i = 0; i < count && this.particles.length < this.config.maxParticles; i++) {
      const randomOffset = new Vector3(
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2
      );

      const randomVelocity = new Vector3(
        (Math.random() - 0.5) * this.config.velocityVariation,
        (Math.random() - 0.5) * this.config.velocityVariation,
        (Math.random() - 0.5) * this.config.velocityVariation
      );

      const particleVelocity = this.config.initialVelocity
        .add(velocity)
        .add(randomVelocity);

      const size = this.config.sizeRange[0] +
        Math.random() * (this.config.sizeRange[1] - this.config.sizeRange[0]);

      const lifetime = this.config.particleLifetime * (0.8 + Math.random() * 0.4);

      const particle: FireParticle = {
        position: position.add(randomOffset),
        velocity: particleVelocity,
        temperature,
        lifetime,
        maxLifetime: lifetime,
        size,
        color: this.temperatureToColor(temperature),
      };

      this.particles.push(particle);
    }
  }

  /**
   * Emits particles from hot grid cells.
   * @param getTemperature - Function to get temperature at grid cell
   * @param getVelocity - Function to get velocity at grid cell
   * @param resolution - Grid resolution
   * @param cellSize - Grid cell size
   * @param dt - Time delta
   */
  public emitFromGrid(
    getTemperature: (i: number, j: number, k: number) => number,
    getVelocity: (i: number, j: number, k: number) => Vector3,
    resolution: Vector3,
    cellSize: number,
    dt: number
  ): void {
    this.emissionAccumulator += this.config.emissionRate * dt;
    const particlesToEmit = Math.floor(this.emissionAccumulator);
    this.emissionAccumulator -= particlesToEmit;

    if (particlesToEmit === 0) {
      return;
    }

    const hotCells: Array<{pos: Vector3; temp: number; vel: Vector3}> = [];

    for (let k = 0; k < resolution.z; k++) {
      for (let j = 0; j < resolution.y; j++) {
        for (let i = 0; i < resolution.x; i++) {
          const temp = getTemperature(i, j, k);
          if (temp > this.config.temperatureThreshold) {
            const position = new Vector3(
              (i + 0.5) * cellSize,
              (j + 0.5) * cellSize,
              (k + 0.5) * cellSize
            );
            const velocity = getVelocity(i, j, k);
            hotCells.push({ pos: position, temp, vel: velocity });
          }
        }
      }
    }

    if (hotCells.length === 0) {
      return;
    }

    for (let i = 0; i < particlesToEmit; i++) {
      const cell = hotCells[Math.floor(Math.random() * hotCells.length)]!;
      this.emit(cell.pos, cell.temp, cell.vel, 1);
    }
  }

  /**
   * Updates all particles.
   * @param dt - Time delta in seconds
   * @param gravity - Gravity vector
   * @param velocityField - Optional velocity field for advection
   */
  public update(
    dt: number,
    gravity: Vector3 = new Vector3(0, -9.81, 0),
    velocityField?: (pos: Vector3) => Vector3
  ): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i]!;

      particle.lifetime -= dt;

      if (particle.lifetime <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      let acceleration = gravity;

      const buoyancy = this.calculateBuoyancy(particle.temperature);
      acceleration = acceleration.add(buoyancy);

      if (velocityField) {
        const fieldVelocity = velocityField(particle.position);
        particle.velocity = particle.velocity.scale(0.9).add(fieldVelocity.scale(0.1));
      }

      particle.velocity = particle.velocity.add(acceleration.scale(dt));
      particle.position = particle.position.add(particle.velocity.scale(dt));

      particle.temperature *= 0.98;

      const lifeRatio = particle.lifetime / particle.maxLifetime;
      particle.color = this.temperatureToColor(particle.temperature * lifeRatio);
    }
  }

  /**
   * Calculates buoyancy force based on temperature.
   * @param temperature - Particle temperature in Kelvin
   * @returns Buoyancy force vector
   */
  private calculateBuoyancy(temperature: number): Vector3 {
    const ambientTemp = 293;
    const buoyancyCoeff = 0.5;

    if (temperature <= ambientTemp) {
      return Vector3.zero();
    }

    const tempDiff = temperature - ambientTemp;
    const buoyancyMagnitude = buoyancyCoeff * tempDiff / ambientTemp;

    return new Vector3(0, buoyancyMagnitude, 0);
  }

  /**
   * Converts temperature to color using blackbody radiation approximation.
   * @param temperature - Temperature in Kelvin
   * @returns Color
   */
  private temperatureToColor(temperature: number): Color {
    const t = Math.max(0, Math.min(3000, temperature - 293)) / 3000;

    if (t < 0.33) {
      const s = t / 0.33;
      return new Color(1, s * 0.3, 0, 1);
    } else if (t < 0.66) {
      const s = (t - 0.33) / 0.33;
      return new Color(1, 0.3 + s * 0.5, s * 0.2, 1);
    } else {
      const s = (t - 0.66) / 0.34;
      return new Color(1, 0.8 + s * 0.2, 0.2 + s * 0.6, 1);
    }
  }

  /**
   * Gets all active particles.
   */
  public getParticles(): readonly FireParticle[] {
    return this.particles;
  }

  /**
   * Gets active particle count.
   */
  public getParticleCount(): number {
    return this.particles.length;
  }

  /**
   * Clears all particles.
   */
  public clear(): void {
    this.particles.length = 0;
    this.emissionAccumulator = 0;
  }

  /**
   * Gets configuration.
   */
  public getConfig(): Readonly<FireParticleConfig> {
    return this.config;
  }
}
