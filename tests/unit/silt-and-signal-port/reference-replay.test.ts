import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { TRACE_COLUMNS, expandSegments, validateReport, type SiltScriptSegment, type SiltTraceRow } from "../../../tools/crayon-capture/silt-and-signal-lib";
import { createSim, stepSim, type Input, type Sim } from "../../../examples/silt-and-signal-port/sim";

/**
 * Phase exit for Silt & Signal (docs/workflows/threejs-parity-gaps.md, R-20 / R-25): the ported simulation replays
 * the recorded per-step inputs of the ORIGINAL game's scripted rides and reproduces its state trace step by step.
 * The reference (evidence/crayon-capture/silt-and-signal-reference.json) was recorded remotely; its tolerance is
 * derived from the measured session-to-session and replay variance.
 */
interface Ride {
  chapter: number;
  objective: number;
  start: { x: number; y: number; z: number; yaw: number; time: number; clockMs: number };
  endMode: string;
  segments: SiltScriptSegment[];
  trace: SiltTraceRow[];
  summary: { steps: number; completed: boolean; completedAtStep: number | null; impacts: number; finalObjective: number };
  sessions: number;
  comparisons: { kind: string; position: number; yaw: number; firstDivergence: number | null; lengthMatch: boolean }[];
  tolerance: { position: number; yaw: number; completionSteps: number };
}
interface Report { reference: Ride; rides: Ride[]; limitations: string[] }

const report = JSON.parse(fs.readFileSync("evidence/crayon-capture/silt-and-signal-reference.json", "utf8")) as Report;

const row = (sim: Sim): SiltTraceRow => {
  const s = sim.state, f = sim.flight;
  return [s.x, s.y, s.z, s.yaw, f.speed, f.turn, f.bank, f.vertical, f.energy, s.objective, s.point, s.hold, f.impacts];
};

function replay(ride: Ride, floor: (x: number, z: number, y: number) => number): SiltTraceRow[] {
  const sim = createSim(ride.chapter, ride.objective, { floor }, ride.start);
  const trace: SiltTraceRow[] = [];
  for (const input of expandSegments(ride.segments)) {
    stepSim(sim, input as Input, 1 / 60);
    trace.push(row(sim));
    if (sim.state.scene) break;
  }
  return trace;
}

describe("silt-and-signal reference report", () => {
  it("is a valid a3d-crayon-capture/1 report with at least one ride", () => {
    expect(validateReport(report)).toEqual([]);
    expect(report.rides.length).toBeGreaterThanOrEqual(1);
  });

  it("was recorded without collisions (the port has no colliders) and every ride completed", () => {
    for (const ride of report.rides) {
      expect(ride.summary.impacts, `ride ${ride.chapter}:${ride.objective} impacts`).toBe(0);
      expect(ride.summary.completed, `ride ${ride.chapter}:${ride.objective} completed`).toBe(true);
    }
  });

  it("measured the original's own repeatability: replays and sessions agree within the derived tolerance", () => {
    for (const ride of report.rides) {
      expect(ride.comparisons.length).toBeGreaterThan(0);
      for (const c of ride.comparisons) {
        expect(c.lengthMatch, `${ride.chapter}:${ride.objective} ${c.kind}`).toBe(true);
        expect(c.position).toBeLessThanOrEqual(ride.tolerance.position);
        expect(c.yaw).toBeLessThanOrEqual(ride.tolerance.yaw);
      }
    }
  });
});

describe("the ported simulation reproduces the original's rides", () => {
  for (const ride of report.rides) {
    describe(`chapter ${ride.chapter} objective ${ride.objective} (${ride.trace.length} steps)`, () => {
      const mine = replay(ride, () => -100);

      it("matches every recorded column at every step within the data-derived tolerance", () => {
        expect(mine.length).toBe(ride.trace.length);
        // A ride that ends in a cutscene: on the completing step the original also repositions the rider for the
        // scene staging (not ported), so that last row is compared on its discrete state only.
        const staged = ride.endMode === "scene";
        let worst = 0;
        for (let i = 0; i < mine.length; i++) {
          const a = mine[i] as SiltTraceRow, b = ride.trace[i] as SiltTraceRow;
          const lastStaged = staged && i === mine.length - 1;
          for (let c = 0; c < TRACE_COLUMNS.length; c++) {
            const name = TRACE_COLUMNS[c] as string;
            const discrete = name === "objective" || name === "point" || name === "impacts" || name === "hold";
            if (lastStaged && !discrete) continue;
            const d = Math.abs((a[c] as number) - (b[c] as number));
            if (name === "objective" || name === "point" || name === "impacts") expect(a[c], `step ${i} ${name}`).toBe(b[c]);
            else {
              const limit = name === "yaw" ? Math.max(ride.tolerance.yaw, 1e-6) : Math.max(ride.tolerance.position, 1e-6);
              expect(d, `step ${i} ${name}: port ${a[c]} vs original ${b[c]}`).toBeLessThanOrEqual(limit);
              worst = Math.max(worst, d);
            }
          }
        }
        expect(worst).toBeLessThan(1e-6);
      });

      it("completes the objective on the same step as the original", () => {
        const orig = ride.summary.completedAtStep as number;
        expect(orig).not.toBeNull();
        const sim = createSim(ride.chapter, ride.objective, { floor: () => -100 }, ride.start);
        let step = 0;
        let done = 0;
        for (const input of expandSegments(ride.segments)) {
          stepSim(sim, input as Input, 1 / 60);
          step++;
          if (!done && (sim.state.objective > ride.objective || sim.state.scene)) done = step;
        }
        expect(Math.abs(done - orig)).toBeLessThanOrEqual(ride.tolerance.completionSteps);
      });

      it("is unchanged by the default terrain floor (the clamp is never engaged on this ride)", () => {
        const withFloor = replay(ride, () => 0.6);
        expect(compareMax(withFloor, mine)).toBe(0);
      });

      it("is deterministic", () => {
        expect(replay(ride, () => -100)).toEqual(mine);
      });
    });
  }
});

function compareMax(a: SiltTraceRow[], b: SiltTraceRow[]): number {
  let worst = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) for (let c = 0; c < 13; c++) worst = Math.max(worst, Math.abs((a[i]![c] as number) - (b[i]![c] as number)));
  return worst;
}
