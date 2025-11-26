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
 * Debug visualization mode.
 */
export enum DebugMode {
  None = 0,
  Wireframe = 1,
  Normals = 2,
  Bounds = 3,
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
  /** Debug visualization mode */
  debugMode?: DebugMode;
  /** Wireframe line width (for wireframe mode) */
  wireframeWidth?: number;
  /** Normal vector length (for normals mode) */
  normalLength?: number;
  /** Wireframe color */
  wireframeColor?: Color;
  /** Fill color for wireframe mode */
  wireframeFillColor?: Color;
  /** Normal vector color */
  normalColor?: Color;
  /** Bounds color */
  boundsColor?: Color;
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
 * Wireframe debug vertex shader (GLSL 300 ES).
 * Uses barycentric coordinates to render wireframe overlays.
 */
const WIREFRAME_VERTEX_SHADER = `#version 300 es
precision highp float;

// Vertex attributes
in vec3 a_position;
in vec3 a_normal;

#ifdef INSTANCED
in mat4 a_instanceMatrix;
#endif

// Uniforms
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;

// Outputs - barycentric coordinates for edge detection
out vec3 v_barycentric;
out vec3 v_worldNormal;

void main() {
  // Compute barycentric coordinates based on vertex ID
  // Triangle vertices get (1,0,0), (0,1,0), (0,0,1)
  int vertexId = gl_VertexID % 3;
  v_barycentric = vec3(
    vertexId == 0 ? 1.0 : 0.0,
    vertexId == 1 ? 1.0 : 0.0,
    vertexId == 2 ? 1.0 : 0.0
  );

  #ifdef INSTANCED
    mat4 modelMatrix = a_instanceMatrix;
  #else
    mat4 modelMatrix = u_modelMatrix;
  #endif

  vec4 worldPos = modelMatrix * vec4(a_position, 1.0);
  v_worldNormal = mat3(modelMatrix) * a_normal;

  gl_Position = u_projectionMatrix * u_viewMatrix * worldPos;
}
`;

/**
 * Wireframe debug fragment shader (GLSL 300 ES).
 * Renders edges using barycentric coordinates.
 */
const WIREFRAME_FRAGMENT_SHADER = `#version 300 es
precision highp float;

// Inputs
in vec3 v_barycentric;
in vec3 v_worldNormal;

// Uniforms
uniform vec4 u_wireColor;
uniform vec4 u_fillColor;
uniform float u_wireWidth;

// Output
out vec4 o_color;

void main() {
  // Calculate distance to nearest edge using barycentric coordinates
  float edge = min(v_barycentric.x, min(v_barycentric.y, v_barycentric.z));

  // Smooth transition for anti-aliasing
  float wire = smoothstep(0.0, u_wireWidth, edge);

  // Mix wire color and fill color based on proximity to edge
  vec4 color = mix(u_wireColor, u_fillColor, wire);

  // Optional: Add basic lighting for depth perception
  vec3 normal = normalize(v_worldNormal);
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
  float ndotl = max(dot(normal, lightDir), 0.0) * 0.3 + 0.7;

  o_color = vec4(color.rgb * ndotl, color.a);
}
`;

/**
 * Normal visualization vertex shader (GLSL 300 ES).
 * Generates line segments for normal vectors.
 */
const NORMAL_DEBUG_VERTEX_SHADER = `#version 300 es
precision highp float;

// Vertex attributes
in vec3 a_position;
in vec3 a_normal;

#ifdef INSTANCED
in mat4 a_instanceMatrix;
#endif

// Uniforms
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform float u_normalLength;

// Output
out vec3 v_color;

void main() {
  #ifdef INSTANCED
    mat4 modelMatrix = a_instanceMatrix;
  #else
    mat4 modelMatrix = u_modelMatrix;
  #endif

  vec4 worldPos = modelMatrix * vec4(a_position, 1.0);
  vec3 worldNormal = normalize(mat3(modelMatrix) * a_normal);

  // Generate line segment: even vertices at base, odd vertices at tip
  vec3 position = worldPos.xyz;
  if (gl_VertexID % 2 == 1) {
    position += worldNormal * u_normalLength;
    v_color = vec3(1.0, 1.0, 0.0); // Yellow tip
  } else {
    v_color = vec3(0.0, 0.5, 1.0); // Blue base
  }

  gl_Position = u_projectionMatrix * u_viewMatrix * vec4(position, 1.0);
}
`;

/**
 * Normal visualization fragment shader (GLSL 300 ES).
 */
const NORMAL_DEBUG_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 v_color;
out vec4 o_color;

void main() {
  o_color = vec4(v_color, 1.0);
}
`;

/**
 * Bounding box visualization vertex shader (GLSL 300 ES).
 * Renders AABB/OBB as line boxes.
 */
const BOUNDS_DEBUG_VERTEX_SHADER = `#version 300 es
precision highp float;

// Vertex attributes - box corners
in vec3 a_position;

#ifdef INSTANCED
in mat4 a_instanceMatrix;
in vec3 a_boundsMin;
in vec3 a_boundsMax;
#endif

// Uniforms
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform vec3 u_boundsMin;
uniform vec3 u_boundsMax;

void main() {
  vec3 boundsMin = u_boundsMin;
  vec3 boundsMax = u_boundsMax;

  #ifdef INSTANCED
    mat4 modelMatrix = a_instanceMatrix;
    boundsMin = a_boundsMin;
    boundsMax = a_boundsMax;
  #else
    mat4 modelMatrix = u_modelMatrix;
  #endif

  // Generate box corner from vertex ID (0-7 for 8 corners)
  vec3 corner = vec3(
    (gl_VertexID & 1) != 0 ? boundsMax.x : boundsMin.x,
    (gl_VertexID & 2) != 0 ? boundsMax.y : boundsMin.y,
    (gl_VertexID & 4) != 0 ? boundsMax.z : boundsMin.z
  );

  vec4 worldPos = modelMatrix * vec4(corner, 1.0);
  gl_Position = u_projectionMatrix * u_viewMatrix * worldPos;
}
`;

/**
 * Bounding box visualization fragment shader (GLSL 300 ES).
 */
const BOUNDS_DEBUG_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec4 u_boundsColor;
out vec4 o_color;

void main() {
  o_color = u_boundsColor;
}
`;

/**
 * Geometry render pass for deferred rendering.
 * Renders opaque geometry to G-buffer with material batching and instancing support.
 * Includes debug visualization modes for wireframes, normals, and bounding boxes.
 *
 * @example
 * ```typescript
 * // Create geometry pass with standard rendering
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
 *
 * // Debug visualization - wireframe mode
 * geometryPass.setDebugMode(DebugMode.Wireframe);
 * geometryPass.updateDebugParams({
 *   wireframeWidth: 0.015,
 *   wireframeColor: new Color(0.0, 1.0, 1.0, 1.0), // Cyan
 *   wireframeFillColor: new Color(0.1, 0.1, 0.1, 0.3) // Dark transparent
 * });
 *
 * // Debug visualization - normals mode
 * geometryPass.setDebugMode(DebugMode.Normals);
 * geometryPass.updateDebugParams({
 *   normalLength: 0.2,
 *   normalColor: new Color(1.0, 1.0, 0.0, 1.0) // Yellow
 * });
 *
 * // Debug visualization - bounds mode
 * geometryPass.setDebugMode(DebugMode.Bounds);
 * geometryPass.updateDebugParams({
 *   boundsColor: new Color(1.0, 0.0, 1.0, 1.0) // Magenta
 * });
 *
 * // Back to normal rendering
 * geometryPass.setDebugMode(DebugMode.None);
 * ```
 */
export class GeometryPass extends RenderPass {
  /** Pass configuration */
  private config: GeometryPassConfig;

  /** G-buffer render target */
  private gbufferTarget: RenderTarget | null = null;

  /** Shader variants cache (key: variant flags) */
  private shaderVariants: Map<number, Shader> = new Map();

  /** Debug shaders */
  private wireframeShader: Shader | null = null;
  private normalDebugShader: Shader | null = null;
  private boundsDebugShader: Shader | null = null;

  /** Debug uniform buffer */
  private debugUBO: UniformBuffer | null = null;

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

    // Create debug uniform buffer for debug visualization modes
    const debugUBODesc: UniformBufferDescriptor = {
      name: 'Debug',
      binding: 4,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'wireColor', type: UniformType.Vec4 },
        { name: 'fillColor', type: UniformType.Vec4 },
        { name: 'normalColor', type: UniformType.Vec4 },
        { name: 'boundsColor', type: UniformType.Vec4 },
        { name: 'wireWidth', type: UniformType.Float },
        { name: 'normalLength', type: UniformType.Float },
        { name: 'boundsMin', type: UniformType.Vec3 },
        { name: 'boundsMax', type: UniformType.Vec3 },
      ],
    };
    this.debugUBO = new UniformBuffer(debugUBODesc);

    // Initialize debug shader uniforms with defaults
    this.debugUBO.setVec4('wireColor', this.config.wireframeColor ?? new Color(0.0, 1.0, 1.0, 1.0));
    this.debugUBO.setVec4('fillColor', this.config.wireframeFillColor ?? new Color(0.1, 0.1, 0.1, 0.3));
    this.debugUBO.setVec4('normalColor', this.config.normalColor ?? new Color(1.0, 1.0, 0.0, 1.0));
    this.debugUBO.setVec4('boundsColor', this.config.boundsColor ?? new Color(1.0, 0.0, 1.0, 1.0));
    this.debugUBO.setFloat('wireWidth', this.config.wireframeWidth ?? 0.01);
    this.debugUBO.setFloat('normalLength', this.config.normalLength ?? 0.1);
    this.debugUBO.setVec3('boundsMin', new Vector3(-1, -1, -1));
    this.debugUBO.setVec3('boundsMax', new Vector3(1, 1, 1));

    // Create debug shaders if needed
    if (this.config.debugMode !== undefined && this.config.debugMode !== DebugMode.None) {
      this.setupDebugShaders();
    }

    logger.info('GeometryPass setup complete');
  }

  /**
   * Sets up debug visualization shaders.
   */
  private setupDebugShaders(): void {
    logger.debug('Setting up debug shaders');

    // Create wireframe shader
    // In a real implementation, this would compile the shader sources
    // For now, we log that we're creating them
    logger.debug('Creating wireframe debug shader');
    // this.wireframeShader = new Shader({
    //   vertexSource: WIREFRAME_VERTEX_SHADER,
    //   fragmentSource: WIREFRAME_FRAGMENT_SHADER,
    //   name: 'WireframeDebug'
    // });

    // Create normal visualization shader
    logger.debug('Creating normal debug shader');
    // this.normalDebugShader = new Shader({
    //   vertexSource: NORMAL_DEBUG_VERTEX_SHADER,
    //   fragmentSource: NORMAL_DEBUG_FRAGMENT_SHADER,
    //   name: 'NormalDebug'
    // });

    // Create bounds visualization shader
    logger.debug('Creating bounds debug shader');
    // this.boundsDebugShader = new Shader({
    //   vertexSource: BOUNDS_DEBUG_VERTEX_SHADER,
    //   fragmentSource: BOUNDS_DEBUG_FRAGMENT_SHADER,
    //   name: 'BoundsDebug'
    // });

    logger.info('Debug shaders setup complete');
  }

  /**
   * Executes the geometry pass.
   * Renders all opaque geometry to G-buffer render targets with material batching.
   * Supports debug visualization modes for wireframes, normals, and bounding boxes.
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

    // Check if we're in a debug visualization mode
    const debugMode = this.config.debugMode ?? DebugMode.None;

    if (debugMode !== DebugMode.None) {
      // Execute debug rendering pass
      this.executeDebugPass(renderQueue, debugMode);
      return;
    }

    // Standard geometry rendering
    this.executeStandardPass(renderQueue);

    logger.trace(
      `GeometryPass complete: ${this.stats.drawCalls} draws, ` +
      `${this.stats.triangles} triangles, ${this.stats.materials} materials, ` +
      `${this.stats.instances} instances, ${this.stats.batchesByVariant} batches`
    );
  }

  /**
   * Executes standard geometry rendering pass.
   *
   * @param renderQueue - Queue containing geometry to render
   */
  private executeStandardPass(renderQueue: RenderQueue): void {
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
  }

  /**
   * Executes debug visualization rendering pass.
   *
   * @param renderQueue - Queue containing geometry to render
   * @param debugMode - Debug visualization mode to use
   */
  private executeDebugPass(renderQueue: RenderQueue, debugMode: DebugMode): void {
    if (!this.debugUBO) {
      logger.error('Debug UBO not initialized');
      return;
    }

    logger.trace(`GeometryPass: executing debug mode ${DebugMode[debugMode]}`);

    switch (debugMode) {
      case DebugMode.Wireframe:
        this.renderWireframe(renderQueue);
        break;
      case DebugMode.Normals:
        this.renderNormals(renderQueue);
        break;
      case DebugMode.Bounds:
        this.renderBounds(renderQueue);
        break;
      default:
        logger.warn(`Unknown debug mode: ${debugMode}`);
        break;
    }

    logger.trace(
      `GeometryPass debug complete: ${this.stats.drawCalls} draws, ` +
      `${this.stats.triangles} triangles`
    );
  }

  /**
   * Renders all geometry as wireframes using barycentric coordinates.
   *
   * @param renderQueue - Queue containing geometry to render
   */
  private renderWireframe(renderQueue: RenderQueue): void {
    if (!this.wireframeShader) {
      logger.warn('Wireframe shader not initialized, skipping wireframe rendering');
      return;
    }

    logger.trace('Rendering wireframe overlay');

    // Bind wireframe shader
    // In real implementation: this.wireframeShader.bind();

    // Bind debug uniforms
    // In real implementation: this.debugUBO.bind();

    // Set render state for wireframe
    // In real implementation:
    // - Enable depth test
    // - Enable blending for transparent fills
    // - Set polygon mode to fill (we're using barycentric coordinates, not line mode)
    // - Set line width if using line mode

    renderQueue.forEach((entry) => {
      const { drawCall } = entry;

      // Update model matrices for this object
      this.updateModelMatrices(entry);

      // Bind model uniform buffer
      // In real implementation: this.modelUBO.bind();

      // Execute draw call with wireframe shader
      // The shader will use barycentric coordinates to render edges
      this.stats.drawCalls++;

      if (drawCall.isIndexed()) {
        // Draw indexed geometry
        // In real implementation: gl.drawElements(gl.TRIANGLES, indexCount, indexType, offset)
        this.stats.triangles += Math.floor(drawCall.indexCount / 3) * drawCall.instanceCount;
        this.stats.instances += drawCall.instanceCount;
      } else {
        // Draw non-indexed geometry
        // In real implementation: gl.drawArrays(gl.TRIANGLES, 0, vertexCount)
        this.stats.triangles += Math.floor(drawCall.vertexCount / 3) * drawCall.instanceCount;
        this.stats.instances += drawCall.instanceCount;
      }
    });

    logger.debug(
      `Wireframe rendering complete: ${this.stats.drawCalls} objects, ${this.stats.triangles} triangles`
    );
  }

  /**
   * Renders normal vectors as colored line segments.
   *
   * @param renderQueue - Queue containing geometry to render
   */
  private renderNormals(renderQueue: RenderQueue): void {
    if (!this.normalDebugShader) {
      logger.warn('Normal debug shader not initialized, skipping normal rendering');
      return;
    }

    logger.trace('Rendering normal vectors');

    // Bind normal visualization shader
    // In real implementation: this.normalDebugShader.bind();

    // Bind debug uniforms
    // In real implementation: this.debugUBO.bind();

    // Set render state for line rendering
    // In real implementation:
    // - Enable depth test
    // - Disable blending
    // - Set line width if supported

    renderQueue.forEach((entry) => {
      const { drawCall } = entry;

      // Update model matrices for this object
      this.updateModelMatrices(entry);

      // Bind model uniform buffer
      // In real implementation: this.modelUBO.bind();

      // Execute draw call as lines
      // The vertex shader generates line segments from position + normal
      // Each vertex is duplicated: base vertex at position, end vertex at position + normal * length
      this.stats.drawCalls++;

      if (drawCall.isIndexed()) {
        // Draw normal lines for each vertex
        // In real implementation: gl.drawElements(gl.LINES, indexCount * 2, indexType, offset)
        const normalCount = drawCall.indexCount;
        this.stats.triangles += normalCount; // Count as "triangles" for stats
        this.stats.instances += drawCall.instanceCount;
      } else {
        // Draw normal lines for each vertex
        // In real implementation: gl.drawArrays(gl.LINES, 0, vertexCount * 2)
        const normalCount = drawCall.vertexCount;
        this.stats.triangles += normalCount; // Count as "triangles" for stats
        this.stats.instances += drawCall.instanceCount;
      }
    });

    logger.debug(
      `Normal rendering complete: ${this.stats.drawCalls} objects, ${this.stats.triangles} normals`
    );
  }

  /**
   * Renders bounding boxes (AABB or OBB) as line boxes.
   *
   * @param renderQueue - Queue containing geometry to render
   */
  private renderBounds(renderQueue: RenderQueue): void {
    if (!this.boundsDebugShader) {
      logger.warn('Bounds debug shader not initialized, skipping bounds rendering');
      return;
    }

    logger.trace('Rendering bounding boxes');

    // Bind bounds visualization shader
    // In real implementation: this.boundsDebugShader.bind();

    // Bind debug uniforms
    // In real implementation: this.debugUBO.bind();

    // Set render state for line rendering
    // In real implementation:
    // - Enable depth test
    // - Disable blending
    // - Set line width if supported

    // Line indices for a box (12 edges, 24 indices)
    // Defines the edges connecting the 8 corners of a bounding box
    const boxLineIndices = [
      // Bottom face (Z-)
      0, 1, 1, 3, 3, 2, 2, 0,
      // Top face (Z+)
      4, 5, 5, 7, 7, 6, 6, 4,
      // Vertical edges
      0, 4, 1, 5, 2, 6, 3, 7,
    ];

    renderQueue.forEach((entry) => {
      const { drawCall } = entry;

      // Update model matrices for this object
      this.updateModelMatrices(entry);

      // Get bounding box from draw call or entity
      // In real implementation, extract from entry:
      // const bounds = entry.mesh.bounds;
      // this.debugUBO.setVec3('boundsMin', bounds.min);
      // this.debugUBO.setVec3('boundsMax', bounds.max);

      // Bind model and debug uniform buffers
      // In real implementation:
      // this.modelUBO.bind();
      // this.debugUBO.bind();

      // Execute draw call for bounding box
      // The vertex shader generates 8 corners from boundsMin/boundsMax
      // We draw these as lines using the box line indices
      this.stats.drawCalls++;

      // Draw box lines (12 edges, 24 vertices with line list)
      // In real implementation: gl.drawElements(gl.LINES, 24, gl.UNSIGNED_SHORT, boxLineIndices)
      this.stats.triangles += 12; // 12 edges
      this.stats.instances += drawCall.instanceCount;
    });

    logger.debug(
      `Bounds rendering complete: ${this.stats.drawCalls} boxes, ${this.stats.triangles} edges`
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

    // Clean up debug shaders
    if (this.wireframeShader) {
      this.wireframeShader.dispose();
      this.wireframeShader = null;
    }
    if (this.normalDebugShader) {
      this.normalDebugShader.dispose();
      this.normalDebugShader = null;
    }
    if (this.boundsDebugShader) {
      this.boundsDebugShader.dispose();
      this.boundsDebugShader = null;
    }

    this.cameraUBO = null;
    this.modelUBO = null;
    this.materialUBO = null;
    this.boneMatricesUBO = null;
    this.debugUBO = null;
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
   * Sets the debug visualization mode.
   * Automatically sets up debug shaders if switching from None to a debug mode.
   *
   * @param mode - Debug mode to enable
   */
  setDebugMode(mode: DebugMode): void {
    const previousMode = this.config.debugMode ?? DebugMode.None;
    this.config.debugMode = mode;

    // Setup debug shaders if switching from None to a debug mode
    if (previousMode === DebugMode.None && mode !== DebugMode.None) {
      this.setupDebugShaders();
    }

    logger.info(`Debug mode changed: ${DebugMode[previousMode]} -> ${DebugMode[mode]}`);
  }

  /**
   * Gets the current debug visualization mode.
   */
  getDebugMode(): DebugMode {
    return this.config.debugMode ?? DebugMode.None;
  }

  /**
   * Updates debug visualization parameters.
   *
   * @param params - Debug parameters to update
   */
  updateDebugParams(params: {
    wireframeWidth?: number;
    wireframeColor?: Color;
    wireframeFillColor?: Color;
    normalLength?: number;
    normalColor?: Color;
    boundsColor?: Color;
  }): void {
    if (!this.debugUBO) {
      logger.warn('Debug UBO not initialized, cannot update debug params');
      return;
    }

    if (params.wireframeWidth !== undefined) {
      this.config.wireframeWidth = params.wireframeWidth;
      this.debugUBO.setFloat('wireWidth', params.wireframeWidth);
    }

    if (params.wireframeColor !== undefined) {
      this.config.wireframeColor = params.wireframeColor;
      this.debugUBO.setVec4('wireColor', params.wireframeColor);
    }

    if (params.wireframeFillColor !== undefined) {
      this.config.wireframeFillColor = params.wireframeFillColor;
      this.debugUBO.setVec4('fillColor', params.wireframeFillColor);
    }

    if (params.normalLength !== undefined) {
      this.config.normalLength = params.normalLength;
      this.debugUBO.setFloat('normalLength', params.normalLength);
    }

    if (params.normalColor !== undefined) {
      this.config.normalColor = params.normalColor;
      this.debugUBO.setVec4('normalColor', params.normalColor);
    }

    if (params.boundsColor !== undefined) {
      this.config.boundsColor = params.boundsColor;
      this.debugUBO.setVec4('boundsColor', params.boundsColor);
    }

    logger.debug('Debug parameters updated');
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
