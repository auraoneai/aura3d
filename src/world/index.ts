/**
 * World management systems
 * Entity management, spatial indexing, level streaming, and scene management
 * @module World
 */

export { WorldManager } from './WorldManager';
export type { WorldManagerConfig, EntitySpawnParams } from './WorldManager';

export { SpatialIndex } from './SpatialIndex';
export type { SpatialObject, AABB } from './SpatialIndex';

export { LevelStreaming, StreamingState } from './LevelStreaming';
export type { StreamableLevel } from './LevelStreaming';

export { StreamingVolume, StreamingVolumeShape, StreamingPriority } from './StreamingVolume';

export { PrefabSystem } from './PrefabSystem';
export type { PrefabInstance } from './PrefabSystem';

export { Prefab } from './Prefab';
export type { PrefabEntity } from './Prefab';

export { SceneManager, SceneTransitionType } from './SceneManager';

export { Scene } from './Scene';
export type { Entity } from './Scene';

export { WorldQuery, ViewFrustum } from './WorldQuery';
export type { QueryResult, FrustumPlane } from './WorldQuery';
