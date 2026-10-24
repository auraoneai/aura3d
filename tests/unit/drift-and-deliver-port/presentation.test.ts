import { describe, expect, it } from "vitest";
import { createFixedStepLoop } from "../../../packages/engine/src/qa/fixedStepLoop";
import { createRenderInterpolator } from "../../../packages/game/src/motion/smoothing";
import { createCar, stepCar, NO_KEYS } from "../../../examples/drift-and-deliver-port/sim";
import { blendPresented, SNAP_DISTANCE, type Presented } from "../../../examples/drift-and-deliver-port/presentation";

const pres = (x: number, z: number, heading = 0, traffic: number[] = [0, 0, 0]): Presented => ({
  car: { x, z, heading, lean: 0, steer: 0, speed: 10 },
  traffic: Float64Array.from(traffic)
});

describe("drift presentation blend", () => {
  it("returns the endpoints at t=0 and t=1 and the midpoint at 0.5", () => {
    const a = pres(0, 0, 0, [0, 0, 0]);
    const b = pres(2, 4, 0.2, [4, 2, 0.4]);
    expect(blendPresented(a, b, 0).car.x).toBe(0);
    expect(blendPresented(a, b, 1).car.z).toBe(4);
    const m = blendPresented(a, b, 0.5);
    expect(m.car.x).toBeCloseTo(1, 12);
    expect(m.car.heading).toBeCloseTo(0.1, 12);
    expect(Array.from(m.traffic)).toEqual([2, 1, 0.2]);
  });

  it("turns through the short way across the angle wrap", () => {
    const m = blendPresented(pres(0, 0, Math.PI - 0.1), pres(0, 0, -Math.PI + 0.1), 0.5);
    expect(Math.abs(Math.abs(m.car.heading) - Math.PI)).toBeLessThan(1e-9);
  });

  it("snaps a teleport or a wrapped traffic car instead of smearing it", () => {
    const far = SNAP_DISTANCE + 1;
    const m = blendPresented(pres(0, 0, 0, [0, 0, 0]), pres(far, 0, 0, [far, 0, 0]), 0.25);
    expect(m.car.x).toBe(far);
    expect(m.traffic[0]).toBe(far);
  });
});

describe("drift at high-refresh displays", () => {
  function shownPath(hz: number, interpolate: boolean): Array<[number, number]> {
    const car = createCar();
    const snap = (): Presented => pres(car.x, car.z, car.heading);
    const interp = createRenderInterpolator<Presented>(blendPresented);
    interp.reset(snap());
    const STEP = 1 / 60;
    const loop = createFixedStepLoop({
      stepSeconds: STEP, maxFrameSeconds: 0.1, minFrameSeconds: 0, maxCatchUpSteps: 8,
      step() { stepCar(car, STEP, { ...NO_KEYS, w: true }, []); interp.push(snap()); }
    });
    const out: Array<[number, number]> = [];
    for (let now = 0; now < 8000; now += 1000 / hz) {
      loop.tick(now);
      const shown = interpolate ? interp.sample(loop.accumulator / STEP) ?? snap() : snap();
      if (now > 2000) out.push([shown.car.x, shown.car.z]);
    }
    return out;
  }
  const deltas = (p: Array<[number, number]>): number[] => p.slice(1).map((v, i) => Math.hypot(v[0] - p[i]![0], v[1] - p[i]![1]));

  it("draws the car on most 120 Hz frames only when interpolating", () => {
    const still = (d: number[]): number => d.filter((v) => v < 1e-9).length / d.length;
    expect(still(deltas(shownPath(120, false)))).toBeGreaterThan(0.4);
    expect(still(deltas(shownPath(120, true)))).toBe(0);
  });

  it("keeps the per-frame travel steady at 60, 120 and 144 Hz", () => {
    for (const hz of [60, 120, 144]) {
      const d = deltas(shownPath(hz, true));
      const mean = d.reduce((a, b) => a + b, 0) / d.length;
      const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length);
      expect(sd / mean).toBeLessThan(0.1);
    }
  });
});
