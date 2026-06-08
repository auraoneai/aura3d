import { describe, expect, it } from "vitest";
import { createFootIkRig, createHeightFieldGround, type FootLegInput } from "../../../packages/animation/src";

function legs(leftAnkleY = 0.035, rightAnkleY = 0.035): FootLegInput[] {
  return [
    { side: "left", hip: [-0.18, 1, 0], knee: [-0.18, 0.5, 0.05], ankle: [-0.18, leftAnkleY, 0], pole: [-0.18, 0.5, 1] },
    { side: "right", hip: [0.18, 1, 0], knee: [0.18, 0.5, 0.05], ankle: [0.18, rightAnkleY, 0], pole: [0.18, 0.5, 1] }
  ];
}

const flatGround = createHeightFieldGround(() => ({ height: 0, normal: [0, 1, 0] }));

describe("createFootIkRig", () => {
  it("pulls each foot onto the ground target within tolerance", () => {
    const rig = createFootIkRig({ legs: legs(), raycaster: flatGround });
    const result = rig.solveFootPlacement();
    expect(result.feet).toHaveLength(2);
    expect(result.groundedFeet).toBe(2);
    for (const foot of result.feet) {
      expect(foot.sample.grounded).toBe(true);
      expect(foot.sample.targetError).toBeLessThanOrEqual(0.02);
      // planted foot sits at ground (0) + ankleHeight (0.035)
      expect(foot.sample.plantedFoot[1]).toBeCloseTo(0.035, 3);
    }
  });

  it("bends the knee toward the pole hint", () => {
    const rig = createFootIkRig({ legs: legs(), raycaster: flatGround });
    const result = rig.solveFootPlacement();
    // pole is at +z, so the solved knee should be pushed toward +z relative to the straight line.
    for (const foot of result.feet) expect(foot.knee[2]).toBeGreaterThan(0);
  });

  it("drops the hip (offset <= 0) so the higher-standing foot can reach uneven ground", () => {
    // Ground rises toward +x, so the right foot's ground is higher and needs the hip to drop.
    const slope = createHeightFieldGround((x) => ({ height: x * 0.3, normal: [0, 1, 0] }));
    const rig = createFootIkRig({ legs: legs(0.2, 0.2), raycaster: slope });
    const result = rig.solveFootPlacement();
    expect(result.hipOffset).toBeLessThanOrEqual(0);
  });

  it("foot-lock holds world position while planted, releases on lift", () => {
    const rig = createFootIkRig({ legs: legs(), raycaster: flatGround });
    // Frame 1: plant.
    const f1 = rig.solveFootPlacement();
    expect(rig.isLocked("left")).toBe(true);
    const planted1 = f1.feet[0]!.sample.plantedFoot;

    // Frame 2: ankle drifts horizontally but stays grounded -> locked position must NOT slide.
    const drift = legs();
    drift[0] = { ...drift[0]!, ankle: [-0.05, 0.035, 0] };
    const f2 = rig.solveFootPlacement({ legs: drift });
    const planted2 = f2.feet[0]!.sample.plantedFoot;
    expect(rig.isLocked("left")).toBe(true);
    expect(planted2[0]).toBeCloseTo(planted1[0], 5); // held in world space (no slide)
    expect(planted2[2]).toBeCloseTo(planted1[2], 5);

    // Frame 3: foot lifts into swing -> lock releases.
    const lifted = legs(0.5, 0.035);
    const f3 = rig.solveFootPlacement({ legs: lifted });
    expect(rig.isLocked("left")).toBe(false);
    expect(f3.feet[0]!.sample.grounded).toBe(false);
  });

  it("passes the pose through and releases the lock when there is no ground", () => {
    const noGround = createHeightFieldGround(() => ({ height: -100, normal: [0, 1, 0] }));
    const rig = createFootIkRig({ legs: legs(2, 2), raycaster: noGround, maxRayDistance: 1 });
    const result = rig.solveFootPlacement();
    expect(result.groundedFeet).toBe(0);
    for (const foot of result.feet) {
      expect(foot.sample.grounded).toBe(false);
      expect(foot.sample.verticalCorrection).toBe(0);
    }
  });

  it("is deterministic (same pose stream => identical solve)", () => {
    const a = createFootIkRig({ legs: legs(), raycaster: flatGround });
    const b = createFootIkRig({ legs: legs(), raycaster: flatGround });
    expect(a.solveFootPlacement()).toEqual(b.solveFootPlacement());
  });
});
