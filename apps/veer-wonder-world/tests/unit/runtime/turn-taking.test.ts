// J02: turn-taking has no wrong-answer branch, always times out by itself,
// and is safe to cancel.
import { describe, expect, it } from "vitest";
import {
  createTurnTaking,
  DEFAULT_WAIT_MS,
  MAX_WAIT_MS,
  normalizeWaitMs,
  type TurnResolution
} from "../../../src/runtime/turn-taking.js";

describe("turn-taking", () => {
  it("is inactive until started", () => {
    const turn = createTurnTaking(4000);
    expect(turn.state()).toEqual({ active: false, waitedMs: 0, resolvedBy: null });
    expect(turn.tick(5000)).toBeNull();
    expect(turn.respond("tap")).toBe(false);
    expect(turn.remainingMs()).toBe(0);
  });

  it("times out by itself after waitMs: silence is a good ending", () => {
    const turn = createTurnTaking(4000);
    turn.start();
    expect(turn.state()).toEqual({ active: true, waitedMs: 0, resolvedBy: null });
    expect(turn.tick(1500)).toBeNull();
    expect(turn.remainingMs()).toBe(2500);
    expect(turn.tick(2499)).toBeNull();
    expect(turn.tick(1)).toBe("timeout");
    expect(turn.state()).toEqual({ active: false, waitedMs: 4000, resolvedBy: "timeout" });
    expect(turn.remainingMs()).toBe(0);
  });

  it("an overshooting tick reports the timeout once and records the full wait", () => {
    const turn = createTurnTaking(4000);
    turn.start();
    expect(turn.tick(60000)).toBe("timeout");
    expect(turn.state().waitedMs).toBe(4000);
    expect(turn.tick(100)).toBeNull();
  });

  it("many small float steps still reach the deadline", () => {
    const turn = createTurnTaking(1000);
    turn.start();
    let result: TurnResolution | null = null;
    let steps = 0;
    while (result === null && steps < 20000) {
      result = turn.tick(0.1);
      steps += 1;
    }
    expect(result).toBe("timeout");
    expect(Math.abs(steps - 10000)).toBeLessThanOrEqual(1);
    const thirds = createTurnTaking(1000);
    thirds.start();
    let thirdsResult: TurnResolution | null = null;
    for (let i = 0; i < 3 && thirdsResult === null; i += 1) thirdsResult = thirds.tick(1000 / 3);
    expect(thirdsResult).toBe("timeout");
  });

  it("a tap or a parent confirm ends the wait; both are equally good", () => {
    for (const source of ["tap", "parent"] as const) {
      const turn = createTurnTaking(5000);
      turn.start();
      turn.tick(1200);
      expect(turn.respond(source)).toBe(true);
      expect(turn.state()).toEqual({ active: false, waitedMs: 1200, resolvedBy: source });
    }
  });

  it("only the first response counts; later responses and ticks change nothing", () => {
    const turn = createTurnTaking(5000);
    turn.start();
    expect(turn.respond("tap")).toBe(true);
    expect(turn.respond("tap")).toBe(false);
    expect(turn.respond("parent")).toBe(false);
    expect(turn.tick(10000)).toBeNull();
    expect(turn.state()).toEqual({ active: false, waitedMs: 0, resolvedBy: "tap" });
  });

  it("a response after the timeout is ignored", () => {
    const turn = createTurnTaking(2000);
    turn.start();
    turn.tick(2000);
    expect(turn.respond("tap")).toBe(false);
    expect(turn.state().resolvedBy).toBe("timeout");
  });

  it("cancel stops the wait safely without any resolution", () => {
    const turn = createTurnTaking(3000);
    turn.start();
    turn.tick(1000);
    turn.cancel();
    expect(turn.state()).toEqual({ active: false, waitedMs: 1000, resolvedBy: null });
    expect(turn.tick(5000)).toBeNull();
    expect(turn.respond("parent")).toBe(false);
    expect(turn.remainingMs()).toBe(0);
    turn.cancel();
    expect(turn.state().resolvedBy).toBeNull();
  });

  it("start() restarts a finished or cancelled wait from zero", () => {
    const turn = createTurnTaking(3000);
    turn.start();
    turn.respond("tap");
    turn.start();
    expect(turn.state()).toEqual({ active: true, waitedMs: 0, resolvedBy: null });
    turn.cancel();
    turn.start();
    expect(turn.tick(3000)).toBe("timeout");
  });

  it("ignores ticks that are not positive finite numbers", () => {
    const turn = createTurnTaking(3000);
    turn.start();
    for (const dt of [0, -100, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(turn.tick(dt)).toBeNull();
    expect(turn.state()).toEqual({ active: true, waitedMs: 0, resolvedBy: null });
  });

  it("a zero wait ends at once by timeout", () => {
    const turn = createTurnTaking(0);
    turn.start();
    expect(turn.state()).toEqual({ active: false, waitedMs: 0, resolvedBy: "timeout" });
  });

  it("every wait is finite: invalid waits use the default, long waits are capped", () => {
    expect(normalizeWaitMs(undefined)).toBe(DEFAULT_WAIT_MS);
    expect(normalizeWaitMs(Number.NaN)).toBe(DEFAULT_WAIT_MS);
    expect(normalizeWaitMs(Number.POSITIVE_INFINITY)).toBe(DEFAULT_WAIT_MS);
    expect(normalizeWaitMs(-5)).toBe(0);
    expect(normalizeWaitMs(4500)).toBe(4500);
    expect(normalizeWaitMs(10 * 60 * 1000)).toBe(MAX_WAIT_MS);
    expect(DEFAULT_WAIT_MS).toBeGreaterThanOrEqual(4000);
    expect(DEFAULT_WAIT_MS).toBeLessThanOrEqual(6000);

    for (const wait of [undefined, Number.NaN, Number.POSITIVE_INFINITY, 10 * 60 * 1000]) {
      const turn = createTurnTaking(wait);
      turn.start();
      let result: TurnResolution | null = null;
      let waited = 0;
      while (result === null && waited <= MAX_WAIT_MS) {
        result = turn.tick(100);
        waited += 100;
      }
      expect(result).toBe("timeout");
    }
  });

  it("resolutions are only tap, parent or timeout: there is no wrong-answer branch", () => {
    const seen = new Set<TurnResolution | null>();
    const scripts: ((turn: ReturnType<typeof createTurnTaking>) => void)[] = [
      (t) => t.respond("tap"),
      (t) => t.respond("parent"),
      (t) => t.tick(10000),
      (t) => {
        t.tick(10);
        t.respond("tap");
        t.respond("parent");
      }
    ];
    for (const script of scripts) {
      const turn = createTurnTaking(5000);
      turn.start();
      script(turn);
      seen.add(turn.state().resolvedBy);
    }
    expect([...seen].sort()).toEqual(["parent", "tap", "timeout"]);
  });

  it("is deterministic: the same calls give the same states", () => {
    const run = (): unknown[] => {
      const turn = createTurnTaking(2500);
      const states: unknown[] = [];
      turn.start();
      for (const dt of [100, 900, 33.3, 700]) {
        turn.tick(dt);
        states.push(turn.state());
      }
      turn.respond("parent");
      states.push(turn.state());
      return states;
    };
    expect(run()).toEqual(run());
  });
});
