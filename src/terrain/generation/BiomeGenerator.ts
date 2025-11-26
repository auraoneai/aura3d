/**
 * Biome generation based on height, moisture, and temperature.
 * Distributes biomes across terrain using multi-layer noise maps.
 * @module BiomeGenerator
 */

import { Heightmap } from '../Heightmap';
import { NoiseGenerator, NoiseType } from './NoiseGenerator';
import { Logger } from '../../core/Logger';

const logger = Logger.create('BiomeGenerator');

/**
 * Biome type enumeration.
 */
export enum BiomeType {
  Ocean = 'Ocean',
  Beach = 'Beach',
  Desert = 'Desert',
  Grassland = 'Grassland',
  Forest = 'Forest',
  Rainforest = 'Rainforest',
  Savanna = 'Savanna',
  Tundra = 'Tundra',
  Taiga = 'Taiga',
  Mountains = 'Mountains',
  Snow = 'Snow',
}

/**
 * Biome properties.
 */
export interface BiomeProperties {
  /** Biome type */
  type: BiomeType;
  /** Base color */
  color: [number, number, number];
  /** Minimum height (0-1) */
  minHeight: number;
  /** Maximum height (0-1) */
  maxHeight: number;
  /** Minimum moisture (0-1) */
  minMoisture: number;
  /** Maximum moisture (0-1) */
  maxMoisture: number;
  /** Minimum temperature (0-1) */
  minTemperature: number;
  /** Maximum temperature (0-1) */
  maxTemperature: number;
}

/**
 * Biome map storing biome indices.
 */
export class BiomeMap {
  /** Map width */
  readonly width: number;
  /** Map height */
  readonly height: number;
  /** Biome indices */
  private _data: Uint8Array;

  /**
   * Creates a biome map.
   *
   * @param width - Map width
   * @param height - Map height
   */
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this._data = new Uint8Array(width * height);
  }

  /**
   * Gets biome index at position.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Biome index
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
   * Sets biome index at position.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param biome - Biome index
   */
  set(x: number, y: number, biome: number): void {
    x = Math.floor(x);
    y = Math.floor(y);

    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return;
    }

    this._data[y * this.width + x] = biome;
  }

  /**
   * Gets the raw data array.
   * @returns Biome data
   */
  getData(): Uint8Array {
    return this._data;
  }
}

/**
 * Biome generator for terrain.
 * Generates biome distribution based on elevation, moisture, and temperature.
 *
 * @example
 * ```typescript
 * const generator = new BiomeGenerator({
 *   moistureSeed: 12345,
 *   temperatureSeed: 67890,
 *   moistureFrequency: 0.003,
 *   temperatureFrequency: 0.002
 * });
 *
 * const biomeMap = generator.generate(heightmap);
 * const biome = generator.getBiomeAt(biomeMap, 100, 100);
 * ```
 */
export class BiomeGenerator {
  private _biomes: BiomeProperties[];
  private _moistureNoise: NoiseGenerator;
  private _temperatureNoise: NoiseGenerator;

  /**
   * Creates a new biome generator.
   *
   * @param config - Generator configuration
   */
  constructor(config: {
    moistureSeed?: number;
    temperatureSeed?: number;
    moistureFrequency?: number;
    temperatureFrequency?: number;
  } = {}) {
    this._biomes = this._createDefaultBiomes();

    this._moistureNoise = new NoiseGenerator({
      type: NoiseType.Perlin,
      seed: config.moistureSeed ?? 1234,
      frequency: config.moistureFrequency ?? 0.003,
      octaves: 4,
      lacunarity: 2.0,
      persistence: 0.5,
    });

    this._temperatureNoise = new NoiseGenerator({
      type: NoiseType.Perlin,
      seed: config.temperatureSeed ?? 5678,
      frequency: config.temperatureFrequency ?? 0.002,
      octaves: 4,
      lacunarity: 2.0,
      persistence: 0.5,
    });
  }

  /**
   * Generates a biome map from a heightmap.
   *
   * @param heightmap - Terrain heightmap
   * @returns Biome map
   */
  generate(heightmap: Heightmap): BiomeMap {
    logger.info('Generating biome map...');

    const biomeMap = new BiomeMap(heightmap.width, heightmap.height);

    for (let y = 0; y < heightmap.height; y++) {
      for (let x = 0; x < heightmap.width; x++) {
        // Get normalized height (0-1)
        const height = heightmap.getSample(x, y);
        const normalizedHeight = (height - heightmap.minHeight) / (heightmap.maxHeight - heightmap.minHeight);

        // Sample moisture and temperature
        const moisture = (this._moistureNoise.noise2D(x, y) + 1) * 0.5;
        const temperature = (this._temperatureNoise.noise2D(x, y) + 1) * 0.5;

        // Adjust temperature based on height (cooler at higher elevations)
        const adjustedTemp = temperature * (1 - normalizedHeight * 0.7);

        // Find matching biome
        const biomeIndex = this._selectBiome(normalizedHeight, moisture, adjustedTemp);
        biomeMap.set(x, y, biomeIndex);
      }
    }

    logger.info('Biome map generation complete');
    return biomeMap;
  }

  /**
   * Gets the biome properties at a position.
   *
   * @param biomeMap - Biome map
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Biome properties
   */
  getBiomeAt(biomeMap: BiomeMap, x: number, y: number): BiomeProperties {
    const biomeIndex = biomeMap.get(x, y);
    return this._biomes[biomeIndex] ?? this._biomes[0];
  }

  /**
   * Gets all registered biomes.
   * @returns Array of biome properties
   */
  getBiomes(): readonly BiomeProperties[] {
    return this._biomes;
  }

  /**
   * Adds a custom biome.
   *
   * @param biome - Biome properties
   * @returns Biome index
   */
  addBiome(biome: BiomeProperties): number {
    this._biomes.push(biome);
    return this._biomes.length - 1;
  }

  /**
   * Selects the best matching biome for given conditions.
   * @private
   */
  private _selectBiome(height: number, moisture: number, temperature: number): number {
    for (let i = 0; i < this._biomes.length; i++) {
      const biome = this._biomes[i]!;

      if (
        height >= biome.minHeight &&
        height <= biome.maxHeight &&
        moisture >= biome.minMoisture &&
        moisture <= biome.maxMoisture &&
        temperature >= biome.minTemperature &&
        temperature <= biome.maxTemperature
      ) {
        return i;
      }
    }

    return 0; // Default to first biome
  }

  /**
   * Creates default biome definitions.
   * @private
   */
  private _createDefaultBiomes(): BiomeProperties[] {
    return [
      {
        type: BiomeType.Ocean,
        color: [0.1, 0.2, 0.5],
        minHeight: 0.0,
        maxHeight: 0.3,
        minMoisture: 0.0,
        maxMoisture: 1.0,
        minTemperature: 0.0,
        maxTemperature: 1.0,
      },
      {
        type: BiomeType.Beach,
        color: [0.9, 0.85, 0.6],
        minHeight: 0.3,
        maxHeight: 0.35,
        minMoisture: 0.0,
        maxMoisture: 1.0,
        minTemperature: 0.3,
        maxTemperature: 1.0,
      },
      {
        type: BiomeType.Desert,
        color: [0.85, 0.7, 0.4],
        minHeight: 0.35,
        maxHeight: 0.6,
        minMoisture: 0.0,
        maxMoisture: 0.3,
        minTemperature: 0.5,
        maxTemperature: 1.0,
      },
      {
        type: BiomeType.Grassland,
        color: [0.5, 0.7, 0.3],
        minHeight: 0.35,
        maxHeight: 0.6,
        minMoisture: 0.3,
        maxMoisture: 0.6,
        minTemperature: 0.3,
        maxTemperature: 0.8,
      },
      {
        type: BiomeType.Forest,
        color: [0.2, 0.5, 0.2],
        minHeight: 0.35,
        maxHeight: 0.7,
        minMoisture: 0.5,
        maxMoisture: 0.8,
        minTemperature: 0.3,
        maxTemperature: 0.7,
      },
      {
        type: BiomeType.Rainforest,
        color: [0.1, 0.4, 0.15],
        minHeight: 0.35,
        maxHeight: 0.65,
        minMoisture: 0.8,
        maxMoisture: 1.0,
        minTemperature: 0.6,
        maxTemperature: 1.0,
      },
      {
        type: BiomeType.Savanna,
        color: [0.7, 0.65, 0.4],
        minHeight: 0.35,
        maxHeight: 0.6,
        minMoisture: 0.2,
        maxMoisture: 0.5,
        minTemperature: 0.6,
        maxTemperature: 0.9,
      },
      {
        type: BiomeType.Tundra,
        color: [0.6, 0.65, 0.6],
        minHeight: 0.35,
        maxHeight: 0.7,
        minMoisture: 0.0,
        maxMoisture: 0.5,
        minTemperature: 0.0,
        maxTemperature: 0.3,
      },
      {
        type: BiomeType.Taiga,
        color: [0.3, 0.5, 0.35],
        minHeight: 0.35,
        maxHeight: 0.7,
        minMoisture: 0.4,
        maxMoisture: 0.8,
        minTemperature: 0.1,
        maxTemperature: 0.4,
      },
      {
        type: BiomeType.Mountains,
        color: [0.5, 0.5, 0.5],
        minHeight: 0.7,
        maxHeight: 0.9,
        minMoisture: 0.0,
        maxMoisture: 1.0,
        minTemperature: 0.1,
        maxTemperature: 0.6,
      },
      {
        type: BiomeType.Snow,
        color: [0.9, 0.9, 0.95],
        minHeight: 0.8,
        maxHeight: 1.0,
        minMoisture: 0.0,
        maxMoisture: 1.0,
        minTemperature: 0.0,
        maxTemperature: 0.3,
      },
    ];
  }

  /**
   * Sets the moisture noise seed.
   *
   * @param seed - New seed
   */
  setMoistureSeed(seed: number): void {
    this._moistureNoise.setSeed(seed);
  }

  /**
   * Sets the temperature noise seed.
   *
   * @param seed - New seed
   */
  setTemperatureSeed(seed: number): void {
    this._temperatureNoise.setSeed(seed);
  }
}
