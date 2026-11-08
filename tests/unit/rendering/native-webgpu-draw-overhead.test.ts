import { describe, expect, it, vi } from "vitest";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { Texture } from "../../../packages/rendering/src/Texture";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
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
  return { device, native, events, buffers, uniformBuffers, groups, passes, textures, createSampler, submit, shader, finish };
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

  it("records batched draws into one pass and one submission, with one uniform buffer per recorded draw", async () => {
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
    // A recorded draw keeps its uniform buffer until the batch is submitted.
    expect(f.uniformBuffers()).toHaveLength(3);
    f.device.endDrawBatch();
    expect(f.device.pendingBatchedDraws).toBe(0);
    expect(f.submit.mock.calls.length).toBe(submits + 1);
    expect(f.events.at(-1)).toBe("submit:1");
    // The next batch reuses the pooled buffers and their cached bind groups.
    const groups = f.groups.length;
    f.device.beginDrawBatch();
    for (let i = 0; i < 3; i += 1) f.device.drawChecked(draw);
    f.device.endDrawBatch();
    expect(f.uniformBuffers()).toHaveLength(3);
    expect(f.groups.length).toBe(groups);
    f.device.endFrame(); f.device.dispose(); f.finish();
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
