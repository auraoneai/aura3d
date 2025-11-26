/**
 * Automatic splatmap generation from terrain data.
 * Creates splatmaps based on height, slope, and biome information.
 * @module SplatMapGenerator
 */

import { Heightmap } from '../Heightmap';
import { Splatmap, SplatmapFormat } from '../Splatmap';
import { BiomeMap } from '../generation/BiomeGenerator';
import { Logger } from '../../core/Logger';

const logger = Logger.create('SplatMapGenerator');

/**
 * Splatmap generation rules.
 */
export interface SplatmapRule {
  /** Target layer index (0-3 for first splatmap, 4-7 for second, etc.) */
  layerIndex: number;
  /** Height range [min, max] (0-1 normalized) */
  heightRange?: [number, number];
  /** Slope range [min, max] in degrees */
  slopeRange?: [number, number];
  /** Biome indices this rule applies to */
  biomes?: number[];
  /** Weight multiplier */
  weight: number;
  /** Blend falloff */
  falloff: number;
}

/**
 * Splatmap generator for automatic terrain texturing.
 * Generates splatmaps from heightmap, slope, and biome data.
 *
 * @example
 * ```typescript
 * const generator = new SplatMapGenerator();
 *
 * // Define rules for layer distribution
 * const rules: SplatmapRule[] = [
 *   {
 *     layerIndex: 0, // Grass
 *     heightRange: [0.3, 0.7],
 *     slopeRange: [0, 30],
 *     weight: 1.0,
 *     falloff: 0.5
 *   },
 *   {
 *     layerIndex: 1, // Rock
 *     slopeRange: [30, 90],
 *     weight: 1.0,
 *     falloff: 0.3
 *   },
 *   {
 *     layerIndex: 2, // Snow
 *     heightRange: [0.8, 1.0],
 *     weight: 1.0,
 *     falloff: 0.4
 *   }
 * ];
 *
 * const splatmap = generator.generate(heightmap, rules);
 * ```
 */
export class SplatMapGenerator {
  /**
   * Generates a splatmap from heightmap using rules.
   *
   * @param heightmap - Terrain heightmap
   * @param rules - Splatmap generation rules
   * @param biomeMap - Optional biome map
   * @returns Generated splatmap
   */
  generate(
    heightmap: Heightmap,
    rules: SplatmapRule[],
    biomeMap?: BiomeMap
  ): Splatmap {
    logger.info('Generating splatmap from heightmap...');

    // Determine number of layers needed
    const maxLayer = Math.max(...rules.map(r => r.layerIndex));
    const layerCount = Math.ceil((maxLayer + 1) / 4) * 4;

    const splatmap = new Splatmap({
      width: heightmap.width,
      height: heightmap.height,
      format: SplatmapFormat.RGBA32F,
      layerCount,
    });

    // Calculate weights for each pixel
    for (let y = 0; y < heightmap.height; y++) {
      for (let x = 0; x < heightmap.width; x++) {
        const weights = this._calculateWeights(
          heightmap,
          x,
          y,
          rules,
          biomeMap
        );
        splatmap.setWeights(x, y, weights);
      }
    }

    // Normalize weights
    splatmap.normalize();

    logger.info('Splatmap generation complete');
    return splatmap;
  }

  /**
   * Calculates layer weights for a position.
   * @private
   */
  private _calculateWeights(
    heightmap: Heightmap,
    x: number,
    y: number,
    rules: SplatmapRule[],
    biomeMap?: BiomeMap
  ): number[] {
    const height = heightmap.getSample(x, y);
    const normalizedHeight =
      (height - heightmap.minHeight) / (heightmap.maxHeight - heightmap.minHeight);

    // Calculate slope
    const normal = heightmap.getNormal(x, y);
    const slope = Math.acos(normal.y) * (180 / Math.PI);

    // Get biome
    const biome = biomeMap?.get(x, y);

    // Calculate weights for each rule
    const maxLayer = Math.max(...rules.map(r => r.layerIndex));
    const weights = new Array(maxLayer + 1).fill(0);

    for (const rule of rules) {
      // Check biome filter
      if (rule.biomes && biome !== undefined) {
        if (!rule.biomes.includes(biome)) {
          continue;
        }
      }

      let weight = rule.weight;

      // Apply height filter
      if (rule.heightRange) {
        const [min, max] = rule.heightRange;
        if (normalizedHeight < min || normalizedHeight > max) {
          weight = 0;
        } else {
          // Apply falloff at edges
          const range = max - min;
          const distFromMin = (normalizedHeight - min) / (range * rule.falloff);
          const distFromMax = (max - normalizedHeight) / (range * rule.falloff);

          const edgeFalloff = Math.min(
            Math.min(distFromMin, 1),
            Math.min(distFromMax, 1)
          );
          weight *= edgeFalloff;
        }
      }

      // Apply slope filter
      if (rule.slopeRange) {
        const [min, max] = rule.slopeRange;
        if (slope < min || slope > max) {
          weight = 0;
        } else {
          // Apply falloff at edges
          const range = max - min;
          const distFromMin = (slope - min) / (range * rule.falloff);
          const distFromMax = (max - slope) / (range * rule.falloff);

          const edgeFalloff = Math.min(
            Math.min(distFromMin, 1),
            Math.min(distFromMax, 1)
          );
          weight *= edgeFalloff;
        }
      }

      weights[rule.layerIndex] = Math.max(weights[rule.layerIndex], weight);
    }

    return weights;
  }

  /**
   * Generates a splatmap from biomes.
   *
   * @param heightmap - Terrain heightmap
   * @param biomeMap - Biome map
   * @param biomeToLayer - Mapping from biome index to layer index
   * @returns Generated splatmap
   */
  generateFromBiomes(
    heightmap: Heightmap,
    biomeMap: BiomeMap,
    biomeToLayer: Map<number, number>
  ): Splatmap {
    logger.info('Generating splatmap from biomes...');

    const maxLayer = Math.max(...Array.from(biomeToLayer.values()));
    const layerCount = Math.ceil((maxLayer + 1) / 4) * 4;

    const splatmap = new Splatmap({
      width: heightmap.width,
      height: heightmap.height,
      format: SplatmapFormat.RGBA32F,
      layerCount,
    });

    for (let y = 0; y < heightmap.height; y++) {
      for (let x = 0; x < heightmap.width; x++) {
        const biome = biomeMap.get(x, y);
        const layer = biomeToLayer.get(biome) ?? 0;

        const weights = new Array(layerCount).fill(0);
        weights[layer] = 1.0;

        splatmap.setWeights(x, y, weights);
      }
    }

    logger.info('Biome-based splatmap generation complete');
    return splatmap;
  }

  /**
   * Blends multiple splatmaps together.
   *
   * @param splatmaps - Splatmaps to blend
   * @param weights - Blend weights for each splatmap
   * @returns Blended splatmap
   */
  blendSplatmaps(splatmaps: Splatmap[], weights: number[]): Splatmap {
    if (splatmaps.length === 0) {
      throw new Error('No splatmaps to blend');
    }

    if (splatmaps.length !== weights.length) {
      throw new Error('Splatmap and weight count mismatch');
    }

    const result = splatmaps[0]!.clone();

    for (let y = 0; y < result.height; y++) {
      for (let x = 0; x < result.width; x++) {
        const blended = new Array(result.layerCount).fill(0);

        for (let i = 0; i < splatmaps.length; i++) {
          const splatWeights = splatmaps[i]!.getWeightsAt(x, y);
          const blendWeight = weights[i]!;

          for (let j = 0; j < blended.length && j < splatWeights.length; j++) {
            blended[j]! += splatWeights[j]! * blendWeight;
          }
        }

        result.setWeights(x, y, blended);
      }
    }

    result.normalize();
    return result;
  }

  /**
   * Creates default splatmap rules for common terrain.
   *
   * @param preset - Preset name
   * @returns Array of splatmap rules
   */
  static createDefaultRules(preset: 'standard' | 'mountain' | 'island'): SplatmapRule[] {
    const presets: Record<string, SplatmapRule[]> = {
      standard: [
        {
          layerIndex: 0,
          heightRange: [0, 0.4],
          slopeRange: [0, 30],
          weight: 1.0,
          falloff: 0.2,
        },
        {
          layerIndex: 1,
          heightRange: [0.3, 0.8],
          slopeRange: [0, 25],
          weight: 1.0,
          falloff: 0.3,
        },
        {
          layerIndex: 2,
          slopeRange: [25, 90],
          weight: 1.0,
          falloff: 0.2,
        },
        {
          layerIndex: 3,
          heightRange: [0.75, 1.0],
          weight: 1.0,
          falloff: 0.15,
        },
      ],
      mountain: [
        {
          layerIndex: 0,
          heightRange: [0, 0.3],
          weight: 1.0,
          falloff: 0.2,
        },
        {
          layerIndex: 1,
          heightRange: [0.2, 0.6],
          slopeRange: [0, 35],
          weight: 1.0,
          falloff: 0.3,
        },
        {
          layerIndex: 2,
          slopeRange: [30, 90],
          weight: 1.0,
          falloff: 0.15,
        },
        {
          layerIndex: 3,
          heightRange: [0.7, 1.0],
          weight: 1.0,
          falloff: 0.2,
        },
      ],
      island: [
        {
          layerIndex: 0,
          heightRange: [0, 0.35],
          weight: 1.0,
          falloff: 0.1,
        },
        {
          layerIndex: 1,
          heightRange: [0.32, 0.38],
          weight: 1.0,
          falloff: 0.5,
        },
        {
          layerIndex: 2,
          heightRange: [0.35, 0.8],
          slopeRange: [0, 30],
          weight: 1.0,
          falloff: 0.3,
        },
        {
          layerIndex: 3,
          slopeRange: [25, 90],
          weight: 1.0,
          falloff: 0.2,
        },
      ],
    };

    return presets[preset] ?? presets.standard;
  }
}
