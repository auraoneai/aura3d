/**
 * Owner 2026-11-18: `?autoplay=1` must let the computer play Serpentine hands-free, competently, looping forever.
 * Drives the real sim with the autoplay input only and checks progress, no stuck stretch, and that it out-runs an idle
 * runner (which falls at the first gap).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { autoplayRequested, createAutoplay } from "../../../examples/saiyan-snake-way-port/autoplay";
import { STEP, createRun, stepRun } from "../../../examples/saiyan-snake-way-port/sim";

function play(seconds: number, auto: boolean) {
  const S = createRun();
  const ap = createAutoplay();
  let stuck = 0, maxStuck = 0, lastS = S.s;
  const steps = Math.round(seconds / STEP);
  let i = 0;
  for (; i < steps && S.phase === "run"; i++) {
    stepRun(S, auto ? ap.next(S) : {}, STEP);
    if (S.s - lastS < 0.01) { stuck += STEP; maxStuck = Math.max(maxStuck, stuck); } else stuck = 0;
    lastS = S.s;
  }
  return { S, seconds: i * STEP, maxStuck };
}

describe("Serpentine autoplay", () => {
  it("parses ?autoplay=1 and the ?autopilot=1 alias (not a ?script= replay)", () => {
    expect(autoplayRequested("?autoplay=1")).toBe(true);
    expect(autoplayRequested("?autopilot=1")).toBe(true);
    expect(autoplayRequested("?autopilot=1&script=abc")).toBe(false);
    expect(autoplayRequested("")).toBe(false);
  });

  it("40 s of autoplay runs far, scores, never stalls and beats an idle runner", () => {
    const idle = play(40, false);
    const auto = play(40, true);
    expect(auto.S.score).toBeGreaterThan(0);
    expect(auto.S.s).toBeGreaterThan(800);
    expect(auto.maxStuck).toBeLessThan(5);
    expect(auto.S.s).toBeGreaterThan(idle.S.s);
    expect(auto.seconds).toBeGreaterThan(idle.seconds);
  }, 120_000);

  it("main.ts drives autoplay through the normal input path and restarts after the results card", () => {
    const src = readFileSync("examples/saiyan-snake-way-port/main.ts", "utf8");
    expect(src).toContain("return autoplayOn ? autoplay.next(state) : human;");
    expect(src).toMatch(/autoplayOn && resultsShown && !config\.manual && \(resultsT \+= dt\) > AUTOPLAY_RESULTS_SECONDS\) startRun\(false\)/);
    expect(src).toContain('"KeyO"');
    for (const page of ["examples/saiyan-snake-way-port/index.html", "apps/showcase-serpentine-sky-run-port/index.html"]) {
      expect(readFileSync(page, "utf8")).toContain("<kbd>O</kbd></span><span>autoplay");
    }
  });
});
