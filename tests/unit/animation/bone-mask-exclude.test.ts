import { describe, expect, it } from "vitest";
import { createBoneMask } from "@aura3d/animation/lanes";
import { boneMaskSkeletonFor, toPoseBoneMaskSpec } from "../../../packages/engine/src/agent-api/animationMask";

/**
 * anim-phys-08: an exclude-only mask selected nothing, and `exclude` zeroed only the named joint,
 * not its children (and the engine built masks without parent indices, so no subtree selector
 * reached child bones).
 */
const skeleton = {
  jointNames: ["Hips", "Spine", "Chest", "Neck", "Head", "LeftArm", "LeftHand", "LeftUpLeg", "LeftFoot"],
  parentIndices: [-1, 0, 1, 2, 3, 2, 5, 0, 7]
};
const weights = (mask: Float32Array) => Object.fromEntries(skeleton.jointNames.map((name, index) => [name, mask[index]]));

describe("bone mask exclude", () => {
  it("exclude-only starts from the full body", () => {
    const mask = createBoneMask(toPoseBoneMaskSpec({ exclude: ["LeftFoot"] }), skeleton);
    expect(weights(mask)).toEqual({ Hips: 1, Spine: 1, Chest: 1, Neck: 1, Head: 1, LeftArm: 1, LeftHand: 1, LeftUpLeg: 1, LeftFoot: 0 });
  });

  it("exclude takes the excluded bone's subtree", () => {
    const mask = createBoneMask(toPoseBoneMaskSpec({ exclude: ["Spine"] }), skeleton);
    expect(weights(mask)).toEqual({ Hips: 1, Spine: 0, Chest: 0, Neck: 0, Head: 0, LeftArm: 0, LeftHand: 0, LeftUpLeg: 1, LeftFoot: 1 });
  });

  it("exclude still wins over include, subtree included", () => {
    const mask = createBoneMask(toPoseBoneMaskSpec({ include: ["Chest", "LeftArm", "LeftHand", "Head"], exclude: ["LeftArm"] }), skeleton);
    expect(weights(mask)).toMatchObject({ Chest: 1, Head: 1, LeftArm: 0, LeftHand: 0, Hips: 0 });
  });

  it("a pose selector with descendants: false excludes one joint", () => {
    const mask = createBoneMask({ exclude: [{ bone: "LeftArm", descendants: false }] }, skeleton);
    expect(weights(mask)).toMatchObject({ LeftArm: 0, LeftHand: 1 });
  });

  it("an empty spec still selects nothing", () => {
    expect([...createBoneMask(toPoseBoneMaskSpec({}), skeleton)].every((w) => w === 0)).toBe(true);
  });

  it("boneMaskSkeletonFor takes parent indices from the runtime's mixer skeleton", () => {
    const runtime = { skeletonJointNames: () => skeleton.jointNames, mixer: () => ({ skeleton }) };
    expect(boneMaskSkeletonFor(runtime)).toEqual(skeleton);
    expect(boneMaskSkeletonFor({ skeletonJointNames: () => skeleton.jointNames })).toEqual({ jointNames: skeleton.jointNames });
    expect(boneMaskSkeletonFor({})).toBeUndefined();
  });
});
