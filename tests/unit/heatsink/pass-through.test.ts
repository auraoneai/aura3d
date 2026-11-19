import { describe, expect, it } from "vitest";
import { SCENERY_ANCHORS, TRACK_HALF_WIDTH, WALL_LIMIT } from "../../../apps/showcase-heatsink/src/data";

/** Owner QA (Nov 18): nothing solid-looking floats in the flyable corridor without the sim knowing about it. */
describe("Thermal Drift pass-through", () => {
  // the drone centre flies at |x| <= WALL_LIMIT and y 0.95 .. 3.6 (sim.ts), its hull reaches about 1.2 m out and 0.6 m up
  const reachX = WALL_LIMIT + 1.2;
  const reachY = 3.6 + 0.6;

  it("decor beside the road stands on or beyond the wall line; spanning decor clears the flight ceiling", () => {
    for (const a of SCENERY_ANCHORS.filter((a) => a.kind === "decor")) {
      if (a.lateralX === 0) {
        // gantry, arches and tunnel frames span the road from beyond the walls; the overpass deck rides above the drones
        if (a.baseY > 0) expect(a.baseY, a.id).toBeGreaterThan(reachY);
        expect(a.maxDim / 2, a.id).toBeGreaterThan(TRACK_HALF_WIDTH + 2);
        continue;
      }
      if (a.id === "prop-barrier-left") {
        // the jersey barrier sits on the wall line, where the drone already scrapes (the wall is the collider)
        expect(Math.abs(a.lateralX)).toBeGreaterThanOrEqual(WALL_LIMIT);
        continue;
      }
      // landmarks and billboards are wide: their inner edge (lateral minus half the fitted size, capped at 12 m for tall pieces)
      expect(Math.abs(a.lateralX) - Math.min(a.maxDim / 2, 12), a.id).toBeGreaterThan(reachX - 6);
      expect(Math.abs(a.lateralX), a.id).toBeGreaterThan(TRACK_HALF_WIDTH + 5);
    }
  });

  it("every in-corridor piece is a sim object (pickup, hazard, boost, recharge), never plain decor", () => {
    for (const a of SCENERY_ANCHORS.filter((a) => Math.abs(a.lateralX) < reachX && a.lateralX !== 0 && a.id !== "prop-barrier-left")) {
      expect(a.kind, a.id).not.toBe("decor");
    }
  });
});
