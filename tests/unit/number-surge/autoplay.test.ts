import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUTOPLAY_PILOT, AUTOPLAY_RESULTS_SECONDS, Autopilot, DEFAULT_AUTOPILOT } from "../../../apps/showcase-number-surge/src/autopilot";
import { CONFIG, IDLE, NumberSurgeSim, replay, type Input } from "../../../apps/showcase-number-surge/src/sim";

const STEPS_PER_SECOND = Math.round(1 / CONFIG.DT);

/** The main.ts autoplay loop: warmup idle frames on the title, step counter reset, then the autopilot every fixed step. */
function autoplayRun(seed: number, seconds: number, onStep?: (sim: NumberSurgeSim, step: number) => void) {
  const sim = new NumberSurgeSim(seed);
  for (let i = 0; i < 30; i++) sim.advance(IDLE);
  const pilot = new Autopilot(AUTOPLAY_PILOT);
  let maxScore = 0;
  let maxDistance = 0;
  let powerups = 0;
  let smashes = 0;
  let restarts = 0;
  let longestStill = 0;
  let still = 0;
  let last = { distance: sim.o.distance, phase: sim.o.phase };
  for (let step = 0; step < seconds * STEPS_PER_SECOND; step++) {
    const before = sim.o.phase;
    sim.advance(pilot.next(sim, step));
    if (before === "gameOver" && sim.o.phase === "playing") restarts += 1;
    maxScore = Math.max(maxScore, sim.o.score);
    maxDistance = Math.max(maxDistance, sim.o.distance);
    powerups = Math.max(powerups, sim.o.events.powerup);
    smashes = Math.max(smashes, sim.o.events.smash);
    still = sim.o.distance === last.distance && sim.o.phase === last.phase ? still + 1 : 0;
    longestStill = Math.max(longestStill, still);
    last = { distance: sim.o.distance, phase: sim.o.phase };
    onStep?.(sim, step);
  }
  return { sim, maxScore, maxDistance, powerups, smashes, restarts, longestStillSeconds: longestStill / STEPS_PER_SECOND };
}

describe("number surge ?autoplay=1", () => {
  it("starts by itself and plays well: scores, travels, smashes walls, collects power-ups, never stalls for 5 s", () => {
    for (const seed of [20261103, 7, 42]) {
      const run = autoplayRun(seed, 180);
      expect(run.maxScore, `seed ${seed}`).toBeGreaterThan(0);
      expect(run.maxDistance, `seed ${seed}`).toBeGreaterThan(500);
      expect(run.smashes, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(run.powerups, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(run.longestStillSeconds, `seed ${seed}`).toBeLessThan(5);
    }
  });

  it("after a forced game over it shows results for ~3 s, then restarts on its own", () => {
    let forced = false;
    let overSteps = 0;
    let restartedAt = -1;
    let overAt = -1;
    const run = autoplayRun(11, 20, (sim, step) => {
      if (!forced && sim.o.phase === "playing" && sim.o.distance > 40) {
        forced = true;
        sim.o.number = 1;
        sim.o.shieldActive = false;
        const wall = sim.o.walls.find((w) => !w.active)!;
        wall.active = true;
        wall.z = 0.5;
        wall.hp = 50;
      }
      if (sim.o.phase === "gameOver") {
        if (overAt < 0) overAt = step;
        overSteps += 1;
      }
      if (overAt >= 0 && restartedAt < 0 && sim.o.phase === "playing") restartedAt = step;
    });
    expect(forced).toBe(true);
    expect(overAt).toBeGreaterThan(0);
    expect(restartedAt).toBeGreaterThan(overAt);
    expect(overSteps / STEPS_PER_SECOND).toBeCloseTo(AUTOPLAY_RESULTS_SECONDS, 1);
    expect(run.restarts).toBeGreaterThanOrEqual(1);
    expect(run.longestStillSeconds).toBeLessThan(5);
    // the new run makes progress again
    expect(run.sim.o.phase).toBe("playing");
    expect(run.sim.o.distance).toBeGreaterThan(0);
  });

  it("taking over mid-run (KeyO) steers from the sim's real target", () => {
    const sim = new NumberSurgeSim(5);
    sim.advance({ ...IDLE, start: true });
    for (let i = 0; i < 20; i++) sim.advance({ ...IDLE, dx: 0.2 });
    expect(sim.steerTarget).toBeCloseTo(CONFIG.LANE_LIMIT, 6);
    const pilot = new Autopilot(AUTOPLAY_PILOT);
    pilot.sync(sim);
    for (let i = 0; i < 600; i++) sim.advance(pilot.next(sim, i + 1));
    expect(sim.o.goodPicks).toBeGreaterThan(sim.o.badPicks);
  });

  it("normal play is untouched: the default autopilot still restarts at once and replays stay deterministic", () => {
    expect(DEFAULT_AUTOPILOT.restartHoldSteps ?? 0).toBe(0);
    const sim = new NumberSurgeSim(3);
    sim.o.phase = "gameOver";
    expect(new Autopilot().next(sim, 5).start).toBe(true);
    const inputs: Input[] = [];
    const s = new NumberSurgeSim(11);
    const p = new Autopilot();
    for (let i = 0; i < 600; i++) {
      const input = p.next(s, i);
      inputs.push(input);
      s.advance(input);
    }
    expect(replay(11, 30, inputs).trace).toEqual(replay(11, 30, inputs).trace);
  });

  it("main.ts wires ?autoplay=1 (aliases autostart / autopilot), KeyO, and the controls hint mentions it", () => {
    const main = readFileSync("apps/showcase-number-surge/src/main.ts", "utf8");
    expect(main).toMatch(/autoplay: \{ type: "flag" \}/);
    expect(main).toMatch(/config\.autoplay \|\| config\.autostart \|\| config\.autopilot/);
    expect(main).toMatch(/e\.code === "KeyO"/);
    const html = readFileSync("apps/showcase-number-surge/index.html", "utf8");
    expect(html).toMatch(/O autopilot/);
    expect(html).toMatch(/<kbd>O<\/kbd>/);
  });
});
