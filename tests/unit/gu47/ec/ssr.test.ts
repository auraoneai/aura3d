import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSsrOptions, runV2HdrStages, withDefines } from "../../../../packages/rendering/src/post/v2Stages";
import { SSR_COMPOSITE_GLSL, SSR_ROUGHNESS_CUTOFF, SSR_TRACE_GLSL } from "../../../../packages/rendering/src/post/shaders/ssr.glsl";
import { postStagesRan } from "../../../../packages/rendering/src/renderer/postSkipped";
import type { PostPipelineOptions } from "../../../../packages/rendering/src/contracts/post";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { createRootPostPipeline } from "../../../../packages/engine/src/agent-api/postBridge";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
import { CAMERA, fakeHost, fakeTarget, recordingGl } from "./recordingGl";

/** GU47 E-C WP-3 item 6: S3 screen-space reflections (off unless a scene authors the node). */

const BASE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

describe("resolveSsrOptions", () => {
  it("defaults to intensity 0.9, 18 m, roughness 0, 0.25 m thickness and 24 steps", () => {
    expect(resolveSsrOptions(undefined)).toEqual({ intensity: 0.9, maxDistance: 18, roughness: 0, thickness: 0.25, steps: 24 });
  });

  it("clamps the fields and snaps steps to 16 | 24 | 32", () => {
    const options = resolveSsrOptions({ intensity: 9, maxDistance: 0, roughness: 3, thickness: -1, steps: 40 });
    expect(options).toEqual({ intensity: 2, maxDistance: 0.5, roughness: 1, thickness: 0.01, steps: 32 });
    expect(resolveSsrOptions({ steps: 10 }).steps).toBe(16);
  });

  it("the roughness gate closes at the 0.5 cutoff", () => {
    const gate = (r: number) => {
      const t = Math.min(1, Math.max(0, (r - 0.35) / (SSR_ROUGHNESS_CUTOFF - 0.35)));
      return 1 - t * t * (3 - 2 * t);
    };
    expect(gate(0.2)).toBe(1);
    expect(gate(0.5)).toBe(0);
    expect(SSR_TRACE_GLSL).toContain("1.0 - smoothstep(0.35, 0.5, u_roughness)");
  });
});

describe("S3 in the v2 HDR driver", () => {
  it("is off without pipeline.ssr (no S3 stage, no SSR draws)", () => {
    const rec = recordingGl();
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), { ...BASE, grade: { temperature: 0.1 } } as never, CAMERA);
    expect(postStagesRan().some((stage) => stage.startsWith("S3"))).toBe(false);
    expect(rec.draws.some((d) => d.fragment.includes("u_reflection") || d.fragment.includes("AURA_SSR_STEPS"))).toBe(false);
  });

  it("traces at half res and composites at full res, sampling this frame without TAA history", () => {
    const rec = recordingGl();
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), { ...BASE, ssr: { intensity: 0.6, maxDistance: 12, roughness: 0.1 } } as never, CAMERA);
    expect(postStagesRan()).toEqual(expect.arrayContaining(["S1:depth-prep", "S3:ssr-24"]));
    const trace = rec.draws.find((d) => d.fragment.includes("#define AURA_SSR_STEPS 24"))!;
    expect(trace.uniforms.u_maxDistance).toEqual([12]);
    expect(trace.uniforms.u_roughness).toEqual([0.1]);
    expect(trace.uniforms.u_reproject).toEqual([0]);
    expect(trace.uniforms.u_far).toEqual([100]);
    const composite = rec.draws.find((d) => d.fragment.includes("u_reflection"))!;
    expect(composite.uniforms.u_intensity).toEqual([0.6]);
    expect(rec.draws.indexOf(composite)).toBeGreaterThan(rec.draws.indexOf(trace));
  });

  it("reprojects the TAA history when it is valid", () => {
    const rec = recordingGl();
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const temporal = {
      velocity: fakeTarget(),
      history: fakeTarget(),
      historyOutput: fakeTarget(),
      historyValid: true,
      historyFrames: 4,
      v2: { linZ: fakeTarget("rgba32f"), linZOutput: fakeTarget("rgba32f"), unjittered: identity, previous: identity, jitterClip: [0, 0], frameTime: 1 / 60 }
    } as never;
    const pipeline = {
      ...BASE,
      antiAliasing: "taa",
      taa: { feedbackMin: 0.88, feedbackMax: 0.97, varianceGamma: 1, upscale: false, sharpness: 0.2 },
      ssr: { intensity: 0.9, maxDistance: 18 }
    } as never;
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), pipeline, CAMERA, temporal);
    expect(postStagesRan()).toContain("S3:ssr-24:history");
    const trace = rec.draws.find((d) => d.fragment.includes("#define AURA_SSR_STEPS"))!;
    expect(trace.uniforms.u_reproject).toEqual([1]);
    // prevViewProj (identity here) · inv(view): the camera sits at z = 5, so the inverse view translates +5 in z.
    expect(trace.uniforms.u_viewToPrevClip![14]).toBeCloseTo(5, 5);
  });
});

describe("bridge: pipeline.ssr", () => {
  const derive = (node: unknown) => createRootPostPipeline({ nodes: [node] } as never, undefined, undefined, QUALITY_TIERS.high).options;

  it("emits the S3 bag for an authored node, with roughness/thickness only when authored", () => {
    expect(derive(effects.screenSpaceReflections({ intensity: 0.7 }).toJSON()).ssr).toEqual({ intensity: 0.7, maxDistance: 18 });
    const raw = { ...effects.screenSpaceReflections({}).toJSON(), roughness: 0.3, thickness: 0.5, maxDistance: 10 };
    expect(derive(raw).ssr).toEqual({ intensity: 0.9, maxDistance: 10, roughness: 0.3, thickness: 0.5 });
  });

  it("emits nothing without the node", () => {
    expect(derive(effects.bloom({}).toJSON()).ssr).toBeUndefined();
  });
});

function glslang(): string | null {
  try {
    execFileSync("glslangValidator", ["--version"], { stdio: "ignore" });
    return "glslangValidator";
  } catch {
    return null;
  }
}

describe("S3 GLSL ES 3.00 compile (glslangValidator, when installed)", () => {
  const tool = glslang();
  it.runIf(tool !== null).each([
    ["trace", withDefines(SSR_TRACE_GLSL, { AURA_SSR_STEPS: 24 })],
    ["trace 32", withDefines(SSR_TRACE_GLSL, { AURA_SSR_STEPS: 32 })],
    ["composite", SSR_COMPOSITE_GLSL]
  ])("%s compiles", (_name, source) => {
    const dir = mkdtempSync(join(tmpdir(), "gu47-ec-ssr-"));
    const file = join(dir, "ssr.frag");
    writeFileSync(file, source);
    expect(() => execFileSync(tool!, [file], { stdio: "pipe" })).not.toThrow();
  });
});
