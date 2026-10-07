import { describe, expect, test, beforeEach } from "vitest";
import {
  createAuraApp,
  effects,
  primitives,
  scene
} from "@aura3d/engine";
import { createProductionRuntimePostprocess } from "../../../../packages/engine/src/agent-api/compiler/postprocess";
import { createPrd03PostSurface } from "../../../../packages/engine/src/lanes/prd03";
import {
  collectPostSection,
  collectExposureSection,
  latestSubmittedPostprocess,
  recordAuthoredPostContext,
  resetAuthoredPostContext,
  resetSubmittedPostprocess
} from "../../../../packages/engine/src/agent-api/postBridge";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import type { AuraApp } from "@aura3d/engine";

/**
 * C-31 `post`/`exposure` sections report what the submitted chain does — the
 * options `compiler/postprocess.ts` hands the renderer, planned through the
 * renderer's own planner. No GPU required.
 */

const snapshotWithEffects = () =>
  scene()
    .add(primitives.box({ name: "post subject" }))
    .add(effects.bloom({ intensity: 0.5, threshold: 0.3 }))
    .add(effects.colorGrade({ contrast: 1.1, saturation: 1.2, exposure: 1.35 }))
    .add(effects.antiAlias({ mode: "fxaa" }))
    .toJSON();

describe("post/exposure diagnostics sections", () => {
  beforeEach(() => {
    resetSubmittedPostprocess();
    resetAuthoredPostContext();
  });

  test("sections mount under their keys flag-on", () => {
    const app = createAuraApp(null, {
      qualityRebuild: { flags: ["post"] },
      scene: scene().add(primitives.box())
    });
    const diagnostics = app.diagnostics() as unknown as Record<string, unknown>;
    expect(diagnostics.post).toBeDefined();
    expect(diagnostics.exposure).toBeDefined();
    app.dispose();
  });

  test("no submitted chain → honest empty section, not fabricated data", () => {
    const app = createAuraApp(null, { qualityRebuild: { flags: ["post"] }, scene: scene().add(primitives.box()) });
    const post = collectPostSection(app as AuraApp);
    expect(post.present).toBe(false);
    expect(post.pipeline).toBe("legacy");
    expect(post.submittedPasses).toEqual([]);
    expect(post.executionMode).toBeNull();
    const exposure = collectExposureSection(app as AuraApp);
    expect(exposure.applied).toBeNull();
    app.dispose();
  });

  test("submitted options record through the production bridge", () => {
    const options = createProductionRuntimePostprocess(snapshotWithEffects(), [], 320, 200);
    const submitted = latestSubmittedPostprocess();
    expect(submitted?.options).toBe(options);
    expect(submitted?.renderWidth).toBe(320);
    expect(submitted?.renderHeight).toBe(200);
    expect(submitted?.authored.bloom).toBe(true);
    expect(submitted?.authored.colorGrade).toBe(true);
    expect(submitted?.authored.colorGradeExposure).toBe(1.35);
    expect(submitted?.authored.antiAliasMode).toBe("fxaa");
  });

  test("post section lists the passes the legacy chain executes", () => {
    createProductionRuntimePostprocess(snapshotWithEffects(), [], 320, 200);
    const post = collectPostSection({} as AuraApp);
    expect(post.present).toBe(true);
    expect(post.submittedPasses).toContain("bloom");
    expect(post.submittedPasses).toContain("color-grade");
    expect(post.submittedPasses).toContain("fxaa");
    expect(post.submittedPasses).toContain("tone-mapping");
    expect(post.executionMode).not.toBeNull();
    expect(post.targetFormat).toBe("rgba16f");
  });

  test("exposure section: flag-off keeps the pinned 1; flag-on applies the §6.4 product", () => {
    // Flag-off (no authored post context): legacy truth — the authored 1.35
    // stays diagnostic-only and `applied` is the pinned 1.
    createProductionRuntimePostprocess(snapshotWithEffects(), [], 320, 200);
    let exposure = collectExposureSection({} as AuraApp);
    expect(exposure.applied).toBe(1);
    expect(exposure.authoredGradeExposure).toBe(1.35);
    expect(exposure.operator).toBe("aces");
    // Flag-on (Phase 1): exposure = output.exposure × colorGrade.exposure.
    recordAuthoredPostContext({ flags: resolveQrFlags({ options: ["post"] }), options: {} });
    createProductionRuntimePostprocess(snapshotWithEffects(), [], 320, 200);
    exposure = collectExposureSection({} as AuraApp);
    expect(exposure.applied).toBeCloseTo(1.35, 6);
    expect(exposure.authoredGradeExposure).toBe(1.35);
  });

  test("multi-app: sections never read a sibling app's submitted record (review P2)", () => {
    // Headless createAuraApp never mounts → never compiles. Replicate the real
    // ordering instead: both factories run synchronously, then each app's
    // async mount compiles — possibly out of order. Canvas-keyed stores must
    // still land each record/context on the owning app.
    const canvasA = {} as HTMLCanvasElement;
    const canvasB = {} as HTMLCanvasElement;
    const appA = { canvas: canvasA } as AuraApp;
    const appB = { canvas: canvasB } as AuraApp;
    createPrd03PostSurface(appA, { flags: resolveQrFlags({ options: ["post"] }), options: {} });
    createPrd03PostSurface(appB, { flags: resolveQrFlags({ options: ["post"] }), options: {} });
    // B's mount resolves first — the wrong ordering for a global `latest`.
    createProductionRuntimePostprocess(
      scene().add(effects.antiAlias({ mode: "fxaa" })).toJSON(), [], 320, 200, true, { canvas: canvasB });
    createProductionRuntimePostprocess(
      scene().add(effects.bloom({ intensity: 0.5 })).toJSON(), [], 320, 200, true, { canvas: canvasA });
    const postA = collectPostSection(appA);
    const postB = collectPostSection(appB);
    expect(postA.submittedPasses).toContain("bloom");
    expect(postA.submittedPasses).not.toContain("fxaa");
    expect(postB.submittedPasses).toContain("fxaa");
    expect(postB.submittedPasses).not.toContain("bloom");
  });

  test("flag-off keeps the same truthful data (diagnostics plumbing is flag-neutral)", () => {
    const flags = resolveQrFlags({ options: [] });
    expect(flags.on("A3D_QR_POST")).toBe(false);
    createProductionRuntimePostprocess(scene().add(effects.bloom({ intensity: 0.5 })).toJSON(), [], 160, 90);
    expect(latestSubmittedPostprocess()?.authored.bloom).toBe(true);
    expect(collectPostSection({} as AuraApp).submittedPasses).toContain("bloom");
  });
});
