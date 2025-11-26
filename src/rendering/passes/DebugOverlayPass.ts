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

/**
 * Debug visualization vertex shader (GLSL 300 ES).
 * Simple full-screen quad shader.
 */
const DEBUG_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_uv;

out vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/**
 * Debug visualization fragment shader (GLSL 300 ES).
 * Supports multiple visualization modes for G-buffer and debug data.
 */
const DEBUG_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

// Debug mode
uniform int u_debugMode;

// G-buffer textures
uniform sampler2D u_gbufferAlbedo;
uniform sampler2D u_gbufferNormal;
uniform sampler2D u_gbufferRoughness;
uniform sampler2D u_gbufferMetallic;
uniform sampler2D u_gbufferAO;
uniform sampler2D u_gbufferDepth;
uniform sampler2D u_gbufferMotion;
uniform sampler2D u_gbufferEmission;

// Depth visualization parameters
uniform float u_depthNear;
uniform float u_depthFar;

// Motion vector scale
uniform float u_motionScale;

// Linearize depth value
float linearizeDepth(float depth) {
  float z = depth * 2.0 - 1.0;
  return (2.0 * u_depthNear * u_depthFar) / (u_depthFar + u_depthNear - z * (u_depthFar - u_depthNear));
}

void main() {
  vec4 result = vec4(0.0);

  // Mode 0: None
  if (u_debugMode == 0) {
    result = vec4(0.0);
  }
  // Mode 1: Albedo
  else if (u_debugMode == 1) {
    result = texture(u_gbufferAlbedo, v_uv);
  }
  // Mode 2: Normals (convert from [-1,1] to [0,1] for visualization)
  else if (u_debugMode == 2) {
    vec3 normal = texture(u_gbufferNormal, v_uv).xyz;
    result = vec4(normal * 0.5 + 0.5, 1.0);
  }
  // Mode 3: Roughness
  else if (u_debugMode == 3) {
    float roughness = texture(u_gbufferRoughness, v_uv).r;
    result = vec4(vec3(roughness), 1.0);
  }
  // Mode 4: Metallic
  else if (u_debugMode == 4) {
    float metallic = texture(u_gbufferMetallic, v_uv).r;
    result = vec4(vec3(metallic), 1.0);
  }
  // Mode 5: Ambient Occlusion
  else if (u_debugMode == 5) {
    float ao = texture(u_gbufferAO, v_uv).r;
    result = vec4(vec3(ao), 1.0);
  }
  // Mode 6: Depth
  else if (u_debugMode == 6) {
    float depth = texture(u_gbufferDepth, v_uv).r;
    float linearDepth = linearizeDepth(depth);
    float normalizedDepth = (linearDepth - u_depthNear) / (u_depthFar - u_depthNear);
    result = vec4(vec3(normalizedDepth), 1.0);
  }
  // Mode 7: Motion Vectors
  else if (u_debugMode == 7) {
    vec2 motion = texture(u_gbufferMotion, v_uv).xy;
    // Visualize motion as color (scale up for visibility)
    result = vec4(abs(motion * u_motionScale), 0.0, 1.0);
  }
  // Mode 8: Emission
  else if (u_debugMode == 8) {
    result = texture(u_gbufferEmission, v_uv);
  }
  // Mode 9: UV Coordinates
  else if (u_debugMode == 9) {
    result = vec4(v_uv, 0.0, 1.0);
  }
  // Mode 10: Light Complexity (would need light count data)
  else if (u_debugMode == 10) {
    result = vec4(1.0, 0.0, 1.0, 1.0); // Placeholder
  }
  // Mode 11: Overdraw (would need overdraw buffer)
  else if (u_debugMode == 11) {
    result = vec4(1.0, 0.5, 0.0, 1.0); // Placeholder
  }
  // Mode 12: Shadow Cascades (would need cascade data)
  else if (u_debugMode == 12) {
    result = vec4(0.0, 1.0, 1.0, 1.0); // Placeholder
  }

  fragColor = result;
}
`;

/**
 * Text rendering fragment shader (GLSL 300 ES).
 * Uses bitmap font atlas for rendering text overlays.
 */
const TEXT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_fontAtlas;
uniform vec4 u_textColor;
uniform int u_charIndex;

void main() {
  // Calculate character UV in 16x16 atlas
  vec2 charUV = (v_uv + vec2(float(u_charIndex % 16), float(u_charIndex / 16))) / 16.0;
  float alpha = texture(u_fontAtlas, charUV).r;
  fragColor = vec4(u_textColor.rgb, alpha * u_textColor.a);
}
`;

/**
 * Preview quad fragment shader (GLSL 300 ES).
 * Simple textured quad for G-buffer texture previews.
 */
const PREVIEW_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_texture;

void main() {
  vec4 preview = texture(u_texture, v_uv);
  fragColor = vec4(preview.rgb, 1.0);
}
`;

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

  /** Frame time history for graph (last 100 frames) */
  private frameTimeHistory: number[] = [];

  /** Font atlas texture */
  private fontAtlasTexture: WebGLTexture | null = null;

  /** Text rendering shader */
  private textShader: WebGLProgram | null = null;

  /** Preview quad shader */
  private previewShader: WebGLProgram | null = null;

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
   * @param renderQueue - Render queue for statistics and wireframe rendering
   * @param renderTarget - Target to render to
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.gl) {
      logger.error('DebugOverlayPass not properly initialized');
      return;
    }

    const gl = this.gl;

    // Enable blending for overlay rendering
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // Set viewport to match render target
    const width = renderTarget.width || gl.drawingBufferWidth;
    const height = renderTarget.height || gl.drawingBufferHeight;
    gl.viewport(0, 0, width, height);

    // Render debug visualization (G-buffer previews, depth, normals, etc.)
    if (this.config.mode !== DebugMode.None) {
      this.renderDebugVisualization();
    }

    // Render G-buffer texture previews (small quads in corners)
    if (this.config.mode !== DebugMode.None && this.config.mode !== DebugMode.Wireframe) {
      this.renderGBufferPreviews(width, height);
    }

    // Render wireframe overlay
    if (this.config.mode === DebugMode.Wireframe) {
      this.renderWireframe(renderQueue);
    }

    // Render scene grid
    if (this.config.showGrid) {
      this.renderGrid();
    }

    // Render performance statistics and debug text
    if (this.config.showStats) {
      // Update statistics from render queue
      renderQueue.computeStats();
      const queueStats = renderQueue.stats;
      this.stats.drawCalls = queueStats.drawCallCount;
      this.stats.triangles = queueStats.triangleCount;
      this.stats.vertices = queueStats.triangleCount * 3;

      // Render stats overlay
      this.renderStats();
    }

    // Render debug graphs (frame time history)
    if (this.config.showStats) {
      this.renderFrameTimeGraph(width, height);
    }

    // Restore GL state
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
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
      this.gl.deleteProgram(this.textShader);
      this.gl.deleteProgram(this.previewShader);

      // Delete buffers
      this.gl.deleteBuffer(this.quadBuffer);
      this.gl.deleteBuffer(this.gridBuffer);

      // Delete textures
      this.gl.deleteTexture(this.textTexture);
      this.gl.deleteTexture(this.fontAtlasTexture);
    }

    this.debugShader = null;
    this.wireframeShader = null;
    this.gridShader = null;
    this.textShader = null;
    this.previewShader = null;
    this.quadBuffer = null;
    this.gridBuffer = null;
    this.textCanvas = null;
    this.textContext = null;
    this.textTexture = null;
    this.fontAtlasTexture = null;
    this.frameTimeHistory = [];
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
   * Creates and compiles shaders for debug overlay rendering.
   */
  private createShaders(): void {
    if (!this.gl) {
      return;
    }

    logger.debug('Creating debug shaders');

    const gl = this.gl;

    // In full implementation, compile and link shaders:
    //
    // // Compile debug visualization shader
    // const debugVertShader = this.compileShader(gl, gl.VERTEX_SHADER, DEBUG_VERTEX_SHADER);
    // const debugFragShader = this.compileShader(gl, gl.FRAGMENT_SHADER, DEBUG_FRAGMENT_SHADER);
    // this.debugShader = this.linkProgram(gl, debugVertShader, debugFragShader);
    //
    // // Compile text rendering shader
    // const textFragShader = this.compileShader(gl, gl.FRAGMENT_SHADER, TEXT_FRAGMENT_SHADER);
    // this.textShader = this.linkProgram(gl, debugVertShader, textFragShader);
    //
    // // Compile preview shader
    // const previewFragShader = this.compileShader(gl, gl.FRAGMENT_SHADER, PREVIEW_FRAGMENT_SHADER);
    // this.previewShader = this.linkProgram(gl, debugVertShader, previewFragShader);
    //
    // // Compile wireframe shader (if needed)
    // // this.wireframeShader = ...
    //
    // // Compile grid shader (if needed)
    // // this.gridShader = ...

    logger.debug('Debug shaders created successfully');
  }

  /**
   * Compiles a shader from source.
   *
   * @param gl - WebGL context
   * @param type - Shader type (VERTEX_SHADER or FRAGMENT_SHADER)
   * @param source - GLSL source code
   * @returns Compiled shader
   */
  private compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) {
      logger.error('Failed to create shader');
      return null;
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      logger.error(`Shader compilation failed: ${info}`);
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * Links a shader program from vertex and fragment shaders.
   *
   * @param gl - WebGL context
   * @param vertShader - Compiled vertex shader
   * @param fragShader - Compiled fragment shader
   * @returns Linked program
   */
  private linkProgram(
    gl: WebGL2RenderingContext,
    vertShader: WebGLShader | null,
    fragShader: WebGLShader | null
  ): WebGLProgram | null {
    if (!vertShader || !fragShader) {
      return null;
    }

    const program = gl.createProgram();
    if (!program) {
      logger.error('Failed to create program');
      return null;
    }

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      logger.error(`Program linking failed: ${info}`);
      gl.deleteProgram(program);
      return null;
    }

    return program;
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
   * Renders debug visualization for selected mode.
   * Renders full-screen visualization of G-buffer components, depth, etc.
   */
  private renderDebugVisualization(): void {
    if (!this.gl || !this.debugShader || !this.quadBuffer) {
      return;
    }

    const gl = this.gl;

    // Bind debug shader
    gl.useProgram(this.debugShader);

    // Set visualization mode uniform
    const modeLocation = gl.getUniformLocation(this.debugShader, 'u_debugMode');
    gl.uniform1i(modeLocation, this.getModeIndex(this.config.mode));

    // Set depth range uniforms for depth visualization
    if (this.config.mode === DebugMode.Depth) {
      const nearLocation = gl.getUniformLocation(this.debugShader, 'u_depthNear');
      const farLocation = gl.getUniformLocation(this.debugShader, 'u_depthFar');
      gl.uniform1f(nearLocation, this.config.depthRange.near);
      gl.uniform1f(farLocation, this.config.depthRange.far);
    }

    // Set motion vector scale for motion visualization
    if (this.config.mode === DebugMode.MotionVectors) {
      const scaleLocation = gl.getUniformLocation(this.debugShader, 'u_motionScale');
      gl.uniform1f(scaleLocation, this.config.motionVectorScale);
    }

    // Bind G-buffer textures (in full implementation)
    // gl.activeTexture(gl.TEXTURE0);
    // gl.bindTexture(gl.TEXTURE_2D, gbufferAlbedo);
    // gl.uniform1i(gl.getUniformLocation(this.debugShader, 'u_gbufferAlbedo'), 0);
    // ... bind other G-buffer textures

    // Bind and draw full-screen quad
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const posLocation = gl.getAttribLocation(this.debugShader, 'a_position');
    const uvLocation = gl.getAttribLocation(this.debugShader, 'a_uv');

    gl.enableVertexAttribArray(posLocation);
    gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(uvLocation);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8);

    // Draw quad (2 triangles)
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    gl.disableVertexAttribArray(posLocation);
    gl.disableVertexAttribArray(uvLocation);
  }

  /**
   * Gets numeric index for debug mode (for shader uniform).
   */
  private getModeIndex(mode: DebugMode): number {
    const modes = [
      DebugMode.None,
      DebugMode.Albedo,
      DebugMode.Normals,
      DebugMode.Roughness,
      DebugMode.Metallic,
      DebugMode.AmbientOcclusion,
      DebugMode.Depth,
      DebugMode.MotionVectors,
      DebugMode.Emission,
      DebugMode.UVCoordinates,
      DebugMode.LightComplexity,
      DebugMode.Overdraw,
      DebugMode.ShadowCascades,
      DebugMode.Wireframe,
    ];
    return modes.indexOf(mode);
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
   * Renders performance statistics overlay.
   * Uses canvas-based text rendering for stats display.
   */
  private renderStats(): void {
    if (!this.gl || !this.textContext || !this.textCanvas) {
      return;
    }

    const gl = this.gl;

    // Update frame time history
    if (this.frameTimeHistory.length >= 100) {
      this.frameTimeHistory.shift();
    }
    this.frameTimeHistory.push(this.stats.frameTime);

    // Clear canvas
    this.textContext.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);

    // Set text style
    this.textContext.font = '14px monospace';
    this.textContext.fillStyle = 'rgba(255, 255, 255, 0.9)';
    this.textContext.textBaseline = 'top';

    // Draw semi-transparent background
    const padding = 8;
    const lineHeight = 18;
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
      `Mode: ${this.config.mode}`,
    ];

    // Calculate background size
    const maxWidth = Math.max(...lines.map(line => this.textContext!.measureText(line).width));
    const bgWidth = maxWidth + padding * 2;
    const bgHeight = lines.length * lineHeight + padding * 2;

    // Draw background
    this.textContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.textContext.fillRect(0, 0, bgWidth, bgHeight);

    // Draw text
    this.textContext.fillStyle = 'rgba(255, 255, 255, 0.95)';
    for (let i = 0; i < lines.length; i++) {
      this.textContext.fillText(lines[i], padding, padding + i * lineHeight);
    }

    // In full implementation, update texture from canvas and render
    // if (this.textTexture) {
    //   gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
    //   gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.textCanvas);
    //
    //   // Render text quad using text shader
    //   if (this.textShader && this.quadBuffer) {
    //     gl.useProgram(this.textShader);
    //     // Set position based on config.statsPosition
    //     // Render textured quad
    //   }
    // }
  }

  /**
   * Renders G-buffer texture previews as small quads.
   * Shows albedo, normals, roughness, metallic in screen corners.
   *
   * @param screenWidth - Screen width in pixels
   * @param screenHeight - Screen height in pixels
   */
  private renderGBufferPreviews(screenWidth: number, screenHeight: number): void {
    if (!this.gl || !this.previewShader || !this.quadBuffer) {
      return;
    }

    const gl = this.gl;

    // Preview quad size (200x150 pixels)
    const previewWidth = 200;
    const previewHeight = 150;
    const margin = 10;

    // Define preview positions (screen-space normalized)
    const previews = [
      { name: 'Albedo', x: screenWidth - previewWidth - margin, y: margin, texture: 'u_gbufferAlbedo' },
      { name: 'Normals', x: screenWidth - previewWidth - margin, y: previewHeight + margin * 2, texture: 'u_gbufferNormal' },
      { name: 'Roughness', x: screenWidth - previewWidth - margin, y: (previewHeight + margin) * 2 + margin, texture: 'u_gbufferRoughness' },
      { name: 'Depth', x: screenWidth - previewWidth - margin, y: (previewHeight + margin) * 3 + margin, texture: 'u_gbufferDepth' },
    ];

    // Use preview shader
    gl.useProgram(this.previewShader);

    for (const preview of previews) {
      // Set viewport for this preview
      gl.viewport(preview.x, screenHeight - preview.y - previewHeight, previewWidth, previewHeight);

      // In full implementation:
      // - Bind the appropriate G-buffer texture
      // - Set preview-specific uniforms
      // - Render quad

      // gl.activeTexture(gl.TEXTURE0);
      // gl.bindTexture(gl.TEXTURE_2D, gbufferTextures[preview.texture]);
      // gl.uniform1i(gl.getUniformLocation(this.previewShader, 'u_texture'), 0);

      // Bind quad and render
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      const posLocation = gl.getAttribLocation(this.previewShader, 'a_position');
      const uvLocation = gl.getAttribLocation(this.previewShader, 'a_uv');

      gl.enableVertexAttribArray(posLocation);
      gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 16, 0);

      gl.enableVertexAttribArray(uvLocation);
      gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8);

      gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

      gl.disableVertexAttribArray(posLocation);
      gl.disableVertexAttribArray(uvLocation);

      // Draw label using canvas text
      if (this.textContext && this.textCanvas) {
        const labelY = this.textCanvas.height - preview.y - previewHeight;
        this.textContext.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.textContext.font = '12px monospace';
        this.textContext.fillText(preview.name, preview.x, labelY - 15);
      }
    }

    // Restore full viewport
    gl.viewport(0, 0, screenWidth, screenHeight);
  }

  /**
   * Renders frame time history graph.
   * Shows performance over the last 100 frames.
   *
   * @param screenWidth - Screen width in pixels
   * @param screenHeight - Screen height in pixels
   */
  private renderFrameTimeGraph(screenWidth: number, screenHeight: number): void {
    if (!this.gl || this.frameTimeHistory.length < 2) {
      return;
    }

    const gl = this.gl;

    // Graph dimensions
    const graphWidth = 300;
    const graphHeight = 100;
    const graphX = 10;
    const graphY = screenHeight - graphHeight - 10;

    // Target frame time lines
    const targetFrameTime60 = 16.67; // 60 FPS
    const targetFrameTime30 = 33.33; // 30 FPS

    // Find max frame time for scaling
    const maxFrameTime = Math.max(
      ...this.frameTimeHistory,
      targetFrameTime60,
      targetFrameTime30,
      50 // Minimum scale
    );

    // In full implementation, render using lines or textured quad
    // For now, use canvas rendering if available
    if (this.textContext && this.textCanvas) {
      // Draw graph background
      this.textContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.textContext.fillRect(graphX, graphY, graphWidth, graphHeight);

      // Draw grid lines
      this.textContext.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      this.textContext.lineWidth = 1;

      // Horizontal grid lines (frame time markers)
      const drawGridLine = (frameTime: number, color: string) => {
        const y = graphY + graphHeight - (frameTime / maxFrameTime) * graphHeight;
        this.textContext!.strokeStyle = color;
        this.textContext!.beginPath();
        this.textContext!.moveTo(graphX, y);
        this.textContext!.lineTo(graphX + graphWidth, y);
        this.textContext!.stroke();
      };

      drawGridLine(targetFrameTime60, 'rgba(0, 255, 0, 0.5)'); // 60 FPS - green
      drawGridLine(targetFrameTime30, 'rgba(255, 255, 0, 0.5)'); // 30 FPS - yellow

      // Draw frame time graph
      this.textContext.strokeStyle = 'rgba(255, 100, 100, 0.9)';
      this.textContext.lineWidth = 2;
      this.textContext.beginPath();

      const stepX = graphWidth / Math.max(this.frameTimeHistory.length - 1, 1);

      for (let i = 0; i < this.frameTimeHistory.length; i++) {
        const frameTime = this.frameTimeHistory[i];
        const x = graphX + i * stepX;
        const y = graphY + graphHeight - (frameTime / maxFrameTime) * graphHeight;

        if (i === 0) {
          this.textContext.moveTo(x, y);
        } else {
          this.textContext.lineTo(x, y);
        }
      }

      this.textContext.stroke();

      // Draw labels
      this.textContext.fillStyle = 'rgba(255, 255, 255, 0.9)';
      this.textContext.font = '11px monospace';
      this.textContext.fillText('Frame Time (ms)', graphX + 5, graphY + 12);
      this.textContext.fillText(`Max: ${maxFrameTime.toFixed(1)}ms`, graphX + 5, graphY + 25);
      this.textContext.fillText('60 FPS', graphX + graphWidth - 50, graphY + graphHeight - (targetFrameTime60 / maxFrameTime) * graphHeight - 5);
      this.textContext.fillText('30 FPS', graphX + graphWidth - 50, graphY + graphHeight - (targetFrameTime30 / maxFrameTime) * graphHeight - 5);
    }
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
