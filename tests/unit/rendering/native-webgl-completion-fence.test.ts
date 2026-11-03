import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";

type Sync = { readonly id: number };
type Call = { readonly name: string; readonly args: readonly unknown[] };

/** In-memory context exercising the device itself; it does not create a browser or GPU. */
function makeContext() {
  const calls: Call[] = [];
  const listeners = new Map<string, Set<EventListener>>();
  const statuses = new Map<number, number>();
  const created: Sync[] = [];
  const hooks: {
    fence?: (sync: Sync) => void;
    flush?: () => void;
    wait?: (sync: Sync) => void;
    delete?: (sync: Sync) => void;
  } = {};
  const constants: Record<string, number> = {
    NO_ERROR: 0,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    ALREADY_SIGNALED: 0x911a,
    TIMEOUT_EXPIRED: 0x911b,
    CONDITION_SATISFIED: 0x911c,
    WAIT_FAILED: 0x911d,
    MAX_VERTEX_ATTRIBS: 0x8869,
    MAX_TEXTURE_IMAGE_UNITS: 0x8872,
    MAX_TEXTURE_SIZE: 0x0d33,
    MAX_SAMPLES: 0x8d57,
    VENDOR: 0x1f00,
    RENDERER: 0x1f01
  };
  let lost = false;
  let nextId = 0;
  let noFence = false;
  let defaultStatus = constants.TIMEOUT_EXPIRED!;
  const values: Record<string, unknown> = {
    ...constants,
    getError: () => { calls.push({ name: "getError", args: [] }); return 0; },
    getParameter: () => 16,
    getExtension: () => null,
    isContextLost: () => lost,
    fenceSync: (condition: number, flags: number) => {
      const sync = { id: ++nextId };
      calls.push({ name: "fenceSync", args: [condition, flags, sync] });
      if (noFence) return null;
      created.push(sync);
      hooks.fence?.(sync);
      return sync;
    },
    flush: () => { calls.push({ name: "flush", args: [] }); hooks.flush?.(); },
    clientWaitSync: (sync: Sync, flags: number, timeout: number) => {
      calls.push({ name: "clientWaitSync", args: [sync, flags, timeout] });
      hooks.wait?.(sync);
      return statuses.get(sync.id) ?? defaultStatus;
    },
    deleteSync: (sync: Sync) => { calls.push({ name: "deleteSync", args: [sync] }); hooks.delete?.(sync); }
  };
  const gl = new Proxy(values, {
    get(target, property) {
      if (typeof property === "string" && property in target) return target[property];
      if (typeof property === "string" && /^[A-Z0-9_]+$/.test(property)) return 0x10000;
      return () => undefined;
    }
  }) as unknown as WebGL2RenderingContext;
  const canvas = {
    getContext: () => gl,
    addEventListener: (name: string, listener: EventListener) => {
      let group = listeners.get(name);
      if (!group) listeners.set(name, group = new Set());
      group.add(listener);
    },
    removeEventListener: (name: string, listener: EventListener) => listeners.get(name)?.delete(listener)
  } as unknown as HTMLCanvasElement;
  const createDevice = () => WebGL2Device.create({ canvas });
  const device = createDevice();
  calls.length = 0; // Ignore the device constructor's pre-existing-error drain.
  const dispatch = (name: string) => {
    for (const listener of [...(listeners.get(name) ?? [])]) listener({ preventDefault() {} } as Event);
  };
  return {
    calls, constants, created, device, createDevice, hooks, statuses, values,
    record: (name: string) => calls.push({ name, args: [] }),
    setDefaultStatus: (status: number) => { defaultStatus = status; },
    setNoFence: () => { noFence = true; },
    lose: () => { lost = true; dispatch("webglcontextlost"); },
    loseBeforeEvent: () => { lost = true; },
    restore: () => { lost = false; dispatch("webglcontextrestored"); }
  };
}

const matching = (calls: readonly Call[], name: string): Call[] => calls.filter(call => call.name === name);

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("WebGL2 submitted-work completion", () => {
  it("places and flushes distinct fences in submission order, then retires each independently", async () => {
    const ctx = makeContext();
    expect(ctx.device.supportsSubmittedWorkCompletion()).toBe(true);
    ctx.record("draw-one");
    let firstFinished = false;
    const first = ctx.device.waitForSubmittedWork().then(() => { firstFinished = true; });
    ctx.record("draw-two");
    const second = ctx.device.waitForSubmittedWork();
    const [a, b] = ctx.created;
    expect(a).toBeDefined(); expect(b).toBeDefined();
    ctx.statuses.set(b!.id, ctx.constants.CONDITION_SATISFIED!);
    expect(ctx.calls.map(call => call.name)).toEqual(["draw-one", "fenceSync", "flush", "draw-two", "fenceSync", "flush"]);
    expect(matching(ctx.calls, "fenceSync").map(call => call.args.slice(0, 2))).toEqual([
      [ctx.constants.SYNC_GPU_COMMANDS_COMPLETE, 0], [ctx.constants.SYNC_GPU_COMMANDS_COMPLETE, 0]
    ]);
    await vi.advanceTimersByTimeAsync(0);
    await second;
    expect(firstFinished).toBe(false);
    expect(matching(ctx.calls, "deleteSync").map(call => call.args[0])).toEqual([b]);
    ctx.statuses.set(a!.id, ctx.constants.ALREADY_SIGNALED!);
    await vi.advanceTimersByTimeAsync(8);
    await first;
    expect(firstFinished).toBe(true);
    expect(matching(ctx.calls, "deleteSync").map(call => call.args[0])).toEqual([b, a]);
    expect(matching(ctx.calls, "clientWaitSync").every(call => call.args[1] === 0 && call.args[2] === 0)).toBe(true);
    expect(matching(ctx.calls, "getError")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    ctx.device.dispose();
  });

  it.each(["fenceSync", "flush", "clientWaitSync", "deleteSync", "SYNC_GPU_COMMANDS_COMPLETE", "WAIT_FAILED"]) (
    "rejects an unsupported context when %s is missing without issuing a fence", async missing => {
      const ctx = makeContext();
      ctx.values[missing] = undefined;
      expect(ctx.device.supportsSubmittedWorkCompletion()).toBe(false);
      await expect(ctx.device.waitForSubmittedWork()).rejects.toMatchObject({ code: "GPU_COMPLETION_UNAVAILABLE" });
      expect(matching(ctx.calls, "fenceSync")).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      ctx.device.dispose();
    }
  );

  it("does not confuse ambiguous status constants with a completion receipt", async () => {
    const ctx = makeContext();
    ctx.values.CONDITION_SATISFIED = ctx.constants.TIMEOUT_EXPIRED;
    expect(ctx.device.supportsSubmittedWorkCompletion()).toBe(false);
    await expect(ctx.device.waitForSubmittedWork()).rejects.toMatchObject({ code: "GPU_COMPLETION_UNAVAILABLE" });
    ctx.device.dispose();
  });

  it("rejects allocation and flush failures, cleaning an allocated sync", async () => {
    const allocation = makeContext();
    allocation.setNoFence();
    await expect(allocation.device.waitForSubmittedWork()).rejects.toMatchObject({ code: "GPU_COMPLETION_FAILED", details: { stage: "fenceSync" } });
    expect(matching(allocation.calls, "flush")).toHaveLength(0);
    allocation.device.dispose();

    const flush = makeContext();
    flush.hooks.flush = () => { throw new Error("flush failed"); };
    await expect(flush.device.waitForSubmittedWork()).rejects.toMatchObject({ code: "GPU_COMPLETION_FAILED" });
    expect(matching(flush.calls, "deleteSync").map(call => call.args[0])).toEqual(flush.created);
    expect(vi.getTimerCount()).toBe(0);
    flush.device.dispose();
  });

  it.each(["WAIT_FAILED", "unknown", "throw"]) ("rejects %s while polling and deletes the sync", async failure => {
    const ctx = makeContext();
    if (failure === "throw") ctx.hooks.wait = () => { throw new Error("driver error"); };
    else ctx.setDefaultStatus(failure === "unknown" ? 0x7fffffff : ctx.constants.WAIT_FAILED!);
    const result = ctx.device.waitForSubmittedWork();
    const assertion = expect(result).rejects.toMatchObject({ code: "GPU_COMPLETION_FAILED" });
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
    expect(matching(ctx.calls, "deleteSync").map(call => call.args[0])).toEqual(ctx.created);
    expect(vi.getTimerCount()).toBe(0);
    ctx.device.dispose();
  });

  it("bounds timeouts and never treats a stalled fence as completed", async () => {
    const ctx = makeContext();
    const result = ctx.device.waitForSubmittedWork();
    const assertion = expect(result).rejects.toMatchObject({ code: "GPU_COMPLETION_TIMEOUT" });
    // A throttled tab can wake after the deadline without thousands of polls.
    vi.setSystemTime(Date.now() + 30_001);
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
    expect(matching(ctx.calls, "clientWaitSync")).toHaveLength(1);
    expect(matching(ctx.calls, "deleteSync").map(call => call.args[0])).toEqual(ctx.created);
    expect(vi.getTimerCount()).toBe(0);
    ctx.device.dispose();
  });

  it("also caps polls if the wall clock does not advance", async () => {
    const ctx = makeContext();
    vi.spyOn(Date, "now").mockReturnValue(0);
    const assertion = expect(ctx.device.waitForSubmittedWork()).rejects.toMatchObject({ code: "GPU_COMPLETION_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(matching(ctx.calls, "clientWaitSync")).toHaveLength(3750);
    expect(vi.getTimerCount()).toBe(0);
    ctx.device.dispose();
  });

  it("rejects promptly on context loss, then permits a new fence after restoration", async () => {
    const ctx = makeContext();
    const pending = ctx.device.waitForSubmittedWork();
    const assertion = expect(pending).rejects.toMatchObject({ code: "CONTEXT_LOST" });
    ctx.lose();
    await assertion;
    expect(matching(ctx.calls, "deleteSync")).toHaveLength(0); // loss invalidates native names
    expect(vi.getTimerCount()).toBe(0);
    expect(ctx.device.supportsSubmittedWorkCompletion()).toBe(false);
    ctx.restore();
    ctx.setDefaultStatus(ctx.constants.ALREADY_SIGNALED!);
    const restored = ctx.device.waitForSubmittedWork();
    await vi.advanceTimersByTimeAsync(0);
    await restored;
    expect(matching(ctx.calls, "deleteSync").map(call => call.args[0])).toEqual([ctx.created[1]]);
    ctx.device.dispose();
  });

  it("detects loss before the browser dispatches its event", async () => {
    const ctx = makeContext();
    const pending = ctx.device.waitForSubmittedWork();
    const assertion = expect(pending).rejects.toMatchObject({ code: "CONTEXT_LOST" });
    ctx.loseBeforeEvent();
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
    expect(matching(ctx.calls, "clientWaitSync")).toHaveLength(0);
    expect(matching(ctx.calls, "deleteSync")).toHaveLength(0);
    ctx.lose();
    ctx.device.dispose();
  });

  it("rejects and cleans pending waits on disposal without affecting another device", async () => {
    const ctx = makeContext();
    const other = ctx.createDevice();
    const first = ctx.device.waitForSubmittedWork();
    const firstAssertion = expect(first).rejects.toMatchObject({ code: "DISPOSED_DEVICE" });
    const second = other.waitForSubmittedWork();
    ctx.statuses.set(ctx.created[1]!.id, ctx.constants.ALREADY_SIGNALED!);
    ctx.device.dispose();
    await firstAssertion;
    expect(matching(ctx.calls, "deleteSync").map(call => call.args[0])).toEqual([ctx.created[0]]);
    expect(ctx.device.supportsSubmittedWorkCompletion()).toBe(false);
    await expect(ctx.device.waitForSubmittedWork()).rejects.toMatchObject({ code: "DISPOSED_DEVICE" });
    await vi.advanceTimersByTimeAsync(0);
    await second;
    expect(matching(ctx.calls, "deleteSync").map(call => call.args[0])).toEqual(ctx.created);
    other.dispose();
  });

  it("cleans a fence returned after reentrant disposal during allocation", async () => {
    const ctx = makeContext();
    ctx.hooks.fence = () => ctx.device.dispose();
    await expect(ctx.device.waitForSubmittedWork()).rejects.toMatchObject({ code: "DISPOSED_DEVICE" });
    expect(matching(ctx.calls, "deleteSync").map(call => call.args[0])).toEqual(ctx.created);
    expect(matching(ctx.calls, "flush")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["flush", "wait", "delete"] as const) ("does not resolve when context loss reenters %s", async stage => {
    const ctx = makeContext();
    ctx.setDefaultStatus(ctx.constants.ALREADY_SIGNALED!);
    ctx.hooks[stage] = () => ctx.lose();
    const assertion = expect(ctx.device.waitForSubmittedWork()).rejects.toMatchObject({ code: "CONTEXT_LOST" });
    if (stage !== "flush") await vi.advanceTimersByTimeAsync(0);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
    ctx.device.dispose();
  });

  it("reports a cleanup failure rather than claiming an unqualified successful wait", async () => {
    const ctx = makeContext();
    ctx.setDefaultStatus(ctx.constants.ALREADY_SIGNALED!);
    ctx.hooks.delete = () => { throw new Error("delete failed"); };
    const assertion = expect(ctx.device.waitForSubmittedWork()).rejects.toMatchObject({ code: "GPU_COMPLETION_FAILED", details: { stage: "deleteSync" } });
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
    expect(matching(ctx.calls, "deleteSync")).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    ctx.device.dispose();
  });

  it("keeps captured fence operations stable and permits a reentrant second wait", async () => {
    const ctx = makeContext();
    ctx.setDefaultStatus(ctx.constants.ALREADY_SIGNALED!);
    let second: Promise<void> | undefined;
    ctx.hooks.wait = () => {
      ctx.hooks.wait = undefined;
      second = ctx.device.waitForSubmittedWork();
    };
    const first = ctx.device.waitForSubmittedWork();
    // Existing waits use the functions and constants captured when the fence was issued.
    ctx.values.clientWaitSync = () => { throw new Error("changed after submission"); };
    await vi.advanceTimersByTimeAsync(0);
    await first;
    expect(second).toBeDefined();
    // The second wait captured the replacement and must fail independently.
    const secondAssertion = expect(second!).rejects.toMatchObject({ code: "GPU_COMPLETION_FAILED" });
    await vi.advanceTimersByTimeAsync(1);
    await secondAssertion;
    expect(matching(ctx.calls, "deleteSync").map(call => call.args[0])).toEqual(ctx.created);
    expect(vi.getTimerCount()).toBe(0);
    ctx.device.dispose();
  });
});
