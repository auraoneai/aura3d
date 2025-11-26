import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';
import { VoxelChunk } from './VoxelChunk';

/**
 * Voxel collider type
 */
export enum ColliderType {
  Box = 'box',
  Mesh = 'mesh',
  Simplified = 'simplified'
}

/**
 * Box collider data
 */
export interface BoxCollider {
  type: ColliderType.Box;
  min: Vector3;
  max: Vector3;
}

/**
 * Mesh collider data
 */
export interface MeshCollider {
  type: ColliderType.Mesh;
  vertices: Float32Array;
  indices: Uint32Array;
}

/**
 * Simplified collider (combined boxes)
 */
export interface SimplifiedCollider {
  type: ColliderType.Simplified;
  boxes: Array<{ min: Vector3; max: Vector3 }>;
}

/**
 * Ray cast result
 */
export interface RayCastResult {
  hit: boolean;
  point: Vector3;
  normal: Vector3;
  distance: number;
  voxel: { x: number; y: number; z: number };
}

/**
 * VoxelPhysics - Physics integration for voxel systems
 *
 * Provides physics collision detection and response for voxel terrain.
 * Generates colliders from voxel data for integration with physics engines.
 *
 * Features:
 * - Box collider generation
 * - Mesh collider generation from voxel geometry
 * - Simplified collider merging for performance
 * - Ray casting through voxel grid
 * - AABB intersection testing
 * - Sphere collision detection
 *
 * @example
 * ```typescript
 * const physics = new VoxelPhysics();
 * const collider = physics.generateBoxCollider(chunk);
 * const rayResult = physics.rayCast(chunk, origin, direction, 100);
 * ```
 */
export class VoxelPhysics {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Generates a box collider for the entire chunk
   */
  public generateBoxCollider(chunk: VoxelChunk): BoxCollider | null {
    const min = chunk.getBoundsMin();
    const max = chunk.getBoundsMax();

    if (chunk.isEmpty()) {
      return null;
    }

    return {
      type: ColliderType.Box,
      min,
      max
    };
  }

  /**
   * Generates a mesh collider from chunk mesh data
   */
  public generateMeshCollider(chunk: VoxelChunk): MeshCollider | null {
    const meshData = chunk.getMeshData();
    if (!meshData) {
      return null;
    }

    return {
      type: ColliderType.Mesh,
      vertices: meshData.vertices,
      indices: meshData.indices
    };
  }

  /**
   * Generates simplified collider by merging adjacent voxels into boxes
   */
  public generateSimplifiedCollider(chunk: VoxelChunk): SimplifiedCollider {
    const size = chunk.getSize();
    const visited = new Set<string>();
    const boxes: Array<{ min: Vector3; max: Vector3 }> = [];

    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const key = `${x},${y},${z}`;
          if (visited.has(key) || !chunk.isSolid(x, y, z)) {
            continue;
          }

          // Find the largest box starting from this voxel
          const box = this.findLargestBox(chunk, x, y, z, visited);
          if (box) {
            boxes.push(box);
          }
        }
      }
    }

    return {
      type: ColliderType.Simplified,
      boxes
    };
  }

  /**
   * Finds the largest box of solid voxels starting from a position
   */
  private findLargestBox(
    chunk: VoxelChunk,
    startX: number,
    startY: number,
    startZ: number,
    visited: Set<string>
  ): { min: Vector3; max: Vector3 } | null {
    const size = chunk.getSize();

    // Expand in X direction
    let maxX = startX;
    while (maxX + 1 < size && chunk.isSolid(maxX + 1, startY, startZ)) {
      maxX++;
    }

    // Expand in Y direction
    let maxY = startY;
    let canExpandY = true;
    while (canExpandY && maxY + 1 < size) {
      for (let x = startX; x <= maxX; x++) {
        if (!chunk.isSolid(x, maxY + 1, startZ)) {
          canExpandY = false;
          break;
        }
      }
      if (canExpandY) maxY++;
    }

    // Expand in Z direction
    let maxZ = startZ;
    let canExpandZ = true;
    while (canExpandZ && maxZ + 1 < size) {
      for (let y = startY; y <= maxY; y++) {
        for (let x = startX; x <= maxX; x++) {
          if (!chunk.isSolid(x, y, maxZ + 1)) {
            canExpandZ = false;
            break;
          }
        }
        if (!canExpandZ) break;
      }
      if (canExpandZ) maxZ++;
    }

    // Mark all voxels as visited
    for (let z = startZ; z <= maxZ; z++) {
      for (let y = startY; y <= maxY; y++) {
        for (let x = startX; x <= maxX; x++) {
          visited.add(`${x},${y},${z}`);
        }
      }
    }

    const worldPos = chunk.getWorldPosition();

    return {
      min: new Vector3(
        worldPos.x + startX,
        worldPos.y + startY,
        worldPos.z + startZ
      ),
      max: new Vector3(
        worldPos.x + maxX + 1,
        worldPos.y + maxY + 1,
        worldPos.z + maxZ + 1
      )
    };
  }

  /**
   * Performs ray casting through voxel grid
   */
  public rayCast(
    chunk: VoxelChunk,
    origin: Vector3,
    direction: Vector3,
    maxDistance: number
  ): RayCastResult | null {
    const normalizedDir = direction.normalize();
    const step = 0.1;
    let distance = 0;

    let lastAirPos: Vector3 | null = null;

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
      if (x < 0 || x >= size || y < 0 || y >= size || z < 0 || z >= size) {
        distance += step;
        continue;
      }

      if (chunk.isSolid(x, y, z)) {
        // Hit a solid voxel
        const hitPoint = point.clone();
        const normal = this.calculateHitNormal(lastAirPos, hitPoint);

        return {
          hit: true,
          point: hitPoint,
          normal,
          distance,
          voxel: { x, y, z }
        };
      }

      lastAirPos = point.clone();
      distance += step;
    }

    return null;
  }

  /**
   * Calculates hit normal from ray direction
   */
  private calculateHitNormal(lastAirPos: Vector3 | null, hitPoint: Vector3): Vector3 {
    if (!lastAirPos) {
      return new Vector3(0, 1, 0);
    }

    const dx = hitPoint.x - lastAirPos.x;
    const dy = hitPoint.y - lastAirPos.y;
    const dz = hitPoint.z - lastAirPos.z;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const absDz = Math.abs(dz);

    if (absDx > absDy && absDx > absDz) {
      return new Vector3(dx > 0 ? -1 : 1, 0, 0);
    } else if (absDy > absDz) {
      return new Vector3(0, dy > 0 ? -1 : 1, 0);
    } else {
      return new Vector3(0, 0, dz > 0 ? -1 : 1);
    }
  }

  /**
   * Tests AABB intersection with chunk
   */
  public testAABBIntersection(chunk: VoxelChunk, min: Vector3, max: Vector3): boolean {
    const chunkMin = chunk.getBoundsMin();
    const chunkMax = chunk.getBoundsMax();

    return !(
      max.x < chunkMin.x || min.x > chunkMax.x ||
      max.y < chunkMin.y || min.y > chunkMax.y ||
      max.z < chunkMin.z || min.z > chunkMax.z
    );
  }

  /**
   * Tests sphere intersection with voxels
   */
  public testSphereIntersection(chunk: VoxelChunk, center: Vector3, radius: number): boolean {
    const local = chunk.worldToLocal(center.x, center.y, center.z);
    const size = chunk.getSize();

    const minX = Math.max(0, Math.floor(local[0] - radius));
    const maxX = Math.min(size - 1, Math.ceil(local[0] + radius));
    const minY = Math.max(0, Math.floor(local[1] - radius));
    const maxY = Math.min(size - 1, Math.ceil(local[1] + radius));
    const minZ = Math.max(0, Math.floor(local[2] - radius));
    const maxZ = Math.min(size - 1, Math.ceil(local[2] + radius));

    const radiusSquared = radius * radius;

    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (!chunk.isSolid(x, y, z)) continue;

          const worldPos = chunk.localToWorld(x, y, z);
          const voxelCenter = new Vector3(
            worldPos[0] + 0.5,
            worldPos[1] + 0.5,
            worldPos[2] + 0.5
          );

          const distSquared = center.distanceSquared(voxelCenter);
          if (distSquared <= radiusSquared) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Gets all solid voxels intersecting with AABB
   */
  public getVoxelsInAABB(chunk: VoxelChunk, min: Vector3, max: Vector3): Array<{ x: number; y: number; z: number }> {
    const localMin = chunk.worldToLocal(min.x, min.y, min.z);
    const localMax = chunk.worldToLocal(max.x, max.y, max.z);
    const size = chunk.getSize();

    const minX = Math.max(0, Math.floor(Math.min(localMin[0], localMax[0])));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(localMin[0], localMax[0])));
    const minY = Math.max(0, Math.floor(Math.min(localMin[1], localMax[1])));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(localMin[1], localMax[1])));
    const minZ = Math.max(0, Math.floor(Math.min(localMin[2], localMax[2])));
    const maxZ = Math.min(size - 1, Math.ceil(Math.max(localMin[2], localMax[2])));

    const voxels: Array<{ x: number; y: number; z: number }> = [];

    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (chunk.isSolid(x, y, z)) {
            voxels.push({ x, y, z });
          }
        }
      }
    }

    return voxels;
  }

  /**
   * Calculates penetration depth for sphere collision
   */
  public calculateSpherePenetration(
    chunk: VoxelChunk,
    center: Vector3,
    radius: number
  ): Vector3 {
    const local = chunk.worldToLocal(center.x, center.y, center.z);
    const size = chunk.getSize();

    const minX = Math.max(0, Math.floor(local[0] - radius));
    const maxX = Math.min(size - 1, Math.ceil(local[0] + radius));
    const minY = Math.max(0, Math.floor(local[1] - radius));
    const maxY = Math.min(size - 1, Math.ceil(local[1] + radius));
    const minZ = Math.max(0, Math.floor(local[2] - radius));
    const maxZ = Math.min(size - 1, Math.ceil(local[2] + radius));

    let totalPenetration = new Vector3(0, 0, 0);
    let collisionCount = 0;

    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (!chunk.isSolid(x, y, z)) continue;

          const worldPos = chunk.localToWorld(x, y, z);
          const voxelCenter = new Vector3(
            worldPos[0] + 0.5,
            worldPos[1] + 0.5,
            worldPos[2] + 0.5
          );

          const delta = center.clone().sub(voxelCenter);
          const distance = delta.length();

          if (distance < radius + 0.5) {
            const penetration = (radius + 0.5) - distance;
            const normal = delta.normalize();
            totalPenetration.add(normal.multiplyScalar(penetration));
            collisionCount++;
          }
        }
      }
    }

    if (collisionCount > 0) {
      return totalPenetration.divideScalar(collisionCount);
    }

    return new Vector3(0, 0, 0);
  }
}
