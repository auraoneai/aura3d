import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareRuns, encodeInputScript, expandSegments, parseInputScript, parseMarkerBlocks, quantizeSteer, runLengthEncode, toleranceFrom, totalSteps, validateReport,
  type HsInput, type RunResult, type Snapshot
} from "../../../tools/crayon-capture/heatsink-lib";

const base: HsInput = { throttle: 1, brake: 0, steer: 0, afterburner: false, ramjet: false, drift: false, fire: false };

describe("input script codec", () => {
  it("run-length encodes, expands and round-trips through text", () => {
    const inputs: HsInput[] = [base, base, { ...base, steer: 0.25 }, { ...base, steer: 0.25, afterburner: true }, { ...base, ramjet: true, drift: true }];
    const segs = runLengthEncode(inputs);
    expect(segs.map((s) => s.n)).toEqual([2, 1, 1, 1]);
    expect(expandSegments(segs)).toEqual(inputs);
    const text = encodeInputScript(segs);
    expect(expandSegments(parseInputScript(text))).toEqual(inputs);
    expect(totalSteps(parseInputScript(text))).toBe(inputs.length);
  });
  it("rejects malformed lines and ignores comments", () => {
    expect(() => parseInputScript("garbage")).toThrow();
    expect(parseInputScript("# c\n\n3x t1 b0 s0 -")).toHaveLength(1);
  });
  it("quantises steering to 1/20 and clamps", () => {
    expect(quantizeSteer(0.51)).toBeCloseTo(0.5, 12);
    expect(quantizeSteer(7)).toBe(1);
    expect(quantizeSteer(-7)).toBe(-1);
  });
});

const snap = (step: number, s: number): Snapshot => ({
  step,
  player: { s, x: 0, dist: s, v: 1, ab: 1, heat: 0, shield: 10, gunHeat: 0, theta: 0, phi: 0, yW: 0, vyW: 0, steerVal: 0, burning: 0, invuln: 0, burstT: 0, landT: 0, crashT: 0, crashes: 0, crashed: false, airborne: false, onLava: false, abActive: false, rjActive: false, drifting: false, finished: false, takedowns: 0 },
  game: { state: "race", raceTime: step / 60, countdown: 0, lapIdx: 0, bestLap: 0 }
} as unknown as Snapshot);
const run = (delta: number): RunResult => ({ outcome: "ok", snapshots: [snap(0, 0), snap(30, 5 + delta)] } as unknown as RunResult);

describe("run comparison and tolerance", () => {
  it("is exact for identical runs and reports the first divergence otherwise", () => {
    expect(compareRuns(run(0), run(0)).exact).toBe(true);
    const c = compareRuns(run(0), run(0.002));
    expect(c.exact).toBe(false);
    expect(c.firstDivergenceStep).toBe(30);
    expect(c.maxPlayerDelta).toBeCloseTo(0.002, 12);
  });
  it("derives a tolerance with a float32 floor and 1.5x safety", () => {
    expect(toleranceFrom([compareRuns(run(0), run(0))]).player).toBe(1e-3);
    expect(toleranceFrom([compareRuns(run(0), run(0.01))]).player).toBeCloseTo(0.015, 9);
  });
});

describe("log parsing", () => {
  it("extracts marker blocks including CRLF logs and skips truncated blocks", () => {
    const log = ["noise", "@@CRAYON_CAPTURE_BEGIN:0\r", '{"a":1}\r', "@@CRAYON_CAPTURE_END:0", "@@CRAYON_CAPTURE_BEGIN:1", '{"b":', "@@CRAYON_CAPTURE_END:1"].join("\n");
    expect(parseMarkerBlocks(log)).toEqual([{ a: 1 }]);
  });
});

describe("committed reference report", () => {
  const report = JSON.parse(readFileSync("evidence/crayon-capture/heatsink-reference.json", "utf8")) as unknown;
  it("passes validation", () => expect(validateReport(report)).toEqual([]));
  it("rejects a broken report", () => expect(validateReport({ schema: "x" }).length).toBeGreaterThan(3));
});
