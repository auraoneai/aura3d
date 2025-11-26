/**
 * Main terrain class integrating all terrain subsystems.
 * Manages chunks, materials, vegetation, and provides high-level terrain API.
 * @module Terrain
 */

import { Vector2 } from '../math/Vector2';
import { Vector3 } from '../math/Vector3';
import { Box3 } from '../math/Box3';
import { Heightmap } from './Heightmap';
import { TerrainChunk, TerrainChunkDescriptor } from './TerrainChunk';
import { TerrainLOD } from './TerrainLOD';
import { TerrainQuadtree } from './TerrainQuadtree';
import { TerrainMaterial } from './TerrainMaterial';
import { Splatmap } from './Splatmap';
import { Vegetation } from './Vegetation';
import { TerrainCollision } from './TerrainCollision';
import { Camera } from '../rendering/camera/Camera';
import { Frustum } from '../math/Frustum';
import { Logger } from '../core/Logger';
import { ISerializable, JSONObject } from '../types';

const logger = Logger.create('Terrain');

/**
 * Terrain configuration.
 */
export interface TerrainConfig {
  /** Terrain size in world units */
  size: Vector2;
  /** World position (min corner) */
  position: Vector3;
  /** Heightmap resolution (power of 2 + 1) */
  heightmapResolution: number;
  /** Chunk size in world units */
  chunkSize: number;
  /** Chunk vertex resolution (power of 2 + 1) */
  chunkResolution: number;
  /** Height scale factor */
  heightScale: number;
  /** Enable collision */
  enableCollision: boolean;
  /** Enable vegetation */
  enableVegetation: boolean;
}

/**
 * Terrain serialization data.
 */
export interface TerrainData extends JSONObject {
  /** Configuration */
  config: TerrainConfig;
  /** Heightmap data */
  heightmap: {
    width: number;
    height: number;
    data: number[];
    minHeight: number;
    maxHeight: number;
  };
  /** Splatmap data (optional) */
  splatmaps?: Array<{
    width: number;
    height: number;
    data: number[];
  }>;
}

/**
 * Main terrain class.
 * Integrates heightmap, chunks, LOD, materials, vegetation, and collision.
 *
 * @example
 * ```typescript
 * // Create terrain
 * const terrain = new Terrain({
 *   size: new Vector2(1000, 1000),
 *   position: new Vector3(0, 0, 0),
 *   heightmapResolution: 513,
 *   chunkSize: 100,
 *   chunkResolution: 65,
 *   heightScale: 100,
 *   enableCollision: true,
 *   enableVegetation: true
 * });
 *
 * // Load heightmap
 * const heightmap = await Heightmap.fromImage('terrain.png');
 * terrain.setHeightmap(heightmap);
 *
 * // Set material
 * const material = new TerrainMaterial();
 * terrain.setMaterial(material);
 *
 * // Build terrain chunks
 * terrain.build();
 *
 * // Update each frame
 * terrain.update(camera, frustum, deltaTime);
 *
 * // Get visible chunks for rendering
 * const chunks = terrain.getVisibleChunks();
 * ```
 */
export class Terrain implements ISerializable<TerrainData> {
  /** Terrain configuration */
  readonly config: TerrainConfig;
  /** Heightmap */
  private _heightmap: Heightmap | null;
  /** Terrain material */
  private _material: TerrainMaterial | null;
  /** Splatmaps */
  private _splatmaps: Splatmap[];
  /** LOD manager */
  private _lodManager: TerrainLOD;
  /** Quadtree for chunk management */
  private _quadtree: TerrainQuadtree;
  /** Terrain chunks */
  private _chunks: Map<string, TerrainChunk>;
  /** Vegetation system */
  private _vegetation: Vegetation | null;
  /** Collision system */
  private _collision: TerrainCollision | null;
  /** Terrain bounds */
  private _bounds: Box3;
  /** Is terrain built */
  private _built: boolean;

  /**
   * Creates a new terrain.
   *
   * @param config - Terrain configuration
   */
  constructor(config: Partial<TerrainConfig> = {}) {
    this.config = {
      size: config.size ?? new Vector2(1000, 1000),
      position: config.position ?? new Vector3(0, 0, 0),
      heightmapResolution: config.heightmapResolution ?? 513,
      chunkSize: config.chunkSize ?? 100,
      chunkResolution: config.chunkResolution ?? 65,
      heightScale: config.heightScale ?? 100,
      enableCollision: config.enableCollision ?? true,
      enableVegetation: config.enableVegetation ?? false,
    };

    this._heightmap = null;
    this._material = null;
    this._splatmaps = [];
    this._lodManager = TerrainLOD.createPreset('high');
    this._quadtree = new TerrainQuadtree({
      maxDepth: 6,
      minChunkSize: this.config.chunkSize,
      maxLoadedChunks: 64,
      frustumCulling: true,
      unloadDistance: 2000,
    });
    this._chunks = new Map();
    this._vegetation = config.enableVegetation ? new Vegetation() : null;
    this._collision = null;
    this._built = false;

    this._updateBounds();
  }

  /**
   * Gets the heightmap.
   * @returns Heightmap or null
   */
  get heightmap(): Heightmap | null {
    return this._heightmap;
  }

  /**
   * Gets the material.
   * @returns Material or null
   */
  get material(): TerrainMaterial | null {
    return this._material;
  }

  /**
   * Gets the vegetation system.
   * @returns Vegetation or null
   */
  get vegetation(): Vegetation | null {
    return this._vegetation;
  }

  /**
   * Gets the collision system.
   * @returns Collision system or null
   */
  get collision(): TerrainCollision | null {
    return this._collision;
  }

  /**
   * Gets the LOD manager.
   * @returns LOD manager
   */
  get lodManager(): TerrainLOD {
    return this._lodManager;
  }

  /**
   * Gets the terrain bounds.
   * @returns Bounding box
   */
  get bounds(): Box3 {
    return this._bounds;
  }

  /**
   * Gets whether terrain is built.
   * @returns True if built
   */
  get isBuilt(): boolean {
    return this._built;
  }

  /**
   * Sets the heightmap.
   *
   * @param heightmap - Heightmap to set
   */
  setHeightmap(heightmap: Heightmap): void {
    this._heightmap = heightmap;

    // Update collision
    if (this.config.enableCollision) {
      this._collision = new TerrainCollision({
        heightmap,
        terrainSize: this.config.size,
        terrainPosition: this.config.position,
        heightScale: this.config.heightScale,
      });
    }

    // Rebuild if already built
    if (this._built) {
      this.build();
    }
  }

  /**
   * Sets the terrain material.
   *
   * @param material - Material to set
   */
  setMaterial(material: TerrainMaterial): void {
    this._material = material;
  }

  /**
   * Adds a splatmap.
   *
   * @param splatmap - Splatmap to add
   * @returns Splatmap index
   */
  addSplatmap(splatmap: Splatmap): number {
    const index = this._splatmaps.length;
    this._splatmaps.push(splatmap);

    // Update material if present
    if (this._material) {
      this._material.setSplatmap(index, splatmap);
    }

    return index;
  }

  /**
   * Sets the LOD manager.
   *
   * @param lodManager - LOD manager
   */
  setLODManager(lodManager: TerrainLOD): void {
    this._lodManager = lodManager;
  }

  /**
   * Builds the terrain chunks and quadtree.
   */
  build(): void {
    if (!this._heightmap) {
      logger.error('Cannot build terrain without heightmap');
      return;
    }

    logger.info('Building terrain...');

    // Clear existing chunks
    this._chunks.clear();
    this._quadtree.clear();

    // Build quadtree
    this._quadtree.build(this._bounds, this._lodManager);

    // Generate chunks for each leaf node
    const leaves = this._quadtree.leaves;
    const chunksPerSide = Math.ceil(this.config.size.x / this.config.chunkSize);

    for (const leaf of leaves) {
      const gridX = Math.floor(leaf.gridPosition.x);
      const gridY = Math.floor(leaf.gridPosition.y);

      // Calculate heightmap offset for this chunk
      const hmOffsetX = (gridX / chunksPerSide) * (this._heightmap.width - 1);
      const hmOffsetY = (gridY / chunksPerSide) * (this._heightmap.height - 1);

      // Create chunk descriptor
      const descriptor: TerrainChunkDescriptor = {
        gridPosition: new Vector2(gridX, gridY),
        size: new Vector2(this.config.chunkSize, this.config.chunkSize),
        resolution: this.config.chunkResolution,
        heightmap: this._heightmap,
        heightmapOffset: new Vector2(hmOffsetX, hmOffsetY),
        heightScale: this.config.heightScale,
      };

      // Create chunk
      const chunk = new TerrainChunk(descriptor);
      const key = `${gridX},${gridY}`;
      this._chunks.set(key, chunk);

      // Load chunk into quadtree
      this._quadtree.loadChunk(leaf, chunk);
    }

    logger.info(`Built terrain with ${this._chunks.size} chunks`);

    // Place vegetation if enabled
    if (this._vegetation && this._heightmap) {
      this._vegetation.place(this._heightmap, this._bounds);
    }

    this._built = true;
  }

  /**
   * Updates the terrain for the current frame.
   *
   * @param camera - Active camera
   * @param frustum - View frustum
   * @param deltaTime - Time delta
   */
  update(camera: Camera, frustum: Frustum, deltaTime: number): void {
    if (!this._built) return;

    // Update quadtree (visibility and LOD)
    this._quadtree.update(camera, frustum);

    // Update vegetation
    if (this._vegetation) {
      this._vegetation.update(deltaTime);
    }
  }

  /**
   * Gets visible chunks for rendering.
   *
   * @returns Array of visible chunks with LOD levels
   */
  getVisibleChunks(): Array<{ chunk: TerrainChunk; lodLevel: number }> {
    const result: Array<{ chunk: TerrainChunk; lodLevel: number }> = [];

    for (const leaf of this._quadtree.leaves) {
      if (leaf.visible && leaf.chunk) {
        result.push({
          chunk: leaf.chunk,
          lodLevel: leaf.lodLevel,
        });
      }
    }

    return result;
  }

  /**
   * Gets the height at a world position.
   *
   * @param worldX - World X coordinate
   * @param worldZ - World Z coordinate
   * @returns Height or 0 if no collision
   */
  getHeight(worldX: number, worldZ: number): number {
    if (this._collision) {
      return this._collision.getHeight(worldX, worldZ);
    }

    if (this._heightmap) {
      const localX = worldX - this.config.position.x;
      const localZ = worldZ - this.config.position.z;
      const height = this._heightmap.getHeightWorld(localX, localZ, this.config.size);
      return this.config.position.y + height * this.config.heightScale;
    }

    return 0;
  }

  /**
   * Gets the normal at a world position.
   *
   * @param worldX - World X coordinate
   * @param worldZ - World Z coordinate
   * @returns Normal vector
   */
  getNormal(worldX: number, worldZ: number): Vector3 {
    if (this._collision) {
      return this._collision.getNormal(worldX, worldZ);
    }

    return Vector3.up();
  }

  /**
   * Clamps a point to the terrain surface.
   *
   * @param point - Point to clamp
   * @param offset - Height offset
   * @returns Clamped point
   */
  clampToTerrain(point: Vector3, offset: number = 0): Vector3 {
    if (this._collision) {
      return this._collision.clampToTerrain(point, offset);
    }

    const height = this.getHeight(point.x, point.z);
    return new Vector3(point.x, height + offset, point.z);
  }

  /**
   * Gets a chunk by grid position.
   *
   * @param gridX - Grid X coordinate
   * @param gridY - Grid Y coordinate
   * @returns Chunk or undefined
   */
  getChunk(gridX: number, gridY: number): TerrainChunk | undefined {
    return this._chunks.get(`${gridX},${gridY}`);
  }

  /**
   * Gets all chunks.
   * @returns Map of chunks
   */
  getAllChunks(): ReadonlyMap<string, TerrainChunk> {
    return this._chunks;
  }

  /**
   * Gets memory usage in bytes.
   * @returns Memory usage
   */
  getMemoryUsage(): number {
    let bytes = 0;

    // Heightmap
    if (this._heightmap) {
      bytes += this._heightmap.width * this._heightmap.height * 4; // Float32
    }

    // Splatmaps
    for (const splatmap of this._splatmaps) {
      bytes += splatmap.width * splatmap.height * 4 * 4; // RGBA Float32
    }

    // Chunks
    bytes += this._quadtree.getMemoryUsage();

    return bytes;
  }

  /**
   * Clears all terrain data.
   */
  clear(): void {
    this._chunks.clear();
    this._quadtree.clear();
    if (this._vegetation) {
      this._vegetation.clear();
    }
    this._built = false;
  }

  /**
   * Serializes terrain to JSON.
   * @returns JSON representation
   */
  toJSON(): TerrainData {
    const data: TerrainData = {
      config: { ...this.config },
      heightmap: {
        width: 0,
        height: 0,
        data: [],
        minHeight: 0,
        maxHeight: 0,
      },
    };

    if (this._heightmap) {
      data.heightmap = {
        width: this._heightmap.width,
        height: this._heightmap.height,
        data: Array.from(this._heightmap.data),
        minHeight: this._heightmap.minHeight,
        maxHeight: this._heightmap.maxHeight,
      };
    }

    if (this._splatmaps.length > 0) {
      data.splatmaps = this._splatmaps.map(splatmap => ({
        width: splatmap.width,
        height: splatmap.height,
        data: Array.from(splatmap.getData()),
      }));
    }

    return data;
  }

  /**
   * Updates terrain bounds.
   * @private
   */
  private _updateBounds(): void {
    const minHeight = this._heightmap?.minHeight ?? 0;
    const maxHeight = this._heightmap?.maxHeight ?? 1;

    this._bounds = new Box3(
      new Vector3(
        this.config.position.x,
        this.config.position.y + minHeight * this.config.heightScale,
        this.config.position.z
      ),
      new Vector3(
        this.config.position.x + this.config.size.x,
        this.config.position.y + maxHeight * this.config.heightScale,
        this.config.position.z + this.config.size.y
      )
    );
  }

  /**
   * Creates terrain from serialized data.
   *
   * @param data - Serialized terrain data
   * @returns Terrain instance
   */
  static fromJSON(data: TerrainData): Terrain {
    const terrain = new Terrain(data.config);

    // Restore heightmap
    if (data.heightmap) {
      const heightmap = new Heightmap({
        width: data.heightmap.width,
        height: data.heightmap.height,
        data: new Float32Array(data.heightmap.data),
        minHeight: data.heightmap.minHeight,
        maxHeight: data.heightmap.maxHeight,
      });
      terrain.setHeightmap(heightmap);
    }

    // Restore splatmaps
    if (data.splatmaps) {
      for (const splatData of data.splatmaps) {
        const splatmap = new Splatmap({
          width: splatData.width,
          height: splatData.height,
          data: new Float32Array(splatData.data),
        });
        terrain.addSplatmap(splatmap);
      }
    }

    return terrain;
  }

  /**
   * Creates a flat terrain with specified dimensions.
   *
   * @param size - Terrain size
   * @param chunkSize - Chunk size
   * @param elevation - Elevation height
   * @returns Terrain instance
   */
  static createFlat(
    size: Vector2 = new Vector2(1000, 1000),
    chunkSize: number = 100,
    elevation: number = 0
  ): Terrain {
    const terrain = new Terrain({
      size,
      chunkSize,
      heightmapResolution: 513,
      chunkResolution: 65,
      heightScale: 1,
    });

    const heightmap = Heightmap.flat(513, 513, elevation);
    terrain.setHeightmap(heightmap);
    terrain.build();

    return terrain;
  }
}
