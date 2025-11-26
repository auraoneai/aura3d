/**
 * Skinned mesh data structure for GPU skinning with bone influences.
 * Manages vertex weights, bone indices, and bounds updates.
 * @module animation/SkinnedMesh
 */

import { Skeleton } from './Skeleton';
import { Vector3 } from '../math/Vector3';
import { Box3 } from '../math/Box3';

/**
 * Vertex skinning data for a single vertex.
 * Supports up to 4 bone influences per vertex.
 *
 * @example
 * ```typescript
 * const skinData: VertexSkinData = {
 *   boneIndices: [0, 1, 2, 3],
 *   boneWeights: [0.5, 0.3, 0.15, 0.05]
 * };
 * ```
 */
export interface VertexSkinData {
  /** Bone indices (up to 4 bones) */
  boneIndices: number[];
  /** Bone weights (must sum to 1.0) */
  boneWeights: number[];
}

/**
 * Configuration for creating skinned meshes.
 */
export interface SkinnedMeshConfig {
  /** Mesh name */
  name?: string;
  /** Associated skeleton */
  skeleton: Skeleton;
  /** Number of vertices */
  vertexCount: number;
  /** Bone indices per vertex (flat array: [v0b0, v0b1, v0b2, v0b3, v1b0, ...]) */
  boneIndices?: Uint16Array | number[];
  /** Bone weights per vertex (flat array: [v0w0, v0w1, v0w2, v0w3, v1w0, ...]) */
  boneWeights?: Float32Array | number[];
  /** Vertex positions for bounds calculation */
  positions?: Float32Array | Vector3[];
  /** Maximum bones per vertex (default: 4) */
  maxBonesPerVertex?: number;
}

/**
 * Skinned mesh for skeletal animation with GPU skinning support.
 * Manages bone influences, weights, and dynamic bounds updates.
 *
 * @example
 * ```typescript
 * // Create skinned mesh
 * const skinnedMesh = new SkinnedMesh({
 *   name: 'Character',
 *   skeleton: skeleton,
 *   vertexCount: 1000,
 *   boneIndices: boneIndicesArray,
 *   boneWeights: boneWeightsArray,
 *   positions: vertexPositions
 * });
 *
 * // Update skeleton
 * skeleton.setBoneRotation('spine', newRotation);
 * skeleton.update();
 *
 * // Update mesh bounds
 * skinnedMesh.updateBounds();
 *
 * // Get GPU data
 * const boneMatrices = skeleton.getSkinningMatrices();
 * const bounds = skinnedMesh.bounds;
 * ```
 */
export class SkinnedMesh {
  /**
   * Mesh name for identification.
   */
  readonly name: string;

  /**
   * Associated skeleton.
   */
  readonly skeleton: Skeleton;

  /**
   * Number of vertices in this mesh.
   */
  readonly vertexCount: number;

  /**
   * Maximum bones per vertex (typically 4).
   */
  readonly maxBonesPerVertex: number;

  /**
   * Bone indices per vertex (flat array).
   * Format: [v0b0, v0b1, v0b2, v0b3, v1b0, v1b1, ...]
   */
  boneIndices: Uint16Array;

  /**
   * Bone weights per vertex (flat array).
   * Format: [v0w0, v0w1, v0w2, v0w3, v1w0, v1w1, ...]
   */
  boneWeights: Float32Array;

  /**
   * Vertex positions in bind pose (for bounds calculation).
   */
  private bindPosePositions: Vector3[] | null;

  /**
   * Current bounding box (updated after skeleton changes).
   */
  private _bounds: Box3;

  /**
   * Whether bounds need recalculation.
   */
  private boundsDirty: boolean;

  /**
   * Creates a new skinned mesh.
   *
   * @param config - Skinned mesh configuration
   *
   * @example
   * ```typescript
   * const mesh = new SkinnedMesh({
   *   skeleton: characterSkeleton,
   *   vertexCount: 500,
   *   boneIndices: indicesData,
   *   boneWeights: weightsData
   * });
   * ```
   */
  constructor(config: SkinnedMeshConfig) {
    this.name = config.name ?? 'SkinnedMesh';
    this.skeleton = config.skeleton;
    this.vertexCount = config.vertexCount;
    this.maxBonesPerVertex = config.maxBonesPerVertex ?? 4;

    // Initialize or copy bone data
    const dataSize = this.vertexCount * this.maxBonesPerVertex;

    if (config.boneIndices) {
      this.boneIndices = config.boneIndices instanceof Uint16Array
        ? config.boneIndices
        : new Uint16Array(config.boneIndices);
    } else {
      this.boneIndices = new Uint16Array(dataSize);
    }

    if (config.boneWeights) {
      this.boneWeights = config.boneWeights instanceof Float32Array
        ? config.boneWeights
        : new Float32Array(config.boneWeights);
    } else {
      this.boneWeights = new Float32Array(dataSize);
      // Initialize first weight to 1.0 for each vertex
      for (let i = 0; i < this.vertexCount; i++) {
        this.boneWeights[i * this.maxBonesPerVertex] = 1.0;
      }
    }

    // Store bind pose positions if provided
    this.bindPosePositions = null;
    if (config.positions) {
      if (Array.isArray(config.positions) && config.positions[0] instanceof Vector3) {
        this.bindPosePositions = config.positions as Vector3[];
      } else {
        // Convert flat array to Vector3 array
        const positions = config.positions as Float32Array | number[];
        this.bindPosePositions = [];
        for (let i = 0; i < this.vertexCount; i++) {
          const idx = i * 3;
          this.bindPosePositions.push(
            new Vector3(positions[idx], positions[idx + 1], positions[idx + 2])
          );
        }
      }
    }

    this._bounds = new Box3();
    this.boundsDirty = true;
  }

  /**
   * Sets skinning data for a specific vertex.
   *
   * @param vertexIndex - Vertex index
   * @param data - Skinning data
   *
   * @example
   * ```typescript
   * mesh.setVertexSkinData(0, {
   *   boneIndices: [0, 1, 2, 3],
   *   boneWeights: [0.5, 0.3, 0.15, 0.05]
   * });
   * ```
   */
  setVertexSkinData(vertexIndex: number, data: VertexSkinData): void {
    if (vertexIndex < 0 || vertexIndex >= this.vertexCount) {
      throw new Error(`Vertex index ${vertexIndex} out of bounds`);
    }

    const offset = vertexIndex * this.maxBonesPerVertex;

    // Normalize weights if needed
    let weightSum = 0;
    for (let i = 0; i < Math.min(data.boneWeights.length, this.maxBonesPerVertex); i++) {
      weightSum += data.boneWeights[i];
    }

    const normalizer = weightSum > 0 ? 1.0 / weightSum : 0;

    for (let i = 0; i < this.maxBonesPerVertex; i++) {
      if (i < data.boneIndices.length) {
        this.boneIndices[offset + i] = data.boneIndices[i];
        this.boneWeights[offset + i] = data.boneWeights[i] * normalizer;
      } else {
        this.boneIndices[offset + i] = 0;
        this.boneWeights[offset + i] = 0;
      }
    }

    this.boundsDirty = true;
  }

  /**
   * Gets skinning data for a specific vertex.
   *
   * @param vertexIndex - Vertex index
   * @returns Skinning data
   *
   * @example
   * ```typescript
   * const skinData = mesh.getVertexSkinData(0);
   * console.log(`Vertex 0 influenced by ${skinData.boneIndices.length} bones`);
   * ```
   */
  getVertexSkinData(vertexIndex: number): VertexSkinData {
    if (vertexIndex < 0 || vertexIndex >= this.vertexCount) {
      throw new Error(`Vertex index ${vertexIndex} out of bounds`);
    }

    const offset = vertexIndex * this.maxBonesPerVertex;
    const boneIndices: number[] = [];
    const boneWeights: number[] = [];

    for (let i = 0; i < this.maxBonesPerVertex; i++) {
      const weight = this.boneWeights[offset + i];
      if (weight > 0) {
        boneIndices.push(this.boneIndices[offset + i]);
        boneWeights.push(weight);
      }
    }

    return { boneIndices, boneWeights };
  }

  /**
   * Normalizes all bone weights to ensure they sum to 1.0 per vertex.
   *
   * @example
   * ```typescript
   * mesh.normalizeWeights();
   * ```
   */
  normalizeWeights(): void {
    for (let v = 0; v < this.vertexCount; v++) {
      const offset = v * this.maxBonesPerVertex;

      // Calculate weight sum
      let weightSum = 0;
      for (let i = 0; i < this.maxBonesPerVertex; i++) {
        weightSum += this.boneWeights[offset + i];
      }

      // Normalize
      if (weightSum > 0) {
        const normalizer = 1.0 / weightSum;
        for (let i = 0; i < this.maxBonesPerVertex; i++) {
          this.boneWeights[offset + i] *= normalizer;
        }
      } else {
        // No weights, assign to first bone
        this.boneWeights[offset] = 1.0;
      }
    }
  }

  /**
   * Updates the bounding box based on current skeleton pose.
   * Should be called after skeleton.update() if bounds are needed.
   *
   * @param force - Force update even if not dirty (default: false)
   *
   * @example
   * ```typescript
   * skeleton.update();
   * mesh.updateBounds();
   * const bounds = mesh.bounds;
   * ```
   */
  updateBounds(force: boolean = false): void {
    if (!this.boundsDirty && !force) {
      return;
    }

    if (!this.bindPosePositions) {
      // No positions available, use default bounds
      this._bounds.makeEmpty();
      this.boundsDirty = false;
      return;
    }

    // Ensure skeleton is up to date
    this.skeleton.update();

    // Get skinning matrices
    const matrices = this.skeleton.getSkinningMatrices();

    // Transform vertices and compute bounds
    this._bounds.makeEmpty();

    const tempVec = new Vector3();

    for (let v = 0; v < this.vertexCount; v++) {
      const bindPos = this.bindPosePositions[v];
      const offset = v * this.maxBonesPerVertex;

      // Reset temp vector
      tempVec.set(0, 0, 0);

      // Accumulate weighted transforms
      for (let i = 0; i < this.maxBonesPerVertex; i++) {
        const weight = this.boneWeights[offset + i];
        if (weight > 0) {
          const boneIndex = this.boneIndices[offset + i];
          const matrixOffset = boneIndex * 16;

          // Transform vertex by bone matrix
          const m = matrices;
          const x = bindPos.x, y = bindPos.y, z = bindPos.z;

          const tx = m[matrixOffset + 0] * x + m[matrixOffset + 4] * y + m[matrixOffset + 8] * z + m[matrixOffset + 12];
          const ty = m[matrixOffset + 1] * x + m[matrixOffset + 5] * y + m[matrixOffset + 9] * z + m[matrixOffset + 13];
          const tz = m[matrixOffset + 2] * x + m[matrixOffset + 6] * y + m[matrixOffset + 10] * z + m[matrixOffset + 14];

          // Accumulate with weight
          tempVec.x += tx * weight;
          tempVec.y += ty * weight;
          tempVec.z += tz * weight;
        }
      }

      // Expand bounds
      this._bounds.expandByPoint(tempVec);
    }

    this.boundsDirty = false;
  }

  /**
   * Gets the current bounding box.
   * Updates bounds if dirty.
   *
   * @returns Bounding box
   *
   * @example
   * ```typescript
   * const bounds = mesh.bounds;
   * if (camera.frustum.intersectsBox(bounds)) {
   *   renderMesh(mesh);
   * }
   * ```
   */
  get bounds(): Box3 {
    if (this.boundsDirty) {
      this.updateBounds();
    }
    return this._bounds;
  }

  /**
   * Marks bounds as dirty, requiring recalculation.
   *
   * @example
   * ```typescript
   * mesh.invalidateBounds();
   * ```
   */
  invalidateBounds(): void {
    this.boundsDirty = true;
  }

  /**
   * Gets bone indices as flat array for GPU upload.
   *
   * @returns Bone indices array
   *
   * @example
   * ```typescript
   * const indices = mesh.getBoneIndices();
   * gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);
   * ```
   */
  getBoneIndices(): Uint16Array {
    return this.boneIndices;
  }

  /**
   * Gets bone weights as flat array for GPU upload.
   *
   * @returns Bone weights array
   *
   * @example
   * ```typescript
   * const weights = mesh.getBoneWeights();
   * gl.bufferData(gl.ARRAY_BUFFER, weights, gl.STATIC_DRAW);
   * ```
   */
  getBoneWeights(): Float32Array {
    return this.boneWeights;
  }

  /**
   * Clones this skinned mesh (shares skeleton reference).
   *
   * @returns Cloned skinned mesh
   *
   * @example
   * ```typescript
   * const meshCopy = mesh.clone();
   * ```
   */
  clone(): SkinnedMesh {
    return new SkinnedMesh({
      name: this.name,
      skeleton: this.skeleton, // Share skeleton
      vertexCount: this.vertexCount,
      boneIndices: new Uint16Array(this.boneIndices),
      boneWeights: new Float32Array(this.boneWeights),
      positions: this.bindPosePositions ? [...this.bindPosePositions] : undefined,
      maxBonesPerVertex: this.maxBonesPerVertex
    });
  }

  /**
   * Serializes skinned mesh to JSON (without positions to reduce size).
   *
   * @returns JSON representation
   *
   * @example
   * ```typescript
   * const json = mesh.toJSON();
   * ```
   */
  toJSON(): any {
    return {
      name: this.name,
      vertexCount: this.vertexCount,
      maxBonesPerVertex: this.maxBonesPerVertex,
      boneIndices: Array.from(this.boneIndices),
      boneWeights: Array.from(this.boneWeights)
    };
  }

  /**
   * Deserializes skinned mesh from JSON.
   * Requires skeleton to be provided separately.
   *
   * @param json - JSON representation
   * @param skeleton - Associated skeleton
   * @returns Deserialized skinned mesh
   *
   * @example
   * ```typescript
   * const mesh = SkinnedMesh.fromJSON(jsonData, skeleton);
   * ```
   */
  static fromJSON(json: any, skeleton: Skeleton): SkinnedMesh {
    return new SkinnedMesh({
      name: json.name,
      skeleton,
      vertexCount: json.vertexCount,
      boneIndices: json.boneIndices,
      boneWeights: json.boneWeights,
      maxBonesPerVertex: json.maxBonesPerVertex
    });
  }
}
