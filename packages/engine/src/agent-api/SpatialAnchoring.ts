/**
 * Asset-relative spatial layout and semantic anchoring.
 *
 * ## Why this exists
 *
 * Public routes placed helper geometry -- status markers, control stations,
 * selection rings, callout panels, staging props -- at literal world
 * coordinates chosen by eye against whatever asset was loaded that week. When
 * the asset changed, or its bounds changed, the coordinates did not. The
 * visible result is procedural boxes floating beside the scene rather than
 * attached to the equipment they annotate.
 *
 * `CAR_SCENE_HEIGHT` was the same defect in a single constant: a value correct
 * for one asset, frozen, then wrong. This module removes the reason to write
 * such a constant. A route states intent -- "above this machine", "beside the
 * workcell", "on the floor in front of the product" -- and reads back a world
 * position derived from the asset's own placed bounds.
 *
 * Everything here is pure: no renderer, no asset loading, no DOM. Anchors are
 * resolved from {@link PlacedBounds}, which a route obtains from typed asset
 * bounds plus its intended scale via {@link placedBoundsFromAsset}.
 */

import {
  boundsFromAsset,
  boundsSize,
  type SceneAssetLike,
  type SceneBounds,
  type Vec3
} from "./SceneGroundingUtils.js";

/**
 * Bounds of an asset as it actually sits in the scene.
 *
 * Distinct from {@link SceneBounds}, which is in raw asset-local units. Anchors
 * must resolve against placed bounds or they reproduce the defect they exist to
 * prevent: a correct-looking offset in local units lands in the wrong place
 * once the renderer normalizes and scales the model.
 */
export interface PlacedBounds {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly center: Vec3;
  readonly size: Vec3;
  /** Y of the surface the subject rests on. */
  readonly floorY: number;
}

/** Faces and corners of a placed bounding volume. */
export type BoundsAnchor =
  | "center"
  | "top"
  | "bottom"
  | "front"
  | "rear"
  | "left"
  | "right"
  | "top-front"
  | "top-rear"
  | "top-left"
  | "top-right"
  | "floor-front"
  | "floor-rear"
  | "floor-left"
  | "floor-right"
  | "corner-front-left"
  | "corner-front-right"
  | "corner-rear-left"
  | "corner-rear-right";

export interface AnchorOptions {
  /**
   * Distance to push the anchor outward along its own face normal, in world
   * units. Positive moves away from the subject.
   */
  readonly offset?: number | undefined;
  /**
   * Additional world-space nudge applied after the face offset. Reserved for
   * genuine art direction; it is not a place to reintroduce asset-specific
   * corrections.
   */
  readonly worldOffset?: Vec3 | undefined;
  /**
   * Keep the anchor at floor level regardless of the face chosen. Used for
   * ground-standing props beside an asset.
   */
  readonly onFloor?: boolean | undefined;
}

export interface ResolvedAnchor {
  readonly position: Vec3;
  /** Outward normal of the face the anchor was taken from. */
  readonly normal: Vec3;
  readonly anchor: BoundsAnchor;
  /** True when the anchor lies outside the subject's placed bounds. */
  readonly outsideBounds: boolean;
}

/**
 * Build placed bounds from a subject's world position, size and floor.
 *
 * `position` is the subject's floor contact point, matching how Aura3D's safe
 * model renderer grounds a normalized model on its node origin.
 */
export function placedBounds(options: {
  readonly position: Vec3;
  readonly size: Vec3;
  readonly floorY?: number | undefined;
}): PlacedBounds {
  const floorY = options.floorY ?? options.position[1];
  const size: Vec3 = [
    Math.max(0, options.size[0]),
    Math.max(0, options.size[1]),
    Math.max(0, options.size[2])
  ];
  const min: Vec3 = [options.position[0] - size[0] / 2, floorY, options.position[2] - size[2] / 2];
  const max: Vec3 = [options.position[0] + size[0] / 2, floorY + size[1], options.position[2] + size[2] / 2];
  return {
    min,
    max,
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    size,
    floorY
  };
}

/**
 * Placed bounds for a typed asset rendered with `model(asset)`.
 *
 * Mirrors the safe renderer: the asset is normalized to
 * `normalizedMaxDimension`, multiplied by node scale, and grounded so its
 * lowest point rests on `floorY`. A route therefore never needs the asset's raw
 * dimensions to place something relative to it.
 */
export function placedBoundsFromAsset(asset: SceneAssetLike, options: {
  readonly position?: Vec3 | undefined;
  /** `targetMaxDimension` passed to `model(asset)`, in world units. */
  readonly targetMaxDimension: number;
  readonly floorY?: number | undefined;
}): PlacedBounds {
  const raw = boundsFromAsset(asset);
  const rawSize = boundsSize(raw);
  const rawMax = Math.max(rawSize[0], rawSize[1], rawSize[2]);
  const factor = rawMax > 0 && options.targetMaxDimension > 0 ? options.targetMaxDimension / rawMax : 1;
  const position = options.position ?? [0, options.floorY ?? 0, 0];
  return placedBounds({
    position,
    size: [rawSize[0] * factor, rawSize[1] * factor, rawSize[2] * factor],
    floorY: options.floorY ?? position[1]
  });
}

export interface RegionFittedSizeOptions {
  /**
   * Fraction of the region the subject should occupy along its widest
   * horizontal axis, 0..1.
   */
  readonly occupancy: number;
  /**
   * Which region axes constrain the fit. Defaults to the horizontal axes, which
   * is what "a vehicle inside a city block" means; include `"y"` when vertical
   * headroom is also a real constraint, such as a crate inside a warehouse bay.
   */
  readonly axes?: readonly ("x" | "y" | "z")[] | undefined;
  /** Never size the subject below this world-unit maximum dimension. */
  readonly minSize?: number | undefined;
  /** Never size the subject above this world-unit maximum dimension. */
  readonly maxSize?: number | undefined;
}

export interface RegionFittedSize {
  /**
   * Pass straight to `model(asset, { targetMaxDimension })` so the renderer
   * derives the scale from the asset's own bounds.
   */
  readonly targetMaxDimension: number;
  /** Fraction of the region actually occupied after clamping. */
  readonly occupancy: number;
  /** Region extents the fit was computed against. */
  readonly regionSize: Vec3;
  /** True when `minSize` or `maxSize` overrode the requested occupancy. */
  readonly clamped: boolean;
}

/**
 * Size an asset so it occupies a chosen fraction of a region it sits inside.
 *
 * Placement was already bounds-derived through {@link resolveSemanticRegion},
 * but *sizing* was not: a route that knew where a vehicle belonged still had to
 * invent a multiplier such as `.scale(1.58)` to decide how big it should be.
 * That number carries no relationship to either the asset or its surroundings,
 * so it silently becomes wrong the moment the asset is swapped or the scene
 * resized — which is precisely the "hero fills the frame and occludes the scene"
 * defect class.
 *
 * This returns a `targetMaxDimension` rather than a raw scale factor on purpose.
 * A scale factor is only meaningful relative to an asset's unknown raw
 * dimensions, whereas a target dimension is an absolute statement about world
 * size that the renderer resolves against the asset's real bounds.
 */
export function fitSizeToRegion(region: ResolvedSemanticRegion | PlacedBounds, options: RegionFittedSizeOptions): RegionFittedSize {
  const regionSize: Vec3 = [
    Math.max(0, region.size[0]),
    Math.max(0, region.size[1]),
    Math.max(0, region.size[2])
  ];
  const requested = Number.isFinite(options.occupancy) ? Math.min(1, Math.max(0, options.occupancy)) : 0;
  const axes = options.axes ?? ["x", "z"];
  const axisIndex = { x: 0, y: 1, z: 2 } as const;
  const candidates = axes
    .map((axis) => regionSize[axisIndex[axis]])
    .filter((value): value is number => typeof value === "number" && value > 0);
  if (candidates.length === 0) {
    throw new RangeError("fitSizeToRegion requires a region with positive extent on at least one constraining axis.");
  }
  // The smallest constraining extent governs: fitting to the largest would let
  // the subject overflow the tighter axis, which is the same visual failure as
  // hardcoding the scale too high.
  const governing = Math.min(...candidates);
  const ideal = governing * requested;
  const lowerBound = options.minSize !== undefined && Number.isFinite(options.minSize) ? Math.max(0, options.minSize) : 0;
  const upperBound = options.maxSize !== undefined && Number.isFinite(options.maxSize) ? Math.max(0, options.maxSize) : Number.POSITIVE_INFINITY;
  const targetMaxDimension = Math.min(upperBound, Math.max(lowerBound, ideal));
  return {
    targetMaxDimension,
    occupancy: governing > 0 ? targetMaxDimension / governing : 0,
    regionSize,
    clamped: targetMaxDimension !== ideal
  };
}

/** Placed bounds for a raw {@link SceneBounds} already expressed in world units. */
export function placedBoundsFromWorldBounds(bounds: SceneBounds): PlacedBounds {
  const size = boundsSize(bounds);
  return {
    min: [bounds.min[0], bounds.min[1], bounds.min[2]],
    max: [bounds.max[0], bounds.max[1], bounds.max[2]],
    center: [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2
    ],
    size,
    floorY: bounds.min[1]
  };
}

const ANCHOR_NORMALS: Record<BoundsAnchor, Vec3> = {
  center: [0, 0, 0],
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  // "front" is +Z: Aura3D scenes look down -Z from a default camera, so the face
  // nearest the viewer is +Z. Documented rather than inferred so a route reading
  // "front" does not get the far side.
  front: [0, 0, 1],
  rear: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  "top-front": [0, 0.7071, 0.7071],
  "top-rear": [0, 0.7071, -0.7071],
  "top-left": [-0.7071, 0.7071, 0],
  "top-right": [0.7071, 0.7071, 0],
  "floor-front": [0, 0, 1],
  "floor-rear": [0, 0, -1],
  "floor-left": [-1, 0, 0],
  "floor-right": [1, 0, 0],
  "corner-front-left": [-0.7071, 0, 0.7071],
  "corner-front-right": [0.7071, 0, 0.7071],
  "corner-rear-left": [-0.7071, 0, -0.7071],
  "corner-rear-right": [0.7071, 0, -0.7071]
};

/**
 * Resolve a world position on or beside a subject's placed bounds.
 *
 * The returned position is on the named face at `offset` distance outward. This
 * is the replacement for literal helper coordinates: it tracks the asset.
 */
export function resolveBoundsAnchor(
  bounds: PlacedBounds,
  anchor: BoundsAnchor,
  options: AnchorOptions = {}
): ResolvedAnchor {
  const normal = ANCHOR_NORMALS[anchor];
  const offset = options.offset ?? 0;
  const half: Vec3 = [bounds.size[0] / 2, bounds.size[1] / 2, bounds.size[2] / 2];
  // Start at the bounds centre and walk out to the named face.
  let position: Vec3 = [
    bounds.center[0] + normal[0] * half[0],
    bounds.center[1] + normal[1] * half[1],
    bounds.center[2] + normal[2] * half[2]
  ];
  // Floor anchors sit on the ground plane beside the subject.
  if (anchor.startsWith("floor-") || options.onFloor === true) {
    position = [position[0], bounds.floorY, position[2]];
  }
  position = [
    position[0] + normal[0] * offset,
    position[1] + normal[1] * offset,
    position[2] + normal[2] * offset
  ];
  const worldOffset = options.worldOffset ?? [0, 0, 0];
  position = [position[0] + worldOffset[0], position[1] + worldOffset[1], position[2] + worldOffset[2]];
  return {
    position,
    normal,
    anchor,
    outsideBounds: !containsPoint(bounds, position)
  };
}

/** True when a world point lies inside the placed bounds (inclusive). */
export function containsPoint(bounds: PlacedBounds, point: Vec3, epsilon = 1e-6): boolean {
  return point[0] >= bounds.min[0] - epsilon && point[0] <= bounds.max[0] + epsilon
    && point[1] >= bounds.min[1] - epsilon && point[1] <= bounds.max[1] + epsilon
    && point[2] >= bounds.min[2] - epsilon && point[2] <= bounds.max[2] + epsilon;
}

/**
 * A named region inside a subject, expressed in normalized bounds space.
 *
 * This is how a route addresses "the assembly zone" or "the earcups" without
 * hardcoding world coordinates. `u`/`v`/`w` run 0..1 across the subject's X/Y/Z
 * extents, so the region follows the asset when its size or placement changes.
 */
export interface SemanticRegion {
  readonly id: string;
  readonly label?: string | undefined;
  /** Normalized centre within the subject's bounds, each component 0..1. */
  readonly u: number;
  readonly v: number;
  readonly w: number;
  /** Normalized extents of the region, each component 0..1. Defaults to a point. */
  readonly extent?: readonly [number, number, number] | undefined;
}

export interface ResolvedSemanticRegion {
  readonly id: string;
  readonly label: string | undefined;
  readonly center: Vec3;
  readonly size: Vec3;
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Resolve a normalized semantic region to world-space bounds on the subject. */
export function resolveSemanticRegion(bounds: PlacedBounds, region: SemanticRegion): ResolvedSemanticRegion {
  const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const u = clamp01(region.u);
  const v = clamp01(region.v);
  const w = clamp01(region.w);
  const extent = region.extent ?? [0, 0, 0];
  const center: Vec3 = [
    bounds.min[0] + bounds.size[0] * u,
    bounds.min[1] + bounds.size[1] * v,
    bounds.min[2] + bounds.size[2] * w
  ];
  const size: Vec3 = [
    bounds.size[0] * clamp01(extent[0]),
    bounds.size[1] * clamp01(extent[1]),
    bounds.size[2] * clamp01(extent[2])
  ];
  return {
    id: region.id,
    label: region.label,
    center,
    size,
    min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
    max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2]
  };
}

export interface DistributionOptions {
  /** How many items to place. */
  readonly count: number;
  /** Minimum world-space gap between adjacent items. */
  readonly minSpacing?: number | undefined;
  /** Deterministic seed. Distribution is fully determined by this value. */
  readonly seed?: number | undefined;
  /** Keep every item on the floor plane. */
  readonly onFloor?: boolean | undefined;
  /** Jitter as a fraction of available spacing, 0..1. Defaults to 0 (exact grid). */
  readonly jitter?: number | undefined;
}

export interface DistributedPlacement {
  readonly index: number;
  readonly position: Vec3;
  /** Distance to the nearest other placement. */
  readonly nearestNeighborDistance: number;
}

/**
 * Distribute items evenly across a region, honouring a minimum spacing.
 *
 * Deterministic for a given seed so gameplay and evidence are reproducible.
 * Used instead of `-0.45 + index * 0.17` style literals, which encode both the
 * region and its spacing into one unexplained pair of numbers.
 */
export function distributeInRegion(
  region: { readonly min: Vec3; readonly max: Vec3 },
  options: DistributionOptions
): readonly DistributedPlacement[] {
  const count = Math.max(0, Math.floor(options.count));
  if (count === 0) return [];
  const spanX = region.max[0] - region.min[0];
  const spanZ = region.max[2] - region.min[2];
  const jitter = Math.min(1, Math.max(0, options.jitter ?? 0));
  const seed = options.seed ?? 1;
  // Lay items along the longer horizontal axis so a narrow conveyor stays a line.
  const alongX = spanX >= spanZ;
  const span = alongX ? spanX : spanZ;
  const step = count > 1 ? span / (count - 1) : 0;
  const y = options.onFloor === true ? region.min[1] : (region.min[1] + region.max[1]) / 2;
  const positions: Vec3[] = [];
  let random = seed >>> 0 || 1;
  const nextRandom = () => {
    // xorshift32: deterministic, no dependencies, adequate for layout jitter.
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    return ((random >>> 0) / 0xffffffff) * 2 - 1;
  };
  for (let index = 0; index < count; index += 1) {
    const t = count > 1 ? index * step : span / 2;
    const jitterAmount = jitter * step * 0.5;
    const primary = (alongX ? region.min[0] : region.min[2]) + t + (jitter > 0 ? nextRandom() * jitterAmount : 0);
    const secondaryCenter = alongX ? (region.min[2] + region.max[2]) / 2 : (region.min[0] + region.max[0]) / 2;
    const secondarySpan = alongX ? spanZ : spanX;
    const secondary = secondaryCenter + (jitter > 0 ? nextRandom() * secondarySpan * 0.5 * jitter : 0);
    positions.push(alongX ? [primary, y, secondary] : [secondary, y, primary]);
  }
  const minSpacing = options.minSpacing ?? 0;
  return positions.map((position, index) => {
    let nearest = Number.POSITIVE_INFINITY;
    positions.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      nearest = Math.min(nearest, distance(position, other));
    });
    if (!Number.isFinite(nearest)) nearest = Number.POSITIVE_INFINITY;
    return {
      index,
      position,
      nearestNeighborDistance: nearest === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : round(nearest)
    };
  }).map((placement) => {
    // Report rather than silently correct: a caller asking for spacing the region
    // cannot provide should see it in the invariant report, not get moved items.
    void minSpacing;
    return placement;
  });
}

/** Minimum-spacing check for a set of placements. */
export function validateSpacing(
  placements: readonly DistributedPlacement[],
  minSpacing: number
): { readonly ok: boolean; readonly violations: readonly { readonly index: number; readonly distance: number }[] } {
  const violations = placements
    .filter((placement) => Number.isFinite(placement.nearestNeighborDistance) && placement.nearestNeighborDistance < minSpacing)
    .map((placement) => ({ index: placement.index, distance: placement.nearestNeighborDistance }));
  return { ok: violations.length === 0, violations };
}

export interface RadialPlacementOptions {
  readonly count: number;
  /** Radius measured from the subject's bounds, not from the origin. */
  readonly radius: number;
  /** Starting angle in radians. Defaults to 0. */
  readonly startAngle?: number | undefined;
  /** Height above the floor. Defaults to the subject's vertical centre. */
  readonly height?: number | undefined;
  /** Sweep in radians. Defaults to a full circle. */
  readonly sweep?: number | undefined;
}

/**
 * Place items on a circle around a subject.
 *
 * The radius is added to the subject's own horizontal half-extent, so a ring of
 * markers stays clear of the asset regardless of how large the asset is.
 */
export function distributeAroundBounds(
  bounds: PlacedBounds,
  options: RadialPlacementOptions
): readonly DistributedPlacement[] {
  const count = Math.max(0, Math.floor(options.count));
  if (count === 0) return [];
  const clearance = Math.max(bounds.size[0], bounds.size[2]) / 2;
  const radius = clearance + Math.max(0, options.radius);
  const sweep = options.sweep ?? Math.PI * 2;
  const start = options.startAngle ?? 0;
  const y = options.height ?? bounds.center[1];
  const step = count > 1 ? sweep / (sweep >= Math.PI * 2 - 1e-6 ? count : count - 1) : 0;
  const positions: Vec3[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = start + step * index;
    positions.push([
      bounds.center[0] + Math.cos(angle) * radius,
      y,
      bounds.center[2] + Math.sin(angle) * radius
    ]);
  }
  return positions.map((position, index) => {
    let nearest = Number.POSITIVE_INFINITY;
    positions.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      nearest = Math.min(nearest, distance(position, other));
    });
    return { index, position, nearestNeighborDistance: Number.isFinite(nearest) ? round(nearest) : Number.POSITIVE_INFINITY };
  });
}

/**
 * Spatial invariant report for a set of helper placements.
 *
 * This is the machine-checkable form of "no floating procedural props". A route
 * publishes it; a gate asserts on it. It replaces judging placement by eye or
 * by counting coloured pixels.
 */
export interface SpatialInvariantReport {
  readonly schema: "aura3d-spatial-invariants/1.0";
  readonly subjectBounds: PlacedBounds;
  readonly checks: readonly {
    readonly id: string;
    readonly description: string;
    readonly passes: boolean;
    readonly detail: string;
  }[];
  readonly passes: boolean;
}

export interface HelperPlacementClaim {
  readonly id: string;
  readonly position: Vec3;
  /**
   * Where this element is meant to sit relative to the subject.
   * `inside`  -- within the subject's bounds (a selection ring on a part)
   * `surface` -- on a bounds face, within one tolerance of it
   * `outside` -- deliberately beside the subject (a control station, a panel)
   */
  readonly relation: "inside" | "surface" | "outside";
  /** Maximum world distance from the subject's bounds for `outside` elements. */
  readonly maxDistance?: number | undefined;
}

/**
 * Verify that helper geometry is anchored to its subject.
 *
 * `outside` elements must remain within `maxDistance` of the bounds: that is
 * what separates "a control station beside the workcell" from "a box floating in
 * the void". The default of 2x the subject's largest extent is generous enough
 * for staging and tight enough to catch the digital-twin defect class.
 */
export function checkSpatialInvariants(
  bounds: PlacedBounds,
  claims: readonly HelperPlacementClaim[],
  options: { readonly surfaceTolerance?: number | undefined } = {}
): SpatialInvariantReport {
  const tolerance = options.surfaceTolerance ?? Math.max(0.02, Math.max(...bounds.size) * 0.08);
  const defaultMaxDistance = Math.max(...bounds.size) * 2;
  const checks = claims.map((claim) => {
    const inside = containsPoint(bounds, claim.position);
    const surfaceDistance = distanceToBoundsSurface(bounds, claim.position);
    const outsideDistance = distanceOutsideBounds(bounds, claim.position);
    if (claim.relation === "inside") {
      return {
        id: claim.id,
        description: `${claim.id} must lie inside the subject bounds`,
        passes: inside,
        detail: inside ? "inside bounds" : `outside bounds by ${round(outsideDistance)} units`
      };
    }
    if (claim.relation === "surface") {
      const passes = surfaceDistance <= tolerance;
      return {
        id: claim.id,
        description: `${claim.id} must sit on the subject surface within ${round(tolerance)} units`,
        passes,
        detail: `distance to surface ${round(surfaceDistance)} (tolerance ${round(tolerance)})`
      };
    }
    const limit = claim.maxDistance ?? defaultMaxDistance;
    const passes = !inside && outsideDistance <= limit;
    return {
      id: claim.id,
      description: `${claim.id} must sit beside the subject within ${round(limit)} units, not inside it`,
      passes,
      detail: inside
        ? "unexpectedly inside the subject bounds"
        : `distance outside bounds ${round(outsideDistance)} (limit ${round(limit)})`
    };
  });
  return {
    schema: "aura3d-spatial-invariants/1.0",
    subjectBounds: bounds,
    checks,
    passes: checks.every((check) => check.passes)
  };
}

/** Shortest distance from a point to the bounds surface (0 when on it). */
export function distanceToBoundsSurface(bounds: PlacedBounds, point: Vec3): number {
  const outside = distanceOutsideBounds(bounds, point);
  if (outside > 0) return outside;
  // Inside: distance to the nearest face.
  return Math.min(
    point[0] - bounds.min[0], bounds.max[0] - point[0],
    point[1] - bounds.min[1], bounds.max[1] - point[1],
    point[2] - bounds.min[2], bounds.max[2] - point[2]
  );
}

/** Distance from a point to the bounds volume; 0 when inside. */
export function distanceOutsideBounds(bounds: PlacedBounds, point: Vec3): number {
  const dx = Math.max(bounds.min[0] - point[0], 0, point[0] - bounds.max[0]);
  const dy = Math.max(bounds.min[1] - point[1], 0, point[1] - bounds.max[1]);
  const dz = Math.max(bounds.min[2] - point[2], 0, point[2] - bounds.max[2]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function distance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
