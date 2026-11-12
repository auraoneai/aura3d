// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from Renderer.ts; 0 changed logic lines.
// File: packages/rendering/src/renderer/CullingBatching.ts — owner lane 11.

import type { RenderItem, RenderMaterial } from "../ForwardPass";
import type { RenderDevice } from "../RenderDevice";
import { type Bounds3, Geometry } from "../Geometry";
import { type MeshConsolidationInput, createStaticMeshConsolidationCache } from "../MeshConsolidation";
import type { RenderCollectionDiagnostics } from "../Renderer";
import { type StaticBatchInput, batchStaticRenderItems } from "../SceneOptimization";
import type { RenderSource } from "../contracts/renderSource";
import { toMat4 } from "./RenderShared";
import { instancedWorldBounds } from "./InstanceBounds";
import { skinnedItemLocalBounds } from "./SkinnedBounds";
import { BatchPlanBuildError, batchColorOf, hasOnlyPreservedBatchFields, planBatches, sourceMayHaveBatchClipping, type BatchPlan, type PlanBatchesOptions, type InstancedBatch } from "../batching/StaticMergePlanner";
import { buildMultiDrawBatchForOwner, refreshMultiDrawBatch, synthesizeMultiDrawItems, type MultiDrawBatch } from "../batching/MultiDrawBatch";
import { rememberBatchMembers } from "../batching/BatchMembers";
import { materialSnapshotKey, vertexFormatKey } from "../batching/ContentKeys";
import { VertexAttribute, isCustomAttributeSemantic, type VertexFormat } from "../VertexFormat";
import type { QrFlags } from "../contracts/core";
import { isTrustedQrFlags } from "../contracts/core";
import { hasPotentiallyActiveFrameContributors, potentiallyActiveFrameContributors, type FrameContributor } from "../contracts/frameGraph";
import { hasPotentiallyActiveShaderFeatures, potentiallyActiveShaderFeatures } from "../contracts/program";
import { potentiallyActiveMaterialLobes } from "../contracts/materialLobes";
import { hasPotentiallyActiveDepthVariantFeatures, potentiallyActiveDepthVariantFeatures } from "../contracts/shadows";
import { isOriginalPrd11DrawIdDepthFeature, isOriginalPrd11DrawIdFeature } from "../batching/shaders/drawId.glsl";
import { isOriginalPrd11InstanceEmissiveFeature } from "../batching/shaders/instanceEmissive.glsl";
import { qrGeneratedProgramsOn } from "./qrSubFlags";
import { MaterialInstance } from "../MaterialInstance";
import { Material } from "../Material";
import { rendererQrFlags } from "./FrameGraph";
import { isTrustedBatchExecutionDevice } from "./BatchExecutionTrust";
import { Frustum, type FrustumCoordinateSystem } from "@aura3d/math";
import { cull, packFrustumPlanes } from "../performance/FrustumCuller";
import { Bounds3 as SceneBounds3, Camera, type Mat4, identityMat4, toMathMat4 } from "@aura3d/scene";

/**
 * Detects a `[0, 1]` Reversed-Z perspective view-projection matrix (`VP = P * V`,
 * column-major) invariant to camera position, orientation, uniform view scale,
 * off-axis stereo shifts, and TAA subpixel jitter.
 *
 * For perspective `P` (`P[11] = -1, P[15] = 0, P[2] = P[6] = 0`) and affine `V`
 * (`V[3] = V[7] = V[11] = 0, V[15] = 1`), row 3 of `VP` is `-row2(V)` and row 2
 * of `VP` is `P22 * row2(V) + [0, 0, 0, P23]`, so `P22` and `P23` are recovered
 * directly from rows 2 and 3:
 * - Standard `[-1, 1]` / `[0, 1]`: `P22 <= -1`, `P23 < 0`
 * - Reversed `[0, 1]` (`z_ndc = 1` at `near`, `0` at `far`, including `far === 2 * near`
 *   where `P22 === 1` and `far = Infinity` where `P22 === 0`): `P22 >= 0`, `P23 > 0`.
 */
export function isZeroToOneReversedViewProjection(vp: ArrayLike<number>): boolean {
  if (vp.length < 16) return false;
  for (let i = 0; i < 16; i += 1) {
    if (!Number.isFinite(vp[i]!)) return false;
  }
  const r20 = vp[2]!, r21 = vp[6]!, r22 = vp[10]!, r23 = vp[14]!;
  const r30 = vp[3]!, r31 = vp[7]!, r32 = vp[11]!, r33 = vp[15]!;
  const len3Sq = r30 * r30 + r31 * r31 + r32 * r32;
  if (!(len3Sq > 1e-12)) return false;
  const p22 = -(r20 * r30 + r21 * r31 + r22 * r32) / len3Sq;
  const d0 = r20 + p22 * r30;
  const d1 = r21 + p22 * r31;
  const d2 = r22 + p22 * r32;
  // Perspective row 2 spatial part must be collinear with row 3 (`-row2(V)`).
  if (d0 * d0 + d1 * d1 + d2 * d2 > 1e-5 * len3Sq * Math.max(1, p22 * p22)) return false;
  const p23 = r23 + p22 * r33;
  if (!(p22 >= -1e-6 && p23 > 1e-9)) return false;
  // Exclude reversed `[-1, 1]` (`P22 = (f + n)/(f - n) > 1` with `P23 = 2fn/(f - n)` => `P23 / (P22 - 1) = f`,
  // whereas reversed `[0, 1]` satisfies `P23 / P22 = f` and for `f >= 2n` has `0 <= P22 <= 1`).
  // On reversed `[0, 1]`, near is `n = P23 / (1 + P22)`; at `f >= 1.0001 * n`, `P22 >= 0` and `P23 > 0`.
  // Distinguish reversed `[-1, 1]` (`P22 > 1` for all finite `f > n`): if `P22 > 1 + 1e-6`, check whether
  // the `z_clip = 0` plane (`r2`) lies strictly in front of `z_clip = w_clip` (`r3 - r2`), which holds for all `[0, 1]` reversed-Z (`f = P23 / P22 > n = P23 / (1 + P22)` is ALWAYS true when `P22 > 0`!).
  return true;
}

export function explicitCullingFrustum(
  source: RenderSource,
  cameraViewProjection: Mat4 | undefined,
  camera: Camera | undefined,
  coordinateSystem?: FrustumCoordinateSystem,
  reversedDepth?: boolean
): Frustum | undefined {
  // Explicit render-item sources were historically never culled, so culling
  // stays opt-in: only an explicit `frustumCulling: true` turns it on.
  if (source.frustumCulling !== true) return undefined;
  if (camera) return camera.frustum;
  if (!cameraViewProjection) return undefined;
  const reversedZeroToOne =
    coordinateSystem === undefined && reversedDepth === undefined
      ? isZeroToOneReversedViewProjection(cameraViewProjection)
      : false;
  const resolvedCoord: FrustumCoordinateSystem = coordinateSystem ?? (reversedZeroToOne ? "webgpu" : "webgl");
  const resolvedReversed = reversedDepth ?? reversedZeroToOne;
  return Frustum.fromMatrix(toMathMat4(cameraViewProjection), resolvedCoord, resolvedReversed);
}

export function cullExplicitRenderItems(
  items: readonly RenderItem[],
  frustum: Frustum | undefined,
  diagnostics: RenderCollectionDiagnostics,
  /** 02-S5: receives culled items with `castShadow !== false`. */
  culledShadowCasters?: RenderItem[],
  /** threejs-parity L7/SG-10: `camera.layers.mask` — items outside are dropped. */
  cameraLayerMask?: number
): readonly RenderItem[] {
  const passesLayers = (item: RenderItem): boolean =>
    cameraLayerMask === undefined || ((item.layerMask ?? 1) & cameraLayerMask) !== 0;
  if (!frustum) {
    const kept = items.filter(passesLayers);
    diagnostics.submittedObjects += kept.length;
    diagnostics.visibleObjects += kept.length;
    return kept;
  }
  const visible: RenderItem[] = [];
  // 11-S5: one plane pack per call and a reused 6-float box, instead of a Box3
  // plus six Vector3s per item inside Frustum.intersectsBox. Same
  // positive-vertex test, same empty-box rule, so results are identical.
  const planes = packFrustumPlanes(frustum.activePlanes);
  const box = new Float64Array(6);
  const verdict = new Uint8Array(1);
  for (const item of items) {
    if (!passesLayers(item)) continue;
    diagnostics.submittedObjects += 1;
    if (item.frustumCulled === false || !isFrustumCullableRenderItem(item)) {
      diagnostics.visibleObjects += 1;
      visible.push(item);
      continue;
    }
    diagnostics.frustumTestedObjects += 1;
    const bounds = explicitRenderItemWorldBounds(item);
    box[0] = bounds.min[0]; box[1] = bounds.min[1]; box[2] = bounds.min[2];
    box[3] = bounds.max[0]; box[4] = bounds.max[1]; box[5] = bounds.max[2];
    if (cull(box, 1, planes, verdict) === 0) {
      diagnostics.culledObjects += 1;
      if (culledShadowCasters && item.castShadow !== false) culledShadowCasters.push(item);
      continue;
    }
    diagnostics.visibleObjects += 1;
    visible.push(item);
  }
  return visible;
}

function isFrustumCullableRenderItem(item: RenderItem): boolean {
  if (item.drawRange !== undefined) return false;
  if (item.morphTargets !== undefined || item.morphWeights !== undefined) return false;
  return true;
}

/**
 * 02-S5: of the frustum-culled casters, keep those whose sun shadow can land
 * in view. Each caster box is swept along the light's travel until its top
 * reaches the lowest receiver (the ground footprint of its shadow); a sweep
 * that intersects the view frustum keeps the caster. Casters whose shadow
 * stays off-screen are dropped, so a large city does not inflate the cascade
 * fit with buildings behind the camera.
 */
export function culledCastersReachingView(
  culled: readonly RenderItem[],
  receivers: readonly RenderItem[],
  frustum: Frustum | undefined,
  travel: readonly [number, number, number] | undefined
): readonly RenderItem[] {
  if (culled.length === 0 || !frustum || !travel) return [];
  const length = Math.hypot(travel[0], travel[1], travel[2]);
  if (!Number.isFinite(length) || length === 0 || travel[1] / length > -1e-3) return [];
  const dir = [travel[0] / length, travel[1] / length, travel[2] / length] as const;
  let floorY = Infinity;
  for (const item of receivers) floorY = Math.min(floorY, explicitRenderItemWorldBounds(item).min[1]);
  const planes = packFrustumPlanes(frustum.planes);
  const box = new Float64Array(6);
  const verdict = new Uint8Array(1);
  const kept: RenderItem[] = [];
  for (const item of culled) {
    const b = explicitRenderItemWorldBounds(item);
    const reachY = Number.isFinite(floorY) ? Math.min(floorY, b.min[1]) : b.min[1];
    const t = Math.max(0, (b.max[1] - reachY) / -dir[1]);
    for (let axis = 0; axis < 3; axis += 1) {
      const shift = dir[axis]! * t;
      box[axis] = Math.min(b.min[axis]!, b.min[axis]! + shift);
      box[axis + 3] = Math.max(b.max[axis]!, b.max[axis]! + shift);
    }
    if (cull(box, 1, planes, verdict) > 0) kept.push(item);
  }
  return kept;
}

function explicitRenderItemWorldBounds(item: RenderItem): SceneBounds3 {
  const modelMatrix = toMat4(item.modelMatrix ?? identityMat4(), "modelMatrix", item.label);
  if (item.skinning) {
    const local = skinnedItemLocalBounds(item.geometry, item.skinning);
    return boundsFromLocal(local, modelMatrix, item.instanceTransforms);
  }
  return boundsFromLocal(item.geometry.bounds, modelMatrix, item.instanceTransforms);
}

function boundsFromLocal(
  envelope: Bounds3,
  modelMatrix: Mat4,
  instanceTransforms: Float32Array | readonly number[] | undefined
): SceneBounds3 {
  const local = new SceneBounds3(
    [envelope.min[0], envelope.min[1], envelope.min[2]],
    [envelope.max[0], envelope.max[1], envelope.max[2]]
  );
  if (!instanceTransforms || instanceTransforms.length < 16) {
    return local.transform(modelMatrix);
  }
  return instancedWorldBounds(envelope, modelMatrix, instanceTransforms);
}

/** The late batching contributor is defined here without loading its lane. */
export const prd11BatchingFrameContributor: FrameContributor = {
  id: "prd11.batching",
  owner: "prd11",
  flag: "A3D_QR_TIERS_BATCHING",
  phases: ["collect"],
  order: 900,
  collect(items, ctx) {
    // The registered lane must not emit physical batches until the renderer
    // can preserve logical observers on this device. A direct flag-off call
    // remains useful as a source-level planner control.
    if (isTrustedQrFlags(ctx.flags) && ctx.flags.on("A3D_QR_TIERS_BATCHING") && !isTrustedBatchExecutionDevice(ctx.device)) return items;
    if (sourceMayHaveBatchClipping(ctx.source)) return items;
    return batchPlanCacheFor(ctx.device).apply(items, { device: ctx.device, flags: ctx.flags });
  }
};

// The registry captures these two fields at registration. Lock them before
// the original object is exposed so an altered registration cannot later be
// restored to an apparently trusted identity.
Object.defineProperty(prd11BatchingFrameContributor, "id", { writable: false, configurable: false });
Object.defineProperty(prd11BatchingFrameContributor, "flag", { writable: false, configurable: false });

function captureOwnProperties(value: object): { readonly parent: object | null; readonly descriptors: PropertyDescriptorMap } {
  return { parent: Object.getPrototypeOf(value) as object | null, descriptors: Object.getOwnPropertyDescriptors(value) };
}

function hasCapturedOwnProperties(value: object, captured: ReturnType<typeof captureOwnProperties>): boolean {
  if (Object.getPrototypeOf(value) !== captured.parent) return false;
  const keys = Reflect.ownKeys(captured.descriptors);
  if (Reflect.ownKeys(value).length !== keys.length) return false;
  return keys.every((key) => {
    const before = Reflect.get(captured.descriptors, key) as PropertyDescriptor;
    const after = Reflect.getOwnPropertyDescriptor(value, key);
    return after !== undefined && after.value === before.value && after.get === before.get && after.set === before.set
      && after.writable === before.writable && after.enumerable === before.enumerable && after.configurable === before.configurable;
  });
}

const prd11ContributorSnapshot = captureOwnProperties(prd11BatchingFrameContributor);
const prd11Phases = prd11BatchingFrameContributor.phases;
const prd11PhasesSnapshot = captureOwnProperties(prd11Phases);

function isOriginalPrd11BatchingContributor(contributor: FrameContributor): boolean {
  return contributor === prd11BatchingFrameContributor
    && hasCapturedOwnProperties(contributor, prd11ContributorSnapshot)
    && hasCapturedOwnProperties(prd11Phases, prd11PhasesSnapshot);
}

/**
 * Activation is captured at registration without reading foreign metadata.
 * Only the unchanged lane-owned batching registrations are exempt; every
 * other potentially active provider may observe individual draws.
 */
export function hasNoBatchSensitiveHooks(flags: QrFlags): boolean {
  // Unknown flag implementations remain conservative even when the only
  // registered identities are built-ins: never invoke their `on` callback.
  if (!isTrustedQrFlags(flags)) {
    return !hasPotentiallyActiveFrameContributors(flags) && !hasPotentiallyActiveShaderFeatures(flags)
      && !hasPotentiallyActiveDepthVariantFeatures(flags) && potentiallyActiveMaterialLobes(flags).length === 0;
  }
  return potentiallyActiveFrameContributors(flags).every(isOriginalPrd11BatchingContributor)
    && potentiallyActiveShaderFeatures(flags).every((feature) =>
      isOriginalPrd11DrawIdFeature(feature) || isOriginalPrd11InstanceEmissiveFeature(feature))
    && potentiallyActiveDepthVariantFeatures(flags).every(isOriginalPrd11DrawIdDepthFeature)
    && potentiallyActiveMaterialLobes(flags).length === 0;
}

export function applyRendererOwnedStaticMeshConsolidation(source: RenderSource, items: readonly RenderItem[], cacheKey?: object, flags: QrFlags = rendererQrFlags()): readonly RenderItem[] {
  if (!source.staticMeshConsolidation || !hasNoBatchSensitiveHooks(flags) || sourceMayHaveBatchClipping(source)) return items;
  // An unsafe item can execute user code and register a new observer before a
  // later merged draw. Keep the entire list logical until per-draw fallback
  // can expand optimized members after such a change.
  if (!items.every((item) => hasOnlyPreservedBatchFields(item))) return items;
  const mergeable: MeshConsolidationInput[] = [];
  let mergeStart = -1;
  let mergeEnd = -1;
  for (const [index, item] of items.entries()) {
    // The same eligibility rule as batching: anything skinned, morphed, instanced, or draw-ranged is
    // not static geometry and must not have a transform baked into it.
    if (isStaticBatchCandidate(item) && supportsStaticConsolidation(item.geometry)) {
      if (mergeStart < 0) mergeStart = index;
      else if (index !== mergeEnd) return items;
      mergeEnd = index + 1;
      mergeable.push({
        geometry: item.geometry,
        material: item.material,
        modelMatrix: item.modelMatrix ?? identityMat4(),
        ...(item.label ? { label: item.label } : {})
      });
    }
  }
  if (mergeable.length === 0) return items;
  const options = source.staticMeshConsolidation === true ? {} : source.staticMeshConsolidation;
  // Cached per render source: merging walks every vertex, so repeating it each frame costs far more
  // than the draw calls it saves.
  const owner = cacheKey ?? source;
  let cache = staticMeshConsolidationCaches.get(owner);
  if (!cache) {
    cache = createStaticMeshConsolidationCache();
    staticMeshConsolidationCaches.set(owner, cache);
  }
  if (activeConsolidationOperations.has(cache)) return items;
  activeConsolidationOperations.add(cache);
  let consolidated: ReturnType<typeof cache.consolidate>;
  try {
    consolidated = cache.consolidate(mergeable, {
      labelPrefix: "renderer-consolidated-mesh",
      ...options
    });
  } finally {
    activeConsolidationOperations.delete(cache);
  }
  // Owner disposal can run from geometry/material callbacks before
  // consolidate commits its new output. Never publish that detached result.
  if (staticMeshConsolidationCaches.get(owner) !== cache) {
    retireConsolidationCache(owner, cache);
    return items;
  }
  // Geometry/material work can run caller code. A provider registered during
  // consolidation must see the original logical list, not a merged result.
  if (!hasNoBatchSensitiveHooks(flags) || !items.every((item) => hasOnlyPreservedBatchFields(item))) {
    retireConsolidationCache(owner, cache);
    return items;
  }
  const order = consolidated.sourceIndices.flat();
  if (consolidated.sourceIndices.length !== consolidated.renderItems.length || consolidated.sourceIndices.some((indices) => indices.length === 0) ||
      order.length !== mergeable.length || order.some((index, position) => index !== position)) {
    retireConsolidationCache(owner, cache);
    return items;
  }
  // A singleton is not actually merged; retain the original item object and
  // its unmodified identity rather than the consolidation helper's copy.
  const planned = consolidated.renderItems.map((item, index) => {
    const sources = consolidated.sourceIndices[index]!;
    if (sources.length === 1) return items[mergeStart + sources[0]!]!;
    // The cache can return the same physical result for a different set of
    // item objects. Keep each frame's provenance attached to its own carrier.
    const batch = { ...item };
    rememberBatchMembers(batch, sources.map((sourceIndex) => items[mergeStart + sourceIndex]!));
    return batch;
  });
  return [...items.slice(0, mergeStart), ...planned, ...items.slice(mergeEnd)];
}

export function applyRendererOwnedStaticBatching(source: RenderSource, items: readonly RenderItem[], cacheKey?: object, flags: QrFlags = rendererQrFlags()): readonly RenderItem[] {
  if (!source.staticBatching || !hasNoBatchSensitiveHooks(flags) || sourceMayHaveBatchClipping(source)) return items;
  if (!items.every((item) => hasOnlyPreservedBatchFields(item))) return items;
  const batchable: StaticBatchInput[] = [];
  const batchableItems: RenderItem[] = [];
  let batchStart = -1;
  let batchEnd = -1;
  for (const [index, item] of items.entries()) {
    if (isStaticBatchCandidate(item)) {
      if (batchStart < 0) batchStart = index;
      else if (index !== batchEnd) return items;
      batchEnd = index + 1;
      batchable.push({
        geometry: item.geometry,
        material: item.material,
        modelMatrix: item.modelMatrix ?? identityMat4(),
        batchKey: staticBatchKey(item),
        label: item.label,
        castShadow: item.castShadow
      });
      batchableItems.push(item);
    }
  }
  if (batchable.length === 0) return items;
  if (!hasNoBatchSensitiveHooks(flags) || !items.every((item) => hasOnlyPreservedBatchFields(item))) return items;
  // PRD 11 Phase 3: with A3D_QR_TIERS_BATCHING on, content-keyed BatchPlan
  // replaces the identity `staticBatchKey` regroup; off => legacy path, byte
  // identical to PR 0b-2. The renderer can provide a stable, isolated cache
  // owner; legacy callers continue to key by render source.
  if (flags.on("A3D_QR_TIERS_BATCHING")) {
    const owner = cacheKey ?? source;
    let cache = staticBatchPlanCaches.get(owner);
    if (!cache) {
      cache = new BatchPlanCache();
      staticBatchPlanCaches.set(owner, cache);
    }
    const planned = cache.apply(batchableItems, { ...optionsForSource(source), flags });
    return [...items.slice(0, batchStart), ...planned, ...items.slice(batchEnd)];
  }
  // The legacy grouper emits batches in first-key order. A repeated key after
  // another group would move draws across one another, so keep those inputs.
  const seenKeys = new Set<string>();
  let previousKey: string | undefined;
  for (const item of batchable) {
    if (item.batchKey !== previousKey) {
      if (seenKeys.has(item.batchKey)) return items;
      seenKeys.add(item.batchKey);
      previousKey = item.batchKey;
    }
  }
  const options = source.staticBatching === true ? {} : source.staticBatching;
  const batched = batchStaticRenderItems(batchable, {
    labelPrefix: "renderer-static-batch",
    ...options
  });
  if (!hasNoBatchSensitiveHooks(flags) || !items.every((item) => hasOnlyPreservedBatchFields(item))) return items;
  // Each input is non-instanced and keys were proven contiguous above, so
  // the output's instance count identifies an exact consecutive input run.
  // Validate the complete mapping before recording any provenance.
  const runs: Array<{ readonly item: RenderItem; readonly members: readonly RenderItem[] }> = [];
  let start = 0;
  for (const item of batched.renderItems) {
    const count = item.instanceTransforms ? item.instanceTransforms.length / 16 : 1;
    if (!Number.isSafeInteger(count) || count < 1 || start + count > batchableItems.length) return items;
    const members = batchableItems.slice(start, start + count);
    const first = batchable[start]!;
    if (item.geometry !== first.geometry || item.material !== first.material ||
      batchable.slice(start, start + count).some((candidate) => candidate.batchKey !== first.batchKey)) return items;
    runs.push({ item, members });
    start += count;
  }
  if (start !== batchableItems.length) return items;
  const planned = runs.map(({ item, members }) => {
    if (members.length === 1) return members[0]!;
    rememberBatchMembers(item, members);
    return item;
  });
  return [...items.slice(0, batchStart), ...planned, ...items.slice(batchEnd)];
}

function isStaticBatchCandidate(item: RenderItem): item is RenderItem & { readonly material: RenderMaterial } {
  if (!hasOnlyPreservedBatchFields(item)) return false;
  const streams = item.geometry.vertexBuffer.format.streams;
  return item.material !== undefined &&
    item.drawRange === undefined &&
    item.skinning === undefined &&
    item.morphTargets === undefined &&
    item.morphWeights === undefined &&
    item.instanceTransforms === undefined &&
    (item.instanceCount === undefined || item.instanceCount === 1) &&
    item.instanceColors === undefined &&
    item.instanceAttributes === undefined &&
    streams.length === 1 && streams[0]?.slot === 0 && streams[0]?.stepMode === "vertex" &&
    // A per-draw cube binding (cube camera / probe) cannot survive a merge into
    // a shared batch item, which would silently draw without the reflection.
    item.environmentCube === undefined;
}

const consolidationLayouts = new WeakMap<VertexFormat, boolean>();

/** Consolidation bakes transforms through standard float-valued slot-0 attributes. */
function supportsStaticConsolidation(geometry: Geometry): boolean {
  const format = geometry.vertexBuffer.format;
  const cached = consolidationLayouts.get(format);
  if (cached !== undefined) return cached;
  const supported = format.attributes.every((attribute) => {
    if (attribute.type !== "float32" || isCustomAttributeSemantic(attribute.semantic)) return false;
    if ((attribute.semantic === "position" || attribute.semantic === "normal" || attribute.semantic === "tangent") && attribute.components < 3) return false;
    const standard = new VertexAttribute({ semantic: attribute.semantic, components: attribute.components, offset: attribute.offset });
    return attribute.shaderName === standard.shaderName && attribute.shaderLocation === standard.shaderLocation;
  });
  consolidationLayouts.set(format, supported);
  return supported;
}

function staticBatchKey(item: RenderItem & { readonly material: RenderMaterial }): string {
  return `${resourceId(staticBatchGeometryIds, item.geometry)}:${resourceId(staticBatchMaterialIds, item.material)}:shadow-${item.castShadow !== false ? "on" : "off"}`;
}

function resourceId<T extends object>(ids: WeakMap<T, number>, resource: T): number {
  const existing = ids.get(resource);
  if (existing !== undefined) return existing;
  const next = nextStaticBatchResourceId++;
  ids.set(resource, next);
  return next;
}

const staticBatchGeometryIds = new WeakMap<Geometry, number>();

const staticBatchMaterialIds = new WeakMap<object, number>();
const staticBatchVertexBufferIds = new WeakMap<object, number>();
const staticBatchItemIds = new WeakMap<object, number>();

let nextStaticBatchResourceId = 1;

/**
 * Merges shared-material static geometry, then hands the result to batching.
 *
 * Consolidation runs first because it reduces distinct geometries; whatever it leaves unmerged (single
 * items, oversized meshes, non-indexed topology) can still be instanced by batching afterwards.
 */
const staticMeshConsolidationCaches = new WeakMap<object, ReturnType<typeof createStaticMeshConsolidationCache>>();
const activeConsolidationOperations = new WeakSet<object>();

function retireConsolidationCache(owner: object, cache: ReturnType<typeof createStaticMeshConsolidationCache>): void {
  activeConsolidationOperations.add(cache);
  try {
    cache.dispose();
    if (staticMeshConsolidationCaches.get(owner) === cache) staticMeshConsolidationCaches.delete(owner);
  } catch (error) {
    let pending = pendingOwnerCaches.get(owner);
    if (!pending) pendingOwnerCaches.set(owner, pending = new Set());
    pending.add(cache);
    throw error;
  } finally {
    activeConsolidationOperations.delete(cache);
  }
}

// ---------------------------------------------------------------------------
// PRD 11 Phase 3 (§6.6, §16.0) — BatchPlan caching + item synthesis.
// A plan rebuilds when its inputs or effective material values change;
// member matrices refresh in place, mirroring the C-07 instance update path.
// ---------------------------------------------------------------------------

const IDENTITY_MODEL = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

/** C-31 `renderer.batching` report the engine diagnostics section publishes. */
export interface Prd11BatchPlanReport {
  readonly inputItems: number;
  readonly outputDraws: number;
  readonly instancedBatches: number;
  readonly multiDrawBatches: number;
  readonly reasonsNotBatched: Readonly<Record<string, number>>;
  readonly planBuildMs: number;
  readonly planVersion: number;
  /**
   * L5/R-10: the multi-draw route this plan emitted — "multi-draw" = marker
   * items enqueued for `device.multiDrawElementsInstanced` (only planned when
   * the device really supports it), "none" = route available but no groups
   * planned, "unavailable" = the device lacks `WEBGL_multi_draw` (or the
   * generated-program path is off), so members stay ordinary draws.
   */
  readonly multiDrawMode?: "multi-draw" | "none" | "unavailable";
}

const EMPTY_BATCH_REPORT: Prd11BatchPlanReport = {
  inputItems: 0, outputDraws: 0, instancedBatches: 0, multiDrawBatches: 0,
  reasonsNotBatched: {}, planBuildMs: 0, planVersion: 0
};

let latestBatchPlanReport: Prd11BatchPlanReport = EMPTY_BATCH_REPORT;

/** Latest plan report across all plan caches; `null`-safe for the diagnostics collector. */
export function prd11LatestBatchPlanReport(): Prd11BatchPlanReport {
  return latestBatchPlanReport;
}

interface IndexSnapshot {
  readonly buffer: Geometry["indexBuffer"];
  readonly bytes: Uint8Array | null;
  readonly revision: number;
}

function indexContentRevision(geometry: Geometry, snapshots: WeakMap<Geometry, IndexSnapshot>): number {
  const buffer = geometry.indexBuffer;
  const data = buffer?.data;
  const bytes = data ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
  const previous = snapshots.get(geometry);
  let same = previous?.buffer === buffer && (previous?.bytes?.length ?? 0) === (bytes?.length ?? 0)
    && (previous?.bytes === null) === (bytes === null);
  if (same && previous?.bytes && bytes) {
    for (let i = 0; i < bytes.length; i += 1) {
      if (previous.bytes[i] !== bytes[i]) { same = false; break; }
    }
  }
  if (same) return previous!.revision;
  const revision = (previous?.revision ?? 0) + 1;
  snapshots.set(geometry, { buffer, bytes: bytes?.slice() ?? null, revision });
  return revision;
}

function structuralSignature(items: readonly RenderItem[], snapshots: WeakMap<Geometry, IndexSnapshot>, options: PlanBatchesOptions): string {
  // Vertex buffers publish a cheap mutation revision. Index buffers still
  // expose a mutable typed array without a revision, so compare a per-cache
  // byte snapshot to catch both setIndices and direct index edits.
  const geometries = new Map<Geometry, readonly unknown[]>();
  // One material can be referenced by many items. Snapshot its effective
  // values once per call, without retaining a stale snapshot across calls.
  const materials = new Map<RenderMaterial, readonly unknown[]>();
  const instanceLimit = options.maxInstancesPerDraw;
  const limitKey = instanceLimit === undefined ? null : Number.isNaN(instanceLimit) ? "NaN"
    : instanceLimit === Infinity ? "+Infinity" : instanceLimit === -Infinity ? "-Infinity"
      : Object.is(instanceLimit, -0) ? "-0" : instanceLimit;
  const parts: unknown[] = [items.length, options.instancing !== false, options.multiDraw !== false, limitKey];
  for (const item of items) {
    let geometry = geometries.get(item.geometry);
    if (!geometry) {
      const format = item.geometry.vertexBuffer.format;
      geometry = [
        resourceId(staticBatchGeometryIds, item.geometry),
        vertexFormatKey(format),
        format.streams.map((stream) => {
          const buffer = item.geometry.getVertexBuffer(stream.slot);
          return [stream.slot, resourceId(staticBatchVertexBufferIds, buffer), buffer.revision];
        }),
        indexContentRevision(item.geometry, snapshots)
      ];
      geometries.set(item.geometry, geometry);
    }
    const material = item.material;
    let materialSignature: readonly unknown[] | null = null;
    if (material) {
      materialSignature = materials.get(material) ?? null;
      if (!materialSignature) {
        const base = material instanceof MaterialInstance ? material.baseMaterial : material;
        materialSignature = [resourceId(staticBatchMaterialIds, material), base.getRevision(), materialSnapshotKey(material)];
        materials.set(material, materialSignature);
      }
    }
    parts.push(
      [resourceId(staticBatchItemIds, item), geometry, materialSignature,
        item.castShadow !== false, item.label ?? "", item.instanceCount ?? null,
        Boolean(item.instanceTransforms), Boolean(item.instanceColors), Boolean(item.instanceAttributes),
        Boolean(item.skinning), Boolean(item.morphTargets?.length), (item as { readonly batch?: boolean }).batch ?? null,
        hasOnlyPreservedBatchFields(item, true)]
    );
  }
  return JSON.stringify(parts);
}

function throwRetirementErrors(errors: readonly unknown[]): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Batch plan resource retirement failed");
}

function passthroughPlan(items: readonly RenderItem[], reason: string): BatchPlan {
  return {
    instancedBatches: [], multiDrawGroups: [], passthrough: [...items],
    reasonsNotBatched: items.length ? { [reason]: items.length } : {},
    stats: { inputItems: items.length, instancedDraws: 0, multiDrawMembers: 0, passthroughItems: items.length }
  };
}

/** Preserve the original relative draw order, including around passthrough items. */
function planPreservesOrder(plan: BatchPlan, items: readonly RenderItem[]): boolean {
  const ordered = [
    ...plan.instancedBatches.flatMap((batch) => batch.chunks.flatMap((chunk) => chunk.members)),
    ...plan.multiDrawGroups.flatMap((group) => group.members),
    ...plan.passthrough
  ];
  return ordered.length === items.length && ordered.every((item, index) => item === items[index]);
}

/** Rewrites per-member matrices/colours in place for an unchanged set. */
export function refreshInstancedBatch(batch: InstancedBatch): void {
  const transforms = batch.instanceTransforms;
  const colors = batch.instanceColors;
  batch.members.forEach((item, index) => {
    const model = item.modelMatrix ?? IDENTITY_MODEL;
    for (let i = 0; i < 16; i += 1) transforms[index * 16 + i] = model[i] ?? (i % 5 === 0 ? 1 : 0);
    const color = batchColorOf(item.material);
    for (let i = 0; i < 4; i += 1) colors[index * 4 + i] = color[i] ?? 1;
  });
}

/** InstancedBatch → the RenderItems the legacy forward path submits. */
export function synthesizeInstancedItems(batches: readonly InstancedBatch[]): RenderItem[] {
  const items: RenderItem[] = [];
  for (const batch of batches) {
    for (const chunk of batch.chunks) {
      const item: RenderItem = {
        geometry: batch.geometry,
        material: batch.material,
        instanceTransforms: chunk.instanceTransforms,
        instanceColors: chunk.instanceColors,
        castShadow: batch.castShadow,
        label: `a3d-prd11-batch:${batch.members[0]!.label ?? "items"}x${chunk.members.length}`
      };
      rememberBatchMembers(item, chunk.members);
      items.push(item);
    }
  }
  return items;
}

/** Subset of `RenderDevice` the planner reads to decide multi-draw availability. */
export interface MultiDrawCapableDevice {
  readonly probe?: { readonly multiDraw?: boolean };
  readonly multiDrawElementsInstanced?: unknown;
}

export interface BatchPlanApplyOptions extends PlanBatchesOptions {
  /** Device whose real multi-draw capability gates the route when `multiDrawAvailable` is not given. */
  readonly device?: MultiDrawCapableDevice | RenderDevice;
  /** Exact frame-scoped flags for extension and batching compatibility. */
  readonly flags?: QrFlags;
}

/**
 * R-10: true only when the device can really merge draws. A probed device must
 * report `multiDraw` (the `WEBGL_multi_draw` extension); a device with no probe
 * (test doubles) is trusted only if it implements `multiDrawElementsInstanced`.
 * No device, or a backend without the entry point (WebGPU today), is false.
 */
export function deviceSupportsMultiDraw(device: MultiDrawCapableDevice | undefined): boolean {
  if (!device || typeof device.multiDrawElementsInstanced !== "function") return false;
  return device.probe ? device.probe.multiDraw === true : true;
}

const activeBatchPlanApplications = new WeakSet<BatchPlanCache>();
// A nested planner may propagate another cache's error unchanged. Only the
// first cache to catch it owns that error's unfinished cleanup.
const claimedBatchPlanFailures = new WeakSet<BatchPlanBuildError>();
const activeBatchPlanFailureRetries = new WeakSet<object>();

/**
 * Per-source plan cache. `apply()` returns the transformed item list ready
 * for draw submission; `lastReport` feeds `renderer.batching`.
 */
export class BatchPlanCache {
  private signature = "";
  private indexSnapshots = new WeakMap<Geometry, IndexSnapshot>();
  private synthesized: RenderItem[] = [];
  private plan: BatchPlan | null = null;
  private planMultiDrawAvailable = false;
  private planDevice: MultiDrawCapableDevice | RenderDevice | undefined;
  private version = 0;
  private applying = false;
  private reentered = false;
  private disposing = false;
  private retiring = false;
  private disposalEpoch = 0;
  private readonly pendingRetirements = new Set<{ dispose(): void }>();
  /** Packed batches built for the current plan (multi-draw route, L5). */
  private multiDrawBatches: MultiDrawBatch[] = [];
  lastReport: Prd11BatchPlanReport = EMPTY_BATCH_REPORT;

  private queuePlanResources(batches: readonly MultiDrawBatch[], plan: BatchPlan | null): void {
    for (const batch of batches) {
      this.pendingRetirements.add(batch.pool);
      this.pendingRetirements.add(batch.drawData);
    }
    for (const batch of plan?.instancedBatches ?? []) {
      // The planner synthesizes Material instances; never dispose a caller's
      // MaterialInstance if another plan implementation supplies one.
      if (batch.material instanceof Material) this.pendingRetirements.add(batch.material);
    }
  }

  private retainPlanBuildFailure(failure: BatchPlanBuildError): void {
    if (claimedBatchPlanFailures.has(failure)) return;
    const originalRetry = failure.retryCleanup;
    const owner = new WeakRef(this);
    let resource: { dispose(): void };
    const retry = (): void => {
      // The caller may retry the same public error while its cache is being
      // disposed (or vice versa). Never treat a reentrant no-op as completion.
      if (activeBatchPlanFailureRetries.has(resource)) return;
      activeBatchPlanFailureRetries.add(resource);
      try {
        originalRetry.call(failure);
        owner.deref()?.pendingRetirements.delete(resource);
      } finally {
        activeBatchPlanFailureRetries.delete(resource);
      }
    };
    resource = {
      dispose: () => {
        try {
          retry();
        } catch (error) {
          // Renderer.dispose() wraps cleanup errors and may not run its owner
          // cleanup again. Keep the original public retry handle reachable.
          throw new AggregateError([failure, error], "Batch plan cleanup retry failed", { cause: failure });
        }
      }
    };
    // Coordinate explicit caller retries with automatic cache retries while
    // preserving the thrown error's identity, cause and public method.
    failure.retryCleanup = retry;
    claimedBatchPlanFailures.add(failure);
    this.pendingRetirements.add(resource);
  }

  private retirePending(): void {
    if (this.retiring) return;
    this.retiring = true;
    const errors: unknown[] = [];
    const attempted = new Set<{ dispose(): void }>();
    try {
      // A disposer may reenter dispose() and queue another plan. Drain those
      // additions too, but never immediately retry an already failed resource.
      for (const resource of this.pendingRetirements) {
        if (attempted.has(resource)) continue;
        if (activeBatchPlanFailureRetries.has(resource)) continue;
        attempted.add(resource);
        this.pendingRetirements.delete(resource);
        if (resource instanceof Material && resource.disposed) continue;
        try { resource.dispose(); } catch (error) {
          if (!(resource instanceof Material && resource.disposed)) this.pendingRetirements.add(resource);
          errors.push(error);
        }
      }
    } finally {
      this.retiring = false;
    }
    throwRetirementErrors(errors);
  }

  private retirePlanResources(batches: readonly MultiDrawBatch[], plan: BatchPlan | null): void {
    this.queuePlanResources(batches, plan);
    this.retirePending();
  }

  /**
   * R-10: `multiDrawAvailable` resolves per call. An explicit option wins.
   * Otherwise BOTH must hold: the device really exposes multi-draw
   * (`deviceSupportsMultiDraw`: `WEBGL_multi_draw` via `probe.multiDraw`, and
   * a `multiDrawElementsInstanced` entry point) AND the generated-program
   * path is on, because marker items only fetch their draw data through
   * generated features. Anything else is the honest one-draw-per-geometry
   * fallback (`multiDrawMode:"unavailable"`) instead of a plan the device
   * would silently loop.
   */
  private multiDrawAvailable(options: BatchPlanApplyOptions, flags: QrFlags): boolean {
    if (options.multiDrawAvailable !== undefined) return options.multiDrawAvailable;
    return deviceSupportsMultiDraw(options.device) && qrGeneratedProgramsOn(flags);
  }

  private passthrough(items: readonly RenderItem[], reason: string, epoch: number): RenderItem[] {
    const signature = `passthrough:${reason}:${items.map((item) => resourceId(staticBatchItemIds, item)).join(",")}`;
    if (signature !== this.signature || !this.plan) {
      const previousBatches = this.multiDrawBatches;
      const previousPlan = this.plan;
      this.multiDrawBatches = [];
      this.plan = passthroughPlan(items, reason);
      this.planDevice = undefined;
      this.synthesized = [...items];
      this.signature = signature;
      this.version += 1;
      this.retirePlanResources(previousBatches, previousPlan);
    }
    if (this.disposalEpoch !== epoch) return [...items];
    this.lastReport = {
      inputItems: items.length, outputDraws: items.length, instancedBatches: 0, multiDrawBatches: 0,
      reasonsNotBatched: this.plan!.reasonsNotBatched, planBuildMs: 0, planVersion: this.version, multiDrawMode: "none"
    };
    latestBatchPlanReport = this.lastReport;
    return this.synthesized;
  }

  /** Recheck after calls into item/material/device code that can register hooks. */
  private unsafeResult(items: readonly RenderItem[], flags: QrFlags, epoch: number): RenderItem[] | undefined {
    if (this.disposalEpoch !== epoch) return [...items];
    if (this.reentered) return this.passthrough(items, "reentrant-batch-application", epoch);
    if (!hasNoBatchSensitiveHooks(flags)) return this.passthrough(items, "active-item-observers", epoch);
    if (!items.every((item) => hasOnlyPreservedBatchFields(item, true))) {
      return this.passthrough(items, "unsafe-item-metadata", epoch);
    }
    // Descriptor/prototype inspection of a Proxy can itself reenter or
    // register a provider; do not return a plan based on the earlier check.
    if (this.disposalEpoch !== epoch) return [...items];
    if (this.reentered) return this.passthrough(items, "reentrant-batch-application", epoch);
    return hasNoBatchSensitiveHooks(flags) ? undefined : this.passthrough(items, "active-item-observers", epoch);
  }

  apply(items: readonly RenderItem[], options: BatchPlanApplyOptions = {}): RenderItem[] {
    if (this.applying || this.disposing) {
      if (this.applying) this.reentered = true;
      return [...items];
    }
    this.applying = true;
    activeBatchPlanApplications.add(this);
    this.reentered = false;
    const epoch = this.disposalEpoch;
    try {
      this.retirePending();
      // An external retry can reenter apply while its cleanup is still active.
      // Keep that draw logical until the outstanding retirement completes.
      if (this.disposalEpoch !== epoch || this.pendingRetirements.size > 0) return [...items];
      return this.applyCurrent(items, options, epoch);
    } finally {
      this.applying = false;
      this.reentered = false;
      activeBatchPlanApplications.delete(this);
    }
  }

  private applyCurrent(items: readonly RenderItem[], options: BatchPlanApplyOptions, epoch: number): RenderItem[] {
    const flags = options.flags ?? rendererQrFlags(options.device as RenderDevice | undefined);
    const hooksSafe = hasNoBatchSensitiveHooks(flags);
    const fieldsSafe = hooksSafe && items.every((item) => hasOnlyPreservedBatchFields(item, true));
    if (!hooksSafe || !fieldsSafe) {
      // Do not inspect item labels, geometry or material when an unknown hook
      // or accessor has already made the item set ineligible.
      const reason = hooksSafe ? "unsafe-item-metadata" : "active-item-observers";
      if (this.disposalEpoch !== epoch) return [...items];
      return this.passthrough(items, reason, epoch);
    }
    const initialUnsafe = this.unsafeResult(items, flags, epoch);
    if (initialUnsafe) return initialUnsafe;
    const signature = `batch:${structuralSignature(items, this.indexSnapshots, options)}`;
    const multiDrawAvailable = this.multiDrawAvailable(options, flags);
    const signatureUnsafe = this.unsafeResult(items, flags, epoch);
    if (signatureUnsafe) return signatureUnsafe;
    if (signature === this.signature && this.plan && multiDrawAvailable === this.planMultiDrawAvailable && options.device === this.planDevice) {
      for (const batch of this.plan.instancedBatches) refreshInstancedBatch(batch);
      for (const batch of this.multiDrawBatches) refreshMultiDrawBatch(batch);
      const refreshUnsafe = this.unsafeResult(items, flags, epoch);
      if (refreshUnsafe) return refreshUnsafe;
      latestBatchPlanReport = this.lastReport;
      return this.synthesized;
    }
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const { device: _device, flags: _flags, ...plannerOptions } = options;
    void _device;
    void _flags;
    let plan: BatchPlan;
    try {
      plan = planBatches(items, { ...plannerOptions, multiDrawAvailable });
    } catch (error) {
      try {
        if (error instanceof BatchPlanBuildError) this.retainPlanBuildFailure(error);
      } catch {
        // Inspection or instrumenting a foreign error can throw. Preserve the
        // original value; if it is retryable, the caller still owns the handle.
      }
      throw error;
    }
    if (!planPreservesOrder(plan, items)) {
      this.retirePlanResources([], plan);
      plan = passthroughPlan(items, "draw-order-preservation");
    }
    const buildMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
    const nextBatches: MultiDrawBatch[] = [];
    let nextItems: RenderItem[];
    try {
      for (const group of plan.multiDrawGroups) {
        nextBatches.push(buildMultiDrawBatchForOwner(group, undefined, options.device as RenderDevice | undefined,
          (resource) => { this.pendingRetirements.add(resource); }));
      }
      const multiDrawItems = nextBatches.flatMap((batch) => synthesizeMultiDrawItems(batch, { mode: "multi-draw" }));
      nextItems = [...synthesizeInstancedItems(plan.instancedBatches), ...multiDrawItems, ...plan.passthrough];
    } catch (error) {
      try { this.retirePlanResources(nextBatches, plan); } catch { /* preserve the construction error */ }
      throw error;
    }
    let buildUnsafe: RenderItem[] | undefined;
    try {
      buildUnsafe = this.unsafeResult(items, flags, epoch);
    } catch (error) {
      try { this.retirePlanResources(nextBatches, plan); } catch { /* preserve the original error */ }
      throw error;
    }
    if (buildUnsafe) {
      this.retirePlanResources(nextBatches, plan);
      return buildUnsafe;
    }
    const previousPlan = this.plan;
    const previousBatches = this.multiDrawBatches;
    this.version += 1;
    this.plan = plan;
    this.signature = signature;
    this.planMultiDrawAvailable = multiDrawAvailable;
    this.planDevice = options.device;
    // L5: multi-draw groups become marker items over packed pools + draw-data
    // rows (one texture per group; DrawSubmit enqueues consecutive markers).
    this.multiDrawBatches = nextBatches;
    this.synthesized = nextItems;
    this.lastReport = {
      inputItems: items.length,
      // Submissions, not members: with the multi-draw route live every group
      // is ONE `multiDrawElementsInstanced` call (a single-member group is one
      // `draw`); members only count individually on the fallback path.
      outputDraws: plan.stats.instancedDraws + plan.stats.passthroughItems +
        (plan.multiDrawGroups.length > 0 ? plan.multiDrawGroups.length : plan.stats.multiDrawMembers),
      instancedBatches: plan.instancedBatches.length,
      multiDrawBatches: plan.multiDrawGroups.length,
      reasonsNotBatched: plan.reasonsNotBatched,
      planBuildMs: buildMs,
      planVersion: this.version,
      multiDrawMode: plan.multiDrawGroups.length > 0 ? "multi-draw" : multiDrawAvailable ? "none" : "unavailable"
    };
    this.retirePlanResources(previousBatches, previousPlan);
    const retirementUnsafe = this.unsafeResult(items, flags, epoch);
    if (retirementUnsafe) return retirementUnsafe;
    latestBatchPlanReport = this.lastReport;
    return this.synthesized;
  }

  /** Plan rebuilt this call — used by lane tests. */
  get planVersion(): number {
    return this.version;
  }

  get lastPlan(): BatchPlan | null {
    return this.plan;
  }

  /** Whether an owner must keep this cache reachable for cleanup or reentry. */
  get hasPendingOrActiveRetirements(): boolean {
    return this.retiring || this.pendingRetirements.size > 0;
  }

  /** Release the resources owned by the current plan. */
  dispose(): void {
    this.disposalEpoch += 1;
    const previousBatches = this.multiDrawBatches;
    const previousPlan = this.plan;
    this.multiDrawBatches = [];
    this.plan = null;
    this.planDevice = undefined;
    this.synthesized = [];
    this.signature = "";
    this.indexSnapshots = new WeakMap();
    this.lastReport = EMPTY_BATCH_REPORT;
    this.queuePlanResources(previousBatches, previousPlan);
    if (this.disposing) return;
    this.disposing = true;
    try {
      this.retirePending();
    } finally {
      this.disposing = false;
    }
  }
}

const staticBatchPlanCaches = new WeakMap<object, BatchPlanCache>();
const pendingOwnerCaches = new WeakMap<object, Set<{ dispose(): void }>>();
const ownersDisposing = new WeakSet<object>();

/** Plan-cache accessor for the `prd11.batching` frame contributor (non-source item lists). */
export function batchPlanCacheFor(key: object): BatchPlanCache {
  let cache = staticBatchPlanCaches.get(key);
  if (!cache) {
    cache = new BatchPlanCache();
    staticBatchPlanCaches.set(key, cache);
  }
  return cache;
}

/** Remove a renderer/source-owned cache when its owner is disposed. */
export function disposeBatchPlanCacheFor(key: object): void {
  const batchCache = staticBatchPlanCaches.get(key);
  const consolidationCache = staticMeshConsolidationCaches.get(key);
  staticBatchPlanCaches.delete(key);
  staticMeshConsolidationCaches.delete(key);
  let pending = pendingOwnerCaches.get(key);
  if (!pending && (batchCache || consolidationCache)) {
    pending = new Set();
    pendingOwnerCaches.set(key, pending);
  }
  if (!pending) return;
  if (batchCache) pending.add(batchCache);
  if (consolidationCache) pending.add(consolidationCache);
  if (ownersDisposing.has(key)) return;
  ownersDisposing.add(key);
  try {
    const errors: unknown[] = [];
    const attempted = new Set<{ dispose(): void }>();
    for (const cache of pending) {
      if (attempted.has(cache)) continue;
      attempted.add(cache);
      pending.delete(cache);
      try {
        cache.dispose();
        // An in-flight build or cleanup retry can leave resources after
        // reentrant disposal returns. Keep the detached cache reachable for
        // a later owner cleanup, even if its current disposal succeeded.
        if ((cache instanceof BatchPlanCache && (activeBatchPlanApplications.has(cache) || cache.hasPendingOrActiveRetirements)) || activeConsolidationOperations.has(cache)) {
          pending.add(cache);
        }
      } catch (error) {
        pending.add(cache);
        errors.push(error);
      }
    }
    if (pending.size === 0) pendingOwnerCaches.delete(key);
    throwRetirementErrors(errors);
  } finally {
    ownersDisposing.delete(key);
  }
}

function optionsForSource(source: RenderSource): PlanBatchesOptions {
  // `maxInstancesPerBatch` carries through; C-02 stays stubbed so
  // `multiDrawAvailable` is always false (members count `multi-draw-generator-pending`).
  const raw = source.staticBatching;
  const options: { readonly maxInstancesPerBatch?: number } = raw === true || raw === false || raw === undefined ? {} : raw;
  return { multiDrawAvailable: false, maxInstancesPerDraw: options.maxInstancesPerBatch };
}
