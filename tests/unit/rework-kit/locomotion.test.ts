import { describe, expect, it } from "vitest";
import { createFootSlideMeter, createLocomotion, proceduralLegSwing } from "../../../packages/game/src/motion/index";

const gaits = [
  { name: "idle", speed: 0, cycle: 4 },
  { name: "walk", speed: 1.4, cycle: 1.1 },
  { name: "run", speed: 4.2, cycle: 0.7 }
];

const settle = (loco: ReturnType<typeof createLocomotion>, speed: number) => {
  let f = loco.update(speed, 1 / 60);
  for (let i = 0; i < 120; i += 1) f = loco.update(speed, 1 / 60);
  return f;
};

describe("locomotion", () => {
  it("selects the gait for the speed and matches playback rate to ground speed", () => {
    const loco = createLocomotion({ gaits });
    expect(settle(loco, 0).dominant).toBe("idle");
    const walk = settle(loco, 1.4);
    expect(walk.dominant).toBe("walk");
    expect(walk.rates.walk).toBeCloseTo(1, 2);
    const run = settle(loco, 4.2);
    expect(run.dominant).toBe("run");
    expect(run.rates.run).toBeCloseTo(1, 2);
    const fast = settle(loco, 5.0);
    expect(fast.rates.run).toBeCloseTo(5.0 / 4.2, 2);
  });

  it("blends walk and run between their speeds and weights sum to 1", () => {
    const loco = createLocomotion({ gaits });
    const f = settle(loco, 2.8);
    expect(f.weights.walk! + f.weights.run!).toBeGreaterThan(0.99);
    expect(f.weights.walk!).toBeGreaterThan(0.2);
    expect(f.weights.run!).toBeGreaterThan(0.2);
    const total = Object.values(f.weights).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("flags overspeed beyond the rate clamp", () => {
    const loco = createLocomotion({ gaits, maxRate: 1.3 });
    expect(settle(loco, 4.2 * 1.5).overspeed).toBe(true);
    expect(settle(createLocomotion({ gaits }), 4.2).overspeed).toBe(false);
  });

  it("stride phase advances with speed and wraps", () => {
    const loco = createLocomotion({ gaits });
    settle(loco, 4.2);
    const a = loco.update(4.2, 0.05).phase;
    const b = loco.update(4.2, 0.05).phase;
    expect(a).not.toBe(b);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(1);
  });

  it("procedural legs swing in opposition and stand still at zero speed", () => {
    const g = proceduralLegSwing(0.25, 5);
    expect(Math.sign(g.left.hip)).toBe(-Math.sign(g.right.hip));
    expect(g.armLeft).toBeCloseTo(g.right.hip * 0.8);
    const idle = proceduralLegSwing(0.25, 0);
    expect(idle.left.hip).toBe(0);
    expect(idle.bob).toBe(0);
  });
});

describe("foot slide meter", () => {
  const dt = 1 / 60;
  it("passes for a planted foot that stays put while stepping", () => {
    const m = createFootSlideMeter();
    for (let i = 0; i < 120; i += 1) {
      const swing = i % 40 < 20; // 20 frames in the air, 20 planted
      const planted = !swing;
      const x = planted ? 1 : 1 + (i % 40) * 0.05;
      m.feed(i * dt, [x, planted ? 0.0 : 0.15, 0], { bodySpeed: 2 });
    }
    const r = m.report();
    expect(r.notStepping).toBe(false);
    expect(r.passed).toBe(true);
  });

  it("fails when the foot slides along the ground at body speed", () => {
    const m = createFootSlideMeter();
    for (let i = 0; i < 120; i += 1) m.feed(i * dt, [i * dt * 3, 0.01, 0], { bodySpeed: 3 });
    const r = m.report();
    expect(r.p95PlantedSpeed).toBeGreaterThan(2.9);
    expect(r.notStepping).toBe(true);
    expect(r.passed).toBe(false);
  });
});
