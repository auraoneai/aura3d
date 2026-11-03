/**
 * diagnosticOnly.prd04.ts — lane-04 record of the C-15 diagnostic-only fields
 * (CONTRACTS.md C-15 / contracts/compiler.ts `DIAGNOSTIC_ONLY_FIELDS`).
 *
 * Fields wired in PR B are REMOVED here (the lane-15 merged table carries the same removal):
 *   - `model.materialOverrides` — wired flag-on by `applyModelTintBridge` →
 *     `lowerModelMaterialOverrides` into `TypedGLBActorOptions.materialOverrides` (P2-3).
 *   - `model.variant` — wired flag-on into `TypedGLBActorOptions.materialVariant` (P2-3/P2-1).
 *
 *   - `material.alphaToCoverage` — 5.0 (S5-WP19-04): `material.pbr/metal` lower it into the
 *     primitive render state (`productionPrimitiveRenderState`), which the `prd04.alphaToCoverage`
 *     shader feature reads for masked materials on MSAA tiers.
 *
 *   - `material.unlit` — 5.0 (S5-WP19-04): primitives draw with `UnlitMaterial` /
 *     `InstancedUnlitMaterial` / `TexturedUnlitMaterial` (option probe row `material.pbr.unlit`).
 *
 * Still unconsumed (kept): double-sided.
 */
import { registerOptionCoverage } from "../../contracts/compiler.js";

/** Remaining lane-04 diagnostic-only fields — mirrors the contract map's owner-4 entries. */
export const DIAGNOSTIC_ONLY_PRD04_FIELDS: Readonly<Record<string, { readonly reason: string; readonly ownerPrd: number }>> = {
  "material.doubleSided": { reason: "C-15: double-sided pipeline variant is PRD 04's", ownerPrd: 4 }
};

/** PRD-04 P2-14: option-coverage rows for the fields wired in PR B. */
export function registerPrd04OptionCoverage(): void {
  registerOptionCoverage([
    { builder: "model", field: "material.color", probeValueA: "#ff0000", probeValueB: "#00ff00", ownerPrd: 4 },
    { builder: "model", field: "materialOverrides", probeValueA: [], probeValueB: [{ roughness: 0.5 }], ownerPrd: 4 },
    { builder: "material", field: "sampling.wrap", probeValueA: "repeat", probeValueB: "clamp", ownerPrd: 4 },
    { builder: "material", field: "sampling.anisotropy", probeValueA: 1, probeValueB: 8, ownerPrd: 4 },
    { builder: "material", field: "alphaMode", probeValueA: "opaque", probeValueB: "blend", ownerPrd: 4 }
  ]);
}
