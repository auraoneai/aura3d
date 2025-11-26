/**
 * GestureDetector - Base framework for gesture detection
 *
 * Provides base class and utilities for creating custom gesture detectors
 * with state management and lifecycle hooks.
 *
 * @module input/gestures/GestureDetector
 */

import { Vector2 } from '../../math/Vector2';
import { Logger } from '../../core/Logger';
import { TouchPoint } from '../touch/TouchPoint';

const logger = Logger.create('GestureDetector');

/**
 * Gesture detector state.
 */
export enum GestureState {
  /** Gesture not started */
  Idle = 'idle',
  /** Gesture possibly starting (conditions being checked) */
  Possible = 'possible',
  /** Gesture started */
  Began = 'began',
  /** Gesture in progress */
  Changed = 'changed',
  /** Gesture ended successfully */
  Ended = 'ended',
  /** Gesture cancelled */
  Cancelled = 'cancelled',
  /** Gesture failed (conditions not met) */
  Failed = 'failed'
}

/**
 * Base gesture event.
 */
export interface BaseGestureEvent {
  /** Gesture state */
  state: GestureState;
  /** Event timestamp */
  timestamp: number;
  /** Center position of gesture */
  center: Vector2;
  /** Number of touches involved */
  touchCount: number;
}

/**
 * Base class for gesture detectors.
 *
 * @example
 * ```typescript
 * class MyGesture extends GestureDetector<MyEventData> {
 *   protected onTouchesStarted(touches: TouchPoint[]): void {
 *     if (touches.length === 1) {
 *       this.setState(GestureState.Began);
 *     }
 *   }
 *
 *   protected onTouchesUpdated(touches: TouchPoint[]): void {
 *     if (this.state === GestureState.Began) {
 *       this.setState(GestureState.Changed);
 *       this.emit({ customData: 'value' });
 *     }
 *   }
 *
 *   protected onTouchesEnded(touches: TouchPoint[]): void {
 *     this.setState(GestureState.Ended);
 *   }
 * }
 * ```
 */
export abstract class GestureDetector<TEventData = unknown> {
  /** Current gesture state */
  protected state: GestureState = GestureState.Idle;

  /** Active touches */
  protected touches: TouchPoint[] = [];

  /** Event listeners */
  protected listeners: Set<(event: BaseGestureEvent & TEventData) => void> = new Set();

  /** Gesture name for debugging */
  protected name: string;

  /**
   * Creates a new gesture detector.
   *
   * @param name - Gesture name for debugging
   */
  constructor(name: string) {
    this.name = name;
  }

  /**
   * Adds a touch to the gesture.
   *
   * @param touch - Touch point to add
   */
  addTouch(touch: TouchPoint): void {
    this.touches.push(touch);
    this.onTouchesStarted([touch]);
  }

  /**
   * Updates a touch in the gesture.
   *
   * @param touch - Updated touch point
   */
  updateTouch(touch: TouchPoint): void {
    const index = this.touches.findIndex(t => t.id === touch.id);
    if (index >= 0) {
      this.touches[index] = touch;
      this.onTouchesUpdated([touch]);
    }
  }

  /**
   * Removes a touch from the gesture.
   *
   * @param touch - Touch point to remove
   */
  removeTouch(touch: TouchPoint): void {
    const index = this.touches.findIndex(t => t.id === touch.id);
    if (index >= 0) {
      this.touches.splice(index, 1);
      this.onTouchesEnded([touch]);

      if (this.touches.length === 0) {
        this.reset();
      }
    }
  }

  /**
   * Updates the gesture detector.
   */
  update(): void {
    if (this.touches.length > 0) {
      this.onUpdate();
    }
  }

  /**
   * Registers an event listener.
   *
   * @param callback - Event callback
   */
  on(callback: (event: BaseGestureEvent & TEventData) => void): void {
    this.listeners.add(callback);
  }

  /**
   * Removes an event listener.
   *
   * @param callback - Event callback to remove
   */
  off(callback: (event: BaseGestureEvent & TEventData) => void): void {
    this.listeners.delete(callback);
  }

  /**
   * Gets the current state.
   *
   * @returns Current gesture state
   */
  getState(): GestureState {
    return this.state;
  }

  /**
   * Checks if gesture is active.
   *
   * @returns True if gesture is in progress
   */
  isActive(): boolean {
    return this.state === GestureState.Began ||
           this.state === GestureState.Changed;
  }

  /**
   * Resets the gesture detector.
   */
  reset(): void {
    this.state = GestureState.Idle;
    this.touches = [];
    this.onReset();
  }

  /**
   * Sets the gesture state and emits events.
   *
   * @param newState - New state
   * @protected
   */
  protected setState(newState: GestureState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;

    logger.debug(`${this.name} state: ${oldState} -> ${newState}`);
    this.onStateChanged(oldState, newState);
  }

  /**
   * Emits a gesture event.
   *
   * @param data - Event data
   * @protected
   */
  protected emit(data: TEventData): void {
    const event: BaseGestureEvent & TEventData = {
      state: this.state,
      timestamp: performance.now() / 1000,
      center: this.getCenter(),
      touchCount: this.touches.length,
      ...data
    };

    for (const callback of this.listeners) {
      try {
        callback(event);
      } catch (error) {
        logger.error(`Error in ${this.name} callback`, error);
      }
    }
  }

  /**
   * Gets the center position of all touches.
   *
   * @returns Center position
   * @protected
   */
  protected getCenter(): Vector2 {
    if (this.touches.length === 0) {
      return new Vector2(0, 0);
    }

    const sum = this.touches.reduce(
      (acc, touch) => acc.add(touch.position),
      new Vector2(0, 0)
    );

    return sum.scale(1 / this.touches.length);
  }

  /**
   * Called when touches are added.
   *
   * @param touches - Added touches
   * @protected
   */
  protected abstract onTouchesStarted(touches: TouchPoint[]): void;

  /**
   * Called when touches are updated.
   *
   * @param touches - Updated touches
   * @protected
   */
  protected abstract onTouchesUpdated(touches: TouchPoint[]): void;

  /**
   * Called when touches are removed.
   *
   * @param touches - Removed touches
   * @protected
   */
  protected abstract onTouchesEnded(touches: TouchPoint[]): void;

  /**
   * Called each update frame.
   * @protected
   */
  protected onUpdate(): void {
    // Override in subclasses
  }

  /**
   * Called when state changes.
   *
   * @param _oldState - Previous state
   * @param _newState - New state
   * @protected
   */
  protected onStateChanged(_oldState: GestureState, _newState: GestureState): void {
    // Override in subclasses
  }

  /**
   * Called when gesture is reset.
   * @protected
   */
  protected onReset(): void {
    // Override in subclasses
  }
}

/**
 * Helper function to calculate distance between two touches.
 *
 * @param t1 - First touch
 * @param t2 - Second touch
 * @returns Distance in pixels
 */
export function touchDistance(t1: TouchPoint, t2: TouchPoint): number {
  return Vector2.distance(t1.position, t2.position);
}

/**
 * Helper function to calculate angle between two touches.
 *
 * @param t1 - First touch
 * @param t2 - Second touch
 * @returns Angle in radians
 */
export function touchAngle(t1: TouchPoint, t2: TouchPoint): number {
  const diff = t2.position.sub(t1.position);
  return Math.atan2(diff.y, diff.x);
}

/**
 * Helper function to calculate center of two touches.
 *
 * @param t1 - First touch
 * @param t2 - Second touch
 * @returns Center position
 */
export function touchCenter(t1: TouchPoint, t2: TouchPoint): Vector2 {
  return t1.position.add(t2.position).scale(0.5);
}
