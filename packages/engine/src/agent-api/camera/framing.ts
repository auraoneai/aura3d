/**
 * R-10 framing solver (PRD-08) — pure math for "subject fills fraction p of
 * the frame".
 *
 * `distanceForFraction(h, fovDeg, p) = h / (2·tan(fov/2)·p)` and the exact
 * inverse `fractionForDistance(d, h, fovDeg)`. For portrait aspects the
 * binding constraint is the narrower horizontal axis — `solveForAspect`
 * converts a vertical-fov spec into the effective axis fov via the aspect
 * ratio, so a subject framed at e.g. 1/8 frame height on a 390×844 screen
 * stays framed the same way on 844×390.
 */

export interface AuraFramingContext {
  /** Viewport aspect (width / height); 1 when unknown. */
  readonly aspect?: number;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distance so a subject of height `h` fills fraction `p` of the frame. */
export function distanceForFraction(h: number, fovDeg: number, p: number): number {
  const half = Math.tan(toRadians(fovDeg) / 2);
  if (h <= 0 || half <= 0 || p <= 0) return Number.POSITIVE_INFINITY;
  return h / (2 * half * p);
}

/** Inverse: fraction of the frame a subject of height `h` fills at `d`. */
export function fractionForDistance(d: number, h: number, fovDeg: number): number {
  const half = Math.tan(toRadians(fovDeg) / 2);
  if (d <= 0 || h <= 0 || half <= 0) return 0;
  return h / (2 * d * half);
}

/**
 * Effective fov for the binding axis. On landscape viewports the subject
 * height is constrained by the vertical fov; on portrait viewports by the
 * horizontal fov `2·atan(tan(fovV/2)·aspect)`. Returns the fov (degrees) to
 * feed `distanceForFraction`/`fractionForDistance`.
 */
export function effectiveAxisFov(fovDeg: number, aspect = 1): number {
  if (aspect >= 1) return fovDeg;
  const vertical = Math.tan(toRadians(fovDeg) / 2) * Math.max(EPSILON_ASPECT, aspect);
  return (2 * Math.atan(vertical) * 180) / Math.PI;
}

const EPSILON_ASPECT = 1e-6;

/** Distance that frames a subject of height `h` at fraction `p` under `aspect`. */
export function distanceForFractionInContext(
  h: number,
  fovDeg: number,
  p: number,
  context: AuraFramingContext = {}
): number {
  return distanceForFraction(h, effectiveAxisFov(fovDeg, context.aspect ?? 1), p);
}

/** Fraction `h` fills at distance `d` under `aspect`. */
export function fractionForDistanceInContext(
  d: number,
  h: number,
  fovDeg: number,
  context: AuraFramingContext = {}
): number {
  return fractionForDistance(d, h, effectiveAxisFov(fovDeg, context.aspect ?? 1));
}
