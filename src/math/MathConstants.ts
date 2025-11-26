/**
 * Mathematical constants and utility functions for the G3D graphics library.
 * @module MathConstants
 */

/**
 * Collection of mathematical constants used throughout the graphics library.
 */
export const MathConstants = {
  /**
   * Pi constant (π ≈ 3.14159...)
   */
  PI: Math.PI,

  /**
   * Two times Pi (2π ≈ 6.28318...)
   */
  TWO_PI: Math.PI * 2,

  /**
   * Half of Pi (π/2 ≈ 1.57079...)
   */
  HALF_PI: Math.PI / 2,

  /**
   * Quarter of Pi (π/4 ≈ 0.78539...)
   */
  QUARTER_PI: Math.PI / 4,

  /**
   * Conversion factor from degrees to radians (π/180)
   */
  DEG_TO_RAD: Math.PI / 180,

  /**
   * Conversion factor from radians to degrees (180/π)
   */
  RAD_TO_DEG: 180 / Math.PI,

  /**
   * Small epsilon value for floating-point comparisons (1e-6)
   */
  EPSILON: 1e-6,

  /**
   * Squared epsilon value for distance comparisons (1e-12)
   */
  EPSILON_SQUARED: 1e-12,

  /**
   * Golden ratio (φ ≈ 1.61803...)
   */
  PHI: (1 + Math.sqrt(5)) / 2,

  /**
   * Square root of 2 (√2 ≈ 1.41421...)
   */
  SQRT2: Math.SQRT2,

  /**
   * Square root of 3 (√3 ≈ 1.73205...)
   */
  SQRT3: Math.sqrt(3),

  /**
   * Maximum safe integer in JavaScript (2^53 - 1)
   */
  MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,

  /**
   * Minimum safe integer in JavaScript (-(2^53 - 1))
   */
  MIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER,
} as const;

/**
 * Clamps a value between a minimum and maximum bound.
 *
 * @param value - The value to clamp
 * @param min - The minimum bound
 * @param max - The maximum bound
 * @returns The clamped value in the range [min, max]
 *
 * @example
 * ```typescript
 * clamp(5, 0, 10);   // Returns 5
 * clamp(-5, 0, 10);  // Returns 0
 * clamp(15, 0, 10);  // Returns 10
 * ```
 */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Clamps a value to the range [0, 1].
 *
 * @param value - The value to saturate
 * @returns The saturated value in the range [0, 1]
 *
 * @example
 * ```typescript
 * saturate(0.5);  // Returns 0.5
 * saturate(-0.5); // Returns 0
 * saturate(1.5);  // Returns 1
 * ```
 */
export function saturate(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Returns the sign of a number.
 *
 * @param value - The value to check
 * @returns -1 if negative, 1 if positive, 0 if zero, NaN if NaN
 *
 * @example
 * ```typescript
 * sign(5);    // Returns 1
 * sign(-5);   // Returns -1
 * sign(0);    // Returns 0
 * sign(-0);   // Returns -0
 * ```
 */
export function sign(value: number): number {
  return Math.sign(value);
}

/**
 * Checks if a value is a power of two.
 *
 * @param value - The value to check
 * @returns True if the value is a power of two, false otherwise
 *
 * @example
 * ```typescript
 * isPowerOfTwo(16);   // Returns true
 * isPowerOfTwo(15);   // Returns false
 * isPowerOfTwo(1024); // Returns true
 * isPowerOfTwo(0);    // Returns false
 * ```
 */
export function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

/**
 * Returns the next power of two greater than or equal to the given value.
 * Useful for calculating texture sizes and buffer allocations.
 *
 * @param value - The input value
 * @returns The next power of two, or 1 if value <= 0
 *
 * @example
 * ```typescript
 * nextPowerOfTwo(15);  // Returns 16
 * nextPowerOfTwo(16);  // Returns 16
 * nextPowerOfTwo(17);  // Returns 32
 * nextPowerOfTwo(0);   // Returns 1
 * ```
 */
export function nextPowerOfTwo(value: number): number {
  if (value <= 0) {
    return 1;
  }

  // If already a power of two, return as-is
  if (isPowerOfTwo(value)) {
    return value;
  }

  // Use bit manipulation to find next power of two
  value--;
  value |= value >> 1;
  value |= value >> 2;
  value |= value >> 4;
  value |= value >> 8;
  value |= value >> 16;
  value++;

  return value;
}

/**
 * Checks if two numbers are nearly equal within a specified epsilon tolerance.
 * Handles special cases including infinity and NaN.
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @param epsilon - Optional epsilon tolerance (defaults to MathConstants.EPSILON)
 * @returns True if the values are nearly equal, false otherwise
 *
 * @example
 * ```typescript
 * nearlyEqual(1.0, 1.0000001);              // Returns true
 * nearlyEqual(1.0, 1.1);                    // Returns false
 * nearlyEqual(1.0, 1.001, 0.01);            // Returns true
 * nearlyEqual(Infinity, Infinity);          // Returns true
 * nearlyEqual(NaN, NaN);                    // Returns false
 * nearlyEqual(Infinity, -Infinity);         // Returns false
 * ```
 */
export function nearlyEqual(a: number, b: number, epsilon: number = MathConstants.EPSILON): boolean {
  // Handle exact equality (including infinity)
  if (a === b) {
    return true;
  }

  // Handle NaN cases (NaN is never equal to anything, including itself)
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return false;
  }

  // Handle infinity cases
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return false;
  }

  // Check if the absolute difference is within epsilon
  return Math.abs(a - b) <= epsilon;
}

/**
 * Converts degrees to radians.
 *
 * @param degrees - Angle in degrees
 * @returns Angle in radians
 *
 * @example
 * ```typescript
 * toRadians(180); // Returns π (≈ 3.14159)
 * toRadians(90);  // Returns π/2 (≈ 1.57079)
 * toRadians(0);   // Returns 0
 * ```
 */
export function toRadians(degrees: number): number {
  return degrees * MathConstants.DEG_TO_RAD;
}

/**
 * Converts radians to degrees.
 *
 * @param radians - Angle in radians
 * @returns Angle in degrees
 *
 * @example
 * ```typescript
 * toDegrees(Math.PI);     // Returns 180
 * toDegrees(Math.PI / 2); // Returns 90
 * toDegrees(0);           // Returns 0
 * ```
 */
export function toDegrees(radians: number): number {
  return radians * MathConstants.RAD_TO_DEG;
}
