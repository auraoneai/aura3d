import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { executePostGraphWebGL2 } from "../../../../packages/rendering/src/webgl2/LegacyPost";
import { ldrFragmentSource, ldrVariantKey, type LdrProgramVariant } from "../../../../packages/rendering/src/webgl2/LdrPostprocessShader";
import { postV2SeamDeclineReason } from "../../../../packages/rendering/src/renderer/PostprocessExecution";
import { resolveCoreOutputPostRoute } from "../../../../packages/rendering/src/renderer/coreOutputPostRoute";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";
import type { PostPipelineOptions } from "../../../../packages/rendering/src/contracts/post";
import type { LdrPostprocessPassDescriptor, RenderTarget } from "../../../../packages/rendering/src/RenderDevice";
import type { RendererPostProcessOptions } from "../../../../packages/rendering/src";
import type { RendererPostProcessPassPlan } from "../../../../packages/rendering/src/RendererPostprocessPlan";

// The OutputPass HDR route is opt-in (hotfix 4.3.2): these tests exercise it, so they switch it on.
beforeAll(() => { (globalThis as { __A3D_HDR_OUTPUT_PASS__?: boolean; __A3D_LINEAR_VIGNETTE__?: boolean }).__A3D_HDR_OUTPUT_PASS__ = true; (globalThis as { __A3D_LINEAR_VIGNETTE__?: boolean }).__A3D_LINEAR_VIGNETTE__ = true; });
afterAll(() => { delete (globalThis as { __A3D_HDR_OUTPUT_PASS__?: boolean }).__A3D_HDR_OUTPUT_PASS__; delete (globalThis as { __A3D_LINEAR_VIGNETTE__?: boolean }).__A3D_LINEAR_VIGNETTE__; });


const outputPassCalls: Array<{ options: Record<string, unknown>; output: unknown }> = [];
vi.mock("../../../../packages/rendering/src/output/OutputPass", () => ({
  OutputPass: class {},
  outputPassForDevice: () => ({
    execute: (_input: unknown, _coverage: unknown, options: Record<string, unknown>, output: unknown) => { outputPassCalls.push({ options, output }); }
  })
}));

/**
 * PostGraph v2 migration of the legacy post chain: every effect composes in
 * linear light and the frame is tone-mapped and encoded exactly once, in the
 * OUT stage. The vignette used to run on display-referred bytes in the LDR
 * tail, which is what made frames with `effects.vignette()` 25 to 40% darker.
 */

const VIGNETTE = { intensity: 0.16, smoothness: 0.65, roundness: 1, color: { r: 0, g: 0, b: 0 } };
const PIPELINE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

let seq = 0;
function fakeTarget(format: "rgba8" | "rgba16f" = "rgba16f"): RenderTarget {
  return {
    id: `t${++seq}`, label: `t${seq}`, width: 16, height: 16, sampleCount: 1, needsResolve: false,
    framebuffer: {}, colorHandle: {}, depthTextureHandle: null, colorTexture: { format }, dispose: () => undefined
  } as unknown as RenderTarget;
}

interface Trace {
  readonly events: string[];
  readonly presented: LdrPostprocessPassDescriptor[][];
  readonly tailPipelines: PostPipelineOptions[];
  readonly outputPass: Array<{ options: Record<string, unknown>; output: unknown }>;
  readonly blooms: number;
}

function run(pipeline: PostPipelineOptions, passes: readonly LdrPostprocessPassDescriptor[]): Trace {
  outputPassCalls.length = 0;
  let blooms = 0;
  const trace: Trace = { events: [], presented: [], tailPipelines: [], outputPass: outputPassCalls, get blooms() { return blooms; } };
  const host = {
    gl: {} as never,
    device: { setRenderTarget: (target: unknown) => { trace.events.push(target === null ? "bind-canvas" : "bind-target"); } },
    stateCache: { invalidate: () => undefined },
    resolveMultisampleTarget: () => undefined,
    post: {
      presentLdrPostprocess: (_s: RenderTarget, options: { passes: readonly LdrPostprocessPassDescriptor[] }) => {
        trace.events.push("present");
        trace.presented.push([...options.passes]);
      },
      presentHdrBloom: () => { blooms += 1; trace.events.push("hdr-bloom"); }
    },
    activeRenderTarget: null
  } as unknown as WebGL2DeviceHost;
  const source = fakeTarget("rgba16f");
  executePostGraphWebGL2(host, source, {
    pipeline,
    passes,
    v2: {
      runV2HdrStages: () => { trace.events.push("hdr-stages"); return { target: source, aoPending: false, skipped: [] }; },
      v2NeedsLdrTail: (p: PostPipelineOptions) => Boolean(p.vignette || p.filmGrain || p.lut || p.antiAliasing === "smaa"),
      acquireV2Target: (_h: unknown, key: { format: string }) => { trace.events.push(key.format === "rgba8" ? "acquire-tail" : "acquire-hdr"); return fakeTarget(key.format as "rgba8" | "rgba16f"); },
      releaseV2Target: () => undefined,
      runV2LdrTail: (_h: unknown, _t: unknown, p: PostPipelineOptions) => { trace.events.push("ldr-tail"); trace.tailPipelines.push(p); }
    } as never
  });
  return trace;
}

const toneCount = (passes: readonly LdrPostprocessPassDescriptor[]) => passes.filter((pass) => pass.name === "tone-mapping").length;
const BLOOM = { name: "bloom", options: { intensity: 0.16 } } as LdrPostprocessPassDescriptor;
const TONE = { name: "tone-mapping", options: { operator: "aces" } } as LdrPostprocessPassDescriptor;

describe("PostGraph v2 migration: stage ordering", () => {
  it("runs HDR stages, then the HDR bloom into its own target, then the OutputPass, with no tail for a vignette-only chain", () => {
    const trace = run({ ...PIPELINE, vignette: VIGNETTE }, [BLOOM, TONE]);
    expect(trace.events).toEqual(["hdr-stages", "acquire-hdr", "hdr-bloom", "bind-canvas", "bind-canvas"]);
    expect(trace.presented).toHaveLength(0);
    expect(trace.outputPass).toHaveLength(1);
    expect(trace.outputPass[0]!.output).toBe("canvas");
  });

  it("keeps the LDR tail (S10b/S11/S12) after the OutputPass when grain or LUT still need display-referred bytes", () => {
    const trace = run({ ...PIPELINE, vignette: VIGNETTE, filmGrain: { intensity: 0.1 } }, [BLOOM, TONE]);
    expect(trace.events).toEqual(["hdr-stages", "acquire-tail", "acquire-hdr", "hdr-bloom", "bind-canvas", "ldr-tail", "bind-canvas"]);
    expect(trace.outputPass).toHaveLength(1);
    expect((trace.outputPass[0]!.output as { colorTexture: { format: string } }).colorTexture.format).toBe("rgba8");
  });

  it("a chain with a legacy display-space descriptor keeps the fused present: bloom before the tone map", () => {
    const trace = run(PIPELINE, [BLOOM, TONE, { name: "color-grade", options: {} } as LdrPostprocessPassDescriptor]);
    expect(trace.events).toEqual(["hdr-stages", "present"]);
    expect(trace.presented[0]!.map((pass) => pass.name)).toEqual(["bloom", "tone-mapping", "color-grade"]);
    expect(trace.outputPass).toHaveLength(0);
  });

  it("a non-default white point keeps the fused present", () => {
    const trace = run(PIPELINE, [{ name: "tone-mapping", options: { operator: "aces", whitePoint: 2 } } as LdrPostprocessPassDescriptor]);
    expect(trace.outputPass).toHaveLength(0);
    expect(trace.presented).toHaveLength(1);
  });
});

describe("PostGraph v2 migration: tone map and encode exactly once", () => {
  const GRADE = { name: "color-grade", options: {} } as LdrPostprocessPassDescriptor;
  const FXAA = { name: "fxaa", options: {} } as LdrPostprocessPassDescriptor;
  const configs: ReadonlyArray<[string, PostPipelineOptions, readonly LdrPostprocessPassDescriptor[]]> = [
    ["tone only", PIPELINE, [TONE]],
    ["bloom + tone", PIPELINE, [BLOOM, TONE]],
    ["vignette + bloom + tone", { ...PIPELINE, vignette: VIGNETTE }, [BLOOM, TONE]],
    ["grain tail + vignette", { ...PIPELINE, vignette: VIGNETTE, filmGrain: { intensity: 0.2 } }, [TONE]],
    ["toneMapping none injects the linear OUT stage", { ...PIPELINE, toneMapping: "none", vignette: VIGNETTE }, [BLOOM]],
    ["grade + fxaa riding along", PIPELINE, [BLOOM, TONE, GRADE, FXAA]],
    ["grade only", PIPELINE, [TONE, GRADE]]
  ];
  const encodes = (trace: Trace) => trace.outputPass.length + trace.presented.reduce((sum, passes) => sum + toneCount(passes), 0);
  for (const [name, pipeline, passes] of configs) {
    it(`${name}: exactly one tone map and encode (OutputPass or one fused tone-mapping descriptor)`, () => {
      const trace = run(pipeline, passes);
      expect(encodes(trace)).toBe(1);
    });
  }

  it("holds for every operator, vignette, tail and descriptor combination", () => {
    const operators = ["none", "linear", "reinhard", "aces", "agx", "neutral", "cineon"] as const;
    let combos = 0;
    for (const toneMapping of operators) {
      for (const vignette of [undefined, VIGNETTE]) {
        for (const tail of [undefined, { intensity: 0.1 }]) {
          for (const passes of [[TONE], [BLOOM, TONE], [BLOOM], [TONE, GRADE], [BLOOM, TONE, GRADE, FXAA]]) {
            const hasTone = toneMapping !== "none" || passes.some((pass) => pass.name === "tone-mapping");
            if (!hasTone) continue;
            const pipeline = { ...PIPELINE, toneMapping, ...(vignette ? { vignette } : {}), ...(tail ? { filmGrain: tail } : {}) } as PostPipelineOptions;
            const trace = run(pipeline, passes);
            expect(encodes(trace), `${toneMapping}/${vignette ? "vig" : "-"}/${tail ? "tail" : "-"}/${passes.map((p) => p.name).join("+")}`).toBe(1);
            combos += 1;
          }
        }
      }
    }
    expect(combos).toBeGreaterThan(100);
  });

  it("the OutputPass gets one operator, the pipeline exposure, no dither, and full coverage", () => {
    const trace = run({ ...PIPELINE, exposure: 1.4, toneMapping: "agx" }, [BLOOM, TONE]);
    expect(trace.outputPass[0]!.options).toMatchObject({ toneMapping: "agx", exposure: 1.4, dithering: false, backgroundCoverage: false, fullCoverage: true });
  });
});

describe("PostGraph v2 migration: vignette composes in linear light before the tone map", () => {
  it("the OutputPass carries the vignette and the LDR tail does not", () => {
    const trace = run({ ...PIPELINE, vignette: VIGNETTE, filmGrain: { intensity: 0.2 } }, [BLOOM, TONE]);
    expect(trace.outputPass[0]!.options.vignette).toMatchObject({ intensity: 0.16, smoothness: 0.65, roundness: 1 });
    expect(trace.tailPipelines).toHaveLength(1);
    expect(trace.tailPipelines[0]!.vignette).toBeUndefined();
    expect(trace.tailPipelines[0]!.filmGrain).toEqual({ intensity: 0.2 });
  });

  it("the fused fallback carries the vignette on its OUT descriptor", () => {
    const trace = run({ ...PIPELINE, vignette: VIGNETTE }, [TONE, { name: "color-grade", options: {} } as LdrPostprocessPassDescriptor]);
    const tone = trace.presented[0]!.find((pass) => pass.name === "tone-mapping")!;
    expect((tone.options as { vignette?: unknown }).vignette).toEqual(VIGNETTE);
  });

  it("a chain without a vignette gives the OutputPass no vignette", () => {
    const trace = run(PIPELINE, [TONE]);
    expect("vignette" in trace.outputPass[0]!.options).toBe(false);
  });

  it("the fragment applies the vignette to the decoded linear colour before the operator", () => {
    const variant: LdrProgramVariant = { toneMapping: true, operator: 2, inputSrgb: false, outputSrgb: true, grade: false, sharpening: false, fxaa: false, vignette: true };
    const source = ldrFragmentSource(variant);
    expect(source).toContain("#define LDR_VIGNETTE 1");
    const vignetteAt = source.indexOf("decoded = vignetteLinear(decoded, uv);");
    const operatorAt = source.indexOf("vec3 mapped = acesFilmic(");
    expect(vignetteAt).toBeGreaterThan(0);
    expect(operatorAt).toBeGreaterThan(vignetteAt);
  });

  it("a variant without the vignette compiles it out and keeps the previous cache key", () => {
    const base: LdrProgramVariant = { toneMapping: true, operator: 2, inputSrgb: false, outputSrgb: true, grade: false, sharpening: false, fxaa: false };
    expect(ldrFragmentSource(base)).toContain("#define LDR_VIGNETTE 0");
    expect(ldrVariantKey(base)).toBe("1201000");
    expect(ldrVariantKey({ ...base, vignette: true })).toBe(`${ldrVariantKey(base)}v`);
    expect(ldrVariantKey({ ...base, toneMapping: false, vignette: true })).toBe(ldrVariantKey({ ...base, toneMapping: false }));
  });
});

describe("PostGraph v2 migration: routing", () => {
  const v2Chain = { v2: true, pipeline: {}, toneMapping: true } as unknown as RendererPostProcessOptions;
  const bloomPlan = [{ name: "bloom", options: {} }, { name: "tone-mapping", options: {} }] as unknown as readonly RendererPostProcessPassPlan[];

  it("the v2 seam takes a WebGL2 v2 chain, so no legacy-route record exists", () => {
    expect(postV2SeamDeclineReason("webgl2", v2Chain, bloomPlan, true)).toBeNull();
    const route = resolveCoreOutputPostRoute(true, v2Chain, null);
    expect(route).toEqual({ qrOutput: false, legacyGraph: true, skipped: null });
  });

  it("names every reason the explicit legacy chain still applies", () => {
    expect(postV2SeamDeclineReason("webgl2", { toneMapping: true } as RendererPostProcessOptions, [], true)).toBe("no-v2-plan");
    expect(postV2SeamDeclineReason("webgpu", v2Chain, [], true)).toBe("backend");
    expect(postV2SeamDeclineReason("webgl2", { v2: true } as RendererPostProcessOptions, [], true)).toBe("no-pipeline");
    expect(postV2SeamDeclineReason("webgl2", { ...v2Chain, execution: "cpu-deterministic" } as RendererPostProcessOptions, [], true)).toBe("cpu-deterministic");
    expect(postV2SeamDeclineReason("webgl2", v2Chain, [{ name: "film-grain", options: {} }] as unknown as readonly RendererPostProcessPassPlan[], true)).toBe("film-grain");
  });

  it("no console warning text names the removed label", () => {
    const route = resolveCoreOutputPostRoute(true, { bloom: {} }, "no-v2-plan");
    expect(route.skipped?.code).toBe("post-legacy-route");
    expect(route.skipped?.message).not.toContain("UNMIGRATED");
    expect(route.skipped?.message).toContain("no-v2-plan");
  });
});
