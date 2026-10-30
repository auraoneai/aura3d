import { describe, expect, it } from "vitest";
import { projectCrop, projectCrops } from "../../../apps/showcase-aura-hoops-3d/src/qaCrops";

describe("Aura Hoops QA crops", () => {
  it("a subject on the view axis lands centred", () => {
    const c = projectCrop([0, 0, 10], [0, 0, 0], 60, 1, { name: "c", at: [0, 0, 0], half: [1, 1] })!;
    expect(c.x + c.w / 2).toBeCloseTo(0.5, 3);
    expect(c.y + c.h / 2).toBeCloseTo(0.5, 3);
    expect(c.w).toBeCloseTo(1 / (10 * Math.tan(Math.PI / 6)), 3);
  });

  it("up is up and right is right on screen", () => {
    const up = projectCrop([0, 0, 10], [0, 0, 0], 60, 1, { name: "u", at: [0, 2, 0], half: [0.2, 0.2] })!;
    const right = projectCrop([0, 0, 10], [0, 0, 0], 60, 1, { name: "r", at: [2, 0, 0], half: [0.2, 0.2] })!;
    expect(up.y).toBeLessThan(0.5);
    expect(right.x).toBeGreaterThan(0.5);
  });

  it("drops subjects behind the eye or off screen and clamps to the canvas", () => {
    const crops = projectCrops([0, 0, 10], [0, 0, 0], 60, 16 / 9, [
      { name: "behind", at: [0, 0, 20], half: [1, 1] },
      { name: "off", at: [80, 0, 0], half: [1, 1] },
      { name: "edge", at: [10, 0, 0], half: [2, 2] }
    ]);
    expect(crops.map((c) => c.name)).toEqual(["edge"]);
    const e = crops[0]!;
    expect(e.x + e.w).toBeLessThanOrEqual(1);
    expect(e.x).toBeGreaterThanOrEqual(0);
  });
});
