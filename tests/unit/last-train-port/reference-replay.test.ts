import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { enrouteSlices, replay, type Reference } from "../../../examples/last-train-port/replay";
import type { RouteData, SimData, Tables } from "../../../examples/last-train-port/sim";

/**
 * Replay of the original's recorded reference (evidence/crayon-capture/last-train-reference.json, 3 circuits, bit-identical in two
 * independent browser sessions) through the port. The same closed-loop controller drives both; the port decides its own dock timings.
 * Tolerances are derived from the measured differences (enroute steps within 5, tips within 2, loop score within 0.1%) with margin.
 */
const ref = JSON.parse(readFileSync("evidence/crayon-capture/last-train-reference.json", "utf8")) as Reference & { repeatability: { sessions: number; identicalEvents: boolean }; memory: { stateKeysDrift: Record<string, number | null> } };
const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};
const result = replay(ref, data, 3);

describe("last-train reference (original)", () => {
  it("was captured twice in fresh browser sessions with identical results", () => {
    expect(ref.repeatability.sessions).toBeGreaterThanOrEqual(2);
    expect(ref.repeatability.identicalEvents).toBe(true);
  });

  it("covers three full circuits with day / night / day and the state size flat across loops", () => {
    expect(ref.loops).toHaveLength(3);
    expect(ref.events.filter((e) => e.kind === "time-of-day").map((e) => e.value)).toEqual(["night", "day"]);
    expect(Object.values(ref.memory.stateKeysDrift).every((d) => d === 0)).toBe(true);
  });
});

describe("port replay matches the original's economy and timing", () => {
  const slices = enrouteSlices(ref.events);
  const refLegs = ref.loops.flatMap((l) => l.legs.map((g) => ({ loop: l.loop, ...g })));

  it("replays eighteen legs without a stall", () => {
    expect(result.legs).toHaveLength(18);
    expect(result.arrivalLegs).toEqual([1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0]);
    expect(result.legs.every((l) => !l.overran)).toBe(true);
  });

  it("enroute time per leg is within 8 steps (0.13 s) of the original", () => {
    result.legs.forEach((leg, i) => {
      const s = slices[i]!;
      expect(Math.abs(leg.steps - (s.endStep - s.startStep)), `loop ${leg.loop} leg ${leg.leg}`).toBeLessThanOrEqual(8);
    });
  });

  it("fares, passengers aboard, lost tips and catches match exactly", () => {
    result.legs.forEach((leg, i) => {
      const r = refLegs[i]!;
      expect(leg.fares, `fares L${leg.loop}/${leg.leg}`).toBe(r.fares);
      expect(leg.aboard, `aboard L${leg.loop}/${leg.leg}`).toBe(r.aboard);
      expect(leg.lost, `lost L${leg.loop}/${leg.leg}`).toBe(r.lost);
      expect(leg.catches, `catches L${leg.loop}/${leg.leg}`).toBe(r.catches);
    });
  });

  it("tips per station are within 2 of the original", () => {
    result.legs.forEach((leg, i) => expect(Math.abs(leg.tips - refLegs[i]!.tips), `tips L${leg.loop}/${leg.leg}`).toBeLessThanOrEqual(2));
  });

  it("loop 1 score equals the original exactly; later loops are within 0.15%", () => {
    expect(result.loopScores[0]).toBe(ref.loops[0]!.score);
    result.loopScores.forEach((score, i) => expect(Math.abs(score - ref.loops[i]!.score) / ref.loops[i]!.score).toBeLessThan(0.0015));
  });

  it("completes each service and starts the next with the same score carried; Gold is reachable without requests (D-06)", () => {
    expect(result.final.attempt.status).toBe("complete");
    // The original graded this clean run Silver because Gold also needed three requests, which are not ported (audit D-06).
    // The port grades Gold on comfort >= 90% with no catches, which this controller run meets.
    const a = result.final.attempt;
    expect(a.catches).toBe(0);
    expect((a.comfort / a.distance) * 100).toBeGreaterThanOrEqual(90);
    expect(a.grade).toBe("Gold");
    expect(result.final.circuits).toBe(1);
  });

  it("passenger names and destinations per station match the original's tables", () => {
    for (const e of ref.events.filter((x) => x.kind === "ready" && x.trips)) {
      for (const t of e.trips!) {
        const row = data.tables.passengerTable.flatMap((r) => r.passengers).find((p) => p.name === t.name && p.destination === t.destination);
        expect(row, `${t.name} -> ${t.destination}`).toBeDefined();
      }
    }
  });

  it("is deterministic: a second replay gives identical results", () => {
    const again = replay(ref, data, 1);
    expect(again.legs.map((l) => [l.steps, l.fares, l.tips])).toEqual(result.legs.slice(0, 6).map((l) => [l.steps, l.fares, l.tips]));
  });
});
