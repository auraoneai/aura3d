/**
 * Terrain-specific material with multi-layer texture support and distance-based blending.
 * Supports up to 16 layers with splatmap-based blending.
 * @module TerrainMaterial
 */

import { Material, MaterialDescriptor } from '../rendering/material/Material';
import { Texture } from '../rendering/texture/Texture';
import { Color } from '../math/Color';
import { Vector2 } from '../math/Vector2';
import { Splatmap } from './Splatmap';
import { Logger } from '../core/Logger';

const logger = Logger.create('TerrainMaterial');

/**
 * Terrain layer properties.
 */
export interface TerrainLayer {
  /** Layer name */
  name: string;
  /** Albedo/diffuse texture */
  albedoMap: Texture | null;
  /** Normal map */
  normalMap: Texture | null;
  /** Roughness map */
  roughnessMap: Texture | null;
  /** Metallic map */
  metallicMap: Texture | null;
  /** Ambient occlusion map */
  aoMap: Texture | null;
  /** Height/displacement map */
  heightMap: Texture | null;
  /** Texture tiling */
  tiling: Vector2;
  /** Texture offset */
  offset: Vector2;
  /** Texture rotation (radians) */
  rotation: number;
  /** Metallic factor */
  metallic: number;
  /** Roughness factor */
  roughness: number;
  /** Normal map strength */
  normalScale: number;
  /** Height map scale */
  heightScale: number;
}

/**
 * Terrain material descriptor.
 */
export interface TerrainMaterialDescriptor extends MaterialDescriptor {
  /** Terrain layers (up to 16) */
  layers?: TerrainLayer[];
  /** Splatmaps for layer blending (4 layers per splatmap) */
  splatmaps?: Splatmap[];
  /** Enable triplanar projection */
  triplanar?: boolean;
  /** Triplanar blend sharpness */
  triplanarBlend?: number;
  /** Distance-based texture blending ranges */
  distanceBlend?: {
    near: number;
    far: number;
  };
  /** Enable macro variation texture */
  macroVariation?: boolean;
  /** Macro variation texture */
  macroTexture?: Texture | null;
  /** Macro variation scale */
  macroScale?: number;
}

/**
 * Terrain material with multi-layer texture support.
 * Provides advanced features like splatmap blending, triplanar projection,
 * and distance-based texture detail blending.
 *
 * @example
 * ```typescript
 * const material = new TerrainMaterial({
 *   name: 'TerrainMaterial',
 *   layers: [
 *     {
 *       name: 'Grass',
 *       albedoMap: grassTexture,
 *       normalMap: grassNormal,
 *       tiling: new Vector2(10, 10),
 *       offset: new Vector2(0, 0),
 *       metallic: 0,
 *       roughness: 0.8
 *     },
 *     {
 *       name: 'Rock',
 *       albedoMap: rockTexture,
 *       normalMap: rockNormal,
 *       tiling: new Vector2(8, 8),
 *       metallic: 0.2,
 *       roughness: 0.9
 *     }
 *   ],
 *   splatmaps: [splatmap],
 *   triplanar: true,
 *   triplanarBlend: 2.0
 * });
 * ```
 */
export class TerrainMaterial extends Material {
  /** Terrain layers */
  readonly layers: TerrainLayer[];
  /** Splatmaps for blending */
  readonly splatmaps: Splatmap[];
  /** Enable triplanar projection */
  triplanar: boolean;
  /** Triplanar blend sharpness */
  triplanarBlend: number;
  /** Distance blend settings */
  distanceBlend: { near: number; far: number };
  /** Enable macro variation */
  macroVariation: boolean;
  /** Macro variation texture */
  macroTexture: Texture | null;
  /** Macro variation scale */
  macroScale: number;

  /**
   * Creates a new terrain material.
   *
   * @param descriptor - Material configuration
   */
  constructor(descriptor: TerrainMaterialDescriptor = {}) {
    super({
      ...descriptor,
      shaderVariant: 'terrain',
    });

    this.layers = descriptor.layers ?? this._createDefaultLayers();
    this.splatmaps = descriptor.splatmaps ?? [];
    this.triplanar = descriptor.triplanar ?? false;
    this.triplanarBlend = descriptor.triplanarBlend ?? 2.0;
    this.distanceBlend = descriptor.distanceBlend ?? { near: 50, far: 200 };
    this.macroVariation = descriptor.macroVariation ?? false;
    this.macroTexture = descriptor.macroTexture ?? null;
    this.macroScale = descriptor.macroScale ?? 100;
  }

  /**
   * Gets the number of layers.
   * @returns Layer count
   */
  get layerCount(): number {
    return this.layers.length;
  }

  /**
   * Gets a layer by index.
   *
   * @param index - Layer index
   * @returns Layer or undefined
   */
  getLayer(index: number): TerrainLayer | undefined {
    return this.layers[index];
  }

  /**
   * Adds a new layer.
   *
   * @param layer - Layer to add
   * @returns Layer index
   */
  addLayer(layer: TerrainLayer): number {
    if (this.layers.length >= 16) {
      logger.warn('Maximum of 16 layers supported');
      return -1;
    }

    this.layers.push(layer);
    return this.layers.length - 1;
  }

  /**
   * Removes a layer by index.
   *
   * @param index - Layer index
   */
  removeLayer(index: number): void {
    if (index >= 0 && index < this.layers.length) {
      this.layers.splice(index, 1);
    }
  }

  /**
   * Updates a layer's properties.
   *
   * @param index - Layer index
   * @param properties - Properties to update
   */
  updateLayer(index: number, properties: Partial<TerrainLayer>): void {
    const layer = this.layers[index];
    if (!layer) return;

    Object.assign(layer, properties);
  }

  /**
   * Gets a splatmap by index.
   *
   * @param index - Splatmap index (0-3 for 16 layers)
   * @returns Splatmap or undefined
   */
  getSplatmap(index: number): Splatmap | undefined {
    return this.splatmaps[index];
  }

  /**
   * Sets a splatmap.
   *
   * @param index - Splatmap index
   * @param splatmap - Splatmap to set
   */
  setSplatmap(index: number, splatmap: Splatmap): void {
    this.splatmaps[index] = splatmap;
  }

  /**
   * Enables or disables triplanar projection.
   *
   * @param enabled - Enable triplanar
   */
  setTriplanar(enabled: boolean): void {
    this.triplanar = enabled;
  }

  /**
   * Sets triplanar blend sharpness.
   *
   * @param blend - Blend sharpness (0-10)
   */
  setTriplanarBlend(blend: number): void {
    this.triplanarBlend = Math.max(0, Math.min(10, blend));
  }

  /**
   * Sets distance-based blending ranges.
   *
   * @param near - Near distance
   * @param far - Far distance
   */
  setDistanceBlend(near: number, far: number): void {
    this.distanceBlend = { near, far };
  }

  /**
   * Sets macro variation texture.
   *
   * @param texture - Macro texture
   * @param scale - Texture scale
   */
  setMacroVariation(texture: Texture | null, scale: number = 100): void {
    this.macroTexture = texture;
    this.macroScale = scale;
    this.macroVariation = texture !== null;
  }

  /**
   * Calculates shader defines for this material.
   * @returns Shader defines
   */
  getShaderDefines(): Record<string, boolean | number | string> {
    const defines: Record<string, boolean | number | string> = {
      TERRAIN_LAYER_COUNT: this.layers.length,
      TERRAIN_SPLATMAP_COUNT: this.splatmaps.length,
    };

    if (this.triplanar) {
      defines.TERRAIN_TRIPLANAR = true;
    }

    if (this.macroVariation && this.macroTexture) {
      defines.TERRAIN_MACRO_VARIATION = true;
    }

    // Enable features per layer
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i]!;

      if (layer.albedoMap) {
        defines[`TERRAIN_LAYER${i}_ALBEDO`] = true;
      }
      if (layer.normalMap) {
        defines[`TERRAIN_LAYER${i}_NORMAL`] = true;
      }
      if (layer.roughnessMap) {
        defines[`TERRAIN_LAYER${i}_ROUGHNESS`] = true;
      }
      if (layer.metallicMap) {
        defines[`TERRAIN_LAYER${i}_METALLIC`] = true;
      }
      if (layer.aoMap) {
        defines[`TERRAIN_LAYER${i}_AO`] = true;
      }
      if (layer.heightMap) {
        defines[`TERRAIN_LAYER${i}_HEIGHT`] = true;
      }
    }

    return defines;
  }

  /**
   * Gets all textures used by this material.
   * @returns Array of textures
   */
  getAllTextures(): Texture[] {
    const textures: Texture[] = [];

    for (const layer of this.layers) {
      if (layer.albedoMap) textures.push(layer.albedoMap);
      if (layer.normalMap) textures.push(layer.normalMap);
      if (layer.roughnessMap) textures.push(layer.roughnessMap);
      if (layer.metallicMap) textures.push(layer.metallicMap);
      if (layer.aoMap) textures.push(layer.aoMap);
      if (layer.heightMap) textures.push(layer.heightMap);
    }

    if (this.macroTexture) {
      textures.push(this.macroTexture);
    }

    return textures;
  }

  /**
   * Creates default layers.
   * @private
   */
  private _createDefaultLayers(): TerrainLayer[] {
    return [
      {
        name: 'Layer 0',
        albedoMap: null,
        normalMap: null,
        roughnessMap: null,
        metallicMap: null,
        aoMap: null,
        heightMap: null,
        tiling: new Vector2(10, 10),
        offset: new Vector2(0, 0),
        rotation: 0,
        metallic: 0,
        roughness: 0.8,
        normalScale: 1,
        heightScale: 0.1,
      },
    ];
  }

  /**
   * Creates a terrain material from a preset.
   *
   * @param preset - Preset name
   * @returns Terrain material
   */
  static createPreset(preset: 'basic' | 'detailed' | 'ultra'): TerrainMaterial {
    const presets: Record<string, Partial<TerrainMaterialDescriptor>> = {
      basic: {
        triplanar: false,
        macroVariation: false,
        distanceBlend: { near: 100, far: 300 },
      },
      detailed: {
        triplanar: true,
        triplanarBlend: 2.0,
        macroVariation: false,
        distanceBlend: { near: 50, far: 200 },
      },
      ultra: {
        triplanar: true,
        triplanarBlend: 3.0,
        macroVariation: true,
        macroScale: 100,
        distanceBlend: { near: 30, far: 150 },
      },
    };

    return new TerrainMaterial(presets[preset]);
  }

  /**
   * Creates a default terrain layer.
   *
   * @param name - Layer name
   * @param tiling - Texture tiling
   * @returns Terrain layer
   */
  static createDefaultLayer(name: string = 'Layer', tiling: Vector2 = new Vector2(10, 10)): TerrainLayer {
    return {
      name,
      albedoMap: null,
      normalMap: null,
      roughnessMap: null,
      metallicMap: null,
      aoMap: null,
      heightMap: null,
      tiling: tiling.clone(),
      offset: new Vector2(0, 0),
      rotation: 0,
      metallic: 0,
      roughness: 0.8,
      normalScale: 1,
      heightScale: 0.1,
    };
  }
}
