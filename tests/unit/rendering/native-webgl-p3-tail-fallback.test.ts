import { afterEach, describe, expect, it, vi } from "vitest";
import type { RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import type { PostPipelineOptions } from "../../../packages/rendering/src/contracts/post";
import * as postV2 from "../../../packages/rendering/src/post/v2Entry";
import { webgl2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";
import { executePostGraphWebGL2 } from "../../../packages/rendering/src/webgl2/LegacyPost";

/** Native-shaped GL records the real output and tail draws, without claiming pixel results. */
function fixture() {
  const constants = new Map<string, number>();
  const value = (name: string): number => {
    if (!constants.has(name)) constants.set(name, constants.size + 1);
    return constants.get(name)!;
  };
  const listeners = new Map<string, EventListener>();
  const state = {
    colorSpace: "srgb", failSrgb: false, currentProgram: null as unknown,
    framebuffer: null as unknown, draws: [] as Array<{ framebuffer: unknown; colorSpace: string; uniforms: ReadonlyMap<string, number> }>,
    programUniforms: new Map<unknown, Map<string, number>>(),
    uniforms: [] as Array<[string, number]>
  };
  let nextId = 0;
  const gl = new Proxy({ drawingBufferColorSpace: "srgb" } as Record<string, unknown>, {
    get(target, property) {
      const name = String(property);
      if (name === "drawingBufferColorSpace") return state.colorSpace;
      if (name === "getContextAttributes") return () => ({ alpha: false, premultipliedAlpha: false });
      if (name === "NO_ERROR") return 0;
      if (name === "getError") return () => 0;
      if (name === "getParameter") return (parameter: number) => {
        if (parameter === value("CURRENT_PROGRAM")) return state.currentProgram;
        if (parameter === value("FRAMEBUFFER_BINDING") || parameter === value("DRAW_FRAMEBUFFER_BINDING") || parameter === value("READ_FRAMEBUFFER_BINDING")) return state.framebuffer;
        if (parameter === value("READ_BUFFER") || parameter === value("DRAW_BUFFER0")) return value("COLOR_ATTACHMENT0");
        return 8;
      };
      if (name === "useProgram") return (program: unknown) => { state.currentProgram = program; };
      if (name === "bindFramebuffer") return (_target: number, framebuffer: unknown) => { state.framebuffer = framebuffer; };
      if (name === "checkFramebufferStatus") return () => value("FRAMEBUFFER_COMPLETE");
      if (name === "getExtension") return (extension: string) => extension === "EXT_color_buffer_float" ? {} : null;
      if (name === "getShaderParameter") return () => true;
      if (name === "getProgramParameter") return (_program: unknown, parameter: number) => parameter === value("LINK_STATUS") ? true : 0;
      if (name === "getUniformBlockIndex") return () => value("INVALID_INDEX");
      if (name === "getUniformLocation") return (_program: unknown, uniform: string) => uniform;
      if (name === "uniform1i") return (uniform: string, scalar: number) => {
        state.uniforms.push([uniform, scalar]);
        const values = state.programUniforms.get(state.currentProgram) ?? new Map<string, number>();
        values.set(uniform, scalar);
        state.programUniforms.set(state.currentProgram, values);
      };
      if (name === "drawArrays") return () => { state.draws.push({ framebuffer: state.framebuffer, colorSpace: state.colorSpace,
        uniforms: new Map(state.programUniforms.get(state.currentProgram) ?? []) }); };
      if (name === "fenceSync") return () => null;
      if (name === "isContextLost") return () => false;
      if (/^[A-Z0-9_]+$/.test(name)) return value(name);
      if (name.startsWith("create")) return () => ({ id: ++nextId });
      return Reflect.get(target, property) ?? (() => undefined);
    },
    set(target, property, next) {
      if (property === "drawingBufferColorSpace") {
        if (next === "srgb" && state.failSrgb) throw new Error("sRGB selection failed");
        state.colorSpace = String(next);
      }
      return Reflect.set(target, property, next);
    }
  }) as unknown as WebGL2RenderingContext;
  const canvas = {
    getContext: () => gl,
    addEventListener: (name: string, listener: EventListener) => { listeners.set(name, listener); },
    removeEventListener: (name: string) => { listeners.delete(name); }
  } as unknown as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas });
  const host = webgl2DeviceHost(device)!;
  const source = device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: false });
  const compile = vi.spyOn(device, "createShaderProgram");
  const scopeId = {};
  const frame = (frameId: number) => ({ source: {}, items: [], scopeId, viewId: "main", frameId,
    sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 10, orthographic: false } } });
  const pipeline = (options: Partial<PostPipelineOptions> = {}): PostPipelineOptions => ({
    antiAliasing: "off", depthRange: { near: 0.1, far: 10, projection: "perspective" },
    exposure: 1, toneMapping: "linear", dither: false, ...options
  });
  const run = (options: Partial<PostPipelineOptions>, frameId: number,
    hooks: typeof postV2 = postV2, outputTarget?: RenderTarget): void => {
    device.beginFrame(8, 8);
    try {
      // The renderer's planner emits this descriptor for the fixture's enabled
      // linear tone mapping. The legacy sRGB path requires it for HDR input.
      executePostGraphWebGL2(host, source, { v2: hooks, pipeline: pipeline(options),
        passes: [{ name: "tone-mapping", options: { operator: "linear", exposure: 1 } }],
        frameContext: frame(frameId), ...(outputTarget ? { outputTarget } : {}) });
    } finally { device.endFrame(); }
  };
  return { device, gl, host, source, state, compile, pipeline, frame, run };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("WebGL display-tail output fallback", () => {
  it("selects verified sRGB while retaining the P3 request and supported capability", () => {
    const f = fixture();
    try {
      expect(f.device.negotiateOutputColorSpace("display-p3").active).toBe("display-p3");
      expect(f.device.negotiateSrgbOutputFallback("display-p3", "tail requires sRGB")).toEqual({
        requested: "display-p3", active: "srgb", supported: ["srgb", "display-p3"], fallbackReason: "tail requires sRGB"
      });
      expect(f.state.colorSpace).toBe("srgb");
      expect(f.device.getOutputColorSpaceNegotiation()?.requested).toBe("display-p3");
      expect(() => f.device.negotiateSrgbOutputFallback("display-p3", " ")).toThrow(/fallback/i);
    } finally { f.device.dispose(); }
  });

  it("renders the requested P3 tail in sRGB, retains sRGB history, and restores P3 for a no-tail frame", () => {
    const f = fixture();
    const afterimage = [{ kind: "afterimage", decay: 0.8 }, { kind: "dot-screen", size: 4, angle: 0, strength: 0.5 }] as const;
    try {
      f.run({ outputColorSpace: "display-p3" }, 1);
      expect(f.state.colorSpace).toBe("display-p3");
      f.run({ outputColorSpace: "display-p3", nativeEffects: afterimage }, 2);
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "srgb", fallbackReason: expect.stringMatching(/tail/i) });
      expect(f.state.colorSpace).toBe("srgb");
      f.run({ outputColorSpace: "display-p3", nativeEffects: afterimage }, 3);
      expect(f.state.draws.filter(draw => draw.uniforms.get("u_kind") === 7).map(draw => draw.uniforms.get("u_hasHistory"))).toEqual([0, 1]);
      expect(f.state.draws.filter(draw => draw.uniforms.get("u_kind") === 3).map(draw => draw.uniforms.get("u_hasHistory"))).toEqual([0, 0]);
      const outputs = f.compile.mock.calls.map(([source]) => source.fragment).filter(fragment => fragment.includes("a3d.output"));
      expect(outputs.some(fragment => fragment.includes("#define OUTPUT_DISPLAY_P3"))).toBe(true);
      expect(outputs.some(fragment => !fragment.includes("#define OUTPUT_DISPLAY_P3"))).toBe(true);
      expect(f.state.draws.filter(draw => draw.framebuffer === null).at(-1)?.colorSpace).toBe("srgb");
      f.run({ outputColorSpace: "display-p3" }, 4);
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "display-p3" });
      expect(f.state.colorSpace).toBe("display-p3");
      // The default sRGB tail must also reset a previously selected P3 canvas.
      f.run({ nativeEffects: [{ kind: "pixelation", size: 2 }] }, 5);
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "srgb", active: "srgb" });
      expect(f.state.colorSpace).toBe("srgb");
    } finally { f.device.dispose(); }
  });

  it("keeps the fallback and releases the tail lease after a failed presentation", () => {
    const f = fixture();
    const released = vi.fn();
    const hooks: typeof postV2 = {
      ...postV2,
      acquireV2TargetLease(...args) {
        const lease = postV2.acquireV2TargetLease(...args);
        return { target: lease.target, release() { released(); lease.release(); } };
      },
      runV2LdrTail() { throw new Error("tail failed"); }
    };
    try {
      f.run({ outputColorSpace: "display-p3" }, 1);
      expect(() => f.run({ outputColorSpace: "display-p3", nativeEffects: [{ kind: "dot-screen", size: 4, angle: 0, strength: 0.5 }] }, 2, hooks)).toThrow("tail failed");
      expect(released).toHaveBeenCalledTimes(1);
      expect(f.device.getRenderTarget()).toBeNull();
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "srgb" });
      expect(f.state.colorSpace).toBe("srgb");
      f.run({ outputColorSpace: "display-p3" }, 3);
      expect(f.state.colorSpace).toBe("display-p3");
    } finally { f.device.dispose(); }
  });

  it("does not renegotiate a P3 canvas while an sRGB fallback tail is active", () => {
    const f = fixture();
    const hooks: typeof postV2 = {
      ...postV2,
      runV2LdrTail(host, source, pipeline, outputTarget, frameContext) {
        expect(pipeline.outputColorSpace).toBe("srgb");
        expect(() => host.device.negotiateOutputColorSpace("display-p3")).toThrow(/being presented/i);
        expect(host.device.negotiateOutputColorSpace("srgb").active).toBe("srgb");
        expect(host.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "srgb" });
        return postV2.runV2LdrTail(host, source, pipeline, outputTarget, frameContext);
      }
    };
    try {
      f.run({ outputColorSpace: "display-p3", nativeEffects: [{ kind: "dot-screen", size: 4, angle: 0, strength: 0.5 }] }, 1, hooks);
      expect(f.state.draws.filter(draw => draw.framebuffer === null).at(-1)?.colorSpace).toBe("srgb");
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "srgb" });
      expect(f.device.negotiateOutputColorSpace("display-p3").active).toBe("display-p3");
    } finally { f.device.dispose(); }
  });

  it("retains an sRGB fused post chain when a requested P3 tail cannot use OutputPass (sharpened grade)", () => {
    const f = fixture();
    try {
      f.device.beginFrame(8, 8);
      try {
        executePostGraphWebGL2(f.host, f.source, {
          v2: postV2,
          pipeline: f.pipeline({ outputColorSpace: "display-p3", nativeEffects: [{ kind: "pixelation", size: 2 }] }),
          passes: [{ name: "tone-mapping", options: {} }, { name: "color-grade", options: { sharpening: 0.5 } }],
          frameContext: f.frame(1)
        });
      } finally { f.device.endFrame(); }
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "srgb" });
      expect(f.state.colorSpace).toBe("srgb");
      expect(f.state.draws.filter(draw => draw.framebuffer === null).at(-1)?.colorSpace).toBe("srgb");
      expect(f.state.uniforms.some(([name, selected]) => name === "u_outputColorSpace" && selected === 1)).toBe(true);
    } finally { f.device.dispose(); }
  });

  it("falls back to sRGB instead of throwing when a P3 chain without a tail has no OutputPass route (sharpened grade)", () => {
    const f = fixture();
    try {
      f.device.beginFrame(8, 8);
      try {
        executePostGraphWebGL2(f.host, f.source, {
          v2: postV2,
          pipeline: f.pipeline({ outputColorSpace: "display-p3" }),
          passes: [{ name: "tone-mapping", options: {} }, { name: "color-grade", options: { sharpening: 0.5 } }],
          frameContext: f.frame(1)
        });
      } finally { f.device.endFrame(); }
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "srgb", fallbackReason: "Display-P3 is unavailable for this post chain: passes:color-grade(sharpening or invalid option)" });
      expect(f.state.colorSpace).toBe("srgb");
      expect(f.state.draws.filter(draw => draw.framebuffer === null).length).toBeGreaterThan(0);
      // The scope was released: a later frame may renegotiate P3.
      expect(f.device.negotiateOutputColorSpace("display-p3").active).toBe("display-p3");
    } finally { f.device.dispose(); }
  });

  it.each(["fused", "unfused"] as const)("rejects direct canvas mutation before the %s final draw", mode => {
    const f = fixture();
    // The fused FXAA + grain tail is an admitted P3 tail; the dot-screen tail keeps the sRGB fallback.
    const active = mode === "fused" ? "display-p3" : "srgb";
    const hooks: typeof postV2 = {
      ...postV2,
      runV2LdrTail(...args) {
        (f.gl as WebGL2RenderingContext & { drawingBufferColorSpace: string }).drawingBufferColorSpace = active === "srgb" ? "display-p3" : "srgb";
        return postV2.runV2LdrTail(...args);
      }
    };
    try {
      const options: Partial<PostPipelineOptions> = mode === "fused"
        ? { outputColorSpace: "display-p3", antiAliasing: "fxaa", filmGrain: { intensity: 0.1 } }
        : { outputColorSpace: "display-p3", nativeEffects: [{ kind: "dot-screen", size: 4, angle: 0, strength: 0.5 }] };
      expect(() => f.run(options, 1, hooks)).toThrow(/color space changed/i);
      expect(f.state.draws.filter(draw => draw.framebuffer === null)).toHaveLength(0);
      expect(f.state.colorSpace).toBe(active);
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active });
    } finally { f.device.dispose(); }
  });

  it("clears the active-color diagnostic when a mutated canvas cannot be restored", () => {
    const f = fixture();
    const hooks: typeof postV2 = {
      ...postV2,
      runV2LdrTail(host, source, pipeline, outputTarget, frameContext) {
        (f.gl as WebGL2RenderingContext & { drawingBufferColorSpace: string }).drawingBufferColorSpace = "display-p3";
        f.state.failSrgb = true;
        return postV2.runV2LdrTail(host, source, pipeline, outputTarget, frameContext);
      }
    };
    try {
      expect(() => f.run({ outputColorSpace: "display-p3", nativeEffects: [{ kind: "dot-screen", size: 4, angle: 0, strength: 0.5 }] }, 1, hooks)).toThrow(/color space changed/i);
      expect(f.state.draws.filter(draw => draw.framebuffer === null)).toHaveLength(0);
      expect(f.state.colorSpace).toBe("display-p3");
      expect(f.device.getOutputColorSpaceNegotiation()).toBeUndefined();
    } finally { f.state.failSrgb = false; f.device.dispose(); }
  });

  it("fails before a tail draw if the previous P3 canvas cannot return to sRGB", () => {
    const f = fixture();
    try {
      f.run({ outputColorSpace: "display-p3" }, 1);
      const draws = f.state.draws.length;
      f.state.failSrgb = true;
      expect(() => f.run({ outputColorSpace: "display-p3", nativeEffects: [{ kind: "dot-screen", size: 4, angle: 0, strength: 0.5 }] }, 2)).toThrow(/color space/i);
      expect(f.state.draws).toHaveLength(draws);
      expect(f.state.colorSpace).toBe("display-p3");
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "display-p3" });
    } finally { f.device.dispose(); }
  });

  it("continues to reject explicit offscreen P3 rather than mislabel its target", () => {
    const f = fixture();
    const target = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false });
    try {
      expect(() => f.run({ outputColorSpace: "display-p3", nativeEffects: [{ kind: "pixelation", size: 2 }] }, 1, postV2, target)).toThrow(/display-p3/i);
      expect(f.state.colorSpace).toBe("srgb");
      expect(f.device.getOutputColorSpaceNegotiation()).toBeUndefined();
    } finally { target.dispose(); f.device.dispose(); }
  });
});
