import { afterEach, describe, expect, it, vi } from "vitest";

import { Geometry } from "../../../packages/rendering/src/Geometry";
import { InstancedPBRMaterial } from "../../../packages/rendering/src/InstancedPBRMaterial";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice, type RenderTargetDescriptor, type RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { resourceDisposalPending } from "../../../packages/rendering/src/ResourceLifecycle";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { renderTargetPoolSlot, type RenderTargetPoolLike } from "../../../packages/rendering/src/contracts/device";
import { prd11RenderTargetPoolFor } from "../../../packages/rendering/src/lanes/prd11";
import { WebGPURendererBackend } from "../../../packages/rendering/src/production-runtime/backends/WebGPURendererBackend";
import { batchPlanCacheFor } from "../../../packages/rendering/src/renderer/CullingBatching";
import type { TargetPoolLease } from "../../../packages/rendering/src/resources/RenderTargetPoolLease";

/** Pool acquire descriptor → device descriptor; the renderer only pools color formats. */
function poolTargetDescriptor(desc: Parameters<RenderTargetPoolLike["acquire"]>[0]): RenderTargetDescriptor {
  const { format } = desc;
  if (format !== "rgba8" && format !== "rgba16f" && format !== "rgba32f") throw new Error(`pooled target format ${format} is not a color target format`);
  return { ...desc, format, sampleCount: desc.samples };
}

const flags = createTrustedQrFlags({ A3D_QR_TIERS: true });
const planFlags = createTrustedQrFlags({});
const chain = { execution: "cpu-deterministic", chromaticAberration: true, filmGrain: true } as const;
const descriptor = { width: 2, height: 2, format: "rgba8", samples: 1, depth: false } as const;

function caught(action: () => unknown): unknown {
  try { action(); } catch (error) { return error; }
  throw new Error("Expected an error");
}

function leaves(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors.flatMap(leaves) : [error];
}

async function flush(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function renderer(device: RenderDevice): Renderer {
  return new Renderer(device, {
    width: 2, height: 2, qrFlags: flags, shaderLibrary: createLeanCoreShaderLibrary()
  }, new TemporalHistory());
}

// Exercise shared-device and in-flight renderer ownership without creating
// another device; normal construction is covered by nativeBackend().
function wrapRenderer(owner: Renderer): WebGPURendererBackend {
  const Backend = WebGPURendererBackend as unknown as new (owner: Renderer, width: number, height: number) => WebGPURendererBackend;
  return new Backend(owner, 2, 2);
}

async function nativeBackend() {
  // Exercise the actual renderer and WebGPUDevice with a fake native GPU.
  let lose!: (info: { reason: string; message: string }) => void;
  const lost = new Promise<{ reason: string; message: string }>(resolve => { lose = resolve; });
  const native = {
    lost,
    features: new Set<string>(),
    queue: { writeBuffer() {}, writeTexture() {}, submit() {}, onSubmittedWorkDone: () => Promise.resolve() },
    createBuffer: () => ({ destroy: vi.fn() }),
    createTexture: () => ({ destroy: vi.fn(), createView: () => ({}) }),
    createSampler: () => ({}),
    createShaderModule: () => ({}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroup: () => ({}),
    createCommandEncoder: () => ({
      beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, draw() {}, end() {} }),
      finish: () => ({})
    }),
    destroy: vi.fn()
  };
  const backend = await WebGPURendererBackend.create({
    width: 2,
    height: 2,
    shaderLibrary: createLeanCoreShaderLibrary(),
    webgpu: { requestAdapter: async () => ({ requestDevice: async () => native as unknown as WebGPUDeviceLike }) }
  });
  return { backend, native, device: backend.renderer.device as WebGPUDevice, lose };
}

function batch(owner: object, geometry: Geometry, material: PBRMaterial): InstancedPBRMaterial {
  const items = [{ geometry, material }, { geometry, material }];
  return batchPlanCacheFor(owner).apply(items, { flags: planFlags, multiDraw: false })[0]!.material as InstancedPBRMaterial;
}

afterEach(() => vi.restoreAllMocks());

describe("WebGPU backend disposal retry", () => {
  it("closes the backend and retains an uncertain native destruction until confirmed loss", async () => {
    const { backend, device, native, lose } = await nativeBackend();
    const buffer = device.createBuffer("vertex", 16);
    const bufferDispose = vi.spyOn(buffer, "dispose");
    const rendererDispose = vi.spyOn(backend.renderer, "dispose");
    const firstFailure = new Error("first native destroy");
    let nestedResult: unknown, nestedRender: unknown, nestedCalls = 0;
    native.destroy.mockImplementationOnce(() => {
      nestedResult = backend.dispose();
      nestedRender = caught(() => backend.render({ renderItems: [] }));
      nestedCalls = rendererDispose.mock.calls.length;
      throw firstFailure;
    });

    try {
      const first = caught(() => backend.dispose()) as AggregateError;
      expect(first).toBeInstanceOf(AggregateError);
      expect(first.cause).toBe(first.errors[0]);
      expect(leaves(first)).toContain(firstFailure);
      expect(nestedResult).toBeUndefined();
      expect(nestedRender).toMatchObject({ message: expect.stringContaining("WEBGPU_BACKEND_DISPOSED") });
      expect(nestedCalls).toBe(1);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(backend.getDiagnostics().realDevice).toBe(false);
      expect(() => backend.render({ renderItems: [] })).toThrow("WEBGPU_BACKEND_DISPOSED");
      expect(() => backend.renderAsync({ renderItems: [] })).toThrow("WEBGPU_BACKEND_DISPOSED");
      expect(() => backend.renderFrame({ source: { renderItems: [] } } as never)).toThrow("WEBGPU_BACKEND_DISPOSED");
      await expect(backend.renderFrameAsync({ source: { renderItems: [] } } as never)).rejects.toThrow("WEBGPU_BACKEND_DISPOSED");
      expect(() => backend.renderImportedAsset({} as never)).toThrow("WEBGPU_BACKEND_DISPOSED");
      await expect(backend.renderImportedAssetAsync({} as never)).rejects.toThrow("WEBGPU_BACKEND_DISPOSED");
      expect(() => backend.getFeatures()).toThrow("WEBGPU_BACKEND_DISPOSED");
      expect(() => backend.resize(3, 3)).toThrow("WEBGPU_BACKEND_DISPOSED");

      const second = caught(() => backend.dispose()) as AggregateError;
      expect(second).toBeInstanceOf(AggregateError);
      expect(second.cause).toBe(second.errors[0]);
      expect(leaves(second)).toContain(firstFailure);
      expect(native.destroy).toHaveBeenCalledOnce();
      expect(bufferDispose).toHaveBeenCalledTimes(1);

      expect(leaves(caught(() => backend.dispose()))).toContain(firstFailure);
      expect(device[resourceDisposalPending]).toBe(true);
      lose({ reason: "destroyed", message: "confirmed" });
      await flush();
      backend.dispose();
      expect(native.destroy).toHaveBeenCalledOnce();
      expect(bufferDispose).toHaveBeenCalledTimes(1);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(backend.getDiagnostics().realDevice).toBe(false);
    } finally {
      lose({ reason: "destroyed", message: "confirmed" });
      await flush();
      rendererDispose.mockRestore();
      bufferDispose.mockRestore();
      backend.renderer.dispose();
      device.dispose();
    }
  });

  it("preserves independent renderer and native errors in order while retrying only unfinished cleanup", async () => {
    const { backend, device, native, lose } = await nativeBackend();
    const timingFailure = new Error("inspection timing failure"), nativeFailure = new Error("native destruction failure");
    const internals = backend.renderer as unknown as { inspectionTiming: { dispose(): void } };
    const timingDispose = vi.spyOn(internals.inspectionTiming, "dispose").mockImplementationOnce(() => { throw timingFailure; });
    native.destroy.mockImplementationOnce(() => { throw nativeFailure; });
    try {
      const first = caught(() => backend.dispose()) as AggregateError;
      expect(first).toBeInstanceOf(AggregateError);
      expect(first.cause).toBe(timingFailure);
      expect(leaves(first)).toEqual([timingFailure, nativeFailure]);
      expect(leaves(caught(() => backend.dispose()))).toContain(nativeFailure);
      expect(leaves(caught(() => backend.dispose()))).toContain(nativeFailure);
      expect(timingDispose).toHaveBeenCalledTimes(1);
      expect(native.destroy).toHaveBeenCalledOnce();
      expect(device[resourceDisposalPending]).toBe(true);
      lose({ reason: "destroyed", message: "confirmed" });
      await flush();
      backend.dispose();
      expect(device[resourceDisposalPending]).toBe(false);
    } finally {
      lose({ reason: "destroyed", message: "confirmed" });
      await flush();
      timingDispose.mockRestore();
      internals.inspectionTiming.dispose();
      backend.renderer.dispose();
      device.dispose();
    }
  });

  it("does not repeat native disposal when the device completed before reporting an error", async () => {
    const { backend, device, native } = await nativeBackend();
    const failure = new Error("after native completion");
    const nativeDispose = device.dispose.bind(device);
    const deviceDispose = vi.spyOn(device, "dispose").mockImplementationOnce(() => {
      nativeDispose();
      throw failure;
    });
    const rendererDispose = vi.spyOn(backend.renderer, "dispose");
    try {
      expect(leaves(caught(() => backend.dispose()))).toContain(failure);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
      backend.dispose();
      backend.dispose();
      expect(rendererDispose).toHaveBeenCalledTimes(3);
      expect(deviceDispose).toHaveBeenCalledTimes(1);
      expect(native.destroy).toHaveBeenCalledTimes(1);
    } finally {
      rendererDispose.mockRestore();
      deviceDispose.mockRestore();
      backend.renderer.dispose();
      device.dispose();
    }
  });

  it("retries a real pending lane resource after native device destruction has already completed", async () => {
    const { backend, device, native } = await nativeBackend();
    const pool = prd11RenderTargetPoolFor(device);
    const lease = pool.acquireLease(descriptor);
    const failure = new Error("pool retirement");
    const poolDispose = vi.spyOn(pool, "dispose").mockImplementationOnce(() => { throw failure; });
    const targetDispose = vi.spyOn(lease.target, "dispose");
    try {
      expect(leaves(caught(() => backend.dispose()))).toContain(failure);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(native.destroy).toHaveBeenCalledTimes(1);
      expect(poolDispose).toHaveBeenCalledTimes(1);
      expect(targetDispose).toHaveBeenCalledTimes(1);

      backend.dispose();
      backend.dispose();
      expect(poolDispose).toHaveBeenCalledTimes(2);
      expect(lease.target.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(native.destroy).toHaveBeenCalledTimes(1);
      expect(targetDispose).toHaveBeenCalledTimes(1);
    } finally {
      poolDispose.mockRestore();
      targetDispose.mockRestore();
      backend.renderer.dispose();
      pool.dispose();
      device.dispose();
    }
  });

  it.each(["before", "after"] as const)("retries renderer-owned cleanup, not a completed device or material (failure %s release)", async mode => {
    const { backend, device, native } = await nativeBackend();
    const geometry = Geometry.litTriangle(), source = new PBRMaterial();
    const owned = batch(backend.renderer, geometry, source);
    const release = owned.dispose.bind(owned), failure = new Error("renderer batch cleanup");
    const dispose = vi.spyOn(owned, "dispose").mockImplementationOnce(() => {
      if (mode === "after") release();
      throw failure;
    }).mockImplementation(release);
    try {
      expect(leaves(caught(() => backend.dispose()))).toContain(failure);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(native.destroy).toHaveBeenCalledTimes(1);

      backend.dispose();
      backend.dispose();
      expect(owned.disposed).toBe(true);
      expect(dispose).toHaveBeenCalledTimes(mode === "before" ? 2 : 1);
      expect(native.destroy).toHaveBeenCalledTimes(1);
    } finally {
      dispose.mockRestore();
      backend.renderer.dispose();
      geometry.dispose();
      source.dispose();
      device.dispose();
    }
  });

  it("keeps retries scoped to the owning backend and the most recent shared-device owner", async () => {
    const first = await nativeBackend(), other = await nativeBackend();
    const peer = wrapRenderer(renderer(first.device));
    const geometry = Geometry.litTriangle(), source = new PBRMaterial();
    const firstBatch = batch(first.backend.renderer, geometry, source);
    const peerBatch = batch(peer.renderer, geometry, source);
    const sharedBatch = batch(first.device, geometry, source);
    const otherBatch = batch(other.backend.renderer, geometry, source);
    const firstRelease = firstBatch.dispose.bind(firstBatch), firstFailure = new Error("first owner batch");
    const firstDispose = vi.spyOn(firstBatch, "dispose").mockImplementationOnce(() => { throw firstFailure; }).mockImplementation(firstRelease);
    const peerFailure = new Error("last owner native destroy");
    first.native.destroy.mockImplementationOnce(() => { throw peerFailure; });

    try {
      expect(leaves(caught(() => first.backend.dispose()))).toContain(firstFailure);
      expect(first.device.disposed).toBe(false);
      first.backend.dispose();
      expect(firstBatch.disposed).toBe(true);
      expect(peerBatch.disposed).toBe(false);
      expect(sharedBatch.disposed).toBe(false);
      expect(otherBatch.disposed).toBe(false);
      expect(first.native.destroy).not.toHaveBeenCalled();
      expect(other.native.destroy).not.toHaveBeenCalled();
      expect(peer.getDiagnostics().realDevice).toBe(true);
      expect(other.backend.getDiagnostics().realDevice).toBe(true);
      expect(() => peer.resize(3, 3)).not.toThrow();

      expect(leaves(caught(() => peer.dispose()))).toContain(peerFailure);
      expect(first.device[resourceDisposalPending]).toBe(true);
      expect(first.native.destroy).toHaveBeenCalledTimes(1);
      first.backend.dispose();
      expect(first.native.destroy).toHaveBeenCalledTimes(1);
      expect(first.device[resourceDisposalPending]).toBe(true);
      expect(otherBatch.disposed).toBe(false);
      expect(other.device.disposed).toBe(false);

      expect(leaves(caught(() => peer.dispose()))).toContain(peerFailure);
      first.backend.dispose();
      expect(first.native.destroy).toHaveBeenCalledOnce();
      expect(first.device[resourceDisposalPending]).toBe(true);
      first.lose({ reason: "destroyed", message: "confirmed" });
      await flush();
      peer.dispose();
      first.backend.dispose();
      expect(first.native.destroy).toHaveBeenCalledOnce();
      expect(first.device[resourceDisposalPending]).toBe(false);
      expect(peerBatch.disposed).toBe(true);
      expect(sharedBatch.disposed).toBe(true);
      expect(otherBatch.disposed).toBe(false);
      expect(other.native.destroy).not.toHaveBeenCalled();
    } finally {
      first.lose({ reason: "destroyed", message: "confirmed" });
      await flush();
      firstDispose.mockRestore();
      first.backend.renderer.dispose();
      peer.renderer.dispose();
      other.backend.dispose();
      geometry.dispose();
      source.dispose();
      first.device.dispose();
      other.device.dispose();
    }
  });

  it.each(["returns", "late"] as const)("honors the device pending receipt after an apparently successful close (%s)", mode => {
    const device = new MockRenderDevice(), backend = wrapRenderer(renderer(device));
    const native = device.dispose.bind(device);
    let pending = false;
    Object.defineProperty(device, resourceDisposalPending, { configurable: true, get: () => pending });
    const dispose = vi.spyOn(device, "dispose").mockImplementationOnce(() => {
      device.disposed = true;
      if (mode === "returns") pending = true;
    }).mockImplementation(() => { pending = false; native(); });
    try {
      backend.dispose();
      if (mode === "late") pending = true;
      backend.dispose();
      backend.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(pending).toBe(false);
    } finally {
      pending = false;
      dispose.mockRestore();
      backend.renderer.dispose();
      device.dispose();
    }
  });

  it("drains renderer-owned failures that appear after disposal while an async frame is in flight", async () => {
    const device = new MockRenderDevice();
    const backend = wrapRenderer(renderer(device)), peer = renderer(device);
    const failure = new Error("late post release");
    let blocked = true, attempts = 0;
    const pool: RenderTargetPoolLike & { acquireLease: (desc: Parameters<RenderTargetPoolLike["acquire"]>[0]) => TargetPoolLease } = {
      acquire: desc => device.createRenderTarget(poolTargetDescriptor(desc)),
      release() {},
      trim() {},
      acquireLease(desc) {
        const target = this.acquire(desc);
        return { target, release() { attempts += 1; if (blocked) throw failure; } };
      }
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    let resume!: (pixels: Uint8Array) => void, started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    let firstRead = true;
    Object.assign(device, { readPixelsAsync(x: number, y: number, width: number, height: number): Promise<Uint8Array> {
      if (firstRead) {
        firstRead = false;
        started();
        return new Promise(resolve => { resume = resolve; });
      }
      return Promise.resolve(device.readPixels(x, y, width, height));
    } });
    const frame = backend.renderAsync({ renderItems: [], postprocess: chain });
    try {
      await entered;
      backend.dispose();
      expect(device.disposed).toBe(false);
      expect(attempts).toBe(0);
      resume(new Uint8Array(16));
      const frameFailure = await frame.then(() => undefined, error => error as unknown);
      expect(leaves(frameFailure)).toContain(failure);
      const before = attempts;
      expect(before).toBeGreaterThan(0);
      blocked = false;
      backend.dispose();
      expect(attempts).toBeGreaterThan(before);
      const completed = attempts;
      backend.dispose();
      expect(attempts).toBe(completed);
      expect(device.disposed).toBe(false);
    } finally {
      blocked = false;
      backend.renderer.dispose();
      peer.dispose();
      device.dispose();
    }
  });

  it("preserves a non-Error exception and permits a later retry", async () => {
    const { backend, device, native } = await nativeBackend();
    const original = backend.renderer.dispose.bind(backend.renderer);
    const dispose = vi.spyOn(backend.renderer, "dispose").mockImplementationOnce(() => { throw undefined; }).mockImplementation(original);
    try {
      let threw = false, received: unknown = "not thrown";
      try { backend.dispose(); } catch (error) { threw = true; received = error; }
      expect(threw).toBe(true);
      expect(received).toBeUndefined();
      expect(backend.getDiagnostics().realDevice).toBe(false);
      backend.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(native.destroy).toHaveBeenCalledTimes(1);
    } finally {
      dispose.mockRestore();
      backend.renderer.dispose();
      device.dispose();
    }
  });
});
