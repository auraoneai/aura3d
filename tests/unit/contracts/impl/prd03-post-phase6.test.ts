import { describe, expect, it } from "vitest";
import {
  registerPostPass,
  registeredPostPasses,
  type PostPassDescriptor,
  type PostInsertAt,
  type PostPipelineOptions
} from "../../../../packages/rendering/src/contracts/post";
import { planPostGraph, POST_STAGE_DESCRIPTORS } from "@aura3d/rendering";
import { v2NeedsLdrTail } from "../../../../packages/rendering/src/post/v2Stages";
import { adaptEv } from "../../../../packages/rendering/src/post/shaders/exposure.glsl";
import {
  SMAA_BLEND_GLSL,
  SMAA_EDGES_GLSL,
  SMAA_WEIGHTS_GLSL
} from "../../../../packages/rendering/src/post/shaders/smaa.glsl";

/**
 * PRD-03 Phase 6 — S8 auto-exposure, S11 SMAA, and real C-13 custom-pass
 * execution. Browser readback/edge-error specs run remote-only (§15.2); the
 * proofs runnable here: the adapt-step math byte-matches the shader's `mix`
 * formula, every §6.1 anchor splices customs in order, the space rule fires
 * at registration, and `v2NeedsLdrTail` routes smaa/after-tonemap customs
 * onto the LDR tail.
 */

const BASE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

const passAt = (id: string, insertAt: PostInsertAt): PostPassDescriptor => ({
  id: `prd03.test-${id}`,
  owner: "prd03",
  flag: "A3D_QR_POST",
  insertAt,
  space: insertAt === "after-tonemap" ? "display" : "linear-hdr",
  inputs: ["color"],
  fragment: { glsl: "void main() { outColor = texture(u_color, v_uv); }" },
  gpuOnly: true
});

describe("S8 auto-exposure (§8.9)", () => {
  const OPTS = { dt: 1 / 60, minEv: -4, maxEv: 4, speedUp: 3, speedDown: 1, compensationEv: 0, hasPrev: true };

  it("first frame boots straight to the target (no lerp)", () => {
    expect(adaptEv(9, 0, { ...OPTS, hasPrev: false })).toBeCloseTo(Math.log2(0.18), 9);
  });

  it("clamps the target into [minEv, maxEv]", () => {
    // avgLog2 very low → target = -avgLog2 + log2(0.18) huge → clamps maxEv.
    expect(adaptEv(0, -20, { ...OPTS, hasPrev: false })).toBe(4);
    expect(adaptEv(0, 20, { ...OPTS, hasPrev: false })).toBe(-4);
    // With history, ev lerps toward the clamped target (never overshoots).
    const next = adaptEv(0, -20, OPTS);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(4);
  });

  it("uses speedUp when the target rises, speedDown when it falls", () => {
    // prev=0, target +3 (avgLog2 chosen so target = 3 ⇒ -avgLog2 - 2.474 = 3 ⇒ avgLog2 = -5.474)
    const rising = adaptEv(0, -(3 - Math.log2(0.18)), OPTS);
    expect(rising).toBeCloseTo(3 * (1 - Math.exp(-(1 / 60) * 3)), 9);
    const falling = adaptEv(0, -( -3 - Math.log2(0.18)), OPTS);
    expect(falling).toBeCloseTo(-3 * (1 - Math.exp(-(1 / 60) * 1)), 9);
  });

  it("§14 proxy: a step converges within 0.1 in ≤1.5 s at speedUp 3", () => {
    // §14's gate: display dark→bright means EV rises — speedUp applies
    // (target > prev). avgLog2 = -6 → target = 6 + log2(0.18) ≈ 3.53.
    const target = -(-6) + Math.log2(0.18);
    let ev = 0;
    let convergedAt = -1;
    for (let frame = 1; frame <= 90; frame += 1) {
      ev = adaptEv(ev, -6, OPTS);
      if (Math.abs(ev - target) <= 0.1 && convergedAt < 0) convergedAt = frame;
    }
    expect(convergedAt, `ev=${ev}`).toBeGreaterThan(0);
    expect(convergedAt).toBeLessThanOrEqual(90); // 1.5 s at 60 fps
    // And the whole trajectory converges (not just a coincidental pass).
    for (let frame = 91; frame <= 120; frame += 1) ev = adaptEv(ev, -6, OPTS);
    expect(Math.abs(ev - target)).toBeLessThanOrEqual(0.1);
  });
});

describe("C-13 custom-pass insertion (§6.1/§6.12)", () => {
  it("a registered pass at each of the five anchors executes in §6.1 order", () => {
    const ids = {
      afterDepth: "afterdepth",
      beforeTaa: "beforetaa",
      afterTaa: "aftertaa",
      beforeTonemap: "beforetonemap",
      afterTonemap: "aftertonemap"
    } as const;
    const customs: PostPassDescriptor[] = [
      passAt(ids.afterDepth, "after-depth"),
      passAt(ids.beforeTaa, "before-taa"),
      passAt(ids.afterTaa, "after-taa"),
      passAt(ids.beforeTonemap, "before-tonemap"),
      passAt(ids.afterTonemap, "after-tonemap")
    ];
    const report = planPostGraph(
      { ...BASE, ao: {}, antiAliasing: "taa", autoExposure: {}, dof: {}, motionBlur: {}, customPasses: customs },
      { width: 160, height: 90 }
    );
    const names = report.stages.map((stage) => stage.name);
    const idx = (name: string) => names.indexOf(name);
    const p = (id: string) => idx(`prd03.test-${id}`);
    // S1 … after-depth … S2 … before-taa … S5 … after-taa … S6/S7 … S8 … before-tonemap … OUT … S10b … after-tonemap … S12
    expect(p(ids.afterDepth)).toBeGreaterThan(idx("S1-depth-prep"));
    expect(p(ids.afterDepth)).toBeLessThan(idx("S2-gtao"));
    expect(p(ids.beforeTaa)).toBeLessThan(idx("S5-taa"));
    expect(p(ids.afterTaa)).toBeGreaterThan(idx("S5-taa"));
    expect(p(ids.afterTaa)).toBeLessThan(idx("S6-dof"));
    expect(p(ids.beforeTonemap)).toBeGreaterThan(idx("S8-auto-exposure"));
    expect(p(ids.beforeTonemap)).toBeLessThan(idx("OUT-output-pass"));
    expect(p(ids.afterTonemap)).toBeGreaterThan(idx("OUT-output-pass"));
    expect(p(ids.afterTonemap)).toBeLessThan(idx("S12-finalize"));
    // Phase 6 executes customs — nothing lands in `skipped` anymore.
    expect(report.skipped.filter((s) => s.name.startsWith("prd03.test-"))).toEqual([]);
  });

  it("registerPostPass rejects a display pass before tonemap (POSTPROCESS_SPACE_INVALID)", () => {
    expect(() => registerPostPass({ ...passAt("bad", "before-tonemap"), space: "display" }))
      .toThrowError(/POSTPROCESS_SPACE_INVALID:prd03\.test-bad/);
    // A linear-hdr pass after tonemap is rejected too — the anchor pins the space.
    expect(() => registerPostPass({ ...passAt("bad2", "after-tonemap"), space: "linear-hdr" }))
      .toThrowError(/POSTPROCESS_SPACE_INVALID:prd03\.test-bad2/);
  });

  it("registerPostPass rejects non-GPU passes and round-trips release()", () => {
    expect(() => registerPostPass({ ...passAt("cpu", "after-tonemap"), gpuOnly: false as unknown as true }))
      .toThrowError(/POSTPROCESS_PASS_NOT_GPU:prd03\.test-cpu/);
    const release = registerPostPass(passAt("ok", "before-taa"));
    expect(registeredPostPasses().some((p) => p.id === "prd03.test-ok")).toBe(true);
    release();
    expect(registeredPostPasses().some((p) => p.id === "prd03.test-ok")).toBe(false);
  });
});

describe("S11 SMAA routing", () => {
  it("v2NeedsLdrTail is true for smaa and after-tonemap customs, false for plain fxaa", () => {
    expect(v2NeedsLdrTail({ ...BASE, antiAliasing: "fxaa" })).toBe(false);
    expect(v2NeedsLdrTail({ ...BASE, antiAliasing: "smaa" })).toBe(true);
    expect(v2NeedsLdrTail({ ...BASE, customPasses: [passAt("disp", "after-tonemap")] })).toBe(true);
    expect(v2NeedsLdrTail({ ...BASE, customPasses: [passAt("hdr", "before-tonemap")] })).toBe(false);
  });

  it("the r185 port carries all three SMAA stages with the lookup textures wired", () => {
    // invariant: the §8.14 port keeps three's pass structure — colour edges,
    // blending weights (u_area + u_search lookups), neighbourhood blend.
    expect(SMAA_EDGES_GLSL).toContain("SMAAColorEdgeDetectionPS");
    expect(SMAA_WEIGHTS_GLSL).toContain("SMAABlendingWeightCalculationPS");
    expect(SMAA_WEIGHTS_GLSL).toContain("u_area");
    expect(SMAA_WEIGHTS_GLSL).toContain("u_search");
    expect(SMAA_BLEND_GLSL).toContain("SMAANeighborhoodBlendingPS");
    for (const src of [SMAA_EDGES_GLSL, SMAA_WEIGHTS_GLSL, SMAA_BLEND_GLSL]) {
      expect(src).toContain("#version 300 es");
      expect(src).toContain("u_resolution");
    }
  });

  it("the S11 descriptor implements smaa on the plan (post-v2-deferred is gone)", () => {
    const report = planPostGraph({ ...BASE, antiAliasing: "smaa" }, { width: 160, height: 90 });
    expect(report.skipped.some((s) => s.name === "S11-post-aa")).toBe(false);
    expect(report.stages.some((s) => s.name === "S11-post-aa")).toBe(true);
    // And the S8 descriptor reports implemented when autoExposure is on.
    const aeReport = planPostGraph({ ...BASE, autoExposure: {} }, { width: 160, height: 90 });
    expect(aeReport.stages.some((s) => s.name === "S8-auto-exposure")).toBe(true);
    expect(aeReport.skipped.some((s) => s.name === "S8-auto-exposure")).toBe(false);
    // Stage table still ordered S1..S12.
    const order = POST_STAGE_DESCRIPTORS.map((d) => d.id);
    expect(order[order.indexOf("S7-motion-blur") + 1]).toBe("S8-auto-exposure");
  });
});
