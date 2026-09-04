import {
  addScaledVector3,
  normalizedParticleAge,
  setVector3,
  type Particle,
} from "./Particle.js";
import { ParticleEmitter } from "./ParticleEmitter.js";
import {
  GPU_PARTICLE_CURVE_STOPS,
  type GPUParticleBackend,
  type GPUParticleEffectsInput,
  type GPUParticlePlaneEffect,
  type GPUParticleSubEmitterEffect,
} from "./GPUParticleBackend.js";
import { applyParticleModules, type ParticleModule, type ParticleUpdateContext } from "./ParticleModule.js";
import { CollisionModule } from "./CollisionModule.js";
import { encodeColorGradientLUT, ColorModule } from "./ColorModule.js";
import { encodeSizeCurveLUT, SizeModule } from "./SizeModule.js";
import { WindModule } from "./ForceModule.js";
import { TurbulenceModule } from "./TurbulenceModule.js";
import { HeightfieldModule } from "./HeightfieldModule.js";
import { LightingModule } from "./LightingModule.js";
import { SubEmitterModule } from "./SubEmitterModule.js";
import { decodeTrailRingBuffer, TrailModule } from "./TrailModule.js";

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
  /** True once any spawn request (emitter or sub-emitter) exceeded capacity. Never a silent clamp. */
  overBudget: boolean;
}

export interface CollectedGPUParticleEffects {
  readonly effects: GPUParticleEffectsInput;
  /**
   * Modules whose per-frame hooks the compute kernel implements. The system
   * skips their CPU update/afterIntegrate hooks on the GPU path (zero CPU
   * per-particle work); every other module keeps its CPU hooks on both paths.
   */
  readonly gpuCovered: ReadonlySet<ParticleModule>;
}

/**
 * Aggregate GPU-capable modules into one compute effects descriptor.
 * Returns undefined when no module has a GPU implementation (legacy path).
 * Overflow policy: the first N instances of a capped effect (3 planes,
 * 2 sub-emitters) run on GPU; extras keep their exact CPU hooks.
 */
export function collectGPUParticleEffects(
  modules: readonly ParticleModule[],
): CollectedGPUParticleEffects | undefined {
  const covered = new Set<ParticleModule>();
  let wind: GPUParticleEffectsInput["wind"];
  let turbulence: GPUParticleEffectsInput["turbulence"];
  let heightfield: GPUParticleEffectsInput["heightfield"];
  let lighting: GPUParticleEffectsInput["lighting"];
  let lifeCurves: GPUParticleEffectsInput["lifeCurves"];
  let trailPointsPerParticle: number | undefined;
  const planes: GPUParticlePlaneEffect[] = [];
  const subEmitters: GPUParticleSubEmitterEffect[] = [];
  let colorModule: ColorModule | undefined;
  let sizeModule: SizeModule | undefined;

  for (const module of modules) {
    if (module instanceof WindModule && !wind) {
      const encoded = module.toGPUWind();
      wind = {
        direction: encoded.direction,
        strength: encoded.strength,
        gustAmplitude: encoded.gustAmplitude,
        gustDirection: encoded.gustDirection,
        gustFrequency: encoded.gustFrequency,
        gustSpeed: encoded.gustSpeed,
      };
      covered.add(module);
    } else if (module instanceof TurbulenceModule && !turbulence) {
      const encoded = module.toGPUTurbulence();
      turbulence = {
        strength: encoded.strength,
        scale: encoded.scale,
        flowSpeed: encoded.flowSpeed,
        lut: module.getLUT(),
        lutResolution: encoded.lutResolution,
      };
      covered.add(module);
    } else if (module instanceof CollisionModule && planes.length < 3) {
      const encoded = module.toGPUPlane();
      planes.push({
        normal: encoded.normal,
        constant: encoded.constant,
        restitution: encoded.restitution,
        killOnContact: encoded.killOnContact,
      });
      covered.add(module);
    } else if (module instanceof HeightfieldModule && !heightfield) {
      const encoded = module.toGPUHeightfield();
      heightfield = {
        originX: encoded.originX,
        originZ: encoded.originZ,
        cellSize: encoded.cellSize,
        columns: encoded.columns,
        rows: encoded.rows,
        heights: module.sampler.heights,
        restitution: encoded.restitution,
        killOnContact: encoded.killOnContact,
      };
      covered.add(module);
    } else if (module instanceof ColorModule && !colorModule) {
      colorModule = module;
    } else if (module instanceof SizeModule && !sizeModule) {
      sizeModule = module;
    } else if (module instanceof LightingModule && !lighting) {
      const encoded = module.toGPULighting();
      lighting = {
        ambient: encoded.ambient,
        keyDirection: encoded.keyDirection,
        diffuseStrength: encoded.diffuseStrength,
      };
      covered.add(module);
    } else if (module instanceof SubEmitterModule && subEmitters.length < 2) {
      const encoded = module.toGPUSubEmitter();
      subEmitters.push({
        triggerAge: encoded.triggerAge,
        chance: encoded.chance,
        childCount: encoded.childCount,
      });
      covered.add(module);
    } else if (module instanceof TrailModule && trailPointsPerParticle === undefined) {
      trailPointsPerParticle = Math.min(module.maxPoints, 8);
      covered.add(module);
    }
  }

  if (colorModule || sizeModule) {
    lifeCurves = {
      stops: GPU_PARTICLE_CURVE_STOPS,
      ...(colorModule ? { colors: encodeColorGradientLUT(colorModule.gradient, GPU_PARTICLE_CURVE_STOPS) } : {}),
      ...(sizeModule ? { sizes: encodeSizeCurveLUT(sizeModule.curve, GPU_PARTICLE_CURVE_STOPS) } : {}),
    };
    if (colorModule) covered.add(colorModule);
    if (sizeModule) covered.add(sizeModule);
  }

  if (covered.size === 0) {
    return undefined;
  }

  return {
    effects: {
      wind,
      turbulence,
      planes,
      heightfield,
      subEmitters,
      lifeCurves,
      lighting,
      trailPointsPerParticle,
    },
    gpuCovered: covered,
  };
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
  private lastSpawnRequests: number[] = [];
  private lastIntegratedParticles: Particle[] = [];
  private lastEffectsCovered: ReadonlySet<ParticleModule> | undefined;
  /** GPU trail ring rows by particle id, fed back so history accumulates across calls. */
  private trailRingById = new Map<number, Float32Array>();

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
      overBudget: false,
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
    this.trailRingById.clear();
    this.lastSpawnRequests = [];
    this.lastIntegratedParticles = [];
    this.lastEffectsCovered = undefined;
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
    this.drainSubEmitterSpawns();
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
    await this.drainSubEmitterSpawnsOnGPU(backend);
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

      const dropped = Math.max(0, result.requested - result.emitted);
      this.stats.droppedCount += dropped;
      if (dropped > 0) {
        this.stats.overBudget = true;
      }
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

    const collected = collectGPUParticleEffects(this.modules);
    const useEffects = collected !== undefined && backend.supportsEffects === true;
    const covered = useEffects ? collected.gpuCovered : undefined;

    for (const particle of liveParticles) {
      const context = this.createContext(deltaTime, particle);
      for (const module of this.modules) {
        if (covered?.has(module)) {
          continue;
        }
        module.update?.(particle, context);
      }
      setVector3(particle.previousPosition, particle.position);
    }

    const positions = new Float32Array(liveParticles.length * 4);
    const velocities = new Float32Array(liveParticles.length * 4);
    const accelerations = new Float32Array(liveParticles.length * 4);
    const needsBaseAttributes = Boolean(useEffects && (collected.effects.lifeCurves || collected.effects.lighting));
    const baseAttributes = needsBaseAttributes ? new Float32Array(liveParticles.length * 8) : undefined;
    const trailDepth = useEffects ? (collected.effects.trailPointsPerParticle ?? 0) : 0;
    const trailHistory = trailDepth > 0 ? this.assembleTrailHistory(liveParticles, trailDepth) : undefined;

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
      // velocities.w carries per-particle lifetime for the effects kernel.
      velocities[offset + 3] = useEffects ? particle.lifetime : 0;
      accelerations[offset] = particle.acceleration.x;
      accelerations[offset + 1] = particle.acceleration.y;
      accelerations[offset + 2] = particle.acceleration.z;
      if (baseAttributes) {
        const attributeOffset = index * 8;
        baseAttributes[attributeOffset] = particle.color.r;
        baseAttributes[attributeOffset + 1] = particle.color.g;
        baseAttributes[attributeOffset + 2] = particle.color.b;
        baseAttributes[attributeOffset + 3] = particle.color.a;
        baseAttributes[attributeOffset + 4] = particle.size;
      }
    }

    const result = await backend.update({
      positions,
      velocities,
      accelerations,
      deltaTime,
      count: liveParticles.length,
      ...(useEffects
        ? {
            effects: {
              ...collected.effects,
              time: this.elapsedTime,
            },
            baseAttributes,
            trailHistory,
          }
        : {}),
    });

    if (useEffects) {
      this.lastSpawnRequests = result.spawnRequests ? Array.from(result.spawnRequests) : [];
      this.lastIntegratedParticles = liveParticles;
      this.lastEffectsCovered = covered;
    } else {
      this.lastSpawnRequests = [];
      this.lastIntegratedParticles = [];
      this.lastEffectsCovered = undefined;
    }

    for (let index = 0; index < liveParticles.length; index += 1) {
      const particle = liveParticles[index];
      const offset = index * 4;
      particle.position.x = result.positions[offset];
      particle.position.y = result.positions[offset + 1];
      particle.position.z = result.positions[offset + 2];
      const rawAge = result.positions[offset + 3];
      if (useEffects && (!Number.isFinite(rawAge) || rawAge < 0)) {
        // Compute-side kill (analytic plane or heightfield in kill mode).
        particle.alive = false;
        particle.age = particle.lifetime;
        continue;
      }
      particle.age = rawAge;
      particle.velocity.x = result.velocities[offset];
      particle.velocity.y = result.velocities[offset + 1];
      particle.velocity.z = result.velocities[offset + 2];
      if (result.attributes) {
        const attributeOffset = index * 8;
        particle.color.r = result.attributes[attributeOffset] ?? particle.color.r;
        particle.color.g = result.attributes[attributeOffset + 1] ?? particle.color.g;
        particle.color.b = result.attributes[attributeOffset + 2] ?? particle.color.b;
        particle.color.a = result.attributes[attributeOffset + 3] ?? particle.color.a;
        particle.size = result.attributes[attributeOffset + 4] ?? particle.size;
      }
      particle.rotation += particle.angularVelocity * deltaTime;

      const context = this.createContext(deltaTime, particle);
      for (const module of this.modules) {
        if (covered?.has(module)) {
          continue;
        }
        module.afterIntegrate?.(particle, context);
      }

      if (particle.age >= particle.lifetime) {
        particle.alive = false;
      }
    }

    if (useEffects && result.trailPositions) {
      this.applyGPUTrailHistories(liveParticles, collected.effects, result.trailPositions);
      this.storeTrailRings(liveParticles, collected.effects, result.trailPositions);
    }

    this.stats.gpuUpdates += 1;
    this.recordBufferUpload(positions.byteLength + velocities.byteLength + accelerations.byteLength + 16);
  }

  /**
   * Assemble the previous trail ring in live-particle order from per-id rows
   * so compute history survives spawn/death reordering. Unknown ids start
   * fresh (head = live position/age, older slots expired).
   */
  private assembleTrailHistory(liveParticles: Particle[], depth: number): Float32Array {
    const history = new Float32Array(liveParticles.length * depth * 4);
    for (let index = 0; index < liveParticles.length; index += 1) {
      const particle = liveParticles[index]!;
      const target = index * depth * 4;
      const row = this.trailRingById.get(particle.id);
      if (row && row.length >= depth * 4) {
        history.set(row.subarray(0, depth * 4), target);
        continue;
      }
      history[target] = particle.position.x;
      history[target + 1] = particle.position.y;
      history[target + 2] = particle.position.z;
      history[target + 3] = particle.age;
      for (let slot = 1; slot < depth; slot += 1) {
        const slotOffset = target + slot * 4;
        history[slotOffset] = particle.position.x;
        history[slotOffset + 1] = particle.position.y;
        history[slotOffset + 2] = particle.position.z;
        history[slotOffset + 3] = Number.POSITIVE_INFINITY;
      }
    }
    return history;
  }

  private storeTrailRings(
    liveParticles: Particle[],
    effects: GPUParticleEffectsInput,
    trailPositions: Float32Array,
  ): void {
    const depth = effects.trailPointsPerParticle ?? 1;
    for (let index = 0; index < liveParticles.length; index += 1) {
      const particle = liveParticles[index];
      if (!particle) {
        continue;
      }
      this.trailRingById.set(
        particle.id,
        trailPositions.slice(index * depth * 4, (index + 1) * depth * 4),
      );
    }
    if (this.trailRingById.size > this.particles.length * 2 + 16) {
      const liveIds = new Set(this.particles.map((particle) => particle.id));
      for (const id of this.trailRingById.keys()) {
        if (!liveIds.has(id)) {
          this.trailRingById.delete(id);
        }
      }
    }
  }

  /** CPU path: turn queued sub-emitter requests into live child particles. */
  private drainSubEmitterSpawns(): void {
    for (const module of this.modules) {
      if (!(module instanceof SubEmitterModule)) {
        continue;
      }
      const capacity = this.maxParticles - this.particles.length;
      const { children, dropped } = module.drainPendingSpawns(capacity);
      this.stats.droppedCount += dropped;
      if (dropped > 0) {
        this.stats.overBudget = true;
      }
      for (const child of children) {
        const context = this.createContext(0, child);
        applyParticleModules(this.modules, "onSpawn", child, context);
        this.particles.push(child);
        this.stats.spawnedCount += 1;
      }
    }
  }

  /**
   * GPU path: covered sub-emitters report per-particle spawn requests from
   * the compute kernel; uncovered ones queue CPU requests as usual. Children
   * initialize through the GPU spawn pipeline when the backend offers one.
   */
  private async drainSubEmitterSpawnsOnGPU(backend: GPUParticleBackend): Promise<void> {
    const spawned: Particle[] = [];
    let slot = 0;
    for (const module of this.modules) {
      if (!(module instanceof SubEmitterModule)) {
        continue;
      }
      const capacity = this.maxParticles - this.particles.length - spawned.length;
      if (this.lastEffectsCovered?.has(module) ?? false) {
        const { children, dropped } = module.createChildren(this.requestsForSubEmitter(slot), capacity);
        slot += 1;
        this.stats.droppedCount += dropped;
        if (dropped > 0) {
          this.stats.overBudget = true;
        }
        spawned.push(...children);
      } else {
        const { children, dropped } = module.drainPendingSpawns(capacity);
        this.stats.droppedCount += dropped;
        if (dropped > 0) {
          this.stats.overBudget = true;
        }
        spawned.push(...children);
      }
    }
    if (spawned.length === 0) {
      return;
    }
    for (const child of spawned) {
      const context = this.createContext(0, child);
      applyParticleModules(this.modules, "onSpawn", child, context);
      this.particles.push(child);
      this.stats.spawnedCount += 1;
    }
    await this.initializeSpawnedOnGPU(spawned, backend);
  }

  /**
   * Decode one covered sub-emitter slot from the packed kernel flags
   * (low 16 bits = slot 0, high 16 bits = slot 1).
   */
  private requestsForSubEmitter(slot: number): { position: Particle["position"]; velocity: Particle["velocity"]; count: number }[] {
    const requests: { position: Particle["position"]; velocity: Particle["velocity"]; count: number }[] = [];
    if (this.lastSpawnRequests.length === 0) {
      return requests;
    }
    for (let index = 0; index < this.lastSpawnRequests.length; index += 1) {
      const flag = this.lastSpawnRequests[index] ?? 0;
      const count = slot === 0 ? flag & 0xffff : flag >>> 16;
      if (count <= 0) {
        continue;
      }
      // Death triggers intentionally reference particles that just died; the
      // kernel only records requests for triggers crossed while alive.
      const particle = this.lastIntegratedParticles[index];
      if (!particle) {
        continue;
      }
      requests.push({
        position: { ...particle.position },
        velocity: { ...particle.velocity },
        count,
      });
    }
    return requests;
  }

  private applyGPUTrailHistories(
    liveParticles: Particle[],
    effects: GPUParticleEffectsInput,
    trailPositions: Float32Array,
  ): void {
    const trailModule = this.modules.find((module) => module instanceof TrailModule);
    if (!(trailModule instanceof TrailModule)) {
      return;
    }
    const depth = effects.trailPointsPerParticle ?? 1;
    const histories = decodeTrailRingBuffer(trailPositions, liveParticles.length, depth, trailModule.lifetime);
    for (let index = 0; index < liveParticles.length; index += 1) {
      const particle = liveParticles[index];
      if (!particle || !particle.alive) {
        continue;
      }
      particle.userData.trail = histories[index] ?? [];
    }
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
