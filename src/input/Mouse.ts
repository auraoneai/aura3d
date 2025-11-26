/**
 * Mouse - Mouse input handling with button states, position, and scroll
 *
 * Provides comprehensive mouse input handling including button states (left, right, middle),
 * position tracking (screen, normalized, delta), scroll wheel, pointer lock support,
 * and cursor management. Handles both mouse and pointer events for broad compatibility.
 *
 * @module input/Mouse
 *
 * @example
 * ```typescript
 * const mouse = new Mouse();
 * mouse.attach(canvas);
 *
 * // Check button states
 * if (mouse.isButtonDown(0)) {
 *   // Left button is down
 *   handleLeftClick();
 * }
 *
 * // Get position
 * const pos = mouse.position; // Screen coordinates
 * const normalized = mouse.normalizedPosition; // 0-1 range
 *
 * // Get delta (useful for camera control)
 * const delta = mouse.delta;
 * camera.rotate(delta.x, delta.y);
 *
 * // Update each frame
 * mouse.update();
 * ```
 */

import { Vector2 } from '../math/Vector2';
import { Logger } from '../core/Logger';

const logger = new Logger('Mouse');

/**
 * Mouse button indices
 */
export enum MouseButton {
  Left = 0,
  Middle = 1,
  Right = 2,
  Back = 3,
  Forward = 4
}

/**
 * Button state flags
 */
enum ButtonState {
  Up = 0,
  Down = 1,
  Pressed = 2,
  Released = 4
}

/**
 * Mouse input handler with comprehensive state tracking.
 * Tracks buttons, position, scroll, and supports pointer lock.
 *
 * @example
 * ```typescript
 * // Create and attach mouse
 * const mouse = new Mouse();
 * mouse.attach(canvas);
 *
 * // In game loop
 * function update() {
 *   // Check left button click
 *   if (mouse.wasButtonPressed(MouseButton.Left)) {
 *     shoot();
 *   }
 *
 *   // Get mouse movement for camera
 *   const delta = mouse.delta;
 *   camera.yaw += delta.x * sensitivity;
 *   camera.pitch += delta.y * sensitivity;
 *
 *   // Check scroll
 *   const scroll = mouse.scrollDelta;
 *   if (scroll.y !== 0) {
 *     zoomLevel += scroll.y * 0.1;
 *   }
 *
 *   // Update at end of frame
 *   mouse.update();
 * }
 * ```
 */
export class Mouse {
  /**
   * Current mouse position in screen coordinates
   */
  private _position: Vector2 = new Vector2(0, 0);

  /**
   * Mouse position delta since last frame
   */
  private _delta: Vector2 = new Vector2(0, 0);

  /**
   * Scroll wheel delta
   */
  private _scrollDelta: Vector2 = new Vector2(0, 0);

  /**
   * Previous mouse position
   */
  private previousPosition: Vector2 = new Vector2(0, 0);

  /**
   * Button states (button index -> state)
   */
  private buttonStates: Map<number, ButtonState> = new Map();

  /**
   * Previous button states
   */
  private previousButtonStates: Map<number, ButtonState> = new Map();

  /**
   * Buttons pressed this frame
   */
  private buttonsPressed: Set<number> = new Set();

  /**
   * Buttons released this frame
   */
  private buttonsReleased: Set<number> = new Set();

  /**
   * Whether mouse is currently attached
   */
  private attached: boolean = false;

  /**
   * Target element for event listeners
   */
  private target: HTMLElement | null = null;

  /**
   * Whether pointer is currently locked
   */
  private _pointerLocked: boolean = false;

  /**
   * Target element dimensions for normalization
   */
  private targetWidth: number = 0;
  private targetHeight: number = 0;

  /**
   * Bound event handlers for cleanup
   */
  private handleMouseDown = this.onMouseDown.bind(this);
  private handleMouseUp = this.onMouseUp.bind(this);
  private handleMouseMove = this.onMouseMove.bind(this);
  private handleWheel = this.onWheel.bind(this);
  private handleContextMenu = this.onContextMenu.bind(this);
  private handlePointerLockChange = this.onPointerLockChange.bind(this);
  private handlePointerLockError = this.onPointerLockError.bind(this);

  /**
   * Creates a new mouse input handler.
   *
   * @example
   * ```typescript
   * const mouse = new Mouse();
   * ```
   */
  constructor() {
    logger.debug('Mouse input handler created');
  }

  /**
   * Attaches mouse event listeners to a target element.
   *
   * @param target - Target HTML element (typically canvas)
   *
   * @example
   * ```typescript
   * const canvas = document.getElementById('canvas') as HTMLCanvasElement;
   * mouse.attach(canvas);
   * ```
   */
  attach(target: HTMLElement): void {
    if (this.attached) {
      logger.warn('Mouse already attached, detaching first');
      this.detach();
    }

    this.target = target;
    this.targetWidth = target.clientWidth;
    this.targetHeight = target.clientHeight;

    target.addEventListener('mousedown', this.handleMouseDown);
    target.addEventListener('mouseup', this.handleMouseUp);
    target.addEventListener('mousemove', this.handleMouseMove);
    target.addEventListener('wheel', this.handleWheel);
    target.addEventListener('contextmenu', this.handleContextMenu);

    // Pointer lock events
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);

    this.attached = true;
    logger.debug('Mouse attached to target');
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
    this.target.removeEventListener('mouseup', this.handleMouseUp);
    this.target.removeEventListener('mousemove', this.handleMouseMove);
    this.target.removeEventListener('wheel', this.handleWheel);
    this.target.removeEventListener('contextmenu', this.handleContextMenu);

    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);

    if (this._pointerLocked) {
      this.unlockPointer();
    }

    this.target = null;
    this.attached = false;
    this.reset();
    logger.debug('Mouse detached');
  }

  /**
   * Updates mouse state. Call once per frame after processing input.
   *
   * @example
   * ```typescript
   * // At end of frame
   * mouse.update();
   * ```
   */
  update(): void {
    // Clear pressed/released sets
    this.buttonsPressed.clear();
    this.buttonsReleased.clear();

    // Copy current button states to previous
    this.previousButtonStates.clear();
    for (const [button, state] of this.buttonStates) {
      this.previousButtonStates.set(button, state);
    }

    // Update delta
    this._delta.set(
      this._position.x - this.previousPosition.x,
      this._position.y - this.previousPosition.y
    );
    this.previousPosition.set(this._position.x, this._position.y);

    // Clear scroll delta
    this._scrollDelta.set(0, 0);

    // Update target dimensions
    if (this.target) {
      this.targetWidth = this.target.clientWidth;
      this.targetHeight = this.target.clientHeight;
    }
  }

  /**
   * Checks if a button is currently down.
   *
   * @param button - Button index (0 = left, 1 = middle, 2 = right)
   * @returns True if button is down
   *
   * @example
   * ```typescript
   * if (mouse.isButtonDown(MouseButton.Left)) {
   *   handleDrag();
   * }
   * ```
   */
  isButtonDown(button: number): boolean {
    const state = this.buttonStates.get(button);
    return state === ButtonState.Down || state === ButtonState.Pressed;
  }

  /**
   * Checks if a button is currently up.
   *
   * @param button - Button index
   * @returns True if button is up
   *
   * @example
   * ```typescript
   * if (mouse.isButtonUp(MouseButton.Left)) {
   *   console.log('Left button is not pressed');
   * }
   * ```
   */
  isButtonUp(button: number): boolean {
    return !this.isButtonDown(button);
  }

  /**
   * Checks if a button was pressed this frame.
   *
   * @param button - Button index
   * @returns True if button was just pressed
   *
   * @example
   * ```typescript
   * if (mouse.wasButtonPressed(MouseButton.Left)) {
   *   shoot();
   * }
   * ```
   */
  wasButtonPressed(button: number): boolean {
    return this.buttonsPressed.has(button);
  }

  /**
   * Checks if a button was released this frame.
   *
   * @param button - Button index
   * @returns True if button was just released
   *
   * @example
   * ```typescript
   * if (mouse.wasButtonReleased(MouseButton.Left)) {
   *   endDrag();
   * }
   * ```
   */
  wasButtonReleased(button: number): boolean {
    return this.buttonsReleased.has(button);
  }

  /**
   * Gets button state as a value (0 or 1).
   *
   * @param button - Button index
   * @returns 1 if button is down, 0 if up
   *
   * @example
   * ```typescript
   * const leftButton = mouse.getButtonValue(MouseButton.Left);
   * ```
   */
  getButtonValue(button: number): number {
    return this.isButtonDown(button) ? 1 : 0;
  }

  /**
   * Gets current mouse position in screen coordinates.
   *
   * @returns Position vector
   *
   * @example
   * ```typescript
   * const pos = mouse.position;
   * console.log(`Mouse at ${pos.x}, ${pos.y}`);
   * ```
   */
  get position(): Readonly<Vector2> {
    return this._position;
  }

  /**
   * Gets normalized mouse position (0-1 range within target element).
   *
   * @returns Normalized position vector
   *
   * @example
   * ```typescript
   * const normalized = mouse.normalizedPosition;
   * // (0, 0) = top-left, (1, 1) = bottom-right
   * ```
   */
  get normalizedPosition(): Vector2 {
    if (this.targetWidth === 0 || this.targetHeight === 0) {
      return new Vector2(0, 0);
    }
    return new Vector2(
      this._position.x / this.targetWidth,
      this._position.y / this.targetHeight
    );
  }

  /**
   * Gets mouse position delta since last frame.
   *
   * @returns Delta vector
   *
   * @example
   * ```typescript
   * const delta = mouse.delta;
   * camera.rotate(delta.x * sensitivity, delta.y * sensitivity);
   * ```
   */
  get delta(): Readonly<Vector2> {
    return this._delta;
  }

  /**
   * Gets scroll wheel delta.
   *
   * @returns Scroll delta vector (y is primary scroll, x is horizontal scroll)
   *
   * @example
   * ```typescript
   * const scroll = mouse.scrollDelta;
   * if (scroll.y > 0) {
   *   zoomIn();
   * } else if (scroll.y < 0) {
   *   zoomOut();
   * }
   * ```
   */
  get scrollDelta(): Readonly<Vector2> {
    return this._scrollDelta;
  }

  /**
   * Checks if left button is down.
   *
   * @example
   * ```typescript
   * if (mouse.leftButton) {
   *   handleLeftButton();
   * }
   * ```
   */
  get leftButton(): boolean {
    return this.isButtonDown(MouseButton.Left);
  }

  /**
   * Checks if middle button is down.
   */
  get middleButton(): boolean {
    return this.isButtonDown(MouseButton.Middle);
  }

  /**
   * Checks if right button is down.
   */
  get rightButton(): boolean {
    return this.isButtonDown(MouseButton.Right);
  }

  /**
   * Requests pointer lock on the target element.
   *
   * @returns Promise that resolves when pointer is locked
   *
   * @example
   * ```typescript
   * await mouse.lockPointer();
   * console.log('Pointer locked');
   * ```
   */
  async lockPointer(): Promise<void> {
    if (!this.target) {
      throw new Error('Mouse must be attached to lock pointer');
    }

    if (this._pointerLocked) {
      return;
    }

    try {
      await this.target.requestPointerLock();
      logger.debug('Pointer lock requested');
    } catch (error) {
      logger.error('Failed to request pointer lock:', error);
      throw error;
    }
  }

  /**
   * Exits pointer lock.
   *
   * @example
   * ```typescript
   * mouse.unlockPointer();
   * ```
   */
  unlockPointer(): void {
    if (!this._pointerLocked) {
      return;
    }

    document.exitPointerLock();
    logger.debug('Pointer lock exited');
  }

  /**
   * Checks if pointer is currently locked.
   *
   * @returns True if pointer is locked
   *
   * @example
   * ```typescript
   * if (mouse.isPointerLocked) {
   *   // Use delta for camera control
   * }
   * ```
   */
  get isPointerLocked(): boolean {
    return this._pointerLocked;
  }

  /**
   * Sets cursor style on target element.
   *
   * @param cursor - CSS cursor value
   *
   * @example
   * ```typescript
   * mouse.setCursor('pointer');
   * mouse.setCursor('none');
   * mouse.setCursor('crosshair');
   * ```
   */
  setCursor(cursor: string): void {
    if (this.target) {
      this.target.style.cursor = cursor;
    }
  }

  /**
   * Gets current cursor style.
   *
   * @returns Current cursor value
   */
  getCursor(): string {
    return this.target?.style.cursor ?? 'default';
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
    this._position.set(0, 0);
    this._delta.set(0, 0);
    this._scrollDelta.set(0, 0);
    this.previousPosition.set(0, 0);
    this.buttonStates.clear();
    this.previousButtonStates.clear();
    this.buttonsPressed.clear();
    this.buttonsReleased.clear();
    logger.debug('Mouse state reset');
  }

  /**
   * Handles mousedown events.
   *
   * @param event - Mouse event
   * @private
   */
  private onMouseDown(event: MouseEvent): void {
    const button = event.button;
    const wasDown = this.isButtonDown(button);

    if (!wasDown) {
      this.buttonStates.set(button, ButtonState.Pressed);
      this.buttonsPressed.add(button);
    } else {
      this.buttonStates.set(button, ButtonState.Down);
    }

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
    const wasDown = this.isButtonDown(button);

    this.buttonStates.set(button, ButtonState.Up);

    if (wasDown) {
      this.buttonsReleased.add(button);
    }

    event.preventDefault();
  }

  /**
   * Handles mousemove events.
   *
   * @param event - Mouse event
   * @private
   */
  private onMouseMove(event: MouseEvent): void {
    if (this._pointerLocked) {
      // Use movement deltas in pointer lock mode
      this._delta.set(event.movementX, event.movementY);
    } else if (this.target) {
      // Use position relative to target
      const rect = this.target.getBoundingClientRect();
      this._position.set(
        event.clientX - rect.left,
        event.clientY - rect.top
      );
    }
  }

  /**
   * Handles wheel events.
   *
   * @param event - Wheel event
   * @private
   */
  private onWheel(event: WheelEvent): void {
    this._scrollDelta.set(event.deltaX, event.deltaY);
    event.preventDefault();
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
   * Handles pointer lock change events.
   *
   * @private
   */
  private onPointerLockChange(): void {
    this._pointerLocked = document.pointerLockElement === this.target;
    logger.debug(`Pointer lock ${this._pointerLocked ? 'acquired' : 'released'}`);
  }

  /**
   * Handles pointer lock error events.
   *
   * @private
   */
  private onPointerLockError(): void {
    logger.error('Pointer lock error');
    this._pointerLocked = false;
  }

  /**
   * Checks if mouse is attached.
   *
   * @returns True if attached
   *
   * @example
   * ```typescript
   * if (!mouse.isAttached()) {
   *   mouse.attach(canvas);
   * }
   * ```
   */
  isAttached(): boolean {
    return this.attached;
  }

  /**
   * Disposes the mouse handler, detaching all listeners.
   *
   * @example
   * ```typescript
   * mouse.dispose();
   * ```
   */
  dispose(): void {
    this.detach();
    logger.debug('Mouse disposed');
  }
}
