/**
 * World.ts
 *
 * Main ECS container managing entities, components, and systems.
 * Provides a facade over EntityManager and orchestrates the entire ECS lifecycle.
 *
 * @module ecs/World
 */

import { Entity, EntityUtils } from './Entity';
import { IComponent, ComponentType } from './ComponentRegistry';
import { System, SystemContext, SystemGroup, SystemPriorities } from './System';
import { Query, QueryDescriptor } from './Query';
import { CommandBuffer, CommandExecutor } from './CommandBuffer';
import { EntityManager } from './EntityManager';

/**
 * Configuration options for World initialization.
 *
 * @example
 * ```typescript
 * const options: WorldOptions = {
 *   initialEntityCapacity: 2048,
 *   maxEntities: 100000
 * };
 * ```
 */
export interface WorldOptions {
  /**
   * Initial capacity for entity storage (default: 1024).
   * Pre-allocates space for entities to avoid early reallocations.
   */
  initialEntityCapacity?: number;

  /**
   * Maximum number of entities allowed (default: EntityUtils.MAX_ENTITIES).
   * Used for validation and capacity planning.
   */
  maxEntities?: number;
}

/**
 * Main ECS container managing entities, components, and systems.
 *
 * The World is the central coordinator of the ECS architecture:
 * - Delegates entity/component operations to EntityManager
 * - Manages system lifecycle and execution order
 * - Provides query caching for efficient entity iteration
 * - Supports deferred operations via command buffers
 * - Tracks timing and frame information
 * - Emits events for entity/component changes
 *
 * Performance targets:
 * - Entity creation: < 0.01ms
 * - Component add/remove: < 0.001ms
 * - 100k entities iteration: < 1ms
 * - System update overhead: < 0.1ms
 *
 * @example
 * ```typescript
 * // Create world
 * const world = new World({
 *   initialEntityCapacity: 2048
 * });
 *
 * // Initialize systems
 * world.addSystem(new PhysicsSystem());
 * world.addSystem(new RenderSystem());
 * world.init();
 * world.start();
 *
 * // Game loop
 * let lastTime = performance.now();
 * function gameLoop() {
 *   const currentTime = performance.now();
 *   const deltaTime = (currentTime - lastTime) / 1000;
 *   lastTime = currentTime;
 *
 *   world.update(deltaTime);
 *   world.lateUpdate(deltaTime);
 *
 *   requestAnimationFrame(gameLoop);
 * }
 *
 * // Physics loop (fixed timestep)
 * setInterval(() => {
 *   world.fixedUpdate(1/60);
 * }, 1000/60);
 *
 * // Cleanup
 * world.stop();
 * world.destroy();
 * ```
 */
export class World implements CommandExecutor {
  /**
   * Entity manager handling all entity and component operations.
   * @readonly
   */
  readonly entityManager: EntityManager;

  /**
   * All systems in priority-sorted order (lower priority first).
   */
  private systems: System[];

  /**
   * All system groups in priority-sorted order.
   */
  private systemGroups: SystemGroup[];

  /**
   * Query cache mapping descriptor hash to Query instance.
   * Reuses queries with identical descriptors for efficiency.
   */
  private queryCache: Map<number, Query>;

  /**
   * Internal command buffer for deferred operations.
   */
  private commandBuffer: CommandBuffer;

  /**
   * Total elapsed time since world creation (seconds).
   */
  private _time: number;

  /**
   * Total elapsed fixed time (seconds).
   */
  private _fixedTime: number;

  /**
   * Total number of frames rendered.
   */
  private _frameCount: number;

  /**
   * Whether the world is currently initialized.
   */
  private initialized: boolean;

  /**
   * Whether the world is currently running.
   */
  private running: boolean;

  /**
   * Maximum entities allowed in this world.
   */
  private maxEntities: number;

  /**
   * Event callback fired when an entity is created.
   * Set to null to disable.
   */
  onEntityCreated: ((entity: Entity) => void) | null;

  /**
   * Event callback fired when an entity is destroyed.
   * Set to null to disable.
   */
  onEntityDestroyed: ((entity: Entity) => void) | null;

  /**
   * Event callback fired when a component is added to an entity.
   * Set to null to disable.
   */
  onComponentAdded: ((entity: Entity, componentId: number) => void) | null;

  /**
   * Event callback fired when a component is removed from an entity.
   * Set to null to disable.
   */
  onComponentRemoved: ((entity: Entity, componentId: number) => void) | null;

  /**
   * Creates a new World instance.
   *
   * @param options - Configuration options
   *
   * @example
   * ```typescript
   * const world = new World({
   *   initialEntityCapacity: 2048,
   *   maxEntities: 100000
   * });
   * ```
   */
  constructor(options?: WorldOptions) {
    const initialCapacity = options?.initialEntityCapacity ?? 1024;
    this.maxEntities = options?.maxEntities ?? EntityUtils.MAX_ENTITIES;

    this.entityManager = new EntityManager(initialCapacity);
    this.systems = [];
    this.systemGroups = [];
    this.queryCache = new Map();
    this.commandBuffer = new CommandBuffer();

    this._time = 0;
    this._fixedTime = 0;
    this._frameCount = 0;

    this.initialized = false;
    this.running = false;

    this.onEntityCreated = null;
    this.onEntityDestroyed = null;
    this.onComponentAdded = null;
    this.onComponentRemoved = null;
  }

  /**
   * Creates a new entity with no components.
   *
   * @returns New entity identifier
   * @throws Error if entity pool capacity is exhausted
   *
   * @example
   * ```typescript
   * const entity = world.createEntity();
   * world.addComponent(entity, new Position(0, 0, 0));
   * ```
   */
  createEntity(): Entity {
    if (this.entityCount >= this.maxEntities) {
      throw new Error(`Maximum entity limit (${this.maxEntities}) reached`);
    }

    const entity = this.entityManager.createEntity();

    if (this.onEntityCreated) {
      this.onEntityCreated(entity);
    }

    return entity;
  }

  /**
   * Destroys an entity and removes it from all systems.
   *
   * @param entity - Entity to destroy
   * @throws Error if entity is invalid or already destroyed
   *
   * @example
   * ```typescript
   * world.destroyEntity(entity);
   * ```
   */
  destroyEntity(entity: Entity): void {
    this.entityManager.destroyEntity(entity);

    if (this.onEntityDestroyed) {
      this.onEntityDestroyed(entity);
    }
  }

  /**
   * Checks if an entity is currently alive.
   *
   * @param entity - Entity to check
   * @returns true if entity is alive, false otherwise
   *
   * @example
   * ```typescript
   * if (world.isAlive(entity)) {
   *   console.log('Entity is alive');
   * }
   * ```
   */
  isAlive(entity: Entity): boolean {
    return this.entityManager.isAlive(entity);
  }

  /**
   * Adds a component to an entity.
   *
   * @typeParam T - Component type implementing IComponent
   * @param entity - Entity to add component to
   * @param component - Component instance to add
   * @throws Error if entity is invalid
   *
   * @example
   * ```typescript
   * world.addComponent(entity, new Position(10, 20, 30));
   * world.addComponent(entity, new Velocity(1, 0, 0));
   * ```
   */
  addComponent<T extends IComponent>(entity: Entity, component: T): void {
    const type = component.constructor as ComponentType<T>;
    const componentId = this.getComponentId(type);

    this.entityManager.addComponent(entity, component);

    if (this.onComponentAdded) {
      this.onComponentAdded(entity, componentId);
    }
  }

  /**
   * Removes a component from an entity.
   *
   * @typeParam T - Component type implementing IComponent
   * @param entity - Entity to remove component from
   * @param type - Component class/constructor to remove
   * @throws Error if entity is invalid
   *
   * @example
   * ```typescript
   * world.removeComponent(entity, Velocity);
   * ```
   */
  removeComponent<T extends IComponent>(entity: Entity, type: ComponentType<T>): void {
    const componentId = this.getComponentId(type);

    this.entityManager.removeComponent(entity, type);

    if (this.onComponentRemoved) {
      this.onComponentRemoved(entity, componentId);
    }
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
   * const position = world.getComponent(entity, Position);
   * if (position) {
   *   console.log(`Position: ${position.x}, ${position.y}, ${position.z}`);
   * }
   * ```
   */
  getComponent<T extends IComponent>(entity: Entity, type: ComponentType<T>): T | undefined {
    return this.entityManager.getComponent(entity, type);
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
   * if (world.hasComponent(entity, Position)) {
   *   console.log('Entity has position');
   * }
   * ```
   */
  hasComponent<T extends IComponent>(entity: Entity, type: ComponentType<T>): boolean {
    return this.entityManager.hasComponent(entity, type);
  }

  /**
   * Sets or updates a component on an entity.
   * If the component doesn't exist, it will be added.
   *
   * @typeParam T - Component type implementing IComponent
   * @param entity - Entity to set component on
   * @param component - Component instance to set
   *
   * @example
   * ```typescript
   * world.setComponent(entity, new Health(100));
   * world.setComponent(entity, new Health(50)); // Updates existing
   * ```
   */
  setComponent<T extends IComponent>(entity: Entity, component: T): void {
    const type = component.constructor as ComponentType<T>;
    const hadComponent = this.hasComponent(entity, type);
    const componentId = this.getComponentId(type);

    this.entityManager.setComponent(entity, component);

    if (!hadComponent && this.onComponentAdded) {
      this.onComponentAdded(entity, componentId);
    }
  }

  /**
   * Adds a system to the world.
   * Systems are inserted in priority order (lower priority first).
   *
   * @param system - System to add
   * @returns This World for chaining
   * @throws Error if system is already added
   *
   * @example
   * ```typescript
   * world
   *   .addSystem(new PhysicsSystem())
   *   .addSystem(new RenderSystem())
   *   .addSystem(new InputSystem());
   * ```
   */
  addSystem(system: System): this {
    if (this.systems.includes(system)) {
      throw new Error(`System ${system.name} is already added to world`);
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
    system._attachToWorld(this);

    // Call onInit if world is already initialized
    if (this.initialized && system.onInit) {
      system.onInit();
    }

    // Call onStart if world is already running
    if (this.running && system.onStart) {
      system.onStart();
    }

    return this;
  }

  /**
   * Removes a system from the world.
   *
   * @param system - System to remove
   * @returns true if system was removed, false if not found
   *
   * @example
   * ```typescript
   * const removed = world.removeSystem(oldSystem);
   * if (removed) {
   *   console.log('System removed');
   * }
   * ```
   */
  removeSystem(system: System): boolean {
    const index = this.systems.indexOf(system);
    if (index === -1) {
      return false;
    }

    // Call onStop if running
    if (this.running && system.onStop) {
      system.onStop();
    }

    // Call onDestroy if initialized
    if (this.initialized && system.onDestroy) {
      system.onDestroy();
    }

    this.systems.splice(index, 1);
    system._detachFromWorld();

    return true;
  }

  /**
   * Checks if a system is in the world.
   *
   * @param system - System to check
   * @returns true if system is in world, false otherwise
   *
   * @example
   * ```typescript
   * if (world.hasSystem(mySystem)) {
   *   console.log('System is active');
   * }
   * ```
   */
  hasSystem(system: System): boolean {
    return this.systems.includes(system);
  }

  /**
   * Gets a system instance by its type.
   *
   * @typeParam T - System type extending System
   * @param type - System class/constructor
   * @returns System instance, or undefined if not found
   *
   * @example
   * ```typescript
   * const physics = world.getSystem(PhysicsSystem);
   * if (physics) {
   *   physics.setGravity(9.81);
   * }
   * ```
   */
  getSystem<T extends System>(type: new (...args: any[]) => T): T | undefined {
    return this.systems.find(system => system instanceof type) as T | undefined;
  }

  /**
   * Gets a readonly array of all systems.
   *
   * @returns Readonly array of systems in priority order
   *
   * @example
   * ```typescript
   * const systems = world.getSystems();
   * for (const system of systems) {
   *   console.log(`System: ${system.name}, priority: ${system.priority}`);
   * }
   * ```
   */
  getSystems(): readonly System[] {
    return this.systems;
  }

  /**
   * Adds a system group to the world.
   *
   * @param group - System group to add
   * @returns This World for chaining
   * @throws Error if group is already added
   *
   * @example
   * ```typescript
   * const renderGroup = new SystemGroup('Rendering', SystemPriorities.RENDERING);
   * renderGroup.add(new MeshRenderSystem());
   * renderGroup.add(new ShadowSystem());
   * world.addSystemGroup(renderGroup);
   * ```
   */
  addSystemGroup(group: SystemGroup): this {
    if (this.systemGroups.includes(group)) {
      throw new Error(`System group ${group.name} is already added to world`);
    }

    // Insert in priority order
    let left = 0;
    let right = this.systemGroups.length;

    while (left < right) {
      const mid = (left + right) >>> 1;
      if (this.systemGroups[mid].priority < group.priority) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    this.systemGroups.splice(left, 0, group);

    // Attach all systems in the group
    for (const system of group.systems) {
      system._attachToWorld(this);

      if (this.initialized && system.onInit) {
        system.onInit();
      }

      if (this.running && system.onStart) {
        system.onStart();
      }
    }

    return this;
  }

  /**
   * Removes a system group from the world.
   *
   * @param group - System group to remove
   * @returns true if group was removed, false if not found
   *
   * @example
   * ```typescript
   * const removed = world.removeSystemGroup(renderGroup);
   * ```
   */
  removeSystemGroup(group: SystemGroup): boolean {
    const index = this.systemGroups.indexOf(group);
    if (index === -1) {
      return false;
    }

    // Detach all systems in the group
    for (const system of group.systems) {
      if (this.running && system.onStop) {
        system.onStop();
      }

      if (this.initialized && system.onDestroy) {
        system.onDestroy();
      }

      system._detachFromWorld();
    }

    this.systemGroups.splice(index, 1);
    return true;
  }

  /**
   * Creates a new query for matching entities.
   * Each call creates a new query instance.
   *
   * @param descriptor - Query descriptor specifying component requirements
   * @returns New Query instance
   *
   * @example
   * ```typescript
   * const query = world.createQuery({
   *   all: [Position, Velocity],
   *   none: [Frozen]
   * });
   *
   * query.forEach((entity, components) => {
   *   // Process entities
   * });
   * ```
   */
  createQuery(descriptor: QueryDescriptor): Query {
    return this.entityManager.createQuery(descriptor) as any as Query;
  }

  /**
   * Gets or creates a cached query for a descriptor.
   * Reuses queries with identical descriptors for efficiency.
   *
   * @param descriptor - Query descriptor specifying component requirements
   * @returns Cached or new Query instance
   *
   * @example
   * ```typescript
   * const query1 = world.getQuery({ all: [Position, Velocity] });
   * const query2 = world.getQuery({ all: [Position, Velocity] });
   * // query1 === query2 (same cached instance)
   * ```
   */
  getQuery(descriptor: QueryDescriptor): Query {
    const hash = this.hashQueryDescriptor(descriptor);
    let query = this.queryCache.get(hash);

    if (!query) {
      query = this.createQuery(descriptor);
      this.queryCache.set(hash, query);
    }

    return query;
  }

  /**
   * Updates all enabled systems with variable delta time.
   * Called once per frame in the main game loop.
   *
   * @param deltaTime - Time elapsed since last frame in seconds
   *
   * @example
   * ```typescript
   * let lastTime = performance.now();
   * function gameLoop() {
   *   const currentTime = performance.now();
   *   const deltaTime = (currentTime - lastTime) / 1000;
   *   lastTime = currentTime;
   *
   *   world.update(deltaTime);
   *   requestAnimationFrame(gameLoop);
   * }
   * ```
   */
  update(deltaTime: number): void {
    if (!this.running) {
      return;
    }

    this._time += deltaTime;
    this._frameCount++;

    const context: SystemContext = {
      deltaTime,
      fixedDeltaTime: 1 / 60,
      time: this._time,
      frameCount: this._frameCount
    };

    // Update individual systems
    for (let i = 0; i < this.systems.length; i++) {
      const system = this.systems[i];
      if (system.enabled) {
        system.update(context);
      }
    }

    // Update system groups
    for (let i = 0; i < this.systemGroups.length; i++) {
      const group = this.systemGroups[i];
      if (group.enabled) {
        group.update(context);
      }
    }
  }

  /**
   * Updates all enabled systems with fixed delta time.
   * Called at a constant rate for deterministic physics.
   *
   * @param fixedDeltaTime - Fixed timestep in seconds (typically 1/60)
   *
   * @example
   * ```typescript
   * setInterval(() => {
   *   world.fixedUpdate(1/60);
   * }, 1000/60);
   * ```
   */
  fixedUpdate(fixedDeltaTime: number): void {
    if (!this.running) {
      return;
    }

    this._fixedTime += fixedDeltaTime;

    const context: SystemContext = {
      deltaTime: fixedDeltaTime,
      fixedDeltaTime,
      time: this._fixedTime,
      frameCount: this._frameCount
    };

    // Fixed update individual systems
    for (let i = 0; i < this.systems.length; i++) {
      const system = this.systems[i];
      if (system.enabled && system.fixedUpdate) {
        system.fixedUpdate(context);
      }
    }

    // Fixed update system groups
    for (let i = 0; i < this.systemGroups.length; i++) {
      const group = this.systemGroups[i];
      if (group.enabled) {
        group.fixedUpdate(context);
      }
    }
  }

  /**
   * Late update for all enabled systems.
   * Called after all regular updates for camera follow, rendering prep, etc.
   *
   * @param deltaTime - Time elapsed since last frame in seconds
   *
   * @example
   * ```typescript
   * function gameLoop() {
   *   world.update(deltaTime);
   *   world.lateUpdate(deltaTime);
   *   requestAnimationFrame(gameLoop);
   * }
   * ```
   */
  lateUpdate(deltaTime: number): void {
    if (!this.running) {
      return;
    }

    const context: SystemContext = {
      deltaTime,
      fixedDeltaTime: 1 / 60,
      time: this._time,
      frameCount: this._frameCount
    };

    // Late update individual systems
    for (let i = 0; i < this.systems.length; i++) {
      const system = this.systems[i];
      if (system.enabled && system.lateUpdate) {
        system.lateUpdate(context);
      }
    }

    // Late update system groups
    for (let i = 0; i < this.systemGroups.length; i++) {
      const group = this.systemGroups[i];
      if (group.enabled) {
        group.lateUpdate(context);
      }
    }
  }

  /**
   * Gets the internal command buffer for deferred operations.
   *
   * @returns CommandBuffer instance
   *
   * @example
   * ```typescript
   * const buffer = world.getCommandBuffer();
   * buffer.createEntity();
   * buffer.addComponent(entity, new Position());
   * world.executeCommands();
   * ```
   */
  getCommandBuffer(): CommandBuffer {
    return this.commandBuffer;
  }

  /**
   * Executes all recorded commands in the command buffer.
   * Called automatically or manually to flush deferred operations.
   *
   * @example
   * ```typescript
   * world.defer.createEntity();
   * world.defer.addComponent(entity, new Position());
   * world.executeCommands(); // Execute all deferred operations
   * ```
   */
  executeCommands(): void {
    if (!this.commandBuffer.isEmpty) {
      this.commandBuffer.playback(this);
      this.commandBuffer.clear();
    }
  }

  /**
   * Deferred operations API for safe mutations during iteration.
   * Commands are executed when executeCommands() is called.
   *
   * @example
   * ```typescript
   * query.forEach((entity) => {
   *   if (shouldSpawn) {
   *     const newEntity = world.defer.createEntity();
   *     world.defer.addComponent(newEntity, new Position());
   *   }
   *   if (shouldDestroy) {
   *     world.defer.destroyEntity(entity);
   *   }
   * });
   * world.executeCommands();
   * ```
   */
  readonly defer = {
    /**
     * Records a command to create an entity.
     * Returns a temporary ID for use in subsequent deferred operations.
     *
     * @returns Temporary entity ID (negative number)
     */
    createEntity: (): number => {
      return this.commandBuffer.createEntity();
    },

    /**
     * Records a command to destroy an entity.
     *
     * @param entity - Entity to destroy
     */
    destroyEntity: (entity: Entity): void => {
      this.commandBuffer.destroyEntity(entity);
    },

    /**
     * Records a command to add a component to an entity.
     *
     * @param entity - Target entity or temporary ID
     * @param component - Component to add
     */
    addComponent: <T extends IComponent>(entity: Entity | number, component: T): void => {
      this.commandBuffer.addComponent(entity, component);
    },

    /**
     * Records a command to remove a component from an entity.
     *
     * @param entity - Target entity or temporary ID
     * @param type - Component type to remove
     */
    removeComponent: <T extends IComponent>(entity: Entity | number, type: ComponentType<T>): void => {
      this.commandBuffer.removeComponent(entity, type);
    }
  };

  /**
   * Gets the total number of alive entities.
   *
   * @returns Number of alive entities
   *
   * @example
   * ```typescript
   * console.log(`Active entities: ${world.entityCount}`);
   * ```
   */
  get entityCount(): number {
    return this.entityManager.entityCount;
  }

  /**
   * Gets the total number of systems (individual + systems in groups).
   *
   * @returns Number of systems
   *
   * @example
   * ```typescript
   * console.log(`Total systems: ${world.systemCount}`);
   * ```
   */
  get systemCount(): number {
    let count = this.systems.length;
    for (const group of this.systemGroups) {
      count += group.size;
    }
    return count;
  }

  /**
   * Gets the total number of archetypes.
   *
   * @returns Number of archetypes
   *
   * @example
   * ```typescript
   * console.log(`Archetypes: ${world.archetypeCount}`);
   * ```
   */
  get archetypeCount(): number {
    return this.entityManager.archetypeCount;
  }

  /**
   * Gets the total elapsed time since world creation.
   *
   * @returns Time in seconds
   *
   * @example
   * ```typescript
   * console.log(`World time: ${world.time}s`);
   * ```
   */
  get time(): number {
    return this._time;
  }

  /**
   * Gets the total elapsed fixed time.
   *
   * @returns Fixed time in seconds
   *
   * @example
   * ```typescript
   * console.log(`Fixed time: ${world.fixedTime}s`);
   * ```
   */
  get fixedTime(): number {
    return this._fixedTime;
  }

  /**
   * Gets the total number of frames rendered.
   *
   * @returns Frame count
   *
   * @example
   * ```typescript
   * console.log(`Frame: ${world.frameCount}`);
   * ```
   */
  get frameCount(): number {
    return this._frameCount;
  }

  /**
   * Initializes all systems in the world.
   * Calls onInit() on all systems in priority order.
   *
   * @example
   * ```typescript
   * world.addSystem(new PhysicsSystem());
   * world.addSystem(new RenderSystem());
   * world.init(); // Calls onInit() on all systems
   * ```
   */
  init(): void {
    if (this.initialized) {
      return;
    }

    // Initialize individual systems
    for (const system of this.systems) {
      if (system.onInit) {
        system.onInit();
      }
    }

    // Initialize systems in groups
    for (const group of this.systemGroups) {
      for (const system of group.systems) {
        if (system.onInit) {
          system.onInit();
        }
      }
    }

    this.initialized = true;
  }

  /**
   * Starts all systems in the world.
   * Calls onStart() on all systems in priority order.
   * Automatically calls init() if not already initialized.
   *
   * @example
   * ```typescript
   * world.start(); // Begins system execution
   * ```
   */
  start(): void {
    if (!this.initialized) {
      this.init();
    }

    if (this.running) {
      return;
    }

    // Start individual systems
    for (const system of this.systems) {
      if (system.onStart) {
        system.onStart();
      }
    }

    // Start systems in groups
    for (const group of this.systemGroups) {
      for (const system of group.systems) {
        if (system.onStart) {
          system.onStart();
        }
      }
    }

    this.running = true;
  }

  /**
   * Stops all systems in the world.
   * Calls onStop() on all systems in reverse priority order.
   *
   * @example
   * ```typescript
   * world.stop(); // Pauses system execution
   * ```
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    // Stop systems in groups (reverse order)
    for (let i = this.systemGroups.length - 1; i >= 0; i--) {
      const group = this.systemGroups[i];
      for (let j = group.systems.length - 1; j >= 0; j--) {
        const system = group.systems[j];
        if (system.onStop) {
          system.onStop();
        }
      }
    }

    // Stop individual systems (reverse order)
    for (let i = this.systems.length - 1; i >= 0; i--) {
      const system = this.systems[i];
      if (system.onStop) {
        system.onStop();
      }
    }

    this.running = false;
  }

  /**
   * Destroys the world and all systems.
   * Calls onDestroy() on all systems and clears all state.
   * After calling destroy(), the world should not be used.
   *
   * @example
   * ```typescript
   * world.destroy(); // Full cleanup
   * ```
   */
  destroy(): void {
    // Stop if running
    if (this.running) {
      this.stop();
    }

    // Destroy systems in groups (reverse order)
    for (let i = this.systemGroups.length - 1; i >= 0; i--) {
      const group = this.systemGroups[i];
      for (let j = group.systems.length - 1; j >= 0; j--) {
        const system = group.systems[j];
        if (system.onDestroy) {
          system.onDestroy();
        }
        system._detachFromWorld();
      }
    }

    // Destroy individual systems (reverse order)
    for (let i = this.systems.length - 1; i >= 0; i--) {
      const system = this.systems[i];
      if (system.onDestroy) {
        system.onDestroy();
      }
      system._detachFromWorld();
    }

    // Clear all state
    this.systems.length = 0;
    this.systemGroups.length = 0;
    this.queryCache.clear();
    this.commandBuffer.clear();
    this.entityManager.clear();

    this.initialized = false;
    this.running = false;
  }

  /**
   * Gets debug information about the world state.
   *
   * @returns Object containing debug information
   *
   * @example
   * ```typescript
   * const info = world.getDebugInfo();
   * console.log(JSON.stringify(info, null, 2));
   * ```
   */
  getDebugInfo(): object {
    const systemInfo = this.systems.map(system => ({
      name: system.name,
      priority: system.priority,
      enabled: system.enabled
    }));

    const groupInfo = this.systemGroups.map(group => ({
      name: group.name,
      priority: group.priority,
      enabled: group.enabled,
      systemCount: group.size
    }));

    return {
      initialized: this.initialized,
      running: this.running,
      time: this._time,
      fixedTime: this._fixedTime,
      frameCount: this._frameCount,
      entities: {
        count: this.entityCount,
        max: this.maxEntities,
        capacity: this.entityManager.entityCount
      },
      archetypes: {
        count: this.archetypeCount
      },
      systems: {
        individual: systemInfo,
        groups: groupInfo,
        total: this.systemCount
      },
      queries: {
        cached: this.queryCache.size
      },
      commandBuffer: {
        pendingCommands: this.commandBuffer.commandCount,
        pendingEntities: this.commandBuffer.pendingEntityCount
      }
    };
  }

  /**
   * Clears all entities while preserving systems and configuration.
   * Useful for restarting game state without recreating the world.
   *
   * @example
   * ```typescript
   * world.clear(); // Remove all entities, keep systems
   * ```
   */
  clear(): void {
    this.entityManager.clear();
    this.commandBuffer.clear();
    this._time = 0;
    this._fixedTime = 0;
    this._frameCount = 0;
  }

  /**
   * Helper to get component ID from a component type.
   * Throws if component is not registered.
   *
   * @private
   */
  private getComponentId<T extends IComponent>(type: ComponentType<T>): number {
    const constructor = type as any;
    const id = constructor.__componentId__;
    if (id === undefined) {
      throw new Error(`Component type ${type.name} is not registered`);
    }
    return id;
  }

  /**
   * Hashes a query descriptor for caching.
   * Creates a deterministic hash from the descriptor's component types.
   *
   * @private
   */
  private hashQueryDescriptor(descriptor: QueryDescriptor): number {
    let hash = 0;

    // Hash 'all' components
    if (descriptor.all && descriptor.all.length > 0) {
      const ids = descriptor.all.map(type => this.getComponentId(type)).sort((a, b) => a - b);
      for (const id of ids) {
        hash = ((hash << 5) - hash + id) | 0;
      }
      hash = ((hash << 5) - hash + 1) | 0; // Separator
    }

    // Hash 'any' components
    if (descriptor.any && descriptor.any.length > 0) {
      const ids = descriptor.any.map(type => this.getComponentId(type)).sort((a, b) => a - b);
      for (const id of ids) {
        hash = ((hash << 5) - hash + id) | 0;
      }
      hash = ((hash << 5) - hash + 2) | 0; // Separator
    }

    // Hash 'none' components
    if (descriptor.none && descriptor.none.length > 0) {
      const ids = descriptor.none.map(type => this.getComponentId(type)).sort((a, b) => a - b);
      for (const id of ids) {
        hash = ((hash << 5) - hash + id) | 0;
      }
      hash = ((hash << 5) - hash + 3) | 0; // Separator
    }

    return hash;
  }
}

// WorldOptions is exported via index.ts
