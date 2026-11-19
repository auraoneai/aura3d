import { describe, expect, it } from "vitest";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { buildIdolTreeBatches } from "../../../apps/showcase-aura-links-3d/src/art/idolModels";
import { IDOL_TREE_HEIGHT } from "../../../apps/showcase-aura-links-3d/src/game/idolArt";

/**
 * Moving parts of the Idol set pieces (artifacts/idol/MOVING-PARTS.md). The only Links Idol prop that moved in the procedural
 * version is the corridor tree canopy (instance wind, strength 0.08): the Idol broadleaves must keep swaying, and
 * stay still under reduced motion like before. (Golfer: driven bones; caddie: idle clip — idol-engine-pose / rig-nodes tests.)
 */
describe("Idol corridor trees sway in the wind like the procedural canopies", () => {
  const course = COURSES.mapleHollow;
  const hole = course.holes[0]!;
  const terrain = buildHoleTerrain(course, hole);
  const trees = Array.from({ length: 12 }, (_, i) => ({ x: terrain.tee[0] + 20 + i * 3, z: terrain.tee[2] + 30, h: 8 + (i % 3), yaw: i }));
  const json = (n: any) => (typeof n?.toJSON === "function" ? n.toJSON() : n);

  it("every Idol broadleaf batch is wind-opted at the old strength and bends over the GLB's crown height", () => {
    const idol = buildIdolTreeBatches(terrain, trees, "parkland", true, false).map(json).filter((n: any) => String(n.name).startsWith("idol-trees-"));
    expect(idol.length).toBeGreaterThanOrEqual(2);
    for (const n of idol) {
      const key = String(n.name).replace("idol-trees-", "");
      expect(n.instanceWind, n.name).toBeTruthy();
      expect(n.instanceWind.wind.strength).toBeCloseTo(0.08, 5);
      expect(n.instanceWind.assetHeight).toBe(IDOL_TREE_HEIGHT[key]);
      expect(n.scaleMode).toBe("world");
    }
  });

  it("reduced motion (and the original look) holds them still", () => {
    for (const n of buildIdolTreeBatches(terrain, trees, "parkland", true, true).map(json)) expect(n.instanceWind, n.name).toBeUndefined();
  });
});
