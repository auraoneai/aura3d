import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';
import { VoxelData, VoxelMaterial } from './VoxelData';

/**
 * Chunk state enumeration
 */
export enum ChunkState {
  Empty = 'empty',
  Generating = 'generating',
  Generated = 'generated',
  Meshing = 'meshing',
  Meshed = 'meshed',
  Ready = 'ready',
  Unloading = 'unloading'
}

/**
 * Chunk mesh data
 */
export interface ChunkMeshData {
  vertices: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  materialIndices: Uint8Array;
  vertexCount: number;
  indexCount: number;
}

/**
 * Chunk neighbors for meshing
 */
export interface ChunkNeighbors {
  north?: VoxelChunk;
  south?: VoxelChunk;
  east?: VoxelChunk;
  west?: VoxelChunk;
  up?: VoxelChunk;
  down?: VoxelChunk;
}

/**
 * VoxelChunk - Represents a cubic chunk of voxels
 *
 * A chunk is a contiguous block of voxel data (typically 16x16x16).
 * Chunks are the basic unit of voxel world management, enabling efficient
 * streaming, LOD, and culling.
 *
 * Features:
 * - Configurable size (default 16x16x16)
 * - State management for async generation/meshing
 * - Dirty tracking for optimized updates
 * - Neighbor-aware meshing
 * - Metadata for gameplay systems
 *
 * @example
 * ```typescript
 * const chunk = new VoxelChunk(new Vector3(0, 0, 0), 16);
 * chunk.setVoxel(8, 8, 8, stoneMaterial);
 * const state = chunk.getState();
 * ```
 */
export class VoxelChunk {
  private position: Vector3;
  private size: number;
  private data: VoxelData;
  private state: ChunkState;
  private dirty: boolean;
  private meshDirty: boolean;
  private meshData: ChunkMeshData | null;
  private neighbors: ChunkNeighbors;
  private lastAccessTime: number;
  private metadata: Map<string, any>;
  private logger: Logger;

  /**
   * Creates a new voxel chunk
   * @param position World position of the chunk (in chunk coordinates)
   * @param size Size of the chunk (default 16)
   */
  constructor(position: Vector3, size: number = 16) {
    this.position = position.clone();
    this.size = size;
    this.data = new VoxelData(size);
    this.state = ChunkState.Empty;
    this.dirty = false;
    this.meshDirty = false;
    this.meshData = null;
    this.neighbors = {};
    this.lastAccessTime = Date.now();
    this.metadata = new Map();
    this.logger = Logger.getInstance();
  }

  /**
   * Gets the chunk position
   */
  public getPosition(): Vector3 {
    return this.position.clone();
  }

  /**
   * Gets the chunk size
   */
  public getSize(): number {
    return this.size;
  }

  /**
   * Gets the chunk state
   */
  public getState(): ChunkState {
    return this.state;
  }

  /**
   * Sets the chunk state
   */
  public setState(state: ChunkState): void {
    this.state = state;
  }

  /**
   * Gets the voxel data
   */
  public getData(): VoxelData {
    return this.data;
  }

  /**
   * Sets a voxel in the chunk
   */
  public setVoxel(x: number, y: number, z: number, material: VoxelMaterial): void {
    this.data.setVoxel(x, y, z, material);
    this.markDirty();
    this.markMeshDirty();
    this.updateAccessTime();
  }

  /**
   * Gets a voxel from the chunk
   */
  public getVoxel(x: number, y: number, z: number): VoxelMaterial | null {
    this.updateAccessTime();
    return this.data.getVoxel(x, y, z);
  }

  /**
   * Gets voxel type at coordinates
   */
  public getVoxelType(x: number, y: number, z: number): number {
    this.updateAccessTime();
    return this.data.getVoxelType(x, y, z);
  }

  /**
   * Checks if voxel is solid
   */
  public isSolid(x: number, y: number, z: number): boolean {
    return this.data.isSolid(x, y, z);
  }

  /**
   * Checks if voxel is transparent
   */
  public isTransparent(x: number, y: number, z: number): boolean {
    return this.data.isTransparent(x, y, z);
  }

  /**
   * Marks the chunk as dirty (needs saving)
   */
  public markDirty(): void {
    this.dirty = true;
  }

  /**
   * Clears the dirty flag
   */
  public clearDirty(): void {
    this.dirty = false;
  }

  /**
   * Checks if chunk is dirty
   */
  public isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Marks the mesh as dirty (needs rebuilding)
   */
  public markMeshDirty(): void {
    this.meshDirty = true;
  }

  /**
   * Clears the mesh dirty flag
   */
  public clearMeshDirty(): void {
    this.meshDirty = false;
  }

  /**
   * Checks if mesh is dirty
   */
  public isMeshDirty(): boolean {
    return this.meshDirty;
  }

  /**
   * Sets the mesh data
   */
  public setMeshData(meshData: ChunkMeshData | null): void {
    this.meshData = meshData;
    this.clearMeshDirty();
  }

  /**
   * Gets the mesh data
   */
  public getMeshData(): ChunkMeshData | null {
    return this.meshData;
  }

  /**
   * Sets a neighbor chunk
   */
  public setNeighbor(direction: keyof ChunkNeighbors, chunk: VoxelChunk | undefined): void {
    this.neighbors[direction] = chunk;
  }

  /**
   * Gets a neighbor chunk
   */
  public getNeighbor(direction: keyof ChunkNeighbors): VoxelChunk | undefined {
    return this.neighbors[direction];
  }

  /**
   * Gets all neighbors
   */
  public getNeighbors(): ChunkNeighbors {
    return this.neighbors;
  }

  /**
   * Checks if all neighbors are loaded
   */
  public hasAllNeighbors(): boolean {
    return !!(
      this.neighbors.north &&
      this.neighbors.south &&
      this.neighbors.east &&
      this.neighbors.west &&
      this.neighbors.up &&
      this.neighbors.down
    );
  }

  /**
   * Updates the last access time
   */
  private updateAccessTime(): void {
    this.lastAccessTime = Date.now();
  }

  /**
   * Gets the last access time
   */
  public getLastAccessTime(): number {
    return this.lastAccessTime;
  }

  /**
   * Sets metadata
   */
  public setMetadata(key: string, value: any): void {
    this.metadata.set(key, value);
  }

  /**
   * Gets metadata
   */
  public getMetadata(key: string): any {
    return this.metadata.get(key);
  }

  /**
   * Checks if chunk is empty (all air)
   */
  public isEmpty(): boolean {
    const indices = this.data.getIndices();
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] !== 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Checks if chunk is full (no air)
   */
  public isFull(): boolean {
    const indices = this.data.getIndices();
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Gets world position of the chunk (in voxel coordinates)
   */
  public getWorldPosition(): Vector3 {
    return new Vector3(
      this.position.x * this.size,
      this.position.y * this.size,
      this.position.z * this.size
    );
  }

  /**
   * Gets bounding box min in world coordinates
   */
  public getBoundsMin(): Vector3 {
    return this.getWorldPosition();
  }

  /**
   * Gets bounding box max in world coordinates
   */
  public getBoundsMax(): Vector3 {
    const worldPos = this.getWorldPosition();
    return new Vector3(
      worldPos.x + this.size,
      worldPos.y + this.size,
      worldPos.z + this.size
    );
  }

  /**
   * Gets chunk center in world coordinates
   */
  public getCenter(): Vector3 {
    const worldPos = this.getWorldPosition();
    const halfSize = this.size / 2;
    return new Vector3(
      worldPos.x + halfSize,
      worldPos.y + halfSize,
      worldPos.z + halfSize
    );
  }

  /**
   * Converts world coordinates to local chunk coordinates
   */
  public worldToLocal(worldX: number, worldY: number, worldZ: number): [number, number, number] {
    const worldPos = this.getWorldPosition();
    return [
      worldX - worldPos.x,
      worldY - worldPos.y,
      worldZ - worldPos.z
    ];
  }

  /**
   * Converts local chunk coordinates to world coordinates
   */
  public localToWorld(localX: number, localY: number, localZ: number): [number, number, number] {
    const worldPos = this.getWorldPosition();
    return [
      worldPos.x + localX,
      worldPos.y + localY,
      worldPos.z + localZ
    ];
  }

  /**
   * Fills the chunk with a material
   */
  public fill(material: VoxelMaterial): void {
    this.data.fill(0, 0, 0, this.size - 1, this.size - 1, this.size - 1, material);
    this.markDirty();
    this.markMeshDirty();
  }

  /**
   * Clears the chunk (fills with air)
   */
  public clear(): void {
    this.data.clear();
    this.markDirty();
    this.markMeshDirty();
  }

  /**
   * Serializes chunk data for storage
   */
  public serialize(): ArrayBuffer {
    return this.data.serialize();
  }

  /**
   * Deserializes chunk data from storage
   */
  public static deserialize(buffer: ArrayBuffer, position: Vector3, size: number): VoxelChunk {
    const chunk = new VoxelChunk(position, size);
    chunk.data = VoxelData.deserialize(buffer);
    chunk.state = ChunkState.Generated;
    chunk.markMeshDirty();
    return chunk;
  }

  /**
   * Gets memory usage in bytes
   */
  public getMemoryUsage(): number {
    let total = this.data.getMemoryUsage();

    if (this.meshData) {
      total += this.meshData.vertices.byteLength;
      total += this.meshData.normals.byteLength;
      total += this.meshData.uvs.byteLength;
      total += this.meshData.colors.byteLength;
      total += this.meshData.indices.byteLength;
      total += this.meshData.materialIndices.byteLength;
    }

    return total;
  }

  /**
   * Disposes of chunk resources
   */
  public dispose(): void {
    this.meshData = null;
    this.neighbors = {};
    this.metadata.clear();
    this.state = ChunkState.Unloading;
  }
}
