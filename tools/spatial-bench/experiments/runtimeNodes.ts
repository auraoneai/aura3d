// E6-02 EXPERIMENT COPY of packages/engine/src/agent-api/app/runtimeNodes.ts (probe only, never shipped).
// Patches are gated by the bitmask window.__SB_FIX__ (set from ?fix=N): 1 typed finite check, 2 skip eager query-geometry
// maintenance in updateAttribute, 4 allocation-free bounds loop without normalizeGeometryAttributes, 8 memoised bounds.
const __FIX = (): number => ((globalThis as unknown as { __SB_FIX__?: number }).__SB_FIX__ ?? 0);
const __boundsCache = new WeakMap<object, { key: string; result: unknown }>();
// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAnimationSpec, AuraApp, AuraCustomMaterialSpec, AuraLayerMask, AuraMaterialSpec, AuraRuntimeNodeHandle, AuraRuntimeNodeImportedAssetEvidence, AuraRuntimeNodeRegistry, AuraRuntimeNodeSpec, AuraSceneNode, AuraSceneSnapshot, AuraTransformSpec, AuraUniformValue, AuraVec3 } from "../nodes/types.js";
import { composeTRSInto, composeWorldMatrixWithLookAt, decomposeMatrix, eulerToQuaternion, identityMat4Into, localMatrixOf, multiplyMat4Into } from "../sceneGraph.js";
import type { AuraQuat } from "../../contracts/sceneGraph.js";
import type { AuraNodeBuilder } from "../nodes/builder.js";
import { assertDepthPreviewTarget, assertDepthPreviewTargetTree } from "../nodes/depthPreviewTarget.js";
import { animation } from "../nodes/animation.js";
import { effects } from "../nodes/effects.composite.js";
import { cloneRuntimeAnimationPose, cloneRuntimeImportedAssetEvidence, runtimeMorphWeightSanitizer } from "../runtimeEvidence.js";
import { AuraRuntimeError } from "./errors.js";
import { calculateRuntimeNodeBounds, calculateRuntimeNodeModelBounds, type AuraRuntimeNodeAnimationBindingMetadata, type AuraRuntimeNodeAnimationPoseBindingMetadata, type AuraRuntimeNodeEffectAttachment, type RuntimeNodeVec3 } from "../RuntimeNodeHandle.js";
import type { AnimationPose } from "@aura3d/animation";
import { material } from "../nodes/material.js";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { resolveQrFlags } from "../../contracts/flags.js";
import type { CompiledScene } from "../../contracts/compiler.js";
import { asRuntimeCompiled } from "../../contracts/compiler.js";
import { nodeHandleExtensionsAll } from "../../contracts/runtimeNodes.js";
import type { AuraNodeKindMap } from "../../contracts/compiler.js";
import { assertCustomUniformWrite, recordCustomUniformWrite } from "../compiler/customMaterial.js";
import { isDirectRenderPath, nodeDirectPathBlockers } from "./renderPath.js";
import { lodMarkerOf, type AuraLodRootSpec } from "../lodMarkers.js";
import { computeAuraGeometryNormals, normalizeGeometryAttributes, type AuraCustomGeometrySpec } from "../RootGeometry.js";
import { createProductionPrimitiveGeometry } from "../compiler/primitives.js";
import { assertSdfTextMaterialSupported, reshapeWorldTextDescriptor } from "../nodes/text3d.js";
import { assertValidPivot, assertValidPivotTree, hasNonzeroPivot } from "../pivotGuard.js";
import { assertWeatherTransformFields, rigidWeatherMatrix } from "../../production-runtime/effects/WeatherTransform.js";
import type { RenderItem } from "@aura3d/rendering";

/**
 * C-37 (PRD 15 T3.12): how the registry mutates the live scene.
 * `getScene`/`setScene` implement the legacy path — append to the snapshot and
 * remount via the app's existing setScene (the RUNTIME_ADD_REMOUNT diagnostic
 * makes the remount visible). `attachCompiled` binds the mounted C-36 compiled
 * scene; when it is present and A3D_QR_COMPILER is on, add/remove compile and
 * dispose just the affected subtree instead.
 */
export interface AuraRuntimeNodeRegistryDeps {
  readonly flags?: QrFlags;
  readonly app?: AuraApp;
  readonly getScene?: () => AuraSceneSnapshot | undefined;
  readonly setScene?: (scene: AuraSceneSnapshot) => void;
  readonly diagnostic?: (message: string) => void;
  /** Stage app-owned declarative bodies before publishing a compiled subtree. */
  readonly prepareCompiledPhysicsAdd?: (node: AuraSceneNode, parentId: string | undefined, scene: AuraSceneSnapshot | undefined, parentGroups?: readonly AuraSceneNode[]) => {
    commit(isCurrent?: () => boolean): boolean | void;
    rollback(): void;
  };
  /** Capture the existing bodies before subtree cleanup can reenter the registry. */
  readonly prepareCompiledPhysicsRemove?: (runtimeIds: readonly string[]) => () => void;
}

interface AttachedCompiledScene {
  addSubtree(node: AuraSceneNode, parentId?: string, options?: { readonly deferCommit?: boolean }): void | { commit(): void; rollback(): void };
  removeSubtree(runtimeId: string): boolean;
}

/** Material-only revisions let async resource work distinguish a replacement
 * from an unrelated transform update, including the same spec reapplied. */
const materialRevisions = new WeakMap<AuraRuntimeNodeHandle, number>();

export function runtimeMaterialRevision(handle: AuraRuntimeNodeHandle | undefined): number {
  return handle ? materialRevisions.get(handle) ?? 0 : 0;
}

export interface RuntimeMaterialChange {
  readonly handle: AuraRuntimeNodeHandle;
  readonly revision: number;
}

const asAttachable = (scene: CompiledScene): AttachedCompiledScene | undefined => {
  const internals = asRuntimeCompiled(scene);
  return internals ? (internals as unknown as AttachedCompiledScene) : undefined;
};

const isBuilder = (value: AuraSceneNode | AuraNodeBuilder<AuraSceneNode>): value is AuraNodeBuilder<AuraSceneNode> =>
  typeof (value as AuraNodeBuilder<AuraSceneNode>).toJSON === "function" && !("kind" in value);

const runtimeIdsInSubtree = (node: AuraSceneNode, ids = new Set<string>()): Set<string> => {
  const id = "runtime" in node ? node.runtime?.id : undefined;
  if (id !== undefined) ids.add(id);
  if (node.kind === "group") for (const child of node.children) runtimeIdsInSubtree(child, ids);
  return ids;
};

const lastPathWithRuntimeId = (
  nodes: readonly AuraSceneNode[], id: string, groups: readonly (AuraSceneNode & { kind: "group" })[] = []
): { readonly node: AuraSceneNode; readonly groups: readonly (AuraSceneNode & { kind: "group" })[] } | undefined => {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]!;
    if (("runtime" in node ? node.runtime?.id : undefined) === id) return { node, groups };
    if (node.kind === "group") {
      const nested = lastPathWithRuntimeId(node.children, id, [...groups, node]);
      if (nested) return nested;
    }
  }
  return undefined;
};
const lastNodeWithRuntimeId = (nodes: readonly AuraSceneNode[], id: string): AuraSceneNode | undefined => lastPathWithRuntimeId(nodes, id)?.node;

const removeRuntimeNodeById = (nodes: readonly AuraSceneNode[], runtimeId: string, onClone?: (source: AuraSceneNode, clone: AuraSceneNode) => void): { nodes: AuraSceneNode[]; removed: boolean } => {
  let removed = false;
  const next: AuraSceneNode[] = [];
  for (const node of nodes) {
    const runtime = "runtime" in node ? node.runtime : undefined;
    if (runtime?.id === runtimeId) {
      removed = true;
      continue;
    }
    if (node.kind === "group") {
      const inner = removeRuntimeNodeById(node.children, runtimeId, onClone);
      if (inner.removed) {
        removed = true;
        const clone = { ...node, children: inner.nodes };
        onClone?.(node, clone);
        next.push(clone);
        continue;
      }
    }
    next.push(node);
  }
  return { nodes: next, removed };
};

/** Insert `node` as the last child of the group whose runtime id is `parentId`; top level when no such group exists. */
const insertRuntimeNode = (nodes: readonly AuraSceneNode[], node: AuraSceneNode, parentId: string | undefined, onClone?: (source: AuraSceneNode, clone: AuraSceneNode) => void): AuraSceneNode[] => {
  if (parentId !== undefined) {
    let placed = false;
    const visit = (list: readonly AuraSceneNode[]): AuraSceneNode[] => list.map((entry) => {
      if (placed || entry.kind !== "group") return entry;
      if (entry.runtime?.id === parentId) {
        placed = true;
        const clone = { ...entry, children: [...entry.children, node] };
        onClone?.(entry, clone);
        return clone;
      }
      const children = visit(entry.children);
      if (!placed) return entry;
      const clone = { ...entry, children };
      onClone?.(entry, clone);
      return clone;
    });
    const next = visit(nodes);
    if (placed) return next;
  }
  return [...nodes, node];
};

/** Replace the last matching authored slot, without recreating a removed parent. */
const replaceRuntimeNode = (nodes: readonly AuraSceneNode[], node: AuraSceneNode, runtimeId: string, onClone?: (source: AuraSceneNode, clone: AuraSceneNode) => void): { nodes: AuraSceneNode[]; replaced: boolean } => {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const current = nodes[index]!;
    if (("runtime" in current ? current.runtime?.id : undefined) === runtimeId) {
      const next = [...nodes];
      next[index] = node;
      return { nodes: next, replaced: true };
    }
    if (current.kind === "group") {
      const inner = replaceRuntimeNode(current.children, node, runtimeId, onClone);
      if (inner.replaced) {
        const clone = { ...current, children: inner.nodes };
        onClone?.(current, clone);
        const next = [...nodes];
        next[index] = clone;
        return { nodes: next, replaced: true };
      }
    }
  }
  return { nodes: [...nodes], replaced: false };
};

export function createAuraRuntimeNodeRegistry(snapshot: AuraSceneSnapshot, deps: AuraRuntimeNodeRegistryDeps = {}, authoredSnapshot?: AuraSceneSnapshot): MutableAuraRuntimeNodeRegistry {
  for (const node of snapshot.nodes) assertDepthPreviewTargetTree(node);
  let handles = new Map<string, AuraRuntimeNodeHandle>();
  let sceneHandles = new WeakMap<AuraSceneNode, AuraRuntimeNodeHandle>();
  let ownedHandles = new WeakSet<AuraRuntimeNodeHandle>();
  let registryVersion = 0;
  let autoId = 0;
  let compiled: AttachedCompiledScene | undefined;
  let compiledOwner: CompiledScene | undefined;
  let flags = deps.flags ?? resolveQrFlags({});
  let app = deps.app;
  let getScene = deps.getScene;
  let setScene = deps.setScene;
  let diagnostic = deps.diagnostic;
  let prepareCompiledPhysicsAdd = deps.prepareCompiledPhysicsAdd;
  let prepareCompiledPhysicsRemove = deps.prepareCompiledPhysicsRemove;
  let disposed = false;
  let resetVersion = 0;
  let pendingChanges = 0;
  let notifying = false;
  const pendingCompiledIds = new Map<string, number>();
  const holdPendingCompiledIds = (node: AuraSceneNode): (() => void) => {
    const ids = [...runtimeIdsInSubtree(node)];
    for (const id of ids) pendingCompiledIds.set(id, (pendingCompiledIds.get(id) ?? 0) + 1);
    return () => {
      for (const id of ids) {
        const count = pendingCompiledIds.get(id) ?? 0;
        if (count <= 1) pendingCompiledIds.delete(id);
        else pendingCompiledIds.set(id, count - 1);
      }
    };
  };
  const changeListeners = new Set<{ readonly listener: () => void }>();
  let pendingSceneChanges = 0;
  let notifyingScene = false;
  const sceneChangeListeners = new Set<{ readonly listener: () => void }>();
  const materialChangeListeners = new Set<{ readonly listener: (change: RuntimeMaterialChange) => void }>();
  const pendingMaterialChanges: RuntimeMaterialChange[] = [];
  let notifyingMaterial = false;
  const notifyChange = (): void => {
    if (disposed) return;
    pendingChanges += 1;
    if (notifying) return;
    notifying = true;
    try {
      while (pendingChanges > 0 && !disposed) {
        pendingChanges -= 1;
        for (const subscription of [...changeListeners]) {
          if (!changeListeners.has(subscription)) continue;
          try { subscription.listener(); } catch { /* A committed change must reach the other subscribers. */ }
        }
      }
    } finally {
      notifying = false;
    }
  };
  const notifySceneChange = (): void => {
    if (disposed) return;
    pendingSceneChanges += 1;
    if (notifyingScene) return;
    notifyingScene = true;
    try {
      while (pendingSceneChanges > 0 && !disposed) {
        pendingSceneChanges -= 1;
        for (const subscription of [...sceneChangeListeners]) {
          if (!sceneChangeListeners.has(subscription)) continue;
          try { subscription.listener(); } catch { /* A committed change must reach the other subscribers. */ }
        }
      }
    } finally {
      notifyingScene = false;
    }
  };
  const notifyTopologyChange = (): void => { notifyChange(); notifySceneChange(); };
  const isCurrentHandle = (handle: AuraRuntimeNodeHandle): boolean => {
    if (disposed || disposedQueryHandles.has(handle)) return false;
    if (anonymousGraphHandles.has(handle)) return ownedHandles.has(handle);
    const current = handles.get(handle.id);
    return current !== undefined && !disposedQueryHandles.has(current) &&
      (current === handle || parityL7NodeSpecs.get(current) === parityL7NodeSpecs.get(handle));
  };
  const onMaterialChange = (handle: AuraRuntimeNodeHandle): void => {
    if (!isCurrentHandle(handle)) return;
    pendingMaterialChanges.push({ handle, revision: runtimeMaterialRevision(handle) });
    if (!notifyingMaterial) {
      notifyingMaterial = true;
      try {
        while (pendingMaterialChanges.length > 0 && !disposed) {
          const change = pendingMaterialChanges.shift()!;
          if (!isCurrentHandle(change.handle)) continue;
          for (const subscription of [...materialChangeListeners]) {
            if (!materialChangeListeners.has(subscription)) continue;
            try { subscription.listener(change); } catch { /* A committed change must reach other subscribers. */ }
          }
        }
      } finally { notifyingMaterial = false; }
    }
    notifyChange();
  };
  const onSceneNodeChange = (handle: AuraRuntimeNodeHandle): void => { if (isCurrentHandle(handle)) notifySceneChange(); };
  const compilerFlagOn = () => flags.on("A3D_QR_COMPILER");
  const registerSubtree = (node: AuraSceneNode, parentId?: string, parentHandle?: AuraRuntimeNodeHandle): AuraRuntimeNodeHandle => {
    const added = collectRuntimeNodeHandles({ nodes: [node] } as unknown as AuraSceneSnapshot, undefined, sceneHandles, onMaterialChange, onSceneNodeChange, ownedHandles, flags.on("A3D_QR_CORE"));
    const published: Array<readonly [string, AuraRuntimeNodeHandle, AuraRuntimeNodeHandle | undefined]> = [];
    try {
      for (const [id, handle] of added) {
        const previous = handles.get(id);
        const current = applyHandleExtensions(handle);
        handles.set(id, current);
        published.push([id, current, previous]);
      }
    } catch (error) {
      for (const [id, handle, previous] of published.reverse()) {
        if (handles.get(id) !== handle) continue;
        if (previous) handles.set(id, previous);
        else handles.delete(id);
      }
      for (const [id, handle] of added) if (handles.get(id) !== handle) invalidateRuntimeQueryHandle(handle);
      throw error;
    }
    const rootId = "runtime" in node ? node.runtime?.id : undefined;
    const root = rootId ? handles.get(rootId) : undefined;
    if (!root) throw new Error("Aura3D runtime node registration requires an id.");
    const parent = parentHandle ?? (parentId ? handles.get(parentId) : undefined);
    if (parent) linkRuntimeChild(parent, root);
    if (parent && flags.on("A3D_QR_CORE")) enableRuntimeParentedNode(root, false);
    return root;
  };
  /*
   * RP-03: nodes added through the compiled subtree path live only in the compiled scene, not in the app snapshot. They are kept
   * here so a remount (to take the HDR target, see `add`) carries them over instead of dropping them. Cleared on `reset`.
   */
  let compiledAdds: { readonly id: string; readonly node: AuraSceneNode; readonly parent?: string; readonly replaceInPlace?: boolean }[] = [];
  const priorAddedSubtreeIds = (roots: Iterable<string>, entries: readonly { readonly id: string; readonly parent?: string }[]): Set<string> => {
    const children = new Map<string, string[]>();
    for (const entry of entries) {
      if (entry.parent === undefined) continue;
      const list = children.get(entry.parent) ?? [];
      list.push(entry.id);
      children.set(entry.parent, list);
    }
    const ids = new Set(roots);
    const queue = [...ids];
    for (let index = 0; index < queue.length; index += 1) {
      for (const child of children.get(queue[index]!) ?? []) {
        if (!ids.has(child)) { ids.add(child); queue.push(child); }
      }
    }
    return ids;
  };
  /** Mounted (snapshot) node ids removed through the compiled subtree path; a remount must not bring them back. */
  let compiledRemovals = new Set<string>();
  const preserveSceneHandle = (source: AuraSceneNode, clone: AuraSceneNode): void => {
    const handle = sceneHandles.get(source);
    if (handle && !disposedQueryHandles.has(handle)) sceneHandles.set(clone, handle);
  };
  // An independently added ancestor may itself contain the old authored
  // descendant. Remove that slot from its saved source as well as the base
  // snapshot; a pre-add tombstone alone cannot affect a later-added ancestor.
  const removeFromPriorAddedAncestors = (id: string, priorSet: ReadonlySet<(typeof compiledAdds)[number]>): void => {
    compiledAdds = compiledAdds.map((entry) => {
      if (!priorSet.has(entry) || entry.id === id) return entry;
      const result = removeRuntimeNodeById([entry.node], id, preserveSceneHandle);
      return result.removed && result.nodes[0] ? { ...entry, node: result.nodes[0] } : entry;
    });
  };
  const sceneWithCompiledAdds = (scene: AuraSceneSnapshot): AuraSceneSnapshot => {
    let nodes: AuraSceneNode[] = [...scene.nodes];
    for (const id of compiledRemovals) nodes = removeRuntimeNodeById(nodes, id, preserveSceneHandle).nodes;
    for (const entry of compiledAdds) {
      nodes = entry.replaceInPlace
        ? replaceRuntimeNode(nodes, entry.node, entry.id, preserveSceneHandle).nodes
        : insertRuntimeNode(nodes, entry.node, entry.parent, preserveSceneHandle);
    }
    return { ...scene, nodes };
  };
  // C-37 (PRD 15 T3.12 seam): flatten every registered NodeHandleExtension
  // whose flag is on and whose `appliesTo` covers the node kind onto the
  // handle (`handle.animation`, `handle.materials`, ...). Applied lazily on
  // read because handles are collected before `configure` delivers the flags
  // and because `add`/`reset` create handles continuously. Flag-off handles
  // keep the pre-lane shape — the member is simply absent.
  const applyHandleExtensions = (handle: AuraRuntimeNodeHandle): AuraRuntimeNodeHandle => {
    for (const ext of nodeHandleExtensionsAll()) {
      const target = handle as unknown as Record<string, unknown>;
      if (target[ext.member] !== undefined) continue;
      if (!ext.appliesTo.includes(handle.kind as keyof AuraNodeKindMap)) continue;
      if (!flags.on(ext.flag)) continue;
      // `app` is populated by `configure` (createAuraApp passes the live app);
      // members that tolerate an absent app still attach, matching the
      // pre-existing `create(handle, app?)` api signatures.
      target[ext.member] = ext.create(handle, app as AuraApp);
    }
    return handle;
  };
  const registry: MutableAuraRuntimeNodeRegistry = {
    get(id) {
      const handle = handles.get(id);
      return handle === undefined ? undefined : applyHandleExtensions(handle);
    },
    require(id) {
      const handle = handles.get(id);
      if (!handle) {
        throw new AuraRuntimeError(
          "missing-asset",
          `Aura3D runtime node "${id}" was not found. Suggested fix: add .runtime({ id: "${id}" }) to the model, primitive, group, or label you want to mutate.`
        );
      }
      return applyHandleExtensions(handle);
    },
    has(id) {
      return handles.has(id);
    },
    ids() {
      return [...handles.keys()];
    },
    all() {
      return [...handles.values()].map(applyHandleExtensions);
    },
    get version() {
      return registryVersion;
    },
    onChange(listener) {
      if (typeof listener !== "function") throw new TypeError("Runtime node listener must be a function.");
      if (disposed) return () => {};
      const subscription = { listener };
      changeListeners.add(subscription);
      return () => { changeListeners.delete(subscription); };
    },
    onSceneChange(listener) {
      if (typeof listener !== "function") throw new TypeError("Runtime scene listener must be a function.");
      if (disposed) return () => {};
      const subscription = { listener };
      sceneChangeListeners.add(subscription);
      return () => { sceneChangeListeners.delete(subscription); };
    },
    onMaterialChange(listener) {
      if (typeof listener !== "function") throw new TypeError("Runtime material listener must be a function.");
      if (disposed) return () => {};
      const subscription = { listener };
      materialChangeListeners.add(subscription);
      return () => { materialChangeListeners.delete(subscription); };
    },
    add(nodeOrBuilder, options = {}) {
      const previousResetVersion = resetVersion;
      const committed = (handle: AuraRuntimeNodeHandle): AuraRuntimeNodeHandle => {
        // A synchronous setScene already published its reset and new topology.
        if (resetVersion === previousResetVersion) notifyTopologyChange();
        return handle;
      };
      const raw = isBuilder(nodeOrBuilder) ? nodeOrBuilder.toJSON() : nodeOrBuilder;
      assertDepthPreviewTargetTree(raw);
      assertValidPivotTree([raw]);
      const runtime = "runtime" in raw ? raw.runtime : undefined;
      if (runtime?.id) {
        const existing = handles.get(runtime.id);
        if (existing) assertNoGeneratedInstanceLightChildMutation(existing);
      }
      const id = runtime?.id ?? `runtime-add-${++autoId}`;
      const node = (
        runtime?.id ? raw : { ...raw, runtime: { ...(runtime ?? {}), id } }
      ) as AuraSceneNode & { runtime: AuraRuntimeNodeSpec };
      if (options.parent !== undefined && pendingCompiledIds.has(options.parent)) {
        throw new Error("RUNTIME_PARENT_PENDING: add the child after its parent subtree has finished publishing.");
      }
      if (options.parent !== undefined && runtimeIdsInSubtree(node).has(options.parent)) {
        throw new Error("PARENTED_TRANSFORM_CYCLE: a subtree cannot be attached beneath one of its own runtime IDs.");
      }
      registryVersion += 1;
      /*
       * RP-03: a direct-path app has no post chain and no HDR target, so an effect, a custom-shader or transparent material added
       * now would be dropped or drawn wrong, silently. Remount with the node in the scene: the mount re-decides the path and takes
       * the HDR target. Earlier compiled additions ride along.
       */
      const directBlockers = app?.canvas && isDirectRenderPath(app.canvas) ? nodeDirectPathBlockers([node]) : [];
      const scene = getScene?.();
      if (directBlockers.length > 0 && scene && setScene) {
        const next = sceneWithCompiledAdds(scene);
        compiledAdds = [];
        compiledRemovals = new Set();
        setScene({ ...next, nodes: insertRuntimeNode(next.nodes, node, options.parent) });
        // After setScene: the remount resets the app's warning list.
        diagnostic?.(`DIRECT_PATH_REMOUNT: runtime node "${id}" needs the HDR target (${directBlockers.join("; ")}); the scene was remounted so it renders.`);
        const remounted = handles.get(id);
        if (remounted) return committed(applyHandleExtensions(remounted));
        return committed(registerSubtree(node, options.parent));
      }
      if (compiled && compilerFlagOn()) {
        const currentScene = scene ? sceneWithCompiledAdds(scene) : undefined;
        const priorPath = currentScene && lastPathWithRuntimeId(currentScene.nodes, id);
        const inferredAncestors = options.parent === undefined && node.kind === "group" &&
          priorPath?.node.kind === "group" && priorPath.groups.length > 0 ? priorPath.groups : undefined;
        const explicitPath = options.parent !== undefined && currentScene ? lastPathWithRuntimeId(currentScene.nodes, options.parent) : undefined;
        const parentGroups = inferredAncestors ?? (explicitPath?.node.kind === "group" ? [...explicitPath.groups, explicitPath.node] : undefined);
        const liveParentGroups = parentGroups?.map((group) => {
          const handle = sceneHandles.get(group);
          const live = handle && parityL7NodeSpecs.get(handle);
          return live?.kind === "group" && !disposedQueryHandles.has(handle!) ? live : group;
        });
        const effectiveParent = inferredAncestors
          ? [...inferredAncestors].reverse().map((ancestor) => ancestor.runtime?.id).find((value) => value !== undefined)
          : options.parent;
        if (effectiveParent !== undefined && pendingCompiledIds.has(effectiveParent)) {
          throw new Error("RUNTIME_PARENT_PENDING: add the child after its parent subtree has finished publishing.");
        }
        const stagedPriorRoot = inferredAncestors ? handles.get(id) : undefined;
        const inferredParentHandle = inferredAncestors
          ? (stagedPriorRoot && parityL7Parents.get(stagedPriorRoot)) ?? sceneHandles.get(inferredAncestors[inferredAncestors.length - 1]!)
          : undefined;
        const releasePending = holdPendingCompiledIds(node);
        let transaction: ReturnType<NonNullable<AuraRuntimeNodeRegistryDeps["prepareCompiledPhysicsAdd"]>> | undefined;
        try {
          transaction = prepareCompiledPhysicsAdd?.(node, options.parent, currentScene, liveParentGroups);
          if (inferredAncestors && handles.get(id) !== stagedPriorRoot) {
            throw new Error("Runtime subtree replacement was superseded while staging physics.");
          }
        } catch (error) {
          try { transaction?.rollback(); }
          catch (cleanupError) { throw new AggregateError([error, cleanupError], "Could not stage or roll back compiled subtree physics."); }
          finally { releasePending(); }
          throw error;
        }
        let priorEntries: typeof compiledAdds;
        let priorEntry: (typeof compiledAdds)[number] | undefined;
        let replaceInPlace: boolean;
        let priorEntrySet: Set<(typeof compiledAdds)[number]>;
        const predecessors = new Set<AuraRuntimeNodeHandle>();
        const priorSource = priorPath?.node;
        try {
          priorEntries = compiledAdds.slice();
          priorEntry = [...priorEntries].reverse().find((entry) => entry.id === id);
          replaceInPlace = inferredAncestors !== undefined && (!priorEntry || priorEntry.replaceInPlace === true);
          priorEntrySet = new Set(priorEntries);
          const priorRoot = handles.get(id);
          if (priorRoot) for (const handle of runtimeHandleSubtree(priorRoot)) predecessors.add(handle);
          if (priorSource) for (const oldId of runtimeIdsInSubtree(priorSource)) {
            const oldHandle = handles.get(oldId);
            if (oldHandle) predecessors.add(oldHandle);
          }
        } catch (error) {
          try { transaction?.rollback(); }
          catch (cleanupError) { throw new AggregateError([error, cleanupError], "Could not stage or roll back compiled subtree physics."); }
          finally { releasePending(); }
          throw error;
        }
        let compilerTransaction: void | { commit(): void; rollback(): void } = undefined;
        let previousHandles: Map<string, AuraRuntimeNodeHandle> | undefined;
        let publishedHandles: Map<string, AuraRuntimeNodeHandle> | undefined;
        let published = false;
        const restoreHandles = (): void => {
          if (!publishedHandles || !previousHandles || disposed || resetVersion !== previousResetVersion) return;
          for (const [key, handle] of publishedHandles) {
            if (handles.get(key) !== handle) continue;
            const previous = previousHandles.get(key);
            if (previous && !disposedQueryHandles.has(previous)) handles.set(key, previous);
            else handles.delete(key);
            invalidateRuntimeQueryHandle(handle);
          }
        };
        try {
          compilerTransaction = compiled.addSubtree(node, options.parent, { deferCommit: true });
          previousHandles = new Map(handles);
          const handle = registerSubtree(node, effectiveParent, inferredParentHandle);
          publishedHandles = new Map([...runtimeIdsInSubtree(node)].flatMap((key) => {
            const value = handles.get(key);
            return value && previousHandles!.get(key) !== value ? [[key, value] as const] : [];
          }));
          for (const [key] of publishedHandles) {
            const previous = previousHandles.get(key);
            if (previous) predecessors.add(previous);
          }
          const isCurrent = (): boolean => !disposed && resetVersion === previousResetVersion && handles.get(id) === handle;
          if (transaction?.commit(isCurrent) === false) {
            restoreHandles();
            compilerTransaction?.rollback();
            const current = handles.get(id);
            if (!current) throw new Error("Runtime subtree addition was superseded before publication.");
            return committed(applyHandleExtensions(current));
          }
          // A group replacement can leave old children with distinct IDs.
          // Retire only handles captured from the predecessor, never handles
          // installed by a reentrant newer addition.
          for (const previous of predecessors) {
            if (handles.get(previous.id) === previous) handles.delete(previous.id);
            invalidateRuntimeQueryHandle(previous);
          }
          const replacedIds = runtimeIdsInSubtree(node);
          if (priorSource) for (const oldId of runtimeIdsInSubtree(priorSource)) replacedIds.add(oldId);
          const priorReplacedIds = priorAddedSubtreeIds(replacedIds, priorEntries);
          compiledAdds = compiledAdds.filter((entry) => !priorEntrySet.has(entry) || !priorReplacedIds.has(entry.id));
          if (priorSource && (!priorEntry || priorEntry.replaceInPlace) && !replaceInPlace) {
            compiledRemovals.add(id);
            removeFromPriorAddedAncestors(id, priorEntrySet);
          }
          const entry = {
            id, node,
            ...(effectiveParent === undefined ? {} : { parent: effectiveParent }),
            ...(replaceInPlace ? { replaceInPlace: true } : {})
          };
          compiledAdds.push(entry);
          published = true;
          // The candidate is already live; a cleanup failure from commit is
          // reported without pretending the prior body can be resurrected.
          compilerTransaction?.commit();
          if (!isCurrent()) {
            compiledAdds = compiledAdds.filter((candidate) => candidate !== entry);
            const current = handles.get(id);
            if (!current) throw new Error("Runtime subtree addition was superseded after publication.");
            return committed(applyHandleExtensions(current));
          }
          return committed(handle);
        } catch (error) {
          if (published) {
            if (resetVersion === previousResetVersion) notifyTopologyChange();
            throw error;
          }
          const failures: unknown[] = [error];
          restoreHandles();
          try { compilerTransaction?.rollback(); } catch (cleanupError) { failures.push(cleanupError); }
          try { transaction?.rollback(); } catch (cleanupError) { failures.push(cleanupError); }
          if (failures.length > 1) throw new AggregateError(failures, "Could not add or roll back compiled subtree physics.");
          throw failures[0];
        } finally {
          releasePending();
        }
      }
      // Legacy seam (C-37 PR 0b-1): append to the snapshot and remount.
      if (scene && setScene) {
        diagnostic?.(`RUNTIME_ADD_REMOUNT: runtime node "${id}" appended and remounted (enable A3D_QR_COMPILER for subtree compile)`);
        setScene({ ...scene, nodes: insertRuntimeNode(scene.nodes, node, options.parent) });
        const handle = handles.get(id);
        if (handle) return committed(applyHandleExtensions(handle));
      } else {
        diagnostic?.(`RUNTIME_ADD_REMOUNT: runtime node "${id}" registered without a live scene remount`);
        return committed(registerSubtree(node, options.parent));
      }
      return committed(registerSubtree(node, options.parent));
    },
    remove(idOrHandle) {
      const previousResetVersion = resetVersion;
      const id = typeof idOrHandle === "string" ? idOrHandle : idOrHandle.id;
      const currentScene = getScene?.();
      const authored = currentScene && lastNodeWithRuntimeId(sceneWithCompiledAdds(currentScene).nodes, id);
      const existing = handles.get(id);
      if (existing) assertNoGeneratedInstanceLightChildMutation(existing);
      else if (authored?.kind === "model" && hasStaticGeneratedInstanceLights(authored)) {
        throw new Error("INSTANCE_LIGHTS_RUNTIME_UNSUPPORTED: generated instance lights cannot follow model-only removal; rebuild the batch.");
      }
      const authoredIds = authored ? runtimeIdsInSubtree(authored) : new Set<string>([id]);
      if (!handles.has(id)) {
        // A mounted group or look has no handle (the app flattens it away), but the compiled scene keeps its children by its id.
        if (compiled && compilerFlagOn()) {
          const priorEntries = compiledAdds.slice();
          const priorSet = new Set(priorEntries);
          const removedIds = priorAddedSubtreeIds(authoredIds, priorEntries);
          const detached = [...removedIds].flatMap((key) => {
            const handle = handles.get(key);
            return handle ? [handle] : [];
          });
          const removedEntry = [...priorEntries].reverse().find((entry) => entry.id === id);
          const retirePhysics = prepareCompiledPhysicsRemove?.([...removedIds]);
          let removed = false;
          let failed = false;
          let failure: unknown;
          try { removed = compiled.removeSubtree(id); } catch (error) { failed = true; failure = error; }
          if (!removed && !failed) return false;
          registryVersion += 1;
          for (const handle of detached) {
            if (handles.get(handle.id) !== handle) continue;
            handles.delete(handle.id);
            invalidateRuntimeQueryHandle(handle);
          }
          compiledAdds = compiledAdds.filter((entry) => !priorSet.has(entry) || !removedIds.has(entry.id));
          if ((!removedEntry || removedEntry.replaceInPlace) && resetVersion === previousResetVersion) {
            compiledRemovals.add(id);
            removeFromPriorAddedAncestors(id, priorSet);
          }
          try { retirePhysics?.(); } catch (error) {
            if (failed) throw new AggregateError([failure, error], "Could not remove compiled subtree and physics bodies.");
            throw error;
          }
          if (resetVersion === previousResetVersion) notifyTopologyChange();
          if (failed) throw failure;
          return true;
        }
        return false;
      }
      registryVersion += 1;
      const removedHandles = new Set(runtimeHandleSubtree(handles.get(id)!));
      for (const key of authoredIds) {
        const handle = handles.get(key);
        if (handle) removedHandles.add(handle);
      }
      const priorEntries = compiledAdds.slice();
      const removedIds = priorAddedSubtreeIds(new Set([...authoredIds, ...[...removedHandles].map((handle) => handle.id)]), priorEntries);
      const retirePhysics = compiled && compilerFlagOn() ? prepareCompiledPhysicsRemove?.([...removedIds, id]) : undefined;
      invalidateRuntimeQueryHandle(handles.get(id)!);
      for (const handle of removedHandles) {
        if (handles.get(handle.id) === handle) {
          handles.delete(handle.id);
          invalidateRuntimeQueryHandle(handle);
        }
      }
      if (compiled && compilerFlagOn()) {
        const priorSet = new Set(priorEntries);
        const removedEntry = [...priorEntries].reverse().find((entry) => entry.id === id);
        let failed = false;
        let failure: unknown;
        try { compiled.removeSubtree(id); } catch (error) { failed = true; failure = error; }
        // Reentrant disposal can add a new node with the same id. Remove only
        // the pre-existing records, never a record published by that callback.
        compiledAdds = compiledAdds.filter((entry) => !priorSet.has(entry) || !removedIds.has(entry.id));
        if ((!removedEntry || removedEntry.replaceInPlace) && resetVersion === previousResetVersion) {
          compiledRemovals.add(id);
          removeFromPriorAddedAncestors(id, priorSet);
        }
        try { retirePhysics?.(); } catch (error) {
          if (failed) throw new AggregateError([failure, error], "Could not remove compiled subtree and physics bodies.");
          throw error;
        }
        if (resetVersion === previousResetVersion) notifyTopologyChange();
        if (failed) throw failure;
        return true;
      }
      const scene = getScene?.();
      if (scene && setScene) {
        const result = removeRuntimeNodeById(scene.nodes, id);
        diagnostic?.(`RUNTIME_ADD_REMOUNT: runtime node "${id}" removed via remount (enable A3D_QR_COMPILER for subtree dispose)`);
        setScene({ ...scene, nodes: result.nodes });
      }
      if (resetVersion === previousResetVersion) notifyTopologyChange();
      return true;
    },
    configure(nextDeps) {
      flags = nextDeps.flags ?? flags;
      app = nextDeps.app ?? app;
      getScene = nextDeps.getScene ?? getScene;
      setScene = nextDeps.setScene ?? setScene;
      diagnostic = nextDeps.diagnostic ?? diagnostic;
      prepareCompiledPhysicsAdd = nextDeps.prepareCompiledPhysicsAdd ?? prepareCompiledPhysicsAdd;
      prepareCompiledPhysicsRemove = nextDeps.prepareCompiledPhysicsRemove ?? prepareCompiledPhysicsRemove;
    },
    attachCompiled(scene) {
      compiled = asAttachable(scene);
      compiledOwner = compiled ? scene : undefined;
    },
    detachCompiled(scene) {
      if (compiledOwner === scene) {
        compiled = undefined;
        compiledOwner = undefined;
      }
    },
    sceneWithRuntimeAdditions() {
      const scene = getScene?.();
      return scene ? sceneWithCompiledAdds(scene) : undefined;
    },
    atmosphereNodeState(node) {
      const handle = runtimeNodeHandleForSceneNode(registry, node);
      if (!handle) return undefined;
      const worldMatrix = parityL7WorldMatrix(handle, new Float32Array(16));
      return {
        visible: runtimeNodeEffectiveVisibility(handle),
        worldPosition: [worldMatrix[12]!, worldMatrix[13]!, worldMatrix[14]!],
        worldMatrix
      };
    },
    assertWeatherNodeTransform(node) {
      const handle = runtimeNodeHandleForSceneNode(registry, node);
      if (handle) assertWeatherRuntimeChain(handle);
    },
    reset(nextSnapshot, nextAuthoredSnapshot) {
      for (const node of nextSnapshot.nodes) assertDepthPreviewTargetTree(node);
      for (const handle of handles.values()) invalidateRuntimeQueryHandle(handle);
      compiledAdds = [];
      compiledRemovals = new Set();
      sceneHandles = new WeakMap();
      ownedHandles = new WeakSet();
      handles = collectRuntimeNodeHandles(nextSnapshot, nextAuthoredSnapshot, sceneHandles, onMaterialChange, onSceneNodeChange, ownedHandles, flags.on("A3D_QR_CORE"));
      registrySceneHandles.set(registry, sceneHandles);
      registryVersion += 1;
      resetVersion += 1;
      notifyTopologyChange();
    },
    dispose() {
      disposed = true;
      changeListeners.clear();
      sceneChangeListeners.clear();
      materialChangeListeners.clear();
      pendingChanges = 0;
      pendingSceneChanges = 0;
      pendingMaterialChanges.length = 0;
      for (const handle of handles.values()) invalidateRuntimeQueryHandle(handle);
      handles.clear();
      compiledAdds = [];
      compiledRemovals.clear();
      compiled = undefined;
      compiledOwner = undefined;
      registrySceneHandles.delete(registry);
      registryVersion += 1;
    }
  };
  registry.reset(snapshot, authoredSnapshot);
  return registry;
}

export type MutableAuraRuntimeSceneNode = AuraSceneNode & {
  position?: AuraVec3;
  rotation?: AuraVec3;
  pivot?: AuraVec3;
  scale?: number | AuraVec3;
  visible?: boolean;
  material?: AuraMaterialSpec;
  animation?: AuraAnimationSpec;
  instances?: readonly import("../nodes/types.js").AuraTransformSpec[];
  instanceColors?: readonly import("../nodes/types.js").AuraColor[];
  // parity:L7 SG-09/SR-04 spec fields (declared readonly on the transform spec;
  // the handle mutates them through this cast).
  quaternion?: AuraQuat;
  rotationOrder?: import("../../contracts/sceneGraph.js").AuraEulerOrder;
  renderOrder?: number;
  frustumCulled?: boolean;
  layers?: number;
  userData?: Record<string, unknown>;
};

// region parity:L7 — SG-09/SR-04 module state. The registry model is flat
// (one handle per runtime.id); `attach` records the graph edge here so
// `getWorld*`/`traverse` compose through parent chains without a scene rebuild.
const parityL7NodeSpecs = new WeakMap<AuraRuntimeNodeHandle, MutableAuraRuntimeSceneNode>();
const parityL7Parents = new WeakMap<AuraRuntimeNodeHandle, AuraRuntimeNodeHandle>();
const parityL7Children = new Map<AuraRuntimeNodeHandle, Set<AuraRuntimeNodeHandle>>();
type RuntimeParentedNode = { readonly localNode: MutableAuraRuntimeSceneNode; readonly worldFacing: boolean; readonly source?: AuraSceneNode };
const runtimeParentedNodes = new WeakMap<AuraRuntimeNodeHandle, RuntimeParentedNode>();
const runtimeNodeChanged = new WeakMap<AuraRuntimeNodeHandle, () => void>();
// Version bump without a scene notification, for edits that already notify once for the whole commit (attach).
const runtimeNodeVersionBump = new WeakMap<AuraRuntimeNodeHandle, () => void>();
const runtimeHierarchyEnabled = new WeakSet<AuraRuntimeNodeHandle>();
const anonymousGraphHandles = new WeakSet<AuraRuntimeNodeHandle>();
const registrySceneHandles = new WeakMap<AuraRuntimeNodeRegistry, WeakMap<AuraSceneNode, AuraRuntimeNodeHandle>>();

const copyLocalTransform = (node: AuraTransformSpec): AuraTransformSpec => ({
  ...(node.position ? { position: [...node.position] as AuraVec3 } : {}),
  ...(node.rotation ? { rotation: [...node.rotation] as AuraVec3 } : {}),
  ...(node.quaternion ? { quaternion: [...node.quaternion] as AuraQuat } : {}),
  ...(node.rotationOrder ? { rotationOrder: node.rotationOrder } : {}),
  ...(node.lookAt ? { lookAt: [...node.lookAt] as AuraVec3 } : {}),
  ...(node.scale === undefined ? {} : { scale: typeof node.scale === "number" ? node.scale : [...node.scale] as AuraVec3 }),
  ...(node.pivot ? { pivot: [...node.pivot] as AuraVec3 } : {})
});

/** Internal source-local pose and parent matrices for the renderer. */
export function runtimeNodeParentedTransform(handle: AuraRuntimeNodeHandle): {
  readonly localNode: AuraTransformSpec;
  readonly parentWorldMatrix: Float32Array;
  readonly worldMatrix: Float32Array;
  readonly hasPivot: boolean;
  readonly hasLookAt: boolean;
} | undefined {
  const state = runtimeParentedNodes.get(handle);
  const parent = parityL7Parents.get(handle);
  if (!state || !parent || disposedQueryHandles.has(handle)) return undefined;
  const parentWorldMatrix = parityL7WorldMatrix(parent, new Float32Array(16));
  const worldMatrix = parityL7WorldMatrix(handle, new Float32Array(16));
  if (!parentWorldMatrix.every(Number.isFinite) || !worldMatrix.every(Number.isFinite)) {
    throw new RangeError("PARENTED_TRANSFORM_NON_FINITE: parented runtime transforms must be finite.");
  }
  let hasPivot = false;
  let hasLookAt = false;
  for (let cursor: AuraRuntimeNodeHandle | undefined = handle; cursor; cursor = parityL7Parents.get(cursor)) {
    const node = runtimeParentedNodes.get(cursor)?.localNode ?? parityL7NodeSpecs.get(cursor);
    if (!node) continue;
    assertValidPivot(node.pivot);
    hasPivot ||= hasNonzeroPivot(node.pivot);
    hasLookAt ||= "lookAt" in node && node.lookAt !== undefined;
  }
  return { localNode: copyLocalTransform(state.localNode), parentWorldMatrix, worldMatrix, hasPivot, hasLookAt };
}

function authoredSubtreeHasPhysics(node: AuraSceneNode): boolean {
  if ((node.kind === "primitive" || node.kind === "model") && node.physics) return true;
  return node.kind === "group" && node.children.some(authoredSubtreeHasPhysics);
}

function runtimeSubtreeHasPhysics(handle: AuraRuntimeNodeHandle): boolean {
  return runtimeHandleSubtree(handle).some((entry) => {
    const node = runtimeParentedNodes.get(entry)?.localNode ?? parityL7NodeSpecs.get(entry);
    return node ? authoredSubtreeHasPhysics(node) : false;
  });
}

function authoredSubtreeHasPivot(node: AuraSceneNode): boolean {
  const pivot = "pivot" in node ? node.pivot : undefined;
  assertValidPivot(pivot);
  if (hasNonzeroPivot(pivot)) return true;
  if ("instances" in node && node.instances?.some((instance) => {
    assertValidPivot(instance.pivot);
    return hasNonzeroPivot(instance.pivot);
  })) return true;
  return node.kind === "group" && node.children.some(authoredSubtreeHasPivot);
}

function authoredSubtreeHasLookAt(node: AuraSceneNode): boolean {
  if ("lookAt" in node && node.lookAt !== undefined) return true;
  if ("instances" in node && node.instances?.some((instance) => instance.lookAt !== undefined)) return true;
  return node.kind === "group" && node.children.some(authoredSubtreeHasLookAt);
}

function runtimeSubtreeMatches(handle: AuraRuntimeNodeHandle, predicate: (node: AuraSceneNode) => boolean): boolean {
  return runtimeHandleSubtree(handle).some((entry) => {
    const node = runtimeParentedNodes.get(entry)?.localNode ?? parityL7NodeSpecs.get(entry);
    return node ? predicate(node) : false;
  });
}

function authoredNodeHasWeather(node: AuraSceneNode): boolean {
  // runtimeHandleSubtree already walks current children; authored group
  // arrays can still contain a node that has since been reparented.
  return node.kind === "effect" && (node.effect === "rain" || node.effect === "snow");
}

function assertWeatherRuntimeChain(handle: AuraRuntimeNodeHandle): void {
  for (let cursor: AuraRuntimeNodeHandle | undefined = handle; cursor; cursor = parityL7Parents.get(cursor)) {
    const node = runtimeParentedNodes.get(cursor)?.localNode ?? parityL7NodeSpecs.get(cursor);
    if (node) assertWeatherTransformFields(node as AuraTransformSpec);
  }
  rigidWeatherMatrix(parityL7WorldMatrix(handle, new Float32Array(16)));
}

function assertWeatherMutation(handle: AuraRuntimeNodeHandle, transform: { readonly position?: unknown; readonly rotation?: unknown; readonly scale?: unknown }): void {
  if (runtimeSubtreeMatches(handle, authoredNodeHasWeather)) assertWeatherTransformFields(transform);
}

function runtimeChainHasPivot(handle: AuraRuntimeNodeHandle): boolean {
  for (let cursor: AuraRuntimeNodeHandle | undefined = handle; cursor; cursor = parityL7Parents.get(cursor)) {
    const node = runtimeParentedNodes.get(cursor)?.localNode ?? parityL7NodeSpecs.get(cursor);
    if (node) { assertValidPivot(node.pivot); if (hasNonzeroPivot(node.pivot)) return true; }
  }
  return false;
}

function runtimeChainHasLookAt(handle: AuraRuntimeNodeHandle): boolean {
  for (let cursor: AuraRuntimeNodeHandle | undefined = handle; cursor; cursor = parityL7Parents.get(cursor)) {
    const node = runtimeParentedNodes.get(cursor)?.localNode ?? parityL7NodeSpecs.get(cursor);
    if (node && "lookAt" in node && node.lookAt !== undefined) return true;
  }
  return false;
}

function assertRuntimePivotMutation(handle: AuraRuntimeNodeHandle, next: AuraVec3): void {
  assertValidPivot(next);
  const node = runtimeParentedNodes.get(handle)?.localNode ?? parityL7NodeSpecs.get(handle);
  assertValidPivot(node?.pivot);
  const previous = node?.pivot ?? [0, 0, 0];
  if (previous.every((value, index) => value === next[index])) return;
  if (runtimeSubtreeHasPhysics(handle) && !isRebuildablePivotPhysicsBody(handle)) {
    throw new RangeError("PIVOT_PHYSICS_UNSUPPORTED: changing an ancestor pivot of a physics body is not supported; only an unparented box body rebuilds its collider.");
  }
  if (hasNonzeroPivot(next)) {
    // An unparented node's own pivot composes with its own lookAt (the pivot
    // point stays fixed while -Z faces the target). Ancestor or descendant
    // look-at would need a live parented look-at transform.
    const parented = parityL7Parents.get(handle) !== undefined || runtimeParentedNodes.has(handle);
    for (let cursor: AuraRuntimeNodeHandle | undefined = handle; cursor; cursor = parityL7Parents.get(cursor)) {
      const current = runtimeParentedNodes.get(cursor)?.localNode ?? parityL7NodeSpecs.get(cursor);
      if (!current || !("lookAt" in current) || current.lookAt === undefined) continue;
      const ownComposable = cursor === handle && !parented && current.kind !== "group" &&
        !("instances" in current && current.instances !== undefined);
      if (!ownComposable) throw new RangeError("PIVOT_LOOK_AT_UNSUPPORTED: pivoted look-at is supported only on an unparented node's own transform.");
    }
    if (runtimeHandleSubtree(handle).some((entry) => entry !== handle && runtimeSubtreeMatches(entry, authoredSubtreeHasLookAt)) ||
        (node && "instances" in node && node.instances?.some((instance) => instance.lookAt !== undefined))) {
      throw new RangeError("PIVOT_LOOK_AT_UNSUPPORTED: pivoted look-at is supported only on an unparented node's own transform.");
    }
  }
}

/**
 * An unparented primitive box body (no instances or look-at, no other physics
 * in its subtree) has a complete pivoted collider contract: the app and
 * preview physics rebuild its collider before the next step when its pivot,
 * scale, size or geometry changes.
 */
function isRebuildablePivotPhysicsBody(handle: AuraRuntimeNodeHandle): boolean {
  const node = runtimeParentedNodes.get(handle)?.localNode ?? parityL7NodeSpecs.get(handle);
  if (!node || node.kind !== "primitive" || node.primitive !== "box" || !node.physics) return false;
  if (parityL7Parents.get(handle) || runtimeParentedNodes.has(handle)) return false;
  if (node.instances !== undefined || node.lookAt !== undefined) return false;
  return runtimeHandleSubtree(handle).every((entry) => entry === handle || !runtimeSubtreeHasPhysics(entry));
}

/** Scale edits rebuild a pivoted collider; a mirrored or singular box has no rigid mapping. */
function assertPivotedPhysicsScaleMutation(handle: AuraRuntimeNodeHandle, next: number | AuraVec3): void {
  const node = runtimeParentedNodes.get(handle)?.localNode ?? parityL7NodeSpecs.get(handle);
  if (!node || (node.kind !== "primitive" && node.kind !== "model") || !node.physics || !hasNonzeroPivot(node.pivot)) return;
  if (!vecScale(next).every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError("PIVOT_PHYSICS_UNSUPPORTED: a pivoted body's collider requires a finite, positive scale.");
  }
}

/**
 * Partial position uploads bypass the node's geometry declaration, so the
 * collider cannot observe them; `setGeometry` replaces the declaration and the
 * collider is rebuilt from its bounds before the next physics step.
 */
function assertNoPivotedPhysicsPositionUpdate(handle: AuraRuntimeNodeHandle, attribute: string): void {
  if (attribute !== "position" && attribute !== "positions") return;
  const node = runtimeParentedNodes.get(handle)?.localNode ?? parityL7NodeSpecs.get(handle);
  if (node && (node.kind === "primitive" || node.kind === "model") && node.physics && hasNonzeroPivot(node.pivot)) {
    throw new RangeError("PIVOT_PHYSICS_UNSUPPORTED: partial position updates cannot rebuild a pivoted collider; call setGeometry() instead.");
  }
}

function hasStaticGeneratedInstanceLights(node: AuraSceneNode): boolean {
  return node.kind === "model" && (node as { readonly instanceLightsStatic?: boolean }).instanceLightsStatic === true;
}

function authoredSubtreeHasStaticGeneratedLights(node: AuraSceneNode): boolean {
  return hasStaticGeneratedInstanceLights(node) ||
    (node.kind === "group" && node.children.some(authoredSubtreeHasStaticGeneratedLights));
}

/** Model-only removal/replacement would orphan the generated sibling lights. */
function assertNoGeneratedInstanceLightChildMutation(handle: AuraRuntimeNodeHandle): void {
  const node = runtimeParentedNodes.get(handle)?.localNode ?? parityL7NodeSpecs.get(handle);
  if (node && hasStaticGeneratedInstanceLights(node)) {
    throw new Error("INSTANCE_LIGHTS_RUNTIME_UNSUPPORTED: generated instance lights cannot follow model-only changes; rebuild the batch.");
  }
}

/** Parent motion is also blocked while ordinary generated lights cannot follow it. */
function assertNoGeneratedInstanceLightMutation(handle: AuraRuntimeNodeHandle): void {
  assertNoGeneratedInstanceLightChildMutation(handle);
  const node = runtimeParentedNodes.get(handle)?.localNode ?? parityL7NodeSpecs.get(handle);
  if (node?.kind === "group" && runtimeSubtreeMatches(handle, authoredSubtreeHasStaticGeneratedLights)) {
    throw new Error("INSTANCE_LIGHTS_RUNTIME_UNSUPPORTED: generated instance lights cannot follow live parent changes; rebuild the batch.");
  }
}

function assertMutableInstanceBuffer(handle: AuraRuntimeNodeHandle): void {
  assertNoGeneratedInstanceLightMutation(handle);
  const node = runtimeParentedNodes.get(handle)?.localNode ?? parityL7NodeSpecs.get(handle);
  if (node?.kind === "model" && (node as { readonly placements?: unknown }).placements !== undefined) {
    throw new Error("INSTANCE_SCATTER_RUNTIME_UNSUPPORTED: packed placements cannot follow live instance changes; rebuild the batch.");
  }
}

/** Resolve the live group owning a tagged LOD subtree without sharing state across mounts. */
export function runtimeNodeLodAnchor(handle: AuraRuntimeNodeHandle, root: AuraLodRootSpec): {
  readonly worldPosition: AuraVec3;
  readonly owner: object;
} | undefined {
  if (disposedQueryHandles.has(handle)) return undefined;
  let cursor: AuraRuntimeNodeHandle | undefined = handle;
  const first = runtimeParentedNodes.get(cursor)?.localNode ?? parityL7NodeSpecs.get(cursor);
  if (!first || lodMarkerOf(first)?.root !== root) return undefined;
  while (cursor) {
    const parent = parityL7Parents.get(cursor);
    if (!parent) return undefined;
    const spec = runtimeParentedNodes.get(parent)?.localNode ?? parityL7NodeSpecs.get(parent);
    if (!spec) return undefined;
    if (lodMarkerOf(spec)?.root !== root) {
      if (spec.kind !== "group") return undefined;
      const world = parityL7WorldMatrix(parent, new Float32Array(16));
      if (!world.every(Number.isFinite)) throw new RangeError("PARENTED_TRANSFORM_NON_FINITE: LOD anchor must be finite.");
      return { worldPosition: [world[12]!, world[13]!, world[14]!], owner: parent };
    }
    cursor = parent;
  }
  return undefined;
}

function enableRuntimeParentedNode(handle: AuraRuntimeNodeHandle, worldFacing: boolean, source?: Extract<AuraSceneNode, { kind: "model" | "primitive" }>): void {
  const spec = parityL7NodeSpecs.get(handle);
  if (!spec || (spec.kind !== "model" && spec.kind !== "primitive") || !parityL7Parents.has(handle)) return;
  const local = source ? { ...source, ...copyLocalTransform(source) } as MutableAuraRuntimeSceneNode : spec;
  runtimeParentedNodes.set(handle, { localNode: local, worldFacing, ...(source ? { source } : {}) });
}

function assertParentedLookAtSupported(handle: AuraRuntimeNodeHandle): void {
  // The existing look-at path has its own world-space target rules. Refuse a
  // live parented route until those rules are represented by this seam.
  for (let cursor: AuraRuntimeNodeHandle | undefined = handle; cursor; cursor = parityL7Parents.get(cursor)) {
    const candidate = runtimeParentedNodes.get(cursor)?.localNode ?? parityL7NodeSpecs.get(cursor);
    if (candidate && "lookAt" in candidate && candidate.lookAt !== undefined) throw new Error("PARENTED_LOOK_AT_UNSUPPORTED: live parented look-at transforms are not supported.");
  }
}

/** Invert a finite affine matrix; rigid physics also forbids reflected parents. */
function inverseParentMatrix(matrix: Float32Array, rigid: boolean): Float32Array {
  const a = matrix[0]!, b = matrix[4]!, c = matrix[8]!;
  const d = matrix[1]!, e = matrix[5]!, f = matrix[9]!;
  const g = matrix[2]!, h = matrix[6]!, i = matrix[10]!;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const magnitude = Math.max(Math.hypot(a, d, g), Math.hypot(b, e, h), Math.hypot(c, f, i));
  if (!matrix.every(Number.isFinite) || !Number.isFinite(det) || !Number.isFinite(magnitude) || magnitude === 0 ||
      Math.abs(det) <= 1e-12 * magnitude * magnitude * magnitude || (rigid && det < 0)) {
    throw new RangeError("PHYSICS_UNSUPPORTED_WORLD_TRANSFORM: parent is singular, reflected, or non-finite.");
  }
  const inverse = new Float32Array(16);
  inverse[0] = (e * i - f * h) / det; inverse[4] = (c * h - b * i) / det; inverse[8] = (b * f - c * e) / det;
  inverse[1] = (f * g - d * i) / det; inverse[5] = (a * i - c * g) / det; inverse[9] = (c * d - a * f) / det;
  inverse[2] = (d * h - e * g) / det; inverse[6] = (b * g - a * h) / det; inverse[10] = (a * e - b * d) / det;
  inverse[15] = 1;
  inverse[12] = -(inverse[0]! * matrix[12]! + inverse[4]! * matrix[13]! + inverse[8]! * matrix[14]!);
  inverse[13] = -(inverse[1]! * matrix[12]! + inverse[5]! * matrix[13]! + inverse[9]! * matrix[14]!);
  inverse[14] = -(inverse[2]! * matrix[12]! + inverse[6]! * matrix[13]! + inverse[10]! * matrix[14]!);
  if (!inverse.every(Number.isFinite)) throw new RangeError("PHYSICS_UNSUPPORTED_WORLD_TRANSFORM: parent inverse is not finite.");
  return inverse;
}

/** Resolve a quaternion in any supported Euler order using axis permutation. */
function runtimeEulerFromQuaternion(q: AuraQuat, order: import("../../contracts/sceneGraph.js").AuraEulerOrder): AuraVec3 {
  const axes: Record<import("../../contracts/sceneGraph.js").AuraEulerOrder, readonly [number, number, number, number]> = {
    XYZ: [0, 1, 2, 1], YZX: [1, 2, 0, 1], ZXY: [2, 0, 1, 1],
    XZY: [0, 2, 1, -1], ZYX: [2, 1, 0, -1], YXZ: [1, 0, 2, -1]
  };
  const [first, middle, last, sign] = axes[order];
  const matrix = composeTRSInto(new Float32Array(16), [0, 0, 0], q, [1, 1, 1]);
  const at = (row: number, column: number): number => matrix[column * 4 + row]!;
  const sine = Math.max(-1, Math.min(1, sign * at(first, last)));
  const cosine = Math.hypot(at(first, first), at(first, middle));
  const result = [0, 0, 0];
  result[middle] = Math.atan2(sine, cosine);
  if (cosine > 1e-14) {
    result[last] = Math.atan2(-sign * at(first, middle), at(first, first));
    result[first] = cosine < 0.25
      ? Math.atan2(sign * at(last, middle), at(middle, middle)) - Math.atan2(sign * sine * Math.sin(result[last]!), Math.cos(result[last]!))
      : Math.atan2(-sign * at(middle, last), at(last, last));
  } else {
    result[first] = Math.atan2(sign * at(last, middle), at(middle, middle));
  }
  return result as unknown as AuraVec3;
}

const vecScale = (scale: number | AuraVec3 | undefined): AuraVec3 =>
  scale === undefined ? [1, 1, 1] : typeof scale === "number" ? [scale, scale, scale] : scale;
const sameScale = (a: AuraVec3, b: AuraVec3): boolean =>
  a.every((value, axis) => Math.abs(value - b[axis]!) <= 1e-4 * Math.max(1e-12, Math.abs(value), Math.abs(b[axis]!)));

function prepareParentedWorldPose(
  handle: AuraRuntimeNodeHandle,
  position: AuraVec3,
  quaternion: AuraQuat,
  options: { readonly rigid?: boolean; readonly scale?: AuraVec3; readonly expectedScale?: AuraVec3 } = {}
): (() => void) | undefined {
  assertNoGeneratedInstanceLightMutation(handle);
  const state = runtimeParentedNodes.get(handle);
  const parent = parityL7Parents.get(handle);
  if (!state || !parent || disposedQueryHandles.has(handle)) return undefined;
  const norm = Math.hypot(...quaternion);
  if (!position.every(Number.isFinite) || !quaternion.every(Number.isFinite) || !Number.isFinite(norm) || norm === 0) {
    throw new RangeError("PHYSICS_UNSUPPORTED_WORLD_TRANSFORM: world position and rotation must be finite.");
  }
  const parentMatrix = parityL7WorldMatrix(parent, new Float32Array(16));
  const inverse = inverseParentMatrix(parentMatrix, options.rigid === true);
  const current = decomposeMatrix(parityL7WorldMatrix(handle, new Float32Array(16)));
  if (options.rigid && (current.sheared || current.scale.some((value) => !Number.isFinite(value) || value <= 0))) {
    throw new RangeError("PHYSICS_UNSUPPORTED_WORLD_TRANSFORM: world pose is sheared, reflected, or singular.");
  }
  if (options.expectedScale && !sameScale(current.scale, options.expectedScale)) {
    throw new RangeError("PHYSICS_COLLIDER_SCALE_CHANGED: changing an ancestor scale requires rebuilding the collider.");
  }
  const q: AuraQuat = [quaternion[0] / norm, quaternion[1] / norm, quaternion[2] / norm, quaternion[3] / norm];
  const targetWorld = composeTRSInto(new Float32Array(16), position, q, options.scale ?? current.scale);
  const localMatrix = new Float32Array(16);
  multiplyMat4Into(localMatrix, inverse, targetWorld);
  const local = decomposeMatrix(localMatrix);
  if (local.sheared || !local.matrix.every(Number.isFinite) || local.scale.some((value) => !Number.isFinite(value) || value === 0) ||
      (options.rigid && !sameScale(local.scale, vecScale(state.localNode.scale)))) {
    throw new RangeError("PHYSICS_UNSUPPORTED_WORLD_TRANSFORM: world pose cannot be represented by the local transform.");
  }
  const pivot = state.localNode.pivot ?? [0, 0, 0];
  const localPosition: AuraVec3 = [
    local.position[0] - pivot[0] + localMatrix[0]! * pivot[0] + localMatrix[4]! * pivot[1] + localMatrix[8]! * pivot[2],
    local.position[1] - pivot[1] + localMatrix[1]! * pivot[0] + localMatrix[5]! * pivot[1] + localMatrix[9]! * pivot[2],
    local.position[2] - pivot[2] + localMatrix[2]! * pivot[0] + localMatrix[6]! * pivot[1] + localMatrix[10]! * pivot[2]
  ];
  if (!localPosition.every(Number.isFinite)) throw new RangeError("PHYSICS_UNSUPPORTED_WORLD_TRANSFORM: local position is not finite.");
  const localRotation = runtimeEulerFromQuaternion(local.quaternion, state.localNode.rotationOrder ?? "ZYX");
  return () => {
    assertNoGeneratedInstanceLightMutation(handle);
    if (runtimeParentedNodes.get(handle) !== state || parityL7Parents.get(handle) !== parent || disposedQueryHandles.has(handle)) {
      throw new Error("PARENTED_TRANSFORM_SUPERSEDED: the runtime node changed before pose publication.");
    }
    state.localNode.position = localPosition;
    state.localNode.quaternion = [...local.quaternion] as AuraQuat;
    state.localNode.rotation = localRotation;
    state.localNode.scale = [...local.scale] as AuraVec3;
    runtimeNodeChanged.get(handle)?.();
  };
}

/** Preflight a rigid body world pose, then publish it once the caller is ready. */
export function prepareRuntimeNodeWorldPose(
  handle: AuraRuntimeNodeHandle,
  position: AuraVec3,
  quaternion: AuraQuat,
  expectedScale?: AuraVec3
): (() => void) | undefined {
  return prepareParentedWorldPose(handle, position, quaternion, { rigid: true, expectedScale });
}

function worldFacingPose(handle: AuraRuntimeNodeHandle): ReturnType<typeof decomposeMatrix> | undefined {
  if (!runtimeParentedNodes.get(handle)?.worldFacing) return undefined;
  return decomposeMatrix(parityL7WorldMatrix(handle, new Float32Array(16)));
}

function setParentedWorldPosition(handle: AuraRuntimeNodeHandle, position: AuraVec3, requireWorldFacing = false): boolean {
  assertNoGeneratedInstanceLightMutation(handle);
  const state = runtimeParentedNodes.get(handle);
  const parent = parityL7Parents.get(handle);
  if (!state || (requireWorldFacing && !state.worldFacing) || !parent) return false;
  if (!position.every(Number.isFinite)) throw new RangeError("Parented position must be finite.");
  assertParentedLookAtSupported(handle);
  const inverse = inverseParentMatrix(parityL7WorldMatrix(parent, new Float32Array(16)), false);
  const desired = [
    inverse[0]! * position[0] + inverse[4]! * position[1] + inverse[8]! * position[2] + inverse[12]!,
    inverse[1]! * position[0] + inverse[5]! * position[1] + inverse[9]! * position[2] + inverse[13]!,
    inverse[2]! * position[0] + inverse[6]! * position[1] + inverse[10]! * position[2] + inverse[14]!
  ];
  const matrix = localMatrixOf(state.localNode, new Float32Array(16));
  const previous = state.localNode.position ?? [0, 0, 0];
  state.localNode.position = [previous[0] + desired[0]! - matrix[12]!, previous[1] + desired[1]! - matrix[13]!, previous[2] + desired[2]! - matrix[14]!];
  runtimeNodeChanged.get(handle)?.();
  return true;
}

function setWorldFacingPosition(handle: AuraRuntimeNodeHandle, position: AuraVec3): boolean {
  return setParentedWorldPosition(handle, position, true);
}

/** Apply a world-space translation to either kind of parented runtime facade. */
export function runtimeNodeTranslateWorld(handle: AuraRuntimeNodeHandle, delta: AuraVec3): void {
  assertNoGeneratedInstanceLightMutation(handle);
  if (!delta.every(Number.isFinite)) throw new RangeError("World translation must be finite.");
  const parented = runtimeParentedNodes.has(handle);
  if (parented) {
    const matrix = parityL7WorldMatrix(handle, new Float32Array(16));
    if (setParentedWorldPosition(handle, [matrix[12]! + delta[0], matrix[13]! + delta[1], matrix[14]! + delta[2]])) return;
  }
  handle.translate(delta[0], delta[1], delta[2]);
}

/** Prepare one parented root-motion update without changing the node or notifying observers. */
export function prepareRuntimeNodeRootMotion(
  handle: AuraRuntimeNodeHandle, delta: AuraVec3, localYaw: number
): ((onApplied?: () => void) => void) | undefined {
  assertNoGeneratedInstanceLightMutation(handle);
  const state = runtimeParentedNodes.get(handle);
  const parent = parityL7Parents.get(handle);
  if (!state || !parent || disposedQueryHandles.has(handle)) return undefined;
  if (!delta.every(Number.isFinite) || !Number.isFinite(localYaw)) throw new RangeError("Root motion must be finite.");
  assertParentedLookAtSupported(handle);
  const parentWorld = parityL7WorldMatrix(parent, new Float32Array(16));
  const inverse = inverseParentMatrix(parentWorld, false);
  const localMatrix = localMatrixOf(state.localNode, new Float32Array(16));
  const world = new Float32Array(16);
  multiplyMat4Into(world, parentWorld, localMatrix);
  const target: AuraVec3 = [world[12]! + delta[0], world[13]! + delta[1], world[14]! + delta[2]];
  const desired: AuraVec3 = [
    inverse[0]! * target[0] + inverse[4]! * target[1] + inverse[8]! * target[2] + inverse[12]!,
    inverse[1]! * target[0] + inverse[5]! * target[1] + inverse[9]! * target[2] + inverse[13]!,
    inverse[2]! * target[0] + inverse[6]! * target[1] + inverse[10]! * target[2] + inverse[14]!
  ];
  const previous = state.localNode.position ?? [0, 0, 0];
  const order = state.localNode.rotationOrder ?? "ZYX";
  const initial = state.localNode.quaternion ?? eulerToQuaternion(state.localNode.rotation ?? [0, 0, 0], order);
  const length = Math.hypot(...initial);
  if (!desired.every(Number.isFinite) || !initial.every(Number.isFinite) || !Number.isFinite(length) || length === 0) {
    throw new RangeError("Root motion requires a finite local transform.");
  }
  const [x, y, z, w] = initial.map((component) => component / length) as unknown as AuraQuat;
  const s = Math.sin(localYaw / 2), c = Math.cos(localYaw / 2);
  // The sampled yaw is about the animated node's local Y axis.
  const quaternion: AuraQuat = [x * c - z * s, y * c + w * s, z * c + x * s, w * c - y * s];
  const rotation = runtimeEulerFromQuaternion(quaternion, order);
  const rotated = localMatrixOf({ ...state.localNode, quaternion, rotation }, new Float32Array(16));
  // Rotation is about the rendered node origin, as in the handle-less matrix
  // path. Compensate the authored pivot so yaw alone does not add translation.
  const position: AuraVec3 = [previous[0] + desired[0] - rotated[12]!, previous[1] + desired[1] - rotated[13]!, previous[2] + desired[2] - rotated[14]!];
  if (!position.every(Number.isFinite)) throw new RangeError("Root motion requires a finite local transform.");
  return (onApplied) => {
    assertNoGeneratedInstanceLightMutation(handle);
    if (runtimeParentedNodes.get(handle) !== state || parityL7Parents.get(handle) !== parent || disposedQueryHandles.has(handle) ||
        !parityL7WorldMatrix(parent, new Float32Array(16)).every((value, index) => value === parentWorld[index]) ||
        !localMatrixOf(state.localNode, new Float32Array(16)).every((value, index) => value === localMatrix[index])) {
      throw new Error("PARENTED_TRANSFORM_SUPERSEDED: the runtime node changed before root-motion publication.");
    }
    state.localNode.position = position;
    state.localNode.quaternion = quaternion;
    state.localNode.rotation = rotation;
    onApplied?.();
    runtimeNodeChanged.get(handle)?.();
  };
}

/** Find a private graph-node handle without adding anonymous nodes to public registry ids. */
export function runtimeNodeHandleForSceneNode(registry: AuraRuntimeNodeRegistry | undefined, node: AuraSceneNode): AuraRuntimeNodeHandle | undefined {
  const handle = registry ? registrySceneHandles.get(registry)?.get(node) : undefined;
  return handle && !disposedQueryHandles.has(handle) ? handle : undefined;
}

/** Nearest authored target wins; targets are world-space and are never transformed by ancestors. */
function splatLookAtTarget(handle: AuraRuntimeNodeHandle): AuraVec3 | undefined {
  for (let current: AuraRuntimeNodeHandle | undefined = handle; current; current = parityL7Parents.get(current)) {
    const target = (parityL7NodeSpecs.get(current) as { readonly lookAt?: AuraVec3 } | undefined)?.lookAt;
    if (target !== undefined) return target;
  }
  return undefined;
}

/** Aim local -Z at a world-space target while retaining the complete scale/shear and pivot position. */
export function applySplatLookAt(world: Float32Array, target: AuraVec3, pivot: AuraVec3 = [0, 0, 0]): Float32Array {
  const cross = (a: readonly number[], b: readonly number[]): [number, number, number] => [
    a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!
  ];
  const unit = (v: readonly number[]): [number, number, number] => {
    const length = Math.hypot(...v);
    if (!Number.isFinite(length) || length < 1e-12) throw new RangeError("Gaussian splat lookAt requires a distinct target and nondegenerate transform");
    return [v[0]! / length, v[1]! / length, v[2]! / length];
  };
  if (target.length !== 3 || !target.every(Number.isFinite)) throw new RangeError("Gaussian splat lookAt target must be finite");
  const p: [number, number, number] = [
    world[12]! + world[0]! * pivot[0] + world[4]! * pivot[1] + world[8]! * pivot[2],
    world[13]! + world[1]! * pivot[0] + world[5]! * pivot[1] + world[9]! * pivot[2],
    world[14]! + world[2]! * pivot[0] + world[6]! * pivot[1] + world[10]! * pivot[2]
  ];
  const beforeZ = unit([world[8]!, world[9]!, world[10]!]);
  const beforeX = unit(cross([world[4]!, world[5]!, world[6]!], beforeZ));
  const beforeY = unit(cross(beforeZ, beforeX));
  const afterZ = unit([p[0] - target[0], p[1] - target[1], p[2] - target[2]]);
  // Select a stable alternative up axis at the poles.
  const up = Math.abs(afterZ[1]) > 0.9999 ? [0, 0, 1] : [0, 1, 0];
  const afterX = unit(cross(up, afterZ));
  const afterY = unit(cross(afterZ, afterX));
  const before = [beforeX, beforeY, beforeZ], after = [afterX, afterY, afterZ];
  const result = Float32Array.from(world);
  for (let column = 0; column < 3; column++) {
    const offset = column * 4;
    const v = [world[offset]!, world[offset + 1]!, world[offset + 2]!];
    const coefficients = before.map((axis) => axis[0] * v[0]! + axis[1] * v[1]! + axis[2] * v[2]!);
    for (let row = 0; row < 3; row++) result[offset + row] = after[0]![row]! * coefficients[0]! + after[1]![row]! * coefficients[1]! + after[2]![row]! * coefficients[2]!;
  }
  for (let row = 0; row < 3; row++) result[12 + row] = p[row]! - result[row]! * pivot[0] - result[4 + row]! * pivot[1] - result[8 + row]! * pivot[2];
  return result;
}

function linkRuntimeChild(parent: AuraRuntimeNodeHandle, child: AuraRuntimeNodeHandle): void {
  const old = parityL7Parents.get(child);
  if (old) parityL7Children.get(old)?.delete(child);
  parityL7Parents.set(child, parent);
  let children = parityL7Children.get(parent);
  if (!children) parityL7Children.set(parent, children = new Set());
  children.add(child);
}

function runtimeHandleSubtree(root: AuraRuntimeNodeHandle): AuraRuntimeNodeHandle[] {
  const result: AuraRuntimeNodeHandle[] = [];
  const visit = (handle: AuraRuntimeNodeHandle): void => {
    result.push(handle);
    for (const child of parityL7Children.get(handle) ?? []) visit(child);
  };
  visit(root);
  return result;
}

/** Live CPU-side state used by scene queries. The renderer publishes its actual
 * submitted items here, so animated models use the current palette and morph
 * weights rather than a guessed bind pose. The registry owns these references. */
const runtimeQueryGeometry = new WeakMap<AuraRuntimeNodeHandle, AuraCustomGeometrySpec>();
const runtimeQueryItems = new WeakMap<AuraRuntimeNodeHandle, readonly RenderItem[]>();
const disposedQueryHandles = new WeakSet<AuraRuntimeNodeHandle>();

export function setRuntimeQueryRenderItems(handle: AuraRuntimeNodeHandle, items: readonly RenderItem[]): void {
  if (!disposedQueryHandles.has(handle)) runtimeQueryItems.set(handle, items.slice());
}

export function invalidateRuntimeQueryHandle(handle: AuraRuntimeNodeHandle): void {
  if (disposedQueryHandles.has(handle)) return;
  disposedQueryHandles.add(handle);
  for (const child of [...(parityL7Children.get(handle) ?? [])]) invalidateRuntimeQueryHandle(child);
  runtimeQueryItems.delete(handle);
  runtimeQueryGeometry.delete(handle);
  runtimeParentedNodes.delete(handle);
  runtimeNodeChanged.delete(handle);
  runtimeHierarchyEnabled.delete(handle);
  const parent = parityL7Parents.get(handle);
  if (parent) parityL7Children.get(parent)?.delete(handle);
  parityL7Parents.delete(handle);
  parityL7Children.delete(handle);
  if (parent && anonymousGraphHandles.has(parent) && !parityL7Children.get(parent)?.size) invalidateRuntimeQueryHandle(parent);
}

/** Effective visibility includes every authored ancestor, including unnamed groups. */
export function runtimeNodeEffectiveVisibility(handle: AuraRuntimeNodeHandle): boolean {
  for (let current: AuraRuntimeNodeHandle | undefined = handle; current; current = parityL7Parents.get(current)) {
    if (disposedQueryHandles.has(current) || !current.visible) return false;
  }
  return true;
}

export function runtimeNodeQueryState(handle: AuraRuntimeNodeHandle): {
  readonly node: MutableAuraRuntimeSceneNode;
  readonly worldMatrix: Float32Array;
  readonly geometry?: AuraCustomGeometrySpec;
  readonly renderItems?: readonly RenderItem[];
  readonly instanceMatrices?: Float32Array;
  readonly morphTargets: Readonly<Record<string, number>>;
} | undefined {
  const node = parityL7NodeSpecs.get(handle);
  if (!node || !runtimeNodeEffectiveVisibility(handle)) return undefined;
  const snapshot = handle.snapshot();
  return {
    node,
    worldMatrix: parityL7WorldMatrix(handle, new Float32Array(16)),
    geometry: runtimeQueryGeometry.get(handle) ?? (node.kind === "primitive" ? node.geometry : undefined),
    renderItems: runtimeQueryItems.get(handle),
    instanceMatrices: snapshot.instanceMatrices,
    morphTargets: snapshot.morphTargets ?? {}
  };
}

/** Build a CPU query snapshot without changing the spec submitted to rendering. */
function queryGeometryForUpdate(node: MutableAuraRuntimeSceneNode): AuraCustomGeometrySpec | undefined {
  if (node.kind !== "primitive") return undefined;
  if (node.geometry) return node.geometry;
  const source = createProductionPrimitiveGeometry(node);
  try {
    const read = (name: "position" | "normal" | "uv" | "color") => {
      if (!source.vertexBuffer.format.hasAttribute(name)) return undefined;
      return Float32Array.from(Array.from({ length: source.vertexBuffer.vertexCount }, (_, i) => source.vertexBuffer.getAttribute(i, name)).flat());
    };
    return {
      kind: "aura-custom-geometry", positions: read("position")!,
      normals: read("normal"), uvs: read("uv"), colors: read("color"),
      indices: source.indexBuffer ? source.indexBuffer.data.slice() : [],
      topology: source.topology
    };
  } finally {
    source.dispose();
  }
}

function updatedQueryGeometry(spec: AuraCustomGeometrySpec, name: string, update: { readonly array: ArrayLike<number>; readonly offset: number }, lineDefaults = false): AuraCustomGeometrySpec {
  const normalized = normalizeGeometryAttributes(spec);
  const aliases: Record<string, "positions" | "normals" | "uvs" | "uv1s" | "colors"> = {
    position: "positions", positions: "positions", normal: "normals", normals: "normals",
    uv: "uvs", uv0: "uvs", uvs: "uvs", uv1: "uv1s", uv1s: "uv1s", color: "colors", colors: "colors"
  };
  const field = aliases[name];
  if (field) {
    const source = normalized[field] ?? (field === "colors" && lineDefaults ? new Float32Array(normalized.vertexCount * 4).fill(1) : field === "normals" ? (spec.topology === "lines" || spec.topology === "points"
      ? Float32Array.from({ length: normalized.positions.length }, (_, i) => i % 3 === 1 ? 1 : 0)
      : computeAuraGeometryNormals({ positions: normalized.positions, indices: normalized.indices })) : undefined);
    if (!source) throw new Error(`Aura3D geometry has no attribute "${name}".`);
    const itemSize = field === "uvs" || field === "uv1s" ? 2 : field === "colors" ? 4 : 3;
    if (update.array.length % itemSize || update.offset + update.array.length / itemSize > normalized.vertexCount) {
      throw new RangeError(`Aura3D attribute "${name}" update exceeds its vertex range or has incomplete items.`);
    }
    const data = source.slice();
    for (let index = 0; index < update.array.length; index += 1) data[update.offset * itemSize + index] = update.array[index]!;
    // Explicit bounds describe the old positions; after an edit they cannot be
    // used for culling or queries until recomputed.
    return { ...spec, [field]: data, ...(field === "positions" ? { bounds: undefined } : {}) };
  }
  const attribute = spec.attributes?.[name];
  if (!attribute) throw new Error(`Aura3D geometry has no attribute "${name}".`);
  const { itemSize } = attribute;
  if (update.array.length % itemSize || update.offset + update.array.length / itemSize > normalized.vertexCount) {
    throw new RangeError(`Aura3D attribute "${name}" update exceeds its vertex range or has incomplete items.`);
  }
  const raw = attribute.data;
  const data = Array.isArray(raw) ? [...raw] : raw.slice();
  const stride = attribute.stride ?? itemSize;
  const attributeOffset = attribute.offset ?? 0;
  for (let i = 0; i < update.array.length; i += 1) {
    const destination = (update.offset + Math.floor(i / itemSize)) * stride + attributeOffset + i % itemSize;
    (data as number[] | Float32Array)[destination] = update.array[i]!;
    if (!Array.isArray(data) && !(data instanceof Float32Array) && (data as ArrayLike<number>)[destination] !== update.array[i]) {
      throw new RangeError(`Aura3D attribute "${name}" update is outside its declared storage range.`);
    }
  }
  return { ...spec, attributes: { ...spec.attributes, [name]: { ...attribute, data } } };
}

function runtimeGeometryBounds(handle: AuraRuntimeNodeHandle, node: MutableAuraRuntimeSceneNode, geometry: AuraCustomGeometrySpec, dense?: Float32Array) {
  const fix = __FIX();
  const positions = (fix & 4) && (geometry as { positions: unknown }).positions instanceof Float32Array ? (geometry as { positions: Float32Array }).positions : normalizeGeometryAttributes(geometry).positions;
  const world = parityL7WorldMatrix(handle, new Float32Array(16));
  if ((fix & 8) && dense === undefined && node.instances === undefined) {
    const key = Array.prototype.join.call(world, ",") + "|" + String(node.kind === "primitive" ? node.size ?? 1 : 1);
    const hit = __boundsCache.get(geometry);
    if (hit && hit.key === key) return hit.result as ReturnType<typeof runtimeGeometryBounds>;
    const result = runtimeGeometryBoundsCompute(handle, node, geometry, dense, positions, world, fix);
    __boundsCache.set(geometry, { key, result });
    return result;
  }
  return runtimeGeometryBoundsCompute(handle, node, geometry, dense, positions, world, fix);
}

function runtimeGeometryBoundsCompute(handle: AuraRuntimeNodeHandle, node: MutableAuraRuntimeSceneNode, geometry: AuraCustomGeometrySpec, dense: Float32Array | undefined, positions: Float32Array, world: Float32Array, fix: number) {
  const size = node.kind === "primitive" ? node.size ?? 1 : 1;
  const dimensions = typeof size === "number" ? [size, size, size] : size;
  const matrices: Float32Array[] = [];
  if (dense !== undefined || node.instances !== undefined) {
    const count = dense ? dense.length / 16 : node.instances!.length;
    for (let i = 0; i < count; i += 1) {
      const local = dense ? dense.slice(i * 16, i * 16 + 16) : localMatrixOf(node.instances![i]!, new Float32Array(16));
      const matrix = new Float32Array(16);
      multiplyMat4Into(matrix, world, local);
      matrices.push(matrix);
    }
  } else matrices.push(world);
  if (matrices.length === 0) return undefined;
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  if ((fix & 4) && matrices.length === 1) {
    const m = matrices[0]!, d0 = dimensions[0]!, d1 = dimensions[1]!, d2 = dimensions[2]!;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]! * d0, y = positions[i + 1]! * d1, z = positions[i + 2]! * d2;
      const px = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, py = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, pz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; if (pz < z0) z0 = pz; if (pz > z1) z1 = pz;
    }
    min[0] = x0; min[1] = y0; min[2] = z0; max[0] = x1; max[1] = y1; max[2] = z1;
  } else
  for (const matrix of matrices) for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]! * dimensions[0]!, y = positions[i + 1]! * dimensions[1]!, z = positions[i + 2]! * dimensions[2]!;
    const point = [matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!, matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!, matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!];
    for (let axis = 0; axis < 3; axis += 1) { min[axis] = Math.min(min[axis]!, point[axis]!); max[axis] = Math.max(max[axis]!, point[axis]!); }
  }
  const center: RuntimeNodeVec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const boundsSize: RuntimeNodeVec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return { kind: "aura-runtime-node-bounds" as const, min, max, center, size: boundsSize, radius: Math.hypot(...boundsSize) / 2 };
}

const parityL7WorldMatrix = (handle: AuraRuntimeNodeHandle, out: Float32Array): Float32Array => {
  const node = parityL7NodeSpecs.get(handle);
  if (!node) return identityMat4Into(out);
  if (runtimeParentedNodes.has(handle)) assertParentedLookAtSupported(handle);
  const localNode = runtimeParentedNodes.get(handle)?.localNode ?? node;
  const parent = parityL7Parents.get(handle);
  // An unparented model/primitive's own lookAt is drawn by the C-06 model
  // matrix; queries and bounds use the same pivot-fixed look rotation.
  const ownLookAt = !parent && (node.kind === "model" || node.kind === "primitive") && "lookAt" in localNode && localNode.lookAt !== undefined;
  const local = ownLookAt ? composeWorldMatrixWithLookAt(null, localNode, new Float32Array(16)) : localMatrixOf(localNode, new Float32Array(16));
  if (!parent) out.set(local);
  else multiplyMat4Into(out, parityL7WorldMatrix(parent, new Float32Array(16)), local);
  if (node.kind === "gaussian-splat") {
    const target = splatLookAtTarget(handle);
    if (target) out.set(applySplatLookAt(out, target, node.pivot));
  }
  return out;
};

/** General 4x4 inverse (gl-matrix style, column-major). Returns `out`. */
const parityL7InvertMat4 = (m: Float32Array, out: Float32Array): Float32Array => {
  const m00 = m[0], m01 = m[1], m02 = m[2], m03 = m[3];
  const m10 = m[4], m11 = m[5], m12 = m[6], m13 = m[7];
  const m20 = m[8], m21 = m[9], m22 = m[10], m23 = m[11];
  const m30 = m[12], m31 = m[13], m32 = m[14], m33 = m[15];
  const b00 = m00 * m11 - m01 * m10;
  const b01 = m00 * m12 - m02 * m10;
  const b02 = m00 * m13 - m03 * m10;
  const b03 = m01 * m12 - m02 * m11;
  const b04 = m01 * m13 - m03 * m11;
  const b05 = m02 * m13 - m03 * m12;
  const b06 = m20 * m31 - m21 * m30;
  const b07 = m20 * m32 - m22 * m30;
  const b08 = m20 * m33 - m23 * m30;
  const b09 = m21 * m32 - m22 * m31;
  const b10 = m21 * m33 - m23 * m31;
  const b11 = m22 * m33 - m23 * m32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return identityMat4Into(out);
  det = 1.0 / det;
  out[0] = (m11 * b11 - m12 * b10 + m13 * b09) * det;
  out[1] = (m02 * b10 - m01 * b11 - m03 * b09) * det;
  out[2] = (m31 * b05 - m32 * b04 + m33 * b03) * det;
  out[3] = (m22 * b04 - m21 * b05 - m23 * b03) * det;
  out[4] = (m12 * b08 - m10 * b11 - m13 * b07) * det;
  out[5] = (m00 * b11 - m02 * b08 + m03 * b07) * det;
  out[6] = (m32 * b02 - m30 * b05 - m33 * b01) * det;
  out[7] = (m20 * b05 - m22 * b02 + m23 * b01) * det;
  out[8] = (m10 * b10 - m11 * b08 + m13 * b06) * det;
  out[9] = (m01 * b08 - m00 * b10 - m03 * b06) * det;
  out[10] = (m30 * b04 - m31 * b02 + m33 * b00) * det;
  out[11] = (m21 * b02 - m20 * b04 - m23 * b00) * det;
  out[12] = (m11 * b07 - m10 * b09 - m12 * b06) * det;
  out[13] = (m00 * b09 - m01 * b07 + m02 * b06) * det;
  out[14] = (m31 * b01 - m30 * b03 - m32 * b00) * det;
  out[15] = (m20 * b03 - m21 * b01 + m22 * b00) * det;
  return out;
};

const parityL7ValidChannel = (channel: number): boolean =>
  Number.isInteger(channel) && channel >= 0 && channel <= 31;
// endregion parity:L7

export interface MutableAuraRuntimeNodeRegistry extends AuraRuntimeNodeRegistry {
  readonly version: number;
  /** Observe committed material and topology changes for the lifetime of this registry. */
  onChange(listener: () => void): () => void;
  /** Observe committed topology, visibility and transform changes, without material rescans. */
  onSceneChange(listener: () => void): () => void;
  /** Observe material replacements synchronously before ordinary invalidation. */
  onMaterialChange(listener: (change: RuntimeMaterialChange) => void): () => void;
  add(node: AuraSceneNode | AuraNodeBuilder<AuraSceneNode>, options?: { readonly parent?: string }): AuraRuntimeNodeHandle;
  remove(idOrHandle: string | AuraRuntimeNodeHandle): boolean;
  configure(deps: AuraRuntimeNodeRegistryDeps): void;
  /** Binds the mounted C-36 compiled scene so add/remove can take the subtree path. */
  attachCompiled(scene: CompiledScene): void;
  detachCompiled(scene: CompiledScene): void;
  reset(snapshot: AuraSceneSnapshot, authoredSnapshot?: AuraSceneSnapshot): void;
  /** Retire handles and their published renderer resources on app disposal. */
  dispose(): void;
  /** The live scene plus nodes added through the compiled subtree path (RP-03), for a remount that must keep them. */
  sceneWithRuntimeAdditions(): AuraSceneSnapshot | undefined;
  /** Effective state for a linked node. `worldMatrix` is a caller-owned, column-major copy. */
  atmosphereNodeState(node: AuraSceneNode): { readonly visible: boolean; readonly worldPosition: AuraVec3; readonly worldMatrix: Float32Array } | undefined;
  /** Validate weather against its actual, potentially reparented ancestor chain. */
  assertWeatherNodeTransform(node: AuraSceneNode): void;
}

export function collectRuntimeNodeHandles(snapshot: AuraSceneSnapshot, authoredSnapshot?: AuraSceneSnapshot, sceneHandles?: WeakMap<AuraSceneNode, AuraRuntimeNodeHandle>, onMaterialChange?: (handle: AuraRuntimeNodeHandle) => void, onSceneNodeChange?: (handle: AuraRuntimeNodeHandle) => void, ownedHandles?: WeakSet<AuraRuntimeNodeHandle>, hierarchicalModels = false): Map<string, AuraRuntimeNodeHandle> {
  const next = new Map<string, AuraRuntimeNodeHandle>();
  let anonymousId = 0;
  const visit = (node: AuraSceneNode, parent: AuraRuntimeNodeHandle | undefined, authoredGraphOnly: boolean, hasLiveAncestor: boolean): boolean => {
    const runtime = "runtime" in node ? node.runtime : undefined;
    const profiledLight = node.kind === "light" && (node.photometricProfile !== undefined || (node.light === "spot" && node.projectedImage !== undefined));
    const parentedVisual = hierarchicalModels && hasLiveAncestor && (node.kind === "model" || node.kind === "primitive");
    const isGraphNode = node.kind === "line" || node.kind === "points" || node.kind === "sprite" || node.kind === "batched" || node.kind === "gaussian-splat" || node.kind === "scalar-volume" || node.kind === "effect" || profiledLight || parentedVisual;
    if (authoredGraphOnly && hierarchicalModels && parent && runtime?.id && (node.kind === "model" || node.kind === "primitive")) {
      const existing = next.get(runtime.id);
      if (existing && existing.kind === node.kind) {
        linkRuntimeChild(parent, existing);
        enableRuntimeParentedNode(existing, true, node);
        sceneHandles?.set(node, existing);
        return true;
      }
    }
    const eligible = !authoredGraphOnly || node.kind === "group" || isGraphNode;
    const anonymousGraphNode = (profiledLight || (isGraphNode && hasLiveAncestor)) && !runtime?.id;
    const handle = eligible && (runtime?.id || node.kind === "group" || anonymousGraphNode)
      ? createRuntimeNodeHandle(node as MutableAuraRuntimeSceneNode, runtime?.id ? runtime : { id: `__aura_anonymous_${++anonymousId}` }, onMaterialChange, onSceneNodeChange) : undefined;
    if (handle && hierarchicalModels) runtimeHierarchyEnabled.add(handle);
    if (handle) ownedHandles?.add(handle);
    if (handle && !runtime?.id) anonymousGraphHandles.add(handle);
    if (handle && (isGraphNode || node.kind === "group")) sceneHandles?.set(node, handle);
    if (handle && runtime?.id) {
      const previous = next.get(runtime.id);
      if (previous) invalidateRuntimeQueryHandle(previous);
      next.set(runtime.id, handle);
    }
    if (handle && parent) {
      linkRuntimeChild(parent, handle);
      if (hierarchicalModels && (node.kind === "model" || node.kind === "primitive")) enableRuntimeParentedNode(handle, false);
    }
    let hasRegistered = Boolean(handle && (runtime?.id || anonymousGraphNode));
    if (node.kind === "group") for (const child of node.children) hasRegistered = visit(child, handle ?? parent, authoredGraphOnly, hasLiveAncestor || Boolean(runtime?.id)) || hasRegistered;
    if (handle && !runtime?.id && !hasRegistered) {
      invalidateRuntimeQueryHandle(handle);
      sceneHandles?.delete(node);
    }
    return hasRegistered;
  };
  for (const node of snapshot.nodes) visit(node, undefined, false, false);
  if (authoredSnapshot) for (const node of authoredSnapshot.nodes) visit(node, undefined, true, false);
  return next;
}

const asVec3 = (value: readonly number[] | undefined): RuntimeNodeVec3 | undefined =>
  Array.isArray(value) && value.length === 3 ? [value[0], value[1], value[2]] : undefined;

/**
 * Declared model-space box for a model node, in `boundsFromAuraAsset` order:
 * manifest `boundsMetadata` min/max, then size+center, then the flat `bounds`
 * size triple (a min-Y-at-zero box per the actor bridge's convention).
 */
const declaredModelBounds = (
  node: { readonly asset?: { readonly bounds?: AuraVec3; readonly metadata?: { readonly boundsMetadata?: { readonly min?: readonly number[]; readonly max?: readonly number[]; readonly size?: readonly number[]; readonly center?: readonly number[] } } } }
): { readonly min: RuntimeNodeVec3; readonly max: RuntimeNodeVec3 } | undefined => {
  const metadata = node.asset?.metadata?.boundsMetadata;
  const metaMin = asVec3(metadata?.min);
  const metaMax = asVec3(metadata?.max);
  if (metaMin && metaMax) return { min: metaMin, max: metaMax };
  const metaSize = asVec3(metadata?.size);
  if (metaSize) {
    const center = asVec3(metadata?.center) ?? [0, metaSize[1] / 2, 0];
    return {
      min: [center[0] - metaSize[0] / 2, center[1] - metaSize[1] / 2, center[2] - metaSize[2] / 2],
      max: [center[0] + metaSize[0] / 2, center[1] + metaSize[1] / 2, center[2] + metaSize[2] / 2]
    };
  }
  const flat = asVec3(node.asset?.bounds);
  return flat ? { min: [-flat[0] / 2, 0, -flat[2] / 2], max: [flat[0] / 2, flat[1], flat[2] / 2] } : undefined;
};

export function createRuntimeNodeHandle(node: MutableAuraRuntimeSceneNode, runtime: AuraRuntimeNodeSpec, onMaterialChange?: (handle: AuraRuntimeNodeHandle) => void, onSceneNodeChange?: (handle: AuraRuntimeNodeHandle) => void): AuraRuntimeNodeHandle {
  const tags = runtime.tags ?? [];
  const attachedEffects: AuraRuntimeNodeEffectAttachment[] = [];
  const morphTargetWeights = new Map<string, number>();
  // SA-05: nodes tagged `aura:morph-unclamped` keep negative/over-1 influences.
  const sanitizeMorphWeight = runtimeMorphWeightSanitizer(tags);
  let animationBinding: AuraRuntimeNodeAnimationBindingMetadata | undefined;
  let animationPose: AnimationPose | undefined;
  // Dense instance store written by `setInstanceMatrices`; `setInstances` clears it so the spec array wins again.
  let denseInstanceMatrices: Float32Array | undefined;
  let denseInstanceRgba: Float32Array | undefined;
  let animationPoseBinding: AuraRuntimeNodeAnimationPoseBindingMetadata | undefined;
  let importedAssetEvidence: AuraRuntimeNodeImportedAssetEvidence | undefined;
  let nodeVersion = 0;
  const bumpVersion = () => { nodeVersion += 1; };
  const setWorldFacingRotation = (value: AuraVec3): boolean => {
    const world = worldFacingPose(handle);
    if (!world) return false;
    if (!value.every(Number.isFinite)) throw new RangeError("Parented rotation must be finite.");
    prepareParentedWorldPose(handle, world.position, eulerToQuaternion(value, "ZYX"))!();
    return true;
  };
  const setWorldFacingScale = (value: number | AuraVec3): boolean => {
    const world = worldFacingPose(handle);
    if (!world) return false;
    const scale = vecScale(value);
    if (!scale.every(Number.isFinite)) throw new RangeError("Parented scale must be finite.");
    prepareParentedWorldPose(handle, world.position, world.quaternion, { scale })!();
    return true;
  };
  const getVisible = () => node.kind === "model" ? node.visible !== false : node.visible !== false;
  const getBounds = () => {
    const queryGeometry = runtimeQueryGeometry.get(handle) ?? (node.kind === "primitive" ? node.geometry : undefined);
    if (queryGeometry) {
      const bounds = runtimeGeometryBounds(handle, node, queryGeometry, denseInstanceMatrices);
      if (bounds) return bounds;
    }
    const parentedWorld = runtimeParentedNodes.has(handle)
      ? decomposeMatrix(parityL7WorldMatrix(handle, new Float32Array(16)))
      : undefined;
    if (node.kind === "model") {
      // The render-input pass pushes the loaded GLB's real world box into the
      // evidence every frame, so it wins over the declared manifest box.
      const evidence = importedAssetEvidence?.bounds;
      if (evidence) return evidence;
      const declared = declaredModelBounds(node);
      if (declared) {
        return calculateRuntimeNodeModelBounds({
          min: declared.min,
          max: declared.max,
          position: parentedWorld?.position ?? node.position,
          scale: parentedWorld?.scale ?? node.scale
        });
      }
    }
    return calculateRuntimeNodeBounds({
      position: parentedWorld?.position ?? node.position,
      scale: parentedWorld?.scale ?? node.scale,
      // L7: `"size" in node` also matches surfaces.mirror's 2-element extent —
      // bounds wants a scalar or vec3: forward both, skip 2-element extents.
      // Model nodes have no `size`; without a resolved model box the unit-cube
      // fallback would under-frame every camera rig that reads subjectHeight.
      size: "size" in node && node.size !== undefined
        ? (typeof node.size === "number" || node.size.length === 3 ? node.size : undefined)
        : undefined
    });
  };
  const handle: AuraRuntimeNodeHandle = {
    id: runtime.id,
    kind: node.kind,
    name: "name" in node ? node.name : undefined,
    tags,
    get version() {
      return nodeVersion;
    },
    get position() {
      return worldFacingPose(handle)?.position ?? node.position ?? [0, 0, 0];
    },
    set position(next) {
      assertNoGeneratedInstanceLightMutation(handle);
      assertWeatherMutation(handle, { position: next });
      if (setWorldFacingPosition(handle, next)) return;
      node.position = next;
      bumpVersion();
      onSceneNodeChange?.(handle);
    },
    get rotation() {
      const world = worldFacingPose(handle);
      return world ? runtimeEulerFromQuaternion(world.quaternion, "ZYX") : node.rotation ?? [0, 0, 0];
    },
    set rotation(next) {
      assertNoGeneratedInstanceLightMutation(handle);
      assertWeatherMutation(handle, { rotation: next });
      if (setWorldFacingRotation(next)) return;
      node.rotation = next;
      if (runtimeParentedNodes.has(handle) || runtimeSubtreeMatches(handle, authoredNodeHasWeather)) node.quaternion = undefined;
      bumpVersion();
      onSceneNodeChange?.(handle);
    },
    get scale() {
      return worldFacingPose(handle)?.scale ?? node.scale ?? 1;
    },
    set scale(next) {
      assertNoGeneratedInstanceLightMutation(handle);
      assertWeatherMutation(handle, { scale: next });
      assertPivotedPhysicsScaleMutation(handle, next);
      if (setWorldFacingScale(next)) return;
      node.scale = next;
      bumpVersion();
      onSceneNodeChange?.(handle);
    },
    get visible() {
      return getVisible();
    },
    set visible(next) {
      assertNoGeneratedInstanceLightMutation(handle);
      const changed = getVisible() !== next;
      node.visible = next;
      bumpVersion();
      if (changed) onSceneNodeChange?.(handle);
    },
    setPosition(x, y, z) {
      assertNoGeneratedInstanceLightMutation(handle);
      assertWeatherMutation(handle, { position: [x, y, z] });
      if (setWorldFacingPosition(handle, [x, y, z])) return this;
      node.position = [x, y, z];
      bumpVersion();
      onSceneNodeChange?.(handle);
      return this;
    },
    translate(x, y, z) {
      assertNoGeneratedInstanceLightMutation(handle);
      const current = this.position;
      assertWeatherMutation(handle, { position: [current[0] + x, current[1] + y, current[2] + z] });
      if (setWorldFacingPosition(handle, [current[0] + x, current[1] + y, current[2] + z])) return this;
      node.position = [current[0] + x, current[1] + y, current[2] + z];
      bumpVersion();
      onSceneNodeChange?.(handle);
      return this;
    },
    setRotation(x, y, z) {
      assertNoGeneratedInstanceLightMutation(handle);
      assertWeatherMutation(handle, { rotation: [x, y, z] });
      if (setWorldFacingRotation([x, y, z])) return this;
      node.rotation = [x, y, z];
      if (runtimeParentedNodes.has(handle) || runtimeSubtreeMatches(handle, authoredNodeHasWeather)) node.quaternion = undefined;
      bumpVersion();
      onSceneNodeChange?.(handle);
      return this;
    },
    setScale(scale) {
      assertNoGeneratedInstanceLightMutation(handle);
      assertWeatherMutation(handle, { scale });
      assertPivotedPhysicsScaleMutation(handle, scale);
      if (setWorldFacingScale(scale)) return this;
      node.scale = scale;
      bumpVersion();
      onSceneNodeChange?.(handle);
      return this;
    },
    get pivot() {
      return [...(runtimeParentedNodes.get(handle)?.localNode.pivot ?? node.pivot ?? [0, 0, 0])] as AuraVec3;
    },
    setPivot(x: number, y: number, z: number) {
      assertNoGeneratedInstanceLightMutation(handle);
      assertRuntimePivotMutation(handle, [x, y, z]);
      const target = runtimeParentedNodes.get(handle)?.localNode ?? node;
      target.pivot = [x, y, z];
      bumpVersion();
      onSceneNodeChange?.(handle);
      return this;
    },
    setTransform(transform: { readonly position?: AuraVec3; readonly rotation?: AuraVec3; readonly scale?: number | AuraVec3; readonly pivot?: AuraVec3 }) {
      assertNoGeneratedInstanceLightMutation(handle);
      const vector = (value: AuraVec3 | undefined, label: string): AuraVec3 | undefined => {
        if (value === undefined) return undefined;
        if (value.length !== 3 || !value.every(Number.isFinite)) throw new RangeError(`Aura3D ${label} must be a finite vec3.`);
        return [...value] as AuraVec3;
      };
      const position = vector(transform.position, "position");
      const rotation = vector(transform.rotation, "rotation");
      const pivot = vector(transform.pivot, "pivot");
      const scale = typeof transform.scale === "number"
        ? (Number.isFinite(transform.scale) ? transform.scale : (() => { throw new RangeError("Aura3D scale must be finite."); })())
        : vector(transform.scale, "scale");
      assertWeatherMutation(handle, { position, rotation, scale });
      if (pivot) assertRuntimePivotMutation(handle, pivot);
      if (scale !== undefined) assertPivotedPhysicsScaleMutation(handle, scale);
      const parented = runtimeParentedNodes.get(handle);
      if (parented?.worldFacing) {
        const previousPivot = parented.localNode.pivot;
        if (pivot) parented.localNode.pivot = pivot;
        try {
          if (rotation || scale !== undefined) {
            const current = worldFacingPose(handle)!;
            prepareParentedWorldPose(handle, position ?? current.position,
              rotation ? eulerToQuaternion(rotation, "ZYX") : current.quaternion,
              { scale: scale === undefined ? current.scale : vecScale(scale) })!();
          } else if (position) {
            setWorldFacingPosition(handle, position);
          } else {
            bumpVersion();
            onSceneNodeChange?.(handle);
          }
        } catch (error) {
          parented.localNode.pivot = previousPivot;
          throw error;
        }
        return this;
      }
      if (position) node.position = position;
      if (rotation) { node.rotation = rotation; if (parented || runtimeSubtreeMatches(handle, authoredNodeHasWeather)) node.quaternion = undefined; }
      if (pivot) node.pivot = pivot;
      if (scale !== undefined) node.scale = scale;
      bumpVersion();
      onSceneNodeChange?.(handle);
      return this;
    },
    setVisible(visible) {
      assertNoGeneratedInstanceLightMutation(handle);
      const changed = getVisible() !== visible;
      node.visible = visible;
      bumpVersion();
      if (changed) onSceneNodeChange?.(handle);
      return this;
    },
    setMaterial(nextMaterial) {
      assertDepthPreviewTarget(node.kind, nextMaterial);
      if (node.kind === "primitive" && node.text3D?.backend === "sdf") assertSdfTextMaterialSupported(nextMaterial);
      node.material = nextMaterial;
      bumpVersion();
      materialRevisions.set(handle, runtimeMaterialRevision(handle) + 1);
      onMaterialChange?.(handle);
      return this;
    },
    setInstances(transforms: readonly import("../nodes/types.js").AuraTransformSpec[], colors?: readonly import("../nodes/types.js").AuraColor[]) {
      assertMutableInstanceBuffer(handle);
      const next = transforms.map((transform) => {
        assertValidPivot(transform.pivot);
        if ((node.kind === "primitive" || node.kind === "model") && node.physics &&
            (hasNonzeroPivot(node.pivot) || hasNonzeroPivot(transform.pivot))) {
          throw new RangeError("PIVOT_PHYSICS_UNSUPPORTED: pivoted instances require a separate collider contract.");
        }
        return copyLocalTransform(transform);
      });
      const pivoted = runtimeChainHasPivot(handle) || next.some((transform) => hasNonzeroPivot(transform.pivot));
      if (pivoted && (runtimeChainHasLookAt(handle) || next.some((transform) => transform.lookAt !== undefined))) {
        throw new RangeError("INSTANCE_PIVOT_LOOK_AT_UNSUPPORTED: pivoted instances cannot use lookAt.");
      }
      if ((node.kind === "primitive" || node.kind === "model") && node.physics && hasNonzeroPivot(node.pivot)) {
        throw new RangeError("PIVOT_PHYSICS_UNSUPPORTED: pivoted instances require a separate collider contract.");
      }
      node.instances = next;
      node.instanceColors = colors ? [...colors] : undefined;
      denseInstanceMatrices = undefined;
      denseInstanceRgba = undefined;
      bumpVersion();
      onSceneNodeChange?.(handle);
      return this;
    },
    setInstanceMatrices(matrices: Float32Array, count: number, rgba?: Float32Array) {
      assertMutableInstanceBuffer(handle);
      const capacity = (node as { instances?: readonly unknown[] }).instances?.length ?? 0;
      if (capacity === 0) {
        throw new Error(`INSTANCE_NODE_REQUIRED: node "${runtime.id}" is not an instanced node (created by instances.*).`);
      }
      if (!Number.isInteger(count) || count < 0 || count > capacity) {
        throw new RangeError(`INSTANCE_CAPACITY_EXCEEDED: count ${count} exceeds capacity ${capacity} (or is not a valid count).`);
      }
      if (matrices.length < 16 * count) {
        throw new RangeError(`setInstanceTransforms expects matrices.length >= ${16 * count}, got ${matrices.length}.`);
      }
      if (rgba !== undefined && rgba.length < 4 * count) {
        throw new RangeError(`setInstanceTransforms expects colors with 4 values per instance (rgba), got ${rgba.length} for ${count} instances.`);
      }
      if (denseInstanceMatrices === undefined || denseInstanceMatrices.length !== count * 16) denseInstanceMatrices = new Float32Array(count * 16);
      denseInstanceMatrices.set(matrices.subarray(0, count * 16));
      if (rgba !== undefined) {
        if (denseInstanceRgba === undefined || denseInstanceRgba.length !== count * 4) denseInstanceRgba = new Float32Array(count * 4);
        denseInstanceRgba.set(rgba.subarray(0, count * 4));
      } else if (denseInstanceRgba !== undefined && denseInstanceRgba.length !== count * 4) {
        denseInstanceRgba = undefined;
      }
      bumpVersion();
      onSceneNodeChange?.(handle);
      return this;
    },
    play(clip, options = {}) {
      assertNoGeneratedInstanceLightMutation(handle);
      node.animation = { ...options, clip };
      bumpVersion();
      return this;
    },
    setAnimation(animation) {
      assertNoGeneratedInstanceLightMutation(handle);
      node.animation = animation;
      bumpVersion();
      return this;
    },
    setAnimationBinding(binding) {
      animationBinding = binding;
      return this;
    },
    setAnimationPose(pose, metadata) {
      animationPose = pose ? cloneRuntimeAnimationPose(pose) : undefined;
      animationPoseBinding = pose ? metadata : undefined;
      bumpVersion();
      if (pose?.morphTargets) {
        for (const [name, weight] of Object.entries(pose.morphTargets)) {
          const normalizedName = name.trim();
          if (normalizedName) {
            morphTargetWeights.set(normalizedName, sanitizeMorphWeight(weight));
          }
        }
      }
      return this;
    },
    animationPose() {
      return animationPose ? cloneRuntimeAnimationPose(animationPose) : undefined;
    },
    setImportedAssetEvidence(evidence) {
      importedAssetEvidence = evidence ? cloneRuntimeImportedAssetEvidence(evidence) : undefined;
      bumpVersion();
      return this;
    },
    importedAssetEvidence() {
      return importedAssetEvidence ? cloneRuntimeImportedAssetEvidence(importedAssetEvidence) : undefined;
    },
    setMorphTarget(name, weight) {
      const normalizedName = name.trim();
      if (!normalizedName) {
        throw new AuraRuntimeError("missing-asset", "Aura3D morph target name is required.");
      }
      morphTargetWeights.set(normalizedName, sanitizeMorphWeight(weight));
      bumpVersion();
      return this;
    },
    setMorphTargets(weights) {
      morphTargetWeights.clear();
      bumpVersion();
      for (const [name, weight] of Object.entries(weights)) {
        const normalizedName = name.trim();
        if (normalizedName) {
          morphTargetWeights.set(normalizedName, sanitizeMorphWeight(weight));
        }
      }
      return this;
    },
    morphTargets() {
      return Object.fromEntries(morphTargetWeights.entries());
    },
    morphInfluence(name: string, weight?: number) {
      const normalizedName = name.trim();
      if (!normalizedName) {
        throw new AuraRuntimeError("missing-asset", "Aura3D morph target name is required.");
      }
      if (weight === undefined) {
        return morphTargetWeights.get(normalizedName) ?? 0;
      }
      morphTargetWeights.set(normalizedName, sanitizeMorphWeight(weight));
      bumpVersion();
      return this;
    },
    // region parity:L1 — SH-02 `setUniform(name, value)`: write into the
    // material's uniform block without recompiling (frozen in
    // nodes/types/runtime.ts; owner lane L1, do not edit outside this region).
    // The write is staged in `customMaterial.ts`'s per-runtime store; the
    // production compiler applies it to the live `PortableShaderMaterial` each
    // frame via `Material.setParameter` — the shader key never changes, so no
    // program is recompiled (program count stays flat across updates).
    setUniform(name: string, value: AuraUniformValue): AuraRuntimeNodeHandle {
      // A GLB model node has no authored custom material to write into. Ports used to wrap every call in try/catch;
      // it is now a documented, once-per-uniform diagnostic no-op (a model with `material: material.custom(...)` still writes).
      if (node.kind === "model" && (("material" in node ? (node.material as { readonly kind?: string } | undefined) : undefined)?.kind !== "custom")) {
        warnModelSetUniformNoop(name);
        return this;
      }
      assertCustomUniformWrite(("material" in node ? node.material : undefined) as { readonly kind?: string; readonly custom?: AuraCustomMaterialSpec } | undefined, name, value);
      recordCustomUniformWrite(runtime.id, name, value);
      bumpVersion();
      return this;
    },
    // endregion parity:L1
    // region parity:L2 — SG-05 `setGeometry(spec)` / `updateAttribute(name,
    // update)`: per-frame partial upload, no realloc when vertex count is
    // unchanged (owner lane L2, do not edit outside this region).
    //
    // Sync channel: the normalized spec + queued attribute writes live on the
    // handle as `__parityL2*` members; `resolveProductionPrimitiveRuntimeState`
    // (compiler/primitives.ts) reads + drains them each frame, then
    // `selectProductionPrimitiveResource` writes into the live VertexBuffer —
    // same vertex count ⇒ dirty-range upload only, no GPU realloc.
    setGeometry(spec: import("../nodes/types.js").AuraDynamicGeometrySpec): AuraRuntimeNodeHandle {
      if (!spec || spec.positions === undefined || (spec.positions.length === 0 && node.kind !== "line")) {
        throw new AuraRuntimeError("missing-asset", "Aura3D setGeometry requires a non-empty positions array.");
      }
      // Stored as a dynamic custom-geometry spec; flat/tuple/typed attributes
      // normalize at the compiler sync point (normalizeGeometryAttributes).
      const normalized = {
        kind: "aura-custom-geometry",
        dynamic: true,
        ...spec
      } as import("../RootGeometry.js").AuraCustomGeometrySpec;
      (node as { geometry?: import("../RootGeometry.js").AuraCustomGeometrySpec }).geometry = normalized;
      (this as unknown as { __parityL2Geometry?: import("../RootGeometry.js").AuraCustomGeometrySpec }).__parityL2Geometry = normalized;
      (this as unknown as { __parityL2AttributeUpdates?: unknown[] }).__parityL2AttributeUpdates = [];
      runtimeQueryGeometry.set(this, normalized);
      bumpVersion();
      return this;
    },
    setText(text: string): AuraRuntimeNodeHandle {
      if (typeof text !== "string") throw new TypeError("Aura3D setText requires a string.");
      const current = (this as AuraRuntimeNodeHandle & { __auraText3D?: import("../nodes/types.js").AuraPrimitiveNode["text3D"] }).__auraText3D
        ?? (node.kind === "primitive" ? node.text3D : undefined);
      if (!current) throw new Error("Aura3D setText requires a font-backed world text node.");
      const next = reshapeWorldTextDescriptor(current, text);
      (this as AuraRuntimeNodeHandle & { __auraText3D?: typeof next }).__auraText3D = next;
      bumpVersion();
      return this;
    },
    updateAttribute(name: string, update: import("../nodes/types.js").AuraAttributeUpdate): AuraRuntimeNodeHandle {
      assertNoPivotedPhysicsPositionUpdate(handle, name);
      if (typeof name !== "string" || name.trim().length === 0) {
        throw new AuraRuntimeError("missing-asset", "Aura3D updateAttribute requires an attribute name.");
      }
      if (!update || update.array === undefined || update.array.length === 0) {
        throw new AuraRuntimeError("missing-asset", `Aura3D updateAttribute("${name}") requires a non-empty array.`);
      }
      const raw = update.array;
      const offset = update.offset ?? 0;
      if (!Number.isInteger(offset) || offset < 0) throw new RangeError("Aura3D attribute update offset must be a non-negative integer vertex index.");
      if (__FIX() & 1) { for (let i = 0; i < raw.length; i += 1) if (!Number.isFinite(raw[i]!)) throw new RangeError(`Aura3D attribute "${name}" update must contain finite values.`); }
      else if (!Array.from(raw).every(Number.isFinite)) throw new RangeError(`Aura3D attribute "${name}" update must contain finite values.`);
      const querySpec = runtimeQueryGeometry.get(this) ?? queryGeometryForUpdate(node);
      if (querySpec && !(__FIX() & 2)) runtimeQueryGeometry.set(this, updatedQueryGeometry(querySpec, name, { array: raw, offset }, node.kind === "line"));
      // Copy the input: mutation by a caller after the update must not race the next frame.
      const array = Array.isArray(raw) ? Float32Array.from(raw) : raw.slice();
      const pending = { name, array, offset };
      const self = this as unknown as {
        __parityL2AttributeUpdates?: { name: string; array: typeof array; offset: number }[];
      };
      (self.__parityL2AttributeUpdates ??= []).push(pending);
      bumpVersion();
      return this;
    },
    // endregion parity:L2
    // region parity:L7 — SG-09/SR-04 transform/graph members: `renderOrder`,
    // `frustumCulled`, `layers` (AuraLayerMask), `userData`, `traverse`,
    // `getWorldPosition/Quaternion/Scale`, `attach`, `morphTargetDictionary`
    // (SA-05, lane L8) (owner lane L7, do not edit outside this region).
    get renderOrder() {
      // three.js Object3D.renderOrder defaults to 0; unset spec stays undefined internally.
      return node.renderOrder ?? 0;
    },
    set renderOrder(next: number) {
      node.renderOrder = next;
      bumpVersion();
    },
    get frustumCulled() {
      // three.js Object3D.frustumCulled defaults to true.
      return node.frustumCulled ?? true;
    },
    set frustumCulled(next: boolean) {
      node.frustumCulled = next;
      bumpVersion();
    },
    get layers(): AuraLayerMask {
      const holder = node as { layers?: number };
      const mask: AuraLayerMask = {
        get mask() { return holder.layers ?? 1; },
        set mask(v: number) { holder.layers = v >>> 0; bumpVersion(); },
        set(channel: number) {
          if (!parityL7ValidChannel(channel)) return;
          this.mask = 1 << channel;
        },
        enable(channel: number) {
          if (!parityL7ValidChannel(channel)) return;
          this.mask = this.mask | (1 << channel);
        },
        enableAll() { this.mask = 0xffffffff; },
        disable(channel: number) {
          if (!parityL7ValidChannel(channel)) return;
          this.mask = this.mask & ~(1 << channel);
        },
        disableAll() { this.mask = 0; },
        toggle(channel: number) {
          if (!parityL7ValidChannel(channel)) return;
          this.mask = this.mask ^ (1 << channel);
        },
        test(layers: AuraLayerMask | { mask: number }) { return (this.mask & layers.mask) !== 0; },
        isEnabled(channel: number) {
          return parityL7ValidChannel(channel) && (this.mask & (1 << channel)) !== 0;
        }
      };
      return mask;
    },
    get userData() {
      if (!node.userData) node.userData = {};
      return node.userData;
    },
    traverse(callback) {
      const visit = (handle: AuraRuntimeNodeHandle): boolean => {
        if (callback(handle) === false) return false;
        const children = parityL7Children.get(handle);
        if (children) {
          for (const child of children) {
            if (!visit(child)) return false;
          }
        }
        const spec = parityL7NodeSpecs.get(handle);
        if (spec && spec.kind === "group") {
          let index = 0;
          for (const childSpec of spec.children) {
            index += 1;
            if ([...(children ?? [])].some((child) => (runtimeParentedNodes.get(child)?.source ?? parityL7NodeSpecs.get(child)) === childSpec)) continue;
            const childRuntime = "runtime" in childSpec ? childSpec.runtime : undefined;
            const childHandle = createRuntimeNodeHandle(
              childSpec as MutableAuraRuntimeSceneNode,
              childRuntime ?? { id: `${runtime.id}/child-${index}` },
              onMaterialChange ? (child) => {
                if (!disposedQueryHandles.has(handle)) onMaterialChange(childRuntime?.id ? child : handle);
              } : undefined,
              onSceneNodeChange ? (child) => {
                if (!disposedQueryHandles.has(handle)) onSceneNodeChange(childRuntime?.id ? child : handle);
              } : undefined
            );
            if (!visit(childHandle)) return false;
          }
        }
        return true;
      };
      visit(this);
    },
    getWorldPosition() {
      const t = decomposeMatrix(parityL7WorldMatrix(this, new Float32Array(16)));
      return [...t.position] as AuraVec3;
    },
    getWorldQuaternion() {
      return decomposeMatrix(parityL7WorldMatrix(this, new Float32Array(16))).quaternion;
    },
    getWorldScale() {
      const t = decomposeMatrix(parityL7WorldMatrix(this, new Float32Array(16)));
      return [...t.scale] as AuraVec3;
    },
    attach(child) {
      assertNoGeneratedInstanceLightMutation(child);
      const priorState = runtimeParentedNodes.get(child);
      const childSpec = priorState?.localNode ?? parityL7NodeSpecs.get(child);
      if (!childSpec) {
        throw new AuraRuntimeError(
          "missing-asset",
          "Aura3D attach() expects a runtime node handle created by this registry."
        );
      }
      if (child === this) {
        throw new AuraRuntimeError("missing-asset", "Aura3D attach() cannot attach a node to itself.");
      }
      for (let ancestor: AuraRuntimeNodeHandle | undefined = this; ancestor; ancestor = parityL7Parents.get(ancestor)) {
        if (ancestor === child) throw new Error("PARENTED_TRANSFORM_CYCLE: cannot attach an ancestor beneath its descendant.");
      }
      const childHasPivot = runtimeSubtreeMatches(child, authoredSubtreeHasPivot);
      const parentHasPivot = runtimeChainHasPivot(this);
      const childHasWeather = runtimeSubtreeMatches(child, authoredNodeHasWeather);
      if (childHasWeather) {
        assertWeatherRuntimeChain(this);
        assertWeatherRuntimeChain(child);
      }
      if (runtimeSubtreeHasPhysics(child) && (childHasPivot || parentHasPivot)) {
        throw new RangeError("PIVOT_PHYSICS_UNSUPPORTED: attaching physics beneath a pivot requires rebuilding its collider and mapping.");
      }
      if ((childHasPivot || parentHasPivot) &&
          (runtimeChainHasLookAt(this) || runtimeSubtreeMatches(child, authoredSubtreeHasLookAt))) {
        throw new RangeError("PIVOT_LOOK_AT_UNSUPPORTED: pivoted look-at hierarchies are not supported.");
      }
      // three's Object3D.attach: re-parent while preserving the child's world
      // transform — local = inverse(parentWorld) * childWorld.
      const parentWorld = parityL7WorldMatrix(this, new Float32Array(16));
      const invParent = runtimeHierarchyEnabled.has(child) ? inverseParentMatrix(parentWorld, false) : parityL7InvertMat4(parentWorld, new Float32Array(16));
      const childWorld = parityL7WorldMatrix(child, new Float32Array(16));
      const local = new Float32Array(16);
      multiplyMat4Into(local, invParent, childWorld);
      if (childHasWeather) rigidWeatherMatrix(local);
      const t = decomposeMatrix(local);
      if (runtimeHierarchyEnabled.has(child) && (t.sheared || t.scale.some((value) => !Number.isFinite(value) || value === 0))) {
        throw new RangeError("PARENTED_TRANSFORM_UNSUPPORTED: attached pose cannot be represented by local TRS.");
      }
      const pivot = childSpec.pivot ?? [0, 0, 0];
      childSpec.position = runtimeHierarchyEnabled.has(child) || childHasWeather
        ? [t.position[0] - pivot[0] + local[0]! * pivot[0] + local[4]! * pivot[1] + local[8]! * pivot[2], t.position[1] - pivot[1] + local[1]! * pivot[0] + local[5]! * pivot[1] + local[9]! * pivot[2], t.position[2] - pivot[2] + local[2]! * pivot[0] + local[6]! * pivot[1] + local[10]! * pivot[2]]
        : [...t.position] as AuraVec3;
      childSpec.quaternion = [...t.quaternion] as AuraQuat;
      if (runtimeHierarchyEnabled.has(child) || childHasWeather) childSpec.rotation = runtimeEulerFromQuaternion(t.quaternion, childSpec.rotationOrder ?? "ZYX");
      childSpec.scale = [...t.scale] as AuraVec3;
      const previousParent = parityL7Parents.get(child);
      if (previousParent) parityL7Children.get(previousParent)?.delete(child);
      parityL7Parents.set(child, this);
      let children = parityL7Children.get(this);
      if (!children) {
        children = new Set();
        parityL7Children.set(this, children);
      }
      children.add(child);
      if (!priorState && runtimeHierarchyEnabled.has(child)) enableRuntimeParentedNode(child, false);
      // One attach is one committed scene change: bump the child version here, notify once below.
      if (runtimeHierarchyEnabled.has(child)) runtimeNodeVersionBump.get(child)?.();
      bumpVersion();
      onSceneNodeChange?.(handle);
      return this;
    },
    // endregion parity:L7
    /**
     * SA-05 (lane L8): three's `morphTargetDictionary` — morph-target name →
     * index into the node's influence array. Names come from the imported
     * asset's morph evidence (mesh order); before evidence attaches, the
     * dictionary reports the weight map's insertion order so early writes stay
     * addressable.
     */
    morphTargetDictionary() {
      const dictionary: Record<string, number> = {};
      const evidenceTargets = importedAssetEvidence?.morphTargets;
      if (evidenceTargets && evidenceTargets.length > 0) {
        evidenceTargets.forEach((name, index) => {
          if (dictionary[name] === undefined) {
            dictionary[name] = index;
          }
        });
      } else {
        let index = 0;
        for (const name of morphTargetWeights.keys()) {
          if (dictionary[name] === undefined) {
            dictionary[name] = index;
          }
          index++;
        }
      }
      return dictionary;
    },
    bounds() {
      return getBounds();
    },
    attachEffect(effect) {
      attachedEffects.push(effect);
      bumpVersion();
      return this;
    },
    effects() {
      return [...attachedEffects];
    },
    snapshot() {
      return {
        id: runtime.id,
        kind: node.kind,
        name: "name" in node ? node.name : undefined,
        tags,
        position: handle.position,
        pivot: handle.pivot,
        rotation: handle.rotation,
        scale: handle.scale,
        visible: getVisible(),
        animation: node.animation,
        ...("material" in node && node.material ? { material: node.material } : {}),
        ...(node.instances ? { instances: node.instances } : {}),
        ...(node.instanceColors ? { instanceColors: node.instanceColors } : {}),
        ...(denseInstanceMatrices ? { instanceMatrices: denseInstanceMatrices } : {}),
        ...(denseInstanceRgba ? { instanceRgba: denseInstanceRgba } : {}),
        animationBinding,
        animationPose: animationPose ? cloneRuntimeAnimationPose(animationPose) : undefined,
        animationPoseBinding,
        importedAssetEvidence: importedAssetEvidence ? cloneRuntimeImportedAssetEvidence(importedAssetEvidence) : undefined,
        morphTargets: Object.fromEntries(morphTargetWeights.entries()),
        bounds: getBounds(),
        effects: [...attachedEffects]
      };
    }
  };
  parityL7NodeSpecs.set(handle, node);
  runtimeNodeChanged.set(handle, () => { bumpVersion(); onSceneNodeChange?.(handle); });
  runtimeNodeVersionBump.set(handle, bumpVersion);
  return handle;
}


const modelSetUniformWarned = new Set<string>();
function warnModelSetUniformNoop(name: string): void {
  if (modelSetUniformWarned.has(name)) return;
  modelSetUniformWarned.add(name);
  if (typeof console !== "undefined") {
    console.warn(`[MODEL_SETUNIFORM_NOOP] setUniform("${name}") on a model node is ignored: the GLB keeps its own materials. Give the model options.material = material.custom(spec) to drive uniforms.`);
  }
}
