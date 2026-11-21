import { describe, expect, it } from "vitest";
import { projectCrop, projectCrops } from "../../../apps/showcase-aura-hoops-3d/src/qaCrops";
import { LIVE_CAM } from "../../../apps/showcase-aura-hoops-3d/src/broadcast";
import { RUCKER_STANCHION_LAMPS } from "../../../apps/showcase-aura-hoops-3d/src/courtRigs";

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

  it("projects at least one Rucker stanchion luminaire inside the 1280x720 chase frustum across court positions", () => {
    const subjects = RUCKER_STANCHION_LAMPS.map((at) => ({ name: "lamp", at, half: [0.65, 0.28] as const }));
    for (const [hx, hz] of [[0, 6], [-4, 4], [4, 4], [-5, 8], [5, 8]] as const) {
      const eye = [hx + LIVE_CAM.chase.offset[0], LIVE_CAM.chase.offset[1], hz + LIVE_CAM.chase.offset[2]] as const;
      const target = [hx + LIVE_CAM.chase.targetOffset[0], LIVE_CAM.chase.targetOffset[1], hz + LIVE_CAM.chase.targetOffset[2]] as const;
      const hit = projectCrops(eye, target, LIVE_CAM.chase.fov, 16 / 9, subjects);
      expect(hit.length, `holder (${hx}, ${hz})`).toBeGreaterThan(0);
    }
  });
});
