/**
 * @fileoverview Simple stack layout system for UI elements.
 * @module ui/layout/StackLayout
 */

import { UIElement } from '../UIElement';

/**
 * Stack direction
 */
export enum StackDirection {
  Horizontal = 'horizontal',
  Vertical = 'vertical'
}

/**
 * Stack alignment
 */
export enum StackAlignment {
  Start = 'start',
  Center = 'center',
  End = 'end',
  Stretch = 'stretch'
}

/**
 * Simple stack layout for arranging elements horizontally or vertically.
 * Provides a simplified alternative to FlexLayout for basic stacking.
 *
 * @example
 * ```typescript
 * const container = new UIElement();
 * const layout = new StackLayout(container, StackDirection.Vertical);
 * layout.spacing = 10;
 * layout.alignment = StackAlignment.Center;
 *
 * container.addChild(child1);
 * container.addChild(child2);
 * container.addChild(child3);
 *
 * layout.updateLayout();
 * ```
 */
export class StackLayout {
  /**
   * Container element
   */
  protected _container: UIElement;

  /**
   * Stack direction
   */
  public direction: StackDirection;

  /**
   * Alignment of items
   */
  public alignment: StackAlignment;

  /**
   * Spacing between items
   */
  public spacing: number;

  /**
   * Padding (top, right, bottom, left)
   */
  public padding: { top: number; right: number; bottom: number; left: number };

  /**
   * Whether to reverse the order of items
   */
  public reverse: boolean;

  /**
   * Creates a new stack layout.
   *
   * @param container - Container element to apply layout to
   * @param direction - Stack direction (default: Vertical)
   *
   * @example
   * ```typescript
   * const menu = new UIElement();
   * const stack = new StackLayout(menu, StackDirection.Horizontal);
   * stack.spacing = 5;
   * ```
   */
  constructor(container: UIElement, direction: StackDirection = StackDirection.Vertical) {
    this._container = container;
    this.direction = direction;
    this.alignment = StackAlignment.Start;
    this.spacing = 0;
    this.reverse = false;
    this.padding = { top: 0, right: 0, bottom: 0, left: 0 };
  }

  /**
   * Gets the container element.
   */
  get container(): UIElement {
    return this._container;
  }

  /**
   * Sets padding for all sides.
   */
  setPadding(padding: number): this;
  setPadding(vertical: number, horizontal: number): this;
  setPadding(top: number, right: number, bottom: number, left: number): this;
  setPadding(a: number, b?: number, c?: number, d?: number): this {
    if (b === undefined) {
      this.padding = { top: a, right: a, bottom: a, left: a };
    } else if (c === undefined) {
      this.padding = { top: a, right: b, bottom: a, left: b };
    } else if (d !== undefined) {
      this.padding = { top: a, right: b, bottom: c, left: d };
    }
    return this;
  }

  /**
   * Updates the layout for all children.
   */
  updateLayout(): void {
    let children = Array.from(this._container.children).filter(child => child.visible);
    if (children.length === 0) {
      return;
    }

    if (this.reverse) {
      children = children.reverse();
    }

    const isHorizontal = this.direction === StackDirection.Horizontal;
    const containerWidth = this._container.size.x - this.padding.left - this.padding.right;
    const containerHeight = this._container.size.y - this.padding.top - this.padding.bottom;

    let position = isHorizontal ? this.padding.left : this.padding.top;

    for (const child of children) {
      // Calculate cross-axis position based on alignment
      let crossPos: number;
      if (isHorizontal) {
        crossPos = this.calculateCrossPosition(containerHeight, child.size.y, this.padding.top);
        // Apply stretch
        if (this.alignment === StackAlignment.Stretch) {
          child.size.y = containerHeight;
        }
        child.position.set(position, crossPos);
        position += child.size.x + this.spacing;
      } else {
        crossPos = this.calculateCrossPosition(containerWidth, child.size.x, this.padding.left);
        // Apply stretch
        if (this.alignment === StackAlignment.Stretch) {
          child.size.x = containerWidth;
        }
        child.position.set(crossPos, position);
        position += child.size.y + this.spacing;
      }
    }
  }

  /**
   * Calculates cross-axis position based on alignment.
   */
  protected calculateCrossPosition(containerSize: number, childSize: number, offset: number): number {
    switch (this.alignment) {
      case StackAlignment.Start:
        return offset;

      case StackAlignment.Center:
        return offset + (containerSize - childSize) / 2;

      case StackAlignment.End:
        return offset + (containerSize - childSize);

      case StackAlignment.Stretch:
        return offset;

      default:
        return offset;
    }
  }
}
