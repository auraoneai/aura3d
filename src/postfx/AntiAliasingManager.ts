/**
 * G3D 5.0 - AntiAliasingManager
 *
 * Manages anti-aliasing mode selection and configuration.
 * Supports FXAA, SMAA, and TAA with runtime mode switching.
 *
 * @module postfx/AntiAliasingManager
 */

import type { RenderContext } from './PostProcessChain';
import type { FXAAController, FXAAQuality } from './FXAAController';
import type { SMAAController, SMAAQuality } from './SMAAController';
import type { TAAPassController, TAASettings } from './TAAPassController';

/**
 * Available anti-aliasing modes
 */
export type AAMode = 'none' | 'fxaa' | 'smaa' | 'taa';

/**
 * Anti-aliasing configuration
 */
export interface AAConfig {
  mode: AAMode;
  fxaa?: {
    quality: FXAAQuality;
  };
  smaa?: {
    quality: SMAAQuality;
  };
  taa?: Partial<TAASettings>;
}

/**
 * Statistics for anti-aliasing performance
 */
export interface AAStats {
  currentMode: AAMode;
  executionTime: number;
  resourceMemory: number;
}

/**
 * Manages anti-aliasing mode selection and runtime switching
 */
export class AntiAliasingManager {
  private currentMode: AAMode = 'none';
  private fxaaController: FXAAController | null = null;
  private smaaController: SMAAController | null = null;
  private taaController: TAAPassController | null = null;

  private device: any = null;
  private width = 0;
  private height = 0;
  private isInitialized = false;

  private lastExecutionTime = 0;

  /**
   * Recommended modes based on hardware capabilities
   */
  public static readonly RECOMMENDATIONS: Record<string, AAMode> = {
    low: 'fxaa',
    medium: 'smaa',
    high: 'taa',
    ultra: 'taa',
  };

  constructor() {}

  /**
   * Initialize the anti-aliasing manager
   */
  public initialize(
    device: any,
    width: number,
    height: number,
    controllers: {
      fxaa?: FXAAController;
      smaa?: SMAAController;
      taa?: TAAPassController;
    }
  ): void {
    this.device = device;
    this.width = width;
    this.height = height;

    this.fxaaController = controllers.fxaa || null;
    this.smaaController = controllers.smaa || null;
    this.taaController = controllers.taa || null;

    this.isInitialized = true;
  }

  /**
   * Set the active anti-aliasing mode
   */
  public setMode(mode: AAMode): void {
    if (this.currentMode === mode) {
      return;
    }

    // Validate mode availability
    if (!this.isModeAvailable(mode)) {
      console.warn(`Anti-aliasing mode '${mode}' is not available`);
      return;
    }

    // Disable previous mode
    this.disableCurrentMode();

    // Enable new mode
    this.currentMode = mode;
    this.enableCurrentMode();

    console.log(`Anti-aliasing mode changed to: ${mode}`);
  }

  /**
   * Get the current anti-aliasing mode
   */
  public getMode(): AAMode {
    return this.currentMode;
  }

  /**
   * Set FXAA quality
   */
  public setFXAAQuality(quality: FXAAQuality): void {
    if (!this.fxaaController) {
      console.warn('FXAA controller not available');
      return;
    }

    this.fxaaController.setQuality(quality);
  }

  /**
   * Get current FXAA quality
   */
  public getFXAAQuality(): FXAAQuality | null {
    return this.fxaaController?.getQuality() || null;
  }

  /**
   * Set SMAA quality
   */
  public setSMAAQuality(quality: SMAAQuality): void {
    if (!this.smaaController) {
      console.warn('SMAA controller not available');
      return;
    }

    this.smaaController.setQuality(quality);
  }

  /**
   * Get current SMAA quality
   */
  public getSMAAQuality(): SMAAQuality | null {
    return this.smaaController?.getQuality() || null;
  }

  /**
   * Set TAA settings
   */
  public setTAASettings(settings: Partial<TAASettings>): void {
    if (!this.taaController) {
      console.warn('TAA controller not available');
      return;
    }

    if (settings.jitterPattern !== undefined) {
      this.taaController.setJitterPattern(settings.jitterPattern);
    }
    if (settings.feedbackFactor !== undefined) {
      this.taaController.setFeedbackFactor(settings.feedbackFactor);
    }
    if (settings.sharpness !== undefined) {
      this.taaController.setSharpness(settings.sharpness);
    }
    if (settings.velocityRejection !== undefined) {
      this.taaController.setVelocityRejection(settings.velocityRejection);
    }
    if (settings.varianceClipping !== undefined) {
      this.taaController.setVarianceClipping(settings.varianceClipping);
    }
  }

  /**
   * Get current TAA settings
   */
  public getTAASettings(): TAASettings | null {
    return this.taaController?.getSettings() || null;
  }

  /**
   * Get the active controller for the current mode
   */
  public getActiveController(): FXAAController | SMAAController | TAAPassController | null {
    switch (this.currentMode) {
      case 'fxaa':
        return this.fxaaController;
      case 'smaa':
        return this.smaaController;
      case 'taa':
        return this.taaController;
      default:
        return null;
    }
  }

  /**
   * Execute anti-aliasing for the current frame
   */
  public execute(context: RenderContext): void {
    const startTime = performance.now();

    const controller = this.getActiveController();
    if (controller && controller.enabled) {
      controller.execute(context);
    }

    this.lastExecutionTime = performance.now() - startTime;
  }

  /**
   * Check if a mode is available
   */
  public isModeAvailable(mode: AAMode): boolean {
    switch (mode) {
      case 'none':
        return true;
      case 'fxaa':
        return this.fxaaController !== null;
      case 'smaa':
        return this.smaaController !== null;
      case 'taa':
        return this.taaController !== null;
      default:
        return false;
    }
  }

  /**
   * Get all available modes
   */
  public getAvailableModes(): AAMode[] {
    const modes: AAMode[] = ['none'];

    if (this.fxaaController) modes.push('fxaa');
    if (this.smaaController) modes.push('smaa');
    if (this.taaController) modes.push('taa');

    return modes;
  }

  /**
   * Apply configuration
   */
  public applyConfig(config: AAConfig): void {
    // Apply mode-specific settings first
    if (config.fxaa && this.fxaaController) {
      this.setFXAAQuality(config.fxaa.quality);
    }

    if (config.smaa && this.smaaController) {
      this.setSMAAQuality(config.smaa.quality);
    }

    if (config.taa && this.taaController) {
      this.setTAASettings(config.taa);
    }

    // Then set the mode (which enables/disables controllers)
    this.setMode(config.mode);
  }

  /**
   * Get current configuration
   */
  public getConfig(): AAConfig {
    return {
      mode: this.currentMode,
      fxaa: this.fxaaController
        ? { quality: this.fxaaController.getQuality() }
        : undefined,
      smaa: this.smaaController
        ? { quality: this.smaaController.getQuality() }
        : undefined,
      taa: this.taaController
        ? this.taaController.getSettings()
        : undefined,
    };
  }

  /**
   * Get recommended mode for quality level
   */
  public static getRecommendedMode(qualityLevel: 'low' | 'medium' | 'high' | 'ultra'): AAMode {
    return AntiAliasingManager.RECOMMENDATIONS[qualityLevel] || 'fxaa';
  }

  /**
   * Handle resize
   */
  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.fxaaController?.resize) {
      this.fxaaController.resize(width, height);
    }
    if (this.smaaController?.resize) {
      this.smaaController.resize(width, height);
    }
    if (this.taaController?.resize) {
      this.taaController.resize(width, height);
    }
  }

  /**
   * Reset TAA history (useful when camera cuts or scene changes)
   */
  public resetTAAHistory(): void {
    if (this.taaController) {
      this.taaController.resetHistory();
    }
  }

  /**
   * Get performance statistics
   */
  public getStats(): AAStats {
    return {
      currentMode: this.currentMode,
      executionTime: this.lastExecutionTime,
      resourceMemory: this.calculateResourceMemory(),
    };
  }

  /**
   * Dispose all resources
   */
  public dispose(): void {
    if (this.fxaaController?.dispose) {
      this.fxaaController.dispose();
    }
    if (this.smaaController?.dispose) {
      this.smaaController.dispose();
    }
    if (this.taaController?.dispose) {
      this.taaController.dispose();
    }

    this.fxaaController = null;
    this.smaaController = null;
    this.taaController = null;
    this.device = null;
    this.isInitialized = false;
  }

  /**
   * Disable the current mode
   */
  private disableCurrentMode(): void {
    const controller = this.getActiveController();
    if (controller) {
      controller.enabled = false;
    }
  }

  /**
   * Enable the current mode
   */
  private enableCurrentMode(): void {
    const controller = this.getActiveController();
    if (controller) {
      controller.enabled = true;
    }
  }

  /**
   * Calculate total memory used by AA resources
   */
  private calculateResourceMemory(): number {
    let totalMemory = 0;

    // Estimate based on mode and resolution
    const pixelCount = this.width * this.height;

    switch (this.currentMode) {
      case 'fxaa':
        // FXAA uses minimal extra memory (just shader)
        totalMemory = 0;
        break;

      case 'smaa':
        // SMAA uses edge detection buffer and blend weights
        totalMemory = pixelCount * 4 * 2; // 2 RGBA textures
        break;

      case 'taa':
        // TAA uses history buffer and velocity buffer
        totalMemory = pixelCount * 4 * 2; // 2 RGBA textures
        break;

      default:
        totalMemory = 0;
    }

    return totalMemory;
  }
}
