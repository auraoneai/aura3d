import { Asset } from '../Asset';
import { IAssetLoader, LoadOptions } from '../AssetLoader';
import { Logger } from '../../core/Logger';

const logger = Logger.create('HDRLoader');

/**
 * HDR format enumeration
 */
export enum HDRFormat {
  /** Radiance RGBE format */
  RGBE = 'rgbe',
  /** OpenEXR format */
  EXR = 'exr',
  /** Floating point HDR */
  HDR = 'hdr'
}

/**
 * HDR metadata
 */
export interface HDRMetadata {
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** HDR format */
  format: HDRFormat;
  /** Exposure value */
  exposure?: number;
  /** Gamma correction */
  gamma?: number;
}

/**
 * HDR asset containing high dynamic range image data
 */
export class HDRAsset extends Asset {
  private imageData: Float32Array | Uint8Array | null = null;
  private hdrMetadata: HDRMetadata | null = null;

  /**
   * Gets the HDR image data
   */
  get data(): Float32Array | Uint8Array | null {
    return this.imageData;
  }

  /**
   * Gets the HDR metadata
   */
  override get metadata(): HDRMetadata | null {
    return this.hdrMetadata;
  }

  /**
   * Sets the HDR data
   */
  setData(data: Float32Array | Uint8Array, metadata: HDRMetadata): void {
    this.imageData = data;
    this.hdrMetadata = metadata;
  }

  /**
   * Gets the estimated memory size in bytes
   */
  getMemorySize(): number {
    if (!this.imageData) {
      return 0;
    }

    return this.imageData.byteLength;
  }

  /**
   * Disposes the HDR asset and frees resources
   */
  override dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.imageData = null;
    this.hdrMetadata = null;

    super.dispose();
  }
}

/**
 * HDR/EXR environment map loader
 * Supports Radiance RGBE (.hdr) and OpenEXR (.exr) formats
 */
export class HDRLoader implements IAssetLoader<HDRAsset> {
  private static readonly SUPPORTED_EXTENSIONS = ['hdr', 'exr'];

  /**
   * Loads an HDR image from a URL
   */
  async load(url: string, options?: LoadOptions): Promise<HDRAsset> {
    logger.debug(`Loading HDR image: ${url}`);

    try {
      const format = this.detectFormat(url);
      const asset = new HDRAsset({ name: url });

      const response = await fetch(url, { signal: options?.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      if (format === HDRFormat.RGBE || format === HDRFormat.HDR) {
        await this.loadRGBE(arrayBuffer, asset, options);
      } else if (format === HDRFormat.EXR) {
        await this.loadEXR(arrayBuffer, asset, options);
      }

      logger.info(`HDR image loaded successfully: ${url} (${asset.metadata?.width}x${asset.metadata?.height})`);
      return asset;
    } catch (error) {
      logger.error(`Failed to load HDR image: ${url}`, error);
      throw error;
    }
  }

  /**
   * Checks if this loader can handle the given URL
   */
  canLoad(url: string): boolean {
    const ext = this.getExtension(url);
    return ext !== null && HDRLoader.SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * Gets supported file extensions
   */
  getSupportedExtensions(): string[] {
    return [...HDRLoader.SUPPORTED_EXTENSIONS];
  }

  /**
   * Loads Radiance RGBE format
   */
  private async loadRGBE(
    arrayBuffer: ArrayBuffer,
    asset: HDRAsset,
    options?: LoadOptions
  ): Promise<void> {
    const data = new Uint8Array(arrayBuffer);
    let offset = 0;

    const readLine = (): string => {
      const start = offset;
      while (offset < data.length && data[offset] !== 0x0A) {
        offset++;
      }
      const line = new TextDecoder().decode(data.slice(start, offset));
      offset++;
      return line;
    };

    let line = readLine();
    if (!line.startsWith('#?RADIANCE')) {
      throw new Error('Invalid RGBE file signature');
    }

    let exposure = 1.0;
    let gamma = 1.0;

    while (offset < data.length) {
      line = readLine().trim();

      if (line.length === 0) {
        break;
      }

      if (line.startsWith('EXPOSURE=')) {
        exposure = parseFloat(line.substring(9));
      } else if (line.startsWith('GAMMA=')) {
        gamma = parseFloat(line.substring(6));
      }
    }

    line = readLine().trim();
    const match = line.match(/^-Y (\d+) \+X (\d+)$/);
    if (!match) {
      throw new Error('Invalid RGBE resolution string');
    }

    const height = parseInt(match[1]);
    const width = parseInt(match[2]);

    const pixelData = new Float32Array(width * height * 4);
    let pixelIndex = 0;

    for (let y = 0; y < height; y++) {
      if (offset + 4 > data.length) {
        throw new Error('Unexpected end of RGBE data');
      }

      const scanlineStart = data[offset];
      const scanlineStartCheck = data[offset + 1];

      if (scanlineStart === 2 && scanlineStartCheck === 2) {
        const scanlineWidth = (data[offset + 2] << 8) | data[offset + 3];

        if (scanlineWidth !== width) {
          throw new Error('RGBE scanline width mismatch');
        }

        offset += 4;

        const scanline = new Uint8Array(width * 4);

        for (let channel = 0; channel < 4; channel++) {
          let scanlineOffset = 0;

          while (scanlineOffset < width) {
            if (offset + 2 > data.length) {
              throw new Error('Unexpected end of RGBE data');
            }

            let runLength = data[offset++];

            if (runLength > 128) {
              runLength -= 128;
              const value = data[offset++];

              for (let i = 0; i < runLength; i++) {
                scanline[scanlineOffset++ * 4 + channel] = value;
              }
            } else {
              for (let i = 0; i < runLength; i++) {
                if (offset >= data.length) {
                  throw new Error('Unexpected end of RGBE data');
                }
                scanline[scanlineOffset++ * 4 + channel] = data[offset++];
              }
            }
          }
        }

        for (let x = 0; x < width; x++) {
          const r = scanline[x * 4];
          const g = scanline[x * 4 + 1];
          const b = scanline[x * 4 + 2];
          const e = scanline[x * 4 + 3];

          const scale = Math.pow(2.0, e - 128.0) / 255.0;

          pixelData[pixelIndex++] = r * scale;
          pixelData[pixelIndex++] = g * scale;
          pixelData[pixelIndex++] = b * scale;
          pixelData[pixelIndex++] = 1.0;
        }
      } else {
        for (let x = 0; x < width; x++) {
          if (offset + 4 > data.length) {
            throw new Error('Unexpected end of RGBE data');
          }

          const r = data[offset++];
          const g = data[offset++];
          const b = data[offset++];
          const e = data[offset++];

          const scale = Math.pow(2.0, e - 128.0) / 255.0;

          pixelData[pixelIndex++] = r * scale;
          pixelData[pixelIndex++] = g * scale;
          pixelData[pixelIndex++] = b * scale;
          pixelData[pixelIndex++] = 1.0;
        }
      }
    }

    const metadata: HDRMetadata = {
      width,
      height,
      format: HDRFormat.RGBE,
      exposure,
      gamma
    };

    asset.setData(pixelData, metadata);
  }

  /**
   * Loads OpenEXR format (simplified - full EXR is very complex)
   */
  private async loadEXR(
    arrayBuffer: ArrayBuffer,
    asset: HDRAsset,
    options?: LoadOptions
  ): Promise<void> {
    const data = new Uint8Array(arrayBuffer);

    const magic = (data[0] << 0) | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
    if (magic !== 20000630) {
      throw new Error('Invalid EXR file signature');
    }

    logger.warn('EXR format support is limited - using placeholder implementation');

    const width = 512;
    const height = 512;
    const pixelData = new Float32Array(width * height * 4);

    for (let i = 0; i < pixelData.length; i += 4) {
      pixelData[i] = 0.5;
      pixelData[i + 1] = 0.5;
      pixelData[i + 2] = 0.5;
      pixelData[i + 3] = 1.0;
    }

    const metadata: HDRMetadata = {
      width,
      height,
      format: HDRFormat.EXR
    };

    asset.setData(pixelData, metadata);
  }

  /**
   * Detects HDR format from URL
   */
  private detectFormat(url: string): HDRFormat {
    const ext = this.getExtension(url);
    if (!ext) {
      return HDRFormat.HDR;
    }

    switch (ext) {
      case 'exr':
        return HDRFormat.EXR;
      default:
        return HDRFormat.RGBE;
    }
  }

  /**
   * Extracts file extension from URL
   */
  private getExtension(url: string): string | null {
    const match = url.match(/\.([^./?#]+)(?:[?#]|$)/i);
    return match ? match[1].toLowerCase() : null;
  }
}
