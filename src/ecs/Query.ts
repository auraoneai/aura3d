/**
 * Query system for defining component requirements and iterating matching entities.
 *
 * Queries define filters for entities based on component presence using 'all', 'any', and 'none'
 * clauses. They cache matching archetypes for efficient iteration and automatically update
 * when archetypes are added/removed.
 *
 * @module ecs/Query
 *
 * @example
 * ```typescript
 * // Create a query for entities with Position and Velocity
 * const movementQuery = Query.all(Position, Velocity);
 *
 * // Iterate over matching entities
 * movementQuery.forEach((entity, components) => {
 *   const [position, velocity] = components;
 *   position.x += velocity.x;
 * });
 *
 * // Typed iteration
 * movementQuery.forEachWith([Position, Velocity], (entity, position, velocity) => {
 *   position.x += velocity.x;
 * });
 *
 * // Generator-based iteration
 * for (const entity of movementQuery) {
 *   console.log(entity);
 * }
 *
 * // Complex query: has Transform, has (Mesh or Sprite), not hidden
 * const renderQuery = new Query({
 *   all: [Transform],
 *   any: [Mesh, Sprite],
 *   none: [Hidden]
 * });
 * ```
 */

import { Entity } from './Entity';
import { Bitset } from './Bitset';
import { ComponentId, IComponent, ComponentType, ComponentRegistry } from './ComponentRegistry';
import { Archetype } from './Archetype';

/**
 * Descriptor for defining query component requirements.
 *
 * @example
 * ```typescript
 * const descriptor: QueryDescriptor = {
 *   all: [Position, Velocity],  // Must have both
 *   any: [Mesh, Sprite],         // Must have at least one
 *   none: [Hidden, Disabled]     // Must not have either
 * };
 * ```
 */
export interface QueryDescriptor {
  /**
   * Components that must all be present.
   * Entity must have all components in this list.
   */
  all?: ComponentType[];

  /**
   * Components where at least one must be present.
   * Entity must have at least one component from this list.
   * Empty array matches all entities.
   */
  any?: ComponentType[];

  /**
   * Components that must not be present.
   * Entity must not have any components in this list.
   */
  none?: ComponentType[];
}

/**
 * Query for filtering entities based on component requirements.
 *
 * Queries use bitset masks for efficient archetype matching and cache matching
 * archetypes for fast iteration. Version tracking enables change detection.
 *
 * @example
 * ```typescript
 * // Static factory methods
 * const positionQuery = Query.all(Position);
 * const renderQuery = Query.any(Mesh, Sprite);
 * const activeQuery = Query.none(Hidden);
 *
 * // Complex queries
 * const query = new Query({
 *   all: [Transform, Physics],
 *   any: [Mesh, Sprite],
 *   none: [Hidden, Disabled]
 * });
 *
 * // Check archetype matching
 * if (query.matches(archetype)) {
 *   query._addArchetype(archetype);
 * }
 *
 * // Iterate entities
 * query.forEach((entity, components) => {
 *   // Process entity
 * });
 *
 * // Get count
 * console.log(`${query.entityCount} entities match query`);
 * ```
 */
export class Query {
  /**
   * Original query descriptor.
   */
  readonly descriptor: QueryDescriptor;

  /**
   * Bitset mask for required components (all must be present).
   */
  readonly requiredMask: Bitset;

  /**
   * Bitset mask for optional components (at least one must be present).
   * Empty mask means no 'any' requirement.
   */
  readonly anyMask: Bitset;

  /**
   * Bitset mask for excluded components (none must be present).
   */
  readonly excludedMask: Bitset;

  /**
   * Cached array of matching archetypes.
   * Managed by World during archetype lifecycle.
   */
  private _matchingArchetypes: Archetype[];

  /**
   * Version counter incremented when archetype membership changes.
   * Used for change detection.
   */
  version: number;

  /**
   * Creates a new Query from a descriptor.
   *
   * @param descriptor - Query component requirements
   *
   * @example
   * ```typescript
   * const query = new Query({
   *   all: [Position, Velocity],
   *   any: [Mesh, Sprite],
   *   none: [Hidden]
   * });
   * ```
   */
  constructor(descriptor: QueryDescriptor) {
    this.descriptor = descriptor;
    this.requiredMask = new Bitset();
    this.anyMask = new Bitset();
    this.excludedMask = new Bitset();
    this._matchingArchetypes = [];
    this.version = 0;

    // Build required mask from 'all' components
    if (descriptor.all && descriptor.all.length > 0) {
      for (const componentType of descriptor.all) {
        const id = ComponentRegistry.getId(componentType);
        this.requiredMask.set(id);
      }
    }

    // Build any mask from 'any' components
    if (descriptor.any && descriptor.any.length > 0) {
      for (const componentType of descriptor.any) {
        const id = ComponentRegistry.getId(componentType);
        this.anyMask.set(id);
      }
    }

    // Build excluded mask from 'none' components
    if (descriptor.none && descriptor.none.length > 0) {
      for (const componentType of descriptor.none) {
        const id = ComponentRegistry.getId(componentType);
        this.excludedMask.set(id);
      }
    }
  }

  /**
   * Gets the readonly array of matching archetypes.
   *
   * @returns Readonly array of archetypes that match this query
   *
   * @example
   * ```typescript
   * const archetypes = query.matchingArchetypes;
   * console.log(`Query matches ${archetypes.length} archetypes`);
   * ```
   */
  get matchingArchetypes(): readonly Archetype[] {
    return this._matchingArchetypes;
  }

  /**
   * Checks if an archetype matches this query.
   *
   * An archetype matches if:
   * - It contains all required components (all)
   * - It contains at least one optional component (any), or any is empty
   * - It contains none of the excluded components (none)
   *
   * Performance: < 0.001ms for typical queries
   *
   * @param archetype - Archetype to test
   * @returns true if archetype matches, false otherwise
   *
   * @example
   * ```typescript
   * const query = Query.all(Position, Velocity);
   * if (query.matches(archetype)) {
   *   console.log('Archetype matches query');
   * }
   * ```
   */
  matches(archetype: Archetype): boolean {
    return this.matchesSignature(archetype.signature);
  }

  /**
   * Checks if a component signature matches this query.
   *
   * More efficient than matches() when you already have the signature bitset.
   *
   * Match formula:
   * - (sig & required) === required: All required bits are set
   * - (sig & any) !== 0 OR any.isEmpty(): At least one any bit is set, or no any requirement
   * - (sig & excluded) === 0: No excluded bits are set
   *
   * @param signature - Component signature bitset to test
   * @returns true if signature matches, false otherwise
   *
   * @example
   * ```typescript
   * const signature = new Bitset();
   * signature.set(ComponentRegistry.getId(Position));
   * signature.set(ComponentRegistry.getId(Velocity));
   *
   * if (query.matchesSignature(signature)) {
   *   console.log('Signature matches query');
   * }
   * ```
   */
  matchesSignature(signature: Bitset): boolean {
    // Check required: all required bits must be set
    // (sig & required) === required
    if (!signature.contains(this.requiredMask)) {
      return false;
    }

    // Check any: at least one any bit must be set (if any mask is not empty)
    // (sig & any) !== 0 OR any.isEmpty()
    if (!this.anyMask.isEmpty() && !signature.intersects(this.anyMask)) {
      return false;
    }

    // Check excluded: no excluded bits must be set
    // (sig & excluded) === 0
    if (signature.intersects(this.excludedMask)) {
      return false;
    }

    return true;
  }

  /**
   * Adds an archetype to the cached matching archetypes list.
   *
   * This is an internal method called by World when a new archetype is created
   * or when queries are updated. Increments the version counter.
   *
   * @param archetype - Archetype to add
   *
   * @example
   * ```typescript
   * // Internal use by World
   * if (query.matches(newArchetype)) {
   *   query._addArchetype(newArchetype);
   * }
   * ```
   */
  _addArchetype(archetype: Archetype): void {
    this._matchingArchetypes.push(archetype);
    this.version++;
  }

  /**
   * Removes an archetype from the cached matching archetypes list.
   *
   * This is an internal method called by World when an archetype is destroyed
   * or becomes empty. Increments the version counter.
   *
   * @param archetype - Archetype to remove
   *
   * @example
   * ```typescript
   * // Internal use by World
   * query._removeArchetype(emptyArchetype);
   * ```
   */
  _removeArchetype(archetype: Archetype): void {
    const index = this._matchingArchetypes.indexOf(archetype);
    if (index !== -1) {
      this._matchingArchetypes.splice(index, 1);
      this.version++;
    }
  }

  /**
   * Gets a readonly array of all entities matching this query.
   * Note: This creates a new array on each call. For iteration, prefer using forEach or the iterator.
   *
   * @returns Array of entity IDs
   *
   * @example
   * ```typescript
   * const entityArray = query.entityArray;
   * console.log(`Query has ${entityArray.length} entities`);
   * ```
   */
  get entityArray(): readonly Entity[] {
    const result: Entity[] = [];
    for (const archetype of this._matchingArchetypes) {
      const entities = archetype.entities;
      const entityCount = archetype.entityCount;
      for (let i = 0; i < entityCount; i++) {
        result.push(entities[i]);
      }
    }
    return result;
  }

  /**
   * Gets the total number of entities across all matching archetypes.
   *
   * @returns Sum of entity counts in all matching archetypes
   *
   * @example
   * ```typescript
   * console.log(`Query matches ${query.entityCount} entities`);
   * ```
   */
  get entityCount(): number {
    let count = 0;
    for (const archetype of this._matchingArchetypes) {
      count += archetype.entityCount;
    }
    return count;
  }

  /**
   * Gets the components for a specific entity if it matches this query.
   *
   * @param entity - Entity to get components for
   * @returns Array of component instances, or null if entity doesn't match query
   *
   * @example
   * ```typescript
   * const components = query.get(entity);
   * if (components) {
   *   console.log(`Entity has ${components.length} components`);
   * }
   * ```
   */
  get(entity: Entity): IComponent[] | null {
    for (const archetype of this._matchingArchetypes) {
      if (archetype.hasEntity(entity)) {
        return archetype.getComponents(entity);
      }
    }
    return null;
  }

  /**
   * Iterates over all entities matching this query.
   *
   * Provides access to entity ID and component array. Components are in the order
   * defined by the archetype, not the query descriptor order.
   *
   * @param callback - Function called for each matching entity
   *
   * @example
   * ```typescript
   * const query = Query.all(Position, Velocity);
   *
   * query.forEach((entity, components) => {
   *   console.log(`Entity ${entity} has ${components.length} components`);
   *   // Note: component order depends on archetype, not query
   * });
   * ```
   */
  forEach(callback: (entity: Entity, components: IComponent[]) => void): void {
    for (const archetype of this._matchingArchetypes) {
      const entities = archetype.entities;
      const entityCount = archetype.entityCount;

      for (let i = 0; i < entityCount; i++) {
        const entity = entities[i];
        const components = archetype.getComponents(entity);
        callback(entity, components);
      }
    }
  }

  /**
   * Iterates over entities with typed component access.
   *
   * Provides strongly-typed access to specific components in the order specified.
   * More convenient than forEach() when you need specific component types.
   *
   * @typeParam T - Tuple type of component array
   * @param types - Array of component types to extract
   * @param callback - Function called for each entity with typed components
   *
   * @example
   * ```typescript
   * const query = Query.all(Position, Velocity, Mass);
   *
   * // Get specific components in specific order
   * query.forEachWith([Position, Velocity], (entity, position, velocity) => {
   *   position.x += velocity.x * deltaTime;
   *   position.y += velocity.y * deltaTime;
   * });
   * ```
   */
  forEachWith<T extends IComponent[]>(
    types: ComponentType[],
    callback: (entity: Entity, ...components: T) => void
  ): void {
    // Get component IDs for the requested types
    const componentIds = types.map(type => ComponentRegistry.getId(type));

    for (const archetype of this._matchingArchetypes) {
      const entities = archetype.entities;
      const entityCount = archetype.entityCount;

      for (let i = 0; i < entityCount; i++) {
        const entity = entities[i];

        // Extract requested components in order
        const components: IComponent[] = [];
        for (const componentId of componentIds) {
          const component = archetype.getComponent(entity, componentId);
          if (component) {
            components.push(component);
          }
        }

        // Only call callback if all components were found
        if (components.length === types.length) {
          callback(entity, ...(components as T));
        }
      }
    }
  }

  /**
   * Iterator for matching entities (enables for-of loops).
   *
   * @returns Iterator over entity IDs
   *
   * @example
   * ```typescript
   * const query = Query.all(Position);
   *
   * for (const entity of query) {
   *   console.log(`Entity: ${entity}`);
   * }
   * ```
   */
  *[Symbol.iterator](): Iterator<Entity> {
    for (const archetype of this._matchingArchetypes) {
      const entities = archetype.entities;
      const entityCount = archetype.entityCount;

      for (let i = 0; i < entityCount; i++) {
        yield entities[i];
      }
    }
  }

  /**
   * Generator for iterating over matching entities.
   *
   * Equivalent to using [Symbol.iterator], provided for explicit usage.
   *
   * @returns Generator yielding entity IDs
   *
   * @example
   * ```typescript
   * const query = Query.all(Position);
   *
   * const entityGen = query.entities();
   * for (const entity of entityGen) {
   *   console.log(`Entity: ${entity}`);
   * }
   * ```
   */
  *entities(): Generator<Entity> {
    for (const archetype of this._matchingArchetypes) {
      const entities = archetype.entities;
      const entityCount = archetype.entityCount;

      for (let i = 0; i < entityCount; i++) {
        yield entities[i];
      }
    }
  }

  /**
   * Creates a query that requires all specified components.
   *
   * @param components - Component types that must all be present
   * @returns New query requiring all components
   *
   * @example
   * ```typescript
   * const query = Query.all(Position, Velocity, Mass);
   *
   * // Equivalent to:
   * const query = new Query({
   *   all: [Position, Velocity, Mass]
   * });
   * ```
   */
  static all(...components: ComponentType[]): Query {
    return new Query({
      all: components
    });
  }

  /**
   * Creates a query that requires at least one of the specified components.
   *
   * @param components - Component types where at least one must be present
   * @returns New query requiring at least one component
   *
   * @example
   * ```typescript
   * const query = Query.any(Mesh, Sprite, ParticleEmitter);
   *
   * // Equivalent to:
   * const query = new Query({
   *   any: [Mesh, Sprite, ParticleEmitter]
   * });
   * ```
   */
  static any(...components: ComponentType[]): Query {
    return new Query({
      any: components
    });
  }

  /**
   * Creates a query that excludes entities with any of the specified components.
   *
   * @param components - Component types that must not be present
   * @returns New query excluding all components
   *
   * @example
   * ```typescript
   * const query = Query.none(Hidden, Disabled, Destroyed);
   *
   * // Equivalent to:
   * const query = new Query({
   *   none: [Hidden, Disabled, Destroyed]
   * });
   * ```
   */
  static none(...components: ComponentType[]): Query {
    return new Query({
      none: components
    });
  }

  /**
   * Creates a query from a descriptor object.
   *
   * This is an alias for the constructor, provided for consistency with other
   * static factory methods.
   *
   * @param descriptor - Query component requirements
   * @returns New query from descriptor
   *
   * @example
   * ```typescript
   * const query = Query.fromDescriptor({
   *   all: [Transform, Physics],
   *   any: [Mesh, Sprite],
   *   none: [Hidden]
   * });
   *
   * // Equivalent to:
   * const query = new Query({
   *   all: [Transform, Physics],
   *   any: [Mesh, Sprite],
   *   none: [Hidden]
   * });
   * ```
   */
  static fromDescriptor(descriptor: QueryDescriptor): Query {
    return new Query(descriptor);
  }
}

// QueryDescriptor is exported via index.ts
