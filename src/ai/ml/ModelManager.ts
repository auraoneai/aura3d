/**
 * Model lifecycle manager for loading, unloading, and caching ML models.
 * Manages memory efficiently to support multiple models with resource constraints.
 * @module ModelManager
 */

import { Logger } from '../../core/Logger';
import {
  ONNXRuntimeWrapper,
  InferenceSession,
  InferenceSessionOptions,
} from './ONNXRuntimeWrapper';

const logger = Logger.create('ModelManager');

/**
 * Model metadata and configuration.
 */
export interface ModelInfo {
  /** Unique identifier for the model */
  id: string;
  /** URL to the model file */
  url: string;
  /** Model version */
  version?: string;
  /** Expected input shapes for validation */
  inputShapes?: Record<string, number[]>;
  /** Expected output shapes for validation */
  outputShapes?: Record<string, number[]>;
  /** Priority for caching (higher = keep longer) */
  priority?: number;
  /** Session options for inference */
  sessionOptions?: InferenceSessionOptions;
}

/**
 * Cached model entry with metadata and usage tracking.
 */
interface CachedModel {
  /** Model information */
  info: ModelInfo;
  /** Inference session */
  session: InferenceSession;
  /** Estimated memory usage in bytes */
  memoryUsage: number;
  /** Last access timestamp for LRU eviction */
  lastAccessTime: number;
  /** Number of times this model has been used */
  useCount: number;
}

/**
 * Model manager options.
 */
export interface ModelManagerOptions {
  /** Maximum memory budget in bytes (default: 100MB) */
  maxMemoryBytes?: number;
  /** Maximum number of cached models (default: 10) */
  maxCachedModels?: number;
  /** Enable preloading of models (default: true) */
  enablePreloading?: boolean;
}

/**
 * Model lifecycle manager with automatic caching and memory management.
 * Implements LRU eviction policy with priority support.
 */
export class ModelManager {
  private cache: Map<string, CachedModel> = new Map();
  private loadingPromises: Map<string, Promise<InferenceSession>> = new Map();
  private readonly maxMemoryBytes: number;
  private readonly maxCachedModels: number;
  private readonly enablePreloading: boolean;
  private currentMemoryUsage: number = 0;

  /**
   * Creates a new model manager.
   * @param options - Manager configuration options
   */
  constructor(options: ModelManagerOptions = {}) {
    this.maxMemoryBytes = options.maxMemoryBytes ?? 100 * 1024 * 1024; // 100MB
    this.maxCachedModels = options.maxCachedModels ?? 10;
    this.enablePreloading = options.enablePreloading ?? true;

    logger.info('ModelManager initialized', {
      maxMemoryMB: this.maxMemoryBytes / (1024 * 1024),
      maxCachedModels: this.maxCachedModels,
    });
  }

  /**
   * Loads a model by ID. Returns cached session if available.
   * @param modelInfo - Model information and configuration
   * @returns Promise resolving to inference session
   */
  async load(modelInfo: ModelInfo): Promise<InferenceSession> {
    const { id, url, sessionOptions } = modelInfo;

    // Check cache first
    if (this.cache.has(id)) {
      logger.debug(`Model ${id} found in cache`);
      const cached = this.cache.get(id)!;
      cached.lastAccessTime = Date.now();
      cached.useCount++;
      return cached.session;
    }

    // Check if already loading
    if (this.loadingPromises.has(id)) {
      logger.debug(`Model ${id} already loading, waiting...`);
      return this.loadingPromises.get(id)!;
    }

    // Start loading
    logger.info(`Loading model ${id} from ${url}`);
    const loadPromise = this.loadModel(modelInfo);
    this.loadingPromises.set(id, loadPromise);

    try {
      const session = await loadPromise;
      this.cacheModel(modelInfo, session);
      return session;
    } finally {
      this.loadingPromises.delete(id);
    }
  }

  /**
   * Internal method to load a model from URL.
   * @param modelInfo - Model information
   * @returns Promise resolving to inference session
   */
  private async loadModel(modelInfo: ModelInfo): Promise<InferenceSession> {
    const startTime = performance.now();

    const session = await ONNXRuntimeWrapper.createSession(
      modelInfo.url,
      modelInfo.sessionOptions
    );

    const loadTime = performance.now() - startTime;
    logger.info(`Model ${modelInfo.id} loaded in ${loadTime.toFixed(2)}ms`);

    return session;
  }

  /**
   * Caches a loaded model with memory management.
   * @param modelInfo - Model information
   * @param session - Loaded inference session
   */
  private cacheModel(modelInfo: ModelInfo, session: InferenceSession): void {
    // Estimate memory usage (rough estimate based on typical model sizes)
    const memoryUsage = 10 * 1024 * 1024; // 10MB per model (placeholder)

    // Evict models if necessary
    this.evictIfNeeded(memoryUsage);

    // Add to cache
    const cached: CachedModel = {
      info: modelInfo,
      session,
      memoryUsage,
      lastAccessTime: Date.now(),
      useCount: 1,
    };

    this.cache.set(modelInfo.id, cached);
    this.currentMemoryUsage += memoryUsage;

    logger.debug(`Model ${modelInfo.id} cached`, {
      memoryMB: memoryUsage / (1024 * 1024),
      totalMemoryMB: this.currentMemoryUsage / (1024 * 1024),
      cacheSize: this.cache.size,
    });
  }

  /**
   * Evicts models from cache if memory or count limits are exceeded.
   * Uses LRU policy with priority support.
   * @param requiredMemory - Memory needed for new model
   */
  private evictIfNeeded(requiredMemory: number): void {
    // Sort cached models by eviction priority (LRU with priority weighting)
    const sortedModels = Array.from(this.cache.entries()).sort((a, b) => {
      const [, modelA] = a;
      const [, modelB] = b;

      // Priority affects eviction order (higher priority = less likely to evict)
      const priorityA = modelA.info.priority ?? 0;
      const priorityB = modelB.info.priority ?? 0;

      if (priorityA !== priorityB) {
        return priorityA - priorityB; // Lower priority first
      }

      // Use LRU for same priority
      return modelA.lastAccessTime - modelB.lastAccessTime;
    });

    // Evict until we have enough memory and cache slots
    while (
      sortedModels.length > 0 &&
      (this.currentMemoryUsage + requiredMemory > this.maxMemoryBytes ||
        this.cache.size >= this.maxCachedModels)
    ) {
      const [id, model] = sortedModels.shift()!;

      logger.debug(`Evicting model ${id}`, {
        memoryMB: model.memoryUsage / (1024 * 1024),
        lastAccess: new Date(model.lastAccessTime).toISOString(),
        useCount: model.useCount,
      });

      this.unload(id);
    }
  }

  /**
   * Unloads a model from cache and frees resources.
   * @param modelId - Model ID to unload
   */
  unload(modelId: string): void {
    const cached = this.cache.get(modelId);
    if (!cached) {
      logger.warn(`Attempted to unload non-cached model: ${modelId}`);
      return;
    }

    // Dispose session
    cached.session.dispose();

    // Update cache
    this.cache.delete(modelId);
    this.currentMemoryUsage -= cached.memoryUsage;

    logger.info(`Model ${modelId} unloaded`, {
      remainingMemoryMB: this.currentMemoryUsage / (1024 * 1024),
      remainingModels: this.cache.size,
    });
  }

  /**
   * Preloads multiple models in parallel.
   * Useful for warming up cache before gameplay.
   * @param modelInfos - Array of models to preload
   * @returns Promise resolving when all models are loaded
   */
  async preload(modelInfos: ModelInfo[]): Promise<void> {
    if (!this.enablePreloading) {
      logger.debug('Preloading disabled, skipping');
      return;
    }

    logger.info(`Preloading ${modelInfos.length} models`);

    const startTime = performance.now();

    await Promise.all(
      modelInfos.map((info) =>
        this.load(info).catch((error) => {
          logger.error(`Failed to preload model ${info.id}`, error);
        })
      )
    );

    const loadTime = performance.now() - startTime;
    logger.info(`Preloaded ${modelInfos.length} models in ${loadTime.toFixed(2)}ms`);
  }

  /**
   * Gets a cached model session if available.
   * @param modelId - Model ID
   * @returns Inference session or undefined if not cached
   */
  get(modelId: string): InferenceSession | undefined {
    const cached = this.cache.get(modelId);
    if (cached) {
      cached.lastAccessTime = Date.now();
      cached.useCount++;
      return cached.session;
    }
    return undefined;
  }

  /**
   * Checks if a model is currently cached.
   * @param modelId - Model ID
   * @returns True if model is in cache
   */
  has(modelId: string): boolean {
    return this.cache.has(modelId);
  }

  /**
   * Gets current memory usage statistics.
   * @returns Memory usage information
   */
  getMemoryUsage(): {
    currentBytes: number;
    currentMB: number;
    maxBytes: number;
    maxMB: number;
    utilization: number;
  } {
    return {
      currentBytes: this.currentMemoryUsage,
      currentMB: this.currentMemoryUsage / (1024 * 1024),
      maxBytes: this.maxMemoryBytes,
      maxMB: this.maxMemoryBytes / (1024 * 1024),
      utilization: this.currentMemoryUsage / this.maxMemoryBytes,
    };
  }

  /**
   * Gets cache statistics.
   * @returns Cache information
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    models: Array<{
      id: string;
      memoryMB: number;
      lastAccess: string;
      useCount: number;
    }>;
  } {
    const models = Array.from(this.cache.entries()).map(([id, model]) => ({
      id,
      memoryMB: model.memoryUsage / (1024 * 1024),
      lastAccess: new Date(model.lastAccessTime).toISOString(),
      useCount: model.useCount,
    }));

    return {
      size: this.cache.size,
      maxSize: this.maxCachedModels,
      models,
    };
  }

  /**
   * Clears all cached models and frees resources.
   */
  clear(): void {
    logger.info('Clearing all cached models');

    for (const [id, model] of this.cache.entries()) {
      model.session.dispose();
      logger.debug(`Disposed model ${id}`);
    }

    this.cache.clear();
    this.loadingPromises.clear();
    this.currentMemoryUsage = 0;

    logger.info('All models cleared');
  }

  /**
   * Disposes of the model manager and all cached models.
   */
  dispose(): void {
    this.clear();
    logger.info('ModelManager disposed');
  }
}
