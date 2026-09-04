import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createHumanoidRetargetingMap,
  inferHumanoidRigDetailed,
  type HumanoidBoneName,
  type HumanoidRigDefinition,
  type InferHumanoidRigOptions
} from "@aura3d/animation";
import { GLTFLoader, LoadContext } from "../../../packages/assets/src";
import type { Scene } from "@aura3d/scene";

/**
 * E2 box 5 (map half): real cross-rig retarget maps between certified rigs, built from
 * measured bind-pose bone lengths through the real loader + name inference. Lengths use
 * one consistent convention on both sides (joint → primary humanoid child in bind world),
 * so ratios carry native units (cm girl ↔ m runner) without a fudge factor. extraAliases
 * are the documented mechanism for naming gaps (robot BODY/FEET slots), recorded here —
 * not silent inference surgery.
 */
const GIRL = "public/aura-assets/showcaseWalkAnimatedGirl.93872fc2.glb";
const RUNNER = "public/aura-assets/showcaseAnimatedRunnerHero.9ff4ea51.glb";
const ROBOT = "public/aura-assets/showcaseRunnerRobot.252b3a16.glb";
const KENNEY = "public/aura-assets/showcaseKenneyOobiPlatformerHero.3f821141.glb";

const CHILD: Partial<Record<HumanoidBoneName, HumanoidBoneName>> = {
  hips: "spine",
  spine: "chest",
  chest: "upperChest",
  upperChest: "neck",
  neck: "head",
  leftShoulder: "leftUpperArm",
  leftUpperArm: "leftLowerArm",
  leftLowerArm: "leftHand",
  rightShoulder: "rightUpperArm",
  rightUpperArm: "rightLowerArm",
  rightLowerArm: "rightHand",
  leftUpperLeg: "leftLowerLeg",
  leftLowerLeg: "leftFoot",
  leftFoot: "leftToes",
  rightUpperLeg: "rightLowerLeg",
  rightLowerLeg: "rightFoot",
  rightFoot: "rightToes"
};

/** Inverse of CHILD: terminal bones (head/hands/toes) measure toward their parent. */
const PARENT: Partial<Record<HumanoidBoneName, HumanoidBoneName>> = Object.fromEntries(
  Object.entries(CHILD).map(([parent, child]) => [child, parent])
) as Partial<Record<HumanoidBoneName, HumanoidBoneName>>;

async function measureRig(
  rigId: string,
  file: string,
  inferenceOptions: InferHumanoidRigOptions = {}
): Promise<HumanoidRigDefinition> {
  const bytes = readFileSync(file);
  const url = `data:model/gltf-binary;base64,${bytes.toString("base64")}`;
  const asset = await new GLTFLoader().load({ url, type: "gltf" }, new LoadContext());
  const scene: Scene = asset.createScene();
  scene.updateWorldTransforms();
  const names: string[] = [];
  const positions = new Map<string, [number, number, number]>();
  scene.traverse((node) => {
    names.push(node.name);
    const m = node.transform.worldMatrix;
    positions.set(node.name, [m[12]!, m[13]!, m[14]!]);
  });
  const inference = inferHumanoidRigDetailed(names, { id: rigId, ...inferenceOptions });
  const bones: HumanoidRigDefinition["bones"] = {};
  for (const [bone, binding] of Object.entries(inference.rig.bones)) {
    const slot = bone as HumanoidBoneName;
    // Length convention (same both sides, so ratios are meaningful): toward the primary
    // humanoid child; terminal bones (head/hands/toes) and bones with an unmapped child
    // measure toward their parent instead — never left unknown when a neighbor exists.
    const childSlot = CHILD[slot];
    const parentSlot = PARENT[slot];
    const neighborNode = (childSlot === undefined
      ? undefined
      : inference.rig.bones[childSlot]?.name)
      ?? (parentSlot === undefined ? undefined : inference.rig.bones[parentSlot]?.name);
    const a = positions.get(binding.name);
    const b = neighborNode === undefined ? undefined : positions.get(neighborNode);
    const length = a && b
      ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
      : undefined;
    (bones as Record<string, { name: string; length?: number }>)[
      bone
    ] = length === undefined || length <= 0 ? { name: binding.name } : { name: binding.name, length };
  }
  return { id: rigId, bones };
}

function summarizeScales(map: ReturnType<typeof createHumanoidRetargetingMap>): Record<string, number> {
  const rows: Record<string, number> = {};
  for (const [bone, binding] of Object.entries(map.bindings)) {
    if (binding) rows[bone] = binding.scale;
  }
  return rows;
}

describe("certified cross-rig retarget maps", () => {
  it("maps walk-girl onto runner-hero with uniform height-ratio scales", async () => {
    const girl = await measureRig("showcaseWalkAnimatedGirl", GIRL);
    const runner = await measureRig("showcaseAnimatedRunnerHero", RUNNER);
    const map = createHumanoidRetargetingMap(girl, runner);
    // eslint-disable-next-line no-console
    console.log("girl-to-runner", JSON.stringify({ ok: map.ok, coverage: map.coverage, scales: summarizeScales(map) }));
    expect(map.ok).toBe(true);
    expect(map.coverage).toBeCloseTo(1, 1);
    // Isometric roster pair (1.78m / 1.68m): limb + hip bones scale near the height ratio.
    const heightRatio = 1.784580555079753 / 168.2019299866406;
    for (const bone of ["hips", "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg"] as const) {
      const scale = map.bindings[bone]?.scale;
      expect(scale, bone).toBeDefined();
      expect(Math.abs(scale! - heightRatio) / heightRatio, bone).toBeLessThan(0.3);
    }
    // Measured divergences (segmentation + hero anatomy, recorded not gated into a false
    // band): short Biped lumbar vs long Mixamo spine (3.0x), hero clavicles (1.7x) and
    // neck (1.5x), fashion-vs-sneaker toe segments (0.7x). Base length-ratio handles each
    // per-bone; overriding them would need pair-specific quality evidence, which a
    // pair-blind registry value cannot encode — so no profile is registered for these.
    expect(map.bindings.spine?.scale).toBeCloseTo(0.03204, 4);
    expect(map.bindings.neck?.scale).toBeCloseTo(0.01574, 4);
    expect(map.bindings.leftShoulder?.scale).toBeCloseTo(0.01814, 4);
    expect(map.bindings.leftFoot?.scale).toBeCloseTo(0.00757, 4);
  });

  it("maps walk-girl onto the robot with documented naming aliases", async () => {
    const girl = await measureRig("showcaseWalkAnimatedGirl", GIRL);
    const robot = await measureRig("showcaseRunnerRobot", ROBOT, {
      extraAliases: { spine: ["body"], leftFoot: ["feet"], rightFoot: ["feet"] }
    });
    const map = createHumanoidRetargetingMap(girl, robot);
    // eslint-disable-next-line no-console
    console.log("girl-to-robot", JSON.stringify({ ok: map.ok, coverage: map.coverage, scales: summarizeScales(map) }));
    expect(map.ok).toBe(true);
    // Short-limbed mech (16.55 units tall): limb scales sit 0.64–0.93x of the height ratio —
    // real anatomy, handled per-bone by the base ratio, not an error to correct away.
    const heightRatio = 16.55038978515625 / 168.2019299866406;
    for (const bone of ["leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg"] as const) {
      const scale = map.bindings[bone]?.scale;
      expect(scale, bone).toBeDefined();
      expect(Math.abs(scale! - heightRatio) / heightRatio, bone).toBeLessThan(0.5);
    }
    // Segmentation mismatches (cross-convention artifacts, recorded): robot spine measures
    // BODY→hips (whole torso, no chest slot) against the girl's single lumbar segment, and
    // robot feet measure ankle-height (no toe slots) against girl toe segments. Pinning
    // these to the height ratio would be pair-specific editorializing, so they stay measured.
    expect(map.bindings.spine?.scale).toBeCloseTo(1.09908, 4);
    expect(map.bindings.leftFoot?.scale).toBeCloseTo(0.16373, 4);
  });

  it("reports the rigid-part mascot as below coverage instead of faking a map", async () => {
    const girl = await measureRig("showcaseWalkAnimatedGirl", GIRL);
    const kenney = await measureRig("showcaseKenneyOobiPlatformerHero", KENNEY);
    const map = createHumanoidRetargetingMap(girl, kenney);
    // eslint-disable-next-line no-console
    console.log("girl-to-kenney", JSON.stringify({ ok: map.ok, coverage: map.coverage, requiredCoverage: map.requiredCoverage }));
    // Kenney limbs are rigid object-level parts (no knees/elbows/hands in the node set),
    // so the humanoid path honestly reports low coverage instead of a confident bad map.
    expect(map.ok).toBe(false);
    expect(map.diagnostics.some((d) => d.code === "HUMANOID_RETARGET_COVERAGE_LOW")).toBe(true);
  });
});
