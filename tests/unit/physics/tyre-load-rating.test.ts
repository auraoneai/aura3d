import { describe, expect, it } from "vitest";
import { createVehicleMotion, samplePacejkaTireForces } from "@aura3d/physics";

/**
 * Regression for a silent, mass-dependent grip defect in the vehicle integrator.
 *
 * `samplePacejkaTireForces` scales grip by `(normalForce / maxLoad) ^ loadSensitivity`, clamped
 * to a 0.1 floor, and `maxLoad` defaults to 5000 N — a road car's tyre. `createVehicleMotion`
 * never passed it, so **any** vehicle materially lighter than a 1200 kg saloon ran permanently
 * on that floor and lost roughly ten times its grip.
 *
 * Defect class: **engine**. It never threw and never logged. The only symptom was a car that
 * would not turn, which reads as a tuning problem and sent me looking at scale factors and
 * steering rates for a long time before I measured the tyre itself.
 *
 * The tyre is now rated against the car's own static axle load, so the load factor sits near 1
 * at rest for any mass and load transfer moves it from there.
 */
describe("tyre load rating follows the vehicle's own mass", () => {
  function corneringG(mass: number): number {
    const motion = createVehicleMotion({
      mass,
      wheelbase: 2.6,
      centreOfMassHeight: 2.6 / 6,
      maxSteerAngle: 0.6,
      driveForce: mass * 8,
      brakeForce: mass * 10,
      tirePreset: "sport",
      dragCoefficient: (mass * 8) / (40 * 40),
      rollingResistance: 0.004
    });
    let sample = motion.step(1 / 60, { throttle: 1, grip: 1 });
    for (let step = 0; step < 180; step += 1) sample = motion.step(1 / 60, { throttle: 1, grip: 1 });
    for (let step = 0; step < 90; step += 1) sample = motion.step(1 / 60, { throttle: 0.6, steer: 1, grip: 1 });
    return sample.lateralG;
  }

  it("a light vehicle corners comparably to a heavy one", () => {
    /*
     * The invariant that was violated. Cornering ability is a ratio of force to mass, so a
     * lighter car on equivalently rated tyres should corner *at least* as well. Before the fix
     * a 1 kg vehicle produced about a tenth of the grip of a 1200 kg one purely because of the
     * hardcoded 5000 N rating.
     */
    const heavy = corneringG(1200);
    const light = corneringG(1);
    expect(heavy).toBeGreaterThan(0.2);
    expect(light).toBeGreaterThan(0.2);
    // Within a factor of two of each other, rather than a factor of ten apart.
    expect(light).toBeGreaterThan(heavy / 2);
  });

  it("grip does not collapse across four orders of magnitude of mass", () => {
    const samples = [1, 10, 100, 1200].map((mass) => corneringG(mass));
    for (const value of samples) expect(value).toBeGreaterThan(0.2);
    const lowest = Math.min(...samples);
    const highest = Math.max(...samples);
    // A mass-independent quantity must not vary by an order of magnitude with mass alone.
    expect(highest / lowest).toBeLessThan(4);
  });

  it("the underlying tyre model still honours an explicit rating", () => {
    // Confirms the fix is "pass the right maxLoad", not "defeat load sensitivity".
    const rated = samplePacejkaTireForces({
      normalForce: 10,
      maxLoad: 10,
      longitudinalVelocity: 4,
      lateralVelocity: 0,
      angularVelocity: 4 / 0.32,
      radius: 0.32,
      steeringAngle: 0.1,
      lateral: "sport",
      longitudinal: "sport"
    });
    const unrated = samplePacejkaTireForces({
      normalForce: 10,
      longitudinalVelocity: 4,
      lateralVelocity: 0,
      angularVelocity: 4 / 0.32,
      radius: 0.32,
      steeringAngle: 0.1,
      lateral: "sport",
      longitudinal: "sport"
    });
    // A correctly rated tyre produces materially more force than one rated for a 5000 N load.
    expect(Math.abs(rated.lateralForce)).toBeGreaterThan(Math.abs(unrated.lateralForce) * 2);
  });
});
