import { describe, expect, it } from "vitest";
import { ComputeBuffer, ComputePipeline, ComputeSampler, createComputeContext } from "../../../packages/rendering/src/compute/ComputeContext.js";
import type { ComputeGPUDeviceLike, ComputeRenderOwner } from "../../../packages/rendering/src/compute/types.js";
import type { RenderBuffer } from "../../../packages/rendering/src/RenderDevice.js";
import { Texture } from "../../../packages/rendering/src/Texture.js";
import { compileShaderGraph, packShaderGraphStorage, shaderGraphStorageLayout, type ShaderGraphDocument } from "../../../packages/rendering/src/program/ShaderGraphCompiler.js";
import { createComputeSurface, type AuraComputeDispatchInput, type AuraComputePipelineSpec } from "../../../packages/engine/src/agent-api/nodes/compute.js";

/** A queue/device double observes source integration; it does not execute WGSL. */
function harness() {
  type NativeTexture = {
    sampleCount: number; mipLevelCount: number; format: string; usage: number; destroyed: number;
    createView(descriptor?: object): { native: NativeTexture; descriptor?: object };
    destroy(): void;
  };
  type NativeBuffer = {
    size: number; usage: number; destroyed: number; destroy(): void; mapAsync(): Promise<void>;
    getMappedRange(): ArrayBuffer; unmap(): void;
  };
  const features = new Set<string>();
  const shaderCode: string[] = [];
  const groups: Array<{ layout: number; entries: Array<{ binding: number; resource: unknown }> }> = [];
  const passes: Array<{ groups: number[]; dispatch?: number[] }> = [];
  const submissions: Array<readonly { resource: object; mode: string }[]> = [];
  const prepared: Array<{ texture: Texture; mode: string; view?: { readonly baseMipLevel: number; readonly mipLevelCount: number } }> = [];
  const textures = new Map<Texture, NativeTexture>();
  const buffers = new Map<RenderBuffer, NativeBuffer>();
  const live = new Map<object, () => void>();
  const foreignTextures = new Set<Texture>();
  let nextBufferId = 0;
  const device: ComputeGPUDeviceLike = {
    features,
    queue: { submit() {}, writeBuffer() {}, onSubmittedWorkDone: async () => {} },
    createShaderModule({ code }) { shaderCode.push(code); return { code }; },
    createComputePipeline() { return { getBindGroupLayout: (index) => index }; },
    createSampler: (options) => ({ options }),
    createBuffer({ size, usage }) { return makeNativeBuffer(size, usage); },
    createBindGroup(descriptor) { const group = descriptor as typeof groups[number]; groups.push(group); return group; },
    createCommandEncoder() {
      return {
        beginComputePass() {
          const pass: { groups: number[]; dispatch?: number[] } = { groups: [] };
          passes.push(pass);
          return { setPipeline() {}, setBindGroup(index) { pass.groups.push(index); }, dispatchWorkgroups(x, y = 1, z = 1) { pass.dispatch = [x, y, z]; }, end() {} };
        },
        copyBufferToBuffer() {}, finish: () => ({})
      };
    }
  };
  function makeNativeBuffer(size: number, usage: number): NativeBuffer {
    return { size, usage, destroyed: 0, destroy() { this.destroyed++; }, mapAsync: async () => {}, getMappedRange: () => new ArrayBuffer(size), unmap() {} };
  }
  const resourceInterop = {
    queue: device.queue, generation: 1, disposed: false,
    register<T extends object>(resource: T, destroy: () => void): T { live.set(resource, destroy); return resource; },
    assertUsable(resource: object) { if (!live.has(resource)) throw new Error("foreign or disposed resource"); },
    submit(_commands: readonly unknown[], accesses: readonly { resource: object; mode: "read" | "write" | "readwrite" }[] = []) {
      for (const { resource } of accesses) this.assertUsable(resource);
      submissions.push(accesses);
      return submissions.length;
    },
    async retire(resource: object) { const destroy = live.get(resource); live.delete(resource); destroy?.(); }
  };
  const getTexture = (texture: Texture): NativeTexture => {
    if (foreignTextures.has(texture)) throw new Error("foreign render target");
    if (texture.disposed) throw new Error("disposed texture");
    let native = textures.get(texture);
    if (!native) {
      native = {
        sampleCount: 1, mipLevelCount: texture.mipLevelCount,
        format: ({ rgba8: "rgba8unorm", rgba16f: "rgba16float", rgba32f: "rgba32float", r32f: "r32float", depth24: "depth24plus-stencil8" } as Record<string, string>)[texture.format] ?? texture.format,
        usage: (texture.usage.includes("sampled") ? 0x04 : 0) | (texture.usage.includes("storage") ? 0x08 : 0), destroyed: 0,
        createView(descriptor) { return { native: this, descriptor }; },
        destroy() { this.destroyed++; }
      };
      const allocation = native;
      resourceInterop.register(allocation, () => allocation.destroy());
      texture.onDispose(() => { void resourceInterop.retire(allocation); });
      textures.set(texture, allocation);
    }
    return native;
  };
  const owner: ComputeRenderOwner = {
    nativeGpuDevice: device, generation: 1, disposed: false, contextLost: false, resourceInterop,
    getNativeTexture: getTexture,
    getNativeComputeTexture(texture, mode, view) { prepared.push({ texture, mode, view }); return getTexture(texture); },
    createBuffer(_usage, size) {
      const native = makeNativeBuffer(size, 0x8c);
      resourceInterop.register(native, () => native.destroy());
      const buffer: RenderBuffer = { id: ++nextBufferId, usage: "storage", byteLength: size, disposed: false,
        dispose() { if (!this.disposed) { (this as { disposed: boolean }).disposed = true; void resourceInterop.retire(native); } } };
      buffers.set(buffer, native);
      return buffer;
    },
    getNativeStorageBuffer(buffer) {
      const native = buffers.get(buffer);
      if (!native || buffer.disposed) throw new Error("foreign or disposed buffer");
      resourceInterop.assertUsable(native);
      return native;
    }
  };
  return { device, owner, features, shaderCode, groups, passes, submissions, prepared, textures, foreignTextures };
}

const graph: ShaderGraphDocument = {
  version: 1, stage: "compute", workgroupSize: [4, 1, 1],
  resources: [
    { name: "volume", kind: "texture3d", group: 2, binding: 0 },
    { name: "sceneDepth", kind: "depth2d", group: 0, binding: 5 },
    { name: "output", kind: "storage-texture", format: "rgba8unorm", access: "write", group: 1, binding: 3 },
    { name: "measure", kind: "storage-buffer", type: "f32", access: "read_write", group: 2, binding: 3 },
    { name: "gain", kind: "uniform", type: "f32", group: 0, binding: 0 },
    { name: "unused", kind: "texture2d", group: 3, binding: 0 }
  ],
  nodes: [
    { id: "uvw", op: "constant", type: "vec3", value: [0.25, 0.5, 0.75] },
    { id: "pixel", op: "constant", type: "vec2", value: [1, 1] },
    { id: "index", op: "constant", type: "u32", value: 0 },
    { id: "sample", op: "textureSample", type: "vec4", resource: "volume", inputs: ["uvw"] },
    { id: "depth", op: "textureLoad", type: "f32", resource: "sceneDepth", inputs: ["pixel"] },
    { id: "gainValue", op: "uniform", type: "f32", resource: "gain" },
    { id: "scaled", op: "mul", type: "f32", inputs: ["depth", "gainValue"] }
  ],
  statements: [
    { op: "store", resource: "measure", index: "index", value: "scaled" },
    { op: "textureStore", resource: "output", coordinates: "pixel", value: "sample" }
  ]
};

function graphFixture() {
  const h = harness();
  const ctx = createComputeContext(h.device, h.owner);
  const compiled = compileShaderGraph(graph, "wgsl");
  const pipeline = ctx.createPipeline({ graph: compiled });
  const volume = new Texture({ width: 2, height: 2, depth: 2, dimension: "3d" });
  const depth = new Texture({ width: 2, height: 2, format: "depth24", renderAttachment: true });
  const output = new Texture({ width: 2, height: 2, usage: ["sampled", "storage"] });
  const sampler = ctx.createSampler();
  const measure = ctx.createBuffer({ size: 4 });
  const gain = ctx.createBuffer({ size: 4, usage: "uniform" });
  const graphBindings = { volume: { texture: volume, sampler }, sceneDepth: depth, output, measure, gain };
  return { ...h, ctx, compiled, pipeline, graphBindings, volume, depth, output, sampler, measure, gain };
}

describe("compiled graph compute bindings", () => {
  it("binds active graph resources in their exact groups, with a 3D sampler and a depth-only view", () => {
    const f = graphFixture();
    expect(f.ctx.dispatch({ pipeline: f.pipeline, graphBindings: f.graphBindings, items: [9] })).toEqual({ workgroups: [3, 1, 1], invocations: 12 });
    expect(f.shaderCode).toEqual([f.compiled.compute]);
    expect(f.passes[0]).toEqual({ groups: [0, 1, 2], dispatch: [3, 1, 1] });
    expect(f.groups.map((group) => [group.layout, group.entries.map((entry) => entry.binding)])).toEqual([[0, [5, 0]], [1, [3]], [2, [0, 1, 3]]]);
    expect(f.groups[0]!.entries[0]!.resource).toEqual({ native: f.textures.get(f.depth), descriptor: { dimension: "2d", aspect: "depth-only" } });
    expect(f.groups[2]!.entries[0]!.resource).toEqual({ native: f.textures.get(f.volume), descriptor: { dimension: "3d" } });
    expect(f.groups[2]!.entries[1]!.resource).toBe(f.sampler.native);
    expect(f.groups[1]!.entries[0]!.resource).toEqual({ native: f.textures.get(f.output), descriptor: { dimension: "2d", baseMipLevel: 0, mipLevelCount: 1 } });
    expect(f.prepared.map(({ texture, mode }) => [texture, mode])).toEqual([[f.volume, "read"], [f.depth, "read"], [f.output, "write"]]);
    expect(f.prepared.map(({ view }) => view)).toEqual([undefined, undefined, { baseMipLevel: 0, mipLevelCount: 1 }]);
    expect(f.submissions[0]!.map(({ resource, mode }) => [resource, mode])).toEqual([
      [f.textures.get(f.volume), "read"], [f.textures.get(f.depth), "read"], [f.textures.get(f.output), "write"], [f.measure.native, "readwrite"], [f.gain.native, "read"]
    ]);
    f.ctx.dispose();
    expect(f.volume.disposed).toBe(false);
    expect(f.output.disposed).toBe(false);
    expect(f.sampler.disposed).toBe(true);
    expect(f.measure.disposed).toBe(true);
    expect(f.pipeline.disposed).toBe(true);
  });

  it("exposes the graph form through the existing public compute surface and forwards it unchanged", () => {
    const h = harness();
    const surface = createComputeSurface(() => "webgpu");
    surface.bind(h.owner as never);
    const compiled = compileShaderGraph(graph, "wgsl");
    const spec: AuraComputePipelineSpec = { graph: compiled, label: "public-graph" };
    const pipeline = surface.pipeline(spec);
    const volume = new Texture({ width: 2, height: 2, depth: 2, dimension: "3d" });
    const depth = new Texture({ width: 2, height: 2, format: "depth24", renderAttachment: true });
    const output = new Texture({ width: 2, height: 2, usage: ["storage"] });
    const input: AuraComputeDispatchInput = { pipeline, graphBindings: {
      volume: { texture: volume, sampler: surface.sampler() }, sceneDepth: depth, output,
      measure: surface.buffer({ size: 4 }), gain: surface.buffer({ size: 4, usage: "uniform" })
    }, workgroups: [1] };
    expect(surface.dispatch(input).workgroups).toEqual([1, 1, 1]);
    expect(h.passes[0]!.groups).toEqual([0, 1, 2]);
    surface.dispose();
  });

  it("does not bind unused declarations and rejects graph metadata that no longer matches the compiled source", () => {
    const f = graphFixture();
    f.ctx.dispatch({ pipeline: f.pipeline, graphBindings: { ...f.graphBindings, unused: "ignored" }, workgroups: [1] });
    expect(f.passes[0]!.groups).toEqual([0, 1, 2]);
    expect(f.pipeline.bindings.some(({ group }) => group === 3)).toBe(false);
    const changed = { ...f.compiled, bindings: f.compiled.bindings.map((binding) => binding.name === "sceneDepth" ? { ...binding, binding: 6 } : binding) };
    expect(() => f.ctx.createPipeline({ graph: changed })).toThrow(/disagrees with its WGSL declaration/);
    expect(() => f.ctx.createPipeline({ graph: { ...f.compiled, target: "glsl" } })).toThrow(/WGSL compute result/);
    expect(() => f.ctx.dispatch({ pipeline: f.pipeline, bindings: {}, workgroups: [1] })).toThrow(/require graphBindings/);
  });

  it("rejects wrong dimensions, depth/color sample types, missing samplers, and unknown names before submission", () => {
    const f = graphFixture();
    const run = (overrides: Record<string, unknown>) => () => f.ctx.dispatch({ pipeline: f.pipeline, graphBindings: { ...f.graphBindings, ...overrides }, workgroups: [1] });
    const image2d = new Texture({ width: 2, height: 2 });
    expect(run({ volume: { texture: image2d, sampler: f.sampler } })).toThrow(/dimension must be 3d/);
    expect(run({ sceneDepth: image2d })).toThrow(/requires a depth texture/);
    expect(run({ sceneDepth: { texture: f.depth, sampler: f.sampler } })).toThrow(/does not use a sampler/);
    expect(run({ volume: f.volume })).toThrow(/requires \{ texture, sampler \}/);
    expect(run({ output: f.volume })).toThrow(/requires storage usage|dimension must be 2d/);
    expect(run({ gain: f.measure })).toThrow(/usage/);
    expect(run({ mystery: f.volume })).toThrow(/no compute graph resource named mystery/);
    const { sceneDepth: _unused, ...withoutDepth } = f.graphBindings;
    expect(() => f.ctx.dispatch({ pipeline: f.pipeline, graphBindings: withoutDepth, workgroups: [1] })).toThrow(/missing compute graph resource sceneDepth/);
    expect(f.submissions).toHaveLength(0);
  });

  it("validates float32 filterability, sampler comparison, context ownership and disposal", () => {
    const f = graphFixture();
    const floatVolume = new Texture({ width: 2, height: 2, depth: 2, dimension: "3d", format: "r32f" });
    const run = (volume: unknown) => () => f.ctx.dispatch({ pipeline: f.pipeline, graphBindings: { ...f.graphBindings, volume }, workgroups: [1] });
    expect(run({ texture: floatVolume, sampler: f.sampler })).toThrow(/float32-filterable/);
    f.features.add("float32-filterable");
    expect(run({ texture: floatVolume, sampler: f.sampler })).not.toThrow();
    const comparison = f.ctx.createSampler({ compare: "less" });
    expect(run({ texture: f.volume, sampler: comparison })).toThrow(/comparison mode/);
    const foreign = createComputeContext(harness().device);
    expect(run({ texture: f.volume, sampler: foreign.createSampler() })).toThrow(/live sampler/);
    const other = foreign.createBuffer({ size: 4 });
    expect(() => f.ctx.dispatch({ pipeline: f.pipeline, graphBindings: { ...f.graphBindings, measure: other }, workgroups: [1] })).toThrow(/this compute context/);
    f.sampler.dispose();
    expect(run({ texture: f.volume, sampler: f.sampler })).toThrow(/live sampler/);
    f.depth.dispose();
    const liveSampler = f.ctx.createSampler();
    expect(run({ texture: f.volume, sampler: liveSampler })).toThrow(/disposed/);
    foreign.dispose();
    f.ctx.dispose();
  });

  it("rejects externally constructed wrappers that impersonate this context", () => {
    const f = graphFixture();
    const fakeBuffer = new ComputeBuffer(f.ctx, f.measure.native, 4, "storage", "forged");
    expect(() => fakeBuffer.write(new Float32Array([1]))).toThrow(/not created or borrowed/);
    expect(() => fakeBuffer.dispose()).toThrow(/not created or borrowed/);
    expect(f.measure.disposed).toBe(false);
    expect(() => f.ctx.dispatch({ pipeline: f.pipeline, graphBindings: { ...f.graphBindings, measure: fakeBuffer }, workgroups: [1] })).toThrow(/not created or borrowed/);
    const fakeSampler = new ComputeSampler(f.ctx, f.sampler.native);
    expect(() => f.ctx.dispatch({ pipeline: f.pipeline, graphBindings: { ...f.graphBindings, volume: { texture: f.volume, sampler: fakeSampler } }, workgroups: [1] })).toThrow(/live sampler/);
    const fakePipeline = new ComputePipeline(f.ctx, 99, f.pipeline.native, { entryPoint: "main", workgroupSize: [4, 1, 1], bindings: f.pipeline.bindings, label: undefined });
    expect(() => f.ctx.dispatch({ pipeline: fakePipeline, bindings: {}, workgroups: [1] })).toThrow(/not created by this compute context/);
    expect(f.submissions).toHaveLength(0);
  });

  it("checks actual native allocation sample count, mip count, usage, format and ownership", () => {
    const f = graphFixture();
    const run = () => f.ctx.dispatch({ pipeline: f.pipeline, graphBindings: f.graphBindings, workgroups: [1] });
    f.foreignTextures.add(f.depth);
    expect(run).toThrow(/foreign render target/);
    f.foreignTextures.delete(f.depth);
    const depthNative = f.owner.getNativeTexture(f.depth) as ReturnType<typeof f.textures.get> & {};
    depthNative.sampleCount = 4;
    expect(run).toThrow(/single-sampled/);
    depthNative.sampleCount = 1;
    depthNative.usage = 0;
    expect(run).toThrow(/native texture requires sampled usage/);
    depthNative.usage = 4;
    depthNative.format = "rgba8unorm";
    expect(run).toThrow(/native depth texture/);
    depthNative.format = "depth24plus-stencil8";
    const outputNative = f.owner.getNativeTexture(f.output) as ReturnType<typeof f.textures.get> & {};
    outputNative.format = "rgba16float";
    expect(run).toThrow(/native texture format/);
    outputNative.format = "rgba8unorm";
    const raw = f.ctx.createPipeline({ wgsl: "@compute @workgroup_size(1) fn main() {}", bindings: [{ binding: 0, type: "sampled-texture", mipLevel: 1 }] });
    const mipTexture = new Texture({ width: 2, height: 2, mipLevelCount: 2 });
    const mipNative = f.owner.getNativeTexture(mipTexture) as ReturnType<typeof f.textures.get> & {};
    mipNative.mipLevelCount = 1;
    expect(() => f.ctx.dispatch({ pipeline: raw, bindings: { 0: mipTexture }, workgroups: [1] })).toThrow(/mip is unavailable/);
    expect(f.submissions).toHaveLength(0);
  });

  it("honors explicit nonzero groups, rejects unaddressed groups, and detects aliases of one native texture", () => {
    const f = graphFixture();
    const wgsl = "@group(2) @binding(0) var<storage, read_write> out: array<f32>; @compute @workgroup_size(1) fn main() { out[0] = 1.; }";
    expect(() => f.ctx.createPipeline({ wgsl, bindings: [{ binding: 0, type: "storage" }] })).toThrow(/group 2 has no declared bindings/);
    expect(() => f.ctx.createPipeline({ wgsl, bindings: [{ group: 4, binding: 0, type: "storage" }] })).toThrow(/maxBindGroups/);
    const raw = f.ctx.createPipeline({ wgsl, bindings: [{ group: 2, binding: 0, type: "storage" }] });
    expect(() => f.ctx.dispatch({ pipeline: raw, bindings: { 0: f.measure }, workgroups: [1] })).toThrow(/missing a resource/);
    f.ctx.dispatch({ pipeline: raw, bindings: [{ group: 2, binding: 0, buffer: f.measure }], workgroups: [1] });
    expect(f.passes.at(-1)!.groups).toEqual([2]);
    const alias = new Texture({ width: 2, height: 2, usage: ["sampled", "storage"] });
    const native = f.owner.getNativeTexture(f.output);
    f.textures.set(alias, native as ReturnType<typeof f.textures.get> & {});
    const conflict = f.ctx.createPipeline({ wgsl: "@compute @workgroup_size(1) fn main() {}", bindings: [{ binding: 0, type: "storage-texture" }, { binding: 1, type: "sampled-texture" }] });
    expect(() => f.ctx.dispatch({ pipeline: conflict, bindings: { 0: f.output, 1: alias }, workgroups: [1] })).toThrow(/conflicting pass access/);
    expect(() => f.ctx.createPipeline({ wgsl: "/* @group(3) nested /* @group(2) */ */ @compute @workgroup_size(1) fn main() {}" })).not.toThrow();
  });

  it("writes graph-declared structured storage elements as exact layout-derived bytes (S5-WP05-03)", () => {
    const particles: ShaderGraphDocument = {
      version: 1, stage: "compute", workgroupSize: [1, 1, 1],
      structs: [{ name: "Particle", fields: [
        { name: "position", type: "vec3" }, { name: "id", type: "u32" }, { name: "basis", type: "mat3x2" }, { name: "signed", type: "i32" }
      ] }],
      resources: [
        { name: "particles", kind: "storage-buffer", type: "struct:Particle", access: "read", binding: 0 },
        { name: "ids", kind: "storage-buffer", type: "u32", access: "read_write", binding: 1 }
      ],
      nodes: [
        { id: "index", op: "constant", type: "u32", value: 0 },
        { id: "particle", op: "storageLoad", type: "struct:Particle", resource: "particles", inputs: ["index"] },
        { id: "id", op: "structField", type: "u32", name: "id", inputs: ["particle"] }
      ],
      statements: [{ op: "store", resource: "ids", index: "index", value: "id" }]
    };
    // WGSL storage: vec3 @0 (align 16), u32 @12, mat3x2 @16 (column stride 8), i32 @40; size/stride 48.
    const layout = shaderGraphStorageLayout(particles, "particles", 2);
    expect({ stride: layout.stride, size: layout.size, members: layout.element!.members!.map(({ name, offset }) => [name, offset]) })
      .toEqual({ stride: 48, size: 96, members: [["position", 0], ["id", 12], ["basis", 16], ["signed", 40]] });
    const elements = [
      { position: [1, 2, 3], id: 16_777_217, basis: [1, 2, 3, 4, 5, 6], signed: -2 },
      { position: [4, 5, 6], id: 0xffffffff, basis: [7, 8, 9, 10, 11, 12], signed: 0x7fffffff }
    ];
    const bytes = packShaderGraphStorage(particles, "particles", elements);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(bytes.byteLength).toBe(96);
    expect([0, 4, 8].map((offset) => view.getFloat32(48 + offset, true))).toEqual([4, 5, 6]);
    expect([view.getUint32(12, true), view.getUint32(60, true)]).toEqual([16_777_217, 0xffffffff]);
    expect([16, 20, 24, 28, 32, 36].map((offset) => view.getFloat32(offset, true))).toEqual([1, 2, 3, 4, 5, 6]);
    expect([view.getInt32(40, true), view.getInt32(88, true)]).toEqual([-2, 0x7fffffff]);
    expect([44, 92].map((offset) => view.getUint32(offset, true))).toEqual([0, 0]);
    expect(() => packShaderGraphStorage(particles, "particles", [{ ...elements[0], id: -1 }])).toThrow(/invalid-resource.*unsigned 32-bit/);
    expect(() => packShaderGraphStorage(particles, "particles", [{ ...elements[0], extra: 1 }])).toThrow(/unknown field/);
    expect(() => packShaderGraphStorage(particles, "missing", elements)).toThrow(/unknown-resource/);

    // The compute pipeline writes the same bytes at the element offset.
    const h = harness();
    const writes: Array<{ offset: number; bytes: number[] }> = [];
    (h.device.queue as { writeBuffer: unknown }).writeBuffer = (_buffer: unknown, offset: number, data: ArrayBufferView) => {
      writes.push({ offset, bytes: [...new Uint8Array(data.buffer, data.byteOffset, data.byteLength)] });
    };
    const ctx = createComputeContext(h.device, h.owner);
    const pipeline = ctx.createPipeline({ graph: compileShaderGraph(particles, "wgsl") });
    const buffer = ctx.createBuffer({ size: 144 });
    writes.length = 0;
    pipeline.writeGraphBuffer("particles", buffer, elements, 1);
    expect(writes).toEqual([{ offset: 48, bytes: [...bytes] }]);
    expect(() => pipeline.writeGraphBuffer("particles", buffer, elements, 2)).toThrow(/exceeds the 144-byte buffer/);
    expect(() => pipeline.writeGraphBuffer("particles", buffer, [{ ...elements[0], signed: 1.5 }])).toThrow(/signed 32-bit/);
    expect(writes).toHaveLength(1);
  });
});
