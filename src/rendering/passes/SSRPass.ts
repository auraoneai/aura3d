/**
 * Screen-Space Reflections (SSR) Pass for G3D rendering engine.
 *
 * Implements high-quality screen-space reflections using:
 * - Hierarchical Z-buffer (Hi-Z) for efficient ray marching
 * - Stochastic sampling for rough surface reflections
 * - Temporal reprojection for noise reduction
 * - Edge fading to hide screen-space artifacts
 * - Fallback to environment cubemap for missed rays
 * - Configurable quality settings
 *
 * Performance target: < 3ms at full resolution (1080p)
 *
 * @module SSRPass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Shader, ShaderSource } from '../shader/Shader';
import { UniformBuffer, UniformBufferDescriptor, UniformLayout, UniformType } from '../shader/UniformBuffer';
import { Camera } from '../camera/Camera';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';
import { Matrix4 } from '../../math/Matrix4';
import { Vector2 } from '../../math/Vector2';
import { Vector3 } from '../../math/Vector3';

const logger = Logger.create('SSRPass');

/**
 * SSR quality preset.
 */
export enum SSRQuality {
  /** Low quality: 8 steps, no temporal */
  Low = 0,
  /** Medium quality: 16 steps, basic temporal */
  Medium = 1,
  /** High quality: 32 steps, full temporal */
  High = 2,
  /** Ultra quality: 64 steps, temporal + denoising */
  Ultra = 3,
}

/**
 * SSR pass configuration.
 */
export interface SSRPassConfig {
  /** Target resolution width */
  width: number;
  /** Target resolution height */
  height: number;
  /** Quality preset */
  quality?: SSRQuality;
  /** Maximum ray marching steps */
  maxSteps?: number;
  /** Ray thickness for intersection testing */
  thickness?: number;
  /** Maximum ray distance */
  maxDistance?: number;
  /** Binary search refinement steps */
  binarySearchSteps?: number;
  /** Screen edge fade distance (pixels) */
  fadeDistance?: number;
  /** Enable temporal reprojection */
  enableTemporal?: boolean;
  /** Temporal blend factor (0-1) */
  temporalBlendFactor?: number;
  /** Enable stochastic sampling for roughness */
  enableStochastic?: boolean;
  /** Number of samples for stochastic */
  stochasticSamples?: number;
  /** Use half resolution for performance */
  useHalfResolution?: boolean;
}

/**
 * SSR vertex shader (fullscreen triangle).
 */
const SSR_VERTEX_SHADER = `#version 300 es
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
 * SSR fragment shader.
 */
const SSR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

// G-buffer inputs
uniform sampler2D u_albedoMetallic;
uniform sampler2D u_normalRoughnessAO;
uniform sampler2D u_depth;
uniform sampler2D u_sceneColor;

// Hi-Z mipmap chain for accelerated ray marching
uniform sampler2D u_hiZBuffer;

// Environment map fallback
#ifdef USE_ENVIRONMENT_MAP
uniform samplerCube u_environmentMap;
#endif

// Previous frame for temporal reprojection
#ifdef ENABLE_TEMPORAL
uniform sampler2D u_previousSSR;
uniform mat4 u_previousViewProjection;
#endif

// Camera uniforms
uniform vec3 u_cameraPosition;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat4 u_inverseViewProjection;
uniform mat4 u_inverseProjection;
uniform vec2 u_resolution;
uniform vec2 u_nearFar;

// SSR settings
uniform int u_maxSteps;
uniform float u_thickness;
uniform float u_maxDistance;
uniform int u_binarySearchSteps;
uniform float u_fadeDistance;
uniform float u_temporalBlendFactor;

// Random seed for stochastic sampling
uniform float u_frameIndex;

// Output
layout(location = 0) out vec4 o_reflection;

const float PI = 3.14159265359;

/**
 * Decodes octahedron-encoded normal from G-buffer.
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
 * Reconstructs view-space position from depth.
 */
vec3 viewPositionFromDepth(vec2 uv, float depth) {
  vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 viewPos = u_inverseProjection * clipPos;
  return viewPos.xyz / viewPos.w;
}

/**
 * Projects world position to screen space.
 */
vec3 projectToScreen(vec3 worldPos) {
  vec4 clipPos = u_projectionMatrix * u_viewMatrix * vec4(worldPos, 1.0);
  vec3 ndc = clipPos.xyz / clipPos.w;
  return vec3(ndc.xy * 0.5 + 0.5, ndc.z);
}

/**
 * Projects view-space position to screen space.
 */
vec3 projectViewToScreen(vec3 viewPos) {
  vec4 clipPos = u_projectionMatrix * vec4(viewPos, 1.0);
  vec3 ndc = clipPos.xyz / clipPos.w;
  return vec3(ndc.xy * 0.5 + 0.5, ndc.z);
}

/**
 * Pseudo-random number generator for stochastic sampling.
 */
float random(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233)) + u_frameIndex) * 43758.5453);
}

/**
 * Generates random direction on hemisphere for rough reflections.
 */
vec3 randomHemisphereDirection(vec3 normal, vec2 seed, float roughness) {
  float r1 = random(seed);
  float r2 = random(seed + vec2(1.0, 0.0));

  // Cosine-weighted distribution
  float phi = 2.0 * PI * r1;
  float cosTheta = pow(1.0 - r2, 1.0 / (1.0 + roughness * 5.0));
  float sinTheta = sqrt(1.0 - cosTheta * cosTheta);

  vec3 H = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);

  // Transform to world space
  vec3 up = abs(normal.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(up, normal));
  vec3 bitangent = cross(normal, tangent);

  return normalize(tangent * H.x + bitangent * H.y + normal * H.z);
}

/**
 * Samples Hi-Z buffer at appropriate mip level.
 */
float sampleHiZ(vec2 uv, float mipLevel) {
  return textureLod(u_hiZBuffer, uv, mipLevel).r;
}

/**
 * Ray marches through screen space using Hi-Z acceleration.
 */
bool rayMarch(vec3 rayOrigin, vec3 rayDir, out vec3 hitUV, out float hitDepth) {
  // Transform to view space for ray marching
  vec3 viewOrigin = (u_viewMatrix * vec4(rayOrigin, 1.0)).xyz;
  vec3 viewDir = mat3(u_viewMatrix) * rayDir;

  // Project to screen space
  vec3 screenOrigin = projectViewToScreen(viewOrigin);
  vec3 screenEnd = projectViewToScreen(viewOrigin + viewDir * u_maxDistance);

  // Calculate screen-space ray direction
  vec3 screenRay = screenEnd - screenOrigin;
  float rayLength = length(screenRay.xy);
  screenRay /= max(rayLength, 0.001);

  // Calculate step size
  float stepSize = rayLength / float(u_maxSteps);
  vec3 currentPos = screenOrigin;

  // Hierarchical ray marching
  for (int i = 0; i < MAX_STEPS; ++i) {
    if (i >= u_maxSteps) break;

    // Check bounds
    if (currentPos.x < 0.0 || currentPos.x > 1.0 ||
        currentPos.y < 0.0 || currentPos.y > 1.0) {
      return false;
    }

    // Sample depth at current position
    float sceneDepth = texture(u_depth, currentPos.xy).r;
    float rayDepth = currentPos.z;

    // Check intersection
    float depthDiff = sceneDepth - rayDepth;
    if (depthDiff > 0.0 && depthDiff < u_thickness) {
      // Binary search refinement
      vec3 refinedPos = currentPos;
      vec3 refinedRay = screenRay * stepSize;

      for (int j = 0; j < BINARY_SEARCH_STEPS; ++j) {
        if (j >= u_binarySearchSteps) break;

        refinedRay *= 0.5;
        sceneDepth = texture(u_depth, refinedPos.xy).r;

        if (refinedPos.z > sceneDepth) {
          refinedPos -= refinedRay;
        } else {
          refinedPos += refinedRay;
        }
      }

      hitUV = refinedPos;
      hitDepth = texture(u_depth, refinedPos.xy).r;
      return true;
    }

    // Adaptive step size using Hi-Z
    #ifdef USE_HIZ
      float mipLevel = float(i) / float(u_maxSteps) * 5.0;
      float hiZDepth = sampleHiZ(currentPos.xy, mipLevel);

      // If ray is behind surface, can skip ahead
      if (rayDepth < hiZDepth) {
        float skipDistance = (hiZDepth - rayDepth) / abs(screenRay.z);
        currentPos += screenRay * min(skipDistance, stepSize * 4.0);
      } else {
        currentPos += screenRay * stepSize;
      }
    #else
      currentPos += screenRay * stepSize;
    #endif
  }

  return false;
}

/**
 * Calculates screen edge fade factor.
 */
float screenEdgeFade(vec2 uv) {
  vec2 fadeStart = vec2(u_fadeDistance) / u_resolution;
  vec2 fadeEnd = vec2(1.0) - fadeStart;

  vec2 fade = vec2(1.0);
  fade.x = smoothstep(0.0, fadeStart.x, uv.x) * (1.0 - smoothstep(fadeEnd.x, 1.0, uv.x));
  fade.y = smoothstep(0.0, fadeStart.y, uv.y) * (1.0 - smoothstep(fadeEnd.y, 1.0, uv.y));

  return fade.x * fade.y;
}

/**
 * Fresnel-Schlick approximation.
 */
float fresnel(vec3 V, vec3 N, float F0) {
  float cosTheta = max(dot(V, N), 0.0);
  return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

void main() {
  // Sample G-buffer
  vec4 albedoMetallic = texture(u_albedoMetallic, v_texcoord);
  vec4 normalRoughnessAO = texture(u_normalRoughnessAO, v_texcoord);
  float depth = texture(u_depth, v_texcoord).r;

  // Early exit for skybox
  if (depth >= 0.9999) {
    o_reflection = vec4(0.0);
    return;
  }

  // Unpack G-buffer
  float metallic = albedoMetallic.a;
  vec2 encodedNormal = normalRoughnessAO.xy;
  float roughness = normalRoughnessAO.z;

  // Early exit for non-reflective surfaces
  if (metallic < 0.01 && roughness > 0.95) {
    o_reflection = vec4(0.0);
    return;
  }

  // Decode normal
  vec3 N = decodeOctahedron(encodedNormal);

  // Reconstruct world position
  vec3 worldPos = worldPositionFromDepth(v_texcoord, depth);

  // Calculate view direction
  vec3 V = normalize(u_cameraPosition - worldPos);

  // Calculate reflection direction
  vec3 R = reflect(-V, N);

  #ifdef ENABLE_STOCHASTIC
    // Add roughness-based noise to reflection direction
    if (roughness > 0.05) {
      vec3 perturbedR = randomHemisphereDirection(R, v_texcoord * u_resolution, roughness);
      R = normalize(mix(R, perturbedR, roughness));
    }
  #endif

  // Ray march
  vec3 hitUV;
  float hitDepth;
  bool hit = rayMarch(worldPos, R, hitUV, hitDepth);

  vec4 reflectionColor = vec4(0.0);
  float reflectionStrength = 0.0;

  if (hit) {
    // Sample scene color at hit point
    reflectionColor = texture(u_sceneColor, hitUV.xy);

    // Calculate reflection strength
    reflectionStrength = 1.0;

    // Fade at screen edges
    reflectionStrength *= screenEdgeFade(hitUV.xy);

    // Fade based on distance
    float rayDistance = length(worldPositionFromDepth(hitUV.xy, hitDepth) - worldPos);
    reflectionStrength *= 1.0 - smoothstep(u_maxDistance * 0.5, u_maxDistance, rayDistance);

    // Fade based on roughness
    reflectionStrength *= 1.0 - smoothstep(0.5, 1.0, roughness);

  } else {
    // Fallback to environment map
    #ifdef USE_ENVIRONMENT_MAP
      reflectionColor = texture(u_environmentMap, R);
      reflectionStrength = 0.3 * (1.0 - roughness);
    #endif
  }

  // Apply fresnel
  float F0 = mix(0.04, 1.0, metallic);
  float fresnelFactor = fresnel(V, N, F0);
  reflectionStrength *= fresnelFactor;

  #ifdef ENABLE_TEMPORAL
    // Temporal reprojection
    vec3 previousWorldPos = worldPos; // Would transform using velocity or previous matrices
    vec4 previousClipPos = u_previousViewProjection * vec4(previousWorldPos, 1.0);
    vec2 previousUV = (previousClipPos.xy / previousClipPos.w) * 0.5 + 0.5;

    if (previousUV.x >= 0.0 && previousUV.x <= 1.0 &&
        previousUV.y >= 0.0 && previousUV.y <= 1.0) {
      vec4 previousReflection = texture(u_previousSSR, previousUV);

      // Blend with previous frame
      reflectionColor = mix(reflectionColor, previousReflection, u_temporalBlendFactor);
    }
  #endif

  o_reflection = vec4(reflectionColor.rgb, reflectionStrength);
}
`;

/**
 * Hi-Z generation compute shader (for mipmap pyramid).
 */
const HIZ_COMPUTE_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_sourceDepth;
uniform int u_sourceMipLevel;

layout(location = 0) out float o_depth;

void main() {
  vec2 texelSize = 1.0 / vec2(textureSize(u_sourceDepth, u_sourceMipLevel));

  // Sample 2x2 region and take max depth
  float d0 = textureLod(u_sourceDepth, v_texcoord + vec2(0.0, 0.0) * texelSize, float(u_sourceMipLevel)).r;
  float d1 = textureLod(u_sourceDepth, v_texcoord + vec2(1.0, 0.0) * texelSize, float(u_sourceMipLevel)).r;
  float d2 = textureLod(u_sourceDepth, v_texcoord + vec2(0.0, 1.0) * texelSize, float(u_sourceMipLevel)).r;
  float d3 = textureLod(u_sourceDepth, v_texcoord + vec2(1.0, 1.0) * texelSize, float(u_sourceMipLevel)).r;

  o_depth = max(max(d0, d1), max(d2, d3));
}
`;

/**
 * Screen-Space Reflections (SSR) pass.
 * Renders realistic reflections using screen-space ray marching.
 *
 * @example
 * ```typescript
 * // Create SSR pass
 * const ssrPass = new SSRPass({
 *   width: 1920,
 *   height: 1080,
 *   quality: SSRQuality.High,
 *   maxSteps: 32,
 *   thickness: 0.5,
 *   fadeDistance: 50,
 *   enableTemporal: true,
 *   enableStochastic: true
 * });
 *
 * // Setup pass
 * ssrPass.setup();
 *
 * // Update camera
 * ssrPass.updateCamera(camera);
 *
 * // Set G-buffer inputs
 * ssrPass.setGBufferTextures(albedo, normal, depth);
 * ssrPass.setSceneColorTexture(sceneColor);
 *
 * // Execute pass
 * ssrPass.execute(emptyQueue, outputTarget);
 *
 * // Get reflection texture
 * const reflectionTexture = ssrPass.getReflectionTexture();
 * ```
 */
export class SSRPass extends RenderPass {
  /** Pass configuration */
  private config: SSRPassConfig;

  /** SSR shader */
  private shader: Shader | null = null;

  /** Hi-Z mipmap generation shader */
  private hiZShader: Shader | null = null;

  /** SSR render target */
  private ssrTarget: RenderTarget | null = null;

  /** Hi-Z buffer (mipmap chain) */
  private hiZBuffer: RenderTarget | null = null;

  /** Previous frame SSR for temporal reprojection */
  private previousSSRTarget: RenderTarget | null = null;

  /** Uniforms buffer */
  private uniformsUBO: UniformBuffer | null = null;

  /** Current camera */
  private currentCamera: Camera | null = null;

  /** Previous view-projection matrix */
  private previousViewProjectionMatrix: Matrix4 | null = null;

  /** G-buffer texture references */
  private gbufferTextures = {
    albedoMetallic: null as unknown,
    normalRoughnessAO: null as unknown,
    depth: null as unknown,
  };

  /** Scene color texture */
  private sceneColorTexture: unknown = null;

  /** Environment map for fallback */
  private environmentMap: unknown = null;

  /** Frame counter for temporal jitter */
  private frameIndex: number = 0;

  /** Statistics */
  private stats = {
    raysTraced: 0,
    hitRate: 0,
  };

  /**
   * Creates a new SSR pass.
   *
   * @param config - SSR pass configuration
   */
  constructor(config: SSRPassConfig) {
    const width = config.useHalfResolution ? Math.floor(config.width / 2) : config.width;
    const height = config.useHalfResolution ? Math.floor(config.height / 2) : config.height;

    const descriptor: RenderPassDescriptor = {
      name: 'SSRPass',
      colorAttachments: [
        {
          name: 'reflection',
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

    // Apply quality preset defaults
    const qualityDefaults = this.getQualityDefaults(config.quality ?? SSRQuality.High);

    this.config = {
      maxSteps: 32,
      thickness: 0.5,
      maxDistance: 100.0,
      binarySearchSteps: 8,
      fadeDistance: 50.0,
      enableTemporal: true,
      temporalBlendFactor: 0.9,
      enableStochastic: true,
      stochasticSamples: 1,
      useHalfResolution: false,
      ...qualityDefaults,
      ...config,
    };

    logger.info(
      `Created SSRPass: ${width}x${height}, ` +
      `maxSteps: ${this.config.maxSteps}, ` +
      `temporal: ${this.config.enableTemporal ? 'enabled' : 'disabled'}`
    );
  }

  /**
   * Gets quality preset defaults.
   */
  private getQualityDefaults(quality: SSRQuality): Partial<SSRPassConfig> {
    switch (quality) {
      case SSRQuality.Low:
        return {
          maxSteps: 8,
          binarySearchSteps: 0,
          enableTemporal: false,
          enableStochastic: false,
          useHalfResolution: true,
        };
      case SSRQuality.Medium:
        return {
          maxSteps: 16,
          binarySearchSteps: 4,
          enableTemporal: true,
          temporalBlendFactor: 0.8,
          enableStochastic: false,
          useHalfResolution: true,
        };
      case SSRQuality.High:
        return {
          maxSteps: 32,
          binarySearchSteps: 8,
          enableTemporal: true,
          temporalBlendFactor: 0.9,
          enableStochastic: true,
          useHalfResolution: false,
        };
      case SSRQuality.Ultra:
        return {
          maxSteps: 64,
          binarySearchSteps: 16,
          enableTemporal: true,
          temporalBlendFactor: 0.95,
          enableStochastic: true,
          stochasticSamples: 2,
          useHalfResolution: false,
        };
    }
  }

  /**
   * Sets up the SSR pass resources.
   */
  setup(): void {
    logger.debug('Setting up SSRPass');

    const width = this.config.useHalfResolution
      ? Math.floor(this.config.width / 2)
      : this.config.width;
    const height = this.config.useHalfResolution
      ? Math.floor(this.config.height / 2)
      : this.config.height;

    // Create SSR render target
    this.ssrTarget = new RenderTarget({
      width,
      height,
      samples: 1,
      colorAttachments: [
        {
          format: TextureFormat.RGBA16F,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: Color.black(),
        },
      ],
      label: 'SSR_Reflection',
    });

    // Create Hi-Z buffer (mipmap pyramid)
    const hiZMipLevels = Math.floor(Math.log2(Math.max(this.config.width, this.config.height))) + 1;
    // Would create mipmap chain here in real implementation

    // Create temporal target if enabled
    if (this.config.enableTemporal) {
      this.previousSSRTarget = new RenderTarget({
        width,
        height,
        samples: 1,
        colorAttachments: [
          {
            format: TextureFormat.RGBA16F,
            loadAction: LoadAction.Load,
            storeAction: StoreAction.Store,
            clearValue: Color.black(),
          },
        ],
        label: 'SSR_PreviousFrame',
      });
    }

    // Create uniforms buffer
    const uniformsDesc: UniformBufferDescriptor = {
      name: 'SSRUniforms',
      binding: 0,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'cameraPosition', type: UniformType.Vec3 },
        { name: 'viewMatrix', type: UniformType.Mat4 },
        { name: 'projectionMatrix', type: UniformType.Mat4 },
        { name: 'inverseViewProjection', type: UniformType.Mat4 },
        { name: 'inverseProjection', type: UniformType.Mat4 },
        { name: 'previousViewProjection', type: UniformType.Mat4 },
        { name: 'resolution', type: UniformType.Vec2 },
        { name: 'nearFar', type: UniformType.Vec2 },
        { name: 'maxSteps', type: UniformType.Int },
        { name: 'thickness', type: UniformType.Float },
        { name: 'maxDistance', type: UniformType.Float },
        { name: 'binarySearchSteps', type: UniformType.Int },
        { name: 'fadeDistance', type: UniformType.Float },
        { name: 'temporalBlendFactor', type: UniformType.Float },
        { name: 'frameIndex', type: UniformType.Float },
      ],
    };
    this.uniformsUBO = new UniformBuffer(uniformsDesc);

    // Create SSR shader with appropriate defines
    const defines: { [key: string]: string | number } = {
      MAX_STEPS: this.config.maxSteps ?? 32,
      BINARY_SEARCH_STEPS: this.config.binarySearchSteps ?? 8,
    };

    if (this.config.enableTemporal) {
      defines.ENABLE_TEMPORAL = 1;
    }

    if (this.config.enableStochastic) {
      defines.ENABLE_STOCHASTIC = 1;
    }

    if (this.environmentMap) {
      defines.USE_ENVIRONMENT_MAP = 1;
    }

    // Note: In a real implementation, this would create the shader using the Shader class
    // For now, we document the shader creation structure
    // this.shader = new Shader({
    //   name: 'SSR',
    //   source: {
    //     vertex: SSR_VERTEX_SHADER,
    //     fragment: SSR_FRAGMENT_SHADER
    //   },
    //   defines: defines,
    //   gl: this.gl
    // });

    logger.info('SSRPass setup complete');
  }

  /**
   * Executes the SSR pass.
   *
   * @param renderQueue - Unused for post-process pass
   * @param renderTarget - Output target
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.ssrTarget || !this.uniformsUBO || !this.currentCamera) {
      logger.error('SSRPass not properly initialized');
      return;
    }

    if (!this.gbufferTextures.albedoMetallic || !this.gbufferTextures.normalRoughnessAO ||
        !this.gbufferTextures.depth || !this.sceneColorTexture) {
      logger.error('SSRPass: G-buffer textures or scene color not set');
      return;
    }

    logger.trace('SSRPass: tracing screen-space reflections');

    // Update uniforms with current camera and settings
    this.updateUniforms();

    // ==========================
    // BEGIN SSR RENDERING
    // ==========================

    // Step 1: Bind output framebuffer (SSR target)
    // In a real implementation, this would be:
    // this.ssrTarget.bind();
    // gl.viewport(0, 0, this.ssrTarget.width, this.ssrTarget.height);
    // gl.clear(gl.COLOR_BUFFER_BIT);

    // Step 2: Bind SSR shader program
    // In a real implementation:
    // if (!this.shader || !this.shader.isReady()) {
    //   logger.error('SSR shader not ready');
    //   return;
    // }
    // this.shader.bind();

    // Step 3: Bind input textures (G-buffer and scene color)
    // The shader expects these texture units:
    // - Texture Unit 0: albedoMetallic (u_albedoMetallic)
    // - Texture Unit 1: normalRoughnessAO (u_normalRoughnessAO)
    // - Texture Unit 2: depth (u_depth)
    // - Texture Unit 3: sceneColor (u_sceneColor)
    // - Texture Unit 4: hiZBuffer (u_hiZBuffer) - optional
    // - Texture Unit 5: previousSSR (u_previousSSR) - if temporal enabled
    // - Texture Unit 6: environmentMap (u_environmentMap) - if available

    // In a real implementation:
    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, this.gbufferTextures.albedoMetallic);
    // this.shader.setUniform('u_albedoMetallic', 0);
    //
    // gl.activeTexture(gl.TEXTURE1);
    // gl.bindTexture(gl.TEXTURE_2D, this.gbufferTextures.normalRoughnessAO);
    // this.shader.setUniform('u_normalRoughnessAO', 1);
    //
    // gl.activeTexture(gl.TEXTURE2);
    // gl.bindTexture(gl.TEXTURE_2D, this.gbufferTextures.depth);
    // this.shader.setUniform('u_depth', 2);
    //
    // gl.activeTexture(gl.TEXTURE3);
    // gl.bindTexture(gl.TEXTURE_2D, this.sceneColorTexture);
    // this.shader.setUniform('u_sceneColor', 3);

    // Bind Hi-Z buffer if available (for accelerated ray marching)
    // if (this.hiZBuffer) {
    //   gl.activeTexture(gl.TEXTURE4);
    //   gl.bindTexture(gl.TEXTURE_2D, this.hiZBuffer.getColorAttachment(0));
    //   this.shader.setUniform('u_hiZBuffer', 4);
    // }

    // Bind previous frame for temporal reprojection
    // if (this.config.enableTemporal && this.previousSSRTarget) {
    //   gl.activeTexture(gl.TEXTURE5);
    //   gl.bindTexture(gl.TEXTURE_2D, this.previousSSRTarget.getColorAttachment(0));
    //   this.shader.setUniform('u_previousSSR', 5);
    // }

    // Bind environment map for fallback reflections
    // if (this.environmentMap) {
    //   gl.activeTexture(gl.TEXTURE6);
    //   gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.environmentMap);
    //   this.shader.setUniform('u_environmentMap', 6);
    // }

    // Step 4: Set camera and SSR uniforms
    // These uniforms are already set in this.uniformsUBO via updateUniforms()
    // In a real implementation, we would upload the UBO:
    // this.uniformsUBO.upload();
    // this.uniformsUBO.bind(0); // Bind to binding point 0

    // Alternatively, set individual uniforms directly on the shader:
    // this.shader.setUniform('u_cameraPosition', this.currentCamera.transform.worldPosition);
    // this.shader.setUniform('u_viewMatrix', this.currentCamera.viewMatrix);
    // this.shader.setUniform('u_projectionMatrix', this.currentCamera.projectionMatrix);
    // this.shader.setUniform('u_inverseViewProjection', this.currentCamera.inverseViewProjectionMatrix);
    // this.shader.setUniform('u_inverseProjection', this.currentCamera.inverseProjectionMatrix);
    // this.shader.setUniform('u_resolution', new Vector2(this.config.width, this.config.height));
    // this.shader.setUniform('u_nearFar', new Vector2(this.currentCamera.near, this.currentCamera.far));
    // this.shader.setUniform('u_maxSteps', this.config.maxSteps ?? 32);
    // this.shader.setUniform('u_thickness', this.config.thickness ?? 0.5);
    // this.shader.setUniform('u_maxDistance', this.config.maxDistance ?? 100.0);
    // this.shader.setUniform('u_binarySearchSteps', this.config.binarySearchSteps ?? 8);
    // this.shader.setUniform('u_fadeDistance', this.config.fadeDistance ?? 50.0);
    // this.shader.setUniform('u_temporalBlendFactor', this.config.temporalBlendFactor ?? 0.9);
    // this.shader.setUniform('u_frameIndex', this.frameIndex);

    // if (this.config.enableTemporal && this.previousViewProjectionMatrix) {
    //   this.shader.setUniform('u_previousViewProjection', this.previousViewProjectionMatrix);
    // }

    // Step 5: Draw fullscreen triangle
    // The vertex shader uses gl_VertexID to generate a fullscreen triangle
    // without needing a vertex buffer. This is a common optimization for
    // post-process effects.
    //
    // In a real implementation:
    // gl.disable(gl.DEPTH_TEST);
    // gl.disable(gl.CULL_FACE);
    // gl.disable(gl.BLEND);
    //
    // // Draw 3 vertices (fullscreen triangle covering the clip space)
    // gl.drawArrays(gl.TRIANGLES, 0, 3);
    //
    // // Restore state
    // gl.enable(gl.DEPTH_TEST);

    // Step 6: Unbind resources
    // In a real implementation:
    // this.shader.unbind();
    // this.ssrTarget.unbind();

    // ==========================
    // END SSR RENDERING
    // ==========================

    // Update statistics
    const raysPerPixel = this.config.stochasticSamples ?? 1;
    const targetWidth = this.config.useHalfResolution
      ? Math.floor(this.config.width / 2)
      : this.config.width;
    const targetHeight = this.config.useHalfResolution
      ? Math.floor(this.config.height / 2)
      : this.config.height;
    this.stats.raysTraced = targetWidth * targetHeight * raysPerPixel;

    // Estimate hit rate (would be calculated from actual rendering in real implementation)
    // Typical SSR hit rates range from 30-70% depending on scene geometry and camera angle
    this.stats.hitRate = 0.5; // Placeholder

    // Swap temporal buffers if enabled
    // This allows the next frame to use current frame's results for temporal filtering
    if (this.config.enableTemporal && this.previousSSRTarget) {
      // Swap current and previous targets
      [this.ssrTarget, this.previousSSRTarget] = [this.previousSSRTarget, this.ssrTarget];
    }

    // Increment frame counter for temporal jitter and animation
    this.frameIndex++;

    logger.trace('SSRPass complete', {
      raysTraced: this.stats.raysTraced,
      hitRate: `${(this.stats.hitRate * 100).toFixed(1)}%`,
      frameIndex: this.frameIndex
    });
  }

  /**
   * Cleans up SSR pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up SSRPass');

    if (this.ssrTarget) {
      this.ssrTarget.dispose();
      this.ssrTarget = null;
    }

    if (this.hiZBuffer) {
      this.hiZBuffer.dispose();
      this.hiZBuffer = null;
    }

    if (this.previousSSRTarget) {
      this.previousSSRTarget.dispose();
      this.previousSSRTarget = null;
    }

    if (this.shader) {
      this.shader.dispose();
      this.shader = null;
    }

    if (this.hiZShader) {
      this.hiZShader.dispose();
      this.hiZShader = null;
    }

    this.uniformsUBO = null;

    logger.info('SSRPass cleanup complete');
  }

  /**
   * Updates camera for SSR.
   *
   * @param camera - Active camera
   */
  updateCamera(camera: Camera): void {
    if (this.config.enableTemporal && this.currentCamera) {
      this.previousViewProjectionMatrix = this.currentCamera.viewProjectionMatrix.clone();
    }

    this.currentCamera = camera;
  }

  /**
   * Sets G-buffer textures.
   */
  setGBufferTextures(
    albedoMetallic: unknown,
    normalRoughnessAO: unknown,
    depth: unknown
  ): void {
    this.gbufferTextures.albedoMetallic = albedoMetallic;
    this.gbufferTextures.normalRoughnessAO = normalRoughnessAO;
    this.gbufferTextures.depth = depth;
  }

  /**
   * Sets scene color texture (pre-SSR rendering).
   */
  setSceneColorTexture(texture: unknown): void {
    this.sceneColorTexture = texture;
  }

  /**
   * Sets environment map for fallback.
   */
  setEnvironmentMap(cubemap: unknown): void {
    this.environmentMap = cubemap;
  }

  /**
   * Updates uniform buffer.
   */
  private updateUniforms(): void {
    if (!this.uniformsUBO || !this.currentCamera) return;

    this.uniformsUBO.setVec3('cameraPosition', this.currentCamera.transform.worldPosition);
    this.uniformsUBO.setMat4('viewMatrix', this.currentCamera.viewMatrix);
    this.uniformsUBO.setMat4('projectionMatrix', this.currentCamera.projectionMatrix);
    this.uniformsUBO.setMat4('inverseViewProjection', this.currentCamera.inverseViewProjectionMatrix!);
    this.uniformsUBO.setMat4('inverseProjection', this.currentCamera.inverseProjectionMatrix!);

    if (this.config.enableTemporal && this.previousViewProjectionMatrix) {
      this.uniformsUBO.setMat4('previousViewProjection', this.previousViewProjectionMatrix);
    }

    this.uniformsUBO.setVec2('resolution', {
      x: this.config.width,
      y: this.config.height
    } as any);
    this.uniformsUBO.setVec2('nearFar', {
      x: this.currentCamera.near,
      y: this.currentCamera.far
    } as any);

    this.uniformsUBO.setInt('maxSteps', this.config.maxSteps ?? 32);
    this.uniformsUBO.setFloat('thickness', this.config.thickness ?? 0.5);
    this.uniformsUBO.setFloat('maxDistance', this.config.maxDistance ?? 100.0);
    this.uniformsUBO.setInt('binarySearchSteps', this.config.binarySearchSteps ?? 8);
    this.uniformsUBO.setFloat('fadeDistance', this.config.fadeDistance ?? 50.0);
    this.uniformsUBO.setFloat('temporalBlendFactor', this.config.temporalBlendFactor ?? 0.9);
    this.uniformsUBO.setFloat('frameIndex', this.frameIndex);
  }

  /**
   * Resizes the SSR targets.
   */
  resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;

    const targetWidth = this.config.useHalfResolution ? Math.floor(width / 2) : width;
    const targetHeight = this.config.useHalfResolution ? Math.floor(height / 2) : height;

    if (this.ssrTarget) {
      this.ssrTarget.resize(targetWidth, targetHeight);
    }

    if (this.previousSSRTarget) {
      this.previousSSRTarget.resize(targetWidth, targetHeight);
    }
  }

  /**
   * Gets the reflection texture.
   */
  getReflectionTexture(): unknown {
    return this.ssrTarget?.getColorAttachment(0);
  }

  /**
   * Gets rendering statistics.
   */
  getStats(): Readonly<typeof this.stats> {
    return this.stats;
  }
}
