/**
 * TouchPoint - Individual touch point with position, pressure, and radius
 *
 * Represents a single touch contact with comprehensive tracking including
 * position, movement delta, pressure, contact radius, and lifetime tracking.
 *
 * @module input/touch/TouchPoint
 */

import { Vector2 } from '../../math/Vector2';

/**
 * Touch point state and properties.
 *
 * @example
 * ```typescript
 * const touchPoint: TouchPoint = {
 *   id: 0,
 *   position: new Vector2(100, 200),
 *   previousPosition: new Vector2(100, 200),
 *   delta: new Vector2(0, 0),
 *   startPosition: new Vector2(100, 200),
 *   pressure: 0.8,
 *   radiusX: 10,
 *   radiusY: 10,
 *   rotationAngle: 0,
 *   startTime: performance.now(),
 *   lastUpdateTime: performance.now(),
 *   age: 0,
 *   active: true
 * };
 * ```
 */
export interface TouchPoint {
  /** Unique touch identifier (persistent across touch lifecycle) */
  id: number;

  /** Current position in screen/canvas coordinates */
  position: Vector2;

  /** Position in previous frame */
  previousPosition: Vector2;

  /** Movement delta since last frame */
  delta: Vector2;

  /** Starting position when touch began */
  startPosition: Vector2;

  /** Touch pressure (0-1), defaults to 1 if not supported */
  pressure: number;

  /** Touch contact radius X in pixels */
  radiusX: number;

  /** Touch contact radius Y in pixels */
  radiusY: number;

  /** Touch contact rotation angle in radians */
  rotationAngle: number;

  /** Timestamp when touch started */
  startTime: number;

  /** Timestamp of last update */
  lastUpdateTime: number;

  /** Age of touch in milliseconds */
  age: number;

  /** Whether this touch is currently active */
  active: boolean;
}

/**
 * Creates a new touch point from a browser Touch object.
 *
 * @param touch - Browser Touch object
 * @param targetElement - Target element for coordinate calculation
 * @returns New TouchPoint
 *
 * @example
 * ```typescript
 * const touchPoint = createTouchPoint(browserTouch, canvas);
 * ```
 */
export function createTouchPoint(
  touch: Touch,
  targetElement: HTMLElement
): TouchPoint {
  const rect = targetElement.getBoundingClientRect();
  const position = new Vector2(
    touch.clientX - rect.left,
    touch.clientY - rect.top
  );

  const now = performance.now();

  return {
    id: touch.identifier,
    position: position.clone(),
    previousPosition: position.clone(),
    delta: new Vector2(0, 0),
    startPosition: position.clone(),
    pressure: touch.force || 1.0,
    radiusX: touch.radiusX || 0,
    radiusY: touch.radiusY || 0,
    rotationAngle: touch.rotationAngle || 0,
    startTime: now,
    lastUpdateTime: now,
    age: 0,
    active: true
  };
}

/**
 * Updates a touch point from a browser Touch object.
 *
 * @param touchPoint - Touch point to update
 * @param touch - Browser Touch object
 * @param targetElement - Target element for coordinate calculation
 *
 * @example
 * ```typescript
 * updateTouchPoint(existingTouch, browserTouch, canvas);
 * ```
 */
export function updateTouchPoint(
  touchPoint: TouchPoint,
  touch: Touch,
  targetElement: HTMLElement
): void {
  const rect = targetElement.getBoundingClientRect();
  const newPosition = new Vector2(
    touch.clientX - rect.left,
    touch.clientY - rect.top
  );

  const now = performance.now();

  // Update positions
  touchPoint.previousPosition.copy(touchPoint.position);
  touchPoint.position.copy(newPosition);
  touchPoint.delta.set(
    newPosition.x - touchPoint.previousPosition.x,
    newPosition.y - touchPoint.previousPosition.y
  );

  // Update properties
  touchPoint.pressure = touch.force || 1.0;
  touchPoint.radiusX = touch.radiusX || 0;
  touchPoint.radiusY = touch.radiusY || 0;
  touchPoint.rotationAngle = touch.rotationAngle || 0;
  touchPoint.lastUpdateTime = now;
  touchPoint.age = now - touchPoint.startTime;
}

/**
 * Calculates the distance traveled by a touch point.
 *
 * @param touchPoint - Touch point to measure
 * @returns Distance in pixels from start position
 *
 * @example
 * ```typescript
 * const distance = getTouchDistance(touchPoint);
 * if (distance > 50) {
 *   console.log('Touch moved more than 50 pixels');
 * }
 * ```
 */
export function getTouchDistance(touchPoint: TouchPoint): number {
  return touchPoint.position.distanceTo(touchPoint.startPosition);
}

/**
 * Calculates the velocity of a touch point.
 *
 * @param touchPoint - Touch point to measure
 * @returns Velocity vector in pixels per second
 *
 * @example
 * ```typescript
 * const velocity = getTouchVelocity(touchPoint);
 * console.log(`Speed: ${velocity.length()} px/s`);
 * ```
 */
export function getTouchVelocity(touchPoint: TouchPoint): Vector2 {
  const deltaTime = (performance.now() - touchPoint.lastUpdateTime) / 1000;
  if (deltaTime === 0) {
    return new Vector2(0, 0);
  }

  return new Vector2(
    touchPoint.delta.x / deltaTime,
    touchPoint.delta.y / deltaTime
  );
}

/**
 * Calculates the direction vector of touch movement.
 *
 * @param touchPoint - Touch point to measure
 * @returns Normalized direction vector from start to current position
 *
 * @example
 * ```typescript
 * const direction = getTouchDirection(touchPoint);
 * if (direction.x > 0.5) {
 *   console.log('Swiping right');
 * }
 * ```
 */
export function getTouchDirection(touchPoint: TouchPoint): Vector2 {
  return touchPoint.position.subtract(touchPoint.startPosition).normalize();
}

/**
 * Calculates the duration of a touch in seconds.
 *
 * @param touchPoint - Touch point to measure
 * @returns Duration in seconds
 *
 * @example
 * ```typescript
 * const duration = getTouchDuration(touchPoint);
 * if (duration > 1.0) {
 *   console.log('Long press detected');
 * }
 * ```
 */
export function getTouchDuration(touchPoint: TouchPoint): number {
  return touchPoint.age / 1000;
}

/**
 * Checks if a touch point is stationary (minimal movement).
 *
 * @param touchPoint - Touch point to check
 * @param threshold - Movement threshold in pixels (default: 10)
 * @returns True if touch has moved less than threshold
 *
 * @example
 * ```typescript
 * if (isTouchStationary(touchPoint, 5)) {
 *   console.log('Touch is stationary');
 * }
 * ```
 */
export function isTouchStationary(touchPoint: TouchPoint, threshold: number = 10): boolean {
  return getTouchDistance(touchPoint) < threshold;
}

/**
 * Checks if a touch point is moving (exceeds velocity threshold).
 *
 * @param touchPoint - Touch point to check
 * @param threshold - Velocity threshold in pixels per second (default: 100)
 * @returns True if touch velocity exceeds threshold
 *
 * @example
 * ```typescript
 * if (isTouchMoving(touchPoint, 200)) {
 *   console.log('Touch is moving fast');
 * }
 * ```
 */
export function isTouchMoving(touchPoint: TouchPoint, threshold: number = 100): boolean {
  const velocity = getTouchVelocity(touchPoint);
  return velocity.length() > threshold;
}

/**
 * Gets the average radius of a touch point.
 *
 * @param touchPoint - Touch point to measure
 * @returns Average radius in pixels
 *
 * @example
 * ```typescript
 * const radius = getTouchRadius(touchPoint);
 * console.log(`Touch radius: ${radius}px`);
 * ```
 */
export function getTouchRadius(touchPoint: TouchPoint): number {
  return (touchPoint.radiusX + touchPoint.radiusY) / 2;
}

/**
 * Clones a touch point.
 *
 * @param touchPoint - Touch point to clone
 * @returns Cloned touch point
 *
 * @example
 * ```typescript
 * const copy = cloneTouchPoint(originalTouch);
 * ```
 */
export function cloneTouchPoint(touchPoint: TouchPoint): TouchPoint {
  return {
    id: touchPoint.id,
    position: touchPoint.position.clone(),
    previousPosition: touchPoint.previousPosition.clone(),
    delta: touchPoint.delta.clone(),
    startPosition: touchPoint.startPosition.clone(),
    pressure: touchPoint.pressure,
    radiusX: touchPoint.radiusX,
    radiusY: touchPoint.radiusY,
    rotationAngle: touchPoint.rotationAngle,
    startTime: touchPoint.startTime,
    lastUpdateTime: touchPoint.lastUpdateTime,
    age: touchPoint.age,
    active: touchPoint.active
  };
}

/**
 * Resets touch point delta (call after processing).
 *
 * @param touchPoint - Touch point to reset
 *
 * @example
 * ```typescript
 * resetTouchDelta(touchPoint);
 * ```
 */
export function resetTouchDelta(touchPoint: TouchPoint): void {
  touchPoint.delta.set(0, 0);
}
