/**
 * @fileoverview Virtualized list view UI component for efficiently displaying large datasets.
 * @module ui/components/ListView
 */

import { UIElement, UIEventType, UIEvent } from '../UIElement';
import { UIScrollView } from '../UIScrollView';
import { Color } from '../../math/Color';
import { Vector2 } from '../../math/Vector2';

/**
 * List item renderer function type
 */
export type ListItemRenderer<T> = (
  item: T,
  index: number,
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  isSelected: boolean,
  isHovered: boolean
) => void;

/**
 * Virtualized list view for efficiently displaying large datasets (10k+ items).
 * Only renders visible items, dramatically improving performance.
 *
 * @example
 * ```typescript
 * const items = Array.from({ length: 10000 }, (_, i) => `Item ${i + 1}`);
 *
 * const listView = new ListView<string>(items, 40);
 * listView.setSize(300, 400);
 * listView.position.set(100, 100);
 *
 * listView.setRenderer((item, index, ctx, x, y, w, h, selected, hovered) => {
 *   ctx.fillStyle = selected ? '#E3F2FD' : (hovered ? '#F5F5F5' : '#FFFFFF');
 *   ctx.fillRect(x, y, w, h);
 *   ctx.fillStyle = '#000000';
 *   ctx.font = '14px sans-serif';
 *   ctx.fillText(item, x + 10, y + h / 2);
 * });
 *
 * listView.onSelectionChanged((indices, items) => {
 *   console.log('Selected:', items);
 * });
 * ```
 */
export class ListView<T = any> extends UIElement {
  /**
   * List items
   */
  protected _items: T[];

  /**
   * Item height
   */
  public itemHeight: number;

  /**
   * List width
   */
  public listWidth: number;

  /**
   * List height
   */
  public listHeight: number;

  /**
   * Selected item indices
   */
  protected _selectedIndices: Set<number>;

  /**
   * Whether multi-select is enabled
   */
  public multiSelect: boolean;

  /**
   * Background color
   */
  public override backgroundColor: Color;

  /**
   * Selected item color
   */
  public selectedColor: Color;

  /**
   * Hover item color
   */
  public hoverColor: Color;

  /**
   * Alternating row colors enabled
   */
  public alternatingRows: boolean;

  /**
   * Alternate row color
   */
  public alternateColor: Color;

  /**
   * Scroll view for virtualization
   */
  protected _scrollView: UIScrollView;

  /**
   * Item renderer function
   */
  protected _renderer: ListItemRenderer<T> | null = null;

  /**
   * Hovered item index
   */
  protected _hoveredIndex: number;

  /**
   * Selection changed callback
   */
  protected _selectionChangedCallback: ((indices: number[], items: T[]) => void) | null = null;

  /**
   * Item clicked callback
   */
  protected _itemClickedCallback: ((index: number, item: T) => void) | null = null;

  /**
   * Visible range start index
   */
  protected _visibleStartIndex: number = 0;

  /**
   * Visible range end index
   */
  protected _visibleEndIndex: number = 0;

  /**
   * Overscan count (items to render outside visible area)
   */
  public overscanCount: number = 3;

  /**
   * Creates a new list view.
   *
   * @param items - List items
   * @param itemHeight - Height of each item
   *
   * @example
   * ```typescript
   * const data = Array.from({ length: 50000 }, (_, i) => ({
   *   id: i,
   *   name: `User ${i}`,
   *   email: `user${i}@example.com`
   * }));
   *
   * const list = new ListView(data, 50);
   * ```
   */
  constructor(items: T[] = [], itemHeight: number = 40) {
    super('ListView');

    this._items = items;
    this.itemHeight = itemHeight;
    this.listWidth = 300;
    this.listHeight = 400;
    this._selectedIndices = new Set();
    this.multiSelect = false;
    this._hoveredIndex = -1;

    // Default colors
    this.backgroundColor = Color.white();
    this.selectedColor = Color.fromHex(0xE3F2FD);
    this.hoverColor = Color.fromHex(0xF5F5F5);
    this.alternatingRows = false;
    this.alternateColor = Color.fromHex(0xFAFAFA);

    this.size.set(this.listWidth, this.listHeight);
    this.interactive = true;
    this.blockPointer = true;

    // Create scroll view
    this._scrollView = new UIScrollView();
    this._scrollView.size.set(this.listWidth, this.listHeight);
    this._scrollView.contentSize.set(this.listWidth, items.length * itemHeight);
    this.addChild(this._scrollView);

    // Setup event listeners
    this.addEventListener(UIEventType.Click, this.handleClick.bind(this));
    this.addEventListener(UIEventType.PointerMove, this.handlePointerMove.bind(this));
    this.addEventListener(UIEventType.PointerLeave, this.handlePointerLeave.bind(this));
  }

  /**
   * Gets the list items.
   */
  get items(): readonly T[] {
    return this._items;
  }

  /**
   * Gets the selected indices.
   */
  get selectedIndices(): readonly number[] {
    return Array.from(this._selectedIndices);
  }

  /**
   * Gets the selected items.
   */
  get selectedItems(): T[] {
    return Array.from(this._selectedIndices)
      .map(index => this._items[index])
      .filter(item => item !== undefined);
  }

  /**
   * Sets the list items.
   */
  setItems(items: T[]): this {
    this._items = items;
    this._scrollView.contentSize.set(this.listWidth, items.length * this.itemHeight);
    this._selectedIndices.clear();
    this._hoveredIndex = -1;
    this.updateVisibleRange();
    return this;
  }

  /**
   * Adds an item to the list.
   */
  addItem(item: T): this {
    this._items.push(item);
    this._scrollView.contentSize.set(this.listWidth, this._items.length * this.itemHeight);
    return this;
  }

  /**
   * Removes an item at the specified index.
   */
  removeItem(index: number): this {
    if (index >= 0 && index < this._items.length) {
      this._items.splice(index, 1);
      this._scrollView.contentSize.set(this.listWidth, this._items.length * this.itemHeight);
      this._selectedIndices.delete(index);
      this.updateVisibleRange();
    }
    return this;
  }

  /**
   * Clears all items.
   */
  clearItems(): this {
    this._items = [];
    this._scrollView.contentSize.set(this.listWidth, 0);
    this._selectedIndices.clear();
    this._hoveredIndex = -1;
    return this;
  }

  /**
   * Sets the item renderer function.
   *
   * @param renderer - Item renderer function
   *
   * @example
   * ```typescript
   * list.setRenderer((item, index, ctx, x, y, w, h, selected, hovered) => {
   *   // Custom rendering logic
   *   ctx.fillStyle = selected ? '#E3F2FD' : '#FFFFFF';
   *   ctx.fillRect(x, y, w, h);
   *   ctx.fillStyle = '#000000';
   *   ctx.fillText(item.name, x + 10, y + h / 2);
   * });
   * ```
   */
  setRenderer(renderer: ListItemRenderer<T>): this {
    this._renderer = renderer;
    return this;
  }

  /**
   * Selects an item by index.
   */
  selectIndex(index: number): this {
    if (index < 0 || index >= this._items.length) {
      return this;
    }

    if (!this.multiSelect) {
      this._selectedIndices.clear();
    }

    this._selectedIndices.add(index);

    if (this._selectionChangedCallback) {
      this._selectionChangedCallback(this.selectedIndices as number[], this.selectedItems);
    }

    return this;
  }

  /**
   * Deselects an item by index.
   */
  deselectIndex(index: number): this {
    if (this._selectedIndices.delete(index)) {
      if (this._selectionChangedCallback) {
        this._selectionChangedCallback(this.selectedIndices as number[], this.selectedItems);
      }
    }
    return this;
  }

  /**
   * Toggles selection for an item.
   */
  toggleSelection(index: number): this {
    if (this._selectedIndices.has(index)) {
      this.deselectIndex(index);
    } else {
      this.selectIndex(index);
    }
    return this;
  }

  /**
   * Clears all selections.
   */
  clearSelection(): this {
    if (this._selectedIndices.size > 0) {
      this._selectedIndices.clear();

      if (this._selectionChangedCallback) {
        this._selectionChangedCallback([], []);
      }
    }
    return this;
  }

  /**
   * Scrolls to an item by index.
   */
  scrollToIndex(index: number, align: 'start' | 'center' | 'end' = 'start'): this {
    if (index < 0 || index >= this._items.length) {
      return this;
    }

    const itemY = index * this.itemHeight;

    switch (align) {
      case 'start':
        this._scrollView.setScrollPosition(0, itemY);
        break;
      case 'center':
        this._scrollView.setScrollPosition(0, itemY - this.listHeight / 2 + this.itemHeight / 2);
        break;
      case 'end':
        this._scrollView.setScrollPosition(0, itemY - this.listHeight + this.itemHeight);
        break;
    }

    return this;
  }

  /**
   * Sets the selection changed callback.
   *
   * @param callback - Callback function
   *
   * @example
   * ```typescript
   * list.onSelectionChanged((indices, items) => {
   *   console.log(`Selected ${indices.length} items`);
   * });
   * ```
   */
  onSelectionChanged(callback: (indices: number[], items: T[]) => void): this {
    this._selectionChangedCallback = callback;
    return this;
  }

  /**
   * Sets the item clicked callback.
   *
   * @param callback - Callback function
   */
  onItemClicked(callback: (index: number, item: T) => void): this {
    this._itemClickedCallback = callback;
    return this;
  }

  /**
   * Updates the visible range based on scroll position.
   */
  protected updateVisibleRange(): void {
    const scrollY = this._scrollView.scrollPosition.y;
    this._visibleStartIndex = Math.max(0, Math.floor(scrollY / this.itemHeight) - this.overscanCount);
    this._visibleEndIndex = Math.min(
      this._items.length - 1,
      Math.ceil((scrollY + this.listHeight) / this.itemHeight) + this.overscanCount
    );
  }

  /**
   * Gets the item index at a position.
   */
  protected getItemIndexAtPosition(localY: number): number {
    const scrollY = this._scrollView.scrollPosition.y;
    const itemY = scrollY + localY;
    return Math.floor(itemY / this.itemHeight);
  }

  /**
   * Handles click event.
   */
  protected handleClick(event: UIEvent): void {
    const localPos = this.worldToLocal(event.position);
    const index = this.getItemIndexAtPosition(localPos.y);

    if (index >= 0 && index < this._items.length) {
      this.toggleSelection(index);

      if (this._itemClickedCallback) {
        this._itemClickedCallback(index, this._items[index]);
      }
    }
  }

  /**
   * Handles pointer move event.
   */
  protected handlePointerMove(event: UIEvent): void {
    const localPos = this.worldToLocal(event.position);
    const index = this.getItemIndexAtPosition(localPos.y);

    if (index >= 0 && index < this._items.length) {
      this._hoveredIndex = index;
    } else {
      this._hoveredIndex = -1;
    }
  }

  /**
   * Handles pointer leave event.
   */
  protected handlePointerLeave(event: UIEvent): void {
    this._hoveredIndex = -1;
  }

  /**
   * Updates the list view.
   */
  override update(deltaTime: number): void {
    super.update(deltaTime);
    this.updateVisibleRange();
  }

  /**
   * Renders the list view.
   */
  override render(context: CanvasRenderingContext2D): void {
    if (!this.visible || this.worldAlpha <= 0) {
      return;
    }

    const pos = this.worldPosition;
    const alpha = this.worldAlpha;

    context.save();
    context.globalAlpha = alpha;

    const x = pos.x - this.listWidth * this.pivot.x;
    const y = pos.y - this.listHeight * this.pivot.y;

    // Draw background
    context.fillStyle = this.backgroundColor.toCSSString();
    context.fillRect(x, y, this.listWidth, this.listHeight);

    // Setup clipping
    context.save();
    context.beginPath();
    context.rect(x, y, this.listWidth, this.listHeight);
    context.clip();

    const scrollY = this._scrollView.scrollPosition.y;

    // Render only visible items (virtualization)
    for (let i = this._visibleStartIndex; i <= this._visibleEndIndex; i++) {
      if (i < 0 || i >= this._items.length) {
        continue;
      }

      const item = this._items[i];
      const itemY = y + i * this.itemHeight - scrollY;
      const isSelected = this._selectedIndices.has(i);
      const isHovered = i === this._hoveredIndex;

      // Default rendering if no custom renderer
      if (!this._renderer) {
        // Draw background
        let bgColor = this.backgroundColor;
        if (isSelected) {
          bgColor = this.selectedColor;
        } else if (isHovered) {
          bgColor = this.hoverColor;
        } else if (this.alternatingRows && i % 2 === 1) {
          bgColor = this.alternateColor;
        }

        context.fillStyle = bgColor.toCSSString();
        context.fillRect(x, itemY, this.listWidth, this.itemHeight);

        // Draw text (simple string representation)
        context.fillStyle = '#000000';
        context.font = '14px sans-serif';
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.fillText(String(item), x + 10, itemY + this.itemHeight / 2);
      } else {
        // Use custom renderer
        this._renderer(item, i, context, x, itemY, this.listWidth, this.itemHeight, isSelected, isHovered);
      }
    }

    context.restore();

    // Draw scrollbar (simple indicator)
    if (this._items.length * this.itemHeight > this.listHeight) {
      const scrollbarHeight = (this.listHeight / (this._items.length * this.itemHeight)) * this.listHeight;
      const scrollbarY = (scrollY / (this._items.length * this.itemHeight - this.listHeight)) * (this.listHeight - scrollbarHeight);

      context.fillStyle = 'rgba(0, 0, 0, 0.3)';
      context.fillRect(x + this.listWidth - 6, y + scrollbarY, 4, scrollbarHeight);
    }

    context.restore();
  }

  /**
   * Sets the list view size.
   *
   * @param width - List width
   * @param height - List height
   */
  setSize(width: number, height: number): this {
    this.listWidth = width;
    this.listHeight = height;
    this.size.set(width, height);
    this._scrollView.size.set(width, height);
    this.updateVisibleRange();
    return this;
  }
}
