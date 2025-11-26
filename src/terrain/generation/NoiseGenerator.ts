/**
 * Advanced noise generation functions for procedural terrain generation.
 * Includes Perlin, Simplex, Worley (Cellular), and Ridged Multi-Fractal noise.
 * @module NoiseGenerator
 */

import { Vector2 } from '../../math/Vector2';
import { Vector3 } from '../../math/Vector3';

/**
 * Noise type enumeration.
 */
export enum NoiseType {
  Perlin = 'Perlin',
  Simplex = 'Simplex',
  Worley = 'Worley',
  Ridged = 'Ridged',
  Billow = 'Billow',
}

/**
 * Noise configuration.
 */
export interface NoiseConfig {
  /** Noise type */
  type: NoiseType;
  /** Random seed */
  seed: number;
  /** Frequency/scale */
  frequency: number;
  /** Number of octaves for fractal noise */
  octaves: number;
  /** Lacunarity (frequency multiplier per octave) */
  lacunarity: number;
  /** Persistence (amplitude multiplier per octave) */
  persistence: number;
  /** Amplitude */
  amplitude: number;
  /** Offset added to noise result */
  offset: number;
}

/**
 * Noise generator for procedural terrain generation.
 * Provides various noise algorithms with fractal (multi-octave) support.
 *
 * @example
 * ```typescript
 * const generator = new NoiseGenerator({
 *   type: NoiseType.Perlin,
 *   seed: 12345,
 *   frequency: 0.01,
 *   octaves: 6,
 *   lacunarity: 2.0,
 *   persistence: 0.5,
 *   amplitude: 1.0,
 *   offset: 0.0
 * });
 *
 * const height = generator.noise2D(100, 200);
 * ```
 */
export class NoiseGenerator {
  private _config: NoiseConfig;
  private _permutation: number[];
  private _gradients3D: Vector3[];

  /**
   * Creates a new noise generator.
   *
   * @param config - Noise configuration
   */
  constructor(config: Partial<NoiseConfig> = {}) {
    this._config = {
      type: config.type ?? NoiseType.Perlin,
      seed: config.seed ?? 0,
      frequency: config.frequency ?? 0.01,
      octaves: config.octaves ?? 4,
      lacunarity: config.lacunarity ?? 2.0,
      persistence: config.persistence ?? 0.5,
      amplitude: config.amplitude ?? 1.0,
      offset: config.offset ?? 0.0,
    };

    this._permutation = [];
    this._gradients3D = [];
    this._initialize();
  }

  /**
   * Gets the noise configuration.
   * @returns Noise configuration
   */
  get config(): NoiseConfig {
    return this._config;
  }

  /**
   * Generates 2D noise at the specified position.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Noise value
   */
  noise2D(x: number, y: number): number {
    x *= this._config.frequency;
    y *= this._config.frequency;

    let value = 0;
    let amplitude = this._config.amplitude;
    let frequency = 1;
    let maxValue = 0;

    for (let octave = 0; octave < this._config.octaves; octave++) {
      const octaveValue = this._sampleNoise2D(x * frequency, y * frequency);
      value += octaveValue * amplitude;
      maxValue += amplitude;

      amplitude *= this._config.persistence;
      frequency *= this._config.lacunarity;
    }

    // Normalize to [-1, 1] and apply offset
    return (value / maxValue) + this._config.offset;
  }

  /**
   * Generates 3D noise at the specified position.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   * @returns Noise value
   */
  noise3D(x: number, y: number, z: number): number {
    x *= this._config.frequency;
    y *= this._config.frequency;
    z *= this._config.frequency;

    let value = 0;
    let amplitude = this._config.amplitude;
    let frequency = 1;
    let maxValue = 0;

    for (let octave = 0; octave < this._config.octaves; octave++) {
      const octaveValue = this._sampleNoise3D(x * frequency, y * frequency, z * frequency);
      value += octaveValue * amplitude;
      maxValue += amplitude;

      amplitude *= this._config.persistence;
      frequency *= this._config.lacunarity;
    }

    return (value / maxValue) + this._config.offset;
  }

  /**
   * Samples single-octave 2D noise.
   * @private
   */
  private _sampleNoise2D(x: number, y: number): number {
    switch (this._config.type) {
      case NoiseType.Perlin:
        return this._perlin2D(x, y);
      case NoiseType.Simplex:
        return this._simplex2D(x, y);
      case NoiseType.Worley:
        return this._worley2D(x, y);
      case NoiseType.Ridged:
        return this._ridged2D(x, y);
      case NoiseType.Billow:
        return this._billow2D(x, y);
      default:
        return 0;
    }
  }

  /**
   * Samples single-octave 3D noise.
   * @private
   */
  private _sampleNoise3D(x: number, y: number, z: number): number {
    switch (this._config.type) {
      case NoiseType.Perlin:
        return this._perlin3D(x, y, z);
      case NoiseType.Simplex:
        return this._simplex3D(x, y, z);
      default:
        return 0;
    }
  }

  /**
   * Perlin noise 2D implementation.
   * @private
   */
  private _perlin2D(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = this._fade(xf);
    const v = this._fade(yf);

    const aa = this._permutation[this._permutation[xi]! + yi]!;
    const ab = this._permutation[this._permutation[xi]! + yi + 1]!;
    const ba = this._permutation[this._permutation[xi + 1]! + yi]!;
    const bb = this._permutation[this._permutation[xi + 1]! + yi + 1]!;

    const x1 = this._lerp(
      this._grad2D(aa, xf, yf),
      this._grad2D(ba, xf - 1, yf),
      u
    );
    const x2 = this._lerp(
      this._grad2D(ab, xf, yf - 1),
      this._grad2D(bb, xf - 1, yf - 1),
      u
    );

    return this._lerp(x1, x2, v);
  }

  /**
   * Perlin noise 3D implementation.
   * @private
   */
  private _perlin3D(x: number, y: number, z: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const zi = Math.floor(z) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);

    const u = this._fade(xf);
    const v = this._fade(yf);
    const w = this._fade(zf);

    const aaa = this._permutation[this._permutation[this._permutation[xi]! + yi]! + zi]!;
    const aba = this._permutation[this._permutation[this._permutation[xi]! + yi + 1]! + zi]!;
    const aab = this._permutation[this._permutation[this._permutation[xi]! + yi]! + zi + 1]!;
    const abb = this._permutation[this._permutation[this._permutation[xi]! + yi + 1]! + zi + 1]!;
    const baa = this._permutation[this._permutation[this._permutation[xi + 1]! + yi]! + zi]!;
    const bba = this._permutation[this._permutation[this._permutation[xi + 1]! + yi + 1]! + zi]!;
    const bab = this._permutation[this._permutation[this._permutation[xi + 1]! + yi]! + zi + 1]!;
    const bbb = this._permutation[this._permutation[this._permutation[xi + 1]! + yi + 1]! + zi + 1]!;

    const x1 = this._lerp(
      this._grad3D(aaa, xf, yf, zf),
      this._grad3D(baa, xf - 1, yf, zf),
      u
    );
    const x2 = this._lerp(
      this._grad3D(aba, xf, yf - 1, zf),
      this._grad3D(bba, xf - 1, yf - 1, zf),
      u
    );
    const y1 = this._lerp(x1, x2, v);

    const x3 = this._lerp(
      this._grad3D(aab, xf, yf, zf - 1),
      this._grad3D(bab, xf - 1, yf, zf - 1),
      u
    );
    const x4 = this._lerp(
      this._grad3D(abb, xf, yf - 1, zf - 1),
      this._grad3D(bbb, xf - 1, yf - 1, zf - 1),
      u
    );
    const y2 = this._lerp(x3, x4, v);

    return this._lerp(y1, y2, w);
  }

  /**
   * Simplex noise 2D implementation.
   * @private
   */
  private _simplex2D(x: number, y: number): number {
    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);

    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    let i1: number, j1: number;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    const gi0 = this._permutation[ii + this._permutation[jj]!]! % 12;
    const gi1 = this._permutation[ii + i1 + this._permutation[jj + j1]!]! % 12;
    const gi2 = this._permutation[ii + 1 + this._permutation[jj + 1]!]! % 12;

    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * this._grad2D(gi0, x0, y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * this._grad2D(gi1, x1, y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * this._grad2D(gi2, x2, y2);
    }

    return 70.0 * (n0 + n1 + n2);
  }

  /**
   * Simplex noise 3D implementation.
   * @private
   */
  private _simplex3D(x: number, y: number, z: number): number {
    const F3 = 1.0 / 3.0;
    const G3 = 1.0 / 6.0;

    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);

    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);

    let i1: number, j1: number, k1: number;
    let i2: number, j2: number, k2: number;

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    const gi0 = this._permutation[ii + this._permutation[jj + this._permutation[kk]!]!]! % 12;
    const gi1 = this._permutation[ii + i1 + this._permutation[jj + j1 + this._permutation[kk + k1]!]!]! % 12;
    const gi2 = this._permutation[ii + i2 + this._permutation[jj + j2 + this._permutation[kk + k2]!]!]! % 12;
    const gi3 = this._permutation[ii + 1 + this._permutation[jj + 1 + this._permutation[kk + 1]!]!]! % 12;

    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * this._grad3D(gi0, x0, y0, z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * this._grad3D(gi1, x1, y1, z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * this._grad3D(gi2, x2, y2, z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) {
      t3 *= t3;
      n3 = t3 * t3 * this._grad3D(gi3, x3, y3, z3);
    }

    return 32.0 * (n0 + n1 + n2 + n3);
  }

  /**
   * Worley (Cellular) noise 2D implementation.
   * @private
   */
  private _worley2D(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);

    let minDist = Infinity;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cellX = xi + dx;
        const cellY = yi + dy;

        const hash = this._hash2D(cellX, cellY);
        const px = cellX + this._hash1D(hash);
        const py = cellY + this._hash1D(hash + 1);

        const distX = x - px;
        const distY = y - py;
        const dist = Math.sqrt(distX * distX + distY * distY);

        minDist = Math.min(minDist, dist);
      }
    }

    return 1.0 - Math.min(minDist, 1.0);
  }

  /**
   * Ridged multi-fractal noise.
   * @private
   */
  private _ridged2D(x: number, y: number): number {
    const value = Math.abs(this._perlin2D(x, y));
    return 1.0 - value;
  }

  /**
   * Billow (turbulence) noise.
   * @private
   */
  private _billow2D(x: number, y: number): number {
    return Math.abs(this._perlin2D(x, y));
  }

  /**
   * Fade function for smooth interpolation.
   * @private
   */
  private _fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /**
   * Linear interpolation.
   * @private
   */
  private _lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  /**
   * 2D gradient calculation.
   * @private
   */
  private _grad2D(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2.0 * v : 2.0 * v);
  }

  /**
   * 3D gradient calculation.
   * @private
   */
  private _grad3D(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  /**
   * 1D hash function.
   * @private
   */
  private _hash1D(n: number): number {
    n = ((n >> 16) ^ n) * 0x45d9f3b;
    n = ((n >> 16) ^ n) * 0x45d9f3b;
    n = (n >> 16) ^ n;
    return (n & 0xFFFFFF) / 0xFFFFFF;
  }

  /**
   * 2D hash function.
   * @private
   */
  private _hash2D(x: number, y: number): number {
    return this._permutation[(this._permutation[x & 255]! + y) & 255]!;
  }

  /**
   * Initializes permutation table and gradients.
   * @private
   */
  private _initialize(): void {
    const p = new Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }

    // Shuffle based on seed
    let seed = this._config.seed;
    for (let i = 255; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    // Duplicate for overflow
    this._permutation = new Array(512);
    for (let i = 0; i < 512; i++) {
      this._permutation[i] = p[i & 255];
    }

    // Generate 3D gradients
    this._gradients3D = [];
    for (let i = 0; i < 12; i++) {
      const theta = (i * Math.PI * 2) / 12;
      const phi = Math.acos(2 * (i / 12) - 1);
      this._gradients3D.push(new Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi)
      ));
    }
  }

  /**
   * Sets the seed and reinitializes.
   *
   * @param seed - New random seed
   */
  setSeed(seed: number): void {
    this._config.seed = seed;
    this._initialize();
  }

  /**
   * Creates a noise generator with preset configuration.
   *
   * @param preset - Preset name
   * @returns Noise generator
   */
  static createPreset(preset: 'smooth' | 'rough' | 'ridged' | 'cellular'): NoiseGenerator {
    const presets: Record<string, Partial<NoiseConfig>> = {
      smooth: {
        type: NoiseType.Perlin,
        frequency: 0.005,
        octaves: 4,
        lacunarity: 2.0,
        persistence: 0.5,
      },
      rough: {
        type: NoiseType.Simplex,
        frequency: 0.01,
        octaves: 8,
        lacunarity: 2.5,
        persistence: 0.6,
      },
      ridged: {
        type: NoiseType.Ridged,
        frequency: 0.008,
        octaves: 6,
        lacunarity: 2.2,
        persistence: 0.55,
      },
      cellular: {
        type: NoiseType.Worley,
        frequency: 0.02,
        octaves: 3,
        lacunarity: 2.0,
        persistence: 0.5,
      },
    };

    return new NoiseGenerator(presets[preset]);
  }
}
