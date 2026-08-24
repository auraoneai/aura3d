import { describe, expect, it } from "vitest";
import {
  HEAT_CONFIG,
  advanceHeat,
  initialScoreState,
  recordShotOutcome,
  updateClocks
} from "../../../apps/showcase-rooftop-buckets/src/scoring";

describe("Rooftop Buckets - deterministic five heat session", () => {
  it("defines open, spot, pressure, fire, and gold finale configs", () => {
    expect(HEAT_CONFIG.map((config) => config.name)).toEqual([
      "Open Heat", "Three-Spot Heat", "Pressure Heat", "Fire Heat", "Gold-Ball Finale"
    ]);
    expect(HEAT_CONFIG[2].shotClock).toBeLessThan(HEAT_CONFIG[0].shotClock);
    expect(HEAT_CONFIG[4].duration).toBe(12);
  });

  it("clears the open heat from ordinary deterministic scoring", () => {
    let state = initialScoreState(1);
    state = recordShotOutcome(state, "swish", 3, false, 1).state;
    expect(state.state).toBe("playing");
    state = recordShotOutcome(state, "bank", 3, false, 2).state;
    expect(state.score).toBe(6);
    expect(state.state).toBe("heat-cleared");
  });

  it("requires three distinct marked makes in the spot heat", () => {
    let state = initialScoreState(2);
    state = recordShotOutcome(state, "swish", 2, false, 1).state;
    state = recordShotOutcome(state, "swish", 2, false, 1).state;
    state = recordShotOutcome(state, "swish", 2, false, 2).state;
    expect(state.state).toBe("playing");
    expect(state.madeSpotIds).toEqual([1, 2]);
    state = recordShotOutcome(state, "rim-in", 2, false, 3).state;
    expect(state.madeSpotIds).toEqual([1, 2, 3]);
    expect(state.state).toBe("heat-cleared");
  });

  it("uses the shorter pressure clock and clears only from earned points", () => {
    let state = initialScoreState(3);
    expect(state.shotClock).toBe(6);
    state = recordShotOutcome(state, "blocked", 3, false, 1).state;
    expect(state.score).toBe(0);
    state = recordShotOutcome(state, "swish", 3, false, 1).state;
    state = recordShotOutcome(state, "swish", 3, false, 1).state;
    expect(state.state).toBe("heat-cleared");
  });

  it("requires three consecutive makes to clear fire heat", () => {
    let state = initialScoreState(4);
    state = recordShotOutcome(state, "swish", 2, false, 1).state;
    state = recordShotOutcome(state, "brick", 2, false, 1).state;
    state = recordShotOutcome(state, "swish", 2, false, 1).state;
    state = recordShotOutcome(state, "rim-in", 2, false, 1).state;
    expect(state.state).toBe("playing");
    const third = recordShotOutcome(state, "bank", 2, false, 1);
    expect(third.event.isFireIgnited).toBe(true);
    expect(third.state.fireAchieved).toBe(true);
    expect(third.state.state).toBe("heat-cleared");
  });

  it("makes the gold finale a single explicit win-or-fail attempt", () => {
    const win = recordShotOutcome(initialScoreState(5), "swish", 3, true, 2);
    expect(win.state.state).toBe("victory");
    expect(win.state.goldMade).toBe(true);
    expect(win.event.isGoldWin).toBe(true);
    const fail = recordShotOutcome(initialScoreState(5), "rim-out", 3, true, 2);
    expect(fail.state.state).toBe("game-over");
    expect(fail.state.goldAttempted).toBe(true);
  });

  it("locks terminal gold outcome against duplicate scoring", () => {
    const won = recordShotOutcome(initialScoreState(5), "swish", 3, true, 2).state;
    const duplicate = recordShotOutcome(won, "swish", 3, true, 2).state;
    expect(duplicate).toEqual(won);
  });

  it("retains fire/gold multipliers only for actual makes", () => {
    let state = initialScoreState(2);
    state = recordShotOutcome(state, "swish", 2, false).state;
    state = recordShotOutcome(state, "swish", 2, false).state;
    state = recordShotOutcome(state, "swish", 2, false).state;
    const fire = recordShotOutcome(state, "swish", 3, false);
    expect(fire.event.pointsEarned).toBe(6);
    expect(recordShotOutcome(initialScoreState(1), "bank", 3, true).event.pointsEarned).toBe(6);
    expect(recordShotOutcome(initialScoreState(1), "brick", 3, true).event.pointsEarned).toBe(0);
  });

  it("handles clock violation, heat failure, and paused time deterministically", () => {
    const violation = updateClocks(initialScoreState(3), 6.5);
    expect(violation.event.isClockViolation).toBe(true);
    expect(violation.state.misses).toBe(1);
    const expired = updateClocks(initialScoreState(1), 46);
    expect(expired.state.state).toBe("game-over");
    const paused = { ...initialScoreState(1), state: "paused" as const };
    expect(updateClocks(paused, 100).state).toEqual(paused);
  });

  it("advances in order and never skips the five-heat finale", () => {
    let state = initialScoreState(1);
    for (let expected = 2; expected <= 5; expected += 1) {
      state = advanceHeat({ ...state, state: "heat-cleared" });
      expect(state.heat).toBe(expected);
      expect(state.state).toBe("playing");
    }
    expect(advanceHeat({ ...state, state: "heat-cleared" }).state).toBe("victory");
  });
});
