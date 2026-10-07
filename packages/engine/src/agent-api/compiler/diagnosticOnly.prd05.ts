/**
 * PRD-05 — lane-owned DIAGNOSTIC_ONLY rows + C-36 option coverage.
 *
 * `model.lod` and `model.collider` are pre-seeded in the merged
 * `DIAGNOSTIC_ONLY_FIELDS` table (contracts/compiler.ts); this module holds
 * the lane's remaining unwired C-17 additions and registers one probe-value
 * coverage row per field (§7.3). Entries clear as the fields get wired —
 * `model.collider` unblocks on Q-15-2, the `createAuraApp.assets.*` rows on
 * Q-15-1.
 */
import { DIAGNOSTIC_ONLY_FIELDS, registerOptionCoverage, type OptionCoverageRow } from "../../contracts/compiler";

export const PRD05_DIAGNOSTIC_ONLY: Readonly<Record<string, { readonly reason: string; readonly ownerPrd: number }>> = {
  "model.lod": { reason: "C-17: LOD resolution is PRD 05's — consumed by the prd05.lod actor extension behind A3D_QR_ASSETS_LOD", ownerPrd: 5 },
  "model.collider": { reason: "C-17: collider resolution is PRD 05's — `createCollidersFromSidecar` lands Phase 3; binding is request Q-15-2", ownerPrd: 5 },
  "createAuraApp.assets.variant": { reason: "C-17: per-app derived-asset variant selection is PRD 05's; unwired until Q-15-1", ownerPrd: 5 },
  "createAuraApp.assets.maxTextureSize": { reason: "C-17: per-app texture cap is PRD 05's; unwired until Q-15-1", ownerPrd: 5 }
};

Object.assign(DIAGNOSTIC_ONLY_FIELDS, PRD05_DIAGNOSTIC_ONLY);

const row = (builder: string, field: string, probeValueA: unknown, probeValueB: unknown): OptionCoverageRow => ({
  builder,
  field,
  probeValueA,
  probeValueB,
  ownerPrd: 5
});

registerOptionCoverage([
  row("model", "lod", "auto", { bias: 1.5, crossFadeSeconds: 0.2 }),
  row("model", "collider", "auto", false),
  row("createAuraApp.assets", "variant", "high", "mobile"),
  row("createAuraApp.assets", "maxTextureSize", 1024, 512)
]);
