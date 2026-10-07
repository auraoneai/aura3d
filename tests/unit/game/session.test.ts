import { describe, expect, it } from "vitest";
import { GameSessionImpl } from "../../../packages/game/src/session/GameSession";
import { attachSessionLifecycle } from "../../../packages/game/src/session/lifecycle";
import { StubTimeController } from "../../../packages/engine/src/contracts/time";

const DT60 = 1 / 60;

describe("GameSession (PRD-09 §7.3)", () => {
  it("per-actor hitStop 0.07s freezes 'p1' for 4–5 ticks at 60 Hz while 'p3' advances", () => {
    const s = new GameSessionImpl({ seed: 0 });
    s.hitStop(0.07, { actors: ["p1"] });
    expect(s.isFrozen("p1")).toBe(true);
    expect(s.isFrozen("p3")).toBe(false);
    expect(s.scaledDt(DT60, "p1")).toBe(0);
    expect(s.scaledDt(DT60, "p3")).toBeCloseTo(DT60, 9);
    for (let i = 0; i < 4; i += 1) s.tick(DT60);
    // 4 ticks = 66.7 ms < 70 ms — still frozen
    expect(s.isFrozen("p1")).toBe(true);
    s.tick(DT60);
    // 5 ticks = 83.3 ms > 70 ms — released
    expect(s.isFrozen("p1")).toBe(false);
    expect(s.scaledDt(DT60, "p1")).toBeCloseTo(DT60, 9);
  });

  it("global hitStop drives effective dt to 0, then back to 1", () => {
    const time = new StubTimeController();
    const s = new GameSessionImpl({ seed: 0, time });
    s.hitStop(0.05);
    expect(s.scaledDt(DT60)).toBe(0);
    const simBefore = time.simTime;
    s.tick(DT60);
    s.tick(DT60);
    s.tick(DT60);
    expect(time.simTime).toBe(simBefore);
    // 0.05 s at 60 Hz clears on the 4th tick (3×dt=0.05 − fp ε > 0)
    s.tick(DT60);
    expect(s.scaledDt(DT60)).toBeCloseTo(DT60, 9);
    s.tick(DT60);
    expect(time.simTime).toBeGreaterThan(simBefore);
  });

  it("illegal transitions throw; legal ones emit 'state'", () => {
    const s = new GameSessionImpl({ seed: 0 });
    const seen: string[] = [];
    s.on("state", (x) => seen.push((x as GameSessionImpl).state));
    expect(() => s.transition("results")).toThrow(/GAME_SESSION_ILLEGAL_TRANSITION:booting->results/);
    s.transition("loading");
    s.transition("playing");
    s.pause("user");
    s.resume();
    s.transition("disposed");
    expect(seen).toEqual(["loading", "playing", "paused", "playing", "disposed"]);
    expect(() => s.transition("title")).toThrow(/ILLEGAL_TRANSITION/);
  });

  it("seed comes through and simTime accumulates on real ticks", () => {
    const s = new GameSessionImpl({ seed: 1234 });
    expect(s.seed).toBe(1234);
    s.tick(0.5);
    s.tick(0.5);
    expect(s.simTime).toBeCloseTo(1, 6);
  });

  it("lifecycle: visibilitychange hidden pauses with 'visibility' + suspends sound", () => {
    const s = new GameSessionImpl({ seed: 0 });
    s.transition("loading");
    s.transition("playing");
    const calls: string[] = [];
    const listeners = new Map<string, Array<() => void>>();
    const fakeDoc = {
      visibilityState: "visible",
      addEventListener(t: string, cb: () => void) {
        listeners.set(t, [...(listeners.get(t) ?? []), cb]);
      },
      removeEventListener() {}
    };
    const detach = attachSessionLifecycle({
      session: s,
      doc: fakeDoc as unknown as Document,
      sound: { suspend: () => calls.push("suspend"), dispose: () => calls.push("dispose") }
    });
    fakeDoc.visibilityState = "hidden";
    for (const cb of listeners.get("visibilitychange") ?? []) cb();
    expect(s.state).toBe("paused");
    expect(calls).toEqual(["suspend"]);
    fakeDoc.visibilityState = "visible";
    for (const cb of listeners.get("visibilitychange") ?? []) cb();
    expect(s.state).toBe("playing");
    detach();
  });
});
