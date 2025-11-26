/**
 * @module Rendering/Core
 * @description
 * Per-frame transient GPU resources for G3D 5.0 engine.
 * Manages ring-buffered uniform data to avoid GPU stalls.
 */

import { Logger } from '../core/Logger';
import { RenderDevice } from './RenderDevice';
import { BufferUsage } from './gpu/GPUDevice';

const logger = Logger.create('FrameResources');

/**
 * Configuration for frame resources.
 */
export interface FrameResourcesConfig {
  /** Number of buffered frames (2 or 3 typically) */
  frameCount?: number;
  /** Size of uniform buffer ring in bytes */
  uniformBufferSize?: number;
  /** Minimum alignment for uniform buffers */
  uniformAlignment?: number;
}

/**
 * Uniform allocation from the ring buffer.
 */
export interface UniformAllocation {
  /** GPU buffer */
  buffer: any;
  /** Offset in bytes */
  offset: number;
  /** Size in bytes */
  size: number;
}

/**
 * Ring buffer for frame-specific resources.
 */
interface RingBuffer {
  /** GPU buffer */
  buffer: any;
  /** Current write offset */
  offset: number;
  /** Total size */
  size: number;
  /** Frame index when buffer was created */
  frameIndex: number;
}

/**
 * Per-frame transient GPU resources manager.
 * Provides ring-buffered uniform data with double/triple buffering to avoid GPU stalls.
 *
 * @example
 * ```typescript
 * const frameResources = new FrameResources();
 * frameResources.initialize(device, {
 *   frameCount: 3,
 *   uniformBufferSize: 4 * 1024 * 1024, // 4 MB
 *   uniformAlignment: 256,
 * });
 *
 * // Each frame
 * frameResources.beginFrame();
 *
 * // Allocate uniform buffer space
 * const uniformBuffer = frameResources.getUniformBuffer(256);
 * device.writeBuffer(uniformBuffer, 0, uniformData);
 *
 * // Get dynamic offset for bind group
 * const allocation = frameResources.getDynamicOffset(256, 256);
 * device.writeBuffer(allocation.buffer, allocation.offset, dynamicData);
 *
 * frameResources.endFrame();
 * ```
 */
export class FrameResources {
  /**
   * GPU device.
   */
  private _device: RenderDevice | null = null;

  /**
   * Configuration.
   */
  private _config: Required<FrameResourcesConfig> = {
    frameCount: 3,
    uniformBufferSize: 4 * 1024 * 1024, // 4 MB
    uniformAlignment: 256,
  };

  /**
   * Ring buffers for each frame.
   */
  private _ringBuffers: RingBuffer[] = [];

  /**
   * Current frame index.
   */
  private _frameIndex: number = 0;

  /**
   * Current ring buffer index.
   */
  private _currentRingIndex: number = 0;

  /**
   * Current uniform buffer write offset.
   */
  private _uniformOffset: number = 0;

  /**
   * Whether we're within a frame.
   */
  private _inFrame: boolean = false;

  /**
   * Total bytes allocated this frame.
   */
  private _allocatedThisFrame: number = 0;

  /**
   * Peak allocation across all frames.
   */
  private _peakAllocation: number = 0;

  /**
   * Number of overflow warnings issued.
   */
  private _overflowWarnings: number = 0;

  /**
   * Whether the frame resources are initialized.
   */
  private _initialized: boolean = false;

  /**
   * Creates a new FrameResources instance.
   *
   * @example
   * ```typescript
   * const frameResources = new FrameResources();
   * ```
   */
  constructor() {
    logger.debug('FrameResources created');
  }

  /**
   * Initializes frame resources with a device.
   *
   * @param device - GPU device
   * @param config - Configuration (optional)
   *
   * @example
   * ```typescript
   * frameResources.initialize(device, {
   *   frameCount: 2,
   *   uniformBufferSize: 2 * 1024 * 1024,
   * });
   * ```
   */
  initialize(device: RenderDevice, config: FrameResourcesConfig = {}): void {
    if (this._initialized) {
      logger.warn('FrameResources already initialized');
      return;
    }

    this._device = device;
    this._config = {
      frameCount: config.frameCount ?? 3,
      uniformBufferSize: config.uniformBufferSize ?? 4 * 1024 * 1024,
      uniformAlignment: config.uniformAlignment ?? 256,
    };

    // Validate configuration
    if (this._config.frameCount < 2 || this._config.frameCount > 4) {
      logger.warn('frameCount should be 2-4, clamping');
      this._config.frameCount = Math.max(2, Math.min(4, this._config.frameCount));
    }

    if (this._config.uniformBufferSize < 64 * 1024) {
      logger.warn('uniformBufferSize too small, using 64 KB minimum');
      this._config.uniformBufferSize = 64 * 1024;
    }

    // Get device capabilities for alignment
    const caps = device.getCapabilities();
    const minAlignment = 256; // Most GPUs require 256-byte alignment for dynamic offsets
    if (this._config.uniformAlignment < minAlignment) {
      this._config.uniformAlignment = minAlignment;
    }

    // Create ring buffers
    for (let i = 0; i < this._config.frameCount; i++) {
      const buffer = device.createBuffer({
        size: this._config.uniformBufferSize,
        usage: BufferUsage.Uniform | BufferUsage.CopyDst,
        label: `FrameResources_Ring${i}`,
      });

      this._ringBuffers.push({
        buffer,
        offset: 0,
        size: this._config.uniformBufferSize,
        frameIndex: -1,
      });

      logger.debug(`Created ring buffer ${i}: ${this._config.uniformBufferSize} bytes`);
    }

    this._initialized = true;

    logger.info(
      `FrameResources initialized: ${this._config.frameCount} frames, ` +
        `${this._config.uniformBufferSize / 1024} KB per frame, ` +
        `${this._config.uniformAlignment} byte alignment`
    );
  }

  /**
   * Begins a new frame, cycling to the next ring buffer.
   * Must be called at the start of each frame.
   *
   * @example
   * ```typescript
   * frameResources.beginFrame();
   * ```
   */
  beginFrame(): void {
    if (!this._initialized) {
      throw new Error('FrameResources not initialized');
    }

    if (this._inFrame) {
      logger.warn('beginFrame called while already in frame');
      this.endFrame();
    }

    // Cycle to next ring buffer
    this._currentRingIndex = (this._currentRingIndex + 1) % this._config.frameCount;
    const ring = this._ringBuffers[this._currentRingIndex]!;

    // Reset offset for this ring buffer
    ring.offset = 0;
    ring.frameIndex = this._frameIndex;

    this._uniformOffset = 0;
    this._allocatedThisFrame = 0;
    this._inFrame = true;

    logger.trace(`Begin frame ${this._frameIndex}, ring ${this._currentRingIndex}`);
  }

  /**
   * Ends the current frame.
   * Must be called at the end of each frame.
   *
   * @example
   * ```typescript
   * frameResources.endFrame();
   * ```
   */
  endFrame(): void {
    if (!this._inFrame) {
      logger.warn('endFrame called while not in frame');
      return;
    }

    // Update peak allocation
    if (this._allocatedThisFrame > this._peakAllocation) {
      this._peakAllocation = this._allocatedThisFrame;
      logger.debug(`New peak allocation: ${this._peakAllocation / 1024} KB`);
    }

    this._inFrame = false;
    this._frameIndex++;

    logger.trace(
      `End frame ${this._frameIndex - 1}, allocated ${this._allocatedThisFrame / 1024} KB`
    );
  }

  /**
   * Allocates space in the uniform buffer ring.
   * Returns a buffer that can be used for the current frame.
   *
   * @param size - Size in bytes
   * @returns GPU buffer
   *
   * @example
   * ```typescript
   * const buffer = frameResources.getUniformBuffer(256);
   * device.writeBuffer(buffer, 0, uniformData);
   * ```
   */
  getUniformBuffer(size: number): any {
    if (!this._inFrame) {
      throw new Error('getUniformBuffer called outside of frame');
    }

    // Align size
    const alignedSize = this._alignUp(size, this._config.uniformAlignment);

    const ring = this._ringBuffers[this._currentRingIndex]!;

    // Check if we have space
    if (ring.offset + alignedSize > ring.size) {
      this._handleOverflow(alignedSize);
      // After overflow handling, reset and try again
      ring.offset = 0;
    }

    this._allocatedThisFrame += alignedSize;

    return ring.buffer;
  }

  /**
   * Allocates space with dynamic offset for bind groups.
   * Returns buffer, offset, and size.
   *
   * @param alignment - Required alignment
   * @param size - Size in bytes
   * @returns Uniform allocation
   *
   * @example
   * ```typescript
   * const alloc = frameResources.getDynamicOffset(256, 256);
   * device.writeBuffer(alloc.buffer, alloc.offset, data);
   * // Use alloc.offset as dynamic offset in setBindGroup
   * ```
   */
  getDynamicOffset(alignment: number, size: number): UniformAllocation {
    if (!this._inFrame) {
      throw new Error('getDynamicOffset called outside of frame');
    }

    const ring = this._ringBuffers[this._currentRingIndex];

    // Align offset
    const alignedOffset = this._alignUp(ring.offset, alignment);
    const alignedSize = this._alignUp(size, alignment);

    // Check if we have space
    if (alignedOffset + alignedSize > ring.size) {
      this._handleOverflow(alignedSize);
      ring.offset = 0;
      return this.getDynamicOffset(alignment, size);
    }

    // Update ring offset
    ring.offset = alignedOffset + alignedSize;
    this._allocatedThisFrame += alignedSize;

    return {
      buffer: ring.buffer,
      offset: alignedOffset,
      size: alignedSize,
    };
  }

  /**
   * Resets all ring buffers.
   * Useful when switching scenes or major state changes.
   *
   * @example
   * ```typescript
   * frameResources.reset();
   * ```
   */
  reset(): void {
    if (!this._initialized) {
      return;
    }

    for (const ring of this._ringBuffers) {
      ring.offset = 0;
      ring.frameIndex = -1;
    }

    this._uniformOffset = 0;
    this._allocatedThisFrame = 0;
    this._frameIndex = 0;
    this._currentRingIndex = 0;
    this._inFrame = false;

    logger.info('FrameResources reset');
  }

  /**
   * Gets the current frame index.
   * @returns Frame index
   */
  get frameIndex(): number {
    return this._frameIndex;
  }

  /**
   * Gets the peak allocation in bytes.
   * @returns Peak allocation
   */
  get peakAllocation(): number {
    return this._peakAllocation;
  }

  /**
   * Gets the current allocation for this frame in bytes.
   * @returns Current allocation
   */
  get currentAllocation(): number {
    return this._allocatedThisFrame;
  }

  /**
   * Gets the total capacity in bytes.
   * @returns Capacity
   */
  get capacity(): number {
    return this._config.uniformBufferSize;
  }

  /**
   * Gets the utilization percentage for the current frame.
   * @returns Utilization (0-100)
   */
  get utilization(): number {
    return (this._allocatedThisFrame / this._config.uniformBufferSize) * 100;
  }

  /**
   * Gets statistics about frame resource usage.
   *
   * @returns Statistics object
   *
   * @example
   * ```typescript
   * const stats = frameResources.getStatistics();
   * console.log(`Peak: ${stats.peak / 1024} KB, Avg: ${stats.average / 1024} KB`);
   * ```
   */
  getStatistics(): {
    peak: number;
    current: number;
    capacity: number;
    utilization: number;
    frameCount: number;
  } {
    return {
      peak: this._peakAllocation,
      current: this._allocatedThisFrame,
      capacity: this._config.uniformBufferSize,
      utilization: this.utilization,
      frameCount: this._config.frameCount,
    };
  }

  /**
   * Checks if the frame resources are initialized.
   * @returns True if initialized
   */
  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Aligns a value up to the specified alignment.
   * @private
   */
  private _alignUp(value: number, alignment: number): number {
    return Math.ceil(value / alignment) * alignment;
  }

  /**
   * Handles buffer overflow by warning and resetting.
   * @private
   */
  private _handleOverflow(requestedSize: number): void {
    this._overflowWarnings++;

    if (this._overflowWarnings <= 5) {
      logger.warn(
        `Frame resources overflow! Requested ${requestedSize} bytes, ` +
          `but only ${this._config.uniformBufferSize - this._uniformOffset} remaining. ` +
          `Consider increasing uniformBufferSize. ` +
          `(Warning ${this._overflowWarnings}/5)`
      );
    } else if (this._overflowWarnings === 6) {
      logger.warn('Further overflow warnings will be suppressed');
    }
  }

  /**
   * Disposes of frame resources and releases GPU memory.
   *
   * @example
   * ```typescript
   * frameResources.dispose();
   * ```
   */
  dispose(): void {
    if (!this._initialized || !this._device) {
      return;
    }

    // Destroy all ring buffers
    for (const ring of this._ringBuffers) {
      this._device.destroy(ring.buffer);
    }

    this._ringBuffers = [];
    this._device = null;
    this._initialized = false;
    this._inFrame = false;

    logger.info('FrameResources disposed');
  }
}
