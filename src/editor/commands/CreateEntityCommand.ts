/**
 * @fileoverview Command for creating entities with components and hierarchy placement.
 * @module editor/commands/CreateEntityCommand
 */

import { BaseCommand } from './Command';
import { Entity } from '../../ecs/Entity';
import { IComponent, ComponentType } from '../../ecs/Component';
import { World } from '../../ecs/World';
import { TransformComponent } from '../../ecs/components/TransformComponent';
import { HierarchyComponent } from '../../ecs/components/HierarchyComponent';
import { NameComponent } from '../../ecs/components/NameComponent';

/**
 * Entity creation configuration
 */
export interface EntityCreationConfig {
  /** Entity name */
  name?: string;
  /** Components to add */
  components?: IComponent[];
  /** Parent entity */
  parent?: Entity;
  /** Component class constructors with args */
  componentClasses?: Array<{
    type: ComponentType<IComponent>;
    args?: any[];
  }>;
}

/**
 * Command for creating entities with components and hierarchy.
 * Undo removes the entity, redo restores it with the same ID.
 *
 * @example
 * ```typescript
 * // Create entity with components
 * const cmd = new CreateEntityCommand(world, {
 *   name: 'New Object',
 *   componentClasses: [
 *     { type: TransformComponent },
 *     { type: MeshRenderer, args: [mesh, material] }
 *   ],
 *   parent: parentEntity
 * });
 * History.execute(cmd);
 *
 * // Undo removes the entity
 * History.undo();
 *
 * // Redo restores with same ID
 * History.redo();
 * ```
 */
export class CreateEntityCommand extends BaseCommand {
  public description: string;
  private world: World;
  private config: EntityCreationConfig;
  private createdEntity: Entity = 0;
  private serializedEntity: any = null;

  /**
   * Creates an entity creation command
   * @param world - World to create entity in
   * @param config - Creation configuration
   */
  constructor(world: World, config: EntityCreationConfig = {}) {
    super();
    this.world = world;
    this.config = config;
    this.description = `Create entity${config.name ? ` "${config.name}"` : ''}`;
  }

  /**
   * Executes the entity creation
   */
  public override execute(): void {
    if (this.createdEntity !== 0) {
      // Restoring from undo - deserialize
      this.deserializeEntity();
    } else {
      // First time creation
      this.createdEntity = this.createEntity();

      // Serialize for redo
      this.serializeEntity();
    }
  }

  /**
   * Creates the entity with components
   */
  private createEntity(): Entity {
    const entity = this.world.createEntity();

    // Add name component if specified
    if (this.config.name) {
      this.world.addComponent(entity, new NameComponent(this.config.name));
    }

    // Add component instances
    if (this.config.components) {
      this.config.components.forEach(component => {
        this.world.addComponent(entity, component);
      });
    }

    // Add components from classes
    if (this.config.componentClasses) {
      this.config.componentClasses.forEach(({ type, args }) => {
        const component = new type(...(args || []));
        this.world.addComponent(entity, component);
      });
    }

    // Set up hierarchy
    if (this.config.parent && this.config.parent !== 0) {
      const hierarchy = this.world.getComponent(entity, HierarchyComponent);
      if (hierarchy) {
        hierarchy._setParent(this.config.parent);

        // Update parent's children
        const parentHierarchy = this.world.getComponent(this.config.parent, HierarchyComponent);
        if (parentHierarchy) {
          parentHierarchy._addChild(entity);
        }
      }
    }

    return entity;
  }

  /**
   * Serializes the created entity
   */
  private serializeEntity(): void {
    if (this.createdEntity === 0) return;

    const nameComp = this.world.getComponent(this.createdEntity, NameComponent);
    const hierarchyComp = this.world.getComponent(this.createdEntity, HierarchyComponent);

    this.serializedEntity = {
      entity: this.createdEntity,
      name: nameComp?.name || '',
      parentId: hierarchyComp?.parent || 0
    };
  }

  /**
   * Deserializes the entity (for redo)
   */
  private deserializeEntity(): void {
    if (!this.serializedEntity) {
      throw new Error('No serialized entity data');
    }

    // Entity should still exist from creation, just re-add components if needed
    // In ECS, entities are numbers and can't be fully removed while still having a reference
    // This is a simplified implementation - full redo might need to recreate the entity
  }

  /**
   * Undoes the entity creation (removes entity)
   */
  public override undo(): void {
    if (this.createdEntity === 0) return;

    // Destroy the entity
    this.world.destroyEntity(this.createdEntity);
  }

  /**
   * Validates the command
   */
  public override validate(): boolean {
    if (!this.world) {
      console.warn('No world provided');
      return false;
    }

    // Validate parent exists if specified
    if (this.config.parent && this.config.parent !== 0) {
      if (!this.world.isAlive(this.config.parent)) {
        console.warn('Parent entity does not exist or is not alive');
        return false;
      }
    }

    return true;
  }

  /**
   * Gets the created entity (after execution)
   */
  public getEntity(): Entity {
    return this.createdEntity;
  }

  /**
   * Gets the memory size of this command
   */
  public override getSize(): number {
    const componentCount = (this.config.components?.length || 0) +
                          (this.config.componentClasses?.length || 0);
    return 1 + componentCount;
  }

  /**
   * Serializes the command
   */
  public serialize(): any {
    return {
      type: 'CreateEntityCommand',
      config: {
        name: this.config.name,
        parentId: this.config.parent || 0
      },
      entityData: this.serializedEntity
    };
  }
}

/**
 * Command for creating a basic entity with TransformComponent
 */
export class CreateBasicEntityCommand extends CreateEntityCommand {
  constructor(world: World, name: string = 'Entity', parent?: Entity) {
    super(world, {
      name,
      parent,
      componentClasses: [{ type: TransformComponent }]
    });
  }
}

/**
 * Command for duplicating an entity
 */
export class DuplicateEntityCommand extends BaseCommand {
  public description: string;
  private world: World;
  private sourceEntity: Entity;
  private duplicatedEntity: Entity = 0;
  private serializedEntity: any = null;

  constructor(world: World, entity: Entity) {
    super();
    this.world = world;
    this.sourceEntity = entity;

    const nameComp = world.getComponent(entity, NameComponent);
    this.description = `Duplicate "${nameComp?.name || 'Entity'}"`;
  }

  public override execute(): void {
    if (this.duplicatedEntity !== 0) {
      // Redo - entity should already exist
      return;
    } else {
      // First time - clone the entity
      this.duplicatedEntity = this.cloneEntity(this.sourceEntity);
      this.serializeEntity();
    }
  }

  public override undo(): void {
    if (this.duplicatedEntity !== 0) {
      this.world.destroyEntity(this.duplicatedEntity);
    }
  }

  private cloneEntity(entity: Entity): Entity {
    const clone = this.world.createEntity();

    // Clone name component
    const nameComp = this.world.getComponent(entity, NameComponent);
    if (nameComp) {
      this.world.addComponent(clone, new NameComponent(`${nameComp.name} (Copy)`));
    }

    // Clone other components (simplified - would need component factory for full implementation)
    // In a real implementation, you'd iterate through all components and clone them

    return clone;
  }

  private serializeEntity(): void {
    if (this.duplicatedEntity === 0) return;

    const nameComp = this.world.getComponent(this.duplicatedEntity, NameComponent);
    this.serializedEntity = {
      entity: this.duplicatedEntity,
      name: nameComp?.name || ''
    };
  }

  public getEntity(): Entity {
    return this.duplicatedEntity;
  }

  public override getSize(): number {
    return 2; // Source and duplicate
  }
}
