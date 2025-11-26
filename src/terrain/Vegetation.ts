/**
 * Vegetation placement and rendering system for terrain.
 * Supports density-based placement, instancing, and wind animation.
 * @module Vegetation
 */

import { Vector2 } from '../math/Vector2';
import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import { Box3 } from '../math/Box3';
import { Mesh } from '../rendering/geometry/Mesh';
import { Material } from '../rendering/material/Material';
import { Texture } from '../rendering/texture/Texture';
import { Heightmap } from './Heightmap';
import { Logger } from '../core/Logger';

const logger = Logger.create('Vegetation');

/**
 * Vegetation instance data.
 */
export interface VegetationInstance {
  /** Position in world space */
  position: Vector3;
  /** Rotation quaternion */
  rotation: Quaternion;
  /** Scale */
  scale: Vector3;
  /** Layer index */
  layer: number;
  /** Random seed for variation */
  seed: number;
}

/**
 * Vegetation layer properties.
 */
export interface VegetationLayer {
  /** Layer name */
  name: string;
  /** Mesh to instance */
  mesh: Mesh | null;
  /** Material for instances */
  material: Material | null;
  /** Billboard texture (for distant LOD) */
  billboardTexture: Texture | null;
  /** Density (instances per square meter) */
  density: number;
  /** Minimum scale */
  minScale: number;
  /** Maximum scale */
  maxScale: number;
  /** Random rotation */
  randomRotation: boolean;
  /** Align to terrain normal */
  alignToNormal: boolean;
  /** Minimum slope (degrees) for placement */
  minSlope: number;
  /** Maximum slope (degrees) for placement */
  maxSlope: number;
  /** Minimum height for placement */
  minHeight: number;
  /** Maximum height for placement */
  maxHeight: number;
  /** Wind strength (0-1) */
  windStrength: number;
  /** Billboard distance threshold */
  billboardDistance: number;
  /** Cull distance */
  cullDistance: number;
}

/**
 * Vegetation density map.
 */
export class VegetationDensityMap {
  /** Map width */
  readonly width: number;
  /** Map height */
  readonly height: number;
  /** Density data (0-1) */
  private _data: Float32Array;

  /**
   * Creates a density map.
   *
   * @param width - Map width
   * @param height - Map height
   */
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this._data = new Float32Array(width * height);
    this._data.fill(1); // Default to full density
  }

  /**
   * Gets density at position.
   *
   * @param x - X coordinate (0 to width-1)
   * @param y - Y coordinate (0 to height-1)
   * @returns Density value (0-1)
   */
  get(x: number, y: number): number {
    x = Math.floor(x);
    y = Math.floor(y);

    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return 0;
    }

    return this._data[y * this.width + x];
  }

  /**
   * Sets density at position.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param density - Density value (0-1)
   */
  set(x: number, y: number, density: number): void {
    x = Math.floor(x);
    y = Math.floor(y);

    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return;
    }

    this._data[y * this.width + x] = Math.max(0, Math.min(1, density));
  }

  /**
   * Gets interpolated density.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Interpolated density
   */
  sample(x: number, y: number): number {
    x = Math.max(0, Math.min(this.width - 1, x));
    y = Math.max(0, Math.min(this.height - 1, y));

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, this.width - 1);
    const y1 = Math.min(y0 + 1, this.height - 1);

    const fx = x - x0;
    const fy = y - y0;

    const d00 = this.get(x0, y0);
    const d10 = this.get(x1, y0);
    const d01 = this.get(x0, y1);
    const d11 = this.get(x1, y1);

    const d0 = d00 * (1 - fx) + d10 * fx;
    const d1 = d01 * (1 - fx) + d11 * fx;
    return d0 * (1 - fy) + d1 * fy;
  }

  /**
   * Fills entire map with a density value.
   *
   * @param density - Density value (0-1)
   */
  fill(density: number): void {
    this._data.fill(Math.max(0, Math.min(1, density)));
  }
}

/**
 * Vegetation system for terrain.
 * Manages vegetation placement, instancing, and rendering with LOD support.
 *
 * @example
 * ```typescript
 * const vegetation = new Vegetation();
 *
 * // Add grass layer
 * vegetation.addLayer({
 *   name: 'Grass',
 *   mesh: grassMesh,
 *   material: grassMaterial,
 *   density: 10,
 *   minScale: 0.8,
 *   maxScale: 1.2,
 *   windStrength: 0.5,
 *   cullDistance: 100
 * });
 *
 * // Place vegetation on terrain
 * vegetation.place(heightmap, bounds, densityMap);
 *
 * // Update for wind animation
 * vegetation.update(deltaTime);
 * ```
 */
export class Vegetation {
  /** Vegetation layers */
  readonly layers: VegetationLayer[];
  /** Vegetation instances per layer */
  private _instances: Map<number, VegetationInstance[]>;
  /** Instance bounds per layer */
  private _bounds: Map<number, Box3>;
  /** Wind time accumulator */
  private _windTime: number;
  /** Random seed for placement */
  private _seed: number;

  /**
   * Creates a new vegetation system.
   */
  constructor() {
    this.layers = [];
    this._instances = new Map();
    this._bounds = new Map();
    this._windTime = 0;
    this._seed = Math.random() * 10000;
  }

  /**
   * Adds a vegetation layer.
   *
   * @param layer - Layer configuration
   * @returns Layer index
   */
  addLayer(layer: Partial<VegetationLayer>): number {
    const defaultLayer: VegetationLayer = {
      name: layer.name ?? `Layer ${this.layers.length}`,
      mesh: layer.mesh ?? null,
      material: layer.material ?? null,
      billboardTexture: layer.billboardTexture ?? null,
      density: layer.density ?? 1,
      minScale: layer.minScale ?? 0.8,
      maxScale: layer.maxScale ?? 1.2,
      randomRotation: layer.randomRotation ?? true,
      alignToNormal: layer.alignToNormal ?? true,
      minSlope: layer.minSlope ?? 0,
      maxSlope: layer.maxSlope ?? 45,
      minHeight: layer.minHeight ?? -Infinity,
      maxHeight: layer.maxHeight ?? Infinity,
      windStrength: layer.windStrength ?? 0,
      billboardDistance: layer.billboardDistance ?? 100,
      cullDistance: layer.cullDistance ?? 200,
    };

    const index = this.layers.length;
    this.layers.push(defaultLayer);
    this._instances.set(index, []);

    return index;
  }

  /**
   * Removes a layer.
   *
   * @param index - Layer index
   */
  removeLayer(index: number): void {
    if (index >= 0 && index < this.layers.length) {
      this.layers.splice(index, 1);
      this._instances.delete(index);
      this._bounds.delete(index);
    }
  }

  /**
   * Places vegetation on terrain.
   *
   * @param heightmap - Terrain heightmap
   * @param bounds - Placement bounds
   * @param densityMap - Optional density map
   * @param seed - Random seed
   */
  place(
    heightmap: Heightmap,
    bounds: Box3,
    densityMap?: VegetationDensityMap,
    seed?: number
  ): void {
    if (seed !== undefined) {
      this._seed = seed;
    }

    const size = bounds.getSize();
    const min = bounds.min;

    // Clear existing instances
    for (const instances of this._instances.values()) {
      instances.length = 0;
    }

    // Place vegetation for each layer
    for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex++) {
      const layer = this.layers[layerIndex]!;
      const instances: VegetationInstance[] = [];

      // Calculate number of instances
      const area = size.x * size.z;
      const count = Math.floor(area * layer.density);

      logger.info(`Placing ${count} instances for layer ${layer.name}`);

      for (let i = 0; i < count; i++) {
        // Random position in bounds
        const x = min.x + this._random() * size.x;
        const z = min.z + this._random() * size.z;

        // Sample heightmap
        const terrainSize = new Vector2(size.x, size.z);
        const height = heightmap.getHeightWorld(x, z, terrainSize);

        // Check height constraints
        if (height < layer.minHeight || height > layer.maxHeight) {
          continue;
        }

        // Check slope constraints
        const hmX = ((x - min.x) / size.x) * (heightmap.width - 1);
        const hmZ = ((z - min.z) / size.z) * (heightmap.height - 1);
        const normal = heightmap.getNormal(hmX, hmZ);
        const slope = Math.acos(normal.y) * (180 / Math.PI);

        if (slope < layer.minSlope || slope > layer.maxSlope) {
          continue;
        }

        // Check density map
        if (densityMap) {
          const dmX = ((x - min.x) / size.x) * (densityMap.width - 1);
          const dmZ = ((z - min.z) / size.z) * (densityMap.height - 1);
          const density = densityMap.sample(dmX, dmZ);

          if (this._random() > density) {
            continue;
          }
        }

        // Create instance
        const position = new Vector3(x, height, z);

        // Random rotation
        let rotation = new Quaternion();
        if (layer.randomRotation) {
          const angle = this._random() * Math.PI * 2;
          rotation = Quaternion.fromAxisAngle(Vector3.up(), angle);
        }

        // Align to normal if needed
        if (layer.alignToNormal && !layer.randomRotation) {
          const up = Vector3.up();
          rotation = Quaternion.fromUnitVectors(up, normal);
        }

        // Random scale
        const scale = layer.minScale + this._random() * (layer.maxScale - layer.minScale);
        const scaleVec = new Vector3(scale, scale, scale);

        instances.push({
          position,
          rotation,
          scale: scaleVec,
          layer: layerIndex,
          seed: this._random() * 1000,
        });
      }

      this._instances.set(layerIndex, instances);
      this._updateBounds(layerIndex);

      logger.info(`Placed ${instances.length} instances for layer ${layer.name}`);
    }
  }

  /**
   * Gets instances for a layer.
   *
   * @param layer - Layer index
   * @returns Array of instances
   */
  getInstances(layer: number): readonly VegetationInstance[] {
    return this._instances.get(layer) ?? [];
  }

  /**
   * Gets visible instances for a layer within camera frustum.
   *
   * @param layer - Layer index
   * @param cameraPosition - Camera position
   * @param cullDistance - Cull distance override
   * @returns Visible instances
   */
  getVisibleInstances(
    layer: number,
    cameraPosition: Vector3,
    cullDistance?: number
  ): VegetationInstance[] {
    const instances = this._instances.get(layer);
    if (!instances) return [];

    const layerConfig = this.layers[layer]!;
    const maxDist = cullDistance ?? layerConfig.cullDistance;
    const maxDistSq = maxDist * maxDist;

    return instances.filter(instance => {
      const distSq = cameraPosition.distanceToSquared(instance.position);
      return distSq <= maxDistSq;
    });
  }

  /**
   * Updates vegetation (wind animation, etc.).
   *
   * @param deltaTime - Time delta in seconds
   */
  update(deltaTime: number): void {
    this._windTime += deltaTime;
  }

  /**
   * Gets wind parameters for shader.
   *
   * @returns Wind parameters (time, strength)
   */
  getWindParams(): { time: number; strength: number } {
    return {
      time: this._windTime,
      strength: 1.0,
    };
  }

  /**
   * Clears all vegetation instances.
   */
  clear(): void {
    for (const instances of this._instances.values()) {
      instances.length = 0;
    }
    this._bounds.clear();
  }

  /**
   * Gets total instance count across all layers.
   * @returns Total instance count
   */
  getTotalInstanceCount(): number {
    let count = 0;
    for (const instances of this._instances.values()) {
      count += instances.length;
    }
    return count;
  }

  /**
   * Updates bounds for a layer.
   * @private
   */
  private _updateBounds(layer: number): void {
    const instances = this._instances.get(layer);
    if (!instances || instances.length === 0) return;

    const bounds = new Box3();
    for (const instance of instances) {
      bounds.expandByPoint(instance.position);
    }

    this._bounds.set(layer, bounds);
  }

  /**
   * Seeded random number generator.
   * @private
   */
  private _random(): number {
    this._seed = (this._seed * 9301 + 49297) % 233280;
    return this._seed / 233280;
  }

  /**
   * Creates a default grass layer.
   *
   * @param mesh - Grass mesh
   * @param material - Grass material
   * @returns Vegetation layer
   */
  static createGrassLayer(mesh: Mesh | null, material: Material | null): Partial<VegetationLayer> {
    return {
      name: 'Grass',
      mesh,
      material,
      density: 20,
      minScale: 0.8,
      maxScale: 1.2,
      randomRotation: true,
      alignToNormal: false,
      minSlope: 0,
      maxSlope: 30,
      windStrength: 0.8,
      cullDistance: 50,
      billboardDistance: 30,
    };
  }

  /**
   * Creates a default tree layer.
   *
   * @param mesh - Tree mesh
   * @param material - Tree material
   * @returns Vegetation layer
   */
  static createTreeLayer(mesh: Mesh | null, material: Material | null): Partial<VegetationLayer> {
    return {
      name: 'Trees',
      mesh,
      material,
      density: 0.5,
      minScale: 0.9,
      maxScale: 1.3,
      randomRotation: true,
      alignToNormal: false,
      minSlope: 0,
      maxSlope: 35,
      windStrength: 0.3,
      cullDistance: 500,
      billboardDistance: 200,
    };
  }
}
