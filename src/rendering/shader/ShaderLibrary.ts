/**
 * @module ShaderLibrary
 * @description Shader caching, variant management, and async loading.
 */

import { Logger } from '../../core/Logger';
import { EventBus } from '../../core/EventBus';
import { IDisposable } from '../../types';
import { Shader, ShaderSource, ShaderOptions } from './Shader';
import { DefinesMap } from './ShaderPreprocessor';
import { ShaderLanguage } from './ShaderChunks';

const logger = Logger.create('ShaderLibrary');

/**
 * Default PBR vertex shader
 */
export const DEFAULT_PBR_VERTEX = `#version 300 es
precision highp float;

// Attributes
in vec3 a_position;
in vec3 a_normal;
in vec2 a_texcoord;
in vec4 a_tangent;

// Uniforms
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

// Varyings
out vec3 v_worldPosition;
out vec3 v_normal;
out vec2 v_texcoord;
out mat3 v_TBN;

void main() {
  // Transform position to world space
  vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
  v_worldPosition = worldPos.xyz;

  // Transform normal to world space
  v_normal = normalize(u_normalMatrix * a_normal);

  // Pass through texture coordinates
  v_texcoord = a_texcoord;

  // Calculate TBN matrix for normal mapping
  vec3 T = normalize(u_normalMatrix * a_tangent.xyz);
  vec3 N = v_normal;
  vec3 B = cross(N, T) * a_tangent.w;
  v_TBN = mat3(T, B, N);

  // Transform to clip space
  gl_Position = u_projectionMatrix * u_viewMatrix * worldPos;
}
`;

/**
 * Default PBR fragment shader with Cook-Torrance BRDF
 */
export const DEFAULT_PBR_FRAGMENT = `#version 300 es
precision highp float;

// Mathematical constants
const float PI = 3.14159265359;
const float EPSILON = 1e-6;

// Varyings
in vec3 v_worldPosition;
in vec3 v_normal;
in vec2 v_texcoord;
in mat3 v_TBN;

// Camera
uniform vec3 u_cameraPosition;

// Material textures
uniform sampler2D u_albedoMap;
uniform sampler2D u_normalMap;
uniform sampler2D u_metallicRoughnessMap;
uniform sampler2D u_aoMap;
uniform sampler2D u_emissiveMap;

// Material properties
uniform vec4 u_albedo;
uniform float u_metallic;
uniform float u_roughness;
uniform float u_aoStrength;
uniform vec3 u_emissive;

// Lighting
#ifndef MAX_LIGHTS
#define MAX_LIGHTS 4
#endif

uniform int u_numLights;
uniform vec3 u_lightPositions[MAX_LIGHTS];
uniform vec3 u_lightColors[MAX_LIGHTS];
uniform float u_lightIntensities[MAX_LIGHTS];

// IBL
uniform samplerCube u_irradianceMap;
uniform samplerCube u_prefilterMap;
uniform sampler2D u_brdfLUT;
uniform float u_iblIntensity;

// Shadows
#ifdef USE_SHADOWS
uniform sampler2DShadow u_shadowMap;
uniform mat4 u_lightSpaceMatrix;
uniform vec2 u_shadowMapSize;
#endif

// Tonemapping
uniform float u_exposure;

// Feature flags
#ifndef USE_NORMAL_MAP
#define USE_NORMAL_MAP 1
#endif

#ifndef USE_METALLIC_ROUGHNESS_MAP
#define USE_METALLIC_ROUGHNESS_MAP 1
#endif

#ifndef USE_AO_MAP
#define USE_AO_MAP 1
#endif

#ifndef USE_EMISSIVE_MAP
#define USE_EMISSIVE_MAP 1
#endif

#ifndef USE_IBL
#define USE_IBL 1
#endif

#ifndef USE_TONEMAPPING
#define USE_TONEMAPPING 1
#endif

// Output
out vec4 fragColor;

// Utility functions
float saturate(float x) {
  return clamp(x, 0.0, 1.0);
}

vec3 saturate(vec3 x) {
  return clamp(x, 0.0, 1.0);
}

// Fresnel-Schlick approximation
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(saturate(1.0 - cosTheta), 5.0);
}

// Fresnel-Schlick with roughness for IBL
vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
  return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(saturate(1.0 - cosTheta), 5.0);
}

// GGX/Trowbridge-Reitz normal distribution function
float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float NdotH2 = NdotH * NdotH;

  float num = a2;
  float denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;

  return num / max(denom, EPSILON);
}

// Schlick-GGX geometry function
float geometrySchlickGGX(float NdotV, float roughness) {
  float r = (roughness + 1.0);
  float k = (r * r) / 8.0;

  float num = NdotV;
  float denom = NdotV * (1.0 - k) + k;

  return num / max(denom, EPSILON);
}

// Smith's method for geometry obstruction
float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float ggx2 = geometrySchlickGGX(NdotV, roughness);
  float ggx1 = geometrySchlickGGX(NdotL, roughness);

  return ggx1 * ggx2;
}

#ifdef USE_SHADOWS
// PCF shadow sampling
float sampleShadowPCF(vec3 shadowCoord) {
  float shadow = 0.0;
  vec2 texelSize = 1.0 / u_shadowMapSize;

  for(int x = -1; x <= 1; x++) {
    for(int y = -1; y <= 1; y++) {
      vec2 offset = vec2(float(x), float(y)) * texelSize;
      shadow += texture(u_shadowMap, shadowCoord + vec3(offset, 0.0));
    }
  }

  return shadow / 9.0;
}
#endif

// ACES Filmic tonemapping
vec3 tonemapACES(vec3 color) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return saturate((color * (a * color + b)) / (color * (c * color + d) + e));
}

// sRGB conversion
vec3 linearToSRGB(vec3 linear) {
  vec3 sRGB_lo = linear * 12.92;
  vec3 sRGB_hi = pow(linear, vec3(1.0 / 2.4)) * 1.055 - 0.055;
  return mix(sRGB_hi, sRGB_lo, step(linear, vec3(0.0031308)));
}

void main() {
  // Sample albedo
  vec3 albedo = texture(u_albedoMap, v_texcoord).rgb * u_albedo.rgb;
  float alpha = texture(u_albedoMap, v_texcoord).a * u_albedo.a;

  // Sample and apply normal map
  vec3 N;
#if USE_NORMAL_MAP
  vec3 tangentNormal = texture(u_normalMap, v_texcoord).xyz * 2.0 - 1.0;
  N = normalize(v_TBN * tangentNormal);
#else
  N = normalize(v_normal);
#endif

  // Sample metallic-roughness
  float metallic;
  float roughness;
#if USE_METALLIC_ROUGHNESS_MAP
  vec2 metallicRoughness = texture(u_metallicRoughnessMap, v_texcoord).bg;
  metallic = metallicRoughness.x * u_metallic;
  roughness = metallicRoughness.y * u_roughness;
#else
  metallic = u_metallic;
  roughness = u_roughness;
#endif

  // Sample ambient occlusion
  float ao;
#if USE_AO_MAP
  ao = texture(u_aoMap, v_texcoord).r;
  ao = mix(1.0, ao, u_aoStrength);
#else
  ao = 1.0;
#endif

  // View direction
  vec3 V = normalize(u_cameraPosition - v_worldPosition);

  // Calculate F0 (surface reflection at zero incidence)
  vec3 F0 = vec3(0.04);
  F0 = mix(F0, albedo, metallic);

  // Direct lighting accumulator
  vec3 Lo = vec3(0.0);

  // Calculate direct lighting from all lights
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= u_numLights) break;

    // Light direction
    vec3 L = normalize(u_lightPositions[i] - v_worldPosition);
    vec3 H = normalize(V + L);

    // Light attenuation (inverse square law)
    float distance = length(u_lightPositions[i] - v_worldPosition);
    float attenuation = 1.0 / (distance * distance);
    vec3 radiance = u_lightColors[i] * u_lightIntensities[i] * attenuation;

    // Cook-Torrance BRDF
    float NDF = distributionGGX(N, H, roughness);
    float G = geometrySmith(N, V, L, roughness);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    // Specular component
    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0);
    vec3 specular = numerator / max(denominator, EPSILON);

    // Energy conservation
    vec3 kS = F;
    vec3 kD = vec3(1.0) - kS;
    kD *= 1.0 - metallic;

    // Add to outgoing radiance
    float NdotL = max(dot(N, L), 0.0);
    Lo += (kD * albedo / PI + specular) * radiance * NdotL;
  }

#ifdef USE_SHADOWS
  // Apply shadows
  vec4 shadowCoord = u_lightSpaceMatrix * vec4(v_worldPosition, 1.0);
  shadowCoord.xyz /= shadowCoord.w;
  shadowCoord.xyz = shadowCoord.xyz * 0.5 + 0.5;

  if (shadowCoord.z < 1.0) {
    float shadow = sampleShadowPCF(shadowCoord.xyz);
    Lo *= shadow;
  }
#endif

  // Ambient lighting (IBL)
  vec3 ambient;
#if USE_IBL
  vec3 F = fresnelSchlickRoughness(max(dot(N, V), 0.0), F0, roughness);

  // Diffuse IBL
  vec3 kS = F;
  vec3 kD = 1.0 - kS;
  kD *= 1.0 - metallic;

  vec3 irradiance = texture(u_irradianceMap, N).rgb;
  vec3 diffuse = irradiance * albedo;

  // Specular IBL
  const float MAX_REFLECTION_LOD = 4.0;
  vec3 R = reflect(-V, N);
  vec3 prefilteredColor = textureLod(u_prefilterMap, R, roughness * MAX_REFLECTION_LOD).rgb;
  vec2 brdf = texture(u_brdfLUT, vec2(max(dot(N, V), 0.0), roughness)).rg;
  vec3 specular = prefilteredColor * (F * brdf.x + brdf.y);

  ambient = (kD * diffuse + specular) * ao * u_iblIntensity;
#else
  // Simple ambient
  ambient = vec3(0.03) * albedo * ao;
#endif

  // Combine lighting
  vec3 color = ambient + Lo;

  // Add emissive
#if USE_EMISSIVE_MAP
  vec3 emissive = texture(u_emissiveMap, v_texcoord).rgb * u_emissive;
  color += emissive;
#else
  color += u_emissive;
#endif

  // Tone mapping
#if USE_TONEMAPPING
  color = tonemapACES(color * u_exposure);
  color = linearToSRGB(color);
#endif

  fragColor = vec4(color, alpha);
}
`;

/**
 * Shader variant key (defines hash)
 */
type VariantKey = string;

/**
 * Shader load options
 */
export interface ShaderLoadOptions {
  /** Base URL for shader files */
  baseUrl?: string;
  /** File extensions */
  extensions?: {
    vertex?: string;
    fragment?: string;
  };
  /** Preprocessor defines */
  defines?: DefinesMap;
  /** Target shader language */
  language?: ShaderLanguage;
}

/**
 * Built-in shader descriptor
 */
export interface BuiltinShaderDescriptor {
  /** Shader name */
  name: string;
  /** Shader source */
  source: ShaderSource;
  /** Default defines */
  defines?: DefinesMap;
}

/**
 * Shader library for caching, variant management, and async loading.
 *
 * Features:
 * - Shader caching and deduplication
 * - Variant compilation with feature flags
 * - Async loading from URLs
 * - Built-in shader management
 * - Hot-reload support
 *
 * @example
 * ```typescript
 * const library = new ShaderLibrary(gl);
 *
 * // Register built-in shader
 * library.registerBuiltin({
 *   name: 'pbr',
 *   source: {
 *     vertex: pbrVertexSource,
 *     fragment: pbrFragmentSource
 *   }
 * });
 *
 * // Load shader asynchronously
 * const shader = await library.load('pbr', {
 *   defines: {
 *     USE_SHADOWS: 1,
 *     MAX_LIGHTS: 4
 *   }
 * });
 *
 * // Get shader variant
 * const shadowShader = library.getVariant('pbr', {
 *   USE_SHADOWS: 1,
 *   USE_PCF: 1
 * });
 *
 * // Cleanup
 * library.dispose();
 * ```
 */
export class ShaderLibrary implements IDisposable {
  /** WebGL rendering context */
  private gl: WebGL2RenderingContext;

  /** Shader cache (name -> base shader) */
  private shaders: Map<string, Shader>;

  /** Variant cache (name:variantKey -> shader) */
  private variants: Map<string, Shader>;

  /** Built-in shader sources */
  private builtins: Map<string, BuiltinShaderDescriptor>;

  /** Pending shader loads */
  private pending: Map<string, Promise<Shader>>;

  /** Disposed flag */
  private disposed: boolean;

  /** Default load options */
  private defaultLoadOptions: ShaderLoadOptions;

  /**
   * Creates a new shader library
   *
   * @param gl - WebGL rendering context
   * @param defaultLoadOptions - Default options for loading shaders
   */
  constructor(gl: WebGL2RenderingContext, defaultLoadOptions: ShaderLoadOptions = {}) {
    this.gl = gl;
    this.shaders = new Map();
    this.variants = new Map();
    this.builtins = new Map();
    this.pending = new Map();
    this.disposed = false;
    this.defaultLoadOptions = {
      baseUrl: '/shaders',
      extensions: {
        vertex: '.vert',
        fragment: '.frag'
      },
      ...defaultLoadOptions
    };

    logger.debug('Shader library initialized');
  }

  /**
   * Register a built-in shader
   *
   * @param descriptor - Built-in shader descriptor
   *
   * @example
   * ```typescript
   * library.registerBuiltin({
   *   name: 'pbr',
   *   source: {
   *     vertex: pbrVertSource,
   *     fragment: pbrFragSource
   *   },
   *   defines: {
   *     USE_IBL: 1
   *   }
   * });
   * ```
   */
  registerBuiltin(descriptor: BuiltinShaderDescriptor): void {
    if (this.builtins.has(descriptor.name)) {
      logger.warn(`Overwriting built-in shader: ${descriptor.name}`);
    }

    this.builtins.set(descriptor.name, descriptor);
    logger.debug(`Registered built-in shader: ${descriptor.name}`);
  }

  /**
   * Check if a shader is registered (built-in or loaded)
   *
   * @param name - Shader name
   * @returns True if shader exists
   */
  has(name: string): boolean {
    return this.shaders.has(name) || this.builtins.has(name);
  }

  /**
   * Get a shader (loads if not cached)
   *
   * @param name - Shader name
   * @param defines - Preprocessor defines for variant
   * @returns Shader instance or undefined
   *
   * @example
   * ```typescript
   * const shader = library.get('pbr', { USE_SHADOWS: 1 });
   * ```
   */
  get(name: string, defines?: DefinesMap): Shader | undefined {
    // Get variant if defines specified
    if (defines && Object.keys(defines).length > 0) {
      return this.getVariant(name, defines);
    }

    // Return cached shader
    if (this.shaders.has(name)) {
      return this.shaders.get(name);
    }

    // Try to compile built-in
    const builtin = this.builtins.get(name);
    if (builtin) {
      const shader = this.createShader(name, builtin.source, builtin.defines);
      if (shader) {
        this.shaders.set(name, shader);
        return shader;
      }
    }

    logger.warn(`Shader not found: ${name}`);
    return undefined;
  }

  /**
   * Get a shader variant with specific defines
   *
   * @param name - Base shader name
   * @param defines - Variant defines
   * @returns Shader variant or undefined
   *
   * @example
   * ```typescript
   * const variant = library.getVariant('pbr', {
   *   USE_SHADOWS: 1,
   *   USE_NORMAL_MAP: 1
   * });
   * ```
   */
  getVariant(name: string, defines: DefinesMap): Shader | undefined {
    const variantKey = this.getVariantKey(name, defines);

    // Return cached variant
    if (this.variants.has(variantKey)) {
      return this.variants.get(variantKey);
    }

    // Get base shader source
    let source: ShaderSource | undefined;
    let baseDefines: DefinesMap = {};

    if (this.shaders.has(name)) {
      // Use existing shader's source
      const baseShader = this.shaders.get(name)!;
      source = baseShader['source']; // Access private field
      baseDefines = baseShader['defines'];
    } else if (this.builtins.has(name)) {
      // Use built-in source
      const builtin = this.builtins.get(name)!;
      source = builtin.source;
      baseDefines = builtin.defines || {};
    }

    if (!source) {
      logger.warn(`Cannot create variant for unknown shader: ${name}`);
      return undefined;
    }

    // Merge defines
    const mergedDefines = { ...baseDefines, ...defines };

    // Create variant
    const variant = this.createShader(`${name}_variant`, source, mergedDefines);
    if (variant) {
      this.variants.set(variantKey, variant);
      logger.debug(`Created shader variant: ${variantKey}`);
      return variant;
    }

    return undefined;
  }

  /**
   * Load a shader asynchronously from URLs
   *
   * @param name - Shader name
   * @param options - Load options
   * @returns Promise resolving to shader
   *
   * @example
   * ```typescript
   * const shader = await library.load('pbr', {
   *   baseUrl: '/shaders',
   *   defines: { USE_SHADOWS: 1 }
   * });
   * ```
   */
  async load(name: string, options: ShaderLoadOptions = {}): Promise<Shader> {
    // Return cached shader
    if (this.shaders.has(name)) {
      return this.shaders.get(name)!;
    }

    // Return pending load
    if (this.pending.has(name)) {
      return this.pending.get(name)!;
    }

    // Check if built-in
    if (this.builtins.has(name)) {
      const shader = this.get(name);
      if (shader) return shader;
    }

    // Merge options
    const opts = { ...this.defaultLoadOptions, ...options };

    // Start load
    const loadPromise = this.loadFromUrls(name, opts);
    this.pending.set(name, loadPromise);

    try {
      const shader = await loadPromise;
      this.shaders.set(name, shader);
      this.pending.delete(name);
      logger.info(`Loaded shader: ${name}`);
      return shader;
    } catch (error) {
      this.pending.delete(name);
      logger.error(`Failed to load shader: ${name}`, error);
      throw error;
    }
  }

  /**
   * Load shader source from URLs
   *
   * @param name - Shader name
   * @param options - Load options
   * @returns Promise resolving to shader
   */
  private async loadFromUrls(name: string, options: ShaderLoadOptions): Promise<Shader> {
    const baseUrl = options.baseUrl || '';
    const vertExt = options.extensions?.vertex || '.vert';
    const fragExt = options.extensions?.fragment || '.frag';

    const vertUrl = `${baseUrl}/${name}${vertExt}`;
    const fragUrl = `${baseUrl}/${name}${fragExt}`;

    // Fetch both shaders
    const [vertResponse, fragResponse] = await Promise.all([
      fetch(vertUrl),
      fetch(fragUrl)
    ]);

    if (!vertResponse.ok) {
      throw new Error(`Failed to load vertex shader: ${vertUrl} (${vertResponse.status})`);
    }

    if (!fragResponse.ok) {
      throw new Error(`Failed to load fragment shader: ${fragUrl} (${fragResponse.status})`);
    }

    const [vertSource, fragSource] = await Promise.all([
      vertResponse.text(),
      fragResponse.text()
    ]);

    const source: ShaderSource = {
      vertex: vertSource,
      fragment: fragSource
    };

    const shader = this.createShader(name, source, options.defines);
    if (!shader) {
      throw new Error(`Failed to create shader: ${name}`);
    }
    return shader;
  }

  /**
   * Create a shader from source
   *
   * @param name - Shader name
   * @param source - Shader source
   * @param defines - Preprocessor defines
   * @returns Shader instance or undefined
   */
  private createShader(
    name: string,
    source: ShaderSource,
    defines?: DefinesMap
  ): Shader | undefined {
    try {
      const shaderOptions: ShaderOptions = {
        name,
        source,
        defines,
        language: this.defaultLoadOptions.language,
        gl: this.gl
      };

      const shader = new Shader(shaderOptions);

      if (!shader.isReady) {
        const errors = shader.getErrors();
        logger.error(`Shader compilation failed: ${name}`, errors);
        return undefined;
      }

      return shader;
    } catch (error) {
      logger.error(`Failed to create shader: ${name}`, error);
      return undefined;
    }
  }

  /**
   * Generate variant key from defines
   *
   * @param name - Base shader name
   * @param defines - Defines map
   * @returns Variant key string
   */
  private getVariantKey(name: string, defines: DefinesMap): VariantKey {
    const sortedEntries = Object.entries(defines).sort((a, b) => a[0].localeCompare(b[0]));
    const definesStr = sortedEntries.map(([k, v]) => `${k}=${v}`).join(',');
    return `${name}:${definesStr}`;
  }

  /**
   * Reload a shader (useful for hot-reload)
   *
   * @param name - Shader name
   * @returns Promise resolving to reloaded shader
   *
   * @example
   * ```typescript
   * // Reload shader from disk
   * const shader = await library.reload('pbr');
   * ```
   */
  async reload(name: string): Promise<Shader | undefined> {
    // Remove from caches
    const shader = this.shaders.get(name);
    if (shader) {
      shader.dispose();
      this.shaders.delete(name);
    }

    // Remove all variants
    const variantsToRemove: string[] = [];
    for (const [key] of this.variants) {
      if (key.startsWith(`${name}:`)) {
        variantsToRemove.push(key);
      }
    }

    for (const key of variantsToRemove) {
      const variant = this.variants.get(key);
      if (variant) {
        variant.dispose();
      }
      this.variants.delete(key);
    }

    // Reload
    try {
      const reloaded = await this.load(name);
      logger.info(`Reloaded shader: ${name}`);

      // Emit reload event
      EventBus.emit('asset:loaded', {
        assetId: name,
        assetType: 'shader'
      });

      return reloaded;
    } catch (error) {
      logger.error(`Failed to reload shader: ${name}`, error);
      return undefined;
    }
  }

  /**
   * Preload multiple shaders
   *
   * @param names - Array of shader names
   * @param options - Load options
   * @returns Promise resolving when all shaders are loaded
   *
   * @example
   * ```typescript
   * await library.preload(['pbr', 'skybox', 'shadow']);
   * ```
   */
  async preload(names: string[], options: ShaderLoadOptions = {}): Promise<void> {
    const promises = names.map(name => this.load(name, options));
    await Promise.all(promises);
    logger.info(`Preloaded ${names.length} shaders`);
  }

  /**
   * Get all shader names
   *
   * @returns Array of shader names
   */
  getShaderNames(): string[] {
    const names = new Set<string>();

    for (const name of this.shaders.keys()) {
      names.add(name);
    }

    for (const name of this.builtins.keys()) {
      names.add(name);
    }

    return Array.from(names);
  }

  /**
   * Get all variant keys for a shader
   *
   * @param name - Shader name
   * @returns Array of variant keys
   */
  getVariantKeys(name: string): string[] {
    const keys: string[] = [];

    for (const [key] of this.variants) {
      if (key.startsWith(`${name}:`)) {
        keys.push(key);
      }
    }

    return keys;
  }

  /**
   * Get library statistics
   *
   * @returns Library stats
   */
  getStats(): {
    shaders: number;
    variants: number;
    builtins: number;
    pending: number;
  } {
    return {
      shaders: this.shaders.size,
      variants: this.variants.size,
      builtins: this.builtins.size,
      pending: this.pending.size
    };
  }

  /**
   * Clear all cached shaders and variants
   */
  clear(): void {
    // Dispose all shaders
    for (const shader of this.shaders.values()) {
      shader.dispose();
    }
    this.shaders.clear();

    // Dispose all variants
    for (const variant of this.variants.values()) {
      variant.dispose();
    }
    this.variants.clear();

    // Clear pending
    this.pending.clear();

    logger.debug('Cleared shader library');
  }

  /**
   * Dispose of library and all shaders
   */
  dispose(): void {
    if (this.disposed) return;

    this.clear();
    this.builtins.clear();
    this.disposed = true;

    logger.debug('Disposed shader library');
  }

  /**
   * Check if library is disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }
}

/**
 * Global shader library instance
 */
let globalLibrary: ShaderLibrary | null = null;

/**
 * Initialize global shader library
 *
 * @param gl - WebGL rendering context
 * @param options - Load options
 * @returns Global shader library instance
 *
 * @example
 * ```typescript
 * const library = initShaderLibrary(gl, {
 *   baseUrl: '/assets/shaders'
 * });
 * ```
 */
export function initShaderLibrary(
  gl: WebGL2RenderingContext,
  options?: ShaderLoadOptions
): ShaderLibrary {
  if (globalLibrary) {
    globalLibrary.dispose();
  }

  globalLibrary = new ShaderLibrary(gl, options);
  return globalLibrary;
}

/**
 * Get global shader library instance
 *
 * @returns Global shader library or null if not initialized
 */
export function getShaderLibrary(): ShaderLibrary | null {
  return globalLibrary;
}
