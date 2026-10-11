/**
 * 02-T1945 — maps the PRD-02 shadow filter (ShadowSystemConfig.filter, C-27
 * tier `shadow.filter`) to the `A3D_SHADOW_FILTER` define read by the
 * `a3d_prd02_shadow_lookup` chunk:
 *   hard / pcf2    → 1  single hardware compare tap (bilinear 2-texel edge)
 *   castano / pcf3 → 2  Castaño 5×5 tent
 *   vogel / pcf5   → 3  Vogel 16-tap disk
 *   pcss           → 3  + A3D_SHADOW_PCSS 1 (raw-depth blocker search)
 *
 * Registered as the `prd02.shadowFilter` C-02 ShaderFeature (flag
 * A3D_QR_LIGHTING, defines only — no chunks/hooks), so every generated
 * forward program that composes the lookup chunk compiles the tier's kernel.
 * Flag off: the registry never activates the feature; no define is emitted.
 */
import type { ShaderFeature } from "../contracts/program";
import type { AuraQualityTierSettings } from "../contracts/quality";

export type Prd02ShadowFilterName = "hard" | "pcf" | "castano" | "vogel" | "pcss";

export interface Prd02ShadowFilterDefines {
  readonly A3D_SHADOW_FILTER: 1 | 2 | 3;
  readonly A3D_SHADOW_PCSS?: 1;
}

const TIER_FILTER: Readonly<Record<AuraQualityTierSettings["shadow"]["filter"], 1 | 2 | 3>> = {
  pcf2: 1,
  pcf3: 2,
  pcf5: 3
};

/**
 * Filter name → lookup-chunk defines. `pcf` (the legacy RendererShadowOptions
 * spelling) resolves through the tier's C-27 kernel.
 */
export function prd02ShadowFilterDefines(
  filter: Prd02ShadowFilterName,
  tier: Pick<AuraQualityTierSettings, "shadow">
): Prd02ShadowFilterDefines {
  switch (filter) {
    case "hard":
      return { A3D_SHADOW_FILTER: 1 };
    case "castano":
      return { A3D_SHADOW_FILTER: 2 };
    case "vogel":
      return { A3D_SHADOW_FILTER: 3 };
    case "pcss":
      return { A3D_SHADOW_FILTER: 3, A3D_SHADOW_PCSS: 1 };
    case "pcf":
      return { A3D_SHADOW_FILTER: TIER_FILTER[tier.shadow.filter] };
  }
}

/** `prd02.shadowFilter`: emits the tier's A3D_SHADOW_FILTER for shadow-receiving forward draws. */
export const PRD02_SHADOW_FILTER_FEATURE: ShaderFeature = {
  id: "prd02.shadowFilter",
  owner: "prd02",
  flag: "A3D_QR_LIGHTING",
  order: 40,
  select: (input) => (input.pass === "forward" && input.item.receiveShadow !== false ? TIER_FILTER[input.tier.shadow.filter] : undefined),
  defines: (value) => ({ A3D_SHADOW_FILTER: Number(value) }),
  chunks: [],
  hooks: []
};
