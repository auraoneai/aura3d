/**
 * Scalar spline/Bézier basis functions shared by the curve classes —
 * three.js `extras/core/Interpolations.js` parity.
 */

/** Catmull-Rom spline interpolation (uniform, tension 0.5). */
export function CatmullRom(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const v0 = (p2 - p0) * 0.5;
  const v1 = (p3 - p1) * 0.5;
  const t2 = t * t;
  const t3 = t * t2;
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
}

export function QuadraticBezier(t: number, p0: number, p1: number, p2: number): number {
  const k = 1 - t;
  return k * k * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
}

export function CubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const k = 1 - t;
  return k * k * k * p0 + 3 * k * k * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t * p3;
}
