/**
 * Duneglide soft play boundary (owner QA 2026-11-19): flying ~120 m off a chapter route showed bare flat sand and floating
 * backdrop ribbons. boundary.ts eases a crosswind in between BOUNDARY_SOFT and BOUNDARY_HARD metres from the route, so a
 * player holding hard left / right (or straight out) is turned back before the empty desert shows, without a wall snap,
 * and the on-route sim (autoplay, replays) is unchanged.
 */
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../../../examples/silt-and-signal-port/chapters-data";
import { BOUNDARY_HARD, BOUNDARY_SOFT, routeLeash } from "../../../examples/silt-and-signal-port/boundary";
import { IDLE, STEP, createSim, stepSim, type Input, type Sim } from "../../../examples/silt-and-signal-port/sim";
import { autoplayPilot, createAutoplayWatchdog } from "../../../examples/silt-and-signal-port/autopilot";

const FLY: Input = { ...IDLE, throttle: 1, boost: true };

/** Turn off the route for `turnSteps`, then hold `hold` for `seconds`; returns the farthest distance and the biggest per-step move. */
function flyOut(chapter: number, steer: number, turnSteps: number, hold: Input, seconds: number, start?: Parameters<typeof createSim>[3]) {
  const sim: Sim = createSim(chapter, 0, undefined, start);
  const leash = routeLeash(chapter);
  let far = 0, maxStep = 0, px = sim.state.x, pz = sim.state.z;
  for (let i = 0; i < seconds / STEP; i++) {
    stepSim(sim, i < turnSteps ? { ...FLY, steer } : hold, STEP);
    if (sim.state.scene) sim.state.scene = null;
    far = Math.max(far, leash(sim.state.x, sim.state.z).d);
    maxStep = Math.max(maxStep, Math.hypot(sim.state.x - px, sim.state.z - pz));
    px = sim.state.x; pz = sim.state.z;
  }
  return { far, maxStep, sim, leash };
}

describe("Duneglide soft play boundary", () => {
  for (let chapter = 0; chapter < CHAPTERS.length; chapter++) {
    it(`chapter ${chapter}: holding hard left or right with turbo for 40 s never takes the rider past ${BOUNDARY_HARD} m from the route, with no snap`, () => {
      for (const steer of [-1, 1]) {
        // a short turn off the route, then the steer held the whole time (the rider circles; the crosswind wins at the edge)
        const held = flyOut(chapter, steer, 40 / STEP, { ...FLY, steer }, 40);
        // a short turn, then straight on: the rider heads out of the dressed band and is turned back
        const straight = flyOut(chapter, steer, 90, FLY, 40);
        for (const run of [held, straight]) {
          expect(run.far).toBeLessThanOrEqual(BOUNDARY_HARD + 1e-6);
          // never a teleport: one step never moves further than turbo top speed allows
          expect(run.maxStep).toBeLessThanOrEqual(76 * STEP * 1.02);
        }
      }
    });
  }

  it("a rider aimed straight out of the dressed band is turned back toward the route within a few seconds", () => {
    for (const chapter of [0, 1, 4]) {
      const ch = CHAPTERS[chapter]!;
      const p = ch.objectives[1]!.points[0]!;
      // west of the route at the soft radius, facing further west (yaw +90 degrees heads -x)
      const sim = createSim(chapter, 1, undefined, { x: p.x - BOUNDARY_SOFT - 4, y: p.y + 20, z: p.z, yaw: Math.PI / 2 });
      const leash = routeLeash(chapter);
      for (let i = 0; i < 6 / STEP; i++) stepSim(sim, { ...FLY, boost: false }, STEP);
      const { ux, uz, d } = leash(sim.state.x, sim.state.z);
      const heading = [-Math.sin(sim.state.yaw), -Math.cos(sim.state.yaw)] as const;
      expect(d).toBeLessThanOrEqual(BOUNDARY_HARD);
      // heading no longer points away from the route
      expect(heading[0] * ux + heading[1] * uz).toBeLessThan(0.2);
    }
  });

  it("is invisible on the route: ?autoplay=1 flies every chapter exactly as it did without the boundary", () => {
    for (let chapter = 0; chapter < CHAPTERS.length; chapter++) {
      const trace = (withLeash: boolean): string => {
        const world = withLeash ? undefined : { leash: undefined };
        let sim = createSim(chapter, 0, world);
        const watchdog = createAutoplayWatchdog();
        const rows: string[] = [];
        for (let step = 0; step < 150 / STEP; step++) {
          if (sim.state.scene) { if (sim.state.pendingChapter !== null) break; sim.state.scene = null; }
          if (sim.state.completed) break;
          if (watchdog.update(sim, STEP)) sim = createSim(sim.state.chapter, sim.state.objective, world);
          stepSim(sim, autoplayPilot(sim), STEP);
          if (step % 30 === 0) rows.push(`${sim.state.x},${sim.state.z},${sim.state.objective},${sim.state.point}`);
        }
        rows.push(`${sim.state.completed}|${sim.state.pendingChapter}|${sim.steps}`);
        return rows.join(";");
      };
      expect(trace(true), `chapter ${chapter}`).toBe(trace(false));
    }
  });
});
