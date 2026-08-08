import { describe, expect, it } from "vitest";
import { samplePacejkaTireForces } from "@aura3d/physics";

describe("Pacejka tyre load rating", () => {
  it("honours an explicit rated load", () => {
    const sample = (maxLoad?: number) => samplePacejkaTireForces({
      normalForce: 10,
      maxLoad,
      longitudinalVelocity: 4,
      lateralVelocity: 0,
      angularVelocity: 4 / 0.32,
      radius: 0.32,
      steeringAngle: 0.1,
      lateral: "sport",
      longitudinal: "sport"
    });

    const rated = sample(10);
    const defaultRated = sample();
    expect(Math.abs(rated.lateralForce)).toBeGreaterThan(Math.abs(defaultRated.lateralForce) * 2);
  });
});
