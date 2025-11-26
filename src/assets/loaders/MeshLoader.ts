import { Asset } from '../Asset';
import { IAssetLoader, LoadOptions } from '../AssetLoader';
import { Logger } from '../../core/Logger';

const logger = Logger.create('MeshLoader');

/**
 * Mesh vertex attribute
 */
export interface VertexAttribute {
  /** Attribute name (position, normal, uv, etc.) */
  name: string;
  /** Data array */
  data: Float32Array;
  /** Number of components per vertex (2, 3, 4) */
  size: number;
  /** Data type */
  type: 'float32' | 'int32' | 'uint32' | 'uint16';
  /** Whether data is normalized */
  normalized: boolean;
}

/**
 * Mesh geometry data
 */
export interface MeshGeometry {
  /** Vertex attributes */
  attributes: Map<string, VertexAttribute>;
  /** Index buffer (optional) */
  indices?: Uint16Array | Uint32Array;
  /** Number of vertices */
  vertexCount: number;
  /** Bounding box min */
  boundingBoxMin?: Float32Array;
  /** Bounding box max */
  boundingBoxMax?: Float32Array;
}

/**
 * Mesh metadata
 */
export interface MeshMetadata {
  /** Number of vertices */
  vertexCount: number;
  /** Number of triangles */
  triangleCount: number;
  /** Has index buffer */
  isIndexed: boolean;
  /** Available vertex attributes */
  attributes: string[];
}

/**
 * Mesh asset containing geometry data
 */
export class MeshAsset extends Asset {
  private geometry: MeshGeometry | null = null;
  private meshMetadata: MeshMetadata | null = null;

  /**
   * Gets the mesh geometry
   */
  get data(): MeshGeometry | null {
    return this.geometry;
  }

  /**
   * Gets the mesh metadata
   */
  override get metadata(): MeshMetadata | null {
    return this.meshMetadata;
  }

  /**
   * Sets the mesh data
   */
  setData(geometry: MeshGeometry, metadata: MeshMetadata): void {
    this.geometry = geometry;
    this.meshMetadata = metadata;
  }

  /**
   * Gets a vertex attribute
   */
  getAttribute(name: string): VertexAttribute | undefined {
    return this.geometry?.attributes.get(name);
  }

  /**
   * Checks if mesh has an attribute
   */
  hasAttribute(name: string): boolean {
    return this.geometry?.attributes.has(name) || false;
  }

  /**
   * Gets the estimated memory size in bytes
   */
  getMemorySize(): number {
    if (!this.geometry) {
      return 0;
    }

    let size = 0;

    for (const attr of this.geometry.attributes.values()) {
      size += attr.data.byteLength;
    }

    if (this.geometry.indices) {
      size += this.geometry.indices.byteLength;
    }

    return size;
  }

  /**
   * Disposes the mesh and frees resources
   */
  override dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.geometry = null;
    this.meshMetadata = null;

    super.dispose();
  }
}

/**
 * Generic mesh loader
 * Provides base functionality for specific mesh format loaders
 */
export class MeshLoader implements IAssetLoader<MeshAsset> {
  private static readonly SUPPORTED_EXTENSIONS: string[] = [];

  /**
   * Loads a mesh from a URL
   */
  async load(url: string, options?: LoadOptions): Promise<MeshAsset> {
    logger.debug(`Loading mesh: ${url}`);
    throw new Error('MeshLoader is a base class. Use a specific loader (GLTFLoader, OBJLoader, etc.)');
  }

  /**
   * Checks if this loader can handle the given URL
   */
  canLoad(url: string): boolean {
    return false;
  }

  /**
   * Gets supported file extensions
   */
  getSupportedExtensions(): string[] {
    return [...MeshLoader.SUPPORTED_EXTENSIONS];
  }

  /**
   * Computes bounding box for mesh geometry
   */
  protected computeBoundingBox(positions: Float32Array): {
    min: Float32Array;
    max: Float32Array;
  } {
    const min = new Float32Array([Infinity, Infinity, Infinity]);
    const max = new Float32Array([-Infinity, -Infinity, -Infinity]);

    for (let i = 0; i < positions.length; i += 3) {
      min[0] = Math.min(min[0], positions[i]);
      min[1] = Math.min(min[1], positions[i + 1]);
      min[2] = Math.min(min[2], positions[i + 2]);

      max[0] = Math.max(max[0], positions[i]);
      max[1] = Math.max(max[1], positions[i + 1]);
      max[2] = Math.max(max[2], positions[i + 2]);
    }

    return { min, max };
  }

  /**
   * Computes normals for mesh geometry
   */
  protected computeNormals(
    positions: Float32Array,
    indices?: Uint16Array | Uint32Array
  ): Float32Array {
    const normals = new Float32Array(positions.length);

    if (indices) {
      for (let i = 0; i < indices.length; i += 3) {
        const i0 = indices[i] * 3;
        const i1 = indices[i + 1] * 3;
        const i2 = indices[i + 2] * 3;

        const v0x = positions[i0];
        const v0y = positions[i0 + 1];
        const v0z = positions[i0 + 2];

        const v1x = positions[i1];
        const v1y = positions[i1 + 1];
        const v1z = positions[i1 + 2];

        const v2x = positions[i2];
        const v2y = positions[i2 + 1];
        const v2z = positions[i2 + 2];

        const e1x = v1x - v0x;
        const e1y = v1y - v0y;
        const e1z = v1z - v0z;

        const e2x = v2x - v0x;
        const e2y = v2y - v0y;
        const e2z = v2z - v0z;

        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;

        normals[i0] += nx;
        normals[i0 + 1] += ny;
        normals[i0 + 2] += nz;

        normals[i1] += nx;
        normals[i1 + 1] += ny;
        normals[i1 + 2] += nz;

        normals[i2] += nx;
        normals[i2 + 1] += ny;
        normals[i2 + 2] += nz;
      }
    } else {
      for (let i = 0; i < positions.length; i += 9) {
        const v0x = positions[i];
        const v0y = positions[i + 1];
        const v0z = positions[i + 2];

        const v1x = positions[i + 3];
        const v1y = positions[i + 4];
        const v1z = positions[i + 5];

        const v2x = positions[i + 6];
        const v2y = positions[i + 7];
        const v2z = positions[i + 8];

        const e1x = v1x - v0x;
        const e1y = v1y - v0y;
        const e1z = v1z - v0z;

        const e2x = v2x - v0x;
        const e2y = v2y - v0y;
        const e2z = v2z - v0z;

        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;

        normals[i] = nx;
        normals[i + 1] = ny;
        normals[i + 2] = nz;

        normals[i + 3] = nx;
        normals[i + 4] = ny;
        normals[i + 5] = nz;

        normals[i + 6] = nx;
        normals[i + 7] = ny;
        normals[i + 8] = nz;
      }
    }

    for (let i = 0; i < normals.length; i += 3) {
      const x = normals[i];
      const y = normals[i + 1];
      const z = normals[i + 2];
      const len = Math.sqrt(x * x + y * y + z * z);

      if (len > 0) {
        normals[i] /= len;
        normals[i + 1] /= len;
        normals[i + 2] /= len;
      }
    }

    return normals;
  }

  /**
   * Generates tangents for normal mapping
   */
  protected computeTangents(
    positions: Float32Array,
    normals: Float32Array,
    uvs: Float32Array,
    indices?: Uint16Array | Uint32Array
  ): Float32Array {
    const tangents = new Float32Array(positions.length / 3 * 4);

    const tan1 = new Float32Array(positions.length);
    const tan2 = new Float32Array(positions.length);

    const processTriangle = (i0: number, i1: number, i2: number): void => {
      const v0x = positions[i0 * 3];
      const v0y = positions[i0 * 3 + 1];
      const v0z = positions[i0 * 3 + 2];

      const v1x = positions[i1 * 3];
      const v1y = positions[i1 * 3 + 1];
      const v1z = positions[i1 * 3 + 2];

      const v2x = positions[i2 * 3];
      const v2y = positions[i2 * 3 + 1];
      const v2z = positions[i2 * 3 + 2];

      const w0x = uvs[i0 * 2];
      const w0y = uvs[i0 * 2 + 1];

      const w1x = uvs[i1 * 2];
      const w1y = uvs[i1 * 2 + 1];

      const w2x = uvs[i2 * 2];
      const w2y = uvs[i2 * 2 + 1];

      const x1 = v1x - v0x;
      const x2 = v2x - v0x;
      const y1 = v1y - v0y;
      const y2 = v2y - v0y;
      const z1 = v1z - v0z;
      const z2 = v2z - v0z;

      const s1 = w1x - w0x;
      const s2 = w2x - w0x;
      const t1 = w1y - w0y;
      const t2 = w2y - w0y;

      const r = 1.0 / (s1 * t2 - s2 * t1);
      const sdirx = (t2 * x1 - t1 * x2) * r;
      const sdiry = (t2 * y1 - t1 * y2) * r;
      const sdirz = (t2 * z1 - t1 * z2) * r;

      const tdirx = (s1 * x2 - s2 * x1) * r;
      const tdiry = (s1 * y2 - s2 * y1) * r;
      const tdirz = (s1 * z2 - s2 * z1) * r;

      tan1[i0 * 3] += sdirx;
      tan1[i0 * 3 + 1] += sdiry;
      tan1[i0 * 3 + 2] += sdirz;

      tan1[i1 * 3] += sdirx;
      tan1[i1 * 3 + 1] += sdiry;
      tan1[i1 * 3 + 2] += sdirz;

      tan1[i2 * 3] += sdirx;
      tan1[i2 * 3 + 1] += sdiry;
      tan1[i2 * 3 + 2] += sdirz;

      tan2[i0 * 3] += tdirx;
      tan2[i0 * 3 + 1] += tdiry;
      tan2[i0 * 3 + 2] += tdirz;

      tan2[i1 * 3] += tdirx;
      tan2[i1 * 3 + 1] += tdiry;
      tan2[i1 * 3 + 2] += tdirz;

      tan2[i2 * 3] += tdirx;
      tan2[i2 * 3 + 1] += tdiry;
      tan2[i2 * 3 + 2] += tdirz;
    };

    if (indices) {
      for (let i = 0; i < indices.length; i += 3) {
        processTriangle(indices[i], indices[i + 1], indices[i + 2]);
      }
    } else {
      for (let i = 0; i < positions.length / 3; i += 3) {
        processTriangle(i, i + 1, i + 2);
      }
    }

    for (let i = 0; i < positions.length / 3; i++) {
      const nx = normals[i * 3];
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];

      const t1x = tan1[i * 3];
      const t1y = tan1[i * 3 + 1];
      const t1z = tan1[i * 3 + 2];

      const t2x = tan2[i * 3];
      const t2y = tan2[i * 3 + 1];
      const t2z = tan2[i * 3 + 2];

      const dot = nx * t1x + ny * t1y + nz * t1z;

      let tx = t1x - nx * dot;
      let ty = t1y - ny * dot;
      let tz = t1z - nz * dot;

      const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (len > 0) {
        tx /= len;
        ty /= len;
        tz /= len;
      }

      const crossx = ny * t1z - nz * t1y;
      const crossy = nz * t1x - nx * t1z;
      const crossz = nx * t1y - ny * t1x;
      const w = (crossx * t2x + crossy * t2y + crossz * t2z) < 0.0 ? -1.0 : 1.0;

      tangents[i * 4] = tx;
      tangents[i * 4 + 1] = ty;
      tangents[i * 4 + 2] = tz;
      tangents[i * 4 + 3] = w;
    }

    return tangents;
  }

  /**
   * Extracts file extension from URL
   */
  protected getExtension(url: string): string | null {
    const match = url.match(/\.([^./?#]+)(?:[?#]|$)/i);
    return match ? match[1].toLowerCase() : null;
  }
}
