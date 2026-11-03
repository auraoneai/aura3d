import { describe, expect, it, vi } from "vitest";

import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import { frameContributors, type FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { prd11RenderTargetPoolFor } from "../../../packages/rendering/src/lanes/prd11";
import { ResourceRegistry, sharedResourceRegistry } from "../../../packages/rendering/src/resources/ResourceRegistry";
import { WebGL2ContextLifecycle } from "../../../packages/rendering/src/webgl2/ContextLifecycle";
import { registerWebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";

const flags: QrFlags = { values: { A3D_QR_TIERS: true }, on: (name) => name === "A3D_QR_TIERS" };
const targetDesc = { width: 8, height: 8, format: "rgba8", samples: 1, depth: false } as const;

function makeHostedDevice() {
  const device = new MockRenderDevice();
  // Deliberate double: a MockRenderDevice stands in for the host's WebGL2Device; the lifecycle only
  // reads contextLost and forwards loss/restore to the device hooks installed below.
  const host = { device, contextLost: false } as unknown as WebGL2DeviceHost;
  const canvas = new EventTarget();
  const lifecycle = new WebGL2ContextLifecycle(host, canvas as unknown as HTMLCanvasElement);
  Object.assign(host, { lifecycle });
  Object.assign(device, {
    onDeviceLost: lifecycle.onDeviceLost.bind(lifecycle),
    isDeviceLost: lifecycle.isDeviceLost.bind(lifecycle)
  });
  registerWebGL2DeviceHost(host);
  return { device, lifecycle };
}

function installRestore(device: MockRenderDevice): void {
  const contributor = frameContributors(flags).find((entry) => entry.id === "prd11.contextRestore");
  expect(contributor?.collect).toBeTypeOf("function");
  const context: FrameContributorContext = {
    device,
    width: 8,
    height: 8,
    frameIndex: 1,
    timeSeconds: 0,
    camera: null,
    source: {},
    items: [],
    tier: {} as never,
    flags,
    sceneDepth: { texture: null, linearize: { near: 0.1, far: 100, orthographic: false }, available: false },
    blackboard: new Map()
  };
  contributor!.collect!([], context);
}

async function restore(lifecycle: WebGL2ContextLifecycle): Promise<void> {
  const restored = new Promise<void>((resolve) => lifecycle.onDeviceRestored(resolve));
  lifecycle.contextRestoredListener!(new Event("webglcontextrestored"));
  await restored;
}

describe("WP-21 device restore isolation", () => {
  it("retires only the lost device's pool and preserves another device's active and idle leases", async () => {
    const a = makeHostedDevice();
    const b = makeHostedDevice();
    const poolA = prd11RenderTargetPoolFor(a.device);
    const poolB = prd11RenderTargetPoolFor(b.device);
    try {
      installRestore(a.device);
      installRestore(b.device);
      const oldA = poolA.acquireLease(targetDesc);
      const activeB = poolB.acquireLease(targetDesc);
      const idleB = poolB.acquireLease(targetDesc);
      idleB.release();

      a.lifecycle.contextLostListener!(new Event("webglcontextlost", { cancelable: true }));
      expect(oldA.target.disposed).toBe(true);
      expect(activeB.target.disposed).toBe(false);
      expect(idleB.target.disposed).toBe(false);
      await restore(a.lifecycle);

      expect(poolA.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });
      expect(activeB.target.disposed).toBe(false);
      expect(idleB.target.disposed).toBe(false);
      expect(poolB.poolStats()).toEqual({ idle: 1, inUse: 1, created: 2 });
      const freshA = poolA.acquireLease(targetDesc);
      expect(freshA.target).not.toBe(oldA.target);
      oldA.release();
      expect(poolA.poolStats()).toEqual({ idle: 0, inUse: 1, created: 2 });
      const reusedB = poolB.acquireLease(targetDesc);
      expect(reusedB.target).toBe(idleB.target);
      idleB.release();
      expect(poolB.poolStats()).toEqual({ idle: 0, inUse: 2, created: 2 });

      b.lifecycle.contextLostListener!(new Event("webglcontextlost", { cancelable: true }));
      expect(activeB.target.disposed).toBe(true);
      expect(reusedB.target.disposed).toBe(true);
      await restore(b.lifecycle);
      expect(freshA.target.disposed).toBe(false);
      expect(poolA.poolStats()).toEqual({ idle: 0, inUse: 1, created: 2 });
      const freshB = poolB.acquireLease(targetDesc);
      expect(freshB.target).not.toBe(activeB.target);
      expect(freshB.target).not.toBe(reusedB.target);
      activeB.release();
      reusedB.release();
      expect(poolB.poolStats()).toEqual({ idle: 0, inUse: 1, created: 3 });
      freshA.release();
      freshB.release();
    } finally {
      poolA.dispose();
      poolB.dispose();
      a.device.dispose();
      b.device.dispose();
    }
  });

  it("removes a device pool's restore entry and loss listener on repeated device disposal", () => {
    const a = makeHostedDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const pool = prd11RenderTargetPoolFor(a.device);
    const lease = pool.acquireLease(targetDesc);
    const disposeTarget = vi.spyOn(lease.target, "dispose");
    try {
      expect(registry.size).toBe(before + 1);
      expect(a.lifecycle.deviceLostListeners.size).toBe(1);
      a.device.dispose();
      a.device.dispose();
      expect(registry.size).toBe(before);
      expect(a.lifecycle.deviceLostListeners.size).toBe(0);
      expect(lease.target.disposed).toBe(true);
      expect(disposeTarget).toHaveBeenCalledOnce();
      expect(() => pool.acquireLease(targetDesc)).toThrow(/disposed/i);
      expect(() => prd11RenderTargetPoolFor(a.device)).toThrow(/disposed/i);
    } finally {
      pool.dispose();
    }
  });

  it("unsubscribes the restore hook when a device without a target pool is disposed", () => {
    const a = makeHostedDevice();
    installRestore(a.device);
    expect(a.lifecycle.restoredHooks.size).toBe(1);
    a.device.dispose();
    expect(a.lifecycle.restoredHooks.size).toBe(0);
  });

  it.each(["pool-first", "hook-first"])("cleans both hooks in %s installation order", (order) => {
    const a = makeHostedDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const pool = order === "pool-first" ? prd11RenderTargetPoolFor(a.device) : undefined;
    installRestore(a.device);
    const activePool = pool ?? prd11RenderTargetPoolFor(a.device);
    const lease = activePool.acquireLease(targetDesc);
    const disposeTarget = vi.spyOn(lease.target, "dispose");
    try {
      expect(a.lifecycle.restoredHooks.size).toBe(1);
      expect(a.lifecycle.deviceLostListeners.size).toBe(1);
      a.device.dispose();
      a.device.dispose();
      expect(a.lifecycle.restoredHooks.size).toBe(0);
      expect(a.lifecycle.deviceLostListeners.size).toBe(0);
      expect(registry.size).toBe(before);
      expect(disposeTarget).toHaveBeenCalledOnce();
      installRestore(a.device);
      expect(a.lifecycle.restoredHooks.size).toBe(0);
    } finally {
      activePool.dispose();
    }
  });

  it("retries failed device and pool cleanup without repeating successful siblings", () => {
    const a = makeHostedDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const deviceFailure = new Error("device disposal failed");
    const targetFailure = new Error("target disposal failed");
    const originalDispose = vi.fn((): void => { throw deviceFailure; });
    Object.assign(a.device, { dispose: originalDispose });
    const pool = prd11RenderTargetPoolFor(a.device);
    const bad = pool.acquireLease(targetDesc);
    const good = pool.acquireLease(targetDesc);
    const badDispose = vi.spyOn(bad.target, "dispose").mockImplementation(() => { throw targetFailure; });
    const goodDispose = vi.spyOn(good.target, "dispose");
    try {
      let failure: unknown;
      try {
        a.device.dispose();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([deviceFailure, targetFailure]);
      expect(goodDispose).toHaveBeenCalledOnce();
      expect(good.target.disposed).toBe(true);
      expect(a.lifecycle.deviceLostListeners.size).toBe(0);
      expect(registry.size).toBe(before);
      expect(() => prd11RenderTargetPoolFor(a.device)).toThrow(/disposed/i);

      let repeatedFailure: unknown;
      try { a.device.dispose(); } catch (error) { repeatedFailure = error; }
      expect(repeatedFailure).toBeInstanceOf(AggregateError);
      expect((repeatedFailure as AggregateError).errors).toEqual([deviceFailure, targetFailure]);
      expect(originalDispose).toHaveBeenCalledTimes(2);
      expect(badDispose).toHaveBeenCalledTimes(2);
      expect(goodDispose).toHaveBeenCalledOnce();

      originalDispose.mockImplementation(() => { a.device.disposed = true; });
      let poolFailure: unknown;
      try { a.device.dispose(); } catch (error) { poolFailure = error; }
      expect(poolFailure).toBeInstanceOf(AggregateError);
      expect((poolFailure as AggregateError).errors).toEqual([targetFailure]);
      expect(originalDispose).toHaveBeenCalledTimes(3);
      expect(badDispose).toHaveBeenCalledTimes(3);
      expect(goodDispose).toHaveBeenCalledOnce();

      badDispose.mockRestore();
      expect(() => a.device.dispose()).not.toThrow();
      expect(() => a.device.dispose()).not.toThrow();
      expect(bad.target.disposed).toBe(true);
      expect(originalDispose).toHaveBeenCalledTimes(3);
      expect(goodDispose).toHaveBeenCalledOnce();
    } finally {
      badDispose.mockRestore();
      originalDispose.mockImplementation(() => { a.device.disposed = true; });
      a.device.dispose();
      pool.dispose();
    }
  });

  it("rebuilds and refetches owned resources only for their device while keeping legacy registrations", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const registry = new ResourceRegistry();
    const rebuildA = vi.fn();
    const rebuildB = vi.fn();
    const legacy = vi.fn();
    const refetchA = vi.fn();
    const refetchB = vi.fn();
    registry.register({}, { kind: "a", device: a, rebuild: rebuildA, refetch: refetchA, releaseSource: () => undefined });
    registry.register({}, { kind: "b", device: b, rebuild: rebuildB, refetch: refetchB, releaseSource: () => undefined });
    registry.register({}, { kind: "legacy", rebuild: legacy });
    registry.register({}, { kind: "failed-b", device: b, rebuild: () => { throw new Error("failed b"); } });
    registry.setRetentionPolicy(false);
    try {
      expect(await registry.rebuild(a)).toEqual({ rebuilt: 2, refetched: 1, failed: [] });
      expect(rebuildA).toHaveBeenCalledOnce();
      expect(refetchA).toHaveBeenCalledOnce();
      expect(rebuildB).not.toHaveBeenCalled();
      expect(refetchB).not.toHaveBeenCalled();
      expect(legacy).toHaveBeenCalledOnce();
      expect(await registry.rebuild(b)).toEqual({ rebuilt: 2, refetched: 1, failed: ["failed-b"] });
      expect(rebuildA).toHaveBeenCalledOnce();
      expect(rebuildB).toHaveBeenCalledOnce();
      expect(refetchB).toHaveBeenCalledOnce();
      expect(legacy).toHaveBeenCalledTimes(2);
    } finally {
      a.dispose();
      b.dispose();
    }
  });

  it("does not rebuild an unregistered resource after its pending refetch completes", async () => {
    const device = new MockRenderDevice();
    const registry = new ResourceRegistry();
    const handle = {};
    const rebuild = vi.fn();
    let finishRefetch!: () => void;
    const pending = new Promise<void>((resolve) => { finishRefetch = resolve; });
    const refetch = vi.fn(() => pending);
    registry.register(handle, { kind: "texture", rebuild, refetch, releaseSource: () => undefined });
    registry.setRetentionPolicy(false);
    try {
      const restoring = registry.rebuild(device);
      expect(refetch).toHaveBeenCalledOnce();
      registry.unregister(handle);
      finishRefetch();
      expect(await restoring).toEqual({ rebuilt: 0, refetched: 1, failed: [] });
      expect(rebuild).not.toHaveBeenCalled();
    } finally {
      finishRefetch();
      device.dispose();
    }
  });

  it("does not rebuild a new registration as part of an older pending restore", async () => {
    const device = new MockRenderDevice();
    const registry = new ResourceRegistry();
    const handle = {};
    const oldRebuild = vi.fn();
    const newRebuild = vi.fn();
    let finishRefetch!: () => void;
    const pending = new Promise<void>((resolve) => { finishRefetch = resolve; });
    registry.register(handle, { kind: "old", rebuild: oldRebuild, refetch: () => pending, releaseSource: () => undefined });
    registry.setRetentionPolicy(false);
    try {
      const restoring = registry.rebuild(device);
      registry.unregister(handle);
      registry.register(handle, { kind: "new", rebuild: newRebuild });
      finishRefetch();
      expect(await restoring).toEqual({ rebuilt: 0, refetched: 1, failed: [] });
      expect(oldRebuild).not.toHaveBeenCalled();
      expect(newRebuild).not.toHaveBeenCalled();
      expect(await registry.rebuild(device)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(newRebuild).toHaveBeenCalledOnce();
    } finally {
      finishRefetch();
      device.dispose();
    }
  });
});
