/**
 * Framebuffer abstraction for G3D rendering engine.
 * Manages render targets with color, depth, and stencil attachments.
 * Supports multisampling, resize handling, and read pixels operations.
 *
 * @module RenderTarget
 */

import { Logger } from '../../core/Logger';
import { Color } from '../../math/Color';
import { Rect } from '../../math/Rect';

const logger = Logger.create('RenderTarget');

/**
 * Texture format for render target attachments.
 */
export enum TextureFormat {
  // Color formats
  RGBA8 = 'rgba8unorm',
  RGBA16F = 'rgba16float',
  RGBA32F = 'rgba32float',
  RGB10A2 = 'rgb10a2unorm',
  BGRA8 = 'bgra8unorm',

  // Depth/stencil formats
  Depth16 = 'depth16unorm',
  Depth24 = 'depth24plus',
  Depth32F = 'depth32float',
  Depth24Stencil8 = 'depth24plus-stencil8',
  Depth32FStencil8 = 'depth32float-stencil8',
  Stencil8 = 'stencil8',
}

/**
 * Load action for an attachment at the start of a render pass.
 */
export enum LoadAction {
  /** Load existing contents */
  Load = 0,
  /** Clear to specified value */
  Clear = 1,
  /** Don't care about previous contents (fastest) */
  DontCare = 2,
}

/**
 * Store action for an attachment at the end of a render pass.
 */
export enum StoreAction {
  /** Store the results */
  Store = 0,
  /** Don't store (useful for transient attachments) */
  DontCare = 1,
  /** Resolve multisample to non-multisample texture */
  Resolve = 2,
}

/**
 * Attachment descriptor for color, depth, or stencil.
 *
 * @example
 * ```typescript
 * const colorAttachment: AttachmentDescriptor = {
 *   format: TextureFormat.RGBA8,
 *   samples: 4,
 *   loadAction: LoadAction.Clear,
 *   storeAction: StoreAction.Store,
 *   clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
 * };
 * ```
 */
export interface AttachmentDescriptor {
  /** Texture format */
  format: TextureFormat;
  /** Sample count (1 for no multisampling) */
  samples?: number;
  /** Load action at pass start */
  loadAction: LoadAction;
  /** Store action at pass end */
  storeAction: StoreAction;
  /** Clear value (required if loadAction is Clear) */
  clearValue?: Color | number;
  /** Resolve target for multisample attachments */
  resolveTarget?: RenderTargetAttachment;
}

/**
 * Render target attachment (texture or texture view).
 * GPU-specific texture object (WebGLTexture, GPUTexture, etc.)
 */
export interface RenderTargetAttachment {
  /** GPU texture object */
  texture: unknown;
  /** Texture format */
  format: TextureFormat;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Sample count */
  samples: number;
  /** Mip level to attach (default: 0) */
  level?: number;
  /** Array layer to attach (default: 0) */
  layer?: number;
}

/**
 * Render target descriptor.
 *
 * @example
 * ```typescript
 * const desc: RenderTargetDescriptor = {
 *   width: 1920,
 *   height: 1080,
 *   samples: 4,
 *   colorAttachments: [
 *     {
 *       format: TextureFormat.RGBA8,
 *       samples: 4,
 *       loadAction: LoadAction.Clear,
 *       storeAction: StoreAction.Resolve,
 *       clearValue: Color.black(),
 *     },
 *   ],
 *   depthStencilAttachment: {
 *     format: TextureFormat.Depth24Stencil8,
 *     samples: 4,
 *     loadAction: LoadAction.Clear,
 *     storeAction: StoreAction.DontCare,
 *     clearValue: 1.0,
 *   },
 * };
 * ```
 */
export interface RenderTargetDescriptor {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Sample count for multisampling (1 for no MSAA) */
  samples?: number;
  /** Color attachments (up to 8) */
  colorAttachments: AttachmentDescriptor[];
  /** Depth/stencil attachment (optional) */
  depthStencilAttachment?: AttachmentDescriptor;
  /** Debug label */
  label?: string;
}

/**
 * Framebuffer abstraction for render targets.
 * Manages color, depth, and stencil attachments with support for
 * multisampling, resize handling, and read pixels operations.
 *
 * RenderTarget is backend-agnostic and works with both WebGL and WebGPU.
 * Actual texture creation is handled by the graphics backend.
 *
 * @example
 * ```typescript
 * // Create render target
 * const renderTarget = new RenderTarget({
 *   width: 1920,
 *   height: 1080,
 *   samples: 4,
 *   colorAttachments: [
 *     {
 *       format: TextureFormat.RGBA8,
 *       loadAction: LoadAction.Clear,
 *       storeAction: StoreAction.Store,
 *       clearValue: Color.black(),
 *     },
 *   ],
 *   depthStencilAttachment: {
 *     format: TextureFormat.Depth24Stencil8,
 *     loadAction: LoadAction.Clear,
 *     storeAction: StoreAction.DontCare,
 *     clearValue: 1.0,
 *   },
 * });
 *
 * // Resize
 * renderTarget.resize(2560, 1440);
 *
 * // Access attachments
 * const colorTexture = renderTarget.getColorAttachment(0);
 * const depthTexture = renderTarget.getDepthStencilAttachment();
 * ```
 */
export class RenderTarget {
  /** Render target width in pixels */
  private _width: number;

  /** Render target height in pixels */
  private _height: number;

  /** Sample count for multisampling */
  private _samples: number;

  /** Color attachments (up to 8) */
  private _colorAttachments: (RenderTargetAttachment | null)[] = new Array(8).fill(null);

  /** Depth/stencil attachment */
  private _depthStencilAttachment: RenderTargetAttachment | null = null;

  /** Color attachment descriptors (for resize) */
  private _colorDescriptors: AttachmentDescriptor[];

  /** Depth/stencil attachment descriptor (for resize) */
  private _depthStencilDescriptor: AttachmentDescriptor | null = null;

  /** Debug label */
  private _label: string;

  /** Whether attachments need recreation */
  private _needsRecreate: boolean = false;

  /** Callback for texture creation (set by graphics backend) */
  private _createTextureCallback: ((desc: AttachmentDescriptor, width: number, height: number, samples: number) => RenderTargetAttachment) | null = null;

  /** Callback for texture destruction (set by graphics backend) */
  private _destroyTextureCallback: ((texture: RenderTargetAttachment) => void) | null = null;

  /**
   * Creates a new render target.
   *
   * @param descriptor - Render target descriptor
   */
  constructor(descriptor: RenderTargetDescriptor) {
    this._width = descriptor.width;
    this._height = descriptor.height;
    this._samples = descriptor.samples ?? 1;
    this._colorDescriptors = [...descriptor.colorAttachments];
    this._depthStencilDescriptor = descriptor.depthStencilAttachment ?? null;
    this._label = descriptor.label ?? 'RenderTarget';

    logger.debug(`Created render target: ${this._label} (${this._width}x${this._height}, ${this._samples}x MSAA)`);
  }

  /**
   * Gets the render target width.
   */
  get width(): number {
    return this._width;
  }

  /**
   * Gets the render target height.
   */
  get height(): number {
    return this._height;
  }

  /**
   * Gets the sample count.
   */
  get samples(): number {
    return this._samples;
  }

  /**
   * Gets the debug label.
   */
  get label(): string {
    return this._label;
  }

  /**
   * Gets the number of color attachments.
   */
  get colorAttachmentCount(): number {
    let count = 0;
    for (const attachment of this._colorAttachments) {
      if (attachment !== null) {
        count++;
      }
    }
    return count;
  }

  /**
   * Checks if the render target has a depth/stencil attachment.
   */
  get hasDepthStencil(): boolean {
    return this._depthStencilAttachment !== null;
  }

  /**
   * Gets a color attachment by index.
   *
   * @param index - Attachment index (0-7)
   * @returns Color attachment or null
   */
  getColorAttachment(index: number): RenderTargetAttachment | null {
    if (index < 0 || index >= 8) {
      logger.warn(`Invalid color attachment index: ${index}`);
      return null;
    }
    return this._colorAttachments[index];
  }

  /**
   * Gets the depth/stencil attachment.
   *
   * @returns Depth/stencil attachment or null
   */
  getDepthStencilAttachment(): RenderTargetAttachment | null {
    return this._depthStencilAttachment;
  }

  /**
   * Gets all color attachments.
   *
   * @returns Array of color attachments (may contain nulls)
   */
  getColorAttachments(): readonly (RenderTargetAttachment | null)[] {
    return this._colorAttachments;
  }

  /**
   * Sets a color attachment.
   * Used by graphics backend during texture creation.
   *
   * @param index - Attachment index (0-7)
   * @param attachment - Color attachment
   */
  setColorAttachment(index: number, attachment: RenderTargetAttachment | null): void {
    if (index < 0 || index >= 8) {
      logger.warn(`Invalid color attachment index: ${index}`);
      return;
    }
    this._colorAttachments[index] = attachment;
  }

  /**
   * Sets the depth/stencil attachment.
   * Used by graphics backend during texture creation.
   *
   * @param attachment - Depth/stencil attachment
   */
  setDepthStencilAttachment(attachment: RenderTargetAttachment | null): void {
    this._depthStencilAttachment = attachment;
  }

  /**
   * Sets the texture creation callback.
   * Called by graphics backend to handle texture creation.
   *
   * @param callback - Texture creation callback
   */
  setCreateTextureCallback(
    callback: (desc: AttachmentDescriptor, width: number, height: number, samples: number) => RenderTargetAttachment
  ): void {
    this._createTextureCallback = callback;
  }

  /**
   * Sets the texture destruction callback.
   * Called by graphics backend to handle texture cleanup.
   *
   * @param callback - Texture destruction callback
   */
  setDestroyTextureCallback(callback: (texture: RenderTargetAttachment) => void): void {
    this._destroyTextureCallback = callback;
  }

  /**
   * Resizes the render target.
   * Destroys existing attachments and recreates them with new dimensions.
   *
   * @param width - New width in pixels
   * @param height - New height in pixels
   *
   * @example
   * ```typescript
   * renderTarget.resize(2560, 1440);
   * ```
   */
  resize(width: number, height: number): void {
    if (width === this._width && height === this._height) {
      return;
    }

    logger.debug(`Resizing render target ${this._label}: ${this._width}x${this._height} -> ${width}x${height}`);

    this._width = width;
    this._height = height;
    this._needsRecreate = true;

    // Destroy existing attachments
    this.destroyAttachments();

    // Recreate attachments if we have a creation callback
    if (this._createTextureCallback) {
      this.createAttachments();
    }
  }

  /**
   * Creates render target attachments.
   * Called by graphics backend or after resize.
   */
  createAttachments(): void {
    if (!this._createTextureCallback) {
      logger.warn('Cannot create attachments: no creation callback set');
      return;
    }

    // Create color attachments
    for (let i = 0; i < this._colorDescriptors.length; i++) {
      const desc = this._colorDescriptors[i];
      const samples = desc.samples ?? this._samples;
      const attachment = this._createTextureCallback(desc, this._width, this._height, samples);
      this._colorAttachments[i] = attachment;
    }

    // Create depth/stencil attachment
    if (this._depthStencilDescriptor) {
      const samples = this._depthStencilDescriptor.samples ?? this._samples;
      const attachment = this._createTextureCallback(
        this._depthStencilDescriptor,
        this._width,
        this._height,
        samples
      );
      this._depthStencilAttachment = attachment;
    }

    this._needsRecreate = false;
    logger.debug(`Created attachments for render target ${this._label}`);
  }

  /**
   * Destroys render target attachments.
   * Called during resize or cleanup.
   */
  destroyAttachments(): void {
    if (!this._destroyTextureCallback) {
      return;
    }

    // Destroy color attachments
    for (let i = 0; i < this._colorAttachments.length; i++) {
      const attachment = this._colorAttachments[i];
      if (attachment) {
        this._destroyTextureCallback(attachment);
        this._colorAttachments[i] = null;
      }
    }

    // Destroy depth/stencil attachment
    if (this._depthStencilAttachment) {
      this._destroyTextureCallback(this._depthStencilAttachment);
      this._depthStencilAttachment = null;
    }

    logger.debug(`Destroyed attachments for render target ${this._label}`);
  }

  /**
   * Checks if attachments need recreation.
   */
  needsRecreate(): boolean {
    return this._needsRecreate;
  }

  /**
   * Gets the viewport rectangle for this render target.
   *
   * @returns Viewport rectangle
   */
  getViewport(): Rect {
    return new Rect(0, 0, this._width, this._height);
  }

  /**
   * Gets color attachment descriptor by index.
   *
   * @param index - Attachment index
   * @returns Attachment descriptor or null
   */
  getColorDescriptor(index: number): AttachmentDescriptor | null {
    if (index < 0 || index >= this._colorDescriptors.length) {
      return null;
    }
    return this._colorDescriptors[index];
  }

  /**
   * Gets depth/stencil attachment descriptor.
   *
   * @returns Attachment descriptor or null
   */
  getDepthStencilDescriptor(): AttachmentDescriptor | null {
    return this._depthStencilDescriptor;
  }

  /**
   * Disposes the render target and releases all resources.
   * The render target should not be used after disposal.
   */
  dispose(): void {
    logger.debug(`Disposing render target ${this._label}`);
    this.destroyAttachments();
  }

  /**
   * Creates the default framebuffer (screen).
   * Used for rendering directly to the canvas.
   *
   * @param width - Canvas width
   * @param height - Canvas height
   * @returns Default framebuffer render target
   */
  static createDefaultFramebuffer(width: number, height: number): RenderTarget {
    return new RenderTarget({
      width,
      height,
      samples: 1,
      colorAttachments: [
        {
          format: TextureFormat.BGRA8,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: Color.black(),
        },
      ],
      depthStencilAttachment: {
        format: TextureFormat.Depth24Stencil8,
        loadAction: LoadAction.Clear,
        storeAction: StoreAction.DontCare,
        clearValue: 1.0,
      },
      label: 'DefaultFramebuffer',
    });
  }

  /**
   * Creates a simple color-only render target.
   *
   * @param width - Width in pixels
   * @param height - Height in pixels
   * @param format - Color format (default: RGBA8)
   * @param samples - Sample count (default: 1)
   * @returns Render target
   */
  static createColorTarget(
    width: number,
    height: number,
    format: TextureFormat = TextureFormat.RGBA8,
    samples: number = 1
  ): RenderTarget {
    return new RenderTarget({
      width,
      height,
      samples,
      colorAttachments: [
        {
          format,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: Color.black(),
        },
      ],
      label: 'ColorTarget',
    });
  }

  /**
   * Creates a render target with color and depth.
   *
   * @param width - Width in pixels
   * @param height - Height in pixels
   * @param colorFormat - Color format (default: RGBA8)
   * @param depthFormat - Depth format (default: Depth24)
   * @param samples - Sample count (default: 1)
   * @returns Render target
   */
  static createColorDepthTarget(
    width: number,
    height: number,
    colorFormat: TextureFormat = TextureFormat.RGBA8,
    depthFormat: TextureFormat = TextureFormat.Depth24,
    samples: number = 1
  ): RenderTarget {
    return new RenderTarget({
      width,
      height,
      samples,
      colorAttachments: [
        {
          format: colorFormat,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: Color.black(),
        },
      ],
      depthStencilAttachment: {
        format: depthFormat,
        loadAction: LoadAction.Clear,
        storeAction: StoreAction.DontCare,
        clearValue: 1.0,
      },
      label: 'ColorDepthTarget',
    });
  }
}
