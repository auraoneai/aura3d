import { describe, expect, it } from "vitest";
import { SKY_TOP, boxOf, lamplightCrops, projectNormalised, type QaCameraPose } from "../../../examples/last-train-port/qaCrops";

const pose: QaCameraPose = { eye: [0, 0, 0], target: [0, 0, 10], fov: 60 };

describe("Lamplight Line QA crops (GU47 E-I handoff)", () => {
  it("projects the view centre to the middle and points above / right to the top / right", () => {
    expect(projectNormalised(pose, 16 / 9, [0, 0, 10])).toEqual([0.5, 0.5]);
    const up = projectNormalised(pose, 16 / 9, [0, 2, 10])!, side = projectNormalised(pose, 16 / 9, [-2, 0, 10])!;
    expect(up[1]).toBeLessThan(0.5);
    // the camera looks down +Z with +Y up, so screen right is -X
    expect(side[0]).toBeGreaterThan(0.5);
    expect(projectNormalised(pose, 16 / 9, [0, 0, -5])).toBeNull();
  });

  it("publishes sky-top always and platform / headlamp only when in front of the camera, all inside 0..1", () => {
    const crops = lamplightCrops(pose, 16 / 9, [[1, 0, 20], [-1, 1, 22]], [0, -1, 8]);
    expect(crops.map((c) => c.name)).toEqual(["sky-top", "platform", "headlamp"]);
    for (const c of crops) { expect(c.x).toBeGreaterThanOrEqual(0); expect(c.y).toBeGreaterThanOrEqual(0); expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9); expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9); }
    expect(lamplightCrops(pose, 16 / 9, [[0, 0, -20]], [0, 0, -8])).toEqual([SKY_TOP]);
    expect(boxOf("x", pose, 1, [[500, 0, 1]], 0)).toBeNull();
  });
});
