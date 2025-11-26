/**
 * @module TAA
 * @description Temporal Anti-Aliasing (TAA) post-processing effect.
 * Uses motion vectors and temporal reprojection for high-quality anti-aliasing.
 */

import { Logger } from '../../core/Logger';
import { PostProcessEffect, EffectQuality, TextureSpec } from './PostProcessEffect';
import { RenderTexture, RenderTextureDescriptor, TextureFormat } from '../texture/RenderTexture';
import { Shader, ShaderSource } from '../shader/Shader';
import { TextureFilter, TextureWrap } from '../texture/Texture';
import { Vector2 } from '../../math/Vector2';
import { Matrix4 } from '../../math/Matrix4';

const logger = Logger.create('TAA');

/**
 * TAA parameters.
 */
export interface TAAParameters {
  /** History blend factor (default: 0.9, higher = more temporal stability) */
  blendFactor?: number;
  /** Sharpening amount (default: 0.1) */
  sharpness?: number;
  /** Enable velocity weighting (default: true) */
  velocityWeighting?: boolean;
  /** Enable neighborhood clamping (default: true) */
  neighborhoodClamping?: boolean;
  /** Jitter pattern scale (default: 1.0) */
  jitterScale?: number;
  /** Enable/disable effect (default: true) */
  enabled?: boolean;
  /** Quality preset (default: Medium) */
  quality?: EffectQuality;
}

/**
 * Halton sequence generator for jitter patterns.
 */
class HaltonSequence {
  private index: number = 0;

  /**
   * Gets next value in Halton sequence.
   *
   * @param base - Sequence base
   * @returns Next value
   */
  next(base: number): number {
    let result = 0;
    let f = 1.0 / base;
    let i = this.index;

    while (i > 0) {
      result += f * (i % base);
      i = Math.floor(i / base);
      f /= base;
    }

    return result;
  }

  /**
   * Advances to next index.
   */
  advance(): void {
    this.index++;
  }

  /**
   * Resets sequence.
   */
  reset(): void {
    this.index = 0;
  }
}

/**
 * Temporal Anti-Aliasing (TAA) effect.
 * Reduces aliasing by accumulating samples across frames using motion vectors.
 * Includes neighborhood clamping, velocity weighting, and sharpening.
 *
 * @example
 * ```typescript
 * const taa = new TAA({
 *   blendFactor: 0.9,
 *   sharpness: 0.1,
 *   velocityWeighting: true,
 *   neighborhoodClamping: true,
 *   quality: EffectQuality.High
 * });
 *
 * stack.addEffect(taa);
 *
 * // Update camera jitter each frame
 * const jitter = taa.getJitterOffset();
 * camera.setJitter(jitter.x, jitter.y);
 * ```
 */
export class TAA extends PostProcessEffect {
  /** TAA resolve shader */
  private resolveShader: Shader | null = null;

  /** Sharpening shader */
  private sharpenShader: Shader | null = null;

  /** History buffer (previous frame) */
  private historyBuffer: RenderTexture | null = null;

  /** Temporary buffer for sharpening */
  private tempBuffer: RenderTexture | null = null;

  /** Halton sequence for jitter */
  private haltonX: HaltonSequence = new HaltonSequence();
  private haltonY: HaltonSequence = new HaltonSequence();

  /** Current jitter offset */
  private jitterOffset: Vector2 = new Vector2(0, 0);

  /** Frame index */
  private frameIndex: number = 0;

  /** Previous view-projection matrix */
  private prevViewProjection: Matrix4 = Matrix4.identity();

  /** Whether this is the first frame */
  private firstFrame: boolean = true;

  /**
   * Creates a new TAA effect.
   *
   * @param params - TAA parameters
   */
  constructor(params: TAAParameters = {}) {
    super('TAA');

    this.enabled = params.enabled ?? true;
    this.quality = params.quality ?? EffectQuality.Medium;

    // Add parameters
    this.addParameter({
      name: 'blendFactor',
      type: 'float',
      value: params.blendFactor ?? 0.9,
      range: [0, 1],
      description: 'History blend factor (higher = more stable)',
    });

    this.addParameter({
      name: 'sharpness',
      type: 'float',
      value: params.sharpness ?? 0.1,
      range: [0, 1],
      description: 'Sharpening amount',
    });

    this.addParameter({
      name: 'velocityWeighting',
      type: 'bool',
      value: params.velocityWeighting ?? true,
      description: 'Enable velocity-based weighting',
    });

    this.addParameter({
      name: 'neighborhoodClamping',
      type: 'bool',
      value: params.neighborhoodClamping ?? true,
      description: 'Enable neighborhood clamping',
    });

    this.addParameter({
      name: 'jitterScale',
      type: 'float',
      value: params.jitterScale ?? 1.0,
      range: [0, 2],
      description: 'Jitter pattern scale',
    });
  }

  /**
   * Initializes TAA effect.
   *
   * @param gl - WebGL2 context
   */
  override initialize(gl: WebGL2RenderingContext): void {
    super.initialize(gl);

    // Create shaders
    this.createShaders();

    // Create buffers
    this.createBuffers(1920, 1080);

    logger.info('TAA initialized');
  }

  /**
   * Creates shaders for TAA.
   */
  private createShaders(): void {
    if (!this.gl) return;

    // TAA resolve shader
    const resolveSource: ShaderSource = {
      vertex: `#version 300 es
        layout(location = 0) in vec2 aPosition;
        layout(location = 1) in vec2 aTexCoord;
        out vec2 vTexCoord;

        void main() {
          vTexCoord = aTexCoord;
          gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `,
      fragment: `#version 300 es
        precision highp float;

        in vec2 vTexCoord;
        out vec4 fragColor;

        uniform sampler2D uCurrentFrame;
        uniform sampler2D uHistoryFrame;
        uniform sampler2D uVelocityTexture;
        uniform sampler2D uDepthTexture;

        uniform float uBlendFactor;
        uniform bool uVelocityWeighting;
        uniform bool uNeighborhoodClamping;
        uniform vec2 uTexelSize;
        uniform bool uFirstFrame;

        // RGB to YCoCg color space
        vec3 rgbToYCoCg(vec3 rgb) {
          float Y  =  0.25 * rgb.r + 0.5 * rgb.g + 0.25 * rgb.b;
          float Co =  0.5  * rgb.r - 0.5 * rgb.b;
          float Cg = -0.25 * rgb.r + 0.5 * rgb.g - 0.25 * rgb.b;
          return vec3(Y, Co, Cg);
        }

        vec3 yCoCgToRgb(vec3 ycocg) {
          float tmp = ycocg.x - ycocg.z;
          float r = tmp + ycocg.y;
          float g = ycocg.x + ycocg.z;
          float b = tmp - ycocg.y;
          return vec3(r, g, b);
        }

        // Clip history to neighborhood AABB
        vec3 clipAABB(vec3 aabbMin, vec3 aabbMax, vec3 history) {
          vec3 center = 0.5 * (aabbMax + aabbMin);
          vec3 extent = 0.5 * (aabbMax - aabbMin);

          vec3 offset = history - center;
          vec3 ts = abs(extent) / max(abs(offset), vec3(0.0001));
          float t = min(min(ts.x, ts.y), ts.z);

          if (t < 1.0) {
            return center + offset * t;
          }
          return history;
        }

        void main() {
          vec3 current = texture(uCurrentFrame, vTexCoord).rgb;

          // First frame: no history
          if (uFirstFrame) {
            fragColor = vec4(current, 1.0);
            return;
          }

          // Sample velocity
          vec2 velocity = texture(uVelocityTexture, vTexCoord).xy;

          // Reproject to previous frame
          vec2 historyUV = vTexCoord - velocity;

          // Out of bounds check
          if (historyUV.x < 0.0 || historyUV.x > 1.0 || historyUV.y < 0.0 || historyUV.y > 1.0) {
            fragColor = vec4(current, 1.0);
            return;
          }

          vec3 history = texture(uHistoryFrame, historyUV).rgb;

          // Neighborhood clamping
          if (uNeighborhoodClamping) {
            // Sample 3x3 neighborhood
            vec3 minColor = vec3(999.0);
            vec3 maxColor = vec3(-999.0);

            for (int x = -1; x <= 1; x++) {
              for (int y = -1; y <= 1; y++) {
                vec2 offset = vec2(float(x), float(y)) * uTexelSize;
                vec3 neighbor = texture(uCurrentFrame, vTexCoord + offset).rgb;
                neighbor = rgbToYCoCg(neighbor);
                minColor = min(minColor, neighbor);
                maxColor = max(maxColor, neighbor);
              }
            }

            // Clip history to neighborhood
            history = rgbToYCoCg(history);
            history = clipAABB(minColor, maxColor, history);
            history = yCoCgToRgb(history);
          }

          // Velocity weighting
          float blend = uBlendFactor;
          if (uVelocityWeighting) {
            float velocityLength = length(velocity * vec2(1920.0, 1080.0)); // Approximate resolution
            blend = mix(0.7, 0.95, clamp(1.0 - velocityLength / 100.0, 0.0, 1.0));
          }

          // Blend current and history
          vec3 result = mix(current, history, blend);

          fragColor = vec4(result, 1.0);
        }
      `,
    };

    this.resolveShader = new Shader({
      name: 'TAAResolve',
      source: resolveSource,
      gl: this.gl,
    });

    // Sharpening shader
    const sharpenSource: ShaderSource = {
      vertex: `#version 300 es
        layout(location = 0) in vec2 aPosition;
        layout(location = 1) in vec2 aTexCoord;
        out vec2 vTexCoord;

        void main() {
          vTexCoord = aTexCoord;
          gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `,
      fragment: `#version 300 es
        precision highp float;

        in vec2 vTexCoord;
        out vec4 fragColor;

        uniform sampler2D uTexture;
        uniform vec2 uTexelSize;
        uniform float uSharpness;

        void main() {
          vec3 center = texture(uTexture, vTexCoord).rgb;

          // 5-tap sharpening kernel
          vec3 top    = texture(uTexture, vTexCoord + vec2( 0.0,  1.0) * uTexelSize).rgb;
          vec3 bottom = texture(uTexture, vTexCoord + vec2( 0.0, -1.0) * uTexelSize).rgb;
          vec3 left   = texture(uTexture, vTexCoord + vec2(-1.0,  0.0) * uTexelSize).rgb;
          vec3 right  = texture(uTexture, vTexCoord + vec2( 1.0,  0.0) * uTexelSize).rgb;

          vec3 edges = top + bottom + left + right;
          vec3 sharpened = center + (center * 4.0 - edges) * uSharpness;

          fragColor = vec4(sharpened, 1.0);
        }
      `,
    };

    this.sharpenShader = new Shader({
      name: 'TAASharpen',
      source: sharpenSource,
      gl: this.gl,
    });
  }

  /**
   * Creates render buffers.
   *
   * @param width - Width
   * @param height - Height
   */
  private createBuffers(width: number, height: number): void {
    const descriptor: RenderTextureDescriptor = {
      width,
      height,
      format: TextureFormat.RGBA16F,
      minFilter: TextureFilter.Linear,
      magFilter: TextureFilter.Linear,
      wrapU: TextureWrap.ClampToEdge,
      wrapV: TextureWrap.ClampToEdge,
      depth: false,
    };

    this.historyBuffer = new RenderTexture({
      ...descriptor,
      label: 'TAAHistory',
    });

    this.tempBuffer = new RenderTexture({
      ...descriptor,
      label: 'TAATemp',
    });

    this.tempTextures = [this.historyBuffer, this.tempBuffer];
  }

  /**
   * Gets the current jitter offset for camera projection.
   *
   * @returns Jitter offset in NDC space
   */
  getJitterOffset(): Vector2 {
    return this.jitterOffset.clone();
  }

  /**
   * Updates jitter pattern for next frame.
   *
   * @param width - Viewport width
   * @param height - Viewport height
   */
  updateJitter(width: number, height: number): void {
    const jitterScale = this.getParameter('jitterScale')!.value;

    // Get Halton sequence values
    const x = this.haltonX.next(2) - 0.5;
    const y = this.haltonY.next(3) - 0.5;

    // Convert to NDC space
    this.jitterOffset.x = (x / width) * 2.0 * jitterScale;
    this.jitterOffset.y = (y / height) * 2.0 * jitterScale;

    // Advance sequences
    this.haltonX.advance();
    this.haltonY.advance();

    // Reset after 64 samples
    if (this.frameIndex >= 64) {
      this.haltonX.reset();
      this.haltonY.reset();
      this.frameIndex = 0;
    }
  }

  /**
   * Sets the previous view-projection matrix for motion vectors.
   *
   * @param matrix - Previous view-projection matrix
   */
  setPreviousViewProjection(matrix: Matrix4): void {
    this.prevViewProjection = matrix.clone();
  }

  /**
   * Renders TAA effect.
   *
   * @param input - Input texture
   * @param output - Output texture
   * @param deltaTime - Delta time
   */
  render(input: RenderTexture, output: RenderTexture, deltaTime: number): void {
    if (!this.enabled || !this.gl || !this.resolveShader || !this.sharpenShader ||
        !this.historyBuffer || !this.tempBuffer) {
      return;
    }

    const blendFactor = this.getParameter('blendFactor')!.value;
    const sharpness = this.getParameter('sharpness')!.value;
    const velocityWeighting = this.getParameter('velocityWeighting')!.value;
    const neighborhoodClamping = this.getParameter('neighborhoodClamping')!.value;

    const width = input.getWidth();
    const height = input.getHeight();

    // Update jitter for next frame
    this.updateJitter(width, height);

    // Pass 1: TAA resolve
    this.resolveShader.bind();
    this.resolveShader.setUniform('uCurrentFrame', input.getColorTexture());
    this.resolveShader.setUniform('uHistoryFrame', this.historyBuffer.getColorTexture());
    // In real implementation, would use motion vector buffer
    // this.resolveShader.setUniform('uVelocityTexture', velocityBuffer);
    const depthTexture = input.getDepthTexture();
    if (depthTexture) {
      this.resolveShader.setUniform('uDepthTexture', depthTexture);
    }
    this.resolveShader.setUniform('uBlendFactor', blendFactor);
    this.resolveShader.setUniform('uVelocityWeighting', velocityWeighting);
    this.resolveShader.setUniform('uNeighborhoodClamping', neighborhoodClamping);
    this.resolveShader.setUniform('uTexelSize', new Vector2(1.0 / width, 1.0 / height));
    this.resolveShader.setUniform('uFirstFrame', this.firstFrame);
    this.renderQuad(this.tempBuffer);

    // Pass 2: Sharpening
    this.sharpenShader.bind();
    this.sharpenShader.setUniform('uTexture', this.tempBuffer.getColorTexture());
    this.sharpenShader.setUniform('uTexelSize', new Vector2(1.0 / width, 1.0 / height));
    this.sharpenShader.setUniform('uSharpness', sharpness);
    this.renderQuad(output);

    // Copy output to history for next frame
    if (this.gl) {
      const srcFB = output.getFramebuffer();
      const dstFB = this.historyBuffer.getFramebuffer();

      this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, srcFB);
      this.gl.bindFramebuffer(this.gl.DRAW_FRAMEBUFFER, dstFB);
      this.gl.blitFramebuffer(
        0, 0, width, height,
        0, 0, width, height,
        this.gl.COLOR_BUFFER_BIT,
        this.gl.NEAREST
      );
    }

    this.firstFrame = false;
    this.frameIndex++;
  }

  /**
   * Resizes the effect.
   *
   * @param width - New width
   * @param height - New height
   */
  override resize(width: number, height: number): void {
    super.resize(width, height);

    if (this.historyBuffer) {
      this.historyBuffer.resize(width, height);
    }
    if (this.tempBuffer) {
      this.tempBuffer.resize(width, height);
    }

    // Reset on resize
    this.firstFrame = true;
    this.frameIndex = 0;
  }

  /**
   * Resets TAA history.
   * Useful when camera cuts or scene changes.
   */
  reset(): void {
    this.firstFrame = true;
    this.frameIndex = 0;
    this.haltonX.reset();
    this.haltonY.reset();
    logger.debug('TAA history reset');
  }

  /**
   * Requires motion vectors.
   */
  override requiresMotionVectors(): boolean {
    return true;
  }

  /**
   * Disposes the effect.
   */
  override dispose(): void {
    this.resolveShader?.dispose();
    this.sharpenShader?.dispose();

    super.dispose();
  }
}
