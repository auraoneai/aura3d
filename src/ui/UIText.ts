/**
 * @fileoverview Text rendering UI element with formatting and alignment.
 * @module ui/UIText
 */

import { UIElement } from './UIElement';
import { Color } from '../math/Color';
import { Vector2 } from '../math/Vector2';

/**
 * Text alignment options
 */
export enum UITextAlign {
  Left = 'left',
  Center = 'center',
  Right = 'right'
}

/**
 * Vertical text alignment
 */
export enum UITextVerticalAlign {
  Top = 'top',
  Middle = 'middle',
  Bottom = 'bottom'
}

/**
 * Text overflow handling
 */
export enum UITextOverflow {
  /** Show all text */
  Visible = 'visible',
  /** Clip text at bounds */
  Clip = 'clip',
  /** Add ellipsis (...) when clipped */
  Ellipsis = 'ellipsis',
  /** Wrap text to multiple lines */
  Wrap = 'wrap'
}

/**
 * Text rendering element with comprehensive formatting options.
 *
 * @example
 * ```typescript
 * const text = new UIText('Hello World');
 * text.fontSize = 24;
 * text.color = Color.white();
 * text.align = UITextAlign.Center;
 * text.font = 'Arial';
 * text.position.set(100, 100);
 * text.size.set(200, 50);
 * ```
 */
export class UIText extends UIElement {
  /**
   * Text content
   */
  protected _text: string;

  /**
   * Font family
   */
  public font: string;

  /**
   * Font size in pixels
   */
  public fontSize: number;

  /**
   * Font weight
   */
  public fontWeight: string;

  /**
   * Font style
   */
  public fontStyle: string;

  /**
   * Text color
   */
  public color: Color;

  /**
   * Horizontal text alignment
   */
  public align: UITextAlign;

  /**
   * Vertical text alignment
   */
  public verticalAlign: UITextVerticalAlign;

  /**
   * Line height multiplier
   */
  public lineHeight: number;

  /**
   * Letter spacing in pixels
   */
  public letterSpacing: number;

  /**
   * Text overflow handling
   */
  public overflow: UITextOverflow;

  /**
   * Maximum number of lines (0 = unlimited)
   */
  public maxLines: number;

  /**
   * Outline/stroke color
   */
  public outlineColor: Color | null;

  /**
   * Outline/stroke width
   */
  public outlineWidth: number;

  /**
   * Shadow color
   */
  public shadowColor: Color | null;

  /**
   * Shadow offset
   */
  public shadowOffset: Vector2;

  /**
   * Shadow blur radius
   */
  public shadowBlur: number;

  /**
   * Rich text support (basic HTML tags)
   */
  public richText: boolean;

  /**
   * Whether text size should auto-fit to bounds
   */
  public autoSize: boolean;

  /**
   * Cached wrapped lines
   */
  protected _wrappedLines: string[] = [];

  /**
   * Cache dirty flag
   */
  protected _textCacheDirty: boolean = true;

  /**
   * Measured text size
   */
  protected _measuredSize: Vector2 = new Vector2();

  /**
   * Creates a new text element.
   *
   * @param text - Initial text content
   *
   * @example
   * ```typescript
   * const label = new UIText('Score: 0');
   * label.fontSize = 18;
   * label.color = Color.yellow();
   * ```
   */
  constructor(text: string = '') {
    super('UIText');

    this._text = text;
    this.font = 'Arial, sans-serif';
    this.fontSize = 16;
    this.fontWeight = 'normal';
    this.fontStyle = 'normal';
    this.color = Color.white();
    this.align = UITextAlign.Left;
    this.verticalAlign = UITextVerticalAlign.Top;
    this.lineHeight = 1.2;
    this.letterSpacing = 0;
    this.overflow = UITextOverflow.Clip;
    this.maxLines = 0;
    this.outlineColor = null;
    this.outlineWidth = 0;
    this.shadowColor = null;
    this.shadowOffset = new Vector2(0, 0);
    this.shadowBlur = 0;
    this.richText = false;
    this.autoSize = false;

    this.interactive = false;
  }

  /**
   * Gets the text content.
   */
  get text(): string {
    return this._text;
  }

  /**
   * Sets the text content.
   */
  set text(value: string) {
    if (this._text !== value) {
      this._text = value;
      this._textCacheDirty = true;
      this.markTransformDirty();
    }
  }

  /**
   * Gets the measured size of the text.
   */
  get measuredSize(): Readonly<Vector2> {
    if (this._textCacheDirty) {
      this.updateTextCache();
    }
    return this._measuredSize;
  }

  /**
   * Updates the text cache (wrapping, measurements).
   */
  protected updateTextCache(): void {
    if (!this._textCacheDirty) {
      return;
    }

    this._wrappedLines = [];

    if (!this._text) {
      this._measuredSize.set(0, 0);
      this._textCacheDirty = false;
      return;
    }

    // Create temporary context for measurements
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d')!;
    ctx.font = this.getFont();

    if (this.overflow === UITextOverflow.Wrap) {
      this._wrappedLines = this.wrapText(ctx, this._text, this.size.x);
    } else {
      this._wrappedLines = this._text.split('\n');
    }

    // Measure text size
    let maxWidth = 0;
    for (const line of this._wrappedLines) {
      const metrics = ctx.measureText(line);
      maxWidth = Math.max(maxWidth, metrics.width);
    }

    const lineHeightPx = this.fontSize * this.lineHeight;
    const totalHeight = this._wrappedLines.length * lineHeightPx;

    this._measuredSize.set(maxWidth, totalHeight);

    // Auto-size if enabled
    if (this.autoSize) {
      this.size.copy(this._measuredSize);
    }

    this._textCacheDirty = false;
  }

  /**
   * Wraps text to fit within a given width.
   */
  protected wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    const paragraphs = text.split('\n');

    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) {
        lines.push('');
        continue;
      }

      const words = paragraph.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }
    }

    // Apply max lines limit
    if (this.maxLines > 0 && lines.length > this.maxLines) {
      lines.length = this.maxLines;

      // Add ellipsis to last line if needed
      if (this.overflow === UITextOverflow.Ellipsis) {
        const lastLine = lines[lines.length - 1];
        lines[lines.length - 1] = this.addEllipsis(ctx, lastLine, maxWidth);
      }
    }

    return lines;
  }

  /**
   * Adds ellipsis to text if it exceeds width.
   */
  protected addEllipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    const ellipsis = '...';
    let truncated = text;

    while (truncated.length > 0) {
      const testText = truncated + ellipsis;
      const metrics = ctx.measureText(testText);

      if (metrics.width <= maxWidth) {
        return testText;
      }

      truncated = truncated.slice(0, -1);
    }

    return ellipsis;
  }

  /**
   * Gets the font string for canvas context.
   */
  protected getFont(): string {
    return `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px ${this.font}`;
  }

  /**
   * Renders the text.
   */
  override render(context: CanvasRenderingContext2D): void {
    if (!this._text) {
      return;
    }

    if (this._textCacheDirty) {
      this.updateTextCache();
    }

    context.save();

    // Setup font
    context.font = this.getFont();
    context.textBaseline = 'top';

    // Setup letter spacing
    if (this.letterSpacing !== 0) {
      context.letterSpacing = `${this.letterSpacing}px`;
    }

    const bounds = this.localBounds;
    const lineHeightPx = this.fontSize * this.lineHeight;

    // Calculate vertical offset
    let offsetY = 0;
    const totalHeight = this._wrappedLines.length * lineHeightPx;

    switch (this.verticalAlign) {
      case UITextVerticalAlign.Top:
        offsetY = bounds.y;
        break;
      case UITextVerticalAlign.Middle:
        offsetY = bounds.y + (bounds.height - totalHeight) * 0.5;
        break;
      case UITextVerticalAlign.Bottom:
        offsetY = bounds.y + bounds.height - totalHeight;
        break;
    }

    // Render each line
    for (let i = 0; i < this._wrappedLines.length; i++) {
      const line = this._wrappedLines[i];
      const y = offsetY + i * lineHeightPx;

      // Calculate horizontal offset
      let x = bounds.x;
      const metrics = context.measureText(line);

      switch (this.align) {
        case UITextAlign.Left:
          x = bounds.x;
          break;
        case UITextAlign.Center:
          x = bounds.x + (bounds.width - metrics.width) * 0.5;
          break;
        case UITextAlign.Right:
          x = bounds.x + bounds.width - metrics.width;
          break;
      }

      // Render shadow
      if (this.shadowColor && this.shadowBlur > 0) {
        context.shadowColor = this.shadowColor.toCSSString();
        context.shadowBlur = this.shadowBlur;
        context.shadowOffsetX = this.shadowOffset.x;
        context.shadowOffsetY = this.shadowOffset.y;
      }

      // Render outline/stroke
      if (this.outlineColor && this.outlineWidth > 0) {
        context.strokeStyle = this.outlineColor.toCSSString();
        context.lineWidth = this.outlineWidth;
        context.strokeText(line, x, y);
      }

      // Render fill
      context.fillStyle = this.color.toCSSString();
      context.fillText(line, x, y);

      // Reset shadow
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
    }

    context.restore();
  }

  /**
   * Sets text and formatting in one call.
   *
   * @param text - Text content
   * @param fontSize - Font size
   * @param color - Text color
   *
   * @example
   * ```typescript
   * text.setText('Game Over', 32, Color.red());
   * ```
   */
  setText(text: string, fontSize?: number, color?: Color): this {
    this.text = text;
    if (fontSize !== undefined) {
      this.fontSize = fontSize;
    }
    if (color !== undefined) {
      this.color = color;
    }
    return this;
  }

  /**
   * Sets the outline style.
   *
   * @param color - Outline color
   * @param width - Outline width
   */
  setOutline(color: Color, width: number): this {
    this.outlineColor = color;
    this.outlineWidth = width;
    return this;
  }

  /**
   * Sets the shadow style.
   *
   * @param color - Shadow color
   * @param offsetX - Shadow X offset
   * @param offsetY - Shadow Y offset
   * @param blur - Shadow blur radius
   */
  setShadow(color: Color, offsetX: number, offsetY: number, blur: number = 0): this {
    this.shadowColor = color;
    this.shadowOffset.set(offsetX, offsetY);
    this.shadowBlur = blur;
    return this;
  }
}
