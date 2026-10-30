// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAnimationSpec, AuraApp, AuraCustomMaterialSpec, AuraLayerMask, AuraMaterialSpec, AuraRuntimeNodeHandle, AuraRuntimeNodeImportedAssetEvidence, AuraRuntimeNodeRegistry, AuraRuntimeNodeSpec, AuraSceneNode, AuraSceneSnapshot, AuraUniformValue, AuraVec3 } from "../nodes/types.js";
import { decomposeMatrix, identityMat4Into, localMatrixOf, multiplyMat4Into } from "../sceneGraph.js";
import type { AuraQuat } from "../../contracts/sceneGraph.js";
import type { AuraNodeBuilder } from "../nodes/builder.js";
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
}

interface AttachedCompiledScene {
  addSubtree(node: AuraSceneNode, parentId?: string): void;
  removeSubtree(runtimeId: string): boolean;
}

const asAttachable = (scene: CompiledScene): AttachedCompiledScene | undefined => {
  const internals = asRuntimeCompiled(scene);
  return internals ? (internals as unknown as AttachedCompiledScene) : undefined;
};

const isBuilder = (value: AuraSceneNode | AuraNodeBuilder<AuraSceneNode>): value is AuraNodeBuilder<AuraSceneNode> =>
  typeof (value as AuraNodeBuilder<AuraSceneNode>).toJSON === "function" && !("kind" in value);

const removeRuntimeNodeById = (nodes: readonly AuraSceneNode[], runtimeId: string): { nodes: AuraSceneNode[]; removed: boolean } => {
  let removed = false;
  const next: AuraSceneNode[] = [];
  for (const node of nodes) {
    const runtime = "runtime" in node ? node.runtime : undefined;
    if (runtime?.id === runtimeId) {
      removed = true;
      continue;
    }
    if (node.kind === "group") {
      const inner = removeRuntimeNodeById(node.children, runtimeId);
      if (inner.removed) {
        removed = true;
        next.push({ ...node, children: inner.nodes });
        continue;
      }
    }
    next.push(node);
  }
  return { nodes: next, removed };
};

/** Insert `node` as the last child of the group whose runtime id is `parentId`; top level when no such group exists. */
const insertRuntimeNode = (nodes: readonly AuraSceneNode[], node: AuraSceneNode, parentId: string | undefined): AuraSceneNode[] => {
  if (parentId !== undefined) {
    let placed = false;
    const visit = (list: readonly AuraSceneNode[]): AuraSceneNode[] => list.map((entry) => {
      if (placed || entry.kind !== "group") return entry;
      if (entry.runtime?.id === parentId) {
        placed = true;
        return { ...entry, children: [...entry.children, node] };
      }
      const children = visit(entry.children);
      return placed ? { ...entry, children } : entry;
    });
    const next = visit(nodes);
    if (placed) return next;
  }
  return [...nodes, node];
};

export function createAuraRuntimeNodeRegistry(snapshot: AuraSceneSnapshot, deps: AuraRuntimeNodeRegistryDeps = {}): MutableAuraRuntimeNodeRegistry {
  let handles = new Map<string, AuraRuntimeNodeHandle>();
  let registryVersion = 0;
  let autoId = 0;
  let compiled: AttachedCompiledScene | undefined;
  let flags = deps.flags ?? resolveQrFlags({});
  let app = deps.app;
  let getScene = deps.getScene;
  let setScene = deps.setScene;
  let diagnostic = deps.diagnostic;
  const compilerFlagOn = () => flags.on("A3D_QR_COMPILER");
  /*
   * RP-03: nodes added through the compiled subtree path live only in the compiled scene, not in the app snapshot. They are kept
   * here so a remount (to take the HDR target, see `add`) carries them over instead of dropping them. Cleared on `reset`.
   */
  let compiledAdds: { readonly id: string; readonly node: AuraSceneNode; readonly parent?: string }[] = [];
  /** Mounted (snapshot) node ids removed through the compiled subtree path; a remount must not bring them back. */
  let compiledRemovals = new Set<string>();
  const sceneWithCompiledAdds = (scene: AuraSceneSnapshot): AuraSceneSnapshot => {
    let nodes: AuraSceneNode[] = [...scene.nodes];
    for (const id of compiledRemovals) nodes = removeRuntimeNodeById(nodes, id).nodes;
    for (const entry of compiledAdds) nodes = insertRuntimeNode(nodes, entry.node, entry.parent);
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
    add(nodeOrBuilder, options = {}) {
      const raw = isBuilder(nodeOrBuilder) ? nodeOrBuilder.toJSON() : nodeOrBuilder;
      const runtime = "runtime" in raw ? raw.runtime : undefined;
      const id = runtime?.id ?? `runtime-add-${++autoId}`;
      const node = (
        runtime?.id ? raw : { ...raw, runtime: { ...(runtime ?? {}), id } }
      ) as AuraSceneNode & { runtime: AuraRuntimeNodeSpec };
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
        if (remounted) return applyHandleExtensions(remounted);
        const handle = applyHandleExtensions(createRuntimeNodeHandle(node as MutableAuraRuntimeSceneNode, node.runtime));
        handles.set(id, handle);
        return handle;
      }
      if (compiled && compilerFlagOn()) {
        compiled.addSubtree(node, options.parent);
        compiledAdds.push({ id, node, ...(options.parent === undefined ? {} : { parent: options.parent }) });
        const handle = applyHandleExtensions(createRuntimeNodeHandle(node as MutableAuraRuntimeSceneNode, node.runtime));
        handles.set(id, handle);
        return handle;
      }
      // Legacy seam (C-37 PR 0b-1): append to the snapshot and remount.
      if (scene && setScene) {
        diagnostic?.(`RUNTIME_ADD_REMOUNT: runtime node "${id}" appended and remounted (enable A3D_QR_COMPILER for subtree compile)`);
        setScene({ ...scene, nodes: [...scene.nodes, node] });
        const handle = handles.get(id);
        if (handle) return applyHandleExtensions(handle);
      } else {
        diagnostic?.(`RUNTIME_ADD_REMOUNT: runtime node "${id}" registered without a live scene remount`);
        const handle = applyHandleExtensions(createRuntimeNodeHandle(node as MutableAuraRuntimeSceneNode, node.runtime));
        handles.set(id, handle);
        return handle;
      }
      const handle = applyHandleExtensions(createRuntimeNodeHandle(node as MutableAuraRuntimeSceneNode, node.runtime));
      handles.set(id, handle);
      return handle;
    },
    remove(idOrHandle) {
      const id = typeof idOrHandle === "string" ? idOrHandle : idOrHandle.id;
      if (!handles.has(id)) {
        // A mounted group or look has no handle (the app flattens it away), but the compiled scene keeps its children by its id.
        if (compiled && compilerFlagOn() && compiled.removeSubtree(id)) {
          registryVersion += 1;
          compiledRemovals.add(id);
          return true;
        }
        return false;
      }
      registryVersion += 1;
      handles.delete(id);
      if (compiled && compilerFlagOn()) {
        compiled.removeSubtree(id);
        const wasAdded = compiledAdds.some((entry) => entry.id === id);
        compiledAdds = compiledAdds.filter((entry) => entry.id !== id);
        if (!wasAdded) compiledRemovals.add(id);
        return true;
      }
      const scene = getScene?.();
      if (scene && setScene) {
        const result = removeRuntimeNodeById(scene.nodes, id);
        diagnostic?.(`RUNTIME_ADD_REMOUNT: runtime node "${id}" removed via remount (enable A3D_QR_COMPILER for subtree dispose)`);
        setScene({ ...scene, nodes: result.nodes });
      }
      return true;
    },
    configure(nextDeps) {
      flags = nextDeps.flags ?? flags;
      app = nextDeps.app ?? app;
      getScene = nextDeps.getScene ?? getScene;
      setScene = nextDeps.setScene ?? setScene;
      diagnostic = nextDeps.diagnostic ?? diagnostic;
    },
    attachCompiled(scene) {
      compiled = asAttachable(scene);
    },
    detachCompiled() {
      compiled = undefined;
    },
    sceneWithRuntimeAdditions() {
      const scene = getScene?.();
      return scene ? sceneWithCompiledAdds(scene) : undefined;
    },
    reset(nextSnapshot) {
      compiledAdds = [];
      compiledRemovals = new Set();
      handles = collectRuntimeNodeHandles(nextSnapshot);
      registryVersion += 1;
    }
  };
  registry.reset(snapshot);
  return registry;
}

export type MutableAuraRuntimeSceneNode = AuraSceneNode & {
  position?: AuraVec3;
  rotation?: AuraVec3;
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

const parityL7WorldMatrix = (handle: AuraRuntimeNodeHandle, out: Float32Array): Float32Array => {
  const node = parityL7NodeSpecs.get(handle);
  if (!node) return identityMat4Into(out);
  const local = localMatrixOf(node, new Float32Array(16));
  const parent = parityL7Parents.get(handle);
  if (!parent) {
    out.set(local);
    return out;
  }
  const parentWorld = parityL7WorldMatrix(parent, new Float32Array(16));
  multiplyMat4Into(out, parentWorld, local);
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
  add(node: AuraSceneNode | AuraNodeBuilder<AuraSceneNode>, options?: { readonly parent?: string }): AuraRuntimeNodeHandle;
  remove(idOrHandle: string | AuraRuntimeNodeHandle): boolean;
  configure(deps: AuraRuntimeNodeRegistryDeps): void;
  /** Binds the mounted C-36 compiled scene so add/remove can take the subtree path. */
  attachCompiled(scene: CompiledScene): void;
  detachCompiled(scene: CompiledScene): void;
  reset(snapshot: AuraSceneSnapshot): void;
  /** The live scene plus nodes added through the compiled subtree path (RP-03), for a remount that must keep them. */
  sceneWithRuntimeAdditions(): AuraSceneSnapshot | undefined;
}

export function collectRuntimeNodeHandles(snapshot: AuraSceneSnapshot): Map<string, AuraRuntimeNodeHandle> {
  const next = new Map<string, AuraRuntimeNodeHandle>();
  for (const node of snapshot.nodes) {
    const runtime = "runtime" in node ? node.runtime : undefined;
    if (!runtime?.id) continue;
    next.set(runtime.id, createRuntimeNodeHandle(node as MutableAuraRuntimeSceneNode, runtime));
  }
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

export function createRuntimeNodeHandle(node: MutableAuraRuntimeSceneNode, runtime: AuraRuntimeNodeSpec): AuraRuntimeNodeHandle {
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
  const getVisible = () => node.kind === "model" ? node.visible !== false : node.visible !== false;
  const getBounds = () => {
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
          position: node.position,
          scale: node.scale
        });
      }
    }
    return calculateRuntimeNodeBounds({
      position: node.position,
      scale: node.scale,
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
      return node.position ?? [0, 0, 0];
    },
    set position(next) {
      node.position = next;
      bumpVersion();
    },
    get rotation() {
      return node.rotation ?? [0, 0, 0];
    },
    set rotation(next) {
      node.rotation = next;
      bumpVersion();
    },
    get scale() {
      return node.scale ?? 1;
    },
    set scale(next) {
      node.scale = next;
      bumpVersion();
    },
    get visible() {
      return getVisible();
    },
    set visible(next) {
      node.visible = next;
      bumpVersion();
    },
    setPosition(x, y, z) {
      node.position = [x, y, z];
      bumpVersion();
      return this;
    },
    translate(x, y, z) {
      const current = node.position ?? [0, 0, 0];
      node.position = [current[0] + x, current[1] + y, current[2] + z];
      bumpVersion();
      return this;
    },
    setRotation(x, y, z) {
      node.rotation = [x, y, z];
      bumpVersion();
      return this;
    },
    setScale(scale) {
      node.scale = scale;
      bumpVersion();
      return this;
    },
    setVisible(visible) {
      node.visible = visible;
      bumpVersion();
      return this;
    },
    setMaterial(nextMaterial) {
      node.material = nextMaterial;
      bumpVersion();
      return this;
    },
    setInstances(transforms: readonly import("../nodes/types.js").AuraTransformSpec[], colors?: readonly import("../nodes/types.js").AuraColor[]) {
      node.instances = transforms.map((transform) => ({
        ...(transform.position ? { position: [...transform.position] as AuraVec3 } : {}),
        ...(transform.rotation ? { rotation: [...transform.rotation] as AuraVec3 } : {}),
        ...(transform.scale !== undefined ? { scale: transform.scale } : {})
      }));
      node.instanceColors = colors ? [...colors] : undefined;
      denseInstanceMatrices = undefined;
      denseInstanceRgba = undefined;
      bumpVersion();
      return this;
    },
    setInstanceMatrices(matrices: Float32Array, count: number, rgba?: Float32Array) {
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
      return this;
    },
    play(clip, options = {}) {
      node.animation = { ...options, clip };
      bumpVersion();
      return this;
    },
    setAnimation(animation) {
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
      if (!spec || spec.positions === undefined || spec.positions.length === 0) {
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
      bumpVersion();
      return this;
    },
    // Bounds: `updateAttribute("position", ...)` writes vertices only. The culling bounds stay the ones from the last
    // `setGeometry` / mount (authored `bounds`, else computed from the positions then), so a strip authored at all-zero
    // positions and filled per frame is culled until it passes `geometry.dynamic({ bounds })` or calls `setGeometry` (g19
    // handoff; the bounds refresh belongs in `compiler/primitives.ts` `syncRuntimePrimitiveGeometry`).
    updateAttribute(name: string, update: import("../nodes/types.js").AuraAttributeUpdate): AuraRuntimeNodeHandle {
      if (typeof name !== "string" || name.trim().length === 0) {
        throw new AuraRuntimeError("missing-asset", "Aura3D updateAttribute requires an attribute name.");
      }
      if (!update || update.array === undefined || update.array.length === 0) {
        throw new AuraRuntimeError("missing-asset", `Aura3D updateAttribute("${name}") requires a non-empty array.`);
      }
      const raw = update.array;
      const array = raw instanceof Float32Array || raw instanceof Uint16Array || raw instanceof Uint32Array
        ? raw
        : Float32Array.from(raw as readonly number[] | Int32Array);
      const pending = { name, array, offset: Math.max(0, Math.floor(update.offset ?? 0)) };
      const self = this as unknown as {
        __parityL2AttributeUpdates?: { name: string; array: Float32Array | Uint16Array | Uint32Array; offset: number }[];
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
            const childRuntime = "runtime" in childSpec ? childSpec.runtime : undefined;
            const childHandle = createRuntimeNodeHandle(
              childSpec as MutableAuraRuntimeSceneNode,
              childRuntime ?? { id: `${runtime.id}/child-${index}` }
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
      const childSpec = parityL7NodeSpecs.get(child);
      if (!childSpec) {
        throw new AuraRuntimeError(
          "missing-asset",
          "Aura3D attach() expects a runtime node handle created by this registry."
        );
      }
      if (child === this) {
        throw new AuraRuntimeError("missing-asset", "Aura3D attach() cannot attach a node to itself.");
      }
      // three's Object3D.attach: re-parent while preserving the child's world
      // transform — local = inverse(parentWorld) * childWorld.
      const parentWorld = parityL7WorldMatrix(this, new Float32Array(16));
      const invParent = parityL7InvertMat4(parentWorld, new Float32Array(16));
      const childWorld = parityL7WorldMatrix(child, new Float32Array(16));
      const local = new Float32Array(16);
      multiplyMat4Into(local, invParent, childWorld);
      const t = decomposeMatrix(local);
      childSpec.position = [...t.position] as AuraVec3;
      childSpec.quaternion = [...t.quaternion] as AuraQuat;
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
      bumpVersion();
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
        position: node.position ?? [0, 0, 0],
        rotation: node.rotation ?? [0, 0, 0],
        scale: node.scale ?? 1,
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
