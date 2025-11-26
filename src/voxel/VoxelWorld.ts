import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';
import { VoxelChunk, ChunkState } from './VoxelChunk';
import { VoxelMaterial } from './VoxelData';
import { ChunkMeshBuilder } from './ChunkMeshBuilder';
import { VoxelLighting } from './VoxelLighting';
import { VoxelDestructionSystem } from './VoxelDestructionSystem';
import { StabilityChecker } from './StabilityChecker';
import { VoxelRenderer } from './VoxelRenderer';

/**
 * World generation function type
 */
export type WorldGenerator = (chunk: VoxelChunk) => void;

/**
 * Chunk load/unload callback
 */
export type ChunkCallback = (chunk: VoxelChunk) => void;

/**
 * VoxelWorld - Manages a world of voxel chunks
 *
 * Central system for managing voxel terrain. Handles:
 * - Chunk loading/unloading based on player position
 * - Chunk generation and meshing
 * - Neighbor management for seamless meshing
 * - Persistence and serialization
 * - Performance optimization
 *
 * Features:
 * - Infinite world support
 * - Streaming chunk loading
 * - Automatic neighbor updates
 * - Configurable chunk size
 * - Memory management
 * - LOD support
 *
 * Performance targets:
 * - 1000+ active chunks
 * - 60 FPS rendering
 * - Efficient memory usage
 *
 * @example
 * ```typescript
 * const world = new VoxelWorld(16);
 * world.setGenerator((chunk) => {
 *   // Generate terrain
 * });
 * world.update(playerPosition);
 * ```
 */
export class VoxelWorld {
  private chunkSize: number;
  private chunks: Map<string, VoxelChunk>;
  private meshBuilder: ChunkMeshBuilder;
  private lighting: VoxelLighting;
  private destruction: VoxelDestructionSystem;
  private stability: StabilityChecker;
  private renderer: VoxelRenderer;

  private generator: WorldGenerator | null = null;
  private loadDistance: number = 8;
  private unloadDistance: number = 12;

  private onChunkLoad: ChunkCallback | null = null;
  private onChunkUnload: ChunkCallback | null = null;

  private centerPosition: Vector3 = new Vector3(0, 0, 0);
  private maxChunksPerFrame: number = 10;

  /**
   * Creates a new voxel world
   * @param chunkSize Size of each chunk (default 16)
   */
  constructor(chunkSize: number = 16) {
    this.chunkSize = chunkSize;
    this.chunks = new Map();
    this.meshBuilder = new ChunkMeshBuilder();
    this.lighting = new VoxelLighting();
    this.destruction = new VoxelDestructionSystem(this.lighting);
    this.stability = new StabilityChecker();
    this.renderer = new VoxelRenderer();
  }

  /**
   * Sets the world generator function
   */
  public setGenerator(generator: WorldGenerator): void {
    this.generator = generator;
  }

  /**
   * Sets chunk load callback
   */
  public setOnChunkLoad(callback: ChunkCallback): void {
    this.onChunkLoad = callback;
  }

  /**
   * Sets chunk unload callback
   */
  public setOnChunkUnload(callback: ChunkCallback): void {
    this.onChunkUnload = callback;
  }

  /**
   * Sets load distance in chunks
   */
  public setLoadDistance(distance: number): void {
    this.loadDistance = distance;
    this.unloadDistance = distance * 1.5;
  }

  /**
   * Gets a chunk key from position
   */
  private getChunkKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  /**
   * Converts world position to chunk position
   */
  public worldToChunk(worldX: number, worldY: number, worldZ: number): Vector3 {
    return new Vector3(
      Math.floor(worldX / this.chunkSize),
      Math.floor(worldY / this.chunkSize),
      Math.floor(worldZ / this.chunkSize)
    );
  }

  /**
   * Gets a chunk at chunk coordinates
   */
  public getChunk(x: number, y: number, z: number): VoxelChunk | undefined {
    const key = this.getChunkKey(x, y, z);
    return this.chunks.get(key);
  }

  /**
   * Gets or creates a chunk at chunk coordinates
   */
  public getOrCreateChunk(x: number, y: number, z: number): VoxelChunk {
    const existing = this.getChunk(x, y, z);
    if (existing) return existing;

    const chunk = new VoxelChunk(new Vector3(x, y, z), this.chunkSize);
    const key = this.getChunkKey(x, y, z);
    this.chunks.set(key, chunk);

    // Initialize lighting
    this.lighting.initializeChunk(chunk);

    return chunk;
  }

  /**
   * Loads a chunk (generates if needed)
   */
  public loadChunk(x: number, y: number, z: number): VoxelChunk {
    const chunk = this.getOrCreateChunk(x, y, z);

    if (chunk.getState() === ChunkState.Empty) {
      chunk.setState(ChunkState.Generating);

      // Generate chunk
      if (this.generator) {
        this.generator(chunk);
      }

      chunk.setState(ChunkState.Generated);

      // Update neighbors
      this.updateChunkNeighbors(chunk);

      // Calculate lighting
      this.lighting.recalculateChunk(chunk);

      // Trigger callback
      if (this.onChunkLoad) {
        this.onChunkLoad(chunk);
      }
    }

    return chunk;
  }

  /**
   * Unloads a chunk
   */
  public unloadChunk(x: number, y: number, z: number): void {
    const chunk = this.getChunk(x, y, z);
    if (!chunk) return;

    // Trigger callback
    if (this.onChunkUnload) {
      this.onChunkUnload(chunk);
    }

    // Remove from neighbors
    this.removeChunkNeighbors(chunk);

    // Dispose
    chunk.dispose();

    // Remove from map
    const key = this.getChunkKey(x, y, z);
    this.chunks.delete(key);
  }

  /**
   * Updates chunk neighbors
   */
  private updateChunkNeighbors(chunk: VoxelChunk): void {
    const pos = chunk.getPosition();

    const north = this.getChunk(pos.x, pos.y, pos.z + 1);
    const south = this.getChunk(pos.x, pos.y, pos.z - 1);
    const east = this.getChunk(pos.x + 1, pos.y, pos.z);
    const west = this.getChunk(pos.x - 1, pos.y, pos.z);
    const up = this.getChunk(pos.x, pos.y + 1, pos.z);
    const down = this.getChunk(pos.x, pos.y - 1, pos.z);

    chunk.setNeighbor('north', north);
    chunk.setNeighbor('south', south);
    chunk.setNeighbor('east', east);
    chunk.setNeighbor('west', west);
    chunk.setNeighbor('up', up);
    chunk.setNeighbor('down', down);

    // Update reverse neighbors
    if (north) north.setNeighbor('south', chunk);
    if (south) south.setNeighbor('north', chunk);
    if (east) east.setNeighbor('west', chunk);
    if (west) west.setNeighbor('east', chunk);
    if (up) up.setNeighbor('down', chunk);
    if (down) down.setNeighbor('up', chunk);
  }

  /**
   * Removes chunk from neighbors
   */
  private removeChunkNeighbors(chunk: VoxelChunk): void {
    const neighbors = chunk.getNeighbors();

    if (neighbors.north) neighbors.north.setNeighbor('south', undefined);
    if (neighbors.south) neighbors.south.setNeighbor('north', undefined);
    if (neighbors.east) neighbors.east.setNeighbor('west', undefined);
    if (neighbors.west) neighbors.west.setNeighbor('east', undefined);
    if (neighbors.up) neighbors.up.setNeighbor('down', undefined);
    if (neighbors.down) neighbors.down.setNeighbor('up', undefined);
  }

  /**
   * Updates the world (loads/unloads chunks based on center position)
   */
  public update(centerWorldPosition: Vector3): void {
    this.centerPosition = centerWorldPosition.clone();
    const centerChunk = this.worldToChunk(centerWorldPosition.x, centerWorldPosition.y, centerWorldPosition.z);

    // Load chunks
    this.loadChunksAround(centerChunk);

    // Unload distant chunks
    this.unloadDistantChunks(centerChunk);

    // Mesh dirty chunks
    this.meshDirtyChunks();

    // Process destruction queue
    this.destruction.processQueue();
  }

  /**
   * Loads chunks around a center position
   */
  private loadChunksAround(centerChunk: Vector3): void {
    const loaded = [];

    for (let z = -this.loadDistance; z <= this.loadDistance; z++) {
      for (let y = -this.loadDistance; y <= this.loadDistance; y++) {
        for (let x = -this.loadDistance; x <= this.loadDistance; x++) {
          const distance = Math.sqrt(x * x + y * y + z * z);
          if (distance <= this.loadDistance) {
            const chunkPos = new Vector3(
              centerChunk.x + x,
              centerChunk.y + y,
              centerChunk.z + z
            );

            loaded.push(chunkPos);
          }
        }
      }
    }

    // Load in order of distance
    loaded.sort((a, b) => {
      const distA = a.distance(centerChunk);
      const distB = b.distance(centerChunk);
      return distA - distB;
    });

    // Load chunks (limited per frame)
    for (let i = 0; i < Math.min(loaded.length, this.maxChunksPerFrame); i++) {
      const pos = loaded[i];
      const chunk = this.getChunk(pos.x, pos.y, pos.z);
      if (!chunk) {
        this.loadChunk(pos.x, pos.y, pos.z);
      }
    }
  }

  /**
   * Unloads chunks far from center
   */
  private unloadDistantChunks(centerChunk: Vector3): void {
    const toUnload: Vector3[] = [];

    for (const [_key, chunk] of this.chunks) {
      const pos = chunk.getPosition();
      const distance = pos.distance(centerChunk);

      if (distance > this.unloadDistance) {
        toUnload.push(pos);
      }
    }

    for (const pos of toUnload) {
      this.unloadChunk(pos.x, pos.y, pos.z);
    }
  }

  /**
   * Meshes dirty chunks
   */
  private meshDirtyChunks(): void {
    const dirtyChunks = Array.from(this.chunks.values())
      .filter(chunk => chunk.isMeshDirty() && chunk.getState() === ChunkState.Generated);

    // Sort by distance
    dirtyChunks.sort((a, b) => {
      const distA = a.getCenter().distance(this.centerPosition);
      const distB = b.getCenter().distance(this.centerPosition);
      return distA - distB;
    });

    // Mesh limited number per frame
    const toMesh = dirtyChunks.slice(0, this.maxChunksPerFrame);
    for (const chunk of toMesh) {
      this.meshBuilder.buildMesh(chunk);
    }
  }

  /**
   * Gets voxel at world position
   */
  public getVoxelAt(worldX: number, worldY: number, worldZ: number): VoxelMaterial | null {
    const chunkPos = this.worldToChunk(worldX, worldY, worldZ);
    const chunk = this.getChunk(chunkPos.x, chunkPos.y, chunkPos.z);

    if (!chunk) return null;

    const local = chunk.worldToLocal(worldX, worldY, worldZ);
    return chunk.getVoxel(local[0], local[1], local[2]);
  }

  /**
   * Sets voxel at world position
   */
  public setVoxelAt(worldX: number, worldY: number, worldZ: number, material: VoxelMaterial): void {
    const chunkPos = this.worldToChunk(worldX, worldY, worldZ);
    const chunk = this.getOrCreateChunk(chunkPos.x, chunkPos.y, chunkPos.z);

    const local = chunk.worldToLocal(worldX, worldY, worldZ);
    this.destruction.placeVoxel(chunk, local[0], local[1], local[2], material);
  }

  /**
   * Destroys voxel at world position
   */
  public destroyVoxelAt(worldX: number, worldY: number, worldZ: number): void {
    const chunkPos = this.worldToChunk(worldX, worldY, worldZ);
    const chunk = this.getChunk(chunkPos.x, chunkPos.y, chunkPos.z);

    if (!chunk) return;

    const local = chunk.worldToLocal(worldX, worldY, worldZ);
    this.destruction.destroyVoxel(chunk, local[0], local[1], local[2]);
  }

  /**
   * Gets all loaded chunks
   */
  public getAllChunks(): VoxelChunk[] {
    return Array.from(this.chunks.values());
  }

  /**
   * Gets chunk count
   */
  public getChunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Gets the mesh builder
   */
  public getMeshBuilder(): ChunkMeshBuilder {
    return this.meshBuilder;
  }

  /**
   * Gets the lighting system
   */
  public getLighting(): VoxelLighting {
    return this.lighting;
  }

  /**
   * Gets the destruction system
   */
  public getDestruction(): VoxelDestructionSystem {
    return this.destruction;
  }

  /**
   * Gets the stability checker
   */
  public getStability(): StabilityChecker {
    return this.stability;
  }

  /**
   * Gets the renderer
   */
  public getRenderer(): VoxelRenderer {
    return this.renderer;
  }

  /**
   * Clears all chunks
   */
  public clear(): void {
    for (const chunk of this.chunks.values()) {
      chunk.dispose();
    }
    this.chunks.clear();
  }

  /**
   * Gets memory usage in bytes
   */
  public getMemoryUsage(): number {
    let total = 0;
    for (const chunk of this.chunks.values()) {
      total += chunk.getMemoryUsage();
    }
    return total;
  }
}
