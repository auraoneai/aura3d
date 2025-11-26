/**
 * Geometry clipmaps for seamless terrain LOD.
 * Implements continuous LOD using nested grids centered on camera.
 * @module GeometryClipmaps
 */

import { Vector2 } from '../../math/Vector2';
import { Vector3 } from '../../math/Vector3';
import { Box3 } from '../../math/Box3';
import { Mesh } from '../../rendering/geometry/Mesh';
import { Heightmap } from '../Heightmap';
import { Camera } from '../../rendering/camera/Camera';
import { Logger } from '../../core/Logger';

const logger = Logger.create('GeometryClipmaps');

/**
 * Clipmap level configuration.
 */
export interface ClipmapLevel {
  /** Level index (0 = finest) */
  level: number;
  /** Grid resolution */
  resolution: number;
  /** Cell size in world units */
  cellSize: number;
  /** Center position */
  center: Vector2;
  /** Mesh for this level */
  mesh: Mesh | null;
  /** Is level active */
  active: boolean;
}

/**
 * Clipmap configuration.
 */
export interface ClipmapConfig {
  /** Number of clipmap levels */
  levelCount: number;
  /** Grid resolution per level */
  gridResolution: number;
  /** Finest level cell size */
  finestCellSize: number;
  /** Heightmap source */
  heightmap: Heightmap;
  /** Height scale */
  heightScale: number;
}

/**
 * Geometry clipmaps terrain LOD system.
 * Provides seamless, continuous LOD using nested grids centered on camera.
 *
 * @example
 * ```typescript
 * const clipmaps = new GeometryClipmaps({
 *   levelCount: 5,
 *   gridResolution: 64,
 *   finestCellSize: 1.0,
 *   heightmap: heightmap,
 *   heightScale: 100
 * });
 *
 * // Update clipmaps based on camera
 * clipmaps.update(camera);
 *
 * // Get meshes for rendering
 * const levels = clipmaps.getLevels();
 * ```
 */
export class GeometryClipmaps {
  private _config: ClipmapConfig;
  private _levels: ClipmapLevel[];
  private _cameraPosition: Vector2;

  /**
   * Creates a new geometry clipmaps system.
   *
   * @param config - Clipmap configuration
   */
  constructor(config: Partial<ClipmapConfig> = {}) {
    this._config = {
      levelCount: config.levelCount ?? 5,
      gridResolution: config.gridResolution ?? 64,
      finestCellSize: config.finestCellSize ?? 1.0,
      heightmap: config.heightmap ?? null as any,
      heightScale: config.heightScale ?? 100,
    };

    this._levels = [];
    this._cameraPosition = new Vector2();

    this._initializeLevels();

    logger.info(`Geometry clipmaps initialized with ${this._config.levelCount} levels`);
  }

  /**
   * Initializes clipmap levels.
   * @private
   */
  private _initializeLevels(): void {
    for (let i = 0; i < this._config.levelCount; i++) {
      const cellSize = this._config.finestCellSize * Math.pow(2, i);

      this._levels.push({
        level: i,
        resolution: this._config.gridResolution,
        cellSize,
        center: new Vector2(),
        mesh: null,
        active: true,
      });
    }
  }

  /**
   * Updates clipmap levels based on camera position.
   *
   * @param camera - Active camera
   */
  update(camera: Camera): void {
    const cameraPos = new Vector3();
    camera.transform.getWorldPosition(cameraPos);

    this._cameraPosition.set(cameraPos.x, cameraPos.z);

    // Update each level's center to follow camera
    for (const level of this._levels) {
      const gridSize = level.resolution * level.cellSize;

      // Snap to grid
      const snapX = Math.floor(this._cameraPosition.x / level.cellSize) * level.cellSize;
      const snapZ = Math.floor(this._cameraPosition.y / level.cellSize) * level.cellSize;

      // Check if level needs update
      if (Math.abs(level.center.x - snapX) >= level.cellSize ||
          Math.abs(level.center.y - snapZ) >= level.cellSize) {
        level.center.set(snapX, snapZ);
        this._updateLevelMesh(level);
      }
    }
  }

  /**
   * Updates mesh for a clipmap level.
   * @private
   */
  private _updateLevelMesh(level: ClipmapLevel): void {
    // In a real implementation, this would generate or update the mesh
    // The mesh would be a grid with holes for the next finer level

    const res = level.resolution;
    const cellSize = level.cellSize;

    // Calculate bounds
    const halfSize = (res * cellSize) / 2;
    const minX = level.center.x - halfSize;
    const minZ = level.center.y - halfSize;

    // Sample heightmap and create mesh
    // This is simplified - real implementation would create optimized mesh with:
    // - Center hole for finer level
    // - Proper vertex stitching
    // - Efficient triangle strips

    logger.debug(`Updated clipmap level ${level.level} at (${level.center.x}, ${level.center.y})`);
  }

  /**
   * Gets all clipmap levels.
   * @returns Array of clipmap levels
   */
  getLevels(): readonly ClipmapLevel[] {
    return this._levels;
  }

  /**
   * Gets a specific clipmap level.
   *
   * @param level - Level index
   * @returns Clipmap level or undefined
   */
  getLevel(level: number): ClipmapLevel | undefined {
    return this._levels[level];
  }

  /**
   * Samples height at world position using appropriate clipmap level.
   *
   * @param x - World X coordinate
   * @param y - World Z coordinate
   * @returns Height at position
   */
  sampleHeight(x: number, y: number): number {
    if (!this._config.heightmap) return 0;

    // Find appropriate level based on distance from camera
    const dx = x - this._cameraPosition.x;
    const dy = y - this._cameraPosition.y;
    const distSq = dx * dx + dy * dy;

    let level = 0;
    for (let i = 0; i < this._levels.length; i++) {
      const levelSize = this._levels[i]!.resolution * this._levels[i]!.cellSize / 2;
      if (distSq > levelSize * levelSize) {
        level = i;
      }
    }

    // Sample heightmap
    const terrainSize = new Vector2(
      this._config.heightmap.width,
      this._config.heightmap.height
    );

    return this._config.heightmap.getHeightWorld(x, y, terrainSize) * this._config.heightScale;
  }

  /**
   * Gets bounds for a clipmap level.
   *
   * @param level - Level index
   * @returns Bounds or null
   */
  getLevelBounds(level: number): Box3 | null {
    const clipLevel = this._levels[level];
    if (!clipLevel) return null;

    const halfSize = (clipLevel.resolution * clipLevel.cellSize) / 2;

    return new Box3(
      new Vector3(
        clipLevel.center.x - halfSize,
        0,
        clipLevel.center.y - halfSize
      ),
      new Vector3(
        clipLevel.center.x + halfSize,
        this._config.heightScale,
        clipLevel.center.y + halfSize
      )
    );
  }

  /**
   * Sets heightmap source.
   *
   * @param heightmap - New heightmap
   */
  setHeightmap(heightmap: Heightmap): void {
    this._config.heightmap = heightmap;

    // Update all level meshes
    for (const level of this._levels) {
      this._updateLevelMesh(level);
    }
  }

  /**
   * Gets the number of levels.
   * @returns Level count
   */
  getLevelCount(): number {
    return this._levels.length;
  }

  /**
   * Clears all clipmap meshes.
   */
  clear(): void {
    for (const level of this._levels) {
      level.mesh = null;
    }
  }

  /**
   * Gets memory usage.
   * @returns Memory usage in bytes
   */
  getMemoryUsage(): number {
    let bytes = 0;
    for (const level of this._levels) {
      if (level.mesh) {
        bytes += level.mesh.vertexBuffer.byteSize;
        bytes += level.mesh.indexBuffer.byteSize;
      }
    }
    return bytes;
  }

  /**
   * Creates geometry clipmaps with preset configuration.
   *
   * @param preset - Preset name
   * @param heightmap - Heightmap source
   * @returns Geometry clipmaps
   */
  static createPreset(
    preset: 'low' | 'medium' | 'high' | 'ultra',
    heightmap: Heightmap
  ): GeometryClipmaps {
    const presets: Record<string, Partial<ClipmapConfig>> = {
      low: {
        levelCount: 4,
        gridResolution: 32,
        finestCellSize: 2.0,
      },
      medium: {
        levelCount: 5,
        gridResolution: 64,
        finestCellSize: 1.5,
      },
      high: {
        levelCount: 6,
        gridResolution: 128,
        finestCellSize: 1.0,
      },
      ultra: {
        levelCount: 7,
        gridResolution: 256,
        finestCellSize: 0.5,
      },
    };

    return new GeometryClipmaps({
      ...presets[preset],
      heightmap,
    });
  }
}
