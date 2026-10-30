/**
 * GU47 E-G (WP-7 item 2): `A3D_QR_TIERS` post-only mode (`tiers.post`). An
 * app whose post tier is `auto` runs post at its device's C-27 tier (capped
 * at High) while the rest of the tiers lane stays off.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { DeviceProbe } from "../../../../packages/rendering/src/contracts/device";
import { frameContributors, type FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import {
  POST_ONLY_TIER_CONTRIBUTOR,
  POST_ONLY_TIER_FLAG,
  clearPostOnlyTier,
  postOnlyTierFor,
  recordPostOnlyTier,
  resolvePostOnlyTier
} from "../../../../packages/rendering/src/post/PostQualityTiers";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { createProductionRuntimePostprocess, resolvePostQualityTier } from "../../../../packages/engine/src/agent-api/compiler/postprocess";
import { recordAuthoredPostContext, resetAuthoredPostContext } from "../../../../packages/engine/src/agent-api/postBridge";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
// Loading the rendering barrel registers the contributor (lanes/prd03.ts).
import "../../../../packages/rendering/src/index";

function probe(over: Partial<DeviceProbe> = {}): DeviceProbe {
  return {
    backend: "webgl2",
    rendererString: "WebKit WebGL",
    unmaskedRenderer: null,
    unmaskedVendor: null,
    maxTextureSize: 16384,
    maxSamples: 4,
    floatColorBuffer: true,
    halfFloatColorBuffer: true,
    timerQuery: false,
    parallelShaderCompile: true,
    multiDraw: false,
    devicePixelRatio: 3,
    screen: [390, 844],
    hardwareConcurrency: 8,
    deviceMemoryGB: null,
    mobile: true,
    ...over
  };
}

const canvas = (): HTMLCanvasElement => ({ width: 640, height: 360 }) as HTMLCanvasElement;

afterEach(() => resetAuthoredPostContext());

describe("GU47 E-G resolvePostOnlyTier", () => {
  it("classifies through the C-27 TierResolver and never goes above High", () => {
    expect(resolvePostOnlyTier(probe({ unmaskedRenderer: "Adreno (TM) 730" }))).toBe("medium");
    expect(resolvePostOnlyTier(probe({ unmaskedRenderer: "Mali-G57 MC2" }))).toBe("low");
    // Mobile with 4 cores lowers one tier (TierResolver step 3).
    expect(resolvePostOnlyTier(probe({ unmaskedRenderer: "Adreno (TM) 730", hardwareConcurrency: 4 }))).toBe("low");
    expect(resolvePostOnlyTier(probe({ unmaskedRenderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)", mobile: false }))).toBe("low");
    // A desktop Ultra-class GPU is capped at today's High answer.
    expect(resolvePostOnlyTier(probe({ unmaskedRenderer: "NVIDIA GeForce RTX 4090", mobile: false, screen: [2560, 1440], devicePixelRatio: 1 }))).toBe("high");
    expect(resolvePostOnlyTier(null)).toBe("high");
    expect(resolvePostOnlyTier(probe({ unmaskedRenderer: "Adreno (TM) 730" }), "low")).toBe("low");
  });
});

describe("GU47 E-G post-only tier contributor", () => {
  it("is active only under the tiers.post sub-flag, which leaves the tiers lane off", () => {
    expect(POST_ONLY_TIER_FLAG).toBe("A3D_QR_TIERS_POST");
    const postOnly = resolveQrFlags({ options: ["tiers.post"] });
    expect(postOnly.on("A3D_QR_TIERS_POST")).toBe(true);
    expect(postOnly.on("A3D_QR_TIERS")).toBe(false);
    expect(frameContributors(postOnly)).toContain(POST_ONLY_TIER_CONTRIBUTOR);
    expect(frameContributors(resolveQrFlags({}))).not.toContain(POST_ONLY_TIER_CONTRIBUTOR);
    expect(POST_ONLY_TIER_CONTRIBUTOR.phases).toEqual(["collect"]);
    expect(POST_ONLY_TIER_CONTRIBUTOR.passes).toBeUndefined();
  });

  it("collect records the device tier for the device's canvas and passes items through", () => {
    const target = canvas();
    const items = [] as never[];
    const ctx = { device: { canvas: target, probe: probe({ unmaskedRenderer: "Adreno (TM) 730" }) } } as unknown as FrameContributorContext;
    expect(POST_ONLY_TIER_CONTRIBUTOR.collect!(items, ctx)).toBe(items);
    expect(postOnlyTierFor(target)).toBe("medium");
    // Classified once: a later probe does not re-tier the canvas.
    recordPostOnlyTier(target, probe({ unmaskedRenderer: "Mali-G57" }));
    expect(postOnlyTierFor(target)).toBe("medium");
    clearPostOnlyTier(target);
    expect(postOnlyTierFor(target)).toBeUndefined();
  });
});

describe("GU47 E-G resolvePostQualityTier", () => {
  it("an explicit tier wins; auto follows the recorded device tier, else High", () => {
    const target = canvas();
    expect(resolvePostQualityTier("auto", target)).toBe("high");
    expect(resolvePostQualityTier(null, target)).toBe("high");
    recordPostOnlyTier(target, probe({ unmaskedRenderer: "Mali-G57 MC2" }));
    expect(resolvePostQualityTier("auto", target)).toBe("low");
    expect(resolvePostQualityTier(null, target)).toBe("low");
    expect(resolvePostQualityTier("ultra", target)).toBe("ultra");
    expect(resolvePostQualityTier("auto", canvas())).toBe("high");
    expect(resolvePostQualityTier("auto")).toBe("high");
  });

  it("the post compile of a phone in post-only mode resolves the cheaper tier", () => {
    const flags = resolveQrFlags({ options: ["tiers.post"] });
    const snapshot = { nodes: [effects.bloom({ intensity: 0.4 }).toJSON()], camera: { near: 0.1, far: 100 } } as never;
    const desktop = canvas();
    const phone = canvas();
    recordAuthoredPostContext({ flags, options: {} }, { canvas: desktop } as never);
    const high = createProductionRuntimePostprocess(snapshot, [], 640, 360, true, { canvas: desktop });
    recordAuthoredPostContext({ flags, options: {} }, { canvas: phone } as never);
    recordPostOnlyTier(phone, probe({ unmaskedRenderer: "Mali-G57 MC2" }));
    const low = createProductionRuntimePostprocess(snapshot, [], 640, 360, true, { canvas: phone });
    expect(high.v2).toBe(true);
    expect(low.v2).toBe(true);
    // C-27 rows: High multisamples the forward target, Low does not.
    expect(high.sampleCount).toBe(4);
    expect(low.sampleCount ?? 0).toBeLessThan(4);
    expect(low).not.toEqual(high);
  });
});
