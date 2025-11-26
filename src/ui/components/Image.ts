/**
 * @fileoverview Image component with aspect ratio, fill modes, and sprite support.
 * @module ui/components/Image
 */

import { UIElement } from '../UIElement';
import { Color } from '../../math/Color';
import { Rect } from '../../math/Rect';
import { Vector2 } from '../../math/Vector2';

/**
 * Image fill mode
 */
export enum ImageFillMode {
  /** Stretch to fill the entire area */
  Stretch = 'stretch',
  /** Maintain aspect ratio, fit within bounds */
  Contain = 'contain',
  /** Maintain aspect ratio, cover entire area */
  Cover = 'cover',
  /** Use original image size */
  None = 'none',
  /** Tile the image */
  Tile = 'tile'
}

/**
 * Image component for displaying textures, sprites, and images.
 * Supports various fill modes, tinting, sprite sheets, and 9-slice scaling.
 *
 * @example
 * ```typescript
 * // Display a simple image
 * const image = new Image();
 * image.source = myImageElement;
 * image.position.set(100, 100);
 * image.size.set(200, 200);
 * image.fillMode = ImageFillMode.Contain;
 *
 * // Tinted image with transparency
 * const tintedImage = new Image();
 * tintedImage.source = myImageElement;
 * tintedImage.tint = Color.fromHex(0xFF0000);
 * tintedImage.alpha = 0.5;
 *
 * // Sprite from sprite sheet
 * const sprite = new Image();
 * sprite.source = spriteSheet;
 * sprite.sourceRect = new Rect(0, 0, 32, 32);
 * sprite.fillMode = ImageFillMode.None;
 * ```
 */
export class Image extends UIElement {
  /**
   * Image source (HTMLImageElement, HTMLCanvasElement, or ImageBitmap)
   */
  public source: HTMLImageElement | HTMLCanvasElement | ImageBitmap | null;

  /**
   * Source rectangle for sprite sheets (null = use entire image)
   */
  public sourceRect: Rect | null;

  /**
   * Fill mode for image scaling
   */
  public fillMode: ImageFillMode;

  /**
   * Color tint to apply to the image
   */
  public tint: Color;

  /**
   * Whether to preserve aspect ratio (deprecated, use fillMode instead)
   */
  public preserveAspect: boolean;

  /**
   * Image smoothing enabled
   */
  public smoothing: boolean;

  /**
   * 9-slice border sizes (left, top, right, bottom)
   * Used for UI elements that need to scale without distorting corners
   */
  public sliceBorder: { left: number; top: number; right: number; bottom: number } | null;

  /**
   * Tile offset for tiled images
   */
  public tileOffset: Vector2;

  /**
   * Whether image has loaded successfully
   */
  protected _loaded: boolean;

  /**
   * Calculated display rectangle
   */
  protected _displayRect: Rect;

  /**
   * Creates a new Image element.
   *
   * @param source - Optional image source
   *
   * @example
   * ```typescript
   * const img = new Image(myImageElement);
   * img.position.set(50, 50);
   * img.size.set(100, 100);
   * ```
   */
  constructor(source: HTMLImageElement | HTMLCanvasElement | ImageBitmap | null = null) {
    super('Image');

    this.source = source;
    this.sourceRect = null;
    this.fillMode = ImageFillMode.Stretch;
    this.tint = Color.white();
    this.preserveAspect = true;
    this.smoothing = true;
    this.sliceBorder = null;
    this.tileOffset = new Vector2(0, 0);
    this._loaded = false;
    this._displayRect = new Rect();

    this.size.set(100, 100);
    this.interactive = false;

    if (source) {
      this.loadImage();
    }
  }

  /**
   * Loads and validates the image source.
   */
  protected loadImage(): void {
    if (!this.source) {
      this._loaded = false;
      return;
    }

    if (this.source instanceof HTMLImageElement) {
      if (this.source.complete && this.source.naturalWidth > 0) {
        this._loaded = true;
      } else {
        this._loaded = false;
        this.source.addEventListener('load', () => {
          this._loaded = true;
        });
        this.source.addEventListener('error', () => {
          this._loaded = false;
        });
      }
    } else {
      this._loaded = true;
    }
  }

  /**
   * Gets the source image dimensions.
   */
  protected getSourceDimensions(): { width: number; height: number } {
    if (!this.source) {
      return { width: 0, height: 0 };
    }

    if (this.sourceRect) {
      return { width: this.sourceRect.width, height: this.sourceRect.height };
    }

    if (this.source instanceof HTMLImageElement) {
      return { width: this.source.naturalWidth, height: this.source.naturalHeight };
    } else if (this.source instanceof HTMLCanvasElement || this.source instanceof ImageBitmap) {
      return { width: this.source.width, height: this.source.height };
    }

    return { width: 0, height: 0 };
  }

  /**
   * Calculates the display rectangle based on fill mode.
   */
  protected calculateDisplayRect(): Rect {
    const bounds = this.localBounds;
    const sourceDims = this.getSourceDimensions();

    if (!sourceDims.width || !sourceDims.height) {
      return new Rect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    switch (this.fillMode) {
      case ImageFillMode.Stretch:
        return new Rect(bounds.x, bounds.y, bounds.width, bounds.height);

      case ImageFillMode.Contain: {
        const aspectRatio = sourceDims.width / sourceDims.height;
        const boundsAspect = bounds.width / bounds.height;

        let width, height;
        if (aspectRatio > boundsAspect) {
          width = bounds.width;
          height = bounds.width / aspectRatio;
        } else {
          height = bounds.height;
          width = bounds.height * aspectRatio;
        }

        const x = bounds.x + (bounds.width - width) * 0.5;
        const y = bounds.y + (bounds.height - height) * 0.5;

        return new Rect(x, y, width, height);
      }

      case ImageFillMode.Cover: {
        const aspectRatio = sourceDims.width / sourceDims.height;
        const boundsAspect = bounds.width / bounds.height;

        let width, height;
        if (aspectRatio < boundsAspect) {
          width = bounds.width;
          height = bounds.width / aspectRatio;
        } else {
          height = bounds.height;
          width = bounds.height * aspectRatio;
        }

        const x = bounds.x + (bounds.width - width) * 0.5;
        const y = bounds.y + (bounds.height - height) * 0.5;

        return new Rect(x, y, width, height);
      }

      case ImageFillMode.None: {
        const x = bounds.x + (bounds.width - sourceDims.width) * 0.5;
        const y = bounds.y + (bounds.height - sourceDims.height) * 0.5;

        return new Rect(x, y, sourceDims.width, sourceDims.height);
      }

      case ImageFillMode.Tile:
        return new Rect(bounds.x, bounds.y, bounds.width, bounds.height);

      default:
        return new Rect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
  }

  /**
   * Renders the image with 9-slice scaling.
   */
  protected render9Slice(context: CanvasRenderingContext2D): void {
    if (!this.source || !this.sliceBorder) return;

    const bounds = this.localBounds;
    const { left, top, right, bottom } = this.sliceBorder;
    const sourceDims = this.getSourceDimensions();

    const srcX = this.sourceRect?.x ?? 0;
    const srcY = this.sourceRect?.y ?? 0;

    // Calculate slice dimensions
    const centerWidth = sourceDims.width - left - right;
    const centerHeight = sourceDims.height - top - bottom;
    const destCenterWidth = bounds.width - left - right;
    const destCenterHeight = bounds.height - top - bottom;

    // Draw 9 slices
    // Top-left corner
    context.drawImage(
      this.source,
      srcX, srcY, left, top,
      bounds.x, bounds.y, left, top
    );

    // Top edge
    context.drawImage(
      this.source,
      srcX + left, srcY, centerWidth, top,
      bounds.x + left, bounds.y, destCenterWidth, top
    );

    // Top-right corner
    context.drawImage(
      this.source,
      srcX + left + centerWidth, srcY, right, top,
      bounds.x + left + destCenterWidth, bounds.y, right, top
    );

    // Left edge
    context.drawImage(
      this.source,
      srcX, srcY + top, left, centerHeight,
      bounds.x, bounds.y + top, left, destCenterHeight
    );

    // Center
    context.drawImage(
      this.source,
      srcX + left, srcY + top, centerWidth, centerHeight,
      bounds.x + left, bounds.y + top, destCenterWidth, destCenterHeight
    );

    // Right edge
    context.drawImage(
      this.source,
      srcX + left + centerWidth, srcY + top, right, centerHeight,
      bounds.x + left + destCenterWidth, bounds.y + top, right, destCenterHeight
    );

    // Bottom-left corner
    context.drawImage(
      this.source,
      srcX, srcY + top + centerHeight, left, bottom,
      bounds.x, bounds.y + top + destCenterHeight, left, bottom
    );

    // Bottom edge
    context.drawImage(
      this.source,
      srcX + left, srcY + top + centerHeight, centerWidth, bottom,
      bounds.x + left, bounds.y + top + destCenterHeight, destCenterWidth, bottom
    );

    // Bottom-right corner
    context.drawImage(
      this.source,
      srcX + left + centerWidth, srcY + top + centerHeight, right, bottom,
      bounds.x + left + destCenterWidth, bounds.y + top + destCenterHeight, right, bottom
    );
  }

  /**
   * Renders tiled image.
   */
  protected renderTiled(context: CanvasRenderingContext2D): void {
    if (!this.source) return;

    const bounds = this.localBounds;
    const sourceDims = this.getSourceDimensions();

    context.save();
    context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    context.clip();

    const offsetX = this.tileOffset.x % sourceDims.width;
    const offsetY = this.tileOffset.y % sourceDims.height;

    for (let y = bounds.y - offsetY; y < bounds.y + bounds.height; y += sourceDims.height) {
      for (let x = bounds.x - offsetX; x < bounds.x + bounds.width; x += sourceDims.width) {
        if (this.sourceRect) {
          context.drawImage(
            this.source,
            this.sourceRect.x, this.sourceRect.y, this.sourceRect.width, this.sourceRect.height,
            x, y, sourceDims.width, sourceDims.height
          );
        } else {
          context.drawImage(this.source, x, y);
        }
      }
    }

    context.restore();
  }

  /**
   * Renders the image.
   */
  override render(context: CanvasRenderingContext2D): void {
    if (!this.source || !this._loaded) return;

    context.save();

    // Apply smoothing
    context.imageSmoothingEnabled = this.smoothing;

    // Apply tint
    if (!this.tint.equals(Color.white())) {
      context.globalAlpha = context.globalAlpha * this.tint.a;
      context.globalCompositeOperation = 'multiply';
      context.fillStyle = this.tint.toCSSString();
    }

    // Render based on mode
    if (this.sliceBorder) {
      this.render9Slice(context);
    } else if (this.fillMode === ImageFillMode.Tile) {
      this.renderTiled(context);
    } else {
      const displayRect = this.calculateDisplayRect();

      if (this.sourceRect) {
        context.drawImage(
          this.source,
          this.sourceRect.x, this.sourceRect.y, this.sourceRect.width, this.sourceRect.height,
          displayRect.x, displayRect.y, displayRect.width, displayRect.height
        );
      } else {
        context.drawImage(
          this.source,
          displayRect.x, displayRect.y, displayRect.width, displayRect.height
        );
      }
    }

    context.restore();
  }

  /**
   * Sets the image source.
   *
   * @param source - Image source
   * @returns This image element for chaining
   */
  setSource(source: HTMLImageElement | HTMLCanvasElement | ImageBitmap): this {
    this.source = source;
    this.loadImage();
    return this;
  }

  /**
   * Sets the source rectangle for sprite sheets.
   *
   * @param rect - Source rectangle
   * @returns This image element for chaining
   */
  setSourceRect(rect: Rect | null): this {
    this.sourceRect = rect;
    return this;
  }

  /**
   * Sets the 9-slice border.
   *
   * @param left - Left border size
   * @param top - Top border size
   * @param right - Right border size
   * @param bottom - Bottom border size
   * @returns This image element for chaining
   */
  setSliceBorder(left: number, top: number, right: number, bottom: number): this {
    this.sliceBorder = { left, top, right, bottom };
    return this;
  }

  /**
   * Creates an image that maintains aspect ratio.
   *
   * @param source - Image source
   * @returns New image element
   */
  static createAspectFit(source: HTMLImageElement | HTMLCanvasElement): Image {
    const image = new Image(source);
    image.fillMode = ImageFillMode.Contain;
    return image;
  }

  /**
   * Creates a tiled image.
   *
   * @param source - Image source
   * @returns New image element
   */
  static createTiled(source: HTMLImageElement | HTMLCanvasElement): Image {
    const image = new Image(source);
    image.fillMode = ImageFillMode.Tile;
    return image;
  }
}
