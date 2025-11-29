/**
 * Bloom Post-Processing Pass
 *
 * Implements high-quality bloom effect with:
 * - HDR threshold extraction
 * - Dual-kawase blur (fast, high quality)
 * - Progressive downsampling/upsampling
 * - Configurable intensity and threshold
 *
 * @module BloomPass
 */

import { Logger } from '../../core/Logger';

const logger = Logger.create('BloomPass');

/**
 * Bloom pass quality presets.
 */
export enum BloomPassQuality {
  /** Low quality - 3 mip levels */
  Low = 'low',
  /** Medium quality - 5 mip levels */
  Medium = 'medium',
  /** High quality - 7 mip levels */
  High = 'high',
}

/**
 * Bloom pass configuration.
 */
export interface BloomPassConfig {
  /** Target resolution width */
  width: number;
  /** Target resolution height */
  height: number;
  /** Brightness threshold for bloom (default: 1.0) */
  threshold?: number;
  /** Soft knee for smooth threshold transition (default: 0.5) */
  softKnee?: number;
  /** Bloom intensity (default: 0.5) */
  intensity?: number;
  /** Quality preset (default: Medium) */
  quality?: BloomPassQuality;
  /** Enable/disable effect (default: true) */
  enabled?: boolean;
}

/**
 * Fullscreen vertex shader
 */
const FULLSCREEN_VERTEX_SHADER = `#version 300 es
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

/**
 * Threshold extraction shader - extracts bright areas
 */
const THRESHOLD_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;
uniform sampler2D u_sceneTexture;
uniform float u_threshold;
uniform float u_softKnee;

layout(location = 0) out vec4 o_color;

void main() {
  vec3 color = texture(u_sceneTexture, v_texcoord).rgb;

  // Calculate luminance
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));

  // Soft threshold with knee
  float knee = u_threshold * u_softKnee;
  float soft = luminance - u_threshold + knee;
  soft = clamp(soft, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 0.0001);

  // Final contribution
  float contribution = max(soft, luminance - u_threshold) / max(luminance, 0.0001);
  contribution = clamp(contribution, 0.0, 1.0);

  o_color = vec4(color * contribution, 1.0);
}
`;

/**
 * Dual-Kawase downsample shader
 */
const DOWNSAMPLE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;
uniform sampler2D u_sourceTexture;
uniform vec2 u_texelSize;

layout(location = 0) out vec4 o_color;

void main() {
  // Dual-kawase downsample (13 tap)
  vec2 uv = v_texcoord;
  vec2 halfPixel = u_texelSize * 0.5;

  vec3 sum = texture(u_sourceTexture, uv).rgb * 4.0;
  sum += texture(u_sourceTexture, uv - halfPixel).rgb;
  sum += texture(u_sourceTexture, uv + halfPixel).rgb;
  sum += texture(u_sourceTexture, uv + vec2(halfPixel.x, -halfPixel.y)).rgb;
  sum += texture(u_sourceTexture, uv + vec2(-halfPixel.x, halfPixel.y)).rgb;

  o_color = vec4(sum / 8.0, 1.0);
}
`;

/**
 * Dual-Kawase upsample shader
 */
const UPSAMPLE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;
uniform sampler2D u_sourceTexture;
uniform vec2 u_texelSize;

layout(location = 0) out vec4 o_color;

void main() {
  // Dual-kawase upsample (9 tap)
  vec2 uv = v_texcoord;
  vec2 halfPixel = u_texelSize * 0.5;
  vec2 pixel = u_texelSize;

  vec3 sum = vec3(0.0);
  sum += texture(u_sourceTexture, uv + vec2(-pixel.x * 2.0, 0.0)).rgb;
  sum += texture(u_sourceTexture, uv + vec2(-pixel.x, pixel.y)).rgb * 2.0;
  sum += texture(u_sourceTexture, uv + vec2(0.0, pixel.y * 2.0)).rgb;
  sum += texture(u_sourceTexture, uv + vec2(pixel.x, pixel.y)).rgb * 2.0;
  sum += texture(u_sourceTexture, uv + vec2(pixel.x * 2.0, 0.0)).rgb;
  sum += texture(u_sourceTexture, uv + vec2(pixel.x, -pixel.y)).rgb * 2.0;
  sum += texture(u_sourceTexture, uv + vec2(0.0, -pixel.y * 2.0)).rgb;
  sum += texture(u_sourceTexture, uv + vec2(-pixel.x, -pixel.y)).rgb * 2.0;

  o_color = vec4(sum / 12.0, 1.0);
}
`;

/**
 * Composite shader - blends bloom with original scene
 */
const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;
uniform sampler2D u_sceneTexture;
uniform sampler2D u_bloomTexture;
uniform float u_intensity;

layout(location = 0) out vec4 o_color;

void main() {
  vec3 scene = texture(u_sceneTexture, v_texcoord).rgb;
  vec3 bloom = texture(u_bloomTexture, v_texcoord).rgb;

  // Additive blend with intensity control
  vec3 result = scene + bloom * u_intensity;

  o_color = vec4(result, 1.0);
}
`;

/**
 * Bloom post-processing pass.
 *
 * Extracts bright areas, blurs them progressively, and composites back.
 * Standalone class (not extending RenderPass) for direct WebGL2 usage.
 */
export class BloomPass {
  private config: Required<BloomPassConfig>;
  private gl: WebGL2RenderingContext | null = null;
  private initialized: boolean = false;
  public readonly name: string = 'BloomPass';

  // Shaders
  private thresholdProgram: WebGLProgram | null = null;
  private downsampleProgram: WebGLProgram | null = null;
  private upsampleProgram: WebGLProgram | null = null;
  private compositeProgram: WebGLProgram | null = null;

  // Framebuffers and textures for mip chain
  private mipChain: Array<{
    framebuffer: WebGLFramebuffer;
    texture: WebGLTexture;
    width: number;
    height: number;
  }> = [];

  private thresholdFB: WebGLFramebuffer | null = null;
  private thresholdTexture: WebGLTexture | null = null;

  // VAO for fullscreen quad
  private fullscreenVAO: WebGLVertexArrayObject | null = null;

  constructor(config: BloomPassConfig) {
    this.config = {
      width: config.width,
      height: config.height,
      threshold: config.threshold ?? 1.0,
      softKnee: config.softKnee ?? 0.5,
      intensity: config.intensity ?? 0.5,
      quality: config.quality ?? BloomPassQuality.Medium,
      enabled: config.enabled ?? true,
    };

    logger.info(`BloomPass created: ${this.config.quality} quality, threshold=${this.config.threshold}`);
  }

  /**
   * Initialize WebGL resources
   */
  public initialize(gl: WebGL2RenderingContext): void {
    if (this.initialized) return;

    this.gl = gl;

    // Create shaders
    this.thresholdProgram = this.createProgram(gl, FULLSCREEN_VERTEX_SHADER, THRESHOLD_FRAGMENT_SHADER);
    this.downsampleProgram = this.createProgram(gl, FULLSCREEN_VERTEX_SHADER, DOWNSAMPLE_FRAGMENT_SHADER);
    this.upsampleProgram = this.createProgram(gl, FULLSCREEN_VERTEX_SHADER, UPSAMPLE_FRAGMENT_SHADER);
    this.compositeProgram = this.createProgram(gl, FULLSCREEN_VERTEX_SHADER, COMPOSITE_FRAGMENT_SHADER);

    // Create fullscreen VAO
    this.fullscreenVAO = gl.createVertexArray();

    // Create mip chain
    this.createMipChain(gl);

    this.initialized = true;
    logger.info('BloomPass initialized');
  }

  /**
   * Create mip chain for progressive blur
   */
  private createMipChain(gl: WebGL2RenderingContext): void {
    const mipLevels = this.config.quality === BloomPassQuality.High ? 7 :
                      this.config.quality === BloomPassQuality.Low ? 3 : 5;

    // Create threshold buffer
    this.thresholdTexture = this.createTexture(gl, this.config.width / 2, this.config.height / 2);
    this.thresholdFB = this.createFramebuffer(gl, this.thresholdTexture!);

    // Create mip chain (progressive downsample)
    let w = this.config.width / 4;
    let h = this.config.height / 4;

    for (let i = 0; i < mipLevels; i++) {
      const texture = this.createTexture(gl, Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
      const framebuffer = this.createFramebuffer(gl, texture!);

      this.mipChain.push({
        framebuffer: framebuffer!,
        texture: texture!,
        width: Math.max(1, Math.floor(w)),
        height: Math.max(1, Math.floor(h)),
      });

      w /= 2;
      h /= 2;
    }

    logger.debug(`Created ${mipLevels} mip levels for bloom`);
  }

  /**
   * Create a texture for the mip chain
   */
  private createTexture(gl: WebGL2RenderingContext, width: number, height: number): WebGLTexture | null {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  /**
   * Create a framebuffer with attached texture
   */
  private createFramebuffer(gl: WebGL2RenderingContext, texture: WebGLTexture): WebGLFramebuffer | null {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return fb;
  }

  /**
   * Create and compile a shader program
   */
  private createProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram | null {
    const vert = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vert, vertSrc);
    gl.compileShader(vert);
    if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
      logger.error('Vertex shader error:', gl.getShaderInfoLog(vert));
      return null;
    }

    const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(frag, fragSrc);
    gl.compileShader(frag);
    if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
      logger.error('Fragment shader error:', gl.getShaderInfoLog(frag));
      return null;
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      logger.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
    }

    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return program;
  }

  /**
   * Execute bloom pass
   */
  public execute(
    gl: WebGL2RenderingContext,
    sceneTexture: WebGLTexture,
    outputFramebuffer: WebGLFramebuffer | null = null
  ): void {
    if (!this.config.enabled || !this.initialized) return;

    gl.bindVertexArray(this.fullscreenVAO);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // 1. Extract bright areas (threshold)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.thresholdFB);
    gl.viewport(0, 0, this.config.width / 2, this.config.height / 2);
    gl.useProgram(this.thresholdProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.uniform1i(gl.getUniformLocation(this.thresholdProgram!, 'u_sceneTexture'), 0);
    gl.uniform1f(gl.getUniformLocation(this.thresholdProgram!, 'u_threshold'), this.config.threshold);
    gl.uniform1f(gl.getUniformLocation(this.thresholdProgram!, 'u_softKnee'), this.config.softKnee);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. Progressive downsample
    gl.useProgram(this.downsampleProgram);
    let sourceTexture = this.thresholdTexture!;
    let sourceWidth = this.config.width / 2;
    let sourceHeight = this.config.height / 2;

    for (const mip of this.mipChain) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, mip.framebuffer);
      gl.viewport(0, 0, mip.width, mip.height);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      gl.uniform1i(gl.getUniformLocation(this.downsampleProgram!, 'u_sourceTexture'), 0);
      gl.uniform2f(gl.getUniformLocation(this.downsampleProgram!, 'u_texelSize'),
        1.0 / sourceWidth, 1.0 / sourceHeight);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      sourceTexture = mip.texture;
      sourceWidth = mip.width;
      sourceHeight = mip.height;
    }

    // 3. Progressive upsample (accumulate bloom)
    gl.useProgram(this.upsampleProgram);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // Additive

    for (let i = this.mipChain.length - 2; i >= 0; i--) {
      const mip = this.mipChain[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, mip.framebuffer);
      gl.viewport(0, 0, mip.width, mip.height);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.mipChain[i + 1].texture);
      gl.uniform1i(gl.getUniformLocation(this.upsampleProgram!, 'u_sourceTexture'), 0);
      gl.uniform2f(gl.getUniformLocation(this.upsampleProgram!, 'u_texelSize'),
        1.0 / this.mipChain[i + 1].width, 1.0 / this.mipChain[i + 1].height);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.disable(gl.BLEND);

    // 4. Final composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, outputFramebuffer);
    gl.viewport(0, 0, this.config.width, this.config.height);
    gl.useProgram(this.compositeProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram!, 'u_sceneTexture'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mipChain[0].texture);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram!, 'u_bloomTexture'), 1);

    gl.uniform1f(gl.getUniformLocation(this.compositeProgram!, 'u_intensity'), this.config.intensity);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
  }

  /**
   * Set bloom threshold
   */
  public setThreshold(threshold: number): void {
    this.config.threshold = Math.max(0, threshold);
  }

  /**
   * Set bloom intensity
   */
  public setIntensity(intensity: number): void {
    this.config.intensity = Math.max(0, intensity);
  }

  /**
   * Enable/disable bloom
   */
  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Get bloom texture for external use
   */
  public getBloomTexture(): WebGLTexture | null {
    return this.mipChain.length > 0 ? this.mipChain[0].texture : null;
  }

  /**
   * Resize pass resources
   */
  public resize(width: number, height: number): void {
    if (this.config.width === width && this.config.height === height) return;

    this.config.width = width;
    this.config.height = height;

    if (this.gl) {
      // Recreate mip chain
      this.cleanup();
      this.initialized = false;
      this.initialize(this.gl);
    }
  }

  /**
   * Clean up WebGL resources
   */
  public cleanup(): void {
    if (!this.gl) return;

    const gl = this.gl;

    if (this.thresholdFB) gl.deleteFramebuffer(this.thresholdFB);
    if (this.thresholdTexture) gl.deleteTexture(this.thresholdTexture);

    for (const mip of this.mipChain) {
      gl.deleteFramebuffer(mip.framebuffer);
      gl.deleteTexture(mip.texture);
    }
    this.mipChain = [];

    if (this.thresholdProgram) gl.deleteProgram(this.thresholdProgram);
    if (this.downsampleProgram) gl.deleteProgram(this.downsampleProgram);
    if (this.upsampleProgram) gl.deleteProgram(this.upsampleProgram);
    if (this.compositeProgram) gl.deleteProgram(this.compositeProgram);

    if (this.fullscreenVAO) gl.deleteVertexArray(this.fullscreenVAO);

    this.initialized = false;
    logger.debug('BloomPass cleaned up');
  }
}
