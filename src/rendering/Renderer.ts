/**
 * @module Rendering
 * @description
 * Main renderer class coordinating all rendering subsystems for the G3D 5.0 engine.
 * Manages the complete rendering pipeline from scene setup to final presentation.
 */

import { GPUDevice, GPUBackendType, GPUFeature } from './gpu/GPUDevice';
import { WebGL2Device } from './gpu/WebGL2Backend';
import { Camera } from './camera/Camera';
import { Scene } from './scene/Scene';
import { SceneNode } from './scene/SceneNode';
import { RenderGraph } from './pipeline/RenderGraph';
import { RenderTarget, TextureFormat } from './pipeline/RenderTarget';
import { RenderSettings, QualityPreset } from './RenderSettings';
import { ResourceManager } from './ResourceManager';
import { RenderProfiler } from './RenderProfiler';
import { LightManager } from './lighting/LightManager';
import { ShadowMapper } from './lighting/ShadowMapper';
import { PostProcessStack } from './postprocess/PostProcessStack';
import { GBufferPass } from './passes/GBufferPass';
import { LightingPass } from './passes/LightingPass';
import { ShadowPass } from './passes/ShadowPass';
import { ForwardPass } from './passes/ForwardPass';
import { SkyboxPass } from './passes/SkyboxPass';
import { DepthPrePass } from './passes/DepthPrePass';
import { Logger } from '../core/Logger';
import { Time } from '../core/Time';
import { Vector3 } from '../math/Vector3';
import { Matrix4 } from '../math/Matrix4';
import { Mesh } from './geometry/Mesh';

const logger = Logger.create('Renderer');

/**
 * Renderer backend preference.
 */
export enum RendererBackend {
  /** Automatically select best available backend */
  Auto = 'auto',
  /** Force WebGPU backend */
  WebGPU = 'webgpu',
  /** Force WebGL2 backend */
  WebGL2 = 'webgl2',
}

/**
 * Rendering mode.
 */
export enum RenderMode {
  /** Deferred rendering (G-Buffer) */
  Deferred = 'deferred',
  /** Forward rendering */
  Forward = 'forward',
  /** Forward+ (tiled forward) */
  ForwardPlus = 'forward-plus',
}

/**
 * Renderer configuration.
 */
export interface RendererConfig {
  /** Canvas element for rendering */
  canvas: HTMLCanvasElement;
  /** Preferred backend */
  backend?: RendererBackend;
  /** Rendering mode */
  renderMode?: RenderMode;
  /** Initial width (default: canvas width) */
  width?: number;
  /** Initial height (default: canvas height) */
  height?: number;
  /** Quality preset */
  quality?: QualityPreset;
  /** Enable profiling */
  enableProfiling?: boolean;
  /** Enable debug features */
  enableDebug?: boolean;
  /** Enable HDR rendering */
  hdr?: boolean;
  /** Enable MSAA (samples: 1, 2, 4, 8) */
  msaaSamples?: number;
  /** Pixel ratio (default: window.devicePixelRatio) */
  pixelRatio?: number;
}

/**
 * Renderer statistics.
 */
export interface RendererStats {
  /** Backend type in use */
  backend: GPUBackendType;
  /** Rendering mode */
  renderMode: RenderMode;
  /** Current width */
  width: number;
  /** Current height */
  height: number;
  /** Frames rendered */
  frameCount: number;
  /** Current FPS */
  fps: number;
  /** Frame time (ms) */
  frameTime: number;
  /** Draw calls */
  drawCalls: number;
  /** Triangles */
  triangles: number;
  /** Active lights */
  lights: number;
  /** Memory used (bytes) */
  memoryUsed: number;
}

/**
 * Main renderer class for G3D 5.0.
 *
 * Responsibilities:
 * - GPU device and backend management
 * - Render graph setup and execution
 * - Resource management and caching
 * - Quality settings management
 * - Frame orchestration
 * - Statistics collection
 *
 * @example
 * ```typescript
 * // Create renderer
 * const renderer = await Renderer.create({
 *   canvas: document.getElementById('canvas') as HTMLCanvasElement,
 *   backend: RendererBackend.Auto,
 *   renderMode: RenderMode.Deferred,
 *   quality: QualityPreset.High,
 *   enableProfiling: true,
 * });
 *
 * // Setup scene
 * const scene = new Scene('Main Scene');
 * const camera = new Camera();
 * camera.setPerspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 1000);
 * camera.transform.position.set(0, 5, 10);
 *
 * // Render loop
 * function render() {
 *   renderer.render(scene, camera);
 *   requestAnimationFrame(render);
 * }
 * render();
 *
 * // Handle resize
 * window.addEventListener('resize', () => {
 *   renderer.resize(window.innerWidth, window.innerHeight);
 * });
 *
 * // Get statistics
 * const stats = renderer.getStats();
 * console.log(`FPS: ${stats.fps}, Draw Calls: ${stats.drawCalls}`);
 *
 * // Cleanup
 * renderer.dispose();
 * ```
 */
export class Renderer {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice;
  private config: Required<RendererConfig>;

  // Core subsystems
  private settings: RenderSettings;
  private resourceManager: ResourceManager;
  private profiler: RenderProfiler | null = null;
  private lightManager: LightManager;
  private shadowMapper: ShadowMapper;
  private postProcessStack: PostProcessStack | null = null;

  // Render graph and passes
  private renderGraph: RenderGraph;
  private depthPrePass: DepthPrePass | null = null;
  private shadowPass: ShadowPass | null = null;
  private gBufferPass: GBufferPass | null = null;
  private lightingPass: LightingPass | null = null;
  private forwardPass: ForwardPass | null = null;
  private skyboxPass: SkyboxPass | null = null;

  // Render targets
  private backbuffer: RenderTarget | null = null;
  private hdrTarget: RenderTarget | null = null;

  // State
  private width: number;
  private height: number;
  private renderWidth: number;
  private renderHeight: number;
  private pixelRatio: number;
  private frameCount: number = 0;
  private lastFrameTime: number = 0;
  private currentFPS: number = 60;

  // Simple scene rendering
  private simpleShaderProgram: WebGLProgram | null = null;
  private meshGPUBuffers: Map<Mesh, { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; ibo: WebGLBuffer; indexCount: number }> = new Map();

  /**
   * Private constructor. Use Renderer.create() instead.
   */
  private constructor(device: GPUDevice, config: Required<RendererConfig>) {
    this.device = device;
    this.canvas = config.canvas;
    this.config = config;

    this.width = config.width;
    this.height = config.height;
    this.pixelRatio = config.pixelRatio;
    this.renderWidth = Math.floor(this.width * this.pixelRatio);
    this.renderHeight = Math.floor(this.height * this.pixelRatio);

    // Initialize subsystems
    this.settings = new RenderSettings(device, { preset: config.quality });
    this.resourceManager = new ResourceManager(device, {
      memoryBudget: 512 * 1024 * 1024, // 512MB
    });

    if (config.enableProfiling) {
      this.profiler = new RenderProfiler(device, {
        enableGPUTiming: true,
        enableCPUTiming: true,
        historySize: 120,
      });
    }

    this.lightManager = new LightManager({
      budget: {
        maxDirectional: 4,
        maxPoint: 128,
        maxSpot: 64,
        maxArea: 16,
        maxProbes: 8,
        maxShadowCasters: 8,
        enforced: false,
      },
    });

    this.shadowMapper = new ShadowMapper({
      atlasWidth: this.settings.maxShadowResolution,
      atlasHeight: this.settings.maxShadowResolution,
      maxShadowMaps: 32,
    });

    this.renderGraph = new RenderGraph({
      enableAliasing: true,
      enableCulling: true,
      defaultWidth: this.renderWidth,
      defaultHeight: this.renderHeight,
    });

    // Setup callbacks
    this.settings.onChange = () => this.onSettingsChanged();

    logger.info('Renderer created', {
      backend: device.getCapabilities().backend,
      mode: config.renderMode,
      size: `${this.width}x${this.height}`,
      renderSize: `${this.renderWidth}x${this.renderHeight}`,
    });
  }

  /**
   * Creates a new renderer instance asynchronously.
   *
   * @param config - Renderer configuration
   * @returns Promise resolving to renderer instance
   */
  static async create(config: RendererConfig): Promise<Renderer> {
    const canvas = config.canvas;
    const backend = config.backend ?? RendererBackend.Auto;

    // Determine dimensions
    const width = config.width ?? canvas.width;
    const height = config.height ?? canvas.height;
    const pixelRatio = config.pixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1);

    // Create GPU device based on backend preference
    let device: GPUDevice;

    // Try to create the appropriate backend
    if (backend === RendererBackend.WebGPU || backend === RendererBackend.Auto) {
      // TODO: Try WebGPU first if available
      // For now, fall through to WebGL2
    }

    // Create WebGL2 context and device
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      depth: true,
      stencil: true,
      antialias: config.msaaSamples ? config.msaaSamples > 1 : false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      throw new Error('WebGL2 is not supported in this browser');
    }

    device = new WebGL2Device(gl, canvas);

    // Create full config with defaults
    const fullConfig: Required<RendererConfig> = {
      canvas,
      backend,
      renderMode: config.renderMode ?? RenderMode.Deferred,
      width,
      height,
      quality: config.quality ?? QualityPreset.High,
      enableProfiling: config.enableProfiling ?? false,
      enableDebug: config.enableDebug ?? false,
      hdr: config.hdr ?? true,
      msaaSamples: config.msaaSamples ?? 1,
      pixelRatio,
    };

    const renderer = new Renderer(device, fullConfig);
    await renderer.initialize();

    return renderer;
  }

  /**
   * Initializes the renderer (render graph, passes, targets).
   */
  private async initialize(): Promise<void> {
    logger.info('Initializing renderer...');

    // Create render targets
    this.createRenderTargets();

    // Setup render graph
    this.setupRenderGraph();

    // Build and compile
    this.renderGraph.build();
    this.renderGraph.compile();

    logger.info('Renderer initialized successfully');
  }

  /**
   * Creates render targets.
   */
  private createRenderTargets(): void {
    // HDR render target
    if (this.config.hdr) {
      this.hdrTarget = RenderTarget.createColorTarget(
        this.renderWidth,
        this.renderHeight,
        TextureFormat.RGBA16F,
        this.config.msaaSamples
      );
    }

    // Backbuffer
    this.backbuffer = RenderTarget.createColorTarget(
      this.renderWidth,
      this.renderHeight,
      TextureFormat.RGBA8,
      1
    );

    logger.debug('Render targets created');
  }

  /**
   * Sets up the render graph with passes.
   */
  private setupRenderGraph(): void {
    const mode = this.config.renderMode;

    if (mode === RenderMode.Deferred) {
      this.setupDeferredPipeline();
    } else {
      this.setupForwardPipeline();
    }

    logger.debug(`Render graph setup: ${mode} mode`);
  }

  /**
   * Sets up deferred rendering pipeline.
   */
  private setupDeferredPipeline(): void {
    // Depth pre-pass (optional)
    if (this.settings.occlusionCulling) {
      this.depthPrePass = new DepthPrePass({
        width: this.renderWidth,
        height: this.renderHeight,
      });
      this.renderGraph.addPass(this.depthPrePass);
    }

    // Shadow pass
    if (this.settings.shadowQuality !== 'off') {
      this.shadowPass = new ShadowPass({
        resolution: this.settings.maxShadowResolution,
      });
      this.renderGraph.addPass(this.shadowPass);
    }

    // G-Buffer pass
    this.gBufferPass = new GBufferPass({
      width: this.renderWidth,
      height: this.renderHeight,
    });
    this.renderGraph.addPass(this.gBufferPass);

    // Lighting pass
    this.lightingPass = new LightingPass({
      width: this.renderWidth,
      height: this.renderHeight,
    });
    this.renderGraph.addPass(this.lightingPass);

    // Skybox pass
    this.skyboxPass = new SkyboxPass({
      type: 0, // SkyboxType.Cubemap
    });
    this.renderGraph.addPass(this.skyboxPass);

    // Forward pass for transparents
    this.forwardPass = new ForwardPass({
      width: this.renderWidth,
      height: this.renderHeight,
    });
    this.renderGraph.addPass(this.forwardPass);
  }

  /**
   * Sets up forward rendering pipeline.
   */
  private setupForwardPipeline(): void {
    // Shadow pass
    if (this.settings.shadowQuality !== 'off') {
      this.shadowPass = new ShadowPass({
        resolution: this.settings.maxShadowResolution,
      });
      this.renderGraph.addPass(this.shadowPass);
    }

    // Skybox pass
    this.skyboxPass = new SkyboxPass({
      type: 0, // SkyboxType.Cubemap
    });
    this.renderGraph.addPass(this.skyboxPass);

    // Forward pass
    this.forwardPass = new ForwardPass({
      width: this.renderWidth,
      height: this.renderHeight,
    });
    this.renderGraph.addPass(this.forwardPass);
  }

  /**
   * Renders a frame.
   *
   * @param scene - Scene to render
   * @param camera - Camera for rendering
   */
  render(scene: Scene, camera: Camera): void {
    const startTime = performance.now();

    // Update frame counter
    this.frameCount++;

    // Log every 60 frames
    if (this.frameCount % 60 === 1) {
      logger.debug(`Render frame ${this.frameCount}`);
    }

    // Clear the canvas with the scene's background color
    const device = this.device as any;
    if (device.getGL) {
      const gl = device.getGL() as WebGL2RenderingContext;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // Use the actual canvas dimensions for the viewport
      const canvasWidth = gl.canvas.width;
      const canvasHeight = gl.canvas.height;
      gl.viewport(0, 0, canvasWidth, canvasHeight);

      // Clear with bright sky blue color
      const bgColor = { r: 0.4, g: 0.6, b: 0.9, a: 1 };
      gl.clearColor(bgColor.r, bgColor.g, bgColor.b, bgColor.a);
      gl.clearDepth(1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Render sky gradient
      this.renderSkyGradient(gl);

      // Enable depth testing and face culling
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      // Face culling enabled - winding order has been fixed
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.frontFace(gl.CCW);

      if (this.frameCount === 1) {
        logger.info(`Viewport: ${canvasWidth}x${canvasHeight}, this.width=${this.width}, this.height=${this.height}`);
      }
    }

    // Begin profiling
    if (this.profiler) {
      this.profiler.beginFrame();
    }

    // Update camera
    camera.updateMatrices();

    // Update light manager with actual deltaTime
    const deltaTime = Time.deltaTime || 0.016; // Fallback to 60 FPS if Time not initialized
    this.lightManager.update(deltaTime);

    // Cull lights - create camera info object with required properties
    const cameraInfo = {
      position: camera.transform.worldPosition,
      viewMatrix: camera.viewMatrix,
      projectionMatrix: camera.projectionMatrix,
      fov: camera.fov,
      aspect: camera.aspect,
      near: camera.near,
      far: camera.far,
    };
    const visibleLights = this.lightManager.cullLights(cameraInfo);

    // Prepare shadows
    if (this.shadowPass && this.settings.shadowQuality !== 'off') {
      // Calculate forward vector from view matrix
      const forward = new Vector3(
        -camera.viewMatrix.elements[8],
        -camera.viewMatrix.elements[9],
        -camera.viewMatrix.elements[10]
      ).normalize();

      const cameraInfoWithForward = {
        position: camera.transform.worldPosition,
        viewMatrix: camera.viewMatrix,
        projectionMatrix: camera.projectionMatrix,
        fov: camera.fov,
        aspect: camera.aspect,
        forward: forward,
      };
      this.lightManager.prepareShadows(visibleLights, cameraInfoWithForward);
    }

    // Render scene meshes directly (bypasses render graph for now)
    if (this.profiler) {
      this.profiler.beginPass('Scene Meshes');
    }
    this.renderSceneMeshes(scene, camera);
    if (this.profiler) {
      this.profiler.endPass();
    }

    // DEBUG: Disabled - winding order fixed, scene renders correctly
    // this.renderDebugTest(scene, camera);

    // Post-processing
    if (this.postProcessStack && this.hdrTarget) {
      if (this.profiler) {
        this.profiler.beginPass('Post Process');
      }
      const colorAttachment = this.hdrTarget.getColorAttachment(0);
      if (colorAttachment) {
        // Cast to RenderTexture for post-processing
        this.postProcessStack.render(colorAttachment as any, 0.016);
      }
      if (this.profiler) {
        this.profiler.endPass();
      }
    }

    // Present
    this.present();

    // End profiling
    if (this.profiler) {
      this.profiler.endFrame();
    }

    // Update stats
    const endTime = performance.now();
    const frameTime = endTime - startTime;
    this.lastFrameTime = frameTime;
    this.currentFPS = this.currentFPS * 0.9 + (1000 / frameTime) * 0.1;
  }

  /**
   * Presents the final image to screen.
   */
  private present(): void {
    // In a real implementation, would blit to canvas
    this.device.present();
  }

  /**
   * Resizes the renderer.
   *
   * @param width - New width
   * @param height - New height
   */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) {
      return;
    }

    this.width = width;
    this.height = height;
    this.renderWidth = Math.floor(width * this.pixelRatio * this.settings.resolutionScale);
    this.renderHeight = Math.floor(height * this.pixelRatio * this.settings.resolutionScale);

    logger.info(`Resizing to ${width}x${height} (render: ${this.renderWidth}x${this.renderHeight})`);

    // Recreate render targets
    this.disposeRenderTargets();
    this.createRenderTargets();

    // Rebuild render graph
    this.renderGraph.reset();
    this.setupRenderGraph();
    this.renderGraph.build();
    this.renderGraph.compile();

    // Resize post-processing
    if (this.postProcessStack) {
      this.postProcessStack.resize(this.renderWidth, this.renderHeight);
    }
  }

  /**
   * Sets the quality preset.
   *
   * @param preset - Quality preset
   */
  setQuality(preset: QualityPreset): void {
    this.settings.applyPreset(preset);
  }

  /**
   * Gets current renderer statistics.
   *
   * @returns Renderer statistics
   */
  getStats(): RendererStats {
    const frameStats = this.profiler?.getFrameStats();
    const memoryUsage = this.resourceManager.getMemoryUsage();

    return {
      backend: this.device.getCapabilities().backend,
      renderMode: this.config.renderMode,
      width: this.width,
      height: this.height,
      frameCount: this.frameCount,
      fps: this.currentFPS,
      frameTime: this.lastFrameTime,
      drawCalls: frameStats?.drawCalls ?? 0,
      triangles: frameStats?.triangles ?? 0,
      lights: this.lightManager.getLights().length,
      memoryUsed: memoryUsage.used,
    };
  }

  /**
   * Gets the GPU device.
   *
   * @returns GPU device
   */
  getDevice(): GPUDevice {
    return this.device;
  }

  /**
   * Gets the render settings.
   *
   * @returns Render settings
   */
  getSettings(): RenderSettings {
    return this.settings;
  }

  /**
   * Gets the resource manager.
   *
   * @returns Resource manager
   */
  getResourceManager(): ResourceManager {
    return this.resourceManager;
  }

  /**
   * Gets the profiler.
   *
   * @returns Profiler or null
   */
  getProfiler(): RenderProfiler | null {
    return this.profiler;
  }

  /**
   * Gets the light manager.
   *
   * @returns Light manager
   */
  getLightManager(): LightManager {
    return this.lightManager;
  }

  /**
   * Gets the shadow mapper.
   *
   * @returns Shadow mapper
   */
  getShadowMapper(): ShadowMapper {
    return this.shadowMapper;
  }

  /**
   * Gets the render graph.
   *
   * @returns Render graph
   */
  getRenderGraph(): RenderGraph {
    return this.renderGraph;
  }

  // =============================================================================
  // PBR VERTEX SHADER - Full physically-based rendering pipeline
  // =============================================================================
  private static PBR_VERTEX_SHADER = `#version 300 es
    precision highp float;

    // Vertex attributes
    layout(location = 0) in vec3 a_position;
    layout(location = 1) in vec3 a_normal;
    layout(location = 2) in vec2 a_texCoord;
    layout(location = 3) in vec4 a_tangent;

    // Transform uniforms
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform mat3 u_normalMatrix;
    uniform mat4 u_lightSpaceMatrix;

    // Outputs to fragment shader
    out vec3 v_worldPosition;
    out vec3 v_worldNormal;
    out vec2 v_texCoord;
    out vec4 v_shadowCoord;
    out mat3 v_TBN;
    out vec3 v_viewPosition;

    void main() {
      // World space position
      vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
      v_worldPosition = worldPos.xyz;

      // World space normal
      v_worldNormal = normalize(u_normalMatrix * a_normal);

      // Texture coordinates
      v_texCoord = a_texCoord;

      // Shadow coordinates (light space)
      v_shadowCoord = u_lightSpaceMatrix * worldPos;

      // TBN matrix for normal mapping
      vec3 T = normalize(u_normalMatrix * a_tangent.xyz);
      vec3 N = v_worldNormal;
      vec3 B = cross(N, T) * a_tangent.w;
      v_TBN = mat3(T, B, N);

      // View space position for fog/depth effects
      vec4 viewPos = u_viewMatrix * worldPos;
      v_viewPosition = viewPos.xyz;

      gl_Position = u_projectionMatrix * viewPos;
    }
  `;

  // =============================================================================
  // PBR FRAGMENT SHADER - Cook-Torrance BRDF with full features
  // =============================================================================
  private static PBR_FRAGMENT_SHADER = `#version 300 es
    precision highp float;
    precision highp sampler2D;
    precision highp samplerCube;

    // Inputs from vertex shader
    in vec3 v_worldPosition;
    in vec3 v_worldNormal;
    in vec2 v_texCoord;
    in vec4 v_shadowCoord;
    in mat3 v_TBN;
    in vec3 v_viewPosition;

    // Material uniforms
    uniform vec3 u_albedo;
    uniform float u_metallic;
    uniform float u_roughness;
    uniform float u_ao;
    uniform vec3 u_emission;
    uniform float u_emissionIntensity;

    // Texture flags (0 = no texture, 1 = has texture)
    uniform int u_hasAlbedoMap;
    uniform int u_hasNormalMap;
    uniform int u_hasMetallicRoughnessMap;
    uniform int u_hasAOMap;
    uniform int u_hasEmissionMap;
    uniform int u_hasEnvMap;
    uniform int u_hasShadowMap;

    // Texture samplers - sampler2D only (no cubemaps until IBL textures are loaded)
    uniform sampler2D u_albedoMap;
    uniform sampler2D u_normalMap;
    uniform sampler2D u_metallicRoughnessMap;
    uniform sampler2D u_aoMap;
    uniform sampler2D u_emissionMap;
    uniform sampler2D u_shadowMap;
    // Note: samplerCube uniforms for envMap/irradianceMap removed to avoid WebGL
    // sampler type conflicts. IBL will use procedural sky until cubemaps are implemented.

    // Lighting uniforms
    uniform vec3 u_lightPositions[8];
    uniform vec3 u_lightColors[8];
    uniform float u_lightIntensities[8];
    uniform int u_lightTypes[8]; // 0=directional, 1=point, 2=spot
    uniform vec3 u_lightDirections[8];
    uniform float u_lightRanges[8];
    uniform float u_spotAngles[8];
    uniform int u_lightCount;

    // Camera
    uniform vec3 u_cameraPosition;

    // Shadow
    uniform float u_shadowBias;
    uniform float u_shadowIntensity;

    // Environment
    uniform float u_envIntensity;
    uniform float u_exposure;

    out vec4 fragColor;

    // ==========================================================================
    // CONSTANTS
    // ==========================================================================
    const float PI = 3.14159265359;
    const float EPSILON = 0.0001;

    // ==========================================================================
    // PBR FUNCTIONS - Cook-Torrance BRDF
    // ==========================================================================

    // Normal Distribution Function (GGX/Trowbridge-Reitz)
    // Models the distribution of microfacets on a surface
    float DistributionGGX(vec3 N, vec3 H, float roughness) {
      float a = roughness * roughness;
      float a2 = a * a;
      float NdotH = max(dot(N, H), 0.0);
      float NdotH2 = NdotH * NdotH;

      float denom = (NdotH2 * (a2 - 1.0) + 1.0);
      denom = PI * denom * denom;

      return a2 / max(denom, EPSILON);
    }

    // Geometry Function (Schlick-GGX)
    // Accounts for self-shadowing of microfacets
    float GeometrySchlickGGX(float NdotV, float roughness) {
      float r = roughness + 1.0;
      float k = (r * r) / 8.0;
      return NdotV / (NdotV * (1.0 - k) + k);
    }

    // Smith's method combining geometry shadowing and masking
    float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
      float NdotV = max(dot(N, V), 0.0);
      float NdotL = max(dot(N, L), 0.0);
      float ggx2 = GeometrySchlickGGX(NdotV, roughness);
      float ggx1 = GeometrySchlickGGX(NdotL, roughness);
      return ggx1 * ggx2;
    }

    // Fresnel (Schlick approximation)
    // Models the reflection at grazing angles
    vec3 FresnelSchlick(float cosTheta, vec3 F0) {
      return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
    }

    // Fresnel with roughness for IBL
    vec3 FresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
      return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
    }

    // ==========================================================================
    // SHADOW MAPPING - PCF Soft Shadows
    // ==========================================================================

    float ShadowCalculation(vec4 fragPosLightSpace, vec3 normal, vec3 lightDir) {
      if (u_hasShadowMap == 0) return 0.0;

      vec3 projCoords = fragPosLightSpace.xyz / fragPosLightSpace.w;
      projCoords = projCoords * 0.5 + 0.5;

      // Outside shadow map
      if (projCoords.z > 1.0 || projCoords.x < 0.0 || projCoords.x > 1.0 ||
          projCoords.y < 0.0 || projCoords.y > 1.0) {
        return 0.0;
      }

      float currentDepth = projCoords.z;

      // Slope-scaled bias to reduce shadow acne
      float bias = max(0.005 * (1.0 - dot(normal, lightDir)), u_shadowBias);

      // PCF (Percentage Closer Filtering) for soft shadows - 5x5 kernel
      float shadow = 0.0;
      vec2 texelSize = 1.0 / vec2(textureSize(u_shadowMap, 0));

      for (int x = -2; x <= 2; ++x) {
        for (int y = -2; y <= 2; ++y) {
          float pcfDepth = texture(u_shadowMap, projCoords.xy + vec2(x, y) * texelSize).r;
          shadow += currentDepth - bias > pcfDepth ? 1.0 : 0.0;
        }
      }
      shadow /= 25.0;

      return shadow * u_shadowIntensity;
    }

    // ==========================================================================
    // IMAGE-BASED LIGHTING (IBL) - Procedural Sky Ambient
    // ==========================================================================

    vec3 IBL(vec3 N, vec3 V, vec3 albedo, float metallic, float roughness, vec3 F0) {
      // Enhanced procedural hemisphere lighting for realistic ambient
      // Uses a tri-color gradient (sky, horizon, ground) for natural outdoor lighting

      // Colors tuned for outdoor daylight scene
      vec3 skyColor = vec3(0.6, 0.8, 1.0);      // Bright blue sky
      vec3 horizonColor = vec3(0.9, 0.85, 0.75); // Warm bright horizon
      vec3 groundColor = vec3(0.35, 0.3, 0.25);  // Warm ground bounce
      vec3 sunGlowColor = vec3(1.0, 0.95, 0.8);  // Sun glow direction

      // Blend based on normal direction
      float upFactor = dot(N, vec3(0.0, 1.0, 0.0));
      float skyBlend = clamp(upFactor, 0.0, 1.0);
      float groundBlend = clamp(-upFactor, 0.0, 1.0);
      float horizonBlend = 1.0 - abs(upFactor);

      // Strong tri-color ambient with emphasis on sky
      vec3 ambientColor = skyColor * skyBlend * 1.2 +
                         groundColor * groundBlend * 0.8 +
                         horizonColor * horizonBlend * 0.6;

      // Add sun glow direction for extra warmth
      float sunFactor = max(dot(N, normalize(vec3(0.5, 0.5, 0.5))), 0.0);
      ambientColor += sunGlowColor * sunFactor * 0.3;

      // PBR-correct ambient with Fresnel
      float NdotV = max(dot(N, V), 0.0);
      vec3 F = FresnelSchlickRoughness(NdotV, F0, roughness);
      vec3 kD = (1.0 - F) * (1.0 - metallic);

      // Strong diffuse ambient - this is key for non-metallic surfaces
      vec3 diffuse = ambientColor * albedo * kD * 1.5;

      // Specular ambient based on reflection direction
      vec3 R = reflect(-V, N);
      float specFactor = max(R.y * 0.5 + 0.5, 0.0) * (1.0 - roughness * 0.8);
      vec3 specular = mix(horizonColor, skyColor, clamp(R.y, 0.0, 1.0)) * F * specFactor * 0.4;

      // Ensure minimum ambient visibility
      vec3 minAmbient = albedo * 0.1;

      return max(diffuse + specular, minAmbient) * u_envIntensity;
    }

    // ==========================================================================
    // LIGHT ATTENUATION
    // ==========================================================================

    float PointLightAttenuation(float distance, float range) {
      // Physically accurate inverse square falloff with range cutoff
      float attenuation = 1.0 / (distance * distance + 1.0);
      float rangeFactor = clamp(1.0 - pow(distance / range, 4.0), 0.0, 1.0);
      return attenuation * rangeFactor * rangeFactor;
    }

    float SpotLightAttenuation(vec3 lightDir, vec3 spotDir, float spotAngle, float distance, float range) {
      float theta = dot(lightDir, normalize(-spotDir));
      float innerCone = spotAngle * 0.8;
      float outerCone = spotAngle;
      float epsilon = innerCone - outerCone;
      float intensity = clamp((theta - outerCone) / epsilon, 0.0, 1.0);
      return intensity * PointLightAttenuation(distance, range);
    }

    // ==========================================================================
    // HDR TONE MAPPING - ACES Filmic
    // ==========================================================================

    vec3 ACESFilm(vec3 x) {
      float a = 2.51;
      float b = 0.03;
      float c = 2.43;
      float d = 0.59;
      float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    // ==========================================================================
    // MAIN
    // ==========================================================================

    void main() {
      // Sample material properties from textures or use uniforms
      vec3 albedo = u_albedo;
      if (u_hasAlbedoMap == 1) {
        vec4 albedoSample = texture(u_albedoMap, v_texCoord);
        albedo = pow(albedoSample.rgb, vec3(2.2)); // sRGB to linear
      }

      float metallic = u_metallic;
      float roughness = u_roughness;
      if (u_hasMetallicRoughnessMap == 1) {
        vec4 mrSample = texture(u_metallicRoughnessMap, v_texCoord);
        metallic = mrSample.b; // Blue channel = metallic
        roughness = mrSample.g; // Green channel = roughness
      }
      roughness = clamp(roughness, 0.04, 1.0); // Prevent divide by zero in GGX

      float ao = u_ao;
      if (u_hasAOMap == 1) {
        ao = texture(u_aoMap, v_texCoord).r;
      }

      vec3 emission = u_emission * u_emissionIntensity;
      if (u_hasEmissionMap == 1) {
        emission = texture(u_emissionMap, v_texCoord).rgb * u_emissionIntensity;
      }

      // Normal mapping
      vec3 N = normalize(v_worldNormal);
      if (u_hasNormalMap == 1) {
        vec3 normalSample = texture(u_normalMap, v_texCoord).rgb * 2.0 - 1.0;
        N = normalize(v_TBN * normalSample);
      }

      vec3 V = normalize(u_cameraPosition - v_worldPosition);

      // F0 (base reflectivity) - dielectric use 0.04, metals use albedo
      vec3 F0 = mix(vec3(0.04), albedo, metallic);

      // =======================================================================
      // DIRECT LIGHTING - Full Cook-Torrance PBR BRDF
      // =======================================================================
      vec3 Lo = vec3(0.0);

      // Main directional light (sun) - hardcoded for reliability
      // Direction points FROM the light source
      vec3 sunDirection = normalize(vec3(-0.4, -0.8, -0.4));
      vec3 sunColor = vec3(1.0, 0.98, 0.92);
      float sunIntensity = 3.0;

      // Light direction is opposite of sun direction (towards the light)
      vec3 L = normalize(-sunDirection);
      vec3 H = normalize(V + L);

      float NdotL = max(dot(N, L), 0.0);
      float NdotV = max(dot(N, V), 0.0);
      float NdotH = max(dot(N, H), 0.0);
      float VdotH = max(dot(V, H), 0.0);

      if (NdotL > 0.0) {
        // Cook-Torrance BRDF components
        float D = DistributionGGX(N, H, roughness);
        float G = GeometrySmith(N, V, L, roughness);
        vec3 F = FresnelSchlick(VdotH, F0);

        // Specular BRDF
        vec3 numerator = D * G * F;
        float denominator = 4.0 * NdotV * NdotL + EPSILON;
        vec3 specular = numerator / denominator;

        // Diffuse BRDF (Lambert)
        vec3 kS = F;
        vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);
        vec3 diffuse = kD * albedo / PI;

        // Combine
        vec3 radiance = sunColor * sunIntensity;
        Lo += (diffuse + specular) * radiance * NdotL;
      }

      // Fill light (sky bounce from above-left)
      vec3 fillDir = normalize(vec3(0.3, 0.7, -0.3));
      float fillNdotL = max(dot(N, fillDir), 0.0);
      vec3 fillColor = vec3(0.5, 0.6, 0.8) * 0.8; // Cool blue
      Lo += albedo * fillColor * fillNdotL * (1.0 - metallic) / PI;

      // Ground bounce (subtle warm light from below)
      vec3 groundDir = normalize(vec3(0.0, 1.0, 0.0));
      float groundNdotL = max(dot(N, groundDir), 0.0);
      vec3 groundColor = vec3(0.3, 0.25, 0.2) * 0.3;
      Lo += albedo * groundColor * groundNdotL * (1.0 - metallic) / PI;

      // Rim lighting for visual depth
      float rimFactor = pow(1.0 - NdotV, 4.0);
      Lo += vec3(0.4, 0.45, 0.5) * rimFactor * 0.15;

      // Process additional lights from uniform array
      for (int i = 0; i < 8; ++i) {
        if (i >= u_lightCount) break;

        vec3 lightL;
        vec3 lightRadiance;

        if (u_lightTypes[i] == 0) {
          // Directional light
          lightL = normalize(-u_lightDirections[i]);
          lightRadiance = u_lightColors[i] * u_lightIntensities[i];
        } else if (u_lightTypes[i] == 1) {
          // Point light
          vec3 lightVec = u_lightPositions[i] - v_worldPosition;
          float dist = length(lightVec);
          lightL = normalize(lightVec);
          float atten = PointLightAttenuation(dist, u_lightRanges[i]);
          lightRadiance = u_lightColors[i] * u_lightIntensities[i] * atten;
        } else {
          continue;
        }

        float lightNdotL = max(dot(N, lightL), 0.0);
        if (lightNdotL > 0.0) {
          vec3 lightH = normalize(V + lightL);
          float lightNdotH = max(dot(N, lightH), 0.0);
          float lightVdotH = max(dot(V, lightH), 0.0);

          // Full PBR for each light
          float lightD = DistributionGGX(N, lightH, roughness);
          float lightG = GeometrySmith(N, V, lightL, roughness);
          vec3 lightF = FresnelSchlick(lightVdotH, F0);

          vec3 lightSpec = (lightD * lightG * lightF) / (4.0 * NdotV * lightNdotL + EPSILON);
          vec3 lightKD = (vec3(1.0) - lightF) * (1.0 - metallic);
          vec3 lightDiff = lightKD * albedo / PI;

          Lo += (lightDiff + lightSpec) * lightRadiance * lightNdotL;
        }
      }

      // =======================================================================
      // AMBIENT / IBL
      // =======================================================================
      vec3 ambient = IBL(N, V, albedo, metallic, roughness, F0) * ao;

      // =======================================================================
      // COMBINE
      // =======================================================================
      vec3 color = ambient + Lo + emission;

      // Ensure we have some minimum visibility - add a base ambient if too dark
      float luminance = dot(color, vec3(0.299, 0.587, 0.114));
      if (luminance < 0.05) {
        color += albedo * 0.15; // Add some ambient to prevent pure black
      }

      // =======================================================================
      // HDR TONE MAPPING & GAMMA CORRECTION
      // =======================================================================

      // Exposure adjustment
      color *= u_exposure;

      // ACES Filmic tone mapping
      color = ACESFilm(color);

      // Gamma correction (linear to sRGB)
      color = pow(color, vec3(1.0 / 2.2));

      // PROPER PBR OUTPUT - normals confirmed working
      fragColor = vec4(color, 1.0);
    }
  `;

  // Cached uniform locations for PBR shader
  private pbrUniformLocations: Map<string, WebGLUniformLocation | null> = new Map();

  /**
   * Initializes the PBR scene rendering shader.
   */
  private initPBRShader(gl: WebGL2RenderingContext): void {
    if (this.simpleShaderProgram) return;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, Renderer.PBR_VERTEX_SHADER);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      logger.error('PBR Vertex shader error:', gl.getShaderInfoLog(vs));
      return;
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, Renderer.PBR_FRAGMENT_SHADER);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      logger.error('PBR Fragment shader error:', gl.getShaderInfoLog(fs));
      return;
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      logger.error('PBR Shader program error:', gl.getProgramInfoLog(program));
      return;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.simpleShaderProgram = program;

    // Cache all uniform locations
    const uniformNames = [
      // Transform uniforms
      'u_modelMatrix', 'u_viewMatrix', 'u_projectionMatrix', 'u_normalMatrix', 'u_lightSpaceMatrix',
      // Material uniforms
      'u_albedo', 'u_metallic', 'u_roughness', 'u_ao', 'u_emission', 'u_emissionIntensity',
      // Texture flags
      'u_hasAlbedoMap', 'u_hasNormalMap', 'u_hasMetallicRoughnessMap', 'u_hasAOMap',
      'u_hasEmissionMap', 'u_hasEnvMap', 'u_hasShadowMap',
      // Camera
      'u_cameraPosition',
      // Shadow
      'u_shadowBias', 'u_shadowIntensity',
      // Environment
      'u_envIntensity', 'u_exposure',
      // Light count
      'u_lightCount',
    ];

    for (const name of uniformNames) {
      this.pbrUniformLocations.set(name, gl.getUniformLocation(program, name));
    }

    // Cache array uniforms
    for (let i = 0; i < 8; i++) {
      this.pbrUniformLocations.set(`u_lightPositions[${i}]`, gl.getUniformLocation(program, `u_lightPositions[${i}]`));
      this.pbrUniformLocations.set(`u_lightColors[${i}]`, gl.getUniformLocation(program, `u_lightColors[${i}]`));
      this.pbrUniformLocations.set(`u_lightIntensities[${i}]`, gl.getUniformLocation(program, `u_lightIntensities[${i}]`));
      this.pbrUniformLocations.set(`u_lightTypes[${i}]`, gl.getUniformLocation(program, `u_lightTypes[${i}]`));
      this.pbrUniformLocations.set(`u_lightDirections[${i}]`, gl.getUniformLocation(program, `u_lightDirections[${i}]`));
      this.pbrUniformLocations.set(`u_lightRanges[${i}]`, gl.getUniformLocation(program, `u_lightRanges[${i}]`));
      this.pbrUniformLocations.set(`u_spotAngles[${i}]`, gl.getUniformLocation(program, `u_spotAngles[${i}]`));
    }

    logger.info('PBR Cook-Torrance shader initialized with full BRDF pipeline');
  }

  /**
   * Gets or creates GPU buffers for a mesh.
   */
  private getMeshBuffers(gl: WebGL2RenderingContext, mesh: Mesh): { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; ibo: WebGLBuffer; indexCount: number } | null {
    const cached = this.meshGPUBuffers.get(mesh);
    if (cached) return cached;

    // Create VAO
    const vao = gl.createVertexArray();
    if (!vao) return null;

    // Create VBO
    const vbo = gl.createBuffer();
    if (!vbo) { gl.deleteVertexArray(vao); return null; }

    // Create IBO
    const ibo = gl.createBuffer();
    if (!ibo) { gl.deleteVertexArray(vao); gl.deleteBuffer(vbo); return null; }

    gl.bindVertexArray(vao);

    // Upload vertex data
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertexBuffer.data, gl.STATIC_DRAW);

    // Setup vertex attributes based on format
    const format = mesh.vertexBuffer.format;
    const stride = format.stride;

    // Position (location 0)
    const posAttr = format.attributes.find(a => a.semantic === 'POSITION');
    if (posAttr) {
      // Get component count from type (Float3 = 3 components)
      const componentCount = this.getComponentCount(posAttr.type);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, componentCount, gl.FLOAT, false, stride, posAttr.offset);
    }

    // Normal (location 1)
    const normAttr = format.attributes.find(a => a.semantic === 'NORMAL');
    if (normAttr) {
      const componentCount = this.getComponentCount(normAttr.type);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, componentCount, gl.FLOAT, false, stride, normAttr.offset);
    } else {
      // No normals in mesh - set default up vector as constant attribute
      gl.disableVertexAttribArray(1);
      gl.vertexAttrib3f(1, 0.0, 1.0, 0.0); // Default normal pointing up
    }

    // Texture coordinates (location 2)
    const texAttr = format.attributes.find(a => a.semantic === 'TEXCOORD_0');
    if (texAttr) {
      const componentCount = this.getComponentCount(texAttr.type);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, componentCount, gl.FLOAT, false, stride, texAttr.offset);
    } else {
      // No UVs - set default
      gl.disableVertexAttribArray(2);
      gl.vertexAttrib2f(2, 0.0, 0.0);
    }

    // Tangent (location 3) - needed for normal mapping
    const tanAttr = format.attributes.find(a => a.semantic === 'TANGENT');
    if (tanAttr) {
      const componentCount = this.getComponentCount(tanAttr.type);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, componentCount, gl.FLOAT, false, stride, tanAttr.offset);
    } else {
      // No tangents - set default
      gl.disableVertexAttribArray(3);
      gl.vertexAttrib4f(3, 1.0, 0.0, 0.0, 1.0); // Default tangent along X
    }

    // Upload index data
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer.data, gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    const result = { vao, vbo, ibo, indexCount: mesh.indexBuffer.indexCount };
    this.meshGPUBuffers.set(mesh, result);

    // Log detailed vertex format info for debugging
    const attrs = format.attributes.map(a => `${a.semantic}@${a.offset}`).join(', ');
    logger.info(`GPU buffers for ${mesh.name}: ${mesh.vertexCount} verts, stride=${format.stride}, attrs=[${attrs}]`);

    // Check if normals are present
    if (!normAttr) {
      logger.warn(`Mesh ${mesh.name} has NO NORMALS - using default up vector`);
    }

    return result;
  }

  /**
   * Gets component count from vertex attribute type.
   */
  private getComponentCount(type: string | number): number {
    // Handle string-based type names
    if (typeof type === 'string') {
      if (type.includes('2')) return 2;
      if (type.includes('3')) return 3;
      if (type.includes('4')) return 4;
      return 3; // Default to 3
    }
    // Handle numeric types (Float2=2, Float3=3, Float4=4)
    return type === 2 ? 2 : type === 3 ? 3 : type === 4 ? 4 : 3;
  }

  /**
   * Renders all meshes in the scene using full PBR Cook-Torrance BRDF.
   */
  private renderSceneMeshes(scene: Scene, camera: Camera): void {
    const device = this.device as any;
    if (!device.getGL) {
      logger.warn('renderSceneMeshes: No GL context');
      return;
    }

    const gl = device.getGL() as WebGL2RenderingContext;

    // Initialize PBR shader if needed
    this.initPBRShader(gl);
    if (!this.simpleShaderProgram) {
      logger.warn('renderSceneMeshes: No PBR shader program');
      return;
    }

    gl.useProgram(this.simpleShaderProgram);

    // Helper to get cached uniform location
    const getUniform = (name: string) => this.pbrUniformLocations.get(name) ?? null;

    // Set camera/view uniforms
    gl.uniformMatrix4fv(getUniform('u_viewMatrix'), false, camera.viewMatrix.elements);
    gl.uniformMatrix4fv(getUniform('u_projectionMatrix'), false, camera.projectionMatrix.elements);

    const camPos = camera.transform.worldPosition;
    gl.uniform3f(getUniform('u_cameraPosition'), camPos.x, camPos.y, camPos.z);

    // Debug camera on first frame
    if (this.frameCount === 1) {
      logger.info(`Camera position: (${camPos.x.toFixed(2)}, ${camPos.y.toFixed(2)}, ${camPos.z.toFixed(2)})`);
      const viewElements = camera.viewMatrix.elements;
      logger.info(`View matrix translate: (${viewElements[12].toFixed(2)}, ${viewElements[13].toFixed(2)}, ${viewElements[14].toFixed(2)})`);
      const projElements = camera.projectionMatrix.elements;
      logger.info(`Projection matrix [0,0]=${projElements[0].toFixed(4)}, [5]=${projElements[5].toFixed(4)}, [10]=${projElements[10].toFixed(4)}, [11]=${projElements[11].toFixed(4)}`);
    }

    // Set default light space matrix (identity for now - will be updated with shadow mapping)
    const identityMatrix = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    gl.uniformMatrix4fv(getUniform('u_lightSpaceMatrix'), false, identityMatrix);

    // ==========================================================================
    // SETUP LIGHTING - Gather lights from LightManager
    // ==========================================================================
    const lights = this.lightManager.getLights();
    const lightCount = Math.min(lights.length, 8);

    // Set light count
    gl.uniform1i(getUniform('u_lightCount'), Math.max(lightCount, 1));

    if (lightCount === 0) {
      // No lights in scene - add strong default sun light coming from front-top-right
      // Direction must be normalized: (0.4, -0.8, 0.4) normalized = (0.42, -0.84, 0.42)
      gl.uniform3f(getUniform('u_lightPositions[0]'), 100, 200, 100);
      gl.uniform3f(getUniform('u_lightColors[0]'), 1.0, 0.98, 0.92); // Warm sunlight
      gl.uniform1f(getUniform('u_lightIntensities[0]'), 5.0); // Strong sun
      gl.uniform1i(getUniform('u_lightTypes[0]'), 0); // Directional
      // Normalized direction pointing down and slightly forward
      gl.uniform3f(getUniform('u_lightDirections[0]'), 0.42, -0.84, 0.42);
      gl.uniform1f(getUniform('u_lightRanges[0]'), 1000.0);
      gl.uniform1f(getUniform('u_spotAngles[0]'), 0.0);
      gl.uniform1i(getUniform('u_lightCount'), 1);
    } else {
      // Upload actual lights from LightManager
      for (let i = 0; i < lightCount; i++) {
        const light = lights[i] as any;
        const pos = light.transform?.worldPosition || light.position || { x: 0, y: 10, z: 0 };
        const color = light.color || { r: 1, g: 1, b: 1 };
        const intensity = light.intensity ?? 1.0;
        const lightType = light.type === 'directional' ? 0 : light.type === 'point' ? 1 : 2;
        const dir = light.direction || { x: 0, y: -1, z: 0 };
        const range = light.range ?? 100.0;
        const spotAngle = light.spotAngle ?? Math.PI / 4;

        gl.uniform3f(getUniform(`u_lightPositions[${i}]`), pos.x, pos.y, pos.z);
        gl.uniform3f(getUniform(`u_lightColors[${i}]`), color.r, color.g, color.b);
        gl.uniform1f(getUniform(`u_lightIntensities[${i}]`), intensity);
        gl.uniform1i(getUniform(`u_lightTypes[${i}]`), lightType);
        gl.uniform3f(getUniform(`u_lightDirections[${i}]`), dir.x, dir.y, dir.z);
        gl.uniform1f(getUniform(`u_lightRanges[${i}]`), range);
        gl.uniform1f(getUniform(`u_spotAngles[${i}]`), spotAngle);
      }
    }

    // ==========================================================================
    // GLOBAL RENDERING SETTINGS
    // ==========================================================================

    // Shadow settings (disabled for now until shadow mapping implemented)
    gl.uniform1i(getUniform('u_hasShadowMap'), 0);
    gl.uniform1f(getUniform('u_shadowBias'), 0.001);
    gl.uniform1f(getUniform('u_shadowIntensity'), 0.7);

    // Environment settings
    gl.uniform1i(getUniform('u_hasEnvMap'), 0); // Will enable when IBL implemented
    gl.uniform1f(getUniform('u_envIntensity'), 1.0);
    gl.uniform1f(getUniform('u_exposure'), 1.0);

    // Texture flags (default: no textures)
    gl.uniform1i(getUniform('u_hasAlbedoMap'), 0);
    gl.uniform1i(getUniform('u_hasNormalMap'), 0);
    gl.uniform1i(getUniform('u_hasMetallicRoughnessMap'), 0);
    gl.uniform1i(getUniform('u_hasAOMap'), 0);
    gl.uniform1i(getUniform('u_hasEmissionMap'), 0);

    let meshCount = 0;
    let totalNodes = 0;
    let nodesWithMesh = 0;

    // ==========================================================================
    // FORCE UPDATE ALL TRANSFORMS BEFORE RENDERING
    // ==========================================================================
    scene.traverse((node: SceneNode) => {
      // Force world matrix update for all nodes
      if (node.transform) {
        node.transform.updateWorldMatrix(true);
      }
    });

    // ==========================================================================
    // SCENE TRAVERSAL AND RENDERING
    // ==========================================================================
    let vehicleNodesFound = 0;
    let vehicleMeshesFound = 0;
    scene.traverse((node: SceneNode) => {
      totalNodes++;

      // Special logging for vehicle nodes to debug why cars don't render
      const isVehicleNode = node.name.includes('Vehicle') || node.name.includes('_Body') ||
                            node.name.includes('_Cabin') || node.name.includes('_Wheel');
      if (isVehicleNode) {
        vehicleNodesFound++;
        if (this.frameCount <= 3) {
          const worldPos = node.transform.worldPosition;
          const hasMesh = !!node.mesh;
          const parent = node.parent ? node.parent.name : 'none';
          logger.info(`[VEHICLE DEBUG] Node: ${node.name}, parent: ${parent}, hasMesh: ${hasMesh}, worldPos: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`);
        }
      }

      const mesh = node.mesh as Mesh;
      if (!mesh) {
        return;
      }
      nodesWithMesh++;

      if (isVehicleNode) {
        vehicleMeshesFound++;
        if (this.frameCount <= 3) {
          logger.info(`[VEHICLE DEBUG] ${node.name} HAS MESH: verts=${mesh.vertexCount}, indices=${mesh.indexCount}`);
        }
      }

      if (!mesh.vertexBuffer || !mesh.indexBuffer) {
        logger.warn(`Node ${node.name} has mesh but missing buffers`);
        return;
      }
      if (this.frameCount === 1) {
        const worldPos = node.transform.worldPosition;
        logger.info(`Rendering node: ${node.name}, vertices: ${mesh.vertexCount}, indices: ${mesh.indexCount}, worldPos: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`);
      }

      const buffers = this.getMeshBuffers(gl, mesh);
      if (!buffers) return;

      // Calculate model matrix from node transform
      const modelMatrix = node.transform.worldMatrix;
      gl.uniformMatrix4fv(getUniform('u_modelMatrix'), false, modelMatrix.elements);

      if (this.frameCount === 1 && meshCount < 3) {
        // Log first few model matrices for debugging
        const e = modelMatrix.elements;
        logger.info(`Model matrix [${node.name}]: translate=(${e[12].toFixed(2)}, ${e[13].toFixed(2)}, ${e[14].toFixed(2)})`);
      }

      // Calculate normal matrix (inverse transpose of 3x3 model matrix)
      const normalMatrix = new Float32Array(9);
      const m = modelMatrix.elements;
      // For correct normal transformation, we need inverse transpose
      // Simplified version assumes uniform/no scale
      normalMatrix[0] = m[0]; normalMatrix[1] = m[1]; normalMatrix[2] = m[2];
      normalMatrix[3] = m[4]; normalMatrix[4] = m[5]; normalMatrix[5] = m[6];
      normalMatrix[6] = m[8]; normalMatrix[7] = m[9]; normalMatrix[8] = m[10];
      gl.uniformMatrix3fv(getUniform('u_normalMatrix'), false, normalMatrix);

      // ==========================================================================
      // MATERIAL PROPERTIES
      // ==========================================================================
      let albedo = [0.8, 0.8, 0.8];
      let metallic = 0.0;
      let roughness = 0.5;
      let ao = 1.0;
      let emission = [0.0, 0.0, 0.0];
      let emissionIntensity = 0.0;

      if (node.material) {
        const mat = node.material as any;
        // StandardPBRMaterial stores properties in mat.properties, but some materials
        // have them directly on mat. Check both locations.
        const props = mat.properties || mat;

        // Albedo/base color - check nested and direct locations
        const color = props.albedo || props.baseColor || mat.albedo || mat.baseColor || mat.color;
        if (color) {
          albedo = [color.r ?? 0.8, color.g ?? 0.8, color.b ?? 0.8];
        }

        // PBR properties - check both locations with nullish coalescing
        const metallicVal = props.metallic ?? mat.metallic;
        const roughnessVal = props.roughness ?? mat.roughness;
        const aoVal = props.ao ?? mat.ao;

        if (metallicVal !== undefined) metallic = metallicVal;
        if (roughnessVal !== undefined) roughness = roughnessVal;
        if (aoVal !== undefined) ao = aoVal;

        // Emission - check nested and direct locations
        const emissionColor = props.emission || props.emissive || mat.emission || mat.emissive;
        if (emissionColor) {
          emission = [emissionColor.r ?? 0, emissionColor.g ?? 0, emissionColor.b ?? 0];
        }
        const emIntensity = props.emissionIntensity ?? props.emissiveIntensity ?? mat.emissionIntensity ?? mat.emissiveIntensity;
        if (emIntensity !== undefined) emissionIntensity = emIntensity;

        // Log material properties on first few frames to verify they're being read
        if (this.frameCount <= 3 && metallicVal !== undefined) {
          logger.info(`[MATERIAL] ${node.name}: albedo=(${albedo[0].toFixed(2)},${albedo[1].toFixed(2)},${albedo[2].toFixed(2)}), metallic=${metallic.toFixed(2)}, roughness=${roughness.toFixed(2)}`);
        }
      }

      // Upload material uniforms
      gl.uniform3f(getUniform('u_albedo'), albedo[0], albedo[1], albedo[2]);
      gl.uniform1f(getUniform('u_metallic'), metallic);
      gl.uniform1f(getUniform('u_roughness'), Math.max(roughness, 0.04)); // Clamp to prevent div by zero
      gl.uniform1f(getUniform('u_ao'), ao);
      gl.uniform3f(getUniform('u_emission'), emission[0], emission[1], emission[2]);
      gl.uniform1f(getUniform('u_emissionIntensity'), emissionIntensity);

      // Bind VAO and draw
      gl.bindVertexArray(buffers.vao);
      gl.drawElements(gl.TRIANGLES, buffers.indexCount, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);

      meshCount++;
    });

    gl.useProgram(null);

    // Log on first frame or every 60 frames
    if (this.frameCount === 1 || this.frameCount % 60 === 0) {
      logger.info(`PBR Render: ${totalNodes} nodes, ${nodesWithMesh} with mesh, ${meshCount} drawn`);
      logger.info(`Vehicle stats: ${vehicleNodesFound} vehicle nodes found, ${vehicleMeshesFound} with meshes`);
    }
  }

  /**
   * Renders a debug test cube directly in view to verify shader pipeline.
   * This bypasses the scene graph to isolate rendering issues.
   */
  private renderDebugTest(scene: Scene, camera: Camera): void {
    const device = this.device as any;
    if (!device.getGL || !this.simpleShaderProgram) return;

    const gl = device.getGL() as WebGL2RenderingContext;
    gl.useProgram(this.simpleShaderProgram);

    const getUniform = (name: string) => this.pbrUniformLocations.get(name) ?? null;

    // Create a simple test cube at ORIGIN with LARGE size (10 units)
    // Camera at (0, 5, 15) looking at origin should see this
    const cubePos = new Vector3(0, 2, 0); // Put cube at (0, 2, 0) so it's centered slightly above ground

    // Log debug info on first few frames
    const camPos = camera.transform.worldPosition;
    if (this.frameCount <= 3) {
      logger.info(`[DEBUG TEST] Camera pos: (${camPos.x.toFixed(2)}, ${camPos.y.toFixed(2)}, ${camPos.z.toFixed(2)})`);
      logger.info(`[DEBUG TEST] Test cube pos: (${cubePos.x.toFixed(2)}, ${cubePos.y.toFixed(2)}, ${cubePos.z.toFixed(2)})`);

      // Debug the actual matrices
      const viewM = camera.viewMatrix.elements;
      const projM = camera.projectionMatrix.elements;
      logger.info(`[DEBUG TEST] View matrix row 3 (translation): (${viewM[12].toFixed(2)}, ${viewM[13].toFixed(2)}, ${viewM[14].toFixed(2)})`);
      logger.info(`[DEBUG TEST] Proj matrix diag: (${projM[0].toFixed(4)}, ${projM[5].toFixed(4)}, ${projM[10].toFixed(4)})`);
      logger.info(`[DEBUG TEST] Proj matrix [14]=${projM[14].toFixed(4)}, [15]=${projM[15].toFixed(4)}`);
    }

    // Create a simple model matrix for the test cube (just translation, no rotation)
    const modelMatrix = Matrix4.translation(cubePos.x, cubePos.y, cubePos.z);

    // Set uniforms
    gl.uniformMatrix4fv(getUniform('u_modelMatrix'), false, modelMatrix.elements);
    gl.uniformMatrix4fv(getUniform('u_viewMatrix'), false, camera.viewMatrix.elements);
    gl.uniformMatrix4fv(getUniform('u_projectionMatrix'), false, camera.projectionMatrix.elements);

    // Normal matrix (identity for no rotation)
    const normalMatrix = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
    gl.uniformMatrix3fv(getUniform('u_normalMatrix'), false, normalMatrix);

    // Set bright red color to be very visible
    gl.uniform3f(getUniform('u_albedo'), 1.0, 0.0, 0.0);
    gl.uniform1f(getUniform('u_metallic'), 0.0);
    gl.uniform1f(getUniform('u_roughness'), 0.5);
    gl.uniform1f(getUniform('u_ao'), 1.0);
    gl.uniform3f(getUniform('u_emission'), 0.5, 0.0, 0.0); // Add emission to ensure visibility
    gl.uniform1f(getUniform('u_emissionIntensity'), 1.0);

    // Create a simple cube with hardcoded vertices
    // 10 unit cube centered at origin - should be VERY visible
    const cubeSize = 10.0;
    const s = cubeSize / 2;

    // Position, Normal, TexCoord for each vertex
    // Front face (+Z) - 4 vertices
    const cubeVertices = new Float32Array([
      // Front face (+Z)
      -s, -s,  s,   0, 0, 1,   0, 0,  // 0
       s, -s,  s,   0, 0, 1,   1, 0,  // 1
       s,  s,  s,   0, 0, 1,   1, 1,  // 2
      -s,  s,  s,   0, 0, 1,   0, 1,  // 3
      // Back face (-Z)
       s, -s, -s,   0, 0, -1,  0, 0,  // 4
      -s, -s, -s,   0, 0, -1,  1, 0,  // 5
      -s,  s, -s,   0, 0, -1,  1, 1,  // 6
       s,  s, -s,   0, 0, -1,  0, 1,  // 7
      // Top face (+Y)
      -s,  s,  s,   0, 1, 0,   0, 0,  // 8
       s,  s,  s,   0, 1, 0,   1, 0,  // 9
       s,  s, -s,   0, 1, 0,   1, 1,  // 10
      -s,  s, -s,   0, 1, 0,   0, 1,  // 11
      // Bottom face (-Y)
      -s, -s, -s,   0, -1, 0,  0, 0,  // 12
       s, -s, -s,   0, -1, 0,  1, 0,  // 13
       s, -s,  s,   0, -1, 0,  1, 1,  // 14
      -s, -s,  s,   0, -1, 0,  0, 1,  // 15
      // Right face (+X)
       s, -s,  s,   1, 0, 0,   0, 0,  // 16
       s, -s, -s,   1, 0, 0,   1, 0,  // 17
       s,  s, -s,   1, 0, 0,   1, 1,  // 18
       s,  s,  s,   1, 0, 0,   0, 1,  // 19
      // Left face (-X)
      -s, -s, -s,   -1, 0, 0,  0, 0,  // 20
      -s, -s,  s,   -1, 0, 0,  1, 0,  // 21
      -s,  s,  s,   -1, 0, 0,  1, 1,  // 22
      -s,  s, -s,   -1, 0, 0,  0, 1,  // 23
    ]);

    const cubeIndices = new Uint16Array([
      0, 1, 2,  0, 2, 3,    // front
      4, 5, 6,  4, 6, 7,    // back
      8, 9, 10, 8, 10, 11,  // top
      12, 13, 14, 12, 14, 15, // bottom
      16, 17, 18, 16, 18, 19, // right
      20, 21, 22, 20, 22, 23, // left
    ]);

    // Create/reuse test cube buffers
    // Force recreate on first frame to ensure correct size
    if (this.debugVAO && this.frameCount === 1) {
      gl.deleteVertexArray(this.debugVAO);
      gl.deleteBuffer(this.debugVBO!);
      gl.deleteBuffer(this.debugIBO!);
      this.debugVAO = null;
      this.debugVBO = null;
      this.debugIBO = null;
    }
    if (!this.debugVAO) {
      this.debugVAO = gl.createVertexArray();
      this.debugVBO = gl.createBuffer();
      this.debugIBO = gl.createBuffer();

      gl.bindVertexArray(this.debugVAO);

      // Upload vertex data
      gl.bindBuffer(gl.ARRAY_BUFFER, this.debugVBO);
      gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW);

      // Stride: 3 (pos) + 3 (norm) + 2 (uv) = 8 floats = 32 bytes
      const stride = 8 * 4;

      // Position (location 0)
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);

      // Normal (location 1)
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);

      // TexCoord (location 2)
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 6 * 4);

      // Tangent (location 3) - use default
      gl.disableVertexAttribArray(3);
      gl.vertexAttrib4f(3, 1.0, 0.0, 0.0, 1.0);

      // Upload index data
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.debugIBO);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cubeIndices, gl.STATIC_DRAW);

      gl.bindVertexArray(null);

      logger.info('[DEBUG TEST] Created debug test cube buffers');
    }

    // Draw the test cube
    // Disable face culling to ensure we see it regardless of winding order
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.debugVAO);
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    // Re-enable face culling
    gl.enable(gl.CULL_FACE);

    gl.useProgram(null);

    if (this.frameCount <= 3) {
      logger.info('[DEBUG TEST] Drew debug test cube');
    }
  }

  // Debug test cube buffers
  private debugVAO: WebGLVertexArrayObject | null = null;
  private debugVBO: WebGLBuffer | null = null;
  private debugIBO: WebGLBuffer | null = null;

  // Sky gradient shader
  private skyShaderProgram: WebGLProgram | null = null;
  private skyVAO: WebGLVertexArrayObject | null = null;
  private skyVBO: WebGLBuffer | null = null;

  private static SKY_VERTEX_SHADER = `#version 300 es
    precision highp float;
    layout(location = 0) in vec2 a_position;
    out vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.9999, 1.0);
    }
  `;

  private static SKY_FRAGMENT_SHADER = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    out vec4 fragColor;
    void main() {
      // Sky gradient from light blue at top to warm horizon at bottom
      vec3 skyTop = vec3(0.4, 0.6, 0.95);      // Light blue sky
      vec3 skyMid = vec3(0.55, 0.7, 0.95);     // Lighter blue
      vec3 horizon = vec3(0.85, 0.85, 0.8);    // Warm white horizon

      float t = v_uv.y;

      // Two-stage blend: horizon to mid, mid to top
      vec3 color;
      if (t < 0.3) {
        // Near horizon - warm glow
        color = mix(horizon, skyMid, t / 0.3);
      } else {
        // Upper sky - blue gradient
        color = mix(skyMid, skyTop, (t - 0.3) / 0.7);
      }

      // Add subtle sun glow in upper right
      vec2 sunPos = vec2(0.75, 0.85);
      float sunDist = distance(v_uv, sunPos);
      float sunGlow = exp(-sunDist * 4.0) * 0.3;
      color += vec3(1.0, 0.95, 0.8) * sunGlow;

      fragColor = vec4(color, 1.0);
    }
  `;

  /**
   * Renders a sky gradient background.
   */
  private renderSkyGradient(gl: WebGL2RenderingContext): void {
    // Initialize sky shader if needed
    if (!this.skyShaderProgram) {
      const vs = gl.createShader(gl.VERTEX_SHADER)!;
      gl.shaderSource(vs, Renderer.SKY_VERTEX_SHADER);
      gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        logger.error('Sky vertex shader error:', gl.getShaderInfoLog(vs));
        return;
      }

      const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(fs, Renderer.SKY_FRAGMENT_SHADER);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        logger.error('Sky fragment shader error:', gl.getShaderInfoLog(fs));
        return;
      }

      this.skyShaderProgram = gl.createProgram()!;
      gl.attachShader(this.skyShaderProgram, vs);
      gl.attachShader(this.skyShaderProgram, fs);
      gl.linkProgram(this.skyShaderProgram);
      if (!gl.getProgramParameter(this.skyShaderProgram, gl.LINK_STATUS)) {
        logger.error('Sky shader link error:', gl.getProgramInfoLog(this.skyShaderProgram));
        return;
      }

      gl.deleteShader(vs);
      gl.deleteShader(fs);

      // Create fullscreen quad
      this.skyVAO = gl.createVertexArray();
      this.skyVBO = gl.createBuffer();

      gl.bindVertexArray(this.skyVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyVBO);

      // Fullscreen triangle (more efficient than quad)
      const vertices = new Float32Array([
        -1, -1,
         3, -1,
        -1,  3
      ]);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      gl.bindVertexArray(null);

      logger.info('Sky gradient shader initialized');
    }

    // Render sky (no depth write, no depth test)
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    gl.useProgram(this.skyShaderProgram);
    gl.bindVertexArray(this.skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.useProgram(null);

    // Re-enable depth for scene rendering
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  /**
   * Disposes of all resources.
   */
  dispose(): void {
    logger.info('Disposing renderer');

    // Dispose mesh GPU buffers
    const device = this.device as any;
    if (device.getGL) {
      const gl = device.getGL() as WebGL2RenderingContext;
      for (const [, buffers] of this.meshGPUBuffers) {
        gl.deleteVertexArray(buffers.vao);
        gl.deleteBuffer(buffers.vbo);
        gl.deleteBuffer(buffers.ibo);
      }
      if (this.simpleShaderProgram) {
        gl.deleteProgram(this.simpleShaderProgram);
      }
      if (this.skyShaderProgram) {
        gl.deleteProgram(this.skyShaderProgram);
      }
      if (this.skyVAO) {
        gl.deleteVertexArray(this.skyVAO);
      }
      if (this.skyVBO) {
        gl.deleteBuffer(this.skyVBO);
      }
    }
    this.meshGPUBuffers.clear();
    this.simpleShaderProgram = null;
    this.skyShaderProgram = null;

    // Dispose render targets
    this.disposeRenderTargets();

    // Dispose subsystems
    this.resourceManager.dispose();
    this.renderGraph.reset();

    if (this.postProcessStack) {
      this.postProcessStack.dispose();
    }

    // Dispose device
    this.device.dispose();

    logger.info('Renderer disposed');
  }

  /**
   * Disposes render targets.
   */
  private disposeRenderTargets(): void {
    const device = this.device as any;
    const gl = device.getGL ? device.getGL() as WebGL2RenderingContext : null;

    if (this.backbuffer) {
      if (gl) {
        this.backbuffer.dispose(gl);
      }
      this.backbuffer = null;
    }

    if (this.hdrTarget) {
      if (gl) {
        this.hdrTarget.dispose(gl);
      }
      this.hdrTarget = null;
    }
  }

  /**
   * Called when settings change.
   */
  private onSettingsChanged(): void {
    logger.debug('Settings changed, rebuilding render graph');

    // Apply resolution scale
    this.renderWidth = Math.floor(this.width * this.pixelRatio * this.settings.resolutionScale);
    this.renderHeight = Math.floor(this.height * this.pixelRatio * this.settings.resolutionScale);

    // Rebuild if resolution changed
    if (this.hdrTarget &&
        (this.hdrTarget.width !== this.renderWidth ||
         this.hdrTarget.height !== this.renderHeight)) {
      this.resize(this.width, this.height);
    }
  }

  /**
   * Gets a debug string representation.
   *
   * @returns Debug string
   */
  toString(): string {
    const caps = this.device.getCapabilities();
    return `Renderer(${caps.backend}, ${this.config.renderMode}, ${this.width}x${this.height})`;
  }
}
