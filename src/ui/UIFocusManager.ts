/**
 * @fileoverview Focus management system with tab order and focus trapping.
 * @module ui/UIFocusManager
 */

import { UIElement } from './UIElement';
import { UICanvas } from './UICanvas';
import { Logger } from '../core/Logger';

const logger = Logger.create('UIFocusManager');

/**
 * Focus trap region
 */
export interface FocusTrap {
  /** Root element of the trap */
  root: UIElement;
  /** Whether the trap is active */
  active: boolean;
  /** Focusable elements within trap */
  elements: UIElement[];
  /** Previous focus before trap */
  previousFocus: UIElement | null;
}

/**
 * Focus management system for controlling keyboard focus, tab order, and focus trapping.
 * Essential for modal dialogs, dropdown menus, and accessible navigation.
 *
 * @example
 * ```typescript
 * // Create focus manager
 * const focusManager = new UIFocusManager(canvas);
 *
 * // Set custom tab order
 * focusManager.setTabOrder([button1, input1, button2, button3]);
 *
 * // Create focus trap for modal
 * const modal = new Panel();
 * focusManager.createTrap(modal);
 * focusManager.activateTrap(modal);
 *
 * // Later: release trap
 * focusManager.releaseTrap(modal);
 * ```
 */
export class UIFocusManager {
  /**
   * Associated UI canvas
   */
  protected canvas: UICanvas;

  /**
   * Custom tab order (overrides automatic ordering)
   */
  protected _customTabOrder: UIElement[] | null = null;

  /**
   * Active focus traps stack
   */
  protected _focusTraps: FocusTrap[] = [];

  /**
   * Focus history for restoration
   */
  protected _focusHistory: UIElement[] = [];

  /**
   * Maximum history size
   */
  public maxHistorySize: number = 10;

  /**
   * Whether to highlight focused elements
   */
  public highlightFocus: boolean = true;

  /**
   * Focus highlight color
   */
  public highlightColor: string = '#2196F3';

  /**
   * Focus highlight width
   */
  public highlightWidth: number = 2;

  /**
   * Creates a new focus manager.
   *
   * @param canvas - UI canvas to manage
   *
   * @example
   * ```typescript
   * const focusManager = new UIFocusManager(myCanvas);
   * ```
   */
  constructor(canvas: UICanvas) {
    this.canvas = canvas;
  }

  /**
   * Gets the currently focused element.
   */
  get focused(): UIElement | null {
    return this.canvas.focusedElement;
  }

  /**
   * Sets focus to an element.
   *
   * @param element - Element to focus
   * @param addToHistory - Whether to add to history
   */
  focus(element: UIElement | null, addToHistory: boolean = true): void {
    const current = this.canvas.focusedElement;

    // Add to history
    if (addToHistory && current && current !== element) {
      this._focusHistory.push(current);
      if (this._focusHistory.length > this.maxHistorySize) {
        this._focusHistory.shift();
      }
    }

    // Check if element is within active trap
    if (element && this._focusTraps.length > 0) {
      const activeTrap = this._focusTraps[this._focusTraps.length - 1];
      if (!this.isWithinTrap(element, activeTrap)) {
        logger.warn(`Cannot focus element outside of focus trap: ${element.name}`);
        return;
      }
    }

    this.canvas.setFocus(element);
    logger.debug(`Focused: ${element?.name ?? 'null'}`);
  }

  /**
   * Focuses the next element in tab order.
   */
  focusNext(): void {
    const elements = this.getFocusableElements();
    if (elements.length === 0) return;

    const current = this.canvas.focusedElement;
    let index = current ? elements.indexOf(current) : -1;

    index = (index + 1) % elements.length;
    this.focus(elements[index]);
  }

  /**
   * Focuses the previous element in tab order.
   */
  focusPrevious(): void {
    const elements = this.getFocusableElements();
    if (elements.length === 0) return;

    const current = this.canvas.focusedElement;
    let index = current ? elements.indexOf(current) : 0;

    index = (index - 1 + elements.length) % elements.length;
    this.focus(elements[index]);
  }

  /**
   * Focuses the first element.
   */
  focusFirst(): void {
    const elements = this.getFocusableElements();
    if (elements.length > 0) {
      this.focus(elements[0]);
    }
  }

  /**
   * Focuses the last element.
   */
  focusLast(): void {
    const elements = this.getFocusableElements();
    if (elements.length > 0) {
      this.focus(elements[elements.length - 1]);
    }
  }

  /**
   * Restores focus to previous element.
   */
  restoreFocus(): void {
    if (this._focusHistory.length > 0) {
      const previous = this._focusHistory.pop();
      if (previous) {
        this.focus(previous, false);
      }
    }
  }

  /**
   * Gets focusable elements in tab order.
   */
  protected getFocusableElements(): UIElement[] {
    // Check for active trap
    if (this._focusTraps.length > 0) {
      const activeTrap = this._focusTraps[this._focusTraps.length - 1];
      if (activeTrap.active) {
        return activeTrap.elements.filter(e => e.visible && e.enabled && e.interactive);
      }
    }

    // Use custom tab order if set
    if (this._customTabOrder) {
      return this._customTabOrder.filter(e => e.visible && e.enabled && e.interactive);
    }

    // Build automatic tab order
    return this.buildTabOrder();
  }

  /**
   * Builds automatic tab order from element hierarchy.
   */
  protected buildTabOrder(): UIElement[] {
    const elements: UIElement[] = [];
    this.collectFocusableElements(this.canvas as UIElement, elements);

    // Sort by visual position (top to bottom, left to right)
    elements.sort((a, b) => {
      const aPos = a.worldPosition;
      const bPos = b.worldPosition;

      // Same row (within 10px)
      if (Math.abs(aPos.y - bPos.y) < 10) {
        return aPos.x - bPos.x;
      }
      return aPos.y - bPos.y;
    });

    return elements;
  }

  /**
   * Recursively collects focusable elements.
   */
  protected collectFocusableElements(element: UIElement, result: UIElement[]): void {
    if (element.interactive && element.visible && element.enabled) {
      result.push(element);
    }

    for (const child of element.children) {
      this.collectFocusableElements(child, result);
    }
  }

  /**
   * Sets custom tab order.
   *
   * @param elements - Ordered list of focusable elements
   */
  setTabOrder(elements: UIElement[]): void {
    this._customTabOrder = elements;
    logger.debug(`Custom tab order set with ${elements.length} elements`);
  }

  /**
   * Clears custom tab order (revert to automatic).
   */
  clearTabOrder(): void {
    this._customTabOrder = null;
    logger.debug('Custom tab order cleared');
  }

  /**
   * Creates a focus trap.
   *
   * @param root - Root element of the trap
   * @returns Focus trap object
   */
  createTrap(root: UIElement): FocusTrap {
    const elements: UIElement[] = [];
    this.collectFocusableElements(root, elements);

    const trap: FocusTrap = {
      root,
      active: false,
      elements,
      previousFocus: this.canvas.focusedElement
    };

    logger.debug(`Focus trap created for ${root.name} with ${elements.length} elements`);

    return trap;
  }

  /**
   * Activates a focus trap.
   *
   * @param rootOrTrap - Root element or trap object
   */
  activateTrap(rootOrTrap: UIElement | FocusTrap): void {
    const trap = rootOrTrap instanceof UIElement
      ? this.createTrap(rootOrTrap)
      : rootOrTrap;

    trap.active = true;
    trap.previousFocus = this.canvas.focusedElement;
    this._focusTraps.push(trap);

    // Focus first element in trap
    if (trap.elements.length > 0) {
      this.focus(trap.elements[0], false);
    }

    logger.debug(`Focus trap activated for ${trap.root.name}`);
  }

  /**
   * Releases the most recent focus trap.
   *
   * @param rootOrTrap - Optional specific trap to release
   */
  releaseTrap(rootOrTrap?: UIElement | FocusTrap): void {
    let trap: FocusTrap | undefined;

    if (rootOrTrap) {
      const root = rootOrTrap instanceof UIElement ? rootOrTrap : rootOrTrap.root;
      const index = this._focusTraps.findIndex(t => t.root === root);
      if (index !== -1) {
        trap = this._focusTraps.splice(index, 1)[0];
      }
    } else {
      trap = this._focusTraps.pop();
    }

    if (trap) {
      trap.active = false;

      // Restore previous focus
      if (trap.previousFocus) {
        this.focus(trap.previousFocus, false);
      }

      logger.debug(`Focus trap released for ${trap.root.name}`);
    }
  }

  /**
   * Checks if an element is within a trap.
   *
   * @param element - Element to check
   * @param trap - Focus trap
   * @returns True if element is within trap
   */
  protected isWithinTrap(element: UIElement, trap: FocusTrap): boolean {
    return trap.elements.includes(element);
  }

  /**
   * Clears all focus traps.
   */
  clearTraps(): void {
    while (this._focusTraps.length > 0) {
      this.releaseTrap();
    }
  }

  /**
   * Gets active focus trap.
   */
  getActiveTrap(): FocusTrap | null {
    return this._focusTraps.length > 0 ? this._focusTraps[this._focusTraps.length - 1] : null;
  }

  /**
   * Renders focus highlight.
   *
   * @param context - Rendering context
   */
  renderFocusHighlight(context: CanvasRenderingContext2D): void {
    if (!this.highlightFocus) return;

    const focused = this.canvas.focusedElement;
    if (!focused) return;

    const bounds = focused.worldBounds;

    context.save();
    context.strokeStyle = this.highlightColor;
    context.lineWidth = this.highlightWidth;
    context.setLineDash([4, 2]);
    context.strokeRect(
      bounds.x - this.highlightWidth,
      bounds.y - this.highlightWidth,
      bounds.width + this.highlightWidth * 2,
      bounds.height + this.highlightWidth * 2
    );
    context.setLineDash([]);
    context.restore();
  }

  /**
   * Destroys the focus manager.
   */
  destroy(): void {
    this.clearTraps();
    this._customTabOrder = null;
    this._focusHistory = [];
  }
}
