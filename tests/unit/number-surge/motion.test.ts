import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { Autopilot } from "../../../apps/showcase-number-surge/src/autopilot";
import { IDLE, NumberSurgeSim } from "../../../apps/showcase-number-surge/src/sim";
import { ChaseCamera, SNAP_DISTANCE, blendShown, createNumberSurgePresenter, shownOf } from "../../../apps/showcase-number-surge/src/presentation";

const running = (seed = 3): { sim: NumberSurgeSim; cam: ChaseCamera } => {
  const sim = new NumberSurgeSim(seed);
  const cam = new ChaseCamera();
  for (let i = 0; i < 30; i += 1) sim.advance(IDLE);
  sim.advance({ ...IDLE, start: true });
  return { sim, cam };
};

describe("number-surge presentation", () => {
  it("steps the scrolling world back by the unelapsed part of the last step", () => {
    const { sim, cam } = running();
    const a = shownOf(sim, cam.cur);
    sim.advance(IDLE);
    cam.step(sim.o, () => 0.5);
    const b = shownOf(sim, cam.cur);
    const moved = b.distance - a.distance;
    expect(moved).toBeGreaterThan(0);
    const mid = blendShown(a, b, 0.5);
    expect(mid.back).toBeCloseTo(moved / 2, 12);
    expect(mid.laneOffset).toBeCloseTo((a.laneOffset + b.laneOffset) / 2, 12);
    expect(blendShown(a, b, 1).back).toBe(0);
  });

  it("snaps a restart or teleport and never mutates the snapshots", () => {
    const { sim, cam } = running();
    const a = shownOf(sim, cam.cur);
    const frozen = JSON.stringify(a);
    expect(blendShown(a, { ...a, distance: 0 }, 0.5).distance).toBe(0);
    expect(blendShown(a, { ...a, distance: a.distance + SNAP_DISTANCE + 1 }, 0.5).back).toBe(0);
    blendShown(a, { ...a, distance: a.distance + 0.2 }, 0.5);
    expect(JSON.stringify(a)).toBe(frozen);
  });

  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    const { sim, cam } = running();
    const pilot = new Autopilot();
    let steps = 0;
    const advance = (): void => {
      sim.advance(pilot.next(sim, steps++));
      cam.step(sim.o, () => 0.5);
    };
    for (let i = 0; i < 120; i += 1) advance();
    const presenter = createNumberSurgePresenter(() => sim, () => cam.cur);
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      seconds: 6,
      warmupSeconds: 1,
      step: advance,
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        if (!interpolate) return [sim.o.distance, cam.cur.x, cam.cur.z];
        const v = presenter.present({ alpha });
        return [v.distance - v.back, v.cam.x, v.cam.z];
      }
    });
  };

  it("draw-the-latest-step stands still on about half the frames at 120 and 144 Hz", () => {
    expect(gate(120, false).stillFraction).toBeGreaterThan(0.4);
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.4);
  });

  it("the presented road and camera advance on every frame at 60, 120 and 144 Hz", () => {
    for (const hz of [60, 120, 144]) {
      const report = gate(hz, true);
      expect(report.stillFrames).toBe(0);
      expect(report.cv).toBeLessThan(0.35);
    }
    expect(gate(60, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });
});