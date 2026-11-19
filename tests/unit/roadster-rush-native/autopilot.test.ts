import { describe, expect, it } from "vitest";
import { RoadsterGame } from "../../../apps/showcase-roadster-rush/src/native/game";
import { Player } from "../../../apps/showcase-roadster-rush/src/native/player";
import { Traffic } from "../../../apps/showcase-roadster-rush/src/native/traffic";
import { FreewayWorld } from "../../../apps/showcase-roadster-rush/src/native/world";
import { FIXED_DT } from "../../../apps/showcase-roadster-rush/src/native/constants";
import { createFreewayAutopilot } from "../../../apps/showcase-roadster-rush/src/native/autopilot";

function makeGame(seed: number): RoadsterGame {
  const game = new RoadsterGame({ player: new Player(), traffic: new Traffic(), world: new FreewayWorld(), params: new URLSearchParams(`seed=${seed}`), storage: null });
  game.boot();
  return game;
}

/** Runs the real sim hands-free under the autoplay pilot for `seconds`, ticking it every fixed step. */
function autoplayRun(seed: number, seconds: number) {
  const game = makeGame(seed) as any;
  const state = { lastTickMs: 0, lastStuntMs: 0, gameOverSinceMs: 0, stats: { ticks: 0, steps: 0 } };
  const tick = createFreewayAutopilot(state);
  game.start();
  let now = 1000;
  const crashes: { t: number; what: string; z: number }[] = [];
  let restarts = 0, maxDistance = 0, lastMode = game.mode, stuckFor = 0, lastZ = game.player.position.z, maxStuck = 0, playSeconds = 0;
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) {
    tick(game, now);
    game.simStep(FIXED_DT);
    now += FIXED_DT * 1000;
    if (game.mode === "crashed" && lastMode === "playing") crashes.push({ t: i * FIXED_DT, what: game.crashWhat, z: game.player.position.z });
    if (game.mode === "playing" && lastMode === "gameover") restarts++;
    lastMode = game.mode;
    if (game.mode === "playing") {
      playSeconds += FIXED_DT;
      maxDistance = Math.max(maxDistance, Number(game.distance ?? 0));
      const z = game.player.position.z;
      stuckFor = Math.abs(z - lastZ) < 0.01 ? stuckFor + FIXED_DT : 0;
      maxStuck = Math.max(maxStuck, stuckFor);
      lastZ = z;
    }
  }
  return { crashes, restarts, maxDistance, maxStuck, playSeconds, stepsPerTick: state.stats.steps / Math.max(1, state.stats.ticks) };
}

describe("Apex Overdrive ?autoplay=1 pilot drives the real sim hands-free", () => {
  it("makes progress, survives long stretches, and restarts after a wreck", () => {
    for (const seed of [1, 2, 3]) {
      const r = autoplayRun(seed, 180);
      // every run makes real progress, never stalls 5 s, and a wreck always leads to a fresh run (looping forever)
      expect(r.maxDistance).toBeGreaterThan(900);
      expect(r.maxStuck).toBeLessThan(5);
      expect(r.restarts).toBeGreaterThanOrEqual(r.crashes.length - 1);
      // no wreck within the first 20 s of any run
      expect(r.crashes.every((c, i) => c.t - (i === 0 ? 0 : r.crashes[i - 1]!.t) > 20)).toBe(true);
    }
  }, 300000);

  it("drives like a careful human: at most one wreck per 3 simulated minutes, no sign wrecks, a bounded CPU budget", () => {
    // owner QA Nov 19: the rule-based pilot wrecked every 30-60 s (signs, rear-ends, sky roadsters); the look-ahead
    // planner predicts ~2 s for every candidate manoeuvre and must keep wrecks rare across seeds
    let crashes = 0;
    let minutes = 0;
    const what: string[] = [];
    for (const seed of [4, 5, 9]) {
      const r = autoplayRun(seed, 240);
      crashes += r.crashes.length;
      minutes += r.playSeconds / 60;
      what.push(...r.crashes.map((c) => c.what));
      // ~2000 prediction steps a tick (~1-2 ms on a laptop core, ten ticks a second)
      expect(r.stepsPerTick).toBeLessThan(3500);
    }
    expect(minutes).toBeGreaterThan(11);
    expect(crashes, `wrecks: ${what.join(", ")}`).toBeLessThanOrEqual(Math.floor(minutes / 3));
    expect(what).not.toContain("sign");
  }, 600000);
});
