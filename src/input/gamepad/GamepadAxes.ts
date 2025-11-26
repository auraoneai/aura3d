/**
 * GamepadAxes - Gamepad axis definitions with dead zone handling
 *
 * Provides axis enumeration, dead zone calculations, and radial dead zones
 * for analog sticks. Supports standard gamepad layouts with two sticks
 * and trigger axes.
 *
 * @module input/gamepad/GamepadAxes
 */

import { Vector2 } from '../../math/Vector2';

/**
 * Standard gamepad axis indices based on W3C Gamepad API specification.
 *
 * @example
 * ```typescript
 * const leftX = gamepad.getAxis(GamepadAxes.LeftStickX);
 * const leftY = gamepad.getAxis(GamepadAxes.LeftStickY);
 * ```
 */
export enum GamepadAxes {
  /** Left stick horizontal axis (-1 = left, +1 = right) */
  LeftStickX = 0,
  /** Left stick vertical axis (-1 = up, +1 = down) */
  LeftStickY = 1,
  /** Right stick horizontal axis (-1 = left, +1 = right) */
  RightStickX = 2,
  /** Right stick vertical axis (-1 = up, +1 = down) */
  RightStickY = 3
}

/**
 * Dead zone application modes for analog sticks.
 */
export enum DeadZoneMode {
  /** Apply dead zone to each axis independently (creates a square dead zone) */
  Axial = 'axial',
  /** Apply dead zone based on stick magnitude (creates a circular dead zone) */
  Radial = 'radial',
  /** Scaled radial dead zone that maintains edge precision */
  ScaledRadial = 'scaled-radial'
}

/**
 * Configuration for dead zone handling.
 *
 * @example
 * ```typescript
 * const config: DeadZoneConfig = {
 *   mode: DeadZoneMode.ScaledRadial,
 *   threshold: 0.15,
 *   edgeThreshold: 0.95
 * };
 * ```
 */
export interface DeadZoneConfig {
  /** Dead zone mode to use */
  mode: DeadZoneMode;
  /** Minimum threshold before input is registered (0-1) */
  threshold: number;
  /** Optional threshold for edge detection (0-1) */
  edgeThreshold?: number;
}

/**
 * Default dead zone configuration.
 */
export const DEFAULT_DEAD_ZONE_CONFIG: DeadZoneConfig = {
  mode: DeadZoneMode.ScaledRadial,
  threshold: 0.15,
  edgeThreshold: 0.95
};

/**
 * Applies axial dead zone to a single axis value.
 * Values below the threshold are set to 0, values above are remapped.
 *
 * @param value - Raw axis value (-1 to 1)
 * @param threshold - Dead zone threshold (0 to 1)
 * @returns Processed axis value with dead zone applied
 *
 * @example
 * ```typescript
 * const processed = applyAxialDeadZone(0.1, 0.15); // 0 (below threshold)
 * const processed2 = applyAxialDeadZone(0.5, 0.15); // ~0.41 (remapped)
 * ```
 */
export function applyAxialDeadZone(value: number, threshold: number): number {
  const absValue = Math.abs(value);

  if (absValue < threshold) {
    return 0;
  }

  // Remap from [threshold, 1] to [0, 1]
  const sign = Math.sign(value);
  const remapped = (absValue - threshold) / (1 - threshold);
  return sign * remapped;
}

/**
 * Applies radial dead zone to a 2D stick input.
 * Creates a circular dead zone based on magnitude.
 *
 * @param x - Horizontal axis value (-1 to 1)
 * @param y - Vertical axis value (-1 to 1)
 * @param threshold - Dead zone threshold (0 to 1)
 * @returns Processed stick values as Vector2
 *
 * @example
 * ```typescript
 * const stick = applyRadialDeadZone(0.1, 0.1, 0.15);
 * console.log(stick.x, stick.y); // 0, 0 (within dead zone)
 * ```
 */
export function applyRadialDeadZone(
  x: number,
  y: number,
  threshold: number
): Vector2 {
  const magnitude = Math.sqrt(x * x + y * y);

  if (magnitude < threshold) {
    return new Vector2(0, 0);
  }

  // Keep direction, adjust magnitude
  const scale = 1 / magnitude;
  return new Vector2(x * scale, y * scale).scale(magnitude);
}

/**
 * Applies scaled radial dead zone to a 2D stick input.
 * Creates a circular dead zone with magnitude remapping for better precision.
 *
 * @param x - Horizontal axis value (-1 to 1)
 * @param y - Vertical axis value (-1 to 1)
 * @param threshold - Dead zone threshold (0 to 1)
 * @param edgeThreshold - Optional edge threshold for precision (0 to 1)
 * @returns Processed stick values as Vector2
 *
 * @example
 * ```typescript
 * const stick = applyScaledRadialDeadZone(0.5, 0.5, 0.15, 0.95);
 * ```
 */
export function applyScaledRadialDeadZone(
  x: number,
  y: number,
  threshold: number,
  edgeThreshold: number = 0.95
): Vector2 {
  const magnitude = Math.sqrt(x * x + y * y);

  if (magnitude < threshold) {
    return new Vector2(0, 0);
  }

  // Normalize direction
  const normalizedX = x / magnitude;
  const normalizedY = y / magnitude;

  // Remap magnitude from [threshold, 1] to [0, 1]
  let remappedMagnitude = (magnitude - threshold) / (1 - threshold);

  // Apply edge threshold for better max value precision
  if (magnitude > edgeThreshold) {
    remappedMagnitude = 1;
  }

  // Clamp to valid range
  remappedMagnitude = Math.min(1, remappedMagnitude);

  return new Vector2(
    normalizedX * remappedMagnitude,
    normalizedY * remappedMagnitude
  );
}

/**
 * Applies configured dead zone to stick input.
 *
 * @param x - Horizontal axis value (-1 to 1)
 * @param y - Vertical axis value (-1 to 1)
 * @param config - Dead zone configuration
 * @returns Processed stick values as Vector2
 *
 * @example
 * ```typescript
 * const config: DeadZoneConfig = {
 *   mode: DeadZoneMode.ScaledRadial,
 *   threshold: 0.15
 * };
 * const stick = applyDeadZone(rawX, rawY, config);
 * ```
 */
export function applyDeadZone(
  x: number,
  y: number,
  config: DeadZoneConfig
): Vector2 {
  switch (config.mode) {
    case DeadZoneMode.Axial:
      return new Vector2(
        applyAxialDeadZone(x, config.threshold),
        applyAxialDeadZone(y, config.threshold)
      );

    case DeadZoneMode.Radial:
      return applyRadialDeadZone(x, y, config.threshold);

    case DeadZoneMode.ScaledRadial:
      return applyScaledRadialDeadZone(
        x,
        y,
        config.threshold,
        config.edgeThreshold || 0.95
      );

    default:
      return new Vector2(x, y);
  }
}

/**
 * Gets both axes for a stick as a Vector2.
 *
 * @param axes - Array of axis values from gamepad
 * @param leftStick - True for left stick, false for right stick
 * @returns Stick values as Vector2
 *
 * @example
 * ```typescript
 * const leftStick = getStickVector(gamepad.axes, true);
 * const rightStick = getStickVector(gamepad.axes, false);
 * ```
 */
export function getStickVector(axes: readonly number[], leftStick: boolean): Vector2 {
  if (leftStick) {
    return new Vector2(
      axes[GamepadAxes.LeftStickX] || 0,
      axes[GamepadAxes.LeftStickY] || 0
    );
  } else {
    return new Vector2(
      axes[GamepadAxes.RightStickX] || 0,
      axes[GamepadAxes.RightStickY] || 0
    );
  }
}

/**
 * Human-readable axis names for debugging.
 */
export const GamepadAxisNames: Record<GamepadAxes, string> = {
  [GamepadAxes.LeftStickX]: 'Left Stick X',
  [GamepadAxes.LeftStickY]: 'Left Stick Y',
  [GamepadAxes.RightStickX]: 'Right Stick X',
  [GamepadAxes.RightStickY]: 'Right Stick Y'
};

/**
 * Checks if an axis index is valid.
 *
 * @param axis - Axis index to validate
 * @returns True if the axis index is valid
 *
 * @example
 * ```typescript
 * if (isValidAxis(2)) {
 *   console.log('Valid axis');
 * }
 * ```
 */
export function isValidAxis(axis: number): axis is GamepadAxes {
  return axis >= 0 && axis <= 3 && Number.isInteger(axis);
}

/**
 * Normalizes axis value to ensure it's in the valid range.
 *
 * @param value - Raw axis value
 * @returns Clamped axis value (-1 to 1)
 *
 * @example
 * ```typescript
 * const normalized = normalizeAxisValue(1.5); // 1
 * ```
 */
export function normalizeAxisValue(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/**
 * Inverts an axis value (flips sign).
 *
 * @param value - Axis value to invert
 * @returns Inverted axis value
 *
 * @example
 * ```typescript
 * const inverted = invertAxis(0.5); // -0.5
 * ```
 */
export function invertAxis(value: number): number {
  return -value;
}

/**
 * Calculates stick angle in radians from X and Y axes.
 *
 * @param x - Horizontal axis value
 * @param y - Vertical axis value
 * @returns Angle in radians (-PI to PI)
 *
 * @example
 * ```typescript
 * const angle = getStickAngle(1, 0); // 0 (pointing right)
 * const angle2 = getStickAngle(0, 1); // PI/2 (pointing down)
 * ```
 */
export function getStickAngle(x: number, y: number): number {
  return Math.atan2(y, x);
}

/**
 * Calculates stick magnitude from X and Y axes.
 *
 * @param x - Horizontal axis value
 * @param y - Vertical axis value
 * @returns Magnitude (0 to ~1.414 for raw values, typically normalized to 0-1)
 *
 * @example
 * ```typescript
 * const magnitude = getStickMagnitude(0.7, 0.7); // ~0.99
 * ```
 */
export function getStickMagnitude(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
