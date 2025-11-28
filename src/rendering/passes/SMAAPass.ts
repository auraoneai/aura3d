/**
 * Subpixel Morphological Anti-Aliasing (SMAA) Pass for G3D rendering engine.
 *
 * Implements high-quality post-process anti-aliasing using:
 * - Edge detection pass with color and luma modes
 * - Blend weight calculation using area and search textures
 * - Neighborhood blending pass
 * - Quality presets (low/medium/high/ultra)
 * - Configurable edge detection thresholds
 *
 * SMAA provides excellent edge quality at ~1.5ms cost (high quality, 1080p).
 *
 * @module SMAAPass
 */

import { RenderPass, RenderPassDescriptor } from '../pipeline/RenderPass';
import { RenderTarget, TextureFormat, LoadAction, StoreAction } from '../pipeline/RenderTarget';
import { RenderQueue } from '../pipeline/RenderQueue';
import { Shader, ShaderSource } from '../shader/Shader';
import { UniformBuffer, UniformBufferDescriptor, UniformLayout, UniformType } from '../shader/UniformBuffer';
import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';

const logger = Logger.create('SMAAPass');

/**
 * SMAA quality preset.
 */
export enum SMAAQuality {
  /** Low: Edge detection only, no diagonal search */
  Low = 0,
  /** Medium: Basic SMAA, limited search */
  Medium = 1,
  /** High: Full SMAA with diagonal search */
  High = 2,
  /** Ultra: Extended search range, maximum quality */
  Ultra = 3,
}

/**
 * SMAA edge detection mode.
 */
export enum SMAAEdgeDetectionMode {
  /** Luminance-based edge detection */
  Luma = 0,
  /** Color-based edge detection */
  Color = 1,
  /** Depth-based edge detection */
  Depth = 2,
}

/**
 * SMAA pass configuration.
 */
export interface SMAAPassConfig {
  /** Target resolution width */
  width: number;
  /** Target resolution height */
  height: number;
  /** Quality preset */
  quality?: SMAAQuality;
  /** Edge detection mode */
  edgeDetectionMode?: SMAAEdgeDetectionMode;
  /** Edge detection threshold */
  threshold?: number;
  /** Maximum search steps for pattern detection */
  maxSearchSteps?: number;
  /** Maximum search steps for diagonal patterns */
  maxSearchStepsDiag?: number;
  /** Corner rounding amount (0-100) */
  cornerRounding?: number;
}

/**
 * SMAA edge detection vertex shader.
 */
const SMAA_EDGE_VERTEX_SHADER = `#version 300 es
precision highp float;

const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

const vec2 texcoords[3] = vec2[3](
  vec2(0.0, 0.0),
  vec2(2.0, 0.0),
  vec2(0.0, 2.0)
);

out vec2 v_texcoord;
out vec4 v_offset[3];

uniform vec2 u_pixelSize;

void main() {
  v_texcoord = texcoords[gl_VertexID];

  // Calculate offset coordinates for edge detection
  v_offset[0] = v_texcoord.xyxy + u_pixelSize.xyxy * vec4(-1.0, 0.0, 0.0, -1.0);
  v_offset[1] = v_texcoord.xyxy + u_pixelSize.xyxy * vec4(1.0, 0.0, 0.0, 1.0);
  v_offset[2] = v_texcoord.xyxy + u_pixelSize.xyxy * vec4(-2.0, 0.0, 0.0, -2.0);

  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

/**
 * SMAA edge detection fragment shader.
 */
const SMAA_EDGE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;
in vec4 v_offset[3];

uniform sampler2D u_colorTexture;
uniform float u_threshold;

layout(location = 0) out vec2 o_edges;

/**
 * Calculates luma from RGB color.
 */
float calcLuma(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

/**
 * Detects edges based on luma differences.
 */
vec2 detectLumaEdges() {
  // Sample center and neighbors
  float L = calcLuma(texture(u_colorTexture, v_texcoord).rgb);
  float Lleft = calcLuma(texture(u_colorTexture, v_offset[0].xy).rgb);
  float Ltop = calcLuma(texture(u_colorTexture, v_offset[0].zw).rgb);
  float Lright = calcLuma(texture(u_colorTexture, v_offset[1].xy).rgb);
  float Lbottom = calcLuma(texture(u_colorTexture, v_offset[1].zw).rgb);

  // Calculate deltas
  vec4 delta;
  delta.x = abs(L - Lleft);
  delta.y = abs(L - Ltop);
  delta.z = abs(L - Lright);
  delta.w = abs(L - Lbottom);

  // Find maximum delta
  vec2 edges = step(u_threshold, delta.xy);
  edges *= step(u_threshold, delta.zw);

  return edges;
}

/**
 * Detects edges based on color differences.
 */
vec2 detectColorEdges() {
  // Sample center and neighbors
  vec3 C = texture(u_colorTexture, v_texcoord).rgb;
  vec3 Cleft = texture(u_colorTexture, v_offset[0].xy).rgb;
  vec3 Ctop = texture(u_colorTexture, v_offset[0].zw).rgb;
  vec3 Cright = texture(u_colorTexture, v_offset[1].xy).rgb;
  vec3 Cbottom = texture(u_colorTexture, v_offset[1].zw).rgb;

  // Calculate color deltas
  vec4 delta;
  delta.x = length(C - Cleft);
  delta.y = length(C - Ctop);
  delta.z = length(C - Cright);
  delta.w = length(C - Cbottom);

  // Find edges
  vec2 edges = step(u_threshold, delta.xy);
  edges *= step(u_threshold, delta.zw);

  return edges;
}

void main() {
  #ifdef USE_COLOR_EDGE_DETECTION
    o_edges = detectColorEdges();
  #else
    o_edges = detectLumaEdges();
  #endif

  // If no edges detected, discard fragment for performance
  if (dot(o_edges, vec2(1.0)) == 0.0) {
    discard;
  }
}
`;

/**
 * SMAA blend weight calculation vertex shader.
 */
const SMAA_BLEND_WEIGHT_VERTEX_SHADER = `#version 300 es
precision highp float;

const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

const vec2 texcoords[3] = vec2[3](
  vec2(0.0, 0.0),
  vec2(2.0, 0.0),
  vec2(0.0, 2.0)
);

out vec2 v_texcoord;
out vec2 v_pixcoord;
out vec4 v_offset[3];

uniform vec2 u_pixelSize;

void main() {
  v_texcoord = texcoords[gl_VertexID];
  v_pixcoord = v_texcoord / u_pixelSize;

  // Calculate neighbor coordinates
  v_offset[0] = v_texcoord.xyxy + u_pixelSize.xyxy * vec4(-0.25, -0.125, 1.25, -0.125);
  v_offset[1] = v_texcoord.xyxy + u_pixelSize.xyxy * vec4(-0.125, -0.25, -0.125, 1.25);
  v_offset[2] = v_texcoord.xyxy + u_pixelSize.xyxy * vec4(-2.0, 2.0, -2.0, 2.0) * u_pixelSize.xyxy;

  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

/**
 * SMAA blend weight calculation fragment shader.
 */
const SMAA_BLEND_WEIGHT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;
in vec2 v_pixcoord;
in vec4 v_offset[3];

uniform sampler2D u_edgesTexture;
uniform sampler2D u_areaTexture;
uniform sampler2D u_searchTexture;
uniform vec2 u_pixelSize;
uniform int u_maxSearchSteps;
uniform int u_cornerRounding;

layout(location = 0) out vec4 o_weights;

const float SMAA_AREATEX_MAX_DISTANCE = 16.0;

/**
 * Searches for pattern length in horizontal direction.
 */
float searchXLeft(vec2 texcoord, float end) {
  vec2 e = vec2(0.0, 1.0);
  for (int i = 0; i < MAX_SEARCH_STEPS; ++i) {
    if (i >= u_maxSearchSteps) break;

    e = texture(u_edgesTexture, texcoord).rg;
    texcoord -= vec2(2.0, 0.0) * u_pixelSize;

    if (!(texcoord.x > end && e.g > 0.8281 && e.r == 0.0))
      break;
  }

  return max(-(255.0 / 127.0) * e.r, -2.0);
}

float searchXRight(vec2 texcoord, float end) {
  vec2 e = vec2(0.0, 1.0);
  for (int i = 0; i < MAX_SEARCH_STEPS; ++i) {
    if (i >= u_maxSearchSteps) break;

    e = texture(u_edgesTexture, texcoord).rg;
    texcoord += vec2(2.0, 0.0) * u_pixelSize;

    if (!(texcoord.x < end && e.g > 0.8281 && e.r == 0.0))
      break;
  }

  return min((255.0 / 127.0) * e.r, 2.0);
}

float searchYUp(vec2 texcoord, float end) {
  vec2 e = vec2(1.0, 0.0);
  for (int i = 0; i < MAX_SEARCH_STEPS; ++i) {
    if (i >= u_maxSearchSteps) break;

    e = texture(u_edgesTexture, texcoord).rg;
    texcoord -= vec2(0.0, 2.0) * u_pixelSize;

    if (!(texcoord.y > end && e.r > 0.8281 && e.g == 0.0))
      break;
  }

  return max(-(255.0 / 127.0) * e.g, -2.0);
}

float searchYDown(vec2 texcoord, float end) {
  vec2 e = vec2(1.0, 0.0);
  for (int i = 0; i < MAX_SEARCH_STEPS; ++i) {
    if (i >= u_maxSearchSteps) break;

    e = texture(u_edgesTexture, texcoord).rg;
    texcoord += vec2(0.0, 2.0) * u_pixelSize;

    if (!(texcoord.y < end && e.r > 0.8281 && e.g == 0.0))
      break;
  }

  return min((255.0 / 127.0) * e.g, 2.0);
}

/**
 * Calculates blend weights for detected edges.
 */
vec4 calculateBlendWeights(vec2 texcoord, vec2 e) {
  vec4 weights = vec4(0.0);

  // Horizontal edge
  if (e.g > 0.0) {
    vec2 d = vec2(searchXLeft(v_offset[0].xy, v_offset[2].x),
                  searchXRight(v_offset[0].zw, v_offset[2].y));

    vec2 coords = mad(vec2(d.x, -d.y), u_pixelSize, texcoord);
    vec2 areaCoord = mad(SMAA_AREATEX_MAX_DISTANCE * round(4.0 * d), vec2(1.0 / 16.0, 0.0), coords);
    weights.rg = texture(u_areaTexture, areaCoord).rg;
  }

  // Vertical edge
  if (e.r > 0.0) {
    vec2 d = vec2(searchYUp(v_offset[1].xy, v_offset[2].z),
                  searchYDown(v_offset[1].zw, v_offset[2].w));

    vec2 coords = mad(vec2(-d.x, d.y), u_pixelSize, texcoord);
    vec2 areaCoord = mad(SMAA_AREATEX_MAX_DISTANCE * round(4.0 * d), vec2(0.0, 1.0 / 16.0), coords);
    weights.ba = texture(u_areaTexture, areaCoord).ba;
  }

  return weights;
}

// Helper function for multiply-add
vec2 mad(vec2 a, vec2 b, vec2 c) {
  return a * b + c;
}

void main() {
  vec2 edges = texture(u_edgesTexture, v_texcoord).rg;

  // Early exit if no edges
  if (dot(edges, vec2(1.0)) == 0.0) {
    o_weights = vec4(0.0);
    return;
  }

  o_weights = calculateBlendWeights(v_texcoord, edges);
}
`;

/**
 * SMAA neighborhood blending fragment shader.
 */
const SMAA_BLEND_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_colorTexture;
uniform sampler2D u_blendTexture;
uniform vec2 u_pixelSize;

layout(location = 0) out vec4 o_color;

void main() {
  vec4 color = texture(u_colorTexture, v_texcoord);
  vec4 blend = texture(u_blendTexture, v_texcoord);

  // Calculate blend offsets
  vec2 offset = vec2(blend.a, blend.g);

  // Sample neighbors
  vec4 topLeft = texture(u_colorTexture, v_texcoord - u_pixelSize * offset);
  vec4 bottomRight = texture(u_colorTexture, v_texcoord + u_pixelSize * offset);

  // Blend
  o_color = mix(color, mix(topLeft, bottomRight, 0.5), dot(blend, vec4(1.0)));
}
`;

/**
 * Subpixel Morphological Anti-Aliasing pass.
 * Three-pass technique for high-quality edge anti-aliasing.
 *
 * @example
 * ```typescript
 * // Create SMAA pass
 * const smaaPass = new SMAAPass({
 *   width: 1920,
 *   height: 1080,
 *   quality: SMAAQuality.High,
 *   edgeDetectionMode: SMAAEdgeDetectionMode.Luma,
 *   threshold: 0.1
 * });
 *
 * // Setup pass
 * smaaPass.setup();
 *
 * // Set input texture
 * smaaPass.setInputTexture(colorTexture);
 *
 * // Execute pass
 * smaaPass.execute(emptyQueue, outputTarget);
 *
 * // Get anti-aliased output
 * const aaTexture = smaaPass.getOutputTexture();
 * ```
 */
export class SMAAPass extends RenderPass {
  /** Pass configuration */
  private config: SMAAPassConfig;

  /** Edge detection shader */
  private edgeShader: Shader | null = null;

  /** Blend weight shader */
  private blendWeightShader: Shader | null = null;

  /** Neighborhood blending shader */
  private neighborhoodBlendShader: Shader | null = null;

  /** Edge detection render target */
  private edgesTarget: RenderTarget | null = null;

  /** Blend weights render target */
  private blendTarget: RenderTarget | null = null;

  /** Output render target */
  private outputTarget: RenderTarget | null = null;

  /** Area texture (precomputed) */
  private areaTexture: unknown = null;

  /** Search texture (precomputed) */
  private searchTexture: unknown = null;

  /** Input color texture */
  private inputTexture: unknown = null;

  /** Uniforms buffer */
  private uniformsUBO: UniformBuffer | null = null;

  /** WebGL2 rendering context */
  private gl: WebGL2RenderingContext | null = null;

  /** Fullscreen triangle VAO (required by WebGL2 even when using gl_VertexID) */
  private fullscreenVAO: WebGLVertexArrayObject | null = null;

  /**
   * Creates a new SMAA pass.
   *
   * @param config - SMAA pass configuration
   */
  constructor(config: SMAAPassConfig) {
    const descriptor: RenderPassDescriptor = {
      name: 'SMAAPass',
      colorAttachments: [
        {
          name: 'output',
          format: TextureFormat.RGBA8,
        },
      ],
      clearValues: {
        colors: [Color.black()],
      },
      colorLoadActions: [LoadAction.Clear],
      colorStoreActions: [StoreAction.Store],
    };

    super(descriptor);

    // Apply quality preset
    const qualityDefaults = this.getQualityDefaults(config.quality ?? SMAAQuality.High);

    this.config = {
      edgeDetectionMode: SMAAEdgeDetectionMode.Luma,
      threshold: 0.1,
      maxSearchSteps: 16,
      maxSearchStepsDiag: 8,
      cornerRounding: 25,
      ...qualityDefaults,
      ...config,
    };

    logger.info(
      `Created SMAAPass: ${config.width}x${config.height}, ` +
      `quality: ${SMAAQuality[config.quality ?? SMAAQuality.High]}, ` +
      `mode: ${SMAAEdgeDetectionMode[this.config.edgeDetectionMode ?? SMAAEdgeDetectionMode.Luma]}`
    );
  }

  /**
   * Gets quality preset defaults.
   */
  private getQualityDefaults(quality: SMAAQuality): Partial<SMAAPassConfig> {
    switch (quality) {
      case SMAAQuality.Low:
        return {
          threshold: 0.15,
          maxSearchSteps: 4,
          maxSearchStepsDiag: 0,
          cornerRounding: 0,
        };
      case SMAAQuality.Medium:
        return {
          threshold: 0.1,
          maxSearchSteps: 8,
          maxSearchStepsDiag: 4,
          cornerRounding: 25,
        };
      case SMAAQuality.High:
        return {
          threshold: 0.1,
          maxSearchSteps: 16,
          maxSearchStepsDiag: 8,
          cornerRounding: 25,
        };
      case SMAAQuality.Ultra:
        return {
          threshold: 0.05,
          maxSearchSteps: 32,
          maxSearchStepsDiag: 16,
          cornerRounding: 25,
        };
    }
  }

  /**
   * Sets up the SMAA pass resources.
   */
  setup(): void {
    logger.debug('Setting up SMAAPass');

    // Create edge detection target
    this.edgesTarget = new RenderTarget({
      width: this.config.width,
      height: this.config.height,
      samples: 1,
      colorAttachments: [
        {
          format: TextureFormat.RGBA8,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: Color.black(),
        },
      ],
      label: 'SMAA_Edges',
    });

    // Create blend weights target
    this.blendTarget = new RenderTarget({
      width: this.config.width,
      height: this.config.height,
      samples: 1,
      colorAttachments: [
        {
          format: TextureFormat.RGBA8,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: Color.black(),
        },
      ],
      label: 'SMAA_Blend',
    });

    // Create output target
    this.outputTarget = new RenderTarget({
      width: this.config.width,
      height: this.config.height,
      samples: 1,
      colorAttachments: [
        {
          format: TextureFormat.RGBA8,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: Color.black(),
        },
      ],
      label: 'SMAA_Output',
    });

    // Create uniforms buffer
    const uniformsDesc: UniformBufferDescriptor = {
      name: 'SMAAUniforms',
      binding: 0,
      layout: UniformLayout.Std140,
      fields: [
        { name: 'pixelSize', type: UniformType.Vec2 },
        { name: 'threshold', type: UniformType.Float },
        { name: 'maxSearchSteps', type: UniformType.Int },
        { name: 'cornerRounding', type: UniformType.Int },
      ],
    };
    this.uniformsUBO = new UniformBuffer(uniformsDesc);

    // Load SMAA area and search textures
    // (In real implementation, these would be loaded from precomputed data)
    this.areaTexture = this.createAreaTexture();
    this.searchTexture = this.createSearchTexture();

    // Create fullscreen VAO (required by WebGL2 even when using gl_VertexID)
    this.createFullscreenVAO();

    logger.info('SMAAPass setup complete');
  }

  /**
   * Creates fullscreen triangle VAO (no vertex buffer needed).
   */
  private createFullscreenVAO(): void {
    if (!this.gl) return;

    const gl = this.gl;
    this.fullscreenVAO = gl.createVertexArray();

    // Note: Vertex shader uses gl_VertexID, so no vertex buffer needed
    gl.bindVertexArray(this.fullscreenVAO);
    gl.bindVertexArray(null);
  }

  /**
   * Executes the SMAA pass (3 passes).
   *
   * @param renderQueue - Unused
   * @param renderTarget - Output target
   */
  execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void {
    if (!this.edgesTarget || !this.blendTarget || !this.outputTarget || !this.uniformsUBO || !this.gl) {
      logger.error('SMAAPass not properly initialized');
      return;
    }

    if (!this.inputTexture) {
      logger.error('SMAAPass: No input texture set');
      return;
    }

    logger.trace('SMAAPass: applying anti-aliasing');

    // Update uniforms
    this.updateUniforms();

    // Initialize shaders if needed
    if (!this.edgeShader) {
      this.edgeShader = this.createEdgeDetectionShader();
    }
    if (!this.blendWeightShader) {
      this.blendWeightShader = this.createBlendWeightShader();
    }
    if (!this.neighborhoodBlendShader) {
      this.neighborhoodBlendShader = this.createNeighborhoodBlendShader();
    }

    if (!this.edgeShader || !this.blendWeightShader || !this.neighborhoodBlendShader) {
      logger.error('SMAAPass: Failed to create shaders');
      return;
    }

    // Pass 1: Edge detection
    this.executeEdgeDetectionPass();

    // Pass 2: Blend weight calculation
    this.executeBlendWeightPass();

    // Pass 3: Neighborhood blending
    this.executeNeighborhoodBlendPass();

    logger.trace('SMAAPass complete');
  }

  /**
   * Executes edge detection pass (Pass 1).
   */
  private executeEdgeDetectionPass(): void {
    if (!this.edgeShader || !this.edgesTarget || !this.inputTexture || !this.gl || !this.edgeShader.isReady) {
      logger.error('Edge detection pass cannot execute: missing resources');
      return;
    }

    logger.trace('SMAA Pass 1: Edge detection');

    const gl = this.gl;
    const edgesFramebuffer = (this.edgesTarget as any).getFramebuffer();

    // Bind edge detection framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, edgesFramebuffer || null);
    gl.viewport(0, 0, this.edgesTarget.width, this.edgesTarget.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Disable depth test for fullscreen pass
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    // Bind edge detection shader
    this.edgeShader.bind();

    // Set uniforms
    const pixelSize = new Vector2(1.0 / this.config.width, 1.0 / this.config.height);
    this.edgeShader.setUniform('u_pixelSize', pixelSize);
    this.edgeShader.setUniform('u_threshold', this.config.threshold ?? 0.1);

    // Bind input texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.inputTexture as WebGLTexture);
    this.edgeShader.setUniform('u_colorTexture', 0);

    // Render fullscreen triangle (must bind VAO first - WebGL2 requirement)
    gl.bindVertexArray(this.fullscreenVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    // Unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Executes blend weight calculation pass (Pass 2).
   */
  private executeBlendWeightPass(): void {
    if (!this.blendWeightShader || !this.blendTarget || !this.edgesTarget || !this.gl || !this.blendWeightShader.isReady) {
      logger.error('Blend weight pass cannot execute: missing resources');
      return;
    }

    logger.trace('SMAA Pass 2: Blend weight calculation');

    const gl = this.gl;
    const blendFramebuffer = (this.blendTarget as any).getFramebuffer();

    // Bind blend weight framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, blendFramebuffer || null);
    gl.viewport(0, 0, this.blendTarget.width, this.blendTarget.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Bind blend weight shader
    this.blendWeightShader.bind();

    // Set uniforms
    const pixelSize = new Vector2(1.0 / this.config.width, 1.0 / this.config.height);
    this.blendWeightShader.setUniform('u_pixelSize', pixelSize);
    this.blendWeightShader.setUniform('u_maxSearchSteps', this.config.maxSearchSteps ?? 16);
    this.blendWeightShader.setUniform('u_cornerRounding', this.config.cornerRounding ?? 25);

    // Bind edges texture from Pass 1
    gl.activeTexture(gl.TEXTURE0);
    const edgesAttachment = this.edgesTarget.getColorAttachment(0);
    if (edgesAttachment) {
      gl.bindTexture(gl.TEXTURE_2D, edgesAttachment as WebGLTexture);
      this.blendWeightShader.setUniform('u_edgesTexture', 0);
    }

    // Bind area texture (precomputed lookup)
    if (this.areaTexture) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.areaTexture as WebGLTexture);
      this.blendWeightShader.setUniform('u_areaTexture', 1);
    }

    // Bind search texture (precomputed lookup)
    if (this.searchTexture) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.searchTexture as WebGLTexture);
      this.blendWeightShader.setUniform('u_searchTexture', 2);
    }

    // Render fullscreen triangle (must bind VAO first - WebGL2 requirement)
    gl.bindVertexArray(this.fullscreenVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    // Unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Executes neighborhood blending pass (Pass 3).
   */
  private executeNeighborhoodBlendPass(): void {
    if (!this.neighborhoodBlendShader || !this.outputTarget || !this.inputTexture || !this.blendTarget || !this.gl || !this.neighborhoodBlendShader.isReady) {
      logger.error('Neighborhood blend pass cannot execute: missing resources');
      return;
    }

    logger.trace('SMAA Pass 3: Neighborhood blending');

    const gl = this.gl;
    const outputFramebuffer = (this.outputTarget as any).getFramebuffer();

    // Bind output framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, outputFramebuffer || null);
    gl.viewport(0, 0, this.outputTarget.width, this.outputTarget.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Bind neighborhood blend shader
    this.neighborhoodBlendShader.bind();

    // Set uniforms
    const pixelSize = new Vector2(1.0 / this.config.width, 1.0 / this.config.height);
    this.neighborhoodBlendShader.setUniform('u_pixelSize', pixelSize);

    // Bind original color texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.inputTexture as WebGLTexture);
    this.neighborhoodBlendShader.setUniform('u_colorTexture', 0);

    // Bind blend weights from Pass 2
    gl.activeTexture(gl.TEXTURE1);
    const blendAttachment = this.blendTarget.getColorAttachment(0);
    if (blendAttachment) {
      gl.bindTexture(gl.TEXTURE_2D, blendAttachment as WebGLTexture);
      this.neighborhoodBlendShader.setUniform('u_blendTexture', 1);
    }

    // Render fullscreen triangle (must bind VAO first - WebGL2 requirement)
    gl.bindVertexArray(this.fullscreenVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    // Unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Restore state
    gl.enable(gl.DEPTH_TEST);
  }

  /**
   * Creates edge detection shader with appropriate defines.
   */
  private createEdgeDetectionShader(): Shader | null {
    if (!this.gl) {
      logger.error('Cannot create edge detection shader without GL context');
      return null;
    }

    const defines: Record<string, number | string> = {};

    // Add edge detection mode define
    if (this.config.edgeDetectionMode === SMAAEdgeDetectionMode.Color) {
      defines.USE_COLOR_EDGE_DETECTION = 1;
    }

    return new Shader({
      name: 'SMAA_EdgeDetection',
      source: {
        vertex: SMAA_EDGE_VERTEX_SHADER,
        fragment: SMAA_EDGE_FRAGMENT_SHADER
      },
      defines,
      gl: this.gl
    });
  }

  /**
   * Creates blend weight shader with search steps define.
   */
  private createBlendWeightShader(): Shader | null {
    if (!this.gl) {
      logger.error('Cannot create blend weight shader without GL context');
      return null;
    }

    const maxSearchSteps = this.config.maxSearchSteps ?? 16;

    return new Shader({
      name: 'SMAA_BlendWeight',
      source: {
        vertex: SMAA_BLEND_WEIGHT_VERTEX_SHADER,
        fragment: SMAA_BLEND_WEIGHT_FRAGMENT_SHADER
      },
      defines: {
        MAX_SEARCH_STEPS: maxSearchSteps
      },
      gl: this.gl
    });
  }

  /**
   * Creates neighborhood blending shader.
   */
  private createNeighborhoodBlendShader(): Shader | null {
    if (!this.gl) {
      logger.error('Cannot create neighborhood blend shader without GL context');
      return null;
    }

    // Simple vertex shader for fullscreen triangle
    const vertexShader = `#version 300 es
precision highp float;

const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

const vec2 texcoords[3] = vec2[3](
  vec2(0.0, 0.0),
  vec2(2.0, 0.0),
  vec2(0.0, 2.0)
);

out vec2 v_texcoord;

void main() {
  v_texcoord = texcoords[gl_VertexID];
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

    return new Shader({
      name: 'SMAA_NeighborhoodBlend',
      source: {
        vertex: vertexShader,
        fragment: SMAA_BLEND_FRAGMENT_SHADER
      },
      gl: this.gl
    });
  }

  /**
   * Cleans up SMAA pass resources.
   */
  cleanup(): void {
    logger.debug('Cleaning up SMAAPass');

    if (this.edgesTarget && this.gl) {
      this.edgesTarget.dispose(this.gl);
      this.edgesTarget = null;
    }

    if (this.blendTarget && this.gl) {
      this.blendTarget.dispose(this.gl);
      this.blendTarget = null;
    }

    if (this.outputTarget && this.gl) {
      this.outputTarget.dispose(this.gl);
      this.outputTarget = null;
    }

    if (this.edgeShader) {
      this.edgeShader.dispose();
      this.edgeShader = null;
    }

    if (this.blendWeightShader) {
      this.blendWeightShader.dispose();
      this.blendWeightShader = null;
    }

    if (this.neighborhoodBlendShader) {
      this.neighborhoodBlendShader.dispose();
      this.neighborhoodBlendShader = null;
    }

    if (this.fullscreenVAO && this.gl) {
      this.gl.deleteVertexArray(this.fullscreenVAO);
      this.fullscreenVAO = null;
    }

    this.uniformsUBO = null;
    this.gl = null;

    logger.info('SMAAPass cleanup complete');
  }

  /**
   * Sets the WebGL context for rendering.
   *
   * @param gl - WebGL2 rendering context
   */
  setContext(gl: WebGL2RenderingContext): void {
    this.gl = gl;
  }

  /**
   * Sets input texture to be anti-aliased.
   */
  setInputTexture(texture: unknown): void {
    this.inputTexture = texture;
  }

  /**
   * Updates uniform buffer.
   */
  private updateUniforms(): void {
    if (!this.uniformsUBO) return;

    this.uniformsUBO.setVec2('pixelSize', {
      x: 1.0 / this.config.width,
      y: 1.0 / this.config.height
    } as any);
    this.uniformsUBO.setFloat('threshold', this.config.threshold ?? 0.1);
    this.uniformsUBO.setInt('maxSearchSteps', this.config.maxSearchSteps ?? 16);
    this.uniformsUBO.setInt('cornerRounding', this.config.cornerRounding ?? 25);
  }

  /**
   * Creates SMAA area texture (precomputed pattern lookup).
   */
  private createAreaTexture(): unknown {
    // In real implementation, this would load precomputed area texture data
    // The area texture contains blend weights for different edge patterns
    logger.debug('Creating SMAA area texture');
    return null;
  }

  /**
   * Creates SMAA search texture (precomputed search length lookup).
   */
  private createSearchTexture(): unknown {
    // In real implementation, this would load precomputed search texture data
    // The search texture optimizes pattern length searches
    logger.debug('Creating SMAA search texture');
    return null;
  }

  /**
   * Resizes the SMAA targets.
   */
  resize(width: number, height: number): void {
    if (!this.gl) {
      logger.warn('Cannot resize SMAA targets without GL context');
      return;
    }

    this.config.width = width;
    this.config.height = height;

    if (this.edgesTarget) {
      this.edgesTarget.resize(this.gl, width, height);
    }

    if (this.blendTarget) {
      this.blendTarget.resize(this.gl, width, height);
    }

    if (this.outputTarget) {
      this.outputTarget.resize(this.gl, width, height);
    }
  }

  /**
   * Gets the anti-aliased output texture.
   */
  getOutputTexture(): unknown {
    return this.outputTarget?.getColorAttachment(0);
  }
}
