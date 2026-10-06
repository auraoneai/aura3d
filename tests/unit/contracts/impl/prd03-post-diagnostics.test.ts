import { describe, expect, test, beforeEach } from "vitest";
import {
  createAuraApp,
  effects,
  primitives,
  scene,
  createProductionRuntimePostprocess,
  collectPostSection,
  collectExposureSection,
  latestSubmittedPostprocess,
  resetSubmittedPostprocess
} from "@aura3d/engine";
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
  beforeEach(() => resetSubmittedPostprocess());

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

  test("exposure section: applied stays the pinned 1; authored grade exposure is reported separately", () => {
    createProductionRuntimePostprocess(snapshotWithEffects(), [], 320, 200);
    const exposure = collectExposureSection({} as AuraApp);
    // Phase 0 truth: legacy toneMapping.exposure is pinned at 1 — the authored
    // 1.35 must NOT leak into `applied` before Phase 1 wiring.
    expect(exposure.applied).toBe(1);
    expect(exposure.authoredGradeExposure).toBe(1.35);
    expect(exposure.operator).toBe("aces");
  });

  test("flag-off keeps the same truthful data (diagnostics plumbing is flag-neutral)", () => {
    const flags = resolveQrFlags({ options: [] });
    expect(flags.on("A3D_QR_POST")).toBe(false);
    createProductionRuntimePostprocess(scene().add(effects.bloom({ intensity: 0.5 })).toJSON(), [], 160, 90);
    expect(latestSubmittedPostprocess()?.authored.bloom).toBe(true);
    expect(collectPostSection({} as AuraApp).submittedPasses).toContain("bloom");
  });
});
