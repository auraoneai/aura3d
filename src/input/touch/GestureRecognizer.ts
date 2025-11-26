/**
 * GestureRecognizer - Multi-touch gesture detection
 *
 * Detects common multi-touch gestures including tap, double-tap, long press,
 * pan, pinch, rotate, and swipe. Provides unified interface for gesture events.
 *
 * @module input/touch/GestureRecognizer
 */

import { Vector2 } from '../../math/Vector2';
import { Logger } from '../../core/Logger';
import { TouchPoint, getTouchDistance, getTouchDuration, getTouchVelocity } from './TouchPoint';

const logger = Logger.create('GestureRecognizer');

/**
 * Gesture types.
 */
export enum GestureType {
  Tap = 'tap',
  DoubleTap = 'double-tap',
  LongPress = 'long-press',
  Pan = 'pan',
  Pinch = 'pinch',
  Rotate = 'rotate',
  Swipe = 'swipe'
}

/**
 * Base gesture event data.
 */
export interface GestureEvent {
  /** Gesture type */
  type: GestureType;
  /** Center position of gesture */
  center: Vector2;
  /** Timestamp */
  timestamp: number;
}

/**
 * Tap gesture event.
 */
export interface TapGestureEvent extends GestureEvent {
  type: GestureType.Tap;
  /** Tap position */
  position: Vector2;
}

/**
 * Double-tap gesture event.
 */
export interface DoubleTapGestureEvent extends GestureEvent {
  type: GestureType.DoubleTap;
  /** Tap position */
  position: Vector2;
}

/**
 * Long press gesture event.
 */
export interface LongPressGestureEvent extends GestureEvent {
  type: GestureType.LongPress;
  /** Press position */
  position: Vector2;
  /** Press duration */
  duration: number;
}

/**
 * Pan gesture event.
 */
export interface PanGestureEvent extends GestureEvent {
  type: GestureType.Pan;
  /** Movement delta */
  delta: Vector2;
  /** Total distance from start */
  distance: number;
  /** Velocity */
  velocity: Vector2;
}

/**
 * Pinch gesture event.
 */
export interface PinchGestureEvent extends GestureEvent {
  type: GestureType.Pinch;
  /** Scale factor (> 1 = zoom in, < 1 = zoom out) */
  scale: number;
  /** Current distance between touches */
  distance: number;
}

/**
 * Rotate gesture event.
 */
export interface RotateGestureEvent extends GestureEvent {
  type: GestureType.Rotate;
  /** Rotation angle in radians */
  angle: number;
  /** Angle delta since last frame */
  delta: number;
}

/**
 * Swipe gesture event.
 */
export interface SwipeGestureEvent extends GestureEvent {
  type: GestureType.Swipe;
  /** Swipe direction (normalized) */
  direction: Vector2;
  /** Swipe velocity */
  velocity: number;
  /** Swipe distance */
  distance: number;
}

/**
 * Union type of all gesture events.
 */
export type AnyGestureEvent =
  | TapGestureEvent
  | DoubleTapGestureEvent
  | LongPressGestureEvent
  | PanGestureEvent
  | PinchGestureEvent
  | RotateGestureEvent
  | SwipeGestureEvent;

/**
 * Gesture recognition configuration.
 */
export interface GestureConfig {
  /** Maximum tap duration in seconds */
  tapDuration?: number;
  /** Maximum tap movement in pixels */
  tapDistance?: number;
  /** Maximum time between double taps in seconds */
  doubleTapInterval?: number;
  /** Long press duration in seconds */
  longPressDuration?: number;
  /** Minimum swipe velocity in pixels/second */
  swipeMinVelocity?: number;
  /** Minimum swipe distance in pixels */
  swipeMinDistance?: number;
  /** Minimum pan distance in pixels */
  panMinDistance?: number;
}

/**
 * Default gesture configuration.
 */
const DEFAULT_CONFIG: Required<GestureConfig> = {
  tapDuration: 0.3,
  tapDistance: 10,
  doubleTapInterval: 0.3,
  longPressDuration: 0.5,
  swipeMinVelocity: 300,
  swipeMinDistance: 30,
  panMinDistance: 10
};

/**
 * Multi-touch gesture recognizer.
 *
 * @example
 * ```typescript
 * const recognizer = new GestureRecognizer();
 *
 * recognizer.on('tap', (event) => {
 *   console.log('Tapped at', event.position);
 * });
 *
 * recognizer.on('pinch', (event) => {
 *   camera.zoom *= event.scale;
 * });
 *
 * // Feed touch updates
 * recognizer.onTouchStart(touchPoint);
 * recognizer.onTouchMove(touchPoint);
 * recognizer.onTouchEnd(touchPoint);
 *
 * // Update each frame
 * recognizer.update();
 * ```
 */
export class GestureRecognizer {
  /** Configuration */
  private config: Required<GestureConfig>;

  /** Event listeners */
  private listeners: Map<GestureType, Set<(event: AnyGestureEvent) => void>> = new Map();

  /** Active touches */
  private touches: Map<number, TouchPoint> = new Map();

  /** Last tap time for double-tap detection */
  private lastTapTime: number = 0;
  private lastTapPosition: Vector2 | null = null;

  /** Long press timer */
  private longPressTimer: number | null = null;
  private longPressTouch: TouchPoint | null = null;

  /** Previous pinch distance */
  private previousPinchDistance: number = 0;

  /** Previous rotation angle */
  private previousRotateAngle: number = 0;

  /**
   * Creates a new gesture recognizer.
   *
   * @param config - Optional configuration
   *
   * @example
   * ```typescript
   * const recognizer = new GestureRecognizer({
   *   tapDuration: 0.2,
   *   longPressDuration: 1.0
   * });
   * ```
   */
  constructor(config: GestureConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.debug('GestureRecognizer created');
  }

  /**
   * Registers an event listener.
   *
   * @param type - Gesture type
   * @param callback - Event callback
   *
   * @example
   * ```typescript
   * recognizer.on('tap', (event) => {
   *   console.log('Tap detected');
   * });
   * ```
   */
  on(type: GestureType, callback: (event: AnyGestureEvent) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
  }

  /**
   * Removes an event listener.
   *
   * @param type - Gesture type
   * @param callback - Event callback to remove
   *
   * @example
   * ```typescript
   * recognizer.off('tap', tapHandler);
   * ```
   */
  off(type: GestureType, callback: (event: AnyGestureEvent) => void): void {
    this.listeners.get(type)?.delete(callback);
  }

  /**
   * Handles touch start.
   *
   * @param touch - Touch point
   *
   * @example
   * ```typescript
   * recognizer.onTouchStart(touchPoint);
   * ```
   */
  onTouchStart(touch: TouchPoint): void {
    this.touches.set(touch.id, touch);

    // Start long press timer for single touch
    if (this.touches.size === 1) {
      this.startLongPressTimer(touch);
    } else {
      this.cancelLongPressTimer();
    }
  }

  /**
   * Handles touch move.
   *
   * @param touch - Touch point
   *
   * @example
   * ```typescript
   * recognizer.onTouchMove(touchPoint);
   * ```
   */
  onTouchMove(touch: TouchPoint): void {
    this.touches.set(touch.id, touch);

    // Cancel long press if touch moved too much
    if (this.longPressTouch && getTouchDistance(touch) > this.config.tapDistance) {
      this.cancelLongPressTimer();
    }
  }

  /**
   * Handles touch end.
   *
   * @param touch - Touch point
   *
   * @example
   * ```typescript
   * recognizer.onTouchEnd(touchPoint);
   * ```
   */
  onTouchEnd(touch: TouchPoint): void {
    const wasSingleTouch = this.touches.size === 1;

    this.touches.delete(touch.id);
    this.cancelLongPressTimer();

    if (wasSingleTouch) {
      this.detectTapGestures(touch);
      this.detectSwipeGesture(touch);
    }
  }

  /**
   * Updates gesture recognition. Call once per frame.
   *
   * @example
   * ```typescript
   * recognizer.update();
   * ```
   */
  update(): void {
    const touchCount = this.touches.size;

    if (touchCount === 1) {
      this.detectPanGesture();
    } else if (touchCount === 2) {
      this.detectPinchGesture();
      this.detectRotateGesture();
    }
  }

  /**
   * Detects tap and double-tap gestures.
   * @private
   */
  private detectTapGestures(touch: TouchPoint): void {
    const duration = getTouchDuration(touch);
    const distance = getTouchDistance(touch);

    if (duration > this.config.tapDuration || distance > this.config.tapDistance) {
      return;
    }

    const now = performance.now() / 1000;
    const timeSinceLastTap = now - this.lastTapTime;

    // Check for double-tap
    if (timeSinceLastTap < this.config.doubleTapInterval &&
        this.lastTapPosition &&
        touch.position.distanceTo(this.lastTapPosition) < this.config.tapDistance) {

      this.emit({
        type: GestureType.DoubleTap,
        position: touch.position.clone(),
        center: touch.position.clone(),
        timestamp: now
      });

      this.lastTapTime = 0;
      this.lastTapPosition = null;
    } else {
      // Single tap
      this.emit({
        type: GestureType.Tap,
        position: touch.position.clone(),
        center: touch.position.clone(),
        timestamp: now
      });

      this.lastTapTime = now;
      this.lastTapPosition = touch.position.clone();
    }
  }

  /**
   * Detects swipe gestures.
   * @private
   */
  private detectSwipeGesture(touch: TouchPoint): void {
    const distance = getTouchDistance(touch);
    const velocity = getTouchVelocity(touch);
    const speed = velocity.length();

    if (speed < this.config.swipeMinVelocity || distance < this.config.swipeMinDistance) {
      return;
    }

    const direction = touch.position.subtract(touch.startPosition).normalize();

    this.emit({
      type: GestureType.Swipe,
      direction,
      velocity: speed,
      distance,
      center: touch.position.clone(),
      timestamp: performance.now() / 1000
    });
  }

  /**
   * Detects pan gestures.
   * @private
   */
  private detectPanGesture(): void {
    const touches = Array.from(this.touches.values());
    if (touches.length !== 1) return;

    const touch = touches[0];
    const distance = getTouchDistance(touch);

    if (distance < this.config.panMinDistance) return;

    const velocity = getTouchVelocity(touch);

    this.emit({
      type: GestureType.Pan,
      delta: touch.delta.clone(),
      distance,
      velocity,
      center: touch.position.clone(),
      timestamp: performance.now() / 1000
    });
  }

  /**
   * Detects pinch gestures.
   * @private
   */
  private detectPinchGesture(): void {
    const touches = Array.from(this.touches.values());
    if (touches.length !== 2) {
      this.previousPinchDistance = 0;
      return;
    }

    const [t1, t2] = touches;
    const distance = t1.position.distanceTo(t2.position);
    const center = t1.position.add(t2.position).scale(0.5);

    if (this.previousPinchDistance === 0) {
      this.previousPinchDistance = distance;
      return;
    }

    const scale = distance / this.previousPinchDistance;

    this.emit({
      type: GestureType.Pinch,
      scale,
      distance,
      center,
      timestamp: performance.now() / 1000
    });

    this.previousPinchDistance = distance;
  }

  /**
   * Detects rotate gestures.
   * @private
   */
  private detectRotateGesture(): void {
    const touches = Array.from(this.touches.values());
    if (touches.length !== 2) {
      this.previousRotateAngle = 0;
      return;
    }

    const [t1, t2] = touches;
    const diff = t2.position.subtract(t1.position);
    const angle = Math.atan2(diff.y, diff.x);
    const center = t1.position.add(t2.position).scale(0.5);

    if (this.previousRotateAngle === 0) {
      this.previousRotateAngle = angle;
      return;
    }

    let delta = angle - this.previousRotateAngle;

    // Normalize delta to -PI to PI
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;

    this.emit({
      type: GestureType.Rotate,
      angle,
      delta,
      center,
      timestamp: performance.now() / 1000
    });

    this.previousRotateAngle = angle;
  }

  /**
   * Starts long press timer.
   * @private
   */
  private startLongPressTimer(touch: TouchPoint): void {
    this.cancelLongPressTimer();

    this.longPressTouch = touch;
    this.longPressTimer = window.setTimeout(() => {
      if (this.longPressTouch) {
        this.emit({
          type: GestureType.LongPress,
          position: this.longPressTouch.position.clone(),
          duration: getTouchDuration(this.longPressTouch),
          center: this.longPressTouch.position.clone(),
          timestamp: performance.now() / 1000
        });
      }
      this.longPressTimer = null;
    }, this.config.longPressDuration * 1000);
  }

  /**
   * Cancels long press timer.
   * @private
   */
  private cancelLongPressTimer(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressTouch = null;
  }

  /**
   * Emits a gesture event.
   * @private
   */
  private emit(event: AnyGestureEvent): void {
    const listeners = this.listeners.get(event.type);
    if (!listeners) return;

    for (const callback of listeners) {
      try {
        callback(event);
      } catch (error) {
        logger.error(`Error in gesture callback for ${event.type}`, error);
      }
    }
  }

  /**
   * Clears all state.
   *
   * @example
   * ```typescript
   * recognizer.reset();
   * ```
   */
  reset(): void {
    this.touches.clear();
    this.cancelLongPressTimer();
    this.previousPinchDistance = 0;
    this.previousRotateAngle = 0;
    logger.debug('GestureRecognizer reset');
  }
}
