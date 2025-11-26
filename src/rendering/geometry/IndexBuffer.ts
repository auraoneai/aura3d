/**
 * Index buffer for storing vertex indices for indexed drawing.
 * Supports both 16-bit and 32-bit indices with primitive restart.
 * @module IndexBuffer
 */

import { BufferUsage } from './VertexBuffer';

/**
 * Index data type.
 */
export enum IndexType {
  /** 16-bit unsigned integer (max 65535 vertices) */
  UInt16 = 'uint16',
  /** 32-bit unsigned integer (max 4294967295 vertices) */
  UInt32 = 'uint32',
}

/**
 * Primitive topology for rendering.
 */
export enum PrimitiveTopology {
  /** Triangle list (most common) */
  TriangleList = 'triangle-list',
  /** Triangle strip with implicit connectivity */
  TriangleStrip = 'triangle-strip',
  /** Line list */
  LineList = 'line-list',
  /** Line strip with implicit connectivity */
  LineStrip = 'line-strip',
  /** Point list */
  PointList = 'point-list',
}

/**
 * Index buffer storing vertex indices for indexed drawing.
 * Automatically chooses 16-bit or 32-bit based on vertex count.
 *
 * @example
 * ```typescript
 * // Create an index buffer for a quad
 * const indices = new IndexBuffer(6, IndexType.UInt16);
 * indices.setIndex(0, 0);
 * indices.setIndex(1, 1);
 * indices.setIndex(2, 2);
 * indices.setIndex(3, 0);
 * indices.setIndex(4, 2);
 * indices.setIndex(5, 3);
 *
 * // Or use helper methods
 * indices.setTriangle(0, 0, 1, 2);
 * indices.setTriangle(1, 0, 2, 3);
 * ```
 */
export class IndexBuffer {
  /** Number of indices in the buffer */
  readonly indexCount: number;
  /** Index data type */
  readonly indexType: IndexType;
  /** Usage hint for optimization */
  readonly usage: BufferUsage;
  /** Primitive topology */
  readonly topology: PrimitiveTopology;
  /** Underlying typed array data (Uint16Array or Uint32Array) */
  private readonly _data: Uint16Array | Uint32Array;
  /** Dirty flag for tracking modifications */
  private _dirty: boolean;
  /** Index range tracking for optimization */
  private _minIndex: number;
  private _maxIndex: number;

  /**
   * Creates a new index buffer.
   *
   * @param indexCount - Number of indices to allocate
   * @param indexType - Index data type (default: UInt16)
   * @param usage - Usage hint (default: Static)
   * @param topology - Primitive topology (default: TriangleList)
   *
   * @example
   * ```typescript
   * const indices = new IndexBuffer(1024, IndexType.UInt16);
   * ```
   */
  constructor(
    indexCount: number,
    indexType: IndexType = IndexType.UInt16,
    usage: BufferUsage = BufferUsage.Static,
    topology: PrimitiveTopology = PrimitiveTopology.TriangleList
  ) {
    this.indexCount = indexCount;
    this.indexType = indexType;
    this.usage = usage;
    this.topology = topology;
    this._dirty = true;
    this._minIndex = Number.MAX_SAFE_INTEGER;
    this._maxIndex = 0;

    if (indexType === IndexType.UInt16) {
      this._data = new Uint16Array(indexCount);
    } else {
      this._data = new Uint32Array(indexCount);
    }
  }

  /**
   * Gets the underlying typed array data.
   * Use this for GPU upload.
   *
   * @returns Uint16Array or Uint32Array view of the buffer
   */
  get data(): Uint16Array | Uint32Array {
    return this._data;
  }

  /**
   * Gets the total size of the buffer in bytes.
   *
   * @returns Buffer size in bytes
   */
  get byteSize(): number {
    return this._data.byteLength;
  }

  /**
   * Gets the bytes per index (2 for UInt16, 4 for UInt32).
   *
   * @returns Bytes per index
   */
  get bytesPerIndex(): number {
    return this.indexType === IndexType.UInt16 ? 2 : 4;
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
   * Gets the minimum index value in the buffer.
   * Useful for draw range optimization.
   *
   * @returns Minimum index value
   */
  get minIndex(): number {
    return this._minIndex;
  }

  /**
   * Gets the maximum index value in the buffer.
   * Useful for draw range optimization.
   *
   * @returns Maximum index value
   */
  get maxIndex(): number {
    return this._maxIndex;
  }

  /**
   * Gets the number of primitives based on topology.
   *
   * @returns Number of primitives
   *
   * @example
   * ```typescript
   * const indices = new IndexBuffer(6, IndexType.UInt16, BufferUsage.Static, PrimitiveTopology.TriangleList);
   * console.log(indices.primitiveCount); // 2 triangles
   * ```
   */
  get primitiveCount(): number {
    switch (this.topology) {
      case PrimitiveTopology.TriangleList:
        return Math.floor(this.indexCount / 3);
      case PrimitiveTopology.TriangleStrip:
        return Math.max(0, this.indexCount - 2);
      case PrimitiveTopology.LineList:
        return Math.floor(this.indexCount / 2);
      case PrimitiveTopology.LineStrip:
        return Math.max(0, this.indexCount - 1);
      case PrimitiveTopology.PointList:
        return this.indexCount;
      default:
        return 0;
    }
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
   * Sets a single index value.
   *
   * @param indexOffset - Offset in the index buffer
   * @param value - Index value
   *
   * @example
   * ```typescript
   * indices.setIndex(0, 5);
   * ```
   */
  setIndex(indexOffset: number, value: number): void {
    this._data[indexOffset] = value;
    this._minIndex = Math.min(this._minIndex, value);
    this._maxIndex = Math.max(this._maxIndex, value);
    this._dirty = true;
  }

  /**
   * Gets a single index value.
   *
   * @param indexOffset - Offset in the index buffer
   * @returns Index value
   *
   * @example
   * ```typescript
   * const idx = indices.getIndex(0);
   * ```
   */
  getIndex(indexOffset: number): number {
    return this._data[indexOffset];
  }

  /**
   * Sets three indices for a triangle.
   *
   * @param triangleIndex - Triangle index
   * @param i0 - First vertex index
   * @param i1 - Second vertex index
   * @param i2 - Third vertex index
   *
   * @example
   * ```typescript
   * indices.setTriangle(0, 0, 1, 2);
   * indices.setTriangle(1, 0, 2, 3);
   * ```
   */
  setTriangle(triangleIndex: number, i0: number, i1: number, i2: number): void {
    const offset = triangleIndex * 3;
    this._data[offset] = i0;
    this._data[offset + 1] = i1;
    this._data[offset + 2] = i2;

    this._minIndex = Math.min(this._minIndex, i0, i1, i2);
    this._maxIndex = Math.max(this._maxIndex, i0, i1, i2);
    this._dirty = true;
  }

  /**
   * Gets three indices for a triangle.
   *
   * @param triangleIndex - Triangle index
   * @param out - Output array [i0, i1, i2]
   * @returns Output array
   *
   * @example
   * ```typescript
   * const tri = [0, 0, 0];
   * indices.getTriangle(0, tri);
   * console.log(tri); // [0, 1, 2]
   * ```
   */
  getTriangle(triangleIndex: number, out: number[]): number[] {
    const offset = triangleIndex * 3;
    out[0] = this._data[offset];
    out[1] = this._data[offset + 1];
    out[2] = this._data[offset + 2];
    return out;
  }

  /**
   * Sets a range of indices from an array.
   *
   * @param startIndex - Starting index in the buffer
   * @param values - Array of index values
   *
   * @example
   * ```typescript
   * indices.setIndices(0, [0, 1, 2, 0, 2, 3]);
   * ```
   */
  setIndices(startIndex: number, values: number[]): void {
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      this._data[startIndex + i] = value;
      this._minIndex = Math.min(this._minIndex, value);
      this._maxIndex = Math.max(this._maxIndex, value);
    }
    this._dirty = true;
  }

  /**
   * Fills the entire buffer with a single value.
   *
   * @param value - Value to fill with
   *
   * @example
   * ```typescript
   * indices.fill(0);
   * ```
   */
  fill(value: number): void {
    this._data.fill(value);
    this._minIndex = value;
    this._maxIndex = value;
    this._dirty = true;
  }

  /**
   * Clears the buffer to zero.
   *
   * @example
   * ```typescript
   * indices.clear();
   * ```
   */
  clear(): void {
    this._data.fill(0);
    this._minIndex = 0;
    this._maxIndex = 0;
    this._dirty = true;
  }

  /**
   * Copies indices from another buffer.
   *
   * @param source - Source buffer to copy from
   * @param sourceStart - Start index in source buffer (default: 0)
   * @param destStart - Start index in destination buffer (default: 0)
   * @param count - Number of indices to copy (default: all)
   *
   * @example
   * ```typescript
   * const indices1 = new IndexBuffer(100);
   * const indices2 = new IndexBuffer(100);
   * indices2.copyFrom(indices1);
   * ```
   */
  copyFrom(
    source: IndexBuffer,
    sourceStart: number = 0,
    destStart: number = 0,
    count: number = source.indexCount
  ): void {
    const actualCount = Math.min(count, source.indexCount - sourceStart, this.indexCount - destStart);

    for (let i = 0; i < actualCount; i++) {
      const value = source._data[sourceStart + i];
      this._data[destStart + i] = value;
      this._minIndex = Math.min(this._minIndex, value);
      this._maxIndex = Math.max(this._maxIndex, value);
    }

    this._dirty = true;
  }

  /**
   * Recomputes the min/max index range.
   * Call this after manual data modifications.
   *
   * @example
   * ```typescript
   * indices.data[0] = 5;
   * indices.recomputeRange();
   * ```
   */
  recomputeRange(): void {
    this._minIndex = Number.MAX_SAFE_INTEGER;
    this._maxIndex = 0;

    for (let i = 0; i < this.indexCount; i++) {
      const value = this._data[i];
      this._minIndex = Math.min(this._minIndex, value);
      this._maxIndex = Math.max(this._maxIndex, value);
    }
  }

  /**
   * Creates an index buffer from an array of index data.
   *
   * @param indices - Array of indices
   * @param indexType - Index data type (auto-detected if not specified)
   * @param topology - Primitive topology (default: TriangleList)
   * @returns New index buffer
   *
   * @example
   * ```typescript
   * const indices = IndexBuffer.fromArray([0, 1, 2, 0, 2, 3]);
   * ```
   */
  static fromArray(
    indices: number[],
    indexType?: IndexType,
    topology: PrimitiveTopology = PrimitiveTopology.TriangleList
  ): IndexBuffer {
    // Auto-detect index type if not specified
    if (!indexType) {
      const maxIndex = Math.max(...indices);
      indexType = maxIndex <= 65535 ? IndexType.UInt16 : IndexType.UInt32;
    }

    const buffer = new IndexBuffer(indices.length, indexType, BufferUsage.Static, topology);
    buffer.setIndices(0, indices);
    return buffer;
  }

  /**
   * Converts 16-bit indices to 32-bit.
   * Returns a new buffer if conversion is needed.
   *
   * @returns New 32-bit index buffer or this buffer if already 32-bit
   *
   * @example
   * ```typescript
   * const indices16 = new IndexBuffer(100, IndexType.UInt16);
   * const indices32 = indices16.to32Bit();
   * ```
   */
  to32Bit(): IndexBuffer {
    if (this.indexType === IndexType.UInt32) {
      return this;
    }

    const buffer32 = new IndexBuffer(this.indexCount, IndexType.UInt32, this.usage, this.topology);
    for (let i = 0; i < this.indexCount; i++) {
      buffer32._data[i] = this._data[i];
    }
    buffer32._minIndex = this._minIndex;
    buffer32._maxIndex = this._maxIndex;
    buffer32._dirty = this._dirty;

    return buffer32;
  }
}
