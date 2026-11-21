import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONFIG, IDLE, SplatTurfSim, type Phase } from "../../../apps/showcase-splat-turf/src/sim";
import { AutoplayDriver, RESULTS_HOLD_SECONDS, TurfAutopilot } from "../../../apps/showcase-splat-turf/src/autopilot";

const STEPS_PER_SECOND = Math.round(1 / CONFIG.DT);

/** main.ts with `?autoplay=1`: `warmup` idle steps, then `pilot.next(sim)` feeds `sim.advance` every fixed step. */
function autoplay(seconds: number, seed = 20261121, warmup = 30) {
  const sim = new SplatTurfSim(seed);
  for (let i = 0; i < warmup; i++) sim.advance(IDLE);
  const pilot = new AutoplayDriver();
  const phases: Phase[] = [];
  const distance: number[] = [];
  for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) {
    sim.advance(pilot.next(sim));
    phases.push(sim.o.phase);
    distance.push(sim.o.distance);
  }
  return { sim, phases, distance };
}

describe("splat turf ?autoplay=1", () => {
  it("starts within 3 s, paints and scores, never stalls 5 s, and loops through results into new runs", () => {
    const { sim, phases, distance } = autoplay(240);
    const firstPlay = phases.indexOf("playing");
    expect(firstPlay).toBeGreaterThanOrEqual(0);
    expect(firstPlay).toBeLessThan(3 * STEPS_PER_SECOND);
    expect(sim.o.score + sim.o.distance).toBeGreaterThan(0);

    // No state lasts >= 5 s without progress: playing advances distance; results / splash hand over within ~3 s.
    let still = 0;
    for (let i = 1; i < phases.length; i++) {
      const moved = phases[i] !== phases[i - 1] || (phases[i] === "playing" && distance[i]! > distance[i - 1]!);
      still = moved ? 0 : still + 1;
      expect(still, `stuck in ${phases[i]} at step ${i}`).toBeLessThan(5 * STEPS_PER_SECOND);
    }

    // Every end of run (gameOver or finished) is followed by a fresh run after the ~3 s results hold.
    const ends: number[] = [];
    for (let i = 1; i < phases.length; i++) {
      if ((phases[i] === "gameOver" || phases[i] === "finished") && phases[i - 1] !== phases[i]) ends.push(i);
    }
    expect(ends.length).toBeGreaterThanOrEqual(2);
    for (const end of ends) {
      const restart = phases.indexOf("playing", end);
      if (restart < 0) { expect(phases.length - end).toBeLessThan(RESULTS_HOLD_SECONDS * STEPS_PER_SECOND + 2); continue; }
      const held = (restart - end) / STEPS_PER_SECOND;
      expect(held).toBeGreaterThan(RESULTS_HOLD_SECONDS - 0.1);
      expect(held).toBeLessThan(RESULTS_HOLD_SECONDS + 0.1);
      expect(distance[restart]!).toBeLessThan(1); // a new run, from the start line
    }
  });

  it("each autoplayed run makes real progress (distance, paint, score)", () => {
    const { sim } = autoplay(20);
    expect(sim.o.phase).toBe("playing");
    expect(sim.o.distance).toBeGreaterThan(200);
    expect(sim.o.score).toBeGreaterThan(0);
    expect(sim.o.paintedCells).toBeGreaterThan(100);
  });

  it("restarts a finished run after the results hold", () => {
    const sim = new SplatTurfSim(7);
    const pilot = new AutoplayDriver();
    for (let i = 0; i < 10; i++) sim.advance(pilot.next(sim));
    sim.o.distance = CONFIG.RUN_LENGTH - 0.05;
    sim.advance(pilot.next(sim));
    expect(sim.o.phase).toBe("finished");
    let n = 0;
    while (sim.o.phase === "finished" && n < 10 * STEPS_PER_SECOND) { sim.advance(pilot.next(sim)); n++; }
    expect(sim.o.phase).toBe("playing");
    expect(sim.o.distance).toBeLessThan(1);
    expect(n / STEPS_PER_SECOND).toBeCloseTo(RESULTS_HOLD_SECONDS, 1);
  });

  it("the first run is input-for-input the previous step-indexed autopilot (normal play untouched)", () => {
    const a = new SplatTurfSim(11), b = new SplatTurfSim(11);
    const driver = new AutoplayDriver();
    const legacy = new TurfAutopilot();
    for (let i = 0; i < 1500; i++) {
      const ia = driver.next(a), ib = legacy.next(b, i);
      expect(ia).toEqual(ib);
      a.advance(ia); b.advance(ib);
    }
    expect(a.traceRow(a.traceLength - 1)).toEqual(b.traceRow(b.traceLength - 1));
  });

  it("main.ts wires ?autoplay=1 via readAutoplayFlag + createAutoplayHarness and KeyO; the controls hint lists it", () => {
    const main = readFileSync(new URL("../../../apps/showcase-splat-turf/src/main.ts", import.meta.url), "utf8");
    const html = readFileSync(new URL("../../../apps/showcase-splat-turf/index.html", import.meta.url), "utf8");
    expect(main).toMatch(/readAutoplayFlag\(/);
    expect(main).toMatch(/createAutoplayHarness</);
    expect(main).toMatch(/\.next\(sim\)/);
    expect(main).toMatch(/e\.code === "KeyO"/);
    expect(html).toMatch(/O autopilot/);
  });
});
