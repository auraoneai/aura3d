/**
 * Splatmap for multi-texture terrain blending.
 * Supports 4-layer per pass RGBA blending with texture arrays.
 * @module Splatmap
 */

import { Vector2 } from '../math/Vector2';
import { Logger } from '../core/Logger';

const logger = Logger.create('Splatmap');

/**
 * Splatmap data format.
 */
export enum SplatmapFormat {
  /** 8-bit RGBA (4 channels) */
  RGBA8 = 'RGBA8',
  /** 16-bit RGBA (4 channels) */
  RGBA16 = 'RGBA16',
  /** 32-bit float RGBA (4 channels) */
  RGBA32F = 'RGBA32F',
}

/**
 * Splatmap descriptor.
 */
export interface SplatmapDescriptor {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Data format */
  format?: SplatmapFormat;
  /** Initial data (optional) */
  data?: Uint8Array | Uint16Array | Float32Array;
  /** Number of layers (multiple of 4) */
  layerCount?: number;
}

/**
 * Splatmap for terrain texture blending.
 * Stores blend weights for multiple texture layers in RGBA channels.
 * Each splatmap supports 4 layers per pass.
 *
 * @example
 * ```typescript
 * // Create splatmap for 4 layers
 * const splatmap = new Splatmap({
 *   width: 512,
 *   height: 512,
 *   format: SplatmapFormat.RGBA8,
 *   layerCount: 4
 * });
 *
 * // Set blend weights at position
 * splatmap.setWeights(256, 256, [0.5, 0.3, 0.2, 0.0]);
 *
 * // Get blended weights
 * const weights = splatmap.getWeights(256.5, 256.5);
 *
 * // Paint with brush
 * splatmap.paint(256, 256, 10, 0, 1.0);
 * ```
 */
export class Splatmap {
  /** Width in pixels */
  readonly width: number;
  /** Height in pixels */
  readonly height: number;
  /** Data format */
  readonly format: SplatmapFormat;
  /** Number of layers */
  readonly layerCount: number;
  /** Number of splatmap passes (4 layers per pass) */
  readonly passCount: number;
  /** Splatmap data (RGBA interleaved) */
  private _data: Float32Array[];

  /**
   * Creates a new splatmap.
   *
   * @param descriptor - Splatmap configuration
   */
  constructor(descriptor: SplatmapDescriptor) {
    this.width = descriptor.width;
    this.height = descriptor.height;
    this.format = descriptor.format ?? SplatmapFormat.RGBA8;
    this.layerCount = descriptor.layerCount ?? 4;
    this.passCount = Math.ceil(this.layerCount / 4);

    // Allocate storage for each pass (4 channels per pass)
    this._data = [];
    const pixelCount = this.width * this.height;

    for (let i = 0; i < this.passCount; i++) {
      this._data[i] = new Float32Array(pixelCount * 4);

      // Initialize first layer to full weight, others to zero
      if (i === 0) {
        for (let j = 0; j < pixelCount; j++) {
          this._data[i]![j * 4] = 1.0; // R channel = layer 0
          this._data[i]![j * 4 + 1] = 0.0; // G channel = layer 1
          this._data[i]![j * 4 + 2] = 0.0; // B channel = layer 2
          this._data[i]![j * 4 + 3] = 0.0; // A channel = layer 3
        }
      }
    }

    // Import data if provided
    if (descriptor.data) {
      this._importData(descriptor.data);
    }
  }

  /**
   * Gets the data array for a pass.
   *
   * @param pass - Pass index (0-based)
   * @returns Data array
   */
  getData(pass: number = 0): Float32Array {
    return this._data[pass] ?? this._data[0];
  }

  /**
   * Sets blend weights at integer pixel coordinates.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param weights - Weight values for all layers
   */
  setWeights(x: number, y: number, weights: number[]): void {
    x = Math.floor(x);
    y = Math.floor(y);

    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return;
    }

    const index = (y * this.width + x) * 4;

    // Distribute weights across passes
    for (let pass = 0; pass < this.passCount; pass++) {
      for (let channel = 0; channel < 4; channel++) {
        const layer = pass * 4 + channel;
        const weight = layer < weights.length ? weights[layer] : 0;
        this._data[pass]![index + channel] = weight;
      }
    }
  }

  /**
   * Gets blend weights at integer pixel coordinates.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Weight values for all layers
   */
  getWeightsAt(x: number, y: number): number[] {
    x = Math.floor(x);
    y = Math.floor(y);

    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return new Array(this.layerCount).fill(0);
    }

    const weights: number[] = [];
    const index = (y * this.width + x) * 4;

    for (let pass = 0; pass < this.passCount; pass++) {
      for (let channel = 0; channel < 4; channel++) {
        const layer = pass * 4 + channel;
        if (layer < this.layerCount) {
          weights.push(this._data[pass]![index + channel]!);
        }
      }
    }

    return weights;
  }

  /**
   * Gets interpolated blend weights at floating-point coordinates.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Interpolated weight values
   */
  getWeights(x: number, y: number): number[] {
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
    const w00 = this.getWeightsAt(x0, y0);
    const w10 = this.getWeightsAt(x1, y0);
    const w01 = this.getWeightsAt(x0, y1);
    const w11 = this.getWeightsAt(x1, y1);

    // Bilinear interpolation
    const weights: number[] = [];
    for (let i = 0; i < this.layerCount; i++) {
      const w0 = w00[i]! * (1 - fx) + w10[i]! * fx;
      const w1 = w01[i]! * (1 - fx) + w11[i]! * fx;
      weights.push(w0 * (1 - fy) + w1 * fy);
    }

    return weights;
  }

  /**
   * Paints a layer with a circular brush.
   *
   * @param x - Center X coordinate
   * @param y - Center Y coordinate
   * @param radius - Brush radius in pixels
   * @param layer - Layer index to paint
   * @param strength - Paint strength (0-1)
   * @param falloff - Brush falloff curve (default: 1 = linear)
   */
  paint(
    x: number,
    y: number,
    radius: number,
    layer: number,
    strength: number = 1.0,
    falloff: number = 1.0
  ): void {
    if (layer < 0 || layer >= this.layerCount) return;

    const pass = Math.floor(layer / 4);
    const channel = layer % 4;

    const minX = Math.max(0, Math.floor(x - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(x + radius));
    const minY = Math.max(0, Math.floor(y - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(y + radius));

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const dx = px - x;
        const dy = py - y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > radius) continue;

        // Calculate brush influence with falloff
        const influence = Math.pow(1 - distance / radius, falloff) * strength;

        // Get current weights
        const weights = this.getWeightsAt(px, py);

        // Add influence to target layer
        weights[layer] = Math.min(1, weights[layer]! + influence);

        // Normalize weights
        const sum = weights.reduce((a, b) => a + b, 0);
        if (sum > 0) {
          for (let i = 0; i < weights.length; i++) {
            weights[i]! /= sum;
          }
        }

        // Write back
        this.setWeights(px, py, weights);
      }
    }
  }

  /**
   * Smooths blend weights in a region.
   *
   * @param x - Center X coordinate
   * @param y - Center Y coordinate
   * @param radius - Smooth radius in pixels
   * @param strength - Smooth strength (0-1)
   */
  smooth(x: number, y: number, radius: number, strength: number = 1.0): void {
    const minX = Math.max(0, Math.floor(x - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(x + radius));
    const minY = Math.max(0, Math.floor(y - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(y + radius));

    const temp = new Map<string, number[]>();

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const dx = px - x;
        const dy = py - y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > radius) continue;

        // Average neighboring pixels
        const neighbors: number[][] = [];
        for (let ny = -1; ny <= 1; ny++) {
          for (let nx = -1; nx <= 1; nx++) {
            const sx = px + nx;
            const sy = py + ny;
            if (sx >= 0 && sx < this.width && sy >= 0 && sy < this.height) {
              neighbors.push(this.getWeightsAt(sx, sy));
            }
          }
        }

        // Calculate average
        const averaged = new Array(this.layerCount).fill(0);
        for (const n of neighbors) {
          for (let i = 0; i < this.layerCount; i++) {
            averaged[i] += n[i];
          }
        }
        for (let i = 0; i < this.layerCount; i++) {
          averaged[i] /= neighbors.length;
        }

        // Blend with original based on strength
        const original = this.getWeightsAt(px, py);
        const blended = original.map((v, i) => v * (1 - strength) + averaged[i] * strength);

        temp.set(`${px},${py}`, blended);
      }
    }

    // Apply smoothed values
    for (const [key, weights] of temp) {
      const [px, py] = key.split(',').map(Number);
      this.setWeights(px, py, weights);
    }
  }

  /**
   * Fills the entire splatmap with a layer.
   *
   * @param layer - Layer index to fill
   */
  fill(layer: number): void {
    if (layer < 0 || layer >= this.layerCount) return;

    const weights = new Array(this.layerCount).fill(0);
    weights[layer] = 1;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.setWeights(x, y, weights);
      }
    }
  }

  /**
   * Normalizes all weights to sum to 1.
   */
  normalize(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const weights = this.getWeightsAt(x, y);
        const sum = weights.reduce((a, b) => a + b, 0);

        if (sum > 0) {
          const normalized = weights.map(w => w / sum);
          this.setWeights(x, y, normalized);
        }
      }
    }
  }

  /**
   * Clones this splatmap.
   * @returns New splatmap with copied data
   */
  clone(): Splatmap {
    const splatmap = new Splatmap({
      width: this.width,
      height: this.height,
      format: this.format,
      layerCount: this.layerCount,
    });

    for (let i = 0; i < this.passCount; i++) {
      splatmap._data[i]!.set(this._data[i]!);
    }

    return splatmap;
  }

  /**
   * Imports data from various formats.
   * @private
   */
  private _importData(data: Uint8Array | Uint16Array | Float32Array): void {
    if (data instanceof Float32Array) {
      // Assume data is already in the correct format
      const pixelCount = this.width * this.height * 4;
      for (let i = 0; i < this.passCount && i * pixelCount < data.length; i++) {
        const start = i * pixelCount;
        const end = Math.min(start + pixelCount, data.length);
        this._data[i]!.set(data.subarray(start, end));
      }
    } else if (data instanceof Uint16Array) {
      // Convert 16-bit to float
      for (let i = 0; i < data.length && i < this._data[0]!.length; i++) {
        this._data[0]![i] = data[i]! / 65535;
      }
    } else if (data instanceof Uint8Array) {
      // Convert 8-bit to float
      for (let i = 0; i < data.length && i < this._data[0]!.length; i++) {
        this._data[0]![i] = data[i]! / 255;
      }
    }
  }

  /**
   * Creates a splatmap from an image.
   *
   * @param url - Image URL
   * @param layerCount - Number of layers
   * @returns Promise resolving to splatmap
   */
  static async fromImage(url: string, layerCount: number = 4): Promise<Splatmap> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
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

        const splatmap = new Splatmap({
          width: img.width,
          height: img.height,
          format: SplatmapFormat.RGBA8,
          data: imageData.data,
          layerCount,
        });

        resolve(splatmap);
      };

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${url}`));
      };

      img.src = url;
    });
  }
}
