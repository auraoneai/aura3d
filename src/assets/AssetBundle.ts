import { Asset } from './Asset';
import { AssetLoader, LoadOptions } from './AssetLoader';

/**
 * Asset bundle manifest entry
 */
export interface BundleManifestEntry {
  /** Asset ID within the bundle */
  id: string;
  /** Asset path/URL */
  path: string;
  /** Asset type/format */
  type: string;
  /** File size in bytes */
  size?: number;
  /** Dependencies (other asset IDs) */
  dependencies?: string[];
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Asset bundle manifest
 */
export interface BundleManifest {
  /** Bundle name */
  name: string;
  /** Bundle version */
  version: string;
  /** Base URL for resolving relative paths */
  baseUrl?: string;
  /** Bundle assets */
  assets: BundleManifestEntry[];
  /** Bundle metadata */
  metadata?: Record<string, any>;
}

/**
 * Bundle load options
 */
export interface BundleLoadOptions extends LoadOptions {
  /** Whether to load dependencies automatically */
  loadDependencies?: boolean;
  /** Maximum concurrent asset loads */
  concurrency?: number;
}

/**
 * Bundle load progress
 */
export interface BundleLoadProgress {
  /** Number of loaded assets */
  loaded: number;
  /** Total number of assets */
  total: number;
  /** Currently loading asset ID */
  currentAsset?: string;
}

/**
 * Asset bundle/pack support with:
 * - Bundle manifest management
 * - Automatic dependency resolution
 * - Partial loading support
 * - Progress tracking
 * - Batch loading optimization
 *
 * @example
 * ```typescript
 * // Create bundle from manifest
 * const bundle = await AssetBundle.fromManifest('bundle.json', loader);
 *
 * // Load entire bundle
 * await bundle.loadAll({
 *   onProgress: (loaded, total) => {
 *     console.log(`Loading: ${loaded}/${total}`);
 *   }
 * });
 *
 * // Load specific asset with dependencies
 * const asset = await bundle.load('character-model', {
 *   loadDependencies: true
 * });
 *
 * // Partial load
 * await bundle.loadAssets(['texture1', 'texture2', 'model1']);
 * ```
 */
export class AssetBundle {
  /** Bundle manifest */
  private manifest: BundleManifest;

  /** Asset loader */
  private loader: AssetLoader;

  /** Loaded assets by ID */
  private assets: Map<string, Asset> = new Map();

  /** Loading promises by ID */
  private loadingPromises: Map<string, Promise<Asset>> = new Map();

  /** Dependency graph (asset ID -> dependent IDs) */
  private dependencyGraph: Map<string, Set<string>> = new Map();

  /** Reverse dependency graph (dependent ID -> required IDs) */
  private reverseDependencyGraph: Map<string, Set<string>> = new Map();

  /**
   * Creates a new asset bundle
   * @param manifest - Bundle manifest
   * @param loader - Asset loader
   */
  constructor(manifest: BundleManifest, loader: AssetLoader) {
    this.manifest = manifest;
    this.loader = loader;
    this.buildDependencyGraph();
  }

  /**
   * Creates a bundle from a manifest file
   * @param manifestUrl - URL to manifest file
   * @param loader - Asset loader
   */
  static async fromManifest(
    manifestUrl: string,
    loader: AssetLoader
  ): Promise<AssetBundle> {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      throw new Error(`Failed to load manifest: ${response.statusText}`);
    }

    const manifest = await response.json() as BundleManifest;

    // Set base URL if not specified
    if (!manifest.baseUrl) {
      const url = new URL(manifestUrl, window.location.href);
      manifest.baseUrl = url.href.substring(0, url.href.lastIndexOf('/') + 1);
    }

    return new AssetBundle(manifest, loader);
  }

  /**
   * Gets the bundle manifest
   */
  getManifest(): Readonly<BundleManifest> {
    return this.manifest;
  }

  /**
   * Gets a manifest entry by ID
   * @param id - Asset ID
   */
  getEntry(id: string): BundleManifestEntry | undefined {
    return this.manifest.assets.find(entry => entry.id === id);
  }

  /**
   * Checks if the bundle contains an asset
   * @param id - Asset ID
   */
  has(id: string): boolean {
    return this.manifest.assets.some(entry => entry.id === id);
  }

  /**
   * Gets a loaded asset
   * @param id - Asset ID
   */
  get(id: string): Asset | undefined {
    return this.assets.get(id);
  }

  /**
   * Loads a single asset from the bundle
   * @param id - Asset ID
   * @param options - Load options
   */
  async load(
    id: string,
    options: BundleLoadOptions = {}
  ): Promise<Asset> {
    // Check if already loaded
    const cached = this.assets.get(id);
    if (cached) {
      return cached;
    }

    // Check if already loading
    const loading = this.loadingPromises.get(id);
    if (loading) {
      return loading;
    }

    const entry = this.getEntry(id);
    if (!entry) {
      throw new Error(`Asset not found in bundle: ${id}`);
    }

    // Load dependencies first
    if (options.loadDependencies && entry.dependencies) {
      await this.loadDependencies(id, options);
    }

    // Load the asset
    const url = this.resolveUrl(entry.path);
    const loadPromise = this.loader.load(url, options);

    this.loadingPromises.set(id, loadPromise);

    try {
      const asset = await loadPromise;
      this.assets.set(id, asset);
      return asset;
    } finally {
      this.loadingPromises.delete(id);
    }
  }

  /**
   * Loads dependencies for an asset
   * @private
   */
  private async loadDependencies(
    id: string,
    options: BundleLoadOptions
  ): Promise<void> {
    const dependencies = this.getDependencies(id);

    if (dependencies.length === 0) {
      return;
    }

    // Load dependencies in parallel
    await Promise.all(
      dependencies.map(depId => this.load(depId, options))
    );
  }

  /**
   * Loads multiple assets from the bundle
   * @param ids - Asset IDs
   * @param options - Load options
   */
  async loadAssets(
    ids: string[],
    options: BundleLoadOptions = {}
  ): Promise<Asset[]> {
    const loadDeps = options.loadDependencies !== false;

    // Build load list with dependencies
    const loadSet = new Set<string>(ids);

    if (loadDeps) {
      for (const id of ids) {
        const deps = this.getDependenciesRecursive(id);
        for (const dep of deps) {
          loadSet.add(dep);
        }
      }
    }

    // Sort by dependency order
    const sorted = this.topologicalSort(Array.from(loadSet));

    // Load in order with concurrency control
    const concurrency = options.concurrency || 4;
    const results: Asset[] = [];
    const executing: Promise<void>[] = [];

    for (const id of sorted) {
      const loadPromise = this.load(id, { ...options, loadDependencies: false })
        .then(asset => {
          results.push(asset);
        });

      executing.push(loadPromise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);

        // Remove completed
        for (let i = executing.length - 1; i >= 0; i--) {
          const isDone = await Promise.race([
            executing[i].then(() => true),
            Promise.resolve(false)
          ]);
          if (isDone) {
            executing.splice(i, 1);
          }
        }
      }
    }

    await Promise.all(executing);

    return results;
  }

  /**
   * Loads all assets in the bundle
   * @param options - Load options
   */
  async loadAll(options: BundleLoadOptions = {}): Promise<Asset[]> {
    const ids = this.manifest.assets.map(entry => entry.id);
    return this.loadAssets(ids, options);
  }

  /**
   * Gets dependencies for an asset
   * @param id - Asset ID
   * @returns Array of dependency IDs
   */
  getDependencies(id: string): string[] {
    const entry = this.getEntry(id);
    return entry?.dependencies || [];
  }

  /**
   * Gets all dependencies recursively
   * @param id - Asset ID
   * @returns Array of all dependency IDs
   */
  getDependenciesRecursive(id: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (assetId: string) => {
      if (visited.has(assetId)) {
        return;
      }

      visited.add(assetId);

      const deps = this.getDependencies(assetId);
      for (const dep of deps) {
        visit(dep);
        result.push(dep);
      }
    };

    visit(id);

    return result;
  }

  /**
   * Gets dependents for an asset (reverse dependencies)
   * @param id - Asset ID
   * @returns Array of dependent IDs
   */
  getDependents(id: string): string[] {
    const dependents = this.reverseDependencyGraph.get(id);
    return dependents ? Array.from(dependents) : [];
  }

  /**
   * Builds the dependency graphs
   * @private
   */
  private buildDependencyGraph(): void {
    this.dependencyGraph.clear();
    this.reverseDependencyGraph.clear();

    for (const entry of this.manifest.assets) {
      if (entry.dependencies) {
        this.dependencyGraph.set(entry.id, new Set(entry.dependencies));

        for (const dep of entry.dependencies) {
          if (!this.reverseDependencyGraph.has(dep)) {
            this.reverseDependencyGraph.set(dep, new Set());
          }
          this.reverseDependencyGraph.get(dep)!.add(entry.id);
        }
      }
    }
  }

  /**
   * Performs topological sort on asset IDs
   * @private
   */
  private topologicalSort(ids: string[]): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string): void => {
      if (visited.has(id)) {
        return;
      }

      if (visiting.has(id)) {
        throw new Error(`Circular dependency detected: ${id}`);
      }

      visiting.add(id);

      const deps = this.getDependencies(id);
      for (const dep of deps) {
        if (ids.includes(dep)) {
          visit(dep);
        }
      }

      visiting.delete(id);
      visited.add(id);
      sorted.push(id);
    };

    for (const id of ids) {
      visit(id);
    }

    return sorted;
  }

  /**
   * Resolves a relative path to absolute URL
   * @private
   */
  private resolveUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    if (this.manifest.baseUrl) {
      return new URL(path, this.manifest.baseUrl).href;
    }

    return path;
  }

  /**
   * Unloads an asset from the bundle
   * @param id - Asset ID
   * @param dispose - Whether to dispose the asset
   */
  unload(id: string, dispose: boolean = true): void {
    const asset = this.assets.get(id);

    if (asset) {
      if (dispose) {
        asset.dispose();
      }
      this.assets.delete(id);
    }
  }

  /**
   * Unloads all assets from the bundle
   * @param dispose - Whether to dispose assets
   */
  unloadAll(dispose: boolean = true): void {
    if (dispose) {
      for (const asset of this.assets.values()) {
        asset.dispose();
      }
    }

    this.assets.clear();
    this.loadingPromises.clear();
  }

  /**
   * Gets load progress
   */
  getLoadProgress(): BundleLoadProgress {
    return {
      loaded: this.assets.size,
      total: this.manifest.assets.length
    };
  }

  /**
   * Checks if all assets are loaded
   */
  isFullyLoaded(): boolean {
    return this.assets.size === this.manifest.assets.length;
  }

  /**
   * Gets all loaded asset IDs
   */
  getLoadedIds(): string[] {
    return Array.from(this.assets.keys());
  }

  /**
   * Gets total bundle size in bytes
   */
  getTotalSize(): number {
    return this.manifest.assets.reduce(
      (sum, entry) => sum + (entry.size || 0),
      0
    );
  }

  /**
   * Exports bundle to JSON
   */
  toJSON(): BundleManifest {
    return { ...this.manifest };
  }
}
