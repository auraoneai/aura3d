/**
 * @module ColorGrading
 * @description Color correction and grading with LUT support.
 * Provides comprehensive color manipulation tools including lift/gamma/gain,
 * saturation, contrast, temperature, tint, and vignette effects.
 */

import { Logger } from '../../core/Logger';
import { PostProcessEffect, EffectQuality, TextureSpec } from './PostProcessEffect';
import { RenderTexture } from '../texture/RenderTexture';
import { Shader, ShaderSource } from '../shader/Shader';
import { Texture } from '../texture/Texture';
import { Vector3, Vector4, Color } from '../../math';

const logger = Logger.create('ColorGrading');

/**
 * Color grading parameters.
 */
export interface ColorGradingParameters {
  /** Lift (shadows) adjustment (default: (0, 0, 0)) */
  lift?: Vector3;
  /** Gamma (midtones) adjustment (default: (1, 1, 1)) */
  gamma?: Vector3;
  /** Gain (highlights) adjustment (default: (1, 1, 1)) */
  gain?: Vector3;
  /** Saturation (default: 1.0) */
  saturation?: number;
  /** Contrast (default: 1.0) */
  contrast?: number;
  /** Brightness (default: 0.0) */
  brightness?: number;
  /** Color temperature in Kelvin (default: 6500) */
  temperature?: number;
  /** Tint adjustment (default: 0.0) */
  tint?: number;
  /** Vignette intensity (default: 0.0) */
  vignetteIntensity?: number;
  /** Vignette smoothness (default: 0.5) */
  vignetteSmoothness?: number;
  /** Vignette color (default: black) */
  vignetteColor?: Color;
  /** LUT texture for advanced grading (default: null) */
  lutTexture?: Texture | null;
  /** LUT intensity (default: 1.0) */
  lutIntensity?: number;
  /** Enable/disable effect (default: true) */
  enabled?: boolean;
  /** Quality preset (default: Medium) */
  quality?: EffectQuality;
}

/**
 * Color Grading effect.
 * Provides comprehensive color correction and grading tools including
 * lift/gamma/gain controls, saturation, contrast, temperature, tint,
 * vignette, and LUT (lookup table) support.
 *
 * @example
 * ```typescript
 * const colorGrading = new ColorGrading({
 *   lift: new Vector3(0.0, 0.0, 0.0),
 *   gamma: new Vector3(1.0, 1.0, 1.0),
 *   gain: new Vector3(1.0, 1.0, 1.0),
 *   saturation: 1.1,
 *   contrast: 1.05,
 *   temperature: 6500,
 *   vignetteIntensity: 0.3,
 *   quality: EffectQuality.High
 * });
 *
 * stack.addEffect(colorGrading);
 *
 * // Adjust color
 * colorGrading.setParameter('saturation', 1.2);
 * colorGrading.setParameter('temperature', 7000);
 * ```
 */
export class ColorGrading extends PostProcessEffect {
  /** Color grading shader */
  private gradingShader: Shader | null = null;

  /** LUT texture for advanced grading */
  private lutTexture: Texture | null = null;

  /**
   * Creates a new ColorGrading effect.
   *
   * @param params - Color grading parameters
   */
  constructor(params: ColorGradingParameters = {}) {
    super('ColorGrading');

    this.enabled = params.enabled ?? true;
    this.quality = params.quality ?? EffectQuality.Medium;
    this.lutTexture = params.lutTexture ?? null;

    // Add parameters
    this.addParameter({
      name: 'lift',
      type: 'vec3',
      value: params.lift ?? new Vector3(0, 0, 0),
      description: 'Lift (shadows) adjustment',
    });

    this.addParameter({
      name: 'gamma',
      type: 'vec3',
      value: params.gamma ?? new Vector3(1, 1, 1),
      description: 'Gamma (midtones) adjustment',
    });

    this.addParameter({
      name: 'gain',
      type: 'vec3',
      value: params.gain ?? new Vector3(1, 1, 1),
      description: 'Gain (highlights) adjustment',
    });

    this.addParameter({
      name: 'saturation',
      type: 'float',
      value: params.saturation ?? 1.0,
      range: [0, 2],
      description: 'Saturation',
    });

    this.addParameter({
      name: 'contrast',
      type: 'float',
      value: params.contrast ?? 1.0,
      range: [0, 2],
      description: 'Contrast',
    });

    this.addParameter({
      name: 'brightness',
      type: 'float',
      value: params.brightness ?? 0.0,
      range: [-1, 1],
      description: 'Brightness',
    });

    this.addParameter({
      name: 'temperature',
      type: 'float',
      value: params.temperature ?? 6500.0,
      range: [1000, 40000],
      description: 'Color temperature in Kelvin',
    });

    this.addParameter({
      name: 'tint',
      type: 'float',
      value: params.tint ?? 0.0,
      range: [-1, 1],
      description: 'Tint adjustment',
    });

    this.addParameter({
      name: 'vignetteIntensity',
      type: 'float',
      value: params.vignetteIntensity ?? 0.0,
      range: [0, 1],
      description: 'Vignette intensity',
    });

    this.addParameter({
      name: 'vignetteSmoothness',
      type: 'float',
      value: params.vignetteSmoothness ?? 0.5,
      range: [0, 1],
      description: 'Vignette smoothness',
    });

    this.addParameter({
      name: 'vignetteColor',
      type: 'vec3',
      value: params.vignetteColor ?? Color.black(),
      description: 'Vignette color',
    });

    this.addParameter({
      name: 'lutIntensity',
      type: 'float',
      value: params.lutIntensity ?? 1.0,
      range: [0, 1],
      description: 'LUT intensity',
    });
  }

  /**
   * Initializes color grading effect.
   *
   * @param gl - WebGL2 context
   */
  override initialize(gl: WebGL2RenderingContext): void {
    super.initialize(gl);
    this.createShader();
    logger.info('ColorGrading initialized');
  }

  /**
   * Creates color grading shader.
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
        uniform sampler3D uLUTTexture;

        uniform vec3 uLift;
        uniform vec3 uGamma;
        uniform vec3 uGain;
        uniform float uSaturation;
        uniform float uContrast;
        uniform float uBrightness;
        uniform float uTemperature;
        uniform float uTint;
        uniform float uVignetteIntensity;
        uniform float uVignetteSmoothness;
        uniform vec3 uVignetteColor;
        uniform float uLUTIntensity;
        uniform bool uUseLUT;

        // Luminance calculation
        float luminance(vec3 color) {
          return dot(color, vec3(0.2126, 0.7152, 0.0722));
        }

        // Temperature to RGB
        vec3 temperatureToRGB(float temperature) {
          float t = clamp(temperature, 1000.0, 40000.0) / 100.0;

          vec3 rgb;

          // Red
          if (t <= 66.0) {
            rgb.r = 1.0;
          } else {
            rgb.r = clamp(1.29293618606 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
          }

          // Green
          if (t <= 66.0) {
            rgb.g = clamp(0.39008157876 * log(t) - 0.63184144378, 0.0, 1.0);
          } else {
            rgb.g = clamp(1.12989086089 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
          }

          // Blue
          if (t >= 66.0) {
            rgb.b = 1.0;
          } else if (t <= 19.0) {
            rgb.b = 0.0;
          } else {
            rgb.b = clamp(0.54320678911 * log(t - 10.0) - 1.19625408914, 0.0, 1.0);
          }

          return rgb;
        }

        // Lift/Gamma/Gain color grading
        vec3 liftGammaGain(vec3 color, vec3 lift, vec3 gamma, vec3 gain) {
          // Lift (shadows)
          color = color + lift;

          // Gamma (midtones)
          color = pow(max(color, vec3(0.0)), gamma);

          // Gain (highlights)
          color = color * gain;

          return color;
        }

        // Saturation adjustment
        vec3 adjustSaturation(vec3 color, float saturation) {
          float luma = luminance(color);
          return mix(vec3(luma), color, saturation);
        }

        // Contrast adjustment
        vec3 adjustContrast(vec3 color, float contrast) {
          return (color - 0.5) * contrast + 0.5;
        }

        // Vignette effect
        vec3 applyVignette(vec3 color, vec2 uv, float intensity, float smoothness, vec3 vignetteColor) {
          vec2 center = uv - 0.5;
          float dist = length(center);
          float vignette = smoothstep(0.8, 0.8 - smoothness, dist * intensity * 2.0);
          return mix(vignetteColor, color, vignette);
        }

        // LUT sampling
        vec3 sampleLUT(sampler3D lut, vec3 color) {
          // Assumes 32x32x32 LUT
          const float lutSize = 32.0;
          vec3 scale = vec3((lutSize - 1.0) / lutSize);
          vec3 offset = vec3(0.5 / lutSize);
          return texture(lut, color * scale + offset).rgb;
        }

        void main() {
          vec3 color = texture(uTexture, vTexCoord).rgb;

          // Brightness
          color += uBrightness;

          // Lift/Gamma/Gain
          color = liftGammaGain(color, uLift, uGamma, uGain);

          // Contrast
          color = adjustContrast(color, uContrast);

          // Saturation
          color = adjustSaturation(color, uSaturation);

          // Temperature
          vec3 tempColor = temperatureToRGB(uTemperature);
          color *= tempColor;

          // Tint (green-magenta)
          color.r += uTint * 0.1;
          color.b -= uTint * 0.1;

          // LUT
          if (uUseLUT) {
            vec3 lutColor = sampleLUT(uLUTTexture, clamp(color, 0.0, 1.0));
            color = mix(color, lutColor, uLUTIntensity);
          }

          // Vignette
          if (uVignetteIntensity > 0.0) {
            color = applyVignette(color, vTexCoord, uVignetteIntensity, uVignetteSmoothness, uVignetteColor);
          }

          fragColor = vec4(color, 1.0);
        }
      `,
    };

    this.gradingShader = new Shader({
      name: 'ColorGrading',
      source,
      gl: this.gl,
    });
  }

  /**
   * Sets the LUT texture.
   *
   * @param texture - LUT texture (3D texture)
   */
  setLUTTexture(texture: Texture | null): void {
    this.lutTexture = texture;
  }

  /**
   * Renders color grading effect.
   *
   * @param input - Input texture
   * @param output - Output texture
   * @param deltaTime - Delta time
   */
  render(input: RenderTexture, output: RenderTexture, deltaTime: number): void {
    if (!this.enabled || !this.gl || !this.gradingShader) {
      return;
    }

    const lift = this.getParameter('lift')!.value as Vector3;
    const gamma = this.getParameter('gamma')!.value as Vector3;
    const gain = this.getParameter('gain')!.value as Vector3;
    const saturation = this.getParameter('saturation')!.value;
    const contrast = this.getParameter('contrast')!.value;
    const brightness = this.getParameter('brightness')!.value;
    const temperature = this.getParameter('temperature')!.value;
    const tint = this.getParameter('tint')!.value;
    const vignetteIntensity = this.getParameter('vignetteIntensity')!.value;
    const vignetteSmoothness = this.getParameter('vignetteSmoothness')!.value;
    const vignetteColor = this.getParameter('vignetteColor')!.value as Color;
    const lutIntensity = this.getParameter('lutIntensity')!.value;

    this.gradingShader.bind();
    this.gradingShader.setUniform('uTexture', input.getColorTexture());

    // Lift/Gamma/Gain
    this.gradingShader.setUniform('uLift', lift);
    this.gradingShader.setUniform('uGamma', gamma);
    this.gradingShader.setUniform('uGain', gain);

    // Basic adjustments
    this.gradingShader.setUniform('uSaturation', saturation);
    this.gradingShader.setUniform('uContrast', contrast);
    this.gradingShader.setUniform('uBrightness', brightness);

    // Temperature and tint
    this.gradingShader.setUniform('uTemperature', temperature);
    this.gradingShader.setUniform('uTint', tint);

    // Vignette
    this.gradingShader.setUniform('uVignetteIntensity', vignetteIntensity);
    this.gradingShader.setUniform('uVignetteSmoothness', vignetteSmoothness);
    this.gradingShader.setUniform('uVignetteColor', vignetteColor);

    // LUT
    if (this.lutTexture) {
      this.gradingShader.setUniform('uLUTTexture', this.lutTexture);
      this.gradingShader.setUniform('uLUTIntensity', lutIntensity);
      this.gradingShader.setUniform('uUseLUT', true);
    } else {
      this.gradingShader.setUniform('uUseLUT', false);
    }

    this.renderQuad(output);
  }

  /**
   * Disposes the effect.
   */
  override dispose(): void {
    this.gradingShader?.dispose();
    super.dispose();
  }
}
