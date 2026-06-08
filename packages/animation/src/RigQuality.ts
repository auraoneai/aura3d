import {
  HUMANOID_BONES,
  type HumanoidBoneName,
  type HumanoidRigDefinition
} from "./HumanoidRetargeting.js";

/**
 * Body-acting suitability grade for an (inferred) humanoid rig.
 *
 * - **A** — full humanoid: spine/neck/head, both arms with forearms + hands, both legs with lower
 *   legs + feet. Safe for the full performance vocabulary (gesture, point, walk/run, foot work).
 * - **B** — partial humanoid: enough of the body to act (spine/head + both arms or both legs) but
 *   missing limbs/extremities; the director should avoid the motions that need the missing chain.
 * - **C** — mascot / sparse (~8 mappable nodes): a torso + head + stub arms; head/torso acting only,
 *   no real limb motion.
 * - **D** — not suitable for body acting: no usable skeleton (root/props only).
 */
export type RigGrade = "A" | "B" | "C" | "D";

export interface RigQualityReport {
  readonly grade: RigGrade;
  /** Human-readable justifications for the grade (what was present / missing). */
  readonly reasons: string[];
  readonly hasLegs: boolean;
  readonly hasKnees: boolean;
  readonly hasAnkles: boolean;
  readonly hasFeet: boolean;
  /** Count of canonical humanoid bones that resolve to a real node. */
  readonly mappedBoneCount: number;
}

/** A bone counts as mapped when it resolves to a non-empty target node name. */
function isMapped(rig: HumanoidRigDefinition, bone: HumanoidBoneName): boolean {
  const binding = rig.bones[bone];
  return Boolean(binding && typeof binding.name === "string" && binding.name.length > 0);
}

/**
 * Grade a rig for body-acting suitability. Pure + deterministic — driven only by which canonical
 * {@link HUMANOID_BONES} resolve to nodes, so it works on the output of `inferHumanoidRig` for any
 * skeleton naming convention (Mixamo / Blender / UE / sparse mascot / rich humanoid).
 */
export function gradeRig(rig: HumanoidRigDefinition): RigQualityReport {
  const has = (bone: HumanoidBoneName): boolean => isMapped(rig, bone);
  const mappedBoneCount = HUMANOID_BONES.reduce((n, bone) => (has(bone) ? n + 1 : n), 0);

  // Limb-chain capability (mirrors FootIk's notion of a usable leg chain).
  const hasLegs = (has("leftUpperLeg") || has("leftLowerLeg")) && (has("rightUpperLeg") || has("rightLowerLeg"));
  const hasKnees = has("leftLowerLeg") && has("rightLowerLeg");
  const hasAnkles = has("leftFoot") && has("rightFoot");
  const hasFeet = hasAnkles; // foot node == ankle/foot joint in the canonical skeleton.

  // Spine / head axis.
  const hasSpine = has("spine") || has("chest") || has("upperChest");
  const hasHead = has("head");
  const hasNeck = has("neck");

  // Arm chains.
  const hasBothUpperArms = has("leftUpperArm") && has("rightUpperArm");
  const hasBothForearms = has("leftLowerArm") && has("rightLowerArm");
  const hasBothHands = has("leftHand") && has("rightHand");
  const hasBothLowerLegs = has("leftLowerLeg") && has("rightLowerLeg");

  const reasons: string[] = [];
  reasons.push(`${mappedBoneCount} of ${HUMANOID_BONES.length} canonical humanoid bones mapped`);

  // --- D: no usable skeleton --------------------------------------------------------------------
  // Without a spine/head axis OR both upper arms there is nothing to act with.
  if (mappedBoneCount < 5 || (!hasSpine && !hasHead) || (!hasBothUpperArms && !hasLegs)) {
    reasons.push("not enough body structure to drive body acting (D)");
    if (!hasSpine && !hasHead) reasons.push("missing spine/head axis");
    if (!hasBothUpperArms) reasons.push("missing a pair of upper arms");
    if (!hasLegs) reasons.push("missing a usable pair of legs");
    return { grade: "D", reasons, hasLegs, hasKnees, hasAnkles, hasFeet, mappedBoneCount };
  }

  // --- A: full humanoid -------------------------------------------------------------------------
  const fullUpperBody = hasSpine && hasNeck && hasHead && hasBothUpperArms && hasBothForearms && hasBothHands;
  const fullLowerBody = hasLegs && hasBothLowerLegs && hasFeet;
  if (mappedBoneCount >= 18 && fullUpperBody && fullLowerBody) {
    reasons.push("full humanoid: spine/neck/head + both arms (forearms+hands) + both legs (lower legs+feet) (A)");
    return { grade: "A", reasons, hasLegs, hasKnees, hasAnkles, hasFeet, mappedBoneCount };
  }

  // --- B: partial humanoid ----------------------------------------------------------------------
  // Enough body to act: a spine/head axis plus at least a full pair of arms OR a full pair of legs.
  const usableArms = hasBothUpperArms && hasBothForearms;
  const usableLegs = hasLegs && hasBothLowerLegs;
  if ((hasSpine || hasHead) && (usableArms || usableLegs) && mappedBoneCount >= 10) {
    reasons.push("partial humanoid: body acting possible but a limb chain or extremities are missing (B)");
    if (!fullUpperBody) reasons.push("incomplete upper body (forearms/hands/neck)");
    if (!fullLowerBody) reasons.push("incomplete lower body (lower legs/feet)");
    return { grade: "B", reasons, hasLegs, hasKnees, hasAnkles, hasFeet, mappedBoneCount };
  }

  // --- C: mascot / sparse -----------------------------------------------------------------------
  reasons.push("mascot/sparse rig: head + torso acting only, no real limb chains (C)");
  if (!usableArms) reasons.push("no usable forearm chain on both arms");
  if (!usableLegs) reasons.push("no usable lower-leg chain on both legs");
  return { grade: "C", reasons, hasLegs, hasKnees, hasAnkles, hasFeet, mappedBoneCount };
}
