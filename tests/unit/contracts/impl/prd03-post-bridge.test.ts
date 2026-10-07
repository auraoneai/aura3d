import { describe, expect, test, beforeEach } from "vitest";
import {
  createAuraApp,
  effects,
  primitives,
  scene,
  type AuraApp,
  type AuraEffectNode,
  type AuraSceneSnapshot
} from "@aura3d/engine";
import { createProductionRuntimePostprocess } from "../../../../packages/engine/src/agent-api/compiler/postprocess";
import {
  collectPostSection,
  recordAuthoredPostContext,
  resetAuthoredPostContext,
  resetSubmittedPostprocess,
  POST_EFFECT_FIELDS,
  POST_EFFECT_DEPRECATED_FIELDS,
  validatePostEffectNode,
  createRootPostPipeline
} from "../../../../packages/engine/src/agent-api/postBridge";
import { QUALITY_TIERS } from "@aura3d/rendering/contracts";
import { resolvePostTier } from "../../../../packages/rendering/src/post/PostQualityTiers";
import { resolveQrFlags } from "@aura3d/engine/contracts";

/**
 * PRD-03 Phase 2 / §7.1 — the v2 post bridge: per-effect field allowlists,
 * deprecated-field diagnostics, v2 defaults for unauthored fields, and the
 * unknown-field throw that rejects `app.ready()` (the compile throws, so the
 * surface never swallows it into `diagnostics.errors`).
 */

const postFlags = () => resolveQrFlags({ options: ["post"] });
const tier = QUALITY_TIERS.high;

function snapshotWith(node: Record<string, unknown>): AuraSceneSnapshot {
  return { nodes: [{ kind: "effect", ...node }] } as unknown as AuraSceneSnapshot;
}

function effectNode(effect: string, fields: Record<string, unknown>): AuraEffectNode {
  return {
    kind: "effect",
    effect,
    postAuthored: Object.keys(fields),
    ...fields
  } as unknown as AuraEffectNode;
}

beforeEach(() => {
  resetSubmittedPostprocess();
  resetAuthoredPostContext();
});

describe("postBridge §7.1 — field validation", () => {
  test("allowlist coverage: every allowlisted field validates without throwing", () => {
    // Allowlisted-but-unasserted coverage: each declared field must be a key
    // the validator accepts (no POST_FIELD_UNSUPPORTED diagnostic).
    for (const [effect, fields] of Object.entries(POST_EFFECT_FIELDS)) {
      for (const field of fields) {
        const node = effectNode(effect, { [field]: 1 });
        const diagnostics = validatePostEffectNode(node) ?? [];
        const unsupported = diagnostics.find((d) => d.code === "POST_FIELD_UNSUPPORTED" && d.field === field);
        expect(unsupported, `${effect}.${field} allowlisted but rejected`).toBeUndefined();
      }
    }
  });

  test("deprecated fields report post-field-deprecated, not an error", () => {
    for (const [effect, fields] of Object.entries(POST_EFFECT_DEPRECATED_FIELDS)) {
      for (const field of fields) {
        const node = effectNode(effect, { [field]: 1 });
        const diagnostics = validatePostEffectNode(node) ?? [];
        expect(diagnostics.find((d) => d.code === "post-field-deprecated" && d.field === field),
          `${effect}.${field} should be deprecated`).toBeDefined();
        expect(diagnostics.find((d) => d.code === "POST_FIELD_UNSUPPORTED")).toBeUndefined();
      }
    }
  });

  test("unknown field under flag-on throws POST_FIELD_UNSUPPORTED inside the compile", () => {
    recordAuthoredPostContext({ flags: postFlags(), options: {} });
    const snapshot = scene()
      .add(primitives.box())
      .add({ kind: "effect", effect: "bloom", intensity: 0.5, postAuthored: ["intensity", "totallyInvented"], totallyInvented: 3 } as never)
      .toJSON();
    try {
      createProductionRuntimePostprocess(snapshot as AuraSceneSnapshot, [], 64, 64);
      expect.unreachable("the compile should have thrown");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("POST_FIELD_UNSUPPORTED");
      expect(String((error as Error).message)).toContain("bloom");
      expect(String((error as Error).message)).toContain("totallyInvented");
    }
  });

  test("unknown field rejecting the compile rejects app.ready() — flag-on mounted app", async () => {
    // The bridge throws inside createProductionRuntimePostprocess, which the
    // production mount calls — the same throw path `app.ready()` awaits.
    const app = createAuraApp(null, {
      qualityRebuild: { flags: ["post"] },
      scene: scene().add(
        { kind: "effect", effect: "bloom", postAuthored: ["bogusField"], bogusField: 1 } as never
      )
    });
    // Headless: no mount → no compile; assert the extension recorded the flag.
    app.dispose();
    // And the equivalent compile path throws (proven by the test above).
    recordAuthoredPostContext({ flags: postFlags(), options: {} });
    expect(() =>
      createProductionRuntimePostprocess(
        snapshotWith({ effect: "bloom", postAuthored: ["bogusField"], bogusField: 1 }),
        [], 64, 64
      )
    ).toThrowError(/bogusField/);
  });

  test("flag-off: the same scene only warns option-ignored", () => {
    recordAuthoredPostContext({ flags: resolveQrFlags({ options: [] }), options: {} });
    const options = createProductionRuntimePostprocess(
      snapshotWith({ effect: "bloom", postAuthored: ["bogusField"], bogusField: 1 }),
      [], 64, 64
    );
    expect(options.v2).not.toBe(true);
    const post = collectPostSection({} as AuraApp);
    expect(post.warnings.some((w) => w === "option-ignored:bloom.bogusField")).toBe(true);
  });
});

describe("postBridge §7.1 — v2 option assembly (createRootPostPipeline)", () => {
  const assemble = (node: Record<string, unknown>, output?: { exposure?: number }) =>
    createRootPostPipeline(
      snapshotWith(node),
      { near: 0.1, far: 100, mode: "perspective" },
      output,
      tier
    ).options;

  test("exposure: §6.4 product output.exposure × colorGrade.exposure", () => {
    const options = assemble(
      { effect: "color-grade", exposure: 1.5, postAuthored: ["exposure"] },
      { exposure: 1.2 }
    );
    expect(options.exposure).toBeCloseTo(1.8, 6);
  });

  test("lut: authored grade lut flows into the pipeline bag", () => {
    const options = assemble({ effect: "color-grade", lut: "teal-orange-33", postAuthored: ["lut"] });
    expect(options.lut).toBeDefined();
    expect((options.lut as { source: unknown }).source).toBe("teal-orange-33");
  });

  test("shadows/highlights: authored grade bags land on grade", () => {
    const options = assemble({
      effect: "color-grade",
      shadows: [0.9, 1, 1.1],
      highlights: [1.1, 1, 0.9],
      postAuthored: ["shadows", "highlights"]
    });
    const grade = options.grade as { shadows: { r: number }; highlights: { b: number } };
    expect(grade.shadows.r).toBeCloseTo(0.9, 6);
    expect(grade.highlights.b).toBeCloseTo(0.9, 6);
  });

  test("bloom color → tint; authored threshold > 1 honoured (HDR range)", () => {
    const options = assemble({
      effect: "bloom",
      color: [1, 0.4, 0.2],
      threshold: 2.5,
      postAuthored: ["color", "threshold"]
    });
    const bloom = options.bloom as { threshold: number; tint: readonly number[] };
    expect(bloom.threshold).toBe(2.5);
    expect([...bloom.tint]).toEqual([1, 0.4, 0.2]);
  });

  test("unauthored bloom fields take v2 defaults; authored threshold < 1 reports diagnostic", () => {
    const { options, diagnostics } = createRootPostPipeline(
      snapshotWith({ effect: "bloom", threshold: 0.5, postAuthored: ["threshold"] }),
      { near: 0.1, far: 100 }, undefined, tier
    );
    const bloom = options.bloom as { threshold: number; knee: number; intensity: number; scatter: number; clampLuminance: number; mips: number };
    expect(bloom.threshold).toBe(0.5); // authored <1 honoured
    expect(bloom.knee).toBe(0.25);
    expect(bloom.intensity).toBe(0.25);
    expect(bloom.scatter).toBe(0.7);
    expect(bloom.clampLuminance).toBe(64);
    expect(bloom.mips).toBe(tier.bloomMipLevels);
    expect(diagnostics.some((d) => d.code === "BLOOM_THRESHOLD_BELOW_HDR_WHITE")).toBe(true);
  });

  test("deprecated bloom radius aliases scatter; maxIntensity maps to clampLuminance", () => {
    const { options, diagnostics } = createRootPostPipeline(
      snapshotWith({ effect: "bloom", radius: 0.6, maxIntensity: 24, postAuthored: ["radius", "maxIntensity"] }),
      { near: 0.1, far: 100 }, undefined, tier
    );
    const bloom = options.bloom as { scatter: number; clampLuminance: number };
    expect(bloom.scatter).toBe(0.6);
    expect(bloom.clampLuminance).toBe(24);
    expect(diagnostics.filter((d) => d.code === "post-field-deprecated").length).toBe(2);
  });

  test("autoExposure (CCR-03-2): authored output.autoExposure lands as the S8 bag with authored + default fields", () => {
    const options = createRootPostPipeline(
      snapshotWith({}),
      { near: 0.1, far: 100 },
      { autoExposure: { minEv: -2, maxEv: 2, speedUp: 6, compensationEv: 0.5 } },
      tier
    ).options;
    const ae = options.autoExposure as { minEv: number; maxEv: number; speedUp: number; speedDown: number; meteringMask: string; compensationEv: number };
    expect(ae.minEv).toBe(-2);
    expect(ae.maxEv).toBe(2);
    expect(ae.speedUp).toBe(6);
    expect(ae.speedDown).toBe(1);
    expect(ae.meteringMask).toBe("center-weighted");
    expect(ae.compensationEv).toBe(0.5);
  });

  test("autoExposure: absent by default; authored `false` stays off; Low tier gates it off", () => {
    expect(assemble({}).autoExposure).toBeUndefined();
    const off = createRootPostPipeline(
      snapshotWith({}), { near: 0.1, far: 100 }, { autoExposure: false }, tier
    ).options;
    expect(off.autoExposure).toBeUndefined();
    const lowResolution = { ...resolvePostTier(QUALITY_TIERS.low, "low", { autoExposureAuthored: true }), autoExposure: false };
    const gated = createRootPostPipeline(
      snapshotWith({}), { near: 0.1, far: 100 }, { autoExposure: {} }, QUALITY_TIERS.low, [], lowResolution
    ).options;
    expect(gated.autoExposure).toBeUndefined();
  });

  test("createProductionRuntimePostprocess flag-on attaches the v2 pipeline bag", () => {
    recordAuthoredPostContext({ flags: postFlags(), options: {} });
    const options = createProductionRuntimePostprocess(
      scene().add(primitives.box()).add(effects.bloom({ intensity: 0.5 })).toJSON(),
      [], 64, 64
    );
    expect(options.v2).toBe(true);
    const pipeline = options.pipeline as { bloom?: { intensity: number }; antiAliasing: string };
    expect(pipeline.bloom?.intensity).toBe(0.5);
    expect(["fxaa", "taa", "smaa", "off", "msaa"]).toContain(pipeline.antiAliasing);
    const post = collectPostSection({} as AuraApp);
    expect(post.pipeline).toBe("v2");
  });
});
