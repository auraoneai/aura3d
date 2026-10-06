// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AnimationPose } from "@aura3d/animation";
import type { AuraRuntimeNodeAnimationBindingMetadata, RuntimeNodeMorphTargetWeights } from "../RuntimeNodeHandle";
import type { AuraVec3, AuraAnimationSpec, AuraModelNode, AuraRuntimeNodeImportedAssetEvidence, AuraRuntimeNodeRegistry, ProductionRuntimeActorEntry, ProductionRuntimePrimitiveEntry } from "../nodes/types.js";
import type { GLTFootPlantingConfig } from "@aura3d/assets/browser";
import type { GltfBounds } from "./gltfRuntime.js";
import type { Mat4 } from "@aura3d/scene";
import type { ProductionImportedAssetRenderMetadata, RenderItem } from "@aura3d/rendering";
import type { TypedGLBActor, TypedGLBActorEvidence } from "../../production-runtime/TypedGLBActor.js";
import { animation } from "../nodes/animation.js";
import { createRuntimeNodeImportedAssetEvidence } from "../runtimeEvidence.js";
import { model } from "../nodes/model.js";
import { resolveAnimationSeconds } from "./animation.js";
import { scene } from "../nodes/scene.js";
import type { AuraAssetRef } from "../nodes/types.js";
import { productionRenderErrorMessage } from "./observations.js";

interface ProductionRuntimeActorState {
  readonly node: AuraModelNode;
  readonly animationPose?: AnimationPose;
  readonly animationPoseTime?: number;
  readonly animationBinding?: AuraRuntimeNodeAnimationBindingMetadata;
  readonly morphTargets?: RuntimeNodeMorphTargetWeights;
}

export function resolveProductionActorRuntimeState(
  entry: ProductionRuntimeActorEntry,
  runtimeNodes: AuraRuntimeNodeRegistry | undefined
): ProductionRuntimeActorState {
  const runtimeId = entry.node.runtime?.id;
  if (!runtimeId) return { node: entry.node };
  const runtimeSnapshot = runtimeNodes?.get(runtimeId)?.snapshot();
  if (!runtimeSnapshot) return { node: entry.node };
  const morphTargets = runtimeSnapshot.morphTargets ?? {};
  return {
    node: {
      ...entry.node,
      position: runtimeSnapshot.position,
      rotation: runtimeSnapshot.rotation,
      scale: runtimeSnapshot.scale,
      visible: runtimeSnapshot.visible,
      animation: runtimeSnapshot.animation ?? entry.node.animation
    },
    animationBinding: runtimeSnapshot.animationBinding,
    animationPose: runtimeSnapshot.animationPose,
    animationPoseTime: runtimeSnapshot.animationPoseBinding?.localTime ?? runtimeSnapshot.animationPoseBinding?.captureTime,
    ...(Object.keys(morphTargets).length > 0 ? { morphTargets } : {})
  };
}

/**
 * Applies controller-bound foot planting (E2) to the typed GLB actor. The resolved config
 * is refreshed every frame with the actor's live model matrix: time-animated model nodes
 * (float/orbit/turntable) move, and the post-pass solves in world space, so a stale matrix
 * would plant feet in yesterday's frame. Foot-lock state survives the refresh — the runtime
 * keeps its rig across matrix-only updates and resets it only when the leg set, ground, or
 * solve parameters change.
 */
export function applyProductionActorFootPlanting(
  entry: ProductionRuntimeActorEntry,
  animationBinding: AuraRuntimeNodeAnimationBindingMetadata | undefined,
  modelMatrix: readonly number[] | undefined,
  runtimeWarnings: Set<string>,
  degrade?: (d: Omit<import("../../contracts/compiler.js").AuraDegradation, "frame">) => void
): void {
  const footPlanting = animationBinding?.footPlanting;
  try {
    entry.actor.animation.setFootPlanting(
      (footPlanting === undefined
        ? undefined
        : { ...footPlanting, legs: footPlanting.legs.map(leg => ({ ...leg, ...(leg.contactPhase ? { contact: leg.contactPhase(animationBinding?.localTime ?? 0) } : {}) })), ...spreadFootPlantingWorldMatrix(modelMatrix) }) as GLTFootPlantingConfig | undefined
    );
  } catch (error) {
    if (degrade) degrade({ code: "foot-planting-failed", nodeId: entry.actor.id, message: `Typed GLB actor "${entry.actor.id}" failed to apply foot planting: ${productionRenderErrorMessage(error)}`, cause: error });
    else runtimeWarnings.add(`Typed GLB actor "${entry.actor.id}" failed to apply foot planting: ${productionRenderErrorMessage(error)}`);
  }
}

/**
 * Packages the actor model matrix as the post-pass `worldFromLocal`. The matrix the
 * renderer draws with (column-major 16, model-local → world) is exactly the space the
 * foot-planting ground speaks, so the same array threads both paths. Returns {} when the
 * matrix is missing or malformed so the pass falls back to actor-local solving.
 */
function spreadFootPlantingWorldMatrix(
  modelMatrix: readonly number[] | undefined
): { readonly worldFromLocal?: Mat4 } {
  if (!modelMatrix || modelMatrix.length !== 16) return {};
  const worldFromLocal = Array.from(modelMatrix, (component) => Number(component)) as Mat4;
  if (worldFromLocal.some((component) => !Number.isFinite(component))) return {};
  return { worldFromLocal };
}

export function applyProductionActorMorphTargets(
  entry: ProductionRuntimeActorEntry,
  morphTargets: RuntimeNodeMorphTargetWeights | undefined,
  runtimeWarnings: Set<string>,
  degrade?: (d: Omit<import("../../contracts/compiler.js").AuraDegradation, "frame">) => void
): void {
  if (!morphTargets || Object.keys(morphTargets).length === 0) return;
  try {
    const result = entry.actor.applyMorphTargets(morphTargets);
    for (const missing of result.missingTargets) {
      runtimeWarnings.add(`Typed GLB actor "${entry.actor.id}" has no morph target "${missing}".`);
    }
  } catch (error) {
    if (degrade) degrade({ code: "morph-apply-failed", nodeId: entry.actor.id, message: `Typed GLB actor "${entry.actor.id}" failed to apply morph targets: ${productionRenderErrorMessage(error)}`, cause: error });
    else runtimeWarnings.add(`Typed GLB actor "${entry.actor.id}" failed to apply morph targets: ${productionRenderErrorMessage(error)}`);
  }
}

export function attachProductionActorEvidence(
  node: AuraModelNode,
  actor: TypedGLBActor,
  renderItems: readonly RenderItem[],
  runtimeNodes: AuraRuntimeNodeRegistry | undefined
): void {
  if (!node.runtime?.id || !runtimeNodes?.has(node.runtime.id)) return;
  const evidence = createRuntimeEvidenceFromTypedGLBActor(node, actor, renderItems);
  runtimeNodes.get(node.runtime.id)?.setImportedAssetEvidence(evidence);
}

function createRuntimeEvidenceFromTypedGLBActor(
  node: AuraModelNode,
  actor: TypedGLBActor,
  renderItems: readonly RenderItem[]
): AuraRuntimeNodeImportedAssetEvidence {
  const actorEvidence: TypedGLBActorEvidence = actor.evidence;
  const skeletonBones = actor.pipeline.asset.skins.flatMap((skin) => skin.jointNames);
  const morphTargets = actor.pipeline.asset.meshes.flatMap((mesh) => mesh.morphTargets.map((target, index) => target.name ?? `${mesh.name}-morph-${index + 1}`));
  const morphApply = actorEvidence.lastMorphApply;
  return createRuntimeNodeImportedAssetEvidence({
    assetId: node.asset.id,
    ...(node.runtime?.id ? { nodeId: node.runtime.id } : {}),
    skeletonBones,
    clips: actorEvidence.clips,
    ...(actorEvidence.lastClip ? { activeClip: actorEvidence.lastClip } : {}),
    ...(actorEvidence.skinningBindingCount > 0 ? {
      skinningPalette: {
        jointCount: actorEvidence.skinningBindingCount,
        matrixCount: actorEvidence.skinningBindingCount,
        updated: actorEvidence.lastSkinningPalettesUpdated > 0
      }
    } : {}),
    morphTargets,
    activeMorphTargets: morphApply?.activeWeights ?? {},
    missingMorphTargets: morphApply?.missingTargets ?? [],
    bounds: {
      position: node.position,
      scale: node.scale,
      size: node.asset.bounds
    },
    renderItemCount: renderItems.length,
    skinnedRenderItemCount: renderItems.filter((item) => item.skinning).length,
    morphRenderItemCount: renderItems.filter((item) => item.morphTargets && item.morphTargets.length > 0).length,
    lastMaterialTracksApplied: actorEvidence.lastMaterialTracksApplied,
    lastLightTracksApplied: actorEvidence.lastLightTracksApplied,
    lastFootPlantingGroundedFeet: actorEvidence.lastFootPlantingGroundedFeet,
    lastFootPlantingTargetError: actorEvidence.lastFootPlantingTargetError,
    lastFootPlantingHipOffset: actorEvidence.lastFootPlantingHipOffset,
    lastFootPlantingMissingLegs: [...actorEvidence.lastFootPlantingMissingLegs],
    lastFootPlantingFeet: actorEvidence.lastFootPlantingFeet,
    lastFootPlantingSurfaces: actorEvidence.lastFootPlantingSurfaces,
    lastFootPlantingDeformation: actorEvidence.lastFootPlantingDeformation,
    footPlantingConfigured: actorEvidence.footPlantingConfigured
  });
}

export function createProductionRuntimeMetadata(
  actorEntries: readonly ProductionRuntimeActorEntry[],
  primitiveEntries: readonly ProductionRuntimePrimitiveEntry[]
): ProductionImportedAssetRenderMetadata {
  const metadata = actorEntries.map((entry) => entry.actor.pipeline.metadata);
  const primary = metadata[0];
  const primitiveCount = primitiveEntries.length;
  const typedPrimitiveCount = sumProductionMetadata(metadata, "primitiveCount");
  return {
    assetId: metadata.length === 0 ? "aura-primitives" : metadata.length === 1 ? primary?.assetId ?? "typed-glb" : `typed-glb-batch-${metadata.length}`,
    assetUri: metadata.length === 0 ? "aura3d://scene/primitives" : metadata.length === 1 ? primary?.assetUri ?? "aura3d://typed-glb" : "aura3d://scene/typed-glb-batch",
    ...(metadata.length === 1 && primary?.assetName ? { assetName: primary.assetName } : metadata.length > 1 ? { assetName: "Aura3D typed GLB scene batch" } : {}),
    meshCount: sumProductionMetadata(metadata, "meshCount") + primitiveCount,
    primitiveCount: typedPrimitiveCount + primitiveCount,
    materialCount: sumProductionMetadata(metadata, "materialCount") + primitiveCount,
    textureCount: sumProductionMetadata(metadata, "textureCount"),
    imageCount: sumProductionMetadata(metadata, "imageCount"),
    animationCount: sumProductionMetadata(metadata, "animationCount"),
    skinCount: sumProductionMetadata(metadata, "skinCount"),
    morphTargetCount: sumProductionMetadata(metadata, "morphTargetCount"),
    extensionsUsed: [...new Set(metadata.flatMap((item) => item.extensionsUsed))]
  };
}

function sumProductionMetadata(
  metadata: readonly ProductionImportedAssetRenderMetadata[],
  key: keyof Pick<ProductionImportedAssetRenderMetadata, "meshCount" | "primitiveCount" | "materialCount" | "textureCount" | "imageCount" | "animationCount" | "skinCount" | "morphTargetCount">
): number {
  return metadata.reduce((total, item) => total + item[key], 0);
}

/**
 * Bounds used to size a typed model in the production bridge.
 *
 * Order matters and is deliberate:
 *
 * 1. The actor's actually-loaded GLB bounds. These are what the geometry really
 *    occupies, so the bridge stays correct even if a manifest is stale or was written
 *    by an older CLI. Preferring metadata here once caused whole levels to disappear:
 *    a world recorded with an ~8x-too-small X extent was sized far too large and
 *    frustum-culled out of frame.
 * 2. Manifest `boundsMetadata` min/max, when loaded bounds are unavailable.
 * 3. The flat `bounds` size triple, only if neither is available. This assumes a
 *    min-Y-at-zero box that the mesh may not match, so it is a last resort.
 *
 * `camera.frameAsset` is synchronous and can only read manifest metadata, so framing
 * and rendering agree only while the manifest matches the geometry. Both are correct
 * as of the scene-space bounds fix and manifest regeneration;
 * `auraProductionBoundsProbes()` records any per-asset disagreement at runtime so a
 * future divergence is observable rather than silent.
 */
export function productionActorModelBounds(asset: AuraAssetRef<"model">, actor: TypedGLBActor): GltfBounds {
  const loaded = typedGLBActorLoadedBounds(actor);
  const metadataBounds = asset.metadata?.boundsMetadata;
  const metadataMin = vec3FromReadonly(metadataBounds?.min);
  const metadataMax = vec3FromReadonly(metadataBounds?.max);
  if (loaded) {
    if (metadataMin && metadataMax) {
      productionBoundsProbes.set(asset.id, {
        assetId: asset.id,
        metadata: { min: metadataMin, max: metadataMax },
        loaded: { min: [...loaded.min], max: [...loaded.max] }
      });
    }
    return loaded;
  }
  if (metadataMin && metadataMax) return { min: metadataMin, max: metadataMax };
  return boundsFromAuraAsset(asset);
}

interface ProductionBoundsProbe {
  readonly assetId: string;
  readonly metadata: { readonly min: readonly number[]; readonly max: readonly number[] };
  readonly loaded: { readonly min: readonly number[]; readonly max: readonly number[] };
}

const productionBoundsProbes = new Map<string, ProductionBoundsProbe>();

/**
 * Diagnostic: manifest `boundsMetadata` versus the bounds actually computed from the
 * loaded GLB, per typed asset routed through the production bridge.
 *
 * The bridge sizes models from loaded bounds because those are what the geometry
 * really occupies. This accessor exists so a disagreement with manifest metadata —
 * which `camera.frameAsset` must use, being synchronous — is observable instead of
 * silently producing mismatched framing.
 */
export function auraProductionBoundsProbes(): readonly ProductionBoundsProbe[] {
  return [...productionBoundsProbes.values()];
}

/**
 * Real bounds of the loaded GLB scene, as computed from its geometry. Returns
 * undefined when the actor cannot supply them, so callers fall back to manifest
 * metadata rather than silently using a zeroed box.
 */
function typedGLBActorLoadedBounds(actor: TypedGLBActor): GltfBounds | undefined {
  const bounds = actor.pipeline?.resources?.bounds;
  const min = vec3FromReadonly(bounds?.min);
  const max = vec3FromReadonly(bounds?.max);
  if (!min || !max) return undefined;
  // A degenerate box would produce a divide-by-near-zero fit scale.
  if (max[0] - min[0] <= 0 && max[1] - min[1] <= 0 && max[2] - min[2] <= 0) return undefined;
  return { min, max };
}

function boundsFromAuraAsset(asset: AuraAssetRef<"model">): GltfBounds {
  const metadataBounds = asset.metadata?.boundsMetadata;
  const metadataMin = vec3FromReadonly(metadataBounds?.min);
  const metadataMax = vec3FromReadonly(metadataBounds?.max);
  if (metadataMin && metadataMax) return { min: metadataMin, max: metadataMax };

  const metadataSize = vec3FromReadonly(metadataBounds?.size);
  const metadataCenter = vec3FromReadonly(metadataBounds?.center);
  if (metadataSize) {
    const center = metadataCenter ?? [0, metadataSize[1] / 2, 0] as const;
    return {
      min: [center[0] - metadataSize[0] / 2, center[1] - metadataSize[1] / 2, center[2] - metadataSize[2] / 2],
      max: [center[0] + metadataSize[0] / 2, center[1] + metadataSize[1] / 2, center[2] + metadataSize[2] / 2]
    };
  }

  const bounds = asset.bounds;
  if (!bounds || bounds.length < 3) return { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] };
  const halfX = Math.max(0.001, bounds[0] / 2);
  const halfZ = Math.max(0.001, bounds[2] / 2);
  return {
    min: [-halfX, 0, -halfZ],
    max: [halfX, Math.max(0.001, bounds[1]), halfZ]
  };
}

function vec3FromReadonly(value: readonly number[] | undefined): [number, number, number] | undefined {
  if (!value || value.length < 3) return undefined;
  const vec: [number, number, number] = [Number(value[0]), Number(value[1]), Number(value[2])];
  return vec.every((component) => Number.isFinite(component)) ? vec : undefined;
}

export function resolveProductionActorAnimationSeconds(
  animation: AuraAnimationSpec | undefined,
  animationBinding: AuraRuntimeNodeAnimationBindingMetadata | undefined,
  time: number
): number {
  if (!animation || animation.captureTime === undefined || !animationBinding?.controllerId) {
    return resolveAnimationSeconds(animation, time);
  }
  const duration = Math.max(0, animation.duration ?? 0);
  const phase = Math.max(0, animationBinding.captureTime ?? animationBinding.localTime ?? animation.captureTime);
  if (duration <= 0) return phase;
  return animation.loop === false ? Math.min(phase, duration) : phase % duration;
}

export function orbitAnimatedAngle(seconds: number, speed: number): number {
  return seconds * speed * 0.58;
}

export function orbitAnimatedPosition(animation: AuraAnimationSpec, basePosition: AuraVec3, seconds: number, speed: number): AuraVec3 {
  const center = animation.orbitCenter ?? [0, basePosition[1], 0] as const;
  const radius = animation.orbitRadius ?? Math.hypot(basePosition[0] - center[0], basePosition[2] - center[2]);
  const phase = animation.orbitPhase ?? Math.atan2(basePosition[2] - center[2], basePosition[0] - center[0]);
  const angle = phase + orbitAnimatedAngle(seconds, speed);
  return [
    center[0] + Math.cos(angle) * radius,
    basePosition[1],
    center[2] + Math.sin(angle) * radius
  ];
}
