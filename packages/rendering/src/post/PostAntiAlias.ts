/**
 * PRD-03 §7.2 — C-27 → C-13 tier AA resolution.
 *
 * One call per frame resolves the anti-aliasing mode and the forward-target
 * sample count from the C-27 tier row, the authored `effects.antiAlias` mode
 * and two runtime facts: rendered pixel count and C-14 velocity coverage.
 * Rules (PRD-03 §6.5):
 *  - MSAA wins below the pixel guard (≤ 2.4 Mpx) for the C-27 `msaaSamples: 4`
 *    tiers, and Ultra falls back to it when velocity coverage fails.
 *  - TAA needs every item that moved since last frame to carry C-14 history;
 *    static scenes (moving === 0) always qualify.
 *  - SMAA 1x fills the gap: MSAA blocked by the pixel guard while TAA is not
 *    allowed.
 *  - FXAA is the C-27 Low default and an explicit opt-in. It never runs on a
 *    multisampled target — resolved `fxaa` always returns `sampleCount: 1`.
 *  - `off` is explicit only.
 *  - Moving High to TAA is CCR-03-4 and is *not* assumed: a `postAntiAlias:
 *    "none"` tier never resolves to `taa` in `auto` mode.
 */

import type { AuraQualityTier, AuraQualityTierSettings } from "../contracts/quality";
import type { PostPipelineOptions } from "../contracts/post";

/** Authored `effects.antiAlias` mode union — mirror of engine contracts/post.ts `AuraAntiAliasMode`. */
export type PostAntiAliasAuthoredMode = "auto" | "msaa" | "taa" | "smaa" | "fxaa" | "off";

export interface PostAntiAliasInput {
  readonly settings: AuraQualityTierSettings;
  readonly tier: AuraQualityTier;
  readonly authored: PostAntiAliasAuthoredMode;
  /** Currently rendered pixels (width × height after DSF/renderScale). */
  readonly renderPixels: number;
  /** C-14 coverage: items that moved since last frame vs how many have history. */
  readonly velocity: { readonly moving: number; readonly movingWithHistory: number };
}

export interface PostAntiAliasResolution {
  readonly mode: PostPipelineOptions["antiAliasing"];
  readonly sampleCount: 1 | 4;
  /** Set when the requested mode could not run and a substitute was selected. */
  readonly reason?: string;
}

/** PRD-03 §6.5 — MSAA is allowed while the frame stays at or under 2.4 Mpx. */
export const MSAA_PIXEL_GUARD = 2_400_000;

export function resolvePostAntiAlias(input: PostAntiAliasInput): PostAntiAliasResolution {
  const { settings, authored, renderPixels, velocity } = input;
  const msaaBlocked = renderPixels > MSAA_PIXEL_GUARD;
  const msaaCapable = settings.msaaSamples === 4 && !msaaBlocked;
  // Every mover since the last frame needs C-14 previous-frame data; static
  // scenes qualify trivially (moving === 0).
  const taaAllowed = velocity.movingWithHistory >= velocity.moving;

  if (authored === "off") return { mode: "off", sampleCount: 1 };
  if (authored === "fxaa") return { mode: "fxaa", sampleCount: 1 };
  if (authored === "smaa") return { mode: "smaa", sampleCount: 1 };
  if (authored === "taa") {
    if (taaAllowed) return { mode: "taa", sampleCount: 1 };
    return msaaCapable
      ? { mode: "msaa", sampleCount: 4, reason: "taa-blocked-velocity-coverage" }
      : { mode: "smaa", sampleCount: 1, reason: "taa-blocked-velocity-coverage" };
  }
  if (authored === "msaa") {
    return msaaCapable
      ? { mode: "msaa", sampleCount: 4 }
      : { mode: "smaa", sampleCount: 1, reason: "msaa-pixel-guard" };
  }

  // `auto` — the C-27 tier row resolves the mode.
  const tierMode = settings.postAntiAlias;
  if (tierMode === "fxaa") return { mode: "fxaa", sampleCount: 1 };
  if (tierMode === "taa") {
    if (taaAllowed) return { mode: "taa", sampleCount: 1 };
    return msaaCapable
      ? { mode: "msaa", sampleCount: 4, reason: "taa-blocked-velocity-coverage" }
      : { mode: "smaa", sampleCount: 1, reason: "taa-blocked-velocity-coverage" };
  }
  // tierMode === "none": the tier's AA lives in the multisampled forward target.
  if (msaaCapable) return { mode: "msaa", sampleCount: 4 };
  // MSAA blocked by the pixel guard; CCR-03-4 is pending so auto never selects
  // TAA for a `postAntiAlias: "none"` tier — SMAA 1x is the substitute.
  return { mode: "smaa", sampleCount: 1, reason: "msaa-pixel-guard" };
}
