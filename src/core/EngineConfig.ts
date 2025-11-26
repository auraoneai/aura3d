/**
 * Complete configuration schema for all engine subsystems.
 *
 * Provides type-safe configuration for the entire G3D engine including
 * quality presets, subsystem configurations, feature flags, and utilities
 * for config management, merging, validation, and optimal setting detection.
 *
 * @example
 * ```typescript
 * // Create default config
 * const config = createDefaultConfig();
 * config.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
 *
 * // Use quality preset
 * const highQualityConfig = mergeConfigs(
 *   createDefaultConfig(),
 *   getPresetConfig('high')
 * );
 *
 * // Auto-detect optimal settings
 * const optimalConfig = mergeConfigs(
 *   createDefaultConfig(),
 *   detectOptimalConfig()
 * );
 *
 * // Initialize engine
 * await Engine.initialize(config);
 * ```
 */

import { Logger } from './Logger';

/**
 * Quality preset levels.
 */
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';

/**
 * Anti-aliasing modes.
 */
export type AntiAliasingMode = 'none' | 'msaa2x' | 'msaa4x' | 'msaa8x' | 'fxaa' | 'taa';

/**
 * Shadow quality levels.
 */
export type ShadowQuality = 'none' | 'low' | 'medium' | 'high' | 'ultra';

/**
 * Rendering backend types.
 */
export type RenderBackend = 'webgl2' | 'webgpu' | 'auto';

/**
 * Physics solver types.
 */
export type PhysicsSolver = 'sequential-impulse' | 'pgs' | 'newton';

/**
 * Audio distance model types.
 */
export type AudioDistanceModel = 'linear' | 'inverse' | 'exponential';

/**
 * Network transport types.
 */
export type NetworkTransport = 'websocket' | 'webrtc' | 'none';

/**
 * Rendering subsystem configuration.
 */
export interface RenderingConfig {
  /** Rendering backend (WebGL2, WebGPU, or auto-detect) */
  backend: RenderBackend;
  /** Target resolution width (0 = canvas width) */
  resolutionWidth: number;
  /** Target resolution height (0 = canvas height) */
  resolutionHeight: number;
  /** Resolution scale factor (0.5 = half res, 2.0 = supersampling) */
  resolutionScale: number;
  /** Anti-aliasing mode */
  antiAliasing: AntiAliasingMode;
  /** Shadow quality */
  shadowQuality: ShadowQuality;
  /** Shadow map resolution */
  shadowMapSize: number;
  /** Enable Screen Space Ambient Occlusion */
  enableSSAO: boolean;
  /** Enable Screen Space Reflections */
  enableSSR: boolean;
  /** Enable Global Illumination */
  enableGI: boolean;
  /** Enable Bloom post-processing */
  enableBloom: boolean;
  /** Enable motion blur */
  enableMotionBlur: boolean;
  /** Enable depth of field */
  enableDOF: boolean;
  /** Enable volumetric lighting */
  enableVolumetrics: boolean;
  /** Maximum point lights per frame */
  maxPointLights: number;
  /** Maximum spot lights per frame */
  maxSpotLights: number;
  /** Maximum directional lights per frame */
  maxDirectionalLights: number;
  /** Enable frustum culling */
  enableFrustumCulling: boolean;
  /** Enable occlusion culling */
  enableOcclusionCulling: boolean;
  /** Anisotropic filtering level (0 = off, 16 = max) */
  anisotropicFiltering: number;
}

/**
 * Physics subsystem configuration.
 */
export interface PhysicsConfig {
  /** Enable physics simulation */
  enabled: boolean;
  /** Fixed timestep for physics (seconds) */
  fixedTimestep: number;
  /** Solver type */
  solver: PhysicsSolver;
  /** Solver iterations per step */
  solverIterations: number;
  /** Gravity vector [x, y, z] */
  gravity: [number, number, number];
  /** Enable continuous collision detection */
  enableCCD: boolean;
  /** Enable physics debug rendering */
  enableDebugDraw: boolean;
  /** Maximum substeps per frame */
  maxSubsteps: number;
  /** Collision detection margin */
  collisionMargin: number;
  /** Sleep threshold velocity */
  sleepThreshold: number;
}

/**
 * Audio subsystem configuration.
 */
export interface AudioConfig {
  /** Enable audio system */
  enabled: boolean;
  /** Enable spatial audio (3D positional audio) */
  enableSpatialAudio: boolean;
  /** Audio distance model */
  distanceModel: AudioDistanceModel;
  /** Maximum simultaneous voices */
  maxVoices: number;
  /** Master volume (0-1) */
  masterVolume: number;
  /** Reference distance for spatial audio */
  referenceDistance: number;
  /** Maximum distance for spatial audio */
  maxDistance: number;
  /** Rolloff factor for distance attenuation */
  rolloffFactor: number;
}

/**
 * Networking subsystem configuration.
 */
export interface NetworkConfig {
  /** Enable networking */
  enabled: boolean;
  /** Network transport type */
  transport: NetworkTransport;
  /** Server URL (for WebSocket) or signaling server (for WebRTC) */
  serverUrl: string;
  /** Network tick rate (updates per second) */
  tickRate: number;
  /** Enable client-side prediction */
  enablePrediction: boolean;
  /** Enable server reconciliation */
  enableReconciliation: boolean;
  /** Enable entity interpolation */
  enableInterpolation: boolean;
  /** Interpolation delay in milliseconds */
  interpolationDelay: number;
  /** Maximum packet size in bytes */
  maxPacketSize: number;
}

/**
 * AI subsystem configuration.
 */
export interface AIConfig {
  /** Enable AI system */
  enabled: boolean;
  /** Navigation mesh cell size */
  navMeshCellSize: number;
  /** Navigation mesh cell height */
  navMeshCellHeight: number;
  /** Agent radius for pathfinding */
  agentRadius: number;
  /** Agent height for pathfinding */
  agentHeight: number;
  /** Behavior tree tick rate (updates per second) */
  behaviorTreeTickRate: number;
  /** Maximum pathfinding nodes per frame */
  maxPathfindingNodes: number;
  /** Enable AI debug visualization */
  enableDebugViz: boolean;
}

/**
 * Feature flags for optional systems.
 */
export interface FeatureFlags {
  /** Enable profiler UI */
  enableProfiler: boolean;
  /** Enable in-game console */
  enableConsole: boolean;
  /** Enable performance stats overlay */
  enableStats: boolean;
  /** Enable hot reload for assets */
  enableHotReload: boolean;
  /** Enable validation layers (for debugging) */
  enableValidation: boolean;
  /** Enable experimental features */
  enableExperimental: boolean;
}

/**
 * Complete engine configuration.
 */
export interface EngineConfig {
  // Core settings
  /** Canvas element for rendering */
  canvas: HTMLCanvasElement | null;
  /** Target frames per second (0 = unlimited) */
  targetFPS: number;
  /** Fixed timestep for physics (seconds) */
  fixedTimestep: number;
  /** Maximum fixed steps per frame (spiral of death prevention) */
  maxFixedStepsPerFrame: number;

  // Quality preset
  /** Quality preset level */
  qualityPreset: QualityPreset;

  // Subsystem configurations
  /** Rendering configuration */
  rendering: RenderingConfig;
  /** Physics configuration */
  physics: PhysicsConfig;
  /** Audio configuration */
  audio: AudioConfig;
  /** Networking configuration */
  networking: NetworkConfig;
  /** AI configuration */
  ai: AIConfig;

  // Feature flags
  /** Feature flags */
  features: FeatureFlags;
}

/**
 * Logger for config operations.
 */
const logger = new Logger('EngineConfig');

/**
 * Create default engine configuration with safe cross-platform settings.
 *
 * Returns a configuration suitable for most platforms with balanced
 * performance and visual quality. Canvas must be set before engine initialization.
 *
 * @returns Default engine configuration
 *
 * @example
 * ```typescript
 * const config = createDefaultConfig();
 * config.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
 * ```
 */
export function createDefaultConfig(): EngineConfig {
  return {
    // Core settings
    canvas: null,
    targetFPS: 60,
    fixedTimestep: 1 / 60,
    maxFixedStepsPerFrame: 8,

    // Quality preset
    qualityPreset: 'medium',

    // Rendering configuration
    rendering: {
      backend: 'auto',
      resolutionWidth: 0,
      resolutionHeight: 0,
      resolutionScale: 1.0,
      antiAliasing: 'fxaa',
      shadowQuality: 'medium',
      shadowMapSize: 1024,
      enableSSAO: true,
      enableSSR: false,
      enableGI: false,
      enableBloom: true,
      enableMotionBlur: false,
      enableDOF: false,
      enableVolumetrics: false,
      maxPointLights: 8,
      maxSpotLights: 4,
      maxDirectionalLights: 2,
      enableFrustumCulling: true,
      enableOcclusionCulling: false,
      anisotropicFiltering: 4,
    },

    // Physics configuration
    physics: {
      enabled: true,
      fixedTimestep: 1 / 60,
      solver: 'sequential-impulse',
      solverIterations: 10,
      gravity: [0, -9.81, 0],
      enableCCD: false,
      enableDebugDraw: false,
      maxSubsteps: 4,
      collisionMargin: 0.01,
      sleepThreshold: 0.1,
    },

    // Audio configuration
    audio: {
      enabled: true,
      enableSpatialAudio: true,
      distanceModel: 'inverse',
      maxVoices: 32,
      masterVolume: 1.0,
      referenceDistance: 1.0,
      maxDistance: 100.0,
      rolloffFactor: 1.0,
    },

    // Networking configuration
    networking: {
      enabled: false,
      transport: 'websocket',
      serverUrl: '',
      tickRate: 20,
      enablePrediction: true,
      enableReconciliation: true,
      enableInterpolation: true,
      interpolationDelay: 100,
      maxPacketSize: 1400,
    },

    // AI configuration
    ai: {
      enabled: true,
      navMeshCellSize: 0.3,
      navMeshCellHeight: 0.2,
      agentRadius: 0.5,
      agentHeight: 2.0,
      behaviorTreeTickRate: 10,
      maxPathfindingNodes: 1000,
      enableDebugViz: false,
    },

    // Feature flags
    features: {
      enableProfiler: false,
      enableConsole: false,
      enableStats: false,
      enableHotReload: false,
      enableValidation: false,
      enableExperimental: false,
    },
  };
}

/**
 * Get configuration for a quality preset.
 *
 * Returns partial configuration overrides for the specified quality level.
 * Use with mergeConfigs() to apply to a base configuration.
 *
 * @param preset - Quality preset level
 * @returns Partial configuration for the preset
 *
 * @example
 * ```typescript
 * const config = mergeConfigs(
 *   createDefaultConfig(),
 *   getPresetConfig('ultra')
 * );
 * ```
 */
export function getPresetConfig(preset: QualityPreset): Partial<EngineConfig> {
  const presets: Record<QualityPreset, Partial<EngineConfig>> = {
    low: {
      qualityPreset: 'low',
      targetFPS: 30,
      rendering: {
        backend: 'webgl2',
        resolutionScale: 0.75,
        antiAliasing: 'none',
        shadowQuality: 'low',
        shadowMapSize: 512,
        enableSSAO: false,
        enableSSR: false,
        enableGI: false,
        enableBloom: false,
        enableMotionBlur: false,
        enableDOF: false,
        enableVolumetrics: false,
        maxPointLights: 4,
        maxSpotLights: 2,
        maxDirectionalLights: 1,
        enableFrustumCulling: true,
        enableOcclusionCulling: false,
        anisotropicFiltering: 0,
        resolutionWidth: 0,
        resolutionHeight: 0,
      },
      physics: {
        enabled: true,
        fixedTimestep: 1 / 30,
        solver: 'sequential-impulse',
        solverIterations: 6,
        gravity: [0, -9.81, 0],
        enableCCD: false,
        enableDebugDraw: false,
        maxSubsteps: 2,
        collisionMargin: 0.01,
        sleepThreshold: 0.1,
      },
    },

    medium: {
      qualityPreset: 'medium',
      targetFPS: 60,
      rendering: {
        backend: 'auto',
        resolutionScale: 1.0,
        antiAliasing: 'fxaa',
        shadowQuality: 'medium',
        shadowMapSize: 1024,
        enableSSAO: true,
        enableSSR: false,
        enableGI: false,
        enableBloom: true,
        enableMotionBlur: false,
        enableDOF: false,
        enableVolumetrics: false,
        maxPointLights: 8,
        maxSpotLights: 4,
        maxDirectionalLights: 2,
        enableFrustumCulling: true,
        enableOcclusionCulling: false,
        anisotropicFiltering: 4,
        resolutionWidth: 0,
        resolutionHeight: 0,
      },
      physics: {
        enabled: true,
        fixedTimestep: 1 / 60,
        solver: 'sequential-impulse',
        solverIterations: 10,
        gravity: [0, -9.81, 0],
        enableCCD: false,
        enableDebugDraw: false,
        maxSubsteps: 4,
        collisionMargin: 0.01,
        sleepThreshold: 0.1,
      },
    },

    high: {
      qualityPreset: 'high',
      targetFPS: 60,
      rendering: {
        backend: 'auto',
        resolutionScale: 1.0,
        antiAliasing: 'taa',
        shadowQuality: 'high',
        shadowMapSize: 2048,
        enableSSAO: true,
        enableSSR: true,
        enableGI: false,
        enableBloom: true,
        enableMotionBlur: true,
        enableDOF: true,
        enableVolumetrics: false,
        maxPointLights: 16,
        maxSpotLights: 8,
        maxDirectionalLights: 3,
        enableFrustumCulling: true,
        enableOcclusionCulling: true,
        anisotropicFiltering: 8,
        resolutionWidth: 0,
        resolutionHeight: 0,
      },
      physics: {
        enabled: true,
        fixedTimestep: 1 / 60,
        solver: 'pgs',
        solverIterations: 15,
        gravity: [0, -9.81, 0],
        enableCCD: true,
        enableDebugDraw: false,
        maxSubsteps: 6,
        collisionMargin: 0.005,
        sleepThreshold: 0.05,
      },
    },

    ultra: {
      qualityPreset: 'ultra',
      targetFPS: 60,
      rendering: {
        backend: 'webgpu',
        resolutionScale: 1.0,
        antiAliasing: 'msaa4x',
        shadowQuality: 'ultra',
        shadowMapSize: 4096,
        enableSSAO: true,
        enableSSR: true,
        enableGI: true,
        enableBloom: true,
        enableMotionBlur: true,
        enableDOF: true,
        enableVolumetrics: true,
        maxPointLights: 32,
        maxSpotLights: 16,
        maxDirectionalLights: 4,
        enableFrustumCulling: true,
        enableOcclusionCulling: true,
        anisotropicFiltering: 16,
        resolutionWidth: 0,
        resolutionHeight: 0,
      },
      physics: {
        enabled: true,
        fixedTimestep: 1 / 60,
        solver: 'pgs',
        solverIterations: 20,
        gravity: [0, -9.81, 0],
        enableCCD: true,
        enableDebugDraw: false,
        maxSubsteps: 8,
        collisionMargin: 0.001,
        sleepThreshold: 0.02,
      },
    },

    custom: {
      qualityPreset: 'custom',
    },
  };

  return presets[preset] || presets.medium;
}

/**
 * Deep merge two configurations with type safety.
 *
 * Performs a deep merge of configuration objects, with overrides taking
 * precedence over base values. Handles nested objects correctly.
 *
 * @param base - Base configuration
 * @param overrides - Configuration overrides
 * @returns Merged configuration
 *
 * @example
 * ```typescript
 * const config = mergeConfigs(createDefaultConfig(), {
 *   targetFPS: 120,
 *   rendering: { antiAliasing: 'msaa4x' }
 * });
 * ```
 */
export function mergeConfigs(
  base: EngineConfig,
  overrides: Partial<EngineConfig>
): EngineConfig {
  const merged = { ...base };

  for (const key in overrides) {
    if (overrides.hasOwnProperty(key)) {
      const override = overrides[key as keyof EngineConfig];

      if (override !== undefined && override !== null) {
        if (typeof override === 'object' && !Array.isArray(override) && !(override instanceof HTMLCanvasElement)) {
          // Deep merge for nested objects
          (merged as any)[key] = {
            ...(base[key as keyof EngineConfig] as object),
            ...override,
          };
        } else {
          // Direct assignment for primitives and arrays
          (merged as any)[key] = override;
        }
      }
    }
  }

  return merged;
}

/**
 * Detect optimal configuration for the current platform.
 *
 * Analyzes device capabilities including GPU tier, memory, battery status,
 * and WebGL/WebGPU support to determine optimal settings.
 *
 * @returns Partial configuration with optimal settings
 *
 * @example
 * ```typescript
 * const config = mergeConfigs(
 *   createDefaultConfig(),
 *   detectOptimalConfig()
 * );
 * ```
 */
export function detectOptimalConfig(): Partial<EngineConfig> {
  const config: Partial<EngineConfig> = {};

  // Detect WebGPU support
  const hasWebGPU = 'gpu' in navigator;

  // Detect device memory (Chrome only)
  const deviceMemory = (navigator as any).deviceMemory || 4; // GB, default to 4GB

  // Detect hardware concurrency
  const cores = navigator.hardwareConcurrency || 4;

  // Detect battery status if available
  let isLowPower = false;
  if ('getBattery' in navigator) {
    (navigator as any).getBattery().then((battery: any) => {
      isLowPower = battery.charging === false && battery.level < 0.2;
    });
  }

  // Determine quality preset based on capabilities
  let preset: QualityPreset = 'medium';

  if (hasWebGPU && deviceMemory >= 8 && cores >= 8 && !isLowPower) {
    preset = 'ultra';
  } else if (hasWebGPU && deviceMemory >= 4 && cores >= 4) {
    preset = 'high';
  } else if (deviceMemory >= 2) {
    preset = 'medium';
  } else {
    preset = 'low';
  }

  // Apply preset
  Object.assign(config, getPresetConfig(preset));

  // Set backend preference
  if (hasWebGPU) {
    config.rendering = {
      ...config.rendering,
      backend: 'webgpu',
    } as RenderingConfig;
  } else {
    config.rendering = {
      ...config.rendering,
      backend: 'webgl2',
    } as RenderingConfig;
  }

  logger.info(`Auto-detected optimal config: ${preset} (GPU: ${hasWebGPU ? 'WebGPU' : 'WebGL2'}, Memory: ${deviceMemory}GB)`);

  return config;
}

/**
 * Validate engine configuration and return error messages.
 *
 * Checks for common configuration errors and returns an array of
 * error messages. Returns empty array if configuration is valid.
 *
 * @param config - Configuration to validate
 * @returns Array of error messages (empty if valid)
 *
 * @example
 * ```typescript
 * const errors = validateConfig(config);
 * if (errors.length > 0) {
 *   console.error('Config errors:', errors);
 * }
 * ```
 */
export function validateConfig(config: EngineConfig): string[] {
  const errors: string[] = [];

  // Validate canvas
  if (!config.canvas) {
    errors.push('Canvas element is required');
  } else if (!(config.canvas instanceof HTMLCanvasElement)) {
    errors.push('Canvas must be an HTMLCanvasElement');
  }

  // Validate core settings
  if (config.targetFPS < 0) {
    errors.push('targetFPS must be >= 0');
  }

  if (config.fixedTimestep <= 0) {
    errors.push('fixedTimestep must be > 0');
  }

  if (config.maxFixedStepsPerFrame < 1) {
    errors.push('maxFixedStepsPerFrame must be >= 1');
  }

  // Validate rendering config
  if (config.rendering.resolutionScale <= 0) {
    errors.push('rendering.resolutionScale must be > 0');
  }

  if (config.rendering.shadowMapSize < 0 || (config.rendering.shadowMapSize & (config.rendering.shadowMapSize - 1)) !== 0) {
    errors.push('rendering.shadowMapSize must be a power of 2');
  }

  if (config.rendering.maxPointLights < 0) {
    errors.push('rendering.maxPointLights must be >= 0');
  }

  if (config.rendering.anisotropicFiltering < 0 || config.rendering.anisotropicFiltering > 16) {
    errors.push('rendering.anisotropicFiltering must be between 0 and 16');
  }

  // Validate physics config
  if (config.physics.fixedTimestep <= 0) {
    errors.push('physics.fixedTimestep must be > 0');
  }

  if (config.physics.solverIterations < 1) {
    errors.push('physics.solverIterations must be >= 1');
  }

  // Validate audio config
  if (config.audio.masterVolume < 0 || config.audio.masterVolume > 1) {
    errors.push('audio.masterVolume must be between 0 and 1');
  }

  if (config.audio.maxVoices < 1) {
    errors.push('audio.maxVoices must be >= 1');
  }

  // Validate networking config
  if (config.networking.enabled && !config.networking.serverUrl) {
    errors.push('networking.serverUrl is required when networking is enabled');
  }

  if (config.networking.tickRate < 1) {
    errors.push('networking.tickRate must be >= 1');
  }

  return errors;
}

/**
 * Serialize configuration to JSON string.
 *
 * Converts configuration to JSON, excluding the canvas element.
 * Useful for saving/loading configurations.
 *
 * @param config - Configuration to serialize
 * @returns JSON string
 *
 * @example
 * ```typescript
 * const json = serializeConfig(config);
 * localStorage.setItem('engineConfig', json);
 * ```
 */
export function serializeConfig(config: EngineConfig): string {
  const serializable = { ...config, canvas: null };
  return JSON.stringify(serializable, null, 2);
}

/**
 * Deserialize configuration from JSON string.
 *
 * Parses JSON and merges with default config to ensure all fields are present.
 * Canvas must be set separately after deserialization.
 *
 * @param json - JSON string to deserialize
 * @returns Deserialized configuration
 *
 * @example
 * ```typescript
 * const json = localStorage.getItem('engineConfig');
 * const config = deserializeConfig(json);
 * config.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
 * ```
 */
export function deserializeConfig(json: string): EngineConfig {
  try {
    const parsed = JSON.parse(json);
    return mergeConfigs(createDefaultConfig(), parsed);
  } catch (error) {
    logger.error('Failed to deserialize config', error);
    return createDefaultConfig();
  }
}
