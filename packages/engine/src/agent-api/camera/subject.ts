/**
 * Subject resolution for C-22 rigs: runtime-node handle → interpolated
 * `AuraCameraSubject`, with the legacy scene-node fallback kept distinct so
 * `rigs.fromSpec` can reproduce the pre-controller resolution order exactly
 * (runtime target wins; scene node only when no runtime target resolves).
 */
import type { AuraVec3 } from "../index.js";
import type { AuraCameraSubject } from "../../contracts/camera.js";
import { quatFromEulerXYZ, quatRotateVec3, quatToEulerXYZ, type AuraQuat } from "./quat.js";

/** What a camera rig needs to know about a resolved node. */
export interface ResolvedSubjectSource {
  readonly position: AuraVec3;
  readonly rotation: AuraVec3; // Euler XYZ, as stored on the node/handle
}

/** A node in the scene snapshot a follow spec may bind to (model/primitive). */
export interface SceneCameraNodeLike {
  readonly kind: string;
  readonly name?: string;
  readonly position?: AuraVec3;
  readonly rotation?: AuraVec3;
  readonly runtime?: { readonly id?: string };
  readonly asset?: { readonly id?: string };
}

export interface RuntimeHandleLike {
  readonly id: string;
  readonly name?: string;
  readonly tags: readonly string[];
  readonly position: AuraVec3;
  readonly rotation: AuraVec3;
  readonly visible?: boolean;
  bounds(): { readonly min: AuraVec3; readonly max: AuraVec3 };
}

export interface RuntimeRegistryLike {
  get(id: string): RuntimeHandleLike | undefined;
  all(): readonly RuntimeHandleLike[];
}

/** Forward vector of a node under Euler XYZ rotation, matching `eulerToQuat`. */
export function subjectForward(rotation: AuraVec3): AuraVec3 {
  const q = quatFromEulerXYZ(rotation);
  const f = quatRotateVec3(q, [0, 0, 1]);
  const len = Math.hypot(f[0], f[1], f[2]);
  return len > 1e-9 ? [f[0] / len, f[1] / len, f[2] / len] : [0, 0, 1];
}

/**
 * Legacy runtime-target resolution (index.ts `findRuntimeCameraTarget`):
 * direct handle by id wins (even when hidden), then name/tag match among
 * visible handles.
 */
export function findRuntimeTarget(
  registry: RuntimeRegistryLike | undefined,
  ref: string | undefined
): ResolvedSubjectSource | undefined {
  if (!registry || !ref) return undefined;
  const direct = registry.get(ref);
  if (direct) return { position: direct.position, rotation: direct.rotation };
  const named = registry.all().find(
    (h) => h.visible !== false && (h.name === ref || h.tags.includes(ref))
  );
  return named ? { position: named.position, rotation: named.rotation } : undefined;
}

/** Legacy scene-node fallback (model/primitive by name, asset id, or runtime id). */
export function findSceneNodeTarget(
  nodes: readonly SceneCameraNodeLike[] | undefined,
  ref: string | undefined
): ResolvedSubjectSource | undefined {
  if (!nodes || !ref) return undefined;
  const node = nodes.find(
    (n) =>
      (n.kind === "model" || n.kind === "primitive") &&
      (n.name === ref ||
        (n.kind === "model" && n.asset?.id === ref) ||
        n.runtime?.id === ref)
  );
  return node?.position ? { position: node.position, rotation: node.rotation ?? [0, 0, 0] } : undefined;
}

/** Build the C-22 subject for a runtime handle (velocity filled by the controller). */
export function subjectFromHandle(
  handle: RuntimeHandleLike,
  velocity: AuraVec3 = [0, 0, 0]
): AuraCameraSubject {
  const bounds = handle.bounds();
  const subject: AuraCameraSubject & { rotation?: AuraQuat } = {
    position: handle.position,
    velocity,
    forward: subjectForward(handle.rotation),
    bounds: { min: bounds.min, max: bounds.max },
    rotation: quatFromEulerXYZ(handle.rotation) // CCR-08-2
  };
  return subject;
}

/** Euler-Y of a subject for target-yaw offsets — exact `rotation[1]` when the
 * rotation quaternion is present (CCR-08-2), else yaw of `forward`. */
export function subjectRotationY(subject: AuraCameraSubject): number {
  const q = (subject as { rotation?: AuraQuat }).rotation;
  if (q) return quatToEulerXYZ(q)[1];
  const f = subject.forward;
  return Math.atan2(f[0], f[2]);
}
