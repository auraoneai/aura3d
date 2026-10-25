import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { DEFAULT_PARAMS, autopilot } from "../../../examples/roadster-hours-port/autopilot";
import { SIM_STEP, createRun, defaultCareer, stepRun, type Career, type Run } from "../../../examples/roadster-hours-port/sim";
import { SNAP_DISTANCE, blendShown, createRoadsterPresenter, shownOf, viewOf } from "../../../examples/roadster-hours-port/presentation";

const career = (): Career => ({ ...defaultCareer(), unlocked: 2 });

const racing = (): { run: Run; step: () => void } => {
  const c = career();
  const run = createRun(0, c);
  const step = (): void => stepRun(run, autopilot(run, DEFAULT_PARAMS), SIM_STEP, c);
  while (run.phase === "countdown") step();
  for (let i = 0; i < 360; i += 1) step();
  return { run, step };
};

const shown = (s: number) => ({ s, l: 0, h: 0, v: 40, roll: 0, spin: 0, flip: 0, theta: 0, traffic: [{ s: s + 50, l: 1 }] });

describe("roadster hours presentation", () => {
  it("blends the car and traffic and snaps a respawn", () => {
    const m = blendShown(shown(100), shown(100.5), 0.5);
    expect(m.s).toBeCloseTo(100.25, 12);
    expect(m.traffic[0]!.s).toBeCloseTo(150.25, 12);
    expect(blendShown(shown(100), shown(100 + SNAP_DISTANCE + 5), 0.5).s).toBe(100 + SNAP_DISTANCE + 5);
  });

  it("viewOf replaces only the presented fields and leaves the run untouched", () => {
    const { run } = racing();
    const before = JSON.stringify({ s: run.s, l: run.l, score: run.score });
    const view = viewOf(run, { ...shownOf(run), s: run.s + 0.1 });
    expect(view.s).toBeCloseTo(run.s + 0.1, 12);
    expect(view.score).toBe(run.score);
    expect(view.traffic).toHaveLength(run.traffic.length);
    expect(JSON.stringify({ s: run.s, l: run.l, score: run.score })).toBe(before);
  });

  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    const { run, step } = racing();
    const presenter = createRoadsterPresenter(() => run);
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      stepSeconds: SIM_STEP,
      seconds: 6,
      warmupSeconds: 1,
      step,
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const p = interpolate ? presenter.present({ alpha }) : shownOf(run);
        return [p.s, p.l];
      }
    });
  };

  it("the old draw-the-latest-step path stalls at 144 Hz and is steady at 60 and 120 Hz", () => {
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.1);
    expect(gate(120, false).stillFraction).toBeLessThan(0.05);
  });

  it("the presented car advances on every frame at 60, 120 and 144 Hz and is as even as the native step", () => {
    const native = gate(120, true);
    for (const hz of [60, 120, 144]) {
      const report = gate(hz, true);
      expect(report.stillFrames).toBe(0);
      expect(Math.abs(report.cv - native.cv)).toBeLessThan(0.05);
    }
    expect(gate(144, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });
});
