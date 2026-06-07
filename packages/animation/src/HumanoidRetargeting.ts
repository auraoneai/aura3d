import type {
  AnimationPose,
  AnimationPoseTransform,
  AnimationQuaternion,
  AnimationVector3
} from "./AnimationController.js";

export const HUMANOID_BONES = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes"
] as const;

export type HumanoidBoneName = typeof HUMANOID_BONES[number];
export type HumanoidAxis = "x" | "y" | "z" | "-x" | "-y" | "-z";
export type HumanoidRigUnits = "meters" | "centimeters" | "unknown" | (string & {});

export const REQUIRED_HUMANOID_BONES: readonly HumanoidBoneName[] = [
  "hips",
  "spine",
  "head",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot"
];

export interface HumanoidBoneBinding {
  readonly name: string;
  readonly path?: string;
  readonly parent?: HumanoidBoneName | string;
  readonly length?: number;
  readonly position?: AnimationVector3;
  readonly rotation?: AnimationQuaternion;
  readonly aliases?: readonly string[];
}

export interface HumanoidRigDefinition {
  readonly id: string;
  readonly name?: string;
  readonly bones: Partial<Record<HumanoidBoneName, HumanoidBoneBinding>>;
  readonly scale?: number;
  readonly units?: HumanoidRigUnits;
  readonly facingAxis?: HumanoidAxis;
  readonly restPose?: Partial<Record<HumanoidBoneName, AnimationPoseTransform>>;
  readonly metadata?: Record<string, unknown>;
}

export type HumanoidRetargetingDiagnosticSeverity = "info" | "warning" | "error";

export interface HumanoidRetargetingDiagnostic {
  readonly severity: HumanoidRetargetingDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly rigId?: string;
  readonly bone?: HumanoidBoneName;
  readonly sourceBone?: string;
  readonly targetBone?: string;
}

export interface HumanoidRigDiagnostics {
  readonly rigId: string;
  readonly ok: boolean;
  readonly coverage: number;
  readonly requiredCoverage: number;
  readonly presentRequiredBones: number;
  readonly requiredBones: number;
  readonly diagnostics: readonly HumanoidRetargetingDiagnostic[];
}

export interface HumanoidRetargetingOptions {
  readonly minRequiredCoverage?: number;
  readonly expectedFacingAxis?: HumanoidAxis;
  readonly expectedUnits?: HumanoidRigUnits;
  readonly requireRestPose?: boolean;
  readonly requireToes?: boolean;
}

export interface HumanoidBoneRetargetBinding {
  readonly bone: HumanoidBoneName;
  readonly source: HumanoidBoneBinding;
  readonly target: HumanoidBoneBinding;
  readonly scale: number;
}

export interface HumanoidRetargetingMap {
  readonly sourceRigId: string;
  readonly targetRigId: string;
  readonly ok: boolean;
  readonly coverage: number;
  readonly requiredCoverage: number;
  readonly bindings: Partial<Record<HumanoidBoneName, HumanoidBoneRetargetBinding>>;
  readonly diagnostics: readonly HumanoidRetargetingDiagnostic[];
}

export interface RetargetHumanoidPoseOptions {
  readonly includeUnmappedSourceBones?: boolean;
  readonly includeSemanticBoneNames?: boolean;
  readonly scaleRootMotion?: boolean;
}

export interface CartoonHumanoidRetargetingOptions extends HumanoidRetargetingOptions {
  readonly requiredClips?: readonly string[];
  readonly availableClips?: readonly string[];
  readonly mouthBlendshapeNames?: readonly string[];
  readonly retargetMapProvided?: boolean;
}

export interface CartoonHumanoidRetargetingDiagnostics extends HumanoidRigDiagnostics {
  readonly kind: "cartoon-humanoid-retargeting-diagnostics";
  readonly mouthReady: boolean;
  readonly clipReady: boolean;
  readonly retargetMapProvided: boolean;
}

export function analyzeHumanoidRig(
  rig: HumanoidRigDefinition,
  options: HumanoidRetargetingOptions = {}
): HumanoidRigDiagnostics {
  const diagnostics: HumanoidRetargetingDiagnostic[] = [];
  const requiredBones: readonly HumanoidBoneName[] = options.requireToes
    ? [...REQUIRED_HUMANOID_BONES, "leftToes", "rightToes"]
    : REQUIRED_HUMANOID_BONES;
  let presentRequiredBones = 0;

  if (!rig.id) {
    diagnostics.push({
      severity: "error",
      code: "HUMANOID_RIG_ID_MISSING",
      message: "Humanoid rigs must have a stable id."
    });
  }

  for (const bone of requiredBones) {
    if (rig.bones[bone]) {
      presentRequiredBones += 1;
      continue;
    }

    diagnostics.push({
      severity: "error",
      code: "HUMANOID_REQUIRED_BONE_MISSING",
      message: `Required humanoid bone "${bone}" is missing.`,
      rigId: rig.id,
      bone
    });
  }

  for (const pair of HUMANOID_SIDE_PAIRS) {
    const left = rig.bones[pair.left];
    const right = rig.bones[pair.right];
    if ((left && !right) || (!left && right)) {
      diagnostics.push({
        severity: "warning",
        code: "HUMANOID_SIDE_ASYMMETRY",
        message: `Humanoid side pair "${pair.left}" and "${pair.right}" is incomplete.`,
        rigId: rig.id,
        bone: left ? pair.right : pair.left
      });
    }
  }

  const duplicateNames = findDuplicateBoneNames(rig);
  for (const name of duplicateNames) {
    diagnostics.push({
      severity: "warning",
      code: "HUMANOID_DUPLICATE_BONE_NAME",
      message: `Bone node "${name}" is assigned to multiple humanoid slots.`,
      rigId: rig.id
    });
  }

  for (const bone of HUMANOID_BONES) {
    const binding = rig.bones[bone];
    if (!binding) continue;

    if (!binding.name) {
      diagnostics.push({
        severity: "error",
        code: "HUMANOID_BONE_NODE_NAME_MISSING",
        message: `Humanoid bone "${bone}" must reference a node name.`,
        rigId: rig.id,
        bone
      });
    }

    if (binding.length !== undefined && (!Number.isFinite(binding.length) || binding.length <= 0)) {
      diagnostics.push({
        severity: "warning",
        code: "HUMANOID_BONE_LENGTH_INVALID",
        message: `Humanoid bone "${bone}" has an invalid length.`,
        rigId: rig.id,
        bone
      });
    }

    if (options.requireRestPose && !rig.restPose?.[bone]) {
      diagnostics.push({
        severity: "warning",
        code: "HUMANOID_REST_POSE_BONE_MISSING",
        message: `Rest pose is missing humanoid bone "${bone}".`,
        rigId: rig.id,
        bone
      });
    }
  }

  if (rig.scale !== undefined && (!Number.isFinite(rig.scale) || rig.scale <= 0)) {
    diagnostics.push({
      severity: "error",
      code: "HUMANOID_SCALE_INVALID",
      message: "Humanoid rig scale must be a positive finite number.",
      rigId: rig.id
    });
  }

  if (options.expectedFacingAxis && rig.facingAxis && rig.facingAxis !== options.expectedFacingAxis) {
    diagnostics.push({
      severity: "warning",
      code: "HUMANOID_FACING_AXIS_MISMATCH",
      message: `Humanoid rig faces "${rig.facingAxis}", expected "${options.expectedFacingAxis}".`,
      rigId: rig.id
    });
  }

  if (options.expectedUnits && rig.units && rig.units !== options.expectedUnits) {
    diagnostics.push({
      severity: "info",
      code: "HUMANOID_UNITS_MISMATCH",
      message: `Humanoid rig uses "${rig.units}", expected "${options.expectedUnits}". Retargeting may need scale compensation.`,
      rigId: rig.id
    });
  }

  const requiredCoverage = requiredBones.length > 0 ? presentRequiredBones / requiredBones.length : 1;
  const coverage = HUMANOID_BONES.filter((bone) => rig.bones[bone]).length / HUMANOID_BONES.length;
  const minCoverage = options.minRequiredCoverage ?? 0.75;

  if (requiredCoverage < minCoverage) {
    diagnostics.push({
      severity: "error",
      code: "HUMANOID_REQUIRED_COVERAGE_LOW",
      message: `Humanoid rig required-bone coverage is ${round(requiredCoverage)}; expected at least ${round(minCoverage)}.`,
      rigId: rig.id
    });
  }

  return {
    rigId: rig.id,
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    coverage,
    requiredCoverage,
    presentRequiredBones,
    requiredBones: requiredBones.length,
    diagnostics
  };
}

export function createHumanoidRetargetingMap(
  source: HumanoidRigDefinition,
  target: HumanoidRigDefinition,
  options: HumanoidRetargetingOptions = {}
): HumanoidRetargetingMap {
  const diagnostics: HumanoidRetargetingDiagnostic[] = [
    ...analyzeHumanoidRig(source, options).diagnostics,
    ...analyzeHumanoidRig(target, options).diagnostics
  ];
  const bindings: Partial<Record<HumanoidBoneName, HumanoidBoneRetargetBinding>> = {};
  const requiredBones = options.requireToes
    ? [...REQUIRED_HUMANOID_BONES, "leftToes", "rightToes"]
    : REQUIRED_HUMANOID_BONES;
  let mappedRequiredBones = 0;
  let mappedBones = 0;

  for (const bone of HUMANOID_BONES) {
    const sourceBinding = source.bones[bone];
    const targetBinding = target.bones[bone];

    if (!sourceBinding || !targetBinding) {
      if (requiredBones.includes(bone)) {
        diagnostics.push({
          severity: "error",
          code: "HUMANOID_RETARGET_REQUIRED_MAPPING_MISSING",
          message: `Required retarget mapping for "${bone}" is missing.`,
          rigId: target.id,
          bone,
          sourceBone: sourceBinding?.name,
          targetBone: targetBinding?.name
        });
      }
      continue;
    }

    mappedBones += 1;
    if (requiredBones.includes(bone)) {
      mappedRequiredBones += 1;
    }

    bindings[bone] = {
      bone,
      source: sourceBinding,
      target: targetBinding,
      scale: estimateBoneScale(sourceBinding, targetBinding, source.scale, target.scale)
    };
  }

  const coverage = mappedBones / HUMANOID_BONES.length;
  const requiredCoverage = requiredBones.length > 0 ? mappedRequiredBones / requiredBones.length : 1;
  const minCoverage = options.minRequiredCoverage ?? 0.75;

  if (requiredCoverage < minCoverage) {
    diagnostics.push({
      severity: "error",
      code: "HUMANOID_RETARGET_COVERAGE_LOW",
      message: `Humanoid retarget map required-bone coverage is ${round(requiredCoverage)}; expected at least ${round(minCoverage)}.`,
      rigId: target.id
    });
  }

  return {
    sourceRigId: source.id,
    targetRigId: target.id,
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    coverage,
    requiredCoverage,
    bindings,
    diagnostics
  };
}

export function retargetHumanoidPose(
  sourcePose: AnimationPose,
  map: HumanoidRetargetingMap,
  options: RetargetHumanoidPoseOptions = {}
): AnimationPose {
  const bones: Record<string, AnimationPoseTransform> = {};

  if (options.includeUnmappedSourceBones) {
    for (const [boneName, transform] of Object.entries(sourcePose.bones)) {
      bones[boneName] = cloneTransform(transform);
    }
  }

  for (const bone of HUMANOID_BONES) {
    const binding = map.bindings[bone];
    if (!binding) continue;

    const sourceTransform = sourcePose.bones[binding.source.name] ?? sourcePose.bones[bone];
    if (!sourceTransform) continue;

    const retargeted = scaleTransform(sourceTransform, binding.scale);
    bones[binding.target.name] = retargeted;

    if (options.includeSemanticBoneNames) {
      bones[bone] = retargeted;
    }
  }

  return {
    bones,
    morphTargets: sourcePose.morphTargets ? { ...sourcePose.morphTargets } : undefined,
    rootMotion: sourcePose.rootMotion && options.scaleRootMotion
      ? {
          translation: sourcePose.rootMotion.translation
            ? scaleVector(sourcePose.rootMotion.translation, averageBindingScale(map))
            : undefined,
          rotation: sourcePose.rootMotion.rotation
        }
      : sourcePose.rootMotion,
    metadata: {
      ...sourcePose.metadata,
      retargetedFrom: map.sourceRigId,
      retargetedTo: map.targetRigId,
      retargetingCoverage: map.requiredCoverage
    }
  };
}

export function humanoidRetargetingDiagnostics(
  source: HumanoidRigDefinition,
  target: HumanoidRigDefinition,
  options: HumanoidRetargetingOptions = {}
): readonly HumanoidRetargetingDiagnostic[] {
  return createHumanoidRetargetingMap(source, target, options).diagnostics;
}

export function analyzeCartoonHumanoidRetargeting(
  rig: HumanoidRigDefinition,
  options: CartoonHumanoidRetargetingOptions = {}
): CartoonHumanoidRetargetingDiagnostics {
  const base = analyzeHumanoidRig(rig, { minRequiredCoverage: 0.9, requireRestPose: true, ...options });
  const diagnostics: HumanoidRetargetingDiagnostic[] = [...base.diagnostics];
  const requiredClips = options.requiredClips ?? ["Idle", "Talk", "Gesture", "Walk"];
  const availableClips = new Set(options.availableClips ?? []);
  const missingClips = requiredClips.filter((clip) => !availableClips.has(clip));
  const mouthReady = (options.mouthBlendshapeNames?.length ?? 0) > 0
    || Array.isArray(rig.metadata?.mouthBlendshapeNames) && (rig.metadata.mouthBlendshapeNames as unknown[]).length > 0;
  const retargetMapProvided = options.retargetMapProvided ?? Boolean(rig.metadata?.retargetMapProvided);

  if (!mouthReady) {
    diagnostics.push({
      severity: "error",
      code: "CARTOON_MOUTH_METADATA_MISSING",
      message: "Cartoon retargeting requires mouth blendshape or mouth-card metadata.",
      rigId: rig.id
    });
  }
  for (const clip of missingClips) {
    diagnostics.push({
      severity: "error",
      code: "CARTOON_REQUIRED_CLIP_MISSING",
      message: `Cartoon retargeting requires clip "${clip}".`,
      rigId: rig.id
    });
  }
  if (!retargetMapProvided) {
    diagnostics.push({
      severity: "error",
      code: "CARTOON_RETARGET_MAP_MISSING",
      message: "Cartoon retargeting requires external bone-map/retarget metadata.",
      rigId: rig.id
    });
  }

  return {
    kind: "cartoon-humanoid-retargeting-diagnostics",
    ...base,
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    diagnostics,
    mouthReady,
    clipReady: missingClips.length === 0,
    retargetMapProvided
  };
}

const HUMANOID_SIDE_PAIRS: readonly { readonly left: HumanoidBoneName; readonly right: HumanoidBoneName }[] = [
  { left: "leftShoulder", right: "rightShoulder" },
  { left: "leftUpperArm", right: "rightUpperArm" },
  { left: "leftLowerArm", right: "rightLowerArm" },
  { left: "leftHand", right: "rightHand" },
  { left: "leftUpperLeg", right: "rightUpperLeg" },
  { left: "leftLowerLeg", right: "rightLowerLeg" },
  { left: "leftFoot", right: "rightFoot" },
  { left: "leftToes", right: "rightToes" }
];

function findDuplicateBoneNames(rig: HumanoidRigDefinition): readonly string[] {
  const counts = new Map<string, number>();

  for (const binding of Object.values(rig.bones)) {
    if (!binding?.name) continue;
    counts.set(binding.name, (counts.get(binding.name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
}

function estimateBoneScale(
  source: HumanoidBoneBinding,
  target: HumanoidBoneBinding,
  sourceRigScale = 1,
  targetRigScale = 1
): number {
  const sourceScale = Number.isFinite(sourceRigScale) && sourceRigScale > 0 ? sourceRigScale : 1;
  const targetScale = Number.isFinite(targetRigScale) && targetRigScale > 0 ? targetRigScale : 1;
  const rigScale = targetScale / sourceScale;

  if (source.length && target.length && source.length > 0 && target.length > 0) {
    return (target.length / source.length) * rigScale;
  }

  return rigScale;
}

function averageBindingScale(map: HumanoidRetargetingMap): number {
  const scales = Object.values(map.bindings)
    .map((binding) => binding?.scale)
    .filter((scale): scale is number => typeof scale === "number" && Number.isFinite(scale) && scale > 0);

  if (scales.length === 0) return 1;
  return scales.reduce((sum, scale) => sum + scale, 0) / scales.length;
}

function scaleTransform(transform: AnimationPoseTransform, scale: number): AnimationPoseTransform {
  return {
    position: transform.position ? scaleVector(transform.position, scale) : undefined,
    rotation: transform.rotation,
    scale: transform.scale
  };
}

function cloneTransform(transform: AnimationPoseTransform): AnimationPoseTransform {
  return {
    position: transform.position ? { ...transform.position } : undefined,
    rotation: transform.rotation ? { ...transform.rotation } : undefined,
    scale: transform.scale ? { ...transform.scale } : undefined
  };
}

function scaleVector(vector: AnimationVector3, scale: number): AnimationVector3 {
  return {
    x: vector.x * scale,
    y: vector.y * scale,
    z: vector.z * scale
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
