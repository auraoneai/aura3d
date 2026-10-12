/* PRD 11 pixel wiring — the lane-11 `quality` extension's controller is bound
 * to the app's QrFlags, and the renderer reads that live tier per frame
 * (forward programs, frame contributors, shadow bridge, pixel-ratio cap).
 * Before this, `AuraQuality` resolved a tier no renderer input consumed, so
 * A3D_QR_TIERS on/off produced byte-identical frames (GPU run 38198437517).
 */
import "@aura3d/engine";
import { describe, expect, it } from "vitest";

import { appExtensionsAll } from "../../../../packages/engine/src/contracts/app";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { bindLiveQualityTier, prd11LiveQualityTier } from "../../../../packages/rendering/src/quality/liveTier";

const qualityExtension = () => {
  const extension = appExtensionsAll().find((entry) => entry.id === "prd11.quality");
  expect(extension).toBeDefined();
  return extension!;
};

describe("PRD 11 live tier wiring", () => {
  it("flag off: no live tier, so renderer fallbacks stay QUALITY_TIERS.high", () => {
    const off = resolveQrFlags({ options: { A3D_QR_TIERS: false } });
    const extension = qualityExtension();
    const value = extension.create({} as never, { flags: off, options: {} as never });
    expect(prd11LiveQualityTier(off)).toBeUndefined();
    extension.dispose?.(value as never);
  });

  it("flag on: the app's controller tier and settings reach the renderer seam, and unbind on dispose", () => {
    const tiers = resolveQrFlags({ options: ["tiers"] });
    const extension = qualityExtension();
    const value = extension.create({} as never, {
      flags: tiers,
      options: { renderer: { quality: { tier: "low" } } } as never
    }) as { tier: string; settings: unknown };
    const live = prd11LiveQualityTier(tiers);
    expect(live).toBeDefined();
    expect(live!.tier).toBe(value.tier);
    expect(live!.settings).toBe(value.settings);
    extension.dispose?.(value as never);
    expect(prd11LiveQualityTier(tiers)).toBeUndefined();
  });

  it("two apps never read each other's tier", () => {
    const a = resolveQrFlags({ options: ["tiers"] });
    const b = resolveQrFlags({ options: ["tiers"] });
    const unbind = bindLiveQualityTier(a, { tier: "low", settings: QUALITY_TIERS.low });
    expect(prd11LiveQualityTier(a)?.tier).toBe("low");
    expect(prd11LiveQualityTier(b)).toBeUndefined();
    unbind();
    expect(prd11LiveQualityTier(a)).toBeUndefined();
  });

  it("a renderer bound to tiers-on flags renders with the bound tier without throwing", async () => {
    const { Renderer } = await import("@aura3d/rendering");
    const tiers = resolveQrFlags({ options: ["tiers"] });
    const unbind = bindLiveQualityTier(tiers, { tier: "low", settings: QUALITY_TIERS.low });
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: tiers });
    for (let frame = 0; frame < 2; frame += 1) renderer.render([]);
    renderer.dispose();
    unbind();
  });
});
