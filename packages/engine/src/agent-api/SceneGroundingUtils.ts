/**
 * Pure scene-grounding and scale-normalization helpers.
 *
 * Imported GLB/glTF assets rarely share a common pivot or real-world scale: a
 * starter robot may bound ~0.066m tall while a humanoid soldier bounds ~1.8m,
 * and their local origins may sit at the model's center rather than its feet.
 * Dropping such assets into a scene with hardcoded positions makes characters
 * float above the floor and appear at wildly different on-screen sizes.
 *
 * These functions consume the axis-aligned bounds reported in generated typed
 * assets / `aura.assets.json` (`boundsMetadata` exposes `min`/`max`/`size`/
 * `center`) and return deterministic translations and uniform scales that:
 *   - put each asset's lowest point on a shared floor (default y = 0), and
 *   - normalize each asset's height to a chosen on-screen target.
 *
 * They are intentionally dependency-free and side-effect-free so they can be
 * unit tested in isolation and reused by any template or runtime.
 */

export type Vec3 = readonly [number, number, number];

/** Axis-aligned bounding box, matching `boundsMetadata` min/max corners. */
export interface SceneBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface GroundedPlacementOptions {
  /** Desired on-screen height in world units after normalization. */
  readonly targetHeight: number;
  /** Floor X position for the placement (defaults to 0). */
  readonly x?: number | undefined;
  /** Floor Z position for the placement (defaults to 0). */
  readonly z?: number | undefined;
  /** World Y of the floor the asset should rest on (defaults to 0). */
  readonly floorY?: number | undefined;
}

export interface GroundedPlacement {
  readonly position: readonly [number, number, number];
  readonly scale: number;
}

export interface RenderGroundedPlacementOptions {
  /** Desired rendered height in Aura world units. Mutually exclusive with `targetMaxDimension`. */
  readonly targetHeight?: number | undefined;
  /** Desired rendered largest dimension in Aura world units. Used when `targetHeight` is omitted. */
  readonly targetMaxDimension?: number | undefined;
  /** Floor X position for the placement (defaults to 0). */
  readonly x?: number | undefined;
  /** Floor Z position for the placement (defaults to 0). */
  readonly z?: number | undefined;
  /** World Y of the floor the asset should rest on (defaults to 0). */
  readonly floorY?: number | undefined;
  /**
   * The default largest dimension produced by Aura3D's safe model renderer
   * before user scale is applied. Keep this aligned with the renderer's
   * internal `createModelMatrix(..., normalizeToUnit = true)` fit size.
   */
  readonly normalizedMaxDimension?: number | undefined;
}

export interface SceneAssetBoundsMetadata {
  readonly min?: readonly number[] | undefined;
  readonly max?: readonly number[] | undefined;
  readonly size?: readonly number[] | undefined;
  readonly center?: readonly number[] | undefined;
}

export interface SceneAssetLike {
  readonly bounds?: readonly number[] | undefined;
  readonly metadata?: {
    readonly boundsMetadata?: SceneAssetBoundsMetadata | undefined;
  } | undefined;
}

export interface AssetGroundedPlacement extends GroundedPlacement {
  readonly bounds: SceneBounds;
  readonly height: number;
}

export interface RenderGroundedAssetPlacement extends AssetGroundedPlacement {
  readonly maxDimension: number;
}

export const AURA_NORMALIZED_MODEL_MAX_DIMENSION = 1.55;

/** Height (Y extent) of the bounds in the asset's own local units. */
export function boundsHeight(bounds: SceneBounds): number {
  return bounds.max[1] - bounds.min[1];
}

/** Width/depth/height extents for a bounds object. */
export function boundsSize(bounds: SceneBounds): Vec3 {
  return [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2]
  ];
}

/** Largest finite positive extent for a bounds object. */
export function boundsMaxDimension(bounds: SceneBounds): number {
  return Math.max(...boundsSize(bounds).filter((value) => Number.isFinite(value) && value > 0), 0);
}

/**
 * Y translation that puts the asset's lowest point on the floor.
 *
 * For an unscaled asset this is simply `-min.y`: if the model's lowest vertex
 * sits at local y = `min.y`, translating by `-min.y` lands it exactly on y = 0.
 * Works for any pivot (center-origin or foot-origin) because it only depends on
 * the bounds, not the origin.
 */
export function groundedYOffset(bounds: SceneBounds): number {
  return -bounds.min[1];
}

/**
 * Uniform scale factor so the asset's height equals `targetHeight`.
 *
 * Lets assets with very different native scales (e.g. a 0.066m robot and a
 * 1.8m soldier) be normalized to comparable on-screen heights so they can
 * share a floor. Returns 1 when the asset is flat (zero height) or the target
 * is non-positive, so callers never produce NaN/Infinity scales.
 */
export function normalizedScaleForTargetHeight(bounds: SceneBounds, targetHeight: number): number {
  const height = boundsHeight(bounds);
  if (!(height > 0) || !(targetHeight > 0)) return 1;
  return targetHeight / height;
}

/** Uniform scale factor so the largest bounds extent equals `targetMaxDimension`. */
export function normalizedScaleForTargetMaxDimension(bounds: SceneBounds, targetMaxDimension: number): number {
  const maxDimension = boundsMaxDimension(bounds);
  if (!(maxDimension > 0) || !(targetMaxDimension > 0)) return 1;
  return targetMaxDimension / maxDimension;
}

/**
 * Scale for Aura3D's safe model renderer, which first normalizes GLBs to a
 * stable largest dimension and then applies user scale.
 *
 * Use this when writing normal `model(asset).scale(...)` examples. Use
 * `normalizedScaleForTargetMaxDimension` only when you are bypassing the safe
 * model renderer and working in raw asset-local units.
 */
export function normalizedRenderScaleForTargetMaxDimension(
  targetMaxDimension: number,
  normalizedMaxDimension = AURA_NORMALIZED_MODEL_MAX_DIMENSION
): number {
  if (!(targetMaxDimension > 0) || !(normalizedMaxDimension > 0)) return 1;
  return targetMaxDimension / normalizedMaxDimension;
}

/**
 * Scale for Aura3D's safe model renderer so the rendered height hits a target.
 *
 * The renderer's default maximum dimension is fixed, but the default rendered
 * height depends on the GLB's aspect ratio. This preserves each asset's aspect
 * ratio while making characters and props comparable on screen.
 */
export function normalizedRenderScaleForTargetHeight(
  bounds: SceneBounds,
  targetHeight: number,
  normalizedMaxDimension = AURA_NORMALIZED_MODEL_MAX_DIMENSION
): number {
  const rawMaxDimension = boundsMaxDimension(bounds);
  const rawHeight = boundsHeight(bounds);
  if (!(rawMaxDimension > 0) || !(rawHeight > 0) || !(targetHeight > 0) || !(normalizedMaxDimension > 0)) return 1;
  const defaultRenderedHeight = rawHeight / rawMaxDimension * normalizedMaxDimension;
  return targetHeight / defaultRenderedHeight;
}

/**
 * Resolve a deterministic grounded placement for an asset.
 *
 * Computes the uniform scale to hit `targetHeight`, then grounds the *scaled*
 * asset on `floorY`: the local ground offset (`-min.y`) is multiplied by the
 * same scale so the lowest point lands precisely on the floor after scaling.
 */
export function groundedPlacement(bounds: SceneBounds, options: GroundedPlacementOptions): GroundedPlacement {
  const x = options.x ?? 0;
  const z = options.z ?? 0;
  const floorY = options.floorY ?? 0;
  const scale = normalizedScaleForTargetHeight(bounds, options.targetHeight);
  const y = floorY + groundedYOffset(bounds) * scale;
  return { position: [x, y, z], scale };
}

/**
 * Build bounds from a generated typed asset record.
 *
 * Prefer `metadata.boundsMetadata.min/max` because it preserves the real pivot
 * and grounding offset from inspection. Fall back to the legacy `bounds` size
 * array when only extents are available.
 */
export function boundsFromAsset(asset: SceneAssetLike): SceneBounds {
  const metadata = asset.metadata?.boundsMetadata;
  const min = toVec3(metadata?.min);
  const max = toVec3(metadata?.max);
  if (min && max) return { min, max };

  const size = toVec3(metadata?.size) ?? toVec3(asset.bounds);
  const center = toVec3(metadata?.center);
  if (size) return boundsFromSize(size, center ?? [0, 0, 0]);

  return boundsFromSize([1, 1, 1]);
}

/**
 * Resolve a grounded placement directly from a typed asset record.
 *
 * This is the helper public examples should use instead of route-local scale
 * math. It keeps primary GLBs grounded even when the catalog asset has a
 * center-origin or extreme native units.
 */
export function groundedAssetPlacement(asset: SceneAssetLike, options: GroundedPlacementOptions): AssetGroundedPlacement {
  const bounds = boundsFromAsset(asset);
  const placement = groundedPlacement(bounds, options);
  return {
    ...placement,
    bounds,
    height: boundsHeight(bounds) * placement.scale
  };
}

/**
 * Resolve placement for normal public `model(asset)` usage.
 *
 * Aura3D's safe renderer already translates GLBs so their lowest local point
 * rests on the node's `position.y` after normalization. Therefore render-safe
 * grounded placement sets `position.y` directly to `floorY` and returns a scale
 * compatible with the renderer's normalized model size.
 */
export function groundedRenderedAssetPlacement(asset: SceneAssetLike, options: RenderGroundedPlacementOptions): RenderGroundedAssetPlacement {
  const bounds = boundsFromAsset(asset);
  const rawMaxDimension = boundsMaxDimension(bounds);
  const normalizedMaxDimension = options.normalizedMaxDimension ?? AURA_NORMALIZED_MODEL_MAX_DIMENSION;
  const scale = options.targetHeight !== undefined
    ? normalizedRenderScaleForTargetHeight(bounds, options.targetHeight, normalizedMaxDimension)
    : normalizedRenderScaleForTargetMaxDimension(options.targetMaxDimension ?? normalizedMaxDimension, normalizedMaxDimension);
  const height = rawMaxDimension > 0
    ? boundsHeight(bounds) / rawMaxDimension * normalizedMaxDimension * scale
    : boundsHeight(bounds) * scale;
  const maxDimension = normalizedMaxDimension * scale;
  return {
    position: [options.x ?? 0, options.floorY ?? 0, options.z ?? 0],
    scale,
    bounds,
    height,
    maxDimension
  };
}

/**
 * Convenience adapter: build {@link SceneBounds} from a `size` extent and an
 * optional `center`, matching the shape stored in `boundsMetadata`. When no
 * center is given the asset is treated as origin-centered.
 */
export function boundsFromSize(size: Vec3, center: Vec3 = [0, 0, 0]): SceneBounds {
  return {
    min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
    max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2]
  };
}

function toVec3(value: readonly number[] | undefined): Vec3 | undefined {
  if (!value || value.length < 3) return undefined;
  const vec: Vec3 = [Number(value[0]), Number(value[1]), Number(value[2])];
  return vec.every((component) => Number.isFinite(component)) ? vec : undefined;
}
