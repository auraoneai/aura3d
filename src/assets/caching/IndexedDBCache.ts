import { Asset } from '../Asset';
import { Logger } from '../../core/Logger';

const logger = Logger.create('IndexedDBCache');

/**
 * IndexedDB cache entry
 */
interface IDBCacheEntry {
  /** Entry key */
  key: string;
  /** Serialized asset data */
  data: any;
  /** Asset type name */
  type: string;
  /** Timestamp */
  timestamp: number;
  /** Size in bytes */
  size: number;
  /** Metadata */
  metadata?: any;
}

/**
 * IndexedDB cache options
 */
export interface IndexedDBCacheOptions {
  /** Database name */
  dbName?: string;
  /** Database version */
  dbVersion?: number;
  /** Object store name */
  storeName?: string;
  /** Maximum cache size in bytes */
  maxSize?: number;
}

/**
 * Persistent IndexedDB cache for assets
 * Provides offline caching and persistence across sessions
 */
export class IndexedDBCache {
  private dbName: string;
  private dbVersion: number;
  private storeName: string;
  private maxSize: number;
  private db: IDBDatabase | null = null;
  private initialized: boolean = false;

  /**
   * Creates a new IndexedDB cache
   */
  constructor(options: IndexedDBCacheOptions = {}) {
    this.dbName = options.dbName || 'G3DAssetCache';
    this.dbVersion = options.dbVersion || 1;
    this.storeName = options.storeName || 'assets';
    this.maxSize = options.maxSize || 1024 * 1024 * 1024;
  }

  /**
   * Initializes the IndexedDB connection
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!('indexedDB' in window)) {
      throw new Error('IndexedDB not supported');
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        logger.error('Failed to open IndexedDB', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        logger.info('IndexedDB cache initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
      };
    });
  }

  /**
   * Gets an asset from cache
   */
  async get(key: string): Promise<any | undefined> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as IDBCacheEntry | undefined;
        resolve(entry?.data);
      };

      request.onerror = () => {
        logger.error(`Failed to get from cache: ${key}`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Stores an asset in cache
   */
  async set(key: string, data: any, type: string, metadata?: any): Promise<void> {
    await this.ensureInitialized();

    const size = this.estimateSize(data);
    const currentSize = await this.getCacheSize();

    if (currentSize + size > this.maxSize) {
      await this.evictOldest(size);
    }

    const entry: IDBCacheEntry = {
      key,
      data,
      type,
      timestamp: Date.now(),
      size,
      metadata
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(entry);

      request.onsuccess = () => {
        logger.debug(`Cached to IndexedDB: ${key} (${size} bytes)`);
        resolve();
      };

      request.onerror = () => {
        logger.error(`Failed to cache: ${key}`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Checks if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getKey(key);

      request.onsuccess = () => {
        resolve(request.result !== undefined);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Removes an entry from cache
   */
  async delete(key: string): Promise<boolean> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);

      request.onsuccess = () => {
        logger.debug(`Deleted from cache: ${key}`);
        resolve(true);
      };

      request.onerror = () => {
        logger.error(`Failed to delete: ${key}`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Clears all cached entries
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        logger.info('Cache cleared');
        resolve();
      };

      request.onerror = () => {
        logger.error('Failed to clear cache', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Gets all cached keys
   */
  async keys(): Promise<string[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result as string[]);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Gets cache size in bytes
   */
  async getCacheSize(): Promise<number> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const entries = request.result as IDBCacheEntry[];
        const totalSize = entries.reduce((sum, entry) => sum + (entry.size || 0), 0);
        resolve(totalSize);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Evicts oldest entries to free space
   */
  async evictOldest(requiredSpace: number): Promise<number> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('timestamp');
      const request = index.openCursor();

      let freedSpace = 0;
      let evictedCount = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;

        if (cursor && freedSpace < requiredSpace) {
          const entry = cursor.value as IDBCacheEntry;
          freedSpace += entry.size || 0;
          evictedCount++;

          cursor.delete();
          cursor.continue();
        } else {
          logger.info(`Evicted ${evictedCount} entries (${freedSpace} bytes)`);
          resolve(evictedCount);
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Ensures cache is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Estimates data size in bytes
   */
  private estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2;
    } catch {
      return 0;
    }
  }

  /**
   * Closes the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      logger.info('IndexedDB cache closed');
    }
  }

  /**
   * Deletes the entire database
   */
  static async deleteDatabase(dbName: string = 'G3DAssetCache'): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);

      request.onsuccess = () => {
        logger.info(`Database deleted: ${dbName}`);
        resolve();
      };

      request.onerror = () => {
        logger.error(`Failed to delete database: ${dbName}`, request.error);
        reject(request.error);
      };
    });
  }
}
