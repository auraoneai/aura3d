import { Asset } from '../Asset';
import { IAssetLoader, LoadOptions } from '../AssetLoader';
import { Logger } from '../../core/Logger';

const logger = Logger.create('MaterialLoader');

/**
 * Material alpha mode
 */
export enum MaterialAlphaMode {
  OPAQUE = 'opaque',
  MASK = 'mask',
  BLEND = 'blend'
}

/**
 * Texture reference in material
 */
export interface MaterialTexture {
  /** Texture URL or asset ID */
  uri: string;
  /** Texture coordinate set index */
  texCoord?: number;
  /** Scale factor */
  scale?: number;
  /** Strength factor */
  strength?: number;
}

/**
 * PBR metallic-roughness parameters
 */
export interface PBRMetallicRoughness {
  /** Base color factor [R, G, B, A] */
  baseColorFactor?: number[];
  /** Base color texture */
  baseColorTexture?: MaterialTexture;
  /** Metallic factor (0-1) */
  metallicFactor?: number;
  /** Roughness factor (0-1) */
  roughnessFactor?: number;
  /** Metallic-roughness texture */
  metallicRoughnessTexture?: MaterialTexture;
}

/**
 * Material definition
 */
export interface MaterialDefinition {
  /** Material name */
  name: string;
  /** PBR metallic-roughness */
  pbrMetallicRoughness?: PBRMetallicRoughness;
  /** Normal map texture */
  normalTexture?: MaterialTexture;
  /** Occlusion texture */
  occlusionTexture?: MaterialTexture;
  /** Emissive texture */
  emissiveTexture?: MaterialTexture;
  /** Emissive factor [R, G, B] */
  emissiveFactor?: number[];
  /** Alpha mode */
  alphaMode?: MaterialAlphaMode;
  /** Alpha cutoff (for MASK mode) */
  alphaCutoff?: number;
  /** Double-sided rendering */
  doubleSided?: boolean;
  /** Custom properties */
  extras?: Record<string, any>;
}

/**
 * Material metadata
 */
export interface MaterialMetadata {
  /** Material name */
  name: string;
  /** Whether material is transparent */
  isTransparent: boolean;
  /** Whether material uses textures */
  hasTextures: boolean;
  /** Referenced texture URIs */
  textureUris: string[];
}

/**
 * Material asset
 */
export class MaterialAsset extends Asset {
  private definition: MaterialDefinition | null = null;
  private materialMetadata: MaterialMetadata | null = null;

  /**
   * Gets the material definition
   */
  get data(): MaterialDefinition | null {
    return this.definition;
  }

  /**
   * Gets the material metadata
   */
  override get metadata(): MaterialMetadata | null {
    return this.materialMetadata;
  }

  /**
   * Sets the material data
   */
  setData(definition: MaterialDefinition, metadata: MaterialMetadata): void {
    this.definition = definition;
    this.materialMetadata = metadata;
  }

  /**
   * Gets the estimated memory size in bytes
   */
  getMemorySize(): number {
    return JSON.stringify(this.definition).length * 2;
  }

  /**
   * Disposes the material and frees resources
   */
  override dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.definition = null;
    this.materialMetadata = null;

    super.dispose();
  }
}

/**
 * Material loader supporting JSON material definitions
 */
export class MaterialLoader implements IAssetLoader<MaterialAsset> {
  private static readonly SUPPORTED_EXTENSIONS = ['mat', 'material', 'json'];

  /**
   * Loads a material from a URL
   */
  async load(url: string, options?: LoadOptions): Promise<MaterialAsset> {
    logger.debug(`Loading material: ${url}`);

    try {
      const response = await fetch(url, { signal: options?.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      const asset = new MaterialAsset({ name: url });

      const definition = this.parseMaterialDefinition(json);
      const metadata = this.extractMetadata(definition);

      asset.setData(definition, metadata);

      logger.info(`Material loaded successfully: ${url}`);
      return asset;
    } catch (error) {
      logger.error(`Failed to load material: ${url}`, error);
      throw error;
    }
  }

  /**
   * Checks if this loader can handle the given URL
   */
  canLoad(url: string): boolean {
    const ext = this.getExtension(url);
    return ext !== null && MaterialLoader.SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * Gets supported file extensions
   */
  getSupportedExtensions(): string[] {
    return [...MaterialLoader.SUPPORTED_EXTENSIONS];
  }

  /**
   * Parses material definition from JSON
   */
  private parseMaterialDefinition(json: any): MaterialDefinition {
    const definition: MaterialDefinition = {
      name: json.name || 'Untitled',
      alphaMode: this.parseAlphaMode(json.alphaMode),
      alphaCutoff: json.alphaCutoff !== undefined ? json.alphaCutoff : 0.5,
      doubleSided: json.doubleSided || false
    };

    if (json.pbrMetallicRoughness) {
      const pbr = json.pbrMetallicRoughness;
      definition.pbrMetallicRoughness = {
        baseColorFactor: pbr.baseColorFactor || [1, 1, 1, 1],
        metallicFactor: pbr.metallicFactor !== undefined ? pbr.metallicFactor : 1,
        roughnessFactor: pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : 1
      };

      if (pbr.baseColorTexture) {
        definition.pbrMetallicRoughness.baseColorTexture = this.parseTexture(pbr.baseColorTexture);
      }

      if (pbr.metallicRoughnessTexture) {
        definition.pbrMetallicRoughness.metallicRoughnessTexture = this.parseTexture(pbr.metallicRoughnessTexture);
      }
    }

    if (json.normalTexture) {
      definition.normalTexture = this.parseTexture(json.normalTexture);
    }

    if (json.occlusionTexture) {
      definition.occlusionTexture = this.parseTexture(json.occlusionTexture);
    }

    if (json.emissiveTexture) {
      definition.emissiveTexture = this.parseTexture(json.emissiveTexture);
    }

    if (json.emissiveFactor) {
      definition.emissiveFactor = json.emissiveFactor;
    }

    if (json.extras) {
      definition.extras = json.extras;
    }

    return definition;
  }

  /**
   * Parses texture reference
   */
  private parseTexture(textureData: any): MaterialTexture {
    const texture: MaterialTexture = {
      uri: textureData.uri || textureData.index?.toString() || ''
    };

    if (textureData.texCoord !== undefined) {
      texture.texCoord = textureData.texCoord;
    }

    if (textureData.scale !== undefined) {
      texture.scale = textureData.scale;
    }

    if (textureData.strength !== undefined) {
      texture.strength = textureData.strength;
    }

    return texture;
  }

  /**
   * Parses alpha mode from string
   */
  private parseAlphaMode(mode: string): MaterialAlphaMode {
    switch (mode?.toUpperCase()) {
      case 'MASK':
        return MaterialAlphaMode.MASK;
      case 'BLEND':
        return MaterialAlphaMode.BLEND;
      default:
        return MaterialAlphaMode.OPAQUE;
    }
  }

  /**
   * Extracts metadata from material definition
   */
  private extractMetadata(definition: MaterialDefinition): MaterialMetadata {
    const textureUris: string[] = [];

    const collectTexture = (texture?: MaterialTexture): void => {
      if (texture?.uri) {
        textureUris.push(texture.uri);
      }
    };

    if (definition.pbrMetallicRoughness) {
      collectTexture(definition.pbrMetallicRoughness.baseColorTexture);
      collectTexture(definition.pbrMetallicRoughness.metallicRoughnessTexture);
    }

    collectTexture(definition.normalTexture);
    collectTexture(definition.occlusionTexture);
    collectTexture(definition.emissiveTexture);

    return {
      name: definition.name,
      isTransparent: definition.alphaMode !== MaterialAlphaMode.OPAQUE,
      hasTextures: textureUris.length > 0,
      textureUris
    };
  }

  /**
   * Extracts file extension from URL
   */
  private getExtension(url: string): string | null {
    const match = url.match(/\.([^./?#]+)(?:[?#]|$)/i);
    return match ? match[1].toLowerCase() : null;
  }
}
