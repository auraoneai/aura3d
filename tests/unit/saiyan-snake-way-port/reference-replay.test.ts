import { readFileSync } from "node:fs";
import { loadLegacyJson } from "../_support/legacy-names";
import { describe, expect, it } from "vitest";
import { STEP, createRun, expandScript, snapshot, stepRun, type InputSegment } from "../../../examples/saiyan-snake-way-port/sim";

/**
 * Replays the ORIGINAL game's recorded outbound run (evidence/crayon-capture/saiyan-snake-way-reference.json:
 * a closed-loop autopilot driving the real game at a fixed 1/60 s step) through the port's pure simulation and
 * compares every recorded snapshot field-for-field. `errs` is a page-level error counter, not simulation state.
 */
interface Snap extends Record<string, unknown> { frame: number }
interface Reference {
  script: { totalSteps: number; taps: number; segments: InputSegment[] };
  summary: { outcome: string; frames: number; final: Snap };
  snapshots: Snap[];
  events: { frame: number; what: string; to?: unknown }[];
  repeatability: { allIdentical: boolean; replaySessions: number; tolerance: { simFields: number } };
}
const reference = loadLegacyJson<Reference>("saiyan", readFileSync(new URL("../../../evidence/crayon-capture/saiyan-snake-way-reference.json", import.meta.url), "utf8"));
const TOLERANCE = reference.repeatability.tolerance.simFields;

function replay(): { frames: Map<number, Record<string, unknown>>; steps: number; state: ReturnType<typeof createRun> } {
  const inputs = expandScript(reference.script.segments);
  const wanted = new Set(reference.snapshots.map((s) => s.frame));
  const state = createRun();
  const frames = new Map<number, Record<string, unknown>>();
  let steps = 0;
  if (wanted.has(0)) frames.set(0, snapshot(state, 0));
  for (const input of inputs) {
    stepRun(state, input, STEP);
    steps++;
    if (wanted.has(steps)) frames.set(steps, snapshot(state, steps));
    if (state.phase !== "run" || state.atEnd) break;
  }
  if (wanted.has(steps)) frames.set(steps, snapshot(state, steps));
  return { frames, steps, state };
}

describe("Serpentine Sky Run: replay of the original's recorded run", () => {
  const out = replay();

  it("the reference run is a full outbound run that the original replayed identically in fresh sessions", () => {
    expect(reference.summary.outcome).toBe("reached-end-of-road");
    expect(reference.script.totalSteps).toBeGreaterThan(5000);
    expect(reference.repeatability.replaySessions).toBeGreaterThanOrEqual(2);
    expect(reference.repeatability.allIdentical).toBe(true);
  });

  it("reaches the end of the road on the same step", () => {
    expect(out.steps).toBe(reference.script.totalSteps);
    expect(out.state.atEnd).toBe(true);
    expect(out.state.phase).toBe("run");
  });

  it("matches every recorded snapshot field within the recorded tolerance", () => {
    let compared = 0;
    const bad: string[] = [];
    for (const ref of reference.snapshots) {
      const mine = out.frames.get(ref.frame);
      expect(mine, `no port snapshot at frame ${ref.frame}`).toBeDefined();
      for (const key of Object.keys(ref)) {
        if (key === "errs") continue;
        compared++;
        const a = (mine as Record<string, unknown>)[key], b = ref[key];
        const ok = typeof b === "number" ? Math.abs((a as number) - b) <= TOLERANCE : a === b;
        if (!ok && bad.length < 8) bad.push(`frame ${ref.frame} ${key}: port=${JSON.stringify(a)} reference=${JSON.stringify(b)}`);
      }
    }
    expect(bad).toEqual([]);
    expect(compared).toBeGreaterThan(8000);
  });

  it("reproduces the stage sequence and the Surge rung changes", () => {
    const stages = reference.events.filter((e) => e.what === "stage").map((e) => e.to);
    expect(stages).toEqual(["CHECK-IN", "THE LONG ROAD", "TRAFFIC", "THE SERPENT HALL", "THE COILS", "THE BROKEN SPINE", "THE DROWSE", "THE END OF THE ROAD"]);
    expect(reference.events.filter((e) => e.what === "rung").length).toBeGreaterThan(10);
  });

  it("ends in the recorded final state", () => {
    const final = reference.summary.final;
    const mine = snapshot(out.state, reference.summary.frames);
    for (const key of ["phase", "s", "days", "score", "ki", "strain", "speed", "kiChain", "milestoneIndex", "atEnd"]) {
      const a = mine[key], b = final[key];
      if (typeof b === "number") expect(Math.abs((a as number) - b)).toBeLessThanOrEqual(TOLERANCE);
      else expect(a).toBe(b);
    }
  });
});
