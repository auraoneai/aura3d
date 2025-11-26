/**
 * Detail texture blending for close-up terrain quality.
 * Adds fine detail textures that blend in at close distances.
 * @module DetailTextures
 */

import { Texture } from '../../rendering/texture/Texture';
import { Vector2 } from '../../math/Vector2';

/**
 * Detail texture configuration.
 */
export interface DetailTextureConfig {
  /** Detail texture */
  texture: Texture | null;
  /** Detail texture tiling */
  tiling: Vector2;
  /** Detail strength (0-1) */
  strength: number;
  /** Distance where detail starts to fade in */
  fadeInDistance: number;
  /** Distance where detail is fully visible */
  fadeInCompleteDistance: number;
  /** Distance where detail starts to fade out */
  fadeOutDistance: number;
  /** Distance where detail is completely faded */
  fadeOutCompleteDistance: number;
}

/**
 * Detail texture system for terrain.
 * Manages fine detail textures that enhance close-range terrain quality.
 *
 * @example
 * ```typescript
 * const detailSystem = new DetailTextureSystem();
 *
 * // Add detail texture
 * detailSystem.addDetail({
 *   texture: detailTexture,
 *   tiling: new Vector2(100, 100),
 *   strength: 0.5,
 *   fadeInDistance: 10,
 *   fadeInCompleteDistance: 5,
 *   fadeOutDistance: 50,
 *   fadeOutCompleteDistance: 100
 * });
 *
 * // Calculate blend factor based on distance
 * const blendFactor = detailSystem.calculateBlendFactor(0, distanceToCamera);
 * ```
 */
export class DetailTextureSystem {
  private _details: DetailTextureConfig[];

  /**
   * Creates a new detail texture system.
   */
  constructor() {
    this._details = [];
  }

  /**
   * Gets all detail textures.
   * @returns Array of detail configurations
   */
  get details(): readonly DetailTextureConfig[] {
    return this._details;
  }

  /**
   * Adds a detail texture.
   *
   * @param config - Detail texture configuration
   * @returns Detail index
   */
  addDetail(config: Partial<DetailTextureConfig>): number {
    const detail: DetailTextureConfig = {
      texture: config.texture ?? null,
      tiling: config.tiling ?? new Vector2(50, 50),
      strength: config.strength ?? 0.5,
      fadeInDistance: config.fadeInDistance ?? 20,
      fadeInCompleteDistance: config.fadeInCompleteDistance ?? 5,
      fadeOutDistance: config.fadeOutDistance ?? 100,
      fadeOutCompleteDistance: config.fadeOutCompleteDistance ?? 200,
    };

    this._details.push(detail);
    return this._details.length - 1;
  }

  /**
   * Removes a detail texture.
   *
   * @param index - Detail index
   */
  removeDetail(index: number): void {
    if (index >= 0 && index < this._details.length) {
      this._details.splice(index, 1);
    }
  }

  /**
   * Gets a detail texture configuration.
   *
   * @param index - Detail index
   * @returns Detail configuration or undefined
   */
  getDetail(index: number): DetailTextureConfig | undefined {
    return this._details[index];
  }

  /**
   * Calculates the blend factor for a detail texture based on distance.
   *
   * @param index - Detail index
   * @param distance - Distance to camera
   * @returns Blend factor (0-1)
   */
  calculateBlendFactor(index: number, distance: number): number {
    const detail = this._details[index];
    if (!detail) return 0;

    const fadeInStart = detail.fadeInDistance;
    const fadeInEnd = detail.fadeInCompleteDistance;
    const fadeOutStart = detail.fadeOutDistance;
    const fadeOutEnd = detail.fadeOutCompleteDistance;

    let factor = 0;

    if (distance <= fadeInEnd) {
      // Fully visible
      factor = 1;
    } else if (distance > fadeInEnd && distance < fadeInStart) {
      // Fading in
      const range = fadeInStart - fadeInEnd;
      const t = (fadeInStart - distance) / range;
      factor = this._smoothstep(t);
    } else if (distance >= fadeInStart && distance <= fadeOutStart) {
      // Fully visible in mid-range
      factor = 1;
    } else if (distance > fadeOutStart && distance < fadeOutEnd) {
      // Fading out
      const range = fadeOutEnd - fadeOutStart;
      const t = (fadeOutEnd - distance) / range;
      factor = this._smoothstep(t);
    } else {
      // Too far
      factor = 0;
    }

    return factor * detail.strength;
  }

  /**
   * Smoothstep function for smooth transitions.
   * @private
   */
  private _smoothstep(t: number): number {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }

  /**
   * Clears all detail textures.
   */
  clear(): void {
    this._details = [];
  }

  /**
   * Gets the number of detail textures.
   * @returns Detail count
   */
  getDetailCount(): number {
    return this._details.length;
  }

  /**
   * Creates a default detail texture configuration.
   *
   * @param preset - Preset name
   * @returns Detail texture system with preset configurations
   */
  static createPreset(preset: 'closeup' | 'medium' | 'far'): DetailTextureSystem {
    const system = new DetailTextureSystem();

    const presets: Record<string, Partial<DetailTextureConfig>> = {
      closeup: {
        tiling: new Vector2(200, 200),
        strength: 0.7,
        fadeInDistance: 5,
        fadeInCompleteDistance: 1,
        fadeOutDistance: 20,
        fadeOutCompleteDistance: 30,
      },
      medium: {
        tiling: new Vector2(100, 100),
        strength: 0.5,
        fadeInDistance: 20,
        fadeInCompleteDistance: 10,
        fadeOutDistance: 50,
        fadeOutCompleteDistance: 100,
      },
      far: {
        tiling: new Vector2(50, 50),
        strength: 0.3,
        fadeInDistance: 50,
        fadeInCompleteDistance: 30,
        fadeOutDistance: 150,
        fadeOutCompleteDistance: 250,
      },
    };

    system.addDetail(presets[preset]);
    return system;
  }
}
