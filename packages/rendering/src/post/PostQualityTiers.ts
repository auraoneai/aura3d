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
import type { DeviceProbe } from "../contracts/device";
import { registerFrameContributor, type FrameContributor } from "../contracts/frameGraph";
import { TierResolver } from "../quality/TierResolver";

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

/* ------------------------------------------------------------------------- */
/* GU47 E-G (WP-7): `A3D_QR_TIERS` post-only mode                             */
/* ------------------------------------------------------------------------- */

/**
 * The post-only sub-flag of `A3D_QR_TIERS` (list token `tiers.post`, env
 * `A3D_QR_TIERS_POST=1`). With it on, an app whose post tier is `auto` (no
 * `post.setQualityTier(tier)`) runs the post chain at its device's C-27 tier
 * instead of always paying for High, while the rest of the tiers lane (the
 * quality controller, governor, render scale, pools, forward and shadow
 * tiers) stays off. Being a sub-flag, `flags.on("A3D_QR_TIERS")` stays false.
 */
export const POST_ONLY_TIER_FLAG = "A3D_QR_TIERS_POST" as const;

const TIER_ORDER: readonly AuraQualityTier[] = ["low", "medium", "high", "ultra"];

/**
 * The post tier for a device in post-only mode: the C-27 `TierResolver`
 * classification (hard floors, renderer class table, mobile CPU/RAM signal)
 * capped at `cap`, so the mode only ever lowers post cost (default cap
 * `high`, today's `auto` answer). No probe resolves to `cap`.
 */
export function resolvePostOnlyTier(probe: DeviceProbe | null | undefined, cap: AuraQualityTier = "high"): AuraQualityTier {
  if (!probe) return cap;
  const detected = new TierResolver().detect(probe).tier;
  return TIER_ORDER.indexOf(detected) < TIER_ORDER.indexOf(cap) ? detected : cap;
}

/** Post-only tiers by canvas (the device's canvas is the app's canvas). */
const postOnlyTiers = new WeakMap<object, AuraQualityTier>();

/**
 * The post-only tier recorded for `canvas`, or `undefined` when the app that
 * owns it does not run `A3D_QR_TIERS_POST` (or has not rendered a frame yet:
 * the first frame keeps the High answer).
 */
export function postOnlyTierFor(canvas: object | null | undefined): AuraQualityTier | undefined {
  return canvas ? postOnlyTiers.get(canvas) : undefined;
}

/** Classify once per canvas; later frames reuse the answer. */
export function recordPostOnlyTier(canvas: object, probe: DeviceProbe | null | undefined): AuraQualityTier {
  let tier = postOnlyTiers.get(canvas);
  if (tier === undefined) {
    tier = resolvePostOnlyTier(probe);
    postOnlyTiers.set(canvas, tier);
  }
  return tier;
}

/** Test hook: forget a canvas's recorded post-only tier. */
export function clearPostOnlyTier(canvas: object): void {
  postOnlyTiers.delete(canvas);
}

/**
 * Collect-phase contributor, active only for apps whose flags have
 * `A3D_QR_TIERS_POST` on (registry filter): records the device tier for the
 * device's canvas and passes the items through untouched (no pass, no draw).
 */
export const POST_ONLY_TIER_CONTRIBUTOR: FrameContributor = {
  id: "prd03.postOnlyTier",
  owner: "prd03",
  flag: POST_ONLY_TIER_FLAG,
  phases: ["collect"],
  order: -1000,
  collect(items, ctx) {
    const canvas = (ctx.device as { readonly canvas?: unknown }).canvas;
    if (typeof canvas === "object" && canvas !== null) recordPostOnlyTier(canvas, ctx.device.probe);
    return items;
  }
};

let releasePostOnlyTierContributor: (() => void) | null = null;

/** Lane barrel entry: registers the post-only tier contributor once (inactive unless the flag is on). */
export function registerPostOnlyTierContributor(): void {
  if (releasePostOnlyTierContributor) return;
  releasePostOnlyTierContributor = registerFrameContributor(POST_ONLY_TIER_CONTRIBUTOR);
}
