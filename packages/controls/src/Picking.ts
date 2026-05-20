import {
  ControlVector3,
  traverseControlObject,
  type ControlObject3DLike,
  type ControlPickMetadata,
  type Vector3Like
} from "./NativeControlTypes";

export interface V5PickResult {
  readonly object: ControlObject3DLike;
  readonly distance: number;
  readonly distanceAlongRay: number;
  readonly perpendicularDistance: number;
  readonly point: ControlVector3;
  readonly radius: number;
  readonly metadata?: ControlPickMetadata;
}

export interface PickingOptions {
  readonly near?: number;
  readonly far?: number;
  readonly tolerance?: number;
  readonly includeInvisible?: boolean;
  readonly includeNonRenderableMetadata?: boolean;
  readonly metadata?: (object: ControlObject3DLike) => ControlPickMetadata | undefined;
}

export interface PickingDiagnostics {
  readonly testedObjects: number;
  readonly candidateObjects: number;
  readonly hitCount: number;
  readonly skippedInvisible: number;
  readonly skippedNonPickable: number;
  readonly skippedDisabled: number;
  readonly skippedOutOfRange: number;
  readonly skippedMissedRadius: number;
  readonly nearestMissPerpendicularDistance: number | null;
  readonly nearestHitLabel: string | null;
}

export interface PickingReport {
  readonly hit: V5PickResult | null;
  readonly hits: readonly V5PickResult[];
  readonly diagnostics: PickingDiagnostics;
}

export class Picking {
  pick(
    root: ControlObject3DLike,
    origin: Vector3Like = new ControlVector3(),
    direction: Vector3Like = new ControlVector3(0, 0, -1),
    options: PickingOptions = {}
  ): V5PickResult | null {
    return this.report(root, origin, direction, options).hit;
  }

  pickAll(
    root: ControlObject3DLike,
    origin: Vector3Like = new ControlVector3(),
    direction: Vector3Like = new ControlVector3(0, 0, -1),
    options: PickingOptions = {}
  ): readonly V5PickResult[] {
    return this.report(root, origin, direction, options).hits;
  }

  report(
    root: ControlObject3DLike,
    origin: Vector3Like = new ControlVector3(),
    direction: Vector3Like = new ControlVector3(0, 0, -1),
    options: PickingOptions = {}
  ): PickingReport {
    const normalizedDirection = normalizedRayDirection(direction);
    const near = finiteRange(options.near ?? 0, "near", 0);
    const far = finiteRange(options.far ?? Number.POSITIVE_INFINITY, "far", near);
    const tolerance = finiteRange(options.tolerance ?? 0, "tolerance", 0);
    const hits: V5PickResult[] = [];
    const counters = {
      testedObjects: 0,
      candidateObjects: 0,
      skippedInvisible: 0,
      skippedNonPickable: 0,
      skippedDisabled: 0,
      skippedOutOfRange: 0,
      skippedMissedRadius: 0
    };
    let nearestMissPerpendicularDistance = Number.POSITIVE_INFINITY;

    traverseControlObject(root, (object) => {
      counters.testedObjects += 1;
      if (object.visible === false && options.includeInvisible !== true) {
        counters.skippedInvisible += 1;
        return;
      }
      const metadata = resolvePickMetadata(object, options);
      if (metadata?.selectable === false) {
        counters.skippedDisabled += 1;
        return;
      }
      if (!isPickableObject(object, metadata, options)) {
        counters.skippedNonPickable += 1;
        return;
      }
      counters.candidateObjects += 1;
      const toObject = new ControlVector3(
        object.position.x - origin.x,
        object.position.y - origin.y,
        object.position.z - origin.z
      );
      const distanceAlongRay = dot(toObject, normalizedDirection);
      if (distanceAlongRay < near || distanceAlongRay > far) {
        counters.skippedOutOfRange += 1;
        return;
      }
      const closestPoint = pointOnRay(origin, normalizedDirection, distanceAlongRay);
      const perpendicularDistance = new ControlVector3(
        object.position.x - closestPoint.x,
        object.position.y - closestPoint.y,
        object.position.z - closestPoint.z
      ).length();
      const radius = resolvePickRadius(object, metadata) + tolerance;
      if (perpendicularDistance > radius) {
        counters.skippedMissedRadius += 1;
        nearestMissPerpendicularDistance = Math.min(nearestMissPerpendicularDistance, perpendicularDistance);
        return;
      }
      const rayEntryDistance = Math.max(near, distanceAlongRay - Math.sqrt(Math.max(0, radius * radius - perpendicularDistance * perpendicularDistance)));
      hits.push({
        object,
        distance: rayEntryDistance,
        distanceAlongRay,
        perpendicularDistance,
        point: pointOnRay(origin, normalizedDirection, rayEntryDistance),
        radius,
        metadata
      });
    });

    hits.sort(compareHits);
    const hit = hits[0] ?? null;
    return {
      hit,
      hits,
      diagnostics: {
        ...counters,
        hitCount: hits.length,
        nearestMissPerpendicularDistance: Number.isFinite(nearestMissPerpendicularDistance) ? nearestMissPerpendicularDistance : null,
        nearestHitLabel: hit ? pickLabel(hit.object, hit.metadata) : null
      }
    };
  }
}

function normalizedRayDirection(direction: Vector3Like): ControlVector3 {
  const normalized = new ControlVector3(direction.x, direction.y, direction.z);
  const length = normalized.length();
  if (!Number.isFinite(length) || length <= 1e-8) {
    throw new RangeError("Picking ray direction must be finite and non-zero.");
  }
  return normalized.set(normalized.x / length, normalized.y / length, normalized.z / length);
}

function finiteRange(value: number, label: string, minimum: number): number {
  if (value === Number.POSITIVE_INFINITY && label === "far") return value;
  if (!Number.isFinite(value) || value < minimum) {
    throw new RangeError(`Picking ${label} must be finite and >= ${minimum}.`);
  }
  return value;
}

function resolvePickMetadata(object: ControlObject3DLike, options: PickingOptions): ControlPickMetadata | undefined {
  return options.metadata?.(object)
    ?? object.picking
    ?? readUserDataMetadata(object.userData);
}

function readUserDataMetadata(userData: Record<string, unknown> | undefined): ControlPickMetadata | undefined {
  const value = userData?.g3dPicking ?? userData?.picking;
  if (!value || typeof value !== "object") return undefined;
  return value as ControlPickMetadata;
}

function isPickableObject(
  object: ControlObject3DLike,
  metadata: ControlPickMetadata | undefined,
  options: PickingOptions
): boolean {
  if (metadata && options.includeNonRenderableMetadata !== false) return true;
  return object.type === "Mesh" || object.type === "Sprite" || object.type === "Points" || object.type === "LineSegments";
}

function resolvePickRadius(object: ControlObject3DLike, metadata: ControlPickMetadata | undefined): number {
  const explicit = metadata?.pickRadius ?? object.pickRadius ?? readUserDataRadius(object.userData);
  if (explicit !== undefined) return positiveFinite(explicit, "pickRadius");
  const scale = object.scale;
  if (!scale) return 0.5;
  const radius = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)) * 0.5;
  return Number.isFinite(radius) && radius > 0 ? radius : 0.5;
}

function readUserDataRadius(userData: Record<string, unknown> | undefined): number | undefined {
  const value = userData?.g3dPickRadius;
  return typeof value === "number" ? value : undefined;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Picking ${label} must be finite and positive.`);
  return value;
}

function dot(left: Vector3Like, right: Vector3Like): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function pointOnRay(origin: Vector3Like, direction: Vector3Like, distance: number): ControlVector3 {
  return new ControlVector3(
    origin.x + direction.x * distance,
    origin.y + direction.y * distance,
    origin.z + direction.z * distance
  );
}

function compareHits(left: V5PickResult, right: V5PickResult): number {
  const distanceDelta = left.distance - right.distance;
  if (Math.abs(distanceDelta) > 1e-8) return distanceDelta;
  return pickPriority(right) - pickPriority(left);
}

function pickPriority(hit: V5PickResult): number {
  return hit.metadata?.priority ?? hit.object.pickPriority ?? 0;
}

function pickLabel(object: ControlObject3DLike, metadata: ControlPickMetadata | undefined): string | null {
  return metadata?.label ?? metadata?.id ?? object.name ?? null;
}
