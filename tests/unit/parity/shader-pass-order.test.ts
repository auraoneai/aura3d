import { afterEach, describe, expect, it } from "vitest";
import { mergedCustomPasses, runV2HdrStages, runV2LdrTail } from "../../../packages/rendering/src/post/v2Stages";
import { resetPostSkipped } from "../../../packages/rendering/src/renderer/postSkipped";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { effects } from "../../../packages/engine/src/agent-api/nodes/effects.composite.js";
import { Prd03PostSurface } from "../../../packages/engine/src/agent-api/postBridge";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraCustomPostPass } from "../../../packages/engine/src/contracts/post.js";
import type { PostPipelineOptions } from "../../../packages/rendering/src/contracts/post";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import type { RenderTarget } from "../../../packages/rendering/src/RenderDevice";

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
