/**
 * C-17 — asset manifest schema (CONTRACTS.md). Provider: PRD 05.
 * Schema "aura3d.assets/1.1" (reader accepts 1.0 and 1.1; writer emits 1.1).
 */

import type { AuraQualityTier } from "@aura3d/rendering/contracts";

export type AuraCliAssetRole = "hero" | "character" | "vehicle" | "enemy" | "world" | "prop" | "set-dressing" | "backdrop" | "proxy" | "hdri" | "texture-set" | "vfx-atlas" | "audio";
export interface AuraCliDerivedAsset { readonly url: string; readonly hash: string; readonly mobileUrl?: string; readonly collisionUrl?: string; readonly profile: AssetOptimizeProfileId; readonly steps: readonly OptimizeStepRecord[]; }
export interface AuraCliAssetEntry1_1 {
  readonly id: string; readonly role: AuraCliAssetRole; readonly source: string; readonly license: string; readonly hash: string;
  readonly derived?: AuraCliDerivedAsset; readonly admission?: AuraCliAdmissionRecord; readonly lookDev?: AuraCliLookDevRecord;
  readonly artDirection?: string; readonly aliasOf?: string; readonly gameplayCamera?: { readonly distance: number; readonly fovDegrees: number };
  readonly animationClips?: readonly { readonly name: string; readonly duration: number; readonly channelCount: number }[];   // PRD 06 typegen
}
export type AssetOptimizeProfileId = string;   // ids defined in tools/asset-optimize/profiles.ts (PRD 05)
export interface OptimizeStepRecord { readonly step: string; readonly ms: number; readonly bytesBefore: number; readonly bytesAfter: number; }
export interface AssetBudgetMeasurement { readonly triangles: number; readonly drawCalls: number; readonly gpuBytesByTier: Readonly<Record<AuraQualityTier, number>>; readonly downloadBytes: number; }
export interface AssetQualityCheck { readonly gate: `G${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11}`; readonly verdict: "pass" | "fail" | "waived-by-role"; readonly measured: unknown; readonly message: string; }
export interface AuraCliAdmissionRecord { readonly status: "admitted" | "rejected" | "pending"; readonly checks: readonly AssetQualityCheck[]; readonly at: string; }
export interface AuraCliLookDevRecord { readonly runUrl: string; readonly reviews: readonly { readonly reviewer: string; readonly verdict: "accept" | "reject"; readonly notes: string; readonly at: string }[]; }
export function optimizeAssets(options: { readonly ids?: readonly string[]; readonly dryRun?: boolean; readonly profile?: AssetOptimizeProfileId }): Promise<{ readonly rows: readonly { readonly id: string; readonly budget: AssetBudgetMeasurement; readonly checks: readonly AssetQualityCheck[] }[] }> {
  void options;
  return Promise.resolve({ rows: [] });
}
