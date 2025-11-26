/**
 * @fileoverview CSS Grid-style layout system for UI elements.
 * @module ui/layout/GridLayout
 */

import { UIElement } from '../UIElement';

/**
 * Grid item placement
 */
export interface GridItemPlacement {
  element: UIElement;
  column?: number;
  row?: number;
  columnSpan?: number;
  rowSpan?: number;
  area?: string;
}

/**
 * Grid track size (column or row)
 */
export type GridTrackSize = number | 'auto' | `${number}fr`;

/**
 * CSS Grid-style layout with columns, rows, areas, and gap.
 * Provides powerful grid-based layouts similar to CSS Grid.
 *
 * @example
 * ```typescript
 * const container = new UIElement();
 * const layout = new GridLayout(container);
 *
 * // Define grid with 3 columns and 2 rows
 * layout.setColumns([100, '1fr', '2fr']);
 * layout.setRows([50, 'auto']);
 * layout.gap = 10;
 *
 * // Define areas
 * layout.setAreas([
 *   'header header header',
 *   'sidebar content content'
 * ]);
 *
 * // Place items
 * layout.placeItem(headerElement, { area: 'header' });
 * layout.placeItem(sidebarElement, { area: 'sidebar' });
 * layout.placeItem(contentElement, { area: 'content' });
 *
 * layout.updateLayout();
 * ```
 */
export class GridLayout {
  /**
   * Container element
   */
  protected _container: UIElement;

  /**
   * Column definitions
   */
  protected _columns: GridTrackSize[] = [];

  /**
   * Row definitions
   */
  protected _rows: GridTrackSize[] = [];

  /**
   * Grid areas definition
   */
  protected _areas: string[][] = [];

  /**
   * Item placements
   */
  protected _placements: Map<UIElement, GridItemPlacement> = new Map();

  /**
   * Gap between grid items
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
   * Creates a new grid layout.
   *
   * @param container - Container element to apply layout to
   *
   * @example
   * ```typescript
   * const dashboard = new UIElement();
   * const grid = new GridLayout(dashboard);
   * grid.setColumns(['1fr', '1fr', '1fr']);
   * grid.setRows(['auto', '1fr']);
   * ```
   */
  constructor(container: UIElement) {
    this._container = container;
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
   * Sets the column definitions.
   */
  setColumns(columns: GridTrackSize[]): this {
    this._columns = columns;
    return this;
  }

  /**
   * Sets the row definitions.
   */
  setRows(rows: GridTrackSize[]): this {
    this._rows = rows;
    return this;
  }

  /**
   * Sets the grid template areas.
   *
   * @param areas - Grid areas as strings (e.g., ['header header', 'sidebar content'])
   */
  setAreas(areas: string[]): this {
    this._areas = areas.map(row => row.trim().split(/\s+/));
    return this;
  }

  /**
   * Places an item in the grid.
   */
  placeItem(element: UIElement, placement: Omit<GridItemPlacement, 'element'>): this {
    this._placements.set(element, { element, ...placement });
    return this;
  }

  /**
   * Removes an item placement.
   */
  removeItem(element: UIElement): this {
    this._placements.delete(element);
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
   * Updates the layout for all placed items.
   */
  updateLayout(): void {
    if (this._columns.length === 0 || this._rows.length === 0) {
      return;
    }

    const containerWidth = this._container.size.x - this.padding.left - this.padding.right;
    const containerHeight = this._container.size.y - this.padding.top - this.padding.bottom;

    const colGap = this.columnGap !== null ? this.columnGap : this.gap;
    const rowGap = this.rowGap !== null ? this.rowGap : this.gap;

    // Calculate column widths
    const columnWidths = this.calculateTrackSizes(
      this._columns,
      containerWidth,
      colGap,
      true
    );

    // Calculate row heights
    const rowHeights = this.calculateTrackSizes(
      this._rows,
      containerHeight,
      rowGap,
      false
    );

    // Calculate column positions
    const columnPositions: number[] = [this.padding.left];
    for (let i = 0; i < columnWidths.length; i++) {
      columnPositions.push(columnPositions[i] + columnWidths[i] + colGap);
    }

    // Calculate row positions
    const rowPositions: number[] = [this.padding.top];
    for (let i = 0; i < rowHeights.length; i++) {
      rowPositions.push(rowPositions[i] + rowHeights[i] + rowGap);
    }

    // Place items
    for (const placement of this._placements.values()) {
      this.placeItemInGrid(
        placement,
        columnPositions,
        rowPositions,
        columnWidths,
        rowHeights
      );
    }
  }

  /**
   * Calculates track sizes (columns or rows).
   */
  protected calculateTrackSizes(
    tracks: GridTrackSize[],
    availableSize: number,
    gap: number,
    isColumn: boolean
  ): number[] {
    const totalGap = (tracks.length - 1) * gap;
    const remainingSize = availableSize - totalGap;

    const sizes: number[] = [];
    let frTotal = 0;
    let usedSize = 0;

    // First pass: calculate fixed and auto sizes
    for (const track of tracks) {
      if (typeof track === 'number') {
        sizes.push(track);
        usedSize += track;
      } else if (track === 'auto') {
        // Auto size will be calculated based on content
        sizes.push(0);
      } else if (track.endsWith('fr')) {
        const fr = parseFloat(track);
        frTotal += fr;
        sizes.push(0); // Placeholder
      }
    }

    // Second pass: distribute remaining space to fr units
    if (frTotal > 0) {
      const frSize = Math.max(0, remainingSize - usedSize) / frTotal;

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (typeof track === 'string' && track.endsWith('fr')) {
          const fr = parseFloat(track);
          sizes[i] = fr * frSize;
        }
      }
    }

    return sizes;
  }

  /**
   * Places an item in the grid.
   */
  protected placeItemInGrid(
    placement: GridItemPlacement,
    columnPositions: number[],
    rowPositions: number[],
    columnWidths: number[],
    rowHeights: number[]
  ): void {
    const { element, column, row, columnSpan = 1, rowSpan = 1, area } = placement;

    let col = column ?? 0;
    let rowIndex = row ?? 0;

    // Find position by area name if specified
    if (area) {
      const areaPos = this.findAreaPosition(area);
      if (areaPos) {
        col = areaPos.column;
        rowIndex = areaPos.row;
      }
    }

    // Ensure indices are within bounds
    col = Math.max(0, Math.min(col, this._columns.length - 1));
    rowIndex = Math.max(0, Math.min(rowIndex, this._rows.length - 1));

    // Calculate position and size
    const x = columnPositions[col];
    const y = rowPositions[rowIndex];

    let width = 0;
    for (let i = 0; i < columnSpan && col + i < columnWidths.length; i++) {
      width += columnWidths[col + i];
      if (i > 0) width += (this.columnGap !== null ? this.columnGap : this.gap);
    }

    let height = 0;
    for (let i = 0; i < rowSpan && rowIndex + i < rowHeights.length; i++) {
      height += rowHeights[rowIndex + i];
      if (i > 0) height += (this.rowGap !== null ? this.rowGap : this.gap);
    }

    // Set element position and size
    element.position.set(x, y);
    element.size.set(width, height);
  }

  /**
   * Finds the position of a named area.
   */
  protected findAreaPosition(areaName: string): { column: number; row: number } | null {
    for (let row = 0; row < this._areas.length; row++) {
      for (let col = 0; col < this._areas[row].length; col++) {
        if (this._areas[row][col] === areaName) {
          return { column: col, row };
        }
      }
    }
    return null;
  }
}
