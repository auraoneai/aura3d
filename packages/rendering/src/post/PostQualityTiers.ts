/**
 * PRD-03 Phase 5 — §6.8 post tier mapping (C-27 consumers).
 *
 * `resolvePostTier` derives the lane-03 post parameters for one
 * `AuraQualityTier` from the frozen C-27 `AuraQualityTierSettings`. Rows marked
 * "lane 03" in the §6.8 table are the tier-keyed derivatives below; rows marked
 * "C-27" are read straight off the settings object (never literal copies).
 *
 * Re-resolution: the bridge calls this inside `createRootPostPipeline`, so a
 * tier change recorded through `post.setQualityTier` → `app.quality.set` →
 * `quality.onChange` produces a new resolution at the next compile/frame.
 */

import type { AuraQualityTier, AuraQualityTierSettings } from "../contracts/quality";

export interface PostTierContext {
  /**
   * Whether the resolved AA mode is `taa` — §6.8 "temporal if taa" on High;
   * Ultra's GTAO is temporal unconditionally.
   */
  readonly taaResolved?: boolean;
  /**
   * Whether the app authored `output.autoExposure` or the expanded preset
   * implies auto-exposure — §6.8 "if preset" on Medium+.
   */
  readonly autoExposureAuthored?: boolean;
}

export interface PostTierResolution {
  readonly tier: AuraQualityTier;
  /** C-27 row: forward-target sample count + tier AA default. */
  readonly msaaSamples: 0 | 4;
  readonly postAntiAlias: "fxaa" | "none" | "taa";
  /** C-27 row: DPR cap + render-scale floor. */
  readonly maxPixelRatio: number;
  readonly minRenderScale: number;
  /** S2 GTAO — "off" when disabled. */
  readonly gtao:
  | { readonly enabled: false }
  | {
    readonly enabled: true;
    readonly halfRes: boolean;
    readonly directions: 2 | 4;
    readonly steps: 4 | 6;
    readonly temporal: boolean;
  };
  /** S3 SSR placement — level comes from C-27 `ssr`. */
  readonly ssr:
  | { readonly enabled: false }
  | { readonly enabled: true; readonly halfRes: true; readonly level: "medium" | "high" };
  /** S4 god rays — lane-03 row: off / 32 / 48 / 64 samples, half-res. */
  readonly godRays:
  | { readonly enabled: false }
  | { readonly enabled: true; readonly samples: 32 | 48 | 64; readonly halfRes: true };
  /** S6 DoF — lane-03 row: off / half-res / full CoC + half-res 2-ring gather. */
  readonly dof:
  | { readonly enabled: false }
  | { readonly enabled: true; readonly halfRes: boolean; readonly gatherRings: 1 | 2; readonly fullCoC: boolean };
  /** S7 motion blur — lane-03 row: off / 8 / 12 taps. */
  readonly motionBlur:
  | { readonly enabled: false }
  | { readonly enabled: true; readonly samples: 8 | 12 };
  /** C-27 row: bloom mip count 3 | 5 | 6. */
  readonly bloomMipLevels: 3 | 5 | 6;
  /** S8 auto-exposure — off on Low, otherwise "if preset" (§6.8). */
  readonly autoExposure: boolean;
  /** S10b display LUT — every tier (§6.8). */
  readonly displayLut: boolean;
  /** S10b/S12 cosmetics — Low keeps vignette only. */
  readonly allowsVignette: boolean;
  readonly allowsFilmGrain: boolean;
  readonly allowsChromaticAberration: boolean;
  /** S12/OutputPass dither — every tier (§6.8). */
  readonly dither: boolean;
}

/**
 * §6.8 tier × feature table. `settings` is the C-27 `AuraQualityTierSettings`
 * for `tier` (the caller passes `QUALITY_TIERS[tier]` — rows marked C-27 are
 * read from it, so the frozen table stays the single source of truth).
 */
export function resolvePostTier(
  settings: AuraQualityTierSettings,
  tier: AuraQualityTier,
  ctx: PostTierContext = {}
): PostTierResolution {
  const gtao: PostTierResolution["gtao"] =
    settings.ambientOcclusion === "off"
      ? { enabled: false }
      : tier === "medium"
        ? { enabled: true, halfRes: true, directions: 2, steps: 4, temporal: false }
        : tier === "high"
          ? { enabled: true, halfRes: true, directions: 4, steps: 4, temporal: ctx.taaResolved === true }
          : { enabled: true, halfRes: false, directions: 4, steps: 6, temporal: true };

  const ssr: PostTierResolution["ssr"] =
    settings.ssr === "off"
      ? { enabled: false }
      : { enabled: true, halfRes: true, level: settings.ssr === "high" ? "high" : "medium" };

  const godRays: PostTierResolution["godRays"] =
    tier === "low"
      ? { enabled: false }
      : { enabled: true, samples: tier === "medium" ? 32 : tier === "high" ? 48 : 64, halfRes: true };

  const dof: PostTierResolution["dof"] =
    tier === "high"
      ? { enabled: true, halfRes: true, gatherRings: 1, fullCoC: false }
      : tier === "ultra"
        ? { enabled: true, halfRes: true, gatherRings: 2, fullCoC: true }
        : { enabled: false };

  const motionBlur: PostTierResolution["motionBlur"] =
    tier === "high"
      ? { enabled: true, samples: 8 }
      : tier === "ultra"
        ? { enabled: true, samples: 12 }
        : { enabled: false };

  return {
    tier,
    msaaSamples: settings.msaaSamples,
    postAntiAlias: settings.postAntiAlias,
    maxPixelRatio: settings.maxPixelRatio,
    minRenderScale: settings.minRenderScale,
    gtao,
    ssr,
    godRays,
    dof,
    motionBlur,
    bloomMipLevels: settings.bloomMipLevels,
    autoExposure: tier !== "low" && ctx.autoExposureAuthored === true,
    displayLut: true,
    allowsVignette: true,
    allowsFilmGrain: tier !== "low",
    allowsChromaticAberration: tier !== "low",
    dither: true
  };
}
