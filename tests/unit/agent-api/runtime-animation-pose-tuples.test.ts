import { describe, expect, it } from "vitest";
import { cloneRuntimeAnimationPose } from "../../../packages/engine/src/agent-api/runtimeEvidence";

describe("cloneRuntimeAnimationPose", () => {
  it("normalises tuple bone transforms to object form so the glTF runtime accepts the pose", () => {
    const pose = cloneRuntimeAnimationPose({
      bones: { bone_7: { rotation: [0.1, 0.2, 0.3, 0.9] as never, position: [1, 2, 3] as never, scale: [1, 1, 1] as never } }
    });
    expect(pose.bones.bone_7!.rotation).toEqual({ x: 0.1, y: 0.2, z: 0.3, w: 0.9 });
    expect(pose.bones.bone_7!.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(pose.bones.bone_7!.scale).toEqual({ x: 1, y: 1, z: 1 });
  });

  it("keeps object-form transforms unchanged and copies them", () => {
    const rotation = { x: 0, y: 0, z: 0, w: 1 };
    const pose = cloneRuntimeAnimationPose({ bones: { hips: { rotation } } });
    expect(pose.bones.hips!.rotation).toEqual(rotation);
    expect(pose.bones.hips!.rotation).not.toBe(rotation);
  });
});
