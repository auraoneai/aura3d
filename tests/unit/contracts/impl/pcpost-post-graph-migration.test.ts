import { describe, expect, it } from "vitest";
import { executePostGraphWebGL2 } from "../../../../packages/rendering/src/webgl2/LegacyPost";
import { ldrFragmentSource, ldrVariantKey, type LdrProgramVariant } from "../../../../packages/rendering/src/webgl2/LdrPostprocessShader";
import { postV2SeamDeclineReason } from "../../../../packages/rendering/src/renderer/PostprocessExecution";
import { resolveCoreOutputPostRoute } from "../../../../packages/rendering/src/renderer/coreOutputPostRoute";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";
import type { PostPipelineOptions } from "../../../../packages/rendering/src/contracts/post";
import type { LdrPostprocessPassDescriptor, RenderTarget } from "../../../../packages/rendering/src/RenderDevice";
import type { RendererPostProcessOptions } from "../../../../packages/rendering/src";
import type { RendererPostProcessPassPlan } from "../../../../packages/rendering/src/RendererPostprocessPlan";

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
}

function run(pipeline: PostPipelineOptions, passes: readonly LdrPostprocessPassDescriptor[]): Trace {
  const trace: Trace = { events: [], presented: [], tailPipelines: [] };
  const host = {
    gl: {} as never,
    device: {},
    stateCache: { invalidate: () => undefined },
    resolveMultisampleTarget: () => undefined,
    post: {
      presentLdrPostprocess: (_s: RenderTarget, options: { passes: readonly LdrPostprocessPassDescriptor[] }) => {
        trace.events.push("present");
        trace.presented.push([...options.passes]);
      }
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
      acquireV2Target: () => { trace.events.push("acquire-tail"); return fakeTarget("rgba8"); },
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
  it("runs HDR stages, then one fused present (bloom before the tone map), then no tail for a vignette-only chain", () => {
    const trace = run({ ...PIPELINE, vignette: VIGNETTE }, [BLOOM, TONE]);
    expect(trace.events).toEqual(["hdr-stages", "present"]);
    expect(trace.presented[0]!.map((pass) => pass.name)).toEqual(["bloom", "tone-mapping"]);
  });

  it("keeps the LDR tail (S10b/S11/S12) after the present when grain or LUT still need display-referred bytes", () => {
    const trace = run({ ...PIPELINE, vignette: VIGNETTE, filmGrain: { intensity: 0.1 } }, [BLOOM, TONE]);
    expect(trace.events).toEqual(["hdr-stages", "acquire-tail", "present", "ldr-tail"]);
  });
});

describe("PostGraph v2 migration: tone map and encode exactly once", () => {
  const configs: ReadonlyArray<[string, PostPipelineOptions, readonly LdrPostprocessPassDescriptor[]]> = [
    ["tone only", PIPELINE, [TONE]],
    ["bloom + tone", PIPELINE, [BLOOM, TONE]],
    ["vignette + bloom + tone", { ...PIPELINE, vignette: VIGNETTE }, [BLOOM, TONE]],
    ["grain tail + vignette", { ...PIPELINE, vignette: VIGNETTE, filmGrain: { intensity: 0.2 } }, [TONE]],
    ["toneMapping none injects the linear OUT stage", { ...PIPELINE, toneMapping: "none", vignette: VIGNETTE }, [BLOOM]],
    ["grade + fxaa riding along", PIPELINE, [BLOOM, TONE, { name: "color-grade", options: {} } as LdrPostprocessPassDescriptor, { name: "fxaa", options: {} } as LdrPostprocessPassDescriptor]]
  ];
  for (const [name, pipeline, passes] of configs) {
    it(`${name}: exactly one tone-mapping descriptor reaches the present`, () => {
      const trace = run(pipeline, passes);
      expect(trace.presented).toHaveLength(1);
      expect(toneCount(trace.presented[0]!)).toBe(1);
    });
  }
});

describe("PostGraph v2 migration: vignette composes in linear light before the tone map", () => {
  it("the OUT descriptor carries the vignette and the LDR tail does not", () => {
    const trace = run({ ...PIPELINE, vignette: VIGNETTE, filmGrain: { intensity: 0.2 } }, [BLOOM, TONE]);
    const tone = trace.presented[0]!.find((pass) => pass.name === "tone-mapping")!;
    expect((tone.options as { vignette?: unknown }).vignette).toEqual(VIGNETTE);
    expect(trace.tailPipelines).toHaveLength(1);
    expect(trace.tailPipelines[0]!.vignette).toBeUndefined();
    expect(trace.tailPipelines[0]!.filmGrain).toEqual({ intensity: 0.2 });
  });

  it("a chain without a vignette leaves the OUT descriptor untouched", () => {
    const trace = run(PIPELINE, [TONE]);
    const tone = trace.presented[0]!.find((pass) => pass.name === "tone-mapping")!;
    expect("vignette" in (tone.options as object)).toBe(false);
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
