import { describe, expect, it } from "vitest";
import { createVehicleMotion } from "../../../packages/physics/src/VehicleMotion.js";
import { samplePacejkaTireForces } from "../../../packages/physics/src/VehicleDynamics.js";

/**
 * Regression coverage for the defect that blocked WS-3.8 twice.
 *
 * `createVehicleMotion` precomputed each axle's slip angle and passed it to
 * `samplePacejkaTireForces` as `steeringAngle`. That parameter is not a slip angle: the
 * function derives slip itself from the velocities and subtracts the steer angle. So slip
 * was counted twice. Worse, the returned `lateralForce` carries the sign of the slip that
 * produced it, and the integrator added it to lateral velocity rather than opposing it.
 *
 * The tyre therefore pushed the car further into its own slide. Measured on the shipped
 * circuit, a car with 4.3 u/s of forward speed reached 42 u/s sideways — travelling ten
 * times faster across the track than along it. That is why both attempts to put the racing
 * kit on the force model were reverted: the model was unusable, and the kinematic point it
 * replaced at least held a line.
 *
 * These tests pin the invariants that make a tyre a tyre.
 */
describe("force-based vehicle motion is laterally stable", () => {
  it("reports lateral force with the sign of the slip that produced it", () => {
    const sample = samplePacejkaTireForces({
      normalForce: 4905,
      maxLoad: 4905,
      longitudinalVelocity: 10,
      lateralVelocity: 2,
      angularVelocity: 10 / 0.32,
      radius: 0.32,
      steeringAngle: 0
    });
    // Documents the library contract the integrator depends on: this is a magnitude keyed
    // to slip direction, so a consumer must apply it as a restoring force.
    expect(sample.slipAngle).toBeGreaterThan(0);
    expect(sample.lateralForce).toBeGreaterThan(0);
  });

  it("does not double-count slip angle", () => {
    const alpha = Math.atan2(2, 10);
    const passedAsSteer = samplePacejkaTireForces({
      normalForce: 4905,
      maxLoad: 4905,
      longitudinalVelocity: 10,
      lateralVelocity: 2,
      angularVelocity: 10 / 0.32,
      radius: 0.32,
      steeringAngle: -alpha
    });
    // The old integrator did exactly this and saw 2x the real slip angle.
    expect(passedAsSteer.slipAngle / alpha).toBeCloseTo(2, 3);
  });

  it("damps a lateral disturbance instead of amplifying it", () => {
    const motion = createVehicleMotion({ mass: 1200, wheelbase: 2.6 });
    motion.reset({ speed: 20, lateralSpeed: 1.5 });
    let sample = motion.state();
    let peak = 0;
    for (let frame = 0; frame < 240; frame += 1) {
      sample = motion.step(1 / 60, { throttle: 0.2, steer: 0 });
      peak = Math.max(peak, Math.abs(sample.lateralSpeed));
    }
    expect(peak).toBeLessThanOrEqual(1.5 + 1e-6);
    expect(Math.abs(sample.lateralSpeed)).toBeLessThan(0.05);
  });

  it("holds a bounded steady state through a long constant-steer corner", () => {
    const motion = createVehicleMotion({ mass: 1200, wheelbase: 2.6 });
    motion.reset({ speed: 18 });
    let sample = motion.state();
    for (let frame = 0; frame < 600; frame += 1) {
      sample = motion.step(1 / 60, { throttle: 0.35, steer: 0.5 });
    }
    // A car in a steady corner slides a little; it does not slide faster than it drives.
    expect(Math.abs(sample.lateralSpeed)).toBeLessThan(Math.abs(sample.speed));
    // Yaw settles rather than spinning up.
    const before = sample.yawRate;
    for (let frame = 0; frame < 60; frame += 1) {
      sample = motion.step(1 / 60, { throttle: 0.35, steer: 0.5 });
    }
    expect(Math.abs(sample.yawRate - before)).toBeLessThan(0.05);
    expect(Math.abs(sample.lateralG)).toBeLessThan(3);
  });

  it("turns the way it is steered", () => {
    const motion = createVehicleMotion({ mass: 1200, wheelbase: 2.6 });
    motion.reset({ speed: 15 });
    let sample = motion.state();
    for (let frame = 0; frame < 120; frame += 1) {
      sample = motion.step(1 / 60, { throttle: 0.3, steer: 0.6 });
    }
    const positiveSteerHeading = sample.heading;
    motion.reset({ speed: 15 });
    for (let frame = 0; frame < 120; frame += 1) {
      sample = motion.step(1 / 60, { throttle: 0.3, steer: -0.6 });
    }
    expect(Math.sign(positiveSteerHeading)).toBe(-Math.sign(sample.heading));
    expect(Math.abs(positiveSteerHeading)).toBeGreaterThan(0.2);
  });
});
