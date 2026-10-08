import { describe, expect, it } from "vitest";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { AuraQualityTier } from "../../../../packages/rendering/src/contracts/quality";
import { resolvePostTier } from "../../../../packages/rendering/src/post/PostQualityTiers";

/**
 * PRD-03 Phase 5 §6.8: `resolvePostTier(settings, tier, ctx)` covers every
 * tier × feature cell. C-27 rows are asserted back against the frozen
 * `QUALITY_TIERS` table (never literal copies); lane-03 rows assert the §6.8
 * constants.
 */

const TIERS = ["low", "medium", "high", "ultra"] as const satisfies readonly AuraQualityTier[];

function resolved(tier: AuraQualityTier, ctx = {}) {
  return resolvePostTier(QUALITY_TIERS[tier], tier, ctx);
}

describe("resolvePostTier — C-27 passthrough rows (§6.8)", () => {
  it.each(TIERS)("%s: AA + DPR + scale + bloom mips read the QUALITY_TIERS row", (tier) => {
    const settings = QUALITY_TIERS[tier];
    const r = resolved(tier);
    expect(r.tier).toBe(tier);
    expect(r.msaaSamples).toBe(settings.msaaSamples);
    expect(r.postAntiAlias).toBe(settings.postAntiAlias);
    expect(r.maxPixelRatio).toBe(settings.maxPixelRatio);
    expect(r.minRenderScale).toBe(settings.minRenderScale);
    expect(r.bloomMipLevels).toBe(settings.bloomMipLevels);
  });
});

describe("resolvePostTier — S2 GTAO (§6.8)", () => {
  it("low: off — C-27 ambientOcclusion is 'off'", () => {
    expect(QUALITY_TIERS.low.ambientOcclusion).toBe("off");
    expect(resolved("low").gtao).toEqual({ enabled: false });
  });
  it("medium: half-res 2×4, no temporal", () => {
    expect(resolved("medium").gtao).toEqual({ enabled: true, halfRes: true, directions: 2, steps: 4, temporal: false });
  });
  it("high: half-res 4×4, temporal iff the AA resolve landed on TAA", () => {
    expect(resolved("high", { taaResolved: true }).gtao).toMatchObject({ directions: 4, steps: 4, halfRes: true, temporal: true });
    expect(resolved("high", { taaResolved: false }).gtao).toMatchObject({ temporal: false });
  });
  it("ultra: full-res 4×6, temporal unconditionally", () => {
    expect(resolved("ultra", { taaResolved: false }).gtao).toEqual({ enabled: true, halfRes: false, directions: 4, steps: 6, temporal: true });
  });
  it("settings.ambientOcclusion==='off' disables GTAO even on ultra", () => {
    const off = { ...QUALITY_TIERS.ultra, ambientOcclusion: "off" as const };
    expect(resolvePostTier(off, "ultra").gtao).toEqual({ enabled: false });
  });
});

describe("resolvePostTier — S3 SSR (§6.8)", () => {
  it("low/medium off, high half-res-medium, ultra half-res-high — level off the C-27 row", () => {
    expect(resolved("low").ssr).toEqual({ enabled: false });
    expect(resolved("medium").ssr).toEqual({ enabled: false });
    expect(QUALITY_TIERS.high.ssr).toBe("medium");
    expect(resolved("high").ssr).toEqual({ enabled: true, halfRes: true, level: "medium" });
    expect(QUALITY_TIERS.ultra.ssr).toBe("high");
    expect(resolved("ultra").ssr).toEqual({ enabled: true, halfRes: true, level: "high" });
  });
});

describe("resolvePostTier — S4 god rays / S6 DoF / S7 motion blur (§6.8)", () => {
  it("god rays: off / 32 / 48 / 64 samples at half-res", () => {
    expect(resolved("low").godRays).toEqual({ enabled: false });
    expect(resolved("medium").godRays).toEqual({ enabled: true, samples: 32, halfRes: true });
    expect(resolved("high").godRays).toEqual({ enabled: true, samples: 48, halfRes: true });
    expect(resolved("ultra").godRays).toEqual({ enabled: true, samples: 64, halfRes: true });
  });
  it("dof: off / off / half-res 1-ring / full-CoC half-res 2-ring", () => {
    expect(resolved("low").dof).toEqual({ enabled: false });
    expect(resolved("medium").dof).toEqual({ enabled: false });
    expect(resolved("high").dof).toEqual({ enabled: true, halfRes: true, gatherRings: 1, fullCoC: false });
    expect(resolved("ultra").dof).toEqual({ enabled: true, halfRes: true, gatherRings: 2, fullCoC: true });
  });
  it("motion blur: off / off / 8 / 12 taps", () => {
    expect(resolved("low").motionBlur).toEqual({ enabled: false });
    expect(resolved("medium").motionBlur).toEqual({ enabled: false });
    expect(resolved("high").motionBlur).toEqual({ enabled: true, samples: 8 });
    expect(resolved("ultra").motionBlur).toEqual({ enabled: true, samples: 12 });
  });
});

describe("resolvePostTier — S8 auto-exposure / cosmetics / dither (§6.8)", () => {
  it("auto-exposure: off on Low even when authored, 'if preset' on Medium+", () => {
    expect(resolved("low", { autoExposureAuthored: true }).autoExposure).toBe(false);
    for (const tier of ["medium", "high", "ultra"] as const) {
      expect(resolved(tier, { autoExposureAuthored: true }).autoExposure).toBe(true);
      expect(resolved(tier, { autoExposureAuthored: false }).autoExposure).toBe(false);
      expect(resolved(tier).autoExposure).toBe(false);
    }
  });
  it("LUT + dither run on every tier; grain+CA are Medium+, vignette is all tiers", () => {
    for (const tier of TIERS) {
      const r = resolved(tier);
      expect(r.displayLut).toBe(true);
      expect(r.dither).toBe(true);
      expect(r.allowsVignette).toBe(true);
      expect(r.allowsFilmGrain).toBe(tier !== "low");
      expect(r.allowsChromaticAberration).toBe(tier !== "low");
    }
  });
});
