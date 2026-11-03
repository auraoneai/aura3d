import { describe, expect, it } from "vitest";
import type { DrawCommand } from "../../../packages/rendering/src/RenderDevice";
import { VertexFormat, type VertexAttributeType } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";

// This recorder observes descriptors, queue writes, and resource lifetimes. It
// does not compile WGSL, run a GPU, or make a pixel-correctness claim.
interface FakeBuffer {
  readonly label?: string;
  readonly size: number;
  readonly usage: number;
  readonly bytes: Uint8Array;
  destroyed: number;
  destroy(): void;
}
interface Attribute { readonly shaderLocation: number; readonly format: string; readonly offset: number; }
interface Layout { readonly arrayStride: number; readonly stepMode?: string; readonly attributes: readonly Attribute[]; }
interface FakePipeline { readonly descriptor: { readonly vertex: { readonly buffers?: readonly (Layout | null)[] } }; getBindGroupLayout(index: number): object; }
interface DrawRecord {
  readonly pipeline: FakePipeline;
  readonly streams: ReadonlyMap<number, { readonly handle: FakeBuffer; readonly bytes: Uint8Array }>;
  readonly indexed: boolean;
  readonly args: readonly number[];
  readonly indices?: { readonly bytes: Uint8Array; readonly format: string };
}

async function fixture() {
  const buffers: FakeBuffer[] = [];
  const draws: DrawRecord[] = [];
  const fences: (() => void)[] = [];
  let onWrite: ((buffer: FakeBuffer) => void) | undefined;
  let onSubmit: (() => void) | undefined;
  let inSubmit = false;
  let fencesDuringSubmit = 0;
  let lose!: () => void;
  const lost = new Promise<{ reason: string }>((resolve) => { lose = () => resolve({ reason: "destroyed" }); });
  const native = {
    lost,
    limits: { maxVertexBuffers: 8, maxVertexAttributes: 16, maxVertexBufferArrayStride: 2048, maxBufferSize: 1024 * 1024 },
    queue: {
      writeBuffer(buffer: FakeBuffer, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        if (offset < 0 || offset + bytes.length > buffer.size) throw new Error("mock queue write overflow");
        buffer.bytes.set(bytes, offset);
        onWrite?.(buffer);
      },
      submit(commands: readonly unknown[]) {
        if (!commands.length) return;
        inSubmit = true;
        try { onSubmit?.(); } finally { inSubmit = false; }
      },
      onSubmittedWorkDone() {
        if (inSubmit) fencesDuringSubmit += 1;
        return new Promise<void>((resolve) => fences.push(resolve));
      }
    },
    createBuffer(descriptor: { label?: string; size: number; usage: number }) {
      const buffer: FakeBuffer = { ...descriptor, bytes: new Uint8Array(descriptor.size), destroyed: 0,
        destroy() { buffer.destroyed += 1; } };
      buffers.push(buffer);
      return buffer;
    },
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    createShaderModule: (descriptor: object) => descriptor,
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createBindGroup: () => ({}),
    createRenderPipeline(descriptor: FakePipeline["descriptor"]): FakePipeline {
      return { descriptor, getBindGroupLayout: () => ({}) };
    },
    createCommandEncoder() {
      return {
        beginRenderPass() {
          let pipeline!: FakePipeline;
          const streams = new Map<number, FakeBuffer>();
          let indices: { handle: FakeBuffer; format: string } | undefined;
          const record = (indexed: boolean, args: number[]) => {
            draws.push({ pipeline, indexed, args,
              streams: new Map([...streams].map(([slot, handle]) => [slot, { handle, bytes: handle.bytes.slice() }])),
              ...(indices ? { indices: { bytes: indices.handle.bytes.slice(), format: indices.format } } : {}) });
          };
          return {
            setPipeline(value: FakePipeline) { pipeline = value; },
            setVertexBuffer(slot: number, handle: FakeBuffer) { streams.set(slot, handle); },
            setIndexBuffer(handle: FakeBuffer, format: string) { indices = { handle, format }; },
            setBindGroup() {},
            draw(...args: number[]) { record(false, args); },
            drawIndexed(...args: number[]) { record(true, args); },
            end() {}
          };
        },
        finish: () => ({})
      };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
  const target = device.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: false });
  device.beginFrame(2, 2);
  device.setRenderTarget(target);
  const finishFences = async () => {
    for (let i = 0; i < 12; i += 1) {
      for (const resolve of fences.splice(0)) resolve();
      await Promise.resolve();
      await Promise.resolve();
    }
  };
  return {
    device, buffers, draws, lose, finishFences,
    onWrite(callback?: (buffer: FakeBuffer) => void) { onWrite = callback; },
    onSubmit(callback?: () => void) { onSubmit = callback; },
    get fencesDuringSubmit() { return fencesDuringSubmit; },
    async close() {
      onWrite = undefined;
      onSubmit = undefined;
      await finishFences();
      if (!device.disposed) device.dispose();
      await finishFences();
    }
  };
}

function shader(device: WebGPUDevice, input: string) {
  const marker = "packed-attribute-test";
  return device.createShaderProgram({ label: marker, marker, vertex: `// ${marker}\nvoid main() {}`,
    fragment: `// ${marker}\nvoid main() {}`, webgpu: {
      vertex: `@vertex fn vs_main(${input}) -> @builtin(position) vec4<f32> { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }`,
      fragment: "@fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }"
    } });
}

function bytesFor(type: VertexAttributeType, records: readonly (readonly number[])[]): Uint8Array {
  const width = type.endsWith("8") ? 1 : type.endsWith("16") ? 2 : 4;
  const bytes = new Uint8Array(records.length * records[0]!.length * width);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const record of records) for (const value of record) {
    switch (type) {
      case "int8": view.setInt8(offset, value); break;
      case "uint8": view.setUint8(offset, value); break;
      case "int16": view.setInt16(offset, value, true); break;
      case "uint16": view.setUint16(offset, value, true); break;
      case "int32": view.setInt32(offset, value, true); break;
      case "uint32": view.setUint32(offset, value, true); break;
      case "float32": view.setFloat32(offset, value, true); break;
    }
    offset += width;
  }
  return bytes;
}

/** Independently decode the declared native format at a shader location. */
function inputAt(draw: DrawRecord, location: number, vertex: number, instance = 0): number[] {
  const layouts = draw.pipeline.descriptor.vertex.buffers ?? [];
  for (const [slot, layout] of layouts.entries()) {
    const attribute = layout?.attributes.find((entry) => entry.shaderLocation === location);
    if (!layout || !attribute) continue;
    const match = /^(float32|uint32|sint32|uint16|sint16|unorm16|snorm16|uint8|sint8|unorm8|snorm8)(?:x([234]))?$/.exec(attribute.format);
    if (!match) throw new Error(`Unexpected native vertex format ${attribute.format}`);
    const native = match[1]!;
    const count = Number(match[2] ?? 1);
    const width = native.endsWith("8") ? 1 : native.endsWith("16") ? 2 : 4;
    const bytes = draw.streams.get(slot)?.bytes;
    if (!bytes) throw new Error(`Missing bound stream ${slot}`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const offset = (layout.stepMode === "instance" ? instance : vertex) * layout.arrayStride + attribute.offset;
    return Array.from({ length: count }, (_, component) => {
      const at = offset + component * width;
      if (native === "float32") return view.getFloat32(at, true);
      const signed = native.startsWith("sint") || native.startsWith("snorm");
      const raw = width === 1 ? (signed ? view.getInt8(at) : view.getUint8(at))
        : width === 2 ? (signed ? view.getInt16(at, true) : view.getUint16(at, true))
          : signed ? view.getInt32(at, true) : view.getUint32(at, true);
      if (native.startsWith("unorm")) return raw / (2 ** (width * 8) - 1);
      if (native.startsWith("snorm")) return Math.max(-1, raw / (2 ** (width * 8 - 1) - 1));
      return raw;
    });
  }
  throw new Error(`Missing native shader location ${location}`);
}

function expectValues(actual: readonly number[], expected: readonly number[]) {
  expect(actual.length).toBeGreaterThanOrEqual(expected.length);
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 5);
}

function expectErrorCode(action: () => unknown, code: string) {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toMatchObject({ code });
}

const state = { depthTest: false, depthWrite: false, cullMode: "none", blend: false, depthCompare: "always" } as const;

describe("native WebGPU packed vertex conversion", () => {
  const packed: readonly { type: VertexAttributeType; normalized?: boolean; integer?: boolean; values: readonly number[]; expected: readonly number[] }[] = [
    { type: "uint8", normalized: true, values: [0, 128, 255], expected: [0, 128 / 255, 1] },
    { type: "int8", normalized: true, values: [-128, -64, 127], expected: [-1, -64 / 127, 1] },
    { type: "uint16", normalized: true, values: [0, 32768, 65535], expected: [0, 32768 / 65535, 1] },
    { type: "int16", normalized: true, values: [-32768, -12345, 32767], expected: [-1, -12345 / 32767, 1] },
    { type: "uint8", integer: true, values: [0, 128, 255], expected: [0, 128, 255] },
    { type: "int8", integer: true, values: [-128, -1, 127], expected: [-128, -1, 127] },
    { type: "uint16", integer: true, values: [0, 32768, 65535], expected: [0, 32768, 65535] },
    { type: "int16", integer: true, values: [-32768, -1, 32767], expected: [-32768, -1, 32767] }
  ];

  it.each(packed)("preserves $type x3 values with normalized=$normalized integer=$integer", async (example) => {
    const f = await fixture();
    try {
      const first = example.values.map(() => 0);
      const bytes = bytesFor(example.type, [first, example.values, first]);
      const buffer = f.device.createBuffer("vertex", bytes.length, bytes);
      const format = new VertexFormat([{ semantic: "position", type: example.type, components: 3, offset: 0,
        normalized: example.normalized, integer: example.integer }]);
      const scalar = example.integer ? (example.type.startsWith("uint") ? "u32" : "i32") : "f32";
      const command: DrawCommand = { topology: "triangles", vertexBuffer: buffer, vertexFormat: format, firstVertex: 1, vertexCount: 1,
        shader: shader(f.device, `@location(0) p: vec3<${scalar}>`), renderState: state };
      f.device.drawChecked(command);
      const draw = f.draws.at(-1)!;
      expect(draw.args).toEqual([1, 1, 1]);
      expectValues(inputAt(draw, 0, 1).slice(0, 3), example.expected);
    } finally { await f.close(); }
  });

  const unnormalized: readonly { type: VertexAttributeType; values: readonly number[] }[] = [
    { type: "uint8", values: [255] },
    { type: "int8", values: [-128, 127] },
    { type: "int16", values: [-32768, -1, 32767] },
    { type: "uint16", values: [0, 32768, 65535, 15] },
    { type: "uint32", values: [0, 16777217, 4294967295, 305419896] },
    { type: "int32", values: [-2147483648, 16777217, 2147483647] }
  ];

  it.each(unnormalized)("converts nonnormalized $type to the correct f32 input", async ({ type, values }) => {
    const f = await fixture();
    try {
      const components = values.length as 1 | 2 | 3 | 4;
      const zeros = values.map(() => 0);
      const bytes = bytesFor(type, [zeros, values, zeros]);
      const buffer = f.device.createBuffer("vertex", bytes.length, bytes);
      const format = new VertexFormat([{ semantic: "position", type, components, offset: 0 }]);
      const valueType = components === 1 ? "f32" : `vec${components}<f32>`;
      f.device.drawChecked({ topology: "triangles", vertexBuffer: buffer, vertexFormat: format, firstVertex: 1, vertexCount: 1,
        shader: shader(f.device, `@location(0) p: ${valueType}`), renderState: state });
      expect(f.draws.at(-1)!.args).toEqual([1, 1, 1]);
      expectValues(inputAt(f.draws.at(-1)!, 0, 1).slice(0, components), values.map(Math.fround));
    } finally { await f.close(); }
  });

  it("preserves indexed vertex selection, mixed interleaved attributes, and instance-rate streams", async () => {
    const f = await fixture();
    try {
      const primary = new Uint8Array(64);
      const view = new DataView(primary.buffer);
      const colors = [[0, 1, 255], [17, 127, 200], [255, 4, 50], [40, 80, 120]];
      for (let i = 0; i < 4; i += 1) {
        view.setFloat32(i * 16, i + 0.25, true);
        view.setFloat32(i * 16 + 4, -i, true);
        view.setFloat32(i * 16 + 8, i + 10, true);
        primary.set(colors[i]!, i * 16 + 12);
      }
      const vertex = f.device.createBuffer("vertex", primary.length, primary);
      const jointsBytes = bytesFor("uint16", [[1, 2, 3], [11, 12, 13], [21, 22, 23], [31, 32, 33]]);
      const joints = f.device.createBuffer("vertex", jointsBytes.length, jointsBytes);
      const instanceBytes = bytesFor("int16", [[-32768, 1, 32767], [20, -21, 22]]);
      const instances = f.device.createBuffer("vertex", instanceBytes.length, instanceBytes);
      const indices = f.device.createBuffer("index", 10, new Uint16Array([0, 3, 1, 2, 0]));
      const format = new VertexFormat([
        { semantic: "position", type: "float32", components: 3, offset: 0 },
        { semantic: "color", type: "uint8", components: 3, offset: 12, normalized: true },
        { semantic: "joints", type: "uint16", components: 3, offset: 0, integer: true, bufferSlot: 1 },
        { semantic: "weights", type: "int16", components: 3, offset: 0, bufferSlot: 2 }
      ], 16, [{ slot: 1, stride: 6 }, { slot: 2, stride: 6, stepMode: "instance", divisor: 1 }]);
      f.device.drawChecked({ topology: "triangles", vertexBuffer: vertex, vertexBuffers: [vertex, joints, instances], vertexFormat: format,
        vertexCount: 4, indexBuffer: indices, indexCount: 3, firstIndex: 1, instanceCount: 2,
        shader: shader(f.device, "@location(0) p: vec3f, @location(4) c: vec3f, @location(5) j: vec3u, @location(6) w: vec3f"), renderState: state });
      const draw = f.draws.at(-1)!;
      expect(draw.indexed).toBe(true);
      expect(draw.args).toEqual([3, 2, 1]);
      expect(draw.indices?.format).toBe("uint16");
      const indexView = new DataView(draw.indices!.bytes.buffer, draw.indices!.bytes.byteOffset, draw.indices!.bytes.byteLength);
      const selection = [1, 2, 3].map((index) => indexView.getUint16(index * 2, true));
      expect(selection).toEqual([3, 1, 2]);
      for (const index of selection) {
        expectValues(inputAt(draw, 0, index), [index + 0.25, -index, index + 10]);
        expectValues(inputAt(draw, 4, index).slice(0, 3), colors[index]!.map((value) => value / 255));
        expectValues(inputAt(draw, 5, index).slice(0, 3), [index * 10 + 1, index * 10 + 2, index * 10 + 3]);
      }
      expectValues(inputAt(draw, 6, 3, 0).slice(0, 3), [-32768, 1, 32767]);
      expectValues(inputAt(draw, 6, 1, 1).slice(0, 3), [20, -21, 22]);
    } finally { await f.close(); }
  });

  it("rejects short and stale source shadows, including after a native borrow and full rewrite", async () => {
    const f = await fixture();
    try {
      const initial = Uint8Array.of(1, 2, 3, 4, 5, 6);
      const buffer = f.device.createBuffer("vertex", initial.length, initial);
      const format = new VertexFormat([{ semantic: "position", type: "uint8", components: 3, offset: 0, normalized: true }]);
      const base: DrawCommand = { topology: "triangles", vertexBuffer: buffer, vertexFormat: format, vertexCount: 2,
        shader: shader(f.device, "@location(0) p: vec3f"), renderState: state };
      const created = f.buffers.length;
      expectErrorCode(() => f.device.drawChecked({ ...base, firstVertex: 1 }), "WEBGPU_VERTEX_BUFFER_TOO_SMALL");
      expect(f.buffers).toHaveLength(created);
      expect(f.draws).toHaveLength(0);
      f.device.getNativeBuffer(buffer);
      expectErrorCode(() => f.device.drawChecked(base), "WEBGPU_VERTEX_SHADOW_STALE");
      f.device.updateBuffer(buffer, 0, Uint8Array.of(9, 8, 7, 6, 5, 4));
      expectErrorCode(() => f.device.drawChecked(base), "WEBGPU_VERTEX_SHADOW_STALE");
      expect(f.draws).toHaveLength(0);
    } finally { await f.close(); }
  });

  it("rejects borrowed index shadows and unsupported instance divisors before drawing", async () => {
    const f = await fixture();
    try {
      const vertex = f.device.createBuffer("vertex", 9, Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9));
      const index = f.device.createBuffer("index", 6, new Uint16Array([2, 1, 0]));
      const format = new VertexFormat([{ semantic: "position", type: "uint8", components: 3, offset: 0, normalized: true }]);
      const base: DrawCommand = { topology: "triangles", vertexBuffer: vertex, vertexFormat: format, vertexCount: 3, indexBuffer: index, indexCount: 3,
        shader: shader(f.device, "@location(0) p: vec3f"), renderState: state };
      f.device.getNativeBuffer(index);
      f.device.updateBuffer(index, 0, new Uint16Array([0, 1, 2]));
      expectErrorCode(() => f.device.drawChecked(base), "WEBGPU_INDEX_SHADOW_STALE");
      const instance = f.device.createBuffer("vertex", 12, new Int16Array([1, 2, 3, 4, 5, 6]));
      const invalid = new VertexFormat([{ semantic: "position", type: "uint8", components: 3, offset: 0, normalized: true },
        { semantic: "weights", type: "int16", components: 3, offset: 0, bufferSlot: 1 }], undefined,
      [{ slot: 1, stride: 6, stepMode: "instance", divisor: 2 }]);
      expectErrorCode(() => f.device.drawChecked({ ...base, indexBuffer: undefined, indexCount: undefined,
        vertexBuffers: [vertex, instance], vertexFormat: invalid, instanceCount: 2 }), "WEBGPU_VERTEX_DIVISOR_UNSUPPORTED");
      expect(f.draws).toHaveLength(0);
    } finally { await f.close(); }
  });

  it("rejects expanded data beyond the native buffer limit before allocating it", async () => {
    const f = await fixture();
    try {
      // 270 kB of tightly packed source would expand to 1.08 MB of f32x3,
      // larger than this recorder's advertised 1 MiB native buffer limit.
      const records = 90_000;
      const bytes = new Uint8Array(records * 3);
      const buffer = f.device.createBuffer("vertex", bytes.byteLength, bytes);
      const format = new VertexFormat([{ semantic: "position", type: "uint8", components: 3, offset: 0, normalized: true }]);
      const before = f.buffers.length;
      expectErrorCode(() => f.device.drawChecked({ topology: "triangles", vertexBuffer: buffer, vertexFormat: format, vertexCount: records,
        shader: shader(f.device, "@location(0) p: vec3f"), renderState: state }), "WEBGPU_VERTEX_CONVERSION_LIMIT");
      expect(f.buffers).toHaveLength(before);
      expect(f.draws).toHaveLength(0);
    } finally { await f.close(); }
  });

  it("reflects source updates and retires derived buffers only after in-flight work", async () => {
    const f = await fixture();
    try {
      const buffer = f.device.createBuffer("vertex", 6, Uint8Array.of(0, 128, 255, 255, 128, 0));
      const sourceNative = f.buffers.at(-1)!;
      const format = new VertexFormat([{ semantic: "position", type: "uint8", components: 3, offset: 0, normalized: true }]);
      const command: DrawCommand = { topology: "triangles", vertexBuffer: buffer, vertexFormat: format, vertexCount: 2,
        shader: shader(f.device, "@location(0) p: vec3f"), renderState: state };
      f.device.drawChecked(command);
      const first = f.draws.at(-1)!;
      const firstDerived = first.streams.get(0)!.handle;
      expect(firstDerived).not.toBe(sourceNative);
      expectValues(inputAt(first, 0, 0), [0, 128 / 255, 1]);
      f.device.updateBuffer(buffer, 0, Uint8Array.of(255, 0, 128));
      f.device.drawChecked(command);
      const second = f.draws.at(-1)!;
      const secondDerived = second.streams.get(0)!.handle;
      expectValues(inputAt(second, 0, 0), [1, 0, 128 / 255]);
      expectValues(inputAt(first, 0, 0), [0, 128 / 255, 1]);
      buffer.dispose();
      expect(firstDerived.destroyed).toBe(0);
      expect(secondDerived.destroyed).toBe(0);
      await f.finishFences();
      expect(firstDerived.destroyed).toBe(1);
      expect(secondDerived.destroyed).toBe(1);
    } finally { await f.close(); }
  });

  it("does not retain one derived allocation per repeated draw", async () => {
    const f = await fixture();
    try {
      const buffer = f.device.createBuffer("vertex", 3, Uint8Array.of(0, 127, 255));
      const format = new VertexFormat([{ semantic: "position", type: "uint8", components: 3, offset: 0, normalized: true }]);
      const command: DrawCommand = { topology: "triangles", vertexBuffer: buffer, vertexFormat: format, vertexCount: 1,
        shader: shader(f.device, "@location(0) p: vec3f"), renderState: state };
      for (let i = 0; i < 12; i += 1) f.device.drawChecked(command);
      const derived = new Set(f.draws.map((draw) => draw.streams.get(0)!.handle));
      await f.finishFences();
      expect([...derived].filter((handle) => handle.destroyed === 0).length).toBeLessThanOrEqual(1);
      buffer.dispose();
      await f.finishFences();
      expect([...derived].every((handle) => handle.destroyed === 1)).toBe(true);
    } finally { await f.close(); }
  });

  it("keeps source bytes stable through reentrant conversion uploads", async () => {
    const f = await fixture();
    try {
      const buffer = f.device.createBuffer("vertex", 3, Uint8Array.of(0, 128, 255));
      const format = new VertexFormat([{ semantic: "position", type: "uint8", components: 3, offset: 0, normalized: true }]);
      const command: DrawCommand = { topology: "triangles", vertexBuffer: buffer, vertexFormat: format, vertexCount: 1,
        shader: shader(f.device, "@location(0) p: vec3f"), renderState: state };
      let called = false;
      f.onWrite(() => {
        called = true;
        f.onWrite(undefined);
        expectErrorCode(() => f.device.updateBuffer(buffer, 0, Uint8Array.of(255, 0, 0)), "WEBGPU_VERTEX_CONVERSION_ACTIVE");
      });
      f.device.drawChecked(command);
      expect(called).toBe(true);
      expectValues(inputAt(f.draws.at(-1)!, 0, 0), [0, 128 / 255, 1]);
      expect(f.device.readBuffer(buffer)).toEqual(Uint8Array.of(0, 128, 255));
    } finally { await f.close(); }
  });

  it("retires a failed conversion upload and permits a later retry", async () => {
    const f = await fixture();
    try {
      const buffer = f.device.createBuffer("vertex", 3, Uint8Array.of(0, 128, 255));
      const format = new VertexFormat([{ semantic: "position", type: "uint8", components: 3, offset: 0, normalized: true }]);
      const command: DrawCommand = { topology: "triangles", vertexBuffer: buffer, vertexFormat: format, vertexCount: 1,
        shader: shader(f.device, "@location(0) p: vec3f"), renderState: state };
      let failed: FakeBuffer | undefined;
      f.onWrite((handle) => {
        f.onWrite(undefined);
        failed = handle;
        throw new Error("injected conversion upload failure");
      });
      expect(() => f.device.drawChecked(command)).toThrow("injected conversion upload failure");
      expect(f.draws).toHaveLength(0);
      expect(failed?.destroyed).toBe(0);
      await f.finishFences();
      expect(failed?.destroyed).toBe(1);
      f.device.drawChecked(command);
      expectValues(inputAt(f.draws.at(-1)!, 0, 0), [0, 128 / 255, 1]);
    } finally { await f.close(); }
  });

  it("does not allow source disposal to fence an in-progress submission", async () => {
    const f = await fixture();
    try {
      const buffer = f.device.createBuffer("vertex", 3, Uint8Array.of(0, 128, 255));
      const format = new VertexFormat([{ semantic: "position", type: "uint8", components: 3, offset: 0, normalized: true }]);
      const command: DrawCommand = { topology: "triangles", vertexBuffer: buffer, vertexFormat: format, vertexCount: 1,
        shader: shader(f.device, "@location(0) p: vec3f"), renderState: state };
      let called = false;
      f.onSubmit(() => {
        called = true;
        f.onSubmit(undefined);
        const derived = f.draws.at(-1)!.streams.get(0)!.handle;
        expectErrorCode(() => buffer.dispose(), "WEBGPU_VERTEX_CONVERSION_ACTIVE");
        expect(derived.destroyed).toBe(0);
      });
      f.device.drawChecked(command);
      const derived = f.draws.at(-1)!.streams.get(0)!.handle;
      expect(called).toBe(true);
      expect(f.fencesDuringSubmit).toBe(0);
      buffer.dispose();
      expect(derived.destroyed).toBe(0);
      await f.finishFences();
      expect(derived.destroyed).toBe(1);
    } finally { await f.close(); }
  });

  it("reclaims derived buffers when the device is confirmed lost", async () => {
    const f = await fixture();
    try {
      const buffer = f.device.createBuffer("vertex", 3, Uint8Array.of(0, 127, 255));
      const format = new VertexFormat([{ semantic: "position", type: "uint8", components: 3, offset: 0, normalized: true }]);
      f.device.drawChecked({ topology: "triangles", vertexBuffer: buffer, vertexFormat: format, vertexCount: 1,
        shader: shader(f.device, "@location(0) p: vec3f"), renderState: state });
      const derived = f.draws.at(-1)!.streams.get(0)!.handle;
      f.lose();
      await Promise.resolve();
      await Promise.resolve();
      expect(f.device.contextLost).toBe(true);
      expect(derived.destroyed).toBe(1);
      expect(() => f.device.drawChecked({ topology: "triangles", vertexBuffer: buffer, vertexFormat: format, vertexCount: 1 })).toThrow(/lost/i);
    } finally { await f.close(); }
  });
});
