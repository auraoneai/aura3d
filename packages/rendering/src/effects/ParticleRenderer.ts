import type { ColorLike, Particle, Vector3Like } from "./Particle.js";
import type { ParticleSystem } from "./ParticleSystem.js";

export interface ParticleSprite {
  id: number;
  position: Vector3Like;
  color: ColorLike;
  size: number;
  rotation: number;
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

export interface ParticleRenderOptions {
  readonly sort?: ParticleSortMode;
  readonly cameraPosition?: Vector3Like;
}

export class ParticleRenderer {
  private lastBatch: ParticleRenderBatch = {
    sprites: [],
    liveCount: 0,
    uploadedBytes: 0,
    bounds: null,
  };

  buildBatch(particles: readonly Particle[], options: ParticleRenderOptions = {}): ParticleRenderBatch {
    const sprites = particles
      .filter((particle) => particle.alive)
      .map((particle) => ({
        id: particle.id,
        position: { ...particle.position },
        color: { ...particle.color },
        size: particle.size,
        rotation: particle.rotation,
      }));
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

function distanceSquared(a: Vector3Like, b: Vector3Like): number {
  const x = a.x - b.x;
  const y = a.y - b.y;
  const z = a.z - b.z;
  return x * x + y * y + z * z;
}

function isFiniteVector(value: Vector3Like): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}
