/**
 * @module Rendering/GPU
 * @description
 * GPU buffer abstraction for vertex, index, uniform, and storage buffers.
 */

import { Logger } from '../../core/Logger';
import { BufferUsage } from './GPUDevice';

const logger = Logger.create('GPUBuffer');

/**
 * Buffer mapping mode for CPU access.
 */
export enum MapMode {
  /** Map for reading */
  Read = 'read',
  /** Map for writing */
  Write = 'write',
}

/**
 * Buffer type hints for optimization.
 */
export enum BufferType {
  /** Vertex attribute data */
  Vertex = 'vertex',
  /** Index data for indexed draws */
  Index = 'index',
  /** Uniform/constant data */
  Uniform = 'uniform',
  /** Storage buffer for compute */
  Storage = 'storage',
  /** Indirect draw arguments */
  Indirect = 'indirect',
  /** General-purpose buffer */
  Generic = 'generic',
}

/**
 * Memory hint for buffer optimization.
 */
export enum MemoryHint {
  /** Static data that rarely changes */
  Static = 'static',
  /** Dynamic data updated frequently (per frame) */
  Dynamic = 'dynamic',
  /** Streaming data updated every frame */
  Stream = 'stream',
}

/**
 * GPU buffer descriptor.
 */
export interface GPUBufferDescriptor {
  /** Size in bytes */
  size: number;
  /** Buffer usage flags */
  usage: BufferUsage;
  /** Buffer type hint */
  type?: BufferType;
  /** Memory hint for optimization */
  memoryHint?: MemoryHint;
  /** Initial data to upload */
  data?: ArrayBuffer | ArrayBufferView;
  /** Debug label */
  label?: string;
}

/**
 * Ring buffer segment tracking.
 */
interface RingBufferSegment {
  offset: number;
  size: number;
  frameIndex: number;
}

/**
 * Abstract GPU buffer interface.
 *
 * Provides efficient buffer management with support for:
 * - Vertex, index, uniform, and storage buffers
 * - Mapped memory access for CPU updates
 * - Ring buffer pattern for dynamic updates
 * - Zero-copy uploads where possible
 *
 * @example
 * ```typescript
 * // Create vertex buffer
 * const positions = new Float32Array([
 *   -1, -1, 0,
 *    1, -1, 0,
 *    0,  1, 0,
 * ]);
 *
 * const buffer = device.createBuffer({
 *   size: positions.byteLength,
 *   usage: BufferUsage.Vertex | BufferUsage.CopyDst,
 *   type: BufferType.Vertex,
 *   data: positions,
 *   label: 'TrianglePositions',
 * });
 *
 * // Update buffer
 * const newData = new Float32Array([...]);
 * buffer.write(newData);
 *
 * // Clean up
 * buffer.dispose();
 * ```
 */
export abstract class GPUBuffer {
  /** Unique buffer identifier */
  readonly id: number;
  /** Buffer size in bytes */
  readonly size: number;
  /** Buffer usage flags */
  readonly usage: BufferUsage;
  /** Buffer type hint */
  readonly type: BufferType;
  /** Memory hint */
  readonly memoryHint: MemoryHint;
  /** Debug label */
  readonly label?: string;

  protected disposed = false;
  protected mapped = false;
  protected mappedRange: { offset: number; size: number } | null = null;

  // Ring buffer state
  protected ringBufferEnabled = false;
  protected ringBufferSegments: RingBufferSegment[] = [];
  protected currentRingOffset = 0;
  protected frameIndex = 0;

  /**
   * Creates a GPU buffer.
   * @param id - Unique identifier
   * @param descriptor - Buffer descriptor
   */
  constructor(id: number, descriptor: GPUBufferDescriptor) {
    this.id = id;
    this.size = descriptor.size;
    this.usage = descriptor.usage;
    this.type = descriptor.type ?? BufferType.Generic;
    this.memoryHint = descriptor.memoryHint ?? MemoryHint.Static;
    this.label = descriptor.label;

    // Enable ring buffer for dynamic uniform buffers
    if (
      this.type === BufferType.Uniform &&
      this.memoryHint !== MemoryHint.Static
    ) {
      this.ringBufferEnabled = true;
    }

    if (descriptor.data) {
      this.writeInternal(descriptor.data, 0);
    }
  }

  /**
   * Writes data to the buffer.
   * @param data - Data to write
   * @param offset - Byte offset to write at (default: 0)
   *
   * @example
   * ```typescript
   * const data = new Float32Array([1, 2, 3, 4]);
   * buffer.write(data, 64); // Write at offset 64 bytes
   * ```
   */
  write(data: ArrayBuffer | ArrayBufferView, offset = 0): void {
    this.assertNotDisposed();

    if (this.mapped) {
      throw new Error('Cannot write to buffer while it is mapped');
    }

    const size = ArrayBuffer.isView(data) ? data.byteLength : data.byteLength;

    if (offset + size > this.size) {
      throw new Error(
        `Write would exceed buffer bounds: offset=${offset}, size=${size}, capacity=${this.size}`
      );
    }

    this.writeInternal(data, offset);
  }

  /**
   * Reads data from the buffer (requires MapRead usage).
   * @param offset - Byte offset to read from
   * @param size - Number of bytes to read
   * @returns Promise resolving to read data
   *
   * @example
   * ```typescript
   * const data = await buffer.read(0, 256);
   * const values = new Float32Array(data);
   * ```
   */
  async read(offset: number, size: number): Promise<ArrayBuffer> {
    this.assertNotDisposed();

    if (!(this.usage & BufferUsage.MapRead)) {
      throw new Error('Buffer must have MapRead usage to read data');
    }

    if (this.mapped) {
      throw new Error('Buffer is already mapped');
    }

    if (offset + size > this.size) {
      throw new Error('Read would exceed buffer bounds');
    }

    return this.readInternal(offset, size);
  }

  /**
   * Maps the buffer for CPU access.
   * @param mode - Mapping mode (read or write)
   * @param offset - Byte offset to map from (default: 0)
   * @param size - Number of bytes to map (default: entire buffer)
   * @returns Promise resolving to mapped ArrayBuffer
   *
   * @example
   * ```typescript
   * const mapped = await buffer.map(MapMode.Write);
   * const view = new Float32Array(mapped);
   * view[0] = 1.0;
   * view[1] = 2.0;
   * buffer.unmap();
   * ```
   */
  async map(
    mode: MapMode,
    offset = 0,
    size = this.size - offset
  ): Promise<ArrayBuffer> {
    this.assertNotDisposed();

    if (this.mapped) {
      throw new Error('Buffer is already mapped');
    }

    const requiredUsage =
      mode === MapMode.Read ? BufferUsage.MapRead : BufferUsage.MapWrite;

    if (!(this.usage & requiredUsage)) {
      throw new Error(
        `Buffer must have ${mode === MapMode.Read ? 'MapRead' : 'MapWrite'} usage`
      );
    }

    if (offset + size > this.size) {
      throw new Error('Mapped range would exceed buffer bounds');
    }

    this.mapped = true;
    this.mappedRange = { offset, size };

    return this.mapInternal(mode, offset, size);
  }

  /**
   * Unmaps the buffer, making CPU changes visible to GPU.
   *
   * @example
   * ```typescript
   * const mapped = await buffer.map(MapMode.Write);
   * // ... modify mapped data ...
   * buffer.unmap(); // Changes now visible to GPU
   * ```
   */
  unmap(): void {
    this.assertNotDisposed();

    if (!this.mapped) {
      logger.warn('Attempted to unmap buffer that is not mapped');
      return;
    }

    this.unmapInternal();
    this.mapped = false;
    this.mappedRange = null;
  }

  /**
   * Allocates space from the ring buffer for dynamic updates.
   * Automatically manages memory reuse across frames.
   *
   * @param size - Number of bytes to allocate
   * @returns Offset in buffer where data can be written
   *
   * @example
   * ```typescript
   * // In render loop
   * const offset = uniformBuffer.allocateRing(256);
   * uniformBuffer.write(matrixData, offset);
   * encoder.setBindGroup(0, bindGroup, [offset]);
   * ```
   */
  allocateRing(size: number): number {
    if (!this.ringBufferEnabled) {
      throw new Error('Ring buffer not enabled for this buffer');
    }

    this.assertNotDisposed();

    // Align to 256 bytes for uniform buffers
    const alignment = this.type === BufferType.Uniform ? 256 : 16;
    const alignedSize = Math.ceil(size / alignment) * alignment;

    // Check if we need to wrap around
    if (this.currentRingOffset + alignedSize > this.size) {
      this.currentRingOffset = 0;
    }

    // Clean up old segments from previous frames
    const frameThreshold = this.frameIndex - 3; // Keep 3 frames of history
    this.ringBufferSegments = this.ringBufferSegments.filter(
      (seg) => seg.frameIndex > frameThreshold
    );

    const offset = this.currentRingOffset;

    // Record segment
    this.ringBufferSegments.push({
      offset,
      size: alignedSize,
      frameIndex: this.frameIndex,
    });

    this.currentRingOffset += alignedSize;

    return offset;
  }

  /**
   * Advances the ring buffer frame counter.
   * Call this at the start of each frame.
   */
  advanceFrame(): void {
    if (this.ringBufferEnabled) {
      this.frameIndex++;
    }
  }

  /**
   * Gets the ring buffer utilization as a percentage.
   * @returns Utilization percentage (0-100)
   */
  getRingUtilization(): number {
    if (!this.ringBufferEnabled) {
      return 0;
    }
    return (this.currentRingOffset / this.size) * 100;
  }

  /**
   * Checks if the buffer is currently mapped.
   * @returns True if mapped
   */
  isMapped(): boolean {
    return this.mapped;
  }

  /**
   * Gets the currently mapped range, if any.
   * @returns Mapped range or null
   */
  getMappedRange(): { offset: number; size: number } | null {
    return this.mappedRange;
  }

  /**
   * Checks if the buffer has been disposed.
   * @returns True if disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Disposes of the buffer and frees GPU resources.
   */
  dispose(): void {
    if (this.disposed) {
      logger.warn(`Buffer ${this.label ?? this.id} already disposed`);
      return;
    }

    if (this.mapped) {
      this.unmap();
    }

    this.disposeInternal();
    this.disposed = true;

    logger.debug(`Buffer disposed: ${this.label ?? this.id}`);
  }

  /**
   * Asserts that the buffer has not been disposed.
   * @throws Error if disposed
   */
  protected assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error(
        `Buffer ${this.label ?? this.id} has been disposed and cannot be used`
      );
    }
  }

  /**
   * Backend-specific write implementation.
   * @param data - Data to write
   * @param offset - Byte offset
   */
  protected abstract writeInternal(
    data: ArrayBuffer | ArrayBufferView,
    offset: number
  ): void;

  /**
   * Backend-specific read implementation.
   * @param offset - Byte offset
   * @param size - Number of bytes
   * @returns Promise resolving to read data
   */
  protected abstract readInternal(
    offset: number,
    size: number
  ): Promise<ArrayBuffer>;

  /**
   * Backend-specific map implementation.
   * @param mode - Mapping mode
   * @param offset - Byte offset
   * @param size - Number of bytes
   * @returns Promise resolving to mapped buffer
   */
  protected abstract mapInternal(
    mode: MapMode,
    offset: number,
    size: number
  ): Promise<ArrayBuffer>;

  /**
   * Backend-specific unmap implementation.
   */
  protected abstract unmapInternal(): void;

  /**
   * Backend-specific dispose implementation.
   */
  protected abstract disposeInternal(): void;
}

/**
 * Helper class for managing uniform buffer layouts and offsets.
 *
 * @example
 * ```typescript
 * const layout = new UniformLayout();
 * const mvpOffset = layout.addMat4('modelViewProjection');
 * const colorOffset = layout.addVec4('color');
 * const timeOffset = layout.addFloat('time');
 *
 * const buffer = device.createBuffer({
 *   size: layout.getSize(),
 *   usage: BufferUsage.Uniform | BufferUsage.CopyDst,
 * });
 * ```
 */
export class UniformLayout {
  private currentOffset = 0;
  private uniforms: Map<string, { offset: number; size: number }> = new Map();

  /**
   * Adds a float uniform.
   * @param name - Uniform name
   * @returns Byte offset
   */
  addFloat(name: string): number {
    return this.addUniform(name, 4, 4);
  }

  /**
   * Adds a vec2 uniform.
   * @param name - Uniform name
   * @returns Byte offset
   */
  addVec2(name: string): number {
    return this.addUniform(name, 8, 8);
  }

  /**
   * Adds a vec3 uniform.
   * @param name - Uniform name
   * @returns Byte offset
   */
  addVec3(name: string): number {
    return this.addUniform(name, 12, 16); // vec3 has 16-byte alignment
  }

  /**
   * Adds a vec4 uniform.
   * @param name - Uniform name
   * @returns Byte offset
   */
  addVec4(name: string): number {
    return this.addUniform(name, 16, 16);
  }

  /**
   * Adds a mat3 uniform.
   * @param name - Uniform name
   * @returns Byte offset
   */
  addMat3(name: string): number {
    return this.addUniform(name, 48, 16); // 3 vec4s
  }

  /**
   * Adds a mat4 uniform.
   * @param name - Uniform name
   * @returns Byte offset
   */
  addMat4(name: string): number {
    return this.addUniform(name, 64, 16);
  }

  /**
   * Adds a custom-sized uniform.
   * @param name - Uniform name
   * @param size - Size in bytes
   * @param alignment - Alignment in bytes
   * @returns Byte offset
   */
  addUniform(name: string, size: number, alignment: number): number {
    // Align current offset
    const alignedOffset =
      Math.ceil(this.currentOffset / alignment) * alignment;

    this.uniforms.set(name, { offset: alignedOffset, size });
    this.currentOffset = alignedOffset + size;

    return alignedOffset;
  }

  /**
   * Gets the offset of a uniform.
   * @param name - Uniform name
   * @returns Byte offset or -1 if not found
   */
  getOffset(name: string): number {
    return this.uniforms.get(name)?.offset ?? -1;
  }

  /**
   * Gets the total size of the layout.
   * @returns Size in bytes (aligned to 256 for WebGPU)
   */
  getSize(): number {
    const size = this.currentOffset;
    return Math.ceil(size / 256) * 256;
  }

  /**
   * Resets the layout.
   */
  reset(): void {
    this.currentOffset = 0;
    this.uniforms.clear();
  }
}
