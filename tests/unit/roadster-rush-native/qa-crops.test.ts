import { describe, expect, it } from "vitest";
import { apexLookAt } from "../../../apps/showcase-roadster-rush/src/art/look";
import { apexQaCrops, projectChase } from "../../../apps/showcase-roadster-rush/src/render/qa";

const sunAt = (tod: number): [number, number, number] => {
  const d = apexLookAt(tod).sunDir;
  return [d[0] * 340, d[1] * 340, d[2] * 340];
};

describe("Apex Overdrive QA crops (GU47, E-I capture)", () => {
  it("projects the camera target to the screen centre", () => {
    const p = projectChase([0, 0.9, -6], 16 / 9)!;
    expect(p.x).toBeCloseTo(0.5, 6);
    expect(p.y).toBeCloseTo(0.5, 6);
    expect(projectChase([0, 3.6, 20], 16 / 9)).toBeNull();
  });

  it("puts the low sun dead ahead in the upper half, near the centre column", () => {
    for (const aspect of [16 / 9, 390 / 844]) {
      const crops = apexQaCrops(sunAt(0), [0, 0.66, -1.15], aspect);
      const sun = crops.find((c) => c.name === "sun")!;
      expect(sun).toBeDefined();
      const cx = sun.x + sun.w / 2;
      const cy = sun.y + sun.h / 2;
      expect(Math.abs(cx - 0.5)).toBeLessThan(0.2);
      expect(cy).toBeLessThan(0.5);
      expect(crops.map((c) => c.name)).toEqual(expect.arrayContaining(["sky", "road", "sun", "horizon", "hero"]));
      for (const c of crops) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("frames the hero car in the lower half of the screen", () => {
    const hero = apexQaCrops(sunAt(0), [0, 0.66, -1.15], 16 / 9).find((c) => c.name === "hero")!;
    expect(hero.y + hero.h / 2).toBeGreaterThan(0.5);
    expect(hero.w).toBeGreaterThan(0.05);
  });
});
