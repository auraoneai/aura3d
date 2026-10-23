import { describe, expect, it } from "vitest";
import { IDLE, STEP, createSim, stepSim } from "../../../examples/silt-and-signal-port/sim";

describe("frame-clock dt emulation (the original derives dt from rAF timestamps)", () => {
  it("without a clock the step is exactly the dt given", () => {
    const sim = createSim(0, 2);
    stepSim(sim, IDLE, STEP);
    expect(sim.time).toBe(STEP);
    expect(sim.clockMs).toBeUndefined();
  });

  it("with a clock dt is (t2 - t1) / 1000 and the clock advances by dt * 1000", () => {
    const sim = createSim(0, 2, undefined, { clockMs: 123456.789, time: 10.15 });
    const before = sim.clockMs as number;
    stepSim(sim, IDLE, STEP);
    expect(sim.clockMs).toBeCloseTo(before + 1000 / 60, 9);
    expect(sim.time).toBeCloseTo(10.15 + STEP, 12);
  });

  it("the float noise differs with the clock magnitude, which is why holds need the recorded start clock", () => {
    const hold = (clockMs: number): number => {
      const sim = createSim(0, 1, undefined, { clockMs });
      let h = 0;
      for (let i = 0; i < 150; i++) {
        const prev = sim.clockMs as number;
        sim.clockMs = prev + 1000 / 60;
        h += (sim.clockMs - prev) / 1000;
      }
      return h;
    };
    const values = new Set([hold(0), hold(123456.789), hold(987654.321), hold(2e6)].map((v) => v.toPrecision(17)));
    expect(values.size).toBeGreaterThan(1);
  });
});
