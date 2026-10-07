/**
 * PRD-06 T0.13 — `prd06.deform` depth/velocity variant feature.
 *
 * Registered through the C-11 `registerDepthVariantFeature` registry under
 * `A3D_QR_ANIMATION_SKINNED_SHADOWS` (the registry's `active(flags)` gates on
 * the entry flag). `DepthPass.ts` (owner 02) consumes registered features —
 * that composition is C-11 real (Q-02-1); this module only declares the
 * feature and its shared `SkinningUniforms.bindBoneTexture` bind.
 *
 * `select` returns the variant pass name as the feature value so `defines`
 * can emit `A3D_DEPTH_ONLY` for the `depth`/`distance` passes while `velocity`
 * keeps the previous-palette path (`u_prevBoneTexture` is bound
 * unconditionally — the deform chunk declares it under `#ifdef A3D_VELOCITY`).
 */

import type { QrFlagName } from "../../contracts/core.js";
import type { RenderItem } from "../../contracts/renderItem.js";
import type { ShaderFeatureSelectInput } from "../../contracts/program.js";
import { registerDepthVariantFeature, type DepthVariantFeature } from "../../contracts/shadows.js";
import type { UniformValue } from "../../RenderDevice.js";
import type { SkinningPaletteTextureCache } from "../../SkinningPaletteTextureCache.js";
import { bindBoneTexture } from "../../SkinningUniforms.js";

export const PRD06_DEFORM_DEPTH_FLAG: QrFlagName = "A3D_QR_ANIMATION_SKINNED_SHADOWS";

export function createPrd06DeformDepthFeature(cache: SkinningPaletteTextureCache): DepthVariantFeature {
  return {
    id: "prd06.deform",
    owner: "prd06",
    flag: PRD06_DEFORM_DEPTH_FLAG,
    passes: ["depth", "distance", "velocity"],
    select(input: ShaderFeatureSelectInput): "depth" | "distance" | "velocity" | undefined {
      if (!input.item.skinning) return undefined;
      return input.pass === "depth" || input.pass === "distance" || input.pass === "velocity" ? input.pass : undefined;
    },
    defines(value: string | number | boolean): Readonly<Record<string, string | number | true>> {
      return value === "depth" || value === "distance" ? { A3D_DEPTH_ONLY: true } : {};
    },
    chunks: ["a3d_prd06_skinning_common", "a3d_prd06_deform"],
    hooks: ["vertex:deform"],
    bindUniforms(_value: string | number | boolean, item: RenderItem, set: (name: string, v: UniformValue) => void): void {
      // The texture this frame's forward bind already uploaded — no second upload.
      bindBoneTexture(set, cache, item);
    }
  };
}

/** Returns the C-11 registry disposer. */
export function registerPrd06DeformDepthFeature(cache: SkinningPaletteTextureCache): () => void {
  return registerDepthVariantFeature(createPrd06DeformDepthFeature(cache));
}
