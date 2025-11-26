/**
 * @fileoverview World state representation for planning systems.
 * Implements efficient state storage and comparison for GOAP and other planners.
 * @module ai/planning/WorldState
 */

import { Logger } from '../../core/Logger';

/**
 * World state key-value pairs.
 */
export type WorldStateData = Map<string, any>;

/**
 * World state for planning.
 * Represents the current or desired state of the world as key-value pairs.
 *
 * @example
 * ```typescript
 * // Create world state
 * const state = new WorldState();
 * state.set('hasWeapon', true);
 * state.set('enemyHealth', 100);
 * state.set('playerHealth', 80);
 * state.set('inCover', false);
 *
 * // Check values
 * if (state.get('hasWeapon')) {
 *   console.log('Can attack');
 * }
 *
 * // Compare states
 * const goal = new WorldState();
 * goal.set('enemyHealth', 0);
 *
 * const diff = state.diff(goal);
 * console.log('Need to achieve:', diff);
 *
 * // Clone state
 * const copy = state.clone();
 * copy.set('inCover', true);
 * ```
 */
export class WorldState {
  /** State data */
  private data: WorldStateData;

  /** Logger instance */
  private logger: Logger;

  /**
   * Creates a new world state.
   *
   * @param initialData - Initial state data
   */
  constructor(initialData?: WorldStateData) {
    this.data = initialData ? new Map(initialData) : new Map();
    this.logger = new Logger('WorldState');
  }

  /**
   * Sets a state value.
   *
   * @param key - State key
   * @param value - State value
   *
   * @example
   * ```typescript
   * state.set('hasAmmo', true);
   * state.set('ammoCount', 30);
   * state.set('targetPosition', new Vector3(10, 0, 5));
   * ```
   */
  set(key: string, value: any): void {
    this.data.set(key, value);
  }

  /**
   * Gets a state value.
   *
   * @param key - State key
   * @param defaultValue - Default value if key doesn't exist
   * @returns State value
   *
   * @example
   * ```typescript
   * const health = state.get('health', 100);
   * const hasKey = state.get('hasKey', false);
   * ```
   */
  get<T = any>(key: string, defaultValue?: T): T {
    if (this.data.has(key)) {
      return this.data.get(key) as T;
    }
    return defaultValue as T;
  }

  /**
   * Checks if a state key exists.
   *
   * @param key - State key
   * @returns True if key exists
   */
  has(key: string): boolean {
    return this.data.has(key);
  }

  /**
   * Deletes a state key.
   *
   * @param key - State key
   */
  delete(key: string): void {
    this.data.delete(key);
  }

  /**
   * Clears all state data.
   */
  clear(): void {
    this.data.clear();
  }

  /**
   * Gets all state keys.
   *
   * @returns Array of keys
   */
  keys(): string[] {
    return Array.from(this.data.keys());
  }

  /**
   * Gets all state values.
   *
   * @returns Array of values
   */
  values(): any[] {
    return Array.from(this.data.values());
  }

  /**
   * Gets all state entries.
   *
   * @returns Array of [key, value] pairs
   */
  entries(): Array<[string, any]> {
    return Array.from(this.data.entries());
  }

  /**
   * Gets the number of state entries.
   *
   * @returns Entry count
   */
  size(): number {
    return this.data.size;
  }

  /**
   * Checks if state is empty.
   *
   * @returns True if empty
   */
  isEmpty(): boolean {
    return this.data.size === 0;
  }

  /**
   * Clones the world state.
   *
   * @returns New world state with copied data
   */
  clone(): WorldState {
    return new WorldState(new Map(this.data));
  }

  /**
   * Applies changes from another state.
   *
   * @param other - State to apply
   *
   * @example
   * ```typescript
   * const effects = new WorldState();
   * effects.set('hasWeapon', true);
   * effects.set('ammo', 30);
   *
   * currentState.apply(effects);
   * ```
   */
  apply(other: WorldState): void {
    for (const [key, value] of other.data.entries()) {
      this.data.set(key, value);
    }
  }

  /**
   * Checks if this state satisfies another state (goal).
   * Returns true if all keys in the goal exist in this state with matching values.
   *
   * @param goal - Goal state to check
   * @returns True if goal is satisfied
   *
   * @example
   * ```typescript
   * const goal = new WorldState();
   * goal.set('hasWeapon', true);
   * goal.set('enemyHealth', 0);
   *
   * if (currentState.satisfies(goal)) {
   *   console.log('Goal achieved!');
   * }
   * ```
   */
  satisfies(goal: WorldState): boolean {
    for (const [key, goalValue] of goal.data.entries()) {
      if (!this.data.has(key)) {
        return false;
      }

      const currentValue = this.data.get(key);
      if (!this.valuesEqual(currentValue, goalValue)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Gets the difference between this state and a goal state.
   * Returns a new state containing only the keys that differ.
   *
   * @param goal - Goal state
   * @returns State containing differences
   *
   * @example
   * ```typescript
   * const current = new WorldState();
   * current.set('health', 50);
   * current.set('hasWeapon', false);
   *
   * const goal = new WorldState();
   * goal.set('health', 100);
   * goal.set('hasWeapon', true);
   *
   * const diff = current.diff(goal);
   * // diff will contain: { health: 100, hasWeapon: true }
   * ```
   */
  diff(goal: WorldState): WorldState {
    const difference = new WorldState();

    for (const [key, goalValue] of goal.data.entries()) {
      const currentValue = this.data.get(key);
      if (!this.valuesEqual(currentValue, goalValue)) {
        difference.set(key, goalValue);
      }
    }

    return difference;
  }

  /**
   * Calculates distance to a goal state.
   * Returns the number of differing keys.
   *
   * @param goal - Goal state
   * @returns Number of differences
   */
  distance(goal: WorldState): number {
    let count = 0;

    for (const [key, goalValue] of goal.data.entries()) {
      const currentValue = this.data.get(key);
      if (!this.valuesEqual(currentValue, goalValue)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Checks if two values are equal.
   * @private
   */
  private valuesEqual(a: any, b: any): boolean {
    // Handle primitives
    if (a === b) {
      return true;
    }

    // Handle null/undefined
    if (a == null || b == null) {
      return a === b;
    }

    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        return false;
      }
      return a.every((val, idx) => this.valuesEqual(val, b[idx]));
    }

    // Handle objects with equals method (Vector3, etc.)
    if (typeof a === 'object' && typeof a.equals === 'function') {
      return a.equals(b);
    }

    // Handle plain objects
    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);

      if (aKeys.length !== bKeys.length) {
        return false;
      }

      return aKeys.every(key => this.valuesEqual(a[key], b[key]));
    }

    return false;
  }

  /**
   * Merges multiple states into this state.
   *
   * @param states - States to merge
   */
  merge(...states: WorldState[]): void {
    for (const state of states) {
      this.apply(state);
    }
  }

  /**
   * Creates a state from a plain object.
   *
   * @param obj - Plain object
   * @returns New world state
   *
   * @example
   * ```typescript
   * const state = WorldState.fromObject({
   *   health: 100,
   *   hasWeapon: true,
   *   position: { x: 10, y: 0, z: 5 }
   * });
   * ```
   */
  static fromObject(obj: Record<string, any>): WorldState {
    const state = new WorldState();
    for (const [key, value] of Object.entries(obj)) {
      state.set(key, value);
    }
    return state;
  }

  /**
   * Converts state to a plain object.
   *
   * @returns Plain object representation
   */
  toObject(): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const [key, value] of this.data.entries()) {
      obj[key] = value;
    }
    return obj;
  }

  /**
   * Converts state to a JSON string.
   *
   * @returns JSON representation
   */
  toJSON(): string {
    return JSON.stringify(this.toObject());
  }

  /**
   * Creates a state from a JSON string.
   *
   * @param json - JSON string
   * @returns New world state
   */
  static fromJSON(json: string): WorldState {
    const obj = JSON.parse(json);
    return WorldState.fromObject(obj);
  }

  /**
   * Gets a string representation of the state.
   *
   * @returns String representation
   */
  toString(): string {
    const entries = Array.from(this.data.entries())
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ');
    return `WorldState { ${entries} }`;
  }

  /**
   * Checks if this state equals another state.
   *
   * @param other - State to compare
   * @returns True if states are equal
   */
  equals(other: WorldState): boolean {
    if (this.data.size !== other.data.size) {
      return false;
    }

    for (const [key, value] of this.data.entries()) {
      if (!other.has(key)) {
        return false;
      }

      const otherValue = other.get(key);
      if (!this.valuesEqual(value, otherValue)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Creates a hash code for the state (for use in maps/sets).
   *
   * @returns Hash code string
   */
  hash(): string {
    const sortedKeys = Array.from(this.data.keys()).sort();
    const parts = sortedKeys.map(key => {
      const value = this.data.get(key);
      return `${key}:${JSON.stringify(value)}`;
    });
    return parts.join('|');
  }
}
