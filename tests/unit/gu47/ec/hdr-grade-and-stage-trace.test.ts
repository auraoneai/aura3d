import { describe, expect, it } from "vitest";
import { runV2HdrStages, runV2LdrTail } from "../../../../packages/rendering/src/post/v2Stages";
import {
  applyHdrGrade,
  HDR_GRADE_GLSL,
  resolveHdrGradeUniforms,
  resolveWhiteBalance
} from "../../../../packages/rendering/src/post/shaders/hdrGrade.glsl";
import { acesFilmicToneMapping } from "../../../../packages/rendering/src/post/ToneOperators";
import { postStagesRan } from "../../../../packages/rendering/src/renderer/postSkipped";
import type { PostPipelineOptions } from "../../../../packages/rendering/src/contracts/post";
import { createRootPostPipeline } from "../../../../packages/engine/src/agent-api/postBridge";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { CAMERA, fakeHost, fakeTarget, recordingGl } from "./recordingGl";

/** GU47 E-C WP-3 items 1 (HDR grade writer) and 4 (stage trace). */

const BASE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

const srgb = (x: number): number => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const display = (rgb: readonly [number, number, number]): number[] => acesFilmicToneMapping([rgb[0], rgb[1], rgb[2]], 1).map(srgb);

function pipelineFor(node: ReturnType<typeof effects.colorGrade>): PostPipelineOptions {
  return createRootPostPipeline({ nodes: [node.toJSON()] } as never, undefined, undefined, QUALITY_TIERS.high).options;
}

describe("S10 linear grade: white balance", () => {
  it("is the identity at temperature 0 / tint 0", () => {
    expect(resolveWhiteBalance(0, 0)).toEqual([1, 1, 1]);
  });

  it("warms with +temperature and keeps unit luminance", () => {
    const wb = resolveWhiteBalance(0.2, 0);
    expect(wb[0]).toBeGreaterThan(1);
    expect(wb[2]).toBeLessThan(1);
    expect(0.2126 * wb[0] + 0.7152 * wb[1] + 0.0722 * wb[2]).toBeCloseTo(1, 6);
    const cool = resolveWhiteBalance(-0.2, 0);
    expect(cool[0]).toBeLessThan(1);
    expect(cool[2]).toBeGreaterThan(1);
  });

  it("temperature +0.2 moves display mean R/B by >= 0.08 on a mid-grey frame (receipt effects-white-balance expectation)", () => {
    const u = resolveHdrGradeUniforms({ temperature: 0.2 })!;
    const grey: [number, number, number] = [0.18, 0.18, 0.18];
    const before = display(grey);
    const after = display(applyHdrGrade(grey, u) as [number, number, number]);
    expect(after[0]! / after[2]! - before[0]! / before[2]!).toBeGreaterThanOrEqual(0.08);
  });

  it("+tint pushes magenta (G down relative to R and B)", () => {
    const wb = resolveWhiteBalance(0, 0.3);
    expect(wb[1]).toBeLessThan(wb[0]);
    expect(wb[1]).toBeLessThan(wb[2]);
  });
});

describe("S10 linear grade: uniform resolution", () => {
  it("an identity bag resolves to null (no draw)", () => {
    expect(resolveHdrGradeUniforms(undefined)).toBeNull();
    expect(resolveHdrGradeUniforms({ temperature: 0, tint: 0, lift: { r: 0, g: 0, b: 0 }, gamma: { r: 1, g: 1, b: 1 } })).toBeNull();
    expect(resolveHdrGradeUniforms({ temperature: 0.3, enabled: false })).toBeNull();
  });

  it("a contrast/saturation-only colorGrade (what 25 live games author) adds no S10 draw", () => {
    const pipeline = pipelineFor(effects.colorGrade({ contrast: 1.08, saturation: 1.12, exposure: 1.02 }));
    expect(pipeline.grade).toBeTruthy();
    expect(resolveHdrGradeUniforms(pipeline.grade as never)).toBeNull();
  });

  it("the factory forwards temperature/tint/lift/gamma/gain/shadows/midtones/highlights and the bridge clamps temperature", () => {
    const pipeline = pipelineFor(effects.colorGrade({
      temperature: 3, tint: -0.1, lift: [0.01, 0, -0.01], gamma: 1.1, gain: { r: 1.05, g: 1, b: 0.95 },
      shadows: 0.9, midtones: [1, 1.02, 1], highlights: 1.1
    }));
    const grade = pipeline.grade as Record<string, unknown>;
    expect(grade.temperature).toBe(1);
    expect(grade.tint).toBe(-0.1);
    expect(grade.lift).toEqual({ r: 0.01, g: 0, b: -0.01 });
    expect(grade.gamma).toEqual({ r: 1.1, g: 1.1, b: 1.1 });
    expect(grade.shadows).toEqual({ r: 0.9, g: 0.9, b: 0.9 });
    expect(grade.highlights).toEqual({ r: 1.1, g: 1.1, b: 1.1 });
    const u = resolveHdrGradeUniforms(grade as never)!;
    expect(u.gain).toEqual([1.05, 1, 0.95]);
    expect(u.midtones).toEqual([1, 1.02, 1]);
  });

  it("the shader declares every uniform the writer sets", () => {
    for (const name of ["u_whiteBalance", "u_lift", "u_gamma", "u_gain", "u_shadows", "u_midtones", "u_highlights", "u_hasEv", "u_hasGrade"]) {
      expect(HDR_GRADE_GLSL).toContain(name);
    }
  });
});

describe("S10 linear grade: one fullscreen draw on the v2 chain (mock device)", () => {
  it("grade only: exactly one HDR draw, the grade program, all seven uniforms written", () => {
    const rec = recordingGl();
    const grade = { temperature: 0.2, tint: 0, lift: { r: 0.01, g: 0.01, b: 0.01 } };
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), { ...BASE, grade } as never, CAMERA);
    expect(rec.draws).toHaveLength(1);
    const d = rec.draws[0]!;
    expect(d.fragment).toBe(HDR_GRADE_GLSL);
    expect(d.uniforms.u_hasGrade).toEqual([1]);
    expect(d.uniforms.u_hasEv).toEqual([0]);
    const u = resolveHdrGradeUniforms(grade)!;
    expect(d.uniforms.u_whiteBalance).toEqual([...u.whiteBalance]);
    expect(d.uniforms.u_lift).toEqual([0.01, 0.01, 0.01]);
    for (const name of ["u_gamma", "u_gain", "u_shadows", "u_midtones", "u_highlights"]) expect(d.uniforms[name]).toHaveLength(3);
    expect(postStagesRan()).toContain("S10:hdr-grade");
  });

  it("identity grade: no HDR draw at all (byte-identical early return)", () => {
    const rec = recordingGl();
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), { ...BASE, grade: { temperature: 0, contrast: 1.1 } } as never, CAMERA);
    expect(rec.draws).toHaveLength(0);
  });

  it("auto-exposure + grade: the grade folds into the S8 multiply (the apply is one draw)", () => {
    const rec = recordingGl();
    const autoExposure = { minEv: -4, maxEv: 4, speedUp: 3, speedDown: 1, compensationEv: 0, meteringMask: "average" };
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), { ...BASE, autoExposure, grade: { temperature: -0.3 } } as never, CAMERA);
    const applies = rec.draws.filter((d) => d.fragment === HDR_GRADE_GLSL);
    expect(applies).toHaveLength(1);
    expect(applies[0]!.uniforms.u_hasEv).toEqual([1]);
    expect(rec.draws.some((d) => /exp2\(ev\)/.test(d.fragment) && d.fragment !== HDR_GRADE_GLSL)).toBe(false);
    expect(postStagesRan()).toEqual(expect.arrayContaining(["S8:auto-exposure", "S10:hdr-grade:folded-s8"]));
  });

  it("auto-exposure alone keeps the original exposure-mul program", () => {
    const rec = recordingGl();
    const autoExposure = { minEv: -4, maxEv: 4, speedUp: 3, speedDown: 1, compensationEv: 0, meteringMask: "average" };
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), { ...BASE, autoExposure } as never, CAMERA);
    expect(rec.draws.some((d) => d.fragment === HDR_GRADE_GLSL)).toBe(false);
    expect(rec.draws.at(-1)!.fragment).toContain("c.rgb * exp2(ev)");
  });
});

describe("stage trace: diagnostics().post.stagesRan names every stage that ran", () => {
  it("records S4, CA, S6, S9 and S10 from the HDR driver", () => {
    const rec = recordingGl();
    const pipeline = {
      ...BASE,
      godRays: { samples: 48, decay: 0.94, weight: 0.7, intensity: 0.7, color: { r: 1, g: 0.9, b: 0.8 } },
      chromaticAberration: { intensity: 0.002 },
      dof: { focusDistance: 4, fStop: 2.8, focalLengthMm: 50, sensorHeightMm: 24, maxBlurPx: 12, halfRes: true },
      bloom: { threshold: 1, knee: 0.25, intensity: 0.3, scatter: 0.7, tint: [1, 1, 1], clampLuminance: 64, mips: 6 },
      grade: { temperature: 0.1 }
    } as never;
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), pipeline, CAMERA, undefined, undefined, { deferBeforeTonemap: true });
    const ran = postStagesRan();
    expect(ran).toEqual(expect.arrayContaining(["S4:god-rays-48", "CA:chromatic-aberration", "S6:dof-rings3", "S9:bloom-6mips", "S10:hdr-grade"]));
  });

  it("records S1 depth prep and S7 motion blur when temporal surfaces exist", () => {
    const rec = recordingGl();
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const temporal = {
      velocity: fakeTarget(),
      history: fakeTarget(),
      historyOutput: fakeTarget(),
      historyValid: true,
      historyFrames: 3,
      v2: { linZ: fakeTarget("rgba32f"), linZOutput: fakeTarget("rgba32f"), unjittered: identity, previous: identity, jitterClip: [0, 0], frameTime: 1 / 60 }
    } as never;
    const pipeline = { ...BASE, motionBlur: { shutter: 0.5, maxBlurPx: 32, samples: 12, tileSize: 16 } } as never;
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), pipeline, CAMERA, temporal);
    expect(postStagesRan()).toEqual(expect.arrayContaining(["S1:depth-prep", "S7:motion-blur-12x16"]));
  });

  it("records S11 for SMAA-less FXAA paths (fused and standalone)", () => {
    const rec = recordingGl();
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), BASE, CAMERA);
    runV2LdrTail(fakeHost(rec.gl), fakeTarget("rgba8"), { ...BASE, antiAliasing: "fxaa", vignette: { intensity: 0.2 } } as never, undefined);
    expect(postStagesRan()).toContain("S11:fxaa:fused");
  });

  it("does not claim S9 when the executor has no HDR bloom pass", () => {
    const rec = recordingGl();
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), { ...BASE, bloom: { mips: 6 } } as never, CAMERA);
    expect(postStagesRan().some((s) => s.startsWith("S9"))).toBe(false);
  });

  it("records S10b and S12 grain from the LDR tail (fused and unfused)", () => {
    const tailPipeline = { ...BASE, vignette: { intensity: 0.3 }, filmGrain: { intensity: 0.04, size: 1, luminanceResponse: 1 } } as never;
    const rec = recordingGl();
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), BASE, CAMERA); // begins the frame's trace
    runV2LdrTail(fakeHost(rec.gl), fakeTarget("rgba8"), tailPipeline, undefined);
    expect(postStagesRan()).toEqual(expect.arrayContaining(["S10b:display-grade:vignette", "S12:film-grain"]));
    const rec2 = recordingGl();
    runV2HdrStages(fakeHost(rec2.gl), fakeTarget(), BASE, CAMERA);
    runV2LdrTail(fakeHost(rec2.gl), fakeTarget("rgba8"), { ...(tailPipeline as object), antiAliasing: "fxaa" } as never, undefined);
    expect(postStagesRan()).toEqual(expect.arrayContaining(["S10b:display-grade:vignette:fused-fxaa", "S12:film-grain:fused-fxaa"]));
  });
});
