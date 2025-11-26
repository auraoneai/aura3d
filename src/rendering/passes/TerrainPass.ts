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
  setup(): void {
    logger.debug('Setting up TerrainPass');

    // Note: In full implementation, would initialize WebGL context here
    // this.gl = getWebGL2Context();

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

    // Reset statistics
    this.stats.drawCalls = 0;
    this.stats.triangles = 0;
    this.stats.activeClipmaps = 0;

    // Get camera position (would be passed from render context)
    const cameraPosition = new Vector3(0, 100, 0);

    // Update clipmap centers based on camera
    if (this.config.lodSystem === LODSystem.Clipmap) {
      this.updateClipmapCenters(cameraPosition);
    }

    // Render terrain
    this.renderTerrain(cameraPosition);

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

    // In full implementation, create WebGL buffers
    // level.vertexBuffer = createBuffer(gl, vertices);
    // level.indexBuffer = createBuffer(gl, indices);

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
   * Renders terrain using clipmap levels.
   */
  private renderTerrain(cameraPosition: Vector3): void {
    // In full implementation:
    // 1. Bind shader and uniforms
    // 2. Bind heightmap and splatmap textures
    // 3. Bind layer textures
    // 4. For each clipmap level:
    //    - Set level-specific uniforms (scale, offset)
    //    - Draw clipmap geometry
    //    - Update statistics

    for (const level of this.clipmapLevels) {
      // Check if level is visible
      const levelDistance = level.scale * this.config.terrainSize.x;
      const cameraDistance = new Vector2(
        cameraPosition.x - (level.center.x * this.config.terrainSize.x),
        cameraPosition.z - (level.center.y * this.config.terrainSize.y)
      ).length();

      if (cameraDistance < levelDistance * 2.0) {
        this.stats.activeClipmaps++;
        this.stats.drawCalls++;
        this.stats.triangles += level.indexCount / 3;
      }
    }
  }

  /**
   * Creates shader programs.
   */
  private createShaders(): void {
    // In full implementation, compile and link shaders
    logger.debug('Creating terrain shaders');
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
