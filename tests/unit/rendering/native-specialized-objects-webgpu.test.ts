import { afterEach, describe, expect, it, vi } from "vitest";
import { createGroundedSky, createShadowProjection, VolumeSlice, type SliceAxis } from "../../../packages/addons/src/objects/SpecializedObjects";
import { createAuraApp, defineAuraAssets, scene, texture } from "../../../packages/engine/src/public/index";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import type { DrawCommand, RecursiveUniformValue } from "../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { declaresZeroToOneProjectionOverride, rasterClipDepthWgsl, ZERO_TO_ONE_PROJECTION_OVERRIDE } from "../../../packages/rendering/src/webgpu/ProjectionClip";
import {
  WebGPUDevice,
  type WebGPUCanvasConfigurationLike,
  type WebGPUDeviceLike,
  type WebGPURenderPipelineDescriptorLike
} from "../../../packages/rendering/src/WebGPUDevice";

// This records the real app/compiler/renderer/device host path against a
// native-shaped mock. It neither compiles WGSL nor rasterizes pixels.
type NativeBuffer = { readonly bytes: Uint8Array; destroy(): void };
type NativeTexture = { readonly label?: string; readonly format?: string; readonly sampleCount: number; destroyed: number; createView(): { texture: NativeTexture }; destroy(): void };
type Pipeline = { readonly descriptor: WebGPURenderPipelineDescriptorLike; getBindGroupLayout(index: number): object };
type Group = { readonly descriptor: { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] } };
type Draw = {
  readonly pipeline: Pipeline;
  readonly group: Group;
  readonly uniformBytes: Uint8Array;
  readonly vertices: ReadonlyMap<number, Uint8Array>;
  readonly indexed: boolean;
  readonly count: number;
};
type Upload = { readonly texture: NativeTexture; readonly bytes: Uint8Array; readonly bytesPerRow?: number; readonly width: number; readonly height: number };

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  constructor(private readonly context: object) {}
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext(kind: string) { return kind === "webgpu" ? this.context : null; }
  addEventListener() {}
  removeEventListener() {}
}

const bytesOf = (data: ArrayBuffer | ArrayBufferView): Uint8Array => data instanceof ArrayBuffer
  ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

async function harness(initial: ReturnType<typeof scene>) {
  const submitted: Draw[] = [];
  const uploads: Upload[] = [];
  let configuration: WebGPUCanvasConfigurationLike | null = null;
  const native = {
    features: new Set<string>(),
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024, maxBufferSize: 8_000_000, maxVertexBuffers: 8 },
    queue: {
      writeBuffer(buffer: NativeBuffer, offset: number, data: ArrayBuffer | ArrayBufferView) {
        buffer.bytes.set(bytesOf(data), offset);
      },
      writeTexture(destination: { readonly texture: NativeTexture }, data: ArrayBuffer | ArrayBufferView,
        layout: { readonly bytesPerRow?: number }, size: { readonly width: number; readonly height: number }) {
        uploads.push({ texture: destination.texture, bytes: bytesOf(data).slice(), bytesPerRow: layout.bytesPerRow, width: size.width, height: size.height });
      },
      submit(commands: readonly { readonly draws: readonly Draw[] }[]) {
        for (const command of commands) submitted.push(...command.draws);
      },
      onSubmittedWorkDone: () => Promise.resolve()
    },
    createBuffer(descriptor: { readonly size: number }): NativeBuffer {
      return { bytes: new Uint8Array(descriptor.size), destroy() {} };
    },
    createTexture(descriptor: { readonly label?: string; readonly format?: string; readonly sampleCount?: number }): NativeTexture {
      const result: NativeTexture = { label: descriptor.label, format: descriptor.format, sampleCount: descriptor.sampleCount ?? 1,
        destroyed: 0, createView: () => ({ texture: result }), destroy() { result.destroyed += 1; } };
      return result;
    },
    createShaderModule: (descriptor: object) => descriptor,
    createRenderPipeline(descriptor: WebGPURenderPipelineDescriptorLike): Pipeline {
      return { descriptor, getBindGroupLayout: (index) => ({ index }) };
    },
    createBindGroupLayout: (descriptor: object) => ({ descriptor }),
    createPipelineLayout: (descriptor: object) => ({ descriptor }),
    createBindGroup: (descriptor: Group["descriptor"]): Group => ({ descriptor }),
    createSampler: (descriptor: object) => ({ kind: "sampler", descriptor }),
    createCommandEncoder() {
      const draws: Draw[] = [];
      return {
        beginRenderPass() {
          let pipeline: Pipeline | undefined;
          let group: Group | undefined;
          const buffers = new Map<number, NativeBuffer>();
          const record = (indexed: boolean, count: number) => {
            if (!pipeline) throw new Error("A submitted draw needs a pipeline");
            // The assertions select portable object programs. Other frame
            // passes may have no bind group or uniform block at all.
            if (!group) return;
            const uniform = group.descriptor.entries.find((entry) => entry.binding === 0)?.resource as { readonly buffer?: NativeBuffer } | undefined;
            if (!uniform?.buffer) return;
            draws.push({ pipeline, group, uniformBytes: uniform.buffer.bytes.slice(),
              vertices: new Map([...buffers].map(([slot, buffer]) => [slot, buffer.bytes.slice()])), indexed, count });
          };
          return {
            setPipeline(value: Pipeline) { pipeline = value; },
            setBindGroup(index: number, value: Group) { if (index === 0) group = value; },
            setVertexBuffer(slot: number, value: NativeBuffer) { buffers.set(slot, value); },
            setIndexBuffer() {}, setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
            draw(count: number) { record(false, count); },
            drawIndexed(count: number) { record(true, count); },
            end() {}
          };
        },
        finish: () => ({ draws })
      };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const canvasTexture = { format: "bgra8unorm", usage: 0x10, sampleCount: 1, createView: () => ({}), destroy() {} };
  const context = {
    configure(value: WebGPUCanvasConfigurationLike) { configuration = value; },
    getConfiguration: () => configuration,
    getCurrentTexture: () => canvasTexture,
    unconfigure() { configuration = null; }
  };
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: "https://assets.example.test/", search: "" }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({ requestDevice: async () => native }), getPreferredCanvasFormat: () => "bgra8unorm" } });
  const canvas = new FakeCanvas(context) as unknown as HTMLCanvasElement;
  // WebGPUDevice.draw accepts structured (recursive) uniform data; record what it receives.
  const commands: DrawCommand<RecursiveUniformValue>[] = [];
  const createRenderer = Renderer.create.bind(Renderer);
  // Observe the real factory and retain its real draw implementation. Only
  // navigator.gpu and the native command API are supplied by the fixture.
  vi.spyOn(Renderer, "create").mockImplementation(async (options = {}) => {
    const renderer = await createRenderer(options);
    if (!(renderer.device instanceof WebGPUDevice)) throw new Error("The fixture requires the WebGPU backend");
    const device = renderer.device;
    const draw = device.draw.bind(device);
    vi.spyOn(device, "draw").mockImplementation((command) => { commands.push(command); return draw(command); });
    return renderer;
  });
  const app = createAuraApp(canvas, {
    scene: initial, autoStart: false, resize: false, renderer: { backend: "webgpu", allowFallback: false },
    qualityRebuild: { flags: {
      A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true, A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true,
      A3D_QR_MATERIALS: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false, A3D_QR_VFX: false
    }, allowUrlFlags: false }
  });
  try { await app.readyStrict({ stage: "first-frame" }); }
  catch (error) { await app.disposeAsync(); throw error; }
  return { app, commands, submitted, uploads };
}

type Harness = Awaited<ReturnType<typeof harness>>;
const vertex = (draw: Draw): string => (draw.pipeline.descriptor.vertex.module as { readonly code: string }).code;
const fragment = (draw: Draw): string => (draw.pipeline.descriptor.fragment?.module as { readonly code: string }).code;
function drawFrame(h: Harness, fragmentNeedle: string): Draw {
  const previous = h.submitted.length;
  h.app.step(0);
  const result = h.submitted.slice(previous).find((draw) => fragment(draw).includes(fragmentNeedle));
  expect(result, `expected a submitted object draw containing ${fragmentNeedle}`).toBeDefined();
  return result!;
}
function expectClipContract(draw: Draw) {
  expect(draw.count).toBeGreaterThan(0);
  expect(draw.indexed).toBe(true);
  expect(vertex(draw)).toMatch(/aura\.u_modelViewProjection\s*\*\s*vec4<f32>\(position,\s*1\.0\)/);
  // 5.0 native reversed depth (webgpu/ProjectionClip.ts): the (z + w) / 2 remap is written through the
  // a3dZeroToOneProjection override, which a standard frame leaves at its false default.
  expect(declaresZeroToOneProjectionOverride(vertex(draw))).toBe(true);
  expect(vertex(draw)).toContain(rasterClipDepthWgsl("clip"));
  expect(rasterClipDepthWgsl("clip")).toMatch(/clip\.z \* 0\.5 \+ clip\.w \* 0\.5/);
  const constants = (draw.pipeline.descriptor.vertex as { readonly constants?: Record<string, unknown> }).constants;
  expect(constants?.[ZERO_TO_ONE_PROJECTION_OVERRIDE] ?? false).toBeFalsy();
  expect(vertex(draw)).toMatch(/@location\(0\)\s+position:\s*vec3<f32>/);
}
function expectRenderState(draw: Draw, transparent: boolean) {
  const descriptor = draw.pipeline.descriptor;
  expect(descriptor.primitive).toMatchObject({ topology: "triangle-list", cullMode: "none" });
  expect(descriptor.depthStencil).toMatchObject({ depthWriteEnabled: !transparent, depthCompare: "less-equal" });
  const target = descriptor.fragment!.targets[0]!;
  if (transparent) {
    expect(target.blend).toMatchObject({ color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" } });
  } else expect(target.blend).toBeUndefined();
}
function floatsAt(draw: Draw, offset: number, count: number): number[] {
  const view = new DataView(draw.uniformBytes.buffer, draw.uniformBytes.byteOffset, draw.uniformBytes.byteLength);
  return Array.from({ length: count }, (_, index) => view.getFloat32(offset + index * 4, true));
}
function expectFloatVector(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 5));
}
function textureBinding(draw: Draw, uniform: string): NativeTexture {
  const source = fragment(draw);
  expect(vertex(draw)).toMatch(/@location\(2\)\s+uv:\s*vec2<f32>/);
  expect(source).toContain(`textureSample(${uniform}Texture, ${uniform}Sampler, uv)`);
  const samplerIndex = new RegExp(`@group\\(0\\)\\s*@binding\\((\\d+)\\)\\s*var\\s+${uniform}Sampler`).exec(source);
  const textureIndex = new RegExp(`@group\\(0\\)\\s*@binding\\((\\d+)\\)\\s*var\\s+${uniform}Texture`).exec(source);
  expect(samplerIndex).not.toBeNull(); expect(textureIndex).not.toBeNull();
  const entries = draw.group.descriptor.entries;
  expect(entries.find((entry) => entry.binding === Number(samplerIndex![1]))?.resource).toMatchObject({ kind: "sampler" });
  const view = entries.find((entry) => entry.binding === Number(textureIndex![1]))?.resource as { readonly texture?: NativeTexture } | undefined;
  expect(view?.texture).toBeDefined();
  return view!.texture!;
}
function latestUpload(h: Harness, nativeTexture: NativeTexture): Upload {
  const result = h.uploads.filter((upload) => upload.texture === nativeTexture).at(-1);
  expect(result).toBeDefined();
  return result!;
}
function positionsOnAxis(draw: Draw, axis: number): number[] {
  const layouts = draw.pipeline.descriptor.vertex.buffers ?? [];
  const slot = layouts.findIndex((layout) => layout?.attributes.some((attribute) => attribute.shaderLocation === 0));
  expect(slot).toBeGreaterThanOrEqual(0);
  const layout = layouts[slot]!;
  const position = layout.attributes.find((attribute) => attribute.shaderLocation === 0)!;
  expect(position.format).toBe("float32x3");
  const bytes = draw.vertices.get(slot);
  expect(bytes).toBeDefined();
  const view = new DataView(bytes!.buffer, bytes!.byteOffset, bytes!.byteLength);
  return Array.from({ length: 4 }, (_, index) => view.getFloat32(index * layout.arrayStride + position.offset + axis * 4, true));
}
const rgba = (gray: readonly number[], alpha: number): number[] => gray.flatMap((value) => [value, value, value, alpha]);

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("specialized objects through the WebGPU device", () => {
  it("submits gradient ground and projected shadow uniforms, clip conversion and render state", async () => {
    const ground = createGroundedSky({ name: "test-ground", center: [2, 0, 3], radius: 10, groundColor: [0.2, 0.4, 0.6], segments: 8 });
    const shadow = createShadowProjection({ name: "test-shadow", casterBounds: { min: [0, 1, 0], max: [1, 2, 1] },
      lightDirection: [0, -1, 0], color: [0.1, 0.2, 0.3], opacity: 0.4 });
    const h = await harness(scene().add({ ...ground.ground.toJSON(), frustumCulled: false }).add({ ...shadow.node.toJSON(), frustumCulled: false }));
    try {
      const groundDraw = drawFrame(h, "aura.u_groundRadius");
      const shadowDraw = drawFrame(h, "aura.u_shadowOpacity");
      for (const draw of [groundDraw, shadowDraw]) expectClipContract(draw);
      expectRenderState(groundDraw, false); expectRenderState(shadowDraw, true);
      // Portable uniforms start with three mat4 built-ins, then the authored fields.
      expectFloatVector(floatsAt(groundDraw, 192, 2), [2, 3]);
      expectFloatVector(floatsAt(groundDraw, 200, 1), [10]);
      expectFloatVector(floatsAt(groundDraw, 208, 3), [0.2, 0.4, 0.6]);
      expectFloatVector(floatsAt(shadowDraw, 192, 3), [0.1, 0.2, 0.3]);
      expectFloatVector(floatsAt(shadowDraw, 204, 1), [0.4]);
      expect(fragment(shadowDraw)).toContain("vec4<f32>(aura.u_shadowTint, aura.u_shadowOpacity)");
    } finally { await h.app.disposeAsync(); }
  });

  it("binds and updates a caller-owned panorama texture without taking ownership", async () => {
    const pixels = Uint8Array.of(7, 23, 41, 255, 67, 83, 101, 128, 109, 127, 149, 255, 167, 181, 199, 64);
    const next = Uint8Array.of(201, 183, 165, 255, 147, 129, 111, 128, 93, 75, 57, 255, 39, 21, 3, 64);
    const panorama = texture.data({ width: 2, height: 2, data: pixels, format: "rgba8", colorSpace: "linear" });
    const ground = createGroundedSky({ name: "panorama", panorama, radius: 5, cameraHeight: 1, segments: 8, rings: 2 }).ground;
    const h = await harness(scene().add({ ...ground.toJSON(), frustumCulled: false }));
    try {
      const first = drawFrame(h, "textureSample(u_panoramaMapTexture");
      expectClipContract(first); expectRenderState(first, false);
      const nativeTexture = textureBinding(first, "u_panoramaMap");
      expect(latestUpload(h, nativeTexture)).toMatchObject({ width: 2, height: 2, bytesPerRow: 8, bytes: pixels });
      panorama.texture.update(next);
      const updated = drawFrame(h, "textureSample(u_panoramaMapTexture");
      expect(textureBinding(updated, "u_panoramaMap")).toBe(nativeTexture);
      expect(latestUpload(h, nativeTexture).bytes).toEqual(next);
    } finally { await h.app.disposeAsync(); }
    expect(panorama.texture.disposed).toBe(false);
    panorama.dispose();
    expect(panorama.texture.disposed).toBe(true);
  });

  it.each([
    ["x", 0, [0, 128, 64, 191], [32, 159, 96, 223]],
    ["y", 1, [0, 32, 128, 159], [64, 96, 191, 223]],
    ["z", 2, [0, 32, 64, 96], [128, 159, 191, 223]]
  ] as const)("updates %s slices in the submitted geometry and the bound texture", async (axis: SliceAxis, component, initial, next) => {
    const slice = new VolumeSlice({ name: `slice-${axis}`, dimensions: [2, 2, 2], axis, index: 0, opacity: 0.5,
      values: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] });
    const owned = slice.texture.texture;
    const node = slice.node.runtime({ id: `slice-${axis}` }).toJSON();
    const h = await harness(scene().add({ ...node, frustumCulled: false }));
    try {
      slice.bind(h.app.nodes.require(`slice-${axis}`));
      const first = drawFrame(h, "textureSample(u_sliceMapTexture");
      expectClipContract(first); expectRenderState(first, true);
      const nativeTexture = textureBinding(first, "u_sliceMap");
      expect(latestUpload(h, nativeTexture)).toMatchObject({ width: 2, height: 2, bytesPerRow: 8, bytes: Uint8Array.from(rgba(initial, 128)) });
      expect(positionsOnAxis(first, component)).toEqual([-0.5, -0.5, -0.5, -0.5]);
      const before = h.uploads.filter((upload) => upload.texture === nativeTexture).length;
      slice.setSlice(1);
      const updated = drawFrame(h, "textureSample(u_sliceMapTexture");
      expect(textureBinding(updated, "u_sliceMap")).toBe(nativeTexture);
      expect(h.uploads.filter((upload) => upload.texture === nativeTexture)).toHaveLength(before + 1);
      expect(latestUpload(h, nativeTexture).bytes).toEqual(Uint8Array.from(rgba(next, 128)));
      expect(positionsOnAxis(updated, component)).toEqual([0.5, 0.5, 0.5, 0.5]);
      if (axis === "z") {
        slice.setWindow([0.25, 0.75]); slice.setOpacity(0.25);
        slice.setValues([1, 1, 1, 1, 0.25, 0.375, 0.5, 0.625]);
        const revised = drawFrame(h, "textureSample(u_sliceMapTexture");
        expect(textureBinding(revised, "u_sliceMap")).toBe(nativeTexture);
        expect(latestUpload(h, nativeTexture).bytes).toEqual(Uint8Array.from(rgba([0, 64, 128, 191], 64)));
      }
    } finally { await h.app.disposeAsync(); }
    expect(owned.disposed).toBe(false);
    slice.dispose();
    expect(owned.disposed).toBe(true);
    expect(() => slice.setSlice(0)).toThrow(/disposed/i);
  });

  it("upgrades a typed panorama asset to a submitted texture and retires its app-owned backing", async () => {
    // The custom-material asset loader uses the bitmap route. Its decoder and
    // readback canvas are simulated so the actual image ownership, upload and
    // binding paths can be inspected without external files or a GPU.
    const pixels = Uint8Array.of(29, 71, 113, 197);
    const bitmap = { width: 1, height: 1, pixels, close: vi.fn() } as unknown as ImageBitmap & { readonly pixels: Uint8Array; readonly close: ReturnType<typeof vi.fn> };
    class FakeReadbackCanvas {
      constructor(readonly width: number, readonly height: number) {}
      getContext(kind: string) {
        if (kind !== "2d") return null;
        let current: Uint8Array = new Uint8Array();
        return {
          clearRect() {},
          drawImage(image: typeof bitmap) { current = image.pixels; },
          getImageData() { return { data: new Uint8ClampedArray(current) }; }
        };
      }
    }
    const asset = defineAuraAssets({ panorama: { type: "texture", format: "png", url: "https://assets.example.test/panorama.png" } }).panorama;
    const fetch = vi.fn(async () => new Response(Uint8Array.of(1, 2, 3)));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    vi.stubGlobal("OffscreenCanvas", FakeReadbackCanvas);
    const ground = createGroundedSky({ panorama: asset, radius: 5, cameraHeight: 1, segments: 8, rings: 2 }).ground;
    const h = await harness(scene().add({ ...ground.toJSON(), frustumCulled: false }));
    let resolved: Texture | undefined;
    try {
      await vi.waitFor(() => {
        const draw = drawFrame(h, "textureSample(u_panoramaMapTexture");
        const nativeTexture = textureBinding(draw, "u_panoramaMap");
        expect(latestUpload(h, nativeTexture)).toMatchObject({ width: 1, height: 1, bytesPerRow: 256 });
        expect(latestUpload(h, nativeTexture).bytes.slice(0, 4)).toEqual(pixels);
        const bindings = h.commands.map((command) => command.uniforms?.get("u_panoramaMap"));
        resolved = bindings.find((value): value is TextureBinding => value instanceof TextureBinding && value.texture?.source === bitmap)?.texture ?? undefined;
        expect(resolved).toBeInstanceOf(Texture);
      }, { timeout: 3000 });
      expect(fetch).toHaveBeenCalledOnce();
      expect(resolved!.disposed).toBe(false);
    } finally { await h.app.disposeAsync(); }
    expect(resolved!.disposed).toBe(true);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
