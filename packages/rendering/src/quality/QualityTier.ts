/**
 * PRD 11 Phase 4 — QualityTier helpers (C-27).
 *
 * The frozen table lives in `contracts/quality.ts`; this module re-exports it
 * so engine/rendering consumers have one lane-owned import surface, and adds
 * the ordering helpers the resolver and governor share.
 */

import type { AuraQualityTier } from "../contracts/quality";

export {
  QUALITY_TIERS,
  nextLowerTier,
  resolveTierSettings
} from "../contracts/quality";
export type {
  AuraFeatureLevel,
  AuraQualityController,
  AuraQualityTier,
  AuraQualityTierSettings,
  AuraTierDecision
} from "../contracts/quality";

export const TIER_ORDER: readonly AuraQualityTier[] = ["low", "medium", "high", "ultra"];

export function tierIndex(tier: AuraQualityTier): number {
  return TIER_ORDER.indexOf(tier);
}

export function nextHigherTier(tier: AuraQualityTier): AuraQualityTier | null {
  return tier === "low" ? "medium" : tier === "medium" ? "high" : tier === "high" ? "ultra" : null;
}

export function isQualityTier(value: unknown): value is AuraQualityTier {
  return value === "low" || value === "medium" || value === "high" || value === "ultra";
}

/** True when `a` is strictly above `b` on the ladder. */
export function tierAbove(a: AuraQualityTier, b: AuraQualityTier): boolean {
  return tierIndex(a) > tierIndex(b);
}
