import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { reserveTextureBudget, textureBudgetReport } from "../../../packages/rendering/src/textures/TextureBudget";
import { webgl2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";

type Call = { readonly name: string; readonly args: readonly unknown[] };
type FakeSync = { readonly id: number };

/** A device-shaped recorder: no browser or GPU is used. */
function makeDevice() {
  const calls: Call[] = [];
  const listeners = new Map<string, Set<EventListener>>();
  const constants = new Map<string, number>([["NO_ERROR", 0], ["NONE", 0]]);
  const constant = (name: string): number => {
    if (!constants.has(name)) constants.set(name, 0x1000 + constants.size);
    return constants.get(name)!;
  };
  const hooks: {
    fence?: (sync: FakeSync) => void;
    flush?: () => void;
    wait?: (sync: FakeSync) => void;
    deleteTexture?: (texture: WebGLTexture) => void;
  } = {};
  let lost = false;
  let nextId = 0;
  let noFence = false;
  let wait = constant("TIMEOUT_EXPIRED");
  const methods: Record<string, unknown> = {
    getError: () => constant("NO_ERROR"),
    getParameter: () => 16,
    getExtension: () => null,
    isContextLost: () => lost,
    fenceSync: (condition: number, flags: number) => {
      const sync: FakeSync = { id: ++nextId };
      calls.push({ name: "fenceSync", args: [condition, flags, sync] });
      if (noFence) return null;
      hooks.fence?.(sync);
      return sync;
    },
    flush: () => { calls.push({ name: "flush", args: [] }); hooks.flush?.(); },
    clientWaitSync: (sync: FakeSync, flags: number, timeout: number) => {
      calls.push({ name: "clientWaitSync", args: [sync, flags, timeout] });
      hooks.wait?.(sync);
      return wait;
    },
    deleteSync: (sync: FakeSync) => { calls.push({ name: "deleteSync", args: [sync] }); },
    deleteTexture: (texture: WebGLTexture) => {
      calls.push({ name: "deleteTexture", args: [texture] });
      hooks.deleteTexture?.(texture);
    }
  };
  const gl = new Proxy({}, {
    get(_target, property) {
      const name = String(property);
      if (name in methods) return methods[name];
      if (/^[A-Z0-9_]+$/.test(name)) return constant(name);
      return () => undefined;
    }
  }) as WebGL2RenderingContext;
  const canvas = {
    getContext: () => gl,
    addEventListener: (name: string, listener: EventListener) => {
      let group = listeners.get(name);
      if (!group) listeners.set(name, group = new Set());
      group.add(listener);
    },
    removeEventListener: (name: string, listener: EventListener) => listeners.get(name)?.delete(listener)
  } as unknown as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas, textureBudgetPolicy: { maxBytes: 256 } });
  const host = webgl2DeviceHost(device)!;
  const dispatch = (name: string): void => {
    for (const listener of [...(listeners.get(name) ?? [])]) listener({ preventDefault() {} } as Event);
  };
  return {
    calls, constant, device, host, hooks,
    record: (name: string) => calls.push({ name, args: [] }),
    listeners: (name: string) => listeners.get(name)?.size ?? 0,
    setWait: (name: string) => { wait = constant(name); },
    setNoFence: (value: boolean) => { noFence = value; },
    lose: () => { lost = true; dispatch("webglcontextlost"); },
    restore: () => { lost = false; dispatch("webglcontextrestored"); }
  };
}

const named = (calls: readonly Call[], name: string): Call[] => calls.filter(call => call.name === name);
const texture = (name: string): WebGLTexture => ({ name }) as unknown as WebGLTexture;

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("WebGL volume owner and deferred texture retirement", () => {
  it("keeps the loss listener through a late frame release and its pending fence", async () => {
    const ctx = makeDevice();
    const registry = ctx.host.textureRegistry;
    const handle = texture("old-volume");
    const debit = vi.fn(reserveTextureBudget(48, 256, ctx.device));
    const close = vi.fn(() => { expect(ctx.device.disposed).toBe(true); });
    const unregister = registry.registerNativeTextureOwner(close);
    ctx.device.dispose();
    expect(close).toHaveBeenCalledTimes(1);
    expect(ctx.listeners("webglcontextlost")).toBe(1);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(48);
    expect(() => registry.registerNativeTextureOwner(() => {})).toThrow();
    let drained = false;
    registry.onNativeRetirementsDrained(() => { drained = true; });
    expect(drained).toBe(false);

    // Simulate an async/prepared frame releasing after device disposal.
    const retired = registry.retireNativeTexturesAfterStack([handle], debit);
    unregister(); unregister();
    expect(drained).toBe(false);
    expect(ctx.listeners("webglcontextlost")).toBe(1);
    expect(named(ctx.calls, "fenceSync")).toHaveLength(0);
    await Promise.resolve();
    expect(named(ctx.calls, "fenceSync")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(debit).not.toHaveBeenCalled();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(48);
    expect(ctx.listeners("webglcontextlost")).toBe(1);
    ctx.setWait("CONDITION_SATISFIED");
    await vi.advanceTimersByTimeAsync(8);
    await retired;
    expect(debit).toHaveBeenCalledTimes(1);
    expect(named(ctx.calls, "deleteTexture").map(call => call.args[0])).toEqual([handle]);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    expect(drained).toBe(true);
    expect(ctx.listeners("webglcontextlost")).toBe(0);
  });

  it("registers retirement immediately but places the fence after the current stack's draw", async () => {
    const ctx = makeDevice();
    const handle = texture("bound-by-current-draw");
    const debit = vi.fn(reserveTextureBudget(16, 256, ctx.device));
    let drained = false;
    ctx.record("bind-volume");
    const retired = ctx.host.textureRegistry.retireNativeTexturesAfterStack([handle], debit);
    ctx.host.textureRegistry.onNativeRetirementsDrained(() => { drained = true; });
    ctx.record("draw-volume");
    expect(ctx.calls.map(call => call.name)).toEqual(["bind-volume", "draw-volume"]);
    expect(drained).toBe(false);
    await Promise.resolve();
    expect(ctx.calls.map(call => call.name)).toEqual(["bind-volume", "draw-volume", "fenceSync", "flush"]);
    ctx.setWait("ALREADY_SIGNALED");
    await vi.advanceTimersByTimeAsync(0);
    await retired;
    expect(drained).toBe(true);
    expect(debit).toHaveBeenCalledTimes(1);
    ctx.device.dispose();
  });

  it("does not equate live cache invalidation before fence insertion with context loss", async () => {
    const ctx = makeDevice();
    const handle = texture("still-live");
    const debit = vi.fn(reserveTextureBudget(32, 256, ctx.device));
    const retired = ctx.host.textureRegistry.retireNativeTexturesAfterStack([handle], debit);
    ctx.device.invalidateGpuObjects();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(32);
    expect(debit).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(named(ctx.calls, "fenceSync")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(debit).not.toHaveBeenCalled();
    ctx.setWait("ALREADY_SIGNALED");
    await vi.advanceTimersByTimeAsync(8);
    await retired;
    expect(named(ctx.calls, "deleteTexture").map(call => call.args[0])).toEqual([handle]);
    expect(debit).toHaveBeenCalledTimes(1);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    ctx.device.dispose();
  });

  it("keeps a live invalidated texture charged after its fence was inserted", async () => {
    const ctx = makeDevice();
    const handle = texture("fenced-before-invalidation");
    const debit = vi.fn(reserveTextureBudget(24, 256, ctx.device));
    const retired = ctx.host.textureRegistry.retireNativeTexturesAfterStack([handle], debit);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
    ctx.device.invalidateGpuObjects();
    expect(debit).not.toHaveBeenCalled();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(24);
    ctx.setWait("CONDITION_SATISFIED");
    await vi.advanceTimersByTimeAsync(8);
    await retired;
    expect(named(ctx.calls, "deleteTexture").map(call => call.args[0])).toEqual([handle]);
    expect(debit).toHaveBeenCalledTimes(1);
    ctx.device.dispose();
  });

  it("releases a lost generation without fencing or deleting its stale names", async () => {
    const ctx = makeDevice();
    const handle = texture("lost-generation");
    const originalDebit = reserveTextureBudget(32, 256, ctx.device);
    const debit = vi.fn(originalDebit);
    const retired = ctx.host.textureRegistry.retireNativeTexturesAfterStack([handle], debit);
    ctx.lose();
    await retired;
    expect(debit).toHaveBeenCalledTimes(1);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    ctx.restore();
    const releaseNew = reserveTextureBudget(12, 256, ctx.device);
    originalDebit(); // A late old-generation release must not debit the new allocation.
    await Promise.resolve();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(12);
    expect(named(ctx.calls, "fenceSync")).toHaveLength(0);
    expect(named(ctx.calls, "deleteTexture")).toHaveLength(0);
    releaseNew();
    ctx.device.dispose();
  });

  it("keeps an unsuccessful retirement charged through disposal until real loss", async () => {
    const ctx = makeDevice();
    const handle = texture("failed-wait");
    const debit = vi.fn(reserveTextureBudget(40, 256, ctx.device));
    const unregister = ctx.host.textureRegistry.registerNativeTextureOwner(() => {});
    const retired = ctx.host.textureRegistry.retireNativeTexturesAfterStack([handle], debit);
    await Promise.resolve();
    ctx.setWait("WAIT_FAILED");
    await vi.advanceTimersByTimeAsync(0);
    ctx.device.dispose();
    unregister();
    expect(ctx.listeners("webglcontextlost")).toBe(1);
    expect(debit).not.toHaveBeenCalled();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(40);
    ctx.lose();
    await retired;
    expect(debit).toHaveBeenCalledTimes(1);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    expect(named(ctx.calls, "deleteTexture")).toHaveLength(0);
    expect(ctx.listeners("webglcontextlost")).toBe(0);
  });

  it("retains an owner through device disposal so a later loss invalidates its live allocation", () => {
    const ctx = makeDevice();
    const debit = vi.fn(reserveTextureBudget(64, 256, ctx.device));
    let closed = false;
    const unregister = ctx.host.textureRegistry.registerNativeTextureOwner(() => { closed = true; });
    const offLoss = ctx.host.lifecycle.onDeviceLost(debit);
    ctx.device.dispose();
    expect(closed).toBe(true);
    expect(ctx.listeners("webglcontextlost")).toBe(1);
    ctx.lose();
    expect(debit).toHaveBeenCalledTimes(1);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    expect(ctx.listeners("webglcontextlost")).toBe(1); // the retained JS frame is still outstanding
    offLoss();
    unregister();
    expect(ctx.listeners("webglcontextlost")).toBe(0);
  });

  it("notifies every owner once despite reentrant unregister, disposal, and a throwing owner", () => {
    const ctx = makeDevice();
    const observed: string[] = [];
    let unregisterFirst!: () => void;
    unregisterFirst = ctx.host.textureRegistry.registerNativeTextureOwner(() => {
      observed.push("first");
      unregisterFirst();
      unregisterFirst();
      ctx.device.dispose();
      throw new Error("owner close failed");
    });
    let unregisterSecond!: () => void;
    unregisterSecond = ctx.host.textureRegistry.registerNativeTextureOwner(() => {
      observed.push("second");
      unregisterSecond();
    });
    let error: unknown;
    try { ctx.device.dispose(); } catch (failure) { error = failure; }
    expect(error).toBeInstanceOf(AggregateError);
    expect(observed).toEqual(["first", "second"]);
    expect(ctx.device.disposed).toBe(true);
    expect(ctx.listeners("webglcontextlost")).toBe(0);
    ctx.device.dispose();
    expect(observed).toEqual(["first", "second"]);
  });

  it.each(["fence", "flush", "wait", "deleteTexture"] as const)(
    "does not touch stale names after loss and restoration reenter %s", async stage => {
      const ctx = makeDevice();
      const first = texture("first"), second = texture("second");
      const debit = vi.fn(reserveTextureBudget(48, 256, ctx.device));
      ctx.setWait("ALREADY_SIGNALED");
      ctx.hooks[stage] = () => {
        ctx.hooks[stage] = undefined;
        ctx.lose();
        ctx.restore();
      };
      const retired = ctx.host.textureRegistry.retireNativeTexturesAfterStack([first, second], debit);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await retired;
      expect(debit).toHaveBeenCalledTimes(1);
      expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
      // Only the deletion that triggered loss may have been attempted.
      expect(named(ctx.calls, "deleteTexture").map(call => call.args[0])).toEqual(stage === "deleteTexture" ? [first] : []);
      expect(named(ctx.calls, "deleteSync")).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      ctx.device.dispose();
    }
  );

  it("retains a failed fence allocation until real context loss", async () => {
    const ctx = makeDevice();
    const debit = vi.fn(reserveTextureBudget(20, 256, ctx.device));
    ctx.setNoFence(true);
    const retired = ctx.host.textureRegistry.retireNativeTexturesAfterStack([texture("allocation-failed")], debit);
    await Promise.resolve();
    ctx.device.invalidateGpuObjects();
    expect(debit).not.toHaveBeenCalled();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(20);
    ctx.lose();
    await retired;
    expect(debit).toHaveBeenCalledTimes(1);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    ctx.device.dispose();
  });
});
