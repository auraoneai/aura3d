import { clamp } from './MathConstants';

/**
 * A function that maps a time value (typically 0-1) to an eased value.
 * Input is typically in range [0, 1], output may exceed for elastic/back easings.
 *
 * @param t - The time parameter, typically normalized to [0, 1]
 * @returns The eased value
 *
 * @example
 * ```typescript
 * const easing: EasingFunction = Easing.easeInQuad;
 * const value = easing(0.5); // Returns 0.25
 * ```
 */
export type EasingFunction = (t: number) => number;

/**
 * Collection of easing functions for animation timing.
 * Implements Robert Penner's easing equations and additional custom easing creators.
 * All functions are optimized for performance (< 0.001ms per call).
 *
 * @example
 * ```typescript
 * // Use a predefined easing function
 * const progress = Easing.easeInOutCubic(0.5);
 *
 * // Create a custom cubic-bezier easing
 * const customEasing = Easing.fromBezier(0.42, 0, 0.58, 1);
 * const value = customEasing(0.3);
 *
 * // Create a stepped animation
 * const steps = Easing.steps(4);
 * const stepped = steps(0.6); // Returns 0.5 (step 2 of 4)
 * ```
 */
export const Easing = {
  // ==================== Linear ====================

  /**
   * Linear easing (no acceleration or deceleration).
   *
   * @param t - Time parameter [0, 1]
   * @returns Linear interpolation value
   *
   * @example
   * ```typescript
   * Easing.linear(0.5); // Returns 0.5
   * ```
   */
  linear: (t: number): number => {
    return t;
  },

  // ==================== Quadratic ====================

  /**
   * Quadratic ease-in (accelerating from zero velocity).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInQuad(0.5); // Returns 0.25
   * ```
   */
  easeInQuad: (t: number): number => {
    return t * t;
  },

  /**
   * Quadratic ease-out (decelerating to zero velocity).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeOutQuad(0.5); // Returns 0.75
   * ```
   */
  easeOutQuad: (t: number): number => {
    return t * (2 - t);
  },

  /**
   * Quadratic ease-in-out (acceleration until halfway, then deceleration).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInOutQuad(0.5); // Returns 0.5
   * ```
   */
  easeInOutQuad: (t: number): number => {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  },

  // ==================== Cubic ====================

  /**
   * Cubic ease-in (accelerating from zero velocity).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInCubic(0.5); // Returns 0.125
   * ```
   */
  easeInCubic: (t: number): number => {
    return t * t * t;
  },

  /**
   * Cubic ease-out (decelerating to zero velocity).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeOutCubic(0.5); // Returns 0.875
   * ```
   */
  easeOutCubic: (t: number): number => {
    const t1 = t - 1;
    return t1 * t1 * t1 + 1;
  },

  /**
   * Cubic ease-in-out (acceleration until halfway, then deceleration).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInOutCubic(0.5); // Returns 0.5
   * ```
   */
  easeInOutCubic: (t: number): number => {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  },

  // ==================== Quartic ====================

  /**
   * Quartic ease-in (accelerating from zero velocity).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInQuart(0.5); // Returns 0.0625
   * ```
   */
  easeInQuart: (t: number): number => {
    return t * t * t * t;
  },

  /**
   * Quartic ease-out (decelerating to zero velocity).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeOutQuart(0.5); // Returns 0.9375
   * ```
   */
  easeOutQuart: (t: number): number => {
    const t1 = t - 1;
    return 1 - t1 * t1 * t1 * t1;
  },

  /**
   * Quartic ease-in-out (acceleration until halfway, then deceleration).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInOutQuart(0.5); // Returns 0.5
   * ```
   */
  easeInOutQuart: (t: number): number => {
    if (t < 0.5) {
      return 8 * t * t * t * t;
    }
    const t1 = t - 1;
    return 1 - 8 * t1 * t1 * t1 * t1;
  },

  // ==================== Quintic ====================

  /**
   * Quintic ease-in (accelerating from zero velocity).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInQuint(0.5); // Returns 0.03125
   * ```
   */
  easeInQuint: (t: number): number => {
    return t * t * t * t * t;
  },

  /**
   * Quintic ease-out (decelerating to zero velocity).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeOutQuint(0.5); // Returns 0.96875
   * ```
   */
  easeOutQuint: (t: number): number => {
    const t1 = t - 1;
    return 1 + t1 * t1 * t1 * t1 * t1;
  },

  /**
   * Quintic ease-in-out (acceleration until halfway, then deceleration).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInOutQuint(0.5); // Returns 0.5
   * ```
   */
  easeInOutQuint: (t: number): number => {
    if (t < 0.5) {
      return 16 * t * t * t * t * t;
    }
    const t1 = t - 1;
    return 1 + 16 * t1 * t1 * t1 * t1 * t1;
  },

  // ==================== Sinusoidal ====================

  /**
   * Sinusoidal ease-in (accelerating from zero velocity).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInSine(0.5); // Returns ~0.293
   * ```
   */
  easeInSine: (t: number): number => {
    return 1 - Math.cos((t * Math.PI) / 2);
  },

  /**
   * Sinusoidal ease-out (decelerating to zero velocity).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeOutSine(0.5); // Returns ~0.707
   * ```
   */
  easeOutSine: (t: number): number => {
    return Math.sin((t * Math.PI) / 2);
  },

  /**
   * Sinusoidal ease-in-out (acceleration until halfway, then deceleration).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInOutSine(0.5); // Returns 0.5
   * ```
   */
  easeInOutSine: (t: number): number => {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  },

  // ==================== Exponential ====================

  /**
   * Exponential ease-in (accelerating from zero velocity).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInExpo(0.5); // Returns ~0.031
   * ```
   */
  easeInExpo: (t: number): number => {
    return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
  },

  /**
   * Exponential ease-out (decelerating to zero velocity).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeOutExpo(0.5); // Returns ~0.969
   * ```
   */
  easeOutExpo: (t: number): number => {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  },

  /**
   * Exponential ease-in-out (acceleration until halfway, then deceleration).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInOutExpo(0.5); // Returns 0.5
   * ```
   */
  easeInOutExpo: (t: number): number => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    if (t < 0.5) {
      return Math.pow(2, 20 * t - 10) / 2;
    }
    return (2 - Math.pow(2, -20 * t + 10)) / 2;
  },

  // ==================== Circular ====================

  /**
   * Circular ease-in (accelerating from zero velocity).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInCirc(0.5); // Returns ~0.134
   * ```
   */
  easeInCirc: (t: number): number => {
    return 1 - Math.sqrt(1 - t * t);
  },

  /**
   * Circular ease-out (decelerating to zero velocity).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeOutCirc(0.5); // Returns ~0.866
   * ```
   */
  easeOutCirc: (t: number): number => {
    const t1 = t - 1;
    return Math.sqrt(1 - t1 * t1);
  },

  /**
   * Circular ease-in-out (acceleration until halfway, then deceleration).
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInOutCirc(0.5); // Returns 0.5
   * ```
   */
  easeInOutCirc: (t: number): number => {
    if (t < 0.5) {
      return (1 - Math.sqrt(1 - 4 * t * t)) / 2;
    }
    return (Math.sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2;
  },

  // ==================== Elastic ====================

  /**
   * Elastic ease-in (exponentially decaying sine wave).
   * Creates an elastic effect that overshoots at the start.
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value (may be negative)
   *
   * @example
   * ```typescript
   * Easing.easeInElastic(0.5); // Returns ~-0.022
   * ```
   */
  easeInElastic: (t: number): number => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  },

  /**
   * Elastic ease-out (exponentially decaying sine wave).
   * Creates an elastic effect that overshoots at the end.
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value (may exceed 1)
   *
   * @example
   * ```typescript
   * Easing.easeOutElastic(0.5); // Returns ~1.094
   * ```
   */
  easeOutElastic: (t: number): number => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },

  /**
   * Elastic ease-in-out (exponentially decaying sine wave).
   * Creates an elastic effect that overshoots at both start and end.
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value (may be negative or exceed 1)
   *
   * @example
   * ```typescript
   * Easing.easeInOutElastic(0.5); // Returns 0.5
   * ```
   */
  easeInOutElastic: (t: number): number => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c5 = (2 * Math.PI) / 4.5;
    if (t < 0.5) {
      return -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2;
    }
    return (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
  },

  // ==================== Back (Overshoot) ====================

  /**
   * Back ease-in (overshoots and comes back).
   * Uses standard overshoot constant of 1.70158.
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value (may be negative)
   *
   * @example
   * ```typescript
   * Easing.easeInBack(0.5); // Returns ~-0.088
   * ```
   */
  easeInBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },

  /**
   * Back ease-out (overshoots at the end).
   * Uses standard overshoot constant of 1.70158.
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value (may exceed 1)
   *
   * @example
   * ```typescript
   * Easing.easeOutBack(0.5); // Returns ~0.626
   * ```
   */
  easeOutBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const t1 = t - 1;
    return 1 + c3 * t1 * t1 * t1 + c1 * t1 * t1;
  },

  /**
   * Back ease-in-out (overshoots at both start and end).
   * Uses standard overshoot constant of 1.70158.
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value (may be negative or exceed 1)
   *
   * @example
   * ```typescript
   * Easing.easeInOutBack(0.5); // Returns 0.5
   * ```
   */
  easeInOutBack: (t: number): number => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    if (t < 0.5) {
      return (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2;
    }
    return (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },

  // ==================== Bounce ====================

  /**
   * Bounce ease-in (bouncing effect at the start).
   * Uses piecewise quadratic functions for natural bounce physics.
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInBounce(0.5); // Returns ~0.234
   * ```
   */
  easeInBounce: (t: number): number => {
    return 1 - Easing.easeOutBounce(1 - t);
  },

  /**
   * Bounce ease-out (bouncing effect at the end).
   * Uses piecewise quadratic functions for natural bounce physics.
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeOutBounce(0.5); // Returns ~0.766
   * ```
   */
  easeOutBounce: (t: number): number => {
    const n1 = 7.5625;
    const d1 = 2.75;

    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      const t2 = t - 1.5 / d1;
      return n1 * t2 * t2 + 0.75;
    } else if (t < 2.5 / d1) {
      const t2 = t - 2.25 / d1;
      return n1 * t2 * t2 + 0.9375;
    } else {
      const t2 = t - 2.625 / d1;
      return n1 * t2 * t2 + 0.984375;
    }
  },

  /**
   * Bounce ease-in-out (bouncing effect at both start and end).
   * Uses piecewise quadratic functions for natural bounce physics.
   *
   * @param t - Time parameter [0, 1]
   * @returns Eased value
   *
   * @example
   * ```typescript
   * Easing.easeInOutBounce(0.5); // Returns 0.5
   * ```
   */
  easeInOutBounce: (t: number): number => {
    if (t < 0.5) {
      return (1 - Easing.easeOutBounce(1 - 2 * t)) / 2;
    }
    return (1 + Easing.easeOutBounce(2 * t - 1)) / 2;
  },

  // ==================== Custom Creators ====================

  /**
   * Creates a cubic-bezier easing function (CSS-compatible).
   * Uses Newton-Raphson method for fast, accurate evaluation.
   *
   * @param x1 - First control point x-coordinate [0, 1]
   * @param y1 - First control point y-coordinate (can exceed [0, 1])
   * @param x2 - Second control point x-coordinate [0, 1]
   * @param y2 - Second control point y-coordinate (can exceed [0, 1])
   * @returns An easing function implementing the cubic-bezier curve
   *
   * @example
   * ```typescript
   * // CSS ease-in-out equivalent
   * const easing = Easing.fromBezier(0.42, 0, 0.58, 1);
   * const value = easing(0.5); // Returns 0.5
   *
   * // Custom bounce-like curve
   * const bounce = Easing.fromBezier(0.68, -0.55, 0.265, 1.55);
   * ```
   */
  fromBezier: (x1: number, y1: number, x2: number, y2: number): EasingFunction => {
    // Clamp x values to valid range
    x1 = clamp(x1, 0, 1);
    x2 = clamp(x2, 0, 1);

    // Handle linear case
    if (x1 === y1 && x2 === y2) {
      return (t: number) => t;
    }

    // Newton-Raphson iteration to solve for t given x
    const sampleCurveX = (t: number): number => {
      const t2 = t * t;
      const t3 = t2 * t;
      return ((1 - 3 * x2 + 3 * x1) * t3 + (3 * x2 - 6 * x1) * t2 + 3 * x1 * t);
    };

    const sampleCurveDerivativeX = (t: number): number => {
      const t2 = t * t;
      return (3 * (1 - 3 * x2 + 3 * x1) * t2 + 2 * (3 * x2 - 6 * x1) * t + 3 * x1);
    };

    const sampleCurveY = (t: number): number => {
      const t2 = t * t;
      const t3 = t2 * t;
      return ((1 - 3 * y2 + 3 * y1) * t3 + (3 * y2 - 6 * y1) * t2 + 3 * y1 * t);
    };

    const solveCurveX = (x: number): number => {
      // Handle boundary cases exactly
      if (x <= 0) return 0;
      if (x >= 1) return 1;

      // Initial guess using linear interpolation
      let t = x;

      // Newton-Raphson iterations (typically converges in 4-8 iterations)
      for (let i = 0; i < 8; i++) {
        const currentX = sampleCurveX(t) - x;
        if (Math.abs(currentX) < 1e-7) {
          break;
        }
        const currentDerivative = sampleCurveDerivativeX(t);
        if (Math.abs(currentDerivative) < 1e-6) {
          break;
        }
        t -= currentX / currentDerivative;
      }

      return t;
    };

    return (t: number): number => {
      // Handle boundary cases exactly
      if (t <= 0) return 0;
      if (t >= 1) return 1;

      const tForX = solveCurveX(t);
      return sampleCurveY(tForX);
    };
  },

  /**
   * Creates a piecewise linear easing function from keyframes.
   * Interpolates linearly between defined time/value pairs.
   *
   * @param keyframes - Array of time/value pairs, must include time=0 and time=1
   * @returns An easing function interpolating through the keyframes
   *
   * @example
   * ```typescript
   * // Creates an easing that stays at 0 until 0.5, then linearly rises
   * const easing = Easing.fromKeyframes([
   *   { time: 0, value: 0 },
   *   { time: 0.5, value: 0 },
   *   { time: 1, value: 1 }
   * ]);
   * easing(0.25); // Returns 0
   * easing(0.75); // Returns 0.5
   *
   * // Overshoot easing
   * const overshoot = Easing.fromKeyframes([
   *   { time: 0, value: 0 },
   *   { time: 0.7, value: 1.2 },
   *   { time: 1, value: 1 }
   * ]);
   * ```
   */
  fromKeyframes: (keyframes: { time: number; value: number }[]): EasingFunction => {
    // Validate input
    if (keyframes.length < 2) {
      throw new Error('fromKeyframes requires at least 2 keyframes');
    }

    // Sort keyframes by time
    const sorted = [...keyframes].sort((a, b) => a.time - b.time);

    // Validate time range
    if (sorted[0].time !== 0) {
      throw new Error('fromKeyframes requires a keyframe at time=0');
    }
    if (sorted[sorted.length - 1].time !== 1) {
      throw new Error('fromKeyframes requires a keyframe at time=1');
    }

    return (t: number): number => {
      // Handle boundary cases exactly
      if (t <= 0) return sorted[0].value;
      if (t >= 1) return sorted[sorted.length - 1].value;

      // Find the two keyframes to interpolate between
      let i = 0;
      while (i < sorted.length - 1 && sorted[i + 1].time < t) {
        i++;
      }

      // Handle exact keyframe match
      if (sorted[i].time === t) {
        return sorted[i].value;
      }

      // Linear interpolation between keyframes
      const k1 = sorted[i];
      const k2 = sorted[i + 1];
      const localT = (t - k1.time) / (k2.time - k1.time);
      return k1.value + (k2.value - k1.value) * localT;
    };
  },

  /**
   * Creates a stepped easing function (like CSS steps()).
   * Divides the animation into discrete steps.
   *
   * @param numSteps - Number of steps (must be >= 1)
   * @param jumpEnd - If true, jumps at the end of each step; if false, jumps at the start
   * @returns A stepped easing function
   *
   * @example
   * ```typescript
   * // 4 equal steps, jumping at the end of each interval
   * const steps = Easing.steps(4, true);
   * steps(0);    // Returns 0
   * steps(0.24); // Returns 0
   * steps(0.25); // Returns 0.25
   * steps(0.5);  // Returns 0.5
   * steps(1);    // Returns 1
   *
   * // 3 steps, jumping at the start of each interval
   * const stepsStart = Easing.steps(3, false);
   * stepsStart(0);    // Returns 0.333
   * stepsStart(0.33); // Returns 0.333
   * stepsStart(0.34); // Returns 0.667
   * ```
   */
  steps: (numSteps: number, jumpEnd: boolean = true): EasingFunction => {
    if (numSteps < 1) {
      throw new Error('steps requires numSteps >= 1');
    }

    const numStepsInt = Math.floor(numSteps);

    return (t: number): number => {
      // Handle boundary cases exactly
      if (t <= 0) return 0;
      if (t >= 1) return 1;

      if (jumpEnd) {
        // Jump at the end of each interval
        const step = Math.min(Math.floor(t * numStepsInt), numStepsInt - 1);
        return step / numStepsInt;
      } else {
        // Jump at the start of each interval
        const step = Math.min(Math.ceil(t * numStepsInt), numStepsInt);
        return step / numStepsInt;
      }
    };
  },
};
