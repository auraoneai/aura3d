/**
 * Procedural terrain generation orchestrator.
 * Combines noise, erosion, biomes, and rivers into complete terrain.
 * @module TerrainGenerator
 */

import { Heightmap, HeightmapFormat } from '../Heightmap';
import { NoiseGenerator, NoiseType } from './NoiseGenerator';
import { ErosionSimulator } from './ErosionSimulator';
import { BiomeGenerator, BiomeMap } from './BiomeGenerator';
import { RiverGenerator, RiverPath } from './RiverGenerator';
import { Logger } from '../../core/Logger';

const logger = Logger.create('TerrainGenerator');

/**
 * Terrain generation configuration.
 */
export interface TerrainGeneratorConfig {
  /** Heightmap dimensions */
  width: number;
  height: number;
  /** Random seed */
  seed: number;
  /** Base noise configuration */
  baseNoise: {
    type: NoiseType;
    frequency: number;
    octaves: number;
    lacunarity: number;
    persistence: number;
    amplitude: number;
  };
  /** Detail noise configuration */
  detailNoise?: {
    type: NoiseType;
    frequency: number;
    octaves: number;
    amplitude: number;
  };
  /** Enable erosion */
  enableErosion: boolean;
  /** Erosion iterations */
  erosionIterations?: number;
  /** Enable biomes */
  enableBiomes: boolean;
  /** Enable rivers */
  enableRivers: boolean;
  /** Number of rivers */
  riverCount?: number;
  /** Minimum height */
  minHeight: number;
  /** Maximum height */
  maxHeight: number;
}

/**
 * Generated terrain result.
 */
export interface GeneratedTerrain {
  /** Terrain heightmap */
  heightmap: Heightmap;
  /** Biome map (if enabled) */
  biomeMap?: BiomeMap;
  /** River paths (if enabled) */
  rivers?: RiverPath[];
}

/**
 * Procedural terrain generator.
 * Orchestrates all terrain generation steps to create complete, realistic terrain.
 *
 * @example
 * ```typescript
 * const generator = new TerrainGenerator({
 *   width: 513,
 *   height: 513,
 *   seed: 12345,
 *   baseNoise: {
 *     type: NoiseType.Perlin,
 *     frequency: 0.005,
 *     octaves: 6,
 *     lacunarity: 2.0,
 *     persistence: 0.5,
 *     amplitude: 100
 *   },
 *   enableErosion: true,
 *   enableBiomes: true,
 *   enableRivers: true,
 *   minHeight: 0,
 *   maxHeight: 100
 * });
 *
 * const terrain = generator.generate();
 * ```
 */
export class TerrainGenerator {
  private _config: TerrainGeneratorConfig;
  private _baseNoise: NoiseGenerator;
  private _detailNoise: NoiseGenerator | null;
  private _erosion: ErosionSimulator;
  private _biomeGen: BiomeGenerator;
  private _riverGen: RiverGenerator;

  /**
   * Creates a new terrain generator.
   *
   * @param config - Generator configuration
   */
  constructor(config: Partial<TerrainGeneratorConfig> = {}) {
    this._config = {
      width: config.width ?? 513,
      height: config.height ?? 513,
      seed: config.seed ?? Math.floor(Math.random() * 10000),
      baseNoise: config.baseNoise ?? {
        type: NoiseType.Perlin,
        frequency: 0.005,
        octaves: 6,
        lacunarity: 2.0,
        persistence: 0.5,
        amplitude: 100,
      },
      detailNoise: config.detailNoise,
      enableErosion: config.enableErosion ?? true,
      erosionIterations: config.erosionIterations ?? 50000,
      enableBiomes: config.enableBiomes ?? false,
      enableRivers: config.enableRivers ?? false,
      riverCount: config.riverCount ?? 5,
      minHeight: config.minHeight ?? 0,
      maxHeight: config.maxHeight ?? 100,
    };

    this._baseNoise = new NoiseGenerator({
      ...this._config.baseNoise,
      seed: this._config.seed,
    });

    this._detailNoise = this._config.detailNoise
      ? new NoiseGenerator({
          ...this._config.detailNoise,
          seed: this._config.seed + 1000,
        })
      : null;

    this._erosion = new ErosionSimulator(this._config.seed);

    this._biomeGen = new BiomeGenerator({
      moistureSeed: this._config.seed + 2000,
      temperatureSeed: this._config.seed + 3000,
    });

    this._riverGen = new RiverGenerator({
      riverCount: this._config.riverCount,
    });
  }

  /**
   * Generates complete procedural terrain.
   *
   * @returns Generated terrain with heightmap, biomes, and rivers
   */
  generate(): GeneratedTerrain {
    logger.info('Starting procedural terrain generation...');
    logger.info(`Resolution: ${this._config.width}x${this._config.height}`);
    logger.info(`Seed: ${this._config.seed}`);

    // Step 1: Generate base heightmap from noise
    const heightmap = this._generateBaseHeightmap();

    // Step 2: Add detail noise if configured
    if (this._detailNoise) {
      this._addDetailNoise(heightmap);
    }

    // Step 3: Apply erosion if enabled
    if (this._config.enableErosion) {
      this._applyErosion(heightmap);
    }

    // Step 4: Generate rivers if enabled
    let rivers: RiverPath[] | undefined;
    if (this._config.enableRivers) {
      rivers = this._generateRivers(heightmap);
    }

    // Step 5: Generate biomes if enabled
    let biomeMap: BiomeMap | undefined;
    if (this._config.enableBiomes) {
      biomeMap = this._generateBiomes(heightmap);
    }

    logger.info('Terrain generation complete');

    return {
      heightmap,
      biomeMap,
      rivers,
    };
  }

  /**
   * Generates base heightmap from noise.
   * @private
   */
  private _generateBaseHeightmap(): Heightmap {
    logger.info('Generating base heightmap from noise...');

    const heightmap = new Heightmap({
      width: this._config.width,
      height: this._config.height,
      format: HeightmapFormat.Float32,
      minHeight: this._config.minHeight,
      maxHeight: this._config.maxHeight,
    });

    // Generate heights using noise
    for (let y = 0; y < this._config.height; y++) {
      for (let x = 0; x < this._config.width; x++) {
        const noiseValue = this._baseNoise.noise2D(x, y);

        // Normalize from [-1, 1] to [minHeight, maxHeight]
        const height =
          this._config.minHeight +
          ((noiseValue + 1) * 0.5) * (this._config.maxHeight - this._config.minHeight);

        heightmap.setSample(x, y, height);
      }
    }

    logger.info('Base heightmap generated');
    return heightmap;
  }

  /**
   * Adds detail noise to heightmap.
   * @private
   */
  private _addDetailNoise(heightmap: Heightmap): void {
    if (!this._detailNoise) return;

    logger.info('Adding detail noise...');

    for (let y = 0; y < heightmap.height; y++) {
      for (let x = 0; x < heightmap.width; x++) {
        const currentHeight = heightmap.getSample(x, y);
        const detailValue = this._detailNoise.noise2D(x, y);

        const detailHeight = detailValue * (this._config.detailNoise?.amplitude ?? 10);
        heightmap.setSample(x, y, currentHeight + detailHeight);
      }
    }

    logger.info('Detail noise added');
  }

  /**
   * Applies erosion simulation.
   * @private
   */
  private _applyErosion(heightmap: Heightmap): void {
    logger.info('Applying erosion...');

    // Hydraulic erosion
    this._erosion.applyHydraulicErosion(heightmap, {
      iterations: this._config.erosionIterations,
      erosionRate: 0.3,
      depositionRate: 0.3,
      evaporationRate: 0.01,
      sedimentCapacity: 4.0,
    });

    // Thermal erosion for smoothing steep slopes
    this._erosion.applyThermalErosion(heightmap, {
      iterations: 50,
      talusAngle: 40,
      transferRate: 0.5,
    });

    logger.info('Erosion applied');
  }

  /**
   * Generates rivers.
   * @private
   */
  private _generateRivers(heightmap: Heightmap): RiverPath[] {
    logger.info('Generating rivers...');

    const rivers = this._riverGen.generate(heightmap);
    this._riverGen.carveRivers(heightmap, rivers);

    logger.info(`${rivers.length} rivers generated`);
    return rivers;
  }

  /**
   * Generates biome map.
   * @private
   */
  private _generateBiomes(heightmap: Heightmap): BiomeMap {
    logger.info('Generating biomes...');

    const biomeMap = this._biomeGen.generate(heightmap);

    logger.info('Biomes generated');
    return biomeMap;
  }

  /**
   * Updates the seed and regenerates noise generators.
   *
   * @param seed - New seed
   */
  setSeed(seed: number): void {
    this._config.seed = seed;
    this._baseNoise.setSeed(seed);
    if (this._detailNoise) {
      this._detailNoise.setSeed(seed + 1000);
    }
    this._erosion.setSeed(seed);
    this._biomeGen.setMoistureSeed(seed + 2000);
    this._biomeGen.setTemperatureSeed(seed + 3000);
    this._riverGen.setSeed(seed);
  }

  /**
   * Gets the current seed.
   * @returns Current seed
   */
  getSeed(): number {
    return this._config.seed;
  }

  /**
   * Creates a terrain generator with preset configuration.
   *
   * @param preset - Preset name
   * @param width - Heightmap width
   * @param height - Heightmap height
   * @returns Terrain generator
   */
  static createPreset(
    preset: 'plains' | 'mountains' | 'islands' | 'canyons',
    width: number = 513,
    height: number = 513
  ): TerrainGenerator {
    const presets: Record<string, Partial<TerrainGeneratorConfig>> = {
      plains: {
        width,
        height,
        baseNoise: {
          type: NoiseType.Perlin,
          frequency: 0.003,
          octaves: 4,
          lacunarity: 2.0,
          persistence: 0.4,
          amplitude: 20,
        },
        enableErosion: true,
        erosionIterations: 30000,
        enableRivers: true,
        riverCount: 3,
      },
      mountains: {
        width,
        height,
        baseNoise: {
          type: NoiseType.Ridged,
          frequency: 0.008,
          octaves: 8,
          lacunarity: 2.2,
          persistence: 0.6,
          amplitude: 150,
        },
        detailNoise: {
          type: NoiseType.Simplex,
          frequency: 0.02,
          octaves: 4,
          amplitude: 20,
        },
        enableErosion: true,
        erosionIterations: 80000,
        enableRivers: true,
        riverCount: 5,
      },
      islands: {
        width,
        height,
        baseNoise: {
          type: NoiseType.Perlin,
          frequency: 0.005,
          octaves: 6,
          lacunarity: 2.0,
          persistence: 0.5,
          amplitude: 60,
        },
        enableErosion: true,
        erosionIterations: 40000,
        enableRivers: false,
      },
      canyons: {
        width,
        height,
        baseNoise: {
          type: NoiseType.Ridged,
          frequency: 0.006,
          octaves: 6,
          lacunarity: 2.5,
          persistence: 0.55,
          amplitude: 100,
        },
        enableErosion: true,
        erosionIterations: 100000,
        enableRivers: true,
        riverCount: 8,
      },
    };

    return new TerrainGenerator(presets[preset]);
  }
}
