import { describe, expect, it } from "vitest";
import { createFixedStepLoop } from "../../../packages/engine/src/qa/fixedStepLoop";
import { createFixedStepPresenter, createRecordBlend, runMotionGate } from "../../../packages/game/src/motion/index";

describe("createFixedStepLoop alpha", () => {
  it("reports progress through the current step and stays within 0..1", () => {
    let clock = 0;
    const loop = createFixedStepLoop({ step: () => undefined, now: () => clock, schedule: () => 0, cancel: () => undefined });
    expect(loop.alpha).toBe(0);
    clock = 1000 / 120;
    loop.tick(clock);
    expect(loop.steps).toBe(0);
    expect(loop.alpha).toBeCloseTo(0.5, 6);
    clock += 1000 / 120;
    loop.tick(clock);
    expect(loop.steps).toBe(1);
    expect(loop.alpha).toBeLessThan(1e-6 + 0.0001);
    loop.resetAccumulator();
    expect(loop.alpha).toBe(0);
  });
});

describe("createFixedStepPresenter", () => {
  const make = () => {
    const state = { x: 0 };
    const presenter = createFixedStepPresenter({
      snapshot: () => ({ x: state.x }),
      blend: (a, b, t) => ({ x: a.x + (b.x - a.x) * t })
    });
    const step = () => {
      state.x += 10;
      presenter.afterStep();
    };
    return { state, presenter, step };
  };

  it("blends between the last two steps while live and returns the latest otherwise", () => {
    const { presenter, step } = make();
    step();
    step();
    expect(presenter.present({ alpha: 0.5 }).x).toBeCloseTo(15, 9);
    expect(presenter.present({ alpha: 0 }).x).toBeCloseTo(10, 9);
    expect(presenter.present({ alpha: 0.5 }, false).x).toBe(20);
    expect(presenter.present({ alpha: 1 }).x).toBe(20);
  });

  it("reset removes the smear after a teleport", () => {
    const { state, presenter, step } = make();
    step();
    state.x = 500;
    presenter.reset();
    expect(presenter.present({ alpha: 0.3 }).x).toBe(500);
    step();
    expect(presenter.present({ alpha: 0.5 }).x).toBeCloseTo(505, 9);
  });
});

describe("createRecordBlend", () => {
  it("blends numbers, arrays and typed arrays, takes angles by the short arc and the latest discrete value", () => {
    const blend = createRecordBlend<{ x: number; yaw: number; list: number[]; typed: Float64Array; clip: string; nested: { v: number } }>({ angleKeys: ["yaw"] });
    const out = blend(
      { x: 0, yaw: Math.PI - 0.1, list: [0, 10], typed: Float64Array.from([2, 4]), clip: "walk", nested: { v: 0 } },
      { x: 10, yaw: -Math.PI + 0.1, list: [10, 20], typed: Float64Array.from([4, 8]), clip: "run", nested: { v: 4 } },
      0.5
    );
    expect(out.x).toBe(5);
    expect(Math.cos(out.yaw)).toBeCloseTo(-1, 9);
    expect(out.list).toEqual([5, 15]);
    expect(Array.from(out.typed)).toEqual([3, 6]);
    expect(out.clip).toBe("run");
    expect(out.nested.v).toBe(2);
  });

  it("shows the new state when a step moves further than the snap distance", () => {
    const blend = createRecordBlend<{ x: number; z: number }>({ snapDistance: 5, position: (v) => [v.x, v.z] });
    expect(blend({ x: 0, z: 0 }, { x: 100, z: 0 }, 0.25).x).toBe(100);
    expect(blend({ x: 0, z: 0 }, { x: 2, z: 0 }, 0.25).x).toBeCloseTo(0.5, 9);
  });
});

describe("runMotionGate", () => {
  const drive = (displayHz: number, interpolate: boolean, jitterSeconds = 0, clips = false) => {
    const sim = { x: 0, z: 0, clip: "run" };
    const presenter = createFixedStepPresenter({
      snapshot: () => ({ x: sim.x, z: sim.z }),
      blend: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
    });
    let toggle = 0;
    return runMotionGate({
      displayHz,
      jitterSeconds,
      step: () => {
        sim.x += 0.2;
        sim.z += 0.05;
        toggle += 1;
        if (clips) sim.clip = toggle % 2 ? "run" : "idle";
      },
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const p = interpolate ? presenter.present({ alpha }) : { x: sim.x, z: sim.z };
        return [p.x, p.z];
      },
      clip: () => sim.clip
    });
  };

  it("fails a game that draws the latest step on a 120 and 144 Hz display", () => {
    const at120 = drive(120, false);
    expect(at120.stillFraction).toBeGreaterThan(0.4);
    expect(at120.passed).toBe(false);
    expect(drive(144, false).stillFraction).toBeGreaterThan(0.4);
  });

  it("passes an interpolated game at 60, 120 and 144 Hz, with and without jitter", () => {
    for (const hz of [60, 120, 144]) {
      const report = drive(hz, true);
      expect(report.stillFrames).toBe(0);
      expect(report.passed).toBe(true);
    }
    expect(drive(60, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });

  it("flags animation clips that flap", () => {
    const report = drive(120, true, 0, true);
    expect(report.clipFlipsPer10s).toBeGreaterThan(4);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toContain("clip flips");
  });
});
