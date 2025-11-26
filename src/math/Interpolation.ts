import { clamp, TWO_PI } from './MathConstants';

/**
 * Interpolation functions for animation and blending.
 * Provides linear, smooth, angular, damping, and spline interpolation methods.
 */
const Interpolation = {
  /**
   * Linear interpolation between two values.
   *
   * @param a - Start value
   * @param b - End value
   * @param t - Interpolation factor (0 = a, 1 = b)
   * @returns Interpolated value
   *
   * @example
   * ```ts
   * Interpolation.lerp(0, 10, 0.5); // 5
   * Interpolation.lerp(0, 10, 0.25); // 2.5
   * Interpolation.lerp(0, 10, 1.5); // 15 (not clamped)
   * ```
   */
  lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  },

  /**
   * Linear interpolation between two values with t clamped to [0, 1].
   *
   * @param a - Start value
   * @param b - End value
   * @param t - Interpolation factor (clamped to [0, 1])
   * @returns Interpolated value
   *
   * @example
   * ```ts
   * Interpolation.lerpClamped(0, 10, 0.5); // 5
   * Interpolation.lerpClamped(0, 10, 1.5); // 10 (clamped)
   * Interpolation.lerpClamped(0, 10, -0.5); // 0 (clamped)
   * ```
   */
  lerpClamped(a: number, b: number, t: number): number {
    return a + (b - a) * clamp(t, 0, 1);
  },

  /**
   * Inverse linear interpolation - finds t for a given value between a and b.
   *
   * @param a - Start value
   * @param b - End value
   * @param value - Value to find t for
   * @returns Interpolation factor t
   *
   * @example
   * ```ts
   * Interpolation.inverseLerp(0, 10, 5); // 0.5
   * Interpolation.inverseLerp(0, 10, 2.5); // 0.25
   * Interpolation.inverseLerp(0, 10, 15); // 1.5
   * ```
   */
  inverseLerp(a: number, b: number, value: number): number {
    if (a === b) {
      return 0;
    }
    return (value - a) / (b - a);
  },

  /**
   * Remaps a value from one range to another.
   *
   * @param value - Value to remap
   * @param inMin - Input range minimum
   * @param inMax - Input range maximum
   * @param outMin - Output range minimum
   * @param outMax - Output range maximum
   * @returns Remapped value
   *
   * @example
   * ```ts
   * Interpolation.remap(5, 0, 10, 0, 100); // 50
   * Interpolation.remap(2.5, 0, 10, 0, 1); // 0.25
   * Interpolation.remap(75, 0, 100, -1, 1); // 0.5
   * ```
   */
  remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    const t = this.inverseLerp(inMin, inMax, value);
    return this.lerp(outMin, outMax, t);
  },

  /**
   * Smooth Hermite interpolation with clamping.
   * Returns 0 for x <= edge0, 1 for x >= edge1, smooth transition between.
   *
   * @param edge0 - Lower edge
   * @param edge1 - Upper edge
   * @param x - Value to interpolate
   * @returns Smoothly interpolated value
   *
   * @example
   * ```ts
   * Interpolation.smoothstep(0, 1, 0.5); // 0.5
   * Interpolation.smoothstep(0, 1, 0.25); // ~0.156
   * Interpolation.smoothstep(0, 1, -1); // 0 (clamped)
   * ```
   */
  smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  },

  /**
   * Smoother Hermite interpolation (Ken Perlin's version).
   * Provides even smoother transition than smoothstep.
   *
   * @param edge0 - Lower edge
   * @param edge1 - Upper edge
   * @param x - Value to interpolate
   * @returns Smoothly interpolated value
   *
   * @example
   * ```ts
   * Interpolation.smootherstep(0, 1, 0.5); // 0.5
   * Interpolation.smootherstep(0, 1, 0.25); // ~0.103
   * Interpolation.smootherstep(0, 1, 2); // 1 (clamped)
   * ```
   */
  smootherstep(edge0: number, edge1: number, x: number): number {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  },

  /**
   * Linear interpolation between two angles, taking the shortest path.
   * Handles wraparound from -PI to PI.
   *
   * @param a - Start angle in radians
   * @param b - End angle in radians
   * @param t - Interpolation factor
   * @returns Interpolated angle in radians
   *
   * @example
   * ```ts
   * Interpolation.lerpAngle(0, Math.PI, 0.5); // ~1.571
   * Interpolation.lerpAngle(-Math.PI + 0.1, Math.PI - 0.1, 0.5); // ~3.042 (wraps around)
   * Interpolation.lerpAngle(0, Math.PI * 2, 0.5); // 0 (shortest path)
   * ```
   */
  lerpAngle(a: number, b: number, t: number): number {
    let delta = b - a;

    // Normalize delta to [-PI, PI]
    while (delta > Math.PI) {
      delta -= TWO_PI;
    }
    while (delta < -Math.PI) {
      delta += TWO_PI;
    }

    let result = a + delta * t;

    // Normalize result to [-PI, PI]
    while (result > Math.PI) {
      result -= TWO_PI;
    }
    while (result < -Math.PI) {
      result += TWO_PI;
    }

    return result;
  },

  /**
   * Exponential damping towards a target value.
   * Uses formula: current + (target - current) * (1 - exp(-smoothing * dt))
   *
   * @param current - Current value
   * @param target - Target value
   * @param smoothing - Smoothing factor (higher = faster)
   * @param dt - Delta time
   * @returns Damped value
   *
   * @example
   * ```ts
   * Interpolation.damp(0, 10, 5, 0.1); // ~3.935
   * Interpolation.damp(5, 10, 10, 0.016); // ~6.479
   * Interpolation.damp(9.9, 10, 5, 0.016); // ~9.992
   * ```
   */
  damp(current: number, target: number, smoothing: number, dt: number): number {
    return current + (target - current) * (1 - Math.exp(-smoothing * dt));
  },

  /**
   * Smooth damping with velocity tracking (Unity-style implementation).
   * Gradually changes a value towards a target with spring-like behavior.
   *
   * @param current - Current value
   * @param target - Target value
   * @param velocity - Object with velocity value (modified in place)
   * @param smoothTime - Approximate time to reach target
   * @param maxSpeed - Maximum speed
   * @param dt - Delta time
   * @returns Smoothly damped value
   *
   * @example
   * ```ts
   * const velocity = { value: 0 };
   * Interpolation.smoothDamp(0, 10, velocity, 0.3, Infinity, 0.016);
   * // Returns smoothly interpolated value, updates velocity.value
   * ```
   */
  smoothDamp(
    current: number,
    target: number,
    velocity: { value: number },
    smoothTime: number,
    maxSpeed: number,
    dt: number
  ): number {
    // Prevent division by zero
    smoothTime = Math.max(0.0001, smoothTime);

    const omega = 2 / smoothTime;
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

    let change = current - target;
    const originalTo = target;

    // Clamp maximum speed
    const maxChange = maxSpeed * smoothTime;
    change = clamp(change, -maxChange, maxChange);
    target = current - change;

    const temp = (velocity.value + omega * change) * dt;
    velocity.value = (velocity.value - omega * temp) * exp;

    let output = target + (change + temp) * exp;

    // Prevent overshooting
    if ((originalTo - current > 0) === (output > originalTo)) {
      output = originalTo;
      velocity.value = (output - originalTo) / dt;
    }

    return output;
  },

  /**
   * Cubic Bezier curve interpolation.
   *
   * @param p0 - First control point
   * @param p1 - Second control point
   * @param p2 - Third control point
   * @param p3 - Fourth control point
   * @param t - Interpolation parameter [0, 1]
   * @returns Interpolated value on the curve
   *
   * @example
   * ```ts
   * Interpolation.bezier(0, 3, 7, 10, 0); // 0
   * Interpolation.bezier(0, 3, 7, 10, 0.5); // 5
   * Interpolation.bezier(0, 3, 7, 10, 1); // 10
   * ```
   */
  bezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    return p0 * mt3 + 3 * p1 * mt2 * t + 3 * p2 * mt * t2 + p3 * t3;
  },

  /**
   * Tangent of a cubic Bezier curve at parameter t.
   *
   * @param p0 - First control point
   * @param p1 - Second control point
   * @param p2 - Third control point
   * @param p3 - Fourth control point
   * @param t - Interpolation parameter [0, 1]
   * @returns Tangent value at t
   *
   * @example
   * ```ts
   * Interpolation.bezierTangent(0, 3, 7, 10, 0); // 9 (tangent at start)
   * Interpolation.bezierTangent(0, 3, 7, 10, 1); // 9 (tangent at end)
   * ```
   */
  bezierTangent(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t;
    const mt = 1 - t;
    const mt2 = mt * mt;

    return 3 * mt2 * (p1 - p0) + 6 * mt * t * (p2 - p1) + 3 * t2 * (p3 - p2);
  },

  /**
   * Quadratic Bezier curve interpolation.
   *
   * @param p0 - First control point
   * @param p1 - Second control point
   * @param p2 - Third control point
   * @param t - Interpolation parameter [0, 1]
   * @returns Interpolated value on the curve
   *
   * @example
   * ```ts
   * Interpolation.quadraticBezier(0, 5, 10, 0); // 0
   * Interpolation.quadraticBezier(0, 5, 10, 0.5); // 5
   * Interpolation.quadraticBezier(0, 5, 10, 1); // 10
   * ```
   */
  quadraticBezier(p0: number, p1: number, p2: number, t: number): number {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;

    return p0 * mt2 + 2 * p1 * mt * t + p2 * t2;
  },

  /**
   * Catmull-Rom spline interpolation.
   * Passes through p1 and p2, uses p0 and p3 for curve shape.
   *
   * @param p0 - Point before start
   * @param p1 - Start point
   * @param p2 - End point
   * @param p3 - Point after end
   * @param t - Interpolation parameter [0, 1]
   * @returns Interpolated value on the curve
   *
   * @example
   * ```ts
   * Interpolation.catmullRom(0, 2, 8, 10, 0); // 2 (starts at p1)
   * Interpolation.catmullRom(0, 2, 8, 10, 0.5); // 5
   * Interpolation.catmullRom(0, 2, 8, 10, 1); // 8 (ends at p2)
   * ```
   */
  catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;

    return 0.5 * (
      2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  },

  /**
   * Tangent of a Catmull-Rom spline at parameter t.
   *
   * @param p0 - Point before start
   * @param p1 - Start point
   * @param p2 - End point
   * @param p3 - Point after end
   * @param t - Interpolation parameter [0, 1]
   * @returns Tangent value at t
   *
   * @example
   * ```ts
   * Interpolation.catmullRomTangent(0, 2, 8, 10, 0); // 3 (tangent at start)
   * Interpolation.catmullRomTangent(0, 2, 8, 10, 1); // 4 (tangent at end)
   * ```
   */
  catmullRomTangent(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t;

    return 0.5 * (
      (-p0 + p2) +
      2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t +
      3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2
    );
  },

  /**
   * Hermite spline interpolation with explicit tangents.
   *
   * @param p0 - Start point
   * @param m0 - Start tangent
   * @param p1 - End point
   * @param m1 - End tangent
   * @param t - Interpolation parameter [0, 1]
   * @returns Interpolated value on the curve
   *
   * @example
   * ```ts
   * Interpolation.hermite(0, 5, 10, 5, 0); // 0
   * Interpolation.hermite(0, 5, 10, 5, 0.5); // 5
   * Interpolation.hermite(0, 5, 10, 5, 1); // 10
   * ```
   */
  hermite(p0: number, m0: number, p1: number, m1: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;

    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
  },

  /**
   * Bilinear interpolation for 2D texture sampling.
   *
   * @param v00 - Value at (0, 0)
   * @param v10 - Value at (1, 0)
   * @param v01 - Value at (0, 1)
   * @param v11 - Value at (1, 1)
   * @param tx - X interpolation parameter [0, 1]
   * @param ty - Y interpolation parameter [0, 1]
   * @returns Interpolated value
   *
   * @example
   * ```ts
   * Interpolation.bilinear(0, 10, 20, 30, 0.5, 0.5); // 15
   * Interpolation.bilinear(0, 10, 0, 10, 0.5, 0.5); // 5
   * Interpolation.bilinear(1, 2, 3, 4, 0, 0); // 1
   * ```
   */
  bilinear(
    v00: number,
    v10: number,
    v01: number,
    v11: number,
    tx: number,
    ty: number
  ): number {
    const v0 = this.lerp(v00, v10, tx);
    const v1 = this.lerp(v01, v11, tx);
    return this.lerp(v0, v1, ty);
  },

  /**
   * Trilinear interpolation for 3D texture sampling.
   *
   * @param v000 - Value at (0, 0, 0)
   * @param v100 - Value at (1, 0, 0)
   * @param v010 - Value at (0, 1, 0)
   * @param v110 - Value at (1, 1, 0)
   * @param v001 - Value at (0, 0, 1)
   * @param v101 - Value at (1, 0, 1)
   * @param v011 - Value at (0, 1, 1)
   * @param v111 - Value at (1, 1, 1)
   * @param tx - X interpolation parameter [0, 1]
   * @param ty - Y interpolation parameter [0, 1]
   * @param tz - Z interpolation parameter [0, 1]
   * @returns Interpolated value
   *
   * @example
   * ```ts
   * Interpolation.trilinear(0, 1, 2, 3, 4, 5, 6, 7, 0.5, 0.5, 0.5); // 3.5
   * Interpolation.trilinear(0, 10, 0, 10, 0, 10, 0, 10, 0.5, 0.5, 0.5); // 5
   * ```
   */
  trilinear(
    v000: number,
    v100: number,
    v010: number,
    v110: number,
    v001: number,
    v101: number,
    v011: number,
    v111: number,
    tx: number,
    ty: number,
    tz: number
  ): number {
    const v00 = this.lerp(v000, v100, tx);
    const v10 = this.lerp(v010, v110, tx);
    const v01 = this.lerp(v001, v101, tx);
    const v11 = this.lerp(v011, v111, tx);

    const v0 = this.lerp(v00, v10, ty);
    const v1 = this.lerp(v01, v11, ty);

    return this.lerp(v0, v1, tz);
  },
};

export { Interpolation };
