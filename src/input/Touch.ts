/**
 * Touch - Multi-touch input handling with gesture recognition
 *
 * Provides comprehensive touch input handling for mobile devices including multi-touch tracking,
 * touch point management with IDs, gesture recognition (tap, swipe, pinch, rotate), touch
 * pressure and radius support. Handles both touch and pointer events for broad compatibility.
 *
 * @module input/Touch
 *
 * @example
 * ```typescript
 * const touch = new Touch();
 * touch.attach(canvas);
 *
 * // Check active touches
 * const touches = touch.getTouches();
 * console.log(`${touches.length} touches active`);
 *
 * // Detect tap gesture
 * if (touch.wasTapped()) {
 *   handleTap();
 * }
 *
 * // Detect swipe gesture
 * const swipe = touch.getSwipe();
 * if (swipe) {
 *   handleSwipe(swipe.direction, swipe.velocity);
 * }
 *
 * // Detect pinch gesture
 * const pinch = touch.getPinch();
 * if (pinch) {
 *   zoom(pinch.scale);
 * }
 *
 * // Update each frame
 * touch.update();
 * ```
 */

import { Vector2 } from '../math/Vector2';
import { Logger } from '../core/Logger';

const logger = new Logger('Touch');

/**
 * Touch point data
 */
export interface TouchPoint {
  /**
   * Unique touch identifier
   */
  id: number;

  /**
   * Current position in screen coordinates
   */
  position: Vector2;

  /**
   * Position delta since last frame
   */
  delta: Vector2;

  /**
   * Touch pressure (0-1)
   */
  pressure: number;

  /**
   * Touch radius in pixels
   */
  radius: Vector2;

  /**
   * Time when touch started
   */
  startTime: number;

  /**
   * Starting position
   */
  startPosition: Vector2;

  /**
   * Whether this touch is active
   */
  active: boolean;
}

/**
 * Swipe gesture data
 */
export interface SwipeGesture {
  /**
   * Swipe direction (normalized)
   */
  direction: Vector2;

  /**
   * Swipe velocity in pixels per second
   */
  velocity: number;

  /**
   * Swipe distance in pixels
   */
  distance: number;

  /**
   * Starting position
   */
  startPosition: Vector2;

  /**
   * Ending position
   */
  endPosition: Vector2;
}

/**
 * Pinch gesture data
 */
export interface PinchGesture {
  /**
   * Scale factor (> 1 = zoom in, < 1 = zoom out)
   */
  scale: number;

  /**
   * Scale delta since last frame
   */
  delta: number;

  /**
   * Center point of pinch
   */
  center: Vector2;

  /**
   * Current distance between touches
   */
  distance: number;
}

/**
 * Rotate gesture data
 */
export interface RotateGesture {
  /**
   * Rotation angle in radians
   */
  angle: number;

  /**
   * Angle delta since last frame
   */
  delta: number;

  /**
   * Center point of rotation
   */
  center: Vector2;
}

/**
 * Touch input handler with multi-touch and gesture support.
 *
 * @example
 * ```typescript
 * // Create and attach touch
 * const touch = new Touch();
 * touch.attach(canvas);
 *
 * // In game loop
 * function update() {
 *   // Handle single tap
 *   if (touch.wasTapped()) {
 *     const tapPos = touch.getTapPosition();
 *     handleTap(tapPos);
 *   }
 *
 *   // Handle swipe
 *   const swipe = touch.getSwipe();
 *   if (swipe && swipe.velocity > 500) {
 *     if (Math.abs(swipe.direction.x) > Math.abs(swipe.direction.y)) {
 *       // Horizontal swipe
 *       if (swipe.direction.x > 0) {
 *         swipeRight();
 *       } else {
 *         swipeLeft();
 *       }
 *     }
 *   }
 *
 *   // Handle pinch zoom
 *   const pinch = touch.getPinch();
 *   if (pinch) {
 *     camera.zoom *= pinch.scale;
 *   }
 *
 *   // Handle rotation
 *   const rotate = touch.getRotate();
 *   if (rotate) {
 *     object.rotation += rotate.delta;
 *   }
 *
 *   // Update at end of frame
 *   touch.update();
 * }
 * ```
 */
export class Touch {
  /**
   * Active touch points
   */
  private touches: Map<number, TouchPoint> = new Map();

  /**
   * Touch points from previous frame
   */
  private previousTouches: Map<number, TouchPoint> = new Map();

  /**
   * Whether touch handler is attached
   */
  private attached: boolean = false;

  /**
   * Target element for event listeners
   */
  private target: HTMLElement | null = null;

  /**
   * Current swipe gesture
   */
  private currentSwipe: SwipeGesture | null = null;

  /**
   * Current pinch gesture
   */
  private currentPinch: PinchGesture | null = null;

  /**
   * Current rotate gesture
   */
  private currentRotate: RotateGesture | null = null;

  /**
   * Previous pinch distance for delta calculation
   */
  private previousPinchDistance: number = 0;

  /**
   * Previous rotation angle for delta calculation
   */
  private previousRotateAngle: number = 0;

  /**
   * Tap detection state
   */
  private tapDetected: boolean = false;
  private tapPosition: Vector2 | null = null;

  /**
   * Gesture thresholds
   */
  private readonly TAP_DURATION = 0.3; // seconds
  private readonly TAP_DISTANCE = 10; // pixels
  private readonly SWIPE_MIN_VELOCITY = 100; // pixels/second
  private readonly SWIPE_MIN_DISTANCE = 30; // pixels

  /**
   * Bound event handlers for cleanup
   */
  private handleTouchStart = this.onTouchStart.bind(this);
  private handleTouchMove = this.onTouchMove.bind(this);
  private handleTouchEnd = this.onTouchEnd.bind(this);
  private handleTouchCancel = this.onTouchCancel.bind(this);

  /**
   * Creates a new touch input handler.
   *
   * @example
   * ```typescript
   * const touch = new Touch();
   * ```
   */
  constructor() {
    logger.debug('Touch input handler created');
  }

  /**
   * Attaches touch event listeners to a target element.
   *
   * @param target - Target HTML element (typically canvas)
   *
   * @example
   * ```typescript
   * const canvas = document.getElementById('canvas') as HTMLCanvasElement;
   * touch.attach(canvas);
   * ```
   */
  attach(target: HTMLElement): void {
    if (this.attached) {
      logger.warn('Touch already attached, detaching first');
      this.detach();
    }

    this.target = target;

    target.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    target.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    target.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    target.addEventListener('touchcancel', this.handleTouchCancel, { passive: false });

    this.attached = true;
    logger.debug('Touch attached to target');
  }

  /**
   * Detaches touch event listeners.
   *
   * @example
   * ```typescript
   * touch.detach();
   * ```
   */
  detach(): void {
    if (!this.attached || !this.target) {
      return;
    }

    this.target.removeEventListener('touchstart', this.handleTouchStart);
    this.target.removeEventListener('touchmove', this.handleTouchMove);
    this.target.removeEventListener('touchend', this.handleTouchEnd);
    this.target.removeEventListener('touchcancel', this.handleTouchCancel);

    this.target = null;
    this.attached = false;
    this.reset();
    logger.debug('Touch detached');
  }

  /**
   * Updates touch state. Call once per frame after processing input.
   *
   * @example
   * ```typescript
   * // At end of frame
   * touch.update();
   * ```
   */
  update(): void {
    // Copy current touches to previous
    this.previousTouches.clear();
    for (const [id, touch] of this.touches) {
      this.previousTouches.set(id, { ...touch });
    }

    // Update touch deltas
    for (const [id, touch] of this.touches) {
      const prev = this.previousTouches.get(id);
      if (prev) {
        touch.delta.set(
          touch.position.x - prev.position.x,
          touch.position.y - prev.position.y
        );
      } else {
        touch.delta.set(0, 0);
      }
    }

    // Clear one-frame gestures
    this.tapDetected = false;
    this.tapPosition = null;
    this.currentSwipe = null;

    // Update multi-touch gestures
    this.updatePinchGesture();
    this.updateRotateGesture();
  }

  /**
   * Gets all active touch points.
   *
   * @returns Array of touch points
   *
   * @example
   * ```typescript
   * const touches = touch.getTouches();
   * for (const t of touches) {
   *   console.log(`Touch ${t.id} at ${t.position.x}, ${t.position.y}`);
   * }
   * ```
   */
  getTouches(): TouchPoint[] {
    return Array.from(this.touches.values()).filter(t => t.active);
  }

  /**
   * Gets a specific touch point by ID.
   *
   * @param id - Touch ID
   * @returns Touch point or undefined
   *
   * @example
   * ```typescript
   * const touch0 = touch.getTouch(0);
   * if (touch0) {
   *   console.log('First touch at', touch0.position);
   * }
   * ```
   */
  getTouch(id: number): TouchPoint | undefined {
    return this.touches.get(id);
  }

  /**
   * Gets the number of active touches.
   *
   * @returns Touch count
   *
   * @example
   * ```typescript
   * if (touch.getTouchCount() === 2) {
   *   // Two-finger gesture
   * }
   * ```
   */
  getTouchCount(): number {
    return Array.from(this.touches.values()).filter(t => t.active).length;
  }

  /**
   * Checks if a tap gesture was detected this frame.
   *
   * @returns True if tap was detected
   *
   * @example
   * ```typescript
   * if (touch.wasTapped()) {
   *   const pos = touch.getTapPosition();
   *   handleTap(pos);
   * }
   * ```
   */
  wasTapped(): boolean {
    return this.tapDetected;
  }

  /**
   * Gets the position of the last tap.
   *
   * @returns Tap position or null
   *
   * @example
   * ```typescript
   * const tapPos = touch.getTapPosition();
   * if (tapPos) {
   *   console.log(`Tapped at ${tapPos.x}, ${tapPos.y}`);
   * }
   * ```
   */
  getTapPosition(): Vector2 | null {
    return this.tapPosition;
  }

  /**
   * Gets the current swipe gesture.
   *
   * @returns Swipe gesture or null
   *
   * @example
   * ```typescript
   * const swipe = touch.getSwipe();
   * if (swipe) {
   *   console.log(`Swiped ${swipe.distance}px at ${swipe.velocity}px/s`);
   * }
   * ```
   */
  getSwipe(): SwipeGesture | null {
    return this.currentSwipe;
  }

  /**
   * Gets the current pinch gesture.
   *
   * @returns Pinch gesture or null
   *
   * @example
   * ```typescript
   * const pinch = touch.getPinch();
   * if (pinch) {
   *   camera.zoom *= pinch.scale;
   * }
   * ```
   */
  getPinch(): PinchGesture | null {
    return this.currentPinch;
  }

  /**
   * Gets the current rotate gesture.
   *
   * @returns Rotate gesture or null
   *
   * @example
   * ```typescript
   * const rotate = touch.getRotate();
   * if (rotate) {
   *   object.rotation += rotate.delta;
   * }
   * ```
   */
  getRotate(): RotateGesture | null {
    return this.currentRotate;
  }

  /**
   * Resets all touch state.
   *
   * @example
   * ```typescript
   * touch.reset();
   * ```
   */
  reset(): void {
    this.touches.clear();
    this.previousTouches.clear();
    this.currentSwipe = null;
    this.currentPinch = null;
    this.currentRotate = null;
    this.tapDetected = false;
    this.tapPosition = null;
    this.previousPinchDistance = 0;
    this.previousRotateAngle = 0;
    logger.debug('Touch state reset');
  }

  /**
   * Handles touchstart events.
   *
   * @param event - Touch event
   * @private
   */
  private onTouchStart(event: TouchEvent): void {
    event.preventDefault();

    if (!this.target) return;

    const rect = this.target.getBoundingClientRect();
    const now = performance.now() / 1000;

    for (let i = 0; i < event.changedTouches.length; i++) {
      const t = event.changedTouches[i];
      const position = new Vector2(
        t.clientX - rect.left,
        t.clientY - rect.top
      );

      this.touches.set(t.identifier, {
        id: t.identifier,
        position: position,
        delta: new Vector2(0, 0),
        pressure: t.force || 1.0,
        radius: new Vector2(t.radiusX || 0, t.radiusY || 0),
        startTime: now,
        startPosition: position.clone(),
        active: true
      });
    }
  }

  /**
   * Handles touchmove events.
   *
   * @param event - Touch event
   * @private
   */
  private onTouchMove(event: TouchEvent): void {
    event.preventDefault();

    if (!this.target) return;

    const rect = this.target.getBoundingClientRect();

    for (let i = 0; i < event.changedTouches.length; i++) {
      const t = event.changedTouches[i];
      const touch = this.touches.get(t.identifier);

      if (touch) {
        const newPos = new Vector2(
          t.clientX - rect.left,
          t.clientY - rect.top
        );

        touch.delta.set(
          newPos.x - touch.position.x,
          newPos.y - touch.position.y
        );
        touch.position.set(newPos.x, newPos.y);
        touch.pressure = t.force || 1.0;
        touch.radius.set(t.radiusX || 0, t.radiusY || 0);
      }
    }
  }

  /**
   * Handles touchend events.
   *
   * @param event - Touch event
   * @private
   */
  private onTouchEnd(event: TouchEvent): void {
    event.preventDefault();

    const now = performance.now() / 1000;

    for (let i = 0; i < event.changedTouches.length; i++) {
      const t = event.changedTouches[i];
      const touch = this.touches.get(t.identifier);

      if (touch) {
        touch.active = false;

        // Detect tap
        const duration = now - touch.startTime;
        const distance = touch.position.distanceTo(touch.startPosition);

        if (duration <= this.TAP_DURATION && distance <= this.TAP_DISTANCE) {
          this.tapDetected = true;
          this.tapPosition = touch.position.clone();
        }

        // Detect swipe
        if (distance >= this.SWIPE_MIN_DISTANCE && duration > 0) {
          const velocity = distance / duration;

          if (velocity >= this.SWIPE_MIN_VELOCITY) {
            const direction = touch.position.subtract(touch.startPosition).normalize();
            this.currentSwipe = {
              direction,
              velocity,
              distance,
              startPosition: touch.startPosition.clone(),
              endPosition: touch.position.clone()
            };
          }
        }

        // Remove touch
        this.touches.delete(t.identifier);
      }
    }
  }

  /**
   * Handles touchcancel events.
   *
   * @param event - Touch event
   * @private
   */
  private onTouchCancel(event: TouchEvent): void {
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i++) {
      const t = event.changedTouches[i];
      this.touches.delete(t.identifier);
    }
  }

  /**
   * Updates pinch gesture detection.
   *
   * @private
   */
  private updatePinchGesture(): void {
    const activeTouches = this.getTouches();

    if (activeTouches.length !== 2) {
      this.currentPinch = null;
      this.previousPinchDistance = 0;
      return;
    }

    const [t1, t2] = activeTouches;
    const distance = t1.position.distanceTo(t2.position);
    const center = t1.position.add(t2.position).scale(0.5);

    if (this.previousPinchDistance === 0) {
      this.previousPinchDistance = distance;
    }

    const scale = distance / this.previousPinchDistance;
    const delta = scale - 1;

    this.currentPinch = {
      scale,
      delta,
      center,
      distance
    };

    this.previousPinchDistance = distance;
  }

  /**
   * Updates rotate gesture detection.
   *
   * @private
   */
  private updateRotateGesture(): void {
    const activeTouches = this.getTouches();

    if (activeTouches.length !== 2) {
      this.currentRotate = null;
      this.previousRotateAngle = 0;
      return;
    }

    const [t1, t2] = activeTouches;
    const diff = t2.position.subtract(t1.position);
    const angle = Math.atan2(diff.y, diff.x);
    const center = t1.position.add(t2.position).scale(0.5);

    if (this.previousRotateAngle === 0) {
      this.previousRotateAngle = angle;
    }

    let delta = angle - this.previousRotateAngle;

    // Normalize delta to -PI to PI
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;

    this.currentRotate = {
      angle,
      delta,
      center
    };

    this.previousRotateAngle = angle;
  }

  /**
   * Checks if touch is attached.
   *
   * @returns True if attached
   *
   * @example
   * ```typescript
   * if (!touch.isAttached()) {
   *   touch.attach(canvas);
   * }
   * ```
   */
  isAttached(): boolean {
    return this.attached;
  }

  /**
   * Disposes the touch handler, detaching all listeners.
   *
   * @example
   * ```typescript
   * touch.dispose();
   * ```
   */
  dispose(): void {
    this.detach();
    logger.debug('Touch disposed');
  }
}
