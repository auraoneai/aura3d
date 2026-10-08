/**
 * PRD-06 T0.19 — `resolvePrd06Options(ctx, appOptions)`: the C-38
 * `animation?: AuraCreateAppAnimationOptions` resolver. Every branch:
 * strict from options (post-CCR-06-1) or `ctx.strict`; `defaults` from options
 * or the `A3D_QR_ANIMATION` flag ("3.1"/"3.0"); `mixer` from options or
 * `A3D_QR_ANIMATION_POSE_MIXER`; `tier` from options or `ctx.quality.tier`.
 */

import { describe, expect, it } from "vitest";

import type { AuraQualityTier } from "@aura3d/rendering/contracts";
import { resolvePrd06Options } from "../../../../packages/engine/src/agent-api/compiler/animation.js";

function ctx(overrides: { strict?: boolean; tier?: AuraQualityTier; flags?: Record<string, boolean> } = {}) {
  const flags = overrides.flags ?? {};
  return {
    strict: overrides.strict ?? false,
    quality: { tier: overrides.tier ?? ("high" as AuraQualityTier) },
    flags: { values: flags, on: (name: string) => flags[name] === true }
  };
}

describe("resolvePrd06Options (T0.19)", () => {
  it("resolves strict from ctx.strict when options omit it", () => {
    expect(resolvePrd06Options(ctx({ strict: true })).strict).toBe(true);
    expect(resolvePrd06Options(ctx({ strict: false })).strict).toBe(false);
  });

  it("options.strict wins over ctx.strict in both directions", () => {
    expect(resolvePrd06Options(ctx({ strict: false }), { strict: true }).strict).toBe(true);
    expect(resolvePrd06Options(ctx({ strict: true }), { strict: false }).strict).toBe(false);
  });

  it("defaults follow the A3D_QR_ANIMATION flag: 3.1 on / 3.0 off", () => {
    expect(resolvePrd06Options(ctx({ flags: { A3D_QR_ANIMATION: true } })).defaults).toBe("3.1");
    expect(resolvePrd06Options(ctx()).defaults).toBe("3.0");
  });

  it("options.defaults wins over the flag default", () => {
    expect(resolvePrd06Options(ctx({ flags: { A3D_QR_ANIMATION: true } }), { defaults: "3.0" }).defaults).toBe("3.0");
    expect(resolvePrd06Options(ctx(), { defaults: "3.1" }).defaults).toBe("3.1");
  });

  it("mixer follows A3D_QR_ANIMATION_POSE_MIXER: pose on / legacy off", () => {
    expect(resolvePrd06Options(ctx({ flags: { A3D_QR_ANIMATION_POSE_MIXER: true } })).mixer).toBe("pose");
    expect(resolvePrd06Options(ctx()).mixer).toBe("legacy");
  });

  it("options.mixer wins over the flag default", () => {
    expect(resolvePrd06Options(ctx({ flags: { A3D_QR_ANIMATION_POSE_MIXER: true } }), { mixer: "legacy" }).mixer).toBe("legacy");
    expect(resolvePrd06Options(ctx(), { mixer: "pose" }).mixer).toBe("pose");
  });

  it("tier follows ctx.quality.tier and options.tier overrides it", () => {
    expect(resolvePrd06Options(ctx({ tier: "low" })).tier).toBe("low");
    expect(resolvePrd06Options(ctx({ tier: "low" }), { tier: "ultra" }).tier).toBe("ultra");
  });
});
