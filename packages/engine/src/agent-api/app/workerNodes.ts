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
import type { AuraApp, AuraRuntimeNodeHandle, AuraRuntimeNodeRegistry, AuraSceneSnapshot } from "../nodes/types.js";
import { createAuraRuntimeNodeRegistry } from "./runtimeNodes.js";
import { createViewProjection } from "../sceneMath.js";
import { raycast, type SceneQueryHit } from "../SceneQueries.js";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { AuraWorkerError, collectWorkerTextureIds, isWorkerReadableImageTexture, readWorkerImageTexturePixels, snapshotWorkerPatchArgs } from "./workerRuntime.js";
import { auraTextureRefTexture } from "../nodes/texture.js";
import type { AuraTextureRef } from "../nodes/types.js";
import type { Texture } from "@aura3d/rendering";
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

interface LiveImageTexture { readonly id: string; readonly texture: Texture; revision: number }

/** Live image textures (`texture.canvas`, images, bitmaps) the scene references; their repaints become `texture` ops. */
function collectLiveImageTextures(root: unknown): LiveImageTexture[] {
  const found = new Map<Texture, LiveImageTexture>();
  const seen = new Set<object>();
  const stack: unknown[] = [root];
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== "object" || seen.has(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) continue;
    seen.add(value);
    if ((value as { kind?: unknown }).kind === "aura-texture-ref") {
      const texture = auraTextureRefTexture(value as AuraTextureRef);
      if (texture?.source && !found.has(texture) && isWorkerReadableImageTexture(texture)) {
        found.set(texture, { id: (value as AuraTextureRef).id, texture, revision: texture.revision });
      }
      continue;
    }
    if (value instanceof Map) { for (const [key, item] of value) stack.push(key, item); continue; }
    if (value instanceof Set) { for (const item of value) stack.push(item); continue; }
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) continue;
    for (const key of Object.keys(value)) stack.push((value as Record<string, unknown>)[key]);
  }
  return [...found.values()];
}

/**
 * Build the host mirror for one mounted scene. A new mirror is created for
 * every scene replacement; proxies of an older mirror keep updating that old
 * mirror but no longer record ops (the worker owns a different scene).
 */
export function createWorkerNodeMirror(scene: AuraSceneSnapshot, flags?: QrFlags): AuraWorkerNodeMirror {
  // Node-handle extensions read the app's scene (prd09 setInstanceTransforms finds its instanced node there); the
  // mirror's scene stands in for the app, as the worker's scene does on the worker side.
  const app = { scene } as unknown as AuraApp;
  const registry = createAuraRuntimeNodeRegistry(scene, { ...(flags ? { flags } : {}), app }) as AuraRuntimeNodeRegistry & { dispose?: () => void };
  let ops: (AuraWorkerNodePatchOp | undefined)[] = [];
  let live = 0;
  let index = new Map<string, number>();
  let active = true;
  const proxies = new WeakMap<AuraRuntimeNodeHandle, AuraRuntimeNodeHandle>();
  // The host never uploads these textures; acknowledging the dirty flag lets
  // every later `needsUpdate = true` record a new revision to forward.
  const liveTextures = collectLiveImageTextures(scene.nodes);
  for (const entry of liveTextures) {
    if (entry.texture.needsUpdate) entry.texture.needsUpdate = false;
    entry.revision = entry.texture.revision;
  }
  // 5.4: textures the worker holds (by host id). Patch arguments name these by id and snapshot any other one.
  const knownTextures = collectWorkerTextureIds(scene.nodes);
  const sendable = <T>(value: T, what: string): T => {
    const before = knownTextures.size;
    const sent = cloneArgs(snapshotWorkerPatchArgs(value, knownTextures), what);
    if (knownTextures.size !== before) {
      // Repaints of a newly sent live canvas reach the worker like those of the scene's own canvases.
      for (const entry of collectLiveImageTextures(value)) {
        if (liveTextures.some((known) => known.texture === entry.texture)) continue;
        if (entry.texture.needsUpdate) entry.texture.needsUpdate = false;
        entry.revision = entry.texture.revision;
        liveTextures.push(entry);
      }
    }
    return sent;
  };
  const dirtyTextures = (): LiveImageTexture[] => active
    ? liveTextures.filter((entry) => !entry.texture.disposed && entry.texture.revision !== entry.revision)
    : [];
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
            const sent = sendable(args, `node.${key}()`);
            const result = method.apply(target, args);
            // The host mirror never renders, so nothing drains the attribute
            // writes it queues for the next frame; keep only the worker's copy.
            if (key === "updateAttribute" || key === "setGeometry") (target as unknown as { __parityL2AttributeUpdates?: unknown[] }).__parityL2AttributeUpdates = [];
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
          const sent = sendable(value, `node.${key}`);
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
    get pending() { return live + dirtyTextures().length; },
    setCamera(camera) {
      const sent = cloneArgs(camera, "camera");
      (scene as { camera: AuraSceneSnapshot["camera"] }).camera = camera;
      record({ camera: sent });
    },
    drain() {
      const out: AuraWorkerNodePatchOp[] = [];
      for (const entry of dirtyTextures()) {
        const { texture } = entry;
        if (texture.needsUpdate) texture.needsUpdate = false;
        entry.revision = texture.revision;
        const data = readWorkerImageTexturePixels(texture);
        if (data) out.push({ texture: entry.id, width: texture.width, height: texture.height, data });
      }
      out.push(...ops.filter((op): op is AuraWorkerNodePatchOp => op !== undefined));
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

