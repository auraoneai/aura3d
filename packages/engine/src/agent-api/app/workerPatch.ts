/**
 * K1 patch ops shared by the host mirror (workerNodes.ts) and the render
 * worker. Kept free of registry/query imports so the worker entry stays small.
 */
import type { AuraRuntimeNodeRegistry, AuraSceneSnapshot } from "../nodes/types.js";
import { AuraWorkerError } from "./workerRuntime.js";
import { nodeHandleExtensionsAll } from "../../contracts/runtimeNodes.js";

/**
 * Function-valued node-handle extension members (for example prd09
 * `setInstanceTransforms`, prd08 `teleport`, prd07 `setFog`). Their whole call
 * is replayed; the worker must have the same extension registered.
 */
export function isReplayableExtensionMethod(member: string): boolean {
  return nodeHandleExtensionsAll().some((extension) => extension.member === member);
}

/** Handle methods whose effect can be replayed in the worker. */
export const WORKER_PATCH_METHODS = [
  "setPosition", "setPivot", "setTransform", "translate", "setRotation", "setScale", "setVisible",
  "setText", "setMaterial", "setLight", "setInstances", "setInstanceMatrices",
  "play", "setAnimation", "setAnimationPose", "setAnimationBinding", "setMorphTarget", "setMorphTargets", "morphInfluence", "setUniform"
] as const;
/** Handle properties whose assignment can be replayed in the worker. */
export const WORKER_PATCH_PROPERTIES = ["position", "rotation", "scale", "visible", "renderOrder", "frustumCulled"] as const;

export type AuraWorkerPatchMethod = (typeof WORKER_PATCH_METHODS)[number];
export type AuraWorkerPatchProperty = (typeof WORKER_PATCH_PROPERTIES)[number];

/** One replayable change. Ops apply in order; `camera` replaces the scene camera spec. */
export type AuraWorkerNodePatchOp =
  | { readonly id: string; readonly call: AuraWorkerPatchMethod | (string & {}); readonly args: readonly unknown[] }
  | { readonly id: string; readonly set: AuraWorkerPatchProperty; readonly value: unknown }
  | { readonly camera: AuraSceneSnapshot["camera"] };

export const WORKER_PATCH_METHOD_SET = new Set<string>(WORKER_PATCH_METHODS);
export const WORKER_PATCH_PROPERTY_SET = new Set<string>(WORKER_PATCH_PROPERTIES);
/** Reads that are answered by the host mirror without a patch. */
export const WORKER_HOST_READS = new Set<string>([
  "id", "kind", "name", "tags", "version", "position", "pivot", "rotation", "scale", "visible", "renderOrder", "frustumCulled",
  "layers", "userData", "bounds", "snapshot", "effects", "morphTargets", "animationPose", "importedAssetEvidence",
  "getWorldPosition", "getWorldQuaternion", "getWorldScale", "toJSON", "then"
]);

/** Absolute writes: a later op with the same key makes an earlier one redundant. */
export function coalesceKey(op: AuraWorkerNodePatchOp): string | undefined {
  if ("camera" in op) return "camera";
  if ("set" in op) {
    const field = op.set === "visible" ? "visible" : op.set;
    return `${op.id}\u0000${field}`;
  }
  switch (op.call) {
    case "setPosition": return `${op.id}\u0000position`;
    case "setRotation": return `${op.id}\u0000rotation`;
    case "setScale": return `${op.id}\u0000scale`;
    case "setVisible": return `${op.id}\u0000visible`;
    case "setInstanceMatrices":
    case "setInstanceTransforms": return `${op.id}\u0000instanceMatrices`;
    case "setAnimationPose": return `${op.id}\u0000animationPose`;
    case "setMorphTarget": return `${op.id}\u0000morph\u0000${String(op.args[0])}`;
    case "setUniform": return `${op.id}\u0000uniform\u0000${String(op.args[0])}`;
    default: return undefined;
  }
}

/**
 * Worker side: replay ops on the registry the renderer reads. Every op is
 * attempted; the first failure is rethrown (recoverable) after the rest ran,
 * so one stale id does not drop a whole frame of movement.
 */
export function applyWorkerNodePatch(registry: AuraRuntimeNodeRegistry | undefined, scene: AuraSceneSnapshot | undefined, ops: readonly AuraWorkerNodePatchOp[]): number {
  if (!Array.isArray(ops)) throw new AuraWorkerError("Worker patch ops must be an array.", "invalid-patch", "recoverable");
  let applied = 0;
  let failure: unknown;
  for (const op of ops) {
    try {
      if (!op || typeof op !== "object") throw new Error("Worker patch op must be an object.");
      if ("camera" in op) {
        if (!scene) throw new Error("Worker scene is not mounted.");
        (scene as { camera: AuraSceneSnapshot["camera"] }).camera = op.camera;
        applied += 1;
        continue;
      }
      if (!registry) throw new AuraWorkerError("This worker renderer does not expose runtime nodes; node patches are unavailable.", "patch-unsupported", "recoverable");
      if (typeof op.id !== "string") throw new Error("Worker patch op needs a node id.");
      const handle = registry.require(op.id);
      if ("set" in op) {
        if (!WORKER_PATCH_PROPERTY_SET.has(op.set)) throw new Error(`Worker patch cannot assign node.${String(op.set)}.`);
        Reflect.set(handle, op.set, op.value, handle);
      } else {
        if (typeof op.call !== "string" || !Array.isArray(op.args)
          || (!WORKER_PATCH_METHOD_SET.has(op.call) && !isReplayableExtensionMethod(op.call))) throw new Error(`Worker patch cannot call node.${String((op as { call?: unknown }).call)}().`);
        const method = Reflect.get(handle, op.call, handle);
        if (typeof method !== "function") throw new Error(`node.${op.call}() is not available in the render worker (its extension or quality flag is missing there).`);
        (method as (...args: unknown[]) => unknown).apply(handle, op.args);
      }
      applied += 1;
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== undefined) {
    if (failure instanceof AuraWorkerError) throw new AuraWorkerError(failure.message, failure.code, "recoverable");
    throw new AuraWorkerError(`Worker node patch failed: ${failure instanceof Error ? failure.message : String(failure)}`, "invalid-patch", "recoverable");
  }
  return applied;
}
