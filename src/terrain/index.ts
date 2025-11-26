/**
 * G3D Terrain System
 *
 * Complete terrain rendering system with heightmaps, LOD, vegetation, and collision.
 * Supports large-scale terrains (4km x 4km+) with efficient streaming and culling.
 *
 * @module terrain
 *
 * @example
 * ```typescript
 * import {
 *   Terrain,
 *   Heightmap,
 *   TerrainMaterial,
 *   TerrainSystem,
 *   TerrainComponent
 * } from './terrain';
 *
 * // Create heightmap
 * const heightmap = await Heightmap.fromImage('terrain.png', {
 *   minHeight: 0,
 *   maxHeight: 100
 * });
 *
 * // Create terrain
 * const terrain = new Terrain({
 *   size: new Vector2(1000, 1000),
 *   chunkSize: 100,
 *   heightmapResolution: 513,
 *   chunkResolution: 65
 * });
 *
 * terrain.setHeightmap(heightmap);
 * terrain.build();
 *
 * // Add to ECS
 * const entity = world.createEntity();
 * entity.addComponent(new TerrainComponent(terrain));
 *
 * world.addSystem(new TerrainSystem());
 * ```
 */

// ============================================================================
// Core Terrain
// ============================================================================

export { Heightmap, HeightmapFormat } from './Heightmap';
export type { HeightmapDescriptor } from './Heightmap';

export { TerrainChunk } from './TerrainChunk';
export type {
  TerrainChunkDescriptor,
  LODDescriptor,
  NeighborInfo,
} from './TerrainChunk';

export { TerrainLOD, LODStrategy } from './TerrainLOD';
export type {
  LODLevelConfig,
  LODConfig,
  LODSelection,
} from './TerrainLOD';

export { TerrainQuadtree } from './TerrainQuadtree';
export type {
  QuadtreeNode,
  QuadtreeConfig,
  StreamingRequest,
} from './TerrainQuadtree';

export { Terrain } from './Terrain';
export type {
  TerrainConfig,
  TerrainData,
} from './Terrain';

// ============================================================================
// Materials and Texturing
// ============================================================================

export { Splatmap, SplatmapFormat } from './Splatmap';
export type { SplatmapDescriptor } from './Splatmap';

export { TerrainMaterial } from './TerrainMaterial';
export type {
  TerrainLayer,
  TerrainMaterialDescriptor,
} from './TerrainMaterial';

// ============================================================================
// Vegetation
// ============================================================================

export { Vegetation, VegetationDensityMap } from './Vegetation';
export type {
  VegetationInstance,
  VegetationLayer,
} from './Vegetation';

// ============================================================================
// Collision
// ============================================================================

export { TerrainCollision } from './TerrainCollision';
export type {
  TerrainIntersection,
  TerrainCollisionConfig,
} from './TerrainCollision';

// ============================================================================
// Editing
// ============================================================================

export {
  TerrainBrush,
  BrushOperation,
  BrushShape,
  BrushFalloff,
} from './TerrainBrush';
export type { BrushConfig } from './TerrainBrush';

// ============================================================================
// ECS Integration
// ============================================================================

export {
  TerrainSystem,
  TerrainComponent,
} from './TerrainSystem';
// Note: CameraComponent not re-exported here to avoid conflict with rendering module
