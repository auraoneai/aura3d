/**
 * Fluent API for building meshes with automatic optimization.
 * Supports vertex deduplication, tangent generation, and normal smoothing.
 * @module MeshBuilder
 */

import { Vector3 } from '../../math/Vector3';
import { Mesh } from './Mesh';
import { VertexBuffer, BufferUsage } from './VertexBuffer';
import { IndexBuffer, IndexType, PrimitiveTopology } from './IndexBuffer';
import { VertexFormat, VertexAttributeSemantic } from './VertexFormat';

/**
 * Vertex data for mesh building.
 */
interface BuilderVertex {
  position: [number, number, number];
  normal?: [number, number, number];
  tangent?: [number, number, number, number];
  texCoord?: [number, number];
  color?: [number, number, number, number];
}

/**
 * Fluent mesh builder with automatic vertex deduplication and optimization.
 * Provides a convenient API for programmatically constructing meshes.
 *
 * @example
 * ```typescript
 * const mesh = new MeshBuilder(VertexFormat.P3N3T2())
 *   .begin(PrimitiveTopology.TriangleList)
 *   .position(-1, -1, 0).normal(0, 0, 1).texCoord(0, 0).vertex()
 *   .position( 1, -1, 0).normal(0, 0, 1).texCoord(1, 0).vertex()
 *   .position( 1,  1, 0).normal(0, 0, 1).texCoord(1, 1).vertex()
 *   .position(-1,  1, 0).normal(0, 0, 1).texCoord(0, 1).vertex()
 *   .triangle(0, 1, 2)
 *   .triangle(0, 2, 3)
 *   .build();
 * ```
 */
export class MeshBuilder {
  /** Vertex format for the mesh */
  private readonly format: VertexFormat;
  /** Accumulated vertices */
  private vertices: BuilderVertex[];
  /** Accumulated indices */
  private _indices: number[];
  /** Current vertex being built */
  private currentVertex: BuilderVertex;
  /** Primitive topology */
  private topology: PrimitiveTopology;
  /** Whether to deduplicate vertices */
  private deduplicateVertices: boolean;
  /** Whether to generate normals if missing */
  private generateNormals: boolean;
  /** Whether to generate tangents if missing */
  private generateTangents: boolean;
  /** Vertex hash map for deduplication */
  private vertexMap: Map<string, number>;

  /**
   * Creates a new mesh builder.
   *
   * @param format - Vertex format
   *
   * @example
   * ```typescript
   * const builder = new MeshBuilder(VertexFormat.P3N3T2());
   * ```
   */
  constructor(format: VertexFormat) {
    this.format = format;
    this.vertices = [];
    this._indices = [];
    this.currentVertex = { position: [0, 0, 0] };
    this.topology = PrimitiveTopology.TriangleList;
    this.deduplicateVertices = true;
    this.generateNormals = false;
    this.generateTangents = false;
    this.vertexMap = new Map();
  }

  /**
   * Begins building a mesh with the specified topology.
   *
   * @param topology - Primitive topology (default: TriangleList)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.begin(PrimitiveTopology.TriangleList);
   * ```
   */
  begin(topology: PrimitiveTopology = PrimitiveTopology.TriangleList): this {
    this.vertices = [];
    this._indices = [];
    this.topology = topology;
    this.vertexMap.clear();
    return this;
  }

  /**
   * Sets vertex deduplication on or off.
   *
   * @param enabled - Whether to deduplicate vertices (default: true)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.setDeduplication(true);
   * ```
   */
  setDeduplication(enabled: boolean): this {
    this.deduplicateVertices = enabled;
    return this;
  }

  /**
   * Enables automatic normal generation for missing normals.
   *
   * @param enabled - Whether to generate normals (default: true)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.setGenerateNormals(true);
   * ```
   */
  setGenerateNormals(enabled: boolean): this {
    this.generateNormals = enabled;
    return this;
  }

  /**
   * Enables automatic tangent generation using MikkTSpace algorithm.
   *
   * @param enabled - Whether to generate tangents (default: true)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.setGenerateTangents(true);
   * ```
   */
  setGenerateTangents(enabled: boolean): this {
    this.generateTangents = enabled;
    return this;
  }

  /**
   * Sets the position of the current vertex.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.position(1, 2, 3);
   * ```
   */
  position(x: number, y: number, z: number): this {
    this.currentVertex.position = [x, y, z];
    return this;
  }

  /**
   * Sets the normal of the current vertex.
   *
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.normal(0, 1, 0);
   * ```
   */
  normal(x: number, y: number, z: number): this {
    this.currentVertex.normal = [x, y, z];
    return this;
  }

  /**
   * Sets the tangent of the current vertex.
   *
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   * @param w - Handedness (1 or -1)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.tangent(1, 0, 0, 1);
   * ```
   */
  tangent(x: number, y: number, z: number, w: number = 1): this {
    this.currentVertex.tangent = [x, y, z, w];
    return this;
  }

  /**
   * Sets the texture coordinates of the current vertex.
   *
   * @param u - U coordinate
   * @param v - V coordinate
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.texCoord(0.5, 0.5);
   * ```
   */
  texCoord(u: number, v: number): this {
    this.currentVertex.texCoord = [u, v];
    return this;
  }

  /**
   * Sets the color of the current vertex.
   *
   * @param r - Red component (0-255)
   * @param g - Green component (0-255)
   * @param b - Blue component (0-255)
   * @param a - Alpha component (0-255, default: 255)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.color(255, 128, 64, 255);
   * ```
   */
  color(r: number, g: number, b: number, a: number = 255): this {
    this.currentVertex.color = [r, g, b, a];
    return this;
  }

  /**
   * Commits the current vertex to the mesh.
   * Returns the index of the added vertex.
   *
   * @returns Index of the added vertex
   *
   * @example
   * ```typescript
   * const idx = builder.position(1, 2, 3).normal(0, 1, 0).vertex();
   * ```
   */
  vertex(): number {
    if (this.deduplicateVertices) {
      const hash = this.hashVertex(this.currentVertex);
      const existing = this.vertexMap.get(hash);
      if (existing !== undefined) {
        return existing;
      }
    }

    const index = this.vertices.length;
    this.vertices.push({ ...this.currentVertex });

    if (this.deduplicateVertices) {
      const hash = this.hashVertex(this.currentVertex);
      this.vertexMap.set(hash, index);
    }

    // Reset current vertex
    this.currentVertex = { position: [0, 0, 0] };

    return index;
  }

  /**
   * Adds a triangle to the mesh.
   *
   * @param i0 - First vertex index
   * @param i1 - Second vertex index
   * @param i2 - Third vertex index
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.triangle(0, 1, 2);
   * ```
   */
  triangle(i0: number, i1: number, i2: number): this {
    this._indices.push(i0, i1, i2);
    return this;
  }

  /**
   * Adds a quad as two triangles.
   *
   * @param i0 - First vertex index
   * @param i1 - Second vertex index
   * @param i2 - Third vertex index
   * @param i3 - Fourth vertex index
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.quad(0, 1, 2, 3);
   * ```
   */
  quad(i0: number, i1: number, i2: number, i3: number): this {
    this._indices.push(i0, i1, i2);
    this._indices.push(i0, i2, i3);
    return this;
  }

  /**
   * Adds indices from an array.
   *
   * @param indices - Array of indices
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.indices([0, 1, 2, 0, 2, 3]);
   * ```
   */
  indices(indices: number[]): this {
    this._indices.push(...indices);
    return this;
  }

  /**
   * Builds the final mesh from accumulated data.
   *
   * @param name - Optional name for the mesh
   * @returns Constructed mesh
   *
   * @example
   * ```typescript
   * const mesh = builder.build('MyMesh');
   * ```
   */
  build(name: string = 'Mesh'): Mesh {
    if (this.vertices.length === 0) {
      throw new Error('Cannot build mesh with no vertices');
    }

    // Generate normals if requested and missing
    if (this.generateNormals && this.format.hasAttribute(VertexAttributeSemantic.Normal)) {
      this.computeNormals();
    }

    // Generate tangents if requested and missing
    if (this.generateTangents && this.format.hasAttribute(VertexAttributeSemantic.Tangent)) {
      this.computeTangents();
    }

    // Create vertex buffer
    const vertexBuffer = new VertexBuffer(this.format, this.vertices.length, BufferUsage.Static);

    for (let i = 0; i < this.vertices.length; i++) {
      const v = this.vertices[i];

      if (v.position) {
        vertexBuffer.setPosition(i, v.position[0], v.position[1], v.position[2]);
      }

      if (v.normal && this.format.hasAttribute(VertexAttributeSemantic.Normal)) {
        vertexBuffer.setNormal(i, v.normal[0], v.normal[1], v.normal[2]);
      }

      if (v.tangent && this.format.hasAttribute(VertexAttributeSemantic.Tangent)) {
        vertexBuffer.setTangent(i, v.tangent[0], v.tangent[1], v.tangent[2], v.tangent[3]);
      }

      if (v.texCoord && this.format.hasAttribute(VertexAttributeSemantic.TexCoord0)) {
        vertexBuffer.setTexCoord(i, v.texCoord[0], v.texCoord[1]);
      }

      if (v.color && this.format.hasAttribute(VertexAttributeSemantic.Color0)) {
        vertexBuffer.setColor(i, v.color[0], v.color[1], v.color[2], v.color[3]);
      }
    }

    // Create index buffer
    const indexBuffer = IndexBuffer.fromArray(this._indices, undefined, this.topology);

    // Create mesh
    const mesh = new Mesh(vertexBuffer, indexBuffer, name);
    mesh.computeBounds();

    return mesh;
  }

  /**
   * Computes vertex normals from triangle data.
   * Uses face normals weighted by triangle area.
   */
  private computeNormals(): void {
    // Initialize all normals to zero
    for (const v of this.vertices) {
      if (!v.normal) {
        v.normal = [0, 0, 0];
      }
    }

    // Accumulate face normals
    for (let i = 0; i < this._indices.length; i += 3) {
      const i0 = this._indices[i];
      const i1 = this._indices[i + 1];
      const i2 = this._indices[i + 2];

      const v0 = this.vertices[i0];
      const v1 = this.vertices[i1];
      const v2 = this.vertices[i2];

      const p0 = new Vector3(v0.position[0], v0.position[1], v0.position[2]);
      const p1 = new Vector3(v1.position[0], v1.position[1], v1.position[2]);
      const p2 = new Vector3(v2.position[0], v2.position[1], v2.position[2]);

      const e1 = p1.sub(p0);
      const e2 = p2.sub(p0);
      const faceNormal = e1.cross(e2);

      // Accumulate (face normal is already weighted by triangle area)
      if (v0.normal) {
        v0.normal[0] += faceNormal.x;
        v0.normal[1] += faceNormal.y;
        v0.normal[2] += faceNormal.z;
      }
      if (v1.normal) {
        v1.normal[0] += faceNormal.x;
        v1.normal[1] += faceNormal.y;
        v1.normal[2] += faceNormal.z;
      }
      if (v2.normal) {
        v2.normal[0] += faceNormal.x;
        v2.normal[1] += faceNormal.y;
        v2.normal[2] += faceNormal.z;
      }
    }

    // Normalize all normals
    for (const v of this.vertices) {
      if (v.normal) {
        const n = new Vector3(v.normal[0], v.normal[1], v.normal[2]);
        const normalized = n.normalize();
        v.normal[0] = normalized.x;
        v.normal[1] = normalized.y;
        v.normal[2] = normalized.z;
      }
    }
  }

  /**
   * Computes tangent vectors using a simplified MikkTSpace-like algorithm.
   * Requires texture coordinates and normals.
   */
  private computeTangents(): void {
    if (!this.format.hasAttribute(VertexAttributeSemantic.TexCoord0)) {
      return; // Need UVs for tangent computation
    }

    // Initialize tangents
    for (const v of this.vertices) {
      if (!v.tangent) {
        v.tangent = [0, 0, 0, 1];
      }
    }

    const tan1: Vector3[] = new Array(this.vertices.length);
    const tan2: Vector3[] = new Array(this.vertices.length);
    for (let i = 0; i < this.vertices.length; i++) {
      tan1[i] = new Vector3();
      tan2[i] = new Vector3();
    }

    // Compute tangents for each triangle
    for (let i = 0; i < this._indices.length; i += 3) {
      const i0 = this._indices[i];
      const i1 = this._indices[i + 1];
      const i2 = this._indices[i + 2];

      const v0 = this.vertices[i0];
      const v1 = this.vertices[i1];
      const v2 = this.vertices[i2];

      if (!v0.texCoord || !v1.texCoord || !v2.texCoord) continue;

      const p0 = new Vector3(v0.position[0], v0.position[1], v0.position[2]);
      const p1 = new Vector3(v1.position[0], v1.position[1], v1.position[2]);
      const p2 = new Vector3(v2.position[0], v2.position[1], v2.position[2]);

      const uv0 = v0.texCoord;
      const uv1 = v1.texCoord;
      const uv2 = v2.texCoord;

      const edge1 = p1.sub(p0);
      const edge2 = p2.sub(p0);

      const deltaUV1 = [uv1[0] - uv0[0], uv1[1] - uv0[1]];
      const deltaUV2 = [uv2[0] - uv0[0], uv2[1] - uv0[1]];

      const det = deltaUV1[0] * deltaUV2[1] - deltaUV1[1] * deltaUV2[0];
      if (Math.abs(det) < 1e-6) continue;

      const r = 1.0 / det;

      const sdir = new Vector3(
        (deltaUV2[1] * edge1.x - deltaUV1[1] * edge2.x) * r,
        (deltaUV2[1] * edge1.y - deltaUV1[1] * edge2.y) * r,
        (deltaUV2[1] * edge1.z - deltaUV1[1] * edge2.z) * r
      );

      const tdir = new Vector3(
        (deltaUV1[0] * edge2.x - deltaUV2[0] * edge1.x) * r,
        (deltaUV1[0] * edge2.y - deltaUV2[0] * edge1.y) * r,
        (deltaUV1[0] * edge2.z - deltaUV2[0] * edge1.z) * r
      );

      tan1[i0].addInPlace(sdir);
      tan1[i1].addInPlace(sdir);
      tan1[i2].addInPlace(sdir);

      tan2[i0].addInPlace(tdir);
      tan2[i1].addInPlace(tdir);
      tan2[i2].addInPlace(tdir);
    }

    // Orthonormalize and compute handedness
    for (let i = 0; i < this.vertices.length; i++) {
      const v = this.vertices[i];
      if (!v.normal) continue;

      const n = new Vector3(v.normal[0], v.normal[1], v.normal[2]);
      const t = tan1[i];

      // Gram-Schmidt orthogonalize
      const tangent = t.sub(n.scale(n.dot(t))).normalize();

      // Calculate handedness
      const handedness = n.cross(t).dot(tan2[i]) < 0 ? -1 : 1;

      if (v.tangent) {
        v.tangent[0] = tangent.x;
        v.tangent[1] = tangent.y;
        v.tangent[2] = tangent.z;
        v.tangent[3] = handedness;
      }
    }
  }

  /**
   * Hashes a vertex for deduplication.
   *
   * @param vertex - Vertex to hash
   * @returns Hash string
   */
  private hashVertex(vertex: BuilderVertex): string {
    const parts: string[] = [];
    parts.push(vertex.position.join(','));
    if (vertex.normal) parts.push(vertex.normal.join(','));
    if (vertex.tangent) parts.push(vertex.tangent.join(','));
    if (vertex.texCoord) parts.push(vertex.texCoord.join(','));
    if (vertex.color) parts.push(vertex.color.join(','));
    return parts.join('|');
  }
}
