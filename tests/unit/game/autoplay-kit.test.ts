/**
 * Autoplay kit (5.7.0): `readAutoplayFlag` (the one `?autoplay=1` reader all 30 games share) and
 * `createAutoplayHarness` (bot feed plus the results-hold-then-restart loop).
 */
import { afterEach, describe, expect, it } from "vitest";
import { AUTOPLAY_FLAG_NAMES, createAutoplayHarness, readAutoplayFlag } from "../../../packages/game/src/kit/autoplay";

describe("readAutoplayFlag", () => {
  it("accepts the union of every game's names: autoplay, autopilot and demo", () => {
    expect([...AUTOPLAY_FLAG_NAMES]).toEqual(["autoplay", "autopilot", "demo"]);
    for (const q of ["?autoplay=1", "autoplay=1", "?autopilot=1", "?demo=1", "?demo", "?autoplay=true", "?autoplay=TRUE", "?demo=yes", "?x=2&autopilot=1"]) {
      expect(readAutoplayFlag(q), q).toBe(true);
    }
  });

  it('treats "0" and "false" as off, and absent names as off', () => {
    for (const q of ["", "?", "?autoplay=0", "?autoplay=false", "?autoplay=False", "?autostart=1", "?manual=1", "?autoplay=0&demo=0"]) {
      expect(readAutoplayFlag(q), q).toBe(false);
    }
    expect(readAutoplayFlag("?autoplay=0&demo=1")).toBe(true); // any listed name on is enough
  });

  it("reads URLSearchParams and any { get } source, and narrows or widens the names", () => {
    expect(readAutoplayFlag(new URLSearchParams("autopilot=1"))).toBe(true);
    expect(readAutoplayFlag({ get: (name) => (name === "demo" ? "1" : null) })).toBe(true);
    expect(readAutoplayFlag("?autopilot=1", { names: ["autoplay"] })).toBe(false);
    expect(readAutoplayFlag("?autostart=1", { names: [...AUTOPLAY_FLAG_NAMES, "autostart"] })).toBe(true);
  });

  it("defaults to location.search and is false outside a browser", () => {
    expect(readAutoplayFlag()).toBe(false);
  });
});

describe("createAutoplayHarness", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__AUTOPLAY_TEST__;
  });

  it("feeds the bot while enabled and the idle input while disabled", () => {
    let calls = 0;
    const harness = createAutoplayHarness<string>({ bot: { step: (dt) => { calls += 1; return `go ${dt}`; } }, idle: "idle", isFinished: () => false });
    expect(harness.step(0.5)).toBe("go 0.5");
    expect(harness.toggle()).toBe(false);
    expect(harness.step(0.5)).toBe("idle");
    harness.enabled = true;
    expect(harness.step(1)).toBe("go 1");
    expect(calls).toBe(2);
    expect(createAutoplayHarness<number>({ isFinished: () => false }).step(1)).toBeUndefined();
  });

  it("holds finished results for restartDelay, restarts once, then counts the next run", () => {
    let finished = false;
    let restarted = 0;
    const harness = createAutoplayHarness({ isFinished: () => finished, restartDelay: 3, onRestart: () => { restarted += 1; finished = false; } });
    const dt = 1 / 60;
    for (let i = 0; i < 120; i += 1) expect(harness.tick(dt)).toBe(false); // a run in play never restarts
    finished = true;
    let held = 0;
    let fired = -1;
    for (let i = 0; i < 400 && fired < 0; i += 1) {
      held += dt;
      if (harness.tick(dt)) fired = i;
    }
    expect(held).toBeGreaterThanOrEqual(3);
    expect(held).toBeLessThan(3 + dt + 1e-9);
    expect(restarted).toBe(1);
    expect(harness.runs).toBe(2);
    expect(harness.holdSeconds).toBe(0);
    expect(harness.diag()).toEqual({ enabled: true, runs: 2, restarts: 1, holdSeconds: 0, restartDelay: 3 });
  });

  it("restarts again after another full hold if the game is still finished, and a run in play clears the hold", () => {
    let finished = true;
    const harness = createAutoplayHarness({ isFinished: () => finished, restartDelay: 1 });
    expect(harness.tick(0.6)).toBe(false);
    finished = false;
    expect(harness.tick(0.6)).toBe(false); // back in play: hold cleared
    finished = true;
    expect(harness.tick(0.6)).toBe(false);
    expect(harness.tick(0.4)).toBe(true);
    expect(harness.tick(0.5)).toBe(false);
    expect(harness.tick(0.5)).toBe(true);
    expect(harness.runs).toBe(3);
  });

  it("does not count or restart while disabled, and reset clears the hold", () => {
    const harness = createAutoplayHarness({ isFinished: () => true, restartDelay: 1, enabled: false });
    expect(harness.tick(5)).toBe(false);
    harness.enabled = true;
    expect(harness.tick(0.9)).toBe(false);
    harness.reset();
    expect(harness.tick(0.9)).toBe(false);
    harness.enabled = false; // turning it off clears the hold too
    harness.enabled = true;
    expect(harness.holdSeconds).toBe(0);
    expect(() => createAutoplayHarness({ isFinished: () => true, restartDelay: -1 })).toThrow(RangeError);
  });

  it("matches the hand-rolled results timers it replaced (summed dt, >= the hold, cleared on fire)", () => {
    // the pre-5.7.0 ninja-runner / heatsink timer, inlined
    const legacy = (hold: number) => {
      let shown = 0;
      return (over: boolean, dt: number): boolean => {
        if (!over) { shown = 0; return false; }
        shown += dt;
        if (shown < hold) return false;
        shown = 0;
        return true;
      };
    };
    let over = false;
    const old = legacy(3);
    const harness = createAutoplayHarness({ isFinished: () => over, restartDelay: 3 });
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 20000; i += 1) {
      if (i % 450 === 0) over = !over;
      const dt = 1 / 144 + rand() * 0.012;
      expect(harness.tick(dt)).toBe(old(over, dt));
    }
  });

  it("publishes diag() as a read-only global when exposeAs is set, and removes it on dispose", () => {
    const harness = createAutoplayHarness({ isFinished: () => true, restartDelay: 2, exposeAs: "__AUTOPLAY_TEST__" });
    harness.tick(0.5);
    expect((globalThis as Record<string, unknown>).__AUTOPLAY_TEST__).toEqual({ enabled: true, runs: 1, restarts: 0, holdSeconds: 0.5, restartDelay: 2 });
    harness.dispose();
    expect("__AUTOPLAY_TEST__" in globalThis).toBe(false);
  });
});
