/**
 * PanGesture - Pan/drag gesture detection with velocity
 *
 * Detects pan/drag gestures with movement delta and velocity tracking.
 *
 * @module input/gestures/PanGesture
 */

import { Vector2 } from '../../math/Vector2';
import { TouchPoint, getTouchVelocity } from '../touch/TouchPoint';
import { GestureDetector, GestureState } from './GestureDetector';

export interface PanGestureEventData {
  delta: Vector2;
  totalDelta: Vector2;
  velocity: Vector2;
}

export interface PanGestureConfig {
  minDistance?: number;
  minTouches?: number;
  maxTouches?: number;
}

export class PanGesture extends GestureDetector<PanGestureEventData> {
  private config: Required<PanGestureConfig>;
  private startCenter: Vector2 = new Vector2();
  private previousCenter: Vector2 = new Vector2();

  constructor(config: PanGestureConfig = {}) {
    super('PanGesture');
    this.config = {
      minDistance: config.minDistance || 10,
      minTouches: config.minTouches || 1,
      maxTouches: config.maxTouches || 1
    };
  }

  protected onTouchesStarted(_touches: TouchPoint[]): void {
    if (this.touches.length >= this.config.minTouches &&
        this.touches.length <= this.config.maxTouches) {
      this.startCenter = this.getCenter();
      this.previousCenter = this.startCenter.clone();
      this.setState(GestureState.Possible);
    }
  }

  protected onTouchesUpdated(touches: TouchPoint[]): void {
    if (this.state === GestureState.Possible || this.state === GestureState.Began || this.state === GestureState.Changed) {
      const center = this.getCenter();
      const totalDelta = center.subtract(this.startCenter);

      if (this.state === GestureState.Possible && totalDelta.length() >= this.config.minDistance) {
        this.setState(GestureState.Began);
      }

      if (this.state === GestureState.Began || this.state === GestureState.Changed) {
        const delta = center.subtract(this.previousCenter);
        const velocity = this.touches.length > 0 ? getTouchVelocity(this.touches[0]) : new Vector2();

        this.emit({ delta, totalDelta, velocity });
        this.setState(GestureState.Changed);
        this.previousCenter = center;
      }
    }
  }

  protected onTouchesEnded(touches: TouchPoint[]): void {
    if (this.touches.length < this.config.minTouches) {
      if (this.state === GestureState.Began || this.state === GestureState.Changed) {
        this.setState(GestureState.Ended);
      } else {
        this.setState(GestureState.Failed);
      }
    }
  }
}
