/**
 * Declarative subject framing derived from typed asset metadata.
 *
 * ## Why this exists
 *
 * Route code kept encoding *specific assets* into visual constants. Turbo's chase camera height was
 * `0.46`, justified in a comment that recited one asset's bounds ("176.35 units tall over a 377.94
 * longest axis"). Its `CAR_SCENE_HEIGHT` was worse: hardcoded to `2.209 / 6.958`, the bounds of a hero
 * asset that had already been replaced twice, so every swap silently mis-seated the new car.
 *
 * The failure mode is structural, not careless. A number that is *correct* for one asset looks like a
 * tuned design constant, so it survives review and survives asset swaps. The only durable fix is for
 * routes to declare **intent** -- "frame a rear chase view where the subject occupies 25-40% of frame
 * height and the lower silhouette stays visible" -- and let reusable code derive the numbers from the
 * typed manifest.
 *
 * These helpers are pure and dependency-free so they can be unit tested against synthetic bounds and
 * reused by any genre. They deliberately do **not** know about racing, platformers, or any route.
 */

import {
  boundsFromAsset,
  boundsHeight,
  boundsMaxDimension,
  boundsSize,
  type SceneAssetLike,
  type SceneBounds
} from "./SceneGroundingUtils.js";

/** Rendered dimensions of a subject after the renderer's fit scale is applied. */
export interface SubjectRenderedSize {
  /** Rendered extent along each axis, in world units. */
  readonly size: readonly [number, number, number];
  /** Rendered height (Y extent). */
  readonly height: number;
  /** Rendered longest axis. */
  readonly maxDimension: number;
  /** Rendered extent along the subject's longitudinal (longest horizontal) axis. */
  readonly length: number;
  /** Uniform scale the renderer applies to reach the requested fit. */
  readonly fitScale: number;
}

export interface SubjectFitRequest {
  /** Fit the subject's height to this world-unit value. */
  readonly targetHeight?: number | undefined;
  /** Fit the subject's longest axis to this world-unit value. */
  readonly targetMaxDimension?: number | undefined;
  /** Fit the subject's longitudinal (longest horizontal) axis to this world-unit value. */
  readonly targetLength?: number | undefined;
}

/**
 * Resolve what a subject actually measures once fit, straight from typed bounds.
 *
 * This replaces the `CAR_TARGET_MAX_DIMENSION * (BOUNDS_Y / BOUNDS_LONGEST)` arithmetic that routes
 * were open-coding, and which is exactly where the stale-literal defect lived.
 */
export function resolveSubjectRenderedSize(asset: SceneAssetLike, request: SubjectFitRequest): SubjectRenderedSize {
  const bounds = boundsFromAsset(asset);
  return resolveSubjectRenderedSizeFromBounds(bounds, request);
}

/** Bounds-level form of {@link resolveSubjectRenderedSize}, for fixtures and tests. */
export function resolveSubjectRenderedSizeFromBounds(bounds: SceneBounds, request: SubjectFitRequest): SubjectRenderedSize {
  const rawSize = boundsSize(bounds);
  const rawHeight = boundsHeight(bounds);
  const rawMaxDimension = boundsMaxDimension(bounds);
  const rawLength = Math.max(rawSize[0], rawSize[2]);
  const fitScale = resolveSubjectFitScale(
    { height: rawHeight, maxDimension: rawMaxDimension, length: rawLength },
    request
  );
  return {
    size: [rawSize[0] * fitScale, rawSize[1] * fitScale, rawSize[2] * fitScale],
    height: rawHeight * fitScale,
    maxDimension: rawMaxDimension * fitScale,
    length: rawLength * fitScale,
    fitScale
  };
}

function resolveSubjectFitScale(
  raw: { readonly height: number; readonly maxDimension: number; readonly length: number },
  request: SubjectFitRequest
): number {
  if (isPositive(request.targetHeight) && raw.height > 0) return request.targetHeight / raw.height;
  if (isPositive(request.targetLength) && raw.length > 0) return request.targetLength / raw.length;
  if (isPositive(request.targetMaxDimension) && raw.maxDimension > 0) return request.targetMaxDimension / raw.maxDimension;
  return 1;
}

/**
 * A route's framing *intent*, expressed without reference to any asset's dimensions.
 *
 * `subjectVerticalOccupancy` is the contract that matters: it states how much of the frame's height
 * the subject should fill. Everything else (camera height, distance) is derived to satisfy it.
 */
export interface ChaseFramingIntent extends SubjectFitRequest {
  /** Vertical fraction of the frame the subject should occupy, as `[min, max]`. */
  readonly subjectVerticalOccupancy: readonly [number, number];
  /** Vertical field of view in degrees. */
  readonly fov: number;
  /**
   * Fraction of the subject's height the camera should sit at, measured from its contact plane.
   *
   * Expressed as a fraction rather than a world-unit height precisely so it survives asset swaps.
   * The default 0.9 places the eye just above the subject's mid-height: high enough to see the ground
   * ahead, low enough that the subject's own roof line does not occlude its lower silhouette.
   */
  readonly eyeHeightFraction?: number | undefined;
  /**
   * Require the lowest `lowerSilhouetteFraction` of the subject to remain unoccluded by its own upper
   * body, which is what makes wheels, feet, or landing gear readable.
   */
  readonly lowerSilhouetteFraction?: number | undefined;
  /**
   * Require the subject's lower side features (wheels, feet) to be readable from this framing.
   *
   * A dead-astern or dead-ahead chase view cannot show them: the subject's own bodywork occludes its
   * lower flanks by construction. This was learned the hard way — a hero car's tyres were reported as
   * "not rendering" when in fact the renderer drew all of them and the camera was simply looking down
   * the one axis where they cannot appear.
   *
   * When set, `resolveChaseFraming` derives a lateral offset large enough to bring the flank into view.
   */
  readonly requireLowerSideFeatureVisibility?: boolean | undefined;
}

export interface ChaseFraming {
  /** Camera height above the subject's contact plane. */
  readonly height: number;
  /** Camera distance behind the subject. */
  readonly distance: number;
  /**
   * Lateral camera offset. Non-zero only when `requireLowerSideFeatureVisibility` is set.
   *
   * Derived from the subject's own half-width so it scales with the asset instead of being tuned: a
   * fixed offset that reveals a small car's wheels is far too small for a truck.
   */
  readonly sideOffset: number;
  /**
   * True when this framing can actually show the subject's lower side features.
   *
   * A caller must not claim wheels or feet are visible from a framing where this is false, however
   * correct the grounding is.
   */
  readonly lowerSideFeaturesReadable: boolean;
  /** Rendered subject measurements this framing was derived from. */
  readonly subject: SubjectRenderedSize;
  /** Predicted fraction of frame height the subject occupies at this distance. */
  readonly predictedVerticalOccupancy: number;
  /** World-space Y band, relative to the contact plane, that must stay readable. */
  readonly lowerSilhouetteBand: readonly [number, number];
  /** True when the predicted occupancy falls inside the requested range. */
  readonly withinRequestedOccupancy: boolean;
}

/**
 * Derive a chase camera from framing intent plus typed asset bounds.
 *
 * The distance is solved from the occupancy contract rather than tuned: at vertical FOV `f` and
 * distance `d`, a subject of rendered height `h` occupies `h / (2 * d * tan(f/2))` of the frame.
 * Solving for the midpoint of the requested occupancy range gives the distance directly, so a new
 * asset with different proportions produces a different distance automatically and the route never
 * restates a dimension.
 */
export function resolveChaseFraming(asset: SceneAssetLike, intent: ChaseFramingIntent): ChaseFraming {
  return resolveChaseFramingFromBounds(boundsFromAsset(asset), intent);
}

/** Bounds-level form of {@link resolveChaseFraming}, for fixtures and tests. */
export function resolveChaseFramingFromBounds(bounds: SceneBounds, intent: ChaseFramingIntent): ChaseFraming {
  const subject = resolveSubjectRenderedSizeFromBounds(bounds, intent);
  const [minOccupancy, maxOccupancy] = normalizeOccupancy(intent.subjectVerticalOccupancy);
  const targetOccupancy = (minOccupancy + maxOccupancy) / 2;
  const fovRadians = clamp(intent.fov, 1, 170) * Math.PI / 180;
  const halfFovTangent = Math.tan(fovRadians / 2);

  // Solve d from occupancy = height / (2 * d * tan(fov/2)).
  const distance = subject.height > 0 && targetOccupancy > 0 && halfFovTangent > 0
    ? subject.height / (2 * targetOccupancy * halfFovTangent)
    : Math.max(subject.maxDimension, 0.001) * 2;

  const eyeHeightFraction = intent.eyeHeightFraction ?? 0.9;
  const height = subject.height * eyeHeightFraction;
  const lowerFraction = clamp(intent.lowerSilhouetteFraction ?? 0.3, 0, 1);
  const predictedVerticalOccupancy = distance > 0 && halfFovTangent > 0
    ? subject.height / (2 * distance * halfFovTangent)
    : 0;

  /*
   * Lateral offset needed to bring the subject's flank into view.
   *
   * At offset `s` and distance `d` the view direction is rotated by `atan(s/d)` off-axis. Bringing a
   * flank into view needs enough rotation that the near-side lower body is no longer occluded by the
   * subject's own width; `0.45 * halfWidth / distance`-scaled offset yields roughly 12-20 degrees for
   * typical chase distances, which is the range where a car's near wheels read without the frame
   * becoming a side-on beauty shot.
   */
  // The *narrower* horizontal axis is the subject's width; the wider one is its length. A chase camera
  // steps sideways relative to width, so using the longest axis here would overshoot badly on a long car.
  const halfWidth = Math.min(subject.size[0], subject.size[2]) / 2;
  const sideOffset = intent.requireLowerSideFeatureVisibility ? halfWidth * 3.2 : 0;
  const offAxisRadians = distance > 0 ? Math.atan(sideOffset / distance) : 0;

  return {
    height: round4(height),
    distance: round4(distance),
    sideOffset: round4(sideOffset),
    // Below ~8 degrees off-axis the subject's own body still hides its lower flank.
    lowerSideFeaturesReadable: offAxisRadians >= 0.14,
    subject,
    predictedVerticalOccupancy: round4(predictedVerticalOccupancy),
    lowerSilhouetteBand: [0, round4(subject.height * lowerFraction)],
    withinRequestedOccupancy:
      predictedVerticalOccupancy >= minOccupancy - 1e-6 &&
      predictedVerticalOccupancy <= maxOccupancy + 1e-6
  };
}

function normalizeOccupancy(range: readonly [number, number]): readonly [number, number] {
  const low = Math.min(range[0], range[1]);
  const high = Math.max(range[0], range[1]);
  return [clamp(low, 0.001, 1), clamp(high, 0.001, 1)];
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function round4(value: number): number {
  const rounded = Math.round(value * 10_000) / 10_000;
  return rounded === 0 ? 0 : rounded;
}

function isPositive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
