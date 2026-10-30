import { describe, expect, it } from "vitest";
import { COURSES, buildHoleTerrain, pondGeometry } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { boxCrop, linksQaCrops, projectPoint, type QaView } from "../../../apps/showcase-aura-links-3d/src/game/qaCrops";
import type { CourseId } from "../../../apps/showcase-aura-links-3d/src/game/types";

const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** The aim cam of main.ts at address on the tee (5.4 m back, 2.7 m aside, 2.2 m up, looking 34 m ahead). */
function addressView(id: CourseId, aspect = 16 / 9): { view: QaView; terrain: ReturnType<typeof buildHoleTerrain>; hole: (typeof COURSES)[CourseId]["holes"][number] } {
  const course = COURSES[id];
  const hole = course.holes[0]!;
  const t = buildHoleTerrain(course, hole);
  const yaw = t.lineYaw;
  const [bx, , bz] = t.tee;
  const ex = bx - Math.sin(yaw) * 5.4 - Math.cos(yaw) * 2.7, ez = bz - Math.cos(yaw) * 5.4 + Math.sin(yaw) * 2.7;
  const tx = bx + Math.sin(yaw) * 34, tz = bz + Math.cos(yaw) * 34;
  return { view: { eye: [ex, t.height(ex, ez) + 2.2, ez], target: [tx, t.height(tx, tz) - 2.2, tz], fov: 42, aspect }, terrain: t, hole };
}

describe("Aura Links QA crops (GU47 LINKS-19, E-I crop contract)", () => {
  it("projects the look-at point to the centre and points behind the camera to nothing", () => {
    const view: QaView = { eye: [0, 2, 0], target: [0, 2, 10], fov: 40, aspect: 16 / 9 };
    const c = projectPoint(view, [0, 2, 10])!;
    expect(c[0]).toBeCloseTo(0.5, 6);
    expect(c[1]).toBeCloseTo(0.5, 6);
    expect(projectPoint(view, [0, 2, -5])).toBeNull();
    // up on screen is a smaller y (origin top-left)
    expect(projectPoint(view, [0, 4, 10])![1]).toBeLessThan(0.5);
    expect(boxCrop("off", view, [[50, 2, 10], [60, 3, 10]])).toBeNull();
  });

  it("publishes golfer, ball, turf and the sky band at address on every course, all valid E-I crops", () => {
    for (const id of Object.keys(COURSES) as CourseId[]) {
      const { view, terrain, hole } = addressView(id);
      const crops = linksQaCrops(view, {
        ball: [terrain.tee[0], terrain.tee[1] + 0.05, terrain.tee[2]],
        cup: terrain.cup,
        aimYaw: terrain.lineYaw,
        fairwayHalfWidth: hole.layout.fairwayWidth / 2,
        height: (x, z) => terrain.height(x, z),
        ponds: hole.layout.water.map((w) => ({ center: w.center, radius: w.radius, y: pondGeometry(terrain, w).surfaceY }))
      });
      const names = crops.map((c) => c.name);
      for (const want of ["sky", "golfer", "ball", "turf"]) expect(names, `${id}: ${names.join(",")}`).toContain(want);
      expect(crops.length).toBeLessThanOrEqual(16);
      for (const c of crops) {
        expect(c.name).toMatch(NAME);
        for (const v of [c.x, c.y, c.w, c.h]) expect(v).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9);
      }
      const golfer = crops.find((c) => c.name === "golfer")!;
      expect(golfer.h, id).toBeGreaterThan(0.15);
    }
  });
});
