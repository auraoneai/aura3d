import { describe, expect, it, vi } from "vitest";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { postDiagnostics } from "../../../packages/rendering/src/renderer/PostDiagnosticsScope";
import { postSkippedReasons, postStagesRan } from "../../../packages/rendering/src/renderer/postSkipped";
import { registerPostPass, type PostInsertAt } from "../../../packages/rendering/src/contracts/post";

interface Entry { readonly binding: number; readonly resource: unknown; }
interface Group { readonly label: string; readonly entries: readonly Entry[]; readonly bytes?: Uint8Array; }
interface Layout { readonly label?: string; readonly entries: readonly Record<string, unknown>[]; }

async function fixture(options: { readonly float32Filterable?: boolean; readonly explicitLayouts?: boolean; readonly fence?: boolean } = {}) {
  let finish!: () => void;
  const fence = new Promise<void>(resolve => { finish = resolve; });
  let lose!: (info: { readonly reason: string }) => void;
  const lost = new Promise<{ readonly reason: string }>(resolve => { lose = resolve; });
  const buffers: { readonly label: string; readonly size: number; readonly destroy: ReturnType<typeof vi.fn> }[] = [];
  const textures: { readonly label: string; readonly destroy: ReturnType<typeof vi.fn>; createView(): unknown }[] = [];
  const layouts: Layout[] = [];
  const groups: Group[] = [];
  const passes: string[] = [];
  const submissions: string[] = [];
  const events: string[] = [];
  const writes = new Map<object, Uint8Array>();
  const failure: { draw?: string; validation?: string; validationReject?: string } = {};
  let latestPass = "";
  const native = {
    features: new Set(options.float32Filterable ? ["float32-filterable"] : []),
    lost,
    queue: {
      writeBuffer(buffer: object, _offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data.slice(0)) : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
        writes.set(buffer, bytes); events.push("write");
      },
      submit(commands: readonly { label?: string }[]) { submissions.push(commands[0]?.label ?? ""); events.push("submit"); },
      ...(options.fence === false ? {} : { onSubmittedWorkDone: () => fence })
    },
    createBuffer({ label, size }: { label?: string; size: number }) {
      const buffer = { label: label ?? "", size, destroy: vi.fn() };
      buffers.push(buffer); return buffer;
    },
    createTexture({ label }: { label?: string }) {
      const handle = { label: label ?? "", destroy: vi.fn(), createView: () => ({ texture: handle }) };
      textures.push(handle); return handle;
    },
    createSampler: () => ({}),
    createShaderModule: (descriptor: unknown) => ({ descriptor }),
    ...(options.explicitLayouts === false ? {} : {
      createBindGroupLayout(descriptor: Layout) { layouts.push(descriptor); return descriptor; },
      createPipelineLayout(descriptor: { bindGroupLayouts: readonly Layout[] }) { return descriptor; }
    }),
    createRenderPipeline(descriptor: { layout: "auto" | { bindGroupLayouts: readonly Layout[] } }) {
      return { getBindGroupLayout(index: number) { return descriptor.layout === "auto" ? {} : descriptor.layout.bindGroupLayouts[index]; } };
    },
    createBindGroup(descriptor: { label?: string; entries: readonly Entry[] }) {
      const uniform = descriptor.entries.find(entry => entry.binding === 0)?.resource as { buffer?: object } | undefined;
      const bytes = uniform?.buffer && writes.get(uniform.buffer);
      groups.push({ label: descriptor.label ?? "", entries: descriptor.entries, ...(bytes ? { bytes: bytes.slice() } : {}) });
      return {};
    },
    createCommandEncoder(descriptor?: { label?: string }) {
      return {
        beginRenderPass(pass: { label?: string }) {
          latestPass = pass.label ?? ""; passes.push(latestPass);
          return { setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {
            if (failure.draw === latestPass) { failure.draw = undefined; throw new Error("injected presentation failure"); }
          }, end() {} };
        },
        finish: () => ({ label: descriptor?.label })
      };
    },
    pushErrorScope() {},
    popErrorScope() {
      if (failure.validation === latestPass) { failure.validation = undefined; return Promise.resolve({ message: "injected validation error" }); }
      if (failure.validationReject === latestPass) { failure.validationReject = undefined; return Promise.reject(new Error("injected validation rejection")); }
      return Promise.resolve(null);
    },
    destroy: vi.fn()
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
  const source = device.createRenderTarget({ width: 16, height: 8, format: "rgba16f", depth: false, label: "hdr-source" });
  const output = device.createRenderTarget({ width: 16, height: 8, format: "rgba8", depth: false, label: "ldr-output" });
  const params = () => {
    const bytes = groups.filter(group => group.label === "webgpu-exposure-adapt-bind").at(-1)?.bytes;
    if (!bytes) throw new Error("missing exposure adaptation uniforms");
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { delta: data.getFloat32(0, true), hasPrevious: data.getUint32(24, true) };
  };
  return { device, source, output, native, buffers, textures, layouts, groups, passes, submissions, events, failure, params, finish, lose };
}

describe("native WebGPU auto exposure device integration", () => {
  it("runs ordered unfilterable texture-load passes before tone and presentation", async () => {
    const f = await fixture();
    const scopeId = {}, diagnosticToken = postDiagnostics.begin(scopeId, "left", 1);
    f.device.presentLdrPostprocess(f.source, { outputTarget: f.output, autoExposure: {}, passes: [{ name: "tone-mapping", options: {} }],
      postFrameContext: { scopeId, viewId: "left", frameId: 1, timeSeconds: 10, diagnosticToken } });
    expect(f.passes.filter(name => name.startsWith("webgpu-exposure") || name === "webgpu-tone-pass" || name === "webgpu-post-present-pass")).toEqual([
      "webgpu-exposure-luma-pass", "webgpu-exposure-reduce-pass", "webgpu-exposure-reduce-pass", "webgpu-exposure-adapt-pass",
      "webgpu-exposure-mul-pass", "webgpu-tone-pass", "webgpu-post-present-pass"
    ]);
    const exposureGroups = f.groups.filter(group => group.label.startsWith("webgpu-exposure"));
    expect(exposureGroups.map(group => group.entries.map(entry => entry.binding))).toEqual([[0, 2], [0, 2], [0, 2], [0, 2, 3], [0, 2, 3]]);
    const exposureLayouts = f.layouts.filter(layout => layout.label?.startsWith("webgpu-exposure"));
    expect(exposureLayouts.length).toBeGreaterThan(0);
    for (const layout of exposureLayouts) {
      expect(layout.entries.map(entry => entry.binding)).toEqual(expect.arrayContaining([0, 2]));
      expect(layout.entries.some(entry => "sampler" in entry)).toBe(false);
      for (const entry of layout.entries.filter(item => item.binding !== 0)) expect(entry).toMatchObject({ visibility: 2, texture: { sampleType: "unfilterable-float", viewDimension: "2d" } });
    }
    expect(f.params()).toEqual({ delta: 0, hasPrevious: 0 });
    expect(postStagesRan(diagnosticToken)).toContain("S8:auto-exposure");
    expect(f.submissions.some(label => label.includes("clear"))).toBe(true);
    f.device.dispose(); f.finish();
  });

  it("isolates view histories and aborts a later failed presentation in the same frame", async () => {
    const f = await fixture(); const scopeId = {};
    const draw = (viewId: string, frameId: number) => {
      f.device.presentLdrPostprocess(f.source, { outputTarget: f.output, autoExposure: {}, passes: [],
        postFrameContext: { scopeId, viewId, frameId, timeSeconds: frameId * 0.25 } });
      return f.params();
    };
    expect(draw("failed", 1)).toEqual({ delta: 0, hasPrevious: 0 });
    expect(draw("other", 1)).toEqual({ delta: 0, hasPrevious: 0 });
    expect(draw("failed", 2)).toEqual({ delta: 0.25, hasPrevious: 1 });
    expect(draw("other", 2)).toEqual({ delta: 0.25, hasPrevious: 1 });
    f.failure.draw = "webgpu-post-present-pass";
    expect(() => draw("failed", 2)).toThrow("injected presentation failure");
    expect(draw("failed", 3)).toEqual({ delta: 0, hasPrevious: 0 });
    expect(draw("other", 3)).toEqual({ delta: 0.25, hasPrevious: 1 });
    f.device.releaseNativePostEffectView(scopeId, "other");
    expect(draw("other", 4)).toEqual({ delta: 0, hasPrevious: 0 });
    f.device.releaseNativePostEffectScope(scopeId);
    expect(draw("failed", 4)).toEqual({ delta: 0, hasPrevious: 0 });
    f.device.dispose(); f.finish();
  });

  it.each([false, true])("invalidates only the affected view after asynchronous post validation failures (rejected=%s)", async rejected => {
    const f = await fixture(); const scopeId = {};
    const draw = (viewId: string, frameId: number) => {
      f.device.presentLdrPostprocess(f.source, { outputTarget: f.output, autoExposure: {}, passes: [],
        postFrameContext: { scopeId, viewId, frameId, timeSeconds: frameId } });
      return f.params().hasPrevious;
    };
    expect(draw("failed", 1)).toBe(0); expect(draw("other", 1)).toBe(0);
    await f.device.drainWebGPUPostErrors();
    if (rejected) f.failure.validationReject = "webgpu-post-present-pass";
    else f.failure.validation = "webgpu-post-present-pass";
    expect(draw("failed", 2)).toBe(1);
    expect(await f.device.drainWebGPUPostErrors()).toEqual([expect.stringContaining(rejected ? "injected validation rejection" : "injected validation error")]);
    expect(draw("failed", 3)).toBe(0); expect(draw("other", 2)).toBe(1);
    f.device.dispose(); f.finish();
  });

  it("rejects invalid inputs and unsupported float32 filtering before submission", async () => {
    const f = await fixture(); const scopeId = {};
    const options = { outputTarget: f.output, autoExposure: {}, passes: [], postFrameContext: { scopeId, viewId: "main", frameId: 1, timeSeconds: 1 } };
    expect(() => f.device.presentLdrPostprocess(f.source, { ...options, postFrameContext: { ...options.postFrameContext, timeSeconds: NaN } })).toThrow();
    const rgba32 = f.device.createRenderTarget({ width: 16, height: 8, format: "rgba32f", depth: false });
    expect(() => f.device.presentLdrPostprocess(rgba32, options)).toThrow(/float32-filterable/i);
    expect(f.submissions).toEqual([]);
    f.device.dispose(); f.finish();
  });

  it("requires explicit texture-load layouts and reuses bounded uniform buffers", async () => {
    const missing = await fixture({ explicitLayouts: false });
    expect(() => missing.device.presentLdrPostprocess(missing.source, { outputTarget: missing.output, autoExposure: {}, passes: [],
      postFrameContext: { scopeId: {}, viewId: "main", frameId: 1, timeSeconds: 1 } })).toThrow(/layout/i);
    expect(missing.submissions.filter(label => label.startsWith("webgpu-exposure"))).toEqual([]);
    missing.device.dispose(); missing.finish();
    const f = await fixture(); const scopeId = {};
    for (let frameId = 1; frameId <= 3; frameId += 1) f.device.presentLdrPostprocess(f.source, { outputTarget: f.output, autoExposure: {}, passes: [],
      postFrameContext: { scopeId, viewId: "main", frameId, timeSeconds: frameId } });
    expect(f.buffers.filter(buffer => buffer.label.startsWith("webgpu-exposure")).length).toBeLessThanOrEqual(2);
    f.device.dispose(); f.finish();
  });

  it("fence-retires a queued post uniform after an unsubmitted presentation fails", async () => {
    const f = await fixture();
    f.failure.draw = "webgpu-post-present-pass";
    expect(() => f.device.presentLdrPostprocess(f.source, { outputTarget: f.output, passes: [] })).toThrow("injected presentation failure");
    const uniform = f.buffers.find(buffer => buffer.label === "webgpu-post-present-uniforms")!;
    expect(uniform).toBeDefined();
    expect(uniform.destroy).not.toHaveBeenCalled();
    f.finish(); await Promise.resolve(); await Promise.resolve();
    expect(uniform.destroy).toHaveBeenCalledOnce();
    f.device.dispose();
  });

  it("requires a queue fence before exposure allocates or submits work", async () => {
    const f = await fixture({ fence: false });
    expect(() => f.device.presentLdrPostprocess(f.source, { outputTarget: f.output, autoExposure: {}, passes: [],
      postFrameContext: { scopeId: {}, viewId: "main", frameId: 1, timeSeconds: 1 } })).toThrow(/fence/i);
    expect(f.submissions).toEqual([]);
    expect(f.textures.filter(texture => texture.label.startsWith("webgpu-exposure"))).toEqual([]);
    f.device.dispose(); f.finish();
  });

  it("continues retiring other resources if exposure cleanup throws", async () => {
    const f = await fixture();
    f.device.presentLdrPostprocess(f.source, { outputTarget: f.output, autoExposure: {}, passes: [],
      postFrameContext: { scopeId: {}, viewId: "main", frameId: 1, timeSeconds: 1 } });
    const internals = f.device as unknown as { webgpuAutoExposure: { dispose(): void } };
    const helper = internals.webgpuAutoExposure, dispose = helper.dispose.bind(helper);
    helper.dispose = () => { dispose(); throw new Error("injected cleanup failure"); };
    expect(() => f.device.dispose()).toThrow(/dispose WebGPU device resources/i);
    expect(f.device.disposed).toBe(true);
    expect(f.source.disposed).toBe(true);
    expect(f.output.disposed).toBe(true);
    expect(f.native.destroy).toHaveBeenCalledOnce();
    f.finish();
  });

  it("invalidates view histories and cached uniforms when the device is lost", async () => {
    const f = await fixture();
    f.device.presentLdrPostprocess(f.source, { outputTarget: f.output, autoExposure: {}, passes: [],
      postFrameContext: { scopeId: {}, viewId: "main", frameId: 1, timeSeconds: 1 } });
    const exposureTextures = f.textures.filter(texture => texture.label.startsWith("webgpu-exposure"));
    const exposureBuffers = f.buffers.filter(buffer => buffer.label.startsWith("webgpu-exposure"));
    expect(exposureTextures.length).toBeGreaterThan(0); expect(exposureBuffers.length).toBeGreaterThan(0);
    f.lose({ reason: "unknown" }); await Promise.resolve(); await Promise.resolve();
    expect(f.device.contextLost).toBe(true);
    expect(exposureTextures.every(texture => texture.destroy.mock.calls.length === 1)).toBe(true);
    expect(exposureBuffers.every(buffer => buffer.destroy.mock.calls.length === 1)).toBe(true);
    f.device.dispose(); f.finish();
  });

  it.each([false, true])("places custom HDR anchors around exposure and bloom (bloom=%s)", async bloom => {
    const f = await fixture();
    const anchors: readonly PostInsertAt[] = ["after-depth", "before-taa", "after-taa", "before-tonemap", "after-tonemap"];
    const unregister = anchors.map((anchor, order) => registerPostPass({ id: `exposure-order-${anchor}`, owner: "prd03", flag: "A3D_QR_POST", insertAt: anchor,
      space: anchor === "after-tonemap" ? "display" : "linear-hdr", inputs: ["color"], order, gpuOnly: true,
      fragment: { glsl: "void main() {}", wgsl: "@fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }" } }));
    try {
      f.device.presentLdrPostprocess(f.source, { outputTarget: f.output, autoExposure: {},
        passes: bloom ? [{ name: "bloom", options: {} }, { name: "tone-mapping", options: {} }] : [],
        postFrameContext: { scopeId: {}, viewId: "main", frameId: 1, timeSeconds: 1 } });
      const index = (label: string) => f.passes.findIndex(pass => pass === label);
      const before = anchors.slice(0, 3).map(anchor => index(`webgpu-custom:exposure-order-${anchor}-pass`));
      const exposure = index("webgpu-exposure-luma-pass");
      const preTone = index("webgpu-custom:exposure-order-before-tonemap-pass");
      const postTone = index("webgpu-custom:exposure-order-after-tonemap-pass");
      expect(before.every(position => position >= 0 && position < exposure)).toBe(true);
      expect(exposure).toBeLessThan(preTone);
      expect(preTone).toBeLessThan(postTone);
      if (bloom) {
        const bright = index("webgpu-bloom-bright-pass"), tone = index("webgpu-tone-pass");
        expect(exposure).toBeLessThan(bright);
        expect(bright).toBeLessThan(preTone);
        expect(preTone).toBeLessThan(tone);
        expect(tone).toBeLessThan(postTone);
      }
    } finally {
      unregister.forEach(remove => remove()); f.device.dispose(); f.finish();
    }
  });

  it("bounds settled validation scopes and disposed target wrappers without explicit drains", async () => {
    const f = await fixture(); const scopeId = {};
    const internals = f.device as unknown as { renderTargets: Set<unknown>; webgpuPostErrorScopePending: Set<unknown> };
    for (let frameId = 1; frameId <= 20; frameId += 1) {
      f.device.presentLdrPostprocess(f.source, { outputTarget: f.output, autoExposure: {}, passes: [],
        postFrameContext: { scopeId, viewId: "main", frameId, timeSeconds: frameId, cameraCut: frameId % 3 === 0 } });
      if (frameId % 4 === 0) f.device.releaseNativePostEffectView(scopeId, "main");
      await Promise.resolve(); await Promise.resolve();
      expect(internals.webgpuPostErrorScopePending.size).toBe(0);
      expect(internals.renderTargets.size).toBeLessThanOrEqual(8);
    }
    f.device.dispose(); f.finish();
  });

  it("filters custom passes by app scope before planning or recording missing shaders", async () => {
    const f = await fixture(); const firstScope = {}, secondScope = {};
    const seen: unknown[] = [];
    const first = registerPostPass({ id: "exposure-scope-first", owner: "prd03", flag: "A3D_QR_POST", insertAt: "after-depth", space: "linear-hdr",
      inputs: ["color"], gpuOnly: true, postScopeMatches: scope => scope === firstScope,
      enabled: context => { seen.push(context.postScopeId); return true; },
      fragment: { glsl: "void main() {}", wgsl: "@fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }" } });
    const second = registerPostPass({ id: "exposure-scope-second", owner: "prd03", flag: "A3D_QR_POST", insertAt: "before-tonemap", space: "linear-hdr",
      inputs: ["color"], gpuOnly: true, postScopeMatches: scope => scope === secondScope, fragment: { glsl: "void main() {}" } });
    try {
      const token = postDiagnostics.begin(firstScope, "main", 1);
      f.device.presentLdrPostprocess(f.source, { outputTarget: f.output, autoExposure: {}, passes: [],
        postFrameContext: { scopeId: firstScope, viewId: "main", frameId: 1, timeSeconds: 1, diagnosticToken: token } });
      expect(seen).toEqual([firstScope]);
      expect(f.passes).toContain("webgpu-custom:exposure-scope-first-pass");
      expect(postSkippedReasons(token)).toEqual([]);
      const other = postDiagnostics.begin(secondScope, "main", 1);
      f.device.presentLdrPostprocess(f.source, { outputTarget: f.output, autoExposure: {}, passes: [],
        postFrameContext: { scopeId: secondScope, viewId: "main", frameId: 1, timeSeconds: 1, diagnosticToken: other } });
      expect(seen).toEqual([firstScope]);
      expect(postSkippedReasons(other)).toContain("WGSL_PROGRAM_MISSING:exposure-scope-second");
      expect(f.passes.filter(pass => pass === "webgpu-custom:exposure-scope-first-pass")).toHaveLength(1);
    } finally {
      first(); second(); f.device.dispose(); f.finish();
    }
  });
});
