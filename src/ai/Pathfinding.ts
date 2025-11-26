/**
 * @fileoverview A* pathfinding implementation for navigation meshes.
 * Includes string pulling (funnel algorithm) and path smoothing.
 * @module ai/Pathfinding
 */

import { Vector3 } from '../math/Vector3';
import { NavMesh, NavPolygon, NavLink } from './NavMesh';
import { ObjectPool } from '../core/ObjectPool';

/**
 * Path request status.
 */
export enum PathStatus {
  /** Path computation in progress */
  PENDING = 'pending',
  /** Valid complete path found */
  SUCCESS = 'success',
  /** Partial path (goal unreachable) */
  PARTIAL = 'partial',
  /** No path found */
  FAILED = 'failed',
}

/**
 * Computed path result.
 *
 * @example
 * ```typescript
 * const path = pathfinder.findPath(start, end);
 * if (path.status === PathStatus.SUCCESS) {
 *   for (const point of path.waypoints) {
 *     console.log(`Waypoint: ${point.x}, ${point.y}, ${point.z}`);
 *   }
 * }
 * ```
 */
export interface Path {
  /** Path computation status */
  status: PathStatus;

  /** Array of waypoint positions */
  waypoints: Vector3[];

  /** Polygon IDs along the path */
  polygons: number[];

  /** Total path length in world units */
  length: number;

  /** Computation time in milliseconds */
  computeTime: number;
}

/**
 * Node in the A* open/closed sets.
 * @private
 */
class PathNode {
  polygonId: number;
  parent: PathNode | null;
  gCost: number; // Cost from start
  hCost: number; // Heuristic to goal
  fCost: number; // Total cost (g + h)

  constructor(polygonId: number) {
    this.polygonId = polygonId;
    this.parent = null;
    this.gCost = 0;
    this.hCost = 0;
    this.fCost = 0;
  }

  reset(): void {
    this.polygonId = -1;
    this.parent = null;
    this.gCost = 0;
    this.hCost = 0;
    this.fCost = 0;
  }
}

/**
 * Priority queue for A* open set.
 * Binary min-heap implementation.
 * @private
 */
class PriorityQueue {
  private heap: PathNode[];

  constructor() {
    this.heap = [];
  }

  push(node: PathNode): void {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): PathNode | undefined {
    if (this.heap.length === 0) return undefined;

    const result = this.heap[0];
    const end = this.heap.pop()!;

    if (this.heap.length > 0) {
      this.heap[0] = end;
      this.bubbleDown(0);
    }

    return result;
  }

  update(node: PathNode): void {
    const index = this.heap.indexOf(node);
    if (index === -1) return;

    this.bubbleUp(index);
    this.bubbleDown(index);
  }

  contains(polygonId: number): boolean {
    return this.heap.some(n => n.polygonId === polygonId);
  }

  get length(): number {
    return this.heap.length;
  }

  clear(): void {
    this.heap.length = 0;
  }

  private bubbleUp(index: number): void {
    const node = this.heap[index]!;

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIndex]!;

      if (node.fCost >= parent.fCost) break;

      this.heap[index] = parent;
      index = parentIndex;
    }

    this.heap[index] = node;
  }

  private bubbleDown(index: number): void {
    const node = this.heap[index]!;
    const length = this.heap.length;

    while (true) {
      const leftIndex = 2 * index + 1;
      const rightIndex = 2 * index + 2;
      let smallestIndex = index;

      if (leftIndex < length && this.heap[leftIndex]!.fCost < this.heap[smallestIndex]!.fCost) {
        smallestIndex = leftIndex;
      }

      if (rightIndex < length && this.heap[rightIndex]!.fCost < this.heap[smallestIndex]!.fCost) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === index) break;

      this.heap[index] = this.heap[smallestIndex]!;
      index = smallestIndex;
    }

    this.heap[index] = node;
  }
}

/**
 * Path cache entry.
 * @private
 */
interface CacheEntry {
  path: Path;
  timestamp: number;
}

/**
 * A* pathfinding implementation for navigation meshes.
 * Supports path caching, string pulling, and partial paths.
 *
 * @example
 * ```typescript
 * const pathfinder = new Pathfinder(navMesh);
 *
 * // Find path
 * const start = new Vector3(0, 0, 0);
 * const end = new Vector3(100, 0, 50);
 * const path = pathfinder.findPath(start, end);
 *
 * if (path.status === PathStatus.SUCCESS) {
 *   console.log(`Path found with ${path.waypoints.length} waypoints`);
 *   console.log(`Total distance: ${path.length.toFixed(2)} units`);
 * }
 *
 * // Configure pathfinding
 * pathfinder.maxIterations = 2000;
 * pathfinder.enableCache = true;
 * pathfinder.cacheTimeout = 5000;
 * ```
 */
export class Pathfinder {
  /** Navigation mesh to search */
  readonly navMesh: NavMesh;

  /** Maximum A* iterations before giving up */
  maxIterations: number = 1000;

  /** Enable path caching */
  enableCache: boolean = true;

  /** Cache timeout in milliseconds */
  cacheTimeout: number = 5000;

  /** Enable string pulling optimization */
  enableStringPulling: boolean = true;

  /** Enable path smoothing */
  enableSmoothing: boolean = true;

  /** Heuristic weight (1.0 = optimal, >1.0 = faster but less optimal) */
  heuristicWeight: number = 1.0;

  private pathCache: Map<string, CacheEntry>;
  private nodePool: ObjectPool<PathNode>;
  private openSet: PriorityQueue;
  private closedSet: Set<number>;

  /**
   * Creates a new pathfinder.
   *
   * @param navMesh - Navigation mesh to use for pathfinding
   */
  constructor(navMesh: NavMesh) {
    this.navMesh = navMesh;
    this.pathCache = new Map();
    this.nodePool = new ObjectPool(
      () => new PathNode(-1),
      (node) => { node.reset(); },
      512
    );
    this.openSet = new PriorityQueue();
    this.closedSet = new Set();
  }

  /**
   * Finds a path between two positions.
   *
   * @param start - Start position
   * @param end - End position
   * @param maxDistance - Maximum search distance (optional)
   * @returns Path result
   *
   * @example
   * ```typescript
   * const path = pathfinder.findPath(
   *   new Vector3(0, 0, 0),
   *   new Vector3(100, 0, 50)
   * );
   *
   * if (path.status === PathStatus.SUCCESS) {
   *   agent.followPath(path.waypoints);
   * } else if (path.status === PathStatus.PARTIAL) {
   *   console.log('Goal unreachable, following partial path');
   *   agent.followPath(path.waypoints);
   * }
   * ```
   */
  findPath(start: Vector3, end: Vector3, maxDistance: number = Infinity): Path {
    const startTime = performance.now();

    // Check cache
    const cacheKey = this.getCacheKey(start, end);
    if (this.enableCache) {
      const cached = this.pathCache.get(cacheKey);
      if (cached && (startTime - cached.timestamp) < this.cacheTimeout) {
        return cached.path;
      }
    }

    // Find start and end polygons
    const startPoly = this.navMesh.findNearestPolygon(start, 5.0);
    const endPoly = this.navMesh.findNearestPolygon(end, 5.0);

    if (!startPoly) {
      return this.createFailedPath(startTime, 'Start position not on navmesh');
    }

    if (!endPoly) {
      return this.createFailedPath(startTime, 'End position not on navmesh');
    }

    // Run A*
    const polygonPath = this.runAStar(startPoly, endPoly, maxDistance);

    if (polygonPath.length === 0) {
      return this.createFailedPath(startTime, 'No path found');
    }

    // Convert polygon path to waypoints
    let waypoints = this.polygonPathToWaypoints(polygonPath, start, end);

    // Apply string pulling
    if (this.enableStringPulling && polygonPath.length > 2) {
      waypoints = this.applyStringPulling(waypoints, polygonPath);
    }

    // Apply smoothing
    if (this.enableSmoothing && waypoints.length > 2) {
      waypoints = this.smoothPath(waypoints);
    }

    // Calculate path length
    const length = this.calculatePathLength(waypoints);

    // Determine status
    const status = endPoly.id === polygonPath[polygonPath.length - 1]!.id
      ? PathStatus.SUCCESS
      : PathStatus.PARTIAL;

    const path: Path = {
      status,
      waypoints,
      polygons: polygonPath.map(p => p.id),
      length,
      computeTime: performance.now() - startTime,
    };

    // Cache result
    if (this.enableCache && status === PathStatus.SUCCESS) {
      this.pathCache.set(cacheKey, {
        path,
        timestamp: startTime,
      });
    }

    return path;
  }

  /**
   * Runs A* algorithm to find polygon path.
   * @private
   */
  private runAStar(
    startPoly: NavPolygon,
    endPoly: NavPolygon,
    maxDistance: number
  ): NavPolygon[] {
    // Reset state
    this.openSet.clear();
    this.closedSet.clear();

    // Create start node
    const startNode = this.nodePool.acquire();
    startNode.polygonId = startPoly.id;
    startNode.parent = null;
    startNode.gCost = 0;
    startNode.hCost = this.heuristic(startPoly, endPoly);
    startNode.fCost = startNode.hCost;

    this.openSet.push(startNode);

    let iterations = 0;
    let closestNode = startNode;
    let closestDist = startNode.hCost;

    while (this.openSet.length > 0 && iterations < this.maxIterations) {
      iterations++;

      const current = this.openSet.pop()!;
      const currentPoly = this.navMesh.getPolygon(current.polygonId)!;

      // Goal reached
      if (current.polygonId === endPoly.id) {
        const path = this.reconstructPath(current);
        this.nodePool.release(startNode);
        return path;
      }

      this.closedSet.add(current.polygonId);

      // Track closest node for partial paths
      if (current.hCost < closestDist) {
        closestDist = current.hCost;
        closestNode = current;
      }

      // Check neighbors
      for (let i = 0; i < currentPoly.neighbors.length; i++) {
        const neighborId = currentPoly.neighbors[i];
        if (neighborId === -1) continue;
        if (this.closedSet.has(neighborId)) continue;

        const neighborPoly = this.navMesh.getPolygon(neighborId);
        if (!neighborPoly) continue;

        // Calculate costs
        const moveCost = currentPoly.center.distanceTo(neighborPoly.center) * neighborPoly.cost;
        const gCost = current.gCost + moveCost;

        // Check distance limit
        if (gCost > maxDistance) continue;

        // Check if already in open set
        if (this.openSet.contains(neighborId)) {
          // Find existing node
          const existingNode = this.openSet['heap'].find(n => n.polygonId === neighborId);
          if (existingNode && gCost < existingNode.gCost) {
            existingNode.gCost = gCost;
            existingNode.fCost = gCost + existingNode.hCost;
            existingNode.parent = current;
            this.openSet.update(existingNode);
          }
        } else {
          // Add new node
          const neighborNode = this.nodePool.acquire();
          neighborNode.polygonId = neighborId;
          neighborNode.parent = current;
          neighborNode.gCost = gCost;
          neighborNode.hCost = this.heuristic(neighborPoly, endPoly);
          neighborNode.fCost = gCost + neighborNode.hCost * this.heuristicWeight;
          this.openSet.push(neighborNode);
        }
      }
    }

    // Return partial path to closest node
    return this.reconstructPath(closestNode);
  }

  /**
   * Reconstructs path from A* node chain.
   * @private
   */
  private reconstructPath(endNode: PathNode): NavPolygon[] {
    const path: NavPolygon[] = [];
    let current: PathNode | null = endNode;

    while (current) {
      const poly = this.navMesh.getPolygon(current.polygonId);
      if (poly) {
        path.unshift(poly);
      }
      current = current.parent;
    }

    return path;
  }

  /**
   * Heuristic function (Euclidean distance).
   * @private
   */
  private heuristic(poly1: NavPolygon, poly2: NavPolygon): number {
    return poly1.center.distanceTo(poly2.center);
  }

  /**
   * Converts polygon path to waypoint positions.
   * @private
   */
  private polygonPathToWaypoints(
    polygons: NavPolygon[],
    start: Vector3,
    end: Vector3
  ): Vector3[] {
    if (polygons.length === 0) return [];
    if (polygons.length === 1) return [start, end];

    const waypoints: Vector3[] = [start];

    // Add polygon centers as waypoints
    for (let i = 1; i < polygons.length - 1; i++) {
      waypoints.push(polygons[i]!.center.clone());
    }

    waypoints.push(end);
    return waypoints;
  }

  /**
   * Applies string pulling (funnel algorithm) to optimize path.
   * Removes unnecessary waypoints by finding line-of-sight shortcuts.
   * @private
   */
  private applyStringPulling(waypoints: Vector3[], polygons: NavPolygon[]): Vector3[] {
    if (waypoints.length <= 2) return waypoints;

    const pulled: Vector3[] = [waypoints[0]];
    let apexIndex = 0;
    let leftIndex = 0;
    let rightIndex = 0;

    let apex = waypoints[0];
    let left = waypoints[0];
    let right = waypoints[0];

    for (let i = 1; i < waypoints.length - 1; i++) {
      const current = waypoints[i];

      // Calculate funnel sides
      const toLeft = current.sub(apex);
      const toRight = current.sub(apex);

      // Update funnel
      if (this.triarea2(apex, right, current) <= 0) {
        if (apex.equals(right) || this.triarea2(apex, left, current) > 0) {
          right = current;
          rightIndex = i;
        } else {
          // Right side crossed left, add left to path
          pulled.push(left);
          apex = left;
          apexIndex = leftIndex;
          left = apex;
          right = apex;
          leftIndex = apexIndex;
          rightIndex = apexIndex;
          i = apexIndex;
          continue;
        }
      }

      if (this.triarea2(apex, left, current) >= 0) {
        if (apex.equals(left) || this.triarea2(apex, right, current) < 0) {
          left = current;
          leftIndex = i;
        } else {
          // Left side crossed right, add right to path
          pulled.push(right);
          apex = right;
          apexIndex = rightIndex;
          left = apex;
          right = apex;
          leftIndex = apexIndex;
          rightIndex = apexIndex;
          i = apexIndex;
          continue;
        }
      }
    }

    pulled.push(waypoints[waypoints.length - 1]);
    return pulled;
  }

  /**
   * Calculates signed triangle area for funnel algorithm.
   * @private
   */
  private triarea2(a: Vector3, b: Vector3, c: Vector3): number {
    return (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
  }

  /**
   * Smooths path using simple averaging.
   * @private
   */
  private smoothPath(waypoints: Vector3[]): Vector3[] {
    if (waypoints.length <= 2) return waypoints;

    const smoothed: Vector3[] = [waypoints[0]];

    for (let i = 1; i < waypoints.length - 1; i++) {
      const prev = waypoints[i - 1]!;
      const curr = waypoints[i]!;
      const next = waypoints[i + 1]!;

      // Simple average
      const smoothPoint = new Vector3(
        (prev.x + curr.x + next.x) / 3,
        (prev.y + curr.y + next.y) / 3,
        (prev.z + curr.z + next.z) / 3
      );

      smoothed.push(smoothPoint);
    }

    smoothed.push(waypoints[waypoints.length - 1]);
    return smoothed;
  }

  /**
   * Calculates total path length.
   * @private
   */
  private calculatePathLength(waypoints: Vector3[]): number {
    let length = 0;
    for (let i = 1; i < waypoints.length; i++) {
      length += waypoints[i - 1]!.distanceTo(waypoints[i]!);
    }
    return length;
  }

  /**
   * Creates a failed path result.
   * @private
   */
  private createFailedPath(startTime: number, reason: string): Path {
    return {
      status: PathStatus.FAILED,
      waypoints: [],
      polygons: [],
      length: 0,
      computeTime: performance.now() - startTime,
    };
  }

  /**
   * Generates cache key for path.
   * @private
   */
  private getCacheKey(start: Vector3, end: Vector3): string {
    const sx = Math.round(start.x * 10);
    const sy = Math.round(start.y * 10);
    const sz = Math.round(start.z * 10);
    const ex = Math.round(end.x * 10);
    const ey = Math.round(end.y * 10);
    const ez = Math.round(end.z * 10);
    return `${sx},${sy},${sz}-${ex},${ey},${ez}`;
  }

  /**
   * Clears the path cache.
   */
  clearCache(): void {
    this.pathCache.clear();
  }

  /**
   * Gets cache statistics.
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.pathCache.size,
      hitRate: 0, // Would need to track hits/misses
    };
  }
}
