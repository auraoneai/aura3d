import { describe, expect, it } from "vitest";
import { looks } from "@aura3d/engine";
import { COURSES } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { courseFill, fairwayRadiance } from "../../../apps/showcase-aura-links-3d/src/game/lighting";

/**
 * Neon Bay rendered at mean luma 2.3 with 96% of pixels at 8 or below
 * (audit-fix E2 frames, base and branch). The Lambert estimate below matches
 * that frame: Neon Bay's fairway got about 1/21 of the light Mare's does,
 * and Mare renders at mean luma 47. The floodlight brings Neon Bay to a
 * night level a bit under Mare's.
 */
function fairwayLight(id: keyof typeof COURSES) {
  const course = COURSES[id];
  const key = (looks as any).describe(course.look).v0.key as { position: number[]; intensity: number; color: string };
  const fill = courseFill(course);
  const directionals = [
    { color: key.color, intensity: key.intensity, position: key.position },
    { color: fill.rim, intensity: fill.rimI, position: fill.rimPos },
    ...(fill.flood ? [fill.flood] : [])
  ];
  const ambient = [{ color: fill.ambient, intensity: fill.ambientI }, ...(fill.hemiI > 0 ? [{ color: fill.sky, intensity: fill.hemiI }] : [])];
  return fairwayRadiance(course.palette.fairway, directionals, ambient);
}

describe("Aura Links course light budget", () => {
  it("Neon Bay's floodlit fairway gets 40% to 90% of the light Mare's does (it was about 5%)", () => {
    const neon = fairwayLight("neonBay");
    const mare = fairwayLight("mareCourse");
    const ratio = neon / mare;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.9);
  });

  it("only Neon Bay has a floodlight, and the HDRI courses author no hemisphere", () => {
    for (const course of Object.values(COURSES)) {
      const fill = courseFill(course);
      expect(Boolean(fill.flood), course.id).toBe(course.id === "neonBay");
      if (course.look !== "night-city" && course.look !== "space") expect(fill.hemiI, course.id).toBe(0);
    }
  });
});
