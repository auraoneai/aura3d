/**
 * Chunked LOD management for terrain.
 * Manages LOD selection and transitions for terrain chunks.
 * @module ChunkedLOD
 */

import { Vector3 } from '../../math/Vector3';
import { Camera } from '../../rendering/camera/Camera';
import { TerrainChunk } from '../TerrainChunk';
import { TerrainLOD, LODSelection } from '../TerrainLOD';
import { Logger } from '../../core/Logger';

const logger = Logger.create('ChunkedLOD');

/**
 * Chunk LOD state.
 */
export interface ChunkLODState {
  /** Current LOD level */
  currentLOD: number;
  /** Target LOD level */
  targetLOD: number;
  /** Transition progress (0-1) */
  transitionProgress: number;
  /** Distance to camera */
  distance: number;
  /** Geomorph factor */
  geomorphFactor: number;
}

/**
 * LOD transition configuration.
 */
export interface LODTransitionConfig {
  /** Transition duration in seconds */
  duration: number;
  /** Enable smooth transitions */
  smooth: boolean;
  /** Transition curve (linear, smooth, etc.) */
  curve: 'linear' | 'smooth' | 'smoothstep';
}

/**
 * Chunked LOD manager for terrain.
 * Manages LOD levels for terrain chunks with smooth transitions.
 *
 * @example
 * ```typescript
 * const chunkedLOD = new ChunkedLOD(lodManager, {
 *   duration: 0.5,
 *   smooth: true,
 *   curve: 'smoothstep'
 * });
 *
 * // Update chunk LOD states
 * chunkedLOD.updateChunk(chunk, camera, deltaTime);
 *
 * // Get LOD state
 * const state = chunkedLOD.getChunkState(chunk);
 * ```
 */
export class ChunkedLOD {
  private _lodManager: TerrainLOD;
  private _transitionConfig: LODTransitionConfig;
  private _chunkStates: WeakMap<TerrainChunk, ChunkLODState>;

  /**
   * Creates a new chunked LOD manager.
   *
   * @param lodManager - Terrain LOD manager
   * @param transitionConfig - Transition configuration
   */
  constructor(
    lodManager: TerrainLOD,
    transitionConfig: Partial<LODTransitionConfig> = {}
  ) {
    this._lodManager = lodManager;
    this._transitionConfig = {
      duration: transitionConfig.duration ?? 0.5,
      smooth: transitionConfig.smooth ?? true,
      curve: transitionConfig.curve ?? 'smoothstep',
    };
    this._chunkStates = new WeakMap();
  }

  /**
   * Updates LOD for a chunk.
   *
   * @param chunk - Terrain chunk
   * @param camera - Active camera
   * @param deltaTime - Time delta
   * @returns Updated LOD state
   */
  updateChunk(chunk: TerrainChunk, camera: Camera, deltaTime: number): ChunkLODState {
    let state = this._chunkStates.get(chunk);

    if (!state) {
      // Initialize state
      const selection = this._lodManager.selectLOD(chunk.center, camera);

      state = {
        currentLOD: selection.level,
        targetLOD: selection.level,
        transitionProgress: 1.0,
        distance: selection.distance,
        geomorphFactor: selection.geomorphFactor,
      };

      this._chunkStates.set(chunk, state);
    } else {
      // Update state
      const selection = this._lodManager.selectLOD(chunk.center, camera);

      state.distance = selection.distance;
      state.geomorphFactor = selection.geomorphFactor;

      // Check if LOD level changed
      if (selection.level !== state.targetLOD) {
        state.targetLOD = selection.level;
        state.transitionProgress = 0.0;
      }

      // Update transition
      if (state.transitionProgress < 1.0) {
        state.transitionProgress += deltaTime / this._transitionConfig.duration;
        state.transitionProgress = Math.min(1.0, state.transitionProgress);

        // Apply transition curve
        const t = this._applyTransitionCurve(state.transitionProgress);

        // Interpolate LOD if smooth transitions enabled
        if (this._transitionConfig.smooth && state.transitionProgress >= 1.0) {
          state.currentLOD = state.targetLOD;
        }
      }
    }

    return state;
  }

  /**
   * Gets LOD state for a chunk.
   *
   * @param chunk - Terrain chunk
   * @returns LOD state or undefined
   */
  getChunkState(chunk: TerrainChunk): ChunkLODState | undefined {
    return this._chunkStates.get(chunk);
  }

  /**
   * Forces a chunk to a specific LOD level.
   *
   * @param chunk - Terrain chunk
   * @param lodLevel - LOD level
   */
  forceChunkLOD(chunk: TerrainChunk, lodLevel: number): void {
    const state = this._chunkStates.get(chunk);

    if (state) {
      state.currentLOD = lodLevel;
      state.targetLOD = lodLevel;
      state.transitionProgress = 1.0;
    } else {
      this._chunkStates.set(chunk, {
        currentLOD: lodLevel,
        targetLOD: lodLevel,
        transitionProgress: 1.0,
        distance: 0,
        geomorphFactor: 0,
      });
    }
  }

  /**
   * Applies transition curve to progress value.
   * @private
   */
  private _applyTransitionCurve(t: number): number {
    switch (this._transitionConfig.curve) {
      case 'linear':
        return t;

      case 'smooth':
        return t * t * (3 - 2 * t);

      case 'smoothstep':
        return t * t * t * (t * (t * 6 - 15) + 10);

      default:
        return t;
    }
  }

  /**
   * Clears all chunk states.
   */
  clear(): void {
    this._chunkStates = new WeakMap();
  }

  /**
   * Sets transition configuration.
   *
   * @param config - New transition configuration
   */
  setTransitionConfig(config: Partial<LODTransitionConfig>): void {
    Object.assign(this._transitionConfig, config);
  }

  /**
   * Gets transition configuration.
   * @returns Transition configuration
   */
  getTransitionConfig(): LODTransitionConfig {
    return { ...this._transitionConfig };
  }
}
