import { describe, expect, it } from "vitest";
import { CONFIG, DT, ShapeShiftSim, type Phase } from "../../../apps/showcase-shape-shift-sprint/src/sim";
import { AUTOPLAY_PILOT, Autopilot } from "../../../apps/showcase-shape-shift-sprint/src/autopilot";

/**
 * `?autoplay=1` drives the real sim through its normal `Input` path with `AUTOPLAY_PILOT` (main.ts passes
 * `pilot.next(sim, steps)` to `sim.advance` exactly like this).
 */
interface Run {
  sim: ShapeShiftSim;
  maxStillSteps: number;
  restarts: number;
  livesLost: number;
  forms: Set<number>;
  phases: Phase[];
}

function autoplay(seed: number, seconds: number, pilot = new Autopilot(AUTOPLAY_PILOT)): Run {
  const sim = new ShapeShiftSim(seed);
  const steps = Math.round(seconds / DT);
  let still = 0, maxStillSteps = 0, restarts = 0, livesLost = 0;
  let lastDistance = sim.o.distance, lastPhase = sim.o.phase, lastLives = sim.o.lives;
  const forms = new Set<number>();
  const phases: Phase[] = [];
  for (let i = 0; i < steps; i++) {
    sim.advance(pilot.next(sim, i));
    pilot.observe(sim);
    const o = sim.o;
    // Progress: the runner moved, or the run changed phase (results -> next run is progress too).
    if (o.distance !== lastDistance || o.phase !== lastPhase) still = 0;
    else maxStillSteps = Math.max(maxStillSteps, ++still);
    if (lastPhase === "gameOver" && o.phase === "playing") restarts++;
    if (o.lives < lastLives) livesLost++;
    if (o.phase === "playing") forms.add(o.shapeIndex);
    if (o.phase !== lastPhase) phases.push(o.phase);
    lastDistance = o.distance;
    lastPhase = o.phase;
    lastLives = o.lives;
  }
  return { sim, maxStillSteps, restarts, livesLost, forms, phases };
}

describe("shape shift sprint ?autoplay=1", () => {
  it("leaves the title by itself and plays well for 90 s: distance, score, no life lost, never still for 5 s", () => {
    for (const seed of [20261101, 7, 42]) {
      const run = autoplay(seed, 90);
      expect(run.phases[0], `seed ${seed}`).toBe("playing");
      expect(run.sim.o.phase).toBe("playing");
      expect(run.sim.o.distance).toBeGreaterThan(1000);
      expect(run.sim.o.score).toBeGreaterThan(5000);
      expect(run.sim.o.matches).toBeGreaterThan(100);
      expect(run.livesLost, `seed ${seed} clears the narrowed openings`).toBe(0);
      expect(run.maxStillSteps).toBeLessThan(Math.round(5 / DT));
    }
  });

  it("grabs morph crystals now and then, so the mascot shows more than one form", () => {
    let morphs = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const run = autoplay(seed, 60);
      morphs += run.sim.o.morphs;
      expect(run.forms.size, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(run.livesLost).toBe(0);
    }
    // Without the detour the same seeds morph only when a crystal happens to sit on the pilot's path.
    let pathOnly = 0;
    for (const seed of [1, 2, 3, 4, 5]) pathOnly += autoplay(seed, 60, new Autopilot({ ...AUTOPLAY_PILOT, collectMorphs: false })).sim.o.morphs;
    expect(morphs).toBeGreaterThan(pathOnly);
  });

  it("after a game over the results hold about 3 s, then the next run starts, looping forever", () => {
    // Force game overs with scripted mistakes on every early row (the death-path pilot) plus the autoplay loop.
    const pilot = new Autopilot({ ...AUTOPLAY_PILOT, mistakeRows: Array.from({ length: 400 }, (_, i) => i) });
    const run = autoplay(31, 40, pilot);
    expect(run.restarts).toBeGreaterThanOrEqual(2);
    expect(run.maxStillSteps).toBeLessThan(Math.round(5 / DT));
    expect(run.maxStillSteps).toBeGreaterThanOrEqual(AUTOPLAY_PILOT.restartAfterSteps! - 2);

    // One forced game over, then the restart: fresh lives, distance and score from zero.
    const sim = new ShapeShiftSim(9);
    const loop = new Autopilot(AUTOPLAY_PILOT);
    let i = 0;
    for (; i < 240; i++) { sim.advance(loop.next(sim, i)); loop.observe(sim); }
    sim.o.lives = 1;
    sim.o.shapeIndex = (sim.rows.find((r) => !r.resolved)!.holes.find((h) => Math.abs(h.laneX - sim.o.laneOffset) < 0.5)!.shapeIndex + 1) % 3;
    sim.o.wildcardTimer = 0;
    sim.o.shieldActive = false;
    // Hold the runner on its lane (now the wrong shape) until the row resolves.
    while (sim.o.phase === "playing" && i < 2000) { sim.advance({ start: false, down: false, up: false, dx: 0, tap: false }); i++; }
    expect(sim.o.phase).toBe("bursting");
    let overSteps = 0;
    for (let n = 0; n < 600 && sim.o.phase !== "playing"; n++, i++) {
      sim.advance(loop.next(sim, i));
      loop.observe(sim);
      if (sim.o.phase === "gameOver") overSteps++;
    }
    expect(sim.o.phase).toBe("playing");
    expect(overSteps / (1 / DT)).toBeGreaterThan(2.5);
    expect(overSteps / (1 / DT)).toBeLessThan(3.5);
    expect(sim.o.lives).toBe(CONFIG.MAX_LIVES);
    expect(sim.o.score).toBe(0);
    for (let n = 0; n < 300; n++, i++) { sim.advance(loop.next(sim, i)); loop.observe(sim); }
    expect(sim.o.distance).toBeGreaterThan(0);
    expect(sim.o.score).toBeGreaterThan(0);
  });

  it("is deterministic and leaves the default pilot's normal-play contract alone", () => {
    const a = autoplay(5, 20).sim;
    const b = autoplay(5, 20).sim;
    expect(a.o).toEqual(b.o);
    expect(a.rng.count).toBe(b.rng.count);
    // Without the autoplay loop the pilot does not restart a finished run (death-path tests rely on this).
    expect(new Autopilot().params.restartAfterSteps).toBeUndefined();
  });
});
