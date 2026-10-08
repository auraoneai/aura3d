// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAnimationSpec, AuraApp, AuraMaterialSpec, AuraRuntimeNodeHandle, AuraRuntimeNodeImportedAssetEvidence, AuraRuntimeNodeRegistry, AuraRuntimeNodeSpec, AuraSceneNode, AuraSceneSnapshot, AuraVec3 } from "../nodes/types.js";
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
};

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
      size: "size" in node ? node.size : undefined
    });
  return {
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
}
