/**
 * PRD-05 — lane-owned DIAGNOSTIC_ONLY rows + C-36 option coverage.
 *
 * This module holds the lane's remaining unwired C-17 additions and registers
 * one probe-value coverage row per field (§7.3). Entries clear as the fields
 * get wired — the `createAuraApp.assets.*` rows on Q-15-1. 5.0 (S5-WP19-04):
 * `model.lod` (MSFT_lod policy, `actor.renderItem.lodLevel` probe) and
 * `model.collider` (bounds collider, `actor.physicsBodies` probe) are wired
 * and no longer diagnostic-only.
 */
import { DIAGNOSTIC_ONLY_FIELDS, registerOptionCoverage, type OptionCoverageRow } from "../../contracts/compiler";

export const PRD05_DIAGNOSTIC_ONLY: Readonly<Record<string, { readonly reason: string; readonly ownerPrd: number }>> = {
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
