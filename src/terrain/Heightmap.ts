/**
 * Heightmap data storage and sampling for terrain generation.
 * Supports multiple formats (raw, PNG) and provides efficient bilinear sampling.
 * @module Heightmap
 */

import { Vector2 } from '../math/Vector2';
import { Vector3 } from '../math/Vector3';
import { Logger } from '../core/Logger';

const logger = Logger.create('Heightmap');

/**
 * Heightmap data format.
 */
export enum HeightmapFormat {
  /** 8-bit unsigned integer (0-255) */
  Uint8 = 'Uint8',
  /** 16-bit unsigned integer (0-65535) */
  Uint16 = 'Uint16',
  /** 32-bit floating point */
  Float32 = 'Float32',
}

/**
 * Heightmap descriptor for creation.
 */
export interface HeightmapDescriptor {
  /** Width in samples */
  width: number;
  /** Height in samples */
  height: number;
  /** Data format */
  format?: HeightmapFormat;
  /** Initial height data (optional) */
  data?: ArrayBuffer | Float32Array | Uint16Array | Uint8Array;
  /** Minimum height value in world units */
  minHeight?: number;
  /** Maximum height value in world units */
  maxHeight?: number;
}

/**
 * Heightmap for terrain elevation data.
 * Stores elevation values in a grid and provides efficient sampling methods.
 *
 * @example
 * ```typescript
 * // Create from data
 * const heightmap = new Heightmap({
 *   width: 256,
 *   height: 256,
 *   format: HeightmapFormat.Float32,
 *   minHeight: 0,
 *   maxHeight: 100
 * });
 *
 * // Sample height at position
 * const height = heightmap.getHeight(128.5, 128.5);
 *
 * // Calculate normal
 * const normal = heightmap.getNormal(128.5, 128.5);
 *
 * // Load from PNG
 * const loaded = await Heightmap.fromImage('terrain.png', {
 *   minHeight: 0,
 *   maxHeight: 100
 * });
 * ```
 */
export class Heightmap {
  /** Width in samples */
  readonly width: number;
  /** Height in samples */
  readonly height: number;
  /** Data format */
  readonly format: HeightmapFormat;
  /** Minimum height value in world units */
  readonly minHeight: number;
  /** Maximum height value in world units */
  readonly maxHeight: number;
  /** Height data storage */
  private _data: Float32Array;

  /**
   * Creates a new heightmap.
   *
   * @param descriptor - Heightmap configuration
   */
  constructor(descriptor: HeightmapDescriptor) {
    this.width = descriptor.width;
    this.height = descriptor.height;
    this.format = descriptor.format ?? HeightmapFormat.Float32;
    this.minHeight = descriptor.minHeight ?? 0;
    this.maxHeight = descriptor.maxHeight ?? 1;

    // Allocate storage
    const sampleCount = this.width * this.height;
    this._data = new Float32Array(sampleCount);

    // Import data if provided
    if (descriptor.data) {
      this._importData(descriptor.data);
    }
  }

  /**
   * Gets the height data array.
   * @returns Height data as Float32Array
   */
  get data(): Float32Array {
    return this._data;
  }

  /**
   * Gets height at integer sample coordinates (no interpolation).
   *
   * @param x - X coordinate (0 to width-1)
   * @param y - Y coordinate (0 to height-1)
   * @returns Height value in world units
   */
  getSample(x: number, y: number): number {
    x = Math.floor(x);
    y = Math.floor(y);

    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return 0;
    }

    const index = y * this.width + x;
    return this._data[index];
  }

  /**
   * Sets height at integer sample coordinates.
   *
   * @param x - X coordinate (0 to width-1)
   * @param y - Y coordinate (0 to height-1)
   * @param height - Height value in world units
   */
  setSample(x: number, y: number, height: number): void {
    x = Math.floor(x);
    y = Math.floor(y);

    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return;
    }

    const index = y * this.width + x;
    this._data[index] = height;
  }

  /**
   * Gets interpolated height at floating-point coordinates using bilinear filtering.
   *
   * @param x - X coordinate (0 to width-1)
   * @param y - Y coordinate (0 to height-1)
   * @returns Interpolated height value
   *
   * @example
   * ```typescript
   * const height = heightmap.getHeight(127.5, 128.3);
   * ```
   */
  getHeight(x: number, y: number): number {
    // Clamp to valid range
    x = Math.max(0, Math.min(this.width - 1, x));
    y = Math.max(0, Math.min(this.height - 1, y));

    // Get integer coordinates
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, this.width - 1);
    const y1 = Math.min(y0 + 1, this.height - 1);

    // Get fractional parts
    const fx = x - x0;
    const fy = y - y0;

    // Sample four corners
    const h00 = this._data[y0 * this.width + x0]!;
    const h10 = this._data[y0 * this.width + x1]!;
    const h01 = this._data[y1 * this.width + x0]!;
    const h11 = this._data[y1 * this.width + x1]!;

    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fy) + h1 * fy;
  }

  /**
   * Gets height at world position with normalization.
   *
   * @param worldX - World X coordinate
   * @param worldZ - World Z coordinate
   * @param terrainSize - Size of terrain in world units
   * @returns Height value
   */
  getHeightWorld(worldX: number, worldZ: number, terrainSize: Vector2): number {
    const u = (worldX / terrainSize.x) * (this.width - 1);
    const v = (worldZ / terrainSize.y) * (this.height - 1);
    return this.getHeight(u, v);
  }

  /**
   * Calculates the normal vector at a sample position using finite differences.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param scale - Height scale factor (default: 1)
   * @returns Normalized normal vector
   *
   * @example
   * ```typescript
   * const normal = heightmap.getNormal(128, 128, 1.0);
   * console.log(normal); // Vector3(nx, ny, nz)
   * ```
   */
  getNormal(x: number, y: number, scale: number = 1): Vector3 {
    const x0 = Math.max(0, Math.floor(x) - 1);
    const x1 = Math.min(this.width - 1, Math.floor(x) + 1);
    const y0 = Math.max(0, Math.floor(y) - 1);
    const y1 = Math.min(this.height - 1, Math.floor(y) + 1);

    // Sample heights
    const hL = this.getSample(x0, Math.floor(y));
    const hR = this.getSample(x1, Math.floor(y));
    const hD = this.getSample(Math.floor(x), y0);
    const hU = this.getSample(Math.floor(x), y1);

    // Calculate gradients
    const dx = (hR - hL) * scale;
    const dy = (hU - hD) * scale;

    // Compute normal (cross product of tangent vectors)
    const normal = new Vector3(-dx, 2, -dy);
    return normal.normalize();
  }

  /**
   * Fills the heightmap with a constant value.
   *
   * @param height - Height value to fill
   */
  fill(height: number): void {
    this._data.fill(height);
  }

  /**
   * Generates procedural heightmap using a height function.
   *
   * @param generator - Function that returns height for given coordinates
   *
   * @example
   * ```typescript
   * // Generate sine wave terrain
   * heightmap.generate((x, y) => {
   *   return Math.sin(x * 0.1) * Math.cos(y * 0.1) * 10;
   * });
   * ```
   */
  generate(generator: (x: number, y: number) => number): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const height = generator(x, y);
        this.setSample(x, y, height);
      }
    }
  }

  /**
   * Applies a function to modify all height values.
   *
   * @param modifier - Function that transforms height values
   *
   * @example
   * ```typescript
   * // Scale all heights by 2
   * heightmap.modify(h => h * 2);
   *
   * // Clamp heights to range
   * heightmap.modify(h => Math.max(0, Math.min(100, h)));
   * ```
   */
  modify(modifier: (height: number, x: number, y: number) => number): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const index = y * this.width + x;
        this._data[index] = modifier(this._data[index], x, y);
      }
    }
  }

  /**
   * Smooths the heightmap using box blur.
   *
   * @param radius - Blur radius in samples
   */
  smooth(radius: number = 1): void {
    const temp = new Float32Array(this._data.length);
    const diameter = radius * 2 + 1;
    const weight = 1 / (diameter * diameter);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let sum = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const sx = Math.max(0, Math.min(this.width - 1, x + dx));
            const sy = Math.max(0, Math.min(this.height - 1, y + dy));
            sum += this.getSample(sx, sy);
          }
        }
        temp[y * this.width + x] = sum * weight;
      }
    }

    this._data.set(temp);
  }

  /**
   * Clones this heightmap.
   * @returns New heightmap with copied data
   */
  clone(): Heightmap {
    return new Heightmap({
      width: this.width,
      height: this.height,
      format: this.format,
      data: new Float32Array(this._data),
      minHeight: this.minHeight,
      maxHeight: this.maxHeight,
    });
  }

  /**
   * Imports data from various formats.
   * @private
   */
  private _importData(data: ArrayBuffer | Float32Array | Uint16Array | Uint8Array): void {
    if (data instanceof Float32Array) {
      this._data.set(data);
    } else if (data instanceof Uint16Array) {
      // Convert 16-bit to float (0-65535 -> minHeight-maxHeight)
      const range = this.maxHeight - this.minHeight;
      for (let i = 0; i < data.length && i < this._data.length; i++) {
        this._data[i] = this.minHeight + (data[i]! / 65535) * range;
      }
    } else if (data instanceof Uint8Array) {
      // Convert 8-bit to float (0-255 -> minHeight-maxHeight)
      const range = this.maxHeight - this.minHeight;
      for (let i = 0; i < data.length && i < this._data.length; i++) {
        this._data[i] = this.minHeight + (data[i]! / 255) * range;
      }
    } else if (data instanceof ArrayBuffer) {
      // Assume Float32Array from ArrayBuffer
      const floatView = new Float32Array(data);
      this._data.set(floatView);
    }
  }

  /**
   * Creates a heightmap from an image file.
   *
   * @param url - Image URL
   * @param options - Import options
   * @returns Promise resolving to heightmap
   *
   * @example
   * ```typescript
   * const heightmap = await Heightmap.fromImage('heightmap.png', {
   *   minHeight: 0,
   *   maxHeight: 100
   * });
   * ```
   */
  static async fromImage(
    url: string,
    options: {
      minHeight?: number;
      maxHeight?: number;
      channel?: 'r' | 'g' | 'b' | 'a' | 'average';
    } = {}
  ): Promise<Heightmap> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        // Create canvas to read pixel data
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get 2D context'));
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const pixels = imageData.data;

        // Extract height data
        const heightData = new Uint8Array(img.width * img.height);
        const channel = options.channel ?? 'average';

        for (let i = 0; i < img.width * img.height; i++) {
          const r = pixels[i * 4]!;
          const g = pixels[i * 4 + 1]!;
          const b = pixels[i * 4 + 2]!;
          const a = pixels[i * 4 + 3]!;

          let value: number;
          switch (channel) {
            case 'r': value = r; break;
            case 'g': value = g; break;
            case 'b': value = b; break;
            case 'a': value = a; break;
            case 'average':
            default:
              value = (r + g + b) / 3;
              break;
          }

          heightData[i] = value;
        }

        // Create heightmap
        const heightmap = new Heightmap({
          width: img.width,
          height: img.height,
          format: HeightmapFormat.Uint8,
          data: heightData,
          minHeight: options.minHeight ?? 0,
          maxHeight: options.maxHeight ?? 1,
        });

        resolve(heightmap);
      };

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${url}`));
      };

      img.src = url;
    });
  }

  /**
   * Creates a heightmap from raw binary data.
   *
   * @param data - Raw height data
   * @param width - Width in samples
   * @param height - Height in samples
   * @param format - Data format
   * @param minHeight - Minimum height
   * @param maxHeight - Maximum height
   * @returns Heightmap instance
   */
  static fromRaw(
    data: ArrayBuffer,
    width: number,
    height: number,
    format: HeightmapFormat = HeightmapFormat.Float32,
    minHeight: number = 0,
    maxHeight: number = 1
  ): Heightmap {
    return new Heightmap({
      width,
      height,
      format,
      data,
      minHeight,
      maxHeight,
    });
  }

  /**
   * Creates a flat heightmap with specified dimensions.
   *
   * @param width - Width in samples
   * @param height - Height in samples
   * @param elevation - Constant elevation value
   * @returns Heightmap instance
   */
  static flat(width: number, height: number, elevation: number = 0): Heightmap {
    const heightmap = new Heightmap({
      width,
      height,
      format: HeightmapFormat.Float32,
      minHeight: elevation,
      maxHeight: elevation,
    });
    heightmap.fill(elevation);
    return heightmap;
  }
}
