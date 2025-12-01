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
import { RenderTarget, TextureFormat as RTTextureFormat } from './pipeline/RenderTarget';
import { RenderSettings, QualityPreset } from './RenderSettings';
import { ResourceManager } from './ResourceManager';
import { RenderProfiler } from './RenderProfiler';
import { LightManager } from './lighting/LightManager';
import { ShadowMapper } from './lighting/ShadowMapper';
import { PostProcessStack } from './postprocess/PostProcessStack';
import { Bloom } from './postprocess/Bloom';
import { EffectQuality } from './postprocess/PostProcessEffect';
import { RenderTexture, RenderTextureDescriptor } from './texture/RenderTexture';
import { TextureFilter, TextureWrap, TextureFormat } from './texture/Texture';
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
import { RenderQueue, RenderQueueType, RenderQueueEntry } from './pipeline/RenderQueue';
import { DrawCall } from './pipeline/DrawCall';
import { PipelineState } from './pipeline/PipelineState';

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

  // Post-processing textures
  private postProcessInput: RenderTexture | null = null;
  private postProcessOutput: RenderTexture | null = null;

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
  private meshGPUBuffers: Map<Mesh, { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; ibo: WebGLBuffer; indexCount: number; indexType: number; vertexCount: number }> = new Map();

  // Post-processing fullscreen quad resources
  private tonemapShaderProgram: WebGLProgram | null = null;
  private fullscreenQuadVAO: WebGLVertexArrayObject | null = null;
  private fullscreenQuadVBO: WebGLBuffer | null = null;

  // Debug mode: 0=normal PBR, 1=normals, 2=albedo, 3=metallic, 4=roughness, 5=Lo, 6=light count, 7=NdotL, 8=light dir, 9=raw Lo
  // 17=raw normal attribute (no transformation), 19=magenta if normal is zero
  private currentDebugMode: number = 0; // Normal PBR mode

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

    // Initialize post-processing stack
    this.initializePostProcessing();

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
        RTTextureFormat.RGBA16F,
        this.config.msaaSamples
      );
    }

    // Backbuffer
    this.backbuffer = RenderTarget.createColorTarget(
      this.renderWidth,
      this.renderHeight,
      RTTextureFormat.RGBA8,
      1
    );

    logger.debug('Render targets created');
  }

  /**
   * Initializes the post-processing stack with effects.
   */

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
      this.shadowPass.setup(); // Create render targets and resources
      this.renderGraph.addPass(this.shadowPass);

      // P0 FIX #5: Initialize ShadowPass GL context
      const device = this.device as any;
      if (device.getGL) {
        const gl = device.getGL() as WebGL2RenderingContext;
        this.shadowPass.initializeGL(gl);
      }
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
      this.shadowPass.setup(); // Create render targets and resources
      this.renderGraph.addPass(this.shadowPass);

      // P0 FIX #5: Initialize ShadowPass GL context
      const device = this.device as any;
      if (device.getGL) {
        const gl = device.getGL() as WebGL2RenderingContext;
        this.shadowPass.initializeGL(gl);
      }
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
   * Initializes the post-processing stack with effects.
   */
  private initializePostProcessing(): void {
    if (!this.config.hdr) {
      logger.info('Post-processing disabled (HDR not enabled)');
      return;
    }

    const device = this.device as any;
    if (!device.getGL) {
      logger.warn('Post-processing requires WebGL2 backend');
      return;
    }

    const gl = device.getGL() as WebGL2RenderingContext;

    // CRITICAL: Enable EXT_color_buffer_float for RGBA16F framebuffer support
    const floatExt = gl.getExtension('EXT_color_buffer_float');
    if (!floatExt) {
      logger.warn('EXT_color_buffer_float not available - HDR framebuffers may not work');
    } else {
      logger.info('EXT_color_buffer_float extension enabled for HDR rendering');
    }

    // Create render textures for post-processing ping-pong
    const texDesc: RenderTextureDescriptor = {
      width: this.renderWidth,
      height: this.renderHeight,
      format: TextureFormat.RGBA16F,
      minFilter: TextureFilter.Linear,
      magFilter: TextureFilter.Linear,
      wrapU: TextureWrap.ClampToEdge,
      wrapV: TextureWrap.ClampToEdge,
      depth: true,  // CRITICAL: Need depth buffer for 3D scene rendering
    };

    this.postProcessInput = new RenderTexture({
      ...texDesc,
      label: 'PostProcessInput',
    });

    this.postProcessOutput = new RenderTexture({
      ...texDesc,
      label: 'PostProcessOutput',
    });

    // CRITICAL: Create WebGL framebuffers for the RenderTextures
    // RenderTexture only stores the framebuffer handle - we must create and attach it
    this.createRenderTextureFramebuffer(gl, this.postProcessInput);
    this.createRenderTextureFramebuffer(gl, this.postProcessOutput);

    // Create post-process stack
    this.postProcessStack = new PostProcessStack({
      width: this.renderWidth,
      height: this.renderHeight,
      hdr: true,
      quality: EffectQuality.High,
    });

    // Initialize with GL context
    this.postProcessStack.initialize(gl);

    // Add Bloom effect
    const bloom = new Bloom({
      threshold: 1.0,
      knee: 0.5,
      intensity: 0.8,
      radius: 1.0,
      iterations: 5,
      enabled: true,
      quality: EffectQuality.High,
    });

    this.postProcessStack.addEffect(bloom);

    // Create fullscreen quad for tone mapping blit
    this.createFullscreenQuad(gl);
    this.createTonemapShader(gl);

    logger.info('Post-processing stack initialized with Bloom effect');
  }

  /**
   * Creates a fullscreen quad for post-processing.
   */
  private createFullscreenQuad(gl: WebGL2RenderingContext): void {
    // Fullscreen triangle (more efficient than quad)
    const vertices = new Float32Array([
      -1.0, -1.0, 0.0, 0.0,  // Bottom-left
       3.0, -1.0, 2.0, 0.0,  // Bottom-right (oversized for full coverage)
      -1.0,  3.0, 0.0, 2.0,  // Top-left (oversized for full coverage)
    ]);

    this.fullscreenQuadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fullscreenQuadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    this.fullscreenQuadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.fullscreenQuadVAO);

    // Position attribute (location 0)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

    // Texcoord attribute (location 1)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    logger.info('Created fullscreen quad for post-processing');
  }

  /**
   * Creates the tone mapping shader for HDR to LDR conversion.
   */
  private createTonemapShader(gl: WebGL2RenderingContext): void {
    const vertexShader = `#version 300 es
      precision highp float;

      layout(location = 0) in vec2 aPosition;
      layout(location = 1) in vec2 aTexCoord;

      out vec2 vTexCoord;

      void main() {
        vTexCoord = aTexCoord;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    const fragmentShader = `#version 300 es
      precision highp float;

      in vec2 vTexCoord;
      out vec4 fragColor;

      uniform sampler2D uHDRTexture;
      uniform float uExposure;
      uniform float uGamma;

      void main() {
        vec2 uv = vTexCoord;

        // Sample color - the PBR shader already does tone mapping and gamma correction
        // so we just pass through the color directly
        vec3 color = texture(uHDRTexture, uv).rgb;

        // Just output the color as-is (scene is already sRGB)
        fragColor = vec4(color, 1.0);
      }
    `;

    // Compile vertex shader
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vertexShader);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      logger.error(`Tonemap vertex shader error: ${gl.getShaderInfoLog(vs)}`);
      return;
    }

    // Compile fragment shader
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fragmentShader);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      logger.error(`Tonemap fragment shader error: ${gl.getShaderInfoLog(fs)}`);
      return;
    }

    // Link program
    this.tonemapShaderProgram = gl.createProgram()!;
    gl.attachShader(this.tonemapShaderProgram, vs);
    gl.attachShader(this.tonemapShaderProgram, fs);
    gl.linkProgram(this.tonemapShaderProgram);
    if (!gl.getProgramParameter(this.tonemapShaderProgram, gl.LINK_STATUS)) {
      logger.error(`Tonemap program link error: ${gl.getProgramInfoLog(this.tonemapShaderProgram)}`);
      return;
    }

    // Cleanup shaders
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    logger.info('Created tone mapping shader');
  }

  /**
   * Sets the debug rendering mode.
   * @param mode - Debug mode (0=normal PBR, 1=normals, 2=albedo, 3=metallic, 4=roughness, 5=Lo, 6=light count, 7=NdotL, 8=light dir, 9=raw Lo)
   */
  setDebugMode(mode: number): void {
    this.currentDebugMode = mode;
    console.log(`[Renderer] Debug mode set to ${mode}`);
  }

  /**
   * Gets the current debug mode.
   */
  getDebugMode(): number {
    return this.currentDebugMode;
  }

  /**
   * Renders a frame.
   *
   * @param scene - Scene to render
   * @param camera - Camera for rendering
   */
  render(scene: Scene, camera: Camera): void {
    const startTime = performance.now();

    // P0 FIX #66: Advance light manager frame counter
    this.lightManager.nextFrame();

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

      // P0 FIX #29: Store the shadow data result instead of discarding it
      const shadowData = this.lightManager.prepareShadows(visibleLights, cameraInfoWithForward);

      // P0 FIX #28: Shadow pass execution - NOW ENABLED
      if (shadowData && shadowData.length > 0) {
        // Clear previous shadow maps
        this.shadowPass.clearShadowMaps();

        // Add shadow maps for each shadow-casting light
        for (const shadow of shadowData) {
          for (let i = 0; i < shadow.viewProjectionMatrices.length; i++) {
            const lightVP = shadow.viewProjectionMatrices[i];
            const shadowMapIndex = this.shadowPass.getShadowMaps().length;

            // Add shadow map to the pass (it will manage the descriptor internally)
            // We'll use the ShadowPass's addDirectionalShadowMap as a template
            // but we need to add the shadow map descriptor directly
            (this.shadowPass as any).shadowMaps.push({
              type: 0, // ShadowMapType.Standard
              lightViewProjection: lightVP,
              bias: 0.005,
            });
          }
        }

        // Build a render queue from scene objects for shadow casting
        const shadowQueue = this.buildShadowCasterQueue(scene, camera);

        // Create a dummy render target (ShadowPass uses its own internal targets)
        const dummyTarget = new RenderTarget({
          width: this.settings.maxShadowResolution,
          height: this.settings.maxShadowResolution,
          samples: 1,
          colorAttachments: [],
          depthStencilAttachment: {
            format: RTTextureFormat.Depth32F,
            loadAction: 0, // LoadAction.Clear
            storeAction: 1, // StoreAction.Store
            clearValue: 1.0,
          },
          label: 'ShadowDummy',
        });

        // Execute shadow pass to render shadow maps
        this.shadowPass.execute(shadowQueue, dummyTarget);

        // Log shadow rendering
        if (this.frameCount === 1) {
          logger.info(`Shadow pass executed: ${shadowData.length} shadow casters, ${this.shadowPass.getShadowMaps().length} shadow maps`);
        }
      }
    }

    // Determine if we should render to texture for post-processing
    const usePostProcessing = this.postProcessStack && this.postProcessInput && this.postProcessOutput;

    if (usePostProcessing) {
      // Render scene to offscreen texture for post-processing
      const device = this.device as any;
      if (device.getGL) {
        const gl = device.getGL() as WebGL2RenderingContext;
        const fb = this.postProcessInput!.getFramebuffer();

        if (!fb) {
          logger.error('PostProcessInput framebuffer is null - cannot render scene');
          return;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

        // CRITICAL: Check framebuffer completeness before rendering
        const fbStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (fbStatus !== gl.FRAMEBUFFER_COMPLETE) {
          const statusNames: Record<number, string> = {
            [gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT]: 'INCOMPLETE_ATTACHMENT',
            [gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT]: 'MISSING_ATTACHMENT',
            [gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS]: 'INCOMPLETE_DIMENSIONS',
            [gl.FRAMEBUFFER_UNSUPPORTED]: 'UNSUPPORTED',
            [gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE]: 'INCOMPLETE_MULTISAMPLE',
          };
          logger.error(`PostProcessInput framebuffer is incomplete: ${statusNames[fbStatus] || fbStatus} (0x${fbStatus.toString(16)})`);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          return;
        }

        gl.viewport(0, 0, this.postProcessInput!.getWidth(), this.postProcessInput!.getHeight());

        // Clear offscreen buffer
        const bgColor = { r: 0.4, g: 0.6, b: 0.9, a: 1 };
        gl.clearColor(bgColor.r, bgColor.g, bgColor.b, bgColor.a);
        gl.clearDepth(1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Render sky gradient to offscreen texture
        this.renderSkyGradient(gl);

        // Enable depth testing and face culling
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.frontFace(gl.CCW);
      }
    }

    // Render scene meshes
    if (this.profiler) {
      this.profiler.beginPass('Scene Meshes');
    }
    this.renderSceneMeshes(scene, camera);
    if (this.profiler) {
      this.profiler.endPass();
    }

    // DEBUG: Disabled - winding order fixed, scene renders correctly
    // this.renderDebugTest(scene, camera);

    // Post-processing: Apply bloom and other effects
    if (usePostProcessing) {
      if (this.profiler) {
        this.profiler.beginPass('Post Process');
      }
      this.applyPostProcessing(deltaTime);
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
   * Applies post-processing effects to the rendered scene.
   * Scene has already been rendered to postProcessInput texture.
   * Uses fullscreen quad with tone mapping shader to convert HDR to LDR.
   *
   * @param deltaTime - Delta time for effect animations
   */
  private applyPostProcessing(deltaTime: number): void {
    if (!this.postProcessStack || !this.postProcessInput || !this.postProcessOutput) {
      return;
    }

    const device = this.device as any;
    if (!device.getGL) {
      return;
    }

    const gl = device.getGL() as WebGL2RenderingContext;

    // Check if we have the required resources
    if (!this.tonemapShaderProgram || !this.fullscreenQuadVAO) {
      // Fallback: try direct blit with NEAREST filter (works for same-format only)
      const sceneFB = this.postProcessInput.getFramebuffer();
      if (sceneFB) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sceneFB);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.blitFramebuffer(
          0, 0, this.renderWidth, this.renderHeight,
          0, 0, gl.canvas.width, gl.canvas.height,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST  // Use NEAREST for format compatibility
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      return;
    }

    // Get the HDR texture
    const colorTexture = this.postProcessInput.getColorTexture();
    const glTexture = colorTexture.getGLTexture();
    if (!glTexture) {
      logger.error('PostProcessInput has no GL texture');
      return;
    }

    // Bind to default framebuffer (canvas)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Clear the canvas (optional but helps debug)
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Disable depth testing for fullscreen quad
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    // Use tone mapping shader
    gl.useProgram(this.tonemapShaderProgram);

    // Bind HDR texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glTexture);

    // Set uniforms
    const texLoc = gl.getUniformLocation(this.tonemapShaderProgram, 'uHDRTexture');
    const exposureLoc = gl.getUniformLocation(this.tonemapShaderProgram, 'uExposure');
    const gammaLoc = gl.getUniformLocation(this.tonemapShaderProgram, 'uGamma');

    gl.uniform1i(texLoc, 0);
    gl.uniform1f(exposureLoc, 1.0);  // Can be adjusted for exposure control
    gl.uniform1f(gammaLoc, 2.2);     // Standard sRGB gamma

    // Draw fullscreen triangle
    gl.bindVertexArray(this.fullscreenQuadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    // Restore state
    gl.useProgram(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  /**
   * Creates a WebGL framebuffer for a RenderTexture and attaches color/depth textures.
   * RenderTexture only stores the handle - this method creates and configures the FBO.
   *
   * @param gl - WebGL2 context
   * @param renderTexture - RenderTexture to create framebuffer for
   */
  private createRenderTextureFramebuffer(gl: WebGL2RenderingContext, renderTexture: RenderTexture): void {
    // Create framebuffer
    const fbo = gl.createFramebuffer();
    if (!fbo) {
      logger.error(`Failed to create framebuffer for ${renderTexture.label}`);
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    // Get the color texture and its WebGL handle
    const colorTexture = renderTexture.getColorTexture();
    let glColorTexture = colorTexture.getGLTexture();

    // Create the WebGL texture if it doesn't exist
    if (!glColorTexture) {
      const newTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, newTex);

      // Get dimensions
      const width = renderTexture.getWidth();
      const height = renderTexture.getHeight();

      // Use RGBA16F for HDR
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // Store the texture handle in the Texture object
      colorTexture.setGLTexture(newTex);
      glColorTexture = newTex;
    }

    // Attach color texture to framebuffer
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glColorTexture, 0);

    // Attach depth buffer if enabled
    if (renderTexture.hasDepthBuffer()) {
      const depthTexture = renderTexture.getDepthTexture();
      let glDepthTexture = depthTexture ? depthTexture.getGLTexture() : null;

      if (!glDepthTexture) {
        // Create depth renderbuffer instead of texture (simpler and more compatible)
        const depthBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, renderTexture.getWidth(), renderTexture.getHeight());
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
      } else {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, glDepthTexture, 0);
      }
    }

    // Check framebuffer completeness
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      const statusNames: Record<number, string> = {
        [gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT]: 'INCOMPLETE_ATTACHMENT',
        [gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT]: 'MISSING_ATTACHMENT',
        [gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS]: 'INCOMPLETE_DIMENSIONS',
        [gl.FRAMEBUFFER_UNSUPPORTED]: 'UNSUPPORTED',
        [gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE]: 'INCOMPLETE_MULTISAMPLE',
      };
      logger.error(`Framebuffer incomplete for ${renderTexture.label}: ${statusNames[status] || status} (0x${status.toString(16)})`);
      logger.error(`  - Size: ${renderTexture.getWidth()}x${renderTexture.getHeight()}`);
      logger.error(`  - Has depth: ${renderTexture.hasDepthBuffer()}`);
      logger.error(`  - Color texture: ${glColorTexture ? 'OK' : 'NULL'}`);
    } else {
      logger.info(`Created framebuffer for ${renderTexture.label} (${renderTexture.getWidth()}x${renderTexture.getHeight()})`);
    }

    // Store the framebuffer in the RenderTexture
    renderTexture.setFramebuffer(fbo);

    // Reset state
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
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
    layout(location = 1) in vec3 a_normal;  // Back to location 1
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
    out vec3 v_rawNormal;  // DEBUG: Pass raw attribute directly
    out vec4 v_rawTangent; // DEBUG: Pass raw tangent attribute
    out vec2 v_texCoord;
    out vec4 v_shadowCoord;
    out mat3 v_TBN;
    out vec3 v_viewPosition;

    void main() {
      // World space position
      vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
      v_worldPosition = worldPos.xyz;

      // Pass raw attributes directly for debugging (no transformation)
      v_rawNormal = a_normal;    // location 1
      v_rawTangent = a_tangent;  // location 3

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
    in vec3 v_rawNormal;  // DEBUG: Raw attribute from vertex shader
    in vec4 v_rawTangent; // DEBUG: Raw tangent attribute
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

    // Texture samplers
    uniform sampler2D u_albedoMap;
    uniform sampler2D u_normalMap;
    uniform sampler2D u_metallicRoughnessMap;
    uniform sampler2D u_aoMap;
    uniform sampler2D u_emissionMap;
    uniform sampler2D u_shadowMap;

    // IBL uses procedural sky only - no cubemap samplers to avoid texture type conflicts

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

    // Debug mode: 0=normal, 1=show normals, 2=show albedo only
    uniform int u_debugMode;

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
    // FIXED: Use correct k formula for DIRECT lighting: k = roughness² / 2
    // (Previously used IBL formula k = (roughness+1)² / 8 which was wrong)
    float GeometrySchlickGGX(float NdotV, float roughness) {
      float k = (roughness * roughness) / 2.0;  // Direct lighting formula
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

    // Procedural ground shadow - fakes shadow by darkening ground near y=0
    // This provides instant visual feedback without full shadow mapping
    float ProceduralGroundShadow(vec3 worldPos, vec3 normal) {
      // Only apply shadow to surfaces facing up (ground-like)
      float upFacing = max(dot(normal, vec3(0.0, 1.0, 0.0)), 0.0);
      if (upFacing < 0.5) return 0.0;

      // Shadow intensity based on height - objects close to ground are in shadow
      float groundHeight = 0.0;
      float heightAboveGround = worldPos.y - groundHeight;

      // Objects very close to ground (y < 5) cast shadow onto ground
      // This creates the illusion of contact shadows
      float shadowRange = 8.0;
      float shadowIntensity = 0.0;

      if (heightAboveGround >= 0.0 && heightAboveGround < 0.2) {
        // This IS the ground - darken based on distance to nearby objects
        // Use a simple distance-based falloff from origin (where car/objects are)
        float distFromOrigin = length(worldPos.xz);
        // Darken in a radius around origin (where objects typically are)
        shadowIntensity = smoothstep(15.0, 2.0, distFromOrigin) * 0.4;
      }

      return shadowIntensity;
    }

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
    // IMAGE-BASED LIGHTING (IBL) - Balanced High-Quality Environment
    // ==========================================================================

    vec3 IBL(vec3 N, vec3 V, vec3 albedo, float metallic, float roughness, vec3 F0) {
      // Reflection direction
      vec3 R = reflect(-V, N);

      // Procedural sky environment (no cubemaps to avoid texture type conflicts)
      vec3 skyZenith = vec3(0.15, 0.25, 0.5);      // Blue sky
      vec3 skyHorizon = vec3(0.3, 0.35, 0.45);     // Horizon
      vec3 sunGlowColor = vec3(1.0, 0.95, 0.85);   // Warm sun
      vec3 groundColor = vec3(0.05, 0.06, 0.04);   // Dark ground

      // Build environment color from reflection direction
      float RdotUp = R.y;
      float skyGradient = clamp(RdotUp * 0.5 + 0.5, 0.0, 1.0);

      // Smooth sky gradient
      vec3 envColor = mix(skyHorizon, skyZenith, pow(skyGradient, 1.5));

      // Ground reflection blend
      if (RdotUp < 0.0) {
        float groundFactor = clamp(-RdotUp, 0.0, 1.0);
        envColor = mix(skyHorizon * 0.3, groundColor, groundFactor * groundFactor);
      }

      // Sun hotspot - REDUCED to avoid washing out colors
      vec3 sunDir = normalize(vec3(-0.6, 0.5, 0.6));
      float sunDot = max(dot(R, sunDir), 0.0);
      float sunPower = mix(16.0, 256.0, 1.0 - roughness);
      float sunSpec = pow(sunDot, sunPower);
      float sunStrength = 0.3 * (1.0 - roughness * 0.5);  // Much reduced sun hotspot
      envColor += sunGlowColor * sunSpec * sunStrength;

      // Procedural irradiance (hemisphere lighting)
      float NdotUp = dot(N, vec3(0.0, 1.0, 0.0));
      vec3 skyAmbient = skyHorizon * 0.03;
      vec3 groundAmbient = groundColor * 0.01;
      float hemiFactor = NdotUp * 0.5 + 0.5;
      hemiFactor = pow(hemiFactor, 0.8);
      vec3 irradiance = mix(groundAmbient, skyAmbient, hemiFactor);

      // Fresnel
      float NdotV = max(dot(N, V), 0.001);
      vec3 F = FresnelSchlickRoughness(NdotV, F0, roughness);

      // Energy conservation
      vec3 kD = (1.0 - F) * (1.0 - metallic);

      // Diffuse IBL
      vec3 diffuse = irradiance * albedo * kD;

      // Specular IBL - balanced for realistic car paint look
      // Car paint has clearcoat that produces strong reflections
      vec3 specular = envColor * F * 0.4;

      return (diffuse + specular) * u_envIntensity;
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

      // Normal mapping - use properly transformed world normal
      // The normal matrix (inverse-transpose) correctly handles rotation and non-uniform scaling
      vec3 N = normalize(v_worldNormal);
      if (u_hasNormalMap == 1) {
        vec3 normalSample = texture(u_normalMap, v_texCoord).rgb * 2.0 - 1.0;
        N = normalize(v_TBN * normalSample);
      }

      vec3 V = normalize(u_cameraPosition - v_worldPosition);

      // F0 (base reflectivity) - dielectric use 0.04, metals use albedo
      vec3 F0 = mix(vec3(0.04), albedo, metallic);

      // =======================================================================
      // DIRECT LIGHTING - AAA-Quality PBR with Cook-Torrance BRDF
      // =======================================================================
      vec3 Lo = vec3(0.0);

      // Calculate NdotV once - needed for specular calculations
      float NdotV = max(dot(N, V), 0.001);

      // =======================================================================
      // AMBIENT LIGHTING - Hemisphere ambient for realistic shadow fill
      // =======================================================================
      // Sky-ground hemisphere ambient - darker for more contrast
      vec3 skyColor = vec3(0.3, 0.35, 0.5);    // Darker sky for contrast
      vec3 groundColor = vec3(0.1, 0.09, 0.08); // Darker ground for shadows
      float hemisphereBlend = N.y * 0.5 + 0.5;
      vec3 hemisphereAmbient = mix(groundColor, skyColor, hemisphereBlend);

      // Ambient occlusion and base ambient - balanced for contrast
      vec3 ambient = albedo * hemisphereAmbient * 0.15 * ao;

      // Add rim lighting for 3D pop at grazing angles
      vec3 F_ambient = FresnelSchlickRoughness(NdotV, F0, roughness);
      vec3 kD_ambient = (1.0 - F_ambient) * (1.0 - metallic);
      ambient *= kD_ambient;

      // Subtle rim light for car silhouette definition - tinted with albedo to preserve color
      float rimFactor = 1.0 - NdotV;
      rimFactor = pow(rimFactor, 4.0) * 0.15;
      ambient += albedo * rimFactor * (1.0 - roughness);

      // =======================================================================
      // FALLBACK SUN LIGHT (when no lights in scene) - AAA intensity
      // =======================================================================
      if (u_lightCount == 0) {
        // Sun from FRONT-RIGHT-ABOVE so specular is visible from chase camera!
        // Camera is behind car, so sun needs to be in front for specular to reflect back
        vec3 sunDir = normalize(vec3(-0.5, 0.7, 0.5));  // Front-right-above
        vec3 sunColor = vec3(1.0, 0.98, 0.95);
        float sunIntensity = 10.0; // Strong for visible specular highlights

        float NdotL = max(dot(N, sunDir), 0.0);
        vec3 H = normalize(V + sunDir);
        float NdotH = max(dot(N, H), 0.0);
        float VdotH = max(dot(V, H), 0.0);

        // Fresnel
        vec3 F = FresnelSchlick(VdotH, F0);

        // Energy-conserving diffuse - slightly reduced for deeper color
        vec3 kD = (1.0 - F) * (1.0 - metallic);
        vec3 diffuse = kD * albedo / PI * 0.85;

        // Cook-Torrance specular for base paint layer
        float D = DistributionGGX(N, H, roughness);
        float G = GeometrySmith(N, V, sunDir, roughness);
        vec3 specular = (D * G * F) / (4.0 * NdotV * NdotL + EPSILON);

        // =======================================================================
        // CLEARCOAT LAYER - Essential for AAA car paint!
        // Creates the bright "wet" highlight you see on real cars
        // =======================================================================
        float clearcoatRoughness = 0.02; // Mirror-smooth for sharp specular
        float D_clearcoat = DistributionGGX(N, H, clearcoatRoughness);
        float G_clearcoat = GeometrySmith(N, V, sunDir, clearcoatRoughness);
        // Clearcoat F0 - slightly higher for stronger reflection
        vec3 F_clearcoat = FresnelSchlick(VdotH, vec3(0.05));
        vec3 clearcoatSpec = (D_clearcoat * G_clearcoat * F_clearcoat) / (4.0 * NdotV * NdotL + EPSILON);
        // STRONG clearcoat for visible bright highlights
        float clearcoatStrength = (1.0 - roughness) * 3.0; // 3x strength
        specular += clearcoatSpec * clearcoatStrength;

        Lo = (diffuse + specular) * sunColor * sunIntensity * NdotL;
      }

      // =======================================================================
      // SCENE LIGHTS - Full PBR with proper intensity scaling
      // =======================================================================
      for (int i = 0; i < 8; ++i) {
        if (i >= u_lightCount) break;

        vec3 L;
        vec3 radiance;

        if (u_lightTypes[i] == 0) {
          // Directional light
          L = normalize(-u_lightDirections[i]);
          // Balanced intensity - user intensity is in lux, divide by ~20 for PBR
          float scaledIntensity = u_lightIntensities[i] * 0.05;
          radiance = u_lightColors[i] * scaledIntensity;
        } else if (u_lightTypes[i] == 1) {
          // Point light
          vec3 lightVec = u_lightPositions[i] - v_worldPosition;
          float dist = length(lightVec);
          L = normalize(lightVec);
          float atten = PointLightAttenuation(dist, u_lightRanges[i]);
          float scaledIntensity = u_lightIntensities[i] * 0.05 * atten;
          radiance = u_lightColors[i] * scaledIntensity;
        } else {
          continue;
        }

        float NdotL = max(dot(N, L), 0.0);

        if (NdotL > 0.0) {
          vec3 H = normalize(V + L);
          float NdotH = max(dot(N, H), 0.0);
          float VdotH = max(dot(V, H), 0.0);

          // Fresnel - creates realistic metallic/dielectric split
          vec3 F = FresnelSchlick(VdotH, F0);

          // Energy conservation: metals have no diffuse
          vec3 kD = (1.0 - F) * (1.0 - metallic);

          // Lambert diffuse (energy conserving) - reduced for richer color
          vec3 diffuse = kD * albedo / PI * 0.85;

          // Cook-Torrance specular BRDF for base layer
          float D = DistributionGGX(N, H, roughness);
          float G = GeometrySmith(N, V, L, roughness);
          vec3 specular = (D * G * F) / (4.0 * NdotV * NdotL + EPSILON);

          // Clearcoat layer - same as sun light for consistency
          float clearcoatRoughness = 0.02; // Mirror-smooth
          float D_cc = DistributionGGX(N, H, clearcoatRoughness);
          float G_cc = GeometrySmith(N, V, L, clearcoatRoughness);
          vec3 F_cc = FresnelSchlick(VdotH, vec3(0.05));
          vec3 clearcoatSpec = (D_cc * G_cc * F_cc) / (4.0 * NdotV * NdotL + EPSILON);
          float clearcoatStrength = (1.0 - roughness) * 3.0; // Strong
          specular += clearcoatSpec * clearcoatStrength;

          Lo += (diffuse + specular) * radiance * NdotL;
        }
      }

      // =======================================================================
      // ENVIRONMENT REFLECTIONS - AAA car paint wet gloss look
      // =======================================================================
      vec3 R = reflect(-V, N);
      vec3 envReflection = vec3(0.0);

      {
        // Procedural sky reflection - slightly desaturated for neutral reflection
        float skyFactor = max(R.y * 0.5 + 0.5, 0.0);
        vec3 skyReflect = mix(vec3(0.25, 0.28, 0.35), vec3(0.5, 0.6, 0.75), skyFactor);

        // Sun reflection hotspot - THE key visual for glossy car paint!
        vec3 sunDir = normalize(vec3(-0.5, 0.7, 0.5));  // Match fallback sun (front-right)
        float sunDotR = max(dot(R, sunDir), 0.0);
        // Very sharp falloff for glossy materials = crisp sun reflection
        float sunPower = mix(64.0, 1024.0, 1.0 - roughness); // Even sharper
        float sunReflect = pow(sunDotR, sunPower);
        // BRIGHT sun hotspot - makes car paint look "wet" and glossy
        vec3 sunHotspot = vec3(1.0, 0.98, 0.92) * sunReflect * 15.0 * (1.0 - roughness);
        skyReflect += sunHotspot;

        // Fresnel for environment - stronger at grazing angles (critical for car paint)
        vec3 F_env = FresnelSchlickRoughness(NdotV, F0, roughness);

        // Car paint clearcoat reflections - STRONG for AAA look
        float glossBoost = pow(1.0 - roughness, 1.5); // Sharper gloss response
        float envStrength = glossBoost * 0.4; // Strong base reflection

        // Tint sky reflection with albedo to preserve paint color
        vec3 tintedSky = mix(skyReflect * 0.3, skyReflect * albedo * 1.0, 0.5);
        // Add untinted sun hotspot back - this creates the white specular highlight!
        vec3 finalReflection = tintedSky + sunHotspot * 0.5;
        envReflection = finalReflection * F_env * envStrength * u_envIntensity;
      }

      // =======================================================================
      // SUBTLE RIM LIGHTING - Silhouette definition (tinted with albedo)
      // =======================================================================
      // Very subtle rim highlight - mostly handled by Fresnel in clearcoat now
      float rimFresnel = pow(1.0 - NdotV, 4.0);
      vec3 rimTint = mix(vec3(0.6), albedo, 0.8); // 80% albedo tint
      vec3 rimColor = rimTint * rimFresnel * (1.0 - roughness) * 0.1; // Reduced

      // =======================================================================
      // AAA CAR PAINT SPECULAR - FORCED VISIBLE for glossy surfaces
      // =======================================================================
      vec3 cameraSpecular = vec3(0.0);
      {
        float gloss = 1.0 - roughness;

        // FORCED TEST: Any surface facing somewhat upward gets a white highlight
        // This MUST be visible if the shader is working at all
        float upFacing = max(N.y, 0.0);  // 0 to 1 based on how much surface faces up
        float forcedSpec = upFacing * upFacing * gloss * 3.0;  // Strong white

        // Also add view-dependent highlight (Fresnel-ish on top surfaces)
        float topHighlight = max(dot(N, normalize(vec3(0.0, 1.0, 0.3))), 0.0);
        topHighlight = pow(topHighlight, 4.0) * gloss * 2.0;

        // Standard specular calculations
        vec3 sun1 = normalize(vec3(-0.4, 0.6, 0.7));
        vec3 H1 = normalize(V + sun1);
        float spec1 = pow(max(dot(N, H1), 0.0), 32.0) * gloss;

        vec3 sun2 = normalize(vec3(0.4, 0.5, 0.75));
        vec3 H2 = normalize(V + sun2);
        float spec2 = pow(max(dot(N, H2), 0.0), 32.0) * gloss * 0.7;

        // Combine - the forcedSpec should DEFINITELY be visible
        float totalSpec = forcedSpec + topHighlight + spec1 + spec2;
        cameraSpecular = vec3(1.0, 0.98, 0.95) * totalSpec;
      }

      // =======================================================================
      // COMBINE ALL LIGHTING (specular added after tonemapping for visibility)
      // =======================================================================
      vec3 color = ambient + Lo + envReflection + emission + rimColor;
      // cameraSpecular added AFTER tonemapping to guarantee visibility

      // Apply procedural ground shadow for surfaces near ground level
      // DISABLED for debugging
      // float groundShadow = ProceduralGroundShadow(v_worldPosition, N);
      // color *= (1.0 - groundShadow);

      // REMOVED: The "minimum visibility" hack was flattening contrast
      // Let dark areas stay dark - that's what creates the 3D illusion

      // =======================================================================
      // HDR POST-PROCESSING - AAA Quality Tone Mapping
      // =======================================================================

      // 1. Apply exposure
      color *= u_exposure;

      // 2. ACES Filmic Tone Mapping - industry standard for AAA games
      // Preserves highlights while maintaining rich shadows
      color = ACESFilm(color);

      // 3. Gamma correction to sRGB
      color = pow(color, vec3(1.0 / 2.2));

      // 4. Saturation boost to counteract ACES desaturation - stronger for vivid car paint
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luminance), color, 1.4); // 40% saturation boost for rich colors

      // 5. ADD SPECULAR AFTER TONEMAPPING - guaranteed bright white highlights!
      // This bypasses ACES compression to ensure specular is visible
      color += cameraSpecular * 0.8; // Add specular as bright overlay

      // =====================================================================
      // DEFINITIVE TEST: Add white to ANY surface with roughness < 0.9
      // Default roughness is 0.5, material sets 0.12
      // If white appears → roughness uniform works (but may be wrong value)
      // If no white → roughness uniform is broken
      // =====================================================================
      if (roughness < 0.9) {
        // ANY surface with roughness < 0.9 (almost everything) gets white tint
        color = mix(color, vec3(1.0), 0.5); // 50% white blend
      }

      // 6. Final clamp
      color = clamp(color, 0.0, 1.0);

      // DEBUG: SOLID GREEN OUTPUT to prove shader is being used
      // If you DON'T see solid green, the shader isn't being applied!
      // UNCOMMENT THE LINE BELOW TO TEST:
      // color = vec3(0.0, 1.0, 0.0); // 100% solid green

      // Debug output modes
      if (u_debugMode == 1) {
        // Show world-space normals as colors (map [-1,1] to [0,1])
        fragColor = vec4(N * 0.5 + 0.5, 1.0);
        return;
      } else if (u_debugMode == 2) {
        // Show albedo only (no lighting)
        fragColor = vec4(pow(albedo, vec3(1.0/2.2)), 1.0);
        return;
      } else if (u_debugMode == 3) {
        // Show metallic as grayscale
        fragColor = vec4(vec3(metallic), 1.0);
        return;
      } else if (u_debugMode == 4) {
        // Show roughness as grayscale
        fragColor = vec4(vec3(roughness), 1.0);
        return;
      } else if (u_debugMode == 5) {
        // Show direct lighting (Lo) only - tone mapped for visibility
        vec3 loVis = ACESFilm(Lo);
        loVis = pow(loVis, vec3(1.0 / 2.2));
        fragColor = vec4(loVis, 1.0);
        return;
      } else if (u_debugMode == 6) {
        // Show light count as color: red=0, green=1, blue=2+
        if (u_lightCount == 0) {
          fragColor = vec4(1.0, 0.0, 0.0, 1.0); // Red = no lights
        } else if (u_lightCount == 1) {
          fragColor = vec4(0.0, 1.0, 0.0, 1.0); // Green = 1 light
        } else {
          fragColor = vec4(0.0, 0.0, 1.0, 1.0); // Blue = 2+ lights
        }
        return;
      } else if (u_debugMode == 7) {
        // DEBUG: Show world normal Y component directly
        // Surfaces facing up should be GREEN, facing down should be BLACK
        // Horizontal surfaces (car hood) should be bright green
        float normalY = N.y * 0.5 + 0.5; // Map from [-1,1] to [0,1]
        fragColor = vec4(0.0, normalY, 0.0, 1.0); // Green channel = Y
        return;
      } else if (u_debugMode == 8) {
        // DEBUG: Show light direction from uniform as RGB
        // R = x, G = y, B = z (mapped from [-1,1] to [0,1])
        if (u_lightCount > 0) {
          vec3 dir = u_lightDirections[0];
          fragColor = vec4(dir * 0.5 + 0.5, 1.0);
        } else {
          fragColor = vec4(1.0, 0.0, 1.0, 1.0); // Magenta = no light
        }
        return;
      } else if (u_debugMode == 9) {
        // DEBUG: Show raw Lo * 10 (no tone mapping) to see actual contribution
        vec3 loRaw = clamp(Lo * 0.1, 0.0, 1.0); // Scale down to see range
        fragColor = vec4(loRaw, 1.0);
        return;
      } else if (u_debugMode == 10) {
        // DEBUG MODE 10: SIMPLE LAMBERT SHADING - No PBR, no tone mapping
        // This is the most basic lighting test: NdotL * albedo
        // Light direction from first uniform light (or fallback)
        vec3 simpleL;
        if (u_lightCount > 0) {
          simpleL = normalize(-u_lightDirections[0]);
        } else {
          simpleL = normalize(vec3(0.5, 0.8, 0.3)); // Default up-right
        }
        float simpleNdotL = max(dot(N, simpleL), 0.0);
        vec3 simpleLambert = albedo * simpleNdotL + vec3(0.1) * albedo; // Lambert + small ambient
        fragColor = vec4(pow(simpleLambert, vec3(1.0/2.2)), 1.0); // Gamma correct
        return;
      } else if (u_debugMode == 11) {
        // DEBUG MODE 11: Pure NdotL as grayscale (no albedo, no ambient)
        vec3 testL;
        if (u_lightCount > 0) {
          testL = normalize(-u_lightDirections[0]);
        } else {
          testL = normalize(vec3(0.5, 0.8, 0.3)); // Default up-right
        }
        float testNdotL = max(dot(N, testL), 0.0);
        fragColor = vec4(vec3(testNdotL), 1.0);
        return;
      } else if (u_debugMode == 12) {
        // DEBUG MODE 12: Color-code by NdotL value
        // BLACK = 0 (perpendicular/backfacing)
        // RED = 0-0.3 (grazing angle)
        // YELLOW = 0.3-0.6 (moderate angle)
        // GREEN = 0.6-0.9 (good angle)
        // WHITE = 0.9-1.0 (nearly facing light)
        vec3 gradL = normalize(vec3(0.5, 0.8, 0.3));
        float gradNdotL = max(dot(N, gradL), 0.0);
        vec3 gradColor;
        if (gradNdotL < 0.01) {
          gradColor = vec3(0.0); // BLACK - backfacing
        } else if (gradNdotL < 0.3) {
          gradColor = vec3(1.0, 0.0, 0.0); // RED - grazing
        } else if (gradNdotL < 0.6) {
          gradColor = vec3(1.0, 1.0, 0.0); // YELLOW - moderate
        } else if (gradNdotL < 0.9) {
          gradColor = vec3(0.0, 1.0, 0.0); // GREEN - good
        } else {
          gradColor = vec3(1.0); // WHITE - direct
        }
        fragColor = vec4(gradColor, 1.0);
        return;
      } else if (u_debugMode == 13) {
        // DEBUG MODE 13: Pure Lambert shading (no PBR, no tone mapping)
        // Uses the lambertDirect value computed before this point
        // Should show clear face contrast if normals work
        vec3 pureL = normalize(vec3(0.4, 0.8, 0.3));
        float pureNdotL = max(dot(N, pureL), 0.0);
        vec3 pureLambert = albedo * pureNdotL + vec3(0.1) * albedo; // Lambert + ambient
        pureLambert = pow(pureLambert, vec3(1.0/2.2)); // Gamma correct only
        fragColor = vec4(pureLambert, 1.0);
        return;
      } else if (u_debugMode == 14) {
        // DEBUG MODE 14: Show Lo vs Lambda comparison
        // Left half = Lo (PBR), Right half = Lambert
        // Should help identify if PBR is computing weird values
        vec3 compL = normalize(vec3(0.4, 0.8, 0.3));
        float compNdotL = max(dot(N, compL), 0.0);
        vec3 compLambert = albedo * compNdotL * 2.0;

        // Tone map both for fair comparison
        vec3 compLo = ACESFilm(Lo);
        compLambert = ACESFilm(compLambert);

        // Split screen: left = PBR Lo, right = Lambert
        if (gl_FragCoord.x < 640.0) {
          fragColor = vec4(pow(compLo, vec3(1.0/2.2)), 1.0);
        } else {
          fragColor = vec4(pow(compLambert, vec3(1.0/2.2)), 1.0);
        }
        return;
      } else if (u_debugMode == 15) {
        // DEBUG MODE 15: SIMPLE SHADING using RAW NORMAL (bypasses normal matrix)
        // Uses v_rawNormal directly since we KNOW it works from debug mode 17
        vec3 rawN = normalize(v_rawNormal);
        vec3 simpleL = normalize(vec3(0.4, 0.8, 0.3)); // Light from upper-right-front
        float simpleNdotL = max(dot(rawN, simpleL), 0.0);

        // Very simple: ambient + diffuse using albedo color
        vec3 simpleAmbient = albedo * 0.2;
        vec3 simpleDiffuse = albedo * simpleNdotL * 0.8;
        vec3 simpleColor = simpleAmbient + simpleDiffuse;

        // Simple gamma correction only
        fragColor = vec4(pow(simpleColor, vec3(1.0/2.2)), 1.0);
        return;
      } else if (u_debugMode == 16) {
        // DEBUG MODE 16: POSITION AS COLOR
        // Uses v_worldPosition (derived from a_position) as color
        // This tests if the varying pipeline works at all
        // Expected: RAINBOW colors across the scene (different positions = different colors)
        // If this shows varied colors but mode 1 is flat, then a_normal is specifically broken
        vec3 posNorm = fract(v_worldPosition * 0.1); // Scale and wrap to 0-1
        fragColor = vec4(posNorm, 1.0);
        return;
      } else if (u_debugMode == 17) {
        // DEBUG MODE 17: RAW NORMAL ATTRIBUTE
        // Uses v_rawNormal which is a_normal passed through WITHOUT any transformation
        // Expected: Different colors per face (red, green, blue based on normal direction)
        // If this is flat gray (0.5, 0.5, 0.5), then a_normal itself is receiving zeros/uniform values
        fragColor = vec4(v_rawNormal * 0.5 + 0.5, 1.0);
        return;
      } else if (u_debugMode == 18) {
        // DEBUG MODE 18: TEXCOORD AS COLOR
        // Uses v_texCoord to verify that attribute 2 works
        // Expected: Gradient across UV space (if UVs are correct)
        fragColor = vec4(v_texCoord, 0.0, 1.0);
        return;
      } else if (u_debugMode == 19) {
        // DEBUG MODE 19: FLAT MAGENTA IF NORMAL IS ZERO
        // If v_rawNormal is all zeros, output magenta; otherwise output the normal
        float normLen = length(v_rawNormal);
        if (normLen < 0.001) {
          fragColor = vec4(1.0, 0.0, 1.0, 1.0); // MAGENTA = normal is zero!
        } else {
          fragColor = vec4(v_rawNormal * 0.5 + 0.5, 1.0); // Normal as color
        }
        return;
      }

      // PROPER PBR OUTPUT
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
      // Texture samplers (FIXED: these were missing, causing textures to not bind)
      'u_albedoMap', 'u_normalMap', 'u_metallicRoughnessMap', 'u_aoMap', 'u_emissionMap',
      'u_shadowMap',
      // Texture flags
      'u_hasAlbedoMap', 'u_hasNormalMap', 'u_hasMetallicRoughnessMap', 'u_hasAOMap',
      'u_hasEmissionMap', 'u_hasEnvMap', 'u_hasShadowMap',
      // Camera
      'u_cameraPosition',
      // Shadow
      'u_shadowBias', 'u_shadowIntensity',
      // Environment
      'u_envIntensity', 'u_exposure',
      // Debug
      'u_debugMode',
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
  private getMeshBuffers(gl: WebGL2RenderingContext, mesh: Mesh): { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; ibo: WebGLBuffer; indexCount: number; indexType: number; vertexCount: number } | null {
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
      // DEBUG: Log the actual WebGL call parameters
      console.log(`[GL ATTRIB] vertexAttribPointer(1, ${componentCount}, FLOAT, false, ${stride}, ${normAttr.offset})`);

      // DEBUG: Log first few normals from the actual buffer data
      const data = mesh.vertexBuffer.data;
      const normalOffset = normAttr.offset / 4; // Convert byte offset to float offset
      const strideFloats = stride / 4;
      const vertCount = Math.min(6, mesh.vertexCount); // Log more vertices to see different faces
      console.log(`[NORMAL DEBUG] ==== Mesh "${mesh.name}" ====`);
      console.log(`[NORMAL DEBUG] Format: stride=${stride}, normalOffset=${normAttr.offset}, type=${normAttr.type}`);
      console.log(`[NORMAL DEBUG] Buffer size: ${data.length} floats, ${mesh.vertexCount} vertices`);
      for (let i = 0; i < vertCount; i++) {
        const baseOffset = i * strideFloats + normalOffset;
        const nx = data[baseOffset];
        const ny = data[baseOffset + 1];
        const nz = data[baseOffset + 2];
        // Also log position for context
        const px = data[i * strideFloats];
        const py = data[i * strideFloats + 1];
        const pz = data[i * strideFloats + 2];
        console.log(`[NORMAL DEBUG] v${i}: pos=(${px.toFixed(2)}, ${py.toFixed(2)}, ${pz.toFixed(2)}) normal=(${nx.toFixed(3)}, ${ny.toFixed(3)}, ${nz.toFixed(3)})`);
      }
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
    // DEBUG: Log all attribute semantics to diagnose tangent detection
    console.log(`[TANGENT DEBUG] Mesh "${mesh.name}" attributes:`, format.attributes.map(a => ({ semantic: a.semantic, type: typeof a.semantic, offset: a.offset })));
    const tanAttr = format.attributes.find(a => a.semantic === 'TANGENT');
    console.log(`[TANGENT DEBUG] Found tanAttr:`, tanAttr);
    if (tanAttr) {
      const componentCount = this.getComponentCount(tanAttr.type);
      console.log(`[TANGENT DEBUG] Enabling tangent attribute at location 3, components=${componentCount}, offset=${tanAttr.offset}`);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, componentCount, gl.FLOAT, false, stride, tanAttr.offset);
    } else {
      // No tangents - set default
      console.log(`[TANGENT DEBUG] NO TANGENT FOUND - using default (1,0,0,1)`);
      gl.disableVertexAttribArray(3);
      gl.vertexAttrib4f(3, 1.0, 0.0, 0.0, 1.0); // Default tangent along X
    }

    // Upload index data
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer.data, gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    // Determine WebGL index type from mesh's IndexBuffer type
    const indexTypeStr = mesh.indexBuffer.indexType;
    const glIndexType = indexTypeStr === 'uint32' ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

    // P0 FIX: Validate max index doesn't exceed vertex count (prevents GL_INVALID_OPERATION)
    const indexData = mesh.indexBuffer.data;
    let maxIndex = 0;
    if (indexTypeStr === 'uint32') {
      const indices = new Uint32Array(indexData.buffer, indexData.byteOffset, indexData.byteLength / 4);
      for (let i = 0; i < indices.length; i++) {
        if (indices[i] > maxIndex) maxIndex = indices[i];
      }
    } else {
      const indices = new Uint16Array(indexData.buffer, indexData.byteOffset, indexData.byteLength / 2);
      for (let i = 0; i < indices.length; i++) {
        if (indices[i] > maxIndex) maxIndex = indices[i];
      }
    }
    // Track if mesh has valid indices
    const hasValidIndices = maxIndex < mesh.vertexCount;
    if (!hasValidIndices) {
      logger.error(`[GPU BUFFER ERROR] Mesh "${mesh.name}" has index ${maxIndex} but only ${mesh.vertexCount} vertices! Skipping this mesh.`);
    }

    const result = {
      vao,
      vbo,
      ibo,
      indexCount: hasValidIndices ? mesh.indexBuffer.indexCount : 0, // Set to 0 to skip drawing
      indexType: glIndexType,
      vertexCount: mesh.vertexCount
    };
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
    // Handle string-based type names (e.g., 'float32x2', 'float32x3', 'float32x4')
    if (typeof type === 'string') {
      // Check for xN suffix which indicates component count
      if (type.endsWith('x2')) return 2;
      if (type.endsWith('x3')) return 3;
      if (type.endsWith('x4')) return 4;
      // For types without x suffix (e.g., 'float32'), it's a single component
      if (type.includes('float') && !type.includes('x')) return 1;
      return 3; // Default to 3
    }
    // Handle numeric types (Float2=2, Float3=3, Float4=4)
    return type === 2 ? 2 : type === 3 ? 3 : type === 4 ? 4 : 3;
  }

  /**
   * Builds a render queue for shadow casters from the scene.
   * Collects all opaque mesh objects that should cast shadows.
   *
   * @param scene - Scene to collect objects from
   * @param camera - Camera for depth sorting
   * @returns RenderQueue containing shadow caster draw calls
   */
  private buildShadowCasterQueue(scene: Scene, camera: Camera): RenderQueue {
    const queue = new RenderQueue(RenderQueueType.Opaque);
    const device = this.device as any;

    if (!device.getGL) {
      logger.warn('buildShadowCasterQueue: No GL context');
      return queue;
    }

    const gl = device.getGL() as WebGL2RenderingContext;

    // Traverse scene and collect mesh objects
    scene.traverse((node: SceneNode) => {
      const mesh = (node as any).mesh;
      if (!mesh || !mesh.indexBuffer || mesh.indexBuffer.indexCount === 0) {
        return;
      }

      // Get or create GPU buffers for this mesh
      let gpuBuffers = this.meshGPUBuffers.get(mesh);
      if (!gpuBuffers) {
        const buffers = this.getMeshBuffers(gl, mesh);
        if (!buffers) {
          return;
        }
        gpuBuffers = buffers;
      }

      if (gpuBuffers.indexCount === 0) {
        return;
      }

      // Create a draw call for this mesh
      const drawCall = new DrawCall();
      drawCall.indexCount = gpuBuffers.indexCount;
      drawCall.instanceCount = 1;
      drawCall.firstIndex = 0;
      drawCall.baseVertex = 0;
      drawCall.firstInstance = 0;

      // Store mesh data in draw call user data
      drawCall.userData = {
        mesh: mesh,
        modelMatrix: node.transform?.worldMatrix || Matrix4.identity(),
        vao: gpuBuffers.vao,
        vbo: gpuBuffers.vbo,
        ibo: gpuBuffers.ibo,
      };

      // Set vertex buffer on draw call (position data)
      // For shadow pass, we only need position attribute (location 0)
      const vertexStride = mesh.vertexBuffer.format.stride;
      const posAttr = mesh.vertexBuffer.format.attributes.find((a: any) => a.semantic === 'POSITION');
      if (posAttr) {
        drawCall.setVertexBuffer(0, gpuBuffers.vbo, posAttr.offset, vertexStride);
      }

      // Set index buffer on draw call using setIndexBuffer method
      drawCall.setIndexBuffer(
        gpuBuffers.ibo,
        0, // offset
        gpuBuffers.indexType === gl.UNSIGNED_SHORT ? 0 : 1 // format: 0=UInt16, 1=UInt32
      );

      // Create a basic pipeline state (depth-only rendering for shadows)
      const pipelineState = PipelineState.opaque();

      // Calculate depth from camera for sorting
      const worldPos = node.transform?.worldPosition || new Vector3(0, 0, 0);
      const camPos = camera.transform.worldPosition;
      const depth = worldPos.distanceTo(camPos);

      // Submit to queue
      queue.submit(drawCall, pipelineState, null as any, 0, depth);
    });

    // Sort the queue for optimal rendering
    queue.sort();

    return queue;
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

    // P0 FIX #27: Light data is uploaded below via direct uniforms
    // (uploadToGPU requires shader wrapper, using direct uniforms instead)

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

    // Set light space matrix from shadow pass (or identity if no shadows)
    if (this.shadowPass && this.shadowPass.getShadowMaps().length > 0) {
      const shadowMaps = this.shadowPass.getShadowMaps();
      const firstShadowMap = shadowMaps[0];
      gl.uniformMatrix4fv(getUniform('u_lightSpaceMatrix'), false, firstShadowMap.lightViewProjection.elements);

      if (this.frameCount === 1) {
        logger.info('Light space matrix set from shadow map');
      }
    } else {
      const identityMatrix = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
      gl.uniformMatrix4fv(getUniform('u_lightSpaceMatrix'), false, identityMatrix);
    }

    // ==========================================================================
    // SETUP LIGHTING - Use lights from LightManager (P0 FIX #65)
    // ==========================================================================
    const allLights = this.lightManager.getLights();
    const lightCount = Math.min(allLights.length, 8);

    // DEBUG: Log light count on first few frames
    if (this.frameCount <= 3) {
      logger.info(`[LIGHT DEBUG] Frame ${this.frameCount}: LightManager has ${allLights.length} lights, using ${lightCount}`);
      allLights.forEach((light: any, i: number) => {
        const intensity = light.getEffectiveIntensity?.() ?? light.intensity ?? 1.0;
        logger.info(`  Light[${i}]: type=${light.type}, intensity=${intensity}`);
      });
    }

    // Set light count - let shader handle fallback when no lights
    if (lightCount === 0) {
      // NO LIGHTS from LightManager - use shader's built-in simple Lambert fallback
      gl.uniform1i(getUniform('u_lightCount'), 0);
    } else {
      gl.uniform1i(getUniform('u_lightCount'), lightCount);
      // Upload actual lights from LightManager
      for (let i = 0; i < lightCount; i++) {
        const light = allLights[i] as any;
        const pos = light.transform?.worldPosition || light.position || { x: 0, y: 10, z: 0 };
        const color = light.getEffectiveColor?.() || light.color || { r: 1, g: 1, b: 1 };
        // Use getEffectiveIntensity for proper physical unit conversion
        const intensity = light.getEffectiveIntensity?.() ?? light.intensity ?? 1.0;
        const lightType = light.type === 'directional' ? 0 : light.type === 'point' ? 1 : 2;
        const dir = light.direction || { x: 0, y: -1, z: 0 };
        const range = light.range ?? 100.0;
        const spotAngle = light.spotAngle ?? Math.PI / 4;

        // Log light data on first frame
        if (this.frameCount === 1) {
          logger.info(`[LIGHT ${i}] type=${light.type}(${lightType}) dir=(${dir.x?.toFixed(2)},${dir.y?.toFixed(2)},${dir.z?.toFixed(2)}) intensity=${intensity.toFixed(2)} color=(${color.r?.toFixed(2)},${color.g?.toFixed(2)},${color.b?.toFixed(2)})`);
        }

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

    // P0 FIX #2: Check if shadow map exists and bind shadow map texture
    const hasShadowMap = this.shadowPass && this.shadowPass.getShadowMaps().length > 0 ? 1 : 0;
    gl.uniform1i(getUniform('u_hasShadowMap'), hasShadowMap);
    gl.uniform1f(getUniform('u_shadowBias'), 0.001);
    gl.uniform1f(getUniform('u_shadowIntensity'), 0.7);

    // Bind shadow map texture if available
    if (hasShadowMap && this.shadowPass) {
      const shadowMapTexture = this.shadowPass.getShadowMapTexture(0);
      if (shadowMapTexture) {
        const textureAttachment = shadowMapTexture as any;
        if (textureAttachment.texture) {
          gl.activeTexture(gl.TEXTURE5); // Use texture unit 5 for shadow map
          gl.bindTexture(gl.TEXTURE_2D, textureAttachment.texture as WebGLTexture);
          gl.uniform1i(getUniform('u_shadowMap'), 5);

          if (this.frameCount === 1) {
            logger.info('Shadow map texture bound to texture unit 5');
          }
        }
      }
    }

    // IBL uses procedural sky only (cubemap samplers removed to avoid texture type conflicts)
    // The shader's IBL function uses procedural sky without any cubemap sampling
    gl.uniform1i(getUniform('u_hasEnvMap'), 0); // Always 0 - procedural sky only
    gl.uniform1f(getUniform('u_envIntensity'), 2.5); // Strong environment reflections for car paint
    gl.uniform1f(getUniform('u_exposure'), 1.2); // Slightly brighter exposure

    // Debug mode: 0=normal PBR, 1=show normals, 2=show albedo, 3=metallic, 4=roughness, 5=direct lighting only, 6=light count
    gl.uniform1i(getUniform('u_debugMode'), this.currentDebugMode); // Normal PBR rendering

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
        if (isVehicleNode || this.frameCount <= 3) {
          logger.error(`*** MISSING BUFFERS *** Node ${node.name} has mesh but missing vertexBuffer=${!!mesh.vertexBuffer}, indexBuffer=${!!mesh.indexBuffer}`);
        }
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

      // Calculate normal matrix (PROPER inverse transpose of 3x3 model matrix)
      // This is CRITICAL for non-uniform scaling - normals must be transformed correctly
      const normalMatrix = new Float32Array(9);
      const m = modelMatrix.elements;

      // Extract 3x3 upper-left portion - COLUMN-MAJOR storage!
      // WebGL/OpenGL stores matrices in column-major order:
      // Column 0: m[0], m[1], m[2]   = M_00, M_10, M_20
      // Column 1: m[4], m[5], m[6]   = M_01, M_11, M_21
      // Column 2: m[8], m[9], m[10]  = M_02, M_12, M_22
      // So M_ij (row i, col j) = m[j*4 + i]
      const m00 = m[0], m01 = m[4], m02 = m[8];   // Row 0
      const m10 = m[1], m11 = m[5], m12 = m[9];   // Row 1
      const m20 = m[2], m21 = m[6], m22 = m[10];  // Row 2

      // Calculate determinant of 3x3
      const det = m00 * (m11 * m22 - m12 * m21) -
                  m01 * (m10 * m22 - m12 * m20) +
                  m02 * (m10 * m21 - m11 * m20);

      if (Math.abs(det) > 0.0001) {
        // Calculate inverse transpose for WebGL column-major storage
        // Cofactor matrix C_ij stored in column-major as: col0=(C00,C10,C20), col1=(C01,C11,C21), col2=(C02,C12,C22)
        const invDet = 1.0 / det;
        // Column 0: C_00, C_10, C_20
        normalMatrix[0] = (m11 * m22 - m12 * m21) * invDet;  // C_00
        normalMatrix[1] = (m02 * m21 - m01 * m22) * invDet;  // C_10 = -(m01*m22 - m02*m21)
        normalMatrix[2] = (m01 * m12 - m02 * m11) * invDet;  // C_20
        // Column 1: C_01, C_11, C_21
        normalMatrix[3] = (m12 * m20 - m10 * m22) * invDet;  // C_01 = -(m10*m22 - m12*m20)
        normalMatrix[4] = (m00 * m22 - m02 * m20) * invDet;  // C_11
        normalMatrix[5] = (m02 * m10 - m00 * m12) * invDet;  // C_21 = -(m00*m12 - m02*m10)
        // Column 2: C_02, C_12, C_22
        normalMatrix[6] = (m10 * m21 - m11 * m20) * invDet;  // C_02
        normalMatrix[7] = (m01 * m20 - m00 * m21) * invDet;  // C_12 = -(m00*m21 - m01*m20)
        normalMatrix[8] = (m00 * m11 - m01 * m10) * invDet;  // C_22
      } else {
        // Fallback to identity if matrix is singular
        normalMatrix[0] = 1; normalMatrix[1] = 0; normalMatrix[2] = 0;
        normalMatrix[3] = 0; normalMatrix[4] = 1; normalMatrix[5] = 0;
        normalMatrix[6] = 0; normalMatrix[7] = 0; normalMatrix[8] = 1;
      }
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
        // have them directly on mat (via direct assignment like mat.albedo = color).
        // IMPORTANT: Check direct properties FIRST since they represent explicit user overrides,
        // then fall back to mat.properties which contains defaults.
        const props = mat.properties || {};

        // Albedo/base color - check DIRECT properties first (user overrides), then nested defaults
        // This handles the case where code does: material.albedo = new Color(...)
        const color = mat.albedo || mat.baseColor || mat.color || props.albedo || props.baseColor;
        if (color) {
          albedo = [color.r ?? 0.8, color.g ?? 0.8, color.b ?? 0.8];
        }

        // PBR properties - check DIRECT properties first (user overrides), then nested defaults
        // Direct assignment: material.metallic = 0.5 takes priority over defaults
        let metallicVal = mat.metallic ?? props.metallic;
        let roughnessVal = mat.roughness ?? props.roughness;
        let aoVal = mat.ao ?? props.ao;

        // FALLBACK: Check getParameter/getProperty if undefined (Handles MaterialInstance and New Material classes)
        if (metallicVal === undefined) {
             if (typeof mat.getParameter === 'function') metallicVal = mat.getParameter('metallic');
             else if (typeof mat.getProperty === 'function') metallicVal = mat.getProperty('metallic');
        }
        if (roughnessVal === undefined) {
             if (typeof mat.getParameter === 'function') roughnessVal = mat.getParameter('roughness');
             else if (typeof mat.getProperty === 'function') roughnessVal = mat.getProperty('roughness');
        }
        if (aoVal === undefined) {
             if (typeof mat.getParameter === 'function') aoVal = mat.getParameter('ao');
             else if (typeof mat.getProperty === 'function') aoVal = mat.getProperty('ao');
        }

        // DEBUG: Log detailed material info for Body materials to diagnose roughness issue
        if (this.frameCount <= 10 && node.name && (node.name.includes('Body') || node.name.includes('Hood'))) {
           const matType = mat.constructor ? mat.constructor.name : 'Unknown';
           logger.info(`[MAT DEBUG] Node: ${node.name}, Material: ${mat.name}, Type: ${matType}`);
           logger.info(`[MAT DEBUG]   mat.roughness: ${mat.roughness} (${typeof mat.roughness})`);
           logger.info(`[MAT DEBUG]   props.roughness: ${props?.roughness} (${typeof props?.roughness})`);
           logger.info(`[MAT DEBUG]   Resolved roughnessVal: ${roughnessVal}`);
           
           // Check if it looks like the newer material (using properties map)
           if (typeof mat.getProperty === 'function') {
             logger.info(`[MAT DEBUG]   mat.getProperty('roughness'): ${mat.getProperty('roughness')}`);
           }
        }

        if (metallicVal !== undefined) metallic = metallicVal;
        if (roughnessVal !== undefined) roughness = roughnessVal;
        if (aoVal !== undefined) ao = aoVal;

        // Emission - check DIRECT properties first (user overrides), then nested defaults
        const emissionColor = mat.emission || mat.emissive || props.emission || props.emissive;
        if (emissionColor) {
          emission = [emissionColor.r ?? 0, emissionColor.g ?? 0, emissionColor.b ?? 0];
        }
        const emIntensity = mat.emissionIntensity ?? mat.emissiveIntensity ?? props.emissionIntensity ?? props.emissiveIntensity;
        if (emIntensity !== undefined) emissionIntensity = emIntensity;

        // Log material properties on first few frames to verify they're being read
        if (this.frameCount <= 3 && node.name && (node.name.includes('Vehicle') || node.name.includes('Body') || node.name.includes('Hood') || node.name.includes('Rear'))) {
          logger.info(`[MATERIAL READ] ${node.name}: mat.metallic=${mat.metallic}, mat.roughness=${mat.roughness}, result metallic=${metallic.toFixed(2)}, roughness=${roughness.toFixed(2)}`);
        }
      }

      // DEBUG: Log material values for vehicle nodes before upload - expanded matching
      if (this.frameCount <= 3 && node.name && (node.name.includes('Body') || node.name.includes('Hood') || node.name.includes('Rear') || node.name.includes('Wheel') || node.name.includes('Cabin'))) {
        logger.info(`[UPLOAD] ${node.name}: albedo=(${albedo[0].toFixed(2)},${albedo[1].toFixed(2)},${albedo[2].toFixed(2)}), metallic=${metallic.toFixed(2)}, roughness=${roughness.toFixed(2)}, hasMat=${!!node.material}`);
      }

      // Upload material uniforms
      gl.uniform3f(getUniform('u_albedo'), albedo[0], albedo[1], albedo[2]);
      gl.uniform1f(getUniform('u_metallic'), metallic);
      gl.uniform1f(getUniform('u_roughness'), Math.max(roughness, 0.04)); // Clamp to prevent div by zero
      gl.uniform1f(getUniform('u_ao'), ao);
      gl.uniform3f(getUniform('u_emission'), emission[0], emission[1], emission[2]);
      gl.uniform1f(getUniform('u_emissionIntensity'), emissionIntensity);

      // ==========================================================================
      // TEXTURE BINDING - Bind material textures to texture units
      // TEXTURE UNIT ALLOCATION:
      // Units 0-4: Material textures (albedo, normal, metallicRoughness, ao, emission)
      // Unit 5: Shadow map (2D texture)
      // Units 6-7: IBL cubemaps (environment, irradiance)
      // ==========================================================================

      // Reset texture flags to 0 for this material
      gl.uniform1i(getUniform('u_hasAlbedoMap'), 0);
      gl.uniform1i(getUniform('u_hasNormalMap'), 0);
      gl.uniform1i(getUniform('u_hasMetallicRoughnessMap'), 0);
      gl.uniform1i(getUniform('u_hasAOMap'), 0);
      gl.uniform1i(getUniform('u_hasEmissionMap'), 0);

      if (node.material) {
        const mat = node.material as any;
        const textures = mat.textures;

        // Albedo map - TEXTURE UNIT 0
        if (textures?.albedoMap) {
          const glTexture = textures.albedoMap.getGLTexture?.();
          if (glTexture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, glTexture);
            gl.uniform1i(getUniform('u_albedoMap'), 0);
            gl.uniform1i(getUniform('u_hasAlbedoMap'), 1);
          }
        }

        // Normal map - TEXTURE UNIT 1
        if (textures?.normalMap) {
          const glTexture = textures.normalMap.getGLTexture?.();
          if (glTexture) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, glTexture);
            gl.uniform1i(getUniform('u_normalMap'), 1);
            gl.uniform1i(getUniform('u_hasNormalMap'), 1);
          }
        }

        // Metallic-Roughness map - TEXTURE UNIT 2
        if (textures?.metallicRoughnessMap) {
          const glTexture = textures.metallicRoughnessMap.getGLTexture?.();
          if (glTexture) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, glTexture);
            gl.uniform1i(getUniform('u_metallicRoughnessMap'), 2);
            gl.uniform1i(getUniform('u_hasMetallicRoughnessMap'), 1);
          }
        }

        // AO map - TEXTURE UNIT 3
        if (textures?.aoMap) {
          const glTexture = textures.aoMap.getGLTexture?.();
          if (glTexture) {
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, glTexture);
            gl.uniform1i(getUniform('u_aoMap'), 3);
            gl.uniform1i(getUniform('u_hasAOMap'), 1);
          }
        }

        // Emission map - TEXTURE UNIT 4
        if (textures?.emissionMap) {
          const glTexture = textures.emissionMap.getGLTexture?.();
          if (glTexture) {
            gl.activeTexture(gl.TEXTURE4);
            gl.bindTexture(gl.TEXTURE_2D, glTexture);
            gl.uniform1i(getUniform('u_emissionMap'), 4);
            gl.uniform1i(getUniform('u_hasEmissionMap'), 1);
          }
        }
      }

      // === DIRECT ATTRIBUTE SETUP (VAO STILL REQUIRED) ===
      // WebGL2 REQUIRES a VAO to be bound before any draw call
      // We bind the VAO first, then manually set up attributes each frame
      // Note: mesh already declared above (line ~2038)
      if (mesh && mesh.vertexBuffer) {
        const format = mesh.vertexBuffer.format;
        const stride = format.stride;

        // CRITICAL: WebGL2 requires VAO to be bound before any draw call
        gl.bindVertexArray(buffers.vao);

        // Bind VBO directly
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.vbo);

        // Re-setup position (location 0)
        const posAttr = format.attributes.find((a: any) => a.semantic === 'POSITION');
        if (posAttr) {
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, posAttr.offset);
        }

        // Re-setup normal (location 1)
        const normAttr = format.attributes.find((a: any) => a.semantic === 'NORMAL');
        if (normAttr) {
          gl.enableVertexAttribArray(1);
          gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, normAttr.offset);
          if (this.frameCount <= 3 && meshCount < 3) {
            console.log(`[NORMAL ATTR] ${mesh.name}: found NORMAL at offset ${normAttr.offset}, stride ${stride}`);
            // Dump all attributes for debugging
            console.log(`[ATTRS] All attributes for ${mesh.name}:`, format.attributes.map((a: any) => `${a.semantic}@${a.offset}`).join(', '));
          }
        } else {
          // CRITICAL: If no normals in vertex buffer, provide default up normal
          gl.disableVertexAttribArray(1);
          gl.vertexAttrib3f(1, 0.0, 1.0, 0.0); // Default up normal
          if (this.frameCount <= 3 && meshCount < 3) {
            console.log(`[NORMAL ATTR] ${mesh.name}: NO NORMAL attribute! Using default (0,1,0)`);
            // Dump all attributes for debugging
            console.log(`[ATTRS] All attributes for ${mesh.name}:`, format.attributes.map((a: any) => `${a.semantic}@${a.offset}`).join(', '));
          }
        }

        // Re-setup texcoord (location 2)
        const texAttr = format.attributes.find((a: any) => a.semantic === 'TEXCOORD_0');
        if (texAttr) {
          gl.enableVertexAttribArray(2);
          gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, texAttr.offset);
        }

        // Re-setup tangent (location 3)
        const tanAttr = format.attributes.find((a: any) => a.semantic === 'TANGENT');
        if (tanAttr) {
          gl.enableVertexAttribArray(3);
          gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, tanAttr.offset);
        } else {
          gl.disableVertexAttribArray(3);
          gl.vertexAttrib4f(3, 1.0, 0.0, 0.0, 1.0);
        }

        // Bind IBO directly
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.ibo);

        // Skip meshes with no valid indices (set to 0 during validation)
        if (buffers.indexCount === 0) {
          if (this.frameCount <= 3) {
            console.log(`[DRAW SKIP] ${mesh.name}: indexCount=0, skipping`);
          }
          return;
        }

        // Validate before drawing (only log first few frames to avoid spam)
        if (this.frameCount <= 3) {
          const indexTypeStr = buffers.indexType === gl.UNSIGNED_INT ? 'UINT32' : 'UINT16';
          console.log(`[DRAW] ${mesh.name}: ${buffers.indexCount} indices (${indexTypeStr}), ${buffers.vertexCount} vertices`);
        }

        // Draw using correct index type from mesh
        gl.drawElements(gl.TRIANGLES, buffers.indexCount, buffers.indexType, 0);

        // Unbind VAO
        gl.bindVertexArray(null);

        // Log once per mesh type
        if (this.frameCount === 1 && mesh.name) {
          console.log(`[DRAW] Drew ${mesh.name} with stride=${stride}, normAttr=${!!normAttr}, indexType=${buffers.indexType === gl.UNSIGNED_INT ? 'UINT32' : 'UINT16'}`);
        }
      } else {
        // Fallback to VAO if mesh not available
        // Skip meshes with no valid indices
        if (buffers.indexCount === 0) {
          return;
        }
        gl.bindVertexArray(buffers.vao);
        // Use correct index type from cached buffers
        gl.drawElements(gl.TRIANGLES, buffers.indexCount, buffers.indexType, 0);
        gl.bindVertexArray(null);
      }

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
