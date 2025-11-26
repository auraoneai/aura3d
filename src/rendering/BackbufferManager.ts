/**
 * @module Rendering/Core
 * @description
 * Manages swap chain and presentation for G3D 5.0 engine.
 * Handles backbuffer acquisition, resize, and v-sync control.
 */

import { Logger } from '../core/Logger';
import { RenderDevice } from './RenderDevice';
import { TextureFormat } from './gpu/GPUDevice';

const logger = Logger.create('BackbufferManager');

/**
 * Present mode for swap chain.
 */
export enum PresentMode {
  /** V-sync on, waits for vertical blank */
  Fifo = 'fifo',
  /** V-sync off, immediate presentation */
  Immediate = 'immediate',
  /** Adaptive v-sync (fallback to immediate if can't keep up) */
  Mailbox = 'mailbox',
}

/**
 * Swap chain configuration.
 */
export interface SwapChainConfig {
  /** Preferred present mode */
  presentMode?: PresentMode;
  /** Preferred texture format */
  format?: TextureFormat;
  /** Pixel ratio (default: window.devicePixelRatio) */
  pixelRatio?: number;
  /** Alpha mode */
  alphaMode?: 'opaque' | 'premultiplied';
}

/**
 * Manages the swap chain and backbuffer for presentation.
 * Handles resize, format selection, and v-sync control.
 *
 * @example
 * ```typescript
 * const backbufferMgr = new BackbufferManager();
 * await backbufferMgr.initialize(device, canvas, {
 *   presentMode: PresentMode.Fifo,
 *   pixelRatio: window.devicePixelRatio,
 * });
 *
 * // In render loop
 * const backbuffer = backbufferMgr.acquireBackbuffer();
 * // Render to backbuffer...
 * backbufferMgr.present();
 *
 * // On window resize
 * window.addEventListener('resize', () => {
 *   backbufferMgr.resize(window.innerWidth, window.innerHeight);
 * });
 * ```
 */
export class BackbufferManager {
  /**
   * GPU device.
   */
  private _device: RenderDevice | null = null;

  /**
   * Canvas element.
   */
  private _canvas: HTMLCanvasElement | null = null;

  /**
   * GPU context (WebGPU GPUCanvasContext or WebGL2RenderingContext).
   */
  private _context: any = null;

  /**
   * Current swap chain configuration.
   */
  private _config: SwapChainConfig = {};

  /**
   * Current backbuffer texture.
   */
  private _currentTexture: any = null;

  /**
   * Actual width in pixels (canvas.width).
   */
  private _width: number = 0;

  /**
   * Actual height in pixels (canvas.height).
   */
  private _height: number = 0;

  /**
   * Display width (CSS pixels).
   */
  private _displayWidth: number = 0;

  /**
   * Display height (CSS pixels).
   */
  private _displayHeight: number = 0;

  /**
   * Pixel ratio applied.
   */
  private _pixelRatio: number = 1;

  /**
   * Swap chain texture format.
   */
  private _format: TextureFormat = TextureFormat.BGRA8Unorm;

  /**
   * Whether the backbuffer manager is initialized.
   */
  private _initialized: boolean = false;

  /**
   * Creates a new BackbufferManager instance.
   *
   * @example
   * ```typescript
   * const backbufferMgr = new BackbufferManager();
   * ```
   */
  constructor() {
    logger.debug('BackbufferManager created');
  }

  /**
   * Initializes the backbuffer manager with a device and canvas.
   *
   * @param device - GPU device
   * @param canvas - Canvas element to render to
   * @param config - Swap chain configuration (optional)
   *
   * @example
   * ```typescript
   * await backbufferMgr.initialize(device, canvas, {
   *   presentMode: PresentMode.Fifo,
   *   format: TextureFormat.BGRA8Unorm,
   *   pixelRatio: 2.0,
   * });
   * ```
   */
  async initialize(
    device: RenderDevice,
    canvas: HTMLCanvasElement,
    config: SwapChainConfig = {}
  ): Promise<void> {
    if (this._initialized) {
      logger.warn('BackbufferManager already initialized');
      return;
    }

    this._device = device;
    this._canvas = canvas;
    this._config = config;

    // Get pixel ratio
    this._pixelRatio = config.pixelRatio ?? window.devicePixelRatio ?? 1;

    // Get canvas context
    if (device.type === 'webgpu') {
      this._context = canvas.getContext('webgpu');
      if (!this._context) {
        throw new Error('Failed to get WebGPU context');
      }

      // Get preferred format
      const preferredFormat = (navigator.gpu as any).getPreferredCanvasFormat();
      this._format = (config.format as any) || preferredFormat || TextureFormat.BGRA8Unorm;

      // Configure swap chain
      this._context.configure({
        device: (device as any).device, // Native WebGPU device
        format: this._format,
        usage: 0x10, // RENDER_ATTACHMENT
        alphaMode: config.alphaMode || 'opaque',
      });

      logger.info(`WebGPU swap chain configured: ${this._format}`);
    } else if (device.type === 'webgl2') {
      this._context = canvas.getContext('webgl2', {
        alpha: config.alphaMode !== 'opaque',
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: config.alphaMode === 'premultiplied',
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      });

      if (!this._context) {
        throw new Error('Failed to get WebGL2 context');
      }

      this._format = TextureFormat.RGBA8Unorm;

      logger.info('WebGL2 context configured');
    } else {
      throw new Error(`Unsupported device type: ${device.type}`);
    }

    // Set initial size
    this._displayWidth = canvas.clientWidth;
    this._displayHeight = canvas.clientHeight;
    this._width = Math.floor(this._displayWidth * this._pixelRatio);
    this._height = Math.floor(this._displayHeight * this._pixelRatio);

    canvas.width = this._width;
    canvas.height = this._height;

    this._initialized = true;

    logger.info(
      `BackbufferManager initialized: ${this._width}x${this._height} ` +
        `(display: ${this._displayWidth}x${this._displayHeight}, ratio: ${this._pixelRatio})`
    );
  }

  /**
   * Resizes the backbuffer to match new dimensions.
   *
   * @param width - New width in CSS pixels
   * @param height - New height in CSS pixels
   *
   * @example
   * ```typescript
   * backbufferMgr.resize(1920, 1080);
   * ```
   */
  resize(width: number, height: number): void {
    if (!this._initialized || !this._canvas) {
      logger.warn('Cannot resize: BackbufferManager not initialized');
      return;
    }

    // Clamp to minimum size
    width = Math.max(1, width);
    height = Math.max(1, height);

    // Check if size actually changed
    if (width === this._displayWidth && height === this._displayHeight) {
      return;
    }

    this._displayWidth = width;
    this._displayHeight = height;
    this._width = Math.floor(width * this._pixelRatio);
    this._height = Math.floor(height * this._pixelRatio);

    this._canvas.width = this._width;
    this._canvas.height = this._height;

    logger.info(
      `BackbufferManager resized: ${this._width}x${this._height} ` +
        `(display: ${this._displayWidth}x${this._displayHeight})`
    );
  }

  /**
   * Updates the pixel ratio and resizes accordingly.
   *
   * @param pixelRatio - New pixel ratio
   *
   * @example
   * ```typescript
   * backbufferMgr.setPixelRatio(2.0);
   * ```
   */
  setPixelRatio(pixelRatio: number): void {
    if (pixelRatio === this._pixelRatio) {
      return;
    }

    this._pixelRatio = pixelRatio;
    this.resize(this._displayWidth, this._displayHeight);
  }

  /**
   * Acquires the current backbuffer texture for rendering.
   * Must be called once per frame before rendering.
   *
   * @returns Current backbuffer texture
   *
   * @example
   * ```typescript
   * const backbuffer = backbufferMgr.acquireBackbuffer();
   * const view = backbuffer.createView();
   * // Render to view...
   * ```
   */
  acquireBackbuffer(): any {
    if (!this._initialized || !this._device) {
      throw new Error('BackbufferManager not initialized');
    }

    if (this._device.type === 'webgpu') {
      // Get current texture from swap chain
      this._currentTexture = this._context.getCurrentTexture();
      return this._currentTexture;
    } else if (this._device.type === 'webgl2') {
      // WebGL2 renders directly to canvas, return a dummy object
      // that represents the default framebuffer
      this._currentTexture = {
        width: this._width,
        height: this._height,
        format: this._format,
        isDefaultFramebuffer: true,
        createView: () => null, // No view needed for default framebuffer
      };
      return this._currentTexture;
    }

    throw new Error('Unsupported device type');
  }

  /**
   * Presents the current frame to the screen.
   * Must be called after rendering is complete.
   *
   * @example
   * ```typescript
   * backbufferMgr.present();
   * ```
   */
  present(): void {
    if (!this._initialized) {
      logger.warn('Cannot present: BackbufferManager not initialized');
      return;
    }

    // For WebGPU, presentation happens automatically
    // For WebGL2, no explicit present call needed
    this._currentTexture = null;
  }

  /**
   * Gets the current backbuffer width in pixels.
   * @returns Width in pixels
   */
  get width(): number {
    return this._width;
  }

  /**
   * Gets the current backbuffer height in pixels.
   * @returns Height in pixels
   */
  get height(): number {
    return this._height;
  }

  /**
   * Gets the display width in CSS pixels.
   * @returns Display width
   */
  get displayWidth(): number {
    return this._displayWidth;
  }

  /**
   * Gets the display height in CSS pixels.
   * @returns Display height
   */
  get displayHeight(): number {
    return this._displayHeight;
  }

  /**
   * Gets the current pixel ratio.
   * @returns Pixel ratio
   */
  get pixelRatio(): number {
    return this._pixelRatio;
  }

  /**
   * Gets the backbuffer texture format.
   * @returns Texture format
   */
  get format(): TextureFormat {
    return this._format;
  }

  /**
   * Gets the aspect ratio (width / height).
   * @returns Aspect ratio
   */
  get aspectRatio(): number {
    return this._height > 0 ? this._width / this._height : 1;
  }

  /**
   * Checks if the backbuffer manager is initialized.
   * @returns True if initialized
   */
  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Sets the present mode (v-sync control).
   * Note: This may not be supported on all platforms.
   *
   * @param mode - Present mode
   *
   * @example
   * ```typescript
   * backbufferMgr.setPresentMode(PresentMode.Immediate); // V-sync off
   * ```
   */
  setPresentMode(mode: PresentMode): void {
    if (!this._initialized) {
      logger.warn('Cannot set present mode: BackbufferManager not initialized');
      return;
    }

    this._config.presentMode = mode;

    // Reconfigure swap chain for WebGPU
    if (this._device?.type === 'webgpu' && this._context) {
      try {
        this._context.configure({
          device: (this._device as any).device,
          format: this._format,
          usage: 0x10, // RENDER_ATTACHMENT
          alphaMode: this._config.alphaMode || 'opaque',
          // Note: presentMode is not directly configurable in WebGPU
          // It's controlled by the browser
        });

        logger.info(`Present mode set to: ${mode}`);
      } catch (err) {
        logger.error(`Failed to set present mode: ${err}`);
      }
    } else {
      logger.warn('Present mode control not supported for this backend');
    }
  }

  /**
   * Disposes of the backbuffer manager and releases resources.
   *
   * @example
   * ```typescript
   * backbufferMgr.dispose();
   * ```
   */
  dispose(): void {
    if (!this._initialized) {
      return;
    }

    this._currentTexture = null;
    this._context = null;
    this._canvas = null;
    this._device = null;
    this._initialized = false;

    logger.info('BackbufferManager disposed');
  }
}
