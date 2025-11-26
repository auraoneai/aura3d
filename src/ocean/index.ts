/**
 * G3D Ocean System - Phase D
 *
 * Complete ocean simulation and rendering system with:
 * - FFT-based wave simulation (Phillips spectrum)
 * - Gerstner wave analytics
 * - Multi-cascade detail levels
 * - Foam generation from Jacobian
 * - Buoyancy physics
 * - Underwater rendering effects
 * - Advanced ocean material (SSR, subsurface scattering)
 * - Projection grid rendering
 *
 * Performance targets:
 * - FFT simulation @ 60 FPS
 * - Realistic wave physics
 * - Full underwater effects
 */

// Main ocean system
export { OceanSystem, OceanMode } from './OceanSystem';
export type { OceanConfig } from './OceanSystem';

// Wave simulation
export { OceanFFT } from './OceanFFT';
export type { PhillipsParams } from './OceanFFT';
export { WaveCascade } from './WaveCascade';
export type { CascadeLevel } from './WaveCascade';
export { GerstnerWaves } from './GerstnerWaves';
export type { GerstnerWave } from './GerstnerWaves';

// Foam generation
export { FoamGenerator } from './FoamGenerator';
export type { FoamParams } from './FoamGenerator';

// Physics
export { BuoyancySystem } from './BuoyancySystem';
export type { BuoyantObject, BuoyancyForce } from './BuoyancySystem';

// Rendering
export { OceanRenderer } from './OceanRenderer';
export type { ProjectionGridParams, OceanMeshData } from './OceanRenderer';
export { UnderwaterEffects } from './UnderwaterEffects';
export type { UnderwaterParams, CausticsData } from './UnderwaterEffects';
export { OceanMaterial } from './OceanMaterial';
export type { OceanMaterialParams } from './OceanMaterial';
