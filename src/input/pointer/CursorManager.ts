/**
 * CursorManager - Cursor management and custom cursor support
 *
 * Provides comprehensive cursor management including built-in CSS cursors,
 * custom image cursors, cursor visibility control, and cursor stack for
 * managing temporary cursor changes.
 *
 * @module input/pointer/CursorManager
 *
 * @example
 * ```typescript
 * const cursorManager = new CursorManager();
 * cursorManager.attach(canvas);
 *
 * // Set cursor
 * cursorManager.set('crosshair');
 *
 * // Use custom cursor
 * cursorManager.setCustom('cursor.png', 16, 16);
 *
 * // Hide cursor
 * cursorManager.hide();
 *
 * // Push/pop cursor stack
 * cursorManager.push('pointer');
 * // ... do something
 * cursorManager.pop();
 * ```
 */

import { Logger } from '../../core/Logger';

const logger = new Logger('CursorManager');

/**
 * Standard CSS cursor types
 */
export type CursorType =
  | 'auto'
  | 'default'
  | 'none'
  | 'context-menu'
  | 'help'
  | 'pointer'
  | 'progress'
  | 'wait'
  | 'cell'
  | 'crosshair'
  | 'text'
  | 'vertical-text'
  | 'alias'
  | 'copy'
  | 'move'
  | 'no-drop'
  | 'not-allowed'
  | 'grab'
  | 'grabbing'
  | 'all-scroll'
  | 'col-resize'
  | 'row-resize'
  | 'n-resize'
  | 's-resize'
  | 'e-resize'
  | 'w-resize'
  | 'ne-resize'
  | 'nw-resize'
  | 'se-resize'
  | 'sw-resize'
  | 'ew-resize'
  | 'ns-resize'
  | 'nesw-resize'
  | 'nwse-resize'
  | 'zoom-in'
  | 'zoom-out';

/**
 * Custom cursor configuration
 */
export interface CustomCursorConfig {
  /**
   * Cursor image URL or data URL
   */
  url: string;

  /**
   * Hotspot X coordinate
   */
  hotspotX: number;

  /**
   * Hotspot Y coordinate
   */
  hotspotY: number;

  /**
   * Fallback cursor type
   */
  fallback?: CursorType;
}

/**
 * Cursor stack entry
 */
interface CursorStackEntry {
  /**
   * Cursor CSS value
   */
  cursor: string;

  /**
   * Entry timestamp
   */
  timestamp: number;
}

/**
 * Cursor manager for controlling and customizing the mouse cursor.
 *
 * @example
 * ```typescript
 * const cursorManager = new CursorManager();
 * cursorManager.attach(canvas);
 *
 * // Set standard cursor
 * cursorManager.set('pointer');
 *
 * // Set custom cursor
 * cursorManager.setCustom('assets/cursor-aim.png', 16, 16);
 *
 * // Hide cursor
 * cursorManager.hide();
 *
 * // Show cursor
 * cursorManager.show();
 *
 * // Temporary cursor change
 * cursorManager.push('grabbing');
 * // ... dragging
 * cursorManager.pop();
 *
 * // Reset to default
 * cursorManager.reset();
 * ```
 */
export class CursorManager {
  /**
   * Target element
   */
  private target: HTMLElement | null = null;

  /**
   * Whether attached to element
   */
  private attached: boolean = false;

  /**
   * Current cursor CSS value
   */
  private currentCursor: string = 'default';

  /**
   * Whether cursor is currently visible
   */
  private visible: boolean = true;

  /**
   * Cursor stack for temporary changes
   */
  private cursorStack: CursorStackEntry[] = [];

  /**
   * Loaded custom cursors cache
   */
  private customCursors: Map<string, string> = new Map();

  /**
   * Creates a new cursor manager.
   *
   * @example
   * ```typescript
   * const cursorManager = new CursorManager();
   * ```
   */
  constructor() {
    logger.debug('CursorManager created');
  }

  /**
   * Attaches cursor manager to a target element.
   *
   * @param target - Target element
   *
   * @example
   * ```typescript
   * cursorManager.attach(canvas);
   * ```
   */
  attach(target: HTMLElement): void {
    if (this.attached) {
      logger.warn('CursorManager already attached');
      this.detach();
    }

    this.target = target;
    this.target.style.cursor = this.currentCursor;

    this.attached = true;
    logger.debug('CursorManager attached');
  }

  /**
   * Detaches cursor manager.
   *
   * @example
   * ```typescript
   * cursorManager.detach();
   * ```
   */
  detach(): void {
    if (!this.attached || !this.target) {
      return;
    }

    this.target.style.cursor = 'default';
    this.target = null;
    this.attached = false;
    logger.debug('CursorManager detached');
  }

  /**
   * Sets the cursor to a standard CSS cursor type.
   *
   * @param cursor - Cursor type
   *
   * @example
   * ```typescript
   * cursorManager.set('crosshair');
   * cursorManager.set('pointer');
   * cursorManager.set('grab');
   * ```
   */
  set(cursor: CursorType): void {
    this.setCursorValue(cursor);
  }

  /**
   * Sets a custom cursor image.
   *
   * @param url - Image URL or data URL
   * @param hotspotX - Hotspot X coordinate
   * @param hotspotY - Hotspot Y coordinate
   * @param fallback - Fallback cursor type
   *
   * @example
   * ```typescript
   * cursorManager.setCustom('cursor-aim.png', 16, 16, 'crosshair');
   * cursorManager.setCustom('data:image/png;base64,...', 0, 0);
   * ```
   */
  setCustom(
    url: string,
    hotspotX: number = 0,
    hotspotY: number = 0,
    fallback: CursorType = 'default'
  ): void {
    const cacheKey = `${url}:${hotspotX}:${hotspotY}`;

    let cursorValue = this.customCursors.get(cacheKey);
    if (!cursorValue) {
      cursorValue = `url('${url}') ${hotspotX} ${hotspotY}, ${fallback}`;
      this.customCursors.set(cacheKey, cursorValue);
    }

    this.setCursorValue(cursorValue);
  }

  /**
   * Sets a custom cursor from configuration.
   *
   * @param config - Custom cursor configuration
   *
   * @example
   * ```typescript
   * cursorManager.setCustomConfig({
   *   url: 'cursor.png',
   *   hotspotX: 16,
   *   hotspotY: 16,
   *   fallback: 'crosshair'
   * });
   * ```
   */
  setCustomConfig(config: CustomCursorConfig): void {
    this.setCustom(config.url, config.hotspotX, config.hotspotY, config.fallback);
  }

  /**
   * Hides the cursor.
   *
   * @example
   * ```typescript
   * cursorManager.hide();
   * ```
   */
  hide(): void {
    if (!this.visible) {
      return;
    }

    this.visible = false;
    this.setCursorValue('none');
    logger.debug('Cursor hidden');
  }

  /**
   * Shows the cursor.
   *
   * @example
   * ```typescript
   * cursorManager.show();
   * ```
   */
  show(): void {
    if (this.visible) {
      return;
    }

    this.visible = true;
    this.applyCursor();
    logger.debug('Cursor shown');
  }

  /**
   * Toggles cursor visibility.
   *
   * @returns New visibility state
   *
   * @example
   * ```typescript
   * const visible = cursorManager.toggle();
   * console.log(`Cursor ${visible ? 'visible' : 'hidden'}`);
   * ```
   */
  toggle(): boolean {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
    return this.visible;
  }

  /**
   * Pushes a cursor onto the stack.
   * Useful for temporary cursor changes.
   *
   * @param cursor - Cursor type
   *
   * @example
   * ```typescript
   * // Save current cursor and set new one
   * cursorManager.push('grabbing');
   * // ... dragging operation
   * cursorManager.pop();
   * ```
   */
  push(cursor: CursorType): void {
    this.cursorStack.push({
      cursor: this.currentCursor,
      timestamp: performance.now()
    });

    this.setCursorValue(cursor);
    logger.debug(`Pushed cursor: ${cursor}`);
  }

  /**
   * Pushes a custom cursor onto the stack.
   *
   * @param url - Image URL
   * @param hotspotX - Hotspot X
   * @param hotspotY - Hotspot Y
   * @param fallback - Fallback cursor
   *
   * @example
   * ```typescript
   * cursorManager.pushCustom('cursor-drag.png', 16, 16, 'grab');
   * // ... operation
   * cursorManager.pop();
   * ```
   */
  pushCustom(
    url: string,
    hotspotX: number = 0,
    hotspotY: number = 0,
    fallback: CursorType = 'default'
  ): void {
    this.cursorStack.push({
      cursor: this.currentCursor,
      timestamp: performance.now()
    });

    this.setCustom(url, hotspotX, hotspotY, fallback);
    logger.debug(`Pushed custom cursor: ${url}`);
  }

  /**
   * Pops a cursor from the stack.
   *
   * @returns True if cursor was popped
   *
   * @example
   * ```typescript
   * cursorManager.push('grabbing');
   * // ... operation
   * cursorManager.pop();
   * ```
   */
  pop(): boolean {
    if (this.cursorStack.length === 0) {
      logger.warn('Cursor stack is empty');
      return false;
    }

    const entry = this.cursorStack.pop()!;
    this.setCursorValue(entry.cursor);
    logger.debug(`Popped cursor`);
    return true;
  }

  /**
   * Clears the cursor stack.
   *
   * @example
   * ```typescript
   * cursorManager.clearStack();
   * ```
   */
  clearStack(): void {
    this.cursorStack.length = 0;
    logger.debug('Cursor stack cleared');
  }

  /**
   * Gets the current cursor CSS value.
   *
   * @returns Current cursor value
   *
   * @example
   * ```typescript
   * const cursor = cursorManager.getCursor();
   * console.log(`Current cursor: ${cursor}`);
   * ```
   */
  getCursor(): string {
    return this.currentCursor;
  }

  /**
   * Checks if cursor is currently visible.
   *
   * @returns True if visible
   *
   * @example
   * ```typescript
   * if (cursorManager.isVisible()) {
   *   console.log('Cursor is visible');
   * }
   * ```
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Gets the size of the cursor stack.
   *
   * @returns Stack size
   *
   * @example
   * ```typescript
   * const stackSize = cursorManager.getStackSize();
   * ```
   */
  getStackSize(): number {
    return this.cursorStack.length;
  }

  /**
   * Resets cursor to default state.
   *
   * @example
   * ```typescript
   * cursorManager.reset();
   * ```
   */
  reset(): void {
    this.cursorStack.length = 0;
    this.visible = true;
    this.setCursorValue('default');
    logger.debug('Cursor reset to default');
  }

  /**
   * Preloads a custom cursor image.
   *
   * @param url - Image URL
   * @param hotspotX - Hotspot X
   * @param hotspotY - Hotspot Y
   * @param fallback - Fallback cursor
   * @returns Promise that resolves when loaded
   *
   * @example
   * ```typescript
   * await cursorManager.preload('cursor-aim.png', 16, 16, 'crosshair');
   * console.log('Cursor preloaded');
   * ```
   */
  async preload(
    url: string,
    hotspotX: number = 0,
    hotspotY: number = 0,
    fallback: CursorType = 'default'
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        const cacheKey = `${url}:${hotspotX}:${hotspotY}`;
        const cursorValue = `url('${url}') ${hotspotX} ${hotspotY}, ${fallback}`;
        this.customCursors.set(cacheKey, cursorValue);
        logger.debug(`Preloaded cursor: ${url}`);
        resolve();
      };

      img.onerror = () => {
        logger.error(`Failed to preload cursor: ${url}`);
        reject(new Error(`Failed to load cursor image: ${url}`));
      };

      img.src = url;
    });
  }

  /**
   * Preloads multiple custom cursors.
   *
   * @param cursors - Array of cursor configurations
   * @returns Promise that resolves when all loaded
   *
   * @example
   * ```typescript
   * await cursorManager.preloadMultiple([
   *   { url: 'cursor-aim.png', hotspotX: 16, hotspotY: 16 },
   *   { url: 'cursor-grab.png', hotspotX: 8, hotspotY: 8 }
   * ]);
   * ```
   */
  async preloadMultiple(cursors: CustomCursorConfig[]): Promise<void> {
    await Promise.all(
      cursors.map(config =>
        this.preload(config.url, config.hotspotX, config.hotspotY, config.fallback)
      )
    );
  }

  /**
   * Sets the cursor CSS value.
   *
   * @param cursor - Cursor CSS value
   * @private
   */
  private setCursorValue(cursor: string): void {
    this.currentCursor = cursor;

    if (this.visible) {
      this.applyCursor();
    }
  }

  /**
   * Applies the current cursor to the target element.
   *
   * @private
   */
  private applyCursor(): void {
    if (this.target) {
      this.target.style.cursor = this.currentCursor;
    }
  }

  /**
   * Checks if attached.
   *
   * @returns True if attached
   */
  isAttached(): boolean {
    return this.attached;
  }

  /**
   * Disposes the cursor manager.
   *
   * @example
   * ```typescript
   * cursorManager.dispose();
   * ```
   */
  dispose(): void {
    this.detach();
    this.customCursors.clear();
    this.cursorStack.length = 0;
    logger.debug('CursorManager disposed');
  }
}

/**
 * Predefined cursor configurations for common game scenarios
 */
export const GameCursors = {
  /**
   * FPS crosshair
   */
  FPS_CROSSHAIR: {
    type: 'crosshair' as CursorType
  },

  /**
   * Strategy game pointer
   */
  STRATEGY_POINTER: {
    type: 'pointer' as CursorType
  },

  /**
   * Grab/drag cursor
   */
  GRAB: {
    type: 'grab' as CursorType
  },

  /**
   * Grabbing/dragging cursor
   */
  GRABBING: {
    type: 'grabbing' as CursorType
  },

  /**
   * Hidden cursor (for FPS games)
   */
  HIDDEN: {
    type: 'none' as CursorType
  },

  /**
   * Loading/wait cursor
   */
  LOADING: {
    type: 'wait' as CursorType
  }
} as const;
