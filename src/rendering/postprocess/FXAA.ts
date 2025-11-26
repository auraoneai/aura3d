/**
 * @module FXAA
 * @description Fast Approximate Anti-Aliasing (FXAA) post-processing effect.
 * Provides efficient anti-aliasing with edge detection and subpixel handling.
 */

import { Logger } from '../../core/Logger';
import { PostProcessEffect, EffectQuality, TextureSpec } from './PostProcessEffect';
import { RenderTexture } from '../texture/RenderTexture';
import { Shader, ShaderSource } from '../shader/Shader';
import { Vector2 } from '../../math/Vector2';

const logger = Logger.create('FXAA');

/**
 * FXAA quality preset.
 */
export enum FXAAPreset {
  /** Low quality - fast but lower visual quality */
  Low = 'low',
  /** Medium quality - balanced */
  Medium = 'medium',
  /** High quality - slower but better results */
  High = 'high',
  /** Ultra quality - maximum quality */
  Ultra = 'ultra',
}

/**
 * FXAA parameters.
 */
export interface FXAAParameters {
  /** Edge threshold for detection (default: 0.125) */
  edgeThreshold?: number;
  /** Minimum edge threshold (default: 0.0312) */
  edgeThresholdMin?: number;
  /** Subpixel quality (default: 0.75) */
  subpixelQuality?: number;
  /** FXAA preset (default: Medium) */
  preset?: FXAAPreset;
  /** Enable/disable effect (default: true) */
  enabled?: boolean;
  /** Quality preset (default: Medium) */
  quality?: EffectQuality;
}

/**
 * Fast Approximate Anti-Aliasing (FXAA) effect.
 * Provides efficient post-process anti-aliasing using edge detection
 * and intelligent blurring along edges.
 *
 * FXAA is faster than MSAA and works with all rendering pipelines.
 * It's particularly effective for reducing shader aliasing and
 * geometric aliasing at a low performance cost.
 *
 * @example
 * ```typescript
 * const fxaa = new FXAA({
 *   preset: FXAAPreset.High,
 *   edgeThreshold: 0.125,
 *   subpixelQuality: 0.75,
 *   quality: EffectQuality.High
 * });
 *
 * stack.addEffect(fxaa);
 *
 * // Adjust edge detection
 * fxaa.setParameter('edgeThreshold', 0.1);
 * ```
 */
export class FXAA extends PostProcessEffect {
  /** FXAA shader */
  private fxaaShader: Shader | null = null;

  /** FXAA preset */
  private preset: FXAAPreset = FXAAPreset.Medium;

  /** Search steps for edge tracing */
  private searchSteps: number = 16;

  /** Search threshold */
  private searchThreshold: number = 0.25;

  /**
   * Creates a new FXAA effect.
   *
   * @param params - FXAA parameters
   */
  constructor(params: FXAAParameters = {}) {
    super('FXAA');

    this.enabled = params.enabled ?? true;
    this.quality = params.quality ?? EffectQuality.Medium;
    this.preset = params.preset ?? FXAAPreset.Medium;

    // Add parameters
    this.addParameter({
      name: 'edgeThreshold',
      type: 'float',
      value: params.edgeThreshold ?? 0.125,
      range: [0.063, 0.333],
      description: 'Edge detection threshold',
    });

    this.addParameter({
      name: 'edgeThresholdMin',
      type: 'float',
      value: params.edgeThresholdMin ?? 0.0312,
      range: [0.0312, 0.0833],
      description: 'Minimum edge threshold',
    });

    this.addParameter({
      name: 'subpixelQuality',
      type: 'float',
      value: params.subpixelQuality ?? 0.75,
      range: [0, 1],
      description: 'Subpixel anti-aliasing quality',
    });

    this.updatePresetSettings();
  }

  /**
   * Updates settings based on preset.
   */
  private updatePresetSettings(): void {
    switch (this.preset) {
      case FXAAPreset.Low:
        this.searchSteps = 8;
        this.searchThreshold = 0.25;
        break;
      case FXAAPreset.Medium:
        this.searchSteps = 16;
        this.searchThreshold = 0.25;
        break;
      case FXAAPreset.High:
        this.searchSteps = 24;
        this.searchThreshold = 0.125;
        break;
      case FXAAPreset.Ultra:
        this.searchSteps = 32;
        this.searchThreshold = 0.063;
        break;
    }
  }

  /**
   * Initializes FXAA effect.
   *
   * @param gl - WebGL2 context
   */
  override initialize(gl: WebGL2RenderingContext): void {
    super.initialize(gl);
    this.createShader();
    logger.info(`FXAA initialized with ${this.preset} preset`);
  }

  /**
   * Creates FXAA shader.
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
        uniform vec2 uTexelSize;
        uniform float uEdgeThreshold;
        uniform float uEdgeThresholdMin;
        uniform float uSubpixelQuality;
        uniform int uSearchSteps;
        uniform float uSearchThreshold;

        // Luminance calculation
        float luminance(vec3 color) {
          return dot(color, vec3(0.299, 0.587, 0.114));
        }

        void main() {
          vec3 rgbM = texture(uTexture, vTexCoord).rgb;
          float lumaM = luminance(rgbM);

          // Sample neighbors
          vec3 rgbN = texture(uTexture, vTexCoord + vec2(0.0, -1.0) * uTexelSize).rgb;
          vec3 rgbS = texture(uTexture, vTexCoord + vec2(0.0,  1.0) * uTexelSize).rgb;
          vec3 rgbW = texture(uTexture, vTexCoord + vec2(-1.0, 0.0) * uTexelSize).rgb;
          vec3 rgbE = texture(uTexture, vTexCoord + vec2( 1.0, 0.0) * uTexelSize).rgb;

          float lumaN = luminance(rgbN);
          float lumaS = luminance(rgbS);
          float lumaW = luminance(rgbW);
          float lumaE = luminance(rgbE);

          // Find range
          float rangeMin = min(lumaM, min(min(lumaN, lumaS), min(lumaW, lumaE)));
          float rangeMax = max(lumaM, max(max(lumaN, lumaS), max(lumaW, lumaE)));
          float range = rangeMax - rangeMin;

          // Early exit if contrast is too low
          if (range < max(uEdgeThresholdMin, rangeMax * uEdgeThreshold)) {
            fragColor = vec4(rgbM, 1.0);
            return;
          }

          // Sample diagonal neighbors
          vec3 rgbNW = texture(uTexture, vTexCoord + vec2(-1.0, -1.0) * uTexelSize).rgb;
          vec3 rgbNE = texture(uTexture, vTexCoord + vec2( 1.0, -1.0) * uTexelSize).rgb;
          vec3 rgbSW = texture(uTexture, vTexCoord + vec2(-1.0,  1.0) * uTexelSize).rgb;
          vec3 rgbSE = texture(uTexture, vTexCoord + vec2( 1.0,  1.0) * uTexelSize).rgb;

          float lumaNW = luminance(rgbNW);
          float lumaNE = luminance(rgbNE);
          float lumaSW = luminance(rgbSW);
          float lumaSE = luminance(rgbSE);

          // Calculate edge direction
          float edgeHorz = abs((lumaN + lumaS) - 2.0 * lumaM) * 2.0 +
                           abs((lumaNE + lumaSE) - 2.0 * lumaE) +
                           abs((lumaNW + lumaSW) - 2.0 * lumaW);

          float edgeVert = abs((lumaW + lumaE) - 2.0 * lumaM) * 2.0 +
                           abs((lumaNW + lumaNE) - 2.0 * lumaN) +
                           abs((lumaSW + lumaSE) - 2.0 * lumaS);

          bool isHorizontal = edgeHorz >= edgeVert;

          // Choose edge samples
          float luma1 = isHorizontal ? lumaS : lumaE;
          float luma2 = isHorizontal ? lumaN : lumaW;
          float gradient1 = abs(luma1 - lumaM);
          float gradient2 = abs(luma2 - lumaM);

          // Choose search direction
          bool is1Steepest = gradient1 >= gradient2;
          float gradientScaled = 0.25 * max(gradient1, gradient2);

          // Average luma in direction
          float lumaLocalAverage = 0.0;
          if (is1Steepest) {
            lumaLocalAverage = 0.5 * (luma1 + lumaM);
          } else {
            lumaLocalAverage = 0.5 * (luma2 + lumaM);
          }

          // Edge search
          vec2 posB = vTexCoord;
          vec2 offNP = isHorizontal ? vec2(uTexelSize.x, 0.0) : vec2(0.0, uTexelSize.y);

          if (!is1Steepest) {
            offNP = -offNP;
          }

          vec2 posN = posB - offNP;
          vec2 posP = posB + offNP;

          float lumaEndN = luminance(texture(uTexture, posN).rgb);
          float lumaEndP = luminance(texture(uTexture, posP).rgb);

          lumaEndN -= lumaLocalAverage;
          lumaEndP -= lumaLocalAverage;

          bool doneN = abs(lumaEndN) >= gradientScaled;
          bool doneP = abs(lumaEndP) >= gradientScaled;

          // Edge search loop
          if (!doneN) {
            for (int i = 0; i < uSearchSteps; i++) {
              if (!doneN) {
                posN -= offNP;
                lumaEndN = luminance(texture(uTexture, posN).rgb) - lumaLocalAverage;
                doneN = abs(lumaEndN) >= gradientScaled;
              }
            }
          }

          if (!doneP) {
            for (int i = 0; i < uSearchSteps; i++) {
              if (!doneP) {
                posP += offNP;
                lumaEndP = luminance(texture(uTexture, posP).rgb) - lumaLocalAverage;
                doneP = abs(lumaEndP) >= gradientScaled;
              }
            }
          }

          // Calculate distances
          float dstN = isHorizontal ? (vTexCoord.x - posN.x) : (vTexCoord.y - posN.y);
          float dstP = isHorizontal ? (posP.x - vTexCoord.x) : (posP.y - vTexCoord.y);

          bool goodSpanN = lumaEndN < 0.0 != (lumaM < lumaLocalAverage);
          bool goodSpanP = lumaEndP < 0.0 != (lumaM < lumaLocalAverage);
          bool directionN = dstN < dstP;

          float dst = min(dstN, dstP);
          bool goodSpan = directionN ? goodSpanN : goodSpanP;

          // Subpixel anti-aliasing
          float lumaRange = range;
          float subpixelOffset = (-2.0 * ((lumaN + lumaS + lumaW + lumaE) * 0.25 - lumaM) / lumaRange);
          subpixelOffset = clamp(abs(subpixelOffset), 0.0, 1.0);
          subpixelOffset = smoothstep(0.0, 1.0, subpixelOffset);
          subpixelOffset = subpixelOffset * subpixelOffset * uSubpixelQuality;

          // Calculate final offset
          float pixelOffset = max(goodSpan ? dst : 0.0, subpixelOffset);
          float finalOffset = pixelOffset / (2.0 * (isHorizontal ? uTexelSize.y : uTexelSize.x));

          // Sample with offset
          vec2 finalUV = vTexCoord;
          if (isHorizontal) {
            finalUV.y += (is1Steepest ? 1.0 : -1.0) * finalOffset;
          } else {
            finalUV.x += (is1Steepest ? 1.0 : -1.0) * finalOffset;
          }

          vec3 rgbFinal = texture(uTexture, finalUV).rgb;
          fragColor = vec4(rgbFinal, 1.0);
        }
      `,
    };

    this.fxaaShader = new Shader({
      name: 'FXAA',
      source,
      gl: this.gl,
    });
  }

  /**
   * Sets FXAA preset.
   *
   * @param preset - FXAA preset
   */
  setPreset(preset: FXAAPreset): void {
    this.preset = preset;
    this.updatePresetSettings();
  }

  /**
   * Gets current preset.
   */
  getPreset(): FXAAPreset {
    return this.preset;
  }

  /**
   * Renders FXAA effect.
   *
   * @param input - Input texture
   * @param output - Output texture
   * @param deltaTime - Delta time
   */
  render(input: RenderTexture, output: RenderTexture, deltaTime: number): void {
    if (!this.enabled || !this.gl || !this.fxaaShader) {
      return;
    }

    const edgeThreshold = this.getParameter('edgeThreshold')!.value;
    const edgeThresholdMin = this.getParameter('edgeThresholdMin')!.value;
    const subpixelQuality = this.getParameter('subpixelQuality')!.value;

    const width = input.getWidth();
    const height = input.getHeight();

    this.fxaaShader.bind();
    this.fxaaShader.setUniform('uTexture', input.getColorTexture());
    this.fxaaShader.setUniform('uTexelSize', new Vector2(1.0 / width, 1.0 / height));
    this.fxaaShader.setUniform('uEdgeThreshold', edgeThreshold);
    this.fxaaShader.setUniform('uEdgeThresholdMin', edgeThresholdMin);
    this.fxaaShader.setUniform('uSubpixelQuality', subpixelQuality);
    this.fxaaShader.setUniform('uSearchSteps', this.searchSteps);
    this.fxaaShader.setUniform('uSearchThreshold', this.searchThreshold);
    this.renderQuad(output);
  }

  /**
   * Called when quality changes.
   */
  protected override onQualityChanged(): void {
    // Map quality to preset
    switch (this.quality) {
      case EffectQuality.Low:
        this.preset = FXAAPreset.Low;
        break;
      case EffectQuality.Medium:
        this.preset = FXAAPreset.Medium;
        break;
      case EffectQuality.High:
        this.preset = FXAAPreset.High;
        break;
      case EffectQuality.Ultra:
        this.preset = FXAAPreset.Ultra;
        break;
    }
    this.updatePresetSettings();
  }

  /**
   * Disposes the effect.
   */
  override dispose(): void {
    this.fxaaShader?.dispose();
    super.dispose();
  }
}
