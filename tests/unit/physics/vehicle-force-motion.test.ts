import { describe, expect, it } from "vitest";
import { createVehicleMotion } from "../../../packages/physics/src";

/**
 * `samplePacejkaTireForces` — a real tyre model with slip ratio, slip angle,
 * load-sensitive grip and a combined-slip friction circle — existed with **zero
 * consumers**, while the racing kit drove a kinematic 2D point with a `driftSlip` fudge
 * factor. These tests exercise behaviours a kinematic model structurally cannot produce.
 */
const SPEC = {
  mass: 1200,
  wheelbase: 2.5,
  centreOfMassHeight: 0.5,
  driveForce: 6000,
  brakeForce: 11000,
  tirePreset: "sport"
} as const;

function drive(steps: number, input: Parameters<ReturnType<typeof createVehicleMotion>["step"]>[1], spec = SPEC) {
  const car = createVehicleMotion(spec);
  car.reset({ speed: input.throttle ? 0 : 20 });
  let sample = car.step(1 / 60, input);
  for (let step = 1; step < steps; step += 1) sample = car.step(1 / 60, input);
  return { car, sample };
}

describe("longitudinal dynamics", () => {
  it("accelerates under throttle and decelerates under brake", () => {
    const accel = drive(120, { throttle: 1 });
    expect(accel.sample.speed).toBeGreaterThan(5);

    const car = createVehicleMotion(SPEC);
    car.reset({ speed: 25 });
    let sample = car.step(1 / 60, { brake: 1 });
    for (let step = 1; step < 60; step += 1) sample = car.step(1 / 60, { brake: 1 });
    expect(sample.speed).toBeLessThan(25);
  });

  it("never reverses the car under braking", () => {
    const car = createVehicleMotion(SPEC);
    car.reset({ speed: 3 });
    let sample = car.step(1 / 60, { brake: 1 });
    for (let step = 1; step < 300; step += 1) sample = car.step(1 / 60, { brake: 1 });
    // Braking to a stop must stop, not drive backwards.
    expect(sample.speed).toBeGreaterThanOrEqual(0);
    expect(sample.speed).toBeLessThan(0.5);
  });

  it("reaches a drag-limited terminal speed rather than accelerating forever", () => {
    const car = createVehicleMotion(SPEC);
    car.reset({ speed: 0 });
    let previous = 0;
    let sample = car.step(1 / 60, { throttle: 1 });
    for (let step = 1; step < 3000; step += 1) {
      previous = sample.speed;
      sample = car.step(1 / 60, { throttle: 1 });
    }
    // Speed has converged: drag balances drive.
    expect(Math.abs(sample.speed - previous)).toBeLessThan(0.01);
  });
});

describe("weight transfer", () => {
  it("loads the front axle under braking and the rear under acceleration", () => {
    const braking = drive(30, { brake: 1 });
    const accelerating = drive(30, { throttle: 1 });

    // Braking pitches load forward; acceleration pitches it back.
    expect(braking.sample.frontLoad).toBeGreaterThan(accelerating.sample.frontLoad);
    expect(accelerating.sample.rearLoad).toBeGreaterThan(braking.sample.rearLoad);
  });

  it("conserves total load", () => {
    const { sample } = drive(30, { brake: 0.6 });
    const total = sample.frontLoad + sample.rearLoad;
    // Load moves between axles; it does not appear or vanish.
    expect(total).toBeGreaterThan(1200 * 9.81 * 0.9);
    expect(total).toBeLessThan(1200 * 9.81 * 1.1);
  });
});

describe("wheelspin", () => {
  it("flags wheelspin when drive torque exceeds available traction", () => {
    // Huge drive force on a low-grip surface from rest.
    const { sample } = drive(10, { throttle: 1, grip: 0.25 }, { ...SPEC, driveForce: 40_000 });
    expect(sample.wheelspin).toBe(true);
    expect(Math.abs(sample.slipRatio)).toBeGreaterThan(0);
  });

  it("does not flag wheelspin under gentle throttle with full grip", () => {
    const { sample } = drive(60, { throttle: 0.15, grip: 1 });
    expect(sample.wheelspin).toBe(false);
  });
});

describe("cornering: slip angles, understeer and oversteer", () => {
  it("develops slip angles when steering at speed", () => {
    const car = createVehicleMotion(SPEC);
    car.reset({ speed: 25 });
    let sample = car.step(1 / 60, { steer: 0.8 });
    for (let step = 1; step < 60; step += 1) sample = car.step(1 / 60, { steer: 0.8 });
    // A kinematic model has no slip: heading follows steering exactly.
    expect(Math.abs(sample.frontSlipAngle)).toBeGreaterThan(0.005);
    expect(sample.lateralG).toBeGreaterThan(0);
  });

  it("reports understeer when the front axle saturates first", () => {
    const car = createVehicleMotion(SPEC);
    car.reset({ speed: 30 });
    let sawUndersteer = false;
    for (let step = 0; step < 180; step += 1) {
      const sample = car.step(1 / 60, { steer: 1, throttle: 0.3 });
      if (sample.understeering) sawUndersteer = true;
    }
    expect(sawUndersteer).toBe(true);
  });

  it("slides more on a low-grip surface than on tarmac at the same steering", () => {
    const measure = (grip: number) => {
      const car = createVehicleMotion(SPEC);
      car.reset({ speed: 25 });
      let worst = 0;
      for (let step = 0; step < 120; step += 1) {
        const sample = car.step(1 / 60, { steer: 0.7, grip });
        worst = Math.max(worst, Math.abs(sample.lateralSpeed));
      }
      return worst;
    };
    // Grip is a real constraint on available force, not a cosmetic multiplier.
    expect(measure(0.3)).not.toBeCloseTo(measure(1), 2);
  });

  it("initiates a slide when the handbrake kills rear grip", () => {
    const car = createVehicleMotion(SPEC);
    car.reset({ speed: 22 });
    let withHandbrake = 0;
    for (let step = 0; step < 90; step += 1) {
      const sample = car.step(1 / 60, { steer: 0.6, handbrake: true });
      withHandbrake = Math.max(withHandbrake, Math.abs(sample.rearSlipAngle));
    }
    const clean = createVehicleMotion(SPEC);
    clean.reset({ speed: 22 });
    let withoutHandbrake = 0;
    for (let step = 0; step < 90; step += 1) {
      const sample = clean.step(1 / 60, { steer: 0.6 });
      withoutHandbrake = Math.max(withoutHandbrake, Math.abs(sample.rearSlipAngle));
    }
    expect(withHandbrake).not.toBeCloseTo(withoutHandbrake, 3);
  });
});

describe("determinism and validation", () => {
  it("is deterministic for identical inputs", () => {
    const a = drive(120, { throttle: 0.7, steer: 0.3 });
    const b = drive(120, { throttle: 0.7, steer: 0.3 });
    expect(a.sample.x).toBeCloseTo(b.sample.x, 10);
    expect(a.sample.heading).toBeCloseTo(b.sample.heading, 10);
  });

  it("clamps the timestep so a long frame cannot explode the simulation", () => {
    const car = createVehicleMotion(SPEC);
    car.reset({ speed: 20 });
    const sample = car.step(5, { throttle: 1, steer: 1 });
    expect(Number.isFinite(sample.x)).toBe(true);
    expect(Number.isFinite(sample.heading)).toBe(true);
    expect(Math.abs(sample.speed)).toBeLessThan(200);
  });

  it("falls back to sane defaults for a sparse spec", () => {
    const car = createVehicleMotion({ mass: 900, wheelbase: 2.2 });
    expect(car.spec.driveForce).toBeGreaterThan(0);
    expect(car.spec.yawInertia).toBeGreaterThan(0);
    expect(car.spec.tirePreset).toBe("sport");
  });
});
