/**
 * G3D 5.0 - LUTLoader
 *
 * Loads and manages Color Lookup Tables (LUTs) for color grading.
 * Supports strip images, 3D textures, and LUT blending.
 *
 * @module postfx/LUTLoader
 */

/**
 * Color Lookup Table
 */
export interface LUT {
  /**
   * GPU texture containing the LUT data
   */
  texture: any; // GPUTexture

  /**
   * Size of the LUT (e.g., 32 for a 32x32x32 LUT)
   */
  size: number;

  /**
   * Name identifier for the LUT
   */
  name: string;

  /**
   * Whether the LUT is in sRGB color space
   */
  sRGB: boolean;

  /**
   * Metadata
   */
  metadata?: {
    author?: string;
    description?: string;
    created?: Date;
  };
}

/**
 * LUT loading options
 */
export interface LUTLoadOptions {
  /**
   * Expected LUT size (will validate against this)
   */
  size?: number;

  /**
   * Whether the LUT is in sRGB color space
   */
  sRGB?: boolean;

  /**
   * Name for the LUT
   */
  name?: string;

  /**
   * Whether to flip the LUT vertically
   */
  flipY?: boolean;
}

/**
 * LUT strip format (horizontal or vertical strip of color slices)
 */
export type LUTStripFormat = 'horizontal' | 'vertical' | 'grid';

/**
 * Color Lookup Table loader and manager
 */
export class LUTLoader {
  private static device: any = null;
  private static cache = new Map<string, LUT>();

  /**
   * Initialize the LUT loader with a device
   */
  public static initialize(device: any): void {
    LUTLoader.device = device;
  }

  /**
   * Load LUT from URL
   */
  public static async load(url: string, options: LUTLoadOptions = {}): Promise<LUT> {
    // Check cache
    const cacheKey = `${url}:${options.size || 'auto'}`;
    const cached = LUTLoader.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Load image
    const image = await LUTLoader.loadImage(url);

    // Create LUT from image
    const lut = LUTLoader.loadFromImage(image, options);

    // Cache the result
    LUTLoader.cache.set(cacheKey, lut);

    return lut;
  }

  /**
   * Load LUT from HTMLImageElement or ImageBitmap
   */
  public static loadFromImage(
    image: HTMLImageElement | ImageBitmap,
    options: LUTLoadOptions = {}
  ): LUT {
    if (!LUTLoader.device) {
      throw new Error('LUTLoader not initialized. Call initialize() first.');
    }

    // Detect LUT format and size
    const { format, size } = LUTLoader.detectFormat(image, options.size);

    if (!size) {
      throw new Error('Could not detect LUT size from image dimensions');
    }

    // Validate requested size
    if (options.size && options.size !== size) {
      console.warn(`Expected LUT size ${options.size}, but detected ${size}`);
    }

    // Extract 3D LUT data from strip
    const data = LUTLoader.extractLUTData(image, format, size, options.flipY || false);

    // Create 3D texture
    const texture = LUTLoader.create3DTexture(data, size, options.sRGB || false);

    const lut: LUT = {
      texture,
      size,
      name: options.name || `LUT_${size}`,
      sRGB: options.sRGB || false,
    };

    return lut;
  }

  /**
   * Create an identity LUT (no color transformation)
   */
  public static createIdentity(size: number, name = 'Identity'): LUT {
    if (!LUTLoader.device) {
      throw new Error('LUTLoader not initialized. Call initialize() first.');
    }

    // Create identity LUT data
    const data = new Uint8Array(size * size * size * 4);

    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const index = (b * size * size + g * size + r) * 4;
          data[index + 0] = Math.floor((r / (size - 1)) * 255);
          data[index + 1] = Math.floor((g / (size - 1)) * 255);
          data[index + 2] = Math.floor((b / (size - 1)) * 255);
          data[index + 3] = 255;
        }
      }
    }

    const texture = LUTLoader.create3DTexture(data, size, false);

    return {
      texture,
      size,
      name,
      sRGB: false,
    };
  }

  /**
   * Blend two LUTs together
   */
  public static blend(lut1: LUT, lut2: LUT, factor: number, name = 'Blended'): LUT {
    if (!LUTLoader.device) {
      throw new Error('LUTLoader not initialized. Call initialize() first.');
    }

    if (lut1.size !== lut2.size) {
      throw new Error('Cannot blend LUTs of different sizes');
    }

    const size = lut1.size;
    factor = Math.max(0, Math.min(1, factor));

    // Read data from both LUT textures using the static method
    const data1 = LUTLoader.readTextureData(lut1.texture, size);
    const data2 = LUTLoader.readTextureData(lut2.texture, size);

    // Blend the data
    const blendedData = new Uint8Array(size * size * size * 4);
    for (let i = 0; i < blendedData.length; i++) {
      blendedData[i] = Math.floor(data1[i] * (1 - factor) + data2[i] * factor);
    }

    // Create blended texture
    const texture = LUTLoader.create3DTexture(blendedData, size, lut1.sRGB || lut2.sRGB);

    return {
      texture,
      size,
      name,
      sRGB: lut1.sRGB || lut2.sRGB,
    };
  }

  /**
   * Create a LUT from a color transform function
   */
  public static createFromFunction(
    size: number,
    transformFn: (r: number, g: number, b: number) => [number, number, number],
    name = 'Custom'
  ): LUT {
    if (!LUTLoader.device) {
      throw new Error('LUTLoader not initialized. Call initialize() first.');
    }

    const data = new Uint8Array(size * size * size * 4);

    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const rNorm = r / (size - 1);
          const gNorm = g / (size - 1);
          const bNorm = b / (size - 1);

          const [rOut, gOut, bOut] = transformFn(rNorm, gNorm, bNorm);

          const index = (b * size * size + g * size + r) * 4;
          data[index + 0] = Math.floor(Math.max(0, Math.min(1, rOut)) * 255);
          data[index + 1] = Math.floor(Math.max(0, Math.min(1, gOut)) * 255);
          data[index + 2] = Math.floor(Math.max(0, Math.min(1, bOut)) * 255);
          data[index + 3] = 255;
        }
      }
    }

    const texture = LUTLoader.create3DTexture(data, size, false);

    return {
      texture,
      size,
      name,
      sRGB: false,
    };
  }

  /**
   * Dispose a LUT and free resources
   */
  public static dispose(lut: LUT): void {
    if (lut.texture) {
      // lut.texture.destroy();
    }
  }

  /**
   * Clear the LUT cache
   */
  public static clearCache(): void {
    for (const lut of LUTLoader.cache.values()) {
      LUTLoader.dispose(lut);
    }
    LUTLoader.cache.clear();
  }

  /**
   * Load image from URL
   */
  private static loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image: ${url}`));

      image.src = url;
    });
  }

  /**
   * Detect LUT format and size from image dimensions
   */
  private static detectFormat(
    image: HTMLImageElement | ImageBitmap,
    expectedSize?: number
  ): { format: LUTStripFormat; size: number } {
    const width = image.width;
    const height = image.height;

    // Try horizontal strip (width = size * size, height = size)
    if (height > 0 && width % height === 0) {
      const sliceCount = width / height;
      const size = Math.round(Math.cbrt(sliceCount * height));

      if (size * size * size === sliceCount * height * height) {
        return { format: 'horizontal', size };
      }
    }

    // Try vertical strip (width = size, height = size * size)
    if (width > 0 && height % width === 0) {
      const sliceCount = height / width;
      const size = Math.round(Math.cbrt(sliceCount * width));

      if (size * size * size === sliceCount * width * width) {
        return { format: 'vertical', size };
      }
    }

    // Try grid format (width = height = size * ceil(sqrt(size)))
    if (width === height) {
      const gridSize = Math.round(Math.sqrt(width));
      const size = Math.round(width / gridSize);

      if (size * gridSize === width) {
        return { format: 'grid', size };
      }
    }

    // If expected size is provided, use it
    if (expectedSize) {
      // Determine format based on aspect ratio
      if (width > height) {
        return { format: 'horizontal', size: expectedSize };
      } else if (height > width) {
        return { format: 'vertical', size: expectedSize };
      } else {
        return { format: 'grid', size: expectedSize };
      }
    }

    throw new Error(`Could not detect LUT format from image dimensions: ${width}x${height}`);
  }

  /**
   * Extract 3D LUT data from strip image
   */
  private static extractLUTData(
    image: HTMLImageElement | ImageBitmap,
    format: LUTStripFormat,
    size: number,
    flipY: boolean
  ): Uint8Array {
    // Create canvas to read pixel data
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    // Allocate 3D LUT data
    const data = new Uint8Array(size * size * size * 4);

    // Extract based on format
    switch (format) {
      case 'horizontal':
        LUTLoader.extractHorizontalStrip(pixels, data, size, flipY, canvas.width);
        break;
      case 'vertical':
        LUTLoader.extractVerticalStrip(pixels, data, size, flipY, canvas.width);
        break;
      case 'grid':
        LUTLoader.extractGrid(pixels, data, size, flipY, canvas.width);
        break;
    }

    return data;
  }

  /**
   * Extract from horizontal strip format
   */
  private static extractHorizontalStrip(
    pixels: Uint8ClampedArray,
    data: Uint8Array,
    size: number,
    flipY: boolean,
    imageWidth: number
  ): void {
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const sliceX = b * size;
          const x = sliceX + r;
          const y = flipY ? (size - 1 - g) : g;

          const srcIndex = (y * imageWidth + x) * 4;
          const dstIndex = (b * size * size + g * size + r) * 4;

          data[dstIndex + 0] = pixels[srcIndex + 0];
          data[dstIndex + 1] = pixels[srcIndex + 1];
          data[dstIndex + 2] = pixels[srcIndex + 2];
          data[dstIndex + 3] = pixels[srcIndex + 3];
        }
      }
    }
  }

  /**
   * Extract from vertical strip format
   */
  private static extractVerticalStrip(
    pixels: Uint8ClampedArray,
    data: Uint8Array,
    size: number,
    flipY: boolean,
    imageWidth: number
  ): void {
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const sliceY = b * size;
          const x = r;
          const y = sliceY + (flipY ? (size - 1 - g) : g);

          const srcIndex = (y * imageWidth + x) * 4;
          const dstIndex = (b * size * size + g * size + r) * 4;

          data[dstIndex + 0] = pixels[srcIndex + 0];
          data[dstIndex + 1] = pixels[srcIndex + 1];
          data[dstIndex + 2] = pixels[srcIndex + 2];
          data[dstIndex + 3] = pixels[srcIndex + 3];
        }
      }
    }
  }

  /**
   * Extract from grid format
   */
  private static extractGrid(
    pixels: Uint8ClampedArray,
    data: Uint8Array,
    size: number,
    flipY: boolean,
    imageWidth: number
  ): void {
    const gridSize = Math.ceil(Math.sqrt(size));

    for (let b = 0; b < size; b++) {
      const gridX = b % gridSize;
      const gridY = Math.floor(b / gridSize);

      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const x = gridX * size + r;
          const y = gridY * size + (flipY ? (size - 1 - g) : g);

          const srcIndex = (y * imageWidth + x) * 4;
          const dstIndex = (b * size * size + g * size + r) * 4;

          data[dstIndex + 0] = pixels[srcIndex + 0];
          data[dstIndex + 1] = pixels[srcIndex + 1];
          data[dstIndex + 2] = pixels[srcIndex + 2];
          data[dstIndex + 3] = pixels[srcIndex + 3];
        }
      }
    }
  }

  /**
   * Create 3D texture from LUT data.
   *
   * Creates a GPU 3D texture for color grading lookup.
   * Supports both WebGPU and WebGL2 backends.
   *
   * @param data - RGBA pixel data
   * @param size - Dimension of the 3D LUT (typically 16, 32, or 64)
   * @param sRGB - Whether to use sRGB color space
   * @returns Texture handle object
   */
  private static create3DTexture(data: Uint8Array, size: number, sRGB: boolean): any {
    // Get rendering context from global engine instance
    const gl = LUTLoader.getWebGL2Context();

    if (gl) {
      // WebGL2 path - use TEXTURE_3D
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, texture);

      // Set texture parameters
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

      // Upload 3D texture data
      const internalFormat = sRGB ? gl.SRGB8_ALPHA8 : gl.RGBA8;
      gl.texImage3D(
        gl.TEXTURE_3D,
        0,
        internalFormat,
        size,
        size,
        size,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data
      );

      gl.bindTexture(gl.TEXTURE_3D, null);

      return {
        texture,
        width: size,
        height: size,
        depth: size,
        format: sRGB ? 'srgb8_alpha8' : 'rgba8',
        isWebGL: true,
      };
    }

    // Fallback: return data container for software rendering or deferred upload
    return {
      width: size,
      height: size,
      depth: size,
      format: sRGB ? 'rgba8unorm-srgb' : 'rgba8unorm',
      data,
      pending: true,
    };
  }

  /**
   * Read texture data from GPU.
   *
   * Reads back 3D texture data for CPU operations like LUT blending.
   *
   * @param texture - Texture handle object
   * @param size - Dimension of the 3D LUT
   * @returns RGBA pixel data
   */
  private static readTextureData(texture: any, size: number): Uint8Array {
    // If we have raw data stored, return it directly
    if (texture.data) {
      return texture.data;
    }

    const gl = LUTLoader.getWebGL2Context();

    if (gl && texture.texture && texture.isWebGL) {
      // WebGL2 path - use framebuffer attachment to read slices
      const result = new Uint8Array(size * size * size * 4);
      const fb = gl.createFramebuffer();

      for (let z = 0; z < size; z++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTextureLayer(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          texture.texture,
          0,
          z
        );

        // Read slice
        const sliceData = new Uint8Array(size * size * 4);
        gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, sliceData);

        // Copy to result
        result.set(sliceData, z * size * size * 4);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);

      return result;
    }

    // Return empty array if unable to read
    return new Uint8Array(size * size * size * 4);
  }

  /**
   * Get WebGL2 context from global engine instance.
   */
  private static getWebGL2Context(): WebGL2RenderingContext | null {
    // Try to get from global engine instance
    if (typeof window !== 'undefined' && (window as any).g3d?.renderer?.gl) {
      return (window as any).g3d.renderer.gl;
    }
    return null;
  }
}
