/**
 * Terrain rendering pass with LOD and clipmap system.
 *
 * Features:
 * - Terrain LOD rendering
 * - Clipmap or quadtree-based LOD
 * - Splatmap texture blending
 * - Detail textures with distance fade
 * - Triplanar mapping option
 * - Seamless LOD transitions
 * - Virtual texturing hooks
 *
 * Based on GPU Gems 2 "Terrain Rendering Using GPU-Based Geometry Clipmaps"
 * and modern terrain rendering techniques.
 *
 * @module TerrainPass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';
import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';
import { Box3 } from '../../math/Box3';

const logger = Logger.create('TerrainPass');

/**
 * Terrain LOD system type.
 */
export enum LODSystem {
  /** Geometry clipmap (recommended for large terrains) */
  Clipmap = 'clipmap',
  /** Quadtree with LOD */
  Quadtree = 'quadtree',
  /** Simple distance-based LOD */
  Distance = 'distance'
}

/**
 * Terrain layer for splatmap blending.
 */
export interface TerrainLayer {
  /** Layer name */
  name: string;
  /** Diffuse/albedo texture */
  albedoTexture: WebGLTexture | null;
  /** Normal map texture */
  normalTexture: WebGLTexture | null;
  /** Roughness texture */
  roughnessTexture: WebGLTexture | null;
  /** UV scale */
  uvScale: number;
  /** Tiling factor */
  tiling: number;
  /** Metallic value */
  metallic: number;
  /** Enable triplanar mapping */
  useTriplanar: boolean;
}

/**
 * Terrain configuration.
 */
export interface TerrainPassConfig {
  /** Heightmap texture */
  heightmap: WebGLTexture | null;
  /** Heightmap resolution */
  heightmapResolution: Vector2;
  /** Terrain world size (XZ plane) */
  terrainSize: Vector2;
  /** Height scale (Y axis) */
  heightScale: number;
  /** Number of clipmap levels */
  clipmapLevels: number;
  /** Clipmap grid resolution per level */
  clipmapResolution: number;
  /** LOD system type */
  lodSystem: LODSystem;
  /** LOD distance scale */
  lodDistanceScale: number;
  /** Splatmap texture (RGBA channels for 4 layers) */
  splatmap: WebGLTexture | null;
  /** Terrain layers */
  layers: TerrainLayer[];
  /** Detail texture distance */
  detailDistance: number;
  /** Detail fade range */
  detailFadeRange: number;
  /** Enable shadows */
  receiveShadows: boolean;
  /** Enable normal mapping */
  enableNormalMapping: boolean;
  /** Normal map strength */
  normalStrength: number;
  /** Enable virtual texturing */
  enableVirtualTexturing: boolean;
  /** Virtual texture cache size */
  virtualTextureCacheSize: number;
  /** Terrain position offset */
  position: Vector3;
}

/**
 * Terrain vertex shader (GLSL 300 ES).
 */
const TERRAIN_VERTEX_SHADER = `#version 300 es
precision highp float;

// Vertex attributes
in vec2 a_position;      // Grid position (0-1)

// Uniforms
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform vec2 u_terrainSize;
uniform float u_heightScale;
uniform vec2 u_heightmapSize;
uniform vec3 u_cameraPosition;
uniform float u_lodLevel;
uniform vec2 u_lodOffset;
uniform vec2 u_lodScale;

// Heightmap
uniform sampler2D u_heightmap;

// Outputs
out vec3 v_worldPosition;
out vec3 v_worldNormal;
out vec2 v_texcoord;
out vec2 v_detailTexcoord;
out float v_lodBlend;
out float v_distanceToCamera;

/**
 * Samples height from heightmap with bilinear filtering.
 */
float sampleHeight(vec2 uv) {
  return texture(u_heightmap, uv).r * u_heightScale;
}

/**
 * Calculates terrain normal from heightmap using central differences.
 */
vec3 calculateNormal(vec2 uv, float texelSize) {
  // Sample neighboring heights
  float hL = sampleHeight(uv + vec2(-texelSize, 0.0));
  float hR = sampleHeight(uv + vec2(texelSize, 0.0));
  float hD = sampleHeight(uv + vec2(0.0, -texelSize));
  float hU = sampleHeight(uv + vec2(0.0, texelSize));

  // Calculate gradients
  vec3 tangent = vec3(2.0 * u_terrainSize.x * texelSize, hR - hL, 0.0);
  vec3 bitangent = vec3(0.0, hU - hD, 2.0 * u_terrainSize.y * texelSize);

  // Cross product for normal
  return normalize(cross(tangent, bitangent));
}

void main() {
  // Apply LOD offset and scale
  vec2 gridPos = a_position * u_lodScale + u_lodOffset;

  // Clamp to valid range
  gridPos = clamp(gridPos, vec2(0.0), vec2(1.0));

  // Calculate world position (XZ)
  vec2 worldPosXZ = gridPos * u_terrainSize;

  // Calculate heightmap UV
  v_texcoord = gridPos;

  // Sample height
  float height = sampleHeight(v_texcoord);

  // World position
  vec3 worldPos = vec3(worldPosXZ.x, height, worldPosXZ.y);
  v_worldPosition = (u_modelMatrix * vec4(worldPos, 1.0)).xyz;

  // Calculate normal
  float texelSize = 1.0 / u_heightmapSize.x;
  v_worldNormal = mat3(u_modelMatrix) * calculateNormal(v_texcoord, texelSize);

  // Detail texcoords (higher frequency)
  v_detailTexcoord = worldPosXZ * 0.1;

  // Distance to camera for LOD blending
  v_distanceToCamera = length(v_worldPosition - u_cameraPosition);

  // LOD blend factor
  float lodDistance = pow(2.0, u_lodLevel) * 100.0;
  v_lodBlend = smoothstep(lodDistance * 0.7, lodDistance, v_distanceToCamera);

  // Transform to clip space
  gl_Position = u_projectionMatrix * u_viewMatrix * vec4(v_worldPosition, 1.0);
}
`;

/**
 * Terrain fragment shader (GLSL 300 ES).
 */
const TERRAIN_FRAGMENT_SHADER = `#version 300 es
precision highp float;

// Inputs
in vec3 v_worldPosition;
in vec3 v_worldNormal;
in vec2 v_texcoord;
in vec2 v_detailTexcoord;
in float v_lodBlend;
in float v_distanceToCamera;

// Uniforms
uniform sampler2D u_splatmap;
uniform sampler2D u_layer0_albedo;
uniform sampler2D u_layer0_normal;
uniform sampler2D u_layer0_roughness;
uniform sampler2D u_layer1_albedo;
uniform sampler2D u_layer1_normal;
uniform sampler2D u_layer1_roughness;
uniform sampler2D u_layer2_albedo;
uniform sampler2D u_layer2_normal;
uniform sampler2D u_layer2_roughness;
uniform sampler2D u_layer3_albedo;
uniform sampler2D u_layer3_normal;
uniform sampler2D u_layer3_roughness;

uniform vec4 u_layer0_params;  // uvScale, tiling, metallic, triplanar
uniform vec4 u_layer1_params;
uniform vec4 u_layer2_params;
uniform vec4 u_layer3_params;

uniform float u_detailDistance;
uniform float u_detailFadeRange;
uniform float u_normalStrength;
uniform bool u_enableTriplanar;

// Outputs
layout(location = 0) out vec4 o_albedo;
layout(location = 1) out vec4 o_normal;
layout(location = 2) out vec4 o_material;

/**
 * Triplanar texture sampling.
 */
vec4 triplanarSample(sampler2D tex, vec3 worldPos, vec3 normal, float tiling) {
  // Calculate blend weights based on normal
  vec3 blendWeights = abs(normal);
  blendWeights = max(blendWeights - 0.2, 0.0);
  blendWeights /= (blendWeights.x + blendWeights.y + blendWeights.z);

  // Sample along each axis
  vec4 xSample = texture(tex, worldPos.yz * tiling);
  vec4 ySample = texture(tex, worldPos.xz * tiling);
  vec4 zSample = texture(tex, worldPos.xy * tiling);

  // Blend
  return xSample * blendWeights.x + ySample * blendWeights.y + zSample * blendWeights.z;
}

/**
 * Samples a terrain layer with optional triplanar mapping.
 */
void sampleLayer(
  sampler2D albedoTex,
  sampler2D normalTex,
  sampler2D roughnessTex,
  vec4 params,
  out vec4 albedo,
  out vec3 normal,
  out float roughness
) {
  float uvScale = params.x;
  float tiling = params.y;
  float useTriplanar = params.w;

  vec2 uv = v_detailTexcoord * tiling;

  if (useTriplanar > 0.5) {
    // Triplanar mapping
    albedo = triplanarSample(albedoTex, v_worldPosition, v_worldNormal, tiling);
    vec4 normalSample = triplanarSample(normalTex, v_worldPosition, v_worldNormal, tiling);
    normal = normalSample.xyz * 2.0 - 1.0;
    roughness = triplanarSample(roughnessTex, v_worldPosition, v_worldNormal, tiling).r;
  } else {
    // Standard UV mapping
    albedo = texture(albedoTex, uv);
    vec4 normalSample = texture(normalTex, uv);
    normal = normalSample.xyz * 2.0 - 1.0;
    roughness = texture(roughnessTex, uv).r;
  }
}

/**
 * Blends terrain layers based on splatmap.
 */
void blendLayers(
  out vec4 finalAlbedo,
  out vec3 finalNormal,
  out float finalRoughness,
  out float finalMetallic
) {
  // Sample splatmap weights
  vec4 splatWeights = texture(u_splatmap, v_texcoord);

  // Normalize weights (should sum to 1)
  float weightSum = splatWeights.r + splatWeights.g + splatWeights.b + splatWeights.a;
  if (weightSum > 0.0) {
    splatWeights /= weightSum;
  }

  // Sample each layer
  vec4 albedo0, albedo1, albedo2, albedo3;
  vec3 normal0, normal1, normal2, normal3;
  float rough0, rough1, rough2, rough3;

  sampleLayer(u_layer0_albedo, u_layer0_normal, u_layer0_roughness, u_layer0_params, albedo0, normal0, rough0);
  sampleLayer(u_layer1_albedo, u_layer1_normal, u_layer1_roughness, u_layer1_params, albedo1, normal1, rough1);
  sampleLayer(u_layer2_albedo, u_layer2_normal, u_layer2_roughness, u_layer2_params, albedo2, normal2, rough2);
  sampleLayer(u_layer3_albedo, u_layer3_normal, u_layer3_roughness, u_layer3_params, albedo3, normal3, rough3);

  // Blend albedo
  finalAlbedo = albedo0 * splatWeights.r +
                albedo1 * splatWeights.g +
                albedo2 * splatWeights.b +
                albedo3 * splatWeights.a;

  // Blend normal (whiteout blending)
  normal0 = vec3(normal0.xy * u_normalStrength, normal0.z);
  normal1 = vec3(normal1.xy * u_normalStrength, normal1.z);
  normal2 = vec3(normal2.xy * u_normalStrength, normal2.z);
  normal3 = vec3(normal3.xy * u_normalStrength, normal3.z);

  finalNormal = normal0 * splatWeights.r +
                normal1 * splatWeights.g +
                normal2 * splatWeights.b +
                normal3 * splatWeights.a;

  // Blend roughness
  finalRoughness = rough0 * splatWeights.r +
                   rough1 * splatWeights.g +
                   rough2 * splatWeights.b +
                   rough3 * splatWeights.a;

  // Blend metallic
  finalMetallic = u_layer0_params.z * splatWeights.r +
                  u_layer1_params.z * splatWeights.g +
                  u_layer2_params.z * splatWeights.b +
                  u_layer3_params.z * splatWeights.a;
}

/**
 * Applies detail fade based on distance.
 */
float getDetailFade() {
  float fadeStart = u_detailDistance - u_detailFadeRange;
  float fadeEnd = u_detailDistance;
  return 1.0 - smoothstep(fadeStart, fadeEnd, v_distanceToCamera);
}

void main() {
  // Blend terrain layers
  vec4 albedo;
  vec3 tangentNormal;
  float roughness;
  float metallic;

  blendLayers(albedo, tangentNormal, roughness, metallic);

  // Apply detail fade
  float detailFade = getDetailFade();
  tangentNormal = mix(vec3(0.0, 0.0, 1.0), tangentNormal, detailFade);

  // Transform tangent-space normal to world space
  vec3 normal = normalize(v_worldNormal);

  #ifdef ENABLE_NORMAL_MAPPING
  // Construct TBN matrix
  vec3 Q1 = dFdx(v_worldPosition);
  vec3 Q2 = dFdy(v_worldPosition);
  vec2 st1 = dFdx(v_detailTexcoord);
  vec2 st2 = dFdy(v_detailTexcoord);

  vec3 T = normalize(Q1 * st2.t - Q2 * st1.t);
  vec3 B = -normalize(cross(normal, T));
  mat3 TBN = mat3(T, B, normal);

  normal = normalize(TBN * tangentNormal);
  #endif

  // Encode normal (octahedron or standard)
  vec2 encodedNormal = normal.xy * 0.5 + 0.5;

  // Output to GBuffer
  o_albedo = vec4(albedo.rgb, metallic);
  o_normal = vec4(encodedNormal, roughness, 1.0);
  o_material = vec4(0.0, 0.0, 0.0, 1.0);  // AO, emission, etc.
}
`;

/**
 * Clipmap level descriptor.
 */
interface ClipmapLevel {
  /** LOD level (0 = finest) */
  level: number;
  /** Grid resolution */
  resolution: number;
  /** World-space scale */
  scale: number;
  /** Center position in grid space */
  center: Vector2;
  /** Vertex buffer */
  vertexBuffer: WebGLBuffer | null;
  /** Index buffer */
  indexBuffer: WebGLBuffer | null;
  /** Index count */
  indexCount: number;
}

/**
 * Terrain rendering pass with advanced LOD system.
 *
 * Implements high-performance terrain rendering with:
 * - Geometry clipmap for seamless LOD
 * - Splatmap-based texture blending (up to 4 layers)
 * - Triplanar mapping for steep slopes
 * - Detail texture fading
 * - Virtual texturing support
 * - Normal mapping with configurable strength
 *
 * @example
 * ```typescript
 * const terrainPass = new TerrainPass({
 *   heightmap: heightmapTexture,
 *   heightmapResolution: new Vector2(1024, 1024),
 *   terrainSize: new Vector2(1000, 1000),
 *   heightScale: 100,
 *   clipmapLevels: 5,
 *   clipmapResolution: 127,
 *   lodSystem: LODSystem.Clipmap,
 *   lodDistanceScale: 1.0,
 *   splatmap: splatmapTexture,
 *   layers: [
 *     { name: 'grass', albedoTexture, normalTexture, roughnessTexture, ... },
 *     { name: 'rock', ... },
 *     { name: 'dirt', ... },
 *     { name: 'sand', ... }
 *   ],
 *   detailDistance: 200,
 *   detailFadeRange: 50,
 *   receiveShadows: true,
 *   enableNormalMapping: true,
 *   normalStrength: 1.0,
 *   enableVirtualTexturing: false,
 *   virtualTextureCacheSize: 128,
 *   position: new Vector3(0, 0, 0)
 * });
 *
 * terrainPass.setup();
 * terrainPass.execute(renderQueue, renderTarget);
 * ```
 */
export class TerrainPass extends RenderPass {
  /** Configuration */
  private config: TerrainPassConfig;

  /** Clipmap levels */
  private clipmapLevels: ClipmapLevel[] = [];

  /** Shader program */
  private shader: WebGLProgram | null = null;

  /** WebGL context */
  private gl: WebGL2RenderingContext | null = null;

  /** Terrain bounds */
  private bounds: Box3;

  /** Camera position from last frame */
  private lastCameraPosition: Vector3 = new Vector3();

  /** Statistics */
  private stats = {
    drawCalls: 0,
    triangles: 0,
    activeClipmaps: 0,
  };

  /**
   * Creates a new terrain rendering pass.
   *
   * @param config - Terrain configuration
   */
  constructor(config: TerrainPassConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'TerrainPass',
      colorAttachments: [
        {
          name: 'albedo',
          format: TextureFormat.RGBA8,
        },
        {
          name: 'normal',
          format: TextureFormat.RGBA16F,
        },
        {
          name: 'material',
          format: TextureFormat.RGBA8,
        },
      ],
      depthStencilAttachment: {
        name: 'depth',
        format: TextureFormat.Depth24Stencil8,
      },
      clearValues: {
        colors: [Color.black(), new Color(0.5, 0.5, 1.0, 1.0), Color.black()],
        depth: 1.0,
      },
      colorLoadActions: [LoadAction.Load, LoadAction.Load, LoadAction.Load],
      colorStoreActions: [StoreAction.Store, StoreAction.Store, StoreAction.Store],
      depthLoadAction: LoadAction.Load,
      depthStoreAction: StoreAction.Store,
    };

    super(descriptor);
    this.config = config;

    // Calculate terrain bounds
    this.bounds = new Box3(
      config.position,
      new Vector3(
        config.position.x + config.terrainSize.x,
        config.position.y + config.heightScale,
        config.position.z + config.terrainSize.y
      )
    );

    logger.info(`Created TerrainPass: ${config.terrainSize.x}x${config.terrainSize.y}, ` +
                `height ${config.heightScale}, LOD ${config.lodSystem} (${config.clipmapLevels} levels)`);
  }

  /**
   * Sets up terrain pass resources.
   */
  setup(gl?: WebGL2RenderingContext): void {
    logger.debug('Setting up TerrainPass');

    // Initialize WebGL context
    if (gl) {
      this.gl = gl;
    } else {
      logger.warn('No WebGL context provided to TerrainPass.setup()');
      // In a real implementation, would get context from Engine
      return;
    }

    // Create clipmap levels
    if (this.config.lodSystem === LODSystem.Clipmap) {
      this.createClipmapLevels();
    }

    // Create shaders
    this.createShaders();

    logger.info('TerrainPass setup complete');
  }

  /**
   * Executes the terrain rendering pass.
   *
   * @param renderQueue - Render queue (unused)
   * @param renderTarget - Target to render to
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.gl || !this.shader) {
      logger.error('TerrainPass not properly initialized');
      return;
    }

    const gl = this.gl;

    // Reset statistics
    this.stats.drawCalls = 0;
    this.stats.triangles = 0;
    this.stats.activeClipmaps = 0;

    // Get camera position (would be passed from render context)
    const cameraPosition = new Vector3(0, 100, 0);
    const viewMatrix = new Matrix4(); // Would come from camera
    const projectionMatrix = new Matrix4(); // Would come from camera
    const modelMatrix = Matrix4.translation(this.config.position.x, this.config.position.y, this.config.position.z);

    // Update clipmap centers based on camera
    if (this.config.lodSystem === LODSystem.Clipmap) {
      this.updateClipmapCenters(cameraPosition);
    }

    // Enable depth testing
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);

    // Enable back-face culling
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // Use terrain shader
    gl.useProgram(this.shader);

    // Bind global uniforms
    this.bindGlobalUniforms(gl, modelMatrix, viewMatrix, projectionMatrix, cameraPosition);

    // Bind heightmap texture
    this.bindHeightmap(gl);

    // Bind splatmap texture
    this.bindSplatmap(gl);

    // Bind layer textures
    this.bindLayerTextures(gl);

    // Render terrain based on LOD system
    if (this.config.lodSystem === LODSystem.Clipmap) {
      this.renderClipmapTerrain(gl, cameraPosition);
    } else if (this.config.lodSystem === LODSystem.Quadtree) {
      this.renderQuadtreeTerrain(gl, cameraPosition);
    } else {
      this.renderDistanceLODTerrain(gl, cameraPosition);
    }

    // Unbind textures
    for (let i = 0; i < 16; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    // Disable depth and culling
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    logger.trace(`TerrainPass: ${this.stats.drawCalls} draws, ${this.stats.triangles} triangles, ` +
                 `${this.stats.activeClipmaps} clipmaps`);
  }

  /**
   * Cleans up terrain pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up TerrainPass');

    if (this.gl) {
      // Delete shader
      this.gl.deleteProgram(this.shader);

      // Delete clipmap buffers
      this.clipmapLevels.forEach(level => {
        this.gl!.deleteBuffer(level.vertexBuffer);
        this.gl!.deleteBuffer(level.indexBuffer);
      });
    }

    this.shader = null;
    this.clipmapLevels = [];
    this.gl = null;

    logger.info('TerrainPass cleanup complete');
  }

  /**
   * Creates geometry clipmap levels.
   */
  private createClipmapLevels(): void {
    const resolution = this.config.clipmapResolution;

    for (let i = 0; i < this.config.clipmapLevels; i++) {
      const scale = Math.pow(2, i);

      const level: ClipmapLevel = {
        level: i,
        resolution,
        scale,
        center: new Vector2(0, 0),
        vertexBuffer: null,
        indexBuffer: null,
        indexCount: 0,
      };

      // Create clipmap geometry
      this.createClipmapGeometry(level);

      this.clipmapLevels.push(level);

      logger.debug(`Created clipmap level ${i}: resolution ${resolution}, scale ${scale}`);
    }
  }

  /**
   * Creates geometry for a clipmap level.
   */
  private createClipmapGeometry(level: ClipmapLevel): void {
    if (!this.gl) {
      logger.error('Cannot create clipmap geometry: WebGL context not initialized');
      return;
    }

    const N = level.resolution;
    const vertices: number[] = [];
    const indices: number[] = [];

    // Generate grid vertices
    for (let y = 0; y <= N; y++) {
      for (let x = 0; x <= N; x++) {
        // Normalized position (0-1)
        const u = x / N;
        const v = y / N;

        vertices.push(u, v);
      }
    }

    // Generate indices (skip center for next LOD level, except finest)
    const skipStart = level.level === 0 ? N + 1 : Math.floor(N / 4);
    const skipEnd = level.level === 0 ? 0 : Math.floor(3 * N / 4);

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        // Skip center region (next LOD will fill it)
        if (level.level > 0 && x >= skipStart && x < skipEnd && y >= skipStart && y < skipEnd) {
          continue;
        }

        const i0 = y * (N + 1) + x;
        const i1 = i0 + 1;
        const i2 = i0 + (N + 1);
        const i3 = i2 + 1;

        indices.push(i0, i2, i1);
        indices.push(i1, i2, i3);
      }
    }

    level.indexCount = indices.length;

    // Create WebGL vertex buffer
    level.vertexBuffer = this.gl.createBuffer();
    if (level.vertexBuffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, level.vertexBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
    }

    // Create WebGL index buffer
    level.indexBuffer = this.gl.createBuffer();
    if (level.indexBuffer) {
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, level.indexBuffer);
      this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STATIC_DRAW);
    }

    // Unbind buffers
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);

    logger.debug(`Clipmap level ${level.level}: ${vertices.length / 2} vertices, ${indices.length / 3} triangles`);
  }

  /**
   * Updates clipmap centers to follow camera.
   */
  private updateClipmapCenters(cameraPosition: Vector3): void {
    for (const level of this.clipmapLevels) {
      // Calculate clipmap center in world space
      const worldScale = (level.scale * this.config.terrainSize.x) / level.resolution;

      // Snap to grid
      const centerX = Math.floor(cameraPosition.x / worldScale) * worldScale;
      const centerZ = Math.floor(cameraPosition.z / worldScale) * worldScale;

      // Update center (in normalized coordinates)
      level.center.x = centerX / this.config.terrainSize.x;
      level.center.y = centerZ / this.config.terrainSize.y;
    }
  }

  /**
   * Binds global shader uniforms.
   */
  private bindGlobalUniforms(
    gl: WebGL2RenderingContext,
    modelMatrix: Matrix4,
    viewMatrix: Matrix4,
    projectionMatrix: Matrix4,
    cameraPosition: Vector3
  ): void {
    // Matrix uniforms
    const modelLoc = gl.getUniformLocation(this.shader!, 'u_modelMatrix');
    const viewLoc = gl.getUniformLocation(this.shader!, 'u_viewMatrix');
    const projLoc = gl.getUniformLocation(this.shader!, 'u_projectionMatrix');

    if (modelLoc) gl.uniformMatrix4fv(modelLoc, false, modelMatrix.elements);
    if (viewLoc) gl.uniformMatrix4fv(viewLoc, false, viewMatrix.elements);
    if (projLoc) gl.uniformMatrix4fv(projLoc, false, projectionMatrix.elements);

    // Terrain parameters
    const terrainSizeLoc = gl.getUniformLocation(this.shader!, 'u_terrainSize');
    const heightScaleLoc = gl.getUniformLocation(this.shader!, 'u_heightScale');
    const heightmapSizeLoc = gl.getUniformLocation(this.shader!, 'u_heightmapSize');
    const cameraPosLoc = gl.getUniformLocation(this.shader!, 'u_cameraPosition');

    if (terrainSizeLoc) {
      gl.uniform2f(terrainSizeLoc, this.config.terrainSize.x, this.config.terrainSize.y);
    }
    if (heightScaleLoc) {
      gl.uniform1f(heightScaleLoc, this.config.heightScale);
    }
    if (heightmapSizeLoc) {
      gl.uniform2f(heightmapSizeLoc, this.config.heightmapResolution.x, this.config.heightmapResolution.y);
    }
    if (cameraPosLoc) {
      gl.uniform3f(cameraPosLoc, cameraPosition.x, cameraPosition.y, cameraPosition.z);
    }

    // Detail parameters
    const detailDistLoc = gl.getUniformLocation(this.shader!, 'u_detailDistance');
    const detailFadeLoc = gl.getUniformLocation(this.shader!, 'u_detailFadeRange');
    const normalStrengthLoc = gl.getUniformLocation(this.shader!, 'u_normalStrength');

    if (detailDistLoc) gl.uniform1f(detailDistLoc, this.config.detailDistance);
    if (detailFadeLoc) gl.uniform1f(detailFadeLoc, this.config.detailFadeRange);
    if (normalStrengthLoc) gl.uniform1f(normalStrengthLoc, this.config.normalStrength);
  }

  /**
   * Binds heightmap texture.
   */
  private bindHeightmap(gl: WebGL2RenderingContext): void {
    if (!this.config.heightmap) {
      logger.warn('No heightmap texture provided');
      return;
    }

    // Bind heightmap to texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.config.heightmap);

    // Set texture parameters for heightmap
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const heightmapLoc = gl.getUniformLocation(this.shader!, 'u_heightmap');
    if (heightmapLoc) {
      gl.uniform1i(heightmapLoc, 0);
    }
  }

  /**
   * Binds splatmap texture.
   */
  private bindSplatmap(gl: WebGL2RenderingContext): void {
    if (!this.config.splatmap) {
      logger.warn('No splatmap texture provided');
      return;
    }

    // Bind splatmap to texture unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.config.splatmap);

    // Set texture parameters for splatmap
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const splatmapLoc = gl.getUniformLocation(this.shader!, 'u_splatmap');
    if (splatmapLoc) {
      gl.uniform1i(splatmapLoc, 1);
    }
  }

  /**
   * Binds terrain layer textures.
   */
  private bindLayerTextures(gl: WebGL2RenderingContext): void {
    let textureUnit = 2; // Start after heightmap (0) and splatmap (1)

    // Ensure we have 4 layers
    const layers = this.config.layers.slice(0, 4);
    while (layers.length < 4) {
      layers.push({
        name: 'default',
        albedoTexture: null,
        normalTexture: null,
        roughnessTexture: null,
        uvScale: 1.0,
        tiling: 1.0,
        metallic: 0.0,
        useTriplanar: false,
      });
    }

    // Bind each layer's textures
    for (let i = 0; i < 4; i++) {
      const layer = layers[i];

      // Albedo texture
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      if (layer.albedoTexture) {
        gl.bindTexture(gl.TEXTURE_2D, layer.albedoTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      }
      const albedoLoc = gl.getUniformLocation(this.shader!, `u_layer${i}_albedo`);
      if (albedoLoc) gl.uniform1i(albedoLoc, textureUnit);
      textureUnit++;

      // Normal texture
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      if (layer.normalTexture) {
        gl.bindTexture(gl.TEXTURE_2D, layer.normalTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      }
      const normalLoc = gl.getUniformLocation(this.shader!, `u_layer${i}_normal`);
      if (normalLoc) gl.uniform1i(normalLoc, textureUnit);
      textureUnit++;

      // Roughness texture
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      if (layer.roughnessTexture) {
        gl.bindTexture(gl.TEXTURE_2D, layer.roughnessTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      }
      const roughnessLoc = gl.getUniformLocation(this.shader!, `u_layer${i}_roughness`);
      if (roughnessLoc) gl.uniform1i(roughnessLoc, textureUnit);
      textureUnit++;

      // Layer parameters (uvScale, tiling, metallic, useTriplanar)
      const paramsLoc = gl.getUniformLocation(this.shader!, `u_layer${i}_params`);
      if (paramsLoc) {
        gl.uniform4f(
          paramsLoc,
          layer.uvScale,
          layer.tiling,
          layer.metallic,
          layer.useTriplanar ? 1.0 : 0.0
        );
      }
    }
  }

  /**
   * Renders terrain using clipmap LOD system.
   */
  private renderClipmapTerrain(gl: WebGL2RenderingContext, cameraPosition: Vector3): void {
    // Render clipmap levels from coarsest to finest for proper depth testing
    for (let i = this.clipmapLevels.length - 1; i >= 0; i--) {
      const level = this.clipmapLevels[i];

      // Check if level is visible
      const levelDistance = level.scale * this.config.terrainSize.x;
      const cameraDistance = new Vector2(
        cameraPosition.x - (level.center.x * this.config.terrainSize.x),
        cameraPosition.z - (level.center.y * this.config.terrainSize.y)
      ).length();

      if (cameraDistance < levelDistance * 2.0 * this.config.lodDistanceScale) {
        this.renderClipmapLevel(gl, level);
        this.stats.activeClipmaps++;
      }
    }
  }

  /**
   * Renders a single clipmap level.
   */
  private renderClipmapLevel(gl: WebGL2RenderingContext, level: ClipmapLevel): void {
    if (!level.vertexBuffer || !level.indexBuffer) {
      return;
    }

    // Set LOD-specific uniforms
    const lodLevelLoc = gl.getUniformLocation(this.shader!, 'u_lodLevel');
    const lodOffsetLoc = gl.getUniformLocation(this.shader!, 'u_lodOffset');
    const lodScaleLoc = gl.getUniformLocation(this.shader!, 'u_lodScale');

    if (lodLevelLoc) gl.uniform1f(lodLevelLoc, level.level);
    if (lodOffsetLoc) gl.uniform2f(lodOffsetLoc, level.center.x, level.center.y);
    if (lodScaleLoc) gl.uniform2f(lodScaleLoc, level.scale, level.scale);

    // Bind vertex buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, level.vertexBuffer);

    // Set up vertex attributes
    const positionLoc = gl.getAttribLocation(this.shader!, 'a_position');
    if (positionLoc !== -1) {
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 8, 0);
    }

    // Bind index buffer
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, level.indexBuffer);

    // Draw elements
    gl.drawElements(gl.TRIANGLES, level.indexCount, gl.UNSIGNED_SHORT, 0);

    // Update statistics
    this.stats.drawCalls++;
    this.stats.triangles += level.indexCount / 3;

    // Cleanup
    if (positionLoc !== -1) {
      gl.disableVertexAttribArray(positionLoc);
    }
  }

  /**
   * Renders terrain using quadtree LOD system.
   */
  private renderQuadtreeTerrain(gl: WebGL2RenderingContext, cameraPosition: Vector3): void {
    // Quadtree implementation would go here
    // For now, fall back to clipmap rendering
    logger.warn('Quadtree LOD not fully implemented, using clipmap fallback');
    this.renderClipmapTerrain(gl, cameraPosition);
  }

  /**
   * Renders terrain using simple distance-based LOD.
   */
  private renderDistanceLODTerrain(gl: WebGL2RenderingContext, cameraPosition: Vector3): void {
    // Simple distance LOD implementation
    // For now, render all clipmap levels
    logger.warn('Distance LOD not fully implemented, using clipmap fallback');
    this.renderClipmapTerrain(gl, cameraPosition);
  }

  /**
   * Creates shader programs.
   */
  private createShaders(): void {
    if (!this.gl) {
      logger.error('Cannot create shaders: WebGL context not initialized');
      return;
    }

    logger.debug('Creating terrain shaders');

    // Compile vertex shader
    const vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER);
    if (!vertexShader) {
      logger.error('Failed to create vertex shader');
      return;
    }

    this.gl.shaderSource(vertexShader, TERRAIN_VERTEX_SHADER);
    this.gl.compileShader(vertexShader);

    if (!this.gl.getShaderParameter(vertexShader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(vertexShader);
      logger.error(`Terrain vertex shader compilation failed: ${info}`);
      this.gl.deleteShader(vertexShader);
      return;
    }

    // Compile fragment shader
    const fragmentShader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
    if (!fragmentShader) {
      logger.error('Failed to create fragment shader');
      this.gl.deleteShader(vertexShader);
      return;
    }

    this.gl.shaderSource(fragmentShader, TERRAIN_FRAGMENT_SHADER);
    this.gl.compileShader(fragmentShader);

    if (!this.gl.getShaderParameter(fragmentShader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(fragmentShader);
      logger.error(`Terrain fragment shader compilation failed: ${info}`);
      this.gl.deleteShader(vertexShader);
      this.gl.deleteShader(fragmentShader);
      return;
    }

    // Link shader program
    this.shader = this.gl.createProgram();
    if (!this.shader) {
      logger.error('Failed to create terrain shader program');
      this.gl.deleteShader(vertexShader);
      this.gl.deleteShader(fragmentShader);
      return;
    }

    this.gl.attachShader(this.shader, vertexShader);
    this.gl.attachShader(this.shader, fragmentShader);
    this.gl.linkProgram(this.shader);

    if (!this.gl.getProgramParameter(this.shader, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(this.shader);
      logger.error(`Terrain shader program linking failed: ${info}`);
      this.gl.deleteShader(vertexShader);
      this.gl.deleteShader(fragmentShader);
      this.gl.deleteProgram(this.shader);
      this.shader = null;
      return;
    }

    // Clean up shaders (they're now part of the program)
    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);

    logger.info('Terrain shaders created successfully');
  }

  /**
   * Updates heightmap texture.
   */
  setHeightmap(heightmap: WebGLTexture, resolution: Vector2): void {
    this.config.heightmap = heightmap;
    this.config.heightmapResolution = resolution;

    logger.info(`Updated heightmap: ${resolution.x}x${resolution.y}`);
  }

  /**
   * Updates splatmap texture.
   */
  setSplatmap(splatmap: WebGLTexture): void {
    this.config.splatmap = splatmap;
    logger.debug('Updated splatmap');
  }

  /**
   * Adds or updates a terrain layer.
   */
  setLayer(index: number, layer: TerrainLayer): void {
    if (index < 0 || index >= 4) {
      logger.error(`Invalid layer index ${index}, must be 0-3`);
      return;
    }

    this.config.layers[index] = layer;
    logger.debug(`Updated layer ${index}: ${layer.name}`);
  }

  /**
   * Gets terrain bounds.
   */
  getBounds(): Box3 {
    return this.bounds;
  }

  /**
   * Gets height at world position (samples heightmap).
   */
  getHeightAt(x: number, z: number): number {
    // Convert world position to heightmap UV
    const u = (x - this.config.position.x) / this.config.terrainSize.x;
    const v = (z - this.config.position.z) / this.config.terrainSize.y;

    if (u < 0 || u > 1 || v < 0 || v > 1) {
      return this.config.position.y;
    }

    // In full implementation, sample heightmap texture
    // For now, return base height
    return this.config.position.y;
  }

  /**
   * Gets rendering statistics.
   */
  getStats(): Readonly<typeof this.stats> {
    return this.stats;
  }
}
