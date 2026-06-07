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

/** Height (Y extent) of the bounds in the asset's own local units. */
export function boundsHeight(bounds: SceneBounds): number {
  return bounds.max[1] - bounds.min[1];
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
