/**
 * CommandBuffer.ts
 *
 * Deferred entity/component operations for thread-safe mutation.
 * Provides command recording and playback for batch operations and parallel systems.
 *
 * @module ecs/CommandBuffer
 */

import { Entity } from './Entity';
import { ComponentId, IComponent, ComponentType, ComponentRegistry } from './ComponentRegistry';

/**
 * Type of command to execute during playback.
 */
enum CommandType {
  CREATE_ENTITY,
  DESTROY_ENTITY,
  ADD_COMPONENT,
  REMOVE_COMPONENT,
  SET_COMPONENT
}

/**
 * Individual command stored in the buffer.
 * Commands are executed in order during playback.
 */
interface Command {
  /** Type of command to execute */
  type: CommandType;
  /** Entity to operate on (or undefined for CREATE_ENTITY) */
  entity?: Entity;
  /** Component type identifier for component operations */
  componentId?: ComponentId;
  /** Component data for ADD/SET operations */
  component?: IComponent;
  /** Temporary entity index for referencing pending entities */
  entityIndex?: number;
}

/**
 * Interface for command execution (implemented by World).
 * The executor receives commands during playback and performs the actual operations.
 */
interface CommandExecutor {
  /**
   * Creates a new entity.
   * @returns The newly created entity
   */
  createEntity(): Entity;

  /**
   * Destroys an existing entity.
   * @param entity - Entity to destroy
   */
  destroyEntity(entity: Entity): void;

  /**
   * Adds a component to an entity.
   * @param entity - Target entity
   * @param component - Component to add
   */
  addComponent<T extends IComponent>(entity: Entity, component: T): void;

  /**
   * Removes a component from an entity.
   * @param entity - Target entity
   * @param type - Component type to remove
   */
  removeComponent<T extends IComponent>(entity: Entity, type: ComponentType<T>): void;

  /**
   * Sets or updates a component on an entity.
   * @param entity - Target entity
   * @param component - Component to set
   */
  setComponent<T extends IComponent>(entity: Entity, component: T): void;
}

/**
 * Deferred command buffer for entity/component operations.
 *
 * Records operations as commands and executes them in order during playback.
 * Supports referencing pending entities via temporary IDs (negative numbers).
 * Enables thread-safe mutations when used with parallel systems.
 *
 * @example
 * ```typescript
 * const buffer = new CommandBuffer();
 *
 * // Create entity with components
 * const tempId = buffer.createEntity();
 * buffer.addComponent(tempId, new Position(10, 20, 30));
 * buffer.addComponent(tempId, new Velocity(1, 0, 0));
 *
 * // Modify existing entity
 * buffer.setComponent(existingEntity, new Health(100));
 *
 * // Destroy entities
 * buffer.destroyEntity(deadEntity);
 *
 * // Execute all commands
 * const createdEntities = buffer.playback(world);
 * const actualEntity = createdEntities[0]; // Maps to tempId
 *
 * // Reuse buffer
 * buffer.clear();
 * ```
 */
class CommandBuffer {
  /**
   * Array of recorded commands to be executed during playback.
   */
  private commands: Command[];

  /**
   * Counter for generating temporary entity IDs.
   * Temp IDs are negative numbers starting from -1.
   */
  private nextTempId: number;

  /**
   * Count of pending entity creations.
   */
  private pendingEntities: number;

  /**
   * Creates a new CommandBuffer.
   *
   * @example
   * ```typescript
   * const buffer = new CommandBuffer();
   * ```
   */
  constructor() {
    this.commands = [];
    this.nextTempId = -1;
    this.pendingEntities = 0;
  }

  /**
   * Records a command to create an entity.
   * Returns a temporary ID that can be used in subsequent commands.
   *
   * @returns Temporary entity ID (negative number)
   *
   * @example
   * ```typescript
   * const buffer = new CommandBuffer();
   * const tempId = buffer.createEntity(); // -1
   * buffer.addComponent(tempId, new Position(0, 0, 0));
   *
   * const entities = buffer.playback(world);
   * const actualEntity = entities[0]; // Real entity corresponding to tempId
   * ```
   */
  createEntity(): number {
    const tempId = this.nextTempId--;
    const entityIndex = this.pendingEntities++;

    this.commands.push({
      type: CommandType.CREATE_ENTITY,
      entityIndex
    });

    return tempId;
  }

  /**
   * Records a command to destroy an entity.
   *
   * @param entity - Entity to destroy
   * @returns This CommandBuffer for chaining
   *
   * @example
   * ```typescript
   * buffer.destroyEntity(entity);
   * ```
   */
  destroyEntity(entity: Entity): this {
    this.commands.push({
      type: CommandType.DESTROY_ENTITY,
      entity
    });

    return this;
  }

  /**
   * Records a command to add a component to an entity.
   *
   * @param entity - Target entity or temporary ID
   * @param component - Component to add
   * @returns This CommandBuffer for chaining
   *
   * @example
   * ```typescript
   * // Add to existing entity
   * buffer.addComponent(entity, new Position(10, 20, 30));
   *
   * // Add to pending entity
   * const tempId = buffer.createEntity();
   * buffer.addComponent(tempId, new Velocity(1, 0, 0));
   * ```
   */
  addComponent<T extends IComponent>(entity: Entity | number, component: T): this {
    const componentId = this.getComponentId(component);

    this.commands.push({
      type: CommandType.ADD_COMPONENT,
      entity: typeof entity === 'number' && entity < 0 ? entity : entity,
      componentId,
      component
    });

    return this;
  }

  /**
   * Records a command to remove a component from an entity.
   *
   * @param entity - Target entity or temporary ID
   * @param type - Component type to remove
   * @returns This CommandBuffer for chaining
   *
   * @example
   * ```typescript
   * buffer.removeComponent(entity, Velocity);
   * ```
   */
  removeComponent<T extends IComponent>(entity: Entity | number, type: ComponentType<T>): this {
    const componentId = ComponentRegistry.getId(type);

    this.commands.push({
      type: CommandType.REMOVE_COMPONENT,
      entity: typeof entity === 'number' && entity < 0 ? entity : entity,
      componentId
    });

    return this;
  }

  /**
   * Records a command to set or update a component on an entity.
   *
   * @param entity - Target entity or temporary ID
   * @param component - Component to set
   * @returns This CommandBuffer for chaining
   *
   * @example
   * ```typescript
   * buffer.setComponent(entity, new Health(50));
   * ```
   */
  setComponent<T extends IComponent>(entity: Entity | number, component: T): this {
    const componentId = this.getComponentId(component);

    this.commands.push({
      type: CommandType.SET_COMPONENT,
      entity: typeof entity === 'number' && entity < 0 ? entity : entity,
      componentId,
      component
    });

    return this;
  }

  /**
   * Records commands to destroy multiple entities.
   *
   * @param entities - Array of entities to destroy
   * @returns This CommandBuffer for chaining
   *
   * @example
   * ```typescript
   * buffer.destroyEntities([entity1, entity2, entity3]);
   * ```
   */
  destroyEntities(entities: Entity[]): this {
    for (let i = 0; i < entities.length; i++) {
      this.commands.push({
        type: CommandType.DESTROY_ENTITY,
        entity: entities[i]
      });
    }

    return this;
  }

  /**
   * Executes all recorded commands in order.
   * Maps temporary entity IDs to actual entities created during playback.
   *
   * @param executor - Command executor (typically World)
   * @returns Array of created entities in order of creation
   *
   * @example
   * ```typescript
   * const tempId1 = buffer.createEntity();
   * const tempId2 = buffer.createEntity();
   * buffer.addComponent(tempId1, new Position());
   *
   * const entities = buffer.playback(world);
   * // entities[0] corresponds to tempId1
   * // entities[1] corresponds to tempId2
   * ```
   */
  playback(executor: CommandExecutor): Entity[] {
    const createdEntities: Entity[] = new Array(this.pendingEntities);
    const tempIdMap: Map<number, Entity> = new Map();

    for (let i = 0; i < this.commands.length; i++) {
      const cmd = this.commands[i];

      switch (cmd.type) {
        case CommandType.CREATE_ENTITY: {
          const entity = executor.createEntity();
          createdEntities[cmd.entityIndex!] = entity;

          // Map temp ID to actual entity
          // Temp IDs go -1, -2, -3, ... and correspond to indices 0, 1, 2, ...
          const tempId = -(cmd.entityIndex! + 1);
          tempIdMap.set(tempId, entity);
          break;
        }

        case CommandType.DESTROY_ENTITY: {
          const entity = this.resolveEntity(cmd.entity!, tempIdMap);
          executor.destroyEntity(entity);
          break;
        }

        case CommandType.ADD_COMPONENT: {
          const entity = this.resolveEntity(cmd.entity!, tempIdMap);
          executor.addComponent(entity, cmd.component!);
          break;
        }

        case CommandType.REMOVE_COMPONENT: {
          const entity = this.resolveEntity(cmd.entity!, tempIdMap);
          const type = ComponentRegistry.getType(cmd.componentId!);
          if (type) {
            executor.removeComponent(entity, type);
          }
          break;
        }

        case CommandType.SET_COMPONENT: {
          const entity = this.resolveEntity(cmd.entity!, tempIdMap);
          executor.setComponent(entity, cmd.component!);
          break;
        }
      }
    }

    return createdEntities;
  }

  /**
   * Clears all commands and resets the buffer for reuse.
   * Does not deallocate memory, allowing efficient buffer reuse.
   *
   * @example
   * ```typescript
   * buffer.playback(world);
   * buffer.clear(); // Ready for new commands
   * ```
   */
  clear(): void {
    this.commands.length = 0;
    this.nextTempId = -1;
    this.pendingEntities = 0;
  }

  /**
   * Checks if the buffer contains no commands.
   *
   * @returns true if no commands are recorded, false otherwise
   *
   * @example
   * ```typescript
   * if (!buffer.isEmpty) {
   *   buffer.playback(world);
   * }
   * ```
   */
  get isEmpty(): boolean {
    return this.commands.length === 0;
  }

  /**
   * Gets the total number of recorded commands.
   *
   * @returns Number of commands
   *
   * @example
   * ```typescript
   * console.log(`Recorded ${buffer.commandCount} commands`);
   * ```
   */
  get commandCount(): number {
    return this.commands.length;
  }

  /**
   * Gets the number of pending entity creations.
   *
   * @returns Number of entities to be created during playback
   *
   * @example
   * ```typescript
   * console.log(`Will create ${buffer.pendingEntityCount} entities`);
   * ```
   */
  get pendingEntityCount(): number {
    return this.pendingEntities;
  }

  /**
   * Generates a debug string representation of the buffer.
   *
   * @returns Human-readable string describing the buffer state
   *
   * @example
   * ```typescript
   * console.log(buffer.toString());
   * // "CommandBuffer(commands: 5, pending entities: 2)"
   * ```
   */
  toString(): string {
    return `CommandBuffer(commands: ${this.commands.length}, pending entities: ${this.pendingEntities})`;
  }

  /**
   * Resolves an entity reference, mapping temp IDs to actual entities.
   *
   * @param entityOrTempId - Entity or temporary ID
   * @param tempIdMap - Map from temp ID to actual entity
   * @returns Resolved entity
   * @throws Error if temp ID is not found in map
   */
  private resolveEntity(entityOrTempId: Entity | number, tempIdMap: Map<number, Entity>): Entity {
    if (typeof entityOrTempId === 'number' && entityOrTempId < 0) {
      const entity = tempIdMap.get(entityOrTempId);
      if (entity === undefined) {
        throw new Error(`Temporary entity ID ${entityOrTempId} not found. Entity must be created before use.`);
      }
      return entity;
    }
    return entityOrTempId;
  }

  /**
   * Gets the component ID from a component instance.
   *
   * @param component - Component instance
   * @returns Component ID
   * @throws Error if component type is not registered
   */
  private getComponentId<T extends IComponent>(component: T): ComponentId {
    const constructor = component.constructor as ComponentType<T>;
    return ComponentRegistry.getId(constructor);
  }
}

/**
 * Pool of CommandBuffers for parallel systems.
 *
 * Provides efficient allocation and reuse of command buffers without allocation overhead.
 * Parallel systems can acquire buffers from the pool, record commands independently,
 * then playback all buffers together.
 *
 * @example
 * ```typescript
 * const pool = new CommandBufferPool(4);
 *
 * // Parallel systems acquire buffers
 * const buffer1 = pool.acquire();
 * const buffer2 = pool.acquire();
 *
 * // Systems record commands independently
 * buffer1.createEntity();
 * buffer2.createEntity();
 *
 * // Release back to pool
 * pool.release(buffer1);
 * pool.release(buffer2);
 *
 * // Execute all buffers at once
 * const entities = pool.playbackAll(world);
 *
 * console.log(`Active: ${pool.activeCount}, Pooled: ${pool.pooledCount}`);
 * ```
 */
class CommandBufferPool {
  /**
   * Stack of available command buffers (LIFO for cache locality).
   */
  private availableBuffers: CommandBuffer[];

  /**
   * Set of currently active (acquired) buffers.
   */
  private activeBuffers: Set<CommandBuffer>;

  /**
   * Creates a new CommandBufferPool.
   *
   * @param initialSize - Number of buffers to pre-allocate (default: 4)
   *
   * @example
   * ```typescript
   * const pool = new CommandBufferPool(8);
   * ```
   */
  constructor(initialSize: number = 4) {
    this.availableBuffers = [];
    this.activeBuffers = new Set();

    // Pre-allocate buffers
    for (let i = 0; i < initialSize; i++) {
      this.availableBuffers.push(new CommandBuffer());
    }
  }

  /**
   * Acquires a command buffer from the pool.
   * Creates a new buffer if the pool is empty.
   *
   * @returns CommandBuffer ready for use
   *
   * @example
   * ```typescript
   * const buffer = pool.acquire();
   * buffer.createEntity();
   * pool.release(buffer);
   * ```
   */
  acquire(): CommandBuffer {
    let buffer: CommandBuffer;

    if (this.availableBuffers.length > 0) {
      buffer = this.availableBuffers.pop()!;
    } else {
      buffer = new CommandBuffer();
    }

    this.activeBuffers.add(buffer);
    return buffer;
  }

  /**
   * Releases a command buffer back to the pool.
   * The buffer is cleared and made available for reuse.
   *
   * @param buffer - Buffer to release
   * @throws Error if buffer was not acquired from this pool
   *
   * @example
   * ```typescript
   * const buffer = pool.acquire();
   * // Use buffer...
   * pool.release(buffer);
   * ```
   */
  release(buffer: CommandBuffer): void {
    if (!this.activeBuffers.has(buffer)) {
      throw new Error('Buffer was not acquired from this pool');
    }

    this.activeBuffers.delete(buffer);
    buffer.clear();
    this.availableBuffers.push(buffer);
  }

  /**
   * Executes all active buffers and releases them back to the pool.
   * Commands are executed in the order buffers were acquired.
   *
   * @param executor - Command executor (typically World)
   * @returns Combined array of all created entities from all buffers
   *
   * @example
   * ```typescript
   * const buffer1 = pool.acquire();
   * const buffer2 = pool.acquire();
   *
   * buffer1.createEntity();
   * buffer2.createEntity();
   *
   * const entities = pool.playbackAll(world);
   * // entities[0] from buffer1, entities[1] from buffer2
   * ```
   */
  playbackAll(executor: CommandExecutor): Entity[] {
    const allEntities: Entity[] = [];

    // Convert to array to maintain acquisition order
    const buffers = Array.from(this.activeBuffers);

    for (let i = 0; i < buffers.length; i++) {
      const buffer = buffers[i];
      const entities = buffer.playback(executor);

      // Append entities from this buffer
      for (let j = 0; j < entities.length; j++) {
        allEntities.push(entities[j]);
      }

      // Release buffer back to pool
      this.activeBuffers.delete(buffer);
      buffer.clear();
      this.availableBuffers.push(buffer);
    }

    return allEntities;
  }

  /**
   * Gets the number of currently active (acquired) buffers.
   *
   * @returns Number of buffers in use
   *
   * @example
   * ```typescript
   * console.log(`Active buffers: ${pool.activeCount}`);
   * ```
   */
  get activeCount(): number {
    return this.activeBuffers.size;
  }

  /**
   * Gets the number of available (pooled) buffers.
   *
   * @returns Number of buffers ready for reuse
   *
   * @example
   * ```typescript
   * console.log(`Available buffers: ${pool.pooledCount}`);
   * ```
   */
  get pooledCount(): number {
    return this.availableBuffers.length;
  }
}

export { CommandBuffer, CommandBufferPool, CommandType };
export type { CommandExecutor, Command };
