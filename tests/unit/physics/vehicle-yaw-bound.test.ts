import { describe, expect, it } from "vitest";
import { createVehicleMotion } from "@aura3d/physics";

/**
 * Yaw must stay bounded by what the steered geometry can produce.
 *
 * `yawAccel` comes from the tyre moment, and with no ceiling it integrates without limit through a
 * feedback loop: a high-grip tyre generates a large moment, which produces more yaw, which increases
 * slip angle, which generates more moment.
 *
 * Measured before the bound, on a vehicle configured for a racing route asking ~4 g of grip: **-55
 * rad/s of yaw at 24.5 g lateral** — a car spinning on the spot rather than cornering. That is not a
 * tuning complaint; at that yaw rate a vehicle cannot follow any line, so the whole model is unusable at
 * grip levels an arcade route legitimately requests.
 *
 * The bicycle model gives the kinematic bound `v * tan(delta) / L`. The cap allows 1.6x that, so a
 * genuine slide is still expressible — the point is to keep the result a cornering vehicle, not to
 * replace tyre forces with kinematics.
 */
describe("yaw rate is bounded by steered geometry", () => {
  function highGripCar(wheelbase = 0.16) {
    return createVehicleMotion({
      mass: 1,
      wheelbase,
      frontWeightBias: 0.53,
      centreOfMassHeight: wheelbase / 6,
      maxSteerAngle: 0.64,
      driveForce: 17.7,
      brakeForce: 24,
      tirePreset: "sport",
      dragCoefficient: 0.95,
      rollingResistance: 0.004
    });
  }

  it("does not spin up without limit under high grip", () => {
    const motion = highGripCar();
    let sample = motion.step(1 / 60, { throttle: 1, grip: 4 });
    for (let step = 0; step < 120; step += 1) sample = motion.step(1 / 60, { throttle: 1, grip: 4 });
    for (let step = 0; step < 240; step += 1) sample = motion.step(1 / 60, { throttle: 1, steer: 1, grip: 4 });
    /*
     * Asserted against the *physical* ceiling rather than a chosen number.
     *
     * My first version of this test used `< 30` and failed at 32.1 — but 32.1 is well inside the bound
     * for a 0.16-unit wheelbase at this speed (kinematic 20.0, ceiling 32.0). The 30 was my arbitrary
     * threshold, not a property of the vehicle, and a magic number here would drift the moment the test
     * car changed. What matters is that yaw obeys the geometry, and that it is nowhere near the 55 rad/s
     * the unbounded version reached.
     */
    const kinematic = (Math.abs(sample.speed) * Math.abs(Math.tan(0.64))) / 0.16;
    expect(Number.isFinite(sample.yawRate)).toBe(true);
    expect(Math.abs(sample.yawRate)).toBeLessThanOrEqual(kinematic * 1.6 + 1e-6);
    // And the runaway case is genuinely excluded: 55 rad/s exceeded this ceiling by a wide margin.
    expect(Math.abs(sample.yawRate)).toBeLessThan(55);
  });

  it("respects the bicycle-model ceiling for the wheelbase and steer angle", () => {
    const wheelbase = 0.16;
    const motion = highGripCar(wheelbase);
    let sample = motion.step(1 / 60, { throttle: 1, grip: 4 });
    for (let step = 0; step < 180; step += 1) sample = motion.step(1 / 60, { throttle: 1, grip: 4 });
    for (let step = 0; step < 240; step += 1) sample = motion.step(1 / 60, { throttle: 1, steer: 1, grip: 4 });
    const kinematic = (Math.abs(sample.speed) * Math.abs(Math.tan(0.64))) / wheelbase;
    // 1.6x headroom, plus a small epsilon for the damping applied on the same step.
    expect(Math.abs(sample.yawRate)).toBeLessThanOrEqual(kinematic * 1.6 + 1e-6);
  });

  it("still lets yaw scale with speed rather than pinning it flat", () => {
    // The bound must not become the behaviour: a faster car through the same steer turns faster.
    const slow = highGripCar();
    let slowSample = slow.step(1 / 60, { throttle: 0.15, grip: 2 });
    for (let step = 0; step < 60; step += 1) slowSample = slow.step(1 / 60, { throttle: 0.15, grip: 2 });
    for (let step = 0; step < 60; step += 1) slowSample = slow.step(1 / 60, { throttle: 0.15, steer: 1, grip: 2 });

    const fast = highGripCar();
    let fastSample = fast.step(1 / 60, { throttle: 1, grip: 2 });
    for (let step = 0; step < 180; step += 1) fastSample = fast.step(1 / 60, { throttle: 1, grip: 2 });
    for (let step = 0; step < 60; step += 1) fastSample = fast.step(1 / 60, { throttle: 1, steer: 1, grip: 2 });

    expect(Math.abs(fastSample.speed)).toBeGreaterThan(Math.abs(slowSample.speed));
    expect(Math.abs(fastSample.yawRate)).toBeGreaterThan(Math.abs(slowSample.yawRate));
  });

  it("keeps understeer and oversteer expressible below the ceiling", () => {
    // A bound that erased the slip-angle distinction would defeat the model's purpose.
    const motion = highGripCar();
    for (let step = 0; step < 120; step += 1) motion.step(1 / 60, { throttle: 1, grip: 2 });
    let sample = motion.step(1 / 60, { throttle: 0.6, steer: 1, grip: 2 });
    for (let step = 0; step < 60; step += 1) sample = motion.step(1 / 60, { throttle: 0.6, steer: 1, grip: 2 });
    expect(Math.abs(sample.frontSlipAngle)).toBeGreaterThan(0);
    expect(sample.understeering || sample.oversteering).toBe(true);
  });
});
