/**
 * TerrainGenerator.ts
 * Procedural terrain generation with multi-octave noise, biomes, caves, and structures
 */

import { VoxelChunk } from '../../../src/voxel/VoxelChunk';
import { BlockType, BlockRegistry } from './BlockTypes';

/**
 * Simple noise generator using sine/cosine for deterministic terrain
 */
class NoiseGenerator {
  private seed: number;

  constructor(seed: number = 12345) {
    this.seed = seed;
  }

  /**
   * Hash function for consistent random values
   */
  private hash(x: number, y: number, z: number = 0): number {
    let n = x * 374761393 + y * 668265263 + z * 1274126177 + this.seed;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  /**
   * Smooth interpolation
   */
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  /**
   * Smoothstep function
   */
  private smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
  }

  /**
   * 2D Perlin-like noise
   */
  public noise2D(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;

    const a = this.hash(xi, yi);
    const b = this.hash(xi + 1, yi);
    const c = this.hash(xi, yi + 1);
    const d = this.hash(xi + 1, yi + 1);

    const u = this.smoothstep(xf);
    const v = this.smoothstep(yf);

    return this.lerp(
      this.lerp(a, b, u),
      this.lerp(c, d, u),
      v
    );
  }

  /**
   * 3D Perlin-like noise
   */
  public noise3D(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;

    const a = this.hash(xi, yi, zi);
    const b = this.hash(xi + 1, yi, zi);
    const c = this.hash(xi, yi + 1, zi);
    const d = this.hash(xi + 1, yi + 1, zi);
    const e = this.hash(xi, yi, zi + 1);
    const f = this.hash(xi + 1, yi, zi + 1);
    const g = this.hash(xi, yi + 1, zi + 1);
    const h = this.hash(xi + 1, yi + 1, zi + 1);

    const u = this.smoothstep(xf);
    const v = this.smoothstep(yf);
    const w = this.smoothstep(zf);

    const x1 = this.lerp(a, b, u);
    const x2 = this.lerp(c, d, u);
    const y1 = this.lerp(x1, x2, v);

    const x3 = this.lerp(e, f, u);
    const x4 = this.lerp(g, h, u);
    const y2 = this.lerp(x3, x4, v);

    return this.lerp(y1, y2, w);
  }

  /**
   * Multi-octave noise
   */
  public octaveNoise2D(x: number, y: number, octaves: number, persistence: number = 0.5): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return total / maxValue;
  }

  /**
   * Multi-octave 3D noise
   */
  public octaveNoise3D(x: number, y: number, z: number, octaves: number, persistence: number = 0.5): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return total / maxValue;
  }
}

/**
 * Biome types
 */
export enum BiomeType {
  Plains,
  Desert,
  Forest,
  Mountains,
  Ocean,
  Tundra
}

/**
 * Biome information
 */
interface Biome {
  type: BiomeType;
  surfaceBlock: BlockType;
  fillBlock: BlockType;
  hasGrass: boolean;
  hasTrees: boolean;
  treeChance: number;
}

/**
 * Procedural terrain generator
 */
export class TerrainGenerator {
  private noise: NoiseGenerator;
  private seed: number;
  private baseHeight: number = 64;
  private heightScale: number = 32;
  private waterLevel: number = 58;

  constructor(seed: number = 12345) {
    this.seed = seed;
    this.noise = new NoiseGenerator(seed);
  }

  /**
   * Generate terrain for a chunk
   */
  public generate(chunk: VoxelChunk): void {
    const chunkPos = chunk.getPosition();
    const size = chunk.getSize();
    const worldPos = chunk.getWorldPosition();

    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const worldX = worldPos.x + x;
        const worldZ = worldPos.z + z;

        // Get biome
        const biome = this.getBiome(worldX, worldZ);

        // Get height
        const height = this.getHeight(worldX, worldZ, biome);

        // Generate column
        for (let y = 0; y < size; y++) {
          const worldY = worldPos.y + y;

          if (worldY === 0) {
            // Bedrock layer
            chunk.setVoxel(x, y, z, BlockRegistry.getMaterial(BlockType.Bedrock));
          } else if (worldY < height - 4) {
            // Deep stone
            const caveNoise = this.getCaveNoise(worldX, worldY, worldZ);
            if (caveNoise > 0.6) {
              // Air (cave)
              chunk.setVoxel(x, y, z, BlockRegistry.getMaterial(BlockType.Air));
            } else {
              // Stone with ores
              const blockType = this.getStoneBlock(worldX, worldY, worldZ);
              chunk.setVoxel(x, y, z, BlockRegistry.getMaterial(blockType));
            }
          } else if (worldY < height - 1) {
            // Subsurface
            chunk.setVoxel(x, y, z, BlockRegistry.getMaterial(biome.fillBlock));
          } else if (worldY < height) {
            // Surface
            chunk.setVoxel(x, y, z, BlockRegistry.getMaterial(biome.surfaceBlock));
          } else if (worldY <= this.waterLevel) {
            // Water
            chunk.setVoxel(x, y, z, BlockRegistry.getMaterial(BlockType.Water));
          } else {
            // Air
            chunk.setVoxel(x, y, z, BlockRegistry.getMaterial(BlockType.Air));
          }
        }

        // Generate trees
        if (biome.hasTrees && height > this.waterLevel) {
          const treeRandom = this.noise.noise2D(worldX * 0.1 + 1000, worldZ * 0.1 + 1000);
          if (treeRandom > (1 - biome.treeChance)) {
            this.generateTree(chunk, x, height - worldPos.y, z);
          }
        }
      }
    }
  }

  /**
   * Get biome at world position
   */
  private getBiome(worldX: number, worldZ: number): Biome {
    const temperature = this.noise.octaveNoise2D(worldX * 0.003, worldZ * 0.003, 3);
    const moisture = this.noise.octaveNoise2D(worldX * 0.004 + 1000, worldZ * 0.004 + 1000, 3);

    if (temperature < 0.2) {
      return {
        type: BiomeType.Tundra,
        surfaceBlock: BlockType.Snow,
        fillBlock: BlockType.Dirt,
        hasGrass: false,
        hasTrees: false,
        treeChance: 0
      };
    } else if (temperature > 0.7) {
      return {
        type: BiomeType.Desert,
        surfaceBlock: BlockType.Sand,
        fillBlock: BlockType.Sand,
        hasGrass: false,
        hasTrees: false,
        treeChance: 0
      };
    } else if (moisture > 0.6) {
      return {
        type: BiomeType.Forest,
        surfaceBlock: BlockType.Grass,
        fillBlock: BlockType.Dirt,
        hasGrass: true,
        hasTrees: true,
        treeChance: 0.05
      };
    } else if (temperature > 0.5 && moisture < 0.3) {
      return {
        type: BiomeType.Mountains,
        surfaceBlock: BlockType.Stone,
        fillBlock: BlockType.Stone,
        hasGrass: false,
        hasTrees: false,
        treeChance: 0
      };
    } else {
      return {
        type: BiomeType.Plains,
        surfaceBlock: BlockType.Grass,
        fillBlock: BlockType.Dirt,
        hasGrass: true,
        hasTrees: true,
        treeChance: 0.01
      };
    }
  }

  /**
   * Get terrain height at position
   */
  private getHeight(worldX: number, worldZ: number, biome: Biome): number {
    let height = this.baseHeight;

    // Base terrain
    const continentalness = this.noise.octaveNoise2D(worldX * 0.001, worldZ * 0.001, 4);
    height += continentalness * this.heightScale * 2;

    // Regional variation
    const regional = this.noise.octaveNoise2D(worldX * 0.005, worldZ * 0.005, 4);
    height += regional * this.heightScale * 0.5;

    // Local detail
    const local = this.noise.octaveNoise2D(worldX * 0.02, worldZ * 0.02, 3);
    height += local * this.heightScale * 0.25;

    // Biome-specific adjustments
    if (biome.type === BiomeType.Mountains) {
      height += 20 + this.noise.octaveNoise2D(worldX * 0.01, worldZ * 0.01, 5) * 40;
    } else if (biome.type === BiomeType.Ocean) {
      height = this.waterLevel - 10;
    }

    return Math.floor(height);
  }

  /**
   * Get cave noise value
   */
  private getCaveNoise(x: number, y: number, z: number): number {
    const cave1 = this.noise.octaveNoise3D(x * 0.02, y * 0.02, z * 0.02, 3);
    const cave2 = this.noise.octaveNoise3D(x * 0.015 + 1000, y * 0.015 + 1000, z * 0.015 + 1000, 3);
    return Math.max(cave1, cave2);
  }

  /**
   * Get stone block type (with ores)
   */
  private getStoneBlock(x: number, y: number, z: number): BlockType {
    const oreNoise = this.noise.noise3D(x * 0.1, y * 0.1, z * 0.1);

    // Diamond (rare, deep)
    if (y < 16 && oreNoise > 0.95) {
      return BlockType.DiamondOre;
    }

    // Gold (uncommon, medium depth)
    if (y < 32 && oreNoise > 0.92) {
      return BlockType.GoldOre;
    }

    // Iron (common, medium depth)
    if (y < 64 && oreNoise > 0.85) {
      return BlockType.IronOre;
    }

    // Coal (very common, any depth)
    if (oreNoise > 0.80) {
      return BlockType.CoalOre;
    }

    return BlockType.Stone;
  }

  /**
   * Generate a tree at position
   */
  private generateTree(chunk: VoxelChunk, x: number, y: number, z: number): void {
    const size = chunk.getSize();
    const treeHeight = 4 + Math.floor(this.noise.noise2D(x * 10, z * 10) * 3);

    // Trunk
    for (let i = 0; i < treeHeight; i++) {
      const ty = y + i;
      if (ty >= 0 && ty < size) {
        chunk.setVoxel(x, ty, z, BlockRegistry.getMaterial(BlockType.Wood));
      }
    }

    // Leaves
    const leavesY = y + treeHeight - 1;
    for (let lx = -2; lx <= 2; lx++) {
      for (let lz = -2; lz <= 2; lz++) {
        for (let ly = 0; ly <= 2; ly++) {
          const tx = x + lx;
          const tz = z + lz;
          const ty = leavesY + ly;

          if (tx >= 0 && tx < size && tz >= 0 && tz < size && ty >= 0 && ty < size) {
            const dist = Math.abs(lx) + Math.abs(lz) + Math.abs(ly);
            if (dist <= 3 && !(lx === 0 && lz === 0 && ly < 2)) {
              const existing = chunk.getVoxelType(tx, ty, tz);
              if (existing === 0) {
                chunk.setVoxel(tx, ty, tz, BlockRegistry.getMaterial(BlockType.Leaves));
              }
            }
          }
        }
      }
    }
  }

  /**
   * Get water level
   */
  public getWaterLevel(): number {
    return this.waterLevel;
  }

  /**
   * Set water level
   */
  public setWaterLevel(level: number): void {
    this.waterLevel = level;
  }
}
