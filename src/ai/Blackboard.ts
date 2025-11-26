/**
 * @fileoverview Shared data storage for AI systems (blackboard pattern).
 * Provides type-safe key-value storage with change notifications.
 * @module ai/Blackboard
 */

import { EventBus } from '../core/EventBus';

/**
 * Blackboard value types.
 */
export type BlackboardValue =
  | number
  | string
  | boolean
  | object
  | null
  | undefined
  | any[];

/**
 * Change notification event.
 */
export interface BlackboardChangeEvent {
  /** Key that changed */
  key: string;
  /** New value */
  value: BlackboardValue;
  /** Previous value */
  oldValue: BlackboardValue;
  /** Timestamp of change */
  timestamp: number;
}

/**
 * Blackboard entry with metadata.
 * @private
 */
interface BlackboardEntry {
  value: BlackboardValue;
  timestamp: number;
  version: number;
}

/**
 * Scoped blackboard for hierarchical data storage.
 * Child blackboards inherit from parents but can override values.
 *
 * @example
 * ```typescript
 * // Create root blackboard
 * const globalBlackboard = new Blackboard();
 * globalBlackboard.set('maxHealth', 100);
 *
 * // Create scoped blackboard
 * const agentBlackboard = new Blackboard(globalBlackboard);
 * agentBlackboard.set('currentHealth', 75);
 *
 * // Access values
 * console.log(agentBlackboard.get('maxHealth')); // 100 (inherited)
 * console.log(agentBlackboard.get('currentHealth')); // 75 (local)
 *
 * // Listen for changes
 * agentBlackboard.onChange('currentHealth', (event) => {
 *   console.log(`Health changed from ${event.oldValue} to ${event.value}`);
 * });
 * ```
 */
export class Blackboard {
  /** Parent blackboard for inheritance */
  readonly parent: Blackboard | null;

  /** Local data storage */
  private data: Map<string, BlackboardEntry>;

  /** Event bus for change notifications */
  private eventBus: EventBus;

  /** Version counter for optimistic updates */
  private version: number;

  /**
   * Creates a new blackboard.
   *
   * @param parent - Parent blackboard for scoping
   */
  constructor(parent: Blackboard | null = null) {
    this.parent = parent;
    this.data = new Map();
    this.eventBus = new EventBus();
    this.version = 0;
  }

  /**
   * Sets a value in the blackboard.
   *
   * @param key - Data key
   * @param value - Data value
   * @param notify - Whether to emit change event (default: true)
   *
   * @example
   * ```typescript
   * blackboard.set('health', 100);
   * blackboard.set('position', { x: 10, y: 0, z: 5 });
   * blackboard.set('isAlive', true);
   * blackboard.set('tags', ['enemy', 'aggressive']);
   * ```
   */
  set(key: string, value: BlackboardValue, notify: boolean = true): void {
    const oldValue = this.getLocal(key);
    const entry: BlackboardEntry = {
      value,
      timestamp: Date.now(),
      version: ++this.version,
    };

    this.data.set(key, entry);

    if (notify) {
      this.emitChange(key, value, oldValue);
    }
  }

  /**
   * Gets a value from the blackboard.
   * Checks local storage first, then parent chain.
   *
   * @param key - Data key
   * @param defaultValue - Default value if key not found
   * @returns Value or default
   *
   * @example
   * ```typescript
   * const health = blackboard.get('health', 0);
   * const position = blackboard.get('position');
   * const isAlive = blackboard.get('isAlive', true);
   * ```
   */
  get<T = BlackboardValue>(key: string, defaultValue?: T): T {
    const entry = this.data.get(key);
    if (entry !== undefined) {
      return entry.value as T;
    }

    // Check parent
    if (this.parent) {
      return this.parent.get(key, defaultValue);
    }

    return defaultValue as T;
  }

  /**
   * Gets a value from local storage only (no parent lookup).
   *
   * @param key - Data key
   * @returns Value or undefined
   */
  getLocal<T = BlackboardValue>(key: string): T | undefined {
    const entry = this.data.get(key);
    return entry?.value as T | undefined;
  }

  /**
   * Checks if a key exists in the blackboard.
   *
   * @param key - Data key
   * @param localOnly - Only check local storage
   * @returns True if key exists
   *
   * @example
   * ```typescript
   * if (blackboard.has('target')) {
   *   const target = blackboard.get('target');
   *   // Use target...
   * }
   * ```
   */
  has(key: string, localOnly: boolean = false): boolean {
    if (this.data.has(key)) {
      return true;
    }

    if (!localOnly && this.parent) {
      return this.parent.has(key);
    }

    return false;
  }

  /**
   * Deletes a key from the blackboard.
   *
   * @param key - Data key to remove
   * @param notify - Whether to emit change event
   * @returns True if key was deleted
   *
   * @example
   * ```typescript
   * blackboard.delete('temporaryTarget');
   * ```
   */
  delete(key: string, notify: boolean = true): boolean {
    const oldValue = this.getLocal(key);
    const deleted = this.data.delete(key);

    if (deleted && notify) {
      this.emitChange(key, undefined, oldValue);
    }

    return deleted;
  }

  /**
   * Clears all local data.
   *
   * @param notify - Whether to emit change events
   *
   * @example
   * ```typescript
   * blackboard.clear();
   * ```
   */
  clear(notify: boolean = true): void {
    if (notify) {
      // Emit change events for all keys
      for (const [key, entry] of this.data) {
        this.emitChange(key, undefined, entry.value);
      }
    }

    this.data.clear();
  }

  /**
   * Gets all keys in the blackboard.
   *
   * @param localOnly - Only include local keys
   * @returns Array of keys
   *
   * @example
   * ```typescript
   * const keys = blackboard.keys();
   * console.log(`Blackboard contains: ${keys.join(', ')}`);
   * ```
   */
  keys(localOnly: boolean = false): string[] {
    const localKeys = Array.from(this.data.keys());

    if (localOnly || !this.parent) {
      return localKeys;
    }

    const parentKeys = this.parent.keys();
    const allKeys = new Set([...localKeys, ...parentKeys]);
    return Array.from(allKeys);
  }

  /**
   * Gets the number of entries in the blackboard.
   *
   * @param localOnly - Only count local entries
   * @returns Entry count
   */
  size(localOnly: boolean = false): number {
    if (localOnly) {
      return this.data.size;
    }

    return this.keys(false).length;
  }

  /**
   * Registers a change listener for a specific key.
   *
   * @param key - Data key to watch
   * @param callback - Callback function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = blackboard.onChange('health', (event) => {
   *   console.log(`Health: ${event.oldValue} -> ${event.value}`);
   *   if (event.value <= 0) {
   *     console.log('Agent died!');
   *   }
   * });
   *
   * // Later...
   * unsubscribe();
   * ```
   */
  onChange(key: string, callback: (event: BlackboardChangeEvent) => void): () => void {
    return this.eventBus.on(`change:${key}`, callback);
  }

  /**
   * Registers a listener for any change.
   *
   * @param callback - Callback function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * blackboard.onAnyChange((event) => {
   *   console.log(`${event.key} changed to ${event.value}`);
   * });
   * ```
   */
  onAnyChange(callback: (event: BlackboardChangeEvent) => void): () => void {
    return this.eventBus.on('change', callback);
  }

  /**
   * Emits a change event.
   * @private
   */
  private emitChange(key: string, value: BlackboardValue, oldValue: BlackboardValue): void {
    const event: BlackboardChangeEvent = {
      key,
      value,
      oldValue,
      timestamp: Date.now(),
    };

    this.eventBus.emit(`change:${key}`, event);
    this.eventBus.emit('change', event);
  }

  /**
   * Gets or creates a scoped child blackboard.
   *
   * @returns New child blackboard
   *
   * @example
   * ```typescript
   * const globalBB = new Blackboard();
   * const agentBB = globalBB.createChild();
   * agentBB.set('localData', 123); // Only in child
   * ```
   */
  createChild(): Blackboard {
    return new Blackboard(this);
  }

  /**
   * Merges data from another blackboard.
   *
   * @param other - Blackboard to merge from
   * @param overwrite - Whether to overwrite existing keys
   *
   * @example
   * ```typescript
   * const defaults = new Blackboard();
   * defaults.set('health', 100);
   * defaults.set('speed', 5);
   *
   * const agent = new Blackboard();
   * agent.merge(defaults, false); // Only set missing keys
   * ```
   */
  merge(other: Blackboard, overwrite: boolean = true): void {
    for (const key of other.keys(true)) {
      if (overwrite || !this.has(key, true)) {
        const value = other.getLocal(key);
        this.set(key, value);
      }
    }
  }

  /**
   * Creates a snapshot of current data.
   *
   * @param localOnly - Only snapshot local data
   * @returns Plain object with all data
   *
   * @example
   * ```typescript
   * const snapshot = blackboard.snapshot();
   * console.log(JSON.stringify(snapshot, null, 2));
   * ```
   */
  snapshot(localOnly: boolean = false): Record<string, BlackboardValue> {
    const result: Record<string, BlackboardValue> = {};

    const keys = this.keys(localOnly);
    for (const key of keys) {
      result[key] = this.get(key);
    }

    return result;
  }

  /**
   * Restores data from a snapshot.
   *
   * @param snapshot - Snapshot object
   * @param clear - Whether to clear existing data first
   *
   * @example
   * ```typescript
   * const snapshot = blackboard.snapshot();
   * // ... later ...
   * blackboard.restore(snapshot);
   * ```
   */
  restore(snapshot: Record<string, BlackboardValue>, clear: boolean = true): void {
    if (clear) {
      this.clear(false);
    }

    for (const [key, value] of Object.entries(snapshot)) {
      this.set(key, value, false);
    }
  }

  /**
   * Gets entry metadata (timestamp, version).
   *
   * @param key - Data key
   * @returns Entry metadata or null
   */
  getMetadata(key: string): { timestamp: number; version: number } | null {
    const entry = this.data.get(key);
    if (!entry) return null;

    return {
      timestamp: entry.timestamp,
      version: entry.version,
    };
  }

  /**
   * Increments a numeric value atomically.
   *
   * @param key - Data key
   * @param delta - Amount to increment
   * @returns New value
   *
   * @example
   * ```typescript
   * blackboard.set('score', 0);
   * blackboard.increment('score', 10); // 10
   * blackboard.increment('score', 5);  // 15
   * ```
   */
  increment(key: string, delta: number = 1): number {
    const current = this.get<number>(key, 0);
    const newValue = current + delta;
    this.set(key, newValue);
    return newValue;
  }

  /**
   * Toggles a boolean value.
   *
   * @param key - Data key
   * @returns New value
   *
   * @example
   * ```typescript
   * blackboard.set('isActive', false);
   * blackboard.toggle('isActive'); // true
   * blackboard.toggle('isActive'); // false
   * ```
   */
  toggle(key: string): boolean {
    const current = this.get<boolean>(key, false);
    const newValue = !current;
    this.set(key, newValue);
    return newValue;
  }

  /**
   * Compares and sets a value atomically.
   *
   * @param key - Data key
   * @param expected - Expected current value
   * @param newValue - New value to set
   * @returns True if value was updated
   *
   * @example
   * ```typescript
   * // Only set health to 0 if it's currently 10
   * const updated = blackboard.compareAndSet('health', 10, 0);
   * ```
   */
  compareAndSet(key: string, expected: BlackboardValue, newValue: BlackboardValue): boolean {
    const current = this.get(key);
    if (current === expected) {
      this.set(key, newValue);
      return true;
    }
    return false;
  }

  /**
   * Serializes blackboard to JSON.
   *
   * @returns JSON string
   */
  toJSON(): string {
    return JSON.stringify(this.snapshot(true));
  }

  /**
   * Deserializes blackboard from JSON.
   *
   * @param json - JSON string
   */
  fromJSON(json: string): void {
    const data = JSON.parse(json);
    this.restore(data);
  }

  /**
   * Gets a debug string representation.
   *
   * @returns Debug string
   */
  toString(): string {
    const entries = Array.from(this.data.entries())
      .map(([key, entry]) => `  ${key}: ${JSON.stringify(entry.value)}`)
      .join('\n');

    return `Blackboard {\n${entries}\n}`;
  }
}
