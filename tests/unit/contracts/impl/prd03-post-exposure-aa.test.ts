import { describe, expect, test, beforeEach } from "vitest";
import {
  effects,
  scene,
  camera,
  primitives,
  type AuraApp
} from "@aura3d/engine";
import { createProductionRuntimePostprocess } from "../../../../packages/engine/src/agent-api/compiler/postprocess";
import {
  collectPostSection,
  latestSubmittedPostprocess,
  recordAuthoredPostContext,
  resetAuthoredPostContext,
  resetSubmittedPostprocess
} from "../../../../packages/engine/src/agent-api/postBridge";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import { QUALITY_TIERS, Renderer, resolvePostAntiAlias } from "@aura3d/rendering";

/**
 * PRD-03 Phase 1 — flag-on wiring on the legacy chain: exposure product
 * (§6.4), C-38 operator, real depth range (§6.11/CCR-03-1), tier AA
 * (§6.5/§7.2, never FXAA on MSAA), and the r185 FXAA variant submit.
 */

const flagOnContext = (output?: { exposure?: number; toneMapping?: "none" | "linear" | "reinhard" | "aces" | "agx" | "neutral" }) =>
  ({ flags: resolveQrFlags({ options: ["post"] }), options: { output } });
const flagOffContext = () =>
  ({ flags: resolveQrFlags({ options: [] }), options: {} });

const snapshotWithEffects = () =>
  scene()
    .add(primitives.box({ name: "post subject" }))
    .add(effects.bloom({ intensity: 0.5, threshold: 0.3 }))
    .add(effects.colorGrade({ contrast: 1.1, saturation: 1.2, exposure: 1.04 }))
    .add(effects.antiAlias({ mode: "fxaa" }))
    .toJSON();

describe("resolvePostAntiAlias (§7.2)", () => {
  const velocity = { moving: 0, movingWithHistory: 0 };

  test("explicit modes", () => {
    const base = { renderPixels: 1_920 * 1_080, velocity };
    expect(resolvePostAntiAlias({ settings: QUALITY_TIERS.high, tier: "high", authored: "off", ...base }).mode).toBe("off");
    expect(resolvePostAntiAlias({ settings: QUALITY_TIERS.high, tier: "high", authored: "fxaa", ...base })).toEqual({ mode: "fxaa", sampleCount: 1 });
    expect(resolvePostAntiAlias({ settings: QUALITY_TIERS.high, tier: "high", authored: "smaa", ...base })).toEqual({ mode: "smaa", sampleCount: 1 });
    expect(resolvePostAntiAlias({ settings: QUALITY_TIERS.high, tier: "high", authored: "msaa", ...base })).toEqual({ mode: "msaa", sampleCount: 4 });
    // Static frame: every mover (none) has history → TAA allowed.
    expect(resolvePostAntiAlias({ settings: QUALITY_TIERS.high, tier: "high", authored: "taa", ...base })).toEqual({ mode: "taa", sampleCount: 1 });
  });

  test("explicit taa falls back when velocity coverage fails", () => {
    const input = { settings: QUALITY_TIERS.ultra, tier: "ultra" as const, authored: "taa" as const, renderPixels: 1_920 * 1_080, velocity: { moving: 3, movingWithHistory: 1 } };
    const resolved = resolvePostAntiAlias(input);
    expect(resolved.mode).toBe("msaa");
    expect(resolved.sampleCount).toBe(4);
    expect(resolved.reason).toBe("taa-blocked-velocity-coverage");
  });

  test("pixel guard downgrades msaa to smaa above 2.4 Mpx", () => {
    const resolved = resolvePostAntiAlias({ settings: QUALITY_TIERS.high, tier: "high", authored: "msaa", renderPixels: 3840 * 2160, velocity });
    expect(resolved.mode).toBe("smaa");
    expect(resolved.sampleCount).toBe(1);
    expect(resolved.reason).toBe("msaa-pixel-guard");
  });

  test("auto: C-27 tier row drives the mode", () => {
    expect(resolvePostAntiAlias({ settings: QUALITY_TIERS.low, tier: "low", authored: "auto", renderPixels: 1_000_000, velocity }).mode).toBe("fxaa");
    expect(resolvePostAntiAlias({ settings: QUALITY_TIERS.medium, tier: "medium", authored: "auto", renderPixels: 1_000_000, velocity })).toEqual({ mode: "msaa", sampleCount: 4 });
    expect(resolvePostAntiAlias({ settings: QUALITY_TIERS.ultra, tier: "ultra", authored: "auto", renderPixels: 1_000_000, velocity }).mode).toBe("taa");
    // Ultra velocity-coverage failure → MSAA fallback (the C-27 "none" + msaaSamples 4 row).
    const failed = resolvePostAntiAlias({ settings: QUALITY_TIERS.ultra, tier: "ultra", authored: "auto", renderPixels: 1_000_000, velocity: { moving: 2, movingWithHistory: 0 } });
    expect(failed.mode).toBe("msaa");
    expect(failed.reason).toBe("taa-blocked-velocity-coverage");
  });

  test("auto never selects taa for a postAntiAlias:none tier (CCR-03-4 pending), even with full coverage", () => {
    const resolved = resolvePostAntiAlias({ settings: QUALITY_TIERS.high, tier: "high", authored: "auto", renderPixels: 3840 * 2160, velocity });
    expect(resolved.mode).toBe("smaa");
    expect(resolved.mode).not.toBe("taa");
  });

  test("invariant: FXAA never resolves on a multisampled forward target", () => {
    for (const tier of ["low", "medium", "high", "ultra"] as const) {
      for (const authored of ["auto", "msaa", "taa", "smaa", "fxaa", "off"] as const) {
        const resolved = resolvePostAntiAlias({ settings: QUALITY_TIERS[tier], tier, authored, renderPixels: 2_000_000, velocity: { moving: 1, movingWithHistory: 0 } });
        if (resolved.mode === "fxaa") expect(resolved.sampleCount).toBe(1);
        if (resolved.sampleCount === 4) expect(resolved.mode).not.toBe("fxaa");
      }
    }
  });
});

describe("compiler Phase-1 wiring (flag A3D_QR_POST)", () => {
  beforeEach(() => {
    resetSubmittedPostprocess();
    resetAuthoredPostContext();
  });

  test("flag on: exposure = output.exposure × colorGrade.exposure; operator from C-38 output", () => {
    recordAuthoredPostContext(flagOnContext({ exposure: 1.05, toneMapping: "agx" }));
    const options = createProductionRuntimePostprocess(snapshotWithEffects(), [], 320, 200);
    const toneMapping = options.toneMapping as { exposure: number; operator: string };
    expect(toneMapping.exposure).toBeCloseTo(1.05 * 1.04, 6);
    expect(toneMapping.operator).toBe("agx");
  });

  test("flag on: toneMapping.exposure === 1.05 for colorGrade({exposure:1.05})", () => {
    recordAuthoredPostContext(flagOnContext());
    const options = createProductionRuntimePostprocess(
      scene().add(effects.colorGrade({ exposure: 1.05 })).toJSON(),
      [],
      320,
      200
    );
    expect((options.toneMapping as { exposure: number }).exposure).toBeCloseTo(1.05, 6);
  });

  test("flag off: pinned exposure 1, aces, no depthRange, legacy fxaa semantics", () => {
    recordAuthoredPostContext(flagOffContext());
    const options = createProductionRuntimePostprocess(snapshotWithEffects(), [], 320, 200);
    const toneMapping = options.toneMapping as { exposure: number; operator: string };
    expect(toneMapping.exposure).toBe(1);
    expect(toneMapping.operator).toBe("aces");
    expect(options.depthRange).toBeUndefined();
    expect(options.sampleCount).toBeUndefined();
    expect(options.fxaa).toEqual({});
  });

  test("flag on: authored fxaa submits the r185 variant (present split + dither)", () => {
    recordAuthoredPostContext(flagOnContext());
    const options = createProductionRuntimePostprocess(snapshotWithEffects(), [], 320, 200);
    expect(options.fxaa).toEqual({ variant: "r185" });
    expect(options.sampleCount).toBe(1);
    expect(latestSubmittedPostprocess()?.authored.resolvedAntiAlias?.mode).toBe("fxaa");
  });

  test("flag on: antiAlias node without authored mode resolves via the tier row (high → msaa 4x, no fxaa)", () => {
    recordAuthoredPostContext(flagOnContext());
    const options = createProductionRuntimePostprocess(
      scene().add(effects.antiAlias()).toJSON(),
      [],
      1280,
      720
    );
    expect(options.sampleCount).toBe(4);
    expect(options.fxaa).toBeUndefined();
    expect(latestSubmittedPostprocess()?.authored.resolvedAntiAlias).toMatchObject({ mode: "msaa", sampleCount: 4 });
  });

  test("flag on: real camera depth range reaches the options (CCR-03-1)", () => {
    recordAuthoredPostContext(flagOnContext());
    const defaults = createProductionRuntimePostprocess(snapshotWithEffects(), [], 320, 200);
    expect(defaults.depthRange).toEqual({ near: 0.05, far: 100, projection: "perspective" });
    const custom = createProductionRuntimePostprocess(
      scene().camera(camera.perspective({ near: 0.5, far: 250 })).add(effects.bloom()).toJSON(),
      [],
      320,
      200
    );
    expect(custom.depthRange).toEqual({ near: 0.5, far: 250, projection: "perspective" });
    const ortho = createProductionRuntimePostprocess(
      scene().camera(camera.orthographic({ near: 0.5, far: 250 })).add(effects.bloom()).toJSON(),
      [],
      320,
      200
    );
    expect(ortho.depthRange?.projection).toBe("orthographic");
  });

  test("flag on: output.toneMapping 'none' disables the tone-mapping pass", () => {
    recordAuthoredPostContext(flagOnContext({ toneMapping: "none" }));
    const options = createProductionRuntimePostprocess(snapshotWithEffects(), [], 320, 200);
    expect(options.toneMapping).toBe(false);
  });

  test("post section reports the tier-AA resolution", () => {
    recordAuthoredPostContext(flagOnContext());
    createProductionRuntimePostprocess(snapshotWithEffects(), [], 320, 200);
    const post = collectPostSection({} as AuraApp);
    expect(post.antiAlias).toMatchObject({ mode: "fxaa", sampleCount: 1, tier: "high" });
  });
});

describe("depthRange forwarding (CCR-03-1)", () => {
  test("executePostprocess forwards { near, far } into presentLdrPostprocess", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 3, height: 2, clearColor: [0.2, 0.3, 0.4, 1] });
    const received: ({ near: number; far: number } | undefined)[] = [];
    renderer.device.presentLdrPostprocess = (source, options) => {
      received.push(options.depthRange);
      renderer.device.presentRenderTarget?.(source);
    };
    renderer.render({
      renderItems: [],
      postprocess: {
        targetFormat: "rgba8",
        toneMapping: { exposure: 1, operator: "aces" },
        depthRange: { near: 0.05, far: 100, projection: "perspective" }
      }
    });
    expect(received).toEqual([{ near: 0.05, far: 100 }]);
    renderer.dispose();
  });
});
