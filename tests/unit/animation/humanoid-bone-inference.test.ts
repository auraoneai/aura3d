import { describe, expect, it } from "vitest";
import {
  inferHumanoidRig,
  inferHumanoidRigDetailed,
  type HumanoidBoneName,
  type HumanoidRigDefinition
} from "../../../packages/animation/src/index.js";

const REQUIRED_FOR_TEST: readonly HumanoidBoneName[] = [
  "hips",
  "spine",
  "head",
  "leftUpperArm",
  "rightUpperArm",
  "leftUpperLeg",
  "rightUpperLeg"
];

function assertRequiredMapped(rig: HumanoidRigDefinition, label: string): void {
  for (const bone of REQUIRED_FOR_TEST) {
    expect(rig.bones[bone], `${label}: expected "${bone}" to be mapped`).toBeDefined();
    expect(rig.bones[bone]?.name, `${label}: "${bone}" must reference a node`).toBeTruthy();
  }
  // Left and right of the same group must resolve to different nodes.
  expect(rig.bones.leftUpperArm?.name).not.toBe(rig.bones.rightUpperArm?.name);
  expect(rig.bones.leftUpperLeg?.name).not.toBe(rig.bones.rightUpperLeg?.name);
}

describe("inferHumanoidRig", () => {
  it("maps a Mixamo skeleton (mixamorig: namespace)", () => {
    const nodes = [
      "mixamorig:Hips",
      "mixamorig:Spine",
      "mixamorig:Spine1",
      "mixamorig:Spine2",
      "mixamorig:Neck",
      "mixamorig:Head",
      "mixamorig:LeftShoulder",
      "mixamorig:LeftArm",
      "mixamorig:LeftForeArm",
      "mixamorig:LeftHand",
      "mixamorig:RightShoulder",
      "mixamorig:RightArm",
      "mixamorig:RightForeArm",
      "mixamorig:RightHand",
      "mixamorig:LeftUpLeg",
      "mixamorig:LeftLeg",
      "mixamorig:LeftFoot",
      "mixamorig:LeftToeBase",
      "mixamorig:RightUpLeg",
      "mixamorig:RightLeg",
      "mixamorig:RightFoot",
      "mixamorig:RightToeBase"
    ];
    const rig = inferHumanoidRig(nodes, { id: "mixamo" });
    assertRequiredMapped(rig, "mixamo");
    expect(rig.bones.hips?.name).toBe("mixamorig:Hips");
    expect(rig.bones.head?.name).toBe("mixamorig:Head");
    expect(rig.bones.leftUpperArm?.name).toBe("mixamorig:LeftArm");
    expect(rig.bones.rightUpperArm?.name).toBe("mixamorig:RightArm");
    expect(rig.bones.leftLowerArm?.name).toBe("mixamorig:LeftForeArm");
    expect(rig.bones.leftUpperLeg?.name).toBe("mixamorig:LeftUpLeg");
    expect(rig.bones.leftFoot?.name).toBe("mixamorig:LeftFoot");
  });

  it("maps a Sketchfab/Blender skeleton (Hip_00 / Spine1 / L_Shoulder / L_Leg_Upper_01 / Head)", () => {
    const nodes = [
      "Hip_00",
      "Spine1",
      "Spine2",
      "Spine3",
      "Neck",
      "Head",
      "L_Shoulder",
      "L_Arm_Upper_01",
      "L_Arm_Lower_01",
      "L_Hand",
      "R_Shoulder",
      "R_Arm_Upper_01",
      "R_Arm_Lower_01",
      "R_Hand",
      "L_Leg_Upper_01",
      "L_Leg_Lower_01",
      "L_Foot",
      "R_Leg_Upper_01",
      "R_Leg_Lower_01",
      "R_Foot"
    ];
    const rig = inferHumanoidRig(nodes, { id: "sketchfab" });
    assertRequiredMapped(rig, "sketchfab");
    expect(rig.bones.hips?.name).toBe("Hip_00");
    expect(rig.bones.head?.name).toBe("Head");
    expect(rig.bones.leftShoulder?.name).toBe("L_Shoulder");
    expect(rig.bones.leftUpperArm?.name).toBe("L_Arm_Upper_01");
    expect(rig.bones.leftLowerArm?.name).toBe("L_Arm_Lower_01");
    expect(rig.bones.leftUpperLeg?.name).toBe("L_Leg_Upper_01");
    expect(rig.bones.leftLowerLeg?.name).toBe("L_Leg_Lower_01");
    expect(rig.bones.rightUpperLeg?.name).toBe("R_Leg_Upper_01");
    expect(rig.bones.leftFoot?.name).toBe("L_Foot");
  });

  it("maps a UE-ish skeleton (pelvis / upperarm_l / thigh_r / calf_l)", () => {
    const nodes = [
      "pelvis",
      "spine_01",
      "spine_02",
      "spine_03",
      "neck_01",
      "head",
      "clavicle_l",
      "upperarm_l",
      "lowerarm_l",
      "hand_l",
      "clavicle_r",
      "upperarm_r",
      "lowerarm_r",
      "hand_r",
      "thigh_l",
      "calf_l",
      "foot_l",
      "thigh_r",
      "calf_r",
      "foot_r"
    ];
    const rig = inferHumanoidRig(nodes, { id: "ue" });
    assertRequiredMapped(rig, "ue");
    expect(rig.bones.hips?.name).toBe("pelvis");
    expect(rig.bones.leftUpperArm?.name).toBe("upperarm_l");
    expect(rig.bones.rightUpperArm?.name).toBe("upperarm_r");
    expect(rig.bones.leftLowerLeg?.name).toBe("calf_l");
    expect(rig.bones.rightUpperLeg?.name).toBe("thigh_r");
  });

  it("maps a Blender .L/.R suffix skeleton (Armature prefix)", () => {
    const nodes = [
      "Armature|Hips",
      "Armature|Spine",
      "Armature|Chest",
      "Armature|Neck",
      "Armature|Head",
      "Armature|Shoulder.L",
      "Armature|UpperArm.L",
      "Armature|LowerArm.L",
      "Armature|Hand.L",
      "Armature|Shoulder.R",
      "Armature|UpperArm.R",
      "Armature|LowerArm.R",
      "Armature|Hand.R",
      "Armature|Thigh.L",
      "Armature|Shin.L",
      "Armature|Foot.L",
      "Armature|Thigh.R",
      "Armature|Shin.R",
      "Armature|Foot.R"
    ];
    const rig = inferHumanoidRig(nodes, { id: "blender" });
    assertRequiredMapped(rig, "blender");
    expect(rig.bones.hips?.name).toBe("Armature|Hips");
    expect(rig.bones.leftUpperArm?.name).toBe("Armature|UpperArm.L");
    expect(rig.bones.rightUpperArm?.name).toBe("Armature|UpperArm.R");
    expect(rig.bones.leftUpperLeg?.name).toBe("Armature|Thigh.L");
    expect(rig.bones.rightLowerLeg?.name).toBe("Armature|Shin.R");
  });

  it("wires the aliases field with the runner-up candidates and reports missing-required", () => {
    const detail = inferHumanoidRigDetailed(["RootNode", "Geometry", "Camera"], { id: "garbage" });
    // None of the required bones can be mapped from a non-skeleton node list.
    expect(detail.missingRequired.length).toBeGreaterThan(0);

    // A skeleton with two plausible hip nodes records the loser as an alias.
    const detail2 = inferHumanoidRigDetailed(
      ["Hips", "Pelvis", "Spine", "Head", "LeftArm", "RightArm", "LeftUpLeg", "RightUpLeg"],
      { id: "alias-test" }
    );
    const hips = detail2.rig.bones.hips;
    expect(hips).toBeDefined();
    // Both "Hips" and "Pelvis" are valid hip candidates; one wins and the other is recorded as an
    // alias (which name wins is a scoring detail — what matters is the aliases field is wired).
    expect(["Hips", "Pelvis"]).toContain(hips?.name);
    const allHipCandidates = [hips?.name, ...(hips?.aliases ?? [])];
    expect(allHipCandidates).toContain("Hips");
    expect(allHipCandidates).toContain("Pelvis");
    expect(hips?.aliases?.length ?? 0).toBeGreaterThan(0);
  });
});
