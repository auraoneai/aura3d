import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inferHumanoidRigDetailed, type HumanoidBoneName } from "@aura3d/animation";
import { GLTFLoader, LoadContext } from "../../../packages/assets/src";
import type { Scene } from "@aura3d/scene";

/**
 * E2 box 5 (measurement half): per-rig bone proportions for the certified roster,
 * measured from real GLB bind poses through the real loader — never fabricated.
 * Shoulder/hip widths and limb lengths normalized by height expose which rigs deviate
 * from roster-typical proportions (the only honest basis for a correction profile).
 */
const ROSTER: readonly { readonly rigId: string; readonly file: string }[] = [
  { rigId: "showcaseWalkAnimatedGirl", file: "public/aura-assets/showcaseWalkAnimatedGirl.93872fc2.glb" },
  { rigId: "showcaseAnimatedRunnerHero", file: "public/aura-assets/showcaseAnimatedRunnerHero.9ff4ea51.glb" },
  { rigId: "showcaseRunnerRobot", file: "public/aura-assets/showcaseRunnerRobot.252b3a16.glb" },
  { rigId: "showcaseKenneyOobiPlatformerHero", file: "public/aura-assets/showcaseKenneyOobiPlatformerHero.3f821141.glb" }
];

function dist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe("certified-rig bone proportions", () => {
  it("measures shoulder/hip/limb proportions from real bind poses", async () => {
    for (const rig of ROSTER) {
      const bytes = readFileSync(rig.file);
      const url = `data:model/gltf-binary;base64,${bytes.toString("base64")}`;
      const asset = await new GLTFLoader().load({ url, type: "gltf" }, new LoadContext());
      const scene = asset.createScene();
      scene.updateWorldTransforms();
      const names: string[] = [];
      scene.traverse((node) => names.push(node.name));
      const inference = inferHumanoidRigDetailed(names, { id: rig.rigId });
      const nodeFor = (name: HumanoidBoneName): string | undefined => inference.rig.bones[name]?.name;
      const joints: Record<string, [number, number, number]> = {};
      scene.traverse((node) => {
        const m = node.transform.worldMatrix;
        joints[node.name] = [m[12]!, m[13]!, m[14]!];
      });
      const point = (name: HumanoidBoneName): [number, number, number] | undefined => {
        const node = nodeFor(name);
        return node === undefined ? undefined : joints[node];
      };
      const segment = (a: HumanoidBoneName, b: HumanoidBoneName): number | undefined => {
        const pa = point(a);
        const pb = point(b);
        return pa && pb ? dist(pa, pb) : undefined;
      };
      const ys = Object.values(joints).map((p) => p[1]);
      const height = Math.max(...ys) - Math.min(...ys);
      const head = point("head");
      const hips = point("hips");
      const proportions = {
        rig: rig.rigId,
        missingRequired: inference.missingRequired,
        height,
        // Shoulder width uses the glenohumeral joints (upper-arm origins): clavicle/shoulder
        // slots sit near the neck on Biped-style rigs and under-read the true line.
        shoulderWidth: segment("leftUpperArm", "rightUpperArm"),
        hipWidth: segment("leftUpperLeg", "rightUpperLeg"),
        upperArm: segment("leftLowerArm", "leftUpperArm"),
        forearm: segment("leftHand", "leftLowerArm"),
        thigh: segment("leftLowerLeg", "leftUpperLeg"),
        calf: segment("leftFoot", "leftLowerLeg"),
        torso: head && hips ? dist(head, hips) : undefined
      };
      // eslint-disable-next-line no-console
      console.log("rig-proportions", JSON.stringify(proportions));
      expect(height).toBeGreaterThan(0);
    }
  });
});
