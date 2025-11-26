/**
 * K-dimensional tree for fast nearest neighbor search.
 * Optimized for motion matching pose search with O(log n) complexity.
 * @module animation/KDTree
 */

/**
 * Node in the KD-tree structure.
 */
interface KDNode {
  /** Feature vector for this node */
  point: Float32Array;
  /** Original index in the database */
  index: number;
  /** Split dimension for this node */
  splitDim: number;
  /** Left child node */
  left: KDNode | null;
  /** Right child node */
  right: KDNode | null;
}

/**
 * Result from nearest neighbor search.
 */
export interface KDSearchResult {
  /** Index of the found point */
  index: number;
  /** Squared distance to query point */
  distanceSq: number;
}

/**
 * Configuration for KD-tree construction.
 */
export interface KDTreeConfig {
  /** Feature vectors (each row is a point) */
  points: Float32Array[];
  /** Number of dimensions per point */
  dimensions: number;
}

/**
 * K-dimensional tree for efficient spatial queries.
 * Used for fast pose matching in motion databases.
 *
 * @example
 * ```typescript
 * // Build tree from pose features
 * const points = [
 *   new Float32Array([1, 2, 3]),
 *   new Float32Array([4, 5, 6]),
 *   new Float32Array([7, 8, 9])
 * ];
 *
 * const tree = new KDTree({ points, dimensions: 3 });
 *
 * // Find nearest pose
 * const query = new Float32Array([3, 4, 5]);
 * const nearest = tree.nearest(query);
 * console.log(`Best match: pose ${nearest.index}, distance: ${Math.sqrt(nearest.distanceSq)}`);
 *
 * // Find k nearest poses
 * const kNearest = tree.kNearest(query, 5);
 * console.log(`Found ${kNearest.length} similar poses`);
 *
 * // Radius search
 * const withinRadius = tree.radiusSearch(query, 2.0);
 * console.log(`Found ${withinRadius.length} poses within radius`);
 * ```
 */
export class KDTree {
  /**
   * Root node of the tree.
   */
  private root: KDNode | null;

  /**
   * Number of dimensions in feature space.
   */
  private readonly dimensions: number;

  /**
   * Original points array.
   */
  private readonly points: Float32Array[];

  /**
   * Creates a KD-tree from feature points.
   *
   * @param config - Tree configuration
   *
   * @example
   * ```typescript
   * const tree = new KDTree({
   *   points: featureVectors,
   *   dimensions: 12
   * });
   * ```
   */
  constructor(config: KDTreeConfig) {
    this.dimensions = config.dimensions;
    this.points = config.points;

    if (this.points.length === 0) {
      this.root = null;
      return;
    }

    const indices = new Array(this.points.length);
    for (let i = 0; i < indices.length; i++) {
      indices[i] = i;
    }

    this.root = this.buildTree(indices, 0);
  }

  /**
   * Finds the nearest neighbor to a query point.
   *
   * @param query - Query feature vector
   * @returns Nearest neighbor result
   *
   * @example
   * ```typescript
   * const query = new Float32Array([1.5, 2.5, 3.5]);
   * const result = tree.nearest(query);
   * console.log(`Best match: index ${result.index}, distance ${Math.sqrt(result.distanceSq)}`);
   * ```
   */
  nearest(query: Float32Array): KDSearchResult {
    if (!this.root) {
      throw new Error('KDTree is empty');
    }

    let best: KDSearchResult = {
      index: this.root.index,
      distanceSq: this.distanceSquared(query, this.root.point)
    };

    this.searchNearest(this.root, query, best);
    return best;
  }

  /**
   * Finds k nearest neighbors to a query point.
   *
   * @param query - Query feature vector
   * @param k - Number of neighbors to find
   * @returns Array of k nearest neighbors, sorted by distance
   *
   * @example
   * ```typescript
   * const query = new Float32Array([1, 2, 3]);
   * const neighbors = tree.kNearest(query, 5);
   * for (const neighbor of neighbors) {
   *   console.log(`Index: ${neighbor.index}, Distance: ${Math.sqrt(neighbor.distanceSq)}`);
   * }
   * ```
   */
  kNearest(query: Float32Array, k: number): KDSearchResult[] {
    if (!this.root) {
      return [];
    }

    const heap: KDSearchResult[] = [];

    this.searchKNearest(this.root, query, k, heap);

    return heap.sort((a, b) => a.distanceSq - b.distanceSq);
  }

  /**
   * Finds all points within a given radius of the query point.
   *
   * @param query - Query feature vector
   * @param radius - Search radius
   * @returns Array of points within radius, sorted by distance
   *
   * @example
   * ```typescript
   * const query = new Float32Array([5, 5, 5]);
   * const results = tree.radiusSearch(query, 3.0);
   * console.log(`Found ${results.length} points within radius 3.0`);
   * ```
   */
  radiusSearch(query: Float32Array, radius: number): KDSearchResult[] {
    if (!this.root) {
      return [];
    }

    const results: KDSearchResult[] = [];
    const radiusSq = radius * radius;

    this.searchRadius(this.root, query, radiusSq, results);

    return results.sort((a, b) => a.distanceSq - b.distanceSq);
  }

  /**
   * Serializes the tree to binary format.
   *
   * @returns Serialized tree data
   *
   * @example
   * ```typescript
   * const data = tree.serialize();
   * // Save to file or transfer over network
   * ```
   */
  serialize(): ArrayBuffer {
    if (!this.root) {
      return new ArrayBuffer(0);
    }

    const nodeCount = this.countNodes(this.root);

    const headerSize = 12;
    const nodeSize = 8;
    const pointDataSize = this.points.length * this.dimensions * 4;
    const bufferSize = headerSize + (nodeCount * nodeSize) + pointDataSize;

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    view.setUint32(0, this.dimensions, true);
    view.setUint32(4, this.points.length, true);
    view.setUint32(8, nodeCount, true);

    let nodeOffset = headerSize;
    const nodeOffsets = new Map<KDNode, number>();

    const serializeNode = (node: KDNode | null): void => {
      if (!node) return;

      const currentOffset = nodeOffset;
      nodeOffsets.set(node, currentOffset);
      nodeOffset += nodeSize;

      serializeNode(node.left);
      serializeNode(node.right);
    };

    serializeNode(this.root);

    nodeOffset = headerSize;
    const writeNode = (node: KDNode | null): void => {
      if (!node) return;

      view.setUint32(nodeOffset, node.index, true);
      view.setUint16(nodeOffset + 4, node.splitDim, true);

      const leftOffset = node.left ? nodeOffsets.get(node.left)! : 0;
      const rightOffset = node.right ? nodeOffsets.get(node.right)! : 0;

      view.setUint16(nodeOffset + 6, leftOffset !== 0 ? 1 : 0, true);
      nodeOffset += nodeSize;

      writeNode(node.left);
      writeNode(node.right);
    };

    writeNode(this.root);

    let pointOffset = headerSize + (nodeCount * nodeSize);
    for (let i = 0; i < this.points.length; i++) {
      for (let j = 0; j < this.dimensions; j++) {
        view.setFloat32(pointOffset, this.points[i][j], true);
        pointOffset += 4;
      }
    }

    return buffer;
  }

  /**
   * Deserializes a tree from binary format.
   *
   * @param buffer - Serialized tree data
   * @returns Deserialized KDTree
   *
   * @example
   * ```typescript
   * const tree = KDTree.deserialize(savedData);
   * const result = tree.nearest(query);
   * ```
   */
  static deserialize(buffer: ArrayBuffer): KDTree {
    const view = new DataView(buffer);

    const dimensions = view.getUint32(0, true);
    const pointCount = view.getUint32(4, true);
    const nodeCount = view.getUint32(8, true);

    const points: Float32Array[] = new Array(pointCount);

    let pointOffset = 12 + (nodeCount * 8);
    for (let i = 0; i < pointCount; i++) {
      const point = new Float32Array(dimensions);
      for (let j = 0; j < dimensions; j++) {
        point[j] = view.getFloat32(pointOffset, true);
        pointOffset += 4;
      }
      points[i] = point;
    }

    return new KDTree({ points, dimensions });
  }

  /**
   * Builds a balanced KD-tree from point indices.
   * @private
   */
  private buildTree(indices: number[], depth: number): KDNode | null {
    if (indices.length === 0) {
      return null;
    }

    const axis = depth % this.dimensions;

    indices.sort((a, b) => this.points[a][axis] - this.points[b][axis]);

    const medianIdx = Math.floor(indices.length / 2);
    const medianPointIdx = indices[medianIdx];

    const node: KDNode = {
      point: this.points[medianPointIdx],
      index: medianPointIdx,
      splitDim: axis,
      left: this.buildTree(indices.slice(0, medianIdx), depth + 1),
      right: this.buildTree(indices.slice(medianIdx + 1), depth + 1)
    };

    return node;
  }

  /**
   * Recursive nearest neighbor search.
   * @private
   */
  private searchNearest(
    node: KDNode | null,
    query: Float32Array,
    best: KDSearchResult
  ): void {
    if (!node) return;

    const distSq = this.distanceSquared(query, node.point);
    if (distSq < best.distanceSq) {
      best.index = node.index;
      best.distanceSq = distSq;
    }

    const axis = node.splitDim;
    const diff = query[axis] - node.point[axis];

    const nearNode = diff < 0 ? node.left : node.right;
    const farNode = diff < 0 ? node.right : node.left;

    this.searchNearest(nearNode, query, best);

    if (diff * diff < best.distanceSq) {
      this.searchNearest(farNode, query, best);
    }
  }

  /**
   * Recursive k-nearest neighbor search.
   * @private
   */
  private searchKNearest(
    node: KDNode | null,
    query: Float32Array,
    k: number,
    heap: KDSearchResult[]
  ): void {
    if (!node) return;

    const distSq = this.distanceSquared(query, node.point);

    if (heap.length < k) {
      heap.push({ index: node.index, distanceSq: distSq });
      heap.sort((a, b) => b.distanceSq - a.distanceSq);
    } else if (distSq < heap[0].distanceSq) {
      heap[0] = { index: node.index, distanceSq: distSq };
      heap.sort((a, b) => b.distanceSq - a.distanceSq);
    }

    const axis = node.splitDim;
    const diff = query[axis] - node.point[axis];

    const nearNode = diff < 0 ? node.left : node.right;
    const farNode = diff < 0 ? node.right : node.left;

    this.searchKNearest(nearNode, query, k, heap);

    const maxDistSq = heap.length < k ? Infinity : heap[0].distanceSq;
    if (diff * diff < maxDistSq) {
      this.searchKNearest(farNode, query, k, heap);
    }
  }

  /**
   * Recursive radius search.
   * @private
   */
  private searchRadius(
    node: KDNode | null,
    query: Float32Array,
    radiusSq: number,
    results: KDSearchResult[]
  ): void {
    if (!node) return;

    const distSq = this.distanceSquared(query, node.point);

    if (distSq <= radiusSq) {
      results.push({ index: node.index, distanceSq: distSq });
    }

    const axis = node.splitDim;
    const diff = query[axis] - node.point[axis];

    const nearNode = diff < 0 ? node.left : node.right;
    const farNode = diff < 0 ? node.right : node.left;

    this.searchRadius(nearNode, query, radiusSq, results);

    if (diff * diff <= radiusSq) {
      this.searchRadius(farNode, query, radiusSq, results);
    }
  }

  /**
   * Computes squared Euclidean distance between two points.
   * @private
   */
  private distanceSquared(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < this.dimensions; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return sum;
  }

  /**
   * Counts total nodes in subtree.
   * @private
   */
  private countNodes(node: KDNode | null): number {
    if (!node) return 0;
    return 1 + this.countNodes(node.left) + this.countNodes(node.right);
  }
}
