import { describe, expect, it } from "vitest";
import { TextureResidencyController, type TextureResidencyAdapter, type TextureResidencySource } from "../../../packages/assets/src/TextureResidencyController";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { WebGPUDevice, type WebGPUDeviceLike, type WebGPUResidencyAllocation, type WebGPUResidencyMip } from "../../../packages/rendering/src/WebGPUDevice";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture(autoFence = false, maxBytes?: number) {
  const fences: ReturnType<typeof deferred>[] = [];
  const writes: { texture: unknown; mipLevel?: number; bytes: number[] }[] = [];
  const textures: { label?: string; format: string; mipLevelCount?: number; destroyed: boolean; destroy(): void; createView(): unknown }[] = [];
  const groups: { layout: { index: number }; entries: { binding: number; resource: unknown }[] }[] = [];
  let failUpload = false;
  const loss = deferred();
  const native = {
    lost: loss.promise.then(() => ({ reason: "destroyed" })),
    queue: {
      submit() {}, writeBuffer() {},
      writeTexture(destination: { texture: unknown; mipLevel?: number }, data: ArrayBufferView) {
        if (failUpload) throw new Error("injected upload failure");
        writes.push({ ...destination, bytes: Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) });
      },
      onSubmittedWorkDone() { if (autoFence) return Promise.resolve(); const fence = deferred(); fences.push(fence); return fence.promise; }
    },
    createBuffer: () => ({ destroy() {} }),
    createSampler: () => ({}), createShaderModule: () => ({}),
    createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
    createBindGroup(group: { layout: { index: number }; entries: { binding: number; resource: unknown }[] }) { groups.push(group); return group; },
    createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {}, end() {} }), finish: () => ({}) }),
    createTexture(descriptor: { label?: string; format: string; mipLevelCount?: number }) {
      const texture = { ...descriptor, destroyed: false, destroy() { this.destroyed = true; }, createView() { return { texture }; } };
      textures.push(texture); return texture;
    },
    destroy() {}
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike },
    ...(maxBytes === undefined ? {} : { textureBudgetPolicy: { maxBytes } }) });
  const adapter: TextureResidencyAdapter<WebGPUResidencyMip, WebGPUResidencyAllocation> = device.createTextureResidencyAdapter();
  return { device, adapter, fences, writes, textures, groups, loss, fail: (value: boolean) => { failUpload = value; } };
}

function source(texture: Texture): TextureResidencySource<WebGPUResidencyMip> {
  return {
    texture, identity: {}, fallback: [128, 128, 255, 255],
    levels: [{ width: 4, height: 4, bytes: 64 }, { width: 2, height: 2, bytes: 16 }, { width: 1, height: 1, bytes: 4 }],
    async loadMip(level) { const width = Math.max(1, 4 >> level); return { value: { data: new Uint8Array(width * width * 4).fill(level + 1) }, release() {} }; }
  };
}

describe("WebGPU texture residency", () => {
  it("installs the authored fallback first, switches real mip tails, and keeps replacement bytes charged through fences", async () => {
    const { device, adapter, fences, writes, groups } = await fixture();
    const texture = new Texture({ width: 4, height: 4, colorSpace: "linear", data: new Uint8Array(64), mipLevelCount: 3, generateMipmaps: false });
    const input = source(texture), generation = adapter.generation();
    adapter.prepare(input, { generation, maxBytes: 44 });
    expect(adapter.usageBytes()).toBe(4);
    const fallback = device.getNativeTexture(texture);
    expect(writes[0]!.bytes).toEqual([128, 128, 255, 255]);
    const features = normalizeProgramFeatures({ lighting: "lit", maps: { baseColor: { uvSet: 0, transform: false } }, extensions: [], environment: "none" });
    const generated = generateProgramImpl(features, { flags: { values: {}, on: () => true } });
    const shader = device.createShaderProgram({ label: "streamed-pbr", marker: GENERATED_PROGRAM_MARKER, vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor! });
    const vertices = device.createBuffer("vertex", 96);
    const frame = device.createBuffer("uniform", 304, new Float32Array(76));
    const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
    device.beginFrame(2, 2); device.setRenderTarget(target); device.bindUniformBuffer(frame, 0);
    const draw = { topology: "triangles" as const, vertexBuffer: vertices, vertexFormat: VertexFormat.P3N3T2, vertexCount: 3, shader,
      uniforms: new Map([["u_baseColorMap", new TextureBinding({ name: "u_baseColorMap", texture })]]) };
    device.draw(draw);
    const boundTexture = () => (groups.filter(group => group.layout.index === 0).at(-1)!.entries.find(entry => entry.binding === 2)!.resource as { texture: unknown }).texture;
    expect(boundTexture()).toBe(fallback);
    const firstPromise = adapter.allocate(input, [{ level: 2, value: { data: new Uint8Array([1, 2, 3, 4]) } }], { maxBytes: 44, signal: new AbortController().signal });
    expect(adapter.usageBytes()).toBe(24);
    const first = (await firstPromise).allocation;
    expect(device.getNativeTexture(texture)).toBe(fallback);
    adapter.publish(texture, first, generation);
    expect(device.getNativeTexture(texture)).toBe(first.native);
    device.draw(draw);
    expect(boundTexture()).toBe(first.native);
    expect(() => adapter.retire(first)).toThrow(/still in use/);
    const next = await adapter.allocate(input, [
      { level: 1, value: { data: new Uint8Array(16).fill(2) } }, { level: 2, value: { data: new Uint8Array(4).fill(3) } }
    ], { maxBytes: 44, signal: new AbortController().signal });
    expect(adapter.usageBytes()).toBe(44);
    expect(writes.filter(write => write.texture === next.allocation.native).map(write => [write.mipLevel, write.bytes.length])).toEqual([[0, 16], [1, 4]]);
    adapter.publish(texture, next.allocation, generation);
    const retired = adapter.retire(first);
    expect(adapter.usageBytes()).toBe(44);
    for (const fence of fences.splice(0)) fence.resolve(); await retired;
    expect(adapter.usageBytes()).toBe(40);
    adapter.publish(texture, null, generation);
    expect(device.getNativeTexture(texture)).toBe(fallback);
    const retiredNext = adapter.retire(next.allocation); for (const fence of fences.splice(0)) fence.resolve(); await retiredNext;
    const unprepared = adapter.unprepare(input, generation); expect(adapter.usageBytes()).toBe(20);
    for (const fence of fences.splice(0)) fence.resolve(); await unprepared;
    expect(adapter.usageBytes()).toBe(16);
    device.endFrame(); target.dispose();
    expect(adapter.usageBytes()).toBe(16);
    for (const fence of fences.splice(0)) fence.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(adapter.usageBytes()).toBe(0);
    device.dispose();
  });

  it("charges decoded BC1 RGB fallback, rejects invalid data and preserves charges until a failed upload retires", async () => {
    const { device, adapter, fences, textures, fail } = await fixture();
    const texture = new Texture({ width: 4, height: 4, format: "bc1-rgb-unorm", data: new Uint8Array(8), generateMipmaps: false });
    const input = { ...source(texture), levels: [{ width: 4, height: 4, bytes: 8 }] };
    expect(() => adapter.prepare({ ...input, fallback: [128, 128, 255, 0] }, { generation: adapter.generation(), maxBytes: 68 })).toThrow(/channel semantics/);
    expect(adapter.usageBytes()).toBe(0);
    adapter.prepare(input, { generation: adapter.generation(), maxBytes: 68 });
    expect(adapter.estimate(input, 1)).toBe(64);
    await expect(adapter.allocate(input, [{ level: 0, value: { data: new Uint8Array(8) } }], { maxBytes: 68, signal: new AbortController().signal })).rejects.toThrow(/payload/);
    const opaque = new Uint8Array(64);
    for (let alpha = 3; alpha < opaque.length; alpha += 4) opaque[alpha] = 255;
    await expect(adapter.allocate(input, [{ level: 0, value: { data: new Uint8Array(8), fallbackData: new Uint8Array(64) } }], { maxBytes: 68, signal: new AbortController().signal })).rejects.toThrow(/opaque alpha/);
    await expect(adapter.allocate(input, [{ level: 0, value: { data: new Uint8Array(7), fallbackData: opaque } }], { maxBytes: 68, signal: new AbortController().signal })).rejects.toThrow(/payload/);
    expect(adapter.usageBytes()).toBe(4);
    fail(true);
    const failed = adapter.allocate(input, [{ level: 0, value: { data: new Uint8Array(8), fallbackData: opaque } }], { maxBytes: 68, signal: new AbortController().signal });
    expect(adapter.usageBytes()).toBe(68);
    expect(textures.at(-1)!.destroyed).toBe(false);
    fences.shift()!.resolve(); await expect(failed).rejects.toThrow(/injected/);
    expect(adapter.usageBytes()).toBe(4);
    expect(textures.at(-1)!.destroyed).toBe(true);
    fail(false);
    const prepared = await adapter.allocate(input, [{ level: 0, value: { data: new Uint8Array(8), fallbackData: opaque } }], { maxBytes: 68, signal: new AbortController().signal });
    expect((prepared.allocation.native as { format?: string }).format).toBe("rgba8unorm");
    await expect(adapter.allocate(input, [{ level: 0, value: { data: new Uint8Array(8), fallbackData: opaque } }], { maxBytes: 68, signal: new AbortController().signal })).rejects.toThrow(/budget/i);
    const retired = adapter.retire(prepared.allocation); fences.shift()!.resolve(); await retired;
    const unprepared = adapter.unprepare(input, adapter.generation()); fences.shift()!.resolve(); await unprepared;
    device.dispose();
  });

  it("preserves opaque RGB and single-channel fallback semantics before allocation", async () => {
    const f = await fixture();
    const incomplete = new Texture({ width: 4, height: 4, data: new Uint8Array(64), mipLevelCount: 1, generateMipmaps: false });
    expect(() => f.adapter.prepare(source(incomplete), { generation: f.adapter.generation(), maxBytes: 68 })).toThrow(/source or fallback/);
    expect(f.adapter.usageBytes()).toBe(0);
    const etc = new Texture({ width: 4, height: 4, format: "etc2-rgb8unorm", data: new Uint8Array(8), generateMipmaps: false });
    const input = { ...source(etc), levels: [{ width: 4, height: 4, bytes: 8 }] };
    expect(() => f.adapter.prepare({ ...input, fallback: [0, 0, 0, 254] }, { generation: f.adapter.generation(), maxBytes: 68 })).toThrow(/channel semantics/);
    f.adapter.prepare(input, { generation: f.adapter.generation(), maxBytes: 68 });
    await expect(f.adapter.allocate(input, [{ level: 0, value: { data: new Uint8Array(8), fallbackData: new Uint8Array(64) } }], { maxBytes: 68, signal: new AbortController().signal })).rejects.toThrow(/opaque alpha/);
    expect(f.adapter.usageBytes()).toBe(4);
    const unprepared = f.adapter.unprepare(input, f.adapter.generation()); f.fences.shift()!.resolve(); await unprepared;
    const red = new Texture({ width: 4, height: 4, format: "r32f", data: new Float32Array(16), generateMipmaps: false });
    const redInput = { ...source(red), levels: [{ width: 4, height: 4, bytes: 64 }] };
    expect(() => f.adapter.prepare(redInput, { generation: f.adapter.generation(), maxBytes: 4 })).toThrow(/channel semantics/);
    const redValid = { ...redInput, fallback: [128, 0, 0, 255] as const };
    f.adapter.prepare(redValid, { generation: f.adapter.generation(), maxBytes: 4 });
    expect(f.writes.at(-1)!.bytes).toEqual([128, 0, 0, 255]);
    const redRetired = f.adapter.unprepare(redValid, f.adapter.generation()); f.fences.shift()!.resolve(); await redRetired;
    f.device.dispose();
  });

  it("prepares during real controller acquisition and notifies loss only after native invalidation and debit", async () => {
    const { device, adapter, loss, textures } = await fixture(true);
    const texture = new Texture({ width: 4, height: 4, data: new Uint8Array(64), mipLevelCount: 3, generateMipmaps: false });
    const input = source(texture);
    const controller = new TextureResidencyController(adapter, { budgetBytes: 88 });
    const lease = controller.acquire(input, { distanceMeters: 1 });
    expect(adapter.usageBytes()).toBe(4);
    expect(device.getNativeTexture(texture)).toBe(textures[0]);
    await controller.whenSettled();
    expect(controller.snapshot().entries[0]!.residentLevels).toBe(3);
    expect(adapter.usageBytes()).toBe(88);
    let chargeAtLoss = -1;
    adapter.onDeviceLost(() => { chargeAtLoss = adapter.usageBytes(); });
    loss.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(chargeAtLoss).toBe(0);
    expect(textures.every(texture => texture.destroyed)).toBe(true);
    expect(() => device.getNativeTexture(texture)).toThrow(/lost/);
    lease.release(); controller.dispose(); device.dispose();
  });

  it("charges mipmapped target color and sampleable depth until native retirement", async () => {
    const f = await fixture(false, 232);
    expect(() => f.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", mipLevelCount: 3, depth: true })).not.toThrow();
    expect(f.adapter.usageBytes()).toBe(232); // 168 color + modeled 64 depth bytes.
    expect(f.device.getDiagnostics().textureBytes).toBe(232);
    expect(f.device.getDiagnostics().gpuTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: expect.stringContaining("depth-estimate-4-bytes-per-sample"), bytes: 64 })
    ]));
    const logical = new Texture({ width: 4, height: 4, data: new Uint8Array(64), mipLevelCount: 3, generateMipmaps: false });
    expect(() => f.adapter.prepare(source(logical), { generation: f.adapter.generation(), maxBytes: 300 })).toThrow(/budget/i);
    f.device.dispose();
    expect(f.adapter.usageBytes()).toBe(0);
    const pending = await fixture();
    const target = pending.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", mipLevelCount: 3, depth: true });
    target.dispose();
    expect(pending.adapter.usageBytes()).toBe(232);
    for (const fence of pending.fences.splice(0)) fence.resolve();
    await Promise.resolve(); await Promise.resolve();
    expect(pending.adapter.usageBytes()).toBe(0);
    pending.device.dispose();
    const rejected = await fixture(false, 231);
    expect(() => rejected.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", mipLevelCount: 3, depth: true })).toThrow(/budget/i);
    expect(rejected.adapter.usageBytes()).toBe(0);
    expect(rejected.textures).toHaveLength(0);
    rejected.device.dispose();
  });

  it("enforces a live controller limit across targets and permits cleanup after logical texture mutation", async () => {
    const f = await fixture(true);
    const limit = f.adapter.acquireBudgetLimit(20);
    const target = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const texture = new Texture({ width: 4, height: 4, data: new Uint8Array(64), mipLevelCount: 3, generateMipmaps: false });
    const input = source(texture), generation = f.adapter.generation();
    f.adapter.prepare(input, { generation, maxBytes: 20 });
    expect(f.adapter.usageBytes()).toBe(20);
    expect(() => f.device.createRenderTarget({ width: 1, height: 1, depth: false })).toThrow(/budget/i);
    limit.setLimit(10);
    expect(f.adapter.usageBytes()).toBe(20);
    texture.needsUpdate = true;
    expect(() => f.device.getNativeTexture(texture)).toThrow(/changed after streaming/);
    expect(() => f.adapter.estimate(input, 1)).toThrow(/changed after streaming/);
    expect(() => f.adapter.publish(texture, null, generation)).not.toThrow();
    await f.adapter.unprepare(input, generation);
    target.dispose(); await Promise.resolve(); await Promise.resolve();
    expect(f.adapter.usageBytes()).toBe(0);
    limit.release(); limit.release();
    f.device.dispose();
  });
});
