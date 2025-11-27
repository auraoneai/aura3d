/**
 * Screen-Space Global Illumination (SSGI) Pass for G3D rendering engine.
 *
 * Implements high-quality indirect diffuse lighting using:
 * - Screen-space ray tracing for multi-bounce GI
 * - Importance sampling based on cosine-weighted hemisphere
 * - Temporal accumulation with motion vector rejection
 * - Spatial denoising using joint bilateral filter
 * - Half-resolution tracing with intelligent upsampling
 * - Occlusion-aware sampling to reduce noise
 *
 * Performance target: < 4ms with temporal accumulation
 *
 * @module SSGIPass
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

const logger = Logger.create('SSGIPass');

/**
 * SSGI quality preset.
 */
export enum SSGIQuality {
  /** Low: 1 sample per pixel, no temporal */
  Low = 0,
  /** Medium: 2 samples, basic temporal */
  Medium = 1,
  /** High: 4 samples, full temporal + denoising */
  High = 2,
  /** Ultra: 8 samples, multi-bounce */
  Ultra = 3,
}

/**
 * SSGI pass configuration.
 */
export interface SSGIPassConfig {
  /** Target resolution width */
  width: number;
  /** Target resolution height */
  height: number;
  /** Quality preset */
  quality?: SSGIQuality;
  /** Number of ray samples per pixel */
  numSamples?: number;
  /** Maximum ray distance */
  maxDistance?: number;
  /** Ray marching steps */
  numSteps?: number;
  /** Ray thickness for intersection */
  thickness?: number;
  /** GI intensity multiplier */
  intensity?: number;
  /** Number of GI bounces */
  numBounces?: number;
  /** Enable temporal accumulation */
  enableTemporal?: boolean;
  /** Temporal blend factor */
  temporalBlendFactor?: number;
  /** Enable spatial denoising */
  enableDenoising?: boolean;
  /** Denoising kernel radius */
  denoisingRadius?: number;
  /** Use half resolution for tracing */
  useHalfResolution?: boolean;
}

/**
 * SSGI ray tracing vertex shader.
 */
const SSGI_VERTEX_SHADER = `#version 300 es
precision highp float;

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
 * SSGI ray tracing fragment shader.
 */
const SSGI_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

// G-buffer inputs
uniform sampler2D u_albedoMetallic;
uniform sampler2D u_normalRoughnessAO;
uniform sampler2D u_depth;
uniform sampler2D u_sceneColor;

// Velocity buffer for temporal reprojection
#ifdef ENABLE_TEMPORAL
uniform sampler2D u_velocity;
uniform sampler2D u_previousGI;
#endif

// Camera uniforms
uniform vec3 u_cameraPosition;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat4 u_inverseViewProjection;
uniform mat4 u_inverseProjection;
uniform vec2 u_resolution;
uniform vec2 u_nearFar;

// SSGI settings
uniform int u_numSamples;
uniform float u_maxDistance;
uniform int u_numSteps;
uniform float u_thickness;
uniform float u_intensity;
uniform int u_numBounces;
uniform float u_temporalBlendFactor;
uniform float u_frameIndex;

// Output
layout(location = 0) out vec4 o_gi;

const float PI = 3.14159265359;
const float EPSILON = 0.001;

/**
 * Decodes octahedron-encoded normal.
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
 * Reconstructs world position from depth.
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
 * Projects view-space position to screen space.
 */
vec3 projectViewToScreen(vec3 viewPos) {
  vec4 clipPos = u_projectionMatrix * vec4(viewPos, 1.0);
  vec3 ndc = clipPos.xyz / clipPos.w;
  return vec3(ndc.xy * 0.5 + 0.5, ndc.z);
}

/**
 * Pseudo-random number generator.
 */
float random(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233)) + u_frameIndex) * 43758.5453);
}

/**
 * Generates random direction on cosine-weighted hemisphere.
 */
vec3 randomCosineDirection(vec3 normal, vec2 seed) {
  float r1 = random(seed);
  float r2 = random(seed + vec2(1.0, 0.0));

  // Malley's method (cosine-weighted hemisphere sampling)
  float phi = 2.0 * PI * r1;
  float cosTheta = sqrt(r2);
  float sinTheta = sqrt(1.0 - r2);

  vec3 H = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);

  // Build tangent space
  vec3 up = abs(normal.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(up, normal));
  vec3 bitangent = cross(normal, tangent);

  // Transform to world space
  return normalize(tangent * H.x + bitangent * H.y + normal * H.z);
}

/**
 * Screen-space ray march to find intersection.
 */
bool rayMarch(vec3 rayOrigin, vec3 rayDir, float maxDist, out vec3 hitUV, out vec3 hitWorldPos) {
  // Transform to view space
  vec3 viewOrigin = (u_viewMatrix * vec4(rayOrigin, 1.0)).xyz;
  vec3 viewDir = normalize(mat3(u_viewMatrix) * rayDir);

  // Calculate end point
  vec3 viewEnd = viewOrigin + viewDir * maxDist;

  // Project to screen space
  vec3 screenOrigin = projectViewToScreen(viewOrigin);
  vec3 screenEnd = projectViewToScreen(viewEnd);

  // Calculate ray in screen space
  vec3 screenRay = screenEnd - screenOrigin;
  float rayLength = length(screenRay.xy);

  if (rayLength < EPSILON) {
    return false;
  }

  screenRay /= rayLength;

  // Step along ray
  float stepSize = rayLength / float(u_numSteps);
  vec3 currentPos = screenOrigin;

  for (int i = 0; i < MAX_STEPS; ++i) {
    if (i >= u_numSteps) break;

    currentPos += screenRay * stepSize;

    // Check bounds
    if (currentPos.x < 0.0 || currentPos.x > 1.0 ||
        currentPos.y < 0.0 || currentPos.y > 1.0 ||
        currentPos.z < 0.0 || currentPos.z > 1.0) {
      return false;
    }

    // Sample depth
    float sceneDepth = texture(u_depth, currentPos.xy).r;
    float rayDepth = currentPos.z;

    // Check intersection
    float depthDiff = sceneDepth - rayDepth;
    if (depthDiff > 0.0 && depthDiff < u_thickness) {
      hitUV = currentPos;
      hitWorldPos = worldPositionFromDepth(currentPos.xy, sceneDepth);
      return true;
    }
  }

  return false;
}

/**
 * Computes indirect lighting contribution from a single ray.
 */
vec3 computeIndirectLight(vec3 worldPos, vec3 normal, vec3 albedo, vec2 seed) {
  // Generate random direction on hemisphere
  vec3 rayDir = randomCosineDirection(normal, seed);

  // Ray march to find intersection
  vec3 hitUV;
  vec3 hitWorldPos;
  bool hit = rayMarch(worldPos, rayDir, u_maxDistance, hitUV, hitWorldPos);

  if (!hit) {
    // Sky contribution (could sample skybox here)
    return vec3(0.1, 0.15, 0.2) * 0.5;
  }

  // Sample hit point color and properties
  vec4 hitAlbedoMetallic = texture(u_albedoMetallic, hitUV.xy);
  vec4 hitNormalRoughnessAO = texture(u_normalRoughnessAO, hitUV.xy);
  vec3 hitSceneColor = texture(u_sceneColor, hitUV.xy).rgb;

  vec3 hitAlbedo = hitAlbedoMetallic.rgb;
  vec3 hitNormal = decodeOctahedron(hitNormalRoughnessAO.xy);
  float hitAO = hitNormalRoughnessAO.w;

  // Calculate indirect lighting
  vec3 lightDir = normalize(hitWorldPos - worldPos);
  float NdotL = max(dot(normal, lightDir), 0.0);

  // Combine hit point radiance with distance falloff
  float distance = length(hitWorldPos - worldPos);
  float attenuation = 1.0 / (1.0 + distance * distance * 0.01);

  // Include hit point's scene color (direct + indirect)
  vec3 radiance = hitSceneColor * hitAO * attenuation;

  // Multi-bounce approximation
  #ifdef MULTI_BOUNCE
  if (u_numBounces > 1) {
    // Simple multi-bounce approximation using albedo
    radiance *= hitAlbedo;
  }
  #endif

  return radiance * NdotL * albedo / PI;
}

/**
 * Computes screen-space global illumination.
 */
vec3 computeSSGI(vec3 worldPos, vec3 normal, vec3 albedo, float ao) {
  vec3 gi = vec3(0.0);

  // Accumulate samples
  for (int i = 0; i < MAX_SAMPLES; ++i) {
    if (i >= u_numSamples) break;

    vec2 seed = v_texcoord * u_resolution + vec2(float(i), u_frameIndex);
    gi += computeIndirectLight(worldPos, normal, albedo, seed);
  }

  // Average samples
  gi /= float(u_numSamples);

  // Apply AO to reduce GI in occluded areas
  gi *= ao;

  // Apply intensity
  gi *= u_intensity;

  return gi;
}

/**
 * Temporal reprojection with motion vector rejection.
 */
vec3 temporalReproject(vec3 currentGI, vec2 uv) {
  #ifdef ENABLE_TEMPORAL
    // Sample velocity
    vec2 velocity = texture(u_velocity, uv).xy;
    vec2 previousUV = uv - velocity;

    // Check if previous sample is valid
    if (previousUV.x >= 0.0 && previousUV.x <= 1.0 &&
        previousUV.y >= 0.0 && previousUV.y <= 1.0) {

      vec3 previousGI = texture(u_previousGI, previousUV).rgb;

      // Neighborhood clamping to prevent ghosting
      vec3 minColor = currentGI;
      vec3 maxColor = currentGI;

      // Sample 3x3 neighborhood
      for (int x = -1; x <= 1; ++x) {
        for (int y = -1; y <= 1; ++y) {
          vec2 offset = vec2(float(x), float(y)) / u_resolution;
          vec3 neighborGI = texture(u_previousGI, uv + offset).rgb;
          minColor = min(minColor, neighborGI);
          maxColor = max(maxColor, neighborGI);
        }
      }

      // Clamp previous frame to neighborhood
      previousGI = clamp(previousGI, minColor, maxColor);

      // Blend with temporal history
      return mix(currentGI, previousGI, u_temporalBlendFactor);
    }
  #endif

  return currentGI;
}

void main() {
  // Sample G-buffer
  vec4 albedoMetallic = texture(u_albedoMetallic, v_texcoord);
  vec4 normalRoughnessAO = texture(u_normalRoughnessAO, v_texcoord);
  float depth = texture(u_depth, v_texcoord).r;

  // Early exit for skybox
  if (depth >= 0.9999) {
    o_gi = vec4(0.0);
    return;
  }

  // Unpack G-buffer
  vec3 albedo = albedoMetallic.rgb;
  float metallic = albedoMetallic.a;
  vec2 encodedNormal = normalRoughnessAO.xy;
  float roughness = normalRoughnessAO.z;
  float ao = normalRoughnessAO.w;

  // Skip for highly metallic surfaces (they use reflections, not diffuse GI)
  if (metallic > 0.9) {
    o_gi = vec4(0.0);
    return;
  }

  // Decode normal
  vec3 normal = decodeOctahedron(encodedNormal);

  // Reconstruct world position
  vec3 worldPos = worldPositionFromDepth(v_texcoord, depth);

  // Compute SSGI
  vec3 gi = computeSSGI(worldPos, normal, albedo, ao);

  // Temporal reprojection
  gi = temporalReproject(gi, v_texcoord);

  o_gi = vec4(gi, 1.0);
}
`;

/**
 * Spatial denoising fragment shader (joint bilateral filter).
 */
const SSGI_DENOISE_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_giInput;
uniform sampler2D u_normalRoughnessAO;
uniform sampler2D u_depth;
uniform vec2 u_resolution;
uniform int u_radius;

layout(location = 0) out vec4 o_denoisedGI;

/**
 * Decodes octahedron-encoded normal.
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
 * Joint bilateral filter for edge-preserving denoising.
 */
vec3 bilateralFilter() {
  vec3 centerColor = texture(u_giInput, v_texcoord).rgb;
  float centerDepth = texture(u_depth, v_texcoord).r;
  vec3 centerNormal = decodeOctahedron(texture(u_normalRoughnessAO, v_texcoord).xy);

  vec3 sum = vec3(0.0);
  float weightSum = 0.0;

  float sigmaColor = 0.3;
  float sigmaDepth = 0.01;
  float sigmaNormal = 0.5;

  for (int x = -DENOISE_RADIUS; x <= DENOISE_RADIUS; ++x) {
    for (int y = -DENOISE_RADIUS; y <= DENOISE_RADIUS; ++y) {
      if (abs(x) > u_radius || abs(y) > u_radius) continue;

      vec2 offset = vec2(float(x), float(y)) / u_resolution;
      vec2 sampleUV = v_texcoord + offset;

      // Sample neighbor
      vec3 sampleColor = texture(u_giInput, sampleUV).rgb;
      float sampleDepth = texture(u_depth, sampleUV).r;
      vec3 sampleNormal = decodeOctahedron(texture(u_normalRoughnessAO, sampleUV).xy);

      // Calculate weights
      float colorDist = length(sampleColor - centerColor);
      float depthDist = abs(sampleDepth - centerDepth);
      float normalDist = 1.0 - max(dot(sampleNormal, centerNormal), 0.0);

      float colorWeight = exp(-colorDist * colorDist / (2.0 * sigmaColor * sigmaColor));
      float depthWeight = exp(-depthDist * depthDist / (2.0 * sigmaDepth * sigmaDepth));
      float normalWeight = exp(-normalDist * normalDist / (2.0 * sigmaNormal * sigmaNormal));

      float weight = colorWeight * depthWeight * normalWeight;

      sum += sampleColor * weight;
      weightSum += weight;
    }
  }

  return sum / max(weightSum, 0.0001);
}

void main() {
  vec3 denoisedGI = bilateralFilter();
  o_denoisedGI = vec4(denoisedGI, 1.0);
}
`;

/**
 * Screen-Space Global Illumination pass.
 * Computes indirect diffuse lighting using screen-space ray tracing.
 *
 * @example
 * ```typescript
 * // Create SSGI pass
 * const ssgiPass = new SSGIPass({
 *   width: 1920,
 *   height: 1080,
 *   quality: SSGIQuality.High,
 *   numSamples: 4,
 *   maxDistance: 50.0,
 *   intensity: 1.5,
 *   enableTemporal: true,
 *   enableDenoising: true
 * });
 *
 * // Setup pass
 * ssgiPass.setup();
 *
 * // Update camera
 * ssgiPass.updateCamera(camera);
 *
 * // Set inputs
 * ssgiPass.setGBufferTextures(albedo, normal, depth);
 * ssgiPass.setSceneColorTexture(sceneColor);
 * ssgiPass.setVelocityTexture(velocity);
 *
 * // Execute pass
 * ssgiPass.execute(emptyQueue, outputTarget);
 *
 * // Get GI texture
 * const giTexture = ssgiPass.getGITexture();
 * ```
 */
export class SSGIPass extends RenderPass {
  /** Pass configuration */
  private config: SSGIPassConfig;

  /** Ray tracing shader */
  private rayTracingShader: Shader | null = null;

  /** Denoising shader */
  private denoisingShader: Shader | null = null;

  /** SSGI render target (raw) */
  private ssgiTarget: RenderTarget | null = null;

  /** Denoised SSGI target */
  private denoisedTarget: RenderTarget | null = null;

  /** Previous frame for temporal accumulation */
  private previousGITarget: RenderTarget | null = null;

  /** Uniforms buffer */
  private uniformsUBO: UniformBuffer | null = null;

  /** Current camera */
  private currentCamera: Camera | null = null;

  /** G-buffer textures */
  private gbufferTextures = {
    albedoMetallic: null as unknown,
    normalRoughnessAO: null as unknown,
    depth: null as unknown,
  };

  /** Scene color texture */
  private sceneColorTexture: unknown = null;

  /** Velocity texture for temporal reprojection */
  private velocityTexture: unknown = null;

  /** Frame counter */
  private frameIndex: number = 0;

  /** WebGL2 rendering context */
  private gl: WebGL2RenderingContext | null = null;

  /** Statistics */
  private stats = {
    raysTraced: 0,
    samplesPerPixel: 0,
  };

  /**
   * Creates a new SSGI pass.
   *
   * @param config - SSGI pass configuration
   */
  constructor(config: SSGIPassConfig) {
    const width = config.useHalfResolution ? Math.floor(config.width / 2) : config.width;
    const height = config.useHalfResolution ? Math.floor(config.height / 2) : config.height;

    const descriptor: RenderPassDescriptor = {
      name: 'SSGIPass',
      colorAttachments: [
        {
          name: 'gi',
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

    // Apply quality preset
    const qualityDefaults = this.getQualityDefaults(config.quality ?? SSGIQuality.High);

    this.config = {
      numSamples: 4,
      maxDistance: 50.0,
      numSteps: 16,
      thickness: 0.5,
      intensity: 1.0,
      numBounces: 1,
      enableTemporal: true,
      temporalBlendFactor: 0.9,
      enableDenoising: true,
      denoisingRadius: 2,
      useHalfResolution: true,
      ...qualityDefaults,
      ...config,
    };

    logger.info(
      `Created SSGIPass: ${width}x${height}, ` +
      `samples: ${this.config.numSamples}, ` +
      `bounces: ${this.config.numBounces}, ` +
      `temporal: ${this.config.enableTemporal ? 'enabled' : 'disabled'}`
    );
  }

  /**
   * Gets quality preset defaults.
   */
  private getQualityDefaults(quality: SSGIQuality): Partial<SSGIPassConfig> {
    switch (quality) {
      case SSGIQuality.Low:
        return {
          numSamples: 1,
          numSteps: 8,
          numBounces: 1,
          enableTemporal: false,
          enableDenoising: false,
          useHalfResolution: true,
        };
      case SSGIQuality.Medium:
        return {
          numSamples: 2,
          numSteps: 12,
          numBounces: 1,
          enableTemporal: true,
          temporalBlendFactor: 0.85,
          enableDenoising: true,
          denoisingRadius: 1,
          useHalfResolution: true,
        };
      case SSGIQuality.High:
        return {
          numSamples: 4,
          numSteps: 16,
          numBounces: 1,
          enableTemporal: true,
          temporalBlendFactor: 0.9,
          enableDenoising: true,
          denoisingRadius: 2,
          useHalfResolution: true,
        };
      case SSGIQuality.Ultra:
        return {
          numSamples: 8,
          numSteps: 24,
          numBounces: 2,
          enableTemporal: true,
          temporalBlendFactor: 0.95,
          enableDenoising: true,
          denoisingRadius: 3,
          useHalfResolution: false,
        };
    }
  }

  /**
   * Sets up the SSGI pass resources.
   */
  setup(): void {
    logger.debug('Setting up SSGIPass');

    const width = this.config.useHalfResolution
      ? Math.floor(this.config.width / 2)
      : this.config.width;
    const height = this.config.useHalfResolution
      ? Math.floor(this.config.height / 2)
      : this.config.height;

    // Create SSGI render target (raw)
    this.ssgiTarget = new RenderTarget({
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
      label: 'SSGI_Raw',
    });

    // Create denoised target if denoising enabled
    if (this.config.enableDenoising) {
      this.denoisedTarget = new RenderTarget({
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
        label: 'SSGI_Denoised',
      });
    }

    // Create temporal target if enabled
    if (this.config.enableTemporal) {
      this.previousGITarget = new RenderTarget({
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
        label: 'SSGI_Previous',
      });
    }

    // Create uniforms buffer
    const uniformsDesc: UniformBufferDescriptor = {
      name: 'SSGIUniforms',
      binding: 0,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'cameraPosition', type: UniformType.Vec3 },
        { name: 'viewMatrix', type: UniformType.Mat4 },
        { name: 'projectionMatrix', type: UniformType.Mat4 },
        { name: 'inverseViewProjection', type: UniformType.Mat4 },
        { name: 'inverseProjection', type: UniformType.Mat4 },
        { name: 'resolution', type: UniformType.Vec2 },
        { name: 'nearFar', type: UniformType.Vec2 },
        { name: 'numSamples', type: UniformType.Int },
        { name: 'maxDistance', type: UniformType.Float },
        { name: 'numSteps', type: UniformType.Int },
        { name: 'thickness', type: UniformType.Float },
        { name: 'intensity', type: UniformType.Float },
        { name: 'numBounces', type: UniformType.Int },
        { name: 'temporalBlendFactor', type: UniformType.Float },
        { name: 'frameIndex', type: UniformType.Float },
        { name: 'denoisingRadius', type: UniformType.Int },
      ],
    };
    this.uniformsUBO = new UniformBuffer(uniformsDesc);

    logger.info('SSGIPass setup complete');
  }

  /**
   * Executes the SSGI pass.
   *
   * @param renderQueue - Unused
   * @param renderTarget - Output target
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.ssgiTarget || !this.uniformsUBO || !this.currentCamera || !this.gl) {
      logger.error('SSGIPass not properly initialized');
      return;
    }

    if (!this.gbufferTextures.albedoMetallic || !this.gbufferTextures.normalRoughnessAO ||
        !this.gbufferTextures.depth || !this.sceneColorTexture) {
      logger.error('SSGIPass: missing required input textures');
      return;
    }

    logger.trace('SSGIPass: computing global illumination');

    // Create shaders if needed
    if (!this.rayTracingShader) {
      this.createRayTracingShader();
    }

    if (this.config.enableDenoising && !this.denoisingShader) {
      this.createDenoisingShader();
    }

    if (!this.rayTracingShader || !this.rayTracingShader.isReady) {
      logger.error('SSGIPass: failed to create ray tracing shader');
      return;
    }

    // Update uniforms
    this.updateUniforms();

    const gl = this.gl;
    const ssgiFramebuffer = (this.ssgiTarget as any).getFramebuffer();

    // Pass 1: Ray tracing pass - compute SSGI
    gl.bindFramebuffer(gl.FRAMEBUFFER, ssgiFramebuffer || null);
    gl.viewport(0, 0, this.ssgiTarget.width, this.ssgiTarget.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Disable depth testing for fullscreen pass
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    // Bind ray tracing shader
    this.rayTracingShader.bind();

    // Bind G-buffer textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.gbufferTextures.albedoMetallic as WebGLTexture);
    this.rayTracingShader.setUniform('u_albedoMetallic', 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.gbufferTextures.normalRoughnessAO as WebGLTexture);
    this.rayTracingShader.setUniform('u_normalRoughnessAO', 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.gbufferTextures.depth as WebGLTexture);
    this.rayTracingShader.setUniform('u_depth', 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneColorTexture as WebGLTexture);
    this.rayTracingShader.setUniform('u_sceneColor', 3);

    // Bind temporal textures if enabled
    if (this.config.enableTemporal && this.previousGITarget && this.velocityTexture) {
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture as WebGLTexture);
      this.rayTracingShader.setUniform('u_velocity', 4);

      gl.activeTexture(gl.TEXTURE5);
      const previousAttachment = this.previousGITarget.getColorAttachment(0);
      if (previousAttachment) {
        gl.bindTexture(gl.TEXTURE_2D, previousAttachment as WebGLTexture);
        this.rayTracingShader.setUniform('u_previousGI', 5);
      }
    }

    // Set camera uniforms
    this.rayTracingShader.setUniform('u_cameraPosition', this.currentCamera.transform.worldPosition);
    this.rayTracingShader.setUniform('u_viewMatrix', this.currentCamera.viewMatrix);
    this.rayTracingShader.setUniform('u_projectionMatrix', this.currentCamera.projectionMatrix);

    if (this.currentCamera.inverseViewProjectionMatrix) {
      this.rayTracingShader.setUniform('u_inverseViewProjection', this.currentCamera.inverseViewProjectionMatrix);
    }

    if (this.currentCamera.inverseProjectionMatrix) {
      this.rayTracingShader.setUniform('u_inverseProjection', this.currentCamera.inverseProjectionMatrix);
    }

    // Set SSGI parameters
    this.rayTracingShader.setUniform('u_resolution', new Vector2(this.config.width, this.config.height));
    this.rayTracingShader.setUniform('u_nearFar', new Vector2(this.currentCamera.near, this.currentCamera.far));
    this.rayTracingShader.setUniform('u_numSamples', this.config.numSamples ?? 4);
    this.rayTracingShader.setUniform('u_maxDistance', this.config.maxDistance ?? 50.0);
    this.rayTracingShader.setUniform('u_numSteps', this.config.numSteps ?? 16);
    this.rayTracingShader.setUniform('u_thickness', this.config.thickness ?? 0.5);
    this.rayTracingShader.setUniform('u_intensity', this.config.intensity ?? 1.0);
    this.rayTracingShader.setUniform('u_numBounces', this.config.numBounces ?? 1);
    this.rayTracingShader.setUniform('u_temporalBlendFactor', this.config.temporalBlendFactor ?? 0.9);
    this.rayTracingShader.setUniform('u_frameIndex', this.frameIndex);

    // Draw fullscreen triangle
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Pass 2: Denoising pass if enabled
    let finalGITarget = this.ssgiTarget;
    if (this.config.enableDenoising && this.denoisedTarget && this.denoisingShader && this.denoisingShader.isReady) {
      const denoisedFramebuffer = (this.denoisedTarget as any).getFramebuffer();

      gl.bindFramebuffer(gl.FRAMEBUFFER, denoisedFramebuffer || null);
      gl.viewport(0, 0, this.denoisedTarget.width, this.denoisedTarget.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      this.denoisingShader.bind();

      // Bind inputs
      gl.activeTexture(gl.TEXTURE0);
      const giInputAttachment = this.ssgiTarget.getColorAttachment(0);
      if (giInputAttachment) {
        gl.bindTexture(gl.TEXTURE_2D, giInputAttachment as WebGLTexture);
        this.denoisingShader.setUniform('u_giInput', 0);
      }

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.gbufferTextures.normalRoughnessAO as WebGLTexture);
      this.denoisingShader.setUniform('u_normalRoughnessAO', 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.gbufferTextures.depth as WebGLTexture);
      this.denoisingShader.setUniform('u_depth', 2);

      const denoisingResolution = new Vector2(
        this.config.useHalfResolution ? Math.floor(this.config.width / 2) : this.config.width,
        this.config.useHalfResolution ? Math.floor(this.config.height / 2) : this.config.height
      );
      this.denoisingShader.setUniform('u_resolution', denoisingResolution);
      this.denoisingShader.setUniform('u_radius', this.config.denoisingRadius ?? 2);

      // Draw fullscreen triangle
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Unbind framebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      finalGITarget = this.denoisedTarget;
    }

    // Restore state
    gl.enable(gl.DEPTH_TEST);

    // Swap temporal buffers if enabled
    if (this.config.enableTemporal && this.previousGITarget) {
      [this.ssgiTarget, this.previousGITarget] = [this.previousGITarget, this.ssgiTarget];
    }

    // Update statistics
    this.stats.samplesPerPixel = this.config.numSamples ?? 4;
    this.stats.raysTraced =
      this.stats.samplesPerPixel *
      (this.config.useHalfResolution
        ? Math.floor(this.config.width / 2) * Math.floor(this.config.height / 2)
        : this.config.width * this.config.height);

    this.frameIndex++;

    logger.trace('SSGIPass complete');
  }

  /**
   * Creates the ray tracing shader with appropriate defines.
   */
  private createRayTracingShader(): void {
    const defines: { [key: string]: string | number } = {
      MAX_SAMPLES: this.config.numSamples ?? 4,
      MAX_STEPS: this.config.numSteps ?? 16,
    };

    if (this.config.enableTemporal) {
      defines.ENABLE_TEMPORAL = 1;
    }

    if (this.config.numBounces && this.config.numBounces > 1) {
      defines.MULTI_BOUNCE = 1;
    }

    const source: ShaderSource = {
      vertex: SSGI_VERTEX_SHADER,
      fragment: SSGI_FRAGMENT_SHADER,
    };

    this.rayTracingShader = new Shader({
      name: 'SSGI_RayTracing',
      source,
      defines,
    });

    logger.debug('Created SSGI ray tracing shader');
  }

  /**
   * Creates the denoising shader.
   */
  private createDenoisingShader(): void {
    const defines: { [key: string]: string | number } = {
      DENOISE_RADIUS: this.config.denoisingRadius ?? 2,
    };

    const source: ShaderSource = {
      vertex: SSGI_VERTEX_SHADER,
      fragment: SSGI_DENOISE_SHADER,
    };

    this.denoisingShader = new Shader({
      name: 'SSGI_Denoise',
      source,
      defines,
    });

    logger.debug('Created SSGI denoising shader');
  }

  /**
   * Cleans up SSGI pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up SSGIPass');

    if (this.ssgiTarget && this.gl) {
      this.ssgiTarget.dispose(this.gl);
      this.ssgiTarget = null;
    }

    if (this.denoisedTarget && this.gl) {
      this.denoisedTarget.dispose(this.gl);
      this.denoisedTarget = null;
    }

    if (this.previousGITarget && this.gl) {
      this.previousGITarget.dispose(this.gl);
      this.previousGITarget = null;
    }

    if (this.rayTracingShader) {
      this.rayTracingShader.dispose();
      this.rayTracingShader = null;
    }

    if (this.denoisingShader) {
      this.denoisingShader.dispose();
      this.denoisingShader = null;
    }

    this.uniformsUBO = null;
    this.gl = null;

    logger.info('SSGIPass cleanup complete');
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
   * Updates camera for SSGI.
   *
   * @param camera - Active camera
   */
  updateCamera(camera: Camera): void {
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
   * Sets scene color texture.
   */
  setSceneColorTexture(texture: unknown): void {
    this.sceneColorTexture = texture;
  }

  /**
   * Sets velocity texture for temporal reprojection.
   */
  setVelocityTexture(texture: unknown): void {
    this.velocityTexture = texture;
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

    this.uniformsUBO.setVec2('resolution', {
      x: this.config.width,
      y: this.config.height
    } as any);
    this.uniformsUBO.setVec2('nearFar', {
      x: this.currentCamera.near,
      y: this.currentCamera.far
    } as any);

    this.uniformsUBO.setInt('numSamples', this.config.numSamples ?? 4);
    this.uniformsUBO.setFloat('maxDistance', this.config.maxDistance ?? 50.0);
    this.uniformsUBO.setInt('numSteps', this.config.numSteps ?? 16);
    this.uniformsUBO.setFloat('thickness', this.config.thickness ?? 0.5);
    this.uniformsUBO.setFloat('intensity', this.config.intensity ?? 1.0);
    this.uniformsUBO.setInt('numBounces', this.config.numBounces ?? 1);
    this.uniformsUBO.setFloat('temporalBlendFactor', this.config.temporalBlendFactor ?? 0.9);
    this.uniformsUBO.setFloat('frameIndex', this.frameIndex);
    this.uniformsUBO.setInt('denoisingRadius', this.config.denoisingRadius ?? 2);
  }

  /**
   * Resizes the SSGI targets.
   */
  resize(width: number, height: number): void {
    if (!this.gl) {
      logger.warn('Cannot resize SSGI targets without GL context');
      return;
    }

    this.config.width = width;
    this.config.height = height;

    const targetWidth = this.config.useHalfResolution ? Math.floor(width / 2) : width;
    const targetHeight = this.config.useHalfResolution ? Math.floor(height / 2) : height;

    if (this.ssgiTarget) {
      this.ssgiTarget.resize(this.gl, targetWidth, targetHeight);
    }

    if (this.denoisedTarget) {
      this.denoisedTarget.resize(this.gl, targetWidth, targetHeight);
    }

    if (this.previousGITarget) {
      this.previousGITarget.resize(this.gl, targetWidth, targetHeight);
    }
  }

  /**
   * Gets the GI texture (denoised if available, otherwise raw).
   */
  getGITexture(): unknown {
    if (this.config.enableDenoising && this.denoisedTarget) {
      return this.denoisedTarget.getColorAttachment(0);
    }
    return this.ssgiTarget?.getColorAttachment(0);
  }

  /**
   * Gets rendering statistics.
   */
  getStats(): Readonly<typeof this.stats> {
    return this.stats;
  }
}
