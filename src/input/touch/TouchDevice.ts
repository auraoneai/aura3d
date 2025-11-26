/**
 * TouchDevice - Multi-touch device wrapper with touch tracking
 *
 * Manages multi-touch input with support for up to 10+ simultaneous touches,
 * tracks touch lifecycle, and provides convenient access to touch state.
 *
 * @module input/touch/TouchDevice
 */

import { Vector2 } from '../../math/Vector2';
import { Logger } from '../../core/Logger';
import { TouchPoint, createTouchPoint, updateTouchPoint, cloneTouchPoint } from './TouchPoint';

const logger = Logger.create('TouchDevice');

/**
 * Touch device event handlers.
 */
export interface TouchDeviceCallbacks {
  /** Called when a new touch starts */
  onTouchStart?: (touch: TouchPoint) => void;
  /** Called when a touch moves */
  onTouchMove?: (touch: TouchPoint) => void;
  /** Called when a touch ends */
  onTouchEnd?: (touch: TouchPoint) => void;
  /** Called when a touch is cancelled */
  onTouchCancel?: (touch: TouchPoint) => void;
}

/**
 * Multi-touch device manager.
 *
 * @example
 * ```typescript
 * const touchDevice = new TouchDevice(canvas);
 *
 * touchDevice.setCallbacks({
 *   onTouchStart: (touch) => {
 *     console.log('Touch started:', touch.id);
 *   },
 *   onTouchEnd: (touch) => {
 *     console.log('Touch ended:', touch.id);
 *   }
 * });
 *
 * // In game loop
 * touchDevice.update();
 *
 * const touches = touchDevice.getActiveTouches();
 * console.log(`Active touches: ${touches.length}`);
 * ```
 */
export class TouchDevice {
  /** Target element for touch events */
  private readonly target: HTMLElement;

  /** Active touch points by ID */
  private touches: Map<number, TouchPoint> = new Map();

  /** Touch points from previous frame */
  private previousTouches: Map<number, TouchPoint> = new Map();

  /** Event callbacks */
  private callbacks: TouchDeviceCallbacks = {};

  /** Whether device is attached */
  private attached: boolean = false;

  /** Bound event handlers */
  private handleTouchStart = this.onTouchStart.bind(this);
  private handleTouchMove = this.onTouchMove.bind(this);
  private handleTouchEnd = this.onTouchEnd.bind(this);
  private handleTouchCancel = this.onTouchCancel.bind(this);

  /**
   * Creates a new touch device.
   *
   * @param target - Target HTML element for touch events
   *
   * @example
   * ```typescript
   * const touchDevice = new TouchDevice(canvas);
   * ```
   */
  constructor(target: HTMLElement) {
    this.target = target;
    this.attach();
    logger.debug('TouchDevice created');
  }

  /**
   * Attaches touch event listeners.
   *
   * @example
   * ```typescript
   * touchDevice.attach();
   * ```
   */
  attach(): void {
    if (this.attached) {
      logger.warn('TouchDevice already attached');
      return;
    }

    this.target.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.target.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.target.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    this.target.addEventListener('touchcancel', this.handleTouchCancel, { passive: false });

    this.attached = true;
    logger.debug('TouchDevice attached');
  }

  /**
   * Detaches touch event listeners.
   *
   * @example
   * ```typescript
   * touchDevice.detach();
   * ```
   */
  detach(): void {
    if (!this.attached) return;

    this.target.removeEventListener('touchstart', this.handleTouchStart);
    this.target.removeEventListener('touchmove', this.handleTouchMove);
    this.target.removeEventListener('touchend', this.handleTouchEnd);
    this.target.removeEventListener('touchcancel', this.handleTouchCancel);

    this.attached = false;
    logger.debug('TouchDevice detached');
  }

  /**
   * Updates touch state. Call once per frame.
   *
   * @example
   * ```typescript
   * touchDevice.update();
   * ```
   */
  update(): void {
    // Update previous touches
    this.previousTouches.clear();
    for (const [id, touch] of this.touches) {
      this.previousTouches.set(id, cloneTouchPoint(touch));
    }

    // Update ages
    const now = performance.now();
    for (const touch of this.touches.values()) {
      touch.age = now - touch.startTime;
    }
  }

  /**
   * Sets event callbacks.
   *
   * @param callbacks - Callback functions
   *
   * @example
   * ```typescript
   * touchDevice.setCallbacks({
   *   onTouchStart: (touch) => console.log('Started:', touch.id),
   *   onTouchEnd: (touch) => console.log('Ended:', touch.id)
   * });
   * ```
   */
  setCallbacks(callbacks: TouchDeviceCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Gets all active touch points.
   *
   * @returns Array of active touches
   *
   * @example
   * ```typescript
   * const touches = touchDevice.getActiveTouches();
   * for (const touch of touches) {
   *   console.log(`Touch ${touch.id} at (${touch.position.x}, ${touch.position.y})`);
   * }
   * ```
   */
  getActiveTouches(): TouchPoint[] {
    return Array.from(this.touches.values()).filter(t => t.active);
  }

  /**
   * Gets a touch point by ID.
   *
   * @param id - Touch ID
   * @returns Touch point or undefined
   *
   * @example
   * ```typescript
   * const touch = touchDevice.getTouch(0);
   * if (touch) {
   *   console.log('Touch 0 at', touch.position);
   * }
   * ```
   */
  getTouch(id: number): TouchPoint | undefined {
    return this.touches.get(id);
  }

  /**
   * Gets the number of active touches.
   *
   * @returns Active touch count
   *
   * @example
   * ```typescript
   * const count = touchDevice.getTouchCount();
   * if (count === 2) {
   *   console.log('Two-finger gesture');
   * }
   * ```
   */
  getTouchCount(): number {
    return this.getActiveTouches().length;
  }

  /**
   * Gets the primary (first) touch point.
   *
   * @returns Primary touch or undefined
   *
   * @example
   * ```typescript
   * const primary = touchDevice.getPrimaryTouch();
   * if (primary) {
   *   cursor.position = primary.position;
   * }
   * ```
   */
  getPrimaryTouch(): TouchPoint | undefined {
    const touches = this.getActiveTouches();
    return touches.length > 0 ? touches[0] : undefined;
  }

  /**
   * Checks if a specific touch ID is active.
   *
   * @param id - Touch ID to check
   * @returns True if touch is active
   *
   * @example
   * ```typescript
   * if (touchDevice.hasTouch(0)) {
   *   console.log('Touch 0 is active');
   * }
   * ```
   */
  hasTouch(id: number): boolean {
    const touch = this.touches.get(id);
    return touch !== undefined && touch.active;
  }

  /**
   * Gets the center point of all active touches.
   *
   * @returns Center position or null if no touches
   *
   * @example
   * ```typescript
   * const center = touchDevice.getTouchCenter();
   * if (center) {
   *   console.log('Touch center:', center);
   * }
   * ```
   */
  getTouchCenter(): Vector2 | null {
    const touches = this.getActiveTouches();
    if (touches.length === 0) return null;

    const sum = touches.reduce(
      (acc, touch) => acc.add(touch.position),
      new Vector2(0, 0)
    );

    return sum.scale(1 / touches.length);
  }

  /**
   * Clears all touch state.
   *
   * @example
   * ```typescript
   * touchDevice.clear();
   * ```
   */
  clear(): void {
    this.touches.clear();
    this.previousTouches.clear();
    logger.debug('TouchDevice cleared');
  }

  /**
   * Handles touchstart events.
   * @private
   */
  private onTouchStart(event: TouchEvent): void {
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i++) {
      const browserTouch = event.changedTouches[i];
      const touchPoint = createTouchPoint(browserTouch, this.target);

      this.touches.set(touchPoint.id, touchPoint);
      logger.debug(`Touch started: ${touchPoint.id}`);

      this.callbacks.onTouchStart?.(touchPoint);
    }
  }

  /**
   * Handles touchmove events.
   * @private
   */
  private onTouchMove(event: TouchEvent): void {
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i++) {
      const browserTouch = event.changedTouches[i];
      const touchPoint = this.touches.get(browserTouch.identifier);

      if (touchPoint) {
        updateTouchPoint(touchPoint, browserTouch, this.target);
        this.callbacks.onTouchMove?.(touchPoint);
      }
    }
  }

  /**
   * Handles touchend events.
   * @private
   */
  private onTouchEnd(event: TouchEvent): void {
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i++) {
      const browserTouch = event.changedTouches[i];
      const touchPoint = this.touches.get(browserTouch.identifier);

      if (touchPoint) {
        updateTouchPoint(touchPoint, browserTouch, this.target);
        touchPoint.active = false;
        logger.debug(`Touch ended: ${touchPoint.id}`);

        this.callbacks.onTouchEnd?.(touchPoint);
        this.touches.delete(touchPoint.id);
      }
    }
  }

  /**
   * Handles touchcancel events.
   * @private
   */
  private onTouchCancel(event: TouchEvent): void {
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i++) {
      const browserTouch = event.changedTouches[i];
      const touchPoint = this.touches.get(browserTouch.identifier);

      if (touchPoint) {
        touchPoint.active = false;
        logger.debug(`Touch cancelled: ${touchPoint.id}`);

        this.callbacks.onTouchCancel?.(touchPoint);
        this.touches.delete(touchPoint.id);
      }
    }
  }

  /**
   * Disposes the touch device.
   *
   * @example
   * ```typescript
   * touchDevice.dispose();
   * ```
   */
  dispose(): void {
    this.detach();
    this.clear();
    logger.debug('TouchDevice disposed');
  }
}
