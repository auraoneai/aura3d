import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/engine/src/agent-api/compiler/lines";
import { DepthPass } from "../../../packages/rendering/src/DepthPass";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { GENERATED_UNLIT_MATERIAL_OFFSETS } from "../../../packages/rendering/src/webgpu/GeneratedUnlitProgram";

const WIDTH = 32;
const HEIGHT = 24;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

interface CapturedBuffer {
  readonly descriptor: { readonly label?: string };
  destroyed: boolean;
  destroy(): void;
}

/** A real render device backed by an observable, non-GPU queue. */
async function fixture(options: { readonly generator?: boolean; readonly parity?: boolean } = {}) {
  let finishFence!: () => void;
  const fence = new Promise<void>(resolve => { finishFence = resolve; });
  const events: string[] = [];
  const submissions: unknown[][] = [];
  const draws: number[][] = [];
  const writes: { label: string; offset: number; bytes: Uint8Array }[] = [];
  const buffers: CapturedBuffer[] = [];
  const modules: { code: string }[] = [];
  const pipelines: { primitive: { topology: string } }[] = [];
  const native = {
    limits: { maxBufferSize: 1_000_000, maxVertexBuffers: 8 },
    queue: {
      writeBuffer(buffer: CapturedBuffer, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        writes.push({ label: buffer.descriptor.label ?? "", offset, bytes: bytes.slice() });
      },
      writeTexture() {},
      submit(commands: readonly unknown[]) {
        if (commands.length) { events.push("submit"); submissions.push([...commands]); }
      },
      onSubmittedWorkDone: () => fence
    },
    createBuffer(descriptor: { label?: string }) {
      const buffer: CapturedBuffer = { descriptor, destroyed: false, destroy() { this.destroyed = true; } };
      buffers.push(buffer);
      return buffer;
    },
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    createSampler: () => ({}),
    createShaderModule(descriptor: { code: string }) { modules.push(descriptor); return descriptor; },
    createRenderPipeline(descriptor: { primitive: { topology: string } }) {
      pipelines.push(descriptor);
      return { getBindGroupLayout: (index: number) => ({ index }) };
    },
    createBindGroup: (descriptor: object) => descriptor,
    createCommandEncoder: () => ({
      beginRenderPass: () => ({
        setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setViewport() {}, setScissorRect() {},
        draw(...args: number[]) { draws.push(args); },
        end() {}
      }),
      finish: () => ({})
    }),
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const canvasContext = { configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) };
  const device = await WebGPUDevice.create({
    adapter: { requestDevice: async () => native }, device: native,
    canvas: { getContext: () => canvasContext } as unknown as HTMLCanvasElement
  });
  const generator = options.generator !== false;
  setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: generator, A3D_QR_CORE_GENERATOR: generator,
    A3D_PARITY_LINES: options.parity !== false }), device);
  return {
    device, events, submissions, draws, writes, buffers, modules, pipelines, finishFence,
    pointBuffers: () => buffers.filter(buffer => buffer.descriptor.label?.startsWith("aura3d-point-")),
    pointWrites: () => writes.filter(write => write.label.startsWith("aura3d-point-")),
    begin() { device.beginFrame(WIDTH, HEIGHT); },
    end() { device.endFrame(); },
    async finishAndDrain() {
      finishFence();
      await device.waitForSubmittedWork();
      // The point lease awaits the interop retirement promises after the queue fence.
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
    },
    close() {
      finishFence();
      if (device.activeFrameToken) device.endFrame();
      device.dispose();
    }
  };
}

function asFloats(bytes: Uint8Array): Float32Array {
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

function materialRaster(write: { readonly bytes: Uint8Array }): number[] {
  const view = new DataView(write.bytes.buffer, write.bytes.byteOffset, write.bytes.byteLength);
  return [0, 1, 2].map(index => view.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.pointRaster! + index * 4, true));
}

function indexedPoints(): Geometry {
  const format = new VertexFormat([
    { semantic: "position", components: 3, offset: 0 },
    { semantic: "color", components: 4, offset: 12 }
  ], 28);
  const vertices = new VertexBuffer(format, 3);
  for (let index = 0; index < 3; index += 1) {
    vertices.setAttribute(index, "position", [index + 1, 0, 0]);
    vertices.setAttribute(index, "color", index === 0 ? [1, 0, 0, 1] : index === 1 ? [0, 1, 0, 1] : [0, 0, 1, 1]);
  }
  return new Geometry(vertices, new IndexBuffer([2, 0, 2], 3), "points");
}

describe("WebGPU point quads through ForwardPass", () => {
  it("queues selected indexed and nonindexed points as triangle snapshots without uploading the sources", async () => {
    const f = await fixture();
    const plain = Geometry.points([[1, 0, 0], [2, 0, 0], [3, 0, 0]]);
    const indexed = indexedPoints();
    const unlit = new UnlitMaterial({ pointSize: 6, renderState: { cullMode: "none" } });
    const colored = new UnlitMaterial({ pointSize: 8, vertexColors: true, renderState: { cullMode: "none" } });
    try {
      f.begin();
      new ForwardPass({ items: [
        { label: "plain-range", geometry: plain, material: unlit, renderOrder: 0, drawRange: { start: 1, count: 2 } },
        { label: "indexed-range", geometry: indexed, material: colored, renderOrder: 1, drawRange: { start: 1, count: 2 } }
      ] }).execute({ device: f.device, width: WIDTH, height: HEIGHT });
      expect(f.submissions).toHaveLength(2);
      expect(f.draws).toEqual([[12, 1, 0], [12, 1, 0]]);
      expect(f.pipelines.every(pipeline => pipeline.primitive.topology === "triangle-list")).toBe(true);
      expect(plain.vertexBuffer.hasAttemptedUpload).toBe(false);
      expect(indexed.vertexBuffer.hasAttemptedUpload).toBe(false);
      expect(indexed.indexBuffer!.hasAttemptedUpload).toBe(false);
      const pointWrites = f.pointWrites();
      expect(pointWrites).toHaveLength(4);
      const plainSnapshot = asFloats(pointWrites[0]!.bytes);
      expect([plainSnapshot[0], plainSnapshot[18]]).toEqual([2, 3]);
      const indexedSnapshot = asFloats(pointWrites[2]!.bytes);
      expect([indexedSnapshot[0], indexedSnapshot[42]]).toEqual([1, 3]);
      expect(Array.from(indexedSnapshot.slice(3, 7))).toEqual([1, 0, 0, 1]);
      expect(Array.from(indexedSnapshot.slice(45, 49))).toEqual([0, 0, 1, 1]);
      expect(f.modules.some(module => module.code.includes("@location(4) color: vec4f"))).toBe(true);
      expect(f.pointBuffers()).toHaveLength(4);
      expect(f.pointBuffers().every(buffer => !buffer.destroyed)).toBe(true);
      f.end();
      await f.finishAndDrain();
      expect(f.pointBuffers().every(buffer => buffer.destroyed)).toBe(true);
    } finally { f.close(); plain.dispose(); indexed.dispose(); unlit.dispose(); colored.dispose(); }
  });

  it("uses callback-updated points and material for each frame and the effective raster viewport", async () => {
    const f = await fixture();
    const geometry = Geometry.points([[0, 0, 0]]);
    const texture = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([255, 255, 255, 255]), generateMipmaps: false });
    const material = new UnlitMaterial({ pointSize: 1, sizeAttenuation: true, roundPoints: true,
      map: new TextureBinding({ name: "u_pointMap", texture }), renderState: { cullMode: "none" } });
    let frame = 0;
    const pass = new ForwardPass({ items: [{ label: "moving", geometry, material, onBeforeRender: () => {
      frame += 1;
      f.events.push(`callback-${frame}`);
      geometry.vertexBuffer.setAttribute(0, "position", [frame, 0, 0]);
      material.pointSize = frame * 3;
    } }] });
    try {
      for (let index = 0; index < 2; index += 1) {
        f.begin();
        f.device.setViewport(2, 3, 16, 12);
        pass.execute({ device: f.device, width: WIDTH, height: HEIGHT });
        f.end();
      }
      expect(f.events).toEqual(["callback-1", "submit", "callback-2", "submit"]);
      expect(f.draws).toEqual([[6, 1, 0], [6, 1, 0]]);
      const pointWrites = f.pointWrites();
      expect(pointWrites).toHaveLength(4);
      expect([asFloats(pointWrites[0]!.bytes)[0], asFloats(pointWrites[2]!.bytes)[0]]).toEqual([1, 2]);
      const materialWrites = f.writes.filter(write => write.label === "moving-generated-unlit-material");
      expect(materialWrites.map(materialRaster)).toEqual([[3, 16, 12], [6, 16, 12]]);
      expect(f.modules.some(module => module.code.includes("material.pointRaster.x, frame.resolutionFarTime.y, clip.w, true"))).toBe(true);
      expect(f.modules.some(module => module.code.includes("a3dPointInRoundFootprint(input.pointCoord)"))).toBe(true);
      expect(f.modules.some(module => module.code.includes("textureSample(u_pointMapTexture, u_pointMapSampler, input.pointCoord)"))).toBe(true);
      expect(geometry.vertexBuffer.hasAttemptedUpload).toBe(false);
      expect(f.pointBuffers().every(buffer => !buffer.destroyed)).toBe(true);
      await f.finishAndDrain();
      expect(f.pointBuffers().every(buffer => buffer.destroyed)).toBe(true);
    } finally { f.close(); geometry.dispose(); material.dispose(); texture.dispose(); }
  });

  it("submits each point snapshot before the next item's callback mutates shared inputs", async () => {
    const f = await fixture();
    const geometry = Geometry.points([[0, 0, 0]]);
    const material = new UnlitMaterial({ renderState: { cullMode: "none" } });
    const callback = (value: number) => () => {
      f.events.push(`callback-${value}`);
      geometry.vertexBuffer.setAttribute(0, "position", [value, 0, 0]);
      material.pointSize = value;
    };
    try {
      f.begin();
      new ForwardPass({ items: [
        { label: "first", geometry, material, renderOrder: 0, onBeforeRender: callback(1) },
        { label: "second", geometry, material, renderOrder: 1, onBeforeRender: callback(2) }
      ] }).execute({ device: f.device, width: WIDTH, height: HEIGHT });
      expect(f.events).toEqual(["callback-1", "submit", "callback-2", "submit"]);
      expect(f.draws).toEqual([[6, 1, 0], [6, 1, 0]]);
      expect([asFloats(f.pointWrites()[0]!.bytes)[0], asFloats(f.pointWrites()[2]!.bytes)[0]]).toEqual([1, 2]);
      expect(materialRaster(f.writes.find(write => write.label === "first-generated-unlit-material")!)[0]).toBe(1);
      expect(materialRaster(f.writes.find(write => write.label === "second-generated-unlit-material")!)[0]).toBe(2);
      expect(geometry.vertexBuffer.hasAttemptedUpload).toBe(false);
      f.end();
    } finally { f.close(); geometry.dispose(); material.dispose(); }
  });

  it("fails explicitly for deformation, instancing and a source previously uploaded to a device", async () => {
    const f = await fixture();
    const geometry = Geometry.points([[0, 0, 0]]);
    const material = new UnlitMaterial({ renderState: { cullMode: "none" } });
    try {
      f.begin();
      for (const item of [
        { geometry, material, morphWeights: [1] },
        { geometry, material, instanceTransforms: new Float32Array(IDENTITY) }
      ]) {
        expect(() => new ForwardPass({ items: [item] }).execute({ device: f.device, width: WIDTH, height: HEIGHT }))
          .toThrow(/point|deformation|instanc/i);
      }
      expect(geometry.vertexBuffer.hasAttemptedUpload).toBe(false);
      geometry.vertexBuffer.upload(f.device);
      expect(() => new ForwardPass({ items: [{ geometry, material }] }).execute({ device: f.device, width: WIDTH, height: HEIGHT }))
        .toThrow(/upload|authority/i);
      expect(f.submissions).toHaveLength(0);
      f.end();
    } finally { f.close(); geometry.dispose(); material.dispose(); }
  });

  it("does not silently use the legacy path when the generated renderer is disabled", async () => {
    const f = await fixture({ generator: false });
    const geometry = Geometry.points([[0, 0, 0]]);
    const material = new UnlitMaterial();
    try {
      f.begin();
      expect(() => new ForwardPass({ items: [{ geometry, material }] }).execute({ device: f.device, width: WIDTH, height: HEIGHT }))
        .toThrow(/point|unsupported/i);
      expect(geometry.vertexBuffer.hasAttemptedUpload).toBe(false);
      expect(f.submissions).toHaveLength(0);
      f.end();
    } finally { f.close(); geometry.dispose(); material.dispose(); }
  });

  it("rejects point material features when their parity feature is disabled", async () => {
    const f = await fixture({ parity: false });
    const geometry = Geometry.points([[0, 0, 0]]);
    const material = new UnlitMaterial({ sizeAttenuation: true, roundPoints: true });
    try {
      f.begin();
      expect(() => new ForwardPass({ items: [{ geometry, material }] }).execute({ device: f.device, width: WIDTH, height: HEIGHT }))
        .toThrow(/point|material|feature/i);
      expect(f.submissions).toHaveLength(0);
      expect(geometry.vertexBuffer.hasAttemptedUpload).toBe(false);
      f.end();
    } finally { f.close(); geometry.dispose(); material.dispose(); }
  });

  it("admits unclipped camera-depth and shadow point casters and keeps clipped ones guarded in strict mode", async () => {
    const f = await fixture();
    const geometry = Geometry.points([[0, 0, 0]]);
    const material = new UnlitMaterial();
    try {
      f.begin();
      // Unclipped point casters draw as one-pixel point lists in depth and shadow passes (WebGL2 parity, 0757c3f93).
      for (const clippingPass of ["depth", "shadow"] as const) {
        const pass = new DepthPass({ casters: [{ geometry, material }], clippingPass, checkedSubmission: true });
        expect(() => pass.prepare({ device: f.device, width: WIDTH, height: HEIGHT })).not.toThrow();
      }
      // A clipped point caster has no WebGPU depth twin: strict mode keeps the guard (outside strict it is skipped with
      // WEBGPU_POINT_DEPTH_SKIPPED instead of failing the frame).
      setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_PARITY_LINES: true, A3D_QR_STRICT: true }), f.device);
      for (const clippingPass of ["depth", "shadow"] as const) {
        const pass = new DepthPass({ casters: [{ geometry, material }], clippingPass, checkedSubmission: true,
          globalClipping: { planes: [[1, 0, 0, 0]], clipShadows: true } });
        expect(() => pass.prepare({ device: f.device, width: WIDTH, height: HEIGHT })).toThrow(/WebGPU clipped point depth requires/i);
      }
      expect(geometry.vertexBuffer.hasAttemptedUpload).toBe(false);
      expect(f.submissions).toHaveLength(0);
      f.end();
    } finally { f.close(); geometry.dispose(); material.dispose(); }
  });
});
