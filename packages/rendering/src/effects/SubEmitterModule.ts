import { cloneVector3, type Particle, type Vector3Like } from "./Particle.js";
import { ParticleEmitter } from "./ParticleEmitter.js";
import type { ParticleModule, ParticleUpdateContext } from "./ParticleModule.js";

export type SubEmitterTrigger = "death" | "midlife";

export interface SubEmitterModuleOptions {
  readonly trigger: SubEmitterTrigger;
  /** Probability per trigger event in [0, 1]. Defaults to 1. */
  readonly chance?: number;
  /** Emitter that spawns child particles. */
  readonly childEmitter: ParticleEmitter;
  /** Fraction of the parent velocity inherited by children. Defaults to 0.3. */
  readonly velocityInherit?: number;
  /** Children spawned per trigger event. Defaults to 1. */
  readonly childrenPerEvent?: number;
}

export interface SubEmitterSpawnRequest {
  readonly position: Vector3Like;
  readonly velocity: Vector3Like;
  readonly count: number;
}

export interface GPUSubEmitterParams {
  /** Normalized age that fires the emitter: 0.5 for midlife, 1 for death. */
  readonly triggerAge: number;
  readonly chance: number;
  readonly childCount: number;
}

/**
 * Sub-emitters: particles spawn child particles at midlife or death
 * (explosion sparks, splash droplets, ember bursts).
 *
 * CPU path: afterIntegrate queues spawn requests; the ParticleSystem drains
 * them after integration. GPU path: the compute kernel evaluates the same
 * trigger (normalized-age crossing + hash(chance)) and writes per-particle
 * spawn requests that the system drains through the GPU spawn pipeline.
 */
export class SubEmitterModule implements ParticleModule {
  readonly name = "SubEmitterModule";
  readonly supportsGPU = true;
  readonly trigger: SubEmitterTrigger;
  readonly chance: number;
  readonly childEmitter: ParticleEmitter;
  readonly velocityInherit: number;
  readonly childrenPerEvent: number;
  readonly pendingSpawns: SubEmitterSpawnRequest[] = [];

  constructor(options: SubEmitterModuleOptions) {
    this.trigger = options.trigger;
    this.chance = options.chance ?? 1;
    this.childEmitter = options.childEmitter;
    this.velocityInherit = options.velocityInherit ?? 0.3;
    this.childrenPerEvent = options.childrenPerEvent ?? 1;
    if (!Number.isFinite(this.chance) || this.chance < 0 || this.chance > 1) {
      throw new RangeError("SubEmitterModule chance must be a number in [0, 1].");
    }
    if (!Number.isFinite(this.velocityInherit)) {
      throw new RangeError("SubEmitterModule velocityInherit must be finite.");
    }
    if (!Number.isInteger(this.childrenPerEvent) || this.childrenPerEvent <= 0) {
      throw new RangeError("SubEmitterModule childrenPerEvent must be a positive integer.");
    }
  }

  afterIntegrate(particle: Particle, context: ParticleUpdateContext): void {
    if (this.trigger === "midlife") {
      if (particle.userData.subEmitted === true) {
        return;
      }
      if (context.normalizedAge < 0.5) {
        return;
      }
      particle.userData.subEmitted = true;
    } else {
      if (particle.userData.subDeathEmitted === true) {
        return;
      }
      if (context.normalizedAge < 1 && particle.alive) {
        return;
      }
      particle.userData.subDeathEmitted = true;
    }

    if (context.random() < this.chance) {
      this.pendingSpawns.push({
        position: cloneVector3(particle.position),
        velocity: cloneVector3(particle.velocity),
        count: this.childrenPerEvent,
      });
    }
  }

  /** Create child particles for queued requests, bounded by capacity. Returns { children, dropped }. */
  drainPendingSpawns(capacity: number): { children: Particle[]; dropped: number } {
    const children: Particle[] = [];
    let dropped = 0;
    while (this.pendingSpawns.length > 0) {
      const request = this.pendingSpawns.shift()!;
      for (let index = 0; index < request.count; index += 1) {
        if (children.length >= capacity) {
          dropped += 1;
          continue;
        }
        children.push(this.createChild(request));
      }
    }
    return { children, dropped };
  }

  /** Create child particles for GPU spawn-request flags (parallel to drainPendingSpawns). */
  createChildren(requests: readonly SubEmitterSpawnRequest[], capacity: number): { children: Particle[]; dropped: number } {
    const children: Particle[] = [];
    let dropped = 0;
    for (const request of requests) {
      for (let index = 0; index < request.count; index += 1) {
        if (children.length >= capacity) {
          dropped += 1;
          continue;
        }
        children.push(this.createChild(request));
      }
    }
    return { children, dropped };
  }

  clearPendingSpawns(): void {
    this.pendingSpawns.length = 0;
  }

  toGPUSubEmitter(): GPUSubEmitterParams {
    return {
      triggerAge: this.trigger === "midlife" ? 0.5 : 1,
      chance: this.chance,
      childCount: this.childrenPerEvent,
    };
  }

  private createChild(request: SubEmitterSpawnRequest): Particle {
    const child = this.childEmitter.createParticle();
    child.position.x = request.position.x;
    child.position.y = request.position.y;
    child.position.z = request.position.z;
    child.previousPosition.x = request.position.x;
    child.previousPosition.y = request.position.y;
    child.previousPosition.z = request.position.z;
    child.velocity.x += request.velocity.x * this.velocityInherit;
    child.velocity.y += request.velocity.y * this.velocityInherit;
    child.velocity.z += request.velocity.z * this.velocityInherit;
    return child;
  }
}
