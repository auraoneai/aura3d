/**
 * ChunkManager.ts
 * Advanced chunk loading system with view distance, LOD, and memory management
 */

import { Vector3 } from '../../../src/math/Vector3';
import { VoxelWorld } from '../../../src/voxel/VoxelWorld';
import { VoxelChunk } from '../../../src/voxel/VoxelChunk';
import { TerrainGenerator } from './TerrainGenerator';

/**
 * Chunk priority for loading
 */
interface ChunkPriority {
  position: Vector3;
  distance: number;
  priority: number;
}

/**
 * LOD level information
 */
interface LODLevel {
  distance: number;
  meshQuality: number;
  updateFrequency: number;
}

/**
 * Chunk loading statistics
 */
export interface ChunkStats {
  totalChunks: number;
  loadedChunks: number;
  generatingChunks: number;
  meshingChunks: number;
  memoryUsage: number;
  chunksPerSecond: number;
}

/**
 * Advanced chunk manager with streaming and LOD
 */
export class ChunkManager {
  private world: VoxelWorld;
  private generator: TerrainGenerator;
  private viewDistance: number = 8;
  private verticalViewDistance: number = 4;
  private unloadDistance: number = 12;

  private loadQueue: ChunkPriority[] = [];
  private unloadQueue: Vector3[] = [];
  private generationQueue: Vector3[] = [];
  private meshingQueue: Vector3[] = [];

  private maxChunksPerFrame: number = 4;
  private maxGenerationsPerFrame: number = 2;
  private maxMeshesPerFrame: number = 3;

  private centerPosition: Vector3 = new Vector3(0, 0, 0);
  private lastCenterChunk: Vector3 = new Vector3(0, 0, 0);

  private lodLevels: LODLevel[] = [];
  private frameCount: number = 0;
  private chunksLoadedThisSecond: number = 0;
  private lastSecondTime: number = 0;

  private memoryLimit: number = 500 * 1024 * 1024; // 500MB

  constructor(world: VoxelWorld, generator: TerrainGenerator) {
    this.world = world;
    this.generator = generator;
    this.initializeLODLevels();
    this.lastSecondTime = performance.now();
  }

  /**
   * Initialize LOD levels
   */
  private initializeLODLevels(): void {
    this.lodLevels = [
      { distance: 4, meshQuality: 1.0, updateFrequency: 1 },
      { distance: 8, meshQuality: 0.75, updateFrequency: 5 },
      { distance: 12, meshQuality: 0.5, updateFrequency: 10 },
      { distance: 16, meshQuality: 0.25, updateFrequency: 20 }
    ];
  }

  /**
   * Set view distance
   */
  public setViewDistance(distance: number): void {
    this.viewDistance = distance;
    this.unloadDistance = distance * 1.5;
    this.verticalViewDistance = Math.max(2, Math.floor(distance * 0.5));
  }

  /**
   * Get view distance
   */
  public getViewDistance(): number {
    return this.viewDistance;
  }

  /**
   * Update chunk manager
   */
  public update(cameraPosition: Vector3, deltaTime: number): void {
    this.centerPosition = cameraPosition.clone();
    const centerChunk = this.world.worldToChunk(
      cameraPosition.x,
      cameraPosition.y,
      cameraPosition.z
    );

    // Check if we need to update chunks
    const chunkChanged = !centerChunk.equals(this.lastCenterChunk);
    if (chunkChanged) {
      this.lastCenterChunk = centerChunk.clone();
      this.updateLoadQueue(centerChunk);
      this.updateUnloadQueue(centerChunk);
    }

    // Process queues
    this.processGenerationQueue();
    this.processMeshingQueue();
    this.processLoadQueue();
    this.processUnloadQueue();

    // Update statistics
    this.updateStatistics(deltaTime);

    // Check memory usage
    this.checkMemoryLimit();

    this.frameCount++;
  }

  /**
   * Update load queue based on player position
   */
  private updateLoadQueue(centerChunk: Vector3): void {
    const newChunks: ChunkPriority[] = [];

    for (let y = -this.verticalViewDistance; y <= this.verticalViewDistance; y++) {
      for (let x = -this.viewDistance; x <= this.viewDistance; x++) {
        for (let z = -this.viewDistance; z <= this.viewDistance; z++) {
          const distance = Math.sqrt(x * x + y * y + z * z);

          if (distance <= this.viewDistance) {
            const chunkPos = new Vector3(
              centerChunk.x + x,
              centerChunk.y + y,
              centerChunk.z + z
            );

            // Check if chunk already loaded
            const chunk = this.world.getChunk(chunkPos.x, chunkPos.y, chunkPos.z);
            if (!chunk) {
              // Calculate priority (closer = higher priority)
              const priority = 1000 - distance;

              newChunks.push({
                position: chunkPos,
                distance: distance,
                priority: priority
              });
            }
          }
        }
      }
    }

    // Sort by priority
    newChunks.sort((a, b) => b.priority - a.priority);

    this.loadQueue = newChunks;
  }

  /**
   * Update unload queue
   */
  private updateUnloadQueue(centerChunk: Vector3): void {
    const toUnload: Vector3[] = [];
    const chunks = this.world.getAllChunks();

    for (const chunk of chunks) {
      const pos = chunk.getPosition();
      const dx = pos.x - centerChunk.x;
      const dy = pos.y - centerChunk.y;
      const dz = pos.z - centerChunk.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance > this.unloadDistance) {
        toUnload.push(pos);
      }
    }

    this.unloadQueue = toUnload;
  }

  /**
   * Process load queue
   */
  private processLoadQueue(): void {
    const toLoad = this.loadQueue.splice(0, this.maxChunksPerFrame);

    for (const item of toLoad) {
      const pos = item.position;

      // Check if chunk exists
      let chunk = this.world.getChunk(pos.x, pos.y, pos.z);
      if (!chunk) {
        // Create chunk and add to generation queue
        chunk = this.world.getOrCreateChunk(pos.x, pos.y, pos.z);
        this.generationQueue.push(pos);
      }
    }
  }

  /**
   * Process generation queue
   */
  private processGenerationQueue(): void {
    const toGenerate = this.generationQueue.splice(0, this.maxGenerationsPerFrame);

    for (const pos of toGenerate) {
      const chunk = this.world.getChunk(pos.x, pos.y, pos.z);
      if (chunk && chunk.isEmpty()) {
        // Generate terrain
        this.generator.generate(chunk);

        // Add to meshing queue
        this.meshingQueue.push(pos);

        // Update neighbors
        this.updateNeighborMeshes(chunk);

        this.chunksLoadedThisSecond++;
      }
    }
  }

  /**
   * Process meshing queue
   */
  private processMeshingQueue(): void {
    const toMesh = this.meshingQueue.splice(0, this.maxMeshesPerFrame);

    for (const pos of toMesh) {
      const chunk = this.world.getChunk(pos.x, pos.y, pos.z);
      if (chunk && chunk.isMeshDirty()) {
        // Get LOD level
        const distance = pos.distanceTo(this.lastCenterChunk);
        const lodLevel = this.getLODLevel(distance);

        // Build mesh with appropriate quality
        const meshBuilder = this.world.getMeshBuilder();
        meshBuilder.buildMesh(chunk);
      }
    }
  }

  /**
   * Process unload queue
   */
  private processUnloadQueue(): void {
    for (const pos of this.unloadQueue) {
      this.world.unloadChunk(pos.x, pos.y, pos.z);
    }
    this.unloadQueue = [];
  }

  /**
   * Update neighbor meshes when a chunk is generated
   */
  private updateNeighborMeshes(chunk: VoxelChunk): void {
    const pos = chunk.getPosition();
    const neighbors = [
      new Vector3(pos.x + 1, pos.y, pos.z),
      new Vector3(pos.x - 1, pos.y, pos.z),
      new Vector3(pos.x, pos.y + 1, pos.z),
      new Vector3(pos.x, pos.y - 1, pos.z),
      new Vector3(pos.x, pos.y, pos.z + 1),
      new Vector3(pos.x, pos.y, pos.z - 1)
    ];

    for (const neighborPos of neighbors) {
      const neighbor = this.world.getChunk(neighborPos.x, neighborPos.y, neighborPos.z);
      if (neighbor && !neighbor.isEmpty()) {
        neighbor.markMeshDirty();

        // Add to meshing queue if not already there
        const inQueue = this.meshingQueue.some(p =>
          p.x === neighborPos.x && p.y === neighborPos.y && p.z === neighborPos.z
        );
        if (!inQueue) {
          this.meshingQueue.push(neighborPos);
        }
      }
    }
  }

  /**
   * Get LOD level for distance
   */
  private getLODLevel(distance: number): LODLevel {
    for (const level of this.lodLevels) {
      if (distance <= level.distance) {
        return level;
      }
    }
    return this.lodLevels[this.lodLevels.length - 1];
  }

  /**
   * Update statistics
   */
  private updateStatistics(deltaTime: number): void {
    const currentTime = performance.now();
    if (currentTime - this.lastSecondTime >= 1000) {
      this.lastSecondTime = currentTime;
      this.chunksLoadedThisSecond = 0;
    }
  }

  /**
   * Check memory limit and unload distant chunks if needed
   */
  private checkMemoryLimit(): void {
    const memoryUsage = this.world.getMemoryUsage();

    if (memoryUsage > this.memoryLimit) {
      // Get all chunks sorted by distance
      const chunks = this.world.getAllChunks();
      const sortedChunks = chunks
        .map(chunk => ({
          chunk,
          distance: chunk.getPosition().distance(this.lastCenterChunk)
        }))
        .sort((a, b) => b.distance - a.distance);

      // Unload furthest chunks until under limit
      for (const item of sortedChunks) {
        if (this.world.getMemoryUsage() <= this.memoryLimit * 0.9) {
          break;
        }

        const pos = item.chunk.getPosition();
        this.world.unloadChunk(pos.x, pos.y, pos.z);
      }
    }
  }

  /**
   * Get chunk statistics
   */
  public getStats(): ChunkStats {
    const chunks = this.world.getAllChunks();

    return {
      totalChunks: chunks.length,
      loadedChunks: chunks.length,
      generatingChunks: this.generationQueue.length,
      meshingChunks: this.meshingQueue.length,
      memoryUsage: this.world.getMemoryUsage(),
      chunksPerSecond: this.chunksLoadedThisSecond
    };
  }

  /**
   * Pre-load chunks in a radius
   */
  public preloadChunks(centerPos: Vector3, radius: number): void {
    const centerChunk = this.world.worldToChunk(centerPos.x, centerPos.y, centerPos.z);

    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        for (let z = -radius; z <= radius; z++) {
          const distance = Math.sqrt(x * x + y * y + z * z);
          if (distance <= radius) {
            const chunkPos = new Vector3(
              centerChunk.x + x,
              centerChunk.y + y,
              centerChunk.z + z
            );

            let chunk = this.world.getChunk(chunkPos.x, chunkPos.y, chunkPos.z);
            if (!chunk) {
              chunk = this.world.getOrCreateChunk(chunkPos.x, chunkPos.y, chunkPos.z);
              this.generator.generate(chunk);
              const meshBuilder = this.world.getMeshBuilder();
              meshBuilder.buildMesh(chunk);
            }
          }
        }
      }
    }
  }

  /**
   * Clear all chunks
   */
  public clear(): void {
    this.loadQueue = [];
    this.unloadQueue = [];
    this.generationQueue = [];
    this.meshingQueue = [];
    this.world.clear();
  }

  /**
   * Set memory limit in bytes
   */
  public setMemoryLimit(bytes: number): void {
    this.memoryLimit = bytes;
  }

  /**
   * Get memory limit
   */
  public getMemoryLimit(): number {
    return this.memoryLimit;
  }
}
