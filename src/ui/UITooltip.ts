/**
 * @fileoverview Tooltip system with delay, positioning, and customization.
 * @module ui/UITooltip
 */

import { UIElement, UIEventType } from './UIElement';
import { UICanvas } from './UICanvas';
import { Color } from '../math/Color';
import { Vector2 } from '../math/Vector2';
import { Rect } from '../math/Rect';

/**
 * Tooltip placement position
 */
export enum TooltipPlacement {
  Top = 'top',
  Bottom = 'bottom',
  Left = 'left',
  Right = 'right',
  Auto = 'auto'
}

/**
 * Tooltip configuration
 */
export interface TooltipConfig {
  /** Tooltip text content */
  text: string;
  /** Placement preference */
  placement?: TooltipPlacement;
  /** Show delay in seconds */
  delay?: number;
  /** Custom background color */
  backgroundColor?: Color;
  /** Custom text color */
  textColor?: Color;
  /** Custom font */
  font?: string;
}

/**
 * Tooltip system for displaying contextual information on hover.
 * Automatically positions tooltips to stay within canvas bounds.
 *
 * @example
 * ```typescript
 * // Create tooltip system
 * const tooltips = new UITooltipSystem(canvas);
 *
 * // Register tooltip for element
 * tooltips.register(button, {
 *   text: 'Click to submit',
 *   placement: TooltipPlacement.Top,
 *   delay: 0.5
 * });
 *
 * // Custom styled tooltip
 * tooltips.register(icon, {
 *   text: 'Help information',
 *   backgroundColor: Color.fromHex(0x333333),
 *   textColor: Color.white(),
 *   font: '14px Arial'
 * });
 * ```
 */
export class UITooltipSystem {
  /**
   * Associated UI canvas
   */
  protected canvas: UICanvas;

  /**
   * Tooltip configurations per element
   */
  protected _tooltips: Map<UIElement, TooltipConfig> = new Map();

  /**
   * Current tooltip element
   */
  protected _currentTooltip: UIElement | null = null;

  /**
   * Tooltip display element
   */
  protected _tooltipDisplay: UIElement | null = null;

  /**
   * Hover timer
   */
  protected _hoverTimer: number = 0;

  /**
   * Whether tooltip is showing
   */
  protected _isShowing: boolean = false;

  /**
   * Default show delay in seconds
   */
  public defaultDelay: number = 0.7;

  /**
   * Default placement
   */
  public defaultPlacement: TooltipPlacement = TooltipPlacement.Auto;

  /**
   * Default background color
   */
  public defaultBackgroundColor: Color = new Color(0.2, 0.2, 0.2, 0.95);

  /**
   * Default text color
   */
  public defaultTextColor: Color = Color.white();

  /**
   * Default font
   */
  public defaultFont: string = '14px Arial';

  /**
   * Tooltip padding
   */
  public padding: number = 8;

  /**
   * Tooltip corner radius
   */
  public cornerRadius: number = 4;

  /**
   * Tooltip offset from target
   */
  public offset: number = 8;

  /**
   * Maximum tooltip width
   */
  public maxWidth: number = 300;

  /**
   * Creates a new tooltip system.
   *
   * @param canvas - UI canvas
   *
   * @example
   * ```typescript
   * const tooltips = new UITooltipSystem(myCanvas);
   * ```
   */
  constructor(canvas: UICanvas) {
    this.canvas = canvas;
    this.createTooltipDisplay();
  }

  /**
   * Creates the tooltip display element.
   */
  protected createTooltipDisplay(): void {
    this._tooltipDisplay = new UIElement('Tooltip');
    this._tooltipDisplay.visible = false;
    this._tooltipDisplay.interactive = false;
    this._tooltipDisplay.zIndex = 10000;
    this.canvas.addChild(this._tooltipDisplay);
  }

  /**
   * Registers a tooltip for an element.
   *
   * @param element - Target element
   * @param config - Tooltip configuration
   */
  register(element: UIElement, config: TooltipConfig): void {
    this._tooltips.set(element, config);

    // Add hover listeners
    element.addEventListener(UIEventType.PointerEnter, () => this.handlePointerEnter(element));
    element.addEventListener(UIEventType.PointerLeave, () => this.handlePointerLeave(element));
  }

  /**
   * Unregisters a tooltip.
   *
   * @param element - Target element
   */
  unregister(element: UIElement): void {
    this._tooltips.delete(element);

    if (this._currentTooltip === element) {
      this.hide();
    }
  }

  /**
   * Handles pointer enter on element.
   */
  protected handlePointerEnter(element: UIElement): void {
    const config = this._tooltips.get(element);
    if (!config) return;

    this._currentTooltip = element;
    this._hoverTimer = 0;
    this._isShowing = false;
  }

  /**
   * Handles pointer leave on element.
   */
  protected handlePointerLeave(element: UIElement): void {
    if (this._currentTooltip === element) {
      this.hide();
    }
  }

  /**
   * Shows the tooltip.
   */
  protected show(element: UIElement, config: TooltipConfig): void {
    if (!this._tooltipDisplay) return;

    this._isShowing = true;
    this._tooltipDisplay.visible = true;

    // Position tooltip
    this.positionTooltip(element, config);
  }

  /**
   * Hides the tooltip.
   */
  protected hide(): void {
    if (this._tooltipDisplay) {
      this._tooltipDisplay.visible = false;
    }

    this._currentTooltip = null;
    this._hoverTimer = 0;
    this._isShowing = false;
  }

  /**
   * Positions the tooltip relative to target element.
   */
  protected positionTooltip(element: UIElement, config: TooltipConfig): void {
    if (!this._tooltipDisplay) return;

    const placement = config.placement ?? this.defaultPlacement;
    const targetBounds = element.worldBounds;
    const canvasBounds = this.canvas.localBounds;

    // Measure tooltip size
    const tooltipSize = this.measureTooltip(config);

    // Calculate position based on placement
    let x = 0;
    let y = 0;
    let finalPlacement = placement;

    if (placement === TooltipPlacement.Auto) {
      // Auto-position based on available space
      finalPlacement = this.findBestPlacement(targetBounds, tooltipSize, canvasBounds);
    }

    switch (finalPlacement) {
      case TooltipPlacement.Top:
        x = targetBounds.x + targetBounds.width * 0.5 - tooltipSize.x * 0.5;
        y = targetBounds.y - tooltipSize.y - this.offset;
        break;

      case TooltipPlacement.Bottom:
        x = targetBounds.x + targetBounds.width * 0.5 - tooltipSize.x * 0.5;
        y = targetBounds.y + targetBounds.height + this.offset;
        break;

      case TooltipPlacement.Left:
        x = targetBounds.x - tooltipSize.x - this.offset;
        y = targetBounds.y + targetBounds.height * 0.5 - tooltipSize.y * 0.5;
        break;

      case TooltipPlacement.Right:
        x = targetBounds.x + targetBounds.width + this.offset;
        y = targetBounds.y + targetBounds.height * 0.5 - tooltipSize.y * 0.5;
        break;
    }

    // Clamp to canvas bounds
    x = Math.max(this.padding, Math.min(canvasBounds.width - tooltipSize.x - this.padding, x));
    y = Math.max(this.padding, Math.min(canvasBounds.height - tooltipSize.y - this.padding, y));

    this._tooltipDisplay.position.set(x, y);
    this._tooltipDisplay.size.copy(tooltipSize);
  }

  /**
   * Finds best placement for tooltip.
   */
  protected findBestPlacement(
    targetBounds: Rect,
    tooltipSize: Vector2,
    canvasBounds: Rect
  ): TooltipPlacement {
    const spaceTop = targetBounds.y;
    const spaceBottom = canvasBounds.height - (targetBounds.y + targetBounds.height);
    const spaceLeft = targetBounds.x;
    const spaceRight = canvasBounds.width - (targetBounds.x + targetBounds.width);

    // Prefer vertical placements
    if (spaceBottom >= tooltipSize.y + this.offset) {
      return TooltipPlacement.Bottom;
    }
    if (spaceTop >= tooltipSize.y + this.offset) {
      return TooltipPlacement.Top;
    }
    if (spaceRight >= tooltipSize.x + this.offset) {
      return TooltipPlacement.Right;
    }
    if (spaceLeft >= tooltipSize.x + this.offset) {
      return TooltipPlacement.Left;
    }

    // Fallback to largest space
    const maxSpace = Math.max(spaceTop, spaceBottom, spaceLeft, spaceRight);
    if (maxSpace === spaceBottom) return TooltipPlacement.Bottom;
    if (maxSpace === spaceTop) return TooltipPlacement.Top;
    if (maxSpace === spaceRight) return TooltipPlacement.Right;
    return TooltipPlacement.Left;
  }

  /**
   * Measures tooltip dimensions.
   */
  protected measureTooltip(config: TooltipConfig): Vector2 {
    // Create temporary canvas for measurement
    const tempCanvas = document.createElement('canvas');
    const context = tempCanvas.getContext('2d')!;

    context.font = config.font ?? this.defaultFont;
    const metrics = context.measureText(config.text);
    const width = Math.min(this.maxWidth, metrics.width + this.padding * 2);
    const height = 16 + this.padding * 2; // Approximate line height

    return new Vector2(width, height);
  }

  /**
   * Updates the tooltip system.
   */
  update(deltaTime: number): void {
    if (!this._currentTooltip || this._isShowing) return;

    const config = this._tooltips.get(this._currentTooltip);
    if (!config) return;

    this._hoverTimer += deltaTime;

    const delay = config.delay ?? this.defaultDelay;
    if (this._hoverTimer >= delay) {
      this.show(this._currentTooltip, config);
    }
  }

  /**
   * Renders tooltips.
   */
  render(context: CanvasRenderingContext2D): void {
    if (!this._tooltipDisplay || !this._tooltipDisplay.visible || !this._currentTooltip) {
      return;
    }

    const config = this._tooltips.get(this._currentTooltip);
    if (!config) return;

    const pos = this._tooltipDisplay.worldPosition;
    const size = this._tooltipDisplay.size;

    context.save();

    // Draw background
    const bgColor = config.backgroundColor ?? this.defaultBackgroundColor;
    context.fillStyle = bgColor.toCSSString();

    if (this.cornerRadius > 0) {
      context.beginPath();
      context.roundRect(pos.x, pos.y, size.x, size.y, this.cornerRadius);
      context.fill();
    } else {
      context.fillRect(pos.x, pos.y, size.x, size.y);
    }

    // Draw text
    const textColor = config.textColor ?? this.defaultTextColor;
    context.fillStyle = textColor.toCSSString();
    context.font = config.font ?? this.defaultFont;
    context.textAlign = 'left';
    context.textBaseline = 'top';

    context.fillText(
      config.text,
      pos.x + this.padding,
      pos.y + this.padding
    );

    context.restore();
  }

  /**
   * Clears all tooltips.
   */
  clear(): void {
    this._tooltips.clear();
    this.hide();
  }

  /**
   * Destroys the tooltip system.
   */
  destroy(): void {
    this.clear();

    if (this._tooltipDisplay) {
      this._tooltipDisplay.removeFromParent();
      this._tooltipDisplay = null;
    }
  }
}
