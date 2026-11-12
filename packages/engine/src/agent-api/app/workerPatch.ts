/**
 * K1 patch ops shared by the host mirror (workerNodes.ts) and the render
 * worker. Kept free of registry/query imports so the worker entry stays small.
 */
import type { AuraRuntimeNodeRegistry, AuraSceneNode, AuraSceneSnapshot } from "../nodes/types.js";
import { AuraWorkerError } from "./workerError.js";
import { nodeHandleExtensionsAll } from "../../contracts/runtimeNodes.js";
import { batchedStateFor, type BatchedMeshStateSnapshot } from "../nodes/batchedState.js";

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
  // 5.4 N7 guessed-name setters (handleAliases.ts); they write through setLight / setMaterial in the worker.
  "setColor", "setIntensity", "setOpacity", "setEmissive",
  "play", "setAnimation", "setAnimationPose", "setAnimationBinding", "setMorphTarget", "setMorphTargets", "morphInfluence", "setUniform",
  // SG-05 dynamic geometry (particle and FX pools write their attributes every frame).
  "setGeometry", "updateAttribute"
] as const;
/** Handle properties whose assignment can be replayed in the worker. */
export const WORKER_PATCH_PROPERTIES = ["position", "rotation", "scale", "visible", "renderOrder", "frustumCulled"] as const;

export type AuraWorkerPatchMethod = (typeof WORKER_PATCH_METHODS)[number];
export type AuraWorkerPatchProperty = (typeof WORKER_PATCH_PROPERTIES)[number];

/** One replayable change. Ops apply in order; `camera` replaces the scene camera spec. */
export type AuraWorkerNodePatchOp =
  | { readonly id: string; readonly call: AuraWorkerPatchMethod | (string & {}); readonly args: readonly unknown[] }
  | { readonly id: string; readonly set: AuraWorkerPatchProperty; readonly value: unknown }
  | { readonly camera: AuraSceneSnapshot["camera"] }
  /** A host repaint of a live image texture (`texture.canvas`): its full RGBA8 pixels, top row first. */
  | { readonly texture: string; readonly width: number; readonly height: number; readonly data: Uint8ClampedArray | Uint8Array }
  /** 5.4: the host's current copy of a batched / instanced mesh state (`setMatrixAt`, `addInstance`, `setCount` writes). */
  | { readonly batched: string; readonly state: BatchedMeshStateSnapshot }
  /** 5.4: an app-level runtime control replayed in the worker (see {@link WORKER_APP_CALLS}). */
  | { readonly app: AuraWorkerAppCall; readonly args: readonly unknown[] }
  /** 5.5.3: structural scene-graph additions/removals (`app.nodes.add` / `remove` / `clear`) replayed in order. */
  | { readonly structural: "add"; readonly node: AuraSceneNode; readonly options?: { readonly parent?: string } }
  | { readonly structural: "remove"; readonly id: string }
  | { readonly structural: "clear" };

/**
 * 5.4: app members a worker app forwards to the render worker: the output (tone mapping, exposure), the runtime
 * post-effect overrides, custom post passes, the atmosphere (fog, sky, wetness), runtime effects and the lighting environment. They apply to the worker renderer between frames, like node patches.
 */
export const WORKER_APP_CALLS = [
  "setOutput", "post.setEffect", "post.setEffectEnabled", "post.setQualityTier", "post.setPassUniform",
  // `post.addPostPass` carries [token, pass]; the host's release posts `post.removePostPass` [token].
  "post.addPostPass", "post.removePostPass",
  // `app.atmosphere` fog/sky/wetness: replayed into the worker's PRD-07 atmosphere (and again after a remount).
  "atmosphere.setFog", "atmosphere.setSky", "atmosphere.setWetness",
  // `app.effects`: starts carry a host token first ([token, ...args]); `effects.handle` is [token, method, ...args].
  "effects.burst", "effects.spawn", "effects.trail", "effects.decal", "effects.handle",
  "effects.registerPreset", "effects.setRuntime", "effects.clear",
  // `app.lighting`: the environment term (scale, yaw, runtime swap) and probe / irradiance refresh requests.
  "lighting.setEnvironmentIntensity", "lighting.setEnvironmentRotation", "lighting.setEnvironment",
  "lighting.updateProbe", "lighting.rebakeIrradiance"
] as const;
export type AuraWorkerAppCall = (typeof WORKER_APP_CALLS)[number];
const WORKER_APP_CALL_SET = new Set<string>(WORKER_APP_CALLS);

/** Worker-side target of a `texture` op (see workerRuntime.ts). */
export interface AuraWorkerPatchTextureTarget {
  readonly width: number;
  readonly height: number;
  write(data: Uint8ClampedArray | Uint8Array): void;
}

export const WORKER_PATCH_METHOD_SET = new Set<string>(WORKER_PATCH_METHODS);
export const WORKER_PATCH_PROPERTY_SET = new Set<string>(WORKER_PATCH_PROPERTIES);
/** Reads that are answered by the host mirror without a patch. */
export const WORKER_HOST_READS = new Set<string>([
  "id", "kind", "name", "tags", "version", "position", "pivot", "rotation", "scale", "visible", "renderOrder", "frustumCulled",
  "layers", "userData", "bounds", "snapshot", "effects", "morphTargets", "animationPose", "importedAssetEvidence",
  "getWorldPosition", "getWorldQuaternion", "getWorldScale", "toJSON", "then"
]);

const ownedPatchBuffers = new WeakSet<ArrayBuffer>();

/**
 * Mark a privately cloned `ArrayBuffer` as owned by the worker patch queue so
 * `postMessage` can transfer it zero-copy without detaching caller-retained views.
 */
export function markWorkerOwnedBuffer(buffer: ArrayBufferLike | undefined): void {
  if (buffer instanceof ArrayBuffer && buffer.byteLength > 0) ownedPatchBuffers.add(buffer);
}

/** Collect unique patch-owned `ArrayBuffer`s safe to pass in the `postMessage` transfer list. */
export function collectWorkerPatchTransferables(ops: readonly AuraWorkerNodePatchOp[]): Transferable[] {
  const seen = new Set<ArrayBuffer>();
  const addView = (view: unknown): void => {
    if (!ArrayBuffer.isView(view)) return;
    const { buffer } = view;
    if (buffer instanceof ArrayBuffer && buffer.byteLength > 0 && ownedPatchBuffers.has(buffer)) {
      seen.add(buffer);
    }
  };
  const walkOwnedArgs = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (ArrayBuffer.isView(value)) { addView(value); return; }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) walkOwnedArgs(value[i]);
      return;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return;
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) walkOwnedArgs(record[key]);
  };
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];
    if (!op || typeof op !== "object") continue;
    if ("texture" in op) {
      addView(op.data);
    } else if ("batched" in op) {
      const s = op.state;
      if (s && typeof s === "object") {
        addView(s.matrices);
        addView(s.colors);
        addView(s.geometryIds);
        addView(s.alive);
        addView(s.visible);
      }
    } else if ("call" in op) {
      walkOwnedArgs(op.args);
    }
  }
  return seen.size > 0 ? [...seen] : [];
}

/** Absolute writes: a later op with the same key makes an earlier one redundant. */
export function coalesceKey(op: AuraWorkerNodePatchOp): string | undefined {
  if ("camera" in op) return "camera";
  if ("structural" in op) return undefined;
  if ("app" in op) {
    switch (op.app) {
      case "setOutput": return "\u0000app\u0000setOutput";
      case "post.setQualityTier": return "\u0000app\u0000post.setQualityTier";
      case "post.setEffectEnabled": return `\u0000app\u0000post.setEffectEnabled\u0000${String(op.args[0])}`;
      case "post.setPassUniform": return `\u0000app\u0000post.setPassUniform\u0000${String(op.args[0])}\u0000${String(op.args[1])}`;
      case "atmosphere.setWetness": return op.args.length <= 1 ? "\u0000app\u0000atmosphere.setWetness" : undefined;
      case "lighting.setEnvironmentIntensity": return "\u0000app\u0000lighting.setEnvironmentIntensity";
      case "lighting.setEnvironmentRotation": return "\u0000app\u0000lighting.setEnvironmentRotation";
      default: return undefined;
    }
  }
  if ("batched" in op) return `\u0000batched\u0000${op.batched}`;
  if ("texture" in op) return `\u0000texture\u0000${op.texture}`;
  if ("set" in op) {
    const field = op.set === "visible" ? "visible" : op.set;
    return `${op.id}\u0000${field}`;
  }
  switch (op.call) {
    case "setPosition": return `${op.id}\u0000position`;
    case "setRotation": return `${op.id}\u0000rotation`;
    case "setScale": return `${op.id}\u0000scale`;
    case "setVisible": return `${op.id}\u0000visible`;
    case "setMaterial": return `${op.id}\u0000material`;
    case "setColor": return `${op.id}\u0000color`;
    case "setOpacity": return `${op.id}\u0000opacity`;
    case "setEmissive": return `${op.id}\u0000emissive`;
    case "setIntensity": return `${op.id}\u0000intensity`;
    case "setLight": {
      const transition = (op.args[1] as { readonly transitionSeconds?: number } | undefined)?.transitionSeconds ?? 0;
      return `${op.id}\u0000light\u0000${String(transition)}`;
    }
    case "updateAttribute": {
      const offset = (op.args[1] as { readonly offset?: number } | undefined)?.offset ?? 0;
      return `${op.id}\u0000attr\u0000${String(op.args[0])}\u0000${String(offset)}`;
    }
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
export function applyWorkerNodePatch(registry: AuraRuntimeNodeRegistry | undefined, scene: AuraSceneSnapshot | undefined, ops: readonly AuraWorkerNodePatchOp[],
  textures?: (id: string) => AuraWorkerPatchTextureTarget | undefined,
  appCall?: (call: AuraWorkerAppCall, args: readonly unknown[]) => void): number {
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
      if ("app" in op) {
        if (typeof op.app !== "string" || !WORKER_APP_CALL_SET.has(op.app) || !Array.isArray(op.args)) throw new Error(`Worker patch cannot call app.${String(op.app)}().`);
        if (!appCall) throw new AuraWorkerError("This worker renderer does not accept app calls.", "patch-unsupported", "recoverable");
        appCall(op.app, op.args);
        applied += 1;
        continue;
      }
      if ("batched" in op) {
        const state = typeof op.batched === "string" ? batchedStateFor(op.batched) : undefined;
        if (!state || op.state?.kind !== "aura-worker-batched-state" || op.state.id !== op.batched) throw new Error(`Worker batched state ${String(op.batched)} is not part of the mounted scene.`);
        state.syncFromWorkerSnapshot(op.state);
        applied += 1;
        continue;
      }
      if ("texture" in op) {
        const target = typeof op.texture === "string" ? textures?.(op.texture) : undefined;
        if (!target) throw new Error(`Worker texture ${String(op.texture)} is not a live image texture of the mounted scene.`);
        if (op.width !== target.width || op.height !== target.height || !(op.data instanceof Uint8ClampedArray || op.data instanceof Uint8Array)) {
          throw new Error(`Worker texture ${op.texture} update must keep its ${target.width}x${target.height} RGBA8 size.`);
        }
        target.write(op.data);
        applied += 1;
        continue;
      }
      if (!registry) throw new AuraWorkerError("This worker renderer does not expose runtime nodes; node patches are unavailable.", "patch-unsupported", "recoverable");
      if ("structural" in op) {
        const mutableRegistry = registry as AuraRuntimeNodeRegistry & {
          add?: (node: AuraSceneNode, options?: { readonly parent?: string }) => unknown;
          remove?: (id: string) => boolean;
          clear?: () => void;
        };
        if (op.structural === "add") {
          if (typeof mutableRegistry.add !== "function") throw new AuraWorkerError("This worker renderer does not support runtime node additions.", "patch-unsupported", "recoverable");
          mutableRegistry.add(op.node, op.options);
        } else if (op.structural === "remove") {
          if (typeof mutableRegistry.remove !== "function") throw new AuraWorkerError("This worker renderer does not support runtime node removals.", "patch-unsupported", "recoverable");
          mutableRegistry.remove(op.id);
        } else if (op.structural === "clear") {
          if (typeof mutableRegistry.clear === "function") {
            mutableRegistry.clear();
          } else if (typeof mutableRegistry.remove === "function") {
            for (const id of [...registry.ids()]) mutableRegistry.remove(id);
          } else {
            throw new AuraWorkerError("This worker renderer does not support runtime node removals.", "patch-unsupported", "recoverable");
          }
        } else {
          throw new Error("Unknown structural worker patch op.");
        }
        applied += 1;
        continue;
      }
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
