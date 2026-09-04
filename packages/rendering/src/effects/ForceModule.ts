import type { Particle, Vector3Like } from "./Particle.js";
import type { ParticleModule, ParticleUpdateContext } from "./ParticleModule.js";

export type ForceSampler = Vector3Like | ((particle: Particle, context: ParticleUpdateContext) => Vector3Like);

export class ForceModule implements ParticleModule {
  readonly name = "ForceModule";
  readonly force: ForceSampler;

  constructor(force: ForceSampler) {
    this.force = force;
  }

  update(particle: Particle, context: ParticleUpdateContext): void {
    const force = typeof this.force === "function" ? this.force(particle, context) : this.force;

    particle.velocity.x += force.x * context.deltaTime;
    particle.velocity.y += force.y * context.deltaTime;
    particle.velocity.z += force.z * context.deltaTime;
  }
}

export function gravityForce(gravity = -9.81): ForceModule {
  return new ForceModule({ x: 0, y: gravity, z: 0 });
}

export interface WindModuleOptions {
  readonly direction: Vector3Like;
  readonly strength?: number;
  /** Gust amplitude as a fraction of strength (0 = steady wind). */
  readonly gustAmplitude?: number;
  readonly gustDirection?: Vector3Like;
  readonly gustFrequency?: number;
  readonly gustSpeed?: number;
}

export interface GPUWindParams {
  readonly direction: Vector3Like;
  readonly strength: number;
  readonly gustAmplitude: number;
  readonly gustDirection: Vector3Like;
  readonly gustFrequency: number;
  readonly gustSpeed: number;
}

/**
 * Analytic wind field with a traveling sinusoidal gust. The CPU fallback
 * evaluates the same closed form the WGSL kernel implements, so the wind
 * costs zero CPU per-particle work on the GPU path.
 */
export class WindModule implements ParticleModule {
  readonly name = "WindModule";
  readonly supportsGPU = true;
  readonly direction: Vector3Like;
  readonly strength: number;
  readonly gustAmplitude: number;
  readonly gustDirection: Vector3Like;
  readonly gustFrequency: number;
  readonly gustSpeed: number;

  constructor(options: WindModuleOptions) {
    this.direction = { ...options.direction };
    this.strength = options.strength ?? 1;
    this.gustAmplitude = options.gustAmplitude ?? 0;
    this.gustDirection = { ...(options.gustDirection ?? { x: 1, y: 0, z: 0 }) };
    this.gustFrequency = options.gustFrequency ?? 0.5;
    this.gustSpeed = options.gustSpeed ?? 0.8;
    if (!Number.isFinite(this.strength) || !Number.isFinite(this.gustAmplitude) ||
        !Number.isFinite(this.gustFrequency) || !Number.isFinite(this.gustSpeed)) {
      throw new RangeError("WindModule strength and gust parameters must be finite numbers.");
    }
    if (this.gustAmplitude < 0) {
      throw new RangeError("WindModule gustAmplitude must be non-negative.");
    }
  }

  update(particle: Particle, context: ParticleUpdateContext): void {
    const alongWind =
      particle.position.x * this.gustDirection.x +
      particle.position.y * this.gustDirection.y +
      particle.position.z * this.gustDirection.z;
    const gust = 1 + this.gustAmplitude * Math.sin(
      alongWind * this.gustFrequency + context.elapsedTime * this.gustSpeed,
    );
    particle.velocity.x += this.direction.x * this.strength * gust * context.deltaTime;
    particle.velocity.y += this.direction.y * this.strength * gust * context.deltaTime;
    particle.velocity.z += this.direction.z * this.strength * gust * context.deltaTime;
  }

  toGPUWind(): GPUWindParams {
    return {
      direction: { ...this.direction },
      strength: this.strength,
      gustAmplitude: this.gustAmplitude,
      gustDirection: { ...this.gustDirection },
      gustFrequency: this.gustFrequency,
      gustSpeed: this.gustSpeed,
    };
  }
}
