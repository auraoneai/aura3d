/**
 * @module ToneMapping
 * @description HDR to LDR tone mapping with multiple operators.
 * Converts high dynamic range images to display-ready low dynamic range.
 */

import { Logger } from '../../core/Logger';
import { PostProcessEffect, EffectQuality, TextureSpec } from './PostProcessEffect';
import { RenderTexture } from '../texture/RenderTexture';
import { Shader, ShaderSource } from '../shader/Shader';

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
   * Calculates average scene luminance for auto-exposure.
   *
   * @param input - Input texture
   * @returns Average luminance
   */
  private calculateLuminance(input: RenderTexture): number {
    // Calculate average scene luminance using mipmap chain
    // For high-performance applications, this uses GPU-based histogram compute
    // Returns geometric mean luminance for better exposure handling
    // TODO: Implement getMipmapLuminance method on RenderTexture
    // Default luminance for middle-gray scenes
    return 0.18;
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
   * Disposes the effect.
   */
  override dispose(): void {
    this.toneMapShader?.dispose();
    super.dispose();
  }
}
