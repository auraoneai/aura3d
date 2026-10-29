import { describe, expect, it } from "vitest";
import {
  FREE_MODE_HISTORY,
  STEP,
  autopilot,
  createRace,
  medalForPlace,
  pruneFreeModeHistory,
  rivalCatchUp,
  startCountdown,
  stepRace,
  type RaceEvent,
  type RaceState
} from "../../../examples/strange-orbit-port/race";

/**
 * Audit 2026-10-29 rows SO-2 (medal by place), SO-3 (difficulty), SO-7 (loop entry is not a gate) and
 * SO-10 (free mode keeps bounded state). The autopilot (pedal, steer to the line, boost above 40 stardust)
 * stands in for a competent player that never uses ramps, shortcuts or gravity.
 */

const racing = (options: Parameters<typeof createRace>[0] = {}): RaceState => {
  const state = createRace(options);
  startCountdown(state);
  while (state.phase === "countdown") stepRace(state, {}, STEP);
  return state;
};

function autopilotCup(difficulty: string, vehicle: "bike" | "skate", balance: "cup" | "original" = "cup") {
  const e = racing({ difficulty, vehicle, balance });
  let n = 0;
  while (n++ < 60 * 60 * 8 && e.phase === "racing") stepRace(e, autopilot(e), STEP);
  const bestRival = e.rivals.slice().sort((a, b) => b.s - a.s)[0]!;
  return { e, place: e.end?.place ?? e.place, leadMetres: e.s - bestRival.s, bestRival };
}

describe("medal by finishing place (SO-2)", () => {
  it("1st gold, 2nd silver, 3rd bronze, 4th to 6th no medal", () => {
    expect([1, 2, 3, 4, 5, 6].map(medalForPlace)).toEqual(["gold", "silver", "bronze", null, null, null]);
  });

  it("a cup race finished 6th ends with no medal", () => {
    const e = racing({ difficulty: "expert" });
    e.laps = 1;
    for (const r of e.rivals) { r.s = 1449; r.speed = 40; }
    e.s = 1440;
    e.speed = 30;
    let n = 0;
    while (n++ < 60 * 30 && e.phase === "racing") stepRace(e, { pedal: true, steer: Math.max(-1, Math.min(1, -e.lane * 0.6 - e.heading * 1.5)) }, STEP);
    expect(e.phase).toBe("finished");
    expect(e.end?.place).toBe(6);
    expect(e.end?.medal).toBeNull();
  });
});

describe("rival difficulty (SO-3)", () => {
  it("Expert: the autopilot finishes no better than 3rd on bike and skate", () => {
    for (const vehicle of ["bike", "skate"] as const) {
      const { e, place } = autopilotCup("expert", vehicle);
      expect(e.phase, vehicle).toBe("finished");
      expect(place, vehicle).toBeGreaterThanOrEqual(3);
    }
  });

  it("Explorer: the autopilot wins, by less than 30 s", () => {
    for (const vehicle of ["bike", "skate"] as const) {
      const { e, place, leadMetres, bestRival } = autopilotCup("explorer", vehicle);
      expect(place, vehicle).toBe(1);
      // the best rival's remaining distance at its current cruise speed
      expect(leadMetres / Math.max(20, bestRival.speed), vehicle).toBeLessThan(30);
      expect(e.end?.medal).toBe("gold");
    }
  });

  it("Racer: the autopilot's lead over the best rival is under 15 s (the original's was over 30 s)", () => {
    const cup = autopilotCup("racer", "bike");
    const original = autopilotCup("racer", "bike", "original");
    expect(cup.leadMetres / Math.max(20, cup.bestRival.speed)).toBeLessThan(15);
    expect(original.leadMetres / Math.max(20, original.bestRival.speed)).toBeGreaterThan(30);
  });

  it("catch-up starts past 120 m of player lead and is capped", () => {
    expect(rivalCatchUp(0)).toBe(0);
    expect(rivalCatchUp(120)).toBe(0);
    expect(rivalCatchUp(170)).toBeCloseTo(3, 9);
    expect(rivalCatchUp(5000)).toBe(10);
  });

  it("the original balance never surges or catches up", () => {
    const e = racing({ balance: "original" });
    for (let i = 0; i < 60 * 40; i++) stepRace(e, autopilot(e), STEP);
    expect(e.rivals.every((r) => r.surge === undefined)).toBe(true);
  });
});

describe("skate loop entry (SO-7)", () => {
  it("emits a loop event, not a gate event without a gate id", () => {
    const e = racing({ vehicle: "skate" });
    e.s = 129.5;
    e.lane = 5.5;
    e.speed = 40;
    stepRace(e, { pedal: true }, STEP);
    expect(e.loop?.def.id).toBe("satellite-loop");
    expect(e.events.some((ev: RaceEvent) => ev.type === "loop")).toBe(true);
    expect(e.events.filter((ev: RaceEvent) => ev.type === "gate" && typeof ev.gate !== "number")).toEqual([]);
  });
});

describe("free mode keeps bounded state (SO-10)", () => {
  it("pruning keeps the previous and current lap's collected keys and the last lap times", () => {
    const e = createRace({ mode: "free" });
    for (const k of ["0:a", "3:b", "4:c", "5:d"]) e.collected.add(k);
    e.lapTimes = Array.from({ length: FREE_MODE_HISTORY + 7 }, (_, i) => i);
    pruneFreeModeHistory(e, 5);
    expect([...e.collected].sort()).toEqual(["4:c", "5:d"]);
    expect(e.lapTimes).toHaveLength(FREE_MODE_HISTORY);
    expect(e.lapTimes[0]).toBe(7);
  });

  it("three free-mode laps leave only recent collected keys", () => {
    const e = racing({ mode: "free" });
    let n = 0;
    while (n++ < 60 * 60 * 4 && e.lap < 4 && e.phase === "racing") stepRace(e, autopilot(e), STEP);
    expect(e.lap).toBeGreaterThanOrEqual(4);
    const laps = new Set([...e.collected].map((k) => Number(k.split(":")[0])));
    expect(Math.min(...laps)).toBeGreaterThanOrEqual(e.lap - 3);
  });
});
