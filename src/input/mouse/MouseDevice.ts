/**
 * MouseDevice - Comprehensive mouse device wrapper
 *
 * Advanced mouse input handling with button state tracking, position tracking
 * (screen and normalized), delta calculation for FPS-style controls, scroll wheel
 * support, and double/triple click detection. Provides low-latency input with
 * frame-accurate state tracking.
 *
 * @module input/mouse/MouseDevice
 *
 * @example
 * ```typescript
 * const mouse = new MouseDevice();
 * mouse.attach(canvas);
 *
 * // Check button states
 * if (mouse.justPressed(MouseButton.Left)) {
 *   shoot();
 * }
 *
 * // Get position
 * const pos = mouse.getPosition();
 * const normalized = mouse.getNormalizedPosition();
 *
 * // Get delta for camera control
 * const delta = mouse.getDelta();
 * camera.rotate(delta.x, delta.y);
 *
 * // Update at end of frame
 * mouse.endFrame();
 * ```
 */

import { Vector2 } from '../../math/Vector2';
import { Logger } from '../../core/Logger';
import { MouseButton, MouseButtonState, createButtonState, isDoubleClick, isTripleClick } from './MouseButton';
import { MouseWheel, MouseWheelConfig } from './MouseWheel';

const logger = new Logger('MouseDevice');

/**
 * Mouse event callback types
 */
export type MouseButtonCallback = (button: MouseButton, event: MouseEvent) => void;
export type MouseMoveCallback = (position: Vector2, event: MouseEvent) => void;
export type MouseWheelCallback = (delta: Vector2, event: WheelEvent) => void;

/**
 * Mouse device configuration
 */
export interface MouseDeviceConfig {
  /**
   * Enable mouse wheel handling
   */
  wheel?: boolean;

  /**
   * Mouse wheel configuration
   */
  wheelConfig?: MouseWheelConfig;

  /**
   * Capture mouse outside element bounds
   */
  captureMouse?: boolean;

  /**
   * Prevent context menu
   */
  preventContextMenu?: boolean;
}

/**
 * Advanced mouse device with comprehensive state tracking.
 * Provides frame-accurate button states, position tracking, and delta calculation.
 *
 * @example
 * ```typescript
 * const mouse = new MouseDevice({
 *   wheel: true,
 *   wheelConfig: {
 *     smoothing: true,
 *     momentum: true
 *   },
 *   captureMouse: true,
 *   preventContextMenu: true
 * });
 *
 * mouse.attach(canvas);
 *
 * // Add event listeners
 * mouse.on('buttondown', (button, event) => {
 *   console.log(`Button ${button} pressed`);
 * });
 *
 * // In game loop
 * function update(deltaTime: number) {
 *   mouse.update(deltaTime);
 *
 *   // FPS camera control
 *   const delta = mouse.getDelta();
 *   camera.yaw += delta.x * sensitivity;
 *   camera.pitch += delta.y * sensitivity;
 *
 *   // Shooting
 *   if (mouse.justPressed(MouseButton.Left)) {
 *     weapon.fire();
 *   }
 *
 *   // Zoom
 *   const scroll = mouse.getScrollDelta();
 *   camera.zoom += scroll.y * 0.1;
 *
 *   mouse.endFrame();
 * }
 * ```
 */
export class MouseDevice {
  /**
   * Configuration
   */
  private config: Required<MouseDeviceConfig>;

  /**
   * Button states
   */
  private buttonStates: Map<number, MouseButtonState> = new Map();

  /**
   * Buttons just pressed this frame
   */
  private buttonsJustPressed: Set<number> = new Set();

  /**
   * Buttons just released this frame
   */
  private buttonsJustReleased: Set<number> = new Set();

  /**
   * Current mouse position (screen coordinates)
   */
  private position: Vector2 = new Vector2(0, 0);

  /**
   * Previous frame position
   */
  private previousPosition: Vector2 = new Vector2(0, 0);

  /**
   * Mouse position delta
   */
  private delta: Vector2 = new Vector2(0, 0);

  /**
   * Mouse wheel handler
   */
  private wheel: MouseWheel | null = null;

  /**
   * Target element dimensions
   */
  private targetWidth: number = 0;
  private targetHeight: number = 0;

  /**
   * Whether device is attached
   */
  private attached: boolean = false;

  /**
   * Target element
   */
  private target: HTMLElement | null = null;

  /**
   * Event callbacks
   */
  private eventCallbacks: Map<string, Set<Function>> = new Map();

  /**
   * Bound event handlers
   */
  private handleMouseDown = this.onMouseDown.bind(this);
  private handleMouseUp = this.onMouseUp.bind(this);
  private handleMouseMove = this.onMouseMove.bind(this);
  private handleContextMenu = this.onContextMenu.bind(this);

  /**
   * Current time for duration tracking
   */
  private currentTime: number = 0;

  /**
   * Mouse capture state
   */
  private capturing: boolean = false;

  /**
   * Creates a new mouse device.
   *
   * @param config - Mouse device configuration
   *
   * @example
   * ```typescript
   * const mouse = new MouseDevice({
   *   wheel: true,
   *   captureMouse: true
   * });
   * ```
   */
  constructor(config: MouseDeviceConfig = {}) {
    this.config = {
      wheel: config.wheel ?? true,
      wheelConfig: config.wheelConfig ?? {},
      captureMouse: config.captureMouse ?? false,
      preventContextMenu: config.preventContextMenu ?? true
    };

    if (this.config.wheel) {
      this.wheel = new MouseWheel(this.config.wheelConfig);
    }

    logger.debug('MouseDevice created');
  }

  /**
   * Attaches mouse event listeners to a target element.
   *
   * @param target - Target element
   *
   * @example
   * ```typescript
   * mouse.attach(canvas);
   * ```
   */
  attach(target: HTMLElement): void {
    if (this.attached) {
      logger.warn('MouseDevice already attached');
      this.detach();
    }

    this.target = target;
    this.targetWidth = target.clientWidth;
    this.targetHeight = target.clientHeight;

    target.addEventListener('mousedown', this.handleMouseDown);
    target.addEventListener('mousemove', this.handleMouseMove);

    if (this.config.captureMouse) {
      document.addEventListener('mouseup', this.handleMouseUp);
    } else {
      target.addEventListener('mouseup', this.handleMouseUp);
    }

    if (this.config.preventContextMenu) {
      target.addEventListener('contextmenu', this.handleContextMenu);
    }

    if (this.wheel) {
      this.wheel.attach(target);
    }

    this.attached = true;
    logger.debug('MouseDevice attached');
  }

  /**
   * Detaches mouse event listeners.
   *
   * @example
   * ```typescript
   * mouse.detach();
   * ```
   */
  detach(): void {
    if (!this.attached || !this.target) {
      return;
    }

    this.target.removeEventListener('mousedown', this.handleMouseDown);
    this.target.removeEventListener('mousemove', this.handleMouseMove);

    if (this.config.captureMouse) {
      document.removeEventListener('mouseup', this.handleMouseUp);
    } else {
      this.target.removeEventListener('mouseup', this.handleMouseUp);
    }

    if (this.config.preventContextMenu) {
      this.target.removeEventListener('contextmenu', this.handleContextMenu);
    }

    if (this.wheel) {
      this.wheel.detach();
    }

    this.target = null;
    this.attached = false;
    this.capturing = false;
    this.reset();
    logger.debug('MouseDevice detached');
  }

  /**
   * Updates mouse state. Call once per frame.
   *
   * @param deltaTime - Time since last frame in seconds
   *
   * @example
   * ```typescript
   * function update(deltaTime: number) {
   *   mouse.update(deltaTime);
   * }
   * ```
   */
  update(deltaTime: number): void {
    this.currentTime += deltaTime * 1000;

    if (this.target) {
      this.targetWidth = this.target.clientWidth;
      this.targetHeight = this.target.clientHeight;
    }

    for (const [button, state] of this.buttonStates) {
      if (state.down && state.pressedTime > 0) {
        state.holdDuration = this.currentTime - state.pressedTime;
      }

      const timeSinceClick = this.currentTime - state.lastClickTime;
      if (timeSinceClick > 300) {
        state.clickCount = 0;
      }
    }

    this.delta.set(
      this.position.x - this.previousPosition.x,
      this.position.y - this.previousPosition.y
    );

    this.previousPosition.set(this.position.x, this.position.y);

    if (this.wheel) {
      this.wheel.update(deltaTime);
    }
  }

  /**
   * Marks the end of the current frame.
   *
   * @example
   * ```typescript
   * function update(deltaTime: number) {
   *   mouse.update(deltaTime);
   *   // ... game logic
   *   mouse.endFrame();
   * }
   * ```
   */
  endFrame(): void {
    this.buttonsJustPressed.clear();
    this.buttonsJustReleased.clear();

    for (const state of this.buttonStates.values()) {
      state.justPressed = false;
      state.justReleased = false;
    }

    if (this.wheel) {
      this.wheel.endFrame();
    }
  }

  /**
   * Checks if a button is currently down.
   *
   * @param button - Button index
   * @returns True if button is down
   *
   * @example
   * ```typescript
   * if (mouse.isDown(MouseButton.Left)) {
   *   handleDrag();
   * }
   * ```
   */
  isDown(button: MouseButton): boolean {
    return this.buttonStates.get(button)?.down ?? false;
  }

  /**
   * Checks if a button is currently up.
   *
   * @param button - Button index
   * @returns True if button is up
   */
  isUp(button: MouseButton): boolean {
    return !this.isDown(button);
  }

  /**
   * Checks if a button was just pressed this frame.
   *
   * @param button - Button index
   * @returns True if button was just pressed
   *
   * @example
   * ```typescript
   * if (mouse.justPressed(MouseButton.Left)) {
   *   shoot();
   * }
   * ```
   */
  justPressed(button: MouseButton): boolean {
    return this.buttonStates.get(button)?.justPressed ?? false;
  }

  /**
   * Checks if a button was just released this frame.
   *
   * @param button - Button index
   * @returns True if button was just released
   *
   * @example
   * ```typescript
   * if (mouse.justReleased(MouseButton.Left)) {
   *   endDrag();
   * }
   * ```
   */
  justReleased(button: MouseButton): boolean {
    return this.buttonStates.get(button)?.justReleased ?? false;
  }

  /**
   * Gets the value of a button (0 or 1).
   *
   * @param button - Button index
   * @returns 1 if down, 0 if up
   */
  getValue(button: MouseButton): number {
    return this.isDown(button) ? 1 : 0;
  }

  /**
   * Gets how long a button has been held in milliseconds.
   *
   * @param button - Button index
   * @returns Hold duration in milliseconds
   *
   * @example
   * ```typescript
   * const holdTime = mouse.getHoldDuration(MouseButton.Left);
   * if (holdTime > 500) {
   *   chargeWeapon(holdTime);
   * }
   * ```
   */
  getHoldDuration(button: MouseButton): number {
    return this.buttonStates.get(button)?.holdDuration ?? 0;
  }

  /**
   * Checks if a button was double-clicked.
   *
   * @param button - Button index
   * @returns True if double-clicked
   *
   * @example
   * ```typescript
   * if (mouse.wasDoubleClicked(MouseButton.Left)) {
   *   selectWord();
   * }
   * ```
   */
  wasDoubleClicked(button: MouseButton): boolean {
    const state = this.buttonStates.get(button);
    return state ? isDoubleClick(state, this.currentTime) : false;
  }

  /**
   * Checks if a button was triple-clicked.
   *
   * @param button - Button index
   * @returns True if triple-clicked
   *
   * @example
   * ```typescript
   * if (mouse.wasTripleClicked(MouseButton.Left)) {
   *   selectLine();
   * }
   * ```
   */
  wasTripleClicked(button: MouseButton): boolean {
    const state = this.buttonStates.get(button);
    return state ? isTripleClick(state, this.currentTime) : false;
  }

  /**
   * Gets current mouse position in screen coordinates.
   *
   * @returns Position vector
   *
   * @example
   * ```typescript
   * const pos = mouse.getPosition();
   * console.log(`Mouse at ${pos.x}, ${pos.y}`);
   * ```
   */
  getPosition(): Readonly<Vector2> {
    return this.position;
  }

  /**
   * Gets normalized mouse position (0-1 range).
   *
   * @returns Normalized position
   *
   * @example
   * ```typescript
   * const normalized = mouse.getNormalizedPosition();
   * // (0, 0) = top-left, (1, 1) = bottom-right
   * ```
   */
  getNormalizedPosition(): Vector2 {
    if (this.targetWidth === 0 || this.targetHeight === 0) {
      return new Vector2(0, 0);
    }
    return new Vector2(
      this.position.x / this.targetWidth,
      this.position.y / this.targetHeight
    );
  }

  /**
   * Gets mouse position delta since last frame.
   *
   * @returns Delta vector
   *
   * @example
   * ```typescript
   * const delta = mouse.getDelta();
   * camera.rotate(delta.x * sensitivity, delta.y * sensitivity);
   * ```
   */
  getDelta(): Readonly<Vector2> {
    return this.delta;
  }

  /**
   * Gets mouse wheel scroll delta.
   *
   * @returns Scroll delta (or zero if wheel disabled)
   *
   * @example
   * ```typescript
   * const scroll = mouse.getScrollDelta();
   * camera.zoom += scroll.y * 0.1;
   * ```
   */
  getScrollDelta(): Vector2 {
    return this.wheel ? this.wheel.getDelta() as Vector2 : new Vector2(0, 0);
  }

  /**
   * Gets smoothed scroll delta.
   *
   * @returns Smoothed scroll delta
   */
  getSmoothedScrollDelta(): Vector2 {
    return this.wheel ? this.wheel.getSmoothedDelta() as Vector2 : new Vector2(0, 0);
  }

  /**
   * Gets the mouse wheel handler.
   *
   * @returns Wheel handler or null
   */
  getWheel(): MouseWheel | null {
    return this.wheel;
  }

  /**
   * Gets all buttons that are currently down.
   *
   * @returns Array of button indices
   */
  getPressedButtons(): number[] {
    const buttons: number[] = [];
    for (const [button, state] of this.buttonStates) {
      if (state.down) {
        buttons.push(button);
      }
    }
    return buttons;
  }

  /**
   * Checks if left button is down.
   */
  get leftButton(): boolean {
    return this.isDown(MouseButton.Left);
  }

  /**
   * Checks if middle button is down.
   */
  get middleButton(): boolean {
    return this.isDown(MouseButton.Middle);
  }

  /**
   * Checks if right button is down.
   */
  get rightButton(): boolean {
    return this.isDown(MouseButton.Right);
  }

  /**
   * Adds an event listener.
   *
   * @param event - Event name
   * @param callback - Callback function
   *
   * @example
   * ```typescript
   * mouse.on('buttondown', (button, event) => {
   *   console.log(`Button ${button} pressed`);
   * });
   * ```
   */
  on(event: 'buttondown' | 'buttonup', callback: MouseButtonCallback): void;
  on(event: 'move', callback: MouseMoveCallback): void;
  on(event: string, callback: Function): void {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, new Set());
    }
    this.eventCallbacks.get(event)!.add(callback);
  }

  /**
   * Removes an event listener.
   *
   * @param event - Event name
   * @param callback - Callback function
   */
  off(event: string, callback: Function): void {
    this.eventCallbacks.get(event)?.delete(callback);
  }

  /**
   * Resets all mouse state.
   *
   * @example
   * ```typescript
   * mouse.reset();
   * ```
   */
  reset(): void {
    this.buttonStates.clear();
    this.buttonsJustPressed.clear();
    this.buttonsJustReleased.clear();
    this.position.set(0, 0);
    this.previousPosition.set(0, 0);
    this.delta.set(0, 0);

    if (this.wheel) {
      this.wheel.reset();
    }

    logger.debug('MouseDevice reset');
  }

  /**
   * Handles mousedown events.
   *
   * @param event - Mouse event
   * @private
   */
  private onMouseDown(event: MouseEvent): void {
    const button = event.button;

    let state = this.buttonStates.get(button);
    if (!state) {
      state = createButtonState();
      this.buttonStates.set(button, state);
    }

    const wasDown = state.down;

    if (!wasDown) {
      state.down = true;
      state.justPressed = true;
      state.pressedTime = this.currentTime;
      state.holdDuration = 0;
      this.buttonsJustPressed.add(button);

      const timeSinceLastClick = this.currentTime - state.lastClickTime;
      if (timeSinceLastClick < 300) {
        state.clickCount++;
      } else {
        state.clickCount = 1;
      }
      state.lastClickTime = this.currentTime;
    }

    this.emit('buttondown', button, event);

    event.preventDefault();
  }

  /**
   * Handles mouseup events.
   *
   * @param event - Mouse event
   * @private
   */
  private onMouseUp(event: MouseEvent): void {
    const button = event.button;

    let state = this.buttonStates.get(button);
    if (!state) {
      state = createButtonState();
      this.buttonStates.set(button, state);
    }

    const wasDown = state.down;

    state.down = false;
    state.justReleased = wasDown;
    state.releasedTime = this.currentTime;
    state.holdDuration = 0;

    if (wasDown) {
      this.buttonsJustReleased.add(button);
    }

    this.emit('buttonup', button, event);

    event.preventDefault();
  }

  /**
   * Handles mousemove events.
   *
   * @param event - Mouse event
   * @private
   */
  private onMouseMove(event: MouseEvent): void {
    if (this.target) {
      const rect = this.target.getBoundingClientRect();
      this.position.set(
        event.clientX - rect.left,
        event.clientY - rect.top
      );
    }

    this.emit('move', this.position, event);
  }

  /**
   * Handles context menu events.
   *
   * @param event - Mouse event
   * @private
   */
  private onContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  /**
   * Emits an event to all listeners.
   *
   * @param event - Event name
   * @param args - Event arguments
   * @private
   */
  private emit(event: string, ...args: any[]): void {
    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(...args);
      }
    }
  }

  /**
   * Checks if device is attached.
   *
   * @returns True if attached
   */
  isAttached(): boolean {
    return this.attached;
  }

  /**
   * Disposes the mouse device.
   *
   * @example
   * ```typescript
   * mouse.dispose();
   * ```
   */
  dispose(): void {
    this.detach();
    this.eventCallbacks.clear();
    logger.debug('MouseDevice disposed');
  }
}
