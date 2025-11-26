/**
 * @fileoverview State synchronization system with delta compression and prediction.
 * Provides efficient state replication with interpolation and extrapolation.
 * @module net/StateSync
 */

import { Logger } from '../core/Logger';
import { NetworkId } from './NetworkEntity';
import { NetworkBinarySerializer as BinarySerializer } from './NetworkMessage';

const logger = Logger.create('StateSync');

/**
 * Snapshot of entity state at a specific time.
 */
export interface StateSnapshot {
  /** Snapshot timestamp */
  timestamp: number;
  /** Network entity ID */
  networkId: NetworkId;
  /** State data (component values) */
  state: Map<string, any>;
}

/**
 * Delta-compressed state update.
 */
export interface StateDelta {
  /** Base snapshot timestamp */
  baseTimestamp: number;
  /** Current timestamp */
  timestamp: number;
  /** Network entity ID */
  networkId: NetworkId;
  /** Changed fields only */
  changes: Map<string, any>;
}

/**
 * Snapshot buffer for storing entity state history.
 * Used for interpolation and delta compression.
 *
 * @example
 * ```typescript
 * const buffer = new SnapshotBuffer(10);
 *
 * // Add snapshots
 * buffer.add({
 *   timestamp: 1000,
 *   networkId: 42,
 *   state: new Map([['x', 10], ['y', 20]]),
 * });
 *
 * // Get snapshot at time
 * const snapshot = buffer.getAtTime(1000);
 *
 * // Interpolate between snapshots
 * const interpolated = buffer.interpolate(1005, ['x', 'y']);
 * ```
 */
export class SnapshotBuffer {
  /** Stored snapshots (oldest first) */
  private snapshots: StateSnapshot[] = [];

  /** Maximum number of snapshots to keep */
  private readonly maxSnapshots: number;

  /**
   * Creates a new snapshot buffer.
   * @param maxSnapshots - Maximum snapshots to store (default: 10)
   */
  constructor(maxSnapshots: number = 10) {
    this.maxSnapshots = maxSnapshots;
  }

  /**
   * Adds a snapshot to the buffer.
   * Maintains chronological order and removes old snapshots.
   *
   * @param snapshot - Snapshot to add
   *
   * @example
   * ```typescript
   * buffer.add({
   *   timestamp: Date.now(),
   *   networkId: 42,
   *   state: new Map([['x', 100], ['y', 200], ['z', 0]]),
   * });
   * ```
   */
  add(snapshot: StateSnapshot): void {
    // Find insertion point
    let insertIndex = this.snapshots.length;
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      if (snapshot.timestamp >= this.snapshots[i].timestamp) {
        break;
      }
      insertIndex = i;
    }

    this.snapshots.splice(insertIndex, 0, snapshot);

    // Remove old snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  /**
   * Gets snapshot at exact time.
   * @param timestamp - Timestamp to query
   * @returns Snapshot or undefined
   */
  getAtTime(timestamp: number): StateSnapshot | undefined {
    for (const snapshot of this.snapshots) {
      if (snapshot.timestamp === timestamp) {
        return snapshot;
      }
    }
    return undefined;
  }

  /**
   * Gets the two snapshots surrounding a time.
   * @param timestamp - Timestamp to query
   * @returns [before, after] or undefined if not found
   */
  getSurrounding(timestamp: number): [StateSnapshot, StateSnapshot] | undefined {
    let before: StateSnapshot | undefined;
    let after: StateSnapshot | undefined;

    for (let i = 0; i < this.snapshots.length; i++) {
      const snapshot = this.snapshots[i];

      if (snapshot.timestamp <= timestamp) {
        before = snapshot;
      } else if (snapshot.timestamp > timestamp) {
        after = snapshot;
        break;
      }
    }

    if (before && after) {
      return [before, after];
    }

    return undefined;
  }

  /**
   * Interpolates state between snapshots.
   *
   * @param timestamp - Time to interpolate at
   * @param fields - Fields to interpolate
   * @returns Interpolated state or undefined
   *
   * @example
   * ```typescript
   * // Interpolate position at t=1005
   * const state = buffer.interpolate(1005, ['x', 'y', 'z']);
   * if (state) {
   *   console.log(`Position: ${state.get('x')}, ${state.get('y')}, ${state.get('z')}`);
   * }
   * ```
   */
  interpolate(timestamp: number, fields: string[]): Map<string, any> | undefined {
    const surrounding = this.getSurrounding(timestamp);
    if (!surrounding) {
      // Use most recent snapshot
      const latest = this.getLatest();
      return latest?.state;
    }

    const [before, after] = surrounding;
    const totalTime = after.timestamp - before.timestamp;
    const elapsed = timestamp - before.timestamp;
    const t = totalTime > 0 ? elapsed / totalTime : 0;

    const interpolated = new Map<string, any>();

    for (const field of fields) {
      const beforeValue = before.state.get(field);
      const afterValue = after.state.get(field);

      if (beforeValue === undefined || afterValue === undefined) {
        continue;
      }

      // Interpolate based on type
      if (typeof beforeValue === 'number' && typeof afterValue === 'number') {
        interpolated.set(field, beforeValue + (afterValue - beforeValue) * t);
      } else {
        // Non-numeric values use latest
        interpolated.set(field, afterValue);
      }
    }

    return interpolated;
  }

  /**
   * Gets the latest snapshot.
   * @returns Latest snapshot or undefined
   */
  getLatest(): StateSnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  /**
   * Gets the oldest snapshot.
   * @returns Oldest snapshot or undefined
   */
  getOldest(): StateSnapshot | undefined {
    return this.snapshots[0];
  }

  /**
   * Removes snapshots older than a timestamp.
   * @param timestamp - Cutoff timestamp
   * @returns Number of snapshots removed
   */
  removeOlderThan(timestamp: number): number {
    let removeCount = 0;
    while (this.snapshots.length > 0 && this.snapshots[0].timestamp < timestamp) {
      this.snapshots.shift();
      removeCount++;
    }
    return removeCount;
  }

  /**
   * Gets the number of stored snapshots.
   * @returns Snapshot count
   */
  get size(): number {
    return this.snapshots.length;
  }

  /**
   * Clears all snapshots.
   */
  clear(): void {
    this.snapshots.length = 0;
  }
}

/**
 * Delta compressor for efficient state updates.
 * Only sends changed fields instead of full snapshots.
 *
 * @example
 * ```typescript
 * const compressor = new DeltaCompressor();
 *
 * const snapshot1 = { timestamp: 1000, networkId: 42, state: new Map([['x', 10], ['y', 20]]) };
 * const snapshot2 = { timestamp: 1016, networkId: 42, state: new Map([['x', 15], ['y', 20]]) };
 *
 * const delta = compressor.createDelta(snapshot1, snapshot2);
 * // delta.changes only contains { x: 15 } since y didn't change
 *
 * const reconstructed = compressor.applyDelta(snapshot1, delta);
 * ```
 */
export class DeltaCompressor {
  /**
   * Creates a delta from two snapshots.
   *
   * @param base - Base snapshot
   * @param current - Current snapshot
   * @returns Delta containing only changed fields
   *
   * @example
   * ```typescript
   * const delta = compressor.createDelta(oldSnapshot, newSnapshot);
   * ```
   */
  createDelta(base: StateSnapshot, current: StateSnapshot): StateDelta {
    const changes = new Map<string, any>();

    // Find changed fields
    for (const [key, value] of current.state) {
      const baseValue = base.state.get(key);

      if (baseValue === undefined || !this.valuesEqual(baseValue, value)) {
        changes.set(key, value);
      }
    }

    // Check for removed fields
    for (const key of base.state.keys()) {
      if (!current.state.has(key)) {
        changes.set(key, undefined);
      }
    }

    return {
      baseTimestamp: base.timestamp,
      timestamp: current.timestamp,
      networkId: current.networkId,
      changes,
    };
  }

  /**
   * Applies a delta to a base snapshot.
   *
   * @param base - Base snapshot
   * @param delta - Delta to apply
   * @returns New snapshot with delta applied
   *
   * @example
   * ```typescript
   * const updated = compressor.applyDelta(baseSnapshot, receivedDelta);
   * ```
   */
  applyDelta(base: StateSnapshot, delta: StateDelta): StateSnapshot {
    const state = new Map(base.state);

    for (const [key, value] of delta.changes) {
      if (value === undefined) {
        state.delete(key);
      } else {
        state.set(key, value);
      }
    }

    return {
      timestamp: delta.timestamp,
      networkId: delta.networkId,
      state,
    };
  }

  /**
   * Checks if two values are equal.
   */
  private valuesEqual(a: any, b: any): boolean {
    if (a === b) {
      return true;
    }

    if (typeof a === 'number' && typeof b === 'number') {
      // Use epsilon for float comparison
      return Math.abs(a - b) < 0.0001;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        return false;
      }
      for (let i = 0; i < a.length; i++) {
        if (!this.valuesEqual(a[i], b[i])) {
          return false;
        }
      }
      return true;
    }

    return false;
  }

  /**
   * Serializes a delta to binary format.
   * @param delta - Delta to serialize
   * @returns Serialized data
   */
  serializeDelta(delta: StateDelta): ArrayBuffer {
    // Estimate size
    let size = 4 + 4 + 4 + 2; // baseTimestamp + timestamp + networkId + changeCount
    for (const [key, value] of delta.changes) {
      size += 2 + key.length; // key length + key
      size += this.estimateValueSize(value);
    }

    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    let offset = 0;

    // Write header
    view.setUint32(offset, delta.baseTimestamp, true);
    offset += 4;
    view.setUint32(offset, delta.timestamp, true);
    offset += 4;
    view.setUint32(offset, delta.networkId, true);
    offset += 4;
    view.setUint16(offset, delta.changes.size, true);
    offset += 2;

    // Write changes
    for (const [key, value] of delta.changes) {
      offset += BinarySerializer.writeString(view, offset, key);
      offset += this.writeValue(view, offset, value);
    }

    return buffer.slice(0, offset);
  }

  /**
   * Deserializes a delta from binary format.
   * @param buffer - Buffer containing serialized delta
   * @returns Deserialized delta
   */
  deserializeDelta(buffer: ArrayBuffer): StateDelta {
    const view = new DataView(buffer);
    let offset = 0;

    // Read header
    const baseTimestamp = view.getUint32(offset, true);
    offset += 4;
    const timestamp = view.getUint32(offset, true);
    offset += 4;
    const networkId = view.getUint32(offset, true);
    offset += 4;
    const changeCount = view.getUint16(offset, true);
    offset += 2;

    // Read changes
    const changes = new Map<string, any>();
    for (let i = 0; i < changeCount; i++) {
      const [key, keyBytes] = BinarySerializer.readString(view, offset);
      offset += keyBytes;

      const [value, valueBytes] = this.readValue(view, offset);
      offset += valueBytes;

      changes.set(key, value);
    }

    return { baseTimestamp, timestamp, networkId, changes };
  }

  /**
   * Estimates the size of a value in bytes.
   */
  private estimateValueSize(value: any): number {
    if (value === undefined || value === null) {
      return 1;
    }
    if (typeof value === 'number') {
      return 9; // type(1) + float64(8)
    }
    if (typeof value === 'string') {
      return 3 + value.length; // type(1) + length(2) + bytes
    }
    if (Array.isArray(value)) {
      return 3 + value.length * 8; // type(1) + length(2) + items
    }
    return 100; // Default estimate
  }

  /**
   * Writes a value to a DataView.
   */
  private writeValue(view: DataView, offset: number, value: any): number {
    const startOffset = offset;

    if (value === undefined || value === null) {
      view.setUint8(offset, 0); // Type: null
      return 1;
    }

    if (typeof value === 'number') {
      view.setUint8(offset, 1); // Type: number
      offset += 1;
      view.setFloat64(offset, value, true);
      return 9;
    }

    if (typeof value === 'string') {
      view.setUint8(offset, 2); // Type: string
      offset += 1;
      const written = BinarySerializer.writeString(view, offset, value);
      return 1 + written;
    }

    if (Array.isArray(value)) {
      view.setUint8(offset, 3); // Type: array
      offset += 1;
      view.setUint16(offset, value.length, true);
      offset += 2;

      for (const item of value) {
        if (typeof item === 'number') {
          view.setFloat32(offset, item, true);
          offset += 4;
        }
      }

      return offset - startOffset;
    }

    // Unknown type
    view.setUint8(offset, 0);
    return 1;
  }

  /**
   * Reads a value from a DataView.
   */
  private readValue(view: DataView, offset: number): [any, number] {
    const startOffset = offset;
    const type = view.getUint8(offset);
    offset += 1;

    switch (type) {
      case 0: // null
        return [undefined, 1];

      case 1: // number
        {
          const value = view.getFloat64(offset, true);
          return [value, 9];
        }

      case 2: // string
        {
          const [value, bytes] = BinarySerializer.readString(view, offset);
          return [value, 1 + bytes];
        }

      case 3: // array
        {
          const length = view.getUint16(offset, true);
          offset += 2;

          const arr: number[] = [];
          for (let i = 0; i < length; i++) {
            arr.push(view.getFloat32(offset, true));
            offset += 4;
          }

          return [arr, offset - startOffset];
        }

      default:
        return [undefined, 1];
    }
  }
}

/**
 * State predictor for client-side prediction.
 * Extrapolates entity state forward in time.
 *
 * @example
 * ```typescript
 * const predictor = new StatePredictor();
 *
 * // Predict future state
 * const predicted = predictor.predict(
 *   lastSnapshot,
 *   deltaTime,
 *   ['x', 'y', 'z'],
 *   new Map([['vx', 10], ['vy', 0], ['vz', 5]])
 * );
 * ```
 */
export class StatePredictor {
  /**
   * Predicts future state using velocity.
   *
   * @param snapshot - Current snapshot
   * @param deltaTime - Time to predict forward (seconds)
   * @param positionFields - Position field names
   * @param velocities - Velocity values
   * @returns Predicted state
   *
   * @example
   * ```typescript
   * const predicted = predictor.predict(
   *   currentSnapshot,
   *   0.016,
   *   ['x', 'y', 'z'],
   *   new Map([['vx', 100], ['vy', 0], ['vz', 50]])
   * );
   * ```
   */
  predict(
    snapshot: StateSnapshot,
    deltaTime: number,
    positionFields: string[],
    velocities: Map<string, number>
  ): StateSnapshot {
    const predictedState = new Map(snapshot.state);

    // Apply velocity to position fields
    for (const field of positionFields) {
      const position = snapshot.state.get(field);
      const velocityKey = 'v' + field; // e.g., 'vx' for 'x'
      const velocity = velocities.get(velocityKey);

      if (typeof position === 'number' && typeof velocity === 'number') {
        predictedState.set(field, position + velocity * deltaTime);
      }
    }

    return {
      timestamp: snapshot.timestamp + deltaTime * 1000,
      networkId: snapshot.networkId,
      state: predictedState,
    };
  }

  /**
   * Predicts using acceleration.
   *
   * @param snapshot - Current snapshot
   * @param deltaTime - Time to predict forward (seconds)
   * @param positionFields - Position field names
   * @param velocities - Current velocities
   * @param accelerations - Accelerations
   * @returns Predicted state with updated velocities
   */
  predictWithAcceleration(
    snapshot: StateSnapshot,
    deltaTime: number,
    positionFields: string[],
    velocities: Map<string, number>,
    accelerations: Map<string, number>
  ): { snapshot: StateSnapshot; velocities: Map<string, number> } {
    const predictedState = new Map(snapshot.state);
    const newVelocities = new Map(velocities);

    for (const field of positionFields) {
      const position = snapshot.state.get(field);
      const velocityKey = 'v' + field;
      const accelKey = 'a' + field;

      const velocity = velocities.get(velocityKey) ?? 0;
      const accel = accelerations.get(accelKey) ?? 0;

      if (typeof position === 'number') {
        // Update velocity: v = v0 + a*t
        const newVelocity = velocity + accel * deltaTime;
        newVelocities.set(velocityKey, newVelocity);

        // Update position: x = x0 + v*t + 0.5*a*t^2
        const newPosition = position + velocity * deltaTime + 0.5 * accel * deltaTime * deltaTime;
        predictedState.set(field, newPosition);
      }
    }

    return {
      snapshot: {
        timestamp: snapshot.timestamp + deltaTime * 1000,
        networkId: snapshot.networkId,
        state: predictedState,
      },
      velocities: newVelocities,
    };
  }
}
