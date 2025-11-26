/**
 * @module Shaders
 * @description
 * LRU cache for compiled shader chunks with dependency tracking.
 * Improves performance by caching frequently used shader compilations.
 */

import { Logger } from '../core/Logger';

const logger = Logger.create('ShaderChunkCache');

/**
 * Cached shader chunk data
 */
export interface CachedChunk {
  /** Cache key (includes defines and target) */
  key: string;
  /** Compiled shader source */
  compiledSource: string;
  /** Compilation timestamp */
  timestamp: number;
  /** Access count */
  accessCount: number;
  /** Last access time */
  lastAccess: number;
  /** Chunk dependencies */
  dependencies: string[];
  /** Target platform */
  target: string;
  /** Defines used */
  defines: Record<string, string>;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Number of cached entries */
  size: number;
  /** Maximum cache size */
  maxSize: number;
  /** Cache hit count */
  hits: number;
  /** Cache miss count */
  misses: number;
  /** Cache eviction count */
  evictions: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
  /** Total memory used (approximate, in bytes) */
  memoryUsage: number;
}

/**
 * LRU cache node for doubly-linked list
 */
class CacheNode {
  key: string;
  value: CachedChunk;
  prev: CacheNode | null = null;
  next: CacheNode | null = null;

  constructor(key: string, value: CachedChunk) {
    this.key = key;
    this.value = value;
  }
}

/**
 * LRU cache for compiled shader chunks.
 * Implements least-recently-used eviction policy with dependency tracking
 * for efficient shader compilation caching.
 *
 * @example
 * ```typescript
 * // Get cached chunk
 * const cached = ShaderChunkCache.get('pbr-metal-rough');
 * if (cached) {
 *   console.log('Cache hit!');
 * }
 *
 * // Set cached chunk
 * ShaderChunkCache.set('pbr-metal-rough', {
 *   key: 'pbr-metal-rough',
 *   compiledSource: shaderCode,
 *   timestamp: Date.now(),
 *   accessCount: 0,
 *   lastAccess: Date.now(),
 *   dependencies: ['common', 'pbr'],
 *   target: 'glsl',
 *   defines: { USE_METALLIC: '1', USE_ROUGHNESS: '1' }
 * });
 *
 * // Invalidate when chunk changes
 * ShaderChunkCache.invalidate('pbr');
 * ```
 */
export class ShaderChunkCache {
  /**
   * Maximum number of cached entries
   */
  private static maxSize = 256;

  /**
   * Cache storage
   */
  private static cache = new Map<string, CacheNode>();

  /**
   * LRU list head (most recently used)
   */
  private static head: CacheNode | null = null;

  /**
   * LRU list tail (least recently used)
   */
  private static tail: CacheNode | null = null;

  /**
   * Cache statistics
   */
  private static hits = 0;
  private static misses = 0;
  private static evictions = 0;

  /**
   * Get a cached chunk
   *
   * @param key - Cache key
   * @returns Cached chunk or undefined if not found
   *
   * @example
   * ```typescript
   * const key = ShaderChunkCache.generateKey('pbr', 'glsl', { USE_NORMAL_MAP: '1' });
   * const cached = ShaderChunkCache.get(key);
   * ```
   */
  static get(key: string): CachedChunk | undefined {
    const node = this.cache.get(key);

    if (!node) {
      this.misses++;
      return undefined;
    }

    // Update statistics
    this.hits++;
    node.value.accessCount++;
    node.value.lastAccess = Date.now();

    // Move to front (most recently used)
    this.moveToFront(node);

    return node.value;
  }

  /**
   * Set a cached chunk
   *
   * @param key - Cache key
   * @param chunk - Chunk data to cache
   *
   * @example
   * ```typescript
   * const key = ShaderChunkCache.generateKey('lighting', 'wgsl', {});
   * ShaderChunkCache.set(key, cachedChunk);
   * ```
   */
  static set(key: string, chunk: CachedChunk): void {
    // Check if already exists
    let node = this.cache.get(key);

    if (node) {
      // Update existing entry
      node.value = chunk;
      this.moveToFront(node);
      return;
    }

    // Create new entry
    node = new CacheNode(key, chunk);
    this.cache.set(key, node);

    // Add to front of list
    if (!this.head) {
      this.head = this.tail = node;
    } else {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    }

    // Evict if over capacity
    if (this.cache.size > this.maxSize) {
      this.evictLRU();
    }

    logger.debug(`Cached shader chunk: ${key}`);
  }

  /**
   * Invalidate a chunk and all dependents
   *
   * @param name - Chunk name to invalidate
   *
   * @example
   * ```typescript
   * // Invalidate 'common' and all chunks that depend on it
   * ShaderChunkCache.invalidate('common');
   * ```
   */
  static invalidate(name: string): void {
    const keysToRemove: string[] = [];

    // Find all cache entries that depend on this chunk
    for (const [key, node] of this.cache) {
      if (node.value.dependencies.includes(name) || key.includes(name)) {
        keysToRemove.push(key);
      }
    }

    // Remove entries
    for (const key of keysToRemove) {
      const node = this.cache.get(key);
      if (node) {
        this.removeNode(node);
        this.cache.delete(key);
      }
    }

    if (keysToRemove.length > 0) {
      logger.debug(`Invalidated ${keysToRemove.length} cached chunks depending on '${name}'`);
    }
  }

  /**
   * Clear all cached chunks
   */
  static clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    logger.debug('Cleared shader chunk cache');
  }

  /**
   * Get current cache size
   */
  static get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache hit rate
   */
  static get hitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? this.hits / total : 0;
  }

  /**
   * Get cache statistics
   *
   * @returns Cache statistics
   *
   * @example
   * ```typescript
   * const stats = ShaderChunkCache.getStats();
   * console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
   * ```
   */
  static getStats(): CacheStats {
    let memoryUsage = 0;

    for (const node of this.cache.values()) {
      // Approximate memory usage
      memoryUsage += node.value.compiledSource.length * 2; // UTF-16
      memoryUsage += node.key.length * 2;
      memoryUsage += 100; // Overhead for object properties
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: this.hitRate,
      memoryUsage
    };
  }

  /**
   * Set maximum cache size
   *
   * @param size - Maximum number of entries
   */
  static setMaxSize(size: number): void {
    if (size < 1) {
      throw new Error('Max cache size must be at least 1');
    }

    this.maxSize = size;

    // Evict entries if over new limit
    while (this.cache.size > this.maxSize) {
      this.evictLRU();
    }
  }

  /**
   * Generate cache key from chunk name, target, and defines
   *
   * @param chunkName - Chunk name
   * @param target - Target platform (glsl/wgsl)
   * @param defines - Preprocessor defines
   * @returns Cache key
   *
   * @example
   * ```typescript
   * const key = ShaderChunkCache.generateKey('pbr', 'glsl', {
   *   USE_NORMAL_MAP: '1',
   *   USE_AO_MAP: '1'
   * });
   * ```
   */
  static generateKey(
    chunkName: string,
    target: string,
    defines: Record<string, string>
  ): string {
    // Sort defines for consistent keys
    const sortedDefines = Object.keys(defines)
      .sort()
      .map(key => `${key}=${defines[key]}`)
      .join(',');

    return `${chunkName}:${target}:${sortedDefines}`;
  }

  /**
   * Move node to front of LRU list
   */
  private static moveToFront(node: CacheNode): void {
    if (node === this.head) return;

    // Remove from current position
    this.removeNode(node);

    // Add to front
    node.next = this.head;
    node.prev = null;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  /**
   * Remove node from LRU list
   */
  private static removeNode(node: CacheNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = null;
    node.next = null;
  }

  /**
   * Evict least recently used entry
   */
  private static evictLRU(): void {
    if (!this.tail) return;

    const evicted = this.tail;
    this.cache.delete(evicted.key);
    this.removeNode(evicted);
    this.evictions++;

    logger.debug(`Evicted LRU cache entry: ${evicted.key}`);
  }

  /**
   * Get all cached keys
   */
  static getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Check if key exists in cache
   */
  static has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Reset statistics
   */
  static resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get cache entries sorted by access count
   */
  static getMostUsed(limit: number = 10): CachedChunk[] {
    const entries = Array.from(this.cache.values())
      .map(node => node.value)
      .sort((a, b) => b.accessCount - a.accessCount);

    return entries.slice(0, limit);
  }

  /**
   * Get cache entries sorted by recency
   */
  static getMostRecent(limit: number = 10): CachedChunk[] {
    const entries = Array.from(this.cache.values())
      .map(node => node.value)
      .sort((a, b) => b.lastAccess - a.lastAccess);

    return entries.slice(0, limit);
  }

  /**
   * Prune old entries
   *
   * @param maxAge - Maximum age in milliseconds
   */
  static pruneOld(maxAge: number): number {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const [key, node] of this.cache) {
      const age = now - node.value.timestamp;
      if (age > maxAge) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      const node = this.cache.get(key);
      if (node) {
        this.removeNode(node);
        this.cache.delete(key);
      }
    }

    return keysToRemove.length;
  }
}
