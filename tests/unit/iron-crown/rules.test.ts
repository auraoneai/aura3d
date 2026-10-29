import { describe, expect, it, vi } from "vitest";
import { game } from "@aura3d/engine";
import { fighterById } from "../../../apps/showcase-iron-crown/src/game/fighters";
import { moveFor } from "../../../apps/showcase-iron-crown/src/game/moves";
import {
  awardRound,
  BACK_WALK_SCALE,
  canUseSpecial,
  createBoutResultTimer,
  hitCueFor,
  koSlowMo,
  METER_MAX,
  moveAgainst,
  nextComboCount,
  resolveHoldBack,
  timeUpWinner
} from "../../../apps/showcase-iron-crown/src/game/rules";

const box = (offset: readonly [number, number, number], size: readonly [number, number, number]) => ({ id: "b", offset, size });

/** One attacker/target pair in the engine combat world, close enough for every Iron Crown move to connect. */
function duel(targetHealth: number) {
  const combat = game.combatWorld();
  const common = {
    hurtboxes: [box([0, 0.85, 0], [0.72, 1.5, 0.46])],
    guardboxes: [box([0.34, 0.92, 0], [0.68, 1.42, 0.55])],
    pushboxes: [box([0, 0.72, 0], [0.1, 1.25, 0.5])]
  };
  combat.addActor({ id: "player", team: "p1", position: [0, 0, 0], facing: 1, health: 100, ...common });
  combat.addActor({ id: "rival", team: "cpu", position: [1.2, 0, 0], facing: -1, health: targetHealth, ...common });
  return combat;
}

function runUntilEvents(combat: ReturnType<typeof game.combatWorld>, frames = 40) {
  const events: { type: string; damage?: number; targetId?: string }[] = [];
  for (let i = 0; i < frames; i++) {
    combat.update(1 / 60);
    events.push(...combat.consumeEvents());
  }
  return events;
}

describe("iron crown rules: SUPER meter gate (IC-02)", () => {
  it("a special needs a full meter, for either side", () => {
    expect(canUseSpecial(0)).toBe(false);
    expect(canUseSpecial(METER_MAX - 0.01)).toBe(false);
    expect(canUseSpecial(METER_MAX)).toBe(true);
  });
});

describe("iron crown rules: defense applies before the engine's knockout (IC-03)", () => {
  it("scales damage by the target's defense", () => {
    const kenji = fighterById("kenji");
    const boulder = fighterById("boulder");
    expect(moveAgainst("heavy", kenji, boulder).damage).toBeCloseTo(12 * 0.78, 6);
    expect(moveAgainst("heavy", kenji, kenji).damage).toBeCloseTo(12, 6);
    // Volt takes more (defense 1.12).
    expect(moveAgainst("light", kenji, fighterById("volt")).damage).toBeCloseTo(6 * 1.12, 6);
  });

  it("Boulder at 10 HP survives Kenji's heavy on 0.64 HP (the raw 12 used to KO him)", () => {
    const kenji = fighterById("kenji");
    const boulder = fighterById("boulder");
    const scaled = duel(10);
    scaled.beginAttack("player", moveAgainst("heavy", kenji, boulder));
    const events = runUntilEvents(scaled);
    expect(events.some((e) => e.type === "hit")).toBe(true);
    expect(events.some((e) => e.type === "knockout")).toBe(false);
    const rival = scaled.snapshot().actors.find((a) => a.id === "rival")!;
    expect(rival.knockedOut).toBe(false);
    expect(rival.health).toBeCloseTo(0.64, 6);

    // The pre-fix path: raw move into the engine KOs him and latches knockedOut.
    const raw = duel(10);
    raw.beginAttack("player", moveFor("heavy", kenji));
    expect(runUntilEvents(raw).some((e) => e.type === "knockout")).toBe(true);
  });
});

describe("iron crown rules: KO slow motion (IC-08)", () => {
  it("one slow-down at 0.28 for 1.4 s, none under reduced motion", () => {
    expect(koSlowMo(false)).toEqual({ scale: 0.28, ms: 1400 });
    expect(koSlowMo(true)).toBeNull();
  });
});

describe("iron crown rules: true combos only (IC-18)", () => {
  it("extends only while the target is still in hitstun", () => {
    expect(nextComboCount(0, false)).toBe(1);
    expect(nextComboCount(1, true)).toBe(2);
    expect(nextComboCount(4, true)).toBe(5);
    expect(nextComboCount(4, false)).toBe(1);
    expect(nextComboCount(0, true)).toBe(1);
  });
});

describe("iron crown rules: rounds, time-up and draws", () => {
  it("time-up goes to the larger health share; equal shares draw", () => {
    expect(timeUpWinner(0.6, 0.4)).toBe("p1");
    expect(timeUpWinner(0.2, 0.9)).toBe("cpu");
    expect(timeUpWinner(0.5, 0.5)).toBe("draw");
    expect(timeUpWinner(0.5, 0.5004)).toBe("draw");
  });

  it("best of three: two round wins end the bout, a draw awards nothing", () => {
    expect(awardRound({ p1: 0, cpu: 0 }, "p1")).toEqual({ p1: 1, cpu: 0, boutOver: false, p1Won: false });
    expect(awardRound({ p1: 1, cpu: 1 }, "draw")).toEqual({ p1: 1, cpu: 1, boutOver: false, p1Won: false });
    expect(awardRound({ p1: 1, cpu: 1 }, "p1")).toEqual({ p1: 2, cpu: 1, boutOver: true, p1Won: true });
    expect(awardRound({ p1: 0, cpu: 1 }, "cpu")).toEqual({ p1: 0, cpu: 2, boutOver: true, p1Won: false });
  });
});

describe("iron crown rules: hold back walks back while guarding (IC-06)", () => {
  it("holding away guards and walks back; the guard key blocks in place", () => {
    // Foe to the right (+x): away is axis -1.
    expect(resolveHoldBack(-1, 1, false)).toEqual({ guard: true, walkBack: true, dashDir: -1 });
    expect(resolveHoldBack(-1, 1, true)).toEqual({ guard: true, walkBack: false, dashDir: -1 });
    expect(resolveHoldBack(1, 1, false)).toEqual({ guard: false, walkBack: false, dashDir: 1 });
    expect(resolveHoldBack(0, 1, true)).toEqual({ guard: true, walkBack: false, dashDir: 1 });
    // Foe to the left: away is +1, back-dash goes +x.
    expect(resolveHoldBack(1, -1, false)).toEqual({ guard: true, walkBack: true, dashDir: 1 });
    expect(BACK_WALK_SCALE).toBeCloseTo(0.6);
  });
});

describe("iron crown rules: bout-result timer (IC-04)", () => {
  it("a new bout cancels the pending result card", () => {
    vi.useFakeTimers();
    try {
      const timer = createBoutResultTimer();
      const shown = vi.fn();
      timer.schedule(shown, 1600);
      expect(timer.pending).toBe(true);
      vi.advanceTimersByTime(800);
      timer.cancel(); // configureBout for the next Ladder rung
      vi.advanceTimersByTime(2000);
      expect(shown).not.toHaveBeenCalled();
      expect(timer.pending).toBe(false);

      timer.schedule(shown, 1600);
      vi.advanceTimersByTime(1600);
      expect(shown).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rescheduling replaces the earlier card, so a Ladder rung advances once", () => {
    vi.useFakeTimers();
    try {
      const timer = createBoutResultTimer();
      const advance = vi.fn();
      timer.schedule(advance, 1600);
      timer.schedule(advance, 1600);
      vi.advanceTimersByTime(5000);
      expect(advance).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("iron crown rules: hit cues per move (IC-17)", () => {
  it("maps move ids to their cue", () => {
    expect(hitCueFor("kenji-light")).toBe("hit-light");
    expect(hitCueFor("kenji-heavy")).toBe("hit-heavy");
    expect(hitCueFor("boulder-throw")).toBe("hit-heavy");
    expect(hitCueFor("volt-special")).toBe("hit-special");
    expect(hitCueFor(undefined)).toBe("hit");
  });
});
