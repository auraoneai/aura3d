import { Asset } from '../Asset';
import { Logger } from '../../core/Logger';

const logger = Logger.create('MemoryCache');

/**
 * Cache entry with LRU tracking
 */
interface CacheEntry<T extends Asset = Asset> {
  /** Cached asset */
  asset: T;
  /** Last access timestamp */
  lastAccess: number;
  /** Access count */
  accessCount: number;
  /** Entry creation timestamp */
  createdAt: number;
  /** Memory size in bytes */
  size: number;
  /** Entry key */
  key: string;
}

/**
 * Memory cache statistics
 */
export interface MemoryCacheStats {
  /** Number of cached entries */
  entryCount: number;
  /** Current memory usage in bytes */
  memoryUsage: number;
  /** Maximum memory budget in bytes */
  maxMemory: number;
  /** Memory usage percentage (0-100) */
  memoryPercent: number;
  /** Cache hit count */
  hits: number;
  /** Cache miss count */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Eviction count */
  evictions: number;
}

/**
 * Memory cache options
 */
export interface MemoryCacheOptions {
  /** Maximum memory budget in bytes (default: 512MB) */
  maxMemory?: number;
  /** Maximum number of entries (default: unlimited) */
  maxEntries?: number;
  /** Auto-evict when over budget (default: true) */
  autoEvict?: boolean;
  /** Target memory after eviction (percentage of max, default: 80) */
  evictionTarget?: number;
}

/**
 * In-memory LRU cache with memory budget
 * Provides fast asset caching with automatic eviction
 */
export class MemoryCache<T extends Asset = Asset> {
  private entries: Map<string, CacheEntry<T>> = new Map();
  private accessOrder: string[] = [];
  private maxMemory: number;
  private maxEntries: number;
  private autoEvict: boolean;
  private evictionTarget: number;

  private memoryUsage: number = 0;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  /**
   * Creates a new memory cache
   */
  constructor(options: MemoryCacheOptions = {}) {
    this.maxMemory = options.maxMemory || 512 * 1024 * 1024;
    this.maxEntries = options.maxEntries || Infinity;
    this.autoEvict = options.autoEvict !== false;
    this.evictionTarget = options.evictionTarget || 80;
  }

  /**
   * Gets an asset from cache
   */
  get(key: string): T | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    entry.lastAccess = Date.now();
    entry.accessCount++;
    this.stats.hits++;

    this.updateAccessOrder(key);

    return entry.asset;
  }

  /**
   * Adds an asset to cache
   */
  set(key: string, asset: T): boolean {
    if (asset.isDisposed) {
      logger.warn(`Cannot cache disposed asset: ${key}`);
      return false;
    }

    const existing = this.entries.get(key);
    if (existing) {
      this.memoryUsage -= existing.size;
    }

    const size = asset.getMemorySize();

    if (this.autoEvict) {
      while (
        (this.memoryUsage + size > this.maxMemory || this.entries.size >= this.maxEntries) &&
        this.entries.size > 0
      ) {
        this.evictLRU();
      }
    }

    if (this.memoryUsage + size > this.maxMemory) {
      logger.warn(`Cannot cache asset ${key}: would exceed memory budget`);
      return false;
    }

    const entry: CacheEntry<T> = {
      asset,
      lastAccess: Date.now(),
      accessCount: 1,
      createdAt: Date.now(),
      size,
      key
    };

    this.entries.set(key, entry);
    this.memoryUsage += size;
    this.updateAccessOrder(key);

    logger.debug(`Cached asset: ${key} (${size} bytes, ${this.memoryUsage} / ${this.maxMemory} total)`);

    return true;
  }

  /**
   * Checks if key exists in cache
   */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * Removes an asset from cache
   */
  delete(key: string): boolean {
    const entry = this.entries.get(key);

    if (!entry) {
      return false;
    }

    this.entries.delete(key);
    this.memoryUsage -= entry.size;

    const index = this.accessOrder.indexOf(key);
    if (index >= 0) {
      this.accessOrder.splice(index, 1);
    }

    logger.debug(`Removed from cache: ${key}`);

    return true;
  }

  /**
   * Clears all cached assets
   */
  clear(dispose: boolean = false): void {
    if (dispose) {
      for (const entry of this.entries.values()) {
        entry.asset.dispose();
      }
    }

    this.entries.clear();
    this.accessOrder = [];
    this.memoryUsage = 0;

    logger.debug('Cache cleared');
  }

  /**
   * Evicts least recently used asset
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    const lruKey = this.accessOrder[0];
    this.delete(lruKey);
    this.stats.evictions++;
  }

  /**
   * Updates access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index >= 0) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Evicts assets until memory usage is below target
   */
  evictToTarget(): number {
    const targetMemory = this.maxMemory * (this.evictionTarget / 100);
    let evicted = 0;

    while (this.memoryUsage > targetMemory && this.entries.size > 0) {
      this.evictLRU();
      evicted++;
    }

    if (evicted > 0) {
      logger.info(`Evicted ${evicted} assets to reach ${this.evictionTarget}% memory target`);
    }

    return evicted;
  }

  /**
   * Evicts assets older than max age
   */
  evictOlderThan(maxAgeMs: number): number {
    const now = Date.now();
    const toEvict: string[] = [];

    for (const [key, entry] of this.entries.entries()) {
      if (now - entry.lastAccess > maxAgeMs) {
        toEvict.push(key);
      }
    }

    for (const key of toEvict) {
      this.delete(key);
    }

    this.stats.evictions += toEvict.length;

    if (toEvict.length > 0) {
      logger.info(`Evicted ${toEvict.length} stale assets`);
    }

    return toEvict.length;
  }

  /**
   * Gets cache statistics
   */
  getStats(): MemoryCacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    return {
      entryCount: this.entries.size,
      memoryUsage: this.memoryUsage,
      maxMemory: this.maxMemory,
      memoryPercent: (this.memoryUsage / this.maxMemory) * 100,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      evictions: this.stats.evictions
    };
  }

  /**
   * Resets cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  /**
   * Gets all cached keys
   */
  keys(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Gets all cached assets
   */
  values(): T[] {
    return Array.from(this.entries.values()).map(e => e.asset);
  }

  /**
   * Gets cache size
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Gets current memory usage
   */
  getMemoryUsage(): number {
    return this.memoryUsage;
  }

  /**
   * Gets memory budget
   */
  getMaxMemory(): number {
    return this.maxMemory;
  }

  /**
   * Sets memory budget
   */
  setMaxMemory(bytes: number): void {
    this.maxMemory = bytes;

    if (this.autoEvict && this.memoryUsage > this.maxMemory) {
      this.evictToTarget();
    }
  }

  /**
   * Disposes the cache
   */
  dispose(): void {
    this.clear(true);
  }
}
