import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { COVER_COUNTS, COVER_LAYERS, coverWind, groundCover } from "../../../apps/showcase-aura-links-3d/src/game/groundCover";
import type { CourseId } from "../../../apps/showcase-aura-links-3d/src/game/types";

/** GU47 WP-20 LINKS-09: instanced ground cover in the rough. */

const IDS = Object.keys(COURSES) as CourseId[];

describe("LINKS-09 ground cover", () => {
  it("puts >= 3,000 instances in the rough on High, only on rough lies, in two draws; Low carries <= 50%", () => {
    for (const id of IDS) {
      const course = COURSES[id];
      for (const hole of course.holes.slice(0, 3)) {
        const terrain = buildHoleTerrain(course, hole);
        const high = groundCover(terrain, course.dressing.theme, hole.number, "high");
        const low = groundCover(terrain, course.dressing.theme, hole.number, "low");
        const label = `${id} ${hole.number}`;
        expect(high.length, label).toBe(2);
        const highCount = high.reduce((n, p) => n + p.transforms.length, 0);
        const lowCount = low.reduce((n, p) => n + p.transforms.length, 0);
        expect(highCount, label).toBeGreaterThanOrEqual(3000);
        expect(lowCount, label).toBeLessThanOrEqual(highCount * 0.5 + 1);
        for (const plan of high) {
          expect(plan.colors.length).toBe(plan.transforms.length);
          for (const t of plan.transforms) expect(terrain.zone(t.position[0], t.position[2]), label).toBe("rough");
        }
      }
    }
    expect(COVER_COUNTS.low.tufts * 2).toBe(COVER_COUNTS.high.tufts);
  });

  it("is deterministic per hole and differs between holes", () => {
    const course = COURSES.mapleHollow;
    const t1 = buildHoleTerrain(course, course.holes[0]!);
    const a = groundCover(t1, "parkland", 1, "high");
    const b = groundCover(t1, "parkland", 1, "high");
    expect(a[0].transforms).toEqual(b[0].transforms);
    const c = groundCover(t1, "parkland", 2, "high");
    expect(c[0].transforms[0]).not.toEqual(a[0].transforms[0]);
  });

  it("sways in the wind except on Mare and under reduced motion", () => {
    const dunes = COVER_LAYERS.dunes[0];
    expect(coverWind(dunes, false, 0.28)).not.toBe(false);
    expect(coverWind(dunes, true, 0.28)).toBe(false);
    expect(coverWind(COVER_LAYERS.lunar[0], false, 0)).toBe(false);
    for (const theme of Object.keys(COVER_LAYERS) as (keyof typeof COVER_LAYERS)[]) {
      expect(COVER_LAYERS[theme][0].name).toBe("tufts");
      expect(COVER_LAYERS[theme][1].name).toBe("accents");
    }
  });

  it("main.ts mounts it on the GU47 look only, two instanced draws, no shadow cast", () => {
    const main = readFileSync(resolve(__dirname, "../../../apps/showcase-aura-links-3d/src/main.ts"), "utf8");
    expect(main).toMatch(/if \(turfOn\) \{\s*for \(const plan of groundCover\(/);
    expect(main).toContain("name: `ground-cover-${l.name}`");
    expect(main).toMatch(/ground-cover-[\s\S]{0,600}castShadow: false/);
  });
});
