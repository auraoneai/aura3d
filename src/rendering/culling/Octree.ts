/**
 * Octree spatial partitioning structure for dynamic object management.
 * Supports insertion, removal, and various spatial queries.
 * Implements loose octree variant for better handling of moving objects.
 * @module Octree
 */

import { Box3 } from '../../math/Box3';
import { Vector3 } from '../../math/Vector3';
import { Sphere } from '../../math/Sphere';
import { Frustum } from '../../math/Frustum';

/**
 * Object that can be stored in the octree.
 */
export interface OctreeObject {
  /**
   * Unique identifier for this object.
   */
  id: number;

  /**
   * Bounding box for this object.
   */
  bounds: Box3;

  /**
   * User data (e.g., reference to scene node).
   */
  data?: any;
}

/**
 * Octree node in the tree structure.
 */
class OctreeNode {
  /**
   * Bounding box for this node.
   */
  bounds: Box3;

  /**
   * Center point of this node.
   */
  center: Vector3;

  /**
   * Half-size of this node.
   */
  halfSize: Vector3;

  /**
   * Objects stored in this node (null for interior nodes).
   */
  objects: OctreeObject[] | null = [];

  /**
   * Child nodes (8 octants, null until subdivided).
   */
  children: OctreeNode[] | null = null;

  /**
   * Parent node (null for root).
   */
  parent: OctreeNode | null = null;

  /**
   * Depth of this node in the tree.
   */
  depth: number;

  constructor(bounds: Box3, depth: number = 0) {
    this.bounds = bounds.clone();
    this.center = bounds.center;
    this.halfSize = bounds.size.scale(0.5);
    this.depth = depth;
  }

  /**
   * Checks if this is a leaf node.
   */
  get isLeaf(): boolean {
    return this.children === null;
  }

  /**
   * Gets the total number of objects in this node and all children.
   */
  get totalObjects(): number {
    if (this.isLeaf) {
      return this.objects ? this.objects.length : 0;
    }

    let total = 0;
    for (const child of this.children!) {
      total += child.totalObjects;
    }
    return total;
  }
}

/**
 * Statistics for octree performance monitoring.
 */
export interface OctreeStats {
  nodeCount: number;
  leafCount: number;
  objectCount: number;
  maxDepth: number;
  avgObjectsPerLeaf: number;
  totalBoundsTests: number;
  totalObjectTests: number;
}

/**
 * Octree spatial partitioning structure for efficient object management.
 *
 * The octree subdivides 3D space into eight octants recursively, allowing
 * for fast spatial queries and dynamic object insertion/removal.
 *
 * Features:
 * - Dynamic insertion and removal
 * - Automatic subdivision and merging
 * - Loose octree variant for better handling of large objects
 * - Frustum queries for culling
 * - Range queries for proximity
 * - Point and sphere queries
 * - Performance statistics
 *
 * @example
 * ```typescript
 * // Create octree with world bounds
 * const worldBounds = new Box3(
 *   new Vector3(-100, -100, -100),
 *   new Vector3(100, 100, 100)
 * );
 * const octree = new Octree(worldBounds, 8, 32);
 *
 * // Insert objects
 * const object: OctreeObject = {
 *   id: 1,
 *   bounds: new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1))
 * };
 * octree.insert(object);
 *
 * // Query by frustum
 * const frustum = Frustum.fromProjectionMatrix(viewProjMatrix);
 * const visible = octree.queryFrustum(frustum);
 *
 * // Query by range
 * const range = new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5));
 * const nearby = octree.queryRange(range);
 *
 * // Query by point
 * const point = new Vector3(0, 0, 0);
 * const atPoint = octree.queryPoint(point);
 *
 * // Remove object
 * octree.remove(object);
 *
 * // Get statistics
 * const stats = octree.getStats();
 * console.log(`Nodes: ${stats.nodeCount}, Objects: ${stats.objectCount}`);
 * ```
 */
export class Octree {
  /**
   * Root node of the octree.
   */
  private _root: OctreeNode;

  /**
   * Maximum objects per node before subdivision.
   */
  private _maxObjects: number;

  /**
   * Maximum depth of the tree.
   */
  private _maxDepth: number;

  /**
   * Looseness factor (1.0 = standard octree, >1.0 = loose octree).
   */
  private _looseness: number;

  /**
   * Map of object ID to containing node for fast removal.
   */
  private _objectNodeMap: Map<number, OctreeNode>;

  /**
   * Statistics counters.
   */
  private _stats: OctreeStats;

  /**
   * Creates a new Octree instance.
   *
   * @param bounds - World bounds for the octree
   * @param maxObjects - Maximum objects per node (default: 8)
   * @param maxDepth - Maximum tree depth (default: 8)
   * @param looseness - Looseness factor for loose octree (default: 1.0)
   *
   * @example
   * ```typescript
   * const bounds = new Box3(
   *   new Vector3(-100, -100, -100),
   *   new Vector3(100, 100, 100)
   * );
   * const octree = new Octree(bounds, 8, 8, 1.0);
   * const looseOctree = new Octree(bounds, 8, 8, 2.0); // 2x larger nodes
   * ```
   */
  constructor(
    bounds: Box3,
    maxObjects: number = 8,
    maxDepth: number = 8,
    looseness: number = 1.0
  ) {
    this._root = new OctreeNode(bounds, 0);
    this._maxObjects = maxObjects;
    this._maxDepth = maxDepth;
    this._looseness = Math.max(1.0, looseness);
    this._objectNodeMap = new Map();
    this._stats = this._createEmptyStats();
  }

  /**
   * Inserts an object into the octree.
   * The object will be placed in the smallest node that can contain it.
   *
   * @param object - Object to insert
   * @returns True if inserted successfully
   *
   * @example
   * ```typescript
   * const object: OctreeObject = {
   *   id: 1,
   *   bounds: new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1))
   * };
   * octree.insert(object);
   * ```
   */
  insert(object: OctreeObject): boolean {
    // Check if already exists
    if (this._objectNodeMap.has(object.id)) {
      console.warn(`Octree: Object ${object.id} already exists`);
      return false;
    }

    // Check if object is within root bounds
    if (!this._root.bounds.intersectsBox(object.bounds)) {
      console.warn('Octree: Object outside root bounds');
      return false;
    }

    // Insert into tree
    const inserted = this._insertIntoNode(this._root, object);
    if (inserted) {
      this._stats.objectCount++;
    }
    return inserted;
  }

  /**
   * Removes an object from the octree.
   *
   * @param object - Object to remove
   * @returns True if removed successfully
   *
   * @example
   * ```typescript
   * octree.remove(object);
   * ```
   */
  remove(object: OctreeObject): boolean {
    const node = this._objectNodeMap.get(object.id);
    if (!node) {
      return false;
    }

    // Remove from node
    if (node.objects) {
      const index = node.objects.findIndex(obj => obj.id === object.id);
      if (index !== -1) {
        node.objects.splice(index, 1);
        this._objectNodeMap.delete(object.id);
        this._stats.objectCount--;

        // Try to merge empty nodes
        this._tryMerge(node);
        return true;
      }
    }

    return false;
  }

  /**
   * Updates an object's position in the octree.
   * This is equivalent to removing and re-inserting.
   *
   * @param object - Object with updated bounds
   * @returns True if updated successfully
   *
   * @example
   * ```typescript
   * // Update object position
   * object.bounds = new Box3(new Vector3(5, 0, 0), new Vector3(6, 1, 1));
   * octree.update(object);
   * ```
   */
  update(object: OctreeObject): boolean {
    if (!this.remove(object)) {
      return false;
    }
    return this.insert(object);
  }

  /**
   * Queries all objects intersecting a frustum.
   *
   * @param frustum - Frustum to test against
   * @returns Array of intersecting objects
   *
   * @example
   * ```typescript
   * const frustum = Frustum.fromProjectionMatrix(viewProjMatrix);
   * const visible = octree.queryFrustum(frustum);
   * ```
   */
  queryFrustum(frustum: Frustum): OctreeObject[] {
    const results: OctreeObject[] = [];
    this._stats.totalBoundsTests = 0;
    this._stats.totalObjectTests = 0;
    this._queryFrustumNode(this._root, frustum, results);
    return results;
  }

  /**
   * Queries all objects intersecting a bounding box.
   *
   * @param bounds - Bounding box to test against
   * @returns Array of intersecting objects
   *
   * @example
   * ```typescript
   * const range = new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5));
   * const nearby = octree.queryRange(range);
   * ```
   */
  queryRange(bounds: Box3): OctreeObject[] {
    const results: OctreeObject[] = [];
    this._stats.totalBoundsTests = 0;
    this._stats.totalObjectTests = 0;
    this._queryRangeNode(this._root, bounds, results);
    return results;
  }

  /**
   * Queries all objects containing a point.
   *
   * @param point - Point to test
   * @returns Array of objects containing the point
   *
   * @example
   * ```typescript
   * const point = new Vector3(0, 0, 0);
   * const objects = octree.queryPoint(point);
   * ```
   */
  queryPoint(point: Vector3): OctreeObject[] {
    const results: OctreeObject[] = [];
    this._stats.totalBoundsTests = 0;
    this._stats.totalObjectTests = 0;
    this._queryPointNode(this._root, point, results);
    return results;
  }

  /**
   * Queries all objects intersecting a sphere.
   *
   * @param sphere - Sphere to test against
   * @returns Array of intersecting objects
   *
   * @example
   * ```typescript
   * const sphere = new Sphere(new Vector3(0, 0, 0), 5);
   * const nearby = octree.querySphere(sphere);
   * ```
   */
  querySphere(sphere: Sphere): OctreeObject[] {
    const results: OctreeObject[] = [];
    this._stats.totalBoundsTests = 0;
    this._stats.totalObjectTests = 0;
    this._querySphereNode(this._root, sphere, results);
    return results;
  }

  /**
   * Clears the octree, removing all objects.
   */
  clear(): void {
    this._root.children = null;
    this._root.objects = [];
    this._objectNodeMap.clear();
    this._stats = this._createEmptyStats();
  }

  /**
   * Gets the root bounding box.
   */
  get bounds(): Box3 {
    return this._root.bounds.clone();
  }

  /**
   * Gets statistics about the octree structure and performance.
   *
   * @returns Octree statistics
   *
   * @example
   * ```typescript
   * const stats = octree.getStats();
   * console.log(`Nodes: ${stats.nodeCount}`);
   * console.log(`Objects: ${stats.objectCount}`);
   * console.log(`Max depth: ${stats.maxDepth}`);
   * ```
   */
  getStats(): OctreeStats {
    const stats = this._createEmptyStats();
    stats.objectCount = this._stats.objectCount;
    this._computeStats(this._root, stats);

    if (stats.leafCount > 0) {
      stats.avgObjectsPerLeaf = stats.objectCount / stats.leafCount;
    }

    return stats;
  }

  /**
   * Inserts object into a node, potentially subdividing.
   */
  private _insertIntoNode(node: OctreeNode, object: OctreeObject): boolean {
    // If this is a leaf node
    if (node.isLeaf) {
      // Add object to this node
      node.objects!.push(object);
      this._objectNodeMap.set(object.id, node);

      // Check if we need to subdivide
      if (node.objects!.length > this._maxObjects && node.depth < this._maxDepth) {
        this._subdivide(node);
      }

      return true;
    }

    // Interior node - find best child
    const childIndex = this._getChildIndex(node, object.bounds);
    if (childIndex === -1) {
      // Object doesn't fit in any child, store at this level
      if (!node.objects) {
        node.objects = [];
      }
      node.objects.push(object);
      this._objectNodeMap.set(object.id, node);
      return true;
    }

    // Insert into child
    return this._insertIntoNode(node.children![childIndex], object);
  }

  /**
   * Subdivides a node into 8 children and redistributes objects.
   */
  private _subdivide(node: OctreeNode): void {
    if (!node.isLeaf) {
      return;
    }

    const center = node.center;
    const halfSize = node.halfSize.scale(0.5);
    const looseness = this._looseness;

    // Create 8 child nodes
    node.children = [];
    for (let i = 0; i < 8; i++) {
      const x = center.x + (i & 1 ? halfSize.x : -halfSize.x);
      const y = center.y + (i & 2 ? halfSize.y : -halfSize.y);
      const z = center.z + (i & 4 ? halfSize.z : -halfSize.z);

      const childCenter = new Vector3(x, y, z);
      const childHalfSize = halfSize.scale(looseness);
      const childBounds = new Box3(
        childCenter.sub(childHalfSize),
        childCenter.add(childHalfSize)
      );

      const child = new OctreeNode(childBounds, node.depth + 1);
      child.parent = node;
      node.children.push(child);
    }

    // Redistribute objects to children
    const objects = node.objects!;
    node.objects = null; // Clear objects from this node

    for (const object of objects) {
      const childIndex = this._getChildIndex(node, object.bounds);
      if (childIndex === -1) {
        // Object doesn't fit in any child, keep at this level
        if (!node.objects) {
          node.objects = [];
        }
        node.objects.push(object);
        this._objectNodeMap.set(object.id, node);
      } else {
        // Move to child
        this._insertIntoNode(node.children[childIndex], object);
      }
    }
  }

  /**
   * Tries to merge empty child nodes back into parent.
   */
  private _tryMerge(node: OctreeNode): void {
    if (node.isLeaf) {
      return;
    }

    // Check if all children are empty leaves
    let canMerge = true;
    let totalObjects = 0;

    for (const child of node.children!) {
      if (!child.isLeaf || (child.objects && child.objects.length > 0)) {
        canMerge = false;
        break;
      }
      totalObjects += child.totalObjects;
    }

    if (canMerge && totalObjects === 0) {
      // Merge children back
      node.children = null;
      node.objects = [];
    }

    // Recursively try to merge parent
    if (node.parent) {
      this._tryMerge(node.parent);
    }
  }

  /**
   * Gets the child index that best fits the bounds (-1 if none).
   */
  private _getChildIndex(node: OctreeNode, bounds: Box3): number {
    if (node.isLeaf) {
      return -1;
    }

    // Find child that fully contains the bounds
    for (let i = 0; i < 8; i++) {
      if (node.children![i]!.bounds.containsBox(bounds)) {
        return i;
      }
    }

    return -1;
  }

  /**
   * Queries frustum recursively.
   */
  private _queryFrustumNode(node: OctreeNode, frustum: Frustum, results: OctreeObject[]): void {
    this._stats.totalBoundsTests++;

    if (!frustum.intersectsBox(node.bounds)) {
      return;
    }

    // Test objects at this level
    if (node.objects) {
      for (const object of node.objects) {
        this._stats.totalObjectTests++;
        if (frustum.intersectsBox(object.bounds)) {
          results.push(object);
        }
      }
    }

    // Recurse to children
    if (node.children) {
      for (const child of node.children) {
        this._queryFrustumNode(child, frustum, results);
      }
    }
  }

  /**
   * Queries range recursively.
   */
  private _queryRangeNode(node: OctreeNode, bounds: Box3, results: OctreeObject[]): void {
    this._stats.totalBoundsTests++;

    if (!node.bounds.intersectsBox(bounds)) {
      return;
    }

    // Test objects at this level
    if (node.objects) {
      for (const object of node.objects) {
        this._stats.totalObjectTests++;
        if (object.bounds.intersectsBox(bounds)) {
          results.push(object);
        }
      }
    }

    // Recurse to children
    if (node.children) {
      for (const child of node.children) {
        this._queryRangeNode(child, bounds, results);
      }
    }
  }

  /**
   * Queries point recursively.
   */
  private _queryPointNode(node: OctreeNode, point: Vector3, results: OctreeObject[]): void {
    this._stats.totalBoundsTests++;

    if (!node.bounds.containsPoint(point)) {
      return;
    }

    // Test objects at this level
    if (node.objects) {
      for (const object of node.objects) {
        this._stats.totalObjectTests++;
        if (object.bounds.containsPoint(point)) {
          results.push(object);
        }
      }
    }

    // Recurse to children
    if (node.children) {
      for (const child of node.children) {
        this._queryPointNode(child, point, results);
      }
    }
  }

  /**
   * Queries sphere recursively.
   */
  private _querySphereNode(node: OctreeNode, sphere: Sphere, results: OctreeObject[]): void {
    this._stats.totalBoundsTests++;

    if (!node.bounds.intersectsSphere(sphere)) {
      return;
    }

    // Test objects at this level
    if (node.objects) {
      for (const object of node.objects) {
        this._stats.totalObjectTests++;
        if (object.bounds.intersectsSphere(sphere)) {
          results.push(object);
        }
      }
    }

    // Recurse to children
    if (node.children) {
      for (const child of node.children) {
        this._querySphereNode(child, sphere, results);
      }
    }
  }

  /**
   * Computes statistics recursively.
   */
  private _computeStats(node: OctreeNode, stats: OctreeStats): void {
    stats.nodeCount++;
    stats.maxDepth = Math.max(stats.maxDepth, node.depth);

    if (node.isLeaf) {
      stats.leafCount++;
    } else {
      for (const child of node.children!) {
        this._computeStats(child, stats);
      }
    }
  }

  /**
   * Creates empty statistics object.
   */
  private _createEmptyStats(): OctreeStats {
    return {
      nodeCount: 0,
      leafCount: 0,
      objectCount: 0,
      maxDepth: 0,
      avgObjectsPerLeaf: 0,
      totalBoundsTests: 0,
      totalObjectTests: 0,
    };
  }
}
