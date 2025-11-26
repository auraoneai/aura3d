/**
 * @fileoverview Image/sprite rendering UI element with various rendering modes.
 * @module ui/UIImage
 */

import { UIElement } from './UIElement';
import { Color } from '../math/Color';
import { Rect } from '../math/Rect';

/**
 * Image rendering type
 */
export enum UIImageType {
  /** Simple stretched image */
  Simple = 0,
  /** Nine-slice (9-patch) scaling */
  Sliced = 1,
  /** Tiled repeat */
  Tiled = 2,
  /** Filled (for progress bars, radial fills) */
  Filled = 3
}

/**
 * Fill method for filled images
 */
export enum UIFillMethod {
  /** Fill horizontally from left to right */
  Horizontal = 0,
  /** Fill vertically from bottom to top */
  Vertical = 1,
  /** Fill radially (circular) */
  Radial90 = 2,
  /** Fill radially (full circle) */
  Radial180 = 3,
  /** Fill radially (full circle) */
  Radial360 = 4
}

/**
 * Fill origin for different fill methods
 */
export enum UIFillOrigin {
  // Horizontal
  Left = 0,
  Right = 1,
  // Vertical
  Bottom = 0,
  Top = 1,
  // Radial
  Bottom_Radial = 0,
  Right_Radial = 1,
  Top_Radial = 2,
  Left_Radial = 3
}

/**
 * Image/sprite rendering element with multiple rendering modes.
 *
 * @example
 * ```typescript
 * // Simple image
 * const image = new UIImage();
 * await image.setImage('path/to/image.png');
 * image.position.set(100, 100);
 * image.size.set(200, 150);
 *
 * // Sprite atlas
 * image.setSourceRect(new Rect(0, 0, 64, 64));
 *
 * // Progress bar
 * const progressBar = new UIImage();
 * progressBar.type = UIImageType.Filled;
 * progressBar.fillMethod = UIFillMethod.Horizontal;
 * progressBar.fillAmount = 0.75; // 75%
 * ```
 */
export class UIImage extends UIElement {
  /**
   * Image source (HTMLImageElement or canvas)
   */
  protected _imageSource: HTMLImageElement | HTMLCanvasElement | null = null;

  /**
   * Image rendering type
   */
  public type: UIImageType;

  /**
   * Source rectangle (for sprite atlases)
   */
  public sourceRect: Rect | null;

  /**
   * Color tint
   */
  public tint: Color;

  /**
   * Whether to preserve aspect ratio
   */
  public preserveAspect: boolean;

  /**
   * Fill amount (0-1) for filled type
   */
  public fillAmount: number;

  /**
   * Fill method for filled type
   */
  public fillMethod: UIFillMethod;

  /**
   * Fill origin for filled type
   */
  public fillOrigin: UIFillOrigin;

  /**
   * Clockwise fill direction
   */
  public fillClockwise: boolean;

  /**
   * Nine-slice borders (left, top, right, bottom)
   */
  public sliceBorders: { left: number; top: number; right: number; bottom: number };

  /**
   * Tile offset for tiled images
   */
  public tileOffset: { x: number; y: number };

  /**
   * Image load promise
   */
  protected _loadPromise: Promise<void> | null = null;

  /**
   * Image loaded flag
   */
  protected _imageLoaded: boolean = false;

  /**
   * Creates a new image element.
   *
   * @example
   * ```typescript
   * const sprite = new UIImage();
   * await sprite.setImage('sprites/player.png');
   * ```
   */
  constructor() {
    super('UIImage');

    this.type = UIImageType.Simple;
    this.sourceRect = null;
    this.tint = Color.white();
    this.preserveAspect = false;
    this.fillAmount = 1;
    this.fillMethod = UIFillMethod.Horizontal;
    this.fillOrigin = UIFillOrigin.Left;
    this.fillClockwise = true;
    this.sliceBorders = { left: 0, top: 0, right: 0, bottom: 0 };
    this.tileOffset = { x: 0, y: 0 };

    this.interactive = false;
  }

  /**
   * Gets the image source.
   */
  get imageSource(): HTMLImageElement | HTMLCanvasElement | null {
    return this._imageSource;
  }

  /**
   * Gets whether the image is loaded.
   */
  get imageLoaded(): boolean {
    return this._imageLoaded;
  }

  /**
   * Sets the image from a URL.
   *
   * @param url - Image URL
   * @returns Promise that resolves when image is loaded
   *
   * @example
   * ```typescript
   * await image.setImage('assets/logo.png');
   * ```
   */
  async setImage(url: string): Promise<void> {
    const img = new Image();

    this._loadPromise = new Promise((resolve, reject) => {
      img.onload = () => {
        this._imageSource = img;
        this._imageLoaded = true;

        // Auto-size to image dimensions if size is not set
        if (this.size.x === 0 || this.size.y === 0) {
          this.size.set(img.width, img.height);
        }

        resolve();
      };
      img.onerror = () => {
        reject(new Error(`Failed to load image: ${url}`));
      };
    });

    img.src = url;
    return this._loadPromise;
  }

  /**
   * Sets the image from an HTMLImageElement or canvas.
   *
   * @param source - Image source
   */
  setImageSource(source: HTMLImageElement | HTMLCanvasElement): void {
    this._imageSource = source;
    this._imageLoaded = true;

    if (this.size.x === 0 || this.size.y === 0) {
      this.size.set(source.width, source.height);
    }
  }

  /**
   * Sets the source rectangle for sprite atlas rendering.
   *
   * @param rect - Source rectangle
   *
   * @example
   * ```typescript
   * // Extract 64x64 sprite at (128, 64) in atlas
   * image.setSourceRect(new Rect(128, 64, 64, 64));
   * ```
   */
  setSourceRect(rect: Rect): void {
    this.sourceRect = rect.clone();
  }

  /**
   * Sets nine-slice borders.
   *
   * @param left - Left border
   * @param top - Top border
   * @param right - Right border
   * @param bottom - Bottom border
   */
  setSliceBorders(left: number, top: number, right: number, bottom: number): void {
    this.sliceBorders = { left, top, right, bottom };
  }

  /**
   * Renders the image.
   */
  override render(context: CanvasRenderingContext2D): void {
    if (!this._imageSource || !this._imageLoaded) {
      return;
    }

    context.save();

    const bounds = this.localBounds;

    // Apply tint
    if (!this.tint.equals(Color.white())) {
      context.globalCompositeOperation = 'multiply';
      context.fillStyle = this.tint.toCSSString();
      context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      context.globalCompositeOperation = 'destination-in';
    }

    // Render based on type
    switch (this.type) {
      case UIImageType.Simple:
        this.renderSimple(context, bounds);
        break;
      case UIImageType.Sliced:
        this.renderSliced(context, bounds);
        break;
      case UIImageType.Tiled:
        this.renderTiled(context, bounds);
        break;
      case UIImageType.Filled:
        this.renderFilled(context, bounds);
        break;
    }

    context.restore();
  }

  /**
   * Renders simple stretched image.
   */
  protected renderSimple(context: CanvasRenderingContext2D, bounds: Rect): void {
    const src = this.getSourceRect();

    if (this.preserveAspect) {
      const srcAspect = src.width / src.height;
      const dstAspect = bounds.width / bounds.height;

      let renderWidth = bounds.width;
      let renderHeight = bounds.height;
      let offsetX = 0;
      let offsetY = 0;

      if (srcAspect > dstAspect) {
        renderHeight = bounds.width / srcAspect;
        offsetY = (bounds.height - renderHeight) * 0.5;
      } else {
        renderWidth = bounds.height * srcAspect;
        offsetX = (bounds.width - renderWidth) * 0.5;
      }

      context.drawImage(
        this._imageSource!,
        src.x, src.y, src.width, src.height,
        bounds.x + offsetX, bounds.y + offsetY, renderWidth, renderHeight
      );
    } else {
      context.drawImage(
        this._imageSource!,
        src.x, src.y, src.width, src.height,
        bounds.x, bounds.y, bounds.width, bounds.height
      );
    }
  }

  /**
   * Renders nine-slice scaled image.
   */
  protected renderSliced(context: CanvasRenderingContext2D, bounds: Rect): void {
    const src = this.getSourceRect();
    const b = this.sliceBorders;

    const srcCenterWidth = src.width - b.left - b.right;
    const srcCenterHeight = src.height - b.top - b.bottom;
    const dstCenterWidth = bounds.width - b.left - b.right;
    const dstCenterHeight = bounds.height - b.top - b.bottom;

    // Top-left corner
    context.drawImage(
      this._imageSource!,
      src.x, src.y, b.left, b.top,
      bounds.x, bounds.y, b.left, b.top
    );

    // Top edge
    context.drawImage(
      this._imageSource!,
      src.x + b.left, src.y, srcCenterWidth, b.top,
      bounds.x + b.left, bounds.y, dstCenterWidth, b.top
    );

    // Top-right corner
    context.drawImage(
      this._imageSource!,
      src.x + src.width - b.right, src.y, b.right, b.top,
      bounds.x + bounds.width - b.right, bounds.y, b.right, b.top
    );

    // Left edge
    context.drawImage(
      this._imageSource!,
      src.x, src.y + b.top, b.left, srcCenterHeight,
      bounds.x, bounds.y + b.top, b.left, dstCenterHeight
    );

    // Center
    context.drawImage(
      this._imageSource!,
      src.x + b.left, src.y + b.top, srcCenterWidth, srcCenterHeight,
      bounds.x + b.left, bounds.y + b.top, dstCenterWidth, dstCenterHeight
    );

    // Right edge
    context.drawImage(
      this._imageSource!,
      src.x + src.width - b.right, src.y + b.top, b.right, srcCenterHeight,
      bounds.x + bounds.width - b.right, bounds.y + b.top, b.right, dstCenterHeight
    );

    // Bottom-left corner
    context.drawImage(
      this._imageSource!,
      src.x, src.y + src.height - b.bottom, b.left, b.bottom,
      bounds.x, bounds.y + bounds.height - b.bottom, b.left, b.bottom
    );

    // Bottom edge
    context.drawImage(
      this._imageSource!,
      src.x + b.left, src.y + src.height - b.bottom, srcCenterWidth, b.bottom,
      bounds.x + b.left, bounds.y + bounds.height - b.bottom, dstCenterWidth, b.bottom
    );

    // Bottom-right corner
    context.drawImage(
      this._imageSource!,
      src.x + src.width - b.right, src.y + src.height - b.bottom, b.right, b.bottom,
      bounds.x + bounds.width - b.right, bounds.y + bounds.height - b.bottom, b.right, b.bottom
    );
  }

  /**
   * Renders tiled image.
   */
  protected renderTiled(context: CanvasRenderingContext2D, bounds: Rect): void {
    const src = this.getSourceRect();
    const pattern = context.createPattern(this._imageSource!, 'repeat');

    if (pattern) {
      context.save();
      context.translate(bounds.x + this.tileOffset.x, bounds.y + this.tileOffset.y);
      context.fillStyle = pattern;
      context.fillRect(-this.tileOffset.x, -this.tileOffset.y, bounds.width, bounds.height);
      context.restore();
    }
  }

  /**
   * Renders filled image (for progress bars, etc).
   */
  protected renderFilled(context: CanvasRenderingContext2D, bounds: Rect): void {
    const src = this.getSourceRect();
    const amount = Math.max(0, Math.min(1, this.fillAmount));

    context.save();

    // Create clipping path based on fill method
    context.beginPath();

    switch (this.fillMethod) {
      case UIFillMethod.Horizontal:
        if (this.fillOrigin === UIFillOrigin.Left) {
          context.rect(bounds.x, bounds.y, bounds.width * amount, bounds.height);
        } else {
          const startX = bounds.x + bounds.width * (1 - amount);
          context.rect(startX, bounds.y, bounds.width * amount, bounds.height);
        }
        break;

      case UIFillMethod.Vertical:
        if (this.fillOrigin === UIFillOrigin.Bottom) {
          const startY = bounds.y + bounds.height * (1 - amount);
          context.rect(bounds.x, startY, bounds.width, bounds.height * amount);
        } else {
          context.rect(bounds.x, bounds.y, bounds.width, bounds.height * amount);
        }
        break;

      case UIFillMethod.Radial90:
      case UIFillMethod.Radial180:
      case UIFillMethod.Radial360:
        this.renderRadialFill(context, bounds, amount);
        break;
    }

    context.clip();

    // Draw the image
    context.drawImage(
      this._imageSource!,
      src.x, src.y, src.width, src.height,
      bounds.x, bounds.y, bounds.width, bounds.height
    );

    context.restore();
  }

  /**
   * Renders radial fill clipping.
   */
  protected renderRadialFill(context: CanvasRenderingContext2D, bounds: Rect, amount: number): void {
    const centerX = bounds.x + bounds.width * 0.5;
    const centerY = bounds.y + bounds.height * 0.5;
    const radius = Math.max(bounds.width, bounds.height) * 0.5;

    let startAngle = 0;
    let endAngle = 0;

    switch (this.fillMethod) {
      case UIFillMethod.Radial90:
        endAngle = amount * Math.PI * 0.5;
        break;
      case UIFillMethod.Radial180:
        endAngle = amount * Math.PI;
        break;
      case UIFillMethod.Radial360:
        endAngle = amount * Math.PI * 2;
        break;
    }

    // Adjust for origin
    const originOffset = (this.fillOrigin as number) * Math.PI * 0.5;
    startAngle += originOffset;
    endAngle += originOffset;

    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, radius, startAngle - Math.PI * 0.5, endAngle - Math.PI * 0.5, !this.fillClockwise);
    context.closePath();
  }

  /**
   * Gets the source rectangle (or full image if not set).
   */
  protected getSourceRect(): Rect {
    if (this.sourceRect) {
      return this.sourceRect;
    }

    if (this._imageSource) {
      return new Rect(0, 0, this._imageSource.width, this._imageSource.height);
    }

    return new Rect(0, 0, 0, 0);
  }
}
