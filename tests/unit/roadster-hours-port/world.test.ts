import { describe, expect, it } from "vitest";
import { LEVELS, levelLayout, roadProfile } from "../../../examples/roadster-hours-port/course";
import { buildWorld, roadPoint } from "../../../examples/roadster-hours-port/world";

describe("roadster-hours-port world", () => {
  it("places points on the road: z runs along -s, lateral offsets are symmetric about the centre line", () => {
    for (const level of LEVELS) {
      const c = roadPoint(level, 500, 0, 0);
      const l = roadPoint(level, 500, -4, 0);
      const r = roadPoint(level, 500, 4, 0);
      expect(c[2]).toBeCloseTo(-500, 6);
      expect(c[1]).toBeCloseTo(roadProfile(level, 500).y, 9);
      expect((l[0] + r[0]) / 2).toBeCloseTo(c[0], 6);
      expect(roadPoint(level, 500, 0, 3)[1] - c[1]).toBeCloseTo(3, 9);
    }
  });

  it("builds every route; vehicles are baked cars in per-material batched meshes plus box rigs", () => {
    LEVELS.forEach((level, i) => {
      const world = buildWorld(i);
      expect(world.level.id).toBe(level.id);
      const lineup = levelLayout(level).vehicles.length;
      expect(world.vehicleCount).toBe(lineup + level.traffic.length);
      expect(world.vehicleCount).toBeGreaterThan(20);
      expect(world.vehicleSlots).toBeGreaterThan(world.vehicleCount);
      expect(world.vehicleMeshes).toBeGreaterThanOrEqual(3);
      expect(world.vehicleGeometries).toBeGreaterThan(2);
    });
  });
});
