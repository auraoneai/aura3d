import { Asset, AssetOptions } from '../Asset';
import { IAssetLoader, LoadOptions } from '../AssetLoader';
import { Logger } from '../../core/Logger';

const logger = Logger.create('TextureLoader');

/**
 * Texture format enumeration
 */
export enum TextureFormat {
  /** Standard PNG format */
  PNG = 'png',
  /** JPEG format */
  JPG = 'jpg',
  JPEG = 'jpeg',
  /** WebP format */
  WEBP = 'webp',
  /** KTX2 compressed format */
  KTX2 = 'ktx2',
  /** Basis universal compressed format */
  BASIS = 'basis',
  /** DirectDraw Surface format */
  DDS = 'dds'
}

/**
 * Texture compression format
 */
export enum TextureCompression {
  NONE = 'none',
  BC1 = 'bc1',
  BC3 = 'bc3',
  BC7 = 'bc7',
  ASTC = 'astc',
  ETC2 = 'etc2',
  PVRTC = 'pvrtc'
}

/**
 * Texture metadata
 */
export interface TextureMetadata {
  /** Texture width in pixels */
  width: number;
  /** Texture height in pixels */
  height: number;
  /** Number of mipmap levels */
  mipmapCount: number;
  /** Texture format */
  format: TextureFormat;
  /** Compression format if compressed */
  compression?: TextureCompression;
  /** Whether texture has alpha channel */
  hasAlpha: boolean;
  /** Color space (srgb or linear) */
  colorSpace: 'srgb' | 'linear';
}

/**
 * Texture asset that wraps image data and GPU texture
 */
export class TextureAsset extends Asset {
  private imageData: ImageData | ArrayBuffer | null = null;
  private texture: WebGLTexture | GPUTexture | null = null;
  private textureMetadata: TextureMetadata | null = null;

  /**
   * Gets the texture metadata
   */
  override get metadata(): TextureMetadata | null {
    return this.textureMetadata;
  }

  /**
   * Gets the image data
   */
  get data(): ImageData | ArrayBuffer | null {
    return this.imageData;
  }

  /**
   * Gets the GPU texture
   */
  get gpuTexture(): WebGLTexture | GPUTexture | null {
    return this.texture;
  }

  /**
   * Sets the texture data
   */
  setData(
    data: ImageData | ArrayBuffer,
    metadata: TextureMetadata,
    texture?: WebGLTexture | GPUTexture
  ): void {
    this.imageData = data;
    this.textureMetadata = metadata;
    if (texture) {
      this.texture = texture;
    }
  }

  /**
   * Gets the estimated memory size in bytes
   */
  getMemorySize(): number {
    if (!this.textureMetadata) {
      return 0;
    }

    const { width, height, mipmapCount, hasAlpha } = this.textureMetadata;
    const bytesPerPixel = hasAlpha ? 4 : 3;

    let totalSize = 0;
    for (let i = 0; i < mipmapCount; i++) {
      const mipWidth = Math.max(1, width >> i);
      const mipHeight = Math.max(1, height >> i);
      totalSize += mipWidth * mipHeight * bytesPerPixel;
    }

    return totalSize;
  }

  /**
   * Disposes the texture and frees GPU resources
   */
  override dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.imageData = null;
    this.textureMetadata = null;
    this.texture = null;

    super.dispose();
  }
}

/**
 * Texture loader supporting multiple image formats
 * Supports: PNG, JPG, WebP, KTX2, Basis Universal
 */
export class TextureLoader implements IAssetLoader<TextureAsset> {
  private static readonly SUPPORTED_EXTENSIONS = [
    'png', 'jpg', 'jpeg', 'webp', 'ktx2', 'basis', 'dds'
  ];

  /**
   * KTX2 file signature
   */
  private static readonly KTX2_SIGNATURE = new Uint8Array([
    0xAB, 0x4B, 0x54, 0x58, 0x20, 0x32, 0x30, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A
  ]);

  /**
   * Basis file signature
   */
  private static readonly BASIS_SIGNATURE = new Uint8Array([
    0x13, 0xAB, 0xA1, 0x5C
  ]);

  /**
   * DDS file signature
   */
  private static readonly DDS_SIGNATURE = 0x20534444; // "DDS "

  /**
   * Loads a texture from a URL
   */
  async load(url: string, options?: LoadOptions): Promise<TextureAsset> {
    logger.debug(`Loading texture: ${url}`);

    try {
      const format = this.detectFormat(url);
      const asset = new TextureAsset({ name: url });

      switch (format) {
        case TextureFormat.KTX2:
          await this.loadKTX2(url, asset, options);
          break;
        case TextureFormat.BASIS:
          await this.loadBasis(url, asset, options);
          break;
        case TextureFormat.DDS:
          await this.loadDDS(url, asset, options);
          break;
        default:
          await this.loadStandardImage(url, asset, options);
          break;
      }

      logger.info(`Texture loaded successfully: ${url}`);
      return asset;
    } catch (error) {
      logger.error(`Failed to load texture: ${url}`, error);
      throw error;
    }
  }

  /**
   * Checks if this loader can handle the given URL
   */
  canLoad(url: string): boolean {
    const ext = this.getExtension(url);
    return ext !== null && TextureLoader.SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * Gets supported file extensions
   */
  getSupportedExtensions(): string[] {
    return [...TextureLoader.SUPPORTED_EXTENSIONS];
  }

  /**
   * Loads a standard image (PNG, JPG, WebP)
   */
  private async loadStandardImage(
    url: string,
    asset: TextureAsset,
    options?: LoadOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const image = new Image();

      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }

      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Failed to get 2D context');
          }

          ctx.drawImage(image, 0, 0);
          const imageData = ctx.getImageData(0, 0, image.width, image.height);

          const metadata: TextureMetadata = {
            width: image.width,
            height: image.height,
            mipmapCount: 1,
            format: this.detectFormat(url),
            hasAlpha: this.hasAlpha(imageData),
            colorSpace: 'srgb'
          };

          asset.setData(imageData, metadata);
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      image.onerror = () => {
        reject(new Error(`Failed to load image: ${url}`));
      };

      image.crossOrigin = 'anonymous';
      image.src = url;
    });
  }

  /**
   * Loads a KTX2 compressed texture
   */
  private async loadKTX2(
    url: string,
    asset: TextureAsset,
    options?: LoadOptions
  ): Promise<void> {
    const response = await fetch(url, { signal: options?.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    if (!this.verifyKTX2Signature(new Uint8Array(arrayBuffer, 0, 12))) {
      throw new Error('Invalid KTX2 file signature');
    }

    const width = dataView.getUint32(20, true);
    const height = dataView.getUint32(24, true);
    const layerCount = dataView.getUint32(28, true);
    const faceCount = dataView.getUint32(32, true);
    const levelCount = dataView.getUint32(36, true);

    const metadata: TextureMetadata = {
      width,
      height,
      mipmapCount: levelCount,
      format: TextureFormat.KTX2,
      compression: TextureCompression.BC7,
      hasAlpha: true,
      colorSpace: 'srgb'
    };

    asset.setData(arrayBuffer, metadata);
  }

  /**
   * Loads a Basis Universal compressed texture
   */
  private async loadBasis(
    url: string,
    asset: TextureAsset,
    options?: LoadOptions
  ): Promise<void> {
    const response = await fetch(url, { signal: options?.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    if (!this.verifyBasisSignature(new Uint8Array(arrayBuffer, 0, 4))) {
      throw new Error('Invalid Basis file signature');
    }

    const dataView = new DataView(arrayBuffer);
    const width = dataView.getUint16(12, true);
    const height = dataView.getUint16(14, true);

    const metadata: TextureMetadata = {
      width,
      height,
      mipmapCount: 1,
      format: TextureFormat.BASIS,
      compression: TextureCompression.BC7,
      hasAlpha: true,
      colorSpace: 'srgb'
    };

    asset.setData(arrayBuffer, metadata);
  }

  /**
   * Loads a DDS compressed texture
   */
  private async loadDDS(
    url: string,
    asset: TextureAsset,
    options?: LoadOptions
  ): Promise<void> {
    const response = await fetch(url, { signal: options?.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    const magic = dataView.getUint32(0, true);
    if (magic !== TextureLoader.DDS_SIGNATURE) {
      throw new Error('Invalid DDS file signature');
    }

    const height = dataView.getUint32(12, true);
    const width = dataView.getUint32(16, true);
    const mipmapCount = Math.max(1, dataView.getUint32(28, true));

    const metadata: TextureMetadata = {
      width,
      height,
      mipmapCount,
      format: TextureFormat.DDS,
      compression: TextureCompression.BC3,
      hasAlpha: true,
      colorSpace: 'srgb'
    };

    asset.setData(arrayBuffer, metadata);
  }

  /**
   * Detects texture format from URL
   */
  private detectFormat(url: string): TextureFormat {
    const ext = this.getExtension(url);
    if (!ext) {
      return TextureFormat.PNG;
    }

    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return TextureFormat.JPG;
      case 'webp':
        return TextureFormat.WEBP;
      case 'ktx2':
        return TextureFormat.KTX2;
      case 'basis':
        return TextureFormat.BASIS;
      case 'dds':
        return TextureFormat.DDS;
      default:
        return TextureFormat.PNG;
    }
  }

  /**
   * Checks if image data has alpha channel
   */
  private hasAlpha(imageData: ImageData): boolean {
    const data = imageData.data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) {
        return true;
      }
    }
    return false;
  }

  /**
   * Verifies KTX2 file signature
   */
  private verifyKTX2Signature(bytes: Uint8Array): boolean {
    if (bytes.length < 12) {
      return false;
    }

    for (let i = 0; i < 12; i++) {
      if (bytes[i] !== TextureLoader.KTX2_SIGNATURE[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Verifies Basis file signature
   */
  private verifyBasisSignature(bytes: Uint8Array): boolean {
    if (bytes.length < 4) {
      return false;
    }

    for (let i = 0; i < 4; i++) {
      if (bytes[i] !== TextureLoader.BASIS_SIGNATURE[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Extracts file extension from URL
   */
  private getExtension(url: string): string | null {
    const match = url.match(/\.([^./?#]+)(?:[?#]|$)/i);
    return match ? match[1].toLowerCase() : null;
  }
}
