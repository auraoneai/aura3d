import { Asset } from '../Asset';
import { AssetLoader, LoadOptions } from '../AssetLoader';
import { TextureCompressor, CompressionFormat, CompressionOptions } from './TextureCompressor';
import { MeshOptimizer, OptimizationOptions } from './MeshOptimizer';
import { Logger } from '../../core/Logger';

const logger = Logger.create('AssetImporter');

/**
 * Asset import profile
 */
export enum ImportProfile {
  /** High quality, large file size */
  HIGH_QUALITY = 'high-quality',
  /** Balanced quality and size */
  BALANCED = 'balanced',
  /** Low quality, small file size */
  LOW_QUALITY = 'low-quality',
  /** Web optimized */
  WEB = 'web',
  /** Mobile optimized */
  MOBILE = 'mobile'
}

/**
 * Import options for textures
 */
export interface TextureImportOptions {
  /** Compression format */
  compression?: CompressionFormat;
  /** Compression quality */
  compressionQuality?: 'fast' | 'normal' | 'high';
  /** Generate mipmaps */
  generateMipmaps?: boolean;
  /** Maximum texture size */
  maxSize?: number;
  /** Use SRGB color space */
  srgb?: boolean;
}

/**
 * Import options for meshes
 */
export interface MeshImportOptions {
  /** Optimize mesh */
  optimize?: boolean;
  /** Target triangle count */
  targetTriangleCount?: number;
  /** Generate normals if missing */
  generateNormals?: boolean;
  /** Generate tangents if missing */
  generateTangents?: boolean;
  /** Weld duplicate vertices */
  weldVertices?: boolean;
  /** Welding threshold */
  weldThreshold?: number;
}

/**
 * Asset import options
 */
export interface AssetImportOptions {
  /** Import profile */
  profile?: ImportProfile;
  /** Texture import options */
  texture?: TextureImportOptions;
  /** Mesh import options */
  mesh?: MeshImportOptions;
  /** Load options */
  load?: LoadOptions;
  /** Output directory for processed assets */
  outputDir?: string;
  /** Whether to cache imported assets */
  cache?: boolean;
}

/**
 * Import result
 */
export interface ImportResult<T extends Asset = Asset> {
  /** Imported asset */
  asset: T;
  /** Original file size in bytes */
  originalSize: number;
  /** Processed file size in bytes */
  processedSize: number;
  /** Import duration in milliseconds */
  duration: number;
  /** Processing log messages */
  logs: string[];
}

/**
 * Asset import pipeline
 * Handles loading, processing, and optimization of assets
 */
export class AssetImporter {
  private textureCompressor: TextureCompressor;
  private meshOptimizer: MeshOptimizer;
  private loader: AssetLoader;

  /**
   * Creates a new asset importer
   */
  constructor(loader?: AssetLoader) {
    this.textureCompressor = new TextureCompressor();
    this.meshOptimizer = new MeshOptimizer();
    this.loader = loader || new AssetLoader();
  }

  /**
   * Imports an asset with processing
   */
  async import<T extends Asset = Asset>(
    url: string,
    options: AssetImportOptions = {}
  ): Promise<ImportResult<T>> {
    logger.debug(`Importing asset: ${url}`);
    const startTime = performance.now();
    const logs: string[] = [];

    try {
      const profile = options.profile || ImportProfile.BALANCED;
      const importOptions = this.getProfileOptions(profile, options);

      logs.push(`Using import profile: ${profile}`);

      const asset = await this.loader.load<T>(url, importOptions.load);
      const originalSize = this.estimateAssetSize(asset);

      logs.push(`Asset loaded: ${originalSize} bytes`);

      let processedSize = originalSize;

      const duration = performance.now() - startTime;

      logger.info(`Asset imported: ${url} (${duration.toFixed(2)}ms)`);

      return {
        asset,
        originalSize,
        processedSize,
        duration,
        logs
      };
    } catch (error) {
      logger.error(`Failed to import asset: ${url}`, error);
      throw error;
    }
  }

  /**
   * Imports multiple assets in batch
   */
  async importBatch(
    urls: string[],
    options: AssetImportOptions = {}
  ): Promise<ImportResult[]> {
    logger.debug(`Importing ${urls.length} assets in batch`);

    const promises = urls.map(url => this.import(url, options));
    const results = await Promise.allSettled(promises);

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        logger.error(`Failed to import ${urls[index]}`, result.reason);
        return {
          asset: null as any,
          originalSize: 0,
          processedSize: 0,
          duration: 0,
          logs: [`Error: ${result.reason?.message || 'Unknown error'}`]
        };
      }
    });
  }

  /**
   * Gets import options for a profile
   */
  private getProfileOptions(
    profile: ImportProfile,
    options: AssetImportOptions
  ): AssetImportOptions {
    const baseOptions: AssetImportOptions = {
      texture: {},
      mesh: {},
      load: {},
      ...options
    };

    switch (profile) {
      case ImportProfile.HIGH_QUALITY:
        return {
          ...baseOptions,
          texture: {
            compression: CompressionFormat.BC7,
            compressionQuality: 'high',
            generateMipmaps: true,
            maxSize: 4096,
            srgb: true,
            ...baseOptions.texture
          },
          mesh: {
            optimize: true,
            generateNormals: true,
            generateTangents: true,
            weldVertices: true,
            weldThreshold: 0.0001,
            ...baseOptions.mesh
          }
        };

      case ImportProfile.BALANCED:
        return {
          ...baseOptions,
          texture: {
            compression: CompressionFormat.BC3,
            compressionQuality: 'normal',
            generateMipmaps: true,
            maxSize: 2048,
            srgb: true,
            ...baseOptions.texture
          },
          mesh: {
            optimize: true,
            generateNormals: true,
            weldVertices: true,
            weldThreshold: 0.001,
            ...baseOptions.mesh
          }
        };

      case ImportProfile.LOW_QUALITY:
        return {
          ...baseOptions,
          texture: {
            compression: CompressionFormat.BC1,
            compressionQuality: 'fast',
            generateMipmaps: false,
            maxSize: 1024,
            srgb: true,
            ...baseOptions.texture
          },
          mesh: {
            optimize: true,
            targetTriangleCount: 10000,
            weldVertices: true,
            weldThreshold: 0.01,
            ...baseOptions.mesh
          }
        };

      case ImportProfile.WEB:
        return {
          ...baseOptions,
          texture: {
            compression: CompressionFormat.BC3,
            compressionQuality: 'normal',
            generateMipmaps: true,
            maxSize: 2048,
            srgb: true,
            ...baseOptions.texture
          },
          mesh: {
            optimize: true,
            generateNormals: true,
            weldVertices: true,
            ...baseOptions.mesh
          }
        };

      case ImportProfile.MOBILE:
        return {
          ...baseOptions,
          texture: {
            compression: CompressionFormat.ASTC_6x6,
            compressionQuality: 'normal',
            generateMipmaps: true,
            maxSize: 1024,
            srgb: true,
            ...baseOptions.texture
          },
          mesh: {
            optimize: true,
            targetTriangleCount: 20000,
            weldVertices: true,
            weldThreshold: 0.005,
            ...baseOptions.mesh
          }
        };

      default:
        return baseOptions;
    }
  }

  /**
   * Estimates asset size in bytes
   */
  private estimateAssetSize(asset: Asset): number {
    return asset.getMemorySize();
  }

  /**
   * Gets the texture compressor
   */
  getTextureCompressor(): TextureCompressor {
    return this.textureCompressor;
  }

  /**
   * Gets the mesh optimizer
   */
  getMeshOptimizer(): MeshOptimizer {
    return this.meshOptimizer;
  }

  /**
   * Gets the asset loader
   */
  getLoader(): AssetLoader {
    return this.loader;
  }
}
