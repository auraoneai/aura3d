/**
 * @fileoverview Absolute positioning layout system for UI elements.
 * @module ui/layout/AbsoluteLayout
 */

import { UIElement } from '../UIElement';
import { Vector2 } from '../../math/Vector2';

/**
 * Absolute position settings for an element
 */
export interface AbsolutePosition {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/**
 * Absolute positioning layout with x, y coordinates.
 * Elements are positioned at exact coordinates relative to the container.
 *
 * @example
 * ```typescript
 * const container = new UIElement();
 * const layout = new AbsoluteLayout(container);
 *
 * // Position elements at exact coordinates
 * layout.setPosition(button1, { x: 100, y: 50, width: 120, height: 40 });
 * layout.setPosition(button2, { x: 100, y: 100, width: 120, height: 40 });
 * layout.setPosition(image, { x: 250, y: 50, width: 200, height: 150 });
 *
 * layout.updateLayout();
 * ```
 */
export class AbsoluteLayout {
  /**
   * Container element
   */
  protected _container: UIElement;

  /**
   * Position settings for each child element
   */
  protected _positions: Map<UIElement, AbsolutePosition> = new Map();

  /**
   * Offset applied to all positions
   */
  public offset: Vector2;

  /**
   * Creates a new absolute layout.
   *
   * @param container - Container element to apply layout to
   *
   * @example
   * ```typescript
   * const canvas = new UIElement();
   * const absolute = new AbsoluteLayout(canvas);
   * ```
   */
  constructor(container: UIElement) {
    this._container = container;
    this.offset = new Vector2(0, 0);
  }

  /**
   * Gets the container element.
   */
  get container(): UIElement {
    return this._container;
  }

  /**
   * Sets the absolute position for an element.
   *
   * @param element - Element to position
   * @param position - Position settings
   *
   * @example
   * ```typescript
   * // Position at (100, 50) with size 200x100
   * layout.setPosition(element, { x: 100, y: 50, width: 200, height: 100 });
   *
   * // Position at (50, 150) keeping current size
   * layout.setPosition(element2, { x: 50, y: 150 });
   * ```
   */
  setPosition(element: UIElement, position: AbsolutePosition): this {
    this._positions.set(element, position);
    return this;
  }

  /**
   * Sets the position for an element using coordinates.
   *
   * @param element - Element to position
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param width - Optional width
   * @param height - Optional height
   */
  setPositionXY(element: UIElement, x: number, y: number, width?: number, height?: number): this {
    this._positions.set(element, { x, y, width, height });
    return this;
  }

  /**
   * Removes position settings for an element.
   */
  removePosition(element: UIElement): this {
    this._positions.delete(element);
    return this;
  }

  /**
   * Sets the offset for all positioned elements.
   *
   * @param x - X offset
   * @param y - Y offset
   */
  setOffset(x: number, y: number): this {
    this.offset.set(x, y);
    return this;
  }

  /**
   * Updates the layout for all positioned elements.
   */
  updateLayout(): void {
    for (const [element, position] of this._positions) {
      if (!element.visible) {
        continue;
      }

      const { x, y, width, height } = position;

      // Apply position with offset
      element.position.set(x + this.offset.x, y + this.offset.y);

      // Apply size if specified
      if (width !== undefined && height !== undefined) {
        element.size.set(width, height);
      } else if (width !== undefined) {
        element.size.set(width, element.size.y);
      } else if (height !== undefined) {
        element.size.set(element.size.x, height);
      }
    }
  }

  /**
   * Gets the position settings for an element.
   */
  getPosition(element: UIElement): AbsolutePosition | undefined {
    return this._positions.get(element);
  }

  /**
   * Checks if an element has position settings.
   */
  hasPosition(element: UIElement): boolean {
    return this._positions.has(element);
  }

  /**
   * Clears all position settings.
   */
  clear(): this {
    this._positions.clear();
    return this;
  }
}
