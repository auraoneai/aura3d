/**
 * Prefab instantiation and management system
 * @module World
 */

import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import { Prefab, PrefabEntity } from './Prefab';
import { Scene, Entity } from './Scene';
import { Logger } from '../core/Logger';

/**
 * Prefab instance data
 */
export interface PrefabInstance {
    /** Instance unique identifier */
    id: string;

    /** Prefab ID this is an instance of */
    prefabId: string;

    /** Root entity ID in scene */
    rootEntityId: string;

    /** All entity IDs in this instance */
    entityIds: string[];

    /** Instance position */
    position: Vector3;

    /** Instance rotation */
    rotation: Vector3;

    /** Instance scale */
    scale: Vector3;
}

/**
 * Prefab system for instantiation and management
 */
export class PrefabSystem {
    /** Registered prefabs */
    private prefabs: Map<string, Prefab>;

    /** Prefab instances */
    private instances: Map<string, PrefabInstance>;

    /** Instance counter for unique IDs */
    private instanceCounter: number;

    /** Logger instance */
    private logger: Logger;

    /**
     * Creates a new prefab system
     */
    constructor() {
        this.prefabs = new Map();
        this.instances = new Map();
        this.instanceCounter = 0;
        this.logger = Logger.get('PrefabSystem');

        this.logger.info('Prefab system initialized');
    }

    /**
     * Registers a prefab
     * @param prefab - Prefab to register
     */
    public registerPrefab(prefab: Prefab): void {
        if (!prefab.validate()) {
            this.logger.error(`Invalid prefab: ${prefab.name}`, { id: prefab.id });
            throw new Error(`Invalid prefab structure: ${prefab.name}`);
        }

        this.prefabs.set(prefab.id, prefab);
        this.logger.info(`Registered prefab: ${prefab.name}`, {
            id: prefab.id,
            entityCount: prefab.getEntityCount()
        });
    }

    /**
     * Unregisters a prefab
     * @param prefabId - Prefab ID
     */
    public unregisterPrefab(prefabId: string): void {
        this.prefabs.delete(prefabId);
        this.logger.info(`Unregistered prefab: ${prefabId}`);
    }

    /**
     * Instantiates a prefab into a scene
     * @param prefabId - Prefab ID to instantiate
     * @param scene - Target scene
     * @param position - Instance position
     * @param rotation - Instance rotation (euler angles)
     * @param scale - Instance scale
     * @returns Prefab instance
     */
    public instantiate(
        prefabId: string,
        scene: Scene,
        position: Vector3 = new Vector3(0, 0, 0),
        rotation: Vector3 = new Vector3(0, 0, 0),
        scale: Vector3 = new Vector3(1, 1, 1)
    ): PrefabInstance | null {
        const prefab = this.prefabs.get(prefabId);
        if (!prefab) {
            this.logger.error(`Prefab not found: ${prefabId}`);
            return null;
        }

        const instanceId = `instance_${this.instanceCounter++}`;
        const entityIds: string[] = [];
        const entityMap = new Map<string, string>();

        // Create entities
        const prefabEntities = prefab.getAllEntities();
        for (const prefabEntity of prefabEntities) {
            const entityId = `${instanceId}_${prefabEntity.name}`;
            const entity = this.createEntityFromPrefab(
                entityId,
                prefabEntity,
                position,
                rotation,
                scale,
                !prefabEntity.parentName
            );

            scene.addEntity(entity);
            entityIds.push(entityId);
            entityMap.set(prefabEntity.name, entityId);
        }

        // Set up parent-child relationships
        for (const prefabEntity of prefabEntities) {
            if (prefabEntity.parentName) {
                const entityId = entityMap.get(prefabEntity.name);
                const parentId = entityMap.get(prefabEntity.parentName);

                if (entityId && parentId) {
                    scene.setEntityParent(entityId, parentId);
                }
            }
        }

        const rootEntityId = entityMap.get(prefab.getRootEntities()[0].name)!;

        const instance: PrefabInstance = {
            id: instanceId,
            prefabId: prefabId,
            rootEntityId: rootEntityId,
            entityIds: entityIds,
            position: position.clone(),
            rotation: rotation.clone(),
            scale: scale.clone()
        };

        this.instances.set(instanceId, instance);

        this.logger.info(`Instantiated prefab: ${prefab.name}`, {
            instanceId,
            entityCount: entityIds.length
        });

        return instance;
    }

    /**
     * Creates an entity from a prefab entity
     */
    private createEntityFromPrefab(
        entityId: string,
        prefabEntity: PrefabEntity,
        instancePos: Vector3,
        instanceRot: Vector3,
        instanceScale: Vector3,
        isRoot: boolean
    ): Entity {
        let finalPosition: Vector3;
        let finalRotation: Vector3;
        let finalScale: Vector3;

        if (isRoot) {
            // Apply instance transform to root
            finalPosition = instancePos.add(prefabEntity.position);
            finalRotation = instanceRot.add(prefabEntity.rotation);
            finalScale = new Vector3(
                instanceScale.x * prefabEntity.scale.x,
                instanceScale.y * prefabEntity.scale.y,
                instanceScale.z * prefabEntity.scale.z
            );
        } else {
            // Child entities use local transform
            finalPosition = prefabEntity.position.clone();
            finalRotation = prefabEntity.rotation.clone();
            finalScale = prefabEntity.scale.clone();
        }

        const entity: Entity = {
            id: entityId,
            name: prefabEntity.name,
            position: finalPosition,
            rotation: finalRotation,
            scale: finalScale,
            type: prefabEntity.type,
            metadata: new Map(prefabEntity.metadata),
            childIds: [],
            active: true,
            tags: new Set(prefabEntity.tags)
        };

        return entity;
    }

    /**
     * Destroys a prefab instance
     * @param instanceId - Instance ID
     * @param scene - Scene containing the instance
     */
    public destroyInstance(instanceId: string, scene: Scene): void {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            this.logger.warn(`Instance not found: ${instanceId}`);
            return;
        }

        // Remove all entities
        for (const entityId of instance.entityIds) {
            scene.removeEntity(entityId, false);
        }

        this.instances.delete(instanceId);

        this.logger.info(`Destroyed instance: ${instanceId}`, {
            prefabId: instance.prefabId
        });
    }

    /**
     * Gets a prefab by ID
     * @param prefabId - Prefab ID
     */
    public getPrefab(prefabId: string): Prefab | undefined {
        return this.prefabs.get(prefabId);
    }

    /**
     * Gets an instance by ID
     * @param instanceId - Instance ID
     */
    public getInstance(instanceId: string): PrefabInstance | undefined {
        return this.instances.get(instanceId);
    }

    /**
     * Gets all instances of a prefab
     * @param prefabId - Prefab ID
     */
    public getInstancesOfPrefab(prefabId: string): PrefabInstance[] {
        return Array.from(this.instances.values())
            .filter(instance => instance.prefabId === prefabId);
    }

    /**
     * Gets all registered prefabs
     */
    public getAllPrefabs(): Prefab[] {
        return Array.from(this.prefabs.values());
    }

    /**
     * Gets all instances
     */
    public getAllInstances(): PrefabInstance[] {
        return Array.from(this.instances.values());
    }

    /**
     * Updates an instance transform
     * @param instanceId - Instance ID
     * @param scene - Scene containing the instance
     * @param position - New position
     * @param rotation - New rotation
     * @param scale - New scale
     */
    public updateInstanceTransform(
        instanceId: string,
        scene: Scene,
        position?: Vector3,
        rotation?: Vector3,
        scale?: Vector3
    ): void {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            return;
        }

        const rootEntity = scene.getEntity(instance.rootEntityId);
        if (!rootEntity) {
            return;
        }

        if (position) {
            const offset = position.subtract(instance.position);
            rootEntity.position = rootEntity.position.add(offset);
            instance.position = position.clone();
        }

        if (rotation) {
            const rotationDelta = rotation.subtract(instance.rotation);
            rootEntity.rotation = rootEntity.rotation.add(rotationDelta);
            instance.rotation = rotation.clone();
        }

        if (scale) {
            const scaleFactor = new Vector3(
                scale.x / instance.scale.x,
                scale.y / instance.scale.y,
                scale.z / instance.scale.z
            );
            rootEntity.scale = new Vector3(
                rootEntity.scale.x * scaleFactor.x,
                rootEntity.scale.y * scaleFactor.y,
                rootEntity.scale.z * scaleFactor.z
            );
            instance.scale = scale.clone();
        }
    }

    /**
     * Creates a prefab from scene entities
     * @param scene - Source scene
     * @param entityIds - Entity IDs to include
     * @param prefabId - Prefab ID
     * @param prefabName - Prefab name
     * @returns Created prefab
     */
    public createPrefabFromScene(
        scene: Scene,
        entityIds: string[],
        prefabId: string,
        prefabName: string
    ): Prefab | null {
        const prefab = new Prefab(prefabId, prefabName);

        for (const entityId of entityIds) {
            const entity = scene.getEntity(entityId);
            if (!entity) {
                this.logger.warn(`Entity not found: ${entityId}`);
                continue;
            }

            const prefabEntity: PrefabEntity = {
                name: entity.name,
                type: entity.type,
                position: entity.position.clone(),
                rotation: entity.rotation.clone(),
                scale: entity.scale.clone(),
                metadata: new Map(entity.metadata),
                parentName: entity.parentId ? scene.getEntity(entity.parentId)?.name : undefined,
                tags: Array.from(entity.tags)
            };

            prefab.addEntity(prefabEntity);
        }

        if (!prefab.validate()) {
            this.logger.error(`Created invalid prefab: ${prefabName}`);
            return null;
        }

        this.registerPrefab(prefab);
        return prefab;
    }

    /**
     * Clears all instances
     */
    public clearInstances(): void {
        this.instances.clear();
        this.logger.info('Cleared all instances');
    }

    /**
     * Gets prefab system statistics
     */
    public getStatistics(): {
        prefabCount: number;
        instanceCount: number;
        totalEntities: number;
    } {
        let totalEntities = 0;
        for (const instance of this.instances.values()) {
            totalEntities += instance.entityIds.length;
        }

        return {
            prefabCount: this.prefabs.size,
            instanceCount: this.instances.size,
            totalEntities
        };
    }
}
