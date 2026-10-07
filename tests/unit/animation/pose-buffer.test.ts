import { describe, expect, it } from "vitest";
import { copyPose, createPoseBuffer, resetPoseToIdentity } from "../../../packages/animation/src/pose/PoseBuffer.js";

describe("createPoseBuffer / copyPose (PRD-06 T1.1)", () => {
  it("allocates identity TRS flats for the bone count", () => {
    const pose = createPoseBuffer(3);
    expect(pose.positions).toHaveLength(9);
    expect(pose.rotations).toHaveLength(12);
    expect(pose.scales).toHaveLength(9);
    expect([...pose.rotations]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect([...pose.scales]).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect([...pose.positions]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("copies in place without reallocating and rejects mismatched sizes", () => {
    const src = createPoseBuffer(2);
    src.positions.set([1, 2, 3, 4, 5, 6]);
    src.rotations.set([0, 0, 1, 0, 0, 1, 0, 0]);
    src.scales.set([2, 2, 2, 3, 3, 3]);
    const dst = createPoseBuffer(2);
    const positions = dst.positions;
    copyPose(dst, src);
    expect(dst.positions).toBe(positions); // same buffer, written in place
    expect([...dst.positions]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...dst.rotations]).toEqual([0, 0, 1, 0, 0, 1, 0, 0]);
    expect([...dst.scales]).toEqual([2, 2, 2, 3, 3, 3]);
    expect(() => copyPose(dst, createPoseBuffer(4))).toThrow(/bone counts/);
  });

  it("resets to identity", () => {
    const pose = createPoseBuffer(1);
    pose.positions.set([9, 9, 9]);
    pose.rotations.set([1, 0, 0, 0]);
    pose.scales.set([0.5, 0.5, 0.5]);
    resetPoseToIdentity(pose);
    expect([...pose.positions]).toEqual([0, 0, 0]);
    expect([...pose.rotations]).toEqual([0, 0, 0, 1]);
    expect([...pose.scales]).toEqual([1, 1, 1]);
  });
});
