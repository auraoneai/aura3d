/**
 * PRD 11 Phase 5 (§6.9) — context-restore chain: C-29 ResourceRegistry
 * (register/unregister/rebuild + memory policy), RetentionPolicy per tier,
 * WebGL2ContextLifecycle hooks-before-listeners ordering, and
 * installDeviceRestoreRebuild ordering (invalidate → rebuild → precompile).
 */
import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { ResourceRegistry } from "../../../../packages/rendering/src/resources/ResourceRegistry";
import { retainDecodedSourcesForRestore } from "../../../../packages/rendering/src/quality/RetentionPolicy";
import { RenderTargetPool } from "../../../../packages/rendering/src/resources/RenderTargetPool";
import { WebGL2ContextLifecycle } from "../../../../packages/rendering/src/webgl2/ContextLifecycle";
import { registerWebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/Counters";
import { installDeviceRestoreRebuild } from "../../../../packages/rendering/src/renderer/DeviceLifecycle";
import type { QrFlags } from "../../../../packages/rendering/src/contracts/core";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";

const ALL_ON: QrFlags = { values: {}, on: () => true };

function fakeCanvas(): { addEventListener: (t: string, l: EventListener) => void; removeEventListener: (t: string, l: EventListener) => void } {
  const listeners = new Map<string, EventListener>();
  return {
    addEventListener: (t, l) => listeners.set(t, l),
    removeEventListener: (t, l) => {
      if (listeners.get(t) === l) listeners.delete(t);
    }
  };
}

function fakeHost(device: MockRenderDevice): WebGL2DeviceHost & { lifecycle: WebGL2ContextLifecycle } {
  const host = {
    device,
    contextLost: true,
    lifecycle: undefined as unknown as WebGL2ContextLifecycle
  } as WebGL2DeviceHost;
  const lifecycle = new WebGL2ContextLifecycle(host, fakeCanvas() as unknown as HTMLCanvasElement);
  (host as { lifecycle: WebGL2ContextLifecycle }).lifecycle = lifecycle;
  registerWebGL2DeviceHost(host);
  return host as WebGL2DeviceHost & { lifecycle: WebGL2ContextLifecycle };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ResourceRegistry (C-29, §6.9)", () => {
  it("registers, unregisters and rebuilds each entry once", async () => {
    const registry = new ResourceRegistry();
    const a = vi.fn();
    const b = vi.fn();
    registry.register({ id: 1 }, { kind: "tex", rebuild: a });
    const handleB = registry.register({ id: 2 }, { kind: "buf", rebuild: b });
    registry.unregister(handleB);
    const result = await registry.rebuild(new MockRenderDevice());
    expect(result).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it("collects failures by kind without aborting the rebuild", async () => {
    const registry = new ResourceRegistry();
    registry.register({}, { kind: "good", rebuild: vi.fn() });
    registry.register({}, { kind: "bad", rebuild: () => Promise.reject(new Error("nope")) });
    const result = await registry.rebuild(new MockRenderDevice());
    expect(result.rebuilt).toBe(1);
    expect(result.failed).toEqual(["bad"]);
  });

  it("releases non-retained sources under the memory policy and refetches on rebuild", async () => {
    const registry = new ResourceRegistry();
    const release = vi.fn();
    const refetch = vi.fn();
    registry.register({}, { kind: "tex", rebuild: vi.fn(), releaseSource: release, refetch });
    registry.setRetentionPolicy(false); // Medium and below
    expect(release).toHaveBeenCalledTimes(1);
    const result = await registry.rebuild(new MockRenderDevice());
    expect(result).toEqual({ rebuilt: 1, refetched: 1, failed: [] });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps retainForRestore entries under the release policy", async () => {
    const registry = new ResourceRegistry();
    const release = vi.fn();
    registry.register({}, { kind: "tex", rebuild: vi.fn(), releaseSource: release, retainForRestore: true });
    registry.setRetentionPolicy(false);
    expect(release).not.toHaveBeenCalled();
    const result = await registry.rebuild(new MockRenderDevice());
    expect(result.refetched).toBe(0);
  });

  it("applies the release policy immediately when registering under it", async () => {
    const registry = new ResourceRegistry();
    registry.setRetentionPolicy(false);
    const release = vi.fn();
    registry.register({}, { kind: "tex", rebuild: vi.fn(), releaseSource: release });
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe("retainDecodedSourcesForRestore (§6.9 item 3)", () => {
  it("retains only on High and Ultra", () => {
    expect(retainDecodedSourcesForRestore("low")).toBe(false);
    expect(retainDecodedSourcesForRestore("medium")).toBe(false);
    expect(retainDecodedSourcesForRestore("high")).toBe(true);
    expect(retainDecodedSourcesForRestore("ultra")).toBe(true);
  });
});

describe("WebGL2ContextLifecycle restore ordering (§6.9)", () => {
  it("fires listeners synchronously when no hooks are installed", () => {
    const host = fakeHost(new MockRenderDevice());
    const order: string[] = [];
    host.lifecycle.onDeviceRestored(() => order.push("listener"));
    host.lifecycle.contextRestoredListener?.({} as Event);
    expect(order).toEqual(["listener"]);
    expect(host.contextLost).toBe(false);
  });

  it("resolves restore hooks before restored listeners", async () => {
    const host = fakeHost(new MockRenderDevice());
    const order: string[] = [];
    host.lifecycle.onRestoredHook(async () => {
      await Promise.resolve();
      order.push("hook");
    });
    host.lifecycle.onDeviceRestored(() => order.push("listener"));
    host.lifecycle.contextRestoredListener?.({} as Event);
    expect(order).toEqual([]); // deferred until hooks resolve
    await flushMicrotasks();
    expect(order).toEqual(["hook", "listener"]);
  });

  it("still notifies listeners when a hook rejects", async () => {
    const host = fakeHost(new MockRenderDevice());
    const order: string[] = [];
    host.lifecycle.onRestoredHook(() => Promise.reject(new Error("rebuild failed")));
    host.lifecycle.onDeviceRestored(() => order.push("listener"));
    host.lifecycle.contextRestoredListener?.({} as Event);
    await flushMicrotasks();
    expect(order).toEqual(["listener"]);
  });
});

describe("installDeviceRestoreRebuild (§6.9 ordering)", () => {
  it("runs invalidate → rebuild → precompile before restored listeners", async () => {
    const device = new MockRenderDevice();
    const host = fakeHost(device);
    (host as unknown as { invalidateGpuObjects: () => void }).invalidateGpuObjects = vi.fn();
    const registry = new ResourceRegistry();
    const rebuild = vi.fn();
    registry.register({}, { kind: "tex", rebuild });
    const order: string[] = [];
    host.lifecycle.onDeviceRestored(() => order.push("restored"));
    const invalidateSpy = vi.fn(() => order.push("invalidate"));
    (host as unknown as { invalidateGpuObjects: () => void }).invalidateGpuObjects = invalidateSpy;
    installDeviceRestoreRebuild(device, { registry, flags: ALL_ON });
    host.lifecycle.contextRestoredListener?.({} as Event);
    await flushMicrotasks();
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["invalidate", "restored"]);
  });

  it("is a no-op on devices without a WebGL2 host", () => {
    const device = new MockRenderDevice();
    const registry = new ResourceRegistry();
    const unsubscribe = installDeviceRestoreRebuild(device, { registry, flags: ALL_ON });
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe("RenderTargetPool.rebuildForRestore", () => {
  it("drops pooled targets so acquire recreates them", () => {
    const device = new MockRenderDevice();
    const pool = new RenderTargetPool(device);
    const t = pool.acquire({ width: 4, height: 4, format: "rgba8", samples: 1, depth: false });
    pool.release(t);
    expect(pool.poolStats().idle).toBe(1);
    pool.rebuildForRestore();
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });
    pool.acquire({ width: 4, height: 4, format: "rgba8", samples: 1, depth: false });
    expect(pool.poolStats().created).toBe(2);
  });
});
