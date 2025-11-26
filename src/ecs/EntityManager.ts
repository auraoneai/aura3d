/**
 * EntityManager.ts
 *
 * Manages entity lifecycle and archetype transitions in a high-performance ECS.
 * Uses archetype-based storage with efficient component add/remove via graph edges.
 *
 * Key features:
 * - Entity creation/destruction with generation tracking via EntityPool
 * - Archetype-based component storage for cache-friendly iteration
 * - O(1) archetype lookup by signature hash
 * - Archetype graph edges for efficient component add/remove transitions
 * - Query cache management for fast entity iteration
 * - Bulk operations for component manipulation
 *
 * Performance targets:
 * - Entity creation: < 0.01ms
 * - Component add/remove: < 0.001ms (using archetype edges)
 * - 100k entity iteration: < 1ms
 *
 * @module ecs/EntityManager
 */

import { Entity, EntityPool, EntityUtils } from './Entity';
import { Bitset } from './Bitset';
import { ComponentId, IComponent, ComponentType, ComponentRegistry } from './ComponentRegistry';

/**
 * Archetype interface for component storage organization.
 * An Archetype represents a unique set of component types.
 * Full implementation in Archetype.ts extends this interface.
 */
export interface Archetype {
  signature: Bitset;
  componentIds: ComponentId[];
  entities: Entity[];
  components: Map<ComponentId, any[]>;
  addEdges: Map<ComponentId, Archetype>;
  removeEdges: Map<ComponentId, Archetype>;

  addEntity(entity: Entity): number;
  removeEntity(row: number): Entity | undefined;
  getComponent<T extends IComponent>(componentId: ComponentId, row: number): T | undefined;
  setComponent<T extends IComponent>(componentId: ComponentId, row: number, component: T): void;
  hasComponent(componentId: ComponentId): boolean;
  moveEntity(row: number, targetArchetype: Archetype, entity: Entity): number;
}

/**
 * Query interface for entity iteration by component pattern.
 * A Query represents a pattern for matching entities with specific components.
 * Full implementation in Query.ts extends this interface.
 */
export interface Query {
  readonly descriptor: QueryDescriptor;
  readonly matchingArchetypes: Set<Archetype>;

  matches(signature: Bitset): boolean;
  addArchetype(archetype: Archetype): void;
  removeArchetype(archetype: Archetype): void;
  execute(callback: (entity: Entity, archetype: Archetype, row: number) => void): void;
}

/**
 * Query descriptor defines the component requirements for a query.
 */
export interface QueryDescriptor {
  all?: ComponentType[];
  any?: ComponentType[];
  none?: ComponentType[];
}

/**
 * Maps an entity to its current archetype and row within that archetype.
 * Used for O(1) entity component lookup and archetype transitions.
 */
export interface EntityRecord {
  /** The archetype this entity currently belongs to */
  archetype: Archetype;
  /** The row/index within the archetype's component arrays */
  row: number;
}

/**
 * Simple Archetype implementation for internal use.
 * This is a minimal implementation that will be replaced by the full Archetype.ts.
 */
class SimpleArchetype implements Archetype {
  signature: Bitset;
  componentIds: ComponentId[];
  entities: Entity[];
  components: Map<ComponentId, any[]>;
  addEdges: Map<ComponentId, Archetype>;
  removeEdges: Map<ComponentId, Archetype>;

  constructor(signature: Bitset, componentIds: ComponentId[]) {
    this.signature = signature.clone();
    this.componentIds = [...componentIds].sort((a, b) => a - b);
    this.entities = [];
    this.components = new Map();
    this.addEdges = new Map();
    this.removeEdges = new Map();

    for (const id of this.componentIds) {
      this.components.set(id, []);
    }
  }

  addEntity(entity: Entity): number {
    const row = this.entities.length;
    this.entities.push(entity);

    for (const id of this.componentIds) {
      const array = this.components.get(id)!;
      array.push(undefined);
    }

    return row;
  }

  removeEntity(row: number): Entity | undefined {
    if (row < 0 || row >= this.entities.length) {
      return undefined;
    }

    const entity = this.entities[row];
    const lastRow = this.entities.length - 1;

    if (row !== lastRow) {
      this.entities[row] = this.entities[lastRow];

      for (const id of this.componentIds) {
        const array = this.components.get(id)!;
        array[row] = array[lastRow];
      }
    }

    this.entities.pop();
    for (const id of this.componentIds) {
      this.components.get(id)!.pop();
    }

    return entity;
  }

  getComponent<T extends IComponent>(componentId: ComponentId, row: number): T | undefined {
    const array = this.components.get(componentId);
    if (!array || row < 0 || row >= array.length) {
      return undefined;
    }
    return array[row];
  }

  setComponent<T extends IComponent>(componentId: ComponentId, row: number, component: T): void {
    const array = this.components.get(componentId);
    if (array && row >= 0 && row < array.length) {
      array[row] = component;
    }
  }

  hasComponent(componentId: ComponentId): boolean {
    return this.components.has(componentId);
  }

  moveEntity(row: number, targetArchetype: Archetype, entity: Entity): number {
    const newRow = targetArchetype.addEntity(entity);

    for (const componentId of this.componentIds) {
      if (targetArchetype.hasComponent(componentId)) {
        const component = this.getComponent(componentId, row);
        if (component !== undefined) {
          targetArchetype.setComponent(componentId, newRow, component);
        }
      }
    }

    this.removeEntity(row);
    return newRow;
  }
}

/**
 * Simple Query implementation for internal use.
 */
class SimpleQuery implements Query {
  readonly descriptor: QueryDescriptor;
  readonly matchingArchetypes: Set<Archetype>;
  private allBits: Bitset;
  private anyBits: Bitset;
  private noneBits: Bitset;

  constructor(descriptor: QueryDescriptor) {
    this.descriptor = descriptor;
    this.matchingArchetypes = new Set();

    this.allBits = new Bitset();
    this.anyBits = new Bitset();
    this.noneBits = new Bitset();

    if (descriptor.all) {
      for (const type of descriptor.all) {
        const id = ComponentRegistry.getId(type);
        this.allBits.set(id);
      }
    }

    if (descriptor.any) {
      for (const type of descriptor.any) {
        const id = ComponentRegistry.getId(type);
        this.anyBits.set(id);
      }
    }

    if (descriptor.none) {
      for (const type of descriptor.none) {
        const id = ComponentRegistry.getId(type);
        this.noneBits.set(id);
      }
    }
  }

  matches(signature: Bitset): boolean {
    if (!this.allBits.isEmpty() && !signature.contains(this.allBits)) {
      return false;
    }

    if (!this.anyBits.isEmpty() && !signature.intersects(this.anyBits)) {
      return false;
    }

    if (!this.noneBits.isEmpty() && signature.intersects(this.noneBits)) {
      return false;
    }

    return true;
  }

  addArchetype(archetype: Archetype): void {
    this.matchingArchetypes.add(archetype);
  }

  removeArchetype(archetype: Archetype): void {
    this.matchingArchetypes.delete(archetype);
  }

  execute(callback: (entity: Entity, archetype: Archetype, row: number) => void): void {
    for (const archetype of this.matchingArchetypes) {
      for (let row = 0; row < archetype.entities.length; row++) {
        callback(archetype.entities[row], archetype, row);
      }
    }
  }
}

/**
 * EntityManager manages entity lifecycle and archetype transitions.
 *
 * Responsibilities:
 * - Creating and destroying entities with generation tracking
 * - Adding/removing components and transitioning entities between archetypes
 * - Managing the archetype graph with edges for efficient transitions
 * - Maintaining query caches for fast entity iteration
 * - Providing bulk operations for component manipulation
 *
 * Architecture:
 * - EntityPool: manages entity ID allocation and generation tracking
 * - EntityRecord: maps entity to its archetype and row for O(1) lookup
 * - Archetype graph: tracks edges for component add/remove transitions
 * - Query cache: maintains which archetypes match each query
 *
 * @example
 * ```typescript
 * const manager = new EntityManager();
 *
 * // Create entity and add components
 * const entity = manager.createEntity();
 * manager.addComponent(entity, new Position(10, 20, 30));
 * manager.addComponent(entity, new Velocity(1, 0, 0));
 *
 * // Check and retrieve components
 * if (manager.hasComponent(entity, Position)) {
 *   const pos = manager.getComponent(entity, Position);
 *   console.log(`Position: ${pos.x}, ${pos.y}, ${pos.z}`);
 * }
 *
 * // Remove component (transitions to new archetype)
 * manager.removeComponent(entity, Velocity);
 *
 * // Bulk operations
 * manager.addComponents(entity, [
 *   new Health(100),
 *   new Armor(50)
 * ]);
 *
 * // Query entities
 * const query = manager.createQuery({
 *   all: [Position, Velocity],
 *   none: [Frozen]
 * });
 *
 * // Destroy entity
 * manager.destroyEntity(entity);
 *
 * // Statistics
 * console.log(`Entities: ${manager.entityCount}`);
 * console.log(`Archetypes: ${manager.archetypeCount}`);
 * ```
 */
export class EntityManager {
  /**
   * Entity pool for ID management with generation tracking.
   */
  private entityPool: EntityPool;

  /**
   * Maps entity to its archetype location (archetype + row).
   * Sparse array indexed by entity index for O(1) access.
   */
  private entityRecords: (EntityRecord | undefined)[];

  /**
   * Maps archetype signature hash to archetype instance.
   * Enables O(1) archetype lookup by component signature.
   */
  private archetypeMap: Map<number, Archetype>;

  /**
   * All archetypes in the system.
   */
  private archetypes: Archetype[];

  /**
   * The empty archetype (no components).
   * All entities start here when created.
   */
  private emptyArchetype: Archetype;

  /**
   * All queries in the system.
   * Maintained to update query caches when new archetypes are created.
   */
  private queries: Query[];

  /**
   * Creates a new EntityManager.
   *
   * @param initialCapacity - Initial capacity for entity storage (default: 1024)
   *
   * @example
   * ```typescript
   * const manager = new EntityManager(2048);
   * ```
   */
  constructor(initialCapacity: number = 1024) {
    this.entityPool = new EntityPool(initialCapacity);
    this.entityRecords = [];
    this.archetypeMap = new Map();
    this.archetypes = [];
    this.queries = [];

    const emptySignature = new Bitset();
    this.emptyArchetype = new SimpleArchetype(emptySignature, []);
    this.archetypes.push(this.emptyArchetype);
    this.archetypeMap.set(emptySignature.hash(), this.emptyArchetype);
  }

  /**
   * Creates a new entity with no components.
   * The entity starts in the empty archetype.
   *
   * @returns New entity identifier
   * @throws Error if entity pool capacity is exhausted
   *
   * @example
   * ```typescript
   * const entity = manager.createEntity();
   * console.log(EntityUtils.toString(entity)); // "Entity(idx:1, gen:0)"
   * ```
   */
  createEntity(): Entity {
    const entity = this.entityPool.create();
    const index = EntityUtils.getIndex(entity);

    if (index >= this.entityRecords.length) {
      this.entityRecords.length = index + 1;
    }

    const row = this.emptyArchetype.addEntity(entity);
    this.entityRecords[index] = {
      archetype: this.emptyArchetype,
      row
    };

    return entity;
  }

  /**
   * Destroys an entity and removes it from all archetypes.
   * After destruction, the entity identifier becomes invalid.
   *
   * @param entity - Entity to destroy
   * @throws Error if entity is invalid or already destroyed
   *
   * @example
   * ```typescript
   * const entity = manager.createEntity();
   * manager.addComponent(entity, new Position(0, 0, 0));
   *
   * manager.isAlive(entity); // true
   * manager.destroyEntity(entity);
   * manager.isAlive(entity); // false
   * ```
   */
  destroyEntity(entity: Entity): void {
    if (!this.isAlive(entity)) {
      throw new Error(`Cannot destroy invalid or dead entity: ${EntityUtils.toString(entity)}`);
    }

    const index = EntityUtils.getIndex(entity);
    const record = this.entityRecords[index]!;

    const movedEntity = record.archetype.removeEntity(record.row);
    if (movedEntity !== undefined && movedEntity !== entity) {
      const movedIndex = EntityUtils.getIndex(movedEntity);
      const movedRecord = this.entityRecords[movedIndex];
      if (movedRecord) {
        movedRecord.row = record.row;
      }
    }

    this.entityRecords[index] = undefined;
    this.entityPool.destroy(entity);
  }

  /**
   * Checks if an entity is currently alive.
   *
   * @param entity - Entity to check
   * @returns true if entity is alive, false if destroyed or invalid
   *
   * @example
   * ```typescript
   * const entity = manager.createEntity();
   * manager.isAlive(entity); // true
   *
   * manager.destroyEntity(entity);
   * manager.isAlive(entity); // false
   * ```
   */
  isAlive(entity: Entity): boolean {
    return this.entityPool.isAlive(entity);
  }

  /**
   * Adds a component to an entity, transitioning it to a new archetype.
   * Uses archetype edges for O(1) archetype lookup when available.
   *
   * @typeParam T - Component type implementing IComponent
   * @param entity - Entity to add component to
   * @param component - Component instance to add
   * @throws Error if entity is invalid or component type not registered
   *
   * @example
   * ```typescript
   * const entity = manager.createEntity();
   * manager.addComponent(entity, new Position(10, 20, 30));
   * manager.addComponent(entity, new Velocity(1, 0, 0));
   * ```
   */
  addComponent<T extends IComponent>(entity: Entity, component: T): void {
    if (!this.isAlive(entity)) {
      throw new Error(`Cannot add component to invalid or dead entity: ${EntityUtils.toString(entity)}`);
    }

    const componentId = ComponentRegistry.getId(component.constructor as ComponentType<T>);
    const index = EntityUtils.getIndex(entity);
    const record = this.entityRecords[index]!;

    if (record.archetype.hasComponent(componentId)) {
      record.archetype.setComponent(componentId, record.row, component);
      return;
    }

    let targetArchetype = record.archetype.addEdges.get(componentId);
    if (!targetArchetype) {
      const newSignature = record.archetype.signature.clone();
      newSignature.set(componentId);
      targetArchetype = this.getOrCreateArchetype(newSignature);
      record.archetype.addEdges.set(componentId, targetArchetype);
      targetArchetype.removeEdges.set(componentId, record.archetype);
    }

    const newRow = record.archetype.moveEntity(record.row, targetArchetype, entity);

    const movedEntity = record.archetype.entities[record.row];
    if (movedEntity !== undefined) {
      const movedIndex = EntityUtils.getIndex(movedEntity);
      const movedRecord = this.entityRecords[movedIndex];
      if (movedRecord) {
        movedRecord.row = record.row;
      }
    }

    record.archetype = targetArchetype;
    record.row = newRow;

    targetArchetype.setComponent(componentId, newRow, component);

    if (component.onAttach) {
      component.onAttach(entity);
    }
  }

  /**
   * Removes a component from an entity, transitioning it to a new archetype.
   * Uses archetype edges for O(1) archetype lookup when available.
   *
   * @typeParam T - Component type implementing IComponent
   * @param entity - Entity to remove component from
   * @param type - Component class/constructor to remove
   * @throws Error if entity is invalid or component type not registered
   *
   * @example
   * ```typescript
   * manager.removeComponent(entity, Velocity);
   * ```
   */
  removeComponent<T extends IComponent>(entity: Entity, type: ComponentType<T>): void {
    if (!this.isAlive(entity)) {
      throw new Error(`Cannot remove component from invalid or dead entity: ${EntityUtils.toString(entity)}`);
    }

    const componentId = ComponentRegistry.getId(type);
    const index = EntityUtils.getIndex(entity);
    const record = this.entityRecords[index]!;

    if (!record.archetype.hasComponent(componentId)) {
      return;
    }

    const component = record.archetype.getComponent(componentId, record.row);
    if (component && (component as any).onDetach) {
      (component as any).onDetach(entity);
    }

    let targetArchetype = record.archetype.removeEdges.get(componentId);
    if (!targetArchetype) {
      const newSignature = record.archetype.signature.clone();
      newSignature.unset(componentId);
      targetArchetype = this.getOrCreateArchetype(newSignature);
      record.archetype.removeEdges.set(componentId, targetArchetype);
      targetArchetype.addEdges.set(componentId, record.archetype);
    }

    const newRow = record.archetype.moveEntity(record.row, targetArchetype, entity);

    const movedEntity = record.archetype.entities[record.row];
    if (movedEntity !== undefined) {
      const movedIndex = EntityUtils.getIndex(movedEntity);
      const movedRecord = this.entityRecords[movedIndex];
      if (movedRecord) {
        movedRecord.row = record.row;
      }
    }

    record.archetype = targetArchetype;
    record.row = newRow;
  }

  /**
   * Gets a component from an entity.
   *
   * @typeParam T - Component type implementing IComponent
   * @param entity - Entity to get component from
   * @param type - Component class/constructor to get
   * @returns Component instance, or undefined if not found
   *
   * @example
   * ```typescript
   * const position = manager.getComponent(entity, Position);
   * if (position) {
   *   console.log(`Position: ${position.x}, ${position.y}, ${position.z}`);
   * }
   * ```
   */
  getComponent<T extends IComponent>(entity: Entity, type: ComponentType<T>): T | undefined {
    if (!this.isAlive(entity)) {
      return undefined;
    }

    const componentId = ComponentRegistry.getId(type);
    const index = EntityUtils.getIndex(entity);
    const record = this.entityRecords[index];

    if (!record) {
      return undefined;
    }

    return record.archetype.getComponent<T>(componentId, record.row);
  }

  /**
   * Checks if an entity has a specific component.
   *
   * @typeParam T - Component type implementing IComponent
   * @param entity - Entity to check
   * @param type - Component class/constructor to check for
   * @returns true if entity has the component, false otherwise
   *
   * @example
   * ```typescript
   * if (manager.hasComponent(entity, Position)) {
   *   console.log('Entity has position');
   * }
   * ```
   */
  hasComponent<T extends IComponent>(entity: Entity, type: ComponentType<T>): boolean {
    if (!this.isAlive(entity)) {
      return false;
    }

    const componentId = ComponentRegistry.getId(type);
    const index = EntityUtils.getIndex(entity);
    const record = this.entityRecords[index];

    if (!record) {
      return false;
    }

    return record.archetype.hasComponent(componentId);
  }

  /**
   * Sets a component on an entity.
   * If the entity doesn't have the component, it will be added.
   * If the entity already has the component, it will be replaced.
   *
   * @typeParam T - Component type implementing IComponent
   * @param entity - Entity to set component on
   * @param component - Component instance to set
   *
   * @example
   * ```typescript
   * manager.setComponent(entity, new Position(10, 20, 30));
   * manager.setComponent(entity, new Position(15, 25, 35)); // Updates existing
   * ```
   */
  setComponent<T extends IComponent>(entity: Entity, component: T): void {
    const type = component.constructor as ComponentType<T>;

    if (this.hasComponent(entity, type)) {
      const componentId = ComponentRegistry.getId(type);
      const index = EntityUtils.getIndex(entity);
      const record = this.entityRecords[index]!;
      record.archetype.setComponent(componentId, record.row, component);
    } else {
      this.addComponent(entity, component);
    }
  }

  /**
   * Adds multiple components to an entity in a single operation.
   * More efficient than calling addComponent multiple times.
   *
   * @param entity - Entity to add components to
   * @param components - Array of component instances to add
   *
   * @example
   * ```typescript
   * manager.addComponents(entity, [
   *   new Position(10, 20, 30),
   *   new Velocity(1, 0, 0),
   *   new Health(100)
   * ]);
   * ```
   */
  addComponents(entity: Entity, components: IComponent[]): void {
    if (!this.isAlive(entity)) {
      throw new Error(`Cannot add components to invalid or dead entity: ${EntityUtils.toString(entity)}`);
    }

    if (components.length === 0) {
      return;
    }

    const index = EntityUtils.getIndex(entity);
    const record = this.entityRecords[index]!;

    const newSignature = record.archetype.signature.clone();
    const componentsToAdd: Array<{ id: ComponentId; component: IComponent }> = [];

    for (const component of components) {
      const componentId = ComponentRegistry.getId(component.constructor as ComponentType);
      if (!record.archetype.hasComponent(componentId)) {
        newSignature.set(componentId);
        componentsToAdd.push({ id: componentId, component });
      }
    }

    if (componentsToAdd.length === 0) {
      return;
    }

    const targetArchetype = this.getOrCreateArchetype(newSignature);
    const newRow = record.archetype.moveEntity(record.row, targetArchetype, entity);

    const movedEntity = record.archetype.entities[record.row];
    if (movedEntity !== undefined) {
      const movedIndex = EntityUtils.getIndex(movedEntity);
      const movedRecord = this.entityRecords[movedIndex];
      if (movedRecord) {
        movedRecord.row = record.row;
      }
    }

    record.archetype = targetArchetype;
    record.row = newRow;

    for (const { id, component } of componentsToAdd) {
      targetArchetype.setComponent(id, newRow, component);
      if ((component as any).onAttach) {
        (component as any).onAttach(entity);
      }
    }
  }

  /**
   * Removes multiple components from an entity in a single operation.
   * More efficient than calling removeComponent multiple times.
   *
   * @param entity - Entity to remove components from
   * @param types - Array of component classes/constructors to remove
   *
   * @example
   * ```typescript
   * manager.removeComponents(entity, [Velocity, Acceleration]);
   * ```
   */
  removeComponents(entity: Entity, types: ComponentType[]): void {
    if (!this.isAlive(entity)) {
      throw new Error(`Cannot remove components from invalid or dead entity: ${EntityUtils.toString(entity)}`);
    }

    if (types.length === 0) {
      return;
    }

    const index = EntityUtils.getIndex(entity);
    const record = this.entityRecords[index]!;

    const newSignature = record.archetype.signature.clone();
    const componentsToRemove: ComponentId[] = [];

    for (const type of types) {
      const componentId = ComponentRegistry.getId(type);
      if (record.archetype.hasComponent(componentId)) {
        newSignature.unset(componentId);
        componentsToRemove.push(componentId);
      }
    }

    if (componentsToRemove.length === 0) {
      return;
    }

    for (const componentId of componentsToRemove) {
      const component = record.archetype.getComponent(componentId, record.row);
      if (component && (component as any).onDetach) {
        (component as any).onDetach(entity);
      }
    }

    const targetArchetype = this.getOrCreateArchetype(newSignature);
    const newRow = record.archetype.moveEntity(record.row, targetArchetype, entity);

    const movedEntity = record.archetype.entities[record.row];
    if (movedEntity !== undefined) {
      const movedIndex = EntityUtils.getIndex(movedEntity);
      const movedRecord = this.entityRecords[movedIndex];
      if (movedRecord) {
        movedRecord.row = record.row;
      }
    }

    record.archetype = targetArchetype;
    record.row = newRow;
  }

  /**
   * Gets the archetype that an entity belongs to.
   *
   * @param entity - Entity to get archetype for
   * @returns The archetype, or undefined if entity is invalid
   *
   * @example
   * ```typescript
   * const archetype = manager.getArchetype(entity);
   * if (archetype) {
   *   console.log(`Entity has ${archetype.componentIds.length} components`);
   * }
   * ```
   */
  getArchetype(entity: Entity): Archetype | undefined {
    if (!this.isAlive(entity)) {
      return undefined;
    }

    const index = EntityUtils.getIndex(entity);
    const record = this.entityRecords[index];
    return record?.archetype;
  }

  /**
   * Gets the component signature (bitset) for an entity.
   *
   * @param entity - Entity to get signature for
   * @returns The component signature, or undefined if entity is invalid
   *
   * @example
   * ```typescript
   * const signature = manager.getSignature(entity);
   * if (signature) {
   *   console.log(`Entity has ${signature.count()} components`);
   * }
   * ```
   */
  getSignature(entity: Entity): Bitset | undefined {
    const archetype = this.getArchetype(entity);
    return archetype?.signature;
  }

  /**
   * Gets or creates an archetype with the specified component signature.
   * Uses signature hash for O(1) lookup of existing archetypes.
   * When a new archetype is created, all query caches are updated.
   *
   * @param signature - Component signature bitset
   * @returns The archetype instance
   *
   * @example
   * ```typescript
   * const signature = new Bitset();
   * signature.set(positionId).set(velocityId);
   * const archetype = manager.getOrCreateArchetype(signature);
   * ```
   */
  getOrCreateArchetype(signature: Bitset): Archetype {
    const hash = signature.hash();
    let archetype = this.archetypeMap.get(hash);

    if (!archetype) {
      const componentIds: ComponentId[] = [];
      for (const componentId of signature) {
        componentIds.push(componentId);
      }

      archetype = new SimpleArchetype(signature, componentIds);
      this.archetypeMap.set(hash, archetype);
      this.archetypes.push(archetype);

      this._updateQueryCaches();
    }

    return archetype;
  }

  /**
   * Gets all archetypes in the system.
   *
   * @returns Readonly array of all archetypes
   *
   * @example
   * ```typescript
   * const archetypes = manager.getAllArchetypes();
   * for (const archetype of archetypes) {
   *   console.log(`Archetype with ${archetype.entities.length} entities`);
   * }
   * ```
   */
  getAllArchetypes(): readonly Archetype[] {
    return this.archetypes;
  }

  /**
   * Finds all archetypes that match a query.
   *
   * @param query - Query to match against
   * @returns Array of matching archetypes
   *
   * @example
   * ```typescript
   * const query = manager.createQuery({ all: [Position, Velocity] });
   * const archetypes = manager.findMatchingArchetypes(query);
   * console.log(`${archetypes.length} archetypes match the query`);
   * ```
   */
  findMatchingArchetypes(query: Query): Archetype[] {
    const result: Archetype[] = [];

    for (const archetype of this.archetypes) {
      if (query.matches(archetype.signature)) {
        result.push(archetype);
      }
    }

    return result;
  }

  /**
   * Creates a query for matching entities with specific components.
   * The query is cached and automatically updated when new archetypes are created.
   *
   * @param descriptor - Query descriptor specifying component requirements
   * @returns Query instance
   *
   * @example
   * ```typescript
   * // Entities with Position AND Velocity, but NOT Frozen
   * const query = manager.createQuery({
   *   all: [Position, Velocity],
   *   none: [Frozen]
   * });
   *
   * // Entities with at least one of these components
   * const renderQuery = manager.createQuery({
   *   any: [Sprite, Mesh, Particle]
   * });
   * ```
   */
  createQuery(descriptor: QueryDescriptor): Query {
    const query = new SimpleQuery(descriptor);

    for (const archetype of this.archetypes) {
      if (query.matches(archetype.signature)) {
        query.addArchetype(archetype);
      }
    }

    this.queries.push(query);
    return query;
  }

  /**
   * Updates all query caches to include newly created archetypes.
   * Called automatically when a new archetype is created.
   *
   * @internal
   */
  _updateQueryCaches(): void {
    const newArchetype = this.archetypes[this.archetypes.length - 1];

    for (const query of this.queries) {
      if (query.matches(newArchetype.signature)) {
        query.addArchetype(newArchetype);
      }
    }
  }

  /**
   * Gets the number of currently alive entities.
   *
   * @returns Number of alive entities
   *
   * @example
   * ```typescript
   * console.log(`Active entities: ${manager.entityCount}`);
   * ```
   */
  get entityCount(): number {
    return this.entityPool.aliveCount;
  }

  /**
   * Gets the number of archetypes in the system.
   *
   * @returns Number of archetypes
   *
   * @example
   * ```typescript
   * console.log(`Total archetypes: ${manager.archetypeCount}`);
   * ```
   */
  get archetypeCount(): number {
    return this.archetypes.length;
  }

  /**
   * Gets the number of registered component types.
   *
   * @returns Number of component types
   *
   * @example
   * ```typescript
   * console.log(`Component types: ${manager.componentTypeCount}`);
   * ```
   */
  get componentTypeCount(): number {
    return ComponentRegistry.getRegisteredCount();
  }

  /**
   * Iterates over all alive entities.
   *
   * @param callback - Function called for each alive entity
   *
   * @example
   * ```typescript
   * manager.forEachEntity(entity => {
   *   console.log(EntityUtils.toString(entity));
   * });
   * ```
   */
  forEachEntity(callback: (entity: Entity) => void): void {
    this.entityPool.forEach(callback);
  }

  /**
   * Gets debug information for an entity.
   *
   * @param entity - Entity to get debug info for
   * @returns Object containing debug information
   *
   * @example
   * ```typescript
   * const info = manager.getEntityDebugInfo(entity);
   * console.log(JSON.stringify(info, null, 2));
   * ```
   */
  getEntityDebugInfo(entity: Entity): object {
    if (!this.isAlive(entity)) {
      return {
        entity: EntityUtils.toString(entity),
        status: 'dead or invalid'
      };
    }

    const index = EntityUtils.getIndex(entity);
    const record = this.entityRecords[index];

    if (!record) {
      return {
        entity: EntityUtils.toString(entity),
        status: 'alive but no record'
      };
    }

    const componentNames: string[] = [];
    for (const componentId of record.archetype.componentIds) {
      const metadata = ComponentRegistry.getMetadata(componentId);
      if (metadata) {
        componentNames.push(metadata.name);
      }
    }

    return {
      entity: EntityUtils.toString(entity),
      status: 'alive',
      archetype: {
        componentCount: record.archetype.componentIds.length,
        components: componentNames,
        entityCount: record.archetype.entities.length,
        row: record.row
      }
    };
  }

  /**
   * Clears all entities and archetypes, resetting the manager to initial state.
   *
   * @example
   * ```typescript
   * manager.clear();
   * console.log(manager.entityCount); // 0
   * console.log(manager.archetypeCount); // 1 (empty archetype)
   * ```
   */
  clear(): void {
    this.entityPool.clear();
    this.entityRecords.length = 0;
    this.archetypeMap.clear();
    this.archetypes.length = 0;
    this.queries.length = 0;

    const emptySignature = new Bitset();
    this.emptyArchetype = new SimpleArchetype(emptySignature, []);
    this.archetypes.push(this.emptyArchetype);
    this.archetypeMap.set(emptySignature.hash(), this.emptyArchetype);
  }
}

// EntityRecord is exported via index.ts
