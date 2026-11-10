import { describe, expect, it } from "vitest";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import type { UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { generatedPbrPatchByteRange, packGeneratedPbrMaterialUniforms, patchGeneratedPbrMaterialUniform } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import { UniformArena, UniformArenaRegion, type UniformArenaImageTag } from "../../../packages/rendering/src/webgpu/UniformArena";
import { MembershipVersionedSet, TextureOwnerMemo } from "../../../packages/rendering/src/webgpu/TextureOwnerMemo";

// 5.5.1 P1: batched draws' uniform blocks live in a per-frame arena uploaded with one write per dirty run.

interface FakeBuffer { readonly label: string; readonly size: number; readonly gpu: Uint8Array }

function arenaFixture(options: { alignment?: number; firstChunkSize?: number; maxChunkSize?: number; mergeGap?: number } = {}) {
  const writes: { buffer: FakeBuffer; offset: number; size: number }[] = [];
  const chunks: FakeBuffer[] = [];
  let fail = false;
  const arena = new UniformArena<FakeBuffer>({
    createChunk: (size, index) => { const buffer = { label: `chunk-${index}`, size, gpu: new Uint8Array(size) }; chunks.push(buffer); return buffer; },
    write: (buffer, offset, bytes) => {
      if (fail) throw new Error("write failed");
      buffer.gpu.set(bytes, offset);
      writes.push({ buffer, offset, size: bytes.byteLength });
    }
  }, { alignment: options.alignment ?? 256, firstChunkSize: options.firstChunkSize ?? 4096, maxChunkSize: options.maxChunkSize ?? 16384, mergeGap: options.mergeGap ?? 256 });
  const gpuBytes = (region: UniformArenaRegion<FakeBuffer>) => region.buffer.gpu.slice(region.offset, region.offset + region.size);
  return { arena, writes, chunks, gpuBytes, failWrites: (value: boolean) => { fail = value; } };
}

function block(size: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(size);
  const words = new Uint32Array(bytes.buffer);
  for (let index = 0; index < words.length; index += 1) words[index] = (seed * 2654435761 + index * 40503) >>> 0;
  return bytes;
}

describe("5.5.1 uniform arena: uploaded bytes", () => {
  it("leaves every staged region equal to its block across frames, size changes, overlapping layouts, tags and patches", () => {
    const f = arenaFixture();
    let seed = 11;
    const next = () => (seed = (seed * 48271) % 2147483647);
    const sizes = [64, 60, 1676, 4256, 8144, 256, 12];
    // Slot images: a stable image object per (slot, parity), rewritten in place with a version bump, as the device does.
    const images = new Map<string, { bytes: Uint8Array; version: number }>();
    for (let frame = 0; frame < 120; frame += 1) {
      f.arena.rewind();
      const count = 1 + (next() % 12);
      const staged: { region: UniformArenaRegion<FakeBuffer>; expected: Uint8Array }[] = [];
      for (let draw = 0; draw < count; draw += 1) {
        const size = sizes[next() % sizes.length]!;
        const kind = next() % 4;
        let bytes: Uint8Array, tag: UniformArenaImageTag | undefined;
        if (kind === 0) {
          // A fresh block each time (no tag).
          bytes = block(size, next());
        } else {
          // A slot image: sometimes unchanged, sometimes rewritten as a patch of the other image of the slot.
          const key = `${draw}:${size}`;
          const current = images.get(`${key}:a`) ?? { bytes: block(size, next()), version: 1 };
          images.set(`${key}:a`, current);
          if (kind === 3 && size >= 64) {
            const spare = images.get(`${key}:b`) ?? { bytes: new Uint8Array(size), version: 0 };
            spare.bytes.set(current.bytes);
            const start = (next() % (size >> 2)) << 2, end = Math.min(size, start + 4 * (1 + (next() % 16)));
            new Uint32Array(spare.bytes.buffer, start, (end - start) >> 2).fill(next());
            spare.version += 1;
            // The patched image becomes current and the old one becomes the spare.
            images.set(`${key}:a`, spare); images.set(`${key}:b`, current);
            bytes = spare.bytes;
            tag = { image: spare.bytes, version: spare.version, patch: { base: current.bytes, baseVersion: current.version, start, end } };
          } else {
            bytes = current.bytes;
            tag = { image: current.bytes, version: current.version };
          }
        }
        const region = f.arena.stage(bytes, tag);
        expect(region).not.toBeNull();
        staged.push({ region: region!, expected: bytes.slice() });
      }
      // Regions of one frame never overlap.
      const sorted = staged.map(({ region }) => region).sort((a, b) => a.buffer.label.localeCompare(b.buffer.label) || a.offset - b.offset);
      for (let index = 1; index < sorted.length; index += 1) {
        const a = sorted[index - 1]!, b = sorted[index]!;
        if (a.buffer === b.buffer) expect(a.offset + a.size).toBeLessThanOrEqual(b.offset);
        expect(b.offset % 256).toBe(0);
      }
      f.arena.flush();
      expect(f.arena.pending).toBe(false);
      // Rewritten bytes equal a full repack: every region holds exactly its block after the flush.
      for (const { region, expected } of staged) expect(f.gpuBytes(region)).toEqual(expected);
    }
    expect(f.chunks.length).toBeGreaterThan(1);
  });

  it("coalesces nearby dirty runs into one write, skips unchanged blocks and keeps stable regions per offset", () => {
    const f = arenaFixture({ mergeGap: 256 });
    const frame = (seed: number) => {
      f.arena.rewind();
      const regions = Array.from({ length: 8 }, (_, index) => f.arena.stage(block(64, seed * 100 + index))!);
      f.arena.flush();
      return regions;
    };
    const first = frame(1);
    // Eight 64-byte blocks 256 bytes apart (192 clean bytes between): one write.
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]).toMatchObject({ offset: 0, size: 7 * 256 + 64 });
    // The same bytes again: no write, the same region objects.
    f.arena.rewind();
    const again = Array.from({ length: 8 }, (_, index) => f.arena.stage(block(64, 100 + index))!);
    f.arena.flush();
    expect(f.writes).toHaveLength(1);
    expect(again.every((region, index) => region === first[index])).toBe(true);
    // Only block 5 changes: one write of just its changed words.
    f.arena.rewind();
    for (let index = 0; index < 8; index += 1) {
      const bytes = block(64, 100 + index);
      if (index === 5) bytes[12] ^= 0xff;
      f.arena.stage(bytes);
    }
    f.arena.flush();
    expect(f.writes.slice(1)).toEqual([{ buffer: f.chunks[0], offset: 5 * 256 + 12, size: 4 }]);
    // Runs farther apart than the gap stay separate writes.
    const wide = arenaFixture({ mergeGap: 64 });
    for (let index = 0; index < 3; index += 1) wide.arena.stage(block(64, index + 1));
    wide.arena.flush();
    expect(wide.writes).toHaveLength(3);
  });

  it("trusts a remembered image only while no other block overlapped its range", () => {
    const f = arenaFixture();
    const image = block(512, 3);
    const tag = { image, version: 1 };
    const region = f.arena.stage(image, tag)!;
    f.arena.flush();
    // Next frame a smaller block takes offset 0 and a larger one covers the rest of the image's old range.
    f.arena.rewind();
    f.arena.stage(block(64, 9));
    f.arena.stage(block(512, 10));
    f.arena.flush();
    // The image comes back at offset 0 with the same tag: its bytes were overwritten, so they are written again.
    f.arena.rewind();
    const back = f.arena.stage(image, tag)!;
    f.arena.flush();
    expect(back.offset).toBe(region.offset);
    expect(f.gpuBytes(back)).toEqual(image);
  });

  it("refuses blocks it cannot place, and stops staging after a failed upload until reset", () => {
    const f = arenaFixture({ maxChunkSize: 1024, firstChunkSize: 512 });
    expect(f.arena.stage(new Uint8Array(0))).toBeNull();
    expect(f.arena.stage(new Uint8Array(6))).toBeNull();
    expect(f.arena.stage(new Uint8Array(2048))).toBeNull();
    // A block larger than the first chunk opens a chunk big enough for it.
    const big = f.arena.stage(block(768, 1))!;
    expect(big.size).toBe(768);
    f.failWrites(true);
    expect(() => f.arena.flush()).toThrow(/write failed/);
    expect(f.arena.broken).toBe(true);
    expect(f.arena.stage(block(64, 2))).toBeNull();
    f.failWrites(false);
    expect(f.arena.reset()).toHaveLength(f.chunks.length);
    const after = f.arena.stage(block(64, 3))!;
    f.arena.flush();
    expect(f.gpuBytes(after)).toEqual(block(64, 3));
  });

  it("rejects an alignment that is not a power of two", () => {
    expect(() => arenaFixture({ alignment: 96 })).toThrow(/power of two/);
  });
});

describe("5.5.1 generated-PBR patch ranges", () => {
  it("covers exactly the bytes a patch rewrites", () => {
    const uniforms = new Map<string, UniformValue>([["u_modelMatrix", Array.from({ length: 16 }, (_, i) => i + 1)], ["u_baseColor", [0.1, 0.2, 0.3, 1]],
      ["u_shadowMapNormalBias", 0.25], ["u_normalMatrix", Array.from({ length: 16 }, (_, i) => i / 3)]]);
    const base = packGeneratedPbrMaterialUniforms(uniforms);
    for (const [name, value, length] of [["u_modelMatrix", Array.from({ length: 16 }, (_, i) => 40 - i), 16], ["u_baseColor", [0.9, 0.8, 0.7, 0.5], 4],
      ["u_shadowMapNormalBias", 0.75, -1], ["u_normalMatrix", Array.from({ length: 16 }, (_, i) => -i), 16]] as const) {
      const bytes = base.slice();
      expect(patchGeneratedPbrMaterialUniform(bytes, name, value, length, false)).toBe(true);
      const [start, end] = generatedPbrPatchByteRange(name, length)!;
      // Outside the range the bytes are untouched; the full repack with the new value equals the patched bytes.
      expect(bytes.subarray(0, start)).toEqual(base.subarray(0, start));
      expect(bytes.subarray(end)).toEqual(base.subarray(end));
      const repacked = new Map(uniforms); repacked.set(name, value as UniformValue);
      expect(bytes).toEqual(packGeneratedPbrMaterialUniforms(repacked));
    }
    expect(generatedPbrPatchByteRange("u_roughness", -1)).toBeNull();
  });
});

describe("5.5.1 owner memo: remembered misses", () => {
  it("remembers a missing owner only when asked, until the membership changes", () => {
    interface Candidate { readonly name: string; owned: object[] }
    const set = new MembershipVersionedSet<Candidate>();
    const memo = new TextureOwnerMemo<object, Candidate>();
    const texture = {};
    let scans = 0;
    const owns = (candidate: Candidate, key: object) => { scans += 1; return candidate.owned.includes(key); };
    const a: Candidate = { name: "a", owned: [] };
    set.add(a);
    expect(memo.find(set, texture, owns, true)).toBeUndefined();
    const after = scans;
    expect(memo.find(set, texture, owns, true)).toBeUndefined();
    expect(scans).toBe(after);
    // A member added (or a caller's version bump) makes the next lookup scan again.
    const b: Candidate = { name: "b", owned: [texture] };
    set.add(b);
    expect(memo.find(set, texture, owns, true)?.name).toBe("b");
    a.owned = [texture];
    set.version += 1;
    set.delete(b);
    expect(memo.find(set, texture, owns, true)?.name).toBe("a");
    // Without the flag a miss is scanned every time.
    const other = {};
    expect(memo.find(set, other, owns)).toBeUndefined();
    const plain = scans;
    expect(memo.find(set, other, owns)).toBeUndefined();
    expect(scans).toBeGreaterThan(plain);
  });
});

describe("5.5.1 batched draws on the uniform arena", () => {
  const flags: QrFlags = { values: {}, on: () => true };
  const matrix = (seed: number) => Array.from({ length: 16 }, (_, index) => seed + index / 8);
  const lit = (model: number, roughness = 0.5) => new Map<string, UniformValue>([
    ["u_modelMatrix", matrix(model)], ["u_normalMatrix", matrix(2)], ["u_baseColor", [0.2, 0.4, 0.6, 1]], ["u_roughness", roughness]
  ]);

  async function deviceFixture() {
    const contents = new Map<object, Uint8Array>();
    const events: string[] = [];
    const bound: { buffer: { size: number }; offset?: number; size?: number }[] = [];
    const native = {
      limits: { minUniformBufferOffsetAlignment: 256 },
      queue: {
        submit(buffers: readonly unknown[]) { events.push(`submit:${buffers.length}`); },
        onSubmittedWorkDone: async () => {}, writeTexture() {},
        writeBuffer(buffer: { label?: string; size: number }, offset: number, data: ArrayBufferView) {
          const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          let image = contents.get(buffer);
          if (!image) { image = new Uint8Array(buffer.size); contents.set(buffer, image); }
          image.set(bytes, offset);
          events.push(`write:${buffer.label ?? "?"}`);
        }
      },
      createBuffer: ({ label, size }: { readonly label?: string; readonly size: number }) => ({ label, size, destroy() {} }),
      createTexture: () => ({ createView: () => ({}), destroy() {} }),
      createShaderModule: () => ({}), createSampler: () => ({}),
      createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
      createBindGroup: (descriptor: { entries: readonly { binding: number; resource: unknown }[] }) => ({ descriptor }),
      createCommandEncoder: () => ({
        beginRenderPass: () => ({
          setPipeline() {}, setVertexBuffer() {}, setIndexBuffer() {}, setViewport() {}, setScissorRect() {}, end() {},
          draw() { events.push("draw"); }, drawIndexed() { events.push("draw"); },
          setBindGroup(index: number, group: { descriptor?: { entries: readonly { binding: number; resource: unknown }[] } }) {
            if (index !== 0) return;
            const resource = group.descriptor?.entries.find((entry) => entry.binding === 0)?.resource as { buffer: { size: number }; offset?: number; size?: number };
            bound.push(resource);
          }
        }),
        finish: () => ({})
      }),
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike }, nativeDrawBatching: true });
    const generated = generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none" }), { flags });
    const shader = device.createShaderProgram({ label: "generated", marker: GENERATED_PROGRAM_MARKER, vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor! });
    const frame = device.createBuffer("uniform", 304, new Float32Array(76));
    const target = device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: false });
    const vertices = device.createBuffer("vertex", 72);
    const boundBytes = (resource: { buffer: { size: number }; offset?: number; size?: number }) => {
      const image = contents.get(resource.buffer) ?? new Uint8Array(resource.buffer.size);
      return resource.offset === undefined ? image : image.slice(resource.offset, resource.offset + resource.size!);
    };
    const draw = (label: string, uniforms: ReadonlyMap<string, UniformValue>) =>
      device.draw({ label, topology: "triangles", vertexBuffer: vertices, vertexFormat: VertexFormat.P3N3, vertexCount: 3, shader, uniforms: new Map(uniforms) });
    const open = () => { device.beginFrame(2, 2); device.setRenderTarget(target); device.bindUniformBuffer(frame, 0); };
    return { device, events, bound, boundBytes, draw, open, contents };
  }

  it("uploads staged blocks before the submit of the batch that reads them, including draws recorded after a mid-batch flush", async () => {
    const f = await deviceFixture();
    f.open();
    f.device.beginDrawBatch();
    f.draw("a", lit(1));
    f.draw("b", lit(3));
    expect(f.events.filter((event) => event.startsWith("write:aura3d-uniform-arena"))).toEqual([]);
    // An unrelated submission flushes the batch: the arena upload lands first.
    f.device.flushDrawBatch();
    const firstSubmit = f.events.findIndex((event) => event.startsWith("submit"));
    expect(firstSubmit).toBeGreaterThan(0);
    expect(f.events.slice(0, firstSubmit).some((event) => event === "write:aura3d-uniform-arena-0")).toBe(true);
    // A draw recorded into the next batch of the same frame takes a new range, uploaded before that batch's submit.
    const marker = f.events.length;
    f.draw("c", lit(5));
    f.device.endDrawBatch();
    const tail = f.events.slice(marker).filter((event) => /^(write|submit)/.test(event));
    expect(tail).toEqual(["write:aura3d-uniform-arena-0", "submit:1"]);
    f.device.endFrame();
    expect(f.bound).toHaveLength(3);
    expect(new Set(f.bound.map((resource) => resource.offset)).size).toBe(3);
    for (const [index, uniforms] of [lit(1), lit(3), lit(5)].entries()) expect(f.boundBytes(f.bound[index]!)).toEqual(packGeneratedPbrMaterialUniforms(uniforms));
  });

  it("writes only changed runs on later frames, equal to a full repack, and still throws for refused values", async () => {
    const f = await deviceFixture();
    const run = (models: readonly number[], roughness = 0.5) => {
      f.bound.length = 0;
      f.open();
      f.device.beginDrawBatch();
      try { for (const [index, model] of models.entries()) f.draw(`d${index}`, lit(model, roughness)); }
      finally { f.device.endDrawBatch(); f.device.endFrame(); }
      for (const [index, model] of models.entries()) expect(f.boundBytes(f.bound[index]!)).toEqual(packGeneratedPbrMaterialUniforms(lit(model, roughness)));
    };
    run([1, 2, 3]);
    // Unchanged frame: no arena write at all.
    let marker = f.events.length;
    run([1, 2, 3]);
    expect(f.events.slice(marker).filter((event) => event.startsWith("write:"))).toEqual([]);
    // One moved draw (a patched slot image): one arena write.
    marker = f.events.length;
    run([1, 7, 3]);
    expect(f.events.slice(marker).filter((event) => event.startsWith("write:"))).toEqual(["write:aura3d-uniform-arena-0"]);
    // A repack (not a direct uniform) and a changing draw count keep exact bytes.
    run([1, 7, 3], 0.9);
    run([4]);
    run([4, 5, 6, 7]);
    // A refused value still reaches the validating packer and throws; the next frame recovers exact bytes.
    const broken = lit(1); broken.set("u_modelMatrix", [...matrix(4).slice(0, 15), Number.NaN]);
    f.open();
    f.device.beginDrawBatch();
    try { expect(() => f.draw("bad", broken)).toThrow(/u_modelMatrix/); }
    finally { f.device.endDrawBatch(); f.device.endFrame(); }
    run([1, 2, 3]);
  });
});
