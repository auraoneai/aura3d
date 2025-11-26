/**
 * G3D Voxel System - Phase D
 *
 * Complete voxel terrain system with:
 * - Chunk-based world management
 * - Greedy meshing for performance
 * - Marching cubes for smooth terrain
 * - Advanced lighting with AO
 * - Runtime destruction/modification
 * - Structural stability checking
 * - Physics integration
 * - Frustum culling
 *
 * Performance targets:
 * - 1000+ chunks at 60 FPS
 * - Greedy meshing reduces vertices by 70-90%
 * - Full 256-case marching cubes
 */

// Core voxel data
export { VoxelData, VoxelType } from './VoxelData';
export type { VoxelMaterial } from './VoxelData';

// Chunk management
export { VoxelChunk, ChunkState } from './VoxelChunk';
export type { ChunkMeshData, ChunkNeighbors } from './VoxelChunk';

// World management
export { VoxelWorld } from './VoxelWorld';
export type { WorldGenerator, ChunkCallback } from './VoxelWorld';

// Meshing algorithms
export { GreedyMesher } from './GreedyMesher';
export { MarchingCubes } from './MarchingCubes';
export type { ScalarField } from './MarchingCubes';

// Mesh building
export { ChunkMeshBuilder, MeshStrategy } from './ChunkMeshBuilder';
export type { MeshOptions } from './ChunkMeshBuilder';

// Lighting
export { VoxelLighting, LightType } from './VoxelLighting';

// Destruction
export { VoxelDestructionSystem, DestructionMode } from './VoxelDestructionSystem';
export type { DestructionEvent } from './VoxelDestructionSystem';

// Stability
export { StabilityChecker, SupportMode } from './StabilityChecker';
export type { StabilityResult } from './StabilityChecker';

// Physics
export { VoxelPhysics, ColliderType } from './VoxelPhysics';
export type { BoxCollider, MeshCollider, SimplifiedCollider, RayCastResult } from './VoxelPhysics';

// Rendering
export { VoxelRenderer } from './VoxelRenderer';
