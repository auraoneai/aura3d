/**
 * @fileoverview Container panel component with background, borders, and padding.
 * @module ui/components/Panel
 */

import { UIElement } from '../UIElement';
import { Color } from '../../math/Color';
import { Rect } from '../../math/Rect';
import { Vector2 } from '../../math/Vector2';

/**
 * Border style options
 */
export enum BorderStyle {
  None = 'none',
  Solid = 'solid',
  Dashed = 'dashed',
  Dotted = 'dotted'
}

/**
 * Container panel component for organizing and grouping UI elements.
 * Provides background color, borders, padding, rounded corners, and shadows.
 *
 * @example
 * ```typescript
 * // Create a basic panel
 * const panel = new Panel();
 * panel.position.set(100, 100);
 * panel.size.set(300, 200);
 * panel.backgroundColor = Color.fromHex(0xFFFFFF);
 * panel.setPadding(20, 20, 20, 20);
 *
 * // Add children
 * const title = new Text('Panel Title');
 * panel.addChild(title);
 *
 * // Styled panel with shadow
 * const card = new Panel();
 * card.backgroundColor = Color.white();
 * card.cornerRadius = 8;
 * card.enableShadow = true;
 * card.shadowOffset.set(0, 2);
 * card.shadowBlur = 10;
 * ```
 */
export class Panel extends UIElement {
  /**
   * Panel background color
   */
  public override backgroundColor: Color | null;

  /**
   * Border width
   */
  public borderWidth: number;

  /**
   * Border color
   */
  public borderColor: Color;

  /**
   * Border style
   */
  public borderStyle: BorderStyle;

  /**
   * Corner radius for rounded corners
   */
  public cornerRadius: number;

  /**
   * Padding (left, top, right, bottom)
   */
  public padding: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };

  /**
   * Enable drop shadow
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
   * Background image source
   */
  public backgroundImage: HTMLImageElement | HTMLCanvasElement | null;

  /**
   * Background image opacity
   */
  public backgroundImageOpacity: number;

  /**
   * Enable gradient background
   */
  public enableGradient: boolean;

  /**
   * Gradient start color
   */
  public gradientStartColor: Color;

  /**
   * Gradient end color
   */
  public gradientEndColor: Color;

  /**
   * Gradient angle in radians (0 = horizontal, Math.PI/2 = vertical)
   */
  public gradientAngle: number;

  /**
   * Creates a new Panel.
   *
   * @example
   * ```typescript
   * const panel = new Panel();
   * panel.size.set(400, 300);
   * panel.backgroundColor = Color.fromHex(0xF5F5F5);
   * ```
   */
  constructor() {
    super('Panel');

    this.backgroundColor = new Color(0.2, 0.2, 0.2, 1);
    this.borderWidth = 0;
    this.borderColor = Color.black();
    this.borderStyle = BorderStyle.Solid;
    this.cornerRadius = 0;

    this.padding = {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0
    };

    this.enableShadow = false;
    this.shadowOffset = new Vector2(0, 4);
    this.shadowBlur = 8;
    this.shadowColor = new Color(0, 0, 0, 0.25);

    this.backgroundImage = null;
    this.backgroundImageOpacity = 1;

    this.enableGradient = false;
    this.gradientStartColor = Color.white();
    this.gradientEndColor = Color.black();
    this.gradientAngle = Math.PI / 2;

    this.size.set(200, 150);
    this.interactive = true;
    this.blockPointer = true;
    this.clipChildren = true;
  }

  /**
   * Gets the content rectangle (area inside padding).
   */
  get contentRect(): Rect {
    const bounds = this.localBounds;
    return new Rect(
      bounds.x + this.padding.left,
      bounds.y + this.padding.top,
      bounds.width - this.padding.left - this.padding.right,
      bounds.height - this.padding.top - this.padding.bottom
    );
  }

  /**
   * Draws a rounded rectangle path.
   */
  protected drawRoundedRectPath(
    context: CanvasRenderingContext2D,
    rect: Rect,
    radius: number
  ): void {
    const x = rect.x;
    const y = rect.y;
    const width = rect.width;
    const height = rect.height;

    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
  }

  /**
   * Draws a dashed or dotted border.
   */
  protected drawStyledBorder(context: CanvasRenderingContext2D, rect: Rect): void {
    const pattern = this.borderStyle === BorderStyle.Dashed ? [8, 4] : [2, 2];
    context.setLineDash(pattern);
    context.strokeStyle = this.borderColor.toCSSString();
    context.lineWidth = this.borderWidth;

    if (this.cornerRadius > 0) {
      this.drawRoundedRectPath(context, rect, this.cornerRadius);
      context.stroke();
    } else {
      context.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }

    context.setLineDash([]);
  }

  /**
   * Renders the panel background.
   */
  protected renderBackground(context: CanvasRenderingContext2D, bounds: Rect): void {
    // Apply shadow
    if (this.enableShadow) {
      context.shadowColor = this.shadowColor.toCSSString();
      context.shadowBlur = this.shadowBlur;
      context.shadowOffsetX = this.shadowOffset.x;
      context.shadowOffsetY = this.shadowOffset.y;
    }

    // Draw background
    if (this.enableGradient) {
      const angle = this.gradientAngle;
      const x1 = bounds.x + bounds.width * 0.5 - Math.cos(angle) * bounds.width * 0.5;
      const y1 = bounds.y + bounds.height * 0.5 - Math.sin(angle) * bounds.height * 0.5;
      const x2 = bounds.x + bounds.width * 0.5 + Math.cos(angle) * bounds.width * 0.5;
      const y2 = bounds.y + bounds.height * 0.5 + Math.sin(angle) * bounds.height * 0.5;

      const gradient = context.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(0, this.gradientStartColor.toCSSString());
      gradient.addColorStop(1, this.gradientEndColor.toCSSString());

      context.fillStyle = gradient;
    } else if (this.backgroundColor) {
      context.fillStyle = this.backgroundColor.toCSSString();
    }

    if (this.cornerRadius > 0) {
      this.drawRoundedRectPath(context, bounds, this.cornerRadius);
      context.fill();
    } else {
      context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    // Reset shadow
    if (this.enableShadow) {
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;
    }

    // Draw background image
    if (this.backgroundImage) {
      const oldAlpha = context.globalAlpha;
      context.globalAlpha *= this.backgroundImageOpacity;

      if (this.cornerRadius > 0) {
        context.save();
        this.drawRoundedRectPath(context, bounds, this.cornerRadius);
        context.clip();
      }

      context.drawImage(
        this.backgroundImage,
        bounds.x, bounds.y, bounds.width, bounds.height
      );

      if (this.cornerRadius > 0) {
        context.restore();
      }

      context.globalAlpha = oldAlpha;
    }
  }

  /**
   * Renders the panel border.
   */
  protected renderBorder(context: CanvasRenderingContext2D, bounds: Rect): void {
    if (this.borderWidth <= 0 || this.borderStyle === BorderStyle.None) {
      return;
    }

    if (this.borderStyle === BorderStyle.Solid) {
      context.strokeStyle = this.borderColor.toCSSString();
      context.lineWidth = this.borderWidth;

      if (this.cornerRadius > 0) {
        this.drawRoundedRectPath(context, bounds, this.cornerRadius);
        context.stroke();
      } else {
        context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      }
    } else {
      this.drawStyledBorder(context, bounds);
    }
  }

  /**
   * Updates the panel.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);

    // Auto-layout children based on padding
    // This is a simple implementation - can be extended with layout managers
  }

  /**
   * Renders the panel.
   */
  override render(context: CanvasRenderingContext2D): void {
    const bounds = this.localBounds;

    context.save();

    // Render background
    this.renderBackground(context, bounds);

    // Render border
    this.renderBorder(context, bounds);

    context.restore();
  }

  /**
   * Sets padding on all sides.
   *
   * @param left - Left padding
   * @param top - Top padding
   * @param right - Right padding
   * @param bottom - Bottom padding
   * @returns This panel for chaining
   */
  setPadding(left: number, top: number, right: number, bottom: number): this {
    this.padding.left = left;
    this.padding.top = top;
    this.padding.right = right;
    this.padding.bottom = bottom;
    return this;
  }

  /**
   * Sets uniform padding on all sides.
   *
   * @param padding - Padding value
   * @returns This panel for chaining
   */
  setUniformPadding(padding: number): this {
    return this.setPadding(padding, padding, padding, padding);
  }

  /**
   * Sets the border.
   *
   * @param width - Border width
   * @param color - Border color
   * @param style - Border style
   * @returns This panel for chaining
   */
  setBorder(width: number, color: Color, style: BorderStyle = BorderStyle.Solid): this {
    this.borderWidth = width;
    this.borderColor = color;
    this.borderStyle = style;
    return this;
  }

  /**
   * Sets the gradient background.
   *
   * @param startColor - Gradient start color
   * @param endColor - Gradient end color
   * @param angle - Gradient angle in radians
   * @returns This panel for chaining
   */
  setGradient(startColor: Color, endColor: Color, angle: number = Math.PI / 2): this {
    this.enableGradient = true;
    this.gradientStartColor = startColor;
    this.gradientEndColor = endColor;
    this.gradientAngle = angle;
    return this;
  }

  /**
   * Creates a card-style panel.
   *
   * @returns New panel instance
   */
  static createCard(): Panel {
    const panel = new Panel();
    panel.backgroundColor = Color.white();
    panel.cornerRadius = 8;
    panel.enableShadow = true;
    panel.shadowOffset.set(0, 2);
    panel.shadowBlur = 12;
    panel.shadowColor = new Color(0, 0, 0, 0.15);
    panel.setPadding(16, 16, 16, 16);
    return panel;
  }

  /**
   * Creates a bordered panel.
   *
   * @returns New panel instance
   */
  static createBordered(): Panel {
    const panel = new Panel();
    panel.backgroundColor = Color.white();
    panel.setBorder(1, Color.fromHex(0xDDDDDD));
    panel.setPadding(12, 12, 12, 12);
    return panel;
  }

  /**
   * Creates a window-style panel.
   *
   * @returns New panel instance
   */
  static createWindow(): Panel {
    const panel = new Panel();
    panel.backgroundColor = Color.fromHex(0xF0F0F0);
    panel.cornerRadius = 4;
    panel.setBorder(1, Color.fromHex(0xCCCCCC));
    panel.enableShadow = true;
    panel.shadowOffset.set(0, 4);
    panel.shadowBlur = 16;
    panel.shadowColor = new Color(0, 0, 0, 0.3);
    panel.setPadding(8, 8, 8, 8);
    return panel;
  }
}
