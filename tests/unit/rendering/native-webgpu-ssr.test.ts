import { describe, expect, it } from "vitest";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { SSR_COMPOSITE_WGSL, SSR_TRACE_UNIFORM_BYTES, SSR_TRACE_WGSL } from "../../../packages/rendering/src/post/shaders/ssr.wgsl";
import {
  resolveWebGPUSsrOptions, validateWebGPUSsrFrame, webgpuNativeDepthPostStages, webgpuSsrTraceUniforms, type WebGPUSsrFrame
} from "../../../packages/rendering/src/post/WebGPUScreenSpaceReflections";
import { withWebgpuSsrFrame } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createProductionRuntimePostprocess } from "../../../packages/engine/src/agent-api/compiler/postprocess";
import { effects, primitives, scene } from "../../../packages/engine/src/agent-api/index";

// Host-side WebGPUDevice path only: the recorder neither compiles WGSL nor
// establishes pixels (the real-GPU capture does that).
type Module = { readonly label: string; readonly code: string };
type RecordedPass = {
  readonly label: string;
  pipeline?: { readonly descriptor: { readonly label: string; readonly fragment: { readonly module: Module; readonly entryPoint: string; readonly targets: readonly { format: string }[] } } };
  group?: { readonly bytes?: Uint8Array; readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] };
  view?: { readonly texture: { readonly label?: string; readonly size?: readonly number[] } };
};

async function nativeFixture() {
  const writes = new Map<object, Uint8Array>();
  const passes: RecordedPass[] = [];
  const native = {
    features: new Set<string>(),
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024, maxBufferSize: 8_000_000, maxVertexBuffers: 8 },
    queue: {
      writeBuffer(buffer: object, _offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        writes.set(buffer, bytes.slice());
      },
      writeTexture() {},
      submit() {},
      onSubmittedWorkDone: async () => {}
    },
    createBuffer: () => ({ destroy() {} }),
    createSampler: () => ({ sampler: true }),
    createTexture: (descriptor: { readonly label?: string; readonly size?: readonly number[] }) => {
      const texture = { label: descriptor.label, size: descriptor.size, createView: (viewDescriptor?: object) => ({ texture, viewDescriptor }), destroy() {} };
      return texture;
    },
    createShaderModule: (descriptor: Module) => descriptor,
    createBindGroupLayout: (descriptor: object) => descriptor,
    createPipelineLayout: (descriptor: object) => descriptor,
    createRenderPipeline: (descriptor: object) => ({ descriptor, getBindGroupLayout: () => ({}) }),
    createBindGroup(descriptor: { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }) {
      const resource = descriptor.entries.find(entry => entry.binding === 0)?.resource as { readonly buffer?: object } | undefined;
      const bytes = resource?.buffer && writes.get(resource.buffer);
      return { entries: descriptor.entries, ...(bytes ? { bytes: bytes.slice() } : {}) };
    },
    createCommandEncoder() {
      return {
        beginRenderPass(descriptor: { readonly label: string; readonly colorAttachments: readonly { readonly view: RecordedPass["view"] }[] }) {
          const pass: RecordedPass = { label: descriptor.label, view: descriptor.colorAttachments[0]?.view };
          passes.push(pass);
          return {
            setPipeline(pipeline: RecordedPass["pipeline"]) { pass.pipeline = pipeline; },
            setBindGroup(_index: number, group: RecordedPass["group"]) { pass.group = group; },
            setVertexBuffer() {}, setIndexBuffer() {}, setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
            draw() {}, drawIndexed() {}, end() {}
          };
        },
        copyTextureToTexture() {}, clearBuffer() {},
        finish: () => ({})
      };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
  return { device, passes };
}

const PERSPECTIVE = new Float32Array([1.2, 0, 0, 0, 0, 2, 0, 0, 0, 0, -1.002, -1, 0, 0, -0.2002, 0]);
const frame = (overrides: Partial<WebGPUSsrFrame> = {}): WebGPUSsrFrame => ({
  projection: PERSPECTIVE, inverseProjection: new Float32Array(16).fill(0.5), far: 100, orthographic: false,
  clipRange: "zero-to-one", clearDepth: 0, ...overrides
});

describe("W3 native WebGPU SSR: device pass", () => {
  it("traces half-res against the source depth, composites full-res in the source format, then tone maps", async () => {
    const f = await fixtureWithSource();
    try {
      f.device.presentLdrPostprocess(f.source, { passes: [
        { name: "tone-mapping", options: { operator: "aces" } },
        { name: "ssr", options: { intensity: 0.7, roughness: 0.2, maxDistance: 9, thickness: 0.35, steps: 30, webgpuFrame: frame() } }
      ], outputTarget: f.output } as never);
      const post = f.passes.filter(pass => !pass.label.endsWith("-native-clear-pass"));
      expect(post.map(pass => pass.label).slice(0, 3)).toEqual(["webgpu-ssr-trace-32-pass", "webgpu-ssr-composite-pass", "webgpu-tone-pass"]);
      const [trace, composite] = post;
      expect(trace!.pipeline!.descriptor.fragment.module.code).toBe(SSR_TRACE_WGSL);
      expect(trace!.pipeline!.descriptor.fragment.targets).toEqual([{ format: "rgba16float" }]);
      expect(trace!.view!.texture.size).toEqual([5, 3]);
      // Binding 3 is the source's depth attachment, viewed depth-only.
      const depthView = trace!.group!.entries.find(entry => entry.binding === 3)!.resource as { texture: { label: string }; viewDescriptor: object };
      expect(depthView.texture.label).toContain("-depth");
      expect(depthView.viewDescriptor).toEqual({ aspect: "depth-only" });
      const bytes = trace!.group!.bytes!;
      expect(bytes.byteLength).toBe(SSR_TRACE_UNIFORM_BYTES);
      const values = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
      expect(Array.from(values.slice(32, 42))).toEqual([10, 5, 100, 9, Math.fround(0.35), Math.fround(0.2), 32, 0, 1, 0]);
      expect(composite!.pipeline!.descriptor.fragment.module.code).toBe(SSR_COMPOSITE_WGSL);
      expect(composite!.pipeline!.descriptor.fragment.targets).toEqual([{ format: "rgba16float" }]);
      expect(composite!.view!.texture.size).toEqual([10, 5]);
      expect(Array.from(new Float32Array(composite!.group!.bytes!.buffer, composite!.group!.bytes!.byteOffset, 1))).toEqual([Math.fround(0.7)]);
      expect(f.device.getDiagnostics()).toBeDefined();
    } finally { f.device.dispose(); }
  });

  it("refuses a source without a sampleable depth attachment or without the frame", async () => {
    const f = await fixtureWithSource();
    try {
      const flat = f.device.createRenderTarget({ width: 10, height: 5, format: "rgba16f", depth: true });
      expect(() => f.device.executeWebGPUSsr(flat, { webgpuFrame: frame() })).toThrow(expect.objectContaining({ code: "WEBGPU_SSR_DEPTH_REQUIRED" }));
      expect(() => f.device.executeWebGPUSsr(f.source, {})).toThrow(expect.objectContaining({ code: "WEBGPU_SSR_FRAME_REQUIRED" }));
    } finally { f.device.dispose(); }
  });
});

async function fixtureWithSource() {
  const f = await nativeFixture();
  const source = f.device.createRenderTarget({ width: 10, height: 5, format: "rgba16f", depth: "texture", label: "forward" });
  const output = f.device.createRenderTarget({ width: 10, height: 5, format: "rgba8", depth: false, label: "out" });
  return { ...f, source, output };
}

describe("W3 native WebGPU SSR: options, frame and uniforms", () => {
  it("resolves the v2 S3 defaults and clamps", () => {
    expect(resolveWebGPUSsrOptions(undefined)).toEqual({ intensity: 0.9, maxDistance: 18, roughness: 0, thickness: 0.25, steps: 24 });
    expect(resolveWebGPUSsrOptions({ intensity: 5, maxDistance: 0, steps: 10, thickness: -1 })).toMatchObject({ intensity: 2, maxDistance: 0.5, steps: 16, thickness: 0.01 });
  });

  it("packs the projection, inverse and scalars in WGSL struct order", () => {
    const values = webgpuSsrTraceUniforms(frame({ orthographic: true, clipRange: "minus-one-to-one", clearDepth: 1 }), resolveWebGPUSsrOptions({}), 64, 32);
    expect(values.byteLength).toBe(SSR_TRACE_UNIFORM_BYTES);
    expect(Array.from(values.slice(0, 16))).toEqual(Array.from(PERSPECTIVE));
    expect(Array.from(values.slice(32, 44))).toEqual([64, 32, 100, 18, 0.25, 0, 24, 1, 0, 1, 0, 0]);
  });

  it("rejects a frame without a finite projection or a depth convention", () => {
    expect(() => validateWebGPUSsrFrame(undefined)).toThrow(expect.objectContaining({ code: "WEBGPU_SSR_FRAME_REQUIRED" }));
    expect(() => validateWebGPUSsrFrame({ ...frame(), projection: [1, 2] })).toThrow(expect.objectContaining({ code: "WEBGPU_SSR_FRAME_REQUIRED" }));
    expect(() => validateWebGPUSsrFrame({ ...frame(), clipRange: "other" })).toThrow(expect.objectContaining({ code: "WEBGPU_SSR_FRAME_REQUIRED" }));
  });

  it("the WGSL references every binding the auto layout must keep", () => {
    for (const name of ["u_ssr.", "u_sampler", "u_color", "u_depth"]) expect(SSR_TRACE_WGSL.split(name).length).toBeGreaterThan(2);
    for (const name of ["u_composite.intensity", "u_sampler,", "u_color,", "u_reflection,"]) expect(SSR_COMPOSITE_WGSL).toContain(name);
  });
});

describe("W3 native WebGPU SSR: renderer pass plan", () => {
  const camera = { viewMatrix: new Float32Array(16), projectionMatrix: PERSPECTIVE, projectionMatrixInverse: new Float32Array(16).fill(2),
    viewProjectionMatrix: new Float32Array(16), previousViewProjectionMatrix: null, near: 0.1, far: 100, projection: "perspective" as const,
    position: [0, 0, 0] as const, depth: { mode: "reversed", requestedMode: "reversed", clipRange: "zero-to-one", clearValue: 0, compare: "greater-equal", biasSign: -1 } as const };
  const webgpu = { kind: "webgpu" } as never;
  const source = { depthTexture: {}, sampleCount: 1 } as never;
  const passes = [{ name: "tone-mapping", options: {} }, { name: "ssr", options: { intensity: 0.9, maxDistance: 18 } }] as never;

  it("attaches the frame convention and the v2 S3 options to the WebGPU ssr pass", () => {
    const planned = withWebgpuSsrFrame(webgpu, { v2: true, pipeline: { ssr: { intensity: 0.55, roughness: 0.42 } }, cameraFrame: camera } as never, source, passes);
    expect(planned[1]!.options).toMatchObject({ intensity: 0.55, roughness: 0.42, maxDistance: 18,
      webgpuFrame: { projection: PERSPECTIVE, far: 100, orthographic: false, clipRange: "zero-to-one", clearDepth: 0 } });
  });

  it("drops the pass when the v2 tier dropped S3, or without depth or camera; leaves WebGL2 untouched", () => {
    expect(withWebgpuSsrFrame(webgpu, { v2: true, pipeline: {}, cameraFrame: camera } as never, source, passes).map(p => p.name)).toEqual(["tone-mapping"]);
    expect(withWebgpuSsrFrame(webgpu, { cameraFrame: camera } as never, { depthTexture: undefined } as never, passes).map(p => p.name)).toEqual(["tone-mapping"]);
    expect(withWebgpuSsrFrame(webgpu, {} as never, source, passes).map(p => p.name)).toEqual(["tone-mapping"]);
    expect(withWebgpuSsrFrame({ kind: "webgl2" } as never, { v2: true, pipeline: {} } as never, source, passes)).toBe(passes);
    expect(withWebgpuSsrFrame(new MockRenderDevice(), {} as never, source, passes)).toBe(passes);
  });
});

describe("W3 pre-mount check", () => {
  const gapFn = (createProductionRuntimePostprocess as unknown as Record<symbol, (...args: unknown[]) => { code: string } | undefined>)[
    Symbol.for("@aura3d/root-postprocess/webgpu-post-gap/v1")]!;
  const canvas = { width: 640, height: 360 } as never;
  const ssrScene = () => scene().add(primitives.box()).add(effects.screenSpaceReflections({ intensity: 0.6 })).toJSON();

  it("an SSR scene is a depth gap until the renderer reports ssr as a native WebGPU depth stage", () => {
    expect(gapFn(ssrScene(), canvas)).toMatchObject({ code: "DEPTH_POSTPROCESS_UNSUPPORTED" });
    expect(gapFn(ssrScene(), canvas, undefined, ["ssr"])).toBeUndefined();
    expect(gapFn(scene().add(primitives.box()).add(effects.ambientOcclusion({})).toJSON(), canvas, undefined, ["ssr"])).toMatchObject({ code: "DEPTH_POSTPROCESS_UNSUPPORTED" });
  });

  it("the renderer reports ssr only once the device advertises depth textures", () => {
    const stages = (Renderer as unknown as Record<symbol, () => readonly string[]>)[Symbol.for("@aura3d/rendering/webgpu-native-depth-stages/v1")]!;
    expect(stages()).toEqual(webgpuNativeDepthPostStages());
    expect(webgpuNativeDepthPostStages(true)).toEqual(["ssr"]);
    expect(webgpuNativeDepthPostStages(false)).toEqual([]);
  });
});
