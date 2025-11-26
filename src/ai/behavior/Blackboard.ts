/**
 * @fileoverview Shared data storage for behavior trees using the blackboard pattern.
 * Provides scoped, hierarchical data storage with change notifications and observers.
 * @module ai/behavior/Blackboard
 */

/**
 * Blackboard value types - supports primitives, objects, and arrays.
 */
export type BlackboardValue =
  | number
  | string
  | boolean
  | object
  | null
  | undefined
  | unknown[]
  | Map<unknown, unknown>
  | Set<unknown>;

/**
 * Change notification event emitted when blackboard data changes.
 */
export interface BlackboardChangeEvent {
  /** Scope where the change occurred */
  scope: string;
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
 * Observer callback function for blackboard changes.
 */
export type BlackboardObserver = (event: BlackboardChangeEvent) => void;

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
 * Supports three scope levels: global, tree, and subtree.
 * Child scopes inherit from parents but can override values.
 *
 * @example
 * ```typescript
 * // Create global blackboard
 * const globalBB = new Blackboard('global');
 * globalBB.set('maxHealth', 100);
 * globalBB.set('gameTime', 0);
 *
 * // Create tree-scoped blackboard
 * const treeBB = new Blackboard('tree', globalBB);
 * treeBB.set('agentHealth', 80);
 *
 * // Create subtree-scoped blackboard
 * const subtreeBB = new Blackboard('subtree', treeBB);
 * subtreeBB.set('targetEnemy', enemyRef);
 *
 * // Access values - checks local first, then parent chain
 * subtreeBB.get('targetEnemy');  // From subtree
 * subtreeBB.get('agentHealth');  // From tree (parent)
 * subtreeBB.get('maxHealth');    // From global (grandparent)
 *
 * // Listen for changes
 * treeBB.observe('agentHealth', (event) => {
 *   if (event.value < 30) {
 *     console.log('Health critical!');
 *   }
 * });
 * ```
 */
export class Blackboard {
  /** Scope identifier (global, tree, subtree) */
  readonly scope: string;

  /** Parent blackboard for inheritance */
  readonly parent: Blackboard | null;

  /** Local data storage */
  private data: Map<string, BlackboardEntry>;

  /** Change observers keyed by data key */
  private observers: Map<string, Set<BlackboardObserver>>;

  /** Global change observers (triggered on any change) */
  private globalObservers: Set<BlackboardObserver>;

  /** Version counter for optimistic updates */
  private version: number;

  /** Whether change events are enabled */
  private eventsEnabled: boolean;

  /**
   * Creates a new blackboard.
   *
   * @param scope - Scope identifier (global, tree, subtree)
   * @param parent - Parent blackboard for hierarchical scoping
   */
  constructor(scope: string = 'default', parent: Blackboard | null = null) {
    this.scope = scope;
    this.parent = parent;
    this.data = new Map();
    this.observers = new Map();
    this.globalObservers = new Set();
    this.version = 0;
    this.eventsEnabled = true;
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
   * blackboard.set('inventory', ['sword', 'shield', 'potion']);
   * blackboard.set('enemySet', new Set([enemy1, enemy2]));
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

    if (notify && this.eventsEnabled) {
      this.emitChange(key, value, oldValue);
    }
  }

  /**
   * Gets a value from the blackboard.
   * Checks local storage first, then walks up the parent chain.
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

    // Walk up parent chain
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

    if (deleted && notify && this.eventsEnabled) {
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
    if (notify && this.eventsEnabled) {
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
   * Registers a change observer for a specific key.
   *
   * @param key - Data key to watch (use '*' for all keys)
   * @param callback - Observer callback
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = blackboard.observe('health', (event) => {
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
  observe(key: string, callback: BlackboardObserver): () => void {
    if (key === '*') {
      this.globalObservers.add(callback);
      return () => {
        this.globalObservers.delete(callback);
      };
    }

    if (!this.observers.has(key)) {
      this.observers.set(key, new Set());
    }

    this.observers.get(key)!.add(callback);

    return () => {
      const observers = this.observers.get(key);
      if (observers) {
        observers.delete(callback);
        if (observers.size === 0) {
          this.observers.delete(key);
        }
      }
    };
  }

  /**
   * Unobserves a specific key.
   *
   * @param key - Data key
   * @param callback - Observer callback to remove (if omitted, removes all)
   */
  unobserve(key: string, callback?: BlackboardObserver): void {
    if (key === '*') {
      if (callback) {
        this.globalObservers.delete(callback);
      } else {
        this.globalObservers.clear();
      }
      return;
    }

    const observers = this.observers.get(key);
    if (observers) {
      if (callback) {
        observers.delete(callback);
      } else {
        observers.clear();
      }

      if (observers.size === 0) {
        this.observers.delete(key);
      }
    }
  }

  /**
   * Emits a change event to observers.
   * @private
   */
  private emitChange(key: string, value: BlackboardValue, oldValue: BlackboardValue): void {
    const event: BlackboardChangeEvent = {
      scope: this.scope,
      key,
      value,
      oldValue,
      timestamp: Date.now(),
    };

    // Notify key-specific observers
    const keyObservers = this.observers.get(key);
    if (keyObservers) {
      for (const observer of keyObservers) {
        try {
          observer(event);
        } catch (error) {
          console.error(`Blackboard observer error for key "${key}":`, error);
        }
      }
    }

    // Notify global observers
    for (const observer of this.globalObservers) {
      try {
        observer(event);
      } catch (error) {
        console.error('Blackboard global observer error:', error);
      }
    }
  }

  /**
   * Creates a child blackboard with this as parent.
   *
   * @param scope - Child scope identifier
   * @returns New child blackboard
   *
   * @example
   * ```typescript
   * const globalBB = new Blackboard('global');
   * const treeBB = globalBB.createChild('tree');
   * const subtreeBB = treeBB.createChild('subtree');
   * ```
   */
  createChild(scope: string): Blackboard {
    return new Blackboard(scope, this);
  }

  /**
   * Merges data from another blackboard.
   *
   * @param other - Blackboard to merge from
   * @param overwrite - Whether to overwrite existing keys
   *
   * @example
   * ```typescript
   * const defaults = new Blackboard('defaults');
   * defaults.set('health', 100);
   * defaults.set('speed', 5);
   *
   * const agent = new Blackboard('agent');
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
   * @param delta - Amount to increment (can be negative)
   * @returns New value
   *
   * @example
   * ```typescript
   * blackboard.set('score', 0);
   * blackboard.increment('score', 10); // 10
   * blackboard.increment('score', 5);  // 15
   * blackboard.increment('score', -3); // 12
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
   * Enables or disables change events.
   *
   * @param enabled - Whether events are enabled
   *
   * @example
   * ```typescript
   * blackboard.setEventsEnabled(false);
   * // Batch updates without triggering observers
   * blackboard.set('x', 10);
   * blackboard.set('y', 20);
   * blackboard.set('z', 30);
   * blackboard.setEventsEnabled(true);
   * ```
   */
  setEventsEnabled(enabled: boolean): void {
    this.eventsEnabled = enabled;
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

    return `Blackboard[${this.scope}] {\n${entries}\n}`;
  }
}
