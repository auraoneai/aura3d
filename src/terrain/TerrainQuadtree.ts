/**
 * Quadtree spatial structure for efficient terrain chunk management and culling.
 * Handles chunk streaming, LOD determination, and frustum culling.
 * @module TerrainQuadtree
 */

import { Vector2 } from '../math/Vector2';
import { Vector3 } from '../math/Vector3';
import { Box3 } from '../math/Box3';
import { Frustum } from '../math/Frustum';
import { Camera } from '../rendering/camera/Camera';
import { TerrainChunk } from './TerrainChunk';
import { TerrainLOD, LODSelection } from './TerrainLOD';
import { Logger } from '../core/Logger';

const logger = Logger.create('TerrainQuadtree');

/**
 * Quadtree node representing a terrain region.
 */
export interface QuadtreeNode {
  /** Node bounding box */
  bounds: Box3;
  /** Grid position */
  gridPosition: Vector2;
  /** Node level (0 = root) */
  level: number;
  /** Child nodes (NW, NE, SW, SE) */
  children: QuadtreeNode[] | null;
  /** Associated chunk (if leaf node) */
  chunk: TerrainChunk | null;
  /** Selected LOD level */
  lodLevel: number;
  /** Is currently visible */
  visible: boolean;
  /** Distance to camera */
  distanceToCamera: number;
}

/**
 * Quadtree configuration.
 */
export interface QuadtreeConfig {
  /** Maximum tree depth */
  maxDepth: number;
  /** Minimum chunk size in world units */
  minChunkSize: number;
  /** Maximum chunks to keep loaded */
  maxLoadedChunks: number;
  /** Enable frustum culling */
  frustumCulling: boolean;
  /** Distance for chunk unloading */
  unloadDistance: number;
}

/**
 * Chunk streaming request.
 */
export interface StreamingRequest {
  /** Node to stream */
  node: QuadtreeNode;
  /** Priority (higher = more important) */
  priority: number;
  /** Request type */
  type: 'load' | 'unload';
}

/**
 * Terrain quadtree for spatial organization and chunk management.
 * Implements efficient frustum culling, LOD selection, and memory management.
 *
 * @example
 * ```typescript
 * const quadtree = new TerrainQuadtree({
 *   maxDepth: 6,
 *   minChunkSize: 50,
 *   maxLoadedChunks: 64,
 *   frustumCulling: true,
 *   unloadDistance: 2000
 * });
 *
 * // Build tree for terrain
 * quadtree.build(terrain, lodManager);
 *
 * // Update visibility and LOD
 * const visibleChunks = quadtree.update(camera, frustum);
 *
 * // Get streaming requests
 * const requests = quadtree.getStreamingRequests();
 * ```
 */
export class TerrainQuadtree {
  /** Configuration */
  private _config: QuadtreeConfig;
  /** Root node */
  private _root: QuadtreeNode | null;
  /** All leaf nodes */
  private _leaves: QuadtreeNode[];
  /** Loaded chunks */
  private _loadedChunks: Set<TerrainChunk>;
  /** LOD manager */
  private _lodManager: TerrainLOD | null;
  /** Pending streaming requests */
  private _streamingQueue: StreamingRequest[];
  /** Frame counter for LRU */
  private _frameCounter: number;

  /**
   * Creates a new terrain quadtree.
   *
   * @param config - Quadtree configuration
   */
  constructor(config: Partial<QuadtreeConfig> = {}) {
    this._config = {
      maxDepth: config.maxDepth ?? 6,
      minChunkSize: config.minChunkSize ?? 50,
      maxLoadedChunks: config.maxLoadedChunks ?? 64,
      frustumCulling: config.frustumCulling ?? true,
      unloadDistance: config.unloadDistance ?? 2000,
    };

    this._root = null;
    this._leaves = [];
    this._loadedChunks = new Set();
    this._lodManager = null;
    this._streamingQueue = [];
    this._frameCounter = 0;
  }

  /**
   * Gets the root node.
   * @returns Root node or null
   */
  get root(): QuadtreeNode | null {
    return this._root;
  }

  /**
   * Gets all leaf nodes.
   * @returns Array of leaf nodes
   */
  get leaves(): readonly QuadtreeNode[] {
    return this._leaves;
  }

  /**
   * Gets loaded chunk count.
   * @returns Number of loaded chunks
   */
  get loadedChunkCount(): number {
    return this._loadedChunks.size;
  }

  /**
   * Builds the quadtree structure.
   *
   * @param bounds - Total terrain bounds
   * @param lodManager - LOD manager for level selection
   */
  build(bounds: Box3, lodManager: TerrainLOD): void {
    this._lodManager = lodManager;
    this._leaves = [];

    const size = bounds.getSize();
    this._root = this._createNode(
      bounds,
      new Vector2(0, 0),
      0
    );

    this._subdivide(this._root, size.x, size.z);

    logger.info(`Built quadtree with ${this._leaves.length} leaf nodes`);
  }

  /**
   * Updates visibility and LOD for all nodes.
   *
   * @param camera - Active camera
   * @param frustum - View frustum for culling
   * @returns Array of visible chunks
   */
  update(camera: Camera, frustum: Frustum): TerrainChunk[] {
    this._frameCounter++;

    if (!this._root) return [];

    const cameraPos = new Vector3();
    camera.transform.getWorldPosition(cameraPos);

    const visibleChunks: TerrainChunk[] = [];

    // Clear streaming queue
    this._streamingQueue = [];

    // Traverse tree and update nodes
    this._updateNode(this._root, camera, cameraPos, frustum, visibleChunks);

    // Process streaming requests
    this._processStreaming();

    return visibleChunks;
  }

  /**
   * Gets pending streaming requests.
   * @returns Array of streaming requests
   */
  getStreamingRequests(): readonly StreamingRequest[] {
    return this._streamingQueue;
  }

  /**
   * Loads a chunk for a node.
   *
   * @param node - Node to load chunk for
   * @param chunk - Chunk to load
   */
  loadChunk(node: QuadtreeNode, chunk: TerrainChunk): void {
    node.chunk = chunk;
    this._loadedChunks.add(chunk);
  }

  /**
   * Unloads a chunk from a node.
   *
   * @param node - Node to unload chunk from
   */
  unloadChunk(node: QuadtreeNode): void {
    if (node.chunk) {
      this._loadedChunks.delete(node.chunk);
      node.chunk.clearCache();
      node.chunk = null;
    }
  }

  /**
   * Clears all loaded chunks.
   */
  clear(): void {
    for (const chunk of this._loadedChunks) {
      chunk.clearCache();
    }
    this._loadedChunks.clear();

    for (const leaf of this._leaves) {
      leaf.chunk = null;
    }
  }

  /**
   * Gets memory usage in bytes.
   * @returns Memory usage
   */
  getMemoryUsage(): number {
    let bytes = 0;
    for (const chunk of this._loadedChunks) {
      bytes += chunk.getMemoryUsage();
    }
    return bytes;
  }

  /**
   * Creates a quadtree node.
   * @private
   */
  private _createNode(
    bounds: Box3,
    gridPosition: Vector2,
    level: number
  ): QuadtreeNode {
    return {
      bounds,
      gridPosition: gridPosition.clone(),
      level,
      children: null,
      chunk: null,
      lodLevel: 0,
      visible: false,
      distanceToCamera: Infinity,
    };
  }

  /**
   * Recursively subdivides the quadtree.
   * @private
   */
  private _subdivide(node: QuadtreeNode, width: number, height: number): void {
    // Check if we should subdivide
    if (
      node.level >= this._config.maxDepth ||
      width <= this._config.minChunkSize ||
      height <= this._config.minChunkSize
    ) {
      // Leaf node
      this._leaves.push(node);
      return;
    }

    // Subdivide into 4 children
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    const min = node.bounds.min;
    const center = node.bounds.getCenter();

    node.children = [];

    // Northwest
    const nwBounds = new Box3(
      new Vector3(min.x, min.y, center.z),
      new Vector3(center.x, node.bounds.max.y, node.bounds.max.z)
    );
    const nw = this._createNode(nwBounds, new Vector2(node.gridPosition.x * 2, node.gridPosition.y * 2 + 1), node.level + 1);
    node.children.push(nw);

    // Northeast
    const neBounds = new Box3(
      new Vector3(center.x, min.y, center.z),
      new Vector3(node.bounds.max.x, node.bounds.max.y, node.bounds.max.z)
    );
    const ne = this._createNode(neBounds, new Vector2(node.gridPosition.x * 2 + 1, node.gridPosition.y * 2 + 1), node.level + 1);
    node.children.push(ne);

    // Southwest
    const swBounds = new Box3(
      new Vector3(min.x, min.y, min.z),
      new Vector3(center.x, node.bounds.max.y, center.z)
    );
    const sw = this._createNode(swBounds, new Vector2(node.gridPosition.x * 2, node.gridPosition.y * 2), node.level + 1);
    node.children.push(sw);

    // Southeast
    const seBounds = new Box3(
      new Vector3(center.x, min.y, min.z),
      new Vector3(node.bounds.max.x, node.bounds.max.y, center.z)
    );
    const se = this._createNode(seBounds, new Vector2(node.gridPosition.x * 2 + 1, node.gridPosition.y * 2), node.level + 1);
    node.children.push(se);

    // Recursively subdivide children
    for (const child of node.children) {
      this._subdivide(child, halfWidth, halfHeight);
    }
  }

  /**
   * Updates a node and its children.
   * @private
   */
  private _updateNode(
    node: QuadtreeNode,
    camera: Camera,
    cameraPos: Vector3,
    frustum: Frustum,
    visibleChunks: TerrainChunk[]
  ): void {
    // Calculate distance to camera
    const nodeCenter = node.bounds.getCenter();
    node.distanceToCamera = cameraPos.distanceTo(nodeCenter);

    // Frustum culling
    if (this._config.frustumCulling) {
      if (!frustum.intersectsBox(node.bounds)) {
        node.visible = false;
        return;
      }
    }

    node.visible = true;

    // Update children if not a leaf
    if (node.children) {
      for (const child of node.children) {
        this._updateNode(child, camera, cameraPos, frustum, visibleChunks);
      }
      return;
    }

    // Leaf node - update LOD and check streaming
    if (this._lodManager) {
      const selection = this._lodManager.selectLOD(nodeCenter, camera);
      node.lodLevel = selection.level;
    }

    // Check if chunk should be loaded
    if (node.distanceToCamera <= this._config.unloadDistance) {
      if (!node.chunk) {
        // Request chunk load
        this._streamingQueue.push({
          node,
          priority: 1 / (node.distanceToCamera + 1),
          type: 'load',
        });
      } else {
        visibleChunks.push(node.chunk);
      }
    } else {
      // Check if chunk should be unloaded
      if (node.chunk) {
        this._streamingQueue.push({
          node,
          priority: -node.distanceToCamera,
          type: 'unload',
        });
      }
    }
  }

  /**
   * Processes streaming requests based on priority.
   * @private
   */
  private _processStreaming(): void {
    // Sort by priority (highest first)
    this._streamingQueue.sort((a, b) => b.priority - a.priority);

    // Process load requests
    const loadRequests = this._streamingQueue.filter(r => r.type === 'load');
    for (const request of loadRequests) {
      if (this._loadedChunks.size >= this._config.maxLoadedChunks) {
        break;
      }
      // Actual loading would be handled by terrain system
    }

    // Process unload requests if over limit
    if (this._loadedChunks.size > this._config.maxLoadedChunks) {
      const unloadRequests = this._streamingQueue.filter(r => r.type === 'unload');
      const toUnload = this._loadedChunks.size - this._config.maxLoadedChunks;

      for (let i = 0; i < Math.min(toUnload, unloadRequests.length); i++) {
        this.unloadChunk(unloadRequests[i]!.node);
      }
    }
  }

  /**
   * Queries nodes within a radius.
   *
   * @param position - Center position
   * @param radius - Query radius
   * @returns Array of nodes within radius
   */
  queryRadius(position: Vector3, radius: number): QuadtreeNode[] {
    const results: QuadtreeNode[] = [];

    if (!this._root) return results;

    this._queryRadiusRecursive(this._root, position, radius, results);

    return results;
  }

  /**
   * Recursive radius query.
   * @private
   */
  private _queryRadiusRecursive(
    node: QuadtreeNode,
    position: Vector3,
    radius: number,
    results: QuadtreeNode[]
  ): void {
    // Check if bounds intersect query sphere
    const closestPoint = node.bounds.clampPoint(position);
    const distance = position.distanceTo(closestPoint);

    if (distance > radius) return;

    // Add leaf nodes
    if (!node.children) {
      results.push(node);
      return;
    }

    // Recurse to children
    for (const child of node.children) {
      this._queryRadiusRecursive(child, position, radius, results);
    }
  }

  /**
   * Finds the leaf node containing a position.
   *
   * @param position - World position
   * @returns Leaf node or null
   */
  findLeaf(position: Vector3): QuadtreeNode | null {
    if (!this._root) return null;

    return this._findLeafRecursive(this._root, position);
  }

  /**
   * Recursive leaf search.
   * @private
   */
  private _findLeafRecursive(node: QuadtreeNode, position: Vector3): QuadtreeNode | null {
    if (!node.bounds.containsPoint(position)) return null;

    if (!node.children) return node;

    for (const child of node.children) {
      const result = this._findLeafRecursive(child, position);
      if (result) return result;
    }

    return null;
  }
}
