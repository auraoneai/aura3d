/**
 * C-12 — sampler and texture-sampling descriptors (CONTRACTS.md). Provider: PRD 02
 * (webgl2/Samplers.ts). SamplerDescriptor (Sampler.ts:11) gains optional fields in PR 0a.
 */

import type { AuraQualityTier } from "./quality";

// SamplerDescriptor additions (PR 0a):
//   readonly compare?: "less-equal" | "greater-equal";        // PRD 02 shadow compare samplers
//   readonly addressW?: TextureAddressMode;
//   readonly mirror?: boolean;                                // maps "mirror" wrap for glTF MIRRORED_REPEAT (33648)
export type AuraTextureWrap = "repeat" | "clamp" | "mirror";
export interface AuraTextureSampling { readonly wrap?: AuraTextureWrap; readonly filter?: "trilinear" | "bilinear" | "nearest"; readonly anisotropy?: number; }

/** R9 table: L4 / M8 / H16 / U16, clamped to the device maximum. */
const TIER_ANISOTROPY: Readonly<Record<AuraQualityTier, number>> = { low: 4, medium: 8, high: 16, ultra: 16 };

export function resolveSamplerAnisotropy(req: { readonly desired?: number; readonly tier?: AuraQualityTier; readonly deviceMax: number }): number {
  const fromTier = req.tier ? TIER_ANISOTROPY[req.tier] : 8;
  const requested = req.desired ?? fromTier;
  const clamped = Math.max(1, Math.min(requested, req.deviceMax));
  return clamped;
}

export function resolveLightingSamplerBudget(programDefines: Readonly<Record<string, unknown>>, materialSamplerCount: number, deviceLimits: { readonly maxTextureImageUnits: number }): { readonly droppedFeatures: readonly string[] } {
  return { droppedFeatures: [] };
}
export const LIGHTING_SAMPLER_DROP_ORDER: readonly ["contact-shadow", "irradiance-volume", "reflection-probe-2", "local-shadow-atlas", "sh-texture", "cascade-3", "lobe:iridescence", "lobe:sheen", "lobe:anisotropy", "lobe:clearcoat"] =
  ["contact-shadow", "irradiance-volume", "reflection-probe-2", "local-shadow-atlas", "sh-texture", "cascade-3", "lobe:iridescence", "lobe:sheen", "lobe:anisotropy", "lobe:clearcoat"];
