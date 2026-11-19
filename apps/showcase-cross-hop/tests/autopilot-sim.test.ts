import { describe, expect, it } from "vitest";
import { AUTOPLAY_GAMBLE_SECONDS, startRun, st, step, SIM_STEP, CRITTER_HIT_HALF } from "../src/game/core";
import { CROSSING_WINDOW, laneFor, laneMovers, moverHalf } from "../src/game/world";

/**
 * Autoplay pass (owner, 2026-11-19: "autoplay dies often in dense traffic"). N headless runs of the real fixed-step sim
 * with `st.autopilot` on, over seeds and every theme (Downtown Trams, Neon District and Critter Core are the dense
 * ones), each capped at RUN_SECONDS. Before this pass (gap-window heuristic, same 42 runs, 150 s cap): median row 45,
 * 41 of 42 runs ended in a squash or a sweep, the first at row 6.
 */
const NO_INPUT = { buffered: () => false };
const RUN_SECONDS = 120;
const THEMES: (number | undefined)[] = [undefined, 0, 1, 2, 3, 4, 5];
const RUNS = 42;

interface RunResult { row: number; death: string | null; seconds: number }
function simulate(seed: number, theme: number | undefined): RunResult {
  startRun("quick", null, seed, theme);
  st.autopilot = true;
  const steps = Math.round(RUN_SECONDS / SIM_STEP);
  let maxIdle = 0;
  for (let i = 0; i < steps && st.mode === "run"; i++) {
    step(SIM_STEP, NO_INPUT);
    maxIdle = Math.max(maxIdle, st.idle);
  }
  return { row: st.row, death: st.mode === "dead" ? st.dead?.label ?? "?" : null, seconds: st.time };
}

const results: RunResult[] = [];

describe("Cross Hop autopilot plays like a decent human", () => {
  // Split in chunks so one long synchronous loop does not starve the vitest worker RPC.
  for (let chunk = 0; chunk < 3; chunk++) {
    it(`simulated autoplay runs ${chunk * 14}..${chunk * 14 + 13}`, () => {
      for (let s = chunk * 14; s < chunk * 14 + 14; s++) results.push(simulate(1000 + s * 7919, THEMES[s % THEMES.length]));
    }, 120_000);
  }

  it("goes far (median well past the old 45 rows) and rarely dies", () => {
    expect(results.length).toBe(RUNS);
    const rows = results.map((r) => r.row).sort((a, b) => a - b);
    const median = rows[Math.floor(rows.length / 2)]!;
    const deaths = results.filter((r) => r.death);
    console.log(`autopilot (${RUNS} runs, ${RUN_SECONDS} s cap): median row ${median}, min ${rows[0]}, deaths ${deaths.length}/${RUNS}`
      + (deaths.length ? `: ${deaths.map((d) => `${d.death}@${d.row}`).join(", ")}` : ""));
    expect(median).toBeGreaterThanOrEqual(250);
    expect(deaths.length).toBeLessThanOrEqual(Math.ceil(RUNS * 0.1));
    // No early deaths: anything before row 150 is a planner miss, not the late-game difficulty.
    for (const d of deaths) expect(d.row).toBeGreaterThanOrEqual(150);
    // Never taken by the hawk, never swept off the edge on a log.
    for (const d of deaths) expect(d.death).toBe("Squashed");
  });

  it("only gambles after waiting a human-length while", () => {
    expect(AUTOPLAY_GAMBLE_SECONDS).toBeGreaterThanOrEqual(5);
  });
});

describe("every road and tram lane can be crossed", () => {
  it(`leaves each spot clear for at least ${CROSSING_WINDOW} s between movers, wrap included`, () => {
    const xs = new Float32Array(32);
    for (let seed = 1; seed <= 60; seed++) {
      for (let row = 4; row < 400; row += 3) {
        const l = laneFor(row, seed * 977, Math.min(1, row / 220));
        if (l.type !== "road" && l.type !== "tram") continue;
        const n = laneMovers(l, 0, xs);
        const sorted = Array.from(xs.slice(0, n)).sort((a, b) => a - b);
        const span = 34 + 2 * moverHalf(l) + 2;
        for (let i = 0; i < n; i++) {
          const gap = i + 1 < n ? sorted[i + 1]! - sorted[i]! : sorted[0]! + span - sorted[n - 1]!;
          const clearSeconds = (gap - 2 * (moverHalf(l) + CRITTER_HIT_HALF)) / l.speed;
          expect(clearSeconds).toBeGreaterThanOrEqual(CROSSING_WINDOW - 1e-6);
        }
      }
    }
  });
});
