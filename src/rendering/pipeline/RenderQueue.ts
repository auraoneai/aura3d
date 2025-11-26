/**
 * Render queue for sorting and batching draw calls.
 * Implements front-to-back sorting for opaques, back-to-front for transparents,
 * and state change minimization for optimal rendering performance.
 *
 * @module RenderQueue
 */

import { DrawCall } from './DrawCall';
import { PipelineState } from './PipelineState';
import { Logger } from '../../core/Logger';

const logger = Logger.create('RenderQueue');

/**
 * Render queue type determines sorting strategy.
 */
export enum RenderQueueType {
  /** Opaque geometry - sorted front-to-back for early-z optimization */
  Opaque = 0,
  /** Transparent geometry - sorted back-to-front for correct blending */
  Transparent = 1,
  /** Overlay/UI - no sorting, rendered in submission order */
  Overlay = 2,
}

/**
 * Render queue entry containing draw call and associated state.
 * Stores all information needed to execute a draw command.
 */
export interface RenderQueueEntry {
  /** Draw call descriptor */
  drawCall: DrawCall;
  /** Pipeline state */
  pipelineState: PipelineState;
  /** Shader program (GPU-specific) */
  shaderProgram: unknown;
  /** Material ID for batching */
  materialId: number;
  /** Depth from camera (for sorting) */
  depth: number;
  /** Sort key (computed from state) */
  sortKey: bigint;
}

/**
 * Render queue for collecting, sorting, and executing draw calls.
 * Optimizes rendering by minimizing state changes and sorting by depth.
 *
 * The queue uses a 64-bit sort key encoding multiple factors:
 * - Bits 63-56: Queue type priority
 * - Bits 55-48: Pipeline state hash (high byte)
 * - Bits 47-32: Material ID
 * - Bits 31-16: Shader program ID
 * - Bits 15-0: Depth (quantized)
 *
 * This enables efficient sorting that minimizes:
 * 1. Render queue transitions
 * 2. Pipeline state changes (most expensive)
 * 3. Material changes
 * 4. Shader changes
 * 5. Depth order (front-to-back or back-to-front)
 *
 * @example
 * ```typescript
 * const queue = new RenderQueue(RenderQueueType.Opaque);
 *
 * // Submit draw calls
 * queue.submit(drawCall1, pipelineState1, shader1, material1, depth1);
 * queue.submit(drawCall2, pipelineState2, shader2, material2, depth2);
 *
 * // Sort for optimal rendering
 * queue.sort();
 *
 * // Execute all draw calls
 * queue.forEach((entry) => {
 *   // Bind pipeline state, shader, material
 *   // Execute draw call
 * });
 *
 * // Clear for next frame
 * queue.clear();
 * ```
 */
export class RenderQueue {
  /** Queue type (determines sorting strategy) */
  private _type: RenderQueueType;

  /** Queue entries */
  private _entries: RenderQueueEntry[] = [];

  /** Whether the queue is sorted */
  private _sorted: boolean = false;

  /** Statistics */
  private _stats = {
    drawCallCount: 0,
    triangleCount: 0,
    instanceCount: 0,
    stateChanges: 0,
    shaderChanges: 0,
    materialChanges: 0,
  };

  /**
   * Creates a new render queue.
   *
   * @param type - Queue type (determines sorting strategy)
   */
  constructor(type: RenderQueueType) {
    this._type = type;
  }

  /**
   * Gets the queue type.
   */
  get type(): RenderQueueType {
    return this._type;
  }

  /**
   * Gets the number of entries in the queue.
   */
  get length(): number {
    return this._entries.length;
  }

  /**
   * Checks if the queue is empty.
   */
  get isEmpty(): boolean {
    return this._entries.length === 0;
  }

  /**
   * Gets queue statistics.
   */
  get stats(): Readonly<typeof this._stats> {
    return this._stats;
  }

  /**
   * Submits a draw call to the queue.
   *
   * @param drawCall - Draw call descriptor
   * @param pipelineState - Pipeline state
   * @param shaderProgram - Shader program
   * @param materialId - Material ID for batching
   * @param depth - Depth from camera (for sorting)
   *
   * @example
   * ```typescript
   * queue.submit(drawCall, pipelineState, shader, materialId, depth);
   * ```
   */
  submit(
    drawCall: DrawCall,
    pipelineState: PipelineState,
    shaderProgram: unknown,
    materialId: number,
    depth: number
  ): void {
    // Compute sort key
    const sortKey = this.computeSortKey(pipelineState, shaderProgram, materialId, depth);

    // Create entry
    const entry: RenderQueueEntry = {
      drawCall,
      pipelineState,
      shaderProgram,
      materialId,
      depth,
      sortKey,
    };

    this._entries.push(entry);
    this._sorted = false;
  }

  /**
   * Computes a 64-bit sort key from state components.
   * Higher bits have higher priority in sorting.
   *
   * @param pipelineState - Pipeline state
   * @param shaderProgram - Shader program
   * @param materialId - Material ID
   * @param depth - Depth value
   * @returns 64-bit sort key
   */
  private computeSortKey(
    pipelineState: PipelineState,
    shaderProgram: unknown,
    materialId: number,
    depth: number
  ): bigint {
    // Queue type priority (bits 63-56)
    const queuePriority = BigInt(this._type) << 56n;

    // Pipeline state hash (bits 55-48) - use high byte for variety
    const stateHash = BigInt((pipelineState.hash >>> 24) & 0xFF) << 48n;

    // Material ID (bits 47-32)
    const materialBits = BigInt(materialId & 0xFFFF) << 32n;

    // Shader program ID (bits 31-16)
    // Use memory address as ID (hash the pointer)
    const shaderHash = this.hashPointer(shaderProgram);
    const shaderBits = BigInt(shaderHash & 0xFFFF) << 16n;

    // Depth (bits 15-0)
    // Quantize depth to 16-bit unsigned int
    let depthBits: bigint;
    if (this._type === RenderQueueType.Transparent) {
      // Back-to-front: larger depth = higher priority
      const quantized = Math.floor((1.0 - Math.max(0, Math.min(1, depth))) * 65535);
      depthBits = BigInt(quantized & 0xFFFF);
    } else if (this._type === RenderQueueType.Opaque) {
      // Front-to-back: smaller depth = higher priority
      const quantized = Math.floor(Math.max(0, Math.min(1, depth)) * 65535);
      depthBits = BigInt(quantized & 0xFFFF);
    } else {
      // Overlay: no depth sorting
      depthBits = 0n;
    }

    return queuePriority | stateHash | materialBits | shaderBits | depthBits;
  }

  /**
   * Hashes a pointer/object reference to a number.
   * Simple hash based on object identity.
   *
   * @param obj - Object to hash
   * @returns Hash value
   */
  private hashPointer(obj: unknown): number {
    if (obj === null || obj === undefined) {
      return 0;
    }
    // Use object's toString as a simple hash source
    const str = String(obj);
    let hash = 0;
    for (let i = 0; i < Math.min(str.length, 32); i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0; // Convert to 32-bit integer
    }
    return hash >>> 0;
  }

  /**
   * Sorts the queue entries by their sort keys.
   * Call this before iterating over entries to ensure optimal order.
   *
   * @example
   * ```typescript
   * queue.sort();
   * ```
   */
  sort(): void {
    if (this._sorted || this._entries.length === 0) {
      return;
    }

    // Sort by sort key (ascending order)
    // For transparent queue, we negate depth so back-to-front works correctly
    this._entries.sort((a, b) => {
      if (a.sortKey < b.sortKey) return -1;
      if (a.sortKey > b.sortKey) return 1;
      return 0;
    });

    this._sorted = true;
  }

  /**
   * Iterates over all queue entries in sorted order.
   * Automatically sorts if not already sorted.
   *
   * @param callback - Function to call for each entry
   *
   * @example
   * ```typescript
   * queue.forEach((entry) => {
   *   // Bind pipeline state
   *   // Bind shader
   *   // Bind material
   *   // Execute draw call
   * });
   * ```
   */
  forEach(callback: (entry: RenderQueueEntry, index: number) => void): void {
    this.sort();
    for (let i = 0; i < this._entries.length; i++) {
      callback(this._entries[i], i);
    }
  }

  /**
   * Gets an entry by index.
   * Returns undefined if index is out of bounds.
   *
   * @param index - Entry index
   * @returns Queue entry or undefined
   */
  getEntry(index: number): RenderQueueEntry | undefined {
    return this._entries[index];
  }

  /**
   * Computes rendering statistics.
   * Counts state changes, draw calls, triangles, etc.
   * Should be called after sorting.
   */
  computeStats(): void {
    this.sort();

    this._stats.drawCallCount = this._entries.length;
    this._stats.triangleCount = 0;
    this._stats.instanceCount = 0;
    this._stats.stateChanges = 0;
    this._stats.shaderChanges = 0;
    this._stats.materialChanges = 0;

    let lastStateHash = -1;
    let lastShader: unknown = null;
    let lastMaterial = -1;

    for (const entry of this._entries) {
      const dc = entry.drawCall;

      // Count triangles
      if (dc.isIndexed()) {
        this._stats.triangleCount += Math.floor(dc.indexCount / 3) * dc.instanceCount;
      } else {
        this._stats.triangleCount += Math.floor(dc.vertexCount / 3) * dc.instanceCount;
      }

      // Count instances
      this._stats.instanceCount += dc.instanceCount;

      // Count state changes
      if (entry.pipelineState.hash !== lastStateHash) {
        this._stats.stateChanges++;
        lastStateHash = entry.pipelineState.hash;
      }

      // Count shader changes
      if (entry.shaderProgram !== lastShader) {
        this._stats.shaderChanges++;
        lastShader = entry.shaderProgram;
      }

      // Count material changes
      if (entry.materialId !== lastMaterial) {
        this._stats.materialChanges++;
        lastMaterial = entry.materialId;
      }
    }
  }

  /**
   * Clears all entries from the queue.
   * Draw calls are NOT automatically released - caller is responsible.
   *
   * @example
   * ```typescript
   * // Release draw calls before clearing
   * queue.forEach((entry) => {
   *   DrawCall.release(entry.drawCall);
   * });
   * queue.clear();
   * ```
   */
  clear(): void {
    this._entries.length = 0;
    this._sorted = false;
    this._stats.drawCallCount = 0;
    this._stats.triangleCount = 0;
    this._stats.instanceCount = 0;
    this._stats.stateChanges = 0;
    this._stats.shaderChanges = 0;
    this._stats.materialChanges = 0;
  }

  /**
   * Clears and releases all draw calls back to the pool.
   * Convenient method for cleanup.
   *
   * @example
   * ```typescript
   * queue.clearAndRelease();
   * ```
   */
  clearAndRelease(): void {
    for (const entry of this._entries) {
      DrawCall.release(entry.drawCall);
    }
    this.clear();
  }

  /**
   * Merges another queue into this queue.
   * Used for combining multiple render passes or layers.
   *
   * @param other - Queue to merge from
   *
   * @example
   * ```typescript
   * const combinedQueue = new RenderQueue(RenderQueueType.Opaque);
   * combinedQueue.merge(staticQueue);
   * combinedQueue.merge(dynamicQueue);
   * combinedQueue.sort();
   * ```
   */
  merge(other: RenderQueue): void {
    this._entries.push(...other._entries);
    this._sorted = false;
  }

  /**
   * Logs queue statistics to console.
   * Useful for debugging and performance analysis.
   */
  logStats(): void {
    this.computeStats();
    logger.info(
      `RenderQueue (${RenderQueueType[this._type]}): ` +
      `${this._stats.drawCallCount} draws, ` +
      `${this._stats.triangleCount} tris, ` +
      `${this._stats.instanceCount} instances, ` +
      `${this._stats.stateChanges} state changes, ` +
      `${this._stats.shaderChanges} shader changes, ` +
      `${this._stats.materialChanges} material changes`
    );
  }

  /**
   * Creates an opaque render queue.
   * Sorted front-to-back for early-z optimization.
   */
  static createOpaqueQueue(): RenderQueue {
    return new RenderQueue(RenderQueueType.Opaque);
  }

  /**
   * Creates a transparent render queue.
   * Sorted back-to-front for correct alpha blending.
   */
  static createTransparentQueue(): RenderQueue {
    return new RenderQueue(RenderQueueType.Transparent);
  }

  /**
   * Creates an overlay/UI render queue.
   * No sorting, rendered in submission order.
   */
  static createOverlayQueue(): RenderQueue {
    return new RenderQueue(RenderQueueType.Overlay);
  }
}
