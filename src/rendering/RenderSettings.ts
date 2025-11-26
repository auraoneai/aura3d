/**
 * @module Rendering
 * @description
 * Render settings and quality presets for the G3D rendering engine.
 * Provides configurable quality levels with automatic feature detection and fallbacks.
 */

import { GPUDevice, GPUFeature } from './gpu/GPUDevice';
import { Logger } from '../core/Logger';

const logger = Logger.create('RenderSettings');

/**
 * Quality preset enumeration.
 */
export enum QualityPreset {
  /** Lowest quality - maximum performance */
  Low = 'low',
  /** Balanced quality and performance */
  Medium = 'medium',
  /** High quality - good performance */
  High = 'high',
  /** Maximum quality - may impact performance */
  Ultra = 'ultra',
  /** Custom quality - user-defined settings */
  Custom = 'custom',
}

/**
 * Shadow quality levels.
 */
export enum ShadowQuality {
  /** Shadows disabled */
  Off = 'off',
  /** Low resolution shadows */
  Low = 'low',
  /** Medium resolution shadows */
  Medium = 'medium',
  /** High resolution shadows */
  High = 'high',
  /** Ultra high resolution shadows */
  Ultra = 'ultra',
}

/**
 * Anti-aliasing modes.
 */
export enum AntiAliasingMode {
  /** No anti-aliasing */
  None = 'none',
  /** Fast Approximate Anti-Aliasing */
  FXAA = 'fxaa',
  /** Temporal Anti-Aliasing */
  TAA = 'taa',
  /** Multisample Anti-Aliasing (2x) */
  MSAA2x = 'msaa2x',
  /** Multisample Anti-Aliasing (4x) */
  MSAA4x = 'msaa4x',
  /** Multisample Anti-Aliasing (8x) */
  MSAA8x = 'msaa8x',
}

/**
 * Ambient occlusion quality.
 */
export enum AOQuality {
  /** AO disabled */
  Off = 'off',
  /** Low quality AO */
  Low = 'low',
  /** Medium quality AO */
  Medium = 'medium',
  /** High quality AO */
  High = 'high',
}

/**
 * Bloom quality levels.
 */
export enum BloomQuality {
  /** Bloom disabled */
  Off = 'off',
  /** Low quality bloom */
  Low = 'low',
  /** Medium quality bloom */
  Medium = 'medium',
  /** High quality bloom */
  High = 'high',
}

/**
 * Render settings configuration.
 */
export interface RenderSettingsConfig {
  /** Quality preset */
  preset?: QualityPreset;
  /** Render resolution scale (0.5 = 50%, 1.0 = 100%, 2.0 = 200%) */
  resolutionScale?: number;
  /** Target frame rate (0 = unlimited) */
  targetFrameRate?: number;
  /** Enable VSync */
  vsync?: boolean;
  /** Shadow quality */
  shadowQuality?: ShadowQuality;
  /** Anti-aliasing mode */
  antiAliasing?: AntiAliasingMode;
  /** Ambient occlusion quality */
  aoQuality?: AOQuality;
  /** Bloom quality */
  bloomQuality?: BloomQuality;
  /** Enable depth of field */
  depthOfField?: boolean;
  /** Enable motion blur */
  motionBlur?: boolean;
  /** Enable tone mapping */
  toneMapping?: boolean;
  /** Enable color grading */
  colorGrading?: boolean;
  /** Enable screen-space reflections */
  ssr?: boolean;
  /** Enable volumetric lighting */
  volumetricLighting?: boolean;
  /** Anisotropic filtering level (1, 2, 4, 8, 16) */
  anisotropicFiltering?: number;
  /** Maximum shadow map resolution */
  maxShadowResolution?: number;
  /** Maximum number of lights per cluster */
  maxLightsPerCluster?: number;
  /** Enable frustum culling */
  frustumCulling?: boolean;
  /** Enable occlusion culling */
  occlusionCulling?: boolean;
  /** Enable HDR rendering */
  hdr?: boolean;
  /** Exposure compensation */
  exposure?: number;
}

/**
 * Render settings class managing quality presets and individual settings.
 *
 * @example
 * ```typescript
 * // Create with preset
 * const settings = new RenderSettings(device, {
 *   preset: QualityPreset.High,
 *   resolutionScale: 1.0,
 * });
 *
 * // Change quality at runtime
 * settings.applyPreset(QualityPreset.Medium);
 *
 * // Customize individual settings
 * settings.shadowQuality = ShadowQuality.Ultra;
 * settings.antiAliasing = AntiAliasingMode.TAA;
 * settings.resolutionScale = 0.8;
 *
 * // Auto-detect optimal settings
 * settings.autoDetect();
 *
 * // Check if feature is enabled
 * if (settings.isFeatureEnabled('bloom')) {
 *   // Render bloom
 * }
 * ```
 */
export class RenderSettings {
  private device: GPUDevice;
  private _preset: QualityPreset;
  private _resolutionScale: number = 1.0;
  private _targetFrameRate: number = 0;
  private _vsync: boolean = true;
  private _shadowQuality: ShadowQuality = ShadowQuality.High;
  private _antiAliasing: AntiAliasingMode = AntiAliasingMode.TAA;
  private _aoQuality: AOQuality = AOQuality.Medium;
  private _bloomQuality: BloomQuality = BloomQuality.Medium;
  private _depthOfField: boolean = false;
  private _motionBlur: boolean = false;
  private _toneMapping: boolean = true;
  private _colorGrading: boolean = true;
  private _ssr: boolean = false;
  private _volumetricLighting: boolean = false;
  private _anisotropicFiltering: number = 4;
  private _maxShadowResolution: number = 2048;
  private _maxLightsPerCluster: number = 64;
  private _frustumCulling: boolean = true;
  private _occlusionCulling: boolean = false;
  private _hdr: boolean = true;
  private _exposure: number = 1.0;

  /**
   * Event fired when settings change.
   */
  onChange: (() => void) | null = null;

  /**
   * Creates a new RenderSettings instance.
   *
   * @param device - GPU device for capability detection
   * @param config - Initial settings configuration
   */
  constructor(device: GPUDevice, config?: RenderSettingsConfig) {
    this.device = device;
    this._preset = config?.preset ?? QualityPreset.High;

    if (config) {
      this.applyConfig(config);
    } else {
      this.applyPreset(this._preset);
    }

    logger.info('Render settings initialized', { preset: this._preset });
  }

  // Getters and setters

  get preset(): QualityPreset {
    return this._preset;
  }

  get resolutionScale(): number {
    return this._resolutionScale;
  }

  set resolutionScale(value: number) {
    this._resolutionScale = Math.max(0.1, Math.min(2.0, value));
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get targetFrameRate(): number {
    return this._targetFrameRate;
  }

  set targetFrameRate(value: number) {
    this._targetFrameRate = Math.max(0, value);
    this.notifyChange();
  }

  get vsync(): boolean {
    return this._vsync;
  }

  set vsync(value: boolean) {
    this._vsync = value;
    this.notifyChange();
  }

  get shadowQuality(): ShadowQuality {
    return this._shadowQuality;
  }

  set shadowQuality(value: ShadowQuality) {
    this._shadowQuality = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get antiAliasing(): AntiAliasingMode {
    return this._antiAliasing;
  }

  set antiAliasing(value: AntiAliasingMode) {
    this._antiAliasing = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get aoQuality(): AOQuality {
    return this._aoQuality;
  }

  set aoQuality(value: AOQuality) {
    this._aoQuality = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get bloomQuality(): BloomQuality {
    return this._bloomQuality;
  }

  set bloomQuality(value: BloomQuality) {
    this._bloomQuality = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get depthOfField(): boolean {
    return this._depthOfField;
  }

  set depthOfField(value: boolean) {
    this._depthOfField = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get motionBlur(): boolean {
    return this._motionBlur;
  }

  set motionBlur(value: boolean) {
    this._motionBlur = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get toneMapping(): boolean {
    return this._toneMapping;
  }

  set toneMapping(value: boolean) {
    this._toneMapping = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get colorGrading(): boolean {
    return this._colorGrading;
  }

  set colorGrading(value: boolean) {
    this._colorGrading = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get ssr(): boolean {
    return this._ssr;
  }

  set ssr(value: boolean) {
    this._ssr = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get volumetricLighting(): boolean {
    return this._volumetricLighting;
  }

  set volumetricLighting(value: boolean) {
    this._volumetricLighting = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get anisotropicFiltering(): number {
    return this._anisotropicFiltering;
  }

  set anisotropicFiltering(value: number) {
    this._anisotropicFiltering = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get maxShadowResolution(): number {
    return this._maxShadowResolution;
  }

  set maxShadowResolution(value: number) {
    this._maxShadowResolution = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get maxLightsPerCluster(): number {
    return this._maxLightsPerCluster;
  }

  set maxLightsPerCluster(value: number) {
    this._maxLightsPerCluster = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get frustumCulling(): boolean {
    return this._frustumCulling;
  }

  set frustumCulling(value: boolean) {
    this._frustumCulling = value;
    this.notifyChange();
  }

  get occlusionCulling(): boolean {
    return this._occlusionCulling;
  }

  set occlusionCulling(value: boolean) {
    this._occlusionCulling = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get hdr(): boolean {
    return this._hdr;
  }

  set hdr(value: boolean) {
    this._hdr = value;
    this._preset = QualityPreset.Custom;
    this.notifyChange();
  }

  get exposure(): number {
    return this._exposure;
  }

  set exposure(value: number) {
    this._exposure = Math.max(0.01, Math.min(10.0, value));
    this.notifyChange();
  }

  /**
   * Applies a quality preset.
   *
   * @param preset - Quality preset to apply
   */
  applyPreset(preset: QualityPreset): void {
    this._preset = preset;

    switch (preset) {
      case QualityPreset.Low:
        this.applyLowPreset();
        break;
      case QualityPreset.Medium:
        this.applyMediumPreset();
        break;
      case QualityPreset.High:
        this.applyHighPreset();
        break;
      case QualityPreset.Ultra:
        this.applyUltraPreset();
        break;
      case QualityPreset.Custom:
        // Keep current settings
        break;
    }

    logger.info(`Applied ${preset} quality preset`);
    this.notifyChange();
  }

  /**
   * Applies low quality preset.
   */
  private applyLowPreset(): void {
    this._resolutionScale = 0.75;
    this._shadowQuality = ShadowQuality.Low;
    this._antiAliasing = AntiAliasingMode.FXAA;
    this._aoQuality = AOQuality.Off;
    this._bloomQuality = BloomQuality.Off;
    this._depthOfField = false;
    this._motionBlur = false;
    this._toneMapping = true;
    this._colorGrading = false;
    this._ssr = false;
    this._volumetricLighting = false;
    this._anisotropicFiltering = 1;
    this._maxShadowResolution = 1024;
    this._maxLightsPerCluster = 32;
    this._frustumCulling = true;
    this._occlusionCulling = false;
    this._hdr = false;
  }

  /**
   * Applies medium quality preset.
   */
  private applyMediumPreset(): void {
    this._resolutionScale = 1.0;
    this._shadowQuality = ShadowQuality.Medium;
    this._antiAliasing = AntiAliasingMode.FXAA;
    this._aoQuality = AOQuality.Low;
    this._bloomQuality = BloomQuality.Low;
    this._depthOfField = false;
    this._motionBlur = false;
    this._toneMapping = true;
    this._colorGrading = true;
    this._ssr = false;
    this._volumetricLighting = false;
    this._anisotropicFiltering = 4;
    this._maxShadowResolution = 2048;
    this._maxLightsPerCluster = 64;
    this._frustumCulling = true;
    this._occlusionCulling = false;
    this._hdr = true;
  }

  /**
   * Applies high quality preset.
   */
  private applyHighPreset(): void {
    this._resolutionScale = 1.0;
    this._shadowQuality = ShadowQuality.High;
    this._antiAliasing = AntiAliasingMode.TAA;
    this._aoQuality = AOQuality.Medium;
    this._bloomQuality = BloomQuality.Medium;
    this._depthOfField = true;
    this._motionBlur = true;
    this._toneMapping = true;
    this._colorGrading = true;
    this._ssr = false;
    this._volumetricLighting = false;
    this._anisotropicFiltering = 8;
    this._maxShadowResolution = 4096;
    this._maxLightsPerCluster = 128;
    this._frustumCulling = true;
    this._occlusionCulling = true;
    this._hdr = true;
  }

  /**
   * Applies ultra quality preset.
   */
  private applyUltraPreset(): void {
    this._resolutionScale = 1.0;
    this._shadowQuality = ShadowQuality.Ultra;
    this._antiAliasing = AntiAliasingMode.TAA;
    this._aoQuality = AOQuality.High;
    this._bloomQuality = BloomQuality.High;
    this._depthOfField = true;
    this._motionBlur = true;
    this._toneMapping = true;
    this._colorGrading = true;
    this._ssr = true;
    this._volumetricLighting = true;
    this._anisotropicFiltering = 16;
    this._maxShadowResolution = 8192;
    this._maxLightsPerCluster = 256;
    this._frustumCulling = true;
    this._occlusionCulling = true;
    this._hdr = true;
  }

  /**
   * Applies configuration.
   *
   * @param config - Configuration to apply
   */
  private applyConfig(config: RenderSettingsConfig): void {
    if (config.preset !== undefined) this._preset = config.preset;
    if (config.resolutionScale !== undefined) this._resolutionScale = config.resolutionScale;
    if (config.targetFrameRate !== undefined) this._targetFrameRate = config.targetFrameRate;
    if (config.vsync !== undefined) this._vsync = config.vsync;
    if (config.shadowQuality !== undefined) this._shadowQuality = config.shadowQuality;
    if (config.antiAliasing !== undefined) this._antiAliasing = config.antiAliasing;
    if (config.aoQuality !== undefined) this._aoQuality = config.aoQuality;
    if (config.bloomQuality !== undefined) this._bloomQuality = config.bloomQuality;
    if (config.depthOfField !== undefined) this._depthOfField = config.depthOfField;
    if (config.motionBlur !== undefined) this._motionBlur = config.motionBlur;
    if (config.toneMapping !== undefined) this._toneMapping = config.toneMapping;
    if (config.colorGrading !== undefined) this._colorGrading = config.colorGrading;
    if (config.ssr !== undefined) this._ssr = config.ssr;
    if (config.volumetricLighting !== undefined) this._volumetricLighting = config.volumetricLighting;
    if (config.anisotropicFiltering !== undefined) this._anisotropicFiltering = config.anisotropicFiltering;
    if (config.maxShadowResolution !== undefined) this._maxShadowResolution = config.maxShadowResolution;
    if (config.maxLightsPerCluster !== undefined) this._maxLightsPerCluster = config.maxLightsPerCluster;
    if (config.frustumCulling !== undefined) this._frustumCulling = config.frustumCulling;
    if (config.occlusionCulling !== undefined) this._occlusionCulling = config.occlusionCulling;
    if (config.hdr !== undefined) this._hdr = config.hdr;
    if (config.exposure !== undefined) this._exposure = config.exposure;
  }

  /**
   * Auto-detects optimal settings based on device capabilities.
   */
  autoDetect(): void {
    const caps = this.device.getCapabilities();

    logger.info('Auto-detecting optimal settings', {
      vendor: caps.vendor,
      renderer: caps.renderer,
    });

    // Start with high preset
    this.applyHighPreset();

    // Downgrade based on capabilities
    if (!caps.features.has(GPUFeature.FloatTexture)) {
      this._hdr = false;
      this._bloomQuality = BloomQuality.Low;
    }

    if (!caps.features.has(GPUFeature.AnisotropicFiltering)) {
      this._anisotropicFiltering = 1;
    }

    if (!caps.features.has(GPUFeature.OcclusionQuery)) {
      this._occlusionCulling = false;
    }

    // Apply resolution limits
    const maxTexSize = caps.limits.maxTextureDimension2D;
    if (maxTexSize < 8192) {
      this._maxShadowResolution = Math.min(this._maxShadowResolution, 4096);
    }
    if (maxTexSize < 4096) {
      this._maxShadowResolution = Math.min(this._maxShadowResolution, 2048);
      this.applyMediumPreset();
    }

    this._preset = QualityPreset.Custom;
    logger.info('Auto-detection complete');
    this.notifyChange();
  }

  /**
   * Checks if a feature is enabled.
   *
   * @param feature - Feature name
   * @returns True if enabled
   */
  isFeatureEnabled(feature: string): boolean {
    switch (feature.toLowerCase()) {
      case 'shadows':
        return this._shadowQuality !== ShadowQuality.Off;
      case 'ao':
      case 'ssao':
        return this._aoQuality !== AOQuality.Off;
      case 'bloom':
        return this._bloomQuality !== BloomQuality.Off;
      case 'dof':
      case 'depthoffield':
        return this._depthOfField;
      case 'motionblur':
        return this._motionBlur;
      case 'tonemapping':
        return this._toneMapping;
      case 'colorgrading':
        return this._colorGrading;
      case 'ssr':
        return this._ssr;
      case 'volumetriclighting':
        return this._volumetricLighting;
      case 'hdr':
        return this._hdr;
      case 'antialiasing':
        return this._antiAliasing !== AntiAliasingMode.None;
      default:
        return false;
    }
  }

  /**
   * Gets the current configuration as a serializable object.
   *
   * @returns Current configuration
   */
  getConfig(): RenderSettingsConfig {
    return {
      preset: this._preset,
      resolutionScale: this._resolutionScale,
      targetFrameRate: this._targetFrameRate,
      vsync: this._vsync,
      shadowQuality: this._shadowQuality,
      antiAliasing: this._antiAliasing,
      aoQuality: this._aoQuality,
      bloomQuality: this._bloomQuality,
      depthOfField: this._depthOfField,
      motionBlur: this._motionBlur,
      toneMapping: this._toneMapping,
      colorGrading: this._colorGrading,
      ssr: this._ssr,
      volumetricLighting: this._volumetricLighting,
      anisotropicFiltering: this._anisotropicFiltering,
      maxShadowResolution: this._maxShadowResolution,
      maxLightsPerCluster: this._maxLightsPerCluster,
      frustumCulling: this._frustumCulling,
      occlusionCulling: this._occlusionCulling,
      hdr: this._hdr,
      exposure: this._exposure,
    };
  }

  /**
   * Notifies change listeners.
   */
  private notifyChange(): void {
    if (this.onChange) {
      this.onChange();
    }
  }
}
