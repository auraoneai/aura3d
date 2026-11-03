import { afterEach, describe, expect, it, vi } from "vitest";

import { Geometry } from "../../../packages/rendering/src/Geometry";
import { InstancedPBRMaterial, PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { renderTargetPoolSlot, type RenderTargetPoolLike } from "../../../packages/rendering/src/contracts/device";
import { batchPlanCacheFor } from "../../../packages/rendering/src/renderer/CullingBatching";
import { RenderTargetPool } from "../../../packages/rendering/src/resources/RenderTargetPool";
import type { TargetPoolLease } from "../../../packages/rendering/src/resources/RenderTargetPoolLease";

const flags = createTrustedQrFlags({ A3D_QR_TIERS: true });
const planFlags = createTrustedQrFlags({});
const chain = { execution: "cpu-deterministic", chromaticAberration: true, filmGrain: true } as const;

function renderer(device: MockRenderDevice, history = new TemporalHistory()): Renderer {
  return new Renderer(device, {
    width: 2, height: 2, qrFlags: flags, shaderLibrary: createLeanCoreShaderLibrary()
  }, history);
}

function batch(owner: object, geometry: Geometry, source: PBRMaterial): InstancedPBRMaterial {
  const items = [{ geometry, material: source }, { geometry, material: source }];
  return batchPlanCacheFor(owner).apply(items, { flags: planFlags, multiDraw: false })[0]!.material as InstancedPBRMaterial;
}

function failure(action: () => void): AggregateError {
  try { action(); } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    return error as AggregateError;
  }
  throw new Error("Expected renderer disposal to fail");
}

function containsError(error: unknown, target: unknown): boolean {
  return error === target || (error instanceof AggregateError && error.errors.some(value => containsError(value, target)));
}

afterEach(() => vi.restoreAllMocks());

describe("renderer post and batch disposal retry", () => {
  it("retries both failed batch owners and post leases while preserving independent errors and reentrancy", () => {
    const device = new MockRenderDevice();
    const history = new TemporalHistory();
    const owner = renderer(device, history);
    const geometry = Geometry.litTriangle();
    const source = new PBRMaterial();
    const postError = new Error("post lease failed");
    const ownError = new Error("renderer batch failed");
    const deviceError = new Error("device batch failed");
    const historyError = new Error("independent history failed");
    let blocked = true, reenter = false;
    const targets: RenderTarget[] = [], attempts: number[] = [];
    const pool: RenderTargetPoolLike & { acquireLease: (desc: Parameters<RenderTargetPoolLike["acquire"]>[0]) => TargetPoolLease } = {
      acquire: desc => device.createRenderTarget({ ...desc, sampleCount: desc.samples }),
      release() {},
      trim() {},
      acquireLease(desc) {
        const target = this.acquire(desc), index = targets.push(target) - 1;
        return { target, release() {
          attempts[index] = (attempts[index] ?? 0) + 1;
          if (index === 0) {
            if (reenter) owner.dispose();
            if (blocked) throw postError;
          }
        } };
      }
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const historyDispose = vi.spyOn(history, "dispose").mockImplementationOnce(() => { throw historyError; });
    const deviceDispose = vi.spyOn(device, "dispose");
    try {
      expect(() => owner.render({ renderItems: [], postprocess: chain })).toThrow(postError);
      expect(attempts).toEqual([1, 1]);
      const ownBatch = batch(owner, geometry, source);
      const deviceBatch = batch(device, geometry, source);
      const ownOriginal = ownBatch.dispose.bind(ownBatch);
      const deviceOriginal = deviceBatch.dispose.bind(deviceBatch);
      const ownDispose = vi.spyOn(ownBatch, "dispose").mockImplementation(() => {
        owner.dispose();
        if (blocked) throw ownError;
        ownOriginal();
      });
      const batchDispose = vi.spyOn(deviceBatch, "dispose").mockImplementation(() => {
        owner.dispose();
        if (blocked) throw deviceError;
        deviceOriginal();
      });
      reenter = true;

      const first = failure(() => owner.dispose());
      expect(first.errors).toEqual(expect.arrayContaining([postError, ownError, deviceError, historyError]));
      expect(attempts).toEqual([2, 1]);
      expect(ownDispose).toHaveBeenCalledTimes(1);
      expect(batchDispose).toHaveBeenCalledTimes(1);
      expect(historyDispose).toHaveBeenCalledTimes(1);
      expect(deviceDispose).toHaveBeenCalledTimes(1);
      expect(device.disposed).toBe(true);

      const second = failure(() => owner.dispose());
      expect(second.errors).toEqual(expect.arrayContaining([postError, ownError, deviceError]));
      expect(attempts).toEqual([3, 1]);
      expect(ownDispose).toHaveBeenCalledTimes(2);
      expect(batchDispose).toHaveBeenCalledTimes(2);
      expect(historyDispose).toHaveBeenCalledTimes(1);
      expect(deviceDispose).toHaveBeenCalledTimes(1);

      blocked = false;
      owner.dispose();
      owner.dispose();
      expect(attempts).toEqual([4, 1]);
      expect(ownDispose).toHaveBeenCalledTimes(3);
      expect(batchDispose).toHaveBeenCalledTimes(3);
      expect(ownBatch.disposed).toBe(true);
      expect(deviceBatch.disposed).toBe(true);
      expect(deviceDispose).toHaveBeenCalledTimes(1);
    } finally {
      blocked = false;
      reenter = false;
      owner.dispose();
      history.dispose();
      geometry.dispose();
      source.dispose();
    }
  });

  it("retries only its own batch cache while another renderer and another device remain live", () => {
    const device = new MockRenderDevice(), otherDevice = new MockRenderDevice();
    const first = renderer(device), peer = renderer(device), other = renderer(otherDevice);
    const geometry = Geometry.litTriangle(), source = new PBRMaterial();
    const firstBatch = batch(first, geometry, source);
    const peerBatch = batch(peer, geometry, source);
    const sharedBatch = batch(device, geometry, source);
    const otherBatch = batch(otherDevice, geometry, source);
    const original = firstBatch.dispose.bind(firstBatch);
    let blocked = true;
    const dispose = vi.spyOn(firstBatch, "dispose").mockImplementation(() => {
      if (blocked) throw new Error("first renderer batch");
      original();
    });
    try {
      failure(() => first.dispose());
      expect(device.disposed).toBe(false);
      expect(peerBatch.disposed).toBe(false);
      expect(sharedBatch.disposed).toBe(false);
      expect(otherBatch.disposed).toBe(false);
      blocked = false;
      first.dispose();
      first.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(firstBatch.disposed).toBe(true);
      expect(peerBatch.disposed).toBe(false);
      expect(sharedBatch.disposed).toBe(false);
      peer.dispose();
      expect(device.disposed).toBe(true);
      expect(peerBatch.disposed).toBe(true);
      expect(sharedBatch.disposed).toBe(true);
      expect(otherBatch.disposed).toBe(false);
      expect(otherDevice.disposed).toBe(false);
    } finally {
      blocked = false;
      first.dispose(); peer.dispose(); other.dispose();
      geometry.dispose(); source.dispose();
    }
  });

  it("drains a lease that fails after disposal while an async frame is still in flight", async () => {
    const device = new MockRenderDevice();
    const owner = renderer(device), peer = renderer(device);
    const postError = new Error("late post release");
    let blocked = true, attempts = 0;
    const pool: RenderTargetPoolLike & { acquireLease: (desc: Parameters<RenderTargetPoolLike["acquire"]>[0]) => TargetPoolLease } = {
      acquire: desc => device.createRenderTarget({ ...desc, sampleCount: desc.samples }),
      release() {}, trim() {},
      acquireLease(desc) {
        const target = this.acquire(desc);
        return { target, release() { attempts += 1; if (blocked) throw postError; } };
      }
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    let resume!: (pixels: Uint8Array) => void;
    let started!: () => void;
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
    const frame = owner.renderAsync({ renderItems: [], postprocess: chain });
    try {
      await entered;
      owner.dispose();
      expect(device.disposed).toBe(false);
      expect(attempts).toBe(0);
      resume(new Uint8Array(16));
      const frameError = await frame.then(() => undefined, error => error as unknown);
      expect(containsError(frameError, postError)).toBe(true);
      expect(attempts).toBeGreaterThan(0);
      const before = attempts;
      blocked = false;
      owner.dispose();
      expect(attempts).toBeGreaterThan(before);
      const completed = attempts;
      owner.dispose();
      expect(attempts).toBe(completed);
    } finally {
      blocked = false;
      owner.dispose(); peer.dispose();
    }
  });

  it("drains an actual failed pool retirement before leaving a shared device alive", () => {
    const device = new MockRenderDevice();
    const owner = renderer(device), peer = renderer(device);
    const pool = new RenderTargetPool(device);
    const error = new Error("lost pooled target disposal");
    const targets: RenderTarget[] = [], attempts: number[] = [];
    let blocked = true;
    const create = device.createRenderTarget.bind(device);
    vi.spyOn(device, "createRenderTarget").mockImplementation(desc => {
      const target = create(desc);
      if (desc.label === "render-target-pool") {
        const index = targets.push(target) - 1;
        const dispose = target.dispose.bind(target);
        target.dispose = () => {
          attempts[index] = (attempts[index] ?? 0) + 1;
          if (index === 0 && blocked) throw error;
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
    try {
      // The renderer may surface the concurrent context-loss error after the
      // pool failure; the failed retirement must remain owned either way.
      expect(() => owner.render({ renderItems: [], postprocess: chain })).toThrow();
      expect(attempts).toEqual([1, 1]);
      device.contextLost = false;
      blocked = false;
      owner.dispose();
      expect(attempts).toEqual([2, 1]);
      expect(targets.every(target => target.disposed)).toBe(true);
      expect(device.disposed).toBe(false);
      owner.dispose();
      expect(attempts).toEqual([2, 1]);
    } finally {
      device.contextLost = false;
      blocked = false;
      owner.dispose(); pool.dispose(); peer.dispose();
    }
  });

  it("does not dispose a new shared-device owner created reentrantly by batch cleanup", () => {
    const device = new MockRenderDevice();
    const first = renderer(device);
    const geometry = Geometry.litTriangle(), source = new PBRMaterial();
    const oldBatch = batch(device, geometry, source);
    const original = oldBatch.dispose.bind(oldBatch);
    let next: Renderer | undefined, newBatch: InstancedPBRMaterial | undefined;
    let blocked = true;
    const dispose = vi.spyOn(oldBatch, "dispose").mockImplementation(() => {
      if (blocked) {
        next = renderer(device);
        newBatch = batch(device, geometry, source);
        throw new Error("old shared cache failed");
      }
      original();
    });
    try {
      failure(() => first.dispose());
      expect(next).toBeDefined();
      expect(device.disposed).toBe(false);
      expect(newBatch!.disposed).toBe(false);
      first.dispose();
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(newBatch!.disposed).toBe(false);
      blocked = false;
      next!.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(oldBatch.disposed).toBe(true);
      expect(newBatch!.disposed).toBe(true);
      expect(device.disposed).toBe(true);
      first.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
    } finally {
      blocked = false;
      first.dispose(); next?.dispose();
      geometry.dispose(); source.dispose();
    }
  });
});
