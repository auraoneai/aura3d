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
 * RenderTarget directly manages WebGL framebuffer objects and textures.
 * Supports MRT (Multiple Render Targets) and various texture formats.
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
 * // Create WebGL resources
 * renderTarget.create(gl);
 *
 * // Bind for rendering
 * renderTarget.bind(gl);
 *
 * // Resize
 * renderTarget.resize(gl, 2560, 1440);
 *
 * // Access attachments
 * const colorTexture = renderTarget.getColorTexture(0);
 * const depthTexture = renderTarget.getDepthTexture();
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

  /** WebGL framebuffer object */
  private fbo: WebGLFramebuffer | null = null;

  /** WebGL color textures (up to 8 for MRT) */
  private colorTextures: (WebGLTexture | null)[] = new Array(8).fill(null);

  /** WebGL depth texture */
  private depthTexture: WebGLTexture | null = null;

  /** WebGL depth renderbuffer (alternative to depth texture) */
  private depthRenderbuffer: WebGLRenderbuffer | null = null;

  /** Whether the FBO has been created */
  private _created: boolean = false;

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
   * Converts texture format to WebGL internal format.
   *
   * @param gl - WebGL2 rendering context
   * @param format - Texture format
   * @returns WebGL internal format constant
   */
  private getWebGLInternalFormat(gl: WebGL2RenderingContext, format: TextureFormat): number {
    switch (format) {
      // Color formats
      case TextureFormat.RGBA8:
        return gl.RGBA8;
      case TextureFormat.RGBA16F:
        return gl.RGBA16F;
      case TextureFormat.RGBA32F:
        return gl.RGBA32F;
      case TextureFormat.RGB10A2:
        return gl.RGB10_A2;
      case TextureFormat.BGRA8:
        return gl.RGBA8; // WebGL doesn't have BGRA internal format, use RGBA

      // Depth/stencil formats
      case TextureFormat.Depth16:
        return gl.DEPTH_COMPONENT16;
      case TextureFormat.Depth24:
        return gl.DEPTH_COMPONENT24;
      case TextureFormat.Depth32F:
        return gl.DEPTH_COMPONENT32F;
      case TextureFormat.Depth24Stencil8:
        return gl.DEPTH24_STENCIL8;
      case TextureFormat.Depth32FStencil8:
        return gl.DEPTH32F_STENCIL8;
      case TextureFormat.Stencil8:
        return gl.STENCIL_INDEX8;

      default:
        logger.warn(`Unknown texture format: ${format}, defaulting to RGBA8`);
        return gl.RGBA8;
    }
  }

  /**
   * Gets the WebGL format for a texture format.
   *
   * @param gl - WebGL2 rendering context
   * @param format - Texture format
   * @returns WebGL format constant
   */
  private getWebGLFormat(gl: WebGL2RenderingContext, format: TextureFormat): number {
    switch (format) {
      case TextureFormat.RGBA8:
      case TextureFormat.RGBA16F:
      case TextureFormat.RGBA32F:
      case TextureFormat.RGB10A2:
      case TextureFormat.BGRA8:
        return gl.RGBA;

      case TextureFormat.Depth16:
      case TextureFormat.Depth24:
      case TextureFormat.Depth32F:
        return gl.DEPTH_COMPONENT;

      case TextureFormat.Depth24Stencil8:
      case TextureFormat.Depth32FStencil8:
        return gl.DEPTH_STENCIL;

      case TextureFormat.Stencil8:
        return gl.STENCIL_INDEX8;

      default:
        return gl.RGBA;
    }
  }

  /**
   * Gets the WebGL type for a texture format.
   *
   * @param gl - WebGL2 rendering context
   * @param format - Texture format
   * @returns WebGL type constant
   */
  private getWebGLType(gl: WebGL2RenderingContext, format: TextureFormat): number {
    switch (format) {
      case TextureFormat.RGBA8:
      case TextureFormat.BGRA8:
        return gl.UNSIGNED_BYTE;

      case TextureFormat.RGBA16F:
        return gl.HALF_FLOAT;

      case TextureFormat.RGBA32F:
      case TextureFormat.Depth32F:
        return gl.FLOAT;

      case TextureFormat.RGB10A2:
        return gl.UNSIGNED_INT_2_10_10_10_REV;

      case TextureFormat.Depth16:
        return gl.UNSIGNED_SHORT;

      case TextureFormat.Depth24:
        return gl.UNSIGNED_INT;

      case TextureFormat.Depth24Stencil8:
        return gl.UNSIGNED_INT_24_8;

      case TextureFormat.Depth32FStencil8:
        return gl.FLOAT_32_UNSIGNED_INT_24_8_REV;

      case TextureFormat.Stencil8:
        return gl.UNSIGNED_BYTE;

      default:
        return gl.UNSIGNED_BYTE;
    }
  }

  /**
   * Checks if a format is a depth format.
   *
   * @param format - Texture format
   * @returns True if depth format
   */
  private isDepthFormat(format: TextureFormat): boolean {
    return (
      format === TextureFormat.Depth16 ||
      format === TextureFormat.Depth24 ||
      format === TextureFormat.Depth32F ||
      format === TextureFormat.Depth24Stencil8 ||
      format === TextureFormat.Depth32FStencil8
    );
  }

  /**
   * Creates WebGL resources for the render target.
   * Must be called before the render target can be used.
   *
   * @param gl - WebGL2 rendering context
   */
  create(gl: WebGL2RenderingContext): void {
    if (this._created) {
      logger.warn(`Render target ${this._label} already created`);
      return;
    }

    logger.debug(`Creating render target ${this._label} (${this._width}x${this._height})`);

    // Create framebuffer
    this.fbo = gl.createFramebuffer();
    if (!this.fbo) {
      logger.error('Failed to create framebuffer');
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);

    // Create color attachments
    for (let i = 0; i < this._colorDescriptors.length; i++) {
      if (i >= 8) {
        logger.warn(`Too many color attachments (max 8), skipping index ${i}`);
        break;
      }

      const desc = this._colorDescriptors[i];
      const texture = gl.createTexture();
      if (!texture) {
        logger.error(`Failed to create color texture ${i}`);
        continue;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);

      const internalFormat = this.getWebGLInternalFormat(gl, desc.format);
      const format = this.getWebGLFormat(gl, desc.format);
      const type = this.getWebGLType(gl, desc.format);

      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        internalFormat,
        this._width,
        this._height,
        0,
        format,
        type,
        null
      );

      // Set texture parameters
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // Attach to framebuffer
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0 + i,
        gl.TEXTURE_2D,
        texture,
        0
      );

      this.colorTextures[i] = texture;

      // Create attachment info
      this._colorAttachments[i] = {
        texture,
        format: desc.format,
        width: this._width,
        height: this._height,
        samples: this._samples,
      };

      logger.debug(`Created color attachment ${i} (${desc.format})`);
    }

    // Create depth/stencil attachment
    if (this._depthStencilDescriptor) {
      const desc = this._depthStencilDescriptor;
      const useTexture = true; // Use texture for depth to allow sampling

      if (useTexture) {
        const texture = gl.createTexture();
        if (!texture) {
          logger.error('Failed to create depth texture');
        } else {
          gl.bindTexture(gl.TEXTURE_2D, texture);

          const internalFormat = this.getWebGLInternalFormat(gl, desc.format);
          const format = this.getWebGLFormat(gl, desc.format);
          const type = this.getWebGLType(gl, desc.format);

          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            internalFormat,
            this._width,
            this._height,
            0,
            format,
            type,
            null
          );

          // Set texture parameters
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

          // Attach to framebuffer
          const attachment =
            desc.format === TextureFormat.Depth24Stencil8 ||
            desc.format === TextureFormat.Depth32FStencil8
              ? gl.DEPTH_STENCIL_ATTACHMENT
              : gl.DEPTH_ATTACHMENT;

          gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, texture, 0);

          this.depthTexture = texture;

          this._depthStencilAttachment = {
            texture,
            format: desc.format,
            width: this._width,
            height: this._height,
            samples: this._samples,
          };

          logger.debug(`Created depth texture (${desc.format})`);
        }
      } else {
        // Use renderbuffer (faster but can't be sampled)
        const renderbuffer = gl.createRenderbuffer();
        if (!renderbuffer) {
          logger.error('Failed to create depth renderbuffer');
        } else {
          gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);

          const internalFormat = this.getWebGLInternalFormat(gl, desc.format);
          gl.renderbufferStorage(gl.RENDERBUFFER, internalFormat, this._width, this._height);

          const attachment =
            desc.format === TextureFormat.Depth24Stencil8 ||
            desc.format === TextureFormat.Depth32FStencil8
              ? gl.DEPTH_STENCIL_ATTACHMENT
              : gl.DEPTH_ATTACHMENT;

          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, renderbuffer);

          this.depthRenderbuffer = renderbuffer;

          logger.debug(`Created depth renderbuffer (${desc.format})`);
        }
      }
    }

    // Validate framebuffer
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      logger.error(`Framebuffer incomplete: ${this.getFramebufferStatusString(gl, status)}`);
    } else {
      logger.debug(`Framebuffer ${this._label} is complete`);
    }

    // Unbind
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    this._created = true;
    this._needsRecreate = false;
  }

  /**
   * Gets a human-readable string for framebuffer status.
   *
   * @param gl - WebGL2 rendering context
   * @param status - Framebuffer status code
   * @returns Status string
   */
  private getFramebufferStatusString(gl: WebGL2RenderingContext, status: number): string {
    switch (status) {
      case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
        return 'FRAMEBUFFER_INCOMPLETE_ATTACHMENT';
      case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
        return 'FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT';
      case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
        return 'FRAMEBUFFER_INCOMPLETE_DIMENSIONS';
      case gl.FRAMEBUFFER_UNSUPPORTED:
        return 'FRAMEBUFFER_UNSUPPORTED';
      case gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE:
        return 'FRAMEBUFFER_INCOMPLETE_MULTISAMPLE';
      default:
        return `UNKNOWN (${status})`;
    }
  }

  /**
   * Binds the render target for rendering.
   *
   * @param gl - WebGL2 rendering context
   */
  bind(gl: WebGL2RenderingContext): void {
    if (!this._created || !this.fbo) {
      logger.error(`Cannot bind render target ${this._label}: not created`);
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this._width, this._height);

    // Setup draw buffers for MRT
    const drawBuffers: number[] = [];
    for (let i = 0; i < this._colorDescriptors.length && i < 8; i++) {
      if (this.colorTextures[i]) {
        drawBuffers.push(gl.COLOR_ATTACHMENT0 + i);
      }
    }

    if (drawBuffers.length > 0) {
      gl.drawBuffers(drawBuffers);
    }

    // Clear if needed
    this.clearAttachments(gl);
  }

  /**
   * Clears render target attachments based on load actions.
   *
   * @param gl - WebGL2 rendering context
   */
  private clearAttachments(gl: WebGL2RenderingContext): void {
    let clearMask = 0;

    // Check color attachments
    for (let i = 0; i < this._colorDescriptors.length; i++) {
      const desc = this._colorDescriptors[i];
      if (desc.loadAction === LoadAction.Clear) {
        const clearValue = desc.clearValue as Color | undefined;
        if (clearValue) {
          gl.clearColor(clearValue.r, clearValue.g, clearValue.b, clearValue.a);
        } else {
          gl.clearColor(0, 0, 0, 1);
        }
        clearMask |= gl.COLOR_BUFFER_BIT;
        break; // Only need to set clear color once
      }
    }

    // Check depth/stencil attachment
    if (this._depthStencilDescriptor) {
      if (this._depthStencilDescriptor.loadAction === LoadAction.Clear) {
        const clearValue =
          typeof this._depthStencilDescriptor.clearValue === 'number'
            ? this._depthStencilDescriptor.clearValue
            : 1.0;
        gl.clearDepth(clearValue);
        clearMask |= gl.DEPTH_BUFFER_BIT;

        if (
          this._depthStencilDescriptor.format === TextureFormat.Depth24Stencil8 ||
          this._depthStencilDescriptor.format === TextureFormat.Depth32FStencil8
        ) {
          gl.clearStencil(0);
          clearMask |= gl.STENCIL_BUFFER_BIT;
        }
      }
    }

    if (clearMask !== 0) {
      gl.clear(clearMask);
    }
  }

  /**
   * Unbinds the render target (binds the default framebuffer).
   *
   * @param gl - WebGL2 rendering context
   */
  unbind(gl: WebGL2RenderingContext): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Resizes the render target.
   * Destroys existing attachments and recreates them with new dimensions.
   *
   * @param glOrWidth - WebGL2 rendering context OR width (for backwards compatibility)
   * @param widthOrHeight - New width in pixels OR height (if first arg is gl)
   * @param height - New height in pixels (only if first arg is gl)
   */
  resize(glOrWidth: WebGL2RenderingContext | number, widthOrHeight: number, height?: number): void {
    // Support both signatures: resize(gl, width, height) and resize(width, height)
    let gl: WebGL2RenderingContext | undefined;
    let newWidth: number;
    let newHeight: number;

    if (typeof glOrWidth === 'number') {
      // Called as resize(width, height)
      newWidth = glOrWidth;
      newHeight = widthOrHeight;
      gl = undefined;
    } else {
      // Called as resize(gl, width, height)
      gl = glOrWidth;
      newWidth = widthOrHeight;
      newHeight = height!;
    }

    if (newWidth === this._width && newHeight === this._height) {
      return;
    }

    logger.debug(`Resizing render target ${this._label}: ${this._width}x${this._height} -> ${newWidth}x${newHeight}`);

    this._width = newWidth;
    this._height = newHeight;

    if (this._created && gl) {
      // Delete old textures and renderbuffers
      this.deleteResources(gl);

      // Recreate with new size
      this._created = false;
      this.create(gl);
    } else {
      this._needsRecreate = true;
    }
  }

  /**
   * Deletes WebGL resources (textures and renderbuffers).
   *
   * @param gl - WebGL2 rendering context
   */
  private deleteResources(gl: WebGL2RenderingContext): void {
    // Delete color textures
    for (let i = 0; i < this.colorTextures.length; i++) {
      if (this.colorTextures[i]) {
        gl.deleteTexture(this.colorTextures[i]);
        this.colorTextures[i] = null;
        this._colorAttachments[i] = null;
      }
    }

    // Delete depth texture
    if (this.depthTexture) {
      gl.deleteTexture(this.depthTexture);
      this.depthTexture = null;
    }

    // Delete depth renderbuffer
    if (this.depthRenderbuffer) {
      gl.deleteRenderbuffer(this.depthRenderbuffer);
      this.depthRenderbuffer = null;
    }

    this._depthStencilAttachment = null;
  }

  /**
   * Gets a color texture by index.
   *
   * @param index - Attachment index (0-7)
   * @returns WebGL texture or null
   */
  getColorTexture(index: number): WebGLTexture | null {
    if (index < 0 || index >= 8) {
      logger.warn(`Invalid color attachment index: ${index}`);
      return null;
    }
    return this.colorTextures[index];
  }

  /**
   * Gets the depth texture.
   *
   * @returns WebGL texture or null
   */
  getDepthTexture(): WebGLTexture | null {
    return this.depthTexture;
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
   *
   * @param gl - Optional WebGL2 rendering context for GPU resource cleanup
   */
  dispose(gl?: WebGL2RenderingContext): void {
    logger.debug(`Disposing render target ${this._label}`);

    if (!this._created) {
      return;
    }

    // Delete all textures and renderbuffers if GL context provided
    if (gl) {
      this.deleteResources(gl);

      // Delete framebuffer
      if (this.fbo) {
        gl.deleteFramebuffer(this.fbo);
        this.fbo = null;
      }
    }

    // Reset state regardless
    this.fbo = null;
    this.colorTextures = new Array(8).fill(null);
    this.depthTexture = null;
    this.depthRenderbuffer = null;

    this._created = false;
    logger.debug(`Disposed render target ${this._label}`);
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

  /**
   * Creates a depth-only render target.
   *
   * @param width - Width in pixels
   * @param height - Height in pixels
   * @param format - Depth format (default: Depth24Stencil8)
   * @param samples - Sample count (default: 1)
   * @returns Render target
   */
  static createDepthTarget(
    width: number,
    height: number,
    format: TextureFormat = TextureFormat.Depth24Stencil8,
    samples: number = 1
  ): RenderTarget {
    return new RenderTarget({
      width,
      height,
      samples,
      colorAttachments: [], // No color attachments
      depthStencilAttachment: {
        format,
        loadAction: LoadAction.Clear,
        storeAction: StoreAction.Store,
        clearValue: 1.0,
      },
      label: 'DepthTarget',
    });
  }

  /**
   * Creates a GBuffer render target for deferred rendering.
   * Contains multiple render targets for different material properties:
   * - Attachment 0: Albedo (RGBA8) - Base color + AO
   * - Attachment 1: Normal (RGBA16F) - View-space normals + roughness
   * - Attachment 2: Material (RGBA8) - Metallic + roughness + material ID
   * - Attachment 3: Emissive (RGBA16F) - Emissive color + intensity
   * - Depth/Stencil: Depth24Stencil8
   *
   * @param width - Width in pixels
   * @param height - Height in pixels
   * @param samples - Sample count (default: 1)
   * @returns GBuffer render target
   */
  static createGBuffer(width: number, height: number, samples: number = 1): RenderTarget {
    return new RenderTarget({
      width,
      height,
      samples,
      colorAttachments: [
        // Attachment 0: Albedo + AO
        {
          format: TextureFormat.RGBA8,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: new Color(0, 0, 0, 1),
        },
        // Attachment 1: Normal + Roughness
        {
          format: TextureFormat.RGBA16F,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: new Color(0, 0, 1, 0.5), // Default normal (0,0,1) in view space
        },
        // Attachment 2: Material properties (metallic, roughness, etc.)
        {
          format: TextureFormat.RGBA8,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: new Color(0, 0.5, 0, 0),
        },
        // Attachment 3: Emissive
        {
          format: TextureFormat.RGBA16F,
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: new Color(0, 0, 0, 0),
        },
      ],
      depthStencilAttachment: {
        format: TextureFormat.Depth24Stencil8,
        loadAction: LoadAction.Clear,
        storeAction: StoreAction.Store,
        clearValue: 1.0,
      },
      label: 'GBuffer',
    });
  }

  /**
   * Creates an HDR (High Dynamic Range) render target.
   * Uses RGBA16F format for color to support HDR rendering.
   *
   * @param width - Width in pixels
   * @param height - Height in pixels
   * @param samples - Sample count (default: 1)
   * @returns HDR render target
   */
  static createHDRTarget(width: number, height: number, samples: number = 1): RenderTarget {
    return new RenderTarget({
      width,
      height,
      samples,
      colorAttachments: [
        {
          format: TextureFormat.RGBA16F,
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
      label: 'HDRTarget',
    });
  }

  /**
   * Creates a render target for velocity/motion vectors.
   * Uses RG16F format to store 2D motion vectors.
   *
   * @param width - Width in pixels
   * @param height - Height in pixels
   * @returns Motion vector render target
   */
  static createMotionVectorTarget(width: number, height: number): RenderTarget {
    // Note: RG16F format needs to be added to TextureFormat enum
    // For now, using RGBA16F with only RG channels used
    return new RenderTarget({
      width,
      height,
      samples: 1,
      colorAttachments: [
        {
          format: TextureFormat.RGBA16F, // Should be RG16F when available
          loadAction: LoadAction.Clear,
          storeAction: StoreAction.Store,
          clearValue: new Color(0, 0, 0, 0),
        },
      ],
      depthStencilAttachment: {
        format: TextureFormat.Depth24Stencil8,
        loadAction: LoadAction.Clear,
        storeAction: StoreAction.DontCare,
        clearValue: 1.0,
      },
      label: 'MotionVectorTarget',
    });
  }
}
