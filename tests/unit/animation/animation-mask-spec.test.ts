import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createBoneMask } from "@aura3d/animation/lanes";
import { GLTFLoader, LoadContext, createGLTFSceneAnimationRuntime } from "../../../packages/assets/src";
import { toPoseBoneMaskSpec } from "../../../packages/engine/src/agent-api/animationMask";

/**
 * The public `AuraBoneMaskSpec` ({ include, exclude, humanoid }) must reach the pose mixer as a mask that
 * actually selects bones; before the adapter, `humanoid` and `exclude` were dropped and the mask was all zero.
 */
async function soldierJoints(): Promise<readonly string[]> {
  const url = `data:model/gltf-binary;base64,${readFileSync("fixtures/threejs-parity/assets/character/soldier.glb").toString("base64")}`;
  const asset = await new GLTFLoader().load({ url, type: "gltf" }, new LoadContext());
  return createGLTFSceneAnimationRuntime({ scene: asset.createScene(), clips: asset.animations }).skeletonJointNames();
}

describe("toPoseBoneMaskSpec", () => {
  it("humanoid 'upper-body' selects the arms and spine and leaves hips and legs at zero", async () => {
    const names = await soldierJoints();
    const mask = createBoneMask(toPoseBoneMaskSpec({ humanoid: "upper-body" }), { jointNames: names });
    const weight = (bone: string) => mask[names.indexOf(bone)]!;
    expect(weight("mixamorig:RightHand")).toBe(1);
    expect(weight("mixamorig:LeftForeArm")).toBe(1);
    expect(weight("mixamorig:Spine1")).toBe(1);
    expect(weight("mixamorig:Head")).toBe(1);
    expect(weight("mixamorig:Hips")).toBe(0);
    expect(weight("mixamorig:LeftUpLeg")).toBe(0);
    expect(weight("mixamorig:RightFoot")).toBe(0);
  });

  it("'arms' is both arms; 'lower-body' is the legs", async () => {
    const names = await soldierJoints();
    const arms = createBoneMask(toPoseBoneMaskSpec({ humanoid: "arms" }), { jointNames: names });
    expect(arms[names.indexOf("mixamorig:LeftHand")]).toBe(1);
    expect(arms[names.indexOf("mixamorig:RightArm")]).toBe(1);
    expect(arms[names.indexOf("mixamorig:Spine")]).toBe(0);
    const lower = createBoneMask(toPoseBoneMaskSpec({ humanoid: "lower-body" }), { jointNames: names });
    // Hips are not asserted: name inference resolves the Soldier's hips slot to its `root` alias, not `mixamorig:Hips`.
    expect(lower[names.indexOf("mixamorig:LeftUpLeg")]).toBe(1);
    expect(lower[names.indexOf("mixamorig:LeftFoot")]).toBe(1);
    expect(lower[names.indexOf("mixamorig:RightHand")]).toBe(0);
  });

  it("include names combine with a preset, and exclude wins", async () => {
    const names = await soldierJoints();
    const mask = createBoneMask(
      toPoseBoneMaskSpec({ include: ["mixamorig:Hips"], humanoid: "upper-body", exclude: ["mixamorig:LeftHand", "mixamorig:Head"] }),
      { jointNames: names }
    );
    expect(mask[names.indexOf("mixamorig:Hips")]).toBe(1);
    expect(mask[names.indexOf("mixamorig:RightHand")]).toBe(1);
    expect(mask[names.indexOf("mixamorig:LeftHand")]).toBe(0);
    expect(mask[names.indexOf("mixamorig:Head")]).toBe(0);
  });

  it("passes pose-shaped specs through unchanged", () => {
    const spec = { include: [{ humanoid: "head" as const }], weights: { Spine: 0.5 } };
    expect(toPoseBoneMaskSpec(spec)).toEqual(spec);
  });
});
