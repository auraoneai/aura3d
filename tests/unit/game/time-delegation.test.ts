import { describe, expect, it } from "vitest";
import { GameSessionImpl } from "../../../packages/game/src/session/GameSession";
import { StubTimeController } from "../../../packages/engine/src/contracts/time";
import type { AuraTimeController } from "../../../packages/engine/src/contracts/time";

/** Minimal fake C-23 controller recording every delegation. */
class FakeTimeController implements AuraTimeController {
  public scale = 1;
  public simTime = 0;
  public realTime = 0;
  public hitStopRemaining = 0;
  public hitStopCalls: Array<{ seconds: number; scope?: unknown }> = [];
  public slowMoCalls: Array<{ scale: number; seconds: number }> = [];
  scaleTo(value: number, _halflife: number): void {
    this.scale = value;
  }
  hitStop(seconds: number, o?: { scope?: unknown }): void {
    this.hitStopCalls.push({ seconds, scope: o?.scope });
    this.hitStopRemaining = seconds;
  }
  slowMo(scale: number, seconds: number): void {
    this.slowMoCalls.push({ scale, seconds });
    this.scale = scale;
  }
  advance(realDt: number): number {
    this.realTime += realDt;
    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining = Math.max(0, this.hitStopRemaining - realDt);
      return 0;
    }
    const scaled = realDt * this.scale;
    this.simTime += scaled;
    return scaled;
  }
}

describe("session time delegation to C-23 (PRD-09)", () => {
  it("session.setTimeScale(0.5) writes app.time.scale = 0.5", () => {
    const time = new FakeTimeController();
    const s = new GameSessionImpl({ seed: 0, time });
    s.setTimeScale(0.5);
    expect(time.scale).toBe(0.5);
  });

  it("session.hitStop(0.07) calls app.time.hitStop(0.07, { scope: 'global' })", () => {
    const time = new FakeTimeController();
    const s = new GameSessionImpl({ seed: 0, time });
    s.hitStop(0.07);
    expect(time.hitStopCalls).toEqual([{ seconds: 0.07, scope: "global" }]);
  });

  it("scale 0 yields zero simulated advance over 60 ticks", () => {
    const time = new FakeTimeController();
    const s = new GameSessionImpl({ seed: 0, time });
    s.setTimeScale(0);
    for (let i = 0; i < 60; i += 1) s.tick(1 / 60);
    expect(time.simTime).toBe(0);
    expect(s.scaledDt(1 / 60)).toBe(0);
    expect(time.realTime).toBeCloseTo(1, 6);
  });

  it("delegation works against the real C-23 StubTimeController too", () => {
    const time = new StubTimeController();
    const s = new GameSessionImpl({ seed: 0, time });
    s.setTimeScale(0.5);
    expect(time.scale).toBe(0.5);
    s.hitStop(0.07);
    expect(time.hitStopRemaining).toBe(0.07);
    s.tick(0.02);
    expect(s.scaledDt(0.016)).toBe(0);
    s.tick(0.06);
    expect(time.hitStopRemaining).toBe(0);
  });
});
