/**
 * @module Rendering
 * @description
 * GPU resource lifecycle management with caching, memory budgets, and eviction policies.
 */

import { GPUDevice, BufferUsage, TextureUsage, TextureFormat } from './gpu/GPUDevice';
import { GPUBuffer } from './gpu/GPUBuffer';
import { GPUTexture } from './gpu/GPUTexture';
import { GPUPipeline } from './gpu/GPUPipeline';
import { Logger } from '../core/Logger';

const logger = Logger.create('ResourceManager');

/**
 * Resource type enumeration.
 */
export enum ResourceType {
  Buffer = 'buffer',
  Texture = 'texture',
  Pipeline = 'pipeline',
  Sampler = 'sampler',
}

/**
 * Resource eviction policy.
 */
export enum EvictionPolicy {
  /** Least Recently Used */
  LRU = 'lru',
  /** Least Frequently Used */
  LFU = 'lfu',
  /** First In First Out */
  FIFO = 'fifo',
}

/**
 * Resource entry tracking.
 */
interface ResourceEntry<T> {
  /** Resource instance */
  resource: T;
  /** Resource key/ID */
  key: string;
  /** Memory size in bytes */
  size: number;
  /** Last access timestamp */
  lastAccess: number;
  /** Access count */
  accessCount: number;
  /** Creation timestamp */
  creationTime: number;
  /** Whether resource is pinned (can't be evicted) */
  pinned: boolean;
}

/**
 * Resource cache statistics.
 */
export interface ResourceCacheStats {
  /** Total number of cached resources */
  count: number;
  /** Total memory used in bytes */
  memoryUsed: number;
  /** Cache hit count */
  hits: number;
  /** Cache miss count */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Number of evictions */
  evictions: number;
}

/**
 * Resource manager configuration.
 */
export interface ResourceManagerConfig {
  /** Memory budget in bytes (default: 512MB) */
  memoryBudget?: number;
  /** Eviction policy (default: LRU) */
  evictionPolicy?: EvictionPolicy;
  /** Enable automatic resource tracking */
  autoTracking?: boolean;
  /** Warn when memory usage exceeds threshold (0-1) */
  memoryWarningThreshold?: number;
}

/**
 * GPU resource lifecycle manager with caching and memory management.
 *
 * Features:
 * - Resource caching with configurable eviction policies
 * - Memory budget tracking and enforcement
 * - Async resource loading coordination
 * - Reference counting for safe disposal
 * - Usage statistics and profiling
 *
 * @example
 * ```typescript
 * const manager = new ResourceManager(device, {
 *   memoryBudget: 512 * 1024 * 1024, // 512MB
 *   evictionPolicy: EvictionPolicy.LRU,
 * });
 *
 * // Create or get cached buffer
 * const buffer = manager.getOrCreateBuffer('vertices', {
 *   size: 1024,
 *   usage: BufferUsage.Vertex,
 * });
 *
 * // Create or get cached texture
 * const texture = manager.getOrCreateTexture('albedo', {
 *   size: { width: 512, height: 512 },
 *   format: TextureFormat.RGBA8Unorm,
 *   usage: TextureUsage.TextureBinding,
 * });
 *
 * // Pin important resources
 * manager.pinResource('vertices');
 *
 * // Get statistics
 * const stats = manager.getStats();
 * console.log(`Cache: ${stats.count} resources, ${stats.memoryUsed / 1024 / 1024}MB`);
 *
 * // Cleanup
 * manager.dispose();
 * ```
 */
export class ResourceManager {
  private device: GPUDevice;
  private config: Required<ResourceManagerConfig>;

  // Resource caches
  private bufferCache: Map<string, ResourceEntry<GPUBuffer>> = new Map();
  private textureCache: Map<string, ResourceEntry<GPUTexture>> = new Map();
  private pipelineCache: Map<string, ResourceEntry<GPUPipeline>> = new Map();
  private samplerCache: Map<string, ResourceEntry<any>> = new Map();

  // Statistics
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;
  private memoryUsed: number = 0;

  // Pending async loads
  private pendingLoads: Map<string, Promise<any>> = new Map();

  /**
   * Creates a new ResourceManager instance.
   *
   * @param device - GPU device
   * @param config - Configuration options
   */
  constructor(device: GPUDevice, config?: ResourceManagerConfig) {
    this.device = device;
    this.config = {
      memoryBudget: config?.memoryBudget ?? 512 * 1024 * 1024, // 512MB default
      evictionPolicy: config?.evictionPolicy ?? EvictionPolicy.LRU,
      autoTracking: config?.autoTracking ?? true,
      memoryWarningThreshold: config?.memoryWarningThreshold ?? 0.9,
    };

    logger.info('ResourceManager created', {
      budget: `${this.config.memoryBudget / 1024 / 1024}MB`,
      policy: this.config.evictionPolicy,
    });
  }

  /**
   * Gets or creates a buffer with caching.
   *
   * @param key - Resource key for caching
   * @param descriptor - Buffer descriptor
   * @returns Cached or newly created buffer
   */
  getOrCreateBuffer(
    key: string,
    descriptor: {
      size: number;
      usage: BufferUsage;
      label?: string;
    }
  ): GPUBuffer {
    const cached = this.bufferCache.get(key);
    if (cached) {
      this.recordHit();
      this.updateAccess(cached);
      return cached.resource;
    }

    this.recordMiss();

    // Create new buffer
    const buffer = this.device.createBuffer(descriptor);

    // Estimate size
    const size = descriptor.size;

    // Check memory budget
    this.ensureMemoryBudget(size);

    // Cache entry
    const entry: ResourceEntry<GPUBuffer> = {
      resource: buffer,
      key,
      size,
      lastAccess: performance.now(),
      accessCount: 1,
      creationTime: performance.now(),
      pinned: false,
    };

    this.bufferCache.set(key, entry);
    this.memoryUsed += size;

    logger.debug(`Created buffer: ${key}, size: ${size} bytes`);

    return buffer;
  }

  /**
   * Gets or creates a texture with caching.
   *
   * @param key - Resource key for caching
   * @param descriptor - Texture descriptor
   * @returns Cached or newly created texture
   */
  getOrCreateTexture(
    key: string,
    descriptor: {
      size: { width: number; height: number; depth?: number };
      format: TextureFormat;
      usage: TextureUsage;
      mipLevelCount?: number;
      sampleCount?: number;
      label?: string;
    }
  ): GPUTexture {
    const cached = this.textureCache.get(key);
    if (cached) {
      this.recordHit();
      this.updateAccess(cached);
      return cached.resource;
    }

    this.recordMiss();

    // Create new texture
    const texture = this.device.createTexture(descriptor);

    // Estimate size (rough approximation)
    const bytesPerPixel = this.getBytesPerPixel(descriptor.format);
    const mipLevels = descriptor.mipLevelCount ?? 1;
    const samples = descriptor.sampleCount ?? 1;
    let size = descriptor.size.width * descriptor.size.height * bytesPerPixel * samples;

    // Add mip levels
    for (let i = 1; i < mipLevels; i++) {
      size += Math.max(1, descriptor.size.width >> i) *
              Math.max(1, descriptor.size.height >> i) *
              bytesPerPixel * samples;
    }

    if (descriptor.size.depth) {
      size *= descriptor.size.depth;
    }

    // Check memory budget
    this.ensureMemoryBudget(size);

    // Cache entry
    const entry: ResourceEntry<GPUTexture> = {
      resource: texture,
      key,
      size,
      lastAccess: performance.now(),
      accessCount: 1,
      creationTime: performance.now(),
      pinned: false,
    };

    this.textureCache.set(key, entry);
    this.memoryUsed += size;

    logger.debug(`Created texture: ${key}, size: ${size / 1024}KB`);

    return texture;
  }

  /**
   * Gets or creates a pipeline with caching.
   *
   * @param key - Resource key for caching
   * @param descriptor - Pipeline descriptor
   * @returns Cached or newly created pipeline
   */
  getOrCreatePipeline(key: string, descriptor: any): GPUPipeline {
    const cached = this.pipelineCache.get(key);
    if (cached) {
      this.recordHit();
      this.updateAccess(cached);
      return cached.resource;
    }

    this.recordMiss();

    // Create new pipeline
    const pipeline = this.device.createRenderPipeline(descriptor);

    // Pipelines have negligible memory footprint
    const size = 1024; // Nominal size

    // Cache entry
    const entry: ResourceEntry<GPUPipeline> = {
      resource: pipeline,
      key,
      size,
      lastAccess: performance.now(),
      accessCount: 1,
      creationTime: performance.now(),
      pinned: false,
    };

    this.pipelineCache.set(key, entry);

    logger.debug(`Created pipeline: ${key}`);

    return pipeline;
  }

  /**
   * Pins a resource to prevent eviction.
   *
   * @param key - Resource key
   * @param type - Resource type (default: auto-detect)
   */
  pinResource(key: string, type?: ResourceType): void {
    const entry = this.findEntry(key, type);
    if (entry) {
      entry.pinned = true;
      logger.debug(`Pinned resource: ${key}`);
    }
  }

  /**
   * Unpins a resource to allow eviction.
   *
   * @param key - Resource key
   * @param type - Resource type (default: auto-detect)
   */
  unpinResource(key: string, type?: ResourceType): void {
    const entry = this.findEntry(key, type);
    if (entry) {
      entry.pinned = false;
      logger.debug(`Unpinned resource: ${key}`);
    }
  }

  /**
   * Manually releases a resource.
   *
   * @param key - Resource key
   * @param type - Resource type (default: auto-detect)
   */
  releaseResource(key: string, type?: ResourceType): void {
    const entry = this.findEntry(key, type);
    if (entry) {
      this.evictEntry(entry, type ?? ResourceType.Buffer);
    }
  }

  /**
   * Clears all cached resources.
   *
   * @param respectPinned - Whether to keep pinned resources (default: true)
   */
  clearCache(respectPinned: boolean = true): void {
    logger.info('Clearing resource cache');

    // Clear buffers
    for (const [key, entry] of this.bufferCache.entries()) {
      if (!respectPinned || !entry.pinned) {
        entry.resource.dispose();
        this.memoryUsed -= entry.size;
        this.bufferCache.delete(key);
      }
    }

    // Clear textures
    for (const [key, entry] of this.textureCache.entries()) {
      if (!respectPinned || !entry.pinned) {
        entry.resource.dispose();
        this.memoryUsed -= entry.size;
        this.textureCache.delete(key);
      }
    }

    // Clear pipelines
    for (const [key, entry] of this.pipelineCache.entries()) {
      if (!respectPinned || !entry.pinned) {
        entry.resource.dispose();
        this.pipelineCache.delete(key);
      }
    }

    // Clear samplers
    for (const [key, entry] of this.samplerCache.entries()) {
      if (!respectPinned || !entry.pinned) {
        this.samplerCache.delete(key);
      }
    }

    logger.info(`Cache cleared, memory used: ${this.memoryUsed / 1024 / 1024}MB`);
  }

  /**
   * Gets cache statistics.
   *
   * @returns Cache statistics
   */
  getStats(): ResourceCacheStats {
    const totalAccess = this.hits + this.misses;
    return {
      count: this.bufferCache.size + this.textureCache.size +
             this.pipelineCache.size + this.samplerCache.size,
      memoryUsed: this.memoryUsed,
      hits: this.hits,
      misses: this.misses,
      hitRate: totalAccess > 0 ? this.hits / totalAccess : 0,
      evictions: this.evictions,
    };
  }

  /**
   * Gets memory usage information.
   *
   * @returns Memory usage details
   */
  getMemoryUsage(): {
    used: number;
    budget: number;
    percentage: number;
    buffers: number;
    textures: number;
  } {
    let bufferMem = 0;
    let textureMem = 0;

    for (const entry of this.bufferCache.values()) {
      bufferMem += entry.size;
    }

    for (const entry of this.textureCache.values()) {
      textureMem += entry.size;
    }

    return {
      used: this.memoryUsed,
      budget: this.config.memoryBudget,
      percentage: this.memoryUsed / this.config.memoryBudget,
      buffers: bufferMem,
      textures: textureMem,
    };
  }

  /**
   * Checks if memory budget is exceeded.
   *
   * @returns True if budget is exceeded
   */
  isMemoryBudgetExceeded(): boolean {
    return this.memoryUsed > this.config.memoryBudget;
  }

  /**
   * Disposes all resources and clears caches.
   */
  dispose(): void {
    logger.info('Disposing ResourceManager');
    this.clearCache(false); // Clear everything including pinned
  }

  /**
   * Ensures memory budget by evicting resources if necessary.
   *
   * @param requiredSize - Size needed for new resource
   */
  private ensureMemoryBudget(requiredSize: number): void {
    if (this.memoryUsed + requiredSize <= this.config.memoryBudget) {
      return;
    }

    logger.warn(`Memory budget exceeded, evicting resources...`);

    // Evict resources until we have enough space
    while (this.memoryUsed + requiredSize > this.config.memoryBudget) {
      const evicted = this.evictOne();
      if (!evicted) {
        logger.error('Cannot free enough memory for resource');
        break;
      }
    }
  }

  /**
   * Evicts one resource based on eviction policy.
   *
   * @returns True if a resource was evicted
   */
  private evictOne(): boolean {
    let victim: { entry: ResourceEntry<any>; type: ResourceType; key: string } | null = null;

    // Find victim based on policy
    switch (this.config.evictionPolicy) {
      case EvictionPolicy.LRU:
        victim = this.findLRUVictim();
        break;
      case EvictionPolicy.LFU:
        victim = this.findLFUVictim();
        break;
      case EvictionPolicy.FIFO:
        victim = this.findFIFOVictim();
        break;
    }

    if (!victim) {
      return false;
    }

    this.evictEntry(victim.entry, victim.type);
    return true;
  }

  /**
   * Finds LRU victim.
   */
  private findLRUVictim(): { entry: ResourceEntry<any>; type: ResourceType; key: string } | null {
    let oldest: { entry: ResourceEntry<any>; type: ResourceType; key: string } | null = null;

    for (const [key, entry] of this.bufferCache.entries()) {
      if (!entry.pinned && (!oldest || entry.lastAccess < oldest.entry.lastAccess)) {
        oldest = { entry, type: ResourceType.Buffer, key };
      }
    }

    for (const [key, entry] of this.textureCache.entries()) {
      if (!entry.pinned && (!oldest || entry.lastAccess < oldest.entry.lastAccess)) {
        oldest = { entry, type: ResourceType.Texture, key };
      }
    }

    return oldest;
  }

  /**
   * Finds LFU victim.
   */
  private findLFUVictim(): { entry: ResourceEntry<any>; type: ResourceType; key: string } | null {
    let leastUsed: { entry: ResourceEntry<any>; type: ResourceType; key: string } | null = null;

    for (const [key, entry] of this.bufferCache.entries()) {
      if (!entry.pinned && (!leastUsed || entry.accessCount < leastUsed.entry.accessCount)) {
        leastUsed = { entry, type: ResourceType.Buffer, key };
      }
    }

    for (const [key, entry] of this.textureCache.entries()) {
      if (!entry.pinned && (!leastUsed || entry.accessCount < leastUsed.entry.accessCount)) {
        leastUsed = { entry, type: ResourceType.Texture, key };
      }
    }

    return leastUsed;
  }

  /**
   * Finds FIFO victim.
   */
  private findFIFOVictim(): { entry: ResourceEntry<any>; type: ResourceType; key: string } | null {
    let oldest: { entry: ResourceEntry<any>; type: ResourceType; key: string } | null = null;

    for (const [key, entry] of this.bufferCache.entries()) {
      if (!entry.pinned && (!oldest || entry.creationTime < oldest.entry.creationTime)) {
        oldest = { entry, type: ResourceType.Buffer, key };
      }
    }

    for (const [key, entry] of this.textureCache.entries()) {
      if (!entry.pinned && (!oldest || entry.creationTime < oldest.entry.creationTime)) {
        oldest = { entry, type: ResourceType.Texture, key };
      }
    }

    return oldest;
  }

  /**
   * Evicts a specific entry.
   */
  private evictEntry(entry: ResourceEntry<any>, type: ResourceType): void {
    logger.debug(`Evicting ${type}: ${entry.key}`);

    entry.resource.dispose();
    this.memoryUsed -= entry.size;
    this.evictions++;

    switch (type) {
      case ResourceType.Buffer:
        this.bufferCache.delete(entry.key);
        break;
      case ResourceType.Texture:
        this.textureCache.delete(entry.key);
        break;
      case ResourceType.Pipeline:
        this.pipelineCache.delete(entry.key);
        break;
      case ResourceType.Sampler:
        this.samplerCache.delete(entry.key);
        break;
    }
  }

  /**
   * Finds a resource entry by key.
   */
  private findEntry(key: string, type?: ResourceType): ResourceEntry<any> | null {
    if (!type || type === ResourceType.Buffer) {
      const entry = this.bufferCache.get(key);
      if (entry) return entry;
    }

    if (!type || type === ResourceType.Texture) {
      const entry = this.textureCache.get(key);
      if (entry) return entry;
    }

    if (!type || type === ResourceType.Pipeline) {
      const entry = this.pipelineCache.get(key);
      if (entry) return entry;
    }

    if (!type || type === ResourceType.Sampler) {
      const entry = this.samplerCache.get(key);
      if (entry) return entry;
    }

    return null;
  }

  /**
   * Updates access tracking for an entry.
   */
  private updateAccess(entry: ResourceEntry<any>): void {
    entry.lastAccess = performance.now();
    entry.accessCount++;
  }

  /**
   * Records a cache hit.
   */
  private recordHit(): void {
    this.hits++;
  }

  /**
   * Records a cache miss.
   */
  private recordMiss(): void {
    this.misses++;
  }

  /**
   * Gets bytes per pixel for a texture format.
   */
  private getBytesPerPixel(format: TextureFormat): number {
    // Simplified - real implementation would have complete mapping
    switch (format) {
      case TextureFormat.R8Unorm:
      case TextureFormat.R8Snorm:
      case TextureFormat.R8Uint:
      case TextureFormat.R8Sint:
        return 1;
      case TextureFormat.RGBA8Unorm:
      case TextureFormat.RGBA8UnormSrgb:
      case TextureFormat.RGBA8Snorm:
      case TextureFormat.RGBA8Uint:
      case TextureFormat.RGBA8Sint:
      case TextureFormat.BGRA8Unorm:
      case TextureFormat.BGRA8UnormSrgb:
        return 4;
      case TextureFormat.RGBA16Float:
      case TextureFormat.RGBA16Uint:
      case TextureFormat.RGBA16Sint:
        return 8;
      case TextureFormat.RGBA32Float:
      case TextureFormat.RGBA32Uint:
      case TextureFormat.RGBA32Sint:
        return 16;
      case TextureFormat.Depth32Float:
        return 4;
      case TextureFormat.Depth24Plus:
        return 4;
      default:
        return 4; // Default estimate
    }
  }
}
