import { describe, expect, it } from "vitest";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import { MockRenderDevice, type RenderTarget, type UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { packGeneratedPbrMaterialUniforms } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import { MembershipVersionedSet, TextureOwnerMemo } from "../../../packages/rendering/src/webgpu/TextureOwnerMemo";
import { ReflectionProbeSystem, type ReflectionProbeSpec } from "../../../packages/rendering/src/probes/ReflectionProbeSystem";
import { disposePrd02Probes, prd02BeforeFrameAsync } from "../../../packages/rendering/src/probes/Prd02ProbesContributor";
import type { RenderSource } from "../../../packages/rendering/src/contracts/renderSource";

const flags: QrFlags = { values: {}, on: () => true };
const matrix = (seed: number) => Array.from({ length: 16 }, (_, index) => seed + index / 8);
const pack = (uniforms: ReadonlyMap<string, UniformValue>) => packGeneratedPbrMaterialUniforms(uniforms);

/** A fake native device recording buffer contents, writes, submissions and the material buffer each draw bound. */
async function nativeFixture() {
  const contents = new Map<object, Uint8Array>();
  const events: string[] = [];
  const bound: object[] = [];
  const native = {
    queue: {
      submit(buffers: readonly unknown[]) { events.push(`submit:${buffers.length}`); },
      onSubmittedWorkDone: async () => {}, writeTexture() {},
      writeBuffer(buffer: { label?: string; size: number }, offset: number, data: ArrayBuffer | ArrayBufferView, dataOffset = 0, size?: number) {
        const view = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const bytes = view.subarray(dataOffset, size === undefined ? undefined : dataOffset + size);
        let image = contents.get(buffer);
        if (!image) { image = new Uint8Array(buffer.size); contents.set(buffer, image); }
        image.set(bytes, offset);
        events.push(`write:${buffer.label ?? "?"}`);
      }
    },
    createBuffer: ({ label, size }: { readonly label?: string; readonly size: number }) => ({ label, size, destroy() {} }),
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    createShaderModule: () => ({}),
    createSampler: () => ({}),
    createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
    createBindGroup: (descriptor: { entries: readonly { binding: number; resource: unknown }[] }) => ({ descriptor }),
    createCommandEncoder: () => ({
      beginRenderPass: () => ({
        setPipeline() {}, setVertexBuffer() {}, setViewport() {}, setScissorRect() {}, draw() {}, end() {},
        setBindGroup(index: number, group: { descriptor?: { entries: readonly { binding: number; resource: unknown }[] } }) {
          if (index !== 0) return;
          const entry = group.descriptor?.entries.find((candidate) => candidate.binding === 0);
          const buffer = (entry?.resource as { buffer?: object } | undefined)?.buffer;
          if (buffer) bound.push(buffer);
        }
      }),
      finish: () => ({})
    }),
    destroy() {}
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike }, nativeDrawBatching: true });
  const features = normalizeProgramFeatures({ lighting: "lit", maps: {}, extensions: [], environment: "none" });
  const generated = generateProgramImpl(features, { flags });
  const shader = device.createShaderProgram({ label: "generated", marker: GENERATED_PROGRAM_MARKER,
    vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor! });
  const frame = device.createBuffer("uniform", 304, new Float32Array(76));
  const target = device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: false });
  return { device, native, contents, events, bound, shader, frame, target, generated };
}

describe("WebGPU perf round 4: slot images skip the compare only when the buffer holds them", () => {
  const lit = (variant: number) => new Map<string, UniformValue>([
    ["u_modelMatrix", matrix(1 + (variant & 1) * 3)], ["u_normalMatrix", matrix(2)], ["u_baseColor", [0.2, 0.4, 0.6, 1]],
    ["u_metallic", (variant & 2) ? 0.75 : 0.25], ["u_roughness", (variant & 4) ? 0.9 : 0.5]
  ]);

  it("leaves every draw's buffer equal to a full pack across reuse, rewrites, pool reordering and refused values", async () => {
    const f = await nativeFixture();
    const vertices = f.device.createBuffer("vertex", 72);
    let seed = 7;
    const next = () => (seed = (seed * 48271) % 2147483647);
    const runFrame = (draws: readonly (ReadonlyMap<string, UniformValue> | readonly [typeof f.shader, ReadonlyMap<string, UniformValue>])[]) => {
      const list = draws.map((draw) => (draw instanceof Map ? [f.shader, draw] : draw) as readonly [typeof f.shader, ReadonlyMap<string, UniformValue>]);
      f.bound.length = 0;
      f.device.beginFrame(2, 2); f.device.setRenderTarget(f.target); f.device.bindUniformBuffer(f.frame, 0);
      f.device.beginDrawBatch();
      try {
        for (const [index, [shader, uniforms]] of list.entries()) {
          f.device.draw({ label: `pbr${index}`, topology: "triangles", vertexBuffer: vertices, vertexFormat: VertexFormat.P3N3, vertexCount: 3, shader, uniforms: new Map(uniforms) });
        }
      } finally { f.device.endDrawBatch(); f.device.endFrame(); }
      expect(f.bound).toHaveLength(list.length);
      for (const [index, [, uniforms]] of list.entries()) expect(f.contents.get(f.bound[index]!)).toEqual(pack(uniforms));
    };
    // A second program's draw taken first moves the first program's slot to another pooled buffer, which keeps an older
    // image of that slot: when the slot rewrites that image and hands it back to the buffer, the bytes must be written.
    const other = f.device.createShaderProgram({ label: "generated-2", marker: GENERATED_PROGRAM_MARKER,
      vertex: f.generated.vertex, fragment: f.generated.fragment, generatedProgram: f.generated.descriptor! });
    const moved = (seed: number) => { const uniforms = lit(0); uniforms.set("u_modelMatrix", matrix(seed)); return uniforms; };
    runFrame([moved(1)]);
    runFrame([[other, lit(4)], moved(1)]);
    runFrame([moved(2)]);
    runFrame([moved(3)]);
    runFrame([[other, lit(4)], moved(3)]);
    // Unchanged, rewritten, alternating images and a changing draw count (the pool hands buffers out in another order).
    for (let frame = 0; frame < 40; frame += 1) {
      const count = 1 + (next() % 3);
      runFrame(Array.from({ length: count }, () => lit(next() % 8)));
    }
    // An unchanged frame writes no material bytes at all.
    const steady = [lit(1), lit(2)];
    runFrame(steady);
    const before = f.events.length;
    runFrame(steady);
    expect(f.events.slice(before).filter((event) => event.endsWith("-generated-pbr-material"))).toEqual([]);
    // A refused value still reaches the validating packer, and the slot recovers to exact bytes afterwards.
    const broken = lit(1); broken.set("u_modelMatrix", [...matrix(4).slice(0, 15), Number.NaN]);
    expect(() => runFrame([broken])).toThrow(/u_modelMatrix/);
    runFrame(steady);
    runFrame([lit(3), lit(0)]);
    f.device.dispose();
  });
});

describe("WebGPU perf round 4: buffer updates inside an open draw batch", () => {
  it("submits recorded draws before a write only when they read the written buffer", async () => {
    const f = await nativeFixture();
    const read = f.device.createBuffer("vertex", 72);
    const other = f.device.createBuffer("vertex", 72);
    const uniforms = new Map<string, UniformValue>([["u_modelMatrix", matrix(1)], ["u_normalMatrix", matrix(2)], ["u_baseColor", [1, 1, 1, 1]]]);
    f.device.beginFrame(2, 2); f.device.setRenderTarget(f.target); f.device.bindUniformBuffer(f.frame, 0);
    f.device.beginDrawBatch();
    try {
      f.device.draw({ label: "a", topology: "triangles", vertexBuffer: read, vertexFormat: VertexFormat.P3N3, vertexCount: 3, shader: f.shader, uniforms });
      expect(f.device.pendingBatchedDraws).toBe(1);
      // A buffer the recorded draw does not read: the batch stays open and the next draw joins it.
      f.device.updateBuffer(other, 0, new Float32Array(18).fill(2));
      expect(f.device.pendingBatchedDraws).toBe(1);
      f.device.draw({ label: "b", topology: "triangles", vertexBuffer: other, vertexFormat: VertexFormat.P3N3, vertexCount: 3, shader: f.shader, uniforms });
      expect(f.device.pendingBatchedDraws).toBe(2);
      const submitted = f.events.filter((event) => event.startsWith("submit")).length;
      // A buffer the recorded draws read: they are submitted before the write lands.
      const marker = f.events.length;
      f.device.updateBuffer(read, 0, new Float32Array(18).fill(3));
      expect(f.device.pendingBatchedDraws).toBe(0);
      const after = f.events.slice(marker);
      expect(after[0]).toMatch(/^submit/);
      expect(after.slice(1).some((event) => event.startsWith("write"))).toBe(true);
      expect(f.events.filter((event) => event.startsWith("submit")).length).toBe(submitted + 1);
      // The frame uniform buffer is read by every generated draw.
      f.device.draw({ label: "c", topology: "triangles", vertexBuffer: other, vertexFormat: VertexFormat.P3N3, vertexCount: 3, shader: f.shader, uniforms });
      expect(f.device.pendingBatchedDraws).toBe(1);
      f.device.updateBuffer(f.frame, 0, new Float32Array(76).fill(1));
      expect(f.device.pendingBatchedDraws).toBe(0);
      // Invalid writes still throw.
      expect(() => f.device.updateBuffer(other, 70, new Float32Array(4))).toThrow(/out of bounds/);
    } finally { f.device.endDrawBatch(); f.device.endFrame(); }
    f.device.dispose();
    expect(() => f.device.updateBuffer(other, 0, new Float32Array(1))).toThrow();
  });
});

describe("WebGPU perf round 4: render-target owner memo", () => {
  it("returns the first owner in set order, rechecks a remembered owner and rescans after membership changes", () => {
    interface Candidate { readonly name: string; owned: object[]; disposed?: boolean }
    const set = new MembershipVersionedSet<Candidate>();
    const memo = new TextureOwnerMemo<object, Candidate>();
    const owns = (texture: object) => (candidate: Candidate) => !candidate.disposed && candidate.owned.includes(texture);
    const texture = {};
    const a: Candidate = { name: "a", owned: [] }, b: Candidate = { name: "b", owned: [texture] }, c: Candidate = { name: "c", owned: [texture] };
    set.add(a); set.add(b); set.add(c);
    const version = set.version;
    set.add(b);
    expect(set.version).toBe(version);
    expect(memo.find(set, texture, owns(texture))?.name).toBe("b");
    expect(memo.find(set, texture, owns(texture))?.name).toBe("b");
    // The remembered owner stops owning: rescan.
    b.owned = [];
    expect(memo.find(set, texture, owns(texture))?.name).toBe("c");
    // An earlier member joins the set: the set order decides again.
    b.owned = [texture];
    set.delete(b); set.add(b);
    a.owned = [texture];
    expect(memo.find(set, texture, owns(texture))?.name).toBe("a");
    a.disposed = true;
    expect(memo.find(set, texture, owns(texture))?.name).toBe("c");
    set.clear();
    expect(memo.find(set, texture, owns(texture))).toBeUndefined();
    // No owner is never remembered.
    const later: Candidate = { name: "later", owned: [] };
    set.add(later);
    expect(memo.find(set, texture, owns(texture))).toBeUndefined();
    later.owned = [texture];
    expect(memo.find(set, texture, owns(texture))?.name).toBe("later");
  });
});

describe("WebGPU perf round 4: deferred reflection probe capture", () => {
  const spec = (over: Partial<ReflectionProbeSpec> = {}): ReflectionProbeSpec => ({
    name: "p1", position: [0, 0, 0], boxHalfExtents: [1, 1, 1], blendDistance: 0.5, update: "once", ...over
  });
  const face = (index: number, size: number) => Float32Array.from({ length: size * size * 4 }, (_, i) => ((i * 7 + index * 13) % 17) / 16);

  /** Readbacks resolve only when released; each face reads distinct pixels. */
  class HeldReadbackDevice extends MockRenderDevice {
    readonly held: { resolve: () => void; reject: (error: unknown) => void }[] = [];
    reads = 0;
    failNext = 0;
    override readFloatPixels(): Float32Array { throw new Error("synchronous readback called"); }
    readFloatPixelsAsync(_x: number, _y: number, width: number): Promise<Float32Array> {
      const index = this.reads++ % 6;
      const fail = this.failNext > 0;
      if (fail) this.failNext -= 1;
      return new Promise((resolve, reject) => {
        this.held.push({ resolve: () => (fail ? reject(new Error("readback lost")) : resolve(face(index, width))), reject });
      });
    }
    release(): void { for (const pending of this.held.splice(0)) pending.resolve(); }
  }
  class ImmediateReadbackDevice extends MockRenderDevice {
    reads = 0;
    override readFloatPixels(): Float32Array { throw new Error("synchronous readback called"); }
    async readFloatPixelsAsync(_x: number, _y: number, width: number): Promise<Float32Array> { return face(this.reads++ % 6, width); }
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const noFace = (_face: number, _target: RenderTarget) => {};

  it("publishes the same probe as an awaited capture, a call after its readbacks complete, without waiting for them", async () => {
    const reference = new ImmediateReadbackDevice();
    const awaited = new ReflectionProbeSystem(reference, noFace);
    awaited.register(spec({ resolution: 64 }));
    expect(await awaited.updateAsync()).toEqual(["p1"]);

    const device = new HeldReadbackDevice();
    const system = new ReflectionProbeSystem(device, noFace);
    system.register(spec({ resolution: 64 }));
    expect(system.updateDeferred()).toEqual([]);
    expect(device.reads).toBe(6);
    expect(device.getRenderTarget()).toBeNull();
    // Still in flight: no new faces, nothing published.
    expect(system.updateDeferred()).toEqual([]);
    expect(device.reads).toBe(6);
    expect(system.probes()).toHaveLength(0);
    // A scene change keeps a cube whose six faces were rendered together.
    system.restartPartialCaptures();
    device.release();
    await settle();
    expect(system.updateDeferred()).toEqual(["p1"]);
    expect(system.probes()[0]!.sh9).toEqual(awaited.probes()[0]!.sh9);
    expect(system.probes()[0]!.faceSize).toBe(64);
    // Clean afterwards.
    expect(system.updateDeferred()).toEqual([]);
    expect(device.reads).toBe(6);
    system.dispose(); awaited.dispose(); device.dispose(); reference.dispose();
  });

  it("re-captures a probe dirtied during its readbacks, restarts time-sliced cubes, and throws a failed readback once", async () => {
    const device = new HeldReadbackDevice();
    const system = new ReflectionProbeSystem(device, noFace);
    system.register(spec({ name: "demand", update: "on-demand" }));
    system.updateProbe("demand");
    system.updateDeferred();
    system.updateProbe("demand");
    device.release(); await settle();
    expect(system.updateDeferred()).toEqual(["demand"]);
    // Dirtied while in flight: a new capture started in the same call.
    expect(device.reads).toBe(12);
    device.release(); await settle();
    expect(system.updateDeferred()).toEqual(["demand"]);
    expect(system.updateDeferred()).toEqual([]);

    const sliced = new ReflectionProbeSystem(device, noFace);
    sliced.register(spec({ name: "sliced", update: "every-n-frames", everyNFrames: 1 }));
    const start = device.reads;
    sliced.updateDeferred(); sliced.updateDeferred();
    expect(device.reads - start).toBe(2);
    sliced.restartPartialCaptures();
    device.release(); await settle();
    for (let call = 0; call < 6; call += 1) sliced.updateDeferred();
    expect(device.reads - start).toBe(8);
    device.release(); await settle();
    expect(sliced.updateDeferred()).toContain("sliced");

    const failing = new ReflectionProbeSystem(device, noFace);
    failing.register(spec({ name: "lost" }));
    device.failNext = 1;
    failing.updateDeferred();
    device.release(); await settle();
    expect(() => failing.updateDeferred()).toThrow(/readback lost/);
    expect(failing.updateDeferred()).toEqual([]);
    device.release(); await settle();
    expect(failing.updateDeferred()).toEqual(["lost"]);
    expect(() => failing.updateDeferred(0)).toThrow(RangeError);
    system.dispose(); sliced.dispose(); failing.dispose(); device.dispose();
  });

  it("lets a WebGPU async frame finish while its reflection readbacks are still pending", async () => {
    const device = new HeldReadbackDevice();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    const source = Object.assign({}, { "prd02.probes.room": { kind: "probe", probe: "reflection", name: "room",
      options: { position: [0, 1, 0], boxHalfExtents: [2, 2, 2], update: "once" } } }) as unknown as RenderSource;
    let faces = 0;
    const renderer = { device, renderProbeFace: () => { faces += 1; } };
    const frameFlags = { on: () => true } as unknown as QrFlags;
    await prd02BeforeFrameAsync(renderer, source, frameFlags);
    expect(faces).toBe(6);
    expect(device.held).toHaveLength(6);
    await prd02BeforeFrameAsync(renderer, source, frameFlags);
    expect(faces).toBe(6);
    device.release(); await settle();
    expect(await prd02BeforeFrameAsync(renderer, source, frameFlags)).toEqual(["room"]);
    disposePrd02Probes(device);
    device.dispose();
  });
});
