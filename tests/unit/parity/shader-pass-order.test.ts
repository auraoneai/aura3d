import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as v2Entry from "../../../packages/rendering/src/post/v2Entry";
import { mergedCustomPasses, runV2HdrStages, runV2LdrTail } from "../../../packages/rendering/src/post/v2Stages";
import { executePostGraphWebGL2 } from "../../../packages/rendering/src/webgl2/LegacyPost";
import { postSkippedReasons, resetPostSkipped } from "../../../packages/rendering/src/renderer/postSkipped";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { effects } from "../../../packages/engine/src/agent-api/nodes/effects.composite.js";
import { Prd03PostSurface } from "../../../packages/engine/src/agent-api/postBridge";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraCustomPostPass } from "../../../packages/engine/src/contracts/post.js";
import type { PostPipelineOptions } from "../../../packages/rendering/src/contracts/post";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import type { RenderTarget } from "../../../packages/rendering/src/RenderDevice";

// The OutputPass HDR route is opt-in (hotfix 4.3.2): these tests exercise it, so they switch it on.
beforeAll(() => { (globalThis as { __A3D_HDR_OUTPUT_PASS__?: boolean }).__A3D_HDR_OUTPUT_PASS__ = true; });
afterAll(() => { delete (globalThis as { __A3D_HDR_OUTPUT_PASS__?: boolean }).__A3D_HDR_OUTPUT_PASS__; });


const outputPassState: { trace: string[] | null; failNext: boolean } = { trace: null, failNext: false };
vi.mock("../../../packages/rendering/src/output/OutputPass", () => ({
  OutputPass: class {},
  outputPassForDevice: () => ({
    execute: () => {
      outputPassState.trace?.push("tonemap");
      if (outputPassState.failNext) { outputPassState.failNext = false; throw new Error("boom"); }
    }
  })
}));

const PIPELINE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

const POST_FLAGS = { on: (name: string) => name === "A3D_QR_POST", any: () => false } as never;
const EMPTY_FLAGS = { on: () => false, any: () => false } as never;

/* Tracing-GL harness identical to prd03-s18c-custom-passes.test.ts: each pass
 * declares a marker uniform `u_ord_<token>`; getUniformLocation records the
 * execution order. */
function tracingGl(trace: string[]): WebGL2RenderingContext {
  const fns: Record<string, (...args: never[]) => unknown> = {
    createVertexArray: () => ({}) as never,
    createTexture: () => ({}) as never,
    createFramebuffer: () => ({}) as never,
    createBuffer: () => ({}) as never,
    createShader: () => ({}) as never,
    createProgram: () => ({}) as never,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getProgramInfoLog: () => "",
    checkFramebufferStatus: () => 0x8cd5,
    getUniformLocation: ((_prog: unknown, name: string) => {
      if (name.startsWith("u_ord_")) trace.push(name.slice("u_ord_".length));
      return {};
    }) as never
  };
  return new Proxy(fns as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      if (prop === "FRAMEBUFFER_COMPLETE") return 0x8cd5;
      if (typeof prop === "string" && /^[A-Z][A-Z0-9_]*$/.test(prop)) return prop.length * 7 + 3;
      return (..._args: unknown[]) => undefined;
    },
    has: () => true
  }) as unknown as WebGL2RenderingContext;
}

let seq = 0;
function fakeTarget(format: "rgba8" | "rgba16f" = "rgba16f", depth = false): RenderTarget {
  return {
    id: `ord-${++seq}`,
    label: `ord-${seq}`,
    width: 16,
    height: 16,
    sampleCount: 1,
    needsResolve: false,
    framebuffer: {},
    colorHandle: {},
    depthTextureHandle: depth ? {} : null,
    colorTexture: { format },
    dispose: () => undefined
  } as unknown as RenderTarget;
}

function fakeHost(trace: string[]): WebGL2DeviceHost {
  return {
    gl: tracingGl(trace),
    device: { createRenderTarget: () => fakeTarget() },
    stateCache: { invalidate: () => undefined },
    // SC-01/XR: the default output binds through the lifecycle (external framebuffer + persistent viewport).
    lifecycle: { bindOutput: () => undefined },
    resolveMultisampleTarget: () => undefined,
    activeRenderTarget: null
  } as unknown as WebGL2DeviceHost;
}

const releases: Array<() => void> = [];

afterEach(() => {
  while (releases.length) releases.pop()!();
  setRendererQrFlags(EMPTY_FLAGS);
  resetPostSkipped();
});

const surface = () => new Prd03PostSurface(resolveQrFlags({ options: ["post"] }));

const pass = (name: string, options: Omit<Parameters<typeof effects.shaderPass>[0], "name" | "glsl"> = {}): AuraCustomPostPass => {
  const marker = `u_ord_${name.replace(/-/g, "_")}`;
  return effects.shaderPass({
    name,
    glsl: `uniform float ${marker};\nvoid main() { outColor = texture(u_color, v_uv) * ${marker}; }`,
    ...options,
    // runCustomPass only looks up *declared* uniforms — the marker must be in the map.
    uniforms: { [marker]: 1, ...options.uniforms }
  });
};

describe("effects.shaderPass — SH-03 factory", () => {
  it("builds a custom post pass with name, fragment sources, order, uniforms", () => {
    const result = effects.shaderPass({
      name: "tint-shift",
      glsl: "void main() { outColor = texture(u_color, v_uv); }",
      order: "after-bloom",
      uniforms: { strength: 0.5 },
      enabled: true
    });
    expect(result.name).toBe("tint-shift");
    expect(result.fragment.glsl).toContain("outColor");
    expect(result.order).toBe("after-bloom");
    expect(result.uniforms).toEqual({ strength: 0.5 });
    expect(result.enabled).toBe(true);
    expect(result.insertAt).toBe("before-tonemap"); // after-bloom defaults to the before-tonemap anchor
  });

  it("validates required GLSL (wgsl-only / empty / non-object rejected)", () => {
    expect(() => effects.shaderPass(null as never)).toThrowError(/invalid-material-spec|options/);
    expect(() => effects.shaderPass({} as never)).toThrowError(/glsl/);
    expect(() => effects.shaderPass({ wgsl: "@fragment fn f() {}" } as never)).toThrowError(/glsl/i);
    expect(() => effects.shaderPass({ glsl: "  " } as never)).toThrowError(/glsl/i);
  });

  it("validates order slots, numeric order, inputs, and uniform values", () => {
    expect(() => effects.shaderPass({ glsl: "void main(){}", order: "bogus" as never })).toThrowError(/order/i);
    expect(() => effects.shaderPass({ glsl: "void main(){}", order: Number.NaN } as never)).toThrowError(/order|finite/i);
    expect(() => effects.shaderPass({ glsl: "void main(){}", inputs: ["albedo"] as never })).toThrowError(/input/i);
    expect(() => effects.shaderPass({ glsl: "void main(){}", uniforms: { u: "x" } as never })).toThrowError(/uniform/i);
    expect(() => effects.shaderPass({ glsl: "void main(){}", uniforms: { u: [1, 2, 3, 4, 5] } as never })).toThrowError(/uniform/i);
    const numeric = effects.shaderPass({ glsl: "void main(){}", order: 15 });
    expect(numeric.order).toBe(15);
  });
});

describe("post order slots — named + numeric ordering (L1-05)", () => {
  it("named order slots feed a numeric ordering key on the descriptor", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    releases.push(s.addPostPass(pass("slot-a", { order: "before-bloom" })));
    releases.push(s.addPostPass(pass("slot-b", { order: "after-bloom" })));
    releases.push(s.addPostPass(pass("slot-c", { order: "before-tonemap" })));
    releases.push(s.addPostPass(pass("slot-d", { order: "after-tonemap" })));
    const byId = new Map(mergedCustomPasses(PIPELINE).map((p) => [p.id, p]));
    expect(byId.get("prd03.custom.slot-a")?.order).toBe(10);
    expect(byId.get("prd03.custom.slot-b")?.order).toBe(20);
    expect(byId.get("prd03.custom.slot-c")?.order).toBe(30);
    expect(byId.get("prd03.custom.slot-d")?.order).toBe(40);
    // Named slots also select the anchor: before-bloom → after-taa,
    // after-bloom/before-tonemap → before-tonemap, after-tonemap → after-tonemap.
    expect(byId.get("prd03.custom.slot-a")?.insertAt).toBe("after-taa");
    expect(byId.get("prd03.custom.slot-b")?.insertAt).toBe("before-tonemap");
    expect(byId.get("prd03.custom.slot-c")?.insertAt).toBe("before-tonemap");
    expect(byId.get("prd03.custom.slot-d")?.insertAt).toBe("after-tonemap");
  });

  it("numeric order sorts ascending inside one anchor; equal keys keep registration order", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    // Register out of order; all at before-tonemap so only `order` decides.
    releases.push(s.addPostPass(pass("late", { insertAt: "before-tonemap", order: 30 })));
    releases.push(s.addPostPass(pass("mid-b", { insertAt: "before-tonemap" })));
    releases.push(s.addPostPass(pass("first", { insertAt: "before-tonemap", order: 5 })));
    releases.push(s.addPostPass(pass("mid-a", { insertAt: "before-tonemap" })));
    const trace: string[] = [];
    runV2HdrStages(fakeHost(trace), fakeTarget("rgba16f", true), PIPELINE, null);
    expect(trace).toEqual(["first", "late", "mid_b", "mid_a"]);
  });

  it("named slots sharing the before-tonemap anchor execute after-bloom → numeric → before-tonemap when registered in reverse (R-03)", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    // Reverse of the intended execution order, all landing on one anchor.
    releases.push(s.addPostPass(pass("slot-before-tonemap", { order: "before-tonemap" })));
    releases.push(s.addPostPass(pass("slot-numeric-25", { order: 25 })));
    releases.push(s.addPostPass(pass("slot-after-bloom", { order: "after-bloom" })));
    const byId = new Map(mergedCustomPasses(PIPELINE).map((p) => [p.id, p]));
    for (const id of ["slot-before-tonemap", "slot-numeric-25", "slot-after-bloom"]) {
      expect(byId.get(`prd03.custom.${id}`)?.insertAt).toBe("before-tonemap");
    }
    const trace: string[] = [];
    runV2HdrStages(fakeHost(trace), fakeTarget("rgba16f", true), PIPELINE, null);
    expect(trace).toEqual(["slot_after_bloom", "slot_numeric_25", "slot_before_tonemap"]);
  });

  it("every named slot executes in slot order across anchors regardless of registration order (R-03)", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    releases.push(s.addPostPass(pass("n-after-tonemap", { order: "after-tonemap" })));
    releases.push(s.addPostPass(pass("n-before-tonemap", { order: "before-tonemap" })));
    releases.push(s.addPostPass(pass("n-after-bloom", { order: "after-bloom" })));
    releases.push(s.addPostPass(pass("n-before-bloom", { order: "before-bloom" })));
    const hdrTrace: string[] = [];
    runV2HdrStages(fakeHost(hdrTrace), fakeTarget("rgba16f", true), PIPELINE, null);
    const ldrTrace: string[] = [];
    runV2LdrTail(fakeHost(ldrTrace), fakeTarget("rgba8"), PIPELINE, undefined);
    expect([...hdrTrace, ...ldrTrace]).toEqual(["n_before_bloom", "n_after_bloom", "n_before_tonemap", "n_after_tonemap"]);
  });

  it("explicit insertAt anchors run in anchor order regardless of registration order", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    releases.push(s.addPostPass(pass("zlast", { insertAt: "after-taa" })));
    releases.push(s.addPostPass(pass("afirst", { insertAt: "after-depth" })));
    const trace: string[] = [];
    runV2HdrStages(fakeHost(trace), fakeTarget("rgba16f", true), PIPELINE, null);
    expect(trace).toEqual(["afirst", "zlast"]);
  });

  it("enabled: false registers but never executes; release() removes the pass", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    releases.push(s.addPostPass(pass("off", { insertAt: "before-tonemap", enabled: false })));
    const release = s.addPostPass(pass("on", { insertAt: "before-tonemap" }));
    releases.push(release);
    const merged = mergedCustomPasses(PIPELINE);
    expect(merged.map((p) => p.id)).toEqual(["prd03.custom.off", "prd03.custom.on"]);
    const trace: string[] = [];
    runV2HdrStages(fakeHost(trace), fakeTarget("rgba16f", true), PIPELINE, null);
    expect(trace).toEqual(["on"]);
    release();
    expect(mergedCustomPasses(PIPELINE).map((p) => p.id)).toEqual(["prd03.custom.off"]);
  });

  it("after-tonemap display passes honour numeric order in the LDR tail", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    releases.push(s.addPostPass(pass("grain-second", { insertAt: "after-tonemap", order: 40 })));
    releases.push(s.addPostPass(pass("grade-first", { insertAt: "after-tonemap", order: 10 })));
    const trace: string[] = [];
    runV2LdrTail(fakeHost(trace), fakeTarget("rgba8"), PIPELINE, undefined);
    expect(trace).toEqual(["grade_first", "grain_second"]);
  });

  it("setPassUniform mutates the live descriptor's uniforms without re-registration", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    releases.push(s.addPostPass(pass("uni", { insertAt: "before-tonemap", uniforms: { u_ord_uni: 1 } })));
    const descriptor = mergedCustomPasses(PIPELINE).find((p) => p.id === "prd03.custom.uni")!;
    const ctx = { width: 8, height: 8, timeSeconds: 0, frameIndex: 0 } as never;
    expect(descriptor.uniforms?.(ctx)).toEqual({ u_ord_uni: 1 });
    s.setPassUniform("uni", "u_ord_uni", 4);
    expect(descriptor.uniforms?.(ctx)).toEqual({ u_ord_uni: 4 });
    expect(() => s.setPassUniform("uni", "u_bad", Number.NaN)).toThrowError(/invalid|finite/i);
  });
});

/* R-03b: the WebGL2 fused present composites bloom itself, so `before-tonemap`
 * custom passes (after-bloom / numeric / before-tonemap slots) must run from
 * its after-bloom hook. The fake present below mirrors the real
 * `presentLdrPostprocess` ordering (bloom → afterBloom hook → tone map) and
 * records into the same trace as the tracing GL. */
describe("WebGL2 post order — before-tonemap passes run after the bloom composite (R-03b)", () => {
  const LDR_PASSES = [
    { name: "bloom", options: {} },
    { name: "tone-mapping", options: {} }
  ] as never;

  /* The OutputPass route runs bloom through `presentHdrBloom` and the OutputPass
   * (mocked: it records "tonemap"); a chain with a legacy display-space
   * descriptor (colour grade) keeps the fused present, mirrored by
   * `presentLdrPostprocess`. */
  function fusedHost(trace: string[], createdTargets?: { count: number }): WebGL2DeviceHost {
    outputPassState.trace = trace;
    outputPassState.failNext = false;
    const base = fakeHost(trace) as unknown as Record<string, unknown>;
    const device = base.device as { createRenderTarget: () => RenderTarget };
    return {
      ...base,
      device: {
        setRenderTarget: () => undefined,
        createRenderTarget: () => {
          if (createdTargets) createdTargets.count += 1;
          return device.createRenderTarget();
        }
      },
      post: {
        presentHdrBloom() {
          trace.push("bloom");
        },
        presentLdrPostprocess(_source: unknown, options: {
          passes: ReadonlyArray<{ name: string }>;
          afterBloom?: (input: { colorHandle: unknown; width: number; height: number }) => unknown;
        }) {
          if (options.passes.some((p) => p.name === "bloom")) {
            trace.push("bloom");
            options.afterBloom?.({ colorHandle: {}, width: 16, height: 16 });
          }
          trace.push("tonemap");
        }
      }
    } as unknown as WebGL2DeviceHost;
  }

  /** A legacy colour-grade descriptor keeps the chain on the fused present. */
  const FUSED_PASSES = [
    { name: "bloom", options: {} },
    { name: "tone-mapping", options: {} },
    { name: "color-grade", options: {} }
  ] as never;

  const runFrame = (host: WebGL2DeviceHost, passes: unknown = LDR_PASSES): void =>
    executePostGraphWebGL2(host, fakeTarget("rgba16f", true), {
      pipeline: PIPELINE,
      passes: passes as never,
      v2: v2Entry
    });

  it("runs before-bloom → bloom → after-bloom → numeric → before-tonemap → tone map, regardless of registration order", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    releases.push(s.addPostPass(pass("r-before-tonemap", { order: "before-tonemap" })));
    releases.push(s.addPostPass(pass("r-numeric-25", { order: 25 })));
    releases.push(s.addPostPass(pass("r-after-bloom", { order: "after-bloom" })));
    releases.push(s.addPostPass(pass("r-before-bloom", { order: "before-bloom" })));
    const trace: string[] = [];
    runFrame(fusedHost(trace));
    expect(trace).toEqual(["r_before_bloom", "bloom", "r_after_bloom", "r_numeric_25", "r_before_tonemap", "tonemap"]);
  });

  it("keeps before-tonemap passes in the HDR stage driver when no bloom is requested (nothing to order against)", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    releases.push(s.addPostPass(pass("nb-after-bloom", { order: "after-bloom" })));
    releases.push(s.addPostPass(pass("nb-before-tonemap", { order: "before-tonemap" })));
    const trace: string[] = [];
    runFrame(fusedHost(trace), [{ name: "tone-mapping", options: {} }]);
    expect(trace).toEqual(["nb_after_bloom", "nb_before_tonemap", "tonemap"]);
  });

  it("an LDR (rgba8) forward target keeps the legacy placement and never hands the present a hook", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    releases.push(s.addPostPass(pass("ldr-before-tonemap", { order: "before-tonemap" })));
    const trace: string[] = [];
    executePostGraphWebGL2(fusedHost(trace), fakeTarget("rgba8", true), { pipeline: PIPELINE, passes: LDR_PASSES, v2: v2Entry });
    expect(trace).toEqual(["ldr_before_tonemap", "bloom", "tonemap"]);
  });

  it("reports (not silently drops) deferred passes when the present never invokes the hook", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    releases.push(s.addPostPass(pass("skip-after-bloom", { order: "after-bloom" })));
    const trace: string[] = [];
    const host = fusedHost(trace) as unknown as { post: { presentLdrPostprocess: (...args: never[]) => void } };
    host.post.presentLdrPostprocess = () => { trace.push("tonemap"); };
    runFrame(host as unknown as WebGL2DeviceHost, FUSED_PASSES);
    expect(trace).toEqual(["tonemap"]);
    expect(trace).not.toContain("skip_after_bloom");
    expect(postSkippedReasons()).toContain("POSTPROCESS_AFTER_BLOOM_UNUSED:before-tonemap-custom-passes");
  });

  it("releases the deferred stage's pooled targets every frame (no per-frame allocation growth)", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    releases.push(s.addPostPass(pass("leak-a", { order: "after-bloom" })));
    releases.push(s.addPostPass(pass("leak-b", { order: "before-tonemap" })));
    const trace: string[] = [];
    const created = { count: 0 };
    const host = fusedHost(trace, created);
    runFrame(host);
    const afterFirst = created.count;
    expect(afterFirst).toBeGreaterThan(0);
    runFrame(host);
    runFrame(host);
    expect(created.count).toBe(afterFirst);
  });

  it("releases the stage even when the present throws", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    releases.push(s.addPostPass(pass("throw-a", { order: "after-bloom" })));
    const trace: string[] = [];
    const created = { count: 0 };
    const host = fusedHost(trace, created) as unknown as { post: { presentLdrPostprocess: (...args: never[]) => void } };
    const original = host.post.presentLdrPostprocess;
    let failNext = true;
    host.post.presentLdrPostprocess = ((...args: never[]) => {
      original(...args);
      if (failNext) { failNext = false; throw new Error("boom"); }
    }) as never;
    expect(() => runFrame(host as unknown as WebGL2DeviceHost, FUSED_PASSES)).toThrowError("boom");
    const afterThrow = created.count;
    runFrame(host as unknown as WebGL2DeviceHost, FUSED_PASSES);
    expect(created.count).toBe(afterThrow);
  });

  it("releases the stage and the bloom target even when the OutputPass throws", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    releases.push(s.addPostPass(pass("op-throw-a", { order: "after-bloom" })));
    const trace: string[] = [];
    const created = { count: 0 };
    const host = fusedHost(trace, created);
    outputPassState.failNext = true;
    expect(() => runFrame(host)).toThrowError("boom");
    const afterThrow = created.count;
    runFrame(host);
    runFrame(host);
    expect(created.count).toBe(afterThrow);
  });

  it("runV2HdrStages hands back the deferred stage and does not run before-tonemap passes itself", () => {
    setRendererQrFlags(POST_FLAGS);
    const s = surface();
    releases.push(s.addPostPass(pass("d-before-bloom", { order: "before-bloom" })));
    releases.push(s.addPostPass(pass("d-after-bloom", { order: "after-bloom" })));
    releases.push(s.addPostPass(pass("d-before-tonemap", { order: "before-tonemap" })));
    const trace: string[] = [];
    const host = fakeHost(trace);
    const result = runV2HdrStages(host, fakeTarget("rgba16f", true), PIPELINE, null, undefined, undefined, { deferBeforeTonemap: true });
    expect(trace).toEqual(["d_before_bloom"]);
    expect(result.afterBloom).toBeDefined();
    const out = result.afterBloom!.run({ colorHandle: {} as never, width: 16, height: 16 });
    expect(trace).toEqual(["d_before_bloom", "d_after_bloom", "d_before_tonemap"]);
    expect(out.width).toBe(16);
    result.afterBloom!.release();
    // Not requested → legacy behaviour: everything runs here, nothing deferred.
    const legacyTrace: string[] = [];
    const legacy = runV2HdrStages(fakeHost(legacyTrace), fakeTarget("rgba16f", true), PIPELINE, null);
    expect(legacy.afterBloom).toBeUndefined();
    expect(legacyTrace).toEqual(["d_before_bloom", "d_after_bloom", "d_before_tonemap"]);
  });
});
