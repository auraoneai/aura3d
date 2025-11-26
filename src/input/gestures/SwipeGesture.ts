/**
 * SwipeGesture - Swipe gesture detection with direction
 *
 * Detects fast swipe gestures with direction and velocity tracking.
 *
 * @module input/gestures/SwipeGesture
 */

import { Vector2 } from '../../math/Vector2';
import { TouchPoint, getTouchDistance, getTouchVelocity, getTouchDirection } from '../touch/TouchPoint';
import { GestureDetector, GestureState } from './GestureDetector';

export interface SwipeGestureEventData {
  direction: Vector2;
  velocity: Vector2;
  distance: number;
}

export interface SwipeGestureConfig {
  minVelocity?: number;
  minDistance?: number;
  maxTouches?: number;
}

export class SwipeGesture extends GestureDetector<SwipeGestureEventData> {
  private config: Required<SwipeGestureConfig>;
  private initialTouch: TouchPoint | null = null;

  constructor(config: SwipeGestureConfig = {}) {
    super('SwipeGesture');
    this.config = {
      minVelocity: config.minVelocity || 300,
      minDistance: config.minDistance || 30,
      maxTouches: config.maxTouches || 1
    };
  }

  protected onTouchesStarted(touches: TouchPoint[]): void {
    if (this.touches.length <= this.config.maxTouches) {
      this.initialTouch = touches[0];
      this.setState(GestureState.Possible);
    }
  }

  protected onTouchesUpdated(touches: TouchPoint[]): void {
    // Swipe detection happens on touch end
  }

  protected onTouchesEnded(touches: TouchPoint[]): void {
    if (this.state === GestureState.Possible && this.initialTouch) {
      const distance = getTouchDistance(this.initialTouch);
      const velocity = getTouchVelocity(this.initialTouch);
      const speed = velocity.length();

      if (speed >= this.config.minVelocity && distance >= this.config.minDistance) {
        const direction = getTouchDirection(this.initialTouch);

        this.setState(GestureState.Ended);
        this.emit({ direction, velocity, distance });
      } else {
        this.setState(GestureState.Failed);
      }
    }

    this.initialTouch = null;
  }

  protected override onReset(): void {
    this.initialTouch = null;
  }
}
