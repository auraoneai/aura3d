/**
 * @fileoverview Text component with advanced typography and layout features.
 * @module ui/components/Text
 */

import { UIElement } from '../UIElement';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';

/**
 * Text alignment options
 */
export enum TextAlign {
  Left = 'left',
  Center = 'center',
  Right = 'right',
  Justify = 'justify'
}

/**
 * Vertical alignment options
 */
export enum TextVerticalAlign {
  Top = 'top',
  Middle = 'middle',
  Bottom = 'bottom'
}

/**
 * Text overflow behavior
 */
export enum TextOverflow {
  Visible = 'visible',
  Hidden = 'hidden',
  Ellipsis = 'ellipsis',
  Wrap = 'wrap'
}

/**
 * Text decoration options
 */
export enum TextDecoration {
  None = 'none',
  Underline = 'underline',
  LineThrough = 'linethrough',
  Overline = 'overline'
}

/**
 * Enhanced text component with rich formatting, word wrapping, and overflow handling.
 * Supports multiple fonts, text styling, shadows, and outlines.
 *
 * @example
 * ```typescript
 * // Simple text label
 * const label = new Text('Hello World');
 * label.position.set(100, 100);
 * label.fontSize = 24;
 * label.color = Color.white();
 *
 * // Multi-line text with wrapping
 * const paragraph = new Text();
 * paragraph.text = 'This is a long paragraph that will wrap to multiple lines.';
 * paragraph.size.set(300, 200);
 * paragraph.overflow = TextOverflow.Wrap;
 * paragraph.align = TextAlign.Justify;
 *
 * // Styled heading
 * const heading = new Text('Title');
 * heading.fontFamily = 'Arial';
 * heading.fontSize = 32;
 * heading.fontWeight = 'bold';
 * heading.color = Color.fromHex(0x333333);
 * heading.enableShadow = true;
 * heading.shadowOffset.set(2, 2);
 * ```
 */
export class Text extends UIElement {
  /**
   * Text content
   */
  public text: string;

  /**
   * Font family
   */
  public fontFamily: string;

  /**
   * Font size in pixels
   */
  public fontSize: number;

  /**
   * Font weight (normal, bold, bolder, lighter, 100-900)
   */
  public fontWeight: string;

  /**
   * Font style (normal, italic, oblique)
   */
  public fontStyle: string;

  /**
   * Text color
   */
  public color: Color;

  /**
   * Horizontal text alignment
   */
  public align: TextAlign;

  /**
   * Vertical text alignment
   */
  public verticalAlign: TextVerticalAlign;

  /**
   * Overflow behavior
   */
  public overflow: TextOverflow;

  /**
   * Text decoration
   */
  public decoration: TextDecoration;

  /**
   * Line height multiplier (1.0 = normal, 1.5 = 1.5x font size)
   */
  public lineHeight: number;

  /**
   * Letter spacing in pixels
   */
  public letterSpacing: number;

  /**
   * Word spacing in pixels
   */
  public wordSpacing: number;

  /**
   * Enable text shadow
   */
  public enableShadow: boolean;

  /**
   * Shadow offset
   */
  public shadowOffset: Vector2;

  /**
   * Shadow blur radius
   */
  public shadowBlur: number;

  /**
   * Shadow color
   */
  public shadowColor: Color;

  /**
   * Enable text outline/stroke
   */
  public enableOutline: boolean;

  /**
   * Outline width in pixels
   */
  public outlineWidth: number;

  /**
   * Outline color
   */
  public outlineColor: Color;

  /**
   * Maximum number of lines (0 = unlimited)
   */
  public maxLines: number;

  /**
   * Padding inside text area
   */
  public padding: number;

  /**
   * Cached wrapped lines
   */
  protected _wrappedLines: string[] = [];

  /**
   * Whether wrapped lines need recalculation
   */
  protected _linesDirty: boolean = true;

  /**
   * Measured text metrics
   */
  protected _textMetrics: {
    width: number;
    height: number;
  } | null = null;

  /**
   * Creates a new Text element.
   *
   * @param text - Initial text content
   *
   * @example
   * ```typescript
   * const text = new Text('Welcome!');
   * text.fontSize = 20;
   * text.color = Color.blue();
   * ```
   */
  constructor(text: string = '') {
    super('Text');

    this.text = text;
    this.fontFamily = 'Arial';
    this.fontSize = 16;
    this.fontWeight = 'normal';
    this.fontStyle = 'normal';
    this.color = Color.white();
    this.align = TextAlign.Left;
    this.verticalAlign = TextVerticalAlign.Top;
    this.overflow = TextOverflow.Visible;
    this.decoration = TextDecoration.None;
    this.lineHeight = 1.2;
    this.letterSpacing = 0;
    this.wordSpacing = 0;

    this.enableShadow = false;
    this.shadowOffset = new Vector2(2, 2);
    this.shadowBlur = 4;
    this.shadowColor = new Color(0, 0, 0, 0.5);

    this.enableOutline = false;
    this.outlineWidth = 2;
    this.outlineColor = Color.black();

    this.maxLines = 0;
    this.padding = 0;

    this.size.set(200, 50);
    this.interactive = false;
  }

  /**
   * Gets the computed font string for canvas rendering.
   */
  protected getFontString(): string {
    return `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
  }

  /**
   * Measures the text dimensions.
   */
  protected measureText(context: CanvasRenderingContext2D): { width: number; height: number } {
    context.save();
    context.font = this.getFontString();

    if (this.overflow === TextOverflow.Wrap) {
      const lines = this.wrapText(context);
      const maxWidth = Math.max(...lines.map(line => context.measureText(line).width));
      const height = lines.length * this.fontSize * this.lineHeight;
      context.restore();
      return { width: maxWidth, height };
    } else {
      const metrics = context.measureText(this.text);
      context.restore();
      return { width: metrics.width, height: this.fontSize };
    }
  }

  /**
   * Wraps text into multiple lines based on available width.
   */
  protected wrapText(context: CanvasRenderingContext2D): string[] {
    if (!this._linesDirty && this._wrappedLines.length > 0) {
      return this._wrappedLines;
    }

    const availableWidth = this.size.x - this.padding * 2;
    const words = this.text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = context.measureText(testLine);

      if (metrics.width > availableWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;

        if (this.maxLines > 0 && lines.length >= this.maxLines) {
          break;
        }
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    this._wrappedLines = lines;
    this._linesDirty = false;

    return lines;
  }

  /**
   * Gets horizontal alignment offset.
   */
  protected getAlignmentOffsetX(lineWidth: number): number {
    const availableWidth = this.size.x - this.padding * 2;

    switch (this.align) {
      case TextAlign.Center:
        return (availableWidth - lineWidth) * 0.5;
      case TextAlign.Right:
        return availableWidth - lineWidth;
      case TextAlign.Left:
      default:
        return 0;
    }
  }

  /**
   * Gets vertical alignment offset.
   */
  protected getAlignmentOffsetY(totalHeight: number): number {
    const availableHeight = this.size.y - this.padding * 2;

    switch (this.verticalAlign) {
      case TextVerticalAlign.Middle:
        return (availableHeight - totalHeight) * 0.5;
      case TextVerticalAlign.Bottom:
        return availableHeight - totalHeight;
      case TextVerticalAlign.Top:
      default:
        return 0;
    }
  }

  /**
   * Applies text decoration.
   */
  protected applyDecoration(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number
  ): void {
    if (this.decoration === TextDecoration.None) return;

    const metrics = context.measureText(text);
    const width = metrics.width;

    context.strokeStyle = this.color.toCSSString();
    context.lineWidth = Math.max(1, this.fontSize * 0.05);

    switch (this.decoration) {
      case TextDecoration.Underline:
        context.beginPath();
        context.moveTo(x, y + this.fontSize * 0.1);
        context.lineTo(x + width, y + this.fontSize * 0.1);
        context.stroke();
        break;

      case TextDecoration.LineThrough:
        context.beginPath();
        context.moveTo(x, y - this.fontSize * 0.3);
        context.lineTo(x + width, y - this.fontSize * 0.3);
        context.stroke();
        break;

      case TextDecoration.Overline:
        context.beginPath();
        context.moveTo(x, y - this.fontSize * 0.8);
        context.lineTo(x + width, y - this.fontSize * 0.8);
        context.stroke();
        break;
    }
  }

  /**
   * Renders a single line of text.
   */
  protected renderLine(
    context: CanvasRenderingContext2D,
    line: string,
    x: number,
    y: number
  ): void {
    // Apply shadow
    if (this.enableShadow) {
      context.shadowColor = this.shadowColor.toCSSString();
      context.shadowBlur = this.shadowBlur;
      context.shadowOffsetX = this.shadowOffset.x;
      context.shadowOffsetY = this.shadowOffset.y;
    }

    // Draw outline
    if (this.enableOutline) {
      context.strokeStyle = this.outlineColor.toCSSString();
      context.lineWidth = this.outlineWidth;
      context.strokeText(line, x, y);
    }

    // Draw text
    context.fillStyle = this.color.toCSSString();
    context.fillText(line, x, y);

    // Reset shadow
    if (this.enableShadow) {
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;
    }

    // Apply decoration
    this.applyDecoration(context, line, x, y);
  }

  /**
   * Updates the text element.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);
  }

  /**
   * Renders the text.
   */
  override render(context: CanvasRenderingContext2D): void {
    if (!this.text) return;

    const bounds = this.localBounds;

    context.save();

    // Set font
    context.font = this.getFontString();
    context.textBaseline = 'top';

    // Handle wrapping
    const lines = this.overflow === TextOverflow.Wrap ? this.wrapText(context) : [this.text];
    const lineHeightPx = this.fontSize * this.lineHeight;
    const totalHeight = lines.length * lineHeightPx;

    // Calculate vertical offset
    const startY = bounds.y + this.padding + this.getAlignmentOffsetY(totalHeight);

    // Render each line
    let currentY = startY;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Handle ellipsis
      if (this.overflow === TextOverflow.Ellipsis && i === lines.length - 1) {
        const availableWidth = this.size.x - this.padding * 2;
        const metrics = context.measureText(line);

        if (metrics.width > availableWidth) {
          while (line.length > 0 && context.measureText(line + '...').width > availableWidth) {
            line = line.slice(0, -1);
          }
          line += '...';
        }
      }

      // Calculate horizontal offset
      const metrics = context.measureText(line);
      const startX = bounds.x + this.padding + this.getAlignmentOffsetX(metrics.width);

      // Render the line
      this.renderLine(context, line, startX, currentY);

      currentY += lineHeightPx;

      // Stop if max lines reached
      if (this.maxLines > 0 && i >= this.maxLines - 1) {
        break;
      }
    }

    context.restore();
  }

  /**
   * Sets the text content and marks lines as dirty.
   *
   * @param text - New text content
   * @returns This text element for chaining
   */
  setText(text: string): this {
    if (this.text !== text) {
      this.text = text;
      this._linesDirty = true;
    }
    return this;
  }

  /**
   * Sets the font properties.
   *
   * @param family - Font family
   * @param size - Font size in pixels
   * @param weight - Font weight
   * @returns This text element for chaining
   */
  setFont(family: string, size: number, weight: string = 'normal'): this {
    this.fontFamily = family;
    this.fontSize = size;
    this.fontWeight = weight;
    this._linesDirty = true;
    return this;
  }

  /**
   * Creates a heading text element.
   *
   * @param text - Heading text
   * @param level - Heading level (1-6)
   * @returns New text element
   */
  static createHeading(text: string, level: number = 1): Text {
    const sizes = [32, 28, 24, 20, 18, 16];
    const element = new Text(text);
    element.fontSize = sizes[Math.max(0, Math.min(5, level - 1))];
    element.fontWeight = 'bold';
    element.color = Color.fromHex(0x333333);
    return element;
  }

  /**
   * Creates a paragraph text element.
   *
   * @param text - Paragraph text
   * @returns New text element
   */
  static createParagraph(text: string): Text {
    const element = new Text(text);
    element.fontSize = 16;
    element.lineHeight = 1.5;
    element.overflow = TextOverflow.Wrap;
    element.color = Color.fromHex(0x555555);
    return element;
  }

  /**
   * Creates a label text element.
   *
   * @param text - Label text
   * @returns New text element
   */
  static createLabel(text: string): Text {
    const element = new Text(text);
    element.fontSize = 14;
    element.color = Color.fromHex(0x666666);
    return element;
  }
}
