/**
 * World management system
 * Coordinates entity spawning, despawning, and world state
 * @module World
 */

import { Vector3 } from '../math/Vector3';
import { Scene, Entity } from './Scene';
import { SpatialIndex, SpatialObject, AABB } from './SpatialIndex';
import { WorldQuery } from './WorldQuery';
import { LevelStreaming } from './LevelStreaming';
import { PrefabSystem } from './PrefabSystem';
import { SceneManager } from './SceneManager';
import { Logger } from '../core/Logger';

/**
 * Entity spawn parameters
 */
export interface EntitySpawnParams {
    /** Entity type */
    type: string;

    /** Entity name */
    name?: string;

    /** Spawn position */
    position?: Vector3;

    /** Spawn rotation (euler angles) */
    rotation?: Vector3;

    /** Spawn scale */
    scale?: Vector3;

    /** Entity metadata */
    metadata?: Map<string, unknown>;

    /** Entity tags */
    tags?: string[];

    /** Parent entity ID */
    parentId?: string;
}

/**
 * World manager configuration
 */
export interface WorldManagerConfig {
    /** World bounds */
    worldBounds: AABB;

    /** Enable spatial indexing */
    enableSpatialIndex?: boolean;

    /** Enable level streaming */
    enableLevelStreaming?: boolean;
}

/**
 * World manager for entity and world management
 */
export class WorldManager {
    /** Spatial index for efficient queries */
    private spatialIndex: SpatialIndex;

    /** World query system */
    private worldQuery: WorldQuery;

    /** Level streaming system */
    private levelStreaming: LevelStreaming;

    /** Prefab system */
    private prefabSystem: PrefabSystem;

    /** Scene manager */
    private sceneManager: SceneManager;

    /** Logger instance */
    private logger: Logger;

    /** World bounds */
    private worldBounds: AABB;

    /** Spatial indexing enabled */
    private spatialIndexEnabled: boolean;

    /** Entity counter for unique IDs */
    private entityCounter: number;

    /** Active entities in spatial index */
    private indexedEntities: Set<string>;

    /**
     * Creates a new world manager
     * @param config - World manager configuration
     */
    constructor(config: WorldManagerConfig) {
        this.worldBounds = config.worldBounds;
        this.spatialIndexEnabled = config.enableSpatialIndex ?? true;
        this.entityCounter = 0;
        this.indexedEntities = new Set();

        this.spatialIndex = new SpatialIndex(this.worldBounds);
        this.worldQuery = new WorldQuery(this.spatialIndex);
        this.levelStreaming = new LevelStreaming();
        this.prefabSystem = new PrefabSystem();
        this.sceneManager = new SceneManager();

        this.logger = Logger.get('WorldManager');

        this.logger.info('World manager initialized', {
            worldBounds: config.worldBounds,
            spatialIndexing: this.spatialIndexEnabled
        });
    }

    /**
     * Spawns an entity in the active scene
     * @param params - Spawn parameters
     * @returns Spawned entity or null
     */
    public spawnEntity(params: EntitySpawnParams): Entity | null {
        const scene = this.sceneManager.getActiveScene();
        if (!scene) {
            this.logger.error('No active scene to spawn entity in');
            return null;
        }

        const entityId = `entity_${this.entityCounter++}`;
        const entity: Entity = {
            id: entityId,
            name: params.name ?? `Entity_${entityId}`,
            position: params.position?.clone() ?? new Vector3(0, 0, 0),
            rotation: params.rotation?.clone() ?? new Vector3(0, 0, 0),
            scale: params.scale?.clone() ?? new Vector3(1, 1, 1),
            type: params.type,
            metadata: params.metadata ?? new Map(),
            parentId: params.parentId,
            childIds: [],
            active: true,
            tags: new Set(params.tags ?? [])
        };

        scene.addEntity(entity);

        // Add to spatial index
        if (this.spatialIndexEnabled) {
            this.addToSpatialIndex(entity);
        }

        this.logger.info(`Spawned entity: ${entity.name}`, {
            id: entityId,
            type: params.type
        });

        return entity;
    }

    /**
     * Despawns an entity from the active scene
     * @param entityId - Entity ID to despawn
     * @param recursive - Remove children recursively
     */
    public despawnEntity(entityId: string, recursive: boolean = false): void {
        const scene = this.sceneManager.getActiveScene();
        if (!scene) {
            return;
        }

        const entity = scene.getEntity(entityId);
        if (!entity) {
            return;
        }

        // Remove from spatial index
        if (this.spatialIndexEnabled && this.indexedEntities.has(entityId)) {
            this.spatialIndex.remove(entityId);
            this.indexedEntities.delete(entityId);
        }

        // Remove children if recursive
        if (recursive) {
            for (const childId of entity.childIds) {
                this.despawnEntity(childId, true);
            }
        }

        scene.removeEntity(entityId, recursive);

        this.logger.info(`Despawned entity: ${entity.name}`, {
            id: entityId
        });
    }

    /**
     * Updates entity position and spatial index
     * @param entityId - Entity ID
     * @param position - New position
     */
    public updateEntityPosition(entityId: string, position: Vector3): void {
        const scene = this.sceneManager.getActiveScene();
        if (!scene) {
            return;
        }

        const entity = scene.getEntity(entityId);
        if (!entity) {
            return;
        }

        entity.position = position.clone();

        // Update spatial index
        if (this.spatialIndexEnabled && this.indexedEntities.has(entityId)) {
            const bounds = this.getEntityBounds(entity);
            this.spatialIndex.update(entityId, bounds);
        }
    }

    /**
     * Adds entity to spatial index
     */
    private addToSpatialIndex(entity: Entity): void {
        const bounds = this.getEntityBounds(entity);

        const spatialObject: SpatialObject = {
            id: entity.id,
            bounds: bounds,
            position: entity.position.clone(),
            data: entity
        };

        this.spatialIndex.insert(spatialObject);
        this.indexedEntities.add(entity.id);
    }

    /**
     * Gets entity bounding box (simplified)
     */
    private getEntityBounds(entity: Entity): AABB {
        const halfSize = entity.scale.clone().multiplyScalar(0.5);
        return {
            min: entity.position.subtract(halfSize),
            max: entity.position.add(halfSize)
        };
    }

    /**
     * Updates the world manager
     * @param deltaTime - Time elapsed in seconds
     */
    public update(deltaTime: number): void {
        this.levelStreaming.update(deltaTime);
        this.sceneManager.update(deltaTime);
    }

    /**
     * Gets the spatial index
     */
    public getSpatialIndex(): SpatialIndex {
        return this.spatialIndex;
    }

    /**
     * Gets the world query system
     */
    public getWorldQuery(): WorldQuery {
        return this.worldQuery;
    }

    /**
     * Gets the level streaming system
     */
    public getLevelStreaming(): LevelStreaming {
        return this.levelStreaming;
    }

    /**
     * Gets the prefab system
     */
    public getPrefabSystem(): PrefabSystem {
        return this.prefabSystem;
    }

    /**
     * Gets the scene manager
     */
    public getSceneManager(): SceneManager {
        return this.sceneManager;
    }

    /**
     * Queries entities within radius
     * @param center - Query center
     * @param radius - Query radius
     * @returns Entities within radius
     */
    public queryEntitiesInRadius(center: Vector3, radius: number): Entity[] {
        if (!this.spatialIndexEnabled) {
            return [];
        }

        const results = this.worldQuery.queryRadius(center, radius);
        return results.map(r => r.object.data as Entity);
    }

    /**
     * Queries entities within box
     * @param min - Box minimum
     * @param max - Box maximum
     * @returns Entities within box
     */
    public queryEntitiesInBox(min: Vector3, max: Vector3): Entity[] {
        if (!this.spatialIndexEnabled) {
            return [];
        }

        const results = this.worldQuery.queryBox(min, max);
        return results.map(r => r.object.data as Entity);
    }

    /**
     * Finds nearest entity to position
     * @param position - Query position
     * @param maxDistance - Maximum search distance
     * @returns Nearest entity or null
     */
    public findNearestEntity(position: Vector3, maxDistance: number = Infinity): Entity | null {
        if (!this.spatialIndexEnabled) {
            return null;
        }

        const result = this.worldQuery.queryNearest(position, maxDistance);
        return result ? (result.object.data as Entity) : null;
    }

    /**
     * Gets all entities in active scene
     */
    public getAllEntities(): Entity[] {
        const scene = this.sceneManager.getActiveScene();
        return scene ? scene.getAllEntities() : [];
    }

    /**
     * Gets entities by type
     * @param type - Entity type
     */
    public getEntitiesByType(type: string): Entity[] {
        const scene = this.sceneManager.getActiveScene();
        return scene ? scene.getEntitiesByType(type) : [];
    }

    /**
     * Gets entities by tag
     * @param tag - Entity tag
     */
    public getEntitiesByTag(tag: string): Entity[] {
        const scene = this.sceneManager.getActiveScene();
        return scene ? scene.getEntitiesByTag(tag) : [];
    }

    /**
     * Gets world bounds
     */
    public getWorldBounds(): AABB {
        return {
            min: this.worldBounds.min.clone(),
            max: this.worldBounds.max.clone()
        };
    }

    /**
     * Sets viewer position for streaming
     * @param position - Viewer position
     */
    public setViewerPosition(position: Vector3): void {
        this.levelStreaming.setViewerPosition(position);
    }

    /**
     * Clears all entities from active scene
     */
    public clearAllEntities(): void {
        const scene = this.sceneManager.getActiveScene();
        if (scene) {
            scene.clear();
        }

        if (this.spatialIndexEnabled) {
            this.spatialIndex.clear();
            this.indexedEntities.clear();
        }

        this.logger.info('Cleared all entities from active scene');
    }

    /**
     * Gets world manager statistics
     */
    public getStatistics(): {
        activeScene: string | null;
        entityCount: number;
        indexedEntities: number;
        spatialIndexStats: ReturnType<SpatialIndex['getStatistics']>;
        streamingStats: ReturnType<LevelStreaming['getStatistics']>;
        sceneStats: ReturnType<SceneManager['getStatistics']>;
        prefabStats: ReturnType<PrefabSystem['getStatistics']>;
    } {
        const scene = this.sceneManager.getActiveScene();

        return {
            activeScene: scene?.name ?? null,
            entityCount: scene?.getEntityCount() ?? 0,
            indexedEntities: this.indexedEntities.size,
            spatialIndexStats: this.spatialIndex.getStatistics(),
            streamingStats: this.levelStreaming.getStatistics(),
            sceneStats: this.sceneManager.getStatistics(),
            prefabStats: this.prefabSystem.getStatistics()
        };
    }
}
