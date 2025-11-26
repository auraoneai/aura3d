/**
 * Draw call representation for G3D rendering engine.
 * Encapsulates all data needed to execute a single GPU draw command including
 * instancing, indirect drawing, and buffer bindings.
 *
 * @module DrawCall
 */

import { ObjectPool } from '../../core/ObjectPool';
import { Logger } from '../../core/Logger';

const logger = Logger.create('DrawCall');

/**
 * Primitive topology for draw calls.
 * Defines how vertices are assembled into primitives.
 */
export enum PrimitiveTopology {
  PointList = 0,
  LineList = 1,
  LineStrip = 2,
  TriangleList = 3,
  TriangleStrip = 4,
  TriangleFan = 5,
}

/**
 * Index buffer format.
 */
export enum IndexFormat {
  UInt16 = 0,
  UInt32 = 1,
}

/**
 * Vertex buffer binding descriptor.
 * Associates a buffer with a binding slot and stride.
 *
 * @example
 * ```typescript
 * const binding: VertexBufferBinding = {
 *   buffer: positionBuffer,
 *   offset: 0,
 *   stride: 12, // 3 floats * 4 bytes
 *   slot: 0,
 * };
 * ```
 */
export interface VertexBufferBinding {
  /** Buffer object (GPU-specific, e.g., WebGLBuffer or GPUBuffer) */
  buffer: unknown;
  /** Byte offset into the buffer */
  offset: number;
  /** Byte stride between consecutive vertices */
  stride: number;
  /** Binding slot index */
  slot: number;
}

/**
 * Index buffer binding descriptor.
 *
 * @example
 * ```typescript
 * const indexBinding: IndexBufferBinding = {
 *   buffer: indexBuffer,
 *   offset: 0,
 *   format: IndexFormat.UInt16,
 * };
 * ```
 */
export interface IndexBufferBinding {
  /** Buffer object (GPU-specific) */
  buffer: unknown;
  /** Byte offset into the buffer */
  offset: number;
  /** Index format (16-bit or 32-bit) */
  format: IndexFormat;
}

/**
 * Indirect draw arguments buffer.
 * Contains draw parameters stored in GPU memory for indirect drawing.
 *
 * Buffer layout for non-indexed draws:
 * - uint32 vertexCount
 * - uint32 instanceCount
 * - uint32 firstVertex
 * - uint32 firstInstance
 *
 * Buffer layout for indexed draws:
 * - uint32 indexCount
 * - uint32 instanceCount
 * - uint32 firstIndex
 * - int32 baseVertex
 * - uint32 firstInstance
 *
 * @example
 * ```typescript
 * const indirectArgs: IndirectDrawBuffer = {
 *   buffer: argsBuffer,
 *   offset: 0,
 * };
 * ```
 */
export interface IndirectDrawBuffer {
  /** Buffer containing draw arguments */
  buffer: unknown;
  /** Byte offset into the buffer */
  offset: number;
}

/**
 * Draw call descriptor for rendering primitives.
 * Represents a single draw command with all associated state and bindings.
 *
 * Supports multiple drawing modes:
 * - Direct indexed/non-indexed drawing
 * - Instanced drawing
 * - Indirect drawing (GPU-driven)
 *
 * DrawCall objects are pooled to avoid allocations during rendering.
 * Use DrawCall.acquire() to get a pooled instance and release() to return it.
 *
 * @example
 * ```typescript
 * // Direct indexed draw
 * const drawCall = DrawCall.acquire();
 * drawCall.topology = PrimitiveTopology.TriangleList;
 * drawCall.indexCount = 36;
 * drawCall.firstIndex = 0;
 * drawCall.baseVertex = 0;
 * drawCall.instanceCount = 1;
 * drawCall.firstInstance = 0;
 * drawCall.setIndexBuffer(indexBuffer, 0, IndexFormat.UInt16);
 * drawCall.setVertexBuffer(0, positionBuffer, 0, 12);
 *
 * // Instanced draw
 * const instancedDraw = DrawCall.acquire();
 * instancedDraw.topology = PrimitiveTopology.TriangleList;
 * instancedDraw.indexCount = 36;
 * instancedDraw.instanceCount = 100;
 * instancedDraw.setIndexBuffer(indexBuffer, 0, IndexFormat.UInt16);
 * instancedDraw.setVertexBuffer(0, positionBuffer, 0, 12);
 * instancedDraw.setVertexBuffer(1, instanceDataBuffer, 0, 64);
 *
 * // Indirect draw
 * const indirectDraw = DrawCall.acquire();
 * indirectDraw.topology = PrimitiveTopology.TriangleList;
 * indirectDraw.setIndexBuffer(indexBuffer, 0, IndexFormat.UInt16);
 * indirectDraw.setVertexBuffer(0, positionBuffer, 0, 12);
 * indirectDraw.setIndirectBuffer(argsBuffer, 0);
 * ```
 */
export class DrawCall {
  /** Primitive topology */
  topology: PrimitiveTopology = PrimitiveTopology.TriangleList;

  /** Number of vertices to draw (non-indexed) */
  vertexCount: number = 0;

  /** Offset to first vertex (non-indexed) */
  firstVertex: number = 0;

  /** Number of indices to draw (indexed) */
  indexCount: number = 0;

  /** Offset to first index (indexed) */
  firstIndex: number = 0;

  /** Offset added to vertex index before indexing into vertex buffer */
  baseVertex: number = 0;

  /** Number of instances to draw */
  instanceCount: number = 1;

  /** Offset to first instance */
  firstInstance: number = 0;

  /** Index buffer binding (null for non-indexed draws) */
  private _indexBuffer: IndexBufferBinding | null = null;

  /** Vertex buffer bindings (up to 16 slots) */
  private _vertexBuffers: (VertexBufferBinding | null)[] = new Array(16).fill(null);

  /** Indirect draw buffer (null for direct draws) */
  private _indirectBuffer: IndirectDrawBuffer | null = null;

  /** User data for sorting and custom logic */
  userData: unknown = null;

  /** Sort key for render queue ordering (computed externally) */
  sortKey: number = 0;

  /**
   * Creates a new draw call.
   * Prefer using DrawCall.acquire() for pooled instances.
   */
  constructor() {
    // Initialized with default values
  }

  /**
   * Gets the index buffer binding.
   */
  get indexBuffer(): IndexBufferBinding | null {
    return this._indexBuffer;
  }

  /**
   * Gets vertex buffer binding at the specified slot.
   *
   * @param slot - Vertex buffer slot (0-15)
   * @returns Vertex buffer binding or null
   */
  getVertexBuffer(slot: number): VertexBufferBinding | null {
    if (slot < 0 || slot >= 16) {
      logger.warn(`Invalid vertex buffer slot: ${slot}`);
      return null;
    }
    return this._vertexBuffers[slot];
  }

  /**
   * Gets all vertex buffer bindings.
   *
   * @returns Array of vertex buffer bindings (may contain nulls)
   */
  getVertexBuffers(): readonly (VertexBufferBinding | null)[] {
    return this._vertexBuffers;
  }

  /**
   * Gets the indirect draw buffer.
   */
  get indirectBuffer(): IndirectDrawBuffer | null {
    return this._indirectBuffer;
  }

  /**
   * Sets the index buffer binding.
   *
   * @param buffer - Index buffer object
   * @param offset - Byte offset into the buffer
   * @param format - Index format (16-bit or 32-bit)
   *
   * @example
   * ```typescript
   * drawCall.setIndexBuffer(indexBuffer, 0, IndexFormat.UInt16);
   * ```
   */
  setIndexBuffer(buffer: unknown, offset: number, format: IndexFormat): void {
    this._indexBuffer = { buffer, offset, format };
  }

  /**
   * Sets a vertex buffer binding at the specified slot.
   *
   * @param slot - Vertex buffer slot (0-15)
   * @param buffer - Vertex buffer object
   * @param offset - Byte offset into the buffer
   * @param stride - Byte stride between consecutive vertices
   *
   * @example
   * ```typescript
   * // Position buffer at slot 0
   * drawCall.setVertexBuffer(0, positionBuffer, 0, 12);
   * // Normal buffer at slot 1
   * drawCall.setVertexBuffer(1, normalBuffer, 0, 12);
   * // UV buffer at slot 2
   * drawCall.setVertexBuffer(2, uvBuffer, 0, 8);
   * ```
   */
  setVertexBuffer(slot: number, buffer: unknown, offset: number, stride: number): void {
    if (slot < 0 || slot >= 16) {
      logger.warn(`Invalid vertex buffer slot: ${slot}`);
      return;
    }
    this._vertexBuffers[slot] = { buffer, offset, stride, slot };
  }

  /**
   * Clears the index buffer binding.
   */
  clearIndexBuffer(): void {
    this._indexBuffer = null;
  }

  /**
   * Clears a vertex buffer binding at the specified slot.
   *
   * @param slot - Vertex buffer slot (0-15)
   */
  clearVertexBuffer(slot: number): void {
    if (slot < 0 || slot >= 16) {
      logger.warn(`Invalid vertex buffer slot: ${slot}`);
      return;
    }
    this._vertexBuffers[slot] = null;
  }

  /**
   * Clears all vertex buffer bindings.
   */
  clearAllVertexBuffers(): void {
    this._vertexBuffers.fill(null);
  }

  /**
   * Sets the indirect draw buffer.
   *
   * @param buffer - Buffer containing draw arguments
   * @param offset - Byte offset into the buffer
   *
   * @example
   * ```typescript
   * drawCall.setIndirectBuffer(argsBuffer, 0);
   * ```
   */
  setIndirectBuffer(buffer: unknown, offset: number): void {
    this._indirectBuffer = { buffer, offset };
  }

  /**
   * Clears the indirect draw buffer.
   */
  clearIndirectBuffer(): void {
    this._indirectBuffer = null;
  }

  /**
   * Checks if this is an indexed draw call.
   */
  isIndexed(): boolean {
    return this._indexBuffer !== null;
  }

  /**
   * Checks if this is an instanced draw call.
   */
  isInstanced(): boolean {
    return this.instanceCount > 1;
  }

  /**
   * Checks if this is an indirect draw call.
   */
  isIndirect(): boolean {
    return this._indirectBuffer !== null;
  }

  /**
   * Resets the draw call to default state.
   * Called automatically when releasing to pool.
   */
  reset(): void {
    this.topology = PrimitiveTopology.TriangleList;
    this.vertexCount = 0;
    this.firstVertex = 0;
    this.indexCount = 0;
    this.firstIndex = 0;
    this.baseVertex = 0;
    this.instanceCount = 1;
    this.firstInstance = 0;
    this._indexBuffer = null;
    this._vertexBuffers.fill(null);
    this._indirectBuffer = null;
    this.userData = null;
    this.sortKey = 0;
  }

  /**
   * Clones this draw call to a new instance.
   *
   * @returns New draw call with same parameters
   */
  clone(): DrawCall {
    const clone = new DrawCall();
    clone.topology = this.topology;
    clone.vertexCount = this.vertexCount;
    clone.firstVertex = this.firstVertex;
    clone.indexCount = this.indexCount;
    clone.firstIndex = this.firstIndex;
    clone.baseVertex = this.baseVertex;
    clone.instanceCount = this.instanceCount;
    clone.firstInstance = this.firstInstance;
    clone._indexBuffer = this._indexBuffer ? { ...this._indexBuffer } : null;
    clone._indirectBuffer = this._indirectBuffer ? { ...this._indirectBuffer } : null;
    clone.userData = this.userData;
    clone.sortKey = this.sortKey;

    // Clone vertex buffers
    for (let i = 0; i < 16; i++) {
      const vb = this._vertexBuffers[i];
      clone._vertexBuffers[i] = vb ? { ...vb } : null;
    }

    return clone;
  }

  /**
   * Object pool for draw calls.
   * Reuses draw call instances to avoid allocations during rendering.
   */
  private static pool = new ObjectPool<DrawCall>(
    () => new DrawCall(),
    (dc) => dc.reset(),
    32, // Initial size
    512 // Max size
  );

  /**
   * Acquires a draw call from the pool.
   * Must be released with release() when done.
   *
   * @returns Pooled draw call instance
   *
   * @example
   * ```typescript
   * const drawCall = DrawCall.acquire();
   * drawCall.topology = PrimitiveTopology.TriangleList;
   * drawCall.indexCount = 36;
   * // ... configure draw call
   * // ... submit to render queue
   * DrawCall.release(drawCall);
   * ```
   */
  static acquire(): DrawCall {
    return DrawCall.pool.acquire();
  }

  /**
   * Releases a draw call back to the pool.
   * The draw call should not be used after release.
   *
   * @param drawCall - Draw call to release
   *
   * @example
   * ```typescript
   * const drawCall = DrawCall.acquire();
   * // ... use draw call
   * DrawCall.release(drawCall);
   * ```
   */
  static release(drawCall: DrawCall): void {
    DrawCall.pool.release(drawCall);
  }

  /**
   * Gets pool statistics for monitoring and debugging.
   *
   * @returns Object with pool statistics
   */
  static getPoolStats(): {
    pooled: number;
    active: number;
    total: number;
    highWaterMark: number;
  } {
    return {
      pooled: DrawCall.pool.pooledCount,
      active: DrawCall.pool.activeCount,
      total: DrawCall.pool.totalCreated,
      highWaterMark: DrawCall.pool.highWaterMark,
    };
  }

  /**
   * Prewarms the draw call pool.
   * Creates the specified number of draw calls and adds them to the pool.
   *
   * @param count - Number of draw calls to prewarm
   */
  static prewarm(count: number): void {
    DrawCall.pool.prewarm(count);
  }
}
