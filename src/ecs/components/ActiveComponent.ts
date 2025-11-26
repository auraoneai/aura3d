/**
 * @fileoverview Active/enabled state component for entity hierarchy management.
 * Provides local and hierarchical active states for selective entity processing.
 * @module ecs/components/ActiveComponent
 */

import { IComponent, ComponentSchema } from '../Component';

/**
 * Active/enabled state component for entities.
 *
 * Controls whether an entity is active locally and within its parent hierarchy.
 * Systems can skip processing inactive entities for performance optimization.
 * The hierarchical active state is computed by ActiveSystem based on parent chain.
 *
 * @implements {IComponent}
 *
 * @example
 * ```typescript
 * // Create an active entity
 * const entity = world.createEntity();
 * const active = new ActiveComponent(true);
 * world.addComponent(entity, active);
 *
 * // Disable entity
 * active.setActive(false);
 * console.log(active.isActive); // false
 *
 * // Toggle state
 * active.toggle();
 * console.log(active.isActive); // true
 *
 * // Check hierarchy state (computed by ActiveSystem)
 * console.log(active.isActiveInHierarchy); // depends on parents
 * ```
 *
 * @example
 * ```typescript
 * // Entity hierarchy active state
 * const parent = world.createEntity();
 * const parentActive = new ActiveComponent(true);
 * world.addComponent(parent, parentActive);
 *
 * const child = world.createEntity();
 * const childActive = new ActiveComponent(true);
 * world.addComponent(child, childActive);
 *
 * // Link in hierarchy
 * world.addComponent(child, new HierarchyComponent(parent));
 *
 * // After ActiveSystem updates:
 * console.log(childActive.isActiveInHierarchy); // true (both active)
 *
 * parentActive.setActive(false);
 * // After ActiveSystem updates:
 * console.log(childActive.isActiveInHierarchy); // false (parent inactive)
 * console.log(childActive.isActive); // true (still active locally)
 * ```
 *
 * @example
 * ```typescript
 * // Using in systems to skip inactive entities
 * class RenderSystem extends System {
 *   update(): void {
 *     for (const entity of this.query([MeshComponent, ActiveComponent])) {
 *       const active = this.getComponent(entity, ActiveComponent);
 *       if (!active.isActiveInHierarchy) {
 *         continue; // Skip rendering inactive entities
 *       }
 *       // Render active entity
 *     }
 *   }
 * }
 * ```
 */
export class ActiveComponent implements IComponent {
  /**
   * Local active state for this entity.
   * True if the entity is enabled at its own level, regardless of parent state.
   */
  activeSelf: boolean;

  /**
   * Effective active state considering parent hierarchy.
   * Computed by ActiveSystem - should not be set directly by user code.
   * An entity is active in hierarchy only if both:
   * 1. Its own activeSelf is true
   * 2. All ancestor entities have activeSelf true
   *
   * @internal
   */
  _activeInHierarchy: boolean;

  /**
   * Creates a new ActiveComponent.
   *
   * @param active - Initial active state (default: true)
   *
   * @example
   * ```typescript
   * // Create active entity (default)
   * const active1 = new ActiveComponent();
   * console.log(active1.isActive); // true
   *
   * // Create inactive entity
   * const active2 = new ActiveComponent(false);
   * console.log(active2.isActive); // false
   *
   * // Create explicitly active entity
   * const active3 = new ActiveComponent(true);
   * console.log(active3.isActive); // true
   * ```
   */
  constructor(active: boolean = true) {
    this.activeSelf = active;
    this._activeInHierarchy = active;
  }

  /**
   * Gets the local active state.
   * Returns whether this entity is active at its own level, ignoring parents.
   *
   * @returns The activeSelf value
   *
   * @example
   * ```typescript
   * const active = new ActiveComponent(true);
   * console.log(active.isActive); // true
   *
   * active.setActive(false);
   * console.log(active.isActive); // false
   * ```
   */
  get isActive(): boolean {
    return this.activeSelf;
  }

  /**
   * Gets the effective active state in hierarchy.
   * Returns whether this entity is active considering all parent states.
   * This value is computed by ActiveSystem.
   *
   * @returns The _activeInHierarchy value
   *
   * @example
   * ```typescript
   * const active = new ActiveComponent(true);
   * console.log(active.isActiveInHierarchy); // true initially
   *
   * // After ActiveSystem processes hierarchy:
   * // Will be false if any parent is inactive
   * // Will be true only if all ancestors are active
   * ```
   */
  get isActiveInHierarchy(): boolean {
    return this._activeInHierarchy;
  }

  /**
   * Sets the local active state.
   * Changes activeSelf and triggers ActiveSystem to recompute hierarchy.
   *
   * @param active - The new active state
   *
   * @example
   * ```typescript
   * const active = new ActiveComponent(true);
   *
   * // Disable entity
   * active.setActive(false);
   * console.log(active.isActive); // false
   *
   * // Enable entity
   * active.setActive(true);
   * console.log(active.isActive); // true
   * ```
   */
  setActive(active: boolean): void {
    this.activeSelf = active;
  }

  /**
   * Toggles the local active state.
   * Flips activeSelf between true and false.
   *
   * @example
   * ```typescript
   * const active = new ActiveComponent(true);
   * console.log(active.isActive); // true
   *
   * active.toggle();
   * console.log(active.isActive); // false
   *
   * active.toggle();
   * console.log(active.isActive); // true
   * ```
   */
  toggle(): void {
    this.activeSelf = !this.activeSelf;
  }

  /**
   * Resets the component to default state.
   * Sets both activeSelf and _activeInHierarchy to true.
   * Used by object pooling for component reuse.
   *
   * @example
   * ```typescript
   * const active = new ActiveComponent(false);
   * console.log(active.isActive); // false
   *
   * active.reset();
   * console.log(active.isActive); // true
   * console.log(active.isActiveInHierarchy); // true
   * ```
   */
  reset(): void {
    this.activeSelf = true;
    this._activeInHierarchy = true;
  }

  /**
   * Serializes the component to a plain object.
   * Only stores activeSelf as _activeInHierarchy is computed at runtime.
   *
   * @returns Plain object containing activeSelf
   *
   * @example
   * ```typescript
   * const active = new ActiveComponent(false);
   * const data = active.serialize();
   * console.log(data); // { activeSelf: false }
   *
   * const json = JSON.stringify(data);
   * console.log(json); // '{"activeSelf":false}'
   * ```
   */
  serialize(): object {
    return {
      activeSelf: this.activeSelf
    };
  }

  /**
   * Deserializes component data from a plain object.
   * Restores activeSelf and initializes _activeInHierarchy.
   * ActiveSystem will recompute _activeInHierarchy on next update.
   *
   * @param data - Plain object containing component data
   *
   * @example
   * ```typescript
   * const active = new ActiveComponent();
   * const data = { activeSelf: false };
   *
   * active.deserialize(data);
   * console.log(active.isActive); // false
   * console.log(active.isActiveInHierarchy); // false (initial value)
   * ```
   *
   * @example
   * ```typescript
   * // Load from JSON
   * const json = '{"activeSelf":true}';
   * const data = JSON.parse(json);
   *
   * const active = new ActiveComponent();
   * active.deserialize(data);
   * console.log(active.isActive); // true
   * ```
   */
  deserialize(data: object): void {
    const typedData = data as { activeSelf?: boolean };
    if (typedData.activeSelf !== undefined) {
      this.activeSelf = typedData.activeSelf;
      this._activeInHierarchy = typedData.activeSelf;
    }
  }

  /**
   * Component schema for automatic serialization.
   * Defines the structure and types of serializable fields.
   */
  static readonly schema: ComponentSchema = {
    activeSelf: 'bool'
  };

  /**
   * Component name for registration and debugging.
   * Used by the component registry system.
   */
  static readonly _componentName: string = 'ActiveComponent';
}
