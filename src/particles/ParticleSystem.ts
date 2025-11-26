/**
 * Main particle system manager with module-based architecture.
 * Handles particle lifecycle, pooling, LOD, and module execution.
 * @module ParticleSystem
 */

import { Vector3 } from '../math/Vector3';
import { Color } from '../math/Color';
import { Box3 } from '../math/Box3';
import { ObjectPool } from '../core/ObjectPool';
import { Logger } from '../core/Logger';
import { Particle } from './Particle';
import { ParticleEmitter, EmitterSpace } from './ParticleEmitter';

const logger = Logger.create('ParticleSystem');

/**
 * Particle system module interface.
 * All particle behavior modules must implement this interface.
 */
export interface IParticleModule {
  /** Module name for identification */
  readonly name: string;

  /** Whether this module is enabled */
  enabled: boolean;

  /** Module execution priority (lower = earlier) */
  priority: number;

  /**
   * Initialize particle when emitted.
   * @param particle - Particle to initialize
   * @param system - Parent particle system
   */
  initializeParticle?(particle: Particle, system: ParticleSystem): void;

  /**
   * Update particle each frame.
   * @param particle - Particle to update
   * @param deltaTime - Time step in seconds
   * @param system - Parent particle system
   */
  updateParticle?(particle: Particle, deltaTime: number, system: ParticleSystem): void;

  /**
   * Update module state before particle updates.
   * @param deltaTime - Time step in seconds
   * @param system - Parent particle system
   */
  preUpdate?(deltaTime: number, system: ParticleSystem): void;

  /**
   * Update module state after particle updates.
   * @param deltaTime - Time step in seconds
   * @param system - Parent particle system
   */
  postUpdate?(deltaTime: number, system: ParticleSystem): void;
}

/**
 * LOD quality levels for particle systems.
 */
export enum ParticleLOD {
  /** Highest quality, all particles */
  High = 'High',
  /** Medium quality, reduced count */
  Medium = 'Medium',
  /** Low quality, minimal particles */
  Low = 'Low',
  /** No rendering */
  Off = 'Off',
}

/**
 * Particle system configuration.
 */
export interface ParticleSystemConfig {
  /** Maximum number of particles */
  maxParticles?: number;
  /** Initial particle lifetime (seconds) */
  lifetime?: number;
  /** Lifetime randomness [0-1] */
  lifetimeRandomness?: number;
  /** Initial particle color */
  color?: Color;
  /** Initial particle size */
  size?: number | Vector3;
  /** Size randomness [0-1] */
  sizeRandomness?: number;
  /** Gravity scale multiplier */
  gravityScale?: number;
  /** World space simulation */
  simulateInWorldSpace?: boolean;
  /** LOD quality level */
  lodLevel?: ParticleLOD;
  /** Random seed for reproducibility */
  randomSeed?: number;
  /** Auto-start emission */
  autoStart?: boolean;
  /** Loop emission */
  loop?: boolean;
  /** System duration (0 = infinite) */
  duration?: number;
}

/**
 * Particle system statistics.
 */
export interface ParticleSystemStats {
  /** Total particles alive */
  aliveCount: number;
  /** Total particles in pool */
  pooledCount: number;
  /** Peak particle count */
  peakCount: number;
  /** Total particles emitted */
  totalEmitted: number;
  /** Emission rate (particles/second) */
  emissionRate: number;
  /** Update time (ms) */
  updateTime: number;
}

/**
 * Main particle system.
 *
 * Manages particle lifecycle, emission, simulation, and rendering. Uses a module-based
 * architecture for extensibility. Supports particle pooling, LOD, and performance optimization.
 *
 * Features:
 * - Efficient particle pooling
 * - Module-based behavior system
 * - LOD support for performance scaling
 * - Configurable particle limits
 * - World and local space simulation
 * - Statistics tracking
 * - Auto-start and looping
 *
 * @example
 * ```typescript
 * // Create particle system
 * const system = new ParticleSystem({
 *   maxParticles: 1000,
 *   lifetime: 2.0,
 *   color: new Color(1, 0.5, 0),
 *   size: 0.5,
 *   autoStart: true,
 *   loop: true,
 * });
 *
 * // Configure emitter
 * system.emitter.shape = EmissionShape.Cone;
 * system.emitter.rate = 100;
 *
 * // Add modules
 * system.addModule(new VelocityModule({ speed: 5 }));
 * system.addModule(new ColorModule({ gradient: colorGradient }));
 * system.addModule(new ForceModule({ gravity: -9.8 }));
 *
 * // Update each frame
 * system.update(deltaTime);
 *
 * // Render particles
 * for (const particle of system.particles) {
 *   renderer.drawParticle(particle);
 * }
 * ```
 */
export class ParticleSystem {
  /** Particle emitter */
  readonly emitter: ParticleEmitter;

  /** Particle pool */
  private readonly _pool: ObjectPool<Particle>;

  /** Active particles */
  private readonly _particles: Particle[] = [];

  /** Behavior modules */
  private readonly _modules: IParticleModule[] = [];

  /** Modules sorted by priority */
  private _sortedModules: IParticleModule[] = [];

  /** Whether modules need re-sorting */
  private _needsSort: boolean = false;

  // ============================================================================
  // Configuration
  // ============================================================================

  /** Maximum particles allowed */
  maxParticles: number = 1000;

  /** Initial particle lifetime */
  lifetime: number = 5.0;

  /** Lifetime randomness */
  lifetimeRandomness: number = 0;

  /** Initial particle color */
  readonly color: Color = new Color(1, 1, 1, 1);

  /** Initial particle size */
  readonly size: Vector3 = new Vector3(1, 1, 1);

  /** Size randomness */
  sizeRandomness: number = 0;

  /** Gravity scale */
  gravityScale: number = 1.0;

  /** Simulate in world space */
  simulateInWorldSpace: boolean = true;

  /** LOD level */
  lodLevel: ParticleLOD = ParticleLOD.High;

  /** Auto-start emission */
  autoStart: boolean = false;

  /** Loop emission */
  loop: boolean = true;

  /** System duration (0 = infinite) */
  duration: number = 0;

  // ============================================================================
  // State
  // ============================================================================

  /** Whether system is playing */
  private _isPlaying: boolean = false;

  /** Whether system is paused */
  private _isPaused: boolean = false;

  /** Current system time */
  private _time: number = 0;

  /** System bounding box */
  readonly bounds: Box3 = new Box3();

  /** Whether to auto-update bounds */
  autoUpdateBounds: boolean = true;

  /** Statistics */
  readonly stats: ParticleSystemStats = {
    aliveCount: 0,
    pooledCount: 0,
    peakCount: 0,
    totalEmitted: 0,
    emissionRate: 0,
    updateTime: 0,
  };

  /** Performance tracking */
  private _frameEmitCount: number = 0;
  private _updateStartTime: number = 0;

  /**
   * Create a new particle system.
   *
   * @param config - System configuration
   */
  constructor(config: ParticleSystemConfig = {}) {
    // Apply configuration
    this.maxParticles = config.maxParticles ?? 1000;
    this.lifetime = config.lifetime ?? 5.0;
    this.lifetimeRandomness = config.lifetimeRandomness ?? 0;
    this.sizeRandomness = config.sizeRandomness ?? 0;
    this.gravityScale = config.gravityScale ?? 1.0;
    this.simulateInWorldSpace = config.simulateInWorldSpace ?? true;
    this.lodLevel = config.lodLevel ?? ParticleLOD.High;
    this.autoStart = config.autoStart ?? false;
    this.loop = config.loop ?? true;
    this.duration = config.duration ?? 0;

    if (config.color) {
      this.color.copy(config.color);
    }

    if (config.size !== undefined) {
      if (typeof config.size === 'number') {
        this.size.set(config.size, config.size, config.size);
      } else {
        this.size.copy(config.size);
      }
    }

    // Create particle pool
    this._pool = new ObjectPool<Particle>(
      () => new Particle(),
      (particle) => particle.reset(),
      this.maxParticles
    );

    // Create emitter
    this.emitter = new ParticleEmitter({
      randomSeed: config.randomSeed,
      space: this.simulateInWorldSpace ? EmitterSpace.World : EmitterSpace.Local,
    });

    // Auto-start if configured
    if (this.autoStart) {
      this.play();
    }
  }

  /**
   * Add a behavior module to the system.
   *
   * @param module - Module to add
   */
  addModule(module: IParticleModule): void {
    if (this._modules.includes(module)) {
      logger.warn(`Module ${module.name} already added`);
      return;
    }

    this._modules.push(module);
    this._needsSort = true;
    logger.debug(`Added module: ${module.name}`);
  }

  /**
   * Remove a behavior module from the system.
   *
   * @param module - Module to remove
   */
  removeModule(module: IParticleModule): void {
    const index = this._modules.indexOf(module);
    if (index >= 0) {
      this._modules.splice(index, 1);
      this._needsSort = true;
      logger.debug(`Removed module: ${module.name}`);
    }
  }

  /**
   * Get a module by name.
   *
   * @param name - Module name
   * @returns Module instance or undefined
   */
  getModule<T extends IParticleModule>(name: string): T | undefined {
    return this._modules.find((m) => m.name === name) as T | undefined;
  }

  /**
   * Sort modules by priority.
   */
  private sortModules(): void {
    if (!this._needsSort) return;

    this._sortedModules = [...this._modules].sort((a, b) => a.priority - b.priority);
    this._needsSort = false;
  }

  /**
   * Start playing the particle system.
   */
  play(): void {
    this._isPlaying = true;
    this._isPaused = false;
    logger.debug('Particle system playing');
  }

  /**
   * Pause the particle system.
   */
  pause(): void {
    this._isPaused = true;
    logger.debug('Particle system paused');
  }

  /**
   * Resume the particle system.
   */
  resume(): void {
    this._isPaused = false;
    logger.debug('Particle system resumed');
  }

  /**
   * Stop the particle system and clear all particles.
   */
  stop(): void {
    this._isPlaying = false;
    this._isPaused = false;
    this.clear();
    this._time = 0;
    this.emitter.reset();
    logger.debug('Particle system stopped');
  }

  /**
   * Restart the particle system from beginning.
   */
  restart(): void {
    this.stop();
    this.play();
  }

  /**
   * Clear all active particles.
   */
  clear(): void {
    for (const particle of this._particles) {
      this._pool.release(particle);
    }
    this._particles.length = 0;
    this.stats.aliveCount = 0;
  }

  /**
   * Emit a single particle.
   *
   * @returns The emitted particle or null if max particles reached
   */
  emit(): Particle | null {
    if (this._particles.length >= this.maxParticles) {
      return null;
    }

    // Apply LOD
    const lodFactor = this.getLODFactor();
    if (Math.random() > lodFactor) {
      return null;
    }

    // Acquire particle from pool
    const particle = this._pool.acquire();

    // Emit from emitter
    this.emitter.emitParticle(particle);

    // Calculate lifetime
    const lifetimeVariance = this.lifetime * this.lifetimeRandomness;
    const particleLifetime = this.lifetime + (Math.random() - 0.5) * 2 * lifetimeVariance;

    // Calculate size
    const sizeVariance = this.sizeRandomness;
    const sizeScale = 1 + (Math.random() - 0.5) * 2 * sizeVariance;
    const particleSize = new Vector3(
      this.size.x * sizeScale,
      this.size.y * sizeScale,
      this.size.z * sizeScale
    );

    // Initialize particle
    particle.initialize(
      particle.position,
      particle.velocity,
      this.color,
      particleSize,
      particleLifetime
    );

    // Apply module initialization
    this.sortModules();
    for (const module of this._sortedModules) {
      if (module.enabled && module.initializeParticle) {
        module.initializeParticle(particle, this);
      }
    }

    // Add to active list
    this._particles.push(particle);

    // Update stats
    this.stats.totalEmitted++;
    this._frameEmitCount++;

    return particle;
  }

  /**
   * Get LOD factor for emission.
   *
   * @returns Factor [0-1] for particle emission probability
   */
  private getLODFactor(): number {
    switch (this.lodLevel) {
      case ParticleLOD.High:
        return 1.0;
      case ParticleLOD.Medium:
        return 0.5;
      case ParticleLOD.Low:
        return 0.25;
      case ParticleLOD.Off:
        return 0;
      default:
        return 1.0;
    }
  }

  /**
   * Update the particle system.
   *
   * @param deltaTime - Time step in seconds
   */
  update(deltaTime: number): void {
    if (!this._isPlaying || this._isPaused) {
      return;
    }

    this._updateStartTime = performance.now();
    this._frameEmitCount = 0;

    // Update time
    this._time += deltaTime;

    // Check duration
    if (this.duration > 0 && this._time >= this.duration) {
      if (this.loop) {
        this._time = 0;
        this.emitter.reset();
      } else {
        this._isPlaying = false;
      }
    }

    // Update emitter velocity
    this.emitter.updateVelocity(deltaTime);

    // Pre-update modules
    this.sortModules();
    for (const module of this._sortedModules) {
      if (module.enabled && module.preUpdate) {
        module.preUpdate(deltaTime, this);
      }
    }

    // Emit new particles
    if (this._isPlaying) {
      const emitCount = this.emitter.computeEmissionCount(deltaTime, this._time);
      for (let i = 0; i < emitCount; i++) {
        this.emit();
      }
    }

    // Update particles
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const particle = this._particles[i];

      // Update particle
      particle.update(deltaTime);

      // Apply modules
      for (const module of this._sortedModules) {
        if (module.enabled && module.updateParticle) {
          module.updateParticle(particle, deltaTime, this);
        }
      }

      // Remove dead particles
      if (particle.isDead()) {
        this._particles.splice(i, 1);
        this._pool.release(particle);
      }
    }

    // Post-update modules
    for (const module of this._sortedModules) {
      if (module.enabled && module.postUpdate) {
        module.postUpdate(deltaTime, this);
      }
    }

    // Update bounds
    if (this.autoUpdateBounds) {
      this.updateBounds();
    }

    // Update stats
    this.stats.aliveCount = this._particles.length;
    this.stats.pooledCount = this._pool.available;
    this.stats.peakCount = Math.max(this.stats.peakCount, this._particles.length);
    this.stats.emissionRate = deltaTime > 0 ? this._frameEmitCount / deltaTime : 0;
    this.stats.updateTime = performance.now() - this._updateStartTime;
  }

  /**
   * Update bounding box to contain all particles.
   */
  private updateBounds(): void {
    if (this._particles.length === 0) {
      this.bounds.makeEmpty();
      return;
    }

    this.bounds.setFromPoints(this._particles.map((p) => p.position));
  }

  /**
   * Get all active particles.
   *
   * @returns Array of active particles
   */
  get particles(): readonly Particle[] {
    return this._particles;
  }

  /**
   * Get particle count.
   *
   * @returns Number of active particles
   */
  get particleCount(): number {
    return this._particles.length;
  }

  /**
   * Check if system is playing.
   *
   * @returns True if playing
   */
  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /**
   * Check if system is paused.
   *
   * @returns True if paused
   */
  get isPaused(): boolean {
    return this._isPaused;
  }

  /**
   * Get current system time.
   *
   * @returns System time in seconds
   */
  get time(): number {
    return this._time;
  }

  /**
   * Get all modules.
   *
   * @returns Array of modules
   */
  get modules(): readonly IParticleModule[] {
    return this._modules;
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats.peakCount = 0;
    this.stats.totalEmitted = 0;
  }
}
