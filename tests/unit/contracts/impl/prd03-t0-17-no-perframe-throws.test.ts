import { afterEach, describe, expect, it } from "vitest";
import { executePostGraphWebGL2, createLegacyOutputPass } from "../../../../packages/rendering/src/webgl2/LegacyPost";
import { runV2HdrStages } from "../../../../packages/rendering/src/post/v2Stages";
import {
  postSkippedReasons,
  RendererPostprocessPipeline
} from "../../../../packages/rendering/src/renderer/PostprocessExecution";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import {
  recordAuthoredPostContext,
  resetAuthoredPostContext
} from "../../../../packages/engine/src/agent-api/postBridge";
import { createProductionRuntimePostprocess } from "../../../../packages/engine/src/agent-api/compiler/postprocess";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";
import type { PostPipelineOptions } from "../../../../packages/rendering/src/contracts/post";
import type { RenderTarget, LdrPostprocessPassDescriptor } from "../../../../packages/rendering/src/RenderDevice";

/**
 * T0-17 (PRD-16 §2.2, FLAG-ON-3/4): no per-frame throws under `post`.
 * FLAG-ON-3: `output.toneMapping:'none'` still presents HDR — the compiler
 * targets rgba8 on the legacy route and the v2 seam injects the linear
 * OutputPass (`createLegacyOutputPass` maps 'none' → linear).
 * FLAG-ON-4: `POSTPROCESS_PASS_NOT_GPU` and the v2 depth/camera requirement
 * throws degrade to recorded skips (`diagnostics().post.skipped`), never a
 * thrown frame.
 */

const PIPELINE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

const EMPTY_FLAGS = { on: () => false, any: () => false } as never;
const POST_FLAGS = { on: (name: string) => name === "A3D_QR_POST", any: () => false } as never;

function fakeGl(): WebGL2RenderingContext {
  const fns: Record<string, (...args: never[]) => unknown> = {
    createVertexArray: () => ({} as never),
    createTexture: () => ({} as never),
    createShader: () => ({} as never),
    createProgram: () => ({} as never),
    getUniformLocation: () => ({} as never),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getProgramInfoLog: () => ""
  };
  return new Proxy(fns as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      if (typeof prop === "string" && /^[A-Z][A-Z0-9_]*$/.test(prop)) return prop.length * 7 + 3;
      return (..._args: unknown[]) => undefined;
    },
    has: () => true
  }) as unknown as WebGL2RenderingContext;
}

let seq = 0;
function fakeTarget(format: "rgba8" | "rgba16f" = "rgba8", depth = false): RenderTarget {
  return {
    id: `t${++seq}`,
    label: `t${seq}`,
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

function fakeHost(): { host: WebGL2DeviceHost; presented: () => LdrPostprocessPassDescriptor[] } {
  let presented: readonly LdrPostprocessPassDescriptor[] = [];
  const device = { createRenderTarget: () => fakeTarget() };
  const host = {
    gl: fakeGl(),
    device,
    stateCache: { invalidate: () => undefined },
    resolveMultisampleTarget: () => undefined,
    post: {
      presentLdrPostprocess: (_s: RenderTarget, options: { passes: readonly LdrPostprocessPassDescriptor[] }) => {
        presented = options.passes;
      }
    },
    activeRenderTarget: null
  } as unknown as WebGL2DeviceHost;
  return { host, presented: () => [...presented] };
}

const SNAPSHOT = { nodes: [], camera: { near: 0.1, far: 100, mode: "perspective" } } as never;

afterEach(() => {
  setRendererQrFlags(EMPTY_FLAGS);
  resetAuthoredPostContext();
});

describe("T0-17 FLAG-ON-3: toneMapping 'none' keeps HDR presentable", () => {
  it("compile targets rgba8 under flag-on 'none' (+bloom)", () => {
    recordAuthoredPostContext({
      flags: { on: (n: string) => n === "A3D_QR_POST" } as never,
      options: { output: { toneMapping: "none" }, effects: {} }
    });
    const options = createProductionRuntimePostprocess(SNAPSHOT);
    expect(options.targetFormat).toBe("rgba8");
    expect(options.toneMapping).toBe(false);
  });

  it("compile targets rgba8 under flag-on 'none' with compat.post '3.0' (dev)", () => {
    recordAuthoredPostContext({
      flags: { on: (n: string) => n === "A3D_QR_POST" } as never,
      options: { output: { toneMapping: "none" }, compat: { post: "3.0" } }
    });
    const options = createProductionRuntimePostprocess(SNAPSHOT);
    expect(options.targetFormat).toBe("rgba8");
    expect(options.toneMapping).toBe(false);
    expect(options.v2).not.toBe(true);
  });

  it("flag-off keeps rgba16f (flag-off identity)", () => {
    recordAuthoredPostContext({
      flags: { on: () => false } as never,
      options: { output: { toneMapping: "none" } }
    });
    expect(createProductionRuntimePostprocess(SNAPSHOT).targetFormat).toBe("rgba16f");
  });

  it("v2 seam injects the linear OutputPass when no tone pass was planned", () => {
    const { host, presented } = fakeHost();
    const source = fakeTarget("rgba16f", true);
    executePostGraphWebGL2(host, source, {
      pipeline: { ...PIPELINE, toneMapping: "none" },
      passes: [{ name: "bloom", options: {} }],
      v2: {
        runV2HdrStages: () => ({ target: source, aoPending: false, skipped: [] }),
        v2NeedsLdrTail: () => false
      } as never
    });
    const tone = presented().find((pass) => pass.name === "tone-mapping");
    expect(tone).toBeDefined();
    expect((tone!.options as { operator: string }).operator).toBe("linear");
  });
});

describe("T0-17 FLAG-ON-4: per-frame throws degrade to recorded skips", () => {
  it("native depth pass on a depth-less v2 output is recorded, not thrown", () => {
    const { host, presented } = fakeHost();
    const source = fakeTarget("rgba16f", true);
    const hdrOut = fakeTarget("rgba16f", false); // pooled stage output: no depth
    executePostGraphWebGL2(host, source, {
      pipeline: { ...PIPELINE, toneMapping: "none" },
      passes: [
        { name: "ssr", options: {} },
        { name: "bloom", options: {} }
      ],
      v2: {
        runV2HdrStages: () => ({ target: hdrOut, aoPending: false, skipped: [] }),
        v2NeedsLdrTail: () => false,
        releaseV2Target: () => undefined
      } as never
    });
    expect(presented().some((pass) => pass.name === "ssr")).toBe(false);
    expect(postSkippedReasons()).toContain("WEBGL_LDR_POSTPROCESS_DEPTH_REQUIRED:ssr");
  });

  it("v2-owned native twins are filtered (no double-run)", () => {
    const { host, presented } = fakeHost();
    const source = fakeTarget("rgba16f", true);
    executePostGraphWebGL2(host, source, {
      pipeline: { ...PIPELINE, dof: { enabled: true } as never },
      passes: [
        { name: "depth-of-field", options: {} },
        { name: "tone-mapping", options: {} }
      ],
      v2: {
        runV2HdrStages: () => ({ target: source, aoPending: false, skipped: [] }),
        v2NeedsLdrTail: () => false
      } as never
    });
    expect(presented().some((pass) => pass.name === "depth-of-field")).toBe(false);
    expect(presented().some((pass) => pass.name === "tone-mapping")).toBe(true);
  });

  it("runV2HdrStages degrades a depth-less source instead of throwing", () => {
    const host = fakeHost().host;
    const source = fakeTarget("rgba16f", false);
    const out = runV2HdrStages(host, source, { ...PIPELINE, ao: { samples: 4 } as never }, null as never);
    expect(out.target).toBe(source);
    expect(out.skipped).toContain("V2_DEPTH_UNAVAILABLE");
    expect(postSkippedReasons().some((r) => r.startsWith("WEBGL_LDR_POSTPROCESS_DEPTH_REQUIRED"))).toBe(true);
  });

  it("CPU pass skips are recorded under the flag, not thrown", () => {
    const instance = Object.create(RendererPostprocessPipeline.prototype) as {
      postCpuPassSkipped(name: string, cpuDeterministic: boolean): boolean;
    };
    setRendererQrFlags(POST_FLAGS);
    expect(instance.postCpuPassSkipped("ssao", false)).toBe(true);
    expect(postSkippedReasons()).toContain("POSTPROCESS_PASS_NOT_GPU:ssao");
    expect(instance.postCpuPassSkipped("ssao", true)).toBe(false);
    setRendererQrFlags(EMPTY_FLAGS);
    expect(instance.postCpuPassSkipped("ssao", false)).toBe(false);
  });
});
