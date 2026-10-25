import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { VIRTUAL_STEP_MS, createState, stepFrame, type WindState } from "../../../examples/where-the-wind-wanders-port/sim";
import { SNAP_DISTANCE, blendShown, createWindPresenter, shownOf, viewOf } from "../../../examples/where-the-wind-wanders-port/presentation";

const shown = (x: number, z = 0) => ({ x, z, stride: 0, hopHeight: 0 });

describe("wind presentation", () => {
  it("blends position and stride and snaps a restart", () => {
    expect(blendShown(shown(0), { ...shown(0.1), stride: 0.4 }, 0.5).stride).toBeCloseTo(0.2, 12);
    expect(blendShown(shown(0), shown(SNAP_DISTANCE + 1), 0.25).x).toBe(SNAP_DISTANCE + 1);
  });

  it("viewOf replaces only the presented fields and leaves the state untouched", () => {
    const state = createState();
    const before = JSON.stringify(state);
    const view = viewOf(state, { ...shownOf(state), x: 9, hopHeight: 0.5 });
    expect(view.pos.x).toBe(9);
    expect(view.hop.height).toBe(0.5);
    expect(view.hop.phase).toBe(state.hop.phase);
    expect(view.found).toBe(state.found);
    expect(JSON.stringify(state)).toBe(before);
  });

  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    let state: WindState = createState();
    const presenter = createWindPresenter(() => state);
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      stepSeconds: VIRTUAL_STEP_MS / 1000,
      seconds: 6,
      warmupSeconds: 1,
      step: () => {
        stepFrame(state, { keys: "D", act: null }, VIRTUAL_STEP_MS);
      },
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const p = interpolate ? presenter.present({ alpha }) : shownOf(state);
        return [p.x, p.z, p.stride];
      }
    });
  };

  it("the old draw-the-latest-step path stands still on about half the frames at 120 and 144 Hz", () => {
    expect(gate(120, false).stillFraction).toBeGreaterThan(0.4);
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.4);
  });

  it("the presented pose advances on every frame at 60, 120 and 144 Hz and is as even as the native step", () => {
    const native = gate(60, true);
    for (const hz of [60, 120, 144]) {
      const report = gate(hz, true);
      expect(report.stillFrames).toBe(0);
      expect(Math.abs(report.cv - native.cv)).toBeLessThan(0.02);
    }
    expect(gate(60, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });
});
