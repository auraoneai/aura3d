/**
 * Skybox rendering pass for environment backgrounds.
 *
 * Supports:
 * - Cubemap skyboxes
 * - Procedural atmospheric sky
 * - HDR environment maps
 * - Infinite projection (rendered at far plane)
 *
 * @module SkyboxPass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Shader } from '../shader/Shader';
import { UniformBuffer, UniformBufferDescriptor, UniformLayout, UniformType } from '../shader/UniformBuffer';
import { Camera } from '../camera/Camera';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';
import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';

const logger = Logger.create('SkyboxPass');

/**
 * Skybox type enumeration.
 */
export enum SkyboxType {
  /** Cubemap skybox */
  Cubemap = 0,
  /** Procedural atmospheric sky */
  Procedural = 1,
  /** Solid color */
  Solid = 2,
}

/**
 * Atmospheric scattering parameters.
 */
export interface AtmosphereParams {
  /** Sun direction (normalized) */
  sunDirection: Vector3;
  /** Rayleigh scattering coefficient */
  rayleighCoefficient: Vector3;
  /** Mie scattering coefficient */
  mieCoefficient: number;
  /** Rayleigh scale height */
  rayleighScaleHeight: number;
  /** Mie scale height */
  mieScaleHeight: number;
  /** Sun intensity */
  sunIntensity: number;
  /** Atmosphere density */
  density: number;
}

/**
 * Skybox pass configuration.
 */
export interface SkyboxPassConfig {
  /** Skybox type */
  type: SkyboxType;
  /** Cubemap texture (for cubemap type) */
  cubemapTexture?: unknown;
  /** Solid color (for solid type) */
  solidColor?: Color;
  /** Atmosphere parameters (for procedural type) */
  atmosphereParams?: AtmosphereParams;
  /** HDR exposure for environment maps */
  exposure?: number;
}

/**
 * Skybox vertex shader.
 */
const SKYBOX_VERTEX_SHADER = `#version 300 es
precision highp float;

// Skybox cube vertices (unit cube)
const vec3 positions[36] = vec3[36](
  // Back face
  vec3(-1.0, -1.0, -1.0), vec3(1.0, -1.0, -1.0), vec3(1.0, 1.0, -1.0),
  vec3(1.0, 1.0, -1.0), vec3(-1.0, 1.0, -1.0), vec3(-1.0, -1.0, -1.0),
  // Front face
  vec3(-1.0, -1.0, 1.0), vec3(1.0, 1.0, 1.0), vec3(1.0, -1.0, 1.0),
  vec3(-1.0, -1.0, 1.0), vec3(-1.0, 1.0, 1.0), vec3(1.0, 1.0, 1.0),
  // Left face
  vec3(-1.0, 1.0, 1.0), vec3(-1.0, -1.0, -1.0), vec3(-1.0, 1.0, -1.0),
  vec3(-1.0, -1.0, -1.0), vec3(-1.0, 1.0, 1.0), vec3(-1.0, -1.0, 1.0),
  // Right face
  vec3(1.0, 1.0, 1.0), vec3(1.0, 1.0, -1.0), vec3(1.0, -1.0, -1.0),
  vec3(1.0, -1.0, -1.0), vec3(1.0, -1.0, 1.0), vec3(1.0, 1.0, 1.0),
  // Bottom face
  vec3(-1.0, -1.0, -1.0), vec3(1.0, -1.0, 1.0), vec3(1.0, -1.0, -1.0),
  vec3(-1.0, -1.0, -1.0), vec3(-1.0, -1.0, 1.0), vec3(1.0, -1.0, 1.0),
  // Top face
  vec3(-1.0, 1.0, -1.0), vec3(1.0, 1.0, -1.0), vec3(1.0, 1.0, 1.0),
  vec3(1.0, 1.0, 1.0), vec3(-1.0, 1.0, 1.0), vec3(-1.0, 1.0, -1.0)
);

uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;

out vec3 v_direction;

void main() {
  vec3 pos = positions[gl_VertexID];
  v_direction = pos;

  // Remove translation from view matrix (keep rotation only)
  mat4 rotationView = mat4(mat3(u_viewMatrix));

  // Project to clip space
  vec4 clipPos = u_projectionMatrix * rotationView * vec4(pos, 1.0);

  // Set z = w so depth is always 1.0 (far plane)
  gl_Position = clipPos.xyww;
}
`;

/**
 * Cubemap skybox fragment shader.
 */
const SKYBOX_CUBEMAP_FRAGMENT = `#version 300 es
precision highp float;

in vec3 v_direction;

uniform samplerCube u_skybox;
uniform float u_exposure;

layout(location = 0) out vec4 o_color;

void main() {
  vec3 color = texture(u_skybox, v_direction).rgb;

  // Apply exposure for HDR
  color = vec3(1.0) - exp(-color * u_exposure);

  o_color = vec4(color, 1.0);
}
`;

/**
 * Procedural atmospheric sky fragment shader.
 */
const SKYBOX_PROCEDURAL_FRAGMENT = `#version 300 es
precision highp float;

in vec3 v_direction;

uniform vec3 u_sunDirection;
uniform vec3 u_rayleighCoefficient;
uniform float u_mieCoefficient;
uniform float u_rayleighScaleHeight;
uniform float u_mieScaleHeight;
uniform float u_sunIntensity;
uniform float u_density;

layout(location = 0) out vec4 o_color;

const float PI = 3.14159265359;
const vec3 earthCenter = vec3(0.0, -6371e3, 0.0); // Earth radius in meters
const float atmosphereRadius = 6471e3; // 100km atmosphere
const int numSamples = 16;

/**
 * Ray-sphere intersection.
 */
bool raySphereIntersect(vec3 origin, vec3 direction, vec3 center, float radius, out float t0, out float t1) {
  vec3 oc = origin - center;
  float a = dot(direction, direction);
  float b = 2.0 * dot(oc, direction);
  float c = dot(oc, oc) - radius * radius;
  float discriminant = b * b - 4.0 * a * c;

  if (discriminant < 0.0) {
    return false;
  }

  float sqrtDisc = sqrt(discriminant);
  t0 = (-b - sqrtDisc) / (2.0 * a);
  t1 = (-b + sqrtDisc) / (2.0 * a);

  return true;
}

/**
 * Calculate atmospheric scattering.
 */
vec3 calculateAtmosphere(vec3 direction) {
  vec3 cameraPos = vec3(0.0, 0.0, 0.0); // Viewer at sea level

  // Ray-sphere intersection with atmosphere
  float t0, t1;
  if (!raySphereIntersect(cameraPos, direction, earthCenter, atmosphereRadius, t0, t1)) {
    return vec3(0.0);
  }

  // Sample along ray
  float segmentLength = (t1 - t0) / float(numSamples);
  vec3 rayleighScattering = vec3(0.0);
  vec3 mieScattering = vec3(0.0);

  for (int i = 0; i < numSamples; ++i) {
    float t = t0 + (float(i) + 0.5) * segmentLength;
    vec3 samplePos = cameraPos + direction * t;

    // Calculate height above ground
    float height = length(samplePos - earthCenter) - 6371e3;

    // Calculate density at sample point
    float rayleighDensity = exp(-height / u_rayleighScaleHeight);
    float mieDensity = exp(-height / u_mieScaleHeight);

    rayleighScattering += rayleighDensity * segmentLength;
    mieScattering += mieDensity * segmentLength;
  }

  // Calculate scattering
  float mu = dot(direction, u_sunDirection);
  float rayleighPhase = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g = 0.76;
  float miePhase = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) /
                   ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));

  vec3 rayleighColor = u_rayleighCoefficient * rayleighPhase * rayleighScattering;
  vec3 mieColor = vec3(u_mieCoefficient) * miePhase * mieScattering;

  vec3 color = (rayleighColor + mieColor) * u_sunIntensity * u_density;

  return color;
}

void main() {
  vec3 direction = normalize(v_direction);

  #ifdef PROCEDURAL_SKY
    vec3 color = calculateAtmosphere(direction);
  #else
    vec3 color = vec3(0.5, 0.7, 1.0); // Default sky color
  #endif

  o_color = vec4(color, 1.0);
}
`;

/**
 * Solid color skybox fragment shader.
 */
const SKYBOX_SOLID_FRAGMENT = `#version 300 es
precision highp float;

uniform vec4 u_solidColor;

layout(location = 0) out vec4 o_color;

void main() {
  o_color = u_solidColor;
}
`;

/**
 * Skybox rendering pass.
 * Renders environment background at infinity (far plane).
 *
 * @example
 * ```typescript
 * // Create cubemap skybox
 * const skyboxPass = new SkyboxPass({
 *   type: SkyboxType.Cubemap,
 *   cubemapTexture: environmentCubemap,
 *   exposure: 1.0
 * });
 *
 * // Create procedural sky
 * const proceduralSky = new SkyboxPass({
 *   type: SkyboxType.Procedural,
 *   atmosphereParams: {
 *     sunDirection: new Vector3(0, 1, 0).normalize(),
 *     rayleighCoefficient: new Vector3(5.5e-6, 13.0e-6, 22.4e-6),
 *     mieCoefficient: 21e-6,
 *     rayleighScaleHeight: 8000,
 *     mieScaleHeight: 1200,
 *     sunIntensity: 22.0,
 *     density: 1.0
 *   }
 * });
 *
 * // Setup and render
 * skyboxPass.setup();
 * skyboxPass.execute(emptyQueue, sceneTarget);
 * ```
 */
export class SkyboxPass extends RenderPass {
  /** Pass configuration */
  private config: SkyboxPassConfig;

  /** Skybox shader */
  private shader: Shader | null = null;

  /** Uniform buffer */
  private uniformBuffer: UniformBuffer | null = null;

  /** Current camera */
  private currentCamera: Camera | null = null;

  /**
   * Creates a new skybox pass.
   *
   * @param config - Skybox configuration
   */
  constructor(config: SkyboxPassConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'SkyboxPass',
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
        colors: [config.solidColor ?? new Color(0.5, 0.7, 1.0, 1.0)],
      },
      colorLoadActions: [LoadAction.Load], // Load existing content
      colorStoreActions: [StoreAction.Store],
      depthLoadAction: LoadAction.Load, // Load existing depth
      depthStoreAction: StoreAction.Store,
    };

    super(descriptor);
    this.config = {
      exposure: 1.0,
      ...config,
    };

    logger.info(`Created SkyboxPass: type ${SkyboxType[config.type]}`);
  }

  /**
   * Sets up skybox pass resources.
   */
  setup(): void {
    logger.debug('Setting up SkyboxPass');

    // Create uniform buffer based on skybox type
    if (this.config.type === SkyboxType.Procedural && this.config.atmosphereParams) {
      const uboDesc: UniformBufferDescriptor = {
        name: 'Atmosphere',
        binding: 0,
        layout: UniformLayout.Std140,
        fields: [
          { name: 'viewMatrix', type: UniformType.Mat4 },
          { name: 'projectionMatrix', type: UniformType.Mat4 },
          { name: 'sunDirection', type: UniformType.Vec3 },
          { name: 'rayleighCoefficient', type: UniformType.Vec3 },
          { name: 'mieCoefficient', type: UniformType.Float },
          { name: 'rayleighScaleHeight', type: UniformType.Float },
          { name: 'mieScaleHeight', type: UniformType.Float },
          { name: 'sunIntensity', type: UniformType.Float },
          { name: 'density', type: UniformType.Float },
        ],
      };
      this.uniformBuffer = new UniformBuffer(uboDesc);
    } else {
      const uboDesc: UniformBufferDescriptor = {
        name: 'Skybox',
        binding: 0,
        layout: UniformLayout.Std140,
        fields: [
          { name: 'viewMatrix', type: UniformType.Mat4 },
          { name: 'projectionMatrix', type: UniformType.Mat4 },
          { name: 'exposure', type: UniformType.Float },
          { name: 'solidColor', type: UniformType.Vec4 },
        ],
      };
      this.uniformBuffer = new UniformBuffer(uboDesc);
    }

    logger.info('SkyboxPass setup complete');
  }

  /**
   * Creates the appropriate shader based on skybox type.
   */
  private createShader(): void {
    let fragmentShader: string;
    let shaderName: string;

    // Select fragment shader based on skybox type
    switch (this.config.type) {
      case SkyboxType.Cubemap:
        fragmentShader = SKYBOX_CUBEMAP_FRAGMENT;
        shaderName = 'SkyboxCubemap';
        break;
      case SkyboxType.Procedural:
        fragmentShader = SKYBOX_PROCEDURAL_FRAGMENT;
        shaderName = 'SkyboxProcedural';
        break;
      case SkyboxType.Solid:
        fragmentShader = SKYBOX_SOLID_FRAGMENT;
        shaderName = 'SkyboxSolid';
        break;
      default:
        logger.error(`Unknown skybox type: ${this.config.type}`);
        return;
    }

    // Create shader (without GL context, will be compiled later when context is available)
    this.shader = new Shader({
      name: shaderName,
      source: {
        vertex: SKYBOX_VERTEX_SHADER,
        fragment: fragmentShader,
      },
      defines: this.config.type === SkyboxType.Procedural ? { PROCEDURAL_SKY: 1 } : {},
    });

    logger.debug(`Created ${shaderName} shader`);
  }

  /**
   * Executes the skybox pass.
   * Renders skybox using vertex-only geometry (no vertex buffer required).
   *
   * @param renderQueue - Unused for skybox
   * @param renderTarget - Target to render to
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.currentCamera || !this.uniformBuffer) {
      logger.error('SkyboxPass not properly initialized');
      return;
    }

    logger.trace('Executing SkyboxPass');

    // Create shader on first use if needed
    if (!this.shader) {
      this.createShader();
      if (!this.shader) {
        logger.error('Failed to create skybox shader');
        return;
      }
    }

    // Bind the render target framebuffer
    // (Graphics backend would bind framebuffer here)

    // Update uniforms
    this.uniformBuffer.setMat4('viewMatrix', this.currentCamera.viewMatrix);
    this.uniformBuffer.setMat4('projectionMatrix', this.currentCamera.projectionMatrix);

    if (this.config.type === SkyboxType.Cubemap) {
      this.uniformBuffer.setFloat('exposure', this.config.exposure ?? 1.0);
      // Bind cubemap texture to texture unit 0
      // (Graphics backend would bind texture here)
    } else if (this.config.type === SkyboxType.Procedural && this.config.atmosphereParams) {
      const params = this.config.atmosphereParams;
      this.uniformBuffer.setVec3('sunDirection', params.sunDirection);
      this.uniformBuffer.setVec3('rayleighCoefficient', params.rayleighCoefficient);
      this.uniformBuffer.setFloat('mieCoefficient', params.mieCoefficient);
      this.uniformBuffer.setFloat('rayleighScaleHeight', params.rayleighScaleHeight);
      this.uniformBuffer.setFloat('mieScaleHeight', params.mieScaleHeight);
      this.uniformBuffer.setFloat('sunIntensity', params.sunIntensity);
      this.uniformBuffer.setFloat('density', params.density);
    } else if (this.config.type === SkyboxType.Solid) {
      const color = this.config.solidColor ?? new Color(0.5, 0.7, 1.0, 1.0);
      this.uniformBuffer.setVec4('solidColor', color as any);
    }

    // Set GL state for skybox rendering:
    // - Enable depth test with LEQUAL (allows z=1.0 to pass)
    // - Disable depth write (skybox doesn't write to depth buffer)
    // - Disable face culling (or use CW culling for inside-out cube)
    // (Graphics backend would set these states here)

    // Bind skybox shader
    if (this.shader && this.shader.isReady) {
      this.shader.bind();

      // Upload uniforms to shader
      this.shader.setUniform('u_viewMatrix', this.currentCamera.viewMatrix);
      this.shader.setUniform('u_projectionMatrix', this.currentCamera.projectionMatrix);

      if (this.config.type === SkyboxType.Cubemap) {
        this.shader.setUniform('u_exposure', this.config.exposure ?? 1.0);
        // Bind cubemap texture to sampler
      } else if (this.config.type === SkyboxType.Procedural && this.config.atmosphereParams) {
        const params = this.config.atmosphereParams;
        this.shader.setUniform('u_sunDirection', params.sunDirection);
        this.shader.setUniform('u_rayleighCoefficient', params.rayleighCoefficient);
        this.shader.setUniform('u_mieCoefficient', params.mieCoefficient);
        this.shader.setUniform('u_rayleighScaleHeight', params.rayleighScaleHeight);
        this.shader.setUniform('u_mieScaleHeight', params.mieScaleHeight);
        this.shader.setUniform('u_sunIntensity', params.sunIntensity);
        this.shader.setUniform('u_density', params.density);
      } else if (this.config.type === SkyboxType.Solid) {
        const color = this.config.solidColor ?? new Color(0.5, 0.7, 1.0, 1.0);
        this.shader.setUniform('u_solidColor', color);
      }

      // Draw skybox cube (36 vertices from vertex shader positions array)
      // gl.drawArrays(gl.TRIANGLES, 0, 36);
      // (Graphics backend would issue draw call here)

      this.shader.unbind();
    }

    // Restore GL state
    // - Re-enable depth write
    // - Reset depth func to default (LESS)
    // (Graphics backend would restore states here)

    logger.trace('SkyboxPass complete');
  }

  /**
   * Cleans up skybox pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up SkyboxPass');

    if (this.shader) {
      this.shader.dispose();
      this.shader = null;
    }

    this.uniformBuffer = null;

    logger.info('SkyboxPass cleanup complete');
  }

  /**
   * Updates the camera for rendering.
   *
   * @param camera - Active camera
   */
  updateCamera(camera: Camera): void {
    this.currentCamera = camera;
  }

  /**
   * Sets the cubemap texture.
   *
   * @param texture - Cubemap texture
   */
  setCubemap(texture: unknown): void {
    this.config.cubemapTexture = texture;
  }

  /**
   * Sets the atmosphere parameters for procedural sky.
   *
   * @param params - Atmosphere parameters
   */
  setAtmosphereParams(params: AtmosphereParams): void {
    this.config.atmosphereParams = params;
  }

  /**
   * Sets the solid color.
   *
   * @param color - Solid color
   */
  setSolidColor(color: Color): void {
    this.config.solidColor = color;
  }

  /**
   * Sets HDR exposure.
   *
   * @param exposure - Exposure value
   */
  setExposure(exposure: number): void {
    this.config.exposure = exposure;
  }
}
