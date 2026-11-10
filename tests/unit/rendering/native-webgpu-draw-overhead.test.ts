import { describe, expect, it, vi } from "vitest";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { Texture } from "../../../packages/rendering/src/Texture";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, fastPortableUniformPlan, writeFastPortableUniforms, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createUniformDataWriter, writeUniformData, type UniformBlockLayout } from "../../../packages/rendering/src/program/UniformLayout";
import { WebGPUResourceInterop } from "../../../packages/rendering/src/webgpu/ResourceInterop";
import { TRANSMISSION_COPY_FRAGMENT, TRANSMISSION_COPY_MARKER, TRANSMISSION_COPY_VERTEX } from "../../../packages/rendering/src/shaders/physical/transmission_copy.glsl";
import { TRANSMISSION_COPY_WGSL_FRAGMENT, TRANSMISSION_COPY_WGSL_VERTEX } from "../../../packages/rendering/src/shaders/physical/transmission_copy.wgsl";

// Host-side draw-overhead contract: per-draw uniform pooling, sampler and bind-group reuse, cached index scans and the
// opt-in draw batch. The structural device records calls; it does not execute GPU work.
async function fixture(batching = false) {
  let finish!: () => void;
  const fence = new Promise<void>(resolve => { finish = resolve; });
  const events: string[] = [];
  const buffers: { label?: string; descriptorLabel?: string; size: number; destroy: ReturnType<typeof vi.fn> }[] = [];
  const groups: { layout: unknown; entries: readonly { binding: number; resource: unknown }[] }[] = [];
  const passes: { label?: string; colorAttachments: readonly { view: unknown; loadOp: string }[]; draws: number }[] = [];
  const textures: { descriptor: { label?: string }; destroy: ReturnType<typeof vi.fn> }[] = [];
  const createSampler = vi.fn(() => ({}));
  const submit = vi.fn((commands: readonly { passes: number }[]) => { events.push(`submit:${commands.map(command => command.passes).join(",")}`); });
  const native = {
    queue: {
      writeBuffer(buffer: { label?: string }, _offset: number, _data: ArrayBufferView) { events.push(`write:${buffer.label ?? ""}`); },
      writeTexture() { events.push("writeTexture"); },
      submit,
      onSubmittedWorkDone: () => fence
    },
    createBuffer: ({ label, size }: { label?: string; size: number }) => {
      const buffer = { label, descriptorLabel: label, size, destroy: vi.fn(() => { events.push(`destroy:${buffer.descriptorLabel ?? ""}`); }) };
      buffers.push(buffer);
      return buffer;
    },
    createTexture(descriptor: { label?: string }) {
      const texture = { descriptor, destroy: vi.fn(() => { events.push(`destroyTexture:${descriptor.label ?? ""}`); }), createView: (view?: object) => ({ texture, view }) };
      textures.push(texture);
      return texture;
    },
    createShaderModule: () => ({}),
    createSampler,
    createBindGroupLayout: (descriptor: object) => descriptor,
    createPipelineLayout: (descriptor: object) => descriptor,
    createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
    createBindGroup(group: { layout: unknown; entries: readonly { binding: number; resource: unknown }[] }) { groups.push(group); return { group }; },
    createCommandEncoder: () => {
      let count = 0;
      return {
        beginRenderPass(descriptor: { label?: string; colorAttachments: readonly { view: unknown; loadOp: string }[] }) {
          const pass = { ...descriptor, draws: 0 };
          passes.push(pass);
          count += 1;
          return {
            setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {}, setViewport() {}, setScissorRect() {},
            draw() { pass.draws += 1; }, drawIndexed() { pass.draws += 1; }, end() {}
          };
        },
        finish: () => ({ passes: count })
      };
    },
    destroy() {}
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike }, nativeDrawBatching: batching });
  const shader = device.createShaderProgram({ label: "copy", marker: TRANSMISSION_COPY_MARKER,
    vertex: TRANSMISSION_COPY_VERTEX, fragment: TRANSMISSION_COPY_FRAGMENT,
    webgpu: { vertex: TRANSMISSION_COPY_WGSL_VERTEX, fragment: TRANSMISSION_COPY_WGSL_FRAGMENT },
    portableBindings: [{ name: "u_source", kind: "texture2d", required: true }] });
  const uniformBuffers = () => buffers.filter(buffer => buffer.descriptorLabel?.endsWith("-portable-uniforms"));
  const arenaBuffers = () => buffers.filter(buffer => buffer.descriptorLabel?.startsWith("aura3d-uniform-arena-"));
  return { device, native, events, buffers, uniformBuffers, arenaBuffers, groups, passes, textures, createSampler, submit, shader, finish };
}

const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

describe("WebGPU per-draw overhead", () => {
  it("reuses one pooled uniform buffer, one sampler and one bind group across draws that bind the same resources", async () => {
    const f = await fixture();
    const source = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const target = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const vertices = f.device.createBuffer("vertex", 24);
    const draw = (label: string) => ({ label, topology: "triangles" as const, vertexBuffer: vertices, vertexCount: 3, shader: f.shader,
      uniforms: new Map([["u_source", new TextureBinding({ name: "u_source", texture: source.colorTexture })]]) });
    f.device.beginFrame(2, 2); f.device.setRenderTarget(source); f.device.setRenderTarget(target);
    const submitsBefore = f.submit.mock.calls.length;
    for (const label of ["a", "b", "c"]) f.device.drawChecked(draw(label));
    // Without a batch window each draw is still its own submission, so the buffer is rewritten between them in queue order.
    expect(f.submit.mock.calls.length - submitsBefore).toBe(3);
    expect(f.uniformBuffers()).toHaveLength(1);
    expect(f.events.filter(event => event.startsWith("write:") && event.endsWith("-portable-uniforms"))).toEqual(
      ["write:a-portable-uniforms", "write:b-portable-uniforms", "write:c-portable-uniforms"]);
    expect(f.uniformBuffers()[0]!.label).toBe("c-portable-uniforms");
    expect(f.createSampler).toHaveBeenCalledTimes(1);
    expect(f.groups.filter(group => (group.layout as { index?: number }).index === 0)).toHaveLength(1);
    f.device.endFrame();
    f.finish(); await flush();
    expect(f.uniformBuffers()[0]!.destroy).not.toHaveBeenCalled();
    f.device.dispose(); await flush();
    expect(f.uniformBuffers()[0]!.destroy).toHaveBeenCalledOnce();
  });

  it("rescans an index buffer for its largest index only after its contents change", async () => {
    const f = await fixture();
    const target = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });
    const vertices = f.device.createBuffer("vertex", 3 * 12);
    const indices = f.device.createBuffer("index", 6, new Uint16Array([0, 1, 2]));
    const draw = { topology: "triangles" as const, vertexBuffer: vertices, vertexFormat: VertexFormat.P3, vertexCount: 3, indexBuffer: indices, indexCount: 3, indexType: "uint16" as const,
      shader: f.shader, uniforms: new Map([["u_source", new TextureBinding({ name: "u_source", texture })]]) };
    f.device.beginFrame(2, 2); f.device.setRenderTarget(target);
    f.device.drawChecked(draw);
    f.device.drawChecked(draw);
    f.device.updateBuffer(indices, 0, new Uint16Array([0, 1, 9]));
    expect(() => f.device.drawChecked(draw)).toThrow(/too small/);
    f.device.updateBuffer(indices, 0, new Uint16Array([2, 1, 0]));
    f.device.drawChecked(draw);
    f.device.endFrame(); f.device.dispose(); f.finish(); texture.dispose();
  });

  it("is off for injected devices unless requested, so beginDrawBatch keeps one submission per draw", async () => {
    const f = await fixture(false);
    const source = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const target = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const vertices = f.device.createBuffer("vertex", 24);
    f.device.beginFrame(2, 2); f.device.setRenderTarget(source); f.device.setRenderTarget(target);
    const before = f.submit.mock.calls.length;
    f.device.beginDrawBatch();
    f.device.drawChecked({ topology: "triangles", vertexBuffer: vertices, vertexCount: 3, shader: f.shader,
      uniforms: new Map([["u_source", new TextureBinding({ name: "u_source", texture: source.colorTexture })]]) });
    expect(f.device.pendingBatchedDraws).toBe(0);
    expect(f.submit.mock.calls.length).toBe(before + 1);
    f.device.endDrawBatch(); f.device.endFrame(); f.device.dispose(); f.finish();
  });

  it("records batched draws into one pass and one submission, each with its own range of the frame's uniform arena", async () => {
    const f = await fixture(true);
    const source = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const target = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const vertices = f.device.createBuffer("vertex", 24);
    const draw = { topology: "triangles" as const, vertexBuffer: vertices, vertexCount: 3, shader: f.shader,
      uniforms: new Map([["u_source", new TextureBinding({ name: "u_source", texture: source.colorTexture })]]) };
    f.device.beginFrame(2, 2); f.device.setRenderTarget(source); f.device.setRenderTarget(target);
    const submits = f.submit.mock.calls.length, passes = f.passes.length;
    f.device.beginDrawBatch();
    for (let i = 0; i < 3; i += 1) f.device.drawChecked(draw);
    expect(f.device.pendingBatchedDraws).toBe(3);
    expect(f.submit.mock.calls.length).toBe(submits);
    expect(f.passes.length - passes).toBe(1);
    expect(f.passes.at(-1)!.draws).toBe(3);
    // Recorded draws take ranges of one arena buffer (no pooled buffer each), every range its own.
    const ranges = () => f.groups.map(group => group.entries.find(entry => entry.binding === 0)?.resource as { buffer: unknown; offset?: number; size?: number } | undefined)
      .filter(resource => resource?.offset !== undefined);
    expect(f.uniformBuffers()).toHaveLength(0);
    expect(f.arenaBuffers()).toHaveLength(1);
    expect(new Set(ranges().map(range => range!.offset)).size).toBe(3);
    expect(ranges().every(range => range!.buffer === f.arenaBuffers()[0])).toBe(true);
    f.device.endDrawBatch();
    expect(f.device.pendingBatchedDraws).toBe(0);
    expect(f.submit.mock.calls.length).toBe(submits + 1);
    expect(f.events.at(-1)).toBe("submit:1");
    // A second batch in the same frame takes further ranges of the same buffer.
    f.device.beginDrawBatch();
    for (let i = 0; i < 3; i += 1) f.device.drawChecked(draw);
    f.device.endDrawBatch();
    expect(f.uniformBuffers()).toHaveLength(0);
    expect(f.arenaBuffers()).toHaveLength(1);
    expect(new Set(ranges().map(range => range!.offset)).size).toBe(6);
    f.device.endFrame();
    // The next frame's draws take the same ranges in the same order, reuse their cached bind groups, and skip
    // rewriting unchanged bytes.
    f.device.beginFrame(2, 2); f.device.setRenderTarget(target);
    const groups = f.groups.length;
    f.events.length = 0;
    f.device.beginDrawBatch();
    for (let i = 0; i < 3; i += 1) f.device.drawChecked(draw);
    f.device.endDrawBatch();
    f.device.beginDrawBatch();
    for (let i = 0; i < 3; i += 1) f.device.drawChecked(draw);
    f.device.endDrawBatch();
    expect(f.uniformBuffers()).toHaveLength(0);
    expect(f.arenaBuffers()).toHaveLength(1);
    expect(f.groups.length).toBe(groups);
    expect(f.events.filter(event => event.startsWith("write:"))).toEqual([]);
    expect(f.events).toEqual(["submit:1", "submit:1"]);
    f.device.endFrame(); f.device.dispose(); f.finish();
  });

  it("rebinds a batched draw's range when its textures change and reuses the group when they match again (5.5.1 memo)", async () => {
    const f = await fixture(true);
    const first = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const second = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const target = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const vertices = f.device.createBuffer("vertex", 24);
    const bound: unknown[] = [];
    const frame = (source: typeof first) => {
      f.device.beginFrame(2, 2); f.device.setRenderTarget(source); f.device.setRenderTarget(target);
      f.device.beginDrawBatch();
      f.device.drawChecked({ label: "memo", topology: "triangles" as const, vertexBuffer: vertices, vertexCount: 3, shader: f.shader,
        uniforms: new Map([["u_source", new TextureBinding({ name: "u_source", texture: source.colorTexture })]]) });
      f.device.endDrawBatch(); f.device.endFrame();
      const group = f.groups.at(-1)!;
      bound.push(group.entries.find(entry => entry.binding === 2)?.resource);
      return f.groups.length;
    };
    const one = frame(first);
    // Same range, other texture: a new group binding the other view.
    const two = frame(second);
    expect(two).toBe(one + 1);
    expect(bound[1]).not.toBe(bound[0]);
    // Back to the first texture, then unchanged: no new group.
    expect(frame(first)).toBe(two);
    expect(frame(first)).toBe(two);
    f.device.dispose(); f.finish();
  });

  it("submits recorded draws before any other device operation, retirement or target change, keeping queue order", async () => {
    const f = await fixture(true);
    const source = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const target = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const other = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const vertices = f.device.createBuffer("vertex", 24);
    const extra = f.device.createBuffer("vertex", 24);
    const draw = { label: "batched", topology: "triangles" as const, vertexBuffer: vertices, vertexCount: 3, shader: f.shader,
      uniforms: new Map([["u_source", new TextureBinding({ name: "u_source", texture: source.colorTexture })]]) };
    f.device.beginFrame(2, 2); f.device.setRenderTarget(source); f.device.setRenderTarget(target);
    f.device.beginDrawBatch();

    f.device.drawChecked(draw);
    f.events.length = 0;
    f.device.updateBuffer(vertices, 0, new Float32Array(6));
    // The recorded draw read the old contents: it reaches the queue before the write.
    expect(f.events[0]).toBe("submit:1");
    expect(f.events.slice(1).some(event => event.startsWith("write:"))).toBe(true);

    f.device.drawChecked(draw);
    f.events.length = 0;
    f.device.setRenderTarget(other);
    expect(f.events).toEqual(["submit:1"]);

    f.device.drawChecked(draw);
    f.events.length = 0;
    extra.dispose();
    expect(f.events[0]).toBe("submit:1");

    f.device.drawChecked(draw);
    expect(f.device.pendingBatchedDraws).toBe(1);
    f.events.length = 0;
    f.device.endFrame();
    expect(f.events[0]).toBe("submit:1");
    expect(f.device.pendingBatchedDraws).toBe(0);
    f.device.endDrawBatch(); f.device.dispose(); f.finish();
  });

  it("starts a new pass for a clear and nests batch windows", async () => {
    const f = await fixture(true);
    const source = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const target = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const vertices = f.device.createBuffer("vertex", 24);
    const draw = { topology: "triangles" as const, vertexBuffer: vertices, vertexCount: 3, shader: f.shader,
      uniforms: new Map([["u_source", new TextureBinding({ name: "u_source", texture: source.colorTexture })]]) };
    f.device.beginFrame(2, 2); f.device.setRenderTarget(source);
    f.device.setRenderTarget(target);
    const passes = f.passes.length;
    f.device.beginDrawBatch();
    f.device.beginDrawBatch();
    f.device.drawChecked(draw);
    f.device.drawChecked(draw);
    f.device.endDrawBatch();
    // The inner close does not submit; the outer one does.
    expect(f.device.pendingBatchedDraws).toBe(2);
    expect(f.passes.length - passes).toBe(1);
    expect(f.passes.at(-1)!.colorAttachments[0]!.loadOp).toBe("clear");
    f.device.endDrawBatch();
    expect(f.device.pendingBatchedDraws).toBe(0);
    f.device.endFrame(); f.device.dispose(); f.finish();
  });
});

describe("portable uniform fast writer", () => {
  const bindings = [
    { name: "u_scalar", kind: "float" as const }, { name: "u_dir", kind: "vec3" as const }, { name: "u_model", kind: "mat4" as const },
    { name: "u_instances", kind: "mat4" as const, arrayLength: 4 }, { name: "u_colors", kind: "vec4" as const, arrayLength: 3 },
    { name: "u_weights", kind: "float" as const, arrayLength: 5 }, { name: "u_pair", kind: "vec2" as const }
  ];
  const block: UniformBlockLayout = { name: "Aura3DPortableUniforms", group: 0, binding: 0, members: [
    { name: "u_scalar", type: "f32" }, { name: "u_dir", type: { kind: "vector", element: "f32", length: 3 } },
    { name: "u_model", type: { kind: "matrix", columns: 4, rows: 4 } },
    { name: "u_instances", type: { kind: "array", element: { kind: "matrix", columns: 4, rows: 4 }, length: 4 } },
    { name: "u_colors", type: { kind: "array", element: { kind: "vector", element: "f32", length: 4 }, length: 3 } },
    { name: "u_weights", type: { kind: "array", element: "f32", length: 5 } },
    { name: "u_pair", type: { kind: "vector", element: "f32", length: 2 } }
  ] };
  const chunk = (values: readonly number[], size: number, count: number) => Array.from({ length: count }, (_, index) => {
    const part = values.slice(index * size, (index + 1) * size);
    return part.length ? [...part, ...Array(size - part.length).fill(0)] : Array(size).fill(0);
  });

  it("writes the same bytes as the validating layout writer, zero-filling partial arrays and missing values", () => {
    const writer = createUniformDataWriter(block, "wgsl-uniform");
    const plan = fastPortableUniformPlan(writer.layout, bindings);
    expect(plan).not.toBeNull();
    const model = Array.from({ length: 16 }, (_, index) => index * 0.5 - 3);
    const instances = new Float32Array(Array.from({ length: 32 }, (_, index) => Math.sin(index)));
    const colors = Array.from({ length: 12 }, (_, index) => index / 7);
    const weights = [0.1, 0.2, 0.3, 0.4, 0.5];
    const uniforms = new Map<string, unknown>([["u_scalar", 2.5], ["u_dir", [1, -2, 3]], ["u_model", model], ["u_instances", instances],
      ["u_colors", colors], ["u_weights", weights]]);
    const fast = writeFastPortableUniforms(writer.layout.size, plan!, uniforms)!;
    const expected = writeUniformData(block, "wgsl-uniform", {
      u_scalar: 2.5, u_dir: [1, -2, 3], u_model: model, u_instances: chunk(Array.from(instances), 16, 4),
      u_colors: chunk(colors, 4, 3), u_weights: weights, u_pair: [0, 0]
    });
    expect(Array.from(fast)).toEqual(Array.from(expected));
  });

  it("declines non-float blocks and malformed values so the validating path reports them", () => {
    const writer = createUniformDataWriter(block, "wgsl-uniform");
    const plan = fastPortableUniformPlan(writer.layout, bindings)!;
    for (const bad of [["u_dir", [1, 2]], ["u_dir", [1, Number.NaN, 3]], ["u_model", 4], ["u_colors", [[1, 2, 3, 4]]], ["u_scalar", true], ["u_weights", new Array(6).fill(0)]] as const) {
      expect(writeFastPortableUniforms(writer.layout.size, plan, new Map<string, unknown>([bad]))).toBeNull();
    }
    const intBlock: UniformBlockLayout = { name: "Aura3DPortableUniforms", group: 0, binding: 0, members: [{ name: "u_count", type: "i32" }] };
    expect(fastPortableUniformPlan(createUniformDataWriter(intBlock, "wgsl-uniform").layout, [{ name: "u_count", kind: "i32" }])).toBeNull();
  });
});

describe("WebGPU resource interop settlement", () => {
  it("settles one lease's observers without settling or rescanning the others", async () => {
    const fences: (() => void)[] = [];
    const queue = { submit: vi.fn(), onSubmittedWorkDone: () => new Promise<void>(resolve => { fences.push(resolve); }) };
    const interop = new WebGPUResourceInterop(queue, 1);
    const leases = Array.from({ length: 200 }, () => ({ destroy: vi.fn() }));
    for (const lease of leases) interop.register(lease, () => lease.destroy());
    interop.submit([]);
    const settled: number[] = [];
    leases.forEach((lease, index) => {
      void interop.retire(lease);
      void interop.whenRetired(lease).then(() => settled.push(index));
    });
    expect(fences).toHaveLength(200);
    fences[7]!();
    await flush();
    expect(settled).toEqual([7]);
    expect(leases[7]!.destroy).toHaveBeenCalledOnce();
    expect(leases[8]!.destroy).not.toHaveBeenCalled();
    for (const resolve of fences) resolve();
    await flush();
    expect(settled).toHaveLength(200);
    expect(interop.liveResources).toBe(0);
  });

  it("runs beforeSubmit ahead of every submission", () => {
    const order: string[] = [];
    const interop = new WebGPUResourceInterop({ submit: () => { order.push("submit"); } }, 1);
    interop.beforeSubmit = () => { order.push("before"); };
    interop.submit([]);
    interop.submit([]);
    expect(order).toEqual(["before", "submit", "before", "submit"]);
  });
});
