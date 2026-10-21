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

/**
 * threejs-parity ST-02/ST-04 (L4): three-style min/mag filter names. These are
 * the same strings `AuraTextureMinFilter`/`AuraTextureMagFilter` use in
 * `agent-api/nodes/types.ts`; the numeric form accepted here is three's filter
 * enum (NearestFilter 1003 … LinearMipmapLinearFilter 1008).
 */
export type AuraTextureMinFilterName = "nearest" | "linear" | "nearest-mipmap-nearest" | "linear-mipmap-nearest" | "nearest-mipmap-linear" | "linear-mipmap-linear";
export type AuraTextureMagFilterName = "nearest" | "linear";
export type AuraTextureFilterInput = AuraTextureMinFilterName | number;

/**
 * C-12 sampling descriptor (material.sampling / material.slotSampling).
 *
 * threejs-parity ST-02/ST-04 (L4) additions — all optional and additive:
 * `wrapS`/`wrapT` are the per-axis wrap modes (they win over the shared
 * `wrap`); `minFilter`/`magFilter` accept three's filter names or numeric
 * enum values and win over the legacy `filter` shorthand; `generateMipmaps`
 * asks the device for a full mip chain after upload.
 */
export interface AuraTextureSampling {
  readonly wrap?: AuraTextureWrap;
  readonly wrapS?: AuraTextureWrap;
  readonly wrapT?: AuraTextureWrap;
  readonly filter?: "trilinear" | "bilinear" | "nearest";
  readonly minFilter?: AuraTextureFilterInput;
  readonly magFilter?: AuraTextureMagFilterName | number;
  readonly anisotropy?: number;
  readonly generateMipmaps?: boolean;
}

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
