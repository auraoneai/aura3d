import { describe, expect, it, vi } from "vitest";

import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { ResourceLifecycle, resourceDisposalPending } from "../../../packages/rendering/src/ResourceLifecycle";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import { frameContributors, type FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { prd11RenderTargetPoolFor } from "../../../packages/rendering/src/lanes/prd11";
import { sharedResourceRegistry } from "../../../packages/rendering/src/resources/ResourceRegistry";
import { WebGL2ContextLifecycle } from "../../../packages/rendering/src/webgl2/ContextLifecycle";
import { registerWebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import { ParticleGpuSim } from "../../../packages/rendering/src/vfx/ParticleGpuSim";

const desc = { width: 8, height: 8, format: "rgba8", samples: 1, depth: false } as const;
const flags: QrFlags = { values: { A3D_QR_TIERS: true }, on: (name) => name === "A3D_QR_TIERS" };

function makeDevice() {
  const device = new MockRenderDevice();
  const nativeDispose = vi.fn(() => { device.disposed = true; });
  device.dispose = nativeDispose;
  return { device, nativeDispose };
}

function caughtError(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  return undefined;
}

function leafErrors(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors.flatMap(leafErrors) : [error];
}

function installRestore(device: MockRenderDevice, beforeCollect?: (lifecycle: WebGL2ContextLifecycle) => void): WebGL2ContextLifecycle {
  // Deliberate double: a MockRenderDevice stands in for the host's WebGL2Device; the lifecycle only
  // reads contextLost and forwards loss/restore to the device hooks installed below.
  const host = { device, contextLost: false } as unknown as WebGL2DeviceHost;
  const lifecycle = new WebGL2ContextLifecycle(host, new EventTarget() as unknown as HTMLCanvasElement);
  Object.assign(host, { lifecycle });
  Object.assign(device, {
    onDeviceLost: lifecycle.onDeviceLost.bind(lifecycle),
    isDeviceLost: lifecycle.isDeviceLost.bind(lifecycle)
  });
  registerWebGL2DeviceHost(host);
  beforeCollect?.(lifecycle);
  const contributor = frameContributors(flags).find((entry) => entry.id === "prd11.contextRestore");
  const context: FrameContributorContext = {
    device, width: 8, height: 8, frameIndex: 1, timeSeconds: 0, camera: null,
    source: {}, items: [], tier: {} as never, flags,
    sceneDepth: { texture: null, linearize: { near: 0.1, far: 100, orthographic: false }, available: false },
    blackboard: new Map()
  };
  contributor!.collect!([], context);
  return lifecycle;
}

describe("PRD-11 device disposal retry", () => {
  it("retries a failed pool once without repeating native cleanup or touching a peer", () => {
    const a = makeDevice();
    const b = makeDevice();
    const pool = prd11RenderTargetPoolFor(a.device);
    const peerPool = prd11RenderTargetPoolFor(b.device);
    const target = pool.acquireLease(desc).target;
    const peer = peerPool.acquireLease(desc);
    const original = pool.dispose.bind(pool);
    const failure = new Error("pool cleanup failed");
    const dispose = vi.spyOn(pool, "dispose")
      .mockImplementationOnce(() => { a.device.dispose(); throw failure; })
      .mockImplementation(original);
    const targetDispose = vi.spyOn(target, "dispose");
    try {
      const error = caughtError(() => a.device.dispose());
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([failure]);
      expect(a.nativeDispose).toHaveBeenCalledTimes(1);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(() => prd11RenderTargetPoolFor(a.device)).toThrow(/disposed/i);
      expect(peer.target.disposed).toBe(false);

      a.device.dispose();
      a.device.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(a.nativeDispose).toHaveBeenCalledTimes(1);
      expect(targetDispose).toHaveBeenCalledTimes(1);
      expect(target.disposed).toBe(true);
      expect(peer.target.disposed).toBe(false);
      expect(prd11RenderTargetPoolFor(b.device)).toBe(peerPool);
    } finally {
      dispose.mockRestore();
      pool.dispose();
      peer.release();
      peerPool.dispose();
      a.device.dispose();
      b.device.dispose();
    }
  });

  it("reports device and pool errors and retries each failed owner", () => {
    const { device, nativeDispose } = makeDevice();
    const deviceFailure = new Error("device cleanup failed");
    const poolFailure = new Error("pool cleanup failed");
    nativeDispose.mockImplementationOnce(() => { throw deviceFailure; })
      .mockImplementation(() => { device.disposed = true; });
    const pool = prd11RenderTargetPoolFor(device);
    const original = pool.dispose.bind(pool);
    const dispose = vi.spyOn(pool, "dispose").mockImplementationOnce(() => { throw poolFailure; }).mockImplementation(original);
    try {
      const error = caughtError(() => device.dispose());
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([deviceFailure, poolFailure]);
      device.dispose();
      device.dispose();
      expect(nativeDispose).toHaveBeenCalledTimes(2);
      expect(dispose).toHaveBeenCalledTimes(2);
    } finally {
      dispose.mockRestore();
      pool.dispose();
      device.dispose();
    }
  });

  it("does not repeat a successfully closed pool when native disposal needs a retry", () => {
    const { device, nativeDispose } = makeDevice();
    nativeDispose.mockImplementationOnce(() => { throw new Error("device cleanup failed"); })
      .mockImplementation(() => { device.disposed = true; });
    const pool = prd11RenderTargetPoolFor(device);
    const dispose = vi.spyOn(pool, "dispose");
    try {
      expect(() => device.dispose()).toThrow(AggregateError);
      device.dispose();
      device.dispose();
      expect(nativeDispose).toHaveBeenCalledTimes(2);
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      dispose.mockRestore();
      pool.dispose();
      device.dispose();
    }
  });

  it.each(["pool-first", "hook-first"] as const)("retains retries with %s restore-hook installation", (order) => {
    const { device, nativeDispose } = makeDevice();
    const initialPool = order === "pool-first" ? prd11RenderTargetPoolFor(device) : undefined;
    const lifecycle = installRestore(device);
    const pool = initialPool ?? prd11RenderTargetPoolFor(device);
    const target = pool.acquireLease(desc).target;
    const original = pool.dispose.bind(pool);
    const dispose = vi.spyOn(pool, "dispose").mockImplementationOnce(() => { throw new Error("pool cleanup failed"); }).mockImplementation(original);
    try {
      expect(lifecycle.restoredHooks.size).toBe(1);
      expect(() => device.dispose()).toThrow(AggregateError);
      expect(lifecycle.restoredHooks.size).toBe(0);
      device.dispose();
      device.dispose();
      expect(nativeDispose).toHaveBeenCalledTimes(1);
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(target.disposed).toBe(true);
    } finally {
      dispose.mockRestore();
      pool.dispose();
      device.dispose();
    }
  });

  it("retries a restore unsubscribe without repeating a successful device or pool close", () => {
    const { device, nativeDispose } = makeDevice();
    let attempts = 0;
    const lifecycle = installRestore(device, (lifecycle) => {
      const register = lifecycle.onRestoredHook.bind(lifecycle);
      vi.spyOn(lifecycle, "onRestoredHook").mockImplementation((hook) => {
        const unsubscribe = register(hook);
        return () => {
          attempts += 1;
          if (attempts === 1) throw new Error("restore unsubscribe failed");
          unsubscribe();
        };
      });
    });
    const pool = prd11RenderTargetPoolFor(device);
    const dispose = vi.spyOn(pool, "dispose");
    try {
      expect(() => device.dispose()).toThrow(AggregateError);
      expect(lifecycle.restoredHooks.size).toBe(1);
      device.dispose();
      device.dispose();
      expect(attempts).toBe(2);
      expect(lifecycle.restoredHooks.size).toBe(0);
      expect(nativeDispose).toHaveBeenCalledTimes(1);
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      dispose.mockRestore();
      pool.dispose();
      device.dispose();
    }
  });

  it("keeps the device owned by a parent lifecycle until pool cleanup completes", () => {
    const { device, nativeDispose } = makeDevice();
    const pool = prd11RenderTargetPoolFor(device);
    const original = pool.dispose.bind(pool);
    const dispose = vi.spyOn(pool, "dispose").mockImplementationOnce(() => { throw new Error("pool cleanup failed"); }).mockImplementation(original);
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    try {
      expect(() => lifecycle.dispose()).toThrow(AggregateError);
      expect(lifecycle.leakCount()).toBe(1);
      expect(lifecycle.disposed).toBe(false);
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(nativeDispose).toHaveBeenCalledTimes(1);
    } finally {
      dispose.mockRestore();
      pool.dispose();
      lifecycle.dispose();
    }
  });

  it("retries a native disposer that returns while its completion signal is pending", () => {
    const { device, nativeDispose } = makeDevice();
    const pendingDevice = device as MockRenderDevice & { readonly [resourceDisposalPending]: boolean };
    let nativePending = false;
    Object.defineProperty(device, resourceDisposalPending, { configurable: true, get: () => nativePending });
    nativeDispose.mockImplementationOnce(() => { device.disposed = true; nativePending = true; })
      .mockImplementation(() => { nativePending = false; });
    const pool = prd11RenderTargetPoolFor(device);
    const dispose = vi.spyOn(pool, "dispose");
    try {
      device.dispose();
      expect(pendingDevice[resourceDisposalPending]).toBe(true);
      device.dispose();
      device.dispose();
      expect(nativeDispose).toHaveBeenCalledTimes(2);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(pendingDevice[resourceDisposalPending]).toBe(false);
    } finally {
      dispose.mockRestore();
      pool.dispose();
      device.dispose();
    }
  });

  it.each([
    ["pool-first", "returns"],
    ["particle-first", "returns"],
    ["no-pool", "returns"],
    ["pool-first", "throws"],
    ["particle-first", "throws"],
    ["no-pool", "throws"]
  ] as const)("reopens a finished %s coordinator when late native work %s", (order, outcome) => {
    const device = new MockRenderDevice();
    const peerDevice = new MockRenderDevice();
    const pendingDevice = device as MockRenderDevice & { readonly [resourceDisposalPending]: boolean };
    let pending = false;
    let fail = outcome === "throws";
    const failure = new Error("late native cleanup failed");
    Object.defineProperty(device, resourceDisposalPending, { configurable: true, get: () => pending });
    const nativeDispose = vi.fn(() => {
      device.disposed = true;
      if (pending) {
        device.dispose(); // A nested close cannot start a second native attempt.
        if (fail) throw failure;
        pending = false;
      }
    });
    device.dispose = nativeDispose;
    const earlyPool = order === "pool-first" ? prd11RenderTargetPoolFor(device) : undefined;
    const sim = new ParticleGpuSim(device, { capacity: 4, lifetimeMax: 2 });
    const pool = order === "no-pool" ? undefined : earlyPool ?? prd11RenderTargetPoolFor(device);
    const pooled = pool?.acquireLease(desc);
    const particleTargetDispose = vi.spyOn(sim.state!.posTarget, "dispose");
    const poolDispose = pool ? vi.spyOn(pool, "dispose") : undefined;

    const peer = new ParticleGpuSim(peerDevice, { capacity: 4, lifetimeMax: 2 });
    const peerTarget = peer.state!.posTarget;
    const peerPool = prd11RenderTargetPoolFor(peerDevice);
    const peerLease = peerPool.acquireLease(desc);
    const lifecycle = new ResourceLifecycle();
    try {
      device.dispose();
      expect(pendingDevice[resourceDisposalPending]).toBe(false);
      expect(nativeDispose).toHaveBeenCalledOnce();
      expect(particleTargetDispose).toHaveBeenCalledOnce();
      if (poolDispose) expect(poolDispose).toHaveBeenCalledOnce();
      if (pooled) expect(pooled.target.disposed).toBe(true);

      pending = true;
      expect(pendingDevice[resourceDisposalPending]).toBe(true);
      lifecycle.track(device);
      if (fail) {
        expect(leafErrors(caughtError(() => lifecycle.dispose()))).toContain(failure);
        expect(lifecycle.leakCount()).toBe(1);
        expect(pending).toBe(true);
        fail = false;
      }
      lifecycle.dispose();
      lifecycle.dispose();
      device.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(pendingDevice[resourceDisposalPending]).toBe(false);
      expect(nativeDispose).toHaveBeenCalledTimes(outcome === "throws" ? 3 : 2);
      expect(particleTargetDispose).toHaveBeenCalledOnce();
      if (poolDispose) expect(poolDispose).toHaveBeenCalledOnce();
      expect(peerTarget.disposed).toBe(false);
      expect(peerLease.target.disposed).toBe(false);
    } finally {
      pending = false;
      poolDispose?.mockRestore();
      particleTargetDispose.mockRestore();
      lifecycle.dispose();
      pool?.dispose();
      sim.dispose();
      device.dispose();
      peerPool.dispose();
      peer.dispose();
      peerDevice.dispose();
    }
  });

  it("retries an unregister failure without rebuilding or repeating successful cleanup", async () => {
    const { device, nativeDispose } = makeDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const pool = prd11RenderTargetPoolFor(device);
    const unregisterOriginal = registry.unregister.bind(registry);
    const failure = new Error("unregister failed");
    const unregister = vi.spyOn(registry, "unregister").mockImplementationOnce(() => { throw failure; }).mockImplementation(unregisterOriginal);
    const dispose = vi.spyOn(pool, "dispose");
    const rebuild = vi.spyOn(pool, "rebuildForRestore");
    try {
      const error = caughtError(() => device.dispose());
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([failure]);
      expect(registry.size).toBe(before + 1);
      await registry.rebuild(device);
      expect(rebuild).not.toHaveBeenCalled();
      device.dispose();
      device.dispose();
      expect(unregister).toHaveBeenCalledTimes(2);
      expect(nativeDispose).toHaveBeenCalledTimes(1);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(registry.size).toBe(before);
    } finally {
      unregister.mockRestore();
      dispose.mockRestore();
      rebuild.mockRestore();
      registry.unregister(pool);
      pool.dispose();
      device.dispose();
    }
  });

  it("keeps a reentrant device close pending until the outer pool close finishes", () => {
    const { device, nativeDispose } = makeDevice();
    const pool = prd11RenderTargetPoolFor(device);
    const lease = pool.acquireLease(desc);
    lease.release();
    const original = lease.target.dispose.bind(lease.target);
    const failure = new Error("outer pool cleanup failed");
    const dispose = vi.spyOn(lease.target, "dispose")
      .mockImplementationOnce(() => { device.dispose(); throw failure; })
      .mockImplementation(original);
    try {
      expect(() => pool.dispose()).toThrow(AggregateError);
      expect(nativeDispose).toHaveBeenCalledTimes(1);
      expect(dispose).toHaveBeenCalledTimes(1);
      device.dispose();
      device.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(lease.target.disposed).toBe(true);
      expect(nativeDispose).toHaveBeenCalledTimes(1);
    } finally {
      dispose.mockRestore();
      pool.dispose();
      device.dispose();
    }
  });
});
