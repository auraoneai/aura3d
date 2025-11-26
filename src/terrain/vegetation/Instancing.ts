/**
 * Instance buffer management for efficient vegetation rendering.
 * Manages GPU instance buffers for massive vegetation rendering.
 * @module Instancing
 */

import { Matrix4 } from '../../math/Matrix4';
import { Vector3 } from '../../math/Vector3';
import { VegetationInstance } from '../Vegetation';
import { Logger } from '../../core/Logger';

const logger = Logger.create('Instancing');

/**
 * Instance buffer layout configuration.
 */
export interface InstanceBufferLayout {
  /** Bytes per instance */
  stride: number;
  /** Attribute layouts */
  attributes: Array<{
    name: string;
    offset: number;
    format: string;
    size: number;
  }>;
}

/**
 * Instance buffer manager for vegetation.
 * Manages GPU buffers for efficient instanced rendering.
 *
 * @example
 * ```typescript
 * const instancing = new InstanceBufferManager({
 *   maxInstances: 100000,
 *   updateFrequency: 'static' // or 'dynamic'
 * });
 *
 * // Update instances
 * instancing.updateInstances(vegetationInstances);
 *
 * // Get buffer for rendering
 * const buffer = instancing.getBuffer();
 * const count = instancing.getInstanceCount();
 * ```
 */
export class InstanceBufferManager {
  private _maxInstances: number;
  private _buffer: Float32Array | null;
  private _instanceCount: number;
  private _dirty: boolean;
  private _layout: InstanceBufferLayout;

  /**
   * Creates a new instance buffer manager.
   *
   * @param config - Buffer configuration
   */
  constructor(config: {
    maxInstances?: number;
    updateFrequency?: 'static' | 'dynamic';
  } = {}) {
    this._maxInstances = config.maxInstances ?? 100000;
    this._buffer = null;
    this._instanceCount = 0;
    this._dirty = false;

    // Define layout: transform (16) + color (4) + custom (4) = 24 floats per instance
    this._layout = {
      stride: 24 * 4, // 24 floats * 4 bytes
      attributes: [
        { name: 'instanceTransform', offset: 0, format: 'float32x16', size: 64 },
        { name: 'instanceColor', offset: 64, format: 'float32x4', size: 16 },
        { name: 'instanceCustom', offset: 80, format: 'float32x4', size: 16 },
      ],
    };

    this._allocateBuffer();

    logger.info(`Instance buffer manager created (max: ${this._maxInstances})`);
  }

  /**
   * Allocates the instance buffer.
   * @private
   */
  private _allocateBuffer(): void {
    const floatsPerInstance = this._layout.stride / 4;
    this._buffer = new Float32Array(this._maxInstances * floatsPerInstance);
  }

  /**
   * Updates instances from vegetation data.
   *
   * @param instances - Vegetation instances
   * @param startIndex - Start index in buffer
   * @returns Number of instances written
   */
  updateInstances(instances: VegetationInstance[], startIndex: number = 0): number {
    if (!this._buffer) return 0;

    const floatsPerInstance = this._layout.stride / 4;
    let count = 0;

    for (let i = 0; i < instances.length && (startIndex + i) < this._maxInstances; i++) {
      const inst = instances[i]!;
      const offset = (startIndex + i) * floatsPerInstance;

      // Transform matrix (16 floats)
      const matrix = Matrix4.compose(inst.position, inst.rotation, inst.scale);
      const matrixArray = matrix.toArray();
      this._buffer.set(matrixArray, offset);

      // Color (4 floats) - random variation
      const colorVar = 0.8 + Math.random() * 0.2;
      this._buffer[offset + 16] = colorVar;
      this._buffer[offset + 17] = colorVar;
      this._buffer[offset + 18] = colorVar;
      this._buffer[offset + 19] = 1.0;

      // Custom data (4 floats)
      this._buffer[offset + 20] = inst.seed;
      this._buffer[offset + 21] = inst.layer;
      this._buffer[offset + 22] = 0.0; // Reserved
      this._buffer[offset + 23] = 0.0; // Reserved

      count++;
    }

    this._instanceCount = startIndex + count;
    this._dirty = true;

    return count;
  }

  /**
   * Updates a single instance.
   *
   * @param index - Instance index
   * @param instance - Instance data
   */
  updateInstance(index: number, instance: VegetationInstance): void {
    if (!this._buffer || index >= this._maxInstances) return;

    const floatsPerInstance = this._layout.stride / 4;
    const offset = index * floatsPerInstance;

    // Transform matrix
    const matrix = Matrix4.compose(instance.position, instance.rotation, instance.scale);
    const matrixArray = matrix.toArray();
    this._buffer.set(matrixArray, offset);

    // Color
    const colorVar = 0.8 + Math.random() * 0.2;
    this._buffer[offset + 16] = colorVar;
    this._buffer[offset + 17] = colorVar;
    this._buffer[offset + 18] = colorVar;
    this._buffer[offset + 19] = 1.0;

    // Custom data
    this._buffer[offset + 20] = instance.seed;
    this._buffer[offset + 21] = instance.layer;
    this._buffer[offset + 22] = 0.0;
    this._buffer[offset + 23] = 0.0;

    this._dirty = true;
  }

  /**
   * Gets the instance buffer.
   * @returns Instance buffer
   */
  getBuffer(): Float32Array | null {
    return this._buffer;
  }

  /**
   * Gets the buffer layout.
   * @returns Buffer layout
   */
  getLayout(): InstanceBufferLayout {
    return this._layout;
  }

  /**
   * Gets the current instance count.
   * @returns Instance count
   */
  getInstanceCount(): number {
    return this._instanceCount;
  }

  /**
   * Gets the maximum instance capacity.
   * @returns Maximum instances
   */
  getMaxInstances(): number {
    return this._maxInstances;
  }

  /**
   * Checks if the buffer needs GPU upload.
   * @returns True if dirty
   */
  isDirty(): boolean {
    return this._dirty;
  }

  /**
   * Marks buffer as clean after GPU upload.
   */
  markClean(): void {
    this._dirty = false;
  }

  /**
   * Clears all instances.
   */
  clear(): void {
    this._instanceCount = 0;
    this._dirty = true;
  }

  /**
   * Resizes the buffer capacity.
   *
   * @param newMaxInstances - New maximum instance count
   */
  resize(newMaxInstances: number): void {
    if (newMaxInstances === this._maxInstances) return;

    const oldBuffer = this._buffer;
    const oldCount = this._instanceCount;

    this._maxInstances = newMaxInstances;
    this._allocateBuffer();

    // Copy old data if available
    if (oldBuffer && this._buffer) {
      const copyCount = Math.min(oldCount, newMaxInstances);
      const floatsPerInstance = this._layout.stride / 4;
      const copySize = copyCount * floatsPerInstance;

      this._buffer.set(oldBuffer.subarray(0, copySize));
      this._instanceCount = copyCount;
    }

    this._dirty = true;
    logger.info(`Resized instance buffer to ${newMaxInstances} instances`);
  }

  /**
   * Gets buffer memory usage.
   * @returns Memory usage in bytes
   */
  getMemoryUsage(): number {
    return this._buffer?.byteLength ?? 0;
  }
}
