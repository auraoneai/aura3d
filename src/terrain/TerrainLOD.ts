/**
 * Terrain Level-of-Detail (LOD) management with distance-based selection and geomorphing.
 * Provides smooth transitions between LOD levels to prevent popping artifacts.
 * @module TerrainLOD
 */

import { Vector3 } from '../math/Vector3';
import { Camera } from '../rendering/camera/Camera';
import { Logger } from '../core/Logger';

const logger = Logger.create('TerrainLOD');

/**
 * LOD selection strategy.
 */
export enum LODStrategy {
  /** Simple distance-based LOD */
  Distance = 'Distance',
  /** Screen-space error metric */
  ScreenSpace = 'ScreenSpace',
  /** Pixel coverage based */
  PixelCoverage = 'PixelCoverage',
}

/**
 * LOD level configuration.
 */
export interface LODLevelConfig {
  /** LOD level index (0 = highest detail) */
  level: number;
  /** Distance threshold in world units */
  distance: number;
  /** Screen space error threshold (pixels) */
  screenSpaceError?: number;
  /** Vertex reduction factor (1, 2, 4, 8, etc.) */
  reductionFactor: number;
}

/**
 * LOD configuration.
 */
export interface LODConfig {
  /** LOD selection strategy */
  strategy: LODStrategy;
  /** LOD level configurations */
  levels: LODLevelConfig[];
  /** Global LOD bias (-1 = higher detail, +1 = lower detail) */
  bias: number;
  /** Enable geomorphing transitions */
  geomorphing: boolean;
  /** Geomorphing blend range (0-1) */
  geomorphRange: number;
  /** Minimum pixel coverage before culling */
  minPixelCoverage: number;
}

/**
 * LOD selection result.
 */
export interface LODSelection {
  /** Selected LOD level */
  level: number;
  /** Geomorph factor (0-1, 0 = current LOD, 1 = next LOD) */
  geomorphFactor: number;
  /** Distance to camera */
  distance: number;
}

/**
 * Terrain LOD manager for distance-based level selection and smooth transitions.
 * Implements various LOD strategies and geomorphing for seamless quality changes.
 *
 * @example
 * ```typescript
 * // Create LOD manager
 * const lodManager = new TerrainLOD({
 *   strategy: LODStrategy.Distance,
 *   levels: [
 *     { level: 0, distance: 100, reductionFactor: 1 },
 *     { level: 1, distance: 200, reductionFactor: 2 },
 *     { level: 2, distance: 400, reductionFactor: 4 },
 *     { level: 3, distance: 800, reductionFactor: 8 }
 *   ],
 *   bias: 0,
 *   geomorphing: true,
 *   geomorphRange: 0.2,
 *   minPixelCoverage: 1.0
 * });
 *
 * // Select LOD for a chunk
 * const selection = lodManager.selectLOD(chunkCenter, camera);
 * console.log(`LOD ${selection.level}, geomorph: ${selection.geomorphFactor}`);
 * ```
 */
export class TerrainLOD {
  /** LOD configuration */
  private _config: LODConfig;
  /** Cached camera position */
  private _cameraPosition: Vector3;
  /** Cached viewport dimensions */
  private _viewportWidth: number;
  private _viewportHeight: number;
  /** Cached field of view */
  private _fieldOfView: number;

  /**
   * Creates a new terrain LOD manager.
   *
   * @param config - LOD configuration
   */
  constructor(config: Partial<LODConfig> = {}) {
    this._config = {
      strategy: config.strategy ?? LODStrategy.Distance,
      levels: config.levels ?? this._createDefaultLevels(),
      bias: config.bias ?? 0,
      geomorphing: config.geomorphing ?? true,
      geomorphRange: config.geomorphRange ?? 0.2,
      minPixelCoverage: config.minPixelCoverage ?? 1.0,
    };

    // Sort levels by distance
    this._config.levels.sort((a, b) => a.distance - b.distance);

    this._cameraPosition = new Vector3();
    this._viewportWidth = 1920;
    this._viewportHeight = 1080;
    this._fieldOfView = 60;
  }

  /**
   * Gets the LOD configuration.
   * @returns LOD configuration
   */
  get config(): LODConfig {
    return this._config;
  }

  /**
   * Sets the LOD bias.
   * @param bias - LOD bias (-1 to +1)
   */
  setBias(bias: number): void {
    this._config.bias = Math.max(-1, Math.min(1, bias));
  }

  /**
   * Gets the LOD bias.
   * @returns LOD bias
   */
  getBias(): number {
    return this._config.bias;
  }

  /**
   * Enables or disables geomorphing.
   * @param enabled - Enable geomorphing
   */
  setGeomorphing(enabled: boolean): void {
    this._config.geomorphing = enabled;
  }

  /**
   * Updates camera information for LOD calculations.
   *
   * @param camera - Active camera
   * @param viewportWidth - Viewport width in pixels
   * @param viewportHeight - Viewport height in pixels
   */
  updateCamera(camera: Camera, viewportWidth: number, viewportHeight: number): void {
    this._cameraPosition.copy(camera.transform.worldPosition);
    this._viewportWidth = viewportWidth;
    this._viewportHeight = viewportHeight;
    // Note: Camera.fov would need to be exposed, using default for now
    this._fieldOfView = 60;
  }

  /**
   * Selects the appropriate LOD level for a position.
   *
   * @param position - World position to evaluate
   * @param camera - Camera for LOD calculation
   * @returns LOD selection result
   */
  selectLOD(position: Vector3, camera: Camera): LODSelection {
    // Update camera info
    this._cameraPosition.copy(camera.transform.worldPosition);

    // Calculate distance
    const distance = this._cameraPosition.distanceTo(position);

    let selectedLevel = 0;
    let geomorphFactor = 0;

    switch (this._config.strategy) {
      case LODStrategy.Distance:
        ({ selectedLevel, geomorphFactor } = this._selectByDistance(distance));
        break;

      case LODStrategy.ScreenSpace:
        ({ selectedLevel, geomorphFactor } = this._selectByScreenSpace(position, distance));
        break;

      case LODStrategy.PixelCoverage:
        ({ selectedLevel, geomorphFactor } = this._selectByPixelCoverage(position, distance));
        break;
    }

    // Apply bias
    selectedLevel = this._applyBias(selectedLevel);

    return {
      level: selectedLevel,
      geomorphFactor: this._config.geomorphing ? geomorphFactor : 0,
      distance,
    };
  }

  /**
   * Selects LOD based on distance thresholds.
   * @private
   */
  private _selectByDistance(distance: number): { selectedLevel: number; geomorphFactor: number } {
    const levels = this._config.levels;
    let selectedLevel = levels[levels.length - 1]!.level;
    let geomorphFactor = 0;

    for (let i = 0; i < levels.length; i++) {
      if (distance < levels[i]!.distance) {
        selectedLevel = levels[i]!.level;

        // Calculate geomorph factor
        if (this._config.geomorphing && i > 0) {
          const prevDist = levels[i - 1]!.distance;
          const currDist = levels[i]!.distance;
          const range = currDist - prevDist;
          const rangeStart = currDist - range * this._config.geomorphRange;

          if (distance > rangeStart) {
            geomorphFactor = (distance - rangeStart) / (range * this._config.geomorphRange);
            geomorphFactor = Math.max(0, Math.min(1, geomorphFactor));
          }
        }
        break;
      }
    }

    return { selectedLevel, geomorphFactor };
  }

  /**
   * Selects LOD based on screen-space error metric.
   * @private
   */
  private _selectByScreenSpace(
    position: Vector3,
    distance: number
  ): { selectedLevel: number; geomorphFactor: number } {
    const levels = this._config.levels;

    // Calculate screen-space error
    // Error = (geometricError * viewportHeight) / (distance * 2 * tan(fov/2))
    const fovRadians = (this._fieldOfView * Math.PI) / 180;
    const tanHalfFov = Math.tan(fovRadians / 2);

    let selectedLevel = levels[levels.length - 1]!.level;
    let geomorphFactor = 0;

    for (let i = 0; i < levels.length; i++) {
      const level = levels[i]!;
      if (!level.screenSpaceError) continue;

      const screenError = (level.screenSpaceError * this._viewportHeight) / (distance * 2 * tanHalfFov);

      if (screenError > level.screenSpaceError) {
        selectedLevel = level.level;

        // Calculate geomorph factor based on error ratio
        if (this._config.geomorphing && i > 0) {
          const prevError = levels[i - 1]!.screenSpaceError ?? 0;
          const currError = level.screenSpaceError;
          const errorRange = currError - prevError;

          if (screenError > prevError) {
            geomorphFactor = (screenError - prevError) / errorRange;
            geomorphFactor = Math.max(0, Math.min(1, geomorphFactor));
          }
        }
        break;
      }
    }

    return { selectedLevel, geomorphFactor };
  }

  /**
   * Selects LOD based on pixel coverage.
   * @private
   */
  private _selectByPixelCoverage(
    position: Vector3,
    distance: number
  ): { selectedLevel: number; geomorphFactor: number } {
    // Estimate pixel coverage (simplified)
    const fovRadians = (this._fieldOfView * Math.PI) / 180;
    const pixelsPerUnit = this._viewportHeight / (2 * distance * Math.tan(fovRadians / 2));

    const levels = this._config.levels;
    let selectedLevel = levels[levels.length - 1]!.level;
    let geomorphFactor = 0;

    // Assume 1 unit = 1 meter of terrain
    const coverage = pixelsPerUnit;

    for (let i = 0; i < levels.length; i++) {
      const requiredCoverage = this._config.minPixelCoverage * levels[i]!.reductionFactor;

      if (coverage > requiredCoverage) {
        selectedLevel = levels[i]!.level;

        if (this._config.geomorphing && i > 0) {
          const prevCoverage = this._config.minPixelCoverage * levels[i - 1]!.reductionFactor;
          const coverageRange = requiredCoverage - prevCoverage;

          if (coverage < requiredCoverage) {
            geomorphFactor = (requiredCoverage - coverage) / coverageRange;
            geomorphFactor = Math.max(0, Math.min(1, geomorphFactor));
          }
        }
        break;
      }
    }

    return { selectedLevel, geomorphFactor };
  }

  /**
   * Applies LOD bias to selected level.
   * @private
   */
  private _applyBias(level: number): number {
    const bias = Math.round(this._config.bias * 2); // -2 to +2 range
    const biasedLevel = level + bias;

    const minLevel = 0;
    const maxLevel = this._config.levels[this._config.levels.length - 1]!.level;

    return Math.max(minLevel, Math.min(maxLevel, biasedLevel));
  }

  /**
   * Gets the distance threshold for a LOD level.
   *
   * @param level - LOD level
   * @returns Distance threshold
   */
  getDistanceForLevel(level: number): number {
    const config = this._config.levels.find(l => l.level === level);
    return config?.distance ?? Infinity;
  }

  /**
   * Gets the number of LOD levels.
   * @returns Number of levels
   */
  getLevelCount(): number {
    return this._config.levels.length;
  }

  /**
   * Adds a new LOD level.
   *
   * @param config - LOD level configuration
   */
  addLevel(config: LODLevelConfig): void {
    this._config.levels.push(config);
    this._config.levels.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Removes a LOD level.
   *
   * @param level - LOD level to remove
   */
  removeLevel(level: number): void {
    const index = this._config.levels.findIndex(l => l.level === level);
    if (index !== -1) {
      this._config.levels.splice(index, 1);
    }
  }

  /**
   * Creates default LOD levels.
   * @private
   */
  private _createDefaultLevels(): LODLevelConfig[] {
    return [
      { level: 0, distance: 100, reductionFactor: 1, screenSpaceError: 2 },
      { level: 1, distance: 200, reductionFactor: 2, screenSpaceError: 4 },
      { level: 2, distance: 400, reductionFactor: 4, screenSpaceError: 8 },
      { level: 3, distance: 800, reductionFactor: 8, screenSpaceError: 16 },
      { level: 4, distance: 1600, reductionFactor: 16, screenSpaceError: 32 },
    ];
  }

  /**
   * Calculates geomorph blend factor for smooth LOD transitions.
   *
   * @param distance - Distance to camera
   * @param level - Current LOD level
   * @returns Blend factor (0-1)
   */
  calculateGeomorphFactor(distance: number, level: number): number {
    if (!this._config.geomorphing) return 0;

    const levelConfig = this._config.levels.find(l => l.level === level);
    const nextLevelConfig = this._config.levels.find(l => l.level === level + 1);

    if (!levelConfig || !nextLevelConfig) return 0;

    const range = nextLevelConfig.distance - levelConfig.distance;
    const rangeStart = nextLevelConfig.distance - range * this._config.geomorphRange;

    if (distance < rangeStart) return 0;
    if (distance >= nextLevelConfig.distance) return 1;

    const factor = (distance - rangeStart) / (range * this._config.geomorphRange);
    return Math.max(0, Math.min(1, factor));
  }

  /**
   * Creates a terrain LOD manager with preset configurations.
   *
   * @param preset - Preset name
   * @returns LOD manager
   */
  static createPreset(preset: 'low' | 'medium' | 'high' | 'ultra'): TerrainLOD {
    const presets: Record<string, Partial<LODConfig>> = {
      low: {
        levels: [
          { level: 0, distance: 150, reductionFactor: 2 },
          { level: 1, distance: 400, reductionFactor: 4 },
          { level: 2, distance: 1000, reductionFactor: 8 },
        ],
        geomorphing: false,
      },
      medium: {
        levels: [
          { level: 0, distance: 100, reductionFactor: 1 },
          { level: 1, distance: 250, reductionFactor: 2 },
          { level: 2, distance: 600, reductionFactor: 4 },
          { level: 3, distance: 1200, reductionFactor: 8 },
        ],
        geomorphing: true,
        geomorphRange: 0.15,
      },
      high: {
        levels: [
          { level: 0, distance: 100, reductionFactor: 1 },
          { level: 1, distance: 200, reductionFactor: 2 },
          { level: 2, distance: 400, reductionFactor: 4 },
          { level: 3, distance: 800, reductionFactor: 8 },
          { level: 4, distance: 1600, reductionFactor: 16 },
        ],
        geomorphing: true,
        geomorphRange: 0.2,
      },
      ultra: {
        levels: [
          { level: 0, distance: 80, reductionFactor: 1 },
          { level: 1, distance: 160, reductionFactor: 2 },
          { level: 2, distance: 320, reductionFactor: 4 },
          { level: 3, distance: 640, reductionFactor: 8 },
          { level: 4, distance: 1280, reductionFactor: 16 },
          { level: 5, distance: 2560, reductionFactor: 32 },
        ],
        geomorphing: true,
        geomorphRange: 0.25,
      },
    };

    return new TerrainLOD(presets[preset]);
  }
}
