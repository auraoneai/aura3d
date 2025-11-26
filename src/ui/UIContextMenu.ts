/**
 * @fileoverview Context menu system for right-click interactions.
 * @module ui/UIContextMenu
 */

import { UIElement, UIEvent, UIEventType } from './UIElement';
import { UICanvas } from './UICanvas';
import { Color } from '../math/Color';
import { Vector2 } from '../math/Vector2';
import { Logger } from '../core/Logger';

const logger = Logger.create('UIContextMenu');

/**
 * Context menu item configuration
 */
export interface ContextMenuItem {
  /** Item label */
  label: string;
  /** Item icon (optional) */
  icon?: string;
  /** Click callback */
  action?: () => void;
  /** Whether item is disabled */
  disabled?: boolean;
  /** Submenu items */
  submenu?: ContextMenuItem[];
  /** Separator flag */
  separator?: boolean;
  /** Keyboard shortcut display */
  shortcut?: string;
}

/**
 * Context menu system for right-click menus and popup menus.
 * Supports nested submenus, keyboard shortcuts, and custom styling.
 *
 * @example
 * ```typescript
 * // Create context menu system
 * const contextMenu = new UIContextMenuSystem(canvas);
 *
 * // Register context menu for element
 * contextMenu.register(element, [
 *   { label: 'Copy', action: () => copy(), shortcut: 'Ctrl+C' },
 *   { label: 'Paste', action: () => paste(), shortcut: 'Ctrl+V' },
 *   { separator: true },
 *   {
 *     label: 'More',
 *     submenu: [
 *       { label: 'Option 1', action: () => {} },
 *       { label: 'Option 2', action: () => {} }
 *     ]
 *   }
 * ]);
 *
 * // Show menu programmatically
 * contextMenu.show(items, new Vector2(100, 100));
 * ```
 */
export class UIContextMenuSystem {
  /**
   * Associated UI canvas
   */
  protected canvas: UICanvas;

  /**
   * Registered context menus per element
   */
  protected _contextMenus: Map<UIElement, ContextMenuItem[]> = new Map();

  /**
   * Current menu display
   */
  protected _menuDisplay: UIElement | null = null;

  /**
   * Current menu items
   */
  protected _currentItems: ContextMenuItem[] = [];

  /**
   * Menu background color
   */
  public backgroundColor: Color = Color.white();

  /**
   * Menu border color
   */
  public borderColor: Color = Color.fromHex(0xCCCCCC);

  /**
   * Menu text color
   */
  public textColor: Color = Color.fromHex(0x333333);

  /**
   * Menu hover color
   */
  public hoverColor: Color = Color.fromHex(0xE3F2FD);

  /**
   * Disabled text color
   */
  public disabledColor: Color = Color.fromHex(0xAAAAAA);

  /**
   * Menu font
   */
  public font: string = '14px Arial';

  /**
   * Menu item height
   */
  public itemHeight: number = 32;

  /**
   * Menu padding
   */
  public padding: number = 4;

  /**
   * Menu shadow enabled
   */
  public enableShadow: boolean = true;

  /**
   * Menu shadow offset
   */
  public shadowOffset: Vector2 = new Vector2(0, 2);

  /**
   * Menu shadow blur
   */
  public shadowBlur: number = 8;

  /**
   * Menu shadow color
   */
  public shadowColor: Color = new Color(0, 0, 0, 0.2);

  /**
   * Minimum menu width
   */
  public minWidth: number = 150;

  /**
   * Hovered item index
   */
  protected _hoveredIndex: number = -1;

  /**
   * Whether menu is showing
   */
  protected _isShowing: boolean = false;

  /**
   * Creates a new context menu system.
   *
   * @param canvas - UI canvas
   *
   * @example
   * ```typescript
   * const contextMenu = new UIContextMenuSystem(myCanvas);
   * ```
   */
  constructor(canvas: UICanvas) {
    this.canvas = canvas;
    this.setupEventListeners();
  }

  /**
   * Sets up event listeners.
   */
  protected setupEventListeners(): void {
    // Listen for right-click on canvas
    this.canvas.htmlCanvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.handleContextMenu(e);
    });

    // Close menu on any click
    this.canvas.htmlCanvas.addEventListener('click', () => {
      this.hide();
    });

    // Close menu on escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isShowing) {
        this.hide();
      }
    });
  }

  /**
   * Registers a context menu for an element.
   *
   * @param element - Target element
   * @param items - Menu items
   */
  register(element: UIElement, items: ContextMenuItem[]): void {
    this._contextMenus.set(element, items);
  }

  /**
   * Unregisters a context menu.
   *
   * @param element - Target element
   */
  unregister(element: UIElement): void {
    this._contextMenus.delete(element);
  }

  /**
   * Handles context menu event.
   */
  protected handleContextMenu(event: MouseEvent): void {
    const rect = this.canvas.htmlCanvas.getBoundingClientRect();
    const position = new Vector2(
      event.clientX - rect.left,
      event.clientY - rect.top
    );

    // Find element under cursor
    const element = this.findElementAt(position);
    if (element) {
      const items = this._contextMenus.get(element);
      if (items) {
        this.show(items, position);
      }
    }
  }

  /**
   * Finds element at position.
   */
  protected findElementAt(position: Vector2): UIElement | null {
    // Simple implementation - could use canvas's findElementAt
    return this.findElementAtRecursive(this.canvas as UIElement, position);
  }

  /**
   * Recursively finds element at position.
   */
  protected findElementAtRecursive(element: UIElement, position: Vector2): UIElement | null {
    if (!element.visible || !element.enabled) {
      return null;
    }

    const children = [...element.children].sort((a, b) => b.zIndex - a.zIndex);

    for (const child of children) {
      const found = this.findElementAtRecursive(child, position);
      if (found) return found;
    }

    if (element.interactive && element.containsPoint(position)) {
      return element;
    }

    return null;
  }

  /**
   * Shows a context menu.
   *
   * @param items - Menu items
   * @param position - Position to show menu
   */
  show(items: ContextMenuItem[], position: Vector2): void {
    this._currentItems = items;
    this._isShowing = true;
    this._hoveredIndex = -1;

    // Create menu display if needed
    if (!this._menuDisplay) {
      this._menuDisplay = new UIElement('ContextMenu');
      this._menuDisplay.interactive = true;
      this._menuDisplay.blockPointer = true;
      this._menuDisplay.zIndex = 10001;
      this.canvas.addChild(this._menuDisplay);
    }

    // Calculate menu size
    const width = this.calculateMenuWidth(items);
    const height = this.calculateMenuHeight(items);

    // Position menu (ensure it stays in bounds)
    const canvasBounds = this.canvas.localBounds;
    let x = position.x;
    let y = position.y;

    if (x + width > canvasBounds.width) {
      x = canvasBounds.width - width - this.padding;
    }
    if (y + height > canvasBounds.height) {
      y = canvasBounds.height - height - this.padding;
    }

    this._menuDisplay.position.set(x, y);
    this._menuDisplay.size.set(width, height);
    this._menuDisplay.visible = true;

    // Setup menu interaction
    this._menuDisplay.addEventListener(UIEventType.PointerMove, this.handleMenuMove.bind(this));
    this._menuDisplay.addEventListener(UIEventType.Click, this.handleMenuClick.bind(this));

    logger.debug(`Context menu shown at (${x}, ${y}) with ${items.length} items`);
  }

  /**
   * Hides the context menu.
   */
  hide(): void {
    if (this._menuDisplay) {
      this._menuDisplay.visible = false;
    }

    this._isShowing = false;
    this._hoveredIndex = -1;
    this._currentItems = [];
  }

  /**
   * Calculates menu width.
   */
  protected calculateMenuWidth(items: ContextMenuItem[]): number {
    // Simple calculation - could measure text
    return Math.max(this.minWidth, 200);
  }

  /**
   * Calculates menu height.
   */
  protected calculateMenuHeight(items: ContextMenuItem[]): number {
    return items.length * this.itemHeight + this.padding * 2;
  }

  /**
   * Handles menu pointer move.
   */
  protected handleMenuMove(event: UIEvent): void {
    const localY = event.localPosition.y - this.padding;
    this._hoveredIndex = Math.floor(localY / this.itemHeight);

    if (this._hoveredIndex < 0 || this._hoveredIndex >= this._currentItems.length) {
      this._hoveredIndex = -1;
    }
  }

  /**
   * Handles menu click.
   */
  protected handleMenuClick(event: UIEvent): void {
    if (this._hoveredIndex >= 0 && this._hoveredIndex < this._currentItems.length) {
      const item = this._currentItems[this._hoveredIndex];

      if (!item.disabled && !item.separator && item.action) {
        item.action();
        this.hide();
        logger.debug(`Menu item clicked: ${item.label}`);
      }
    }
  }

  /**
   * Renders the context menu.
   */
  render(context: CanvasRenderingContext2D): void {
    if (!this._menuDisplay || !this._menuDisplay.visible || this._currentItems.length === 0) {
      return;
    }

    const pos = this._menuDisplay.worldPosition;
    const size = this._menuDisplay.size;

    context.save();

    // Draw shadow
    if (this.enableShadow) {
      context.shadowColor = this.shadowColor.toCSSString();
      context.shadowBlur = this.shadowBlur;
      context.shadowOffsetX = this.shadowOffset.x;
      context.shadowOffsetY = this.shadowOffset.y;
    }

    // Draw background
    context.fillStyle = this.backgroundColor.toCSSString();
    context.fillRect(pos.x, pos.y, size.x, size.y);

    // Reset shadow
    if (this.enableShadow) {
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;
    }

    // Draw border
    context.strokeStyle = this.borderColor.toCSSString();
    context.lineWidth = 1;
    context.strokeRect(pos.x, pos.y, size.x, size.y);

    // Draw items
    context.font = this.font;
    let y = pos.y + this.padding;

    for (let i = 0; i < this._currentItems.length; i++) {
      const item = this._currentItems[i];

      if (item.separator) {
        // Draw separator
        const separatorY = y + this.itemHeight * 0.5;
        context.strokeStyle = this.borderColor.toCSSString();
        context.beginPath();
        context.moveTo(pos.x + this.padding, separatorY);
        context.lineTo(pos.x + size.x - this.padding, separatorY);
        context.stroke();
      } else {
        // Draw hover background
        if (i === this._hoveredIndex && !item.disabled) {
          context.fillStyle = this.hoverColor.toCSSString();
          context.fillRect(pos.x + this.padding, y, size.x - this.padding * 2, this.itemHeight);
        }

        // Draw text
        const textColor = item.disabled ? this.disabledColor : this.textColor;
        context.fillStyle = textColor.toCSSString();
        context.textAlign = 'left';
        context.textBaseline = 'middle';

        const textX = pos.x + this.padding * 2;
        const textY = y + this.itemHeight * 0.5;

        context.fillText(item.label, textX, textY);

        // Draw shortcut
        if (item.shortcut) {
          context.textAlign = 'right';
          context.fillStyle = this.disabledColor.toCSSString();
          context.fillText(item.shortcut, pos.x + size.x - this.padding * 2, textY);
        }

        // Draw submenu indicator
        if (item.submenu) {
          context.textAlign = 'right';
          context.fillText('>', pos.x + size.x - this.padding * 2, textY);
        }
      }

      y += this.itemHeight;
    }

    context.restore();
  }

  /**
   * Updates the context menu system.
   */
  update(deltaTime: number): void {
    // Handle submenu logic, animations, etc.
  }

  /**
   * Clears all context menus.
   */
  clear(): void {
    this._contextMenus.clear();
    this.hide();
  }

  /**
   * Destroys the context menu system.
   */
  destroy(): void {
    this.clear();

    if (this._menuDisplay) {
      this._menuDisplay.removeFromParent();
      this._menuDisplay = null;
    }
  }
}
