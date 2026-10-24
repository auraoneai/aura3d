import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { createSim, stepSim, type Input, type Sim } from "../../../examples/silt-and-signal-port/sim";
import { autopilot } from "../../../examples/silt-and-signal-port/autopilot";
import { SNAP_DISTANCE, blendShown, createSiltPresenter, shownOf, viewOf } from "../../../examples/silt-and-signal-port/presentation";

const shown = (x: number, yaw = 0) => ({ x, y: 10, z: 0, yaw, bank: 0, vertical: 0, speed: 20 });

describe("silt presentation", () => {
  it("blends position and takes yaw the short way", () => {
    const m = blendShown(shown(0, Math.PI - 0.1), shown(2, -Math.PI + 0.1), 0.5);
    expect(m.x).toBeCloseTo(1, 12);
    expect(Math.abs(Math.abs(m.yaw) - Math.PI)).toBeLessThan(1e-9);
  });

  it("snaps a restart or chapter jump instead of smearing it", () => {
    expect(blendShown(shown(0), shown(SNAP_DISTANCE + 1), 0.25).x).toBe(SNAP_DISTANCE + 1);
  });

  it("viewOf replaces only the presented fields and leaves the sim untouched", () => {
    const sim = createSim(0, 0);
    const before = JSON.stringify(sim.state);
    const view = viewOf(sim, { ...shownOf(sim), x: 123, speed: 7 });
    expect(view.state.x).toBe(123);
    expect(view.flight.speed).toBe(7);
    expect(view.state.objective).toBe(sim.state.objective);
    expect(JSON.stringify(sim.state)).toBe(before);
  });

  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    let sim: Sim = createSim(0, 0);
    const presenter = createSiltPresenter(() => sim);
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      seconds: 8,
      warmupSeconds: 3,
      step: () => {
        const input: Input = { ...autopilot(sim), throttle: 1 };
        stepSim(sim, input);
      },
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const v = interpolate ? viewOf(sim, presenter.present({ alpha })) : sim;
        return [v.state.x, v.state.y, v.state.z];
      }
    });
  };

  it("the old draw-the-latest-step path stands still on about half the frames at 120 and 144 Hz", () => {
    expect(gate(120, false).stillFraction).toBeGreaterThan(0.4);
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.4);
  });

  it("the presented pose advances on every frame at 60, 120 and 144 Hz and is as even as the native 60 Hz step", () => {
    const native = gate(60, true);
    for (const hz of [60, 120, 144]) {
      const report = gate(hz, true);
      expect(report.stillFrames).toBe(0);
      expect(Math.abs(report.cv - native.cv)).toBeLessThan(0.01);
    }
    expect(gate(60, true, 0.0015).stillFraction).toBeLessThan(0.05);
    expect(gate(120, false).cv).toBeGreaterThan(native.cv * 3);
  });

  it("presenting never changes the simulation: same steps, same final state", () => {
    const run = (withPresenter: boolean): string => {
      const sim = createSim(0, 0);
      const presenter = createSiltPresenter(() => sim);
      for (let i = 0; i < 600; i += 1) {
        stepSim(sim, autopilot(sim));
        if (withPresenter) { presenter.afterStep(); presenter.present({ alpha: (i % 7) / 7 }); }
      }
      return JSON.stringify([sim.state, sim.flight]);
    };
    expect(run(true)).toBe(run(false));
  });
});
