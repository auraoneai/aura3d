/**
 * @module Rendering
 * @description
 * Main renderer class coordinating all rendering subsystems for the G3D 5.0 engine.
 * Manages the complete rendering pipeline from scene setup to final presentation.
 */

import { GPUDevice, GPUBackendType } from './gpu/GPUDevice';
import { WebGPUBackend } from './gpu/WebGPUBackend';
import { WebGL2Backend } from './gpu/WebGL2Backend';
import { Camera } from './camera/Camera';
import { Scene } from './scene/Scene';
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
        maxShadowCasters: 8,
      },
    });

    this.shadowMapper = new ShadowMapper(device, {
      atlasSize: this.settings.maxShadowResolution,
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

    // Create device
    let device: GPUDevice;

    try {
      if (backend === RendererBackend.WebGPU || backend === RendererBackend.Auto) {
        logger.info('Attempting to create WebGPU backend...');
        device = await WebGPUBackend.create(canvas);
        logger.info('WebGPU backend created successfully');
      } else {
        throw new Error('WebGL2 fallback requested');
      }
    } catch (error) {
      if (backend === RendererBackend.WebGPU) {
        throw new Error('WebGPU backend required but not available');
      }

      logger.warn('WebGPU not available, falling back to WebGL2', error);
      device = await WebGL2Backend.create(canvas);
      logger.info('WebGL2 backend created successfully');
    }

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
        TextureFormat.RGBA16Float,
        this.config.msaaSamples
      );
    }

    // Backbuffer
    this.backbuffer = RenderTarget.createColorTarget(
      this.renderWidth,
      this.renderHeight,
      TextureFormat.RGBA8UnormSrgb,
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
        shadowMapper: this.shadowMapper,
      });
      this.renderGraph.addPass(this.shadowPass);
    }

    // G-Buffer pass
    this.gBufferPass = new GBufferPass({
      width: this.renderWidth,
      height: this.renderHeight,
      enableNormals: true,
      enableMetallic: true,
      enableRoughness: true,
    });
    this.renderGraph.addPass(this.gBufferPass);

    // Lighting pass
    this.lightingPass = new LightingPass({
      width: this.renderWidth,
      height: this.renderHeight,
      lightManager: this.lightManager,
    });
    this.renderGraph.addPass(this.lightingPass);

    // Skybox pass
    this.skyboxPass = new SkyboxPass({
      width: this.renderWidth,
      height: this.renderHeight,
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
        shadowMapper: this.shadowMapper,
      });
      this.renderGraph.addPass(this.shadowPass);
    }

    // Skybox pass
    this.skyboxPass = new SkyboxPass({
      width: this.renderWidth,
      height: this.renderHeight,
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

    // Begin profiling
    if (this.profiler) {
      this.profiler.beginFrame();
    }

    // Update camera
    camera.updateMatrices();

    // Update light manager with actual deltaTime
    const deltaTime = Time.deltaTime || 0.016; // Fallback to 60 FPS if Time not initialized
    this.lightManager.update(deltaTime);

    // Cull lights
    const visibleLights = this.lightManager.cullLights(camera);

    // Prepare shadows
    if (this.shadowPass && this.settings.shadowQuality !== 'off') {
      const shadowData = this.lightManager.prepareShadows(visibleLights, camera);
      this.shadowMapper.update(shadowData);
    }

    // Execute render graph
    if (this.profiler) {
      this.profiler.beginPass('Render Graph');
    }
    this.renderGraph.execute();
    if (this.profiler) {
      this.profiler.endPass();
    }

    // Post-processing
    if (this.postProcessStack && this.hdrTarget) {
      if (this.profiler) {
        this.profiler.beginPass('Post Process');
      }
      this.postProcessStack.render(this.hdrTarget.colorTextures[0], 0.016);
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
      lights: this.lightManager.getLightCount(),
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

  /**
   * Disposes of all resources.
   */
  dispose(): void {
    logger.info('Disposing renderer');

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
    if (this.backbuffer) {
      this.backbuffer.dispose();
      this.backbuffer = null;
    }

    if (this.hdrTarget) {
      this.hdrTarget.dispose();
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
