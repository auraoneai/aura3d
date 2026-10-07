/**
 * V-1/V-7 bicycle model (PRD-08 §6.9).
 */
import { describe, expect, it } from "vitest";
import { createBicycleModel, type BicycleModelInput } from "@aura3d/engine/lanes";

const DT = 1 / 60;

function drive(model: ReturnType<typeof createBicycleModel>, seconds: number, input: BicycleModelInput) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i += 1) model.step(DT, input);
  return model.snapshot();
}

describe("bicycle model — longitudinal", () => {
  it("reaches a top speed within 2 % of maxSpeed", () => {
    const model = createBicycleModel({ maxSpeed: 60 });
    const s = drive(model, 30, { throttle: 1 });
    expect(Math.abs(Math.abs(s.vLong) - 60) / 60).toBeLessThan(0.02);
    // heading 0 drives down +z; assert real displacement, not one axis.
    expect(Math.hypot(s.x, s.z)).toBeGreaterThan(0);
  });

  it("braking decelerates to a stop", () => {
    const model = createBicycleModel({ maxSpeed: 60 });
    drive(model, 5, { throttle: 1 });
    const s = drive(model, 8, { brake: 1 });
    expect(Math.abs(s.vLong)).toBeLessThan(0.5);
  });
});

describe("bicycle model — cornering", () => {
  it("stays inside the friction circle (r·v ≤ μg) in a gripped steady turn", () => {
    // μg/v is a GRIP-regime bound: at mild steer the car settles with small
    // slip angles and no drift flag (verified empirically on this model —
    // steer ≥ ~0.2 at mid-speed exceeds rear slip 0.12 rad → drifts).
    const model = createBicycleModel({ tyre: { mu: 1 } });
    drive(model, 5, { throttle: 0.6 });
    const s = drive(model, 30, { steer: 0.1, throttle: 0.15 });
    const speed = Math.hypot(s.vLong, s.vLat);
    expect(speed).toBeGreaterThan(10);
    expect(s.drifting).toBe(false);
    expect(Math.abs(s.yawRate)).toBeLessThanOrEqual((1 * 9.81) / speed);
  });

  it("flags drifting when the rear slip angle exceeds 0.12 rad", () => {
    const model = createBicycleModel();
    drive(model, 5, { throttle: 0.6 });
    const s = drive(model, 8, { steer: 0.3, throttle: 0.15 });
    expect(Math.abs(s.rearSlipAngle)).toBeGreaterThan(0.12);
    expect(s.drifting).toBe(true);
  });

  it("produces a slip angle and lateralG in a sustained turn", () => {
    const model = createBicycleModel();
    drive(model, 5, { throttle: 1 });
    const s = drive(model, 4, { throttle: 0.4, steer: 0.9 });
    expect(Math.abs(s.slipAngle)).toBeGreaterThan(0);
    expect(Math.abs(s.lateralG)).toBeGreaterThan(0);
  });

  it("handbrake drops rear grip and can trigger drifting", () => {
    const model = createBicycleModel();
    drive(model, 5, { throttle: 1 });
    const s = drive(model, 1.5, { throttle: 0.4, steer: 1, handbrake: true });
    expect(Math.abs(s.rearSlipAngle)).toBeGreaterThan(0.02);
  });
});

describe("bicycle model — low-speed + determinism", () => {
  it("blends to the kinematic bicycle at crawl speed", () => {
    const model = createBicycleModel();
    const s = drive(model, 1, { throttle: 0.25, steer: 0.5 });
    expect(Math.abs(s.vLat)).toBeLessThan(0.5);
    expect(Number.isFinite(s.heading)).toBe(true);
  });

  it("is deterministic across identical input streams", () => {
    const a = createBicycleModel();
    const b = createBicycleModel();
    const script: BicycleModelInput[] = [
      { throttle: 1 },
      { throttle: 0.5, steer: 0.8 },
      { brake: 0.4, steer: -0.3 },
      { throttle: 0.6, steer: 1, handbrake: true }
    ];
    for (let rep = 0; rep < 40; rep += 1) {
      const input = script[rep % script.length];
      a.step(DT, input);
      b.step(DT, input);
    }
    expect(a.snapshot()).toEqual(b.snapshot());
  });
});
