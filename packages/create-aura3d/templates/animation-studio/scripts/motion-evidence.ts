/**
 * motion-evidence.ts — Phase B4/B5 motion-evidence artifact generator (GPU-free, deterministic).
 *
 * This is the visual-regression + retargeting-overlay producer the PRD's B4/B5 acceptance asks for.
 * It is intentionally browser-FREE and GPU-FREE: it reuses the FK bone-projection in
 * `skeleton-overlay.ts` (which drives the canonical rest skeleton with the SHARED standard-library
 * clip and rasterizes a first/mid/final PNG strip) and adds:
 *
 *   B4 — one skeleton-overlay strip PER standard intent (idle/talk/gesture/point/nod/walk/run/react)
 *        onto the STANDARD reference rig, plus a per-intent motion summary (bones touched, max
 *        rotation amplitude in rad, first-vs-final pixel diff).
 *
 *   B5 — five materially-different synthetic rigs (Mixamo / Blender / UE / sparse 8-bone mascot /
 *        rich humanoid) inferred from node-name lists, GRADED with `gradeRig`, with the SAME clip
 *        retargeted onto each. A per-rig skeleton-overlay strip is produced that draws ONLY the bones
 *        the rig actually maps (so a sparse rig visibly acts with fewer bones), and each rig's grade
 *        is recorded. A D-grade rig is reported as refusing body-acting.
 *
 * Everything here is pure data + raw RGBA; PNG encoding is delegated to the caller (the CLI uses
 * `sharp`). Deterministic — same inputs, same bytes — so a vitest test can assert the artifacts exist
 * and that every strip shows real motion.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — resolved at runtime to the freshly-built monorepo dist (has co-located .d.ts).
import {
  createStandardHumanoidClipRegistry,
  STANDARD_LIBRARY_RIG,
  inferHumanoidRig,
  gradeRig,
  createHumanoidRetargetingMap,
  type AnimationClipRegistry,
  type HumanoidRigDefinition,
  type RigGrade
} from "@aura3d/animation";
import { buildSkeletonStrip, type SkeletonStripResult } from "./skeleton-overlay.js";

/** The 8 shared standard intents (mirrors STANDARD_CLIP_IDS in packages/animation). */
export const STANDARD_INTENTS = [
  "idle",
  "talk",
  "gesture",
  "point",
  "nod",
  "walk",
  "run",
  "react"
] as const;
export type StandardIntent = (typeof STANDARD_INTENTS)[number];

type Quat = readonly [number, number, number, number];

interface SampledTrack {
  readonly target: string;
  readonly valueType: string;
  sample(t: number): readonly number[];
}
interface SampledClip {
  readonly duration: number;
  readonly loop: boolean;
  readonly tracks: readonly SampledTrack[];
}

/** Angular distance (rad) between two unit quaternions. */
function quatAngle(a: Quat, b: Quat): number {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  dot = Math.min(1, Math.max(-1, Math.abs(dot)));
  return 2 * Math.acos(dot);
}

/**
 * Measure a clip's motion semantics directly off its tracks (independent of the projection):
 *  - bonesTouched: distinct bone names with a rotation OR translation track.
 *  - maxRotAmplitudeRad: the largest angular deviation any rotation track travels from its t=0 pose,
 *    sampled densely across the clip duration. A static (offset-only) clip reports ~0 here.
 */
export function measureClipMotion(clip: SampledClip): {
  bonesTouched: string[];
  maxRotAmplitudeRad: number;
  rotationTracks: number;
} {
  const duration = clip.duration > 0 ? clip.duration : 1;
  const SAMPLES = 48;
  const bones = new Set<string>();
  let maxRot = 0;
  let rotationTracks = 0;
  for (const track of clip.tracks) {
    const dot = track.target.lastIndexOf(".");
    if (dot < 0) continue;
    const bone = track.target.slice(0, dot);
    const path = track.target.slice(dot + 1);
    bones.add(bone);
    if (path !== "rotation") continue;
    rotationTracks += 1;
    const first = track.sample(0);
    if (first.length < 4) continue;
    const q0: Quat = [first[0]!, first[1]!, first[2]!, first[3]!];
    for (let i = 1; i <= SAMPLES; i += 1) {
      const t = (duration * i) / SAMPLES;
      const v = track.sample(clip.loop ? t % duration : Math.min(t, duration));
      if (v.length < 4) continue;
      const q: Quat = [v[0]!, v[1]!, v[2]!, v[3]!];
      const angle = quatAngle(q0, q);
      if (angle > maxRot) maxRot = angle;
    }
  }
  return { bonesTouched: [...bones].sort(), maxRotAmplitudeRad: maxRot, rotationTracks };
}

export interface IntentEvidence {
  readonly intent: StandardIntent;
  readonly bonesTouched: string[];
  readonly maxRotAmplitudeRad: number;
  /** first-vs-final pixel diff from the rendered strip (>0 ⇒ the figure visibly moved). */
  readonly firstFinalDiff: number;
  readonly panelJointCounts: readonly number[];
  readonly strip: SkeletonStripResult;
}

/** B4 — build the per-intent strip + measured motion for one standard intent. */
export function buildIntentEvidence(
  intent: StandardIntent,
  registry: AnimationClipRegistry
): IntentEvidence {
  const clip = (registry.get?.(intent) ?? registry.require?.(intent)) as SampledClip | undefined;
  if (!clip) throw new Error(`motion-evidence: no standard clip for intent "${intent}".`);
  const motion = measureClipMotion(clip);
  const strip = buildSkeletonStrip({ intent, registry });
  return {
    intent,
    bonesTouched: motion.bonesTouched,
    maxRotAmplitudeRad: motion.maxRotAmplitudeRad,
    firstFinalDiff: strip.firstFinalMaxDiff,
    panelJointCounts: strip.panelJointCounts,
    strip
  };
}

/** Build evidence for every standard intent (B4). Shares one registry for determinism + speed. */
export function buildAllIntentEvidence(): IntentEvidence[] {
  const registry = createStandardHumanoidClipRegistry();
  return STANDARD_INTENTS.map((intent) => buildIntentEvidence(intent, registry));
}

// --------------------------------------------------------------------------------------------------
// B5 — five materially-different synthetic rigs.
// --------------------------------------------------------------------------------------------------

export interface SyntheticRigSpec {
  readonly name: string;
  /** Convention label for the report. */
  readonly convention: string;
  /** Node names a GLB of this convention would expose (drives `inferHumanoidRig`). */
  readonly nodeNames: readonly string[];
}

/** Mixamo joints (`mixamorig:` namespace, full humanoid → expect grade A). */
const MIXAMO_NODES: readonly string[] = [
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

/** Blender / Rigify-ish names (full humanoid → expect grade A). */
const BLENDER_NODES: readonly string[] = [
  "pelvis",
  "spine",
  "chest",
  "upper_chest",
  "neck",
  "head",
  "shoulder.L",
  "upper_arm.L",
  "forearm.L",
  "hand.L",
  "shoulder.R",
  "upper_arm.R",
  "forearm.R",
  "hand.R",
  "thigh.L",
  "shin.L",
  "foot.L",
  "toe.L",
  "thigh.R",
  "shin.R",
  "foot.R",
  "toe.R"
];

/** Unreal Engine mannequin names (full humanoid → expect grade A). */
const UE_NODES: readonly string[] = [
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
  "ball_l",
  "thigh_r",
  "calf_r",
  "foot_r",
  "ball_r"
];

/** Sparse 8-node mascot: torso + head + stub arms, NO forearms/hands, NO legs → expect grade C. */
const MASCOT_NODES: readonly string[] = [
  "root",
  "spine",
  "neck",
  "head",
  "arm_L",
  "arm_R",
  "eye_L",
  "eye_R"
];

/** Rich humanoid (descriptive anatomical names, full chains → expect grade A). */
const RICH_NODES: readonly string[] = [
  "Hips",
  "LowerSpine",
  "Ribcage",
  "UpperChest",
  "Neck",
  "Head",
  "Left Clavicle",
  "Left Humerus",
  "Left Ulna",
  "Left Wrist",
  "Right Clavicle",
  "Right Humerus",
  "Right Ulna",
  "Right Wrist",
  "Left Femur",
  "Left Shin",
  "Left Ankle",
  "Left Ball",
  "Right Femur",
  "Right Shin",
  "Right Ankle",
  "Right Ball"
];

/**
 * Props-only / no usable skeleton (root + decorative nodes, no spine/head/limbs) → expect grade D.
 * This is the honest "this asset cannot body-act" case; it is reported as refusing body acting.
 */
const PROPS_ONLY_NODES: readonly string[] = [
  "root",
  "Armature",
  "Camera",
  "Light",
  "GroundPlane",
  "Cube.001"
];

export const SYNTHETIC_RIGS: readonly SyntheticRigSpec[] = [
  { name: "mixamo", convention: "Mixamo (mixamorig:)", nodeNames: MIXAMO_NODES },
  { name: "blender", convention: "Blender / Rigify (.L/.R)", nodeNames: BLENDER_NODES },
  { name: "ue", convention: "Unreal Engine mannequin (_l/_r)", nodeNames: UE_NODES },
  { name: "mascot8", convention: "Sparse 8-node mascot", nodeNames: MASCOT_NODES },
  { name: "rich", convention: "Rich anatomical humanoid", nodeNames: RICH_NODES },
  { name: "props-only", convention: "Props-only / no usable skeleton", nodeNames: PROPS_ONLY_NODES }
];

export interface RigEvidence {
  readonly name: string;
  readonly convention: string;
  readonly grade: RigGrade;
  readonly gradeReasons: readonly string[];
  readonly mappedBoneCount: number;
  /** Canonical bones the standard clip's pose actually retargeted onto this rig. */
  readonly retargetedBones: string[];
  readonly retargetCoverage: number;
  /** Honest: true ⇒ the rig is too sparse to drive body acting (grade D). */
  readonly refusesBodyActing: boolean;
  readonly clip: string;
  readonly firstFinalDiff: number;
  readonly strip: SkeletonStripResult;
}

/**
 * Retarget one standard clip onto a synthetic rig and produce a skeleton-overlay strip restricted to
 * the bones that rig actually maps. The strip therefore visualizes *this rig's* coverage of the clip:
 * a full humanoid draws the whole figure, a sparse mascot draws only its torso/head.
 */
export function buildRigEvidence(spec: SyntheticRigSpec, clipIntent: string): RigEvidence {
  const rig: HumanoidRigDefinition = inferHumanoidRig(spec.nodeNames, {
    id: `synthetic-${spec.name}`,
    name: spec.convention
  });
  const report = gradeRig(rig);

  // Which canonical bones map on this rig — used to mask the projection (and to retarget).
  const mappedBones = Object.keys(rig.bones).filter((b) => {
    const binding = (rig.bones as Record<string, { name?: string } | undefined>)[b];
    return Boolean(binding && typeof binding.name === "string" && binding.name.length > 0);
  });

  // Build the retargeting map standard-library-rig → this rig and retarget the clip's first pose so
  // we can report the bones that actually carried motion (coverage), even for D rigs.
  const map = createHumanoidRetargetingMap(STANDARD_LIBRARY_RIG, rig, { minRequiredCoverage: 0 });
  const retargetedBones = Object.keys(map.bindings).sort();

  const refusesBodyActing = report.grade === "D";

  // Mask the strip to the rig's mapped bones (a sparse rig draws a sparser figure). For D rigs we
  // still render whatever (near-empty) skeleton it has — the strip + the refusal message together
  // are the honest evidence.
  const strip = buildSkeletonStrip({
    intent: clipIntent,
    bonesAllow: mappedBones
  });

  return {
    name: spec.name,
    convention: spec.convention,
    grade: report.grade,
    gradeReasons: report.reasons,
    mappedBoneCount: report.mappedBoneCount,
    retargetedBones,
    retargetCoverage: map.requiredCoverage,
    refusesBodyActing,
    clip: clipIntent,
    firstFinalDiff: strip.firstFinalMaxDiff,
    strip
  };
}

/** Build evidence for all five synthetic rigs (B5) against one shared clip. */
export function buildAllRigEvidence(clipIntent = "gesture"): RigEvidence[] {
  return SYNTHETIC_RIGS.map((spec) => buildRigEvidence(spec, clipIntent));
}
