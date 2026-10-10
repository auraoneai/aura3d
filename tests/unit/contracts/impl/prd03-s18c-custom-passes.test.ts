import { afterEach, describe, expect, it } from "vitest";
import { mergedCustomPasses, runV2HdrStages, runV2LdrTail } from "../../../../packages/rendering/src/post/v2Stages";
import { postSkippedReasons, resetPostSkipped } from "../../../../packages/rendering/src/renderer/postSkipped";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { registerPostPass } from "../../../../packages/rendering/src/contracts/post";
import { Prd03PostSurface } from "../../../../packages/engine/src/agent-api/postBridge";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { PostInsertAt, PostPassDescriptor, PostPipelineOptions } from "../../../../packages/rendering/src/contracts/post";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";
import type { RenderTarget } from "../../../../packages/rendering/src/RenderDevice";

/**
 * 03-S18c (PRD-16 G1 lane 03): `Prd03PostSurface.addPostPass` feeds
 * `mergedCustomPasses(pipeline)`; the v2 driver runs custom passes at all five
 * §6.1 anchors in order; a display pass before tonemap is rejected with
 * `POSTPROCESS_SPACE_INVALID`. The execution order is traced through the fake
 * GL: `runCustomPass` looks up each declared uniform on its program, so a
 * per-pass marker uniform (`u_s18c_<anchor>`) records when the pass ran.
 * The remote browser half lives in `qr-prd03-phase6` (custom-pass probe).
 */

const ANCHORS: readonly PostInsertAt[] = ["after-depth", "before-taa", "after-taa", "before-tonemap", "after-tonemap"];

const PIPELINE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

const POST_FLAGS = { on: (name: string) => name === "A3D_QR_POST", any: () => false } as never;
const EMPTY_FLAGS = { on: () => false, any: () => false } as never;

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
      if (name.startsWith("u_s18c_")) trace.push(name.slice("u_s18c_".length).replace(/_/g, "-"));
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
    id: `s18c-${++seq}`,
    label: `s18c-${seq}`,
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

/** GLSL-legal marker uniform per anchor (`u_s18c_after_depth`, …). */
function marker(anchor: PostInsertAt): string {
  return `u_s18c_${anchor.replace(/-/g, "_")}`;
}

function addAll(surface: Prd03PostSurface, order: readonly PostInsertAt[]): void {
  for (const anchor of order) {
    releases.push(surface.addPostPass({
      name: `s18c-${anchor}`,
      insertAt: anchor,
      uniforms: { [marker(anchor)]: 1 },
      fragment: { glsl: `uniform float ${marker(anchor)};\nvoid main() { outColor = texture(u_color, v_uv); }` }
    }));
  }
}

describe("03-S18c addPostPass → mergedCustomPasses", () => {
  it("flag-on addPostPass registers into the pass set the v2 driver reads", () => {
    setRendererQrFlags(POST_FLAGS);
    addAll(new Prd03PostSurface(resolveQrFlags({ options: ["post"] })), ANCHORS);
    const merged = mergedCustomPasses(PIPELINE);
    expect(merged.map((pass) => pass.insertAt)).toEqual(ANCHORS);
    expect(merged.map((pass) => pass.space)).toEqual(["linear-hdr", "linear-hdr", "linear-hdr", "linear-hdr", "display"]);
  });

  it("flag-off addPostPass is a no-op (legacy chain)", () => {
    addAll(new Prd03PostSurface(resolveQrFlags({ options: [] })), ANCHORS);
    expect(mergedCustomPasses(PIPELINE)).toEqual([]);
  });
});

describe("03-S18c five insertion points run in §6.1 order", () => {
  it("runV2HdrStages runs the four HDR anchors in order, runV2LdrTail runs after-tonemap", () => {
    setRendererQrFlags(POST_FLAGS);
    // Registered in reverse to prove execution order follows the anchors, not
    // registration order.
    addAll(new Prd03PostSurface(resolveQrFlags({ options: ["post"] })), [...ANCHORS].reverse());
    const trace: string[] = [];
    const host = fakeHost(trace);
    const hdr = runV2HdrStages(host, fakeTarget("rgba16f", true), PIPELINE, null);
    expect(hdr.skipped).toEqual([]);
    expect(trace).toEqual(["after-depth", "before-taa", "after-taa", "before-tonemap"]);
    runV2LdrTail(host, fakeTarget("rgba8"), PIPELINE, undefined);
    expect(trace).toEqual([...ANCHORS]);
  });
});

describe("03-S18c display pass before tonemap is rejected", () => {
  const misplaced: PostPassDescriptor = {
    id: "prd03.s18c-display-before-tonemap",
    owner: "prd03",
    flag: "A3D_QR_POST",
    insertAt: "before-tonemap",
    space: "display",
    inputs: ["color"],
    fragment: { glsl: "void main() { outColor = texture(u_color, v_uv); }" },
    gpuOnly: true
  };

  it("registerPostPass throws POSTPROCESS_SPACE_INVALID", () => {
    expect(() => registerPostPass(misplaced)).toThrowError(/POSTPROCESS_SPACE_INVALID:prd03\.s18c-display-before-tonemap/);
  });

  it("a bag-supplied misplaced pass never runs and is recorded, without a per-frame throw", () => {
    setRendererQrFlags(POST_FLAGS);
    const pipeline = { ...PIPELINE, customPasses: [misplaced] };
    expect(mergedCustomPasses(pipeline)).toEqual([]);
    expect(postSkippedReasons()).toContain("POSTPROCESS_SPACE_INVALID:prd03.s18c-display-before-tonemap");
    const trace: string[] = [];
    const source = fakeTarget("rgba16f", true);
    expect(() => runV2HdrStages(fakeHost(trace), source, pipeline, null)).not.toThrow();
  });
});
