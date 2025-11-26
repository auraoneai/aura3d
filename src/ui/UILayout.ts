/**
 * @fileoverview Layout components for automatic UI positioning and sizing.
 * @module ui/UILayout
 */

import { UIElement } from './UIElement';
import { Vector2 } from '../math/Vector2';

/**
 * Layout type
 */
export enum UILayoutType {
  Horizontal = 'horizontal',
  Vertical = 'vertical',
  Grid = 'grid'
}

/**
 * Child alignment
 */
export enum UILayoutAlign {
  Start = 'start',
  Center = 'center',
  End = 'end',
  Stretch = 'stretch'
}

/**
 * Layout component for automatic child positioning.
 *
 * @example
 * ```typescript
 * const layout = new UILayout();
 * layout.layoutType = UILayoutType.Vertical;
 * layout.spacing = 10;
 * layout.padding.set(20, 20, 20, 20);
 *
 * // Add children - they'll be positioned automatically
 * for (let i = 0; i < 5; i++) {
 *   const item = new UIButton(`Item ${i}`);
 *   layout.addChild(item);
 * }
 *
 * layout.rebuildLayout();
 * ```
 */
export class UILayout extends UIElement {
  /**
   * Layout type
   */
  public layoutType: UILayoutType;

  /**
   * Spacing between children
   */
  public spacing: number;

  /**
   * Padding (left, top, right, bottom)
   */
  public padding: { left: number; top: number; right: number; bottom: number };

  /**
   * Child alignment
   */
  public childAlignment: UILayoutAlign;

  /**
   * Child force expand (fill available space)
   */
  public childForceExpand: boolean;

  /**
   * Grid columns (for grid layout)
   */
  public gridColumns: number;

  /**
   * Grid rows (for grid layout)
   */
  public gridRows: number;

  /**
   * Cell size (for grid layout)
   */
  public cellSize: Vector2;

  /**
   * Auto cell size (fit to content)
   */
  public autoCellSize: boolean;

  /**
   * Whether to rebuild layout automatically when children change
   */
  public autoRebuild: boolean;

  /**
   * Whether layout needs rebuild
   */
  protected _layoutDirty: boolean = true;

  /**
   * Creates a new layout.
   *
   * @example
   * ```typescript
   * const menu = new UILayout();
   * menu.layoutType = UILayoutType.Vertical;
   * menu.spacing = 15;
   * ```
   */
  constructor() {
    super('UILayout');

    this.layoutType = UILayoutType.Vertical;
    this.spacing = 10;
    this.padding = { left: 0, top: 0, right: 0, bottom: 0 };
    this.childAlignment = UILayoutAlign.Start;
    this.childForceExpand = false;
    this.gridColumns = 3;
    this.gridRows = 0; // Auto
    this.cellSize = new Vector2(100, 100);
    this.autoCellSize = false;
    this.autoRebuild = true;
  }

  /**
   * Adds a child and marks layout dirty.
   */
  override addChild(child: UIElement): UIElement {
    super.addChild(child);
    this.markLayoutDirty();
    return child;
  }

  /**
   * Removes a child and marks layout dirty.
   */
  override removeChild(child: UIElement): boolean {
    const result = super.removeChild(child);
    if (result) {
      this.markLayoutDirty();
    }
    return result;
  }

  /**
   * Marks the layout as dirty.
   */
  markLayoutDirty(): void {
    this._layoutDirty = true;
  }

  /**
   * Rebuilds the layout.
   */
  rebuildLayout(): void {
    switch (this.layoutType) {
      case UILayoutType.Horizontal:
        this.rebuildHorizontalLayout();
        break;
      case UILayoutType.Vertical:
        this.rebuildVerticalLayout();
        break;
      case UILayoutType.Grid:
        this.rebuildGridLayout();
        break;
    }

    this._layoutDirty = false;
  }

  /**
   * Rebuilds horizontal layout.
   */
  protected rebuildHorizontalLayout(): void {
    const children = this._children.filter(c => c.visible);
    if (children.length === 0) {
      return;
    }

    const availableWidth = this.size.x - this.padding.left - this.padding.right;
    const availableHeight = this.size.y - this.padding.top - this.padding.bottom;
    const totalSpacing = this.spacing * (children.length - 1);

    let currentX = this.padding.left;

    // Calculate total width if force expand
    let childWidth = 0;
    if (this.childForceExpand) {
      childWidth = (availableWidth - totalSpacing) / children.length;
    }

    for (const child of children) {
      const width = this.childForceExpand ? childWidth : child.size.x;
      const height = this.childAlignment === UILayoutAlign.Stretch ? availableHeight : child.size.y;

      child.position.set(currentX, this.padding.top);
      child.size.set(width, height);

      // Apply vertical alignment
      if (this.childAlignment !== UILayoutAlign.Stretch) {
        switch (this.childAlignment) {
          case UILayoutAlign.Start:
            child.position.y = this.padding.top;
            break;
          case UILayoutAlign.Center:
            child.position.y = this.padding.top + (availableHeight - child.size.y) * 0.5;
            break;
          case UILayoutAlign.End:
            child.position.y = this.padding.top + availableHeight - child.size.y;
            break;
        }
      }

      currentX += width + this.spacing;
    }
  }

  /**
   * Rebuilds vertical layout.
   */
  protected rebuildVerticalLayout(): void {
    const children = this._children.filter(c => c.visible);
    if (children.length === 0) {
      return;
    }

    const availableWidth = this.size.x - this.padding.left - this.padding.right;
    const availableHeight = this.size.y - this.padding.top - this.padding.bottom;
    const totalSpacing = this.spacing * (children.length - 1);

    let currentY = this.padding.top;

    // Calculate total height if force expand
    let childHeight = 0;
    if (this.childForceExpand) {
      childHeight = (availableHeight - totalSpacing) / children.length;
    }

    for (const child of children) {
      const width = this.childAlignment === UILayoutAlign.Stretch ? availableWidth : child.size.x;
      const height = this.childForceExpand ? childHeight : child.size.y;

      child.position.set(this.padding.left, currentY);
      child.size.set(width, height);

      // Apply horizontal alignment
      if (this.childAlignment !== UILayoutAlign.Stretch) {
        switch (this.childAlignment) {
          case UILayoutAlign.Start:
            child.position.x = this.padding.left;
            break;
          case UILayoutAlign.Center:
            child.position.x = this.padding.left + (availableWidth - child.size.x) * 0.5;
            break;
          case UILayoutAlign.End:
            child.position.x = this.padding.left + availableWidth - child.size.x;
            break;
        }
      }

      currentY += height + this.spacing;
    }
  }

  /**
   * Rebuilds grid layout.
   */
  protected rebuildGridLayout(): void {
    const children = this._children.filter(c => c.visible);
    if (children.length === 0) {
      return;
    }

    const availableWidth = this.size.x - this.padding.left - this.padding.right;
    const availableHeight = this.size.y - this.padding.top - this.padding.bottom;

    // Calculate cell size
    let cellWidth = this.cellSize.x;
    let cellHeight = this.cellSize.y;

    if (this.autoCellSize) {
      const totalHSpacing = this.spacing * (this.gridColumns - 1);
      cellWidth = (availableWidth - totalHSpacing) / this.gridColumns;

      if (this.gridRows > 0) {
        const totalVSpacing = this.spacing * (this.gridRows - 1);
        cellHeight = (availableHeight - totalVSpacing) / this.gridRows;
      } else {
        // Calculate rows based on children count
        const rows = Math.ceil(children.length / this.gridColumns);
        const totalVSpacing = this.spacing * (rows - 1);
        cellHeight = (availableHeight - totalVSpacing) / rows;
      }
    }

    // Position children
    let row = 0;
    let col = 0;

    for (const child of children) {
      const x = this.padding.left + col * (cellWidth + this.spacing);
      const y = this.padding.top + row * (cellHeight + this.spacing);

      child.position.set(x, y);
      child.size.set(cellWidth, cellHeight);

      col++;
      if (col >= this.gridColumns) {
        col = 0;
        row++;
      }
    }
  }

  /**
   * Updates the layout.
   */
  override update(deltaTime: number): void {
    if (this.autoRebuild && this._layoutDirty) {
      this.rebuildLayout();
    }

    super.update(deltaTime);
  }

  /**
   * Sets padding.
   */
  setPadding(left: number, top: number, right: number, bottom: number): this {
    this.padding.left = left;
    this.padding.top = top;
    this.padding.right = right;
    this.padding.bottom = bottom;
    this.markLayoutDirty();
    return this;
  }

  /**
   * Creates a horizontal layout.
   */
  static createHorizontal(spacing: number = 10): UILayout {
    const layout = new UILayout();
    layout.layoutType = UILayoutType.Horizontal;
    layout.spacing = spacing;
    return layout;
  }

  /**
   * Creates a vertical layout.
   */
  static createVertical(spacing: number = 10): UILayout {
    const layout = new UILayout();
    layout.layoutType = UILayoutType.Vertical;
    layout.spacing = spacing;
    return layout;
  }

  /**
   * Creates a grid layout.
   */
  static createGrid(columns: number, spacing: number = 10): UILayout {
    const layout = new UILayout();
    layout.layoutType = UILayoutType.Grid;
    layout.gridColumns = columns;
    layout.spacing = spacing;
    layout.autoCellSize = true;
    return layout;
  }
}
