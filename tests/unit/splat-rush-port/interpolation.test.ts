import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { Autopilot } from "../../../examples/splat-rush-port/autopilot";
import { IDLE, SplatRushSim } from "../../../examples/splat-rush-port/sim";
import { SNAP_DISTANCE, blendShown, createSplatPresenter, shownOf, viewOf } from "../../../examples/splat-rush-port/presentation";

const START = { start: true, down: false, up: false, dx: 0 };
const DOWN = { start: false, down: true, up: false, dx: 0 };
const running = (seed = 3): SplatRushSim => {
  const sim = new SplatRushSim(seed);
  for (let i = 0; i < 30; i++) sim.advance(IDLE);
  sim.advance(START);
  sim.advance(DOWN);
  return sim;
};
const piloted = (sim: SplatRushSim): (() => void) => {
  const pilot = new Autopilot();
  let steps = 0;
  return () => {
    sim.advance(pilot.next(sim, steps++));
    pilot.observe(sim);
  };
};

describe("splat rush presentation", () => {
  it("steps the scrolling world back by the unelapsed part of the last step and keeps the curve attached", () => {
    const sim = running();
    const a = shownOf(sim);
    const z0 = sim.segments[0]!.z;
    sim.advance(DOWN);
    const b = shownOf(sim);
    const moved = b.distance - a.distance;
    expect(moved).toBeGreaterThan(0);
    const mid = blendShown(a, b, 0.5);
    expect(mid.back).toBeCloseTo(moved / 2, 12);
    const view = viewOf(sim, mid);
    expect(view.segments[0]!.z).toBeCloseTo(sim.segments[0]!.z - moved / 2, 12);
    // r = -distance + z stays the same, so the road curve does not slide against the road
    expect(-view.o.distance + view.segments[0]!.z).toBeCloseTo(-sim.o.distance + sim.segments[0]!.z, 9);
    expect(blendShown(a, b, 1).back).toBe(0);
    expect(z0).not.toBe(sim.segments[0]!.z);
  });

  it("snaps a restart and never changes the real sim", () => {
    const sim = running();
    const before = JSON.stringify(sim.o);
    const a = shownOf(sim);
    expect(blendShown(a, { ...a, distance: 0 }, 0.5).distance).toBe(0);
    expect(blendShown(a, { ...a, distance: a.distance + SNAP_DISTANCE + 1 }, 0.5).back).toBe(0);
    viewOf(sim, { ...a, back: 0.2 });
    expect(JSON.stringify(sim.o)).toBe(before);
  });

  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    const sim = running();
    const advance = piloted(sim);
    for (let i = 0; i < 120; i += 1) advance();
    const presenter = createSplatPresenter(() => sim);
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      seconds: 6,
      warmupSeconds: 1,
      step: advance,
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const v = interpolate ? viewOf(sim, presenter.present({ alpha })) : sim;
        return [v.o.distance, v.camera.x, v.camera.z];
      }
    });
  };

  it("the old draw-the-latest-step path stands still on about half the frames at 120 and 144 Hz", () => {
    expect(gate(120, false).stillFraction).toBeGreaterThan(0.4);
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.4);
  });

  it("the presented road, ball and camera advance on every frame at 60, 120 and 144 Hz", () => {
    for (const hz of [60, 120, 144]) {
      const report = gate(hz, true);
      expect(report.stillFrames).toBe(0);
      expect(report.cv).toBeLessThan(0.35);
    }
    expect(gate(60, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });
});
