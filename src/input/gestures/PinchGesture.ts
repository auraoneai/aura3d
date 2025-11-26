/**
 * PinchGesture - Pinch to zoom gesture detection
 *
 * Detects two-finger pinch gestures for zoom and scale operations.
 *
 * @module input/gestures/PinchGesture
 */

import { TouchPoint } from '../touch/TouchPoint';
import { GestureDetector, GestureState, touchDistance } from './GestureDetector';

export interface PinchGestureEventData {
  scale: number;
  velocity: number;
  distance: number;
}

export interface PinchGestureConfig {
  minScale?: number;
}

export class PinchGesture extends GestureDetector<PinchGestureEventData> {
  private config: Required<PinchGestureConfig>;
  private initialDistance: number = 0;
  private previousDistance: number = 0;
  private previousTime: number = 0;

  constructor(config: PinchGestureConfig = {}) {
    super('PinchGesture');
    this.config = {
      minScale: config.minScale || 0.01
    };
  }

  protected onTouchesStarted(touches: TouchPoint[]): void {
    if (this.touches.length === 2) {
      this.initialDistance = touchDistance(this.touches[0], this.touches[1]);
      this.previousDistance = this.initialDistance;
      this.previousTime = performance.now();
      this.setState(GestureState.Began);
    }
  }

  protected onTouchesUpdated(touches: TouchPoint[]): void {
    if (this.touches.length === 2 && (this.state === GestureState.Began || this.state === GestureState.Changed)) {
      const distance = touchDistance(this.touches[0], this.touches[1]);
      const scale = distance / this.previousDistance;
      const now = performance.now();
      const deltaTime = (now - this.previousTime) / 1000;
      const velocity = deltaTime > 0 ? (distance - this.previousDistance) / deltaTime : 0;

      if (Math.abs(scale - 1) >= this.config.minScale) {
        this.emit({ scale, velocity, distance });
        this.setState(GestureState.Changed);
        this.previousDistance = distance;
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
    this.initialDistance = 0;
    this.previousDistance = 0;
    this.previousTime = 0;
  }
}
