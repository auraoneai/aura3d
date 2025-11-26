/**
 * @module Rendering/GPU
 * @description
 * GPU texture abstraction for 1D/2D/3D textures and cube maps.
 */

import { Logger } from '../../core/Logger';
import {
  TextureFormat,
  TextureDimension,
  TextureViewDimension,
  TextureUsage,
  LoadOp,
  StoreOp,
} from './GPUDevice';
import { Color } from '../../math/Color';

const logger = Logger.create('GPUTexture');

/**
 * Texture descriptor.
 */
export interface GPUTextureDescriptor {
  /** Texture dimensions */
  size: { width: number; height: number; depth?: number };
  /** Pixel format */
  format: TextureFormat;
  /** Usage flags */
  usage: TextureUsage;
  /** Texture dimension (1D, 2D, or 3D) */
  dimension?: TextureDimension;
  /** Number of mip levels (1 = no mipmaps) */
  mipLevelCount?: number;
  /** Sample count for multisampling */
  sampleCount?: number;
  /** Debug label */
  label?: string;
}

/**
 * Texture view descriptor.
 */
export interface GPUTextureViewDescriptor {
  /** View format (defaults to texture format) */
  format?: TextureFormat;
  /** View dimension */
  dimension?: TextureViewDimension;
  /** First mip level */
  baseMipLevel?: number;
  /** Number of mip levels */
  mipLevelCount?: number;
  /** First array layer */
  baseArrayLayer?: number;
  /** Number of array layers */
  arrayLayerCount?: number;
  /** Debug label */
  label?: string;
}

/**
 * Render pass color attachment.
 */
export interface ColorAttachment {
  /** Texture view to render into */
  view: GPUTextureView;
  /** Resolve target for multisampled rendering */
  resolveTarget?: GPUTextureView;
  /** Load operation */
  loadOp: LoadOp;
  /** Store operation */
  storeOp: StoreOp;
  /** Clear color (required if loadOp is Clear) */
  clearValue?: Color | [number, number, number, number];
}

/**
 * Render pass depth/stencil attachment.
 */
export interface DepthStencilAttachment {
  /** Texture view to use for depth/stencil */
  view: GPUTextureView;
  /** Depth load operation */
  depthLoadOp?: LoadOp;
  /** Depth store operation */
  depthStoreOp?: StoreOp;
  /** Depth clear value (required if depthLoadOp is Clear) */
  depthClearValue?: number;
  /** Whether depth is read-only */
  depthReadOnly?: boolean;
  /** Stencil load operation */
  stencilLoadOp?: LoadOp;
  /** Stencil store operation */
  stencilStoreOp?: StoreOp;
  /** Stencil clear value (required if stencilLoadOp is Clear) */
  stencilClearValue?: number;
  /** Whether stencil is read-only */
  stencilReadOnly?: boolean;
}

/**
 * Texture upload/download options.
 */
export interface TextureDataLayout {
  /** Offset in bytes in the source data */
  offset?: number;
  /** Bytes per row (must be multiple of 256) */
  bytesPerRow?: number;
  /** Rows per image (for 3D textures) */
  rowsPerImage?: number;
}

/**
 * Texture copy view.
 */
export interface TextureCopyView {
  /** Texture to copy from/to */
  texture: GPUTexture;
  /** Mip level */
  mipLevel?: number;
  /** Origin coordinates */
  origin?: { x?: number; y?: number; z?: number };
}

/**
 * Abstract GPU texture view interface.
 */
export abstract class GPUTextureView {
  readonly id: number;
  readonly texture: GPUTexture;
  readonly format: TextureFormat;
  readonly dimension: TextureViewDimension;
  readonly baseMipLevel: number;
  readonly mipLevelCount: number;
  readonly baseArrayLayer: number;
  readonly arrayLayerCount: number;
  readonly label?: string;

  protected disposed = false;

  constructor(
    id: number,
    texture: GPUTexture,
    descriptor?: GPUTextureViewDescriptor
  ) {
    this.id = id;
    this.texture = texture;
    this.format = descriptor?.format ?? texture.format;
    this.dimension = descriptor?.dimension ?? this.getDefaultDimension(texture);
    this.baseMipLevel = descriptor?.baseMipLevel ?? 0;
    this.mipLevelCount = descriptor?.mipLevelCount ?? texture.mipLevelCount;
    this.baseArrayLayer = descriptor?.baseArrayLayer ?? 0;
    this.arrayLayerCount =
      descriptor?.arrayLayerCount ?? texture.size.depth ?? 1;
    this.label = descriptor?.label;
  }

  private getDefaultDimension(texture: GPUTexture): TextureViewDimension {
    switch (texture.dimension) {
      case TextureDimension.D1:
        return TextureViewDimension.D1;
      case TextureDimension.D2:
        return TextureViewDimension.D2;
      case TextureDimension.D3:
        return TextureViewDimension.D3;
      default:
        return TextureViewDimension.D2;
    }
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposeInternal();
    this.disposed = true;
  }

  protected abstract disposeInternal(): void;
}

/**
 * Abstract GPU texture interface.
 *
 * Provides texture management for:
 * - 1D, 2D, 3D textures
 * - Cube maps and texture arrays
 * - Mipmap generation
 * - Format conversion
 * - Render target attachments
 *
 * @example
 * ```typescript
 * // Create 2D texture
 * const texture = device.createTexture({
 *   size: { width: 1024, height: 1024 },
 *   format: TextureFormat.RGBA8Unorm,
 *   usage: TextureUsage.TextureBinding | TextureUsage.CopyDst,
 *   mipLevelCount: calculateMipLevels(1024, 1024),
 *   label: 'ColorTexture',
 * });
 *
 * // Upload data
 * const pixels = new Uint8Array(1024 * 1024 * 4);
 * texture.write(pixels, 0, { width: 1024, height: 1024 });
 *
 * // Generate mipmaps
 * texture.generateMipmaps();
 *
 * // Create view
 * const view = texture.createView();
 *
 * // Clean up
 * view.dispose();
 * texture.dispose();
 * ```
 */
export abstract class GPUTexture {
  readonly id: number;
  readonly size: { width: number; height: number; depth: number };
  readonly format: TextureFormat;
  readonly usage: TextureUsage;
  readonly dimension: TextureDimension;
  readonly mipLevelCount: number;
  readonly sampleCount: number;
  readonly label?: string;

  protected disposed = false;

  constructor(id: number, descriptor: GPUTextureDescriptor) {
    this.id = id;
    this.size = {
      width: descriptor.size.width,
      height: descriptor.size.height,
      depth: descriptor.size.depth ?? 1,
    };
    this.format = descriptor.format;
    this.usage = descriptor.usage;
    this.dimension = descriptor.dimension ?? TextureDimension.D2;
    this.mipLevelCount = descriptor.mipLevelCount ?? 1;
    this.sampleCount = descriptor.sampleCount ?? 1;
    this.label = descriptor.label;

    // Validate dimensions
    if (this.size.width <= 0 || this.size.height <= 0 || this.size.depth <= 0) {
      throw new Error('Texture dimensions must be positive');
    }

    // Validate mip levels
    const maxMips = this.calculateMaxMipLevels();
    if (this.mipLevelCount > maxMips) {
      throw new Error(
        `Mip level count ${this.mipLevelCount} exceeds maximum ${maxMips}`
      );
    }

    // Validate sample count
    if (this.sampleCount !== 1 && this.sampleCount !== 4) {
      throw new Error('Sample count must be 1 or 4');
    }
  }

  /**
   * Writes data to the texture.
   * @param data - Pixel data to write
   * @param mipLevel - Mip level to write to (default: 0)
   * @param size - Size of the region to write
   * @param offset - Offset in texture (default: origin)
   * @param dataLayout - Data layout options
   *
   * @example
   * ```typescript
   * const pixels = new Uint8Array(256 * 256 * 4);
   * texture.write(pixels, 0, { width: 256, height: 256 });
   * ```
   */
  write(
    data: ArrayBuffer | ArrayBufferView,
    mipLevel: number,
    size: { width: number; height: number; depth?: number },
    offset?: { x?: number; y?: number; z?: number },
    dataLayout?: TextureDataLayout
  ): void {
    this.assertNotDisposed();

    if (mipLevel >= this.mipLevelCount) {
      throw new Error(`Mip level ${mipLevel} out of range`);
    }

    const mipSize = this.getMipLevelSize(mipLevel);
    const writeWidth = size.width;
    const writeHeight = size.height;
    const writeDepth = size.depth ?? 1;

    const offsetX = offset?.x ?? 0;
    const offsetY = offset?.y ?? 0;
    const offsetZ = offset?.z ?? 0;

    if (
      offsetX + writeWidth > mipSize.width ||
      offsetY + writeHeight > mipSize.height ||
      offsetZ + writeDepth > mipSize.depth
    ) {
      throw new Error('Write region exceeds texture bounds');
    }

    this.writeInternal(data, mipLevel, size, offset, dataLayout);
  }

  /**
   * Reads data from the texture (requires CopySrc usage).
   * @param mipLevel - Mip level to read from
   * @param size - Size of the region to read
   * @param offset - Offset in texture
   * @returns Promise resolving to pixel data
   *
   * @example
   * ```typescript
   * const pixels = await texture.read(0, { width: 256, height: 256 });
   * const data = new Uint8Array(pixels);
   * ```
   */
  async read(
    mipLevel: number,
    size: { width: number; height: number; depth?: number },
    offset?: { x?: number; y?: number; z?: number }
  ): Promise<ArrayBuffer> {
    this.assertNotDisposed();

    if (!(this.usage & TextureUsage.CopySrc)) {
      throw new Error('Texture must have CopySrc usage to read data');
    }

    if (mipLevel >= this.mipLevelCount) {
      throw new Error(`Mip level ${mipLevel} out of range`);
    }

    return this.readInternal(mipLevel, size, offset);
  }

  /**
   * Creates a view into the texture.
   * @param descriptor - View descriptor
   * @returns Texture view
   *
   * @example
   * ```typescript
   * // Create view of specific mip level
   * const mipView = texture.createView({
   *   baseMipLevel: 2,
   *   mipLevelCount: 1,
   * });
   *
   * // Create cube map view
   * const cubeView = texture.createView({
   *   dimension: TextureViewDimension.Cube,
   * });
   * ```
   */
  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView {
    this.assertNotDisposed();
    return this.createViewInternal(descriptor);
  }

  /**
   * Generates mipmaps for the texture.
   * Requires TextureBinding and RenderAttachment usage.
   *
   * @example
   * ```typescript
   * texture.generateMipmaps();
   * ```
   */
  generateMipmaps(): void {
    this.assertNotDisposed();

    if (this.mipLevelCount <= 1) {
      logger.warn('Texture has no mipmap levels to generate');
      return;
    }

    const requiredUsage =
      TextureUsage.TextureBinding | TextureUsage.RenderAttachment;
    if ((this.usage & requiredUsage) !== requiredUsage) {
      throw new Error(
        'Texture must have TextureBinding and RenderAttachment usage for mipmap generation'
      );
    }

    this.generateMipmapsInternal();
  }

  /**
   * Gets the size of a specific mip level.
   * @param mipLevel - Mip level
   * @returns Mip level dimensions
   */
  getMipLevelSize(mipLevel: number): {
    width: number;
    height: number;
    depth: number;
  } {
    if (mipLevel >= this.mipLevelCount) {
      throw new Error(`Mip level ${mipLevel} out of range`);
    }

    return {
      width: Math.max(1, this.size.width >> mipLevel),
      height: Math.max(1, this.size.height >> mipLevel),
      depth: this.dimension === TextureDimension.D3
        ? Math.max(1, this.size.depth >> mipLevel)
        : this.size.depth,
    };
  }

  /**
   * Calculates the maximum number of mip levels for this texture.
   * @returns Maximum mip levels
   */
  calculateMaxMipLevels(): number {
    const maxDim = Math.max(this.size.width, this.size.height);
    return Math.floor(Math.log2(maxDim)) + 1;
  }

  /**
   * Gets the byte size of a single pixel in this format.
   * @returns Bytes per pixel
   */
  getBytesPerPixel(): number {
    return getTextureBytesPerPixel(this.format);
  }

  /**
   * Checks if the texture format is a depth format.
   * @returns True if depth format
   */
  isDepthFormat(): boolean {
    return isDepthFormat(this.format);
  }

  /**
   * Checks if the texture format is a stencil format.
   * @returns True if stencil format
   */
  isStencilFormat(): boolean {
    return isStencilFormat(this.format);
  }

  /**
   * Checks if the texture format is a compressed format.
   * @returns True if compressed
   */
  isCompressedFormat(): boolean {
    return isCompressedFormat(this.format);
  }

  /**
   * Checks if the texture has been disposed.
   * @returns True if disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Disposes of the texture and frees GPU resources.
   */
  dispose(): void {
    if (this.disposed) {
      logger.warn(`Texture ${this.label ?? this.id} already disposed`);
      return;
    }

    this.disposeInternal();
    this.disposed = true;

    logger.debug(`Texture disposed: ${this.label ?? this.id}`);
  }

  protected assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error(
        `Texture ${this.label ?? this.id} has been disposed and cannot be used`
      );
    }
  }

  protected abstract writeInternal(
    data: ArrayBuffer | ArrayBufferView,
    mipLevel: number,
    size: { width: number; height: number; depth?: number },
    offset?: { x?: number; y?: number; z?: number },
    dataLayout?: TextureDataLayout
  ): void;

  protected abstract readInternal(
    mipLevel: number,
    size: { width: number; height: number; depth?: number },
    offset?: { x?: number; y?: number; z?: number }
  ): Promise<ArrayBuffer>;

  protected abstract createViewInternal(
    descriptor?: GPUTextureViewDescriptor
  ): GPUTextureView;

  protected abstract generateMipmapsInternal(): void;

  protected abstract disposeInternal(): void;
}

/**
 * Calculates the number of mip levels for given dimensions.
 * @param width - Texture width
 * @param height - Texture height
 * @returns Number of mip levels
 *
 * @example
 * ```typescript
 * const mips = calculateMipLevels(1024, 512); // Returns 10
 * ```
 */
export function calculateMipLevels(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

/**
 * Gets the byte size per pixel for a texture format.
 * @param format - Texture format
 * @returns Bytes per pixel (or block for compressed formats)
 */
export function getTextureBytesPerPixel(format: TextureFormat): number {
  switch (format) {
    // 8-bit
    case TextureFormat.R8Unorm:
    case TextureFormat.R8Snorm:
    case TextureFormat.R8Uint:
    case TextureFormat.R8Sint:
      return 1;

    // 16-bit
    case TextureFormat.R16Uint:
    case TextureFormat.R16Sint:
    case TextureFormat.R16Float:
    case TextureFormat.RG8Unorm:
    case TextureFormat.RG8Snorm:
    case TextureFormat.RG8Uint:
    case TextureFormat.RG8Sint:
      return 2;

    // 32-bit
    case TextureFormat.R32Uint:
    case TextureFormat.R32Sint:
    case TextureFormat.R32Float:
    case TextureFormat.RG16Uint:
    case TextureFormat.RG16Sint:
    case TextureFormat.RG16Float:
    case TextureFormat.RGBA8Unorm:
    case TextureFormat.RGBA8UnormSrgb:
    case TextureFormat.RGBA8Snorm:
    case TextureFormat.RGBA8Uint:
    case TextureFormat.RGBA8Sint:
    case TextureFormat.BGRA8Unorm:
    case TextureFormat.BGRA8UnormSrgb:
    case TextureFormat.RGB10A2Unorm:
    case TextureFormat.RG11B10Ufloat:
      return 4;

    // 64-bit
    case TextureFormat.RG32Uint:
    case TextureFormat.RG32Sint:
    case TextureFormat.RG32Float:
    case TextureFormat.RGBA16Uint:
    case TextureFormat.RGBA16Sint:
    case TextureFormat.RGBA16Float:
      return 8;

    // 128-bit
    case TextureFormat.RGBA32Uint:
    case TextureFormat.RGBA32Sint:
    case TextureFormat.RGBA32Float:
      return 16;

    // Depth/stencil
    case TextureFormat.Depth16Unorm:
      return 2;
    case TextureFormat.Depth24Plus:
    case TextureFormat.Depth32Float:
      return 4;
    case TextureFormat.Depth24PlusStencil8:
    case TextureFormat.Depth32FloatStencil8:
      return 8;
    case TextureFormat.Stencil8:
      return 1;

    // Compressed formats (bytes per block)
    case TextureFormat.BC1RGBAUnorm:
    case TextureFormat.BC1RGBAUnormSrgb:
    case TextureFormat.BC4RUnorm:
    case TextureFormat.BC4RSnorm:
      return 8;

    case TextureFormat.BC2RGBAUnorm:
    case TextureFormat.BC2RGBAUnormSrgb:
    case TextureFormat.BC3RGBAUnorm:
    case TextureFormat.BC3RGBAUnormSrgb:
    case TextureFormat.BC5RGUnorm:
    case TextureFormat.BC5RGSnorm:
    case TextureFormat.BC6HRGBUfloat:
    case TextureFormat.BC6HRGBFloat:
    case TextureFormat.BC7RGBAUnorm:
    case TextureFormat.BC7RGBAUnormSrgb:
      return 16;

    // ETC2/EAC
    case TextureFormat.ETC2RGB8Unorm:
    case TextureFormat.ETC2RGB8UnormSrgb:
    case TextureFormat.ETC2RGB8A1Unorm:
    case TextureFormat.ETC2RGB8A1UnormSrgb:
    case TextureFormat.EACR11Unorm:
    case TextureFormat.EACR11Snorm:
      return 8;

    case TextureFormat.ETC2RGBA8Unorm:
    case TextureFormat.ETC2RGBA8UnormSrgb:
    case TextureFormat.EACRG11Unorm:
    case TextureFormat.EACRG11Snorm:
      return 16;

    // ASTC
    case TextureFormat.ASTC4x4Unorm:
    case TextureFormat.ASTC4x4UnormSrgb:
    case TextureFormat.ASTC5x5Unorm:
    case TextureFormat.ASTC5x5UnormSrgb:
    case TextureFormat.ASTC6x6Unorm:
    case TextureFormat.ASTC6x6UnormSrgb:
    case TextureFormat.ASTC8x8Unorm:
    case TextureFormat.ASTC8x8UnormSrgb:
      return 16;

    default:
      return 4;
  }
}

/**
 * Checks if a format is a depth format.
 * @param format - Texture format
 * @returns True if depth format
 */
export function isDepthFormat(format: TextureFormat): boolean {
  return (
    format === TextureFormat.Depth16Unorm ||
    format === TextureFormat.Depth24Plus ||
    format === TextureFormat.Depth24PlusStencil8 ||
    format === TextureFormat.Depth32Float ||
    format === TextureFormat.Depth32FloatStencil8
  );
}

/**
 * Checks if a format is a stencil format.
 * @param format - Texture format
 * @returns True if stencil format
 */
export function isStencilFormat(format: TextureFormat): boolean {
  return (
    format === TextureFormat.Stencil8 ||
    format === TextureFormat.Depth24PlusStencil8 ||
    format === TextureFormat.Depth32FloatStencil8
  );
}

/**
 * Checks if a format is compressed.
 * @param format - Texture format
 * @returns True if compressed
 */
export function isCompressedFormat(format: TextureFormat): boolean {
  return (
    format.startsWith('bc') ||
    format.startsWith('etc2') ||
    format.startsWith('eac') ||
    format.startsWith('astc')
  );
}
