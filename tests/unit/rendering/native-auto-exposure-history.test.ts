import { describe, expect, it } from "vitest";
import { MockRenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { executePostGraphWebGL2 } from "../../../packages/rendering/src/webgl2/LegacyPost";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import * as v2 from "../../../packages/rendering/src/post/v2Entry";
import { adaptEv } from "../../../packages/rendering/src/post/shaders/exposure.glsl";
import type { PostPipelineOptions } from "../../../packages/rendering/src/contracts/post";
import type { PostPassDescriptor } from "../../../packages/rendering/src/contracts/post";
import { postDiagnostics, type PostDiagnosticToken } from "../../../packages/rendering/src/renderer/PostDiagnosticsScope";

const pipeline = { antiAliasing: "off", autoExposure: {}, depthRange: { near: .1, far: 100, projection: "perspective" },
  exposure: 1, toneMapping: "aces", dither: false } as PostPipelineOptions;
const adaptOptions = { dt: 1 / 60, minEv: -4, maxEv: 4, speedUp: 3, speedDown: 1, compensationEv: 0 };

/** A GL-shaped source mock evaluates only the 1×1 EV adaptation using its actual input/output bindings. */
function fixture() {
  const device = new MockRenderDevice();
  const originalCreate = device.createRenderTarget.bind(device);
  const targets: RenderTarget[] = [];
  const outputByFramebuffer = new Map<unknown, object>();
  const shaderSources: string[] = [];
  const ev = new Map<object, number>();
  const draws: { hasPrevious: boolean; previous: object; output: object; value: number }[] = [];
  let activeUnit = 0, currentTarget: unknown, previousTexture: object, luminance = .18, failAdapt = false, failPresent = false;
  let lastPresented: RenderTarget | undefined;
  let uniforms: Record<string, number> = {};
  device.createRenderTarget = descriptor => {
    const framebuffer = {}, colorHandle = {};
    const target = Object.assign(originalCreate(descriptor), { framebuffer, colorHandle, depthTextureHandle: null });
    targets.push(target); outputByFramebuffer.set(framebuffer, colorHandle); return target;
  };
  const methods: Record<string, (...args: any[]) => unknown> = {
    createVertexArray: () => ({}), createTexture: () => ({}), createShader: () => ({}), createProgram: () => ({}),
    getShaderParameter: () => true, getProgramParameter: () => true,
    shaderSource: (_shader, source) => { shaderSources.push(source); },
    getUniformLocation: (_program, name) => name,
    bindFramebuffer: (_target, framebuffer) => { currentTarget = framebuffer; },
    activeTexture: unit => { activeUnit = unit - 100; },
    bindTexture: (_target, texture) => { if (activeUnit === 0 && texture) previousTexture = texture; },
    uniform1i: (name, value) => { uniforms[name] = value; },
    uniform1f: (name, value) => { uniforms[name] = value; },
    drawArrays: () => {
      if (uniforms.u_hasPrev !== undefined) {
        if (failAdapt) throw new Error("adapt failed");
        const output = outputByFramebuffer.get(currentTarget)!;
        const hasPrevious = uniforms.u_hasPrev === 1;
        const value = adaptEv(ev.get(previousTexture) ?? 0, Math.log2(luminance), { hasPrev: hasPrevious,
          dt: uniforms.u_dt!, minEv: uniforms.u_minEv!, maxEv: uniforms.u_maxEv!,
          speedUp: uniforms.u_speedUp!, speedDown: uniforms.u_speedDown!, compensationEv: uniforms.u_compensationEv! });
        ev.set(output, value); draws.push({ hasPrevious, previous: previousTexture, output, value });
      }
      uniforms = {};
    }
  };
  const gl = new Proxy(methods, { get(target, prop: string) {
    if (prop in target) return target[prop];
    if (prop === "TEXTURE0") return 100;
    return /^[A-Z][A-Z0-9_]*$/.test(prop) ? 1 : () => undefined;
  } }) as unknown as WebGL2RenderingContext;
  const host = { gl, device, stateCache: { invalidate() {} }, resolveMultisampleTarget() {}, lifecycle: { bindOutput() {} },
    post: { presentLdrPostprocess(input: RenderTarget) { lastPresented = input; if (failPresent) throw new Error("present failed"); } } } as unknown as WebGL2DeviceHost;
  const source = (size = 4) => device.createRenderTarget({ width: size, height: size, format: "rgba16f" });
  const context = (scopeId: object, viewId: string, frameId: number, cameraCut = false) => ({ scopeId, viewId, frameId, cameraCut,
    source: {}, items: [], sceneDepth: { texture: null, available: false, linearize: { near: .1, far: 100, orthographic: false } } });
  const run = (scopeId: object, viewId: string, frameId: number, light: number, size = 4, cameraCut = false) => {
    luminance = light;
    const input = source(size);
    try {
      const result = v2.runV2HdrStages(host, input, pipeline, null, undefined, context(scopeId, viewId, frameId, cameraCut));
      if (result.target !== input) v2.releaseV2Target(host, result.target);
      return draws.at(-1)!;
    } finally { input.dispose(); }
  };
  return { device, host, draws, targets, shaderSources, source, context, run,
    lastPresented: () => lastPresented,
    setLight: (value: number) => { luminance = value; },
    setAdaptFailure: (value: boolean) => { failAdapt = value; },
    setPresentFailure: (value: boolean) => { failPresent = value; },
    dispose: () => { v2.disposeNativePostEffects(host); device.dispose(); } };
}

describe("auto-exposure history ownership", () => {
  it("adapts numerically from each renderer/view's own prior frame and resets only the changed view", () => {
    const f = fixture(), appA = {}, appB = {};
    try {
      const a1 = f.run(appA, "left", 1, .018), b1 = f.run(appB, "left", 1, 1.8);
      const right1 = f.run(appA, "right", 1, .18);
      expect(a1.value).toBeCloseTo(adaptEv(0, Math.log2(.018), { ...adaptOptions, hasPrev: false }), 10);
      expect(b1.value).toBeCloseTo(adaptEv(0, Math.log2(1.8), { ...adaptOptions, hasPrev: false }), 10);
      expect(right1.value).toBeCloseTo(0, 10);
      const a2 = f.run(appA, "left", 2, 1.8), a2Again = f.run(appA, "left", 2, 1.8);
      const b2 = f.run(appB, "left", 2, .018);
      expect(a2.previous).toBe(a1.output); expect(a2Again.previous).toBe(a1.output); expect(a2Again.output).toBe(a2.output);
      expect(b2.previous).toBe(b1.output); expect(b2.previous).not.toBe(a2.previous);
      expect(a2.value).toBeCloseTo(adaptEv(a1.value, Math.log2(1.8), { ...adaptOptions, hasPrev: true }), 10);
      expect(b2.value).toBeCloseTo(adaptEv(b1.value, Math.log2(.018), { ...adaptOptions, hasPrev: true }), 10);
      expect(a2Again.value).toBeCloseTo(a2.value, 10);
      const cut = f.run(appA, "left", 3, .18, 4, true);
      expect(cut.hasPrevious).toBe(false);
      const oldA = f.targets.find(target => (target as unknown as { colorHandle: object }).colorHandle === a1.output)!;
      const oldRight = f.targets.find(target => (target as unknown as { colorHandle: object }).colorHandle === right1.output)!;
      expect((oldA as unknown as { disposed: boolean }).disposed).toBe(true);
      expect((oldRight as unknown as { disposed: boolean }).disposed).toBe(false);
      const resized = f.run(appB, "left", 3, .18, 8);
      expect(resized.hasPrevious).toBe(false);
      v2.releaseNativePostEffectView(f.host, appA, "left");
      expect(f.run(appA, "left", 4, .018).hasPrevious).toBe(false);
      expect(f.run(appA, "right", 2, .018).previous).toBe(right1.output);
    } finally { f.dispose(); }
  });

  it("reseeds after a failed adapt draw or a later failed presentation", () => {
    const f = fixture(), app = {};
    try {
      f.run(app, "view", 1, .018);
      f.setAdaptFailure(true);
      expect(() => f.run(app, "view", 2, 1.8)).toThrow("adapt failed");
      f.setAdaptFailure(false);
      expect(f.run(app, "view", 3, 1.8).hasPrevious).toBe(false);
      const input = f.source(), frame = (frameId: number) => ({ pipeline, v2, passes: [{ name: "fxaa" as const, options: {} }], frameContext: f.context(app, "present", frameId) });
      f.setLight(.018); executePostGraphWebGL2(f.host, input, frame(1));
      f.setLight(1.8); f.setPresentFailure(true);
      expect(() => executePostGraphWebGL2(f.host, input, frame(2))).toThrow("present failed");
      const returned = v2.acquireV2Target(f.host, { width: 4, height: 4, format: "rgba16f" });
      expect(returned).toBe(f.lastPresented());
      v2.releaseV2Target(f.host, returned);
      f.setPresentFailure(false); executePostGraphWebGL2(f.host, input, frame(3));
      expect(f.draws.slice(-3).map(draw => draw.hasPrevious)).toEqual([false, true, false]);
      input.dispose();
    } finally { f.dispose(); }
  });

  it.each([false, true])("retires exposure history after the effect is disabled (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const released: (string | number)[] = [];
    renderer.device.releaseNativePostEffectView = (_scope, view) => { released.push(view); };
    renderer.device.presentLdrPostprocess = () => undefined;
    const render = async (active: boolean) => {
      const source = { cameraPolicy: "identity" as const, renderItems: [], postprocess: { v2: true,
        toneMapping: { operator: "linear" as const }, pipeline: active ? { autoExposure: {} } : {} } };
      if (asynchronous) await renderer.renderAsync(source); else renderer.render(source);
    };
    try {
      await render(true); await render(true); expect(released).toEqual([]);
      await render(false); expect(released).toEqual(["single"]);
      await render(true); expect(released).toEqual(["single"]);
    } finally { renderer.dispose(); }
  });

  it("shares custom-pass data only within the exact renderer, view and frame", () => {
    const f = fixture(), appA = {}, appB = {};
    const observed: { phase: string; count: unknown; frame: number; time: number }[] = [];
    const pass = (id: string, insertAt: "before-tonemap" | "after-tonemap", space: "linear-hdr" | "display"): PostPassDescriptor => ({
      id, insertAt, space, owner: "prd03", flag: "A3D_QR_POST", inputs: ["color"], gpuOnly: true, fragment: { glsl: "void main() {}" },
      uniforms: context => {
        const count = context.blackboard.get("count") ?? 0;
        observed.push({ phase: id, count, frame: context.frameIndex, time: context.timeSeconds });
        context.blackboard.set("count", (count as number) + 1);
        return {};
      }
    });
    const customPipeline = { ...pipeline, autoExposure: false, customPasses: [pass("before", "before-tonemap", "linear-hdr"), pass("after", "after-tonemap", "display")] };
    const render = (scope: object, view: string, frameId: number, token?: PostDiagnosticToken) => {
      const input = f.source(), ldr = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8" });
      const context = { ...f.context(scope, view, frameId), timeSeconds: frameId / 2, ...(token ? { diagnosticToken: token } : {}) };
      try {
        const result = v2.runV2HdrStages(f.host, input, customPipeline, null, undefined, context);
        v2.runV2LdrTail(f.host, ldr, customPipeline, undefined, context);
        if (result.target !== input) v2.releaseV2Target(f.host, result.target);
      } finally { input.dispose(); ldr.dispose(); }
    };
    const a7 = postDiagnostics.begin(appA, "left", 7), b7 = postDiagnostics.begin(appB, "left", 7);
    try {
      render(appA, "left", 7, a7); render(appA, "left", 7, a7); render(appB, "left", 7, b7);
      const a8 = postDiagnostics.begin(appA, "left", 8);
      render(appA, "left", 8, a8); render(appA, "left", 7, a7); render(appA, "left", 8, a8);
      expect(observed.map(entry => entry.count)).toEqual([0, 1, 2, 3, 0, 1, 0, 1, 4, 5, 2, 3]);
      expect(observed.map(entry => entry.frame)).toEqual([7, 7, 7, 7, 7, 7, 8, 8, 7, 7, 8, 8]);
      for (const entry of observed) expect(entry.time).toBe(entry.frame / 2);
      observed.length = 0;
      render(appA, "right", 1); render(appA, "right", 1);
      v2.releaseNativePostEffectView(f.host, appA, "right");
      render(appA, "right", 1);
      expect(observed.map(entry => entry.count)).toEqual([0, 1, 2, 3, 0, 1]);
    } finally { postDiagnostics.resetScope(appA); postDiagnostics.resetScope(appB); f.dispose(); }
  });

  it("recompiles a recycled custom-pass name when its shader source changes", () => {
    const f = fixture(), scope = {}, input = f.source();
    const pass = (marker: string): PostPassDescriptor => ({ id: "reused", owner: "prd03", flag: "A3D_QR_POST",
      insertAt: "before-tonemap", space: "linear-hdr", inputs: ["color"], gpuOnly: true,
      fragment: { glsl: `// ${marker}\nvoid main() {}` } });
    try {
      for (const [frameId, marker] of [[1, "first-shader"], [2, "replacement-shader"]] as const) {
        const result = v2.runV2HdrStages(f.host, input, { ...pipeline, autoExposure: false, customPasses: [pass(marker)] }, null, undefined, f.context(scope, "v", frameId));
        if (result.target !== input) v2.releaseV2Target(f.host, result.target);
      }
      expect(f.shaderSources.some(source => source.includes("first-shader"))).toBe(true);
      expect(f.shaderSources.some(source => source.includes("replacement-shader"))).toBe(true);
    } finally { input.dispose(); f.dispose(); }
  });
});
