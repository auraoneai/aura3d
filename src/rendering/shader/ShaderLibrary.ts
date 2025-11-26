/**
 * @module ShaderLibrary
 * @description Shader caching, variant management, and async loading.
 */

import { Logger } from '../../core/Logger';
import { EventBus } from '../../core/EventBus';
import { IDisposable } from '../../types';
import { Shader, ShaderSource, ShaderOptions } from './Shader';
import { DefinesMap } from './ShaderPreprocessor';
import { ShaderLanguage } from './ShaderChunks';

const logger = Logger.create('ShaderLibrary');

/**
 * Shader variant key (defines hash)
 */
type VariantKey = string;

/**
 * Shader load options
 */
export interface ShaderLoadOptions {
  /** Base URL for shader files */
  baseUrl?: string;
  /** File extensions */
  extensions?: {
    vertex?: string;
    fragment?: string;
  };
  /** Preprocessor defines */
  defines?: DefinesMap;
  /** Target shader language */
  language?: ShaderLanguage;
}

/**
 * Built-in shader descriptor
 */
export interface BuiltinShaderDescriptor {
  /** Shader name */
  name: string;
  /** Shader source */
  source: ShaderSource;
  /** Default defines */
  defines?: DefinesMap;
}

/**
 * Shader library for caching, variant management, and async loading.
 *
 * Features:
 * - Shader caching and deduplication
 * - Variant compilation with feature flags
 * - Async loading from URLs
 * - Built-in shader management
 * - Hot-reload support
 *
 * @example
 * ```typescript
 * const library = new ShaderLibrary(gl);
 *
 * // Register built-in shader
 * library.registerBuiltin({
 *   name: 'pbr',
 *   source: {
 *     vertex: pbrVertexSource,
 *     fragment: pbrFragmentSource
 *   }
 * });
 *
 * // Load shader asynchronously
 * const shader = await library.load('pbr', {
 *   defines: {
 *     USE_SHADOWS: 1,
 *     MAX_LIGHTS: 4
 *   }
 * });
 *
 * // Get shader variant
 * const shadowShader = library.getVariant('pbr', {
 *   USE_SHADOWS: 1,
 *   USE_PCF: 1
 * });
 *
 * // Cleanup
 * library.dispose();
 * ```
 */
export class ShaderLibrary implements IDisposable {
  /** WebGL rendering context */
  private gl: WebGL2RenderingContext;

  /** Shader cache (name -> base shader) */
  private shaders: Map<string, Shader>;

  /** Variant cache (name:variantKey -> shader) */
  private variants: Map<string, Shader>;

  /** Built-in shader sources */
  private builtins: Map<string, BuiltinShaderDescriptor>;

  /** Pending shader loads */
  private pending: Map<string, Promise<Shader>>;

  /** Disposed flag */
  private disposed: boolean;

  /** Default load options */
  private defaultLoadOptions: ShaderLoadOptions;

  /**
   * Creates a new shader library
   *
   * @param gl - WebGL rendering context
   * @param defaultLoadOptions - Default options for loading shaders
   */
  constructor(gl: WebGL2RenderingContext, defaultLoadOptions: ShaderLoadOptions = {}) {
    this.gl = gl;
    this.shaders = new Map();
    this.variants = new Map();
    this.builtins = new Map();
    this.pending = new Map();
    this.disposed = false;
    this.defaultLoadOptions = {
      baseUrl: '/shaders',
      extensions: {
        vertex: '.vert',
        fragment: '.frag'
      },
      ...defaultLoadOptions
    };

    logger.debug('Shader library initialized');
  }

  /**
   * Register a built-in shader
   *
   * @param descriptor - Built-in shader descriptor
   *
   * @example
   * ```typescript
   * library.registerBuiltin({
   *   name: 'pbr',
   *   source: {
   *     vertex: pbrVertSource,
   *     fragment: pbrFragSource
   *   },
   *   defines: {
   *     USE_IBL: 1
   *   }
   * });
   * ```
   */
  registerBuiltin(descriptor: BuiltinShaderDescriptor): void {
    if (this.builtins.has(descriptor.name)) {
      logger.warn(`Overwriting built-in shader: ${descriptor.name}`);
    }

    this.builtins.set(descriptor.name, descriptor);
    logger.debug(`Registered built-in shader: ${descriptor.name}`);
  }

  /**
   * Check if a shader is registered (built-in or loaded)
   *
   * @param name - Shader name
   * @returns True if shader exists
   */
  has(name: string): boolean {
    return this.shaders.has(name) || this.builtins.has(name);
  }

  /**
   * Get a shader (loads if not cached)
   *
   * @param name - Shader name
   * @param defines - Preprocessor defines for variant
   * @returns Shader instance or undefined
   *
   * @example
   * ```typescript
   * const shader = library.get('pbr', { USE_SHADOWS: 1 });
   * ```
   */
  get(name: string, defines?: DefinesMap): Shader | undefined {
    // Get variant if defines specified
    if (defines && Object.keys(defines).length > 0) {
      return this.getVariant(name, defines);
    }

    // Return cached shader
    if (this.shaders.has(name)) {
      return this.shaders.get(name);
    }

    // Try to compile built-in
    const builtin = this.builtins.get(name);
    if (builtin) {
      const shader = this.createShader(name, builtin.source, builtin.defines);
      if (shader) {
        this.shaders.set(name, shader);
        return shader;
      }
    }

    logger.warn(`Shader not found: ${name}`);
    return undefined;
  }

  /**
   * Get a shader variant with specific defines
   *
   * @param name - Base shader name
   * @param defines - Variant defines
   * @returns Shader variant or undefined
   *
   * @example
   * ```typescript
   * const variant = library.getVariant('pbr', {
   *   USE_SHADOWS: 1,
   *   USE_NORMAL_MAP: 1
   * });
   * ```
   */
  getVariant(name: string, defines: DefinesMap): Shader | undefined {
    const variantKey = this.getVariantKey(name, defines);

    // Return cached variant
    if (this.variants.has(variantKey)) {
      return this.variants.get(variantKey);
    }

    // Get base shader source
    let source: ShaderSource | undefined;
    let baseDefines: DefinesMap = {};

    if (this.shaders.has(name)) {
      // Use existing shader's source
      const baseShader = this.shaders.get(name)!;
      source = baseShader['source']; // Access private field
      baseDefines = baseShader['defines'];
    } else if (this.builtins.has(name)) {
      // Use built-in source
      const builtin = this.builtins.get(name)!;
      source = builtin.source;
      baseDefines = builtin.defines || {};
    }

    if (!source) {
      logger.warn(`Cannot create variant for unknown shader: ${name}`);
      return undefined;
    }

    // Merge defines
    const mergedDefines = { ...baseDefines, ...defines };

    // Create variant
    const variant = this.createShader(`${name}_variant`, source, mergedDefines);
    if (variant) {
      this.variants.set(variantKey, variant);
      logger.debug(`Created shader variant: ${variantKey}`);
      return variant;
    }

    return undefined;
  }

  /**
   * Load a shader asynchronously from URLs
   *
   * @param name - Shader name
   * @param options - Load options
   * @returns Promise resolving to shader
   *
   * @example
   * ```typescript
   * const shader = await library.load('pbr', {
   *   baseUrl: '/shaders',
   *   defines: { USE_SHADOWS: 1 }
   * });
   * ```
   */
  async load(name: string, options: ShaderLoadOptions = {}): Promise<Shader> {
    // Return cached shader
    if (this.shaders.has(name)) {
      return this.shaders.get(name)!;
    }

    // Return pending load
    if (this.pending.has(name)) {
      return this.pending.get(name)!;
    }

    // Check if built-in
    if (this.builtins.has(name)) {
      const shader = this.get(name);
      if (shader) return shader;
    }

    // Merge options
    const opts = { ...this.defaultLoadOptions, ...options };

    // Start load
    const loadPromise = this.loadFromUrls(name, opts);
    this.pending.set(name, loadPromise);

    try {
      const shader = await loadPromise;
      this.shaders.set(name, shader);
      this.pending.delete(name);
      logger.info(`Loaded shader: ${name}`);
      return shader;
    } catch (error) {
      this.pending.delete(name);
      logger.error(`Failed to load shader: ${name}`, error);
      throw error;
    }
  }

  /**
   * Load shader source from URLs
   *
   * @param name - Shader name
   * @param options - Load options
   * @returns Promise resolving to shader
   */
  private async loadFromUrls(name: string, options: ShaderLoadOptions): Promise<Shader> {
    const baseUrl = options.baseUrl || '';
    const vertExt = options.extensions?.vertex || '.vert';
    const fragExt = options.extensions?.fragment || '.frag';

    const vertUrl = `${baseUrl}/${name}${vertExt}`;
    const fragUrl = `${baseUrl}/${name}${fragExt}`;

    // Fetch both shaders
    const [vertResponse, fragResponse] = await Promise.all([
      fetch(vertUrl),
      fetch(fragUrl)
    ]);

    if (!vertResponse.ok) {
      throw new Error(`Failed to load vertex shader: ${vertUrl} (${vertResponse.status})`);
    }

    if (!fragResponse.ok) {
      throw new Error(`Failed to load fragment shader: ${fragUrl} (${fragResponse.status})`);
    }

    const [vertSource, fragSource] = await Promise.all([
      vertResponse.text(),
      fragResponse.text()
    ]);

    const source: ShaderSource = {
      vertex: vertSource,
      fragment: fragSource
    };

    return this.createShader(name, source, options.defines);
  }

  /**
   * Create a shader from source
   *
   * @param name - Shader name
   * @param source - Shader source
   * @param defines - Preprocessor defines
   * @returns Shader instance or undefined
   */
  private createShader(
    name: string,
    source: ShaderSource,
    defines?: DefinesMap
  ): Shader | undefined {
    try {
      const shaderOptions: ShaderOptions = {
        name,
        source,
        defines,
        language: this.defaultLoadOptions.language,
        gl: this.gl
      };

      const shader = new Shader(shaderOptions);

      if (!shader.isReady) {
        const errors = shader.getErrors();
        logger.error(`Shader compilation failed: ${name}`, errors);
        return undefined;
      }

      return shader;
    } catch (error) {
      logger.error(`Failed to create shader: ${name}`, error);
      return undefined;
    }
  }

  /**
   * Generate variant key from defines
   *
   * @param name - Base shader name
   * @param defines - Defines map
   * @returns Variant key string
   */
  private getVariantKey(name: string, defines: DefinesMap): VariantKey {
    const sortedEntries = Object.entries(defines).sort((a, b) => a[0].localeCompare(b[0]));
    const definesStr = sortedEntries.map(([k, v]) => `${k}=${v}`).join(',');
    return `${name}:${definesStr}`;
  }

  /**
   * Reload a shader (useful for hot-reload)
   *
   * @param name - Shader name
   * @returns Promise resolving to reloaded shader
   *
   * @example
   * ```typescript
   * // Reload shader from disk
   * const shader = await library.reload('pbr');
   * ```
   */
  async reload(name: string): Promise<Shader | undefined> {
    // Remove from caches
    const shader = this.shaders.get(name);
    if (shader) {
      shader.dispose();
      this.shaders.delete(name);
    }

    // Remove all variants
    const variantsToRemove: string[] = [];
    for (const [key] of this.variants) {
      if (key.startsWith(`${name}:`)) {
        variantsToRemove.push(key);
      }
    }

    for (const key of variantsToRemove) {
      const variant = this.variants.get(key);
      if (variant) {
        variant.dispose();
      }
      this.variants.delete(key);
    }

    // Reload
    try {
      const reloaded = await this.load(name);
      logger.info(`Reloaded shader: ${name}`);

      // Emit reload event
      EventBus.emit('asset:loaded', {
        assetId: name,
        assetType: 'shader'
      });

      return reloaded;
    } catch (error) {
      logger.error(`Failed to reload shader: ${name}`, error);
      return undefined;
    }
  }

  /**
   * Preload multiple shaders
   *
   * @param names - Array of shader names
   * @param options - Load options
   * @returns Promise resolving when all shaders are loaded
   *
   * @example
   * ```typescript
   * await library.preload(['pbr', 'skybox', 'shadow']);
   * ```
   */
  async preload(names: string[], options: ShaderLoadOptions = {}): Promise<void> {
    const promises = names.map(name => this.load(name, options));
    await Promise.all(promises);
    logger.info(`Preloaded ${names.length} shaders`);
  }

  /**
   * Get all shader names
   *
   * @returns Array of shader names
   */
  getShaderNames(): string[] {
    const names = new Set<string>();

    for (const name of this.shaders.keys()) {
      names.add(name);
    }

    for (const name of this.builtins.keys()) {
      names.add(name);
    }

    return Array.from(names);
  }

  /**
   * Get all variant keys for a shader
   *
   * @param name - Shader name
   * @returns Array of variant keys
   */
  getVariantKeys(name: string): string[] {
    const keys: string[] = [];

    for (const [key] of this.variants) {
      if (key.startsWith(`${name}:`)) {
        keys.push(key);
      }
    }

    return keys;
  }

  /**
   * Get library statistics
   *
   * @returns Library stats
   */
  getStats(): {
    shaders: number;
    variants: number;
    builtins: number;
    pending: number;
  } {
    return {
      shaders: this.shaders.size,
      variants: this.variants.size,
      builtins: this.builtins.size,
      pending: this.pending.size
    };
  }

  /**
   * Clear all cached shaders and variants
   */
  clear(): void {
    // Dispose all shaders
    for (const shader of this.shaders.values()) {
      shader.dispose();
    }
    this.shaders.clear();

    // Dispose all variants
    for (const variant of this.variants.values()) {
      variant.dispose();
    }
    this.variants.clear();

    // Clear pending
    this.pending.clear();

    logger.debug('Cleared shader library');
  }

  /**
   * Dispose of library and all shaders
   */
  dispose(): void {
    if (this.disposed) return;

    this.clear();
    this.builtins.clear();
    this.disposed = true;

    logger.debug('Disposed shader library');
  }

  /**
   * Check if library is disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }
}

/**
 * Global shader library instance
 */
let globalLibrary: ShaderLibrary | null = null;

/**
 * Initialize global shader library
 *
 * @param gl - WebGL rendering context
 * @param options - Load options
 * @returns Global shader library instance
 *
 * @example
 * ```typescript
 * const library = initShaderLibrary(gl, {
 *   baseUrl: '/assets/shaders'
 * });
 * ```
 */
export function initShaderLibrary(
  gl: WebGL2RenderingContext,
  options?: ShaderLoadOptions
): ShaderLibrary {
  if (globalLibrary) {
    globalLibrary.dispose();
  }

  globalLibrary = new ShaderLibrary(gl, options);
  return globalLibrary;
}

/**
 * Get global shader library instance
 *
 * @returns Global shader library or null if not initialized
 */
export function getShaderLibrary(): ShaderLibrary | null {
  return globalLibrary;
}
