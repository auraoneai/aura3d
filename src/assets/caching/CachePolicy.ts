import { Asset } from '../Asset';
import { Logger } from '../../core/Logger';

const logger = Logger.create('CachePolicy');

/**
 * Cache eviction strategy
 */
export enum EvictionStrategy {
  /** Least Recently Used */
  LRU = 'lru',
  /** Least Frequently Used */
  LFU = 'lfu',
  /** First In First Out */
  FIFO = 'fifo',
  /** Time To Live */
  TTL = 'ttl',
  /** Size based */
  SIZE = 'size'
}

/**
 * Cache policy options
 */
export interface CachePolicyOptions {
  /** Eviction strategy */
  strategy?: EvictionStrategy;
  /** Time to live in milliseconds */
  ttl?: number;
  /** Maximum cache size in bytes */
  maxSize?: number;
  /** Maximum number of entries */
  maxEntries?: number;
  /** Priority function for custom eviction */
  priorityFn?: (asset: Asset) => number;
}

/**
 * Cache entry metadata
 */
export interface CacheEntryMeta {
  /** Entry key */
  key: string;
  /** Asset reference */
  asset: Asset;
  /** Creation timestamp */
  createdAt: number;
  /** Last access timestamp */
  lastAccess: number;
  /** Access count */
  accessCount: number;
  /** Memory size */
  size: number;
  /** Priority score */
  priority: number;
}

/**
 * Cache eviction policies
 * Implements various eviction strategies for cache management
 */
export class CachePolicy {
  private strategy: EvictionStrategy;
  private ttl: number;
  private maxSize: number;
  private maxEntries: number;
  private priorityFn?: (asset: Asset) => number;

  /**
   * Creates a new cache policy
   */
  constructor(options: CachePolicyOptions = {}) {
    this.strategy = options.strategy || EvictionStrategy.LRU;
    this.ttl = options.ttl || 3600000;
    this.maxSize = options.maxSize || 512 * 1024 * 1024;
    this.maxEntries = options.maxEntries || Infinity;
    this.priorityFn = options.priorityFn;
  }

  /**
   * Determines if an entry should be evicted
   */
  shouldEvict(
    entry: CacheEntryMeta,
    currentSize: number,
    currentEntries: number
  ): boolean {
    if (currentEntries > this.maxEntries || currentSize > this.maxSize) {
      return true;
    }

    if (this.strategy === EvictionStrategy.TTL) {
      const age = Date.now() - entry.createdAt;
      return age > this.ttl;
    }

    return false;
  }

  /**
   * Selects entries to evict based on policy
   */
  selectForEviction(
    entries: CacheEntryMeta[],
    targetCount: number
  ): CacheEntryMeta[] {
    const sorted = this.sortByPriority(entries);
    return sorted.slice(0, targetCount);
  }

  /**
   * Sorts entries by eviction priority (lowest priority first)
   */
  private sortByPriority(entries: CacheEntryMeta[]): CacheEntryMeta[] {
    const now = Date.now();

    return entries.sort((a, b) => {
      switch (this.strategy) {
        case EvictionStrategy.LRU:
          return a.lastAccess - b.lastAccess;

        case EvictionStrategy.LFU:
          return a.accessCount - b.accessCount;

        case EvictionStrategy.FIFO:
          return a.createdAt - b.createdAt;

        case EvictionStrategy.TTL:
          return (now - a.createdAt) - (now - b.createdAt);

        case EvictionStrategy.SIZE:
          return b.size - a.size;

        default:
          if (this.priorityFn) {
            const priorityA = this.priorityFn(a.asset);
            const priorityB = this.priorityFn(b.asset);
            return priorityA - priorityB;
          }
          return a.lastAccess - b.lastAccess;
      }
    });
  }

  /**
   * Updates entry metadata on access
   */
  onAccess(entry: CacheEntryMeta): void {
    entry.lastAccess = Date.now();
    entry.accessCount++;

    if (this.priorityFn) {
      entry.priority = this.priorityFn(entry.asset);
    }
  }

  /**
   * Gets the eviction strategy
   */
  getStrategy(): EvictionStrategy {
    return this.strategy;
  }

  /**
   * Sets the eviction strategy
   */
  setStrategy(strategy: EvictionStrategy): void {
    this.strategy = strategy;
  }

  /**
   * Gets the TTL
   */
  getTTL(): number {
    return this.ttl;
  }

  /**
   * Sets the TTL
   */
  setTTL(ms: number): void {
    this.ttl = ms;
  }

  /**
   * Gets the maximum cache size
   */
  getMaxSize(): number {
    return this.maxSize;
  }

  /**
   * Sets the maximum cache size
   */
  setMaxSize(bytes: number): void {
    this.maxSize = bytes;
  }

  /**
   * Gets the maximum entry count
   */
  getMaxEntries(): number {
    return this.maxEntries;
  }

  /**
   * Sets the maximum entry count
   */
  setMaxEntries(count: number): void {
    this.maxEntries = count;
  }
}
