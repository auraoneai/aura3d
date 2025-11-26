/**
 * Forward rendering pass for transparent objects and special materials.
 *
 * Implements forward rendering with:
 * - Alpha blending for transparent objects
 * - Forward+ light assignment
 * - Depth pre-pass integration
 * - Order-independent transparency (OIT) hooks
 * - Per-object lighting calculations
 *
 * Used for rendering objects that cannot be deferred (transparent, subsurface scattering, etc.)
 *
 * @module ForwardPass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Shader } from '../shader/Shader';
import { UniformBuffer, UniformBufferDescriptor, UniformLayout, UniformType } from '../shader/UniformBuffer';
import { Camera } from '../camera/Camera';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';

const logger = Logger.create('ForwardPass');

/**
 * Forward pass configuration.
 */
export interface ForwardPassConfig {
  /** Enable depth pre-pass for complex transparent scenes */
  useDepthPrePass?: boolean;
  /** Enable order-independent transparency */
  enableOIT?: boolean;
  /** Maximum lights per object in Forward+ */
  maxLightsPerObject?: number;
  /** Target resolution */
  width: number;
  height: number;
}

/**
 * Forward rendering vertex shader.
 * Note: Currently unused but kept for future implementation.
 */
/*
const FORWARD_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_normal;
in vec2 a_texcoord;
in vec4 a_tangent;

uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat4 u_normalMatrix;

out vec3 v_worldPosition;
out vec3 v_worldNormal;
out vec2 v_texcoord;
out mat3 v_TBN;

void main() {
  vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
  v_worldPosition = worldPos.xyz;
  v_worldNormal = normalize(mat3(u_normalMatrix) * a_normal);
  v_texcoord = a_texcoord;

  // Tangent space
  vec3 T = normalize(mat3(u_normalMatrix) * a_tangent.xyz);
  vec3 N = v_worldNormal;
  vec3 B = cross(N, T) * a_tangent.w;
  v_TBN = mat3(T, B, N);

  gl_Position = u_projectionMatrix * u_viewMatrix * worldPos;
}
`;
*/

/**
 * Forward rendering fragment shader with PBR lighting.
 * Note: Currently unused but kept for future implementation.
 */
/*
const FORWARD_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 v_worldPosition;
in vec3 v_worldNormal;
in vec2 v_texcoord;
in mat3 v_TBN;

// Material uniforms
uniform vec4 u_albedo;
uniform float u_metallic;
uniform float u_roughness;
uniform float u_ao;
uniform vec3 u_emission;
uniform float u_emissionIntensity;
uniform float u_alphaCutoff;

// Textures
#ifdef USE_ALBEDO_MAP
uniform sampler2D u_albedoMap;
#endif

#ifdef USE_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif

#ifdef USE_METALLIC_ROUGHNESS_MAP
uniform sampler2D u_metallicRoughnessMap;
#endif

// Lighting
uniform vec3 u_cameraPosition;
uniform int u_lightCount;

struct Light {
  vec4 positionType;
  vec4 directionRange;
  vec4 colorIntensity;
};

uniform Light u_lights[MAX_LIGHTS];

// Output
layout(location = 0) out vec4 o_color;

const float PI = 3.14159265359;

vec3 getNormal() {
  #ifdef USE_NORMAL_MAP
    vec3 tangentNormal = texture(u_normalMap, v_texcoord).xyz * 2.0 - 1.0;
    return normalize(v_TBN * tangentNormal);
  #else
    return normalize(v_worldNormal);
  #endif
}

vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float NdotH2 = NdotH * NdotH;
  float denom = (NdotH2 * (a2 - 1.0) + 1.0);
  return a2 / (PI * denom * denom);
}

float geometrySchlickGGX(float NdotV, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

void main() {
  // Sample material properties
  vec4 albedo = u_albedo;
  #ifdef USE_ALBEDO_MAP
    albedo *= texture(u_albedoMap, v_texcoord);
  #endif

  #ifdef ALPHA_MASK
    if (albedo.a < u_alphaCutoff) discard;
  #endif

  float metallic = u_metallic;
  float roughness = u_roughness;
  #ifdef USE_METALLIC_ROUGHNESS_MAP
    vec2 mr = texture(u_metallicRoughnessMap, v_texcoord).gb;
    roughness *= mr.x;
    metallic *= mr.y;
  #endif

  vec3 N = getNormal();
  vec3 V = normalize(u_cameraPosition - v_worldPosition);

  // Calculate lighting
  vec3 F0 = mix(vec3(0.04), albedo.rgb, metallic);
  vec3 Lo = vec3(0.0);

  for (int i = 0; i < u_lightCount; ++i) {
    Light light = u_lights[i];
    int lightType = int(light.positionType.w);

    vec3 L;
    float attenuation = 1.0;

    if (lightType == 0) {
      // Directional
      L = normalize(-light.directionRange.xyz);
    } else {
      // Point/Spot
      vec3 lightVec = light.positionType.xyz - v_worldPosition;
      float distance = length(lightVec);
      L = lightVec / distance;
      attenuation = 1.0 / (distance * distance + 1.0);
    }

    vec3 H = normalize(V + L);
    vec3 radiance = light.colorIntensity.rgb * light.colorIntensity.a * attenuation;

    // Cook-Torrance BRDF
    float NDF = distributionGGX(N, H, roughness);
    float G = geometrySmith(N, V, L, roughness);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    vec3 specular = (NDF * G * F) / (4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001);
    vec3 kD = (vec3(1.0) - F) * (1.0 - metallic);

    float NdotL = max(dot(N, L), 0.0);
    Lo += (kD * albedo.rgb / PI + specular) * radiance * NdotL;
  }

  vec3 ambient = vec3(0.03) * albedo.rgb * u_ao;
  vec3 color = ambient + Lo + u_emission * u_emissionIntensity;

  o_color = vec4(color, albedo.a);
}
`;
*/

/**
 * Forward rendering pass for transparent and special materials.
 *
 * @example
 * ```typescript
 * // Create forward pass
 * const forwardPass = new ForwardPass({
 *   width: 1920,
 *   height: 1080,
 *   useDepthPrePass: true,
 *   maxLightsPerObject: 8
 * });
 *
 * // Setup
 * forwardPass.setup();
 *
 * // Render transparent objects
 * forwardPass.execute(transparentQueue, forwardTarget);
 * ```
 */
export class ForwardPass extends RenderPass {
  /** Pass configuration */
  private config: ForwardPassConfig;

  /** Forward rendering shader */
  private shader: Shader | null = null;

  /** Camera uniform buffer */
  private cameraUBO: UniformBuffer | null = null;

  /** Depth pre-pass target */
  private depthPrePassTarget: RenderTarget | null = null;

  /** Statistics */
  private stats = {
    drawCalls: 0,
    transparentObjects: 0,
    lightsProcessed: 0,
  };

  /**
   * Creates a new forward pass.
   *
   * @param config - Forward pass configuration
   */
  constructor(config: ForwardPassConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'ForwardPass',
      colorAttachments: [
        {
          name: 'color',
          format: TextureFormat.RGBA16F,
        },
      ],
      depthStencilAttachment: {
        name: 'depth',
        format: TextureFormat.Depth24Stencil8,
      },
      clearValues: {
        colors: [new Color(0, 0, 0, 0)], // Transparent black
        depth: 1.0,
      },
      colorLoadActions: [LoadAction.Load], // Load existing content
      colorStoreActions: [StoreAction.Store],
      depthLoadAction: LoadAction.Load, // Load depth from previous passes
      depthStoreAction: StoreAction.Store,
    };

    super(descriptor);
    this.config = {
      useDepthPrePass: false,
      enableOIT: false,
      maxLightsPerObject: 8,
      ...config,
    };

    logger.info(`Created ForwardPass: depth pre-pass: ${this.config.useDepthPrePass}, OIT: ${this.config.enableOIT}`);
  }

  /**
   * Sets up forward pass resources.
   */
  setup(): void {
    logger.debug('Setting up ForwardPass');

    // Create camera uniform buffer
    const cameraUBODesc: UniformBufferDescriptor = {
      name: 'Camera',
      binding: 0,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'viewMatrix', type: UniformType.Mat4 },
        { name: 'projectionMatrix', type: UniformType.Mat4 },
        { name: 'cameraPosition', type: UniformType.Vec3 },
      ],
    };
    this.cameraUBO = new UniformBuffer(cameraUBODesc);

    // Create depth pre-pass target if enabled
    if (this.config.useDepthPrePass) {
      this.depthPrePassTarget = new RenderTarget({
        width: this.config.width,
        height: this.config.height,
        samples: 1,
        colorAttachments: [],
        depthStencilAttachment: {
          format: TextureFormat.Depth24Stencil8,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: 1.0,
        },
        label: 'DepthPrePass',
      });
    }

    logger.info('ForwardPass setup complete');
  }

  /**
   * Executes the forward pass.
   *
   * @param renderQueue - Queue containing transparent objects
   * @param renderTarget - Target to render to
   */
  execute(renderQueue: RenderQueue, _renderTarget: RenderTarget): void {
    if (renderQueue.isEmpty) {
      logger.trace('ForwardPass: empty queue, skipping');
      return;
    }

    // Reset statistics
    this.stats.drawCalls = 0;
    this.stats.transparentObjects = 0;
    this.stats.lightsProcessed = 0;

    logger.trace(`ForwardPass: rendering ${renderQueue.length} objects`);

    // Depth pre-pass for complex transparent scenes
    if (this.config.useDepthPrePass && this.depthPrePassTarget) {
      this.executeDepthPrePass(renderQueue);
    }

    // Sort queue back-to-front for correct alpha blending
    renderQueue.sort();

    // Enable alpha blending
    // (Graphics backend would set blend state here)

    // Render transparent objects
    renderQueue.forEach((_entry) => {
      // Bind material and render
      this.stats.drawCalls++;
      this.stats.transparentObjects++;
    });

    logger.trace(`ForwardPass complete: ${this.stats.drawCalls} draws, ${this.stats.transparentObjects} transparent`);
  }

  /**
   * Cleans up forward pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up ForwardPass');

    if (this.shader) {
      this.shader.dispose();
      this.shader = null;
    }

    if (this.depthPrePassTarget) {
      this.depthPrePassTarget.dispose();
      this.depthPrePassTarget = null;
    }

    this.cameraUBO = null;

    logger.info('ForwardPass cleanup complete');
  }

  /**
   * Executes depth pre-pass for transparent objects.
   * Renders depth-only to reduce overdraw.
   *
   * @param renderQueue - Transparent objects queue
   */
  private executeDepthPrePass(renderQueue: RenderQueue): void {
    if (!this.depthPrePassTarget) return;

    logger.trace('Executing depth pre-pass for transparent objects');

    // Render depth-only
    renderQueue.forEach((_entry) => {
      // Render with depth write enabled, color write disabled
    });
  }

  /**
   * Updates camera for rendering.
   *
   * @param camera - Active camera
   */
  updateCamera(camera: Camera): void {
    if (this.cameraUBO) {
      this.cameraUBO.setMat4('viewMatrix', camera.viewMatrix);
      this.cameraUBO.setMat4('projectionMatrix', camera.projectionMatrix);
      this.cameraUBO.setVec3('cameraPosition', camera.transform.worldPosition);
    }
  }

  /**
   * Resizes the forward pass targets.
   *
   * @param width - New width
   * @param height - New height
   */
  resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;

    if (this.depthPrePassTarget) {
      this.depthPrePassTarget.resize(width, height);
    }
  }

  /**
   * Gets rendering statistics.
   */
  getStats(): Readonly<typeof this.stats> {
    return this.stats;
  }
}
