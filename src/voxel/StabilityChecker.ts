import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';
import { VoxelChunk } from './VoxelChunk';
import { VoxelType } from './VoxelData';

/**
 * Stability result
 */
export interface StabilityResult {
  stable: boolean;
  unstableVoxels: Array<{ x: number; y: number; z: number }>;
  supportPath: boolean;
}

/**
 * Support check mode
 */
export enum SupportMode {
  Direct = 'direct',
  Adjacent = 'adjacent',
  Recursive = 'recursive'
}

/**
 * StabilityChecker - Structural stability checking for voxels
 *
 * Determines if voxels are structurally stable and should remain in place
 * or fall due to lack of support. Useful for realistic destruction physics.
 *
 * Features:
 * - Direct support checking (touching ground)
 * - Adjacent support checking (touching supported blocks)
 * - Recursive support checking (connected to supported blocks)
 * - Floating block detection
 * - Cave-in simulation
 * - Performance-optimized flood fill
 *
 * Stability rules:
 * - Blocks at Y=0 are always stable (ground)
 * - Blocks connected to stable blocks are stable
 * - Blocks with no support path should fall
 *
 * @example
 * ```typescript
 * const checker = new StabilityChecker();
 * const result = checker.checkStability(chunk, 8, 10, 8);
 * if (!result.stable) {
 *   // Block should fall
 * }
 * ```
 */
export class StabilityChecker {
  private logger: Logger;
  private maxCheckDepth: number = 100;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Checks if a voxel is stable
   */
  public checkStability(chunk: VoxelChunk, x: number, y: number, z: number, mode: SupportMode = SupportMode.Recursive): StabilityResult {
    const size = chunk.getSize();

    if (x < 0 || x >= size || y < 0 || y >= size || z < 0 || z >= size) {
      return { stable: true, unstableVoxels: [], supportPath: false };
    }

    // Air is always stable (nothing to fall)
    if (!chunk.isSolid(x, y, z)) {
      return { stable: true, unstableVoxels: [], supportPath: false };
    }

    // Check based on mode
    switch (mode) {
      case SupportMode.Direct:
        return this.checkDirectSupport(chunk, x, y, z);
      case SupportMode.Adjacent:
        return this.checkAdjacentSupport(chunk, x, y, z);
      case SupportMode.Recursive:
        return this.checkRecursiveSupport(chunk, x, y, z);
      default:
        return { stable: true, unstableVoxels: [], supportPath: false };
    }
  }

  /**
   * Checks if voxel has direct support (touching ground)
   */
  private checkDirectSupport(chunk: VoxelChunk, x: number, y: number, z: number): StabilityResult {
    // Ground level is always stable
    if (y === 0) {
      return { stable: true, unstableVoxels: [], supportPath: true };
    }

    // Check if there's a solid block below
    const hasSupport = chunk.isSolid(x, y - 1, z);

    return {
      stable: hasSupport,
      unstableVoxels: hasSupport ? [] : [{ x, y, z }],
      supportPath: hasSupport
    };
  }

  /**
   * Checks if voxel has adjacent support
   */
  private checkAdjacentSupport(chunk: VoxelChunk, x: number, y: number, z: number): StabilityResult {
    // Ground level is always stable
    if (y === 0) {
      return { stable: true, unstableVoxels: [], supportPath: true };
    }

    const size = chunk.getSize();

    // Check all 6 neighbors
    const neighbors = [
      { x: x + 1, y, z },
      { x: x - 1, y, z },
      { x, y: y + 1, z },
      { x, y: y - 1, z },
      { x, y, z: z + 1 },
      { x, y, z: z - 1 }
    ];

    for (const neighbor of neighbors) {
      const nx = neighbor.x;
      const ny = neighbor.y;
      const nz = neighbor.z;

      if (nx < 0 || nx >= size || ny < 0 || ny >= size || nz < 0 || nz >= size) {
        continue;
      }

      // If neighbor is solid and at ground level or below, we have support
      if (chunk.isSolid(nx, ny, nz) && ny <= y) {
        if (ny === 0) {
          return { stable: true, unstableVoxels: [], supportPath: true };
        }
      }
    }

    return { stable: false, unstableVoxels: [{ x, y, z }], supportPath: false };
  }

  /**
   * Checks if voxel has recursive support (connected to ground)
   */
  private checkRecursiveSupport(chunk: VoxelChunk, x: number, y: number, z: number): StabilityResult {
    const size = chunk.getSize();
    const visited = new Set<string>();
    const queue: Array<{ x: number; y: number; z: number; depth: number }> = [];

    queue.push({ x, y, z, depth: 0 });

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.x},${current.y},${current.z}`;

      if (visited.has(key)) continue;
      visited.add(key);

      // Check depth limit
      if (current.depth > this.maxCheckDepth) {
        this.logger.warn('Stability check depth limit reached');
        return { stable: false, unstableVoxels: [{ x, y, z }], supportPath: false };
      }

      // Ground level reached - stable!
      if (current.y === 0 && chunk.isSolid(current.x, current.y, current.z)) {
        return { stable: true, unstableVoxels: [], supportPath: true };
      }

      // Add solid neighbors to queue
      const neighbors = [
        { x: current.x + 1, y: current.y, z: current.z },
        { x: current.x - 1, y: current.y, z: current.z },
        { x: current.x, y: current.y - 1, z: current.z }, // Prioritize downward
        { x: current.x, y: current.y, z: current.z + 1 },
        { x: current.x, y: current.y, z: current.z - 1 }
      ];

      for (const neighbor of neighbors) {
        const nx = neighbor.x;
        const ny = neighbor.y;
        const nz = neighbor.z;

        if (nx < 0 || nx >= size || ny < 0 || ny >= size || nz < 0 || nz >= size) {
          continue;
        }

        const neighborKey = `${nx},${ny},${nz}`;
        if (!visited.has(neighborKey) && chunk.isSolid(nx, ny, nz)) {
          queue.push({ x: nx, y: ny, z: nz, depth: current.depth + 1 });
        }
      }
    }

    return { stable: false, unstableVoxels: [{ x, y, z }], supportPath: false };
  }

  /**
   * Finds all unstable voxels in a chunk
   */
  public findUnstableVoxels(chunk: VoxelChunk, mode: SupportMode = SupportMode.Recursive): Array<{ x: number; y: number; z: number }> {
    const size = chunk.getSize();
    const unstableVoxels: Array<{ x: number; y: number; z: number }> = [];

    // Skip ground level
    for (let z = 0; z < size; z++) {
      for (let y = 1; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (chunk.isSolid(x, y, z)) {
            const result = this.checkStability(chunk, x, y, z, mode);
            if (!result.stable) {
              unstableVoxels.push({ x, y, z });
            }
          }
        }
      }
    }

    return unstableVoxels;
  }

  /**
   * Finds connected unstable regions
   */
  public findUnstableRegions(chunk: VoxelChunk): Array<Array<{ x: number; y: number; z: number }>> {
    const size = chunk.getSize();
    const visited = new Set<string>();
    const regions: Array<Array<{ x: number; y: number; z: number }>> = [];

    for (let z = 0; z < size; z++) {
      for (let y = 1; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const key = `${x},${y},${z}`;

          if (visited.has(key) || !chunk.isSolid(x, y, z)) {
            continue;
          }

          // Check if this voxel is unstable
          const result = this.checkStability(chunk, x, y, z);
          if (!result.stable) {
            // Find all connected unstable voxels
            const region = this.floodFillUnstable(chunk, x, y, z, visited);
            if (region.length > 0) {
              regions.push(region);
            }
          }
        }
      }
    }

    return regions;
  }

  /**
   * Flood fills to find connected unstable voxels
   */
  private floodFillUnstable(
    chunk: VoxelChunk,
    startX: number,
    startY: number,
    startZ: number,
    visited: Set<string>
  ): Array<{ x: number; y: number; z: number }> {
    const size = chunk.getSize();
    const region: Array<{ x: number; y: number; z: number }> = [];
    const queue: Array<{ x: number; y: number; z: number }> = [];

    queue.push({ x: startX, y: startY, z: startZ });

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.x},${current.y},${current.z}`;

      if (visited.has(key)) continue;
      visited.add(key);

      if (!chunk.isSolid(current.x, current.y, current.z)) {
        continue;
      }

      // Check if unstable
      const result = this.checkStability(chunk, current.x, current.y, current.z);
      if (!result.stable) {
        region.push(current);

        // Add neighbors
        const neighbors = [
          { x: current.x + 1, y: current.y, z: current.z },
          { x: current.x - 1, y: current.y, z: current.z },
          { x: current.x, y: current.y + 1, z: current.z },
          { x: current.x, y: current.y - 1, z: current.z },
          { x: current.x, y: current.y, z: current.z + 1 },
          { x: current.x, y: current.y, z: current.z - 1 }
        ];

        for (const neighbor of neighbors) {
          const nx = neighbor.x;
          const ny = neighbor.y;
          const nz = neighbor.z;

          if (nx >= 0 && nx < size && ny >= 0 && ny < size && nz >= 0 && nz < size) {
            const neighborKey = `${nx},${ny},${nz}`;
            if (!visited.has(neighborKey)) {
              queue.push({ x: nx, y: ny, z: nz });
            }
          }
        }
      }
    }

    return region;
  }

  /**
   * Checks if removing a voxel would cause instability
   */
  public checkRemovalStability(chunk: VoxelChunk, x: number, y: number, z: number): Array<{ x: number; y: number; z: number }> {
    // Temporarily remove the voxel
    const originalMaterial = chunk.getVoxel(x, y, z);
    if (!originalMaterial) {
      return [];
    }

    const airMaterial = chunk.getData().getDefaultMaterial(VoxelType.Air);
    chunk.setVoxel(x, y, z, airMaterial);

    // Check neighbors for stability
    const size = chunk.getSize();
    const affected: Array<{ x: number; y: number; z: number }> = [];

    const neighbors = [
      { x: x + 1, y, z },
      { x: x - 1, y, z },
      { x, y: y + 1, z },
      { x, y, z: z + 1 },
      { x, y, z: z - 1 }
    ];

    for (const neighbor of neighbors) {
      const nx = neighbor.x;
      const ny = neighbor.y;
      const nz = neighbor.z;

      if (nx >= 0 && nx < size && ny >= 0 && ny < size && nz >= 0 && nz < size) {
        if (chunk.isSolid(nx, ny, nz)) {
          const result = this.checkStability(chunk, nx, ny, nz);
          if (!result.stable) {
            affected.push({ x: nx, y: ny, z: nz });
          }
        }
      }
    }

    // Restore the voxel
    chunk.setVoxel(x, y, z, originalMaterial);

    return affected;
  }

  /**
   * Sets the maximum check depth
   */
  public setMaxCheckDepth(depth: number): void {
    this.maxCheckDepth = depth;
  }

  /**
   * Gets the maximum check depth
   */
  public getMaxCheckDepth(): number {
    return this.maxCheckDepth;
  }
}
