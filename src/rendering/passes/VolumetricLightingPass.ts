/**
 * Volumetric Lighting Pass for G3D rendering engine.
 *
 * Implements volumetric fog and light shafts using:
 * - Froxel-based volumetric rendering (3D grid in view frustum)
 * - Ray marching through volume with distance-based step size
 * - In-scattering from all light sources (directional, point, spot)
 * - Height-based fog density with exponential falloff
 * - Temporal reprojection for temporal stability and noise reduction
 * - God rays / crepuscular rays effect
 * - Shadow map integration for volumetric shadows
 *
 * Performance target: < 3ms at 1080p
 *
 * @module VolumetricLightingPass
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
import { Vector3 } from '../../math/Vector3';

const logger = Logger.create('VolumetricLightingPass');

/**
 * Volumetric lighting quality preset.
 */
export enum VolumetricQuality {
  /** Low: 32 depth slices, 8 march steps */
  Low = 0,
  /** Medium: 64 depth slices, 16 march steps */
  Medium = 1,
  /** High: 128 depth slices, 32 march steps */
  High = 2,
}

/**
 * Volumetric lighting configuration.
 */
export interface VolumetricLightingConfig {
  /** Target resolution width */
  width: number;
  /** Target resolution height */
  height: number;
  /** Quality preset */
  quality?: VolumetricQuality;
  /** Number of depth slices (froxels) */
  depthSlices?: number;
  /** Number of ray marching steps */
  numSteps?: number;
  /** Fog density multiplier */
  fogDensity?: number;
  /** Fog color */
  fogColor?: Color;
  /** Fog start height (world space) */
  fogHeightStart?: number;
  /** Fog height falloff rate */
  fogHeightFalloff?: number;
  /** Scattering coefficient */
  scattering?: number;
  /** Extinction coefficient (absorption + out-scattering) */
  extinction?: number;
  /** Phase function anisotropy (-1 to 1) */
  anisotropy?: number;
  /** Maximum ray distance */
  maxDistance?: number;
  /** Enable temporal reprojection */
  enableTemporal?: boolean;
  /** Temporal blend factor */
  temporalBlendFactor?: number;
  /** Use half resolution for performance */
  useHalfResolution?: boolean;
}

/**
 * Volumetric lighting vertex shader.
 */
const VOLUMETRIC_VERTEX_SHADER = `#version 300 es
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
 * Volumetric lighting fragment shader.
 */
const VOLUMETRIC_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

// Depth buffer for ray termination
uniform sampler2D u_depth;

// Shadow maps
#ifdef USE_SHADOWS
uniform sampler2D u_shadowMap0;
uniform mat4 u_shadowMatrix0;
#endif

// Previous frame for temporal reprojection
#ifdef ENABLE_TEMPORAL
uniform sampler2D u_previousVolume;
uniform mat4 u_previousViewProjection;
#endif

// Camera uniforms
uniform vec3 u_cameraPosition;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat4 u_inverseViewProjection;
uniform vec2 u_nearFar;

// Volumetric settings
uniform int u_numSteps;
uniform float u_fogDensity;
uniform vec3 u_fogColor;
uniform float u_fogHeightStart;
uniform float u_fogHeightFalloff;
uniform float u_scattering;
uniform float u_extinction;
uniform float u_anisotropy;
uniform float u_maxDistance;
uniform float u_temporalBlendFactor;

// Light uniforms
uniform int u_lightCount;

struct Light {
  vec4 positionType;      // xyz = position, w = type (0=directional, 1=point, 2=spot)
  vec4 directionRange;    // xyz = direction, w = range
  vec4 colorIntensity;    // rgb = color, a = intensity
  vec4 spotAngles;        // x = inner angle, y = outer angle
};

uniform Light u_lights[MAX_LIGHTS];

// Output
layout(location = 0) out vec4 o_volumetric;

const float PI = 3.14159265359;

/**
 * Reconstructs world position from depth.
 */
vec3 worldPositionFromDepth(vec2 uv, float depth) {
  vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 worldPos = u_inverseViewProjection * clipPos;
  return worldPos.xyz / worldPos.w;
}

/**
 * Calculates fog density at world position (height-based).
 */
float getFogDensity(vec3 worldPos) {
  // Height-based exponential falloff
  float height = worldPos.y - u_fogHeightStart;
  float heightFactor = exp(-max(height, 0.0) * u_fogHeightFalloff);

  return u_fogDensity * heightFactor;
}

/**
 * Henyey-Greenstein phase function for anisotropic scattering.
 */
float phaseFunction(float cosTheta, float g) {
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * PI * pow(denom, 1.5));
}

/**
 * Calculates light attenuation for point/spot lights.
 */
float calculateAttenuation(float distance, float range) {
  float attenuation = 1.0 / (distance * distance + 1.0);
  float cutoff = distance / range;
  cutoff = 1.0 - cutoff * cutoff;
  cutoff = max(cutoff, 0.0);
  cutoff = cutoff * cutoff;
  return attenuation * cutoff;
}

/**
 * Calculates spot light cone attenuation.
 */
float calculateSpotAttenuation(vec3 L, vec3 lightDir, float innerAngle, float outerAngle) {
  float cosOuter = cos(outerAngle);
  float cosInner = cos(innerAngle);
  float cosAngle = dot(-L, lightDir);
  float spotEffect = smoothstep(cosOuter, cosInner, cosAngle);
  return spotEffect;
}

/**
 * Samples shadow map to check if point is in shadow.
 */
float sampleShadow(vec3 worldPos) {
  #ifdef USE_SHADOWS
    vec4 shadowCoord = u_shadowMatrix0 * vec4(worldPos, 1.0);
    vec3 projCoords = shadowCoord.xyz / shadowCoord.w;
    projCoords = projCoords * 0.5 + 0.5;

    if (projCoords.z > 1.0) return 1.0;

    float currentDepth = projCoords.z;
    float closestDepth = texture(u_shadowMap0, projCoords.xy).r;

    return currentDepth > closestDepth + 0.005 ? 0.0 : 1.0;
  #else
    return 1.0;
  #endif
}

/**
 * Calculates in-scattering contribution from a single light.
 */
vec3 calculateInScattering(vec3 worldPos, vec3 viewDir, Light light) {
  int lightType = int(light.positionType.w);
  vec3 L;
  float attenuation = 1.0;

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
    float spotAttenuation = calculateSpotAttenuation(L, light.directionRange.xyz,
                                                     light.spotAngles.x, light.spotAngles.y);
    attenuation = distAttenuation * spotAttenuation;
  }

  // Calculate phase function
  float cosTheta = dot(viewDir, L);
  float phase = phaseFunction(cosTheta, u_anisotropy);

  // Sample shadow
  float shadow = sampleShadow(worldPos);

  // Calculate in-scattering
  vec3 lightColor = light.colorIntensity.rgb * light.colorIntensity.a;
  vec3 inscattering = lightColor * phase * attenuation * shadow * u_scattering;

  return inscattering;
}

/**
 * Ray marches through volume to accumulate fog and light shafts.
 */
vec4 rayMarchVolume(vec3 rayOrigin, vec3 rayDir, float maxDist) {
  vec3 accumulated = vec3(0.0);
  float transmittance = 1.0;

  // Calculate step size
  float stepSize = maxDist / float(u_numSteps);

  // March through volume
  for (int i = 0; i < MAX_STEPS; ++i) {
    if (i >= u_numSteps) break;

    // Calculate sample position
    float t = float(i) * stepSize + stepSize * 0.5;
    vec3 samplePos = rayOrigin + rayDir * t;

    // Get fog density at sample point
    float density = getFogDensity(samplePos);

    if (density > 0.001) {
      // Calculate in-scattering from all lights
      vec3 inscattering = vec3(0.0);
      for (int j = 0; j < MAX_LIGHTS; ++j) {
        if (j >= u_lightCount) break;
        inscattering += calculateInScattering(samplePos, rayDir, u_lights[j]);
      }

      // Add ambient fog color
      inscattering += u_fogColor * density * 0.1;

      // Accumulate lighting
      float stepTransmittance = exp(-density * u_extinction * stepSize);
      accumulated += inscattering * transmittance * (1.0 - stepTransmittance);
      transmittance *= stepTransmittance;

      // Early exit if transmittance is very low
      if (transmittance < 0.01) break;
    }
  }

  return vec4(accumulated, 1.0 - transmittance);
}

void main() {
  // Sample depth buffer
  float depth = texture(u_depth, v_texcoord).r;

  // Reconstruct world position of opaque geometry
  vec3 worldPos = worldPositionFromDepth(v_texcoord, depth);

  // Calculate ray parameters
  vec3 rayOrigin = u_cameraPosition;
  vec3 rayDir = normalize(worldPos - rayOrigin);

  // Calculate max ray distance (stop at geometry or max distance)
  float geometryDistance = length(worldPos - rayOrigin);
  float maxDist = min(geometryDistance, u_maxDistance);

  // Skip if depth is at far plane (skybox)
  if (depth >= 0.9999) {
    maxDist = u_maxDistance;
  }

  // Ray march through volume
  vec4 volumetric = rayMarchVolume(rayOrigin, rayDir, maxDist);

  #ifdef ENABLE_TEMPORAL
    // Temporal reprojection
    vec4 previousClipPos = u_previousViewProjection * vec4(worldPos, 1.0);
    vec2 previousUV = (previousClipPos.xy / previousClipPos.w) * 0.5 + 0.5;

    if (previousUV.x >= 0.0 && previousUV.x <= 1.0 &&
        previousUV.y >= 0.0 && previousUV.y <= 1.0) {
      vec4 previousVolume = texture(u_previousVolume, previousUV);

      // Blend with temporal history
      volumetric = mix(volumetric, previousVolume, u_temporalBlendFactor);
    }
  #endif

  o_volumetric = volumetric;
}
`;

/**
 * Volumetric Lighting pass.
 * Renders volumetric fog and light shafts using froxel-based ray marching.
 *
 * @example
 * ```typescript
 * // Create volumetric lighting pass
 * const volumetricPass = new VolumetricLightingPass({
 *   width: 1920,
 *   height: 1080,
 *   quality: VolumetricQuality.High,
 *   fogDensity: 0.02,
 *   fogColor: new Color(0.5, 0.6, 0.7, 1.0),
 *   fogHeightStart: 0.0,
 *   fogHeightFalloff: 0.1,
 *   enableTemporal: true
 * });
 *
 * // Setup pass
 * volumetricPass.setup();
 *
 * // Update camera
 * volumetricPass.updateCamera(camera);
 *
 * // Set inputs
 * volumetricPass.setDepthTexture(depth);
 * volumetricPass.addDirectionalLight(sunDirection, sunColor, sunIntensity);
 *
 * // Execute pass
 * volumetricPass.execute(emptyQueue, outputTarget);
 *
 * // Get volumetric texture
 * const volumetricTexture = volumetricPass.getVolumetricTexture();
 * ```
 */
export class VolumetricLightingPass extends RenderPass {
  /** Pass configuration */
  private config: VolumetricLightingConfig;

  /** Volumetric shader */
  private shader: Shader | null = null;

  /** Volumetric render target */
  private volumetricTarget: RenderTarget | null = null;

  /** Previous frame for temporal reprojection */
  private previousVolumetricTarget: RenderTarget | null = null;

  /** Uniforms buffer */
  private uniformsUBO: UniformBuffer | null = null;

  /** Lights uniform buffer */
  private lightsUBO: UniformBuffer | null = null;

  /** Current camera */
  private currentCamera: Camera | null = null;

  /** Previous view-projection matrix */
  private previousViewProjectionMatrix: Matrix4 | null = null;

  /** Depth texture */
  private depthTexture: unknown = null;

  /** Shadow map texture */
  private shadowMapTexture: unknown = null;

  /** Shadow matrix */
  private shadowMatrix: Matrix4 | null = null;

  /** Light list */
  private lights: any[] = [];

  /** Statistics */
  private stats = {
    rayMarchSteps: 0,
    lightsProcessed: 0,
  };

  /** Fullscreen triangle VAO (required by WebGL2 even when using gl_VertexID) */
  private fullscreenVAO: WebGLVertexArrayObject | null = null;

  /**
   * Creates a new volumetric lighting pass.
   *
   * @param config - Volumetric lighting configuration
   */
  constructor(config: VolumetricLightingConfig) {
    const width = config.useHalfResolution ? Math.floor(config.width / 2) : config.width;
    const height = config.useHalfResolution ? Math.floor(config.height / 2) : config.height;

    const descriptor: RenderPassDescriptor = {
      name: 'VolumetricLightingPass',
      colorAttachments: [
        {
          name: 'volumetric',
          format: TextureFormat.RGBA16F,
        },
      ],
      clearValues: {
        colors: [new Color(0, 0, 0, 0)],
      },
      colorLoadActions: [LoadAction.Clear],
      colorStoreActions: [StoreAction.Store],
    };

    super(descriptor);

    // Apply quality preset
    const qualityDefaults = this.getQualityDefaults(config.quality ?? VolumetricQuality.High);

    this.config = {
      depthSlices: 128,
      numSteps: 32,
      fogDensity: 0.02,
      fogColor: new Color(0.5, 0.6, 0.7, 1.0),
      fogHeightStart: 0.0,
      fogHeightFalloff: 0.1,
      scattering: 1.0,
      extinction: 0.5,
      anisotropy: 0.3,
      maxDistance: 200.0,
      enableTemporal: true,
      temporalBlendFactor: 0.9,
      useHalfResolution: true,
      ...qualityDefaults,
      ...config,
    };

    logger.info(
      `Created VolumetricLightingPass: ${width}x${height}, ` +
      `steps: ${this.config.numSteps}, ` +
      `depth slices: ${this.config.depthSlices}`
    );
  }

  /**
   * Gets quality preset defaults.
   */
  private getQualityDefaults(quality: VolumetricQuality): Partial<VolumetricLightingConfig> {
    switch (quality) {
      case VolumetricQuality.Low:
        return {
          depthSlices: 32,
          numSteps: 8,
          useHalfResolution: true,
        };
      case VolumetricQuality.Medium:
        return {
          depthSlices: 64,
          numSteps: 16,
          useHalfResolution: true,
        };
      case VolumetricQuality.High:
        return {
          depthSlices: 128,
          numSteps: 32,
          useHalfResolution: false,
        };
    }
  }

  /**
   * Sets up the volumetric lighting pass resources.
   */
  setup(): void {
    logger.debug('Setting up VolumetricLightingPass');

    const width = this.config.useHalfResolution
      ? Math.floor(this.config.width / 2)
      : this.config.width;
    const height = this.config.useHalfResolution
      ? Math.floor(this.config.height / 2)
      : this.config.height;

    // Create volumetric render target
    this.volumetricTarget = new RenderTarget({
      width,
      height,
      samples: 1,
      colorAttachments: [
        {
          format: TextureFormat.RGBA16F,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: new Color(0, 0, 0, 0),
        },
      ],
      label: 'Volumetric',
    });

    // Create temporal target if enabled
    if (this.config.enableTemporal) {
      this.previousVolumetricTarget = new RenderTarget({
        width,
        height,
        samples: 1,
        colorAttachments: [
          {
            format: TextureFormat.RGBA16F,
            loadAction: LoadAction.Load,
            storeAction: StoreAction.Store,
            clearValue: new Color(0, 0, 0, 0),
          },
        ],
        label: 'Volumetric_Previous',
      });
    }

    // Create uniforms buffer
    const uniformsDesc: UniformBufferDescriptor = {
      name: 'VolumetricUniforms',
      binding: 0,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'cameraPosition', type: UniformType.Vec3 },
        { name: 'viewMatrix', type: UniformType.Mat4 },
        { name: 'projectionMatrix', type: UniformType.Mat4 },
        { name: 'inverseViewProjection', type: UniformType.Mat4 },
        { name: 'previousViewProjection', type: UniformType.Mat4 },
        { name: 'nearFar', type: UniformType.Vec2 },
        { name: 'numSteps', type: UniformType.Int },
        { name: 'fogDensity', type: UniformType.Float },
        { name: 'fogColor', type: UniformType.Vec3 },
        { name: 'fogHeightStart', type: UniformType.Float },
        { name: 'fogHeightFalloff', type: UniformType.Float },
        { name: 'scattering', type: UniformType.Float },
        { name: 'extinction', type: UniformType.Float },
        { name: 'anisotropy', type: UniformType.Float },
        { name: 'maxDistance', type: UniformType.Float },
        { name: 'temporalBlendFactor', type: UniformType.Float },
        { name: 'lightCount', type: UniformType.Int },
      ],
    };
    this.uniformsUBO = new UniformBuffer(uniformsDesc);

    // Create lights uniform buffer
    const lightsDesc: UniformBufferDescriptor = {
      name: 'Lights',
      binding: 1,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'lightCount', type: UniformType.Int },
      ],
    };
    this.lightsUBO = new UniformBuffer(lightsDesc);

    // Create fullscreen VAO (required by WebGL2 even when using gl_VertexID)
    this.createFullscreenVAO();

    logger.info('VolumetricLightingPass setup complete');
  }

  /**
   * Creates fullscreen triangle VAO (no vertex buffer needed).
   */
  private createFullscreenVAO(): void {
    if (!this.gl) return;

    const gl = this.gl;
    this.fullscreenVAO = gl.createVertexArray();

    // Note: Vertex shader uses gl_VertexID, so no vertex buffer needed
    gl.bindVertexArray(this.fullscreenVAO);
    gl.bindVertexArray(null);
  }

  /**
   * Executes the volumetric lighting pass.
   *
   * @param renderQueue - Unused
   * @param renderTarget - Output target
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.volumetricTarget || !this.uniformsUBO || !this.currentCamera) {
      logger.error('VolumetricLightingPass not properly initialized');
      return;
    }

    if (!this.depthTexture) {
      logger.warn('VolumetricLightingPass: no depth texture set, skipping');
      return;
    }

    logger.trace('VolumetricLightingPass: ray marching volume');

    // Compile shader on first use
    if (!this.shader) {
      this.compileShader();
      if (!this.shader) {
        logger.error('VolumetricLightingPass: failed to compile shader');
        return;
      }
    }

    // Get GL context from render target
    const gl = this.getGLContext();
    if (!gl) {
      logger.error('VolumetricLightingPass: no GL context available');
      return;
    }

    // Bind volumetric framebuffer
    const framebuffer = (this.volumetricTarget as any).framebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer || null);

    // Clear to transparent
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Disable depth test and blending for fullscreen pass
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // Bind shader
    this.shader.bind();

    // Update uniforms
    this.updateUniforms();

    // Bind textures
    this.bindTextures(gl);

    // Update lights if we have any
    if (this.lights.length > 0 && this.lightsUBO) {
      this.updateLightsUBO();
    }

    // Draw fullscreen triangle (must bind VAO first - WebGL2 requirement)
    gl.bindVertexArray(this.fullscreenVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    // Unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Swap temporal buffers if enabled
    if (this.config.enableTemporal && this.previousVolumetricTarget) {
      [this.volumetricTarget, this.previousVolumetricTarget] =
        [this.previousVolumetricTarget, this.volumetricTarget];
    }

    // Update statistics
    this.stats.rayMarchSteps = this.config.numSteps ?? 32;
    this.stats.lightsProcessed = this.lights.length;

    logger.trace('VolumetricLightingPass complete');
  }

  /**
   * Cleans up volumetric lighting pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up VolumetricLightingPass');

    if (this.volumetricTarget) {
      this.volumetricTarget.dispose();
      this.volumetricTarget = null;
    }

    if (this.previousVolumetricTarget) {
      this.previousVolumetricTarget.dispose();
      this.previousVolumetricTarget = null;
    }

    if (this.shader) {
      this.shader.dispose();
      this.shader = null;
    }

    if (this.fullscreenVAO && this.gl) {
      this.gl.deleteVertexArray(this.fullscreenVAO);
      this.fullscreenVAO = null;
    }

    this.uniformsUBO = null;
    this.lightsUBO = null;
    this.lights.length = 0;

    logger.info('VolumetricLightingPass cleanup complete');
  }

  /**
   * Updates camera for volumetric lighting.
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
   * Sets depth texture.
   */
  setDepthTexture(texture: unknown): void {
    this.depthTexture = texture;
  }

  /**
   * Sets shadow map texture and matrix.
   */
  setShadowMap(texture: unknown, matrix: Matrix4): void {
    this.shadowMapTexture = texture;
    this.shadowMatrix = matrix;
  }

  /**
   * Adds a directional light.
   */
  addDirectionalLight(direction: Vector3, color: Color, intensity: number): void {
    this.lights.push({
      positionType: { x: 0, y: 0, z: 0, w: 0 },
      directionRange: { x: direction.x, y: direction.y, z: direction.z, w: 0 },
      colorIntensity: { x: color.r, y: color.g, z: color.b, w: intensity },
      spotAngles: { x: 0, y: 0, z: 0, w: 0 },
    });
  }

  /**
   * Adds a point light.
   */
  addPointLight(position: Vector3, color: Color, intensity: number, range: number): void {
    this.lights.push({
      positionType: { x: position.x, y: position.y, z: position.z, w: 1 },
      directionRange: { x: 0, y: -1, z: 0, w: range },
      colorIntensity: { x: color.r, y: color.g, z: color.b, w: intensity },
      spotAngles: { x: 0, y: 0, z: 0, w: 0 },
    });
  }

  /**
   * Adds a spot light.
   */
  addSpotLight(
    position: Vector3,
    direction: Vector3,
    color: Color,
    intensity: number,
    range: number,
    innerAngle: number,
    outerAngle: number
  ): void {
    this.lights.push({
      positionType: { x: position.x, y: position.y, z: position.z, w: 2 },
      directionRange: { x: direction.x, y: direction.y, z: direction.z, w: range },
      colorIntensity: { x: color.r, y: color.g, z: color.b, w: intensity },
      spotAngles: { x: innerAngle, y: outerAngle, z: 0, w: 0 },
    });
  }

  /**
   * Clears all lights.
   */
  clearLights(): void {
    this.lights.length = 0;
  }

  /**
   * Compiles the volumetric lighting shader.
   */
  private compileShader(): void {
    logger.debug('Compiling volumetric lighting shader');

    const gl = this.getGLContext();
    if (!gl) {
      logger.error('Cannot compile shader: no GL context');
      return;
    }

    // Build shader defines
    const defines: { [key: string]: string | number } = {
      MAX_LIGHTS: 16,
      MAX_STEPS: Math.max(64, this.config.numSteps ?? 32),
    };

    // Add shadow support if shadow map is set
    if (this.shadowMapTexture) {
      defines.USE_SHADOWS = 1;
    }

    // Add temporal support if enabled
    if (this.config.enableTemporal) {
      defines.ENABLE_TEMPORAL = 1;
    }

    try {
      this.shader = new Shader({
        name: 'VolumetricLighting',
        source: {
          vertex: VOLUMETRIC_VERTEX_SHADER,
          fragment: VOLUMETRIC_FRAGMENT_SHADER,
        },
        defines,
        gl,
      });

      logger.info('Volumetric lighting shader compiled successfully');
    } catch (error) {
      logger.error('Failed to compile volumetric lighting shader:', error);
      this.shader = null;
    }
  }

  /**
   * Gets the WebGL context from the render target.
   */
  private getGLContext(): WebGL2RenderingContext | null {
    // Try to get from volumetric target
    if (this.volumetricTarget) {
      const context = (this.volumetricTarget as any).gl;
      if (context) return context;
    }

    // Fallback: try to get from global window
    if (typeof window !== 'undefined' && (window as any).g3dGLContext) {
      return (window as any).g3dGLContext;
    }

    return null;
  }

  /**
   * Binds all required textures for volumetric rendering.
   */
  private bindTextures(gl: WebGL2RenderingContext): void {
    if (!this.shader) return;

    // Bind depth texture (texture unit 0)
    if (this.depthTexture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.depthTexture as WebGLTexture);
      this.shader.setUniform('u_depth', 0);
    }

    // Bind shadow map (texture unit 1)
    if (this.shadowMapTexture) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowMapTexture as WebGLTexture);
      this.shader.setUniform('u_shadowMap0', 1);

      if (this.shadowMatrix) {
        this.shader.setUniform('u_shadowMatrix0', this.shadowMatrix);
      }
    }

    // Bind previous frame for temporal reprojection (texture unit 2)
    if (this.config.enableTemporal && this.previousVolumetricTarget) {
      const previousTexture = this.previousVolumetricTarget.getColorAttachment(0);
      if (previousTexture) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, previousTexture as WebGLTexture);
        this.shader.setUniform('u_previousVolume', 2);
      }
    }
  }

  /**
   * Updates the lights uniform buffer.
   */
  private updateLightsUBO(): void {
    if (!this.lightsUBO) return;

    // Update light count
    this.lightsUBO.setInt('lightCount', this.lights.length);

    // Update individual lights
    // Note: In a real implementation, we'd need to properly structure
    // the light data as a uniform buffer array. For now, we assume
    // lights are passed via shader uniforms directly.
    if (this.shader) {
      for (let i = 0; i < this.lights.length && i < 16; i++) {
        const light = this.lights[i];
        const prefix = `u_lights[${i}]`;

        this.shader.setUniform(`${prefix}.positionType`, [
          light.positionType.x,
          light.positionType.y,
          light.positionType.z,
          light.positionType.w,
        ]);

        this.shader.setUniform(`${prefix}.directionRange`, [
          light.directionRange.x,
          light.directionRange.y,
          light.directionRange.z,
          light.directionRange.w,
        ]);

        this.shader.setUniform(`${prefix}.colorIntensity`, [
          light.colorIntensity.x,
          light.colorIntensity.y,
          light.colorIntensity.z,
          light.colorIntensity.w,
        ]);

        this.shader.setUniform(`${prefix}.spotAngles`, [
          light.spotAngles.x,
          light.spotAngles.y,
          light.spotAngles.z,
          light.spotAngles.w,
        ]);
      }

      // Set light count in shader
      this.shader.setUniform('u_lightCount', this.lights.length);
    }
  }

  /**
   * Updates uniform buffer.
   */
  private updateUniforms(): void {
    if (!this.uniformsUBO || !this.currentCamera || !this.shader) return;

    // Update camera uniforms via shader
    this.shader.setUniform('u_cameraPosition', this.currentCamera.transform.worldPosition);
    this.shader.setUniform('u_viewMatrix', this.currentCamera.viewMatrix);
    this.shader.setUniform('u_projectionMatrix', this.currentCamera.projectionMatrix);
    this.shader.setUniform('u_inverseViewProjection', this.currentCamera.inverseViewProjectionMatrix!);

    if (this.config.enableTemporal && this.previousViewProjectionMatrix) {
      this.shader.setUniform('u_previousViewProjection', this.previousViewProjectionMatrix);
    }

    this.shader.setUniform('u_nearFar', [
      this.currentCamera.near,
      this.currentCamera.far,
    ]);

    // Update volumetric parameters
    this.shader.setUniform('u_numSteps', this.config.numSteps ?? 32);
    this.shader.setUniform('u_fogDensity', this.config.fogDensity ?? 0.02);
    this.shader.setUniform('u_fogColor', [
      this.config.fogColor?.r ?? 0.5,
      this.config.fogColor?.g ?? 0.6,
      this.config.fogColor?.b ?? 0.7,
    ]);
    this.shader.setUniform('u_fogHeightStart', this.config.fogHeightStart ?? 0.0);
    this.shader.setUniform('u_fogHeightFalloff', this.config.fogHeightFalloff ?? 0.1);
    this.shader.setUniform('u_scattering', this.config.scattering ?? 1.0);
    this.shader.setUniform('u_extinction', this.config.extinction ?? 0.5);
    this.shader.setUniform('u_anisotropy', this.config.anisotropy ?? 0.3);
    this.shader.setUniform('u_maxDistance', this.config.maxDistance ?? 200.0);
    this.shader.setUniform('u_temporalBlendFactor', this.config.temporalBlendFactor ?? 0.9);

    // Also update the UBO for systems that use it
    this.uniformsUBO.setVec3('cameraPosition', this.currentCamera.transform.worldPosition);
    this.uniformsUBO.setMat4('viewMatrix', this.currentCamera.viewMatrix);
    this.uniformsUBO.setMat4('projectionMatrix', this.currentCamera.projectionMatrix);
    this.uniformsUBO.setMat4('inverseViewProjection', this.currentCamera.inverseViewProjectionMatrix!);

    if (this.config.enableTemporal && this.previousViewProjectionMatrix) {
      this.uniformsUBO.setMat4('previousViewProjection', this.previousViewProjectionMatrix);
    }

    this.uniformsUBO.setVec2('nearFar', {
      x: this.currentCamera.near,
      y: this.currentCamera.far
    } as any);

    this.uniformsUBO.setInt('numSteps', this.config.numSteps ?? 32);
    this.uniformsUBO.setFloat('fogDensity', this.config.fogDensity ?? 0.02);
    this.uniformsUBO.setVec3('fogColor', {
      x: this.config.fogColor?.r ?? 0.5,
      y: this.config.fogColor?.g ?? 0.6,
      z: this.config.fogColor?.b ?? 0.7
    } as any);
    this.uniformsUBO.setFloat('fogHeightStart', this.config.fogHeightStart ?? 0.0);
    this.uniformsUBO.setFloat('fogHeightFalloff', this.config.fogHeightFalloff ?? 0.1);
    this.uniformsUBO.setFloat('scattering', this.config.scattering ?? 1.0);
    this.uniformsUBO.setFloat('extinction', this.config.extinction ?? 0.5);
    this.uniformsUBO.setFloat('anisotropy', this.config.anisotropy ?? 0.3);
    this.uniformsUBO.setFloat('maxDistance', this.config.maxDistance ?? 200.0);
    this.uniformsUBO.setFloat('temporalBlendFactor', this.config.temporalBlendFactor ?? 0.9);
    this.uniformsUBO.setInt('lightCount', this.lights.length);
  }

  /**
   * Resizes the volumetric targets.
   */
  resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;

    const targetWidth = this.config.useHalfResolution ? Math.floor(width / 2) : width;
    const targetHeight = this.config.useHalfResolution ? Math.floor(height / 2) : height;

    if (this.volumetricTarget) {
      this.volumetricTarget.resize(targetWidth, targetHeight);
    }

    if (this.previousVolumetricTarget) {
      this.previousVolumetricTarget.resize(targetWidth, targetHeight);
    }
  }

  /**
   * Gets the volumetric texture.
   */
  getVolumetricTexture(): unknown {
    return this.volumetricTarget?.getColorAttachment(0);
  }

  /**
   * Gets rendering statistics.
   */
  getStats(): Readonly<typeof this.stats> {
    return this.stats;
  }
}
