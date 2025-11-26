/**
 * G3D Architectural Visualization - Post-Processing Setup
 * Advanced post-processing effects for photorealistic rendering
 */

import { Vector3 } from 'g3d';

export type ToneMappingMode = 'linear' | 'reinhard' | 'aces' | 'filmic' | 'uncharted2';

export interface PostProcessingSettings {
  // Tone Mapping
  toneMappingMode: ToneMappingMode;
  exposure: number;
  contrast: number;

  // Color Grading
  temperature: number; // -1 to 1 (cool to warm)
  tint: number; // -1 to 1 (green to magenta)
  saturation: number; // 0 to 2
  vibrance: number; // 0 to 2

  // Bloom
  bloomEnabled: boolean;
  bloomThreshold: number;
  bloomIntensity: number;
  bloomRadius: number;

  // Depth of Field
  dofEnabled: boolean;
  dofFocusDistance: number;
  dofFocusRange: number;
  dofBokehSize: number;

  // Vignette
  vignetteEnabled: boolean;
  vignetteIntensity: number;
  vignetteSmoothness: number;

  // Chromatic Aberration
  chromaticAberrationEnabled: boolean;
  chromaticAberrationIntensity: number;

  // Film Grain
  filmGrainEnabled: boolean;
  filmGrainIntensity: number;
  filmGrainSize: number;

  // Sharpening
  sharpenEnabled: boolean;
  sharpenIntensity: number;
}

/**
 * Post-processing controller for architectural visualization
 */
export class PostProcessing {
  private settings: PostProcessingSettings;

  constructor() {
    this.settings = this.getDefaultSettings();
  }

  /**
   * Get default post-processing settings optimized for arch-viz
   */
  private getDefaultSettings(): PostProcessingSettings {
    return {
      // Tone Mapping - ACES for photorealistic results
      toneMappingMode: 'aces',
      exposure: 1.0,
      contrast: 1.05,

      // Color Grading - Neutral with slight warmth
      temperature: 0.05,
      tint: 0.0,
      saturation: 1.1,
      vibrance: 1.15,

      // Bloom - Subtle glow for highlights
      bloomEnabled: true,
      bloomThreshold: 1.2,
      bloomIntensity: 0.3,
      bloomRadius: 0.8,

      // Depth of Field - Disabled by default
      dofEnabled: false,
      dofFocusDistance: 10.0,
      dofFocusRange: 5.0,
      dofBokehSize: 1.0,

      // Vignette - Subtle darkening
      vignetteEnabled: true,
      vignetteIntensity: 0.2,
      vignetteSmoothness: 0.8,

      // Chromatic Aberration - Very subtle
      chromaticAberrationEnabled: true,
      chromaticAberrationIntensity: 0.5,

      // Film Grain - Adds realism
      filmGrainEnabled: true,
      filmGrainIntensity: 0.03,
      filmGrainSize: 1.5,

      // Sharpening - Enhance details
      sharpenEnabled: true,
      sharpenIntensity: 0.3,
    };
  }

  /**
   * Apply ACES tone mapping
   */
  private acesToneMapping(color: Vector3): Vector3 {
    const a = 2.51;
    const b = 0.03;
    const c = 2.43;
    const d = 0.59;
    const e = 0.14;

    return new Vector3(
      this.acesFormula(color.x, a, b, c, d, e),
      this.acesFormula(color.y, a, b, c, d, e),
      this.acesFormula(color.z, a, b, c, d, e)
    );
  }

  private acesFormula(x: number, a: number, b: number, c: number, d: number, e: number): number {
    return Math.max(0, (x * (a * x + b)) / (x * (c * x + d) + e));
  }

  /**
   * Apply Filmic tone mapping (Uncharted 2)
   */
  private filmicToneMapping(color: Vector3): Vector3 {
    const A = 0.15;
    const B = 0.50;
    const C = 0.10;
    const D = 0.20;
    const E = 0.02;
    const F = 0.30;
    const W = 11.2;

    const filmicCurve = (x: number) => {
      return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
    };

    const curr = new Vector3(
      filmicCurve(color.x),
      filmicCurve(color.y),
      filmicCurve(color.z)
    );

    const whiteScale = 1.0 / filmicCurve(W);

    return new Vector3(
      curr.x * whiteScale,
      curr.y * whiteScale,
      curr.z * whiteScale
    );
  }

  /**
   * Apply Reinhard tone mapping
   */
  private reinhardToneMapping(color: Vector3): Vector3 {
    return new Vector3(
      color.x / (1 + color.x),
      color.y / (1 + color.y),
      color.z / (1 + color.z)
    );
  }

  /**
   * Apply exposure
   */
  private applyExposure(color: Vector3, exposure: number): Vector3 {
    const scale = Math.pow(2, exposure);
    return new Vector3(
      color.x * scale,
      color.y * scale,
      color.z * scale
    );
  }

  /**
   * Apply contrast
   */
  private applyContrast(color: Vector3, contrast: number): Vector3 {
    return new Vector3(
      Math.pow(color.x, contrast),
      Math.pow(color.y, contrast),
      Math.pow(color.z, contrast)
    );
  }

  /**
   * Apply color temperature shift
   */
  private applyTemperature(color: Vector3, temperature: number): Vector3 {
    const result = color.clone();

    if (temperature > 0) {
      // Warmer - increase red, decrease blue
      result.x *= 1 + temperature * 0.2;
      result.z *= 1 - temperature * 0.2;
    } else {
      // Cooler - decrease red, increase blue
      result.x *= 1 + temperature * 0.2;
      result.z *= 1 - temperature * 0.2;
    }

    return result;
  }

  /**
   * Apply tint (green/magenta shift)
   */
  private applyTint(color: Vector3, tint: number): Vector3 {
    const result = color.clone();

    if (tint > 0) {
      // Magenta - increase red and blue
      result.x *= 1 + tint * 0.15;
      result.z *= 1 + tint * 0.15;
    } else {
      // Green - increase green
      result.y *= 1 - tint * 0.15;
    }

    return result;
  }

  /**
   * Apply saturation
   */
  private applySaturation(color: Vector3, saturation: number): Vector3 {
    const luminance = 0.2126 * color.x + 0.7152 * color.y + 0.0722 * color.z;

    return new Vector3(
      luminance + (color.x - luminance) * saturation,
      luminance + (color.y - luminance) * saturation,
      luminance + (color.z - luminance) * saturation
    );
  }

  /**
   * Apply vibrance (smart saturation that preserves skin tones)
   */
  private applyVibrance(color: Vector3, vibrance: number): Vector3 {
    const max = Math.max(color.x, color.y, color.z);
    const avg = (color.x + color.y + color.z) / 3;
    const amt = (Math.abs(max - avg) * 2 / max) * (vibrance - 1);

    return new Vector3(
      color.x + (max - color.x) * amt,
      color.y + (max - color.y) * amt,
      color.z + (max - color.z) * amt
    );
  }

  /**
   * Calculate vignette factor
   */
  private calculateVignette(uv: Vector3, intensity: number, smoothness: number): number {
    const dist = Math.sqrt(
      Math.pow(uv.x - 0.5, 2) + Math.pow(uv.y - 0.5, 2)
    ) * 2;

    const vignette = smoothstep(0.8, 0.8 * smoothness, dist);

    return 1 - (1 - vignette) * intensity;
  }

  /**
   * Generate film grain
   */
  private generateFilmGrain(uv: Vector3, time: number, intensity: number, size: number): number {
    const x = (uv.x * size + 0.07 * Math.sin(time)) * 1000;
    const y = (uv.y * size + 0.11 * Math.cos(time)) * 1000;

    // Simple pseudo-random noise
    const noise = Math.sin(x) * Math.cos(y) * Math.sin(time);

    return (noise * 0.5 + 0.5) * intensity;
  }

  /**
   * Process single pixel through post-processing pipeline
   */
  processPixel(color: Vector3, uv: Vector3, depth: number, time: number): Vector3 {
    let result = color.clone();

    // 1. Exposure
    result = this.applyExposure(result, this.settings.exposure);

    // 2. Tone Mapping
    switch (this.settings.toneMappingMode) {
      case 'aces':
        result = this.acesToneMapping(result);
        break;
      case 'filmic':
        result = this.filmicToneMapping(result);
        break;
      case 'uncharted2':
        result = this.filmicToneMapping(result);
        break;
      case 'reinhard':
        result = this.reinhardToneMapping(result);
        break;
      case 'linear':
        // No tone mapping
        break;
    }

    // 3. Contrast
    result = this.applyContrast(result, this.settings.contrast);

    // 4. Color Grading
    result = this.applyTemperature(result, this.settings.temperature);
    result = this.applyTint(result, this.settings.tint);
    result = this.applySaturation(result, this.settings.saturation);
    result = this.applyVibrance(result, this.settings.vibrance);

    // 5. Vignette
    if (this.settings.vignetteEnabled) {
      const vignette = this.calculateVignette(
        uv,
        this.settings.vignetteIntensity,
        this.settings.vignetteSmoothness
      );
      result = result.multiplyScalar(vignette);
    }

    // 6. Film Grain
    if (this.settings.filmGrainEnabled) {
      const grain = this.generateFilmGrain(
        uv,
        time,
        this.settings.filmGrainIntensity,
        this.settings.filmGrainSize
      );
      result = result.addScalar(grain);
    }

    // Clamp to valid range
    result.x = Math.max(0, Math.min(1, result.x));
    result.y = Math.max(0, Math.min(1, result.y));
    result.z = Math.max(0, Math.min(1, result.z));

    return result;
  }

  /**
   * Get current settings
   */
  getSettings(): PostProcessingSettings {
    return { ...this.settings };
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<PostProcessingSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Reset to defaults
   */
  resetToDefaults(): void {
    this.settings = this.getDefaultSettings();
  }

  /**
   * Load preset
   */
  loadPreset(presetName: string): void {
    const presets: Record<string, Partial<PostProcessingSettings>> = {
      realistic: this.getDefaultSettings(),

      dramatic: {
        toneMappingMode: 'filmic',
        exposure: 1.2,
        contrast: 1.15,
        saturation: 1.25,
        bloomIntensity: 0.5,
        vignetteIntensity: 0.4,
      },

      soft: {
        toneMappingMode: 'reinhard',
        exposure: 0.9,
        contrast: 0.95,
        saturation: 1.0,
        bloomIntensity: 0.6,
        vignetteIntensity: 0.15,
      },

      neutral: {
        toneMappingMode: 'linear',
        exposure: 1.0,
        contrast: 1.0,
        saturation: 1.0,
        bloomEnabled: false,
        vignetteEnabled: false,
        filmGrainEnabled: false,
      },
    };

    const preset = presets[presetName];
    if (preset) {
      this.updateSettings(preset);
    }
  }
}

/**
 * Smoothstep function for smooth interpolation
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
