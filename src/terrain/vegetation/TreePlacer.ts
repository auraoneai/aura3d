/**
 * Tree distribution and placement with density maps.
 * Handles natural-looking tree placement with spacing rules.
 * @module TreePlacer
 */

import { Vector2 } from '../../math/Vector2';
import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { Box3 } from '../../math/Box3';
import { Heightmap } from '../Heightmap';
import { VegetationInstance } from '../Vegetation';
import { VegetationDensityMap } from '../Vegetation';
import { BiomeMap } from '../generation/BiomeGenerator';
import { Logger } from '../../core/Logger';

const logger = Logger.create('TreePlacer');

/**
 * Tree placement rules.
 */
export interface TreePlacementRules {
  /** Trees per square unit */
  density: number;
  /** Minimum distance between trees */
  minSpacing: number;
  /** Maximum distance between trees */
  maxSpacing: number;
  /** Minimum height for placement */
  minHeight: number;
  /** Maximum height for placement */
  maxHeight: number;
  /** Minimum slope (degrees) */
  minSlope: number;
  /** Maximum slope (degrees) */
  maxSlope: number;
  /** Minimum scale */
  minScale: number;
  /** Maximum scale */
  maxScale: number;
  /** Cluster tendency (0-1, higher = more clustered) */
  clusterTendency: number;
  /** Biomes where this tree type can appear */
  allowedBiomes?: number[];
}

/**
 * Tree placer for realistic tree distribution.
 * Uses Poisson disk sampling and clustering for natural placement.
 *
 * @example
 * ```typescript
 * const placer = new TreePlacer({
 *   density: 0.01,
 *   minSpacing: 5,
 *   maxSpacing: 15,
 *   minHeight: 10,
 *   maxHeight: 80,
 *   maxSlope: 35,
 *   clusterTendency: 0.3
 * });
 *
 * const trees = placer.place(heightmap, bounds, densityMap);
 * ```
 */
export class TreePlacer {
  private _rules: TreePlacementRules;
  private _random: number;

  /**
   * Creates a new tree placer.
   *
   * @param rules - Placement rules
   */
  constructor(rules: Partial<TreePlacementRules> = {}) {
    this._rules = {
      density: rules.density ?? 0.01,
      minSpacing: rules.minSpacing ?? 5,
      maxSpacing: rules.maxSpacing ?? 15,
      minHeight: rules.minHeight ?? -Infinity,
      maxHeight: rules.maxHeight ?? Infinity,
      minSlope: rules.minSlope ?? 0,
      maxSlope: rules.maxSlope ?? 30,
      minScale: rules.minScale ?? 0.8,
      maxScale: rules.maxScale ?? 1.2,
      clusterTendency: rules.clusterTendency ?? 0.3,
      allowedBiomes: rules.allowedBiomes,
    };

    this._random = Math.random() * 10000;
  }

  /**
   * Places trees on terrain.
   *
   * @param heightmap - Terrain heightmap
   * @param bounds - Placement bounds
   * @param densityMap - Optional density map
   * @param biomeMap - Optional biome map
   * @param seed - Random seed
   * @returns Array of tree instances
   */
  place(
    heightmap: Heightmap,
    bounds: Box3,
    densityMap?: VegetationDensityMap,
    biomeMap?: BiomeMap,
    seed?: number
  ): VegetationInstance[] {
    if (seed !== undefined) {
      this._random = seed;
    }

    logger.info('Placing trees...');

    const size = bounds.getSize();
    const min = bounds.min;

    // Use Poisson disk sampling for natural spacing
    const instances = this._poissonDiskSampling(
      new Vector2(size.x, size.z),
      this._rules.minSpacing,
      this._rules.maxSpacing
    );

    const result: VegetationInstance[] = [];

    for (const point of instances) {
      const worldX = min.x + point.x;
      const worldZ = min.z + point.y;

      // Sample heightmap
      const terrainSize = new Vector2(size.x, size.z);
      const height = heightmap.getHeightWorld(worldX, worldZ, terrainSize);

      // Check height constraints
      if (height < this._rules.minHeight || height > this._rules.maxHeight) {
        continue;
      }

      // Check slope
      const hmX = (point.x / size.x) * (heightmap.width - 1);
      const hmZ = (point.y / size.z) * (heightmap.height - 1);
      const normal = heightmap.getNormal(hmX, hmZ);
      const slope = Math.acos(normal.y) * (180 / Math.PI);

      if (slope < this._rules.minSlope || slope > this._rules.maxSlope) {
        continue;
      }

      // Check biome
      if (this._rules.allowedBiomes && biomeMap) {
        const biome = biomeMap.get(Math.floor(hmX), Math.floor(hmZ));
        if (!this._rules.allowedBiomes.includes(biome)) {
          continue;
        }
      }

      // Check density map
      if (densityMap) {
        const dmX = (point.x / size.x) * (densityMap.width - 1);
        const dmZ = (point.y / size.z) * (densityMap.height - 1);
        const density = densityMap.sample(dmX, dmZ);

        if (this._randomFloat() > density) {
          continue;
        }
      }

      // Create instance
      const position = new Vector3(worldX, height, worldZ);

      // Random rotation
      const angle = this._randomFloat() * Math.PI * 2;
      const rotation = Quaternion.fromAxisAngle(Vector3.up(), angle);

      // Random scale
      const scale = this._rules.minScale + this._randomFloat() * (this._rules.maxScale - this._rules.minScale);
      const scaleVec = new Vector3(scale, scale, scale);

      result.push({
        position,
        rotation,
        scale: scaleVec,
        layer: 0,
        seed: this._randomFloat() * 1000,
      });
    }

    logger.info(`Placed ${result.length} trees`);
    return result;
  }

  /**
   * Poisson disk sampling for evenly distributed points.
   * @private
   */
  private _poissonDiskSampling(
    size: Vector2,
    minDist: number,
    maxDist: number
  ): Vector2[] {
    const cellSize = minDist / Math.sqrt(2);
    const gridW = Math.ceil(size.x / cellSize);
    const gridH = Math.ceil(size.y / cellSize);

    const grid: Array<Vector2 | null> = new Array(gridW * gridH).fill(null);
    const active: Vector2[] = [];
    const points: Vector2[] = [];

    // Start with random point
    const firstPoint = new Vector2(
      this._randomFloat() * size.x,
      this._randomFloat() * size.y
    );

    points.push(firstPoint);
    active.push(firstPoint);

    const gridX = Math.floor(firstPoint.x / cellSize);
    const gridY = Math.floor(firstPoint.y / cellSize);
    grid[gridY * gridW + gridX] = firstPoint;

    while (active.length > 0) {
      const randomIndex = Math.floor(this._randomFloat() * active.length);
      const point = active[randomIndex];

      let found = false;

      // Try to place new points around this point
      for (let i = 0; i < 30; i++) {
        // Use cluster tendency to vary distance
        const useCluster = this._randomFloat() < this._rules.clusterTendency;
        const dist = useCluster
          ? minDist + this._randomFloat() * (minDist * 0.5)
          : minDist + this._randomFloat() * (maxDist - minDist);

        const angle = this._randomFloat() * Math.PI * 2;
        const newPoint = new Vector2(
          point!.x + Math.cos(angle) * dist,
          point!.y + Math.sin(angle) * dist
        );

        // Check bounds
        if (newPoint.x < 0 || newPoint.x >= size.x || newPoint.y < 0 || newPoint.y >= size.y) {
          continue;
        }

        // Check distance to nearby points
        const gx = Math.floor(newPoint.x / cellSize);
        const gy = Math.floor(newPoint.y / cellSize);

        let tooClose = false;

        for (let dy = -2; dy <= 2 && !tooClose; dy++) {
          for (let dx = -2; dx <= 2 && !tooClose; dx++) {
            const nx = gx + dx;
            const ny = gy + dy;

            if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
              const neighbor = grid[ny * gridW + nx];
              if (neighbor) {
                const d = Math.sqrt(
                  Math.pow(newPoint.x - neighbor.x, 2) +
                  Math.pow(newPoint.y - neighbor.y, 2)
                );
                if (d < minDist) {
                  tooClose = true;
                }
              }
            }
          }
        }

        if (!tooClose) {
          points.push(newPoint);
          active.push(newPoint);
          grid[gy * gridW + gx] = newPoint;
          found = true;
          break;
        }
      }

      if (!found) {
        active.splice(randomIndex, 1);
      }
    }

    return points;
  }

  /**
   * Random float generator.
   * @private
   */
  private _randomFloat(): number {
    this._random = (this._random * 9301 + 49297) % 233280;
    return this._random / 233280;
  }

  /**
   * Creates default tree placement rules.
   *
   * @param preset - Preset name
   * @returns Tree placer
   */
  static createPreset(preset: 'forest' | 'sparse' | 'dense'): TreePlacer {
    const presets: Record<string, Partial<TreePlacementRules>> = {
      forest: {
        density: 0.02,
        minSpacing: 4,
        maxSpacing: 10,
        maxSlope: 35,
        clusterTendency: 0.4,
      },
      sparse: {
        density: 0.005,
        minSpacing: 10,
        maxSpacing: 30,
        maxSlope: 25,
        clusterTendency: 0.2,
      },
      dense: {
        density: 0.05,
        minSpacing: 2,
        maxSpacing: 6,
        maxSlope: 30,
        clusterTendency: 0.6,
      },
    };

    return new TreePlacer(presets[preset]);
  }
}
