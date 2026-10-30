/** GU47 WP-11: QA crops published for the remote luma capture (E-I contract), projected through the live camera pose. */
import { describe, expect, it } from "vitest";
import { CAMERA_V2, cameraFovForAspect, panPose, projectWorldPoint } from "../../../examples/aura-slam/view/camera";
import { QA_CROP_NAMES, slamQaCrops } from "../../../examples/aura-slam/view/qaCrops";

const cropsAt = (w: number, h: number, pan = 0) => {
  const fov = cameraFovForAspect(w / h, CAMERA_V2);
  const pose = panPose(CAMERA_V2, pan);
  return slamQaCrops({
    width: w, height: h,
    project: (x, y, z) => projectWorldPoint(w, h, x, y, z, fov, pose),
    player: { x: 0.2, y: 0.95 }, rival: { x: -0.3, y: -0.95 }, ball: [1, 1.1, 2]
  });
};

describe("GU47 QA crops", () => {
  for (const [w, h] of [[1280, 720], [390, 844]] as const) {
    it(`${w}x${h}: every named crop is on the canvas, normalised 0..1`, () => {
      const crops = cropsAt(w, h);
      expect(crops.map((c) => c.name)).toEqual([...QA_CROP_NAMES]);
      for (const c of crops) {
        expect(c.x, c.name).toBeGreaterThanOrEqual(0);
        expect(c.y, c.name).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w, c.name).toBeLessThanOrEqual(1 + 1e-9);
        expect(c.y + c.h, c.name).toBeLessThanOrEqual(1 + 1e-9);
        expect(c.w * c.h, c.name).toBeGreaterThan(0);
      }
    });
  }

  it("the near athlete box is taller than the far one, the far stand sits above the far athlete, and crops follow the pan", () => {
    const byName = Object.fromEntries(cropsAt(1280, 720).map((c) => [c.name, c]));
    expect(byName["athlete-near"]!.h).toBeGreaterThan(byName["athlete-far"]!.h);
    expect(byName["far-stand"]!.y).toBeLessThan(byName["athlete-far"]!.y);
    expect(byName["athlete-far"]!.h * 720).toBeGreaterThanOrEqual(45);
    const panned = Object.fromEntries(cropsAt(1280, 720, 0.6).map((c) => [c.name, c]));
    expect(panned["court-centre"]!.x).toBeLessThan(byName["court-centre"]!.x);
  });
});
