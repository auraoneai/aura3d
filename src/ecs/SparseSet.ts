/**
 * Sparse set data structure for O(1) entity-component mapping.
 *
 * A sparse set provides constant-time operations for add, remove, has, and get
 * while maintaining a dense array for efficient iteration. It's particularly
 * useful for ECS systems where entities are identified by integer IDs.
 *
 * @template T - The type of values stored in the set. Use void for key-only sets.
 *
 * @example
 * ```typescript
 * // Create a sparse set for entity positions
 * const positions = new SparseSet<{ x: number; y: number }>();
 *
 * // Add components
 * positions.add(1, { x: 10, y: 20 });
 * positions.add(5, { x: 30, y: 40 });
 *
 * // Check and retrieve
 * if (positions.has(1)) {
 *   const pos = positions.get(1);
 *   console.log(pos); // { x: 10, y: 20 }
 * }
 *
 * // Iterate efficiently
 * positions.forEach((key, value) => {
 *   console.log(`Entity ${key} at (${value.x}, ${value.y})`);
 * });
 *
 * // Remove (O(1) with swap-and-pop)
 * positions.remove(1);
 * ```
 *
 * @example
 * ```typescript
 * // Create a key-only sparse set (no data stored)
 * const activeEntities = new SparseSet<void>();
 * activeEntities.add(1);
 * activeEntities.add(2);
 * console.log(activeEntities.has(1)); // true
 * ```
 */
export class SparseSet<T = void> {
  /**
   * Sparse array mapping keys to dense indices.
   * Uses a Map for sparse storage to handle arbitrary key ranges efficiently.
   */
  private sparse: Map<number, number>;

  /**
   * Dense array of keys in insertion order (with swap-and-pop modifications).
   * This array is compact (no holes) and used for efficient iteration.
   */
  private _dense: number[];

  /**
   * Parallel array to dense, holding the actual component data.
   * Only allocated if T is not void.
   */
  private _data: T[];

  /**
   * Current number of elements in the set.
   */
  private _size: number;

  /**
   * Initial capacity for the dense array.
   */
  private initialDenseCapacity: number;

  /**
   * Creates a new sparse set.
   *
   * @param options - Configuration options
   * @param options.initialSparseCapacity - Initial capacity hint for sparse array (unused for Map-based implementation)
   * @param options.initialDenseCapacity - Initial capacity for dense array (default: 16)
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>({ initialDenseCapacity: 1000 });
   * ```
   */
  constructor(options?: {
    initialSparseCapacity?: number;
    initialDenseCapacity?: number;
  }) {
    this.sparse = new Map();
    this.initialDenseCapacity = options?.initialDenseCapacity ?? 16;
    this._dense = [];
    this._data = [] as T[];
    this._size = 0;
  }

  /**
   * Adds a key-value pair to the set. If the key already exists, updates its value.
   *
   * Time complexity: O(1) amortized
   *
   * @param key - The integer key to add
   * @param value - The value to associate with the key (optional if T is void)
   *
   * @example
   * ```typescript
   * const set = new SparseSet<string>();
   * set.add(1, "hello");
   * set.add(2, "world");
   * ```
   */
  add(key: number, value?: T): void {
    const existingIndex = this.sparse.get(key);

    if (existingIndex !== undefined) {
      // Key already exists, update the value
      if (value !== undefined) {
        this._data[existingIndex] = value;
      }
      return;
    }

    // Add new entry
    const denseIndex = this._size;
    this.sparse.set(key, denseIndex);

    if (denseIndex >= this._dense.length) {
      this._dense.push(key);
    } else {
      this._dense[denseIndex] = key;
    }

    if (value !== undefined) {
      if (denseIndex >= this._data.length) {
        this._data.push(value);
      } else {
        this._data[denseIndex] = value;
      }
    }

    this._size++;
  }

  /**
   * Removes a key from the set using swap-and-pop for O(1) removal.
   *
   * Algorithm:
   * 1. Get dense index for key
   * 2. Swap with last element in dense/data arrays
   * 3. Update sparse mapping for swapped element
   * 4. Pop last element
   * 5. Clear sparse entry for removed key
   *
   * Time complexity: O(1)
   *
   * @param key - The key to remove
   * @returns true if the key was removed, false if it didn't exist
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * set.add(1, 100);
   * set.remove(1); // returns true
   * set.remove(1); // returns false (already removed)
   * ```
   */
  remove(key: number): boolean {
    const denseIndex = this.sparse.get(key);

    if (denseIndex === undefined) {
      return false;
    }

    const lastIndex = this._size - 1;

    if (denseIndex !== lastIndex) {
      // Swap with last element
      const lastKey = this._dense[lastIndex];

      this._dense[denseIndex] = lastKey;
      this.sparse.set(lastKey, denseIndex);

      if (this._data.length > 0) {
        this._data[denseIndex] = this._data[lastIndex];
      }
    }

    // Remove the last element
    this._size--;
    this.sparse.delete(key);

    return true;
  }

  /**
   * Checks if a key exists in the set.
   *
   * Time complexity: O(1)
   *
   * @param key - The key to check
   * @returns true if the key exists, false otherwise
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * set.add(1, 100);
   * console.log(set.has(1)); // true
   * console.log(set.has(2)); // false
   * ```
   */
  has(key: number): boolean {
    return this.sparse.has(key);
  }

  /**
   * Gets the value associated with a key.
   *
   * Time complexity: O(1)
   *
   * @param key - The key to look up
   * @returns The value associated with the key, or undefined if not found
   *
   * @example
   * ```typescript
   * const set = new SparseSet<string>();
   * set.add(1, "hello");
   * console.log(set.get(1)); // "hello"
   * console.log(set.get(2)); // undefined
   * ```
   */
  get(key: number): T | undefined {
    const denseIndex = this.sparse.get(key);

    if (denseIndex === undefined) {
      return undefined;
    }

    return this._data[denseIndex];
  }

  /**
   * Sets the value for an existing key.
   *
   * Time complexity: O(1)
   *
   * @param key - The key to update
   * @param value - The new value
   * @returns true if the key existed and was updated, false otherwise
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * set.add(1, 100);
   * set.set(1, 200); // returns true, value is now 200
   * set.set(2, 300); // returns false, key doesn't exist
   * ```
   */
  set(key: number, value: T): boolean {
    const denseIndex = this.sparse.get(key);

    if (denseIndex === undefined) {
      return false;
    }

    this._data[denseIndex] = value;
    return true;
  }

  /**
   * Removes all elements from the set.
   *
   * Time complexity: O(1)
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * set.add(1, 100);
   * set.add(2, 200);
   * set.clear();
   * console.log(set.size); // 0
   * ```
   */
  clear(): void {
    this.sparse.clear();
    this._size = 0;
  }

  /**
   * Gets the number of elements in the set.
   *
   * @returns The number of elements
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * console.log(set.size); // 0
   * set.add(1, 100);
   * console.log(set.size); // 1
   * ```
   */
  get size(): number {
    return this._size;
  }

  /**
   * Gets the current capacity of the dense array.
   *
   * @returns The dense array capacity
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * console.log(set.capacity); // Current capacity
   * ```
   */
  get capacity(): number {
    return this._dense.length;
  }

  /**
   * Gets a read-only view of the dense array containing all keys.
   * The order reflects insertion order modified by swap-and-pop removals.
   *
   * @returns Read-only array of keys
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * set.add(1, 100);
   * set.add(2, 200);
   * const keys = set.dense;
   * console.log(keys); // [1, 2] (or similar order)
   * ```
   */
  get dense(): readonly number[] {
    return this._dense.slice(0, this._size);
  }

  /**
   * Gets a read-only view of the data array containing all values.
   * The order parallels the dense array.
   *
   * @returns Read-only array of values
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * set.add(1, 100);
   * set.add(2, 200);
   * const values = set.data;
   * console.log(values); // [100, 200] (or similar order)
   * ```
   */
  get data(): readonly T[] {
    return this._data.slice(0, this._size);
  }

  /**
   * Gets the dense array index for a given key.
   *
   * Time complexity: O(1)
   *
   * @param key - The key to look up
   * @returns The dense index, or -1 if not present
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * set.add(1, 100);
   * console.log(set.getDenseIndex(1)); // 0
   * console.log(set.getDenseIndex(2)); // -1
   * ```
   */
  getDenseIndex(key: number): number {
    const index = this.sparse.get(key);
    return index !== undefined ? index : -1;
  }

  /**
   * Gets the key at a specific dense array index.
   *
   * Time complexity: O(1)
   *
   * @param index - The dense array index
   * @returns The key at that index
   * @throws Error if index is out of bounds
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * set.add(1, 100);
   * console.log(set.getKeyAtDenseIndex(0)); // 1
   * ```
   */
  getKeyAtDenseIndex(index: number): number {
    if (index < 0 || index >= this._size) {
      throw new Error(`Dense index ${index} out of bounds [0, ${this._size})`);
    }
    return this._dense[index];
  }

  /**
   * Iterates over all key-value pairs in dense order.
   *
   * Time complexity: O(n) where n is the number of elements
   *
   * @param callback - Function called for each element
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * set.add(1, 100);
   * set.add(2, 200);
   * set.forEach((key, value, index) => {
   *   console.log(`[${index}] key=${key}, value=${value}`);
   * });
   * ```
   */
  forEach(callback: (key: number, value: T, index: number) => void): void {
    for (let i = 0; i < this._size; i++) {
      const key = this._dense[i];
      const value = this._data[i];
      callback(key, value, i);
    }
  }

  /**
   * Returns an iterator over [key, value] pairs.
   *
   * @returns Iterator of [key, value] tuples
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * set.add(1, 100);
   * set.add(2, 200);
   * for (const [key, value] of set) {
   *   console.log(`${key}: ${value}`);
   * }
   * ```
   */
  *[Symbol.iterator](): Iterator<[number, T]> {
    for (let i = 0; i < this._size; i++) {
      yield [this._dense[i], this._data[i]];
    }
  }

  /**
   * Returns an iterator over all keys in dense order.
   *
   * @returns Iterator of keys
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * set.add(1, 100);
   * set.add(2, 200);
   * for (const key of set.keys()) {
   *   console.log(key);
   * }
   * ```
   */
  *keys(): Iterator<number> {
    for (let i = 0; i < this._size; i++) {
      yield this._dense[i];
    }
  }

  /**
   * Returns an iterator over all values in dense order.
   *
   * @returns Iterator of values
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * set.add(1, 100);
   * set.add(2, 200);
   * for (const value of set.values()) {
   *   console.log(value);
   * }
   * ```
   */
  *values(): Iterator<T> {
    for (let i = 0; i < this._size; i++) {
      yield this._data[i];
    }
  }

  /**
   * Returns an iterator over [key, value] pairs.
   *
   * @returns Iterator of [key, value] tuples
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * set.add(1, 100);
   * set.add(2, 200);
   * for (const [key, value] of set.entries()) {
   *   console.log(`${key}: ${value}`);
   * }
   * ```
   */
  *entries(): Iterator<[number, T]> {
    for (let i = 0; i < this._size; i++) {
      yield [this._dense[i], this._data[i]];
    }
  }

  /**
   * Creates a deep copy of this sparse set.
   *
   * Time complexity: O(n) where n is the number of elements
   *
   * @returns A new sparse set with the same contents
   *
   * @example
   * ```typescript
   * const original = new SparseSet<number>();
   * original.add(1, 100);
   * const copy = original.clone();
   * copy.add(2, 200);
   * console.log(original.size); // 1
   * console.log(copy.size); // 2
   * ```
   */
  clone(): SparseSet<T> {
    const cloned = new SparseSet<T>({
      initialDenseCapacity: this.initialDenseCapacity,
    });

    cloned.sparse = new Map(this.sparse);
    cloned._dense = [...this._dense];
    cloned._data = [...this._data];
    cloned._size = this._size;

    return cloned;
  }

  /**
   * Converts the sparse set to an array of {key, value} objects.
   * Useful for debugging and serialization.
   *
   * Time complexity: O(n) where n is the number of elements
   *
   * @returns Array of key-value objects
   *
   * @example
   * ```typescript
   * const set = new SparseSet<number>();
   * set.add(1, 100);
   * set.add(2, 200);
   * console.log(set.toArray());
   * // [{ key: 1, value: 100 }, { key: 2, value: 200 }]
   * ```
   */
  toArray(): Array<{ key: number; value: T }> {
    const result: Array<{ key: number; value: T }> = [];

    for (let i = 0; i < this._size; i++) {
      result.push({
        key: this._dense[i],
        value: this._data[i],
      });
    }

    return result;
  }
}
