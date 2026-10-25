import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { SIM_STEP, applyAction, createState, qaAutopilotActions, startRun, stepSim, type SimState } from "../../../examples/ninja-runner-port/sim";
import { SNAP_DISTANCE, blendShown, createNinjaPresenter, shownOf, viewOf } from "../../../examples/ninja-runner-port/presentation";

const shown = (s: number) => ({ s, x: 0, y: 0, speed: 20, movers: [], projectiles: [], shurikens: [] });

describe("ninja presentation", () => {
  it("blends the runner and snaps a restart", () => {
    expect(blendShown(shown(0), shown(0.2), 0.5).s).toBeCloseTo(0.1, 12);
    expect(blendShown(shown(500), shown(0), 0.25).s).toBe(0);
    expect(SNAP_DISTANCE).toBeGreaterThan(1);
  });

  it("blends lists by id: matches interpolate, a new item appears where it is", () => {
    const a = { ...shown(0), projectiles: [{ id: 1, s: 0, x: 0, y: 1 }], movers: [{ id: 7, s: 10, lane: 0, y: 0 }] };
    const b = { ...shown(0.2), projectiles: [{ id: 1, s: 2, x: 1, y: 1 }, { id: 2, s: 9, x: 0, y: 1 }], movers: [{ id: 7, s: 9.8, lane: 1, y: 0 }] };
    const m = blendShown(a, b, 0.5);
    expect(m.projectiles).toEqual([{ id: 1, s: 1, x: 0.5, y: 1 }, { id: 2, s: 9, x: 0, y: 1 }]);
    expect(m.movers[0]).toEqual({ id: 7, s: 9.9, lane: 0.5, y: 0 });
  });

  it("viewOf replaces only the presented fields and leaves the sim untouched", () => {
    const z = createState();
    startRun(z);
    for (let i = 0; i < 240; i += 1) stepSim(z, SIM_STEP);
    const before = JSON.stringify(z);
    const view = viewOf(z, { ...shownOf(z), s: z.s + 0.05, x: 0.3 });
    expect(view.s).toBeCloseTo(z.s + 0.05, 12);
    expect(view.x).toBe(0.3);
    expect(view.health).toBe(z.health);
    expect(view.entities).toHaveLength(z.entities.length);
    expect(JSON.stringify(z)).toBe(before);
  });

  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    const z: SimState = createState();
    startRun(z);
    const presenter = createNinjaPresenter(() => z);
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      stepSeconds: SIM_STEP,
      seconds: 6,
      warmupSeconds: 1,
      step: () => {
        for (const a of qaAutopilotActions(z)) applyAction(z, a);
        stepSim(z, SIM_STEP);
      },
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const p = interpolate ? presenter.present({ alpha }) : shownOf(z);
        return [p.s, p.x];
      }
    });
  };

  it("the old draw-the-latest-step path stalls at 144 Hz and is steady at 60 and 120 Hz", () => {
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.1);
    expect(gate(120, false).stillFraction).toBeLessThan(0.05);
  });

  it("the presented pose advances on every frame at 60, 120 and 144 Hz and is as even as the native step", () => {
    const native = gate(120, true);
    for (const hz of [60, 120, 144]) {
      const report = gate(hz, true);
      expect(report.stillFrames).toBe(0);
      expect(Math.abs(report.cv - native.cv)).toBeLessThan(0.05);
    }
    expect(gate(144, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });
});
