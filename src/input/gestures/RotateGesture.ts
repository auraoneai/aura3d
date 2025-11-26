/**
 * RotateGesture - Two-finger rotation gesture detection
 *
 * Detects two-finger rotation gestures for object manipulation.
 *
 * @module input/gestures/RotateGesture
 */

import { TouchPoint } from '../touch/TouchPoint';
import { GestureDetector, GestureState, touchAngle } from './GestureDetector';

export interface RotateGestureEventData {
  rotation: number;
  delta: number;
  velocity: number;
}

export interface RotateGestureConfig {
  minRotation?: number;
}

export class RotateGesture extends GestureDetector<RotateGestureEventData> {
  private config: Required<RotateGestureConfig>;
  private initialAngle: number = 0;
  private previousAngle: number = 0;
  private previousTime: number = 0;

  constructor(config: RotateGestureConfig = {}) {
    super('RotateGesture');
    this.config = {
      minRotation: config.minRotation || 0.1
    };
  }

  protected onTouchesStarted(touches: TouchPoint[]): void {
    if (this.touches.length === 2) {
      this.initialAngle = touchAngle(this.touches[0], this.touches[1]);
      this.previousAngle = this.initialAngle;
      this.previousTime = performance.now();
      this.setState(GestureState.Began);
    }
  }

  protected onTouchesUpdated(touches: TouchPoint[]): void {
    if (this.touches.length === 2 && (this.state === GestureState.Began || this.state === GestureState.Changed)) {
      const angle = touchAngle(this.touches[0], this.touches[1]);
      let delta = angle - this.previousAngle;

      // Normalize delta to -PI to PI
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;

      if (Math.abs(delta) >= this.config.minRotation) {
        const now = performance.now();
        const deltaTime = (now - this.previousTime) / 1000;
        const velocity = deltaTime > 0 ? delta / deltaTime : 0;

        this.emit({ rotation: angle, delta, velocity });
        this.setState(GestureState.Changed);
        this.previousAngle = angle;
        this.previousTime = now;
      }
    }
  }

  protected onTouchesEnded(touches: TouchPoint[]): void {
    if (this.touches.length < 2) {
      if (this.state === GestureState.Began || this.state === GestureState.Changed) {
        this.setState(GestureState.Ended);
      }
    }
  }

  protected override onReset(): void {
    this.initialAngle = 0;
    this.previousAngle = 0;
    this.previousTime = 0;
  }
}
