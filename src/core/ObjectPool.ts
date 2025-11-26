/**
 * Generic object pool for allocation-free gameplay.
 *
 * Provides efficient object reuse to minimize garbage collection overhead during runtime.
 * Suitable for frequently allocated/deallocated objects like vectors, entities, and particles.
 *
 * @template T The type of object managed by the pool
 *
 * @example
 * ```typescript
 * const vectorPool = new ObjectPool(
 *   () => ({ x: 0, y: 0, z: 0 }),
 *   (v) => { v.x = 0; v.y = 0; v.z = 0; },
 *   10
 * );
 *
 * const vec = vectorPool.acquire();
 * vec.x = 5;
 * vectorPool.release(vec);
 * ```
 */
export class ObjectPool<T> {
  private readonly factory: () => T;
  private readonly reset: (obj: T) => void;
  private readonly maxSize?: number;

  private pool: T[] = [];
  private activeObjects: Set<T> | null = null;

  private _totalCreated: number = 0;
  private _highWaterMark: number = 0;

  /**
   * Creates a new object pool.
   *
   * @param factory Function that creates new instances of T
   * @param reset Function that resets an object to its initial state
   * @param initialSize Number of objects to pre-create (default: 0)
   * @param maxSize Maximum pool size limit (default: unlimited)
   * @param debugMode Enable double-release and use-after-release detection (default: NODE_ENV !== 'production')
   */
  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    initialSize: number = 0,
    maxSize?: number,
    debugMode: boolean = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
  ) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;

    if (debugMode) {
      this.activeObjects = new Set<T>();
    }

    if (initialSize > 0) {
      this.prewarm(initialSize);
    }
  }

  /**
   * Acquires an object from the pool.
   *
   * Returns a pooled instance if available, otherwise creates a new one.
   * The object may contain stale data; caller should initialize as needed.
   *
   * @returns An object instance ready for use
   */
  acquire(): T {
    let obj: T;

    if (this.pool.length > 0) {
      obj = this.pool.pop()!;
    } else {
      obj = this.factory();
      this._totalCreated++;
    }

    if (this.activeObjects !== null) {
      this.activeObjects.add(obj);
    }

    const currentActive = this.activeCount;
    if (currentActive > this._highWaterMark) {
      this._highWaterMark = currentActive;
    }

    return obj;
  }

  /**
   * Releases an object back to the pool.
   *
   * Calls the reset function to clear the object's state before pooling.
   * In debug mode, detects double-release errors.
   *
   * @param obj The object to return to the pool
   * @throws {Error} If the object is released twice (debug mode only)
   */
  release(obj: T): void {
    if (this.activeObjects !== null) {
      if (!this.activeObjects.has(obj)) {
        throw new Error('ObjectPool: Attempted to release an object that was not acquired or was already released (double-release detected)');
      }
      this.activeObjects.delete(obj);
    }

    this.reset(obj);

    if (this.maxSize === undefined || this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
  }

  /**
   * Number of objects currently in active use.
   *
   * Only accurate when debug mode is enabled; returns 0 in production mode.
   */
  get activeCount(): number {
    return this.activeObjects !== null ? this.activeObjects.size : 0;
  }

  /**
   * Number of objects currently available in the pool.
   */
  get pooledCount(): number {
    return this.pool.length;
  }

  /**
   * Total number of objects created since pool initialization.
   *
   * Includes both active and pooled objects.
   */
  get totalCreated(): number {
    return this._totalCreated;
  }

  /**
   * Maximum number of active objects at any point.
   *
   * Only accurate when debug mode is enabled; returns 0 in production mode.
   * Useful for tuning initial pool sizes.
   */
  get highWaterMark(): number {
    return this._highWaterMark;
  }

  /**
   * Pre-creates objects to avoid runtime allocations.
   *
   * Useful for initialization phases to prevent frame drops during gameplay.
   *
   * @param count Number of objects to pre-create and add to the pool
   */
  prewarm(count: number): void {
    const targetSize = this.pool.length + count;
    const actualTarget = this.maxSize !== undefined
      ? Math.min(targetSize, this.maxSize)
      : targetSize;

    while (this.pool.length < actualTarget) {
      const obj = this.factory();
      this.reset(obj);
      this.pool.push(obj);
      this._totalCreated++;
    }
  }

  /**
   * Releases excess pooled objects to reduce memory usage.
   *
   * Useful for responding to memory pressure or transitioning between game states.
   * Only affects pooled objects; active objects are not touched.
   *
   * @param targetSize Desired pool size after shrinking
   */
  shrink(targetSize: number): void {
    if (targetSize < 0) {
      targetSize = 0;
    }

    while (this.pool.length > targetSize) {
      this.pool.pop();
    }
  }

  /**
   * Clears all pooled objects and resets statistics.
   *
   * Active objects are not affected, but the pool is emptied.
   * Useful for cleanup during scene transitions or level unloading.
   *
   * Note: Does not reset totalCreated or highWaterMark counters.
   */
  clear(): void {
    this.pool.length = 0;
  }

  /**
   * Resets all statistics and clears the pool.
   *
   * More thorough than clear(); also resets counters.
   * Active object tracking is preserved in debug mode.
   */
  reset(): void {
    this.pool.length = 0;
    this._totalCreated = 0;
    this._highWaterMark = 0;

    if (this.activeObjects !== null) {
      this.activeObjects.clear();
    }
  }
}
