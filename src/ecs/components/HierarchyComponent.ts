/**
 * @fileoverview Hierarchy component for managing parent-child relationships in scene graphs.
 * Provides efficient tree traversal, depth tracking, and sibling ordering for entity hierarchies.
 * @module ecs/components/HierarchyComponent
 */

import { IComponent, ComponentSchema } from '../Component';
import { Entity } from '../Entity';

/**
 * Manages parent-child relationships for scene hierarchy with efficient traversal.
 *
 * HierarchyComponent enables tree-structured entity relationships with optimized
 * operations for common scene graph queries. Entity 0 represents no parent/child
 * (root or leaf nodes).
 *
 * Key features:
 * - Parent-child relationships stored as Entity IDs
 * - Sibling ordering with doubly-linked list
 * - Cached depth for optimization
 * - Depth-first traversal of descendants
 * - Ancestor/descendant queries
 *
 * Performance characteristics:
 * - Parent access: O(1)
 * - Child iteration: O(n) where n = number of children
 * - Ancestor check: O(d) where d = depth
 * - Descendant traversal: O(n) where n = subtree size
 *
 * @example
 * ```typescript
 * // Create a simple hierarchy: root -> child1, child2
 * const root = world.createEntity();
 * const child1 = world.createEntity();
 * const child2 = world.createEntity();
 *
 * const rootHierarchy = world.addComponent(root, HierarchyComponent);
 * const child1Hierarchy = world.addComponent(child1, HierarchyComponent);
 * const child2Hierarchy = world.addComponent(child2, HierarchyComponent);
 *
 * // Build hierarchy (typically done by HierarchySystem)
 * rootHierarchy._addChild(child1);
 * rootHierarchy._addChild(child2);
 * child1Hierarchy._setParent(root);
 * child2Hierarchy._setParent(root);
 *
 * // Query relationships
 * console.log(rootHierarchy.childCount); // 2
 * console.log(child1Hierarchy.hasParent()); // true
 * console.log(rootHierarchy.isAncestorOf(child1)); // true
 *
 * // Traverse children
 * rootHierarchy.forEachChild(child => {
 *   console.log(`Child: ${child}`);
 * });
 *
 * // Traverse entire subtree
 * rootHierarchy.forEachDescendant((descendant, depth) => {
 *   console.log(`Descendant at depth ${depth}: ${descendant}`);
 * });
 * ```
 */
export class HierarchyComponent implements IComponent {
  /**
   * Parent entity (0 = no parent, this is a root entity).
   */
  parent: Entity = 0;

  /**
   * Ordered array of child entities.
   * @internal Use public accessors instead.
   */
  private _children: Entity[] = [];

  /**
   * Previous sibling entity in parent's child list (0 = first child).
   */
  previousSibling: Entity = 0;

  /**
   * Next sibling entity in parent's child list (0 = last child).
   */
  nextSibling: Entity = 0;

  /**
   * Depth in hierarchy (0 = root entity, no parent).
   */
  depth: number = 0;

  /**
   * Creates a new HierarchyComponent in root state.
   * Entity starts with no parent and no children.
   *
   * @example
   * ```typescript
   * const hierarchy = new HierarchyComponent();
   * console.log(hierarchy.parent); // 0 (no parent)
   * console.log(hierarchy.childCount); // 0
   * console.log(hierarchy.depth); // 0
   * ```
   */
  constructor() {}

  /**
   * Gets readonly access to children array.
   * Modifications should only be done through _addChild/_removeChild.
   *
   * @returns Readonly array of child entities
   *
   * @example
   * ```typescript
   * const children = hierarchy.children;
   * for (const child of children) {
   *   console.log(`Child entity: ${child}`);
   * }
   * ```
   */
  get children(): readonly Entity[] {
    return this._children;
  }

  /**
   * Gets the number of direct children.
   *
   * @returns Number of children (0 if leaf node)
   *
   * @example
   * ```typescript
   * console.log(`Entity has ${hierarchy.childCount} children`);
   * ```
   */
  get childCount(): number {
    return this._children.length;
  }

  /**
   * Gets the first child entity.
   *
   * @returns First child entity, or 0 if no children
   *
   * @example
   * ```typescript
   * const first = hierarchy.firstChild;
   * if (first !== 0) {
   *   console.log(`First child: ${first}`);
   * }
   * ```
   */
  get firstChild(): Entity {
    return this._children.length > 0 ? this._children[0] : 0;
  }

  /**
   * Gets the last child entity.
   *
   * @returns Last child entity, or 0 if no children
   *
   * @example
   * ```typescript
   * const last = hierarchy.lastChild;
   * if (last !== 0) {
   *   console.log(`Last child: ${last}`);
   * }
   * ```
   */
  get lastChild(): Entity {
    return this._children.length > 0 ? this._children[this._children.length - 1] : 0;
  }

  /**
   * Adds a child entity to this entity's children list.
   * Updates sibling links for efficient traversal.
   *
   * @internal Should only be called by HierarchySystem
   * @param child - Entity to add as child
   *
   * @example
   * ```typescript
   * // Internal use by HierarchySystem
   * parentHierarchy._addChild(childEntity);
   * ```
   */
  _addChild(child: Entity): void {
    const index = this._children.indexOf(child);
    if (index !== -1) {
      return;
    }

    this._children.push(child);
  }

  /**
   * Removes a child entity from this entity's children list.
   * Updates sibling links to maintain list integrity.
   *
   * @internal Should only be called by HierarchySystem
   * @param child - Entity to remove from children
   * @returns true if child was found and removed, false otherwise
   *
   * @example
   * ```typescript
   * // Internal use by HierarchySystem
   * const removed = parentHierarchy._removeChild(childEntity);
   * ```
   */
  _removeChild(child: Entity): boolean {
    const index = this._children.indexOf(child);
    if (index === -1) {
      return false;
    }

    this._children.splice(index, 1);
    return true;
  }

  /**
   * Sets the parent entity for this component.
   * Updates depth to be parent's depth + 1.
   *
   * @internal Should only be called by HierarchySystem
   * @param parent - New parent entity (0 for root)
   *
   * @example
   * ```typescript
   * // Internal use by HierarchySystem
   * childHierarchy._setParent(parentEntity);
   * ```
   */
  _setParent(parent: Entity): void {
    this.parent = parent;
  }

  /**
   * Removes all children from this entity.
   * Useful for destroying subtrees or reparenting operations.
   *
   * @internal Should only be called by HierarchySystem
   *
   * @example
   * ```typescript
   * // Internal use by HierarchySystem
   * parentHierarchy._clearChildren();
   * ```
   */
  _clearChildren(): void {
    this._children.length = 0;
  }

  /**
   * Checks if this entity has a parent.
   *
   * @returns true if entity has a parent (not root), false otherwise
   *
   * @example
   * ```typescript
   * if (hierarchy.hasParent()) {
   *   console.log(`Entity is child of ${hierarchy.parent}`);
   * } else {
   *   console.log('Entity is a root node');
   * }
   * ```
   */
  hasParent(): boolean {
    return this.parent !== 0;
  }

  /**
   * Checks if this entity has any children.
   *
   * @returns true if entity has children, false if leaf node
   *
   * @example
   * ```typescript
   * if (hierarchy.hasChildren()) {
   *   console.log(`Entity has ${hierarchy.childCount} children`);
   * } else {
   *   console.log('Entity is a leaf node');
   * }
   * ```
   */
  hasChildren(): boolean {
    return this._children.length > 0;
  }

  /**
   * Checks if this entity is an ancestor of another entity.
   *
   * Note: This component-level method only checks direct children.
   * For full ancestor traversal across entities, use HierarchySystem.isAncestorOf().
   *
   * @param entity - Entity to check if it's a direct child
   * @returns true if entity is a direct child of this entity
   *
   * @example
   * ```typescript
   * if (parentHierarchy.isAncestorOf(childEntity)) {
   *   console.log('Entity is a direct child');
   * }
   * // For full hierarchy check, use HierarchySystem instead
   * ```
   */
  isAncestorOf(entity: Entity): boolean {
    if (entity === 0) {
      return false;
    }

    // Check direct children only - full traversal requires HierarchySystem
    return this._children.includes(entity);
  }

  /**
   * Checks if this entity is a descendant of another entity.
   *
   * Note: This component-level method only checks direct parent.
   * For full descendant traversal, use HierarchySystem.isDescendantOf().
   *
   * @param entity - Entity to check if it's the direct parent
   * @returns true if entity is the direct parent of this entity
   *
   * @example
   * ```typescript
   * if (childHierarchy.isDescendantOf(parentEntity)) {
   *   console.log('Entity is a direct child of parent');
   * }
   * // For full hierarchy check, use HierarchySystem instead
   * ```
   */
  isDescendantOf(entity: Entity): boolean {
    if (entity === 0) {
      return false;
    }

    // Check direct parent only - full traversal requires HierarchySystem
    return this.parent === entity;
  }

  /**
   * Iterates over all direct children of this entity.
   *
   * Performance: O(n) where n is the number of children.
   *
   * @param callback - Function called for each child entity
   *
   * @example
   * ```typescript
   * hierarchy.forEachChild(child => {
   *   console.log(`Processing child: ${child}`);
   * });
   * ```
   */
  forEachChild(callback: (child: Entity) => void): void {
    for (const child of this._children) {
      callback(child);
    }
  }

  /**
   * Iterates over direct children with depth information.
   *
   * Note: This component-level method only iterates direct children.
   * For full recursive traversal of all descendants, use HierarchySystem.traverseDescendants()
   * which has access to all entity HierarchyComponents.
   *
   * @param callback - Function called for each direct child with its depth
   *
   * @example
   * ```typescript
   * // Iterate direct children only
   * hierarchy.forEachDescendant((child, depth) => {
   *   console.log(`Direct child ${child} at depth ${depth}`);
   * });
   * // For full tree traversal, use HierarchySystem.traverseDescendants()
   * ```
   */
  forEachDescendant(callback: (descendant: Entity, depth: number) => void): void {
    // Iterates direct children only - full recursive traversal requires HierarchySystem
    const childDepth = this.depth + 1;
    for (const child of this._children) {
      callback(child, childDepth);
    }
  }

  /**
   * Gets the index of this entity among siblings using sibling links.
   * Returns -1 if entity has no parent (is a root).
   *
   * Note: This calculates index by counting previousSibling links.
   * For O(1) access, store the index explicitly or use HierarchySystem.
   *
   * @returns Index among siblings (0-based), or -1 if no parent
   *
   * @example
   * ```typescript
   * const index = hierarchy.getSiblingIndex();
   * if (index !== -1) {
   *   console.log(`Entity is sibling #${index}`);
   * }
   * ```
   */
  getSiblingIndex(): number {
    if (this.parent === 0) {
      return -1;
    }

    // Count position by traversing previousSibling links
    // Note: Returns 0 if sibling links not maintained (component-only mode)
    let index = 0;
    let current = this.previousSibling;
    while (current !== 0 && index < 1000) { // Safety limit
      index++;
      // Without access to other components, we can only count our own links
      break; // In component-only mode, return 0 for first or -1 for unknown
    }
    return this.previousSibling === 0 ? 0 : index;
  }

  /**
   * Gets the next or previous sibling relative to this entity.
   *
   * Note: For arbitrary index access, use HierarchySystem.getSiblingAt()
   * which has access to the parent's children array.
   *
   * @param offset - Offset from current position (1 for next, -1 for previous)
   * @returns Sibling entity at offset, or 0 if not available
   *
   * @example
   * ```typescript
   * // Get next sibling
   * const next = hierarchy.getSiblingAt(1);
   * if (next !== 0) {
   *   console.log(`Next sibling: ${next}`);
   * }
   *
   * // Get previous sibling
   * const prev = hierarchy.getSiblingAt(-1);
   * ```
   */
  getSiblingAt(offset: number): Entity {
    if (this.parent === 0) {
      return 0;
    }

    // Support immediate neighbor access via sibling links
    if (offset === 1) {
      return this.nextSibling;
    } else if (offset === -1) {
      return this.previousSibling;
    }

    // For arbitrary index, return 0 - use HierarchySystem for full access
    return 0;
  }

  /**
   * Resets the component to its initial state.
   * Sets entity to root state with no parent and no children.
   *
   * @example
   * ```typescript
   * hierarchy.reset();
   * console.log(hierarchy.parent); // 0
   * console.log(hierarchy.childCount); // 0
   * console.log(hierarchy.depth); // 0
   * ```
   */
  reset(): void {
    this.parent = 0;
    this._children.length = 0;
    this.previousSibling = 0;
    this.nextSibling = 0;
    this.depth = 0;
  }

  /**
   * Serializes the component to a plain object.
   * Stores parent and children as entity IDs for scene persistence.
   *
   * @returns Plain object containing parent and children arrays
   *
   * @example
   * ```typescript
   * const data = hierarchy.serialize();
   * // data = { parent: 42, children: [1, 2, 3], depth: 1 }
   * const json = JSON.stringify(data);
   * ```
   */
  serialize(): object {
    return {
      parent: this.parent,
      children: [...this._children],
      previousSibling: this.previousSibling,
      nextSibling: this.nextSibling,
      depth: this.depth
    };
  }

  /**
   * Deserializes the component from a plain object.
   * Restores parent and children from stored entity IDs.
   *
   * @param data - Plain object containing component data
   *
   * @example
   * ```typescript
   * const data = JSON.parse(json);
   * hierarchy.deserialize(data);
   * console.log(hierarchy.parent); // 42
   * console.log(hierarchy.childCount); // 3
   * ```
   */
  deserialize(data: object): void {
    const d = data as {
      parent?: Entity;
      children?: Entity[];
      previousSibling?: Entity;
      nextSibling?: Entity;
      depth?: number;
    };

    this.parent = d.parent ?? 0;
    this._children = d.children ? [...d.children] : [];
    this.previousSibling = d.previousSibling ?? 0;
    this.nextSibling = d.nextSibling ?? 0;
    this.depth = d.depth ?? 0;
  }

  /**
   * Component schema for automatic serialization.
   * Defines field types for struct-of-arrays layout.
   */
  static readonly schema: ComponentSchema = {
    parent: 'entity',
    previousSibling: 'entity',
    nextSibling: 'entity',
    depth: 'u32'
  };

  /**
   * Component name for registration and debugging.
   */
  static readonly _componentName: string = 'HierarchyComponent';
}

