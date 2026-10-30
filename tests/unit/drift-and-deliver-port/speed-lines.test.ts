import { describe, expect, it } from "vitest";
import { FX_KINDS, SPEED_LINES, courierFxPresets, speedLineSpawn } from "../../../examples/drift-and-deliver-port/fx";

describe("gridlock courier speed lines (GU47 WP-28 GC-V1)", () => {
  const fast = { x: 0, z: 0, heading: 0, speed: 40, boosting: false };
  it("spawns ahead of the car and streaks back along the path", () => {
    const s = speedLineSpawn(fast, 3, false)!;
    expect(s.at[2]).toBeCloseTo(SPEED_LINES.ahead, 6);
    expect(s.normal).toEqual([-0, 0, -1]);
    expect(s.at[1]).toBeGreaterThan(0);
  });
  it("is off below 100 km/h unless boosting, and always off under reduced motion", () => {
    expect(speedLineSpawn({ ...fast, speed: 12 }, 0, false)).toBeNull();
    expect(speedLineSpawn({ ...fast, speed: 12, boosting: true }, 0, false)).not.toBeNull();
    expect(speedLineSpawn(fast, 0, true)).toBeNull();
  });
  it("is registered in the pack as a streak emitter", () => {
    const p = courierFxPresets()[FX_KINDS.speedLines];
    expect(p.layers[0]!.preset).toBe("streak");
  });
});
