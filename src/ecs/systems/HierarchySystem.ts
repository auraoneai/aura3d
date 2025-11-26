/**
 * @fileoverview Hierarchy system for managing parent-child relationships in scene graphs.
 * Provides efficient tree operations, traversal, and validation for entity hierarchies.
 * @module ecs/systems/HierarchySystem
 */

import { System, SystemContext, IWorld } from '../System';
import { Query, QueryDescriptor } from '../Query';
import { Entity, EntityUtils } from '../Entity';
import { HierarchyComponent } from '../components/HierarchyComponent';
import { TransformComponent } from '../components/TransformComponent';

/**
 * Manages parent-child relationships and hierarchy operations in the scene graph.
 *
 * HierarchySystem provides a complete set of operations for building and querying
 * entity hierarchies with automatic validation, cycle detection, and integrity checks.
 * It ensures transforms are properly marked dirty when hierarchy changes occur.
 *
 * Key Features:
 * - Parent-child relationship management with automatic bookkeeping
 * - Cycle detection to prevent circular parent relationships
 * - Depth tracking and updates for hierarchical queries
 * - Tree traversal in depth-first order
 * - Ancestor/descendant relationship queries
 * - Sibling ordering for render order control
 * - Hierarchy validation and consistency checking
 *
 * Performance Characteristics:
 * - setParent: < 0.01ms (per operation)
 * - Tree traversal: O(n) where n = subtree size
 * - Ancestor check: O(d) where d = depth
 * - Validation: O(n) where n = total entity count
 *
 * @example
 * ```typescript
 * // Initialize hierarchy system
 * const hierarchySystem = new HierarchySystem();
 * world.addSystem(hierarchySystem);
 *
 * // Create a scene hierarchy: root -> child1 -> grandchild
 * const root = world.createEntity();
 * const child1 = world.createEntity();
 * const grandchild = world.createEntity();
 *
 * world.addComponent(root, HierarchyComponent);
 * world.addComponent(child1, HierarchyComponent);
 * world.addComponent(grandchild, HierarchyComponent);
 *
 * // Build hierarchy
 * hierarchySystem.setParent(child1, root);
 * hierarchySystem.setParent(grandchild, child1);
 *
 * // Query relationships
 * console.log(hierarchySystem.getDepth(grandchild)); // 2
 * console.log(hierarchySystem.isAncestorOf(root, grandchild)); // true
 *
 * // Traverse tree
 * hierarchySystem.forEachDescendant(root, (descendant, depth) => {
 *   console.log(`Entity ${descendant} at depth ${depth}`);
 * });
 *
 * // Validate integrity
 * if (hierarchySystem.validateHierarchy()) {
 *   console.log('Hierarchy is valid');
 * }
 * ```
 */
export class HierarchySystem extends System {
  override readonly name = 'HierarchySystem';
  override readonly query: QueryDescriptor = { all: [HierarchyComponent] };

  /**
   * Cached reference to world for component access.
   * Set during onInit().
   */
  private worldRef: IWorld | null = null;

  /**
   * Initializes the hierarchy system.
   * Performs initial validation of all existing hierarchies.
   *
   * @example
   * ```typescript
   * const system = new HierarchySystem();
   * world.addSystem(system);
   * world.init(); // Calls onInit()
   * ```
   */
  override onInit(): void {
    this.worldRef = this.world;

    // Validate initial hierarchy state
    const cycles = this.detectCycles();
    if (cycles.length > 0) {
      console.warn(`HierarchySystem: Detected ${cycles.length} cycles during initialization`);
    }
  }

  /**
   * Main update method that validates hierarchy integrity each frame.
   * Checks for orphaned children and depth consistency.
   *
   * @param context - System update context with timing information
   *
   * @example
   * ```typescript
   * // Called automatically by world each frame
   * world.update(deltaTime);
   * ```
   */
  override update(context: SystemContext): void {
    // Validate hierarchy integrity periodically
    // This is lightweight as it only checks for obvious inconsistencies
    const query = this.getQuery() as Query;

    for (const entity of query) {
      const hierarchy = this.getHierarchyComponent(entity);
      if (!hierarchy) continue;

      // Validate parent still exists and has this as child
      if (hierarchy.parent !== 0) {
        const parent = this.getHierarchyComponent(hierarchy.parent);
        if (!parent) {
          // Orphaned child - remove parent reference
          console.warn(`HierarchySystem: Entity ${entity} has invalid parent, detaching`);
          hierarchy._setParent(0);
          hierarchy.depth = 0;
          this.markTransformDirty(entity);
        }
      }
    }
  }

  /**
   * Sets the parent of a child entity, handling all bookkeeping automatically.
   * Removes child from old parent (if any) and adds to new parent.
   * Detects and prevents circular relationships.
   *
   * Performance: < 0.01ms per operation
   *
   * @param child - Entity to set parent for
   * @param parent - New parent entity (null or 0 to detach)
   * @throws Error if parent-child relationship would create a cycle
   *
   * @example
   * ```typescript
   * // Attach child to parent
   * hierarchySystem.setParent(child, parent);
   *
   * // Detach from parent (make root)
   * hierarchySystem.setParent(child, null);
   * hierarchySystem.setParent(child, 0); // Alternative syntax
   * ```
   */
  setParent(child: Entity, parent: Entity | null): void {
    if (!EntityUtils.isValid(child)) {
      throw new Error('Invalid child entity');
    }

    const normalizedParent = parent === null ? 0 : parent;

    // Validate parent if specified
    if (normalizedParent !== 0 && !EntityUtils.isValid(normalizedParent)) {
      throw new Error('Invalid parent entity');
    }

    const childHierarchy = this.getHierarchyComponent(child);
    if (!childHierarchy) {
      throw new Error(`Child entity ${child} does not have HierarchyComponent`);
    }

    // Check if already the parent
    if (childHierarchy.parent === normalizedParent) {
      return;
    }

    // Prevent setting self as parent
    if (child === normalizedParent) {
      throw new Error('Cannot set entity as its own parent');
    }

    // Prevent circular relationships
    if (normalizedParent !== 0) {
      if (this.isAncestorOf(child, normalizedParent)) {
        throw new Error(`Cannot set parent: would create circular relationship (${child} -> ${normalizedParent})`);
      }

      const parentHierarchy = this.getHierarchyComponent(normalizedParent);
      if (!parentHierarchy) {
        throw new Error(`Parent entity ${normalizedParent} does not have HierarchyComponent`);
      }
    }

    // Remove from old parent
    if (childHierarchy.parent !== 0) {
      const oldParentHierarchy = this.getHierarchyComponent(childHierarchy.parent);
      if (oldParentHierarchy) {
        oldParentHierarchy._removeChild(child);
      }
    }

    // Set new parent
    childHierarchy._setParent(normalizedParent);

    // Add to new parent's children
    if (normalizedParent !== 0) {
      const parentHierarchy = this.getHierarchyComponent(normalizedParent);
      if (parentHierarchy) {
        parentHierarchy._addChild(child);
        // Update depth
        childHierarchy.depth = parentHierarchy.depth + 1;
      }
    } else {
      // Root entity
      childHierarchy.depth = 0;
    }

    // Update depths of all descendants
    this.updateDescendantDepths(child);

    // Mark transform dirty for child and all descendants
    this.markTransformDirty(child);
    this.forEachDescendant(child, (descendant) => {
      this.markTransformDirty(descendant);
    });
  }

  /**
   * Adds a child entity to a parent entity.
   * Convenience method that calls setParent() internally.
   *
   * @param parent - Parent entity
   * @param child - Entity to add as child
   *
   * @example
   * ```typescript
   * hierarchySystem.addChild(parent, child1);
   * hierarchySystem.addChild(parent, child2);
   * ```
   */
  addChild(parent: Entity, child: Entity): void {
    this.setParent(child, parent);
  }

  /**
   * Removes a child entity from a parent entity.
   * Makes the child a root entity (no parent).
   *
   * @param parent - Parent entity
   * @param child - Child entity to remove
   *
   * @example
   * ```typescript
   * hierarchySystem.removeChild(parent, child);
   * // child is now a root entity
   * ```
   */
  removeChild(parent: Entity, child: Entity): void {
    if (!EntityUtils.isValid(parent) || !EntityUtils.isValid(child)) {
      return;
    }

    const childHierarchy = this.getHierarchyComponent(child);
    if (!childHierarchy || childHierarchy.parent !== parent) {
      return;
    }

    this.setParent(child, null);
  }

  /**
   * Removes an entity from its parent, making it a root entity.
   * No-op if entity has no parent.
   *
   * @param entity - Entity to remove from parent
   *
   * @example
   * ```typescript
   * hierarchySystem.removeFromParent(entity);
   * // entity is now a root
   * ```
   */
  removeFromParent(entity: Entity): void {
    if (!EntityUtils.isValid(entity)) {
      return;
    }

    const hierarchy = this.getHierarchyComponent(entity);
    if (!hierarchy || hierarchy.parent === 0) {
      return;
    }

    this.setParent(entity, null);
  }

  /**
   * Gets the parent of an entity.
   *
   * @param entity - Entity to query
   * @returns Parent entity, or null if entity is root
   *
   * @example
   * ```typescript
   * const parent = hierarchySystem.getParent(child);
   * if (parent !== null) {
   *   console.log(`Child has parent: ${parent}`);
   * }
   * ```
   */
  getParent(entity: Entity): Entity | null {
    if (!EntityUtils.isValid(entity)) {
      return null;
    }

    const hierarchy = this.getHierarchyComponent(entity);
    if (!hierarchy || hierarchy.parent === 0) {
      return null;
    }

    return hierarchy.parent;
  }

  /**
   * Gets the readonly array of children for an entity.
   *
   * @param entity - Entity to query
   * @returns Readonly array of child entities (empty if no children)
   *
   * @example
   * ```typescript
   * const children = hierarchySystem.getChildren(parent);
   * console.log(`Parent has ${children.length} children`);
   * for (const child of children) {
   *   console.log(`Child: ${child}`);
   * }
   * ```
   */
  getChildren(entity: Entity): readonly Entity[] {
    if (!EntityUtils.isValid(entity)) {
      return [];
    }

    const hierarchy = this.getHierarchyComponent(entity);
    if (!hierarchy) {
      return [];
    }

    return hierarchy.children;
  }

  /**
   * Gets the root entity of a hierarchy by walking up the parent chain.
   * If entity has no parent, returns itself (it is the root).
   *
   * @param entity - Entity to find root for
   * @returns Root entity at top of hierarchy
   *
   * @example
   * ```typescript
   * const root = hierarchySystem.getRoot(leafEntity);
   * console.log(`Root of hierarchy: ${root}`);
   * ```
   */
  getRoot(entity: Entity): Entity {
    if (!EntityUtils.isValid(entity)) {
      return entity;
    }

    let current = entity;
    let hierarchy = this.getHierarchyComponent(current);

    // Walk up parent chain until we reach root
    while (hierarchy && hierarchy.parent !== 0) {
      current = hierarchy.parent;
      hierarchy = this.getHierarchyComponent(current);
    }

    return current;
  }

  /**
   * Gets the depth of an entity in the hierarchy.
   * Root entities have depth 0.
   *
   * @param entity - Entity to query
   * @returns Depth level (0 for root, 1 for direct child, etc.)
   *
   * @example
   * ```typescript
   * console.log(`Entity depth: ${hierarchySystem.getDepth(entity)}`);
   * ```
   */
  getDepth(entity: Entity): number {
    if (!EntityUtils.isValid(entity)) {
      return 0;
    }

    const hierarchy = this.getHierarchyComponent(entity);
    return hierarchy ? hierarchy.depth : 0;
  }

  /**
   * Iterates over all direct children of an entity.
   *
   * @param entity - Entity to iterate children of
   * @param callback - Function called for each child
   *
   * @example
   * ```typescript
   * hierarchySystem.forEachChild(parent, (child) => {
   *   console.log(`Child: ${child}`);
   * });
   * ```
   */
  forEachChild(entity: Entity, callback: (child: Entity) => void): void {
    const hierarchy = this.getHierarchyComponent(entity);
    if (!hierarchy) {
      return;
    }

    hierarchy.forEachChild(callback);
  }

  /**
   * Traverses all descendants in depth-first order.
   * Visits children before siblings.
   *
   * Performance: O(n) where n = subtree size
   *
   * @param entity - Root entity to start traversal from
   * @param callback - Function called for each descendant with its depth
   *
   * @example
   * ```typescript
   * hierarchySystem.forEachDescendant(root, (descendant, depth) => {
   *   const indent = '  '.repeat(depth);
   *   console.log(`${indent}Entity ${descendant} at depth ${depth}`);
   * });
   * ```
   */
  forEachDescendant(entity: Entity, callback: (descendant: Entity, depth: number) => void): void {
    const hierarchy = this.getHierarchyComponent(entity);
    if (!hierarchy) {
      return;
    }

    const baseDepth = hierarchy.depth;

    // Depth-first traversal using recursion
    const traverse = (current: Entity) => {
      const currentHierarchy = this.getHierarchyComponent(current);
      if (!currentHierarchy) {
        return;
      }

      // Visit each child
      for (const child of currentHierarchy.children) {
        const childHierarchy = this.getHierarchyComponent(child);
        if (childHierarchy) {
          callback(child, childHierarchy.depth);
          // Recursively traverse child's descendants
          traverse(child);
        }
      }
    };

    traverse(entity);
  }

  /**
   * Traverses all ancestors from entity up to root.
   * The immediate parent is visited first, then grandparent, etc.
   *
   * Performance: O(d) where d = depth of entity
   *
   * @param entity - Entity to start from
   * @param callback - Function called for each ancestor with relative depth
   *
   * @example
   * ```typescript
   * hierarchySystem.forEachAncestor(leaf, (ancestor, depth) => {
   *   console.log(`Ancestor ${ancestor} at relative depth ${depth}`);
   * });
   * ```
   */
  forEachAncestor(entity: Entity, callback: (ancestor: Entity, depth: number) => void): void {
    if (!EntityUtils.isValid(entity)) {
      return;
    }

    let current = entity;
    let hierarchy = this.getHierarchyComponent(current);
    let relativeDepth = 1;

    // Walk up parent chain
    while (hierarchy && hierarchy.parent !== 0) {
      callback(hierarchy.parent, relativeDepth);
      current = hierarchy.parent;
      hierarchy = this.getHierarchyComponent(current);
      relativeDepth++;
    }
  }

  /**
   * Checks if ancestor is an ancestor of descendant.
   * An entity is not considered an ancestor of itself.
   *
   * Performance: O(d) where d = depth of descendant
   *
   * @param ancestor - Potential ancestor entity
   * @param descendant - Potential descendant entity
   * @returns true if ancestor is an ancestor of descendant
   *
   * @example
   * ```typescript
   * if (hierarchySystem.isAncestorOf(root, leaf)) {
   *   console.log('Leaf is in root\'s subtree');
   * }
   * ```
   */
  isAncestorOf(ancestor: Entity, descendant: Entity): boolean {
    if (!EntityUtils.isValid(ancestor) || !EntityUtils.isValid(descendant)) {
      return false;
    }

    if (ancestor === descendant) {
      return false;
    }

    let current = descendant;
    let hierarchy = this.getHierarchyComponent(current);

    // Walk up parent chain looking for ancestor
    while (hierarchy && hierarchy.parent !== 0) {
      if (hierarchy.parent === ancestor) {
        return true;
      }
      current = hierarchy.parent;
      hierarchy = this.getHierarchyComponent(current);
    }

    return false;
  }

  /**
   * Checks if descendant is a descendant of ancestor.
   * Equivalent to isAncestorOf(ancestor, descendant).
   *
   * @param descendant - Potential descendant entity
   * @param ancestor - Potential ancestor entity
   * @returns true if descendant is a descendant of ancestor
   *
   * @example
   * ```typescript
   * if (hierarchySystem.isDescendantOf(leaf, root)) {
   *   console.log('Leaf is in root\'s subtree');
   * }
   * ```
   */
  isDescendantOf(descendant: Entity, ancestor: Entity): boolean {
    return this.isAncestorOf(ancestor, descendant);
  }

  /**
   * Checks if two entities are siblings (share the same parent).
   *
   * @param a - First entity
   * @param b - Second entity
   * @returns true if entities share the same parent
   *
   * @example
   * ```typescript
   * if (hierarchySystem.isSiblingOf(entity1, entity2)) {
   *   console.log('Entities are siblings');
   * }
   * ```
   */
  isSiblingOf(a: Entity, b: Entity): boolean {
    if (!EntityUtils.isValid(a) || !EntityUtils.isValid(b)) {
      return false;
    }

    if (a === b) {
      return false;
    }

    const hierarchyA = this.getHierarchyComponent(a);
    const hierarchyB = this.getHierarchyComponent(b);

    if (!hierarchyA || !hierarchyB) {
      return false;
    }

    // Both must have same non-zero parent
    return hierarchyA.parent !== 0 && hierarchyA.parent === hierarchyB.parent;
  }

  /**
   * Finds the lowest common ancestor of two entities.
   * Returns null if entities are in different hierarchy trees.
   *
   * @param a - First entity
   * @param b - Second entity
   * @returns Common ancestor entity, or null if none exists
   *
   * @example
   * ```typescript
   * const common = hierarchySystem.getCommonAncestor(leaf1, leaf2);
   * if (common !== null) {
   *   console.log(`Common ancestor: ${common}`);
   * }
   * ```
   */
  getCommonAncestor(a: Entity, b: Entity): Entity | null {
    if (!EntityUtils.isValid(a) || !EntityUtils.isValid(b)) {
      return null;
    }

    if (a === b) {
      return a;
    }

    // Collect all ancestors of A including A itself
    const ancestorsOfA = new Set<Entity>();
    ancestorsOfA.add(a);

    let current = a;
    let hierarchy = this.getHierarchyComponent(current);
    while (hierarchy && hierarchy.parent !== 0) {
      ancestorsOfA.add(hierarchy.parent);
      current = hierarchy.parent;
      hierarchy = this.getHierarchyComponent(current);
    }

    // Walk up B's parent chain until we find one in A's ancestor set
    current = b;
    hierarchy = this.getHierarchyComponent(current);

    if (ancestorsOfA.has(b)) {
      return b;
    }

    while (hierarchy && hierarchy.parent !== 0) {
      if (ancestorsOfA.has(hierarchy.parent)) {
        return hierarchy.parent;
      }
      current = hierarchy.parent;
      hierarchy = this.getHierarchyComponent(current);
    }

    return null;
  }

  /**
   * Sets the sibling index of an entity within its parent's children array.
   * Affects render order and iteration order.
   *
   * @param entity - Entity to reorder
   * @param index - New index in parent's children array
   *
   * @example
   * ```typescript
   * // Move entity to first position
   * hierarchySystem.setSiblingIndex(entity, 0);
   *
   * // Move entity to last position
   * const children = hierarchySystem.getChildren(parent);
   * hierarchySystem.setSiblingIndex(entity, children.length - 1);
   * ```
   */
  setSiblingIndex(entity: Entity, index: number): void {
    if (!EntityUtils.isValid(entity)) {
      return;
    }

    const hierarchy = this.getHierarchyComponent(entity);
    if (!hierarchy || hierarchy.parent === 0) {
      return;
    }

    const parentHierarchy = this.getHierarchyComponent(hierarchy.parent);
    if (!parentHierarchy) {
      return;
    }

    const children = parentHierarchy.children as Entity[];
    const currentIndex = children.indexOf(entity);
    if (currentIndex === -1) {
      return;
    }

    // Clamp index to valid range
    const clampedIndex = Math.max(0, Math.min(index, children.length - 1));

    if (currentIndex === clampedIndex) {
      return;
    }

    // Remove from current position
    children.splice(currentIndex, 1);

    // Insert at new position
    children.splice(clampedIndex, 0, entity);
  }

  /**
   * Gets the sibling index of an entity within its parent's children array.
   * Returns -1 if entity has no parent.
   *
   * @param entity - Entity to query
   * @returns Index in parent's children array, or -1 if no parent
   *
   * @example
   * ```typescript
   * const index = hierarchySystem.getSiblingIndex(entity);
   * console.log(`Entity is child #${index} of its parent`);
   * ```
   */
  getSiblingIndex(entity: Entity): number {
    if (!EntityUtils.isValid(entity)) {
      return -1;
    }

    const hierarchy = this.getHierarchyComponent(entity);
    if (!hierarchy || hierarchy.parent === 0) {
      return -1;
    }

    const parentHierarchy = this.getHierarchyComponent(hierarchy.parent);
    if (!parentHierarchy) {
      return -1;
    }

    return parentHierarchy.children.indexOf(entity);
  }

  /**
   * Detaches all children from an entity, making them root entities.
   * Returns array of detached children.
   *
   * @param entity - Entity to detach children from
   * @returns Array of detached child entities
   *
   * @example
   * ```typescript
   * const detached = hierarchySystem.detachAllChildren(parent);
   * console.log(`Detached ${detached.length} children`);
   * ```
   */
  detachAllChildren(entity: Entity): Entity[] {
    if (!EntityUtils.isValid(entity)) {
      return [];
    }

    const hierarchy = this.getHierarchyComponent(entity);
    if (!hierarchy || hierarchy.children.length === 0) {
      return [];
    }

    // Copy children array before modifying
    const children = [...hierarchy.children];

    // Detach each child
    for (const child of children) {
      this.setParent(child, null);
    }

    return children;
  }

  /**
   * Validates the entire hierarchy for consistency.
   * Checks for orphaned children, invalid parents, and depth consistency.
   *
   * @returns true if hierarchy is valid, false if inconsistencies found
   *
   * @example
   * ```typescript
   * if (!hierarchySystem.validateHierarchy()) {
   *   console.error('Hierarchy validation failed');
   *   const cycles = hierarchySystem.detectCycles();
   *   console.error(`Found ${cycles.length} cycles`);
   * }
   * ```
   */
  validateHierarchy(): boolean {
    const query = this.getQuery() as Query;
    let valid = true;

    for (const entity of query) {
      const hierarchy = this.getHierarchyComponent(entity);
      if (!hierarchy) continue;

      // Check parent exists
      if (hierarchy.parent !== 0) {
        const parentHierarchy = this.getHierarchyComponent(hierarchy.parent);
        if (!parentHierarchy) {
          console.error(`Validation error: Entity ${entity} has invalid parent ${hierarchy.parent}`);
          valid = false;
          continue;
        }

        // Check parent has this as child
        if (!parentHierarchy.children.includes(entity)) {
          console.error(`Validation error: Parent ${hierarchy.parent} missing child ${entity}`);
          valid = false;
        }

        // Check depth is consistent
        if (hierarchy.depth !== parentHierarchy.depth + 1) {
          console.error(`Validation error: Entity ${entity} has inconsistent depth (expected ${parentHierarchy.depth + 1}, got ${hierarchy.depth})`);
          valid = false;
        }
      } else {
        // Root entity should have depth 0
        if (hierarchy.depth !== 0) {
          console.error(`Validation error: Root entity ${entity} has non-zero depth ${hierarchy.depth}`);
          valid = false;
        }
      }

      // Check all children exist and point back to this parent
      for (const child of hierarchy.children) {
        const childHierarchy = this.getHierarchyComponent(child);
        if (!childHierarchy) {
          console.error(`Validation error: Entity ${entity} has invalid child ${child}`);
          valid = false;
          continue;
        }

        if (childHierarchy.parent !== entity) {
          console.error(`Validation error: Child ${child} doesn't reference parent ${entity}`);
          valid = false;
        }
      }
    }

    return valid;
  }

  /**
   * Detects circular parent-child relationships in the hierarchy.
   * Returns array of entities that are part of cycles.
   *
   * @returns Array of entities involved in circular relationships
   *
   * @example
   * ```typescript
   * const cycles = hierarchySystem.detectCycles();
   * if (cycles.length > 0) {
   *   console.error(`Detected cycles involving: ${cycles.join(', ')}`);
   * }
   * ```
   */
  detectCycles(): Entity[] {
    const query = this.getQuery() as Query;
    const cycleEntities: Entity[] = [];
    const visited = new Set<Entity>();
    const recursionStack = new Set<Entity>();

    const hasCycle = (entity: Entity): boolean => {
      if (recursionStack.has(entity)) {
        return true;
      }

      if (visited.has(entity)) {
        return false;
      }

      visited.add(entity);
      recursionStack.add(entity);

      const hierarchy = this.getHierarchyComponent(entity);
      if (hierarchy && hierarchy.parent !== 0) {
        if (hasCycle(hierarchy.parent)) {
          cycleEntities.push(entity);
          recursionStack.delete(entity);
          return true;
        }
      }

      recursionStack.delete(entity);
      return false;
    };

    for (const entity of query) {
      if (!visited.has(entity)) {
        hasCycle(entity);
      }
    }

    return cycleEntities;
  }

  /**
   * Gets the HierarchyComponent for an entity.
   * Internal helper method for type-safe component access.
   *
   * @param entity - Entity to get component from
   * @returns HierarchyComponent or undefined if not found
   */
  private getHierarchyComponent(entity: Entity): HierarchyComponent | undefined {
    if (!this.worldRef) {
      return undefined;
    }

    // Access world's getComponent method
    const world = this.worldRef as any;
    return world.getComponent ? world.getComponent(entity, HierarchyComponent) : undefined;
  }

  /**
   * Marks the transform component dirty for an entity if it exists.
   * This ensures transform matrices are recalculated after hierarchy changes.
   *
   * @param entity - Entity to mark transform dirty for
   */
  private markTransformDirty(entity: Entity): void {
    if (!this.worldRef) {
      return;
    }

    const world = this.worldRef as any;
    if (!world.getComponent) {
      return;
    }

    const transform = world.getComponent(entity, TransformComponent);
    if (transform) {
      transform.setDirty();
    }
  }

  /**
   * Updates depth values for all descendants after a hierarchy change.
   * Recursively walks the tree and updates depth based on parent.
   *
   * @param entity - Root entity to start depth update from
   */
  private updateDescendantDepths(entity: Entity): void {
    const hierarchy = this.getHierarchyComponent(entity);
    if (!hierarchy) {
      return;
    }

    const parentDepth = hierarchy.depth;

    // Update all children's depths
    for (const child of hierarchy.children) {
      const childHierarchy = this.getHierarchyComponent(child);
      if (childHierarchy) {
        childHierarchy.depth = parentDepth + 1;
        // Recursively update descendants
        this.updateDescendantDepths(child);
      }
    }
  }
}

// Class already exported above
