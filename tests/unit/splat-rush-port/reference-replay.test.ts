import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TRACE_FIELDS, deriveEvents, parseInputScript, expandSegments, type CaptureReport } from "../../../tools/crayon-capture/splat-rush-lib";
import { replay } from "../../../examples/splat-rush-port/sim";

/**
 * The Phase A-style exit for Splat Rush: replaying the recorded input of the ORIGINAL game through the port's
 * simulation reproduces every recorded field. Reference files are produced remotely by
 * tools/crayon-capture/splat-rush.ts + splat-rush-assemble.ts (state, events and the random-draw count).
 *
 * Integer / counter fields (lives, combo, counts, phase, rngCount, ...) must match exactly. Position and camera
 * fields are floats computed with Math.sin: the references were recorded on x86-64 Linux, and V8's libm result can
 * differ by one unit in the last place on other architectures, so those compare at 1e-9.
 */
const FLOAT_FIELDS = new Set(["px", "py", "pz", "camx", "camy", "camz"]);
const FLOAT_TOLERANCE = 1e-9;

const references = [
  { label: "run (1500 steps, clean play: gate matches, milestones, all power-ups)", file: "evidence/crayon-capture/splat-rush-reference.json", minSteps: 1400, mustHave: ["start", "gate-match", "milestone", "pickup-rainbow", "pickup-shield", "pickup-x2", "colour-switch"] },
  { label: "death (450 steps, ball left idle: three hits, burst, game over)", file: "evidence/crayon-capture/splat-rush-reference-death.json", minSteps: 400, mustHave: ["start", "hit", "burst", "game-over"] }
] as const;

for (const ref of references) {
  describe(`splat-rush-port reproduces the original: ${ref.label}`, () => {
    const path = resolve(ref.file);
    it("has a reference file with >= 2 independent sessions that reproduced it", () => {
      expect(existsSync(path), `${ref.file} is missing: run the remote capture`).toBe(true);
      const report = JSON.parse(readFileSync(path, "utf8")) as CaptureReport;
      expect(report.sessions.filter((s) => s.ok === true).length).toBeGreaterThanOrEqual(2);
      expect(report.sessions.filter((s) => s.traceEqualsReference === false)).toEqual([]);
      expect(report.reference.trace.length).toBeGreaterThan(ref.minSteps);
    });

    it("replays the recorded script and matches every field of every step", () => {
      const report = JSON.parse(readFileSync(path, "utf8")) as CaptureReport & { setup: { seed: number; warmupSteps: number } };
      const inputs = expandSegments(parseInputScript(report.script));
      const { trace } = replay(report.setup.seed, report.setup.warmupSteps, inputs);
      expect(trace.length).toBe(report.reference.trace.length);
      let worstFloat = 0;
      const mismatches: string[] = [];
      for (let i = 0; i < trace.length; i++) {
        for (let c = 0; c < TRACE_FIELDS.length; c++) {
          const name = TRACE_FIELDS[c] as string;
          const a = trace[i]![c]!, b = report.reference.trace[i]![c]!;
          if (FLOAT_FIELDS.has(name)) worstFloat = Math.max(worstFloat, Math.abs(a - b));
          else if (a !== b && mismatches.length < 5) mismatches.push(`step ${i} ${name}: port ${a} vs original ${b}`);
        }
      }
      expect(mismatches).toEqual([]);
      expect(worstFloat).toBeLessThan(FLOAT_TOLERANCE);
    });

    it("produces the same events (start, gate matches, hits, power-ups, burst, game over) at the same steps", () => {
      const report = JSON.parse(readFileSync(path, "utf8")) as CaptureReport & { setup: { seed: number; warmupSteps: number } };
      const inputs = expandSegments(parseInputScript(report.script));
      const { trace } = replay(report.setup.seed, report.setup.warmupSteps, inputs);
      const ours = deriveEvents(trace);
      expect(ours).toEqual(report.reference.events);
      const kinds = new Set(ours.map((e) => e.kind));
      for (const needed of ref.mustHave) expect(kinds.has(needed as never), `reference never exercises "${needed}"`).toBe(true);
    });
  });
}
