import type { ColorLike, Particle, Vector3Like } from "./Particle.js";
import type { ParticleSystem } from "./ParticleSystem.js";

export interface ParticleSprite {
  id: number;
  position: Vector3Like;
  color: ColorLike;
  size: number;
  rotation: number;
  /** Soft-particle depth fade (1 = fully visible). Always 1 unless softParticles is enabled. */
  fade: number;
}

export interface ParticleBatchBounds {
  min: Vector3Like;
  max: Vector3Like;
}

export interface ParticleRenderBatch {
  sprites: ParticleSprite[];
  liveCount: number;
  uploadedBytes: number;
  bounds: ParticleBatchBounds | null;
}

export interface ParticleDrawTarget {
  drawParticles(batch: ParticleRenderBatch): void;
}

export type ParticleSortMode = "none" | "front-to-back" | "back-to-front";

export interface SoftParticleOptions {
  readonly enabled: boolean;
  /** Depth range over which a particle dissolves into the scene. Must be > 0 when enabled. */
  readonly fadeDistance: number;
  /** Linear scene depth at the sprite position (same units as particleDepthAt). */
  readonly sceneDepthAt: (position: Vector3Like) => number;
  /** Linear depth of the sprite itself. */
  readonly particleDepthAt: (position: Vector3Like) => number;
}

/**
 * Soft-particle depth fade: 0 when the particle is behind the scene surface,
 * ramping to 1 one fadeDistance in front of it. Pure and shared so the probe
 * can show the exact on/off delta the renderer applies.
 */
export function computeSoftParticleFade(sceneDepth: number, particleDepth: number, fadeDistance: number): number {
  if (!Number.isFinite(sceneDepth) || !Number.isFinite(particleDepth) || !Number.isFinite(fadeDistance)) {
    throw new RangeError("Soft-particle fade inputs must be finite numbers.");
  }
  if (fadeDistance <= 0) {
    throw new RangeError("Soft-particle fadeDistance must be positive.");
  }
  const t = (sceneDepth - particleDepth) / fadeDistance;
  return Math.min(1, Math.max(0, t));
}

/** WGSL snippet consumers can drop into their own particle render shaders. */
export const SOFT_PARTICLE_WGSL = `
fn auraSoftParticleFade(sceneDepth: f32, particleDepth: f32, fadeDistance: f32) -> f32 {
  return clamp((sceneDepth - particleDepth) / max(fadeDistance, 1e-6), 0.0, 1.0);
}
`;

export interface ParticleRenderOptions {
  readonly sort?: ParticleSortMode;
  readonly cameraPosition?: Vector3Like;
  readonly softParticles?: SoftParticleOptions;
}

export class ParticleRenderer {
  private lastBatch: ParticleRenderBatch = {
    sprites: [],
    liveCount: 0,
    uploadedBytes: 0,
    bounds: null,
  };

  buildBatch(particles: readonly Particle[], options: ParticleRenderOptions = {}): ParticleRenderBatch {
    const soft = options.softParticles;
    if (soft?.enabled) {
      validateSoftParticles(soft);
    }
    const sprites = particles
      .filter((particle) => particle.alive)
      .map((particle) => {
        let fade = 1;
        let alpha = particle.color.a;
        if (soft?.enabled) {
          const sceneDepth = soft.sceneDepthAt(particle.position);
          const particleDepth = soft.particleDepthAt(particle.position);
          if (!Number.isFinite(particleDepth)) {
            throw new RangeError("ParticleRenderer softParticles particleDepthAt must return a finite number.");
          }
          // Non-finite scene depth = the view ray hits no occluder: no attenuation.
          fade = Number.isFinite(sceneDepth)
            ? computeSoftParticleFade(sceneDepth, particleDepth, soft.fadeDistance)
            : 1;
          alpha = particle.color.a * fade;
        }
        return {
          id: particle.id,
          position: { ...particle.position },
          color: { ...particle.color, a: alpha },
          size: particle.size,
          rotation: particle.rotation,
          fade,
        };
      });
    sortSprites(sprites, options);

    this.lastBatch = {
      sprites,
      liveCount: sprites.length,
      uploadedBytes: sprites.length * (3 + 4 + 1 + 1) * Float32Array.BYTES_PER_ELEMENT,
      bounds: computeBounds(sprites),
    };

    return this.lastBatch;
  }

  render(system: ParticleSystem, target: ParticleDrawTarget, options: ParticleRenderOptions = {}): ParticleRenderBatch {
    const batch = this.buildBatch(system.particles, options);
    target.drawParticles(batch);
    system.recordBufferUpload(batch.uploadedBytes);
    return batch;
  }

  getLastBatch(): ParticleRenderBatch {
    return {
      sprites: this.lastBatch.sprites.map((sprite) => ({
        ...sprite,
        position: { ...sprite.position },
        color: { ...sprite.color },
      })),
      liveCount: this.lastBatch.liveCount,
      uploadedBytes: this.lastBatch.uploadedBytes,
      bounds: this.lastBatch.bounds ? {
        min: { ...this.lastBatch.bounds.min },
        max: { ...this.lastBatch.bounds.max },
      } : null,
    };
  }
}

function sortSprites(sprites: ParticleSprite[], options: ParticleRenderOptions): void {
  const mode = options.sort ?? "none";
  if (mode === "none") return;
  const camera = options.cameraPosition;
  if (!camera || !isFiniteVector(camera)) {
    throw new RangeError("ParticleRenderer cameraPosition must be finite when depth sorting is enabled.");
  }
  const direction = mode === "back-to-front" ? -1 : 1;
  sprites.sort((a, b) => {
    const distanceDelta = distanceSquared(a.position, camera) - distanceSquared(b.position, camera);
    if (Math.abs(distanceDelta) > 1e-9) return distanceDelta * direction;
    return a.id - b.id;
  });
}

function computeBounds(sprites: readonly ParticleSprite[]): ParticleBatchBounds | null {
  if (sprites.length === 0) return null;
  const min = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY };
  const max = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY, z: Number.NEGATIVE_INFINITY };
  for (const sprite of sprites) {
    if (!isFiniteVector(sprite.position) || !Number.isFinite(sprite.size) || sprite.size < 0) {
      throw new RangeError("ParticleRenderer sprites require finite positions and non-negative finite sizes.");
    }
    const radius = sprite.size * 0.5;
    min.x = Math.min(min.x, sprite.position.x - radius);
    min.y = Math.min(min.y, sprite.position.y - radius);
    min.z = Math.min(min.z, sprite.position.z - radius);
    max.x = Math.max(max.x, sprite.position.x + radius);
    max.y = Math.max(max.y, sprite.position.y + radius);
    max.z = Math.max(max.z, sprite.position.z + radius);
  }
  return { min, max };
}

function validateSoftParticles(soft: SoftParticleOptions): void {
  if (!Number.isFinite(soft.fadeDistance) || soft.fadeDistance <= 0) {
    throw new RangeError("ParticleRenderer softParticles fadeDistance must be a finite positive number.");
  }
  if (typeof soft.sceneDepthAt !== "function" || typeof soft.particleDepthAt !== "function") {
    throw new RangeError("ParticleRenderer softParticles requires sceneDepthAt and particleDepthAt functions.");
  }
}

function distanceSquared(a: Vector3Like, b: Vector3Like): number {
  const x = a.x - b.x;
  const y = a.y - b.y;
  const z = a.z - b.z;
  return x * x + y * y + z * z;
}

function isFiniteVector(value: Vector3Like): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}
