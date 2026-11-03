import { describe, expect, it, vi } from "vitest";
import { createComputeContext } from "../../../packages/rendering/src/compute/ComputeContext";
import type { ComputeGPUDeviceLike, ComputeRenderOwner } from "../../../packages/rendering/src/compute/types";
import type { RenderBuffer } from "../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../packages/rendering/src/Texture";
import { WebGPUDevice } from "../../../packages/rendering/src/WebGPUDevice";
import { WebGPUResourceInterop } from "../../../packages/rendering/src/webgpu/ResourceInterop";
import { createComputeSurface } from "../../../packages/engine/src/agent-api/nodes/compute";
import { createAuraApp } from "../../../packages/engine/src/agent-api/app/createAuraApp";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { texture } from "../../../packages/engine/src/agent-api/nodes/texture";
import { createProductionPrimitiveTextureIntent, resolveAuraTextureRef } from "../../../packages/engine/src/agent-api/compiler/textures";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { validateSceneAssets } from "../../../packages/engine/src/agent-api/diagnostics";
import type { ShaderGraphDocument } from "../../../packages/rendering/src/program/ShaderGraphCompiler";

const WGSL = "@compute @workgroup_size(1) fn main() {}";

function harness() {
  const groups: Array<{ entries: Array<{ binding: number; resource: unknown }> }> = [];
  const submissions: unknown[][] = [];
  const device: ComputeGPUDeviceLike = {
    queue: { submit: (commands) => { submissions.push(commands); }, writeBuffer() {}, onSubmittedWorkDone: async () => {} },
    createShaderModule: () => ({}),
    createComputePipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createSampler: (descriptor) => ({ descriptor }),
    createBuffer: ({ size, usage }) => ({ size, usage, destroy() {}, mapAsync: async () => {}, getMappedRange: () => new ArrayBuffer(size), unmap() {} }),
    createBindGroup: (descriptor) => { groups.push(descriptor as typeof groups[number]); return {}; },
    createCommandEncoder: () => ({
      beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }),
      copyBufferToBuffer() {}, finish: () => ({ command: submissions.length })
    })
  };
  const makeOwner = (generation: number) => {
    const resourceInterop = new WebGPUResourceInterop(device.queue, generation);
    const textures = new Map<Texture, { destroy(): void; createView(descriptor?: object): unknown }>();
    const buffers = new Map<RenderBuffer, { size: number; usage: number; destroyed: number; destroy(): void }>();
    let nextBufferId = 1;
    const createBuffer = (size = 16) => {
      const native = { size, usage: 0x8c, destroyed: 0, destroy() { this.destroyed += 1; },
        mapAsync: async () => {}, getMappedRange: () => new ArrayBuffer(size), unmap() {} };
      const buffer: RenderBuffer & { disposed: boolean } = {
        id: generation * 1000 + nextBufferId++, usage: "storage", byteLength: size, disposed: false,
        // Like WebGPUDevice.retireNative: a lease already destroyed by
        // generation invalidation has nothing left to retire.
        dispose() { if (!this.disposed) { this.disposed = true; if (resourceInterop.owns(native)) void resourceInterop.retire(native); } }
      };
      resourceInterop.register(native, () => native.destroy());
      buffers.set(buffer, native);
      return { buffer, native };
    };
    const owner: ComputeRenderOwner & { generation: number; disposed: boolean; contextLost: boolean } = {
      nativeGpuDevice: device, generation, disposed: false, contextLost: false, resourceInterop,
      createBuffer(_usage, size) { return createBuffer(size).buffer; },
      getNativeTexture(texture) {
        if (texture.disposed) throw new Error("disposed texture");
        let native = textures.get(texture);
        if (!native) {
          const created = { destroy() {}, createView: (descriptor?: object) => ({ texture, descriptor }) };
          resourceInterop.register(created, () => created.destroy());
          texture.onDispose(() => { void resourceInterop.retire(created); });
          textures.set(texture, created);
          native = created;
        }
        return native;
      },
      getNativeStorageBuffer(buffer) {
        const native = buffers.get(buffer);
        if (!native || buffer.disposed) throw new Error("foreign or disposed buffer");
        resourceInterop.assertUsable(native);
        return native;
      }
    };
    return { owner, resourceInterop, textures, createBuffer };
  };
  return { device, groups, submissions, makeOwner };
}

/** A queue-shaped source test double; it does not execute WGSL or rasterize pixels. */
function rootDeviceHarness(onSubmittedWorkDone: () => Promise<void> = async () => {}) {
  interface MockTexture {
    readonly label?: string;
    readonly descriptor: Record<string, unknown>;
    value: string;
    destroyed: number;
    createView(descriptor?: object): { texture: MockTexture; descriptor?: object };
    destroy(): void;
  }
  interface MockBuffer {
    readonly label?: string;
    readonly size: number;
    readonly usage: number;
    readonly bytes: ArrayBuffer;
    destroyed: number;
    destroy(): void;
    mapAsync(): Promise<void>;
    getMappedRange(): ArrayBuffer;
    unmap(): void;
  }
  type Entry = { readonly binding: number; readonly resource: unknown };
  type Group = { readonly entries: readonly Entry[] };
  type Pipeline = { readonly code?: string; getBindGroupLayout(index: number): object };
  const textures: MockTexture[] = [];
  const buffers: MockBuffer[] = [];
  const observations: Array<{ readonly kind: "compute" | "sample"; readonly texture: MockTexture; readonly value: string }> = [];
  const bufferObservations: Array<{ readonly kind: "compute" | "read"; readonly buffer: MockBuffer; readonly value: number }> = [];
  const groups: Group[] = [];
  const makeTexture = (descriptor: Record<string, unknown>): MockTexture => {
    const allocation: MockTexture = {
      label: typeof descriptor.label === "string" ? descriptor.label : undefined,
      descriptor, value: "empty", destroyed: 0,
      createView(viewDescriptor) { return { texture: allocation, descriptor: viewDescriptor }; },
      destroy() { allocation.destroyed += 1; }
    };
    textures.push(allocation);
    return allocation;
  };
  const sampled = (bindings: Iterable<Group>): MockTexture[] => {
    const result: MockTexture[] = [];
    for (const group of bindings) for (const entry of group.entries) {
      const view = entry.resource as { texture?: MockTexture } | null;
      if (view?.texture?.label === "texture.storage") result.push(view.texture);
    }
    return result;
  };
  const storageBuffers = (bindings: Iterable<Group>): MockBuffer[] => {
    const result: MockBuffer[] = [];
    for (const group of bindings) for (const entry of group.entries) {
      const resource = entry.resource as { buffer?: MockBuffer } | null;
      if (resource?.buffer?.label?.startsWith("aura3d-storage-")) result.push(resource.buffer);
    }
    return result;
  };
  const native = {
    features: new Set<string>(),
    queue: {
      submit(commands: readonly { run(): void }[]) { for (const command of commands) command.run(); },
      writeBuffer(buffer: MockBuffer, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const input = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        new Uint8Array(buffer.bytes, offset, input.byteLength).set(input);
      },
      writeTexture() {}, onSubmittedWorkDone
    },
    createBuffer({ label, size, usage }: { label?: string; size: number; usage: number }): MockBuffer {
      const bytes = new ArrayBuffer(size);
      const allocation: MockBuffer = { label, size, usage, bytes, destroyed: 0,
        destroy() { allocation.destroyed += 1; }, mapAsync: async () => {}, getMappedRange: () => bytes, unmap() {} };
      buffers.push(allocation);
      return allocation;
    },
    createTexture: makeTexture,
    createSampler: () => ({}),
    createShaderModule: ({ code }: { code: string }) => ({ code }),
    createComputePipeline: ({ compute }: { compute: { module: { code: string } } }) => ({ code: compute.module.code, getBindGroupLayout: () => ({}) }),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}),
    createBindGroup: ({ entries }: { entries: readonly Entry[] }) => { const group = { entries }; groups.push(group); return group; },
    createCommandEncoder: () => {
      const operations: Array<() => void> = [];
      return {
        beginComputePass() {
          let pipeline: Pipeline | undefined;
          const bound = new Map<number, Group>();
          return {
            setPipeline(value: Pipeline) { pipeline = value; },
            setBindGroup(index: number, value: Group) { bound.set(index, value); },
            dispatchWorkgroups() {
              const output = sampled(bound.values());
              const value = pipeline?.code?.includes("mock-write-green") ? "green" : "red";
              operations.push(() => { for (const item of output) { item.value = value; observations.push({ kind: "compute", texture: item, value }); } });
              if (pipeline?.code?.includes("mock-buffer-write")) {
                const outputBuffers = storageBuffers(bound.values());
                const number = pipeline.code.includes("mock-buffer-write-second") ? 0.75 : 0.25;
                operations.push(() => { for (const item of outputBuffers) {
                  new Float32Array(item.bytes)[0] = number;
                  bufferObservations.push({ kind: "compute", buffer: item, value: number });
                } });
              }
            },
            end() {}
          };
        },
        beginRenderPass() {
          const bound = new Map<number, Group>();
          const draw = () => {
            const input = sampled(bound.values());
            const inputBuffers = storageBuffers(bound.values());
            operations.push(() => { for (const item of input) observations.push({ kind: "sample", texture: item, value: item.value }); });
            operations.push(() => { for (const item of inputBuffers) bufferObservations.push({ kind: "read", buffer: item, value: new Float32Array(item.bytes)[0]! }); });
          };
          return { setPipeline() {}, setBindGroup(index: number, value: Group) { bound.set(index, value); },
            setVertexBuffer() {}, setIndexBuffer() {}, setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {}, draw, drawIndexed: draw, end() {} };
        },
        copyBufferToBuffer() {}, copyTextureToBuffer() {}, copyTextureToTexture() {},
        finish: () => ({ run: () => { for (const operation of operations) operation(); } })
      };
    },
    destroy() {}
  };
  const canvasContext = { configure() {}, unconfigure() {}, getCurrentTexture: () => makeTexture({ label: "canvas" }) };
  class MockCanvas {
    width = 64; height = 64; clientWidth = 64; clientHeight = 64;
    style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
    getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
    hasAttribute() { return true; }
    getContext(kind: string) { return kind === "webgpu" ? canvasContext : null; }
    addEventListener() {} removeEventListener() {}
  }
  return { native, textures, buffers, observations, bufferObservations, groups, MockCanvas };
}

describe("compute and rendering shared resources", () => {
  it("submits the same storage buffer and texture leases and leaves borrowed resources owned by the renderer", async () => {
    const { device, groups, submissions, makeOwner } = harness();
    const { owner, resourceInterop, textures, createBuffer } = makeOwner(1);
    const { buffer, native } = createBuffer();
    const context = createComputeContext(device, owner);
    const borrowed = context.borrowRenderBuffer(buffer);
    const texture = new Texture({ width: 2, height: 2, usage: ["storage", "sampled", "copy-dst"] });
    const pipeline = context.createPipeline({ wgsl: WGSL, bindings: [{ binding: 0, type: "storage" }, { binding: 1, type: "storage-texture", format: "rgba8unorm" }] });
    context.dispatch({ pipeline, bindings: [{ binding: 0, buffer: borrowed }, { binding: 1, texture: { texture } }], workgroups: [1] });
    expect(groups[0]!.entries[0]!.resource).toEqual({ buffer: native });
    expect(groups[0]!.entries[1]!.resource).toEqual({ texture, descriptor: { dimension: "2d", baseMipLevel: 0, mipLevelCount: 1 } });
    expect(textures.get(texture)).toBe(owner.getNativeTexture(texture));
    expect(resourceInterop.submissionSerial).toBe(1);
    expect(submissions).toHaveLength(1);
    borrowed.dispose();
    context.dispose();
    await Promise.resolve();
    expect(buffer.disposed).toBe(false);
    expect(native.destroyed).toBe(0);
    expect(() => context.dispatch({ pipeline, bindings: {}, workgroups: [1] })).toThrow(/disposed/);
    texture.dispose();
    await Promise.resolve();
    expect(resourceInterop.liveResources).toBe(1);
  });

  it("rejects foreign and disposed resources, unsupported usage and conflicting pass access", () => {
    const { device, makeOwner } = harness();
    const first = makeOwner(1);
    const second = makeOwner(2);
    const { buffer } = second.createBuffer();
    const context = createComputeContext(device, first.owner);
    expect(() => context.createBuffer({ data: new Float32Array(1), size: 4.5 })).toThrow(/positive integer/);
    expect(() => context.borrowRenderBuffer(buffer)).toThrow(/foreign/);
    const ownBuffer = context.createBuffer({ size: 16 });
    const bufferConflict = context.createPipeline({ wgsl: WGSL, bindings: [{ binding: 0, type: "storage" }, { binding: 1, type: "read-only-storage" }] });
    expect(() => context.dispatch({ pipeline: bufferConflict, bindings: { 0: ownBuffer, 1: ownBuffer }, workgroups: [1] })).toThrow(/conflicting access/);
    const sampled = new Texture({ width: 1, height: 1 });
    const storagePipeline = context.createPipeline({ wgsl: WGSL, bindings: [{ binding: 0, type: "storage-texture" }] });
    expect(() => context.dispatch({ pipeline: storagePipeline, bindings: { 0: sampled }, workgroups: [1] })).toThrow(/storage usage/);
    const shared = new Texture({ width: 1, height: 1, usage: ["storage", "sampled", "copy-dst"] });
    const conflict = context.createPipeline({ wgsl: WGSL, bindings: [{ binding: 0, type: "storage-texture" }, { binding: 1, type: "sampled-texture" }] });
    expect(() => context.dispatch({ pipeline: conflict, bindings: { 0: shared, 1: shared }, workgroups: [1] })).toThrow(/conflicting/);
    const mipTexture = new Texture({ width: 2, height: 2, mipLevelCount: 2, usage: ["storage", "sampled", "copy-dst"] });
    const disjoint = context.createPipeline({ wgsl: WGSL, bindings: [{ binding: 0, type: "storage-texture", mipLevel: 1 }, { binding: 1, type: "sampled-texture", mipLevel: 0 }] });
    expect(() => context.dispatch({ pipeline: disjoint, bindings: { 0: mipTexture, 1: mipTexture }, workgroups: [1] })).not.toThrow();
    shared.dispose();
    expect(() => context.dispatch({ pipeline: storagePipeline, bindings: { 0: shared }, workgroups: [1] })).toThrow(/disposed/);
    expect(() => createComputeContext(device).dispatch({ pipeline: storagePipeline, bindings: {}, workgroups: [1] })).toThrow();
    first.owner.contextLost = true;
    expect(context.disposed).toBe(true);
    expect(() => context.createPipeline({ wgsl: WGSL })).toThrow(/generation/);
    context.dispose();
  });

  it("routes the app surface through the selected owner and invalidates handles when generation changes", () => {
    const { device, makeOwner } = harness();
    const first = makeOwner(1);
    const second = makeOwner(2);
    let selected: ComputeRenderOwner | undefined = first.owner;
    const surface = createComputeSurface(() => "webgpu", () => selected as never);
    const { buffer, native } = first.createBuffer();
    const borrowed = surface.borrowBuffer(buffer);
    const created = surface.buffer({ size: 16 });
    const createdRenderBuffer = created.asRenderBuffer();
    const sampler = surface.sampler({ minFilter: "nearest" });
    const shared = new Texture({ width: 1, height: 1, usage: ["storage", "sampled", "copy-dst"] });
    const pipeline = surface.pipeline({ wgsl: WGSL, bindings: [{ binding: 0, type: "storage-texture" }] });
    surface.dispatch({ pipeline, bindings: [{ binding: 0, texture: shared }], workgroups: [1] });
    expect(first.textures.has(shared)).toBe(true);
    selected = second.owner;
    expect(surface.available).toBe(true);
    expect(borrowed.disposed).toBe(true);
    expect(created.disposed).toBe(true);
    expect(createdRenderBuffer.disposed).toBe(true);
    expect(sampler.disposed).toBe(true);
    expect(native.destroyed).toBe(0);
    expect(() => surface.dispatch({ pipeline, bindings: [{ binding: 0, texture: shared }], workgroups: [1] })).toThrow(/context|disposed/i);
    const foreign = harness();
    expect(() => surface.bind(foreign.device)).toThrow(/selected/);
    second.owner.contextLost = true;
    expect(surface.available).toBe(false);
    surface.dispose();
  });

  it("binds a context-owned sampler beside a sampled texture and invalidates it on dispose", () => {
    const { device, groups, makeOwner } = harness();
    const { owner } = makeOwner(1);
    const context = createComputeContext(device, owner);
    const texture = new Texture({ width: 1, height: 1 });
    const sampler = context.createSampler({ minFilter: "nearest", magFilter: "nearest" });
    const pipeline = context.createPipeline({ wgsl: WGSL, bindings: [{ binding: 0, type: "sampled-texture" }, { binding: 1, type: "sampler" }] });
    context.dispatch({ pipeline, bindings: [{ binding: 0, texture }, { binding: 1, sampler }], workgroups: [1] });
    expect(groups[0]!.entries[1]!.resource).toBe(sampler.native);
    expect(() => context.createSampler({ maxAnisotropy: 2 })).toThrow(/linear filters/);
    sampler.dispose();
    expect(() => context.dispatch({ pipeline, bindings: [{ binding: 0, texture }, { binding: 1, sampler }], workgroups: [1] })).toThrow(/live sampler/);
    const another = context.createSampler();
    context.dispose();
    expect(another.disposed).toBe(true);
  });

  it("rejects an interop owner attached to a different queue or generation", () => {
    const { device, makeOwner } = harness();
    const { owner, resourceInterop } = makeOwner(1);
    const foreignQueue = new WebGPUResourceInterop({ submit() {} }, 1);
    expect(() => createComputeContext(device, { ...owner, resourceInterop: foreignQueue })).toThrow(/same native device generation/);
    const foreignGeneration = new WebGPUResourceInterop(device.queue, 2);
    expect(() => createComputeContext(device, { ...owner, resourceInterop: foreignGeneration })).toThrow(/same native device generation/);
    const context = createComputeContext(device, owner);
    const buffer = context.createBuffer({ size: 4 });
    const renderBuffer = buffer.asRenderBuffer();
    const destroy = vi.spyOn(buffer.native, "destroy");
    resourceInterop.invalidate();
    expect(context.disposed).toBe(true);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(() => owner.getNativeStorageBuffer(renderBuffer)).toThrow("WEBGPU_INTEROP_DISPOSED");
    expect(() => context.dispatch({ pipeline: {}, bindings: {}, workgroups: [1] })).toThrow(/generation/);
    expect(() => context.dispose()).not.toThrow();
    expect(buffer.disposed).toBe(true);
    expect(renderBuffer.disposed).toBe(true);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("rejects native storage buffers that cannot be copied for compute reads and writes", () => {
    const { device, makeOwner } = harness();
    const { owner, createBuffer } = makeOwner(1);
    const missingCopies = createBuffer();
    missingCopies.native.usage = 0x80;
    const context = createComputeContext(device, owner);
    expect(() => context.borrowRenderBuffer(missingCopies.buffer)).toThrow(/storage\/copy usage/);
    const invalidOwner: ComputeRenderOwner = { ...owner, createBuffer: () => missingCopies.buffer };
    const invalidContext = createComputeContext(device, invalidOwner);
    expect(() => invalidContext.createBuffer({ size: 16 })).toThrow(/storage\/copy usage/);
    expect(missingCopies.buffer.disposed).toBe(true);
    context.dispose(); invalidContext.dispose();
  });

  it("shares one renderer-owned buffer, fences retirement, and preserves externally borrowed ownership", async () => {
    let finishFence!: () => void;
    const fence = new Promise<void>((resolve) => { finishFence = resolve; });
    const fixture = rootDeviceHarness(() => fence);
    const adapter = { requestDevice: async () => fixture.native as never };
    const owner = await WebGPUDevice.create({ adapter, device: fixture.native as never });
    const other = await WebGPUDevice.create({ adapter, device: fixture.native as never });
    const surface = createComputeSurface(() => "webgpu", () => owner);
    try {
      const buffer = surface.buffer({ label: "shared-values", data: new Float32Array([0.5, 0, 0, 0]) });
      const renderBuffer = buffer.asRenderBuffer();
      const native = buffer.native as unknown as { readonly bytes: ArrayBuffer; destroyed: number };
      expect(owner.getNativeStorageBuffer(renderBuffer)).toBe(native);
      expect((native as { label?: string }).label).toBe("shared-values");
      expect(new Float32Array(native.bytes)[0]).toBe(0.5);
      expect(() => other.getNativeStorageBuffer(renderBuffer)).toThrow(/not created|foreign/i);
      expect(() => owner.readBuffer(renderBuffer)).toThrow(/shadow stale/i);
      const pipeline = surface.pipeline({ wgsl: WGSL, bindings: [{ binding: 0, type: "storage" }] });
      surface.dispatch({ pipeline, bindings: { 0: buffer }, workgroups: [1] });
      expect(owner.resourceInterop.submissionSerial).toBe(1);
      buffer.dispose();
      expect(renderBuffer.disposed).toBe(true);
      expect(native.destroyed).toBe(0);
      expect(() => buffer.asRenderBuffer()).toThrow(/disposed/);
      finishFence(); await fence; await Promise.resolve();
      expect(native.destroyed).toBe(1);

      const external = owner.createBuffer("storage", 16);
      const borrowed = surface.borrowBuffer(external);
      expect(borrowed.asRenderBuffer()).toBe(external);
      borrowed.dispose();
      expect(external.disposed).toBe(false);
      expect(owner.getNativeStorageBuffer(external)).toBeDefined();
      const uniform = surface.buffer({ size: 16, usage: "uniform" });
      expect(() => uniform.asRenderBuffer()).toThrow(/storage buffer/);
      const standalone = createComputeContext(harness().device);
      const standaloneBuffer = standalone.createBuffer({ size: 16 });
      expect(() => standaloneBuffer.asRenderBuffer()).toThrow(/mounted native render owner/);
      standalone.dispose();
      const borrowedUntilContextDispose = surface.borrowBuffer(external);
      surface.dispose();
      expect(borrowedUntilContextDispose.disposed).toBe(true);
      expect(external.disposed).toBe(false);
    } finally {
      surface.dispose(); owner.dispose(); other.dispose();
    }
  });

  it("retires a renderer allocation if its initial compute upload fails", async () => {
    let finishFence!: () => void;
    const fence = new Promise<void>((resolve) => { finishFence = resolve; });
    const fixture = rootDeviceHarness(() => fence);
    vi.spyOn(fixture.native.queue, "writeBuffer").mockImplementationOnce(() => { throw new Error("upload failed"); });
    const owner = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native as never }, device: fixture.native as never });
    const surface = createComputeSurface(() => "webgpu", () => owner);
    try {
      expect(() => surface.buffer({ data: new Float32Array([1]) })).toThrow("upload failed");
      const allocation = fixture.buffers.find((buffer) => buffer.label?.startsWith("aura3d-storage-"));
      expect(allocation).toBeDefined();
      expect(allocation!.destroyed).toBe(0);
      finishFence(); await fence; await Promise.resolve();
      expect(allocation!.destroyed).toBe(1);
      expect(owner.resourceInterop.liveResources).toBe(0);
    } finally { surface.dispose(); owner.dispose(); }
  });

  it("cancels an in-flight read when the shared render handle is disposed", async () => {
    let finishMap!: () => void;
    const pendingMap = new Promise<void>((resolve) => { finishMap = resolve; });
    const fixture = rootDeviceHarness();
    const originalCreate = fixture.native.createBuffer;
    vi.spyOn(fixture.native, "createBuffer").mockImplementation((descriptor) => {
      const buffer = originalCreate(descriptor);
      if (descriptor.label?.endsWith("-readback")) buffer.mapAsync = () => pendingMap;
      return buffer;
    });
    const owner = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native as never }, device: fixture.native as never });
    const surface = createComputeSurface(() => "webgpu", () => owner);
    try {
      const buffer = surface.buffer({ size: 16 });
      const read = buffer.read();
      const staging = fixture.buffers.find((entry) => entry.label?.endsWith("-readback"));
      expect(staging).toBeDefined();
      buffer.asRenderBuffer().dispose();
      finishMap();
      await expect(read).rejects.toMatchObject({ code: "compute-disposed" });
      expect(staging!.destroyed).toBe(1);
      expect(buffer.disposed).toBe(true);
      expect(() => buffer.write(new Float32Array([1]))).toThrow(/disposed/);
    } finally { surface.dispose(); owner.dispose(); }
  });

  it("routes a root compute buffer into a material graph on the same allocation and queue", async () => {
    const fixture = rootDeviceHarness();
    const initialGraph: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [{ id: "color", op: "constant", type: "vec4", value: [0, 0, 0, 1] }], outputs: { color: "color" }
    };
    const storageGraph: ShaderGraphDocument = {
      version: 1, stage: "material", resources: [{ name: "values", kind: "storage-buffer", type: "f32", access: "read" }],
      nodes: [
        { id: "index", op: "constant", type: "u32", value: 0 },
        { id: "value", op: "storageLoad", type: "f32", resource: "values", inputs: ["index"] },
        { id: "color", op: "construct", type: "vec4", inputs: ["value", "value", "value", "value"] }
      ], outputs: { color: "color" }
    };
    vi.stubGlobal("HTMLCanvasElement", fixture.MockCanvas);
    vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({ requestDevice: async () => fixture.native }), getPreferredCanvasFormat: () => "rgba8unorm" } });
    const app = createAuraApp(new fixture.MockCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(primitives.plane({ name: "buffer-probe", material: material.node({ graph: initialGraph }) }).runtime({ id: "buffer-probe" })),
      renderer: { backend: "webgpu", allowFallback: false, shaderFailures: "throw" },
      autoStart: false, resize: false, diagnostics: false, pixelRatio: 1, strict: true
    });
    try {
      await app.ready();
      const buffer = app.compute.buffer({ data: new Float32Array([0, 0, 0, 1]) });
      const renderBuffer = buffer.asRenderBuffer();
      const graphMaterial = material.node({ graph: storageGraph, backend: "wgsl", storage: { values: { kind: "storage-buffer", buffer: renderBuffer } } });
      const depthGraph: ShaderGraphDocument = {
        ...storageGraph,
        nodes: [...storageGraph.nodes, { id: "position", op: "construct", type: "vec3", inputs: ["value", "value", "value"] }],
        outputs: { color: "color", position: "position" }
      };
      const depthSpec = material.node({ graph: depthGraph, backend: "wgsl", storage: { values: { kind: "storage-buffer", buffer: renderBuffer } } });
      const depthMaterial = createCustomShaderMaterial(depthSpec.custom!);
      try {
        expect(depthMaterial.graphStorageBindings("forward")).toEqual([expect.objectContaining({ buffer: renderBuffer })]);
        expect(depthMaterial.graphStorageBindings("depth")).toEqual([expect.objectContaining({ buffer: renderBuffer })]);
      } finally { depthMaterial.dispose(); }
      app.nodes.require("buffer-probe").setMaterial(graphMaterial);
      const first = app.compute.pipeline({
        wgsl: "// mock-buffer-write-first\n@group(0) @binding(0) var<storage, read_write> values: array<f32>; @compute @workgroup_size(1) fn main() { values[0] = 0.25; }",
        bindings: [{ binding: 0, type: "storage" }]
      });
      const second = app.compute.pipeline({
        wgsl: "// mock-buffer-write-second\n@group(0) @binding(0) var<storage, read_write> values: array<f32>; @compute @workgroup_size(1) fn main() { values[0] = 0.75; }",
        bindings: [{ binding: 0, type: "storage" }]
      });
      fixture.bufferObservations.length = 0;
      app.compute.dispatch({ pipeline: first, bindings: { 0: buffer }, workgroups: [1] });
      await app.stepAsync(0);
      app.compute.dispatch({ pipeline: second, bindings: { 0: buffer }, workgroups: [1] });
      await app.stepAsync(0);
      const renderer = (app as unknown as Record<symbol, { device: WebGPUDevice }>)[Symbol.for("a3d.prd01.renderer")];
      const shared = renderer!.device.getNativeStorageBuffer(renderBuffer);
      expect(shared).toBe(buffer.native);
      expect(fixture.bufferObservations.map(({ kind, value }) => [kind, value])).toEqual([
        ["compute", 0.25], ["read", 0.25], ["compute", 0.75], ["read", 0.75]
      ]);
      expect(fixture.bufferObservations.every((entry) => entry.buffer === shared)).toBe(true);
      expect(fixture.buffers.filter((entry) => entry.label?.startsWith("aura3d-storage-"))).toHaveLength(1);
      buffer.dispose();
      expect(renderBuffer.disposed).toBe(true);
    } finally { app.dispose(); vi.unstubAllGlobals(); }
  });

  it("accepts a live storage handle as a base-color material texture and retains its backing", () => {
    const shared = texture.storage({ width: 2, height: 1 });
    // This call is deliberately typechecked without a cast: the public material
    // contract must accept the same handle used by app.compute.dispatch.
    const authored = material.pbr({ texture: shared });
    const intent = createProductionPrimitiveTextureIntent(authored);
    expect(intent.baseColorRef).toBe(shared);
    expect(resolveAuraTextureRef(intent.baseColorRef!).texture).toBe(shared.texture);
    const snapshot = { nodes: [{ kind: "model", asset: { kind: "aura-asset-ref", id: "model", type: "model", format: "glb", url: "/model.glb" }, material: authored }] };
    const assets: Parameters<typeof validateSceneAssets>[1] = [];
    expect(() => validateSceneAssets(snapshot as never, assets)).not.toThrow();
    expect(assets[0]?.provenance).toMatchObject({ source: "inline-definition", id: "model" });
    const invalidAsset = { ...snapshot, nodes: [{ ...snapshot.nodes[0]!, material: { texture: { kind: "aura-asset-ref", id: "bad", type: "texture", format: "invalid", url: "/bad" } } }] };
    expect(() => validateSceneAssets(invalidAsset as never, [])).toThrow(/unsupported format/);
    shared.dispose();
  });

  it.each(["graph", "pbr"] as const)("routes a root-app compute write and a %s material sample through the same native allocation and queue", async (materialKind) => {
    const fixture = rootDeviceHarness();
    const shared = texture.storage({ width: 2, height: 1 });
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material", resources: [{ name: "map", kind: "texture2d" }],
      nodes: [{ id: "uv", op: "input", type: "vec2", name: "uv0" }, { id: "color", op: "textureSample", type: "vec4", resource: "map", inputs: ["uv"] }],
      outputs: { color: "color" }
    };
    vi.stubGlobal("HTMLCanvasElement", fixture.MockCanvas);
    vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({ requestDevice: async () => fixture.native }), getPreferredCanvasFormat: () => "rgba8unorm" } });
    const canvas = new fixture.MockCanvas() as unknown as HTMLCanvasElement;
    const sampleMaterial = materialKind === "graph" ? material.node({ graph, uniforms: { map: shared } }) : material.pbr({ texture: shared });
    const app = createAuraApp(canvas, {
      scene: scene().add(primitives.plane({ name: "sample", material: sampleMaterial })),
      renderer: { backend: "webgpu", allowFallback: false, shaderFailures: "throw" },
      autoStart: false, resize: false, diagnostics: false, pixelRatio: 1, strict: true
    });
    try {
      await app.ready();
      expect(app.compute.available).toBe(true);
      const renderer = (app as unknown as Record<symbol, { device: { nativeGpuDevice: unknown } }>)[Symbol.for("a3d.prd01.renderer")];
      expect(renderer?.device.nativeGpuDevice).toBe(fixture.native);
      const writer = (value: "red" | "green") => app.compute.pipeline({
        wgsl: `// mock-write-${value}\n@group(0) @binding(0) var image: texture_storage_2d<rgba8unorm, write>; @compute @workgroup_size(1) fn main() { textureStore(image, vec2<i32>(0, 0), vec4<f32>(1.0)); }`,
        bindings: [{ binding: 0, type: "storage-texture", format: "rgba8unorm" }]
      });
      const red = writer("red");
      const green = writer("green");
      fixture.observations.length = 0;
      app.compute.dispatch({ pipeline: red, bindings: { 0: shared }, workgroups: [1] });
      await app.stepAsync(0);
      app.compute.dispatch({ pipeline: green, bindings: { 0: shared }, workgroups: [1] });
      await app.stepAsync(0);
      const allocation = fixture.textures.find((item) => item.label === "texture.storage");
      expect(allocation).toBeDefined();
      expect((allocation!.descriptor.usage as number) & 0x0c).toBe(0x0c);
      expect(fixture.textures.filter((item) => item.label === "texture.storage")).toHaveLength(1);
      expect(fixture.observations.map(({ kind, value }) => [kind, value])).toEqual([
        ["compute", "red"], ["sample", "red"], ["compute", "green"], ["sample", "green"]
      ]);
      expect(fixture.observations.every((entry) => entry.texture === allocation)).toBe(true);
      await app.compute.idle();
    } finally {
      app.dispose();
      shared.dispose();
      vi.unstubAllGlobals();
    }
  });
});
