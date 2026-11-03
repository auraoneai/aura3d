import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { parseGaussianSplat } from "../../../packages/assets/src/loaders/GaussianSplatLoader";
import { MockRenderDevice, type BufferUsage, type DrawCommand, type RenderBuffer } from "../../../packages/rendering/src/RenderDevice";
import { GAUSSIAN_SPLAT_DEFAULT_MAX_GPU_BYTES, GAUSSIAN_SPLAT_DEFAULT_MAX_SPLATS, GAUSSIAN_SPLAT_SHADER, GaussianSplatRenderer, gaussianSphericalHarmonicBasis, gaussianSplatGpuInstanceBytes, type GaussianSplatCloud } from "../../../packages/rendering/src/GaussianSplatRenderer";
import { mergeTransparentSegments, type TransparentEngineItem } from "../../../packages/rendering/src/renderer/InterleavedTransparentPass";
import type { FrameContributorContext, TransparentQueueItem } from "../../../packages/rendering/src/contracts/frameGraph";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const reversed = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
function cloud(positions: number[][], extra: Partial<GaussianSplatCloud> = {}): GaussianSplatCloud {
  return {
    count: positions.length, positions: new Float32Array(positions.flat()),
    scales: new Float32Array(positions.flatMap(() => [0.1, 0.1, 0.1])),
    rotations: new Float32Array(positions.flatMap(() => [0, 0, 0, 1])),
    colors: new Float32Array(positions.flatMap(() => [1, 0, 0])),
    opacities: new Float32Array(positions.map(() => 0.5)), shDegree: 0,
    metadata: { colorSpace: "lin_rec709_display", coordinateSystem: "RUB" }, ...extra
  };
}
function instanceData(device: MockRenderDevice, command: DrawCommand): Float32Array {
  const bytes = device.readBuffer(command.instanceAttributes![0]!.buffer);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

function uncompressedGltf(): Uint8Array {
  const s = Math.sin(Math.PI / 8), c = Math.cos(Math.PI / 8);
  const values = [0.2, 0.1, 0.4, 0.3, 0.1, 0.05, 0, 0, s, c, 0.5, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
  const binary = new Uint8Array(values.length * 4), view = new DataView(binary.buffer);
  values.forEach((value, i) => view.setFloat32(i * 4, value, true));
  const sizes = [3, 3, 4, 1, 3, 3, 3, 3]; let offset = 0;
  const bufferViews = sizes.map((size) => { const entry = { buffer: 0, byteOffset: offset, byteLength: size * 4 }; offset += size * 4; return entry; });
  const accessors = sizes.map((size, bufferView) => ({ bufferView, componentType: 5126, count: 1, type: size === 1 ? "SCALAR" : `VEC${size}` }));
  const p = "KHR_gaussian_splatting:";
  const document = {
    asset: { version: "2.0" }, buffers: [{ byteLength: binary.length, uri: `data:application/octet-stream;base64,${Buffer.from(binary).toString("base64")}` }], bufferViews, accessors,
    meshes: [{ primitives: [{ mode: 0, attributes: { POSITION: 0, [`${p}SCALE`]: 1, [`${p}ROTATION`]: 2, [`${p}OPACITY`]: 3,
      [`${p}SH_DEGREE_0_COEF_0`]: 4, [`${p}SH_DEGREE_1_COEF_0`]: 5, [`${p}SH_DEGREE_1_COEF_1`]: 6, [`${p}SH_DEGREE_1_COEF_2`]: 7 },
    extensions: { KHR_gaussian_splatting: { kernel: "ellipse", colorSpace: "lin_rec709_display" } } }] }]
  };
  return new TextEncoder().encode(JSON.stringify(document));
}

/** A synthetic SPZ v2 stream and draft glTF wrapper, authored from the documented wire fields. */
function spzAndGltf(): { spz: Uint8Array; gltf: Uint8Array } {
  const degree = 3, shCount = ((degree + 1) ** 2 - 1) * 3;
  const raw = new Uint8Array(16 + 9 + 1 + 3 + 3 + 3 + shCount), header = new DataView(raw.buffer);
  header.setUint32(0, 0x5053474e, true); header.setUint32(4, 2, true); header.setUint32(8, 1, true);
  raw[12] = degree; raw[13] = 12;
  // Positions (+0.25,-0.125,+0.375) use signed 24-bit fixed point.
  raw.set([0, 4, 0, 0, 254, 255, 0, 6, 0], 16);
  raw.set([230, 128, 160, 96, 120, 112, 104, 135, 121, 130], 25);
  for (let i = 0; i < shCount; i++) raw[35 + i] = 112 + i % 33;
  const spz = gzipSync(raw), prefix = "KHR_gaussian_splatting:";
  const semantics = ["POSITION", `${prefix}SCALE`, `${prefix}ROTATION`, "COLOR_0"];
  for (let l = 1; l <= degree; l++) for (let m = 0; m < 2 * l + 1; m++) semantics.push(`${prefix}SH_DEGREE_${l}_COEF_${m}`);
  const accessors = semantics.map((semantic) => ({ componentType: 5126, count: 1, type: semantic === "COLOR_0" || semantic.endsWith(":ROTATION") ? "VEC4" : "VEC3" }));
  const document = {
    asset: { version: "2.0" }, buffers: [{ byteLength: spz.length, uri: `data:application/octet-stream;base64,${Buffer.from(spz).toString("base64")}` }],
    bufferViews: [{ buffer: 0, byteLength: spz.length }], accessors,
    meshes: [{ primitives: [{ mode: 0, attributes: Object.fromEntries(semantics.map((semantic, i) => [semantic, i])),
      extensions: { KHR_gaussian_splatting: { kernel: "ellipse", colorSpace: "lin_rec709_display", extensions: { KHR_gaussian_splatting_compression_spz_2: { bufferView: 0 } } } } }] }]
  };
  return { spz, gltf: new TextEncoder().encode(JSON.stringify(document)) };
}

describe("GaussianSplatRenderer", () => {
  it("reports the exact per-cloud instance-buffer allocation and rejects invalid or unsafe counts", () => {
    class SizingDevice extends MockRenderDevice {
      readonly sizes: number[] = [];
      override createBuffer(usage: BufferUsage, byteLength: number, initialData?: ArrayBufferView): RenderBuffer {
        this.sizes.push(byteLength);
        return super.createBuffer(usage, byteLength, initialData);
      }
    }
    expect(GAUSSIAN_SPLAT_DEFAULT_MAX_SPLATS).toBe(1_000_000);
    expect(GAUSSIAN_SPLAT_DEFAULT_MAX_GPU_BYTES).toBe(64 * 1024 * 1024);
    expect(gaussianSplatGpuInstanceBytes(1)).toBe(44);
    expect(gaussianSplatGpuInstanceBytes(3)).toBe(132);
    const lastSafeCount = Math.floor(Number.MAX_SAFE_INTEGER / 44);
    expect(gaussianSplatGpuInstanceBytes(lastSafeCount)).toBe(lastSafeCount * 44);
    for (const count of [0, -1, 1.5, NaN, Infinity, lastSafeCount + 1, Number.MAX_SAFE_INTEGER]) {
      expect(() => gaussianSplatGpuInstanceBytes(count)).toThrow(/count|safe/);
    }
    const device = new SizingDevice(), data = cloud([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    expect(() => new GaussianSplatRenderer(device, data, { maxGpuBytes: 131 })).toThrow(/maxGpuBytes/);
    expect(device.sizes).toEqual([]);
    const renderer = new GaussianSplatRenderer(device, data, { maxGpuBytes: 132 });
    // The budget covers the dynamic instance buffer; the six-corner quad is
    // a separate fixed 48-byte GPU allocation, independent of cloud size.
    expect(device.sizes).toEqual([48, gaussianSplatGpuInstanceBytes(data.count)]);
    renderer.dispose(); device.dispose();
  });

  it("interleaves splat instances, other clouds, transparent meshes and contributor draws in global distance order", () => {
    type Event = { readonly name: string; readonly color: readonly [number, number, number]; readonly alpha: number };
    const events: Event[] = [];
    class RecordingDevice extends MockRenderDevice {
      override draw(command: DrawCommand): void {
        super.draw(command);
        const values = instanceData(this, command);
        for (let i = 0; i < (command.instanceCount ?? 1); i++) {
          const o = i * 11, red = values[o + 7]!, green = values[o + 8]!, blue = values[o + 9]!;
          events.push({ name: `${red > green ? "A" : "B"}:${values[o + 2]}`, color: [Math.max(red, 0), Math.max(green, 0), Math.max(blue, 0)], alpha: values[o + 10]! });
        }
        expect(command.renderState).toMatchObject({ depthTest: true, depthWrite: false, blendMode: "alpha" });
      }
    }
    const device = new RecordingDevice();
    const a = new GaussianSplatRenderer(device, cloud([[0, 0, -0.75], [0, 0, -0.25], [0, 0, 0.5]], { colors: new Float32Array([2, 0, 0, 2, 0, 0, 2, 0, 0]) }));
    // RDF flips source z to scene z. A's second instance shares its renderer,
    // but has independently prepared, transformed data.
    const b = new GaussianSplatRenderer(device, cloud([[0, 0, 0], [0, 0, -0.5]], {
      colors: new Float32Array([0, 1, 0, 0, 1, 0]), opacities: new Float32Array([0.25, 0.25]), metadata: { colorSpace: "lin_rec709_display", coordinateSystem: "RDF" }
    }));
    const translatedA = [...identity]; translatedA[14] = 0.25;
    const translatedB = [...identity]; translatedB[14] = -0.375;
    const base = { viewMatrix: identity, projectionMatrix: identity, viewport: [100, 100] as const, cameraPosition: [0, 0, 2] as const };
    const entries = [
      { renderer: a, frame: a.prepare(base) },
      { renderer: a, frame: a.prepare({ ...base, modelMatrix: translatedA }) },
      { renderer: b, frame: b.prepare({ ...base, modelMatrix: translatedB }) }
    ];
    const mesh = (name: string, sortDepth: number): TransparentEngineItem => ({ item: { label: name } as TransparentEngineItem["item"], sortDepth });
    const engine = [mesh("mesh-far", 2.45), mesh("mesh-near", 1.75)];
    const queues: TransparentQueueItem[] = [
      { sortDepth: 2.3, draw: () => events.push({ name: "contributor-far", color: [1, 1, 0], alpha: 0.25 }) },
      { sortDepth: 1.5, draw: () => events.push({ name: "contributor-tie", color: [1, 0, 1], alpha: 0.5 }) }
    ];
    const boundaries = [...engine.map((value) => value.sortDepth), ...queues.map((value) => value.sortDepth)];
    const runs = a.transparentRuns(entries, boundaries);
    device.beginFrame(100, 100);
    for (const segment of mergeTransparentSegments(engine, [...queues, ...runs])) {
      if (segment.engine) for (const item of segment.engine) events.push({ name: item.label!, color: [0, 0, 1], alpha: 0.25 });
      if (segment.queue) segment.queue.draw({} as FrameContributorContext);
    }
    expect(events.map((value) => value.name)).toEqual([
      "A:-0.75", "A:-0.5", "mesh-far", "B:-0.375", "contributor-far", "A:-0.25", "A:0", "B:0.125", "mesh-near", "contributor-tie", "A:0.5", "A:0.75"
    ]);
    // Straight-alpha source-over at each splat center, using independently
    // calculated exact binary fractions for the specified far-to-near order.
    const color = [0, 0, 0];
    for (const event of events) for (let channel = 0; channel < 3; channel++) color[channel] = event.color[channel]! * event.alpha + color[channel]! * (1 - event.alpha);
    expect(color).toEqual([1.7459869384765625, 0.0311279296875, 0.158721923828125]);
    device.endFrame(); a.dispose(); b.dispose(); device.dispose();
  });

  it("batches adjacent splats and splits at transparent depth boundaries", () => {
    const device = new MockRenderDevice();
    const renderer = new GaussianSplatRenderer(device, cloud([[0, 0, -0.75], [0, 0, -0.5], [0, 0, -0.25]]));
    const frame = renderer.prepare({ viewMatrix: identity, projectionMatrix: identity, viewport: [100, 100], cameraPosition: [0, 0, 2] });
    expect([frame.distanceAt(0), frame.distanceAt(1), frame.distanceAt(2)]).toEqual([2.75, 2.5, 2.25]);
    const runs = renderer.transparentRuns([{ renderer, frame }], [2.3]);
    expect(runs.map((run) => [run.sortDepth, run.count])).toEqual([[2.75, 2], [2.25, 1]]);
    device.beginFrame(100, 100);
    runs.forEach((run) => run.draw());
    expect(device.drawCommands.map((command) => command.instanceCount)).toEqual([2, 1]);
    device.endFrame(); renderer.dispose(); device.dispose();
  });

  it("isolates boundary ties so contributor priority and mesh ordering cannot pull nearer splats forward", () => {
    const events: string[] = [];
    class RecordingDevice extends MockRenderDevice {
      override draw(command: DrawCommand): void {
        super.draw(command);
        const values = instanceData(this, command);
        for (let i = 0; i < (command.instanceCount ?? 1); i++) events.push(`splat:${values[i * 11 + 2]}`);
      }
    }
    const device = new RecordingDevice(), renderer = new GaussianSplatRenderer(device, cloud([[0, 0, -0.5], [0, 0, 0], [0, 0, 0.5]]));
    const frame = renderer.prepare({ viewMatrix: identity, projectionMatrix: identity, viewport: [100, 100], cameraPosition: [0, 0, 2] });
    const engine: TransparentEngineItem[] = [{ item: { label: "mesh" } as TransparentEngineItem["item"], sortDepth: 2 }];
    const queues: TransparentQueueItem[] = [
      { sortDepth: 2, order: -1, draw: () => events.push("before-tie") },
      { sortDepth: 2, order: 1, draw: () => events.push("after-tie") }
    ];
    const runs = renderer.transparentRuns([{ renderer, frame }], [2, 2, 2]);
    device.beginFrame(100, 100);
    for (const segment of mergeTransparentSegments(engine, [...queues, ...runs])) {
      if (segment.engine) events.push("mesh");
      if (segment.queue) segment.queue.draw({} as FrameContributorContext);
    }
    expect(events).toEqual(["splat:-0.5", "before-tie", "splat:0", "after-tie", "mesh", "splat:0.5"]);
    device.endFrame(); renderer.dispose(); device.dispose();
  });

  it("submits each mocked WebGPU run before rewriting the shared instance buffer", async () => {
    const events: Array<{ kind: string; z?: number }> = [];
    const native = {
      queue: {
        writeBuffer(_buffer: unknown, _offset: number, data: ArrayBuffer | ArrayBufferView) {
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          events.push({ kind: "write", z: bytes.byteLength >= 12 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat32(8, true) : undefined });
        },
        submit() { events.push({ kind: "submit" }); },
        onSubmittedWorkDone: async () => {}
      },
      createBuffer({ size }: { size: number }) { return { size, destroy() {} }; },
      createShaderModule: () => ({}),
      createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
      createBindGroup: () => ({}),
      createCommandEncoder: () => ({
        beginRenderPass: () => ({ setPipeline() {}, setVertexBuffer() {}, draw() {}, end() {} }),
        finish: () => ({})
      }),
      createTexture: () => ({ createView: () => ({}), destroy() {} }),
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
    const renderer = new GaussianSplatRenderer(device, cloud([[0, 0, -0.5], [0, 0, 0.5]]));
    const target = device.createRenderTarget({ width: 32, height: 32 });
    const frame = renderer.prepare({ viewMatrix: identity, projectionMatrix: identity, viewport: [32, 32], cameraPosition: [0, 0, 2] });
    device.beginFrame(32, 32); device.setRenderTarget(target); events.length = 0;
    renderer.submitPrepared(frame, 0, 1);
    renderer.submitPrepared(frame, 1, 1);
    expect(events).toEqual([{ kind: "write", z: -0.5 }, { kind: "submit" }, { kind: "write", z: 0.5 }, { kind: "submit" }]);
    device.endFrame(); renderer.dispose(); target.dispose(); device.dispose();
  });

  it("guards prepared-frame ownership, view identity, invalid ranges and run budgets", () => {
    const device = new MockRenderDevice(), otherDevice = new MockRenderDevice();
    const a = new GaussianSplatRenderer(device, cloud([[0, 0, -0.5], [0, 0, 0.5]]));
    const b = new GaussianSplatRenderer(otherDevice, cloud([[0, 0, 0]]));
    const display = new GaussianSplatRenderer(device, cloud([[0, 0, 0]], { metadata: { colorSpace: "srgb_rec709_display" } }));
    const input = { viewMatrix: identity, projectionMatrix: identity, viewport: [100, 100] as const, cameraPosition: [0, 0, 2] as const };
    const frame = a.prepare(input), other = b.prepare(input);
    expect(a.belongsToDevice(device)).toBe(true);
    expect(a.belongsToDevice(otherDevice)).toBe(false);
    expect(() => b.submitPrepared(frame, 0, 1)).toThrow(/owned|belong/);
    expect(() => a.submitPrepared(frame, -1, 1)).toThrow(/range/);
    expect(() => a.submitPrepared(frame, 0, 3)).toThrow(/range/);
    expect(() => frame.distanceAt(2)).toThrow(/range/);
    expect(() => a.transparentRuns([{ renderer: b, frame: other }], [])).toThrow(/device/);
    const mismatch = a.prepare({ ...input, viewport: [101, 100] });
    expect(() => a.transparentRuns([{ renderer: a, frame }, { renderer: a, frame: mismatch }], [])).toThrow(/view|viewport/);
    const mixed = a.transparentRuns([{ renderer: a, frame }, { renderer: display, frame: display.prepare(input) }], []);
    expect(mixed.map((run) => run.colorSpace)).toEqual(["lin_rec709_display", "srgb_rec709_display", "lin_rec709_display"]);
    expect(() => a.transparentRuns([{ renderer: a, frame }], [NaN])).toThrow(/depth|distance/);
    expect(() => a.transparentRuns([{ renderer: a, frame }], [2], { maxRuns: 1 })).toThrow(/maxRuns/);
    frame.order.fill(99); // The exposed snapshot cannot corrupt prepared submission data.
    device.beginFrame(100, 100); a.submitPrepared(frame, 0, 2);
    const packed = instanceData(device, device.drawCommands[0]!);
    expect([packed[2], packed[13]]).toEqual([-0.5, 0.5]);
    device.endFrame(); a.dispose(); b.dispose(); display.dispose(); device.dispose(); otherDevice.dispose();
  });

  it("rejects unrepresentable projected covariance before it can enter the transparent queue", () => {
    const device = new MockRenderDevice(), renderer = new GaussianSplatRenderer(device, cloud([[0, 0, 0]]));
    const model = [...identity]; model[0] = 1e308;
    expect(() => renderer.prepare({ viewMatrix: identity, projectionMatrix: identity, modelMatrix: model, viewport: [100, 100] })).toThrow(/finite|covariance/);
    expect(device.drawCommands).toHaveLength(0);
    renderer.dispose(); device.dispose();
  });

  it("sorts back-to-front for each camera, culls outside the viewport and preserves equal-depth order", () => {
    const device = new MockRenderDevice();
    const renderer = new GaussianSplatRenderer(device, cloud([[0, 0, -0.5], [0, 0, 0.5], [0, 0, 0.5], [20, 0, 0]]));
    device.beginFrame(100, 100);
    const frame = renderer.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [100, 100], cameraPosition: [0, 0, -2] });
    expect([...frame.order]).toEqual([1, 2, 0]);
    expect(frame.visibleCount).toBe(3);
    expect(frame.colorSpace).toBe("lin_rec709_display");
    expect(device.drawCommands[0]?.renderState).toMatchObject({ depthTest: true, depthWrite: false, blendMode: "alpha", depthCompare: "less-equal" });
    expect(instanceData(device, device.drawCommands[0]!)[2]).toBeCloseTo(0.5);
    const reverse = renderer.draw({ viewMatrix: reversed, projectionMatrix: identity, viewport: [100, 100], cameraPosition: [0, 0, 2] });
    expect([...reverse.order]).toEqual([0, 1, 2]);
    expect(instanceData(device, device.drawCommands[1]!)[2]).toBeCloseTo(0.5);
    device.endFrame();
    renderer.dispose(); device.dispose();
  });

  it("sorts by camera distance even when view-space depth gives a different order", () => {
    const device = new MockRenderDevice();
    const renderer = new GaussianSplatRenderer(device, cloud([[0, 0, 0.7], [0.9, 0, 0.1], [-0.9, 0, 0.1]]));
    device.beginFrame(100, 100);
    const frame = renderer.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [100, 100], cameraPosition: [0, 0, 0] });
    // Squared distances: 0.49, 0.82, 0.82. The stable tie preserves source order.
    expect([...frame.order]).toEqual([1, 2, 0]);
    device.endFrame(); renderer.dispose(); device.dispose();
  });

  it("retains positive HDR splat colors for blending before final output conversion", () => {
    const device = new MockRenderDevice();
    const renderer = new GaussianSplatRenderer(device, cloud([[0, 0, 0]], { colors: new Float32Array([2, -1, 0.5]), opacities: new Float32Array([0.25]) }));
    device.beginFrame(100, 100);
    renderer.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [100, 100] });
    const values = instanceData(device, device.drawCommands[0]!);
    // A red value of 2 at opacity 0.25 contributes 0.5 over black. Clamping
    // before blending would incorrectly halve it to 0.25.
    expect(values[7]! * values[10]!).toBe(0.5);
    expect(GAUSSIAN_SPLAT_SHADER.fragment).toMatch(/max\(vColor\.rgb,\s*vec3\(0\.0\)\)/);
    expect(GAUSSIAN_SPLAT_SHADER.webgpu!.fragment).toMatch(/max\(color\.rgb,\s*vec3f\(0\.0\)\)/);
    device.endFrame(); renderer.dispose(); device.dispose();
  });

  it.each([
    ["LDB", [-0.12, -0.23, 0.34]], ["RDB", [0.12, -0.23, 0.34]],
    ["LUB", [-0.12, 0.23, 0.34]], ["RUB", [0.12, 0.23, 0.34]],
    ["LDF", [-0.12, -0.23, -0.34]], ["RDF", [0.12, -0.23, -0.34]],
    ["LUF", [-0.12, 0.23, -0.34]], ["RUF", [0.12, 0.23, -0.34]],
    ["LFD", [-0.12, -0.34, -0.23]], ["RFD", [0.12, -0.34, -0.23]],
    ["LFU", [-0.12, 0.34, -0.23]], ["RFU", [0.12, 0.34, -0.23]],
    ["LBD", [-0.12, -0.34, 0.23]], ["RBD", [0.12, -0.34, 0.23]],
    ["LBU", [-0.12, 0.34, 0.23]], ["RBU", [0.12, 0.34, 0.23]]
  ])("maps the %s coordinate axes into RUB scene space", (coordinateSystem, expected) => {
    const device = new MockRenderDevice();
    const renderer = new GaussianSplatRenderer(device, cloud([[0.12, 0.23, 0.34]], { metadata: { coordinateSystem } }));
    device.beginFrame(100, 100);
    renderer.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [100, 100] });
    const values = instanceData(device, device.drawCommands[0]!);
    expected.forEach((value, i) => expect(values[i]).toBeCloseTo(value, 6));
    device.endFrame(); renderer.dispose(); device.dispose();
  });

  it.each([
    ["LDB", [-3, -4, 5]], ["RDB", [3, -4, 5]], ["LUB", [-3, 4, 5]], ["RUB", [3, 4, 5]],
    ["LDF", [-3, -4, -5]], ["RDF", [3, -4, -5]], ["LUF", [-3, 4, -5]], ["RUF", [3, 4, -5]],
    ["LFD", [-3, -5, -4]], ["RFD", [3, -5, -4]], ["LFU", [-3, -5, 4]], ["RFU", [3, -5, 4]],
    ["LBD", [-3, 5, -4]], ["RBD", [3, 5, -4]], ["LBU", [-3, 5, 4]], ["RBU", [3, 5, 4]]
  ])("evaluates SH in the original %s basis", (coordinateSystem, localDirection) => {
    const sh = new Float32Array(9); sh[0] = 1; sh[4] = 1; sh[8] = 1;
    const device = new MockRenderDevice();
    const renderer = new GaussianSplatRenderer(device, cloud([[0, 0, 0]], {
      shDegree: 1, sphericalHarmonics: sh, colors: new Float32Array([0.5, 0.5, 0.5]), metadata: { coordinateSystem }
    }));
    device.beginFrame(100, 100);
    renderer.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [100, 100], cameraPosition: [-0.3, -0.4, -0.5] });
    const values = instanceData(device, device.drawCommands[0]!);
    const factor = Math.sqrt(3 / (4 * Math.PI)) / Math.sqrt(50);
    // Y(1,-1)=-factor*y, Y(1,0)=factor*z, Y(1,1)=-factor*x.
    expect(values[7]).toBeCloseTo(0.5 - factor * localDirection[1]!, 5);
    expect(values[8]).toBeCloseTo(0.5 + factor * localDirection[2]!, 5);
    expect(values[9]).toBeCloseTo(0.5 - factor * localDirection[0]!, 5);
    device.endFrame(); renderer.dispose(); device.dispose();
  });

  it("renders standalone SPZ and its compressed glTF wrapper with identical geometry and degree-three lighting", async () => {
    const fixture = spzAndGltf();
    const raw = await parseGaussianSplat(fixture.spz, "spz", { defaultColorSpace: "lin_rec709_display" });
    const wrapped = await parseGaussianSplat(fixture.gltf, "gltf");
    expect(raw.metadata.coordinateSystem).toBe("RUB");
    expect(wrapped.metadata.coordinateSystem).toBe("LUF");
    expect([...raw.positions]).toEqual([0.25, -0.125, 0.375]);
    expect([...wrapped.positions]).toEqual([-0.25, -0.125, -0.375]);
    const device = new MockRenderDevice();
    const standalone = new GaussianSplatRenderer(device, raw), gltf = new GaussianSplatRenderer(device, wrapped);
    const model = [0, 2, 0, 0, -1, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1];
    device.beginFrame(100, 100);
    for (const cameraPosition of [[-1, 0, 0], [0, 1, 2], [2, -1, 0.5]] as const) {
      const input = { viewMatrix: identity, projectionMatrix: identity, modelMatrix: model, viewport: [100, 100] as const, cameraPosition };
      standalone.draw(input);
      const expected = [...instanceData(device, device.drawCommands.at(-1)!).slice(0, 11)];
      gltf.draw(input);
      const actual = instanceData(device, device.drawCommands.at(-1)!);
      expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 5));
    }
    device.endFrame(); standalone.dispose(); gltf.dispose(); device.dispose();
  });

  it("transforms an uncompressed glTF center, rotated covariance and view-dependent color together", async () => {
    const loaded = await parseGaussianSplat(uncompressedGltf(), "gltf");
    expect(loaded.metadata.coordinateSystem).toBe("LUF");
    const device = new MockRenderDevice();
    const renderer = new GaussianSplatRenderer(device, loaded);
    device.beginFrame(100, 100);
    renderer.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [100, 100], cameraPosition: [-0.2, 0.1, -1.4] });
    const values = instanceData(device, device.drawCommands[0]!);
    [-0.2, 0.1, -0.4].forEach((value, i) => expect(values[i]).toBeCloseTo(value, 5));
    // The 45-degree major axis becomes -45 degrees after reflecting x;
    // eigenvalues are 0.3² and 0.1² in this square viewport.
    const diagonal = Math.SQRT1_2;
    [0.9 * diagonal, -0.9 * diagonal, 0.3 * diagonal, 0.3 * diagonal]
      .forEach((value, i) => expect(values[3 + i]).toBeCloseTo(value, 5));
    expect(values[7]).toBeCloseTo(0.5 - Math.sqrt(3 / (4 * Math.PI)), 5);
    device.endFrame(); renderer.dispose(); device.dispose();
  });

  it("rotates SH with the model rotation independently of nonuniform scale and shear", () => {
    const sh = new Float32Array(9); sh[0] = 1; // m=-1: -sqrt(3/4pi)*y
    const device = new MockRenderDevice();
    const renderer = new GaussianSplatRenderer(device, cloud([[0, 0, 0]], { shDegree: 1, sphericalHarmonics: sh, colors: new Float32Array([0.5, 0.5, 0.5]) }));
    device.beginFrame(100, 100);
    // Rz(90°) * diag(2, 1, 1): world +x maps to local -y regardless of scale.
    const rotated = [0, 2, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    renderer.draw({ viewMatrix: identity, projectionMatrix: identity, modelMatrix: rotated, viewport: [100, 100], cameraPosition: [-1, 0, 0] });
    expect(instanceData(device, device.drawCommands[0]!)[7]).toBeCloseTo(0.5 + Math.sqrt(3 / (4 * Math.PI)), 5);
    renderer.draw({ viewMatrix: identity, projectionMatrix: identity, modelMatrix: rotated, viewport: [100, 100], cameraPosition: [-1, -1, 0] });
    expect(instanceData(device, device.drawCommands[1]!)[7]).toBeCloseTo(0.5 + Math.sqrt(3 / (8 * Math.PI)), 5);
    // For shear [[1,2],[0,1]], the orthogonal polar factor is Rz(-45°).
    // Its inverse sends world +x to (+1,+1)/sqrt(2), so m=-1 is negative.
    const shear = [1, 0, 0, 0, 2, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    renderer.draw({ viewMatrix: identity, projectionMatrix: identity, modelMatrix: shear, viewport: [100, 100], cameraPosition: [-1, 0, 0] });
    expect(instanceData(device, device.drawCommands[2]!)[7]).toBeCloseTo(0.5 - Math.sqrt(3 / (8 * Math.PI)), 5);
    const singular = [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(() => renderer.draw({ viewMatrix: identity, projectionMatrix: identity, modelMatrix: singular, viewport: [100, 100] })).toThrow(/invertible|singular/);
    device.endFrame(); renderer.dispose(); device.dispose();
  });

  it("retains the SH orientation under extreme but invertible nonuniform scale", () => {
    const sh = new Float32Array(9); sh[0] = 1;
    const device = new MockRenderDevice();
    const renderer = new GaussianSplatRenderer(device, cloud([[0, 0, 0]], { shDegree: 1, sphericalHarmonics: sh, colors: new Float32Array([0.5, 0.5, 0.5]) }));
    const model = [1e-300, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    device.beginFrame(100, 100);
    renderer.draw({ viewMatrix: identity, projectionMatrix: identity, modelMatrix: model, viewport: [100, 100], cameraPosition: [-1, -1, 0] });
    expect(instanceData(device, device.drawCommands[0]!)[7]).toBeCloseTo(0.5 - Math.sqrt(3 / (8 * Math.PI)), 5);
    device.endFrame(); renderer.dispose(); device.dispose();
  });

  it("projects the rotated 3D covariance to an anisotropic ellipse and recomputes it on resize", () => {
    const device = new MockRenderDevice();
    const q = Math.SQRT1_2;
    const renderer = new GaussianSplatRenderer(device, cloud([[0, 0, 0]], {
      scales: new Float32Array([0.4, 0.1, 0.1]), rotations: new Float32Array([0, 0, q, q])
    }));
    device.beginFrame(200, 100);
    renderer.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [200, 100] });
    const first = [...instanceData(device, device.drawCommands[0]!).slice(3, 7)];
    // z-rotation makes the longer axis vertical; its NDC half-height is 3*0.4.
    expect(Math.abs(first[1]!)).toBeCloseTo(1.2, 5);
    expect(Math.abs(first[0]!)).toBeLessThan(1e-5);
    expect(Math.abs(first[2]!)).toBeCloseTo(0.3, 5);
    renderer.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [100, 200] });
    const second = [...instanceData(device, device.drawCommands[1]!).slice(3, 7)];
    // The covariance is computed in pixels; after conversion back to NDC its geometry is invariant.
    expect(Math.abs(second[1]!)).toBeCloseTo(1.2, 5);
    expect(Math.abs(second[2]!)).toBeCloseTo(0.3, 5);
    device.endFrame(); renderer.dispose(); device.dispose();
  });

  it("uses real spherical harmonics through degree four and reacts to camera direction", () => {
    const c1 = Math.sqrt(3 / (4 * Math.PI));
    expect(gaussianSphericalHarmonicBasis(0, 0, [1, 0, 0])).toBeCloseTo(1 / Math.sqrt(4 * Math.PI));
    expect(gaussianSphericalHarmonicBasis(1, 1, [1, 0, 0])).toBeCloseTo(-c1);
    expect(gaussianSphericalHarmonicBasis(1, -1, [0, 1, 0])).toBeCloseTo(-c1);
    expect(gaussianSphericalHarmonicBasis(4, 0, [0, 0, 1])).toBeCloseTo(3 / Math.sqrt(4 * Math.PI));
    const sh = new Float32Array(72); sh[6] = 1; // degree 1, m=+1, red
    const device = new MockRenderDevice();
    const renderer = new GaussianSplatRenderer(device, cloud([[0, 0, 0]], { shDegree: 4, sphericalHarmonics: sh, colors: new Float32Array([0.5, 0.5, 0.5]) }));
    device.beginFrame(100, 100);
    renderer.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [100, 100], cameraPosition: [-2, 0, 0] });
    expect(instanceData(device, device.drawCommands[0]!)[7]).toBeCloseTo(0.5 - c1, 5);
    renderer.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [100, 100], cameraPosition: [2, 0, 0] });
    expect(instanceData(device, device.drawCommands[1]!)[7]).toBeCloseTo(0.5 + c1, 5);
    device.endFrame(); renderer.dispose(); device.dispose();
  });

  it("enforces input, coordinate and allocation limits before resource creation", () => {
    const device = new MockRenderDevice();
    expect(() => new GaussianSplatRenderer(device, cloud([[0, 0, 0]]), { maxGpuBytes: 4 })).toThrow(/maxGpuBytes/);
    expect(() => new GaussianSplatRenderer(device, cloud([[0, 0, 0]], { scales: new Float32Array([-1, 1, 1]) }))).toThrow(/non-negative/);
    expect(() => new GaussianSplatRenderer(device, cloud([[0, 0, 0]], { metadata: { coordinateSystem: "invalid" } }))).toThrow(/coordinate system/);
    expect(() => new GaussianSplatRenderer(device, cloud([[0, 0, 0]], { metadata: { extras: { extensionTypes: [1] } } }))).toThrow(/extension/);
    expect(() => new GaussianSplatRenderer(device, cloud([[0, 0, 0]], { shDegree: 1 }))).toThrow(/sphericalHarmonics/);
    expect(device.getDiagnostics().buffers).toBe(0);
    device.dispose();
  });

  it("rebuilds its resources when a lost device is restored with a new generation", () => {
    class RestoringDevice extends MockRenderDevice { generation = 1; }
    const device = new RestoringDevice();
    const renderer = new GaussianSplatRenderer(device, cloud([[0, 0, 0]]));
    device.beginFrame(50, 50);
    renderer.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [50, 50] });
    const old = device.drawCommands[0]!;
    device.contextLost = true;
    expect(() => renderer.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [50, 50] })).toThrow(/unavailable/);
    device.generation++; device.contextLost = false;
    renderer.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [50, 50] });
    expect(old.vertexBuffer.disposed).toBe(true);
    expect(device.drawCommands[1]!.vertexBuffer.id).not.toBe(old.vertexBuffer.id);
    expect(device.getDiagnostics()).toMatchObject({ buffers: 2, shaders: 1 });
    device.endFrame(); renderer.dispose(); device.dispose();
  });

  it("submits an existing prepared frame after device restoration and rejects it after disposal", () => {
    class RestoringDevice extends MockRenderDevice { generation = 1; }
    const device = new RestoringDevice(), renderer = new GaussianSplatRenderer(device, cloud([[0, 0, -0.5], [0, 0, 0.5]]));
    const frame = renderer.prepare({ viewMatrix: identity, projectionMatrix: identity, viewport: [50, 50], cameraPosition: [0, 0, 2] });
    device.contextLost = true;
    expect(() => renderer.submitPrepared(frame, 0, 1)).toThrow(/unavailable/);
    device.generation++; device.contextLost = false; device.beginFrame(50, 50);
    renderer.submitPrepared(frame, 1, 1);
    expect(instanceData(device, device.drawCommands[0]!)[2]).toBe(0.5);
    device.endFrame(); renderer.dispose();
    expect(() => renderer.submitPrepared(frame, 0, 1)).toThrow(/disposed/);
    device.dispose();
  });

  it("rejects a depth convention changed after preparation before drawing", () => {
    class ChangingDepthDevice extends MockRenderDevice { depthConvention = { mode: "standard" }; }
    const device = new ChangingDepthDevice(), renderer = new GaussianSplatRenderer(device, cloud([[0, 0, 0]]));
    const frame = renderer.prepare({ viewMatrix: identity, projectionMatrix: identity, viewport: [50, 50] });
    device.depthConvention = { mode: "reversed" }; device.beginFrame(50, 50);
    expect(() => renderer.submitPrepared(frame, 0, 1)).toThrow(/reversed depth/);
    expect(device.drawCommands).toHaveLength(0);
    device.endFrame(); renderer.dispose(); device.dispose();
  });

  it("releases partial allocations on shader failure and owns only its own resources", () => {
    class FailingDevice extends MockRenderDevice {
      override createShaderProgram(): never { throw new Error("compile failure"); }
    }
    const failed = new FailingDevice();
    expect(() => new GaussianSplatRenderer(failed, cloud([[0, 0, 0]]))).toThrow(/compile failure/);
    expect(failed.getDiagnostics().buffers).toBe(0);
    failed.dispose();
    const device = new MockRenderDevice();
    const renderer = new GaussianSplatRenderer(device, cloud([[0, 0, 0]]));
    expect(device.getDiagnostics().buffers).toBe(2);
    renderer.dispose(); renderer.dispose();
    expect(device.getDiagnostics()).toMatchObject({ buffers: 0, shaders: 0 });
    expect(device.disposed).toBe(false);
    expect(() => renderer.draw({ viewMatrix: identity, projectionMatrix: identity, viewport: [100, 100] })).toThrow(/disposed/);
    device.dispose();
  });
});
