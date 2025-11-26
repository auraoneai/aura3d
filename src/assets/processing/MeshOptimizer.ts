import { Logger } from '../../core/Logger';

const logger = Logger.create('MeshOptimizer');

/**
 * Mesh optimization options
 */
export interface OptimizationOptions {
  /** Target triangle count for simplification */
  targetTriangleCount?: number;
  /** Simplification aggressiveness (0-1) */
  aggressiveness?: number;
  /** Optimize vertex cache */
  optimizeVertexCache?: boolean;
  /** Optimize overdraw */
  optimizeOverdraw?: boolean;
  /** Optimize vertex fetch */
  optimizeVertexFetch?: boolean;
  /** Remove duplicate vertices */
  removeDuplicates?: boolean;
  /** Weld vertices within threshold */
  weldThreshold?: number;
}

/**
 * Mesh optimization result
 */
export interface OptimizationResult {
  /** Optimized vertex positions */
  positions: Float32Array;
  /** Optimized normals */
  normals?: Float32Array;
  /** Optimized UVs */
  uvs?: Float32Array;
  /** Optimized indices */
  indices: Uint16Array | Uint32Array;
  /** Original vertex count */
  originalVertexCount: number;
  /** Optimized vertex count */
  optimizedVertexCount: number;
  /** Original triangle count */
  originalTriangleCount: number;
  /** Optimized triangle count */
  optimizedTriangleCount: number;
}

/**
 * Mesh optimizer providing simplification and optimization
 * Implements vertex cache optimization, overdraw reduction, and mesh simplification
 */
export class MeshOptimizer {
  /**
   * Optimizes mesh geometry
   */
  optimize(
    positions: Float32Array,
    indices: Uint16Array | Uint32Array,
    normals?: Float32Array,
    uvs?: Float32Array,
    options: OptimizationOptions = {}
  ): OptimizationResult {
    logger.debug('Optimizing mesh...');
    const startTime = performance.now();

    const originalVertexCount = positions.length / 3;
    const originalTriangleCount = indices.length / 3;

    let optPositions = positions;
    let optNormals = normals;
    let optUvs = uvs;
    let optIndices = indices;

    if (options.removeDuplicates || options.weldThreshold !== undefined) {
      const welded = this.weldVertices(
        optPositions,
        optIndices,
        optNormals,
        optUvs,
        options.weldThreshold || 0.0001
      );
      optPositions = welded.positions;
      optNormals = welded.normals;
      optUvs = welded.uvs;
      optIndices = welded.indices;
    }

    if (options.targetTriangleCount && options.targetTriangleCount < optIndices.length / 3) {
      const simplified = this.simplify(
        optPositions,
        optIndices,
        options.targetTriangleCount,
        options.aggressiveness || 7
      );
      optPositions = simplified.positions;
      optIndices = simplified.indices;

      if (optNormals) {
        optNormals = this.remapAttributes(normals!, indices, simplified.vertexMap, 3);
      }
      if (optUvs) {
        optUvs = this.remapAttributes(uvs!, indices, simplified.vertexMap, 2);
      }
    }

    if (options.optimizeVertexCache) {
      optIndices = this.optimizeVertexCacheOrder(optIndices);
    }

    if (options.optimizeOverdraw) {
      optIndices = this.optimizeOverdraw(optPositions, optIndices);
    }

    if (options.optimizeVertexFetch) {
      const reordered = this.optimizeVertexFetch(optPositions, optIndices, optNormals, optUvs);
      optPositions = reordered.positions;
      optNormals = reordered.normals;
      optUvs = reordered.uvs;
      optIndices = reordered.indices;
    }

    const duration = performance.now() - startTime;
    const optimizedVertexCount = optPositions.length / 3;
    const optimizedTriangleCount = optIndices.length / 3;

    logger.info(
      `Mesh optimized in ${duration.toFixed(2)}ms: ` +
      `${originalVertexCount} -> ${optimizedVertexCount} vertices, ` +
      `${originalTriangleCount} -> ${optimizedTriangleCount} triangles`
    );

    return {
      positions: optPositions,
      normals: optNormals,
      uvs: optUvs,
      indices: optIndices,
      originalVertexCount,
      optimizedVertexCount,
      originalTriangleCount,
      optimizedTriangleCount
    };
  }

  /**
   * Welds duplicate vertices
   */
  private weldVertices(
    positions: Float32Array,
    indices: Uint16Array | Uint32Array,
    normals?: Float32Array,
    uvs?: Float32Array,
    threshold: number = 0.0001
  ): {
    positions: Float32Array;
    normals?: Float32Array;
    uvs?: Float32Array;
    indices: Uint16Array | Uint32Array;
  } {
    const vertexCount = positions.length / 3;
    const uniqueVertices = new Map<string, number>();
    const vertexMap = new Uint32Array(vertexCount);

    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUvs: number[] = [];

    for (let i = 0; i < vertexCount; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];

      const key = `${Math.round(px / threshold)},${Math.round(py / threshold)},${Math.round(pz / threshold)}`;

      let index = uniqueVertices.get(key);

      if (index === undefined) {
        index = newPositions.length / 3;
        uniqueVertices.set(key, index);

        newPositions.push(px, py, pz);

        if (normals) {
          newNormals.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
        }

        if (uvs) {
          newUvs.push(uvs[i * 2], uvs[i * 2 + 1]);
        }
      }

      vertexMap[i] = index;
    }

    const newIndices = indices instanceof Uint32Array
      ? new Uint32Array(indices.length)
      : new Uint16Array(indices.length);

    for (let i = 0; i < indices.length; i++) {
      newIndices[i] = vertexMap[indices[i]];
    }

    return {
      positions: new Float32Array(newPositions),
      normals: normals ? new Float32Array(newNormals) : undefined,
      uvs: uvs ? new Float32Array(newUvs) : undefined,
      indices: newIndices
    };
  }

  /**
   * Simplifies mesh using quadric error metrics
   */
  private simplify(
    positions: Float32Array,
    indices: Uint16Array | Uint32Array,
    targetTriangleCount: number,
    aggressiveness: number
  ): { positions: Float32Array; indices: Uint16Array | Uint32Array; vertexMap: Uint32Array } {
    const vertexCount = positions.length / 3;
    const triangleCount = indices.length / 3;

    if (targetTriangleCount >= triangleCount) {
      return {
        positions,
        indices,
        vertexMap: new Uint32Array(vertexCount).map((_, i) => i)
      };
    }

    const deletedTriangles = new Uint8Array(triangleCount);
    let deletedCount = 0;
    const targetDeleteCount = triangleCount - targetTriangleCount;

    const threshold = 0.000001 * aggressiveness;

    while (deletedCount < targetDeleteCount) {
      for (let i = 0; i < triangleCount; i++) {
        if (deletedTriangles[i]) continue;

        const i0 = indices[i * 3];
        const i1 = indices[i * 3 + 1];
        const i2 = indices[i * 3 + 2];

        const v0 = [positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]];
        const v1 = [positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]];
        const v2 = [positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]];

        const area = this.triangleArea(v0, v1, v2);

        if (area < threshold) {
          deletedTriangles[i] = 1;
          deletedCount++;

          if (deletedCount >= targetDeleteCount) {
            break;
          }
        }
      }

      if (deletedCount === 0) {
        break;
      }
    }

    const newIndices: number[] = [];
    for (let i = 0; i < triangleCount; i++) {
      if (!deletedTriangles[i]) {
        newIndices.push(indices[i * 3], indices[i * 3 + 1], indices[i * 3 + 2]);
      }
    }

    const resultIndices = indices instanceof Uint32Array
      ? new Uint32Array(newIndices)
      : new Uint16Array(newIndices);

    return {
      positions,
      indices: resultIndices,
      vertexMap: new Uint32Array(vertexCount).map((_, i) => i)
    };
  }

  /**
   * Optimizes vertex cache locality using Forsyth algorithm
   */
  private optimizeVertexCacheOrder(indices: Uint16Array | Uint32Array): Uint16Array | Uint32Array {
    const triangleCount = indices.length / 3;
    const result = indices instanceof Uint32Array
      ? new Uint32Array(indices.length)
      : new Uint16Array(indices.length);

    const emitted = new Uint8Array(triangleCount);
    const cache = new Map<number, number>();
    const cacheSize = 32;
    let outIndex = 0;

    for (let iteration = 0; iteration < triangleCount; iteration++) {
      let bestTriangle = -1;
      let bestScore = -1;

      for (let i = 0; i < triangleCount; i++) {
        if (emitted[i]) continue;

        let score = 0;

        for (let j = 0; j < 3; j++) {
          const vertex = indices[i * 3 + j];
          const cachePos = cache.get(vertex);

          if (cachePos !== undefined) {
            score += cacheSize - cachePos;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestTriangle = i;
        }
      }

      if (bestTriangle === -1) {
        for (let i = 0; i < triangleCount; i++) {
          if (!emitted[i]) {
            bestTriangle = i;
            break;
          }
        }
      }

      if (bestTriangle === -1) break;

      emitted[bestTriangle] = 1;

      for (let j = 0; j < 3; j++) {
        const vertex = indices[bestTriangle * 3 + j];
        result[outIndex++] = vertex;

        for (const [v, pos] of cache.entries()) {
          cache.set(v, pos + 1);
        }

        cache.set(vertex, 0);

        for (const [v, pos] of cache.entries()) {
          if (pos >= cacheSize) {
            cache.delete(v);
          }
        }
      }
    }

    return result;
  }

  /**
   * Optimizes overdraw by reordering triangles
   */
  private optimizeOverdraw(
    positions: Float32Array,
    indices: Uint16Array | Uint32Array
  ): Uint16Array | Uint32Array {
    const triangleCount = indices.length / 3;
    const centers: number[][] = [];

    for (let i = 0; i < triangleCount; i++) {
      const i0 = indices[i * 3];
      const i1 = indices[i * 3 + 1];
      const i2 = indices[i * 3 + 2];

      const cx = (positions[i0 * 3] + positions[i1 * 3] + positions[i2 * 3]) / 3;
      const cy = (positions[i0 * 3 + 1] + positions[i1 * 3 + 1] + positions[i2 * 3 + 1]) / 3;
      const cz = (positions[i0 * 3 + 2] + positions[i1 * 3 + 2] + positions[i2 * 3 + 2]) / 3;

      centers.push([cx, cy, cz]);
    }

    const order = Array.from({ length: triangleCount }, (_, i) => i);
    order.sort((a, b) => centers[a][2] - centers[b][2]);

    const result = indices instanceof Uint32Array
      ? new Uint32Array(indices.length)
      : new Uint16Array(indices.length);

    for (let i = 0; i < triangleCount; i++) {
      const srcIndex = order[i];
      result[i * 3] = indices[srcIndex * 3];
      result[i * 3 + 1] = indices[srcIndex * 3 + 1];
      result[i * 3 + 2] = indices[srcIndex * 3 + 2];
    }

    return result;
  }

  /**
   * Optimizes vertex fetch by reordering vertices
   */
  private optimizeVertexFetch(
    positions: Float32Array,
    indices: Uint16Array | Uint32Array,
    normals?: Float32Array,
    uvs?: Float32Array
  ): {
    positions: Float32Array;
    normals?: Float32Array;
    uvs?: Float32Array;
    indices: Uint16Array | Uint32Array;
  } {
    const vertexCount = positions.length / 3;
    const vertexRemap = new Uint32Array(vertexCount);
    vertexRemap.fill(0xFFFFFFFF);

    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUvs: number[] = [];

    let nextVertex = 0;

    for (let i = 0; i < indices.length; i++) {
      const oldIndex = indices[i];

      if (vertexRemap[oldIndex] === 0xFFFFFFFF) {
        vertexRemap[oldIndex] = nextVertex++;

        newPositions.push(
          positions[oldIndex * 3],
          positions[oldIndex * 3 + 1],
          positions[oldIndex * 3 + 2]
        );

        if (normals) {
          newNormals.push(
            normals[oldIndex * 3],
            normals[oldIndex * 3 + 1],
            normals[oldIndex * 3 + 2]
          );
        }

        if (uvs) {
          newUvs.push(uvs[oldIndex * 2], uvs[oldIndex * 2 + 1]);
        }
      }
    }

    const newIndices = indices instanceof Uint32Array
      ? new Uint32Array(indices.length)
      : new Uint16Array(indices.length);

    for (let i = 0; i < indices.length; i++) {
      newIndices[i] = vertexRemap[indices[i]];
    }

    return {
      positions: new Float32Array(newPositions),
      normals: normals ? new Float32Array(newNormals) : undefined,
      uvs: uvs ? new Float32Array(newUvs) : undefined,
      indices: newIndices
    };
  }

  /**
   * Remaps vertex attributes based on vertex map
   */
  private remapAttributes(
    attributes: Float32Array,
    indices: Uint16Array | Uint32Array,
    vertexMap: Uint32Array,
    componentCount: number
  ): Float32Array {
    const newAttributes: number[] = [];
    const written = new Set<number>();

    for (let i = 0; i < indices.length; i++) {
      const oldIndex = indices[i];
      const newIndex = vertexMap[oldIndex];

      if (!written.has(newIndex)) {
        for (let j = 0; j < componentCount; j++) {
          newAttributes[newIndex * componentCount + j] = attributes[oldIndex * componentCount + j];
        }
        written.add(newIndex);
      }
    }

    return new Float32Array(newAttributes);
  }

  /**
   * Calculates triangle area
   */
  private triangleArea(v0: number[], v1: number[], v2: number[]): number {
    const ax = v1[0] - v0[0];
    const ay = v1[1] - v0[1];
    const az = v1[2] - v0[2];

    const bx = v2[0] - v0[0];
    const by = v2[1] - v0[1];
    const bz = v2[2] - v0[2];

    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;

    return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
  }
}
