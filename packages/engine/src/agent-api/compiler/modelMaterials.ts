// C-15 model-material bridge (PRD-04 P2-3).
// 4.0 Live Fix E2: the A3D_QR_MATERIALS flag-off branch (legacy `tint`
// object with replaceSurfaceTextures:true, which disabled baseColor+MR
// textures and forced uniform plastic values in TypedGLBActor) is deleted.
// `node.material`/`node.materialOverrides` always lower to C-15 overrides,
// independent of flag resolution order or whether setTypedGLBActorQrFlags
// has run yet.
import type { AuraModelNode } from "../nodes/types.js";
import type { AuraModelMaterialOverride } from "../../contracts/materials.js";
import { lowerModelMaterialOverrides } from "../../production-runtime/ModelMaterialOverrides.js";
import { assertAuraCustomMaterialSpec } from "./customMaterial.js";

// C-15 seam fields: declared on `AuraModelOptions` (PR 0a) but not yet forwarded onto the
// snapshot node by `model()` — that two-line builder change is lane-15's; the bridge reads
// them structurally so the wiring is correct the moment the fields land.
type ModelNodeMaterialSeams = AuraModelNode & {
  readonly materialOverrides?: readonly AuraModelMaterialOverride[];
  readonly variant?: string;
};

export function applyModelTintBridge(node: AuraModelNode): Record<string, unknown> {
  const seams = node as ModelNodeMaterialSeams;
  // parity:L1 (SH-02) dispatch: a `material.custom` spec on a model node is
  // validated through the portable-shader adapter, but GLB material-slot
  // replacement is not wired — skip the PBR override lowering rather than
  // silently downgrading the spec to tint overrides.
  if (node.material?.kind === "custom") {
    assertAuraCustomMaterialSpec(node.material.custom, `model(${node.name ?? node.asset.id}).material`);
    return {
      ...(seams.variant !== undefined ? { materialVariant: seams.variant } : {})
    };
  }
  const materialOverrides = lowerModelMaterialOverrides(node.material, seams.materialOverrides);
  return {
    ...(materialOverrides.length > 0 ? { materialOverrides } : {}),
    // C-15: `node.variant` selects a declared KHR_materials_variants material at load (R11).
    ...(seams.variant !== undefined ? { materialVariant: seams.variant } : {})
  };
}
