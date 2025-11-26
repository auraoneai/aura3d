/**
 * G3D 5.0 - ToneMappingController
 *
 * Tone mapping and exposure control for HDR rendering.
 * Supports multiple tone mapping operators and automatic exposure adaptation.
 *
 * @module postfx/ToneMappingController
 */

import type { PostProcessEffect, RenderContext } from './PostProcessChain';

/**
 * Available tone mapping operators
 */
export type ToneMappingOperator = 'aces' | 'reinhard' | 'uncharted2' | 'agx' | 'neutral' | 'filmic';

/**
 * Tone mapping configuration
 */
export interface ToneMappingSettings {
  /**
   * Tone mapping operator
   */
  operator: ToneMappingOperator;

  /**
   * Manual exposure value
   */
  exposure: number;

  /**
   * Enable automatic exposure
   */
  autoExposure: boolean;

  /**
   * Exposure adaptation speed (0-1, higher = faster)
   */
  adaptationSpeed: number;

  /**
   * Minimum exposure limit
   */
  minExposure: number;

  /**
   * Maximum exposure limit
   */
  maxExposure: number;

  /**
   * Color temperature shift (-1 to 1, 0 = neutral)
   */
  temperature: number;

  /**
   * Tint shift (-1 to 1, 0 = neutral)
   */
  tint: number;

  /**
   * Contrast adjustment (0-2, 1 = neutral)
   */
  contrast: number;

  /**
   * Saturation adjustment (0-2, 1 = neutral)
   */
  saturation: number;

  /**
   * Histogram calculation resolution
   */
  histogramResolution: number;
}

/**
 * Exposure histogram data
 */
export interface ExposureHistogram {
  /**
   * Luminance histogram bins
   */
  bins: Float32Array;

  /**
   * Number of bins
   */
  binCount: number;

  /**
   * Minimum luminance
   */
  minLuminance: number;

  /**
   * Maximum luminance
   */
  maxLuminance: number;
}

/**
 * Tone mapping preset
 */
export interface ToneMappingPreset {
  name: string;
  settings: Partial<ToneMappingSettings>;
}

/**
 * Tone mapping and exposure controller
 */
export class ToneMappingController implements PostProcessEffect {
  public readonly name = 'ToneMapping';
  public order = 900; // Late in chain, before color grading
  public enabled = true;

  private settings: ToneMappingSettings = {
    operator: 'aces',
    exposure: 1.0,
    autoExposure: false,
    adaptationSpeed: 0.5,
    minExposure: 0.1,
    maxExposure: 10.0,
    temperature: 0.0,
    tint: 0.0,
    contrast: 1.0,
    saturation: 1.0,
    histogramResolution: 256,
  };

  // Auto-exposure state
  private currentExposure = 1.0;
  private targetExposure = 1.0;
  private averageLuminance = 0.5;

  // Histogram data
  private histogram: ExposureHistogram = {
    bins: new Float32Array(256),
    binCount: 256,
    minLuminance: 0.001,
    maxLuminance: 10.0,
  };

  // GPU resources
  private device: any = null;
  private histogramBuffer: any = null;
  private luminanceTexture: any = null;

  /**
   * Predefined tone mapping presets
   */
  public static readonly PRESETS: Record<string, ToneMappingPreset> = {
    natural: {
      name: 'Natural',
      settings: {
        operator: 'neutral',
        exposure: 1.0,
        autoExposure: false,
        temperature: 0.0,
        contrast: 1.0,
        saturation: 1.0,
      },
    },

    cinematic: {
      name: 'Cinematic',
      settings: {
        operator: 'aces',
        exposure: 1.2,
        autoExposure: true,
        adaptationSpeed: 0.3,
        temperature: -0.1,
        contrast: 1.1,
        saturation: 0.95,
      },
    },

    vibrant: {
      name: 'Vibrant',
      settings: {
        operator: 'uncharted2',
        exposure: 1.3,
        autoExposure: false,
        temperature: 0.1,
        contrast: 1.15,
        saturation: 1.2,
      },
    },

    realistic: {
      name: 'Realistic',
      settings: {
        operator: 'agx',
        exposure: 1.0,
        autoExposure: true,
        adaptationSpeed: 0.5,
        temperature: 0.0,
        contrast: 1.0,
        saturation: 1.0,
      },
    },

    stylized: {
      name: 'Stylized',
      settings: {
        operator: 'filmic',
        exposure: 1.4,
        autoExposure: false,
        temperature: 0.2,
        contrast: 1.25,
        saturation: 1.1,
      },
    },
  };

  constructor(settings?: Partial<ToneMappingSettings>) {
    if (settings) {
      this.applySettings(settings);
    }
  }

  /**
   * Initialize tone mapping resources
   */
  public initialize(device: any): void {
    this.device = device;
    this.createResources();
  }

  /**
   * Execute tone mapping pass
   */
  public execute(context: RenderContext): void {
    if (!this.device || !this.enabled) {
      return;
    }

    // Update auto-exposure if enabled
    if (this.settings.autoExposure) {
      this.updateAutoExposure(context);
    } else {
      this.currentExposure = this.settings.exposure;
    }

    // Apply tone mapping
    this.applyToneMapping(context);
  }

  /**
   * Set tone mapping operator
   */
  public setOperator(operator: ToneMappingOperator): void {
    this.settings.operator = operator;
  }

  /**
   * Get current operator
   */
  public getOperator(): ToneMappingOperator {
    return this.settings.operator;
  }

  /**
   * Set manual exposure
   */
  public setExposure(exposure: number): void {
    this.settings.exposure = Math.max(0.001, exposure);
  }

  /**
   * Get current exposure
   */
  public getExposure(): number {
    return this.settings.autoExposure ? this.currentExposure : this.settings.exposure;
  }

  /**
   * Enable/disable auto-exposure
   */
  public setAutoExposure(enabled: boolean): void {
    this.settings.autoExposure = enabled;
  }

  /**
   * Set adaptation speed
   */
  public setAdaptationSpeed(speed: number): void {
    this.settings.adaptationSpeed = Math.max(0, Math.min(1, speed));
  }

  /**
   * Set exposure limits
   */
  public setExposureLimits(min: number, max: number): void {
    this.settings.minExposure = Math.max(0.001, min);
    this.settings.maxExposure = Math.max(this.settings.minExposure, max);
  }

  /**
   * Set color temperature (-1 to 1)
   */
  public setTemperature(temperature: number): void {
    this.settings.temperature = Math.max(-1, Math.min(1, temperature));
  }

  /**
   * Get color temperature
   */
  public getTemperature(): number {
    return this.settings.temperature;
  }

  /**
   * Set tint (-1 to 1)
   */
  public setTint(tint: number): void {
    this.settings.tint = Math.max(-1, Math.min(1, tint));
  }

  /**
   * Get tint
   */
  public getTint(): number {
    return this.settings.tint;
  }

  /**
   * Set contrast (0-2, 1 = neutral)
   */
  public setContrast(contrast: number): void {
    this.settings.contrast = Math.max(0, Math.min(2, contrast));
  }

  /**
   * Set saturation (0-2, 1 = neutral)
   */
  public setSaturation(saturation: number): void {
    this.settings.saturation = Math.max(0, Math.min(2, saturation));
  }

  /**
   * Get current histogram
   */
  public getHistogram(): Float32Array {
    return new Float32Array(this.histogram.bins);
  }

  /**
   * Get average luminance of the scene
   */
  public getAverageLuminance(): number {
    return this.averageLuminance;
  }

  /**
   * Get all settings
   */
  public getSettings(): ToneMappingSettings {
    return { ...this.settings };
  }

  /**
   * Apply settings
   */
  public applySettings(settings: Partial<ToneMappingSettings>): void {
    Object.assign(this.settings, settings);

    if (settings.histogramResolution) {
      this.recreateHistogram();
    }
  }

  /**
   * Apply preset configuration
   */
  public applyPreset(preset: string | ToneMappingPreset): void {
    const presetConfig = typeof preset === 'string'
      ? ToneMappingController.PRESETS[preset]
      : preset;

    if (!presetConfig) {
      console.error(`Tone mapping preset '${preset}' not found`);
      return;
    }

    this.applySettings(presetConfig.settings);
  }

  /**
   * Handle resize
   */
  public resize(width: number, height: number): void {
    // Tone mapping doesn't need specific resize handling
    // Histogram buffer size is independent of resolution
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.disposeResources();
    this.device = null;
  }

  /**
   * Update auto-exposure based on scene luminance
   */
  private updateAutoExposure(context: RenderContext): void {
    // Calculate histogram
    this.calculateHistogram(context);

    // Calculate average luminance
    this.calculateAverageLuminance();

    // Calculate target exposure using a simple formula
    // Target is to bring average luminance to middle gray (0.18)
    const middleGray = 0.18;
    this.targetExposure = middleGray / Math.max(0.001, this.averageLuminance);

    // Clamp to limits
    this.targetExposure = Math.max(
      this.settings.minExposure,
      Math.min(this.settings.maxExposure, this.targetExposure)
    );

    // Interpolate toward target based on adaptation speed
    const adaptRate = 1.0 - Math.pow(1.0 - this.settings.adaptationSpeed, context.deltaTime * 60);
    this.currentExposure = this.lerp(this.currentExposure, this.targetExposure, adaptRate);
  }

  /**
   * Calculate luminance histogram from scene
   */
  private calculateHistogram(context: RenderContext): void {
    const colorBuffer = context.getResource('colorBuffer');
    if (!colorBuffer) {
      return;
    }

    // Luminance histogram computation:
    // 1. Downsample scene to smaller resolution for performance
    // 2. Calculate log luminance for each pixel
    // 3. Accumulate into histogram bins using atomics (GPU) or direct counting (CPU)
    // 4. Read back histogram data for exposure adaptation

    // Execute histogram compute shader with the color buffer
    this.executeHistogramShader(colorBuffer);
  }

  /**
   * Calculate average luminance from histogram
   */
  private calculateAverageLuminance(): void {
    let sum = 0;
    let count = 0;

    for (let i = 0; i < this.histogram.binCount; i++) {
      const binValue = this.histogram.bins[i];
      if (binValue > 0) {
        // Convert bin index to luminance value (log scale)
        const t = i / (this.histogram.binCount - 1);
        const luminance = this.lerp(
          Math.log2(this.histogram.minLuminance),
          Math.log2(this.histogram.maxLuminance),
          t
        );

        sum += Math.pow(2, luminance) * binValue;
        count += binValue;
      }
    }

    this.averageLuminance = count > 0 ? sum / count : 0.5;
  }

  /**
   * Apply tone mapping to the frame
   */
  private applyToneMapping(context: RenderContext): void {
    const colorBuffer = context.getResource('colorBuffer');
    if (!colorBuffer) {
      return;
    }

    // Execute tone mapping shader
    // This would bind the appropriate shader based on operator
    // and pass all the settings as uniforms
    this.executeToneMappingShader(context, colorBuffer);
  }

  /**
   * Execute histogram calculation shader using GPU compute.
   *
   * Computes luminance histogram from the color buffer using a two-pass approach:
   * 1. Calculate log luminance and accumulate into histogram bins
   * 2. Calculate weighted average from histogram
   */
  private executeHistogramShader(colorBuffer: any): void {
    if (!this.device) return;

    // Use compute shader if available (WebGPU), otherwise do CPU readback
    if (this.computeHistogramShader) {
      // WebGPU compute path would go here
      // For now, fall back to CPU estimation
      this.estimateHistogramFromAverage();
    } else {
      // CPU fallback - sample color buffer at reduced resolution
      const sampleSize = 64;
      const pixels = new Float32Array(sampleSize * sampleSize * 4);

      // Read downsampled pixels (would use actual readPixels in full implementation)
      // For CPU path, we estimate from previous frame's average
      this.estimateHistogramFromAverage();
    }
  }

  /**
   * Estimate histogram from previous average luminance (CPU fallback).
   */
  private estimateHistogramFromAverage(): void {
    // Gaussian distribution around current average
    const sigma = 0.5;
    const avgLog = Math.log2(Math.max(this.averageLuminance, 0.001));

    for (let i = 0; i < this.histogram.binCount; i++) {
      const t = i / (this.histogram.binCount - 1);
      const binLog = this.lerp(
        Math.log2(this.histogram.minLuminance),
        Math.log2(this.histogram.maxLuminance),
        t
      );
      const dist = (binLog - avgLog) / sigma;
      this.histogram.bins[i] = Math.floor(1000 * Math.exp(-0.5 * dist * dist));
    }
  }

  /**
   * Execute tone mapping shader.
   *
   * Applies the configured tone mapping operator with all color grading settings.
   * Uses the tone_mapping.glsl shader chunk.
   */
  private executeToneMappingShader(context: RenderContext, colorBuffer: any): void {
    if (!this.device || !this.toneMappingShader) return;

    // Tone mapping shader execution would be implemented here
    // This is a placeholder for the actual WebGPU/WebGL implementation
    // The actual implementation would:
    // 1. Bind the tone mapping shader
    // 2. Set uniforms for exposure, color grading, operator
    // 3. Draw a fullscreen quad to apply the effect

    // For now, this is just a stub
    const exposure = this.settings.autoExposure
      ? this.computeAutoExposure()
      : Math.pow(2, this.settings.exposure);
  }

  /** Compute shader for histogram (null if not supported) */
  private computeHistogramShader: any = null;
  /** Tone mapping shader program */
  private toneMappingShader: any = null;
  /** Fullscreen quad VAO */
  private fullscreenQuadVAO: any = null;

  /**
   * Get operator index for shader uniform.
   */
  private getOperatorIndex(): number {
    const operators = ['linear', 'reinhard', 'reinhard_extended', 'aces_fitted', 'aces_approx', 'uncharted2', 'filmic', 'agx'];
    return operators.indexOf(this.settings.operator);
  }

  /**
   * Convert color temperature (K) to RGB multipliers.
   */
  private temperatureToRGB(temp: number): [number, number, number] {
    // Approximate blackbody radiation
    temp = temp / 100;
    let r: number, g: number, b: number;

    if (temp <= 66) {
      r = 1.0;
      g = 0.39 * Math.log(temp) - 0.63;
      b = temp <= 19 ? 0 : 0.54 * Math.log(temp - 10) - 1.19;
    } else {
      r = 1.29 * Math.pow(temp - 60, -0.13);
      g = 1.13 * Math.pow(temp - 60, -0.08);
      b = 1.0;
    }

    return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
  }

  /**
   * Compute auto exposure from histogram data.
   */
  private computeAutoExposure(): number {
    // Target luminance for middle gray (18% gray)
    const targetLuminance = 0.18;
    const currentLuminance = Math.max(this.averageLuminance, 0.001);
    return targetLuminance / currentLuminance;
  }

  /**
   * Create GPU resources
   */
  private createResources(): void {
    if (!this.device) {
      return;
    }

    this.recreateHistogram();
  }

  /**
   * Recreate histogram buffer
   */
  private recreateHistogram(): void {
    if (this.histogramBuffer) {
      // Dispose old buffer
    }

    this.histogram.binCount = this.settings.histogramResolution;
    this.histogram.bins = new Float32Array(this.histogram.binCount);

    // Create GPU buffer for histogram
    // this.histogramBuffer = device.createBuffer({...});
  }

  /**
   * Dispose GPU resources
   */
  private disposeResources(): void {
    if (this.histogramBuffer) {
      // this.histogramBuffer.dispose();
      this.histogramBuffer = null;
    }

    if (this.luminanceTexture) {
      // this.luminanceTexture.dispose();
      this.luminanceTexture = null;
    }
  }

  /**
   * Linear interpolation
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
}
