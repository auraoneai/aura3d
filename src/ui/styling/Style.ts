import { Color } from '../../math/Color';

/**
 * Font weight values for typography.
 */
export enum FontWeight {
  Thin = 100,
  ExtraLight = 200,
  Light = 300,
  Normal = 400,
  Medium = 500,
  SemiBold = 600,
  Bold = 700,
  ExtraBold = 800,
  Black = 900,
}

/**
 * Text alignment options.
 */
export enum TextAlign {
  Left = 'left',
  Center = 'center',
  Right = 'right',
  Justify = 'justify',
}

/**
 * Vertical alignment options.
 */
export enum VerticalAlign {
  Top = 'top',
  Middle = 'middle',
  Bottom = 'bottom',
  Baseline = 'baseline',
}

/**
 * Display modes for layout.
 */
export enum Display {
  Block = 'block',
  Inline = 'inline',
  Flex = 'flex',
  Grid = 'grid',
  None = 'none',
}

/**
 * Position modes for element placement.
 */
export enum Position {
  Static = 'static',
  Relative = 'relative',
  Absolute = 'absolute',
  Fixed = 'fixed',
}

/**
 * Overflow behavior options.
 */
export enum Overflow {
  Visible = 'visible',
  Hidden = 'hidden',
  Scroll = 'scroll',
  Auto = 'auto',
}

/**
 * Cursor types for mouse interaction.
 */
export enum Cursor {
  Auto = 'auto',
  Default = 'default',
  Pointer = 'pointer',
  Text = 'text',
  Move = 'move',
  NotAllowed = 'not-allowed',
  Grab = 'grab',
  Grabbing = 'grabbing',
  Crosshair = 'crosshair',
  Help = 'help',
  Wait = 'wait',
}

/**
 * Border style options.
 */
export enum BorderStyle {
  None = 'none',
  Solid = 'solid',
  Dashed = 'dashed',
  Dotted = 'dotted',
}

/**
 * Represents a border with width, style, and color.
 */
export interface Border {
  width: number;
  style: BorderStyle;
  color: Color;
}

/**
 * Represents a shadow with offset, blur, spread, and color.
 */
export interface Shadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: Color;
  inset?: boolean;
}

/**
 * Represents spacing values for all four sides (top, right, bottom, left).
 */
export interface Spacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Represents border radius values for all four corners.
 */
export interface BorderRadius {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

/**
 * Complete style definition for UI elements.
 * Contains all visual properties that can be applied to an element.
 */
export class Style {
  /**
   * Background color.
   */
  backgroundColor?: Color;

  /**
   * Text color.
   */
  color?: Color;

  /**
   * Font family name.
   */
  fontFamily?: string;

  /**
   * Font size in pixels.
   */
  fontSize?: number;

  /**
   * Font weight.
   */
  fontWeight?: FontWeight;

  /**
   * Line height multiplier.
   */
  lineHeight?: number;

  /**
   * Text alignment.
   */
  textAlign?: TextAlign;

  /**
   * Vertical alignment.
   */
  verticalAlign?: VerticalAlign;

  /**
   * Display mode.
   */
  display?: Display;

  /**
   * Position mode.
   */
  position?: Position;

  /**
   * Top position offset.
   */
  top?: number;

  /**
   * Right position offset.
   */
  right?: number;

  /**
   * Bottom position offset.
   */
  bottom?: number;

  /**
   * Left position offset.
   */
  left?: number;

  /**
   * Element width.
   */
  width?: number;

  /**
   * Element height.
   */
  height?: number;

  /**
   * Minimum width.
   */
  minWidth?: number;

  /**
   * Maximum width.
   */
  maxWidth?: number;

  /**
   * Minimum height.
   */
  minHeight?: number;

  /**
   * Maximum height.
   */
  maxHeight?: number;

  /**
   * Margin spacing.
   */
  margin?: Spacing;

  /**
   * Padding spacing.
   */
  padding?: Spacing;

  /**
   * Border configuration.
   */
  border?: Border;

  /**
   * Border radius.
   */
  borderRadius?: BorderRadius;

  /**
   * Box shadow.
   */
  boxShadow?: Shadow;

  /**
   * Text shadow.
   */
  textShadow?: Shadow;

  /**
   * Opacity (0-1).
   */
  opacity?: number;

  /**
   * Z-index for stacking order.
   */
  zIndex?: number;

  /**
   * Overflow behavior.
   */
  overflow?: Overflow;

  /**
   * Cursor type.
   */
  cursor?: Cursor;

  /**
   * Pointer events enabled.
   */
  pointerEvents?: boolean;

  /**
   * Creates a new Style instance.
   */
  constructor() {}

  /**
   * Creates a copy of this style.
   *
   * @returns A new Style instance with copied values
   */
  clone(): Style {
    const style = new Style();

    style.backgroundColor = this.backgroundColor?.clone();
    style.color = this.color?.clone();
    style.fontFamily = this.fontFamily;
    style.fontSize = this.fontSize;
    style.fontWeight = this.fontWeight;
    style.lineHeight = this.lineHeight;
    style.textAlign = this.textAlign;
    style.verticalAlign = this.verticalAlign;
    style.display = this.display;
    style.position = this.position;
    style.top = this.top;
    style.right = this.right;
    style.bottom = this.bottom;
    style.left = this.left;
    style.width = this.width;
    style.height = this.height;
    style.minWidth = this.minWidth;
    style.maxWidth = this.maxWidth;
    style.minHeight = this.minHeight;
    style.maxHeight = this.maxHeight;
    style.margin = this.margin ? { ...this.margin } : undefined;
    style.padding = this.padding ? { ...this.padding } : undefined;
    style.border = this.border ? { ...this.border, color: this.border.color.clone() } : undefined;
    style.borderRadius = this.borderRadius ? { ...this.borderRadius } : undefined;
    style.boxShadow = this.boxShadow ? { ...this.boxShadow, color: this.boxShadow.color.clone() } : undefined;
    style.textShadow = this.textShadow ? { ...this.textShadow, color: this.textShadow.color.clone() } : undefined;
    style.opacity = this.opacity;
    style.zIndex = this.zIndex;
    style.overflow = this.overflow;
    style.cursor = this.cursor;
    style.pointerEvents = this.pointerEvents;

    return style;
  }

  /**
   * Merges another style into this style.
   * Properties from the other style override properties in this style.
   *
   * @param other - The style to merge from
   * @returns This style for chaining
   */
  merge(other: Style): this {
    if (other.backgroundColor !== undefined) this.backgroundColor = other.backgroundColor.clone();
    if (other.color !== undefined) this.color = other.color.clone();
    if (other.fontFamily !== undefined) this.fontFamily = other.fontFamily;
    if (other.fontSize !== undefined) this.fontSize = other.fontSize;
    if (other.fontWeight !== undefined) this.fontWeight = other.fontWeight;
    if (other.lineHeight !== undefined) this.lineHeight = other.lineHeight;
    if (other.textAlign !== undefined) this.textAlign = other.textAlign;
    if (other.verticalAlign !== undefined) this.verticalAlign = other.verticalAlign;
    if (other.display !== undefined) this.display = other.display;
    if (other.position !== undefined) this.position = other.position;
    if (other.top !== undefined) this.top = other.top;
    if (other.right !== undefined) this.right = other.right;
    if (other.bottom !== undefined) this.bottom = other.bottom;
    if (other.left !== undefined) this.left = other.left;
    if (other.width !== undefined) this.width = other.width;
    if (other.height !== undefined) this.height = other.height;
    if (other.minWidth !== undefined) this.minWidth = other.minWidth;
    if (other.maxWidth !== undefined) this.maxWidth = other.maxWidth;
    if (other.minHeight !== undefined) this.minHeight = other.minHeight;
    if (other.maxHeight !== undefined) this.maxHeight = other.maxHeight;
    if (other.margin !== undefined) this.margin = { ...other.margin };
    if (other.padding !== undefined) this.padding = { ...other.padding };
    if (other.border !== undefined) this.border = { ...other.border, color: other.border.color.clone() };
    if (other.borderRadius !== undefined) this.borderRadius = { ...other.borderRadius };
    if (other.boxShadow !== undefined) this.boxShadow = { ...other.boxShadow, color: other.boxShadow.color.clone() };
    if (other.textShadow !== undefined) this.textShadow = { ...other.textShadow, color: other.textShadow.color.clone() };
    if (other.opacity !== undefined) this.opacity = other.opacity;
    if (other.zIndex !== undefined) this.zIndex = other.zIndex;
    if (other.overflow !== undefined) this.overflow = other.overflow;
    if (other.cursor !== undefined) this.cursor = other.cursor;
    if (other.pointerEvents !== undefined) this.pointerEvents = other.pointerEvents;

    return this;
  }
}

/**
 * Helper function to create a Spacing object from shorthand notation.
 *
 * @param value - Single value (all sides) or array [top, right, bottom, left]
 * @returns Spacing object
 *
 * @example
 * ```typescript
 * const margin1 = spacing(10); // All sides = 10
 * const margin2 = spacing([10, 20]); // top/bottom = 10, left/right = 20
 * const margin3 = spacing([10, 20, 30, 40]); // top, right, bottom, left
 * ```
 */
export function spacing(value: number | [number, number] | [number, number, number, number]): Spacing {
  if (typeof value === 'number') {
    return { top: value, right: value, bottom: value, left: value };
  } else if (value.length === 2) {
    const [vertical, horizontal] = value;
    return { top: vertical, right: horizontal, bottom: vertical, left: horizontal };
  } else {
    const [top, right, bottom, left] = value;
    return { top, right, bottom, left };
  }
}

/**
 * Helper function to create a BorderRadius object from shorthand notation.
 *
 * @param value - Single value (all corners) or array [topLeft, topRight, bottomRight, bottomLeft]
 * @returns BorderRadius object
 *
 * @example
 * ```typescript
 * const radius1 = borderRadius(5); // All corners = 5
 * const radius2 = borderRadius([5, 10, 15, 20]); // Individual corners
 * ```
 */
export function borderRadius(value: number | [number, number, number, number]): BorderRadius {
  if (typeof value === 'number') {
    return { topLeft: value, topRight: value, bottomRight: value, bottomLeft: value };
  } else {
    const [topLeft, topRight, bottomRight, bottomLeft] = value;
    return { topLeft, topRight, bottomRight, bottomLeft };
  }
}

/**
 * Helper function to create a Border object.
 *
 * @param width - Border width in pixels
 * @param style - Border style
 * @param color - Border color
 * @returns Border object
 */
export function border(width: number, style: BorderStyle, color: Color): Border {
  return { width, style, color };
}

/**
 * Helper function to create a Shadow object.
 *
 * @param offsetX - Horizontal offset
 * @param offsetY - Vertical offset
 * @param blur - Blur radius
 * @param spread - Spread radius
 * @param color - Shadow color
 * @param inset - Whether the shadow is inset
 * @returns Shadow object
 */
export function shadow(
  offsetX: number,
  offsetY: number,
  blur: number,
  spread: number,
  color: Color,
  inset?: boolean
): Shadow {
  return { offsetX, offsetY, blur, spread, color, inset };
}
