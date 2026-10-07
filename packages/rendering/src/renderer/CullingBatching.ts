// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from Renderer.ts; 0 changed logic lines.
// File: packages/rendering/src/renderer/CullingBatching.ts — owner lane 11.

import type { RenderItem, RenderMaterial } from "../ForwardPass";
import { type Bounds3, Geometry } from "../Geometry";
import { type MeshConsolidationInput, createStaticMeshConsolidationCache } from "../MeshConsolidation";
import type { RenderCollectionDiagnostics } from "../Renderer";
import { type StaticBatchInput, batchStaticRenderItems } from "../SceneOptimization";
import type { RenderSource } from "../contracts/renderSource";
import { toMat4 } from "./RenderShared";
import { skinnedItemLocalBounds } from "./SkinnedBounds";
import { planBatches, type BatchPlan, type PlanBatchesOptions, type InstancedBatch } from "../batching/StaticMergePlanner";
import { MaterialInstance } from "../MaterialInstance";
import { rendererQrFlags } from "./FrameGraph";
import { Frustum } from "@aura3d/math";
import { Bounds3 as SceneBounds3, Camera, type Mat4, identityMat4, multiplyMat4, toMathMat4 } from "@aura3d/scene";

export function explicitCullingFrustum(
  source: RenderSource,
  cameraViewProjection: Mat4 | undefined,
  camera: Camera | undefined
): Frustum | undefined {
  // Explicit render-item sources were historically never culled, so culling
  // stays opt-in: only an explicit `frustumCulling: true` turns it on.
  if (source.frustumCulling !== true) return undefined;
  if (camera) return camera.frustum;
  if (!cameraViewProjection) return undefined;
  return Frustum.fromMatrix(toMathMat4(cameraViewProjection));
}

export function cullExplicitRenderItems(
  items: readonly RenderItem[],
  frustum: Frustum | undefined,
  diagnostics: RenderCollectionDiagnostics
): readonly RenderItem[] {
  if (!frustum) {
    diagnostics.submittedObjects += items.length;
    diagnostics.visibleObjects += items.length;
    return items;
  }
  const visible: RenderItem[] = [];
  for (const item of items) {
    diagnostics.submittedObjects += 1;
    if (!isFrustumCullableRenderItem(item)) {
      diagnostics.visibleObjects += 1;
      visible.push(item);
      continue;
    }
    diagnostics.frustumTestedObjects += 1;
    const bounds = explicitRenderItemWorldBounds(item);
    if (!frustum.intersectsBox(bounds.toMathBox())) {
      diagnostics.culledObjects += 1;
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
  let bounds = new SceneBounds3();
  for (let offset = 0; offset + 16 <= instanceTransforms.length; offset += 16) {
    const instanceMatrix = toMat4(instanceTransforms.slice(offset, offset + 16), "instanceTransforms");
    bounds = bounds.union(local.transform(multiplyMat4(modelMatrix, instanceMatrix)));
  }
  return bounds;
}

export function applyRendererOwnedStaticMeshConsolidation(source: RenderSource, items: readonly RenderItem[]): readonly RenderItem[] {
  if (!source.staticMeshConsolidation) return items;
  const mergeable: MeshConsolidationInput[] = [];
  const passthrough: RenderItem[] = [];
  for (const item of items) {
    // The same eligibility rule as batching: anything skinned, morphed, instanced, or draw-ranged is
    // not static geometry and must not have a transform baked into it.
    if (isStaticBatchCandidate(item)) {
      mergeable.push({
        geometry: item.geometry,
        material: item.material,
        modelMatrix: item.modelMatrix ?? identityMat4(),
        ...(item.label ? { label: item.label } : {})
      });
    } else {
      passthrough.push(item);
    }
  }
  if (mergeable.length === 0) return items;
  const options = source.staticMeshConsolidation === true ? {} : source.staticMeshConsolidation;
  // Cached per render source: merging walks every vertex, so repeating it each frame costs far more
  // than the draw calls it saves.
  let cache = staticMeshConsolidationCaches.get(source as unknown as object);
  if (!cache) {
    cache = createStaticMeshConsolidationCache();
    staticMeshConsolidationCaches.set(source as unknown as object, cache);
  }
  const consolidated = cache.consolidate(mergeable, {
    labelPrefix: "renderer-consolidated-mesh",
    ...options
  });
  return [...passthrough, ...consolidated.renderItems];
}

export function applyRendererOwnedStaticBatching(source: RenderSource, items: readonly RenderItem[]): readonly RenderItem[] {
  if (!source.staticBatching) return items;
  const batchable: StaticBatchInput[] = [];
  const batchableItems: RenderItem[] = [];
  const passthrough: RenderItem[] = [];
  for (const item of items) {
    if (isStaticBatchCandidate(item)) {
      batchable.push({
        geometry: item.geometry,
        material: item.material,
        modelMatrix: item.modelMatrix ?? identityMat4(),
        batchKey: staticBatchKey(item),
        label: item.label,
        castShadow: item.castShadow
      });
      batchableItems.push(item);
    } else {
      passthrough.push(item);
    }
  }
  if (batchable.length === 0) return items;
  // PRD 11 Phase 3: with A3D_QR_TIERS_BATCHING on, content-keyed BatchPlan
  // replaces the identity `staticBatchKey` regroup; off => legacy path, byte
  // identical to PR 0b-2. Cached per render source by structural version.
  if (rendererQrFlags().on("A3D_QR_TIERS_BATCHING")) {
    let cache = staticBatchPlanCaches.get(source as unknown as object);
    if (!cache) {
      cache = new BatchPlanCache();
      staticBatchPlanCaches.set(source as unknown as object, cache);
    }
    const planned = cache.apply(batchableItems, optionsForSource(source));
    return [...passthrough, ...planned];
  }
  const options = source.staticBatching === true ? {} : source.staticBatching;
  const batched = batchStaticRenderItems(batchable, {
    labelPrefix: "renderer-static-batch",
    ...options
  });
  return [...passthrough, ...batched.renderItems];
}

function isStaticBatchCandidate(item: RenderItem): item is RenderItem & { readonly material: RenderMaterial } {
  return item.material !== undefined &&
    item.drawRange === undefined &&
    item.skinning === undefined &&
    item.morphTargets === undefined &&
    item.morphWeights === undefined &&
    item.instanceTransforms === undefined &&
    item.instanceColors === undefined &&
    item.instanceAttributes === undefined;
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

let nextStaticBatchResourceId = 1;

/**
 * Merges shared-material static geometry, then hands the result to batching.
 *
 * Consolidation runs first because it reduces distinct geometries; whatever it leaves unmerged (single
 * items, oversized meshes, non-indexed topology) can still be instanced by batching afterwards.
 */
const staticMeshConsolidationCaches = new WeakMap<object, ReturnType<typeof createStaticMeshConsolidationCache>>();

// ---------------------------------------------------------------------------
// PRD 11 Phase 3 (§6.6, §16.0) — BatchPlan caching + item synthesis.
// The plan rebuilds only when the item SET changes (identity + material
// revision); member matrices/colours refresh in place every call, mirroring
// the C-07 `InstanceBufferLike.setMatrices` update path.
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

function structuralSignature(items: readonly RenderItem[]): string {
  // Cheap identity signature: item/geometry/material refs + material revision.
  // Object identity via a stable registry (WeakMap → id) keeps this off the
  // string fast-path without serializing vertex data.
  const parts: string[] = [`${items.length}`];
  for (const item of items) {
    const material = item.material;
    const base = material instanceof MaterialInstance ? material.baseMaterial : material;
    parts.push(
      `${resourceId(staticBatchGeometryIds, item.geometry)}:${material ? resourceId(staticBatchMaterialIds, material) : "nomat"}:${base?.getRevision() ?? 0}`,
      item.castShadow !== false ? "1" : "0",
      item.label ?? ""
    );
  }
  return parts.join("|");
}

/** Rewrites per-member matrices/colours in place for an unchanged set. */
export function refreshInstancedBatch(batch: InstancedBatch): void {
  const transforms = batch.instanceTransforms;
  const colors = batch.instanceColors;
  batch.members.forEach((item, index) => {
    const model = item.modelMatrix ?? IDENTITY_MODEL;
    for (let i = 0; i < 16; i += 1) transforms[index * 16 + i] = model[i] ?? (i % 5 === 0 ? 1 : 0);
    const colorValue = item.material?.getParameters().get("u_baseColor");
    if (colorValue && typeof colorValue !== "number") {
      const arr = colorValue as ArrayLike<number>;
      for (let i = 0; i < 4; i += 1) colors[index * 4 + i] = arr[i] ?? 1;
    }
  });
}

/** InstancedBatch → the RenderItems the legacy forward path submits. */
export function synthesizeInstancedItems(batches: readonly InstancedBatch[]): RenderItem[] {
  const items: RenderItem[] = [];
  for (const batch of batches) {
    for (const chunk of batch.chunks) {
      items.push({
        geometry: batch.geometry,
        material: batch.material,
        instanceTransforms: chunk.instanceTransforms,
        instanceColors: chunk.instanceColors,
        castShadow: batch.castShadow,
        label: `a3d-prd11-batch:${batch.members[0]!.label ?? "items"}x${chunk.members.length}`
      });
    }
  }
  return items;
}

/**
 * Per-source plan cache. `apply()` returns the transformed item list ready
 * for draw submission; `lastReport` feeds `renderer.batching`.
 */
export class BatchPlanCache {
  private signature = "";
  private synthesized: RenderItem[] = [];
  private plan: BatchPlan | null = null;
  private version = 0;
  lastReport: Prd11BatchPlanReport = EMPTY_BATCH_REPORT;

  apply(items: readonly RenderItem[], options: PlanBatchesOptions = {}): RenderItem[] {
    const signature = structuralSignature(items);
    if (signature === this.signature && this.plan) {
      for (const batch of this.plan.instancedBatches) refreshInstancedBatch(batch);
      latestBatchPlanReport = this.lastReport;
      return this.synthesized;
    }
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const plan = planBatches(items, options);
    const buildMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
    this.version += 1;
    this.plan = plan;
    this.signature = signature;
    this.synthesized = [...synthesizeInstancedItems(plan.instancedBatches), ...plan.passthrough];
    this.lastReport = {
      inputItems: items.length,
      outputDraws: plan.stats.instancedDraws + plan.stats.passthroughItems + plan.stats.multiDrawMembers,
      instancedBatches: plan.instancedBatches.length,
      multiDrawBatches: plan.multiDrawGroups.length,
      reasonsNotBatched: plan.reasonsNotBatched,
      planBuildMs: buildMs,
      planVersion: this.version
    };
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
}

const staticBatchPlanCaches = new WeakMap<object, BatchPlanCache>();

/** Plan-cache accessor for the `prd11.batching` frame contributor (non-source item lists). */
export function batchPlanCacheFor(key: object): BatchPlanCache {
  let cache = staticBatchPlanCaches.get(key);
  if (!cache) {
    cache = new BatchPlanCache();
    staticBatchPlanCaches.set(key, cache);
  }
  return cache;
}

function optionsForSource(source: RenderSource): PlanBatchesOptions {
  // `maxInstancesPerBatch` carries through; C-02 stays stubbed so
  // `multiDrawAvailable` is always false (members count `multi-draw-generator-pending`).
  const raw = source.staticBatching;
  const options: { readonly maxInstancesPerBatch?: number } = raw === true || raw === false || raw === undefined ? {} : raw;
  return { multiDrawAvailable: false, maxInstancesPerDraw: options.maxInstancesPerBatch };
}
