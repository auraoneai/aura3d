// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAnimationSpec, AuraMaterialSpec, AuraRuntimeNodeHandle, AuraRuntimeNodeImportedAssetEvidence, AuraRuntimeNodeRegistry, AuraRuntimeNodeSpec, AuraSceneNode, AuraSceneSnapshot, AuraVec3 } from "../index.js";
import { AuraRuntimeError, animation, cloneRuntimeAnimationPose, cloneRuntimeImportedAssetEvidence, effects, sanitizeRuntimeMorphWeight } from "../index.js";
import { calculateRuntimeNodeBounds, type AuraRuntimeNodeAnimationBindingMetadata, type AuraRuntimeNodeAnimationPoseBindingMetadata, type AuraRuntimeNodeEffectAttachment } from "../RuntimeNodeHandle.js";
import type { AnimationPose } from "@aura3d/animation";
import { material } from "../nodes/material.js";

export function createAuraRuntimeNodeRegistry(snapshot: AuraSceneSnapshot): MutableAuraRuntimeNodeRegistry {
  let handles = new Map<string, AuraRuntimeNodeHandle>();
  const registry: MutableAuraRuntimeNodeRegistry = {
    get(id) {
      return handles.get(id);
    },
    require(id) {
      const handle = handles.get(id);
      if (!handle) {
        throw new AuraRuntimeError(
          "missing-asset",
          `Aura3D runtime node "${id}" was not found. Suggested fix: add .runtime({ id: "${id}" }) to the model, primitive, group, or label you want to mutate.`
        );
      }
      return handle;
    },
    has(id) {
      return handles.has(id);
    },
    ids() {
      return [...handles.keys()];
    },
    all() {
      return [...handles.values()];
    },
    reset(nextSnapshot) {
      handles = collectRuntimeNodeHandles(nextSnapshot);
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
    get position() {
      return node.position ?? [0, 0, 0];
    },
    set position(next) {
      node.position = next;
    },
    get rotation() {
      return node.rotation ?? [0, 0, 0];
    },
    set rotation(next) {
      node.rotation = next;
    },
    get scale() {
      return node.scale ?? 1;
    },
    set scale(next) {
      node.scale = next;
    },
    get visible() {
      return getVisible();
    },
    set visible(next) {
      node.visible = next;
    },
    setPosition(x, y, z) {
      node.position = [x, y, z];
      return this;
    },
    translate(x, y, z) {
      const current = node.position ?? [0, 0, 0];
      node.position = [current[0] + x, current[1] + y, current[2] + z];
      return this;
    },
    setRotation(x, y, z) {
      node.rotation = [x, y, z];
      return this;
    },
    setScale(scale) {
      node.scale = scale;
      return this;
    },
    setVisible(visible) {
      node.visible = visible;
      return this;
    },
    setMaterial(nextMaterial) {
      node.material = nextMaterial;
      return this;
    },
    play(clip, options = {}) {
      node.animation = { ...options, clip };
      return this;
    },
    setAnimation(animation) {
      node.animation = animation;
      return this;
    },
    setAnimationBinding(binding) {
      animationBinding = binding;
      return this;
    },
    setAnimationPose(pose, metadata) {
      animationPose = pose ? cloneRuntimeAnimationPose(pose) : undefined;
      animationPoseBinding = pose ? metadata : undefined;
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
      return this;
    },
    setMorphTargets(weights) {
      morphTargetWeights.clear();
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
      return this;
    },
    bounds() {
      return getBounds();
    },
    attachEffect(effect) {
      attachedEffects.push(effect);
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
