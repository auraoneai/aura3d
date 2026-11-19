/**
 * Owner pass-through rule (2026-11-18): the rider never flies through a solid-looking object. Every scattered prop the
 * terrain draws (trees, rocks, houses, lamps, stone piers, brass posts) has a sim collider under it, and the collider-less
 * decor (banner masts, signal monoliths) stands clear of the ring route.
 */
import { describe, expect, it } from "vitest";
import { createTerrain, terrainPhysics } from "../../../examples/silt-and-signal-port/terrain";
import { chapterWorld } from "../../../examples/silt-and-signal-port/world-ch0";
import { BANNER_ROUTE_CLEARANCE, bannerMastSpots, monolithSpots, routeDistance } from "../../../examples/silt-and-signal-port/world";
import type { Collider } from "../../../examples/silt-and-signal-port/collide";

const colliders = (chapter: number): readonly Collider[] => (chapter === 0 ? chapterWorld(0)!.colliders! : terrainPhysics(chapter).colliders!) ?? [];
const covered = (cols: readonly Collider[], x: number, z: number): boolean =>
  cols.some((c) => (c.halfX !== undefined ? Math.abs(x - c.x) <= c.halfX! + 0.5 && Math.abs(z - c.z) <= c.halfZ! + 0.5 : Math.hypot(x - c.x, z - c.z) <= c.r + 0.5));

describe("Duneglide pass-through", () => {
  it("every drawn scattered prop of every chapter stands on a sim collider", () => {
    for (let chapter = 0; chapter < 7; chapter++) {
      const props = createTerrain(chapter).props();
      const cols = colliders(chapter);
      for (const kind of ["trees", "rocks", "houses", "lamps", "stone", "brass"] as const) {
        const missing = (props[kind] as readonly { x: number; z: number }[]).filter((p) => !covered(cols, p.x, p.z));
        expect(missing.map((p) => `${kind} (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`), `chapter ${chapter}`).toEqual([]);
      }
    }
  });

  it("collider-less banner masts stand clear of the ring route (banner-2 used to stand inside a ring)", () => {
    const spots = bannerMastSpots(0);
    expect(spots.length).toBeGreaterThanOrEqual(3);
    for (const s of spots) expect(routeDistance(0, s.x, s.z)).toBeGreaterThanOrEqual(BANNER_ROUTE_CLEARANCE);
  });

  it("collider-less signal monoliths stand clear of every route leg in every chapter", () => {
    for (let chapter = 0; chapter < 7; chapter++) {
      const spots = monolithSpots(chapter);
      expect(spots.length, `chapter ${chapter}`).toBeGreaterThan(0);
      for (const s of spots) expect(routeDistance(chapter, s.x, s.z), `chapter ${chapter} (${s.x.toFixed(0)}, ${s.z.toFixed(0)})`).toBeGreaterThanOrEqual(BANNER_ROUTE_CLEARANCE);
    }
  });
});
