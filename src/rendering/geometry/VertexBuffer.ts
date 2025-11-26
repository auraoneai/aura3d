/**
 * Vertex buffer for storing vertex attribute data.
 * Provides typed array backing with efficient attribute accessors for GPU upload.
 * @module VertexBuffer
 */

import { VertexFormat, VertexAttributeSemantic, VertexAttributeType } from './VertexFormat';

/**
 * Usage hint for vertex buffer optimization.
 */
export enum BufferUsage {
  /** Data will be set once and used many times (default for static geometry) */
  Static = 'static',
  /** Data will be modified frequently (default for dynamic geometry) */
  Dynamic = 'dynamic',
  /** Data will be set once per frame and used once (for streaming data) */
  Stream = 'stream',
}

/**
 * Vertex buffer storing interleaved or separate vertex attribute data.
 * Backed by Float32Array for efficient GPU upload.
 *
 * @example
 * ```typescript
 * // Create a vertex buffer for 100 vertices
 * const format = VertexFormat.P3N3T2();
 * const buffer = new VertexBuffer(format, 100);
 *
 * // Set vertex data
 * buffer.setPosition(0, 1, 2, 3);
 * buffer.setNormal(0, 0, 1, 0);
 * buffer.setTexCoord(0, 0.5, 0.5);
 *
 * // Upload to GPU
 * const data = buffer.data;
 * ```
 */
export class VertexBuffer {
  /** Vertex format specification */
  readonly format: VertexFormat;
  /** Number of vertices in the buffer */
  readonly vertexCount: number;
  /** Usage hint for optimization */
  readonly usage: BufferUsage;
  /** Underlying typed array data */
  private readonly _data: Float32Array;
  /** View as Uint8Array for byte operations */
  private readonly _byteView: Uint8Array;
  /** Dirty flag for tracking modifications */
  private _dirty: boolean;

  /**
   * Creates a new vertex buffer.
   *
   * @param format - Vertex format specification
   * @param vertexCount - Number of vertices to allocate
   * @param usage - Usage hint (default: Static)
   *
   * @example
   * ```typescript
   * const buffer = new VertexBuffer(VertexFormat.P3N3T2(), 1000);
   * ```
   */
  constructor(format: VertexFormat, vertexCount: number, usage: BufferUsage = BufferUsage.Static) {
    this.format = format;
    this.vertexCount = vertexCount;
    this.usage = usage;
    this._dirty = true;

    const byteSize = format.stride * vertexCount;
    const arrayBuffer = new ArrayBuffer(byteSize);
    this._data = new Float32Array(arrayBuffer);
    this._byteView = new Uint8Array(arrayBuffer);
  }

  /**
   * Gets the underlying Float32Array data.
   * Use this for GPU upload.
   *
   * @returns Float32Array view of the buffer
   */
  get data(): Float32Array {
    return this._data;
  }

  /**
   * Gets the byte view of the buffer.
   * Useful for mixed-type attribute access.
   *
   * @returns Uint8Array view of the buffer
   */
  get byteView(): Uint8Array {
    return this._byteView;
  }

  /**
   * Gets the total size of the buffer in bytes.
   *
   * @returns Buffer size in bytes
   */
  get byteSize(): number {
    return this.format.stride * this.vertexCount;
  }

  /**
   * Checks if the buffer has been modified since last cleared.
   *
   * @returns True if buffer is dirty
   */
  get dirty(): boolean {
    return this._dirty;
  }

  /**
   * Marks the buffer as clean (uploaded to GPU).
   */
  clearDirty(): void {
    this._dirty = false;
  }

  /**
   * Marks the buffer as dirty (needs upload).
   */
  markDirty(): void {
    this._dirty = true;
  }

  /**
   * Gets the byte offset for a specific vertex.
   *
   * @param vertexIndex - Index of the vertex
   * @returns Byte offset in the buffer
   */
  private getVertexOffset(vertexIndex: number): number {
    return vertexIndex * this.format.stride;
  }

  /**
   * Sets a position attribute (Float3).
   *
   * @param vertexIndex - Vertex index
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   *
   * @example
   * ```typescript
   * buffer.setPosition(0, 1.0, 2.0, 3.0);
   * ```
   */
  setPosition(vertexIndex: number, x: number, y: number, z: number): void {
    const attr = this.format.getAttribute(VertexAttributeSemantic.Position);
    if (!attr) return;

    const offset = this.getVertexOffset(vertexIndex) + attr.offset;
    const floatOffset = offset / 4;
    this._data[floatOffset] = x;
    this._data[floatOffset + 1] = y;
    this._data[floatOffset + 2] = z;
    this._dirty = true;
  }

  /**
   * Gets a position attribute (Float3).
   *
   * @param vertexIndex - Vertex index
   * @param out - Output array [x, y, z]
   * @returns Output array or undefined if attribute not found
   *
   * @example
   * ```typescript
   * const pos = [0, 0, 0];
   * buffer.getPosition(0, pos);
   * console.log(pos); // [1.0, 2.0, 3.0]
   * ```
   */
  getPosition(vertexIndex: number, out: number[]): number[] | undefined {
    const attr = this.format.getAttribute(VertexAttributeSemantic.Position);
    if (!attr) return undefined;

    const offset = this.getVertexOffset(vertexIndex) + attr.offset;
    const floatOffset = offset / 4;
    out[0] = this._data[floatOffset];
    out[1] = this._data[floatOffset + 1];
    out[2] = this._data[floatOffset + 2];
    return out;
  }

  /**
   * Sets a normal attribute (Float3).
   *
   * @param vertexIndex - Vertex index
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   *
   * @example
   * ```typescript
   * buffer.setNormal(0, 0.0, 1.0, 0.0);
   * ```
   */
  setNormal(vertexIndex: number, x: number, y: number, z: number): void {
    const attr = this.format.getAttribute(VertexAttributeSemantic.Normal);
    if (!attr) return;

    const offset = this.getVertexOffset(vertexIndex) + attr.offset;
    const floatOffset = offset / 4;
    this._data[floatOffset] = x;
    this._data[floatOffset + 1] = y;
    this._data[floatOffset + 2] = z;
    this._dirty = true;
  }

  /**
   * Gets a normal attribute (Float3).
   *
   * @param vertexIndex - Vertex index
   * @param out - Output array [x, y, z]
   * @returns Output array or undefined if attribute not found
   */
  getNormal(vertexIndex: number, out: number[]): number[] | undefined {
    const attr = this.format.getAttribute(VertexAttributeSemantic.Normal);
    if (!attr) return undefined;

    const offset = this.getVertexOffset(vertexIndex) + attr.offset;
    const floatOffset = offset / 4;
    out[0] = this._data[floatOffset];
    out[1] = this._data[floatOffset + 1];
    out[2] = this._data[floatOffset + 2];
    return out;
  }

  /**
   * Sets a tangent attribute (Float4, w = handedness).
   *
   * @param vertexIndex - Vertex index
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   * @param w - Handedness (-1 or 1)
   *
   * @example
   * ```typescript
   * buffer.setTangent(0, 1.0, 0.0, 0.0, 1.0);
   * ```
   */
  setTangent(vertexIndex: number, x: number, y: number, z: number, w: number): void {
    const attr = this.format.getAttribute(VertexAttributeSemantic.Tangent);
    if (!attr) return;

    const offset = this.getVertexOffset(vertexIndex) + attr.offset;
    const floatOffset = offset / 4;
    this._data[floatOffset] = x;
    this._data[floatOffset + 1] = y;
    this._data[floatOffset + 2] = z;
    this._data[floatOffset + 3] = w;
    this._dirty = true;
  }

  /**
   * Gets a tangent attribute (Float4).
   *
   * @param vertexIndex - Vertex index
   * @param out - Output array [x, y, z, w]
   * @returns Output array or undefined if attribute not found
   */
  getTangent(vertexIndex: number, out: number[]): number[] | undefined {
    const attr = this.format.getAttribute(VertexAttributeSemantic.Tangent);
    if (!attr) return undefined;

    const offset = this.getVertexOffset(vertexIndex) + attr.offset;
    const floatOffset = offset / 4;
    out[0] = this._data[floatOffset];
    out[1] = this._data[floatOffset + 1];
    out[2] = this._data[floatOffset + 2];
    out[3] = this._data[floatOffset + 3];
    return out;
  }

  /**
   * Sets a texture coordinate attribute (Float2).
   *
   * @param vertexIndex - Vertex index
   * @param u - U component
   * @param v - V component
   * @param channel - Texture coordinate channel (default: 0)
   *
   * @example
   * ```typescript
   * buffer.setTexCoord(0, 0.5, 0.5);
   * buffer.setTexCoord(1, 1.0, 0.0, 1); // Second channel
   * ```
   */
  setTexCoord(vertexIndex: number, u: number, v: number, channel: number = 0): void {
    const semantic = [
      VertexAttributeSemantic.TexCoord0,
      VertexAttributeSemantic.TexCoord1,
      VertexAttributeSemantic.TexCoord2,
      VertexAttributeSemantic.TexCoord3,
    ][channel];
    const attr = this.format.getAttribute(semantic);
    if (!attr) return;

    const offset = this.getVertexOffset(vertexIndex) + attr.offset;
    const floatOffset = offset / 4;
    this._data[floatOffset] = u;
    this._data[floatOffset + 1] = v;
    this._dirty = true;
  }

  /**
   * Gets a texture coordinate attribute (Float2).
   *
   * @param vertexIndex - Vertex index
   * @param out - Output array [u, v]
   * @param channel - Texture coordinate channel (default: 0)
   * @returns Output array or undefined if attribute not found
   */
  getTexCoord(vertexIndex: number, out: number[], channel: number = 0): number[] | undefined {
    const semantic = [
      VertexAttributeSemantic.TexCoord0,
      VertexAttributeSemantic.TexCoord1,
      VertexAttributeSemantic.TexCoord2,
      VertexAttributeSemantic.TexCoord3,
    ][channel];
    const attr = this.format.getAttribute(semantic);
    if (!attr) return undefined;

    const offset = this.getVertexOffset(vertexIndex) + attr.offset;
    const floatOffset = offset / 4;
    out[0] = this._data[floatOffset];
    out[1] = this._data[floatOffset + 1];
    return out;
  }

  /**
   * Sets a color attribute (UByte4Norm, values 0-255).
   *
   * @param vertexIndex - Vertex index
   * @param r - Red component (0-255)
   * @param g - Green component (0-255)
   * @param b - Blue component (0-255)
   * @param a - Alpha component (0-255)
   * @param channel - Color channel (default: 0)
   *
   * @example
   * ```typescript
   * buffer.setColor(0, 255, 128, 64, 255);
   * ```
   */
  setColor(vertexIndex: number, r: number, g: number, b: number, a: number, channel: number = 0): void {
    const semantic = channel === 0 ? VertexAttributeSemantic.Color0 : VertexAttributeSemantic.Color1;
    const attr = this.format.getAttribute(semantic);
    if (!attr) return;

    const offset = this.getVertexOffset(vertexIndex) + attr.offset;
    this._byteView[offset] = r;
    this._byteView[offset + 1] = g;
    this._byteView[offset + 2] = b;
    this._byteView[offset + 3] = a;
    this._dirty = true;
  }

  /**
   * Gets a color attribute (UByte4Norm).
   *
   * @param vertexIndex - Vertex index
   * @param out - Output array [r, g, b, a]
   * @param channel - Color channel (default: 0)
   * @returns Output array or undefined if attribute not found
   */
  getColor(vertexIndex: number, out: number[], channel: number = 0): number[] | undefined {
    const semantic = channel === 0 ? VertexAttributeSemantic.Color0 : VertexAttributeSemantic.Color1;
    const attr = this.format.getAttribute(semantic);
    if (!attr) return undefined;

    const offset = this.getVertexOffset(vertexIndex) + attr.offset;
    out[0] = this._byteView[offset];
    out[1] = this._byteView[offset + 1];
    out[2] = this._byteView[offset + 2];
    out[3] = this._byteView[offset + 3];
    return out;
  }

  /**
   * Copies all vertex data from another buffer.
   * Buffers must have compatible formats.
   *
   * @param source - Source buffer to copy from
   *
   * @example
   * ```typescript
   * const buffer1 = new VertexBuffer(format, 100);
   * const buffer2 = new VertexBuffer(format, 100);
   * buffer2.copyFrom(buffer1);
   * ```
   */
  copyFrom(source: VertexBuffer): void {
    if (!this.format.isCompatible(source.format)) {
      throw new Error('Cannot copy from buffer with incompatible format');
    }

    const count = Math.min(this.vertexCount, source.vertexCount);
    const byteCount = count * this.format.stride;
    this._byteView.set(source._byteView.subarray(0, byteCount));
    this._dirty = true;
  }

  /**
   * Clears the buffer to zero.
   *
   * @example
   * ```typescript
   * buffer.clear();
   * ```
   */
  clear(): void {
    this._data.fill(0);
    this._dirty = true;
  }
}
