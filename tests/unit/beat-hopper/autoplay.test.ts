import { describe, expect, it } from "vitest";
import { AUTOPLAY_PARAMS, AUTOPLAY_RESULTS_SECONDS, Autopilot, autoplayRequested } from "../../../apps/showcase-beat-hopper/src/autopilot";
import { BeatHopperSim, CONFIG, IDLE, type Input } from "../../../apps/showcase-beat-hopper/src/sim";

/**
 * `?autoplay=1`: the autopilot drives the real sim through ordinary Inputs (the same path main.ts's fixed-step loop
 * uses: `pilot.next(sim, step)` then `sim.advance(input)`), plays well, and loops forever through game over.
 */
const STEPS_PER_S = Math.round(1 / CONFIG.DT);

function drive(sim: BeatHopperSim, pilot: Autopilot, seconds: number, onStep?: (input: Input, i: number) => void): void {
  for (let i = 0; i < seconds * STEPS_PER_S; i++) {
    const input = pilot.next(sim, i);
    sim.advance(input);
    pilot.observe(sim);
    onStep?.(input, i);
  }
}

describe("beat-hopper autoplay", () => {
  it("?autoplay=1 is canonical; ?autopilot=1, ?demo=1 and ?autostart=1 are aliases; no flag stays manual", () => {
    expect(autoplayRequested("?autoplay=1")).toBe(true);
    expect(autoplayRequested("?autopilot=1")).toBe(true);
    expect(autoplayRequested("?autostart=1")).toBe(true);
    expect(autoplayRequested("?autostart")).toBe(true);
    expect(autoplayRequested("?demo=1")).toBe(true);
    expect(autoplayRequested("?autoplay=0")).toBe(false);
    expect(autoplayRequested("")).toBe(false);
  });

  it("90 simulated seconds from the title: starts at once, scores, keeps moving, hops, big-jumps, ducks, steers and collects", () => {
    const sim = new BeatHopperSim(20261101);
    const pilot = new Autopilot(AUTOPLAY_PARAMS);
    let startedAt = -1, bigJumps = 0, hops = 0, laneSteps = 0, lastBig = false, lastAir = false;
    let still = 0, longestStill = 0, lastKey = "";
    drive(sim, pilot, 90, (input, i) => {
      const o = sim.o;
      if (startedAt < 0 && o.phase === "playing") startedAt = i;
      if (o.bigJump && !lastBig) bigJumps++;
      if (o.pose === "air" && !lastAir && !o.bigJump) hops++;
      lastBig = o.bigJump;
      lastAir = o.pose === "air";
      if (input.lane !== 0) laneSteps++;
      const key = `${o.phase}:${o.dist.toFixed(3)}:${o.score}`;
      still = key === lastKey ? still + 1 : 0;
      longestStill = Math.max(longestStill, still);
      lastKey = key;
    });
    const o = sim.o;
    expect(startedAt).toBeGreaterThanOrEqual(0);
    expect(startedAt).toBeLessThan(3 * STEPS_PER_S);
    expect(o.phase).toBe("playing");
    expect(o.score).toBeGreaterThan(0);
    expect(o.dist).toBeGreaterThan(0);
    expect(longestStill, "never stuck for 5 s").toBeLessThan(5 * STEPS_PER_S);
    expect(o.miss).toBe(0);
    expect(o.perfect).toBeGreaterThan(50);
    expect(hops).toBeGreaterThan(10);
    expect(bigJumps).toBeGreaterThan(3);
    expect(o.dodges).toBeGreaterThan(5);
    expect(o.orbs).toBeGreaterThan(5);
    expect(laneSteps).toBeGreaterThan(10);
    // Ducks: bars judged PERFECT/GOOD while the pilot ducked (no misses means every bar row was ducked or stepped around).
    expect(o.perfect + o.good).toBeGreaterThan(o.dodges);
  });

  it("after a forced game over the results stay up ~3 s, then the run restarts by itself (and again after the next)", () => {
    const sim = new BeatHopperSim(7);
    const pilot = new Autopilot(AUTOPLAY_PARAMS);
    drive(sim, pilot, 8);
    expect(sim.o.score).toBeGreaterThan(0);
    for (let round = 0; round < 2; round++) {
      // Force the end of the run: last life lost.
      sim.o.lives = 0;
      sim.o.phase = "bursting";
      sim.o.burstT = 0;
      let overAt = -1, restartAt = -1;
      drive(sim, pilot, CONFIG.BURST_SECONDS + AUTOPLAY_RESULTS_SECONDS + 1, (_input, i) => {
        if (overAt < 0 && sim.o.phase === "gameOver") overAt = i;
        if (overAt >= 0 && restartAt < 0 && sim.o.phase === "playing") restartAt = i;
      });
      expect(overAt).toBeGreaterThanOrEqual(0);
      expect(restartAt).toBeGreaterThan(overAt);
      expect((restartAt - overAt) / STEPS_PER_S).toBeCloseTo(AUTOPLAY_RESULTS_SECONDS, 1);
      expect(sim.o.lives).toBe(CONFIG.MAX_LIVES);
      drive(sim, pilot, 5);
      expect(sim.o.phase).toBe("playing");
      expect(sim.o.score).toBeGreaterThan(0); // scoring again in the new run
      expect(sim.o.miss).toBe(0);
    }
  });

  it("the default pilot (QA hooks, death-path specs) still stays on the results card", () => {
    const sim = new BeatHopperSim(7);
    const pilot = new Autopilot();
    drive(sim, pilot, 2);
    sim.o.lives = 0;
    sim.o.phase = "bursting";
    drive(sim, pilot, 10);
    expect(sim.o.phase).toBe("gameOver");
    expect(pilot.next(sim, 0)).toEqual(IDLE);
  });
});
