import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GLTFLoader, LoadContext } from "../../../packages/assets/src";
import { createBoneMask, type BoneMaskSkeleton } from "../../../packages/animation/src/pose/BoneMask.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const soldierPath = resolve(repoRoot, "fixtures/threejs-parity/assets/character/soldier.glb");

async function soldierSkeleton(): Promise<BoneMaskSkeleton> {
  const bytes = readFileSync(soldierPath);
  const url = `data:model/gltf-binary;base64,${bytes.toString("base64")}`;
  const asset = await new GLTFLoader().load({ url, type: "gltf" }, new LoadContext());
  const skin = asset.skins[0]!;
  return {
    jointNames: skin.jointNames,
    parentIndices: skin.skeleton.bones.map((bone) => bone.parentIndex)
  };
}

const indexOf = (skeleton: BoneMaskSkeleton, name: string): number => {
  const index = skeleton.jointNames.indexOf(name);
  if (index < 0) throw new Error(`joint "${name}" not in ${skeleton.jointNames.join(",")}`);
  return index;
};

describe("createBoneMask (PRD-06 T1.5)", () => {
  it("upper-body preset includes arms and excludes LeftUpLeg on the Soldier rig", async () => {
    const skeleton = await soldierSkeleton();
    const mask = createBoneMask({ include: [{ humanoid: "upper-body" }] }, skeleton);
    expect(mask[indexOf(skeleton, "mixamorig:LeftArm")]).toBe(1);
    expect(mask[indexOf(skeleton, "mixamorig:RightHand")]).toBe(1);
    expect(mask[indexOf(skeleton, "mixamorig:Spine2")]).toBe(1);
    expect(mask[indexOf(skeleton, "mixamorig:Head")]).toBe(1);
    expect(mask[indexOf(skeleton, "mixamorig:LeftUpLeg")]).toBe(0);
    expect(mask[indexOf(skeleton, "mixamorig:RightFoot")]).toBe(0);
    expect(mask[indexOf(skeleton, "mixamorig:Hips")]).toBe(0);
  });

  it("lower-body preset covers hips and the leg chains", async () => {
    const skeleton = await soldierSkeleton();
    const mask = createBoneMask({ include: [{ humanoid: "lower-body" }] }, skeleton);
    expect(mask[indexOf(skeleton, "mixamorig:Hips")]).toBe(1);
    expect(mask[indexOf(skeleton, "mixamorig:LeftUpLeg")]).toBe(1);
    expect(mask[indexOf(skeleton, "mixamorig:RightToeBase")]).toBe(1);
    expect(mask[indexOf(skeleton, "mixamorig:Spine")]).toBe(0);
    expect(mask[indexOf(skeleton, "mixamorig:LeftArm")]).toBe(0);
  });

  it("exact names and {bone, descendants} selectors", async () => {
    const skeleton = await soldierSkeleton();
    const exact = createBoneMask({ include: ["mixamorig:LeftHand"] }, skeleton);
    expect(exact[indexOf(skeleton, "mixamorig:LeftHand")]).toBe(1);
    expect(exact[indexOf(skeleton, "mixamorig:LeftHandIndex1")]).toBe(0);

    const subtree = createBoneMask({ include: [{ bone: "mixamorig:LeftHand", descendants: true }] }, skeleton);
    expect(subtree[indexOf(skeleton, "mixamorig:LeftHandIndex1")]).toBe(1);
    expect(subtree[indexOf(skeleton, "mixamorig:LeftHandPinky2")]).toBe(1);
    expect(subtree[indexOf(skeleton, "mixamorig:LeftForeArm")]).toBe(0);
  });

  it("weights falloff scales matching bones and presets", async () => {
    const skeleton = await soldierSkeleton();
    const mask = createBoneMask({
      weights: { "mixamorig:Spine": 0.3, "mixamorig:Spine1": 0.6, "mixamorig:Spine2": 1.0, "left-arm": 0.5 }
    }, skeleton);
    expect(mask[indexOf(skeleton, "mixamorig:Spine")]).toBeCloseTo(0.3);
    expect(mask[indexOf(skeleton, "mixamorig:Spine1")]).toBeCloseTo(0.6);
    expect(mask[indexOf(skeleton, "mixamorig:Spine2")]).toBeCloseTo(1.0);
    expect(mask[indexOf(skeleton, "mixamorig:LeftArm")]).toBeCloseTo(0.5);
    expect(mask[indexOf(skeleton, "mixamorig:LeftUpLeg")]).toBe(0);
  });
});
