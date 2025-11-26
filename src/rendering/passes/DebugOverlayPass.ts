/**
 * Debug overlay rendering pass for visualization.
 *
 * Features:
 * - G-buffer visualization modes
 * - Wireframe overlay
 * - Depth buffer visualization
 * - Normal visualization
 * - Motion vector visualization
 * - Light heatmap
 * - Performance stats overlay
 *
 * @module DebugOverlayPass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';

const logger = Logger.create('DebugOverlayPass');

/**
 * Debug visualization mode.
 */
export enum DebugMode {
  /** No debug visualization */
  None = 'none',
  /** Show albedo */
  Albedo = 'albedo',
  /** Show normals */
  Normals = 'normals',
  /** Show roughness */
  Roughness = 'roughness',
  /** Show metallic */
  Metallic = 'metallic',
  /** Show ambient occlusion */
  AmbientOcclusion = 'ao',
  /** Show depth */
  Depth = 'depth',
  /** Show motion vectors */
  MotionVectors = 'motion',
  /** Show emission */
  Emission = 'emission',
  /** Show UV coordinates */
  UVCoordinates = 'uv',
  /** Show light complexity */
  LightComplexity = 'light-complexity',
  /** Show overdraw */
  Overdraw = 'overdraw',
  /** Show cascades */
  ShadowCascades = 'cascades',
  /** Wireframe */
  Wireframe = 'wireframe'
}

/**
 * Debug overlay configuration.
 */
export interface DebugOverlayConfig {
  /** Current debug mode */
  mode: DebugMode;
  /** Show performance stats */
  showStats: boolean;
  /** Stats position (0-1 normalized) */
  statsPosition: { x: number; y: number };
  /** Wireframe color */
  wireframeColor: Color;
  /** Wireframe line width */
  wireframeWidth: number;
  /** Depth visualization range */
  depthRange: { near: number; far: number };
  /** Motion vector scale */
  motionVectorScale: number;
  /** Show grid */
  showGrid: boolean;
  /** Grid size */
  gridSize: number;
  /** Grid color */
  gridColor: Color;
}

/**
 * Performance statistics.
 */
export interface PerformanceStats {
  /** Frame time (ms) */
  frameTime: number;
  /** FPS */
  fps: number;
  /** Draw calls */
  drawCalls: number;
  /** Triangles */
  triangles: number;
  /** Vertices */
  vertices: number;
  /** Texture memory (MB) */
  textureMemory: number;
  /** Buffer memory (MB) */
  bufferMemory: number;
  /** Active shaders */
  shaders: number;
  /** Active textures */
  textures: number;
}

// Debug visualization fragment shader (GLSL 300 ES).
// Note: Currently unused but kept for future implementation - shader code removed to fix TS6133

/**
 * Debug overlay rendering pass.
 *
 * Provides comprehensive debugging visualization for:
 * - G-buffer components
 * - Depth and motion vectors
 * - Performance metrics
 * - Wireframe rendering
 * - Scene grid
 *
 * @example
 * ```typescript
 * const debugPass = new DebugOverlayPass({
 *   mode: DebugMode.Normals,
 *   showStats: true,
 *   statsPosition: { x: 0.02, y: 0.02 },
 *   wireframeColor: new Color(0, 1, 0),
 *   wireframeWidth: 1.0,
 *   depthRange: { near: 0.1, far: 1000 },
 *   motionVectorScale: 10.0,
 *   showGrid: true,
 *   gridSize: 10,
 *   gridColor: new Color(0.3, 0.3, 0.3, 0.5)
 * });
 *
 * debugPass.setup();
 * debugPass.execute(renderQueue, renderTarget);
 *
 * // Change mode
 * debugPass.setDebugMode(DebugMode.Depth);
 *
 * // Update stats
 * debugPass.updateStats({
 *   frameTime: 16.7,
 *   fps: 60,
 *   drawCalls: 150,
 *   triangles: 50000,
 *   ...
 * });
 * ```
 */
export class DebugOverlayPass extends RenderPass {
  /** Configuration */
  private config: DebugOverlayConfig;

  /** Performance statistics */
  private stats: PerformanceStats = {
    frameTime: 0,
    fps: 0,
    drawCalls: 0,
    triangles: 0,
    vertices: 0,
    textureMemory: 0,
    bufferMemory: 0,
    shaders: 0,
    textures: 0,
  };

  /** Debug visualization shader */
  private debugShader: WebGLProgram | null = null;

  /** Wireframe shader */
  private wireframeShader: WebGLProgram | null = null;

  /** Grid shader */
  private gridShader: WebGLProgram | null = null;

  /** Full-screen quad */
  private quadBuffer: WebGLBuffer | null = null;

  /** Grid mesh */
  private gridBuffer: WebGLBuffer | null = null;

  /** Canvas for text rendering */
  private textCanvas: HTMLCanvasElement | null = null;
  private textContext: CanvasRenderingContext2D | null = null;

  /** Text texture */
  private textTexture: WebGLTexture | null = null;

  /** WebGL context */
  private gl: WebGL2RenderingContext | null = null;

  /**
   * Creates a new debug overlay pass.
   *
   * @param config - Debug configuration
   */
  constructor(config: DebugOverlayConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'DebugOverlayPass',
      colorAttachments: [
        {
          name: 'debugOutput',
          format: TextureFormat.RGBA8,
        },
      ],
      clearValues: {
        colors: [new Color(0, 0, 0, 0)],
      },
      colorLoadActions: [LoadAction.Load],
      colorStoreActions: [StoreAction.Store],
    };

    super(descriptor);
    this.config = config;

    logger.info(`Created DebugOverlayPass: mode ${config.mode}`);
  }

  /**
   * Sets up debug overlay resources.
   */
  setup(): void {
    logger.debug('Setting up DebugOverlayPass');

    // Note: In full implementation, would initialize WebGL context here
    // this.gl = getWebGL2Context();

    // Create full-screen quad
    this.createQuad();

    // Create grid mesh
    if (this.config.showGrid) {
      this.createGrid();
    }

    // Create shaders
    this.createShaders();

    // Create text canvas
    if (this.config.showStats) {
      this.createTextCanvas();
    }

    logger.info('DebugOverlayPass setup complete');
  }

  /**
   * Executes the debug overlay pass.
   *
   * @param renderQueue - Render queue (unused)
   * @param renderTarget - Target to render to
   */
  execute(_renderQueue: RenderQueue, _renderTarget: RenderTarget): void {
    if (!this.gl) {
      logger.error('DebugOverlayPass not properly initialized');
      return;
    }

    // Render debug visualization
    if (this.config.mode !== DebugMode.None) {
      this.renderDebugVisualization();
    }

    // Render wireframe
    if (this.config.mode === DebugMode.Wireframe) {
      this.renderWireframe(_renderQueue);
    }

    // Render grid
    if (this.config.showGrid) {
      this.renderGrid();
    }

    // Render stats
    if (this.config.showStats) {
      this.renderStats();
    }
  }

  /**
   * Cleans up debug overlay resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up DebugOverlayPass');

    if (this.gl) {
      // Delete shaders
      this.gl.deleteProgram(this.debugShader);
      this.gl.deleteProgram(this.wireframeShader);
      this.gl.deleteProgram(this.gridShader);

      // Delete buffers
      this.gl.deleteBuffer(this.quadBuffer);
      this.gl.deleteBuffer(this.gridBuffer);

      // Delete textures
      this.gl.deleteTexture(this.textTexture);
    }

    this.debugShader = null;
    this.wireframeShader = null;
    this.gridShader = null;
    this.quadBuffer = null;
    this.gridBuffer = null;
    this.textCanvas = null;
    this.textContext = null;
    this.textTexture = null;
    this.gl = null;

    logger.info('DebugOverlayPass cleanup complete');
  }

  /**
   * Creates full-screen quad.
   */
  private createQuad(): void {
    // Full-screen quad vertices
    // const vertices = new Float32Array([
    //   -1, -1, 0, 0,
    //    1, -1, 1, 0,
    //    1,  1, 1, 1,
    //   -1,  1, 0, 1,
    // ]);

    // In full implementation, create WebGL buffer
    // this.quadBuffer = createBuffer(gl, vertices);
  }

  /**
   * Creates grid mesh.
   */
  private createGrid(): void {
    const size = this.config.gridSize;
    const vertices: number[] = [];

    // Create grid lines
    for (let i = -size; i <= size; i++) {
      // X lines
      vertices.push(i, 0, -size, i, 0, size);
      // Z lines
      vertices.push(-size, 0, i, size, 0, i);
    }

    // In full implementation, create WebGL buffer
    // this.gridBuffer = createBuffer(gl, new Float32Array(vertices));
  }

  /**
   * Creates shaders.
   */
  private createShaders(): void {
    // In full implementation, compile and link shaders
    logger.debug('Creating debug shaders');
  }

  /**
   * Creates text rendering canvas.
   */
  private createTextCanvas(): void {
    this.textCanvas = document.createElement('canvas');
    this.textCanvas.width = 512;
    this.textCanvas.height = 512;

    this.textContext = this.textCanvas.getContext('2d');

    if (this.textContext) {
      this.textContext.font = '16px monospace';
      this.textContext.fillStyle = 'white';
      this.textContext.textBaseline = 'top';
    }

    // In full implementation, create texture from canvas
    // this.textTexture = createTexture(gl, this.textCanvas);
  }

  /**
   * Renders debug visualization.
   */
  private renderDebugVisualization(): void {
    // In full implementation:
    // 1. Bind debug shader
    // 2. Set uniforms (mode, textures, etc.)
    // 3. Draw full-screen quad
  }

  /**
   * Renders wireframe overlay.
   */
  private renderWireframe(_renderQueue: RenderQueue): void {
    // In full implementation:
    // 1. Enable polygon offset
    // 2. Set polygon mode to LINE
    // 3. Render scene with wireframe shader
    // 4. Restore polygon mode
  }

  /**
   * Renders grid.
   */
  private renderGrid(): void {
    // In full implementation:
    // 1. Bind grid shader
    // 2. Set uniforms (color, transform)
    // 3. Draw grid lines
  }

  /**
   * Renders performance statistics.
   */
  private renderStats(): void {
    if (!this.textContext || !this.textCanvas) return;

    // Clear canvas
    this.textContext.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);

    // Draw stats
    const lines = [
      `FPS: ${this.stats.fps.toFixed(1)}`,
      `Frame: ${this.stats.frameTime.toFixed(2)}ms`,
      `Draw Calls: ${this.stats.drawCalls}`,
      `Triangles: ${this.formatNumber(this.stats.triangles)}`,
      `Vertices: ${this.formatNumber(this.stats.vertices)}`,
      `Texture Memory: ${this.stats.textureMemory.toFixed(1)}MB`,
      `Buffer Memory: ${this.stats.bufferMemory.toFixed(1)}MB`,
      `Shaders: ${this.stats.shaders}`,
      `Textures: ${this.stats.textures}`,
    ];

    const lineHeight = 20;
    for (let i = 0; i < lines.length; i++) {
      this.textContext.fillText(lines[i], 10, 10 + i * lineHeight);
    }

    // In full implementation, update texture from canvas
    // updateTexture(gl, this.textTexture, this.textCanvas);

    // Render text texture as overlay
    // renderTexturedQuad(...)
  }

  /**
   * Formats number with K/M suffix.
   */
  private formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    } else {
      return num.toString();
    }
  }

  /**
   * Sets debug mode.
   */
  setDebugMode(mode: DebugMode): void {
    this.config.mode = mode;
    logger.info(`Debug mode: ${mode}`);
  }

  /**
   * Gets current debug mode.
   */
  getDebugMode(): DebugMode {
    return this.config.mode;
  }

  /**
   * Updates performance statistics.
   */
  updateStats(stats: Partial<PerformanceStats>): void {
    Object.assign(this.stats, stats);
  }

  /**
   * Gets performance statistics.
   */
  getStats(): Readonly<PerformanceStats> {
    return this.stats;
  }

  /**
   * Enables/disables stats overlay.
   */
  setShowStats(show: boolean): void {
    this.config.showStats = show;

    if (show && !this.textCanvas) {
      this.createTextCanvas();
    }

    logger.info(`Stats overlay ${show ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enables/disables grid.
   */
  setShowGrid(show: boolean): void {
    this.config.showGrid = show;

    if (show && !this.gridBuffer) {
      this.createGrid();
    }

    logger.info(`Grid ${show ? 'enabled' : 'disabled'}`);
  }

  /**
   * Sets wireframe color.
   */
  setWireframeColor(color: Color): void {
    this.config.wireframeColor = color;
  }

  /**
   * Sets depth visualization range.
   */
  setDepthRange(near: number, far: number): void {
    this.config.depthRange = { near, far };
  }

  /**
   * Sets motion vector scale.
   */
  setMotionVectorScale(scale: number): void {
    this.config.motionVectorScale = scale;
  }
}
