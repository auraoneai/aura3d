import type { CameraFrameBounds } from "@aura3d/rendering";

/**
 * Up-axis of the source asset. Most glTF assets are Y-up (spec default), but
 * many catalog exports (CAD/Blender Z-up pipelines) ship Z-up geometry.
 */
export type GLTFUpAxis = "y" | "z";

export interface AutoFitTransform {
  /** Uniform scale to apply so the model reaches the target height. */
  readonly scale: number;
  /**
   * Translation (post-scale) that recenters the model horizontally and places
   * its lowest point ("feet") at y = 0.
   */
  readonly translation: readonly [number, number, number];
  /**
   * Quaternion (x, y, z, w) that rotates source up-axis to Y-up, applied before
   * scale/translation. Identity `[0, 0, 0, 1]` when no correction is needed.
   */
  readonly rotation: readonly [number, number, number, number];
  /** The up-axis correction that was applied (`"none"` when already Y-up). */
  readonly upAxisCorrection: "none" | "z-to-y";
  /** The largest source extent, useful for diagnostics/logging. */
  readonly sourceExtent: number;
  /** The resulting model height after the transform is applied. */
  readonly fittedHeight: number;
}

export interface AutoFitOptions {
  /** Target height (in world units) the model should occupy. Default 1.6. */
  readonly targetHeight?: number;
  /**
   * Source up-axis. When omitted, the loader keeps the asset as-authored
   * (`"y"`); pass `"z"` for Z-up catalog exports to rotate them upright.
   */
  readonly upAxis?: GLTFUpAxis;
  /**
   * Recenter the model on the ground plane (feet at y = 0, centered in X/Z).
   * Default `true`. When `false`, only scale (and optional rotation) is returned.
   */
  readonly recenter?: boolean;
}

const IDENTITY_ROTATION = [0, 0, 0, 1] as const;
// Quaternion for -90deg about X, which maps Z-up geometry to Y-up.
const Z_TO_Y_ROTATION = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] as const;
const DEFAULT_TARGET_HEIGHT = 1.6;
const MIN_EXTENT_EPSILON = 1e-6;

/**
 * Compute a fit-to-height transform for a loaded glTF scene's bounds.
 *
 * Catalog models vary wildly in scale and orientation: one Sketchfab export had
 * an extent of ~1821 units while a Kenney prop is ~1 unit, and Z-up CAD exports
 * arrive lying on their side. This helper returns a single uniform scale +
 * translation (and optional up-axis rotation) so any model fits a target height
 * with its feet on the ground plane, independent of the renderer.
 *
 * The returned transform is meant to be applied in order: rotation, then scale,
 * then translation.
 */
export function computeAutoFitTransform(
  bounds: CameraFrameBounds,
  options: AutoFitOptions = {}
): AutoFitTransform {
  const targetHeight = options.targetHeight ?? DEFAULT_TARGET_HEIGHT;
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
    throw new Error("computeAutoFitTransform targetHeight must be a positive finite number.");
  }
  const recenter = options.recenter ?? true;
  const upAxisCorrection = options.upAxis === "z" ? "z-to-y" : "none";
  const rotation = upAxisCorrection === "z-to-y" ? Z_TO_Y_ROTATION : IDENTITY_ROTATION;

  // Reorient the AABB into the post-rotation (Y-up) frame before measuring height.
  const oriented = upAxisCorrection === "z-to-y" ? rotateBoundsZtoY(bounds) : bounds;

  const size: readonly [number, number, number] = [
    Math.max(0, oriented.max[0] - oriented.min[0]),
    Math.max(0, oriented.max[1] - oriented.min[1]),
    Math.max(0, oriented.max[2] - oriented.min[2])
  ];
  const sourceExtent = Math.max(size[0], size[1], size[2]);
  const height = size[1];
  const scale = height > MIN_EXTENT_EPSILON ? targetHeight / height : 1;

  let translation: readonly [number, number, number] = [0, 0, 0];
  if (recenter) {
    const centerX = (oriented.min[0] + oriented.max[0]) / 2;
    const centerZ = (oriented.min[2] + oriented.max[2]) / 2;
    const floorY = oriented.min[1];
    translation = [-centerX * scale, -floorY * scale, -centerZ * scale];
  }

  return {
    scale,
    translation,
    rotation,
    upAxisCorrection,
    sourceExtent,
    fittedHeight: height * scale
  };
}

/**
 * Convenience wrapper that reads `.bounds` off an object (e.g. a
 * `GLTFRenderResources` instance) and computes the fit transform.
 */
export function autoFitGLTFScene(
  scene: { readonly bounds: CameraFrameBounds },
  options: AutoFitOptions = {}
): AutoFitTransform {
  return computeAutoFitTransform(scene.bounds, options);
}

/**
 * Rotate an axis-aligned bounding box by the Z-up -> Y-up correction. Because the
 * rotation is axis-aligned (-90deg about X), this maps each source axis to a
 * destination axis exactly: x -> x, y -> z, z -> -y.
 */
function rotateBoundsZtoY(bounds: CameraFrameBounds): CameraFrameBounds {
  const xs = [bounds.min[0], bounds.max[0]];
  const ys = [bounds.min[1], bounds.max[1]];
  const zs = [bounds.min[2], bounds.max[2]];
  // mapped axes: newX = x, newY = z, newZ = -y
  const newX = xs;
  const newY = zs;
  const newZ = ys.map((value) => -value);
  return {
    min: [Math.min(...newX), Math.min(...newY), Math.min(...newZ)],
    max: [Math.max(...newX), Math.max(...newY), Math.max(...newZ)]
  };
}
