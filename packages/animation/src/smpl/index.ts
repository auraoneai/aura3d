/**
 * Humanoid motion: HY-Motion (SMPL) and any sampled skeletal clip -> canonical humanoid frames -> glTF channels on a
 * rigged humanoid (auto role mapping, including Idol's unnamed `bone_N` rigs), used by `aura3d animation import`; and,
 * since 5.7.0, the runtime side: the canonical clip player (`createHumanoidAnimator`), clip-timing helpers, pose
 * helpers (mirror, blend, layer) and the quaternion helpers they are built on.
 * `Quat` and `Vec3` are the same tuple types the package root already exports from Keyframe.
 */
export {
  ARM_ROLES,
  HUMANOID_ROLES,
  QUAT_IDENTITY,
  blendHumanoidPoses,
  createHumanoidDriver,
  createHumanoidSource,
  encodeHumanoidClip,
  eulerZYX,
  layerHumanoidPose,
  loadIdolHumanoid,
  mapHumanoid,
  mirrorHumanoidPose,
  parseGlbJson,
  quatAxisAngle,
  quatFromTo,
  quatInv,
  quatMul,
  quatNorm,
  quatPow,
  quatSlerp,
  readIdolSkeleton,
  rotateVec,
  sampleHumanoidClip,
  type GltfJsonLike,
  type HumanoidAnimationPose,
  type HumanoidBonePose,
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
export {
  createHumanoidAnimator,
  createMotionAnimator,
  humanoidAirTime,
  humanoidClipGroundSpeed,
  humanoidEventTime,
  humanoidLocomotionRate,
  humanoidLocomotionTime,
  type HumanoidAnimator,
  type HumanoidClipSet,
  type HumanoidMotionRequest
} from "./animator.js";
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
