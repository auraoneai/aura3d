import { Asset, AssetLoadState } from './Asset';

/**
 * Progress callback for asset loading
 */
export interface LoadProgressCallback {
  (loaded: number, total: number): void;
}

/**
 * Options for asset loading
 */
export interface LoadOptions {
  /** Progress callback */
  onProgress?: LoadProgressCallback;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts on failure */
  retries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  /** Request headers for fetch */
  headers?: Record<string, string>;
  /** Request credentials mode */
  credentials?: RequestCredentials;
  /** Priority for loading (higher = more priority) */
  priority?: number;
  /** Abort signal to cancel loading */
  signal?: AbortSignal;
}

/**
 * Batch load options
 */
export interface BatchLoadOptions extends LoadOptions {
  /** Maximum concurrent loads */
  concurrency?: number;
  /** Whether to fail all if one fails */
  failFast?: boolean;
}

/**
 * Load result for batch operations
 */
export interface LoadResult<T extends Asset = Asset> {
  /** Loaded asset */
  asset?: T;
  /** Error if loading failed */
  error?: Error;
  /** Request URL */
  url: string;
  /** Load duration in milliseconds */
  duration: number;
}

/**
 * Asset loader interface
 */
export interface IAssetLoader<T extends Asset = Asset> {
  /**
   * Loads an asset from a URL
   * @param url - Asset URL
   * @param options - Load options
   */
  load(url: string, options?: LoadOptions): Promise<T>;

  /**
   * Checks if this loader can handle the given URL
   * @param url - Asset URL
   */
  canLoad(url: string): boolean;

  /**
   * Gets supported file extensions
   */
  getSupportedExtensions(): string[];
}

/**
 * Central asset loading system with support for:
 * - Multiple asset formats
 * - Async loading with promises
 * - Progress tracking
 * - Automatic retry on failure
 * - Batch loading with concurrency control
 * - Request prioritization
 *
 * @example
 * ```typescript
 * const loader = new AssetLoader();
 *
 * // Register custom loaders
 * loader.registerLoader(new GLTFLoader());
 * loader.registerLoader(new ImageLoader());
 *
 * // Load single asset
 * const asset = await loader.load('model.gltf', {
 *   onProgress: (loaded, total) => {
 *     console.log(`Progress: ${(loaded/total*100).toFixed(1)}%`);
 *   },
 *   retries: 3
 * });
 *
 * // Batch load
 * const results = await loader.loadBatch([
 *   'texture1.png',
 *   'texture2.png',
 *   'model.obj'
 * ], { concurrency: 3 });
 * ```
 */
export class AssetLoader {
  /** Registered loaders by file extension */
  private loaders: Map<string, IAssetLoader> = new Map();

  /** Ordered list of loaders for fallback */
  private loaderList: IAssetLoader[] = [];

  /** Default load options */
  private defaultOptions: LoadOptions = {
    timeout: 30000,
    retries: 2,
    retryDelay: 1000,
    priority: 0
  };

  /** Active load requests */
  private activeLoads: Map<string, Promise<Asset>> = new Map();

  /** Load statistics */
  private stats = {
    totalLoads: 0,
    successfulLoads: 0,
    failedLoads: 0,
    totalBytes: 0,
    totalDuration: 0
  };

  /**
   * Registers an asset loader
   * @param loader - Asset loader instance
   */
  registerLoader(loader: IAssetLoader): void {
    const extensions = loader.getSupportedExtensions();

    for (const ext of extensions) {
      this.loaders.set(ext.toLowerCase(), loader);
    }

    this.loaderList.push(loader);
  }

  /**
   * Unregisters an asset loader
   * @param loader - Asset loader instance
   */
  unregisterLoader(loader: IAssetLoader): void {
    const extensions = loader.getSupportedExtensions();

    for (const ext of extensions) {
      if (this.loaders.get(ext.toLowerCase()) === loader) {
        this.loaders.delete(ext.toLowerCase());
      }
    }

    const index = this.loaderList.indexOf(loader);
    if (index >= 0) {
      this.loaderList.splice(index, 1);
    }
  }

  /**
   * Gets a loader for the given URL
   * @param url - Asset URL
   * @returns The loader or null if none found
   */
  getLoader(url: string): IAssetLoader | null {
    // Try extension-based lookup
    const ext = this.getExtension(url);
    if (ext) {
      const loader = this.loaders.get(ext);
      if (loader) {
        return loader;
      }
    }

    // Fallback to canLoad check
    for (const loader of this.loaderList) {
      if (loader.canLoad(url)) {
        return loader;
      }
    }

    return null;
  }

  /**
   * Loads an asset from a URL
   * @param url - Asset URL
   * @param options - Load options
   * @returns Promise that resolves to the loaded asset
   */
  async load<T extends Asset = Asset>(
    url: string,
    options: LoadOptions = {}
  ): Promise<T> {
    // Check for active load of same URL (deduplication)
    const activeLoad = this.activeLoads.get(url);
    if (activeLoad) {
      return activeLoad as Promise<T>;
    }

    const mergedOptions = { ...this.defaultOptions, ...options };
    const startTime = Date.now();

    // Create load promise
    const loadPromise = this.performLoad<T>(url, mergedOptions, startTime);

    // Track active load
    this.activeLoads.set(url, loadPromise);

    try {
      const asset = await loadPromise;
      this.stats.successfulLoads++;
      return asset;
    } catch (error) {
      this.stats.failedLoads++;
      throw error;
    } finally {
      this.activeLoads.delete(url);
      this.stats.totalLoads++;
      this.stats.totalDuration += Date.now() - startTime;
    }
  }

  /**
   * Performs the actual load with retry logic
   * @private
   */
  private async performLoad<T extends Asset>(
    url: string,
    options: LoadOptions,
    startTime: number
  ): Promise<T> {
    const loader = this.getLoader(url);
    if (!loader) {
      throw new Error(`No loader found for URL: ${url}`);
    }

    let lastError: Error | null = null;
    const maxRetries = options.retries || 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Add delay before retry
        if (attempt > 0 && options.retryDelay) {
          await this.delay(options.retryDelay);
        }

        // Perform load
        const asset = await this.loadWithTimeout<T>(
          loader as IAssetLoader<T>,
          url,
          options
        );

        return asset;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on abort
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error;
        }

        // Don't retry on timeout if it's the last attempt
        if (attempt === maxRetries) {
          break;
        }
      }
    }

    throw new Error(
      `Failed to load asset after ${maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  /**
   * Loads an asset with timeout
   * @private
   */
  private async loadWithTimeout<T extends Asset>(
    loader: IAssetLoader<T>,
    url: string,
    options: LoadOptions
  ): Promise<T> {
    const timeout = options.timeout || this.defaultOptions.timeout!;

    return Promise.race([
      loader.load(url, options),
      this.createTimeoutPromise<T>(timeout)
    ]);
  }

  /**
   * Creates a timeout promise
   * @private
   */
  private createTimeoutPromise<T>(timeout: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Load timeout after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Loads multiple assets in batch
   * @param urls - Array of asset URLs
   * @param options - Batch load options
   * @returns Promise that resolves to array of load results
   */
  async loadBatch(
    urls: string[],
    options: BatchLoadOptions = {}
  ): Promise<LoadResult[]> {
    const concurrency = options.concurrency || 4;
    const failFast = options.failFast !== false;
    const results: LoadResult[] = [];

    // Create load tasks
    const tasks = urls.map((url, index) => ({
      url,
      index,
      priority: options.priority || 0
    }));

    // Sort by priority
    tasks.sort((a, b) => b.priority - a.priority);

    // Process in batches
    const executing: Promise<void>[] = [];

    for (const task of tasks) {
      const startTime = Date.now();

      const loadPromise = this.load(task.url, options)
        .then(asset => {
          results[task.index] = {
            asset,
            url: task.url,
            duration: Date.now() - startTime
          };
        })
        .catch(error => {
          const result: LoadResult = {
            error: error instanceof Error ? error : new Error(String(error)),
            url: task.url,
            duration: Date.now() - startTime
          };

          results[task.index] = result;

          if (failFast) {
            throw error;
          }
        });

      executing.push(loadPromise);

      // Limit concurrency
      if (executing.length >= concurrency) {
        await Promise.race(executing);

        // Remove completed promises
        for (let i = executing.length - 1; i >= 0; i--) {
          if (await this.isResolved(executing[i])) {
            executing.splice(i, 1);
          }
        }
      }
    }

    // Wait for remaining
    if (!failFast) {
      await Promise.allSettled(executing);
    } else {
      await Promise.all(executing);
    }

    return results;
  }

  /**
   * Preloads assets in the background
   * @param urls - Array of asset URLs
   * @param options - Load options
   */
  async preload(
    urls: string[],
    options: BatchLoadOptions = {}
  ): Promise<void> {
    await this.loadBatch(urls, { ...options, failFast: false });
  }

  /**
   * Fetches raw data from a URL
   * @param url - Resource URL
   * @param options - Load options
   * @returns Promise that resolves to ArrayBuffer
   */
  async fetchData(
    url: string,
    options: LoadOptions = {}
  ): Promise<ArrayBuffer> {
    const mergedOptions = { ...this.defaultOptions, ...options };

    const controller = new AbortController();
    const signal = options.signal || controller.signal;

    // Setup timeout
    let timeoutId: number | undefined;
    if (mergedOptions.timeout) {
      timeoutId = window.setTimeout(() => {
        controller.abort();
      }, mergedOptions.timeout);
    }

    try {
      const response = await fetch(url, {
        headers: mergedOptions.headers,
        credentials: mergedOptions.credentials,
        signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Track progress
      if (options.onProgress && response.body) {
        return await this.fetchWithProgress(response, options.onProgress);
      }

      const data = await response.arrayBuffer();
      this.stats.totalBytes += data.byteLength;

      return data;
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Fetches data with progress tracking
   * @private
   */
  private async fetchWithProgress(
    response: Response,
    onProgress: LoadProgressCallback
  ): Promise<ArrayBuffer> {
    const reader = response.body!.getReader();
    const contentLength = parseInt(response.headers.get('Content-Length') || '0');

    let receivedLength = 0;
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
      receivedLength += value.length;

      onProgress(receivedLength, contentLength);
    }

    // Concatenate chunks
    const result = new Uint8Array(receivedLength);
    let position = 0;

    for (const chunk of chunks) {
      result.set(chunk, position);
      position += chunk.length;
    }

    this.stats.totalBytes += receivedLength;

    return result.buffer;
  }

  /**
   * Extracts file extension from URL
   * @private
   */
  private getExtension(url: string): string | null {
    try {
      const urlObj = new URL(url, window.location.href);
      const pathname = urlObj.pathname;
      const match = pathname.match(/\.([^./?#]+)(?:[?#]|$)/i);

      return match ? match[1].toLowerCase() : null;
    } catch {
      // Fallback for non-URL strings
      const match = url.match(/\.([^./?#]+)(?:[?#]|$)/i);
      return match ? match[1].toLowerCase() : null;
    }
  }

  /**
   * Checks if a promise is resolved
   * @private
   */
  private async isResolved(promise: Promise<any>): Promise<boolean> {
    const sentinel = Symbol('pending');
    return await Promise.race([promise.then(() => true, () => true), Promise.resolve(sentinel)])
      .then(result => result !== sentinel);
  }

  /**
   * Delays execution
   * @private
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets load statistics
   */
  getStats(): Readonly<typeof this.stats> {
    return { ...this.stats };
  }

  /**
   * Resets load statistics
   */
  resetStats(): void {
    this.stats = {
      totalLoads: 0,
      successfulLoads: 0,
      failedLoads: 0,
      totalBytes: 0,
      totalDuration: 0
    };
  }

  /**
   * Gets the number of active loads
   */
  getActiveLoadCount(): number {
    return this.activeLoads.size;
  }

  /**
   * Gets active load URLs
   */
  getActiveLoadUrls(): string[] {
    return Array.from(this.activeLoads.keys());
  }

  /**
   * Clears all active loads
   */
  clearActiveLoads(): void {
    this.activeLoads.clear();
  }
}
