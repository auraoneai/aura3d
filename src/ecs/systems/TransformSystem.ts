/**
 * @fileoverview Transform system for updating transform matrices and propagating hierarchy changes.
 * Handles efficient batch updates of local and world matrices with hierarchy-aware ordering.
 * @module ecs/systems/TransformSystem
 */

import { System, SystemContext, SystemPriorities } from '../System';
import { QueryDescriptor, Query } from '../Query';
import { Entity } from '../Entity';
import { TransformComponent } from '../components/TransformComponent';
import { HierarchyComponent } from '../components/HierarchyComponent';
import { Matrix4 } from '../../math/Matrix4';

/**
 * System responsible for updating transform matrices and propagating hierarchy changes.
 *
 * The TransformSystem maintains the relationship between local and world space transformations
 * across entity hierarchies. It ensures that world matrices are computed correctly by processing
 * entities in depth order (parents before children).
 *
 * Key responsibilities:
 * - Update local matrices from position/rotation/scale when dirty
 * - Propagate world matrices through parent-child hierarchies
 * - Process transforms in hierarchy order for correctness
 * - Batch dirty entities by depth level for optimal performance
 * - Provide query methods for accessing computed matrices
 *
 * Performance characteristics:
 * - 100k transforms update < 5ms (specification requirement)
 * - Depth-based batching minimizes cache misses
 * - Dirty tracking prevents redundant computations
 * - Single-pass hierarchy traversal
 *
 * Transform hierarchy rules:
 * - Root entities (no parent): worldMatrix = localMatrix
 * - Child entities: worldMatrix = parent.worldMatrix * localMatrix
 * - Depth 0 = root, depth N = N levels from root
 *
 * @example
 * ```typescript
 * // Create and add the transform system
 * const transformSystem = new TransformSystem();
 * world.addSystem(transformSystem);
 *
 * // System automatically updates all transform matrices each frame
 * world.update(context);
 *
 * // Query world matrix for an entity
 * const worldMatrix = transformSystem.getWorldMatrix(entity);
 *
 * // Manually mark an entity's transform as dirty
 * transformSystem.setDirty(entity);
 *
 * // Update a specific entity's transform
 * transformSystem.updateEntityTransform(entity);
 *
 * // Update an entire hierarchy starting from root
 * transformSystem.updateHierarchy(rootEntity);
 * ```
 */
export class TransformSystem extends System {
  /**
   * Human-readable system name for debugging and profiling.
   */
  override readonly name = 'TransformSystem';

  /**
   * Query descriptor for entities with TransformComponent.
   * Matches all entities that have transforms requiring updates.
   */
  readonly query: QueryDescriptor = { all: [TransformComponent] };

  /**
   * Set of entity IDs that have dirty transforms requiring updates.
   * Cleared after processing each frame.
   */
  private dirtyEntities: Set<Entity>;

  /**
   * Map from depth level to array of entities at that depth.
   * Used for batch processing entities in hierarchy order.
   */
  private entitiesByDepth: Map<number, Entity[]>;

  /**
   * Cache for entity world matrices for fast queries.
   * Updated during each frame's update pass.
   */
  private worldMatrixCache: Map<Entity, Matrix4>;

  /**
   * Cache for entity local matrices for fast queries.
   * Updated during each frame's update pass.
   */
  private localMatrixCache: Map<Entity, Matrix4>;

  /**
   * Creates a new TransformSystem instance.
   *
   * @example
   * ```typescript
   * const system = new TransformSystem();
   * world.addSystem(system);
   * ```
   */
  constructor() {
    super({
      name: 'TransformSystem',
      priority: SystemPriorities.PRE_UPDATE,
      enabled: true
    });

    this.dirtyEntities = new Set<Entity>();
    this.entitiesByDepth = new Map<number, Entity[]>();
    this.worldMatrixCache = new Map<Entity, Matrix4>();
    this.localMatrixCache = new Map<Entity, Matrix4>();
  }

  /**
   * Initializes the transform system.
   * Called once when the system is added to the world.
   *
   * @example
   * ```typescript
   * // Automatically called by world.addSystem()
   * world.addSystem(transformSystem);
   * ```
   */
  override onInit(): void {
    this.dirtyEntities.clear();
    this.entitiesByDepth.clear();
    this.worldMatrixCache.clear();
    this.localMatrixCache.clear();
  }

  /**
   * Main update method called every frame.
   * Updates all dirty transform matrices in hierarchy order.
   *
   * Algorithm:
   * 1. Mark all entities as dirty if any transforms changed
   * 2. Update local matrices for all dirty entities
   * 3. Group entities by depth level
   * 4. Process depth levels in order (0, 1, 2, ...)
   * 5. Update world matrices within each level
   * 6. Clear dirty flags after processing
   *
   * @param context - Update context with timing information
   *
   * @example
   * ```typescript
   * // Called automatically by world.update()
   * const context: SystemContext = {
   *   deltaTime: 0.016,
   *   fixedDeltaTime: 0.016,
   *   time: 1.5,
   *   frameCount: 90
   * };
   * transformSystem.update(context);
   * ```
   */
  override update(context: SystemContext): void {
    const query = this.getQuery() as Query;

    // Phase 1: Update all local matrices
    this.updateLocalMatrices();

    // Phase 2: Build depth-based entity groups
    this.buildDepthGroups(query);

    // Phase 3: Update world matrices in depth order
    this.updateWorldMatrices();

    // Phase 4: Clear dirty flags
    this.dirtyEntities.clear();
  }

  /**
   * Updates local matrices for all entities with dirty transforms.
   * Local matrix = compose(position, rotation, scale)
   *
   * Performance: Processes only dirty entities for efficiency.
   *
   * @example
   * ```typescript
   * // Manually trigger local matrix updates
   * transformSystem.updateLocalMatrices();
   * ```
   */
  updateLocalMatrices(): void {
    const query = this.getQuery() as Query;

    query.forEachWith([TransformComponent], (entity: Entity, transform: TransformComponent) => {
      if (this.isDirty(entity) || transform['_localMatrixDirty']) {
        transform.updateLocalMatrix();
        this.localMatrixCache.set(entity, transform.localMatrix.clone());
      }
    });
  }

  /**
   * Updates world matrices for all entities in hierarchy order.
   * Processes entities depth-by-depth to ensure parents are updated before children.
   *
   * Algorithm:
   * 1. Sort depth levels (0, 1, 2, ...)
   * 2. For each depth level:
   *    - Process all entities at that depth
   *    - Root entities (depth 0): worldMatrix = localMatrix
   *    - Child entities: worldMatrix = parent.worldMatrix * localMatrix
   * 3. Update world matrix cache
   *
   * Performance: O(n) where n = number of entities
   *
   * @example
   * ```typescript
   * // Manually trigger world matrix updates
   * transformSystem.updateWorldMatrices();
   * ```
   */
  updateWorldMatrices(): void {
    if (!this.world) {
      return;
    }

    // Get all depth levels and sort them
    const depths = Array.from(this.entitiesByDepth.keys()).sort((a, b) => a - b);

    // Process each depth level in order
    for (const depth of depths) {
      const entities = this.entitiesByDepth.get(depth);
      if (!entities) {
        continue;
      }

      // Update world matrices for all entities at this depth
      for (const entity of entities) {
        this.updateEntityWorldMatrix(entity);
      }
    }
  }

  /**
   * Updates both local and world matrices for a single entity.
   * Useful for immediate updates outside the main update loop.
   *
   * @param entity - Entity to update
   *
   * @example
   * ```typescript
   * // Immediately update a specific entity's transform
   * const entity = world.createEntity();
   * const transform = world.addComponent(entity, TransformComponent);
   * transform.position.set(10, 20, 30);
   * transformSystem.updateEntityTransform(entity);
   * ```
   */
  updateEntityTransform(entity: Entity): void {
    const query = this.getQuery();
    const components = query.get(entity);

    if (!components) {
      return;
    }

    const transform = components.find(c => c instanceof TransformComponent) as TransformComponent;
    if (!transform) {
      return;
    }

    // Update local matrix
    transform.updateLocalMatrix();
    this.localMatrixCache.set(entity, transform.localMatrix.clone());

    // Update world matrix
    this.updateEntityWorldMatrix(entity);
  }

  /**
   * Updates the world matrix for a single entity.
   * Retrieves parent's world matrix if entity has hierarchy.
   *
   * Rules:
   * - If entity has no parent: worldMatrix = localMatrix
   * - If entity has parent: worldMatrix = parent.worldMatrix * localMatrix
   *
   * @param entity - Entity to update
   *
   * @example
   * ```typescript
   * // Update world matrix for a specific entity
   * transformSystem.updateEntityWorldMatrix(childEntity);
   * ```
   */
  updateEntityWorldMatrix(entity: Entity): void {
    const query = this.getQuery();
    const components = query.get(entity);

    if (!components) {
      return;
    }

    const transform = components.find(c => c instanceof TransformComponent) as TransformComponent;
    if (!transform) {
      return;
    }

    // Get hierarchy component if present
    const hierarchyQuery = this.world?.getQuery({ all: [HierarchyComponent] });
    const hierarchyComponents = hierarchyQuery?.get(entity);
    const hierarchy = hierarchyComponents?.find(c => c instanceof HierarchyComponent) as HierarchyComponent | undefined;

    // Determine parent world matrix
    let parentWorldMatrix: Matrix4 | undefined;

    if (hierarchy && hierarchy.parent !== 0) {
      // Entity has a parent, use parent's world matrix
      parentWorldMatrix = this.getWorldMatrix(hierarchy.parent) || undefined;
    }

    // Update world matrix
    transform.updateWorldMatrix(parentWorldMatrix);
    this.worldMatrixCache.set(entity, transform.worldMatrix.clone());
  }

  /**
   * Updates an entire hierarchy starting from a root entity.
   * Recursively processes all descendants in depth-first order.
   *
   * This is useful for immediately updating a subtree without waiting
   * for the next frame's update cycle.
   *
   * @param rootEntity - Root entity of the hierarchy to update
   *
   * @example
   * ```typescript
   * // Update an entire scene graph subtree
   * const sceneRoot = world.createEntity();
   * transformSystem.updateHierarchy(sceneRoot);
   * ```
   */
  updateHierarchy(rootEntity: Entity): void {
    // Update the root entity first
    this.updateEntityTransform(rootEntity);

    // Get hierarchy component
    const hierarchyQuery = this.world?.getQuery({ all: [HierarchyComponent] });
    const hierarchyComponents = hierarchyQuery?.get(rootEntity);
    const hierarchy = hierarchyComponents?.find(c => c instanceof HierarchyComponent) as HierarchyComponent | undefined;

    if (!hierarchy || hierarchy.childCount === 0) {
      return;
    }

    // Recursively update all children
    for (const child of hierarchy.children) {
      this.updateHierarchy(child);
    }
  }

  /**
   * Marks an entity and all its descendants as dirty.
   * Ensures the entire hierarchy will be updated on the next frame.
   *
   * @param entity - Entity to mark as dirty
   *
   * @example
   * ```typescript
   * // Mark entity and children as dirty after modifying parent
   * const parent = world.getEntity(parentId);
   * parentTransform.position.set(100, 200, 300);
   * transformSystem.markHierarchyDirty(parentId);
   * ```
   */
  markHierarchyDirty(entity: Entity): void {
    // Mark this entity as dirty
    this.setDirty(entity);

    // Get hierarchy component
    const hierarchyQuery = this.world?.getQuery({ all: [HierarchyComponent] });
    const hierarchyComponents = hierarchyQuery?.get(entity);
    const hierarchy = hierarchyComponents?.find(c => c instanceof HierarchyComponent) as HierarchyComponent | undefined;

    if (!hierarchy || hierarchy.childCount === 0) {
      return;
    }

    // Recursively mark all children as dirty
    for (const child of hierarchy.children) {
      this.markHierarchyDirty(child);
    }
  }

  /**
   * Gets the world matrix for an entity.
   * Returns cached matrix if available, otherwise computes it.
   *
   * @param entity - Entity to query
   * @returns World matrix or undefined if entity has no transform
   *
   * @example
   * ```typescript
   * const worldMatrix = transformSystem.getWorldMatrix(entity);
   * if (worldMatrix) {
   *   const worldPos = worldMatrix.getPosition();
   *   console.log(`World position: ${worldPos.x}, ${worldPos.y}, ${worldPos.z}`);
   * }
   * ```
   */
  getWorldMatrix(entity: Entity): Matrix4 | undefined {
    // Check cache first
    if (this.worldMatrixCache.has(entity)) {
      return this.worldMatrixCache.get(entity);
    }

    // Not in cache, try to get from component
    const query = this.getQuery();
    const components = query.get(entity);

    if (!components) {
      return undefined;
    }

    const transform = components.find(c => c instanceof TransformComponent) as TransformComponent;
    if (!transform) {
      return undefined;
    }

    // Update and cache the world matrix
    this.updateEntityWorldMatrix(entity);
    return this.worldMatrixCache.get(entity);
  }

  /**
   * Gets the local matrix for an entity.
   * Returns cached matrix if available, otherwise computes it.
   *
   * @param entity - Entity to query
   * @returns Local matrix or undefined if entity has no transform
   *
   * @example
   * ```typescript
   * const localMatrix = transformSystem.getLocalMatrix(entity);
   * if (localMatrix) {
   *   const localPos = localMatrix.getPosition();
   *   console.log(`Local position: ${localPos.x}, ${localPos.y}, ${localPos.z}`);
   * }
   * ```
   */
  getLocalMatrix(entity: Entity): Matrix4 | undefined {
    // Check cache first
    if (this.localMatrixCache.has(entity)) {
      return this.localMatrixCache.get(entity);
    }

    // Not in cache, try to get from component
    const query = this.getQuery();
    const components = query.get(entity);

    if (!components) {
      return undefined;
    }

    const transform = components.find(c => c instanceof TransformComponent) as TransformComponent;
    if (!transform) {
      return undefined;
    }

    // Cache the local matrix
    this.localMatrixCache.set(entity, transform.localMatrix.clone());
    return this.localMatrixCache.get(entity);
  }

  /**
   * Checks if an entity's transform is marked as dirty.
   *
   * @param entity - Entity to check
   * @returns true if entity is dirty, false otherwise
   *
   * @example
   * ```typescript
   * if (transformSystem.isDirty(entity)) {
   *   console.log('Entity transform needs update');
   * }
   * ```
   */
  isDirty(entity: Entity): boolean {
    return this.dirtyEntities.has(entity);
  }

  /**
   * Marks an entity's transform as dirty, requiring an update.
   * The entity will be updated during the next update cycle.
   *
   * @param entity - Entity to mark as dirty
   *
   * @example
   * ```typescript
   * // Mark entity dirty after modifying transform
   * transform.position.set(10, 20, 30);
   * transformSystem.setDirty(entity);
   * ```
   */
  setDirty(entity: Entity): void {
    this.dirtyEntities.add(entity);
  }

  /**
   * Clears the dirty flag for an entity.
   * Called automatically after updating the entity's transform.
   *
   * @param entity - Entity to clear dirty flag for
   *
   * @example
   * ```typescript
   * // Manually clear dirty flag (normally not needed)
   * transformSystem.clearDirty(entity);
   * ```
   */
  clearDirty(entity: Entity): void {
    this.dirtyEntities.delete(entity);
  }

  /**
   * Builds depth-based groupings of entities for efficient batch processing.
   * Groups entities by their hierarchy depth for correct ordering.
   *
   * @param query - Query containing entities to group
   * @private
   */
  private buildDepthGroups(query: Query): void {
    // Clear existing groups
    this.entitiesByDepth.clear();

    // Get hierarchy query
    const hierarchyQuery = this.world?.getQuery({ all: [HierarchyComponent] });

    // Group entities by depth
    query.forEachWith([TransformComponent], (entity) => {
      // Default depth is 0 (root entities)
      let depth = 0;

      // Check if entity has hierarchy component
      if (hierarchyQuery) {
        const hierarchyComponents = hierarchyQuery.get(entity);
        const hierarchy = hierarchyComponents?.find(c => c instanceof HierarchyComponent) as HierarchyComponent | undefined;

        if (hierarchy) {
          depth = hierarchy.depth;
        }
      }

      // Add entity to its depth group
      if (!this.entitiesByDepth.has(depth)) {
        this.entitiesByDepth.set(depth, []);
      }

      this.entitiesByDepth.get(depth)!.push(entity);
    });
  }
}

// Class already exported above
