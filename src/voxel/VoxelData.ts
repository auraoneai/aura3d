import { Logger } from '../../core/Logger';

/**
 * Voxel type enumeration
 */
export enum VoxelType {
  Air = 0,
  Stone = 1,
  Dirt = 2,
  Grass = 3,
  Sand = 4,
  Water = 5,
  Wood = 6,
  Leaves = 7,
  Glass = 8,
  Metal = 9,
  Custom = 255
}

/**
 * Voxel material properties
 */
export interface VoxelMaterial {
  type: VoxelType;
  color: [number, number, number, number];
  emissive: number;
  roughness: number;
  metallic: number;
  transparent: boolean;
  solid: boolean;
}

/**
 * Palette entry for voxel compression
 */
interface PaletteEntry {
  material: VoxelMaterial;
  count: number;
}

/**
 * VoxelData - Palette-based compressed voxel storage
 *
 * Uses a palette-based compression scheme where common materials are stored
 * in a palette and voxel data references palette indices. This significantly
 * reduces memory usage for homogeneous chunks.
 *
 * Memory efficiency:
 * - Uncompressed: 4096 voxels * 32 bytes = 128KB per chunk
 * - Compressed: ~256 palette entries * 32 bytes + 4096 bytes = ~12KB per chunk
 *
 * @example
 * ```typescript
 * const data = new VoxelData(16);
 * data.setVoxel(8, 8, 8, stoneMaterial);
 * const voxel = data.getVoxel(8, 8, 8);
 * ```
 */
export class VoxelData {
  private size: number;
  private palette: Map<number, VoxelMaterial>;
  private indices: Uint8Array;
  private paletteIdCounter: number;
  private materialToPaletteId: Map<string, number>;
  private logger: Logger;

  /**
   * Creates a new voxel data storage
   * @param size Chunk size (default 16x16x16)
   */
  constructor(size: number = 16) {
    this.size = size;
    this.palette = new Map();
    this.indices = new Uint8Array(size * size * size);
    this.paletteIdCounter = 0;
    this.materialToPaletteId = new Map();
    this.logger = Logger.getInstance();

    // Initialize with air
    const airMaterial = this.getDefaultMaterial(VoxelType.Air);
    this.addToPalette(airMaterial);
  }

  /**
   * Gets the chunk size
   */
  public getSize(): number {
    return this.size;
  }

  /**
   * Converts 3D coordinates to 1D index
   */
  private coordToIndex(x: number, y: number, z: number): number {
    return x + y * this.size + z * this.size * this.size;
  }

  /**
   * Converts 1D index to 3D coordinates
   */
  private indexToCoord(index: number): [number, number, number] {
    const z = Math.floor(index / (this.size * this.size));
    const remainder = index % (this.size * this.size);
    const y = Math.floor(remainder / this.size);
    const x = remainder % this.size;
    return [x, y, z];
  }

  /**
   * Checks if coordinates are valid
   */
  private isValidCoord(x: number, y: number, z: number): boolean {
    return x >= 0 && x < this.size &&
           y >= 0 && y < this.size &&
           z >= 0 && z < this.size;
  }

  /**
   * Gets material hash for palette lookup
   */
  private getMaterialHash(material: VoxelMaterial): string {
    return `${material.type}_${material.color.join(',')}_${material.emissive}_${material.roughness}_${material.metallic}_${material.transparent}_${material.solid}`;
  }

  /**
   * Adds material to palette if not present
   */
  private addToPalette(material: VoxelMaterial): number {
    const hash = this.getMaterialHash(material);
    const existing = this.materialToPaletteId.get(hash);

    if (existing !== undefined) {
      return existing;
    }

    if (this.palette.size >= 256) {
      this.logger.warn('Palette full, cannot add more materials');
      return 0; // Return air
    }

    const id = this.paletteIdCounter++;
    this.palette.set(id, material);
    this.materialToPaletteId.set(hash, id);
    return id;
  }

  /**
   * Sets a voxel at the given coordinates
   */
  public setVoxel(x: number, y: number, z: number, material: VoxelMaterial): void {
    if (!this.isValidCoord(x, y, z)) {
      this.logger.warn(`Invalid voxel coordinates: (${x}, ${y}, ${z})`);
      return;
    }

    const paletteId = this.addToPalette(material);
    const index = this.coordToIndex(x, y, z);
    this.indices[index] = paletteId;
  }

  /**
   * Gets a voxel at the given coordinates
   */
  public getVoxel(x: number, y: number, z: number): VoxelMaterial | null {
    if (!this.isValidCoord(x, y, z)) {
      return null;
    }

    const index = this.coordToIndex(x, y, z);
    const paletteId = this.indices[index]!;
    return this.palette.get(paletteId) || null;
  }

  /**
   * Gets voxel type at coordinates (faster than getVoxel)
   */
  public getVoxelType(x: number, y: number, z: number): VoxelType {
    if (!this.isValidCoord(x, y, z)) {
      return VoxelType.Air;
    }

    const index = this.coordToIndex(x, y, z);
    const paletteId = this.indices[index]!;
    const material = this.palette.get(paletteId);
    return material ? material.type : VoxelType.Air;
  }

  /**
   * Checks if voxel is solid
   */
  public isSolid(x: number, y: number, z: number): boolean {
    const material = this.getVoxel(x, y, z);
    return material ? material.solid : false;
  }

  /**
   * Checks if voxel is transparent
   */
  public isTransparent(x: number, y: number, z: number): boolean {
    const material = this.getVoxel(x, y, z);
    return material ? material.transparent : true;
  }

  /**
   * Fills a region with a material
   */
  public fill(
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    material: VoxelMaterial
  ): void {
    const paletteId = this.addToPalette(material);

    for (let z = z1; z <= z2; z++) {
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          if (this.isValidCoord(x, y, z)) {
            const index = this.coordToIndex(x, y, z);
            this.indices[index] = paletteId;
          }
        }
      }
    }
  }

  /**
   * Clears all voxels to air
   */
  public clear(): void {
    this.indices.fill(0);
  }

  /**
   * Gets the palette
   */
  public getPalette(): Map<number, VoxelMaterial> {
    return this.palette;
  }

  /**
   * Gets the indices array
   */
  public getIndices(): Uint8Array {
    return this.indices;
  }

  /**
   * Gets default material for a voxel type
   */
  public getDefaultMaterial(type: VoxelType): VoxelMaterial {
    switch (type) {
      case VoxelType.Air:
        return {
          type,
          color: [0, 0, 0, 0],
          emissive: 0,
          roughness: 1,
          metallic: 0,
          transparent: true,
          solid: false
        };
      case VoxelType.Stone:
        return {
          type,
          color: [0.5, 0.5, 0.5, 1],
          emissive: 0,
          roughness: 0.9,
          metallic: 0,
          transparent: false,
          solid: true
        };
      case VoxelType.Dirt:
        return {
          type,
          color: [0.4, 0.3, 0.2, 1],
          emissive: 0,
          roughness: 0.95,
          metallic: 0,
          transparent: false,
          solid: true
        };
      case VoxelType.Grass:
        return {
          type,
          color: [0.3, 0.7, 0.3, 1],
          emissive: 0,
          roughness: 0.8,
          metallic: 0,
          transparent: false,
          solid: true
        };
      case VoxelType.Sand:
        return {
          type,
          color: [0.9, 0.8, 0.6, 1],
          emissive: 0,
          roughness: 0.85,
          metallic: 0,
          transparent: false,
          solid: true
        };
      case VoxelType.Water:
        return {
          type,
          color: [0.2, 0.4, 0.8, 0.6],
          emissive: 0,
          roughness: 0.1,
          metallic: 0,
          transparent: true,
          solid: false
        };
      case VoxelType.Wood:
        return {
          type,
          color: [0.6, 0.4, 0.2, 1],
          emissive: 0,
          roughness: 0.7,
          metallic: 0,
          transparent: false,
          solid: true
        };
      case VoxelType.Leaves:
        return {
          type,
          color: [0.2, 0.6, 0.2, 0.8],
          emissive: 0,
          roughness: 0.8,
          metallic: 0,
          transparent: true,
          solid: true
        };
      case VoxelType.Glass:
        return {
          type,
          color: [0.9, 0.9, 0.9, 0.3],
          emissive: 0,
          roughness: 0.05,
          metallic: 0,
          transparent: true,
          solid: true
        };
      case VoxelType.Metal:
        return {
          type,
          color: [0.7, 0.7, 0.7, 1],
          emissive: 0,
          roughness: 0.3,
          metallic: 1,
          transparent: false,
          solid: true
        };
      default:
        return this.getDefaultMaterial(VoxelType.Air);
    }
  }

  /**
   * Computes memory usage in bytes
   */
  public getMemoryUsage(): number {
    const indicesSize = this.indices.byteLength;
    const paletteSize = this.palette.size * 64; // Approximate size per entry
    return indicesSize + paletteSize;
  }

  /**
   * Serializes voxel data for storage
   */
  public serialize(): ArrayBuffer {
    const paletteArray = Array.from(this.palette.entries());
    const paletteJSON = JSON.stringify(paletteArray);
    const encoder = new TextEncoder();
    const paletteBytes = encoder.encode(paletteJSON);

    const buffer = new ArrayBuffer(4 + 4 + paletteBytes.length + this.indices.length);
    const view = new DataView(buffer);

    // Write header
    view.setUint32(0, this.size, true);
    view.setUint32(4, paletteBytes.length, true);

    // Write palette
    const uint8View = new Uint8Array(buffer);
    uint8View.set(paletteBytes, 8);

    // Write indices
    uint8View.set(this.indices, 8 + paletteBytes.length);

    return buffer;
  }

  /**
   * Deserializes voxel data from storage
   */
  public static deserialize(buffer: ArrayBuffer): VoxelData {
    const view = new DataView(buffer);
    const size = view.getUint32(0, true);
    const paletteLength = view.getUint32(4, true);

    const paletteBytes = new Uint8Array(buffer, 8, paletteLength);
    const decoder = new TextDecoder();
    const paletteJSON = decoder.decode(paletteBytes);
    const paletteArray = JSON.parse(paletteJSON);

    const data = new VoxelData(size);
    data.palette.clear();
    data.materialToPaletteId.clear();

    for (const [id, material] of paletteArray) {
      data.palette.set(id, material);
      const hash = data.getMaterialHash(material);
      data.materialToPaletteId.set(hash, id);
    }

    data.paletteIdCounter = Math.max(...Array.from(data.palette.keys())) + 1;

    const indices = new Uint8Array(buffer, 8 + paletteLength);
    data.indices.set(indices);

    return data;
  }
}
