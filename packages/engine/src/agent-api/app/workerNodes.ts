/**
 * Worker-owned rendering, K1 and K3: node patches and host-side picking.
 *
 * The host keeps a CPU mirror of the scene (an ordinary runtime node registry
 * over its own snapshot copy). `app.nodes` on a worker app hands out proxies
 * over that mirror. Every mutating call is applied to the mirror first (so the
 * same validation errors are thrown synchronously, and reads such as
 * `position`, `bounds()` or `getWorldPosition()` stay correct on the host),
 * then recorded as a patch op. Ops are batched and sent to the worker in one
 * `patch` message; the worker replays them on its own registry, which the
 * production renderer reads every frame.
 *
 * Picking runs on the host against the mirror with the shared scene-query
 * raycast, using the same view-projection the renderer derives from the scene
 * camera, so no worker round trip is needed.
 */
import type { AuraRuntimeNodeHandle, AuraRuntimeNodeRegistry, AuraSceneSnapshot } from "../nodes/types.js";
import { createAuraRuntimeNodeRegistry } from "./runtimeNodes.js";
import { createViewProjection } from "../sceneMath.js";
import { raycast, type SceneQueryHit } from "../SceneQueries.js";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { AuraWorkerError } from "./workerRuntime.js";
import { WORKER_HOST_READS as READS, WORKER_PATCH_METHOD_SET as METHODS, WORKER_PATCH_PROPERTY_SET as PROPERTIES, coalesceKey, isReplayableExtensionMethod, type AuraWorkerNodePatchOp, type AuraWorkerPatchProperty } from "./workerPatch.js";

export type { AuraWorkerNodePatchOp, AuraWorkerPatchMethod, AuraWorkerPatchProperty } from "./workerPatch.js";
export { applyWorkerNodePatch, WORKER_PATCH_METHODS, WORKER_PATCH_PROPERTIES } from "./workerPatch.js";

function cloneArgs<T>(value: T, what: string): T {
  try { return structuredClone(value); }
  catch {
    throw new AuraWorkerError(`${what} cannot be sent to the render worker (its arguments are not structured-cloneable, for example a texture handle or a function).`, "worker-unsupported");
  }
}

export interface AuraWorkerNodeMirror {
  readonly nodes: AuraRuntimeNodeRegistry;
  /** The registry the proxies write through (host-side reads, picking). */
  readonly registry: AuraRuntimeNodeRegistry;
  readonly scene: AuraSceneSnapshot;
  /** Number of queued ops. */
  readonly pending: number;
  /** Record a full camera spec replacement. */
  setCamera(camera: AuraSceneSnapshot["camera"]): void;
  /** Take the queued ops (in order) and clear the queue. */
  drain(): AuraWorkerNodePatchOp[];
  /** Nearest host-side hit for a point in canvas CSS pixels. */
  pick(x: number, y: number, size: { readonly width: number; readonly height: number }, options?: AuraWorkerPickOptions): SceneQueryHit | undefined;
  viewProjection(aspect: number, time?: number): Float32Array;
  dispose(): void;
}

export interface AuraWorkerPickOptions {
  /** Restrict picking to these node ids (default every node with a runtime id). */
  readonly ids?: readonly string[];
  /** `bounds` (default) or `mesh` (exact triangles for primitives). */
  readonly mode?: "bounds" | "mesh";
  /** Include hidden nodes (default false). */
  readonly includeHidden?: boolean;
  readonly time?: number;
}

/**
 * Build the host mirror for one mounted scene. A new mirror is created for
 * every scene replacement; proxies of an older mirror keep updating that old
 * mirror but no longer record ops (the worker owns a different scene).
 */
export function createWorkerNodeMirror(scene: AuraSceneSnapshot, flags?: QrFlags): AuraWorkerNodeMirror {
  const registry = createAuraRuntimeNodeRegistry(scene, flags ? { flags } : {}) as AuraRuntimeNodeRegistry & { dispose?: () => void };
  let ops: (AuraWorkerNodePatchOp | undefined)[] = [];
  let live = 0;
  let index = new Map<string, number>();
  let active = true;
  const proxies = new WeakMap<AuraRuntimeNodeHandle, AuraRuntimeNodeHandle>();
  const record = (op: AuraWorkerNodePatchOp): void => {
    if (!active) return;
    const key = coalesceKey(op);
    if (key !== undefined) {
      const previous = index.get(key);
      if (previous !== undefined && ops[previous]) { ops[previous] = undefined; live -= 1; }
      index.set(key, ops.length);
    }
    ops.push(op);
    live += 1;
  };
  const proxyOf = (handle: AuraRuntimeNodeHandle | undefined): AuraRuntimeNodeHandle | undefined => {
    if (!handle) return undefined;
    const existing = proxies.get(handle);
    if (existing) return existing;
    const id = handle.id;
    const proxy: AuraRuntimeNodeHandle = new Proxy(handle, {
      get(target, key, receiver) {
        if (typeof key !== "string") return Reflect.get(target, key, target);
        if (METHODS.has(key) || (isReplayableExtensionMethod(key) && typeof Reflect.get(target, key, target) === "function")) {
          const method = Reflect.get(target, key, target) as ((...args: unknown[]) => unknown) | undefined;
          if (typeof method !== "function") return method;
          return (...args: unknown[]) => {
            // morphInfluence(name) is a read.
            if (key === "morphInfluence" && args.length < 2) return method.apply(target, args);
            const sent = cloneArgs(args, `node.${key}()`);
            const result = method.apply(target, args);
            record({ id, call: key, args: sent });
            return result === target ? receiver : result;
          };
        }
        if (key === "traverse") {
          return (callback: (node: AuraRuntimeNodeHandle) => boolean | void) =>
            target.traverse((node) => callback(proxyOf(node) ?? node));
        }
        if (READS.has(key)) return Reflect.get(target, key, target);
        const value = Reflect.get(target, key, target);
        if (typeof value !== "function") return value;
        return () => {
          throw new AuraWorkerError(`node.${key}() is unavailable for a worker-backed app; its effect cannot be replayed in the render worker.`, "worker-unsupported");
        };
      },
      set(target, key, value) {
        if (typeof key === "string" && PROPERTIES.has(key)) {
          const sent = cloneArgs(value, `node.${key}`);
          Reflect.set(target, key, value, target);
          record({ id, set: key as AuraWorkerPatchProperty, value: sent });
          return true;
        }
        throw new AuraWorkerError(`node.${String(key)} cannot be assigned on a worker-backed app.`, "worker-unsupported");
      }
    });
    proxies.set(handle, proxy);
    return proxy;
  };
  const nodes: AuraRuntimeNodeRegistry = {
    get: (id) => proxyOf(registry.get(id)),
    require: (id) => proxyOf(registry.require(id))!,
    has: (id) => registry.has(id),
    ids: () => registry.ids(),
    all: () => registry.all().map((handle) => proxyOf(handle)!),
    get version() { return registry.version; }
  };
  return {
    nodes,
    registry,
    scene,
    get pending() { return live; },
    setCamera(camera) {
      const sent = cloneArgs(camera, "camera");
      (scene as { camera: AuraSceneSnapshot["camera"] }).camera = camera;
      record({ camera: sent });
    },
    drain() {
      const out = ops.filter((op): op is AuraWorkerNodePatchOp => op !== undefined);
      ops = [];
      index = new Map();
      live = 0;
      return out;
    },
    viewProjection(aspect, time = 0) {
      return createViewProjection(scene, aspect, time, registry);
    },
    pick(x, y, size, options = {}) {
      if (!(size.width > 0) || !(size.height > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
      const vp = createViewProjection(scene, size.width / size.height, options.time ?? 0, registry);
      const ids = options.ids ?? registry.ids();
      const handles = ids.map((id) => registry.get(id)).filter((handle): handle is AuraRuntimeNodeHandle =>
        handle !== undefined && (options.includeHidden === true || handle.visible));
      const ndc: [number, number] = [(x / size.width) * 2 - 1, 1 - (y / size.height) * 2];
      // createViewProjection always uses standard depth, so the ray unprojects from NDC z -1 to 1.
      return raycast({ camera: { viewProjectionMatrix: vp }, ndc }, { handles, mode: options.mode ?? "bounds", firstHitOnly: true })[0];
    },
    dispose() {
      active = false;
      ops = [];
      index = new Map();
      live = 0;
      try { registry.dispose?.(); } catch { /* host mirror cleanup is best effort */ }
    }
  };
}

