import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, autopilot } from "../../../examples/roadster-hours-port/autopilot";
import { LEVELS, trafficPiece } from "../../../examples/roadster-hours-port/course";
import { simulateRun } from "../../../examples/roadster-hours-port/replay";
import { defaultCareer, type RunInput } from "../../../examples/roadster-hours-port/sim";
import {
  TRACE_KEYS, diffObservations, expandSegments, observe, totalSteps,
  type Observation, type ReferenceReport, type TraceSample, type Transition
} from "../../../tools/crayon-capture/roadster-hours-lib";

/**
 * Phase B reference: the ORIGINAL game's recorded closed-loop run (evidence/crayon-capture/roadster-hours-reference.json,
 * recorded remotely by tools/crayon-capture/roadster-hours.ts) versus this port, step for step.
 */
const REFERENCE = "evidence/crayon-capture/roadster-hours-reference.json";

function loadReference(): ReferenceReport {
  expect(existsSync(REFERENCE), `${REFERENCE} must exist (record it with tools/crayon-capture/roadster-hours.ts)`).toBe(true);
  return JSON.parse(readFileSync(REFERENCE, "utf8")) as ReferenceReport;
}

function replay(report: ReferenceReport) {
  const inputs = expandSegments(report.script);
  const career = { ...defaultCareer(), unlocked: 2 };
  const transitions: Transition[] = [];
  const trace: TraceSample[] = [];
  let prev: Observation | null = null;
  const result = simulateRun({
    level: report.level, career, maxSteps: inputs.length,
    input: (_run, step) => inputs[step] as RunInput,
    onStep: (run, step) => {
      const obs = observe(run);
      diffObservations(step, prev, obs, transitions);
      if (step % 60 === 0) trace.push({ step, obs });
      prev = obs;
    }
  });
  return { ...result, transitions, trace };
}

describe("roadster-hours-port reproduces the original's recorded run", () => {
  const report = loadReference();

  it("the reference is a finished, repeatable capture", () => {
    expect(report.status).toBe("CAPTURED");
    expect(report.reference.final!.phase).toBe("complete");
    expect(report.sessions.length).toBeGreaterThanOrEqual(1);
    expect(totalSteps(report.script)).toBe(report.steps);
    for (const c of report.variance.sessions) { expect(c.sameScript && c.sameFinal && c.sameTransitions).toBe(true); }
  });

  it("replaying the script ends on the same step with the original's final state", () => {
    const { run, steps } = replay(report);
    const f = report.reference.final!;
    expect(steps).toBe(report.steps);
    expect(run.phase).toBe("complete");
    expect(run.time).toBeCloseTo(f.time, 9);
    expect(run.score).toBe(f.score);
    expect(run.cells.size).toBe(f.cells);
    expect(run.crashes).toBe(f.crashes);
    for (const key of ["cleanLandings", "airRolls", "combos", "lineupsCleared", "vehiclesCleared", "overTops", "nearMisses", "trailerRides", "shortcuts"] as const) {
      expect(run[key], key).toBe(f[key]);
    }
    expect(run.airSpins).toBe(f.airSpins);
    expect(run.airFlips).toBe(f.airFlips);
    expect(run.result!.medal).toBe(f.results[run.level.id]!.medal);
    expect(run.result!.score).toBe(f.results[run.level.id]!.score);
  });

  it("every counter transition (gate, landing, cell, crash, ...) happens on the same step", () => {
    const { transitions } = replay(report);
    const ref = report.reference.transitions;
    expect(transitions.length).toBe(ref.length);
    for (let i = 0; i < ref.length; i++) {
      expect({ step: transitions[i]!.step, key: transitions[i]!.key, to: transitions[i]!.to }, `transition ${i}`).toEqual({ step: ref[i]!.step, key: ref[i]!.key, to: ref[i]!.to });
    }
    expect(ref.some((t) => t.key === "nextGate"), "the reference passes relays").toBe(true);
  });

  it("the half-second state trace stays within the capture's own measured tolerance", () => {
    const { trace } = replay(report);
    const ref = report.reference.trace;
    expect(trace.length).toBe(ref.length);
    const tolerance = Math.max(1e-9, report.tolerance.traceDelta);
    let worst = 0;
    for (let i = 0; i < ref.length; i++) {
      for (const key of TRACE_KEYS) {
        const d = Math.abs((trace[i]!.obs[key] as number) - (ref[i]!.obs[key] as number));
        worst = Math.max(worst, d);
        expect(d, `${key} at step ${ref[i]!.step}`).toBeLessThanOrEqual(tolerance);
      }
    }
    console.log(`roadster-hours replay: worst trace delta ${worst} (tolerance ${tolerance}), ${ref.length} samples`);
  });

  it("the closed-loop autopilot in the port produces the same script the original was driven with", () => {
    const recorded: RunInput[] = [];
    const career = { ...defaultCareer(), unlocked: 2 };
    simulateRun({ level: report.level, career, input: (run) => { const i = autopilot(run, DEFAULT_PARAMS); recorded.push(i); return i; } });
    const expected = expandSegments(report.script);
    expect(recorded.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
      const a = recorded[i]!, b = expected[i]!;
      if (a.steer !== b.steer || !!a.thrust !== b.thrust) throw new Error(`autopilot diverged from the recorded script at step ${i}`);
    }
  });

  it("the original's traffic pieces have the dimensions the port derives from the same piece table", () => {
    const menu = report.reference.menuTraffic as { piece: string; halfLen: number; halfWid: number; hgt: number }[] | null;
    expect(menu, "the capture recorded the menu-state traffic").not.toBeNull();
    const level = LEVELS[report.level]!;
    expect(menu!.length).toBe(level.traffic.length);
    menu!.forEach((car, i) => {
      const spawn = level.traffic[i]!;
      const info = trafficPiece(spawn.piece, spawn.v || 0);
      expect(car.piece).toBe(spawn.piece);
      expect(car.halfLen).toBeCloseTo(info.halfLen, 6);
      expect(car.halfWid).toBeCloseTo(info.halfWid, 6);
      expect(car.hgt).toBeCloseTo(info.hgt, 6);
    });
  });
});
