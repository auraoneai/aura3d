// PR 0b-1 carve-out (CONTRACTS.md §3.2) — C-15 model-material tint bridge, verbatim from the
// TypedGLBActor options inside createProductionRuntimeSceneRenderer; 0 changed logic lines.
// PRD-04 P2-3: `A3D_QR_MATERIALS` on lowers `node.material`/`node.materialOverrides` to C-15
// overrides instead of the legacy `tint` object; flag off is byte-identical.
import type { AuraModelNode } from "../index.js";
import type { AuraModelMaterialOverride } from "../../contracts/materials.js";
import { clamp01, colorToLinearRgb, colorToLinearRgba } from "../index.js";
import { typedGLBActorQrFlags } from "../../production-runtime/actor/extensions.js";
import { lowerModelMaterialOverrides } from "../../production-runtime/ModelMaterialOverrides.js";

// C-15 seam fields: declared on `AuraModelOptions` (PR 0a) but not yet forwarded onto the
// snapshot node by `model()` — that two-line builder change is lane-15's; the bridge reads
// them structurally so the wiring is correct the moment the fields land.
type ModelNodeMaterialSeams = AuraModelNode & {
  readonly materialOverrides?: readonly AuraModelMaterialOverride[];
  readonly variant?: string;
};

export function applyModelTintBridge(node: AuraModelNode): Record<string, unknown> {
  if (typedGLBActorQrFlags().on("A3D_QR_MATERIALS")) {
    const seams = node as ModelNodeMaterialSeams;
    const materialOverrides = lowerModelMaterialOverrides(node.material, seams.materialOverrides);
    return {
      ...(materialOverrides.length > 0 ? { materialOverrides } : {}),
      // C-15: `node.variant` selects a declared KHR_materials_variants material at load (R11).
      ...(seams.variant !== undefined ? { materialVariant: seams.variant } : {})
    };
  }
  return node.material?.color ? {
    tint: {
      baseColor: colorToLinearRgba(node.material.color),
      replaceSurfaceTextures: true,
      ...(node.material.emissive ? { emissiveColor: colorToLinearRgb(node.material.emissive) } : {}),
      ...(node.material.emissiveIntensity === undefined ? {} : { emissiveStrength: node.material.emissiveIntensity }),
      ...(node.material.roughness === undefined ? {} : { roughness: clamp01(node.material.roughness) }),
      ...(node.material.metallic === undefined && node.material.metalness === undefined
        ? {}
        : { metallic: clamp01(node.material.metallic ?? node.material.metalness ?? 0) }),
      ...(node.material.clearcoat === undefined ? {} : { clearcoat: clamp01(node.material.clearcoat) }),
      ...(node.material.clearcoatRoughness === undefined ? {} : { clearcoatRoughness: clamp01(node.material.clearcoatRoughness) })
    }
  } : {};
}
