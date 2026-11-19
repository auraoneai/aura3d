/**
 * Humanoid motion import: HY-Motion (SMPL) and any sampled skeletal clip -> canonical humanoid frames -> glTF channels on
 * a rigged humanoid (auto role mapping, including Idol's unnamed `bone_N` rigs). Used by `aura3d animation import`.
 * The quaternion helpers stay module-internal; import ./humanoid.ts directly for the full driver toolkit.
 */
export {
  HUMANOID_ROLES,
  createHumanoidDriver,
  createHumanoidSource,
  encodeHumanoidClip,
  mapHumanoid,
  parseGlbJson,
  readIdolSkeleton,
  sampleHumanoidClip,
  type HumanoidClip,
  type HumanoidDriver,
  type HumanoidDriverOptions,
  type HumanoidMap,
  type HumanoidPoseInput,
  type HumanoidRole,
  type HumanoidSource,
  type IdolBone,
  type IdolSkeleton
} from "./humanoid";
export { SMPL_JOINTS, SMPL_PARENTS, isHyMotionDict, smplMotionToClip, smplMotionToFrames, type HyMotionDict, type SmplClipOptions, type SmplClipResult, type SmplFramesResult } from "./smplMotion";
export {
  boneSide,
  crossfadeLoop,
  detectHumanoidFacing,
  resampleCanonicalFrames,
  skeletalMotionToFrames,
  skeletonWorld,
  type CanonicalMotion,
  type CanonicalMotionOptions,
  type FacingDetection,
  type HumanoidFacing,
  type RootMotionMode,
  type SkeletalMotion,
  type SkeletalMotionFrame
} from "./skeletalMotion";
export { LIMB_SEGMENTS, angleDeg as limbAngleDeg, bakeHumanoidFramesToGltf, detectKeyFlips as detectHumanoidKeyFlips, canonicalLimbDirections, facingQuat as humanoidFacingQuat, type BakeHumanoidGltfOptions, type GltfChannelData, type HumanoidGltfBake } from "./bake";
