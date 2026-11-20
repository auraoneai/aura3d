/**
 * Leaf seam for the world pose of a model or primitive handle nested under a live parent (5.7.0: nested handle
 * getters and setters are parent-local). Camera subjects, look-at and bone-attachment targets and the game scene
 * bridge read or publish world poses through here instead of importing `app/runtimeNodes.ts`, which would pull the
 * runtime node registry, compiler and scene math into the camera rigs, `@aura3d/game` and the agent-api SCC.
 *
 * `app/runtimeNodes.ts` registers the implementation when it evaluates. Only that module creates parented handles,
 * so before it registers no handle can be parented and the defaults (`undefined` / `false`) are the exact answer.
 */
import type { AuraVec3 } from "../nodes/types.js";
import type { AuraQuat } from "../../contracts/sceneGraph.js";

export interface RuntimeNodeParentedWorldPose {
  readonly position: AuraVec3; readonly quaternion: AuraQuat; readonly rotation: AuraVec3; readonly scale: AuraVec3;
  /** Maps a point in the handle's own (parent-local) space, e.g. an interpolated `position`, to world space. */
  readonly toWorld: (local: readonly number[]) => AuraVec3;
}

export interface RuntimeNodeParentedWorldPoseWrite {
  readonly position: AuraVec3; readonly quaternion?: AuraQuat; readonly scale?: number | AuraVec3;
}

interface ParentedWorldPoseProvider {
  read(handle: object): RuntimeNodeParentedWorldPose | undefined;
  write(handle: object, pose: RuntimeNodeParentedWorldPoseWrite): boolean;
}

let provider: ParentedWorldPoseProvider | undefined;

/** Called once by `app/runtimeNodes.ts`, the owner of the parented-node state. */
export function registerParentedWorldPoseProvider(next: ParentedWorldPoseProvider): void {
  provider = next;
}

/**
 * World pose of a model or primitive handle under a live parent, or `undefined` for any other handle (top-level nodes,
 * groups, foreign handle-likes), whose own `position`/`rotation`/`scale` already serve.
 */
export function runtimeNodeParentedWorldPose(handle: object): RuntimeNodeParentedWorldPose | undefined {
  return provider?.read(handle);
}

/**
 * Write a world-space pose onto a model or primitive handle under a live parent (solving the parent-local transform);
 * returns `false`, writing nothing, for any other handle, so callers fall back to the handle's own setters.
 */
export function setRuntimeNodeParentedWorldPose(handle: object, pose: RuntimeNodeParentedWorldPoseWrite): boolean {
  return provider?.write(handle, pose) ?? false;
}
