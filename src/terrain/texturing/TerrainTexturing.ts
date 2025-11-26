/**
 * Terrain texture layer management and blending.
 * Manages multiple texture layers with different blending modes.
 * @module TerrainTexturing
 */

import { Texture } from '../../rendering/texture/Texture';
import { Vector2 } from '../../math/Vector2';
import { Splatmap } from '../Splatmap';
import { Logger } from '../../core/Logger';

const logger = Logger.create('TerrainTexturing');

/**
 * Texture blend mode.
 */
export enum TextureBlendMode {
  /** Height-based blending */
  Height = 'Height',
  /** Slope-based blending */
  Slope = 'Slope',
  /** Manual splatmap blending */
  Manual = 'Manual',
  /** Combined height and slope */
  Combined = 'Combined',
}

/**
 * Texture layer configuration.
 */
export interface TextureLayerConfig {
  /** Layer name */
  name: string;
  /** Albedo texture */
  albedo: Texture | null;
  /** Normal map */
  normal: Texture | null;
  /** Roughness map */
  roughness: Texture | null;
  /** Metallic map */
  metallic: Texture | null;
  /** Height map */
  height: Texture | null;
  /** Ambient occlusion map */
  ao: Texture | null;
  /** Texture tiling */
  tiling: Vector2;
  /** Texture offset */
  offset: Vector2;
  /** Blend mode */
  blendMode: TextureBlendMode;
  /** Height range for height-based blending [min, max] */
  heightRange?: [number, number];
  /** Slope range for slope-based blending [min, max] in degrees */
  slopeRange?: [number, number];
  /** Blend sharpness */
  blendSharpness: number;
}

/**
 * Terrain texturing system.
 * Manages texture layers and their blending for terrain rendering.
 *
 * @example
 * ```typescript
 * const texturing = new TerrainTexturing();
 *
 * // Add grass layer
 * texturing.addLayer({
 *   name: 'Grass',
 *   albedo: grassAlbedo,
 *   normal: grassNormal,
 *   tiling: new Vector2(10, 10),
 *   blendMode: TextureBlendMode.Height,
 *   heightRange: [0, 50],
 *   blendSharpness: 2.0
 * });
 *
 * // Add rock layer
 * texturing.addLayer({
 *   name: 'Rock',
 *   albedo: rockAlbedo,
 *   normal: rockNormal,
 *   tiling: new Vector2(8, 8),
 *   blendMode: TextureBlendMode.Slope,
 *   slopeRange: [30, 90],
 *   blendSharpness: 1.5
 * });
 * ```
 */
export class TerrainTexturing {
  private _layers: TextureLayerConfig[];
  private _splatmaps: Splatmap[];
  private _maxLayers: number;

  /**
   * Creates a new terrain texturing system.
   *
   * @param maxLayers - Maximum number of layers (default 16)
   */
  constructor(maxLayers: number = 16) {
    this._layers = [];
    this._splatmaps = [];
    this._maxLayers = maxLayers;
  }

  /**
   * Gets all texture layers.
   * @returns Array of texture layers
   */
  get layers(): readonly TextureLayerConfig[] {
    return this._layers;
  }

  /**
   * Gets all splatmaps.
   * @returns Array of splatmaps
   */
  get splatmaps(): readonly Splatmap[] {
    return this._splatmaps;
  }

  /**
   * Adds a texture layer.
   *
   * @param config - Layer configuration
   * @returns Layer index
   */
  addLayer(config: Partial<TextureLayerConfig>): number {
    if (this._layers.length >= this._maxLayers) {
      logger.warn(`Maximum of ${this._maxLayers} layers reached`);
      return -1;
    }

    const layer: TextureLayerConfig = {
      name: config.name ?? `Layer ${this._layers.length}`,
      albedo: config.albedo ?? null,
      normal: config.normal ?? null,
      roughness: config.roughness ?? null,
      metallic: config.metallic ?? null,
      height: config.height ?? null,
      ao: config.ao ?? null,
      tiling: config.tiling ?? new Vector2(10, 10),
      offset: config.offset ?? new Vector2(0, 0),
      blendMode: config.blendMode ?? TextureBlendMode.Manual,
      heightRange: config.heightRange,
      slopeRange: config.slopeRange,
      blendSharpness: config.blendSharpness ?? 1.0,
    };

    this._layers.push(layer);
    logger.info(`Added texture layer: ${layer.name}`);

    return this._layers.length - 1;
  }

  /**
   * Removes a texture layer.
   *
   * @param index - Layer index
   */
  removeLayer(index: number): void {
    if (index >= 0 && index < this._layers.length) {
      const layer = this._layers[index]!;
      this._layers.splice(index, 1);
      logger.info(`Removed texture layer: ${layer.name}`);
    }
  }

  /**
   * Gets a texture layer by index.
   *
   * @param index - Layer index
   * @returns Layer configuration or undefined
   */
  getLayer(index: number): TextureLayerConfig | undefined {
    return this._layers[index];
  }

  /**
   * Updates a layer's properties.
   *
   * @param index - Layer index
   * @param properties - Properties to update
   */
  updateLayer(index: number, properties: Partial<TextureLayerConfig>): void {
    const layer = this._layers[index];
    if (!layer) return;

    Object.assign(layer, properties);
    logger.info(`Updated texture layer: ${layer.name}`);
  }

  /**
   * Adds a splatmap for manual blending.
   *
   * @param splatmap - Splatmap to add
   * @returns Splatmap index
   */
  addSplatmap(splatmap: Splatmap): number {
    this._splatmaps.push(splatmap);
    return this._splatmaps.length - 1;
  }

  /**
   * Gets a splatmap by index.
   *
   * @param index - Splatmap index
   * @returns Splatmap or undefined
   */
  getSplatmap(index: number): Splatmap | undefined {
    return this._splatmaps[index];
  }

  /**
   * Calculates blend weight for a layer at given height and slope.
   *
   * @param layerIndex - Layer index
   * @param height - Height value (0-1 normalized)
   * @param slope - Slope in degrees (0-90)
   * @returns Blend weight (0-1)
   */
  calculateBlendWeight(layerIndex: number, height: number, slope: number): number {
    const layer = this._layers[layerIndex];
    if (!layer) return 0;

    let weight = 0;

    switch (layer.blendMode) {
      case TextureBlendMode.Height:
        weight = this._calculateHeightWeight(layer, height);
        break;

      case TextureBlendMode.Slope:
        weight = this._calculateSlopeWeight(layer, slope);
        break;

      case TextureBlendMode.Combined:
        const heightWeight = this._calculateHeightWeight(layer, height);
        const slopeWeight = this._calculateSlopeWeight(layer, slope);
        weight = heightWeight * slopeWeight;
        break;

      case TextureBlendMode.Manual:
        weight = 1.0; // Use splatmap directly
        break;
    }

    return Math.max(0, Math.min(1, weight));
  }

  /**
   * Calculates height-based blend weight.
   * @private
   */
  private _calculateHeightWeight(layer: TextureLayerConfig, height: number): number {
    if (!layer.heightRange) return 0;

    const [min, max] = layer.heightRange;
    const range = max - min;

    if (range === 0) return height === min ? 1 : 0;

    const normalizedHeight = (height - min) / range;
    const weight = Math.pow(Math.max(0, Math.min(1, normalizedHeight)), layer.blendSharpness);

    return weight;
  }

  /**
   * Calculates slope-based blend weight.
   * @private
   */
  private _calculateSlopeWeight(layer: TextureLayerConfig, slope: number): number {
    if (!layer.slopeRange) return 0;

    const [min, max] = layer.slopeRange;
    const range = max - min;

    if (range === 0) return slope === min ? 1 : 0;

    if (slope < min) {
      return 0;
    } else if (slope > max) {
      return 1;
    } else {
      const normalizedSlope = (slope - min) / range;
      return Math.pow(normalizedSlope, layer.blendSharpness);
    }
  }

  /**
   * Gets all textures used by this texturing system.
   * @returns Array of textures
   */
  getAllTextures(): Texture[] {
    const textures: Texture[] = [];

    for (const layer of this._layers) {
      if (layer.albedo) textures.push(layer.albedo);
      if (layer.normal) textures.push(layer.normal);
      if (layer.roughness) textures.push(layer.roughness);
      if (layer.metallic) textures.push(layer.metallic);
      if (layer.height) textures.push(layer.height);
      if (layer.ao) textures.push(layer.ao);
    }

    return textures;
  }

  /**
   * Clears all layers and splatmaps.
   */
  clear(): void {
    this._layers = [];
    this._splatmaps = [];
    logger.info('Cleared all texture layers and splatmaps');
  }

  /**
   * Gets the number of texture passes needed (4 layers per pass).
   * @returns Number of passes
   */
  getPassCount(): number {
    return Math.ceil(this._layers.length / 4);
  }

  /**
   * Creates a default terrain texturing setup.
   *
   * @param preset - Preset name
   * @returns Terrain texturing
   */
  static createPreset(preset: 'simple' | 'detailed'): TerrainTexturing {
    const texturing = new TerrainTexturing();

    if (preset === 'simple') {
      // Basic grass, rock, snow setup
      texturing.addLayer({
        name: 'Grass',
        tiling: new Vector2(10, 10),
        blendMode: TextureBlendMode.Height,
        heightRange: [0, 60],
        blendSharpness: 1.5,
      });

      texturing.addLayer({
        name: 'Rock',
        tiling: new Vector2(8, 8),
        blendMode: TextureBlendMode.Slope,
        slopeRange: [30, 90],
        blendSharpness: 2.0,
      });

      texturing.addLayer({
        name: 'Snow',
        tiling: new Vector2(12, 12),
        blendMode: TextureBlendMode.Height,
        heightRange: [70, 100],
        blendSharpness: 1.0,
      });
    } else if (preset === 'detailed') {
      // More detailed multi-layer setup
      texturing.addLayer({
        name: 'Sand',
        tiling: new Vector2(15, 15),
        blendMode: TextureBlendMode.Height,
        heightRange: [0, 10],
        blendSharpness: 2.0,
      });

      texturing.addLayer({
        name: 'Grass',
        tiling: new Vector2(10, 10),
        blendMode: TextureBlendMode.Height,
        heightRange: [5, 50],
        blendSharpness: 1.5,
      });

      texturing.addLayer({
        name: 'Dirt',
        tiling: new Vector2(12, 12),
        blendMode: TextureBlendMode.Combined,
        heightRange: [40, 70],
        slopeRange: [20, 40],
        blendSharpness: 1.8,
      });

      texturing.addLayer({
        name: 'Rock',
        tiling: new Vector2(8, 8),
        blendMode: TextureBlendMode.Slope,
        slopeRange: [35, 90],
        blendSharpness: 2.0,
      });

      texturing.addLayer({
        name: 'Snow',
        tiling: new Vector2(12, 12),
        blendMode: TextureBlendMode.Height,
        heightRange: [75, 100],
        blendSharpness: 1.0,
      });
    }

    return texturing;
  }
}
