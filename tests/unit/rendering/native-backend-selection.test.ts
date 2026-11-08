import { describe, expect, it, vi } from "vitest";
import { createRenderDevice } from "../../../packages/rendering/src/RenderBackend";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { WebGPUResourceInterop } from "../../../packages/rendering/src/webgpu/ResourceInterop";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { Sampler } from "../../../packages/rendering/src/Sampler";
import { VertexFormat, type VertexAttributeType } from "../../../packages/rendering/src/VertexFormat";
import { GaussianSplatRenderer } from "../../../packages/rendering/src/GaussianSplatRenderer";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { RendererPostprocessPipeline } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import { WebGPURendererBackend } from "../../../packages/rendering/src/production-runtime/backends/WebGPURendererBackend";
import type { RenderCommandState } from "../../../packages/rendering/src/RenderDevice";
import { resolveBackendOptions, resolveDrawingPathOptions } from "../../../packages/engine/src/agent-api/app/rendererOptions";
import { createProductionRuntimeSceneRenderer, createSelectedProductionRenderer } from "../../../packages/engine/src/agent-api/compiler/renderer";
import { createComputeSurface } from "../../../packages/engine/src/agent-api/nodes/compute";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures, PROGRAM_OUTPUT_SRGB_FEATURE } from "../../../packages/rendering/src/program/ProgramFeatures";
import { postDiagnostics } from "../../../packages/rendering/src/renderer/PostDiagnosticsScope";
import { postSkippedReasons, postStagesRan } from "../../../packages/rendering/src/renderer/postSkipped";
import { registerPostPass } from "../../../packages/rendering/src/contracts/post";

function fakeNative() {
  const destroyed: number[] = [];
  const writes: { offset: number; bytes: number[] }[] = [];
  const native = {
    queue: {
      writeBuffer(_buffer: unknown, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        writes.push({ offset, bytes: [...bytes] });
      },
      submit: vi.fn(),
      onSubmittedWorkDone: async () => {}
    },
    createBuffer({ size, usage }: { size: number; usage: number }) {
      return { size, usage, mapAsync: async () => {}, getMappedRange: () => new ArrayBuffer(size), unmap() {}, destroy() { destroyed.push(size); } };
    },
    createShaderModule: () => ({}),
    createComputePipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroup: () => ({}),
    createBindGroupLayout: (descriptor: unknown) => ({ descriptor }),
    createPipelineLayout: (descriptor: unknown) => ({ descriptor }),
    createCommandEncoder: () => ({
      beginRenderPass: () => ({ setPipeline() {}, setVertexBuffer() {}, draw() {}, end() {} }),
      beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }),
      copyBufferToBuffer() {},
      finish: () => ({})
    }),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    destroy: vi.fn()
  };
  return { native, destroyed, writes };
}

// Record the actual buffer bound for a draw as well as the bytes uploaded to it.
// This is a submission/layout mock, not a GPU or pixel-correctness test.
function fakeVertexConversionNative(maxBufferSize?: number) {
  const { native: base } = fakeNative();
  const buffers: { label: string | undefined; size: number; handle: object }[] = [];
  const uploads: { buffer: object; offset: number; bytes: Uint8Array }[] = [];
  const pipelines: unknown[] = [];
  const bindings: { slot: number; buffer: object }[] = [];
  const draws: number[][] = [];
  const native = {
    ...base,
    ...(maxBufferSize === undefined ? {} : { limits: { maxBufferSize } }),
    queue: {
      ...base.queue,
      writeBuffer(buffer: object, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        uploads.push({ buffer, offset, bytes: bytes.slice() });
        base.queue.writeBuffer(buffer, offset, data);
      }
    },
    createBuffer(descriptor: { label?: string; size: number; usage: number }) {
      const handle = base.createBuffer(descriptor);
      buffers.push({ label: descriptor.label, size: descriptor.size, handle });
      return handle;
    },
    createRenderPipeline(descriptor: unknown) {
      pipelines.push(descriptor);
      return { getBindGroupLayout: () => ({}) };
    },
    createCommandEncoder: () => ({
      beginRenderPass: () => ({
        setPipeline() {}, setBindGroup() {},
        setVertexBuffer(slot: number, buffer: object) { bindings.push({ slot, buffer }); },
        draw(...args: number[]) { draws.push(args); }, end() {}
      }),
      finish: () => ({})
    })
  };
  return { native, buffers, uploads, pipelines, bindings, draws };
}

describe("native backend negotiation", () => {
  it("forwards required features and limits into an actual device request", async () => {
    const { native } = fakeNative();
    const requestDevice = vi.fn(async () => native as WebGPUDeviceLike);
    const device = await createRenderDevice({ backend: "webgpu", webgpuRequiredFeatures: ["timestamp-query"], webgpuRequiredLimits: { maxBufferSize: 1024 }, webgpu: {
      requestAdapter: async () => ({ features: new Set(["timestamp-query"]), limits: { maxBufferSize: 2048 }, requestDevice })
    } });
    expect(requestDevice).toHaveBeenCalledWith({ requiredFeatures: ["timestamp-query"], requiredLimits: { maxBufferSize: 1024 } });
    expect(device.kind).toBe("webgpu");
    device.dispose();
    expect(native.destroy).toHaveBeenCalledTimes(1);
  });

  it("rejects missing features before requesting a device and cleans up failed owned initialization", async () => {
    const requestDevice = vi.fn(async () => fakeNative().native as WebGPUDeviceLike);
    await expect(WebGPUDevice.create({ adapter: { features: new Set(), requestDevice }, requiredFeatures: ["timestamp-query"] })).rejects.toMatchObject({ code: "WEBGPU_FEATURES_UNAVAILABLE", details: { missingFeatures: ["timestamp-query"] } });
    expect(requestDevice).not.toHaveBeenCalled();
    const { native } = fakeNative();
    await expect(WebGPUDevice.create({ adapter: { requestDevice: async () => native as WebGPUDeviceLike }, canvas: { getContext: () => null } as never })).rejects.toThrow();
    expect(native.destroy).toHaveBeenCalledTimes(1);
    const bad = { queue: {}, destroy: vi.fn() };
    await expect(WebGPUDevice.create({ adapter: { requestDevice: async () => bad as never } })).rejects.toMatchObject({ code: "WEBGPU_DEVICE_INVALID" });
    expect(bad.destroy).toHaveBeenCalledTimes(1);
  });

  it("retains borrowed devices and avoids unconfiguring a newer canvas owner", async () => {
    const a = fakeNative().native; const b = fakeNative().native;
    const context = { configure: vi.fn(), unconfigure: vi.fn(), getCurrentTexture: () => ({ createView: () => ({}), destroy() {} }) };
    const canvas = { getContext: () => context } as never;
    const adapter = { requestDevice: async () => a as WebGPUDeviceLike };
    const first = await WebGPUDevice.create({ adapter, device: a as WebGPUDeviceLike, canvas });
    first.beginFrame(8, 8);
    expect(first.hasNativeSurfaceViewOverride()).toBe(false);
    first.setViewport(1, 1, 4, 4, { persistent: true });
    expect(first.hasNativeSurfaceViewOverride()).toBe(true);
    first.resetViewport(); first.endFrame();
    const second = await WebGPUDevice.create({ adapter, device: b as WebGPUDeviceLike, canvas });
    first.dispose();
    expect(context.unconfigure).not.toHaveBeenCalled();
    expect(a.destroy).not.toHaveBeenCalled();
    second.dispose();
    expect(context.unconfigure).toHaveBeenCalledTimes(1);
    expect(b.destroy).not.toHaveBeenCalled();
  });

  it("gives an exclusive canvas and its native device to one managed app at a time", async () => {
    const context = { configure: vi.fn(), unconfigure: vi.fn(), getCurrentTexture: () => ({ createView: () => ({}), destroy() {} }) };
    const canvas = { getContext: () => context } as never;
    const otherContext = { configure: vi.fn(), unconfigure: vi.fn(), getCurrentTexture: () => ({ createView: () => ({}), destroy() {} }) };
    const otherCanvas = { getContext: () => otherContext } as never;
    const a = fakeNative().native; const b = fakeNative().native;
    const appA = await WebGPUDevice.create({ adapter: { requestDevice: async () => a as WebGPUDeviceLike }, canvas, canvasOwnership: "exclusive" });
    // A second managed app on the same canvas, or a legacy wrapper on it, is rejected
    // before it configures anything; the owner's canvas and device are untouched.
    await expect(WebGPUDevice.create({ adapter: { requestDevice: async () => b as WebGPUDeviceLike }, canvas, canvasOwnership: "exclusive" }))
      .rejects.toMatchObject({ code: "WEBGPU_CANVAS_IN_USE" });
    await expect(WebGPUDevice.create({ adapter: { requestDevice: async () => b as WebGPUDeviceLike }, canvas }))
      .rejects.toMatchObject({ code: "WEBGPU_CANVAS_IN_USE" });
    // A different canvas whose adapter hands back the owner's native device is rejected
    // without destroying that device.
    await expect(WebGPUDevice.create({ adapter: { requestDevice: async () => a as WebGPUDeviceLike }, canvas: otherCanvas, canvasOwnership: "exclusive" }))
      .rejects.toMatchObject({ code: "WEBGPU_DEVICE_IN_USE" });
    expect(context.configure).toHaveBeenCalledTimes(1);
    expect(otherContext.configure).not.toHaveBeenCalled();
    expect(a.destroy).not.toHaveBeenCalled();
    expect(b.destroy).not.toHaveBeenCalled();
    expect(appA.disposed).toBe(false);
    appA.beginFrame(8, 8); appA.endFrame();
    // Retirement releases the reservation; only then can the next app claim the canvas.
    appA.dispose();
    await appA.whenDisposed();
    expect(context.unconfigure).toHaveBeenCalledTimes(1);
    expect(a.destroy).toHaveBeenCalledTimes(1);
    const appB = await WebGPUDevice.create({ adapter: { requestDevice: async () => b as WebGPUDeviceLike }, canvas, canvasOwnership: "exclusive" });
    try {
      expect(context.configure).toHaveBeenCalledTimes(2);
      expect(context.configure.mock.calls[1]![0]).toMatchObject({ device: b });
      appA.dispose();
      expect(context.unconfigure).toHaveBeenCalledTimes(1);
      expect(b.destroy).not.toHaveBeenCalled();
    } finally {
      appB.dispose();
      await appB.whenDisposed();
    }
    expect(context.unconfigure).toHaveBeenCalledTimes(2);
    expect(b.destroy).toHaveBeenCalledTimes(1);
  });

  it("falls back to sRGB when the canvas cannot verify its configured color space", async () => {
    const { native } = fakeNative();
    const configure = vi.fn();
    const context = { configure, getCurrentTexture: () => ({ createView: () => ({}), destroy() {} }) };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as WebGPUDeviceLike }, canvas: { getContext: () => context } as never });
    expect(device.negotiateOutputColorSpace("display-p3")).toMatchObject({
      requested: "display-p3", active: "srgb", supported: ["srgb"], fallbackReason: expect.any(String)
    });
    expect(configure.mock.calls.at(-1)?.[0]).toMatchObject({ colorSpace: "srgb" });
    device.dispose();
  });

  it("preserves premultiplied canvas association across output color negotiation", async () => {
    const { native } = fakeNative();
    let configured: { alphaMode?: "opaque" | "premultiplied"; colorSpace?: "srgb" | "display-p3" } | undefined;
    const configure = vi.fn((value: typeof configured) => { configured = value; });
    const context = { configure, getConfiguration: () => configured, getCurrentTexture: () => ({ createView: () => ({}), destroy() {} }) };
    const device = await createRenderDevice({ backend: "webgpu", presentationAlphaMode: "premultiplied", canvas: { getContext: () => context } as never,
      webgpu: { requestAdapter: async () => ({ requestDevice: async () => native as WebGPUDeviceLike }) } });
    expect(configured).toMatchObject({ alphaMode: "premultiplied", colorSpace: "srgb" });
    expect(device.getPresentationAlphaMode?.()).toBe("premultiplied");
    expect(device.negotiateOutputColorSpace?.("display-p3").active).toBe("srgb");
    expect(configured).toMatchObject({ alphaMode: "premultiplied", colorSpace: "srgb" });
    device.dispose();
    await expect(WebGPUDevice.create({ presentationAlphaMode: "straight" })).rejects.toMatchObject({ code: "OUTPUT_ALPHA_MODE_UNAVAILABLE" });
  });

  it("keeps neighboring bytes on unaligned updates and exposes storage usage", async () => {
    const { native, writes } = fakeNative();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as WebGPUDeviceLike } });
    const buffer = device.createBuffer("vertex", 8, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    device.updateBuffer(buffer, 1, new Uint8Array([9, 10]));
    expect(writes.at(-1)).toEqual({ offset: 0, bytes: [1, 9, 10, 4] });
    expect(device.getNativeStorageBuffer(buffer).usage & 0x80).toBe(0x80);
    expect(() => device.readBuffer(buffer)).toThrow(/shadow stale/i);
    expect(() => device.updateBuffer(buffer, 1, new Uint8Array([11]))).toThrow(/shadow/i);
    device.updateBuffer(buffer, 0, new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1]));
    expect([...device.readBuffer(buffer)]).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    device.dispose();
  });

  it("validates buffer ranges and retires a failed initial allocation", async () => {
    const { native, destroyed } = fakeNative();
    let finish!: () => void;
    const fence = new Promise<void>((resolve) => { finish = resolve; });
    native.queue.onSubmittedWorkDone = () => fence;
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as WebGPUDeviceLike } });
    const buffer = device.createBuffer("vertex", 8);
    for (const offset of [NaN, Infinity, 0.5]) {
      expect(() => device.updateBuffer(buffer, offset, new Uint8Array([1]))).toThrow(/range/i);
      expect(() => device.readBuffer(buffer, offset, 1)).toThrow(/range/i);
      expect(() => device.readBuffer(buffer, 0, offset)).toThrow(/range/i);
    }
    const resources = device.resourceInterop.liveResources;
    native.queue.writeBuffer = () => { throw new Error("write failed"); };
    expect(() => device.createBuffer("vertex", 12, new Uint8Array(12))).toThrow(/write failed/);
    expect(destroyed).not.toContain(12);
    expect(device.resourceInterop.liveResources).toBe(resources + 1);
    finish(); await fence; await Promise.resolve();
    expect(destroyed).toContain(12);
    expect(device.resourceInterop.liveResources).toBe(resources);
    device.dispose();
  });

  it("rejects undersized vertex, index and instance streams before creating a pipeline", async () => {
    const { native } = fakeNative();
    const createPipeline = vi.fn(native.createRenderPipeline);
    native.createRenderPipeline = createPipeline;
    const drawIndexed = vi.fn();
    native.createCommandEncoder = () => ({
      beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {}, draw() {}, drawIndexed, end() {} }),
      beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }),
      copyBufferToBuffer() {}, finish: () => ({})
    });
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as WebGPUDeviceLike } });
    const shader = device.createShaderProgram({ label: "bounds", marker: "bounds",
      vertex: "// bounds\nlayout(location=0) in vec3 a_position; layout(location=2) in vec4 a_instance; void main(){}",
      fragment: "// bounds\nvoid main(){}", portableBindings: [],
      webgpu: { vertex: "/* @aura3d-bindings */ @vertex fn main(@location(0) p: vec3<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(p, 1.0); }",
        fragment: "/* @aura3d-bindings */ @fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }" } });
    const vertices = device.createBuffer("vertex", 36);
    const indices = device.createBuffer("index", 6, new Uint16Array([0, 1, 3]));
    const instances = device.createBuffer("vertex", 16);
    const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
    device.beginFrame(2, 2); device.setRenderTarget(target);
    const draw = { topology: "triangles" as const, vertexBuffer: vertices, vertexFormat: VertexFormat.P3, vertexCount: 3, shader };
    expect(() => device.draw({ ...draw, firstVertex: 1 })).toThrow(/vertex stream/i);
    expect(() => device.draw({ ...draw, indexBuffer: indices, indexCount: 3 })).toThrow(/vertex stream/i);
    expect(() => device.draw({ ...draw, indexBuffer: indices, indexCount: 3, firstIndex: 1 })).toThrow(/index range/i);
    expect(() => device.draw({ ...draw, instanceCount: 2, instanceAttributes: [{ buffer: instances, shaderName: "a_instance", components: 4, offset: 0, stride: 16 }] })).toThrow(/vertex stream/i);
    expect(createPipeline).not.toHaveBeenCalled();
    device.updateBuffer(indices, 0, new Uint16Array([0, 1, 2]));
    device.draw({ ...draw, indexBuffer: indices, indexCount: 3 });
    expect(drawIndexed).toHaveBeenCalledWith(3, 1, 0);
    device.getNativeBuffer(indices);
    expect(() => device.draw({ ...draw, indexBuffer: indices, indexCount: 3 })).toThrow(/index shadow/i);
    device.endFrame(); device.dispose();
  });

  it("invalidates a lost generation and recovers with a newly requested device", async () => {
    let lose!: (info: { reason: string }) => void;
    const first = fakeNative().native;
    const second = fakeNative().native;
    const lost = new Promise<{ reason: string }>((resolve) => { lose = resolve; });
    const requestDevice = vi.fn().mockResolvedValueOnce({ ...first, lost }).mockResolvedValueOnce(second);
    const device = await WebGPUDevice.create({ adapter: { requestDevice } });
    const buffer = device.createBuffer("vertex", 4);
    lose({ reason: "unknown" });
    await Promise.resolve();
    expect(device.contextLost).toBe(true);
    expect(() => device.getNativeBuffer(buffer)).toThrow(/lost/i);
    const recovered = await device.recover();
    expect(recovered.generation).toBeGreaterThan(device.generation);
    expect(() => recovered.getNativeBuffer(buffer)).toThrow(/not created/);
    expect(requestDevice).toHaveBeenCalledTimes(2);
    recovered.dispose();
  });

  it("uploads 3D mip subresources independently without consuming another device's update", async () => {
    const native = fakeNative().native;
    const uploads: { mipLevel?: number; depth: number; bytes: number[] }[] = [];
    const textures: unknown[] = [];
    const queue = { ...native.queue, writeTexture: (destination: { mipLevel?: number }, data: ArrayBufferView, _layout: unknown, size: { depthOrArrayLayers: number }) => {
      uploads.push({ mipLevel: destination.mipLevel, depth: size.depthOrArrayLayers, bytes: [...new Uint8Array(data.buffer, data.byteOffset, data.byteLength)] });
    } };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => ({ ...native, queue, createTexture: (descriptor: unknown) => { textures.push(descriptor); return { createView: () => ({}), destroy() {} }; } }) as unknown as WebGPUDeviceLike } });
    const volume = new Texture({ dimension: "3d", width: 2, height: 2, depth: 2, format: "r32f", mipLevelCount: 2, usage: ["sampled", "storage", "copy-dst"], mipLevels: [
      { width: 2, height: 2, depth: 2, data: new Float32Array(8).fill(1) },
      { width: 1, height: 1, depth: 1, data: new Float32Array([2]) }
    ] });
    const handle = device.getNativeTexture(volume);
    expect(textures[0]).toMatchObject({ dimension: "3d", size: { width: 2, height: 2, depthOrArrayLayers: 2 }, format: "r32float", mipLevelCount: 2, usage: 14 });
    expect(uploads.map((entry) => [entry.mipLevel, entry.depth])).toEqual([[0, 2], [1, 1]]);
    volume.updateMip(1, new Float32Array([7]));
    expect(device.getNativeTexture(volume)).toBe(handle);
    expect(uploads.map((entry) => entry.mipLevel)).toEqual([0, 1, 1]);
    expect(new DataView(new Uint8Array(uploads[2]!.bytes).buffer).getFloat32(0, true)).toBe(7);
    volume.dispose(); device.dispose();
  });

  it("samples the same empty storage allocation written by compute and retires it after its fence", async () => {
    let release!: () => void;
    const fence = new Promise<void>((resolve) => { release = resolve; });
    const base = fakeNative().native;
    const nativeTextures: { descriptor: unknown; destroy: ReturnType<typeof vi.fn>; createView: () => unknown }[] = [];
    const groups: { entries: readonly { binding: number; resource: unknown }[] }[] = [];
    const native = {
      ...base,
      queue: { ...base.queue, onSubmittedWorkDone: () => fence },
      createSampler: () => ({}),
      createTexture(descriptor: unknown) {
        const handle = { descriptor, destroy: vi.fn(), createView: () => ({ handle }) };
        nativeTextures.push(handle);
        return handle;
      },
      createCommandEncoder(descriptor?: { label?: string }) {
        return {
          beginRenderPass: () => ({ setPipeline() {}, setVertexBuffer() {}, setBindGroup() {}, draw() {}, end() {} }),
          beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }),
          finish: () => ({ label: descriptor?.label })
        };
      },
      createBindGroup(descriptor: { entries: readonly { binding: number; resource: unknown }[] }) { groups.push(descriptor); return {}; }
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const texture = new Texture({ width: 2, height: 2, usage: ["storage", "sampled"] });
    const shared = device.getNativeTexture(texture);
    expect(nativeTextures[0]!.descriptor).toMatchObject({ usage: 12 });
    const compute = createComputeSurface(() => "webgpu", () => device);
    const pipeline = compute.pipeline({
      wgsl: "@group(0) @binding(0) var output: texture_storage_2d<rgba8unorm, write>; @compute @workgroup_size(1) fn main() { textureStore(output, vec2<i32>(0), vec4<f32>(1.0)); }",
      workgroupSize: [1], bindings: [{ binding: 0, type: "storage-texture" }]
    });
    compute.dispatch({ pipeline, bindings: [{ binding: 0, texture }], workgroups: [1] });
    const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
    const shader = device.createShaderProgram({
      label: "shared-texture", marker: "shared-texture",
      vertex: "// shared-texture\nlayout(location=0) in vec3 a_position;\nvoid main(){}",
      fragment: "// shared-texture\nvoid main(){}",
      portableBindings: [{ name: "u_image", kind: "texture2d" }],
      webgpu: {
        vertex: "/* @aura3d-bindings */\n@vertex fn main(@location(0) p: vec3<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(p,1.0); }",
        fragment: "/* @aura3d-bindings */\n@fragment fn main() -> @location(0) vec4<f32> { return textureSample(u_imageTexture, u_imageSampler, vec2<f32>(0.5)); }"
      }
    });
    const buffer = device.createBuffer("vertex", 36);
    device.beginFrame(2, 2); device.setRenderTarget(target);
    device.draw({ topology: "triangles", vertexBuffer: buffer, vertexFormat: VertexFormat.P3, vertexCount: 3, shader, uniforms: new Map([["u_image", new TextureBinding({ name: "u_image", texture })]]) });
    expect(() => device.draw({ topology: "triangles", vertexBuffer: buffer, vertexFormat: VertexFormat.P3, vertexCount: 3, shader,
      uniforms: new Map([["u_image", new TextureBinding({ name: "u_image", texture })]]), nativeStorageBindings: [{ name: "output", group: 1, binding: 0, kind: "storage-texture", texture }] })).toThrow(/same writable texture/);
    expect(groups.filter((group) => group.entries.some((entry) => (entry.resource as { handle?: unknown })?.handle === shared))).toHaveLength(2);
    expect(device.getNativeTexture(texture)).toBe(shared);
    expect(native.queue.submit.mock.calls.map((call) => call[0][0])).toEqual([{ label: "aura3d-compute-dispatch" }, { label: "draw-encoder" }]);
    texture.dispose();
    expect(() => device.resourceInterop.assertUsable(shared)).toThrow("WEBGPU_INTEROP_RETIRED_RESOURCE");
    expect(nativeTextures[0]!.destroy).not.toHaveBeenCalled();
    release(); await fence; await Promise.resolve();
    expect(nativeTextures[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(() => device.getNativeTexture(texture)).toThrow(/disposed/i);
    compute.dispose(); device.endFrame(); device.dispose();
  });

  it("binds the generated ambient PBR variant to AuraFrame and the compute-owned base-color texture", async () => {
    const base = fakeNative().native;
    const groups: { layout: { index: number }; entries: readonly { binding: number; resource: unknown }[] }[] = [];
    const modules: string[] = [];
    const writes: { label?: string; values: number[] }[] = [];
    const buffers: { label?: string; size: number; usage: number; destroy: ReturnType<typeof vi.fn> }[] = [];
    let failBindGroup = false;
    let releaseFence!: () => void;
    const fence = new Promise<void>((resolve) => { releaseFence = resolve; });
    const native = {
      ...base,
      queue: { ...base.queue, onSubmittedWorkDone: () => fence, writeTexture() {}, writeBuffer(buffer: { label?: string }, _offset: number, value: ArrayBuffer | ArrayBufferView) {
        const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        writes.push({ label: buffer.label, values: [...new Float32Array(bytes.slice().buffer)] });
      } },
      createBuffer(descriptor: { label?: string; size: number; usage: number }) { const buffer = { ...descriptor, destroy: vi.fn() }; buffers.push(buffer); return buffer; },
      createTexture: (descriptor: { label?: string }) => {
        const handle = { descriptor, createView: () => ({ handle }), destroy() {} };
        return handle;
      },
      createSampler: () => ({}),
      createShaderModule: ({ code }: { code: string }) => { modules.push(code); return { code }; },
      createComputePipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
      createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
      createBindGroup: (descriptor: { layout: { index: number }; entries: readonly { binding: number; resource: unknown }[] }) => { if (failBindGroup) throw new Error("bind failed"); groups.push(descriptor); return {}; },
      createCommandEncoder: () => ({
        beginRenderPass: () => ({ setPipeline() {}, setVertexBuffer() {}, setBindGroup() {}, draw() {}, end() {} }),
        beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }),
        finish: () => ({})
      })
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const generated = generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", maps: { baseColor: { uvSet: 0, transform: false } }, alphaMode: "mask" }));
    const shader = device.createShaderProgram({ label: "generated-ambient", marker: GENERATED_PROGRAM_MARKER, vertex: generated.vertex, fragment: generated.fragment });
    expect(modules[0]).toContain("frame.viewProjection * material.model * material.geometry");
    expect(modules[1]).toContain("textureSample(baseTexture, baseSampler, uv)");
    expect(modules[1]).toContain("base.a < material.parameters.y");
    expect(modules[1]).toContain("material.environment.rgb * material.environment.a");
    expect(modules[1]).not.toContain("encodeGeneratedOutput");
    const srgb = generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", maps: { baseColor: { uvSet: 0, transform: false } }, features: { [PROGRAM_OUTPUT_SRGB_FEATURE]: true } }));
    device.createShaderProgram({ label: "generated-srgb", marker: GENERATED_PROGRAM_MARKER, vertex: srgb.vertex, fragment: srgb.fragment });
    expect(modules[3]).toContain("encodeGeneratedOutput(color)");
    expect(modules[3]).toContain("0.0031308");
    const texture = new Texture({ width: 2, height: 2, usage: ["storage", "sampled"] });
    const shared = device.getNativeTexture(texture);
    const compute = createComputeSurface(() => "webgpu", () => device);
    const pipeline = compute.pipeline({ wgsl: "@group(0) @binding(0) var image: texture_storage_2d<rgba8unorm, write>; @compute @workgroup_size(1) fn main() { textureStore(image, vec2<i32>(0), vec4<f32>(1.0)); }", bindings: [{ binding: 0, type: "storage-texture", format: "rgba8unorm" }] });
    compute.dispatch({ pipeline, bindings: [{ binding: 0, texture }], workgroups: [1] });
    const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
    const vertices = device.createBuffer("vertex", 96);
    const frameData = new Float32Array(76);
    frameData[32] = 2; frameData[37] = 3; frameData[42] = 4; frameData[47] = 1;
    const frame = device.createBuffer("uniform", 304, frameData);
    const model = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 5, 6, 1];
    const geometry = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1];
    const uniforms = new Map<string, any>([
      ["u_baseColorMap", new TextureBinding({ name: "u_baseColorMap", texture })],
      ["u_modelMatrix", model], ["u_geometryMatrix", geometry],
      ["u_baseColor", [0.25, 0.5, 0.75, 0.8]], ["u_environmentColor", [0.4, 0.3, 0.2]], ["u_environmentIntensity", 2],
      ["u_emissiveColor", [0.1, 0.2, 0.3]], ["u_emissiveStrength", 3], ["u_metallic", 0.6], ["u_alphaCutoff", 0.45]
    ]);
    const draw = { topology: "triangles" as const, vertexBuffer: vertices, vertexFormat: VertexFormat.P3N3T2, vertexCount: 3, shader, uniforms };
    device.beginFrame(2, 2); device.setRenderTarget(target);
    expect(() => device.draw(draw)).toThrow(/requires AuraFrame/);
    expect(() => device.bindUniformBuffer(vertices, 0)).toThrow(/usage 'uniform'/);
    device.bindUniformBuffer(frame, 0);
    expect(() => device.draw({ ...draw, vertexFormat: VertexFormat.P3 })).toThrow(/position at location 0 and UV/);
    expect(() => device.draw({ ...draw, uniforms: new Map() })).toThrow(/live base-color map/);
    const storageBuffer = device.createBuffer("storage", 4);
    expect(() => device.draw({ ...draw, nativeStorageBindings: [{ name: "data", group: 2, binding: 0, kind: "storage-buffer", buffer: storageBuffer }] })).toThrow(/no storage bindings/);
    device.draw(draw);
    const baseEntry = groups.find((group) => group.layout.index === 0 && group.entries.some((entry) => entry.binding === 2));
    expect((baseEntry?.entries.find((entry) => entry.binding === 2)?.resource as { handle: unknown }).handle).toBe(shared);
    const frameEntry = groups.find((group) => group.layout.index === 1);
    const frameHandle = buffers.find((buffer) => buffer.label?.startsWith("aura3d-uniform"));
    expect(frameEntry?.entries[0]?.resource).toEqual({ buffer: frameHandle });
    expect(writes.find((write) => write.label === frameHandle?.label)?.values.slice(32, 48)).toEqual([...frameData.slice(32, 48)]);
    const materialWrite = writes.find((write) => write.label === "draw-generated-material")!.values;
    expect(materialWrite.slice(0, 16)).toEqual(model);
    expect(materialWrite.slice(16, 32)).toEqual(geometry);
    expect(materialWrite.slice(32, 36)).toEqual([0.25, 0.5, 0.75, expect.closeTo(0.8)]);
    expect(materialWrite.slice(36, 40)).toEqual([expect.closeTo(0.4), expect.closeTo(0.3), expect.closeTo(0.2), 2]);
    expect(materialWrite.slice(40, 46)).toEqual([expect.closeTo(0.1), expect.closeTo(0.2), expect.closeTo(0.3), 3, expect.closeTo(0.6), expect.closeTo(0.45)]);
    const submissions = native.queue.submit.mock.calls.length;
    // The same resources reuse the cached bind group; a new sampler forces a fresh group, whose creation fails.
    const groupsBefore = groups.length;
    device.draw(draw);
    expect(groups).toHaveLength(groupsBefore);
    const resampled = new Map(uniforms);
    resampled.set("u_baseColorMap", new TextureBinding({ name: "u_baseColorMap", texture, sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }) }));
    failBindGroup = true;
    expect(() => device.draw({ ...draw, uniforms: resampled })).toThrow("bind failed");
    expect(native.queue.submit).toHaveBeenCalledTimes(submissions + 1);
    const materialBuffers = buffers.filter((buffer) => buffer.label === "draw-generated-material");
    // One pooled material buffer serves every draw; the failed draw hands it back instead of destroying it.
    expect(materialBuffers).toHaveLength(1);
    releaseFence(); await fence; await Promise.resolve();
    expect(materialBuffers[0]!.destroy).not.toHaveBeenCalled();
    failBindGroup = false;
    frame.dispose();
    expect(() => device.draw(draw)).toThrow(/disposed/);
    compute.dispose(); device.endFrame(); texture.dispose(); device.dispose();
  });

  it("does not treat every generated program as the ambient PBR variant", async () => {
    const native = fakeNative().native;
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as WebGPUDeviceLike } });
    const features = { lighting: "lit" as const, maps: { baseColor: { uvSet: 0 as const, transform: false } } };
    const check = (vertex: string, fragment: string) => device.createShaderProgram({ label: "generated", marker: GENERATED_PROGRAM_MARKER, vertex, fragment });
    const direct = generateProgramImpl(normalizeProgramFeatures({ ...features, lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } }));
    const environment = generateProgramImpl(normalizeProgramFeatures({ ...features, environment: "pmrem-cube" }));
    const transformed = generateProgramImpl(normalizeProgramFeatures({ ...features, maps: { baseColor: { uvSet: 0, transform: true } } }));
    for (const generated of [direct, environment, transformed]) expect(() => check(generated.vertex, generated.fragment)).toThrow(/No WGSL program/);
    const ambient = generateProgramImpl(normalizeProgramFeatures(features));
    expect(() => check(ambient.vertex, `${ambient.fragment}\n// unrecognized contributor`)).toThrow(/No WGSL program/);
    device.dispose();
  });

  it("reallocates changing media sizes and cleans failed uploads", async () => {
    const base = fakeNative().native;
    let fail = false;
    const copies: unknown[] = [];
    const completeFences: (() => void)[] = [];
    const handles: { descriptor: unknown; destroy: ReturnType<typeof vi.fn>; createView: () => unknown }[] = [];
    const native = {
      ...base,
      queue: { ...base.queue,
        onSubmittedWorkDone: () => new Promise<void>((resolve) => completeFences.push(resolve)),
        copyExternalImageToTexture(_source: unknown, destination: unknown) { if (fail) throw new Error("copy failed"); copies.push(destination); } },
      createTexture(descriptor: unknown) {
        const handle = { descriptor, destroy: vi.fn(), createView: () => ({}) };
        handles.push(handle); return handle;
      }
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const source = { width: 2, height: 2 };
    const texture = new Texture({ width: 2, height: 2, source: source as unknown as TexImageSource, dynamic: true, generateMipmaps: false });
    const first = device.getNativeTexture(texture);
    source.width = 4;
    expect(device.getNativeTexture(texture)).not.toBe(first);
    expect(handles[0]!.destroy).not.toHaveBeenCalled();
    expect(completeFences).toHaveLength(1);
    completeFences[0]!();
    await Promise.resolve();
    expect(handles[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(handles[1]!.descriptor).toMatchObject({ size: { width: 4, height: 2, depthOrArrayLayers: 1 } });
    source.width = 8; fail = true;
    expect(() => device.getNativeTexture(texture)).toThrow("copy failed");
    // A throwing queue callback may have enqueued work before throwing. The
    // failed allocation and the replaced allocation stay alive until fenced.
    expect(handles[1]!.destroy).not.toHaveBeenCalled();
    expect(handles[2]!.destroy).not.toHaveBeenCalled();
    expect(completeFences).toHaveLength(3);
    completeFences[2]!();
    await Promise.resolve();
    expect(handles[2]!.destroy).toHaveBeenCalledTimes(1);
    expect(handles[1]!.destroy).not.toHaveBeenCalled();
    completeFences[1]!();
    await Promise.resolve();
    expect(handles[1]!.destroy).toHaveBeenCalledTimes(1);
    fail = false;
    expect(device.getNativeTexture(texture)).toBe(handles[3]);
    expect(copies).toHaveLength(3);
    texture.dispose(); device.dispose();
    for (const complete of completeFences) complete();
    await Promise.resolve();
    expect(handles[3]!.destroy).toHaveBeenCalledTimes(1);
  });

  it("uses target attachments as borrowed textures and preserves externally submitted output", async () => {
    const a = fakeNative().native; const b = fakeNative().native;
    const passes: string[] = [];
    const native = { ...a, createCommandEncoder: () => ({ beginRenderPass: (descriptor: { label?: string }) => {
      passes.push(descriptor.label ?? "");
      return { setPipeline() {}, setVertexBuffer() {}, draw() {}, end() {} };
    }, finish: () => ({}) }) };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const other = await WebGPUDevice.create({ adapter: { requestDevice: async () => b as WebGPUDeviceLike } });
    const target = device.createRenderTarget({ width: 2, height: 2, depth: false, label: "surface" });
    expect(() => device.executeWebGPUTaa(target, { v2: {} } as never)).toThrow(/temporal reconstruction v2 is not connected/);
    expect(() => other.getNativeTexture(target.colorTexture)).toThrow(/another device/);
    device.beginFrame(2, 2); device.setRenderTarget(target);
    device.getNativeRenderSurface(target);
    const attachment = device.getNativeTexture(target.colorTexture);
    device.resourceInterop.submit(["external"], [{ resource: attachment, mode: "write" }]);
    device.markNativeRenderSurfaceWritten(target);
    device.setRenderTarget(null);
    expect(passes).not.toContain("surface-native-clear-pass");
    device.endFrame(); device.dispose(); other.dispose();
  });

  it("maps complete draw state, multiple streams and per-instance attributes into native commands", async () => {
    const base = fakeNative().native;
    const descriptors: any[] = [];
    const dynamics: unknown[][] = [];
    const streams: unknown[][] = [];
    const native = {
      ...base,
      createRenderPipeline(descriptor: unknown) { descriptors.push(descriptor); return { getBindGroupLayout: () => ({}) }; },
      createCommandEncoder: () => ({
        beginRenderPass: () => ({
          setPipeline() {}, setVertexBuffer(slot: number, buffer: unknown) { streams.push([slot, buffer]); }, setBindGroup() {}, draw() {}, end() {},
          setScissorRect(...args: number[]) { dynamics.push(["scissor", ...args]); },
          setBlendConstant(value: readonly number[]) { dynamics.push(["blend", ...value]); },
          setStencilReference(value: number) { dynamics.push(["stencil", value]); }
        }), finish: () => ({})
      })
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const target = device.createRenderTarget({ width: 8, height: 6 });
    const shader = device.createShaderProgram({
      label: "state", marker: "state",
      vertex: "// state\nlayout(location=0) in vec3 a_position;\nlayout(location=1) in vec4 a_color;\nlayout(location=2) in vec4 a_instance;\nvoid main(){}",
      fragment: "// state\nvoid main(){}", portableBindings: [],
      webgpu: { vertex: "/* @aura3d-bindings */\n@vertex fn main(@location(0) p: vec3<f32>, @location(1) c: vec4<f32>, @location(2) i: vec4<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(p+i.xyz,1.0); }", fragment: "/* @aura3d-bindings */\n@fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }" }
    });
    const position = device.createBuffer("vertex", 36);
    const color = device.createBuffer("vertex", 12);
    const instances = device.createBuffer("vertex", 32);
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "custom:color", components: 4, offset: 0, type: "uint8", normalized: true, bufferSlot: 1, shaderLocation: 1 }
    ], 12, [{ slot: 1, stride: 4 }]);
    const state: RenderCommandState = {
      depthTest: true, depthWrite: true, cullMode: "front", frontFace: "cw", blend: false, depthCompare: "less-equal", depthCompareV2: "greater",
      blendMode: { kind: "custom", color: { equation: "reverse-subtract", src: "constant", dst: "one-minus-src-alpha" }, alpha: { equation: "max", src: "zero", dst: "dst-alpha" } },
      colorWrite: [true, false, true, false], sampleMask: 3, blendConstant: [0.1, 0.2, 0.3, 0.4],
      scissor: { x: -2, y: 1, width: 6, height: 4 }, polygonOffset: { factor: 1.5, units: 2, clamp: 0.25 },
      stencil: { compare: "not-equal", reference: 7, readMask: 3, writeMask: 15, fail: "increment", depthFail: "decrement", depthPass: "replace" }
    };
    const command = { topology: "triangles" as const, vertexBuffer: position, vertexBuffers: [position, color], vertexFormat: format, vertexCount: 3, instanceCount: 2,
      instanceAttributes: [{ buffer: instances, shaderName: "a_instance", components: 4 as const, offset: 0, stride: 16 }], shader, renderState: state };
    device.beginFrame(8, 6); device.setRenderTarget(target);
    device.draw(command);
    device.draw({ ...command, renderState: { ...state, blendConstant: [0, 0, 0, 1], stencil: { ...state.stencil, reference: 8 } } });
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].primitive).toMatchObject({ topology: "triangle-list", cullMode: "front", frontFace: "cw" });
    expect(descriptors[0].fragment.targets[0]).toMatchObject({ writeMask: 5, blend: {
      color: { operation: "reverse-subtract", srcFactor: "constant", dstFactor: "one-minus-src-alpha" },
      alpha: { operation: "max", srcFactor: "one", dstFactor: "one" }
    } });
    expect(descriptors[0].depthStencil).toMatchObject({ depthWriteEnabled: true, depthCompare: "greater", depthBias: 2, depthBiasSlopeScale: 1.5, depthBiasClamp: 0.25,
      stencilReadMask: 3, stencilWriteMask: 15, stencilFront: { compare: "not-equal", failOp: "increment-clamp", depthFailOp: "decrement-clamp", passOp: "replace" } });
    expect(descriptors[0].multisample).toMatchObject({ count: 1, mask: 3 });
    expect(descriptors[0].vertex.buffers).toMatchObject([
      { arrayStride: 12, stepMode: "vertex", attributes: [{ shaderLocation: 0, format: "float32x3" }] },
      { arrayStride: 4, stepMode: "vertex", attributes: [{ shaderLocation: 1, format: "unorm8x4" }] },
      { arrayStride: 16, stepMode: "instance", attributes: [{ shaderLocation: 2, format: "float32x4" }] }
    ]);
    expect(streams.slice(0, 3).map(([slot]) => slot)).toEqual([0, 1, 2]);
    expect(dynamics).toContainEqual(["scissor", 0, 1, 4, 4]);
    expect(dynamics).toContainEqual(["blend", 0.1, 0.2, 0.3, 0.4]);
    expect(dynamics).toContainEqual(["stencil", 8]);
    device.draw({ ...command, renderState: { ...state, cullMode: "back" } });
    expect(descriptors).toHaveLength(2);
    expect(() => device.draw({ ...command, renderState: { ...state, alphaToCoverage: true } })).toThrow(/multisampling/);
    device.endFrame(); device.dispose();
  });

  it("maps scalar 8- and 16-bit vertex formats and checks their actual byte bounds", async () => {
    const base = fakeNative().native;
    const descriptors: any[] = [];
    const native = { ...base, createRenderPipeline(descriptor: unknown) {
      descriptors.push(descriptor); return { getBindGroupLayout: () => ({}) };
    } };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const target = device.createRenderTarget({ width: 4, height: 4, depth: false });
    const full = device.createBuffer("vertex", 12);
    const short = device.createBuffer("vertex", 11);
    const cases = [
      { type: "uint8", integer: true, format: "uint8", shaderType: "u32", glslType: "uint", offset: 3 },
      { type: "int8", integer: true, format: "sint8", shaderType: "i32", glslType: "int", offset: 3 },
      { type: "uint16", integer: true, format: "uint16", shaderType: "u32", glslType: "uint", offset: 2 },
      { type: "int16", integer: true, format: "sint16", shaderType: "i32", glslType: "int", offset: 2 },
      { type: "uint8", normalized: true, format: "unorm8", shaderType: "f32", glslType: "float", offset: 3 },
      { type: "int8", normalized: true, format: "snorm8", shaderType: "f32", glslType: "float", offset: 3 },
      { type: "uint16", normalized: true, format: "unorm16", shaderType: "f32", glslType: "float", offset: 2 },
      { type: "int16", normalized: true, format: "snorm16", shaderType: "f32", glslType: "float", offset: 2 }
    ] as const;
    const shaders = new Map<string, ReturnType<typeof device.createShaderProgram>>();
    try {
      device.beginFrame(4, 4); device.setRenderTarget(target);
      for (const test of cases) {
        let shader = shaders.get(test.shaderType);
        if (!shader) {
          const marker = `scalar-${test.shaderType}`;
          shader = device.createShaderProgram({ label: marker, marker,
            vertex: `// ${marker}\nlayout(location=0) in ${test.glslType} a_scalar;\nvoid main(){}`,
            fragment: `// ${marker}\nvoid main(){}`,
            webgpu: {
              vertex: `@vertex fn main(@location(0) value: ${test.shaderType}) -> @builtin(position) vec4<f32> { return vec4<f32>(f32(value), 0.0, 0.0, 1.0); }`,
              fragment: "@fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }"
            }
          });
          shaders.set(test.shaderType, shader);
        }
        const format = new VertexFormat([{ semantic: "custom:scalar", shaderName: "a_scalar", shaderLocation: 0,
          type: test.type, components: 1, offset: test.offset, ...("integer" in test ? { integer: true } : { normalized: true }) }], 4);
        const command = { topology: "triangles" as const, vertexBuffer: full, vertexFormat: format, vertexCount: 3, shader };
        const before = native.queue.submit.mock.calls.length;
        device.draw(command);
        expect(native.queue.submit).toHaveBeenCalledTimes(before + 1);
        expect(descriptors.at(-1).vertex.buffers[0]).toMatchObject({ arrayStride: 4, stepMode: "vertex",
          attributes: [{ shaderLocation: 0, offset: test.offset, format: test.format }] });
        expect(() => device.draw({ ...command, vertexBuffer: short })).toThrow(/vertex stream is too small/i);
        expect(native.queue.submit).toHaveBeenCalledTimes(before + 1);
      }
      expect(descriptors).toHaveLength(cases.length);
    } finally {
      device.setRenderTarget(null); device.endFrame();
      for (const shader of shaders.values()) shader.dispose();
      full.dispose(); short.dispose(); target.dispose(); device.dispose();
    }
  });

  const convertedCases: readonly {
    name: string;
    type: Exclude<VertexAttributeType, "float32">;
    components: 1 | 2 | 3 | 4;
    integer?: boolean;
    normalized?: boolean;
    format: string;
    values: readonly (readonly number[])[];
    expected: readonly (readonly number[])[];
  }[] = [
    { name: "unnormalized uint8 scalar", type: "uint8", components: 1, format: "float32",
      values: [[255], [17], [91]], expected: [[255], [17]] },
    { name: "unnormalized int16 scalar", type: "int16", components: 1, format: "float32",
      values: [[-32768], [-1], [32767]], expected: [[-32768], [-1]] },
    { name: "unnormalized int8x2", type: "int8", components: 2, format: "float32x2",
      values: [[-128, 127], [-1, 42], [12, 13]], expected: [[-128, 127], [-1, 42]] },
    { name: "unnormalized uint16x4", type: "uint16", components: 4, format: "float32x4",
      values: [[0, 32768, 65535, 15], [65535, 1, 42, 12], [1, 2, 3, 4]],
      expected: [[0, 32768, 65535, 15], [65535, 1, 42, 12]] },
    { name: "unnormalized uint32 scalar with float rounding", type: "uint32", components: 1, format: "float32",
      values: [[4294967295], [16777217], [1]], expected: [[4294967296], [16777216]] },
    { name: "unnormalized int32x2 with float rounding", type: "int32", components: 2, format: "float32x2",
      values: [[-2147483648, 16777217], [2147483647, -16777217], [1, 2]],
      expected: [[-2147483648, 16777216], [2147483648, -16777216]] },
    { name: "integer uint8x3", type: "uint8", components: 3, integer: true, format: "uint32x3",
      values: [[0, 128, 255], [255, 1, 7], [1, 2, 3]], expected: [[0, 128, 255], [255, 1, 7]] },
    { name: "integer int8x3", type: "int8", components: 3, integer: true, format: "sint32x3",
      values: [[-128, -1, 127], [-1, 0, 42], [1, 2, 3]], expected: [[-128, -1, 127], [-1, 0, 42]] },
    { name: "integer uint16x3", type: "uint16", components: 3, integer: true, format: "uint32x3",
      values: [[0, 32768, 65535], [65535, 1, 42], [1, 2, 3]], expected: [[0, 32768, 65535], [65535, 1, 42]] },
    { name: "integer int16x3", type: "int16", components: 3, integer: true, format: "sint32x3",
      values: [[-32768, -1, 32767], [-1234, 0, 42], [1, 2, 3]], expected: [[-32768, -1, 32767], [-1234, 0, 42]] },
    { name: "normalized uint8x3", type: "uint8", components: 3, normalized: true, format: "float32x3",
      values: [[0, 128, 255], [255, 1, 127], [1, 2, 3]],
      expected: [[0, Math.fround(128 / 255), 1], [1, Math.fround(1 / 255), Math.fround(127 / 255)]] },
    { name: "normalized int8x3", type: "int8", components: 3, normalized: true, format: "float32x3",
      values: [[-128, -64, 127], [-127, 0, 64], [1, 2, 3]],
      expected: [[-1, Math.fround(-64 / 127), 1], [-1, 0, Math.fround(64 / 127)]] },
    { name: "normalized uint16x3", type: "uint16", components: 3, normalized: true, format: "float32x3",
      values: [[0, 32768, 65535], [65535, 1, 32767], [1, 2, 3]],
      expected: [[0, Math.fround(32768 / 65535), 1], [1, Math.fround(1 / 65535), Math.fround(32767 / 65535)]] },
    { name: "normalized int16x3", type: "int16", components: 3, normalized: true, format: "float32x3",
      values: [[-32768, -16384, 32767], [-32767, 1, 16384], [1, 2, 3]],
      expected: [[-1, Math.fround(-16384 / 32767), 1], [-1, Math.fround(1 / 32767), Math.fround(16384 / 32767)]] }
  ];

  it.each(convertedCases)("submits exact $name conversion values and attributes", async (example) => {
    const recorded = fakeVertexConversionNative();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => recorded.native as unknown as WebGPUDeviceLike } });
    const target = device.createRenderTarget({ width: 4, height: 4, depth: false });
    const width = example.type.endsWith("8") ? 1 : example.type.endsWith("16") ? 2 : 4;
    const offset = width;
    const stride = width * (example.components + 2);
    const backing = new Uint8Array(stride * example.values.length + 8).fill(0xdd);
    const source = backing.subarray(4, 4 + stride * example.values.length);
    const input = new DataView(source.buffer, source.byteOffset, source.byteLength);
    for (const [record, values] of example.values.entries()) for (const [component, value] of values.entries()) {
      const at = record * stride + offset + component * width;
      switch (example.type) {
        case "uint8": input.setUint8(at, value); break;
        case "int8": input.setInt8(at, value); break;
        case "uint16": input.setUint16(at, value, true); break;
        case "int16": input.setInt16(at, value, true); break;
        case "uint32": input.setUint32(at, value, true); break;
        case "int32": input.setInt32(at, value, true); break;
      }
    }
    const vertexBuffer = device.createBuffer("vertex", source.byteLength, source);
    const vertexFormat = new VertexFormat([{ semantic: "custom:value", shaderLocation: 3, type: example.type,
      components: example.components, offset, integer: example.integer, normalized: example.normalized }], stride);
    const scalar = example.integer ? (example.type.startsWith("uint") ? "u32" : "i32") : "f32";
    const inputType = example.components === 1 ? scalar : `vec${example.components}<${scalar}>`;
    const glslType = example.components === 1 ? (scalar === "f32" ? "float" : scalar === "i32" ? "int" : "uint")
      : `${scalar === "f32" ? "" : scalar === "i32" ? "i" : "u"}vec${example.components}`;
    const marker = "vertex-conversion";
    const shader = device.createShaderProgram({ label: marker, marker,
      vertex: `// ${marker}\nlayout(location=3) in ${glslType} a_value;\nvoid main(){}`,
      fragment: `// ${marker}\nvoid main(){}`,
      webgpu: { vertex: `@vertex fn main(@location(3) value: ${inputType}) -> @builtin(position) vec4<f32> { return vec4<f32>(f32(${example.components === 1 ? "value" : "value.x"}),0.0,0.0,1.0); }`,
        fragment: "@fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }" } });
    try {
      device.beginFrame(4, 4); device.setRenderTarget(target);
      device.drawChecked({ topology: "triangles", vertexBuffer, vertexFormat, firstVertex: 1, vertexCount: 1, shader });
      expect(recorded.native.queue.submit).toHaveBeenCalledTimes(1);
      expect(recorded.draws).toEqual([[1, 1, 1]]);
      expect(recorded.pipelines).toHaveLength(1);
      expect(recorded.pipelines[0]).toMatchObject({ vertex: { buffers: [{
        arrayStride: example.components * 4, stepMode: "vertex",
        attributes: [{ shaderLocation: 3, offset: 0, format: example.format }]
      }] } });
      expect(recorded.bindings).toHaveLength(1);
      const binding = recorded.bindings[0]!;
      expect(binding.slot).toBe(0);
      const allocation = recorded.buffers.find(({ handle }) => handle === binding.buffer);
      // The third source record is not referenced; firstVertex still requires retaining records 0 and 1.
      const outputBytes = 2 * example.components * 4;
      expect(allocation).toMatchObject({ label: expect.stringMatching(/^aura3d-vertex-conversion-/), size: outputBytes });
      const uploads = recorded.uploads.filter(({ buffer }) => buffer === binding.buffer);
      expect(uploads).toHaveLength(1);
      expect(uploads[0]!.offset).toBe(0);
      expect(uploads[0]!.bytes.byteLength).toBe(outputBytes);
      const output = new DataView(uploads[0]!.bytes.buffer, uploads[0]!.bytes.byteOffset, outputBytes);
      const actual = Array.from({ length: 2 * example.components }, (_, index) => {
        if (!example.integer) return output.getFloat32(index * 4, true);
        return scalar === "u32" ? output.getUint32(index * 4, true) : output.getInt32(index * 4, true);
      });
      expect(actual).toEqual(example.expected.flat());
      if (example.normalized) expect(actual.every((value) => value >= (example.type.startsWith("uint") ? 0 : -1) && value <= 1)).toBe(true);
      expect(device.readBuffer(vertexBuffer)).toEqual(source);
    } finally {
      device.setRenderTarget(null); device.endFrame(); shader.dispose(); vertexBuffer.dispose(); target.dispose(); device.dispose();
    }
  });

  it("repacks converted and direct interleaved attributes without changing the direct fields", async () => {
    const recorded = fakeVertexConversionNative();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => recorded.native as unknown as WebGPUDeviceLike } });
    const target = device.createRenderTarget({ width: 4, height: 4, depth: false });
    const source = new Uint8Array(16);
    const input = new DataView(source.buffer);
    input.setFloat32(0, 1.25, true);
    source.set([0, 128, 255], 4);
    source.set([200, 7], 8);
    input.setInt16(10, -32768, true);
    input.setFloat32(12, 2.5, true);
    const vertexBuffer = device.createBuffer("vertex", source.byteLength, source);
    const vertexFormat = new VertexFormat([
      { semantic: "custom:position", shaderLocation: 0, type: "float32", components: 1, offset: 0 },
      { semantic: "custom:color", shaderLocation: 1, type: "uint8", components: 3, offset: 4, normalized: true },
      { semantic: "custom:tag", shaderLocation: 2, type: "uint8", components: 2, offset: 8, integer: true },
      { semantic: "custom:weight", shaderLocation: 3, type: "int16", components: 1, offset: 10 },
      { semantic: "custom:other", shaderLocation: 4, type: "float32", components: 1, offset: 12 }
    ], 16);
    const marker = "interleaved-conversion";
    const shader = device.createShaderProgram({ label: marker, marker,
      vertex: `// ${marker}\nvoid main(){}`, fragment: `// ${marker}\nvoid main(){}`,
      webgpu: {
        vertex: "@vertex fn main(@location(0) p: f32, @location(1) c: vec3<f32>, @location(2) tag: vec2<u32>, @location(3) weight: f32, @location(4) other: f32) -> @builtin(position) vec4<f32> { return vec4<f32>(p+c.x+f32(tag.x)+weight+other,0.0,0.0,1.0); }",
        fragment: "@fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }"
      } });
    try {
      device.beginFrame(4, 4); device.setRenderTarget(target);
      device.drawChecked({ topology: "triangles", vertexBuffer, vertexFormat, vertexCount: 1, shader });
      expect(recorded.draws).toEqual([[1, 1, 0]]);
      expect(recorded.pipelines[0]).toMatchObject({ vertex: { buffers: [{
        arrayStride: 28, stepMode: "vertex", attributes: [
          { shaderLocation: 0, offset: 0, format: "float32" },
          { shaderLocation: 1, offset: 4, format: "float32x3" },
          { shaderLocation: 2, offset: 16, format: "uint8x2" },
          { shaderLocation: 3, offset: 20, format: "float32" },
          { shaderLocation: 4, offset: 24, format: "float32" }
        ]
      }] } });
      const bound = recorded.bindings[0]!.buffer;
      expect(recorded.buffers.find(({ handle }) => handle === bound)).toMatchObject({ size: 28 });
      const upload = recorded.uploads.find(({ buffer }) => buffer === bound)!;
      expect(upload.bytes.byteLength).toBe(28);
      const output = new DataView(upload.bytes.buffer, upload.bytes.byteOffset, upload.bytes.byteLength);
      expect([output.getFloat32(0, true), output.getFloat32(4, true), output.getFloat32(8, true), output.getFloat32(12, true)])
        .toEqual([1.25, 0, Math.fround(128 / 255), 1]);
      expect([...upload.bytes.slice(16, 20)]).toEqual([200, 7, 0, 0]);
      expect([output.getFloat32(20, true), output.getFloat32(24, true)]).toEqual([-32768, 2.5]);
    } finally {
      device.setRenderTarget(null); device.endFrame(); shader.dispose(); vertexBuffer.dispose(); target.dispose(); device.dispose();
    }
  });

  it("bounds converted output and rejects short sources or oversized expansions before allocating", async () => {
    const recorded = fakeVertexConversionNative(24);
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => recorded.native as unknown as WebGPUDeviceLike } });
    const target = device.createRenderTarget({ width: 4, height: 4, depth: false });
    const source = Uint8Array.of(0, 128, 255, 255, 128, 0, 42, 43, 44);
    const vertexBuffer = device.createBuffer("vertex", source.byteLength, source);
    const short = device.createBuffer("vertex", 5, source.subarray(0, 5));
    const vertexFormat = new VertexFormat([{ semantic: "custom:value", shaderLocation: 0, type: "uint8", components: 3, offset: 0, normalized: true }]);
    const marker = "bounded-conversion";
    const shader = device.createShaderProgram({ label: marker, marker,
      vertex: `// ${marker}\nvoid main(){}`, fragment: `// ${marker}\nvoid main(){}`,
      webgpu: { vertex: "@vertex fn main(@location(0) value: vec3<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(value,1.0); }",
        fragment: "@fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }" } });
    try {
      device.beginFrame(4, 4); device.setRenderTarget(target);
      const command = { topology: "triangles" as const, vertexBuffer, vertexFormat, vertexCount: 2, shader };
      device.drawChecked(command);
      const bound = recorded.bindings[0]!.buffer;
      expect(recorded.buffers.find(({ handle }) => handle === bound)).toMatchObject({ size: 24 });
      expect(recorded.uploads.find(({ buffer }) => buffer === bound)?.bytes.byteLength).toBe(24);
      expect(recorded.native.queue.submit).toHaveBeenCalledTimes(1);
      const before = [recorded.buffers.length, recorded.uploads.length, recorded.pipelines.length,
        recorded.draws.length, recorded.native.queue.submit.mock.calls.length];
      expect(() => device.drawChecked({ ...command, vertexCount: 3 }))
        .toThrowError(expect.objectContaining({ code: "WEBGPU_VERTEX_CONVERSION_LIMIT" }));
      expect([recorded.buffers.length, recorded.uploads.length, recorded.pipelines.length,
        recorded.draws.length, recorded.native.queue.submit.mock.calls.length]).toEqual(before);
      expect(() => device.drawChecked({ ...command, vertexBuffer: short }))
        .toThrowError(expect.objectContaining({ code: "WEBGPU_VERTEX_BUFFER_TOO_SMALL" }));
      expect([recorded.buffers.length, recorded.uploads.length, recorded.pipelines.length,
        recorded.draws.length, recorded.native.queue.submit.mock.calls.length]).toEqual(before);
    } finally {
      device.setRenderTarget(null); device.endFrame(); shader.dispose(); vertexBuffer.dispose(); short.dispose(); target.dispose(); device.dispose();
    }
  });

  it.each([
    { name: "16 MiB expanded-byte", components: 3, count: 1_398_102, message: "Vertex conversion exceeds its buffer limit" },
    { name: "one-million-operation", components: 1, count: 1_000_001, message: "Vertex conversion exceeds its draw work limit" }
  ] as const)("enforces the $name limit before allocating or submitting", async ({ components, count, message }) => {
    const recorded = fakeVertexConversionNative();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => recorded.native as unknown as WebGPUDeviceLike } });
    const target = device.createRenderTarget({ width: 4, height: 4, depth: false });
    // Zero-initialized CPU shadows suffice: neither rejected path should visit or upload the expanded records.
    const vertexBuffer = device.createBuffer("vertex", count * components);
    const vertexFormat = new VertexFormat([{ semantic: "custom:value", shaderLocation: 0, type: "uint8", components, offset: 0 }]);
    const marker = "conversion-work-limit";
    const shader = device.createShaderProgram({ label: marker, marker,
      vertex: `// ${marker}\nvoid main(){}`, fragment: `// ${marker}\nvoid main(){}`,
      webgpu: { vertex: `@vertex fn main(@location(0) value: ${components === 1 ? "f32" : "vec3<f32>"}) -> @builtin(position) vec4<f32> { return vec4<f32>(0.0,0.0,0.0,1.0); }`,
        fragment: "@fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }" } });
    try {
      device.beginFrame(4, 4); device.setRenderTarget(target);
      const before = [recorded.buffers.length, recorded.uploads.length];
      expect(() => device.drawChecked({ topology: "triangles", vertexBuffer, vertexFormat, vertexCount: count, shader }))
        .toThrowError(expect.objectContaining({ code: "WEBGPU_VERTEX_CONVERSION_LIMIT", message }));
      expect([recorded.buffers.length, recorded.uploads.length]).toEqual(before);
      expect(recorded.pipelines).toHaveLength(0);
      expect(recorded.bindings).toHaveLength(0);
      expect(recorded.draws).toHaveLength(0);
      expect(recorded.native.queue.submit).not.toHaveBeenCalled();
    } finally {
      device.setRenderTarget(null); device.endFrame(); shader.dispose(); vertexBuffer.dispose(); target.dispose(); device.dispose();
    }
  });

  it.each([
    { type: "uint32", components: 1, mixed: false },
    { type: "int32", components: 1, mixed: false },
    { type: "uint32", components: 3, mixed: false },
    { type: "int32", components: 3, mixed: false },
    { type: "uint32", components: 1, mixed: true },
    { type: "int32", components: 1, mixed: true },
    { type: "uint32", components: 3, mixed: true },
    { type: "int32", components: 3, mixed: true }
  ] as const)("rejects normalized $type x$components even with conversion=$mixed", async ({ type, components, mixed }) => {
    const recorded = fakeVertexConversionNative();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => recorded.native as unknown as WebGPUDeviceLike } });
    const target = device.createRenderTarget({ width: 4, height: 4, depth: false });
    const unsupported = { semantic: "custom:unsupported" as const, shaderLocation: 0, type, components, offset: 0, normalized: true };
    const converted = { semantic: "custom:converted" as const, shaderLocation: 1, type: "uint8" as const,
      components: 1 as const, offset: components * 4 };
    const stride = components * 4 + (mixed ? 4 : 0);
    const vertexFormat = new VertexFormat(mixed ? [converted, unsupported] : [unsupported], stride);
    const source = new Uint8Array(stride);
    const vertexBuffer = device.createBuffer("vertex", source.byteLength, source);
    const marker = "unsupported-normalized32";
    const inputType = components === 1 ? "f32" : "vec3<f32>";
    const shader = device.createShaderProgram({ label: marker, marker,
      vertex: `// ${marker}\nvoid main(){}`, fragment: `// ${marker}\nvoid main(){}`,
      webgpu: { vertex: `@vertex fn main(@location(0) value: ${inputType}${mixed ? ", @location(1) converted: f32" : ""}) -> @builtin(position) vec4<f32> { return vec4<f32>(0.0,0.0,0.0,1.0); }`,
        fragment: "@fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }" } });
    try {
      device.beginFrame(4, 4); device.setRenderTarget(target);
      const before = [recorded.buffers.length, recorded.uploads.length];
      expect(() => device.drawChecked({ topology: "triangles", vertexBuffer, vertexFormat, vertexCount: 1, shader }))
        .toThrowError(expect.objectContaining({ code: "WEBGPU_VERTEX_FORMAT_UNSUPPORTED" }));
      expect([recorded.buffers.length, recorded.uploads.length]).toEqual(before);
      expect(recorded.pipelines).toHaveLength(0);
      expect(recorded.bindings).toHaveLength(0);
      expect(recorded.draws).toHaveLength(0);
      expect(recorded.native.queue.submit).not.toHaveBeenCalled();
    } finally {
      device.setRenderTarget(null); device.endFrame(); shader.dispose(); vertexBuffer.dispose(); target.dispose(); device.dispose();
    }
  });

  it("submits the splat WGSL and its interleaved instance attributes", async () => {
    const base = fakeNative().native;
    const modules: string[] = []; const pipelines: any[] = [];
    const native = { ...base,
      createShaderModule({ code }: { code: string }) { modules.push(code); return {}; },
      createRenderPipeline(descriptor: unknown) { pipelines.push(descriptor); return { getBindGroupLayout: () => ({}) }; }
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const splats = new GaussianSplatRenderer(device, { count: 1, positions: new Float32Array([0, 0, 0]), scales: new Float32Array([0.1, 0.1, 0.1]),
      rotations: new Float32Array([0, 0, 0, 1]), colors: new Float32Array([1, 0, 0]), opacities: new Float32Array([0.5]), shDegree: 0 });
    const target = device.createRenderTarget({ width: 8, height: 8 });
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    device.beginFrame(8, 8); device.setRenderTarget(target);
    expect(splats.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [8, 8] }).visibleCount).toBe(1);
    expect(modules[0]).toContain("center.z + 1.0");
    expect(modules[1]).toContain("exp(-0.5");
    expect(pipelines[0].vertex.buffers[1]).toMatchObject({ arrayStride: 44, stepMode: "instance", attributes: [
      { shaderLocation: 1, offset: 0, format: "float32x3" },
      { shaderLocation: 2, offset: 12, format: "float32x4" },
      { shaderLocation: 3, offset: 28, format: "float32x4" }
    ] });
    splats.dispose(); device.endFrame(); device.dispose();
  });
});

describe("queue resource interop", () => {
  it("orders work and retires resources only after the queue fence", async () => {
    let release!: () => void;
    const fence = new Promise<void>((resolve) => { release = resolve; });
    const submit = vi.fn(); const destroy = vi.fn(); const handle = {};
    const owner = new WebGPUResourceInterop({ submit, onSubmittedWorkDone: () => fence }, 1);
    const other = new WebGPUResourceInterop({ submit }, 2);
    owner.register(handle, destroy);
    expect(() => other.register(handle, destroy)).toThrow("WEBGPU_INTEROP_RESOURCE_OWNED");
    owner.submit(["compute"], [{ resource: handle, mode: "write" }]);
    owner.submit(["draw"], [{ resource: handle, mode: "read" }]);
    const retired = owner.retire(handle);
    expect(() => owner.submit([], [{ resource: handle, mode: "read" }])).toThrow("WEBGPU_INTEROP_RETIRED_RESOURCE");
    expect(destroy).not.toHaveBeenCalled();
    release(); await retired;
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls).toEqual([[['compute']], [['draw']]]);
    await owner.dispose(); other.invalidate();
  });

  it("retains a resource after a failed fence until loss invalidates its generation", async () => {
    const destroy = vi.fn(); const resource = {};
    const interop = new WebGPUResourceInterop({ submit() {}, onSubmittedWorkDone: async () => { throw new Error("fence failed"); } }, 1);
    interop.register(resource, destroy);
    const retired = interop.retire(resource);
    await Promise.resolve(); await Promise.resolve();
    expect(destroy).not.toHaveBeenCalled();
    interop.invalidate();
    await retired;
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe("native WebGPU display effects", () => {
  async function fixture() {
    let finish!: () => void;
    const fence = new Promise<void>((resolve) => { finish = resolve; });
    const base = fakeNative().native;
    const textures: { label: string; destroy: ReturnType<typeof vi.fn>; createView: () => unknown }[] = [];
    const uniformBytes = new Map<object, Uint8Array>();
    const groups: { label?: string; entries: readonly { binding: number; resource: any }[] }[] = [];
    const passes: string[] = [];
    const failure: { draw?: string; submit?: string; onDraw?: () => void } = {};
    const native = { ...base,
      queue: { ...base.queue,
        onSubmittedWorkDone: () => fence,
        submit(commands: readonly { label?: string }[]) {
          if (failure.submit && commands[0]?.label === failure.submit) { failure.submit = undefined; throw new Error("injected post submit failure"); }
        },
        writeBuffer(buffer: object, _offset: number, data: ArrayBuffer | ArrayBufferView) {
          uniformBytes.set(buffer, data instanceof ArrayBuffer ? new Uint8Array(data.slice(0)) : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
        },
        writeTexture() {}
      },
      createSampler: () => ({}),
      createTexture(descriptor: { label?: string }) {
        const handle = { label: descriptor.label ?? "", destroy: vi.fn(), createView: () => ({ texture: handle }) };
        textures.push(handle); return handle;
      },
      createBindGroup(descriptor: { label?: string; entries: readonly { binding: number; resource: any }[] }) { groups.push(descriptor); return {}; },
      createCommandEncoder(descriptor?: { label?: string }) {
        return { beginRenderPass(pass: { label?: string }) {
          passes.push(pass.label ?? "");
          return { setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {
            if (failure.draw && pass.label === failure.draw) {
              failure.draw = undefined;
              const onDraw = failure.onDraw; failure.onDraw = undefined; onDraw?.();
              throw new Error("injected post draw failure");
            }
          }, end() {} };
        }, finish: () => ({ label: descriptor?.label }) };
      }
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const source = device.createRenderTarget({ width: 4, height: 4, format: "rgba8", depth: false, label: "source" });
    const output = device.createRenderTarget({ width: 4, height: 4, format: "rgba8", depth: false, label: "output" });
    const params = (group: typeof groups[number]): DataView => {
      const buffer = group.entries.find((entry) => entry.binding === 4)!.resource.buffer;
      const bytes = uniformBytes.get(buffer)!;
      return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    };
    return { device, source, output, textures, groups, passes, params, uniformBytes, failure, finish };
  }

  it.each([false, true])("forwards ordered renderer effects and frame identity to the native backend (async=%s)", async asynchronous => {
    const { device, source, output, groups, passes, params, uniformBytes, finish } = await fixture();
    const runner = new RendererPostprocessPipeline({ device, width: 4, height: 4, fusedLdrPostprocessScratch: {}, frameIndex: 0 } as never);
    const scopeId = {};
    const otherToken = postDiagnostics.begin({}, "main", 1);
    const render = async (frameId: number, toneMapping: false | { operator: "linear" }) => {
      const diagnosticToken = postDiagnostics.begin(scopeId, "main", frameId);
      const options = { v2: true, toneMapping, pipeline: { alphaMode: "opaque", nativeEffects: [{ kind: "pixelation", size: 2 }, { kind: "afterimage", decay: .8 }] },
        postFrameContext: { source: {}, items: [], scopeId, viewId: "main", frameId, diagnosticToken,
          sceneDepth: { texture: null, available: false, linearize: { near: .1, far: 10, orthographic: false } } } } as const;
      if (asynchronous) await runner.executePostprocessAsync(options, [source], output);
      else runner.executePostprocess(options, [source], output);
      return diagnosticToken;
    };
    const firstToken = await render(1, false);
    expect(postStagesRan(firstToken)).toEqual(expect.arrayContaining(["native:pixelation", "native:afterimage"]));
    expect(postStagesRan(otherToken)).toEqual([]);
    expect(passes.filter(label => label.includes("native-effect-")).slice(-2)).toEqual(["webgpu-native-effect-0-pixelation-pass", "webgpu-native-effect-1-afterimage-pass"]);
    const secondToken = await render(2, { operator: "linear" });
    expect(postStagesRan(secondToken)).toEqual(expect.arrayContaining(["native:pixelation", "native:afterimage"]));
    const histories = groups.filter(group => group.label === "webgpu-native-effect-1-afterimage-bind");
    expect(histories.map(group => params(group).getUint32(44, true))).toEqual([0, 1]);
    const present = groups.filter(group => group.label === "webgpu-post-present-bind").at(-1)!;
    const uniform = present.entries.find(entry => entry.binding === 0)!.resource.buffer;
    const bytes = uniformBytes.get(uniform)!;
    expect([...new Float32Array(bytes.buffer, bytes.byteOffset, 4)].slice(2)).toEqual([0, 1]);
    device.dispose(); finish();
  });

  it("records a missing custom WGSL program only in the originating view", async () => {
    const { device, source, output, finish } = await fixture();
    const scope = {}, token = postDiagnostics.begin(scope, "main", 1), other = postDiagnostics.begin({}, "main", 1);
    const unregister = registerPostPass({ id: "webgpu-missing-wgsl-scope", owner: "prd03", flag: "A3D_QR_POST", insertAt: "after-tonemap", space: "display", inputs: ["color"], fragment: { glsl: "void main() {}" }, gpuOnly: true });
    try {
      device.presentLdrPostprocess(source, { outputTarget: output, passes: [], postFrameContext: { scopeId: scope, viewId: "main", frameId: 1, diagnosticToken: token } });
      expect(postSkippedReasons(token)).toContain("WGSL_PROGRAM_MISSING:webgpu-missing-wgsl-scope");
      expect(postSkippedReasons(other)).toEqual([]);
    } finally {
      unregister(); device.dispose(); finish();
    }
  });

  it("shares authored time, frame and a frame-local blackboard across WebGPU custom passes", async () => {
    const { device, source, output, finish } = await fixture();
    const scope = {}, token = postDiagnostics.begin(scope, "main", 8);
    const seen: Array<readonly [number, number, unknown]> = [];
    const common = { owner: "prd03" as const, flag: "A3D_QR_POST" as const, insertAt: "after-tonemap" as const, space: "display" as const,
      inputs: ["color"] as const, fragment: { glsl: "void main() {}", wgsl: "@fragment fn fs_main() -> @location(0) vec4f { return vec4f(1); }" }, gpuOnly: true as const };
    const first = registerPostPass({ ...common, id: "webgpu-frame-first", uniforms: (frame) => {
      seen.push([frame.timeSeconds, frame.frameIndex, frame.blackboard.get("sequence")]);
      frame.blackboard.set("sequence", 1);
      return {};
    } });
    const second = registerPostPass({ ...common, id: "webgpu-frame-second", uniforms: (frame) => {
      seen.push([frame.timeSeconds, frame.frameIndex, frame.blackboard.get("sequence")]);
      return {};
    } });
    try {
      device.presentLdrPostprocess(source, { outputTarget: output, passes: [], postFrameContext: { scopeId: scope, viewId: "main", frameId: 8, timeSeconds: 12.5, diagnosticToken: token } });
      expect(seen).toEqual([[12.5, 8, undefined], [12.5, 8, 1]]);
      device.presentLdrPostprocess(source, { outputTarget: output, passes: [], postFrameContext: { scopeId: scope, viewId: "main", frameId: 8, timeSeconds: 12.5, diagnosticToken: token } });
      expect(seen.slice(2)).toEqual([[12.5, 8, 1], [12.5, 8, 1]]);
      expect(postStagesRan(token)).toEqual(expect.arrayContaining(["custom:webgpu-frame-first@after-tonemap", "custom:webgpu-frame-second@after-tonemap"]));
      const nextToken = postDiagnostics.begin(scope, "main", 9);
      device.presentLdrPostprocess(source, { outputTarget: output, passes: [], postFrameContext: { scopeId: scope, viewId: "main", frameId: 9, timeSeconds: 13.5, diagnosticToken: nextToken } });
      expect(seen.slice(4)).toEqual([[13.5, 9, undefined], [13.5, 9, 1]]);
    } finally {
      first(); second(); device.dispose(); finish();
    }
  });

  it.each([false, true])("rejects unsupported offscreen display-p3 output before submission (async=%s)", async asynchronous => {
    const { device, source, output, passes, finish } = await fixture();
    const runner = new RendererPostprocessPipeline({ device, width: 4, height: 4, fusedLdrPostprocessScratch: {}, frameIndex: 0 } as never);
    const options = { v2: true, toneMapping: false, pipeline: { outputColorSpace: "display-p3", nativeEffects: [{ kind: "pixelation", size: 2 }] } } as const;
    if (asynchronous) await expect(runner.executePostprocessAsync(options, [source], output)).rejects.toMatchObject({ code: "WEBGPU_OUTPUT_COLOR_SPACE_UNSUPPORTED" });
    else expect(() => runner.executePostprocess(options, [source], output)).toThrow(/display-p3/);
    expect(passes).toEqual([]);
    device.dispose(); finish();
  });

  it.each([false, true])("rejects undeclared and unsupported preserving alpha before native presentation (async=%s)", async asynchronous => {
    const { device, source, output, passes, finish } = await fixture();
    const runner = new RendererPostprocessPipeline({ device, width: 4, height: 4, fusedLdrPostprocessScratch: {}, frameIndex: 0 } as never);
    try {
      for (const [inputAlphaMode, code] of [
        [undefined, "OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE"],
        ["premultiplied", "POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE"]
      ] as const) {
        const options = { v2: true, toneMapping: false, pipeline: { outputColorSpace: "srgb", alphaMode: "premultiplied", inputAlphaMode } } as const;
        if (asynchronous) await expect(runner.executePostprocessAsync(options, [source], output)).rejects.toMatchObject({ code });
        else expect(() => runner.executePostprocess(options, [source], output)).toThrowError(expect.objectContaining({ code }));
        expect(passes).toEqual([]);
      }
    } finally { device.dispose(); finish(); }
  });

  it("orders tone, masks, effects and FXAA with exact native bindings and packed fields", async () => {
    const { device, source, output, groups, passes, params, finish } = await fixture();
    const mask = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) });
    const aux = new Texture({ width: 1, height: 1, data: new Uint8Array([0, 0, 255, 255]) });
    const scope = {};
    device.presentLdrPostprocess(source, { outputTarget: output,
      passes: [{ name: "tone-mapping", options: {} }, { name: "fxaa", options: {} }],
      postFrameContext: { scopeId: scope, viewId: "left", frameId: 12 },
      nativeEffects: [{ kind: "mask", texture: mask, invert: true, opacity: 0.4 }, { kind: "pixelation", size: 3 },
        { kind: "transition", texture: aux, progress: 0.25 }, { kind: "clear-mask" }, { kind: "glitch", intensity: 0.5, seed: 7 }] });
    const ordered = passes.filter((label) => label.includes("tone-pass") || label.includes("native-effect-") || label.includes("fxaa-pass"));
    expect(ordered).toEqual(["webgpu-tone-pass", "webgpu-native-effect-1-pixelation-pass", "webgpu-native-effect-2-transition-pass", "webgpu-native-effect-4-glitch-pass", "webgpu-fxaa-pass"]);
    const effectGroups = groups.filter((group) => group.label?.startsWith("webgpu-native-effect-"));
    expect(effectGroups).toHaveLength(3);
    const p0 = params(effectGroups[0]!); const p1 = params(effectGroups[1]!); const p2 = params(effectGroups[2]!);
    expect([p0.byteLength, p0.getUint32(8, true), p0.getFloat32(12, true), p0.getUint32(48, true), p0.getUint32(52, true)]).toEqual([64, 1, 3, 1, 1]);
    expect(p0.getFloat32(56, true)).toBeCloseTo(0.4);
    expect(p1.getUint32(8, true)).toBe(5); expect(p1.getFloat32(36, true)).toBe(0.25);
    expect(p2.getUint32(8, true)).toBe(4); expect(p2.getFloat32(32, true)).toBe(12); expect(p2.getUint32(48, true)).toBe(0);
    const textureAt = (group: typeof groups[number], binding: number) => group.entries.find((entry) => entry.binding === binding)!.resource.texture;
    expect(textureAt(effectGroups[0]!, 2)).toBe(device.getNativeTexture(mask));
    expect(textureAt(effectGroups[1]!, 1)).toBe(device.getNativeTexture(aux));
    expect(mask.disposed).toBe(false); expect(aux.disposed).toBe(false);
    device.dispose(); finish();
    expect(mask.disposed).toBe(false); expect(aux.disposed).toBe(false);
    mask.dispose(); aux.dispose();
  });

  it("isolates afterimage histories by scope and view, promotes only between frames, and fence-retires on reset", async () => {
    const { device, source, textures, groups, params, finish } = await fixture();
    const firstScope = {}, secondScope = {};
    const effects = [{ kind: "afterimage" as const, decay: 0.8 }];
    const draw = (scopeId: object, viewId: string, frameId: number, cameraCut = false) => {
      const result = device.executeWebGPUNativeEffects(source, effects, { scopeId, viewId, frameId, cameraCut });
      result.dispose();
      const group = groups.filter((item) => item.label === "webgpu-native-effect-0-afterimage-bind").at(-1)!;
      return { history: params(group).getUint32(44, true), auxiliary: group.entries.find((entry) => entry.binding === 1)!.resource.texture };
    };
    expect(draw(firstScope, "a", 1).history).toBe(0);
    expect(draw(firstScope, "a", 1).history).toBe(0);
    expect(draw(firstScope, "b", 1).history).toBe(0);
    expect(draw(secondScope, "a", 1).history).toBe(0);
    expect(draw(firstScope, "a", 2).history).toBe(1);
    expect(draw(secondScope, "a", 2).history).toBe(1);
    expect(draw(firstScope, "a", 3, true).history).toBe(0);
    const resized = device.createRenderTarget({ width: 8, height: 4, format: "rgba8", depth: false, label: "resized" });
    device.executeWebGPUNativeEffects(resized, effects, { scopeId: firstScope, viewId: "a", frameId: 4 }).dispose();
    expect(params(groups.filter((item) => item.label === "webgpu-native-effect-0-afterimage-bind").at(-1)!).getUint32(44, true)).toBe(0);
    const histories = textures.filter((texture) => texture.label === "webgpu-afterimage-history");
    expect(histories).toHaveLength(10);
    device.releaseNativePostEffectScope(firstScope);
    expect(histories.every((handle) => handle.destroy.mock.calls.length === 0)).toBe(true);
    expect(draw(secondScope, "a", 3).history).toBe(1);
    finish(); await Promise.resolve(); await Promise.resolve();
    expect(histories.slice(0, 4).every((handle) => handle.destroy.mock.calls.length === 1)).toBe(true);
    expect(histories.slice(4, 6).every((handle) => handle.destroy.mock.calls.length === 0)).toBe(true);
    device.releaseNativePostEffectView(secondScope, "a");
    device.dispose();
  });

  it("aborts failed afterimage writes and later effects while preserving other views", async () => {
    const { device, source, groups, params, failure, finish } = await fixture();
    const scopeId = {};
    const effects = [{ kind: "afterimage" as const, decay: 0.8 }];
    const draw = (viewId: string, frameId: number) => {
      device.executeWebGPUNativeEffects(source, effects, { scopeId, viewId, frameId }).dispose();
      return params(groups.filter((group) => group.label === "webgpu-native-effect-0-afterimage-bind").at(-1)!).getUint32(44, true);
    };
    expect(draw("failed", 1)).toBe(0);
    expect(draw("other", 1)).toBe(0);
    expect(draw("failed", 2)).toBe(1);
    expect(draw("other", 2)).toBe(1);
    failure.draw = "webgpu-native-effect-0-afterimage-pass";
    expect(() => draw("failed", 2)).toThrow("injected post draw failure");
    expect(draw("failed", 3)).toBe(0);
    expect(draw("other", 3)).toBe(1);

    expect(draw("retry", 1)).toBe(0);
    expect(draw("retry", 2)).toBe(1);
    failure.submit = "webgpu-native-effect-0-afterimage-encoder";
    expect(() => draw("retry", 2)).toThrow("injected post submit failure");
    expect(draw("retry", 2)).toBe(1); // a successful same-frame retry can use frame 1
    expect(draw("retry", 3)).toBe(1);

    expect(draw("copy", 1)).toBe(0);
    expect(draw("copy", 2)).toBe(1);
    failure.draw = "webgpu-native-effects-copy-pass";
    expect(() => draw("copy", 2)).toThrow("injected post draw failure");
    expect(draw("copy", 3)).toBe(0);

    expect(draw("stale", 1)).toBe(0);
    failure.draw = "webgpu-native-effect-0-afterimage-pass";
    failure.onDraw = () => device.releaseNativePostEffectView(scopeId, "stale");
    expect(() => draw("stale", 2)).toThrow("injected post draw failure");
    expect(draw("stale", 3)).toBe(0);
    device.dispose(); finish();
  });

  it.each(["webgpu-fxaa-pass", "webgpu-post-present-pass"])("resets afterimage history if later %s fails", async (failedPass) => {
    const { device, source, output, groups, params, failure, textures, finish } = await fixture();
    const scopeId = {};
    const draw = (viewId: string, frameId: number) => {
      device.presentLdrPostprocess(source, { outputTarget: output, passes: [{ name: "fxaa", options: {} }],
        nativeEffects: [{ kind: "afterimage", decay: 0.8 }], postFrameContext: { scopeId, viewId, frameId } });
      return params(groups.filter((group) => group.label === "webgpu-native-effect-0-afterimage-bind").at(-1)!).getUint32(44, true);
    };
    expect(draw("failed", 1)).toBe(0);
    expect(draw("other", 1)).toBe(0);
    expect(draw("failed", 2)).toBe(1);
    expect(draw("other", 2)).toBe(1);
    failure.draw = failedPass;
    expect(() => draw("failed", 2)).toThrow("injected post draw failure");
    const histories = textures.filter((texture) => texture.label === "webgpu-afterimage-history");
    expect(histories.every((texture) => texture.destroy.mock.calls.length === 0)).toBe(true);
    expect(draw("failed", 3)).toBe(0);
    expect(draw("other", 3)).toBe(1);
    finish(); await Promise.resolve(); await Promise.resolve();
    expect(histories.slice(0, 2).every((texture) => texture.destroy.mock.calls.length === 1)).toBe(true);
    device.dispose();
  });

  it("rejects invalid identities and foreign inputs before any effect submission", async () => {
    const a = await fixture(); const b = await fixture();
    expect(() => a.device.executeWebGPUNativeEffects(a.source, [{ kind: "afterimage", decay: 0.5 }])).toThrow(/scope, view and frame/);
    expect(() => a.device.executeWebGPUNativeEffects(a.source, [{ kind: "transition", texture: b.source.colorTexture, progress: 0.5 }])).toThrow(/another device/);
    expect(() => a.device.executeWebGPUNativeEffects(a.source, [{ kind: "pixelation", size: 0 }])).toThrow(/POSTPROCESS_FIELD_INVALID/);
    expect(a.passes).toEqual([]);
    a.device.dispose(); b.device.dispose(); a.finish(); b.finish();
  });
});

describe("portable float32 texture sampling", () => {
  async function fixture(filterable = false, explicitLayouts = true) {
    let lose!: (info: { reason: string }) => void;
    const lost = new Promise<{ reason: string }>((resolve) => { lose = resolve; });
    const base = fakeNative().native;
    const layouts: any[] = [], pipelines: any[] = [], samplers: any[] = [], groups: any[] = [], textures: any[] = [];
    const native = { ...base, lost, features: new Set(filterable ? ["float32-filterable"] : []),
      queue: { ...base.queue, writeTexture() {} },
      ...(explicitLayouts ? {
        createBindGroupLayout(descriptor: unknown) { const layout = { descriptor }; layouts.push(layout); return layout; },
        createPipelineLayout(descriptor: unknown) { return { descriptor }; }
      } : { createBindGroupLayout: undefined, createPipelineLayout: undefined }),
      createRenderPipeline(descriptor: any) {
        pipelines.push(descriptor);
        return { getBindGroupLayout: (index: number) => descriptor.layout === "auto" ? { auto: true } : descriptor.layout.descriptor.bindGroupLayouts[index] };
      },
      createSampler(descriptor: unknown) { const sampler = { descriptor }; samplers.push(sampler); return sampler; },
      createBindGroup(descriptor: unknown) { groups.push(descriptor); return {}; },
      createTexture(descriptor: unknown) {
        const handle = { descriptor, createView: (view?: unknown) => ({ handle, view }), destroy: vi.fn() };
        textures.push(handle); return handle;
      },
      createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setVertexBuffer() {}, setBindGroup() {}, draw() {}, end() {} }), finish: () => ({}) })
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
    const shader = device.createShaderProgram({ label: "float-samples", marker: "float-samples",
      vertex: "// float-samples\nlayout(location=0) in vec3 a_position;\nvoid main(){}", fragment: "// float-samples\nvoid main(){}",
      portableBindings: [{ name: "u_plane", kind: "texture2d" }, { name: "u_volume", kind: "texture3d" }, { name: "u_layers", kind: "texture2d-array" }],
      webgpu: { vertex: "/* @aura3d-bindings */\n@vertex fn main(@location(0) p: vec3<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(p,1.0); }",
        fragment: "/* @aura3d-bindings */\n@fragment fn main() -> @location(0) vec4<f32> { return textureSampleLevel(u_planeTexture,u_planeSampler,vec2<f32>(0.5),0.0) + textureSampleLevel(u_volumeTexture,u_volumeSampler,vec3<f32>(0.5),0.0) + textureSampleLevel(u_layersTexture,u_layersSampler,vec2<f32>(0.5),0,0.0); }" }
    });
    const buffer = device.createBuffer("vertex", 36);
    const plane = new Texture({ width: 2, height: 2, format: "rgba32f", usage: ["sampled"] });
    const volume = new Texture({ width: 2, height: 2, dimension: "3d", depth: 2, format: "r32f", usage: ["sampled"] });
    const layers = new Texture({ width: 2, height: 2, dimension: "2d-array", layers: 2, format: "r32f", usage: ["sampled"] });
    const nearest = new Sampler({ minFilter: "nearest-mipmap-nearest", magFilter: "nearest", addressU: "repeat", addressV: "mirror-repeat", addressW: "repeat" });
    const uniforms = (sampler = nearest) => new Map([
      ["u_plane", new TextureBinding({ name: "u_plane", texture: plane, sampler })],
      ["u_volume", new TextureBinding({ name: "u_volume", texture: volume, sampler })],
      ["u_layers", new TextureBinding({ name: "u_layers", texture: layers, sampler })]
    ]);
    const draw = (values = uniforms()) => device.draw({ topology: "triangles", vertexBuffer: buffer, vertexFormat: VertexFormat.P3, vertexCount: 3, shader, uniforms: values });
    device.beginFrame(2, 2); device.setRenderTarget(target);
    return { device, target, plane, volume, layers, layouts, pipelines, samplers, groups, textures, uniforms, draw, lose };
  }

  it("binds r32float and rgba32float with explicit unfilterable 2D, 3D and array layouts", async () => {
    const f = await fixture();
    f.draw(); f.draw();
    expect(f.pipelines).toHaveLength(1);
    const entries = f.layouts[0].descriptor.entries;
    expect(entries).toEqual([
      { binding: 0, visibility: 3, buffer: { type: "uniform" } },
      { binding: 1, visibility: 3, sampler: { type: "non-filtering" } },
      { binding: 2, visibility: 3, texture: { sampleType: "unfilterable-float", viewDimension: "2d" } },
      { binding: 3, visibility: 3, sampler: { type: "non-filtering" } },
      { binding: 4, visibility: 3, texture: { sampleType: "unfilterable-float", viewDimension: "3d" } },
      { binding: 5, visibility: 3, sampler: { type: "non-filtering" } },
      { binding: 6, visibility: 3, texture: { sampleType: "unfilterable-float", viewDimension: "2d-array" } }
    ]);
    expect(f.samplers[0].descriptor).toMatchObject({ minFilter: "nearest", magFilter: "nearest", mipmapFilter: "nearest", addressModeU: "repeat", addressModeV: "mirror-repeat", addressModeW: "repeat" });
    const group = f.groups[0];
    expect(group.entries.find((entry: any) => entry.binding === 2).resource.handle).toBe(f.device.getNativeTexture(f.plane));
    expect(group.entries.find((entry: any) => entry.binding === 4).resource).toMatchObject({ handle: f.device.getNativeTexture(f.volume), view: { dimension: "3d" } });
    expect(group.entries.find((entry: any) => entry.binding === 6).resource).toMatchObject({ handle: f.device.getNativeTexture(f.layers), view: { dimension: "2d-array" } });
    expect(f.textures.find((texture) => texture === f.device.getNativeTexture(f.volume)).descriptor).toMatchObject({ format: "r32float", dimension: "3d" });
    const rgba = new Texture({ width: 2, height: 2, data: new Uint8Array(16) });
    const changed = f.uniforms(); changed.set("u_plane", new TextureBinding({ name: "u_plane", texture: rgba }));
    f.draw(changed);
    expect(f.pipelines).toHaveLength(2);
    expect(f.layouts[1].descriptor.entries[1]).toEqual({ binding: 1, visibility: 3, sampler: { type: "filtering" } });
    expect(f.layouts[1].descriptor.entries[2]).toEqual({ binding: 2, visibility: 3, texture: { sampleType: "float", viewDimension: "2d" } });
    rgba.dispose(); f.device.endFrame(); f.device.dispose();
  });

  it("keeps requested linear filtering when the feature is enabled", async () => {
    const f = await fixture(true);
    f.draw(f.uniforms(new Sampler({ minFilter: "linear-mipmap-linear", magFilter: "linear", maxAnisotropy: 4 })));
    expect(f.layouts).toHaveLength(1);
    expect(f.layouts[0].descriptor.entries).toContainEqual({ binding: 1, visibility: 3, sampler: { type: "filtering" } });
    expect(f.pipelines[0].layout).not.toBe("auto");
    expect(f.samplers[0].descriptor).toMatchObject({ minFilter: "linear", magFilter: "linear", mipmapFilter: "linear", maxAnisotropy: 4 });
    f.device.endFrame(); f.device.dispose();
  });

  it("rejects unsupported filtering, unavailable layouts, foreign targets and lost devices", async () => {
    const f = await fixture();
    for (const sampler of [new Sampler(), new Sampler({ minFilter: "nearest-mipmap-linear", magFilter: "nearest" }), new Sampler({ minFilter: "nearest", magFilter: "nearest", maxAnisotropy: 2 })]) {
      expect(() => f.draw(f.uniforms(sampler))).toThrow(expect.objectContaining({ code: "WEBGPU_FLOAT32_FILTERING_UNSUPPORTED" }));
    }
    const noLayouts = await fixture(false, false);
    expect(() => noLayouts.draw()).toThrow(/explicit layout required/);
    const other = await fixture();
    const foreign = other.device.createRenderTarget({ width: 2, height: 2, format: "rgba32f", depth: false });
    const values = f.uniforms(); values.set("u_plane", new TextureBinding({ name: "u_plane", texture: foreign.colorTexture, sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }) }));
    expect(() => f.draw(values)).toThrow(/another device/);
    const volumeHandle = f.device.getNativeTexture(f.volume);
    f.lose({ reason: "unknown" }); await Promise.resolve();
    expect(() => f.draw()).toThrow(/lost/i);
    expect((volumeHandle as any).destroy).toHaveBeenCalledTimes(1);
    noLayouts.device.endFrame(); noLayouts.device.dispose(); other.device.endFrame(); other.device.dispose(); f.device.dispose();
  });
});

describe("root backend and compute selection", () => {
  it("submits an async production proof to its target and restores ownership on readback", async () => {
    const target = { dispose: vi.fn() };
    const previous = { label: "previous target" };
    const device = {
      kind: "webgpu", info: { capabilities: ["native-render-pipeline", "canvas-surface"] },
      createRenderTarget: vi.fn(() => target), getRenderTarget: vi.fn(() => previous), setRenderTarget: vi.fn(),
      readPixelsAsync: vi.fn(async () => new Uint8Array([255, 0, 0, 255]))
    };
    const renderer = {
      device, renderAsync: vi.fn(async () => ({ drawCalls: 1 })), getDiagnostics: vi.fn(() => ({ drawCalls: 1 })),
      dispose: vi.fn(), resize: vi.fn(), onDeviceLost: vi.fn(), isDeviceLost: vi.fn(() => false)
    };
    const create = vi.spyOn(Renderer, "create").mockResolvedValue(renderer as never);
    try {
      const backend = await WebGPURendererBackend.create({ width: 1, height: 1, canvas: {} as never });
      const input = { source: { marker: "scene" }, camera: { marker: "camera" }, metadata: { assetId: "asset", meshCount: 1, primitiveCount: 1, materialCount: 1 } };
      const proof = await backend.renderImportedAssetAsync(input as never);
      expect(renderer.renderAsync).toHaveBeenCalledWith({ source: { marker: "scene", renderTarget: target }, camera: input.camera });
      expect(device.readPixelsAsync).toHaveBeenCalledWith(0, 0, 1, 1);
      expect(proof.pixels.centerPixel).toEqual([255, 0, 0, 255]);
      expect(device.setRenderTarget.mock.calls.map(([value]) => value)).toEqual([target, previous]);
      expect(target.dispose).toHaveBeenCalledTimes(1);
      device.readPixelsAsync.mockRejectedValueOnce(new Error("readback failed"));
      await expect(backend.renderImportedAssetAsync(input as never)).rejects.toThrow("readback failed");
      expect(device.setRenderTarget).toHaveBeenLastCalledWith(previous);
      expect(target.dispose).toHaveBeenCalledTimes(2);
      expect(() => backend.renderImportedAsset(input as never)).toThrow(/SYNC_READBACK_UNSUPPORTED/);
      backend.dispose(); backend.dispose();
      expect(renderer.dispose).toHaveBeenCalledTimes(2);
    } finally { create.mockRestore(); }
  });

  it("rejects an already cancelled mount before reading the canvas or scene", async () => {
    const controller = new AbortController(); controller.abort();
    const untouched = new Proxy({}, { get() { throw new Error("mount must not touch inputs"); } });
    await expect(createProductionRuntimeSceneRenderer(untouched as never, untouched as never, undefined, undefined, undefined, undefined, undefined,
      { request: { signal: controller.signal } })).rejects.toMatchObject({ name: "AbortError", code: "RENDERER_MOUNT_CANCELLED" });
  });

  it("validates drawing paths and forwards the requested path through renderer selection", async () => {
    expect(resolveDrawingPathOptions(undefined)).toBeUndefined();
    for (const mode of ["forward", "deferred", "meshlet", "visibility"] as const) {
      expect(resolveDrawingPathOptions({ drawingPath: { mode } } as never)).toEqual({ mode });
      expect(resolveDrawingPathOptions({ drawingPath: { mode, allowFallback: false } } as never)).toEqual({ mode, allowFallback: false });
      expect(resolveDrawingPathOptions({ drawingPath: { mode, allowFallback: true } } as never)).toEqual({ mode, allowFallback: true });
    }
    for (const drawingPath of [null, [], {}, { mode: "invalid" }, { mode: "forward", allowFallback: "yes" }]) {
      expect(() => resolveDrawingPathOptions({ drawingPath } as never)).toThrow(/DRAWING_PATH_OPTION_INVALID/);
    }
    const drawingPath = resolveDrawingPathOptions({ drawingPath: { mode: "meshlet", allowFallback: false } } as never);
    const create = vi.fn(async (options: { backend?: string; drawingPath?: unknown }) => ({
      device: { kind: options.backend, info: { capabilities: ["native-render-pipeline", "canvas-surface"] } }, dispose() {}
    }));
    await createSelectedProductionRenderer({ drawingPath } as never, resolveBackendOptions({ backend: "webgpu" } as never), create as never);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ backend: "webgpu", drawingPath: { mode: "meshlet", allowFallback: false } }));
  });

  it("keeps WebGL default, honors explicit fallback and reports failed GPU features", async () => {
    const requests: string[] = [];
    const renderer = (backend: string) => ({ device: { kind: backend, info: { capabilities: backend === "webgpu" ? ["native-render-pipeline", "canvas-surface"] : [] } }, dispose: vi.fn() });
    const create = vi.fn(async (options: { backend?: string }) => { requests.push(options.backend!); if (options.backend === "webgpu") throw Object.assign(new Error("unavailable"), { code: "WEBGPU_FEATURES_UNAVAILABLE", details: { missingFeatures: ["timestamp-query"] } }); return renderer("webgl2") as never; });
    const normal = await createSelectedProductionRenderer({} as never, resolveBackendOptions(undefined), create as never);
    expect(normal.selection.active).toBe("webgl2");
    await expect(createSelectedProductionRenderer({} as never, resolveBackendOptions({ backend: "webgpu" } as never), create as never)).rejects.toMatchObject({ code: "WEBGPU_FEATURES_UNAVAILABLE" });
    const fallback = await createSelectedProductionRenderer({} as never, resolveBackendOptions({ backend: "auto" } as never), create as never);
    expect(fallback.selection).toMatchObject({ requested: "auto", active: "webgl2", fallbackReason: "WEBGPU_FEATURES_UNAVAILABLE", missingFeatures: ["timestamp-query"] });
    expect(requests).toEqual(["webgl2", "webgpu", "webgpu", "webgl2"]);
    await expect(createSelectedProductionRenderer({} as never, resolveBackendOptions({ backend: "auto" } as never), async () => { throw new Error("unavailable"); })).rejects.toMatchObject({ code: "WEBGPU_FALLBACK_UNAVAILABLE" });
  });

  it("auto-binds compute to the selected device, submits and retires on replacement", () => {
    const first = fakeNative().native; const second = fakeNative().native;
    let selected: typeof first | undefined = first;
    const compute = createComputeSurface(() => selected ? "webgpu" : "webgl2", () => selected as never);
    expect(compute.available).toBe(true);
    const buffer = compute.buffer({ size: 4 });
    const pipeline = compute.pipeline({ wgsl: "@compute @workgroup_size(1) fn main() {}" });
    compute.dispatch({ pipeline, bindings: {}, workgroups: [1] });
    expect(first.queue.submit).toHaveBeenCalledTimes(1);
    expect(() => compute.bind(second as never)).toThrow(/selected WebGPU device/);
    selected = second;
    expect(compute.available).toBe(true);
    expect(buffer.disposed).toBe(true);
    expect(pipeline.disposed).toBe(true);
    selected = undefined;
    expect(compute.available).toBe(false);
    compute.bind(first as never);
    expect(compute.available).toBe(true);
    compute.dispose(); compute.dispose();
    expect(compute.available).toBe(false);
  });
});
