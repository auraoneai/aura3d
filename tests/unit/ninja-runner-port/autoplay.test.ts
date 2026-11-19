/**
 * `?autoplay=1` (alias `?autopilot=1`): the computer plays Shadowstep hands-free through the real sim and the normal
 * action path, and a finished run restarts after its results card, forever. Mirrors main.ts: `begin` = createState +
 * startRun, each step applies `policyActions` then `stepSim`, and `createAutoplayLoop` times the results card.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUTOPLAY_RESULTS_SECONDS, DEFAULT_POLICY, autoplayRequested, createAutoplayLoop, policyActions } from "../../../examples/ninja-runner-port/autopilot";
import { SIM_STEP, applyAction, createState, drainEvents, startRun, stepSim, type SimState } from "../../../examples/ninja-runner-port/sim";

function begin(): SimState {
  const z = createState();
  startRun(z);
  drainEvents(z);
  return z;
}

describe("Shadowstep autoplay", () => {
  it("reads ?autoplay=1 and the old ?autopilot=1 alias", () => {
    expect(autoplayRequested(new URLSearchParams("autoplay=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams("autopilot=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams(""))).toBe(false);
  });

  it("plays the real sim hands-free: makes progress, never stalls 5 s, and restarts after each result", () => {
    let z = begin();
    const loop = createAutoplayLoop();
    const SECONDS = 400;
    let runs = 1, finished = 0, best = 0, kills = 0, stalled = 0, worstStall = 0, lastS = 0, resultsShown = 0;
    for (let t = 0; t < SECONDS; t += SIM_STEP) {
      if (z.phase === "running") {
        for (const a of policyActions(z, DEFAULT_POLICY)) applyAction(z, a);
        stepSim(z, SIM_STEP);
        drainEvents(z);
        if (z.s > lastS + 1e-6) stalled = 0; else stalled += SIM_STEP;
        worstStall = Math.max(worstStall, stalled);
        lastS = z.s;
        best = Math.max(best, z.s);
        const ended: string = (z as { phase: string }).phase; // stepSim/drainEvents may end the run (TS keeps the "running" narrowing)
        if (ended === "won" || ended === "lost") { finished++; kills = Math.max(kills, z.kills); resultsShown = 0; }
      } else {
        resultsShown += SIM_STEP;
        // the results card holds ~3 s, never longer than a frame past it
        expect(resultsShown).toBeLessThan(AUTOPLAY_RESULTS_SECONDS + 0.05);
        if (loop.tick(z.phase, SIM_STEP)) { z = begin(); runs++; lastS = 0; stalled = 0; }
      }
    }
    expect(best).toBeGreaterThan(500);
    expect(worstStall).toBeLessThan(5);
    expect(finished).toBeGreaterThanOrEqual(1);
    expect(runs).toBeGreaterThanOrEqual(2);
    expect(kills).toBeGreaterThan(0);
  }, 60_000);

  it("main.ts wires it: alias config, title skipped, results restart, P toggles, hint on both pages", () => {
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    const main = read("../../../examples/ninja-runner-port/main.ts");
    expect(main).toContain("autopilot: autoplayRequested(params)");
    expect(main).toContain('if (z.phase === "intro" && countdown <= 0) begin();');
    expect(main).toContain("else if (autoRestart.tick(z.phase, dt)) begin();");
    expect(main).toContain('if (e.code === "KeyP") { autopilotOn = !autopilotOn;');
    for (const page of ["../../../examples/ninja-runner-port/index.html", "../../../apps/showcase-ninja-runner-port/index.html"]) {
      expect(read(page)).toContain("<dt>P</dt><dd>autoplay</dd>");
    }
  });
});
