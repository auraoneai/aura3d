/**
 * Bounding Volume Hierarchy (BVH) for efficient spatial queries and culling.
 * Uses Surface Area Heuristic (SAH) for optimal tree construction.
 * Supports dynamic object updates, ray traversal, and frustum culling.
 * @module BVH
 */

import { Box3 } from '../../math/Box3';
import { Vector3 } from '../../math/Vector3';
import { Ray } from '../../math/Ray';
import { Frustum } from '../../math/Frustum';

/**
 * Object that can be stored in the BVH.
 */
export interface BVHObject {
  /**
   * Unique identifier for this object.
   */
  id: number;

  /**
   * Axis-aligned bounding box for this object.
   */
  bounds: Box3;

  /**
   * User data (e.g., reference to scene node).
   */
  data?: any;
}

/**
 * BVH node in the tree structure.
 */
interface BVHNode {
  /**
   * Bounding box containing all objects in this node and its children.
   */
  bounds: Box3;

  /**
   * Left child node (null for leaf nodes).
   */
  left: BVHNode | null;

  /**
   * Right child node (null for leaf nodes).
   */
  right: BVHNode | null;

  /**
   * Objects in this node (null for interior nodes).
   */
  objects: BVHObject[] | null;

  /**
   * Split axis (0=X, 1=Y, 2=Z, -1=leaf).
   */
  splitAxis: number;

  /**
   * Split position along the axis.
   */
  splitPos: number;
}

/**
 * Statistics for BVH performance monitoring.
 */
export interface BVHStats {
  nodeCount: number;
  leafCount: number;
  objectCount: number;
  maxDepth: number;
  avgLeafObjects: number;
  totalBoundsTests: number;
  totalObjectTests: number;
}

/**
 * Ray intersection result.
 */
export interface RayIntersection {
  object: BVHObject;
  distance: number;
  point: Vector3;
}

/**
 * Bounding Volume Hierarchy for efficient spatial queries.
 *
 * The BVH organizes objects into a binary tree based on their spatial location,
 * enabling fast frustum culling, ray casting, and range queries.
 *
 * Features:
 * - SAH (Surface Area Heuristic) construction for optimal tree quality
 * - Dynamic object updates (rebuild or refit)
 * - Ray traversal for picking
 * - Frustum traversal for culling
 * - Range queries for proximity tests
 * - Performance statistics
 *
 * @example
 * ```typescript
 * // Create BVH
 * const bvh = new BVH();
 *
 * // Add objects
 * const objects: BVHObject[] = [
 *   { id: 1, bounds: new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1)) },
 *   { id: 2, bounds: new Box3(new Vector3(5, 0, 0), new Vector3(6, 1, 1)) },
 * ];
 * bvh.build(objects);
 *
 * // Frustum culling
 * const frustum = Frustum.fromProjectionMatrix(viewProjMatrix);
 * const visible = bvh.queryFrustum(frustum);
 *
 * // Ray casting
 * const ray = new Ray(new Vector3(0, 0, -10), new Vector3(0, 0, 1));
 * const hit = bvh.raycast(ray);
 *
 * // Range query
 * const nearObjects = bvh.queryRange(
 *   new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1))
 * );
 *
 * // Update objects
 * objects[0].bounds = new Box3(new Vector3(2, 0, 0), new Vector3(3, 1, 1));
 * bvh.update(); // Refit bounds
 *
 * // Get statistics
 * const stats = bvh.getStats();
 * console.log(`Nodes: ${stats.nodeCount}, Max depth: ${stats.maxDepth}`);
 * ```
 */
export class BVH {
  /**
   * Root node of the BVH tree.
   */
  private _root: BVHNode | null = null;

  /**
   * All objects in the BVH.
   */
  private _objects: BVHObject[] = [];

  /**
   * Maximum objects per leaf node.
   */
  private _maxLeafObjects: number;

  /**
   * Maximum tree depth.
   */
  private _maxDepth: number;

  /**
   * Statistics counters.
   */
  private _stats: BVHStats;

  /**
   * Whether to use SAH for splitting (slower build, better quality).
   */
  private _useSAH: boolean;

  /**
   * Creates a new BVH instance.
   *
   * @param maxLeafObjects - Maximum objects per leaf (default: 4)
   * @param maxDepth - Maximum tree depth (default: 32)
   * @param useSAH - Use Surface Area Heuristic for splitting (default: true)
   *
   * @example
   * ```typescript
   * const bvh = new BVH(4, 32, true);
   * const simpleBVH = new BVH(); // Use defaults
   * ```
   */
  constructor(maxLeafObjects: number = 4, maxDepth: number = 32, useSAH: boolean = true) {
    this._maxLeafObjects = maxLeafObjects;
    this._maxDepth = maxDepth;
    this._useSAH = useSAH;
    this._stats = this._createEmptyStats();
  }

  /**
   * Builds the BVH from a list of objects.
   * This replaces any existing tree.
   *
   * @param objects - Objects to build the tree from
   *
   * @example
   * ```typescript
   * const objects: BVHObject[] = [
   *   { id: 1, bounds: new Box3(...) },
   *   { id: 2, bounds: new Box3(...) },
   * ];
   * bvh.build(objects);
   * ```
   */
  build(objects: BVHObject[]): void {
    this._objects = [...objects];
    this._stats = this._createEmptyStats();

    if (objects.length === 0) {
      this._root = null;
      return;
    }

    // Build tree recursively
    this._root = this._buildNode(objects, 0);
  }

  /**
   * Updates the BVH after object bounds have changed.
   * Uses refitting (fast but may degrade tree quality).
   * For major changes, consider rebuilding instead.
   *
   * @example
   * ```typescript
   * // Update object bounds
   * objects[0].bounds = new Box3(...);
   * bvh.update(); // Refit bounds
   * ```
   */
  update(): void {
    if (this._root) {
      this._refitNode(this._root);
    }
  }

  /**
   * Queries all objects intersecting a frustum.
   * Used for frustum culling.
   *
   * @param frustum - View frustum to test against
   * @returns Array of visible objects
   *
   * @example
   * ```typescript
   * const frustum = Frustum.fromProjectionMatrix(viewProjMatrix);
   * const visible = bvh.queryFrustum(frustum);
   * console.log(`${visible.length} objects visible`);
   * ```
   */
  queryFrustum(frustum: Frustum): BVHObject[] {
    const results: BVHObject[] = [];
    if (this._root) {
      this._stats.totalBoundsTests = 0;
      this._stats.totalObjectTests = 0;
      this._queryFrustumNode(this._root, frustum, results);
    }
    return results;
  }

  /**
   * Queries all objects intersecting a bounding box.
   * Used for range queries and proximity tests.
   *
   * @param bounds - Bounding box to test against
   * @returns Array of intersecting objects
   *
   * @example
   * ```typescript
   * const range = new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5));
   * const nearby = bvh.queryRange(range);
   * ```
   */
  queryRange(bounds: Box3): BVHObject[] {
    const results: BVHObject[] = [];
    if (this._root) {
      this._stats.totalBoundsTests = 0;
      this._stats.totalObjectTests = 0;
      this._queryRangeNode(this._root, bounds, results);
    }
    return results;
  }

  /**
   * Casts a ray through the BVH and returns the closest intersection.
   *
   * @param ray - Ray to cast
   * @param maxDistance - Maximum distance to test (default: Infinity)
   * @returns Closest intersection or null
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, -10), new Vector3(0, 0, 1));
   * const hit = bvh.raycast(ray);
   * if (hit) {
   *   console.log(`Hit object ${hit.object.id} at distance ${hit.distance}`);
   * }
   * ```
   */
  raycast(ray: Ray, maxDistance: number = Infinity): RayIntersection | null {
    if (!this._root) {
      return null;
    }

    this._stats.totalBoundsTests = 0;
    this._stats.totalObjectTests = 0;

    let closestHit: RayIntersection | null = null;
    let closestDistance = maxDistance;

    this._raycastNode(this._root, ray, closestDistance, (object, distance, point) => {
      if (distance < closestDistance) {
        closestDistance = distance;
        closestHit = { object, distance, point };
      }
    });

    return closestHit;
  }

  /**
   * Casts a ray and returns all intersections (unsorted).
   *
   * @param ray - Ray to cast
   * @param maxDistance - Maximum distance to test (default: Infinity)
   * @returns Array of all intersections
   *
   * @example
   * ```typescript
   * const ray = new Ray(new Vector3(0, 0, -10), new Vector3(0, 0, 1));
   * const hits = bvh.raycastAll(ray);
   * console.log(`Hit ${hits.length} objects`);
   * ```
   */
  raycastAll(ray: Ray, maxDistance: number = Infinity): RayIntersection[] {
    const results: RayIntersection[] = [];
    if (!this._root) {
      return results;
    }

    this._stats.totalBoundsTests = 0;
    this._stats.totalObjectTests = 0;

    this._raycastNode(this._root, ray, maxDistance, (object, distance, point) => {
      results.push({ object, distance, point });
    });

    return results;
  }

  /**
   * Gets the root bounding box containing all objects.
   *
   * @returns Root bounding box or empty box if no objects
   */
  get bounds(): Box3 {
    return this._root ? this._root.bounds.clone() : Box3.empty();
  }

  /**
   * Gets statistics about the BVH structure and performance.
   *
   * @returns BVH statistics
   *
   * @example
   * ```typescript
   * const stats = bvh.getStats();
   * console.log(`Nodes: ${stats.nodeCount}`);
   * console.log(`Max depth: ${stats.maxDepth}`);
   * console.log(`Avg leaf objects: ${stats.avgLeafObjects.toFixed(2)}`);
   * ```
   */
  getStats(): BVHStats {
    if (!this._root) {
      return this._createEmptyStats();
    }

    const stats = this._createEmptyStats();
    stats.objectCount = this._objects.length;
    this._computeStats(this._root, 0, stats);

    if (stats.leafCount > 0) {
      stats.avgLeafObjects = stats.objectCount / stats.leafCount;
    }

    return stats;
  }

  /**
   * Clears the BVH, removing all objects.
   */
  clear(): void {
    this._root = null;
    this._objects = [];
    this._stats = this._createEmptyStats();
  }

  /**
   * Builds a BVH node recursively.
   */
  private _buildNode(objects: BVHObject[], depth: number): BVHNode {
    // Compute bounding box for all objects
    const bounds = this._computeBounds(objects);

    // Create leaf node if we've hit limits
    if (objects.length <= this._maxLeafObjects || depth >= this._maxDepth) {
      return {
        bounds,
        left: null,
        right: null,
        objects: [...objects],
        splitAxis: -1,
        splitPos: 0,
      };
    }

    // Find best split
    const split = this._useSAH
      ? this._findBestSplitSAH(objects, bounds)
      : this._findBestSplitMedian(objects, bounds);

    if (!split) {
      // Couldn't find good split, create leaf
      return {
        bounds,
        left: null,
        right: null,
        objects: [...objects],
        splitAxis: -1,
        splitPos: 0,
      };
    }

    // Partition objects
    const { axis, position, leftObjects, rightObjects } = split;

    // Handle edge case where all objects went to one side
    if (leftObjects.length === 0 || rightObjects.length === 0) {
      return {
        bounds,
        left: null,
        right: null,
        objects: [...objects],
        splitAxis: -1,
        splitPos: 0,
      };
    }

    // Build child nodes
    const left = this._buildNode(leftObjects, depth + 1);
    const right = this._buildNode(rightObjects, depth + 1);

    return {
      bounds,
      left,
      right,
      objects: null,
      splitAxis: axis,
      splitPos: position,
    };
  }

  /**
   * Finds the best split using Surface Area Heuristic.
   */
  private _findBestSplitSAH(objects: BVHObject[], bounds: Box3): {
    axis: number;
    position: number;
    leftObjects: BVHObject[];
    rightObjects: BVHObject[];
  } | null {
    const boundsSize = bounds.size;
    const boundsMin = bounds.min;

    let bestCost = Infinity;
    let bestSplit: {
      axis: number;
      position: number;
      leftObjects: BVHObject[];
      rightObjects: BVHObject[];
    } | null = null;

    // Try each axis
    for (let axis = 0; axis < 3; axis++) {
      const axisSize = axis === 0 ? boundsSize.x : axis === 1 ? boundsSize.y : boundsSize.z;
      if (axisSize < 1e-6) continue; // Skip degenerate axis

      // Sort objects by centroid along this axis
      const sortedObjects = [...objects].sort((a, b) => {
        const aCenter = a.bounds.center;
        const bCenter = b.bounds.center;
        const aVal = axis === 0 ? aCenter.x : axis === 1 ? aCenter.y : aCenter.z;
        const bVal = axis === 0 ? bCenter.x : axis === 1 ? bCenter.y : bCenter.z;
        return aVal - bVal;
      });

      // Try splits between objects
      const numSplits = Math.min(objects.length - 1, 16); // Limit evaluations for performance
      for (let i = 1; i <= numSplits; i++) {
        const splitIndex = Math.floor((i / (numSplits + 1)) * objects.length);

        const leftObjects = sortedObjects.slice(0, splitIndex);
        const rightObjects = sortedObjects.slice(splitIndex);

        if (leftObjects.length === 0 || rightObjects.length === 0) continue;

        // Compute cost using SAH
        const leftBounds = this._computeBounds(leftObjects);
        const rightBounds = this._computeBounds(rightObjects);

        const leftArea = this._surfaceArea(leftBounds);
        const rightArea = this._surfaceArea(rightBounds);
        const parentArea = this._surfaceArea(bounds);

        const cost = (leftArea / parentArea) * leftObjects.length +
                     (rightArea / parentArea) * rightObjects.length;

        if (cost < bestCost) {
          bestCost = cost;
          const centerObj = sortedObjects[splitIndex - 1]!.bounds.center;
          const position = axis === 0 ? centerObj.x : axis === 1 ? centerObj.y : centerObj.z;
          bestSplit = { axis, position, leftObjects, rightObjects };
        }
      }
    }

    return bestSplit;
  }

  /**
   * Finds the best split using median cut (fast but lower quality).
   */
  private _findBestSplitMedian(objects: BVHObject[], bounds: Box3): {
    axis: number;
    position: number;
    leftObjects: BVHObject[];
    rightObjects: BVHObject[];
  } | null {
    const boundsSize = bounds.size;

    // Choose longest axis
    let axis = 0;
    if (boundsSize.y > boundsSize.x) axis = 1;
    if (boundsSize.z > Math.max(boundsSize.x, boundsSize.y)) axis = 2;

    // Sort by centroid along this axis
    const sortedObjects = [...objects].sort((a, b) => {
      const aCenter = a.bounds.center;
      const bCenter = b.bounds.center;
      const aVal = axis === 0 ? aCenter.x : axis === 1 ? aCenter.y : aCenter.z;
      const bVal = axis === 0 ? bCenter.x : axis === 1 ? bCenter.y : bCenter.z;
      return aVal - bVal;
    });

    // Split at median
    const mid = Math.floor(objects.length / 2);
    const leftObjects = sortedObjects.slice(0, mid);
    const rightObjects = sortedObjects.slice(mid);

    const centerObj = sortedObjects[mid - 1]!.bounds.center;
    const position = axis === 0 ? centerObj.x : axis === 1 ? centerObj.y : centerObj.z;

    return { axis, position, leftObjects, rightObjects };
  }

  /**
   * Refits node bounds after object updates (bottom-up).
   */
  private _refitNode(node: BVHNode): Box3 {
    if (node.objects) {
      // Leaf node - recompute bounds from objects
      node.bounds = this._computeBounds(node.objects);
      return node.bounds;
    }

    // Interior node - recompute from children
    const leftBounds = node.left ? this._refitNode(node.left) : Box3.empty();
    const rightBounds = node.right ? this._refitNode(node.right) : Box3.empty();
    node.bounds = leftBounds.union(rightBounds);
    return node.bounds;
  }

  /**
   * Queries frustum recursively.
   */
  private _queryFrustumNode(node: BVHNode, frustum: Frustum, results: BVHObject[]): void {
    this._stats.totalBoundsTests++;

    // Test node bounds against frustum
    if (!frustum.intersectsBox(node.bounds)) {
      return;
    }

    if (node.objects) {
      // Leaf node - test objects
      for (const object of node.objects) {
        this._stats.totalObjectTests++;
        if (frustum.intersectsBox(object.bounds)) {
          results.push(object);
        }
      }
    } else {
      // Interior node - recurse to children
      if (node.left) this._queryFrustumNode(node.left, frustum, results);
      if (node.right) this._queryFrustumNode(node.right, frustum, results);
    }
  }

  /**
   * Queries range recursively.
   */
  private _queryRangeNode(node: BVHNode, bounds: Box3, results: BVHObject[]): void {
    this._stats.totalBoundsTests++;

    // Test node bounds against query bounds
    if (!node.bounds.intersectsBox(bounds)) {
      return;
    }

    if (node.objects) {
      // Leaf node - test objects
      for (const object of node.objects) {
        this._stats.totalObjectTests++;
        if (object.bounds.intersectsBox(bounds)) {
          results.push(object);
        }
      }
    } else {
      // Interior node - recurse to children
      if (node.left) this._queryRangeNode(node.left, bounds, results);
      if (node.right) this._queryRangeNode(node.right, bounds, results);
    }
  }

  /**
   * Raycasts through node recursively.
   */
  private _raycastNode(
    node: BVHNode,
    ray: Ray,
    maxDistance: number,
    callback: (object: BVHObject, distance: number, point: Vector3) => void
  ): void {
    this._stats.totalBoundsTests++;

    // Test ray against node bounds
    const intersection = ray.intersectBox(node.bounds);
    if (!intersection || intersection.t > maxDistance) {
      return;
    }

    if (node.objects) {
      // Leaf node - test objects
      for (const object of node.objects) {
        this._stats.totalObjectTests++;
        const hit = ray.intersectBox(object.bounds);
        if (hit && hit.t <= maxDistance) {
          callback(object, hit.t, hit.point);
        }
      }
    } else {
      // Interior node - recurse to children
      // Test both children (we don't know which is closer without more info)
      if (node.left) this._raycastNode(node.left, ray, maxDistance, callback);
      if (node.right) this._raycastNode(node.right, ray, maxDistance, callback);
    }
  }

  /**
   * Computes the bounding box for a list of objects.
   */
  private _computeBounds(objects: BVHObject[]): Box3 {
    if (objects.length === 0) {
      return Box3.empty();
    }

    let bounds = objects[0]!.bounds.clone();
    for (let i = 1; i < objects.length; i++) {
      bounds = bounds.union(objects[i]!.bounds);
    }
    return bounds;
  }

  /**
   * Computes surface area of a bounding box (for SAH).
   */
  private _surfaceArea(bounds: Box3): number {
    if (bounds.isEmpty) return 0;
    const size = bounds.size;
    return 2 * (size.x * size.y + size.y * size.z + size.z * size.x);
  }

  /**
   * Computes statistics recursively.
   */
  private _computeStats(node: BVHNode, depth: number, stats: BVHStats): void {
    stats.nodeCount++;
    stats.maxDepth = Math.max(stats.maxDepth, depth);

    if (node.objects) {
      stats.leafCount++;
    } else {
      if (node.left) this._computeStats(node.left, depth + 1, stats);
      if (node.right) this._computeStats(node.right, depth + 1, stats);
    }
  }

  /**
   * Creates empty statistics object.
   */
  private _createEmptyStats(): BVHStats {
    return {
      nodeCount: 0,
      leafCount: 0,
      objectCount: 0,
      maxDepth: 0,
      avgLeafObjects: 0,
      totalBoundsTests: 0,
      totalObjectTests: 0,
    };
  }
}
