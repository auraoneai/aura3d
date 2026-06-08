import { describe, expect, it } from "vitest";
import {
  gradeRig,
  inferHumanoidRig,
  type RigGrade
} from "../../../packages/animation/src/index.js";

// Bone-name sets reused from humanoid-bone-inference.test.ts so grading is tested on the same
// real-world skeleton conventions the inference handles.

const MIXAMO_NODES = [
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

const BLENDER_NODES = [
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

const UE_NODES = [
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

// A "rich humanoid" with the full canonical chain incl. upperChest + toes (top grade target).
const RICH_HUMANOID_NODES = [
  "Hips",
  "Spine",
  "Chest",
  "UpperChest",
  "Neck",
  "Head",
  "LeftShoulder",
  "LeftUpperArm",
  "LeftLowerArm",
  "LeftHand",
  "RightShoulder",
  "RightUpperArm",
  "RightLowerArm",
  "RightHand",
  "LeftUpperLeg",
  "LeftLowerLeg",
  "LeftFoot",
  "LeftToes",
  "RightUpperLeg",
  "RightLowerLeg",
  "RightFoot",
  "RightToes"
];

// 8-node mascot: torso + head + stub arms, NO legs/forearms/hands -> sparse "C".
const MASCOT_NODES = [
  "Hips",
  "Spine",
  "Chest",
  "Neck",
  "Head",
  "LeftArm",
  "RightArm",
  "Tail"
];

// A non-skeleton node list -> nothing to act with -> "D".
const NON_RIG_NODES = ["RootNode", "Geometry", "Camera", "Light", "Mesh"];

describe("gradeRig — body-acting suitability grades", () => {
  const cases: ReadonlyArray<{ label: string; nodes: readonly string[]; expected: RigGrade }> = [
    { label: "Mixamo (full humanoid)", nodes: MIXAMO_NODES, expected: "A" },
    { label: "Blender .L/.R (full humanoid)", nodes: BLENDER_NODES, expected: "A" },
    { label: "Unreal Engine (full humanoid)", nodes: UE_NODES, expected: "A" },
    { label: "Rich canonical humanoid (upperChest+toes)", nodes: RICH_HUMANOID_NODES, expected: "A" },
    { label: "8-node mascot (sparse)", nodes: MASCOT_NODES, expected: "C" },
    { label: "Non-skeleton node list", nodes: NON_RIG_NODES, expected: "D" }
  ];

  for (const { label, nodes, expected } of cases) {
    it(`grades "${label}" as ${expected}`, () => {
      const rig = inferHumanoidRig(nodes, { id: label });
      const report = gradeRig(rig);
      expect(report.grade, `${label}: reasons=${report.reasons.join("; ")}`).toBe(expected);
      expect(report.reasons.length).toBeGreaterThan(0);
    });
  }

  it("A-grade rigs report full legs/knees/ankles/feet capability", () => {
    for (const nodes of [MIXAMO_NODES, BLENDER_NODES, UE_NODES, RICH_HUMANOID_NODES]) {
      const report = gradeRig(inferHumanoidRig(nodes, { id: "a" }));
      expect(report.grade).toBe("A");
      expect(report.hasLegs).toBe(true);
      expect(report.hasKnees).toBe(true);
      expect(report.hasAnkles).toBe(true);
      expect(report.hasFeet).toBe(true);
      expect(report.mappedBoneCount).toBeGreaterThanOrEqual(18);
    }
  });

  it("the 8-node mascot is reported as having no usable legs and a low mapped-bone count", () => {
    const report = gradeRig(inferHumanoidRig(MASCOT_NODES, { id: "mascot" }));
    expect(report.grade).toBe("C");
    expect(report.hasLegs).toBe(false);
    expect(report.hasFeet).toBe(false);
    expect(report.mappedBoneCount).toBeLessThan(12);
  });

  it("a partial humanoid (full arms + spine/head, no legs) grades B", () => {
    // Upper body only: spine/neck/head + both full arms, but no leg chain at all.
    const upperOnly = [
      "Hips",
      "Spine",
      "Chest",
      "Neck",
      "Head",
      "LeftShoulder",
      "LeftUpperArm",
      "LeftLowerArm",
      "LeftHand",
      "RightShoulder",
      "RightUpperArm",
      "RightLowerArm",
      "RightHand"
    ];
    const report = gradeRig(inferHumanoidRig(upperOnly, { id: "upper-only" }));
    expect(report.grade, report.reasons.join("; ")).toBe("B");
    expect(report.hasLegs).toBe(false);
  });

  it("D-grade rigs are flagged unsuitable for body acting in their reasons", () => {
    const report = gradeRig(inferHumanoidRig(NON_RIG_NODES, { id: "nope" }));
    expect(report.grade).toBe("D");
    expect(report.reasons.some((r) => /body acting/i.test(r))).toBe(true);
  });
});
