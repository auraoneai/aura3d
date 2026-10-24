import { describe, expect, it } from "vitest";
import { attachToBone, attachmentDistance, boneWorldPosition, checkDoubleFrame, resolveBone, type AttachableActor } from "../../../packages/game/src/motion/index";

const makeActor = (bones: readonly string[]) => {
  const attached: unknown[] = [];
  const actor: AttachableActor = {
    socket: (bone) => {
      const valid = bones.includes(bone);
      return {
        valid,
        worldMatrix: () => {
          const m = new Float32Array(16);
          m[0] = m[5] = m[10] = m[15] = 1;
          m[12] = 1;
          m[13] = 2;
          m[14] = 3;
          return m;
        }
      };
    },
    attach: (spec) => {
      attached.push(spec);
      return () => attached.pop();
    }
  };
  return { actor, attached };
};

describe("bone resolution and attach", () => {
  it("resolves roles across Mixamo, Blender and Meshy names", () => {
    expect(resolveBone(["mixamorig:RightHand", "mixamorig:LeftHand"], "rightHand")).toBe("mixamorig:RightHand");
    expect(resolveBone(["Hand.R", "Hand.L"], "rightHand")).toBe("Hand.R");
    expect(resolveBone(["hand_l", "hand_r"], "leftHand")).toBe("hand_l");
    expect(resolveBone(["Hips"], "rightHand")).toBeUndefined();
    expect(resolveBone(["Custom_Bone"], "Custom_Bone")).toBe("Custom_Bone");
  });

  it("attaches by probing aliases and detaches", () => {
    const { actor, attached } = makeActor(["mixamorig:RightHand"]);
    const a = attachToBone(actor, { bone: "rightHand", target: "bat", position: [0, 0.1, 0] });
    expect(a.bone).toBe("mixamorig:RightHand");
    expect(attached).toHaveLength(1);
    expect((attached[0] as { socket: string }).socket).toBe("mixamorig:RightHand");
    a.detach();
    expect(attached).toHaveLength(0);
  });

  it("fails loudly when no bone matches", () => {
    const { actor } = makeActor(["Hips"]);
    expect(() => attachToBone(actor, { bone: "rightHand", target: "bat", boneNames: ["Hips", "Spine"] })).toThrow(/ATTACH_BONE_NOT_FOUND/);
  });

  it("measures the node-to-bone distance", () => {
    const { actor } = makeActor(["Head"]);
    const bone = boneWorldPosition(actor, "Head");
    expect(bone).toEqual([1, 2, 3]);
    expect(attachmentDistance([1, 2, 3.03], bone)).toBeCloseTo(0.03);
  });
});

describe("double-frame detector", () => {
  it("flags two meshes on one skeleton", () => {
    const r = checkDoubleFrame({ draws: [{ meshId: "a", skeletonId: "s" }, { meshId: "b", skeletonId: "s" }, { meshId: "c", skeletonId: "t" }] });
    expect(r.ok).toBe(false);
    expect(r.findings[0]!.kind).toBe("shared-skeleton");
  });

  it("flags coincident instances of one model but not different models", () => {
    expect(checkDoubleFrame({ instances: [{ id: "p1", modelId: "player", position: [0, 0, 0] }, { id: "p2", modelId: "player", position: [0.02, 0, 0] }] }).ok).toBe(false);
    expect(checkDoubleFrame({ instances: [{ id: "p1", modelId: "player", position: [0, 0, 0] }, { id: "k", modelId: "keeper", position: [0, 0, 0] }] }).ok).toBe(true);
  });

  it("flags override layers summing past one and a clip on two layers", () => {
    const r = checkDoubleFrame({ layers: [{ name: "base", clip: "run", weight: 1 }, { name: "upper", clip: "run", weight: 0.8 }] });
    expect(r.findings.map((f) => f.kind)).toEqual(["double-blend", "double-blend"]);
    expect(checkDoubleFrame({ layers: [{ name: "base", clip: "run", weight: 1 }, { name: "lean", clip: "lean", weight: 0.5, blendMode: "additive" }] }).ok).toBe(true);
  });
});
