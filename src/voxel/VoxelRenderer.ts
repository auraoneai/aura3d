import { Vector3 } from '../math/Vector3';
import { Matrix4 } from '../math/Matrix4';
import { Logger } from '../core/Logger';
import { VoxelChunk, ChunkState } from './VoxelChunk';

/**
 * Frustum plane
 */
interface Plane {
  normal: Vector3;
  distance: number;
}

/**
 * Frustum for culling
 */
class Frustum {
  private planes: Plane[] = [];

  /**
   * Extracts frustum planes from view-projection matrix
   */
  public extractFromMatrix(matrix: Matrix4): void {
    const m = matrix.elements;

    this.planes = [
      // Left
      {
        normal: new Vector3(m[3] + m[0], m[7] + m[4], m[11] + m[8]).normalize(),
        distance: m[15] + m[12]
      },
      // Right
      {
        normal: new Vector3(m[3] - m[0], m[7] - m[4], m[11] - m[8]).normalize(),
        distance: m[15] - m[12]
      },
      // Bottom
      {
        normal: new Vector3(m[3] + m[1], m[7] + m[5], m[11] + m[9]).normalize(),
        distance: m[15] + m[13]
      },
      // Top
      {
        normal: new Vector3(m[3] - m[1], m[7] - m[5], m[11] - m[9]).normalize(),
        distance: m[15] - m[13]
      },
      // Near
      {
        normal: new Vector3(m[3] + m[2], m[7] + m[6], m[11] + m[10]).normalize(),
        distance: m[15] + m[14]
      },
      // Far
      {
        normal: new Vector3(m[3] - m[2], m[7] - m[6], m[11] - m[10]).normalize(),
        distance: m[15] - m[14]
      }
    ];
  }

  /**
   * Tests if a bounding box intersects the frustum
   */
  public intersectsBox(min: Vector3, max: Vector3): boolean {
    for (const plane of this.planes) {
      const p = new Vector3(
        plane.normal.x > 0 ? max.x : min.x,
        plane.normal.y > 0 ? max.y : min.y,
        plane.normal.z > 0 ? max.z : min.z
      );

      if (plane.normal.dot(p) + plane.distance < 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Tests if a sphere intersects the frustum
   */
  public intersectsSphere(center: Vector3, radius: number): boolean {
    for (const plane of this.planes) {
      const distance = plane.normal.dot(center) + plane.distance;
      if (distance < -radius) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Render batch for efficient rendering
 */
interface RenderBatch {
  chunks: VoxelChunk[];
  distance: number;
}

/**
 * VoxelRenderer - Efficient voxel chunk rendering system
 *
 * Manages rendering of voxel chunks with:
 * - Frustum culling for visibility testing
 * - Distance-based LOD
 * - Occlusion culling
 * - Render batching
 * - Priority-based rendering
 *
 * Performance targets:
 * - 1000+ chunks at 60 FPS
 * - Frustum culling reduces draw calls by 70-90%
 * - Distance sorting for transparency
 *
 * @example
 * ```typescript
 * const renderer = new VoxelRenderer();
 * renderer.setCameraMatrix(viewProjectionMatrix);
 * const visible = renderer.cullChunks(allChunks);
 * renderer.sortByDistance(visible, cameraPos);
 * ```
 */
export class VoxelRenderer {
  private frustum: Frustum;
  private logger: Logger;
  private renderDistance: number = 16;
  private maxChunksPerFrame: number = 1000;

  constructor() {
    this.frustum = new Frustum();
    this.logger = Logger.getInstance();
  }

  /**
   * Sets the render distance in chunks
   */
  public setRenderDistance(distance: number): void {
    this.renderDistance = distance;
  }

  /**
   * Gets the render distance
   */
  public getRenderDistance(): number {
    return this.renderDistance;
  }

  /**
   * Sets maximum chunks to render per frame
   */
  public setMaxChunksPerFrame(count: number): void {
    this.maxChunksPerFrame = count;
  }

  /**
   * Updates the frustum from camera view-projection matrix
   */
  public setCameraMatrix(viewProjectionMatrix: Matrix4): void {
    this.frustum.extractFromMatrix(viewProjectionMatrix);
  }

  /**
   * Performs frustum culling on chunks
   */
  public cullChunks(chunks: VoxelChunk[]): VoxelChunk[] {
    const visibleChunks: VoxelChunk[] = [];

    for (const chunk of chunks) {
      // Skip chunks that aren't ready
      if (chunk.getState() !== ChunkState.Ready && chunk.getState() !== ChunkState.Meshed) {
        continue;
      }

      // Skip empty chunks
      if (chunk.isEmpty()) {
        continue;
      }

      // Frustum culling
      if (this.isChunkVisible(chunk)) {
        visibleChunks.push(chunk);
      }
    }

    return visibleChunks;
  }

  /**
   * Tests if a chunk is visible in the frustum
   */
  public isChunkVisible(chunk: VoxelChunk): boolean {
    const min = chunk.getBoundsMin();
    const max = chunk.getBoundsMax();
    return this.frustum.intersectsBox(min, max);
  }

  /**
   * Performs distance culling based on camera position
   */
  public cullByDistance(chunks: VoxelChunk[], cameraPosition: Vector3): VoxelChunk[] {
    const visibleChunks: VoxelChunk[] = [];
    const chunkSize = chunks.length > 0 ? chunks[0]!.getSize() : 16;
    const maxDistanceSquared = (this.renderDistance * chunkSize) ** 2;

    for (const chunk of chunks) {
      const center = chunk.getCenter();
      const distanceSquared = Vector3.distanceSquared(cameraPosition, center);

      if (distanceSquared <= maxDistanceSquared) {
        visibleChunks.push(chunk);
      }
    }

    return visibleChunks;
  }

  /**
   * Sorts chunks by distance from camera (for transparency)
   */
  public sortByDistance(chunks: VoxelChunk[], cameraPosition: Vector3): VoxelChunk[] {
    return chunks.sort((a, b) => {
      const distA = Vector3.distanceSquared(cameraPosition, a.getCenter());
      const distB = Vector3.distanceSquared(cameraPosition, b.getCenter());
      return distA - distB;
    });
  }

  /**
   * Sorts chunks by distance (far to near for opaque rendering)
   */
  public sortFarToNear(chunks: VoxelChunk[], cameraPosition: Vector3): VoxelChunk[] {
    return chunks.sort((a, b) => {
      const distA = Vector3.distanceSquared(cameraPosition, a.getCenter());
      const distB = Vector3.distanceSquared(cameraPosition, b.getCenter());
      return distB - distA;
    });
  }

  /**
   * Creates render batches for efficient rendering
   */
  public createRenderBatches(chunks: VoxelChunk[], cameraPosition: Vector3): RenderBatch[] {
    const batches: RenderBatch[] = [];
    const batchSize = 64;

    // Sort by distance first
    const sorted = this.sortByDistance(chunks, cameraPosition);

    for (let i = 0; i < sorted.length; i += batchSize) {
      const batchChunks = sorted.slice(i, Math.min(i + batchSize, sorted.length));
      const centerChunk = batchChunks[Math.floor(batchChunks.length / 2)]!;
      const distance = Vector3.distance(cameraPosition, centerChunk.getCenter());

      batches.push({
        chunks: batchChunks,
        distance
      });
    }

    return batches;
  }

  /**
   * Performs occlusion culling (simple box-based)
   */
  public occlusionCull(chunks: VoxelChunk[], cameraPosition: Vector3): VoxelChunk[] {
    const visibleChunks: VoxelChunk[] = [];
    const occluders = new Set<VoxelChunk>();

    // Sort by distance (near to far)
    const sorted = this.sortByDistance(chunks, cameraPosition);

    for (const chunk of sorted) {
      let occluded = false;

      // Check if this chunk is occluded by any previous chunk
      for (const occluder of occluders) {
        if (this.isOccludedBy(chunk, occluder, cameraPosition)) {
          occluded = true;
          break;
        }
      }

      if (!occluded) {
        visibleChunks.push(chunk);

        // Full chunks can act as occluders
        if (chunk.isFull()) {
          occluders.add(chunk);
        }
      }
    }

    return visibleChunks;
  }

  /**
   * Tests if a chunk is occluded by another chunk
   */
  private isOccludedBy(chunk: VoxelChunk, occluder: VoxelChunk, cameraPosition: Vector3): boolean {
    // Simple test: if occluder is between camera and chunk, and occluder is full
    if (!occluder.isFull()) {
      return false;
    }

    const chunkCenter = chunk.getCenter();
    const occluderCenter = occluder.getCenter();

    const toChunk = chunkCenter.clone().sub(cameraPosition);
    const toOccluder = occluderCenter.clone().sub(cameraPosition);

    // If occluder is farther than chunk, it can't occlude
    if (toOccluder.lengthSquared() > toChunk.lengthSquared()) {
      return false;
    }

    // Check if occluder is in the direction of chunk
    const dot = toChunk.normalize().dot(toOccluder.normalize());
    return dot > 0.9; // Aligned with chunk direction
  }

  /**
   * Gets chunks that need meshing, prioritized by distance
   */
  public getChunksNeedingMesh(chunks: VoxelChunk[], cameraPosition: Vector3, maxCount: number = 10): VoxelChunk[] {
    const needsMesh = chunks.filter(chunk =>
      chunk.isMeshDirty() &&
      (chunk.getState() === ChunkState.Generated || chunk.getState() === ChunkState.Meshed)
    );

    // Sort by distance
    const sorted = this.sortByDistance(needsMesh, cameraPosition);

    return sorted.slice(0, maxCount);
  }

  /**
   * Gets chunks in view frustum and render distance
   */
  public getVisibleChunks(chunks: VoxelChunk[], cameraPosition: Vector3): VoxelChunk[] {
    // First pass: distance culling
    let visible = this.cullByDistance(chunks, cameraPosition);

    // Second pass: frustum culling
    visible = this.cullChunks(visible);

    // Limit to max chunks per frame
    if (visible.length > this.maxChunksPerFrame) {
      visible = this.sortByDistance(visible, cameraPosition);
      visible = visible.slice(0, this.maxChunksPerFrame);
    }

    return visible;
  }

  /**
   * Calculates LOD level based on distance
   */
  public calculateLOD(chunk: VoxelChunk, cameraPosition: Vector3): number {
    const distance = Vector3.distance(cameraPosition, chunk.getCenter());
    const chunkSize = chunk.getSize();

    const lod0Distance = chunkSize * 4;
    const lod1Distance = chunkSize * 8;
    const lod2Distance = chunkSize * 16;

    if (distance < lod0Distance) return 0;
    if (distance < lod1Distance) return 1;
    if (distance < lod2Distance) return 2;
    return 3;
  }

  /**
   * Gets render statistics
   */
  public getStatistics(chunks: VoxelChunk[], visibleChunks: VoxelChunk[]): {
    totalChunks: number;
    visibleChunks: number;
    culledChunks: number;
    emptyChunks: number;
    meshingChunks: number;
    readyChunks: number;
  } {
    const empty = chunks.filter(c => c.isEmpty()).length;
    const meshing = chunks.filter(c => c.getState() === ChunkState.Meshing).length;
    const ready = chunks.filter(c => c.getState() === ChunkState.Ready).length;

    return {
      totalChunks: chunks.length,
      visibleChunks: visibleChunks.length,
      culledChunks: chunks.length - visibleChunks.length,
      emptyChunks: empty,
      meshingChunks: meshing,
      readyChunks: ready
    };
  }

  /**
   * Tests sphere visibility in frustum
   */
  public isSphereVisible(center: Vector3, radius: number): boolean {
    return this.frustum.intersectsSphere(center, radius);
  }

  /**
   * Tests box visibility in frustum
   */
  public isBoxVisible(min: Vector3, max: Vector3): boolean {
    return this.frustum.intersectsBox(min, max);
  }
}
