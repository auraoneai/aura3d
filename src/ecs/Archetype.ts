/**
 * Archetype groups entities with identical component composition for cache-efficient iteration.
 *
 * An archetype represents a unique combination of component types. All entities
 * with the same set of components are stored together in the same archetype,
 * enabling efficient batch processing and cache-friendly memory layout.
 *
 * Components are stored in columnar format (array per component type) to maximize
 * cache locality during iteration. Entity-to-row mapping uses a SparseSet for O(1)
 * lookup performance.
 *
 * @module ecs/Archetype
 *
 * @example
 * ```typescript
 * // Create an archetype for entities with Position and Velocity
 * const signature = Archetype.createSignature([positionId, velocityId]);
 * const archetype = new Archetype(0, signature);
 *
 * // Add entity and its components
 * const row = archetype.addEntity(entity);
 * archetype.setComponent(entity, positionId, { x: 0, y: 0 });
 * archetype.setComponent(entity, velocityId, { x: 1, y: 1 });
 *
 * // Efficient iteration over all entities in archetype
 * archetype.forEach((entity, row) => {
 *   const pos = archetype.getColumn<Position>(positionId)[row];
 *   const vel = archetype.getColumn<Velocity>(velocityId)[row];
 *   // Update logic...
 * });
 *
 * // Remove entity (uses swap-and-pop)
 * const swappedEntity = archetype.removeEntity(entity);
 * if (swappedEntity) {
 *   // Handle entity that was moved into the removed slot
 * }
 * ```
 */

import { Entity, EntityUtils } from './Entity';
import { Bitset } from './Bitset';
import { ComponentId, IComponent, ComponentType } from './ComponentRegistry';
import { SparseSet } from './SparseSet';

/**
 * Archetype groups entities with identical component composition for cache-efficient iteration.
 *
 * Provides O(1) entity lookup, O(1) component access, and cache-friendly iteration.
 * Uses swap-and-pop for efficient entity removal without leaving holes in arrays.
 *
 * @example
 * ```typescript
 * const signature = Bitset.fromArray([0, 1, 2]);
 * const archetype = new Archetype(5, signature);
 *
 * // Add entities
 * const row = archetype.addEntity(entity1);
 * archetype.setComponent(entity1, 0, component);
 *
 * // Query
 * console.log(archetype.entityCount); // 1
 * console.log(archetype.hasComponent(0)); // true
 *
 * // Iterate
 * archetype.forEach((entity, row) => {
 *   console.log(`Entity ${entity} at row ${row}`);
 * });
 * ```
 */
export class Archetype {
  /**
   * Unique identifier for this archetype.
   */
  readonly id: number;

  /**
   * Component signature (bitset of component IDs).
   * Immutable after creation.
   */
  readonly signature: Bitset;

  /**
   * Dense array of entities in this archetype.
   * Maintained in compact form (no holes) for cache-efficient iteration.
   */
  private entityArray: Entity[];

  /**
   * Entity-to-row mapping for O(1) lookup.
   * Maps entity to its index in entityArray.
   */
  private entityToRow: SparseSet<void>;

  /**
   * Component storage in columnar format.
   * Maps componentId -> array of components.
   * Lazily allocated when first component is added.
   */
  private componentColumns: Map<ComponentId, IComponent[]>;

  /**
   * Archetype graph edges for component addition.
   * Maps componentId -> destination archetype when that component is added.
   */
  readonly addEdge: Map<ComponentId, Archetype>;

  /**
   * Archetype graph edges for component removal.
   * Maps componentId -> destination archetype when that component is removed.
   */
  readonly removeEdge: Map<ComponentId, Archetype>;

  /**
   * Creates a new archetype with the specified signature.
   *
   * @param id - Unique archetype identifier
   * @param signature - Component signature (bitset of component IDs)
   *
   * @example
   * ```typescript
   * const signature = Archetype.createSignature([0, 1, 2]);
   * const archetype = new Archetype(0, signature);
   * ```
   */
  constructor(id: number, signature: Bitset) {
    this.id = id;
    this.signature = signature.clone();
    this.entityArray = [];
    this.entityToRow = new SparseSet<void>();
    this.componentColumns = new Map();
    this.addEdge = new Map();
    this.removeEdge = new Map();
  }

  /**
   * Adds an entity to this archetype.
   *
   * The entity is appended to the dense entity array and mapped for O(1) lookup.
   * Component data should be set separately using setComponent().
   *
   * Time complexity: O(1) amortized
   *
   * @param entity - Entity to add
   * @returns Row index where entity was added
   * @throws Error if entity is already in this archetype
   *
   * @example
   * ```typescript
   * const row = archetype.addEntity(entity);
   * console.log(`Entity added at row ${row}`);
   * ```
   */
  addEntity(entity: Entity): number {
    if (this.entityToRow.has(entity)) {
      throw new Error(
        `Entity ${EntityUtils.toString(entity)} is already in archetype ${this.id}`
      );
    }

    const row = this.entityArray.length;
    this.entityArray.push(entity);
    this.entityToRow.add(entity);

    return row;
  }

  /**
   * Removes an entity from this archetype using swap-and-pop.
   *
   * The entity at the given row is swapped with the last entity, then the
   * last element is popped. This maintains a compact array with no holes.
   *
   * Time complexity: O(1)
   *
   * @param entity - Entity to remove
   * @returns The entity that was swapped into the removed slot, or null if removed entity was last
   * @throws Error if entity is not in this archetype
   *
   * @example
   * ```typescript
   * const swappedEntity = archetype.removeEntity(entity);
   * if (swappedEntity) {
   *   console.log(`Entity ${swappedEntity} was moved to fill the gap`);
   * }
   * ```
   */
  removeEntity(entity: Entity): Entity | null {
    const row = this.entityToRow.getDenseIndex(entity);

    if (row === -1) {
      throw new Error(
        `Entity ${EntityUtils.toString(entity)} is not in archetype ${this.id}`
      );
    }

    const lastIndex = this.entityArray.length - 1;
    let swappedEntity: Entity | null = null;

    if (row !== lastIndex) {
      // Swap with last entity
      const lastEntity = this.entityArray[lastIndex];
      this.entityArray[row] = lastEntity;

      // Update entity-to-row mapping for swapped entity
      this.entityToRow.remove(lastEntity);
      this.entityToRow.add(lastEntity);

      // Swap component data for all columns
      for (const [componentId, column] of this.componentColumns) {
        column[row] = column[lastIndex];
      }

      swappedEntity = lastEntity;
    }

    // Remove last element
    this.entityArray.pop();
    this.entityToRow.remove(entity);

    // Clean up component data in all columns
    for (const [componentId, column] of this.componentColumns) {
      column.pop();
    }

    return swappedEntity;
  }

  /**
   * Checks if an entity is in this archetype.
   *
   * Time complexity: O(1)
   *
   * @param entity - Entity to check
   * @returns true if entity is in this archetype, false otherwise
   *
   * @example
   * ```typescript
   * if (archetype.hasEntity(entity)) {
   *   console.log('Entity is in this archetype');
   * }
   * ```
   */
  hasEntity(entity: Entity): boolean {
    return this.entityToRow.has(entity);
  }

  /**
   * Gets the row index of an entity in this archetype.
   *
   * Time complexity: O(1)
   *
   * @param entity - Entity to look up
   * @returns Row index (0-based), or -1 if entity is not in this archetype
   *
   * @example
   * ```typescript
   * const row = archetype.getEntityRow(entity);
   * if (row !== -1) {
   *   console.log(`Entity is at row ${row}`);
   * }
   * ```
   */
  getEntityRow(entity: Entity): number {
    return this.entityToRow.getDenseIndex(entity);
  }

  /**
   * Gets the component column for a specific component type.
   *
   * The column is a dense array where the index corresponds to the entity's row.
   * The column is lazily allocated and will be created if it doesn't exist.
   *
   * Time complexity: O(1)
   *
   * @typeParam T - Component type implementing IComponent
   * @param componentId - Component type identifier
   * @returns Dense array of components (index = entity row)
   *
   * @example
   * ```typescript
   * const positions = archetype.getColumn<Position>(positionId);
   * for (let row = 0; row < archetype.entityCount; row++) {
   *   const pos = positions[row];
   *   console.log(`Position at row ${row}: (${pos.x}, ${pos.y})`);
   * }
   * ```
   */
  getColumn<T extends IComponent>(componentId: ComponentId): T[] {
    let column = this.componentColumns.get(componentId);

    if (!column) {
      column = [];
      this.componentColumns.set(componentId, column);
    }

    return column as T[];
  }

  /**
   * Sets a component for an entity at its row position.
   *
   * Time complexity: O(1)
   *
   * @typeParam T - Component type implementing IComponent
   * @param entity - Entity to set component for
   * @param componentId - Component type identifier
   * @param component - Component instance to set
   * @throws Error if entity is not in this archetype
   *
   * @example
   * ```typescript
   * archetype.setComponent(entity, positionId, { x: 10, y: 20 });
   * ```
   */
  setComponent<T extends IComponent>(
    entity: Entity,
    componentId: ComponentId,
    component: T
  ): void {
    const row = this.entityToRow.getDenseIndex(entity);

    if (row === -1) {
      throw new Error(
        `Entity ${EntityUtils.toString(entity)} is not in archetype ${this.id}`
      );
    }

    const column = this.getColumn<T>(componentId);
    column[row] = component;

    // Call onAttach lifecycle hook if it exists
    if (component.onAttach) {
      component.onAttach(entity);
    }
  }

  /**
   * Gets a component for an entity.
   *
   * Time complexity: O(1)
   *
   * @typeParam T - Component type implementing IComponent
   * @param entity - Entity to get component for
   * @param componentId - Component type identifier
   * @returns Component instance, or undefined if entity is not in archetype or component not set
   *
   * @example
   * ```typescript
   * const position = archetype.getComponent<Position>(entity, positionId);
   * if (position) {
   *   console.log(`Position: (${position.x}, ${position.y})`);
   * }
   * ```
   */
  getComponent<T extends IComponent>(
    entity: Entity,
    componentId: ComponentId
  ): T | undefined {
    const row = this.entityToRow.getDenseIndex(entity);

    if (row === -1) {
      return undefined;
    }

    const column = this.componentColumns.get(componentId);
    if (!column) {
      return undefined;
    }

    return column[row] as T;
  }

  /**
   * Gets all components for an entity.
   *
   * Time complexity: O(C) where C is the number of components in this archetype
   *
   * @param entity - Entity to get components for
   * @returns Array of all component instances for the entity, or empty array if entity not in archetype
   *
   * @example
   * ```typescript
   * const components = archetype.getComponents(entity);
   * for (const component of components) {
   *   console.log('Component:', component);
   * }
   * ```
   */
  getComponents(entity: Entity): IComponent[] {
    const row = this.entityToRow.getDenseIndex(entity);

    if (row === -1) {
      return [];
    }

    const components: IComponent[] = [];
    for (const componentId of this.signature.getSetBits()) {
      const column = this.componentColumns.get(componentId);
      if (column && column[row]) {
        components.push(column[row]);
      }
    }

    return components;
  }

  /**
   * Removes a component from an entity.
   *
   * This clears the component data but doesn't affect the entity's archetype membership.
   * Note: In a typical ECS, removing a component should trigger archetype transition,
   * which is handled at the World/EntityManager level.
   *
   * Time complexity: O(1)
   *
   * @param entity - Entity to remove component from
   * @param componentId - Component type identifier
   *
   * @example
   * ```typescript
   * archetype.removeComponent(entity, velocityId);
   * ```
   */
  removeComponent(entity: Entity, componentId: ComponentId): void {
    const row = this.entityToRow.getDenseIndex(entity);

    if (row === -1) {
      return;
    }

    const column = this.componentColumns.get(componentId);
    if (!column) {
      return;
    }

    const component = column[row];

    // Call onDetach lifecycle hook if it exists
    if (component && component.onDetach) {
      component.onDetach(entity);
    }

    delete column[row];
  }

  /**
   * Gets a read-only view of all entities in this archetype.
   *
   * @returns Read-only array of entities
   *
   * @example
   * ```typescript
   * const entities = archetype.entities;
   * console.log(`Archetype has ${entities.length} entities`);
   * ```
   */
  get entities(): readonly Entity[] {
    return this.entityArray;
  }

  /**
   * Gets the number of entities in this archetype.
   *
   * @returns Entity count
   *
   * @example
   * ```typescript
   * console.log(`Archetype contains ${archetype.entityCount} entities`);
   * ```
   */
  get entityCount(): number {
    return this.entityArray.length;
  }

  /**
   * Iterates over all entities in this archetype.
   *
   * Provides cache-friendly iteration with entity and row index.
   * The row index can be used to directly access component columns.
   *
   * Time complexity: O(n) where n is the number of entities
   *
   * @param callback - Function called for each entity with its row index
   *
   * @example
   * ```typescript
   * const positions = archetype.getColumn<Position>(positionId);
   * const velocities = archetype.getColumn<Velocity>(velocityId);
   *
   * archetype.forEach((entity, row) => {
   *   positions[row].x += velocities[row].x;
   *   positions[row].y += velocities[row].y;
   * });
   * ```
   */
  forEach(callback: (entity: Entity, row: number) => void): void {
    for (let row = 0; row < this.entityArray.length; row++) {
      callback(this.entityArray[row], row);
    }
  }

  /**
   * Checks if this archetype has a specific component type.
   *
   * Time complexity: O(1)
   *
   * @param componentId - Component type identifier to check
   * @returns true if archetype has this component, false otherwise
   *
   * @example
   * ```typescript
   * if (archetype.hasComponent(positionId)) {
   *   console.log('This archetype includes Position component');
   * }
   * ```
   */
  hasComponent(componentId: ComponentId): boolean {
    return this.signature.get(componentId);
  }

  /**
   * Checks if this archetype has all specified component types.
   *
   * Time complexity: O(k) where k is the number of component IDs to check
   *
   * @param componentIds - Array of component type identifiers to check
   * @returns true if archetype has all components, false otherwise
   *
   * @example
   * ```typescript
   * if (archetype.hasComponents([positionId, velocityId])) {
   *   console.log('This archetype has both Position and Velocity');
   * }
   * ```
   */
  hasComponents(componentIds: ComponentId[]): boolean {
    for (const componentId of componentIds) {
      if (!this.signature.get(componentId)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Checks if this archetype matches a signature query.
   *
   * An archetype matches if:
   * - It contains all required components (signature.contains(required))
   * - It contains none of the excluded components (!signature.intersects(excluded))
   *
   * Time complexity: O(1) for bitset operations
   *
   * @param required - Bitset of required component IDs
   * @param excluded - Optional bitset of excluded component IDs
   * @returns true if archetype matches the query, false otherwise
   *
   * @example
   * ```typescript
   * // Find archetypes with Position and Velocity, but without Dead tag
   * const required = Bitset.fromArray([positionId, velocityId]);
   * const excluded = Bitset.fromArray([deadTagId]);
   *
   * if (archetype.matchesSignature(required, excluded)) {
   *   console.log('Archetype matches query');
   * }
   * ```
   */
  matchesSignature(required: Bitset, excluded?: Bitset): boolean {
    // Check if archetype contains all required components
    if (!this.signature.contains(required)) {
      return false;
    }

    // Check if archetype has any excluded components
    if (excluded && this.signature.intersects(excluded)) {
      return false;
    }

    return true;
  }

  /**
   * Returns a string representation of this archetype for debugging.
   *
   * @returns String representation with ID and component signature
   *
   * @example
   * ```typescript
   * console.log(archetype.toString());
   * // "Archetype(id:0, signature:[0,1,2], entities:5)"
   * ```
   */
  toString(): string {
    const componentIds = this.signature.toArray();
    return `Archetype(id:${this.id}, signature:[${componentIds.join(',')}], entities:${this.entityCount})`;
  }

  /**
   * Creates a component signature from an array of component IDs.
   *
   * This is a convenience method for creating bitsets from component arrays.
   *
   * @param componentIds - Array of component type identifiers
   * @returns Bitset representing the component signature
   *
   * @example
   * ```typescript
   * const signature = Archetype.createSignature([0, 1, 2]);
   * const archetype = new Archetype(0, signature);
   * ```
   */
  static createSignature(componentIds: ComponentId[]): Bitset {
    return Bitset.fromArray(componentIds);
  }
}
