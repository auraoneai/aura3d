import { describe, expect, it } from "vitest";
import { createRenderInterpolator, createSmoothFollow3, jitterReport, lerpAngle, secondDifferenceRms, smoothDamp } from "../../../packages/game/src/motion/index";

describe("smoothing", () => {
  it("smoothDamp converges without overshoot", () => {
    let v = 0;
    let x = 0;
    let peak = 0;
    for (let i = 0; i < 240; i += 1) {
      const r = smoothDamp(x, 10, v, 0.3, 1 / 60);
      x = r.value;
      v = r.velocity;
      peak = Math.max(peak, x);
    }
    expect(x).toBeGreaterThan(9.99);
    expect(peak).toBeLessThanOrEqual(10 + 1e-9);
  });

  it("smoothDamp is frame-rate independent within tolerance", () => {
    const run = (dt: number) => {
      let x = 0;
      let v = 0;
      for (let t = 0; t < 1; t += dt) ({ value: x, velocity: v } = smoothDamp(x, 5, v, 0.4, dt));
      return x;
    };
    expect(Math.abs(run(1 / 30) - run(1 / 120))).toBeLessThan(0.05);
  });

  it("a smooth follow has far lower jitter than raw stepping with sim-rate noise", () => {
    const f = createSmoothFollow3([0, 0, 0], { smoothTime: 0.15 });
    const raw: number[] = [];
    const smooth: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      const target = i * 0.1 + (i % 2 === 0 ? 0.05 : -0.05);
      raw.push(target);
      smooth.push(f.step([target, 0, 0], 1 / 60)[0]);
    }
    expect(secondDifferenceRms(smooth)).toBeLessThan(secondDifferenceRms(raw) * 0.3);
    expect(jitterReport(smooth.slice(30), 0.02).passed).toBe(true);
    expect(jitterReport(raw, 0.02).passed).toBe(false);
  });

  it("lerpAngle takes the short way around", () => {
    expect(lerpAngle(3.0, -3.0, 0.5)).toBeCloseTo(Math.PI, 1);
  });

  it("render interpolator blends the last two states", () => {
    const it = createRenderInterpolator<number>((a, b, t) => a + (b - a) * t);
    it.push(0);
    it.push(10);
    expect(it.sample(0.25)).toBeCloseTo(2.5);
    expect(it.sample(2)).toBeCloseTo(10);
  });
});
