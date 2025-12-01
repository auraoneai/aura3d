/**
 * G3D Architectural Visualization - PBR Material Library
 * Complete material definitions for architectural rendering
 */

import { Vector3, Color } from 'g3d';
import { ProceduralTextureGenerator } from '../../shared/ProceduralAssets';

export interface PBRMaterialParams {
  name: string;
  albedo: Color;
  albedoTexture?: HTMLCanvasElement; // Added texture support
  roughness: number;
  metallic: number;
  normalStrength: number;
  ao: number;
  emissive?: Color;
  emissiveIntensity?: number;
}

/**
 * Comprehensive material library for architectural visualization
 */
export class MaterialLibrary {
  private materials: Map<string, PBRMaterialParams> = new Map();

  constructor() {
    this.initializeWoodMaterials();
    this.initializeStoneMaterials();
    this.initializeMetalMaterials();
    this.initializeFabricMaterials();
    this.initializeGlassMaterials();
    this.initializeCeramicMaterials();
  }

  /**
   * Wood materials with realistic PBR properties
   */
  private initializeWoodMaterials(): void {
    // Oak - Medium brown with visible grain
    this.materials.set('oak', {
      name: 'Oak Wood',
      albedo: new Color(0.545, 0.396, 0.259), // Rich brown
      albedoTexture: ProceduralTextureGenerator.createWoodAlbedo(512, 512).data,
      roughness: 0.65,
      metallic: 0.0,
      normalStrength: 0.8,
      ao: 0.85,
    });

    // Walnut - Dark brown, luxurious
    this.materials.set('walnut', {
      name: 'Walnut Wood',
      albedo: new Color(0.361, 0.239, 0.176), // Dark chocolate brown
      roughness: 0.6,
      metallic: 0.0,
      normalStrength: 0.75,
      ao: 0.8,
    });

    // Pine - Light, yellowish wood
    this.materials.set('pine', {
      name: 'Pine Wood',
      albedo: new Color(0.816, 0.694, 0.502), // Light honey color
      roughness: 0.7,
      metallic: 0.0,
      normalStrength: 0.6,
      ao: 0.9,
    });

    // Mahogany - Reddish brown, premium
    this.materials.set('mahogany', {
      name: 'Mahogany Wood',
      albedo: new Color(0.502, 0.227, 0.145), // Deep reddish brown
      roughness: 0.55,
      metallic: 0.0,
      normalStrength: 0.7,
      ao: 0.82,
    });

    // Birch - Very light, almost white
    this.materials.set('birch', {
      name: 'Birch Wood',
      albedo: new Color(0.937, 0.878, 0.737), // Pale cream
      roughness: 0.68,
      metallic: 0.0,
      normalStrength: 0.5,
      ao: 0.92,
    });

    // Teak - Golden brown with natural oils
    this.materials.set('teak', {
      name: 'Teak Wood',
      albedo: new Color(0.682, 0.478, 0.278), // Golden brown
      roughness: 0.5,
      metallic: 0.0,
      normalStrength: 0.65,
      ao: 0.88,
    });
  }

  /**
   * Stone and concrete materials
   */
  private initializeStoneMaterials(): void {
    // Carrara Marble - White with gray veining
    this.materials.set('marble_carrara', {
      name: 'Carrara Marble',
      albedo: new Color(0.94, 0.93, 0.91), // Off-white
      albedoTexture: ProceduralTextureGenerator.createMarbleAlbedo(512, 512).data,
      roughness: 0.25,
      metallic: 0.0,
      normalStrength: 0.4,
      ao: 0.95,
    });

    // Black Granite - Polished black stone
    this.materials.set('granite_black', {
      name: 'Black Granite',
      albedo: new Color(0.12, 0.12, 0.13), // Near black with slight warmth
      roughness: 0.15,
      metallic: 0.0,
      normalStrength: 0.3,
      ao: 0.7,
    });

    // Limestone - Beige sedimentary rock
    this.materials.set('limestone', {
      name: 'Limestone',
      albedo: new Color(0.847, 0.812, 0.729), // Warm beige
      roughness: 0.75,
      metallic: 0.0,
      normalStrength: 0.6,
      ao: 0.85,
    });

    // Concrete - Modern architectural material
    this.materials.set('concrete', {
      name: 'Polished Concrete',
      albedo: new Color(0.502, 0.502, 0.502), // Medium gray
      albedoTexture: ProceduralTextureGenerator.createConcreteAlbedo(512, 512).data,
      roughness: 0.6,
      metallic: 0.0,
      normalStrength: 0.5,
      ao: 0.8,
    });

    // Slate - Dark gray with texture
    this.materials.set('slate', {
      name: 'Slate Stone',
      albedo: new Color(0.259, 0.275, 0.29), // Blue-gray
      roughness: 0.7,
      metallic: 0.0,
      normalStrength: 0.7,
      ao: 0.75,
    });

    // Sandstone - Warm earthy tone
    this.materials.set('sandstone', {
      name: 'Sandstone',
      albedo: new Color(0.761, 0.643, 0.467), // Sandy beige
      roughness: 0.8,
      metallic: 0.0,
      normalStrength: 0.65,
      ao: 0.83,
    });
  }

  /**
   * Metal materials with varying finishes
   */
  private initializeMetalMaterials(): void {
    // Chrome - Highly reflective
    this.materials.set('chrome', {
      name: 'Polished Chrome',
      albedo: new Color(0.549, 0.556, 0.554), // Neutral metallic
      roughness: 0.05,
      metallic: 1.0,
      normalStrength: 0.1,
      ao: 1.0,
    });

    // Brushed Steel - Anisotropic finish
    this.materials.set('steel_brushed', {
      name: 'Brushed Steel',
      albedo: new Color(0.651, 0.651, 0.651), // Light gray metallic
      roughness: 0.3,
      metallic: 1.0,
      normalStrength: 0.4,
      ao: 0.95,
    });

    // Copper - Warm metallic
    this.materials.set('copper', {
      name: 'Polished Copper',
      albedo: new Color(0.955, 0.637, 0.538), // Reddish metallic
      roughness: 0.2,
      metallic: 1.0,
      normalStrength: 0.2,
      ao: 0.98,
    });

    // Brass - Golden alloy
    this.materials.set('brass', {
      name: 'Polished Brass',
      albedo: new Color(0.875, 0.78, 0.455), // Golden yellow
      roughness: 0.25,
      metallic: 1.0,
      normalStrength: 0.15,
      ao: 0.97,
    });

    // Aluminum - Light metallic
    this.materials.set('aluminum', {
      name: 'Brushed Aluminum',
      albedo: new Color(0.913, 0.921, 0.925), // Very light gray
      roughness: 0.35,
      metallic: 1.0,
      normalStrength: 0.3,
      ao: 0.96,
    });

    // Black Metal - Matte dark metal
    this.materials.set('metal_black', {
      name: 'Matte Black Metal',
      albedo: new Color(0.02, 0.02, 0.02), // Very dark
      roughness: 0.6,
      metallic: 1.0,
      normalStrength: 0.2,
      ao: 0.75,
    });
  }

  /**
   * Fabric and upholstery materials
   */
  private initializeFabricMaterials(): void {
    // Cotton - Natural fabric
    this.materials.set('cotton', {
      name: 'Cotton Fabric',
      albedo: new Color(0.863, 0.859, 0.847), // Off-white
      roughness: 0.85,
      metallic: 0.0,
      normalStrength: 0.6,
      ao: 0.88,
    });

    // Velvet - Luxurious soft fabric
    this.materials.set('velvet', {
      name: 'Velvet Fabric',
      albedo: new Color(0.122, 0.161, 0.267), // Deep blue
      roughness: 0.9,
      metallic: 0.0,
      normalStrength: 0.8,
      ao: 0.7,
    });

    // Leather - Natural hide
    this.materials.set('leather', {
      name: 'Leather',
      albedo: new Color(0.435, 0.286, 0.184), // Brown leather
      roughness: 0.55,
      metallic: 0.0,
      normalStrength: 0.5,
      ao: 0.82,
    });

    // Linen - Textured natural fabric
    this.materials.set('linen', {
      name: 'Linen Fabric',
      albedo: new Color(0.906, 0.878, 0.831), // Natural beige
      roughness: 0.88,
      metallic: 0.0,
      normalStrength: 0.7,
      ao: 0.86,
    });

    // Wool - Warm textured fabric
    this.materials.set('wool', {
      name: 'Wool Fabric',
      albedo: new Color(0.584, 0.541, 0.494), // Warm gray
      roughness: 0.92,
      metallic: 0.0,
      normalStrength: 0.75,
      ao: 0.84,
    });
  }

  /**
   * Glass materials with transmission
   */
  private initializeGlassMaterials(): void {
    // Clear Glass - Fully transparent
    this.materials.set('glass_clear', {
      name: 'Clear Glass',
      albedo: new Color(0.95, 0.95, 0.95), // Nearly white
      roughness: 0.05,
      metallic: 0.0,
      normalStrength: 0.1,
      ao: 1.0,
    });

    // Frosted Glass - Translucent
    this.materials.set('glass_frosted', {
      name: 'Frosted Glass',
      albedo: new Color(0.9, 0.9, 0.9), // Light gray
      roughness: 0.4,
      metallic: 0.0,
      normalStrength: 0.6,
      ao: 0.95,
    });

    // Tinted Glass - Slightly colored
    this.materials.set('glass_tinted', {
      name: 'Tinted Glass',
      albedo: new Color(0.651, 0.753, 0.769), // Light blue
      roughness: 0.08,
      metallic: 0.0,
      normalStrength: 0.1,
      ao: 0.98,
    });

    // Smoked Glass - Dark tinted
    this.materials.set('glass_smoked', {
      name: 'Smoked Glass',
      albedo: new Color(0.275, 0.275, 0.275), // Dark gray
      roughness: 0.1,
      metallic: 0.0,
      normalStrength: 0.1,
      ao: 0.85,
    });
  }

  /**
   * Ceramic and tile materials
   */
  private initializeCeramicMaterials(): void {
    // White Ceramic - Glossy porcelain
    this.materials.set('ceramic_white', {
      name: 'White Ceramic',
      albedo: new Color(0.961, 0.961, 0.961), // Bright white
      roughness: 0.15,
      metallic: 0.0,
      normalStrength: 0.2,
      ao: 0.98,
    });

    // Terracotta - Earthy clay
    this.materials.set('terracotta', {
      name: 'Terracotta',
      albedo: new Color(0.729, 0.376, 0.278), // Reddish brown
      roughness: 0.7,
      metallic: 0.0,
      normalStrength: 0.5,
      ao: 0.85,
    });

    // Glazed Tile - Shiny ceramic
    this.materials.set('tile_glazed', {
      name: 'Glazed Tile',
      albedo: new Color(0.847, 0.831, 0.804), // Cream
      roughness: 0.12,
      metallic: 0.0,
      normalStrength: 0.15,
      ao: 0.96,
    });

    // Porcelain - High-quality ceramic
    this.materials.set('porcelain', {
      name: 'Porcelain',
      albedo: new Color(0.941, 0.933, 0.922), // Off-white
      roughness: 0.18,
      metallic: 0.0,
      normalStrength: 0.25,
      ao: 0.97,
    });
  }

  /**
   * Get material by name
   */
  getMaterial(name: string): PBRMaterialParams | undefined {
    return this.materials.get(name);
  }

  /**
   * Get all materials in a category
   */
  getMaterialsByCategory(category: string): PBRMaterialParams[] {
    const results: PBRMaterialParams[] = [];
    for (const [key, material] of this.materials.entries()) {
      if (key.startsWith(category)) {
        results.push(material);
      }
    }
    return results;
  }

  /**
   * Get all material names
   */
  getAllMaterialNames(): string[] {
    return Array.from(this.materials.keys());
  }

  /**
   * Get materials organized by category
   */
  getMaterialCategories(): Map<string, PBRMaterialParams[]> {
    const categories = new Map<string, PBRMaterialParams[]>();

    categories.set('Wood', [
      this.materials.get('oak')!,
      this.materials.get('walnut')!,
      this.materials.get('pine')!,
      this.materials.get('mahogany')!,
      this.materials.get('birch')!,
      this.materials.get('teak')!,
    ]);

    categories.set('Stone', [
      this.materials.get('marble_carrara')!,
      this.materials.get('granite_black')!,
      this.materials.get('limestone')!,
      this.materials.get('concrete')!,
      this.materials.get('slate')!,
      this.materials.get('sandstone')!,
    ]);

    categories.set('Metal', [
      this.materials.get('chrome')!,
      this.materials.get('steel_brushed')!,
      this.materials.get('copper')!,
      this.materials.get('brass')!,
      this.materials.get('aluminum')!,
      this.materials.get('metal_black')!,
    ]);

    categories.set('Fabric', [
      this.materials.get('cotton')!,
      this.materials.get('velvet')!,
      this.materials.get('leather')!,
      this.materials.get('linen')!,
      this.materials.get('wool')!,
    ]);

    categories.set('Glass', [
      this.materials.get('glass_clear')!,
      this.materials.get('glass_frosted')!,
      this.materials.get('glass_tinted')!,
      this.materials.get('glass_smoked')!,
    ]);

    categories.set('Ceramic', [
      this.materials.get('ceramic_white')!,
      this.materials.get('terracotta')!,
      this.materials.get('tile_glazed')!,
      this.materials.get('porcelain')!,
    ]);

    return categories;
  }
}
