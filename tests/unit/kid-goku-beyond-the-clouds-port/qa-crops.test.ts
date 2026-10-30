import { describe, expect, it } from "vitest";
import { cumulusCrops, project } from "../../../examples/kid-goku-beyond-the-clouds-port/art/qa";

const view = { eye: [0, 3.3, 7.4] as const, target: [0, 1.5, -7] as const, fov: 55, aspect: 16 / 9, hero: [0, 0, 0] as const };

describe("GU47 QA crops", () => {
  it("names the WP crops with valid rects (at most 16, names match the contract)", () => {
    const crops = cumulusCrops(view);
    expect(crops.map((c) => c.name)).toEqual(["sky-top", "horizon", "track", "hero", "rainbow"]);
    for (const c of crops) {
      expect(c.name).toMatch(/^[a-z0-9][a-z0-9_-]{0,31}$/);
      for (const v of [c.x, c.y, c.w, c.h]) expect(v).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(1);
      expect(c.y + c.h).toBeLessThanOrEqual(1);
    }
    expect(crops.length).toBeLessThanOrEqual(16);
  });
  it("projects the hero below the screen centre in the chase view, and drops it behind the camera", () => {
    const hero = cumulusCrops(view).find((c) => c.name === "hero")!;
    expect(hero.x + hero.w / 2).toBeCloseTo(0.5, 2);
    expect(hero.y).toBeGreaterThan(0.4);
    expect(project(view, [0, 0, 20])).toBeNull();
    expect(cumulusCrops(null).some((c) => c.name === "hero")).toBe(false);
  });
});
