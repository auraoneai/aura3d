/**
 * G3D 5.0 - TAAPassController
 *
 * Temporal Anti-Aliasing (TAA) configuration controller.
 * Manages jitter patterns, history buffers, and temporal accumulation settings.
 *
 * @module postfx/TAAPassController
 */

import type { PostProcessEffect, RenderContext } from './PostProcessChain';
import { Vector2 } from '../math/Vector2';
import { logger } from '../core/Logger';

/**
 * Jitter pattern for TAA sampling
 */
export type JitterPattern = 'halton' | 'r2' | 'random' | 'uniform';

/**
 * TAA configuration settings
 */
export interface TAASettings {
  /**
   * Jitter pattern for sub-pixel sampling
   */
  jitterPattern: JitterPattern;

  /**
   * Temporal feedback factor (0-1, higher = more history)
   */
  feedbackFactor: number;

  /**
   * Sharpness to compensate for TAA blur (0-1)
   */
  sharpness: number;

  /**
   * Enable velocity rejection for moving objects
   */
  velocityRejection: boolean;

  /**
   * Enable variance clipping to reduce ghosting
   */
  varianceClipping: boolean;

  /**
   * Clipping gamma for variance clipping
   */
  clippingGamma: number;

  /**
   * Maximum sample count for jitter pattern
   */
  maxSamples: number;
}

/**
 * TAA quality presets
 */
export interface TAAPreset {
  name: string;
  settings: TAASettings;
}

/**
 * Halton sequence generator for jitter patterns
 */
class HaltonSequence {
  private index = 0;

  constructor(private base: number) {}

  public next(): number {
    let f = 1;
    let r = 0;
    let i = this.index++;

    while (i > 0) {
      f = f / this.base;
      r = r + f * (i % this.base);
      i = Math.floor(i / this.base);
    }

    return r;
  }

  public reset(): void {
    this.index = 0;
  }
}

/**
 * R2 sequence generator for jitter patterns
 */
class R2Sequence {
  private index = 0;
  private readonly g = 1.32471795724474602596; // Plastic constant
  private readonly a1 = 1.0 / this.g;
  private readonly a2 = 1.0 / (this.g * this.g);

  public next(): Vector2 {
    const jitter = new Vector2(
      (0.5 + this.a1 * this.index) % 1.0,
      (0.5 + this.a2 * this.index) % 1.0
    );
    this.index++;
    return jitter;
  }

  public reset(): void {
    this.index = 0;
  }
}

/**
 * Temporal Anti-Aliasing controller
 */
export class TAAPassController implements PostProcessEffect {
  public readonly name = 'TAA';
  public order = 100; // Early in chain
  public enabled = true;

  private settings: TAASettings = {
    jitterPattern: 'halton',
    feedbackFactor: 0.9,
    sharpness: 0.3,
    velocityRejection: true,
    varianceClipping: true,
    clippingGamma: 1.0,
    maxSamples: 16,
  };

  // Jitter generators
  private haltonX: HaltonSequence = new HaltonSequence(2);
  private haltonY: HaltonSequence = new HaltonSequence(3);
  private r2Sequence: R2Sequence = new R2Sequence();
  private currentJitter = new Vector2(0, 0);
  private frameIndex = 0;

  // GPU resources
  private device: any = null;
  private gl: WebGL2RenderingContext | null = null;
  private historyTexture: any = null;
  private velocityTexture: any = null;
  private depthTexture: any = null;
  private outputTexture: any = null;

  private width = 0;
  private height = 0;
  private needsReset = true;

  /**
   * Predefined quality presets
   */
  public static readonly PRESETS: Record<string, TAAPreset> = {
    low: {
      name: 'Low Quality',
      settings: {
        jitterPattern: 'uniform',
        feedbackFactor: 0.85,
        sharpness: 0.2,
        velocityRejection: false,
        varianceClipping: true,
        clippingGamma: 1.0,
        maxSamples: 8,
      },
    },

    medium: {
      name: 'Medium Quality',
      settings: {
        jitterPattern: 'halton',
        feedbackFactor: 0.9,
        sharpness: 0.3,
        velocityRejection: true,
        varianceClipping: true,
        clippingGamma: 1.0,
        maxSamples: 16,
      },
    },

    high: {
      name: 'High Quality',
      settings: {
        jitterPattern: 'r2',
        feedbackFactor: 0.95,
        sharpness: 0.4,
        velocityRejection: true,
        varianceClipping: true,
        clippingGamma: 1.1,
        maxSamples: 32,
      },
    },

    cinematic: {
      name: 'Cinematic',
      settings: {
        jitterPattern: 'halton',
        feedbackFactor: 0.97,
        sharpness: 0.5,
        velocityRejection: true,
        varianceClipping: true,
        clippingGamma: 1.2,
        maxSamples: 64,
      },
    },
  };

  constructor(settings?: Partial<TAASettings>) {
    if (settings) {
      this.applySettings(settings);
    }
  }

  /**
   * Initialize TAA resources
   */
  public initialize(device: any): void {
    this.device = device;
    // Extract WebGL2 context from device if available
    if (device && device.gl) {
      this.gl = device.gl;
    } else if (device instanceof WebGL2RenderingContext) {
      this.gl = device;
    }
  }

  /**
   * Execute TAA pass
   */
  public execute(context: RenderContext): void {
    if (!this.device || !this.enabled) {
      return;
    }

    // Update jitter for this frame
    this.updateJitter();

    // Apply jitter to camera projection
    this.applyJitterToCamera(context.camera);

    // Render scene with jittered camera (happens outside this controller)

    // Perform temporal accumulation
    this.performTemporalAccumulation(context);

    // Increment frame counter
    this.frameIndex++;
  }

  /**
   * Set jitter pattern
   */
  public setJitterPattern(pattern: JitterPattern): void {
    if (this.settings.jitterPattern !== pattern) {
      this.settings.jitterPattern = pattern;
      this.resetJitter();
    }
  }

  /**
   * Get current jitter pattern
   */
  public getJitterPattern(): JitterPattern {
    return this.settings.jitterPattern;
  }

  /**
   * Set feedback factor
   */
  public setFeedbackFactor(factor: number): void {
    this.settings.feedbackFactor = Math.max(0, Math.min(1, factor));
  }

  /**
   * Get feedback factor
   */
  public getFeedbackFactor(): number {
    return this.settings.feedbackFactor;
  }

  /**
   * Set sharpness
   */
  public setSharpness(sharpness: number): void {
    this.settings.sharpness = Math.max(0, Math.min(1, sharpness));
  }

  /**
   * Get sharpness
   */
  public getSharpness(): number {
    return this.settings.sharpness;
  }

  /**
   * Enable/disable velocity rejection
   */
  public setVelocityRejection(enabled: boolean): void {
    this.settings.velocityRejection = enabled;
  }

  /**
   * Enable/disable variance clipping
   */
  public setVarianceClipping(enabled: boolean): void {
    this.settings.varianceClipping = enabled;
  }

  /**
   * Get current TAA settings
   */
  public getSettings(): TAASettings {
    return { ...this.settings };
  }

  /**
   * Apply settings
   */
  public applySettings(settings: Partial<TAASettings>): void {
    Object.assign(this.settings, settings);

    if (settings.jitterPattern) {
      this.resetJitter();
    }
  }

  /**
   * Apply preset configuration
   */
  public applyPreset(preset: string | TAAPreset): void {
    const presetConfig = typeof preset === 'string'
      ? TAAPassController.PRESETS[preset]
      : preset;

    if (!presetConfig) {
      console.error(`TAA preset '${preset}' not found`);
      return;
    }

    this.applySettings(presetConfig.settings);
  }

  /**
   * Get current jitter offset
   */
  public getCurrentJitter(): Vector2 {
    return this.currentJitter.clone();
  }

  /**
   * Reset history buffer (call on camera cuts or scene changes)
   */
  public resetHistory(): void {
    this.needsReset = true;
    this.frameIndex = 0;
    this.resetJitter();
  }

  /**
   * Handle resize
   */
  public resize(width: number, height: number): void {
    if (this.width === width && this.height === height) {
      return;
    }

    this.width = width;
    this.height = height;

    // Recreate render targets
    this.disposeResources();
    this.createResources();

    this.needsReset = true;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.disposeResources();
    this.device = null;
  }

  /**
   * Update jitter for current frame
   */
  private updateJitter(): void {
    switch (this.settings.jitterPattern) {
      case 'halton':
        this.currentJitter.x = this.haltonX.next() - 0.5;
        this.currentJitter.y = this.haltonY.next() - 0.5;
        break;

      case 'r2':
        this.currentJitter = this.r2Sequence.next();
        this.currentJitter.x -= 0.5;
        this.currentJitter.y -= 0.5;
        break;

      case 'random':
        this.currentJitter.x = Math.random() - 0.5;
        this.currentJitter.y = Math.random() - 0.5;
        break;

      case 'uniform':
        const index = this.frameIndex % 4;
        const offsets = [
          [-0.25, -0.25],
          [0.25, -0.25],
          [-0.25, 0.25],
          [0.25, 0.25],
        ];
        this.currentJitter.x = offsets[index][0];
        this.currentJitter.y = offsets[index][1];
        break;
    }

    // Reset sequence if we've hit max samples
    if (this.frameIndex % this.settings.maxSamples === 0) {
      this.resetJitter();
    }
  }

  /**
   * Reset jitter sequences
   */
  private resetJitter(): void {
    this.haltonX.reset();
    this.haltonY.reset();
    this.r2Sequence.reset();
    this.frameIndex = 0;
  }

  /**
   * Apply jitter to camera projection matrix
   */
  private applyJitterToCamera(camera: any): void {
    if (!camera || !this.width || !this.height) {
      return;
    }

    const jitterX = (this.currentJitter.x * 2.0) / this.width;
    const jitterY = (this.currentJitter.y * 2.0) / this.height;

    // Store jitter in camera for shader access
    if (camera.taaJitter) {
      camera.taaJitter.set(jitterX, jitterY);
    }

    // Modify projection matrix (implementation depends on camera system)
    // This would typically offset the projection matrix
  }

  /**
   * Perform temporal accumulation
   */
  private performTemporalAccumulation(context: RenderContext): void {
    // Get current frame color buffer
    const currentColor = context.getResource('colorBuffer');
    const velocity = context.getResource('velocityBuffer');
    const depth = context.getResource('depthBuffer');

    if (!currentColor) {
      return;
    }

    // On first frame or after reset, just copy current to history
    if (this.needsReset) {
      // Copy current to history
      this.copyTexture(currentColor, this.historyTexture);
      this.needsReset = false;
      return;
    }

    // Perform TAA blending
    // This would be done via compute shader or render pass
    // Pseudo-code for the algorithm:
    //
    // 1. Sample current color
    // 2. Reproject history using velocity buffer
    // 3. Sample neighborhood for variance clipping
    // 4. Clamp/clip history color to neighborhood
    // 5. Blend current and clamped history
    // 6. Apply sharpening
    // 7. Write to output and update history

    // For now, we'll just indicate where the pass would execute
    this.executeTAAShader(context, currentColor, this.historyTexture, velocity, depth);

    // Update history texture for next frame
    this.copyTexture(this.outputTexture, this.historyTexture);
  }

  /**
   * Execute TAA shader to blend current frame with history.
   *
   * Uses neighborhood clamping and velocity-based reprojection for
   * high-quality temporal anti-aliasing with minimal ghosting.
   */
  private executeTAAShader(
    context: RenderContext,
    currentColor: any,
    history: any,
    velocity: any,
    depth: any
  ): void {
    if (!this.gl || !this.taaShader) return;

    const gl = this.gl;

    // Bind TAA shader
    gl.useProgram(this.taaShader);

    // Bind input textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentColor.texture ?? currentColor);
    gl.uniform1i(gl.getUniformLocation(this.taaShader, 'u_currentColor'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, history.texture ?? history);
    gl.uniform1i(gl.getUniformLocation(this.taaShader, 'u_historyColor'), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, velocity.texture ?? velocity);
    gl.uniform1i(gl.getUniformLocation(this.taaShader, 'u_velocityBuffer'), 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, depth.texture ?? depth);
    gl.uniform1i(gl.getUniformLocation(this.taaShader, 'u_depthBuffer'), 3);

    // Set TAA uniforms
    gl.uniform1f(gl.getUniformLocation(this.taaShader, 'u_feedbackFactor'), this.settings.feedbackFactor);
    gl.uniform1f(gl.getUniformLocation(this.taaShader, 'u_sharpness'), this.settings.sharpness);
    gl.uniform2f(gl.getUniformLocation(this.taaShader, 'u_texelSize'),
      1.0 / this.width, 1.0 / this.height);
    gl.uniform2f(gl.getUniformLocation(this.taaShader, 'u_jitterOffset'),
      this.currentJitter.x, this.currentJitter.y);

    // Bind output framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outputFramebuffer);

    // Draw fullscreen quad
    gl.bindVertexArray(this.fullscreenQuadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Unbind
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
  }

  /**
   * Copy texture contents using framebuffer blit.
   */
  private copyTexture(source: any, destination: any): void {
    if (!this.gl) return;

    const gl = this.gl;

    // Create temporary framebuffers if needed
    if (!this.copySourceFB) {
      this.copySourceFB = gl.createFramebuffer();
      this.copyDestFB = gl.createFramebuffer();
    }

    // Bind source to read framebuffer
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.copySourceFB);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
      source.texture ?? source, 0);

    // Bind destination to draw framebuffer
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.copyDestFB);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
      destination.texture ?? destination, 0);

    // Blit
    gl.blitFramebuffer(
      0, 0, this.width, this.height,
      0, 0, this.width, this.height,
      gl.COLOR_BUFFER_BIT, gl.NEAREST
    );

    // Unbind
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }

  /** Copy framebuffers */
  private copySourceFB: WebGLFramebuffer | null = null;
  private copyDestFB: WebGLFramebuffer | null = null;

  /**
   * Create GPU resources for TAA.
   */
  private createResources(): void {
    if (!this.gl || !this.width || !this.height) {
      return;
    }

    const gl = this.gl;

    // Create history texture
    this.historyTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.historyTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.width, this.height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create output texture
    this.outputTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.outputTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.width, this.height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create output framebuffer
    this.outputFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outputFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.outputTexture, 0);

    // Verify framebuffer completeness
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      logger.error(`TAA framebuffer incomplete: ${status}`);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Create TAA shader
    this.createTAAShader();

    // Create fullscreen quad
    this.createFullscreenQuad();
  }

  /** Output framebuffer */
  private outputFramebuffer: WebGLFramebuffer | null = null;
  /** TAA shader program */
  private taaShader: WebGLProgram | null = null;
  /** Fullscreen quad VAO */
  private fullscreenQuadVAO: WebGLVertexArrayObject | null = null;

  /**
   * Creates the TAA shader program.
   */
  private createTAAShader(): void {
    if (!this.gl) return;

    const gl = this.gl;

    const vertexShader = `#version 300 es
      precision highp float;
      layout(location = 0) in vec2 a_position;
      out vec2 v_texcoord;
      void main() {
        v_texcoord = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentShader = `#version 300 es
      precision highp float;

      uniform sampler2D u_currentColor;
      uniform sampler2D u_historyColor;
      uniform sampler2D u_velocityBuffer;
      uniform sampler2D u_depthBuffer;

      uniform float u_feedbackFactor;
      uniform float u_sharpness;
      uniform vec2 u_texelSize;
      uniform vec2 u_jitterOffset;

      in vec2 v_texcoord;
      out vec4 o_color;

      // YCoCg color space for better clamping
      vec3 RGBToYCoCg(vec3 rgb) {
        float Y = dot(rgb, vec3(0.25, 0.5, 0.25));
        float Co = dot(rgb, vec3(0.5, 0.0, -0.5));
        float Cg = dot(rgb, vec3(-0.25, 0.5, -0.25));
        return vec3(Y, Co, Cg);
      }

      vec3 YCoCgToRGB(vec3 YCoCg) {
        float Y = YCoCg.x;
        float Co = YCoCg.y;
        float Cg = YCoCg.z;
        return vec3(Y + Co - Cg, Y + Cg, Y - Co - Cg);
      }

      void main() {
        // Sample velocity for reprojection
        vec2 velocity = texture(u_velocityBuffer, v_texcoord).xy;

        // Reproject to previous frame position
        vec2 historyUV = v_texcoord - velocity - u_jitterOffset;

        // Sample current color
        vec3 currentColor = texture(u_currentColor, v_texcoord).rgb;

        // Sample history color at reprojected position
        vec3 historyColor = texture(u_historyColor, historyUV).rgb;

        // Neighborhood clamping to prevent ghosting
        vec3 minColor = currentColor;
        vec3 maxColor = currentColor;

        // Sample 3x3 neighborhood
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y)) * u_texelSize;
            vec3 neighbor = texture(u_currentColor, v_texcoord + offset).rgb;
            minColor = min(minColor, neighbor);
            maxColor = max(maxColor, neighbor);
          }
        }

        // Clamp history to neighborhood bounds
        historyColor = clamp(historyColor, minColor, maxColor);

        // Blend current and history
        float blendFactor = u_feedbackFactor;

        // Reduce blend factor for pixels with high velocity (motion)
        float velocityMagnitude = length(velocity) * 1000.0;
        blendFactor *= max(0.0, 1.0 - velocityMagnitude);

        // Check for disocclusion (history UV out of bounds)
        if (historyUV.x < 0.0 || historyUV.x > 1.0 || historyUV.y < 0.0 || historyUV.y > 1.0) {
          blendFactor = 0.0;
        }

        // Blend
        vec3 result = mix(currentColor, historyColor, blendFactor);

        // Optional sharpening
        if (u_sharpness > 0.0) {
          vec3 blur = vec3(0.0);
          blur += texture(u_currentColor, v_texcoord + vec2(-1.0, 0.0) * u_texelSize).rgb;
          blur += texture(u_currentColor, v_texcoord + vec2(1.0, 0.0) * u_texelSize).rgb;
          blur += texture(u_currentColor, v_texcoord + vec2(0.0, -1.0) * u_texelSize).rgb;
          blur += texture(u_currentColor, v_texcoord + vec2(0.0, 1.0) * u_texelSize).rgb;
          blur *= 0.25;

          result += (result - blur) * u_sharpness;
        }

        o_color = vec4(result, 1.0);
      }
    `;

    // Compile shaders
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vertexShader);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fragmentShader);
    gl.compileShader(fs);

    // Link program
    this.taaShader = gl.createProgram()!;
    gl.attachShader(this.taaShader, vs);
    gl.attachShader(this.taaShader, fs);
    gl.linkProgram(this.taaShader);

    // Clean up
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  }

  /**
   * Creates fullscreen quad geometry.
   */
  private createFullscreenQuad(): void {
    if (!this.gl) return;

    const gl = this.gl;

    const positions = new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1, 1,   1, -1,   1, 1
    ]);

    this.fullscreenQuadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.fullscreenQuadVAO);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  /**
   * Dispose GPU resources
   */
  private disposeResources(): void {
    // Dispose textures
    if (this.historyTexture) {
      // this.historyTexture.dispose();
      this.historyTexture = null;
    }

    if (this.outputTexture) {
      // this.outputTexture.dispose();
      this.outputTexture = null;
    }
  }
}
