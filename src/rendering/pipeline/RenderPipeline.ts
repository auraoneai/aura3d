/**
 * Abstract render pipeline interface for G3D rendering engine.
 * Manages pass ordering, resource binding, viewport/scissor state,
 * and multi-view rendering support.
 *
 * @module RenderPipeline
 */

import { RenderPass } from './RenderPass';
import { RenderQueue, RenderQueueType } from './RenderQueue';
import { RenderTarget } from './RenderTarget';
import { RenderGraph, RenderGraphOptions } from './RenderGraph';
import { PipelineState } from './PipelineState';
import { DrawCall } from './DrawCall';
import { Rect } from '../../math/Rect';
import { Logger } from '../../core/Logger';

const logger = Logger.create('RenderPipeline');

/**
 * Viewport descriptor.
 * Defines the viewport transformation from NDC to framebuffer coordinates.
 *
 * @example
 * ```typescript
 * const viewport: ViewportDescriptor = {
 *   x: 0,
 *   y: 0,
 *   width: 1920,
 *   height: 1080,
 *   minDepth: 0.0,
 *   maxDepth: 1.0,
 * };
 * ```
 */
export interface ViewportDescriptor {
  /** X coordinate of viewport origin */
  x: number;
  /** Y coordinate of viewport origin */
  y: number;
  /** Viewport width in pixels */
  width: number;
  /** Viewport height in pixels */
  height: number;
  /** Minimum depth value (usually 0.0) */
  minDepth: number;
  /** Maximum depth value (usually 1.0) */
  maxDepth: number;
}

/**
 * Scissor rectangle descriptor.
 * Defines the scissor test region for fragment culling.
 *
 * @example
 * ```typescript
 * const scissor: ScissorDescriptor = {
 *   x: 100,
 *   y: 100,
 *   width: 800,
 *   height: 600,
 * };
 * ```
 */
export interface ScissorDescriptor {
  /** X coordinate of scissor rectangle */
  x: number;
  /** Y coordinate of scissor rectangle */
  y: number;
  /** Scissor width in pixels */
  width: number;
  /** Scissor height in pixels */
  height: number;
}

/**
 * Multi-view rendering configuration.
 * Used for VR/AR stereo rendering and multiple camera setups.
 *
 * @example
 * ```typescript
 * const multiView: MultiViewConfig = {
 *   enabled: true,
 *   viewCount: 2, // Left and right eye
 *   baseViewIndex: 0,
 * };
 * ```
 */
export interface MultiViewConfig {
  /** Whether multi-view rendering is enabled */
  enabled: boolean;
  /** Number of views to render */
  viewCount: number;
  /** Base view index */
  baseViewIndex: number;
}

/**
 * Render pipeline statistics.
 */
export interface RenderPipelineStats {
  /** Total number of passes */
  passCount: number;
  /** Number of executed passes this frame */
  executedPassCount: number;
  /** Total draw calls this frame */
  drawCallCount: number;
  /** Total triangles rendered this frame */
  triangleCount: number;
  /** Total vertices processed this frame */
  vertexCount: number;
  /** Pipeline state changes this frame */
  stateChangeCount: number;
  /** Shader changes this frame */
  shaderChangeCount: number;
  /** Frame time (milliseconds) */
  frameTime: number;
  /** Render time (milliseconds) */
  renderTime: number;
}

/**
 * Render pipeline configuration.
 */
export interface RenderPipelineConfig {
  /** Enable render graph for automatic resource management */
  useRenderGraph?: boolean;
  /** Render graph options */
  renderGraphOptions?: RenderGraphOptions;
  /** Enable multi-view rendering */
  multiView?: MultiViewConfig;
  /** Default viewport */
  defaultViewport?: ViewportDescriptor;
  /** Enable statistics collection */
  enableStats?: boolean;
  /** Enable debug validation */
  enableValidation?: boolean;
}

/**
 * Abstract render pipeline interface.
 * Coordinates render passes, queues, and resources for frame rendering.
 *
 * The pipeline manages:
 * - Render pass registration and execution order
 * - Render queue management (opaque, transparent, overlay)
 * - Resource binding (render targets, shaders, materials)
 * - Viewport and scissor state
 * - Multi-view rendering for VR/AR
 * - Statistics collection and debugging
 *
 * Subclasses must implement backend-specific functionality:
 * - bindPipelineState(): Apply GPU pipeline state
 * - bindShaderProgram(): Bind shader program
 * - bindResources(): Bind textures and uniforms
 * - executeDrawCall(): Execute a GPU draw command
 *
 * @example
 * ```typescript
 * class MyRenderPipeline extends RenderPipeline {
 *   protected bindPipelineState(state: PipelineState): void {
 *     // WebGL/WebGPU specific state binding
 *   }
 *
 *   protected bindShaderProgram(program: unknown): void {
 *     // Shader program binding
 *   }
 *
 *   protected bindResources(resources: unknown): void {
 *     // Texture and uniform binding
 *   }
 *
 *   protected executeDrawCall(drawCall: DrawCall): void {
 *     // Execute GPU draw command
 *   }
 * }
 *
 * const pipeline = new MyRenderPipeline({
 *   useRenderGraph: true,
 *   enableStats: true,
 * });
 *
 * // Add passes
 * pipeline.addPass(shadowPass);
 * pipeline.addPass(geometryPass);
 * pipeline.addPass(lightingPass);
 *
 * // Setup
 * pipeline.setup();
 *
 * // Render frame
 * pipeline.beginFrame();
 * pipeline.render();
 * pipeline.endFrame();
 * ```
 */
export abstract class RenderPipeline {
  /** Pipeline configuration */
  protected _config: Required<RenderPipelineConfig>;

  /** Render passes */
  protected _passes: Map<string, RenderPass> = new Map();

  /** Pass execution order */
  protected _passOrder: string[] = [];

  /** Render queues */
  protected _queues: Map<RenderQueueType, RenderQueue> = new Map();

  /** Render graph (optional) */
  protected _renderGraph: RenderGraph | null = null;

  /** Current render target */
  protected _currentRenderTarget: RenderTarget | null = null;

  /** Current pipeline state */
  protected _currentPipelineState: PipelineState | null = null;

  /** Current shader program */
  protected _currentShaderProgram: unknown = null;

  /** Current viewport */
  protected _currentViewport: ViewportDescriptor | null = null;

  /** Current scissor */
  protected _currentScissor: ScissorDescriptor | null = null;

  /** Statistics */
  protected _stats: RenderPipelineStats = {
    passCount: 0,
    executedPassCount: 0,
    drawCallCount: 0,
    triangleCount: 0,
    vertexCount: 0,
    stateChangeCount: 0,
    shaderChangeCount: 0,
    frameTime: 0,
    renderTime: 0,
  };

  /** Frame start time */
  protected _frameStartTime: number = 0;

  /** Render start time */
  protected _renderStartTime: number = 0;

  /** Whether pipeline is initialized */
  protected _initialized: boolean = false;

  /**
   * Creates a new render pipeline.
   *
   * @param config - Pipeline configuration
   */
  constructor(config: RenderPipelineConfig = {}) {
    this._config = {
      useRenderGraph: config.useRenderGraph ?? true,
      renderGraphOptions: config.renderGraphOptions ?? {},
      multiView: config.multiView ?? { enabled: false, viewCount: 1, baseViewIndex: 0 },
      defaultViewport: config.defaultViewport ?? {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        minDepth: 0.0,
        maxDepth: 1.0,
      },
      enableStats: config.enableStats ?? true,
      enableValidation: config.enableValidation ?? true,
    };

    // Create render queues
    this._queues.set(RenderQueueType.Opaque, RenderQueue.createOpaqueQueue());
    this._queues.set(RenderQueueType.Transparent, RenderQueue.createTransparentQueue());
    this._queues.set(RenderQueueType.Overlay, RenderQueue.createOverlayQueue());

    // Create render graph if enabled
    if (this._config.useRenderGraph) {
      this._renderGraph = new RenderGraph(this._config.renderGraphOptions);
    }

    logger.debug('Created render pipeline', this._config);
  }

  /**
   * Gets pipeline statistics.
   */
  get stats(): Readonly<RenderPipelineStats> {
    return this._stats;
  }

  /**
   * Gets render graph (if enabled).
   */
  get renderGraph(): RenderGraph | null {
    return this._renderGraph;
  }

  /**
   * Gets a render queue by type.
   *
   * @param type - Queue type
   * @returns Render queue
   */
  getQueue(type: RenderQueueType): RenderQueue {
    return this._queues.get(type)!;
  }

  /**
   * Adds a render pass to the pipeline.
   *
   * @param pass - Render pass to add
   *
   * @example
   * ```typescript
   * pipeline.addPass(geometryPass);
   * pipeline.addPass(lightingPass);
   * ```
   */
  addPass(pass: RenderPass): void {
    if (this._initialized) {
      logger.warn('Adding pass after initialization, call setup() again');
    }

    this._passes.set(pass.name, pass);
    this._passOrder.push(pass.name);

    if (this._renderGraph) {
      this._renderGraph.addPass(pass);
    }

    logger.debug(`Added pass: ${pass.name}`);
  }

  /**
   * Removes a render pass from the pipeline.
   *
   * @param passName - Name of the pass to remove
   */
  removePass(passName: string): void {
    const pass = this._passes.get(passName);
    if (!pass) {
      logger.warn(`Pass not found: ${passName}`);
      return;
    }

    if (this._initialized) {
      pass.cleanup();
    }

    this._passes.delete(passName);
    this._passOrder = this._passOrder.filter(name => name !== passName);

    if (this._renderGraph) {
      this._renderGraph.removePass(passName);
    }

    logger.debug(`Removed pass: ${passName}`);
  }

  /**
   * Gets a pass by name.
   *
   * @param name - Pass name
   * @returns Render pass or undefined
   */
  getPass(name: string): RenderPass | undefined {
    return this._passes.get(name);
  }

  /**
   * Sets up the render pipeline.
   * Initializes passes and builds render graph.
   *
   * @example
   * ```typescript
   * pipeline.setup();
   * ```
   */
  setup(): void {
    logger.info('Setting up render pipeline...');

    // Setup passes
    for (const pass of this._passes.values()) {
      pass.setup();
    }

    // Build render graph
    if (this._renderGraph) {
      this._renderGraph.build();
      this._renderGraph.compile();
    }

    this._initialized = true;
    this._stats.passCount = this._passes.size;

    logger.info('Render pipeline setup complete', {
      passes: this._stats.passCount,
    });
  }

  /**
   * Begins a new frame.
   * Resets statistics and prepares for rendering.
   *
   * @example
   * ```typescript
   * pipeline.beginFrame();
   * ```
   */
  beginFrame(): void {
    this._frameStartTime = performance.now();

    // Reset per-frame statistics
    this._stats.executedPassCount = 0;
    this._stats.drawCallCount = 0;
    this._stats.triangleCount = 0;
    this._stats.vertexCount = 0;
    this._stats.stateChangeCount = 0;
    this._stats.shaderChangeCount = 0;

    // Clear queues
    for (const queue of this._queues.values()) {
      queue.clear();
    }

    logger.trace('Frame begin');
  }

  /**
   * Renders the frame.
   * Executes all enabled passes in order.
   *
   * @example
   * ```typescript
   * pipeline.render();
   * ```
   */
  render(): void {
    if (!this._initialized) {
      logger.error('Pipeline not initialized, call setup() first');
      return;
    }

    this._renderStartTime = performance.now();

    // Execute via render graph or direct execution
    if (this._renderGraph) {
      this._renderGraph.execute();
      this.updateStatsFromGraph();
    } else {
      this.executePassesDirect();
    }

    const renderTime = performance.now() - this._renderStartTime;
    this._stats.renderTime = renderTime;

    logger.trace(`Render complete (${renderTime.toFixed(2)}ms)`);
  }

  /**
   * Ends the frame.
   * Finalizes rendering and updates statistics.
   *
   * @example
   * ```typescript
   * pipeline.endFrame();
   * ```
   */
  endFrame(): void {
    const frameTime = performance.now() - this._frameStartTime;
    this._stats.frameTime = frameTime;

    // Release draw calls
    for (const queue of this._queues.values()) {
      queue.clearAndRelease();
    }

    logger.trace(`Frame end (${frameTime.toFixed(2)}ms)`);
  }

  /**
   * Sets the current render target.
   *
   * @param renderTarget - Render target to bind
   *
   * @example
   * ```typescript
   * pipeline.setRenderTarget(offscreenTarget);
   * ```
   */
  setRenderTarget(renderTarget: RenderTarget | null): void {
    if (this._currentRenderTarget === renderTarget) {
      return;
    }

    this._currentRenderTarget = renderTarget;
    this.onRenderTargetChanged(renderTarget);
  }

  /**
   * Sets the viewport.
   *
   * @param viewport - Viewport descriptor
   *
   * @example
   * ```typescript
   * pipeline.setViewport({
   *   x: 0, y: 0,
   *   width: 1920, height: 1080,
   *   minDepth: 0.0, maxDepth: 1.0,
   * });
   * ```
   */
  setViewport(viewport: ViewportDescriptor): void {
    this._currentViewport = viewport;
    this.applyViewport(viewport);
  }

  /**
   * Sets the viewport from a rectangle.
   *
   * @param rect - Viewport rectangle
   *
   * @example
   * ```typescript
   * const rect = new Rect(0, 0, 1920, 1080);
   * pipeline.setViewportRect(rect);
   * ```
   */
  setViewportRect(rect: Rect): void {
    this.setViewport({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      minDepth: 0.0,
      maxDepth: 1.0,
    });
  }

  /**
   * Sets the scissor rectangle.
   *
   * @param scissor - Scissor descriptor or null to disable
   *
   * @example
   * ```typescript
   * pipeline.setScissor({ x: 100, y: 100, width: 800, height: 600 });
   * pipeline.setScissor(null); // Disable scissor
   * ```
   */
  setScissor(scissor: ScissorDescriptor | null): void {
    this._currentScissor = scissor;
    this.applyScissor(scissor);
  }

  /**
   * Sets the scissor from a rectangle.
   *
   * @param rect - Scissor rectangle or null to disable
   */
  setScissorRect(rect: Rect | null): void {
    if (rect === null) {
      this.setScissor(null);
    } else {
      this.setScissor({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    }
  }

  /**
   * Submits a draw call to a queue.
   *
   * @param queueType - Queue type
   * @param drawCall - Draw call
   * @param pipelineState - Pipeline state
   * @param shaderProgram - Shader program
   * @param materialId - Material ID
   * @param depth - Depth for sorting
   *
   * @example
   * ```typescript
   * pipeline.submitDrawCall(
   *   RenderQueueType.Opaque,
   *   drawCall,
   *   pipelineState,
   *   shader,
   *   materialId,
   *   depth
   * );
   * ```
   */
  submitDrawCall(
    queueType: RenderQueueType,
    drawCall: DrawCall,
    pipelineState: PipelineState,
    shaderProgram: unknown,
    materialId: number,
    depth: number
  ): void {
    const queue = this._queues.get(queueType);
    if (!queue) {
      logger.warn(`Invalid queue type: ${queueType}`);
      return;
    }

    queue.submit(drawCall, pipelineState, shaderProgram, materialId, depth);
  }

  /**
   * Executes passes directly (without render graph).
   */
  protected executePassesDirect(): void {
    for (const passName of this._passOrder) {
      const pass = this._passes.get(passName);
      if (!pass || !pass.enabled) {
        continue;
      }

      // Get queue for this pass (simplified - assumes opaque)
      const queue = this._queues.get(RenderQueueType.Opaque)!;

      // Get render target (simplified - would be determined by pass attachments)
      const renderTarget = this._currentRenderTarget;
      if (!renderTarget) {
        continue;
      }

      // Execute pass
      pass.executeWithBeginEnd(queue, renderTarget);

      // Execute queue
      this.executeQueue(queue);

      this._stats.executedPassCount++;
    }
  }

  /**
   * Executes a render queue.
   *
   * @param queue - Render queue to execute
   */
  protected executeQueue(queue: RenderQueue): void {
    // Sort queue
    queue.sort();

    // Execute draw calls
    queue.forEach((entry) => {
      // Bind pipeline state
      if (this._currentPipelineState !== entry.pipelineState) {
        this.bindPipelineState(entry.pipelineState);
        this._currentPipelineState = entry.pipelineState;
        this._stats.stateChangeCount++;
      }

      // Bind shader program
      if (this._currentShaderProgram !== entry.shaderProgram) {
        this.bindShaderProgram(entry.shaderProgram);
        this._currentShaderProgram = entry.shaderProgram;
        this._stats.shaderChangeCount++;
      }

      // Bind resources (material)
      this.bindResources(entry.materialId);

      // Execute draw call
      this.executeDrawCall(entry.drawCall);

      // Update statistics
      this._stats.drawCallCount++;
      if (entry.drawCall.isIndexed()) {
        this._stats.triangleCount += Math.floor(entry.drawCall.indexCount / 3);
      } else {
        this._stats.triangleCount += Math.floor(entry.drawCall.vertexCount / 3);
      }
    });

    // Update statistics from queue
    queue.computeStats();
  }

  /**
   * Updates statistics from render graph.
   */
  protected updateStatsFromGraph(): void {
    if (!this._renderGraph) return;

    const graphStats = this._renderGraph.stats;
    this._stats.executedPassCount = graphStats.executedPassCount;

    // Accumulate queue statistics
    for (const queue of this._queues.values()) {
      queue.computeStats();
      const queueStats = queue.stats;
      this._stats.drawCallCount += queueStats.drawCallCount;
      this._stats.triangleCount += queueStats.triangleCount;
      this._stats.stateChangeCount += queueStats.stateChanges;
      this._stats.shaderChangeCount += queueStats.shaderChanges;
    }
  }

  /**
   * Logs pipeline statistics.
   */
  logStats(): void {
    if (!this._config.enableStats) return;

    logger.info('=== Render Pipeline Stats ===');
    logger.info(`Frame time: ${this._stats.frameTime.toFixed(2)}ms`);
    logger.info(`Render time: ${this._stats.renderTime.toFixed(2)}ms`);
    logger.info(`Passes: ${this._stats.executedPassCount}/${this._stats.passCount}`);
    logger.info(`Draw calls: ${this._stats.drawCallCount}`);
    logger.info(`Triangles: ${this._stats.triangleCount}`);
    logger.info(`State changes: ${this._stats.stateChangeCount}`);
    logger.info(`Shader changes: ${this._stats.shaderChangeCount}`);

    if (this._renderGraph) {
      this._renderGraph.logInfo();
    }
  }

  /**
   * Cleans up the render pipeline.
   * Releases all resources and passes.
   */
  cleanup(): void {
    logger.info('Cleaning up render pipeline');

    // Cleanup passes
    for (const pass of this._passes.values()) {
      pass.cleanup();
    }

    // Reset render graph
    if (this._renderGraph) {
      this._renderGraph.reset();
    }

    // Clear queues
    for (const queue of this._queues.values()) {
      queue.clearAndRelease();
    }

    this._initialized = false;
  }

  /**
   * Called when render target changes.
   * Override to handle backend-specific render target binding.
   *
   * @param renderTarget - New render target or null
   */
  protected abstract onRenderTargetChanged(renderTarget: RenderTarget | null): void;

  /**
   * Applies viewport to GPU.
   * Override to implement backend-specific viewport setting.
   *
   * @param viewport - Viewport descriptor
   */
  protected abstract applyViewport(viewport: ViewportDescriptor): void;

  /**
   * Applies scissor to GPU.
   * Override to implement backend-specific scissor setting.
   *
   * @param scissor - Scissor descriptor or null
   */
  protected abstract applyScissor(scissor: ScissorDescriptor | null): void;

  /**
   * Binds pipeline state to GPU.
   * Override to implement backend-specific state binding.
   *
   * @param state - Pipeline state
   */
  protected abstract bindPipelineState(state: PipelineState): void;

  /**
   * Binds shader program to GPU.
   * Override to implement backend-specific shader binding.
   *
   * @param program - Shader program
   */
  protected abstract bindShaderProgram(program: unknown): void;

  /**
   * Binds resources (textures, uniforms) to GPU.
   * Override to implement backend-specific resource binding.
   *
   * @param materialId - Material ID
   */
  protected abstract bindResources(materialId: number): void;

  /**
   * Executes a draw call on GPU.
   * Override to implement backend-specific draw execution.
   *
   * @param drawCall - Draw call to execute
   */
  protected abstract executeDrawCall(drawCall: DrawCall): void;
}
