import { Logger } from '../../core/Logger';
import { IdGenerator } from '../../core/IdGenerator';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';
import { Vector3 } from '../../math/Vector3';
import { Vector4 } from '../../math/Vector4';
import { Texture } from '../texture/Texture';

const logger = Logger.create('Material');

/**
 * Alpha blending modes for transparency.
 */
export enum AlphaMode {
  /** Fully opaque, no transparency */
  Opaque = 'Opaque',
  /** Binary transparency with threshold */
  Mask = 'Mask',
  /** Full alpha blending */
  Blend = 'Blend',
}

/**
 * Material culling modes.
 */
export enum CullMode {
  /** No culling (draw both sides) */
  None = 'None',
  /** Cull back faces */
  Back = 'Back',
  /** Cull front faces */
  Front = 'Front',
}

/**
 * Material depth test modes.
 */
export enum DepthTest {
  /** Never pass */
  Never = 'Never',
  /** Pass if less */
  Less = 'Less',
  /** Pass if equal */
  Equal = 'Equal',
  /** Pass if less or equal */
  LessEqual = 'LessEqual',
  /** Pass if greater */
  Greater = 'Greater',
  /** Pass if not equal */
  NotEqual = 'NotEqual',
  /** Pass if greater or equal */
  GreaterEqual = 'GreaterEqual',
  /** Always pass */
  Always = 'Always',
}

/**
 * PBR material properties.
 */
export interface PBRProperties {
  /** Base color (albedo) */
  albedo: Color;
  /** Metallic factor [0-1] */
  metallic: number;
  /** Roughness factor [0-1] */
  roughness: number;
  /** Ambient occlusion factor [0-1] */
  ao: number;
  /** Emission color */
  emission: Color;
  /** Emission intensity */
  emissionIntensity: number;
  /** Normal map strength */
  normalScale: number;
  /** Height map scale */
  heightScale: number;
}

/**
 * Texture slots for material.
 */
export interface MaterialTextures {
  /** Albedo/base color texture */
  albedoMap: Texture | null;
  /** Metallic texture (R channel) */
  metallicMap: Texture | null;
  /** Roughness texture (G channel) */
  roughnessMap: Texture | null;
  /** Metallic-roughness combined texture */
  metallicRoughnessMap: Texture | null;
  /** Ambient occlusion texture */
  aoMap: Texture | null;
  /** Normal map (tangent space) */
  normalMap: Texture | null;
  /** Height/displacement map */
  heightMap: Texture | null;
  /** Emission map */
  emissionMap: Texture | null;
  /** Environment map for reflections */
  envMap: Texture | null;
}

/**
 * Material render state.
 */
export interface MaterialState {
  /** Alpha mode */
  alphaMode: AlphaMode;
  /** Alpha cutoff for mask mode */
  alphaCutoff: number;
  /** Culling mode */
  cullMode: CullMode;
  /** Depth testing mode */
  depthTest: DepthTest;
  /** Enable depth writing */
  depthWrite: boolean;
  /** Double-sided rendering */
  doubleSided: boolean;
  /** Wireframe rendering */
  wireframe: boolean;
}

/**
 * Material descriptor for creation.
 */
export interface MaterialDescriptor {
  /** Material name */
  name?: string;
  /** PBR properties */
  properties?: Partial<PBRProperties>;
  /** Texture slots */
  textures?: Partial<MaterialTextures>;
  /** Render state */
  state?: Partial<MaterialState>;
  /** Custom shader variant */
  shaderVariant?: string;
}

/**
 * Shader feature flags for variant selection.
 */
export interface ShaderFeatures {
  /** Use albedo map */
  USE_ALBEDO_MAP: boolean;
  /** Use metallic-roughness map */
  USE_METALLIC_ROUGHNESS_MAP: boolean;
  /** Use separate metallic map */
  USE_METALLIC_MAP: boolean;
  /** Use separate roughness map */
  USE_ROUGHNESS_MAP: boolean;
  /** Use normal map */
  USE_NORMAL_MAP: boolean;
  /** Use AO map */
  USE_AO_MAP: boolean;
  /** Use height map */
  USE_HEIGHT_MAP: boolean;
  /** Use emission map */
  USE_EMISSION_MAP: boolean;
  /** Use environment map */
  USE_ENV_MAP: boolean;
  /** Enable alpha blending */
  ALPHA_BLEND: boolean;
  /** Enable alpha masking */
  ALPHA_MASK: boolean;
}

/**
 * Physically-based material with comprehensive PBR workflow support.
 * Manages material properties, textures, and shader variant selection.
 *
 * @example
 * ```typescript
 * // Create a basic PBR material
 * const material = new Material({
 *   name: 'Gold',
 *   properties: {
 *     albedo: new Color(1.0, 0.782, 0.344),
 *     metallic: 1.0,
 *     roughness: 0.3,
 *   },
 * });
 *
 * // Load and assign textures
 * const loader = new TextureLoader();
 * material.setTexture('albedoMap', await loader.load('gold_albedo.png'));
 * material.setTexture('normalMap', await loader.load('gold_normal.png'));
 * material.setTexture('metallicRoughnessMap', await loader.load('gold_mr.png'));
 *
 * // Configure rendering
 * material.setAlphaMode(AlphaMode.Opaque);
 * material.setDoubleSided(false);
 * material.setCullMode(CullMode.Back);
 *
 * // Use with mesh
 * mesh.setMaterial(material);
 *
 * // Clone for variations
 * const goldVariant = material.clone();
 * goldVariant.setProperty('roughness', 0.5);
 *
 * // Enable emission
 * material.setProperty('emission', new Color(1, 0.5, 0));
 * material.setProperty('emissionIntensity', 2.0);
 * material.setTexture('emissionMap', emissionTexture);
 * ```
 */
export class Material {
  /** Unique material identifier */
  readonly id: string;

  /** Material name */
  name: string;

  /** PBR properties */
  private properties: PBRProperties;

  /** Texture slots */
  private textures: MaterialTextures;

  /** Render state */
  private state: MaterialState;

  /** Custom shader variant name */
  private shaderVariant: string | null = null;

  /** Cached shader features for variant selection */
  private cachedFeatures: ShaderFeatures | null = null;

  /** Whether shader features need recomputation */
  private featuresDirty = true;

  /** Uniform buffer data (packed for GPU upload) */
  private uniformBuffer: Float32Array;

  /** Whether uniform buffer needs update */
  private uniformsDirty = true;

  /**
   * Creates a new Material instance.
   *
   * @param descriptor - Material descriptor
   *
   * @example
   * ```typescript
   * const material = new Material({
   *   name: 'MyMaterial',
   *   properties: {
   *     albedo: Color.fromHex(0x808080),
   *     metallic: 0.0,
   *     roughness: 0.5,
   *   },
   *   state: {
   *     alphaMode: AlphaMode.Opaque,
   *     doubleSided: false,
   *   },
   * });
   * ```
   */
  constructor(descriptor: MaterialDescriptor = {}) {
    this.id = IdGenerator.nextAssetId();
    this.name = descriptor.name || `Material_${this.id}`;

    // Initialize PBR properties with defaults
    this.properties = {
      albedo: new Color(0.8, 0.8, 0.8, 1.0),
      metallic: 0.0,
      roughness: 0.5,
      ao: 1.0,
      emission: new Color(0, 0, 0, 1.0),
      emissionIntensity: 0.0,
      normalScale: 1.0,
      heightScale: 0.02,
      ...descriptor.properties,
    };

    // Initialize texture slots
    this.textures = {
      albedoMap: null,
      metallicMap: null,
      roughnessMap: null,
      metallicRoughnessMap: null,
      aoMap: null,
      normalMap: null,
      heightMap: null,
      emissionMap: null,
      envMap: null,
      ...descriptor.textures,
    };

    // Initialize render state
    this.state = {
      alphaMode: AlphaMode.Opaque,
      alphaCutoff: 0.5,
      cullMode: CullMode.Back,
      depthTest: DepthTest.Less,
      depthWrite: true,
      doubleSided: false,
      wireframe: false,
      ...descriptor.state,
    };

    this.shaderVariant = descriptor.shaderVariant || null;

    // Allocate uniform buffer (16 floats for properties)
    this.uniformBuffer = new Float32Array(16);
    this.packUniforms();

    logger.debug(`Created material: ${this.name}`, { id: this.id });
  }

  /**
   * Sets a material property.
   *
   * @param key - Property key
   * @param value - Property value
   *
   * @example
   * ```typescript
   * material.setProperty('metallic', 1.0);
   * material.setProperty('albedo', new Color(1, 0, 0));
   * material.setProperty('roughness', 0.3);
   * ```
   */
  setProperty<K extends keyof PBRProperties>(key: K, value: PBRProperties[K]): void {
    this.properties[key] = value;
    this.uniformsDirty = true;
    logger.trace(`Updated ${this.name}.${key}`, { value });
  }

  /**
   * Gets a material property.
   *
   * @param key - Property key
   * @returns Property value
   *
   * @example
   * ```typescript
   * const metallic = material.getProperty('metallic');
   * const albedo = material.getProperty('albedo');
   * ```
   */
  getProperty<K extends keyof PBRProperties>(key: K): PBRProperties[K] {
    return this.properties[key];
  }

  /**
   * Gets all material properties.
   *
   * @returns PBR properties object
   */
  getProperties(): Readonly<PBRProperties> {
    return this.properties;
  }

  /**
   * Sets a texture slot.
   *
   * @param slot - Texture slot name
   * @param texture - Texture or null to clear
   *
   * @example
   * ```typescript
   * material.setTexture('albedoMap', albedoTexture);
   * material.setTexture('normalMap', normalTexture);
   * material.setTexture('metallicRoughnessMap', mrTexture);
   * ```
   */
  setTexture<K extends keyof MaterialTextures>(slot: K, texture: Texture | null): void {
    this.textures[slot] = texture;
    this.featuresDirty = true;
    logger.trace(`Updated ${this.name}.${slot}`, { texture: texture?.label });
  }

  /**
   * Gets a texture from a slot.
   *
   * @param slot - Texture slot name
   * @returns Texture or null
   *
   * @example
   * ```typescript
   * const albedo = material.getTexture('albedoMap');
   * if (albedo) {
   *   console.log(`Albedo: ${albedo.width}x${albedo.height}`);
   * }
   * ```
   */
  getTexture<K extends keyof MaterialTextures>(slot: K): Texture | null {
    return this.textures[slot];
  }

  /**
   * Gets all textures.
   *
   * @returns Texture slots object
   */
  getTextures(): Readonly<MaterialTextures> {
    return this.textures;
  }

  /**
   * Sets the alpha mode.
   *
   * @param mode - Alpha mode
   *
   * @example
   * ```typescript
   * material.setAlphaMode(AlphaMode.Blend);
   * material.setAlphaMode(AlphaMode.Mask);
   * material.setAlphaMode(AlphaMode.Opaque);
   * ```
   */
  setAlphaMode(mode: AlphaMode): void {
    this.state.alphaMode = mode;
    this.featuresDirty = true;
    logger.trace(`Set ${this.name} alpha mode: ${mode}`);
  }

  /**
   * Gets the alpha mode.
   *
   * @returns Current alpha mode
   */
  getAlphaMode(): AlphaMode {
    return this.state.alphaMode;
  }

  /**
   * Sets the alpha cutoff threshold for mask mode.
   *
   * @param cutoff - Cutoff value [0-1]
   *
   * @example
   * ```typescript
   * material.setAlphaMode(AlphaMode.Mask);
   * material.setAlphaCutoff(0.5);
   * ```
   */
  setAlphaCutoff(cutoff: number): void {
    this.state.alphaCutoff = Math.max(0, Math.min(1, cutoff));
    this.uniformsDirty = true;
  }

  /**
   * Gets the alpha cutoff threshold.
   *
   * @returns Cutoff value
   */
  getAlphaCutoff(): number {
    return this.state.alphaCutoff;
  }

  /**
   * Sets the culling mode.
   *
   * @param mode - Cull mode
   *
   * @example
   * ```typescript
   * material.setCullMode(CullMode.Back);
   * material.setCullMode(CullMode.None); // Double-sided
   * ```
   */
  setCullMode(mode: CullMode): void {
    this.state.cullMode = mode;
  }

  /**
   * Gets the culling mode.
   *
   * @returns Current cull mode
   */
  getCullMode(): CullMode {
    return this.state.cullMode;
  }

  /**
   * Sets whether material is double-sided.
   *
   * @param doubleSided - Enable double-sided rendering
   *
   * @example
   * ```typescript
   * material.setDoubleSided(true); // Render both sides
   * ```
   */
  setDoubleSided(doubleSided: boolean): void {
    this.state.doubleSided = doubleSided;
    if (doubleSided) {
      this.state.cullMode = CullMode.None;
    }
  }

  /**
   * Gets whether material is double-sided.
   *
   * @returns True if double-sided
   */
  isDoubleSided(): boolean {
    return this.state.doubleSided;
  }

  /**
   * Sets the depth test mode.
   *
   * @param test - Depth test mode
   */
  setDepthTest(test: DepthTest): void {
    this.state.depthTest = test;
  }

  /**
   * Gets the depth test mode.
   *
   * @returns Current depth test
   */
  getDepthTest(): DepthTest {
    return this.state.depthTest;
  }

  /**
   * Sets whether depth writing is enabled.
   *
   * @param enabled - Enable depth writing
   */
  setDepthWrite(enabled: boolean): void {
    this.state.depthWrite = enabled;
  }

  /**
   * Gets whether depth writing is enabled.
   *
   * @returns True if depth writing enabled
   */
  isDepthWriteEnabled(): boolean {
    return this.state.depthWrite;
  }

  /**
   * Sets wireframe rendering mode.
   *
   * @param enabled - Enable wireframe
   */
  setWireframe(enabled: boolean): void {
    this.state.wireframe = enabled;
  }

  /**
   * Gets whether wireframe is enabled.
   *
   * @returns True if wireframe enabled
   */
  isWireframe(): boolean {
    return this.state.wireframe;
  }

  /**
   * Gets the render state.
   *
   * @returns Material state object
   */
  getState(): Readonly<MaterialState> {
    return this.state;
  }

  /**
   * Gets shader features for variant selection.
   * Features are computed based on assigned textures and material state.
   *
   * @returns Shader features
   *
   * @example
   * ```typescript
   * const features = material.getShaderFeatures();
   * const shader = shaderLibrary.getVariant('pbr', features);
   * ```
   */
  getShaderFeatures(): ShaderFeatures {
    if (!this.featuresDirty && this.cachedFeatures) {
      return this.cachedFeatures;
    }

    this.cachedFeatures = {
      USE_ALBEDO_MAP: this.textures.albedoMap !== null,
      USE_METALLIC_ROUGHNESS_MAP: this.textures.metallicRoughnessMap !== null,
      USE_METALLIC_MAP: this.textures.metallicMap !== null,
      USE_ROUGHNESS_MAP: this.textures.roughnessMap !== null,
      USE_NORMAL_MAP: this.textures.normalMap !== null,
      USE_AO_MAP: this.textures.aoMap !== null,
      USE_HEIGHT_MAP: this.textures.heightMap !== null,
      USE_EMISSION_MAP: this.textures.emissionMap !== null,
      USE_ENV_MAP: this.textures.envMap !== null,
      ALPHA_BLEND: this.state.alphaMode === AlphaMode.Blend,
      ALPHA_MASK: this.state.alphaMode === AlphaMode.Mask,
    };

    this.featuresDirty = false;
    return this.cachedFeatures;
  }

  /**
   * Gets the shader variant name.
   *
   * @returns Shader variant or null for default
   */
  getShaderVariant(): string | null {
    return this.shaderVariant;
  }

  /**
   * Sets a custom shader variant.
   *
   * @param variant - Variant name or null for default
   */
  setShaderVariant(variant: string | null): void {
    this.shaderVariant = variant;
  }

  /**
   * Gets the packed uniform buffer.
   * Buffer layout: [albedo.rgba, metallic, roughness, ao, normalScale,
   *                 emission.rgb, emissionIntensity, heightScale, alphaCutoff, ...]
   *
   * @returns Uniform buffer array
   */
  getUniformBuffer(): Float32Array {
    if (this.uniformsDirty) {
      this.packUniforms();
    }
    return this.uniformBuffer;
  }

  /**
   * Packs material properties into uniform buffer.
   */
  private packUniforms(): void {
    let offset = 0;

    // Pack albedo (4 floats)
    this.uniformBuffer[offset++] = this.properties.albedo.r;
    this.uniformBuffer[offset++] = this.properties.albedo.g;
    this.uniformBuffer[offset++] = this.properties.albedo.b;
    this.uniformBuffer[offset++] = this.properties.albedo.a;

    // Pack metallic, roughness, ao, normalScale
    this.uniformBuffer[offset++] = this.properties.metallic;
    this.uniformBuffer[offset++] = this.properties.roughness;
    this.uniformBuffer[offset++] = this.properties.ao;
    this.uniformBuffer[offset++] = this.properties.normalScale;

    // Pack emission (3 floats) + intensity
    this.uniformBuffer[offset++] = this.properties.emission.r;
    this.uniformBuffer[offset++] = this.properties.emission.g;
    this.uniformBuffer[offset++] = this.properties.emission.b;
    this.uniformBuffer[offset++] = this.properties.emissionIntensity;

    // Pack heightScale and alphaCutoff
    this.uniformBuffer[offset++] = this.properties.heightScale;
    this.uniformBuffer[offset++] = this.state.alphaCutoff;

    // Padding to 16 floats
    while (offset < 16) {
      this.uniformBuffer[offset++] = 0;
    }

    this.uniformsDirty = false;
  }

  /**
   * Clones this material.
   * Creates a shallow copy with shared textures but independent properties.
   *
   * @returns Cloned material
   *
   * @example
   * ```typescript
   * const baseMaterial = new Material({ name: 'Base' });
   * const variant1 = baseMaterial.clone();
   * variant1.name = 'Variant1';
   * variant1.setProperty('roughness', 0.2);
   * ```
   */
  clone(): Material {
    const cloned = new Material({
      name: `${this.name}_Clone`,
      properties: {
        albedo: this.properties.albedo.clone(),
        metallic: this.properties.metallic,
        roughness: this.properties.roughness,
        ao: this.properties.ao,
        emission: this.properties.emission.clone(),
        emissionIntensity: this.properties.emissionIntensity,
        normalScale: this.properties.normalScale,
        heightScale: this.properties.heightScale,
      },
      textures: { ...this.textures },
      state: { ...this.state },
      shaderVariant: this.shaderVariant ?? undefined,
    });

    return cloned;
  }

  /**
   * Converts material to JSON representation.
   *
   * @returns JSON object
   *
   * @example
   * ```typescript
   * const json = material.toJSON();
   * localStorage.setItem('material', JSON.stringify(json));
   * ```
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id,
      name: this.name,
      properties: {
        albedo: this.properties.albedo.toJSON(),
        metallic: this.properties.metallic,
        roughness: this.properties.roughness,
        ao: this.properties.ao,
        emission: this.properties.emission.toJSON(),
        emissionIntensity: this.properties.emissionIntensity,
        normalScale: this.properties.normalScale,
        heightScale: this.properties.heightScale,
      },
      textures: {
        albedoMap: this.textures.albedoMap?.id || null,
        metallicMap: this.textures.metallicMap?.id || null,
        roughnessMap: this.textures.roughnessMap?.id || null,
        metallicRoughnessMap: this.textures.metallicRoughnessMap?.id || null,
        aoMap: this.textures.aoMap?.id || null,
        normalMap: this.textures.normalMap?.id || null,
        heightMap: this.textures.heightMap?.id || null,
        emissionMap: this.textures.emissionMap?.id || null,
        envMap: this.textures.envMap?.id || null,
      },
      state: this.state,
      shaderVariant: this.shaderVariant ?? undefined,
    };
  }

  /**
   * Creates a default PBR material.
   *
   * @returns Default material
   */
  static createDefault(): Material {
    return new Material({
      name: 'DefaultPBR',
      properties: {
        albedo: new Color(0.8, 0.8, 0.8, 1.0),
        metallic: 0.0,
        roughness: 0.5,
        ao: 1.0,
        emission: new Color(0, 0, 0, 1.0),
        emissionIntensity: 0.0,
        normalScale: 1.0,
        heightScale: 0.02,
      },
    });
  }

  /**
   * Creates an unlit material (emission only).
   *
   * @param color - Emission color
   * @returns Unlit material
   */
  static createUnlit(color: Color = Color.white()): Material {
    return new Material({
      name: 'Unlit',
      properties: {
        albedo: new Color(0, 0, 0, 1.0),
        metallic: 0.0,
        roughness: 1.0,
        ao: 1.0,
        emission: color,
        emissionIntensity: 1.0,
        normalScale: 1.0,
        heightScale: 0.0,
      },
      shaderVariant: 'unlit',
    });
  }

  /**
   * Creates a wireframe debug material.
   *
   * @param color - Wireframe color
   * @returns Wireframe material
   */
  static createWireframe(color: Color = Color.white()): Material {
    const material = Material.createUnlit(color);
    material.name = 'Wireframe';
    material.setWireframe(true);
    return material;
  }
}
