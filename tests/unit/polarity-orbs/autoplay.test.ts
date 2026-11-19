import { describe, expect, it } from "vitest";
import { AUTOPLAY_RESULTS_STEPS, Autopilot } from "../../../apps/showcase-polarity-orbs/src/autopilot";
import { CONFIG, IDLE, PolarityOrbsSim } from "../../../apps/showcase-polarity-orbs/src/sim";

/**
 * `?autoplay=1` (main.ts): warmup idles on the title, then the looping Autopilot drives every fixed step through
 * `sim.advance` (the normal input path). This mirrors that loop on the real sim without a browser.
 */
const STEPS_PER_SECOND = Math.round(1 / CONFIG.DT);

function runAutoplay(seed: number, seconds: number, mistakeRows: readonly number[] = []) {
  const sim = new PolarityOrbsSim(seed);
  for (let i = 0; i < 30; i++) sim.advance(IDLE); // main.ts autostart warmup
  const pilot = new Autopilot({ restartAfterSteps: AUTOPLAY_RESULTS_STEPS, mistakeRows });
  let maxScore = 0;
  let maxDistance = 0;
  let restarts = 0;
  let gameOvers = 0;
  let longestStall = 0;
  let stall = 0;
  let firstPlayingStep = -1;
  let last = "";
  let prevPhase = sim.o.phase;
  for (let step = 0; step < seconds * STEPS_PER_SECOND; step++) {
    sim.advance(pilot.next(sim, step));
    pilot.observe(sim);
    const o = sim.o;
    if (o.phase === "playing" && firstPlayingStep < 0) firstPlayingStep = step;
    if (prevPhase !== "gameOver" && o.phase === "gameOver") gameOvers++;
    if (prevPhase === "gameOver" && o.phase === "playing") restarts++;
    prevPhase = o.phase;
    maxScore = Math.max(maxScore, o.score);
    maxDistance = Math.max(maxDistance, o.distance);
    const signature = `${o.phase}|${o.distance.toFixed(3)}|${o.score}`;
    stall = signature === last ? stall + 1 : 0;
    last = signature;
    longestStall = Math.max(longestStall, stall);
  }
  return { sim, maxScore, maxDistance, restarts, gameOvers, longestStall, firstPlayingStep };
}

describe("polarity-orbs autoplay", () => {
  it("starts at once and plays well: scores, collects, rarely misses, never stalls", () => {
    for (const seed of [20261124, 7, 42]) {
      const run = runAutoplay(seed, 120);
      expect(run.firstPlayingStep, `seed ${seed} starts`).toBeLessThan(3 * STEPS_PER_SECOND);
      expect(run.maxScore, `seed ${seed} score`).toBeGreaterThan(1000);
      expect(run.maxDistance, `seed ${seed} distance`).toBeGreaterThan(1000);
      expect(run.longestStall, `seed ${seed} stall`).toBeLessThan(5 * STEPS_PER_SECOND);
      expect(run.sim.o.wrongs, `seed ${seed} wrong orbs`).toBeLessThanOrEqual(2);
      expect(run.sim.o.orbsCollected, `seed ${seed} orbs`).toBeGreaterThan(100);
    }
  });

  it("after a game over it holds the results ~3 s, then restarts, looping forever", () => {
    // Mistake rows 0..5 drain all lives early in every run (row ids restart at 0), forcing repeated game overs.
    const run = runAutoplay(20261124, 60, [0, 1, 2, 3, 4, 5]);
    expect(run.gameOvers).toBeGreaterThanOrEqual(3);
    expect(run.restarts).toBeGreaterThanOrEqual(run.gameOvers - 1);
    expect(run.longestStall).toBeGreaterThanOrEqual(AUTOPLAY_RESULTS_STEPS - 2);
    expect(run.longestStall).toBeLessThan(5 * STEPS_PER_SECOND);
  });

  it("without restartAfterSteps the pilot stays on the results screen (QA hook and replay behaviour)", () => {
    const sim = new PolarityOrbsSim(20261124);
    const pilot = new Autopilot({ mistakeRows: [0, 1, 2, 3, 4, 5] });
    for (let i = 0; i < 60 * STEPS_PER_SECOND; i++) {
      sim.advance(pilot.next(sim, i));
      pilot.observe(sim);
    }
    expect(sim.o.phase).toBe("gameOver");
  });
});
