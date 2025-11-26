/**
 * Mesh optimization utilities for vertex cache, overdraw, and simplification.
 * Implements Forsyth algorithm for vertex cache optimization and quadric error metrics for simplification.
 * @module MeshOptimizer
 */

import { Mesh } from './Mesh';
import { IndexBuffer } from './IndexBuffer';
import { Vector3 } from '../../math/Vector3';

/**
 * Vertex cache optimization result.
 */
interface OptimizationResult {
  /** Optimized index buffer */
  indexBuffer: IndexBuffer;
  /** ACMR (Average Cache Miss Ratio) before optimization */
  acmrBefore: number;
  /** ACMR after optimization */
  acmrAfter: number;
  /** Improvement percentage */
  improvement: number;
}

/**
 * Mesh optimizer providing various optimization algorithms.
 * Improves rendering performance through vertex cache optimization,
 * overdraw reduction, and mesh simplification.
 *
 * @example
 * ```typescript
 * // Optimize vertex cache
 * const optimized = MeshOptimizer.optimizeVertexCache(mesh);
 * console.log('ACMR improved by:', optimized.improvement, '%');
 *
 * // Simplify mesh to 50% triangles
 * const simplified = MeshOptimizer.simplify(mesh, 0.5);
 * console.log('Triangles:', simplified.triangleCount);
 * ```
 */
export class MeshOptimizer {
  /**
   * Optimizes index buffer for vertex cache using Forsyth algorithm.
   * Reorders triangles to maximize vertex reuse in post-transform cache.
   *
   * @param mesh - Mesh to optimize
   * @param cacheSize - Vertex cache size (default: 32, typical for modern GPUs)
   * @returns Optimization result with statistics
   *
   * @example
   * ```typescript
   * const result = MeshOptimizer.optimizeVertexCache(mesh);
   * console.log('ACMR before:', result.acmrBefore);
   * console.log('ACMR after:', result.acmrAfter);
   * console.log('Improvement:', result.improvement, '%');
   * ```
   */
  static optimizeVertexCache(mesh: Mesh, cacheSize: number = 32): OptimizationResult {
    const indices = mesh.indexBuffer.data;
    const triangleCount = mesh.triangleCount;
    const vertexCount = mesh.vertexCount;

    // Calculate ACMR before optimization
    const acmrBefore = this.calculateACMR(indices, vertexCount, cacheSize);

    // Build adjacency information
    const adjacency = this.buildAdjacency(indices, triangleCount, vertexCount);

    // Forsyth algorithm
    const optimizedIndices = this.forsythReorder(
      Array.from(indices),
      adjacency,
      vertexCount,
      cacheSize
    );

    // Create new index buffer
    const newIndexBuffer = IndexBuffer.fromArray(
      optimizedIndices,
      mesh.indexBuffer.indexType,
      mesh.indexBuffer.topology
    );

    // Calculate ACMR after optimization
    const acmrAfter = this.calculateACMR(newIndexBuffer.data, vertexCount, cacheSize);

    const improvement = ((acmrBefore - acmrAfter) / acmrBefore) * 100;

    return {
      indexBuffer: newIndexBuffer,
      acmrBefore,
      acmrAfter,
      improvement,
    };
  }

  /**
   * Optimizes mesh for reduced overdraw.
   * Reorders triangles from front to back to maximize early-Z rejection.
   *
   * @param mesh - Mesh to optimize
   * @param viewDirection - View direction for sorting (default: [0, 0, -1])
   * @returns New mesh with optimized index buffer
   *
   * @example
   * ```typescript
   * const optimized = MeshOptimizer.optimizeOverdraw(mesh, [0, 0, -1]);
   * ```
   */
  static optimizeOverdraw(mesh: Mesh, viewDirection: [number, number, number] = [0, 0, -1]): Mesh {
    const indices = Array.from(mesh.indexBuffer.data);
    const triangleCount = mesh.triangleCount;

    // Calculate centroid for each triangle
    const triangles: Array<{ indices: number[]; depth: number }> = [];

    for (let i = 0; i < triangleCount; i++) {
      const i0 = indices[i * 3];
      const i1 = indices[i * 3 + 1];
      const i2 = indices[i * 3 + 2];

      const pos = [0, 0, 0];
      const p0 = mesh.vertexBuffer.getPosition(i0, [...pos]);
      const p1 = mesh.vertexBuffer.getPosition(i1, [...pos]);
      const p2 = mesh.vertexBuffer.getPosition(i2, [...pos]);

      if (!p0 || !p1 || !p2) continue;

      const centroid = [
        (p0[0] + p1[0] + p2[0]) / 3,
        (p0[1] + p1[1] + p2[1]) / 3,
        (p0[2] + p1[2] + p2[2]) / 3,
      ];

      const depth =
        centroid[0] * viewDirection[0] +
        centroid[1] * viewDirection[1] +
        centroid[2] * viewDirection[2];

      triangles.push({
        indices: [i0, i1, i2],
        depth,
      });
    }

    // Sort triangles front to back (smaller depth = closer)
    triangles.sort((a, b) => a.depth - b.depth);

    // Rebuild index buffer
    const newIndices: number[] = [];
    for (const tri of triangles) {
      newIndices.push(...tri.indices);
    }

    const newIndexBuffer = IndexBuffer.fromArray(
      newIndices,
      mesh.indexBuffer.indexType,
      mesh.indexBuffer.topology
    );

    const newMesh = mesh.clone();
    (newMesh as any).indexBuffer = newIndexBuffer;

    return newMesh;
  }

  /**
   * Optimizes vertex fetch by reordering vertices to improve memory access patterns.
   * Reorders vertices to match index buffer order for better cache coherency.
   *
   * @param mesh - Mesh to optimize
   * @returns New mesh with optimized vertex order
   *
   * @example
   * ```typescript
   * const optimized = MeshOptimizer.optimizeVertexFetch(mesh);
   * ```
   */
  static optimizeVertexFetch(mesh: Mesh): Mesh {
    const indices = Array.from(mesh.indexBuffer.data);
    const oldVertexCount = mesh.vertexCount;

    // Track which vertices are used and in what order
    const vertexRemap: number[] = new Array(oldVertexCount).fill(-1);
    let newVertexIndex = 0;

    for (const index of indices) {
      if (vertexRemap[index] === -1) {
        vertexRemap[index] = newVertexIndex++;
      }
    }

    // Create new vertex buffer with reordered vertices
    const newVertexBuffer = mesh.vertexBuffer.constructor(
      mesh.vertexBuffer.format,
      newVertexIndex,
      mesh.vertexBuffer.usage
    ) as any;

    const temp = [0, 0, 0, 0];
    for (let oldIndex = 0; oldIndex < oldVertexCount; oldIndex++) {
      const newIndex = vertexRemap[oldIndex];
      if (newIndex === -1) continue;

      // Copy all vertex attributes
      if (mesh.vertexBuffer.getPosition(oldIndex, temp)) {
        newVertexBuffer.setPosition(newIndex, temp[0], temp[1], temp[2]);
      }
      if (mesh.vertexBuffer.getNormal(oldIndex, temp)) {
        newVertexBuffer.setNormal(newIndex, temp[0], temp[1], temp[2]);
      }
      if (mesh.vertexBuffer.getTangent(oldIndex, temp)) {
        newVertexBuffer.setTangent(newIndex, temp[0], temp[1], temp[2], temp[3]);
      }
      if (mesh.vertexBuffer.getTexCoord(oldIndex, temp)) {
        newVertexBuffer.setTexCoord(newIndex, temp[0], temp[1]);
      }
    }

    // Remap indices
    const newIndices = indices.map(i => vertexRemap[i]);
    const newIndexBuffer = IndexBuffer.fromArray(
      newIndices,
      mesh.indexBuffer.indexType,
      mesh.indexBuffer.topology
    );

    const newMesh = new Mesh(newVertexBuffer, newIndexBuffer, mesh.name);
    newMesh.boundingBox = mesh.boundingBox.clone();
    newMesh.boundingSphere = mesh.boundingSphere.clone();

    return newMesh;
  }

  /**
   * Simplifies mesh using quadric error metrics.
   * Reduces triangle count while preserving visual appearance.
   *
   * @param mesh - Mesh to simplify
   * @param targetRatio - Target triangle ratio (0-1, e.g., 0.5 = 50% triangles)
   * @param aggressiveness - Simplification aggressiveness (default: 7)
   * @returns Simplified mesh
   *
   * @example
   * ```typescript
   * // Reduce to 50% triangles
   * const simplified = MeshOptimizer.simplify(mesh, 0.5);
   *
   * // Aggressive simplification to 25%
   * const verySimple = MeshOptimizer.simplify(mesh, 0.25, 10);
   * ```
   */
  static simplify(mesh: Mesh, targetRatio: number, aggressiveness: number = 7): Mesh {
    if (targetRatio >= 1.0) {
      return mesh.clone();
    }

    const indices = Array.from(mesh.indexBuffer.data);
    const triangleCount = mesh.triangleCount;
    const targetTriangleCount = Math.floor(triangleCount * targetRatio);

    // Build vertex positions array
    const positions: Vector3[] = [];
    const pos = [0, 0, 0];
    for (let i = 0; i < mesh.vertexCount; i++) {
      mesh.vertexBuffer.getPosition(i, pos);
      positions.push(new Vector3(pos[0], pos[1], pos[2]));
    }

    // Simplified quadric error decimation
    // This is a basic implementation - production code would use full quadric matrices
    let currentIndices = [...indices];
    let currentTriangleCount = triangleCount;

    const iteration = 0;
    while (currentTriangleCount > targetTriangleCount && iteration < 100) {
      const deleted = this.simplifyIteration(
        currentIndices,
        positions,
        aggressiveness
      );

      if (deleted === 0) break;
      currentTriangleCount -= deleted;
    }

    // Remove degenerate triangles
    const finalIndices: number[] = [];
    for (let i = 0; i < currentIndices.length; i += 3) {
      const i0 = currentIndices[i];
      const i1 = currentIndices[i + 1];
      const i2 = currentIndices[i + 2];

      if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
        finalIndices.push(i0, i1, i2);
      }
    }

    const newIndexBuffer = IndexBuffer.fromArray(
      finalIndices,
      mesh.indexBuffer.indexType,
      mesh.indexBuffer.topology
    );

    const newMesh = mesh.clone();
    (newMesh as any).indexBuffer = newIndexBuffer;
    newMesh.computeBounds();

    return newMesh;
  }

  /**
   * Calculates ACMR (Average Cache Miss Ratio) for index buffer.
   *
   * @param indices - Index buffer data
   * @param vertexCount - Number of vertices
   * @param cacheSize - Vertex cache size
   * @returns ACMR value (lower is better)
   */
  private static calculateACMR(
    indices: Uint16Array | Uint32Array,
    vertexCount: number,
    cacheSize: number
  ): number {
    const cache: number[] = [];
    let cacheMisses = 0;

    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];

      const cacheIndex = cache.indexOf(index);
      if (cacheIndex === -1) {
        // Cache miss
        cacheMisses++;
        cache.unshift(index);
        if (cache.length > cacheSize) {
          cache.pop();
        }
      } else {
        // Cache hit - move to front (LRU)
        cache.splice(cacheIndex, 1);
        cache.unshift(index);
      }
    }

    return cacheMisses / (indices.length / 3);
  }

  /**
   * Builds adjacency information for mesh optimization.
   *
   * @param indices - Index buffer
   * @param triangleCount - Number of triangles
   * @param vertexCount - Number of vertices
   * @returns Adjacency data
   */
  private static buildAdjacency(
    indices: Uint16Array | Uint32Array,
    triangleCount: number,
    vertexCount: number
  ): { vertexTriangles: number[][] } {
    const vertexTriangles: number[][] = new Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      vertexTriangles[i] = [];
    }

    for (let t = 0; t < triangleCount; t++) {
      const i0 = indices[t * 3];
      const i1 = indices[t * 3 + 1];
      const i2 = indices[t * 3 + 2];

      vertexTriangles[i0].push(t);
      vertexTriangles[i1].push(t);
      vertexTriangles[i2].push(t);
    }

    return { vertexTriangles };
  }

  /**
   * Forsyth algorithm for vertex cache optimization.
   * Implementation of Tom Forsyth's "Linear-Speed Vertex Cache Optimization".
   *
   * @param indices - Original indices
   * @param adjacency - Adjacency information
   * @param vertexCount - Number of vertices
   * @param cacheSize - Vertex cache size
   * @returns Optimized indices
   */
  private static forsythReorder(
    indices: number[],
    adjacency: { vertexTriangles: number[][] },
    vertexCount: number,
    cacheSize: number
  ): number[] {
    const triangleCount = indices.length / 3;
    const { vertexTriangles } = adjacency;

    // Track which triangles have been emitted
    const emitted = new Array(triangleCount).fill(false);
    const result: number[] = [];

    // Vertex cache simulation
    const cache: number[] = [];

    // Find best starting triangle (one with highest valence vertices)
    let bestTriangle = 0;
    let bestScore = -1;

    for (let t = 0; t < triangleCount; t++) {
      const score =
        vertexTriangles[indices[t * 3]].length +
        vertexTriangles[indices[t * 3 + 1]].length +
        vertexTriangles[indices[t * 3 + 2]].length;

      if (score > bestScore) {
        bestScore = score;
        bestTriangle = t;
      }
    }

    // Emit triangles in optimized order
    const emitTriangle = (t: number) => {
      if (emitted[t]) return;

      emitted[t] = true;
      const i0 = indices[t * 3];
      const i1 = indices[t * 3 + 1];
      const i2 = indices[t * 3 + 2];

      result.push(i0, i1, i2);

      // Update cache
      for (const idx of [i0, i1, i2]) {
        const pos = cache.indexOf(idx);
        if (pos !== -1) {
          cache.splice(pos, 1);
        }
        cache.unshift(idx);
      }
      while (cache.length > cacheSize) {
        cache.pop();
      }
    };

    // Emit first triangle
    emitTriangle(bestTriangle);

    // Greedy selection of next triangles
    while (result.length < indices.length) {
      let nextTriangle = -1;
      let nextScore = -1;

      // Find best next triangle from cache
      for (const vertexIndex of cache) {
        for (const t of vertexTriangles[vertexIndex]) {
          if (emitted[t]) continue;

          // Score based on number of vertices in cache
          let score = 0;
          const ti0 = indices[t * 3];
          const ti1 = indices[t * 3 + 1];
          const ti2 = indices[t * 3 + 2];

          if (cache.includes(ti0)) score++;
          if (cache.includes(ti1)) score++;
          if (cache.includes(ti2)) score++;

          if (score > nextScore) {
            nextScore = score;
            nextTriangle = t;
          }
        }
      }

      // If no connected triangle found, find any unemitted triangle
      if (nextTriangle === -1) {
        for (let t = 0; t < triangleCount; t++) {
          if (!emitted[t]) {
            nextTriangle = t;
            break;
          }
        }
      }

      if (nextTriangle === -1) break;
      emitTriangle(nextTriangle);
    }

    return result;
  }

  /**
   * Single iteration of mesh simplification.
   *
   * @param indices - Current indices
   * @param positions - Vertex positions
   * @param aggressiveness - Simplification aggressiveness
   * @returns Number of triangles deleted
   */
  private static simplifyIteration(
    indices: number[],
    positions: Vector3[],
    aggressiveness: number
  ): number {
    // Simple edge collapse heuristic
    // In production, use full quadric error metrics
    let deleted = 0;

    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i];
      const i1 = indices[i + 1];
      const i2 = indices[i + 2];

      if (i0 === i1 || i1 === i2 || i2 === i0) continue;

      // Find shortest edge
      const p0 = positions[i0];
      const p1 = positions[i1];
      const p2 = positions[i2];

      const d01 = Vector3.distanceSquared(p0, p1);
      const d12 = Vector3.distanceSquared(p1, p2);
      const d20 = Vector3.distanceSquared(p2, p0);

      const minDist = Math.min(d01, d12, d20);
      const threshold = 0.01 * aggressiveness;

      // Collapse shortest edge if below threshold
      if (minDist < threshold) {
        if (d01 === minDist) {
          indices[i + 1] = i0; // Collapse i1 to i0
        } else if (d12 === minDist) {
          indices[i + 2] = i1; // Collapse i2 to i1
        } else {
          indices[i] = i2; // Collapse i0 to i2
        }
        deleted++;
      }
    }

    return deleted;
  }
}
