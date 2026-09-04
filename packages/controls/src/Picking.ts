import {
  ControlVector3,
  traverseControlObject,
  type ControlObject3DLike,
  type ControlPickMetadata,
  type Vector3Like
} from "./NativeControlTypes";

export interface ThreeCompatPickResult {
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
  readonly hit: ThreeCompatPickResult | null;
  readonly hits: readonly ThreeCompatPickResult[];
  readonly diagnostics: PickingDiagnostics;
}

/**
 * Sphere-based picking over `ControlObject3DLike` scene graphs.
 *
 * Scope notes (F4):
 *
 * - `SkinnedMesh` objects are pickable via the same bind-pose sphere test as
 *   static meshes (position plus `pickRadius`). Bone-deformed triangles beyond
 *   that radius are an explicit non-goal: this layer answers "which authored
 *   object did the pointer hit", not triangle-exact skinning queries.
 * - `InstancedMesh` objects are pickable per instance: metadata
 *   `instancePositions` lists world-space instance centers, each tested as
 *   its own sphere, and a hit reports the nearest entry as
 *   `metadata.instanceId`. Without `instancePositions` the single object
 *   sphere is tested, exactly like a static mesh.
 */
export class Picking {
  pick(
    root: ControlObject3DLike,
    origin: Vector3Like = new ControlVector3(),
    direction: Vector3Like = new ControlVector3(0, 0, -1),
    options: PickingOptions = {}
  ): ThreeCompatPickResult | null {
    return this.report(root, origin, direction, options).hit;
  }

  pickAll(
    root: ControlObject3DLike,
    origin: Vector3Like = new ControlVector3(),
    direction: Vector3Like = new ControlVector3(0, 0, -1),
    options: PickingOptions = {}
  ): readonly ThreeCompatPickResult[] {
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
    const hits: ThreeCompatPickResult[] = [];
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
      const radius = resolvePickRadius(object, metadata) + tolerance;
      const instances = resolveInstanceCenters(object, metadata);
      for (let instanceId = 0; instanceId < instances.length; instanceId += 1) {
        const center = instances[instanceId];
        const toCenter = new ControlVector3(
          center.x - origin.x,
          center.y - origin.y,
          center.z - origin.z
        );
        const distanceAlongRay = dot(toCenter, normalizedDirection);
        if (distanceAlongRay < near || distanceAlongRay > far) {
          counters.skippedOutOfRange += 1;
          continue;
        }
        const closestPoint = pointOnRay(origin, normalizedDirection, distanceAlongRay);
        const perpendicularDistance = new ControlVector3(
          center.x - closestPoint.x,
          center.y - closestPoint.y,
          center.z - closestPoint.z
        ).length();
        if (perpendicularDistance > radius) {
          counters.skippedMissedRadius += 1;
          nearestMissPerpendicularDistance = Math.min(nearestMissPerpendicularDistance, perpendicularDistance);
          continue;
        }
        const rayEntryDistance = Math.max(near, distanceAlongRay - Math.sqrt(Math.max(0, radius * radius - perpendicularDistance * perpendicularDistance)));
        hits.push({
          object,
          distance: rayEntryDistance,
          distanceAlongRay,
          perpendicularDistance,
          point: pointOnRay(origin, normalizedDirection, rayEntryDistance),
          radius,
          metadata: instances.length > 1 ? { ...metadata, instanceId } : metadata
        });
      }
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
  const value = userData?.a3dPicking ?? userData?.picking;
  if (!value || typeof value !== "object") return undefined;
  return value as ControlPickMetadata;
}

function isPickableObject(
  object: ControlObject3DLike,
  metadata: ControlPickMetadata | undefined,
  options: PickingOptions
): boolean {
  if (metadata && options.includeNonRenderableMetadata !== false) return true;
  return object.type === "Mesh" ||
    object.type === "SkinnedMesh" ||
    object.type === "InstancedMesh" ||
    object.type === "Sprite" ||
    object.type === "Points" ||
    object.type === "LineSegments";
}

function resolveInstanceCenters(
  object: ControlObject3DLike,
  metadata: ControlPickMetadata | undefined
): readonly Vector3Like[] {
  const positions = metadata?.instancePositions;
  if (!positions || positions.length === 0) return [object.position];
  return positions.map((entry): Vector3Like => {
    if (Array.isArray(entry)) {
      return {
        x: Number(entry[0] ?? 0),
        y: Number(entry[1] ?? 0),
        z: Number(entry[2] ?? 0)
      };
    }
    return entry as Vector3Like;
  });
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
  const value = userData?.a3dPickRadius;
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

function compareHits(left: ThreeCompatPickResult, right: ThreeCompatPickResult): number {
  const distanceDelta = left.distance - right.distance;
  if (Math.abs(distanceDelta) > 1e-8) return distanceDelta;
  return pickPriority(right) - pickPriority(left);
}

function pickPriority(hit: ThreeCompatPickResult): number {
  return hit.metadata?.priority ?? hit.object.pickPriority ?? 0;
}

function pickLabel(object: ControlObject3DLike, metadata: ControlPickMetadata | undefined): string | null {
  return metadata?.label ?? metadata?.id ?? object.name ?? null;
}
