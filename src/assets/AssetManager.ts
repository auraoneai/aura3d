import { Asset, AssetLoadState } from './Asset';
import { AssetLoader, IAssetLoader, LoadOptions } from './AssetLoader';
import { AssetCache, CacheOptions, CacheStats } from './AssetCache';
import { AssetBundle } from './AssetBundle';

/**
 * Asset manager options
 */
export interface AssetManagerOptions {
  /** Cache options */
  cache?: CacheOptions;
  /** Default load options */
  defaultLoadOptions?: LoadOptions;
  /** Enable background loading */
  enableBackgroundLoading?: boolean;
  /** Maximum background load queue size */
  maxBackgroundQueue?: number;
}

/**
 * Load priority levels
 */
export enum LoadPriority {
  /** Critical - load immediately */
  CRITICAL = 100,
  /** High priority */
  HIGH = 75,
  /** Normal priority */
  NORMAL = 50,
  /** Low priority */
  LOW = 25,
  /** Background - load when idle */
  BACKGROUND = 0
}

/**
 * Load request
 */
interface LoadRequest {
  url: string;
  priority: LoadPriority;
  options?: LoadOptions;
  resolve: (asset: Asset) => void;
  reject: (error: Error) => void;
}

/**
 * Central asset management system with:
 * - Loader registration and coordination
 * - Cache management
 * - Priority-based loading queue
 * - Background loading
 * - Bundle management
 *
 * @example
 * ```typescript
 * const manager = new AssetManager({
 *   cache: {
 *     maxMemory: 512 * 1024 * 1024, // 512MB
 *     evictionPolicy: EvictionPolicy.LRU
 *   },
 *   enableBackgroundLoading: true
 * });
 *
 * // Register loaders
 * manager.registerLoader(new GLTFLoader());
 * manager.registerLoader(new ImageLoader());
 * manager.registerLoader(new AudioLoader());
 *
 * // Load asset
 * const model = await manager.load('model.gltf', {
 *   priority: LoadPriority.HIGH
 * });
 *
 * // Load in background
 * manager.loadBackground(['texture1.png', 'texture2.png']);
 *
 * // Get from cache
 * const cached = manager.get('model.gltf');
 * ```
 */
export class AssetManager {
  /** Asset loader */
  private loader: AssetLoader;

  /** Asset cache */
  private cache: AssetCache;

  /** Default load options */
  private defaultOptions: LoadOptions;

  /** Background loading enabled */
  private backgroundEnabled: boolean;

  /** Background load queue */
  private backgroundQueue: LoadRequest[] = [];

  /** Maximum background queue size */
  private maxBackgroundQueue: number;

  /** Background loading active */
  private backgroundActive: boolean = false;

  /** Loaded bundles */
  private bundles: Map<string, AssetBundle> = new Map();

  /** Asset aliases */
  private aliases: Map<string, string> = new Map();

  /**
   * Creates a new asset manager
   * @param options - Manager options
   */
  constructor(options: AssetManagerOptions = {}) {
    this.loader = new AssetLoader();
    this.cache = new AssetCache(options.cache);
    this.defaultOptions = options.defaultLoadOptions || {};
    this.backgroundEnabled = options.enableBackgroundLoading !== false;
    this.maxBackgroundQueue = options.maxBackgroundQueue || 100;
  }

  /**
   * Registers an asset loader
   * @param loader - Asset loader
   */
  registerLoader(loader: IAssetLoader): void {
    this.loader.registerLoader(loader);
  }

  /**
   * Unregisters an asset loader
   * @param loader - Asset loader
   */
  unregisterLoader(loader: IAssetLoader): void {
    this.loader.unregisterLoader(loader);
  }

  /**
   * Loads an asset
   * @param url - Asset URL
   * @param options - Load options
   * @returns Promise that resolves to the asset
   */
  async load<T extends Asset = Asset>(
    url: string,
    options: LoadOptions & { priority?: LoadPriority } = {}
  ): Promise<T> {
    // Resolve alias
    const resolvedUrl = this.resolveAlias(url);

    // Check cache first
    const cached = this.cache.get(resolvedUrl);
    if (cached) {
      return cached as T;
    }

    // Merge options
    const mergedOptions = { ...this.defaultOptions, ...options };

    // Load asset
    const asset = await this.loader.load<T>(resolvedUrl, mergedOptions);

    // Add to cache
    this.cache.set(resolvedUrl, asset);

    return asset;
  }

  /**
   * Loads multiple assets
   * @param urls - Asset URLs
   * @param options - Load options
   * @returns Promise that resolves to array of assets
   */
  async loadBatch(
    urls: string[],
    options: LoadOptions = {}
  ): Promise<Asset[]> {
    const promises = urls.map(url => this.load(url, options));
    return Promise.all(promises);
  }

  /**
   * Loads assets in the background
   * @param urls - Asset URLs
   * @param options - Load options
   */
  loadBackground(
    urls: string | string[],
    options: LoadOptions = {}
  ): void {
    if (!this.backgroundEnabled) {
      return;
    }

    const urlArray = Array.isArray(urls) ? urls : [urls];

    for (const url of urlArray) {
      // Skip if already cached
      if (this.has(url)) {
        continue;
      }

      // Add to queue
      if (this.backgroundQueue.length < this.maxBackgroundQueue) {
        this.backgroundQueue.push({
          url,
          priority: LoadPriority.BACKGROUND,
          options,
          resolve: () => {},
          reject: () => {}
        });
      }
    }

    // Start background loading if not active
    if (!this.backgroundActive) {
      this.processBackgroundQueue();
    }
  }

  /**
   * Processes background load queue
   * @private
   */
  private async processBackgroundQueue(): Promise<void> {
    this.backgroundActive = true;

    while (this.backgroundQueue.length > 0) {
      // Sort by priority
      this.backgroundQueue.sort((a, b) => b.priority - a.priority);

      const request = this.backgroundQueue.shift()!;

      try {
        await this.load(request.url, request.options);
        request.resolve(this.cache.get(request.url)!);
      } catch (error) {
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }

      // Yield to main thread
      await this.yield();
    }

    this.backgroundActive = false;
  }

  /**
   * Yields to main thread
   * @private
   */
  private yield(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  /**
   * Gets an asset from cache
   * @param url - Asset URL
   * @returns The cached asset or undefined
   */
  get<T extends Asset = Asset>(url: string): T | undefined {
    const resolvedUrl = this.resolveAlias(url);
    return this.cache.get(resolvedUrl) as T | undefined;
  }

  /**
   * Checks if an asset is cached
   * @param url - Asset URL
   */
  has(url: string): boolean {
    const resolvedUrl = this.resolveAlias(url);
    return this.cache.has(resolvedUrl);
  }

  /**
   * Removes an asset from cache
   * @param url - Asset URL
   * @param dispose - Whether to dispose the asset
   */
  unload(url: string, dispose: boolean = true): void {
    const resolvedUrl = this.resolveAlias(url);

    if (dispose) {
      const asset = this.cache.get(resolvedUrl);
      if (asset) {
        asset.dispose();
      }
    }

    this.cache.delete(resolvedUrl);
  }

  /**
   * Unloads all assets
   * @param dispose - Whether to dispose assets
   */
  unloadAll(dispose: boolean = true): void {
    this.cache.clear(dispose);
  }

  /**
   * Loads an asset bundle
   * @param manifestUrl - Bundle manifest URL
   * @returns Promise that resolves to the bundle
   */
  async loadBundle(manifestUrl: string): Promise<AssetBundle> {
    const bundle = await AssetBundle.fromManifest(manifestUrl, this.loader);
    this.bundles.set(manifestUrl, bundle);
    return bundle;
  }

  /**
   * Gets a loaded bundle
   * @param manifestUrl - Bundle manifest URL
   */
  getBundle(manifestUrl: string): AssetBundle | undefined {
    return this.bundles.get(manifestUrl);
  }

  /**
   * Unloads a bundle
   * @param manifestUrl - Bundle manifest URL
   * @param dispose - Whether to dispose assets
   */
  unloadBundle(manifestUrl: string, dispose: boolean = true): void {
    const bundle = this.bundles.get(manifestUrl);
    if (bundle) {
      bundle.unloadAll(dispose);
      this.bundles.delete(manifestUrl);
    }
  }

  /**
   * Sets an alias for an asset URL
   * @param alias - Alias name
   * @param url - Actual URL
   */
  setAlias(alias: string, url: string): void {
    this.aliases.set(alias, url);
  }

  /**
   * Removes an alias
   * @param alias - Alias name
   */
  removeAlias(alias: string): void {
    this.aliases.delete(alias);
  }

  /**
   * Resolves an alias to actual URL
   * @private
   */
  private resolveAlias(url: string): string {
    return this.aliases.get(url) || url;
  }

  /**
   * Gets cache statistics
   */
  getCacheStats(): CacheStats {
    return this.cache.getStats();
  }

  /**
   * Gets loader statistics
   */
  getLoaderStats(): ReturnType<AssetLoader['getStats']> {
    return this.loader.getStats();
  }

  /**
   * Gets all cached asset URLs
   */
  getCachedUrls(): string[] {
    return this.cache.keys();
  }

  /**
   * Gets all cached assets
   */
  getCachedAssets(): Asset[] {
    return this.cache.values();
  }

  /**
   * Preloads assets into cache
   * @param urls - Asset URLs
   * @param options - Load options
   */
  async preload(
    urls: string[],
    options: LoadOptions = {}
  ): Promise<void> {
    await this.loadBatch(urls, options);
  }

  /**
   * Evicts assets to free memory
   * @param targetMemory - Target memory in bytes
   * @returns Number of assets evicted
   */
  evictToMemory(targetMemory: number): number {
    return this.cache.evictToMemory(targetMemory);
  }

  /**
   * Evicts stale assets
   * @param maxAge - Maximum age in milliseconds
   * @returns Number of assets evicted
   */
  evictStale(maxAge: number): number {
    return this.cache.evictStale(maxAge);
  }

  /**
   * Gets assets by state
   * @param state - Load state
   */
  getAssetsByState(state: AssetLoadState): Asset[] {
    return this.getCachedAssets().filter(asset => asset.loadState === state);
  }

  /**
   * Gets all loaded assets
   */
  getLoadedAssets(): Asset[] {
    return this.getAssetsByState(AssetLoadState.LOADED);
  }

  /**
   * Gets all loading assets
   */
  getLoadingAssets(): Asset[] {
    return this.getAssetsByState(AssetLoadState.LOADING);
  }

  /**
   * Gets all errored assets
   */
  getErroredAssets(): Asset[] {
    return this.getAssetsByState(AssetLoadState.ERROR);
  }

  /**
   * Gets background queue size
   */
  getBackgroundQueueSize(): number {
    return this.backgroundQueue.length;
  }

  /**
   * Clears background queue
   */
  clearBackgroundQueue(): void {
    this.backgroundQueue = [];
  }

  /**
   * Pauses background loading
   */
  pauseBackgroundLoading(): void {
    this.backgroundEnabled = false;
  }

  /**
   * Resumes background loading
   */
  resumeBackgroundLoading(): void {
    this.backgroundEnabled = true;

    if (!this.backgroundActive && this.backgroundQueue.length > 0) {
      this.processBackgroundQueue();
    }
  }

  /**
   * Disposes the asset manager
   */
  dispose(): void {
    this.unloadAll(true);
    this.cache.dispose();
    this.backgroundQueue = [];
    this.bundles.clear();
    this.aliases.clear();
  }
}
