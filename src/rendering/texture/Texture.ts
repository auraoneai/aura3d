import { Logger } from '../../core/Logger';
import { IdGenerator } from '../../core/IdGenerator';

const logger = Logger.create('Texture');

/**
 * Texture types supported by the rendering engine.
 */
export enum TextureType {
  /** 2D texture for standard images */
  Texture2D = 'Texture2D',
  /** Cube texture for skyboxes and environment maps */
  TextureCube = 'TextureCube',
  /** 2D array texture for texture atlases */
  Texture2DArray = 'Texture2DArray',
  /** 3D volume texture for volumetric effects */
  Texture3D = 'Texture3D',
}

/**
 * Texture filtering modes.
 */
export enum TextureFilter {
  /** No filtering (pixelated) */
  Nearest = 'Nearest',
  /** Linear interpolation (smooth) */
  Linear = 'Linear',
  /** Nearest with mipmaps */
  NearestMipmapNearest = 'NearestMipmapNearest',
  /** Linear with nearest mipmap */
  LinearMipmapNearest = 'LinearMipmapNearest',
  /** Nearest with linear mipmap */
  NearestMipmapLinear = 'NearestMipmapLinear',
  /** Trilinear filtering (best quality) */
  LinearMipmapLinear = 'LinearMipmapLinear',
}

/**
 * Texture wrapping modes.
 */
export enum TextureWrap {
  /** Repeat texture coordinates */
  Repeat = 'Repeat',
  /** Clamp to edge */
  ClampToEdge = 'ClampToEdge',
  /** Mirror repeat */
  MirroredRepeat = 'MirroredRepeat',
}

/**
 * Texture formats.
 */
export enum TextureFormat {
  /** 8-bit red channel */
  R8 = 'R8',
  /** 16-bit red channel (float) */
  R16F = 'R16F',
  /** 32-bit red channel (float) */
  R32F = 'R32F',
  /** 8-bit RG channels */
  RG8 = 'RG8',
  /** 16-bit RG channels (float) */
  RG16F = 'RG16F',
  /** 32-bit RG channels (float) */
  RG32F = 'RG32F',
  /** 8-bit RGB channels */
  RGB8 = 'RGB8',
  /** 8-bit RGBA channels */
  RGBA8 = 'RGBA8',
  /** 16-bit RGBA channels (float) */
  RGBA16F = 'RGBA16F',
  /** 32-bit RGBA channels (float) */
  RGBA32F = 'RGBA32F',
  /** 16-bit depth */
  Depth16 = 'Depth16',
  /** 24-bit depth */
  Depth24 = 'Depth24',
  /** 32-bit depth (float) */
  Depth32F = 'Depth32F',
  /** 24-bit depth + 8-bit stencil */
  Depth24Stencil8 = 'Depth24Stencil8',
  /** BC1 compressed (DXT1) */
  BC1 = 'BC1',
  /** BC3 compressed (DXT5) */
  BC3 = 'BC3',
  /** BC4 compressed (single channel) */
  BC4 = 'BC4',
  /** BC5 compressed (dual channel) */
  BC5 = 'BC5',
  /** BC6H compressed (HDR) */
  BC6H = 'BC6H',
  /** BC7 compressed (high quality) */
  BC7 = 'BC7',
}

/**
 * Texture descriptor for creation.
 */
export interface TextureDescriptor {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Depth for 3D textures (default: 1) */
  depth?: number;
  /** Array layers for 2D array textures (default: 1) */
  arrayLayers?: number;
  /** Texture format */
  format: TextureFormat;
  /** Number of mipmap levels (0 = auto-generate max) */
  mipLevels?: number;
  /** Minification filter */
  minFilter?: TextureFilter;
  /** Magnification filter */
  magFilter?: TextureFilter;
  /** Wrap mode for U coordinate */
  wrapU?: TextureWrap;
  /** Wrap mode for V coordinate */
  wrapV?: TextureWrap;
  /** Wrap mode for W coordinate (3D textures) */
  wrapW?: TextureWrap;
  /** Anisotropic filtering level (1-16) */
  anisotropy?: number;
  /** Optional label for debugging */
  label?: string;
}

/**
 * Texture data for uploading to GPU.
 */
export interface TextureData {
  /** Image data source */
  data: ImageData | HTMLImageElement | HTMLCanvasElement | ArrayBufferView | null;
  /** Mipmap level (default: 0) */
  level?: number;
  /** X offset for sub-region updates */
  xOffset?: number;
  /** Y offset for sub-region updates */
  yOffset?: number;
  /** Z offset for 3D textures */
  zOffset?: number;
  /** Array layer for 2D array textures */
  layer?: number;
  /** Cube face for cube textures */
  face?: CubeFace;
}

/**
 * Cube map face indices.
 */
export enum CubeFace {
  PositiveX = 0,
  NegativeX = 1,
  PositiveY = 2,
  NegativeY = 3,
  PositiveZ = 4,
  NegativeZ = 5,
}

/**
 * Represents a GPU texture with comprehensive mipmap and parameter management.
 * Supports 2D, Cube, Array, and 3D texture types with automatic resource tracking.
 *
 * @example
 * ```typescript
 * // Create a standard 2D texture
 * const texture = new Texture({
 *   width: 512,
 *   height: 512,
 *   format: TextureFormat.RGBA8,
 *   minFilter: TextureFilter.LinearMipmapLinear,
 *   anisotropy: 16,
 * });
 *
 * // Upload image data
 * texture.setData({
 *   data: imageElement,
 * });
 *
 * // Generate mipmaps
 * texture.generateMipmaps();
 *
 * // Create a cube texture for environment mapping
 * const cubemap = Texture.createCube({
 *   width: 1024,
 *   height: 1024,
 *   format: TextureFormat.RGBA16F,
 * });
 *
 * // Upload each face
 * for (let i = 0; i < 6; i++) {
 *   cubemap.setData({
 *     data: faceImages[i],
 *     face: i,
 *   });
 * }
 * ```
 */
export class Texture {
  /** Unique texture identifier */
  readonly id: string;

  /** Texture type */
  readonly type: TextureType;

  /** Width in pixels */
  width: number;

  /** Height in pixels */
  height: number;

  /** Depth for 3D textures */
  readonly depth: number;

  /** Number of array layers */
  readonly arrayLayers: number;

  /** Texture format */
  readonly format: TextureFormat;

  /** Number of mipmap levels */
  readonly mipLevels: number;

  /** Minification filter */
  minFilter: TextureFilter;

  /** Magnification filter */
  magFilter: TextureFilter;

  /** U-axis wrap mode */
  wrapU: TextureWrap;

  /** V-axis wrap mode */
  wrapV: TextureWrap;

  /** W-axis wrap mode */
  wrapW: TextureWrap;

  /** Anisotropic filtering level */
  anisotropy: number;

  /** Debug label */
  label: string;

  /** WebGL texture handle */
  private glTexture: WebGLTexture | null = null;

  /** Whether texture has been uploaded to GPU */
  private uploaded = false;

  /** Whether mipmaps have been generated */
  private mipmapsGenerated = false;

  /** GPU memory usage in bytes */
  private memoryUsage = 0;

  /**
   * Creates a new Texture instance.
   *
   * @param descriptor - Texture creation descriptor
   *
   * @example
   * ```typescript
   * const texture = new Texture({
   *   width: 1024,
   *   height: 1024,
   *   format: TextureFormat.RGBA8,
   *   minFilter: TextureFilter.LinearMipmapLinear,
   *   magFilter: TextureFilter.Linear,
   *   wrapU: TextureWrap.Repeat,
   *   wrapV: TextureWrap.Repeat,
   *   anisotropy: 16,
   *   label: 'MainTexture',
   * });
   * ```
   */
  constructor(descriptor: TextureDescriptor) {
    this.id = IdGenerator.nextAssetId();
    this.type = TextureType.Texture2D;
    this.width = descriptor.width;
    this.height = descriptor.height;
    this.depth = descriptor.depth || 1;
    this.arrayLayers = descriptor.arrayLayers || 1;
    this.format = descriptor.format;
    this.mipLevels = descriptor.mipLevels || this.calculateMaxMipLevels();
    this.minFilter = descriptor.minFilter || TextureFilter.LinearMipmapLinear;
    this.magFilter = descriptor.magFilter || TextureFilter.Linear;
    this.wrapU = descriptor.wrapU || TextureWrap.Repeat;
    this.wrapV = descriptor.wrapV || TextureWrap.Repeat;
    this.wrapW = descriptor.wrapW || TextureWrap.Repeat;
    this.anisotropy = Math.max(1, Math.min(16, descriptor.anisotropy || 1));
    this.label = descriptor.label || `Texture_${this.id}`;

    this.memoryUsage = this.calculateMemoryUsage();

    logger.debug(`Created texture: ${this.label}`, {
      width: this.width,
      height: this.height,
      format: this.format,
      mipLevels: this.mipLevels,
      memoryMB: (this.memoryUsage / (1024 * 1024)).toFixed(2),
    });
  }

  /**
   * Creates a 2D texture.
   *
   * @param descriptor - Texture descriptor
   * @returns New 2D texture
   *
   * @example
   * ```typescript
   * const texture = Texture.create2D({
   *   width: 512,
   *   height: 512,
   *   format: TextureFormat.RGBA8,
   * });
   * ```
   */
  static create2D(descriptor: TextureDescriptor): Texture {
    return new Texture(descriptor);
  }

  /**
   * Creates a cube texture for environment maps.
   *
   * @param descriptor - Texture descriptor (width must equal height)
   * @returns New cube texture
   *
   * @example
   * ```typescript
   * const cubemap = Texture.createCube({
   *   width: 1024,
   *   height: 1024,
   *   format: TextureFormat.RGBA16F,
   * });
   * ```
   */
  static createCube(descriptor: TextureDescriptor): Texture {
    if (descriptor.width !== descriptor.height) {
      throw new Error('Cube textures must have equal width and height');
    }
    const texture = new Texture(descriptor);
    (texture as any).type = TextureType.TextureCube;
    return texture;
  }

  /**
   * Creates a 2D array texture.
   *
   * @param descriptor - Texture descriptor with arrayLayers
   * @returns New 2D array texture
   *
   * @example
   * ```typescript
   * const arrayTex = Texture.create2DArray({
   *   width: 256,
   *   height: 256,
   *   arrayLayers: 8,
   *   format: TextureFormat.RGBA8,
   * });
   * ```
   */
  static create2DArray(descriptor: TextureDescriptor): Texture {
    if (!descriptor.arrayLayers || descriptor.arrayLayers < 1) {
      throw new Error('2D array textures must specify arrayLayers >= 1');
    }
    const texture = new Texture(descriptor);
    (texture as any).type = TextureType.Texture2DArray;
    return texture;
  }

  /**
   * Creates a 3D volume texture.
   *
   * @param descriptor - Texture descriptor with depth
   * @returns New 3D texture
   *
   * @example
   * ```typescript
   * const volumeTex = Texture.create3D({
   *   width: 128,
   *   height: 128,
   *   depth: 128,
   *   format: TextureFormat.RGBA8,
   * });
   * ```
   */
  static create3D(descriptor: TextureDescriptor): Texture {
    if (!descriptor.depth || descriptor.depth < 1) {
      throw new Error('3D textures must specify depth >= 1');
    }
    const texture = new Texture(descriptor);
    (texture as any).type = TextureType.Texture3D;
    return texture;
  }

  /**
   * Uploads texture data to the GPU.
   *
   * @param textureData - Texture data to upload
   *
   * @example
   * ```typescript
   * texture.setData({ data: imageElement });
   * texture.setData({ data: pixelArray, level: 1 }); // Upload to mip level 1
   * cubemap.setData({ data: faceImage, face: CubeFace.PositiveX });
   * ```
   */
  setData(textureData: TextureData): void {
    // In a real implementation, this would upload to WebGL
    // For now, we track that data has been uploaded
    this.uploaded = true;

    const level = textureData.level || 0;
    logger.trace(`Uploaded data to ${this.label} mip ${level}`);
  }

  /**
   * Generates mipmaps for the texture.
   * Should be called after uploading the base level (level 0).
   *
   * @example
   * ```typescript
   * texture.setData({ data: imageElement });
   * texture.generateMipmaps();
   * ```
   */
  generateMipmaps(): void {
    if (!this.uploaded) {
      logger.warn(`Cannot generate mipmaps for ${this.label}: no data uploaded`);
      return;
    }

    if (this.mipLevels <= 1) {
      logger.debug(`Skipping mipmap generation for ${this.label}: only 1 mip level`);
      return;
    }

    // In a real implementation, this would call gl.generateMipmap()
    this.mipmapsGenerated = true;
    logger.debug(`Generated ${this.mipLevels} mipmap levels for ${this.label}`);
  }

  /**
   * Resizes the texture to new dimensions.
   * Clears existing data and resets upload state.
   *
   * @param width - New width
   * @param height - New height
   *
   * @example
   * ```typescript
   * texture.resize(1024, 1024);
   * texture.setData({ data: newImageData });
   * ```
   */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) {
      return;
    }

    this.width = width;
    this.height = height;
    this.uploaded = false;
    this.mipmapsGenerated = false;

    const oldMemory = this.memoryUsage;
    this.memoryUsage = this.calculateMemoryUsage();

    logger.debug(`Resized ${this.label} to ${width}x${height}`, {
      oldMemoryMB: (oldMemory / (1024 * 1024)).toFixed(2),
      newMemoryMB: (this.memoryUsage / (1024 * 1024)).toFixed(2),
    });
  }

  /**
   * Updates texture filtering parameters.
   *
   * @param minFilter - Minification filter
   * @param magFilter - Magnification filter
   *
   * @example
   * ```typescript
   * texture.setFilter(
   *   TextureFilter.LinearMipmapLinear,
   *   TextureFilter.Linear
   * );
   * ```
   */
  setFilter(minFilter: TextureFilter, magFilter: TextureFilter): void {
    this.minFilter = minFilter;
    this.magFilter = magFilter;
    logger.trace(`Updated filter for ${this.label}`, { minFilter, magFilter });
  }

  /**
   * Updates texture wrapping parameters.
   *
   * @param wrapU - U-axis wrap mode
   * @param wrapV - V-axis wrap mode
   * @param wrapW - W-axis wrap mode (optional, for 3D textures)
   *
   * @example
   * ```typescript
   * texture.setWrap(TextureWrap.Repeat, TextureWrap.ClampToEdge);
   * ```
   */
  setWrap(wrapU: TextureWrap, wrapV: TextureWrap, wrapW?: TextureWrap): void {
    this.wrapU = wrapU;
    this.wrapV = wrapV;
    if (wrapW !== undefined) {
      this.wrapW = wrapW;
    }
    logger.trace(`Updated wrap modes for ${this.label}`, { wrapU, wrapV, wrapW });
  }

  /**
   * Sets anisotropic filtering level.
   *
   * @param level - Anisotropy level (1-16)
   *
   * @example
   * ```typescript
   * texture.setAnisotropy(16); // Maximum quality
   * ```
   */
  setAnisotropy(level: number): void {
    this.anisotropy = Math.max(1, Math.min(16, level));
    logger.trace(`Updated anisotropy for ${this.label} to ${this.anisotropy}`);
  }

  /**
   * Gets whether the texture has been uploaded to GPU.
   *
   * @returns True if texture data has been uploaded
   */
  isUploaded(): boolean {
    return this.uploaded;
  }

  /**
   * Gets whether mipmaps have been generated.
   *
   * @returns True if mipmaps are available
   */
  hasMipmaps(): boolean {
    return this.mipmapsGenerated;
  }

  /**
   * Gets estimated GPU memory usage in bytes.
   *
   * @returns Memory usage in bytes
   */
  getMemoryUsage(): number {
    return this.memoryUsage;
  }

  /**
   * Gets the WebGL texture handle.
   * Returns null if not yet created.
   *
   * @returns WebGL texture or null
   */
  getGLTexture(): WebGLTexture | null {
    return this.glTexture;
  }

  /**
   * Sets the WebGL texture handle.
   * Should only be called by the rendering backend.
   *
   * @param glTexture - WebGL texture handle
   */
  setGLTexture(glTexture: WebGLTexture | null): void {
    this.glTexture = glTexture;
  }

  /**
   * Destroys the texture and releases GPU resources.
   * Texture should not be used after calling this method.
   *
   * @example
   * ```typescript
   * texture.destroy();
   * ```
   */
  destroy(): void {
    if (this.glTexture) {
      // In a real implementation, would call gl.deleteTexture()
      this.glTexture = null;
    }
    this.uploaded = false;
    this.mipmapsGenerated = false;
    logger.debug(`Destroyed texture: ${this.label}`);
  }

  /**
   * Calculates the maximum number of mipmap levels for current dimensions.
   *
   * @returns Maximum mip levels
   */
  private calculateMaxMipLevels(): number {
    const maxDim = Math.max(this.width, this.height, this.depth);
    return Math.floor(Math.log2(maxDim)) + 1;
  }

  /**
   * Calculates estimated GPU memory usage including all mip levels.
   *
   * @returns Memory usage in bytes
   */
  private calculateMemoryUsage(): number {
    const bytesPerPixel = this.getBytesPerPixel(this.format);
    let totalBytes = 0;

    // Calculate memory for each mip level
    for (let level = 0; level < this.mipLevels; level++) {
      const mipWidth = Math.max(1, this.width >> level);
      const mipHeight = Math.max(1, this.height >> level);
      const mipDepth = Math.max(1, this.depth >> level);

      let levelBytes = mipWidth * mipHeight * mipDepth * bytesPerPixel;

      // Multiply by array layers for array textures
      if (this.type === TextureType.Texture2DArray) {
        levelBytes *= this.arrayLayers;
      }

      // Multiply by 6 for cube textures
      if (this.type === TextureType.TextureCube) {
        levelBytes *= 6;
      }

      totalBytes += levelBytes;
    }

    return totalBytes;
  }

  /**
   * Gets bytes per pixel for a texture format.
   *
   * @param format - Texture format
   * @returns Bytes per pixel
   */
  private getBytesPerPixel(format: TextureFormat): number {
    switch (format) {
      case TextureFormat.R8: return 1;
      case TextureFormat.R16F: return 2;
      case TextureFormat.R32F: return 4;
      case TextureFormat.RG8: return 2;
      case TextureFormat.RG16F: return 4;
      case TextureFormat.RG32F: return 8;
      case TextureFormat.RGB8: return 3;
      case TextureFormat.RGBA8: return 4;
      case TextureFormat.RGBA16F: return 8;
      case TextureFormat.RGBA32F: return 16;
      case TextureFormat.Depth16: return 2;
      case TextureFormat.Depth24: return 3;
      case TextureFormat.Depth32F: return 4;
      case TextureFormat.Depth24Stencil8: return 4;
      case TextureFormat.BC1: return 0.5; // 4 bits per pixel
      case TextureFormat.BC3: return 1; // 8 bits per pixel
      case TextureFormat.BC4: return 0.5;
      case TextureFormat.BC5: return 1;
      case TextureFormat.BC6H: return 1;
      case TextureFormat.BC7: return 1;
      default: return 4;
    }
  }

  /**
   * Converts texture to JSON representation.
   *
   * @returns JSON object
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id,
      type: this.type,
      width: this.width,
      height: this.height,
      depth: this.depth,
      arrayLayers: this.arrayLayers,
      format: this.format,
      mipLevels: this.mipLevels,
      minFilter: this.minFilter,
      magFilter: this.magFilter,
      wrapU: this.wrapU,
      wrapV: this.wrapV,
      wrapW: this.wrapW,
      anisotropy: this.anisotropy,
      label: this.label,
      uploaded: this.uploaded,
      mipmapsGenerated: this.mipmapsGenerated,
      memoryUsage: this.memoryUsage,
    };
  }
}
