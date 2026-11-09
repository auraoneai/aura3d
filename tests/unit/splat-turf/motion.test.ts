import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { IDLE, SplatTurfSim, type Input } from "../../../apps/showcase-splat-turf/src/sim";
import { TurfAutopilot } from "../../../apps/showcase-splat-turf/src/autopilot";
import { SNAP_DISTANCE, blendShown, createTurfPresenter, shownOf } from "../../../apps/showcase-splat-turf/src/presentation";
import { ballSquash } from "../../../apps/showcase-splat-turf/src/art/ball";

const START: Input = { ...IDLE, start: true };

const running = (seed = 3): SplatTurfSim => {
  const sim = new SplatTurfSim(seed);
  for (let i = 0; i < 30; i++) sim.advance(IDLE);
  sim.advance(START);
  return sim;
};

const piloted = (sim: SplatTurfSim): (() => void) => {
  const pilot = new TurfAutopilot();
  let steps = 2; // already started and dragging
  return () => { sim.advance(pilot.next(sim, steps++)); };
};

describe("splat turf presentation", () => {
  it("steps the scrolling world back by the unelapsed part of the last step", () => {
    const sim = running();
    const a = shownOf(sim);
    sim.advance(IDLE);
    const b = shownOf(sim);
    const moved = b.distance - a.distance;
    expect(moved).toBeGreaterThan(0);
    const mid = blendShown(a, b, 0.5);
    expect(mid.back).toBeCloseTo(moved / 2, 12);
    expect(mid.distance - mid.back).toBeCloseTo(a.distance + moved / 2, 12);
    expect(blendShown(a, b, 1).back).toBe(0);
  });

  it("snaps a restart and never smears a jump", () => {
    const sim = running();
    const a = shownOf(sim);
    expect(blendShown(a, { ...a, distance: 0 }, 0.5).distance).toBe(0);
    expect(blendShown(a, { ...a, distance: 0 }, 0.5).back).toBe(0);
    expect(blendShown(a, { ...a, distance: a.distance + SNAP_DISTANCE + 1 }, 0.5).back).toBe(0);
  });

  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    const sim = running();
    const advance = piloted(sim);
    for (let i = 0; i < 120; i++) advance();
    const presenter = createTurfPresenter(() => sim);
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      seconds: 6,
      warmupSeconds: 1,
      step: advance,
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const v = interpolate ? presenter.present({ alpha }) : shownOf(sim);
        // The scrolling road (distance minus the unelapsed back-step) and the clock are the always-moving
        // channels; laneOffset only moves while steering, so it is not a stillness signal.
        return [v.distance - v.back, v.time];
      }
    });
  };

  it("the draw-the-latest-step path stands still on about half the frames at 120 and 144 Hz", () => {
    expect(gate(120, false).stillFraction).toBeGreaterThan(0.4);
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.4);
  });

  it("the presented scroll, ball and clock advance on every frame at 60, 120 and 144 Hz", () => {
    for (const hz of [60, 120, 144]) {
      const report = gate(hz, true);
      expect(report.stillFrames).toBe(0);
      expect(report.cv).toBeLessThan(0.35);
    }
    expect(gate(60, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });
});
describe("splat turf ball squash (presentation only)", () => {
  it("is identity under reduced motion and at rest, volume-preserving and bounded while steering", () => {
    expect(ballSquash(9, 30, true)).toEqual([1, 1, 1]);
    expect(ballSquash(0, 16, false)).toEqual([1, 1, 1]);
    for (const v of [-20, -4, 3, 9, 40]) {
      const [sx, sy, sz] = ballSquash(v, 36, false);
      expect(sx * sy * sz).toBeCloseTo(1, 9);
      expect(sx).toBeGreaterThan(1);
      expect(sx).toBeLessThanOrEqual(1.12 + 1e-9);
      expect(sy).toBeLessThan(1);
    }
  });
});
