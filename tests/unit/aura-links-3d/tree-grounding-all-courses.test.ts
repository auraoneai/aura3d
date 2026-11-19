/**
 * Owner report (2026-11-18): "trees still floating" (e.g. the snowy pine beside the clubhouse). Every tree kind on every hole
 * of every course stands on the LOWEST ground under its footprint, sunk a little: the procedural conifers / oaks (their root
 * spread reaches ~0.34 s from the axis), the Idol broadleaves (footprint 1.6 s) and the alpine horizon treeline.
 */
import { describe, expect, it } from "vitest";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { courseTreeSpots } from "../../../apps/showcase-aura-links-3d/src/game/treeSpots";
import { buildIdolTreeBatches } from "../../../apps/showcase-aura-links-3d/src/art/idolModels";
import { CONIFER_GROUND_SINK, buildAlpineHorizonTreelineNode, buildCourseTreeBatches } from "../../../apps/showcase-aura-links-3d/src/art/proceduralModels";
import { IDOL_TREE_BASE_LIFT } from "../../../apps/showcase-aura-links-3d/src/game/idolArt";
import type { CourseId } from "../../../apps/showcase-aura-links-3d/src/game/types";

const json = (n: any) => (typeof n?.toJSON === "function" ? n.toJSON() : n);
const minGround = (h: (x: number, z: number) => number, x: number, z: number, r: number) => {
  let lo = h(x, z);
  for (const k of [0.25, 0.5, 0.75, 1]) for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    lo = Math.min(lo, h(x + Math.cos(a) * r * k, z + Math.sin(a) * r * k));
  }
  return lo;
};

describe("every tree kind on every course is grounded (no floating, no deep sinking)", () => {
  for (const id of Object.keys(COURSES) as CourseId[]) {
    const course = COURSES[id];
    it(`${id} (${course.dressing.theme}): procedural trees, Idol broadleaves and horizon pines`, () => {
      let checked = 0;
      for (const hole of course.holes) {
        const t = buildHoleTerrain(course, hole);
        const spots = courseTreeSpots(course, hole, t);
        if (spots.length === 0) continue;
        const theme = course.dressing.theme;
        // procedural trunks (both the mixed and the conifer-only batches): base on the lowest ground under the root spread
        for (const conifersOnly of [false, true]) {
          for (const n of buildCourseTreeBatches(t, spots, theme, true, false, conifersOnly).map(json)) {
            for (const inst of n.instances ?? []) {
              const [x, y, z] = inst.position, s = inst.scale[0];
              const lo = minGround(t.height, x, z, 0.34 * s);
              expect(y, `${id} h${hole.number} ${n.name}`).toBeLessThanOrEqual(lo + 0.02);
              expect(y, `${id} h${hole.number} ${n.name}`).toBeGreaterThanOrEqual(lo - CONIFER_GROUND_SINK - 0.6);
              checked++;
            }
          }
        }
        // Idol broadleaves: trunk base (minus the GLB's base lift) at or below the lowest ground under the trunk
        for (const n of buildIdolTreeBatches(t, spots, theme, true, false).map(json)) {
          if (!String(n.name).startsWith("idol-trees-")) continue;
          const key = String(n.name).replace("idol-trees-", "");
          for (const inst of n.instances ?? []) {
            const [x, y, z] = inst.position, sy = inst.scale[1];
            const base = y + (IDOL_TREE_BASE_LIFT[key] ?? 0) * sy;
            expect(base, `${id} h${hole.number} ${key}`).toBeLessThanOrEqual(minGround(t.height, x, z, 0.6 * sy) + 0.02);
            checked++;
          }
        }
        if (theme === "alpine") {
          const n = json(buildAlpineHorizonTreelineNode(t.cup[0], t.cup[2], t.height));
          for (const inst of n.instances ?? []) {
            const [x, y, z] = inst.position;
            expect(y, `${id} h${hole.number} horizon pine`).toBeLessThanOrEqual(minGround(t.height, x, z, 0.34 * inst.scale[0]) + 0.02);
          }
        }
      }
      if (["dunes", "parkland", "alpine", "nightCity"].includes(course.dressing.theme)) expect(checked).toBeGreaterThan(0);
    });
  }
});

describe("tree clearance can hide trees in wind-swayed (packed) batches", () => {
  it("every wind batch carries its transforms and rebuilds without the hidden trees (engine forbids setInstances on packed scatters)", () => {
    const course = COURSES[Object.keys(COURSES)[0] as CourseId];
    const hole = course.holes[0]!;
    const t = buildHoleTerrain(course, hole);
    const spots = courseTreeSpots(course, hole, t);
    const nodes = [...buildCourseTreeBatches(t, spots, "dunes", true, false), ...buildIdolTreeBatches(t, spots, "dunes", true, false)];
    let windBatches = 0;
    for (const node of nodes) {
      const j = json(node);
      const windy = j.instanceWind !== undefined || j.wind !== undefined || j.placements !== undefined || JSON.stringify(j).includes('"wind"');
      if (!windy) continue;
      windBatches++;
      expect(typeof node.rebuildTreeBatch, String(j.name)).toBe("function");
      const all: unknown[] = node.treeBatchTransforms;
      expect(all.length).toBeGreaterThan(1);
      const keep = all.map((_, i) => i).filter((i) => i % 2 === 0);
      const rebuilt = json(node.rebuildTreeBatch(keep));
      expect(rebuilt.name).toBe(j.name);
      expect((rebuilt.instances ?? []).length).toBe(keep.length);
    }
    expect(windBatches).toBeGreaterThan(0);
  });
});

import { GALLERY_BLOCKED_ZONES, buildIdolGallerySpectatorsNode } from "../../../apps/showcase-aura-links-3d/src/art/idolModels";

describe("gallery fans never stand in a bunker, pond or on the green", () => {
  it("every fan of every hole of every course stands on rough or fairway", () => {
    for (const id of Object.keys(COURSES) as CourseId[]) {
      const course = COURSES[id];
      for (const hole of course.holes) {
        const t = buildHoleTerrain(course, hole);
        const g = json(buildIdolGallerySpectatorsNode(t.cup[0], t.cup[2], hole.layout.greenRadius, t));
        expect((g.children ?? []).length).toBeGreaterThan(0);
        for (const fan of g.children ?? []) {
          const [x, , z] = fan.position ?? fan.transform?.position;
          expect(GALLERY_BLOCKED_ZONES.has(t.zone(x, z) as string), `${id} h${hole.number} ${fan.name} in ${t.zone(x, z)}`).toBe(false);
        }
      }
    }
  });
});
