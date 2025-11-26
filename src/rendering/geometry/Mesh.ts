/**
 * Mesh representation with vertex and index buffers, submeshes, and rendering metadata.
 * Supports LOD, skinning, morph targets, and instancing.
 * @module Mesh
 */

import { Vector3 } from '../../math/Vector3';
import { Box3 } from '../../math/Box3';
import { Sphere } from '../../math/Sphere';
import { Matrix4 } from '../../math/Matrix4';
import { VertexBuffer } from './VertexBuffer';
import { IndexBuffer, PrimitiveTopology } from './IndexBuffer';
import { VertexFormat } from './VertexFormat';

/**
 * Submesh defining a drawable portion of a mesh.
 * Multiple submeshes allow different materials per mesh.
 */
export interface Submesh {
  /** Starting index in the index buffer */
  startIndex: number;
  /** Number of indices to draw */
  indexCount: number;
  /** Material index (for multi-material meshes) */
  materialIndex?: number;
  /** Optional name for identification */
  name?: string;
}

/**
 * Level of Detail (LOD) level specification.
 */
export interface LODLevel {
  /** Distance threshold for this LOD level */
  distance: number;
  /** Index buffer for this LOD */
  indexBuffer: IndexBuffer;
  /** Optional submeshes for this LOD */
  submeshes?: Submesh[];
}

/**
 * Morph target (blend shape) for vertex animation.
 */
export interface MorphTarget {
  /** Name of the morph target */
  name: string;
  /** Vertex buffer with target positions */
  positions: VertexBuffer;
  /** Optional target normals */
  normals?: VertexBuffer;
  /** Optional target tangents */
  tangents?: VertexBuffer;
  /** Current weight (0-1) */
  weight: number;
}

/**
 * Complete mesh representation for rendering.
 * Combines geometry data with metadata for efficient GPU rendering.
 *
 * @example
 * ```typescript
 * // Create a simple mesh
 * const format = VertexFormat.P3N3T2();
 * const vertices = new VertexBuffer(format, 4);
 * const indices = new IndexBuffer(6);
 *
 * // Set quad vertices
 * vertices.setPosition(0, -1, -1, 0);
 * vertices.setPosition(1,  1, -1, 0);
 * vertices.setPosition(2,  1,  1, 0);
 * vertices.setPosition(3, -1,  1, 0);
 *
 * // Set indices
 * indices.setTriangle(0, 0, 1, 2);
 * indices.setTriangle(1, 0, 2, 3);
 *
 * const mesh = new Mesh(vertices, indices);
 * mesh.computeBounds();
 * ```
 */
export class Mesh {
  /** Vertex buffer containing vertex data */
  readonly vertexBuffer: VertexBuffer;
  /** Primary index buffer */
  readonly indexBuffer: IndexBuffer;
  /** Array of submeshes for multi-material support */
  submeshes: Submesh[];
  /** Axis-aligned bounding box */
  boundingBox: Box3;
  /** Bounding sphere for culling */
  boundingSphere: Sphere;
  /** LOD levels (distance sorted, nearest first) */
  lodLevels: LODLevel[];
  /** Morph targets for blend shapes */
  morphTargets: MorphTarget[];
  /** Whether this mesh supports skinning */
  skinned: boolean;
  /** Optional name for identification */
  name: string;

  /**
   * Creates a new mesh.
   *
   * @param vertexBuffer - Vertex buffer
   * @param indexBuffer - Index buffer
   * @param name - Optional name
   *
   * @example
   * ```typescript
   * const mesh = new Mesh(vertices, indices, 'MyMesh');
   * ```
   */
  constructor(vertexBuffer: VertexBuffer, indexBuffer: IndexBuffer, name: string = 'Mesh') {
    this.vertexBuffer = vertexBuffer;
    this.indexBuffer = indexBuffer;
    this.submeshes = [];
    this.boundingBox = Box3.empty();
    this.boundingSphere = Sphere.empty();
    this.lodLevels = [];
    this.morphTargets = [];
    this.skinned = false;
    this.name = name;

    // Create default submesh covering entire index buffer
    this.submeshes.push({
      startIndex: 0,
      indexCount: indexBuffer.indexCount,
      materialIndex: 0,
    });
  }

  /**
   * Gets the vertex format of this mesh.
   *
   * @returns Vertex format
   */
  get format(): VertexFormat {
    return this.vertexBuffer.format;
  }

  /**
   * Gets the number of vertices in the mesh.
   *
   * @returns Vertex count
   */
  get vertexCount(): number {
    return this.vertexBuffer.vertexCount;
  }

  /**
   * Gets the number of indices in the mesh.
   *
   * @returns Index count
   */
  get indexCount(): number {
    return this.indexBuffer.indexCount;
  }

  /**
   * Gets the number of triangles in the mesh (assuming triangle list).
   *
   * @returns Triangle count
   */
  get triangleCount(): number {
    return this.indexBuffer.primitiveCount;
  }

  /**
   * Computes the axis-aligned bounding box from vertex positions.
   * Updates boundingBox and boundingSphere.
   *
   * @example
   * ```typescript
   * mesh.computeBounds();
   * console.log('Bounds:', mesh.boundingBox);
   * console.log('Sphere:', mesh.boundingSphere);
   * ```
   */
  computeBounds(): void {
    this.boundingBox.makeEmpty();

    const pos = [0, 0, 0];
    for (let i = 0; i < this.vertexCount; i++) {
      if (this.vertexBuffer.getPosition(i, pos)) {
        this.boundingBox.expandByPoint(new Vector3(pos[0], pos[1], pos[2]));
      }
    }

    // Compute bounding sphere from box
    if (!this.boundingBox.isEmpty) {
      this.boundingSphere.center = this.boundingBox.center;
      this.boundingSphere.radius = this.boundingBox.center.sub(this.boundingBox.max).length();
    }
  }

  /**
   * Computes a tighter bounding sphere using Ritter's algorithm.
   * More accurate than box-based sphere but slower to compute.
   *
   * @example
   * ```typescript
   * mesh.computeBoundingSphere();
   * ```
   */
  computeBoundingSphere(): void {
    const points: Vector3[] = [];
    const pos = [0, 0, 0];

    for (let i = 0; i < this.vertexCount; i++) {
      if (this.vertexBuffer.getPosition(i, pos)) {
        points.push(new Vector3(pos[0], pos[1], pos[2]));
      }
    }

    this.boundingSphere.setFromPoints(points);
  }

  /**
   * Adds a submesh to the mesh.
   *
   * @param submesh - Submesh to add
   *
   * @example
   * ```typescript
   * mesh.addSubmesh({
   *   startIndex: 0,
   *   indexCount: 300,
   *   materialIndex: 0,
   *   name: 'Body'
   * });
   * ```
   */
  addSubmesh(submesh: Submesh): void {
    this.submeshes.push(submesh);
  }

  /**
   * Removes all submeshes.
   */
  clearSubmeshes(): void {
    this.submeshes = [];
  }

  /**
   * Adds an LOD level to the mesh.
   *
   * @param level - LOD level to add
   *
   * @example
   * ```typescript
   * mesh.addLODLevel({
   *   distance: 50,
   *   indexBuffer: lodIndices,
   *   submeshes: lodSubmeshes
   * });
   * ```
   */
  addLODLevel(level: LODLevel): void {
    this.lodLevels.push(level);
    // Keep sorted by distance
    this.lodLevels.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Gets the appropriate LOD level for a given distance.
   *
   * @param distance - Distance from camera
   * @returns LOD level or undefined if no LOD available
   *
   * @example
   * ```typescript
   * const lod = mesh.getLODLevel(100);
   * if (lod) {
   *   // Use lod.indexBuffer for rendering
   * }
   * ```
   */
  getLODLevel(distance: number): LODLevel | undefined {
    for (let i = this.lodLevels.length - 1; i >= 0; i--) {
      if (distance >= this.lodLevels[i].distance) {
        return this.lodLevels[i];
      }
    }
    return undefined;
  }

  /**
   * Adds a morph target to the mesh.
   *
   * @param target - Morph target to add
   *
   * @example
   * ```typescript
   * mesh.addMorphTarget({
   *   name: 'Smile',
   *   positions: smilePositions,
   *   weight: 0.0
   * });
   * ```
   */
  addMorphTarget(target: MorphTarget): void {
    this.morphTargets.push(target);
  }

  /**
   * Sets the weight of a morph target by name.
   *
   * @param name - Name of the morph target
   * @param weight - Weight value (0-1)
   *
   * @example
   * ```typescript
   * mesh.setMorphTargetWeight('Smile', 0.5);
   * ```
   */
  setMorphTargetWeight(name: string, weight: number): void {
    const target = this.morphTargets.find(t => t.name === name);
    if (target) {
      target.weight = Math.max(0, Math.min(1, weight));
    }
  }

  /**
   * Gets the weight of a morph target by name.
   *
   * @param name - Name of the morph target
   * @returns Weight value or undefined if not found
   */
  getMorphTargetWeight(name: string): number | undefined {
    const target = this.morphTargets.find(t => t.name === name);
    return target?.weight;
  }

  /**
   * Transforms all vertex positions by a matrix.
   * Also updates normals and tangents if present.
   *
   * @param matrix - Transformation matrix
   *
   * @example
   * ```typescript
   * const transform = Matrix4.translation(10, 0, 0);
   * mesh.transform(transform);
   * mesh.computeBounds();
   * ```
   */
  transform(matrix: Matrix4): void {
    const pos = [0, 0, 0];
    const normal = [0, 0, 0];
    const tangent = [0, 0, 0, 0];

    // Create normal matrix (inverse transpose of upper 3x3)
    const normalMatrix = matrix.clone();
    const inverted = normalMatrix.invert();
    if (inverted) {
      normalMatrix.copy(inverted);
      normalMatrix.transpose();
    }

    const hasNormals = this.vertexBuffer.format.hasAttribute(VertexFormat.P3N3().attributes[1].semantic);
    const hasTangents = this.vertexBuffer.format.hasAttribute(VertexFormat.P3N3T4T2().attributes[2].semantic);

    const m = matrix.elements;
    const nm = normalMatrix.elements;

    for (let i = 0; i < this.vertexCount; i++) {
      // Transform position (with w=1, as a point)
      if (this.vertexBuffer.getPosition(i, pos)) {
        const x = pos[0], y = pos[1], z = pos[2];
        const tx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const ty = m[1] * x + m[5] * y + m[9] * z + m[13];
        const tz = m[2] * x + m[6] * y + m[10] * z + m[14];
        const tw = m[3] * x + m[7] * y + m[11] * z + m[15];
        const invW = tw !== 0 ? 1 / tw : 1;
        this.vertexBuffer.setPosition(i, tx * invW, ty * invW, tz * invW);
      }

      // Transform normal (with w=0, as a direction)
      if (hasNormals && this.vertexBuffer.getNormal(i, normal)) {
        const nx = normal[0], ny = normal[1], nz = normal[2];
        const tnx = nm[0] * nx + nm[4] * ny + nm[8] * nz;
        const tny = nm[1] * nx + nm[5] * ny + nm[9] * nz;
        const tnz = nm[2] * nx + nm[6] * ny + nm[10] * nz;
        const len = Math.sqrt(tnx * tnx + tny * tny + tnz * tnz);
        if (len > 0) {
          const invLen = 1 / len;
          this.vertexBuffer.setNormal(i, tnx * invLen, tny * invLen, tnz * invLen);
        }
      }

      // Transform tangent (with w=0, as a direction, preserving handedness)
      if (hasTangents && this.vertexBuffer.getTangent(i, tangent)) {
        const tx = tangent[0], ty = tangent[1], tz = tangent[2], tw = tangent[3];
        const ttx = nm[0] * tx + nm[4] * ty + nm[8] * tz;
        const tty = nm[1] * tx + nm[5] * ty + nm[9] * tz;
        const ttz = nm[2] * tx + nm[6] * ty + nm[10] * tz;
        const len = Math.sqrt(ttx * ttx + tty * tty + ttz * ttz);
        if (len > 0) {
          const invLen = 1 / len;
          this.vertexBuffer.setTangent(i, ttx * invLen, tty * invLen, ttz * invLen, tw);
        }
      }
    }

    this.computeBounds();
  }

  /**
   * Creates a clone of this mesh with new buffers.
   *
   * @returns New mesh with copied data
   *
   * @example
   * ```typescript
   * const meshCopy = mesh.clone();
   * ```
   */
  clone(): Mesh {
    const newVertexBuffer = new VertexBuffer(
      this.vertexBuffer.format,
      this.vertexCount,
      this.vertexBuffer.usage
    );
    newVertexBuffer.copyFrom(this.vertexBuffer);

    const newIndexBuffer = new IndexBuffer(
      this.indexCount,
      this.indexBuffer.indexType,
      this.indexBuffer.usage,
      this.indexBuffer.topology
    );
    newIndexBuffer.copyFrom(this.indexBuffer);

    const newMesh = new Mesh(newVertexBuffer, newIndexBuffer, this.name);
    newMesh.submeshes = [...this.submeshes];
    newMesh.boundingBox = this.boundingBox.clone();
    newMesh.boundingSphere = this.boundingSphere.clone();
    newMesh.skinned = this.skinned;

    return newMesh;
  }

  /**
   * Disposes of GPU resources and releases memory.
   * Call this when the mesh is no longer needed.
   *
   * @example
   * ```typescript
   * mesh.dispose();
   * ```
   */
  dispose(): void {
    // Release GPU buffer references if they exist
    if (this._vertexBuffer) {
      if (typeof this._vertexBuffer.destroy === 'function') {
        this._vertexBuffer.destroy();
      }
      this._vertexBuffer = null;
    }

    if (this._indexBuffer) {
      if (typeof this._indexBuffer.destroy === 'function') {
        this._indexBuffer.destroy();
      }
      this._indexBuffer = null;
    }

    // Clear submesh references
    this._subMeshes = [];
  }

  /** GPU vertex buffer reference */
  private _vertexBuffer: any = null;
  /** GPU index buffer reference */
  private _indexBuffer: any = null;

  /**
   * Creates a mesh from raw vertex and index data.
   *
   * @param format - Vertex format
   * @param vertexData - Float32Array of vertex data
   * @param indexData - Array of indices
   * @param topology - Primitive topology
   * @returns New mesh
   *
   * @example
   * ```typescript
   * const format = VertexFormat.P3N3T2();
   * const vertexData = new Float32Array([
   *   // pos          normal       uv
   *   -1, -1, 0,     0, 0, 1,     0, 0,
   *    1, -1, 0,     0, 0, 1,     1, 0,
   *    1,  1, 0,     0, 0, 1,     1, 1,
   *   -1,  1, 0,     0, 0, 1,     0, 1,
   * ]);
   * const indices = [0, 1, 2, 0, 2, 3];
   * const mesh = Mesh.fromData(format, vertexData, indices);
   * ```
   */
  static fromData(
    format: VertexFormat,
    vertexData: Float32Array,
    indexData: number[],
    topology: PrimitiveTopology = PrimitiveTopology.TriangleList
  ): Mesh {
    const vertexCount = vertexData.length / (format.stride / 4);
    const vertexBuffer = new VertexBuffer(format, vertexCount);
    vertexBuffer.data.set(vertexData);

    const indexBuffer = IndexBuffer.fromArray(indexData, undefined, topology);

    const mesh = new Mesh(vertexBuffer, indexBuffer);
    mesh.computeBounds();

    return mesh;
  }

  /**
   * Computes memory usage statistics for the mesh.
   *
   * @returns Object with memory statistics in bytes
   *
   * @example
   * ```typescript
   * const stats = mesh.getMemoryStats();
   * console.log(`Vertex memory: ${stats.vertexMemory} bytes`);
   * console.log(`Index memory: ${stats.indexMemory} bytes`);
   * console.log(`Total: ${stats.total} bytes`);
   * ```
   */
  getMemoryStats(): { vertexMemory: number; indexMemory: number; total: number } {
    let vertexMemory = this.vertexBuffer.byteSize;
    let indexMemory = this.indexBuffer.byteSize;

    // Add LOD memory
    for (const lod of this.lodLevels) {
      indexMemory += lod.indexBuffer.byteSize;
    }

    // Add morph target memory
    for (const target of this.morphTargets) {
      vertexMemory += target.positions.byteSize;
      if (target.normals) vertexMemory += target.normals.byteSize;
      if (target.tangents) vertexMemory += target.tangents.byteSize;
    }

    return {
      vertexMemory,
      indexMemory,
      total: vertexMemory + indexMemory,
    };
  }
}
