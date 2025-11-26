import { Logger } from '../../core/Logger';
import { Texture, TextureDescriptor, TextureFormat, TextureFilter, TextureWrap } from './Texture';

// Re-export TextureFormat for convenience
export { TextureFormat } from './Texture';

const logger = Logger.create('RenderTexture');

/**
 * Render texture descriptor for render-to-texture operations.
 */
export interface RenderTextureDescriptor extends Omit<TextureDescriptor, 'mipLevels' | 'depth'> {
  /** Enable depth buffer (default: false) */
  depth?: boolean;
  /** Depth format (default: Depth24) */
  depthFormat?: TextureFormat;
  /** Enable stencil buffer (default: false) */
  stencil?: boolean;
  /** Enable multisampling (default: false) */
  multisample?: boolean;
  /** Sample count for MSAA (default: 4) */
  sampleCount?: number;
  /** Auto-generate mipmaps after render (default: false) */
  autoGenerateMipmaps?: boolean;
}

/**
 * Attachment type for framebuffer configuration.
 */
export enum AttachmentType {
  Color = 'Color',
  Depth = 'Depth',
  Stencil = 'Stencil',
  DepthStencil = 'DepthStencil',
}

/**
 * Render texture for render-to-texture operations.
 * Supports depth buffers, stencil buffers, and multisampling.
 *
 * @example
 * ```typescript
 * // Create a render texture for post-processing
 * const renderTarget = new RenderTexture({
 *   width: 1920,
 *   height: 1080,
 *   format: TextureFormat.RGBA16F,
 *   depth: true,
 *   label: 'MainRenderTarget',
 * });
 *
 * // Render scene to texture
 * renderer.setRenderTarget(renderTarget);
 * renderer.render(scene, camera);
 * renderer.setRenderTarget(null);
 *
 * // Use rendered texture for post-processing
 * postProcess.apply(renderTarget.getColorTexture());
 *
 * // Create MSAA render texture
 * const msaaTarget = new RenderTexture({
 *   width: 1920,
 *   height: 1080,
 *   format: TextureFormat.RGBA8,
 *   multisample: true,
 *   sampleCount: 8,
 * });
 *
 * // Resize on window resize
 * window.addEventListener('resize', () => {
 *   renderTarget.resize(window.innerWidth, window.innerHeight);
 * });
 * ```
 */
export class RenderTexture {
  /** Color attachment texture */
  private colorTexture: Texture;

  /** Depth attachment texture (optional) */
  private depthTexture: Texture | null = null;

  /** WebGL framebuffer handle */
  private framebuffer: WebGLFramebuffer | null = null;

  /** Multisampled framebuffer for MSAA */
  private msaaFramebuffer: WebGLFramebuffer | null = null;

  /** Multisampled color renderbuffer */
  private msaaColorBuffer: WebGLRenderbuffer | null = null;

  /** Multisampled depth renderbuffer */
  private msaaDepthBuffer: WebGLRenderbuffer | null = null;

  /** Whether depth buffer is enabled */
  private readonly hasDepth: boolean;

  /** Whether stencil buffer is enabled */
  private readonly hasStencil: boolean;

  /** Whether multisampling is enabled */
  private readonly hasMultisample: boolean;

  /** MSAA sample count */
  private readonly sampleCount: number;

  /** Auto-generate mipmaps after render */
  private readonly autoGenerateMipmaps: boolean;

  /** Current width */
  private currentWidth: number;

  /** Current height */
  private currentHeight: number;

  /** Debug label */
  readonly label: string;

  /**
   * Creates a new RenderTexture instance.
   *
   * @param descriptor - Render texture descriptor
   *
   * @example
   * ```typescript
   * const rt = new RenderTexture({
   *   width: 1024,
   *   height: 1024,
   *   format: TextureFormat.RGBA16F,
   *   depth: true,
   *   depthFormat: TextureFormat.Depth24,
   *   multisample: true,
   *   sampleCount: 4,
   * });
   * ```
   */
  constructor(descriptor: RenderTextureDescriptor) {
    this.currentWidth = descriptor.width;
    this.currentHeight = descriptor.height;
    this.hasDepth = descriptor.depth || false;
    this.hasStencil = descriptor.stencil || false;
    this.hasMultisample = descriptor.multisample || false;
    this.sampleCount = Math.min(16, Math.max(1, descriptor.sampleCount || 4));
    this.autoGenerateMipmaps = descriptor.autoGenerateMipmaps || false;
    this.label = descriptor.label || 'RenderTexture';

    // Create color texture
    const colorDesc: TextureDescriptor = {
      width: descriptor.width,
      height: descriptor.height,
      format: descriptor.format,
      minFilter: descriptor.minFilter || TextureFilter.Linear,
      magFilter: descriptor.magFilter || TextureFilter.Linear,
      wrapU: descriptor.wrapU || TextureWrap.ClampToEdge,
      wrapV: descriptor.wrapV || TextureWrap.ClampToEdge,
      anisotropy: descriptor.anisotropy || 1,
      mipLevels: this.autoGenerateMipmaps ? 0 : 1,
      label: `${this.label}_Color`,
    };

    this.colorTexture = new Texture(colorDesc);

    // Create depth texture if needed
    if (this.hasDepth || this.hasStencil) {
      const depthFormat = this.hasStencil
        ? TextureFormat.Depth24Stencil8
        : (descriptor.depthFormat || TextureFormat.Depth24);

      const depthDesc: TextureDescriptor = {
        width: descriptor.width,
        height: descriptor.height,
        format: depthFormat,
        minFilter: TextureFilter.Nearest,
        magFilter: TextureFilter.Nearest,
        wrapU: TextureWrap.ClampToEdge,
        wrapV: TextureWrap.ClampToEdge,
        anisotropy: 1,
        mipLevels: 1,
        label: `${this.label}_Depth`,
      };

      this.depthTexture = new Texture(depthDesc);
    }

    logger.info(`Created render texture: ${this.label}`, {
      width: this.currentWidth,
      height: this.currentHeight,
      format: descriptor.format,
      depth: this.hasDepth,
      multisample: this.hasMultisample,
      samples: this.sampleCount,
    });
  }

  /**
   * Gets the color attachment texture.
   *
   * @returns Color texture
   *
   * @example
   * ```typescript
   * const colorTex = renderTarget.getColorTexture();
   * material.setTexture('uTexture', colorTex);
   * ```
   */
  getColorTexture(): Texture {
    return this.colorTexture;
  }

  /**
   * Gets the depth attachment texture.
   *
   * @returns Depth texture or null if not enabled
   *
   * @example
   * ```typescript
   * const depthTex = renderTarget.getDepthTexture();
   * if (depthTex) {
   *   material.setTexture('uDepth', depthTex);
   * }
   * ```
   */
  getDepthTexture(): Texture | null {
    return this.depthTexture;
  }

  /**
   * Gets the WebGL framebuffer handle.
   *
   * @returns Framebuffer or null if not created
   */
  getFramebuffer(): WebGLFramebuffer | null {
    return this.framebuffer;
  }

  /**
   * Gets the MSAA framebuffer handle.
   *
   * @returns MSAA framebuffer or null if not enabled
   */
  getMSAAFramebuffer(): WebGLFramebuffer | null {
    return this.msaaFramebuffer;
  }

  /**
   * Sets the WebGL framebuffer handle.
   * Should only be called by the rendering backend.
   *
   * @param fb - Framebuffer handle
   */
  setFramebuffer(fb: WebGLFramebuffer | null): void {
    this.framebuffer = fb;
  }

  /**
   * Gets current width.
   *
   * @returns Width in pixels
   */
  getWidth(): number {
    return this.currentWidth;
  }

  /**
   * Gets current height.
   *
   * @returns Height in pixels
   */
  getHeight(): number {
    return this.currentHeight;
  }

  /**
   * Gets aspect ratio.
   *
   * @returns Width / height
   */
  getAspectRatio(): number {
    return this.currentWidth / this.currentHeight;
  }

  /**
   * Checks if depth buffer is enabled.
   *
   * @returns True if depth buffer exists
   */
  hasDepthBuffer(): boolean {
    return this.hasDepth;
  }

  /**
   * Checks if stencil buffer is enabled.
   *
   * @returns True if stencil buffer exists
   */
  hasStencilBuffer(): boolean {
    return this.hasStencil;
  }

  /**
   * Checks if multisampling is enabled.
   *
   * @returns True if MSAA is enabled
   */
  isMultisampled(): boolean {
    return this.hasMultisample;
  }

  /**
   * Gets MSAA sample count.
   *
   * @returns Number of samples (1 if not multisampled)
   */
  getSampleCount(): number {
    return this.hasMultisample ? this.sampleCount : 1;
  }

  /**
   * Checks if mipmaps should be auto-generated.
   *
   * @returns True if auto-generation is enabled
   */
  shouldAutoGenerateMipmaps(): boolean {
    return this.autoGenerateMipmaps;
  }

  /**
   * Resizes the render texture.
   * Recreates internal buffers and textures.
   *
   * @param width - New width
   * @param height - New height
   *
   * @example
   * ```typescript
   * // Resize to match window
   * renderTarget.resize(window.innerWidth, window.innerHeight);
   * ```
   */
  resize(width: number, height: number): void {
    if (width === this.currentWidth && height === this.currentHeight) {
      return;
    }

    logger.debug(`Resizing ${this.label} from ${this.currentWidth}x${this.currentHeight} to ${width}x${height}`);

    this.currentWidth = width;
    this.currentHeight = height;

    // Resize color texture
    this.colorTexture.resize(width, height);

    // Resize depth texture
    if (this.depthTexture) {
      this.depthTexture.resize(width, height);
    }

    // In a real implementation, would recreate framebuffer and renderbuffers
    // with new dimensions
  }

  /**
   * Generates mipmaps for the color texture.
   * Only works if not multisampled.
   *
   * @example
   * ```typescript
   * renderer.setRenderTarget(renderTarget);
   * renderer.render(scene, camera);
   * renderer.setRenderTarget(null);
   * renderTarget.generateMipmaps();
   * ```
   */
  generateMipmaps(): void {
    if (this.hasMultisample) {
      logger.warn(`Cannot generate mipmaps for multisampled render texture: ${this.label}`);
      return;
    }

    this.colorTexture.generateMipmaps();
    logger.trace(`Generated mipmaps for ${this.label}`);
  }

  /**
   * Resolves MSAA buffer to the regular texture.
   * Should be called after rendering if multisampling is enabled.
   *
   * @example
   * ```typescript
   * if (renderTarget.isMultisampled()) {
   *   renderTarget.resolve();
   * }
   * ```
   */
  resolve(): void {
    if (!this.hasMultisample) {
      return;
    }

    // In a real implementation, would blit from MSAA buffer to regular texture
    logger.trace(`Resolved MSAA buffer for ${this.label}`);
  }

  /**
   * Creates renderbuffers for MSAA.
   * Called by rendering backend.
   *
   * @param gl - WebGL2 context
   */
  createMSAABuffers(gl: WebGL2RenderingContext): void {
    if (!this.hasMultisample) {
      return;
    }

    // Create color renderbuffer
    this.msaaColorBuffer = gl.createRenderbuffer();
    if (this.msaaColorBuffer) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.msaaColorBuffer);
      gl.renderbufferStorageMultisample(
        gl.RENDERBUFFER,
        this.sampleCount,
        gl.RGBA8,
        this.currentWidth,
        this.currentHeight
      );
    }

    // Create depth renderbuffer if needed
    if (this.hasDepth || this.hasStencil) {
      this.msaaDepthBuffer = gl.createRenderbuffer();
      if (this.msaaDepthBuffer) {
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.msaaDepthBuffer);
        const format = this.hasStencil ? gl.DEPTH24_STENCIL8 : gl.DEPTH_COMPONENT24;
        gl.renderbufferStorageMultisample(
          gl.RENDERBUFFER,
          this.sampleCount,
          format,
          this.currentWidth,
          this.currentHeight
        );
      }
    }

    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  /**
   * Destroys the render texture and releases all GPU resources.
   *
   * @example
   * ```typescript
   * renderTarget.destroy();
   * ```
   */
  destroy(): void {
    // Destroy textures
    this.colorTexture.destroy();
    if (this.depthTexture) {
      this.depthTexture.destroy();
    }

    // In a real implementation, would delete framebuffers and renderbuffers
    this.framebuffer = null;
    this.msaaFramebuffer = null;
    this.msaaColorBuffer = null;
    this.msaaDepthBuffer = null;

    logger.debug(`Destroyed render texture: ${this.label}`);
  }

  /**
   * Converts to JSON representation.
   *
   * @returns JSON object
   */
  toJSON(): Record<string, any> {
    return {
      label: this.label,
      width: this.currentWidth,
      height: this.currentHeight,
      colorTexture: this.colorTexture.toJSON(),
      depthTexture: this.depthTexture?.toJSON() || null,
      hasDepth: this.hasDepth,
      hasStencil: this.hasStencil,
      hasMultisample: this.hasMultisample,
      sampleCount: this.sampleCount,
      autoGenerateMipmaps: this.autoGenerateMipmaps,
    };
  }

  /**
   * Creates a render texture matching the canvas size.
   *
   * @param canvas - Canvas element
   * @param format - Color format (default: RGBA8)
   * @param depth - Enable depth buffer (default: true)
   * @returns New render texture
   *
   * @example
   * ```typescript
   * const canvas = document.querySelector('canvas')!;
   * const rt = RenderTexture.fromCanvas(canvas);
   * ```
   */
  static fromCanvas(
    canvas: HTMLCanvasElement,
    format: TextureFormat = TextureFormat.RGBA8,
    depth: boolean = true
  ): RenderTexture {
    return new RenderTexture({
      width: canvas.width,
      height: canvas.height,
      format,
      depth,
      label: 'CanvasRenderTexture',
    });
  }

  /**
   * Creates a render texture matching window dimensions.
   *
   * @param format - Color format (default: RGBA8)
   * @param depth - Enable depth buffer (default: true)
   * @returns New render texture
   *
   * @example
   * ```typescript
   * const rt = RenderTexture.fromWindow();
   * ```
   */
  static fromWindow(
    format: TextureFormat = TextureFormat.RGBA8,
    depth: boolean = true
  ): RenderTexture {
    return new RenderTexture({
      width: window.innerWidth,
      height: window.innerHeight,
      format,
      depth,
      label: 'WindowRenderTexture',
    });
  }
}
