import { describe, expect, it } from "vitest";
import {
  firstRowDivergence,
  leadInTicks,
  nativeFactory,
  replayScenario,
  snapshotRow,
  type DrivableEngine,
  type EngineFactory,
  type ReferenceScenario
} from "./replay-lib";

/** Small, hand-authored source inputs, not recorded browser evidence. */
function sourceScenario(rows: ReferenceScenario["sampled"]["rows"] = [[1, 1 / 60, "serve"]]): ReferenceScenario {
  return {
    id: "manual-source",
    setup: { difficulty: "beginner", venue: "hard", fixedStepSeconds: 1 / 60 },
    script: { encoding: "keys", inputs: [] },
    reference: {
      steps: 4, finalMode: "", finalPhase: "", winner: null, matchWon: null,
      score: { pg: 0, ag: 0, pp: 0, ap: 0 }, stats: null,
      eventCounts: {}, eventCount: 0, timeline: [], digest: ""
    },
    events: [], sampled: { columns: ["step", "t", "phase"], rows }, sessions: []
  };
}

describe("replay comparison source contracts", () => {
  it("rounds a hand-authored complete snapshot without changing field order", () => {
    const state = {
      time: 0.1234567, mode: "playing", phase: "rally", server: "player", serveNumber: 1,
      score: { playerPoints: 15, aiPoints: 30, playerGames: 2, aiGames: 1 }, rallyHits: 3, tiebreak: true,
      ball: { x: 1, y: 2, z: 3, vx: 4, vy: 5, vz: 6, active: true, bounceCount: 2, lastHit: "ai", speedKph: 12.3456789 },
      player: { x: 7, y: 8, vx: 9, vy: 10, swing: 0.25, stroke: "forehand", moveBlend: 0.5, stride: 1.5 },
      ai: { x: -7, y: -8, vx: -9, vy: -10, swing: 0.75, stroke: "backhand", moveBlend: 0.25, stride: 0.5 },
      message: "serve", energy: 4.5
    };
    expect(snapshotRow(state)).toEqual([
      0.123457, "playing", "rally", "player", 1, 15, 30, 2, 1, 3, 1,
      1, 2, 3, 4, 5, 6, 1, 2, "ai", 12.345679,
      7, 8, 9, 10, 0.25, "forehand", 0.5, 1.5,
      -7, -8, -9, -10, 0.75, "backhand", 0.25, 0.5, "serve", 4.5
    ]);
  });

  it("accepts finite rows inside tolerance and identifies the first true difference", () => {
    const sc = sourceScenario([[1, 0.25, "serve"], [2, 0.5, "rally"]]);
    const within = new Map<number, Array<number | string | null>>([[1, [0.2500005, "serve"]], [2, [0.5, "rally"]]]);
    expect(firstRowDivergence(within, sc, 0.000001)).toBeNull();
    const changed = new Map<number, Array<number | string | null>>([[1, [0.25, "serve"]], [2, [0.5, "point"]]]);
    expect(firstRowDivergence(changed, sc, 0)).toEqual({ step: 2, column: "phase", got: "point", want: "rally" });
  });

  it("reports a missing, short, or overlong actual row", () => {
    const sc = sourceScenario([[1, 0.25, "serve"]]);
    expect(firstRowDivergence(new Map(), sc, 0)).toEqual({ step: 1, column: "(row missing)", got: null, want: null });
    expect(firstRowDivergence(new Map([[1, []]]), sc, 0)).toEqual({ step: 1, column: "(row width)", got: 0, want: 2 });
    expect(firstRowDivergence(new Map([[1, [0.25, "serve", 7]]]), sc, 0)).toEqual({ step: 1, column: "(row width)", got: 3, want: 2 });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("never treats non-finite %s as equal", (value) => {
    const actual = new Map<number, Array<number | string | null>>([[1, [value, "serve"]]]);
    const expected = sourceScenario([[1, 0.25, "serve"]]);
    expect(firstRowDivergence(actual, expected, 0)?.column).toBe("t");
    const invalidReference = sourceScenario([[1, value, "serve"]]);
    expect(firstRowDivergence(new Map([[1, [0.25, "serve"]]]), invalidReference, 0)?.column).toBe("t");
    expect(firstRowDivergence(actual, invalidReference, 0)?.column).toBe("t");
  });

  it("does not accept sparse rows merely because both missing values compare equal", () => {
    const actual: Array<number | string | null> = new Array(2);
    actual[1] = "serve";
    const expected: Array<number | string | null> = new Array(3);
    expected[0] = 1;
    expected[2] = "serve";
    expect(firstRowDivergence(new Map([[1, actual]]), sourceScenario([expected]), 0)?.column).toBe("t");
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("rejects invalid tolerance %s", (value) => {
    expect(() => firstRowDivergence(new Map(), sourceScenario(), value)).toThrow(RangeError);
  });

  it("rejects absent, malformed and duplicate reference rows", () => {
    expect(() => firstRowDivergence(new Map(), sourceScenario([]), 0)).toThrow(/sampled rows/);
    expect(() => firstRowDivergence(new Map(), sourceScenario([[1, 0.25]]), 0)).toThrow(/row width/);
    expect(() => firstRowDivergence(new Map(), sourceScenario([[-1, 0.25, "serve"]]), 0)).toThrow(/reference step/);
    const actual = new Map<number, Array<number | string | null>>([[1, [0.25, "serve"]]]);
    expect(() => firstRowDivergence(actual, sourceScenario([[1, 0.25, "serve"], [1, 0.25, "serve"]]), 0)).toThrow(/duplicated/);
  });
});

describe("source-only fixed-step replay", () => {
  it("derives lead-in ticks from independently selected first-sample times", () => {
    expect(leadInTicks(sourceScenario([[1, 1 / 60, "serve"]]))).toBe(0);
    expect(leadInTicks(sourceScenario([[1, 3 / 60, "serve"]]))).toBe(2);
  });

  it("runs the native simulation deterministically at one fixed step per row", () => {
    const sc = sourceScenario();
    const first = replayScenario(sc, nativeFactory, { maxSteps: 3 });
    const second = replayScenario(sc, nativeFactory, { maxSteps: 3 });
    expect(first).toEqual(second);
    expect(first.leadIn).toBe(0);
    expect(first.steps).toBe(3);
    expect([...first.rows.keys()]).toEqual([1, 2, 3]);
    expect(first.rows.get(1)?.[0]).toBeCloseTo(1 / 60, 6);
    expect(first.rows.get(3)?.[0]).toBeCloseTo(3 / 60, 6);
    expect(first.rows.get(3)).toHaveLength(39);
  });

  it("applies held and released keys before the corresponding fixed step", () => {
    const sc = sourceScenario();
    sc.script.inputs = [
      { step: 1, code: "KeyD", down: true },
      { step: 3, code: "KeyD", down: false }
    ];
    const steps: Array<{ dt: number; x: unknown }> = [];
    const make: EngineFactory = ({ readInput }) => {
      const state = {
        time: 0, mode: "playing", paused: false, phase: "serve", server: "player", serveCourt: "deuce", serveNumber: 1,
        difficulty: "beginner", practice: false, score: { playerPoints: 0, aiPoints: 0, playerGames: 0, aiGames: 0 },
        rallyHits: 0, tiebreak: false, ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, active: false, bounceCount: 0, lastHit: null },
        player: { x: 0.5, y: 1.035, vx: 0, vy: 0, swing: 0, swingCooldown: 0, stroke: "forehand", moveBlend: 0, stride: 0, selectedShot: "neutral" },
        ai: { x: 0, y: 0, vx: 0, vy: 0, swing: 0, stroke: "backhand", moveBlend: 0, stride: 0 },
        message: "", energy: 0, stats: {}
      };
      return {
        state,
        resetMatch() {},
        step(dt = 0) {
          const input = readInput("player") as { x: unknown };
          steps.push({ dt, x: input.x });
          state.time += dt;
        }
      } as DrivableEngine;
    };
    const result = replayScenario(sc, make, { maxSteps: 4 });
    expect(steps).toEqual([
      { dt: 1 / 60, x: 1 }, { dt: 1 / 60, x: 1 },
      { dt: 1 / 60, x: 0 }, { dt: 1 / 60, x: 0 }
    ]);
    expect(result.rows.get(1)?.[21]).toBeCloseTo(0.5225, 6);
    expect(result.rows.get(2)?.[21]).toBeCloseTo(0.545, 6);
    expect(result.rows.get(3)?.[21]).toBeCloseTo(0.545, 6);
  });
});
