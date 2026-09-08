import { measureCertifiedRig } from "../../../tools/locomotion-301/rig-pair-evidence.js";
import { describe, expect, it } from "vitest";
import {
  createHumanoidRetargetingMap,
  type HumanoidRigDefinition,
  type InferHumanoidRigOptions
} from "@aura3d/animation";

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

async function measureRig(rigId: string, file: string, options: InferHumanoidRigOptions = {}): Promise<HumanoidRigDefinition> {
  return (await measureCertifiedRig(rigId, file, options)).rig;
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
    for (const bone of ["leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg"] as const) {
      const scale = map.bindings[bone]?.scale;
      expect(scale, bone).toBeDefined();
      expect(Math.abs(scale! - heightRatio) / heightRatio, bone).toBeLessThan(0.3);
    }
    // Measured divergences (segmentation + hero anatomy, recorded not gated into a false
    // band): short Biped lumbar vs long Mixamo spine (3.0x), hero clavicles (1.7x) and
    // neck (1.5x), fashion-vs-sneaker toe segments (0.7x). Base length-ratio handles each
    // per-bone; overriding them would need pair-specific quality evidence, which a
    // pair-blind registry value cannot encode — so no profile is registered for these.
    // Skin-only node identity excludes the non-joint scene root from the pelvis estimate.
    expect(map.bindings.hips?.source.name).not.toBe("root");
    expect(map.bindings.hips?.scale).toBeCloseTo(0.0062096817327316235, 8);
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
    // Skin-only measurements exclude the decorative BODY mesh. The actual spine
    // and foot segments remain cross-convention measurements, not correction approvals.
    expect(map.bindings.spine?.scale).toBeCloseTo(0.14303482176608912, 8);
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
