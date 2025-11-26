/**
 * @module Bloom
 * @description Bloom/glow post-processing effect with threshold extraction,
 * gaussian blur, and downsampling chain for realistic light bleeding.
 */

import { Logger } from '../../core/Logger';
import { PostProcessEffect, EffectQuality, TextureSpec } from './PostProcessEffect';
import { RenderTexture, RenderTextureDescriptor, TextureFormat } from '../texture/RenderTexture';
import { Shader, ShaderSource } from '../shader/Shader';
import { TextureFilter, TextureWrap } from '../texture/Texture';
import { Vector2 } from '../../math/Vector2';

const logger = Logger.create('Bloom');

/**
 * Bloom effect parameters.
 */
export interface BloomParameters {
  /** Brightness threshold for bloom extraction (default: 1.0) */
  threshold?: number;
  /** Soft threshold knee for smooth transition (default: 0.5) */
  knee?: number;
  /** Bloom intensity/strength (default: 0.8) */
  intensity?: number;
  /** Blur radius multiplier (default: 1.0) */
  radius?: number;
  /** Number of downsampling levels (default: 5) */
  iterations?: number;
  /** Enable/disable the effect (default: true) */
  enabled?: boolean;
  /** Quality preset (default: Medium) */
  quality?: EffectQuality;
}

/**
 * Mip level for downsampling chain.
 */
interface BloomMip {
  /** Render texture for this mip level */
  texture: RenderTexture;
  /** Mip level index */
  level: number;
  /** Width of this mip */
  width: number;
  /** Height of this mip */
  height: number;
}

/**
 * Bloom/glow post-processing effect.
 * Implements HDR bloom with threshold extraction, gaussian blur,
 * progressive downsampling, and tent filter upsampling.
 *
 * Algorithm:
 * 1. Extract bright pixels above threshold
 * 2. Create downsampling pyramid with gaussian blur
 * 3. Upsample with tent filter and accumulate
 * 4. Blend with original image
 *
 * @example
 * ```typescript
 * const bloom = new Bloom({
 *   threshold: 1.0,
 *   knee: 0.5,
 *   intensity: 0.8,
 *   radius: 1.0,
 *   iterations: 5,
 *   quality: EffectQuality.High
 * });
 *
 * stack.addEffect(bloom);
 *
 * // Adjust at runtime
 * bloom.setParameter('threshold', 1.2);
 * bloom.setParameter('intensity', 0.6);
 * ```
 */
export class Bloom extends PostProcessEffect {
  /** Threshold extraction shader */
  private thresholdShader: Shader | null = null;

  /** Downsampling shader with 13-tap filter */
  private downsampleShader: Shader | null = null;

  /** Upsampling shader with tent filter */
  private upsampleShader: Shader | null = null;

  /** Composite shader for final blend */
  private compositeShader: Shader | null = null;

  /** Mip chain for downsampling */
  private mips: BloomMip[] = [];

  /** Number of blur iterations */
  private iterations: number = 5;

  /**
   * Creates a new Bloom effect.
   *
   * @param params - Bloom parameters
   */
  constructor(params: BloomParameters = {}) {
    super('Bloom');

    this.enabled = params.enabled ?? true;
    this.intensity = params.intensity ?? 0.8;
    this.quality = params.quality ?? EffectQuality.Medium;
    this.iterations = params.iterations ?? 5;

    // Add parameters
    this.addParameter({
      name: 'threshold',
      type: 'float',
      value: params.threshold ?? 1.0,
      range: [0, 10],
      description: 'Brightness threshold for bloom extraction',
    });

    this.addParameter({
      name: 'knee',
      type: 'float',
      value: params.knee ?? 0.5,
      range: [0, 1],
      description: 'Soft threshold knee for smooth transition',
    });

    this.addParameter({
      name: 'radius',
      type: 'float',
      value: params.radius ?? 1.0,
      range: [0, 5],
      description: 'Blur radius multiplier',
    });
  }

  /**
   * Initializes bloom effect with shaders and mip chain.
   *
   * @param gl - WebGL2 context
   */
  override initialize(gl: WebGL2RenderingContext): void {
    super.initialize(gl);

    // Create shaders
    this.createShaders();

    // Create mip chain
    this.createMipChain(1920, 1080); // Will be resized on first render

    logger.info('Bloom effect initialized');
  }

  /**
   * Creates all shaders for bloom effect.
   */
  private createShaders(): void {
    if (!this.gl) return;

    // Threshold extraction shader
    const thresholdSource: ShaderSource = {
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
        uniform float uThreshold;
        uniform float uKnee;

        // Quadratic threshold
        vec3 quadraticThreshold(vec3 color, float threshold, float knee) {
          float br = max(color.r, max(color.g, color.b));
          float rq = clamp(br - threshold + knee, 0.0, 2.0 * knee);
          rq = 0.25 * rq * rq / knee;
          return color * max(rq, br - threshold) / max(br, 0.0001);
        }

        void main() {
          vec3 color = texture(uTexture, vTexCoord).rgb;
          vec3 bloom = quadraticThreshold(color, uThreshold, uKnee);
          fragColor = vec4(bloom, 1.0);
        }
      `,
    };

    this.thresholdShader = new Shader({
      name: 'BloomThreshold',
      source: thresholdSource,
      gl: this.gl,
    });

    // Downsampling shader with 13-tap filter
    const downsampleSource: ShaderSource = {
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

        // 13-tap box filter
        vec3 downsample13Tap(sampler2D tex, vec2 uv, vec2 texelSize) {
          vec3 a = texture(tex, uv + texelSize * vec2(-1.0, -1.0)).rgb;
          vec3 b = texture(tex, uv + texelSize * vec2( 0.0, -1.0)).rgb;
          vec3 c = texture(tex, uv + texelSize * vec2( 1.0, -1.0)).rgb;
          vec3 d = texture(tex, uv + texelSize * vec2(-0.5, -0.5)).rgb;
          vec3 e = texture(tex, uv + texelSize * vec2( 0.5, -0.5)).rgb;
          vec3 f = texture(tex, uv + texelSize * vec2(-1.0,  0.0)).rgb;
          vec3 g = texture(tex, uv).rgb;
          vec3 h = texture(tex, uv + texelSize * vec2( 1.0,  0.0)).rgb;
          vec3 i = texture(tex, uv + texelSize * vec2(-0.5,  0.5)).rgb;
          vec3 j = texture(tex, uv + texelSize * vec2( 0.5,  0.5)).rgb;
          vec3 k = texture(tex, uv + texelSize * vec2(-1.0,  1.0)).rgb;
          vec3 l = texture(tex, uv + texelSize * vec2( 0.0,  1.0)).rgb;
          vec3 m = texture(tex, uv + texelSize * vec2( 1.0,  1.0)).rgb;

          vec3 result = (d + e + i + j) * 0.5;
          result += (a + b + g + f) * 0.125;
          result += (b + c + h + g) * 0.125;
          result += (f + g + l + k) * 0.125;
          result += (g + h + m + l) * 0.125;
          return result * 0.25;
        }

        void main() {
          vec3 color = downsample13Tap(uTexture, vTexCoord, uTexelSize);
          fragColor = vec4(color, 1.0);
        }
      `,
    };

    this.downsampleShader = new Shader({
      name: 'BloomDownsample',
      source: downsampleSource,
      gl: this.gl,
    });

    // Upsampling shader with tent filter
    const upsampleSource: ShaderSource = {
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
        uniform float uRadius;

        // 9-tap tent filter
        vec3 upsampleTent(sampler2D tex, vec2 uv, vec2 texelSize, float radius) {
          vec2 d = texelSize * radius;

          vec3 s1 = texture(tex, uv + vec2(-d.x,  d.y)).rgb;
          vec3 s2 = texture(tex, uv + vec2( 0.0,  d.y)).rgb;
          vec3 s3 = texture(tex, uv + vec2( d.x,  d.y)).rgb;

          vec3 s4 = texture(tex, uv + vec2(-d.x, 0.0)).rgb;
          vec3 s5 = texture(tex, uv).rgb;
          vec3 s6 = texture(tex, uv + vec2( d.x, 0.0)).rgb;

          vec3 s7 = texture(tex, uv + vec2(-d.x, -d.y)).rgb;
          vec3 s8 = texture(tex, uv + vec2( 0.0, -d.y)).rgb;
          vec3 s9 = texture(tex, uv + vec2( d.x, -d.y)).rgb;

          // Tent weights
          vec3 result = s5 * 4.0;
          result += (s2 + s4 + s6 + s8) * 2.0;
          result += (s1 + s3 + s7 + s9);
          return result / 16.0;
        }

        void main() {
          vec3 color = upsampleTent(uTexture, vTexCoord, uTexelSize, uRadius);
          fragColor = vec4(color, 1.0);
        }
      `,
    };

    this.upsampleShader = new Shader({
      name: 'BloomUpsample',
      source: upsampleSource,
      gl: this.gl,
    });

    // Composite shader
    const compositeSource: ShaderSource = {
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
        uniform sampler2D uBloomTexture;
        uniform float uIntensity;

        void main() {
          vec3 color = texture(uTexture, vTexCoord).rgb;
          vec3 bloom = texture(uBloomTexture, vTexCoord).rgb;
          vec3 result = color + bloom * uIntensity;
          fragColor = vec4(result, 1.0);
        }
      `,
    };

    this.compositeShader = new Shader({
      name: 'BloomComposite',
      source: compositeSource,
      gl: this.gl,
    });
  }

  /**
   * Creates the mip chain for progressive downsampling.
   *
   * @param width - Base width
   * @param height - Base height
   */
  private createMipChain(width: number, height: number): void {
    // Clear existing mips
    for (const mip of this.mips) {
      mip.texture.destroy();
    }
    this.mips = [];

    // Create mip levels
    let mipWidth = Math.floor(width / 2);
    let mipHeight = Math.floor(height / 2);

    for (let i = 0; i < this.iterations; i++) {
      const descriptor: RenderTextureDescriptor = {
        width: mipWidth,
        height: mipHeight,
        format: TextureFormat.RGBA16F,
        minFilter: TextureFilter.Linear,
        magFilter: TextureFilter.Linear,
        wrapU: TextureWrap.ClampToEdge,
        wrapV: TextureWrap.ClampToEdge,
        depth: false,
        label: `BloomMip_${i}`,
      };

      const texture = new RenderTexture(descriptor);

      this.mips.push({
        texture,
        level: i,
        width: mipWidth,
        height: mipHeight,
      });

      // Next mip is half resolution
      mipWidth = Math.max(1, Math.floor(mipWidth / 2));
      mipHeight = Math.max(1, Math.floor(mipHeight / 2));
    }

    logger.debug(`Created bloom mip chain with ${this.mips.length} levels`);
  }

  /**
   * Renders the bloom effect.
   *
   * @param input - Input texture
   * @param output - Output texture
   * @param deltaTime - Delta time
   */
  render(input: RenderTexture, output: RenderTexture, deltaTime: number): void {
    if (!this.enabled || !this.gl || !this.thresholdShader || !this.downsampleShader ||
        !this.upsampleShader || !this.compositeShader) {
      return;
    }

    // Ensure mip chain matches input size
    if (this.mips.length === 0 || this.mips[0].width !== Math.floor(input.getWidth() / 2)) {
      this.createMipChain(input.getWidth(), input.getHeight());
    }

    const threshold = this.getParameter('threshold')!.value;
    const knee = this.getParameter('knee')!.value;
    const radius = this.getParameter('radius')!.value;

    // Pass 1: Extract bright pixels (threshold)
    this.thresholdShader.bind();
    this.thresholdShader.setUniform('uTexture', input.getColorTexture());
    this.thresholdShader.setUniform('uThreshold', threshold);
    this.thresholdShader.setUniform('uKnee', knee);
    this.renderQuad(this.mips[0].texture);

    // Pass 2: Progressive downsampling with blur
    for (let i = 1; i < this.mips.length; i++) {
      const srcMip = this.mips[i - 1];
      const dstMip = this.mips[i];

      this.downsampleShader.bind();
      this.downsampleShader.setUniform('uTexture', srcMip.texture.getColorTexture());
      this.downsampleShader.setUniform('uTexelSize', new Vector2(1.0 / srcMip.width, 1.0 / srcMip.height));
      this.renderQuad(dstMip.texture);
    }

    // Pass 3: Progressive upsampling with tent filter
    for (let i = this.mips.length - 1; i > 0; i--) {
      const srcMip = this.mips[i];
      const dstMip = this.mips[i - 1];

      this.upsampleShader.bind();
      this.upsampleShader.setUniform('uTexture', srcMip.texture.getColorTexture());
      this.upsampleShader.setUniform('uTexelSize', new Vector2(1.0 / srcMip.width, 1.0 / srcMip.height));
      this.upsampleShader.setUniform('uRadius', radius);

      // Enable additive blending for accumulation
      this.gl.enable(this.gl.BLEND);
      this.gl.blendFunc(this.gl.ONE, this.gl.ONE);
      this.gl.blendEquation(this.gl.FUNC_ADD);

      this.renderQuad(dstMip.texture);

      this.gl.disable(this.gl.BLEND);
    }

    // Pass 4: Composite with original
    this.compositeShader.bind();
    this.compositeShader.setUniform('uTexture', input.getColorTexture());
    this.compositeShader.setUniform('uBloomTexture', this.mips[0].texture.getColorTexture());
    this.compositeShader.setUniform('uIntensity', this.intensity);
    this.renderQuad(output);
  }

  /**
   * Resizes the effect.
   *
   * @param width - New width
   * @param height - New height
   */
  override resize(width: number, height: number): void {
    super.resize(width, height);
    this.createMipChain(width, height);
  }

  /**
   * Called when quality changes.
   */
  override protected onQualityChanged(): void {
    // Adjust iterations based on quality
    switch (this.quality) {
      case EffectQuality.Low:
        this.iterations = 3;
        break;
      case EffectQuality.Medium:
        this.iterations = 5;
        break;
      case EffectQuality.High:
        this.iterations = 6;
        break;
      case EffectQuality.Ultra:
        this.iterations = 7;
        break;
    }

    // Recreate mip chain with new iteration count
    if (this.mips.length > 0) {
      const width = this.mips[0].width * 2;
      const height = this.mips[0].height * 2;
      this.createMipChain(width, height);
    }
  }

  /**
   * Disposes the effect.
   */
  override dispose(): void {
    // Dispose mip chain
    for (const mip of this.mips) {
      mip.texture.destroy();
    }
    this.mips = [];

    // Dispose shaders
    this.thresholdShader?.dispose();
    this.downsampleShader?.dispose();
    this.upsampleShader?.dispose();
    this.compositeShader?.dispose();

    super.dispose();
  }

  /**
   * Requires HDR input.
   */
  override getInputSpec(): TextureSpec {
    return {
      format: 'rgba16float',
      linear: true,
    };
  }
}
