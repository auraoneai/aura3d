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
import type { AuraApp, AuraRuntimeNodeHandle, AuraRuntimeNodeRegistry, AuraSceneNode, AuraSceneSnapshot } from "../nodes/types.js";
import type { AuraNodeBuilder } from "../nodes/builder.js";
import { createAuraRuntimeNodeRegistry } from "./runtimeNodes.js";
import { createViewProjection } from "../sceneMath.js";
import { raycast, type SceneQueryHit } from "../SceneQueries.js";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { AuraWorkerError, collectWorkerTextureIds, isWorkerReadableImageTexture, readWorkerImageTexturePixels, snapshotWorkerPatchArgs } from "./workerRuntime.js";
import { auraTextureRefTexture } from "../nodes/texture.js";
import type { AuraTextureRef } from "../nodes/types.js";
import type { Texture } from "@aura3d/rendering";
import { batchedStateFor, type BatchedMeshState } from "../nodes/batchedState.js";
import { WORKER_HOST_READS as READS, WORKER_PATCH_METHOD_SET as METHODS, WORKER_PATCH_PROPERTY_SET as PROPERTIES, coalesceKey, isReplayableExtensionMethod, markWorkerOwnedBuffer, type AuraWorkerNodePatchOp, type AuraWorkerPatchProperty } from "./workerPatch.js";

export type { AuraWorkerNodePatchOp, AuraWorkerPatchMethod, AuraWorkerPatchProperty } from "./workerPatch.js";
export { applyWorkerNodePatch, collectWorkerPatchTransferables, WORKER_PATCH_METHODS, WORKER_PATCH_PROPERTIES } from "./workerPatch.js";

function cloneArgs<T>(value: T, what: string): T {
  try { return structuredClone(value); }
  catch {
    throw new AuraWorkerError(`${what} cannot be sent to the render worker (its arguments are not structured-cloneable, for example a texture handle or a function).`, "worker-unsupported");
  }
}

const FAST_CLONE_FALLBACK = Symbol("aura-worker-fast-clone-fallback");

type TypedArrayWithSlice = ArrayBufferView & { slice(): ArrayBufferView };

function isSliceableTypedArray(value: unknown): value is TypedArrayWithSlice {
  return ArrayBuffer.isView(value) && !(value instanceof DataView) && typeof (value as { slice?: unknown }).slice === "function";
}

/**
 * Fast-path clone for hot per-frame patch arguments (numbers, vec3 tuples,
 * plain material/light patch objects, TypedArrays) without running both
 * `snapshotWorkerPatchArgs` and `structuredClone`. Falls back whenever a
 * texture ref, function, non-plain object, or deep/cyclic graph appears.
 */
function tryFastCloneSendable(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  const kind = typeof value;
  if (kind === "number" || kind === "boolean" || kind === "string" || kind === "bigint") return value;
  if (kind !== "object") return FAST_CLONE_FALLBACK;
  if (depth > 4) return FAST_CLONE_FALLBACK;
  if (isSliceableTypedArray(value)) {
    const copy = value.slice();
    markWorkerOwnedBuffer(copy.buffer);
    return copy;
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return FAST_CLONE_FALLBACK;
    const out = new Array<unknown>(value.length);
    for (let i = 0; i < value.length; i += 1) {
      const cloned = tryFastCloneSendable(value[i], depth + 1);
      if (cloned === FAST_CLONE_FALLBACK) return FAST_CLONE_FALLBACK;
      out[i] = cloned;
    }
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return FAST_CLONE_FALLBACK;
  const record = value as Record<string, unknown>;
  if (record.kind === "aura-texture-ref") return FAST_CLONE_FALLBACK;
  const keys = Object.keys(record);
  const out: Record<string, unknown> = proto === null ? Object.create(null) as Record<string, unknown> : {};
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i]!;
    const cloned = tryFastCloneSendable(record[k], depth + 1);
    if (cloned === FAST_CLONE_FALLBACK) return FAST_CLONE_FALLBACK;
    out[k] = cloned;
  }
  return out;
}

function insertMirrorSceneNode(nodes: readonly AuraSceneNode[], added: AuraSceneNode, parentId?: string): AuraSceneNode[] {
  if (!parentId) return [...nodes, added];
  let inserted = false;
  const visit = (list: readonly AuraSceneNode[]): AuraSceneNode[] => list.map((entry) => {
    if (entry.kind === "group") {
      if (entry.runtime?.id === parentId) {
        inserted = true;
        return { ...entry, children: [...entry.children, added] };
      }
      return { ...entry, children: visit(entry.children) };
    }
    return entry;
  });
  const updated = visit(nodes);
  return inserted ? updated : [...nodes, added];
}

function removeMirrorSceneNode(nodes: readonly AuraSceneNode[], targetId: string): AuraSceneNode[] {
  const out: AuraSceneNode[] = [];
  for (const entry of nodes) {
    if ((entry as { readonly runtime?: { readonly id?: string } }).runtime?.id === targetId) continue;
    if (entry.kind === "group") {
      out.push({ ...entry, children: removeMirrorSceneNode(entry.children, targetId) });
    } else {
      out.push(entry);
    }
  }
  return out;
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

/** Host batched states named by the scene's `batched` nodes, with the version the worker copy was taken at. */
function collectBatchedStates(nodes: AuraSceneSnapshot["nodes"]): { state: BatchedMeshState; version: number }[] {
  const found = new Map<BatchedMeshState, { state: BatchedMeshState; version: number }>();
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.kind === "group" && Array.isArray(node.children)) stack.push(...node.children);
    if (node.kind !== "batched") continue;
    const state = batchedStateFor((node as { readonly batchedId?: string }).batchedId ?? (node as { readonly runtime?: { readonly id?: string } }).runtime?.id);
    if (state && !found.has(state)) found.set(state, { state, version: state.version });
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
  const registry = createAuraRuntimeNodeRegistry(scene, { ...(flags ? { flags } : {}), app, getScene: () => scene }) as AuraRuntimeNodeRegistry & { dispose?: () => void };
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
  // 5.4: batched / instanced mesh states the scene draws. Their writes (setMatrixAt, addInstance, setCount on the
  // `batched.mesh` / `instances.mesh` handle) bypass the node proxies; a changed version sends the state's copy.
  const batchedStates = collectBatchedStates(scene.nodes);
  const dirtyBatched = (): { state: BatchedMeshState; version: number }[] => active
    ? batchedStates.filter((entry) => !entry.state.disposed && entry.state.version !== entry.version)
    : [];
  // 5.4: textures the worker holds (by host id). Patch arguments name these by id and snapshot any other one.
  const knownTextures = collectWorkerTextureIds(scene.nodes);
  const sendable = <T>(value: T, what: string): T => {
    const fast = tryFastCloneSendable(value);
    if (fast !== FAST_CLONE_FALLBACK) return fast as T;
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
  const dropKey = (k: string): void => {
    const prev = index.get(k);
    if (prev !== undefined && ops[prev]) {
      ops[prev] = undefined;
      live -= 1;
    }
    index.delete(k);
  };
  const record = (nextOp: AuraWorkerNodePatchOp): void => {
    if (!active) return;
    let op = nextOp;
    if ("call" in op && op.call === "setMaterial") {
      // A full material replacement supersedes earlier material sub-property setters in the same batch.
      dropKey(`${op.id}\u0000color`);
      dropKey(`${op.id}\u0000opacity`);
      dropKey(`${op.id}\u0000emissive`);
    }
    const key = coalesceKey(op);
    if (key !== undefined) {
      const previous = index.get(key);
      if (previous !== undefined && ops[previous]) {
        const prevOp = ops[previous]!;
        let canDropPrevious = true;
        if ("call" in op && "call" in prevOp) {
          if (op.call === "setLight" && prevOp.call === "setLight") {
            const prevPatch = prevOp.args[0];
            const nextPatch = op.args[0];
            if (prevPatch && typeof prevPatch === "object" && nextPatch && typeof nextPatch === "object") {
              const merged: Record<string, unknown> = {
                ...(prevPatch as Record<string, unknown>),
                ...(nextPatch as Record<string, unknown>)
              };
              if ((nextPatch as Record<string, unknown>).intensity !== undefined) delete merged.power;
              else if ((nextPatch as Record<string, unknown>).power !== undefined) delete merged.intensity;
              op = {
                id: op.id,
                call: op.call,
                args: op.args.length > 1 ? [merged, ...op.args.slice(1)] : [merged]
              };
            }
          } else if (op.call === "updateAttribute" && prevOp.call === "updateAttribute") {
            const prevLen = (prevOp.args[1] as { readonly array?: { readonly length?: number } } | undefined)?.array?.length ?? 0;
            const nextLen = (op.args[1] as { readonly array?: { readonly length?: number } } | undefined)?.array?.length ?? 0;
            if (nextLen < prevLen) canDropPrevious = false;
          }
        }
        if (canDropPrevious) {
          ops[previous] = undefined;
          live -= 1;
        }
      }
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
    const memberCache = new Map<string, unknown>();
    let proxy!: AuraRuntimeNodeHandle;
    proxy = new Proxy(handle, {
      get(target, key) {
        if (typeof key !== "string") return Reflect.get(target, key, target);
        if (key === "then") return Reflect.get(target, key, target);
        const cached = memberCache.get(key);
        if (cached !== undefined) return cached;
        if (METHODS.has(key) || (isReplayableExtensionMethod(key) && typeof Reflect.get(target, key, target) === "function")) {
          const method = Reflect.get(target, key, target) as ((...args: unknown[]) => unknown) | undefined;
          if (typeof method !== "function") return method;
          const wrapped = (...args: unknown[]) => {
            // morphInfluence(name) is a read.
            if (key === "morphInfluence" && args.length < 2) return method.apply(target, args);
            const sent = sendable(args, `node.${key}()`);
            const result = method.apply(target, args);
            // The host mirror never renders, so nothing drains the attribute
            // writes it queues for the next frame; keep only the worker's copy.
            if (key === "updateAttribute" || key === "setGeometry") (target as unknown as { __parityL2AttributeUpdates?: unknown[] }).__parityL2AttributeUpdates = [];
            record({ id, call: key, args: sent });
            return result === target ? proxy : result;
          };
          memberCache.set(key, wrapped);
          return wrapped;
        }
        if (key === "traverse") {
          const wrappedTraverse = (callback: (node: AuraRuntimeNodeHandle) => boolean | void) =>
            target.traverse((node) => callback(proxyOf(node) ?? node));
          memberCache.set(key, wrappedTraverse);
          return wrappedTraverse;
        }
        if (READS.has(key)) {
          const value = Reflect.get(target, key, target);
          if (typeof value === "function") {
            const bound = (value as (...args: unknown[]) => unknown).bind(target);
            memberCache.set(key, bound);
            return bound;
          }
          return value;
        }
        const value = Reflect.get(target, key, target);
        if (typeof value !== "function") return value;
        const unsupportedFn = () => {
          throw new AuraWorkerError(`node.${key}() is unavailable for a worker-backed app; its effect cannot be replayed in the render worker.`, "worker-unsupported");
        };
        memberCache.set(key, unsupportedFn);
        return unsupportedFn;
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
  const nodes: AuraRuntimeNodeRegistry & { clear(): void } = {
    get: (id: string) => proxyOf(registry.get(id)),
    require: (id: string) => proxyOf(registry.require(id))!,
    has: (id: string) => registry.has(id),
    ids: () => registry.ids(),
    all: () => registry.all().map((handle) => proxyOf(handle)!),
    add(nodeOrBuilder: AuraSceneNode | AuraNodeBuilder<AuraSceneNode>, options?: { readonly parent?: string }) {
      const raw = typeof (nodeOrBuilder as { toJSON?: unknown })?.toJSON === "function"
        ? (nodeOrBuilder as AuraNodeBuilder<AuraSceneNode>).toJSON()
        : nodeOrBuilder as AuraSceneNode;
      if ("physics" in raw && raw.physics) {
        throw new AuraWorkerError("Scene physics is unavailable for a worker-backed app. Run physics on the main thread.", "worker-unsupported");
      }
      const added = registry.add!(raw, options);
      const rawRuntime = (raw as { readonly runtime?: Record<string, unknown> }).runtime;
      const nodeWithId: AuraSceneNode = rawRuntime?.id === added.id
        ? raw
        : ({ ...raw, runtime: { ...(rawRuntime ?? {}), id: added.id } } as AuraSceneNode);
      const sentNode = sendable(nodeWithId, "nodes.add()");
      const sentOptions = options ? sendable(options, "nodes.add()") : undefined;
      (scene as unknown as { nodes: AuraSceneNode[] }).nodes = insertMirrorSceneNode(scene.nodes, nodeWithId, options?.parent);
      for (const entry of collectBatchedStates([nodeWithId])) {
        if (!batchedStates.some((known) => known.state === entry.state)) batchedStates.push(entry);
      }
      record({ structural: "add", node: sentNode, ...(sentOptions ? { options: sentOptions } : {}) });
      return proxyOf(added)!;
    },
    remove(idOrHandle: string | AuraRuntimeNodeHandle) {
      const id = typeof idOrHandle === "string" ? idOrHandle : idOrHandle.id;
      const removed = registry.remove!(id);
      if (removed) {
        (scene as unknown as { nodes: AuraSceneNode[] }).nodes = removeMirrorSceneNode(scene.nodes, id);
        record({ structural: "remove", id });
      }
      return removed;
    },
    clear() {
      for (const id of [...registry.ids()]) registry.remove!(id);
      (scene as unknown as { nodes: AuraSceneNode[] }).nodes = [];
      record({ structural: "clear" });
    },
    get version() { return registry.version; }
  } as unknown as AuraRuntimeNodeRegistry & { clear(): void };
  return {
    nodes,
    registry,
    scene,
    get pending() { return live + dirtyTextures().length + dirtyBatched().length; },
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
        if (data) {
          markWorkerOwnedBuffer(data.buffer);
          out.push({ texture: entry.id, width: texture.width, height: texture.height, data });
        }
      }
      for (const entry of dirtyBatched()) {
        entry.version = entry.state.version;
        const state = entry.state.toWorkerSnapshot();
        if (state) {
          markWorkerOwnedBuffer(state.matrices.buffer);
          markWorkerOwnedBuffer(state.colors.buffer);
          markWorkerOwnedBuffer(state.geometryIds.buffer);
          markWorkerOwnedBuffer(state.alive.buffer);
          markWorkerOwnedBuffer(state.visible.buffer);
          out.push({ batched: state.id, state });
        }
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

