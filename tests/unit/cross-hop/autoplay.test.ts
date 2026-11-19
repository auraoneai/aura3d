/**
 * AUTOPLAY addendum (owner, 2026-11-18): with `?autoplay=1` the computer plays Cross Hop hands-free. Runs the real
 * fixed-step sim (`step`) with the autopilot on and no input for several minutes: it hops forward and scores, never
 * idles 5 s, and after every death shows the results card for AUTOPLAY_RESULTS_SECONDS and starts the next run.
 */
import { describe, expect, it } from "vitest";
import { AUTOPLAY_RESULTS_SECONDS, SIM_STEP, startRun, st, step } from "../../../apps/showcase-cross-hop/src/game/core";

const NO_INPUT = { buffered: () => false };

describe("cross hop autoplay", () => {
  for (const seed of [5, 17, 42]) {
    it(`hops forward, scores and loops run after run hands-free (seed ${seed})`, () => {
      st.profile = { best: 0, coins: 0, unlocked: ["hop"], selected: "hop", drills: [], seenIntro: true };
      st.banked = true;
      st.autopilot = true;
      startRun("quick", null, seed);
      const runs: { score: number; rows: number; lasted: number }[] = [];
      const cards: number[] = [];
      let clock = 0;
      let runStart = 0, worstIdle = 0, deadSince = -1, deadLongest = 0, lastRunId = st.runId;
      for (let i = 0; i < 240 / SIM_STEP; i++) {
        step(SIM_STEP, NO_INPUT);
        clock += SIM_STEP; // st.time restarts with every run
        expect(st.autopilot, "autoplay stays on").toBe(true);
        if (st.mode === "run") worstIdle = Math.max(worstIdle, st.idle);
        if (st.mode === "dead") {
          if (deadSince < 0) { deadSince = clock; runs.push({ score: st.score, rows: st.row, lasted: clock - runStart }); }
          deadLongest = Math.max(deadLongest, clock - deadSince);
        } else if (deadSince >= 0) {
          cards.push(clock - deadSince);
          deadSince = -1;
          runStart = clock;
        }
        if (st.runId !== lastRunId) { lastRunId = st.runId; expect(st.mode).toBe("run"); }
        expect(st.mode, "never back on the title menu").not.toBe("title");
      }
      const best = Math.max(st.score, ...runs.map((r) => r.score));
      expect(best, "scores").toBeGreaterThan(15);
      expect(worstIdle, "never idles into the hawk").toBeLessThan(5);
      // Every death card shows ~3 s, then the next run starts by itself.
      expect(deadLongest).toBeLessThanOrEqual(AUTOPLAY_RESULTS_SECONDS + 2 * SIM_STEP);
      for (const c of cards) expect(c, "results card time before the next run").toBeGreaterThanOrEqual(AUTOPLAY_RESULTS_SECONDS - 0.1);
      st.autopilot = false;
    }, 120_000);
  }
});
