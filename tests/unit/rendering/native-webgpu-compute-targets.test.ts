import { describe, expect, it } from "vitest";
import { createComputeContext } from "../../../packages/rendering/src/compute/ComputeContext";
import type { ComputeGPUDeviceLike } from "../../../packages/rendering/src/compute/types";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";

interface MockTexture {
  readonly label: string;
  readonly format: string;
  readonly usage: number;
  readonly sampleCount: number;
  readonly mipLevelCount: number;
  value: unknown;
  destroyed: number;
  createView(descriptor?: object): MockView;
  destroy(): void;
}
interface MockView { readonly texture: MockTexture; readonly descriptor?: object }
interface MockGroup { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }
interface MockCommand { run(): void }
interface MockEvent { readonly kind: string; readonly texture?: MockTexture; readonly value?: unknown; readonly view?: MockView }
interface MockRenderPassDescriptor {
  readonly colorAttachments: readonly { readonly view: MockView; readonly resolveTarget?: MockView; readonly loadOp: string; readonly clearValue?: readonly number[] }[];
  readonly depthStencilAttachment?: { readonly view: MockView; readonly depthLoadOp: string; readonly depthClearValue?: number };
}

const READ_COLOR = `@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@compute @workgroup_size(1) fn main() { let value = textureLoad(inputTexture, vec2<i32>(0, 0), 0); }`;
const READ_DEPTH = `@group(0) @binding(0) var inputTexture: texture_depth_2d;
@compute @workgroup_size(1) fn main() { let value = textureLoad(inputTexture, vec2<i32>(0, 0), 0); }`;
const WRITE_COLOR = `// mock-write-partial
@group(0) @binding(0) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@compute @workgroup_size(1) fn main() { textureStore(outputTexture, vec2<i32>(0, 0), vec4<f32>(1.0)); }`;

/** Queue-shaped source double; it does not compile WGSL or render pixels. */
async function fixture(maxDimension?: number) {
  const events: MockEvent[] = [];
  const textures: MockTexture[] = [];
  let failNextSubmission = false;
  let loseDevice!: () => void;
  const lost = new Promise<{ reason: string }>((resolve) => { loseDevice = () => resolve({ reason: "destroyed" }); });
  const native = {
    features: new Set<string>(), lost,
    queue: {
      submit(commands: readonly MockCommand[]) {
        if (failNextSubmission) { failNextSubmission = false; throw new Error("clear submission failed"); }
        for (const command of commands) command.run();
      },
      writeBuffer() {},
      writeTexture(destination: { texture: MockTexture }, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        destination.texture.value = [...bytes];
        events.push({ kind: "upload", texture: destination.texture, value: [...bytes] });
      },
      onSubmittedWorkDone: async () => {}
    },
    createBuffer: ({ size, usage }: { size: number; usage: number }) => ({ size, usage, destroy() {} }),
    createTexture(descriptor: { label?: string; format: string; usage: number; sampleCount?: number; mipLevelCount?: number }) {
      const texture: MockTexture = {
        label: descriptor.label ?? "", format: descriptor.format, usage: descriptor.usage,
        sampleCount: descriptor.sampleCount ?? 1, mipLevelCount: descriptor.mipLevelCount ?? 1,
        value: "uninitialized", destroyed: 0,
        createView(viewDescriptor) { return { texture, descriptor: viewDescriptor }; },
        destroy() { texture.destroyed += 1; }
      };
      textures.push(texture);
      return texture;
    },
    createShaderModule: ({ code }: { code: string }) => ({ code }),
    createSampler: () => ({}),
    createComputePipeline: ({ compute }: { compute: { module: { code: string } } }) => ({ code: compute.module.code, getBindGroupLayout: () => ({}) }),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}),
    createBindGroup: ({ entries }: { entries: MockGroup["entries"] }): MockGroup => ({ entries }),
    createCommandEncoder() {
      const operations: Array<() => void> = [];
      return {
        beginRenderPass(descriptor: MockRenderPassDescriptor) {
          const groups = new Map<number, MockGroup>();
          for (const attachment of descriptor.colorAttachments) {
            if (attachment.loadOp !== "clear") continue;
            operations.push(() => {
              attachment.view.texture.value = attachment.clearValue;
              if (attachment.resolveTarget) attachment.resolveTarget.texture.value = attachment.clearValue;
              events.push({ kind: "clear-color", texture: attachment.view.texture, value: attachment.clearValue });
            });
          }
          const depth = descriptor.depthStencilAttachment;
          if (depth?.depthLoadOp === "clear") operations.push(() => {
            depth.view.texture.value = depth.depthClearValue;
            events.push({ kind: "clear-depth", texture: depth.view.texture, value: depth.depthClearValue });
          });
          return {
            setPipeline() {}, setVertexBuffer() {}, setBindGroup(index: number, group: MockGroup) { groups.set(index, group); },
            draw() {
              const views = [...groups.values()].flatMap((group) => group.entries.map((entry) => entry.resource as MockView))
                .filter((view) => view?.texture);
              operations.push(() => { for (const view of views) events.push({ kind: "material-sample", texture: view.texture, value: view.texture.value, view }); });
            },
            end() {}
          };
        },
        beginComputePass() {
          let pipeline: { code: string } | undefined;
          const groups = new Map<number, MockGroup>();
          return {
            setPipeline(value: { code: string }) { pipeline = value; },
            setBindGroup(index: number, group: MockGroup) { groups.set(index, group); },
            dispatchWorkgroups() {
              const views = [...groups.values()].flatMap((group) => group.entries.map((entry) => entry.resource as MockView))
                .filter((view) => view?.texture);
              const writes = pipeline?.code.includes("mock-write-partial") === true;
              operations.push(() => {
                for (const view of views) {
                  if (writes) view.texture.value = "partial compute write";
                  events.push({ kind: writes ? "compute-write" : "compute-read", texture: view.texture, value: view.texture.value, view });
                }
              });
            },
            end() {}
          };
        },
        copyBufferToBuffer() {},
        finish(): MockCommand { return { run: () => { for (const operation of operations) operation(); } }; }
      };
    },
    destroy() {}
  };
  const gpu = native as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => gpu }, device: gpu,
    ...(maxDimension === undefined ? {} : { textureBudgetPolicy: { maxDimension } }) });
  const compute = createComputeContext(native as unknown as ComputeGPUDeviceLike, device);
  return { device, compute, native, textures, events, loseDevice, failNext: () => { failNextSubmission = true; } };
}

describe("WebGPU render targets shared with compute", () => {
  it("clears a pending target before material sampling while raw lookup leaves it untouched", async () => {
    const { device, events } = await fixture();
    const input = device.createRenderTarget({ label: "source", width: 2, height: 2, depth: false });
    const output = device.createRenderTarget({ label: "output", width: 2, height: 2, depth: false });
    const raw = device.getNativeTexture(input.colorTexture);
    expect(events).toHaveLength(0);
    expect(device.resourceInterop.submissionSerial).toBe(0);
    const shader = device.createShaderProgram({ label: "target-sample", marker: "target-sample",
      vertex: "// target-sample\nlayout(location=0) in vec3 a_position; void main() {}",
      fragment: "// target-sample\nvoid main() {}", portableBindings: [{ name: "u_image", kind: "texture2d" }],
      webgpu: {
        vertex: "/* @aura3d-bindings */\n@vertex fn main(@location(0) p: vec3<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(p, 1.0); }",
        fragment: "/* @aura3d-bindings */\n@fragment fn main() -> @location(0) vec4<f32> { return textureSample(u_imageTexture, u_imageSampler, vec2<f32>(0.5)); }"
      } });
    const vertices = device.createBuffer("vertex", 36);
    device.beginFrame(2, 2); device.setRenderTarget(output);
    device.draw({ topology: "triangles", vertexBuffer: vertices, vertexFormat: VertexFormat.P3, vertexCount: 3, shader,
      uniforms: new Map([["u_image", new TextureBinding({ name: "u_image", texture: input.colorTexture })]]) });
    expect(events.map((event) => [event.kind, event.texture?.label])).toEqual([
      ["clear-color", "source"], ["clear-color", "output"], ["material-sample", "source"]
    ]);
    expect(events[2]?.texture).toBe(raw);
    expect(events[2]?.value).toEqual([0, 0, 0, 1]);
    device.endFrame(); device.dispose();
  });

  it("does not inject a clear into a raw external write lease", async () => {
    const { device, events } = await fixture();
    const target = device.createRenderTarget({ label: "external", width: 1, height: 1, depth: false });
    device.beginFrame(1, 1); device.setRenderTarget(target);
    const resource = device.getNativeTexture(target.colorTexture) as MockTexture;
    expect(device.resourceInterop.submissionSerial).toBe(0);
    device.resourceInterop.submit([{ run() { resource.value = "external write"; } }], [{ resource, mode: "write" }]);
    device.markNativeRenderSurfaceWritten(target);
    device.setRenderTarget(null);
    expect(events).toHaveLength(0);
    expect(resource.value).toBe("external write");
    device.endFrame(); device.dispose();
  });

  it("submits the queued color and depth clear before compute reads, once per clear", async () => {
    const { device, compute, events } = await fixture();
    const target = device.createRenderTarget({ label: "scene", width: 2, height: 2, depth: "texture" });
    const color = compute.createPipeline({ wgsl: READ_COLOR, bindings: [{ binding: 0, type: "sampled-texture" }] });
    const depth = compute.createPipeline({ wgsl: READ_DEPTH, bindings: [{ binding: 0, type: "sampled-texture", sampleType: "depth" }] });
    device.beginFrame(2, 2);
    device.setRenderTarget(target);
    device.clear([0.2, 0.4, 0.6, 1]);
    compute.dispatch({ pipeline: color, bindings: { 0: target.colorTexture }, workgroups: [1] });
    compute.dispatch({ pipeline: color, bindings: { 0: target.colorTexture }, workgroups: [1] });
    expect(events.map((event) => event.kind)).toEqual(["clear-color", "clear-depth", "compute-read", "compute-read"]);
    expect(events[2]?.value).toEqual([0.2, 0.4, 0.6, 1]);
    device.clear([0.8, 0.1, 0.3, 1]);
    compute.dispatch({ pipeline: depth, bindings: { 0: target.depthTexture! }, workgroups: [1] });
    expect(events.slice(4).map((event) => event.kind)).toEqual(["clear-color", "clear-depth", "compute-read"]);
    expect(events[6]?.value).toBe(1);
    expect(events[6]?.texture?.format).toBe("depth24plus-stencil8");
    expect(events[6]?.view?.descriptor).toEqual({ dimension: "2d", aspect: "depth-only" });
    device.endFrame(); compute.dispose(); device.dispose();
  });

  it("reads the resolved color of a multisampled target and rejects its multisampled depth", async () => {
    const { device, compute, events } = await fixture();
    const target = device.createRenderTarget({ label: "msaa", width: 2, height: 2, sampleCount: 4 });
    const color = compute.createPipeline({ wgsl: READ_COLOR, bindings: [{ binding: 0, type: "sampled-texture" }] });
    compute.dispatch({ pipeline: color, bindings: { 0: target.colorTexture }, workgroups: [1] });
    expect(events.map((event) => event.kind)).toEqual(["clear-color", "clear-depth", "compute-read"]);
    expect(events[0]?.texture?.sampleCount).toBe(4);
    expect(events[2]?.texture?.sampleCount).toBe(1);
    expect(events[2]?.value).toEqual([0, 0, 0, 1]);
    expect(() => device.getNativeComputeTexture(target.multisampledDepthTexture!, "read")).toThrow(/single-sampled depth/);
    compute.dispose(); device.dispose();
  });

  it("preserves and retries an initialization when clear submission or encoding fails", async () => {
    const { device, native, events, failNext } = await fixture();
    const target = device.createRenderTarget({ label: "retry", width: 1, height: 1, depth: false });
    device.beginFrame(1, 1); device.setRenderTarget(target); device.clear([0.3, 0.5, 0.7, 1]);
    failNext();
    expect(() => device.getNativeComputeTexture(target.colorTexture, "read")).toThrow("clear submission failed");
    expect(events).toHaveLength(0);
    const createCommandEncoder = native.createCommandEncoder;
    (native as { createCommandEncoder?: typeof createCommandEncoder }).createCommandEncoder = undefined;
    expect(() => device.getNativeComputeTexture(target.colorTexture, "read")).toThrow(/clear could not be submitted/);
    (native as { createCommandEncoder?: typeof createCommandEncoder }).createCommandEncoder = createCommandEncoder;
    device.getNativeComputeTexture(target.colorTexture, "read");
    expect(events).toMatchObject([{ kind: "clear-color", value: [0.3, 0.5, 0.7, 1] }]);
    device.endFrame(); device.dispose();
  });

  it("keeps write-only storage allocation and prior CPU initialization without a render clear", async () => {
    const { device, compute, events } = await fixture();
    const texture = new Texture({ width: 1, height: 1, usage: ["storage", "copy-dst"], data: new Uint8Array([4, 5, 6, 7]) });
    const pipeline = compute.createPipeline({ wgsl: WRITE_COLOR, bindings: [{ binding: 0, type: "storage-texture", format: "rgba8unorm", access: "write" }] });
    compute.dispatch({ pipeline, bindings: { 0: texture }, workgroups: [1] });
    expect(events.map((event) => event.kind)).toEqual(["upload", "compute-write"]);
    expect(events[0]?.value).toEqual([4, 5, 6, 7]);
    expect(events[1]?.texture).toBe(events[0]?.texture);
    expect(events[1]?.view?.descriptor).toEqual({ dimension: "2d", baseMipLevel: 0, mipLevelCount: 1 });
    compute.dispose(); texture.dispose(); device.dispose();
  });

  it("rejects foreign, disposed, lost, wrongly used, and unowned depth resources", async () => {
    const first = await fixture(), second = await fixture();
    const target = first.device.createRenderTarget({ width: 1, height: 1, depth: "texture" });
    expect(() => second.device.getNativeComputeTexture(target.colorTexture, "read")).toThrow(/another device/);
    expect(() => first.device.getNativeComputeTexture(target.colorTexture, "write")).toThrow(/usage/);
    const unownedDepth = new Texture({ width: 1, height: 1, format: "depth24" });
    expect(() => first.device.getNativeComputeTexture(unownedDepth, "read")).toThrow(/same-device/);
    expect(first.events).toHaveLength(0);
    target.dispose();
    expect(() => first.device.getNativeComputeTexture(target.colorTexture, "read")).toThrow(/disposed/);
    const lostTarget = first.device.createRenderTarget({ width: 1, height: 1 });
    first.loseDevice(); await Promise.resolve();
    expect(() => first.device.getNativeComputeTexture(lostTarget.colorTexture, "read")).toThrow(/context is lost/i);
    first.compute.dispose(); second.compute.dispose(); first.device.dispose(); second.device.dispose(); unownedDepth.dispose();
  });

  it("does not silently shrink a storage texture to meet a sampled texture budget", async () => {
    const { device, textures } = await fixture(2);
    const tooLarge = new Texture({ width: 4, height: 4, usage: ["storage", "copy-dst"], data: new Uint8Array(64) });
    expect(() => device.getNativeComputeTexture(tooLarge, "write")).toThrow(/cannot be downscaled/);
    expect(textures).toHaveLength(0);
    const fits = new Texture({ width: 2, height: 2, usage: ["storage", "copy-dst"] });
    expect(() => device.getNativeComputeTexture(fits, "write")).not.toThrow();
    tooLarge.dispose(); fits.dispose(); device.dispose();
  });

  it("invalidates previously generated target mips while allowing an explicit initialized mip 0", async () => {
    const { device, compute, events } = await fixture();
    const target = device.createRenderTarget({ width: 4, height: 4, mipLevelCount: 2, depth: false });
    device.generateRenderTargetMipmaps(target);
    expect(() => device.getNativeComputeTexture(target.colorTexture, "read")).not.toThrow();
    device.beginFrame(4, 4); device.setRenderTarget(target); device.clear([0.1, 0.2, 0.3, 1]);
    expect(() => device.getNativeComputeTexture(target.colorTexture, "read")).toThrow(/mip chain has not been generated/);
    expect(() => device.getNativeComputeTexture(target.colorTexture, "read", { baseMipLevel: 1, mipLevelCount: 1 })).toThrow(/mip chain has not been generated/);
    expect(() => device.getNativeComputeTexture(target.colorTexture, "read", { baseMipLevel: 0, mipLevelCount: 0 })).toThrow(/mip range is invalid/);
    const pipeline = compute.createPipeline({ wgsl: READ_COLOR, bindings: [{ binding: 0, type: "sampled-texture", mipLevel: 0 }] });
    compute.dispatch({ pipeline, bindings: { 0: target.colorTexture }, workgroups: [1] });
    expect(events.at(-1)).toMatchObject({ kind: "compute-read", value: [0.1, 0.2, 0.3, 1], view: { descriptor: { dimension: "2d", baseMipLevel: 0, mipLevelCount: 1 } } });
    expect(events.filter((event) => event.kind === "clear-color").at(-1)?.value).toEqual([0.1, 0.2, 0.3, 1]);
    device.endFrame(); compute.dispose(); device.dispose();
  });
});
