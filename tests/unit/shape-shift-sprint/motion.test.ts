import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { IDLE, ShapeShiftSim, type Input } from "../../../apps/showcase-shape-shift-sprint/src/sim";
import { Autopilot } from "../../../apps/showcase-shape-shift-sprint/src/autopilot";
import {
  ChaseCamera,
  SNAP_DISTANCE,
  blendShown,
  createShapePresenter,
  shownOf
} from "../../../apps/showcase-shape-shift-sprint/src/presentation";

const START: Input = { ...IDLE, start: true };

const running = (seed = 3): { sim: ShapeShiftSim; rig: ChaseCamera } => {
  const sim = new ShapeShiftSim(seed);
  const rig = new ChaseCamera();
  for (let i = 0; i < 30; i++) {
    sim.advance(IDLE);
    rig.step(sim);
  }
  sim.advance(START);
  rig.step(sim);
  return { sim, rig };
};

const piloted = (sim: ShapeShiftSim, rig: ChaseCamera): (() => void) => {
  const pilot = new Autopilot();
  let steps = 1;
  return () => {
    sim.advance(pilot.next(sim, steps++));
    rig.step(sim);
    pilot.observe(sim);
  };
};

describe("shape shift sprint presentation", () => {
  it("steps the scrolling world back by the unelapsed fraction of the last step", () => {
    const { sim, rig } = running();
    const a = shownOf(sim, rig.cur);
    sim.advance(IDLE);
    rig.step(sim);
    const b = shownOf(sim, rig.cur);
    const moved = b.distance - a.distance;
    expect(moved).toBeGreaterThan(0);
    const mid = blendShown(a, b, 0.5);
    expect(mid.back).toBeCloseTo(moved / 2, 12);
    expect(mid.distance - mid.back).toBeCloseTo(a.distance + moved / 2, 12);
    expect(blendShown(a, b, 1).back).toBe(0);
  });

  it("snaps a restart and never smears a jump", () => {
    const { sim, rig } = running();
    const a = shownOf(sim, rig.cur);
    expect(blendShown(a, { ...a, distance: 0 }, 0.5).distance).toBe(0);
    expect(blendShown(a, { ...a, distance: 0 }, 0.5).back).toBe(0);
    expect(blendShown(a, { ...a, distance: a.distance + SNAP_DISTANCE + 1 }, 0.5).back).toBe(0);
  });

  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    const { sim, rig } = running();
    const advance = piloted(sim, rig);
    for (let i = 0; i < 120; i++) advance();
    const presenter = createShapePresenter(() => shownOf(sim, rig.cur));
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      seconds: 6,
      warmupSeconds: 1,
      step: advance,
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const v = interpolate ? presenter.present({ alpha }) : shownOf(sim, rig.cur);
        return [v.distance - v.back, v.elapsed, v.player.rotX];
      }
    });
  };

  it("the draw-the-latest-step path stands still on about half the frames at 120 and 144 Hz", () => {
    expect(gate(120, false).stillFraction).toBeGreaterThan(0.4);
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.4);
  });

  it("the presented scroll, player spin, and clock advance on every frame at 60, 120 and 144 Hz", () => {
    for (const hz of [60, 120, 144]) {
      const report = gate(hz, true);
      expect(report.stillFrames).toBe(0);
      expect(report.cv).toBeLessThan(0.35);
    }
    expect(gate(60, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });
});
