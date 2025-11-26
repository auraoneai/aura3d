/**
 * @fileoverview Entity selection system with single/multi-selection,
 * set operations, bounds calculation, and component filtering.
 * @module editor/Selection
 */

import { Entity } from '../ecs/Entity';
import { IComponent } from '../ecs/Component';
import { Vector3 } from '../math/Vector3';
import { Box3 as Bounds } from '../math/Box3';
import { TransformComponent } from '../ecs/components/TransformComponent';
import { World } from '../ecs/World';

/**
 * Selection change event
 */
export interface SelectionChangeEvent {
  /** Added entities */
  added: Entity[];
  /** Removed entities */
  removed: Entity[];
  /** Current selection */
  selection: Entity[];
}

/**
 * Selection filter function
 */
export type SelectionFilter = (entity: Entity) => boolean;

/**
 * Entity selection manager providing single and multi-selection,
 * set operations, bounds calculation, and filtering capabilities.
 * Implemented as a singleton for global selection state.
 *
 * @example
 * ```typescript
 * // Select single entity
 * Selection.select(entity);
 *
 * // Multi-select
 * Selection.add(entity1);
 * Selection.add(entity2);
 *
 * // Toggle selection
 * Selection.toggle(entity);
 *
 * // Filter selection
 * const lights = Selection.filter(e => e.hasComponent(Light));
 *
 * // Get bounds
 * const bounds = Selection.getBounds();
 * ```
 */
export class SelectionManager {
  private selectedEntities: Set<Entity> = new Set();
  private activeEntity: Entity | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private locked: boolean = false;
  private world: World | null = null;

  /**
   * Sets the world instance for component access
   * @param world - World instance
   */
  public setWorld(world: World): void {
    this.world = world;
  }

  /**
   * Gets all selected entities
   */
  public getSelection(): Entity[] {
    return Array.from(this.selectedEntities);
  }

  /**
   * Gets the active (primary) entity
   */
  public getActiveEntity(): Entity | null {
    return this.activeEntity;
  }

  /**
   * Checks if an entity is selected
   * @param entity - Entity to check
   */
  public isSelected(entity: Entity): boolean {
    return this.selectedEntities.has(entity);
  }

  /**
   * Gets the number of selected entities
   */
  public count(): number {
    return this.selectedEntities.size;
  }

  /**
   * Checks if selection is empty
   */
  public isEmpty(): boolean {
    return this.selectedEntities.size === 0;
  }

  /**
   * Checks if selection is locked
   */
  public isLocked(): boolean {
    return this.locked;
  }

  /**
   * Sets selection lock state
   * @param locked - Whether to lock selection
   */
  public setLocked(locked: boolean): void {
    this.locked = locked;
  }

  /**
   * Selects a single entity (clears previous selection)
   * @param entity - Entity to select
   */
  public select(entity: Entity): void {
    if (this.locked) return;

    const previous = this.getSelection();
    this.selectedEntities.clear();
    this.selectedEntities.add(entity);
    this.activeEntity = entity;

    this.emitChange(previous, [entity]);
  }

  /**
   * Selects multiple entities (clears previous selection)
   * @param entities - Entities to select
   */
  public selectMultiple(entities: Entity[]): void {
    if (this.locked) return;

    const previous = this.getSelection();
    this.selectedEntities.clear();
    entities.forEach(entity => this.selectedEntities.add(entity));
    this.activeEntity = entities[entities.length - 1] || null;

    this.emitChange(previous, entities);
  }

  /**
   * Adds an entity to the selection
   * @param entity - Entity to add
   */
  public add(entity: Entity): void {
    if (this.locked) return;
    if (this.selectedEntities.has(entity)) return;

    const previous = this.getSelection();
    this.selectedEntities.add(entity);
    this.activeEntity = entity;

    this.emitChange(previous, this.getSelection());
  }

  /**
   * Adds multiple entities to the selection
   * @param entities - Entities to add
   */
  public addMultiple(entities: Entity[]): void {
    if (this.locked) return;

    const previous = this.getSelection();
    const added: Entity[] = [];

    entities.forEach(entity => {
      if (!this.selectedEntities.has(entity)) {
        this.selectedEntities.add(entity);
        added.push(entity);
      }
    });

    if (added.length > 0) {
      this.activeEntity = added[added.length - 1];
      this.emitChange(previous, this.getSelection());
    }
  }

  /**
   * Removes an entity from the selection
   * @param entity - Entity to remove
   */
  public remove(entity: Entity): void {
    if (this.locked) return;
    if (!this.selectedEntities.has(entity)) return;

    const previous = this.getSelection();
    this.selectedEntities.delete(entity);

    if (this.activeEntity === entity) {
      this.activeEntity = this.selectedEntities.values().next().value || null;
    }

    this.emitChange(previous, this.getSelection());
  }

  /**
   * Removes multiple entities from the selection
   * @param entities - Entities to remove
   */
  public removeMultiple(entities: Entity[]): void {
    if (this.locked) return;

    const previous = this.getSelection();
    const removed: Entity[] = [];

    entities.forEach(entity => {
      if (this.selectedEntities.has(entity)) {
        this.selectedEntities.delete(entity);
        removed.push(entity);
      }
    });

    if (removed.length > 0) {
      if (this.activeEntity && removed.includes(this.activeEntity)) {
        this.activeEntity = this.selectedEntities.values().next().value || null;
      }
      this.emitChange(previous, this.getSelection());
    }
  }

  /**
   * Toggles an entity's selection state
   * @param entity - Entity to toggle
   */
  public toggle(entity: Entity): void {
    if (this.locked) return;

    if (this.selectedEntities.has(entity)) {
      this.remove(entity);
    } else {
      this.add(entity);
    }
  }

  /**
   * Clears the selection
   */
  public clear(): void {
    if (this.locked) return;
    if (this.selectedEntities.size === 0) return;

    const previous = this.getSelection();
    this.selectedEntities.clear();
    this.activeEntity = null;

    this.emitChange(previous, []);
  }

  /**
   * Filters selected entities by a predicate
   * @param predicate - Filter function
   * @returns Filtered entities
   */
  public filter(predicate: SelectionFilter): Entity[] {
    return this.getSelection().filter(predicate);
  }

  /**
   * Filters selection to entities with a specific component
   * @param componentType - Component class
   * @returns Entities with the component
   */
  public filterByComponent<T extends IComponent>(
    componentType: new (...args: any[]) => T
  ): Entity[] {
    if (!this.world) return [];
    return this.filter(entity => this.world!.hasComponent(entity, componentType));
  }

  /**
   * Checks if all selected entities have a component
   * @param componentType - Component class
   */
  public allHaveComponent<T extends IComponent>(
    componentType: new (...args: any[]) => T
  ): boolean {
    if (this.isEmpty() || !this.world) return false;
    return this.getSelection().every(entity => this.world!.hasComponent(entity, componentType));
  }

  /**
   * Checks if any selected entity has a component
   * @param componentType - Component class
   */
  public anyHasComponent<T extends IComponent>(
    componentType: new (...args: any[]) => T
  ): boolean {
    if (!this.world) return false;
    return this.getSelection().some(entity => this.world!.hasComponent(entity, componentType));
  }

  /**
   * Calculates the bounding box containing all selected entities
   * @returns Combined bounds or null if no selection
   */
  public getBounds(): Bounds | null {
    if (this.isEmpty() || !this.world) return null;

    const entities = this.getSelection();
    const points: Vector3[] = [];

    entities.forEach(entity => {
      const transform = this.world!.getComponent(entity, TransformComponent);
      if (transform) {
        points.push(transform.position.clone());
      }
    });

    if (points.length === 0) return null;

    const bounds = new Bounds();
    bounds.setFromPoints(points);
    return bounds;
  }

  /**
   * Calculates the center point of the selection
   * @returns Center position or null if no selection
   */
  public getCenter(): Vector3 | null {
    const bounds = this.getBounds();
    if (!bounds) return null;
    return bounds.center;
  }

  /**
   * Calculates the pivot point based on current pivot mode
   * @param mode - Pivot mode ('center', 'active', 'individual')
   * @returns Pivot position or null
   */
  public getPivot(mode: 'center' | 'active' | 'individual' = 'center'): Vector3 | null {
    if (this.isEmpty() || !this.world) return null;

    switch (mode) {
      case 'center':
        return this.getCenter();

      case 'active':
        if (this.activeEntity) {
          const transform = this.world.getComponent(this.activeEntity, TransformComponent);
          return transform ? transform.position.clone() : null;
        }
        return this.getCenter();

      case 'individual':
        // For individual mode, return center as default
        // Individual transforms would be handled per-entity
        return this.getCenter();

      default:
        return this.getCenter();
    }
  }

  /**
   * Selects all children of currently selected entities
   */
  public selectChildren(): void {
    if (this.locked) return;
    if (this.isEmpty() || !this.world) return;

    const current = this.getSelection();
    const children: Entity[] = [];

    // Note: TransformComponent uses parentEntity for hierarchy
    // To find children, we need to iterate all entities and check their parent
    // This is a simplified implementation - a real one would cache parent-child relationships
    const allEntities = Array.from({ length: this.world.entityCount }, (_, i) => i + 1);

    allEntities.forEach(candidateEntity => {
      const transform = this.world!.getComponent(candidateEntity, TransformComponent);
      if (transform && current.includes(transform.parentEntity)) {
        children.push(candidateEntity);
      }
    });

    if (children.length > 0) {
      this.addMultiple(children);
    }
  }

  /**
   * Selects parents of currently selected entities
   */
  public selectParents(): void {
    if (this.locked) return;
    if (this.isEmpty() || !this.world) return;

    const current = this.getSelection();
    const parents: Entity[] = [];

    current.forEach(entity => {
      const transform = this.world!.getComponent(entity, TransformComponent);
      if (transform && transform.parentEntity !== 0) {
        parents.push(transform.parentEntity);
      }
    });

    if (parents.length > 0) {
      this.addMultiple(parents);
    }
  }

  /**
   * Inverts the selection within a given set of entities
   * @param allEntities - All entities to consider
   */
  public invert(allEntities: Entity[]): void {
    if (this.locked) return;

    const previous = this.getSelection();
    const newSelection = allEntities.filter(entity => !this.selectedEntities.has(entity));

    this.selectedEntities.clear();
    newSelection.forEach(entity => this.selectedEntities.add(entity));
    this.activeEntity = newSelection[newSelection.length - 1] || null;

    this.emitChange(previous, newSelection);
  }

  /**
   * Emits a selection change event
   */
  private emitChange(previous: Entity[], current: Entity[]): void {
    const added = current.filter(e => !previous.includes(e));
    const removed = previous.filter(e => !current.includes(e));

    const event: SelectionChangeEvent = {
      added,
      removed,
      selection: current
    };

    this.emit('changed', event);
  }

  /**
   * Registers an event listener
   * @param event - Event name ('changed')
   * @param callback - Callback function
   */
  public on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Unregisters an event listener
   * @param event - Event name
   * @param callback - Callback function
   */
  public off(event: string, callback: Function): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emits an event
   * @param event - Event name
   * @param data - Event data
   */
  private emit(event: string, data: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }
}

/**
 * Global selection manager instance
 */
export const Selection = new SelectionManager();
