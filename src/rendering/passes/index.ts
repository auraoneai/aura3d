/**
 * Rendering passes for the G3D 5.0 rendering engine.
 *
 * This module exports all render pass implementations for building
 * deferred and forward rendering pipelines.
 *
 * @module Passes
 */

// GBuffer Pass - Deferred geometry rendering
export {
  GBufferPass,
} from './GBufferPass';

export type {
  GBufferPassConfig,
  GBufferLayout,
} from './GBufferPass';

// Lighting Pass - Deferred lighting with PBR
export {
  LightingPass,
  LightType,
} from './LightingPass';

export type {
  LightingPassConfig,
  Light,
} from './LightingPass';

// Shadow Pass - Shadow map generation
export {
  ShadowPass,
  ShadowMapType,
} from './ShadowPass';

export type {
  ShadowPassConfig,
  ShadowMapDescriptor,
  CascadeConfig,
} from './ShadowPass';

// Forward Pass - Transparent and special materials
export {
  ForwardPass,
} from './ForwardPass';

export type {
  ForwardPassConfig,
} from './ForwardPass';

// Skybox Pass - Environment rendering
export {
  SkyboxPass,
  SkyboxType,
} from './SkyboxPass';

export type {
  SkyboxPassConfig,
  AtmosphereParams,
} from './SkyboxPass';

// Depth Pre-Pass - Early-Z optimization
export {
  DepthPrePass,
} from './DepthPrePass';

export type {
  DepthPrePassConfig,
} from './DepthPrePass';

// Ocean Pass - FFT-based water rendering
export {
  OceanPass,
  WaveSpectrum,
} from './OceanPass';

export type {
  OceanPassConfig,
  GerstnerWave,
} from './OceanPass';

// Terrain Pass - LOD terrain rendering
export {
  TerrainPass,
  LODSystem,
} from './TerrainPass';

export type {
  TerrainPassConfig,
  TerrainLayer,
} from './TerrainPass';

// Voxel Pass - Greedy meshing voxel renderer
export {
  VoxelPass,
  VoxelType,
} from './VoxelPass';

export type {
  VoxelPassConfig,
  Voxel,
  ChunkConfig,
} from './VoxelPass';

// Particle Pass - GPU particle system
export {
  ParticlePass,
  BillboardMode,
  ParticleBlendMode,
} from './ParticlePass';

export type {
  ParticlePassConfig,
  Particle,
  ParticleEmitterConfig,
} from './ParticlePass';

// ML Post-Process Pass - Neural network effects
export {
  MLPostProcessPass,
  MLModelType,
  MLBackend,
} from './MLPostProcessPass';

export type {
  MLPostProcessConfig,
  MLModelDescriptor,
} from './MLPostProcessPass';

// Debug Overlay Pass - Visualization and debugging
export {
  DebugOverlayPass,
  DebugMode,
} from './DebugOverlayPass';

export type {
  DebugOverlayConfig,
  PerformanceStats,
} from './DebugOverlayPass';

// SSAO Pass - Screen-space ambient occlusion
export {
  SSAOPass,
  SSAOQuality,
} from './SSAOPass';

export type {
  SSAOPassConfig,
} from './SSAOPass';
