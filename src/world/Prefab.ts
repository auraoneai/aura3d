/**
 * Prefab data structure
 * @module World
 */

import { Vector3 } from '../math/Vector3';

/**
 * Prefab entity template
 */
export interface PrefabEntity {
    /** Entity name */
    name: string;

    /** Entity type */
    type: string;

    /** Local position relative to parent */
    position: Vector3;

    /** Local rotation (euler angles) */
    rotation: Vector3;

    /** Local scale */
    scale: Vector3;

    /** Entity metadata */
    metadata: Map<string, unknown>;

    /** Parent entity name in prefab */
    parentName?: string;

    /** Entity tags */
    tags: string[];
}

/**
 * Prefab asset definition
 */
export class Prefab {
    /** Prefab unique identifier */
    public readonly id: string;

    /** Prefab name */
    public name: string;

    /** Prefab entities */
    private entities: PrefabEntity[];

    /** Prefab metadata */
    private metadata: Map<string, unknown>;

    /** Prefab version */
    public version: number;

    /**
     * Creates a new prefab
     * @param id - Prefab identifier
     * @param name - Prefab name
     */
    constructor(id: string, name: string = 'Untitled Prefab') {
        this.id = id;
        this.name = name;
        this.entities = [];
        this.metadata = new Map();
        this.version = 1;
    }

    /**
     * Adds an entity to the prefab
     * @param entity - Prefab entity
     */
    public addEntity(entity: PrefabEntity): void {
        this.entities.push(entity);
    }

    /**
     * Removes an entity from the prefab
     * @param name - Entity name
     */
    public removeEntity(name: string): void {
        this.entities = this.entities.filter(e => e.name !== name);

        // Remove this entity as parent from children
        for (const entity of this.entities) {
            if (entity.parentName === name) {
                entity.parentName = undefined;
            }
        }
    }

    /**
     * Gets an entity by name
     * @param name - Entity name
     */
    public getEntity(name: string): PrefabEntity | undefined {
        return this.entities.find(e => e.name === name);
    }

    /**
     * Gets all entities
     */
    public getAllEntities(): readonly PrefabEntity[] {
        return this.entities;
    }

    /**
     * Gets root entities (entities without parents)
     */
    public getRootEntities(): PrefabEntity[] {
        return this.entities.filter(e => !e.parentName);
    }

    /**
     * Gets entity children
     * @param parentName - Parent entity name
     */
    public getEntityChildren(parentName: string): PrefabEntity[] {
        return this.entities.filter(e => e.parentName === parentName);
    }

    /**
     * Sets prefab metadata
     * @param key - Metadata key
     * @param value - Metadata value
     */
    public setMetadata(key: string, value: unknown): void {
        this.metadata.set(key, value);
    }

    /**
     * Gets prefab metadata
     * @param key - Metadata key
     */
    public getMetadata(key: string): unknown {
        return this.metadata.get(key);
    }

    /**
     * Creates a deep copy of this prefab
     */
    public clone(): Prefab {
        const cloned = new Prefab(this.id, this.name);
        cloned.version = this.version;

        for (const entity of this.entities) {
            cloned.addEntity({
                name: entity.name,
                type: entity.type,
                position: entity.position.clone(),
                rotation: entity.rotation.clone(),
                scale: entity.scale.clone(),
                metadata: new Map(entity.metadata),
                parentName: entity.parentName,
                tags: [...entity.tags]
            });
        }

        cloned.metadata = new Map(this.metadata);

        return cloned;
    }

    /**
     * Gets entity count
     */
    public getEntityCount(): number {
        return this.entities.length;
    }

    /**
     * Validates prefab structure
     * @returns True if valid, false otherwise
     */
    public validate(): boolean {
        const names = new Set<string>();

        for (const entity of this.entities) {
            // Check for duplicate names
            if (names.has(entity.name)) {
                return false;
            }
            names.add(entity.name);

            // Check parent exists
            if (entity.parentName && !this.entities.find(e => e.name === entity.parentName)) {
                return false;
            }
        }

        // Check for circular parent references
        for (const entity of this.entities) {
            if (this.hasCircularReference(entity.name)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Checks for circular parent references
     * @param entityName - Entity name to check
     */
    private hasCircularReference(entityName: string): boolean {
        const visited = new Set<string>();
        let current = entityName;

        while (current) {
            if (visited.has(current)) {
                return true;
            }

            visited.add(current);

            const entity = this.entities.find(e => e.name === current);
            if (!entity || !entity.parentName) {
                break;
            }

            current = entity.parentName;
        }

        return false;
    }

    /**
     * Serializes prefab to JSON
     */
    public toJSON(): object {
        return {
            id: this.id,
            name: this.name,
            version: this.version,
            entities: this.entities.map(e => ({
                name: e.name,
                type: e.type,
                position: { x: e.position.x, y: e.position.y, z: e.position.z },
                rotation: { x: e.rotation.x, y: e.rotation.y, z: e.rotation.z },
                scale: { x: e.scale.x, y: e.scale.y, z: e.scale.z },
                metadata: Array.from(e.metadata.entries()),
                parentName: e.parentName,
                tags: e.tags
            })),
            metadata: Array.from(this.metadata.entries())
        };
    }

    /**
     * Deserializes prefab from JSON
     * @param json - JSON object
     * @returns Prefab instance
     */
    public static fromJSON(json: any): Prefab {
        const prefab = new Prefab(json.id, json.name);
        prefab.version = json.version || 1;

        for (const entityData of json.entities) {
            const entity: PrefabEntity = {
                name: entityData.name,
                type: entityData.type,
                position: new Vector3(
                    entityData.position.x,
                    entityData.position.y,
                    entityData.position.z
                ),
                rotation: new Vector3(
                    entityData.rotation.x,
                    entityData.rotation.y,
                    entityData.rotation.z
                ),
                scale: new Vector3(
                    entityData.scale.x,
                    entityData.scale.y,
                    entityData.scale.z
                ),
                metadata: new Map(entityData.metadata),
                parentName: entityData.parentName,
                tags: entityData.tags
            };

            prefab.addEntity(entity);
        }

        prefab.metadata = new Map(json.metadata);

        return prefab;
    }
}
