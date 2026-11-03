import { describe, expect, it } from "vitest";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { crestHeight, HORIZON_SPECS, horizonRing } from "../../../apps/showcase-aura-links-3d/src/game/horizon";

describe("aura-links-3d horizon ring (GU47 phase 4, environment_world)", () => {
  it("only the four courses without their own backdrop get a ring", () => {
    expect(Object.keys(HORIZON_SPECS).sort()).toEqual(["cinderRim", "mapleHollow", "mareCourse", "stAuroras"]);
  });
  it("crests stay inside each spec's height range and the ring stands outside the hole bounds", () => {
    for (const [id, spec] of Object.entries(HORIZON_SPECS)) {
      for (let a = 0; a < Math.PI * 2; a += 0.1) {
        const h = crestHeight(spec!, a);
        expect(h).toBeGreaterThanOrEqual(spec!.minHeight - 1e-9);
        expect(h).toBeLessThanOrEqual(spec!.maxHeight + 1e-9);
      }
      const course = (COURSES as any)[id];
      const terrain = buildHoleTerrain(course, course.holes[0]);
      const ring = horizonRing(terrain, spec!, 64);
      expect(ring.indices.length).toBe(64 * 12);
      const { minX, maxX, minZ, maxZ } = terrain.bounds;
      // every crest vertex (index 1 of each triple) lies outside the bounds rectangle
      for (let i = 1; i < ring.positions.length; i += 3) {
        const [x, , z] = ring.positions[i]!;
        expect(x < minX || x > maxX || z < minZ || z > maxZ, `${id} crest ${i}`).toBe(true);
      }
    }
  });
});
