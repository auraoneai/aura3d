import { Logger } from '../../core/Logger';
import { IdGenerator } from '../../core/IdGenerator';
import { Color } from '../../math/Color';
import { Texture } from '../texture/Texture';
import { Material, MaterialDescriptor } from './Material';

const logger = Logger.create('StandardPBRMaterial');

/**
 * Standard PBR material descriptor.
 */
export interface StandardPBRMaterialDescriptor extends Omit<MaterialDescriptor, 'properties' | 'textures'> {
  /** Base color (albedo) */
  albedo?: Color;
  /** Metallic factor [0-1] */
  metallic?: number;
  /** Roughness factor [0-1] */
  roughness?: number;
  /** Ambient occlusion factor [0-1] */
  ao?: number;
  /** Emission color */
  emission?: Color;
  /** Emission intensity multiplier */
  emissionIntensity?: number;

  // Texture maps
  /** Albedo/base color texture */
  albedoMap?: Texture | null;
  /** Normal map (tangent space) */
  normalMap?: Texture | null;
  /** Metallic-roughness combined texture (metallic=B, roughness=G) */
  metallicRoughnessMap?: Texture | null;
  /** Ambient occlusion texture */
  aoMap?: Texture | null;
  /** Emission texture */
  emissionMap?: Texture | null;
}

/**
 * Standard PBR material with full GPU integration.
 *
 * This is a specialized implementation of Material that provides
 * a complete physically-based rendering workflow with proper GPU
 * data upload. It extends the base Material class with additional
 * convenience methods and ensures all properties are uploaded to
 * the shader uniforms.
 *
 * Features:
 * - Cook-Torrance BRDF compatible
 * - Automatic texture binding and uniform upload
 * - Optimized GPU state management
 * - Compatible with the PBR shader in Renderer.ts
 *
 * @example
 * ```typescript
 * // Create a metallic material
 * const gold = new StandardPBRMaterial({
 *   name: 'Gold',
 *   albedo: new Color(1.0, 0.782, 0.344),
 *   metallic: 1.0,
 *   roughness: 0.3,
 * });
 *
 * // Create a textured material
 * const wall = new StandardPBRMaterial({
 *   name: 'Brick Wall',
 *   albedo: new Color(1, 1, 1),
 *   albedoMap: brickAlbedo,
 *   normalMap: brickNormal,
 *   metallicRoughnessMap: brickMR,
 *   roughness: 0.8,
 *   metallic: 0.0,
 * });
 *
 * // Apply to mesh
 * mesh.setMaterial(gold);
 *
 * // Update properties at runtime
 * gold.setAlbedo(new Color(0.9, 0.7, 0.3));
 * gold.setRoughness(0.5);
 * ```
 */
export class StandardPBRMaterial extends Material {
  /**
   * Creates a new StandardPBRMaterial instance.
   *
   * @param descriptor - Material descriptor
   */
  constructor(descriptor: StandardPBRMaterialDescriptor = {}) {
    // Build base material descriptor
    const baseDescriptor: MaterialDescriptor = {
      name: descriptor.name,
      properties: {
        albedo: descriptor.albedo || new Color(0.8, 0.8, 0.8, 1.0),
        metallic: descriptor.metallic ?? 0.0,
        roughness: descriptor.roughness ?? 0.5,
        ao: descriptor.ao ?? 1.0,
        emission: descriptor.emission || new Color(0, 0, 0, 1.0),
        emissionIntensity: descriptor.emissionIntensity ?? 0.0,
        normalScale: 1.0,
        heightScale: 0.02,
      },
      textures: {
        albedoMap: descriptor.albedoMap || null,
        normalMap: descriptor.normalMap || null,
        metallicRoughnessMap: descriptor.metallicRoughnessMap || null,
        aoMap: descriptor.aoMap || null,
        emissionMap: descriptor.emissionMap || null,
        metallicMap: null,
        roughnessMap: null,
        heightMap: null,
        envMap: null,
      },
      state: descriptor.state,
      shaderVariant: descriptor.shaderVariant,
    };

    super(baseDescriptor);

    logger.debug(`Created StandardPBRMaterial: ${this.name}`);
  }

  // ==========================================================================
  // CONVENIENCE PROPERTY SETTERS
  // ==========================================================================

  /**
   * Sets the albedo (base color).
   *
   * @param albedo - Albedo color
   *
   * @example
   * ```typescript
   * material.setAlbedo(new Color(1, 0, 0)); // Red
   * material.setAlbedo(Color.fromHex(0xFF5733));
   * ```
   */
  setAlbedo(albedo: Color): void {
    this.setProperty('albedo', albedo);
  }

  /**
   * Gets the albedo color.
   *
   * @returns Albedo color
   */
  getAlbedo(): Color {
    return this.getProperty('albedo');
  }

  /**
   * Sets the metallic factor.
   *
   * @param metallic - Metallic factor [0-1]
   *
   * @example
   * ```typescript
   * material.setMetallic(1.0); // Fully metallic
   * material.setMetallic(0.0); // Dielectric
   * ```
   */
  setMetallic(metallic: number): void {
    this.setProperty('metallic', Math.max(0, Math.min(1, metallic)));
  }

  /**
   * Gets the metallic factor.
   *
   * @returns Metallic factor [0-1]
   */
  getMetallic(): number {
    return this.getProperty('metallic');
  }

  /**
   * Sets the roughness factor.
   *
   * @param roughness - Roughness factor [0-1]
   *
   * @example
   * ```typescript
   * material.setRoughness(0.1); // Very smooth
   * material.setRoughness(1.0); // Very rough
   * ```
   */
  setRoughness(roughness: number): void {
    this.setProperty('roughness', Math.max(0.04, Math.min(1, roughness)));
  }

  /**
   * Gets the roughness factor.
   *
   * @returns Roughness factor [0-1]
   */
  getRoughness(): number {
    return this.getProperty('roughness');
  }

  /**
   * Sets the ambient occlusion factor.
   *
   * @param ao - AO factor [0-1]
   */
  setAO(ao: number): void {
    this.setProperty('ao', Math.max(0, Math.min(1, ao)));
  }

  /**
   * Gets the ambient occlusion factor.
   *
   * @returns AO factor [0-1]
   */
  getAO(): number {
    return this.getProperty('ao');
  }

  /**
   * Sets the emission color.
   *
   * @param emission - Emission color
   *
   * @example
   * ```typescript
   * material.setEmission(new Color(1, 0.5, 0));
   * material.setEmissionIntensity(2.0);
   * ```
   */
  setEmission(emission: Color): void {
    this.setProperty('emission', emission);
  }

  /**
   * Gets the emission color.
   *
   * @returns Emission color
   */
  getEmission(): Color {
    return this.getProperty('emission');
  }

  /**
   * Sets the emission intensity.
   *
   * @param intensity - Emission intensity multiplier
   */
  setEmissionIntensity(intensity: number): void {
    this.setProperty('emissionIntensity', Math.max(0, intensity));
  }

  /**
   * Gets the emission intensity.
   *
   * @returns Emission intensity
   */
  getEmissionIntensity(): number {
    return this.getProperty('emissionIntensity');
  }

  // ==========================================================================
  // TEXTURE SETTERS
  // ==========================================================================

  /**
   * Sets the albedo map.
   *
   * @param texture - Albedo texture or null
   */
  setAlbedoMap(texture: Texture | null): void {
    this.setTexture('albedoMap', texture);
  }

  /**
   * Gets the albedo map.
   *
   * @returns Albedo texture or null
   */
  getAlbedoMap(): Texture | null {
    return this.getTexture('albedoMap');
  }

  /**
   * Sets the normal map.
   *
   * @param texture - Normal texture or null
   */
  setNormalMap(texture: Texture | null): void {
    this.setTexture('normalMap', texture);
  }

  /**
   * Gets the normal map.
   *
   * @returns Normal texture or null
   */
  getNormalMap(): Texture | null {
    return this.getTexture('normalMap');
  }

  /**
   * Sets the metallic-roughness map.
   *
   * @param texture - Metallic-roughness texture or null
   */
  setMetallicRoughnessMap(texture: Texture | null): void {
    this.setTexture('metallicRoughnessMap', texture);
  }

  /**
   * Gets the metallic-roughness map.
   *
   * @returns Metallic-roughness texture or null
   */
  getMetallicRoughnessMap(): Texture | null {
    return this.getTexture('metallicRoughnessMap');
  }

  /**
   * Sets the ambient occlusion map.
   *
   * @param texture - AO texture or null
   */
  setAOMap(texture: Texture | null): void {
    this.setTexture('aoMap', texture);
  }

  /**
   * Gets the ambient occlusion map.
   *
   * @returns AO texture or null
   */
  getAOMap(): Texture | null {
    return this.getTexture('aoMap');
  }

  /**
   * Sets the emission map.
   *
   * @param texture - Emission texture or null
   */
  setEmissionMap(texture: Texture | null): void {
    this.setTexture('emissionMap', texture);
  }

  /**
   * Gets the emission map.
   *
   * @returns Emission texture or null
   */
  getEmissionMap(): Texture | null {
    return this.getTexture('emissionMap');
  }

  // ==========================================================================
  // FACTORY METHODS
  // ==========================================================================

  /**
   * Creates a dielectric (non-metal) material.
   *
   * @param albedo - Base color
   * @param roughness - Roughness factor
   * @returns Dielectric material
   *
   * @example
   * ```typescript
   * const plastic = StandardPBRMaterial.createDielectric(
   *   new Color(0.2, 0.3, 0.8),
   *   0.4
   * );
   * ```
   */
  static createDielectric(albedo: Color, roughness: number = 0.5): StandardPBRMaterial {
    return new StandardPBRMaterial({
      name: 'Dielectric',
      albedo,
      metallic: 0.0,
      roughness,
      ao: 1.0,
    });
  }

  /**
   * Creates a metallic material.
   *
   * @param albedo - Metal color
   * @param roughness - Roughness factor
   * @returns Metallic material
   *
   * @example
   * ```typescript
   * const gold = StandardPBRMaterial.createMetal(
   *   new Color(1.0, 0.782, 0.344),
   *   0.3
   * );
   * ```
   */
  static createMetal(albedo: Color, roughness: number = 0.3): StandardPBRMaterial {
    return new StandardPBRMaterial({
      name: 'Metal',
      albedo,
      metallic: 1.0,
      roughness,
      ao: 1.0,
    });
  }

  /**
   * Creates an emissive (glowing) material.
   *
   * @param color - Emission color
   * @param intensity - Emission intensity
   * @returns Emissive material
   *
   * @example
   * ```typescript
   * const neon = StandardPBRMaterial.createEmissive(
   *   new Color(0, 1, 0.5),
   *   3.0
   * );
   * ```
   */
  static createEmissive(color: Color, intensity: number = 1.0): StandardPBRMaterial {
    return new StandardPBRMaterial({
      name: 'Emissive',
      albedo: new Color(0, 0, 0),
      metallic: 0.0,
      roughness: 1.0,
      emission: color,
      emissionIntensity: intensity,
    });
  }

  /**
   * Creates a material from preset values.
   *
   * @param preset - Preset name
   * @returns Material with preset values
   *
   * @example
   * ```typescript
   * const gold = StandardPBRMaterial.fromPreset('gold');
   * const copper = StandardPBRMaterial.fromPreset('copper');
   * const plastic = StandardPBRMaterial.fromPreset('plastic-red');
   * ```
   */
  static fromPreset(preset: string): StandardPBRMaterial {
    const presets: Record<string, StandardPBRMaterialDescriptor> = {
      gold: {
        name: 'Gold',
        albedo: new Color(1.0, 0.782, 0.344),
        metallic: 1.0,
        roughness: 0.3,
      },
      silver: {
        name: 'Silver',
        albedo: new Color(0.972, 0.960, 0.915),
        metallic: 1.0,
        roughness: 0.2,
      },
      copper: {
        name: 'Copper',
        albedo: new Color(0.955, 0.637, 0.538),
        metallic: 1.0,
        roughness: 0.4,
      },
      iron: {
        name: 'Iron',
        albedo: new Color(0.560, 0.570, 0.580),
        metallic: 1.0,
        roughness: 0.5,
      },
      'plastic-red': {
        name: 'Red Plastic',
        albedo: new Color(0.8, 0.1, 0.1),
        metallic: 0.0,
        roughness: 0.4,
      },
      'plastic-blue': {
        name: 'Blue Plastic',
        albedo: new Color(0.1, 0.3, 0.8),
        metallic: 0.0,
        roughness: 0.4,
      },
      rubber: {
        name: 'Rubber',
        albedo: new Color(0.2, 0.2, 0.2),
        metallic: 0.0,
        roughness: 0.9,
      },
      wood: {
        name: 'Wood',
        albedo: new Color(0.6, 0.4, 0.2),
        metallic: 0.0,
        roughness: 0.7,
      },
    };

    const config = presets[preset] || presets['plastic-red'];
    return new StandardPBRMaterial(config);
  }

  /**
   * Clones this material.
   *
   * @returns Cloned material
   */
  override clone(): StandardPBRMaterial {
    const baseMaterial = super.clone();
    const cloned = new StandardPBRMaterial({
      name: `${this.name}_Clone`,
    });

    // Copy all properties from base material
    Object.assign(cloned, baseMaterial);

    return cloned;
  }
}
