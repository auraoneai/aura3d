/**
 * @fileoverview Keyboard and gamepad navigation system for UI elements.
 * @module ui/UINavigation
 */

import { UIElement } from './UIElement';
import { UICanvas } from './UICanvas';
import { Vector2 } from '../math/Vector2';
import { Logger } from '../core/Logger';

const logger = Logger.create('UINavigation');

/**
 * Navigation direction
 */
export enum NavigationDirection {
  Up = 'up',
  Down = 'down',
  Left = 'left',
  Right = 'right'
}

/**
 * Navigation mode
 */
export enum NavigationMode {
  /** Automatic navigation based on spatial position */
  Automatic = 'automatic',
  /** Explicit navigation connections */
  Explicit = 'explicit',
  /** Tab order based navigation */
  TabOrder = 'tabOrder'
}

/**
 * Keyboard and gamepad navigation system for accessible UI interaction.
 * Enables users to navigate UI elements using arrow keys, tab, and gamepad controls.
 *
 * @example
 * ```typescript
 * // Setup navigation
 * const navigation = new UINavigation(canvas);
 * navigation.mode = NavigationMode.Automatic;
 * navigation.enable();
 *
 * // Set explicit navigation
 * button1.setNavigation(NavigationDirection.Right, button2);
 * button2.setNavigation(NavigationDirection.Left, button1);
 *
 * // Handle navigation events
 * navigation.on('navigate', (from, to, direction) => {
 *   console.log(`Navigated from ${from.name} to ${to.name}`);
 * });
 * ```
 */
export class UINavigation {
  /**
   * Associated UI canvas
   */
  protected canvas: UICanvas;

  /**
   * Navigation mode
   */
  public mode: NavigationMode;

  /**
   * Whether navigation is enabled
   */
  protected _enabled: boolean = false;

  /**
   * Explicit navigation map: element -> direction -> target
   */
  protected _explicitNav: Map<UIElement, Map<NavigationDirection, UIElement>> = new Map();

  /**
   * Tab order list
   */
  protected _tabOrder: UIElement[] = [];

  /**
   * Whether to wrap navigation at boundaries
   */
  public wrapNavigation: boolean = true;

  /**
   * Navigation sound enabled
   */
  public enableSound: boolean = false;

  /**
   * Gamepad polling enabled
   */
  public enableGamepad: boolean = true;

  /**
   * Gamepad deadzone
   */
  public gamepadDeadzone: number = 0.3;

  /**
   * Last gamepad state
   */
  protected _lastGamepadState: {
    axes: number[];
    buttons: boolean[];
  } | null = null;

  /**
   * Bound keyboard handler
   */
  protected _keyboardHandler: ((event: KeyboardEvent) => void) | null = null;

  /**
   * Navigation event listeners
   */
  protected _listeners: Map<string, Set<(...args: any[]) => void>> = new Map();

  /**
   * Creates a new UI navigation system.
   *
   * @param canvas - UI canvas to navigate
   *
   * @example
   * ```typescript
   * const navigation = new UINavigation(myCanvas);
   * navigation.enable();
   * ```
   */
  constructor(canvas: UICanvas) {
    this.canvas = canvas;
    this.mode = NavigationMode.Automatic;
  }

  /**
   * Gets whether navigation is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Enables navigation.
   */
  enable(): void {
    if (this._enabled) return;

    this._enabled = true;

    // Setup keyboard listener
    this._keyboardHandler = this.handleKeyboard.bind(this);
    window.addEventListener('keydown', this._keyboardHandler);

    logger.debug('Navigation enabled');
  }

  /**
   * Disables navigation.
   */
  disable(): void {
    if (!this._enabled) return;

    this._enabled = false;

    // Remove keyboard listener
    if (this._keyboardHandler) {
      window.removeEventListener('keydown', this._keyboardHandler);
      this._keyboardHandler = null;
    }

    logger.debug('Navigation disabled');
  }

  /**
   * Handles keyboard input.
   */
  protected handleKeyboard(event: KeyboardEvent): void {
    if (!this._enabled) return;

    let direction: NavigationDirection | null = null;

    switch (event.key) {
      case 'ArrowUp':
        direction = NavigationDirection.Up;
        break;
      case 'ArrowDown':
        direction = NavigationDirection.Down;
        break;
      case 'ArrowLeft':
        direction = NavigationDirection.Left;
        break;
      case 'ArrowRight':
        direction = NavigationDirection.Right;
        break;
      case 'Tab':
        this.navigateTab(!event.shiftKey);
        event.preventDefault();
        return;
      case 'Enter':
      case ' ':
        this.activateCurrentElement();
        event.preventDefault();
        return;
    }

    if (direction) {
      this.navigate(direction);
      event.preventDefault();
    }
  }

  /**
   * Navigates in a direction.
   *
   * @param direction - Navigation direction
   */
  navigate(direction: NavigationDirection): void {
    const current = this.canvas.focusedElement;
    if (!current) {
      // Focus first element
      this.focusFirstElement();
      return;
    }

    let next: UIElement | null = null;

    switch (this.mode) {
      case NavigationMode.Explicit:
        next = this.getExplicitNavigationTarget(current, direction);
        break;
      case NavigationMode.TabOrder:
        // Tab order doesn't use directional navigation
        break;
      case NavigationMode.Automatic:
        next = this.findNearestElement(current, direction);
        break;
    }

    if (next && next !== current) {
      this.canvas.setFocus(next);
      this.emit('navigate', current, next, direction);

      if (this.enableSound) {
        this.playNavigationSound();
      }

      logger.debug(`Navigated ${direction}: ${current.name} -> ${next.name}`);
    }
  }

  /**
   * Navigates using tab order.
   *
   * @param forward - Whether to navigate forward
   */
  protected navigateTab(forward: boolean): void {
    if (this._tabOrder.length === 0) {
      this.buildTabOrder();
    }

    const current = this.canvas.focusedElement;
    let nextIndex = 0;

    if (current) {
      const currentIndex = this._tabOrder.indexOf(current);
      if (currentIndex !== -1) {
        nextIndex = forward ? currentIndex + 1 : currentIndex - 1;

        if (this.wrapNavigation) {
          nextIndex = (nextIndex + this._tabOrder.length) % this._tabOrder.length;
        } else {
          nextIndex = Math.max(0, Math.min(this._tabOrder.length - 1, nextIndex));
        }
      }
    }

    if (this._tabOrder[nextIndex]) {
      this.canvas.setFocus(this._tabOrder[nextIndex]);
    }
  }

  /**
   * Gets explicit navigation target.
   */
  protected getExplicitNavigationTarget(
    element: UIElement,
    direction: NavigationDirection
  ): UIElement | null {
    const navMap = this._explicitNav.get(element);
    return navMap?.get(direction) ?? null;
  }

  /**
   * Finds nearest navigable element in a direction.
   */
  protected findNearestElement(
    from: UIElement,
    direction: NavigationDirection
  ): UIElement | null {
    const navigable = this.getNavigableElements();
    if (navigable.length === 0) return null;

    const fromPos = from.worldPosition;
    let best: UIElement | null = null;
    let bestScore = Infinity;

    for (const element of navigable) {
      if (element === from) continue;

      const toPos = element.worldPosition;
      const delta = new Vector2(toPos.x - fromPos.x, toPos.y - fromPos.y);

      // Check if element is in the right direction
      let isInDirection = false;
      let primaryDist = 0;
      let secondaryDist = 0;

      switch (direction) {
        case NavigationDirection.Up:
          isInDirection = delta.y < 0;
          primaryDist = -delta.y;
          secondaryDist = Math.abs(delta.x);
          break;
        case NavigationDirection.Down:
          isInDirection = delta.y > 0;
          primaryDist = delta.y;
          secondaryDist = Math.abs(delta.x);
          break;
        case NavigationDirection.Left:
          isInDirection = delta.x < 0;
          primaryDist = -delta.x;
          secondaryDist = Math.abs(delta.y);
          break;
        case NavigationDirection.Right:
          isInDirection = delta.x > 0;
          primaryDist = delta.x;
          secondaryDist = Math.abs(delta.y);
          break;
      }

      if (!isInDirection) continue;

      // Score: prefer primary direction, penalize secondary offset
      const score = primaryDist + secondaryDist * 2;

      if (score < bestScore) {
        bestScore = score;
        best = element;
      }
    }

    return best;
  }

  /**
   * Gets all navigable elements.
   */
  protected getNavigableElements(): UIElement[] {
    const elements: UIElement[] = [];
    this.collectNavigableElements(this.canvas as UIElement, elements);
    return elements;
  }

  /**
   * Recursively collects navigable elements.
   */
  protected collectNavigableElements(element: UIElement, result: UIElement[]): void {
    if (element.interactive && element.visible && element.enabled) {
      result.push(element);
    }

    for (const child of element.children) {
      this.collectNavigableElements(child, result);
    }
  }

  /**
   * Builds tab order from element hierarchy.
   */
  protected buildTabOrder(): void {
    this._tabOrder = this.getNavigableElements();
    // Sort by visual position (top to bottom, left to right)
    this._tabOrder.sort((a, b) => {
      const aPos = a.worldPosition;
      const bPos = b.worldPosition;

      if (Math.abs(aPos.y - bPos.y) < 10) {
        return aPos.x - bPos.x;
      }
      return aPos.y - bPos.y;
    });
  }

  /**
   * Sets explicit navigation for an element.
   *
   * @param element - Source element
   * @param direction - Navigation direction
   * @param target - Target element
   */
  setNavigation(
    element: UIElement,
    direction: NavigationDirection,
    target: UIElement
  ): void {
    let navMap = this._explicitNav.get(element);
    if (!navMap) {
      navMap = new Map();
      this._explicitNav.set(element, navMap);
    }
    navMap.set(direction, target);
  }

  /**
   * Focuses the first navigable element.
   */
  focusFirstElement(): void {
    const navigable = this.getNavigableElements();
    if (navigable.length > 0) {
      this.canvas.setFocus(navigable[0]);
    }
  }

  /**
   * Activates the currently focused element (simulates click).
   */
  protected activateCurrentElement(): void {
    const focused = this.canvas.focusedElement;
    if (focused) {
      // Dispatch click event
      this.emit('activate', focused);
      logger.debug(`Activated: ${focused.name}`);
    }
  }

  /**
   * Plays navigation sound.
   */
  protected playNavigationSound(): void {
    // Implement sound playback here
    // Could use Web Audio API
  }

  /**
   * Updates navigation (polls gamepad).
   */
  update(deltaTime: number): void {
    if (!this._enabled || !this.enableGamepad) return;

    // Poll gamepad state
    const gamepads = navigator.getGamepads();
    if (!gamepads || gamepads.length === 0) return;

    const gamepad = gamepads[0];
    if (!gamepad) return;

    // Check D-pad / left stick
    const axisX = gamepad.axes[0] ?? 0;
    const axisY = gamepad.axes[1] ?? 0;

    const wasLeft = this._lastGamepadState?.axes[0] ?? 0 < -this.gamepadDeadzone;
    const wasRight = this._lastGamepadState?.axes[0] ?? 0 > this.gamepadDeadzone;
    const wasUp = this._lastGamepadState?.axes[1] ?? 0 < -this.gamepadDeadzone;
    const wasDown = this._lastGamepadState?.axes[1] ?? 0 > this.gamepadDeadzone;

    const isLeft = axisX < -this.gamepadDeadzone;
    const isRight = axisX > this.gamepadDeadzone;
    const isUp = axisY < -this.gamepadDeadzone;
    const isDown = axisY > this.gamepadDeadzone;

    // Trigger navigation on edge (press, not hold)
    if (isLeft && !wasLeft) this.navigate(NavigationDirection.Left);
    if (isRight && !wasRight) this.navigate(NavigationDirection.Right);
    if (isUp && !wasUp) this.navigate(NavigationDirection.Up);
    if (isDown && !wasDown) this.navigate(NavigationDirection.Down);

    // Check A button (activate)
    const wasAPressed = this._lastGamepadState?.buttons[0] ?? false;
    const isAPressed = gamepad.buttons[0]?.pressed ?? false;

    if (isAPressed && !wasAPressed) {
      this.activateCurrentElement();
    }

    // Store state
    this._lastGamepadState = {
      axes: [axisX, axisY],
      buttons: gamepad.buttons.map(b => b.pressed)
    };
  }

  /**
   * Registers an event listener.
   *
   * @param event - Event name
   * @param listener - Listener function
   */
  on(event: string, listener: (...args: any[]) => void): void {
    let listeners = this._listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this._listeners.set(event, listeners);
    }
    listeners.add(listener);
  }

  /**
   * Removes an event listener.
   *
   * @param event - Event name
   * @param listener - Listener function
   */
  off(event: string, listener: (...args: any[]) => void): void {
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Emits an event.
   *
   * @param event - Event name
   * @param args - Event arguments
   */
  protected emit(event: string, ...args: any[]): void {
    const listeners = this._listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        listener(...args);
      }
    }
  }

  /**
   * Destroys the navigation system.
   */
  destroy(): void {
    this.disable();
    this._explicitNav.clear();
    this._tabOrder = [];
    this._listeners.clear();
  }
}
