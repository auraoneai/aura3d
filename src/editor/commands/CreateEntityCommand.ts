/**
 * @fileoverview Command for creating entities with components and hierarchy placement.
 * @module editor/commands/CreateEntityCommand
 */

import { BaseCommand } from './Command';
import { Entity } from '../../ecs/Entity';
import { Component } from '../../ecs/Component';
import { Scene } from '../../scene/Scene';
import { Transform } from '../../components/Transform';

/**
 * Entity creation configuration
 */
export interface EntityCreationConfig {
  /** Entity name */
  name?: string;
  /** Components to add */
  components?: Component[];
  /** Parent entity */
  parent?: Entity;
  /** Component class constructors with args */
  componentClasses?: Array<{
    type: new (...args: any[]) => Component;
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
 * const cmd = new CreateEntityCommand(scene, {
 *   name: 'New Object',
 *   componentClasses: [
 *     { type: Transform },
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
  private scene: Scene;
  private config: EntityCreationConfig;
  private createdEntity: Entity | null = null;
  private entityId: string | null = null;
  private serializedEntity: any = null;

  /**
   * Creates an entity creation command
   * @param scene - Scene to create entity in
   * @param config - Creation configuration
   */
  constructor(scene: Scene, config: EntityCreationConfig = {}) {
    super();
    this.scene = scene;
    this.config = config;
    this.description = `Create entity${config.name ? ` "${config.name}"` : ''}`;
  }

  /**
   * Executes the entity creation
   */
  public execute(): void {
    if (this.createdEntity) {
      // Restoring from undo - deserialize with same ID
      this.createdEntity = this.deserializeEntity();
      this.scene.addEntity(this.createdEntity);
    } else {
      // First time creation
      this.createdEntity = this.createEntity();
      this.scene.addEntity(this.createdEntity);

      // Store entity ID for redo
      this.entityId = this.createdEntity.id;

      // Serialize for redo
      this.serializeEntity();
    }
  }

  /**
   * Creates the entity with components
   */
  private createEntity(): Entity {
    const entity = new Entity(this.config.name || 'Entity');

    // Add component instances
    if (this.config.components) {
      this.config.components.forEach(component => {
        entity.addComponent(component);
      });
    }

    // Add components from classes
    if (this.config.componentClasses) {
      this.config.componentClasses.forEach(({ type, args }) => {
        const component = new type(...(args || []));
        entity.addComponent(component);
      });
    }

    // Set up hierarchy
    if (this.config.parent) {
      const parentTransform = this.config.parent.getComponent(Transform);
      const entityTransform = entity.getComponent(Transform);

      if (parentTransform && entityTransform) {
        entityTransform.setParent(parentTransform);
      }
    }

    return entity;
  }

  /**
   * Serializes the created entity
   */
  private serializeEntity(): void {
    if (!this.createdEntity) return;

    this.serializedEntity = {
      id: this.createdEntity.id,
      name: this.createdEntity.name,
      components: this.createdEntity.getComponents().map(comp => ({
        type: comp.constructor.name,
        data: (comp as any).serialize?.() || {}
      })),
      parentId: this.config.parent?.id || null
    };
  }

  /**
   * Deserializes the entity (for redo)
   */
  private deserializeEntity(): Entity {
    if (!this.serializedEntity) {
      throw new Error('No serialized entity data');
    }

    // Create entity with same ID
    const entity = new Entity(this.serializedEntity.name);
    (entity as any).id = this.serializedEntity.id; // Restore original ID

    // Restore components
    // Note: This is simplified - real implementation would need component factory
    if (this.config.componentClasses) {
      this.config.componentClasses.forEach(({ type, args }) => {
        const component = new type(...(args || []));
        entity.addComponent(component);
      });
    }

    // Restore hierarchy
    if (this.config.parent) {
      const parentTransform = this.config.parent.getComponent(Transform);
      const entityTransform = entity.getComponent(Transform);

      if (parentTransform && entityTransform) {
        entityTransform.setParent(parentTransform);
      }
    }

    return entity;
  }

  /**
   * Undoes the entity creation (removes entity)
   */
  public undo(): void {
    if (!this.createdEntity) return;

    // Remove from scene
    this.scene.removeEntity(this.createdEntity);

    // Keep reference for redo but mark as removed
    // Don't set to null - we need it for redo
  }

  /**
   * Validates the command
   */
  public validate(): boolean {
    if (!this.scene) {
      console.warn('No scene provided');
      return false;
    }

    // Validate parent exists if specified
    if (this.config.parent && !this.config.parent.hasComponent(Transform)) {
      console.warn('Parent entity must have Transform component');
      return false;
    }

    return true;
  }

  /**
   * Gets the created entity (after execution)
   */
  public getEntity(): Entity | null {
    return this.createdEntity;
  }

  /**
   * Gets the memory size of this command
   */
  public getSize(): number {
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
        parentId: this.config.parent?.id
      },
      entityData: this.serializedEntity
    };
  }
}

/**
 * Command for creating a basic entity with Transform
 */
export class CreateBasicEntityCommand extends CreateEntityCommand {
  constructor(scene: Scene, name: string = 'Entity', parent?: Entity) {
    super(scene, {
      name,
      parent,
      componentClasses: [{ type: Transform }]
    });
  }
}

/**
 * Command for duplicating an entity
 */
export class DuplicateEntityCommand extends BaseCommand {
  public description: string;
  private scene: Scene;
  private sourceEntity: Entity;
  private duplicatedEntity: Entity | null = null;
  private serializedEntity: any = null;

  constructor(scene: Scene, entity: Entity) {
    super();
    this.scene = scene;
    this.sourceEntity = entity;
    this.description = `Duplicate "${entity.name}"`;
  }

  public execute(): void {
    if (this.duplicatedEntity) {
      // Redo
      this.scene.addEntity(this.duplicatedEntity);
    } else {
      // First time - clone the entity
      this.duplicatedEntity = this.cloneEntity(this.sourceEntity);
      this.scene.addEntity(this.duplicatedEntity);
      this.serializeEntity();
    }
  }

  public undo(): void {
    if (this.duplicatedEntity) {
      this.scene.removeEntity(this.duplicatedEntity);
    }
  }

  private cloneEntity(entity: Entity): Entity {
    const clone = new Entity(`${entity.name} (Copy)`);

    // Clone all components
    entity.getComponents().forEach(component => {
      // Simplified cloning - real implementation would use component serialization
      const ComponentClass = component.constructor as any;
      const clonedComponent = new ComponentClass();

      // Copy serializable data if available
      if ((component as any).serialize && (clonedComponent as any).deserialize) {
        const data = (component as any).serialize();
        (clonedComponent as any).deserialize(data);
      }

      clone.addComponent(clonedComponent);
    });

    return clone;
  }

  private serializeEntity(): void {
    if (!this.duplicatedEntity) return;
    this.serializedEntity = {
      id: this.duplicatedEntity.id,
      name: this.duplicatedEntity.name
    };
  }

  public getEntity(): Entity | null {
    return this.duplicatedEntity;
  }

  public getSize(): number {
    return 2; // Source and duplicate
  }
}
