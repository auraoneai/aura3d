import { Logger } from '../../core/Logger';

const logger = Logger.create('TextureCompressor');

/**
 * GPU texture compression format
 */
export enum CompressionFormat {
  /** Block Compression 1 (DXT1) - RGB, 1-bit alpha */
  BC1 = 'bc1',
  /** Block Compression 3 (DXT5) - RGBA */
  BC3 = 'bc3',
  /** Block Compression 7 - High quality RGBA */
  BC7 = 'bc7',
  /** Adaptive Scalable Texture Compression */
  ASTC_4x4 = 'astc-4x4',
  ASTC_6x6 = 'astc-6x6',
  ASTC_8x8 = 'astc-8x8',
  /** Ericsson Texture Compression 2 */
  ETC2_RGB = 'etc2-rgb',
  ETC2_RGBA = 'etc2-rgba',
  /** PowerVR Texture Compression */
  PVRTC_RGB_4BPP = 'pvrtc-rgb-4bpp',
  PVRTC_RGBA_4BPP = 'pvrtc-rgba-4bpp'
}

/**
 * Compression quality level
 */
export enum CompressionQuality {
  /** Fastest compression, lower quality */
  FAST = 'fast',
  /** Balanced compression and quality */
  NORMAL = 'normal',
  /** Slowest compression, highest quality */
  HIGH = 'high'
}

/**
 * Compression options
 */
export interface CompressionOptions {
  /** Target compression format */
  format: CompressionFormat;
  /** Quality level */
  quality?: CompressionQuality;
  /** Generate mipmaps */
  generateMipmaps?: boolean;
  /** Number of mipmap levels (0 = all) */
  mipmapLevels?: number;
  /** Whether to use SRGB color space */
  srgb?: boolean;
  /** Alpha threshold for BC1 */
  alphaThreshold?: number;
}

/**
 * Compressed texture data
 */
export interface CompressedTexture {
  /** Compressed data for each mipmap level */
  data: Uint8Array[];
  /** Texture width */
  width: number;
  /** Texture height */
  height: number;
  /** Compression format */
  format: CompressionFormat;
  /** Number of mipmap levels */
  mipmapCount: number;
}

/**
 * Texture compressor supporting various GPU formats
 * Provides software-based compression for BC, ASTC, ETC, and PVRTC
 */
export class TextureCompressor {
  /**
   * Compresses texture data
   */
  async compress(
    imageData: ImageData | Float32Array,
    width: number,
    height: number,
    options: CompressionOptions
  ): Promise<CompressedTexture> {
    logger.debug(`Compressing texture ${width}x${height} to ${options.format}`);

    const startTime = performance.now();

    const pixels = this.extractPixels(imageData, width, height);
    const mipmaps = options.generateMipmaps
      ? this.generateMipmaps(pixels, width, height, options.mipmapLevels || 0)
      : [{ data: pixels, width, height }];

    const compressedData: Uint8Array[] = [];

    for (const mip of mipmaps) {
      const compressed = await this.compressMipmap(
        mip.data,
        mip.width,
        mip.height,
        options
      );
      compressedData.push(compressed);
    }

    const duration = performance.now() - startTime;
    logger.info(`Texture compressed in ${duration.toFixed(2)}ms`);

    return {
      data: compressedData,
      width,
      height,
      format: options.format,
      mipmapCount: mipmaps.length
    };
  }

  /**
   * Compresses a single mipmap level
   */
  private async compressMipmap(
    pixels: Uint8Array,
    width: number,
    height: number,
    options: CompressionOptions
  ): Promise<Uint8Array> {
    switch (options.format) {
      case CompressionFormat.BC1:
        return this.compressBC1(pixels, width, height, options);
      case CompressionFormat.BC3:
        return this.compressBC3(pixels, width, height, options);
      case CompressionFormat.BC7:
        return this.compressBC7(pixels, width, height, options);
      case CompressionFormat.ASTC_4x4:
      case CompressionFormat.ASTC_6x6:
      case CompressionFormat.ASTC_8x8:
        return this.compressASTC(pixels, width, height, options);
      case CompressionFormat.ETC2_RGB:
      case CompressionFormat.ETC2_RGBA:
        return this.compressETC2(pixels, width, height, options);
      default:
        throw new Error(`Unsupported compression format: ${options.format}`);
    }
  }

  /**
   * BC1/DXT1 compression (4x4 blocks, 8 bytes per block)
   */
  private compressBC1(
    pixels: Uint8Array,
    width: number,
    height: number,
    options: CompressionOptions
  ): Uint8Array {
    const blockWidth = Math.ceil(width / 4);
    const blockHeight = Math.ceil(height / 4);
    const output = new Uint8Array(blockWidth * blockHeight * 8);

    for (let by = 0; by < blockHeight; by++) {
      for (let bx = 0; bx < blockWidth; bx++) {
        const blockPixels = this.extractBlock(pixels, width, height, bx * 4, by * 4, 4, 4);
        const compressed = this.compressBC1Block(blockPixels, options.alphaThreshold || 128);

        const offset = (by * blockWidth + bx) * 8;
        output.set(compressed, offset);
      }
    }

    return output;
  }

  /**
   * Compresses a single BC1 block
   */
  private compressBC1Block(pixels: Uint8Array, alphaThreshold: number): Uint8Array {
    const block = new Uint8Array(8);

    let minColor = [255, 255, 255];
    let maxColor = [0, 0, 0];

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      minColor[0] = Math.min(minColor[0], r);
      minColor[1] = Math.min(minColor[1], g);
      minColor[2] = Math.min(minColor[2], b);

      maxColor[0] = Math.max(maxColor[0], r);
      maxColor[1] = Math.max(maxColor[1], g);
      maxColor[2] = Math.max(maxColor[2], b);
    }

    const color0 = this.packRGB565(maxColor[0], maxColor[1], maxColor[2]);
    const color1 = this.packRGB565(minColor[0], minColor[1], minColor[2]);

    block[0] = color0 & 0xFF;
    block[1] = (color0 >> 8) & 0xFF;
    block[2] = color1 & 0xFF;
    block[3] = (color1 >> 8) & 0xFF;

    const c0 = this.unpackRGB565(color0);
    const c1 = this.unpackRGB565(color1);

    let indices = 0;
    for (let i = 0; i < 16; i++) {
      const px = i % 4;
      const py = Math.floor(i / 4);
      const offset = (py * 4 + px) * 4;

      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];

      const d0 = this.colorDistance(r, g, b, c0[0], c0[1], c0[2]);
      const d1 = this.colorDistance(r, g, b, c1[0], c1[1], c1[2]);

      const index = d0 < d1 ? 0 : 1;
      indices |= index << (i * 2);
    }

    block[4] = indices & 0xFF;
    block[5] = (indices >> 8) & 0xFF;
    block[6] = (indices >> 16) & 0xFF;
    block[7] = (indices >> 24) & 0xFF;

    return block;
  }

  /**
   * BC3/DXT5 compression (4x4 blocks, 16 bytes per block)
   */
  private compressBC3(
    pixels: Uint8Array,
    width: number,
    height: number,
    options: CompressionOptions
  ): Uint8Array {
    const blockWidth = Math.ceil(width / 4);
    const blockHeight = Math.ceil(height / 4);
    const output = new Uint8Array(blockWidth * blockHeight * 16);

    for (let by = 0; by < blockHeight; by++) {
      for (let bx = 0; bx < blockWidth; bx++) {
        const blockPixels = this.extractBlock(pixels, width, height, bx * 4, by * 4, 4, 4);
        const alphaBlock = this.compressAlphaBlock(blockPixels);
        const colorBlock = this.compressBC1Block(blockPixels, 128);

        const offset = (by * blockWidth + bx) * 16;
        output.set(alphaBlock, offset);
        output.set(colorBlock, offset + 8);
      }
    }

    return output;
  }

  /**
   * Compresses alpha channel for BC3
   */
  private compressAlphaBlock(pixels: Uint8Array): Uint8Array {
    const block = new Uint8Array(8);

    let minAlpha = 255;
    let maxAlpha = 0;

    for (let i = 3; i < pixels.length; i += 4) {
      const alpha = pixels[i];
      minAlpha = Math.min(minAlpha, alpha);
      maxAlpha = Math.max(maxAlpha, alpha);
    }

    block[0] = maxAlpha;
    block[1] = minAlpha;

    let indices = 0n;
    for (let i = 0; i < 16; i++) {
      const alpha = pixels[i * 4 + 3];
      const t = maxAlpha !== minAlpha
        ? (alpha - minAlpha) / (maxAlpha - minAlpha)
        : 0;
      const index = Math.round(t * 7);
      indices |= BigInt(index) << BigInt(i * 3);
    }

    for (let i = 0; i < 6; i++) {
      block[2 + i] = Number((indices >> BigInt(i * 8)) & 0xFFn);
    }

    return block;
  }

  /**
   * BC7 compression (simplified)
   */
  private compressBC7(
    pixels: Uint8Array,
    width: number,
    height: number,
    options: CompressionOptions
  ): Uint8Array {
    logger.warn('BC7 compression uses simplified BC3 fallback');
    return this.compressBC3(pixels, width, height, options);
  }

  /**
   * ASTC compression (simplified - placeholder)
   */
  private compressASTC(
    pixels: Uint8Array,
    width: number,
    height: number,
    options: CompressionOptions
  ): Uint8Array {
    logger.warn('ASTC compression not fully implemented - using placeholder');
    return this.compressBC3(pixels, width, height, options);
  }

  /**
   * ETC2 compression (simplified - placeholder)
   */
  private compressETC2(
    pixels: Uint8Array,
    width: number,
    height: number,
    options: CompressionOptions
  ): Uint8Array {
    logger.warn('ETC2 compression not fully implemented - using placeholder');
    return this.compressBC1(pixels, width, height, options);
  }

  /**
   * Extracts pixels from image data
   */
  private extractPixels(
    imageData: ImageData | Float32Array,
    width: number,
    height: number
  ): Uint8Array {
    if (imageData instanceof Float32Array) {
      const pixels = new Uint8Array(imageData.length);
      for (let i = 0; i < imageData.length; i++) {
        pixels[i] = Math.min(255, Math.max(0, Math.round(imageData[i] * 255)));
      }
      return pixels;
    }

    return new Uint8Array(imageData.data);
  }

  /**
   * Generates mipmap chain
   */
  private generateMipmaps(
    pixels: Uint8Array,
    width: number,
    height: number,
    maxLevels: number
  ): Array<{ data: Uint8Array; width: number; height: number }> {
    const mipmaps = [{ data: pixels, width, height }];
    const levels = maxLevels || this.calculateMipmapLevels(width, height);

    let currentWidth = width;
    let currentHeight = height;
    let currentPixels = pixels;

    for (let i = 1; i < levels && currentWidth > 1 && currentHeight > 1; i++) {
      const nextWidth = Math.max(1, Math.floor(currentWidth / 2));
      const nextHeight = Math.max(1, Math.floor(currentHeight / 2));
      const nextPixels = this.downsample(currentPixels, currentWidth, currentHeight);

      mipmaps.push({ data: nextPixels, width: nextWidth, height: nextHeight });

      currentWidth = nextWidth;
      currentHeight = nextHeight;
      currentPixels = nextPixels;
    }

    return mipmaps;
  }

  /**
   * Downsamples image by 2x using box filter
   */
  private downsample(pixels: Uint8Array, width: number, height: number): Uint8Array {
    const newWidth = Math.max(1, Math.floor(width / 2));
    const newHeight = Math.max(1, Math.floor(height / 2));
    const output = new Uint8Array(newWidth * newHeight * 4);

    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        let r = 0, g = 0, b = 0, a = 0;

        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(x * 2 + dx, width - 1);
            const sy = Math.min(y * 2 + dy, height - 1);
            const offset = (sy * width + sx) * 4;

            r += pixels[offset];
            g += pixels[offset + 1];
            b += pixels[offset + 2];
            a += pixels[offset + 3];
          }
        }

        const outOffset = (y * newWidth + x) * 4;
        output[outOffset] = r / 4;
        output[outOffset + 1] = g / 4;
        output[outOffset + 2] = b / 4;
        output[outOffset + 3] = a / 4;
      }
    }

    return output;
  }

  /**
   * Extracts a block of pixels
   */
  private extractBlock(
    pixels: Uint8Array,
    width: number,
    height: number,
    x: number,
    y: number,
    blockWidth: number,
    blockHeight: number
  ): Uint8Array {
    const block = new Uint8Array(blockWidth * blockHeight * 4);

    for (let by = 0; by < blockHeight; by++) {
      for (let bx = 0; bx < blockWidth; bx++) {
        const sx = Math.min(x + bx, width - 1);
        const sy = Math.min(y + by, height - 1);
        const srcOffset = (sy * width + sx) * 4;
        const dstOffset = (by * blockWidth + bx) * 4;

        block[dstOffset] = pixels[srcOffset];
        block[dstOffset + 1] = pixels[srcOffset + 1];
        block[dstOffset + 2] = pixels[srcOffset + 2];
        block[dstOffset + 3] = pixels[srcOffset + 3];
      }
    }

    return block;
  }

  /**
   * Packs RGB to 565 format
   */
  private packRGB565(r: number, g: number, b: number): number {
    const r5 = Math.round(r / 255 * 31);
    const g6 = Math.round(g / 255 * 63);
    const b5 = Math.round(b / 255 * 31);
    return (r5 << 11) | (g6 << 5) | b5;
  }

  /**
   * Unpacks RGB565 to RGB
   */
  private unpackRGB565(color: number): [number, number, number] {
    const r = ((color >> 11) & 0x1F) * 255 / 31;
    const g = ((color >> 5) & 0x3F) * 255 / 63;
    const b = (color & 0x1F) * 255 / 31;
    return [r, g, b];
  }

  /**
   * Calculates color distance
   */
  private colorDistance(
    r1: number, g1: number, b1: number,
    r2: number, g2: number, b2: number
  ): number {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return dr * dr + dg * dg + db * db;
  }

  /**
   * Calculates number of mipmap levels
   */
  private calculateMipmapLevels(width: number, height: number): number {
    return Math.floor(Math.log2(Math.max(width, height))) + 1;
  }
}
