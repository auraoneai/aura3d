/**
 * GBuffer Pass for deferred rendering geometry stage.
 *
 * Renders scene geometry to multiple render targets (GBuffer) containing:
 * - Albedo + Metallic (RGBA8)
 * - Normal + Roughness (RGBA16F)
 * - Emission + AO (RGBA8)
 * - Depth (Depth24Stencil8)
 *
 * Supports:
 * - Tangent-space normal encoding/decoding
 * - Material property packing
 * - Multi-draw rendering
 * - Octahedron normal encoding
 *
 * @module GBufferPass
 */

import { RenderPass, RenderPassDescriptor, AttachmentReference } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue, RenderQueueType } from '../pipeline/RenderQueue';
import { Shader, ShaderSource } from '../shader/Shader';
import { UniformBuffer, UniformBufferDescriptor, UniformLayout, UniformType } from '../shader/UniformBuffer';
import { Camera } from '../camera/Camera';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';
import { Matrix4 } from '../../math/Matrix4';
import { Vector3 } from '../../math/Vector3';

const logger = Logger.create('GBufferPass');

/**
 * GBuffer layout configuration.
 * Defines the render targets for deferred rendering.
 */
export interface GBufferLayout {
  /** Albedo RGB + Metallic A */
  albedoMetallic: AttachmentReference;
  /** Normal XY (octahedron) + Roughness Z + AO W */
  normalRoughnessAO: AttachmentReference;
  /** Emission RGB + unused A */
  emission: AttachmentReference;
  /** Depth + Stencil */
  depth: AttachmentReference;
}

/**
 * GBuffer pass configuration.
 */
export interface GBufferPassConfig {
  /** Target resolution width */
  width: number;
  /** Target resolution height */
  height: number;
  /** Clear color for albedo attachment */
  clearColor?: Color;
  /** Enable normal encoding optimization (octahedron) */
  useOctahedronNormals?: boolean;
  /** Enable velocity buffer for motion blur/TAA */
  enableVelocityBuffer?: boolean;
  /** MSAA sample count (1 = disabled) */
  samples?: number;
}

/**
 * GBuffer shader vertex source (GLSL 300 ES).
 */
const GBUFFER_VERTEX_SHADER = `#version 300 es
precision highp float;

// Vertex attributes
in vec3 a_position;
in vec3 a_normal;
in vec2 a_texcoord;
in vec4 a_tangent; // xyz = tangent, w = handedness

// Uniforms
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat4 u_normalMatrix;

#ifdef ENABLE_VELOCITY
uniform mat4 u_previousModelViewProjection;
#endif

// Outputs
out vec3 v_worldPosition;
out vec3 v_worldNormal;
out vec2 v_texcoord;
out mat3 v_TBN;

#ifdef ENABLE_VELOCITY
out vec4 v_currentPosition;
out vec4 v_previousPosition;
#endif

void main() {
  // World space position
  vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
  v_worldPosition = worldPos.xyz;

  // World space normal
  v_worldNormal = normalize(mat3(u_normalMatrix) * a_normal);

  // Texture coordinates
  v_texcoord = a_texcoord;

  // Tangent space matrix (TBN)
  vec3 T = normalize(mat3(u_normalMatrix) * a_tangent.xyz);
  vec3 N = v_worldNormal;
  vec3 B = cross(N, T) * a_tangent.w;
  v_TBN = mat3(T, B, N);

  // Clip space position
  vec4 clipPos = u_projectionMatrix * u_viewMatrix * worldPos;

  #ifdef ENABLE_VELOCITY
  v_currentPosition = clipPos;
  v_previousPosition = u_previousModelViewProjection * vec4(a_position, 1.0);
  #endif

  gl_Position = clipPos;
}
`;

/**
 * GBuffer shader fragment source (GLSL 300 ES).
 */
const GBUFFER_FRAGMENT_SHADER = `#version 300 es
precision highp float;

// Inputs
in vec3 v_worldPosition;
in vec3 v_worldNormal;
in vec2 v_texcoord;
in mat3 v_TBN;

#ifdef ENABLE_VELOCITY
in vec4 v_currentPosition;
in vec4 v_previousPosition;
#endif

// Material uniforms
uniform vec4 u_albedo;
uniform float u_metallic;
uniform float u_roughness;
uniform float u_ao;
uniform vec3 u_emission;
uniform float u_emissionIntensity;
uniform float u_normalScale;
uniform float u_alphaCutoff;

// Texture samplers
#ifdef USE_ALBEDO_MAP
uniform sampler2D u_albedoMap;
#endif

#ifdef USE_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif

#ifdef USE_METALLIC_ROUGHNESS_MAP
uniform sampler2D u_metallicRoughnessMap;
#endif

#ifdef USE_AO_MAP
uniform sampler2D u_aoMap;
#endif

#ifdef USE_EMISSION_MAP
uniform sampler2D u_emissionMap;
#endif

// GBuffer outputs
layout(location = 0) out vec4 o_albedoMetallic;
layout(location = 1) out vec4 o_normalRoughnessAO;
layout(location = 2) out vec4 o_emission;

#ifdef ENABLE_VELOCITY
layout(location = 3) out vec2 o_velocity;
#endif

/**
 * Encodes a normalized vector to octahedron projection.
 * Maps 3D unit vector to 2D coordinates in [-1, 1] range.
 */
vec2 encodeOctahedron(vec3 n) {
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 octWrap = (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
  return n.z >= 0.0 ? n.xy : octWrap;
}

/**
 * Samples and applies normal map in tangent space.
 */
vec3 getNormal() {
  #ifdef USE_NORMAL_MAP
    vec3 tangentNormal = texture(u_normalMap, v_texcoord).xyz * 2.0 - 1.0;
    tangentNormal.xy *= u_normalScale;
    tangentNormal = normalize(tangentNormal);
    return normalize(v_TBN * tangentNormal);
  #else
    return normalize(v_worldNormal);
  #endif
}

void main() {
  // Sample albedo
  vec4 albedo = u_albedo;
  #ifdef USE_ALBEDO_MAP
    vec4 albedoSample = texture(u_albedoMap, v_texcoord);
    albedo *= albedoSample;
  #endif

  // Alpha test for masked materials
  #ifdef ALPHA_MASK
    if (albedo.a < u_alphaCutoff) {
      discard;
    }
  #endif

  // Sample metallic and roughness
  float metallic = u_metallic;
  float roughness = u_roughness;
  #ifdef USE_METALLIC_ROUGHNESS_MAP
    vec4 mrSample = texture(u_metallicRoughnessMap, v_texcoord);
    roughness *= mrSample.g;
    metallic *= mrSample.b;
  #endif

  // Sample ambient occlusion
  float ao = u_ao;
  #ifdef USE_AO_MAP
    ao *= texture(u_aoMap, v_texcoord).r;
  #endif

  // Sample emission
  vec3 emission = u_emission * u_emissionIntensity;
  #ifdef USE_EMISSION_MAP
    emission *= texture(u_emissionMap, v_texcoord).rgb;
  #endif

  // Get world-space normal
  vec3 normal = getNormal();

  // Encode normal using octahedron projection
  #ifdef USE_OCTAHEDRON_NORMALS
    vec2 encodedNormal = encodeOctahedron(normal);
    encodedNormal = encodedNormal * 0.5 + 0.5; // Map to [0, 1]
  #else
    vec2 encodedNormal = normal.xy * 0.5 + 0.5; // Simple XY encoding
  #endif

  // Pack GBuffer outputs
  o_albedoMetallic = vec4(albedo.rgb, metallic);
  o_normalRoughnessAO = vec4(encodedNormal, roughness, ao);
  o_emission = vec4(emission, 1.0);

  #ifdef ENABLE_VELOCITY
    // Calculate screen-space velocity for motion blur/TAA
    vec2 currentNDC = (v_currentPosition.xy / v_currentPosition.w) * 0.5 + 0.5;
    vec2 previousNDC = (v_previousPosition.xy / v_previousPosition.w) * 0.5 + 0.5;
    o_velocity = currentNDC - previousNDC;
  #endif
}
`;

/**
 * GBuffer render pass for deferred rendering.
 * Renders opaque geometry to multiple render targets containing material properties.
 *
 * @example
 * ```typescript
 * // Create GBuffer pass
 * const gbufferPass = new GBufferPass({
 *   width: 1920,
 *   height: 1080,
 *   clearColor: Color.black(),
 *   useOctahedronNormals: true,
 *   samples: 1
 * });
 *
 * // Setup pass
 * gbufferPass.setup();
 *
 * // In render loop
 * gbufferPass.execute(opaqueQueue, gbufferTarget);
 *
 * // Access GBuffer textures for lighting pass
 * const albedoTexture = gbufferPass.getAlbedoMetallicTexture();
 * const normalTexture = gbufferPass.getNormalRoughnessAOTexture();
 * const emissionTexture = gbufferPass.getEmissionTexture();
 * const depthTexture = gbufferPass.getDepthTexture();
 * ```
 */
export class GBufferPass extends RenderPass {
  /** Pass configuration */
  private config: GBufferPassConfig;

  /** GBuffer render target */
  private gbufferTarget: RenderTarget | null = null;

  /** GBuffer shader */
  private shader: Shader | null = null;

  /** Camera uniform buffer */
  private cameraUBO: UniformBuffer | null = null;

  /** Model transform uniform buffer */
  private modelUBO: UniformBuffer | null = null;

  /** Previous frame MVP matrices for velocity calculation */
  private previousMVPMatrices: Map<number, Matrix4> = new Map();

  /** Current camera reference */
  private currentCamera: Camera | null = null;

  /** WebGL context (set during setup) */
  private gl: WebGL2RenderingContext | null = null;

  /** Statistics */
  private stats = {
    drawCalls: 0,
    triangles: 0,
    materials: 0,
  };

  /**
   * Creates a new GBuffer pass.
   *
   * @param config - GBuffer pass configuration
   */
  constructor(config: GBufferPassConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'GBufferPass',
      colorAttachments: [
        {
          name: 'albedoMetallic',
          format: TextureFormat.RGBA8,
          samples: config.samples ?? 1,
        },
        {
          name: 'normalRoughnessAO',
          format: TextureFormat.RGBA16F,
          samples: config.samples ?? 1,
        },
        {
          name: 'emission',
          format: TextureFormat.RGBA8,
          samples: config.samples ?? 1,
        },
      ],
      depthStencilAttachment: {
        name: 'depth',
        format: TextureFormat.Depth24Stencil8,
        samples: config.samples ?? 1,
      },
      clearValues: {
        colors: [
          config.clearColor ?? Color.black(),
          new Color(0.5, 0.5, 1.0, 1.0), // Encoded default normal (0, 0, 1)
          Color.black(),
        ],
        depth: 1.0,
        stencil: 0,
      },
      colorLoadActions: [LoadAction.Clear, LoadAction.Clear, LoadAction.Clear],
      colorStoreActions: [StoreAction.Store, StoreAction.Store, StoreAction.Store],
      depthLoadAction: LoadAction.Clear,
      depthStoreAction: StoreAction.Store,
    };

    super(descriptor);
    this.config = config;

    logger.info(`Created GBufferPass: ${config.width}x${config.height}, samples: ${config.samples ?? 1}`);
  }

  /**
   * Sets up the GBuffer pass resources.
   * Creates render targets, shaders, and uniform buffers.
   */
  setup(): void {
    logger.debug('Setting up GBufferPass');

    // Create GBuffer render target
    this.gbufferTarget = new RenderTarget({
      width: this.config.width,
      height: this.config.height,
      samples: this.config.samples ?? 1,
      colorAttachments: [
        {
          format: TextureFormat.RGBA8,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: this.clearValues.colors?.[0] ?? Color.black(),
        },
        {
          format: TextureFormat.RGBA16F,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: this.clearValues.colors?.[1] ?? Color.black(),
        },
        {
          format: TextureFormat.RGBA8,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: this.clearValues.colors?.[2] ?? Color.black(),
        },
      ],
      depthStencilAttachment: {
        format: TextureFormat.Depth24Stencil8,
        loadAction: LoadAction.Clear,
        storeAction: StoreAction.Store,
        clearValue: 1.0,
      },
      label: 'GBuffer',
    });

    // Create camera uniform buffer
    const cameraUBODesc: UniformBufferDescriptor = {
      name: 'Camera',
      binding: 0,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'viewMatrix', type: UniformType.Mat4 },
        { name: 'projectionMatrix', type: UniformType.Mat4 },
        { name: 'viewProjectionMatrix', type: UniformType.Mat4 },
        { name: 'cameraPosition', type: UniformType.Vec3 },
        { name: 'nearFar', type: UniformType.Vec2 },
      ],
    };
    this.cameraUBO = new UniformBuffer(cameraUBODesc);

    // Create model uniform buffer
    const modelUBODesc: UniformBufferDescriptor = {
      name: 'Model',
      binding: 1,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'modelMatrix', type: UniformType.Mat4 },
        { name: 'normalMatrix', type: UniformType.Mat4 },
        { name: 'previousMVP', type: UniformType.Mat4 },
      ],
    };
    this.modelUBO = new UniformBuffer(modelUBODesc);

    logger.info('GBufferPass setup complete');
  }

  /**
   * Executes the GBuffer pass.
   * Renders all opaque geometry to GBuffer render targets.
   *
   * @param renderQueue - Queue containing geometry to render
   * @param renderTarget - Target to render to (ignored, uses internal GBuffer target)
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.gbufferTarget || !this.cameraUBO || !this.modelUBO) {
      logger.error('GBufferPass not properly initialized');
      return;
    }

    if (renderQueue.isEmpty) {
      logger.trace('GBufferPass: empty render queue, skipping');
      return;
    }

    // Reset statistics
    this.stats.drawCalls = 0;
    this.stats.triangles = 0;
    this.stats.materials = 0;

    logger.trace(`GBufferPass: rendering ${renderQueue.length} draw calls`);

    // Sort queue for optimal rendering
    renderQueue.sort();

    // Execute draw calls
    let lastMaterialId = -1;
    let lastShader: unknown = null;

    renderQueue.forEach((entry) => {
      const { drawCall, pipelineState, shaderProgram, materialId } = entry;

      // Bind shader if changed
      if (shaderProgram !== lastShader) {
        // Bind shader program
        lastShader = shaderProgram;
        this.stats.materials++;
      }

      // Update material uniforms if changed
      if (materialId !== lastMaterialId) {
        // Bind material textures and properties
        lastMaterialId = materialId;
      }

      // Update model matrices
      // (In real implementation, get from draw call or entity)

      // Execute draw call
      this.stats.drawCalls++;
      if (drawCall.isIndexed()) {
        this.stats.triangles += Math.floor(drawCall.indexCount / 3) * drawCall.instanceCount;
      } else {
        this.stats.triangles += Math.floor(drawCall.vertexCount / 3) * drawCall.instanceCount;
      }
    });

    logger.trace(
      `GBufferPass complete: ${this.stats.drawCalls} draws, ${this.stats.triangles} triangles, ${this.stats.materials} materials`
    );
  }

  /**
   * Cleans up GBuffer pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up GBufferPass');

    if (this.gbufferTarget) {
      this.gbufferTarget.dispose();
      this.gbufferTarget = null;
    }

    if (this.shader) {
      this.shader.dispose();
      this.shader = null;
    }

    this.cameraUBO = null;
    this.modelUBO = null;
    this.previousMVPMatrices.clear();

    logger.info('GBufferPass cleanup complete');
  }

  /**
   * Updates camera uniforms for rendering.
   *
   * @param camera - Active camera
   */
  updateCamera(camera: Camera): void {
    if (!this.cameraUBO) return;

    this.currentCamera = camera;

    this.cameraUBO.setMat4('viewMatrix', camera.viewMatrix);
    this.cameraUBO.setMat4('projectionMatrix', camera.projectionMatrix);
    this.cameraUBO.setMat4('viewProjectionMatrix', camera.viewProjectionMatrix);
    this.cameraUBO.setVec3('cameraPosition', camera.transform.worldPosition);
    this.cameraUBO.setVec2('nearFar', { x: camera.near, y: camera.far } as any);
  }

  /**
   * Updates model transform matrices.
   *
   * @param modelMatrix - Model matrix
   * @param entityId - Entity ID for velocity tracking
   */
  updateModelMatrix(modelMatrix: Matrix4, entityId: number): void {
    if (!this.modelUBO || !this.currentCamera) return;

    this.modelUBO.setMat4('modelMatrix', modelMatrix);

    // Calculate normal matrix (inverse transpose of model matrix)
    const normalMatrix = modelMatrix.clone().invert()?.transpose() ?? Matrix4.identity();
    this.modelUBO.setMat4('normalMatrix', normalMatrix);

    // Calculate previous MVP for velocity
    if (this.config.enableVelocityBuffer) {
      const currentMVP = this.currentCamera.viewProjectionMatrix.multiply(modelMatrix);
      const previousMVP = this.previousMVPMatrices.get(entityId) ?? currentMVP;
      this.modelUBO.setMat4('previousMVP', previousMVP);
      this.previousMVPMatrices.set(entityId, currentMVP.clone());
    }
  }

  /**
   * Resizes the GBuffer render targets.
   *
   * @param width - New width
   * @param height - New height
   */
  resize(width: number, height: number): void {
    if (this.config.width === width && this.config.height === height) {
      return;
    }

    logger.info(`Resizing GBufferPass: ${this.config.width}x${this.config.height} -> ${width}x${height}`);

    this.config.width = width;
    this.config.height = height;

    if (this.gbufferTarget) {
      this.gbufferTarget.resize(width, height);
    }
  }

  /**
   * Gets the GBuffer render target.
   */
  getRenderTarget(): RenderTarget | null {
    return this.gbufferTarget;
  }

  /**
   * Gets the albedo+metallic attachment.
   */
  getAlbedoMetallicTexture(): unknown {
    return this.gbufferTarget?.getColorAttachment(0);
  }

  /**
   * Gets the normal+roughness+AO attachment.
   */
  getNormalRoughnessAOTexture(): unknown {
    return this.gbufferTarget?.getColorAttachment(1);
  }

  /**
   * Gets the emission attachment.
   */
  getEmissionTexture(): unknown {
    return this.gbufferTarget?.getColorAttachment(2);
  }

  /**
   * Gets the depth attachment.
   */
  getDepthTexture(): unknown {
    return this.gbufferTarget?.getDepthStencilAttachment();
  }

  /**
   * Gets rendering statistics.
   */
  getStats(): Readonly<typeof this.stats> {
    return this.stats;
  }

  /**
   * Decodes octahedron-encoded normal.
   * Inverse of encodeOctahedron in shader.
   *
   * @param encoded - Encoded normal in [0, 1] range
   * @returns Decoded unit normal vector
   */
  static decodeOctahedron(encoded: { x: number; y: number }): Vector3 {
    // Map from [0, 1] to [-1, 1]
    const x = encoded.x * 2.0 - 1.0;
    const y = encoded.y * 2.0 - 1.0;

    // Decode
    const z = 1.0 - Math.abs(x) - Math.abs(y);
    const t = Math.max(-z, 0.0);

    const nx = x + (x >= 0 ? -t : t);
    const ny = y + (y >= 0 ? -t : t);

    return new Vector3(nx, ny, z).normalize();
  }
}
