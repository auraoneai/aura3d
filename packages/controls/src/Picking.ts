import { composeMat4, multiplyMat4, quatFromEulerXYZ, type Mat4 } from "@aura3d/scene";
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
  readonly normal?: ControlVector3;
  readonly uv?: readonly [number, number];
  readonly faceIndex?: number;
  readonly instanceId?: number;
  readonly batchMemberId?: string | number;
  readonly barycentric?: readonly [number, number, number];
}

/** Structural result from the engine's exact mesh query. */
export interface ExactScenePickHit {
  readonly object?: ControlObject3DLike;
  readonly nodeId?: string;
  readonly nodeName?: string | undefined;
  readonly distance: number;
  readonly point: readonly [number, number, number];
  readonly normal?: readonly [number, number, number];
  readonly uv?: readonly [number, number];
  readonly faceIndex?: number;
  readonly instanceId?: number;
  readonly batchMemberId?: string | number;
  readonly barycentric?: readonly [number, number, number];
}

/** Adapter to engine `raycast`, with the desired scene targets bound. */
export type ExactScenePickQuery = (
  ray: { readonly origin: readonly [number, number, number]; readonly direction: readonly [number, number, number]; readonly maxDistance?: number },
  options: { readonly mode: "mesh"; readonly near: number; readonly far: number; readonly recursive: true; readonly firstHitOnly: false }
) => readonly ExactScenePickHit[];

export interface PickingOptions {
  /** Sphere approximation remains the default for existing callers. */
  readonly mode?: "approximate" | "exact";
  readonly query?: ExactScenePickQuery;
  readonly resolveObject?: (hit: ExactScenePickHit) => ControlObject3DLike | undefined;
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
 * Pick against exact scene hits, or spherical approximations for compatibility.
 *
 * Exact mode obtains triangle, instance and deformed-mesh hits from the scene
 * query. Approximate mode uses explicitly authored pick spheres.
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
    if (options.mode === "exact") {
      return this.reportExact(root, origin, normalizedDirection, near, far, options);
    }
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

    visitHierarchy(root, (object, world, visible) => {
      counters.testedObjects += 1;
      if (!visible && options.includeInvisible !== true) {
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
      const radius = resolvePickRadius(object, metadata, world) + tolerance;
      const instances = resolveInstanceCenters(object, metadata, world);
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

  private reportExact(
    root: ControlObject3DLike,
    origin: Vector3Like,
    direction: Vector3Like,
    near: number,
    far: number,
    options: PickingOptions
  ): PickingReport {
    if (!options.query) throw new Error("Picking exact mode requires a scene query adapter.");
    const byName = new Map<string, ControlObject3DLike | null>();
    const byId = new Map<string, ControlObject3DLike | null>();
    const objects = new Set<ControlObject3DLike>();
    const visibility = new Map<ControlObject3DLike, boolean>();
    visitHierarchy(root, (object, _world, visible) => {
      objects.add(object);
      visibility.set(object, visible);
      if (object.name) byName.set(object.name, byName.has(object.name) ? null : object);
      const id = (object as ControlObject3DLike & { readonly id?: string }).id;
      if (id) byId.set(id, byId.has(id) ? null : object);
    });
    const rawHits = options.query({
      origin: [origin.x, origin.y, origin.z],
      direction: [direction.x, direction.y, direction.z],
      ...(Number.isFinite(far) ? { maxDistance: far } : {})
    }, { mode: "mesh", near, far, recursive: true, firstHitOnly: false });
    const hits: ThreeCompatPickResult[] = [];
    let skippedInvisible = 0;
    let skippedDisabled = 0;
    let skippedOutOfRange = 0;
    for (const raw of rawHits) {
      if (!Number.isFinite(raw.distance) || raw.distance < near || raw.distance > far) {
        skippedOutOfRange += 1;
        continue;
      }
      const mapped = raw.object ?? options.resolveObject?.(raw);
      const object = mapped ?? (raw.nodeId && byId.has(raw.nodeId) ? byId.get(raw.nodeId) : raw.nodeName ? byName.get(raw.nodeName) : undefined);
      if (!object || !objects.has(object)) {
        throw new Error(`Picking could not uniquely resolve exact scene hit ${raw.nodeId ?? raw.nodeName ?? "without an identity"}; provide resolveObject.`);
      }
      if (!visibility.get(object) && options.includeInvisible !== true) {
        skippedInvisible += 1;
        continue;
      }
      const metadata = resolvePickMetadata(object, options);
      if (metadata?.selectable === false) {
        skippedDisabled += 1;
        continue;
      }
      if (!raw.point.every(Number.isFinite)) throw new RangeError("Picking exact query returned a non-finite point.");
      if (raw.normal && !raw.normal.every(Number.isFinite)) throw new RangeError("Picking exact query returned a non-finite normal.");
      hits.push({
        object,
        distance: raw.distance,
        distanceAlongRay: raw.distance,
        perpendicularDistance: 0,
        point: new ControlVector3(...raw.point),
        radius: 0,
        metadata: raw.instanceId === undefined ? metadata : { ...metadata, instanceId: raw.instanceId },
        ...(raw.normal ? { normal: new ControlVector3(...raw.normal) } : {}),
        ...(raw.uv ? { uv: raw.uv } : {}),
        ...(raw.faceIndex === undefined ? {} : { faceIndex: raw.faceIndex }),
        ...(raw.instanceId === undefined ? {} : { instanceId: raw.instanceId }),
        ...(raw.batchMemberId === undefined ? {} : { batchMemberId: raw.batchMemberId }),
        ...(raw.barycentric ? { barycentric: raw.barycentric } : {})
      });
    }
    hits.sort(compareHits);
    const hit = hits[0] ?? null;
    return {
      hit,
      hits,
      diagnostics: {
        testedObjects: objects.size,
        candidateObjects: rawHits.length,
        hitCount: hits.length,
        skippedInvisible,
        skippedNonPickable: 0,
        skippedDisabled,
        skippedOutOfRange,
        skippedMissedRadius: 0,
        nearestMissPerpendicularDistance: null,
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
  metadata: ControlPickMetadata | undefined,
  world: Mat4
): readonly Vector3Like[] {
  const positions = metadata?.instancePositions;
  if (!positions || positions.length === 0) return [{ x: world[12], y: world[13], z: world[14] }];
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

function resolvePickRadius(object: ControlObject3DLike, metadata: ControlPickMetadata | undefined, world: Mat4): number {
  const explicit = metadata?.pickRadius ?? object.pickRadius ?? readUserDataRadius(object.userData);
  if (explicit !== undefined) return positiveFinite(explicit, "pickRadius");
  const radius = Math.max(Math.hypot(world[0], world[1], world[2]), Math.hypot(world[4], world[5], world[6]), Math.hypot(world[8], world[9], world[10])) * 0.5;
  return Number.isFinite(radius) && radius > 0 ? radius : 0.5;
}

/** Traverse authored objects with inherited transforms, including default-origin nodes. */
function visitHierarchy(root: ControlObject3DLike, visit: (object: ControlObject3DLike, world: Mat4, visible: boolean) => void): void {
  const walk = (object: ControlObject3DLike, parent?: Mat4, parentVisible = true, descend = true): void => {
    const position = object.position;
    const rotation = object.rotation ?? { x: 0, y: 0, z: 0 };
    const scale = object.scale ?? { x: 1, y: 1, z: 1 };
    const local = composeMat4([position.x, position.y, position.z], quatFromEulerXYZ(rotation.x, rotation.y, rotation.z), [scale.x, scale.y, scale.z]);
    const matrix = (object as ControlObject3DLike & { readonly matrixWorld?: ArrayLike<number> | { readonly elements: ArrayLike<number> } }).matrixWorld;
    const elements = matrix && "elements" in Object(matrix) ? (matrix as { readonly elements: ArrayLike<number> }).elements : matrix as ArrayLike<number> | undefined;
    const world = elements?.length === 16 ? Array.from(elements) as Mat4 : parent ? multiplyMat4(parent, local) : local;
    const visible = parentVisible && object.visible !== false;
    visit(object, world, visible);
    if (descend) for (const child of object.children ?? []) walk(child, world, visible);
  };
  if (root.children === undefined && root.traverse) {
    // A traversal-only provider does not expose a hierarchy; preserve its
    // existing contract while using any world matrices it supplies.
    traverseControlObject(root, (object) => walk(object, undefined, true, false));
  } else walk(root);
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
