import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { IDLE, BeatHopperSim, type Input } from "../../../apps/showcase-beat-hopper/src/sim";
import { Autopilot } from "../../../apps/showcase-beat-hopper/src/autopilot";
import {
  ChaseCamera, SNAP_DISTANCE, blendShown, cardPose, createBeatPresenter, freshJudgement, poseScale, shownOf
} from "../../../apps/showcase-beat-hopper/src/presentation";

const START: Input = { ...IDLE, start: true };

const running = (seed = 42): BeatHopperSim => {
  const sim = new BeatHopperSim(seed);
  sim.advance(START);
  return sim;
};

describe("beat-hopper presentation and motion gate", () => {
  it("interpolates clock, vertical pose, and camera between consecutive steps", () => {
    const sim = running();
    const rig = new ChaseCamera(sim);
    const a = shownOf(sim, rig.cur);
    sim.advance(IDLE);
    rig.step(sim);
    const b = shownOf(sim, rig.cur);
    expect(b.t).toBeGreaterThan(a.t);
    const mid = blendShown(a, b, 0.5);
    expect(mid.t).toBeCloseTo((a.t + b.t) / 2, 12);
    expect(mid.camera.y).toBeCloseTo((a.camera.y + b.camera.y) / 2, 12);
    expect(blendShown(a, b, 1).t).toBeCloseTo(b.t, 12);
  });

  it("snaps on restart or large distance jumps and never smears", () => {
    const sim = running();
    for (let i = 0; i < 30; i++) sim.advance(IDLE);
    const rig = new ChaseCamera(sim);
    const a = shownOf(sim, rig.cur);
    const restarted = { ...a, t: 0, dist: 0 };
    expect(blendShown(a, restarted, 0.5).dist).toBe(0);
    expect(blendShown(a, restarted, 0.5).t).toBe(0);
    const jumped = { ...a, dist: a.dist + SNAP_DISTANCE + 1, t: a.t + 1 };
    expect(blendShown(a, jumped, 0.5).t).toBe(jumped.t);
  });

  it("poseScale, cardPose, and freshJudgement behave deterministically", () => {
    expect(poseScale("duck", 0)).toEqual({ sx: 1.2, sy: 0.6, sz: 1.2 });
    expect(poseScale("grounded", 0)).toEqual({ sx: 1, sy: 1, sz: 1 });
    expect(poseScale("air", 5).sy).toBeGreaterThan(1);
    expect(cardPose("splash", 0)).not.toBeNull();
    expect(cardPose("gameOver", 1)).not.toBeNull();
    expect(cardPose("playing", 1)).toBeNull();
    const sim = running();
    expect(freshJudgement(sim, -1)).toBeNull();
  });

  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    const sim = running();
    const rig = new ChaseCamera(sim);
    const pilot = new Autopilot();
    let stepIndex = 1;
    const step = (): void => {
      const input = pilot.next(sim, stepIndex++);
      sim.advance(input);
      rig.step(sim);
      pilot.observe(sim);
    };
    for (let i = 0; i < 60; i++) step();
    const presenter = createBeatPresenter(() => shownOf(sim, rig.cur));
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      seconds: 6,
      warmupSeconds: 1,
      step,
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const v = interpolate ? presenter.present({ alpha }) : shownOf(sim, rig.cur);
        return [v.t * sim.o.speed, v.t, v.camera.y];
      }
    });
  };

  it("the uninterpolated step snapshot stands still on about half the frames at 120 and 144 Hz", () => {
    expect(gate(120, false).stillFraction).toBeGreaterThan(0.4);
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.4);
  });

  it("the interpolated presenter advances smoothly on every frame at 60, 120, and 144 Hz", () => {
    for (const hz of [60, 120, 144]) {
      const report = gate(hz, true);
      expect(report.stillFrames).toBe(0);
      expect(report.cv).toBeLessThan(0.35);
    }
    expect(gate(60, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });
});
