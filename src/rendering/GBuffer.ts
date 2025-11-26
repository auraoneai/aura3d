/**
 * @module Rendering/Core
 * @description
 * Geometry buffer (G-Buffer) for deferred rendering in G3D 5.0 engine.
 * Manages multiple render targets for material properties.
 */

import { Logger } from '../core/Logger';
import { RenderDevice } from './RenderDevice';
import { TextureFormat, TextureUsage } from './gpu/GPUDevice';

const logger = Logger.create('GBuffer');

/**
 * G-Buffer configuration.
 */
export interface GBufferConfig {
  /** Enable thin G-Buffer mode (fewer textures) */
  thinMode?: boolean;
  /** Enable velocity buffer for motion vectors */
  enableVelocity?: boolean;
  /** Enable emissive buffer */
  enableEmissive?: boolean;
  /** Use high precision formats */
  highPrecision?: boolean;
  /** Custom format overrides */
  formats?: Partial<GBufferFormats>;
}

/**
 * G-Buffer texture formats.
 */
export interface GBufferFormats {
  /** Albedo format (RGB: albedo, A: metallic) */
  albedo: TextureFormat;
  /** Normal format (RG: encoded normal, BA: roughness/AO) */
  normal: TextureFormat;
  /** Depth format */
  depth: TextureFormat;
  /** Velocity format (RG: motion vectors) */
  velocity: TextureFormat;
  /** Emissive format (RGB: emissive color) */
  emissive: TextureFormat;
}

/**
 * G-Buffer attachment names for shader binding.
 */
export enum GBufferAttachment {
  Albedo = 'albedo',
  Normal = 'normal',
  Depth = 'depth',
  Velocity = 'velocity',
  Emissive = 'emissive',
}

/**
 * Geometry buffer for deferred rendering.
 * Stores surface properties in multiple render targets for lighting pass.
 *
 * Layout:
 * - Albedo: RGB = base color, A = metallic
 * - Normal: RG = octahedron-encoded normal, B = roughness, A = ambient occlusion
 * - Depth: R = depth (32-bit float or hardware depth)
 * - Velocity: RG = screen-space motion vectors (optional)
 * - Emissive: RGB = emissive color (optional)
 *
 * @example
 * ```typescript
 * const gbuffer = new GBuffer();
 * gbuffer.initialize(device, 1920, 1080, {
 *   highPrecision: true,
 *   enableVelocity: true,
 *   enableEmissive: true,
 * });
 *
 * // Geometry pass writes to G-Buffer
 * const albedoView = gbuffer.albedo.createView();
 * const normalView = gbuffer.normal.createView();
 * const depthView = gbuffer.depth.createView();
 *
 * // Lighting pass reads from G-Buffer
 * const bindGroup = gbuffer.bindGroup;
 *
 * // Resize on window change
 * gbuffer.resize(newWidth, newHeight);
 *
 * // Clean up
 * gbuffer.dispose();
 * ```
 */
export class GBuffer {
  /**
   * GPU device.
   */
  private _device: RenderDevice | null = null;

  /**
   * Width in pixels.
   */
  private _width: number = 0;

  /**
   * Height in pixels.
   */
  private _height: number = 0;

  /**
   * Configuration.
   */
  private _config: Required<GBufferConfig> = {
    thinMode: false,
    enableVelocity: true,
    enableEmissive: true,
    highPrecision: false,
    formats: {},
  };

  /**
   * Texture formats in use.
   */
  private _formats: GBufferFormats | null = null;

  /**
   * Albedo texture (RGB: albedo, A: metallic).
   */
  private _albedoTexture: any = null;

  /**
   * Normal texture (RG: octahedron normal, BA: roughness/AO).
   */
  private _normalTexture: any = null;

  /**
   * Depth texture.
   */
  private _depthTexture: any = null;

  /**
   * Velocity texture (RG: motion vectors).
   */
  private _velocityTexture: any = null;

  /**
   * Emissive texture (RGB: emissive color).
   */
  private _emissiveTexture: any = null;

  /**
   * Bind group for lighting pass access.
   */
  private _bindGroup: any = null;

  /**
   * Whether the G-Buffer is initialized.
   */
  private _initialized: boolean = false;

  /**
   * Creates a new GBuffer instance.
   *
   * @example
   * ```typescript
   * const gbuffer = new GBuffer();
   * ```
   */
  constructor() {
    logger.debug('GBuffer created');
  }

  /**
   * Initializes the G-Buffer with the specified dimensions.
   *
   * @param device - GPU device
   * @param width - Width in pixels
   * @param height - Height in pixels
   * @param config - Configuration (optional)
   *
   * @example
   * ```typescript
   * gbuffer.initialize(device, 1920, 1080, {
   *   highPrecision: true,
   *   enableVelocity: true,
   * });
   * ```
   */
  initialize(
    device: RenderDevice,
    width: number,
    height: number,
    config: GBufferConfig = {}
  ): void {
    if (this._initialized) {
      logger.warn('GBuffer already initialized, disposing previous resources');
      this.dispose();
    }

    this._device = device;
    this._width = width;
    this._height = height;
    this._config = {
      thinMode: config.thinMode ?? false,
      enableVelocity: config.enableVelocity ?? true,
      enableEmissive: config.enableEmissive ?? true,
      highPrecision: config.highPrecision ?? false,
      formats: config.formats ?? {},
    };

    // Determine formats based on configuration and capabilities
    this._formats = this._selectFormats();

    // Create textures
    this._createTextures();

    // Create bind group for lighting pass
    this._createBindGroup();

    this._initialized = true;

    logger.info(
      `GBuffer initialized: ${width}x${height}, ` +
        `albedo=${this._formats.albedo}, normal=${this._formats.normal}, ` +
        `depth=${this._formats.depth}` +
        (this._config.enableVelocity ? `, velocity=${this._formats.velocity}` : '') +
        (this._config.enableEmissive ? `, emissive=${this._formats.emissive}` : '')
    );
  }

  /**
   * Resizes the G-Buffer to new dimensions.
   *
   * @param width - New width in pixels
   * @param height - New height in pixels
   *
   * @example
   * ```typescript
   * gbuffer.resize(2560, 1440);
   * ```
   */
  resize(width: number, height: number): void {
    if (!this._initialized || !this._device) {
      logger.warn('Cannot resize: GBuffer not initialized');
      return;
    }

    if (width === this._width && height === this._height) {
      return;
    }

    logger.info(`Resizing GBuffer from ${this._width}x${this._height} to ${width}x${height}`);

    // Dispose old textures
    this._destroyTextures();

    // Update dimensions
    this._width = width;
    this._height = height;

    // Recreate textures
    this._createTextures();

    // Recreate bind group
    this._createBindGroup();
  }

  /**
   * Gets the albedo texture (RGB: albedo, A: metallic).
   * @returns Albedo texture
   */
  get albedo(): any {
    return this._albedoTexture;
  }

  /**
   * Gets the normal texture (RG: octahedron normal, BA: roughness/AO).
   * @returns Normal texture
   */
  get normal(): any {
    return this._normalTexture;
  }

  /**
   * Gets the depth texture.
   * @returns Depth texture
   */
  get depth(): any {
    return this._depthTexture;
  }

  /**
   * Gets the velocity texture (RG: motion vectors).
   * @returns Velocity texture or null if disabled
   */
  get velocity(): any | null {
    return this._velocityTexture;
  }

  /**
   * Gets the emissive texture (RGB: emissive color).
   * @returns Emissive texture or null if disabled
   */
  get emissive(): any | null {
    return this._emissiveTexture;
  }

  /**
   * Gets the bind group for shader access to G-Buffer textures.
   * @returns Bind group
   */
  get bindGroup(): any {
    return this._bindGroup;
  }

  /**
   * Gets the G-Buffer width.
   * @returns Width in pixels
   */
  get width(): number {
    return this._width;
  }

  /**
   * Gets the G-Buffer height.
   * @returns Height in pixels
   */
  get height(): number {
    return this._height;
  }

  /**
   * Gets the texture formats in use.
   * @returns Texture formats
   */
  get formats(): Readonly<GBufferFormats> {
    return this._formats!;
  }

  /**
   * Checks if the G-Buffer is initialized.
   * @returns True if initialized
   */
  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Selects appropriate texture formats based on configuration and capabilities.
   * @private
   */
  private _selectFormats(): GBufferFormats {
    const caps = this._device!.getCapabilities();

    // Default formats
    let albedoFormat = TextureFormat.RGBA8Unorm;
    let normalFormat = TextureFormat.RGBA8Unorm;
    let depthFormat = caps.supportsDepth32Float
      ? TextureFormat.Depth32Float
      : TextureFormat.Depth24Plus;
    let velocityFormat = TextureFormat.RG16Float;
    let emissiveFormat = TextureFormat.RGBA8Unorm;

    // High precision mode
    if (this._config.highPrecision) {
      albedoFormat = TextureFormat.RGBA16Float;
      normalFormat = TextureFormat.RGBA16Float;
      emissiveFormat = TextureFormat.RGBA16Float;
    }

    // Thin mode (more compact)
    if (this._config.thinMode) {
      albedoFormat = TextureFormat.RGBA8Unorm;
      normalFormat = TextureFormat.RGBA8Unorm;
    }

    // Apply custom format overrides
    return {
      albedo: this._config.formats.albedo ?? albedoFormat,
      normal: this._config.formats.normal ?? normalFormat,
      depth: this._config.formats.depth ?? depthFormat,
      velocity: this._config.formats.velocity ?? velocityFormat,
      emissive: this._config.formats.emissive ?? emissiveFormat,
    };
  }

  /**
   * Creates all G-Buffer textures.
   * @private
   */
  private _createTextures(): void {
    const device = this._device!;
    const formats = this._formats!;

    // Albedo texture
    this._albedoTexture = device.createTexture({
      size: { width: this._width, height: this._height },
      format: formats.albedo,
      usage: TextureUsage.RenderAttachment | TextureUsage.TextureBinding,
      label: 'GBuffer_Albedo',
    });

    // Normal texture
    this._normalTexture = device.createTexture({
      size: { width: this._width, height: this._height },
      format: formats.normal,
      usage: TextureUsage.RenderAttachment | TextureUsage.TextureBinding,
      label: 'GBuffer_Normal',
    });

    // Depth texture
    this._depthTexture = device.createTexture({
      size: { width: this._width, height: this._height },
      format: formats.depth,
      usage: TextureUsage.RenderAttachment | TextureUsage.TextureBinding,
      label: 'GBuffer_Depth',
    });

    // Velocity texture (optional)
    if (this._config.enableVelocity) {
      this._velocityTexture = device.createTexture({
        size: { width: this._width, height: this._height },
        format: formats.velocity,
        usage: TextureUsage.RenderAttachment | TextureUsage.TextureBinding,
        label: 'GBuffer_Velocity',
      });
    }

    // Emissive texture (optional)
    if (this._config.enableEmissive) {
      this._emissiveTexture = device.createTexture({
        size: { width: this._width, height: this._height },
        format: formats.emissive,
        usage: TextureUsage.RenderAttachment | TextureUsage.TextureBinding,
        label: 'GBuffer_Emissive',
      });
    }

    logger.debug('Created G-Buffer textures');
  }

  /**
   * Creates bind group for shader access.
   *
   * The bind group layout is determined by the lighting pass that consumes
   * the G-Buffer textures. This method creates texture views for all G-Buffer
   * attachments that can be bound to the lighting shader.
   *
   * @private
   */
  private _createBindGroup(): void {
    // Create texture views for all G-Buffer attachments
    // These views will be used by the lighting pass to sample G-Buffer data
    if (this._albedoTexture) {
      this._albedoTextureView = this._albedoTexture.createView?.() ?? this._albedoTexture;
    }
    if (this._normalTexture) {
      this._normalTextureView = this._normalTexture.createView?.() ?? this._normalTexture;
    }
    if (this._depthTexture) {
      this._depthTextureView = this._depthTexture.createView?.() ?? this._depthTexture;
    }
    if (this._materialTexture) {
      this._materialTextureView = this._materialTexture.createView?.() ?? this._materialTexture;
    }
    if (this._emissiveTexture) {
      this._emissiveTextureView = this._emissiveTexture.createView?.() ?? this._emissiveTexture;
    }
    if (this._velocityTexture) {
      this._velocityTextureView = this._velocityTexture.createView?.() ?? this._velocityTexture;
    }

    logger.trace('Created G-Buffer bind group');
  }

  /**
   * Destroys all G-Buffer textures.
   * @private
   */
  private _destroyTextures(): void {
    if (!this._device) return;

    if (this._albedoTexture) {
      this._device.destroy(this._albedoTexture);
      this._albedoTexture = null;
    }

    if (this._normalTexture) {
      this._device.destroy(this._normalTexture);
      this._normalTexture = null;
    }

    if (this._depthTexture) {
      this._device.destroy(this._depthTexture);
      this._depthTexture = null;
    }

    if (this._velocityTexture) {
      this._device.destroy(this._velocityTexture);
      this._velocityTexture = null;
    }

    if (this._emissiveTexture) {
      this._device.destroy(this._emissiveTexture);
      this._emissiveTexture = null;
    }

    logger.trace('Destroyed G-Buffer textures');
  }

  /**
   * Disposes of the G-Buffer and releases all resources.
   *
   * @example
   * ```typescript
   * gbuffer.dispose();
   * ```
   */
  dispose(): void {
    if (!this._initialized) {
      return;
    }

    this._destroyTextures();

    this._bindGroup = null;
    this._device = null;
    this._formats = null;
    this._initialized = false;

    logger.info('GBuffer disposed');
  }

  /**
   * Gets memory usage statistics.
   *
   * @returns Memory usage in bytes
   *
   * @example
   * ```typescript
   * const usage = gbuffer.getMemoryUsage();
   * console.log(`G-Buffer memory: ${usage / 1024 / 1024} MB`);
   * ```
   */
  getMemoryUsage(): number {
    if (!this._initialized) {
      return 0;
    }

    const pixelCount = this._width * this._height;
    let totalBytes = 0;

    // Calculate bytes per format
    const getBytesPerPixel = (format: TextureFormat): number => {
      if (format.includes('rgba8')) return 4;
      if (format.includes('rgba16')) return 8;
      if (format.includes('rgba32')) return 16;
      if (format.includes('rg16')) return 4;
      if (format.includes('depth32')) return 4;
      if (format.includes('depth24')) return 4;
      return 4; // Default
    };

    totalBytes += pixelCount * getBytesPerPixel(this._formats!.albedo);
    totalBytes += pixelCount * getBytesPerPixel(this._formats!.normal);
    totalBytes += pixelCount * getBytesPerPixel(this._formats!.depth);

    if (this._config.enableVelocity) {
      totalBytes += pixelCount * getBytesPerPixel(this._formats!.velocity);
    }

    if (this._config.enableEmissive) {
      totalBytes += pixelCount * getBytesPerPixel(this._formats!.emissive);
    }

    return totalBytes;
  }
}
