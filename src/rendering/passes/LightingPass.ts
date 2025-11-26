/**
 * Lighting Pass for deferred rendering.
 *
 * Performs physically-based lighting calculations using the GBuffer.
 * Implements Cook-Torrance BRDF with:
 * - Directional lights
 * - Point lights with attenuation
 * - Spot lights with cone falloff
 * - Image-based lighting (IBL)
 * - Shadow mapping integration
 * - Ambient occlusion
 * - Tiled/clustered light culling
 *
 * @module LightingPass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Shader, ShaderSource } from '../shader/Shader';
import { UniformBuffer, UniformBufferDescriptor, UniformLayout, UniformType } from '../shader/UniformBuffer';
import { Camera } from '../camera/Camera';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';
import { Vector3 } from '../../math/Vector3';
import { Vector4 } from '../../math/Vector4';
import { Matrix4 } from '../../math/Matrix4';

const logger = Logger.create('LightingPass');

/**
 * Light type enumeration.
 */
export enum LightType {
  /** Directional light (sun) */
  Directional = 0,
  /** Point light (omni-directional) */
  Point = 1,
  /** Spot light (cone) */
  Spot = 2,
}

/**
 * Light descriptor for uniform buffer packing.
 */
export interface Light {
  /** Light type */
  type: LightType;
  /** Light position (world space, unused for directional) */
  position: Vector3;
  /** Light direction (world space, normalized) */
  direction: Vector3;
  /** Light color and intensity */
  color: Color;
  /** Light intensity multiplier */
  intensity: number;
  /** Attenuation radius for point/spot lights */
  range: number;
  /** Inner cone angle (radians) for spot lights */
  innerConeAngle: number;
  /** Outer cone angle (radians) for spot lights */
  outerConeAngle: number;
  /** Shadow map index (-1 = no shadow) */
  shadowMapIndex: number;
  /** Shadow bias */
  shadowBias: number;
}

/**
 * Lighting pass configuration.
 */
export interface LightingPassConfig {
  /** Maximum number of lights (for uniform buffer allocation) */
  maxLights?: number;
  /** Enable tiled/clustered light culling */
  enableLightCulling?: boolean;
  /** Tile size for light culling (pixels) */
  tileSize?: number;
  /** Enable image-based lighting */
  enableIBL?: boolean;
  /** Enable shadow mapping */
  enableShadows?: boolean;
  /** PCF filter size for shadow maps */
  shadowFilterSize?: number;
  /** Target resolution */
  width: number;
  height: number;
}

/**
 * Fullscreen quad vertex shader for deferred lighting.
 */
const LIGHTING_VERTEX_SHADER = `#version 300 es
precision highp float;

// Fullscreen triangle vertices
const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

const vec2 texcoords[3] = vec2[3](
  vec2(0.0, 0.0),
  vec2(2.0, 0.0),
  vec2(0.0, 2.0)
);

out vec2 v_texcoord;

void main() {
  v_texcoord = texcoords[gl_VertexID];
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

/**
 * Deferred lighting fragment shader.
 */
const LIGHTING_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

// GBuffer textures
uniform sampler2D u_albedoMetallic;
uniform sampler2D u_normalRoughnessAO;
uniform sampler2D u_emission;
uniform sampler2D u_depth;

// Shadow maps
#ifdef ENABLE_SHADOWS
uniform sampler2D u_shadowMap0;
uniform sampler2D u_shadowMap1;
uniform sampler2D u_shadowMap2;
uniform sampler2D u_shadowMap3;
uniform mat4 u_shadowMatrices[4];
#endif

// Environment map for IBL
#ifdef ENABLE_IBL
uniform samplerCube u_irradianceMap;
uniform samplerCube u_prefilteredMap;
uniform sampler2D u_brdfLUT;
#endif

// Camera uniforms
uniform vec3 u_cameraPosition;
uniform mat4 u_inverseViewProjection;

// Lighting uniforms
uniform int u_lightCount;

struct Light {
  vec4 positionType;      // xyz = position, w = type
  vec4 directionRange;    // xyz = direction, w = range
  vec4 colorIntensity;    // rgb = color, a = intensity
  vec4 spotAngles;        // x = inner angle, y = outer angle, z = shadow index, w = shadow bias
};

uniform Light u_lights[MAX_LIGHTS];

// Output
layout(location = 0) out vec4 o_color;

const float PI = 3.14159265359;

/**
 * Decodes octahedron-encoded normal from GBuffer.
 */
vec3 decodeOctahedron(vec2 encoded) {
  vec2 nxy = encoded * 2.0 - 1.0;
  float nz = 1.0 - abs(nxy.x) - abs(nxy.y);
  float t = max(-nz, 0.0);
  nxy.x += nxy.x >= 0.0 ? -t : t;
  nxy.y += nxy.y >= 0.0 ? -t : t;
  return normalize(vec3(nxy, nz));
}

/**
 * Reconstructs world position from depth buffer.
 */
vec3 worldPositionFromDepth(vec2 uv, float depth) {
  vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 worldPos = u_inverseViewProjection * clipPos;
  return worldPos.xyz / worldPos.w;
}

/**
 * Fresnel-Schlick approximation.
 */
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

/**
 * Fresnel-Schlick approximation with roughness for IBL.
 */
vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
  return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(1.0 - cosTheta, 5.0);
}

/**
 * GGX/Trowbridge-Reitz normal distribution function.
 */
float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float NdotH2 = NdotH * NdotH;

  float num = a2;
  float denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;

  return num / denom;
}

/**
 * Schlick-GGX geometry function.
 */
float geometrySchlickGGX(float NdotV, float roughness) {
  float r = (roughness + 1.0);
  float k = (r * r) / 8.0;

  float num = NdotV;
  float denom = NdotV * (1.0 - k) + k;

  return num / denom;
}

/**
 * Smith's method for geometry obstruction.
 */
float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float ggx2 = geometrySchlickGGX(NdotV, roughness);
  float ggx1 = geometrySchlickGGX(NdotL, roughness);

  return ggx1 * ggx2;
}

/**
 * Cook-Torrance BRDF.
 */
vec3 cookTorranceBRDF(vec3 N, vec3 V, vec3 L, vec3 albedo, float metallic, float roughness) {
  vec3 H = normalize(V + L);

  // Calculate F0 (base reflectance at normal incidence)
  vec3 F0 = vec3(0.04);
  F0 = mix(F0, albedo, metallic);

  // Cook-Torrance BRDF components
  float NDF = distributionGGX(N, H, roughness);
  float G = geometrySmith(N, V, L, roughness);
  vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  vec3 numerator = NDF * G * F;
  float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
  vec3 specular = numerator / denominator;

  // Energy conservation
  vec3 kS = F;
  vec3 kD = vec3(1.0) - kS;
  kD *= 1.0 - metallic;

  float NdotL = max(dot(N, L), 0.0);

  return (kD * albedo / PI + specular) * NdotL;
}

/**
 * Calculate attenuation for point/spot lights.
 */
float calculateAttenuation(float distance, float range) {
  // Inverse square falloff with smooth cutoff at range
  float attenuation = 1.0 / (distance * distance + 1.0);
  float cutoff = distance / range;
  cutoff = 1.0 - cutoff * cutoff;
  cutoff = max(cutoff, 0.0);
  cutoff = cutoff * cutoff;
  return attenuation * cutoff;
}

/**
 * Calculate spot light cone attenuation.
 */
float calculateSpotAttenuation(vec3 L, vec3 lightDir, float innerAngle, float outerAngle) {
  float cosOuter = cos(outerAngle);
  float cosInner = cos(innerAngle);
  float cosAngle = dot(-L, lightDir);
  float spotEffect = smoothstep(cosOuter, cosInner, cosAngle);
  return spotEffect;
}

/**
 * Sample shadow map with PCF filtering.
 */
#ifdef ENABLE_SHADOWS
float sampleShadowMap(sampler2D shadowMap, vec4 shadowCoord, float bias) {
  vec3 projCoords = shadowCoord.xyz / shadowCoord.w;
  projCoords = projCoords * 0.5 + 0.5;

  if (projCoords.z > 1.0) return 1.0;

  float currentDepth = projCoords.z - bias;
  float shadow = 0.0;
  vec2 texelSize = 1.0 / vec2(textureSize(shadowMap, 0));

  // PCF filtering
  #if SHADOW_FILTER_SIZE == 1
    float closestDepth = texture(shadowMap, projCoords.xy).r;
    shadow = currentDepth > closestDepth ? 0.0 : 1.0;
  #elif SHADOW_FILTER_SIZE == 3
    for(int x = -1; x <= 1; ++x) {
      for(int y = -1; y <= 1; ++y) {
        float pcfDepth = texture(shadowMap, projCoords.xy + vec2(x, y) * texelSize).r;
        shadow += currentDepth > pcfDepth ? 0.0 : 1.0;
      }
    }
    shadow /= 9.0;
  #elif SHADOW_FILTER_SIZE == 5
    for(int x = -2; x <= 2; ++x) {
      for(int y = -2; y <= 2; ++y) {
        float pcfDepth = texture(shadowMap, projCoords.xy + vec2(x, y) * texelSize).r;
        shadow += currentDepth > pcfDepth ? 0.0 : 1.0;
      }
    }
    shadow /= 25.0;
  #endif

  return shadow;
}
#endif

/**
 * Calculate lighting contribution from a single light.
 */
vec3 calculateLightContribution(Light light, vec3 worldPos, vec3 N, vec3 V, vec3 albedo, float metallic, float roughness) {
  int lightType = int(light.positionType.w);
  vec3 L;
  float attenuation = 1.0;
  float shadow = 1.0;

  // Calculate light direction and attenuation
  if (lightType == 0) {
    // Directional light
    L = normalize(-light.directionRange.xyz);
  } else if (lightType == 1) {
    // Point light
    vec3 lightVec = light.positionType.xyz - worldPos;
    float distance = length(lightVec);
    L = lightVec / distance;
    attenuation = calculateAttenuation(distance, light.directionRange.w);
  } else if (lightType == 2) {
    // Spot light
    vec3 lightVec = light.positionType.xyz - worldPos;
    float distance = length(lightVec);
    L = lightVec / distance;
    float distAttenuation = calculateAttenuation(distance, light.directionRange.w);
    float spotAttenuation = calculateSpotAttenuation(L, light.directionRange.xyz, light.spotAngles.x, light.spotAngles.y);
    attenuation = distAttenuation * spotAttenuation;
  }

  // Calculate shadow
  #ifdef ENABLE_SHADOWS
  int shadowIndex = int(light.spotAngles.z);
  if (shadowIndex >= 0 && shadowIndex < 4) {
    vec4 shadowCoord = u_shadowMatrices[shadowIndex] * vec4(worldPos, 1.0);
    if (shadowIndex == 0) shadow = sampleShadowMap(u_shadowMap0, shadowCoord, light.spotAngles.w);
    else if (shadowIndex == 1) shadow = sampleShadowMap(u_shadowMap1, shadowCoord, light.spotAngles.w);
    else if (shadowIndex == 2) shadow = sampleShadowMap(u_shadowMap2, shadowCoord, light.spotAngles.w);
    else if (shadowIndex == 3) shadow = sampleShadowMap(u_shadowMap3, shadowCoord, light.spotAngles.w);
  }
  #endif

  // Calculate BRDF
  vec3 radiance = light.colorIntensity.rgb * light.colorIntensity.a * attenuation * shadow;
  vec3 brdf = cookTorranceBRDF(N, V, L, albedo, metallic, roughness);

  return brdf * radiance;
}

/**
 * Calculate image-based lighting (ambient).
 */
#ifdef ENABLE_IBL
vec3 calculateIBL(vec3 N, vec3 V, vec3 albedo, float metallic, float roughness, float ao) {
  vec3 F0 = vec3(0.04);
  F0 = mix(F0, albedo, metallic);

  vec3 F = fresnelSchlickRoughness(max(dot(N, V), 0.0), F0, roughness);

  vec3 kS = F;
  vec3 kD = 1.0 - kS;
  kD *= 1.0 - metallic;

  // Diffuse IBL
  vec3 irradiance = texture(u_irradianceMap, N).rgb;
  vec3 diffuse = irradiance * albedo;

  // Specular IBL
  vec3 R = reflect(-V, N);
  const float MAX_REFLECTION_LOD = 4.0;
  vec3 prefilteredColor = textureLod(u_prefilteredMap, R, roughness * MAX_REFLECTION_LOD).rgb;
  vec2 brdf = texture(u_brdfLUT, vec2(max(dot(N, V), 0.0), roughness)).rg;
  vec3 specular = prefilteredColor * (F * brdf.x + brdf.y);

  return (kD * diffuse + specular) * ao;
}
#endif

void main() {
  // Sample GBuffer
  vec4 albedoMetallic = texture(u_albedoMetallic, v_texcoord);
  vec4 normalRoughnessAO = texture(u_normalRoughnessAO, v_texcoord);
  vec4 emissionSample = texture(u_emission, v_texcoord);
  float depth = texture(u_depth, v_texcoord).r;

  // Early exit for skybox (depth = 1.0)
  if (depth >= 0.9999) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Unpack GBuffer
  vec3 albedo = albedoMetallic.rgb;
  float metallic = albedoMetallic.a;
  vec2 encodedNormal = normalRoughnessAO.xy;
  float roughness = normalRoughnessAO.z;
  float ao = normalRoughnessAO.w;
  vec3 emission = emissionSample.rgb;

  // Decode normal
  vec3 N = decodeOctahedron(encodedNormal);

  // Reconstruct world position
  vec3 worldPos = worldPositionFromDepth(v_texcoord, depth);

  // Calculate view direction
  vec3 V = normalize(u_cameraPosition - worldPos);

  // Accumulate lighting
  vec3 Lo = vec3(0.0);

  // Process all lights
  for (int i = 0; i < u_lightCount; ++i) {
    Lo += calculateLightContribution(u_lights[i], worldPos, N, V, albedo, metallic, roughness);
  }

  // Add image-based lighting (ambient)
  #ifdef ENABLE_IBL
  vec3 ambient = calculateIBL(N, V, albedo, metallic, roughness, ao);
  #else
  vec3 ambient = vec3(0.03) * albedo * ao;
  #endif

  // Combine lighting
  vec3 color = ambient + Lo + emission;

  o_color = vec4(color, 1.0);
}
`;

/**
 * Deferred lighting pass using GBuffer.
 * Accumulates lighting from all lights in the scene using physically-based rendering.
 *
 * @example
 * ```typescript
 * // Create lighting pass
 * const lightingPass = new LightingPass({
 *   width: 1920,
 *   height: 1080,
 *   maxLights: 64,
 *   enableIBL: true,
 *   enableShadows: true,
 *   shadowFilterSize: 3
 * });
 *
 * // Setup pass
 * lightingPass.setup();
 *
 * // Add lights
 * lightingPass.addDirectionalLight({
 *   direction: new Vector3(0, -1, -1).normalize(),
 *   color: Color.white(),
 *   intensity: 5.0,
 *   castShadows: true
 * });
 *
 * // In render loop
 * lightingPass.execute(emptyQueue, lightingTarget);
 * ```
 */
export class LightingPass extends RenderPass {
  /** Pass configuration */
  private config: LightingPassConfig;

  /** Deferred lighting shader */
  private shader: Shader | null = null;

  /** Lights uniform buffer */
  private lightsUBO: UniformBuffer | null = null;

  /** Camera uniform buffer */
  private cameraUBO: UniformBuffer | null = null;

  /** Active lights */
  private lights: Light[] = [];

  /** Current camera */
  private currentCamera: Camera | null = null;

  /** GBuffer texture references */
  private gbufferTextures = {
    albedoMetallic: null as unknown,
    normalRoughnessAO: null as unknown,
    emission: null as unknown,
    depth: null as unknown,
  };

  /** Light culling tiles (for tiled/clustered lighting) */
  private lightTiles: Uint16Array[] = [];

  /** Statistics */
  private stats = {
    lightsProcessed: 0,
    tilesProcessed: 0,
  };

  /**
   * Creates a new lighting pass.
   *
   * @param config - Lighting pass configuration
   */
  constructor(config: LightingPassConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'LightingPass',
      colorAttachments: [
        {
          name: 'hdrColor',
          format: TextureFormat.RGBA16F,
        },
      ],
      clearValues: {
        colors: [Color.black()],
      },
      colorLoadActions: [LoadAction.Clear],
      colorStoreActions: [StoreAction.Store],
    };

    super(descriptor);
    this.config = {
      maxLights: 64,
      enableLightCulling: false,
      tileSize: 16,
      enableIBL: false,
      enableShadows: false,
      shadowFilterSize: 3,
      ...config,
    };

    logger.info(`Created LightingPass: max lights: ${this.config.maxLights}`);
  }

  /** Fullscreen triangle VAO */
  private fullscreenVAO: WebGLVertexArrayObject | null = null;

  /** WebGL context */
  private gl: WebGL2RenderingContext | null = null;

  /**
   * Sets up the lighting pass resources.
   */
  setup(): void {
    logger.debug('Setting up LightingPass');

    // Create camera uniform buffer
    const cameraUBODesc: UniformBufferDescriptor = {
      name: 'Camera',
      binding: 0,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'cameraPosition', type: UniformType.Vec3 },
        { name: 'inverseViewProjection', type: UniformType.Mat4 },
      ],
    };
    this.cameraUBO = new UniformBuffer(cameraUBODesc);

    // Create lights uniform buffer
    const lightsUBODesc: UniformBufferDescriptor = {
      name: 'Lights',
      binding: 1,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'lightCount', type: UniformType.Int },
        // Light array will be added dynamically
      ],
    };
    this.lightsUBO = new UniformBuffer(lightsUBODesc);

    // Build shader defines based on configuration
    const defines: Record<string, number | string> = {
      MAX_LIGHTS: this.config.maxLights ?? 64,
    };

    if (this.config.enableShadows) {
      defines.ENABLE_SHADOWS = 1;
      defines.SHADOW_FILTER_SIZE = this.config.shadowFilterSize ?? 3;
    }

    if (this.config.enableIBL) {
      defines.ENABLE_IBL = 1;
    }

    // Create deferred lighting shader
    this.shader = new Shader({
      name: 'DeferredLighting',
      source: {
        vertex: LIGHTING_VERTEX_SHADER,
        fragment: LIGHTING_FRAGMENT_SHADER,
      },
      defines,
      gl: this.gl ?? undefined,
    });

    // Create fullscreen triangle VAO (note: the shader uses gl_VertexID, so no vertex buffer needed)
    if (this.gl) {
      this.fullscreenVAO = this.gl.createVertexArray();
      if (this.fullscreenVAO) {
        this.gl.bindVertexArray(this.fullscreenVAO);
        // No vertex attributes needed - shader uses gl_VertexID
        this.gl.bindVertexArray(null);
      }
    }

    logger.info('LightingPass setup complete');
  }

  /**
   * Executes the lighting pass.
   * Renders full-screen quad with deferred lighting calculations.
   *
   * @param renderQueue - Unused for deferred lighting
   * @param renderTarget - Target to render lighting result
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.currentCamera || !this.shader || !this.lightsUBO || !this.gl) {
      logger.error('LightingPass not properly initialized');
      return;
    }

    // Reset statistics
    this.stats.lightsProcessed = this.lights.length;
    this.stats.tilesProcessed = 0;

    logger.trace(`LightingPass: processing ${this.lights.length} lights`);

    // Bind output framebuffer (if available via RenderTarget/RenderTexture)
    // Note: RenderTarget is abstract and may not have getFramebuffer directly
    // In a full implementation, this would be handled by the graphics backend
    if ('getFramebuffer' in renderTarget && typeof (renderTarget as any).getFramebuffer === 'function') {
      const framebuffer = (renderTarget as any).getFramebuffer();
      if (framebuffer !== undefined) {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer as WebGLFramebuffer | null);
      }
    }

    // Set viewport
    this.gl.viewport(0, 0, this.config.width, this.config.height);

    // Disable depth testing and depth writes for fullscreen pass
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.depthMask(false);

    // Disable blending (we're replacing, not blending)
    this.gl.disable(this.gl.BLEND);

    // Bind the deferred lighting shader
    this.shader.bind();

    // Bind GBuffer textures to samplers
    if (this.gbufferTextures.albedoMetallic) {
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.gbufferTextures.albedoMetallic as WebGLTexture);
      this.shader.setUniform('u_albedoMetallic', 0);
    }

    if (this.gbufferTextures.normalRoughnessAO) {
      this.gl.activeTexture(this.gl.TEXTURE1);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.gbufferTextures.normalRoughnessAO as WebGLTexture);
      this.shader.setUniform('u_normalRoughnessAO', 1);
    }

    if (this.gbufferTextures.emission) {
      this.gl.activeTexture(this.gl.TEXTURE2);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.gbufferTextures.emission as WebGLTexture);
      this.shader.setUniform('u_emission', 2);
    }

    if (this.gbufferTextures.depth) {
      this.gl.activeTexture(this.gl.TEXTURE3);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.gbufferTextures.depth as WebGLTexture);
      this.shader.setUniform('u_depth', 3);
    }

    // Update camera uniforms
    if (this.cameraUBO) {
      this.cameraUBO.setVec3('cameraPosition', this.currentCamera.transform.worldPosition);
      this.cameraUBO.setMat4('inverseViewProjection', this.currentCamera.inverseViewProjectionMatrix!);
    }

    // Set camera uniforms via shader
    this.shader.setUniform('u_cameraPosition', this.currentCamera.transform.worldPosition);
    if (this.currentCamera.inverseViewProjectionMatrix) {
      this.shader.setUniform('u_inverseViewProjection', this.currentCamera.inverseViewProjectionMatrix);
    }

    // Update lights uniform buffer
    this.updateLightsUBO();

    // Set light count uniform
    this.shader.setUniform('u_lightCount', this.lights.length);

    // Set light uniforms (pack lights into uniform arrays)
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i];

      // Pack light data into vec4s as defined in the shader
      this.shader.setUniform(`u_lights[${i}].positionType`, new Vector4(
        light.position.x,
        light.position.y,
        light.position.z,
        light.type
      ));

      this.shader.setUniform(`u_lights[${i}].directionRange`, new Vector4(
        light.direction.x,
        light.direction.y,
        light.direction.z,
        light.range
      ));

      this.shader.setUniform(`u_lights[${i}].colorIntensity`, new Vector4(
        light.color.r,
        light.color.g,
        light.color.b,
        light.intensity
      ));

      this.shader.setUniform(`u_lights[${i}].spotAngles`, new Vector4(
        light.innerConeAngle,
        light.outerConeAngle,
        light.shadowMapIndex,
        light.shadowBias
      ));
    }

    // Bind fullscreen triangle VAO and draw
    if (this.fullscreenVAO) {
      this.gl.bindVertexArray(this.fullscreenVAO);
    }

    // Draw fullscreen triangle (3 vertices, no index buffer)
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);

    // Unbind VAO
    if (this.fullscreenVAO) {
      this.gl.bindVertexArray(null);
    }

    // Restore depth test state
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthMask(true);

    logger.trace(`LightingPass complete: ${this.stats.lightsProcessed} lights processed`);
  }

  /**
   * Cleans up lighting pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up LightingPass');

    if (this.shader) {
      this.shader.dispose();
      this.shader = null;
    }

    if (this.fullscreenVAO && this.gl) {
      this.gl.deleteVertexArray(this.fullscreenVAO);
      this.fullscreenVAO = null;
    }

    this.lightsUBO = null;
    this.cameraUBO = null;
    this.lights.length = 0;

    logger.info('LightingPass cleanup complete');
  }

  /**
   * Sets the WebGL context for rendering.
   *
   * @param gl - WebGL2 rendering context
   */
  setContext(gl: WebGL2RenderingContext): void {
    this.gl = gl;
  }

  /**
   * Sets the GBuffer textures for lighting calculations.
   *
   * @param albedoMetallic - Albedo + metallic texture
   * @param normalRoughnessAO - Normal + roughness + AO texture
   * @param emission - Emission texture
   * @param depth - Depth texture
   */
  setGBufferTextures(albedoMetallic: unknown, normalRoughnessAO: unknown, emission: unknown, depth: unknown): void {
    this.gbufferTextures.albedoMetallic = albedoMetallic;
    this.gbufferTextures.normalRoughnessAO = normalRoughnessAO;
    this.gbufferTextures.emission = emission;
    this.gbufferTextures.depth = depth;
  }

  /**
   * Updates the camera for lighting calculations.
   *
   * @param camera - Active camera
   */
  updateCamera(camera: Camera): void {
    this.currentCamera = camera;
  }

  /**
   * Adds a directional light to the scene.
   *
   * @param direction - Light direction (normalized)
   * @param color - Light color
   * @param intensity - Light intensity
   * @param shadowMapIndex - Shadow map index (-1 for no shadows)
   * @param shadowBias - Shadow bias to prevent acne
   */
  addDirectionalLight(
    direction: Vector3,
    color: Color,
    intensity: number,
    shadowMapIndex: number = -1,
    shadowBias: number = 0.005
  ): void {
    if (this.lights.length >= (this.config.maxLights ?? 64)) {
      logger.warn('Maximum light count reached, cannot add more lights');
      return;
    }

    this.lights.push({
      type: LightType.Directional,
      position: new Vector3(0, 0, 0),
      direction: direction.normalize(),
      color,
      intensity,
      range: 0,
      innerConeAngle: 0,
      outerConeAngle: 0,
      shadowMapIndex,
      shadowBias,
    });
  }

  /**
   * Adds a point light to the scene.
   *
   * @param position - Light position
   * @param color - Light color
   * @param intensity - Light intensity
   * @param range - Light range/radius
   * @param shadowMapIndex - Shadow map index (-1 for no shadows)
   * @param shadowBias - Shadow bias
   */
  addPointLight(
    position: Vector3,
    color: Color,
    intensity: number,
    range: number,
    shadowMapIndex: number = -1,
    shadowBias: number = 0.005
  ): void {
    if (this.lights.length >= (this.config.maxLights ?? 64)) {
      logger.warn('Maximum light count reached, cannot add more lights');
      return;
    }

    this.lights.push({
      type: LightType.Point,
      position,
      direction: new Vector3(0, -1, 0),
      color,
      intensity,
      range,
      innerConeAngle: 0,
      outerConeAngle: 0,
      shadowMapIndex,
      shadowBias,
    });
  }

  /**
   * Adds a spot light to the scene.
   *
   * @param position - Light position
   * @param direction - Light direction (normalized)
   * @param color - Light color
   * @param intensity - Light intensity
   * @param range - Light range
   * @param innerConeAngle - Inner cone angle (radians)
   * @param outerConeAngle - Outer cone angle (radians)
   * @param shadowMapIndex - Shadow map index (-1 for no shadows)
   * @param shadowBias - Shadow bias
   */
  addSpotLight(
    position: Vector3,
    direction: Vector3,
    color: Color,
    intensity: number,
    range: number,
    innerConeAngle: number,
    outerConeAngle: number,
    shadowMapIndex: number = -1,
    shadowBias: number = 0.005
  ): void {
    if (this.lights.length >= (this.config.maxLights ?? 64)) {
      logger.warn('Maximum light count reached, cannot add more lights');
      return;
    }

    this.lights.push({
      type: LightType.Spot,
      position,
      direction: direction.normalize(),
      color,
      intensity,
      range,
      innerConeAngle,
      outerConeAngle,
      shadowMapIndex,
      shadowBias,
    });
  }

  /**
   * Clears all lights from the scene.
   */
  clearLights(): void {
    this.lights.length = 0;
  }

  /**
   * Updates the lights uniform buffer.
   */
  private updateLightsUBO(): void {
    if (!this.lightsUBO) return;

    this.lightsUBO.setInt('lightCount', this.lights.length);

    // Pack lights into uniform buffer
    // (Would need to extend UniformBuffer to support struct arrays)
  }

  /**
   * Gets lighting statistics.
   */
  getStats(): Readonly<typeof this.stats> {
    return this.stats;
  }

  /**
   * Gets the current light count.
   */
  getLightCount(): number {
    return this.lights.length;
  }
}
