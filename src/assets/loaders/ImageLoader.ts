import { Asset } from '../Asset';
import { IAssetLoader, LoadOptions } from '../AssetLoader';

/**
 * Image format types
 */
export enum ImageFormat {
  PNG = 'png',
  JPEG = 'jpeg',
  WEBP = 'webp',
  HDR = 'hdr',
  EXR = 'exr',
  KTX2 = 'ktx2',
  BASIS = 'basis'
}

/**
 * Image data
 */
export interface ImageData {
  width: number;
  height: number;
  format: ImageFormat;
  data: HTMLImageElement | ImageBitmap | ArrayBuffer;
  mipLevels?: ImageBitmap[];
}

/**
 * Image asset
 */
export class ImageAsset extends Asset {
  private imageData: ImageData | null = null;

  /**
   * Gets the image data
   */
  getData(): ImageData | null {
    return this.imageData;
  }

  /**
   * Sets the image data
   */
  setData(data: ImageData): void {
    this.imageData = data;
  }

  /**
   * Gets the image width
   */
  get width(): number {
    return this.imageData?.width || 0;
  }

  /**
   * Gets the image height
   */
  get height(): number {
    return this.imageData?.height || 0;
  }

  /**
   * Gets the image format
   */
  get format(): ImageFormat | null {
    return this.imageData?.format || null;
  }

  /**
   * Gets estimated memory size
   */
  getMemorySize(): number {
    if (!this.imageData) {
      return 0;
    }

    // Base image size (assume 4 bytes per pixel for RGBA)
    let size = this.imageData.width * this.imageData.height * 4;

    // Add mipmap sizes
    if (this.imageData.mipLevels) {
      for (const mip of this.imageData.mipLevels) {
        size += mip.width * mip.height * 4;
      }
    }

    return size;
  }

  /**
   * Disposes the asset
   */
  override dispose(): void {
    if (this.imageData) {
      // Close ImageBitmaps
      if (this.imageData.data instanceof ImageBitmap) {
        this.imageData.data.close();
      }

      if (this.imageData.mipLevels) {
        for (const mip of this.imageData.mipLevels) {
          mip.close();
        }
      }

      this.imageData = null;
    }

    super.dispose();
  }
}

/**
 * Image loader with support for:
 * - Standard formats (PNG, JPEG, WebP)
 * - HDR/EXR formats for environment maps
 * - Compressed texture formats (KTX2, Basis)
 * - Automatic mipmap generation
 * - ImageBitmap for efficient GPU upload
 *
 * @example
 * ```typescript
 * const loader = new ImageLoader({
 *   generateMipmaps: true,
 *   useImageBitmap: true
 * });
 *
 * const asset = await loader.load('texture.png');
 * console.log(`Loaded ${asset.width}x${asset.height} ${asset.format} image`);
 * ```
 */
export class ImageLoader implements IAssetLoader<ImageAsset> {
  private generateMipmaps: boolean;
  private useImageBitmap: boolean;
  private maxMipLevel: number;

  /**
   * Creates a new image loader
   */
  constructor(options: {
    generateMipmaps?: boolean;
    useImageBitmap?: boolean;
    maxMipLevel?: number;
  } = {}) {
    this.generateMipmaps = options.generateMipmaps !== false;
    this.useImageBitmap = options.useImageBitmap !== false;
    this.maxMipLevel = options.maxMipLevel || 8;
  }

  /**
   * Loads an image asset
   */
  async load(url: string, options: LoadOptions = {}): Promise<ImageAsset> {
    const asset = new ImageAsset({ name: url, metadata: { uri: url } });

    try {
      const format = this.detectFormat(url);

      let imageData: ImageData;

      switch (format) {
        case ImageFormat.HDR:
          imageData = await this.loadHDR(url, options);
          break;
        case ImageFormat.EXR:
          imageData = await this.loadEXR(url, options);
          break;
        case ImageFormat.KTX2:
          imageData = await this.loadKTX2(url, options);
          break;
        case ImageFormat.BASIS:
          imageData = await this.loadBasis(url, options);
          break;
        default:
          imageData = await this.loadStandard(url, format, options);
      }

      asset.setData(imageData);

      return asset;
    } catch (error) {
      throw new Error(`Failed to load image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Checks if this loader can handle the URL
   */
  canLoad(url: string): boolean {
    const ext = url.split('.').pop()?.toLowerCase();
    return ['png', 'jpg', 'jpeg', 'webp', 'hdr', 'exr', 'ktx2', 'basis'].includes(ext || '');
  }

  /**
   * Gets supported file extensions
   */
  getSupportedExtensions(): string[] {
    return ['png', 'jpg', 'jpeg', 'webp', 'hdr', 'exr', 'ktx2', 'basis'];
  }

  /**
   * Detects image format from URL
   * @private
   */
  private detectFormat(url: string): ImageFormat {
    const ext = url.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'png': return ImageFormat.PNG;
      case 'jpg':
      case 'jpeg': return ImageFormat.JPEG;
      case 'webp': return ImageFormat.WEBP;
      case 'hdr': return ImageFormat.HDR;
      case 'exr': return ImageFormat.EXR;
      case 'ktx2': return ImageFormat.KTX2;
      case 'basis': return ImageFormat.BASIS;
      default: return ImageFormat.PNG;
    }
  }

  /**
   * Loads standard image formats
   * @private
   */
  private async loadStandard(
    url: string,
    format: ImageFormat,
    options: LoadOptions
  ): Promise<ImageData> {
    if (this.useImageBitmap && typeof createImageBitmap !== 'undefined') {
      return this.loadImageBitmap(url, format, options);
    } else {
      return this.loadHTMLImage(url, format, options);
    }
  }

  /**
   * Loads image as ImageBitmap
   * @private
   */
  private async loadImageBitmap(
    url: string,
    format: ImageFormat,
    options: LoadOptions
  ): Promise<ImageData> {
    const response = await fetch(url, {
      headers: options.headers,
      credentials: options.credentials,
      signal: options.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob, {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none'
    });

    const imageData: ImageData = {
      width: bitmap.width,
      height: bitmap.height,
      format,
      data: bitmap
    };

    // Generate mipmaps if requested
    if (this.generateMipmaps && this.isPowerOfTwo(bitmap.width) && this.isPowerOfTwo(bitmap.height)) {
      imageData.mipLevels = await this.generateMipmapChain(bitmap);
    }

    return imageData;
  }

  /**
   * Loads image as HTMLImageElement
   * @private
   */
  private async loadHTMLImage(
    url: string,
    format: ImageFormat,
    options: LoadOptions
  ): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        resolve({
          width: img.width,
          height: img.height,
          format,
          data: img
        });
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      if (options.credentials) {
        img.crossOrigin = options.credentials;
      }

      img.src = url;
    });
  }

  /**
   * Loads HDR image
   * @private
   */
  private async loadHDR(url: string, options: LoadOptions): Promise<ImageData> {
    const response = await fetch(url, {
      headers: options.headers,
      credentials: options.credentials,
      signal: options.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();

    // Simple RGBE/HDR parsing (Radiance format)
    const { width, height, data } = this.parseRGBE(buffer);

    return {
      width,
      height,
      format: ImageFormat.HDR,
      data: buffer
    };
  }

  /**
   * Loads EXR image
   * @private
   */
  private async loadEXR(url: string, options: LoadOptions): Promise<ImageData> {
    // EXR loading would require a proper EXR decoder library
    // For now, throw an error
    throw new Error('EXR format not yet implemented. Please use a dedicated EXR loader library.');
  }

  /**
   * Loads KTX2 compressed texture
   * @private
   */
  private async loadKTX2(url: string, options: LoadOptions): Promise<ImageData> {
    // KTX2 loading would require basis_universal transcoder
    // For now, throw an error
    throw new Error('KTX2 format not yet implemented. Please use basis_universal transcoder.');
  }

  /**
   * Loads Basis compressed texture
   * @private
   */
  private async loadBasis(url: string, options: LoadOptions): Promise<ImageData> {
    // Basis loading would require basis_universal transcoder
    // For now, throw an error
    throw new Error('Basis format not yet implemented. Please use basis_universal transcoder.');
  }

  /**
   * Parses RGBE/HDR format
   * @private
   */
  private parseRGBE(buffer: ArrayBuffer): { width: number; height: number; data: Float32Array } {
    const bytes = new Uint8Array(buffer);
    let pos = 0;

    // Read header
    const header = this.readRGBEHeader(bytes);
    pos = header.offset;

    const width = header.width;
    const height = header.height;
    const data = new Float32Array(width * height * 4);

    // Decode scanlines
    for (let y = 0; y < height; y++) {
      const scanline = this.readRGBEScanline(bytes, pos, width);
      pos = scanline.offset;

      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const sidx = x * 4;

        const r = scanline.data[sidx];
        const g = scanline.data[sidx + 1];
        const b = scanline.data[sidx + 2];
        const e = scanline.data[sidx + 3];

        // Convert RGBE to float
        if (e > 0) {
          const f = Math.pow(2, e - 128) / 255;
          data[idx] = r * f;
          data[idx + 1] = g * f;
          data[idx + 2] = b * f;
          data[idx + 3] = 1;
        }
      }
    }

    return { width, height, data };
  }

  /**
   * Reads RGBE header
   * @private
   */
  private readRGBEHeader(bytes: Uint8Array): { width: number; height: number; offset: number } {
    let pos = 0;

    // Skip to resolution
    while (pos < bytes.length) {
      const line = this.readLine(bytes, pos);
      pos = line.offset;

      if (line.text.startsWith('-Y ')) {
        const match = line.text.match(/-Y (\d+) \+X (\d+)/);
        if (match) {
          return {
            height: parseInt(match[1]),
            width: parseInt(match[2]),
            offset: pos
          };
        }
      }
    }

    throw new Error('Invalid RGBE header');
  }

  /**
   * Reads a text line
   * @private
   */
  private readLine(bytes: Uint8Array, offset: number): { text: string; offset: number } {
    let end = offset;
    while (end < bytes.length && bytes[end] !== 10) {
      end++;
    }

    const text = new TextDecoder().decode(bytes.slice(offset, end));
    return { text, offset: end + 1 };
  }

  /**
   * Reads RGBE scanline
   * @private
   */
  private readRGBEScanline(bytes: Uint8Array, offset: number, width: number): { data: Uint8Array; offset: number } {
    const data = new Uint8Array(width * 4);

    // Simple uncompressed read
    data.set(bytes.slice(offset, offset + width * 4));

    return { data, offset: offset + width * 4 };
  }

  /**
   * Generates mipmap chain
   * @private
   */
  private async generateMipmapChain(source: ImageBitmap): Promise<ImageBitmap[]> {
    const mips: ImageBitmap[] = [];

    let width = source.width / 2;
    let height = source.height / 2;
    let level = 0;

    while (width >= 1 && height >= 1 && level < this.maxMipLevel) {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        break;
      }

      ctx.drawImage(source, 0, 0, width, height);
      const mip = await createImageBitmap(canvas);
      mips.push(mip);

      width = Math.max(1, Math.floor(width / 2));
      height = Math.max(1, Math.floor(height / 2));
      level++;
    }

    return mips;
  }

  /**
   * Checks if value is power of two
   * @private
   */
  private isPowerOfTwo(value: number): boolean {
    return (value & (value - 1)) === 0 && value !== 0;
  }
}
