import { describe, expect, it } from "vitest";
import { StubTimeController, type AuraTimeController } from "../../../packages/engine/src/contracts/time";
import { TimeController } from "../../../packages/engine/src/agent-api/time/TimeController";
import { GameSessionImpl } from "../../../packages/game/src/session/GameSessionCore";

const implementations = [
  ["fallback", () => new StubTimeController()],
  ["native", () => new TimeController()]
] as const;

describe.each(implementations)("%s owner-scoped hit-stop", (_name, create) => {
  it("keeps legacy and other owners independent when one owner is cancelled", () => {
    const time = create();
    const first = {};
    const second = {};
    time.hitStop(3);
    time.hitStopOwned(7, first);
    time.hitStopOwned(5, second);
    expect(time.hitStopRemaining).toBe(7);
    expect(time.advance(1)).toBe(0);
    expect(time.hitStopRemaining).toBe(6);
    time.clearOwnedHitStop(first);
    expect(time.hitStopRemaining).toBe(4);
    time.clearOwnedHitStop(second);
    expect(time.hitStopRemaining).toBe(2);
    expect(time.advance(2)).toBe(0); // preserve the existing full-frame stop rule
    expect(time.hitStopRemaining).toBe(0);
    expect(time.advance(1)).toBe(1);
    expect(time.simTime).toBe(1);
  });

  it("extends a single owner's stop without shortening it and expires owners independently", () => {
    const time = create();
    const short = {};
    const long = {};
    time.hitStopOwned(2, short);
    time.hitStopOwned(4, short);
    time.hitStopOwned(1, short);
    time.hitStopOwned(6, long);
    time.advance(4);
    expect(time.hitStopRemaining).toBe(2);
    time.clearOwnedHitStop(short); // already expired
    expect(time.hitStopRemaining).toBe(2);
    time.clearOwnedHitStop(long);
    expect(time.hitStopRemaining).toBe(0);
  });

  it("releases only a reset, rebound or disposed session's own stops", () => {
    const time = create();
    const anotherTime = create();
    const first = new GameSessionImpl({ seed: 1, time });
    const second = new GameSessionImpl({ seed: 2, time });
    time.hitStop(3);
    first.hitStop(8);
    second.hitStop(5);
    first.clearRunHitStops();
    expect(time.hitStopRemaining).toBe(5);
    second.bindTimeController(anotherTime);
    expect(time.hitStopRemaining).toBe(3);
    second.hitStop(7);
    expect(anotherTime.hitStopRemaining).toBe(7);
    second.transition("disposed");
    expect(anotherTime.hitStopRemaining).toBe(0);
    expect(time.hitStopRemaining).toBe(3);
  });
});

describe("legacy custom time-controller compatibility", () => {
  it("keeps delegated unowned stops when ownership cannot be proven", () => {
    const time: AuraTimeController = {
      scale: 1, simTime: 0, realTime: 0, hitStopRemaining: 0,
      scaleTo() {}, slowMo() {},
      hitStop(seconds) { (this as { hitStopRemaining: number }).hitStopRemaining = seconds; }
    };
    const session = new GameSessionImpl({ seed: 0, time });
    session.hitStop(2);
    session.clearRunHitStops();
    expect(time.hitStopRemaining).toBe(2);
  });
});
