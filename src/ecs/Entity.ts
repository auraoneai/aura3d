/**
 * Entity identifier with generation tracking for safe reuse.
 *
 * An Entity is a lightweight handle encoded as a number containing both an index
 * and a generation counter. This enables safe reuse of entity slots while detecting
 * stale references.
 *
 * Encoding: (generation << 20) | index
 * - Index (lower 20 bits): position in component arrays (0-1048575)
 * - Generation (upper 12 bits): version counter for reuse detection (0-4095)
 *
 * @module Entity
 */

/**
 * Entity is a lightweight identifier encoded as a single number.
 * Contains both an index (lower 20 bits) and generation (upper 12 bits).
 */
export type Entity = number;

/** Number of bits used for entity index */
const ENTITY_INDEX_BITS = 20;

/** Mask to extract entity index from encoded entity */
const ENTITY_INDEX_MASK = (1 << ENTITY_INDEX_BITS) - 1;

/** Number of bits used for generation counter */
const ENTITY_GENERATION_BITS = 12;

/** Mask to extract generation from encoded entity */
const ENTITY_GENERATION_MASK = (1 << ENTITY_GENERATION_BITS) - 1;

/**
 * Utility functions for working with Entity identifiers.
 *
 * @example
 * ```typescript
 * // Create an entity
 * const entity = EntityUtils.create(42, 1);
 *
 * // Extract components
 * const index = EntityUtils.getIndex(entity);      // 42
 * const gen = EntityUtils.getGeneration(entity);   // 1
 *
 * // Validate
 * EntityUtils.isValid(entity);                     // true
 * EntityUtils.isValid(EntityUtils.INVALID);        // false
 *
 * // Format for debugging
 * console.log(EntityUtils.toString(entity));       // "Entity(idx:42, gen:1)"
 * ```
 */
export const EntityUtils = {
  /**
   * Creates an entity from an index and generation.
   *
   * @param index - Entity index (0 to MAX_ENTITIES-1)
   * @param generation - Generation counter (0 to MAX_GENERATION-1)
   * @returns Encoded entity identifier
   *
   * @example
   * ```typescript
   * const entity = EntityUtils.create(100, 3);
   * // Entity with index 100 and generation 3
   * ```
   */
  create(index: number, generation: number): Entity {
    return ((generation & ENTITY_GENERATION_MASK) << ENTITY_INDEX_BITS) | (index & ENTITY_INDEX_MASK);
  },

  /**
   * Extracts the index from an entity identifier.
   *
   * @param entity - Entity identifier
   * @returns Entity index (0 to MAX_ENTITIES-1)
   *
   * @example
   * ```typescript
   * const entity = EntityUtils.create(42, 5);
   * EntityUtils.getIndex(entity); // 42
   * ```
   */
  getIndex(entity: Entity): number {
    return entity & ENTITY_INDEX_MASK;
  },

  /**
   * Extracts the generation from an entity identifier.
   *
   * @param entity - Entity identifier
   * @returns Generation counter (0 to MAX_GENERATION-1)
   *
   * @example
   * ```typescript
   * const entity = EntityUtils.create(42, 5);
   * EntityUtils.getGeneration(entity); // 5
   * ```
   */
  getGeneration(entity: Entity): number {
    return (entity >>> ENTITY_INDEX_BITS) & ENTITY_GENERATION_MASK;
  },

  /**
   * Checks if an entity identifier is valid (not INVALID).
   *
   * @param entity - Entity identifier to check
   * @returns true if entity is not INVALID, false otherwise
   *
   * @example
   * ```typescript
   * EntityUtils.isValid(EntityUtils.INVALID); // false
   * EntityUtils.isValid(EntityUtils.create(1, 1)); // true
   * ```
   */
  isValid(entity: Entity): boolean {
    return entity !== 0;
  },

  /**
   * Invalid entity constant representing no entity.
   * Index 0, generation 0 is reserved and never allocated.
   */
  INVALID: 0 as Entity,

  /**
   * Maximum number of entities that can exist.
   * 2^20 = 1,048,576 entities.
   */
  MAX_ENTITIES: 1 << ENTITY_INDEX_BITS,

  /**
   * Maximum generation value before wrapping.
   * 2^12 = 4096 generations per entity slot.
   */
  MAX_GENERATION: 1 << ENTITY_GENERATION_BITS,

  /**
   * Formats an entity as a human-readable string for debugging.
   *
   * @param entity - Entity identifier
   * @returns Formatted string "Entity(idx:N, gen:M)"
   *
   * @example
   * ```typescript
   * const entity = EntityUtils.create(42, 5);
   * console.log(EntityUtils.toString(entity)); // "Entity(idx:42, gen:5)"
   * ```
   */
  toString(entity: Entity): string {
    const index = EntityUtils.getIndex(entity);
    const generation = EntityUtils.getGeneration(entity);
    return `Entity(idx:${index}, gen:${generation})`;
  }
};

/**
 * EntityPool manages entity lifecycle with generation tracking.
 *
 * Provides efficient entity creation and destruction with automatic
 * recycling of destroyed entity slots. Generation counters prevent
 * accessing stale entity references.
 *
 * @example
 * ```typescript
 * const pool = new EntityPool(128);
 *
 * // Create entities
 * const entity1 = pool.create();
 * const entity2 = pool.create();
 *
 * console.log(pool.aliveCount); // 2
 *
 * // Check if alive
 * pool.isAlive(entity1); // true
 *
 * // Destroy and recreate
 * pool.destroy(entity1);
 * pool.isAlive(entity1); // false (stale reference)
 *
 * const entity3 = pool.create(); // Reuses entity1's slot with new generation
 * pool.isAlive(entity1); // false (generation mismatch)
 * pool.isAlive(entity3); // true
 *
 * // Iteration
 * for (const entity of pool) {
 *   console.log(EntityUtils.toString(entity));
 * }
 *
 * // Clear all
 * pool.clear();
 * ```
 */
export class EntityPool {
  /**
   * Generation counter for each entity slot.
   * Index 0 is reserved (never used), so entities start at index 1.
   */
  private generations: Uint16Array;

  /**
   * Free list of available entity indices (LIFO for cache locality).
   * Destroyed entities are pushed here for reuse.
   */
  private freeList: number[];

  /**
   * Next index to allocate if free list is empty.
   */
  private nextIndex: number;

  /**
   * Number of currently alive entities.
   */
  private alive: number;

  /**
   * Creates a new EntityPool.
   *
   * @param initialCapacity - Initial capacity for entity storage (default: 1024)
   *
   * @example
   * ```typescript
   * const pool = new EntityPool(256);
   * ```
   */
  constructor(initialCapacity: number = 1024) {
    this.generations = new Uint16Array(initialCapacity);
    this.freeList = [];
    this.nextIndex = 1;
    this.alive = 0;

    this.generations[0] = 1;
  }

  /**
   * Creates a new entity, either by reusing a destroyed slot or allocating new.
   *
   * @returns New entity identifier
   * @throws Error if entity pool capacity is exhausted
   *
   * @example
   * ```typescript
   * const pool = new EntityPool();
   * const entity = pool.create();
   * console.log(EntityUtils.toString(entity)); // "Entity(idx:1, gen:0)"
   * ```
   */
  create(): Entity {
    let index: number;
    let generation: number;

    if (this.freeList.length > 0) {
      index = this.freeList.pop()!;
      generation = this.generations[index];
    } else {
      if (this.nextIndex >= EntityUtils.MAX_ENTITIES) {
        throw new Error('EntityPool capacity exhausted');
      }

      index = this.nextIndex++;

      if (index >= this.generations.length) {
        this.resize(this.generations.length * 2);
      }

      generation = this.generations[index];
    }

    this.alive++;
    return EntityUtils.create(index, generation);
  }

  /**
   * Destroys an entity, incrementing its generation and freeing its slot.
   *
   * After destruction, the entity identifier becomes invalid and isAlive()
   * will return false. The slot may be reused by future create() calls.
   *
   * @param entity - Entity to destroy
   * @throws Error if entity is invalid or already dead
   *
   * @example
   * ```typescript
   * const pool = new EntityPool();
   * const entity = pool.create();
   *
   * pool.isAlive(entity); // true
   * pool.destroy(entity);
   * pool.isAlive(entity); // false
   * ```
   */
  destroy(entity: Entity): void {
    if (!EntityUtils.isValid(entity)) {
      throw new Error('Cannot destroy invalid entity');
    }

    const index = EntityUtils.getIndex(entity);
    const generation = EntityUtils.getGeneration(entity);

    if (index === 0 || index >= this.nextIndex) {
      throw new Error(`Invalid entity index: ${index}`);
    }

    if (this.generations[index] !== generation) {
      throw new Error(`Entity already destroyed or generation mismatch: ${EntityUtils.toString(entity)}`);
    }

    this.generations[index] = (this.generations[index] + 1) & ENTITY_GENERATION_MASK;
    this.freeList.push(index);
    this.alive--;
  }

  /**
   * Checks if an entity is currently alive.
   *
   * An entity is alive if its generation matches the current generation
   * for its index slot. This detects stale references after destroy().
   *
   * @param entity - Entity to check
   * @returns true if entity is alive, false if destroyed or invalid
   *
   * @example
   * ```typescript
   * const pool = new EntityPool();
   * const entity = pool.create();
   *
   * pool.isAlive(entity); // true
   * pool.destroy(entity);
   * pool.isAlive(entity); // false
   *
   * const reused = pool.create(); // May reuse same index
   * pool.isAlive(entity); // false (generation mismatch)
   * pool.isAlive(reused); // true
   * ```
   */
  isAlive(entity: Entity): boolean {
    if (!EntityUtils.isValid(entity)) {
      return false;
    }

    const index = EntityUtils.getIndex(entity);
    const generation = EntityUtils.getGeneration(entity);

    if (index === 0 || index >= this.nextIndex) {
      return false;
    }

    return this.generations[index] === generation;
  }

  /**
   * Gets the number of currently alive entities.
   *
   * @returns Number of alive entities
   *
   * @example
   * ```typescript
   * const pool = new EntityPool();
   * console.log(pool.aliveCount); // 0
   *
   * const e1 = pool.create();
   * const e2 = pool.create();
   * console.log(pool.aliveCount); // 2
   *
   * pool.destroy(e1);
   * console.log(pool.aliveCount); // 1
   * ```
   */
  get aliveCount(): number {
    return this.alive;
  }

  /**
   * Gets the current capacity of the entity pool.
   *
   * @returns Maximum number of entities before reallocation
   *
   * @example
   * ```typescript
   * const pool = new EntityPool(256);
   * console.log(pool.capacity); // 256
   * ```
   */
  get capacity(): number {
    return this.generations.length;
  }

  /**
   * Iterates over all alive entities.
   *
   * @param callback - Function called for each alive entity
   *
   * @example
   * ```typescript
   * const pool = new EntityPool();
   * pool.create();
   * pool.create();
   * pool.create();
   *
   * pool.forEach(entity => {
   *   console.log(EntityUtils.toString(entity));
   * });
   * ```
   */
  forEach(callback: (entity: Entity) => void): void {
    for (let index = 1; index < this.nextIndex; index++) {
      const generation = this.generations[index];
      const entity = EntityUtils.create(index, generation);

      if (this.isAlive(entity)) {
        callback(entity);
      }
    }
  }

  /**
   * Iterator for alive entities, enables for-of loops.
   *
   * @returns Iterator over alive entities
   *
   * @example
   * ```typescript
   * const pool = new EntityPool();
   * pool.create();
   * pool.create();
   *
   * for (const entity of pool) {
   *   console.log(EntityUtils.toString(entity));
   * }
   * ```
   */
  *[Symbol.iterator](): Iterator<Entity> {
    for (let index = 1; index < this.nextIndex; index++) {
      const generation = this.generations[index];
      const entity = EntityUtils.create(index, generation);

      if (this.isAlive(entity)) {
        yield entity;
      }
    }
  }

  /**
   * Destroys all entities and resets the pool to initial state.
   *
   * After clear(), all existing entity references become invalid.
   *
   * @example
   * ```typescript
   * const pool = new EntityPool();
   * const e1 = pool.create();
   * const e2 = pool.create();
   *
   * console.log(pool.aliveCount); // 2
   *
   * pool.clear();
   *
   * console.log(pool.aliveCount); // 0
   * pool.isAlive(e1); // false
   * pool.isAlive(e2); // false
   * ```
   */
  clear(): void {
    this.generations.fill(0);
    this.generations[0] = 1;
    this.freeList.length = 0;
    this.nextIndex = 1;
    this.alive = 0;
  }

  /**
   * Resizes the internal storage to accommodate more entities.
   *
   * @param newCapacity - New capacity (must be larger than current)
   */
  private resize(newCapacity: number): void {
    const newGenerations = new Uint16Array(newCapacity);
    newGenerations.set(this.generations);
    this.generations = newGenerations;
  }
}
