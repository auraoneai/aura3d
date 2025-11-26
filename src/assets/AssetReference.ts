import { Asset } from './Asset';
import { AssetManager } from './AssetManager';

/**
 * Reference type
 */
export enum ReferenceType {
  /** Strong reference - keeps asset in memory */
  STRONG = 'strong',
  /** Weak reference - allows asset to be evicted */
  WEAK = 'weak'
}

/**
 * Asset reference options
 */
export interface AssetReferenceOptions {
  /** Reference type */
  type?: ReferenceType;
  /** Whether to automatically load on first access */
  autoLoad?: boolean;
  /** Asset manager for auto-loading */
  assetManager?: AssetManager;
}

/**
 * Lazy asset reference with:
 * - Automatic loading on access
 * - Strong/weak reference modes
 * - Type-safe asset access
 * - Reference counting integration
 *
 * @example
 * ```typescript
 * // Create lazy reference
 * const textureRef = new AssetReference<TextureAsset>('textures/wood.png', {
 *   type: ReferenceType.STRONG,
 *   autoLoad: true,
 *   assetManager: manager
 * });
 *
 * // Access triggers load if not loaded
 * const texture = await textureRef.get();
 *
 * // Release reference
 * textureRef.release();
 * ```
 */
export class AssetReference<T extends Asset = Asset> {
  /** Asset URL/ID */
  private readonly url: string;

  /** Reference type */
  private readonly type: ReferenceType;

  /** Auto-load on access */
  private readonly autoLoad: boolean;

  /** Asset manager */
  private assetManager: AssetManager | null;

  /** Cached asset instance */
  private asset: T | null = null;

  /** Loading promise */
  private loadPromise: Promise<T> | null = null;

  /** Whether reference has been acquired */
  private acquired: boolean = false;

  /** Reference callbacks */
  private callbacks: {
    onLoad?: (asset: T) => void;
    onError?: (error: Error) => void;
  } = {};

  /**
   * Creates a new asset reference
   * @param url - Asset URL or ID
   * @param options - Reference options
   */
  constructor(url: string, options: AssetReferenceOptions = {}) {
    this.url = url;
    this.type = options.type || ReferenceType.STRONG;
    this.autoLoad = options.autoLoad !== false;
    this.assetManager = options.assetManager || null;
  }

  /**
   * Gets the referenced asset URL
   */
  getUrl(): string {
    return this.url;
  }

  /**
   * Gets the reference type
   */
  getType(): ReferenceType {
    return this.type;
  }

  /**
   * Checks if the asset is loaded
   */
  isLoaded(): boolean {
    return this.asset !== null && this.asset.isLoaded;
  }

  /**
   * Checks if the asset is loading
   */
  isLoading(): boolean {
    return this.loadPromise !== null;
  }

  /**
   * Gets the asset (loads if auto-load is enabled)
   * @returns Promise that resolves to the asset
   */
  async get(): Promise<T> {
    // Return cached asset if available
    if (this.asset && this.asset.isLoaded) {
      return this.asset;
    }

    // Wait for loading if in progress
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // Auto-load if enabled
    if (this.autoLoad && this.assetManager) {
      return this.load();
    }

    throw new Error(`Asset not loaded: ${this.url}`);
  }

  /**
   * Gets the asset synchronously (returns null if not loaded)
   */
  getSync(): T | null {
    return this.asset && this.asset.isLoaded ? this.asset : null;
  }

  /**
   * Loads the asset
   * @returns Promise that resolves to the asset
   */
  async load(): Promise<T> {
    // Return cached asset if available
    if (this.asset && this.asset.isLoaded) {
      return this.asset;
    }

    // Wait for loading if in progress
    if (this.loadPromise) {
      return this.loadPromise;
    }

    if (!this.assetManager) {
      throw new Error('Cannot load asset without asset manager');
    }

    // Start loading
    this.loadPromise = this.performLoad();

    try {
      const asset = await this.loadPromise;
      this.loadPromise = null;
      return asset;
    } catch (error) {
      this.loadPromise = null;
      throw error;
    }
  }

  /**
   * Performs the actual load
   * @private
   */
  private async performLoad(): Promise<T> {
    try {
      const asset = await this.assetManager!.load<T>(this.url);

      this.asset = asset;

      // Acquire reference for strong references
      if (this.type === ReferenceType.STRONG && !this.acquired) {
        asset.addReference();
        this.acquired = true;
      }

      // Trigger callback
      if (this.callbacks.onLoad) {
        this.callbacks.onLoad(asset);
      }

      return asset;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Trigger callback
      if (this.callbacks.onError) {
        this.callbacks.onError(err);
      }

      throw err;
    }
  }

  /**
   * Preloads the asset without acquiring a reference
   */
  async preload(): Promise<void> {
    if (!this.assetManager) {
      throw new Error('Cannot preload asset without asset manager');
    }

    const asset = await this.assetManager.load<T>(this.url);
    this.asset = asset;
  }

  /**
   * Acquires a reference to the asset
   */
  acquire(): void {
    if (this.type === ReferenceType.WEAK) {
      throw new Error('Cannot acquire weak reference');
    }

    if (this.asset && !this.acquired) {
      this.asset.addReference();
      this.acquired = true;
    }
  }

  /**
   * Releases the reference
   */
  release(): void {
    if (this.asset && this.acquired) {
      this.asset.removeReference();
      this.acquired = false;
    }

    // Clear asset for weak references
    if (this.type === ReferenceType.WEAK) {
      this.asset = null;
    }
  }

  /**
   * Sets the asset manager
   * @param manager - Asset manager
   */
  setAssetManager(manager: AssetManager): void {
    this.assetManager = manager;
  }

  /**
   * Sets load callback
   * @param callback - Callback function
   */
  onLoad(callback: (asset: T) => void): this {
    this.callbacks.onLoad = callback;
    return this;
  }

  /**
   * Sets error callback
   * @param callback - Callback function
   */
  onError(callback: (error: Error) => void): this {
    this.callbacks.onError = callback;
    return this;
  }

  /**
   * Clears callbacks
   */
  clearCallbacks(): void {
    this.callbacks = {};
  }

  /**
   * Clones the reference
   */
  clone(): AssetReference<T> {
    return new AssetReference<T>(this.url, {
      type: this.type,
      autoLoad: this.autoLoad,
      assetManager: this.assetManager
    });
  }

  /**
   * Disposes the reference
   */
  dispose(): void {
    this.release();
    this.asset = null;
    this.loadPromise = null;
    this.assetManager = null;
    this.callbacks = {};
  }
}

/**
 * Creates an asset reference
 * @param url - Asset URL or ID
 * @param options - Reference options
 */
export function createAssetReference<T extends Asset = Asset>(
  url: string,
  options?: AssetReferenceOptions
): AssetReference<T> {
  return new AssetReference<T>(url, options);
}

/**
 * Weak asset reference (allows eviction)
 */
export class WeakAssetReference<T extends Asset = Asset> extends AssetReference<T> {
  constructor(url: string, options: Omit<AssetReferenceOptions, 'type'> = {}) {
    super(url, { ...options, type: ReferenceType.WEAK });
  }
}

/**
 * Strong asset reference (keeps in memory)
 */
export class StrongAssetReference<T extends Asset = Asset> extends AssetReference<T> {
  constructor(url: string, options: Omit<AssetReferenceOptions, 'type'> = {}) {
    super(url, { ...options, type: ReferenceType.STRONG });
  }
}
