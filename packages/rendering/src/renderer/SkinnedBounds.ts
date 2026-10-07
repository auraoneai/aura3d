// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from Renderer.ts; 0 changed logic lines.
// File: packages/rendering/src/renderer/SkinnedBounds.ts — owner lane 06.

import type { SkinningPaletteBinding } from "../ForwardPass";
import type { RenderItem } from "../contracts/renderItem.js";
import type { SkinnedBoundsProvider } from "../contracts/shadows.js";
import { type Bounds3, Geometry } from "../Geometry";
import { computeSkinnedGeometryBounds } from "../SkinningBounds";
import { toMat4 } from "./RenderShared";
import { Bounds3 as SceneBounds3, identityMat4 } from "@aura3d/scene";

export function skinnedItemLocalBounds(geometry: Geometry, skinning: SkinningPaletteBinding): Bounds3 {
  const cached = skinnedCullingBoundsCache.get(geometry);
  if (cached && float32ArraysEqual(cached.matrices, skinning.matrices)) {
    return cached.bounds;
  }
  const bounds = computeSkinnedGeometryBounds(geometry, skinning);
  skinnedCullingBoundsCache.set(geometry, { matrices: new Float32Array(skinning.matrices), bounds });
  return bounds;
}

const skinnedCullingBoundsCache = new WeakMap<Geometry, { readonly matrices: Float32Array; readonly bounds: Bounds3 }>();

function float32ArraysEqual(left: Float32Array, right: Float32Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * T0.13 — C-11 `SkinnedBoundsProvider` for PRD-06. Answers the skinned
 * world-space AABB for a render item: the same computation the legacy culling
 * path performs (`skinnedItemLocalBounds`, which already keys its cache on the
 * palette contents), transformed to world by the item's `modelMatrix`. Returns
 * null for items without a skinning palette so other providers/lane-02
 * fallbacks keep their say.
 *
 * T2.6 replaces `skinnedItemLocalBounds` with per-joint AABBs keyed on
 * `paletteKey`; the provider signature is stable across that swap.
 */
export const prd06SkinnedBounds: SkinnedBoundsProvider = {
  worldBounds(item: RenderItem): Float32Array | null {
    const skinning = item.skinning;
    if (!skinning) return null;
    const local = skinnedItemLocalBounds(item.geometry, skinning);
    const modelMatrix = toMat4(item.modelMatrix ?? identityMat4(), "modelMatrix", item.label);
    const world = new SceneBounds3(
      [local.min[0], local.min[1], local.min[2]],
      [local.max[0], local.max[1], local.max[2]]
    ).transform(modelMatrix);
    return Float32Array.of(world.min[0], world.min[1], world.min[2], world.max[0], world.max[1], world.max[2]);
  }
};
