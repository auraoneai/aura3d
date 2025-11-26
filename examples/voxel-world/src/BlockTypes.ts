/**
 * BlockTypes.ts
 * Complete block type definitions with materials, textures, and properties
 */

import { VoxelType, VoxelMaterial } from '../../../src/voxel/VoxelData';

/**
 * Extended block type enumeration
 */
export enum BlockType {
  Air = 0,
  Stone = 1,
  Dirt = 2,
  Grass = 3,
  Sand = 4,
  Water = 5,
  Wood = 6,
  Leaves = 7,
  Glass = 8,
  CoalOre = 9,
  IronOre = 10,
  GoldOre = 11,
  DiamondOre = 12,
  Bedrock = 13,
  Cobblestone = 14,
  Planks = 15,
  Brick = 16,
  Snow = 17,
  Ice = 18,
  Lava = 19
}

/**
 * Block properties for gameplay
 */
export interface BlockProperties {
  name: string;
  type: BlockType;
  material: VoxelMaterial;
  hardness: number;
  toolRequired: string | null;
  dropsItem: BlockType | null;
  sound: string;
  animated: boolean;
  lightLevel: number;
}

/**
 * Block registry - All block types with complete properties
 */
export class BlockRegistry {
  private static blocks: Map<BlockType, BlockProperties> = new Map();

  static {
    this.registerDefaultBlocks();
  }

  /**
   * Register all default block types
   */
  private static registerDefaultBlocks(): void {
    // Air
    this.register({
      name: 'Air',
      type: BlockType.Air,
      material: {
        type: VoxelType.Air,
        color: [0, 0, 0, 0],
        emissive: 0,
        roughness: 1,
        metallic: 0,
        transparent: true,
        solid: false
      },
      hardness: 0,
      toolRequired: null,
      dropsItem: null,
      sound: 'none',
      animated: false,
      lightLevel: 0
    });

    // Stone
    this.register({
      name: 'Stone',
      type: BlockType.Stone,
      material: {
        type: VoxelType.Stone,
        color: [0.5, 0.5, 0.5, 1],
        emissive: 0,
        roughness: 0.9,
        metallic: 0,
        transparent: false,
        solid: true
      },
      hardness: 1.5,
      toolRequired: 'pickaxe',
      dropsItem: BlockType.Cobblestone,
      sound: 'stone',
      animated: false,
      lightLevel: 0
    });

    // Dirt
    this.register({
      name: 'Dirt',
      type: BlockType.Dirt,
      material: {
        type: VoxelType.Dirt,
        color: [0.4, 0.25, 0.15, 1],
        emissive: 0,
        roughness: 1,
        metallic: 0,
        transparent: false,
        solid: true
      },
      hardness: 0.5,
      toolRequired: null,
      dropsItem: BlockType.Dirt,
      sound: 'dirt',
      animated: false,
      lightLevel: 0
    });

    // Grass
    this.register({
      name: 'Grass',
      type: BlockType.Grass,
      material: {
        type: VoxelType.Grass,
        color: [0.3, 0.7, 0.3, 1],
        emissive: 0,
        roughness: 0.95,
        metallic: 0,
        transparent: false,
        solid: true
      },
      hardness: 0.6,
      toolRequired: null,
      dropsItem: BlockType.Dirt,
      sound: 'grass',
      animated: false,
      lightLevel: 0
    });

    // Sand
    this.register({
      name: 'Sand',
      type: BlockType.Sand,
      material: {
        type: VoxelType.Sand,
        color: [0.9, 0.85, 0.6, 1],
        emissive: 0,
        roughness: 0.95,
        metallic: 0,
        transparent: false,
        solid: true
      },
      hardness: 0.5,
      toolRequired: null,
      dropsItem: BlockType.Sand,
      sound: 'sand',
      animated: false,
      lightLevel: 0
    });

    // Water
    this.register({
      name: 'Water',
      type: BlockType.Water,
      material: {
        type: VoxelType.Water,
        color: [0.15, 0.4, 0.8, 0.6],
        emissive: 0,
        roughness: 0.1,
        metallic: 0,
        transparent: true,
        solid: false
      },
      hardness: 100,
      toolRequired: null,
      dropsItem: null,
      sound: 'water',
      animated: true,
      lightLevel: 0
    });

    // Wood (Log)
    this.register({
      name: 'Wood',
      type: BlockType.Wood,
      material: {
        type: VoxelType.Wood,
        color: [0.4, 0.25, 0.1, 1],
        emissive: 0,
        roughness: 0.8,
        metallic: 0,
        transparent: false,
        solid: true
      },
      hardness: 2.0,
      toolRequired: 'axe',
      dropsItem: BlockType.Wood,
      sound: 'wood',
      animated: false,
      lightLevel: 0
    });

    // Leaves
    this.register({
      name: 'Leaves',
      type: BlockType.Leaves,
      material: {
        type: VoxelType.Leaves,
        color: [0.2, 0.6, 0.2, 0.9],
        emissive: 0,
        roughness: 0.9,
        metallic: 0,
        transparent: true,
        solid: true
      },
      hardness: 0.2,
      toolRequired: null,
      dropsItem: null,
      sound: 'grass',
      animated: false,
      lightLevel: 0
    });

    // Glass
    this.register({
      name: 'Glass',
      type: BlockType.Glass,
      material: {
        type: VoxelType.Glass,
        color: [0.7, 0.9, 1.0, 0.3],
        emissive: 0,
        roughness: 0.05,
        metallic: 0,
        transparent: true,
        solid: true
      },
      hardness: 0.3,
      toolRequired: null,
      dropsItem: null,
      sound: 'glass',
      animated: false,
      lightLevel: 0
    });

    // Coal Ore
    this.register({
      name: 'Coal Ore',
      type: BlockType.CoalOre,
      material: {
        type: VoxelType.Stone,
        color: [0.3, 0.3, 0.3, 1],
        emissive: 0,
        roughness: 0.9,
        metallic: 0,
        transparent: false,
        solid: true
      },
      hardness: 3.0,
      toolRequired: 'pickaxe',
      dropsItem: BlockType.CoalOre,
      sound: 'stone',
      animated: false,
      lightLevel: 0
    });

    // Iron Ore
    this.register({
      name: 'Iron Ore',
      type: BlockType.IronOre,
      material: {
        type: VoxelType.Stone,
        color: [0.7, 0.6, 0.5, 1],
        emissive: 0,
        roughness: 0.7,
        metallic: 0.3,
        transparent: false,
        solid: true
      },
      hardness: 3.0,
      toolRequired: 'pickaxe',
      dropsItem: BlockType.IronOre,
      sound: 'stone',
      animated: false,
      lightLevel: 0
    });

    // Gold Ore
    this.register({
      name: 'Gold Ore',
      type: BlockType.GoldOre,
      material: {
        type: VoxelType.Stone,
        color: [1.0, 0.85, 0.3, 1],
        emissive: 0.1,
        roughness: 0.4,
        metallic: 0.8,
        transparent: false,
        solid: true
      },
      hardness: 3.0,
      toolRequired: 'pickaxe',
      dropsItem: BlockType.GoldOre,
      sound: 'stone',
      animated: false,
      lightLevel: 0
    });

    // Diamond Ore
    this.register({
      name: 'Diamond Ore',
      type: BlockType.DiamondOre,
      material: {
        type: VoxelType.Stone,
        color: [0.3, 0.8, 0.9, 1],
        emissive: 0.2,
        roughness: 0.2,
        metallic: 0.5,
        transparent: false,
        solid: true
      },
      hardness: 3.0,
      toolRequired: 'pickaxe',
      dropsItem: BlockType.DiamondOre,
      sound: 'stone',
      animated: false,
      lightLevel: 0
    });

    // Bedrock
    this.register({
      name: 'Bedrock',
      type: BlockType.Bedrock,
      material: {
        type: VoxelType.Stone,
        color: [0.15, 0.15, 0.15, 1],
        emissive: 0,
        roughness: 0.95,
        metallic: 0,
        transparent: false,
        solid: true
      },
      hardness: -1,
      toolRequired: null,
      dropsItem: null,
      sound: 'stone',
      animated: false,
      lightLevel: 0
    });

    // Cobblestone
    this.register({
      name: 'Cobblestone',
      type: BlockType.Cobblestone,
      material: {
        type: VoxelType.Stone,
        color: [0.45, 0.45, 0.45, 1],
        emissive: 0,
        roughness: 0.95,
        metallic: 0,
        transparent: false,
        solid: true
      },
      hardness: 2.0,
      toolRequired: 'pickaxe',
      dropsItem: BlockType.Cobblestone,
      sound: 'stone',
      animated: false,
      lightLevel: 0
    });

    // Planks
    this.register({
      name: 'Planks',
      type: BlockType.Planks,
      material: {
        type: VoxelType.Wood,
        color: [0.6, 0.4, 0.2, 1],
        emissive: 0,
        roughness: 0.8,
        metallic: 0,
        transparent: false,
        solid: true
      },
      hardness: 2.0,
      toolRequired: 'axe',
      dropsItem: BlockType.Planks,
      sound: 'wood',
      animated: false,
      lightLevel: 0
    });

    // Brick
    this.register({
      name: 'Brick',
      type: BlockType.Brick,
      material: {
        type: VoxelType.Stone,
        color: [0.65, 0.3, 0.25, 1],
        emissive: 0,
        roughness: 0.85,
        metallic: 0,
        transparent: false,
        solid: true
      },
      hardness: 2.0,
      toolRequired: 'pickaxe',
      dropsItem: BlockType.Brick,
      sound: 'stone',
      animated: false,
      lightLevel: 0
    });

    // Snow
    this.register({
      name: 'Snow',
      type: BlockType.Snow,
      material: {
        type: VoxelType.Sand,
        color: [0.95, 0.95, 1.0, 1],
        emissive: 0,
        roughness: 0.9,
        metallic: 0,
        transparent: false,
        solid: true
      },
      hardness: 0.1,
      toolRequired: null,
      dropsItem: null,
      sound: 'snow',
      animated: false,
      lightLevel: 0
    });

    // Ice
    this.register({
      name: 'Ice',
      type: BlockType.Ice,
      material: {
        type: VoxelType.Glass,
        color: [0.7, 0.85, 1.0, 0.7],
        emissive: 0,
        roughness: 0.1,
        metallic: 0,
        transparent: true,
        solid: true
      },
      hardness: 0.5,
      toolRequired: null,
      dropsItem: null,
      sound: 'glass',
      animated: false,
      lightLevel: 0
    });

    // Lava
    this.register({
      name: 'Lava',
      type: BlockType.Lava,
      material: {
        type: VoxelType.Water,
        color: [1.0, 0.3, 0.0, 1],
        emissive: 1.0,
        roughness: 0.3,
        metallic: 0,
        transparent: false,
        solid: false
      },
      hardness: 100,
      toolRequired: null,
      dropsItem: null,
      sound: 'lava',
      animated: true,
      lightLevel: 15
    });
  }

  /**
   * Register a block type
   */
  private static register(props: BlockProperties): void {
    this.blocks.set(props.type, props);
  }

  /**
   * Get block properties by type
   */
  public static get(type: BlockType): BlockProperties | undefined {
    return this.blocks.get(type);
  }

  /**
   * Get block material by type
   */
  public static getMaterial(type: BlockType): VoxelMaterial {
    const props = this.blocks.get(type);
    if (!props) {
      return this.blocks.get(BlockType.Air)!.material;
    }
    return props.material;
  }

  /**
   * Get all block types
   */
  public static getAllTypes(): BlockType[] {
    return Array.from(this.blocks.keys());
  }

  /**
   * Get all block properties
   */
  public static getAll(): BlockProperties[] {
    return Array.from(this.blocks.values());
  }

  /**
   * Check if block is solid
   */
  public static isSolid(type: BlockType): boolean {
    const props = this.blocks.get(type);
    return props ? props.material.solid : false;
  }

  /**
   * Check if block is transparent
   */
  public static isTransparent(type: BlockType): boolean {
    const props = this.blocks.get(type);
    return props ? props.material.transparent : false;
  }

  /**
   * Get block hardness
   */
  public static getHardness(type: BlockType): number {
    const props = this.blocks.get(type);
    return props ? props.hardness : 0;
  }

  /**
   * Get block light level
   */
  public static getLightLevel(type: BlockType): number {
    const props = this.blocks.get(type);
    return props ? props.lightLevel : 0;
  }
}
