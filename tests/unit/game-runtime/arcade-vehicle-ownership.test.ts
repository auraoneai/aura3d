import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { createGameArcadeVehicle } from "../../../packages/engine/src/agent-api/GameRuntime.js";

describe("shared arcade vehicle ownership", () => {
  it("is deterministic for identical state, timestep, and input", () => {
    const run = () => {
      const vehicle = createGameArcadeVehicle({
        maxSpeed: 12,
        acceleration: 9,
        drag: 0.4,
        steerRate: 3.1
      });
      vehicle.reset({ x: 2, z: -1, heading: 0.25 });
      for (let frame = 0; frame < 240; frame += 1) {
        vehicle.step(1 / 60, {
          throttle: frame < 180 ? 1 : 0,
          steer: frame < 120 ? 0.35 : -0.2,
          drifting: frame >= 80 && frame < 130,
          boost: frame >= 100 && frame < 120
        });
      }
      return vehicle.snapshot();
    };

    expect(run()).toEqual(run());
  });

  it("owns pose integration while the racing kit delegates and applies surface constraints", () => {
    const source = readFileSync("packages/engine/src/agent-api/GameGenreKits.ts", "utf8");
    const start = source.indexOf("export function createGameRacingKit");
    const end = source.indexOf("const FALLING_BLOCK_SHAPES", start);
    const racing = source.slice(start, end);

    expect(racing).toContain("createGameArcadeVehicle");
    expect(racing).toContain("motion.step(step");
    expect(racing).toContain("motion.constrain");
    expect(racing).not.toMatch(/state\.position\.[xy]\s*\+\s*Math\.(?:cos|sin)/);
    expect(racing).not.toMatch(/state\.heading\s*\+\s*steer/);
  });
});
