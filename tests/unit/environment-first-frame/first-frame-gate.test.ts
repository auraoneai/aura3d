import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultProbeLoader } from "../../../packages/rendering/src/environment/EnvironmentCache.js";
import {
  FIRST_FRAME_GATE_TIMEOUT_MS,
  armFirstFrameGate,
  firstFrameGatePhase,
  notifyFirstFramePresented,
  resetFirstFrameGateForTests,
  whenFirstFramePresented
} from "../../../packages/rendering/src/environment/FirstFrameGate.js";

afterEach(() => {
  vi.useRealTimers();
  resetFirstFrameGateForTests();
});

const settled = async (promise: Promise<unknown>): Promise<boolean> => {
  let done = false;
  void promise.then(() => { done = true; }, () => { done = true; });
  await new Promise((resolve) => setTimeout(resolve, 15));
  return done;
};

describe("first-frame gate (WP-8 deferred default-probe decode)", () => {
  it("does not hold anything while no renderer has armed it", async () => {
    expect(firstFrameGatePhase()).toBe("idle");
    expect(await settled(whenFirstFramePresented())).toBe(true);
  });

  it("holds a wait from arming until the first frame is submitted, then releases it in a later task", async () => {
    armFirstFrameGate();
    expect(firstFrameGatePhase()).toBe("armed");
    let released = false;
    const wait = whenFirstFramePresented().then(() => { released = true; });
    expect(await settled(wait)).toBe(false);
    notifyFirstFramePresented();
    expect(firstFrameGatePhase()).toBe("presented");
    // Not released inside the notifying task: the frame's own task is never extended by the deferred work.
    await Promise.resolve();
    expect(released).toBe(false);
    await wait;
    expect(released).toBe(true);
  });

  it("releases every waiter and resolves later waits at once", async () => {
    armFirstFrameGate();
    const waits = [whenFirstFramePresented(), whenFirstFramePresented()];
    notifyFirstFramePresented();
    await Promise.all(waits);
    expect(await settled(whenFirstFramePresented())).toBe(true);
  });

  it("does not re-arm after a frame was submitted", async () => {
    armFirstFrameGate();
    notifyFirstFramePresented();
    armFirstFrameGate();
    expect(firstFrameGatePhase()).toBe("presented");
    expect(await settled(whenFirstFramePresented())).toBe(true);
  });

  it("gives up after the timeout so a frame that never arrives cannot strand the upgrade", async () => {
    vi.useFakeTimers();
    armFirstFrameGate();
    let released = false;
    void whenFirstFramePresented().then(() => { released = true; });
    await vi.advanceTimersByTimeAsync(FIRST_FRAME_GATE_TIMEOUT_MS - 1);
    expect(released).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(released).toBe(true);
  });

  it("ignores a notification that arrives after the timeout released the waiter", async () => {
    vi.useFakeTimers();
    armFirstFrameGate();
    const wait = whenFirstFramePresented(50);
    await vi.advanceTimersByTimeAsync(60);
    await wait;
    expect(() => notifyFirstFramePresented()).not.toThrow();
  });
});

describe("default neutral probe load waits for the first frame", () => {
  it("builds the baked probe only after the first frame was submitted", async () => {
    armFirstFrameGate();
    const factory = (() => { throw new Error("factory is not used for the neutral preset"); }) as never;
    const load = defaultProbeLoader(factory);
    let done = false;
    const pending = load({ preset: "neutral", tier: "high" }).then((probe) => { done = true; return probe; });
    // Plenty of time for the chunk import, gunzip and decode if the load were not gated.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(done).toBe(false);
    notifyFirstFramePresented();
    const probe = await pending;
    expect(probe.source).toBe("preset");
    expect(probe.mipCount).toBe(5);
    expect(probe.faceSize).toBe(256);
  }, 30_000);

  it("loads at once when no renderer exists", async () => {
    const load = defaultProbeLoader((() => { throw new Error("unused"); }) as never);
    const probe = await load({ preset: "neutral", tier: "high" });
    expect(probe.source).toBe("preset");
  }, 30_000);
});
