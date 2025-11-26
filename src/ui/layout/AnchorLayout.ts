/**
 * @fileoverview Anchor-based positioning layout system for UI elements.
 * @module ui/layout/AnchorLayout
 */

import { UIElement } from '../UIElement';

/**
 * Anchor settings for an element
 */
export interface AnchorSettings {
  left?: number | null;
  right?: number | null;
  top?: number | null;
  bottom?: number | null;
  width?: number | null;
  height?: number | null;
}

/**
 * Anchor-based positioning layout (top, bottom, left, right, stretch).
 * Allows elements to be anchored to container edges with offsets.
 *
 * @example
 * ```typescript
 * const container = new UIElement();
 * const layout = new AnchorLayout(container);
 *
 * // Anchor to top-left with offsets
 * layout.setAnchors(header, { left: 10, top: 10, right: 10, height: 50 });
 *
 * // Anchor to bottom-right
 * layout.setAnchors(footer, { right: 0, bottom: 0, width: 200, height: 40 });
 *
 * // Stretch to fill container
 * layout.setAnchors(content, { left: 0, right: 0, top: 60, bottom: 50 });
 *
 * layout.updateLayout();
 * ```
 */
export class AnchorLayout {
  /**
   * Container element
   */
  protected _container: UIElement;

  /**
   * Anchor settings for each child element
   */
  protected _anchors: Map<UIElement, AnchorSettings> = new Map();

  /**
   * Padding (top, right, bottom, left)
   */
  public padding: { top: number; right: number; bottom: number; left: number };

  /**
   * Creates a new anchor layout.
   *
   * @param container - Container element to apply layout to
   *
   * @example
   * ```typescript
   * const panel = new UIElement();
   * const anchors = new AnchorLayout(panel);
   * ```
   */
  constructor(container: UIElement) {
    this._container = container;
    this.padding = { top: 0, right: 0, bottom: 0, left: 0 };
  }

  /**
   * Gets the container element.
   */
  get container(): UIElement {
    return this._container;
  }

  /**
   * Sets anchor settings for an element.
   *
   * @param element - Element to anchor
   * @param anchors - Anchor settings
   *
   * @example
   * ```typescript
   * // Pin to top-left corner with 10px margin
   * layout.setAnchors(element, { left: 10, top: 10, width: 100, height: 50 });
   *
   * // Stretch horizontally, fixed height at top
   * layout.setAnchors(toolbar, { left: 0, right: 0, top: 0, height: 40 });
   *
   * // Stretch vertically on the right side
   * layout.setAnchors(sidebar, { right: 0, top: 40, bottom: 0, width: 200 });
   * ```
   */
  setAnchors(element: UIElement, anchors: AnchorSettings): this {
    this._anchors.set(element, anchors);
    return this;
  }

  /**
   * Removes anchor settings for an element.
   */
  removeAnchors(element: UIElement): this {
    this._anchors.delete(element);
    return this;
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
   * Updates the layout for all anchored elements.
   */
  updateLayout(): void {
    const containerWidth = this._container.size.x - this.padding.left - this.padding.right;
    const containerHeight = this._container.size.y - this.padding.top - this.padding.bottom;

    for (const [element, anchors] of this._anchors) {
      if (!element.visible) {
        continue;
      }

      const {
        left = null,
        right = null,
        top = null,
        bottom = null,
        width = null,
        height = null
      } = anchors;

      let x = 0;
      let y = 0;
      let w = width ?? element.size.x;
      let h = height ?? element.size.y;

      // Calculate horizontal position and size
      if (left !== null && right !== null) {
        // Stretch horizontally
        x = this.padding.left + left;
        w = containerWidth - left - right;
      } else if (left !== null) {
        // Anchor to left
        x = this.padding.left + left;
        if (width === null) {
          w = element.size.x;
        }
      } else if (right !== null) {
        // Anchor to right
        if (width !== null) {
          x = this.padding.left + containerWidth - right - width;
          w = width;
        } else {
          x = this.padding.left + containerWidth - right - element.size.x;
          w = element.size.x;
        }
      }

      // Calculate vertical position and size
      if (top !== null && bottom !== null) {
        // Stretch vertically
        y = this.padding.top + top;
        h = containerHeight - top - bottom;
      } else if (top !== null) {
        // Anchor to top
        y = this.padding.top + top;
        if (height === null) {
          h = element.size.y;
        }
      } else if (bottom !== null) {
        // Anchor to bottom
        if (height !== null) {
          y = this.padding.top + containerHeight - bottom - height;
          h = height;
        } else {
          y = this.padding.top + containerHeight - bottom - element.size.y;
          h = element.size.y;
        }
      }

      // Apply position and size
      element.position.set(x, y);
      element.size.set(w, h);
    }
  }
}
