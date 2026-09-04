import { type ColorLike } from "./Particle.js";
import type { ParticleModule, ParticleUpdateContext } from "./ParticleModule.js";
import type { Particle, Vector3Like } from "./Particle.js";

export interface ParticleLightingOptions {
  /** Environment ambient multiplier per channel (IBL-style fill). */
  readonly ambient: readonly [number, number, number];
  /** Key-light direction in world space (points from the surface toward the light). */
  readonly keyDirection: Vector3Like;
  /** Diffuse gain for the velocity-normal facing term. */
  readonly diffuseStrength?: number;
}

export interface GPUParticleLightingParams {
  readonly ambient: readonly [number, number, number];
  readonly keyDirection: Vector3Like;
  readonly diffuseStrength: number;
}

/**
 * Lit particles: the shading normal comes from the particle velocity
 * (motion-aligned lighting, stable for sparks/rain/embers) plus an
 * environment ambient term. Pure function shared by the CPU fallback and
 * documented for the WGSL kernel, which implements the same steps.
 */
export function computeLitParticleColor(
  base: ColorLike,
  velocity: Vector3Like,
  options: ParticleLightingOptions,
): ColorLike {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  const normal =
    speed > 1e-4
      ? { x: velocity.x / speed, y: velocity.y / speed, z: velocity.z / speed }
      : { x: 0, y: 1, z: 0 };
  const keyLength = Math.hypot(options.keyDirection.x, options.keyDirection.y, options.keyDirection.z);
  if (keyLength === 0) {
    throw new RangeError("Particle lighting keyDirection cannot be zero length.");
  }
  const facing = Math.max(
    0,
    (normal.x * options.keyDirection.x + normal.y * options.keyDirection.y + normal.z * options.keyDirection.z) / keyLength,
  );
  const diffuse = options.diffuseStrength ?? 0.85;
  return {
    r: base.r * (options.ambient[0] + diffuse * facing),
    g: base.g * (options.ambient[1] + diffuse * facing),
    b: base.b * (options.ambient[2] + diffuse * facing),
    a: base.a,
  };
}

export class LightingModule implements ParticleModule {
  readonly name = "LightingModule";
  readonly supportsGPU = true;
  readonly ambient: readonly [number, number, number];
  readonly keyDirection: Vector3Like;
  readonly diffuseStrength: number;

  constructor(options: ParticleLightingOptions) {
    if (options.ambient.length !== 3 || !options.ambient.every(Number.isFinite)) {
      throw new RangeError("LightingModule ambient must be three finite numbers.");
    }
    this.ambient = [options.ambient[0]!, options.ambient[1]!, options.ambient[2]!];
    this.keyDirection = { ...options.keyDirection };
    this.diffuseStrength = options.diffuseStrength ?? 0.85;
    if (!Number.isFinite(this.diffuseStrength) || this.diffuseStrength < 0) {
      throw new RangeError("LightingModule diffuseStrength must be a finite non-negative number.");
    }
  }

  update(particle: Particle, _context: ParticleUpdateContext): void {
    particle.color = computeLitParticleColor(particle.color, particle.velocity, this);
  }

  toGPULighting(): GPUParticleLightingParams {
    return {
      ambient: this.ambient,
      keyDirection: { ...this.keyDirection },
      diffuseStrength: this.diffuseStrength,
    };
  }
}
