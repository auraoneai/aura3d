/**
 * @module ToneMapping
 * @description HDR to LDR tone mapping with multiple operators.
 * Converts high dynamic range images to display-ready low dynamic range.
 */

import { Logger } from '../../core/Logger';
import { PostProcessEffect, EffectQuality, TextureSpec } from './PostProcessEffect';
import { RenderTexture, RenderTextureDescriptor, TextureFormat } from '../texture/RenderTexture';
import { Shader, ShaderSource } from '../shader/Shader';
import { TextureFilter, TextureWrap } from '../texture/Texture';
import { Vector2 } from '../../math/Vector2';

const logger = Logger.create('ToneMapping');

/**
 * Tone mapping operator types.
 */
export enum ToneMappingOperator {
  /** No tone mapping (linear) */
  None = 'none',
  /** Simple Reinhard operator */
  Reinhard = 'reinhard',
  /** Reinhard with white point */
  ReinhardExtended = 'reinhard-extended',
  /** ACES filmic tone mapping (Academy Color Encoding System) */
  ACES = 'aces',
  /** Neutral tone mapper from Unity */
  Neutral = 'neutral',
  /** Uncharted 2 filmic tone mapping */
  Uncharted2 = 'uncharted2',
}

/**
 * Tone mapping parameters.
 */
export interface ToneMappingParameters {
  /** Tone mapping operator (default: ACES) */
  operator?: ToneMappingOperator;
  /** Exposure adjustment (default: 1.0) */
  exposure?: number;
  /** Auto-exposure enabled (default: false) */
  autoExposure?: boolean;
  /** Auto-exposure adaptation speed (default: 1.0) */
  adaptationSpeed?: number;
  /** White point for extended Reinhard (default: 2.0) */
  whitePoint?: number;
  /** Gamma correction (default: 2.2) */
  gamma?: number;
  /** Enable/disable effect (default: true) */
  enabled?: boolean;
  /** Quality preset (default: Medium) */
  quality?: EffectQuality;
}

/**
 * Tone Mapping effect.
 * Converts HDR (High Dynamic Range) images to LDR (Low Dynamic Range)
 * for display with various tone mapping operators.
 *
 * @example
 * ```typescript
 * const toneMapping = new ToneMapping({
 *   operator: ToneMappingOperator.ACES,
 *   exposure: 1.0,
 *   autoExposure: false,
 *   gamma: 2.2
 * });
 *
 * stack.addEffect(toneMapping);
 *
 * // Change operator at runtime
 * toneMapping.setParameter('operator', ToneMappingOperator.Uncharted2);
 * toneMapping.setParameter('exposure', 1.2);
 * ```
 */
export class ToneMapping extends PostProcessEffect {
  /** Tone mapping shader */
  private toneMapShader: Shader | null = null;

  /** Luminance calculation shader */
  private luminanceShader: Shader | null = null;

  /** Mipmap reduction shader for average luminance */
  private mipReduceShader: Shader | null = null;

  /** Luminance texture (single channel) */
  private luminanceTexture: RenderTexture | null = null;

  /** Mipmap chain for luminance reduction */
  private luminanceMips: RenderTexture[] = [];

  /** Current tone mapping operator */
  private currentOperator: ToneMappingOperator = ToneMappingOperator.ACES;

  /** Current average luminance for auto-exposure */
  private currentLuminance: number = 1.0;

  /** Target luminance for auto-exposure */
  private targetLuminance: number = 1.0;

  /**
   * Creates a new ToneMapping effect.
   *
   * @param params - Tone mapping parameters
   */
  constructor(params: ToneMappingParameters = {}) {
    super('ToneMapping');

    this.enabled = params.enabled ?? true;
    this.quality = params.quality ?? EffectQuality.Medium;
    this.currentOperator = params.operator ?? ToneMappingOperator.ACES;

    // Add parameters
    this.addParameter({
      name: 'operator',
      type: 'int',
      value: this.operatorToInt(this.currentOperator),
      range: [0, 5],
      description: 'Tone mapping operator',
    });

    this.addParameter({
      name: 'exposure',
      type: 'float',
      value: params.exposure ?? 1.0,
      range: [0.1, 10],
      description: 'Exposure adjustment',
    });

    this.addParameter({
      name: 'autoExposure',
      type: 'bool',
      value: params.autoExposure ?? false,
      description: 'Enable auto-exposure',
    });

    this.addParameter({
      name: 'adaptationSpeed',
      type: 'float',
      value: params.adaptationSpeed ?? 1.0,
      range: [0.1, 10],
      description: 'Auto-exposure adaptation speed',
    });

    this.addParameter({
      name: 'whitePoint',
      type: 'float',
      value: params.whitePoint ?? 2.0,
      range: [1, 20],
      description: 'White point for extended Reinhard',
    });

    this.addParameter({
      name: 'gamma',
      type: 'float',
      value: params.gamma ?? 2.2,
      range: [1, 3],
      description: 'Gamma correction',
    });
  }

  /**
   * Converts operator enum to integer.
   */
  private operatorToInt(op: ToneMappingOperator): number {
    const mapping: Record<ToneMappingOperator, number> = {
      [ToneMappingOperator.None]: 0,
      [ToneMappingOperator.Reinhard]: 1,
      [ToneMappingOperator.ReinhardExtended]: 2,
      [ToneMappingOperator.ACES]: 3,
      [ToneMappingOperator.Neutral]: 4,
      [ToneMappingOperator.Uncharted2]: 5,
    };
    return mapping[op];
  }

  /**
   * Initializes tone mapping effect.
   *
   * @param gl - WebGL2 context
   */
  override initialize(gl: WebGL2RenderingContext): void {
    super.initialize(gl);
    this.createShader();
    this.createLuminanceShaders();
    this.createLuminanceTextures(1920, 1080); // Will be resized on first render
    logger.info('ToneMapping initialized');
  }

  /**
   * Creates tone mapping shader with all operators.
   */
  private createShader(): void {
    if (!this.gl) return;

    const source: ShaderSource = {
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
        uniform int uOperator;
        uniform float uExposure;
        uniform float uWhitePoint;
        uniform float uGamma;

        // Luminance calculation
        float luminance(vec3 color) {
          return dot(color, vec3(0.2126, 0.7152, 0.0722));
        }

        // Reinhard tone mapping
        vec3 reinhardToneMapping(vec3 color) {
          return color / (1.0 + color);
        }

        // Extended Reinhard with white point
        vec3 reinhardExtendedToneMapping(vec3 color, float whitePoint) {
          float lum = luminance(color);
          float numerator = lum * (1.0 + (lum / (whitePoint * whitePoint)));
          float newLum = numerator / (1.0 + lum);
          return color * (newLum / lum);
        }

        // ACES filmic tone mapping
        vec3 acesToneMapping(vec3 color) {
          const float a = 2.51;
          const float b = 0.03;
          const float c = 2.43;
          const float d = 0.59;
          const float e = 0.14;
          return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
        }

        // Neutral tone mapping from Unity
        vec3 neutralToneMapping(vec3 color) {
          const float a = 0.2;
          const float b = 0.29;
          const float c = 0.24;
          const float d = 0.272;
          const float e = 0.02;

          vec3 x = color;
          vec3 whiteScale = 1.0 / ((vec3(11.2) * (a * vec3(11.2) + b)) / (vec3(11.2) * (c * vec3(11.2) + d) + e));
          vec3 curr = ((x * (a * x + b)) / (x * (c * x + d) + e)) * whiteScale;
          return pow(curr, vec3(1.0 / 2.2));
        }

        // Uncharted 2 filmic tone mapping
        vec3 uncharted2Partial(vec3 x) {
          const float A = 0.15;
          const float B = 0.50;
          const float C = 0.10;
          const float D = 0.20;
          const float E = 0.02;
          const float F = 0.30;
          return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
        }

        vec3 uncharted2ToneMapping(vec3 color) {
          const float exposureBias = 2.0;
          vec3 curr = uncharted2Partial(color * exposureBias);
          vec3 W = vec3(11.2);
          vec3 whiteScale = vec3(1.0) / uncharted2Partial(W);
          return curr * whiteScale;
        }

        void main() {
          vec3 color = texture(uTexture, vTexCoord).rgb;

          // Apply exposure
          color *= uExposure;

          // Apply tone mapping
          vec3 mapped;
          if (uOperator == 0) {
            // None
            mapped = color;
          } else if (uOperator == 1) {
            // Reinhard
            mapped = reinhardToneMapping(color);
          } else if (uOperator == 2) {
            // Reinhard Extended
            mapped = reinhardExtendedToneMapping(color, uWhitePoint);
          } else if (uOperator == 3) {
            // ACES
            mapped = acesToneMapping(color);
          } else if (uOperator == 4) {
            // Neutral
            mapped = neutralToneMapping(color);
          } else if (uOperator == 5) {
            // Uncharted 2
            mapped = uncharted2ToneMapping(color);
          } else {
            mapped = color;
          }

          // Gamma correction
          mapped = pow(mapped, vec3(1.0 / uGamma));

          fragColor = vec4(mapped, 1.0);
        }
      `,
    };

    this.toneMapShader = new Shader({
      name: 'ToneMapping',
      source,
      gl: this.gl,
    });
  }

  /**
   * Sets the tone mapping operator.
   *
   * @param operator - Tone mapping operator
   */
  setOperator(operator: ToneMappingOperator): void {
    this.currentOperator = operator;
    this.setParameter('operator', this.operatorToInt(operator));
  }

  /**
   * Gets the current operator.
   */
  getOperator(): ToneMappingOperator {
    return this.currentOperator;
  }

  /**
   * Creates luminance calculation shaders.
   */
  private createLuminanceShaders(): void {
    if (!this.gl) return;

    // Luminance extraction shader
    const luminanceSource: ShaderSource = {
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

        // Calculate log luminance for better averaging
        float luminance(vec3 color) {
          float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
          // Log luminance for geometric mean, add epsilon to prevent log(0)
          return log(max(lum, 0.0001));
        }

        void main() {
          vec3 color = texture(uTexture, vTexCoord).rgb;
          float logLum = luminance(color);
          fragColor = vec4(logLum, 0.0, 0.0, 1.0);
        }
      `,
    };

    this.luminanceShader = new Shader({
      name: 'Luminance',
      source: luminanceSource,
      gl: this.gl,
    });

    // Mipmap reduction shader - averages 2x2 samples
    const mipReduceSource: ShaderSource = {
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

        void main() {
          // Sample 2x2 region and average
          vec2 texelSize = uTexelSize;
          float sum = 0.0;

          sum += texture(uTexture, vTexCoord + vec2(-0.5, -0.5) * texelSize).r;
          sum += texture(uTexture, vTexCoord + vec2( 0.5, -0.5) * texelSize).r;
          sum += texture(uTexture, vTexCoord + vec2(-0.5,  0.5) * texelSize).r;
          sum += texture(uTexture, vTexCoord + vec2( 0.5,  0.5) * texelSize).r;

          float average = sum * 0.25;
          fragColor = vec4(average, 0.0, 0.0, 1.0);
        }
      `,
    };

    this.mipReduceShader = new Shader({
      name: 'MipReduce',
      source: mipReduceSource,
      gl: this.gl,
    });
  }

  /**
   * Creates luminance mipmap chain for average calculation.
   *
   * @param width - Base width
   * @param height - Base height
   */
  private createLuminanceTextures(width: number, height: number): void {
    if (!this.gl) return;

    // Clear existing mips
    for (const mip of this.luminanceMips) {
      mip.destroy();
    }
    this.luminanceMips = [];
    this.luminanceTexture?.destroy();

    // Create base luminance texture
    const descriptor: RenderTextureDescriptor = {
      width,
      height,
      format: TextureFormat.R16F,
      minFilter: TextureFilter.Linear,
      magFilter: TextureFilter.Linear,
      wrapU: TextureWrap.ClampToEdge,
      wrapV: TextureWrap.ClampToEdge,
      depth: false,
      label: 'Luminance',
    };

    this.luminanceTexture = new RenderTexture(descriptor);

    // Create mipmap chain for reduction (downsample to 1x1)
    let mipWidth = Math.floor(width / 2);
    let mipHeight = Math.floor(height / 2);

    while (mipWidth >= 1 && mipHeight >= 1) {
      const mipTexture = new RenderTexture({
        width: mipWidth,
        height: mipHeight,
        format: TextureFormat.R16F,
        minFilter: TextureFilter.Linear,
        magFilter: TextureFilter.Linear,
        wrapU: TextureWrap.ClampToEdge,
        wrapV: TextureWrap.ClampToEdge,
        depth: false,
        label: `LuminanceMip_${this.luminanceMips.length}`,
      });

      this.luminanceMips.push(mipTexture);

      // Stop when we reach 1x1
      if (mipWidth === 1 && mipHeight === 1) break;

      mipWidth = Math.max(1, Math.floor(mipWidth / 2));
      mipHeight = Math.max(1, Math.floor(mipHeight / 2));
    }

    this.tempTextures = [this.luminanceTexture, ...this.luminanceMips];

    logger.debug(`Created luminance mipmap chain with ${this.luminanceMips.length} levels`);
  }

  /**
   * Calculates average scene luminance for auto-exposure.
   * Uses GPU-based mipmap reduction for efficient calculation.
   *
   * @param input - Input texture
   * @returns Average luminance (geometric mean)
   */
  private calculateLuminance(input: RenderTexture): number {
    if (!this.gl || !this.luminanceShader || !this.mipReduceShader ||
        !this.luminanceTexture || this.luminanceMips.length === 0) {
      return 0.18; // Default middle-gray
    }

    const width = input.getWidth();
    const height = input.getHeight();

    // Ensure textures match input size
    if (this.luminanceTexture.getWidth() !== width || this.luminanceTexture.getHeight() !== height) {
      this.createLuminanceTextures(width, height);
    }

    // Pass 1: Extract log luminance from HDR input
    this.luminanceShader.bind();
    this.luminanceShader.setUniform('uTexture', input.getColorTexture());
    this.renderQuad(this.luminanceTexture);

    // Pass 2: Progressive downsampling to 1x1
    let srcTexture: RenderTexture = this.luminanceTexture;

    for (let i = 0; i < this.luminanceMips.length; i++) {
      const dstTexture = this.luminanceMips[i];

      this.mipReduceShader.bind();
      this.mipReduceShader.setUniform('uTexture', srcTexture.getColorTexture());
      this.mipReduceShader.setUniform('uTexelSize', new Vector2(1.0 / srcTexture.getWidth(), 1.0 / srcTexture.getHeight()));
      this.renderQuad(dstTexture);

      srcTexture = dstTexture;
    }

    // Read back final 1x1 pixel containing average log luminance
    const finalMip = this.luminanceMips[this.luminanceMips.length - 1];
    const fb = finalMip.getFramebuffer();

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fb);
    const pixel = new Float32Array(4);
    this.gl.readPixels(0, 0, 1, 1, this.gl.RGBA, this.gl.FLOAT, pixel);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

    // Convert from log luminance back to linear
    const logLuminance = pixel[0];
    const luminance = Math.exp(logLuminance);

    // Clamp to reasonable range
    return Math.max(0.001, Math.min(10.0, luminance));
  }

  /**
   * Updates auto-exposure.
   *
   * @param deltaTime - Delta time
   */
  private updateAutoExposure(deltaTime: number): void {
    const adaptationSpeed = this.getParameter('adaptationSpeed')!.value;

    // Smoothly interpolate to target luminance
    const t = 1.0 - Math.exp(-adaptationSpeed * deltaTime);
    this.currentLuminance = this.currentLuminance + (this.targetLuminance - this.currentLuminance) * t;
  }

  /**
   * Renders tone mapping effect.
   *
   * @param input - Input HDR texture
   * @param output - Output LDR texture
   * @param deltaTime - Delta time
   */
  render(input: RenderTexture, output: RenderTexture, deltaTime: number): void {
    if (!this.enabled || !this.gl || !this.toneMapShader) {
      return;
    }

    let exposure = this.getParameter('exposure')!.value;
    const autoExposure = this.getParameter('autoExposure')!.value;
    const whitePoint = this.getParameter('whitePoint')!.value;
    const gamma = this.getParameter('gamma')!.value;
    const operatorInt = this.getParameter('operator')!.value;

    // Auto-exposure
    if (autoExposure) {
      this.targetLuminance = this.calculateLuminance(input);
      this.updateAutoExposure(deltaTime);
      exposure = 1.0 / Math.max(0.001, this.currentLuminance);
    }

    // Apply tone mapping
    this.toneMapShader.bind();
    this.toneMapShader.setUniform('uTexture', input.getColorTexture());
    this.toneMapShader.setUniform('uOperator', operatorInt);
    this.toneMapShader.setUniform('uExposure', exposure);
    this.toneMapShader.setUniform('uWhitePoint', whitePoint);
    this.toneMapShader.setUniform('uGamma', gamma);
    this.renderQuad(output);
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

  /**
   * Resizes the effect.
   *
   * @param width - New width
   * @param height - New height
   */
  override resize(width: number, height: number): void {
    super.resize(width, height);
    this.createLuminanceTextures(width, height);
  }

  /**
   * Disposes the effect.
   */
  override dispose(): void {
    this.toneMapShader?.dispose();
    this.luminanceShader?.dispose();
    this.mipReduceShader?.dispose();
    super.dispose();
  }
}
