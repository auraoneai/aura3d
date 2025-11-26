import { Logger } from '../../core/Logger';
import { Material, MaterialDescriptor, AlphaMode } from './Material';
import { Color } from '../../math/Color';
import { TextureLoader } from '../texture/TextureLoader';

const logger = Logger.create('MaterialLibrary');

/**
 * Material loading descriptor for async material creation.
 */
export interface MaterialLoadDescriptor extends MaterialDescriptor {
  /** Texture URLs to load */
  textureUrls?: {
    albedoMap?: string;
    metallicMap?: string;
    roughnessMap?: string;
    metallicRoughnessMap?: string;
    aoMap?: string;
    normalMap?: string;
    heightMap?: string;
    emissionMap?: string;
    envMap?: string;
  };
}

/**
 * Material library for managing, caching, and loading materials.
 * Provides default materials and material cloning functionality.
 *
 * @example
 * ```typescript
 * const library = new MaterialLibrary();
 *
 * // Get default materials
 * const defaultMat = library.getDefaultMaterial();
 * const errorMat = library.getErrorMaterial();
 * const wireframeMat = library.getWireframeMaterial();
 *
 * // Register custom materials
 * const goldMaterial = new Material({ name: 'Gold' });
 * library.register('gold', goldMaterial);
 *
 * // Retrieve registered materials
 * const gold = library.get('gold');
 *
 * // Clone materials
 * const goldVariant = library.clone('gold', 'gold_rough');
 * goldVariant.setProperty('roughness', 0.8);
 *
 * // Load material from JSON
 * const loaded = await library.loadFromJSON({
 *   name: 'Brick',
 *   textureUrls: {
 *     albedoMap: 'brick_albedo.png',
 *     normalMap: 'brick_normal.png',
 *     roughnessMap: 'brick_roughness.png',
 *   },
 * });
 *
 * // Load from glTF material data
 * const gltfMat = await library.loadFromGLTF(gltfMaterialData);
 * ```
 */
export class MaterialLibrary {
  /** Material cache by name */
  private materials = new Map<string, Material>();

  /** Default material instance */
  private defaultMaterial: Material;

  /** Error material (magenta) */
  private errorMaterial: Material;

  /** Wireframe debug material */
  private wireframeMaterial: Material;

  /** Unlit material */
  private unlitMaterial: Material;

  /** Texture loader for async loading */
  private textureLoader: TextureLoader;

  /**
   * Creates a new MaterialLibrary instance.
   *
   * @example
   * ```typescript
   * const library = new MaterialLibrary();
   * ```
   */
  constructor() {
    this.textureLoader = new TextureLoader();

    // Create default materials
    this.defaultMaterial = Material.createDefault();
    this.errorMaterial = this.createErrorMaterial();
    this.wireframeMaterial = Material.createWireframe();
    this.unlitMaterial = Material.createUnlit();

    // Register defaults
    this.register('default', this.defaultMaterial);
    this.register('error', this.errorMaterial);
    this.register('wireframe', this.wireframeMaterial);
    this.register('unlit', this.unlitMaterial);

    logger.debug('Material library initialized with default materials');
  }

  /**
   * Registers a material in the library.
   *
   * @param name - Material name
   * @param material - Material instance
   *
   * @example
   * ```typescript
   * const material = new Material({ name: 'CustomMaterial' });
   * library.register('custom', material);
   * ```
   */
  register(name: string, material: Material): void {
    if (this.materials.has(name)) {
      logger.warn(`Overwriting existing material: ${name}`);
    }

    this.materials.set(name, material);
    logger.debug(`Registered material: ${name}`);
  }

  /**
   * Gets a material by name.
   *
   * @param name - Material name
   * @returns Material or undefined if not found
   *
   * @example
   * ```typescript
   * const material = library.get('gold');
   * if (material) {
   *   mesh.setMaterial(material);
   * }
   * ```
   */
  get(name: string): Material | undefined {
    return this.materials.get(name);
  }

  /**
   * Gets a material by name, returning default if not found.
   *
   * @param name - Material name
   * @returns Material or default material
   *
   * @example
   * ```typescript
   * const material = library.getOrDefault('unknownMaterial');
   * // Returns default material if 'unknownMaterial' doesn't exist
   * ```
   */
  getOrDefault(name: string): Material {
    return this.materials.get(name) || this.defaultMaterial;
  }

  /**
   * Checks if a material exists in the library.
   *
   * @param name - Material name
   * @returns True if material exists
   */
  has(name: string): boolean {
    return this.materials.has(name);
  }

  /**
   * Removes a material from the library.
   *
   * @param name - Material name
   * @returns True if material was removed
   *
   * @example
   * ```typescript
   * library.remove('oldMaterial');
   * ```
   */
  remove(name: string): boolean {
    const removed = this.materials.delete(name);
    if (removed) {
      logger.debug(`Removed material: ${name}`);
    }
    return removed;
  }

  /**
   * Clones a material and registers it with a new name.
   *
   * @param sourceName - Source material name
   * @param newName - New material name
   * @returns Cloned material or undefined if source not found
   *
   * @example
   * ```typescript
   * const variant = library.clone('baseMaterial', 'variant1');
   * if (variant) {
   *   variant.setProperty('metallic', 1.0);
   * }
   * ```
   */
  clone(sourceName: string, newName: string): Material | undefined {
    const source = this.materials.get(sourceName);
    if (!source) {
      logger.error(`Cannot clone material: ${sourceName} not found`);
      return undefined;
    }

    const cloned = source.clone();
    cloned.name = newName;
    this.register(newName, cloned);

    logger.debug(`Cloned material: ${sourceName} -> ${newName}`);
    return cloned;
  }

  /**
   * Gets the default PBR material.
   *
   * @returns Default material
   */
  getDefaultMaterial(): Material {
    return this.defaultMaterial;
  }

  /**
   * Gets the error material (magenta for missing materials).
   *
   * @returns Error material
   */
  getErrorMaterial(): Material {
    return this.errorMaterial;
  }

  /**
   * Gets the wireframe debug material.
   *
   * @returns Wireframe material
   */
  getWireframeMaterial(): Material {
    return this.wireframeMaterial;
  }

  /**
   * Gets the unlit material.
   *
   * @returns Unlit material
   */
  getUnlitMaterial(): Material {
    return this.unlitMaterial;
  }

  /**
   * Gets all registered material names.
   *
   * @returns Array of material names
   *
   * @example
   * ```typescript
   * const names = library.getAllNames();
   * console.log(`Materials: ${names.join(', ')}`);
   * ```
   */
  getAllNames(): string[] {
    return Array.from(this.materials.keys());
  }

  /**
   * Gets all registered materials.
   *
   * @returns Array of materials
   */
  getAllMaterials(): Material[] {
    return Array.from(this.materials.values());
  }

  /**
   * Gets the number of registered materials.
   *
   * @returns Material count
   */
  getCount(): number {
    return this.materials.size;
  }

  /**
   * Clears all non-default materials from the library.
   *
   * @example
   * ```typescript
   * library.clear(); // Keeps default, error, wireframe, unlit
   * ```
   */
  clear(): void {
    const defaultNames = ['default', 'error', 'wireframe', 'unlit'];
    const toRemove: string[] = [];

    for (const name of this.materials.keys()) {
      if (!defaultNames.includes(name)) {
        toRemove.push(name);
      }
    }

    for (const name of toRemove) {
      this.materials.delete(name);
    }

    logger.debug(`Cleared ${toRemove.length} materials from library`);
  }

  /**
   * Loads a material from a JSON descriptor with async texture loading.
   *
   * @param descriptor - Material load descriptor
   * @returns Promise resolving to loaded material
   *
   * @example
   * ```typescript
   * const material = await library.loadFromJSON({
   *   name: 'Wood',
   *   properties: {
   *     metallic: 0.0,
   *     roughness: 0.8,
   *   },
   *   textureUrls: {
   *     albedoMap: 'wood_albedo.png',
   *     normalMap: 'wood_normal.png',
   *   },
   * });
   * ```
   */
  async loadFromJSON(descriptor: MaterialLoadDescriptor): Promise<Material> {
    const material = new Material(descriptor);

    // Load textures if URLs provided
    if (descriptor.textureUrls) {
      const urls = descriptor.textureUrls;

      // Load textures in parallel
      const texturePromises: Promise<void>[] = [];

      if (urls.albedoMap) {
        texturePromises.push(
          this.textureLoader.load(urls.albedoMap).then(result => {
            material.setTexture('albedoMap', result.texture);
          })
        );
      }

      if (urls.metallicMap) {
        texturePromises.push(
          this.textureLoader.load(urls.metallicMap).then(result => {
            material.setTexture('metallicMap', result.texture);
          })
        );
      }

      if (urls.roughnessMap) {
        texturePromises.push(
          this.textureLoader.load(urls.roughnessMap).then(result => {
            material.setTexture('roughnessMap', result.texture);
          })
        );
      }

      if (urls.metallicRoughnessMap) {
        texturePromises.push(
          this.textureLoader.load(urls.metallicRoughnessMap).then(result => {
            material.setTexture('metallicRoughnessMap', result.texture);
          })
        );
      }

      if (urls.aoMap) {
        texturePromises.push(
          this.textureLoader.load(urls.aoMap).then(result => {
            material.setTexture('aoMap', result.texture);
          })
        );
      }

      if (urls.normalMap) {
        texturePromises.push(
          this.textureLoader.load(urls.normalMap).then(result => {
            material.setTexture('normalMap', result.texture);
          })
        );
      }

      if (urls.heightMap) {
        texturePromises.push(
          this.textureLoader.load(urls.heightMap).then(result => {
            material.setTexture('heightMap', result.texture);
          })
        );
      }

      if (urls.emissionMap) {
        texturePromises.push(
          this.textureLoader.load(urls.emissionMap).then(result => {
            material.setTexture('emissionMap', result.texture);
          })
        );
      }

      if (urls.envMap) {
        texturePromises.push(
          this.textureLoader.load(urls.envMap).then(result => {
            material.setTexture('envMap', result.texture);
          })
        );
      }

      await Promise.all(texturePromises);
    }

    logger.info(`Loaded material: ${material.name}`);
    return material;
  }

  /**
   * Loads a material from glTF material data.
   *
   * @param gltfMaterial - glTF material object
   * @param baseUrl - Base URL for resolving texture paths
   * @returns Promise resolving to loaded material
   *
   * @example
   * ```typescript
   * const material = await library.loadFromGLTF(
   *   gltfData.materials[0],
   *   'assets/models/'
   * );
   * ```
   */
  async loadFromGLTF(gltfMaterial: any, baseUrl: string = ''): Promise<Material> {
    const pbr = gltfMaterial.pbrMetallicRoughness || {};

    const descriptor: MaterialLoadDescriptor = {
      name: gltfMaterial.name || 'GLTFMaterial',
      properties: {
        albedo: pbr.baseColorFactor
          ? new Color(
              pbr.baseColorFactor[0],
              pbr.baseColorFactor[1],
              pbr.baseColorFactor[2],
              pbr.baseColorFactor[3]
            )
          : new Color(1, 1, 1, 1),
        metallic: pbr.metallicFactor !== undefined ? pbr.metallicFactor : 1.0,
        roughness: pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : 1.0,
        emission: gltfMaterial.emissiveFactor
          ? new Color(
              gltfMaterial.emissiveFactor[0],
              gltfMaterial.emissiveFactor[1],
              gltfMaterial.emissiveFactor[2],
              1.0
            )
          : new Color(0, 0, 0, 1),
        normalScale: gltfMaterial.normalTexture?.scale || 1.0,
      },
      state: {
        alphaMode: this.parseGLTFAlphaMode(gltfMaterial.alphaMode),
        alphaCutoff: gltfMaterial.alphaCutoff || 0.5,
        doubleSided: gltfMaterial.doubleSided || false,
      },
      textureUrls: {},
    };

    // Parse texture references
    if (pbr.baseColorTexture) {
      descriptor.textureUrls!.albedoMap = this.resolveTextureUrl(
        baseUrl,
        pbr.baseColorTexture.index
      );
    }

    if (pbr.metallicRoughnessTexture) {
      descriptor.textureUrls!.metallicRoughnessMap = this.resolveTextureUrl(
        baseUrl,
        pbr.metallicRoughnessTexture.index
      );
    }

    if (gltfMaterial.normalTexture) {
      descriptor.textureUrls!.normalMap = this.resolveTextureUrl(
        baseUrl,
        gltfMaterial.normalTexture.index
      );
    }

    if (gltfMaterial.occlusionTexture) {
      descriptor.textureUrls!.aoMap = this.resolveTextureUrl(
        baseUrl,
        gltfMaterial.occlusionTexture.index
      );
    }

    if (gltfMaterial.emissiveTexture) {
      descriptor.textureUrls!.emissionMap = this.resolveTextureUrl(
        baseUrl,
        gltfMaterial.emissiveTexture.index
      );
    }

    return this.loadFromJSON(descriptor);
  }

  /**
   * Creates the error material (magenta/black checkerboard).
   *
   * @returns Error material
   */
  private createErrorMaterial(): Material {
    return Material.createUnlit(new Color(1, 0, 1, 1));
  }

  /**
   * Parses glTF alpha mode string.
   *
   * @param mode - glTF alpha mode
   * @returns Engine alpha mode
   */
  private parseGLTFAlphaMode(mode?: string): AlphaMode {
    switch (mode) {
      case 'OPAQUE': return AlphaMode.Opaque;
      case 'MASK': return AlphaMode.Mask;
      case 'BLEND': return AlphaMode.Blend;
      default: return AlphaMode.Opaque;
    }
  }

  /**
   * Resolves texture URL from glTF texture index.
   *
   * @param baseUrl - Base URL
   * @param textureIndex - Texture index
   * @returns Resolved URL
   */
  private resolveTextureUrl(baseUrl: string, textureIndex: number): string {
    // Simplified - real implementation would look up texture in glTF
    return `${baseUrl}texture_${textureIndex}.png`;
  }
}
