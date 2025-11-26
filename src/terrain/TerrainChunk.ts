/**
 * Terrain chunk mesh generation with LOD support and neighbor stitching.
 * Generates optimized vertex and index data from heightmaps.
 * @module TerrainChunk
 */

import { Vector2 } from '../math/Vector2';
import { Vector3 } from '../math/Vector3';
import { Box3 } from '../math/Box3';
import { Mesh } from '../rendering/geometry/Mesh';
import { VertexBuffer } from '../rendering/geometry/VertexBuffer';
import { IndexBuffer, PrimitiveTopology } from '../rendering/geometry/IndexBuffer';
import { VertexFormat, VertexAttribute, VertexAttributeType, VertexAttributeSemantic } from '../rendering/geometry/VertexFormat';
import { Heightmap } from './Heightmap';
import { Logger } from '../core/Logger';

const logger = Logger.create('TerrainChunk');

/**
 * Terrain chunk descriptor.
 */
export interface TerrainChunkDescriptor {
  /** Position in chunk grid (x, y) */
  gridPosition: Vector2;
  /** Chunk size in world units */
  size: Vector2;
  /** Number of vertices per edge (power of 2 + 1, e.g., 33, 65, 129) */
  resolution: number;
  /** Heightmap to sample from */
  heightmap: Heightmap;
  /** Heightmap offset for this chunk */
  heightmapOffset: Vector2;
  /** Height scale factor */
  heightScale: number;
}

/**
 * LOD level descriptor for chunk.
 */
export interface LODDescriptor {
  /** LOD level (0 = highest detail) */
  level: number;
  /** Vertex skip factor (1, 2, 4, 8, etc.) */
  skipFactor: number;
}

/**
 * Neighbor stitching information.
 */
export interface NeighborInfo {
  /** Neighbor at higher LOD on north edge */
  north: boolean;
  /** Neighbor at higher LOD on south edge */
  south: boolean;
  /** Neighbor at higher LOD on east edge */
  east: boolean;
  /** Neighbor at higher LOD on west edge */
  west: boolean;
}

/**
 * Terrain chunk representing a section of the terrain mesh.
 * Generates geometry from heightmap data with LOD support.
 *
 * @example
 * ```typescript
 * const chunk = new TerrainChunk({
 *   gridPosition: new Vector2(0, 0),
 *   size: new Vector2(100, 100),
 *   resolution: 65,
 *   heightmap: heightmap,
 *   heightmapOffset: new Vector2(0, 0),
 *   heightScale: 1.0
 * });
 *
 * // Generate mesh for LOD 0
 * const mesh = chunk.generateMesh(0);
 *
 * // Update for neighbor stitching
 * chunk.updateNeighborStitching({
 *   north: true,
 *   south: false,
 *   east: false,
 *   west: false
 * });
 * ```
 */
export class TerrainChunk {
  /** Grid position */
  readonly gridPosition: Vector2;
  /** World size */
  readonly size: Vector2;
  /** Vertex resolution */
  readonly resolution: number;
  /** Heightmap reference */
  readonly heightmap: Heightmap;
  /** Heightmap sampling offset */
  readonly heightmapOffset: Vector2;
  /** Height scale */
  readonly heightScale: number;
  /** Bounding box in world space */
  readonly bounds: Box3;
  /** Generated LOD meshes */
  private _lodMeshes: Map<number, Mesh>;
  /** Current neighbor stitching state */
  private _neighborInfo: NeighborInfo;

  /**
   * Creates a new terrain chunk.
   *
   * @param descriptor - Chunk configuration
   */
  constructor(descriptor: TerrainChunkDescriptor) {
    this.gridPosition = descriptor.gridPosition.clone();
    this.size = descriptor.size.clone();
    this.resolution = descriptor.resolution;
    this.heightmap = descriptor.heightmap;
    this.heightmapOffset = descriptor.heightmapOffset.clone();
    this.heightScale = descriptor.heightScale;
    this.bounds = new Box3();
    this._lodMeshes = new Map();
    this._neighborInfo = {
      north: false,
      south: false,
      east: false,
      west: false,
    };

    this._computeBounds();
  }

  /**
   * Gets the world position (min corner) of this chunk.
   * @returns World position
   */
  get worldPosition(): Vector3 {
    return new Vector3(
      this.gridPosition.x * this.size.x,
      0,
      this.gridPosition.y * this.size.y
    );
  }

  /**
   * Gets the center position of this chunk.
   * @returns Center position
   */
  get center(): Vector3 {
    return this.bounds.center;
  }

  /**
   * Generates a mesh for the specified LOD level.
   *
   * @param lodLevel - LOD level (0 = highest detail)
   * @returns Generated mesh
   */
  generateMesh(lodLevel: number = 0): Mesh {
    const skipFactor = Math.pow(2, lodLevel);
    const effectiveRes = Math.floor((this.resolution - 1) / skipFactor) + 1;

    // Create vertex format with position, normal, UV, and tangent
    const format = new VertexFormat([
      {
        semantic: VertexAttributeSemantic.Position,
        type: VertexAttributeType.Float3,
        offset: 0
      },
      {
        semantic: VertexAttributeSemantic.Normal,
        type: VertexAttributeType.Float3,
        offset: 12
      },
      {
        semantic: VertexAttributeSemantic.TexCoord0,
        type: VertexAttributeType.Float2,
        offset: 24
      },
      {
        semantic: VertexAttributeSemantic.Tangent,
        type: VertexAttributeType.Float4,
        offset: 32
      },
    ]);

    // Calculate vertex and index counts
    const vertexCount = effectiveRes * effectiveRes;
    const quadCount = (effectiveRes - 1) * (effectiveRes - 1);
    const indexCount = quadCount * 6;

    // Create buffers
    const vertices = new VertexBuffer(format, vertexCount);
    const indices = new IndexBuffer(indexCount, undefined, undefined, PrimitiveTopology.TriangleList);

    // Generate vertices
    this._generateVertices(vertices, effectiveRes, skipFactor);

    // Generate indices
    this._generateIndices(indices, effectiveRes, this._neighborInfo);

    // Create mesh
    const mesh = new Mesh(vertices, indices, `TerrainChunk_${this.gridPosition.x}_${this.gridPosition.y}_LOD${lodLevel}`);
    mesh.computeBounds();

    // Cache the mesh
    this._lodMeshes.set(lodLevel, mesh);

    return mesh;
  }

  /**
   * Gets a cached LOD mesh or generates it if not available.
   *
   * @param lodLevel - LOD level
   * @returns Mesh for the LOD level
   */
  getMesh(lodLevel: number): Mesh {
    let mesh = this._lodMeshes.get(lodLevel);
    if (!mesh) {
      mesh = this.generateMesh(lodLevel);
    }
    return mesh;
  }

  /**
   * Updates neighbor stitching and regenerates affected meshes.
   *
   * @param neighborInfo - Neighbor LOD information
   */
  updateNeighborStitching(neighborInfo: NeighborInfo): void {
    this._neighborInfo = { ...neighborInfo };

    // Regenerate all cached LOD meshes with new stitching
    for (const [level, _] of this._lodMeshes) {
      this.generateMesh(level);
    }
  }

  /**
   * Clears cached LOD meshes.
   */
  clearCache(): void {
    this._lodMeshes.clear();
  }

  /**
   * Generates vertices for the chunk.
   * @private
   */
  private _generateVertices(
    buffer: VertexBuffer,
    resolution: number,
    skipFactor: number
  ): void {
    const worldPos = this.worldPosition;
    const cellSize = new Vector2(
      this.size.x / (this.resolution - 1),
      this.size.y / (this.resolution - 1)
    );

    let vertexIndex = 0;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        // Calculate world position
        const gridX = x * skipFactor;
        const gridZ = z * skipFactor;
        const posX = worldPos.x + gridX * cellSize.x;
        const posZ = worldPos.z + gridZ * cellSize.y;

        // Sample heightmap
        const hmX = this.heightmapOffset.x + gridX;
        const hmZ = this.heightmapOffset.y + gridZ;
        const height = this.heightmap.getHeight(hmX, hmZ) * this.heightScale;

        // Set position
        buffer.setPosition(vertexIndex, posX, height, posZ);

        // Calculate normal
        const normal = this.heightmap.getNormal(hmX, hmZ, this.heightScale);
        buffer.setNormal(vertexIndex, normal.x, normal.y, normal.z);

        // Set UV coordinates (0-1 across chunk)
        const u = x / (resolution - 1);
        const v = z / (resolution - 1);
        buffer.setTexCoord(vertexIndex, u, v);

        // Calculate tangent (for normal mapping)
        const tangent = new Vector3(1, 0, 0); // Simplified, points in X direction
        buffer.setTangent(vertexIndex, tangent.x, tangent.y, tangent.z, 1);

        vertexIndex++;
      }
    }
  }

  /**
   * Generates indices for the chunk with optional edge stitching.
   * @private
   */
  private _generateIndices(
    buffer: IndexBuffer,
    resolution: number,
    neighbors: NeighborInfo
  ): void {
    let indexOffset = 0;

    for (let z = 0; z < resolution - 1; z++) {
      for (let x = 0; x < resolution - 1; x++) {
        // Check if we're at an edge that needs stitching
        const isNorthEdge = z === resolution - 2 && neighbors.north;
        const isSouthEdge = z === 0 && neighbors.south;
        const isEastEdge = x === resolution - 2 && neighbors.east;
        const isWestEdge = x === 0 && neighbors.west;

        // Skip every other quad on edges that need stitching
        if ((isNorthEdge || isSouthEdge) && x % 2 === 1) continue;
        if ((isEastEdge || isWestEdge) && z % 2 === 1) continue;

        // Calculate vertex indices
        const i0 = z * resolution + x;
        const i1 = z * resolution + x + 1;
        const i2 = (z + 1) * resolution + x;
        const i3 = (z + 1) * resolution + x + 1;

        // Create two triangles for the quad
        buffer.setIndex(indexOffset++, i0);
        buffer.setIndex(indexOffset++, i2);
        buffer.setIndex(indexOffset++, i1);

        buffer.setIndex(indexOffset++, i1);
        buffer.setIndex(indexOffset++, i2);
        buffer.setIndex(indexOffset++, i3);
      }
    }
  }

  /**
   * Computes the bounding box for this chunk.
   * @private
   */
  private _computeBounds(): void {
    const worldPos = this.worldPosition;
    const cellSize = new Vector2(
      this.size.x / (this.resolution - 1),
      this.size.y / (this.resolution - 1)
    );

    let minHeight = Infinity;
    let maxHeight = -Infinity;

    // Sample heightmap to find min/max heights
    for (let z = 0; z < this.resolution; z++) {
      for (let x = 0; x < this.resolution; x++) {
        const hmX = this.heightmapOffset.x + x;
        const hmZ = this.heightmapOffset.y + z;
        const height = this.heightmap.getHeight(hmX, hmZ) * this.heightScale;

        minHeight = Math.min(minHeight, height);
        maxHeight = Math.max(maxHeight, height);
      }
    }

    // Set bounding box
    this.bounds.min.set(worldPos.x, minHeight, worldPos.z);
    this.bounds.max.set(
      worldPos.x + this.size.x,
      maxHeight,
      worldPos.z + this.size.y
    );
  }

  /**
   * Calculates the maximum LOD level for this chunk.
   *
   * @returns Maximum LOD level
   */
  getMaxLODLevel(): number {
    // LOD level is log2 of max skip factor
    // For resolution 65: (65-1) = 64 = 2^6, so max LOD = 6
    const maxSkip = this.resolution - 1;
    return Math.floor(Math.log2(maxSkip));
  }

  /**
   * Gets memory usage in bytes for this chunk.
   *
   * @returns Memory usage
   */
  getMemoryUsage(): number {
    let bytes = 0;
    for (const mesh of this._lodMeshes.values()) {
      bytes += mesh.vertexBuffer.byteSize;
      bytes += mesh.indexBuffer.byteSize;
    }
    return bytes;
  }

  /**
   * Creates a terrain chunk from a descriptor.
   *
   * @param descriptor - Chunk descriptor
   * @returns New terrain chunk
   */
  static create(descriptor: TerrainChunkDescriptor): TerrainChunk {
    return new TerrainChunk(descriptor);
  }

  /**
   * Calculates the optimal resolution for a given LOD level.
   *
   * @param baseLOD - Base LOD level
   * @param targetLOD - Target LOD level
   * @returns Optimal resolution
   */
  static calculateLODResolution(baseLOD: number, targetLOD: number): number {
    const factor = Math.pow(2, targetLOD - baseLOD);
    return Math.floor((129 - 1) / factor) + 1; // Assuming base resolution of 129
  }
}
