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
    } else {
      passthrough.push(item);
    }
  }
  if (batchable.length === 0) return items;
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
