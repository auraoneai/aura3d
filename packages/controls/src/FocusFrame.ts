import type { ControlObject3DLike, Vector3Like } from "./NativeControlTypes";

export interface FocusFrameTarget {
  readonly center: Vector3Like;
  readonly radius: number;
}

export interface FocusFrameOptions {
  /** Vertical field of view in degrees. */
  readonly fovDegrees?: number;
  /** Margin multiplier around the framing sphere (>= 1). */
  readonly margin?: number;
  /** Clamp for the resulting distance. */
  readonly minDistance?: number;
  readonly maxDistance?: number;
}

export interface FocusFrameResult {
  readonly target: Vector3Like;
  readonly distance: number;
  readonly radius: number;
  readonly objectCount: number;
}

/**
 * Focus framing for editor/viewport selection (F4).
 *
 * Computes the orbit target and camera distance that frames a set of picked
 * objects given a vertical field of view: the bounding sphere of the object
 * centers (expanded by each object's pick radius) is placed at `target`, and
 * `distance` fits that sphere with `margin` headroom. Pure math — a viewport
 * applies the result to its own camera, and the browser proof asserts the
 * framed object lands centered with the expected apparent size.
 */
export function frameSelection(
  objects: readonly ControlObject3DLike[],
  options: FocusFrameOptions = {}
): FocusFrameResult | undefined {
  const fovDegrees = options.fovDegrees ?? 45;
  const margin = options.margin ?? 1.25;
  const minDistance = options.minDistance ?? 0.5;
  const maxDistance = options.maxDistance ?? 100;
  if (!Number.isFinite(fovDegrees) || fovDegrees <= 1 || fovDegrees >= 179) {
    throw new RangeError("FocusFrame fovDegrees must be within (1, 179).");
  }
  if (!Number.isFinite(margin) || margin < 1) {
    throw new RangeError("FocusFrame margin must be >= 1.");
  }
  if (!Number.isFinite(minDistance) || minDistance <= 0) {
    throw new RangeError("FocusFrame minDistance must be positive and finite.");
  }
  if (!Number.isFinite(maxDistance) || maxDistance < minDistance) {
    throw new RangeError("FocusFrame maxDistance must be >= minDistance.");
  }
  if (objects.length === 0) return undefined;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const object of objects) {
    const radius = focusRadiusOf(object);
    minX = Math.min(minX, object.position.x - radius);
    minY = Math.min(minY, object.position.y - radius);
    minZ = Math.min(minZ, object.position.z - radius);
    maxX = Math.max(maxX, object.position.x + radius);
    maxY = Math.max(maxY, object.position.y + radius);
    maxZ = Math.max(maxZ, object.position.z + radius);
  }
  const target = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2
  };
  const radius = Math.max(
    (maxX - minX) / 2,
    (maxY - minY) / 2,
    (maxZ - minZ) / 2,
    1e-6
  );
  const halfFov = ((fovDegrees * Math.PI) / 180) / 2;
  const distance = Math.min(
    maxDistance,
    Math.max(minDistance, ((radius * margin) / Math.tan(halfFov)) || minDistance)
  );
  return { target, distance, radius, objectCount: objects.length };
}

/** Builds a focus target from an explicit center/radius pair (e.g. bounds math). */
export function frameTarget(target: FocusFrameTarget, options: FocusFrameOptions = {}): FocusFrameResult {
  const proxy: ControlObject3DLike = {
    position: { x: target.center.x, y: target.center.y, z: target.center.z },
    picking: { pickRadius: target.radius }
  };
  const result = frameSelection([proxy], options);
  if (!result) throw new Error("FocusFrame frameTarget unexpectedly produced no result.");
  return result;
}

function focusRadiusOf(object: ControlObject3DLike): number {
  const explicit = object.pickRadius ?? object.picking?.pickRadius;
  if (explicit !== undefined) {
    if (!Number.isFinite(explicit) || explicit <= 0) {
      throw new RangeError("FocusFrame pickRadius must be finite and positive.");
    }
    return explicit;
  }
  const scale = object.scale;
  if (scale) {
    const radius = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)) * 0.5;
    if (Number.isFinite(radius) && radius > 0) return radius;
  }
  return 0.5;
}
