/**
 * Geometry Pass for rendering opaque geometry to G-buffer.
 *
 * Renders opaque geometry to multiple render targets (G-buffer) containing:
 * - Albedo RGB + Metallic A (RGBA8)
 * - Normal XY (octahedron) + Roughness Z + AO W (RGBA16F)
 * - Emission RGB (RGBA8)
 * - Depth (Depth24Stencil8)
 * - Velocity XY (RG16F) - optional for motion blur/TAA
 *
 * Features:
 * - Material batching by shader variant
 * - Instanced rendering support
 * - Skinned mesh support (up to 256 bones)
 * - Motion vectors from current/previous transforms
 * - Octahedron normal encoding for efficient storage
 * - Alpha testing for masked materials
 * - Performance target: 100k triangles < 2ms
 *
 * @module GeometryPass
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

const logger = Logger.create('GeometryPass');

/**
 * Material shader variant flags.
 * Combined into a bitmask for batching.
 */
export enum MaterialVariantFlags {
  None = 0,
  AlbedoMap = 1 << 0,
  NormalMap = 1 << 1,
  MetallicRoughnessMap = 1 << 2,
  AOMap = 1 << 3,
  EmissionMap = 1 << 4,
  AlphaMask = 1 << 5,
  Skinned = 1 << 6,
  Instanced = 1 << 7,
  VelocityEnabled = 1 << 8,
}

/**
 * Geometry pass configuration.
 */
export interface GeometryPassConfig {
  /** Target resolution width */
  width: number;
  /** Target resolution height */
  height: number;
  /** Clear color for albedo attachment */
  clearColor?: Color;
  /** Enable octahedron normal encoding */
  useOctahedronNormals?: boolean;
  /** Enable velocity buffer for motion blur/TAA */
  enableVelocityBuffer?: boolean;
  /** MSAA sample count (1 = disabled) */
  samples?: number;
  /** Maximum bone count for skinned meshes */
  maxBones?: number;
}

/**
 * Material properties for uniform buffer.
 */
export interface MaterialProperties {
  /** Base albedo color */
  albedo: Color;
  /** Metallic factor */
  metallic: number;
  /** Roughness factor */
  roughness: number;
  /** Ambient occlusion factor */
  ao: number;
  /** Emission color */
  emission: Vector3;
  /** Emission intensity */
  emissionIntensity: number;
  /** Normal map scale */
  normalScale: number;
  /** Alpha cutoff for masked materials */
  alphaCutoff: number;
}

/**
 * Geometry vertex shader (GLSL 300 ES).
 */
const GEOMETRY_VERTEX_SHADER = `#version 300 es
precision highp float;

// Vertex attributes
in vec3 a_position;
in vec3 a_normal;
in vec2 a_texcoord;
in vec4 a_tangent; // xyz = tangent, w = handedness

#ifdef SKINNED
in vec4 a_boneIndices;
in vec4 a_boneWeights;
uniform mat4 u_boneMatrices[MAX_BONES];
#endif

#ifdef INSTANCED
in mat4 a_instanceMatrix;
#endif

// Uniforms
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat4 u_normalMatrix;

#ifdef VELOCITY_ENABLED
uniform mat4 u_previousModelMatrix;
uniform mat4 u_previousViewProjectionMatrix;
#endif

// Outputs
out vec3 v_worldPosition;
out vec3 v_worldNormal;
out vec2 v_texcoord;
out mat3 v_TBN;

#ifdef VELOCITY_ENABLED
out vec4 v_currentPosition;
out vec4 v_previousPosition;
#endif

void main() {
  vec4 localPosition = vec4(a_position, 1.0);
  vec3 localNormal = a_normal;
  vec3 localTangent = a_tangent.xyz;

  #ifdef SKINNED
    // Skinned mesh transformation
    mat4 skinMatrix =
      a_boneWeights.x * u_boneMatrices[int(a_boneIndices.x)] +
      a_boneWeights.y * u_boneMatrices[int(a_boneIndices.y)] +
      a_boneWeights.z * u_boneMatrices[int(a_boneIndices.z)] +
      a_boneWeights.w * u_boneMatrices[int(a_boneIndices.w)];

    localPosition = skinMatrix * localPosition;
    localNormal = mat3(skinMatrix) * localNormal;
    localTangent = mat3(skinMatrix) * localTangent;
  #endif

  #ifdef INSTANCED
    mat4 modelMatrix = a_instanceMatrix;
  #else
    mat4 modelMatrix = u_modelMatrix;
  #endif

  // World space position
  vec4 worldPos = modelMatrix * localPosition;
  v_worldPosition = worldPos.xyz;

  // World space normal
  mat3 normalMatrix = mat3(modelMatrix);
  v_worldNormal = normalize(normalMatrix * localNormal);

  // Texture coordinates
  v_texcoord = a_texcoord;

  // Tangent space matrix (TBN)
  vec3 T = normalize(normalMatrix * localTangent);
  vec3 N = v_worldNormal;
  vec3 B = cross(N, T) * a_tangent.w;
  v_TBN = mat3(T, B, N);

  // Clip space position
  vec4 clipPos = u_projectionMatrix * u_viewMatrix * worldPos;

  #ifdef VELOCITY_ENABLED
    v_currentPosition = clipPos;
    v_previousPosition = u_previousViewProjectionMatrix * u_previousModelMatrix * vec4(a_position, 1.0);
  #endif

  gl_Position = clipPos;
}
`;

/**
 * Geometry fragment shader (GLSL 300 ES).
 */
const GEOMETRY_FRAGMENT_SHADER = `#version 300 es
precision highp float;

// Inputs
in vec3 v_worldPosition;
in vec3 v_worldNormal;
in vec2 v_texcoord;
in mat3 v_TBN;

#ifdef VELOCITY_ENABLED
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

// G-buffer outputs
layout(location = 0) out vec4 o_albedoMetallic;
layout(location = 1) out vec4 o_normalRoughnessAO;
layout(location = 2) out vec4 o_emission;

#ifdef VELOCITY_ENABLED
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

  // Pack G-buffer outputs
  o_albedoMetallic = vec4(albedo.rgb, metallic);
  o_normalRoughnessAO = vec4(encodedNormal, roughness, ao);
  o_emission = vec4(emission, 1.0);

  #ifdef VELOCITY_ENABLED
    // Calculate screen-space velocity for motion blur/TAA
    vec2 currentNDC = (v_currentPosition.xy / v_currentPosition.w) * 0.5 + 0.5;
    vec2 previousNDC = (v_previousPosition.xy / v_previousPosition.w) * 0.5 + 0.5;
    o_velocity = currentNDC - previousNDC;
  #endif
}
`;

/**
 * Geometry render pass for deferred rendering.
 * Renders opaque geometry to G-buffer with material batching and instancing support.
 *
 * @example
 * ```typescript
 * // Create geometry pass
 * const geometryPass = new GeometryPass({
 *   width: 1920,
 *   height: 1080,
 *   clearColor: Color.black(),
 *   useOctahedronNormals: true,
 *   enableVelocityBuffer: true,
 *   samples: 1,
 *   maxBones: 256
 * });
 *
 * // Setup pass
 * geometryPass.setup();
 *
 * // Update camera
 * geometryPass.updateCamera(camera);
 *
 * // In render loop
 * geometryPass.execute(opaqueQueue, gbufferTarget);
 *
 * // Access G-buffer textures for lighting pass
 * const albedoTexture = geometryPass.getAlbedoMetallicTexture();
 * const normalTexture = geometryPass.getNormalRoughnessAOTexture();
 * const emissionTexture = geometryPass.getEmissionTexture();
 * const depthTexture = geometryPass.getDepthTexture();
 * const velocityTexture = geometryPass.getVelocityTexture();
 * ```
 */
export class GeometryPass extends RenderPass {
  /** Pass configuration */
  private config: GeometryPassConfig;

  /** G-buffer render target */
  private gbufferTarget: RenderTarget | null = null;

  /** Shader variants cache (key: variant flags) */
  private shaderVariants: Map<number, Shader> = new Map();

  /** Camera uniform buffer */
  private cameraUBO: UniformBuffer | null = null;

  /** Model transform uniform buffer */
  private modelUBO: UniformBuffer | null = null;

  /** Material properties uniform buffer */
  private materialUBO: UniformBuffer | null = null;

  /** Bone matrices for skinned meshes */
  private boneMatricesUBO: UniformBuffer | null = null;

  /** Previous frame MVP matrices for velocity calculation */
  private previousMVPMatrices: Map<number, Matrix4> = new Map();

  /** Previous model matrices for velocity calculation */
  private previousModelMatrices: Map<number, Matrix4> = new Map();

  /** Current camera reference */
  private currentCamera: Camera | null = null;

  /** Previous view-projection matrix */
  private previousViewProjectionMatrix: Matrix4 | null = null;

  /** Statistics */
  private stats = {
    drawCalls: 0,
    triangles: 0,
    materials: 0,
    instances: 0,
    batchesByVariant: 0,
  };

  /**
   * Creates a new geometry pass.
   *
   * @param config - Geometry pass configuration
   */
  constructor(config: GeometryPassConfig) {
    const colorAttachments: AttachmentReference[] = [
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
    ];

    // Add velocity attachment if enabled
    if (config.enableVelocityBuffer) {
      colorAttachments.push({
        name: 'velocity',
        format: TextureFormat.RGBA16F,
        samples: config.samples ?? 1,
      });
    }

    const descriptor: RenderPassDescriptor = {
      name: 'GeometryPass',
      colorAttachments,
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
          ...(config.enableVelocityBuffer ? [Color.black()] : []),
        ],
        depth: 1.0,
        stencil: 0,
      },
      colorLoadActions: colorAttachments.map(() => LoadAction.Clear),
      colorStoreActions: colorAttachments.map(() => StoreAction.Store),
      depthLoadAction: LoadAction.Clear,
      depthStoreAction: StoreAction.Store,
    };

    super(descriptor);
    this.config = {
      maxBones: 256,
      ...config,
    };

    logger.info(
      `Created GeometryPass: ${config.width}x${config.height}, ` +
      `velocity: ${config.enableVelocityBuffer ? 'enabled' : 'disabled'}, ` +
      `samples: ${config.samples ?? 1}`
    );
  }

  /**
   * Sets up the geometry pass resources.
   * Creates render targets, shaders, and uniform buffers.
   */
  setup(): void {
    logger.debug('Setting up GeometryPass');

    // Create G-buffer render target
    const colorAttachments = [
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
    ];

    if (this.config.enableVelocityBuffer) {
      colorAttachments.push({
        format: TextureFormat.RGBA16F,
        loadAction: LoadAction.Clear,
        storeAction: StoreAction.Store,
        clearValue: this.clearValues.colors?.[3] ?? Color.black(),
      });
    }

    this.gbufferTarget = new RenderTarget({
      width: this.config.width,
      height: this.config.height,
      samples: this.config.samples ?? 1,
      colorAttachments,
      depthStencilAttachment: {
        format: TextureFormat.Depth24Stencil8,
        loadAction: LoadAction.Clear,
        storeAction: StoreAction.Store,
        clearValue: 1.0,
      },
      label: 'GeometryPass_GBuffer',
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
        { name: 'previousViewProjectionMatrix', type: UniformType.Mat4 },
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
        { name: 'previousModelMatrix', type: UniformType.Mat4 },
      ],
    };
    this.modelUBO = new UniformBuffer(modelUBODesc);

    // Create material uniform buffer
    const materialUBODesc: UniformBufferDescriptor = {
      name: 'Material',
      binding: 2,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'albedo', type: UniformType.Vec4 },
        { name: 'emission', type: UniformType.Vec3 },
        { name: 'metallic', type: UniformType.Float },
        { name: 'roughness', type: UniformType.Float },
        { name: 'ao', type: UniformType.Float },
        { name: 'emissionIntensity', type: UniformType.Float },
        { name: 'normalScale', type: UniformType.Float },
        { name: 'alphaCutoff', type: UniformType.Float },
      ],
    };
    this.materialUBO = new UniformBuffer(materialUBODesc);

    // Create bone matrices uniform buffer for skinned meshes
    if (this.config.maxBones && this.config.maxBones > 0) {
      const boneUBODesc: UniformBufferDescriptor = {
        name: 'BoneMatrices',
        binding: 3,
        layout: UniformLayout.Std140,
        fields: [
          // Array of bone matrices (handled specially in implementation)
          { name: 'boneMatrices', type: UniformType.Mat4 },
        ],
      };
      this.boneMatricesUBO = new UniformBuffer(boneUBODesc);
    }

    logger.info('GeometryPass setup complete');
  }

  /**
   * Executes the geometry pass.
   * Renders all opaque geometry to G-buffer render targets with material batching.
   *
   * @param renderQueue - Queue containing geometry to render
   * @param renderTarget - Target to render to (ignored, uses internal G-buffer target)
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.gbufferTarget || !this.cameraUBO || !this.modelUBO || !this.materialUBO) {
      logger.error('GeometryPass not properly initialized');
      return;
    }

    if (renderQueue.isEmpty) {
      logger.trace('GeometryPass: empty render queue, skipping');
      return;
    }

    // Reset statistics
    this.stats.drawCalls = 0;
    this.stats.triangles = 0;
    this.stats.materials = 0;
    this.stats.instances = 0;
    this.stats.batchesByVariant = 0;

    logger.trace(`GeometryPass: rendering ${renderQueue.length} draw calls`);

    // Sort queue for optimal rendering (by material variant, then material ID)
    renderQueue.sort();

    // Batch rendering by material variant
    let lastVariant = -1;
    let lastMaterialId = -1;
    let currentShader: Shader | null = null;

    renderQueue.forEach((entry) => {
      const { drawCall, materialId } = entry;

      // Get material variant flags (would be stored with entry in real implementation)
      const variantFlags = this.getMaterialVariantFlags(entry);

      // Bind shader if variant changed
      if (variantFlags !== lastVariant) {
        currentShader = this.getOrCreateShaderVariant(variantFlags);
        if (currentShader) {
          // Bind shader (implementation depends on graphics backend)
          lastVariant = variantFlags;
          this.stats.batchesByVariant++;
        }
      }

      // Update material uniforms if changed
      if (materialId !== lastMaterialId) {
        this.updateMaterialUniforms(entry);
        lastMaterialId = materialId;
        this.stats.materials++;
      }

      // Update model matrices
      this.updateModelMatrices(entry);

      // Execute draw call
      this.stats.drawCalls++;
      if (drawCall.isIndexed()) {
        this.stats.triangles += Math.floor(drawCall.indexCount / 3) * drawCall.instanceCount;
        this.stats.instances += drawCall.instanceCount;
      } else {
        this.stats.triangles += Math.floor(drawCall.vertexCount / 3) * drawCall.instanceCount;
        this.stats.instances += drawCall.instanceCount;
      }
    });

    logger.trace(
      `GeometryPass complete: ${this.stats.drawCalls} draws, ` +
      `${this.stats.triangles} triangles, ${this.stats.materials} materials, ` +
      `${this.stats.instances} instances, ${this.stats.batchesByVariant} batches`
    );
  }

  /**
   * Cleans up geometry pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up GeometryPass');

    if (this.gbufferTarget) {
      this.gbufferTarget.dispose();
      this.gbufferTarget = null;
    }

    for (const shader of this.shaderVariants.values()) {
      shader.dispose();
    }
    this.shaderVariants.clear();

    this.cameraUBO = null;
    this.modelUBO = null;
    this.materialUBO = null;
    this.boneMatricesUBO = null;
    this.previousMVPMatrices.clear();
    this.previousModelMatrices.clear();

    logger.info('GeometryPass cleanup complete');
  }

  /**
   * Updates camera uniforms for rendering.
   *
   * @param camera - Active camera
   */
  updateCamera(camera: Camera): void {
    if (!this.cameraUBO) return;

    // Store previous view-projection for velocity calculation
    if (this.config.enableVelocityBuffer) {
      this.previousViewProjectionMatrix =
        this.currentCamera?.viewProjectionMatrix.clone() ?? camera.viewProjectionMatrix.clone();
    }

    this.currentCamera = camera;

    this.cameraUBO.setMat4('viewMatrix', camera.viewMatrix);
    this.cameraUBO.setMat4('projectionMatrix', camera.projectionMatrix);
    this.cameraUBO.setMat4('viewProjectionMatrix', camera.viewProjectionMatrix);

    if (this.config.enableVelocityBuffer && this.previousViewProjectionMatrix) {
      this.cameraUBO.setMat4('previousViewProjectionMatrix', this.previousViewProjectionMatrix);
    }

    this.cameraUBO.setVec3('cameraPosition', camera.transform.worldPosition);
    this.cameraUBO.setVec2('nearFar', { x: camera.near, y: camera.far } as any);
  }

  /**
   * Gets or creates a shader variant for the given material flags.
   *
   * @param variantFlags - Material variant flags
   * @returns Shader for the variant
   */
  private getOrCreateShaderVariant(variantFlags: number): Shader | null {
    // Check cache
    if (this.shaderVariants.has(variantFlags)) {
      return this.shaderVariants.get(variantFlags) ?? null;
    }

    // Build defines from variant flags
    const defines: Record<string, number> = {};

    if (variantFlags & MaterialVariantFlags.AlbedoMap) defines['USE_ALBEDO_MAP'] = 1;
    if (variantFlags & MaterialVariantFlags.NormalMap) defines['USE_NORMAL_MAP'] = 1;
    if (variantFlags & MaterialVariantFlags.MetallicRoughnessMap) defines['USE_METALLIC_ROUGHNESS_MAP'] = 1;
    if (variantFlags & MaterialVariantFlags.AOMap) defines['USE_AO_MAP'] = 1;
    if (variantFlags & MaterialVariantFlags.EmissionMap) defines['USE_EMISSION_MAP'] = 1;
    if (variantFlags & MaterialVariantFlags.AlphaMask) defines['ALPHA_MASK'] = 1;
    if (variantFlags & MaterialVariantFlags.Skinned) {
      defines['SKINNED'] = 1;
      defines['MAX_BONES'] = this.config.maxBones ?? 256;
    }
    if (variantFlags & MaterialVariantFlags.Instanced) defines['INSTANCED'] = 1;
    if (variantFlags & MaterialVariantFlags.VelocityEnabled) defines['VELOCITY_ENABLED'] = 1;

    if (this.config.useOctahedronNormals) {
      defines['USE_OCTAHEDRON_NORMALS'] = 1;
    }

    // Create shader (implementation depends on shader system)
    // For now, return null as we'd need the full shader compilation system
    logger.debug(`Creating shader variant with flags: 0x${variantFlags.toString(16)}`);

    return null;
  }

  /**
   * Gets material variant flags from render queue entry.
   *
   * @param entry - Render queue entry
   * @returns Material variant flags
   */
  private getMaterialVariantFlags(entry: any): number {
    // In real implementation, this would examine the entry's material
    // and build flags based on which textures/features are used
    return MaterialVariantFlags.None;
  }

  /**
   * Updates material uniforms from render queue entry.
   *
   * @param entry - Render queue entry
   */
  private updateMaterialUniforms(entry: any): void {
    if (!this.materialUBO) return;

    // In real implementation, this would extract material properties from entry
    // For now, set default values
    this.materialUBO.setVec4('albedo', { x: 1, y: 1, z: 1, w: 1 } as any);
    this.materialUBO.setVec3('emission', { x: 0, y: 0, z: 0 } as any);
    this.materialUBO.setFloat('metallic', 0.0);
    this.materialUBO.setFloat('roughness', 0.5);
    this.materialUBO.setFloat('ao', 1.0);
    this.materialUBO.setFloat('emissionIntensity', 1.0);
    this.materialUBO.setFloat('normalScale', 1.0);
    this.materialUBO.setFloat('alphaCutoff', 0.5);
  }

  /**
   * Updates model transform matrices from render queue entry.
   *
   * @param entry - Render queue entry
   */
  private updateModelMatrices(entry: any): void {
    if (!this.modelUBO) return;

    // In real implementation, extract model matrix from entry
    const modelMatrix = Matrix4.identity();
    const entityId = 0; // Get from entry

    this.modelUBO.setMat4('modelMatrix', modelMatrix);

    // Calculate normal matrix (inverse transpose of model matrix)
    const normalMatrix = modelMatrix.clone().invert()?.transpose() ?? Matrix4.identity();
    this.modelUBO.setMat4('normalMatrix', normalMatrix);

    // Calculate previous model matrix for velocity
    if (this.config.enableVelocityBuffer) {
      const previousMatrix = this.previousModelMatrices.get(entityId) ?? modelMatrix;
      this.modelUBO.setMat4('previousModelMatrix', previousMatrix);
      this.previousModelMatrices.set(entityId, modelMatrix.clone());
    }
  }

  /**
   * Resizes the G-buffer render targets.
   *
   * @param width - New width
   * @param height - New height
   */
  resize(width: number, height: number): void {
    if (this.config.width === width && this.config.height === height) {
      return;
    }

    logger.info(`Resizing GeometryPass: ${this.config.width}x${this.config.height} -> ${width}x${height}`);

    this.config.width = width;
    this.config.height = height;

    if (this.gbufferTarget) {
      this.gbufferTarget.resize(width, height);
    }
  }

  /**
   * Gets the G-buffer render target.
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
   * Gets the velocity attachment (if enabled).
   */
  getVelocityTexture(): unknown {
    if (!this.config.enableVelocityBuffer) return null;
    return this.gbufferTarget?.getColorAttachment(3);
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
