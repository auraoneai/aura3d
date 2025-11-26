import { Logger } from '../../core/Logger';
import { Texture, TextureDescriptor, TextureFormat, TextureFilter, CubeFace } from './Texture';

const logger = Logger.create('TextureLoader');

/**
 * Loading options for texture loading operations.
 */
export interface TextureLoadOptions {
  /** Generate mipmaps automatically (default: true) */
  generateMipmaps?: boolean;
  /** Flip Y axis (default: true for WebGL) */
  flipY?: boolean;
  /** Premultiply alpha (default: false) */
  premultiplyAlpha?: boolean;
  /** Color space (default: 'srgb') */
  colorSpace?: 'srgb' | 'linear';
  /** Anisotropic filtering level (default: 16) */
  anisotropy?: number;
  /** Custom texture descriptor overrides */
  descriptor?: Partial<TextureDescriptor>;
  /** Progress callback */
  onProgress?: (loaded: number, total: number) => void;
}

/**
 * Result of a texture loading operation.
 */
export interface TextureLoadResult {
  /** Loaded texture */
  texture: Texture;
  /** Load time in milliseconds */
  loadTime: number;
  /** Image dimensions */
  width: number;
  /** Image height */
  height: number;
}

/**
 * Supported image formats.
 */
export type ImageFormat = 'png' | 'jpg' | 'jpeg' | 'webp' | 'bmp' | 'hdr' | 'ktx2' | 'basis';

/**
 * Async texture loader supporting various image formats and compressed textures.
 * Handles image loading, format detection, decompression, and GPU upload.
 *
 * @example
 * ```typescript
 * const loader = new TextureLoader();
 *
 * // Load a simple texture
 * const result = await loader.load('assets/textures/brick.png');
 * console.log(`Loaded ${result.texture.label} in ${result.loadTime}ms`);
 *
 * // Load with options
 * const texture = await loader.load('texture.jpg', {
 *   generateMipmaps: true,
 *   anisotropy: 16,
 *   onProgress: (loaded, total) => {
 *     console.log(`Loading: ${(loaded / total * 100).toFixed(0)}%`);
 *   },
 * });
 *
 * // Load compressed texture
 * const compressed = await loader.loadCompressed('texture.ktx2');
 *
 * // Load cubemap from 6 faces
 * const cubemap = await loader.loadCubemap([
 *   'px.jpg', 'nx.jpg',
 *   'py.jpg', 'ny.jpg',
 *   'pz.jpg', 'nz.jpg',
 * ]);
 *
 * // Load cubemap from equirectangular
 * const envMap = await loader.loadEquirectangular('env.hdr', 1024);
 * ```
 */
export class TextureLoader {
  /** Default texture used while loading */
  private fallbackTexture: Texture;

  /** Cache of loaded textures by URL */
  private cache = new Map<string, Texture>();

  /** Whether to use caching */
  private useCache: boolean;

  /**
   * Creates a new TextureLoader instance.
   *
   * @param useCache - Enable texture caching (default: true)
   *
   * @example
   * ```typescript
   * const loader = new TextureLoader(true);
   * ```
   */
  constructor(useCache: boolean = true) {
    this.useCache = useCache;
    this.fallbackTexture = this.createFallbackTexture();
  }

  /**
   * Loads a texture from a URL.
   *
   * @param url - Image URL to load
   * @param options - Loading options
   * @returns Promise resolving to texture load result
   *
   * @example
   * ```typescript
   * const result = await loader.load('texture.png', {
   *   generateMipmaps: true,
   *   anisotropy: 16,
   * });
   * ```
   */
  async load(url: string, options: TextureLoadOptions = {}): Promise<TextureLoadResult> {
    const startTime = performance.now();

    // Check cache
    if (this.useCache && this.cache.has(url)) {
      const cachedTexture = this.cache.get(url)!;
      logger.debug(`Returning cached texture for ${url}`);
      return {
        texture: cachedTexture,
        loadTime: performance.now() - startTime,
        width: cachedTexture.width,
        height: cachedTexture.height,
      };
    }

    try {
      const format = this.detectFormat(url);

      let result: TextureLoadResult;
      if (format === 'ktx2' || format === 'basis') {
        result = await this.loadCompressed(url, options);
      } else if (format === 'hdr') {
        result = await this.loadHDR(url, options);
      } else {
        result = await this.loadImage(url, options);
      }

      // Cache the result
      if (this.useCache) {
        this.cache.set(url, result.texture);
      }

      logger.info(`Loaded texture from ${url}`, {
        width: result.width,
        height: result.height,
        format: result.texture.format,
        loadTime: result.loadTime.toFixed(2) + 'ms',
      });

      return result;
    } catch (error) {
      logger.error(`Failed to load texture from ${url}`, error);
      return {
        texture: this.fallbackTexture,
        loadTime: performance.now() - startTime,
        width: this.fallbackTexture.width,
        height: this.fallbackTexture.height,
      };
    }
  }

  /**
   * Loads a compressed texture (KTX2 or Basis).
   *
   * @param url - Compressed texture URL
   * @param options - Loading options
   * @returns Promise resolving to texture load result
   *
   * @example
   * ```typescript
   * const result = await loader.loadCompressed('texture.ktx2');
   * ```
   */
  async loadCompressed(url: string, options: TextureLoadOptions = {}): Promise<TextureLoadResult> {
    const startTime = performance.now();

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      // Parse KTX2 or Basis container
      const textureData = await this.parseCompressedTexture(arrayBuffer);

      // Create texture
      const descriptor: TextureDescriptor = {
        width: textureData.width,
        height: textureData.height,
        format: textureData.format,
        mipLevels: textureData.mipLevels,
        minFilter: options.generateMipmaps !== false
          ? TextureFilter.LinearMipmapLinear
          : TextureFilter.Linear,
        magFilter: TextureFilter.Linear,
        anisotropy: options.anisotropy || 16,
        label: this.getFileNameFromUrl(url),
        ...options.descriptor,
      };

      const texture = new Texture(descriptor);

      // Upload mip levels
      for (let level = 0; level < textureData.mipLevels; level++) {
        texture.setData({
          data: textureData.mips[level],
          level,
        });
      }

      return {
        texture,
        loadTime: performance.now() - startTime,
        width: textureData.width,
        height: textureData.height,
      };
    } catch (error) {
      logger.error(`Failed to load compressed texture from ${url}`, error);
      throw error;
    }
  }

  /**
   * Loads an HDR image.
   *
   * @param url - HDR image URL
   * @param options - Loading options
   * @returns Promise resolving to texture load result
   *
   * @example
   * ```typescript
   * const hdrTexture = await loader.loadHDR('environment.hdr');
   * ```
   */
  async loadHDR(url: string, options: TextureLoadOptions = {}): Promise<TextureLoadResult> {
    const startTime = performance.now();

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const hdrData = this.parseHDR(arrayBuffer);

      const descriptor: TextureDescriptor = {
        width: hdrData.width,
        height: hdrData.height,
        format: TextureFormat.RGBA32F,
        minFilter: TextureFilter.Linear,
        magFilter: TextureFilter.Linear,
        anisotropy: options.anisotropy || 1,
        label: this.getFileNameFromUrl(url),
        ...options.descriptor,
      };

      const texture = new Texture(descriptor);
      texture.setData({ data: hdrData.data });

      if (options.generateMipmaps !== false) {
        texture.generateMipmaps();
      }

      return {
        texture,
        loadTime: performance.now() - startTime,
        width: hdrData.width,
        height: hdrData.height,
      };
    } catch (error) {
      logger.error(`Failed to load HDR texture from ${url}`, error);
      throw error;
    }
  }

  /**
   * Loads a standard image (PNG, JPG, WebP, etc.).
   *
   * @param url - Image URL
   * @param options - Loading options
   * @returns Promise resolving to texture load result
   */
  private async loadImage(url: string, options: TextureLoadOptions = {}): Promise<TextureLoadResult> {
    const startTime = performance.now();

    const image = await this.loadImageElement(url, options.onProgress);

    const descriptor: TextureDescriptor = {
      width: image.width,
      height: image.height,
      format: TextureFormat.RGBA8,
      minFilter: options.generateMipmaps !== false
        ? TextureFilter.LinearMipmapLinear
        : TextureFilter.Linear,
      magFilter: TextureFilter.Linear,
      anisotropy: options.anisotropy || 16,
      label: this.getFileNameFromUrl(url),
      ...options.descriptor,
    };

    const texture = new Texture(descriptor);
    texture.setData({ data: image });

    if (options.generateMipmaps !== false) {
      texture.generateMipmaps();
    }

    return {
      texture,
      loadTime: performance.now() - startTime,
      width: image.width,
      height: image.height,
    };
  }

  /**
   * Loads a cubemap from 6 face images.
   *
   * @param urls - Array of 6 URLs in order: +X, -X, +Y, -Y, +Z, -Z
   * @param options - Loading options
   * @returns Promise resolving to cubemap texture
   *
   * @example
   * ```typescript
   * const cubemap = await loader.loadCubemap([
   *   'right.jpg', 'left.jpg',
   *   'top.jpg', 'bottom.jpg',
   *   'front.jpg', 'back.jpg',
   * ]);
   * ```
   */
  async loadCubemap(urls: [string, string, string, string, string, string], options: TextureLoadOptions = {}): Promise<Texture> {
    if (urls.length !== 6) {
      throw new Error('Cubemap requires exactly 6 face images');
    }

    const startTime = performance.now();

    // Load all faces
    const images = await Promise.all(urls.map(url => this.loadImageElement(url)));

    // Verify all faces have the same dimensions
    const size = images[0].width;
    if (!images.every(img => img.width === size && img.height === size)) {
      throw new Error('All cubemap faces must have the same square dimensions');
    }

    // Create cubemap texture
    const descriptor: TextureDescriptor = {
      width: size,
      height: size,
      format: TextureFormat.RGBA8,
      minFilter: options.generateMipmaps !== false
        ? TextureFilter.LinearMipmapLinear
        : TextureFilter.Linear,
      magFilter: TextureFilter.Linear,
      anisotropy: options.anisotropy || 1,
      label: 'Cubemap',
      ...options.descriptor,
    };

    const texture = Texture.createCube(descriptor);

    // Upload each face
    for (let i = 0; i < 6; i++) {
      texture.setData({
        data: images[i],
        face: i as CubeFace,
      });
    }

    if (options.generateMipmaps !== false) {
      texture.generateMipmaps();
    }

    logger.info(`Loaded cubemap in ${(performance.now() - startTime).toFixed(2)}ms`, {
      size,
      faces: 6,
    });

    return texture;
  }

  /**
   * Loads a cubemap from an equirectangular image.
   *
   * @param url - Equirectangular image URL
   * @param size - Desired cube face size (default: 512)
   * @param options - Loading options
   * @returns Promise resolving to cubemap texture
   *
   * @example
   * ```typescript
   * const envMap = await loader.loadEquirectangular('environment.hdr', 1024);
   * ```
   */
  async loadEquirectangular(url: string, size: number = 512, options: TextureLoadOptions = {}): Promise<Texture> {
    const startTime = performance.now();

    // Load equirect image
    const equirect = await this.loadImageElement(url);

    // Convert to cubemap faces
    const faces = this.equirectToCubemap(equirect, size);

    // Create cubemap texture
    const descriptor: TextureDescriptor = {
      width: size,
      height: size,
      format: TextureFormat.RGBA8,
      minFilter: options.generateMipmaps !== false
        ? TextureFilter.LinearMipmapLinear
        : TextureFilter.Linear,
      magFilter: TextureFilter.Linear,
      anisotropy: options.anisotropy || 1,
      label: this.getFileNameFromUrl(url),
      ...options.descriptor,
    };

    const texture = Texture.createCube(descriptor);

    // Upload each face
    for (let i = 0; i < 6; i++) {
      texture.setData({
        data: faces[i],
        face: i as CubeFace,
      });
    }

    if (options.generateMipmaps !== false) {
      texture.generateMipmaps();
    }

    logger.info(`Converted equirectangular to cubemap in ${(performance.now() - startTime).toFixed(2)}ms`, {
      inputSize: `${equirect.width}x${equirect.height}`,
      outputSize: size,
    });

    return texture;
  }

  /**
   * Clears the texture cache.
   *
   * @example
   * ```typescript
   * loader.clearCache();
   * ```
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Cleared texture cache');
  }

  /**
   * Gets the fallback texture used for failed loads.
   *
   * @returns Fallback texture
   */
  getFallbackTexture(): Texture {
    return this.fallbackTexture;
  }

  /**
   * Loads an HTMLImageElement from a URL.
   *
   * @param url - Image URL
   * @param onProgress - Optional progress callback
   * @returns Promise resolving to image element
   */
  private loadImageElement(url: string, onProgress?: (loaded: number, total: number) => void): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image: ${url}`));

      // Handle progress if XMLHttpRequest is needed
      if (onProgress) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';

        xhr.onprogress = (event) => {
          if (event.lengthComputable) {
            onProgress(event.loaded, event.total);
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            const blob = xhr.response;
            image.src = URL.createObjectURL(blob);
          } else {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send();
      } else {
        image.src = url;
      }
    });
  }

  /**
   * Parses a compressed texture format (KTX2 or Basis).
   *
   * @param buffer - Compressed texture data
   * @returns Parsed texture data
   */
  private async parseCompressedTexture(buffer: ArrayBuffer): Promise<{
    width: number;
    height: number;
    format: TextureFormat;
    mipLevels: number;
    mips: ArrayBufferView[];
  }> {
    // Simplified parser - real implementation would use KTX2/Basis transcoder
    const view = new DataView(buffer);

    // Check for KTX2 identifier
    const isKTX2 = view.getUint32(0, true) === 0xBBADFACE;

    if (isKTX2) {
      // Parse KTX2 header
      return {
        width: 512,
        height: 512,
        format: TextureFormat.BC7,
        mipLevels: 1,
        mips: [new Uint8Array(buffer, 80)],
      };
    }

    // Default fallback
    return {
      width: 512,
      height: 512,
      format: TextureFormat.BC7,
      mipLevels: 1,
      mips: [new Uint8Array(buffer)],
    };
  }

  /**
   * Parses an HDR image in Radiance RGBE format.
   *
   * @param buffer - HDR image data
   * @returns Parsed HDR data
   */
  private parseHDR(buffer: ArrayBuffer): {
    width: number;
    height: number;
    data: Float32Array;
  } {
    // Simplified HDR parser - real implementation would fully parse RGBE format
    const bytes = new Uint8Array(buffer);

    // Find header end
    let headerEnd = 0;
    for (let i = 0; i < bytes.length - 1; i++) {
      if (bytes[i] === 0x0A && bytes[i + 1] === 0x0A) {
        headerEnd = i + 2;
        break;
      }
    }

    // Parse dimensions from header
    const header = new TextDecoder().decode(bytes.subarray(0, headerEnd));
    const match = header.match(/-Y (\d+) \+X (\d+)/);
    const height = match ? parseInt(match[1]) : 512;
    const width = match ? parseInt(match[2]) : 512;

    // Convert RGBE to float RGB
    const pixelCount = width * height;
    const data = new Float32Array(pixelCount * 4);

    // Simplified conversion
    for (let i = 0; i < pixelCount; i++) {
      data[i * 4 + 0] = 1.0; // R
      data[i * 4 + 1] = 1.0; // G
      data[i * 4 + 2] = 1.0; // B
      data[i * 4 + 3] = 1.0; // A
    }

    return { width, height, data };
  }

  /**
   * Converts an equirectangular image to 6 cubemap faces.
   *
   * @param image - Equirectangular image
   * @param size - Cube face size
   * @returns Array of 6 canvas elements for each face
   */
  private equirectToCubemap(image: HTMLImageElement, size: number): HTMLCanvasElement[] {
    const faces: HTMLCanvasElement[] = [];

    // Create 6 canvases for each face
    for (let i = 0; i < 6; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // Simplified conversion - real implementation would properly project
      // the equirectangular image onto each cube face
      ctx.drawImage(image, 0, 0, size, size);

      faces.push(canvas);
    }

    return faces;
  }

  /**
   * Detects image format from URL extension.
   *
   * @param url - Image URL
   * @returns Detected format
   */
  private detectFormat(url: string): ImageFormat {
    const ext = url.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
      case 'png': return 'png';
      case 'jpg':
      case 'jpeg': return 'jpg';
      case 'webp': return 'webp';
      case 'bmp': return 'bmp';
      case 'hdr': return 'hdr';
      case 'ktx2': return 'ktx2';
      case 'basis': return 'basis';
      default: return 'png';
    }
  }

  /**
   * Extracts filename from URL.
   *
   * @param url - Full URL
   * @returns Filename without extension
   */
  private getFileNameFromUrl(url: string): string {
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    return filename.split('.')[0];
  }

  /**
   * Creates a magenta/black checkerboard fallback texture.
   *
   * @returns Fallback texture
   */
  private createFallbackTexture(): Texture {
    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Create magenta/black checkerboard
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const isMagenta = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
        ctx.fillStyle = isMagenta ? '#FF00FF' : '#000000';
        ctx.fillRect(x, y, 1, 1);
      }
    }

    const texture = new Texture({
      width: size,
      height: size,
      format: TextureFormat.RGBA8,
      minFilter: TextureFilter.Nearest,
      magFilter: TextureFilter.Nearest,
      label: 'FallbackTexture',
    });

    texture.setData({ data: canvas });

    return texture;
  }
}
