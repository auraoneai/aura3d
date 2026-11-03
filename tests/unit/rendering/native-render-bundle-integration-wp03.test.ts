import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import type { WebGPUDeviceLike, WebGPULike } from "../../../packages/rendering/src/WebGPUDevice";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { ProductionWebGPURenderer } from "../../../packages/rendering/src/production-runtime/ProductionWebGPURenderer";
import type { NativeRenderBundleRequest } from "../../../packages/rendering/src/production-runtime/NativeRenderBundleCache";
import { GENERATED_UNLIT_MATERIAL_OFFSETS } from "../../../packages/rendering/src/webgpu/GeneratedUnlitProgram";

type Operation = { readonly name: string; readonly args: readonly unknown[] };
type Bundle = { readonly operations: readonly Operation[] };

function recordingEncoder(operations: Operation[]) {
  const add = (name: string, args: readonly unknown[]) => {
    operations.push({ name, args: args.map((value) => Array.isArray(value) ? [...value] : value) });
  };
  return {
    setPipeline: (pipeline: object) => add("setPipeline", [pipeline]),
    setBindGroup: (slot: number, group: object, offsets?: readonly number[]) => add("setBindGroup", [slot, group, offsets]),
    setVertexBuffer: (slot: number, buffer: object, offset?: number, size?: number) => add("setVertexBuffer", [slot, buffer, offset, size]),
    setIndexBuffer: (buffer: object, format: string, offset?: number, size?: number) => add("setIndexBuffer", [buffer, format, offset, size]),
    draw: (...args: number[]) => add("draw", args),
    drawIndexed: (...args: number[]) => add("drawIndexed", args),
    drawIndirect: (buffer: object, offset: number) => add("drawIndirect", [buffer, offset]),
    drawIndexedIndirect: (buffer: object, offset: number) => add("drawIndexedIndirect", [buffer, offset])
  };
}

function createNativeDevice() {
  let validation: () => Promise<unknown | null> = async () => null;
  let throwCapture = false;
  let throwFinish = false;
  const descriptors: unknown[] = [];
  const bundles: Bundle[] = [];
  const native = {
    pushErrorScope: vi.fn((_filter: string) => undefined),
    popErrorScope: vi.fn(() => validation()),
    createRenderBundleEncoder: vi.fn((descriptor: unknown) => {
      descriptors.push(descriptor);
      if (throwCapture) throw new Error("encoder unavailable");
      const operations: Operation[] = [];
      return {
        ...recordingEncoder(operations),
        finish: () => {
          if (throwFinish) throw new Error("finish failed");
          const bundle = { operations } satisfies Bundle;
          bundles.push(bundle);
          return bundle;
        }
      };
    })
  };
  return {
    native,
    descriptors,
    bundles,
    setValidation: (next: () => Promise<unknown | null>) => { validation = next; },
    setCaptureFailure: (next: boolean) => { throwCapture = next; },
    setFinishFailure: (next: boolean) => { throwFinish = next; }
  };
}

function createPass() {
  const events: unknown[][] = [];
  let pipeline: { name: string } | undefined;
  let vertex: { name: string } | undefined;
  let index: { name: string } | undefined;
  let group: { value: number } | undefined;
  let offsets: readonly number[] = [];
  const pass = {
    setPipeline(value: object) { pipeline = value as typeof pipeline; },
    setBindGroup(_slot: number, value: object, dynamicOffsets?: readonly number[]) {
      group = value as typeof group;
      offsets = [...(dynamicOffsets ?? [])];
    },
    setVertexBuffer(_slot: number, value: object) { vertex = value as typeof vertex; },
    setIndexBuffer(value: object) { index = value as typeof index; },
    draw(...args: number[]) {
      events.push(["draw", pipeline?.name, vertex?.name, group?.value, [...offsets], ...args]);
    },
    drawIndexed(...args: number[]) {
      events.push(["drawIndexed", pipeline?.name, vertex?.name, index?.name, group?.value, [...offsets], ...args]);
    },
    drawIndirect(buffer: object, offset: number) {
      events.push(["drawIndirect", pipeline?.name, vertex?.name, buffer, offset]);
    },
    drawIndexedIndirect(buffer: object, offset: number) {
      events.push(["drawIndexedIndirect", pipeline?.name, vertex?.name, index?.name, buffer, offset]);
    },
    setViewport(...args: number[]) { events.push(["viewport", ...args]); },
    setScissorRect(...args: number[]) { events.push(["scissor", ...args]); },
    setBlendConstant(value: readonly number[]) { events.push(["blend", ...value]); },
    setStencilReference(value: number) { events.push(["stencil", value]); },
    end: vi.fn(),
    executeBundles: vi.fn((bundles: readonly Bundle[]) => {
      for (const bundle of bundles) {
        for (const operation of bundle.operations) {
          const method = pass[operation.name as keyof typeof pass] as (...args: never[]) => void;
          method(...operation.args as never[]);
        }
      }
      pipeline = undefined;
      vertex = undefined;
      index = undefined;
      group = undefined;
      offsets = [];
    })
  };
  return { pass, events };
}

interface BundleRequest {
  readonly key: string;
  readonly pass: object;
  readonly passDevice: object;
  readonly descriptor: {
    readonly colorFormats: readonly (string | null)[];
    readonly depthStencilFormat?: string;
    readonly sampleCount?: number;
    readonly depthReadOnly?: boolean;
    readonly stencilReadOnly?: boolean;
  };
  readonly commands: readonly Record<string, unknown>[];
  readonly cacheable?: boolean;
  readonly lifetime?: { readonly revision: object; readonly isValid: () => boolean };
}

interface BundleApi {
  encodeNativeRenderBundle(request: BundleRequest): {
    readonly mode: "bundle" | "direct";
    readonly reason: string;
    readonly requiresStateRebind: true;
  };
  invalidateNativeRenderBundle(key?: string): void;
  dispose(): void;
}

async function createRendererHarness(native = createNativeDevice()) {
  const listeners = new Set<() => void>();
  const device = {
    kind: "webgpu",
    info: { capabilities: ["native-render-pipeline", "native-sampled-textures", "native-texture-readback"] },
    generation: 1,
    disposed: false,
    contextLost: false,
    nativeGpuDevice: native.native as object,
    readPixelsAsync: vi.fn(),
    onDeviceLost(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
  const core = {
    device,
    dispose: vi.fn(() => { device.disposed = true; })
  };
  vi.spyOn(Renderer, "create").mockResolvedValue(core as never);
  const renderer = await ProductionWebGPURenderer.create({ width: 16, height: 16 }) as unknown as BundleApi;
  return {
    renderer,
    native,
    device,
    listeners,
    core,
    lose() {
      device.contextLost = true;
      for (const listener of [...listeners]) listener();
    }
  };
}

function request(native: object, pass: object): BundleRequest {
  const pipeline = { name: "pipeline-a" };
  const vertex = { name: "vertices-a" };
  const index = { name: "indices-a" };
  const group = { value: 7 };
  return {
    key: "main/opaque",
    pass,
    passDevice: native,
    descriptor: { colorFormats: ["rgba8unorm"], depthStencilFormat: "depth24plus", sampleCount: 1 },
    commands: [
      { kind: "set-pipeline", pipeline },
      { kind: "set-vertex-buffer", slot: 0, buffer: vertex, offset: 16, size: 96 },
      { kind: "set-bind-group", slot: 0, group, dynamicOffsets: [256] },
      { kind: "draw", vertexCount: 3, instanceCount: 2, firstVertex: 1, firstInstance: 4 },
      { kind: "set-index-buffer", buffer: index, format: "uint16", offset: 4, size: 12 },
      { kind: "draw-indexed", indexCount: 6, instanceCount: 1, firstIndex: 2, baseVertex: -1, firstInstance: 3 }
    ],
    cacheable: true,
    lifetime: { revision: {}, isValid: () => true }
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => vi.restoreAllMocks());

describe("native render-bundle production integration", () => {
  it.each([false, true])("preserves public forward draw order and per-draw updates across frames (async=%s)", async asynchronous => {
    type Buffer = { readonly label: string; readonly bytes: Uint8Array; destroy(): void; mapAsync(): Promise<void>; getMappedRange(): ArrayBuffer; unmap(): void };
    type Group = { readonly entries: readonly { readonly binding: number; readonly resource: { readonly buffer?: Buffer } }[] };
    type Draw = { readonly label: string; readonly color: readonly number[] };
    const bundle = createNativeDevice();
    const events: string[] = [];
    const submitted: Draw[] = [];
    const native = {
      ...bundle.native,
      features: new Set<string>(),
      limits: { maxBufferSize: 1_000_000, maxVertexBuffers: 8 },
      queue: {
        writeBuffer(buffer: Buffer, offset: number, data: ArrayBuffer | ArrayBufferView) {
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          buffer.bytes.set(bytes, offset);
        },
        writeTexture() {},
        submit(commands: readonly { readonly draws: readonly Draw[] }[]) {
          for (const command of commands) for (const draw of command.draws) {
            events.push(`submit:${draw.label}`);
            submitted.push(draw);
          }
        },
        onSubmittedWorkDone: async () => undefined
      },
      createBuffer(descriptor: { readonly label?: string; readonly size: number }): Buffer {
        const data = new ArrayBuffer(descriptor.size);
        return { label: descriptor.label ?? "", bytes: new Uint8Array(data), destroy() {}, async mapAsync() {}, getMappedRange: () => data, unmap() {} };
      },
      createTexture: () => ({ createView: () => ({}), destroy() {} }),
      createSampler: () => ({}),
      createShaderModule: (descriptor: object) => descriptor,
      createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
      createBindGroup: (descriptor: Group) => descriptor,
      createCommandEncoder() {
        const draws: Draw[] = [];
        return {
          copyTextureToBuffer() {},
          beginRenderPass(descriptor: { readonly label?: string }) {
            let group: Group | undefined;
            const pass = {
              setPipeline() {},
              setBindGroup(slot: number, value: Group) { if (slot === 0) group = value; },
              setVertexBuffer() {},
              setIndexBuffer() {},
              setViewport() {},
              setScissorRect() {},
              setBlendConstant() {},
              setStencilReference() {},
              draw() {
                const buffer = group?.entries.find(entry => entry.binding === 0)?.resource.buffer;
                if (!buffer) throw new Error("missing material buffer");
                const view = new DataView(buffer.bytes.buffer, buffer.bytes.byteOffset, buffer.bytes.byteLength);
                const offset = GENERATED_UNLIT_MATERIAL_OFFSETS.baseColor!;
                draws.push({ label: descriptor.label ?? "", color: [0, 1, 2, 3].map(index => view.getFloat32(offset + index * 4, true)) });
              },
              drawIndexed() { this.draw(); },
              executeBundles(bundles: readonly Bundle[]) {
                for (const entry of bundles) for (const operation of entry.operations) {
                  const method = pass[operation.name as keyof typeof pass] as (...args: never[]) => void;
                  method.apply(pass, operation.args as never[]);
                }
              },
              end() {}
            };
            return pass;
          },
          finish: () => ({ draws })
        };
      },
      destroy() {}
    } as unknown as WebGPUDeviceLike;
    const gpu = { requestAdapter: async () => ({ requestDevice: async () => native }), getPreferredCanvasFormat: () => "bgra8unorm" } as WebGPULike;
    const context = { configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) };
    const canvas = { width: 8, height: 8, getContext: () => context } as unknown as HTMLCanvasElement;
    const renderer = await ProductionWebGPURenderer.create({
      canvas, webgpu: gpu, width: 8, height: 8,
      qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false })
    });
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial();
    let frame = 0;
    const source = {
      cameraPolicy: "identity" as const,
      frustumCulling: false,
      shadow: { enabled: false },
      renderItems: [
        { label: "second", geometry, material, renderOrder: 2, onBeforeRender: () => {
          events.push("before:second");
          material.color = frame === 0 ? [0, 1, 0, 1] : [0, 0.5, 0, 1];
        } },
        { label: "first", geometry, material, renderOrder: 1, onBeforeRender: () => {
          events.push("before:first");
          material.color = frame === 0 ? [1, 0, 0, 1] : [0.25, 0, 0, 1];
        } }
      ]
    };
    const input = { source, metadata: {
      assetId: "fixture", assetUri: "fixture", meshCount: 2, primitiveCount: 2, materialCount: 1,
      textureCount: 0, imageCount: 0, animationCount: 0, skinCount: 0, morphTargetCount: 0, extensionsUsed: []
    } };
    try {
      if (asynchronous) await renderer.renderFrameAsync(input); else renderer.renderFrame(input);
      frame = 1;
      if (asynchronous) await renderer.renderFrameAsync(input); else renderer.renderFrame(input);
      expect(events).toEqual([
        "before:first", "submit:first-pass", "before:second", "submit:second-pass",
        "before:first", "submit:first-pass", "before:second", "submit:second-pass"
      ]);
      expect(submitted.map(draw => draw.color)).toEqual([
        [1, 0, 0, 1], [0, 1, 0, 1], [0.25, 0, 0, 1], [0, 0.5, 0, 1]
      ]);
    } finally {
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    }
  });

  it("records real native-shaped commands, draws directly while validation is pending, then reuses the validated bundle", async () => {
    const h = await createRendererHarness();
    const first = createPass();
    const base = request(h.native.native, first.pass);
    expect(h.renderer.encodeNativeRenderBundle(base)).toMatchObject({ mode: "direct", reason: "validation-pending", requiresStateRebind: true });
    expect(first.events).toEqual([
      ["draw", "pipeline-a", "vertices-a", 7, [256], 3, 2, 1, 4],
      ["drawIndexed", "pipeline-a", "vertices-a", "indices-a", 7, [256], 6, 1, 2, -1, 3]
    ]);
    expect(h.native.descriptors).toEqual([{ colorFormats: ["rgba8unorm"], depthStencilFormat: "depth24plus", sampleCount: 1 }]);
    expect(h.native.bundles[0]?.operations).toMatchObject([
      { name: "setPipeline" },
      { name: "setVertexBuffer", args: [0, base.commands[1]!.buffer, 16, 96] },
      { name: "setBindGroup", args: [0, base.commands[2]!.group, [256]] },
      { name: "draw", args: [3, 2, 1, 4] },
      { name: "setIndexBuffer", args: [base.commands[4]!.buffer, "uint16", 4, 12] },
      { name: "drawIndexed", args: [6, 1, 2, -1, 3] }
    ]);
    expect(h.native.native.pushErrorScope).toHaveBeenCalledWith("validation");
    expect(h.native.native.popErrorScope).toHaveBeenCalledTimes(1);
    await settle();
    (base.commands[2]!.group as { value: number }).value = 11;
    const second = createPass();
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: second.pass })).toMatchObject({ mode: "bundle", requiresStateRebind: true });
    expect(second.pass.executeBundles).toHaveBeenCalledTimes(1);
    expect(second.events).toEqual([
      ["draw", "pipeline-a", "vertices-a", 11, [256], 3, 2, 1, 4],
      ["drawIndexed", "pipeline-a", "vertices-a", "indices-a", 11, [256], 6, 1, 2, -1, 3]
    ]);
    expect(h.native.native.createRenderBundleEncoder).toHaveBeenCalledTimes(1);
    h.renderer.dispose();
  });

  it("invalidates captured state for changed offsets, draw counts, formats, sample counts, lifetime revisions and explicit invalidation", async () => {
    const h = await createRendererHarness();
    const base = request(h.native.native, createPass().pass);
    h.renderer.encodeNativeRenderBundle(base);
    await settle();
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: createPass().pass }).mode).toBe("bundle");
    const offsets = base.commands[2]!.dynamicOffsets as number[];
    offsets[0] = 512;
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: createPass().pass }).mode).toBe("direct");
    await settle();
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: createPass().pass }).mode).toBe("bundle");
    const changedDraw = base.commands.map((command, i) => i === 3 ? { ...command, vertexCount: 9 } : command);
    expect(h.renderer.encodeNativeRenderBundle({ ...base, commands: changedDraw, pass: createPass().pass }).mode).toBe("direct");
    await settle();
    const changedFormat = { ...base.descriptor, colorFormats: ["bgra8unorm"], sampleCount: 4 };
    expect(h.renderer.encodeNativeRenderBundle({ ...base, commands: changedDraw, descriptor: changedFormat, pass: createPass().pass }).mode).toBe("direct");
    await settle();
    expect(h.renderer.encodeNativeRenderBundle({ ...base, commands: changedDraw, descriptor: changedFormat, lifetime: { revision: {}, isValid: () => true }, pass: createPass().pass }).mode).toBe("direct");
    await settle();
    h.renderer.invalidateNativeRenderBundle(base.key);
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: createPass().pass }).mode).toBe("direct");
    expect(h.native.native.createRenderBundleEncoder).toHaveBeenCalledTimes(6);
    h.renderer.dispose();
  });

  it("does not record dynamic pass state or untracked resources and falls back in original order", async () => {
    const h = await createRendererHarness();
    const direct = createPass();
    const base = request(h.native.native, direct.pass);
    const commands = [
      { kind: "set-viewport", x: 1, y: 2, width: 10, height: 11, minDepth: 0.1, maxDepth: 0.9 },
      ...base.commands.slice(0, 3),
      { kind: "set-scissor-rect", x: 2, y: 3, width: 8, height: 9 },
      { kind: "set-blend-constant", color: [0.1, 0.2, 0.3, 0.4] },
      { kind: "set-stencil-reference", reference: 5 },
      ...base.commands.slice(3)
    ];
    expect(h.renderer.encodeNativeRenderBundle({ ...base, commands })).toMatchObject({ mode: "direct", reason: "dynamic-state" });
    expect(direct.events.slice(0, 5)).toEqual([
      ["viewport", 1, 2, 10, 11, 0.1, 0.9],
      ["scissor", 2, 3, 8, 9],
      ["blend", 0.1, 0.2, 0.3, 0.4],
      ["stencil", 5],
      ["draw", "pipeline-a", "vertices-a", 7, [256], 3, 2, 1, 4]
    ]);
    const untracked = createPass();
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: untracked.pass, lifetime: undefined })).toMatchObject({ mode: "direct", reason: "untracked-resources" });
    expect(untracked.events).toHaveLength(2);
    const disabled = createPass();
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: disabled.pass, cacheable: false })).toMatchObject({ mode: "direct", reason: "disabled" });
    expect(disabled.events).toHaveLength(2);
    expect(h.native.native.createRenderBundleEncoder).not.toHaveBeenCalled();
    h.renderer.dispose();
  });

  it("quarantines rejected captures without retrying each frame and balances error scopes on synchronous failure", async () => {
    const h = await createRendererHarness();
    const base = request(h.native.native, createPass().pass);
    h.native.setValidation(async () => ({ message: "bad render pipeline" }));
    h.renderer.encodeNativeRenderBundle(base);
    await settle();
    const failed = createPass();
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: failed.pass })).toMatchObject({ mode: "direct", reason: "validation-failed" });
    expect(failed.events).toHaveLength(2);
    expect(h.native.native.createRenderBundleEncoder).toHaveBeenCalledTimes(1);
    h.renderer.invalidateNativeRenderBundle(base.key);
    h.native.setCaptureFailure(true);
    const captureFailed = createPass();
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: captureFailed.pass })).toMatchObject({ mode: "direct", reason: "capture-failed" });
    expect(captureFailed.events).toHaveLength(2);
    expect(h.native.native.pushErrorScope).toHaveBeenCalledTimes(2);
    expect(h.native.native.popErrorScope).toHaveBeenCalledTimes(2);
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: createPass().pass })).toMatchObject({ mode: "direct", reason: "capture-failed" });
    expect(h.native.native.createRenderBundleEncoder).toHaveBeenCalledTimes(2);
    h.renderer.dispose();
  });

  it("keeps pending capture single-flight, isolates keys, and ignores stale validation after loss or generation replacement", async () => {
    const h = await createRendererHarness();
    let resolveValidation!: (value: unknown | null) => void;
    h.native.setValidation(() => new Promise((resolve) => { resolveValidation = resolve; }));
    const base = request(h.native.native, createPass().pass);
    expect(h.renderer.encodeNativeRenderBundle(base).mode).toBe("direct");
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: createPass().pass }).mode).toBe("direct");
    expect(h.native.native.createRenderBundleEncoder).toHaveBeenCalledTimes(1);
    h.lose();
    resolveValidation(null);
    await settle();
    expect(() => h.renderer.encodeNativeRenderBundle({ ...base, pass: createPass().pass })).toThrow(/device.*(lost|unavailable)/i);
    const replacement = createNativeDevice();
    h.device.nativeGpuDevice = replacement.native;
    h.device.generation += 1;
    h.device.contextLost = false;
    const next = { ...base, passDevice: replacement.native, pass: createPass().pass };
    expect(h.renderer.encodeNativeRenderBundle(next).mode).toBe("direct");
    await settle();
    expect(h.renderer.encodeNativeRenderBundle({ ...next, pass: createPass().pass }).mode).toBe("bundle");
    expect(h.renderer.encodeNativeRenderBundle({ ...next, key: "other/view", pass: createPass().pass }).mode).toBe("direct");
    expect(replacement.native.createRenderBundleEncoder).toHaveBeenCalledTimes(2);
    h.renderer.dispose();
    expect(h.listeners.size).toBe(0);
    expect(h.core.dispose).toHaveBeenCalledTimes(1);
    expect(() => h.renderer.encodeNativeRenderBundle({ ...next, pass: createPass().pass })).toThrow(/disposed/i);
  });

  it("rejects foreign devices and stale resource leases before recording or drawing", async () => {
    const h = await createRendererHarness();
    const first = createPass();
    const base = request(h.native.native, first.pass);
    expect(() => h.renderer.encodeNativeRenderBundle({ ...base, passDevice: {} })).toThrow(/device/i);
    expect(() => h.renderer.encodeNativeRenderBundle({ ...base, lifetime: { revision: {}, isValid: () => false } })).toThrow(/resource/i);
    expect(first.events).toEqual([]);
    expect(h.native.native.createRenderBundleEncoder).not.toHaveBeenCalled();
    let checks = 0;
    expect(() => h.renderer.encodeNativeRenderBundle({ ...base, lifetime: { revision: {}, isValid: () => ++checks === 1 } })).toThrow(/resource/i);
    expect(first.events).toEqual([]);
    expect(h.native.native.pushErrorScope).toHaveBeenCalledTimes(1);
    expect(h.native.native.popErrorScope).toHaveBeenCalledTimes(1);
    h.renderer.dispose();
  });

  it("does not replay directly if executing a validated bundle may already have touched the pass", async () => {
    const h = await createRendererHarness();
    const base = request(h.native.native, createPass().pass);
    h.renderer.encodeNativeRenderBundle(base);
    await settle();
    const pass = createPass();
    pass.pass.executeBundles.mockImplementation(() => { throw new Error("execute failed"); });
    expect(() => h.renderer.encodeNativeRenderBundle({ ...base, pass: pass.pass })).toThrow("execute failed");
    expect(pass.events).toEqual([]);
    h.renderer.dispose();
  });

  it("uses the native device requested by the actual renderer factory, not an independently constructed backend", async () => {
    const mock = createNativeDevice();
    const frame = createPass();
    const submissions: unknown[][] = [];
    const native = Object.assign(mock.native, {
      queue: {
        writeBuffer() {},
        writeTexture() {},
        submit(commands: unknown[]) { submissions.push(commands); },
        onSubmittedWorkDone: async () => undefined
      },
      createBuffer({ size }: { size: number }) {
        const bytes = new ArrayBuffer(size);
        return { mapAsync: async () => undefined, getMappedRange: () => bytes, unmap() {}, destroy() {} };
      },
      createTexture: () => ({ createView: () => ({}), destroy() {} }),
      createSampler: () => ({}),
      createShaderModule: () => ({}),
      createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
      createBindGroup: () => ({}),
      createCommandEncoder: () => ({
        beginRenderPass: () => frame.pass,
        copyTextureToBuffer() {},
        finish: () => ({ frame: submissions.length })
      }),
      destroy: vi.fn()
    });
    const requestDevice = vi.fn(async () => native);
    const webgpu = { requestAdapter: async () => ({ requestDevice }) };
    const renderer = await ProductionWebGPURenderer.create({ width: 16, height: 16, webgpu: webgpu as never });
    const commandEncoder = native.createCommandEncoder();
    const pass = commandEncoder.beginRenderPass();
    const base = {
      key: "actual-device",
      pass,
      passDevice: native,
      descriptor: { colorFormats: ["rgba8unorm"] },
      commands: [
        { kind: "set-pipeline", pipeline: { name: "actual-pipeline" } },
        { kind: "set-vertex-buffer", slot: 0, buffer: { name: "actual-buffer" } },
        { kind: "draw", vertexCount: 3 }
      ],
      cacheable: true,
      lifetime: { revision: {}, isValid: () => true }
    } satisfies NativeRenderBundleRequest;
    expect(renderer.encodeNativeRenderBundle(base).mode).toBe("direct");
    pass.end();
    native.queue.submit([commandEncoder.finish()]);
    await settle();
    const second = createPass();
    expect(renderer.encodeNativeRenderBundle({ ...base, pass: second.pass }).mode).toBe("bundle");
    expect(second.events).toEqual([["draw", "actual-pipeline", "actual-buffer", undefined, [], 3, 1, 0, 0]]);
    expect(requestDevice).toHaveBeenCalledTimes(1);
    expect(submissions).toHaveLength(1);
    renderer.dispose();
    expect(native.destroy).toHaveBeenCalledTimes(1);
  });

  it("uses deterministic direct encoding when bundle methods or complete inherited state are unavailable", async () => {
    const h = await createRendererHarness();
    const base = request(h.native.native, createPass().pass);
    const noBundles = createPass();
    const directPass = { ...noBundles.pass, executeBundles: undefined };
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: directPass })).toMatchObject({ mode: "direct", reason: "unsupported" });
    expect(noBundles.events).toHaveLength(2);
    expect(h.native.native.createRenderBundleEncoder).not.toHaveBeenCalled();
    const inherited = createPass();
    inherited.pass.setPipeline({ name: "inherited" });
    expect(h.renderer.encodeNativeRenderBundle({
      ...base,
      pass: inherited.pass,
      commands: [{ kind: "draw", vertexCount: 3 }]
    })).toMatchObject({ mode: "direct", reason: "incomplete-state" });
    expect(inherited.events[0]?.slice(0, 2)).toEqual(["draw", "inherited"]);
    h.native.setFinishFailure(true);
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: createPass().pass })).toMatchObject({ mode: "direct", reason: "capture-failed" });
    expect(h.native.native.pushErrorScope).toHaveBeenCalledTimes(1);
    expect(h.native.native.popErrorScope).toHaveBeenCalledTimes(1);
    h.renderer.dispose();
  });

  it("cannot resurrect an older validation after a newer command snapshot has replaced it", async () => {
    const h = await createRendererHarness();
    const resolutions: Array<(value: unknown | null) => void> = [];
    h.native.setValidation(() => new Promise((resolve) => { resolutions.push(resolve); }));
    const base = request(h.native.native, createPass().pass);
    h.renderer.encodeNativeRenderBundle(base);
    const newer = {
      ...base,
      commands: base.commands.map((command, index) => index === 3 ? { ...command, vertexCount: 10 } : command)
    };
    h.renderer.encodeNativeRenderBundle({ ...newer, pass: createPass().pass });
    resolutions[0]!(null);
    await settle();
    const waiting = createPass();
    expect(h.renderer.encodeNativeRenderBundle({ ...newer, pass: waiting.pass })).toMatchObject({ mode: "direct", reason: "validation-pending" });
    expect(waiting.events[0]?.[5]).toBe(10);
    resolutions[1]!(null);
    await settle();
    const accepted = createPass();
    expect(h.renderer.encodeNativeRenderBundle({ ...newer, pass: accepted.pass }).mode).toBe("bundle");
    expect(accepted.events[0]?.[5]).toBe(10);
    expect(h.native.native.createRenderBundleEncoder).toHaveBeenCalledTimes(2);
    h.renderer.dispose();
  });

  it("retains indirect GPU arguments in native order and invalidates when the device generation changes mid-capture", async () => {
    const h = await createRendererHarness();
    const pass = createPass();
    const base = request(h.native.native, pass.pass);
    const indirect = { name: "gpu-arguments" };
    const commands = [
      ...base.commands.slice(0, 3),
      { kind: "draw-indirect", buffer: indirect, offset: 16 },
      base.commands[4]!,
      { kind: "draw-indexed-indirect", buffer: indirect, offset: 32 }
    ];
    h.renderer.encodeNativeRenderBundle({ ...base, commands });
    expect(pass.events).toEqual([
      ["drawIndirect", "pipeline-a", "vertices-a", indirect, 16],
      ["drawIndexedIndirect", "pipeline-a", "vertices-a", "indices-a", indirect, 32]
    ]);
    await settle();
    const second = createPass();
    expect(h.renderer.encodeNativeRenderBundle({ ...base, commands, pass: second.pass }).mode).toBe("bundle");
    expect(second.events).toEqual(pass.events);
    h.renderer.invalidateNativeRenderBundle(base.key);
    let checks = 0;
    const unstable = {
      revision: {},
      isValid: () => {
        checks += 1;
        if (checks === 2) h.device.generation += 1;
        return true;
      }
    };
    const rejected = createPass();
    expect(() => h.renderer.encodeNativeRenderBundle({ ...base, commands, pass: rejected.pass, lifetime: unstable })).toThrow(/device.*(changed|unavailable)/i);
    expect(rejected.events).toEqual([]);
    h.renderer.dispose();
  });

  it("bounds cached entries and evicts the least recently used key without losing a live view's bundle", async () => {
    const h = await createRendererHarness();
    const base = request(h.native.native, createPass().pass);
    for (let i = 0; i < 64; i += 1) {
      h.renderer.encodeNativeRenderBundle({ ...base, key: `view/${i}`, pass: createPass().pass });
    }
    await settle();
    expect(h.renderer.encodeNativeRenderBundle({ ...base, key: "view/0", pass: createPass().pass }).mode).toBe("bundle");
    h.renderer.encodeNativeRenderBundle({ ...base, key: "view/64", pass: createPass().pass });
    await settle();
    expect(h.renderer.encodeNativeRenderBundle({ ...base, key: "view/0", pass: createPass().pass }).mode).toBe("bundle");
    expect(h.renderer.encodeNativeRenderBundle({ ...base, key: "view/1", pass: createPass().pass }).mode).toBe("direct");
    expect(h.native.native.createRenderBundleEncoder).toHaveBeenCalledTimes(66);
    h.renderer.dispose();
  });

  it("does not register a new loss listener when bundle access first happens after disposal or loss", async () => {
    const h = await createRendererHarness();
    const base = request(h.native.native, createPass().pass);
    h.renderer.dispose();
    expect(() => h.renderer.encodeNativeRenderBundle(base)).toThrow(/disposed/i);
    expect(h.listeners.size).toBe(0);
    h.device.disposed = false;
    h.device.contextLost = true;
    expect(() => h.renderer.encodeNativeRenderBundle(base)).toThrow(/device.*(lost|unavailable)/i);
    expect(h.listeners.size).toBe(0);
  });

  it("falls back without capture if validation scopes are absent, and quarantines rejected validation promises", async () => {
    const h = await createRendererHarness();
    const missingScopes = { ...h.native.native, pushErrorScope: undefined };
    h.device.nativeGpuDevice = missingScopes;
    h.device.generation += 1;
    const fallback = createPass();
    const base = request(missingScopes, fallback.pass);
    expect(h.renderer.encodeNativeRenderBundle(base)).toMatchObject({ mode: "direct", reason: "unsupported" });
    expect(fallback.events).toHaveLength(2);
    expect(h.native.native.createRenderBundleEncoder).not.toHaveBeenCalled();
    h.device.nativeGpuDevice = h.native.native;
    h.device.generation += 1;
    h.native.setValidation(() => Promise.reject(new Error("validation unavailable")));
    const tracked = { ...base, passDevice: h.native.native, pass: createPass().pass };
    expect(h.renderer.encodeNativeRenderBundle(tracked)).toMatchObject({ mode: "direct", reason: "validation-pending" });
    await settle();
    expect(h.renderer.encodeNativeRenderBundle({ ...tracked, pass: createPass().pass })).toMatchObject({ mode: "direct", reason: "validation-failed" });
    expect(h.native.native.createRenderBundleEncoder).toHaveBeenCalledTimes(1);
    h.renderer.dispose();
  });

  it("does not repeatedly read the native-device getter while a renderer frame may own depth-of-field state", async () => {
    const h = await createRendererHarness();
    const base = request(h.native.native, createPass().pass);
    let reads = 0;
    Object.defineProperty(h.device, "nativeGpuDevice", {
      configurable: true,
      get() {
        reads += 1;
        return h.native.native;
      }
    });
    h.renderer.encodeNativeRenderBundle(base);
    await settle();
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: createPass().pass }).mode).toBe("bundle");
    expect(reads).toBe(0);
    h.device.generation += 1;
    expect(h.renderer.encodeNativeRenderBundle({ ...base, pass: createPass().pass }).mode).toBe("direct");
    expect(reads).toBe(1);
    h.renderer.dispose();
  });

  it("releases a renderer whose native device accessor fails without hiding the original failure", async () => {
    const failure = new Error("native device unavailable");
    const dispose = vi.fn(() => { throw new Error("cleanup failed"); });
    const device = {
      kind: "webgpu",
      info: { capabilities: ["native-render-pipeline", "native-sampled-textures", "native-texture-readback"] },
      readPixelsAsync: vi.fn(),
      get nativeGpuDevice(): object { throw failure; }
    };
    vi.spyOn(Renderer, "create").mockResolvedValue({ device, dispose } as never);
    await expect(ProductionWebGPURenderer.create({ width: 16, height: 16 })).rejects.toBe(failure);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed descriptors and commands before changing pass state or opening an error scope", async () => {
    const h = await createRendererHarness();
    const pass = createPass();
    const base = request(h.native.native, pass.pass);
    const sparse = new Array(1) as (string | null)[];
    expect(() => h.renderer.encodeNativeRenderBundle({ ...base, descriptor: { colorFormats: sparse } })).toThrow(/format/i);
    expect(() => h.renderer.encodeNativeRenderBundle({ ...base, commands: [...base.commands, { kind: "draw", vertexCount: -1 }] })).toThrow(/vertexCount/i);
    expect(() => h.renderer.encodeNativeRenderBundle({ ...base, commands: [{ kind: "set-bind-group", slot: 0, group: {}, dynamicOffsets: [NaN] }] })).toThrow(/dynamic offset/i);
    expect(pass.events).toEqual([]);
    expect(h.native.native.pushErrorScope).not.toHaveBeenCalled();
    h.renderer.dispose();
  });

  it("keys bundles by all attachment compatibility fields and native pipeline identity", async () => {
    const h = await createRendererHarness();
    const base = request(h.native.native, createPass().pass);
    const descriptor = {
      colorFormats: ["rgba8unorm", null, "rgba16float"],
      depthStencilFormat: "depth24plus-stencil8",
      sampleCount: 4,
      depthReadOnly: true,
      stencilReadOnly: true
    };
    h.renderer.encodeNativeRenderBundle({ ...base, descriptor });
    expect(h.native.descriptors[0]).toEqual(descriptor);
    await settle();
    expect(h.renderer.encodeNativeRenderBundle({ ...base, descriptor, pass: createPass().pass }).mode).toBe("bundle");
    const writableDepth = { ...descriptor, depthReadOnly: false };
    expect(h.renderer.encodeNativeRenderBundle({ ...base, descriptor: writableDepth, pass: createPass().pass }).mode).toBe("direct");
    await settle();
    const writableStencil = { ...writableDepth, stencilReadOnly: false };
    expect(h.renderer.encodeNativeRenderBundle({ ...base, descriptor: writableStencil, pass: createPass().pass }).mode).toBe("direct");
    await settle();
    const changedPipeline = base.commands.map((command, index) => index === 0 ? { ...command, pipeline: { name: "new-pipeline" } } : command);
    expect(h.renderer.encodeNativeRenderBundle({ ...base, descriptor: writableStencil, commands: changedPipeline, pass: createPass().pass }).mode).toBe("direct");
    expect(h.native.native.createRenderBundleEncoder).toHaveBeenCalledTimes(4);
    h.renderer.dispose();
  });
});
