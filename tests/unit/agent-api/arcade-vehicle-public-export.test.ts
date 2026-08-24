import { describe, expect, it } from "vitest";

import { createGameArcadeVehicle } from "@aura3d/engine";

/**
 * The shared arcade vehicle core is deliberately exported from the root safe
 * API (see the re-export beside VehicleDriverAi in agent-api/index.ts). These
 * assertions pin the public surface: deterministic stepping through the barrel
 * import path that routes such as showcase-courier-rush consume.
 */
describe("public arcade vehicle export", () => {
  it("steps deterministically when imported from the public barrel", () => {
    const run = () => {
      const vehicle = createGameArcadeVehicle({
        maxSpeed: 13,
        acceleration: 7.2,
        brakeStrength: 20,
        reverseSpeed: 4.5,
        drag: 1.9,
        steerRate: 2.35
      });
      vehicle.reset({ x: 0, z: 4.6, heading: Math.PI / 2 });
      for (let frame = 0; frame < 180; frame += 1) {
        vehicle.step(1 / 60, {
          throttle: frame < 140 ? 1 : 0,
          steer: Math.sin(frame / 24) * 0.5,
          drifting: frame > 60 && frame < 90
        });
      }
      return vehicle.snapshot();
    };
    expect(run()).toEqual(run());
    expect(run().speed).toBeGreaterThan(4);
  });

  it("reports its kind so evidence can name the system honestly", () => {
    const vehicle = createGameArcadeVehicle({ maxSpeed: 10 });
    expect(vehicle.kind).toBe("aura-game-arcade-vehicle");
  });
});
