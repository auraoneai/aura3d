/**
 * @fileoverview Command for deleting entities with hierarchy and state preservation.
 * @module editor/commands/DeleteEntityCommand
 */

import { BaseCommand } from './Command';
import { Entity } from '../../ecs/Entity';
import { Scene } from '../../scene/Scene';
import { Transform } from '../../components/Transform';

/**
 * Serialized entity data for restoration
 */
interface SerializedEntityData {
  entity: Entity;
  data: any;
  parentId: string | null;
  childrenIds: string[];
}

/**
 * Command for deleting entities while preserving data for undo.
 * Handles hierarchy by deleting children and restoring them on undo.
 *
 * @example
 * ```typescript
 * // Delete single entity
 * const cmd = new DeleteEntityCommand(scene, entity);
 * History.execute(cmd);
 *
 * // Delete multiple entities
 * const cmd = new DeleteEntityCommand(scene, [entity1, entity2]);
 * History.execute(cmd);
 *
 * // Undo restores entities with all components and hierarchy
 * History.undo();
 * ```
 */
export class DeleteEntityCommand extends BaseCommand {
  public description: string;
  private scene: Scene;
  private entities: Entity[];
  private serializedData: Map<string, SerializedEntityData> = new Map();
  private deleteChildren: boolean;

  /**
   * Creates a delete entity command
   * @param scene - Scene containing the entities
   * @param entities - Entity or array of entities to delete
   * @param deleteChildren - Whether to delete children (default: true)
   */
  constructor(scene: Scene, entities: Entity | Entity[], deleteChildren: boolean = true) {
    super();
    this.scene = scene;
    this.entities = Array.isArray(entities) ? entities : [entities];
    this.deleteChildren = deleteChildren;

    const count = this.entities.length;
    this.description = count === 1
      ? `Delete "${this.entities[0].name}"`
      : `Delete ${count} entities`;
  }

  /**
   * Executes the deletion
   */
  public execute(): void {
    // If first time, serialize entities for undo
    if (this.serializedData.size === 0) {
      this.serializeEntities();
    }

    // Delete entities
    this.entities.forEach(entity => {
      this.deleteEntity(entity);
    });
  }

  /**
   * Deletes an entity and optionally its children
   */
  private deleteEntity(entity: Entity): void {
    // Delete children first if enabled
    if (this.deleteChildren) {
      const transform = entity.getComponent(Transform);
      if (transform) {
        const children = [...transform.children]; // Clone array
        children.forEach(childTransform => {
          this.deleteEntity(childTransform.entity);
        });
      }
    }

    // Remove from scene
    this.scene.removeEntity(entity);
  }

  /**
   * Serializes entities for restoration
   */
  private serializeEntities(): void {
    // Build list of all entities to delete (including children)
    const allEntities = this.getAllEntitiesToDelete();

    // Serialize each entity
    allEntities.forEach(entity => {
      const transform = entity.getComponent(Transform);

      const data: SerializedEntityData = {
        entity: entity,
        data: this.serializeEntity(entity),
        parentId: transform?.parent?.entity.id || null,
        childrenIds: transform?.children.map(c => c.entity.id) || []
      };

      this.serializedData.set(entity.id, data);
    });
  }

  /**
   * Gets all entities that will be deleted (including children)
   */
  private getAllEntitiesToDelete(): Entity[] {
    const allEntities = new Set<Entity>();

    const addEntityAndChildren = (entity: Entity) => {
      if (allEntities.has(entity)) return;

      allEntities.add(entity);

      if (this.deleteChildren) {
        const transform = entity.getComponent(Transform);
        if (transform) {
          transform.children.forEach(childTransform => {
            addEntityAndChildren(childTransform.entity);
          });
        }
      }
    };

    this.entities.forEach(entity => addEntityAndChildren(entity));
    return Array.from(allEntities);
  }

  /**
   * Serializes a single entity
   */
  private serializeEntity(entity: Entity): any {
    return {
      id: entity.id,
      name: entity.name,
      enabled: entity.enabled,
      components: entity.getComponents().map(comp => ({
        type: comp.constructor.name,
        data: (comp as any).serialize?.() || {}
      }))
    };
  }

  /**
   * Undoes the deletion (restores entities)
   */
  public undo(): void {
    // Restore entities in order (parents before children)
    const sortedEntities = this.getSortedEntitiesForRestore();

    sortedEntities.forEach(entityId => {
      const data = this.serializedData.get(entityId);
      if (!data) return;

      // Restore entity to scene
      this.scene.addEntity(data.entity);

      // Restore hierarchy
      if (data.parentId) {
        const parentData = this.serializedData.get(data.parentId);
        if (parentData) {
          const entityTransform = data.entity.getComponent(Transform);
          const parentTransform = parentData.entity.getComponent(Transform);

          if (entityTransform && parentTransform) {
            entityTransform.setParent(parentTransform);
          }
        }
      }
    });
  }

  /**
   * Sorts entities so parents are restored before children
   */
  private getSortedEntitiesForRestore(): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();

    const visit = (entityId: string) => {
      if (visited.has(entityId)) return;
      visited.add(entityId);

      const data = this.serializedData.get(entityId);
      if (!data) return;

      // Visit parent first
      if (data.parentId && this.serializedData.has(data.parentId)) {
        visit(data.parentId);
      }

      sorted.push(entityId);
    };

    // Visit all entities
    Array.from(this.serializedData.keys()).forEach(visit);

    return sorted;
  }

  /**
   * Validates the command
   */
  public validate(): boolean {
    if (!this.scene) {
      console.warn('No scene provided');
      return false;
    }

    if (this.entities.length === 0) {
      console.warn('No entities to delete');
      return false;
    }

    // Check that all entities exist in scene
    const sceneEntities = this.scene.getEntities();
    const valid = this.entities.every(entity => sceneEntities.includes(entity));

    if (!valid) {
      console.warn('Some entities are not in the scene');
    }

    return valid;
  }

  /**
   * Gets the memory size of this command
   */
  public getSize(): number {
    // Count all entities including children
    return this.serializedData.size;
  }

  /**
   * Serializes the command
   */
  public serialize(): any {
    return {
      type: 'DeleteEntityCommand',
      entityIds: this.entities.map(e => e.id),
      deleteChildren: this.deleteChildren,
      serializedData: Array.from(this.serializedData.entries()).map(([id, data]) => ({
        id,
        entityData: data.data,
        parentId: data.parentId,
        childrenIds: data.childrenIds
      }))
    };
  }
}

/**
 * Command for deleting entities without children
 */
export class DeleteEntityNoChildrenCommand extends DeleteEntityCommand {
  constructor(scene: Scene, entities: Entity | Entity[]) {
    super(scene, entities, false);
  }
}
