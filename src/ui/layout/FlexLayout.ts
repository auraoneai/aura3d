/**
 * @fileoverview CSS Flexbox-style layout system for UI elements.
 * @module ui/layout/FlexLayout
 */

import { UIElement } from '../UIElement';
import { Vector2 } from '../../math/Vector2';

/**
 * Flex direction
 */
export enum FlexDirection {
  Row = 'row',
  RowReverse = 'row-reverse',
  Column = 'column',
  ColumnReverse = 'column-reverse'
}

/**
 * Justify content alignment
 */
export enum JustifyContent {
  FlexStart = 'flex-start',
  FlexEnd = 'flex-end',
  Center = 'center',
  SpaceBetween = 'space-between',
  SpaceAround = 'space-around',
  SpaceEvenly = 'space-evenly'
}

/**
 * Align items alignment
 */
export enum AlignItems {
  FlexStart = 'flex-start',
  FlexEnd = 'flex-end',
  Center = 'center',
  Stretch = 'stretch',
  Baseline = 'baseline'
}

/**
 * Flex wrap mode
 */
export enum FlexWrap {
  NoWrap = 'nowrap',
  Wrap = 'wrap',
  WrapReverse = 'wrap-reverse'
}

/**
 * CSS Flexbox-style layout with direction, justify, align, wrap, and gap properties.
 * Provides flexible box layout similar to CSS Flexbox.
 *
 * @example
 * ```typescript
 * const container = new UIElement();
 * const layout = new FlexLayout(container);
 * layout.direction = FlexDirection.Row;
 * layout.justifyContent = JustifyContent.SpaceBetween;
 * layout.alignItems = AlignItems.Center;
 * layout.gap = 10;
 *
 * // Add children to container
 * container.addChild(child1);
 * container.addChild(child2);
 *
 * // Layout will automatically update on next frame
 * layout.updateLayout();
 * ```
 */
export class FlexLayout {
  /**
   * Container element
   */
  protected _container: UIElement;

  /**
   * Flex direction
   */
  public direction: FlexDirection;

  /**
   * Justify content (main axis alignment)
   */
  public justifyContent: JustifyContent;

  /**
   * Align items (cross axis alignment)
   */
  public alignItems: AlignItems;

  /**
   * Flex wrap mode
   */
  public wrap: FlexWrap;

  /**
   * Gap between items
   */
  public gap: number;

  /**
   * Row gap (overrides gap for rows if set)
   */
  public rowGap: number | null = null;

  /**
   * Column gap (overrides gap for columns if set)
   */
  public columnGap: number | null = null;

  /**
   * Padding (top, right, bottom, left)
   */
  public padding: { top: number; right: number; bottom: number; left: number };

  /**
   * Creates a new flex layout.
   *
   * @param container - Container element to apply layout to
   *
   * @example
   * ```typescript
   * const toolbar = new UIElement();
   * const flexLayout = new FlexLayout(toolbar);
   * flexLayout.direction = FlexDirection.Row;
   * flexLayout.gap = 5;
   * ```
   */
  constructor(container: UIElement) {
    this._container = container;
    this.direction = FlexDirection.Row;
    this.justifyContent = JustifyContent.FlexStart;
    this.alignItems = AlignItems.Stretch;
    this.wrap = FlexWrap.NoWrap;
    this.gap = 0;
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
    const children = this._container.children.filter(child => child.visible);
    if (children.length === 0) {
      return;
    }

    const isRow = this.direction === FlexDirection.Row || this.direction === FlexDirection.RowReverse;
    const isReverse = this.direction === FlexDirection.RowReverse || this.direction === FlexDirection.ColumnReverse;

    const containerWidth = this._container.size.x - this.padding.left - this.padding.right;
    const containerHeight = this._container.size.y - this.padding.top - this.padding.bottom;

    const mainGap = isRow
      ? (this.columnGap !== null ? this.columnGap : this.gap)
      : (this.rowGap !== null ? this.rowGap : this.gap);
    const crossGap = isRow
      ? (this.rowGap !== null ? this.rowGap : this.gap)
      : (this.columnGap !== null ? this.columnGap : this.gap);

    // Calculate lines if wrapping
    const lines: UIElement[][] = [];
    if (this.wrap === FlexWrap.NoWrap) {
      lines.push([...children]);
    } else {
      this.calculateLines(children, containerWidth, containerHeight, mainGap, isRow, lines);
    }

    // Reverse lines if wrap-reverse
    if (this.wrap === FlexWrap.WrapReverse) {
      lines.reverse();
    }

    // Layout each line
    let crossOffset = this.padding.top;
    for (const line of lines) {
      if (isReverse) {
        line.reverse();
      }

      const lineSize = this.layoutLine(
        line,
        containerWidth,
        containerHeight,
        crossOffset,
        mainGap,
        isRow
      );

      crossOffset += lineSize + crossGap;
    }
  }

  /**
   * Calculates lines for wrapped layout.
   */
  protected calculateLines(
    children: readonly UIElement[],
    containerWidth: number,
    containerHeight: number,
    gap: number,
    isRow: boolean,
    lines: UIElement[][]
  ): void {
    const maxSize = isRow ? containerWidth : containerHeight;
    let currentLine: UIElement[] = [];
    let currentSize = 0;

    for (const child of children) {
      const childSize = isRow ? child.size.x : child.size.y;

      if (currentLine.length > 0 && currentSize + gap + childSize > maxSize) {
        lines.push(currentLine);
        currentLine = [child];
        currentSize = childSize;
      } else {
        currentLine.push(child);
        currentSize += (currentLine.length > 1 ? gap : 0) + childSize;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }

  /**
   * Layouts a single line of items.
   */
  protected layoutLine(
    children: UIElement[],
    containerWidth: number,
    containerHeight: number,
    crossOffset: number,
    gap: number,
    isRow: boolean
  ): number {
    const isColumn = !isRow;

    // Calculate total main axis size
    let totalMainSize = 0;
    let maxCrossSize = 0;

    for (const child of children) {
      totalMainSize += isRow ? child.size.x : child.size.y;
      maxCrossSize = Math.max(maxCrossSize, isRow ? child.size.y : child.size.x);
    }

    totalMainSize += (children.length - 1) * gap;

    // Calculate main axis positions
    const mainAxisSize = isRow ? containerWidth : containerHeight;
    const positions = this.calculateMainAxisPositions(
      children,
      mainAxisSize,
      totalMainSize,
      gap,
      isRow
    );

    // Position children
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const mainPos = positions[i];

      // Calculate cross axis position
      const crossSize = isRow ? containerHeight : containerWidth;
      const childCrossSize = isRow ? child.size.y : child.size.x;
      let crossPos = this.calculateCrossAxisPosition(crossSize, childCrossSize, crossOffset);

      // Apply stretch if needed
      if (this.alignItems === AlignItems.Stretch) {
        if (isRow) {
          child.size.y = crossSize;
        } else {
          child.size.x = crossSize;
        }
      }

      // Set position
      if (isRow) {
        child.position.set(this.padding.left + mainPos, crossPos);
      } else {
        child.position.set(crossPos, this.padding.top + mainPos);
      }
    }

    return maxCrossSize;
  }

  /**
   * Calculates main axis positions based on justify content.
   */
  protected calculateMainAxisPositions(
    children: readonly UIElement[],
    containerSize: number,
    totalSize: number,
    gap: number,
    isRow: boolean
  ): number[] {
    const positions: number[] = [];
    const freeSpace = containerSize - totalSize;

    switch (this.justifyContent) {
      case JustifyContent.FlexStart:
        {
          let pos = 0;
          for (const child of children) {
            positions.push(pos);
            pos += (isRow ? child.size.x : child.size.y) + gap;
          }
        }
        break;

      case JustifyContent.FlexEnd:
        {
          let pos = freeSpace;
          for (const child of children) {
            positions.push(pos);
            pos += (isRow ? child.size.x : child.size.y) + gap;
          }
        }
        break;

      case JustifyContent.Center:
        {
          let pos = freeSpace / 2;
          for (const child of children) {
            positions.push(pos);
            pos += (isRow ? child.size.x : child.size.y) + gap;
          }
        }
        break;

      case JustifyContent.SpaceBetween:
        {
          if (children.length === 1) {
            positions.push(0);
          } else {
            const spacing = freeSpace / (children.length - 1);
            let pos = 0;
            for (const child of children) {
              positions.push(pos);
              pos += (isRow ? child.size.x : child.size.y) + spacing;
            }
          }
        }
        break;

      case JustifyContent.SpaceAround:
        {
          const spacing = freeSpace / children.length;
          let pos = spacing / 2;
          for (const child of children) {
            positions.push(pos);
            pos += (isRow ? child.size.x : child.size.y) + spacing;
          }
        }
        break;

      case JustifyContent.SpaceEvenly:
        {
          const spacing = freeSpace / (children.length + 1);
          let pos = spacing;
          for (const child of children) {
            positions.push(pos);
            pos += (isRow ? child.size.x : child.size.y) + spacing;
          }
        }
        break;
    }

    return positions;
  }

  /**
   * Calculates cross axis position based on align items.
   */
  protected calculateCrossAxisPosition(
    containerSize: number,
    childSize: number,
    offset: number
  ): number {
    switch (this.alignItems) {
      case AlignItems.FlexStart:
      case AlignItems.Baseline: // Baseline not fully implemented
        return offset;

      case AlignItems.FlexEnd:
        return offset + (containerSize - childSize);

      case AlignItems.Center:
        return offset + (containerSize - childSize) / 2;

      case AlignItems.Stretch:
        return offset;

      default:
        return offset;
    }
  }
}
