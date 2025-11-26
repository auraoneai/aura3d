import { Asset, AssetLoadState } from './Asset';

/**
 * Asset cache eviction policy
 */
export enum AssetEvictionPolicy {
  /** Least Recently Used */
  LRU = 'lru',
  /** Least Frequently Used */
  LFU = 'lfu',
  /** First In First Out */
  FIFO = 'fifo',
  /** No automatic eviction */
  NONE = 'none'
}

/**
 * Cache entry metadata
 */
interface CacheEntry<T extends Asset = Asset> {
  /** The cached asset */
  asset: T;
  /** Last access timestamp */
  lastAccess: number;
  /** Access count */
  accessCount: number;
  /** Entry creation timestamp */
  createdAt: number;
  /** Memory size in bytes */
  size: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total number of cached assets */
  size: number;
  /** Total memory usage in bytes */
  memoryUsage: number;
  /** Maximum memory budget in bytes */
  maxMemory: number;
  /** Cache hit count */
  hits: number;
  /** Cache miss count */
  misses: number;
  /** Eviction count */
  evictions: number;
  /** Hit rate (0-1) */
  hitRate: number;
}

/**
 * Cache options
 */
export interface CacheOptions {
  /** Maximum memory budget in bytes (default: 512MB) */
  maxMemory?: number;
  /** Eviction policy (default: LRU) */
  evictionPolicy?: AssetEvictionPolicy;
  /** Maximum number of assets to cache (default: unlimited) */
  maxEntries?: number;
  /** Enable automatic memory monitoring */
  autoMonitor?: boolean;
  /** Memory check interval in milliseconds */
  monitorInterval?: number;
}

/**
 * In-memory asset cache with:
 * - LRU/LFU/FIFO eviction policies
 * - Memory budget management
 * - Automatic eviction when over budget
 * - Cache statistics and monitoring
 * - Preloading support
 *
 * @example
 * ```typescript
 * const cache = new AssetCache({
 *   maxMemory: 512 * 1024 * 1024, // 512MB
 *   evictionPolicy: AssetEvictionPolicy.LRU,
 *   autoMonitor: true
 * });
 *
 * // Add asset to cache
 * cache.set('texture1', textureAsset);
 *
 * // Get asset from cache
 * const asset = cache.get('texture1');
 *
 * // Check cache stats
 * const stats = cache.getStats();
 * console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
 * console.log(`Memory: ${(stats.memoryUsage / 1024 / 1024).toFixed(1)}MB`);
 * ```
 */
export class AssetCache<T extends Asset = Asset> {
  /** Cache entries by asset ID */
  private entries: Map<string, CacheEntry<T>> = new Map();

  /** Cache options */
  private options: Required<CacheOptions>;

  /** Cache statistics */
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  /** Current memory usage in bytes */
  private memoryUsage: number = 0;

  /** Memory monitor interval ID */
  private monitorIntervalId: number | null = null;

  /** Insertion order for FIFO */
  private insertionOrder: string[] = [];

  /**
   * Creates a new asset cache
   * @param options - Cache options
   */
  constructor(options: CacheOptions = {}) {
    this.options = {
      maxMemory: options.maxMemory || 512 * 1024 * 1024, // 512MB
      evictionPolicy: options.evictionPolicy || AssetEvictionPolicy.LRU,
      maxEntries: options.maxEntries || Infinity,
      autoMonitor: options.autoMonitor !== false,
      monitorInterval: options.monitorInterval || 5000
    };

    if (this.options.autoMonitor) {
      this.startMonitoring();
    }
  }

  /**
   * Gets an asset from the cache
   * @param id - Asset ID
   * @returns The cached asset or undefined
   */
  get(id: string): T | undefined {
    const entry = this.entries.get(id);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Update access metadata
    entry.lastAccess = Date.now();
    entry.accessCount++;

    this.stats.hits++;

    return entry.asset;
  }

  /**
   * Adds an asset to the cache
   * @param id - Asset ID
   * @param asset - Asset to cache
   * @returns Whether the asset was cached
   */
  set(id: string, asset: T): boolean {
    // Don't cache disposed assets
    if (asset.isDisposed) {
      return false;
    }

    // Check if already cached
    if (this.entries.has(id)) {
      const entry = this.entries.get(id)!;
      entry.asset = asset;
      entry.lastAccess = Date.now();
      entry.accessCount++;
      return true;
    }

    const size = asset.getMemorySize();

    // Check max entries limit
    if (this.entries.size >= this.options.maxEntries) {
      this.evictOne();
    }

    // Evict until we have enough space
    while (
      this.memoryUsage + size > this.options.maxMemory &&
      this.entries.size > 0
    ) {
      this.evictOne();
    }

    // Still not enough space after evicting everything?
    if (this.memoryUsage + size > this.options.maxMemory) {
      return false;
    }

    // Create cache entry
    const entry: CacheEntry<T> = {
      asset,
      lastAccess: Date.now(),
      accessCount: 1,
      createdAt: Date.now(),
      size
    };

    this.entries.set(id, entry);
    this.insertionOrder.push(id);
    this.memoryUsage += size;

    return true;
  }

  /**
   * Checks if an asset is cached
   * @param id - Asset ID
   */
  has(id: string): boolean {
    return this.entries.has(id);
  }

  /**
   * Removes an asset from the cache
   * @param id - Asset ID
   * @returns Whether the asset was removed
   */
  delete(id: string): boolean {
    const entry = this.entries.get(id);

    if (!entry) {
      return false;
    }

    this.entries.delete(id);
    this.memoryUsage -= entry.size;

    // Remove from insertion order
    const index = this.insertionOrder.indexOf(id);
    if (index >= 0) {
      this.insertionOrder.splice(index, 1);
    }

    return true;
  }

  /**
   * Clears all cached assets
   * @param dispose - Whether to dispose assets
   */
  clear(dispose: boolean = false): void {
    if (dispose) {
      for (const entry of this.entries.values()) {
        entry.asset.dispose();
      }
    }

    this.entries.clear();
    this.insertionOrder = [];
    this.memoryUsage = 0;
  }

  /**
   * Evicts one asset based on eviction policy
   * @private
   */
  private evictOne(): void {
    let victimId: string | null = null;

    switch (this.options.evictionPolicy) {
      case AssetEvictionPolicy.LRU:
        victimId = this.findLRUVictim();
        break;
      case AssetEvictionPolicy.LFU:
        victimId = this.findLFUVictim();
        break;
      case AssetEvictionPolicy.FIFO:
        victimId = this.findFIFOVictim();
        break;
      case AssetEvictionPolicy.NONE:
        return;
    }

    if (victimId) {
      this.delete(victimId);
      this.stats.evictions++;
    }
  }

  /**
   * Finds LRU victim
   * @private
   */
  private findLRUVictim(): string | null {
    let oldestTime = Infinity;
    let victimId: string | null = null;

    for (const [id, entry] of this.entries.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        victimId = id;
      }
    }

    return victimId;
  }

  /**
   * Finds LFU victim
   * @private
   */
  private findLFUVictim(): string | null {
    let lowestCount = Infinity;
    let victimId: string | null = null;

    for (const [id, entry] of this.entries.entries()) {
      if (entry.accessCount < lowestCount) {
        lowestCount = entry.accessCount;
        victimId = id;
      }
    }

    return victimId;
  }

  /**
   * Finds FIFO victim
   * @private
   */
  private findFIFOVictim(): string | null {
    return this.insertionOrder.length > 0 ? this.insertionOrder[0] : null;
  }

  /**
   * Evicts assets until memory usage is below target
   * @param targetMemory - Target memory usage in bytes
   * @returns Number of assets evicted
   */
  evictToMemory(targetMemory: number): number {
    let evicted = 0;

    while (this.memoryUsage > targetMemory && this.entries.size > 0) {
      this.evictOne();
      evicted++;
    }

    return evicted;
  }

  /**
   * Evicts assets that haven't been accessed recently
   * @param maxAge - Maximum age in milliseconds
   * @returns Number of assets evicted
   */
  evictStale(maxAge: number): number {
    const now = Date.now();
    const staleIds: string[] = [];

    for (const [id, entry] of this.entries.entries()) {
      if (now - entry.lastAccess > maxAge) {
        staleIds.push(id);
      }
    }

    for (const id of staleIds) {
      this.delete(id);
    }

    this.stats.evictions += staleIds.length;

    return staleIds.length;
  }

  /**
   * Preloads assets into the cache
   * @param assets - Array of assets to preload
   */
  preload(assets: T[]): void {
    for (const asset of assets) {
      this.set(asset.id, asset);
    }
  }

  /**
   * Gets cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    return {
      size: this.entries.size,
      memoryUsage: this.memoryUsage,
      maxMemory: this.options.maxMemory,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate
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
   * Gets all cached asset IDs
   */
  keys(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Gets all cached assets
   */
  values(): T[] {
    return Array.from(this.entries.values()).map(entry => entry.asset);
  }

  /**
   * Gets the number of cached assets
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Gets current memory usage in bytes
   */
  getMemoryUsage(): number {
    return this.memoryUsage;
  }

  /**
   * Gets memory usage as percentage of budget
   */
  getMemoryUsagePercent(): number {
    return (this.memoryUsage / this.options.maxMemory) * 100;
  }

  /**
   * Checks if cache is over budget
   */
  isOverBudget(): boolean {
    return this.memoryUsage > this.options.maxMemory;
  }

  /**
   * Starts automatic memory monitoring
   * @private
   */
  private startMonitoring(): void {
    if (this.monitorIntervalId !== null) {
      return;
    }

    this.monitorIntervalId = window.setInterval(() => {
      this.performMonitoring();
    }, this.options.monitorInterval);
  }

  /**
   * Stops automatic memory monitoring
   */
  stopMonitoring(): void {
    if (this.monitorIntervalId !== null) {
      clearInterval(this.monitorIntervalId);
      this.monitorIntervalId = null;
    }
  }

  /**
   * Performs monitoring check
   * @private
   */
  private performMonitoring(): void {
    // Recalculate memory usage
    let actualMemory = 0;
    const toRemove: string[] = [];

    for (const [id, entry] of this.entries.entries()) {
      // Check if asset was disposed externally
      if (entry.asset.isDisposed) {
        toRemove.push(id);
      } else {
        actualMemory += entry.size;
      }
    }

    // Remove disposed assets
    for (const id of toRemove) {
      this.delete(id);
    }

    this.memoryUsage = actualMemory;

    // Evict if over budget
    if (this.isOverBudget()) {
      this.evictToMemory(this.options.maxMemory * 0.8); // Evict to 80%
    }
  }

  /**
   * Disposes the cache
   */
  dispose(): void {
    this.stopMonitoring();
    this.clear(true);
  }
}
