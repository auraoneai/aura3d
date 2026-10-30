import { describe, expect, it } from "vitest";
import { FOV_KICK_MAX_DEG, LANE_ROLL_MAX_DEG, cameraFeel } from "../../../apps/showcase-teleoperator/src/cameraFeel";
import { SCENE_CAM_FOV_DEG } from "../../../apps/showcase-teleoperator/src/rules";

describe("grid dispatch GD-17 camera feel", () => {
  it("presented FOV reaches >= 61 deg at max speed and 56 at rest", () => {
    expect(SCENE_CAM_FOV_DEG + cameraFeel({ speed: 38, maxSpeed: 38, steer: 0, motionOk: true }).fovKickDeg).toBeGreaterThanOrEqual(61);
    expect(cameraFeel({ speed: 0, maxSpeed: 38, steer: 0, motionOk: true }).fovKickDeg).toBe(0);
    expect(cameraFeel({ speed: 60, maxSpeed: 38, steer: 0, motionOk: true }).fovKickDeg).toBe(FOV_KICK_MAX_DEG);
  });
  it("rolls at most 1.5 deg into a lane change", () => {
    const r = cameraFeel({ speed: 20, maxSpeed: 38, steer: 1, motionOk: true }).roll;
    expect(Math.abs(r)).toBeCloseTo((LANE_ROLL_MAX_DEG * Math.PI) / 180, 3);
    expect(cameraFeel({ speed: 20, maxSpeed: 38, steer: -3, motionOk: true }).roll).toBeCloseTo(-r, 6);
  });
  it("reduced motion: FOV stays 56, no roll", () => {
    expect(cameraFeel({ speed: 38, maxSpeed: 38, steer: 1, motionOk: false })).toEqual({ fovKickDeg: 0, roll: 0 });
  });
});
