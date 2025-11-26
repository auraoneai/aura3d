/**
 * @fileoverview A* pathfinding with funnel algorithm string pulling optimization.
 * High-performance pathfinding optimized for 1000+ agents @ 60 FPS.
 * @module ai/navigation/PathFinder
 */

import { Vector3 } from '../../math/Vector3';
import { NavMesh, NavPolygon, NavLink } from './NavMesh';
import { Logger } from '../../core/Logger';

const logger = Logger.create('PathFinder');

/**
 * Path result status.
 */
export enum PathStatus {
  SUCCESS = 'success',
  PARTIAL = 'partial',
  FAILED = 'failed',
}

/**
 * Computed navigation path.
 */
export interface NavigationPath {
  status: PathStatus;
  waypoints: Vector3[];
  polygonIds: number[];
  length: number;
  cost: number;
  computeTimeMs: number;
}

/**
 * A* search node for priority queue.
 */
class PathNode {
  polygonId: number;
  parent: PathNode | null;
  gCost: number;
  hCost: number;
  fCost: number;

  constructor(polygonId: number) {
    this.polygonId = polygonId;
    this.parent = null;
    this.gCost = 0;
    this.hCost = 0;
    this.fCost = 0;
  }
}

/**
 * Binary min-heap priority queue for A*.
 */
class PriorityQueue {
  private heap: PathNode[] = [];
  private indexMap: Map<number, number> = new Map();

  get length(): number {
    return this.heap.length;
  }

  push(node: PathNode): void {
    const index = this.heap.length;
    this.heap.push(node);
    this.indexMap.set(node.polygonId, index);
    this.bubbleUp(index);
  }

  pop(): PathNode | undefined {
    if (this.heap.length === 0) return undefined;

    const result = this.heap[0];
    this.indexMap.delete(result.polygonId);

    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.indexMap.set(last.polygonId, 0);
      this.bubbleDown(0);
    }

    return result;
  }

  contains(polygonId: number): boolean {
    return this.indexMap.has(polygonId);
  }

  getNode(polygonId: number): PathNode | undefined {
    const index = this.indexMap.get(polygonId);
    return index !== undefined ? this.heap[index] : undefined;
  }

  update(node: PathNode): void {
    const index = this.indexMap.get(node.polygonId);
    if (index === undefined) return;

    this.bubbleUp(index);
    this.bubbleDown(index);
  }

  clear(): void {
    this.heap.length = 0;
    this.indexMap.clear();
  }

  private bubbleUp(index: number): void {
    const node = this.heap[index];

    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      const parent = this.heap[parentIndex];

      if (node.fCost >= parent.fCost) break;

      this.heap[index] = parent;
      this.indexMap.set(parent.polygonId, index);
      index = parentIndex;
    }

    this.heap[index] = node;
    this.indexMap.set(node.polygonId, index);
  }

  private bubbleDown(index: number): void {
    const node = this.heap[index];
    const length = this.heap.length;

    while (true) {
      const leftIndex = (index << 1) + 1;
      const rightIndex = leftIndex + 1;
      let smallestIndex = index;

      if (leftIndex < length && this.heap[leftIndex].fCost < this.heap[smallestIndex].fCost) {
        smallestIndex = leftIndex;
      }

      if (rightIndex < length && this.heap[rightIndex].fCost < this.heap[smallestIndex].fCost) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === index) break;

      this.heap[index] = this.heap[smallestIndex];
      this.indexMap.set(this.heap[index].polygonId, index);
      index = smallestIndex;
    }

    this.heap[index] = node;
    this.indexMap.set(node.polygonId, index);
  }
}

/**
 * Funnel algorithm for string pulling path optimization.
 */
class FunnelAlgorithm {
  /**
   * Applies funnel algorithm to optimize waypoint path through corridor.
   */
  static stringPull(
    start: Vector3,
    end: Vector3,
    polygonPath: NavPolygon[]
  ): Vector3[] {
    if (polygonPath.length === 0) return [start, end];
    if (polygonPath.length === 1) return [start, end];

    const portals = this.buildPortals(polygonPath);
    if (portals.length === 0) return [start, end];

    const path: Vector3[] = [start];

    let apexIndex = 0;
    let leftIndex = 0;
    let rightIndex = 0;

    let apex = start;
    let portalLeft = portals[0].left;
    let portalRight = portals[0].right;

    for (let i = 1; i < portals.length; i++) {
      const left = portals[i].left;
      const right = portals[i].right;

      if (this.triArea2(apex, portalRight, right) <= 0) {
        if (apex.equals(portalRight) || this.triArea2(apex, portalLeft, right) > 0) {
          portalRight = right;
          rightIndex = i;
        } else {
          path.push(portalLeft);
          apex = portalLeft;
          apexIndex = leftIndex;

          portalLeft = apex;
          portalRight = apex;
          leftIndex = apexIndex;
          rightIndex = apexIndex;
          i = apexIndex;
          continue;
        }
      }

      if (this.triArea2(apex, portalLeft, left) >= 0) {
        if (apex.equals(portalLeft) || this.triArea2(apex, portalRight, left) < 0) {
          portalLeft = left;
          leftIndex = i;
        } else {
          path.push(portalRight);
          apex = portalRight;
          apexIndex = rightIndex;

          portalLeft = apex;
          portalRight = apex;
          leftIndex = apexIndex;
          rightIndex = apexIndex;
          i = apexIndex;
          continue;
        }
      }
    }

    path.push(end);
    return path;
  }

  private static buildPortals(polygonPath: NavPolygon[]): Array<{ left: Vector3; right: Vector3 }> {
    const portals: Array<{ left: Vector3; right: Vector3 }> = [];

    for (let i = 0; i < polygonPath.length - 1; i++) {
      const poly1 = polygonPath[i];
      const poly2 = polygonPath[i + 1];

      const sharedEdge = poly1.getSharedEdge(poly2.id);
      if (sharedEdge) {
        portals.push({
          left: sharedEdge[0],
          right: sharedEdge[1]
        });
      }
    }

    return portals;
  }

  private static triArea2(a: Vector3, b: Vector3, c: Vector3): number {
    return (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
  }
}

/**
 * Path cache for reusing computed paths.
 */
class PathCache {
  private cache: Map<string, { path: NavigationPath; timestamp: number }> = new Map();
  private maxAge: number;

  constructor(maxAge: number = 5000) {
    this.maxAge = maxAge;
  }

  get(start: Vector3, end: Vector3): NavigationPath | null {
    const key = this.getKey(start, end);
    const entry = this.cache.get(key);

    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    return entry.path;
  }

  set(start: Vector3, end: Vector3, path: NavigationPath): void {
    const key = this.getKey(start, end);
    this.cache.set(key, {
      path,
      timestamp: Date.now()
    });
  }

  clear(): void {
    this.cache.clear();
  }

  private getKey(start: Vector3, end: Vector3): string {
    const sx = Math.round(start.x * 10);
    const sy = Math.round(start.y * 10);
    const sz = Math.round(start.z * 10);
    const ex = Math.round(end.x * 10);
    const ey = Math.round(end.y * 10);
    const ez = Math.round(end.z * 10);
    return `${sx},${sy},${sz}-${ex},${ey},${ez}`;
  }
}

/**
 * High-performance A* pathfinder with string pulling optimization.
 * Optimized for 1000+ agents with priority queue and path caching.
 */
export class PathFinder {
  private navMesh: NavMesh;
  private openSet: PriorityQueue;
  private closedSet: Set<number>;
  private nodeMap: Map<number, PathNode>;
  private cache: PathCache;

  maxIterations: number = 10000;
  heuristicWeight: number = 1.0;
  enableStringPulling: boolean = true;
  enableCache: boolean = true;

  constructor(navMesh: NavMesh) {
    this.navMesh = navMesh;
    this.openSet = new PriorityQueue();
    this.closedSet = new Set();
    this.nodeMap = new Map();
    this.cache = new PathCache(5000);
  }

  /**
   * Finds optimal path between two points using A* with funnel algorithm optimization.
   * Performance target: < 1ms for typical paths, supports 1000+ agents @ 60 FPS.
   */
  findPath(start: Vector3, end: Vector3, maxCost: number = Infinity): NavigationPath {
    const startTime = performance.now();

    if (this.enableCache) {
      const cached = this.cache.get(start, end);
      if (cached) {
        logger.trace('Path cache hit', { start, end });
        return cached;
      }
    }

    const startPoly = this.navMesh.findNearestPolygon(start, 5.0);
    const endPoly = this.navMesh.findNearestPolygon(end, 5.0);

    if (!startPoly) {
      return this.createFailedPath(startTime, 'Start position not on navmesh');
    }

    if (!endPoly) {
      return this.createFailedPath(startTime, 'End position not on navmesh');
    }

    const polygonPath = this.runAStar(startPoly, endPoly, maxCost);

    if (polygonPath.length === 0) {
      return this.createFailedPath(startTime, 'No path found');
    }

    let waypoints: Vector3[];
    if (this.enableStringPulling && polygonPath.length > 2) {
      waypoints = FunnelAlgorithm.stringPull(start, end, polygonPath);
    } else {
      waypoints = this.buildSimpleWaypoints(start, end, polygonPath);
    }

    const length = this.calculateLength(waypoints);
    const cost = this.calculateCost(polygonPath);
    const status = endPoly.id === polygonPath[polygonPath.length - 1].id
      ? PathStatus.SUCCESS
      : PathStatus.PARTIAL;

    const path: NavigationPath = {
      status,
      waypoints,
      polygonIds: polygonPath.map(p => p.id),
      length,
      cost,
      computeTimeMs: performance.now() - startTime
    };

    if (this.enableCache && status === PathStatus.SUCCESS) {
      this.cache.set(start, end, path);
    }

    logger.trace('Path found', {
      status,
      waypointCount: waypoints.length,
      length: length.toFixed(2),
      timeMs: path.computeTimeMs.toFixed(3)
    });

    return path;
  }

  private runAStar(
    startPoly: NavPolygon,
    endPoly: NavPolygon,
    maxCost: number
  ): NavPolygon[] {
    this.openSet.clear();
    this.closedSet.clear();
    this.nodeMap.clear();

    const startNode = new PathNode(startPoly.id);
    startNode.gCost = 0;
    startNode.hCost = this.heuristic(startPoly, endPoly);
    startNode.fCost = startNode.hCost;

    this.openSet.push(startNode);
    this.nodeMap.set(startPoly.id, startNode);

    let iterations = 0;
    let closestNode = startNode;
    let closestHeuristic = startNode.hCost;

    while (this.openSet.length > 0 && iterations < this.maxIterations) {
      iterations++;

      const current = this.openSet.pop()!;
      const currentPoly = this.navMesh.getPolygon(current.polygonId)!;

      if (current.polygonId === endPoly.id) {
        logger.trace('A* goal reached', { iterations });
        return this.reconstructPath(current);
      }

      this.closedSet.add(current.polygonId);

      if (current.hCost < closestHeuristic) {
        closestHeuristic = current.hCost;
        closestNode = current;
      }

      for (let i = 0; i < currentPoly.neighbors.length; i++) {
        const neighborId = currentPoly.neighbors[i];
        if (neighborId === -1 || this.closedSet.has(neighborId)) continue;

        const neighborPoly = this.navMesh.getPolygon(neighborId);
        if (!neighborPoly) continue;

        const moveCost = currentPoly.center.distanceTo(neighborPoly.center) * neighborPoly.cost;
        const tentativeG = current.gCost + moveCost;

        if (tentativeG > maxCost) continue;

        let neighborNode = this.nodeMap.get(neighborId);

        if (!neighborNode) {
          neighborNode = new PathNode(neighborId);
          neighborNode.gCost = tentativeG;
          neighborNode.hCost = this.heuristic(neighborPoly, endPoly);
          neighborNode.fCost = tentativeG + neighborNode.hCost * this.heuristicWeight;
          neighborNode.parent = current;

          this.openSet.push(neighborNode);
          this.nodeMap.set(neighborId, neighborNode);
        } else if (tentativeG < neighborNode.gCost) {
          neighborNode.gCost = tentativeG;
          neighborNode.fCost = tentativeG + neighborNode.hCost * this.heuristicWeight;
          neighborNode.parent = current;
          this.openSet.update(neighborNode);
        }
      }
    }

    if (iterations >= this.maxIterations) {
      logger.warn('A* max iterations reached', { maxIterations: this.maxIterations });
    }

    return this.reconstructPath(closestNode);
  }

  private heuristic(poly1: NavPolygon, poly2: NavPolygon): number {
    return poly1.center.distanceTo(poly2.center);
  }

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

  private buildSimpleWaypoints(
    start: Vector3,
    end: Vector3,
    polygonPath: NavPolygon[]
  ): Vector3[] {
    if (polygonPath.length === 0) return [start, end];
    if (polygonPath.length === 1) return [start, end];

    const waypoints: Vector3[] = [start];

    for (let i = 1; i < polygonPath.length - 1; i++) {
      waypoints.push(polygonPath[i].center.clone());
    }

    waypoints.push(end);
    return waypoints;
  }

  private calculateLength(waypoints: Vector3[]): number {
    let length = 0;
    for (let i = 1; i < waypoints.length; i++) {
      length += waypoints[i - 1].distanceTo(waypoints[i]);
    }
    return length;
  }

  private calculateCost(polygonPath: NavPolygon[]): number {
    let cost = 0;
    for (let i = 1; i < polygonPath.length; i++) {
      const dist = polygonPath[i - 1].center.distanceTo(polygonPath[i].center);
      cost += dist * polygonPath[i].cost;
    }
    return cost;
  }

  private createFailedPath(startTime: number, reason: string): NavigationPath {
    logger.trace('Path failed', { reason });
    return {
      status: PathStatus.FAILED,
      waypoints: [],
      polygonIds: [],
      length: 0,
      cost: 0,
      computeTimeMs: performance.now() - startTime
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache['cache'].size;
  }
}
