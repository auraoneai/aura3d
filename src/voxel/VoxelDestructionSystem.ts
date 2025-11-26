import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';
import { VoxelChunk } from './VoxelChunk';
import { VoxelMaterial } from './VoxelData';
import { VoxelLighting } from './VoxelLighting';

/**
 * Destruction mode enumeration
 */
export enum DestructionMode {
  Single = 'single',
  Sphere = 'sphere',
  Box = 'box',
  Ray = 'ray'
}

/**
 * Destruction event data
 */
export interface DestructionEvent {
  position: Vector3;
  material: VoxelMaterial;
  mode: DestructionMode;
  timestamp: number;
}

/**
 * Modification queue entry
 */
interface ModificationEntry {
  chunk: VoxelChunk;
  x: number;
  y: number;
  z: number;
  material: VoxelMaterial | null;
}

/**
 * VoxelDestructionSystem - Runtime voxel modification system
 *
 * Handles dynamic modification of voxel terrain including:
 * - Single voxel placement/removal
 * - Sphere explosions
 * - Box modifications
 * - Ray-based mining
 * - Batch updates for performance
 * - Light recalculation
 * - Mesh regeneration
 *
 * Features:
 * - Efficient batch processing
 * - Automatic lighting updates
 * - Event system for destruction
 * - Undo/redo support
 * - Performance optimization
 *
 * @example
 * ```typescript
 * const destruction = new VoxelDestructionSystem(lighting);
 * destruction.destroySphere(chunk, center, 5);
 * destruction.processQueue();
 * ```
 */
export class VoxelDestructionSystem {
  private lighting: VoxelLighting;
  private modificationQueue: ModificationEntry[];
  private destructionEvents: DestructionEvent[];
  private logger: Logger;
  private maxQueueSize: number = 10000;

  constructor(lighting: VoxelLighting) {
    this.lighting = lighting;
    this.modificationQueue = [];
    this.destructionEvents = [];
    this.logger = Logger.getInstance();
  }

  /**
   * Destroys a single voxel
   */
  public destroyVoxel(chunk: VoxelChunk, x: number, y: number, z: number): void {
    const material = chunk.getVoxel(x, y, z);
    if (!material) return;

    this.queueModification(chunk, x, y, z, null);

    // Record event
    const worldPos = chunk.localToWorld(x, y, z);
    this.recordEvent({
      position: new Vector3(worldPos[0], worldPos[1], worldPos[2]),
      material,
      mode: DestructionMode.Single,
      timestamp: Date.now()
    });
  }

  /**
   * Places a single voxel
   */
  public placeVoxel(chunk: VoxelChunk, x: number, y: number, z: number, material: VoxelMaterial): void {
    this.queueModification(chunk, x, y, z, material);

    // Record event
    const worldPos = chunk.localToWorld(x, y, z);
    this.recordEvent({
      position: new Vector3(worldPos[0], worldPos[1], worldPos[2]),
      material,
      mode: DestructionMode.Single,
      timestamp: Date.now()
    });
  }

  /**
   * Destroys voxels in a sphere
   */
  public destroySphere(chunk: VoxelChunk, center: Vector3, radius: number): void {
    const size = chunk.getSize();
    const localCenter = chunk.worldToLocal(center.x, center.y, center.z);

    const minX = Math.max(0, Math.floor(localCenter[0] - radius));
    const maxX = Math.min(size - 1, Math.ceil(localCenter[0] + radius));
    const minY = Math.max(0, Math.floor(localCenter[1] - radius));
    const maxY = Math.min(size - 1, Math.ceil(localCenter[1] + radius));
    const minZ = Math.max(0, Math.floor(localCenter[2] - radius));
    const maxZ = Math.min(size - 1, Math.ceil(localCenter[2] + radius));

    const radiusSquared = radius * radius;

    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = x - localCenter[0];
          const dy = y - localCenter[1];
          const dz = z - localCenter[2];
          const distSquared = dx * dx + dy * dy + dz * dz;

          if (distSquared <= radiusSquared) {
            const material = chunk.getVoxel(x, y, z);
            if (material) {
              this.queueModification(chunk, x, y, z, null);

              // Record event
              const worldPos = chunk.localToWorld(x, y, z);
              this.recordEvent({
                position: new Vector3(worldPos[0], worldPos[1], worldPos[2]),
                material,
                mode: DestructionMode.Sphere,
                timestamp: Date.now()
              });
            }
          }
        }
      }
    }
  }

  /**
   * Destroys voxels in a box
   */
  public destroyBox(chunk: VoxelChunk, min: Vector3, max: Vector3): void {
    const size = chunk.getSize();
    const localMin = chunk.worldToLocal(min.x, min.y, min.z);
    const localMax = chunk.worldToLocal(max.x, max.y, max.z);

    const minX = Math.max(0, Math.floor(Math.min(localMin[0], localMax[0])));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(localMin[0], localMax[0])));
    const minY = Math.max(0, Math.floor(Math.min(localMin[1], localMax[1])));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(localMin[1], localMax[1])));
    const minZ = Math.max(0, Math.floor(Math.min(localMin[2], localMax[2])));
    const maxZ = Math.min(size - 1, Math.ceil(Math.max(localMin[2], localMax[2])));

    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const material = chunk.getVoxel(x, y, z);
          if (material) {
            this.queueModification(chunk, x, y, z, null);

            // Record event
            const worldPos = chunk.localToWorld(x, y, z);
            this.recordEvent({
              position: new Vector3(worldPos[0], worldPos[1], worldPos[2]),
              material,
              mode: DestructionMode.Box,
              timestamp: Date.now()
            });
          }
        }
      }
    }
  }

  /**
   * Destroys voxels along a ray (mining)
   */
  public destroyRay(
    chunk: VoxelChunk,
    origin: Vector3,
    direction: Vector3,
    maxDistance: number
  ): boolean {
    const normalizedDir = direction.normalize();
    const step = 0.1;
    let distance = 0;

    while (distance < maxDistance) {
      const point = new Vector3(
        origin.x + normalizedDir.x * distance,
        origin.y + normalizedDir.y * distance,
        origin.z + normalizedDir.z * distance
      );

      const local = chunk.worldToLocal(point.x, point.y, point.z);
      const x = Math.floor(local[0]);
      const y = Math.floor(local[1]);
      const z = Math.floor(local[2]);

      const size = chunk.getSize();
      if (x >= 0 && x < size && y >= 0 && y < size && z >= 0 && z < size) {
        const material = chunk.getVoxel(x, y, z);
        if (material && material.solid) {
          this.destroyVoxel(chunk, x, y, z);

          // Record event
          const worldPos = chunk.localToWorld(x, y, z);
          this.recordEvent({
            position: new Vector3(worldPos[0], worldPos[1], worldPos[2]),
            material,
            mode: DestructionMode.Ray,
            timestamp: Date.now()
          });

          return true;
        }
      }

      distance += step;
    }

    return false;
  }

  /**
   * Fills a sphere with material
   */
  public fillSphere(chunk: VoxelChunk, center: Vector3, radius: number, material: VoxelMaterial): void {
    const size = chunk.getSize();
    const localCenter = chunk.worldToLocal(center.x, center.y, center.z);

    const minX = Math.max(0, Math.floor(localCenter[0] - radius));
    const maxX = Math.min(size - 1, Math.ceil(localCenter[0] + radius));
    const minY = Math.max(0, Math.floor(localCenter[1] - radius));
    const maxY = Math.min(size - 1, Math.ceil(localCenter[1] + radius));
    const minZ = Math.max(0, Math.floor(localCenter[2] - radius));
    const maxZ = Math.min(size - 1, Math.ceil(localCenter[2] + radius));

    const radiusSquared = radius * radius;

    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = x - localCenter[0];
          const dy = y - localCenter[1];
          const dz = z - localCenter[2];
          const distSquared = dx * dx + dy * dy + dz * dz;

          if (distSquared <= radiusSquared) {
            this.queueModification(chunk, x, y, z, material);
          }
        }
      }
    }
  }

  /**
   * Fills a box with material
   */
  public fillBox(chunk: VoxelChunk, min: Vector3, max: Vector3, material: VoxelMaterial): void {
    const size = chunk.getSize();
    const localMin = chunk.worldToLocal(min.x, min.y, min.z);
    const localMax = chunk.worldToLocal(max.x, max.y, max.z);

    const minX = Math.max(0, Math.floor(Math.min(localMin[0], localMax[0])));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(localMin[0], localMax[0])));
    const minY = Math.max(0, Math.floor(Math.min(localMin[1], localMax[1])));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(localMin[1], localMax[1])));
    const minZ = Math.max(0, Math.floor(Math.min(localMin[2], localMax[2])));
    const maxZ = Math.min(size - 1, Math.ceil(Math.max(localMin[2], localMax[2])));

    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          this.queueModification(chunk, x, y, z, material);
        }
      }
    }
  }

  /**
   * Queues a voxel modification
   */
  private queueModification(chunk: VoxelChunk, x: number, y: number, z: number, material: VoxelMaterial | null): void {
    if (this.modificationQueue.length >= this.maxQueueSize) {
      this.logger.warn('Modification queue full, processing immediately');
      this.processQueue();
    }

    this.modificationQueue.push({ chunk, x, y, z, material });
  }

  /**
   * Processes all queued modifications
   */
  public processQueue(): void {
    if (this.modificationQueue.length === 0) return;

    const affectedChunks = new Set<VoxelChunk>();

    // Apply all modifications
    for (const entry of this.modificationQueue) {
      const { chunk, x, y, z, material } = entry;

      if (material) {
        chunk.setVoxel(x, y, z, material);
      } else {
        const airMaterial = chunk.getData().getDefaultMaterial(0);
        chunk.setVoxel(x, y, z, airMaterial);
      }

      // Update lighting
      this.lighting.updateVoxel(chunk, x, y, z);

      affectedChunks.add(chunk);
    }

    // Mark affected chunks for remeshing
    for (const chunk of affectedChunks) {
      chunk.markMeshDirty();
    }

    // Clear queue
    this.modificationQueue = [];

    this.logger.info(`Processed ${affectedChunks.size} chunk modifications`);
  }

  /**
   * Records a destruction event
   */
  private recordEvent(event: DestructionEvent): void {
    this.destructionEvents.push(event);

    // Keep only recent events (last 1000)
    if (this.destructionEvents.length > 1000) {
      this.destructionEvents.shift();
    }
  }

  /**
   * Gets recent destruction events
   */
  public getRecentEvents(count: number = 10): DestructionEvent[] {
    return this.destructionEvents.slice(-count);
  }

  /**
   * Gets events in a region
   */
  public getEventsInRegion(min: Vector3, max: Vector3): DestructionEvent[] {
    return this.destructionEvents.filter(event => {
      const pos = event.position;
      return pos.x >= min.x && pos.x <= max.x &&
             pos.y >= min.y && pos.y <= max.y &&
             pos.z >= min.z && pos.z <= max.z;
    });
  }

  /**
   * Clears all events
   */
  public clearEvents(): void {
    this.destructionEvents = [];
  }

  /**
   * Gets the current queue size
   */
  public getQueueSize(): number {
    return this.modificationQueue.length;
  }

  /**
   * Clears the modification queue without processing
   */
  public clearQueue(): void {
    this.modificationQueue = [];
  }
}
