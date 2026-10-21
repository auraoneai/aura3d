// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAnimationSpec, AuraApp, AuraLayerMask, AuraMaterialSpec, AuraRuntimeNodeHandle, AuraRuntimeNodeImportedAssetEvidence, AuraRuntimeNodeRegistry, AuraRuntimeNodeSpec, AuraSceneNode, AuraSceneSnapshot, AuraVec3 } from "../nodes/types.js";
import { decomposeMatrix, identityMat4Into, localMatrixOf, multiplyMat4Into } from "../sceneGraph.js";
import type { AuraQuat } from "../../contracts/sceneGraph.js";
import type { AuraNodeBuilder } from "../nodes/builder.js";
import { animation } from "../nodes/animation.js";
import { effects } from "../nodes/effects.composite.js";
import { cloneRuntimeAnimationPose, cloneRuntimeImportedAssetEvidence, sanitizeRuntimeMorphWeight } from "../runtimeEvidence.js";
import { AuraRuntimeError } from "./errors.js";
import { calculateRuntimeNodeBounds, type AuraRuntimeNodeAnimationBindingMetadata, type AuraRuntimeNodeAnimationPoseBindingMetadata, type AuraRuntimeNodeEffectAttachment } from "../RuntimeNodeHandle.js";
import type { AnimationPose } from "@aura3d/animation";
import { material } from "../nodes/material.js";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { resolveQrFlags } from "../../contracts/flags.js";
import type { CompiledScene } from "../../contracts/compiler.js";
import { asRuntimeCompiled } from "../../contracts/compiler.js";
import { nodeHandleExtensionsAll } from "../../contracts/runtimeNodes.js";
import type { AuraNodeKindMap } from "../../contracts/compiler.js";

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
      if (compiled && compilerFlagOn()) {
        compiled.addSubtree(node, options.parent);
        const handle = applyHandleExtensions(createRuntimeNodeHandle(node as MutableAuraRuntimeSceneNode, node.runtime));
        handles.set(id, handle);
        return handle;
      }
      // Legacy seam (C-37 PR 0b-1): append to the snapshot and remount.
      const scene = getScene?.();
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
      if (!handles.has(id)) return false;
      registryVersion += 1;
      handles.delete(id);
      if (compiled && compilerFlagOn()) {
        compiled.removeSubtree(id);
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
    reset(nextSnapshot) {
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

export function createRuntimeNodeHandle(node: MutableAuraRuntimeSceneNode, runtime: AuraRuntimeNodeSpec): AuraRuntimeNodeHandle {
  const tags = runtime.tags ?? [];
  const attachedEffects: AuraRuntimeNodeEffectAttachment[] = [];
  const morphTargetWeights = new Map<string, number>();
  let animationBinding: AuraRuntimeNodeAnimationBindingMetadata | undefined;
  let animationPose: AnimationPose | undefined;
  let animationPoseBinding: AuraRuntimeNodeAnimationPoseBindingMetadata | undefined;
  let importedAssetEvidence: AuraRuntimeNodeImportedAssetEvidence | undefined;
  let nodeVersion = 0;
  const bumpVersion = () => { nodeVersion += 1; };
  const getVisible = () => node.kind === "model" ? node.visible !== false : node.visible !== false;
  const getBounds = () =>
    calculateRuntimeNodeBounds({
      position: node.position,
      scale: node.scale,
      // L7: `"size" in node` also matches surfaces.mirror's 2-element extent —
      // bounds wants a vec3, so only forward 3-element sizes.
      size: "size" in node && typeof node.size === "object" && node.size !== undefined && node.size.length === 3
        ? node.size as readonly [number, number, number]
        : undefined
    });
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
            morphTargetWeights.set(normalizedName, sanitizeRuntimeMorphWeight(weight));
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
      morphTargetWeights.set(normalizedName, sanitizeRuntimeMorphWeight(weight));
      bumpVersion();
      return this;
    },
    setMorphTargets(weights) {
      morphTargetWeights.clear();
      bumpVersion();
      for (const [name, weight] of Object.entries(weights)) {
        const normalizedName = name.trim();
        if (normalizedName) {
          morphTargetWeights.set(normalizedName, sanitizeRuntimeMorphWeight(weight));
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
      morphTargetWeights.set(normalizedName, sanitizeRuntimeMorphWeight(weight));
      bumpVersion();
      return this;
    },
    // region parity:L1 — SH-02 `setUniform(name, value)`: write into the
    // material's uniform block without recompiling (frozen in
    // nodes/types/runtime.ts; owner lane L1, do not edit outside this region).
    // endregion parity:L1
    // region parity:L2 — SG-05 `setGeometry(spec)` / `updateAttribute(name,
    // update)`: per-frame partial upload, no realloc when vertex count is
    // unchanged (owner lane L2, do not edit outside this region).
    // endregion parity:L2
    // region parity:L7 — SG-09/SR-04 transform/graph members: `renderOrder`,
    // `frustumCulled`, `layers` (AuraLayerMask), `userData`, `traverse`,
    // `getWorldPosition/Quaternion/Scale`, `attach`, `morphTargetDictionary`
    // (SA-05, lane L8) (owner lane L7, do not edit outside this region).
    get renderOrder() {
      return node.renderOrder;
    },
    set renderOrder(next: number | undefined) {
      node.renderOrder = next;
      bumpVersion();
    },
    get frustumCulled() {
      return node.frustumCulled;
    },
    set frustumCulled(next: boolean | undefined) {
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
        test(layers: AuraLayerMask) { return (this.mask & layers.mask) !== 0; },
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
