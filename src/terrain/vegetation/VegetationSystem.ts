/**
 * Advanced vegetation placement and management system.
 * Extends base Vegetation with density maps, frustum culling, and LOD.
 * @module VegetationSystem
 */

import { Vector2 } from '../../math/Vector2';
import { Vector3 } from '../../math/Vector3';
import { Box3 } from '../../math/Box3';
import { Frustum } from '../../math/Frustum';
import { Camera } from '../../rendering/camera/Camera';
import { Vegetation, VegetationInstance, VegetationLayer, VegetationDensityMap } from '../Vegetation';
import { Heightmap } from '../Heightmap';
import { BiomeMap } from '../generation/BiomeGenerator';
import { Logger } from '../../core/Logger';

const logger = Logger.create('VegetationSystem');

/**
 * Vegetation LOD level configuration.
 */
export interface VegetationLODLevel {
  /** Distance threshold */
  distance: number;
  /** Mesh for this LOD (null for billboard/culled) */
  meshLOD: number;
  /** Use billboard at this LOD */
  useBillboard: boolean;
}

/**
 * Vegetation chunk for spatial partitioning.
 */
export interface VegetationChunk {
  /** Chunk bounds */
  bounds: Box3;
  /** Instances in this chunk */
  instances: VegetationInstance[];
  /** Is chunk visible */
  visible: boolean;
  /** Distance to camera */
  distance: number;
}

/**
 * Advanced vegetation system with spatial partitioning and LOD.
 * Manages large-scale vegetation rendering efficiently.
 *
 * @example
 * ```typescript
 * const vegSystem = new VegetationSystem({
 *   chunkSize: 100,
 *   maxVisibleDistance: 500
 * });
 *
 * // Inherit from base vegetation
 * vegSystem.addLayer(grassLayer);
 *
 * // Place vegetation with biome support
 * vegSystem.placeWithBiomes(heightmap, bounds, biomeMap);
 *
 * // Update with camera frustum culling
 * vegSystem.updateWithFrustum(camera, frustum, deltaTime);
 *
 * // Get visible instances for rendering
 * const visibleInstances = vegSystem.getVisibleInstances(0);
 * ```
 */
export class VegetationSystem extends Vegetation {
  private _chunkSize: number;
  private _chunks: Map<string, VegetationChunk>;
  private _lodLevels: Map<number, VegetationLODLevel[]>;
  private _maxVisibleDistance: number;
  private _biomeLayerMapping: Map<number, number>;

  /**
   * Creates a new vegetation system.
   *
   * @param config - System configuration
   */
  constructor(config: {
    chunkSize?: number;
    maxVisibleDistance?: number;
  } = {}) {
    super();

    this._chunkSize = config.chunkSize ?? 100;
    this._maxVisibleDistance = config.maxVisibleDistance ?? 500;
    this._chunks = new Map();
    this._lodLevels = new Map();
    this._biomeLayerMapping = new Map();
  }

  /**
   * Configures LOD levels for a vegetation layer.
   *
   * @param layerIndex - Layer index
   * @param levels - LOD level configurations
   */
  setLODLevels(layerIndex: number, levels: VegetationLODLevel[]): void {
    // Sort by distance
    levels.sort((a, b) => a.distance - b.distance);
    this._lodLevels.set(layerIndex, levels);
  }

  /**
   * Maps biomes to vegetation layers.
   *
   * @param biomeIndex - Biome index
   * @param layerIndex - Layer index to place in this biome
   */
  mapBiomeToLayer(biomeIndex: number, layerIndex: number): void {
    this._biomeLayerMapping.set(biomeIndex, layerIndex);
  }

  /**
   * Places vegetation with biome awareness.
   *
   * @param heightmap - Terrain heightmap
   * @param bounds - Placement bounds
   * @param biomeMap - Biome map
   * @param densityMap - Optional density map
   * @param seed - Random seed
   */
  placeWithBiomes(
    heightmap: Heightmap,
    bounds: Box3,
    biomeMap: BiomeMap,
    densityMap?: VegetationDensityMap,
    seed?: number
  ): void {
    // Use parent class placement
    this.place(heightmap, bounds, densityMap, seed);

    // Build spatial chunks
    this._buildChunks(bounds);

    logger.info(`Built ${this._chunks.size} vegetation chunks`);
  }

  /**
   * Updates vegetation with frustum culling.
   *
   * @param camera - Active camera
   * @param frustum - View frustum
   * @param deltaTime - Time delta
   */
  updateWithFrustum(camera: Camera, frustum: Frustum, deltaTime: number): void {
    // Update base vegetation
    this.update(deltaTime);

    // Update chunk visibility
    const cameraPos = new Vector3();
    camera.transform.getWorldPosition(cameraPos);

    for (const chunk of this._chunks.values()) {
      chunk.distance = cameraPos.distanceTo(chunk.bounds.getCenter());

      // Distance culling
      if (chunk.distance > this._maxVisibleDistance) {
        chunk.visible = false;
        continue;
      }

      // Frustum culling
      chunk.visible = frustum.intersectsBox(chunk.bounds);
    }
  }

  /**
   * Gets visible instances for a layer with LOD selection.
   *
   * @param layerIndex - Layer index
   * @param cameraPosition - Camera position
   * @returns Array of visible instances with LOD info
   */
  getVisibleInstancesWithLOD(
    layerIndex: number,
    cameraPosition: Vector3
  ): Array<{ instance: VegetationInstance; lodLevel: number; useBillboard: boolean }> {
    const result: Array<{ instance: VegetationInstance; lodLevel: number; useBillboard: boolean }> = [];
    const lodLevels = this._lodLevels.get(layerIndex);

    // Get instances from visible chunks
    for (const chunk of this._chunks.values()) {
      if (!chunk.visible) continue;

      for (const instance of chunk.instances) {
        if (instance.layer !== layerIndex) continue;

        const distance = cameraPosition.distanceTo(instance.position);

        // Select LOD level
        let lodLevel = 0;
        let useBillboard = false;

        if (lodLevels) {
          for (const lod of lodLevels) {
            if (distance >= lod.distance) {
              lodLevel = lod.meshLOD;
              useBillboard = lod.useBillboard;
            }
          }
        }

        result.push({ instance, lodLevel, useBillboard });
      }
    }

    return result;
  }

  /**
   * Builds spatial chunks for instances.
   * @private
   */
  private _buildChunks(bounds: Box3): void {
    this._chunks.clear();

    const size = bounds.getSize();
    const chunksX = Math.ceil(size.x / this._chunkSize);
    const chunksZ = Math.ceil(size.z / this._chunkSize);

    // Create chunk grid
    for (let z = 0; z < chunksZ; z++) {
      for (let x = 0; x < chunksX; x++) {
        const chunkMin = new Vector3(
          bounds.min.x + x * this._chunkSize,
          bounds.min.y,
          bounds.min.z + z * this._chunkSize
        );

        const chunkMax = new Vector3(
          Math.min(chunkMin.x + this._chunkSize, bounds.max.x),
          bounds.max.y,
          Math.min(chunkMin.z + this._chunkSize, bounds.max.z)
        );

        const chunkBounds = new Box3(chunkMin, chunkMax);
        const chunk: VegetationChunk = {
          bounds: chunkBounds,
          instances: [],
          visible: false,
          distance: Infinity,
        };

        this._chunks.set(`${x},${z}`, chunk);
      }
    }

    // Distribute instances to chunks
    for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex++) {
      const instances = this.getInstances(layerIndex);

      for (const instance of instances) {
        const chunkX = Math.floor((instance.position.x - bounds.min.x) / this._chunkSize);
        const chunkZ = Math.floor((instance.position.z - bounds.min.z) / this._chunkSize);

        const chunk = this._chunks.get(`${chunkX},${chunkZ}`);
        if (chunk) {
          chunk.instances.push(instance);
        }
      }
    }
  }

  /**
   * Gets all chunks.
   * @returns Map of chunks
   */
  getChunks(): ReadonlyMap<string, VegetationChunk> {
    return this._chunks;
  }

  /**
   * Gets visible chunk count.
   * @returns Number of visible chunks
   */
  getVisibleChunkCount(): number {
    let count = 0;
    for (const chunk of this._chunks.values()) {
      if (chunk.visible) count++;
    }
    return count;
  }

  /**
   * Clears all chunks and vegetation.
   */
  clearAll(): void {
    this.clear();
    this._chunks.clear();
  }

  /**
   * Creates a vegetation system with default LOD configuration.
   *
   * @param preset - Preset name
   * @returns Vegetation system
   */
  static createWithLOD(preset: 'grass' | 'trees'): VegetationSystem {
    const system = new VegetationSystem();

    if (preset === 'grass') {
      const layerIndex = system.addLayer(Vegetation.createGrassLayer(null, null));

      system.setLODLevels(layerIndex, [
        { distance: 0, meshLOD: 0, useBillboard: false },
        { distance: 30, meshLOD: 1, useBillboard: false },
        { distance: 50, meshLOD: 2, useBillboard: true },
      ]);
    } else if (preset === 'trees') {
      const layerIndex = system.addLayer(Vegetation.createTreeLayer(null, null));

      system.setLODLevels(layerIndex, [
        { distance: 0, meshLOD: 0, useBillboard: false },
        { distance: 100, meshLOD: 1, useBillboard: false },
        { distance: 200, meshLOD: 2, useBillboard: true },
        { distance: 400, meshLOD: 3, useBillboard: true },
      ]);
    }

    return system;
  }
}
