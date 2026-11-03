// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AnimationPose } from "@aura3d/animation";
import type { AuraRuntimeNodeAnimationBindingMetadata, AuraRuntimeNodeBounds, RuntimeNodeMorphTargetWeights } from "../RuntimeNodeHandle";
import { calculateRuntimeNodeModelBounds } from "../RuntimeNodeHandle.js";
import type { AuraVec3, AuraAnimationSpec, AuraModelNode, AuraRuntimeNodeImportedAssetEvidence, AuraRuntimeNodeRegistry, ProductionRuntimeActorEntry, ProductionRuntimePrimitiveEntry } from "../nodes/types.js";
import type { GLTFootPlantingConfig } from "@aura3d/assets/browser";
import type { GltfBounds } from "../nodes/types/runtime.js";
import type { Mat4 } from "@aura3d/scene";
import type { ProductionImportedAssetRenderMetadata, RenderItem } from "@aura3d/rendering";
import { computeSkinnedGeometryBounds } from "@aura3d/rendering";
import type { TypedGLBActor, TypedGLBActorEvidence } from "../../production-runtime/TypedGLBActor.js";
import { AURA_DEFORMED_BOUNDS_EVIDENCE_TAG, AURA_UNCLAMPED_MORPH_WEIGHTS_TAG, createRuntimeNodeImportedAssetEvidence } from "../runtimeEvidence.js";
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
  /** Live runtime material (selective-bloom weight source), from the same snapshot; absent = authored. */
  readonly runtimeMaterial?: AuraModelNode["material"];
}

export function resolveProductionActorRuntimeState(
  entry: ProductionRuntimeActorEntry,
  runtimeNodes: AuraRuntimeNodeRegistry | undefined
): ProductionRuntimeActorState {
  const runtimeId = entry.node.runtime?.id;
  if (!runtimeId) return { node: entry.node };
  const runtimeSnapshot = runtimeNodes?.get(runtimeId)?.snapshot() as (ReturnType<NonNullable<ReturnType<AuraRuntimeNodeRegistry["get"]>>["snapshot"]> & {
    readonly instances?: AuraModelNode["instances"];
    readonly instanceColors?: AuraModelNode["instanceColors"];
    readonly material?: AuraModelNode["material"];
  }) | undefined;
  if (!runtimeSnapshot) return { node: entry.node };
  const morphTargets = runtimeSnapshot.morphTargets ?? {};
  const nextAnimation = runtimeSnapshot.animation ?? entry.node.animation;
  const pivot = runtimeSnapshot.pivot ?? entry.node.pivot;
  const samePivot = entry.node.pivot === pivot || (
    (entry.node.pivot?.[0] ?? 0) === (pivot?.[0] ?? 0) &&
    (entry.node.pivot?.[1] ?? 0) === (pivot?.[1] ?? 0) &&
    (entry.node.pivot?.[2] ?? 0) === (pivot?.[2] ?? 0)
  );
  const sameInPlace =
    (entry.node.position === runtimeSnapshot.position || (entry.node.position === undefined && runtimeSnapshot.position[0] === 0 && runtimeSnapshot.position[1] === 0 && runtimeSnapshot.position[2] === 0)) &&
    (entry.node.rotation === runtimeSnapshot.rotation || (entry.node.rotation === undefined && runtimeSnapshot.rotation[0] === 0 && runtimeSnapshot.rotation[1] === 0 && runtimeSnapshot.rotation[2] === 0)) &&
    (entry.node.scale === runtimeSnapshot.scale || (entry.node.scale === undefined && runtimeSnapshot.scale === 1)) &&
    samePivot &&
    (entry.node.visible !== false) === runtimeSnapshot.visible &&
    entry.node.animation === nextAnimation &&
    (runtimeSnapshot.instances === undefined || entry.node.instances === runtimeSnapshot.instances) &&
    (runtimeSnapshot.instanceColors === undefined || entry.node.instanceColors === runtimeSnapshot.instanceColors);
  return {
    node: sameInPlace
      ? entry.node
      : {
          ...entry.node,
          position: runtimeSnapshot.position,
          rotation: runtimeSnapshot.rotation,
          scale: runtimeSnapshot.scale,
          pivot,
          visible: runtimeSnapshot.visible,
          animation: nextAnimation,
          ...(runtimeSnapshot.instances ? { instances: runtimeSnapshot.instances } : {}),
          ...(runtimeSnapshot.instanceColors ? { instanceColors: runtimeSnapshot.instanceColors } : {})
        },
    animationBinding: runtimeSnapshot.animationBinding,
    animationPose: runtimeSnapshot.animationPose,
    animationPoseTime: runtimeSnapshot.animationPoseBinding?.localTime ?? runtimeSnapshot.animationPoseBinding?.captureTime,
    ...(Object.keys(morphTargets).length > 0 ? { morphTargets } : {}),
    ...(runtimeSnapshot.material !== undefined ? { runtimeMaterial: runtimeSnapshot.material } : {})
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
    // SA-05: nodes tagged `aura:morph-unclamped` pass finite out-of-range
    // influences through to the actor; all other nodes keep the [0,1] clamp.
    const unclamped = entry.node.runtime?.tags?.includes(AURA_UNCLAMPED_MORPH_WEIGHTS_TAG) === true;
    const result = entry.actor.applyMorphTargets(morphTargets, unclamped ? { clampWeights: false } : undefined);
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

/**
 * A submitted model item contains its final actor and imported-mesh placement.
 * Use that same placement for the evidence rather than reconstructing it from
 * the authored node, which can omit parent transforms, fit, pivot and instances.
 * Geometry bounds describe the undeformed mesh; skin and morph displacement are
 * not evaluated here and can extend outside this static envelope.
 */
function submittedActorWorldBounds(items: readonly RenderItem[]): AuraRuntimeNodeBounds | undefined {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let found = false;
  for (const item of items) {
    if (item.instanceCount === 0) continue;
    const bounds = item.geometry?.bounds;
    if (!bounds || !validBound(bounds.min, bounds.max)) return undefined;
    const model = affineMatrix(item.modelMatrix);
    const geometry = affineMatrix(item.geometryMatrix);
    if (!model || !geometry) return undefined;
    const transforms = item.instanceTransforms;
    if (transforms !== undefined && (transforms.length === 0 || transforms.length % 16 !== 0)) return undefined;
    const count = transforms === undefined ? 1 : transforms.length / 16;
    const center = bounds.min.map((value, axis) => value + (bounds.max[axis]! - value) / 2);
    const half = bounds.min.map((value, axis) => (bounds.max[axis]! - value) / 2);
    // Reuse the scratch matrices for all instances; large instanced scenes
    // should not allocate three matrices per instance on every frame.
    const instanceScratch = new Array<number>(16);
    const intermediate = new Array<number>(16);
    const world = new Array<number>(16);
    for (let index = 0; index < count; index += 1) {
      const instance = transforms === undefined ? IDENTITY_MATRIX : copyAffine(transforms, index * 16, instanceScratch, false);
      if (!instance) return undefined;
      multiplyAffineInto(intermediate, model, instance);
      multiplyAffineInto(world, intermediate, geometry);
      if (!includeTransformedBounds(min, max, center, half, world)) return undefined;
      found = true;
    }
  }
  if (!found) return undefined;
  const size: AuraVec3 = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
  if (!size.every(Number.isFinite)) return undefined;
  return {
    kind: "aura-runtime-node-bounds",
    min: [min[0]!, min[1]!, min[2]!],
    max: [max[0]!, max[1]!, max[2]!],
    center: [min[0]! + size[0] / 2, min[1]! + size[1] / 2, min[2]! + size[2] / 2],
    size,
    radius: Math.hypot(size[0] / 2, size[1] / 2, size[2] / 2)
  };
}

const IDENTITY_MATRIX: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * Posed world bounds for the submitted frame: skinned items use the CPU-skinned
 * envelope of their current joint palette under `modelMatrix` (the same space
 * renderer culling uses); unskinned items keep their submitted static bounds.
 * Only computed for nodes tagged `aura:evidence-deformed-bounds`.
 */
function deformedBoundsEvidence(items: readonly RenderItem[]): { readonly deformedBounds?: AuraRuntimeNodeBounds } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const staticItems: RenderItem[] = [];
  for (const item of items) {
    if (item.instanceCount === 0) continue;
    if (!item.skinning || !item.geometry) { staticItems.push(item); continue; }
    const local = computeSkinnedGeometryBounds(item.geometry, item.skinning);
    if (!validBound(local.min, local.max)) return {};
    const model = affineMatrix(item.modelMatrix);
    if (!model) return {};
    const center = local.min.map((value, axis) => value + (local.max[axis]! - value) / 2);
    const half = local.min.map((value, axis) => (local.max[axis]! - value) / 2);
    if (!includeTransformedBounds(min, max, center, half, model)) return {};
  }
  if (staticItems.length > 0) {
    const fixed = submittedActorWorldBounds(staticItems);
    if (!fixed) return {};
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, fixed.min[axis]!);
      max[axis] = Math.max(max[axis]!, fixed.max[axis]!);
    }
  }
  if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) return {};
  const size: AuraVec3 = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
  return {
    deformedBounds: {
      kind: "aura-runtime-node-bounds",
      min: [min[0]!, min[1]!, min[2]!],
      max: [max[0]!, max[1]!, max[2]!],
      center: [min[0]! + size[0] / 2, min[1]! + size[1] / 2, min[2]! + size[2] / 2],
      size,
      radius: Math.hypot(size[0] / 2, size[1] / 2, size[2] / 2)
    }
  };
}

function validBound(min: readonly number[] | undefined, max: readonly number[] | undefined): boolean {
  return Array.isArray(min) && Array.isArray(max) && min.length === 3 && max.length === 3
    && min.every(Number.isFinite) && max.every(Number.isFinite)
    && min.every((value, axis) => value <= max[axis]!);
}

/** Return a private, finite affine matrix snapshot; undefined means identity. */
function affineMatrix(value: ArrayLike<number> | undefined, offset = 0, exact = true): readonly number[] | undefined {
  if (value === undefined) return IDENTITY_MATRIX;
  return copyAffine(value, offset, new Array<number>(16), exact);
}

function copyAffine(value: ArrayLike<number>, offset: number, matrix: number[], exact: boolean): readonly number[] | undefined {
  if (value.length < offset + 16 || (exact && value.length !== 16)) return undefined;
  for (let index = 0; index < 16; index += 1) {
    const component = value[offset + index]!;
    if (!Number.isFinite(component)) return undefined;
    matrix[index] = component;
  }
  if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) return undefined;
  return matrix;
}

function multiplyAffineInto(product: number[], left: readonly number[], right: readonly number[]): void {
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      product[column * 4 + row] = left[row]! * right[column * 4]!
        + left[4 + row]! * right[column * 4 + 1]!
        + left[8 + row]! * right[column * 4 + 2]!
        + left[12 + row]! * right[column * 4 + 3]!;
    }
  }
}

function includeTransformedBounds(
  min: number[], max: number[], center: readonly number[], half: readonly number[], matrix: readonly number[]
): boolean {
  for (let axis = 0; axis < 3; axis += 1) {
    const transformed = matrix[axis]! * center[0]! + matrix[4 + axis]! * center[1]!
      + matrix[8 + axis]! * center[2]! + matrix[12 + axis]!;
    const extent = Math.abs(matrix[axis]!) * half[0]! + Math.abs(matrix[4 + axis]!) * half[1]!
      + Math.abs(matrix[8 + axis]!) * half[2]!;
    const low = transformed - extent;
    const high = transformed + extent;
    if (!Number.isFinite(low) || !Number.isFinite(high)) return false;
    min[axis] = Math.min(min[axis]!, low);
    max[axis] = Math.max(max[axis]!, high);
  }
  return true;
}

function runtimeModelWorldBounds(node: AuraModelNode, actor: TypedGLBActor, renderItems: readonly RenderItem[]): AuraRuntimeNodeBounds {
  const submittedBounds = submittedActorWorldBounds(renderItems);
  if (submittedBounds) return submittedBounds;
  const modelBounds = productionActorModelBounds(node.asset, actor);
  return calculateRuntimeNodeModelBounds({
    min: modelBounds.min,
    max: modelBounds.max,
    position: node.position,
    scale: node.scale
  });
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
    // Use submitted undeformed mesh bounds where available. A missing or
    // malformed submission retains the previous loaded/manifest fallback.
    bounds: runtimeModelWorldBounds(node, actor, renderItems),
    ...(node.runtime?.tags?.includes(AURA_DEFORMED_BOUNDS_EVIDENCE_TAG) ? deformedBoundsEvidence(renderItems) : {}),
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
  const runtimePrimitiveMaterials = primitiveEntries.filter((entry) => entry.resources?.some(
    (resource) => resource.geometry && resource.material && !resource.material.disposed
  )).length;
  return {
    assetId: metadata.length === 0 ? "aura-primitives" : metadata.length === 1 ? primary?.assetId ?? "typed-glb" : `typed-glb-batch-${metadata.length}`,
    assetUri: metadata.length === 0 ? "aura3d://scene/primitives" : metadata.length === 1 ? primary?.assetUri ?? "aura3d://typed-glb" : "aura3d://scene/typed-glb-batch",
    ...(metadata.length === 1 && primary?.assetName ? { assetName: primary.assetName } : metadata.length > 1 ? { assetName: "Aura3D typed GLB scene batch" } : {}),
    meshCount: sumProductionMetadata(metadata, "meshCount") + primitiveCount,
    primitiveCount: typedPrimitiveCount + primitiveCount,
    materialCount: sumProductionMetadata(metadata, "materialCount") + primitiveCount,
    runtimeMaterialCount: metadata.reduce((count, item) => count + (item.runtimeMaterialCount ?? item.materialCount), 0) + runtimePrimitiveMaterials,
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
