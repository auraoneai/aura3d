/**
 * @fileoverview Audio source pooling system for the G3D engine.
 * Manages reusable audio sources for efficient SFX playback with voice limiting.
 * @module audio/AudioPool
 */

import { ObjectPool } from '../core/ObjectPool';
import { AudioSource, AudioSourceState } from './AudioSource';
import { AudioClip } from './AudioClip';

/**
 * Priority level for audio source stealing.
 */
export enum AudioPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

/**
 * Configuration for audio pool.
 *
 * @example
 * ```typescript
 * const config: AudioPoolConfig = {
 *   initialSize: 32,
 *   maxSize: 64,
 *   voiceLimit: 32
 * };
 * ```
 */
export interface AudioPoolConfig {
  /**
   * Initial pool size (default: 16).
   */
  initialSize?: number;

  /**
   * Maximum pool size (default: 64).
   */
  maxSize?: number;

  /**
   * Maximum concurrent voices (default: 32).
   */
  voiceLimit?: number;

  /**
   * Enable automatic recycling when sources finish (default: true).
   */
  autoRecycle?: boolean;
}

/**
 * Pooled audio source with priority and tracking.
 */
interface PooledAudioSource {
  source: AudioSource;
  priority: AudioPriority;
  playbackStartTime: number;
  inUse: boolean;
}

/**
 * Audio source pool for efficient SFX playback.
 *
 * Features:
 * - Object pooling to minimize allocations
 * - Voice limiting with priority-based stealing
 * - Automatic recycling when playback finishes
 * - Statistics tracking for optimization
 *
 * @example
 * ```typescript
 * // Create and initialize pool
 * const pool = new AudioPool();
 * pool.initialize({ initialSize: 32, voiceLimit: 32 });
 *
 * // Play a sound effect
 * const source = pool.acquire(explosionClip, AudioPriority.HIGH);
 * source?.play();
 *
 * // Manual recycling (automatic if autoRecycle enabled)
 * pool.release(source);
 *
 * // Voice limiting - low priority sounds may be stolen
 * for (let i = 0; i < 100; i++) {
 *   pool.acquire(footstepClip, AudioPriority.LOW)?.play();
 * }
 *
 * // Cleanup
 * pool.dispose();
 * ```
 */
export class AudioPool {
  private pool: ObjectPool<PooledAudioSource>;
  private activeSources: PooledAudioSource[] = [];
  private config: Required<AudioPoolConfig>;

  private nextSourceId: number = 0;
  private totalPlayed: number = 0;
  private totalStolen: number = 0;

  /**
   * Creates a new audio pool.
   *
   * @example
   * ```typescript
   * const pool = new AudioPool();
   * ```
   */
  constructor() {
    this.config = {
      initialSize: 16,
      maxSize: 64,
      voiceLimit: 32,
      autoRecycle: true
    };

    // Create object pool for audio sources
    this.pool = new ObjectPool<PooledAudioSource>(
      () => this.createPooledSource(),
      (obj) => this.resetPooledSource(obj),
      0, // Don't prewarm yet
      this.config.maxSize
    );
  }

  /**
   * Initializes the audio pool.
   *
   * @param config - Configuration options
   *
   * @example
   * ```typescript
   * pool.initialize({
   *   initialSize: 32,
   *   voiceLimit: 32,
   *   autoRecycle: true
   * });
   * ```
   */
  public initialize(config?: AudioPoolConfig): void {
    // Merge config
    if (config) {
      Object.assign(this.config, config);
    }

    // Prewarm pool
    if (this.config.initialSize > 0) {
      this.pool.prewarm(this.config.initialSize);
    }
  }

  /**
   * Acquires an audio source from the pool.
   *
   * @param clip - Audio clip to play (optional, can be set later)
   * @param priority - Playback priority for voice stealing (default: NORMAL)
   * @returns AudioSource or null if voice limit reached and no sources can be stolen
   *
   * @example
   * ```typescript
   * // Acquire and play immediately
   * const source = pool.acquire(explosionClip, AudioPriority.HIGH);
   * source?.play();
   *
   * // Acquire and configure later
   * const source = pool.acquire();
   * if (source) {
   *   source.setClip(clip);
   *   source.setVolume(0.5);
   *   source.play();
   * }
   * ```
   */
  public acquire(clip?: AudioClip, priority: AudioPriority = AudioPriority.NORMAL): AudioSource | null {
    // Check voice limit
    if (this.activeSources.length >= this.config.voiceLimit) {
      // Try to steal a source
      const stolenSource = this.stealSource(priority);
      if (!stolenSource) {
        return null; // Can't steal, voice limit reached
      }

      // Stop and recycle the stolen source
      stolenSource.source.stop();
      this.releasePooledSource(stolenSource);
      this.totalStolen++;
    }

    // Acquire from pool
    const pooled = this.pool.acquire();
    pooled.priority = priority;
    pooled.playbackStartTime = performance.now();
    pooled.inUse = true;

    // Set clip if provided
    if (clip) {
      pooled.source.setClip(clip);
    }

    // Setup auto-recycling
    if (this.config.autoRecycle) {
      pooled.source.onEnded(() => {
        this.release(pooled.source);
      });
    }

    this.activeSources.push(pooled);
    this.totalPlayed++;

    return pooled.source;
  }

  /**
   * Releases an audio source back to the pool.
   *
   * @param source - AudioSource to release
   *
   * @example
   * ```typescript
   * const source = pool.acquire(clip);
   * source?.play();
   * // ... later ...
   * pool.release(source);
   * ```
   */
  public release(source: AudioSource | null): void {
    if (!source) {
      return;
    }

    // Find pooled source
    const index = this.activeSources.findIndex((p) => p.source === source);
    if (index === -1) {
      return; // Not from this pool
    }

    const pooled = this.activeSources[index];
    this.activeSources.splice(index, 1);

    // Stop playback
    if (pooled.source.isPlaying()) {
      pooled.source.stop();
    }

    // Return to pool
    this.releasePooledSource(pooled);
  }

  /**
   * Stops and releases all active sources.
   *
   * @example
   * ```typescript
   * pool.releaseAll();
   * ```
   */
  public releaseAll(): void {
    const sources = [...this.activeSources];
    for (const pooled of sources) {
      this.release(pooled.source);
    }
  }

  /**
   * Gets the number of active (in-use) sources.
   *
   * @returns Active source count
   *
   * @example
   * ```typescript
   * const active = pool.getActiveCount();
   * console.log(`${active} / ${pool.getVoiceLimit()} voices`);
   * ```
   */
  public getActiveCount(): number {
    return this.activeSources.length;
  }

  /**
   * Gets the number of pooled (available) sources.
   *
   * @returns Pooled source count
   *
   * @example
   * ```typescript
   * const available = pool.getPooledCount();
   * ```
   */
  public getPooledCount(): number {
    return this.pool.pooledCount;
  }

  /**
   * Gets the voice limit.
   *
   * @returns Maximum concurrent voices
   *
   * @example
   * ```typescript
   * const limit = pool.getVoiceLimit();
   * ```
   */
  public getVoiceLimit(): number {
    return this.config.voiceLimit;
  }

  /**
   * Sets the voice limit.
   *
   * @param limit - Maximum concurrent voices
   *
   * @example
   * ```typescript
   * pool.setVoiceLimit(64);
   * ```
   */
  public setVoiceLimit(limit: number): void {
    this.config.voiceLimit = Math.max(1, limit);

    // Release excess sources if needed
    while (this.activeSources.length > this.config.voiceLimit) {
      const lowest = this.findLowestPrioritySource();
      if (lowest) {
        this.release(lowest.source);
      }
    }
  }

  /**
   * Gets pool statistics.
   *
   * @returns Statistics object
   *
   * @example
   * ```typescript
   * const stats = pool.getStats();
   * console.log(`Played: ${stats.totalPlayed}, Stolen: ${stats.totalStolen}`);
   * console.log(`Active: ${stats.activeCount} / ${stats.voiceLimit}`);
   * console.log(`Pool usage: ${stats.pooledCount} available`);
   * ```
   */
  public getStats(): {
    activeCount: number;
    pooledCount: number;
    totalCreated: number;
    voiceLimit: number;
    totalPlayed: number;
    totalStolen: number;
    stealRate: number;
  } {
    return {
      activeCount: this.activeSources.length,
      pooledCount: this.pool.pooledCount,
      totalCreated: this.pool.totalCreated,
      voiceLimit: this.config.voiceLimit,
      totalPlayed: this.totalPlayed,
      totalStolen: this.totalStolen,
      stealRate: this.totalPlayed > 0 ? this.totalStolen / this.totalPlayed : 0
    };
  }

  /**
   * Disposes the audio pool and all sources.
   *
   * @example
   * ```typescript
   * pool.dispose();
   * ```
   */
  public dispose(): void {
    // Stop and release all active sources
    this.releaseAll();

    // Clear pool
    this.pool.clear();

    // Reset stats
    this.totalPlayed = 0;
    this.totalStolen = 0;
    this.nextSourceId = 0;
  }

  /**
   * Creates a new pooled audio source.
   */
  private createPooledSource(): PooledAudioSource {
    return {
      source: new AudioSource(`PooledSource_${this.nextSourceId++}`),
      priority: AudioPriority.NORMAL,
      playbackStartTime: 0,
      inUse: false
    };
  }

  /**
   * Resets a pooled audio source to default state.
   */
  private resetPooledSource(pooled: PooledAudioSource): void {
    pooled.source.stop();
    pooled.source.setClip(null);
    pooled.source.setVolume(1.0);
    pooled.source.setPitch(1.0);
    pooled.source.setPan(0.0);
    pooled.source.setLoop(false);
    pooled.source.onEnded(null);
    pooled.source.onLoop(null);
    pooled.priority = AudioPriority.NORMAL;
    pooled.playbackStartTime = 0;
    pooled.inUse = false;
  }

  /**
   * Releases a pooled source back to the pool.
   */
  private releasePooledSource(pooled: PooledAudioSource): void {
    this.pool.release(pooled);
  }

  /**
   * Finds the lowest priority source for stealing.
   * Prioritizes: stopped sources > lower priority > older playback.
   *
   * @param minPriority - Minimum priority to consider stealing
   * @returns Pooled source to steal or null
   */
  private stealSource(minPriority: AudioPriority): PooledAudioSource | null {
    if (this.activeSources.length === 0) {
      return null;
    }

    // First, try to find stopped sources
    for (const pooled of this.activeSources) {
      if (pooled.source.getState() === AudioSourceState.STOPPED) {
        return pooled;
      }
    }

    // Find lowest priority source (must be lower than minPriority)
    const lowest = this.findLowestPrioritySource();
    if (lowest && lowest.priority < minPriority) {
      return lowest;
    }

    return null;
  }

  /**
   * Finds the lowest priority active source.
   * If multiple sources have same priority, returns the oldest one.
   *
   * @returns Lowest priority source or null
   */
  private findLowestPrioritySource(): PooledAudioSource | null {
    if (this.activeSources.length === 0) {
      return null;
    }

    let lowest = this.activeSources[0];

    for (let i = 1; i < this.activeSources.length; i++) {
      const current = this.activeSources[i];

      // Lower priority wins
      if (current.priority < lowest.priority) {
        lowest = current;
      }
      // Same priority, older source wins
      else if (current.priority === lowest.priority && current.playbackStartTime < lowest.playbackStartTime) {
        lowest = current;
      }
    }

    return lowest;
  }
}
