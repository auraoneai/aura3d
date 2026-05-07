import {
  addScaledVector3,
  normalizedParticleAge,
  setVector3,
  type Particle,
} from "./Particle.js";
import { ParticleEmitter } from "./ParticleEmitter.js";
import type { GPUParticleBackend } from "./GPUParticleBackend.js";
import { applyParticleModules, type ParticleModule, type ParticleUpdateContext } from "./ParticleModule.js";

export interface ParticleSystemStats {
  liveCount: number;
  capacity: number;
  spawnedCount: number;
  killedCount: number;
  droppedCount: number;
  bufferUploads: number;
  uploadedBytes: number;
  gpuSpawns: number;
  gpuUpdates: number;
}

export interface ParticleSystemOptions {
  maxParticles?: number;
  emitters?: readonly ParticleEmitter[];
  modules?: readonly ParticleModule[];
  gpuBackend?: GPUParticleBackend;
  preferGPU?: boolean;
}

export class ParticleSystem {
  readonly particles: Particle[] = [];
  readonly emitters: ParticleEmitter[] = [];
  readonly modules: ParticleModule[] = [];
  readonly maxParticles: number;

  elapsedTime = 0;
  paused = false;

  private stats: ParticleSystemStats;
  private gpuBackend?: GPUParticleBackend;
  private preferGPU: boolean;

  constructor(options: ParticleSystemOptions = {}) {
    this.maxParticles = options.maxParticles ?? 1000;
    if (!Number.isInteger(this.maxParticles) || this.maxParticles <= 0) {
      throw new RangeError("ParticleSystem maxParticles must be a positive integer.");
    }

    this.emitters.push(...(options.emitters ?? []));
    this.modules.push(...(options.modules ?? []));
    this.gpuBackend = options.gpuBackend;
    this.preferGPU = options.preferGPU ?? options.gpuBackend !== undefined;
    this.stats = {
      liveCount: 0,
      capacity: this.maxParticles,
      spawnedCount: 0,
      killedCount: 0,
      droppedCount: 0,
      bufferUploads: 0,
      uploadedBytes: 0,
      gpuSpawns: 0,
      gpuUpdates: 0,
    };
  }

  addEmitter(emitter: ParticleEmitter): this {
    this.emitters.push(emitter);
    return this;
  }

  addModule(module: ParticleModule): this {
    this.modules.push(module);
    return this;
  }

  setGPUBackend(backend: GPUParticleBackend | undefined, preferGPU = backend !== undefined): this {
    this.gpuBackend = backend;
    this.preferGPU = preferGPU;
    return this;
  }

  clear(): void {
    this.stats.killedCount += this.particles.length;
    this.particles.length = 0;
    this.stats.liveCount = 0;
  }

  dispose(): void {
    this.clear();
    this.emitters.length = 0;
    this.modules.length = 0;
    this.paused = true;
  }

  update(deltaTime: number): void {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) {
      throw new RangeError("ParticleSystem.update deltaTime must be a finite non-negative number.");
    }

    if (this.paused || deltaTime === 0) {
      return;
    }

    this.spawn(deltaTime);
    this.integrate(deltaTime);
    this.compactDeadParticles();
    this.elapsedTime += deltaTime;
    this.stats.liveCount = this.particles.length;
  }

  async updateOnGPU(deltaTime: number, backend: GPUParticleBackend): Promise<void> {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) {
      throw new RangeError("ParticleSystem.updateOnGPU deltaTime must be a finite non-negative number.");
    }

    if (this.paused || deltaTime === 0) {
      return;
    }

    const spawnedParticles = this.spawn(deltaTime);
    await this.initializeSpawnedOnGPU(spawnedParticles, backend);
    await this.integrateOnGPU(deltaTime, backend);
    this.compactDeadParticles();
    this.elapsedTime += deltaTime;
    this.stats.liveCount = this.particles.length;
  }

  async updateBest(deltaTime: number): Promise<"gpu" | "cpu"> {
    if (this.preferGPU && this.gpuBackend?.capabilities.supported) {
      await this.updateOnGPU(deltaTime, this.gpuBackend);
      return "gpu";
    }

    this.update(deltaTime);
    return "cpu";
  }

  getStats(): ParticleSystemStats {
    return { ...this.stats, liveCount: this.particles.length };
  }

  recordBufferUpload(bytes: number): void {
    if (!Number.isFinite(bytes) || bytes < 0) {
      throw new RangeError("ParticleSystem buffer upload bytes must be a finite non-negative number.");
    }

    this.stats.bufferUploads += 1;
    this.stats.uploadedBytes += bytes;
  }

  private spawn(deltaTime: number): Particle[] {
    const spawnedParticles: Particle[] = [];
    for (const emitter of this.emitters) {
      const capacity = this.maxParticles - this.particles.length;
      const result = emitter.emit(deltaTime, capacity);

      this.stats.droppedCount += Math.max(0, result.requested - result.emitted);
      this.stats.spawnedCount += result.emitted;

      for (const particle of result.particles) {
        const context = this.createContext(deltaTime, particle);
        applyParticleModules(this.modules, "onSpawn", particle, context);
        this.particles.push(particle);
        spawnedParticles.push(particle);
      }
    }
    return spawnedParticles;
  }

  private async initializeSpawnedOnGPU(spawnedParticles: readonly Particle[], backend: GPUParticleBackend): Promise<void> {
    if (!backend.spawn || spawnedParticles.length === 0) {
      return;
    }

    const positions = new Float32Array(spawnedParticles.length * 4);
    const velocities = new Float32Array(spawnedParticles.length * 4);
    const accelerations = new Float32Array(spawnedParticles.length * 4);

    for (let index = 0; index < spawnedParticles.length; index += 1) {
      const particle = spawnedParticles[index]!;
      const offset = index * 4;
      positions[offset] = particle.position.x;
      positions[offset + 1] = particle.position.y;
      positions[offset + 2] = particle.position.z;
      positions[offset + 3] = particle.age;
      velocities[offset] = particle.velocity.x;
      velocities[offset + 1] = particle.velocity.y;
      velocities[offset + 2] = particle.velocity.z;
      accelerations[offset] = particle.acceleration.x;
      accelerations[offset + 1] = particle.acceleration.y;
      accelerations[offset + 2] = particle.acceleration.z;
    }

    const result = await backend.spawn({
      positions,
      velocities,
      accelerations,
      count: spawnedParticles.length,
    });

    for (let index = 0; index < spawnedParticles.length; index += 1) {
      const particle = spawnedParticles[index]!;
      const offset = index * 4;
      particle.position.x = result.positions[offset];
      particle.position.y = result.positions[offset + 1];
      particle.position.z = result.positions[offset + 2];
      particle.age = result.positions[offset + 3];
      setVector3(particle.previousPosition, particle.position);
      particle.velocity.x = result.velocities[offset];
      particle.velocity.y = result.velocities[offset + 1];
      particle.velocity.z = result.velocities[offset + 2];
      particle.acceleration.x = result.accelerations[offset];
      particle.acceleration.y = result.accelerations[offset + 1];
      particle.acceleration.z = result.accelerations[offset + 2];
    }

    this.stats.gpuSpawns += 1;
    this.recordBufferUpload(positions.byteLength + velocities.byteLength + accelerations.byteLength + 16);
  }

  private integrate(deltaTime: number): void {
    for (const particle of this.particles) {
      if (!particle.alive) {
        continue;
      }

      const context = this.createContext(deltaTime, particle);
      applyParticleModules(this.modules, "update", particle, context);

      setVector3(particle.previousPosition, particle.position);
      addScaledVector3(particle.velocity, particle.acceleration, deltaTime);
      addScaledVector3(particle.position, particle.velocity, deltaTime);
      particle.rotation += particle.angularVelocity * deltaTime;
      particle.age += deltaTime;

      applyParticleModules(this.modules, "afterIntegrate", particle, this.createContext(deltaTime, particle));

      if (particle.age >= particle.lifetime) {
        particle.alive = false;
      }
    }
  }

  private async integrateOnGPU(deltaTime: number, backend: GPUParticleBackend): Promise<void> {
    const liveParticles = this.particles.filter((particle) => particle.alive);
    if (liveParticles.length === 0) {
      return;
    }

    for (const particle of liveParticles) {
      const context = this.createContext(deltaTime, particle);
      applyParticleModules(this.modules, "update", particle, context);
      setVector3(particle.previousPosition, particle.position);
    }

    const positions = new Float32Array(liveParticles.length * 4);
    const velocities = new Float32Array(liveParticles.length * 4);
    const accelerations = new Float32Array(liveParticles.length * 4);

    for (let index = 0; index < liveParticles.length; index += 1) {
      const particle = liveParticles[index];
      const offset = index * 4;
      positions[offset] = particle.position.x;
      positions[offset + 1] = particle.position.y;
      positions[offset + 2] = particle.position.z;
      positions[offset + 3] = particle.age;
      velocities[offset] = particle.velocity.x;
      velocities[offset + 1] = particle.velocity.y;
      velocities[offset + 2] = particle.velocity.z;
      accelerations[offset] = particle.acceleration.x;
      accelerations[offset + 1] = particle.acceleration.y;
      accelerations[offset + 2] = particle.acceleration.z;
    }

    const result = await backend.update({
      positions,
      velocities,
      accelerations,
      deltaTime,
      count: liveParticles.length,
    });

    for (let index = 0; index < liveParticles.length; index += 1) {
      const particle = liveParticles[index];
      const offset = index * 4;
      particle.position.x = result.positions[offset];
      particle.position.y = result.positions[offset + 1];
      particle.position.z = result.positions[offset + 2];
      particle.age = result.positions[offset + 3];
      particle.velocity.x = result.velocities[offset];
      particle.velocity.y = result.velocities[offset + 1];
      particle.velocity.z = result.velocities[offset + 2];
      particle.rotation += particle.angularVelocity * deltaTime;

      applyParticleModules(this.modules, "afterIntegrate", particle, this.createContext(deltaTime, particle));

      if (particle.age >= particle.lifetime) {
        particle.alive = false;
      }
    }

    this.stats.gpuUpdates += 1;
    this.recordBufferUpload(positions.byteLength + velocities.byteLength + accelerations.byteLength + 16);
  }

  private compactDeadParticles(): void {
    let write = 0;
    let killed = 0;

    for (let read = 0; read < this.particles.length; read += 1) {
      const particle = this.particles[read];
      if (particle.alive) {
        this.particles[write] = particle;
        write += 1;
      } else {
        killed += 1;
      }
    }

    this.particles.length = write;
    this.stats.killedCount += killed;
  }

  private createContext(deltaTime: number, particle: Particle): ParticleUpdateContext {
    return {
      deltaTime,
      elapsedTime: this.elapsedTime,
      normalizedAge: normalizedParticleAge(particle),
      random: this.emitters[0]?.random ?? Math.random,
    };
  }
}
