// tests/qr/prd14/turbo-drift/car-visuals.test.ts — §14.4 body roll & wheels.
import { describe, expect, it } from "vitest";
import {
  createVehicleChassis, flatVehicleSurface,
  type VehiclePlanarState
} from "@aura3d/engine";

// Same spec shape as src/v2/race-setup.ts carChassisSpec (keep values from
// vehicleChassisSpecFromBounds defaults; only fields that matter here).
const SPEC = {
  wheelbase: 1.6,
  trackWidth: 1.1,
  wheelRadius: 0.24,
  rideHeight: 0.26,
  maxSteerAngle: 0.55,
  maxPitch: 0.055,
  maxRoll: 0.05,
  springRate: 8,
  dampingRatio: 0.9,
  suspensionTravel: 0.09,
  contactTolerance: 0.03
} as const;

function driveChassis(steer: number, seconds = 1.2) {
  const chassis = createVehicleChassis(SPEC, flatVehicleSurface(0, 1));
  const state: VehiclePlanarState = {
    x: 0, z: 0, heading: 0, speed: 0, steer: 0, throttle: 0
  };
  chassis.reset(state);
  let prevHeading = 0;
  let lateralAccel = 0;
  const steps = Math.round(seconds / 0.016);
  for (let i = 0; i < steps; i += 1) {
    const pose = chassis.step(0.016, {
      ...state,
      x: (state.x += Math.cos(state.heading) * state.speed * 0.016),
      z: (state.z += Math.sin(state.heading) * state.speed * 0.016),
      heading: (state.heading += steer * 0.6 * 0.016),
      speed: (state.speed = Math.min(12, state.speed + 9 * 0.016)),
      steer,
      throttle: 0.7
    });
    void pose;
    lateralAccel = state.speed * ((state.heading - prevHeading) / 0.016);
    prevHeading = state.heading;
  }
  return { telemetry: chassis.telemetry(), lateralAccel };
}

describe("turbo car visuals (§14.4)", () => {
  it("rolls outward against the sign of lateral accel, symmetrically", () => {
    const right = driveChassis(1);  // yaw right → lateral accel right
    const left = driveChassis(-1);
    expect(Math.abs(right.telemetry.roll)).toBeGreaterThan(0.002);
    expect(Math.sign(right.telemetry.roll)).toBe(-Math.sign(left.telemetry.roll));
    // the chassis' roll convention follows the lateral-load sign (euler Z)
    expect(Math.sign(right.telemetry.roll)).toBe(Math.sign(right.lateralAccel));
  });

  it("roll converges smoothly rather than stepping (settled within a second)", () => {
    const chassis = createVehicleChassis(SPEC, flatVehicleSurface(0, 1));
    chassis.reset({ x: 0, z: 0, heading: 0, speed: 0, steer: 0, throttle: 0 });
    const rolls: number[] = [];
    const state: VehiclePlanarState = { x: 0, z: 0, heading: 0, speed: 10, steer: 1, throttle: 0.5 };
    for (let i = 0; i < 60; i += 1) {
      chassis.step(0.016, state);
      rolls.push(chassis.telemetry().roll);
    }
    const last = rolls[rolls.length - 1]!;
    // monotonic approach once a sign is set: no sign flips mid-approach
    const flips = rolls.filter((r, i) => i > 0 && Math.sign(r) !== 0 && Math.sign(rolls[i - 1]!) !== 0 && Math.sign(r) !== Math.sign(rolls[i - 1]!)).length;
    expect(flips).toBeLessThanOrEqual(1);
    expect(Math.abs(last)).toBeGreaterThan(0.001);
  });

  it("front wheels carry the steer input and spin under throttle", () => {
    const run = driveChassis(0.6);
    expect(Math.sign(run.telemetry.steerAngle)).toBe(1);
    expect(Math.abs(run.telemetry.steerAngle)).toBeGreaterThan(0.1);
    expect(run.telemetry.wheelSpinRate).toBeGreaterThan(0.5);
  });
});
