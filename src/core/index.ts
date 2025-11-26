/**
 * @module Core
 * @description
 * Core utilities and foundational systems for the G3D engine.
 *
 * This module provides essential infrastructure and utility systems that support all other
 * engine modules. It includes fundamental functionality for:
 *
 * **Engine Configuration:**
 * - EngineConfig: Complete configuration schema for all engine subsystems
 * - Quality presets, subsystem configs, and feature flags
 *
 * **Diagnostics and Debugging:**
 * - Diagnostics: Runtime health monitoring and performance tracking
 * - BuildInfo: Engine version and build metadata
 * - Logger: Flexible logging system with multiple levels and channels
 * - Assert: Runtime assertion utilities for debug builds
 * - Panic: Graceful error handling and recovery
 *
 * **Performance and Memory Management:**
 * - TaskScheduler: Background task scheduling and async job management
 * - ObjectPool: Efficient object recycling to reduce allocations
 * - Time: High-resolution timing and frame rate management
 *
 * **Event System:**
 * - EventBus: Type-safe publish-subscribe event system
 *
 * **Utilities:**
 * - Random: Seeded random number generation
 * - IdGenerator: Unique identifier generation for engine objects
 *
 * These systems form the foundation upon which the rest of the engine is built, providing
 * consistent patterns for common operations and ensuring robust error handling throughout.
 *
 * @example
 * ```typescript
 * import {
 *   Logger,
 *   Time,
 *   EventBus,
 *   ObjectPool,
 *   TaskScheduler,
 *   Diagnostics,
 *   createDefaultConfig
 * } from './core';
 *
 * // Set up logging
 * const logger = new Logger('MySystem');
 * logger.info('System initialized');
 *
 * // Track frame time
 * Time.update();
 * const deltaTime = Time.deltaTime;
 *
 * // Use object pooling
 * const pool = new ObjectPool(() => ({ x: 0, y: 0 }));
 * const obj = pool.acquire();
 * pool.release(obj);
 *
 * // Schedule background tasks
 * TaskScheduler.schedule({
 *   id: 'load-assets',
 *   priority: TaskPriority.HIGH,
 *   execute: async () => { await loadAssets(); }
 * });
 *
 * // Enable diagnostics
 * Diagnostics.enable();
 * const report = Diagnostics.getReport();
 * ```
 */

// Core module barrel export
export * from './BuildInfo';
export * from './Assert';
export * from './Logger';
export * from './Time';
export * from './EventBus';
export * from './ObjectPool';
export * from './Panic';
export * from './Random';
export * from './IdGenerator';
export * from './TaskScheduler';
export * from './Diagnostics';

// Export EngineConfig but exclude types that conflict with rendering module enums
export type {
  PhysicsSolver,
  AudioDistanceModel,
  NetworkTransport,
  RenderingConfig,
  PhysicsConfig,
  AudioConfig,
  NetworkConfig,
  AIConfig,
  FeatureFlags,
  EngineConfig,
} from './EngineConfig';
export {
  createDefaultConfig,
  getPresetConfig,
  mergeConfigs,
  detectOptimalConfig,
  validateConfig,
  serializeConfig,
  deserializeConfig,
} from './EngineConfig';
