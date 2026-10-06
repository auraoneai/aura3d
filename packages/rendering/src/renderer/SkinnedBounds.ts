// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from Renderer.ts; 0 changed logic lines.
// File: packages/rendering/src/renderer/SkinnedBounds.ts — owner lane 06.

import type { SkinningPaletteBinding } from "../ForwardPass";
import { type Bounds3, Geometry } from "../Geometry";
import { computeSkinnedGeometryBounds } from "../SkinningBounds";

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
