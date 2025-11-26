/**
 * @module Particles
 * @description
 * Complete particle system for G3D 5.0 graphics engine.
 *
 * This module provides a comprehensive, production-ready particle system with both CPU
 * and GPU acceleration. Key features include:
 *
 * **Core Components:**
 * - Particle: Individual particle data structure with position, velocity, color, size, rotation
 * - ParticleSystem: Main system manager with module-based architecture and pooling
 * - ParticleEmitter: Flexible emission with multiple shapes and burst modes
 * - ParticleRenderer: Multiple rendering modes including billboards, mesh, and trails
 * - GPUParticles: GPU-accelerated simulation for million-particle support
 *
 * **Behavior Modules:**
 * - VelocityModule: Initial velocity, velocity curves, orbital/radial motion
 * - ColorModule: Color gradients, color by speed, random colors, fade effects
 * - SizeModule: Size curves, size by speed, separate axis scaling
 * - RotationModule: Initial rotation, angular velocity, rotation curves, 3D rotation
 * - ForceModule: Gravity, wind, drag, turbulence, vortex forces
 * - CollisionModule: World collision with bounce, friction, sub-emitters
 *
 * **Performance Features:**
 * - Object pooling for zero-allocation updates
 * - LOD-based quality scaling
 * - GPU instancing for efficient rendering
 * - Compute shader simulation for millions of particles
 * - GPU sorting for correct transparency
 * - Configurable particle limits
 *
 * @example
 * ```typescript
 * import {
 *   ParticleSystem,
 *   ParticleEmitter,
 *   EmissionShape,
 *   VelocityModule,
 *   ColorModule,
 *   ForceModule,
 *   ParticleRenderer,
 *   ParticleRenderMode,
 * } from './particles';
 *
 * // Create particle system
 * const system = new ParticleSystem({
 *   maxParticles: 10000,
 *   lifetime: 3.0,
 *   color: new Color(1, 0.5, 0, 1),
 *   size: 0.5,
 *   autoStart: true,
 *   loop: true,
 * });
 *
 * // Configure emitter
 * system.emitter.shape = EmissionShape.Cone;
 * system.emitter.rate = 100;
 * system.emitter.coneParams.angle = 30;
 *
 * // Add behavior modules
 * system.addModule(new VelocityModule({
 *   speed: 5,
 *   speedRandomness: 0.2,
 * }));
 *
 * system.addModule(new ColorModule({
 *   gradient: [
 *     { time: 0, color: new Color(1, 1, 0, 1) },
 *     { time: 1, color: new Color(1, 0, 0, 0) },
 *   ],
 * }));
 *
 * system.addModule(new ForceModule({
 *   gravity: 9.8,
 *   drag: 0.1,
 * }));
 *
 * // Create renderer
 * const renderer = new ParticleRenderer({
 *   renderMode: ParticleRenderMode.Billboard,
 *   useInstancing: true,
 * });
 *
 * // Update loop
 * function update(deltaTime) {
 *   system.update(deltaTime);
 *   renderer.render(system, camera, device);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // GPU-accelerated particle system for millions of particles
 * import { GPUParticles } from './particles';
 *
 * const gpuParticles = new GPUParticles(device, {
 *   maxParticles: 1000000,
 *   useComputeShader: true,
 *   useGPUSorting: true,
 *   emitter: {
 *     rate: 10000,
 *     position: new Vector3(0, 0, 0),
 *     velocity: new Vector3(0, 5, 0),
 *   },
 *   simulation: {
 *     gravity: new Vector3(0, -9.8, 0),
 *     turbulence: 1.0,
 *   },
 * });
 *
 * await gpuParticles.initialize();
 *
 * function update(deltaTime) {
 *   gpuParticles.update(deltaTime);
 *   gpuParticles.render(camera);
 * }
 * ```
 */

// ============================================================================
// Core Particle System
// ============================================================================

export { Particle } from './Particle';
export type { ParticleCustomData } from './Particle';

export {
  ParticleSystem,
  ParticleLOD
} from './ParticleSystem';
export type {
  IParticleModule,
  ParticleSystemConfig,
  ParticleSystemStats
} from './ParticleSystem';

export {
  ParticleEmitter,
  EmissionShape,
  EmitterSpace
} from './ParticleEmitter';
export type {
  SphereEmissionParams,
  ConeEmissionParams,
  BoxEmissionParams,
  CircleEmissionParams,
  MeshEmissionParams,
  ParticleBurst,
  SubEmitter,
  ParticleEmitterConfig
} from './ParticleEmitter';

// ============================================================================
// Behavior Modules
// ============================================================================

export {
  VelocityModule,
  VelocityMode
} from './modules/VelocityModule';
export type {
  VelocityCurvePoint,
  VelocityModuleConfig
} from './modules/VelocityModule';

export {
  ColorModule
} from './modules/ColorModule';
export type {
  ColorGradientStop,
  ColorModuleConfig
} from './modules/ColorModule';

export {
  SizeModule
} from './modules/SizeModule';
export type {
  SizeCurvePoint,
  SizeModuleConfig
} from './modules/SizeModule';

export {
  RotationModule
} from './modules/RotationModule';
export type {
  RotationCurvePoint,
  RotationModuleConfig
} from './modules/RotationModule';

export {
  ForceModule
} from './modules/ForceModule';
export type {
  ForceModuleConfig
} from './modules/ForceModule';

export {
  CollisionModule,
  CollisionMode,
  CollisionResponse
} from './modules/CollisionModule';
export type {
  CollisionPlane,
  CollisionFunction,
  CollisionModuleConfig
} from './modules/CollisionModule';

// ============================================================================
// Rendering
// ============================================================================

export {
  ParticleRenderer,
  ParticleRenderMode,
  ParticleAlignment,
  ParticleSortMode
} from './ParticleRenderer';
export type {
  ParticleRendererConfig
} from './ParticleRenderer';

export {
  GPUParticles
} from './GPUParticles';
export type {
  GPUEmitterParams,
  GPUSimulationParams,
  GPUParticlesConfig
} from './GPUParticles';
