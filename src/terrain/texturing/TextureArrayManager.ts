/**
 * Texture array creation and management for efficient terrain texturing.
 * Manages texture atlases and array textures for GPU-based blending.
 * @module TextureArrayManager
 */

import { Texture } from '../../rendering/texture/Texture';
import { Logger } from '../../core/Logger';

const logger = Logger.create('TextureArrayManager');

/**
 * Texture array configuration.
 */
export interface TextureArrayConfig {
  /** Array width */
  width: number;
  /** Array height */
  height: number;
  /** Number of layers */
  layerCount: number;
  /** Texture format */
  format: string;
  /** Generate mipmaps */
  generateMipmaps: boolean;
  /** Anisotropic filtering level */
  anisotropy: number;
}

/**
 * Texture array manager for terrain.
 * Creates and manages texture arrays for efficient multi-layer terrain rendering.
 *
 * @example
 * ```typescript
 * const manager = new TextureArrayManager();
 *
 * // Create texture array from individual textures
 * const albedoArray = manager.createArray([
 *   grassAlbedo,
 *   rockAlbedo,
 *   snowAlbedo
 * ], {
 *   width: 1024,
 *   height: 1024,
 *   format: 'rgba8unorm',
 *   generateMipmaps: true
 * });
 * ```
 */
export class TextureArrayManager {
  private _arrays: Map<string, Texture>;

  /**
   * Creates a new texture array manager.
   */
  constructor() {
    this._arrays = new Map();
  }

  /**
   * Creates a texture array from individual textures.
   *
   * @param textures - Array of source textures
   * @param config - Array configuration
   * @param name - Array name
   * @returns Texture array
   */
  createArray(
    textures: Texture[],
    config: Partial<TextureArrayConfig> = {},
    name: string = 'TextureArray'
  ): Texture {
    const cfg: TextureArrayConfig = {
      width: config.width ?? 1024,
      height: config.height ?? 1024,
      layerCount: config.layerCount ?? textures.length,
      format: config.format ?? 'rgba8unorm',
      generateMipmaps: config.generateMipmaps ?? true,
      anisotropy: config.anisotropy ?? 16,
    };

    logger.info(`Creating texture array '${name}' with ${cfg.layerCount} layers`);

    // In a real implementation, this would create a WebGPU texture array
    // For now, we create a placeholder texture
    const textureArray = new Texture({
      width: cfg.width,
      height: cfg.height,
      format: cfg.format as any,
      mipLevelCount: cfg.generateMipmaps ? Math.floor(Math.log2(Math.max(cfg.width, cfg.height))) + 1 : 1,
    });

    this._arrays.set(name, textureArray);

    logger.info(`Texture array '${name}' created successfully`);
    return textureArray;
  }

  /**
   * Gets a texture array by name.
   *
   * @param name - Array name
   * @returns Texture array or undefined
   */
  getArray(name: string): Texture | undefined {
    return this._arrays.get(name);
  }

  /**
   * Removes a texture array.
   *
   * @param name - Array name
   */
  removeArray(name: string): void {
    const array = this._arrays.get(name);
    if (array) {
      array.destroy();
      this._arrays.delete(name);
      logger.info(`Removed texture array: ${name}`);
    }
  }

  /**
   * Creates multiple texture arrays for different map types.
   *
   * @param albedoTextures - Albedo textures
   * @param normalTextures - Normal map textures
   * @param roughnessTextures - Roughness textures
   * @param config - Array configuration
   * @returns Map of texture arrays
   */
  createMultipleArrays(
    albedoTextures: Texture[],
    normalTextures: Texture[],
    roughnessTextures: Texture[],
    config: Partial<TextureArrayConfig> = {}
  ): Map<string, Texture> {
    const arrays = new Map<string, Texture>();

    if (albedoTextures.length > 0) {
      arrays.set('albedo', this.createArray(albedoTextures, config, 'AlbedoArray'));
    }

    if (normalTextures.length > 0) {
      arrays.set('normal', this.createArray(normalTextures, config, 'NormalArray'));
    }

    if (roughnessTextures.length > 0) {
      arrays.set('roughness', this.createArray(roughnessTextures, config, 'RoughnessArray'));
    }

    return arrays;
  }

  /**
   * Clears all texture arrays.
   */
  clear(): void {
    for (const [name, array] of this._arrays) {
      array.destroy();
    }
    this._arrays.clear();
    logger.info('Cleared all texture arrays');
  }

  /**
   * Gets the number of texture arrays managed.
   * @returns Array count
   */
  getArrayCount(): number {
    return this._arrays.size;
  }
}
