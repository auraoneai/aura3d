import { afterEach, describe, expect, it, vi } from "vitest";

import { Geometry } from "../../../packages/rendering/src/Geometry";
import { InstancedPBRMaterial, PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice, type RenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { resourceDisposalPending } from "../../../packages/rendering/src/ResourceLifecycle";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { renderTargetPoolSlot, type RenderTargetPoolLike } from "../../../packages/rendering/src/contracts/device";
import { prd11RenderTargetPoolFor } from "../../../packages/rendering/src/lanes/prd11";
import { batchPlanCacheFor } from "../../../packages/rendering/src/renderer/CullingBatching";
import { RenderTargetPool } from "../../../packages/rendering/src/resources/RenderTargetPool";

const flags = createTrustedQrFlags({ A3D_QR_TIERS: true });
const chain = { execution: "cpu-deterministic", chromaticAberration: true, filmGrain: true } as const;
const descriptor = { width: 2, height: 2, format: "rgba8", samples: 1, depth: false } as const;

function makeRenderer(device: RenderDevice, history = new TemporalHistory()): Renderer {
  return new Renderer(device, { width: 2, height: 2, qrFlags: flags, shaderLibrary: createLeanCoreShaderLibrary() }, history);
}

function caught(action: () => unknown): unknown {
  try { action(); } catch (error) { return error; }
  throw new Error("Expected an error");
}

function leaves(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors.flatMap(leaves) : [error];
}

afterEach(() => vi.restoreAllMocks());

describe("renderer device disposal ownership", () => {
  it("retries a failed mock device without repeating independent completed cleanup", () => {
    const device = new MockRenderDevice(), peerDevice = new MockRenderDevice();
    const history = new TemporalHistory(), owner = makeRenderer(device, history), peer = makeRenderer(peerDevice);
    const nativeFailure = new Error("native device cleanup");
    const historyFailure = new Error("independent history cleanup");
    const native = device.dispose.bind(device);
    const deviceDispose = vi.spyOn(device, "dispose").mockImplementationOnce(() => { throw nativeFailure; }).mockImplementation(native);
    const historyDispose = vi.spyOn(history, "dispose").mockImplementationOnce(() => { throw historyFailure; });
    try {
      const first = caught(() => owner.dispose()) as AggregateError;
      expect(first).toBeInstanceOf(AggregateError);
      expect(first.errors).toEqual([historyFailure, nativeFailure]);
      expect(first.cause).toBe(historyFailure);
      expect(device.disposed).toBe(false);
      expect(peerDevice.disposed).toBe(false);
      owner.dispose();
      owner.dispose();
      expect(deviceDispose).toHaveBeenCalledTimes(2);
      expect(historyDispose).toHaveBeenCalledTimes(1);
      expect(device.disposed).toBe(true);
      expect(peerDevice.disposed).toBe(false);
    } finally {
      deviceDispose.mockRestore(); historyDispose.mockRestore();
      owner.dispose(); history.dispose(); peer.dispose(); device.dispose();
    }
  });

  it("attempts the native owner despite earlier teardown failures and retries it independently", () => {
    const device = new MockRenderDevice(), owner = makeRenderer(device);
    const timingFailure = new Error("inspection timing"), traceFailure = new Error("frame trace");
    const nativeFailure = new Error("device teardown");
    const internals = owner as unknown as { inspectionTiming: { dispose(): void }; frameTrace: { dispose(): void } };
    const timing = vi.spyOn(internals.inspectionTiming, "dispose").mockImplementationOnce(() => { throw timingFailure; });
    const trace = vi.spyOn(internals.frameTrace, "dispose").mockImplementationOnce(() => { throw traceFailure; });
    const native = device.dispose.bind(device);
    const dispose = vi.spyOn(device, "dispose").mockImplementationOnce(() => { throw nativeFailure; }).mockImplementation(native);
    try {
      const first = caught(() => owner.dispose()) as AggregateError;
      expect(first.errors).toEqual([timingFailure, traceFailure, nativeFailure]);
      expect(first.cause).toBe(timingFailure);
      expect(dispose).toHaveBeenCalledTimes(1);
      owner.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(timing).toHaveBeenCalledTimes(1);
      expect(trace).toHaveBeenCalledTimes(1);
      expect(device.disposed).toBe(true);
    } finally {
      timing.mockRestore(); trace.mockRestore(); dispose.mockRestore();
      internals.inspectionTiming.dispose(); internals.frameTrace.dispose(); owner.dispose(); device.dispose();
    }
  });

  it("suspends the old owner while a new owner is live and transfers retry responsibility", () => {
    const device = new MockRenderDevice();
    const old = makeRenderer(device);
    const native = device.dispose.bind(device);
    const firstFailure = new Error("old owner native failure"), nextFailure = new Error("new owner native failure");
    const dispose = vi.spyOn(device, "dispose")
      .mockImplementationOnce(() => { throw firstFailure; })
      .mockImplementationOnce(() => { throw nextFailure; })
      .mockImplementation(native);
    let next: Renderer | undefined;
    try {
      expect((caught(() => old.dispose()) as AggregateError).errors).toContain(firstFailure);
      next = makeRenderer(device);
      expect(() => old.dispose()).not.toThrow();
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(() => next!.render({ renderItems: [] })).not.toThrow();
      expect((caught(() => next!.dispose()) as AggregateError).errors).toContain(nextFailure);
      expect(dispose).toHaveBeenCalledTimes(2);
      old.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      next.dispose();
      next.dispose();
      expect(dispose).toHaveBeenCalledTimes(3);
      expect(device.disposed).toBe(true);
    } finally {
      dispose.mockRestore();
      old.dispose(); next?.dispose(); device.dispose();
    }
  });

  it("does not let an older final owner retry a newer owner's post or device failures", () => {
    const device = new MockRenderDevice(), old = makeRenderer(device);
    const oldDeviceFailure = new Error("old native"), newDeviceFailure = new Error("new native");
    const postFailure = new Error("new post lease"), native = device.dispose.bind(device);
    const dispose = vi.spyOn(device, "dispose")
      .mockImplementationOnce(() => { throw oldDeviceFailure; })
      .mockImplementationOnce(() => { throw newDeviceFailure; })
      .mockImplementation(native);
    const targets: RenderTarget[] = [], attempts: number[] = [];
    let blocked = true, next: Renderer | undefined;
    const pool: RenderTargetPoolLike = {
      acquire(desc) {
        const target = device.createRenderTarget({ ...desc, sampleCount: desc.samples });
        targets.push(target);
        return target;
      },
      release(target) {
        const index = targets.indexOf(target);
        attempts[index] = (attempts[index] ?? 0) + 1;
        if (index === 0 && blocked) throw postFailure;
      },
      trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    try {
      expect((caught(() => old.dispose()) as AggregateError).errors).toContain(oldDeviceFailure);
      next = makeRenderer(device);
      expect(caught(() => next!.render({ renderItems: [], postprocess: chain }))).toBe(postFailure);
      expect((caught(() => next!.dispose()) as AggregateError).errors).toEqual([postFailure, newDeviceFailure]);
      expect(attempts).toEqual([2, 1]);
      old.dispose();
      expect(attempts).toEqual([2, 1]);
      expect(dispose).toHaveBeenCalledTimes(2);
      blocked = false;
      next.dispose(); old.dispose();
      expect(attempts).toEqual([3, 1]);
      expect(dispose).toHaveBeenCalledTimes(3);
      expect(device.disposed).toBe(true);
    } finally {
      blocked = false;
      dispose.mockRestore(); old.dispose(); next?.dispose(); device.dispose();
    }
  });

  it("rechecks the last-owner token after a post release disposes a newly created owner", () => {
    const device = new MockRenderDevice(), old = makeRenderer(device);
    const geometry = Geometry.litTriangle(), material = new PBRMaterial();
    const postFailure = new Error("old post"), batchFailure = new Error("new device batch");
    const firstNativeFailure = new Error("first native"), secondNativeFailure = new Error("second native");
    const native = device.dispose.bind(device);
    const dispose = vi.spyOn(device, "dispose")
      .mockImplementationOnce(() => { throw firstNativeFailure; })
      .mockImplementationOnce(() => { throw secondNativeFailure; })
      .mockImplementation(native);
    const targets: RenderTarget[] = [], attempts: number[] = [];
    let postBlocked = true, batchBlocked = true, createPeer = false, batchAttempts = 0;
    let next: Renderer | undefined, nested: unknown;
    const pool: RenderTargetPoolLike = {
      acquire(desc) {
        const target = device.createRenderTarget({ ...desc, sampleCount: desc.samples });
        targets.push(target);
        return target;
      },
      release(target) {
        const index = targets.indexOf(target);
        attempts[index] = (attempts[index] ?? 0) + 1;
        if (index === 0 && createPeer) {
          createPeer = false;
          next = makeRenderer(device);
          const items = [{ geometry, material }, { geometry, material }];
          const batch = batchPlanCacheFor(device).apply(items, { flags: createTrustedQrFlags({}), multiDraw: false })[0]!.material as InstancedPBRMaterial;
          const finish = batch.dispose.bind(batch);
          batch.dispose = () => {
            batchAttempts += 1;
            if (batchBlocked) throw batchFailure;
            finish();
          };
          nested = caught(() => next!.dispose());
          postBlocked = false;
        }
        if (index === 0 && postBlocked) throw postFailure;
      },
      trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    try {
      expect(caught(() => old.render({ renderItems: [], postprocess: chain }))).toBe(postFailure);
      expect((caught(() => old.dispose()) as AggregateError).errors).toEqual([postFailure, firstNativeFailure]);
      createPeer = true;
      old.dispose();
      expect(leaves(nested)).toContain(batchFailure);
      expect(leaves(nested)).toContain(secondNativeFailure);
      expect(batchAttempts).toBe(1);
      expect(dispose).toHaveBeenCalledTimes(2);
      batchBlocked = false;
      next!.dispose(); old.dispose();
      expect(batchAttempts).toBe(2);
      expect(dispose).toHaveBeenCalledTimes(3);
      expect(attempts).toEqual([3, 1]);
      expect(device.disposed).toBe(true);
    } finally {
      postBlocked = false; batchBlocked = false; createPeer = false;
      dispose.mockRestore(); old.dispose(); next?.dispose(); device.dispose(); geometry.dispose(); material.dispose();
    }
  });

  it("only lets the final shared renderer retry a failed device close", () => {
    const device = new MockRenderDevice(), first = makeRenderer(device), last = makeRenderer(device);
    const failure = new Error("last owner device failure"), native = device.dispose.bind(device);
    const dispose = vi.spyOn(device, "dispose").mockImplementationOnce(() => { throw failure; }).mockImplementation(native);
    try {
      first.dispose();
      expect(dispose).not.toHaveBeenCalled();
      expect((caught(() => last.dispose()) as AggregateError).errors).toEqual([failure]);
      first.dispose();
      expect(dispose).toHaveBeenCalledTimes(1);
      last.dispose(); last.dispose(); first.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(device.disposed).toBe(true);
    } finally {
      dispose.mockRestore(); first.dispose(); last.dispose(); device.dispose();
    }
  });

  it("retains the same native owner across multiple failed disposal retries", () => {
    const device = new MockRenderDevice(), owner = makeRenderer(device);
    const first = new Error("first attempt"), second = new Error("second attempt"), native = device.dispose.bind(device);
    const dispose = vi.spyOn(device, "dispose")
      .mockImplementationOnce(() => { throw first; })
      .mockImplementationOnce(() => { throw second; })
      .mockImplementation(native);
    try {
      expect((caught(() => owner.dispose()) as AggregateError).errors).toEqual([first]);
      expect((caught(() => owner.dispose()) as AggregateError).errors).toEqual([second]);
      owner.dispose(); owner.dispose();
      expect(dispose).toHaveBeenCalledTimes(3);
      expect(device.disposed).toBe(true);
    } finally {
      dispose.mockRestore(); owner.dispose(); device.dispose();
    }
  });

  it("retries native disposal even when retained post cleanup still fails", () => {
    const device = new MockRenderDevice(), owner = makeRenderer(device);
    const postFailure = new Error("post still pending"), deviceFailure = new Error("device failed");
    const targets: RenderTarget[] = [], attempts: number[] = [];
    let blocked = true;
    const pool: RenderTargetPoolLike = {
      acquire(desc) {
        const target = device.createRenderTarget({ ...desc, sampleCount: desc.samples });
        targets.push(target);
        return target;
      },
      release(target) {
        const index = targets.indexOf(target);
        attempts[index] = (attempts[index] ?? 0) + 1;
        if (index === 0 && blocked) throw postFailure;
      },
      trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const native = device.dispose.bind(device);
    const dispose = vi.spyOn(device, "dispose").mockImplementationOnce(() => { throw deviceFailure; }).mockImplementation(native);
    try {
      expect(caught(() => owner.render({ renderItems: [], postprocess: chain }))).toBe(postFailure);
      const first = caught(() => owner.dispose()) as AggregateError;
      expect(first.errors).toEqual([postFailure, deviceFailure]);
      expect(first.cause).toBe(postFailure);
      const second = caught(() => owner.dispose()) as AggregateError;
      expect(second.errors).toEqual([postFailure]);
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(device.disposed).toBe(true);
      blocked = false;
      owner.dispose(); owner.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(attempts).toEqual([4, 1]);
    } finally {
      blocked = false;
      dispose.mockRestore(); owner.dispose(); device.dispose();
    }
  });

  it("rejects new owners and reentrant disposal during a native device callback", () => {
    const device = new MockRenderDevice(), old = makeRenderer(device);
    const native = device.dispose.bind(device), failure = new Error("outer native failure");
    let nested: unknown, invalidAlpha: unknown;
    let attempts = 0;
    const dispose = vi.spyOn(device, "dispose").mockImplementation(() => {
      attempts += 1;
      if (attempts === 1) {
        nested = caught(() => makeRenderer(device));
        invalidAlpha = caught(() => new Renderer(device, {
          width: 2, height: 2, shaderLibrary: createLeanCoreShaderLibrary(), output: { alphaMode: "straight" }
        }, new TemporalHistory()));
        old.dispose();
        throw failure;
      }
      native();
    });
    try {
      expect((caught(() => old.dispose()) as AggregateError).errors).toContain(failure);
      expect(nested).toMatchObject({ code: "RENDERER_DEVICE_DISPOSAL_BUSY" });
      expect(invalidAlpha).toMatchObject({ code: "OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE" });
      expect(attempts).toBe(1);
      old.dispose();
      expect(attempts).toBe(2);
      expect(device.disposed).toBe(true);
    } finally {
      dispose.mockRestore();
      old.dispose(); device.dispose();
    }
  });

  it.each(["throws", "returns", "late"] as const)("retries a device reporting unfinished cleanup (%s)", mode => {
    const device = new MockRenderDevice(), owner = makeRenderer(device);
    const native = device.dispose.bind(device), failure = new Error("pending native cleanup");
    let pending = false, attempts = 0;
    Object.defineProperty(device, resourceDisposalPending, { configurable: true, get: () => pending });
    const dispose = vi.spyOn(device, "dispose").mockImplementation(() => {
      attempts += 1;
      if (attempts === 1) {
        device.disposed = true;
        if (mode !== "late") pending = true;
        if (mode === "throws") throw failure;
        return;
      }
      pending = false;
      native();
    });
    try {
      if (mode === "throws") expect((caught(() => owner.dispose()) as AggregateError).errors).toContain(failure);
      else owner.dispose();
      if (mode === "late") pending = true;
      owner.dispose();
      owner.dispose();
      expect(attempts).toBe(2);
      expect(pending).toBe(false);
    } finally {
      pending = false;
      dispose.mockRestore(); owner.dispose(); device.dispose();
    }
  });

  it("reports an incomplete device close that returned without marking the device disposed", () => {
    const device = new MockRenderDevice(), owner = makeRenderer(device);
    const native = device.dispose.bind(device);
    const dispose = vi.spyOn(device, "dispose").mockImplementationOnce(() => {}).mockImplementation(native);
    try {
      const first = caught(() => owner.dispose()) as AggregateError;
      expect(first.errors[0]).toMatchObject({ code: "RENDERER_DEVICE_DISPOSAL_INCOMPLETE" });
      expect(device.disposed).toBe(false);
      owner.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(device.disposed).toBe(true);
    } finally {
      dispose.mockRestore(); owner.dispose(); device.dispose();
    }
  });

  it("rechecks owner identity after a reentrant native completion getter", () => {
    const device = new MockRenderDevice(), old = makeRenderer(device);
    const native = device.dispose.bind(device);
    let pending = true, createPeer = false, peer: Renderer | undefined;
    Object.defineProperty(device, resourceDisposalPending, { configurable: true, get: () => {
      if (createPeer) {
        createPeer = false;
        device.disposed = false;
        peer = makeRenderer(device);
      }
      return pending;
    } });
    const dispose = vi.spyOn(device, "dispose").mockImplementationOnce(() => { device.disposed = true; }).mockImplementation(native);
    try {
      old.dispose();
      createPeer = true;
      old.dispose();
      expect(peer).toBeDefined();
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(() => peer!.render({ renderItems: [] })).not.toThrow();
      pending = false;
      peer!.dispose();
      old.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(device.disposed).toBe(true);
    } finally {
      pending = false;
      dispose.mockRestore(); old.dispose(); peer?.dispose(); device.dispose();
    }
  });

  it("does not repeat a device that completed before reporting an error", () => {
    const device = new MockRenderDevice(), owner = makeRenderer(device);
    const native = device.dispose.bind(device), failure = new Error("after completed close");
    Object.defineProperty(device, resourceDisposalPending, { configurable: true, get: () => false });
    const dispose = vi.spyOn(device, "dispose").mockImplementation(() => { native(); throw failure; });
    try {
      expect((caught(() => owner.dispose()) as AggregateError).errors).toContain(failure);
      owner.dispose(); owner.dispose();
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      dispose.mockRestore(); owner.dispose(); device.dispose();
    }
  });

  it("retries a real lane pool after device closure without repeating successful native disposal", () => {
    const device = new MockRenderDevice(), other = new MockRenderDevice();
    const nativeDispose = vi.fn(() => { device.disposed = true; });
    device.dispose = nativeDispose;
    const pool = prd11RenderTargetPoolFor(device), peerPool = prd11RenderTargetPoolFor(other);
    const lease = pool.acquireLease(descriptor), peer = peerPool.acquireLease(descriptor);
    const owner = makeRenderer(device);
    const failure = new Error("real lane pool failure");
    const dispose = vi.spyOn(pool, "dispose").mockImplementationOnce(() => { throw failure; });
    try {
      const first = caught(() => owner.dispose());
      expect(leaves(first)).toContain(failure);
      expect(device.disposed).toBe(true);
      expect((device as MockRenderDevice & { [resourceDisposalPending]?: boolean })[resourceDisposalPending]).toBe(true);
      expect(nativeDispose).toHaveBeenCalledTimes(1);
      expect(lease.target.disposed).toBe(false);
      owner.dispose(); owner.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(nativeDispose).toHaveBeenCalledTimes(1);
      expect(lease.target.disposed).toBe(true);
      expect(peer.target.disposed).toBe(false);
    } finally {
      dispose.mockRestore(); owner.dispose(); pool.dispose();
      peer.release(); peerPool.dispose(); other.dispose();
    }
  });

  it("keeps simultaneous native and real pool failures ordered and retries both", () => {
    const device = new MockRenderDevice();
    const nativeFailure = new Error("native device failure"), poolFailure = new Error("lane pool failure");
    const nativeDispose = vi.fn()
      .mockImplementationOnce(() => { throw nativeFailure; })
      .mockImplementation(() => { device.disposed = true; });
    device.dispose = nativeDispose;
    const pool = prd11RenderTargetPoolFor(device), lease = pool.acquireLease(descriptor);
    const owner = makeRenderer(device);
    const poolDispose = vi.spyOn(pool, "dispose").mockImplementationOnce(() => { throw poolFailure; });
    try {
      const first = caught(() => owner.dispose()) as AggregateError;
      expect(first).toBeInstanceOf(AggregateError);
      expect(first.cause).toBe(first.errors[0]);
      expect(leaves(first)).toEqual([nativeFailure, poolFailure]);
      expect(device.disposed).toBe(false);
      expect(lease.target.disposed).toBe(false);
      owner.dispose(); owner.dispose();
      expect(nativeDispose).toHaveBeenCalledTimes(2);
      expect(poolDispose).toHaveBeenCalledTimes(2);
      expect(device.disposed).toBe(true);
      expect(lease.target.disposed).toBe(true);
    } finally {
      poolDispose.mockRestore(); owner.dispose(); pool.dispose();
    }
  });

  it("retains an actual WebGPU device's failed native destroy until confirmed loss without repeating completed buffer cleanup", async () => {
    const failure = new Error("native WebGPU destroy failed");
    let lose!: (info: { reason: string; message: string }) => void;
    const native = {
      lost: new Promise<{ reason: string; message: string }>(resolve => { lose = resolve; }),
      features: new Set<string>(),
      queue: {
        writeBuffer() {}, writeTexture() {}, submit() {}, onSubmittedWorkDone: () => Promise.resolve()
      },
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
      destroy: vi.fn().mockImplementationOnce(() => { throw failure; })
    };
    const adapter = { requestDevice: async () => native as unknown as WebGPUDeviceLike };
    const device = await WebGPUDevice.create({ adapter });
    const owner = makeRenderer(device), buffer = device.createBuffer("vertex", 16);
    const bufferDispose = vi.spyOn(buffer, "dispose");
    try {
      const first = caught(() => owner.dispose());
      expect(leaves(first)).toContain(failure);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(native.destroy).toHaveBeenCalledTimes(1);
      expect(bufferDispose).toHaveBeenCalledTimes(1);
      // A throwing injected destroy may already have acted: an explicit retry
      // reports it and stays pending rather than repeating it.
      expect(leaves(caught(() => owner.dispose()))).toContain(failure);
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
      expect(leaves(caught(() => owner.dispose()))).toContain(failure);
      expect(native.destroy).toHaveBeenCalledTimes(1);
      expect(device[resourceDisposalPending]).toBe(true);
      // Confirmed loss discharges the destroy; the next retry completes.
      lose({ reason: "destroyed", message: "confirmed" });
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
      owner.dispose();
      expect(native.destroy).toHaveBeenCalledTimes(1);
      expect(bufferDispose).toHaveBeenCalledTimes(1);
      expect(device[resourceDisposalPending]).toBe(false);
    } finally {
      bufferDispose.mockRestore(); try { owner.dispose(); } catch { /* Reported above. */ } try { device.dispose(); } catch { /* Reported above. */ }
    }
  });
});

describe("renderer frame error preservation", () => {
  it.each([false, true])("preserves a sole end-frame error without wrapping it (async=%s)", async asynchronous => {
    const device = new MockRenderDevice(), history = new TemporalHistory(), owner = makeRenderer(device, history);
    const failure = new Error("end-frame only");
    const end = vi.spyOn(history, "endDeviceFrame").mockImplementation(() => { throw failure; });
    const run = (): Promise<unknown> => asynchronous
      ? owner.renderAsync({ renderItems: [] })
      : Promise.resolve().then(() => owner.render({ renderItems: [] }));
    try {
      await expect(run()).rejects.toBe(failure);
      expect(end).toHaveBeenCalledOnce();
    } finally {
      end.mockRestore(); owner.dispose();
    }
  });

  it.each([false, true])("reports multiple cleanup-only errors in order (async=%s)", async asynchronous => {
    const device = new MockRenderDevice(), history = new TemporalHistory(), owner = makeRenderer(device, history);
    const endFailure = new Error("end only"), photoFailure = new Error("photo after end");
    const end = vi.spyOn(history, "endDeviceFrame").mockImplementation(() => { throw endFailure; });
    const internals = owner as unknown as { finishPhotometricFrame(...args: unknown[]): void };
    const photo = vi.spyOn(internals, "finishPhotometricFrame").mockImplementation(() => { throw photoFailure; });
    const run = (): Promise<unknown> => asynchronous
      ? owner.renderAsync({ renderItems: [] })
      : Promise.resolve().then(() => owner.render({ renderItems: [] }));
    try {
      const error = await run().then(() => undefined, value => value as unknown);
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([endFailure, photoFailure]);
      expect((error as AggregateError).cause).toBe(endFailure);
    } finally {
      end.mockRestore(); photo.mockRestore(); owner.dispose();
    }
  });

  it.each([false, true])("preserves an undefined frame exception before cleanup failure (async=%s)", async asynchronous => {
    const device = new MockRenderDevice(), history = new TemporalHistory(), owner = makeRenderer(device, history);
    const failure = new Error("end after undefined");
    const read = vi.spyOn(device, "readPixels").mockImplementation(() => { throw undefined; });
    const end = vi.spyOn(history, "endDeviceFrame").mockImplementation(() => { throw failure; });
    const run = (): Promise<unknown> => asynchronous
      ? owner.renderAsync({ renderItems: [], postprocess: chain })
      : Promise.resolve().then(() => owner.render({ renderItems: [], postprocess: chain }));
    try {
      const error = await run().then(() => undefined, value => value as unknown);
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([undefined, failure]);
    } finally {
      read.mockRestore(); end.mockRestore(); owner.dispose();
    }
  });

  it.each([false, true])("keeps post failure first and attempts independent frame cleanup (async=%s)", async asynchronous => {
    const device = new MockRenderDevice(), history = new TemporalHistory(), owner = makeRenderer(device, history);
    const postFailure = new Error("post lease failure"), endFailure = new Error("end frame failure");
    const photoFailure = new Error("photometric cleanup"), spotFailure = new Error("spot cleanup"), packedFailure = new Error("packed cleanup");
    let failPost = true;
    const pool: RenderTargetPoolLike = {
      acquire: desc => device.createRenderTarget({ ...desc, sampleCount: desc.samples }),
      release: () => { if (failPost) throw postFailure; }, trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const end = vi.spyOn(history, "endDeviceFrame").mockImplementation(() => { throw endFailure; });
    const internals = owner as unknown as {
      finishPhotometricFrame(...args: unknown[]): void;
      finishProjectedSpotFrame(...args: unknown[]): void;
      finishPackedLoopFrame(...args: unknown[]): void;
    };
    const photo = vi.spyOn(internals, "finishPhotometricFrame").mockImplementation(() => { throw photoFailure; });
    const spot = vi.spyOn(internals, "finishProjectedSpotFrame").mockImplementation(() => { throw spotFailure; });
    const packed = vi.spyOn(internals, "finishPackedLoopFrame").mockImplementation(() => { throw packedFailure; });
    const run = (): Promise<unknown> => asynchronous
      ? owner.renderAsync({ renderItems: [], postprocess: chain })
      : Promise.resolve().then(() => owner.render({ renderItems: [], postprocess: chain }));
    try {
      const error = await run().then(() => undefined, failure => failure as unknown);
      expect(error).toBeInstanceOf(AggregateError);
      const aggregate = error as AggregateError;
      expect(aggregate.errors).toHaveLength(5);
      expect(leaves(aggregate.errors[0])).toEqual([postFailure, postFailure]);
      expect(aggregate.errors.slice(1)).toEqual([endFailure, photoFailure, spotFailure, packedFailure]);
      expect(aggregate.cause).toBe(aggregate.errors[0]);
      expect(end).toHaveBeenCalledTimes(1);
      expect(photo).toHaveBeenCalledTimes(1);
      expect(spot).toHaveBeenCalledTimes(1);
      expect(packed).toHaveBeenCalledTimes(1);
    } finally {
      failPost = false;
      end.mockRestore(); photo.mockRestore(); spot.mockRestore(); packed.mockRestore();
      owner.dispose();
    }
  });

  it.each([false, true])("preserves the first post execution cause, lease failure, then end-frame failure (async=%s)", async asynchronous => {
    const device = new MockRenderDevice(), history = new TemporalHistory(), owner = makeRenderer(device, history);
    const executionFailure = new Error("post execution"), leaseFailure = new Error("post lease release");
    const endFailure = new Error("end after post errors");
    let blocked = true;
    const pool: RenderTargetPoolLike = {
      acquire: desc => device.createRenderTarget({ ...desc, sampleCount: desc.samples }),
      release: () => { if (blocked) throw leaseFailure; }, trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const read = vi.spyOn(device, "readPixels").mockImplementation(() => { throw executionFailure; });
    const end = vi.spyOn(history, "endDeviceFrame").mockImplementation(() => { throw endFailure; });
    const run = (): Promise<unknown> => asynchronous
      ? owner.renderAsync({ renderItems: [], postprocess: chain })
      : Promise.resolve().then(() => owner.render({ renderItems: [], postprocess: chain }));
    try {
      const error = await run().then(() => undefined, value => value as unknown);
      expect(error).toBeInstanceOf(AggregateError);
      const aggregate = error as AggregateError;
      expect(aggregate.errors[0]).toBeInstanceOf(AggregateError);
      expect((aggregate.errors[0] as AggregateError).errors).toEqual([executionFailure, leaseFailure]);
      expect((aggregate.errors[0] as AggregateError).cause).toBe(executionFailure);
      expect(aggregate.errors[1]).toBe(endFailure);
      expect(leaves(aggregate)).toEqual([executionFailure, leaseFailure, endFailure]);
      expect(aggregate.cause).toBe(aggregate.errors[0]);
    } finally {
      blocked = false;
      read.mockRestore(); end.mockRestore(); owner.dispose();
    }
  });

  it.each([false, true])("retains frame and end errors when outer inspection cleanup also fails (async=%s)", async asynchronous => {
    const device = new MockRenderDevice(), history = new TemporalHistory(), owner = makeRenderer(device, history);
    const frameFailure = new Error("frame"), endFailure = new Error("end"), inspectionFailure = new Error("inspection");
    const read = vi.spyOn(device, "readPixels").mockImplementation(() => { throw frameFailure; });
    const end = vi.spyOn(history, "endDeviceFrame").mockImplementation(() => { throw endFailure; });
    const internals = owner as unknown as { finishFrameInspection(...args: unknown[]): void };
    const inspection = vi.spyOn(internals, "finishFrameInspection").mockImplementation(() => { throw inspectionFailure; });
    const run = (): Promise<unknown> => asynchronous
      ? owner.renderAsync({ renderItems: [], postprocess: chain })
      : Promise.resolve().then(() => owner.render({ renderItems: [], postprocess: chain }));
    try {
      const error = await run().then(() => undefined, value => value as unknown);
      expect(leaves(error)).toEqual([frameFailure, endFailure, inspectionFailure]);
      expect((error as AggregateError).cause).toBe((error as AggregateError).errors[0]);
    } finally {
      read.mockRestore(); end.mockRestore(); inspection.mockRestore(); owner.dispose();
    }
  });

  it.each([
    [false, false], [false, true], [true, false], [true, true]
  ] as const)("keeps real pool, context-loss and inspection failures ordered (async=%s, diagnosticsFail=%s)", async (asynchronous, diagnosticsFail) => {
    const device = new MockRenderDevice(), pool = new RenderTargetPool(device);
    const owner = makeRenderer(device), peer = makeRenderer(device);
    const failure = new Error("lost pooled target disposal");
    const diagnosticsFailure = new Error("diagnostics after loss");
    const targets: RenderTarget[] = [], attempts: number[] = [];
    let blocked = true;
    const diagnostics = device.getDiagnostics.bind(device);
    vi.spyOn(device, "getDiagnostics").mockImplementation(() => {
      if (diagnosticsFail && device.contextLost) throw diagnosticsFailure;
      return diagnostics();
    });
    const create = device.createRenderTarget.bind(device);
    vi.spyOn(device, "createRenderTarget").mockImplementation(desc => {
      const target = create(desc);
      if (desc.label === "render-target-pool") {
        const index = targets.push(target) - 1, dispose = target.dispose.bind(target);
        target.dispose = () => {
          attempts[index] = (attempts[index] ?? 0) + 1;
          if (index === 0 && blocked) throw failure;
          dispose();
        };
      }
      return target;
    });
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const present = device.presentRenderTarget.bind(device);
    vi.spyOn(device, "presentRenderTarget").mockImplementationOnce(target => {
      present(target);
      device.contextLost = true;
    });
    const run = (): Promise<unknown> => asynchronous
      ? owner.renderAsync({ renderItems: [], postprocess: chain })
      : Promise.resolve().then(() => owner.render({ renderItems: [], postprocess: chain }));
    try {
      const error = await run().then(() => undefined, failure => failure as unknown);
      expect(error).toBeInstanceOf(AggregateError);
      const aggregate = error as AggregateError;
      const failures = leaves(aggregate);
      expect(failures[0]).toBe(failure);
      expect(failures[1]).toMatchObject({ code: "CONTEXT_LOST" });
      expect(failures.slice(2)).toEqual(diagnosticsFail ? [diagnosticsFailure] : []);
      expect(aggregate.cause).toBe(aggregate.errors[0]);
      expect(attempts).toEqual([1, 1]);
      device.contextLost = false;
      blocked = false;
      owner.dispose();
      expect(attempts).toEqual([2, 1]);
      expect(targets.every(target => target.disposed)).toBe(true);
      expect(device.disposed).toBe(false);
    } finally {
      device.contextLost = false;
      blocked = false;
      owner.dispose(); pool.dispose(); peer.dispose();
    }
  });
});
