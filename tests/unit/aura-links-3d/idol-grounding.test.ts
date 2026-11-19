/**
 * Owner report "floating trees": the Idol oak stands on a tilted grass mound and Idol grounds a GLB at its lowest vertex
 * (the mound's front lip), so the trunk base sat 0.3-0.75 m (x scale) above the terrain. Every Idol set piece must now
 * stand on the LOWEST ground under its footprint, sunk a little, on every hole of every course.
 */
import { describe, expect, it } from "vitest";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import {
  buildIdolBallWasherNode, buildIdolClubhouseNode, buildIdolGallerySpectatorsNode, buildIdolTreeBatches
} from "../../../apps/showcase-aura-links-3d/src/art/idolModels";
import { IDOL_TREE_BASE_LIFT, IDOL_TREE_HEIGHT } from "../../../apps/showcase-aura-links-3d/src/game/idolArt";
import type { CourseId } from "../../../apps/showcase-aura-links-3d/src/game/types";

const json = (n: any) => (typeof n?.toJSON === "function" ? n.toJSON() : n);
const ring = (x: number, z: number, r: number): [number, number][] => {
  const out: [number, number][] = [[x, z]];
  for (const k of [0.5, 1]) for (let i = 0; i < 8; i++) out.push([x + Math.cos((i / 8) * Math.PI * 2) * r * k, z + Math.sin((i / 8) * Math.PI * 2) * r * k]);
  return out;
};

describe("Idol set pieces stand on the ground (no floating) on every hole of every course", () => {
  for (const id of Object.keys(COURSES) as CourseId[]) {
    const course = COURSES[id];
    it(`${id}: trees, clubhouse, gallery and ball washer bases sit at or just below the terrain under their footprint`, () => {
      for (const hole of course.holes) {
        const t = buildHoleTerrain(course, hole);
        // trees on a grid of rough spots (the real corridor spots are seeded in main.ts; every spot of the hole is fair game)
        const spots: { x: number; z: number; h: number; yaw: number }[] = [];
        const { minX, maxX, minZ, maxZ } = t.bounds;
        for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
          const x = minX + ((i + 0.5) / 9) * (maxX - minX), z = minZ + ((j + 0.5) / 9) * (maxZ - minZ);
          if (t.zone(x, z) === "rough") spots.push({ x, z, h: 6.8 + ((i * 7 + j) % 5), yaw: i + j });
        }
        for (const theme of ["dunes", "parkland", "nightCity"]) {
          for (const n of buildIdolTreeBatches(t, spots, theme, true, false).map(json)) {
            if (!String(n.name).startsWith("idol-trees-")) continue;
            const key = String(n.name).replace("idol-trees-", "");
            for (const inst of n.instances) {
              const [x, y, z] = inst.position, sy = inst.scale[1], s = sy / (theme === "dunes" ? 0.9 : 1);
              const trunkBase = y + (IDOL_TREE_BASE_LIFT[key] ?? 0) * sy;
              const ground = ring(x, z, 1.6 * s).map(([px, pz]) => t.height(px, pz));
              expect(trunkBase, `${id} h${hole.number} ${key}`).toBeLessThanOrEqual(Math.min(...ground) + 1e-6);
              expect(trunkBase, `${id} h${hole.number} ${key}`).toBeGreaterThanOrEqual(Math.min(...ground) - 0.5);
              expect(IDOL_TREE_HEIGHT[key]).toBeGreaterThan(0);
            }
          }
        }
        // clubhouse at a spot behind the green (both themes)
        const cx = t.cup[0] - 15, cz = t.cup[2] + hole.layout.greenRadius + 14;
        const club = json(buildIdolClubhouseNode(course, t, cx, cz));
        const cg = ring(cx, cz, 8.5).map(([px, pz]) => t.height(px, pz));
        expect(club.position[1], `${id} h${hole.number} clubhouse`).toBeLessThanOrEqual(Math.min(...cg) + 1e-6);
        expect(club.position[1], `${id} h${hole.number} clubhouse`).toBeGreaterThanOrEqual(Math.min(...cg) - 0.5);
        // gallery fans and the ball washer: feet on the ground
        for (const fan of json(buildIdolGallerySpectatorsNode(t.cup[0], t.cup[2], hole.layout.greenRadius, t)).children) {
          const [x, y, z] = fan.position;
          const g = ring(x, z, 0.25).map(([px, pz]) => t.height(px, pz));
          expect(y, `${id} h${hole.number} fan`).toBeLessThanOrEqual(Math.min(...g) + 1e-6);
          expect(y).toBeGreaterThanOrEqual(Math.min(...g) - 0.5);
        }
        const w = json(buildIdolBallWasherNode(t));
        expect(w.position[1], `${id} h${hole.number} washer`).toBeLessThanOrEqual(Math.min(...ring(w.position[0], w.position[2], 0.25).map(([px, pz]) => t.height(px, pz))) + 1e-6);
      }
    });
  }
});
