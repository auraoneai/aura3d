/**
 * G3D 5.0 Variable Rate Shading Manager
 *
 * WebGPU Variable Rate Shading (VRS) integration for foveated rendering.
 * Generates shading rate images based on gaze position for hardware-accelerated
 * quality reduction.
 *
 * @example
 * ```typescript
 * const vrsManager = new VariableRateShadingManager({
 *   tileSize: 16,
 *   centerRate: '1x1',
 *   peripheralRate: '4x4'
 * });
 *
 * // Setup with WebGPU device
 * await vrsManager.setup(device, format);
 *
 * // Update shading rate image based on gaze
 * vrsManager.updateShadingRateImage(gazePosition);
 *
 * // Use in render pass
 * const passDescriptor = vrsManager.createRenderPassDescriptor(colorAttachment);
 * ```
 */

/**
 * Shading rate values
 */
export type ShadingRate = '1x1' | '1x2' | '2x1' | '2x2' | '2x4' | '4x2' | '4x4';

/**
 * VRS configuration options
 */
export interface VRSOptions {
  /** Tile size in pixels (typically 8 or 16) */
  tileSize?: number;

  /** Shading rate at gaze center */
  centerRate?: ShadingRate;

  /** Shading rate at mid-periphery */
  midRate?: ShadingRate;

  /** Shading rate at far periphery */
  peripheralRate?: ShadingRate;

  /** Radius for each quality ring (0-1) */
  centerRadius?: number;
  midRadius?: number;

  /** Enable smooth transitions */
  smoothTransitions?: boolean;

  /** Fallback when VRS unavailable */
  fallbackEnabled?: boolean;
}

/**
 * Shading rate image data
 */
interface ShadingRateImage {
  /** WebGPU texture */
  texture: GPUTexture;

  /** Texture view */
  view: GPUTextureView;

  /** Width in tiles */
  widthInTiles: number;

  /** Height in tiles */
  heightInTiles: number;

  /** Tile size */
  tileSize: number;
}

/**
 * Variable Rate Shading Manager
 *
 * Manages WebGPU Variable Rate Shading for foveated rendering.
 */
export class VariableRateShadingManager {
  private options: Required<VRSOptions>;

  private device: GPUDevice | null = null;
  private shadingRateImage: ShadingRateImage | null = null;

  private gazePosition: { x: number; y: number } = { x: 0.5, y: 0.5 };

  private isSupported: boolean = false;
  private isSetup: boolean = false;

  private canvasWidth: number = 0;
  private canvasHeight: number = 0;

  // Shading rate to numeric encoding
  private readonly SHADING_RATE_MAP: Record<ShadingRate, number> = {
    '1x1': 0,
    '1x2': 1,
    '2x1': 4,
    '2x2': 5,
    '2x4': 6,
    '4x2': 9,
    '4x4': 10
  };

  /**
   * Creates a new Variable Rate Shading Manager
   *
   * @param options - VRS options
   */
  constructor(options: VRSOptions = {}) {
    this.options = {
      tileSize: options.tileSize ?? 16,
      centerRate: options.centerRate ?? '1x1',
      midRate: options.midRate ?? '2x2',
      peripheralRate: options.peripheralRate ?? '4x4',
      centerRadius: options.centerRadius ?? 0.2,
      midRadius: options.midRadius ?? 0.5,
      smoothTransitions: options.smoothTransitions ?? true,
      fallbackEnabled: options.fallbackEnabled ?? true
    };
  }

  /**
   * Sets up VRS with WebGPU device
   *
   * @param device - WebGPU device
   * @param canvasWidth - Canvas width
   * @param canvasHeight - Canvas height
   */
  async setup(device: GPUDevice, canvasWidth: number, canvasHeight: number): Promise<void> {
    this.device = device;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    // Check VRS support
    this.isSupported = this.checkVRSSupport();

    if (!this.isSupported) {
      console.warn('Variable Rate Shading not supported on this device');

      if (!this.options.fallbackEnabled) {
        throw new Error('VRS not supported and fallback disabled');
      }

      return;
    }

    // Create shading rate image
    await this.createShadingRateImage();

    this.isSetup = true;
    console.log('Variable Rate Shading initialized');
  }

  /**
   * Checks if VRS is supported
   *
   * @returns True if VRS is supported
   */
  private checkVRSSupport(): boolean {
    if (!this.device) return false;

    // Check for WebGPU VRS feature
    // Note: This API is still experimental
    const features = this.device.features;
    return features.has('variable-rate-shading') ||
           features.has('shader-f16');
  }

  /**
   * Creates the shading rate image texture
   */
  private async createShadingRateImage(): Promise<void> {
    if (!this.device || !this.isSupported) return;

    const tileSize = this.options.tileSize;
    const widthInTiles = Math.ceil(this.canvasWidth / tileSize);
    const heightInTiles = Math.ceil(this.canvasHeight / tileSize);

    // Create texture for shading rate image
    const texture = this.device.createTexture({
      size: {
        width: widthInTiles,
        height: heightInTiles,
        depthOrArrayLayers: 1
      },
      format: 'r8uint', // Each pixel stores shading rate
      usage: GPUTextureUsage.TEXTURE_BINDING |
             GPUTextureUsage.COPY_DST |
             GPUTextureUsage.RENDER_ATTACHMENT
    });

    const view = texture.createView();

    this.shadingRateImage = {
      texture,
      view,
      widthInTiles,
      heightInTiles,
      tileSize
    };

    // Initialize with default shading rates
    this.updateShadingRateImage(this.gazePosition);
  }

  /**
   * Updates shading rate image based on gaze position
   *
   * @param gaze - Gaze position (normalized 0-1)
   */
  updateShadingRateImage(gaze: { x: number; y: number }): void {
    if (!this.shadingRateImage || !this.device || !this.isSupported) return;

    this.gazePosition = { ...gaze };

    const { widthInTiles, heightInTiles } = this.shadingRateImage;
    const data = new Uint8Array(widthInTiles * heightInTiles);

    // Generate shading rate for each tile
    for (let y = 0; y < heightInTiles; y++) {
      for (let x = 0; x < widthInTiles; x++) {
        // Convert tile coords to normalized screen coords
        const nx = (x + 0.5) / widthInTiles;
        const ny = (y + 0.5) / heightInTiles;

        // Calculate distance from gaze point
        const dx = nx - gaze.x;
        const dy = ny - gaze.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Determine shading rate based on distance
        const shadingRate = this.getShadingRateForDistance(distance);
        data[y * widthInTiles + x] = this.SHADING_RATE_MAP[shadingRate];
      }
    }

    // Upload to GPU
    this.device.queue.writeTexture(
      { texture: this.shadingRateImage.texture },
      data,
      {
        bytesPerRow: widthInTiles,
        rowsPerImage: heightInTiles
      },
      {
        width: widthInTiles,
        height: heightInTiles,
        depthOrArrayLayers: 1
      }
    );
  }

  /**
   * Gets appropriate shading rate for distance from gaze
   *
   * @param distance - Distance from gaze point (0-1)
   * @returns Shading rate
   */
  private getShadingRateForDistance(distance: number): ShadingRate {
    if (distance < this.options.centerRadius) {
      return this.options.centerRate;
    } else if (distance < this.options.midRadius) {
      // Optionally blend between center and mid rates
      if (this.options.smoothTransitions) {
        const t = (distance - this.options.centerRadius) /
                  (this.options.midRadius - this.options.centerRadius);
        return t < 0.5 ? this.options.centerRate : this.options.midRate;
      }
      return this.options.midRate;
    } else {
      return this.options.peripheralRate;
    }
  }

  /**
   * Creates a render pass descriptor with VRS attachment
   *
   * @param colorAttachment - Color attachment descriptor
   * @param depthAttachment - Optional depth attachment
   * @returns Render pass descriptor
   */
  createRenderPassDescriptor(
    colorAttachment: GPURenderPassColorAttachment,
    depthAttachment?: GPURenderPassDepthStencilAttachment
  ): GPURenderPassDescriptor {
    const descriptor: GPURenderPassDescriptor = {
      colorAttachments: [colorAttachment]
    };

    if (depthAttachment) {
      descriptor.depthStencilAttachment = depthAttachment;
    }

    // Add VRS attachment if supported
    if (this.isSupported && this.shadingRateImage) {
      // Note: This API is experimental and may change
      (descriptor as any).shadingRateAttachment = {
        view: this.shadingRateImage.view,
        tileSize: this.options.tileSize
      };
    }

    return descriptor;
  }

  /**
   * Gets shading rate at a specific screen position
   *
   * @param x - X coordinate (0-1)
   * @param y - Y coordinate (0-1)
   * @returns Shading rate
   */
  getShadingRateAt(x: number, y: number): ShadingRate {
    const dx = x - this.gazePosition.x;
    const dy = y - this.gazePosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return this.getShadingRateForDistance(distance);
  }

  /**
   * Estimates performance gain from VRS
   *
   * @returns Estimated shading reduction percentage
   */
  estimatePerformanceGain(): number {
    if (!this.shadingRateImage) return 0;

    const { widthInTiles, heightInTiles } = this.shadingRateImage;
    let totalShading = 0;
    let maxShading = widthInTiles * heightInTiles;

    for (let y = 0; y < heightInTiles; y++) {
      for (let x = 0; x < widthInTiles; x++) {
        const nx = (x + 0.5) / widthInTiles;
        const ny = (y + 0.5) / heightInTiles;

        const dx = nx - this.gazePosition.x;
        const dy = ny - this.gazePosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const rate = this.getShadingRateForDistance(distance);
        const reduction = this.getShadingReduction(rate);

        totalShading += (1 - reduction);
      }
    }

    return (1 - totalShading / maxShading) * 100;
  }

  /**
   * Gets shading reduction factor for a rate
   *
   * @param rate - Shading rate
   * @returns Reduction factor (0-1)
   */
  private getShadingReduction(rate: ShadingRate): number {
    const reductionMap: Record<ShadingRate, number> = {
      '1x1': 0,    // No reduction
      '1x2': 0.5,  // 50% reduction
      '2x1': 0.5,
      '2x2': 0.75, // 75% reduction
      '2x4': 0.875,
      '4x2': 0.875,
      '4x4': 0.9375 // 93.75% reduction
    };

    return reductionMap[rate];
  }

  /**
   * Checks if VRS is supported
   *
   * @returns True if supported
   */
  isVRSSupported(): boolean {
    return this.isSupported;
  }

  /**
   * Gets the shading rate image texture
   *
   * @returns Shading rate image or null
   */
  getShadingRateImage(): GPUTexture | null {
    return this.shadingRateImage?.texture || null;
  }

  /**
   * Gets the shading rate image view
   *
   * @returns Shading rate view or null
   */
  getShadingRateView(): GPUTextureView | null {
    return this.shadingRateImage?.view || null;
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    if (this.shadingRateImage) {
      this.shadingRateImage.texture.destroy();
      this.shadingRateImage = null;
    }

    this.device = null;
    this.isSetup = false;
  }
}
