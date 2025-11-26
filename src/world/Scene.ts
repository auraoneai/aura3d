/**
 * Scene data structure with entities
 * @module World
 */

import { Vector3 } from '../math/Vector3';

/**
 * Entity in a scene
 */
export interface Entity {
    /** Entity unique identifier */
    id: string;

    /** Entity name */
    name: string;

    /** Entity position */
    position: Vector3;

    /** Entity rotation (euler angles) */
    rotation: Vector3;

    /** Entity scale */
    scale: Vector3;

    /** Entity type */
    type: string;

    /** Entity metadata */
    metadata: Map<string, unknown>;

    /** Parent entity ID */
    parentId?: string;

    /** Child entity IDs */
    childIds: string[];

    /** Entity active state */
    active: boolean;

    /** Entity tags */
    tags: Set<string>;
}

/**
 * Scene data structure
 */
export class Scene {
    /** Scene unique identifier */
    public readonly id: string;

    /** Scene name */
    public name: string;

    /** All entities in scene */
    private entities: Map<string, Entity>;

    /** Root entity IDs (entities without parents) */
    private rootEntityIds: Set<string>;

    /** Scene metadata */
    private metadata: Map<string, unknown>;

    /** Scene loaded state */
    private loaded: boolean;

    /**
     * Creates a new scene
     * @param id - Scene identifier
     * @param name - Scene name
     */
    constructor(id: string, name: string = 'Untitled Scene') {
        this.id = id;
        this.name = name;
        this.entities = new Map();
        this.rootEntityIds = new Set();
        this.metadata = new Map();
        this.loaded = false;
    }

    /**
     * Adds an entity to the scene
     * @param entity - Entity to add
     */
    public addEntity(entity: Entity): void {
        this.entities.set(entity.id, entity);

        if (!entity.parentId) {
            this.rootEntityIds.add(entity.id);
        }
    }

    /**
     * Removes an entity from the scene
     * @param entityId - Entity ID to remove
     * @param recursive - Remove children recursively
     */
    public removeEntity(entityId: string, recursive: boolean = false): void {
        const entity = this.entities.get(entityId);
        if (!entity) {
            return;
        }

        if (recursive) {
            for (const childId of entity.childIds) {
                this.removeEntity(childId, true);
            }
        } else {
            // Reparent children to this entity's parent
            for (const childId of entity.childIds) {
                const child = this.entities.get(childId);
                if (child) {
                    child.parentId = entity.parentId;
                    if (entity.parentId) {
                        const parent = this.entities.get(entity.parentId);
                        if (parent) {
                            parent.childIds.push(childId);
                        }
                    } else {
                        this.rootEntityIds.add(childId);
                    }
                }
            }
        }

        // Remove from parent's children
        if (entity.parentId) {
            const parent = this.entities.get(entity.parentId);
            if (parent) {
                parent.childIds = parent.childIds.filter(id => id !== entityId);
            }
        } else {
            this.rootEntityIds.delete(entityId);
        }

        this.entities.delete(entityId);
    }

    /**
     * Gets an entity by ID
     * @param entityId - Entity ID
     * @returns Entity or undefined
     */
    public getEntity(entityId: string): Entity | undefined {
        return this.entities.get(entityId);
    }

    /**
     * Gets all entities
     */
    public getAllEntities(): Entity[] {
        return Array.from(this.entities.values());
    }

    /**
     * Gets root entities
     */
    public getRootEntities(): Entity[] {
        return Array.from(this.rootEntityIds)
            .map(id => this.entities.get(id))
            .filter((entity): entity is Entity => entity !== undefined);
    }

    /**
     * Gets entities by type
     * @param type - Entity type
     */
    public getEntitiesByType(type: string): Entity[] {
        return Array.from(this.entities.values())
            .filter(entity => entity.type === type);
    }

    /**
     * Gets entities by tag
     * @param tag - Tag to search for
     */
    public getEntitiesByTag(tag: string): Entity[] {
        return Array.from(this.entities.values())
            .filter(entity => entity.tags.has(tag));
    }

    /**
     * Gets entity children
     * @param entityId - Parent entity ID
     */
    public getEntityChildren(entityId: string): Entity[] {
        const entity = this.entities.get(entityId);
        if (!entity) {
            return [];
        }

        return entity.childIds
            .map(id => this.entities.get(id))
            .filter((child): child is Entity => child !== undefined);
    }

    /**
     * Sets entity parent
     * @param entityId - Entity ID
     * @param parentId - Parent entity ID (undefined for root)
     */
    public setEntityParent(entityId: string, parentId?: string): void {
        const entity = this.entities.get(entityId);
        if (!entity) {
            return;
        }

        // Remove from old parent
        if (entity.parentId) {
            const oldParent = this.entities.get(entity.parentId);
            if (oldParent) {
                oldParent.childIds = oldParent.childIds.filter(id => id !== entityId);
            }
        } else {
            this.rootEntityIds.delete(entityId);
        }

        // Set new parent
        entity.parentId = parentId;

        if (parentId) {
            const newParent = this.entities.get(parentId);
            if (newParent) {
                newParent.childIds.push(entityId);
            }
        } else {
            this.rootEntityIds.add(entityId);
        }
    }

    /**
     * Clears all entities from scene
     */
    public clear(): void {
        this.entities.clear();
        this.rootEntityIds.clear();
    }

    /**
     * Gets entity count
     */
    public getEntityCount(): number {
        return this.entities.size;
    }

    /**
     * Checks if scene has entity
     * @param entityId - Entity ID
     */
    public hasEntity(entityId: string): boolean {
        return this.entities.has(entityId);
    }

    /**
     * Sets scene metadata
     * @param key - Metadata key
     * @param value - Metadata value
     */
    public setMetadata(key: string, value: unknown): void {
        this.metadata.set(key, value);
    }

    /**
     * Gets scene metadata
     * @param key - Metadata key
     */
    public getMetadata(key: string): unknown {
        return this.metadata.get(key);
    }

    /**
     * Sets loaded state
     * @param loaded - Loaded state
     */
    public setLoaded(loaded: boolean): void {
        this.loaded = loaded;
    }

    /**
     * Gets loaded state
     */
    public isLoaded(): boolean {
        return this.loaded;
    }

    /**
     * Creates an entity
     * @param id - Entity ID
     * @param name - Entity name
     * @param type - Entity type
     * @returns Created entity
     */
    public createEntity(id: string, name: string, type: string = 'default'): Entity {
        const entity: Entity = {
            id,
            name,
            position: new Vector3(0, 0, 0),
            rotation: new Vector3(0, 0, 0),
            scale: new Vector3(1, 1, 1),
            type,
            metadata: new Map(),
            childIds: [],
            active: true,
            tags: new Set()
        };

        this.addEntity(entity);
        return entity;
    }

    /**
     * Visits all entities in hierarchy
     * @param callback - Callback function for each entity
     * @param entityId - Root entity ID (undefined for all roots)
     */
    public visitHierarchy(
        callback: (entity: Entity, depth: number) => void,
        entityId?: string
    ): void {
        if (entityId) {
            const entity = this.entities.get(entityId);
            if (entity) {
                this.visitHierarchyRecursive(entity, callback, 0);
            }
        } else {
            for (const rootId of this.rootEntityIds) {
                const entity = this.entities.get(rootId);
                if (entity) {
                    this.visitHierarchyRecursive(entity, callback, 0);
                }
            }
        }
    }

    /**
     * Recursively visits entity hierarchy
     */
    private visitHierarchyRecursive(
        entity: Entity,
        callback: (entity: Entity, depth: number) => void,
        depth: number
    ): void {
        callback(entity, depth);

        for (const childId of entity.childIds) {
            const child = this.entities.get(childId);
            if (child) {
                this.visitHierarchyRecursive(child, callback, depth + 1);
            }
        }
    }
}
