/**
 * @fileoverview Delta compression for state snapshots.
 * Reduces bandwidth by sending only changed values.
 * @module net/replication/DeltaCompression
 */

import { NetworkId } from '../NetworkEntity';
import { StateSnapshot } from './StateSnapshot';
import { Logger } from '../../core/Logger';

const logger = Logger.create('DeltaCompression');

/**
 * Delta snapshot containing only changed values.
 */
export interface DeltaSnapshot {
  /** Network ID */
  networkId: NetworkId;
  /** Current timestamp */
  timestamp: number;
  /** Base snapshot timestamp */
  baseTimestamp: number;
  /** Changed properties */
  changes: Map<string, any>;
}

/**
 * Delta compression statistics.
 */
export interface DeltaCompressionStats {
  /** Total deltas created */
  deltasCreated: number;
  /** Total deltas applied */
  deltasApplied: number;
  /** Average compression ratio (delta size / full size) */
  averageCompressionRatio: number;
  /** Total bytes saved */
  bytesSaved: number;
}

/**
 * Delta compressor for state snapshots.
 * Reduces bandwidth by transmitting only changed state values.
 *
 * @example
 * ```typescript
 * const compressor = new DeltaCompressor();
 *
 * // Create delta
 * const delta = compressor.createDelta(oldSnapshot, newSnapshot);
 * console.log(`Changes: ${delta.changes.size} properties`);
 *
 * // Serialize delta
 * const buffer = compressor.serializeDelta(delta);
 * console.log(`Delta size: ${buffer.byteLength} bytes`);
 *
 * // Deserialize delta
 * const receivedDelta = compressor.deserializeDelta(buffer);
 *
 * // Apply delta
 * const reconstructed = compressor.applyDelta(oldSnapshot, receivedDelta);
 * ```
 */
export class DeltaCompressor {
  private stats: DeltaCompressionStats = {
    deltasCreated: 0,
    deltasApplied: 0,
    averageCompressionRatio: 1.0,
    bytesSaved: 0,
  };

  /**
   * Creates a delta snapshot between two snapshots.
   *
   * @param baseSnapshot - Base snapshot (previous state)
   * @param currentSnapshot - Current snapshot (new state)
   * @returns Delta snapshot containing only changes
   *
   * @example
   * ```typescript
   * const delta = compressor.createDelta(previousSnapshot, currentSnapshot);
   * ```
   */
  createDelta(baseSnapshot: StateSnapshot, currentSnapshot: StateSnapshot): DeltaSnapshot {
    const changes = new Map<string, any>();

    // Find all changed properties
    for (const [key, newValue] of currentSnapshot.state) {
      const oldValue = baseSnapshot.state.get(key);

      if (!this.areEqual(oldValue, newValue)) {
        changes.set(key, newValue);
      }
    }

    // Check for removed properties
    for (const key of baseSnapshot.state.keys()) {
      if (!currentSnapshot.state.has(key)) {
        changes.set(key, undefined); // Mark as removed
      }
    }

    const delta: DeltaSnapshot = {
      networkId: currentSnapshot.networkId,
      timestamp: currentSnapshot.timestamp,
      baseTimestamp: baseSnapshot.timestamp,
      changes,
    };

    this.stats.deltasCreated++;

    return delta;
  }

  /**
   * Applies a delta to a base snapshot to reconstruct the full state.
   *
   * @param baseSnapshot - Base snapshot
   * @param delta - Delta to apply
   * @returns Reconstructed snapshot
   *
   * @example
   * ```typescript
   * const reconstructed = compressor.applyDelta(baseSnapshot, receivedDelta);
   * ```
   */
  applyDelta(baseSnapshot: StateSnapshot, delta: DeltaSnapshot): StateSnapshot {
    const reconstructed: StateSnapshot = {
      timestamp: delta.timestamp,
      networkId: delta.networkId,
      state: new Map(baseSnapshot.state),
    };

    // Apply changes
    for (const [key, value] of delta.changes) {
      if (value === undefined) {
        // Property was removed
        reconstructed.state.delete(key);
      } else {
        reconstructed.state.set(key, value);
      }
    }

    this.stats.deltasApplied++;

    return reconstructed;
  }

  /**
   * Serializes a delta snapshot to binary format.
   *
   * @param delta - Delta to serialize
   * @returns Serialized delta
   *
   * @example
   * ```typescript
   * const buffer = compressor.serializeDelta(delta);
   * transport.send(buffer);
   * ```
   */
  serializeDelta(delta: DeltaSnapshot): ArrayBuffer {
    // Estimate size
    const estimatedSize = this.estimateDeltaSize(delta);
    const buffer = new ArrayBuffer(estimatedSize);
    const view = new DataView(buffer);

    let offset = 0;

    // Write network ID (4 bytes)
    view.setUint32(offset, delta.networkId, true);
    offset += 4;

    // Write current timestamp (8 bytes)
    view.setFloat64(offset, delta.timestamp, true);
    offset += 8;

    // Write base timestamp (8 bytes)
    view.setFloat64(offset, delta.baseTimestamp, true);
    offset += 8;

    // Write change count (2 bytes)
    view.setUint16(offset, delta.changes.size, true);
    offset += 2;

    // Write changes
    const encoder = new TextEncoder();
    for (const [key, value] of delta.changes) {
      // Write key
      const keyBytes = encoder.encode(key);
      view.setUint8(offset, keyBytes.length);
      offset += 1;
      new Uint8Array(buffer, offset).set(keyBytes);
      offset += keyBytes.length;

      // Write value
      offset += this.serializeValue(value, view, offset);
    }

    // Update statistics
    const fullSize = this.estimateFullSnapshotSize(delta);
    const deltaSize = offset;
    const ratio = deltaSize / Math.max(fullSize, 1);
    this.stats.averageCompressionRatio =
      this.stats.averageCompressionRatio * 0.9 + ratio * 0.1;
    this.stats.bytesSaved += fullSize - deltaSize;

    return buffer.slice(0, offset);
  }

  /**
   * Deserializes a delta snapshot from binary format.
   *
   * @param buffer - Serialized delta
   * @returns Deserialized delta
   *
   * @example
   * ```typescript
   * const delta = compressor.deserializeDelta(receivedBuffer);
   * ```
   */
  deserializeDelta(buffer: ArrayBuffer): DeltaSnapshot {
    const view = new DataView(buffer);
    let offset = 0;

    // Read network ID
    const networkId = view.getUint32(offset, true);
    offset += 4;

    // Read current timestamp
    const timestamp = view.getFloat64(offset, true);
    offset += 8;

    // Read base timestamp
    const baseTimestamp = view.getFloat64(offset, true);
    offset += 8;

    // Read change count
    const changeCount = view.getUint16(offset, true);
    offset += 2;

    // Read changes
    const changes = new Map<string, any>();
    const decoder = new TextDecoder();

    for (let i = 0; i < changeCount; i++) {
      // Read key
      const keyLength = view.getUint8(offset);
      offset += 1;
      const keyBytes = new Uint8Array(buffer, offset, keyLength);
      const key = decoder.decode(keyBytes);
      offset += keyLength;

      // Read value
      const [value, bytesRead] = this.deserializeValue(view, offset);
      offset += bytesRead;

      changes.set(key, value);
    }

    return {
      networkId,
      timestamp,
      baseTimestamp,
      changes,
    };
  }

  /**
   * Serializes a value with type information.
   */
  private serializeValue(value: any, view: DataView, offset: number): number {
    const startOffset = offset;

    if (value === undefined) {
      // Type: undefined (removed)
      view.setUint8(offset, 0);
      offset += 1;
    } else if (value === null) {
      // Type: null
      view.setUint8(offset, 1);
      offset += 1;
    } else if (typeof value === 'number') {
      // Type: number
      view.setUint8(offset, 2);
      offset += 1;
      view.setFloat64(offset, value, true);
      offset += 8;
    } else if (typeof value === 'boolean') {
      // Type: boolean
      view.setUint8(offset, 3);
      offset += 1;
      view.setUint8(offset, value ? 1 : 0);
      offset += 1;
    } else if (typeof value === 'string') {
      // Type: string
      view.setUint8(offset, 4);
      offset += 1;
      const encoder = new TextEncoder();
      const bytes = encoder.encode(value);
      view.setUint16(offset, bytes.length, true);
      offset += 2;
      new Uint8Array(view.buffer, offset).set(bytes);
      offset += bytes.length;
    } else if (Array.isArray(value)) {
      // Type: array
      view.setUint8(offset, 5);
      offset += 1;
      view.setUint16(offset, value.length, true);
      offset += 2;
      for (const item of value) {
        offset += this.serializeValue(item, view, offset);
      }
    } else {
      // Unknown type - serialize as null
      view.setUint8(offset, 1);
      offset += 1;
      logger.warn('Unknown value type in delta serialization', { value });
    }

    return offset - startOffset;
  }

  /**
   * Deserializes a value with type information.
   */
  private deserializeValue(view: DataView, offset: number): [any, number] {
    const startOffset = offset;

    const type = view.getUint8(offset);
    offset += 1;

    let value: any;

    switch (type) {
      case 0: // undefined
        value = undefined;
        break;

      case 1: // null
        value = null;
        break;

      case 2: // number
        value = view.getFloat64(offset, true);
        offset += 8;
        break;

      case 3: // boolean
        value = view.getUint8(offset) !== 0;
        offset += 1;
        break;

      case 4: // string
        {
          const length = view.getUint16(offset, true);
          offset += 2;
          const decoder = new TextDecoder();
          const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
          value = decoder.decode(bytes);
          offset += length;
        }
        break;

      case 5: // array
        {
          const length = view.getUint16(offset, true);
          offset += 2;
          value = [];
          for (let i = 0; i < length; i++) {
            const [item, bytesRead] = this.deserializeValue(view, offset);
            value.push(item);
            offset += bytesRead;
          }
        }
        break;

      default:
        value = null;
        logger.warn('Unknown type in delta deserialization', { type });
    }

    return [value, offset - startOffset];
  }

  /**
   * Checks if two values are equal.
   */
  private areEqual(a: any, b: any): boolean {
    if (a === b) {
      return true;
    }

    if (a === null || b === null || a === undefined || b === undefined) {
      return a === b;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        return false;
      }
      for (let i = 0; i < a.length; i++) {
        if (!this.areEqual(a[i], b[i])) {
          return false;
        }
      }
      return true;
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);

      if (keysA.length !== keysB.length) {
        return false;
      }

      for (const key of keysA) {
        if (!this.areEqual(a[key], b[key])) {
          return false;
        }
      }

      return true;
    }

    return false;
  }

  /**
   * Estimates the size of a delta in bytes.
   */
  private estimateDeltaSize(delta: DeltaSnapshot): number {
    let size = 4 + 8 + 8 + 2; // networkId + timestamp + baseTimestamp + changeCount

    for (const [key, value] of delta.changes) {
      size += 1 + key.length; // key length + key
      size += this.estimateValueSize(value);
    }

    return size;
  }

  /**
   * Estimates the size of a value in bytes.
   */
  private estimateValueSize(value: any): number {
    if (value === undefined || value === null) {
      return 1;
    }

    if (typeof value === 'number') {
      return 1 + 8;
    }

    if (typeof value === 'boolean') {
      return 1 + 1;
    }

    if (typeof value === 'string') {
      return 1 + 2 + value.length;
    }

    if (Array.isArray(value)) {
      let size = 1 + 2; // type + length
      for (const item of value) {
        size += this.estimateValueSize(item);
      }
      return size;
    }

    return 1;
  }

  /**
   * Estimates the full snapshot size for a delta.
   */
  private estimateFullSnapshotSize(delta: DeltaSnapshot): number {
    // Rough estimate: assume delta contains half the properties
    return this.estimateDeltaSize(delta) * 2;
  }

  /**
   * Gets compression statistics.
   * @returns Statistics
   */
  getStats(): Readonly<DeltaCompressionStats> {
    return { ...this.stats };
  }

  /**
   * Resets statistics.
   */
  resetStats(): void {
    this.stats = {
      deltasCreated: 0,
      deltasApplied: 0,
      averageCompressionRatio: 1.0,
      bytesSaved: 0,
    };
  }
}
