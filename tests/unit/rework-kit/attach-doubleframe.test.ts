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

describe("bone naming styles", () => {
  const styles: Array<[string, readonly string[], Record<string, string>]> = [
    ["Mixamo", ["mixamorig:Hips", "mixamorig:RightHand", "mixamorig:RightForeArm", "mixamorig:RightArm", "mixamorig:RightUpLeg", "mixamorig:RightLeg", "mixamorig:RightFoot"],
      { rightHand: "mixamorig:RightHand", rightForearm: "mixamorig:RightForeArm", rightUpperArm: "mixamorig:RightArm", rightThigh: "mixamorig:RightUpLeg", rightShin: "mixamorig:RightLeg", rightFoot: "mixamorig:RightFoot", hips: "mixamorig:Hips" }],
    ["Meshy / glTF Avatar (VRM, Ready Player Me)", ["Hips", "RightHand", "RightForeArm", "RightArm", "RightUpLeg", "RightLeg", "RightFoot"],
      { rightHand: "RightHand", rightForearm: "RightForeArm", rightUpperArm: "RightArm", rightThigh: "RightUpLeg", rightShin: "RightLeg", rightFoot: "RightFoot", hips: "Hips" }],
    ["lower-case forearm spellings", ["right_forearm", "R_Forearm", "RightForearm"],
      { rightForearm: "right_forearm" }],
    ["Blender Rigify", ["DEF-forearm.R", "DEF-hand.R", "DEF-thigh.R", "DEF-shin.R", "DEF-foot.R", "DEF-upper_arm.R", "spine", "head"],
      { rightForearm: "DEF-forearm.R", rightHand: "DEF-hand.R", rightThigh: "DEF-thigh.R", rightShin: "DEF-shin.R", rightFoot: "DEF-foot.R", spine: "spine", head: "head" }],
    ["Unreal mannequin", ["pelvis", "hand_r", "lowerarm_r", "upperarm_r", "thigh_r", "calf_r", "foot_r", "clavicle_r"],
      { hips: "pelvis", rightHand: "hand_r", rightForearm: "lowerarm_r", rightUpperArm: "upperarm_r", rightThigh: "thigh_r", rightShin: "calf_r", rightFoot: "foot_r", rightShoulder: "clavicle_r" }],
    ["3ds Max Biped", ["Bip01 Pelvis", "Bip01 R Hand", "Bip01 R Forearm", "Bip01 L Foot"],
      { hips: "Bip01 Pelvis", rightHand: "Bip01 R Hand", rightForearm: "Bip01 R Forearm", leftFoot: "Bip01 L Foot" }]
  ];

  it.each(styles)("resolves %s names from a bone list", (_name, bones, expected) => {
    for (const [role, bone] of Object.entries(expected)) expect(resolveBone(bones, role)).toBe(bone);
  });

  it.each([
    ["mixamorig:RightForearm"], ["RightForeArm"], ["right_forearm"], ["R_Forearm"], ["forearm.R"], ["DEF-forearm.R"], ["lowerarm_r"], ["Bip01 R Forearm"], ["RIGHTFOREARM"]
  ])("probe path finds the forearm named %s without a bone list", (name) => {
    const { actor, attached } = makeActor([name]);
    const a = attachToBone(actor, { bone: "rightForearm", target: "sleeve" });
    expect(a.bone).toBe(name);
    expect(attached).toHaveLength(1);
  });

  it("keeps left and right apart", () => {
    expect(resolveBone(["RightHand", "LeftHand"], "leftHand")).toBe("LeftHand");
    expect(resolveBone(["hand_l", "hand_r"], "rightHand")).toBe("hand_r");
    expect(resolveBone(["RightForeArm"], "leftForearm")).toBeUndefined();
  });

  it("does not confuse upper arm, forearm and hand", () => {
    const bones = ["RightArm", "RightForeArm", "RightHand"];
    expect(resolveBone(bones, "rightUpperArm")).toBe("RightArm");
    expect(resolveBone(bones, "rightForearm")).toBe("RightForeArm");
    expect(resolveBone(bones, "rightHand")).toBe("RightHand");
  });

  it("the error stays loud and lists the tried names", () => {
    const { actor } = makeActor(["Hips"]);
    let message = "";
    try {
      attachToBone(actor, { bone: "rightForearm", target: "x" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/ATTACH_BONE_NOT_FOUND/);
    expect(message).toMatch(/Tried: rightForearm, mixamorig:RightForeArm/);
    const withList = (() => {
      try {
        attachToBone(actor, { bone: "rightForearm", target: "x", boneNames: ["Hips", "Spine"] });
      } catch (e) {
        return (e as Error).message;
      }
      return "";
    })();
    expect(withList).toMatch(/Tried: rightForearm/);
  });
});
