/**
 * @fileoverview State snapshot creation, application, and interpolation.
 * Handles entity state snapshots for network replication.
 * @module net/replication/StateSnapshot
 */

import { NetworkId } from '../NetworkEntity';
import { Logger } from '../../core/Logger';

const logger = Logger.create('StateSnapshot');

/**
 * State snapshot of an entity at a point in time.
 */
export interface StateSnapshot {
  /** Timestamp when snapshot was created */
  timestamp: number;
  /** Network ID of the entity */
  networkId: NetworkId;
  /** Entity state as key-value pairs */
  state: Map<string, any>;
}

/**
 * Snapshot buffer for storing historical snapshots.
 * Enables interpolation and rewinding for lag compensation.
 *
 * @example
 * ```typescript
 * const buffer = new SnapshotBuffer(30);
 *
 * // Add snapshots
 * buffer.add(snapshot1);
 * buffer.add(snapshot2);
 * buffer.add(snapshot3);
 *
 * // Get snapshot at specific time
 * const snapshot = buffer.getAtTime(targetTime);
 *
 * // Interpolate between snapshots
 * const interpolated = buffer.interpolate(renderTime, ['x', 'y', 'z']);
 * ```
 */
export class SnapshotBuffer {
  private buffer: StateSnapshot[] = [];
  private maxSize: number;

  /**
   * Creates a new snapshot buffer.
   *
   * @param maxSize - Maximum number of snapshots to store
   *
   * @example
   * ```typescript
   * const buffer = new SnapshotBuffer(60); // 60 snapshots (~1 second at 60fps)
   * ```
   */
  constructor(maxSize: number = 30) {
    this.maxSize = maxSize;
  }

  /**
   * Adds a snapshot to the buffer.
   *
   * @param snapshot - Snapshot to add
   *
   * @example
   * ```typescript
   * buffer.add({
   *   timestamp: Date.now(),
   *   networkId: 42,
   *   state: new Map([
   *     ['x', 10],
   *     ['y', 20],
   *     ['z', 30],
   *   ]),
   * });
   * ```
   */
  add(snapshot: StateSnapshot): void {
    // Insert in sorted order by timestamp
    let insertIndex = this.buffer.length;
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (snapshot.timestamp >= this.buffer[i].timestamp) {
        break;
      }
      insertIndex = i;
    }

    this.buffer.splice(insertIndex, 0, snapshot);

    // Remove oldest if over capacity
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /**
   * Gets a snapshot at or before a specific time.
   *
   * @param timestamp - Target timestamp
   * @returns Snapshot or null if buffer is empty
   *
   * @example
   * ```typescript
   * const snapshot = buffer.getAtTime(Date.now() - 100);
   * ```
   */
  getAtTime(timestamp: number): StateSnapshot | null {
    if (this.buffer.length === 0) {
      return null;
    }

    // Find snapshot at or before timestamp
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i].timestamp <= timestamp) {
        return this.buffer[i];
      }
    }

    // Return oldest if timestamp is before all snapshots
    return this.buffer[0];
  }

  /**
   * Gets the latest snapshot.
   * @returns Latest snapshot or null
   */
  getLatest(): StateSnapshot | null {
    if (this.buffer.length === 0) {
      return null;
    }
    return this.buffer[this.buffer.length - 1];
  }

  /**
   * Gets the oldest snapshot.
   * @returns Oldest snapshot or null
   */
  getOldest(): StateSnapshot | null {
    if (this.buffer.length === 0) {
      return null;
    }
    return this.buffer[0];
  }

  /**
   * Interpolates state between snapshots at a specific time.
   *
   * @param timestamp - Target timestamp for interpolation
   * @param properties - Properties to interpolate
   * @returns Interpolated state or null
   *
   * @example
   * ```typescript
   * // Interpolate position at render time
   * const state = buffer.interpolate(renderTime, ['x', 'y', 'z']);
   * if (state) {
   *   transform.position.set(state.get('x'), state.get('y'), state.get('z'));
   * }
   * ```
   */
  interpolate(timestamp: number, properties: string[]): Map<string, any> | null {
    if (this.buffer.length < 2) {
      // Need at least 2 snapshots to interpolate
      const latest = this.getLatest();
      return latest ? latest.state : null;
    }

    // Find snapshots to interpolate between
    let before: StateSnapshot | null = null;
    let after: StateSnapshot | null = null;

    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (
        this.buffer[i].timestamp <= timestamp &&
        this.buffer[i + 1].timestamp >= timestamp
      ) {
        before = this.buffer[i];
        after = this.buffer[i + 1];
        break;
      }
    }

    // If timestamp is beyond latest snapshot, use latest
    if (!before || !after) {
      const latest = this.getLatest();
      return latest ? latest.state : null;
    }

    // Calculate interpolation factor
    const timeDelta = after.timestamp - before.timestamp;
    if (timeDelta === 0) {
      return before.state;
    }

    const t = (timestamp - before.timestamp) / timeDelta;

    // Interpolate specified properties
    const interpolated = new Map<string, any>();

    for (const prop of properties) {
      const beforeValue = before.state.get(prop);
      const afterValue = after.state.get(prop);

      if (beforeValue === undefined || afterValue === undefined) {
        // Property not found, use latest available
        interpolated.set(prop, afterValue ?? beforeValue);
        continue;
      }

      // Interpolate based on type
      if (typeof beforeValue === 'number' && typeof afterValue === 'number') {
        // Linear interpolation for numbers
        interpolated.set(prop, beforeValue + (afterValue - beforeValue) * t);
      } else if (Array.isArray(beforeValue) && Array.isArray(afterValue)) {
        // Linear interpolation for arrays (vectors, etc.)
        const result = beforeValue.map((val, i) => {
          if (typeof val === 'number' && typeof afterValue[i] === 'number') {
            return val + (afterValue[i] - val) * t;
          }
          return afterValue[i];
        });
        interpolated.set(prop, result);
      } else {
        // No interpolation for other types, use after value
        interpolated.set(prop, afterValue);
      }
    }

    // Copy non-interpolated properties from after snapshot
    for (const [key, value] of after.state) {
      if (!interpolated.has(key)) {
        interpolated.set(key, value);
      }
    }

    return interpolated;
  }

  /**
   * Extrapolates state forward based on velocity.
   *
   * @param timestamp - Target timestamp
   * @param velocityProperties - Velocity properties (e.g., ['vx', 'vy', 'vz'])
   * @param positionProperties - Position properties (e.g., ['x', 'y', 'z'])
   * @returns Extrapolated state or null
   *
   * @example
   * ```typescript
   * const state = buffer.extrapolate(
   *   futureTime,
   *   ['vx', 'vy', 'vz'],
   *   ['x', 'y', 'z']
   * );
   * ```
   */
  extrapolate(
    timestamp: number,
    velocityProperties: string[],
    positionProperties: string[]
  ): Map<string, any> | null {
    const latest = this.getLatest();
    if (!latest) {
      return null;
    }

    if (timestamp <= latest.timestamp) {
      // Don't extrapolate backwards
      return latest.state;
    }

    const deltaTime = (timestamp - latest.timestamp) / 1000; // Convert to seconds
    const extrapolated = new Map(latest.state);

    // Extrapolate positions using velocities
    for (let i = 0; i < positionProperties.length; i++) {
      const posProp = positionProperties[i];
      const velProp = velocityProperties[i];

      const position = extrapolated.get(posProp);
      const velocity = extrapolated.get(velProp);

      if (typeof position === 'number' && typeof velocity === 'number') {
        extrapolated.set(posProp, position + velocity * deltaTime);
      }
    }

    return extrapolated;
  }

  /**
   * Gets the number of snapshots in the buffer.
   * @returns Buffer size
   */
  get size(): number {
    return this.buffer.length;
  }

  /**
   * Checks if the buffer is empty.
   * @returns True if empty
   */
  get isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  /**
   * Gets the time range covered by the buffer.
   * @returns Tuple of [oldest timestamp, latest timestamp] or null
   */
  getTimeRange(): [number, number] | null {
    if (this.buffer.length === 0) {
      return null;
    }
    return [this.buffer[0].timestamp, this.buffer[this.buffer.length - 1].timestamp];
  }

  /**
   * Clears all snapshots from the buffer.
   */
  clear(): void {
    this.buffer.length = 0;
  }

  /**
   * Removes snapshots older than a given timestamp.
   *
   * @param timestamp - Cutoff timestamp
   * @returns Number of snapshots removed
   *
   * @example
   * ```typescript
   * // Remove snapshots older than 1 second
   * const removed = buffer.removeOlderThan(Date.now() - 1000);
   * ```
   */
  removeOlderThan(timestamp: number): number {
    const originalLength = this.buffer.length;

    let removeCount = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i].timestamp < timestamp) {
        removeCount++;
      } else {
        break;
      }
    }

    if (removeCount > 0) {
      this.buffer.splice(0, removeCount);
    }

    return originalLength - this.buffer.length;
  }

  /**
   * Gets all snapshots in the buffer.
   * @returns Array of snapshots
   */
  getAll(): StateSnapshot[] {
    return [...this.buffer];
  }
}

/**
 * Utility for creating and manipulating state snapshots.
 */
export class SnapshotUtils {
  /**
   * Creates an empty snapshot.
   *
   * @param networkId - Network ID
   * @param timestamp - Timestamp (default: now)
   * @returns Empty snapshot
   */
  static createEmpty(networkId: NetworkId, timestamp: number = Date.now()): StateSnapshot {
    return {
      timestamp,
      networkId,
      state: new Map(),
    };
  }

  /**
   * Clones a snapshot.
   *
   * @param snapshot - Snapshot to clone
   * @returns Cloned snapshot
   */
  static clone(snapshot: StateSnapshot): StateSnapshot {
    return {
      timestamp: snapshot.timestamp,
      networkId: snapshot.networkId,
      state: new Map(snapshot.state),
    };
  }

  /**
   * Merges two snapshots (later snapshot takes precedence).
   *
   * @param snapshot1 - First snapshot
   * @param snapshot2 - Second snapshot
   * @returns Merged snapshot
   */
  static merge(snapshot1: StateSnapshot, snapshot2: StateSnapshot): StateSnapshot {
    const merged: StateSnapshot = {
      timestamp: Math.max(snapshot1.timestamp, snapshot2.timestamp),
      networkId: snapshot1.networkId,
      state: new Map(snapshot1.state),
    };

    // Apply snapshot2 properties
    for (const [key, value] of snapshot2.state) {
      merged.state.set(key, value);
    }

    return merged;
  }

  /**
   * Calculates the difference between two snapshots.
   *
   * @param oldSnapshot - Old snapshot
   * @param newSnapshot - New snapshot
   * @returns Map of changed properties
   */
  static diff(oldSnapshot: StateSnapshot, newSnapshot: StateSnapshot): Map<string, any> {
    const changes = new Map<string, any>();

    for (const [key, newValue] of newSnapshot.state) {
      const oldValue = oldSnapshot.state.get(key);

      if (!this.areEqual(oldValue, newValue)) {
        changes.set(key, newValue);
      }
    }

    return changes;
  }

  /**
   * Checks if two values are equal (deep comparison for arrays/objects).
   */
  private static areEqual(a: any, b: any): boolean {
    if (a === b) {
      return true;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        return false;
      }
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
          return false;
        }
      }
      return true;
    }

    return false;
  }

  /**
   * Gets the size of a snapshot in bytes (approximate).
   *
   * @param snapshot - Snapshot
   * @returns Estimated size in bytes
   */
  static estimateSize(snapshot: StateSnapshot): number {
    let size = 12; // timestamp (8) + networkId (4)

    for (const [key, value] of snapshot.state) {
      size += key.length + 2; // key + length prefix

      if (typeof value === 'number') {
        size += 8;
      } else if (typeof value === 'boolean') {
        size += 1;
      } else if (typeof value === 'string') {
        size += value.length + 2;
      } else if (Array.isArray(value)) {
        size += 2; // array length
        for (const item of value) {
          if (typeof item === 'number') {
            size += 8;
          } else if (typeof item === 'boolean') {
            size += 1;
          }
        }
      }
    }

    return size;
  }
}
