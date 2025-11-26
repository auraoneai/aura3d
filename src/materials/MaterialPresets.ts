/**
 * G3D 5.0 Material System
 * Material Presets - Pre-configured materials for common use cases
 *
 * @module materials/MaterialPresets
 * @implements PRD Section 7.1.7
 */

import { StandardPBRMaterial } from './StandardPBRMaterial';
import { TransmissionMaterial } from './TransmissionMaterial';
import { OceanMaterial } from './OceanMaterial';
import { SubsurfaceMaterial } from './SubsurfaceMaterial';
import { HairMaterial } from './HairMaterial';
import { ClothMaterial } from './ClothMaterial';
import type { Material } from './Material';
import { Color } from '../math/Color';

/**
 * Material preset names
 */
export type MaterialPresetName =
  | 'gold'
  | 'silver'
  | 'copper'
  | 'iron'
  | 'aluminum'
  | 'plastic'
  | 'rubber'
  | 'wood'
  | 'concrete'
  | 'fabric'
  | 'glass'
  | 'water'
  | 'skin'
  | 'eye'
  | 'hair';

/**
 * Material preset parameters
 */
export interface MaterialPresetParams {
  [key: string]: any;
}

/**
 * Pre-configured material instances for common use cases
 *
 * Provides physically accurate values for common materials including:
 * - Metals (gold, silver, copper, iron, aluminum)
 * - Non-metals (plastic, rubber, wood, concrete, fabric)
 * - Special materials (glass, water, skin, eye, hair)
 */
export class MaterialPresets {
  /**
   * Gold material preset
   * Metallic = 1.0, Roughness = 0.2
   * F0 = (1.022, 0.782, 0.344) - physically accurate
   */
  static get gold(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial('Gold');
    mat.albedo = new Color(1.022, 0.782, 0.344);
    mat.metallic = 1.0;
    mat.roughness = 0.2;
    return mat;
  }

  /**
   * Silver material preset
   * Metallic = 1.0, Roughness = 0.15
   * F0 = (0.972, 0.960, 0.915)
   */
  static get silver(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial('Silver');
    mat.albedo = new Color(0.972, 0.960, 0.915);
    mat.metallic = 1.0;
    mat.roughness = 0.15;
    return mat;
  }

  /**
   * Copper material preset
   * Metallic = 1.0, Roughness = 0.25
   * F0 = (0.955, 0.638, 0.538)
   */
  static get copper(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial('Copper');
    mat.albedo = new Color(0.955, 0.638, 0.538);
    mat.metallic = 1.0;
    mat.roughness = 0.25;
    return mat;
  }

  /**
   * Iron material preset
   * Metallic = 1.0, Roughness = 0.4
   * F0 = (0.560, 0.570, 0.580)
   */
  static get iron(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial('Iron');
    mat.albedo = new Color(0.560, 0.570, 0.580);
    mat.metallic = 1.0;
    mat.roughness = 0.4;
    return mat;
  }

  /**
   * Aluminum material preset
   * Metallic = 1.0, Roughness = 0.3
   * F0 = (0.913, 0.921, 0.925)
   */
  static get aluminum(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial('Aluminum');
    mat.albedo = new Color(0.913, 0.921, 0.925);
    mat.metallic = 1.0;
    mat.roughness = 0.3;
    return mat;
  }

  /**
   * Plastic material preset
   * Metallic = 0.0, Roughness = 0.5
   */
  static get plastic(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial('Plastic');
    mat.albedo = new Color(0.8, 0.8, 0.8);
    mat.metallic = 0.0;
    mat.roughness = 0.5;
    return mat;
  }

  /**
   * Rubber material preset
   * Metallic = 0.0, Roughness = 0.9
   */
  static get rubber(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial('Rubber');
    mat.albedo = new Color(0.2, 0.2, 0.2);
    mat.metallic = 0.0;
    mat.roughness = 0.9;
    return mat;
  }

  /**
   * Wood material preset
   * Metallic = 0.0, Roughness = 0.7
   */
  static get wood(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial('Wood');
    mat.albedo = new Color(0.6, 0.4, 0.2);
    mat.metallic = 0.0;
    mat.roughness = 0.7;
    return mat;
  }

  /**
   * Concrete material preset
   * Metallic = 0.0, Roughness = 0.85
   */
  static get concrete(): StandardPBRMaterial {
    const mat = new StandardPBRMaterial('Concrete');
    mat.albedo = new Color(0.5, 0.5, 0.5);
    mat.metallic = 0.0;
    mat.roughness = 0.85;
    return mat;
  }

  /**
   * Fabric material preset
   * Cloth material with sheen
   */
  static get fabric(): ClothMaterial {
    const mat = new ClothMaterial('Fabric');
    mat.albedo = new Color(0.5, 0.3, 0.2);
    mat.sheenIntensity = 0.3;
    mat.roughness = 0.8;
    return mat;
  }

  /**
   * Glass material preset
   * Transmission = 1.0, IOR = 1.5, Roughness = 0.0
   */
  static get glass(): TransmissionMaterial {
    const mat = new TransmissionMaterial('Glass');
    mat.albedo = new Color(1, 1, 1);
    mat.transmission = 1.0;
    mat.ior = 1.5;
    mat.roughness = 0.0;
    mat.thickness = 0.5;
    return mat;
  }

  /**
   * Water material preset
   * Ocean material with subtle waves
   */
  static get water(): OceanMaterial {
    const mat = new OceanMaterial('Water');
    mat.waterColor = new Color(0.0, 0.3, 0.5);
    mat.deepWaterColor = new Color(0.0, 0.1, 0.2);
    mat.waveAmplitude = 0.5;
    mat.reflectivity = 0.5;
    return mat;
  }

  /**
   * Skin material preset
   * Subsurface scattering for realistic skin
   */
  static get skin(): SubsurfaceMaterial {
    const mat = new SubsurfaceMaterial('Skin');
    mat.albedo = new Color(0.95, 0.8, 0.7);
    mat.sssColor = new Color(1, 0.5, 0.3);
    mat.sssRadius = 0.8;
    mat.sssIntensity = 1.0;
    mat.roughness = 0.4;
    return mat;
  }

  /**
   * Eye material preset
   * Subsurface scattering with high SSS
   */
  static get eye(): SubsurfaceMaterial {
    const mat = new SubsurfaceMaterial('Eye');
    mat.albedo = new Color(1, 1, 1);
    mat.sssColor = new Color(0.8, 0.5, 0.5);
    mat.sssRadius = 0.5;
    mat.sssIntensity = 0.8;
    mat.roughness = 0.1;
    return mat;
  }

  /**
   * Hair material preset
   * Anisotropic hair shading
   */
  static get hair(): HairMaterial {
    const mat = new HairMaterial('Hair');
    mat.albedo = new Color(0.3, 0.2, 0.1);
    mat.primaryShift = 0.1;
    mat.primaryIntensity = 0.8;
    mat.secondaryShift = -0.15;
    mat.secondaryIntensity = 0.5;
    return mat;
  }

  /**
   * Create a material from a preset name with optional overrides
   *
   * @param preset - Preset name
   * @param overrides - Parameter overrides
   * @returns Material instance
   *
   * @example
   * ```typescript
   * // Create gold material with custom roughness
   * const gold = MaterialPresets.create('gold', { roughness: 0.3 });
   *
   * // Create glass with custom IOR
   * const crown = MaterialPresets.create('glass', { ior: 1.52 });
   * ```
   */
  static create(
    preset: MaterialPresetName,
    overrides?: Partial<MaterialPresetParams>
  ): Material {
    let material: Material;

    // Get base preset
    switch (preset) {
      case 'gold':
        material = this.gold;
        break;
      case 'silver':
        material = this.silver;
        break;
      case 'copper':
        material = this.copper;
        break;
      case 'iron':
        material = this.iron;
        break;
      case 'aluminum':
        material = this.aluminum;
        break;
      case 'plastic':
        material = this.plastic;
        break;
      case 'rubber':
        material = this.rubber;
        break;
      case 'wood':
        material = this.wood;
        break;
      case 'concrete':
        material = this.concrete;
        break;
      case 'fabric':
        material = this.fabric;
        break;
      case 'glass':
        material = this.glass;
        break;
      case 'water':
        material = this.water;
        break;
      case 'skin':
        material = this.skin;
        break;
      case 'eye':
        material = this.eye;
        break;
      case 'hair':
        material = this.hair;
        break;
      default:
        throw new Error(`Unknown material preset: ${preset}`);
    }

    // Apply overrides
    if (overrides) {
      for (const [key, value] of Object.entries(overrides)) {
        if (key in material) {
          (material as any)[key] = value;
        }
      }
    }

    return material;
  }

  /**
   * Get all available preset names
   */
  static getPresetNames(): MaterialPresetName[] {
    return [
      'gold',
      'silver',
      'copper',
      'iron',
      'aluminum',
      'plastic',
      'rubber',
      'wood',
      'concrete',
      'fabric',
      'glass',
      'water',
      'skin',
      'eye',
      'hair'
    ];
  }

  /**
   * Get preset material without cloning (for preview/reference)
   */
  static getPreset(preset: MaterialPresetName): Material {
    return this.create(preset);
  }
}

/**
 * Default export for convenience
 */
export default MaterialPresets;
