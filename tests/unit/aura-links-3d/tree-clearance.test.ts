import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { canopyClearance, treesBlockingShot, type TreeSpot } from "../../../apps/showcase-aura-links-3d/src/game/treeClearance";
import type { CourseId } from "../../../apps/showcase-aura-links-3d/src/game/types";

/** A big oak sat between the shot camera and the target: no visible tree canopy may reach the camera -> ball -> target line. */
describe("shot sight-line clearance", () => {
  for (const id of Object.keys(COURSES) as CourseId[]) {
    it(`${id}: after clearance no remaining tree canopy reaches the camera-ball-target corridor, from the tee or any rough lie`, () => {
      const course = COURSES[id];
      for (const hole of course.holes) {
        const t = buildHoleTerrain(course, hole);
        const trees: TreeSpot[] = [];
        const { minX, maxX, minZ, maxZ } = t.bounds;
        for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) {
          const x = minX + ((i + 0.5) / 14) * (maxX - minX), z = minZ + ((j + 0.5) / 14) * (maxZ - minZ);
          if (t.zone(x, z) === "rough") trees.push({ x, z, h: 6.8 + ((i + j) % 5) });
        }
        const lies: [number, number][] = [[t.tee[0], t.tee[2]], ...hole.layout.path.map((p) => [p[0], p[1]] as [number, number]), ...trees.filter((_, k) => k % 7 === 0).map((tr) => [tr.x + 3, tr.z] as [number, number])];
        for (const ball of lies) {
          const yaw = Math.atan2(t.cup[0] - ball[0], t.cup[2] - ball[1]);
          const hidden = treesBlockingShot(trees, ball, yaw);
          trees.forEach((tr, k) => {
            if (!hidden.has(k)) expect(canopyClearance(tr, ball, yaw), `${id} h${hole.number}`).toBeGreaterThanOrEqual(0);
          });
          // only the trees in the way go: never the whole course
          expect(hidden.size).toBeLessThan(Math.max(4, trees.length * 0.35));
        }
      }
    });
  }

  it("the game hides the blocking instances of every corridor tree batch before each address and swing", () => {
    const src = readFileSync("apps/showcase-aura-links-3d/src/main.ts", "utf8");
    expect(src).toMatch(/nodes\.push\(\.\.\.registerTreeBatches\(batches, treeSpots\)\)/);
    expect(src).toMatch(/if \(state\.phase === "address" \|\| state\.phase === "swing"\) applyTreeClearance\(\);/);
    expect(src).toMatch(/treesBlockingShot\(treeSpotsMounted/);
    expect(src).toMatch(/setInstances\?\.\(/);
  });
});
