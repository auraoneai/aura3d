import { describe, expect, it } from "vitest";
import { createVehicleMotion, type VehicleMotionSample } from "@aura3d/physics";

/*
 * Frame-rate independence of the vehicle integrator.
 *
 * A cornering tyre is the stiffest spring in a vehicle model, and explicit integration is only
 * conditionally stable against one. Stepping a vehicle at whatever dt the browser happens to
 * deliver therefore does not merely lose a little accuracy: past the stability threshold the
 * yaw/slip feedback loop diverges and the output stops describing a car.
 *
 * The defect these tests lock down: at a 1/60 s step, holding a constant steering input produced
 * a yaw rate of -4.279 rad/s -- opposite to the steer -- while the identical second of simulated
 * time integrated at dt/2 or finer converged to +0.5 rad/s. A consumer could not distinguish that
 * from a wiring error in its own code, and handling changed with the client frame rate.
 *
 * Convergence under refinement is the property that makes the model trustworthy, so it is
 * asserted directly rather than inferred from one dt trace looking plausible.
 */
function testCar() {
  return createVehicleMotion({
    mass: 1,
    wheelbase: 0.16,
    frontWeightBias: 0.53,
    centreOfMassHeight: 0.16 / 6,
    maxSteerAngle: 0.64,
    driveForce: 17.7,
    brakeForce: 24,
    tirePreset: "sport",
    dragCoefficient: 0.95,
    rollingResistance: 0.004
  });
}

/** The same span of simulated time, delivered in `frames` equal slices. */
function corner(frames: number, steer: number, grip: number): VehicleMotionSample {
  const motion = testCar();
  const dt = 1 / frames;
  let sample = motion.step(dt, { throttle: 1, grip });
  // Reach a steady speed first, over equal simulated time regardless of frame count.
  for (let index = 0; index < frames * 3; index += 1) sample = motion.step(dt, { throttle: 1, grip });
  for (let index = 0; index < frames; index += 1) sample = motion.step(dt, { throttle: 1, steer, grip });
  return sample;
}

describe("vehicle motion is frame-rate independent", () => {
  it("yaws in the direction it is steered at every frame rate", () => {
    for (const frames of [30, 60, 120, 240]) {
      const sample = corner(frames, 0.2, 2);
      expect(Math.sign(sample.yawRate), `yaw sign at ${frames} fps`).toBe(1);
    }
  });

  it("converges to the same state as the timestep is refined", () => {
    const reference = corner(960, 0.2, 2);
    for (const frames of [30, 60, 120]) {
      const sample = corner(frames, 0.2, 2);
      expect(
        Math.abs(sample.yawRate - reference.yawRate),
        `yaw at ${frames} fps vs converged`
      ).toBeLessThan(Math.abs(reference.yawRate) * 0.25);
      expect(
        Math.abs(sample.speed - reference.speed),
        `speed at ${frames} fps vs converged`
      ).toBeLessThan(Math.abs(reference.speed) * 0.25);
    }
  });

  it("stays stable at the high grip an arcade route asks for", () => {
    for (const grip of [1, 2, 4, 8]) {
      const sample = corner(60, 0.2, grip);
      expect(Number.isFinite(sample.yawRate)).toBe(true);
      expect(Math.sign(sample.yawRate), `yaw sign at grip ${grip}`).toBe(1);
      // A cornering vehicle, not a point spinning on the spot.
      expect(Math.abs(sample.lateralG), `lateral g at grip ${grip}`).toBeLessThan(10);
    }
  });

  it("damps yaw over elapsed time rather than per call", () => {
    /*
     * Yaw damping was a fixed multiplier applied once per `step()`, so the same simulated time
     * shed a different amount of yaw depending on call frequency, and compounded badly under
     * substepping. Coasting must now decay alike at any frame rate.
     */
    const settle = (frames: number) => {
      const motion = testCar();
      const dt = 1 / frames;
      let sample = motion.step(dt, { throttle: 1, grip: 2 });
      for (let index = 0; index < frames * 2; index += 1) {
        sample = motion.step(dt, { throttle: 1, steer: 0.3, grip: 2 });
      }
      for (let index = 0; index < frames; index += 1) sample = motion.step(dt, { throttle: 0, grip: 2 });
      return sample.yawRate;
    };
    const coarse = settle(30);
    const fine = settle(240);
    expect(Math.abs(coarse - fine)).toBeLessThan(Math.max(0.05, Math.abs(fine) * 0.3));
  });
});
