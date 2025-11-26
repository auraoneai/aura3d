/**
 * Asset load state enumeration
 */
export enum AssetLoadState {
  /** Asset has not been loaded yet */
  UNLOADED = 'unloaded',
  /** Asset is currently loading */
  LOADING = 'loading',
  /** Asset has been successfully loaded */
  LOADED = 'loaded',
  /** Asset failed to load */
  ERROR = 'error',
  /** Asset has been unloaded from memory */
  DISPOSED = 'disposed'
}

/**
 * Base metadata interface for all assets
 */
export interface AssetMetadata {
  /** Original file path or URL */
  uri?: string;
  /** File size in bytes */
  byteSize?: number;
  /** MIME type */
  mimeType?: string;
  /** Creation timestamp */
  createdAt?: number;
  /** Last modified timestamp */
  modifiedAt?: number;
  /** Custom metadata key-value pairs */
  [key: string]: any;
}

/**
 * Options for asset creation
 */
export interface AssetOptions {
  /** Unique asset identifier */
  id?: string;
  /** Human-readable asset name */
  name?: string;
  /** Initial metadata */
  metadata?: AssetMetadata;
  /** Whether to track references */
  trackReferences?: boolean;
}

/**
 * Base class for all assets in the G3D engine.
 * Provides core functionality for asset management including:
 * - Unique identification
 * - Load state tracking
 * - Reference counting for memory management
 * - Metadata storage
 * - Memory size estimation
 *
 * @example
 * ```typescript
 * class TextureAsset extends Asset {
 *   private texture: WebGLTexture | null = null;
 *
 *   async load(data: ArrayBuffer): Promise<void> {
 *     this.setState(AssetLoadState.LOADING);
 *     try {
 *       // Load texture from data
 *       this.texture = createTexture(data);
 *       this.setState(AssetLoadState.LOADED);
 *     } catch (error) {
 *       this.setState(AssetLoadState.ERROR);
 *       throw error;
 *     }
 *   }
 *
 *   getMemorySize(): number {
 *     return this.texture ? 1024 * 1024 : 0; // 1MB estimate
 *   }
 * }
 * ```
 */
export abstract class Asset {
  /** Unique asset identifier */
  private readonly _id: string;

  /** Human-readable asset name */
  private _name: string;

  /** Current load state */
  private _loadState: AssetLoadState = AssetLoadState.UNLOADED;

  /** Reference count for memory management */
  private _referenceCount: number = 0;

  /** Whether reference tracking is enabled */
  private readonly _trackReferences: boolean;

  /** Asset metadata */
  private _metadata: AssetMetadata = {};

  /** Load error if any */
  private _loadError: Error | null = null;

  /** Load timestamp */
  private _loadTimestamp: number = 0;

  /** Dispose timestamp */
  private _disposeTimestamp: number = 0;

  /**
   * Creates a new asset
   * @param options - Asset creation options
   */
  constructor(options: AssetOptions = {}) {
    this._id = options.id || this.generateId();
    this._name = options.name || this._id;
    this._trackReferences = options.trackReferences !== false;

    if (options.metadata) {
      this._metadata = { ...options.metadata };
    }
  }

  /**
   * Gets the unique asset ID
   */
  get id(): string {
    return this._id;
  }

  /**
   * Gets the asset name
   */
  get name(): string {
    return this._name;
  }

  /**
   * Sets the asset name
   */
  set name(value: string) {
    this._name = value;
  }

  /**
   * Gets the current load state
   */
  get loadState(): AssetLoadState {
    return this._loadState;
  }

  /**
   * Gets the current reference count
   */
  get referenceCount(): number {
    return this._referenceCount;
  }

  /**
   * Gets the asset metadata
   */
  get metadata(): Readonly<AssetMetadata> {
    return this._metadata;
  }

  /**
   * Gets the load error if any
   */
  get loadError(): Error | null {
    return this._loadError;
  }

  /**
   * Gets the load timestamp (milliseconds since epoch)
   */
  get loadTimestamp(): number {
    return this._loadTimestamp;
  }

  /**
   * Checks if the asset is loaded
   */
  get isLoaded(): boolean {
    return this._loadState === AssetLoadState.LOADED;
  }

  /**
   * Checks if the asset is loading
   */
  get isLoading(): boolean {
    return this._loadState === AssetLoadState.LOADING;
  }

  /**
   * Checks if the asset has an error
   */
  get hasError(): boolean {
    return this._loadState === AssetLoadState.ERROR;
  }

  /**
   * Checks if the asset is disposed
   */
  get isDisposed(): boolean {
    return this._loadState === AssetLoadState.DISPOSED;
  }

  /**
   * Increments the reference count
   * @returns The new reference count
   */
  addReference(): number {
    if (!this._trackReferences) {
      return this._referenceCount;
    }

    if (this._loadState === AssetLoadState.DISPOSED) {
      throw new Error(`Cannot add reference to disposed asset: ${this._id}`);
    }

    this._referenceCount++;
    return this._referenceCount;
  }

  /**
   * Decrements the reference count
   * @returns The new reference count
   */
  removeReference(): number {
    if (!this._trackReferences) {
      return this._referenceCount;
    }

    if (this._referenceCount > 0) {
      this._referenceCount--;
    }

    return this._referenceCount;
  }

  /**
   * Sets a metadata value
   * @param key - Metadata key
   * @param value - Metadata value
   */
  setMetadata(key: string, value: any): void {
    this._metadata[key] = value;
  }

  /**
   * Gets a metadata value
   * @param key - Metadata key
   * @param defaultValue - Default value if key doesn't exist
   * @returns The metadata value
   */
  getMetadata<T = any>(key: string, defaultValue?: T): T | undefined {
    return this._metadata[key] !== undefined ? this._metadata[key] : defaultValue;
  }

  /**
   * Checks if metadata key exists
   * @param key - Metadata key
   */
  hasMetadata(key: string): boolean {
    return this._metadata[key] !== undefined;
  }

  /**
   * Removes a metadata value
   * @param key - Metadata key
   */
  removeMetadata(key: string): void {
    delete this._metadata[key];
  }

  /**
   * Clears all metadata
   */
  clearMetadata(): void {
    this._metadata = {};
  }

  /**
   * Sets the asset load state
   * @param state - New load state
   * @param error - Optional error if state is ERROR
   * @protected
   */
  protected setState(state: AssetLoadState, error?: Error): void {
    this._loadState = state;

    if (state === AssetLoadState.LOADED) {
      this._loadTimestamp = Date.now();
      this._loadError = null;
    } else if (state === AssetLoadState.ERROR) {
      this._loadError = error || new Error('Unknown asset load error');
    } else if (state === AssetLoadState.DISPOSED) {
      this._disposeTimestamp = Date.now();
    }
  }

  /**
   * Gets the estimated memory size in bytes
   * @returns Memory size in bytes
   */
  abstract getMemorySize(): number;

  /**
   * Disposes the asset and frees resources
   * Override this in derived classes to free specific resources
   */
  dispose(): void {
    if (this._loadState === AssetLoadState.DISPOSED) {
      return;
    }

    this.setState(AssetLoadState.DISPOSED);
    this._referenceCount = 0;
  }

  /**
   * Creates a shallow clone of this asset
   * @returns A new asset instance
   */
  clone(): Asset {
    const cloned = Object.create(Object.getPrototypeOf(this));
    Object.assign(cloned, {
      _id: this.generateId(),
      _name: `${this._name}_clone`,
      _loadState: AssetLoadState.UNLOADED,
      _referenceCount: 0,
      _trackReferences: this._trackReferences,
      _metadata: { ...this._metadata },
      _loadError: null,
      _loadTimestamp: 0,
      _disposeTimestamp: 0
    });

    return cloned;
  }

  /**
   * Converts the asset to a JSON-serializable object
   */
  toJSON(): object {
    return {
      id: this._id,
      name: this._name,
      loadState: this._loadState,
      referenceCount: this._referenceCount,
      metadata: this._metadata,
      loadTimestamp: this._loadTimestamp,
      memorySize: this.getMemorySize()
    };
  }

  /**
   * Generates a unique asset ID
   * @private
   */
  private generateId(): string {
    return `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * String representation of the asset
   */
  toString(): string {
    return `${this.constructor.name}(id="${this._id}", name="${this._name}", state=${this._loadState})`;
  }
}
