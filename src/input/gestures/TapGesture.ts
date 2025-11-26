/**
 * TapGesture - Tap, double-tap, and long press detection
 *
 * Detects single tap, double tap, and long press gestures with
 * configurable timing and distance thresholds.
 *
 * @module input/gestures/TapGesture
 */

import { Vector2 } from '../../math/Vector2';
import { TouchPoint, getTouchDuration, getTouchDistance } from '../touch/TouchPoint';
import { GestureDetector, GestureState, BaseGestureEvent } from './GestureDetector';

/**
 * Tap gesture event data.
 */
export interface TapGestureEventData {
  /** Tap position */
  position: Vector2;
  /** Number of taps (1 for single, 2 for double) */
  tapCount: number;
}

/**
 * Tap gesture configuration.
 */
export interface TapGestureConfig {
  /** Maximum tap duration in seconds */
  maxDuration?: number;
  /** Maximum movement distance in pixels */
  maxDistance?: number;
  /** Maximum interval between taps for double-tap in seconds */
  doubleTapInterval?: number;
  /** Long press duration in seconds */
  longPressDuration?: number;
}

/**
 * Tap gesture detector for single tap, double tap, and long press.
 *
 * @example
 * ```typescript
 * const tapGesture = new TapGesture({
 *   maxDuration: 0.3,
 *   doubleTapInterval: 0.4,
 *   longPressDuration: 0.5
 * });
 *
 * tapGesture.on((event) => {
 *   if (event.state === GestureState.Ended) {
 *     if (event.tapCount === 1) {
 *       console.log('Single tap');
 *     } else if (event.tapCount === 2) {
 *       console.log('Double tap');
 *     }
 *   }
 * });
 * ```
 */
export class TapGesture extends GestureDetector<TapGestureEventData> {
  private config: Required<TapGestureConfig>;
  private lastTapTime: number = 0;
  private lastTapPosition: Vector2 | null = null;
  private longPressTimer: number | null = null;
  private initialTouch: TouchPoint | null = null;

  constructor(config: TapGestureConfig = {}) {
    super('TapGesture');
    this.config = {
      maxDuration: config.maxDuration || 0.3,
      maxDistance: config.maxDistance || 10,
      doubleTapInterval: config.doubleTapInterval || 0.4,
      longPressDuration: config.longPressDuration || 0.5
    };
  }

  protected onTouchesStarted(touches: TouchPoint[]): void {
    if (this.touches.length === 1) {
      this.initialTouch = touches[0];
      this.setState(GestureState.Possible);
      this.startLongPressTimer();
    } else {
      this.setState(GestureState.Failed);
    }
  }

  protected onTouchesUpdated(touches: TouchPoint[]): void {
    if (this.state === GestureState.Possible && this.initialTouch) {
      const distance = getTouchDistance(this.initialTouch);
      if (distance > this.config.maxDistance) {
        this.cancelLongPressTimer();
        this.setState(GestureState.Failed);
      }
    }
  }

  protected onTouchesEnded(touches: TouchPoint[]): void {
    this.cancelLongPressTimer();

    if (this.state === GestureState.Possible && this.initialTouch) {
      const duration = getTouchDuration(this.initialTouch);
      const distance = getTouchDistance(this.initialTouch);

      if (duration <= this.config.maxDuration && distance <= this.config.maxDistance) {
        this.detectTap(this.initialTouch);
      } else {
        this.setState(GestureState.Failed);
      }
    }

    this.initialTouch = null;
  }

  private detectTap(touch: TouchPoint): void {
    const now = performance.now() / 1000;
    const timeSinceLastTap = now - this.lastTapTime;

    let tapCount = 1;

    if (timeSinceLastTap < this.config.doubleTapInterval &&
        this.lastTapPosition &&
        touch.position.distanceTo(this.lastTapPosition) < this.config.maxDistance) {
      tapCount = 2;
      this.lastTapTime = 0;
      this.lastTapPosition = null;
    } else {
      this.lastTapTime = now;
      this.lastTapPosition = touch.position.clone();
    }

    this.setState(GestureState.Ended);
    this.emit({
      position: touch.position.clone(),
      tapCount
    });
  }

  private startLongPressTimer(): void {
    this.cancelLongPressTimer();
    this.longPressTimer = window.setTimeout(() => {
      if (this.state === GestureState.Possible && this.initialTouch) {
        this.setState(GestureState.Began);
        this.emit({
          position: this.initialTouch.position.clone(),
          tapCount: 0
        });
      }
    }, this.config.longPressDuration * 1000);
  }

  private cancelLongPressTimer(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  protected override onReset(): void {
    this.cancelLongPressTimer();
    this.initialTouch = null;
  }
}
