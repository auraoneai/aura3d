/**
 * @fileoverview System architecture for the ECS framework.
 * Provides base system class, system groups, priorities, and scheduling infrastructure.
 *
 * Systems are the logic layer of the ECS that process entities matching specific queries.
 * They run every frame (update), at fixed timesteps (fixedUpdate), or after all updates (lateUpdate).
 *
 * @module ecs/System
 */

import { Entity } from './Entity';
import { IComponent, ComponentType } from './ComponentRegistry';

/**
 * Query descriptor for defining component requirements.
 * Can be an array of component types or a more complex query object.
 * This type is defined inline here for modularity; Query.ts extends this.
 */
export type QueryDescriptor = ComponentType[] | {
  all?: ComponentType[];
  any?: ComponentType[];
  none?: ComponentType[];
};

/**
 * Query result interface for iterating matched entities.
 * Provides iteration and access methods for entity queries.
 */
export interface Query {
  forEach(callback: (entity: Entity, components: IComponent[]) => void): void;
  get(entity: Entity): IComponent[] | null;
}

/**
 * System execution priority (lower values execute first).
 * Used to control system execution order within the same update phase.
 */
export type SystemPriority = number;

/**
 * Context passed to system update methods.
 * Contains timing information and frame counter.
 *
 * @example
 * ```typescript
 * class MovementSystem extends System {
 *   update(context: SystemContext): void {
 *     const velocity = 10;
 *     const distance = velocity * context.deltaTime;
 *     // Move entities based on delta time
 *   }
 * }
 * ```
 */
export interface SystemContext {
  /**
   * Time elapsed since last frame in seconds.
   * Use for frame-rate independent updates.
   */
  deltaTime: number;

  /**
   * Fixed timestep duration in seconds (typically 1/60 or 0.016667).
   * Use in fixedUpdate() for deterministic physics.
   */
  fixedDeltaTime: number;

  /**
   * Total elapsed time since application start in seconds.
   */
  time: number;

  /**
   * Total number of frames rendered since application start.
   */
  frameCount: number;
}

/**
 * Forward reference to World for query resolution.
 * Systems need access to the world to resolve queries.
 */
export interface IWorld {
  /**
   * Gets or creates a query matching the given descriptor.
   * Queries are cached for performance.
   *
   * @param descriptor - Query descriptor defining component requirements
   * @returns Query instance for iterating matching entities
   */
  getQuery(descriptor: QueryDescriptor): Query;
}

/**
 * Base class for all systems in the ECS framework.
 *
 * Systems define logic that operates on entities with specific components.
 * Each system declares a query describing which entities it processes,
 * and implements update methods that run at different phases.
 *
 * @abstract
 *
 * @example
 * ```typescript
 * // Simple movement system
 * class MovementSystem extends System {
 *   query = [Position, Velocity];
 *
 *   update(context: SystemContext): void {
 *     const query = this.getQuery();
 *     query.forEach((entity, [position, velocity]) => {
 *       position.x += velocity.x * context.deltaTime;
 *       position.y += velocity.y * context.deltaTime;
 *       position.z += velocity.z * context.deltaTime;
 *     });
 *   }
 * }
 *
 * // System with fixed update for physics
 * class PhysicsSystem extends System {
 *   query = { all: [RigidBody, Position] };
 *   priority = SystemPriorities.PHYSICS;
 *
 *   fixedUpdate(context: SystemContext): void {
 *     // Deterministic physics at fixed timestep
 *     const dt = context.fixedDeltaTime;
 *     this.processEntity = (entity, [body, pos]) => {
 *       pos.y += body.velocityY * dt;
 *       body.velocityY += -9.81 * dt; // gravity
 *     };
 *   }
 * }
 *
 * // System with lifecycle hooks
 * class RenderSystem extends System {
 *   query = [Mesh, Transform];
 *   priority = SystemPriorities.RENDERING;
 *
 *   private renderer: WebGLRenderer;
 *
 *   onInit(): void {
 *     this.renderer = new WebGLRenderer();
 *   }
 *
 *   onStart(): void {
 *     console.log('Render system started');
 *   }
 *
 *   update(context: SystemContext): void {
 *     this.renderer.clear();
 *     this.getQuery().forEach((entity, [mesh, transform]) => {
 *       this.renderer.draw(mesh, transform);
 *     });
 *   }
 *
 *   onDestroy(): void {
 *     this.renderer.dispose();
 *   }
 * }
 * ```
 */
export abstract class System {
  /**
   * Human-readable system name for debugging.
   * Defaults to constructor name if not specified.
   */
  readonly name: string;

  /**
   * Execution priority (lower values run first).
   * Default is 0. Use SystemPriorities constants for standard values.
   */
  priority: SystemPriority;

  /**
   * Whether this system is currently enabled.
   * Disabled systems are skipped during updates without removal.
   */
  enabled: boolean;

  /**
   * Query descriptor defining which entities this system processes.
   * Must be overridden by subclasses.
   *
   * Can be:
   * - Array of component types: [Position, Velocity]
   * - Query object: { all: [Position], any: [Static, Dynamic], none: [Disabled] }
   */
  abstract readonly query: QueryDescriptor | Query;

  /**
   * Reference to the world this system belongs to.
   * Set by World when system is added, null before attachment.
   * @protected
   */
  protected world: IWorld | null = null;

  /**
   * Resolved query instance, cached after first access.
   * World resolves this from the query property.
   * @internal
   */
  _resolvedQuery: Query | null = null;

  /**
   * Creates a new system instance.
   *
   * @param options - Configuration options
   * @param options.name - System name (defaults to constructor name)
   * @param options.priority - Execution priority (defaults to 0)
   * @param options.enabled - Initial enabled state (defaults to true)
   *
   * @example
   * ```typescript
   * class CustomSystem extends System {
   *   constructor() {
   *     super({
   *       name: 'CustomSystem',
   *       priority: SystemPriorities.EARLY,
   *       enabled: true
   *     });
   *   }
   * }
   * ```
   */
  constructor(options?: { name?: string; priority?: number; enabled?: boolean }) {
    this.name = options?.name ?? this.constructor.name;
    this.priority = options?.priority ?? SystemPriorities.DEFAULT;
    this.enabled = options?.enabled ?? true;
  }

  /**
   * Called once when the system is first added to the world.
   * Use for one-time initialization like resource allocation.
   *
   * @example
   * ```typescript
   * onInit(): void {
   *   this.particlePool = new ParticlePool(1000);
   *   this.quadTree = new QuadTree();
   * }
   * ```
   */
  onInit?(): void;

  /**
   * Called when the system starts running (after onInit).
   * Use for setup that depends on other systems being initialized.
   *
   * @example
   * ```typescript
   * onStart(): void {
   *   console.log(`${this.name} started`);
   *   this.startTime = performance.now();
   * }
   * ```
   */
  onStart?(): void;

  /**
   * Called when the system is stopped (before onDestroy).
   * Use for pausing or temporary cleanup.
   *
   * @example
   * ```typescript
   * onStop(): void {
   *   this.audioContext.suspend();
   *   this.saveState();
   * }
   * ```
   */
  onStop?(): void;

  /**
   * Called when the system is removed from the world.
   * Use for final cleanup and resource deallocation.
   *
   * @example
   * ```typescript
   * onDestroy(): void {
   *   this.renderer.dispose();
   *   this.particlePool.clear();
   * }
   * ```
   */
  onDestroy?(): void;

  /**
   * Main update method called every frame.
   * Must be implemented by subclasses.
   *
   * @param context - Update context with timing information
   *
   * @example
   * ```typescript
   * update(context: SystemContext): void {
   *   const query = this.getQuery();
   *   query.forEach((entity, [position, velocity]) => {
   *     position.x += velocity.x * context.deltaTime;
   *     position.y += velocity.y * context.deltaTime;
   *   });
   * }
   * ```
   */
  abstract update(context: SystemContext): void;

  /**
   * Fixed update method called at constant timestep.
   * Optional - implement for physics or deterministic updates.
   *
   * @param context - Update context (use context.fixedDeltaTime)
   *
   * @example
   * ```typescript
   * fixedUpdate(context: SystemContext): void {
   *   const dt = context.fixedDeltaTime;
   *   this.getQuery().forEach((entity, [body, position]) => {
   *     // Apply gravity
   *     body.velocityY -= 9.81 * dt;
   *     // Update position
   *     position.y += body.velocityY * dt;
   *   });
   * }
   * ```
   */
  fixedUpdate?(context: SystemContext): void;

  /**
   * Late update method called after all regular updates.
   * Optional - implement for camera follow, rendering prep, etc.
   *
   * @param context - Update context
   *
   * @example
   * ```typescript
   * lateUpdate(context: SystemContext): void {
   *   // Update camera to follow player after all movement
   *   const playerPos = this.world.getComponent(this.player, Position);
   *   this.camera.position.lerp(playerPos, 0.1);
   * }
   * ```
   */
  lateUpdate?(context: SystemContext): void;

  /**
   * Optional helper for per-entity processing.
   * Subclasses can implement this for cleaner code when using forEach.
   *
   * @protected
   * @param entity - The entity being processed
   * @param components - Array of components matching the query
   * @param context - Update context
   *
   * @example
   * ```typescript
   * protected processEntity(
   *   entity: Entity,
   *   components: IComponent[],
   *   context: SystemContext
   * ): void {
   *   const [position, velocity] = components as [Position, Velocity];
   *   position.x += velocity.x * context.deltaTime;
   *   position.y += velocity.y * context.deltaTime;
   * }
   *
   * update(context: SystemContext): void {
   *   this.getQuery().forEach((entity, components) => {
   *     this.processEntity(entity, components, context);
   *   });
   * }
   * ```
   */
  protected processEntity?(
    entity: Entity,
    components: IComponent[],
    context: SystemContext
  ): void;

  /**
   * Gets the resolved query for this system.
   * Queries are resolved lazily on first access and then cached.
   *
   * @returns The resolved query instance
   * @throws Error if system is not attached to a world
   *
   * @example
   * ```typescript
   * update(context: SystemContext): void {
   *   const query = this.getQuery();
   *   for (const entity of query.entities) {
   *     const components = query.get(entity);
   *     // Process entity...
   *   }
   * }
   * ```
   */
  protected getQuery(): Query {
    if (!this.world) {
      throw new Error(`System ${this.name} is not attached to a world`);
    }

    if (!this._resolvedQuery) {
      if ('entities' in this.query && 'forEach' in this.query) {
        // Already a Query instance
        this._resolvedQuery = this.query as Query;
      } else {
        // Descriptor needs resolution
        this._resolvedQuery = this.world.getQuery(this.query as QueryDescriptor);
      }
    }

    return this._resolvedQuery;
  }

  /**
   * Internal method to attach this system to a world.
   * Called by World when system is added.
   *
   * @internal
   * @param world - The world to attach to
   */
  _attachToWorld(world: IWorld): void {
    this.world = world;
    this._resolvedQuery = null; // Clear cache to force re-resolution
  }

  /**
   * Internal method to detach this system from a world.
   * Called by World when system is removed.
   *
   * @internal
   */
  _detachFromWorld(): void {
    this.world = null;
    this._resolvedQuery = null;
  }
}

/**
 * System group for organizing and managing related systems.
 *
 * Groups allow batching systems together with a shared priority
 * and enable/disable state. All systems in a group execute in
 * priority order when the group updates.
 *
 * @example
 * ```typescript
 * // Create rendering group
 * const renderGroup = new SystemGroup('Rendering', SystemPriorities.RENDERING);
 * renderGroup.add(new CullingSystem());
 * renderGroup.add(new ShadowSystem());
 * renderGroup.add(new MeshRenderSystem());
 *
 * // Create physics group
 * const physicsGroup = new SystemGroup('Physics', SystemPriorities.PHYSICS);
 * physicsGroup.add(new CollisionSystem());
 * physicsGroup.add(new RigidBodySystem());
 *
 * // Update all systems in group
 * const context: SystemContext = { deltaTime: 0.016, ... };
 * physicsGroup.fixedUpdate(context);
 * renderGroup.update(context);
 *
 * // Disable entire group
 * renderGroup.enabled = false;
 * ```
 */
export class SystemGroup {
  /**
   * Human-readable group name for debugging.
   */
  readonly name: string;

  /**
   * Systems in this group, maintained in priority order.
   */
  readonly systems: System[];

  /**
   * Group execution priority (lower values run first).
   * Individual system priorities determine order within the group.
   */
  priority: SystemPriority;

  /**
   * Whether this group is currently enabled.
   * Disabled groups skip all their systems without removal.
   */
  enabled: boolean;

  /**
   * Creates a new system group.
   *
   * @param name - Group name for debugging
   * @param priority - Group priority (default: 0)
   *
   * @example
   * ```typescript
   * const inputGroup = new SystemGroup('Input', SystemPriorities.INPUT);
   * const updateGroup = new SystemGroup('Update'); // priority = 0
   * ```
   */
  constructor(name: string, priority: SystemPriority = SystemPriorities.DEFAULT) {
    this.name = name;
    this.systems = [];
    this.priority = priority;
    this.enabled = true;
  }

  /**
   * Adds a system to this group.
   * Systems are inserted in priority order (lower priority first).
   *
   * @param system - System to add
   * @returns This group for chaining
   * @throws Error if system is already in the group
   *
   * @example
   * ```typescript
   * const group = new SystemGroup('Update');
   * group
   *   .add(new InputSystem())
   *   .add(new MovementSystem())
   *   .add(new AnimationSystem());
   * ```
   */
  add(system: System): this {
    if (this.systems.includes(system)) {
      throw new Error(`System ${system.name} is already in group ${this.name}`);
    }

    // Insert in priority order using binary search
    let left = 0;
    let right = this.systems.length;

    while (left < right) {
      const mid = (left + right) >>> 1;
      if (this.systems[mid].priority < system.priority) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    this.systems.splice(left, 0, system);
    return this;
  }

  /**
   * Removes a system from this group.
   *
   * @param system - System to remove
   * @returns True if system was removed, false if not found
   *
   * @example
   * ```typescript
   * const removed = group.remove(oldSystem);
   * if (removed) {
   *   console.log('System removed successfully');
   * }
   * ```
   */
  remove(system: System): boolean {
    const index = this.systems.indexOf(system);
    if (index === -1) {
      return false;
    }

    this.systems.splice(index, 1);
    return true;
  }

  /**
   * Checks if a system is in this group.
   *
   * @param system - System to check
   * @returns True if system is in group, false otherwise
   *
   * @example
   * ```typescript
   * if (group.has(mySystem)) {
   *   console.log('System is already in group');
   * }
   * ```
   */
  has(system: System): boolean {
    return this.systems.includes(system);
  }

  /**
   * Executes update() on all enabled systems in the group.
   * Systems run in priority order (lowest first).
   *
   * @param context - Update context to pass to systems
   *
   * @example
   * ```typescript
   * const context: SystemContext = {
   *   deltaTime: 0.016,
   *   fixedDeltaTime: 0.016,
   *   time: 1.5,
   *   frameCount: 90
   * };
   *
   * if (updateGroup.enabled) {
   *   updateGroup.update(context);
   * }
   * ```
   */
  update(context: SystemContext): void {
    if (!this.enabled) {
      return;
    }

    for (let i = 0; i < this.systems.length; i++) {
      const system = this.systems[i];
      if (system.enabled) {
        system.update(context);
      }
    }
  }

  /**
   * Executes fixedUpdate() on all enabled systems in the group.
   * Only systems with fixedUpdate implemented are called.
   *
   * @param context - Update context to pass to systems
   *
   * @example
   * ```typescript
   * const context: SystemContext = {
   *   deltaTime: 0.016,
   *   fixedDeltaTime: 0.016,
   *   time: 1.5,
   *   frameCount: 90
   * };
   *
   * physicsGroup.fixedUpdate(context);
   * ```
   */
  fixedUpdate(context: SystemContext): void {
    if (!this.enabled) {
      return;
    }

    for (let i = 0; i < this.systems.length; i++) {
      const system = this.systems[i];
      if (system.enabled && system.fixedUpdate) {
        system.fixedUpdate(context);
      }
    }
  }

  /**
   * Executes lateUpdate() on all enabled systems in the group.
   * Only systems with lateUpdate implemented are called.
   *
   * @param context - Update context to pass to systems
   *
   * @example
   * ```typescript
   * const context: SystemContext = {
   *   deltaTime: 0.016,
   *   fixedDeltaTime: 0.016,
   *   time: 1.5,
   *   frameCount: 90
   * };
   *
   * cameraGroup.lateUpdate(context);
   * ```
   */
  lateUpdate(context: SystemContext): void {
    if (!this.enabled) {
      return;
    }

    for (let i = 0; i < this.systems.length; i++) {
      const system = this.systems[i];
      if (system.enabled && system.lateUpdate) {
        system.lateUpdate(context);
      }
    }
  }

  /**
   * Gets the total number of systems in this group.
   *
   * @returns Number of systems
   *
   * @example
   * ```typescript
   * console.log(`Group ${group.name} has ${group.size} systems`);
   * ```
   */
  get size(): number {
    return this.systems.length;
  }

  /**
   * Removes all systems from this group.
   *
   * @example
   * ```typescript
   * group.clear();
   * console.log(`Group cleared, ${group.size} systems remaining`); // 0
   * ```
   */
  clear(): void {
    this.systems.length = 0;
  }

  /**
   * Iterator for systems in this group, enables for-of loops.
   *
   * @returns Iterator over systems
   *
   * @example
   * ```typescript
   * for (const system of group) {
   *   console.log(`System: ${system.name}, priority: ${system.priority}`);
   * }
   * ```
   */
  *[Symbol.iterator](): Iterator<System> {
    for (const system of this.systems) {
      yield system;
    }
  }
}

/**
 * Standard priority constants for common system categories.
 *
 * Priority determines execution order - lower values run first.
 * Use these constants for consistent ordering across the application.
 *
 * @example
 * ```typescript
 * class InputSystem extends System {
 *   priority = SystemPriorities.INPUT; // Runs early
 * }
 *
 * class PhysicsSystem extends System {
 *   priority = SystemPriorities.PHYSICS; // After input
 * }
 *
 * class RenderSystem extends System {
 *   priority = SystemPriorities.RENDERING; // Runs late
 * }
 *
 * // Custom priorities between standard values
 * class CustomSystem extends System {
 *   priority = SystemPriorities.PRE_UPDATE + 5; // Between PRE_UPDATE and DEFAULT
 * }
 * ```
 */
export const SystemPriorities = {
  /**
   * Absolute first priority (-1000).
   * Use for critical initialization or setup systems.
   */
  FIRST: -1000,

  /**
   * Early execution priority (-100).
   * Use for systems that should run before most others.
   */
  EARLY: -100,

  /**
   * Pre-update priority (-10).
   * Use for preparation before main update.
   */
  PRE_UPDATE: -10,

  /**
   * Default priority (0).
   * Used when no priority is specified.
   */
  DEFAULT: 0,

  /**
   * Post-update priority (10).
   * Use for cleanup or follow-up after main update.
   */
  POST_UPDATE: 10,

  /**
   * Late execution priority (100).
   * Use for systems that should run after most others.
   */
  LATE: 100,

  /**
   * Absolute last priority (1000).
   * Use for final cleanup or diagnostic systems.
   */
  LAST: 1000,

  /**
   * Input processing priority (-500).
   * Handle keyboard, mouse, gamepad before game logic.
   */
  INPUT: -500,

  /**
   * Physics simulation priority (-200).
   * Run physics after input but before gameplay logic.
   */
  PHYSICS: -200,

  /**
   * Animation priority (100).
   * Update animations after gameplay logic.
   */
  ANIMATION: 100,

  /**
   * Rendering priority (500).
   * Render after all game state updates.
   */
  RENDERING: 500,

  /**
   * Debug/diagnostic priority (900).
   * Debug systems run last to capture final state.
   */
  DEBUG: 900
} as const;

// IWorld, Query, QueryDescriptor are exported via index.ts
