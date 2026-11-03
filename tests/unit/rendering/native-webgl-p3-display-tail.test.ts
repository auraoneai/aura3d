import { afterEach, describe, expect, it, vi } from "vitest";
import { RenderDeviceError, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { createTrustedQrFlags, type QrFlags } from "../../../packages/rendering/src/contracts/core";
import { renderTargetPoolSlot, type RenderTargetPoolLike } from "../../../packages/rendering/src/contracts/device";
import type { OutputPassOptions } from "../../../packages/rendering/src/contracts/output";
import type { PostPassDescriptor, PostPipelineOptions } from "../../../packages/rendering/src/contracts/post";
import { Texture } from "../../../packages/rendering/src/Texture";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import {
  OutputPass,
  executeOutputPassToEncodedDisplaySurface
} from "../../../packages/rendering/src/output/OutputPass";
import {
  assertEncodedDisplaySurfaceWritten,
  issueEncodedDisplaySurface,
  type EncodedDisplaySurfaceLease
} from "../../../packages/rendering/src/output/EncodedDisplaySurface";
import { PostResources, type PostTargetLease } from "../../../packages/rendering/src/post/PostResources";
import * as postV2 from "../../../packages/rendering/src/post/v2Entry";
import "../../../packages/rendering/src/lanes/prd11";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { RendererPostprocessPipeline } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import { webgl2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";
import { executePostGraphWebGL2 } from "../../../packages/rendering/src/webgl2/LegacyPost";

type AlphaMode = "opaque" | "straight" | "premultiplied";
type RecordedDraw = {
  readonly framebuffer: unknown;
  readonly attachment: unknown;
  readonly colorSpace: string;
  readonly source: string;
  readonly bindings: ReadonlyMap<number, unknown>;
  readonly uniforms: ReadonlyMap<string, number>;
};

/** Records real host draw bindings and shader source; it does not simulate GPU pixels. */
function fixture(alphaMode: AlphaMode = "opaque", acceptsP3 = true, leaseBacking = true) {
  const constants = new Map<string, number>();
  const constant = (name: string): number => {
    const textureUnit = /^TEXTURE(\d+)$/.exec(name);
    if (textureUnit) return 10_000 + Number(textureUnit[1]);
    if (name === "NO_ERROR") return 0;
    if (!constants.has(name)) constants.set(name, constants.size + 1);
    return constants.get(name)!;
  };
  const listeners = new Map<string, EventListener>();
  const shaderSources = new Map<unknown, string>();
  const programShaders = new Map<unknown, unknown[]>();
  const programUniforms = new Map<unknown, Map<string, number>>();
  const attachments = new Map<unknown, unknown>();
  const textureFormats = new Map<unknown, number>();
  const state = {
    colorSpace: "srgb",
    framebuffer: null as unknown,
    currentProgram: null as unknown,
    activeTexture: constant("TEXTURE0"),
    textures: new Map<number, unknown>(),
    draws: [] as RecordedDraw[],
    failCanvasDraw: false
  };
  let nextId = 0;
  const object = () => ({ id: ++nextId });
  const programSource = (program: unknown): string =>
    (programShaders.get(program) ?? []).map(shader => shaderSources.get(shader) ?? "").join("\n");
  const reflectedUniforms = (program: unknown): Array<{ name: string; type: number; size: number }> => {
    const source = programSource(program);
    if (!source.includes("// a3d.output")) return [];
    const types: Record<string, string> = { sampler2D: "SAMPLER_2D", float: "FLOAT", int: "INT", vec2: "FLOAT_VEC2", vec3: "FLOAT_VEC3", vec4: "FLOAT_VEC4" };
    return [...source.matchAll(/\buniform\s+(sampler2D|float|int|vec2|vec3|vec4)\s+(\w+)\s*;/g)]
      .map(match => ({ name: match[2]!, type: constant(types[match[1]!]!), size: 1 }));
  };
  const recordDraw = () => {
    if (state.framebuffer === null && state.failCanvasDraw) {
      state.failCanvasDraw = false;
      throw new Error("synthetic canvas draw failure");
    }
    const source = programSource(state.currentProgram);
    state.draws.push({
      framebuffer: state.framebuffer,
      attachment: attachments.get(state.framebuffer),
      colorSpace: state.colorSpace,
      source,
      bindings: new Map(state.textures),
      uniforms: new Map(programUniforms.get(state.currentProgram) ?? [])
    });
  };
  const gl = new Proxy({ drawingBufferColorSpace: "srgb" } as Record<string, unknown>, {
    get(target, property) {
      const name = String(property);
      if (name === "drawingBufferColorSpace") return state.colorSpace;
      if (name === "getContextAttributes") return () => ({ alpha: alphaMode !== "opaque", premultipliedAlpha: alphaMode === "premultiplied" });
      if (name === "getError") return () => 0;
      if (name === "getParameter") return (parameter: number) => {
        if (parameter === constant("CURRENT_PROGRAM")) return state.currentProgram;
        if (parameter === constant("FRAMEBUFFER_BINDING") || parameter === constant("DRAW_FRAMEBUFFER_BINDING") || parameter === constant("READ_FRAMEBUFFER_BINDING")) return state.framebuffer;
        if (parameter === constant("ACTIVE_TEXTURE")) return state.activeTexture;
        if (parameter === constant("TEXTURE_BINDING_2D")) return state.textures.get(state.activeTexture - constant("TEXTURE0")) ?? null;
        if (parameter === constant("READ_BUFFER") || parameter === constant("DRAW_BUFFER0")) return constant("COLOR_ATTACHMENT0");
        return 8;
      };
      if (name === "useProgram") return (program: unknown) => { state.currentProgram = program; };
      if (name === "bindFramebuffer") return (_target: number, framebuffer: unknown) => { state.framebuffer = framebuffer; };
      if (name === "framebufferTexture2D") return (_target: number, attachment: number, _type: number, texture: unknown) => {
        if (attachment === constant("COLOR_ATTACHMENT0")) attachments.set(state.framebuffer, texture);
      };
      if (name === "activeTexture") return (unit: number) => { state.activeTexture = unit; };
      if (name === "bindTexture") return (_target: number, texture: unknown) => {
        state.textures.set(state.activeTexture - constant("TEXTURE0"), texture);
      };
      if (name === "texImage2D") return (_target: number, _level: number, format: number) => {
        textureFormats.set(state.textures.get(state.activeTexture - constant("TEXTURE0")), format);
      };
      if (name === "texStorage2D") return (_target: number, _levels: number, format: number) => {
        textureFormats.set(state.textures.get(state.activeTexture - constant("TEXTURE0")), format);
      };
      if (name === "createShader" || name === "createProgram") return object;
      if (name === "shaderSource") return (shader: unknown, source: string) => { shaderSources.set(shader, source); };
      if (name === "attachShader") return (program: unknown, shader: unknown) => {
        programShaders.set(program, [...(programShaders.get(program) ?? []), shader]);
      };
      if (name === "getShaderParameter") return () => true;
      if (name === "getProgramParameter") return (program: unknown, parameter: number) => {
        if (parameter === constant("LINK_STATUS")) return true;
        if (parameter === constant("ACTIVE_UNIFORMS")) return reflectedUniforms(program).length;
        if (parameter === constant("ACTIVE_ATTRIBUTES")) return programSource(program).includes("// a3d.output") ? 1 : 0;
        return 0;
      };
      if (name === "getActiveUniform") return (program: unknown, index: number) => reflectedUniforms(program)[index] ?? null;
      if (name === "getActiveAttrib") return (_program: unknown, index: number) => index === 0 ? { name: "a_position", type: constant("FLOAT_VEC3"), size: 1 } : null;
      if (name === "getAttribLocation") return () => 0;
      if (name === "getUniformBlockIndex") return () => constant("INVALID_INDEX");
      if (name === "getUniformLocation") return (_program: unknown, uniform: string) => uniform;
      if (name === "uniform1i" || name === "uniform1f") return (uniform: string, scalar: number) => {
        const values = programUniforms.get(state.currentProgram) ?? new Map<string, number>();
        values.set(uniform, scalar);
        programUniforms.set(state.currentProgram, values);
      };
      if (name === "drawArrays" || name === "drawArraysInstanced" || name === "drawElements" || name === "drawElementsInstanced") return recordDraw;
      if (name === "checkFramebufferStatus") return () => constant("FRAMEBUFFER_COMPLETE");
      if (name === "getExtension") return (extension: string) => extension === "EXT_color_buffer_float" ? {} : null;
      if (name === "fenceSync") return () => null;
      if (name === "isContextLost") return () => false;
      if (/^[A-Z0-9_]+$/.test(name)) return constant(name);
      if (name.startsWith("create")) return object;
      return Reflect.get(target, property) ?? (() => undefined);
    },
    set(target, property, next) {
      if (property === "drawingBufferColorSpace") {
        if (next === "display-p3" && !acceptsP3) return true;
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
  setRendererQrFlags(leaseBacking ? flags : { values: {}, on: () => false }, device);
  const host = webgl2DeviceHost(device)!;
  const source = device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: false });
  const scopeId = {};
  const frame = (frameId: number) => ({ source: {}, items: [], scopeId, viewId: "main", frameId,
    sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 10, orthographic: false } } });
  const pipeline = (options: Partial<PostPipelineOptions> = {}): PostPipelineOptions => ({
    antiAliasing: "off", depthRange: { near: 0.1, far: 10, projection: "perspective" },
    exposure: 1, toneMapping: "linear", dither: false, ...options
  });
  const run = (options: Partial<PostPipelineOptions>, frameId: number, hooks: typeof postV2 = postV2, outputTarget?: RenderTarget): void => {
    device.beginFrame(8, 8);
    try {
      executePostGraphWebGL2(host, source, { v2: hooks, pipeline: pipeline(options),
        passes: [{ name: "tone-mapping", options: { operator: "linear", exposure: 1 } }],
        frameContext: frame(frameId), ...(outputTarget ? { outputTarget } : {}) });
    } finally { device.endFrame(); }
  };
  return { device, gl, host, source, state, textureFormats, constant, run };
}

const outputDraw = (draws: readonly RecordedDraw[]): RecordedDraw | undefined =>
  draws.find(draw => draw.source.includes("// a3d.output") && draw.framebuffer !== null);
const effectDraw = (draws: readonly RecordedDraw[], kind: number): RecordedDraw | undefined =>
  draws.find(draw => draw.uniforms.get("u_kind") === kind);
const finalDraw = (draws: readonly RecordedDraw[]): RecordedDraw | undefined =>
  draws.filter(draw => draw.framebuffer === null).at(-1);
const afterimage = [{ kind: "afterimage", decay: 0.8 }] as const;
const pixelation = [{ kind: "pixelation", size: 2 }] as const;
const flags: QrFlags = { values: { A3D_QR_TIERS: true }, on: name => name === "A3D_QR_TIERS" };

afterEach(() => { vi.restoreAllMocks(); });

describe("WebGL P3 encoded display tails", () => {
  it.each([
    ["pixelation", { kind: "pixelation", size: 3 } as const, 1],
    ["glitch", { kind: "glitch", intensity: 0.2, seed: 7 } as const, 4],
    ["afterimage", { kind: "afterimage", decay: 0.8 } as const, 7]
  ] as const)("binds the actual leased P3 output through %s and then to the canvas", (_name, effect, kind) => {
    const f = fixture();
    try {
      f.run({ outputColorSpace: "display-p3", nativeEffects: [effect] }, 1);
      const output = outputDraw(f.state.draws), native = effectDraw(f.state.draws, kind), final = finalDraw(f.state.draws);
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "display-p3" });
      expect(output?.source).toContain("#define OUTPUT_DISPLAY_P3");
      expect(output?.uniforms.get("u_dither")).toBe(0);
      expect(output?.attachment).toBeTruthy();
      expect(f.textureFormats.get(output!.attachment)).toBe(f.constant("RGBA"));
      expect(f.textureFormats.get(output!.attachment)).not.toBe(f.constant("SRGB8_ALPHA8"));
      expect(native?.bindings.get(0)).toBe(output?.attachment);
      expect(native?.attachment).toBeTruthy();
      expect(final?.bindings.get(0)).toBe(native?.attachment);
      expect(final?.colorSpace).toBe("display-p3");
      expect(final?.uniforms.get("u_ditherEnabled")).toBe(0);
    } finally { f.device.dispose(); }
  });

  it.each([
    ["opaque", 1, false], ["straight", 0, true], ["premultiplied", 2, true]
  ] as const)("keeps scratch alpha unassociated and applies %s association once at presentation", (mode, finalMode, preservesAlpha) => {
    const f = fixture(mode);
    try {
      // Mocked HDR input warrants this synthetic contract; pixelation runs after OUT.
      f.run({ outputColorSpace: "display-p3", alphaMode: mode, nativeEffects: pixelation,
        ...(preservesAlpha ? { inputAlphaMode: "premultiplied" as const } : {}) }, 1);
      const output = outputDraw(f.state.draws), final = finalDraw(f.state.draws);
      expect(output?.source.includes("#define OUTPUT_ALPHA_PRESERVE")).toBe(preservesAlpha);
      expect(output?.source).not.toContain("#define OUTPUT_ALPHA_PREMULTIPLIED");
      expect(final?.uniforms.get("u_outputAlphaMode")).toBe(finalMode);
      expect(final?.colorSpace).toBe("display-p3");
    } finally { f.device.dispose(); }
  });

  it("reaches OUT from a caller-supplied renderer post pipeline declaration", async () => {
    const f = fixture("straight");
    const pipeline: PostPipelineOptions = {
      antiAliasing: "off", depthRange: { near: 0.1, far: 10, projection: "perspective" },
      exposure: 1, toneMapping: "linear", dither: false, outputColorSpace: "display-p3",
      alphaMode: "straight", inputAlphaMode: "premultiplied"
    };
    const post = new RendererPostprocessPipeline({ device: f.device, width: 8, height: 8 } as never);
    f.device.beginFrame(8, 8);
    try {
      await post.executePostprocessAsync({ v2: true, toneMapping: false, pipeline }, [f.source]);
      const shader = finalDraw(f.state.draws)?.source;
      expect(shader).toContain("#define OUTPUT_ALPHA_PRESERVE");
      expect(shader).toContain("a3dUnassociateScene(scene)");
    } finally { f.device.endFrame(); f.device.dispose(); }
  });

  it("accepts a caller declaration through Renderer.renderAsync on the WebGL2 v2 route", async () => {
    const f = fixture("straight");
    const renderer = new Renderer(f.device, {
      width: 8, height: 8, clearColor: [0, 0, 0, 0], shaderLibrary: createDefaultShaderLibrary(),
      qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: false, A3D_QR_CORE_OUTPUT: false })
    }, new TemporalHistory());
    const undeclared: PostPipelineOptions = {
      antiAliasing: "off", depthRange: { near: 0.1, far: 10, projection: "perspective" },
      exposure: 1, toneMapping: "linear", dither: false, outputColorSpace: "srgb",
      alphaMode: "straight"
    };
    const pipeline: PostPipelineOptions = { ...undeclared, inputAlphaMode: "premultiplied" };
    const source = { renderItems: [], shadow: { enabled: false } };
    const postprocess = { v2: true, targetFormat: "rgba16f", sampleCount: 1 } as const;
    try {
      // A transparent-black clear, no geometry, and no HDR effects make the
      // caller's input warranty meaningful; this fake GL records commands only.
      await expect(renderer.renderAsync({ ...source, postprocess: { ...postprocess, pipeline: undeclared } }))
        .rejects.toMatchObject({ code: "OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE" });
      expect(f.state.draws).toHaveLength(0);
      await renderer.renderAsync({ ...source, postprocess: { ...postprocess, pipeline } });
      const shader = finalDraw(f.state.draws)?.source;
      expect(shader).toContain("#define OUTPUT_ALPHA_PRESERVE");
      expect(shader).toContain("a3dUnassociateScene(scene)");
    } finally { renderer.dispose(); }
  });

  it.each(["straight", "premultiplied"] as const)(
    "rejects missing or false OUT input declarations for %s without drawing", mode => {
      const f = fixture(mode);
      try {
        for (const inputAlphaMode of [undefined, "straight", "opaque", null, false]) {
          const expected = inputAlphaMode === undefined ? "OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE" : "OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED";
          expect(() => f.run({ outputColorSpace: "display-p3", alphaMode: mode, nativeEffects: pixelation,
            ...(inputAlphaMode === undefined ? {} : { inputAlphaMode: inputAlphaMode as never }) }, 1)).toThrow(expected);
          expect(f.state.draws).toHaveLength(0);
        }
      } finally { f.device.dispose(); }
    }
  );

  it("rejects an input declaration on opaque output but keeps undeclared opaque output", () => {
    const f = fixture();
    try {
      expect(() => f.run({ outputColorSpace: "display-p3", alphaMode: "opaque", inputAlphaMode: "premultiplied" }, 1))
        .toThrow("OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED");
      expect(f.state.draws).toHaveLength(0);
      f.run({ outputColorSpace: "display-p3", alphaMode: "opaque" }, 2);
      expect(finalDraw(f.state.draws)?.source).not.toContain("#define OUTPUT_ALPHA_PRESERVE");
    } finally { f.device.dispose(); }
  });

  it("does not silently fall back to the fused legacy path with an input declaration", () => {
    const f = fixture("straight");
    const pipeline: PostPipelineOptions = {
      antiAliasing: "off", depthRange: { near: 0.1, far: 10, projection: "perspective" },
      exposure: 1, toneMapping: "linear", dither: false, alphaMode: "straight", inputAlphaMode: "premultiplied"
    };
    f.device.beginFrame(8, 8);
    try {
      // No v2 module means there is no OutputPass on this route.
      let failure: unknown;
      try { executePostGraphWebGL2(f.host, f.source, { pipeline, passes: [] }); }
      catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(RenderDeviceError);
      expect(failure).toMatchObject({ code: "POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE" });
      expect(f.state.draws).toHaveLength(0);
    } finally { f.device.endFrame(); f.device.dispose(); }
  });

  it("does not treat the declaration as proof of a non-linear OUT input", () => {
    const f = fixture("straight");
    try {
      f.source.colorTexture.colorSpace = "srgb";
      expect(() => f.run({ outputColorSpace: "display-p3", alphaMode: "straight", inputAlphaMode: "premultiplied" }, 1))
        .toThrow("OUTPUT_INPUT_COLOR_SPACE_UNAVAILABLE");
      expect(f.state.draws).toHaveLength(0);
    } finally { f.device.dispose(); }
  });

  it.each([false, true])("honors the authored final dither setting %s without dithering twice", enabled => {
    const f = fixture();
    try {
      f.run({ outputColorSpace: "display-p3", dither: enabled, nativeEffects: pixelation }, 1);
      expect(outputDraw(f.state.draws)?.uniforms.get("u_dither")).toBe(0);
      expect(finalDraw(f.state.draws)?.uniforms.get("u_ditherEnabled")).toBe(enabled ? 1 : 0);
    } finally { f.device.dispose(); }
  });

  it("invalidates afterimage history across P3 and sRGB while retaining it within each gamut", () => {
    const f = fixture();
    try {
      f.run({ outputColorSpace: "display-p3", nativeEffects: afterimage }, 1);
      f.run({ outputColorSpace: "display-p3", nativeEffects: afterimage }, 2);
      f.run({ outputColorSpace: "srgb", nativeEffects: afterimage }, 3);
      f.run({ outputColorSpace: "srgb", nativeEffects: afterimage }, 4);
      f.run({ outputColorSpace: "display-p3", nativeEffects: afterimage }, 5);
      expect(f.state.draws.filter(draw => draw.uniforms.has("u_hasHistory")).map(draw => draw.uniforms.get("u_hasHistory")))
        .toEqual([0, 1, 0, 1, 0]);
    } finally { f.device.dispose(); }
  });

  it("rejects a same-frame gamut conflict and does not present the conflicting frame", () => {
    const f = fixture();
    try {
      f.run({ outputColorSpace: "display-p3", nativeEffects: afterimage }, 1);
      const screens = f.state.draws.filter(draw => draw.framebuffer === null).length;
      expect(() => f.run({ outputColorSpace: "srgb", nativeEffects: afterimage }, 1)).toThrow(/HISTORY.*CONFLICT/i);
      expect(f.state.draws.filter(draw => draw.framebuffer === null)).toHaveLength(screens);
    } finally { f.device.dispose(); }
  });

  it("does not promote an afterimage write when the final canvas draw fails", () => {
    const f = fixture();
    try {
      f.run({ outputColorSpace: "display-p3", nativeEffects: afterimage }, 1);
      f.state.failCanvasDraw = true;
      expect(() => f.run({ outputColorSpace: "display-p3", nativeEffects: afterimage }, 2)).toThrow("synthetic canvas draw failure");
      f.run({ outputColorSpace: "display-p3", nativeEffects: afterimage }, 3);
      expect(f.state.draws.filter(draw => draw.uniforms.has("u_hasHistory")).map(draw => draw.uniforms.get("u_hasHistory")))
        .toEqual([0, 1, 0]);
    } finally { f.device.dispose(); }
  });

  it("refuses a released scratch lease before a canvas draw and cannot revive it on reuse", () => {
    const f = fixture();
    let captured: PostTargetLease | undefined;
    const hooks: typeof postV2 = {
      ...postV2,
      acquireV2TargetLease(...args) {
        const lease = postV2.acquireV2TargetLease(...args);
        captured = lease;
        return lease;
      },
      runV2LdrTail(...args) {
        captured!.release();
        return postV2.runV2LdrTail(...args);
      }
    };
    try {
      expect(() => f.run({ outputColorSpace: "display-p3", nativeEffects: pixelation }, 1, hooks)).toThrow(/lease|surface|stale|released/i);
      expect(f.state.draws.filter(draw => draw.framebuffer === null)).toHaveLength(0);
      expect(captured).toBeDefined();
      expect(() => issueEncodedDisplaySurface(captured!, f.device, "opaque")).toThrow(/lease|surface|stale|released/i);
      f.run({ outputColorSpace: "display-p3", nativeEffects: pixelation }, 2);
      expect(finalDraw(f.state.draws)?.colorSpace).toBe("display-p3");
      expect(() => issueEncodedDisplaySurface(captured!, f.device, "opaque")).toThrow(/lease|surface|stale|released/i);
    } finally { f.device.dispose(); }
  });

  it("rejects reentrant color negotiation and direct canvas mutation before P3 presentation", () => {
    const f = fixture();
    const hooks: typeof postV2 = {
      ...postV2,
      runV2LdrTail(...args) {
        expect(() => f.device.negotiateOutputColorSpace("srgb")).toThrow(/being presented/i);
        (f.gl as WebGL2RenderingContext & { drawingBufferColorSpace: string }).drawingBufferColorSpace = "srgb";
        return postV2.runV2LdrTail(...args);
      }
    };
    try {
      expect(() => f.run({ outputColorSpace: "display-p3", nativeEffects: pixelation }, 1, hooks)).toThrow(/color space changed/i);
      expect(f.state.draws.filter(draw => draw.framebuffer === null)).toHaveLength(0);
    } finally { f.device.dispose(); }
  });

  const custom: PostPassDescriptor = { id: "test.display", owner: "prd03", flag: "A3D_QR_POST", insertAt: "after-tonemap", space: "display",
    inputs: ["color"], fragment: { glsl: "void main() {}" }, gpuOnly: true };
  it.each([
    ["FXAA", { antiAliasing: "fxaa" as const }],
    ["LUT", { lut: { source: "fixture.cube", status: "pending" } }],
    ["custom display pass", { customPasses: [custom] }],
    ["film grain", { filmGrain: { intensity: 0.1 } }],
    ["upscale", { renderScale: 0.75 }]
  ] as const)("keeps unsupported %s combinations on an honestly reported sRGB fallback", (_name, options) => {
    const f = fixture();
    try {
      f.run({ ...options, outputColorSpace: "display-p3", nativeEffects: pixelation }, 1);
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "srgb", fallbackReason: expect.any(String) });
      expect(finalDraw(f.state.draws)?.colorSpace).toBe("srgb");
      expect(outputDraw(f.state.draws)?.source).not.toContain("#define OUTPUT_DISPLAY_P3");
    } finally { f.device.dispose(); }
  });

  it("falls back for a borrowed mask without disposing the caller's texture", () => {
    const f = fixture();
    const mask = new Texture({ width: 1, height: 1, format: "rgba8", data: new Uint8Array([255, 255, 255, 255]) });
    try {
      f.run({ outputColorSpace: "display-p3", nativeEffects: [{ kind: "mask", texture: mask, invert: false, opacity: 1 }, ...pixelation] }, 1);
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "srgb" });
      expect(finalDraw(f.state.draws)?.colorSpace).toBe("srgb");
      expect(mask.disposed).toBe(false);
    } finally { mask.dispose(); f.device.dispose(); }
  });

  it("renders a supported tail in sRGB when the canvas silently ignores P3", () => {
    const f = fixture("opaque", false);
    try {
      f.run({ outputColorSpace: "display-p3", nativeEffects: pixelation }, 1);
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "srgb", fallbackReason: expect.any(String) });
      expect(finalDraw(f.state.draws)?.colorSpace).toBe("srgb");
      expect(outputDraw(f.state.draws)?.source).not.toContain("#define OUTPUT_DISPLAY_P3");
    } finally { f.device.dispose(); }
  });

  it("supports the admitted P3 tail with default flags and the default lease-capable pool", () => {
    const f = fixture("opaque", true, false);
    try {
      f.run({ outputColorSpace: "display-p3", nativeEffects: pixelation }, 1);
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "display-p3" });
      expect(finalDraw(f.state.draws)?.colorSpace).toBe("display-p3");
      expect(outputDraw(f.state.draws)?.source).toContain("#define OUTPUT_DISPLAY_P3");
    } finally { f.device.dispose(); }
  });

  it("keeps the sRGB fallback when the backing pool cannot prove explicit lease ownership", () => {
    const f = fixture();
    const targetOnly: RenderTargetPoolLike = {
      acquire({ samples, format, ...descriptor }) {
        return f.device.createRenderTarget({ ...descriptor, format: format as "rgba8" | "rgba16f" | "rgba32f", sampleCount: samples });
      },
      release(target) { target.dispose(); },
      trim() {}
    };
    const slot = vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => targetOnly);
    try {
      f.run({ outputColorSpace: "display-p3", nativeEffects: pixelation }, 1);
      expect(f.device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "srgb", fallbackReason: expect.any(String) });
      expect(finalDraw(f.state.draws)?.colorSpace).toBe("srgb");
      expect(outputDraw(f.state.draws)?.source).not.toContain("#define OUTPUT_DISPLAY_P3");
    } finally { f.device.dispose(); slot.mockRestore(); }
  });

  it("does not draw a P3 tail when the authored alpha mode disagrees with the canvas", () => {
    const f = fixture("opaque");
    try {
      expect(() => f.run({ outputColorSpace: "display-p3", alphaMode: "premultiplied", nativeEffects: pixelation }, 1))
        .toThrow(/alpha/i);
      expect(f.state.draws.filter(draw => draw.framebuffer === null)).toHaveLength(0);
    } finally { f.device.dispose(); }
  });

  it("keeps a public offscreen P3 request unavailable before canvas mutation or drawing", () => {
    const f = fixture();
    const target = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false });
    try {
      const before = f.state.draws.length;
      expect(() => f.run({ outputColorSpace: "display-p3", nativeEffects: pixelation }, 1, postV2, target)).toThrow(/display-p3/i);
      expect(f.state.draws).toHaveLength(before);
      expect(f.state.colorSpace).toBe("srgb");
    } finally { target.dispose(); f.device.dispose(); }
  });
});

describe("internal encoded output write ownership", () => {
  const outputOptions: OutputPassOptions = { toneMapping: "linear", exposure: 1, dithering: false,
    backgroundCoverage: false, fullCoverage: true, outputColorSpace: "display-p3", alphaMode: "opaque" };
  const key = { width: 8, height: 8, format: "rgba8", samples: 1, depth: false } as const;

  it("rejects forged tokens, alpha mismatches and ordinary offscreen P3 before shader compilation", () => {
    const f = fixture();
    const pool = new PostResources(f.device, flags), pass = new OutputPass(f.device);
    f.device.beginFrame(8, 8);
    const scope = f.device.beginP3DisplayOutputScope();
    try {
      const lease = pool.acquireLease(key);
      const surface = issueEncodedDisplaySurface(lease, f.device, "opaque");
      const compile = vi.spyOn(f.device, "createShaderProgram");
      const forged = Object.freeze({}) as unknown as EncodedDisplaySurfaceLease;
      expect(() => executeOutputPassToEncodedDisplaySurface(pass, f.source, null, outputOptions, lease.target, forged)).toThrow(/surface|forged/i);
      expect(() => executeOutputPassToEncodedDisplaySurface(pass, f.source, null, { ...outputOptions, alphaMode: "straight" }, lease.target, surface)).toThrow(/alpha/i);
      expect(() => pass.execute(f.source, null, outputOptions, lease.target)).toThrow(/display-p3/i);
      expect(compile).not.toHaveBeenCalled();
      expect(f.state.draws).toHaveLength(0);
      lease.release();
    } finally { vi.restoreAllMocks(); scope.release(); pass.dispose(); pool.dispose(); f.device.endFrame(); f.device.dispose(); }
  });

  it("rejects a surface belonging to another device before any draw", () => {
    const f = fixture(), other = fixture();
    const pool = new PostResources(f.device, flags), otherPool = new PostResources(other.device, flags), pass = new OutputPass(f.device);
    f.device.beginFrame(8, 8);
    other.device.beginFrame(8, 8);
    const scope = f.device.beginP3DisplayOutputScope(), otherScope = other.device.beginP3DisplayOutputScope();
    try {
      const lease = pool.acquireLease(key), otherLease = otherPool.acquireLease(key);
      const foreign = issueEncodedDisplaySurface(otherLease, other.device, "opaque");
      const compile = vi.spyOn(f.device, "createShaderProgram");
      expect(() => executeOutputPassToEncodedDisplaySurface(pass, f.source, null, outputOptions, lease.target, foreign)).toThrow(/surface|foreign/i);
      expect(compile).not.toHaveBeenCalled();
      expect(f.state.draws).toHaveLength(0);
      lease.release(); otherLease.release();
    } finally {
      vi.restoreAllMocks(); scope.release(); otherScope.release(); pass.dispose(); pool.dispose(); otherPool.dispose();
      f.device.endFrame(); other.device.endFrame(); f.device.dispose(); other.device.dispose();
    }
  });

  it("invalidates a previously written surface if a later options getter fails", () => {
    const f = fixture();
    const pool = new PostResources(f.device, flags), pass = new OutputPass(f.device);
    f.device.beginFrame(8, 8);
    const scope = f.device.beginP3DisplayOutputScope();
    try {
      const lease = pool.acquireLease(key);
      const surface = issueEncodedDisplaySurface(lease, f.device, "opaque");
      executeOutputPassToEncodedDisplaySurface(pass, f.source, null, outputOptions, lease.target, surface);
      expect(() => assertEncodedDisplaySurfaceWritten(surface, f.device, lease.target)).not.toThrow();
      const before = f.state.draws.length;
      const failing = { ...outputOptions, get toneMapping(): never { throw new Error("tone getter failed"); } };
      expect(() => executeOutputPassToEncodedDisplaySurface(pass, f.source, null, failing, lease.target, surface)).toThrow("tone getter failed");
      expect(f.state.draws).toHaveLength(before);
      expect(() => assertEncodedDisplaySurfaceWritten(surface, f.device, lease.target)).toThrow(/surface|written|unreadable/i);
      lease.release();
    } finally { scope.release(); pass.dispose(); pool.dispose(); f.device.endFrame(); f.device.dispose(); }
  });

  it("rejects a nested writer and feedback from the encoded attachment", () => {
    const f = fixture();
    const pool = new PostResources(f.device, flags), pass = new OutputPass(f.device);
    f.device.beginFrame(8, 8);
    const scope = f.device.beginP3DisplayOutputScope();
    try {
      const lease = pool.acquireLease(key);
      const surface = issueEncodedDisplaySurface(lease, f.device, "opaque");
      const draw = f.device.draw.bind(f.device);
      let nestedAttempted = false;
      vi.spyOn(f.device, "draw").mockImplementation(command => {
        if (!nestedAttempted) {
          nestedAttempted = true;
          expect(() => executeOutputPassToEncodedDisplaySurface(pass, f.source, null, outputOptions, lease.target, surface)).toThrow(/write|surface|busy/i);
        }
        return draw(command);
      });
      executeOutputPassToEncodedDisplaySurface(pass, f.source, null, outputOptions, lease.target, surface);
      expect(nestedAttempted).toBe(true);
      expect(() => assertEncodedDisplaySurfaceWritten(surface, f.device, lease.target)).not.toThrow();
      const before = f.state.draws.length;
      let failure: unknown;
      try { executeOutputPassToEncodedDisplaySurface(pass, lease.target, null, outputOptions, lease.target, surface); }
      catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(RenderDeviceError);
      expect(failure).toMatchObject({
        code: "OUTPUT_ATTACHMENT_FEEDBACK",
        message: "A draw cannot sample a texture attached for writing in the same pass"
      });
      expect(f.state.draws).toHaveLength(before);
      expect(() => assertEncodedDisplaySurfaceWritten(surface, f.device, lease.target)).toThrow(/surface|written|unreadable/i);
      lease.release();
    } finally { scope.release(); pass.dispose(); pool.dispose(); f.device.endFrame(); f.device.dispose(); }
  });

  it("restores the preceding target if a target bind throws after changing state", () => {
    const f = fixture();
    const pool = new PostResources(f.device, flags), pass = new OutputPass(f.device);
    const previous = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false });
    f.device.beginFrame(8, 8);
    const scope = f.device.beginP3DisplayOutputScope();
    try {
      const lease = pool.acquireLease(key);
      const surface = issueEncodedDisplaySurface(lease, f.device, "opaque");
      f.device.setRenderTarget(previous);
      const setTarget = f.device.setRenderTarget.bind(f.device);
      vi.spyOn(f.device, "setRenderTarget").mockImplementation(target => {
        setTarget(target);
        if (target === lease.target) throw new Error("bind failed after state change");
      });
      expect(() => executeOutputPassToEncodedDisplaySurface(pass, f.source, null, outputOptions, lease.target, surface))
        .toThrow("bind failed after state change");
      expect(f.device.getRenderTarget()).toBe(previous);
      expect(() => assertEncodedDisplaySurfaceWritten(surface, f.device, lease.target)).toThrow(/surface|written|unreadable/i);
      lease.release();
    } finally { vi.restoreAllMocks(); scope.release(); pass.dispose(); pool.dispose(); previous.dispose(); f.device.endFrame(); f.device.dispose(); }
  });

  it("retains both binding and restoration failures and leaves the surface unreadable", () => {
    const f = fixture();
    const pool = new PostResources(f.device, flags), pass = new OutputPass(f.device);
    const previous = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false });
    f.device.beginFrame(8, 8);
    const scope = f.device.beginP3DisplayOutputScope();
    try {
      const lease = pool.acquireLease(key);
      const surface = issueEncodedDisplaySurface(lease, f.device, "opaque");
      f.device.setRenderTarget(previous);
      const setTarget = f.device.setRenderTarget.bind(f.device);
      vi.spyOn(f.device, "setRenderTarget").mockImplementation(target => {
        setTarget(target);
        if (target === lease.target) throw new Error("bind failed");
        if (target === previous) throw new Error("restore failed");
      });
      let caught: unknown;
      try { executeOutputPassToEncodedDisplaySurface(pass, f.source, null, outputOptions, lease.target, surface); }
      catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(AggregateError);
      const errors = (caught as AggregateError).errors.map(String).join(" | ");
      expect(errors).toContain("bind failed");
      expect(errors).toContain("restore failed");
      expect(() => assertEncodedDisplaySurfaceWritten(surface, f.device, lease.target)).toThrow(/surface|written|unreadable/i);
      lease.release();
    } finally { vi.restoreAllMocks(); scope.release(); pass.dispose(); pool.dispose(); previous.dispose(); f.device.endFrame(); f.device.dispose(); }
  });

  it("leaves a surface unreadable when restoration fails after its draw", () => {
    const f = fixture();
    const pool = new PostResources(f.device, flags), pass = new OutputPass(f.device);
    const previous = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false });
    f.device.beginFrame(8, 8);
    const scope = f.device.beginP3DisplayOutputScope();
    try {
      const lease = pool.acquireLease(key);
      const surface = issueEncodedDisplaySurface(lease, f.device, "opaque");
      f.device.setRenderTarget(previous);
      const setTarget = f.device.setRenderTarget.bind(f.device);
      vi.spyOn(f.device, "setRenderTarget").mockImplementation(target => {
        setTarget(target);
        if (target === previous) throw new Error("restore failed");
      });
      expect(() => executeOutputPassToEncodedDisplaySurface(pass, f.source, null, outputOptions, lease.target, surface)).toThrow("restore failed");
      expect(() => assertEncodedDisplaySurfaceWritten(surface, f.device, lease.target)).toThrow(/surface|written|unreadable/i);
      lease.release();
    } finally { vi.restoreAllMocks(); scope.release(); pass.dispose(); pool.dispose(); previous.dispose(); f.device.endFrame(); f.device.dispose(); }
  });
});
